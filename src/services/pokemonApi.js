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
// Japanese set ID → English name mapping (subset of most popular)
const JP_EN_NAMES = {
  PMCG1: 'Base Set', PMCG2: 'Jungle', PMCG3: 'Fossil',
  neo1: 'Neo Genesis', neo2: 'Neo Discovery', neo3: 'Neo Revelation', neo4: 'Neo Destiny',
  S1: 'Sword & Shield', S2: 'Rebel Clash', S3: 'Darkness Ablaze',
  S4: 'Vivid Voltage', S4a: 'Shiny Star V', S5a: 'Battle Region',
  S5I: 'Evolving Skies (JP)', S5R: 'Fusion Arts',
  S6: 'Silver Tempest (JP)', S6a: 'Eevee Heroes', S6H: 'Lost Origin (JP)',
  S7: 'Brilliant Stars (JP)', S7R: 'Dark Phantasma', S7D: 'Paradigm Trigger (JP)',
  S8: 'Fusion Arts', S8a: '25th Anniversary', S8b: 'VMAX Climax',
  S9: 'Star Birth', S9a: 'Battle Region',
  S10: 'Space Juggler', S10a: 'Dark Fantasma', S10b: 'Pokémon GO',
  S10D: 'Time Gazer', S10P: 'Space Juggler',
  S11: 'Triplet Beat', S11a: 'Heat Red Arcana', S12: 'Paradigm Trigger',
  S12a: 'VSTAR Universe',
  SV1: 'Scarlet & Violet', SV1a: 'Triplet Beat', SV1S: 'Scarlet ex',
  SV1V: 'Violet ex', SV2: 'Snow Hazard', SV2a: 'Clay Burst',
  SV2D: 'Snow Hazard', SV2P: 'Clay Burst',
  SV3: 'Ruler of the Black Flame', SV3a: 'Raging Surf',
  SV4: 'Ancient Roar', SV4a: 'Raging Surf',
  SV4K: 'Ancient Roar', SV4M: 'Future Flash',
  SV5: 'Cyber Judge', SV5a: 'Wild Force',
  SV5K: 'Wild Force', SV6: 'Stellar Miracle',
  SV7: 'Super Electric Breaker', SV7a: 'Paradise Dragona',
  SV8: 'Terastal Festival', SV8a: 'Terastal Festival ex',
  SV9: 'Battle Partners', SV9a: 'Glory of Team Rocket',
  SV10: 'Heat Wave Arena', SV10a: 'Glory of Team Rocket',
  SVK: 'Shiny Treasure', SVLN: 'Legendary Heartbeat',
  SVLS: 'Stellar Type Starter Set', SV11: 'Destined Rivals',
  SV11B: 'Destined Rivals (Leaf)', SV11W: 'Destined Rivals (Wind)',
  M1S: 'Mega Symphonia', M3: 'Munice Zero'
}

// Determine tcgdex CDN series prefix from set ID
function jpSetToSeries(setId) {
  const id = setId.toUpperCase()
  if (id.startsWith('SV')) return 'SV'
  if (id.startsWith('S') && !id.startsWith('SV') && !id.startsWith('ST')) return 'S'
  if (id.startsWith('M')) return 'M'
  return null // no images for older sets
}

// Sort Japanese sets by era (newest first) using ID patterns
function sortJapaneseSets(sets) {
  const eraOrder = { SV: 0, S: 1, M: 2, PCG: 3, PMCG: 4, neo: 5, E: 6 }
  function getSortKey(id) {
    const upper = id.toUpperCase()
    // SV series: SV9 > SV8 > SV4a > SV1a
    if (upper.startsWith('SV')) {
      const rest = upper.slice(2)
      const num = parseInt(rest) || 0
      const suffix = rest.replace(String(num), '')
      return [0, -num, suffix] // newer SV numbers first
    }
    // S series: S12 > S9 > S4a
    if (upper.startsWith('S') && !upper.startsWith('SV') && !upper.startsWith('ST')) {
      const rest = upper.slice(1)
      const num = parseInt(rest) || 0
      const suffix = rest.replace(String(num), '')
      return [1, -num, suffix]
    }
    // M series
    if (upper.startsWith('M')) {
      const num = parseInt(upper.slice(1)) || 0
      return [2, -num, '']
    }
    // Older series: push to end
    const era = eraOrder[upper.replace(/\d.*$/, '').replace(/[a-z].*$/, '')] || 9
    return [era, 0, '']
  }
  sets.sort((a, b) => {
    const ka = getSortKey(a.id)
    const kb = getSortKey(b.id)
    for (let i = 0; i < 3; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i]
    }
    return 0
  })
  return sets
}

export async function getJapaneseSets() {
  const url = 'https://api.tcgdex.net/v2/ja/sets'
  const data = await fetchWithCache(url)
  sortJapaneseSets(data)
  return data.map(s => ({
    id: s.id,
    name: JP_EN_NAMES[s.id] || s.name,
    nameJp: s.name,
    series: '',
    total: s.cardCount?.total || 0,
    printedTotal: s.cardCount?.official || 0,
    releaseDate: s.releaseDate || null,
    images: { logo: null, symbol: null },
    _lang: 'ja',
    _series: jpSetToSeries(s.id),
    _hasImages: !!jpSetToSeries(s.id)
  }))
}

export async function getJapaneseCardsBySet(setId, page = 1, pageSize = 36) {
  // Fetch the set to get card list (names, numbers)
  const url = `https://api.tcgdex.net/v2/ja/sets/${setId}`
  const setData = await fetchWithCache(url)
  const series = jpSetToSeries(setId)
  const enName = JP_EN_NAMES[setId] || setData.name
  
  let rawCards = setData.cards || []
  
  // Some sets (e.g. SV1a) return empty cards array in set listing
  // Fall back to global card list filtered by set ID prefix
  if (rawCards.length === 0 && setData.cardCount?.total > 0) {
    const allUrl = 'https://api.tcgdex.net/v2/ja/cards'
    const allCards = await fetchWithCache(allUrl)
    rawCards = allCards.filter(c => c.id.startsWith(setId + '-'))
  }
  
  const allCards = rawCards.map(c => {
    const localId = c.localId || c.id?.split('-').pop() || ''
    const imageBase = series ? `https://assets.tcgdex.net/ja/${series}/${setId}/${localId}` : null
    return {
      id: c.id,
      name: c.name,
      number: localId,
      set: { id: setId, name: enName },
      images: imageBase ? { small: imageBase + '/low.webp', large: imageBase + '/high.webp' } : { small: null, large: null },
      supertype: 'Pokémon',
      _lang: 'ja',
      _hasImage: !!imageBase
    }
  })
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
    images: (() => {
      const imgBase = data.image || (() => {
        const setId = data.set?.id
        const localId = data.localId
        const series = setId ? jpSetToSeries(setId) : null
        return series ? `https://assets.tcgdex.net/ja/${series}/${setId}/${localId}` : null
      })()
      return imgBase ? { small: imgBase + '/low.webp', large: imgBase + '/high.webp' } : { small: null, large: null }
    })(),
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
