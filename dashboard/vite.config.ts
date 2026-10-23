import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Fixed port: the backend only allows this origin through CORS.
  server: { port: 5173, strictPort: true },
})
