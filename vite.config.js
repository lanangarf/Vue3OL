import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Izinkan import file .geojson dan .json besar
  assetsInclude: ['**/*.geojson'],

  build: {
    assetsInlineLimit: 0,      
    chunkSizeWarningLimit: 50000, 
  },
})