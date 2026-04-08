import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'collectr_portfolios'
const SETTINGS_KEY = 'collectr_settings'

function generateId() {
  return crypto.randomUUID()
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveToStorage(portfolios) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios))
  } catch (e) {
    console.error('Failed to save portfolios:', e)
  }
}

export const usePortfolioStore = defineStore('portfolio', () => {
  // State
  const portfolios = ref([])
  const activePortfolioId = ref(null)
  const settings = ref({ currency: 'USD', defaultPortfolioId: null })

  // Init — load from localStorage
  function init() {
    const saved = loadFromStorage()
    if (saved && saved.portfolios) {
      portfolios.value = saved.portfolios
      activePortfolioId.value = saved.activePortfolioId || (saved.portfolios[0]?.id ?? null)
    } else {
      // Create default portfolio
      const defaultPortfolio = {
        id: generateId(),
        name: 'My Collection',
        color: '#f5a623',
        createdAt: new Date().toISOString(),
        items: []
      }
      portfolios.value = [defaultPortfolio]
      activePortfolioId.value = defaultPortfolio.id
    }

    try {
      const savedSettings = localStorage.getItem(SETTINGS_KEY)
      if (savedSettings) settings.value = { ...settings.value, ...JSON.parse(savedSettings) }
    } catch {}

    persist()
  }

  function persist() {
    saveToStorage({ portfolios: portfolios.value, activePortfolioId: activePortfolioId.value })
  }

  // Getters
  const activePortfolio = computed(() =>
    portfolios.value.find(p => p.id === activePortfolioId.value) || portfolios.value[0]
  )

  const totalPortfolioValue = computed(() => {
    return portfolios.value.reduce((total, p) => {
      return total + p.items.reduce((sum, item) => {
        const qty = item.quantity || 1
        const value = item.type === 'card'
          ? (item.currentMarketPrice || item.purchasePrice || 0)
          : (item.currentValue || item.purchasePrice || 0)
        return sum + value * qty
      }, 0)
    }, 0)
  })

  const totalCostBasis = computed(() => {
    return portfolios.value.reduce((total, p) => {
      return total + p.items.reduce((sum, item) => {
        return sum + (item.purchasePrice || 0) * (item.quantity || 1)
      }, 0)
    }, 0)
  })

  // Portfolio CRUD
  function createPortfolio(name, color = '#58a6ff') {
    const portfolio = {
      id: generateId(),
      name,
      color,
      createdAt: new Date().toISOString(),
      items: []
    }
    portfolios.value.push(portfolio)
    persist()
    return portfolio
  }

  function updatePortfolio(id, updates) {
    const idx = portfolios.value.findIndex(p => p.id === id)
    if (idx === -1) return
    portfolios.value[idx] = { ...portfolios.value[idx], ...updates }
    persist()
  }

  function deletePortfolio(id) {
    portfolios.value = portfolios.value.filter(p => p.id !== id)
    if (activePortfolioId.value === id) {
      activePortfolioId.value = portfolios.value[0]?.id || null
    }
    persist()
  }

  function setActivePortfolio(id) {
    activePortfolioId.value = id
    persist()
  }

  // Item CRUD
  function addItem(portfolioId, item) {
    const portfolio = portfolios.value.find(p => p.id === portfolioId)
    if (!portfolio) return null
    const newItem = { ...item, id: generateId(), addedAt: new Date().toISOString() }
    portfolio.items.push(newItem)
    persist()
    return newItem
  }

  function updateItem(portfolioId, itemId, updates) {
    const portfolio = portfolios.value.find(p => p.id === portfolioId)
    if (!portfolio) return
    const idx = portfolio.items.findIndex(i => i.id === itemId)
    if (idx === -1) return
    portfolio.items[idx] = { ...portfolio.items[idx], ...updates }
    persist()
  }

  function removeItem(portfolioId, itemId) {
    const portfolio = portfolios.value.find(p => p.id === portfolioId)
    if (!portfolio) return
    portfolio.items = portfolio.items.filter(i => i.id !== itemId)
    persist()
  }

  // Update market prices for all card items (call on load / refresh)
  function updateCardPrice(portfolioId, itemId, price) {
    updateItem(portfolioId, itemId, { currentMarketPrice: price })
  }

  // Portfolio stats
  function getPortfolioStats(portfolioId) {
    const portfolio = portfolios.value.find(p => p.id === portfolioId)
    if (!portfolio) return null

    const items = portfolio.items
    const totalCost = items.reduce((s, i) => s + (i.purchasePrice || 0) * (i.quantity || 1), 0)
    const totalValue = items.reduce((s, i) => {
      const qty = i.quantity || 1
      const val = i.type === 'card'
        ? (i.currentMarketPrice || i.purchasePrice || 0)
        : (i.currentValue || i.purchasePrice || 0)
      return s + val * qty
    }, 0)
    const gain = totalValue - totalCost
    const gainPct = totalCost > 0 ? (gain / totalCost) * 100 : 0
    const topGainer = items.reduce((best, item) => {
      const cost = (item.purchasePrice || 0)
      const val = item.type === 'card' ? (item.currentMarketPrice || cost) : (item.currentValue || cost)
      const g = cost > 0 ? (val - cost) / cost * 100 : 0
      return g > (best?.gain || -Infinity) ? { item, gain: g } : best
    }, null)

    return { totalCost, totalValue, gain, gainPct, itemCount: items.length, topGainer }
  }

  // Reset everything
  function resetAll() {
    portfolios.value = []
    activePortfolioId.value = null
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(SETTINGS_KEY)
    // Clear price caches too
    const cacheKeys = Object.keys(localStorage).filter(k => k.startsWith('ph_cache_'))
    cacheKeys.forEach(k => localStorage.removeItem(k))
    init()
  }

  return {
    portfolios,
    activePortfolioId,
    activePortfolio,
    settings,
    totalPortfolioValue,
    totalCostBasis,
    init,
    persist,
    createPortfolio,
    updatePortfolio,
    deletePortfolio,
    setActivePortfolio,
    addItem,
    updateItem,
    removeItem,
    updateCardPrice,
    getPortfolioStats,
    resetAll
  }
})
