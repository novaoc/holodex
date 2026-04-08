/**
 * Cloud Sync for Holodex
 *
 * Supports Google Drive (appDataFolder) and Dropbox.
 * Both use client-side OAuth2 — no backend needed.
 * Stores a single JSON backup file in the user's cloud storage.
 *
 * Data shape matches the backup format (see backup.js):
 *   { version, exportedAt, app: 'holodex', data: { portfolios, settings, snapshots, priceCache } }
 */

const SYNC_FILE_NAME = 'holodex-backup.json'
const LS_SYNC_STATE = 'holodex_sync_state' // { provider, lastSyncedAt, fileId, token, tokenExpiry }

// ─── Helpers ──────────────────────────────────────────────────────

function loadSyncState() {
  try { return JSON.parse(localStorage.getItem(LS_SYNC_STATE)) || {} }
  catch { return {} }
}

function saveSyncState(state) {
  localStorage.setItem(LS_SYNC_STATE, JSON.stringify(state))
}

function clearSyncState() {
  localStorage.removeItem(LS_SYNC_STATE)
}

function buildBackupPayload() {
  const payload = { version: 1, exportedAt: new Date().toISOString(), app: 'holodex', data: {} }
  const keys = { portfolios: 'holodex_portfolios', settings: 'holodex_settings', snapshots: 'holodex_snapshots' }
  for (const [label, key] of Object.entries(keys)) {
    const raw = localStorage.getItem(key)
    if (raw) {
      try { payload.data[label] = JSON.parse(raw) }
      catch { payload.data[label] = raw }
    }
  }
  // Price caches
  const cacheKeys = Object.keys(localStorage).filter(k => k.startsWith('ph_cache_'))
  if (cacheKeys.length > 0) {
    payload.data.priceCache = {}
    for (const k of cacheKeys) {
      const raw = localStorage.getItem(k)
      if (raw) try { payload.data.priceCache[k] = JSON.parse(raw) } catch { payload.data.priceCache[k] = raw }
    }
  }
  return payload
}

function restoreBackupPayload(payload) {
  if (!payload?.data) throw new Error('Invalid backup data')
  const d = payload.data
  if (d.portfolios) localStorage.setItem('holodex_portfolios', JSON.stringify(d.portfolios))
  if (d.settings) localStorage.setItem('holodex_settings', JSON.stringify(d.settings))
  if (d.snapshots) localStorage.setItem('holodex_snapshots', JSON.stringify(d.snapshots))
  if (d.priceCache) {
    for (const [k, v] of Object.entries(d.priceCache)) {
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
    }
  }
}

function openCenteredPopup(url, w = 500, h = 600) {
  const y = window.top.outerHeight / 2 + window.top.screenY - h / 2
  const x = window.top.outerWidth / 2 + window.top.screenX - w / 2
  return window.open(url, '_blank', `width=${w},height=${h},left=${x},top=${y}`)
}

