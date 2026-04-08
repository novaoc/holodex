/**
 * Price Alerts for Holodex
 *
 * Users can set alerts on cards: "notify me when price goes above/below $X".
 * Alerts are stored in localStorage. Checked on price refresh.
 * Uses browser Notification API for alerts.
 */

const STORAGE_KEY = 'holodex_alerts'

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] }
  catch { return [] }
}

function save(alerts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts))
}

export function getAlerts() {
  return load()
}

export function getAlertsForCard(cardId) {
  return load().filter(a => a.cardId === cardId)
}

export function getActiveAlerts() {
  return load().filter(a => !a.triggered)
}

export function getTriggeredAlerts() {
  return load().filter(a => a.triggered)
}

/**
 * Add a price alert.
 * @param {string} cardId - pokemontcg.io card ID
 * @param {string} cardName - display name
 * @param {string} condition - 'above' or 'below'
 * @param {number} threshold - price in USD
 * @param {number} currentPrice - current market price
 */
export function addAlert(cardId, cardName, condition, threshold, currentPrice) {
  const alerts = load()
  // Remove existing alert for same card + condition
  const filtered = alerts.filter(a => !(a.cardId === cardId && a.condition === condition))
  filtered.push({
    id: crypto.randomUUID(),
    cardId,
    cardName,
    condition,
    threshold,
    currentPrice: currentPrice || 0,
    triggered: false,
    triggeredAt: null,
    createdAt: new Date().toISOString(),
  })
  save(filtered)
}

export function removeAlert(id) {
  save(load().filter(a => a.id !== id))
}

export function clearTriggeredAlerts() {
  save(load().filter(a => !a.triggered))
}

export function clearAllAlerts() {
  save([])
}

/**
 * Request browser notification permission.
 * Returns true if granted.
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

/**
 * Check all active alerts against current prices.
 * @param {Map<string, number>} priceMap - { cardId: currentPrice }
 * @returns {Array} newly triggered alerts
 */
export function checkAlerts(priceMap) {
  const alerts = load()
  const newlyTriggered = []

  for (const alert of alerts) {
    if (alert.triggered) continue
    const currentPrice = priceMap.get(alert.cardId)
    if (currentPrice == null) continue

    let triggered = false
    if (alert.condition === 'above' && currentPrice >= alert.threshold) triggered = true
    if (alert.condition === 'below' && currentPrice <= alert.threshold) triggered = true

    if (triggered) {
      alert.triggered = true
      alert.triggeredAt = new Date().toISOString()
      alert.triggeredPrice = currentPrice
      newlyTriggered.push(alert)
    }
  }

  if (newlyTriggered.length > 0) save(alerts)
  return newlyTriggered
}

/**
 * Show browser notifications for triggered alerts.
 */
export function notifyTriggered(alerts) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  for (const alert of alerts) {
    const direction = alert.condition === 'above' ? 'above' : 'below'
    const price = alert.triggeredPrice?.toFixed(2) || '?'
    new Notification('Holodex Price Alert', {
      body: `${alert.cardName} is now $${price} (${direction} $${alert.threshold.toFixed(2)})`,
      icon: '/favicon.ico',
      tag: alert.id, // prevent duplicates
    })
  }
}

/**
 * Get alert count badge text for display.
 */
export function getAlertBadgeText() {
  const active = getActiveAlerts().length
  const triggered = getTriggeredAlerts().length
  if (triggered > 0) return `${triggered} triggered`
  if (active > 0) return `${active} active`
  return null
}
