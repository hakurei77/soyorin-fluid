export interface WaterRippleOptions {
  light?: number
  moveRipple?: number
  clickRipple?: number
  maxDevicePixelRatio?: number
  gridWidth?: number
}

export interface WaterRippleEffect {
  resize: () => void
  destroy: () => void
}

const vertexShader = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const fragmentShader = `
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

  vec3 waterTint = vec3(0.0, 0.0, 0.0) * (ring * 0.2 + pool * 0.02 * uLight);
  vec3 shadow = vec3(0.0, 0.0, 0.0) * (trough * 0.72 + ring * 0.22);
  vec3 shine = vec3(1.0, 1.0, 1.0) * (spec * 0.95 + band * 0.045 * uLight + pool * 0.045 * uLight);
  float alpha = clamp(0.025 + ring * 0.22 + spec * 0.34 + trough * 0.24 + band * 0.02 + pool * 0.02, 0.0, 0.52);
  gl_FragColor = vec4(waterTint + shine + shadow, alpha);
}`

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create shader')

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Shader compile failed'
    gl.deleteShader(shader)
    throw new Error(message)
  }

  return shader
}

export function createWaterRipple(canvas: HTMLCanvasElement, options: WaterRippleOptions = {}): WaterRippleEffect | null {
  const glContext = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: false,
  }) as WebGLRenderingContext | null

  if (!glContext) return null

  const gl = glContext

  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, options.maxDevicePixelRatio ?? 2)
  const nx = options.gridWidth ?? 160
  const params = {
    light: options.light ?? 1,
    moveRipple: options.moveRipple ?? 0.6,
    clickRipple: options.clickRipple ?? 0.3,
  }

  let width = 1
  let height = 1
  let ny = 160
  let u = new Float32Array(nx * ny)
  let uPrev = new Float32Array(nx * ny)
  let simBytes = new Uint8Array(nx * ny)
  let simTexture: WebGLTexture | null = null
  let raf = 0
  let lastTime = performance.now()
  let breathTime = 0
  let lastPointerX = -1
  let lastPointerY = -1
  let destroyed = false

  const program = gl.createProgram()
  if (!program) return null

  const vShader = compileShader(gl, gl.VERTEX_SHADER, vertexShader)
  const fShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader)
  gl.attachShader(program, vShader)
  gl.attachShader(program, fShader)
  gl.linkProgram(program)
  gl.deleteShader(vShader)
  gl.deleteShader(fShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }

  gl.useProgram(program)

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

  const positionLocation = gl.getAttribLocation(program, 'aPos')
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

  const uniforms = {
    uSim: gl.getUniformLocation(program, 'uSim'),
    uTexel: gl.getUniformLocation(program, 'uTexel'),
    uTime: gl.getUniformLocation(program, 'uTime'),
    uLight: gl.getUniformLocation(program, 'uLight'),
    uRefr: gl.getUniformLocation(program, 'uRefr'),
  }

  gl.uniform1i(uniforms.uSim, 0)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.clearColor(0, 0, 0, 0)

  function allocSim() {
    ny = Math.max(90, Math.min(288, Math.round((nx * height) / width)))
    u = new Float32Array(nx * ny)
    uPrev = new Float32Array(nx * ny)
    simBytes = new Uint8Array(nx * ny)
    simBytes.fill(128)
  }

  function setupSimTexture() {
    if (simTexture) gl.deleteTexture(simTexture)
    simTexture = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, simTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, nx, ny, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, simBytes)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  }

  function drop(gx: number, gy: number, radius: number, strength: number) {
    const r2 = radius * radius
    const x0 = Math.max(1, Math.floor(gx - radius))
    const x1 = Math.min(nx - 2, Math.ceil(gx + radius))
    const y0 = Math.max(1, Math.floor(gy - radius))
    const y1 = Math.min(ny - 2, Math.ceil(gy + radius))

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - gx
        const dy = y - gy
        const d2 = dx * dx + dy * dy

        if (d2 < r2) {
          const k = Math.cos((Math.sqrt(d2) / radius) * Math.PI * 0.5)
          u[y * nx + x] += strength * k * k
        }
      }
    }
  }

  function stepWater() {
    const damp = 0.979
    for (let y = 1; y < ny - 1; y++) {
      const row = y * nx
      for (let x = 1; x < nx - 1; x++) {
        const i = row + x
        const value = (u[i - 1] + u[i + 1] + u[i - nx] + u[i + nx]) * 0.5 - uPrev[i]
        uPrev[i] = value * damp
      }
    }

    const t = u
    u = uPrev
    uPrev = t
  }

  function packSim() {
    for (let i = 0; i < u.length; i++) {
      const value = 128 + u[i] * 26
      simBytes[i] = value < 1 ? 1 : value > 254 ? 254 : value
    }
  }

  function touchWater(px: number, py: number, big: boolean) {
    if (px < 0 || py < 0 || px > width || py > height) return

    const gx = (px / width) * nx
    const gy = (py / height) * ny

    if (big) {
      drop(gx, gy, 6, 2.2 * params.clickRipple)
    } else {
      drop(gx, gy, 2.8, 0.75 * params.moveRipple)
    }
  }

  function touchWaterLine(x0: number, y0: number, x1: number, y1: number) {
    const dist = Math.hypot(x1 - x0, y1 - y0)
    if (dist <= 1) return

    const step = Math.max(4, Math.min(width, height) / 120)
    const count = Math.max(1, Math.ceil(dist / step))

    for (let i = 1; i <= count; i++) {
      const t = i / count
      touchWater(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, false)
    }
  }

  function resize() {
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = Math.round(width * devicePixelRatio)
    canvas.height = Math.round(height * devicePixelRatio)
    allocSim()
    setupSimTexture()
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(uniforms.uTexel, 1 / nx, 1 / ny)
  }

  function movePointer(x: number, y: number) {
    if (lastPointerX >= 0) {
      touchWaterLine(lastPointerX, lastPointerY, x, y)
    } else {
      touchWater(x, y, false)
    }

    lastPointerX = x
    lastPointerY = y
  }

  function onPointerMove(event: PointerEvent) {
    const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event]
    for (const item of events) movePointer(item.clientX, item.clientY)
  }

  function onPointerDown(event: PointerEvent) {
    lastPointerX = event.clientX
    lastPointerY = event.clientY
    touchWater(event.clientX, event.clientY, true)
  }

  function onTouchMove(event: TouchEvent) {
    const touch = event.touches[0]
    if (touch) movePointer(touch.clientX, touch.clientY)
  }

  function onTouchStart(event: TouchEvent) {
    const touch = event.touches[0]
    if (!touch) return

    lastPointerX = touch.clientX
    lastPointerY = touch.clientY
    touchWater(touch.clientX, touch.clientY, true)
  }

  function onPointerLeave() {
    lastPointerX = -1
    lastPointerY = -1
  }

  function frame(now: number) {
    if (destroyed) return

    const dt = Math.min(0.05, (now - lastTime) / 1000)
    lastTime = now
    const time = now / 1000

    breathTime -= dt
    if (breathTime <= 0) {
      breathTime = 0.4 + Math.random() * 1.3
      drop(2 + Math.random() * (nx - 4), 2 + Math.random() * (ny - 4), 2, 0.14)
    }

    stepWater()
    packSim()

    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, simTexture)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, ny, gl.LUMINANCE, gl.UNSIGNED_BYTE, simBytes)
    gl.uniform1f(uniforms.uRefr, 1)
    gl.uniform1f(uniforms.uLight, params.light)
    gl.uniform1f(uniforms.uTime, time)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    raf = requestAnimationFrame(frame)
  }

  function destroy() {
    if (destroyed) return

    destroyed = true
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchstart', onTouchStart)
    window.removeEventListener('pointerleave', onPointerLeave)
    window.removeEventListener('pointerup', onPointerLeave)
    window.removeEventListener('touchend', onPointerLeave)
    window.removeEventListener('touchcancel', onPointerLeave)

    if (simTexture) gl.deleteTexture(simTexture)
    if (buffer) gl.deleteBuffer(buffer)
    gl.deleteProgram(program)
  }

  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerdown', onPointerDown, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: true })
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('pointerup', onPointerLeave)
  window.addEventListener('touchend', onPointerLeave)
  window.addEventListener('touchcancel', onPointerLeave)
  raf = requestAnimationFrame(frame)

  return {
    resize,
    destroy,
  }
}
