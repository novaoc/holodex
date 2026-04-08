<template>
  <div class="portfolio-chart-wrapper">
    <div v-if="loading" class="chart-loading flex-center" :style="{ height: height + 'px' }">
      <div class="spinner spinner-lg"></div>
    </div>
    <div v-else-if="noData" class="chart-nodata flex-center flex-col" :style="{ height: height + 'px' }">
      <span style="font-size:40px;opacity:0.2">📈</span>
      <span class="text-muted mt-2">Add items to see portfolio value</span>
    </div>
    <div v-else>
      <div class="chart-top">
        <div>
          <div class="portfolio-value">${{ currentValue.toFixed(2) }}</div>
          <div class="portfolio-change" :class="totalChange >= 0 ? 'text-success' : 'text-danger'">
            {{ totalChange >= 0 ? '▲' : '▼' }}
            ${{ Math.abs(totalChange).toFixed(2) }}
            ({{ Math.abs(totalChangePct).toFixed(1) }}%)
            <span class="text-muted">from cost basis</span>
          </div>
        </div>
        <div class="chart-controls">
          <button
            v-for="r in ranges"
            :key="r.value"
            class="range-btn"
            :class="{ active: activeRange === r.value }"
            @click="setRange(r.value)"
          >{{ r.label }}</button>
        </div>
      </div>

      <apexchart
        type="area"
        :height="height"
        :options="chartOptions"
        :series="chartSeries"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { fetchPriceHistory, buildChartSeries } from '../services/priceHistory'
import { usePortfolioStore } from '../stores/portfolio'

const store = usePortfolioStore()

const props = defineProps({
  portfolios: { type: Array, required: true },
  height: { type: Number, default: 300 },
  label: { type: String, default: 'Portfolio Value' }
})

const loading = ref(true)
const noData = ref(false)
const chartSeries = ref([])
const activeRange = ref('1y')

const ranges = [
  { label: '7D', value: '7d' },
  { label: '1M', value: '1m' },
  { label: '6M', value: '6m' },
  { label: '1Y', value: '1y' },
  { label: '3Y', value: '3y' },
]

const currentValue = computed(() => {
  return props.portfolios.flatMap(p => p.items).reduce((sum, item) => {
    const qty = item.quantity || 1
    const val = item.type === 'card'
      ? (item.currentMarketPrice || item.purchasePrice || 0)
      : (item.currentValue || item.purchasePrice || 0)
    return sum + val * qty
  }, 0)
})

const totalCost = computed(() => {
  return props.portfolios.flatMap(p => p.items).reduce((sum, item) => {
    return sum + (item.purchasePrice || 0) * (item.quantity || 1)
  }, 0)
})

const totalChange = computed(() => currentValue.value - totalCost.value)
const totalChangePct = computed(() => totalCost.value > 0 ? (totalChange.value / totalCost.value) * 100 : 0)

const chartOptions = ref({
  chart: {
    type: 'area',
    background: 'transparent',
    toolbar: { show: false },
    zoom: { enabled: false },
    animations: { enabled: true, speed: 600 }
  },
  theme: { mode: 'dark' },
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 2 },
  fill: {
    type: 'gradient',
    gradient: {
      shadeIntensity: 1,
      opacityFrom: 0.3,
      opacityTo: 0.02,
      stops: [0, 100]
    }
  },
  colors: ['#f5a623'],
  xaxis: {
    type: 'datetime',
    labels: { style: { colors: '#8b949e', fontSize: '11px' } },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: {
    labels: {
      style: { colors: '#8b949e', fontSize: '11px' },
      formatter: (v) => `$${v >= 1000 ? (v/1000).toFixed(1) + 'k' : v?.toFixed(0)}`
    }
  },
  tooltip: {
    theme: 'dark',
    x: { format: 'MMM dd, yyyy' },
    y: { formatter: (v) => `$${v?.toFixed(2)}` }
  },
  grid: {
    borderColor: '#30363d',
    strokeDashArray: 3,
    padding: { left: 4, right: 4 }
  },
  markers: { size: 0, hover: { size: 5 } }
})

// Find which portfolio an item belongs to
function portfolioForItem(itemId) {
  return props.portfolios.find(p => p.items.some(i => i.id === itemId))
}

