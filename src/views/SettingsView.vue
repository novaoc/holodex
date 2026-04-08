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

    <!-- About -->
    <div class="settings-section card">
      <h3 class="settings-section-title">About</h3>
      <div class="about-grid">
        <div class="about-item">
          <div class="about-label">Version</div>
          <div class="about-val">1.0.0</div>
        </div>
        <div class="about-item">
          <div class="about-label">Price Data</div>
          <div class="about-val">pokemontcg.io + tcgdex</div>
        </div>
        <div class="about-item">
          <div class="about-label">Price History</div>
          <div class="about-val">Up to 3 years (Nov 2022+)</div>
        </div>
        <div class="about-item">
          <div class="about-label">Sealed / Graded</div>
          <div class="about-val">Manual tracking (1.0)</div>
        </div>
      </div>

      <div class="settings-notes mt-3">
        <div class="note">
          <span>📊</span>
          <p>Card price history comes from the <strong>tcgdex/price-history</strong> GitHub repository (TCGPlayer data). History goes back to November 2022. Current prices are fetched live from <strong>pokemontcg.io</strong>.</p>
        </div>
        <div class="note">
          <span>📦</span>
          <p>Sealed products and graded slabs don't have a free price history API. Track them manually by updating current values in your portfolio. A future update will add PriceCharting integration.</p>
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
.danger-zone { }

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
</style>
