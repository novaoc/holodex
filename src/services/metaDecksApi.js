// Fetches live meta deck data from our own serverless endpoint (scrapes Limitless TCG)
// Caches in localStorage for 24 hours
// Falls back to hardcoded decks if fetch fails

import { getMarketPrice } from './pokemonApi'

const CACHE_KEY = 'holodex_meta_decks_cache'
const CACHE_TTL = 1000 * 60 * 60 * 24 // 24 hours
const BASE_URL = 'https://api.pokemontcg.io/v2'

// Map Limitless set codes (ptcgo codes) to pokemontcg.io set IDs
const SET_CODE_MAP = {
  SVI: 'sv1', PAL: 'sv2', OBF: 'sv3', PAF: 'sv4pt5', PAR: 'sv4',
  TEF: 'sv5', TWM: 'sv6', SFA: 'sv6pt5', SCR: 'sv7', SSP: 'sv8',
  PRE: 'sv8pt5', JTG: 'sv9', DRI: 'sv10',
  MEG: 'me1', ASC: 'me2pt5',
  // Older sets
  BRS: 'swsh9', FST: 'swsh8', EVS: 'swsh7', CRE: 'swsh6', BST: 'swsh5',
  DAA: 'swsh3', RCL: 'swsh2', SSH: 'swsh1', CEL: 'cel25', CRZ: 'swsh12pt5',
}

// Fetch a specific card by set code + number
async function fetchCardBySetNumber(limitlessCode, number) {
  const setCode = SET_CODE_MAP[limitlessCode] || limitlessCode.toLowerCase()
  const url = `${BASE_URL}/cards?q=set.id:${setCode}+number:${number}&pageSize=1`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  return data?.data?.[0] || null
}

// Resolve a card template (setCode + number) to a full card with price
async function resolveCard(cardTemplate) {
  try {
    const card = await fetchCardBySetNumber(cardTemplate.setCode, cardTemplate.number)
    if (!card) return null

    const priceResult = getMarketPrice(card)
    return {
      cardId: card.id,
      name: card.name,
      setName: card.set?.name || '',
      setCode: card.set?.id || cardTemplate.setCode,
      number: card.number || cardTemplate.number,
      quantity: cardTemplate.quantity,
      price: priceResult?.price || null,
      image: card.images?.small || '',
    }
  } catch {
    return null
  }
}

export async function fetchLiveMetaDecks() {
  // Check cache first
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY))
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.decks
    }
  } catch {}

  // Fetch from our serverless endpoint
  const res = await fetch('/api/meta-decks')
  if (!res.ok) throw new Error(`Meta decks API returned ${res.status}`)

  const data = await res.json()
  if (!data.decks?.length) throw new Error('No decks returned')

  // Resolve cards by set+number — much more accurate than name matching
  const resolvedDecks = []

  for (const deck of data.decks) {
    try {
      const resolved = await Promise.allSettled(
        deck.cards.map(c => resolveCard(c))
      )

      const cards = resolved
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value)

      if (cards.length > 0) {
        resolvedDecks.push({
          name: deck.name,
          archetype: deck.archetype || deck.name,
          description: deck.description || '',
          cards,
          meta: deck.meta,
        })
      }
    } catch {}
  }

  if (resolvedDecks.length > 0) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      decks: resolvedDecks,
    }))
    return resolvedDecks
  }

  throw new Error('No decks resolved')
}

// Fallback hardcoded decks — only used when live fetch completely fails
export const fallbackMetaDecks = [
  {
    name: 'Charizard ex',
    archetype: 'Charizard',
    description: 'The king of consistency. Rare Candy into Charizard ex for OHKOs.',
    cards: [
      { name: 'Charizard ex', setCode: 'sv3', number: '125', quantity: 3 },
      { name: 'Charmander', setCode: 'sv3', number: '26', quantity: 4 },
      { name: 'Charmeleon', setCode: 'sv3', number: '27', quantity: 1 },
      { name: 'Pidgey', setCode: 'sv3', number: '162', quantity: 4 },
      { name: 'Pidgeot ex', setCode: 'sv3', number: '164', quantity: 2 },
      { name: 'Rotom V', setCode: 'sv4', number: '50', quantity: 1 },
      { name: 'Lumineon V', setCode: 'sv3pt5', number: '40', quantity: 1 },
    ]
  },
  {
    name: 'Gardevoir ex',
    archetype: 'Gardevoir',
    description: 'Psychic acceleration with Kirlia draw engine.',
    cards: [
      { name: 'Gardevoir ex', setCode: 'sv1', number: '86', quantity: 3 },
      { name: 'Kirlia', setCode: 'sv1', number: '68', quantity: 4 },
      { name: 'Ralts', setCode: 'sv1', number: '67', quantity: 4 },
      { name: 'Mew ex', setCode: 'sv2', number: '86', quantity: 1 },
      { name: 'Iron Valiant ex', setCode: 'sv4', number: '86', quantity: 2 },
    ]
  },
  {
    name: 'Dragapult ex',
    archetype: 'Dragapult',
    description: 'Phantom Dive for spread damage. Fast and aggressive.',
    cards: [
      { name: 'Dragapult ex', setCode: 'sv6', number: '130', quantity: 3 },
      { name: 'Drakloak', setCode: 'sv6', number: '129', quantity: 3 },
      { name: 'Dreepy', setCode: 'sv6', number: '128', quantity: 4 },
      { name: 'Rotom V', setCode: 'sv4', number: '50', quantity: 1 },
      { name: 'Lumineon V', setCode: 'sv3pt5', number: '40', quantity: 1 },
    ]
  },
]
