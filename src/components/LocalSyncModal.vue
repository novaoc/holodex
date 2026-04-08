<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal slide-up-enter-active" style="max-width: 480px">
      <div class="modal-header">
        <h3>{{ mode === 'send' ? '📤 Send to Device' : '📥 Receive from Device' }}</h3>
        <button class="btn btn-ghost btn-icon" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <!-- Mode tabs -->
        <div class="sync-tabs">
          <button class="sync-tab" :class="{ active: mode === 'send' }" @click="mode = 'send'">Send</button>
          <button class="sync-tab" :class="{ active: mode === 'receive' }" @click="mode = 'receive'">Receive</button>
        </div>

        <!-- SEND mode -->
        <template v-if="mode === 'send'">
          <p class="sync-desc">The other device can scan this QR code or paste the text below.</p>

          <!-- QR Code -->
          <div v-if="!qrTooLarge" class="qr-container">
            <canvas ref="qrCanvas" class="qr-canvas"></canvas>
          </div>
          <div v-else class="qr-fallback">
            <p class="text-muted" style="font-size: 13px; text-align: center;">
              Collection too large for QR code — use the text below instead.
            </p>
          </div>

          <!-- Copyable text -->
          <div class="sync-text-area">
            <textarea
              ref="sendTextarea"
              :value="encodedData"
              readonly
              class="input sync-textarea"
              rows="4"
              @click="selectText"
            ></textarea>
            <button class="btn btn-secondary btn-sm sync-copy-btn" @click="copyData">
              {{ copied ? '✓ Copied' : 'Copy' }}
            </button>
          </div>

          <div class="sync-info">
            <span class="text-muted" style="font-size: 12px">
              {{ itemCount }} item{{ itemCount !== 1 ? 's' : '' }} · {{ dataSize }}
            </span>
          </div>
        </template>

        <!-- RECEIVE mode -->
        <template v-if="mode === 'receive'">
          <p class="sync-desc">Paste the data from the sending device below.</p>

          <textarea
            v-model="receiveInput"
            class="input sync-textarea"
            placeholder="Paste sync data here..."
            rows="6"
          ></textarea>

          <div v-if="parseError" class="sync-error">{{ parseError }}</div>

          <div v-if="parsedBackup" class="sync-preview">
            <div class="sync-preview-title">Ready to import:</div>
            <div class="sync-preview-detail">
              {{ parsedBackup.data?.portfolios?.portfolios?.length || 0 }} portfolio(s)
            </div>
            <div class="sync-preview-detail" v-if="parsedBackup.exportedAt">
              Exported: {{ formatDate(parsedBackup.exportedAt) }}
            </div>
          </div>
        </template>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">Cancel</button>
        <button
          v-if="mode === 'receive'"
          class="btn btn-primary"
          :disabled="!parsedBackup"
          @click="doImport"
        >
          Import
        </button>
      </div>

      <!-- Import success -->
      <div v-if="imported" class="sync-import-success">
        ✓ Imported successfully
        <button class="btn btn-ghost btn-sm" @click="location.reload()">Reload to apply</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import QRCode from 'qrcode'
import { exportBackup, importBackup, validateBackup } from '../utils/backup'

const emit = defineEmits(['close'])

const mode = ref('send')
const copied = ref(false)
const imported = ref(false)

// ── Send ──
const qrCanvas = ref(null)
const sendTextarea = ref(null)
const qrTooLarge = ref(false)

const backupData = computed(() => exportBackup())
const encodedData = computed(() => JSON.stringify(backupData.value))
const itemCount = computed(() => {
  const portfolios = backupData.value.data?.portfolios?.portfolios || []
  return portfolios.reduce((s, p) => s + (p.items?.length || 0), 0)
})
const dataSize = computed(() => {
  const bytes = new Blob([encodedData.value]).size
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
})

async function generateQR() {
  if (!qrCanvas.value) return
  const data = encodedData.value
  // QR code max ~3KB for reliable scanning
  if (data.length > 2800) {
    qrTooLarge.value = true
    return
  }
  qrTooLarge.value = false
  try {
    await QRCode.toCanvas(qrCanvas.value, data, {
      width: 280,
      margin: 2,
      color: { dark: '#f8f8f2', light: '#282a36' },
      errorCorrectionLevel: 'L',
    })
  } catch {
    qrTooLarge.value = true
  }
}

function selectText() {
  sendTextarea.value?.select()
}

async function copyData() {
  try {
    await navigator.clipboard.writeText(encodedData.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    selectText()
  }
}

// ── Receive ──
const receiveInput = ref('')
const parseError = ref('')
const parsedBackup = ref(null)

watch(receiveInput, (val) => {
  parseError.value = ''
  parsedBackup.value = null
  if (!val.trim()) return
  try {
    const data = JSON.parse(val.trim())
    const err = validateBackup(data)
    if (err) {
      parseError.value = err
      return
    }
    parsedBackup.value = data
  } catch {
    parseError.value = 'Invalid JSON — make sure you copied the full data'
  }
})

function doImport() {
  if (!parsedBackup.value) return
  try {
    importBackup(parsedBackup.value)
    imported.value = true
  } catch (e) {
    parseError.value = `Import failed: ${e.message}`
  }
}

function formatDate(iso) {
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

// Generate QR on mount and when switching to send mode
watch(mode, (m) => { if (m === 'send') nextTick(generateQR) })
onMounted(() => { nextTick(generateQR) })
</script>

<style scoped>
.sync-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--bg-hover);
  border-radius: var(--radius);
  padding: 3px;
}
.sync-tab {
  flex: 1;
  padding: 8px;
  border: none;
  background: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.sync-tab.active {
  background: var(--accent);
  color: var(--bg-primary);
}
.sync-tab:hover:not(.active) { color: var(--text-primary); }

.sync-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.qr-container {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}
.qr-canvas {
  border-radius: var(--radius);
}

.qr-fallback {
  padding: 20px;
  text-align: center;
  background: var(--bg-hover);
  border-radius: var(--radius);
  margin-bottom: 16px;
}

.sync-text-area {
  position: relative;
  margin-bottom: 12px;
}
.sync-textarea {
  width: 100%;
  font-family: monospace;
  font-size: 11px;
  resize: none;
}
.sync-copy-btn {
  position: absolute;
  top: 6px;
  right: 6px;
}

.sync-info { text-align: center; }

.sync-error {
  font-size: 13px;
  color: var(--danger);
  padding: 8px 12px;
  background: rgba(248, 81, 73, 0.1);
  border-radius: var(--radius);
  margin-top: 12px;
}

.sync-preview {
  margin-top: 12px;
  padding: 12px;
  background: rgba(63, 185, 80, 0.1);
  border-radius: var(--radius);
}
.sync-preview-title {
  font-size: 13px;
  font-weight: 600;
  color: #3fb950;
  margin-bottom: 4px;
}
.sync-preview-detail {
  font-size: 12px;
  color: var(--text-secondary);
}

.sync-import-success {
  padding: 12px 20px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: #3fb950;
  background: rgba(63, 185, 80, 0.1);
  border-top: 1px solid var(--border);
}
</style>
