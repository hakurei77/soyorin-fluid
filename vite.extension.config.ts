import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: 'extension/public',
  build: {
    outDir: 'extension-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'extension/content.ts'),
        popup: resolve(__dirname, 'extension/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
})
