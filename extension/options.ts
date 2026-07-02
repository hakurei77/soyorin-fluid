import type { WaterRippleOptions } from '../src/lib/waterRipple'

export const storageKey = 'options'

export type RippleOptions = Required<WaterRippleOptions>

export const defaultOptions: RippleOptions = {
  light: 1,
  moveRipple: 0.04,
  clickRipple: 0.2,
  spreadSpeed: 0.5,
  maxDevicePixelRatio: 2,
  gridWidth: 160,
}
