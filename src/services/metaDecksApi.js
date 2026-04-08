// Fetches live meta deck data from Limitless TCG
// Caches in localStorage for 24 hours
// Falls back to hardcoded decks if fetch fails

import { searchCards, getMarketPrice } from './pokemonApi'

const CACHE_KEY = 'holodex_meta_decks_cache'
const CACHE_TTL = 1000 * 60 * 60 * 24 // 24 hours
const CORS_PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
]

async function fetchWithCorsProxy(url) {
  for (const buildProxyUrl of CORS_PROXIES) {
    try {
      const res = await fetch(buildProxyUrl(url), { signal: AbortSignal.timeout(8000) })
      if (res.ok) return await res.text()
    } catch {}
  }
  throw new Error('All CORS proxies failed')
}

function parseDecksTable(html) {
  const decks = []
  // Match each table row with deck data: rank, name, points, share
  const rowRegex = /<tr>\s*<td>(\d+)<\/td>.*?<a href="\/decks\/(\d+)">(.*?)<\/a>.*?<td>([\d,]+)<\/td>\s*<td>([\d.]+%)<\/td>\s*<\/tr>/gs
  let match
  while ((match = rowRegex.exec(html)) !== null) {
    const [, rank, id, rawName, points, share] = match
    // Clean HTML from name (remove <span> tags)
    const name = rawName.replace(/<[^>]+>/g, '').trim()
    const annotation = rawName.match(/<span class="annotation">(.*?)<\/span>/)?.[1]?.trim() || ''
    decks.push({
      rank: parseInt(rank),
      limitlessId: id,
      name: annotation ? `${name} ${annotation}` : name,
      points: parseInt(points.replace(/,/g, '')),
      share,
    })
  }
  return decks
}

async function fetchDeckList(limitlessId) {
  const html = await fetchWithCorsProxy(`https://limitlesstcg.com/decks/${limitlessId}`)
  // Parse the deck list from the page
  // Look for the card list section — cards are in format: "4 Card Name SET"
  const cards = []

  // Try parsing from the decklist table/cards section
  // Format: number + name + set code in various HTML structures
  const cardRegex = /<span class="card-count">(\d+)<\/span>\s*<span class="card-name"[^>]*>(.*?)<\/span>\s*(?:<span class="card-set"[^>]*>(.*?)<\/span>)?/g
  let match
  while ((match = cardRegex.exec(html)) !== null) {
    const [, qty, name, setCode] = match
    cards.push({
      name: name.trim(),
      quantity: parseInt(qty),
      setCode: setCode?.trim() || '',
    })
  }

  // Alternate parsing: look for plain text deck list
  if (cards.length === 0) {
    const lineRegex = /(\d+)\s+([A-Z][a-z].*?)(?:\s+([A-Z]{2,4}\d*))?\s*(?:<|$)/g
    while ((match = lineRegex.exec(html)) !== null) {
      const [, qty, name, setCode] = match
      if (parseInt(qty) <= 60 && name.length < 80) {
        cards.push({
          name: name.trim(),
          quantity: parseInt(qty),
          setCode: setCode?.trim() || '',
        })
      }
    }
  }

  return cards
}