// ─── Google Drive Adapter ─────────────────────────────────────────

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3'
const GOOGLE_DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export function createGoogleSync(clientId) {
  const scopes = 'https://www.googleapis.com/auth/drive.appdata'
  let token = null

  function isConnected() {
    const state = loadSyncState()
    return state.provider === 'google' && !!state.token && (!state.tokenExpiry || Date.now() < state.tokenExpiry)
  }

  function getToken() {
    const state = loadSyncState()
    return state.token || null
  }

  // Start OAuth2 popup flow
  async function connect() {
    const state = loadSyncState()
    const redirectUri = window.location.origin + '/auth-callback.html'

    // Generate and store state for CSRF protection
    const oauthState = Math.random().toString(36).substring(2)
    sessionStorage.setItem('holodex_oauth_state', oauthState)
    sessionStorage.setItem('holodex_oauth_provider', 'google')

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: scopes,
      state: oauthState,
      prompt: 'consent',
    })

    return new Promise((resolve, reject) => {
      const popup = openCenteredPopup(`${GOOGLE_AUTH_URL}?${params}`)
      if (!popup) return reject(new Error('Popup blocked — allow popups for this site'))

      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer)
          window.removeEventListener('message', handler)
          // Check if token was saved
          const newState = loadSyncState()
          if (newState.provider === 'google' && newState.token) {
            resolve()
          } else {
            reject(new Error('Authorization cancelled'))
          }
        }
      }, 500)

      function handler(event) {
        if (event.data?.type === 'holodex-auth' && event.data.provider === 'google') {
          clearInterval(timer)
          popup.close()
          window.removeEventListener('message', handler)

          if (event.data.error) {
            reject(new Error(event.data.error))
            return
          }

          token = event.data.accessToken
          saveSyncState({
            provider: 'google',
            token,
            tokenExpiry: Date.now() + (event.data.expiresIn ? event.data.expiresIn * 1000 : 3600 * 1000),
            lastSyncedAt: null,
            fileId: state.fileId || null,
          })
          resolve()
        }
      }

      window.addEventListener('message', handler)
    })
  }

  function disconnect() {
    const state = loadSyncState()
    if (state.token) {
      // Best-effort revoke
      fetch(`https://oauth2.googleapis.com/revoke?token=${state.token}`, { method: 'POST' }).catch(() => {})
    }
    clearSyncState()
  }

  // ── Drive API calls ──

  async function _api(path, opts = {}) {
    const t = getToken()
    if (!t) throw new Error('Not connected')
    const res = await fetch(`${GOOGLE_DRIVE_API}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${t}`, ...opts.headers },
    })
    if (!res.ok) {
      if (res.status === 401) { clearSyncState(); throw new Error('Session expired — reconnect to Google Drive') }
      throw new Error(`Drive API error: ${res.status}`)
    }
    return res
  }

  async function _findFile() {
    const state = loadSyncState()
    if (state.fileId) return state.fileId

    const res = await _api(`/files?spaces=appDataFolder&q=name='${SYNC_FILE_NAME}'&fields=files(id,name,modifiedTime)`)
    const { files } = await res.json()
    if (files?.length > 0) {
      saveSyncState({ ...state, fileId: files[0].id })
      return files[0].id
    }
    return null
  }

  async function pull() {
    const fileId = await _findFile()
    if (!fileId) return null

    const res = await _api(`/files/${fileId}?alt=media`)
    const data = await res.json()
    return data
  }

  async function push(payload) {
    const t = getToken()
    if (!t) throw new Error('Not connected')

    const state = loadSyncState()
    const fileId = state.fileId || await _findFile()
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })

    let url, method
    if (fileId) {
      url = `${GOOGLE_DRIVE_UPLOAD}/files/${fileId}?uploadType=media`
      method = 'PATCH'
    } else {
      url = `${GOOGLE_DRIVE_UPLOAD}/files?uploadType=multipart`
      method = 'POST'
    }

    if (fileId) {
      // Simple media upload for update
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`)
      return await res.json()
    } else {
      // Multipart upload for create
      const metadata = { name: SYNC_FILE_NAME, mimeType: 'application/json', parents: ['appDataFolder'] }
      const boundary = 'holodex_boundary'
      const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        'Content-Type: application/json',
        '',
        JSON.stringify(payload),
        `--${boundary}--`,
      ].join('\r\n')

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${t}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      })
      if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`)
      const file = await res.json()
      saveSyncState({ ...loadSyncState(), fileId: file.id })
      return file
    }
  }

  return { isConnected, connect, disconnect, pull, push, name: 'Google Drive' }
}

// ─── Dropbox Adapter ──────────────────────────────────────────────

const DROPBOX_AUTH_URL = 'https://www.dropbox.com/oauth2/authorize'
const DROPBOX_API = 'https://api.dropboxapi.com/2'
const DROPBOX_CONTENT = 'https://content.dropboxapi.com/2'

