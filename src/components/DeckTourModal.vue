<template>
  <transition name="fade">
    <div v-if="show" class="tour-overlay" @click.self="close">
      <div class="tour-modal">
        <button class="tour-close" @click="close" aria-label="Close">✕</button>
        <div class="tour-video-wrap">
          <video
            ref="videoRef"
            :key="videoKey"
            src="/videos/decks-tour.mp4"
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
          <span class="tour-hint" v-else-if="!ended">Tap ✕ or outside to skip</span>
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

const STORAGE_KEY = 'rarebox_deck_tour_seen'

const show = ref(false)
const ended = ref(false)
const videoRef = ref(null)
const videoKey = ref(0)

onMounted(() => {
  if (!localStorage.getItem(STORAGE_KEY)) {
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
  localStorage.setItem(STORAGE_KEY, '1')
}
</script>

<style scoped>
.tour-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.tour-modal {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  width: 100%;
  max-width: 520px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.tour-close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: rgba(13, 17, 23, 0.85);
  color: var(--text-muted);
  font-size: 14px;
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
  aspect-ratio: 16 / 9;
  background: #000;
}

.tour-video {
  width: 100%;
  height: 100%;
  display: block;
}

.tour-footer {
  padding: 12px 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  min-height: 48px;
}

.tour-hint {
  font-size: 13px;
  color: var(--text-muted);
}

.tour-replay {
  animation: pulse-in 0.3s ease;
}

.tour-done {
  animation: pulse-in 0.3s ease;
}

@keyframes pulse-in {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* Mobile: full-width bottom sheet */
@media (max-width: 520px) {
  .tour-overlay {
    padding: 8px;
    padding-bottom: max(8px, env(safe-area-inset-bottom));
    align-items: flex-end;
  }

  .tour-modal {
    max-width: 100%;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  .tour-close {
    top: 6px;
    right: 6px;
    width: 36px;
    height: 36px;
    font-size: 18px;
  }

  .tour-footer {
    padding: 14px 16px;
    padding-bottom: max(14px, env(safe-area-inset-bottom));
  }

  .tour-footer .btn {
    min-height: 44px;
    font-size: 15px;
    padding: 10px 20px;
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
