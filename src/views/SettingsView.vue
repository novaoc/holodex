<template>
  <div class="settings-view">
    <h2 class="settings-title">Settings</h2>

    <!-- Data & Privacy -->
    <div class="settings-section card mb-4">
      <h3 class="settings-section-title">Data & Privacy</h3>
      <p class="settings-desc">All data is stored locally in your browser. Nothing is sent to any server.</p>

      <div class="settings-item">
        <div>
          <div class="settings-item-label">Storage Used</div>
          <div class="settings-item-sub">Portfolios, items, and price cache</div>
        </div>
        <div class="settings-item-value">{{ storageUsed }}</div>
      </div>

      <div class="settings-item">
        <div>
          <div class="settings-item-label">Price History Cache</div>
          <div class="settings-item-sub">{{ cacheCount }} cached price histories</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="clearPriceCache">Clear Cache</button>
      </div>

      <hr class="divider" />

      <div class="settings-item danger-zone">
        <div>
          <div class="settings-item-label" style="color:var(--danger)">Reset All Data</div>
          <div class="settings-item-sub">Delete all portfolios, items, and cached data. This cannot be undone.</div>
        </div>
        <button class="btn btn-danger btn-sm" @click="confirmReset = true">Reset Everything</button>
      </div>
    </div>

    <!-- Price Data Sources -->
    <div class="settings-section card mb-4">
      <h3 class="settings-section-title">Price Data Sources</h3>
      <p class="settings-desc">All price data is fetched directly in your browser. No API keys or accounts required.</p>

      <div class="settings-item">
        <div>
          <div class="settings-item-label">Card Prices</div>
          <div class="settings-item-sub">Live market prices from pokemontcg.io</div>
        </div>
        <span class="badge badge-success">Active</span>
      </div>
      <div class="settings-item">
        <div>
          <div class="settings-item-label">Price History</div>
          <div class="settings-item-sub">TCGPlayer historical data via tcgdex (Nov 2022+)</div>
        </div>
        <span class="badge badge-success">Active</span>
      </div>
      <div class="settings-item">
        <div>
          <div class="settings-item-label">Sealed & Graded Prices</div>
          <div class="settings-item-sub">PriceCharting — fetched directly from your browser</div>
        </div>
        <span class="badge badge-success">Active</span>
      </div>
    </div>

    <!-- Export -->
    <div class="settings-section card mb-4">
      <h3 class="settings-section-title">Export</h3>
      <p class="settings-desc">Export your portfolio data to Excel for further analysis.</p>

      <div v-for="portfolio in store.portfolios" :key="portfolio.id" class="settings-item">
        <div class="flex items-center gap-2">
          <span class="portfolio-dot" :style="{ background: portfolio.color }"></span>
          <div>
            <div class="settings-item-label">{{ portfolio.name }}</div>
            <div class="settings-item-sub">{{ portfolio.items.length }} items</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="exportOne(portfolio)">↓ Export</button>
      </div>

      <hr class="divider" v-if="store.portfolios.length > 1" />

      <div v-if="store.portfolios.length > 1" class="settings-item">
        <div>
          <div class="settings-item-label">All Portfolios</div>
          <div class="settings-item-sub">Export all portfolios to a single Excel file</div>
        </div>
        <button class="btn btn-primary btn-sm" @click="exportAll">↓ Export All</button>
      </div>
    </div>

    <!-- Backup & Restore -->
    <div class="settings-section card mb-4">
      <h3 class="settings-section-title">Backup & Restore</h3>
      <p class="settings-desc">Download your entire collection as a JSON file. Restore it anytime on any device.</p>

      <div class="settings-item">
        <div>
          <div class="settings-item-label">Export Backup</div>
          <div class="settings-item-sub">Download all portfolios, settings, and price snapshots</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="doExportBackup">↓ Download</button>
      </div>

      <div class="settings-item">
        <div>
          <div class="settings-item-label">Import Backup</div>
          <div class="settings-item-sub">Restore from a previously exported backup file</div>
        </div>
        <label class="btn btn-secondary btn-sm backup-import-btn">
          ↑ Import
          <input type="file" accept=".json" @change="handleImport" hidden />
        </label>
      </div>

      <div v-if="importResult" class="settings-item" style="border-bottom:none">
        <div class="import-result" :class="importResult.error ? 'error' : 'success'">
          {{ importResult.error || `Restored ${importResult.portfolios} portfolio(s), ${importResult.snapshots} snapshot(s)` }}
          <span v-if="!importResult.error" class="import-reload" @click="location.reload()">Reload to apply</span>
        </div>
      </div>
    </div>

    <!-- Cloud Sync -->
    <div class="settings-section card mb-4">
      <h3 class="settings-section-title">Cloud Sync</h3>
      <p class="settings-desc">Connect a cloud account to sync your collection across devices. No database needed — your data lives in your cloud storage.</p>

      <!-- Not connected -->
      <template v-if="!syncConnected">
        <div class="settings-item">
          <div>
            <div class="settings-item-label">Google Drive</div>
            <div class="settings-item-sub">Stores a backup file in your Google Drive app folder</div>
          </div>
          <button class="btn btn-secondary btn-sm" :disabled="syncLoading" @click="connectGoogle">Connect</button>
        </div>
        <div class="settings-item">
          <div>
            <div class="settings-item-label">Dropbox</div>
            <div class="settings-item-sub">Stores a backup file in your Dropbox Apps folder</div>
          </div>
          <button class="btn btn-secondary btn-sm" :disabled="syncLoading" @click="connectDropbox">Connect</button>
        </div>
      </template>

      <!-- Connected -->
      <template v-else>
        <div class="settings-item">
          <div>
            <div class="settings-item-label">{{ syncProviderName }}</div>
            <div class="settings-item-sub">
              <span v-if="syncState.lastSyncedAt">Last synced: {{ formatSyncTime(syncState.lastSyncedAt) }}</span>
              <span v-else>Connected — not yet synced</span>
            </div>
          </div>
          <span class="badge badge-success">Connected</span>
        </div>

        <div class="settings-item">
          <div class="sync-actions">
            <button class="btn btn-primary btn-sm" :disabled="syncLoading" @click="doSync">
              {{ syncLoading ? 'Syncing...' : '↑↓ Sync Now' }}
            </button>
            <button class="btn btn-ghost btn-sm text-danger" @click="doDisconnect">Disconnect</button>
          </div>
        </div>

        <div v-if="syncResult" class="settings-item" style="border-bottom:none">
          <div class="import-result" :class="syncResult.error ? 'error' : 'success'">
            {{ syncResult.error || (syncResult.direction === 'push' ? 'Pushed local data to cloud' : 'Pulled cloud data to local') }}
            <span v-if="syncResult.direction === 'pull'" class="import-reload" @click="location.reload()">Reload to apply</span>
          </div>
        </div>
      </template>
    </div>

    <!-- About -->
    <div class="settings-section card">
      <h3 class="settings-section-title">About</h3>
      <div class="about-grid">
        <div class="about-item">
          <div class="about-label">Version</div>
          <div class="about-val">1.1.0</div>
        </div>
        <div class="about-item">
          <div class="about-label">Card Prices</div>
          <div class="about-val">pokemontcg.io</div>
        </div>
        <div class="about-item">
          <div class="about-label">Price History</div>
          <div class="about-val">tcgdex (Nov 2022+)</div>
        </div>
        <div class="about-item">
          <div class="about-label">Sealed / Graded</div>
          <div class="about-val">PriceCharting</div>
        </div>
      </div>

      <div class="settings-notes mt-3">
        <div class="note">
          <span>📊</span>
          <p>Card price history comes from the <strong>tcgdex/price-history</strong> GitHub repository (TCGPlayer data). History goes back to November 2022. Current prices are fetched live from <strong>pokemontcg.io</strong>.</p>
        </div>
        <div class="note">
          <span>📦</span>
          <p>Sealed product and graded slab prices are fetched directly from <strong>PriceCharting</strong> — no backend, no API key needed.</p>
        </div>
      </div>
    </div>

    <!-- Reset Confirm Modal -->
    <transition name="fade">
      <div v-if="confirmReset" class="modal-overlay" @click.self="confirmReset = false">
        <div class="modal" style="max-width:420px">
          <div class="modal-header">
            <h3>⚠️ Reset All Data</h3>
            <button class="btn btn-ghost btn-icon" @click="confirmReset = false">✕</button>
          </div>
          <div class="modal-body">
            <p class="text-secondary mb-3">This will permanently delete:</p>
            <ul class="reset-list">
              <li>All {{ store.portfolios.length }} portfolio{{ store.portfolios.length !== 1 ? 's' : '' }}</li>
              <li>All {{ totalItems }} item{{ totalItems !== 1 ? 's' : '' }} across all portfolios</li>
              <li>All cached price data</li>
            </ul>
            <p class="text-danger mt-3" style="font-size:13px;font-weight:600">This cannot be undone.</p>
            <div class="form-group mt-3">
              <label class="form-label">Type "RESET" to confirm</label>
              <input v-model="resetConfirmText" class="input" placeholder="RESET" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="confirmReset = false">Cancel</button>
            <button class="btn btn-danger" :disabled="resetConfirmText !== 'RESET'" @click="doReset">Reset Everything</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePortfolioStore } from '../stores/portfolio'
