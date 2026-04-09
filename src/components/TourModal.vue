<template>
  <transition name="fade">
    <div v-if="show" class="tour-overlay" @click.self="close">
      <div class="tour-modal">
        <button class="tour-close" @click="close" aria-label="Close">✕</button>
        <div class="tour-video-wrap">
          <video
            ref="videoRef"
            :key="videoKey"
            :src="src"
            autoplay
            muted
            playsinline
            class="tour-video"
            @ended="onEnded"
          />
        </div>
        <div class="tour-footer">
          <button v-if="ended" class="btn btn-ghost btn-sm tour-replay" @click="replay">
            Replay
          </button>
          <span class="tour-hint" v-else>Tap ✕ or outside to skip</span>
          <button v-if="ended" class="btn btn-primary btn-sm tour-done" @click="close">
            Got it!
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  src: { type: String, required: true },
  storageKey: { type: String, required: true },
})

const show = ref(false)
const ended = ref(false)
const videoRef = ref(null)
const videoKey = ref(0)

onMounted(() => {
  if (!localStorage.getItem(props.storageKey)) {
    show.value = true
  }
})

function onEnded() {
  ended.value = true
}

function replay() {
  ended.value = false
  videoKey.value++
}

function close() {
  show.value = false
  localStorage.setItem(props.storageKey, '1')
}
</script>

<style scoped>
.tour-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.tour-modal {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  width: min(720px, calc(100vw - 48px));
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.tour-close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: rgba(13, 17, 23, 0.85);
  color: var(--text-muted);
  font-size: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  backdrop-filter: blur(8px);
}

.tour-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--accent);
}

.tour-video-wrap {
  width: 100%;
  position: relative;
  /* 16:9 ratio via padding-bottom: 9/16 = 56.25% */
  padding-bottom: 56.25%;
  background: #000;
  overflow: hidden;
}

.tour-video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.tour-footer {
  padding: 12px 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  min-height: 52px;
}

.tour-hint {
  font-size: 14px;
  color: var(--text-muted);
}

.tour-replay,
.tour-done {
  animation: pulse-in 0.3s ease;
}

@keyframes pulse-in {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* Mobile: full-width bottom sheet */
@media (max-width: 768px) {
  .tour-overlay {
    padding: 0;
    align-items: flex-end;
  }

  .tour-modal {
    max-width: 100%;
    width: 100%;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  .tour-close {
    top: 10px;
    right: 10px;
    width: 38px;
    height: 38px;
    font-size: 18px;
  }

  .tour-footer {
    padding: 16px 20px;
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    gap: 20px;
  }

  .tour-footer .btn {
    min-height: 48px;
    font-size: 16px;
    padding: 12px 24px;
  }
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-active .tour-modal,
.fade-leave-active .tour-modal {
  transition: transform 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-from .tour-modal {
  transform: translateY(20px) scale(0.97);
}

.fade-leave-to .tour-modal {
  transform: translateY(10px) scale(0.98);
}
</style>
