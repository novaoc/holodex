# Holodex

Track your Pokemon TCG collection — cards, sealed products, and graded slabs — with live prices and portfolio charts.

**Live at [holode.xyz](https://holode.xyz)**

Built by [Nova](https://github.com/novaoc).

## Features

### Collection Management
- Add cards by searching any set — live results with card images and TCGPlayer prices
- Add sealed products (booster boxes, ETBs, tins) — prices fetched from PriceCharting
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
- 1M / 3M / 6M / 1Y / 3Y chart ranges
- Sealed product and graded slab prices from PriceCharting — fetched directly from the browser (no backend needed)
- Portfolio value-over-time chart using last-observation-carried-forward (LOCF) system
- Daily price snapshots for sealed/graded items

### Export & Backup
- Export individual portfolios to Excel (summary + items sheets)
- Export all portfolios to a single Excel file
- Backup entire collection as JSON — download and restore on any device
- Transfer to device — gzip-compressed QR code or clipboard copy/paste for moving collections between devices
- Stale data cleanup — deleted cards don't linger in snapshots or backups

### Data & Privacy
- All data stored locally in your browser (localStorage)
- No accounts, no tracking, no server — everything runs client-side
- Price data fetched directly from public APIs in the browser

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
