import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Solo en desarrollo: las llamadas /api/... (Cloud Functions) se reenvían al sitio
    // publicado, que las redirige a las funciones. Así el servidor local puede probar
    // login de empleado, transmitir, etc. En producción esto no se usa.
    proxy: {
      '/api': {
        target: 'https://app.orionsv.net',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