async function buildPortfolioHistory() {
  loading.value = true
  noData.value = false

  const allItems = props.portfolios.flatMap(p => p.items)
  if (allItems.length === 0) {
    noData.value = true
    loading.value = false
    return
  }

  const cardItems = allItems.filter(i => i.type === 'card' && i.cardId)
  const historyMap = {}

  await Promise.allSettled(
    cardItems.map(async item => {
      try {
        const hist = await fetchPriceHistory(item.cardId)
        if (hist) historyMap[item.cardId] = hist
      } catch {}
    })
  )

  // Build per-item sorted series (keyed by item.id)
  const itemSeriesMap = {}

  for (const item of allItems) {
    const portfolio = portfolioForItem(item.id)
    const portfolioId = portfolio?.id

    if (item.type === 'card' && historyMap[item.cardId]) {
      // Use tcgdex historical data
      const result = buildChartSeries(historyMap[item.cardId], item.currentMarketPrice || item.purchasePrice)
      const series = Array.isArray(result) ? result : (result?.series || [])
      if (series.length > 0) {
        itemSeriesMap[item.id] = series.slice().sort((a, b) => a.x - b.x)
      }
    }

    // For cards with no tcgdex history AND for graded/sealed: use snapshot history
    if (!itemSeriesMap[item.id] && portfolioId) {
      const snaps = store.getItemHistory(portfolioId, item.id)
      if (snaps.length > 0) {
        itemSeriesMap[item.id] = snaps.slice().sort((a, b) => a.x - b.x)
      }
    }

    // Last resort: synthesize 2 points (purchase → today) so chart always draws a line
    if (!itemSeriesMap[item.id]) {
      const currentPrice = item.type === 'card'
        ? (item.currentMarketPrice || item.purchasePrice || 0)
        : (item.currentValue || item.purchasePrice || 0)
      const purchasePrice = item.purchasePrice || 0
      const purchaseTs = item.purchaseDate
        ? new Date(item.purchaseDate).getTime()
        : Date.now() - 1000 * 60 * 60 * 24 // yesterday if no date

      const pts = []
      if (purchasePrice > 0) pts.push({ x: purchaseTs, y: purchasePrice })
      if (currentPrice > 0 && currentPrice !== purchasePrice) pts.push({ x: Date.now(), y: currentPrice })
      else if (currentPrice > 0) pts.push({ x: Date.now(), y: currentPrice })
      if (pts.length > 0) itemSeriesMap[item.id] = pts
    }
  }

  // Collect all unique timestamps
  const allTimestamps = new Set()
  for (const series of Object.values(itemSeriesMap)) {
    for (const pt of series) allTimestamps.add(pt.x)
  }
  allTimestamps.add(Date.now())

  if (allTimestamps.size === 0) {
    noData.value = true
    loading.value = false
    return
  }

  const sortedTs = [...allTimestamps].sort((a, b) => a - b)

  // LOCF: for every timestamp, each item contributes its most recent known price
  const points = sortedTs.map(ts => {
    let total = 0
    for (const item of allItems) {
      const qty = item.quantity || 1
      const series = itemSeriesMap[item.id]
      if (series) {
        let price = item.purchasePrice || 0
        for (const pt of series) {
          if (pt.x <= ts) price = pt.y
          else break
        }
        total += price * qty
      }
    }
    return { x: ts, y: Math.round(total * 100) / 100 }
  })

  applyRange(points)
  loading.value = false
}

function setRange(range) {
  activeRange.value = range
  buildPortfolioHistory()
}

function applyRange(points) {
  const DAY = 24 * 60 * 60 * 1000
  const rangeMap = { '7d': 7 * DAY, '1m': 30 * DAY, '6m': 182 * DAY, '1y': 365 * DAY, '3y': 1095 * DAY }
  const ms = rangeMap[activeRange.value] || 365 * DAY
  const cutoff = Date.now() - ms

  let filtered = points.filter(p => p.x >= cutoff)

  // Anchor from last known point before cutoff so short ranges always draw a line
  if (filtered.length < 2) {
    const before = points.filter(p => p.x < cutoff)
    if (before.length > 0) {
      const anchor = before[before.length - 1]
      filtered = [{ x: cutoff, y: anchor.y }, ...filtered]
    }
  }

  const display = filtered.length >= 2 ? filtered : points

  const color = display.length >= 2
    ? (display[display.length - 1].y >= display[0].y ? '#3fb950' : '#f85149')
    : '#f5a623'
  chartOptions.value = { ...chartOptions.value, colors: [color] }
  chartSeries.value = [{ name: props.label, data: display }]
}

watch(() => props.portfolios, buildPortfolioHistory, { deep: true })
onMounted(buildPortfolioHistory)
</script>

<style scoped>
.chart-loading, .chart-nodata {
  flex-direction: column;
  gap: 8px;
}
.chart-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}
.portfolio-value { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
.portfolio-change { font-size: 13px; margin-top: 4px; }

.chart-controls { display: flex; gap: 4px; align-items: flex-start; }
.range-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.range-btn:hover { color: var(--text-primary); border-color: var(--text-secondary); }
.range-btn.active { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }
</style>
