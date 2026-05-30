import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    open: true,
    allowedHosts: true, // This line allows the ngrok connection
    proxy: {
      '/api': {
        target: 'https://business-gap-finder.onrender.com',
        changeOrigin: true,
        secure: false
      },
    },
  },
})
