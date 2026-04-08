# Holodex

Track your Pokemon TCG collection — cards, sealed products, and graded slabs — with live prices and portfolio charts.

**Live at [holode.xyz](https://holode.xyz)**

Built by [Nova](https://github.com/novaoc).

## Features

### Collection Management
- Add cards by searching any set — live results with card images and TCGPlayer prices
- Add sealed products (booster boxes, ETBs, tins) — prices and images fetched from PriceCharting
- Add graded slabs (PSA / BGS / CGC / ACE) — grade-specific pricing from PriceCharting
- Bulk import — paste a PTCGL/PTCGO deck list and add all cards at once
- Multiple named portfolios, each with a color and their own value chart
- Combined dashboard showing total collection value, cost basis, and gain/loss

### Browse & Search
- Browse all TCG sets — logos, series, release dates, card counts
- Click into any set to see the full card list (paginated grid)
- Filter cards within sets by name
- Search cards by name across all sets with live results

### Pricing & Charts
- Card prices from pokemontcg.io (live market data)
- Price history charts going back to November 2022 (via tcgdex/price-history)
- 7D / 1M / 6M / 1Y / 3Y chart ranges (exact day counts, not fractional years)
- Sealed product and graded slab prices from PriceCharting — fetched directly from the browser (no backend needed)
- Portfolio value-over-time chart using last-observation-carried-forward (LOCF) system
- Daily price snapshots for sealed/graded items

### Export & Backup
- Export individual portfolios to Excel (summary + items sheets)
- Export all portfolios to a single Excel file
- Backup entire collection as JSON — download and restore on any device
- Transfer to device — gzip-compressed QR code or clipboard copy/paste for moving collections between devices
- Stale data cleanup — deleted cards don't linger in snapshots or backups

### Landing Page
- Shown to new users (no items saved) — existing users go straight to the dashboard
- Hero section with gradient title, feature badges, and CTA
- Feature sections: Collection Management, Browse & Pricing, Bulk Import, Backup & Transfer, Private by Design
- Bulk import demo with code snippet visualization
- Privacy checklist: local storage, direct API fetches, no login, open source
- Final CTA at the bottom
- Detection: `store.portfolios.every(p => p.items.length === 0)` — store auto-creates one empty portfolio on init, so new users have portfolios but zero items

### Mobile
- Touch-friendly card grids — overlay buttons (Add/Details) always visible on touch devices via `hover: none` media query
- Bottom sheet panels — card detail panels slide up from bottom on mobile (Search, Sets, Portfolio views) with drag handle and rounded corners
- Bottom sheet modals — AddItem and BulkImport modals are full-width bottom sheets on mobile
- Stacked portfolio header — title, stats, and action buttons reflow for small screens
- Responsive charts — controls scroll horizontally, price stats wrap to grid, tighter vertical spacing
- Column hiding — portfolio table hides Type and Actions columns on tablet, gain% on small phones
- Landing page responsive: feature grids go single-column, bulk demo stacks vertically, CTAs go full-width

### PWA — Add to Home Screen
- Installable as a standalone app on Android and iOS
- Android: native Chrome install prompt via `beforeinstallprompt` event
- iOS: step-by-step guide modal (Safari → Share → Add to Home Screen) — no programmatic API on iOS
- Auto-detects platform and shows relevant install option
- Hides automatically if already installed (`display-mode: standalone`)
- Remembers dismissal in localStorage

### SEO
- HTML5 history mode routing (clean URLs: `/search`, `/sets` instead of `/#/search`)
- Per-route page titles (e.g., "Search Cards — Holodex")
- Per-route meta descriptions updated on navigation
- Dynamic OG tags for social sharing per page
- `robots.txt` with sitemap reference
- `sitemap.xml` with all public routes

### Data & Privacy
- All data stored locally in your browser (localStorage)
- No accounts, no tracking, no server — everything runs client-side
- Price data fetched directly from public APIs in the browser
- Price alerts — set thresholds on cards, get browser notifications when prices cross them

## Stack

- Vue 3 + Vite
- Pinia (state management)
- ApexCharts (price/portfolio charts)
- Vue Router (navigation)
- XLSX (Excel export)
- pokemontcg.io API (card data + live prices)
- TCGDex price history (Nov 2022+)
- PriceCharting JSON API (sealed + graded prices)

## Getting Started

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Build

```bash
npm run build
```

## License

MIT
