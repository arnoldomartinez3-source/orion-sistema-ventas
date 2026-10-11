// Las 6 funciones sin cors:true no se pueden llamar desde localhost con fetch (CORS); se llaman desde Node con el token de la sesión.
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
import path from 'node:path'
const ctx = await chromium.launchPersistentContext((process.env.ORION_PERFIL || 'C:/Users/geova/.orion-pruebas/chrome-profile'), { channel: 'chrome', headless: true })
const page = ctx.pages()[0] || await ctx.newPage()
for (let i = 0; i < 20; i++) { try { await page.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 15000 }); break } catch { await page.waitForTimeout(2000) } }
await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(1500)
const token = await page.evaluate(async () => { const { auth } = await import('/src/firebase.js'); return auth.currentUser.getIdToken() })
await ctx.close()
const pruebas = [
  ['transmitir', '/api/dte/transmitir', { ping: true, ambiente: '00' }],
  ['invalidar', '/api/dte/invalidar', { prueba: true }],
  ['contingencia', '/api/dte/contingencia', { prueba: true }],
  ['extraerProductos', '/api/dte/extraer-productos', { prueba: true }],
  ['leerEtiqueta', '/api/leer-etiqueta', { capturaId: 'no-existe' }],
  ['catalogoAportar', '/api/catalogo-aportar', { prueba: true }],
]
for (const [fn, ruta, body] of pruebas) {
  const t0 = Date.now()
  const r = await fetch('https://app.orionsv.net' + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) })
  const txt = (await r.text()).replace(/\s+/g, ' ')
  const ok = r.status < 500 && txt.trim().startsWith('{')
  console.log(`${ok ? 'OK ' : 'REVISAR'} ${fn.padEnd(18)} ${String(r.status).padEnd(4)} ${String(Date.now() - t0).padStart(5)} ms  ${txt.slice(0, 120)}`)
}
