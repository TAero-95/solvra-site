#!/usr/bin/env node
/**
 * Solvra Prospect Scraper — Lead Generation Pipeline
 * ═══════════════════════════════════════════════════
 * 1. Apify Google Maps → finds businesses (no/bad website)
 * 2. LLM Step 1 → structured lead brief
 * 3. LLM Step 2 → personalized cold outreach email
 * 4. Outputs JSON ready for CRM Import Batch
 *
 * Usage:
 *   node prospect-scraper.mjs                        (runs all default industries)
 *   node prospect-scraper.mjs --industry "plumbing"   (single industry)
 *   node prospect-scraper.mjs --city "Spokane Valley"  (override city)
 *   node prospect-scraper.mjs --batch 10               (leads per batch, default 10)
 *
 * Requires:  APIFY_TOKEN  in .env or environment
 * LLM:       Ollama (free, local) by default — or set ANTHROPIC_API_KEY for Claude
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load .env ───────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(__dirname, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ─── Config ──────────────────────────────────────────────────
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

// Determine LLM provider: ollama (free) or claude (paid)
const USE_CLAUDE = ANTHROPIC_API_KEY && ANTHROPIC_API_KEY !== 'your_claude_api_key_here';
const LLM_LABEL = USE_CLAUDE ? `Claude API` : `Ollama (${OLLAMA_MODEL})`;

if (!APIFY_TOKEN || APIFY_TOKEN === 'your_apify_api_token_here') {
  console.error('\n  Missing APIFY_TOKEN. Add it to tools/.env\n  Get yours at: https://console.apify.com → Settings → Integrations\n');
  process.exit(1);
}

// ─── CLI Args ────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const TARGET_CITY = getArg('--city', 'Spokane');
const TARGET_INDUSTRY = getArg('--industry', null); // null = run all
const BATCH_SIZE = parseInt(getArg('--batch', '10'), 10);
const RADIUS_KM = parseInt(getArg('--radius', '25'), 10);

// Industries that are strong website-needed verticals for local businesses
const DEFAULT_INDUSTRIES = [
  'plumber', 'electrician', 'HVAC contractor', 'roofing contractor',
  'landscaping', 'house cleaning service', 'auto repair shop',
  'dentist', 'chiropractor', 'hair salon', 'barbershop',
  'restaurant', 'coffee shop', 'bakery', 'gym', 'yoga studio',
  'dog groomer', 'veterinarian', 'law firm', 'accounting firm',
  'real estate agent', 'insurance agent', 'photographer',
  'home remodeling contractor', 'painting contractor',
  'pest control', 'moving company', 'carpet cleaning',
  'towing service', 'tattoo shop'
];

const industries = TARGET_INDUSTRY
  ? [TARGET_INDUSTRY]
  : DEFAULT_INDUSTRIES;

// ─── Apify Helpers ───────────────────────────────────────────
const APIFY_BASE = 'https://api.apify.com/v2';

async function apifyRequest(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${APIFY_TOKEN}`
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${APIFY_BASE}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Run Google Maps scraper for a given search query
 * Actor: apify/google-maps-scraper
 */
async function scrapeGoogleMaps(query, maxResults = 20) {
  console.log(`    Scraping Google Maps: "${query}"...`);

  const input = {
    searchStringsArray: [query],
    locationQuery: `${TARGET_CITY}, WA`,
    maxCrawledPlacesPerSearch: maxResults,
    language: 'en',
    deeperCityScrape: false,
    skipClosedPlaces: true,
    scrapeContacts: true,
    scrapeReviewerName: false,
    scrapeReviewId: false,
    scrapeReviewUrl: false,
    scrapeReviewsPersonalData: false
  };

  // Start the actor run — compass/crawler-google-places is the main Google Maps scraper
  // Fallback: compass/google-maps-extractor (faster, less detail)
  let run;
  try {
    run = await apifyRequest(
      '/acts/compass~crawler-google-places/runs?waitForFinish=300',
      'POST',
      input
    );
  } catch {
    console.log('    Trying fallback actor...');
    run = await apifyRequest(
      '/acts/compass~google-maps-extractor/runs?waitForFinish=300',
      'POST',
      input
    );
  }

  if (!run?.data?.defaultDatasetId) throw new Error('Could not start Google Maps scraper — check your Apify token');

  return fetchDataset(run.data.defaultDatasetId);
}

async function fetchDataset(datasetId) {
  const data = await apifyRequest(`/datasets/${datasetId}/items?format=json`);
  return data;
}