import { exportPortfolioToExcel, exportAllPortfolios } from '../utils/excel'
import { exportBackup, validateBackup, importBackup } from '../utils/backup'
import { createGoogleSync, createDropboxSync, performSync, getSyncState, isAnyConnected } from '../utils/sync'
const store = usePortfolioStore()
const router = useRouter()

const confirmReset = ref(false)
const resetConfirmText = ref('')

const totalItems = computed(() => store.portfolios.reduce((s, p) => s + p.items.length, 0))

const cacheCount = computed(() => {
  return Object.keys(localStorage).filter(k => k.startsWith('ph_cache_')).length
})

const storageUsed = computed(() => {
  let bytes = 0
  for (const key of Object.keys(localStorage)) {
    bytes += (localStorage.getItem(key) || '').length * 2
  }
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
})

function clearPriceCache() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('ph_cache_'))
  keys.forEach(k => localStorage.removeItem(k))
}

function doReset() {
  store.resetAll()
  confirmReset.value = false
  resetConfirmText.value = ''
  router.push('/')
}

function exportOne(portfolio) {
  exportPortfolioToExcel(portfolio)
}

function exportAll() {
  exportAllPortfolios(store.portfolios)
}

const importResult = ref(null)

function doExportBackup() {
  exportBackup()
}

