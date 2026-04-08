<template>
  <div class="dashboard">
    <!-- Welcome / empty state -->
    <div v-if="store.portfolios.length === 0" class="empty-state" style="padding:80px 20px">
      <div class="icon">⬡</div>
      <h3>Welcome to Collectr</h3>
      <p>Track your Pokémon card collection across multiple portfolios with live pricing and charts.</p>
      <div class="flex gap-3 mt-4" style="flex-wrap:wrap;justify-content:center">
        <router-link to="/search" class="btn btn-primary btn-lg">Search Cards</router-link>
      </div>
    </div>

    <div v-else>
      <!-- Top stats -->
      <div class="stats-row mb-4">
        <div class="stat-tile">
          <div class="label">Total Portfolio Value</div>
          <div class="value text-accent">${{ store.totalPortfolioValue.toFixed(2) }}</div>
          <div class="sub">Across all portfolios</div>
        </div>
        <div class="stat-tile">
          <div class="label">Total Cost Basis</div>
          <div class="value">${{ store.totalCostBasis.toFixed(2) }}</div>
          <div class="sub">Amount invested</div>
        </div>
        <div class="stat-tile">
          <div class="label">Total Gain/Loss</div>
          <div class="value" :class="totalGain >= 0 ? 'text-success' : 'text-danger'">
            {{ totalGain >= 0 ? '+' : '' }}${{ Math.abs(totalGain).toFixed(2) }}
          </div>
          <div class="sub" :class="totalGainPct >= 0 ? 'text-success' : 'text-danger'">
            {{ totalGainPct >= 0 ? '+' : '' }}{{ totalGainPct.toFixed(1) }}%
          </div>
        </div>
        <div class="stat-tile">
          <div class="label">Total Items</div>
          <div class="value">{{ totalItems }}</div>
          <div class="sub">{{ store.portfolios.length }} portfolios</div>
        </div>
      </div>

      <!-- Combined portfolio chart -->
      <div class="card mb-4">
        <div class="section-header">
          <div>
            <div class="section-title">Combined Portfolio</div>
            <div class="section-subtitle">All portfolios combined</div>
          </div>
        </div>
        <PortfolioChart :portfolios="store.portfolios" :height="300" label="All Portfolios" />
      </div>

      <!-- Individual portfolio cards -->
      <div class="section-header">
        <div class="section-title">Portfolios</div>
        <button class="btn btn-secondary btn-sm" @click="$emit('create-portfolio')">+ New Portfolio</button>
      </div>

      <div class="portfolios-grid">
        <router-link
          v-for="portfolio in store.portfolios"
          :key="portfolio.id"
          :to="`/portfolio/${portfolio.id}`"
          class="portfolio-card"
          :style="{ '--p-color': portfolio.color }"
        >
          <div class="portfolio-card-accent"></div>
          <div class="portfolio-card-body">
            <div class="portfolio-card-header">
              <span class="portfolio-dot" :style="{ background: portfolio.color }"></span>
              <span class="portfolio-card-name">{{ portfolio.name }}</span>
            </div>

            <div class="portfolio-card-stats">
              <div class="p-stat">
                <span class="p-stat-label">Value</span>
                <span class="p-stat-val text-accent">${{ getPortfolioValue(portfolio).toFixed(2) }}</span>
              </div>
              <div class="p-stat">
                <span class="p-stat-label">Items</span>
                <span class="p-stat-val">{{ portfolio.items.length }}</span>
              </div>
              <div class="p-stat">
                <span class="p-stat-label">Gain</span>
                <span class="p-stat-val" :class="getPortfolioGain(portfolio) >= 0 ? 'text-success' : 'text-danger'">
                  {{ getPortfolioGain(portfolio) >= 0 ? '+' : '' }}{{ getPortfolioGainPct(portfolio).toFixed(1) }}%
                </span>
              </div>
            </div>

            <div class="portfolio-mini-items" v-if="portfolio.items.length > 0">
              <img
                v-for="item in portfolio.items.filter(i => i.cardData?.images?.small).slice(0, 4)"
                :key="item.id"
                :src="item.cardData.images.small"
                class="mini-card-img"
              />
              <span v-if="portfolio.items.length > 4" class="mini-more">+{{ portfolio.items.length - 4 }}</span>
            </div>
            <div v-else class="portfolio-empty-items text-muted">No items yet</div>
          </div>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { usePortfolioStore } from '../stores/portfolio'
import { getCard, getMarketPrice } from '../services/pokemonApi'
import PortfolioChart from '../components/PortfolioChart.vue'

const store = usePortfolioStore()

const totalGain = computed(() => store.totalPortfolioValue - store.totalCostBasis)
const totalGainPct = computed(() => store.totalCostBasis > 0 ? (totalGain.value / store.totalCostBasis) * 100 : 0)
const totalItems = computed(() => store.portfolios.reduce((s, p) => s + p.items.length, 0))

function getPortfolioValue(portfolio) {
  return portfolio.items.reduce((s, item) => {
    const qty = item.quantity || 1
    const val = item.type === 'card' ? (item.currentMarketPrice || item.purchasePrice || 0) : (item.currentValue || item.purchasePrice || 0)
    return s + val * qty
  }, 0)
}

function getPortfolioCost(portfolio) {
  return portfolio.items.reduce((s, item) => s + (item.purchasePrice || 0) * (item.quantity || 1), 0)
}

function getPortfolioGain(portfolio) {
  return getPortfolioValue(portfolio) - getPortfolioCost(portfolio)
}

function getPortfolioGainPct(portfolio) {
  const cost = getPortfolioCost(portfolio)
  if (cost === 0) return 0
  return (getPortfolioGain(portfolio) / cost) * 100
}

// Silently refresh prices for all card items on mount (background, no blocking)
onMounted(async () => {
  const allCardItems = store.portfolios.flatMap(p =>
    p.items.filter(i => i.type === 'card' && i.cardId).map(i => ({ ...i, portfolioId: p.id }))
  )
  // Stagger requests to avoid hammering the API
  for (const item of allCardItems) {
    try {
      const card = await getCard(item.cardId)
      const result = getMarketPrice(card, item.priceVariant)
      const price = result?.price || result
      if (price) store.updateItem(item.portfolioId, item.id, { currentMarketPrice: price })
    } catch {}
    await new Promise(r => setTimeout(r, 100)) // 100ms between requests
  }
})
</script>

<style scoped>
.dashboard { max-width: 1200px; margin: 0 auto; }
.stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }

.portfolios-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.portfolio-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all 0.2s;
  text-decoration: none;
  color: inherit;
  display: block;
  position: relative;
}
.portfolio-card:hover {
  border-color: var(--p-color, var(--accent));
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  text-decoration: none;
}
.portfolio-card-accent {
  height: 3px;
  background: var(--p-color, var(--accent));
}
.portfolio-card-body { padding: 16px; }

.portfolio-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.portfolio-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.portfolio-card-name { font-size: 15px; font-weight: 700; }

.portfolio-card-stats { display: flex; gap: 16px; margin-bottom: 14px; }
.p-stat { display: flex; flex-direction: column; gap: 2px; }
.p-stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); }
.p-stat-val { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }

.portfolio-mini-items {
  display: flex;
  align-items: center;
  gap: 4px;
}
.mini-card-img { width: 30px; height: 42px; object-fit: contain; border-radius: 2px; }
.mini-more { font-size: 11px; color: var(--text-muted); margin-left: 4px; }
.portfolio-empty-items { font-size: 12px; height: 42px; display: flex; align-items: center; }
</style>
