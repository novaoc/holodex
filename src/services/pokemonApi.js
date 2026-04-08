const BASE_URL = 'https://api.pokemontcg.io/v2'

const cache = new Map()
const CACHE_TTL = 1000 * 60 * 60 // 1 hour in memory

async function fetchWithCache(url) {
  const cached = cache.get(url)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  cache.set(url, { data, timestamp: Date.now() })
  return data
}

export async function searchCards(query, page = 1, pageSize = 20) {
  // Quote multi-word queries so Lucene treats them as a single phrase
  const term = query.includes(' ') ? `"${query}"` : query
  const encoded = encodeURIComponent(term)
  const url = `${BASE_URL}/cards?q=name:${encoded}*&page=${page}&pageSize=${pageSize}&orderBy=-set.releaseDate`
  const data = await fetchWithCache(url)
  return data
}

export async function getCard(id) {
  const url = `${BASE_URL}/cards/${id}`
  const data = await fetchWithCache(url)
  return data.data
}

export async function getSets() {
  const url = `${BASE_URL}/sets?orderBy=-releaseDate`
  const data = await fetchWithCache(url)
  return data.data
}

export async function getCardsBySet(setId, page = 1, pageSize = 36) {
  const url = `${BASE_URL}/cards?q=set.id:${setId}&page=${page}&pageSize=${pageSize}&orderBy=number`
  const data = await fetchWithCache(url)
  return data
}

// Extract the best available market price from a card's TCGPlayer data
export function getMarketPrice(card, variantKey = null) {
  const prices = card?.tcgplayer?.prices
  if (!prices) return null

  if (variantKey && prices[variantKey]) {
    return prices[variantKey].market || prices[variantKey].mid || null
  }

  // Priority order
  const priority = ['holofoil', '1stEditionHolofoil', 'unlimitedHolofoil', 'reverseHolofoil', 'normal', '1stEditionNormal']
  for (const key of priority) {
    if (prices[key]?.market) return { price: prices[key].market, variant: key }
  }

  // fallback: first available
  for (const key of Object.keys(prices)) {
    if (prices[key]?.market) return { price: prices[key].market, variant: key }
  }
  return null
}

export function getAllVariants(card) {
  const prices = card?.tcgplayer?.prices
  if (!prices) return []
  return Object.entries(prices).map(([key, val]) => ({
    key,
    label: formatVariantLabel(key),
    market: val.market,
    mid: val.mid,
    low: val.low,
    high: val.high
  }))
}

export function formatVariantLabel(key) {
  const labels = {
    holofoil: 'Holofoil',
    reverseHolofoil: 'Reverse Holofoil',
    normal: 'Normal',
    '1stEditionHolofoil': '1st Edition Holofoil',
    '1stEditionNormal': '1st Edition Normal',
    unlimitedHolofoil: 'Unlimited Holofoil',
    unlimitedNormal: 'Unlimited Normal',
    shadowlessHolofoil: 'Shadowless Holofoil',
    shadowlessNormal: 'Shadowless Normal',
  }
  return labels[key] || key.replace(/([A-Z])/g, ' $1').trim()
}