// ─── Filter: businesses that NEED a website ──────────────────
function filterLeads(places) {
  return places.filter(p => {
    // Must have a business name
    if (!p.title && !p.name) return false;

    const website = p.website || p.url || '';
    const hasWebsite = website && !website.includes('facebook.com')
      && !website.includes('yelp.com')
      && !website.includes('yellowpages');

    // We want businesses with NO real website, or just a social page
    // Also accept places with very basic/old-looking sites (we'll verify in LLM step)
    const dominated = !hasWebsite;

    // Minimum credibility: has some reviews
    const reviews = p.reviewsCount || p.totalScore || 0;

    return dominated || reviews >= 3;
  }).map(p => ({
    bizName: p.title || p.name || 'Unknown',
    address: p.address || p.street || '',
    phone: p.phone || p.phoneUnformatted || '',
    website: p.website || p.url || '',
    rating: p.totalScore || p.rating || 0,
    reviewCount: p.reviewsCount || p.reviews || 0,
    category: p.categoryName || p.category || '',
    city: p.city || TARGET_CITY,
    placeUrl: p.placeUrl || p.googleUrl || '',
    latitude: p.location?.lat || p.lat || null,
    longitude: p.location?.lng || p.lng || null
  }));
}

// ─── LLM Step 1: Structured Lead Brief ──────────────────────
async function generateLeadBrief(lead) {
  const prompt = `You are a lead qualification analyst for a web design agency called Solvra Marketing based in Spokane, WA. We build websites for local businesses that don't have one or have a poor online presence.

Analyze this scraped business data and produce a structured lead brief.

BUSINESS DATA:
- Name: ${lead.bizName}
- Category: ${lead.category}
- City: ${lead.city}
- Address: ${lead.address}
- Phone: ${lead.phone}
- Current Website: ${lead.website || 'NONE'}
- Google Rating: ${lead.rating}/5
- Review Count: ${lead.reviewCount}
- Google Maps URL: ${lead.placeUrl}

Respond with ONLY a JSON object (no markdown, no code fences) with these exact fields:
{
  "industry": "specific industry category",
  "websiteStatus": "No website" | "Facebook only" | "Yelp only" | "Outdated site" | "Basic site",
  "yearsBiz": "estimated years in business based on review history, or 'Unknown'",
  "competitor": "who is the #1 competitor ranking online in their niche in ${TARGET_CITY}",
  "hooks": "2-3 personalization hooks for cold outreach — mention specific things like review count milestones, recent reviews, expansion signals, seasonal relevance, or competitive gaps",
  "brief": "1-2 sentence summary of why this is a good lead and what angle to use in outreach",
  "score": 1-10 rating of lead quality (10 = perfect fit, 1 = unlikely to convert)
}`;

  return callLLM(prompt, true);
}

// ─── LLM Step 2: Personalized Cold Email ────────────────────
async function generateEmail(lead, brief) {
  const prompt = `You are writing a cold outreach email for Talan Mason, owner of Solvra Marketing in Spokane, WA. Solvra builds modern, mobile-first websites for local businesses.

PRICING (do NOT put in the email, but know it for context):
- Launch Pad: $500 setup + $99/mo (1-page site, hosting, edits)
- Standard: $800 setup + $149/mo (multi-page, SEO, blog-ready)

LEAD INFO:
- Business: ${lead.bizName}
- Owner/Contact: ${lead.owner || 'Business Owner'}
- Industry: ${brief.industry || lead.category}
- City: ${lead.city}
- Phone: ${lead.phone}
- Current Website: ${brief.websiteStatus || 'None'}
- Google Rating: ${lead.rating}/5 (${lead.reviewCount} reviews)
- Competitor: ${brief.competitor || 'Unknown'}
- Personalization Hooks: ${brief.hooks || 'None'}
- Brief: ${brief.brief || 'Local business without web presence'}

RULES:
1. Subject line first, then blank line, then email body
2. Keep it under 120 words — short, punchy, conversational
3. Lead with a genuine compliment or observation about THEIR business (use the hooks)
4. Create urgency with competitor gap (someone else is getting their customers online)
5. Offer a free custom demo site — no commitment, just to show what's possible
6. Sign off as Talan, Solvra Marketing
7. NO price mentions, NO jargon, NO "I noticed you don't have a website" (too generic)
8. Sound like a real person, not a sales template
9. Include a soft CTA — reply or quick call

Write ONLY the email. No commentary.`;

  return callLLM(prompt, false);
}

// ─── LLM Router (Ollama or Claude) ──────────────────────────
async function callLLM(prompt, parseJson = false) {
  const text = USE_CLAUDE
    ? await callClaude(prompt)
    : await callOllama(prompt);

  if (!parseJson) return text;

  // Parse JSON from response
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Could not parse LLM JSON: ${text.slice(0, 200)}`);
  }
}

// ─── Ollama (free, local) ───────────────────────────────────
async function callOllama(prompt) {
  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.7, num_predict: 800 }
      })
    });
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error(`\n  Ollama is not running! Start it with: ollama serve`);
      console.error(`  Then pull a model: ollama pull ${OLLAMA_MODEL}\n`);
      process.exit(1);
    }
    throw err;
  }

  if (!res.ok) {
    const err = await res.text();
    if (err.includes('not found')) {
      console.error(`\n  Model "${OLLAMA_MODEL}" not found. Pull it first:`);
      console.error(`  ollama pull ${OLLAMA_MODEL}\n`);
      process.exit(1);
    }
    throw new Error(`Ollama ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.response || '';
}

