import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue()
  ],
  base: './',
  build: {
    outDir: 'dist-web'
  },
  css: {
    preprocessorOptions: {
      scss: {}
    }
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
    open: false
  }
})
