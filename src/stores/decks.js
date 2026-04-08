import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usePortfolioStore } from './portfolio'
import { getMarketPrice } from '../services/pokemonApi'

const STORAGE_KEY = 'holodex_decks'

function generateId() {
  return crypto.randomUUID()
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveToStorage(decks) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(decks)) } catch {}
}

export const useDeckStore = defineStore('decks', () => {
  const decks = ref(loadFromStorage())

  function persist() {
    saveToStorage(decks.value)
  }

  // ── CRUD ──────────────────────────────────────────────────────────────

  function createDeck(name) {
    const deck = {
      id: generateId(),
      name,
      cards: [], // [{ cardId, name, setName, setCode, number, quantity, price, image }]
      createdAt: new Date().toISOString(),
    }
    decks.value.push(deck)
    persist()
    return deck
  }

  function updateDeck(id, updates) {
    const idx = decks.value.findIndex(d => d.id === id)
    if (idx === -1) return
    decks.value[idx] = { ...decks.value[idx], ...updates }
    persist()
  }

  function deleteDeck(id) {
    decks.value = decks.value.filter(d => d.id !== id)
    persist()
  }

  // ── Card operations ───────────────────────────────────────────────────

  function addCardToDeck(deckId, card, quantity = 1) {
    const deck = decks.value.find(d => d.id === deckId)
    if (!deck) return

    const existing = deck.cards.find(c => c.cardId === card.id)
    if (existing) {
      existing.quantity += quantity
    } else {
      const result = getMarketPrice(card)
      deck.cards.push({
        cardId: card.id,
        name: card.name,
        setName: card.set?.name || '',
        setCode: card.set?.id || '',
        number: card.number || '',
        quantity,
        price: result?.price || null,
        image: card.images?.small || '',
      })
    }
    persist()
  }

  function addCardRaw(deckId, cardData) {
    const deck = decks.value.find(d => d.id === deckId)
    if (!deck) return

    const existing = deck.cards.find(c => c.cardId === cardData.cardId)
    if (existing) {
      existing.quantity += cardData.quantity || 1
    } else {
      deck.cards.push({
        cardId: cardData.cardId,
        name: cardData.name,
        setName: cardData.setName || '',
        setCode: cardData.setCode || '',
        number: cardData.number || '',
        quantity: cardData.quantity || 1,
        price: cardData.price || null,
        image: cardData.image || '',
      })
    }
    persist()
  }

  function updateCardQuantity(deckId, cardId, quantity) {
    const deck = decks.value.find(d => d.id === deckId)
    if (!deck) return
    if (quantity <= 0) {
      deck.cards = deck.cards.filter(c => c.cardId !== cardId)
    } else {
      const card = deck.cards.find(c => c.cardId === cardId)
      if (card) card.quantity = quantity
    }
    persist()
  }

  function removeCardFromDeck(deckId, cardId) {
    const deck = decks.value.find(d => d.id === deckId)
    if (!deck) return
    deck.cards = deck.cards.filter(c => c.cardId !== cardId)
    persist()
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  function getDeckStats(deckId) {
    const deck = decks.value.find(d => d.id === deckId)
    if (!deck) return null

    const portfolioStore = usePortfolioStore()
    // Build a map of cardId → total quantity owned across all portfolios
    const ownedMap = {}
    for (const p of portfolioStore.portfolios) {
      for (const item of p.items) {
        if (item.type === 'card' && item.cardId) {
          ownedMap[item.cardId] = (ownedMap[item.cardId] || 0) + (item.quantity || 1)
        }
      }
    }

    let totalCost = 0
    let totalCards = 0
    let ownedCards = 0
    let neededCards = 0

    for (const card of deck.cards) {
      const needed = card.quantity || 1
      const owned = Math.min(ownedMap[card.cardId] || 0, needed)
      const stillNeeded = needed - owned

      totalCards += needed
      ownedCards += owned
      neededCards += stillNeeded
      totalCost += (card.price || 0) * stillNeeded // only count cost of cards we don't own
    }

    return {
      totalCards,
      ownedCards,
      neededCards,
      totalCost,
      completionPct: totalCards > 0 ? Math.round((ownedCards / totalCards) * 100) : 0,
      isComplete: neededCards === 0 && totalCards > 0,
    }
  }

  // ── Import from meta deck data ────────────────────────────────────────

  function importMetaDeck(metaDeck) {
    const deck = createDeck(metaDeck.name)
    for (const card of metaDeck.cards) {
      addCardRaw(deck.id, card)
    }
    return deck
  }

  return {
    decks,
    createDeck,
    updateDeck,
    deleteDeck,
    addCardToDeck,
    addCardRaw,
    updateCardQuantity,
    removeCardFromDeck,
    getDeckStats,
    importMetaDeck,
    persist,
  }
})
