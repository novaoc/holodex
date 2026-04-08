// Fetches live meta deck data from our serverless endpoint
// Server does all the scraping + card resolution
// Client just caches the result for 24h

const CACHE_KEY = 'holodex_meta_decks_cache'
const CACHE_TTL = 1000 * 60 * 60 * 24 // 24 hours

export async function fetchLiveMetaDecks() {
  // Check cache first
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY))
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.decks
    }
  } catch {}

  // Server returns fully resolved decks (cards already have IDs, prices, images)
  const res = await fetch('/api/meta-decks')
  if (!res.ok) throw new Error(`Meta decks API returned ${res.status}`)

  const data = await res.json()
  if (!data.decks?.length) throw new Error('No decks returned')

  // Cards are already resolved server-side — just cache and return
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    timestamp: Date.now(),
    decks: data.decks,
  }))

  return data.decks
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