// ─── Claude API (paid, higher quality) ──────────────────────
async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ─── Rate Limiter ────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main Pipeline ───────────────────────────────────────────
async function main() {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║   SOLVRA PROSPECT SCRAPER                ║
  ║   Target: ${TARGET_CITY.padEnd(30)} ║
  ║   Batch:  ${String(BATCH_SIZE).padEnd(30)} ║
  ║   LLM:    ${LLM_LABEL.padEnd(30)} ║
  ╚═══════════════════════════════════════════╝
  `);

  const allRawLeads = [];

  // Step 1: Scrape Google Maps for each industry
  console.log('  STEP 1: Scraping Google Maps...\n');

  for (const industry of industries) {
    const query = `${industry} in ${TARGET_CITY}, WA`;
    try {
      const places = await scrapeGoogleMaps(query, Math.ceil(BATCH_SIZE * 1.5));
      const filtered = filterLeads(places);
      console.log(`    ✓ ${industry}: ${places.length} found → ${filtered.length} without websites`);
      allRawLeads.push(...filtered.map(l => ({ ...l, industry })));

      // If we have enough leads, stop scraping more industries
      if (allRawLeads.length >= BATCH_SIZE * 2) {
        console.log(`\n    Got ${allRawLeads.length} raw leads, enough for batch of ${BATCH_SIZE}.\n`);
        break;
      }

      await sleep(2000); // Be nice to the API
    } catch (err) {
      console.log(`    ✗ ${industry}: ${err.message}`);
    }
  }

  if (allRawLeads.length === 0) {
    console.error('\n  No leads found. Try different industries or expand the radius.\n');
    process.exit(1);
  }

  // Deduplicate by business name
  const seen = new Set();
  const uniqueLeads = allRawLeads.filter(l => {
    const key = l.bizName.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Take top leads (prioritize no-website, high reviews)
  const sorted = uniqueLeads.sort((a, b) => {
    // Prefer no website
    const aNoSite = !a.website ? 1 : 0;
    const bNoSite = !b.website ? 1 : 0;
    if (aNoSite !== bNoSite) return bNoSite - aNoSite;
    // Then higher review count
    return (b.reviewCount || 0) - (a.reviewCount || 0);
  });

  const batch = sorted.slice(0, BATCH_SIZE);
  console.log(`\n  Selected top ${batch.length} leads for processing.\n`);

  // Step 2: LLM analysis + email generation
  console.log('  STEP 2: LLM Lead Brief (analysis)...\n');

  const finalProspects = [];

  for (let i = 0; i < batch.length; i++) {
    const lead = batch[i];
    console.log(`    [${i + 1}/${batch.length}] ${lead.bizName}...`);

    try {
      // Step 1 LLM: Brief
      const brief = await generateLeadBrief(lead);
      console.log(`      Brief: score ${brief.score}/10 — ${brief.websiteStatus}`);

      // Skip low-quality leads
      if (brief.score && brief.score < 4) {
        console.log(`      Skipped (low score)`);
        continue;
      }

      await sleep(1000);

      // Step 2 LLM: Email
      console.log(`      Generating email...`);
      const email = await generateEmail(lead, brief);
      console.log(`      ✓ Email ready (${email.split(' ').length} words)`);

      // Build CRM-ready prospect object
      finalProspects.push({
        bizName: lead.bizName,
        owner: '',  // Google Maps rarely has owner names
        phone: lead.phone,
        email: '',  // Will need manual lookup or enrichment
        industry: brief.industry || lead.category,
        city: lead.city || TARGET_CITY,
        rating: String(lead.rating),
        reviewCount: String(lead.reviewCount),
        websiteStatus: brief.websiteStatus || (lead.website ? 'Basic site' : 'No website'),
        yearsBiz: brief.yearsBiz || 'Unknown',
        competitor: brief.competitor || '',
        hooks: brief.hooks || '',
        brief: brief.brief || '',
        draftEmail: email
      });

      await sleep(1500); // Rate limit Claude API
    } catch (err) {
      console.log(`      ✗ Error: ${err.message}`);
    }
  }

  // Step 3: Output
  console.log(`\n  ═══════════════════════════════════════════`);
  console.log(`  DONE — ${finalProspects.length} prospects ready for CRM import`);
  console.log(`  ═══════════════════════════════════════════\n`);

  // Save to file
  const timestamp = new Date().toISOString().slice(0, 10);
  const outFile = resolve(__dirname, `batch-${TARGET_CITY.toLowerCase()}-${timestamp}.json`);
  writeFileSync(outFile, JSON.stringify(finalProspects, null, 2));
  console.log(`  Saved: ${outFile}`);

  // Also print the JSON for quick clipboard copy
  console.log(`\n  ── CRM IMPORT JSON (copy & paste into Import Batch) ──\n`);
  console.log(JSON.stringify(finalProspects, null, 2));
  console.log('');
}

main().catch(err => {
  console.error('\n  Fatal error:', err.message);
  process.exit(1);
});
