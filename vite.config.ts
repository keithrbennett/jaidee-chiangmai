import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The Claude endpoint runs in server/index.js (port 8787) so the API key never reaches the browser.
    proxy: { '/api': 'http://localhost:8787' },
  },
})
