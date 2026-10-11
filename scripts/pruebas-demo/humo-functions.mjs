// Prueba de humo tras actualizar firebase-admin/functions: cada endpoint /api/* debe ARRANCAR y responder JSON
// (aunque sea 400/403/404 por cuerpo incompleto). Un 500 o una respuesta HTML = la función no cargó.
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import path from 'node:path'
const fb = JSON.parse(fs.readFileSync('C:/Users/geova/mi-sistema-ventas/firebase.json', 'utf8'))
const hosting = Array.isArray(fb.hosting) ? fb.hosting[0] : fb.hosting
const rutas = hosting.rewrites.filter(r => r.function).map(r => ({ ruta: r.source, fn: r.function.functionId || r.function }))
const cuerpos = { '/api/dte/transmitir': { ping: true, ambiente: '00' }, '/api/dte/secretos-mh': { accion: 'leer', empresaId: 'x' } }
const ctx = await chromium.launchPersistentContext((process.env.ORION_PERFIL || 'C:/Users/geova/.orion-pruebas/chrome-profile'), { channel: 'chrome', headless: true, viewport: { width: 1366, height: 800 } })
const page = ctx.pages()[0] || await ctx.newPage()
for (let i = 0; i < 20; i++) { try { await page.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 15000 }); break } catch { await page.waitForTimeout(2000) } }
await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(2000)
const res = await page.evaluate(async ({ rutas, cuerpos }) => {
  const { auth } = await import('/src/firebase.js')
  const token = await auth.currentUser.getIdToken()
  const out = []
  for (const { ruta, fn } of rutas) {
    const t0 = performance.now()
    try {
      const r = await fetch('https://app.orionsv.net' + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(cuerpos[ruta] || { prueba: true }) })
      const txt = await r.text()
      out.push({ fn, ruta, status: r.status, ms: Math.round(performance.now() - t0), json: txt.trim().startsWith('{'), resp: txt.replace(/\s+/g, ' ').slice(0, 110) })
    } catch (e) { out.push({ fn, ruta, error: e.message }) }
  }
  return out
}, { rutas, cuerpos })
for (const r of res) console.log(`${(r.json && r.status < 500) ? 'OK ' : 'REVISAR'} ${r.fn.padEnd(18)} ${String(r.status).padEnd(4)} ${String(r.ms).padStart(5)} ms  ${r.resp || r.error}`)
await ctx.close()
