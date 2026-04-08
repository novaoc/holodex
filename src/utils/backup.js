const STORAGE_KEYS = {
  portfolios: 'holodex_portfolios',
  settings: 'holodex_settings',
  snapshots: 'holodex_snapshots',
}

export function exportBackup() {
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'holodex',
    data: {},
  }

  for (const [label, key] of Object.entries(STORAGE_KEYS)) {
    const raw = localStorage.getItem(key)
    if (raw) {
      try { backup.data[label] = JSON.parse(raw) }
      catch { backup.data[label] = raw }
    }
  }

  // Include price caches
  const cacheKeys = Object.keys(localStorage).filter(k => k.startsWith('ph_cache_'))
  if (cacheKeys.length > 0) {
    backup.data.priceCache = {}
    for (const k of cacheKeys) {
      const raw = localStorage.getItem(k)
      if (raw) {
        try { backup.data.priceCache[k] = JSON.parse(raw) }
        catch { backup.data.priceCache[k] = raw }
      }
    }
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date().toISOString().split('T')[0]
  a.href = url
  a.download = `holodex-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function validateBackup(data) {
  if (!data || typeof data !== 'object') return 'Invalid backup file'
  if (data.app !== 'holodex') return 'Not a Holodex backup file'
  if (!data.data || typeof data.data !== 'object') return 'Backup has no data'

  const hasPortfolios = data.data.portfolios
  if (!hasPortfolios) return 'Backup missing portfolio data'

  // Quick shape check
  if (hasPortfolios.portfolios && !Array.isArray(hasPortfolios.portfolios)) {
    return 'Portfolio data is corrupted'
  }

  return null // valid
}

export function importBackup(data) {
  const result = { portfolios: 0, snapshots: 0, caches: 0 }

  // Restore portfolios
  if (data.data.portfolios) {
    localStorage.setItem(STORAGE_KEYS.portfolios, JSON.stringify(data.data.portfolios))
    result.portfolios = data.data.portfolios.portfolios?.length || 0
  }

  // Restore settings
  if (data.data.settings) {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(data.data.settings))
  }

  // Restore snapshots
  if (data.data.snapshots) {
    localStorage.setItem(STORAGE_KEYS.snapshots, JSON.stringify(data.data.snapshots))
    const portfolioIds = Object.keys(data.data.snapshots)
    result.snapshots = portfolioIds.reduce((s, id) => s + (data.data.snapshots[id]?.length || 0), 0)
  }

  // Restore price caches
  if (data.data.priceCache) {
    for (const [key, val] of Object.entries(data.data.priceCache)) {
      localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val))
      result.caches++
    }
  }

  return result
}
