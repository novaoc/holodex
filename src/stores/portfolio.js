import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'rarebox_portfolios'
const SETTINGS_KEY = 'rarebox_settings'
const SNAPSHOTS_KEY = 'rarebox_snapshots'
const MAX_SNAPSHOTS = 1095 // 3 years of daily snapshots

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

function loadSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveSnapshots(data) {
  try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(data)) } catch {}
}

export const usePortfolioStore = defineStore('portfolio', () => {
  // State
  const portfolios = ref([])
  const activePortfolioId = ref(null)
  const settings = ref({ currency: 'USD', defaultPortfolioId: null })
  const snapshots = ref(loadSnapshots()) // { [portfolioId]: [{date, ts, values: {itemId: price}}] }

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
    cleanupSnapshots()
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
    cleanupSnapshots()
  }

  function setActivePortfolio(id) {
    activePortfolioId.value = id
    persist()
  }

  // Item CRUD
  function addItem(portfolioId, item) {
    const portfolio = portfolios.value.find(p => p.id === portfolioId)
    if (!portfolio) return null
    const newItem = { ...item, id: generateId(), addedAt: new Date().toISOString(), lastPriceUpdate: new Date().toISOString() }
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
    cleanupSnapshots()
  }

  // Update market prices for all card items (call on load / refresh)
  function updateCardPrice(portfolioId, itemId, price) {
    updateItem(portfolioId, itemId, { currentMarketPrice: price })
  }

  // Check if a card is Japanese (uses tcgdex API, no bulk endpoint)
  function isJPCard(item) {
    if (item.type !== 'card') return false
    const setName = item.cardData?.set?.name || ''
    return setName.startsWith('jp/') || item.cardId?.startsWith('jp/') || item.jp === true
  }

  // Check if a card's price is stale (older than 6 hours)
  function isPriceStale(item) {
    if (!item.lastPriceUpdate) return true
    const age = Date.now() - new Date(item.lastPriceUpdate).getTime()
    return age > 6 * 60 * 60 * 1000 // 6 hours
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

  // ── Snapshot system ──────────────────────────────────────────────────────
  // Records a daily price snapshot for all items in a portfolio.
  // Call this after refreshPrices() completes.
  function recordSnapshot(portfolioId) {
    const portfolio = portfolios.value.find(p => p.id === portfolioId)
    if (!portfolio) return

    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const ts = Date.now()

    const values = {}
    for (const item of portfolio.items) {
      const price = item.type === 'card'
        ? (item.currentMarketPrice || item.purchasePrice || 0)
        : (item.currentValue || item.purchasePrice || 0)
      if (price > 0) values[item.id] = price
    }

    if (Object.keys(values).length === 0) return

    const list = snapshots.value[portfolioId] || []
    // Replace today's snapshot if it exists, else append
    const todayIdx = list.findIndex(s => s.date === today)
    if (todayIdx >= 0) {
      list[todayIdx] = { date: today, ts, values }
    } else {
      list.push({ date: today, ts, values })
    }

    // Trim to max
    if (list.length > MAX_SNAPSHOTS) list.splice(0, list.length - MAX_SNAPSHOTS)
    snapshots.value[portfolioId] = list
    saveSnapshots(snapshots.value)
  }

  // Auto-record snapshot once per day for all portfolios (no API calls, uses cached prices)
  function autoSnapshot() {
    const today = new Date().toISOString().split('T')[0]
    for (const portfolio of portfolios.value) {
      if (portfolio.items.length === 0) continue
      const list = snapshots.value[portfolio.id] || []
      const lastSnap = list[list.length - 1]
      if (lastSnap?.date === today) continue // already recorded today
      recordSnapshot(portfolio.id)
    }
  }

  // Returns [{x: timestamp, y: price}] for a specific item across all snapshots.
  // Prepends the purchase-date point as the synthetic origin.
  function getItemHistory(portfolioId, itemId) {
    const portfolio = portfolios.value.find(p => p.id === portfolioId)
    const item = portfolio?.items.find(i => i.id === itemId)
    if (!item) return []

    const list = snapshots.value[portfolioId] || []
    const points = []

    // Synthetic origin: purchase date → purchase price
    if (item.purchaseDate && item.purchasePrice > 0) {
      const purchaseTs = new Date(item.purchaseDate).getTime()
      // Only add if before first snapshot
      const firstSnap = list[0]
      if (!firstSnap || purchaseTs < firstSnap.ts) {
        points.push({ x: purchaseTs, y: item.purchasePrice })
      }
    }

    // Snapshot points
    for (const snap of list) {
      if (snap.values[itemId] != null) {
        points.push({ x: snap.ts, y: snap.values[itemId] })
      }
    }

    return points
  }

  // Reset everything
  function resetAll() {
    portfolios.value = []
    activePortfolioId.value = null
    snapshots.value = {}
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(SETTINGS_KEY)
    localStorage.removeItem(SNAPSHOTS_KEY)
    const cacheKeys = Object.keys(localStorage).filter(k => k.startsWith('ph_cache_'))
    cacheKeys.forEach(k => localStorage.removeItem(k))
    init()
  }

  // Clean up stale snapshots — removes entries for items that no longer exist
  function cleanupSnapshots() {
    const validItemIds = new Set()
    for (const p of portfolios.value) {
      for (const item of p.items) {
        validItemIds.add(item.id)
      }
    }

    let changed = false
    for (const [portfolioId, list] of Object.entries(snapshots.value)) {
      for (const snap of list) {
        for (const itemId of Object.keys(snap.values)) {
          if (!validItemIds.has(itemId)) {
            delete snap.values[itemId]
            changed = true
          }
        }
      }
      // Remove snapshots with no values left
      const nonEmpty = list.filter(s => Object.keys(s.values).length > 0)
      if (nonEmpty.length !== list.length) {
        snapshots.value[portfolioId] = nonEmpty
        changed = true
      }
    }

    if (changed) saveSnapshots(snapshots.value)
  }

  return {
    portfolios,
    activePortfolioId,
    activePortfolio,
    settings,
    snapshots,
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
    recordSnapshot,
    getItemHistory,
    isJPCard,
    isPriceStale,
    resetAll,
    cleanupSnapshots,
    autoSnapshot,
  }
})
