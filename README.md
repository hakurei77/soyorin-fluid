# Soyorin Fluid

一个基于 `WebGL` 的轻量水波纹效果库，适合叠加在页面背景、封面、交互层或 Vue 组件中使用。

## 安装

```bash
npm install soyorin-fluid
```

## 基础用法

```ts
import { createWaterRipple } from 'soyorin-fluid'

const canvas = document.querySelector<HTMLCanvasElement>('#water-canvas')

if (canvas) {
  const waterRipple = createWaterRipple(canvas)

  // 不再使用时释放动画、事件和 WebGL 资源
  waterRipple?.destroy()
}
```

页面中需要准备一个 `canvas`：

```html
<canvas id="water-canvas"></canvas>
```

建议让 `canvas` 覆盖目标区域：

```css
#water-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
```

## Vue 3 中使用

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createWaterRipple, type WaterRippleEffect } from 'soyorin-fluid'

const canvasRef = ref<HTMLCanvasElement | null>(null)
let waterRipple: WaterRippleEffect | null = null

onMounted(() => {
  if (!canvasRef.value) return
  waterRipple = createWaterRipple(canvasRef.value)
})

onBeforeUnmount(() => {
  waterRipple?.destroy()
})
</script>

<template>
  <canvas ref="canvasRef"></canvas>
</template>
```

## 配置项

```ts
createWaterRipple(canvas, {
  light: 1,
  moveRipple: 0.6,
  clickRipple: 0.3,
  spreadSpeed: 1,
  maxDevicePixelRatio: 2,
  gridWidth: 160,
})
```

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `light` | `number` | `1` | 水波高光强度 |
| `moveRipple` | `number` | `0.6` | 指针移动产生的水波强度 |
| `clickRipple` | `number` | `0.3` | 点击产生的水波强度 |
| `spreadSpeed` | `number` | `1` | 水波扩散速度，值越大扩散越快 |
| `maxDevicePixelRatio` | `number` | `2` | 最大设备像素比，限制高清屏性能消耗 |
| `gridWidth` | `number` | `160` | 模拟网格宽度，越大越细腻但性能消耗越高 |

## API

### `createWaterRipple(canvas, options?)`

创建水波纹效果实例。

返回值：`WaterRippleEffect | null`

- 当浏览器不支持 `WebGL` 时返回 `null`
- 成功时返回实例对象

### `WaterRippleEffect`

```ts
interface WaterRippleEffect {
  resize: () => void
  destroy: () => void
}
```

- `resize()`：手动重新计算画布尺寸
- `destroy()`：销毁动画、事件监听和 WebGL 资源

## 浏览器插件

项目也提供 Chrome / Edge 浏览器插件构建入口，会在网页上注入全屏水波纹效果。

```bash
npm run build:extension
```

构建完成后打开浏览器扩展管理页：

1. Chrome 打开 `chrome://extensions/`，Edge 打开 `edge://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目下的 `extension-dist` 目录

## 发布到 npm

发布前先确认 `package.json` 中的 `name` 没有被占用，并按需修改 `version`。

```bash
npm login
npm run build
npm publish --access public
```

如果只是检查最终会发布哪些文件，可以先运行：

```bash
npm pack --dry-run
```
