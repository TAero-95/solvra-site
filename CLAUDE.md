# Solvra Marketing — Main Site & Tools

## Owner
Talan M. Mason — Solvra Marketing, Spokane WA
- Email: talan@solvramarketing.com
- Phone: (509) 824-5436
- EIN: 42-1783738
- GitHub: TAero-95

## What This Repo Contains
1. **Main marketing site** — solvramarketing.com (GitHub Pages)
2. **CRM Dashboard** (`crm.html`) — single-file local CRM with localStorage
3. **Demo Builder** (`demo-builder.html`) — configurator for quick static website demos
4. **Prospect Scraper** (`tools/prospect-scraper.mjs`) — Node.js lead generation pipeline

## CRM (`crm.html`)
Single HTML file, zero dependencies, all data in localStorage. Features:
- **Dashboard** — stat cards for Total Leads, Leads This Month, Active Clients, MRR, Win Rate, Outstanding Invoices, **Prospects** (purple accent), pipeline breakdown, recent activity, Google Review tracker
- **Prospecting** — separate tab for cold-outreach leads (keeps active pipeline clean). Stages: New → Contacted → Responded → Converted. Cards show rating/review/website-status badges. Each prospect has: lead brief, personalization hooks, draft email. Tools: Copy email / Open in Email App / Open in Gmail / Move to Pipeline / Import Batch (JSON paste)
- **Pipeline** — Kanban with drag-and-drop. Stages: Outreach → Meeting Set → Demo Shown → Proposal Sent → Follow-Up → Won / Lost
- **Lead Detail Modal** — contact info, comm log, "View Demo Site →" button, convert-to-client
- **Demo URL field** — paste a Vercel demo URL into a lead, it shows on the pipeline card and detail modal
- **Clients** — converted from Won leads, comm logs, hosting/review tracking
- **Invoices** — line items, Stripe Payment Link buttons, email compose (Gmail/mailto/clipboard), print, delete
- **Contracts** — auto-generated with business info
- **Settings** — pricing, Stripe links, EIN, business info

localStorage keys: `solvra_leads`, `solvra_prospects`, `solvra_clients`, `solvra_invoices`, `solvra_activity`, `solvra_settings`

### Stripe Payment Links (in CRM settings)
- LP Setup: `https://buy.stripe.com/8x29AM8HYdrR1aFdmAaAw01`
- LP Monthly: `https://buy.stripe.com/8x24gscYe2NddXr0zOaAw03`
- Std Setup: `https://buy.stripe.com/aFabIU1fwafF6uZ6YcaAw00`
- Std Monthly: `https://buy.stripe.com/aFa4gsgaqdrR9Hb6YcaAw04`

## Demo Builder (`demo-builder.html`)
Single HTML file configurator: 11 industry presets, 5 color themes, live preview, export as standalone HTML. Has Solvra branding bubble and "Built by Solvra" footer.

**Gotcha:** `<script>` tags inside template literals must be split as `<scr` + `ipt>` to avoid browser parsing issues.

## Prospect Scraper (`tools/prospect-scraper.mjs`)
Node.js 24+ single-file pipeline, zero npm deps (uses native fetch). Flow:
1. **Apify Google Maps** (actor: `compass~crawler-google-places`, fallback: `compass~google-maps-extractor`) scrapes local businesses
2. **Filter** keeps businesses with no/basic website AND ≥3 reviews; sorts by no-website-first + high-review-count; dedupes by name
3. **LLM Step 1** produces structured lead brief JSON (industry, websiteStatus, yearsBiz, competitor, hooks, brief, score 1-10). Skips prospects scoring below 4.
4. **LLM Step 2** generates 120-word personalized cold email (subject + body, signed as Talan, no pricing, competitor-gap angle, free-demo offer)
5. **Output** writes `tools/batch-{city}-{date}.json` AND prints JSON to console for clipboard copy → paste into CRM → Prospecting → Import Batch

**Config:** `tools/.env` (gitignored). Required: `APIFY_TOKEN`. LLM: defaults to Ollama (free, local) at `http://localhost:11434` with `llama3.1`; set `ANTHROPIC_API_KEY` to auto-switch to Claude.

**CLI flags:** `--city "Spokane"` `--industry "plumber"` `--batch 10` `--radius 25`

**30 default industries** preloaded (plumber, electrician, HVAC, roofing, landscaping, dentist, etc.) — runs sequentially until batch size hit.

## Related Repo
- **solvra-demos** (private) — Next.js 16 multi-demo site for high-quality prospect demos
  - Vercel project: `solvra-demos-v7` (under talan-4568s-projects)
  - Live: https://solvra-demos-v7.vercel.app
  - Bean Stalk Espresso: https://solvra-demos-v7.vercel.app/demo/bean-stalk-espresso
  - Massie Brothers Concrete: https://solvra-demos-v7.vercel.app/demo/massie-brothers-concrete
  - D Hudson Inc. (accounting/tax): https://solvra-demos-v7.vercel.app/demo/d-hudson-inc
  - Edison Accounting (bookkeeping): https://solvra-demos-v7.vercel.app/demo/edison-accounting
  - Dudley & Conner (family law): https://solvra-demos-v7.vercel.app/demo/dudley-conner-law
  - The Brewer Firm (family law): https://solvra-demos-v7.vercel.app/demo/brewer-firm
  - Local directory: `solvra-demos/` (next to solvra-site/ on Desktop)
  - Stack: Next.js 16 + TS + Tailwind v4 + shadcn/ui + framer-motion + lucide-react
  - Each demo has a custom scroll animation (vine, pour, shield, ledger, gavel, wreath)
  - Vercel free-tier corrupts after several deploys — increment project version (v6 → v7) when that happens

## Working Preferences
- Solo operator, no team — everything built for one person
- Prefers single-file HTML tools over full-stack apps
- No employee names in client-facing demos
- Demo links should stay unlisted (no custom domains)
- Ask clarifying questions before building new demos
- Keep everything in GitHub as single source of truth