export function createDropboxSync(appKey) {
  const filePath = `/Apps/Holodex/${SYNC_FILE_NAME}`

  function isConnected() {
    const state = loadSyncState()
    return state.provider === 'dropbox' && !!state.token
  }

  function getToken() {
    const state = loadSyncState()
    return state.token || null
  }

  async function connect() {
    const state = loadSyncState()
    const redirectUri = window.location.origin + '/auth-callback.html'
    const oauthState = Math.random().toString(36).substring(2)
    sessionStorage.setItem('holodex_oauth_state', oauthState)
    sessionStorage.setItem('holodex_oauth_provider', 'dropbox')

    const params = new URLSearchParams({
      client_id: appKey,
      redirect_uri: redirectUri,
      response_type: 'token',
      state: oauthState,
    })

    return new Promise((resolve, reject) => {
      const popup = openCenteredPopup(`${DROPBOX_AUTH_URL}?${params}`)
      if (!popup) return reject(new Error('Popup blocked — allow popups for this site'))

      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer)
          window.removeEventListener('message', handler)
          const newState = loadSyncState()
          if (newState.provider === 'dropbox' && newState.token) {
            resolve()
          } else {
            reject(new Error('Authorization cancelled'))
          }
        }
      }, 500)

      function handler(event) {
        if (event.data?.type === 'holodex-auth' && event.data.provider === 'dropbox') {
          clearInterval(timer)
          popup.close()
          window.removeEventListener('message', handler)

          if (event.data.error) {
            reject(new Error(event.data.error))
            return
          }

          saveSyncState({
            provider: 'dropbox',
            token: event.data.accessToken,
            lastSyncedAt: state.lastSyncedAt || null,
          })
          resolve()
        }
      }

      window.addEventListener('message', handler)
    })
  }

  function disconnect() {
    clearSyncState()
  }

  async function pull() {
    const t = getToken()
    if (!t) throw new Error('Not connected')

    try {
      const res = await fetch(`${DROPBOX_CONTENT}/files/download`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${t}`,
          'Dropbox-API-Arg': JSON.stringify({ path: filePath }),
        },
      })
      if (res.status === 409) return null // file not found
      if (!res.ok) throw new Error(`Dropbox download failed: ${res.status}`)
      return await res.json()
    } catch (e) {
      if (e.message.includes('409')) return null
      throw e
    }
  }

  async function push(payload) {
    const t = getToken()
    if (!t) throw new Error('Not connected')

    const res = await fetch(`${DROPBOX_CONTENT}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: filePath,
          mode: 'overwrite',
          autorename: false,
          mute: true,
        }),
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Dropbox upload failed: ${res.status}`)
    return await res.json()
  }

  return { isConnected, connect, disconnect, pull, push, name: 'Dropbox' }
}

// ─── Sync Engine ──────────────────────────────────────────────────

export async function performSync(adapter) {
  if (!adapter.isConnected()) throw new Error('Not connected')

  const local = buildBackupPayload()
  const cloud = await adapter.pull()

  let direction
  if (!cloud) {
    // No cloud file — push local
    direction = 'push'
  } else {
    const localTime = new Date(local.exportedAt).getTime()
    const cloudTime = new Date(cloud.exportedAt).getTime()
    direction = cloudTime > localTime ? 'pull' : 'push'
  }

  if (direction === 'push') {
    await adapter.push(local)
    saveSyncState({ ...loadSyncState(), lastSyncedAt: local.exportedAt })
    return { direction: 'push', time: local.exportedAt }
  } else {
    restoreBackupPayload(cloud)
    saveSyncState({ ...loadSyncState(), lastSyncedAt: cloud.exportedAt })
    return { direction: 'pull', time: cloud.exportedAt }
  }
}

export function getSyncState() {
  return loadSyncState()
}

export function isAnyConnected() {
  const state = loadSyncState()
  return !!state.token && !!state.provider
}

// Export for use in components
export { SYNC_FILE_NAME }
