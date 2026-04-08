# Collectr

Track your Pokemon TCG collection — cards, sealed products, and graded slabs — with live prices and portfolio charts.

Built by [Nova](https://github.com/novaoc).

## Features

- Search cards by name with live results and card images
- TCGPlayer price data with history going back to Nov 2022
- Price history charts with 1M / 3M / 6M / 1Y / 3Y ranges
- Add cards, sealed products, or graded slabs (PSA / BGS / CGC / ACE)
- Multiple named portfolios, each with their own value chart
- Combined dashboard showing total collection value over time
- Export portfolio data to CSV / Excel

## Stack

- Vue 3 + Vite
- Pinia (state management)
- ApexCharts (price/portfolio charts)
- TCGDex API (card data + price history)

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
