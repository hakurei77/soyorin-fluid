<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import HelloWorld from './components/HelloWorld.vue'

const glCanvas = ref<HTMLCanvasElement | null>(null)

onMounted(() => {
  const glCv = glCanvas.value as HTMLCanvasElement | null
  if (!glCv) return

  const gl = glCv.getContext('webgl', {
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: false,
  }) as WebGLRenderingContext | null
  if (!gl) return

  const canvasGl = glCv
  const gl2 = gl


  const DPR = Math.min(window.devicePixelRatio || 1, 2)
  const NX = 160
  const params = { ripple: 1, light: 1 }

  let W = 1
  let H = 1
  let NY = 160
  let u = new Float32Array(NX * NY)
  let uPrev = new Float32Array(NX * NY)
  let simBytes = new Uint8Array(NX * NY)
  let texSim: WebGLTexture | null = null
  let raf = 0
  let lastT = performance.now()
  let breathT = 0
  let lastMx = -1
  let lastMy = -1


  const vsh = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

  const fsh = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uSim;
uniform vec2 uTexel;
uniform float uTime;
uniform float uLight;
uniform float uRefr;

float h(vec2 p){ return texture2D(uSim, p).r - 0.5019608; }

void main(){
  vec2 e = uTexel;
  float hl = h(vUv - vec2(e.x, 0.0));
  float hr = h(vUv + vec2(e.x, 0.0));
  float ht = h(vUv - vec2(0.0, e.y));
  float hb = h(vUv + vec2(0.0, e.y));
  vec2 grad = vec2(hr - hl, hb - ht);

    float slope = length(grad) * uRefr;
    float light = (grad.x + grad.y) * 2.45;
    float spec = smoothstep(0.026, 0.14, light) * uLight;
    float trough = smoothstep(0.025, 0.13, -light) * uLight;
    float ring = smoothstep(0.008, 0.075, slope) * (1.0 - smoothstep(0.18, 0.4, slope));
    float band = smoothstep(0.78, 1.0, sin(dot(vUv, vec2(1.3, 1.0)) * 2.6 - uTime * 0.2));
    vec2 sc = vec2(0.5 + 0.22 * cos(uTime * 0.07), 0.36 + 0.18 * sin(uTime * 0.09));
    float pool = 1.0 - smoothstep(0.0, 0.55, distance(vUv * vec2(1.0, 1.35), sc * vec2(1.0, 1.35)));

    vec3 waterTint = vec3(0.25, 0.58, 0.9) * (ring * 0.62 + pool * 0.05 * uLight);
    vec3 shadow = vec3(0.04, 0.16, 0.28) * (trough * 0.62 + ring * 0.2);
    vec3 shine = vec3(1.0, 0.98, 0.88) * (spec * 1.15 + band * 0.075 * uLight + pool * 0.08 * uLight);
    float alpha = clamp(0.055 + ring * 0.34 + spec * 0.46 + trough * 0.32 + band * 0.035 + pool * 0.035, 0.0, 0.72);
    gl_FragColor = vec4(waterTint + shine + shadow, alpha);
}`

  function shader(type: number, src: string) {
    const s = gl2.createShader(type)
    if (!s) throw new Error('Unable to create shader')
    gl2.shaderSource(s, src)
    gl2.compileShader(s)
    if (!gl2.getShaderParameter(s, gl2.COMPILE_STATUS)) {
      throw new Error(gl2.getShaderInfoLog(s) || 'Shader compile failed')
    }
    return s
  }

  const prog = gl2.createProgram()
  if (!prog) return
  gl2.attachShader(prog, shader(gl2.VERTEX_SHADER, vsh))
  gl2.attachShader(prog, shader(gl2.FRAGMENT_SHADER, fsh))
  gl2.linkProgram(prog)
  if (!gl2.getProgramParameter(prog, gl2.LINK_STATUS)) return
  gl2.useProgram(prog)

  const buf = gl2.createBuffer()
  gl2.bindBuffer(gl2.ARRAY_BUFFER, buf)
  gl2.bufferData(gl2.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl2.STATIC_DRAW)
  const loc = gl2.getAttribLocation(prog, 'aPos')
  gl2.enableVertexAttribArray(loc)
  gl2.vertexAttribPointer(loc, 2, gl2.FLOAT, false, 0, 0)

  const uni = {
    uSim: gl2.getUniformLocation(prog, 'uSim'),
    uTexel: gl2.getUniformLocation(prog, 'uTexel'),
    uTime: gl2.getUniformLocation(prog, 'uTime'),
    uLight: gl2.getUniformLocation(prog, 'uLight'),
    uRefr: gl2.getUniformLocation(prog, 'uRefr'),
  }
  gl2.uniform1i(uni.uSim, 0)
  gl2.pixelStorei(gl2.UNPACK_ALIGNMENT, 1)
  gl2.enable(gl2.BLEND)
  gl2.blendFunc(gl2.SRC_ALPHA, gl2.ONE_MINUS_SRC_ALPHA)
  gl2.clearColor(0, 0, 0, 0)

  function allocSim() {
    NY = Math.max(90, Math.min(288, Math.round((NX * H) / W)))
    u = new Float32Array(NX * NY)
    uPrev = new Float32Array(NX * NY)
    simBytes = new Uint8Array(NX * NY)
    simBytes.fill(128)
  }

  function setupSimTexture() {
    if (texSim) gl2.deleteTexture(texSim)
    texSim = gl2.createTexture()
    gl2.activeTexture(gl2.TEXTURE0)
    gl2.bindTexture(gl2.TEXTURE_2D, texSim)
    gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.LUMINANCE, NX, NY, 0, gl2.LUMINANCE, gl2.UNSIGNED_BYTE, simBytes)
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE)
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE)
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR)
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR)
  }

  function drop(gx: number, gy: number, radius: number, strength: number) {
    const r2 = radius * radius
    const x0 = Math.max(1, Math.floor(gx - radius))
    const x1 = Math.min(NX - 2, Math.ceil(gx + radius))
    const y0 = Math.max(1, Math.floor(gy - radius))
    const y1 = Math.min(NY - 2, Math.ceil(gy + radius))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - gx
        const dy = y - gy
        const d2 = dx * dx + dy * dy
        if (d2 < r2) {
          const k = Math.cos((Math.sqrt(d2) / radius) * Math.PI * 0.5)
          u[y * NX + x] += strength * k * k
        }
      }
    }
  }

  function stepWater() {
    const damp = 0.979
    for (let y = 1; y < NY - 1; y++) {
      const row = y * NX
      for (let x = 1; x < NX - 1; x++) {
        const i = row + x
        const v = (u[i - 1] + u[i + 1] + u[i - NX] + u[i + NX]) * 0.5 - uPrev[i]
        uPrev[i] = v * damp
      }
    }
    const t = u
    u = uPrev
    uPrev = t
  }

  function packSim() {
    for (let i = 0; i < u.length; i++) {
      const v = 128 + u[i] * 26
      simBytes[i] = v < 1 ? 1 : v > 254 ? 254 : v
    }
  }



  function touchWater(px: number, py: number, big: boolean) {
    const gx = (px / W) * NX
    const gy = (py / H) * NY
    if (big) {
      drop(gx, gy, 6, 2.2 * params.ripple)
    } else {
      drop(gx, gy, 2.4, 0.45 * params.ripple)
    }
  }

  function layout() {
    W = window.innerWidth
    H = window.innerHeight
    canvasGl.width = Math.round(W * DPR)
    canvasGl.height = Math.round(H * DPR)
    allocSim()
    setupSimTexture()
    gl2.viewport(0, 0, canvasGl.width, canvasGl.height)
    gl2.uniform2f(uni.uTexel, 1 / NX, 1 / NY)
  }

  function onPointerMove(e: PointerEvent) {
    if (lastMx >= 0) {
      const dist = Math.hypot(e.clientX - lastMx, e.clientY - lastMy)
      if (dist > 2) touchWater(e.clientX, e.clientY, false)
    }
    lastMx = e.clientX
    lastMy = e.clientY
  }

  function onPointerDown(e: PointerEvent) {
    touchWater(e.clientX, e.clientY, true)
  }

  function onPointerLeave() {
    lastMx = -1
    lastMy = -1
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - lastT) / 1000)
    lastT = now
    const t = now / 1000

    breathT -= dt
    if (breathT <= 0) {
      breathT = 0.4 + Math.random() * 1.3
      drop(2 + Math.random() * (NX - 4), 2 + Math.random() * (NY - 4), 2, 0.14)
    }

    stepWater()
    packSim()

    gl2.clear(gl2.COLOR_BUFFER_BIT)
    gl2.activeTexture(gl2.TEXTURE0)
    gl2.bindTexture(gl2.TEXTURE_2D, texSim)
    gl2.texSubImage2D(gl2.TEXTURE_2D, 0, 0, 0, NX, NY, gl2.LUMINANCE, gl2.UNSIGNED_BYTE, simBytes)
    gl2.uniform1f(uni.uRefr, 1)
    gl2.uniform1f(uni.uLight, params.light)
    gl2.uniform1f(uni.uTime, t)
    gl2.drawArrays(gl2.TRIANGLE_STRIP, 0, 4)

    raf = requestAnimationFrame(frame)
  }

  layout()
  window.addEventListener('resize', layout)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerdown', onPointerDown, { passive: true })
  window.addEventListener('pointerleave', onPointerLeave)
  raf = requestAnimationFrame(frame)

  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', layout)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointerleave', onPointerLeave)
    if (texSim) gl2.deleteTexture(texSim)
  })
})
</script>

<template>
  <HelloWorld />
  <div class="fluid-overlay" aria-hidden="true">
    <canvas ref="glCanvas"></canvas>
  </div>
</template>

<style scoped>
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

