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
 * Fetch market price from eBay sold listings.
 * @param {string} query - Search query (e.g. "Charizard PSA 10 Base Set")
 * @param {number} limit - Number of recent sales to sample (3–30, default 12)
 * @returns {{ median, mean, min, max, count, prices, query, cached }} or throws
 */
export async function fetchEbayPrice(query, limit = 12) {
  const q = query.trim()
  if (!q) throw new Error('empty_query')

  let res
  try {
    res = await fetch(
      `${BASE_URL}/price?q=${encodeURIComponent(q)}&limit=${limit}`,
      { signal: AbortSignal.timeout(15000) }
    )
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error('timeout')
    throw new Error('server_down')
  }

  if (res.status === 404) throw new Error('no_results')
  if (!res.ok) throw new Error(`server_error_${res.status}`)

  return res.json()
}