// Resolve a card template to a real card via the Pokemon TCG API
async function resolveCard(cardTemplate) {
  try {
    const result = await searchCards(cardTemplate.name, 1, 20)
    if (!result?.data?.length) return null

    const candidates = result.data

    // Prefer regular prints over alt arts
    const rarityOrder = {
      'Common': 0, 'Uncommon': 1, 'Rare': 2, 'Rare Holo': 3,
      'Double Rare': 4, 'Ultra Rare': 5, 'Illustration Rare': 6,
      'Special Illustration Rare': 7, 'Hyper Rare': 8, 'Secret Rare': 9,
    }

    candidates.sort((a, b) => {
      const numA = parseInt(a.number) || 999
      const numB = parseInt(b.number) || 999
      if (numA < 200 && numB < 200) {
        return (rarityOrder[a.rarity] ?? 5) - (rarityOrder[b.rarity] ?? 5)
      }
      return numA - numB
    })

    const card = candidates[0]
    const priceResult = getMarketPrice(card)
    return {
      cardId: card.id,
      name: card.name,
      setName: card.set?.name || '',
      setCode: card.set?.id || '',
      number: card.number || '',
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

  // Fetch the meta decks page from Limitless
  const html = await fetchWithCorsProxy('https://limitlesstcg.com/decks?format=standard')
  const deckList = parseDecksTable(html)

  if (deckList.length === 0) throw new Error('No decks parsed')

  // Take top 8 decks and resolve their cards
  const topDecks = deckList.slice(0, 8)
  const resolvedDecks = []

  for (const deckMeta of topDecks) {
    try {
      const rawCards = await fetchDeckList(deckMeta.limitlessId)

      if (rawCards.length > 0) {
        // Resolve each card to get IDs and prices
        const resolved = await Promise.allSettled(
          rawCards.slice(0, 20).map(c => resolveCard(c)) // cap at 20 cards per deck for performance
        )

        const cards = resolved
          .filter(r => r.status === 'fulfilled' && r.value)
          .map(r => r.value)

        if (cards.length > 0) {
          resolvedDecks.push({
            name: deckMeta.name,
            archetype: deckMeta.name.replace(/\s+(ex|VSTAR|VMAX|GX).*$/i, '').trim(),
            description: `${deckMeta.share} meta share · ${deckMeta.points.toLocaleString()} CP · ${deckMeta.rank}${deckMeta.rank === 1 ? 'st' : deckMeta.rank === 2 ? 'nd' : deckMeta.rank === 3 ? 'rd' : 'th'} most played`,
            cards,
            meta: {
              rank: deckMeta.rank,
              share: deckMeta.share,
              points: deckMeta.points,
              limitlessId: deckMeta.limitlessId,
            },
          })
        }
      }
    } catch {
      // Skip decks that fail to parse
    }
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
      { name: 'Charizard ex', setCode: 'sv3', setName: 'Obsidian Flames', quantity: 3 },
      { name: 'Charmander', setCode: 'sv3', setName: 'Obsidian Flames', quantity: 4 },
      { name: 'Charmeleon', setCode: 'sv3', setName: 'Obsidian Flames', quantity: 1 },
      { name: 'Pidgey', setCode: 'sv3', setName: 'Obsidian Flames', quantity: 4 },
      { name: 'Pidgeot ex', setCode: 'sv3', setName: 'Obsidian Flames', quantity: 2 },
      { name: 'Rotom V', setCode: 'sv4', setName: 'Paradox Rift', quantity: 1 },
      { name: 'Lumineon V', setCode: 'sv3pt5', setName: '151', quantity: 1 },
    ]
  },
  {
    name: 'Gardevoir ex',
    archetype: 'Gardevoir',
    description: 'Psychic acceleration with Kirlia draw engine.',
    cards: [
      { name: 'Gardevoir ex', setCode: 'sv1', setName: 'Scarlet & Violet', quantity: 3 },
      { name: 'Kirlia', setCode: 'sv1', setName: 'Scarlet & Violet', quantity: 4 },
      { name: 'Ralts', setCode: 'sv1', setName: 'Scarlet & Violet', quantity: 4 },
      { name: 'Mew ex', setCode: 'sv2', setName: 'Paldea Evolved', quantity: 1 },
      { name: 'Iron Valiant ex', setCode: 'sv4', setName: 'Paradox Rift', quantity: 2 },
    ]
  },
  {
    name: 'Dragapult ex',
    archetype: 'Dragapult',
    description: 'Phantom Dive for spread damage. Fast and aggressive.',
    cards: [
      { name: 'Dragapult ex', setCode: 'sv6', setName: 'Twilight Masquerade', quantity: 3 },
      { name: 'Drakloak', setCode: 'sv6', setName: 'Twilight Masquerade', quantity: 3 },
      { name: 'Dreepy', setCode: 'sv6', setName: 'Twilight Masquerade', quantity: 4 },
      { name: 'Rotom V', setCode: 'sv4', setName: 'Paradox Rift', quantity: 1 },
      { name: 'Lumineon V', setCode: 'sv3pt5', setName: '151', quantity: 1 },
    ]
  },
]
