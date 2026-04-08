// Holodex Price Server — local FastAPI service at localhost:7890
// Scrapes eBay sold listings for sealed products and graded slabs.
// No API keys required. Run price-server/main.py to start.

const BASE_URL = 'http://localhost:7890'

/**
 * Check if the price server is running.
 * Returns true/false.
 */
export async function checkServerHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Fetch market price from PriceCharting (scraped, no key needed).
 * @param {string} query  - Search query (e.g. "Gengar VMAX Fusion Strike")
 * @param {string} grade  - Grade key: "ungraded", "9", "9.5", "10", "psa10", etc.
 * @returns {{ price, grade, product_name, product_set, all_grades, cached }} or throws
 */
export async function fetchPrice(query, grade = 'ungraded') {
  const q = query.trim()
  if (!q) throw new Error('empty_query')

  let res
  try {
    res = await fetch(
      `${BASE_URL}/price?q=${encodeURIComponent(q)}&grade=${encodeURIComponent(grade)}`,
      { signal: AbortSignal.timeout(30000) }
    )
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error('timeout')
    throw new Error('server_down')
  }

  if (res.status === 404) throw new Error('no_results')
  if (!res.ok) throw new Error(`server_error_${res.status}`)

  return res.json()
}

// Backwards-compat alias
export const fetchEbayPrice = fetchPrice
