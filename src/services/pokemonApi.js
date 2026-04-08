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
  // Replace spaces with * wildcards so "mega charizard" → "mega*charizard"
  const term = query.replace(/\s+/g, '*')
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

// Japanese sets via tcgdex
export async function getJapaneseSets() {
  const url = 'https://api.tcgdex.net/v2/ja/sets'
  const data = await fetchWithCache(url)
  // tcgdex returns array directly, normalize to match pokemontcg.io shape
  return data.map(s => ({
    id: s.id,
    name: s.name,
    series: '', // tcgdex doesn't group by series for JP
    total: s.cardCount?.total || 0,
    printedTotal: s.cardCount?.official || 0,
    releaseDate: null,
    images: { logo: null, symbol: null },
    _lang: 'ja',
    _cardCount: s.cardCount
  }))
}

export async function getJapaneseCardsBySet(setId, page = 1, pageSize = 36) {
  // tcgdex returns all cards in set at once, paginate client-side
  const url = `https://api.tcgdex.net/v2/ja/sets/${setId}`
  const data = await fetchWithCache(url)
  const allCards = (data.cards || []).map(c => ({
    id: c.id,
    name: c.name,
    number: c.localId,
    set: { id: setId, name: data.name },
    images: c.image ? { small: c.image + '/low.webp', large: c.image + '/high.webp' } : { small: null, large: null },
    supertype: 'Pokémon',
    _lang: 'ja',
    _hasImage: !!c.image
  }))
  const start = (page - 1) * pageSize
  const paged = allCards.slice(start, start + pageSize)
  return { data: paged, totalCount: allCards.length }
}

export async function getJapaneseCardDetail(cardId) {
  const url = `https://api.tcgdex.net/v2/ja/cards/${cardId}`
  const data = await fetchWithCache(url)
  
  // Build prices from cardmarket (EUR) and convert to USD
  const EUR_TO_USD = 1.08
  let tcgPrices = null
  const cm = data.pricing?.cardmarket
  if (cm && (cm.avg || cm.trend)) {
    tcgPrices = {
      normal: {
        market: cm.trend ? +(cm.trend * EUR_TO_USD).toFixed(2) : null,
        low: cm.low ? +(cm.low * EUR_TO_USD).toFixed(2) : null,
        mid: cm.avg ? +(cm.avg * EUR_TO_USD).toFixed(2) : null
      }
    }
  }
  
  return {
    id: data.id,
    name: data.name,
    number: data.localId,
    set: { id: data.set?.id, name: data.set?.name },
    images: data.image ? { small: data.image + '/low.webp', large: data.image + '/high.webp' } : { small: null, large: null },
    supertype: data.category || 'Pokémon',
    subtypes: data.stage ? [data.stage] : [],
    types: data.types || [],
    hp: data.hp ? String(data.hp) : null,
    rarity: data.rarity || null,
    attacks: (data.attacks || []).map(a => ({
      name: a.name,
      cost: a.cost || [],
      damage: a.damage ? String(a.damage) : '',
      text: a.effect || ''
    })),
    weaknesses: data.weaknesses || [],
    retreatCost: data.retreat != null ? Array(data.retreat).fill(undefined).map((_, i) => i) : [],
    tcgplayer: { prices: tcgPrices },
    _lang: 'ja'
  }
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
