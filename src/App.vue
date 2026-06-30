<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import HelloWorld from './components/HelloWorld.vue'
import waterImage from './assets/water.jpg'
import { createWaterRipple, type WaterRippleEffect } from './lib/waterRipple'

const glCanvas = ref<HTMLCanvasElement | null>(null)
const useImageBackground = ref(false)
let waterRipple: WaterRippleEffect | null = null

function toggleBackground() {
  useImageBackground.value = !useImageBackground.value
}

onMounted(() => {
  if (!glCanvas.value) return

  waterRipple = createWaterRipple(glCanvas.value)
})

onBeforeUnmount(() => {
  waterRipple?.destroy()
  waterRipple = null
})
</script>

<template>
  <div v-if="useImageBackground" class="image-background" aria-hidden="true">
    <img :src="waterImage" alt="" />
  </div>

  <HelloWorld />

  <button class="background-toggle" type="button" @click="toggleBackground">
    {{ useImageBackground ? '切换到网页背景' : '切换到图片背景' }}
  </button>

  <div class="fluid-overlay" aria-hidden="true">
    <canvas ref="glCanvas"></canvas>
  </div>
</template>

<style scoped>
.image-background {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}

.image-background img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.background-toggle {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 10000;
  border: 1px solid rgb(255 255 255 / 0.45);
  border-radius: 999px;
  padding: 10px 18px;
  color: #234;
  font-size: 14px;
  font-weight: 600;
  background: rgb(255 255 255 / 0.72);
  box-shadow: 0 12px 32px rgb(80 120 160 / 0.22);
  backdrop-filter: blur(12px);
  cursor: pointer;
}

.background-toggle:hover {
  background: rgb(255 255 255 / 0.9);
}

.fluid-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  overflow: hidden;
}

.fluid-overlay canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
</style>

