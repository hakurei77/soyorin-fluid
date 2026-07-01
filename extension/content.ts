import { createWaterRipple, type WaterRippleOptions } from '../src/lib/waterRipple'

type RippleOptions = Required<WaterRippleOptions>


type StorageChange<T> = {
  newValue?: T
  oldValue?: T
}

declare const chrome: {
  storage: {
    sync: {
      get(key: string): Promise<Record<string, Partial<RippleOptions> | undefined>>
    }
    onChanged: {
      addListener(
        callback: (changes: Record<string, StorageChange<Partial<RippleOptions>>>, areaName: string) => void,
      ): void
    }
  }
}

const canvasId = 'soyorin-fluid-canvas'
const storageKey = 'options'

const defaultOptions: RippleOptions = {
  light: 1,
  moveRipple: 0.04,
  clickRipple: 0.8,
  spreadSpeed: 0.5,
  maxDevicePixelRatio: 2,
  gridWidth: 160,
}



let options: RippleOptions = { ...defaultOptions }
let ripple: ReturnType<typeof createWaterRipple> = null

function loadOptions() {
  return chrome.storage.sync.get(storageKey).then((result) => {
    options = { ...defaultOptions, ...result[storageKey] }
  })
}

function mountWaterRipple() {
  let canvas = document.getElementById(canvasId) as HTMLCanvasElement | null

  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.id = canvasId
    document.documentElement.appendChild(canvas)
  }

  ripple?.destroy()
  ripple = createWaterRipple(canvas, options)
}

function destroyWaterRipple() {
  ripple?.destroy()
  ripple = null
  document.getElementById(canvasId)?.remove()
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync' || !changes[storageKey]) return

  options = { ...defaultOptions, ...changes[storageKey].newValue }
  mountWaterRipple()
})

void loadOptions().then(mountWaterRipple)
window.addEventListener('beforeunload', destroyWaterRipple)

