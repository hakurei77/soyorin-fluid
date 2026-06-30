import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/lib/waterRipple.ts',
      name: 'SoyorinFluid',
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      output: {
        exports: 'named',
      },
    },
  },
})
