import { defaultOptions, storageKey, type RippleOptions } from './options'

type SliderConfig = {
  key: keyof RippleOptions
  label: string
  min: number
  max: number
  step: number
}

const sliders: SliderConfig[] = [
  { key: 'light', label: '高光', min: 0, max: 2, step: 0.1 },
  { key: 'moveRipple', label: '移动水波', min: 0, max: 1, step: 0.01 },
  { key: 'clickRipple', label: '点击水波', min: 0, max: 2, step: 0.1 },
  { key: 'spreadSpeed', label: '扩散速度', min: 0.1, max: 4, step: 0.1 },
  { key: 'maxDevicePixelRatio', label: '清晰度', min: 1, max: 3, step: 0.1 },
  { key: 'gridWidth', label: '细腻度', min: 80, max: 260, step: 10 },
]

const controls = document.getElementById('controls')
const reset = document.getElementById('reset') as HTMLButtonElement | null
let options: RippleOptions = { ...defaultOptions }

function loadOptions() {
  return chrome.storage.sync.get(storageKey).then((result) => {
    options = { ...defaultOptions, ...result[storageKey] }
  })
}

function saveOptions() {
  return chrome.storage.sync.set({ [storageKey]: options })
}

function createSlider(config: SliderConfig) {
  const row = document.createElement('label')
  row.className = 'control'

  const label = document.createElement('span')
  label.textContent = config.label

  const value = document.createElement('output')
  value.textContent = String(options[config.key])

  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(config.min)
  input.max = String(config.max)
  input.step = String(config.step)
  input.value = String(options[config.key])

  input.addEventListener('input', () => {
    options = { ...options, [config.key]: Number(input.value) }
    value.textContent = input.value
    void saveOptions()
  })

  row.append(label, input, value)
  return row
}

function render() {
  if (!controls) return

  controls.replaceChildren(...sliders.map(createSlider))
}

reset?.addEventListener('click', () => {
  options = { ...defaultOptions }
  void saveOptions().then(render)
})

void loadOptions().then(render)

