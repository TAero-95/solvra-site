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

## CRM (`crm.html`)
Single HTML file, zero dependencies, all data in localStorage. Features:
- **Pipeline** — Kanban with drag-and-drop. Stages: Outreach → Meeting Set → Demo Shown → Proposal Sent → Follow-Up → Won / Lost
- **Lead Detail Modal** — contact info, comm log, "View Demo Site →" button, convert-to-client
- **Demo URL field** — paste a Vercel demo URL into a lead, it shows on the pipeline card and detail modal
- **Clients** — converted from Won leads, comm logs, hosting/review tracking
- **Invoices** — line items, Stripe Payment Link buttons, email compose (Gmail/mailto/clipboard), print, delete
- **Contracts** — auto-generated with business info
- **Settings** — pricing, Stripe links, EIN, business info

### Stripe Payment Links (in CRM settings)
- LP Setup: `https://buy.stripe.com/8x29AM8HYdrR1aFdmAaAw01`
- LP Monthly: `https://buy.stripe.com/8x24gscYe2NddXr0zOaAw03`
- Std Setup: `https://buy.stripe.com/aFabIU1fwafF6uZ6YcaAw00`
- Std Monthly: `https://buy.stripe.com/aFa4gsgaqdrR9Hb6YcaAw04`

## Demo Builder (`demo-builder.html`)
Single HTML file configurator: 11 industry presets, 5 color themes, live preview, export as standalone HTML. Has Solvra branding bubble and "Built by Solvra" footer.

**Gotcha:** `<script>` tags inside template literals must be split as `<scr` + `ipt>` to avoid browser parsing issues.

## Related Repo
- **solvra-demos** (private) — Next.js multi-demo site for high-quality prospect demos
  - https://solvra-demos.vercel.app
  - Current demos: Bean Stalk Espresso, Massie Brothers Concrete

## Working Preferences
- Solo operator, no team — everything built for one person
- Prefers single-file HTML tools over full-stack apps
- No employee names in client-facing demos
- Demo links should stay unlisted (no custom domains)
- Ask clarifying questions before building new demos
- Keep everything in GitHub as single source of truth
