import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Identificador de ESTA publicación. Va dentro del código (__VERSION_ORION__) y en
// dist/version.json; la app compara los dos para avisar que hay una versión nueva
// (componente AvisoActualizacion) sin que el cliente tenga que saber cuándo dar F5.
const VERSION_ORION = new Date().toISOString()

const versionJson = () => ({
  name: 'orion-version-json',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION_ORION }) })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionJson()],
  define: {
    __VERSION_ORION__: JSON.stringify(VERSION_ORION),
  },
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
