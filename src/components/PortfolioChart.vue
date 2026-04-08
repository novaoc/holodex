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
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
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

async function buildPortfolioHistory() {
  loading.value = true
  noData.value = false

  const allItems = props.portfolios.flatMap(p => p.items)
  if (allItems.length === 0) {
    noData.value = true
    loading.value = false
    return
  }

  // Fetch price histories for all card items
  const cardItems = allItems.filter(i => i.type === 'card')
  const historyMap = {}

  await Promise.allSettled(
    cardItems.map(async item => {
      const hist = await fetchPriceHistory(item.cardId)
      if (hist) historyMap[item.cardId] = hist
    })
  )

  // Build date-keyed value map
  // Collect all dates from all histories
  const dateValueMap = new Map()

  for (const item of allItems) {
    const qty = item.quantity || 1

    if (item.type === 'card' && historyMap[item.cardId]) {
      const hist = historyMap[item.cardId]
      const result = buildChartSeries(hist, item.currentMarketPrice || item.purchasePrice)
      const series = Array.isArray(result) ? result : (result?.series || [])

      for (const point of series) {
        const existing = dateValueMap.get(point.x) || 0
        dateValueMap.set(point.x, existing + point.y * qty)
      }
    } else {
      // Sealed / graded — use current value as flat contribution (no history)
      // Add single point at today's date
      const val = item.type === 'card'
        ? (item.currentMarketPrice || item.purchasePrice || 0)
        : (item.currentValue || item.purchasePrice || 0)
      const now = Date.now()
      const existing = dateValueMap.get(now) || 0
      dateValueMap.set(now, existing + val * qty)
    }
  }

  if (dateValueMap.size === 0) {
    noData.value = true
    loading.value = false
    return
  }

  // Sort and filter by range
  let points = Array.from(dateValueMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([x, y]) => ({ x, y: Math.round(y * 100) / 100 }))

  applyRange(points)
  loading.value = false
}

function setRange(range) {
  activeRange.value = range
  buildPortfolioHistory()
}

function applyRange(points) {
  const rangeMap = { '1m': 1/12, '3m': 3/12, '6m': 0.5, '1y': 1, '3y': 3 }
  const years = rangeMap[activeRange.value] || 1
  const cutoff = Date.now() - years * 365 * 24 * 60 * 60 * 1000
  const filtered = points.filter(p => p.x >= cutoff)

  const display = filtered.length > 0 ? filtered : points.slice(-1)

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
