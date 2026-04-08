import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usePortfolioStore } from './portfolio'
import { getMarketPrice, getCard, searchCards } from '../services/pokemonApi'

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

  // Find the regular (cheapest) printing of a card in a set
  async function findRegularCard(name, setCode) {
    const result = await searchCards(`${name}`, 1, 50)
    if (!result?.data?.length) return null

    // Filter to cards in the right set
    const inSet = result.data.filter(c => c.set?.id === setCode)
    const candidates = inSet.length > 0 ? inSet : result.data

    // Sort: prefer lower card numbers (regular prints before alt arts)
    // and prefer commoner rarities
    const rarityOrder = {
      'Common': 0, 'Uncommon': 1, 'Rare': 2, 'Rare Holo': 3,
      'Double Rare': 4, 'Ultra Rare': 5, 'Illustration Rare': 6,
      'Special Illustration Rare': 7, 'Hyper Rare': 8, 'Secret Rare': 9,
    }

    candidates.sort((a, b) => {
      const numA = parseInt(a.number) || 999
      const numB = parseInt(b.number) || 999
      // If both numbers are low (< 200), sort by rarity
      if (numA < 200 && numB < 200) {
        return (rarityOrder[a.rarity] ?? 5) - (rarityOrder[b.rarity] ?? 5)
      }
      // Otherwise prefer lower number
      return numA - numB
    })

    return candidates[0]
  }

  async function importMetaDeck(metaDeck) {
    const deck = createDeck(metaDeck.name)
    const promises = metaDeck.cards.map(async (cardTemplate) => {
      let fullCard = null
      try {
        fullCard = await findRegularCard(cardTemplate.name, cardTemplate.setCode)
      } catch {}

      if (fullCard) {
        const result = getMarketPrice(fullCard)
        addCardRaw(deck.id, {
          cardId: fullCard.id,
          name: cardTemplate.name,
          setName: fullCard.set?.name || cardTemplate.setName || '',
          setCode: fullCard.set?.id || cardTemplate.setCode || '',
          number: fullCard.number || '',
          quantity: cardTemplate.quantity,
          price: result?.price || result || null,
          image: fullCard.images?.small || '',
        })
      } else {
        // Fallback: add without API data
        addCardRaw(deck.id, {
          cardId: `${cardTemplate.setCode}-${cardTemplate.name}`,
          name: cardTemplate.name,
          setName: cardTemplate.setName || '',
          setCode: cardTemplate.setCode || '',
          number: '',
          quantity: cardTemplate.quantity,
          price: null,
          image: '',
        })
      }
    })
    await Promise.allSettled(promises)
    return deck
  }

  async function refreshDeckPrices(deckId) {
    const deck = decks.value.find(d => d.id === deckId)
    if (!deck) return
    const promises = deck.cards.map(async (card) => {
      if (card.price) return // skip cards that already have prices
      try {
        const fullCard = await getCard(card.cardId)
        const result = getMarketPrice(fullCard)
        card.price = result?.price || result || null
      } catch {}
    })
    await Promise.allSettled(promises)
    persist()
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
    refreshDeckPrices,
    persist,
  }
})
