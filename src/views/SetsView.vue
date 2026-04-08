<template>
  <div class="sets-view">

    <!-- Set list -->
    <div v-if="!selectedSet">
      <div class="sets-header mb-4">
        <div class="lang-tabs">
          <button class="lang-tab" :class="{ active: lang === 'en' }" @click="switchLang('en')">English</button>
          <button class="lang-tab" :class="{ active: lang === 'ja' }" @click="switchLang('ja')">Japanese</button>
        </div>
        <div class="search-input-wrap">
          <span class="search-icon">⌕</span>
          <input
            v-model="setFilter"
            class="input search-input"
            placeholder="Filter sets..."
          />
          <button v-if="setFilter" class="btn btn-ghost btn-icon search-clear" @click="setFilter = ''">✕</button>
        </div>
      </div>

      <div v-if="loadingSets" class="flex-center" style="padding:80px">
        <div class="spinner spinner-lg"></div>
      </div>

      <div v-else-if="setsError" class="empty-state">
        <div class="icon">⚠</div>
        <h3>Failed to load sets</h3>
        <p>{{ setsError }}</p>
        <button class="btn btn-primary mt-3" @click="loadSets">Retry</button>
      </div>

      <div v-else>
        <div class="sets-count text-muted mb-3" style="font-size:13px">
          {{ filteredSets.length }} set{{ filteredSets.length !== 1 ? 's' : '' }}
        </div>
        <div class="sets-grid">
          <div
            v-for="set in filteredSets"
            :key="set.id"
            class="set-card"
            @click="openSet(set)"
          >
            <div class="set-logo-wrap">
              <img
                v-if="set.images?.logo"
                :src="set.images.logo"
                :alt="set.name"
                class="set-logo"
                loading="lazy"
              />
              <span v-else class="set-logo-placeholder" :class="{ 'set-logo-jp': set._lang === 'ja' }">
                {{ set._lang === 'ja' ? 'ポケ' : '⬡' }}
              </span>
            </div>
            <div class="set-info">
              <div class="set-name">{{ set.name }}</div>
              <div class="set-meta">
                <template v-if="set.series">
                  <span class="set-series">{{ set.series }}</span>
                  <span class="set-dot">·</span>
                </template>
                <span class="set-count">{{ set.total }} cards</span>
                <template v-if="set.releaseDate">
                  <span class="set-dot">·</span>
                  <span class="set-date">{{ formatDate(set.releaseDate) }}</span>
                </template>
              </div>
            </div>
            <div class="set-symbol-wrap" v-if="set.images?.symbol">
              <img :src="set.images.symbol" :alt="set.name + ' symbol'" class="set-symbol" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Card browser for selected set -->
    <div v-else>
      <div class="set-browse-header mb-4">
        <button class="btn btn-secondary btn-sm" @click="closeSet">← All Sets</button>
        <div class="set-browse-title">
          <img v-if="selectedSet.images?.symbol" :src="selectedSet.images.symbol" class="browse-symbol" />
          <span>{{ selectedSet.name }}</span>
          <span class="badge badge-accent ml-2">{{ selectedSet.total }} cards</span>
        </div>
        <div class="set-browse-filters">
          <input
            v-model="cardFilter"
            class="input input-sm"
            placeholder="Filter cards..."
            style="width:160px"
          />
        </div>
      </div>

      <div v-if="loadingCards" class="flex-center" style="padding:60px">
        <div class="spinner spinner-lg"></div>
      </div>

      <div v-else-if="cardsError" class="empty-state">
        <div class="icon">⚠</div>
        <h3>Failed to load cards</h3>
        <p>{{ cardsError }}</p>
        <button class="btn btn-primary mt-3" @click="loadSetCards(selectedSet)">Retry</button>
      </div>

      <div v-else>
        <div class="cards-grid">
          <div
            v-for="card in filteredCards"
            :key="card.id"
            class="card-result"
            :class="{ selected: selectedCard?.id === card.id }"
            @click="selectCard(card)"
          >
            <div class="card-img-wrap">
              <img
                v-if="card.images?.small"
                :src="card.images.small"
                :alt="card.name"
                loading="lazy"
                class="card-img"
              />
              <div v-else class="card-img-placeholder">
                <span>{{ card.name }}</span>
                <span class="card-img-num">#{{ card.number }}</span>
              </div>
              <div class="card-overlay">
                <button class="btn btn-primary btn-sm" @click.stop="openAddModal(card)">+ Add</button>
                <button class="btn btn-secondary btn-sm" @click.stop="selectCard(card)">Details</button>
              </div>
            </div>
            <div class="card-meta">
              <div class="card-name">{{ card.name }}</div>
              <div class="card-num text-muted" style="font-size:10px">#{{ card.number }}</div>
              <div class="card-price-row">
                <span v-if="getPrice(card)" class="card-price">${{ getPrice(card).toFixed(2) }}</span>
                <span v-else class="text-muted" style="font-size:11px">—</span>
                <span class="card-rarity badge badge-accent" v-if="card.rarity">{{ shortRarity(card.rarity) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="totalCardPages > 1" class="pagination">
          <button class="btn btn-secondary btn-sm" :disabled="cardPage === 1" @click="goCardPage(cardPage - 1)">← Prev</button>
          <span class="text-muted">Page {{ cardPage }} of {{ totalCardPages }}</span>
          <button class="btn btn-secondary btn-sm" :disabled="cardPage >= totalCardPages" @click="goCardPage(cardPage + 1)">Next →</button>
        </div>
      </div>
    </div>

    <!-- Card detail panel -->
    <transition name="slide-up">
      <div v-if="selectedCard" class="card-detail-panel">
        <div class="panel-header">
          <h3>{{ selectedCard.name }}</h3>
          <button class="btn btn-ghost btn-icon" @click="selectedCard = null">✕</button>
        </div>
        <div class="panel-body">
          <div class="panel-top">
            <img :src="selectedCard.images?.large || selectedCard.images?.small" class="panel-card-img" />
            <div class="panel-card-info">
              <div class="panel-card-set">{{ selectedCard.set?.name }} · #{{ selectedCard.number }}</div>
              <div class="panel-card-rarity">{{ selectedCard.rarity }}</div>
              <div class="panel-card-type">{{ selectedCard.supertype }} · {{ selectedCard.subtypes?.join(', ') }}</div>

              <div class="price-list mt-3" v-if="selectedCard.tcgplayer?.prices">
                <div class="price-list-title">{{ selectedCard._lang === 'ja' ? 'CardMarket (converted)' : 'TCGPlayer Prices' }}</div>
                <div
                  v-for="(vals, key) in selectedCard.tcgplayer.prices"
                  :key="key"
                  class="price-row"
                >
                  <span class="price-variant">{{ selectedCard._lang === 'ja' ? 'Market' : formatVariantLabel(key) }}</span>
                  <span class="price-val">${{ vals.market?.toFixed(2) || vals.mid?.toFixed(2) || '—' }}</span>
                </div>
              </div>

              <!-- Japanese card details -->
              <div v-if="selectedCard._lang === 'ja'" class="mt-3">
                <div v-if="selectedCard.attacks?.length" class="mt-3">
                  <div class="price-list-title">Attacks</div>
                  <div v-for="atk in selectedCard.attacks" :key="atk.name" class="attack-row">
                    <div class="attack-header">
                      <span class="attack-cost">{{ (atk.cost || []).join(' ') }}</span>
                      <span class="attack-name">{{ atk.name }}</span>
                      <span class="attack-damage" v-if="atk.damage">{{ atk.damage }}</span>
                    </div>
                    <div class="attack-text" v-if="atk.text">{{ atk.text }}</div>
                  </div>
                </div>
                <div v-if="selectedCard.weaknesses?.length" class="mt-2" style="font-size:12px;color:var(--text-muted)">
                  Weaknesses: {{ selectedCard.weaknesses.map(w => `${w.type} ${w.value}`).join(', ') }}
                </div>
              </div>

              <div class="panel-actions mt-3">
                <button class="btn btn-primary w-full" @click="openAddModal(selectedCard)">
                  + Add to Portfolio
                </button>
              </div>
            </div>
          </div>
          <div class="panel-chart">
            <div class="section-title mb-3">Price History</div>
            <PriceChart
              :cardId="selectedCard.id"
              :currentPrice="getPrice(selectedCard)"
              :height="240"
            />
          </div>
        </div>
      </div>
    </transition>

    <!-- Add modal -->
    <transition name="fade">
      <AddItemModal
        v-if="showAddModal"
        :card="modalCard"
        @close="showAddModal = false"
        @added="showAddModal = false"
      />
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getSets, getCardsBySet, getMarketPrice, formatVariantLabel, getJapaneseSets, getJapaneseCardsBySet, getJapaneseCardDetail } from '../services/pokemonApi'
import PriceChart from '../components/PriceChart.vue'
import AddItemModal from '../components/AddItemModal.vue'

// Set list state
const sets = ref([])
const loadingSets = ref(false)
const setsError = ref(null)
const setFilter = ref('')
const lang = ref('en')
const setsCache = { en: [], ja: [] }

// Selected set / card browse state
const selectedSet = ref(null)
const cards = ref([])
const loadingCards = ref(false)
const cardsError = ref(null)
const cardFilter = ref('')
const cardPage = ref(1)
const cardPageSize = 36
const totalCards = ref(0)
const totalCardPages = computed(() => Math.ceil(totalCards.value / cardPageSize))

// Card detail / add modal
const selectedCard = ref(null)
const showAddModal = ref(false)
const modalCard = ref(null)

const filteredSets = computed(() => {
  const q = setFilter.value.toLowerCase()
  if (!q) return sets.value
  return sets.value.filter(s =>
    s.name.toLowerCase().includes(q) || s.series?.toLowerCase().includes(q)
  )
})

const filteredCards = computed(() => {
  const q = cardFilter.value.toLowerCase()
  if (!q) return cards.value
  return cards.value.filter(c => c.name.toLowerCase().includes(q))
})

async function loadSets() {
  loadingSets.value = true
  setsError.value = null
  try {
    if (lang.value === 'ja') {
      setsCache.ja = await getJapaneseSets()
      sets.value = setsCache.ja
    } else {
      setsCache.en = await getSets()
      sets.value = setsCache.en
    }
  } catch (e) {
    setsError.value = e.message || 'Unknown error'
  } finally {
    loadingSets.value = false
  }
}

async function switchLang(newLang) {
  if (lang.value === newLang) return
  lang.value = newLang
  setFilter.value = ''
  selectedSet.value = null
  selectedCard.value = null
  if (setsCache[newLang].length) {
    sets.value = setsCache[newLang]
  } else {
    await loadSets()
  }
}

async function openSet(set) {
  selectedSet.value = set
  cardPage.value = 1
  cardFilter.value = ''
  selectedCard.value = null
  await loadSetCards(set, 1)
}

function closeSet() {
  selectedSet.value = null
  cards.value = []
  selectedCard.value = null
}

async function loadSetCards(set, page = cardPage.value) {
  loadingCards.value = true
  cardsError.value = null
  try {
    if (set._lang === 'ja' || lang.value === 'ja') {
      const data = await getJapaneseCardsBySet(set.id, page, cardPageSize)
      cards.value = data.data || []
      totalCards.value = data.totalCount || 0
    } else {
      const data = await getCardsBySet(set.id, page, cardPageSize)
      cards.value = data.data || []
      totalCards.value = data.totalCount || 0
    }
  } catch (e) {
    cardsError.value = e.message || 'Unknown error'
  } finally {
    loadingCards.value = false
  }
}

async function goCardPage(p) {
  cardPage.value = p
  await loadSetCards(selectedSet.value, p)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function selectCard(card) {
  if (selectedCard.value?.id === card.id) {
    selectedCard.value = null
    return
  }
  if (card._lang === 'ja') {
    // Fetch full detail for Japanese cards
    try {
      const detail = await getJapaneseCardDetail(card.id)
      selectedCard.value = { ...card, ...detail }
    } catch {
      selectedCard.value = card
    }
  } else {
    selectedCard.value = card
  }
}

function openAddModal(card) {
  modalCard.value = card
  showAddModal.value = true
}

function getPrice(card) {
  // For Japanese cards, price comes from detail fetch (CardMarket)
  if (card._lang === 'ja' && card.tcgplayer?.prices) {
    const vals = Object.values(card.tcgplayer.prices)[0]
    return vals?.market || vals?.mid || null
  }
  const r = getMarketPrice(card)
  return r?.price || null
}

function shortRarity(rarity) {
  const map = {
    'Rare Holo': 'Holo R', 'Rare Ultra': 'Ultra R', 'Rare Secret': 'Secret R',
    'Rare Rainbow': 'Rainbow', 'Rare Holo EX': 'EX', 'Rare Holo GX': 'GX',
    'Rare Holo V': 'V', 'Rare Holo VMAX': 'VMAX', 'Rare Holo VSTAR': 'VSTAR',
    'Illustration Rare': 'IR', 'Special Illustration Rare': 'SIR',
    'Hyper Rare': 'HR', 'Double Rare': '2R', 'Triple Rare': '3R',
  }
  return map[rarity] || (rarity?.length > 10 ? rarity.substring(0, 8) + '…' : rarity)
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('/')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m, 10) - 1]} ${y}`
}

onMounted(loadSets)
</script>

<style scoped>
.sets-view { max-width: 1200px; margin: 0 auto; }

.sets-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

/* Language tabs */
.lang-tabs { display: flex; gap: 0; background: var(--bg-card); border-radius: var(--radius); border: 1px solid var(--border); overflow: hidden; }
.lang-tab {
  padding: 7px 16px; font-size: 13px; font-weight: 500; cursor: pointer;
  background: transparent; border: none; color: var(--text-secondary);
  transition: all 0.15s;
}
.lang-tab:hover { color: var(--text-primary); }
.lang-tab.active { background: var(--accent); color: #0d1117; font-weight: 600; }
.search-input-wrap { flex: 1; position: relative; display: flex; align-items: center; max-width: 400px; }
.search-icon { position: absolute; left: 12px; font-size: 16px; color: var(--text-muted); pointer-events: none; }
.search-input { padding-left: 36px; padding-right: 36px; font-size: 14px; }
.search-clear { position: absolute; right: 4px; }

.sets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
}

.set-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.set-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
}

.set-logo-wrap { width: 80px; min-width: 80px; display: flex; align-items: center; justify-content: center; }
.set-logo { max-width: 80px; max-height: 40px; object-fit: contain; }
.set-logo-placeholder { font-size: 28px; color: var(--text-muted); }
.set-logo-jp { font-size: 18px; font-weight: 700; letter-spacing: 2px; }

.set-info { flex: 1; min-width: 0; }
.set-name { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.set-meta { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 3px; font-size: 11px; color: var(--text-muted); }
.set-dot { color: var(--border); }
.set-series { color: var(--text-secondary); }

.set-symbol-wrap { flex-shrink: 0; }
.set-symbol { width: 24px; height: 24px; object-fit: contain; opacity: 0.7; }

/* Set card browser */
.set-browse-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.set-browse-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 700;
  flex: 1;
}
.browse-symbol { width: 22px; height: 22px; object-fit: contain; }
.set-browse-filters { display: flex; gap: 8px; align-items: center; }

/* Card grid — same as SearchView */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.card-result {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}
.card-result:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
.card-result.selected { border-color: var(--accent); }
.card-img-wrap { position: relative; overflow: hidden; background: #1a1f28; aspect-ratio: 2.5/3.5; }
.card-img { width: 100%; height: 100%; object-fit: contain; display: block; transition: transform 0.3s; }
.card-result:hover .card-img { transform: scale(1.04); }
.card-overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; opacity: 0; transition: opacity 0.2s;
}
.card-result:hover .card-overlay { opacity: 1; }

/* Touch devices: show overlay always */
@media (hover: none) {
  .card-overlay { opacity: 1; background: rgba(0,0,0,0.5); }
  .card-overlay .btn { font-size: 12px; padding: 6px 12px; }
}
.card-img-placeholder {
  width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; padding: 12px; text-align: center;
  font-size: 11px; font-weight: 600; color: var(--text-secondary);
  background: var(--bg-primary);
}
.card-img-num { font-size: 10px; color: var(--text-muted); }

/* Attack rows */
.attack-row { padding: 6px 0; border-bottom: 1px solid var(--border-subtle); }
.attack-header { display: flex; align-items: center; gap: 8px; }
.attack-cost { font-size: 12px; }
.attack-name { font-weight: 600; flex: 1; }
.attack-damage { font-weight: 700; font-variant-numeric: tabular-nums; }
.attack-text { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.card-meta { padding: 10px; }
.card-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-price-row { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
.card-price { font-size: 12px; font-weight: 700; color: var(--accent); }
.card-rarity { font-size: 9px !important; padding: 1px 5px !important; }

.pagination {
  display: flex; align-items: center; justify-content: center;
  gap: 16px; padding: 20px 0;
}

/* Detail panel — same as SearchView */
.card-detail-panel {
  position: fixed; bottom: 0; left: var(--sidebar-width); right: 0;
  max-height: 70vh; background: var(--bg-secondary);
  border-top: 1px solid var(--border); border-left: 1px solid var(--border);
  overflow-y: auto; z-index: 100; box-shadow: 0 -8px 32px rgba(0,0,0,0.5);
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px; border-bottom: 1px solid var(--border);
  position: sticky; top: 0; background: var(--bg-secondary); z-index: 1;
}
.panel-header h3 { font-size: 17px; font-weight: 700; }
.panel-body { padding: 20px 24px; }
.panel-top { display: flex; gap: 24px; margin-bottom: 24px; }
.panel-card-img { width: 140px; min-width: 140px; border-radius: 8px; box-shadow: var(--shadow); }
.panel-card-info { flex: 1; }
.panel-card-set { font-size: 13px; color: var(--text-secondary); margin-bottom: 4px; }
.panel-card-rarity { font-size: 12px; color: var(--accent); }
.panel-card-type { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.price-list-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 8px; }
.price-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid var(--border-subtle); font-size: 13px; }
.price-variant { color: var(--text-secondary); }
.price-val { font-weight: 600; font-variant-numeric: tabular-nums; }
.panel-chart { border-top: 1px solid var(--border); padding-top: 20px; }

@media (max-width: 768px) {
  .set-browse-header { gap: 10px; }
  .set-browse-title { font-size: 15px; }
  .set-browse-filters { width: 100%; }
  .set-browse-filters .input { flex: 1; width: auto !important; }
  .card-detail-panel {
    left: 0;
    max-height: 85vh;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
  .card-detail-panel::before {
    content: '';
    display: block;
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
    margin: 8px auto 4px;
  }
  .panel-top { flex-direction: column; align-items: center; }
  .panel-card-img { width: 160px; min-width: 160px; }
  .panel-body { padding: 12px 16px; }
  .panel-header { padding: 12px 16px; }
  .sets-grid { grid-template-columns: 1fr; }
}

@media (max-width: 480px) {
  .card-detail-panel { max-height: 90vh; }
  .cards-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
  .card-meta { padding: 8px; }
  .card-name { font-size: 11px; }
}
</style>
