<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>Add to Portfolio</h3>
        <button class="btn btn-ghost btn-icon" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <!-- Type selector -->
        <div class="type-tabs mb-4">
          <button
            v-for="t in types"
            :key="t.value"
            class="type-tab"
            :class="{ active: itemType === t.value }"
            @click="itemType = t.value"
          >
            <span>{{ t.icon }}</span> {{ t.label }}
          </button>
        </div>

        <!-- Card / Graded: show card info -->
        <div v-if="card && (itemType === 'card' || itemType === 'graded')" class="card-preview">
          <img :src="card.images?.small" :alt="card.name" class="card-thumb" />
          <div class="card-preview-info">
            <div class="card-preview-name">{{ card.name }}</div>
            <div class="card-preview-set">{{ card.set?.name }} · #{{ card.number }}</div>
            <div class="card-preview-price" v-if="currentPrice">
              Market: <span class="text-accent font-bold">${{ currentPrice.toFixed(2) }}</span>
            </div>
          </div>
        </div>

        <!-- Graded specific -->
        <div v-if="itemType === 'graded'" class="form-row mt-3">
          <div class="form-group">
            <label class="form-label">Grading Company</label>
            <select v-model="form.gradingCompany" class="select">
              <option value="PSA">PSA</option>
              <option value="BGS">BGS</option>
              <option value="CGC">CGC</option>
              <option value="ACE">ACE</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Grade</label>
            <select v-model="form.grade" class="select">
              <option v-for="g in gradeOptions" :key="g" :value="g">{{ g }}</option>
            </select>
          </div>
        </div>

        <!-- Card variant selector -->
        <div v-if="itemType === 'card' && variants.length > 0" class="form-group mt-2">
          <label class="form-label">Variant / Finish</label>
          <select v-model="form.priceVariant" class="select">
            <option v-for="v in variants" :key="v.key" :value="v.key">
              {{ v.label }} — ${{ v.market?.toFixed(2) || '—' }}
            </option>
          </select>
        </div>

        <!-- Sealed product fields -->
        <div v-if="itemType === 'sealed'">
          <div class="form-group">
            <label class="form-label">Product Name</label>
            <input v-model="form.name" class="input" placeholder="e.g. Scarlet & Violet Booster Box" />
          </div>
          <div class="form-group">
            <label class="form-label">Set / Series</label>
            <input v-model="form.setName" class="input" placeholder="e.g. Scarlet & Violet Base" />
          </div>
          <div class="form-group">
            <label class="form-label">Product Type</label>
            <select v-model="form.sealedType" class="select">
              <option value="booster_box">Booster Box</option>
              <option value="elite_trainer_box">Elite Trainer Box</option>
              <option value="booster_pack">Booster Pack</option>
              <option value="collection_box">Collection Box</option>
              <option value="tin">Tin</option>
              <option value="blister">Blister Pack</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Current Market Value ($)</label>
            <input v-model.number="form.currentValue" class="input" type="number" min="0" step="0.01" placeholder="0.00" />
          </div>
        </div>

        <!-- Shared fields -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Purchase Price ($)</label>
            <input v-model.number="form.purchasePrice" class="input" type="number" min="0" step="0.01" placeholder="0.00" />
          </div>
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input v-model.number="form.quantity" class="input" type="number" min="1" step="1" placeholder="1" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Purchase Date</label>
          <input v-model="form.purchaseDate" class="input" type="date" />
        </div>

        <div class="form-group">
          <label class="form-label">Portfolio</label>
          <select v-model="form.portfolioId" class="select">
            <option v-for="p in store.portfolios" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Notes (optional)</label>
          <textarea v-model="form.notes" class="textarea" placeholder="Any notes about this item..."></textarea>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">Cancel</button>
        <button class="btn btn-primary" :disabled="!canSubmit" @click="submit">
          Add to Portfolio
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { usePortfolioStore } from '../stores/portfolio'
import { getAllVariants, getMarketPrice } from '../services/pokemonApi'

const props = defineProps({
  card: { type: Object, default: null },
  defaultPortfolioId: { type: String, default: null }
})

const emit = defineEmits(['close', 'added'])
const store = usePortfolioStore()

const itemType = ref('card')
const types = [
  { value: 'card', label: 'Raw Card', icon: '🃏' },
  { value: 'graded', label: 'Graded Slab', icon: '🏆' },
  { value: 'sealed', label: 'Sealed Product', icon: '📦' },
]