function handleImport(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result)
      const error = validateBackup(data)
      if (error) {
        importResult.value = { error }
        return
      }
      importResult.value = importBackup(data)
    } catch {
      importResult.value = { error: 'Invalid JSON file' }
    }
  }
  reader.readAsText(file)
  e.target.value = '' // reset so re-selecting same file works
}

// ── Cloud Sync ──

// OAuth client IDs — must be set up in Google Cloud Console / Dropbox App Console
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY || ''

const syncState = ref(getSyncState())
const syncLoading = ref(false)
const syncResult = ref(null)

const syncConnected = computed(() => !!syncState.value.token && !!syncState.value.provider)
const syncProviderName = computed(() => {
  if (syncState.value.provider === 'google') return 'Google Drive'
  if (syncState.value.provider === 'dropbox') return 'Dropbox'
  return ''
})

function _getAdapter() {
  if (syncState.value.provider === 'google') return createGoogleSync(GOOGLE_CLIENT_ID)
  if (syncState.value.provider === 'dropbox') return createDropboxSync(DROPBOX_APP_KEY)
  return null
}

async function connectGoogle() {
  if (!GOOGLE_CLIENT_ID) {
    syncResult.value = { error: 'Google Client ID not configured — add VITE_GOOGLE_CLIENT_ID to .env' }
    return
  }
  syncLoading.value = true
  syncResult.value = null
  try {
    const adapter = createGoogleSync(GOOGLE_CLIENT_ID)
    await adapter.connect()
    syncState.value = getSyncState()
  } catch (e) {
    syncResult.value = { error: e.message }
  }
  syncLoading.value = false
}

async function connectDropbox() {
  if (!DROPBOX_APP_KEY) {
    syncResult.value = { error: 'Dropbox App Key not configured — add VITE_DROPBOX_APP_KEY to .env' }
    return
  }
  syncLoading.value = true
  syncResult.value = null
  try {
    const adapter = createDropboxSync(DROPBOX_APP_KEY)
    await adapter.connect()
    syncState.value = getSyncState()
  } catch (e) {
    syncResult.value = { error: e.message }
  }
  syncLoading.value = false
}

async function doSync() {
  syncLoading.value = true
  syncResult.value = null
  try {
    const adapter = _getAdapter()
    if (!adapter) throw new Error('No sync adapter')
    syncResult.value = await performSync(adapter)
    syncState.value = getSyncState()
  } catch (e) {
    syncResult.value = { error: e.message }
  }
  syncLoading.value = false
}

function doDisconnect() {
  const adapter = _getAdapter()
  if (adapter) adapter.disconnect()
  syncState.value = getSyncState()
  syncResult.value = null
}

function formatSyncTime(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch { return iso }
}
</script>

<style scoped>
.settings-view { max-width: 720px; margin: 0 auto; }
.settings-title { font-size: 22px; font-weight: 700; margin-bottom: 24px; }
.settings-section { }
.settings-section-title { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
.settings-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; }

.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
  gap: 12px;
}
.settings-item:last-child { border-bottom: none; }
.settings-item-label { font-size: 14px; font-weight: 500; }
.settings-item-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.settings-item-value { font-size: 13px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }

/* PC key row — column layout */
.settings-item-col {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}
.settings-item-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.pc-key-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.about-item { background: var(--bg-hover); padding: 12px; border-radius: var(--radius); }
.about-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 4px; }
.about-val { font-size: 13px; font-weight: 600; }

.settings-notes { display: flex; flex-direction: column; gap: 12px; }
.note {
  display: flex;
  gap: 10px;
  background: var(--bg-hover);
  padding: 12px;
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.note span { font-size: 18px; flex-shrink: 0; }
.note strong { color: var(--text-primary); }

.reset-list {
  list-style: disc;
  padding-left: 20px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.8;
}

.portfolio-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.import-result {
  font-size: 13px;
  padding: 8px 12px;
  border-radius: var(--radius);
  width: 100%;
}
.import-result.success { background: rgba(63, 185, 80, 0.1); color: #3fb950; }
.import-result.error { background: rgba(248, 81, 73, 0.1); color: #f85149; }
.import-reload {
  margin-left: 8px;
  cursor: pointer;
  text-decoration: underline;
  font-weight: 600;
}
.import-reload:hover { opacity: 0.8; }
.backup-import-btn { cursor: pointer; }
.sync-actions { display: flex; gap: 8px; align-items: center; width: 100%; }

@media (max-width: 640px) {
  .about-grid { grid-template-columns: 1fr; }
  .pc-key-input-row { flex-wrap: wrap; }
  .pc-key-input-row .input { min-width: 0; }
}
</style>
