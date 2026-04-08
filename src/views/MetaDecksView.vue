<template>
  <div class="meta-decks-view">
    <div class="meta-header">
      <router-link to="/decks" class="btn btn-ghost btn-sm" style="margin-bottom:8px">← All Decks</router-link>
      <h2>Meta Decks</h2>
      <p class="text-muted" style="font-size:13px;margin-top:2px">
        {{ source === 'live' ? 'Live tournament data from Limitless TCG.' : 'Static fallback decks.' }}
        Click "Add to My Decks" to import one and start tracking what you own.
        <span v-if="lastUpdated" class="text-muted"> · Updated {{ timeAgo(lastUpdated) }}</span>
      </p>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="meta-loading">
      <div class="spinner"></div>
      <p class="text-muted" style="margin-top:12px">Fetching latest meta decks...</p>
    </div>

    <div v-else class="meta-grid">
      <div v-for="deck in metaDecks" :key="deck.name" class="meta-card">
        <div class="meta-card-header">
          <h3>{{ deck.name }}</h3>
          <div class="meta-card-badges">
            <span class="badge badge-info">{{ deck.cards.reduce((s, c) => s + (c.quantity || 1), 0) }} cards</span>
            <span v-if="deck.meta?.share" class="badge badge-accent">{{ deck.meta.share }}</span>
          </div>
        </div>
        <p class="meta-card-desc">{{ deck.description }}</p>
        <div class="meta-card-actions">
          <button
            class="btn btn-primary btn-sm"
            @click="importDeck(deck)"
            :disabled="importing === (deck.archetype || deck.name)"
          >
            <span v-if="importing === (deck.archetype || deck.name)" class="spinner spinner-sm"></span>
            <span v-else>+ Add to My Decks</span>
          </button>
          <button class="btn btn-ghost btn-sm" @click="expanded = expanded === deck.name ? null : deck.name">
            {{ expanded === deck.name ? 'Hide List' : 'View List' }}
          </button>
        </div>

        <!-- Expanded card list -->
        <div v-if="expanded === deck.name" class="meta-card-list">
          <div v-for="card in deck.cards" :key="card.name + card.setCode" class="meta-card-row">
            <div class="meta-row-info">
              <div class="meta-row-name">{{ card.name }}</div>
              <div class="meta-row-set">{{ card.setName || card.setCode }}</div>
            </div>
            <span class="meta-row-qty">×{{ card.quantity }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDeckStore } from '../stores/decks'
import { fetchLiveMetaDecks, fallbackMetaDecks } from '../services/metaDecksApi'

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const deckStore = useDeckStore()
const router = useRouter()

const importing = ref(null)
const expanded = ref(null)
const metaDecks = ref([])
const loading = ref(true)
const source = ref('live') // 'live' or 'fallback'
const lastUpdated = ref(null)

onMounted(async () => {
  try {
    metaDecks.value = await fetchLiveMetaDecks()
    source.value = 'live'
    // Read cache timestamp
    try {
      const cached = JSON.parse(localStorage.getItem('holodex_meta_decks_cache'))
      if (cached?.timestamp) lastUpdated.value = new Date(cached.timestamp)
    } catch {}
  } catch {
    // Fall back to hardcoded decks — resolve cards via the deck store
    metaDecks.value = fallbackMetaDecks
    source.value = 'fallback'
  }
  loading.value = false
})

async function importDeck(metaDeck) {
  importing.value = metaDeck.archetype || metaDeck.name
  const deck = await deckStore.importMetaDeck(metaDeck)
  importing.value = null
  router.push(`/decks/${deck.id}`)
}
</script>

<style scoped>
.meta-decks-view { max-width: 1200px; margin: 0 auto; }

.meta-header { margin-bottom: 24px; }
.meta-header h2 { font-size: 22px; font-weight: 700; }

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}

.meta-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.meta-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.meta-card-header h3 { font-size: 16px; font-weight: 700; }
.meta-card-badges { display: flex; gap: 4px; align-items: center; }

.meta-card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.meta-card-preview { display: flex; gap: 4px; align-items: center; }
.meta-preview-img { width: 30px; height: 42px; object-fit: contain; border-radius: 2px; }
.meta-preview-more { font-size: 11px; color: var(--text-muted); margin-left: 4px; }

.meta-card-actions { display: flex; gap: 8px; }

/* Expanded card list */
.meta-card-list {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}
.meta-card-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius);
}
.meta-card-row:hover { background: var(--bg-hover); }
.meta-row-img { width: 28px; height: 38px; object-fit: contain; border-radius: 2px; flex-shrink: 0; }
.meta-row-info { flex: 1; min-width: 0; }
.meta-row-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta-row-set { font-size: 10px; color: var(--text-muted); }
.meta-row-qty { font-size: 13px; font-weight: 700; flex-shrink: 0; }

/* Loading */
.meta-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 0;
}

@media (max-width: 640px) {
  .meta-grid { grid-template-columns: 1fr; }
}
</style>