const gradesByCompany = {
  PSA:   ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'],
  BGS:   ['10', '9.5', '9', '8.5', '8', '7.5', '7', '6', '5', '4', '3', '2', '1'],
  CGC:   ['10', '9.5', '9', '8.5', '8', '7.5', '7', '6', '5', '4', '3', '2', '1'],
  ACE:   ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'],
  Other: ['10', '9.5', '9', '8', '7', '6', '5', '4', '3', '2', '1'],
}
const gradeOptions = computed(() => gradesByCompany[form.value.gradingCompany] || gradesByCompany.PSA)

const form = ref({
  name: '',
  setName: '',
  sealedType: 'booster_box',
  priceVariant: '',
  gradingCompany: 'PSA',
  grade: '10',
  purchasePrice: null,
  currentValue: null,
  quantity: 1,
  purchaseDate: new Date().toISOString().split('T')[0],
  portfolioId: '',
  notes: ''
})

const variants = computed(() => {
  if (!props.card) return []
  return getAllVariants(props.card)
})

const currentPrice = computed(() => {
  if (!props.card) return null
  if (form.value.priceVariant) {
    const v = variants.value.find(v => v.key === form.value.priceVariant)
    return v?.market || null
  }
  const result = getMarketPrice(props.card)
  return result?.price || null
})

const canSubmit = computed(() => {
  if (itemType.value === 'sealed') return form.value.name.trim().length > 0
  return !!props.card
})

function submit() {
  const portfolioId = form.value.portfolioId || store.portfolios[0]?.id
  if (!portfolioId) return

  let item = {
    type: itemType.value,
    quantity: form.value.quantity || 1,
    purchasePrice: form.value.purchasePrice || 0,
    purchaseDate: form.value.purchaseDate,
    notes: form.value.notes,
  }

  if (itemType.value === 'card') {
    item = {
      ...item,
      cardId: props.card.id,
      cardData: {
        name: props.card.name,
        number: props.card.number,
        images: props.card.images,
        set: { id: props.card.set?.id, name: props.card.set?.name },
        rarity: props.card.rarity,
        supertype: props.card.supertype,
        subtypes: props.card.subtypes,
      },
      priceVariant: form.value.priceVariant,
      currentMarketPrice: currentPrice.value,
    }
  } else if (itemType.value === 'graded') {
    item = {
      ...item,
      cardId: props.card.id,
      cardData: {
        name: props.card.name,
        number: props.card.number,
        images: props.card.images,
        set: { id: props.card.set?.id, name: props.card.set?.name },
        rarity: props.card.rarity,
      },
      gradingCompany: form.value.gradingCompany,
      grade: form.value.grade,
      currentValue: form.value.currentValue || form.value.purchasePrice || 0,
    }
  } else {
    item = {
      ...item,
      name: form.value.name,
      setName: form.value.setName,
      sealedType: form.value.sealedType,
      currentValue: form.value.currentValue || form.value.purchasePrice || 0,
    }
  }

  store.addItem(portfolioId, item)
  emit('added', item)
  emit('close')
}

onMounted(() => {
  form.value.portfolioId = props.defaultPortfolioId || store.activePortfolio?.id || store.portfolios[0]?.id || ''

  // Pre-select best variant
  if (props.card && variants.value.length > 0) {
    const priority = ['holofoil', '1stEditionHolofoil', 'unlimitedHolofoil', 'reverseHolofoil', 'normal']
    const best = priority.find(k => variants.value.some(v => v.key === k))
    form.value.priceVariant = best || variants.value[0]?.key || ''
  }
})

watch(() => props.card, () => {
  if (props.card && variants.value.length > 0) {
    const priority = ['holofoil', '1stEditionHolofoil', 'unlimitedHolofoil', 'reverseHolofoil', 'normal']
    const best = priority.find(k => variants.value.some(v => v.key === k))
    form.value.priceVariant = best || variants.value[0]?.key || ''
  }
})
</script>

<style scoped>
.type-tabs { display: flex; gap: 6px; }
.type-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.type-tab:hover { background: var(--bg-hover); color: var(--text-primary); }
.type-tab.active { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }

.card-preview {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
}
.card-thumb {
  width: 52px;
  height: 72px;
  object-fit: contain;
  border-radius: 4px;
}
.card-preview-name { font-weight: 600; font-size: 15px; }
.card-preview-set { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.card-preview-price { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
</style>
