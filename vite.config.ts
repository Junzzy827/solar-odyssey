import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages はサブパス配信なので相対パスでビルドする
export default defineConfig({
  base: './',
  plugins: [react()],
})
