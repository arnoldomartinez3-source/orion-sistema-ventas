// Venta real en DEMO + transmisión al MH de pruebas (00): el numeroControl debe ser el siguiente al último PROCESADO real.
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
import path from 'node:path'
const ctx = await chromium.launchPersistentContext((process.env.ORION_PERFIL || 'C:/Users/geova/.orion-pruebas/chrome-profile'), { channel: 'chrome', headless: true, viewport: { width: 1366, height: 800 } })
const page = ctx.pages()[0] || await ctx.newPage()
const errores = []; page.on('pageerror', e => errores.push(e.message))
for (let i = 0; i < 20; i++) { try { await page.goto('http://localhost:5173/ventas', { waitUntil: 'load', timeout: 15000 }); break } catch { await page.waitForTimeout(2000) } }
await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(3000)
const urlDe = (n) => `performance.getEntriesByType('resource').map(e => e.name).find(x => x.includes('/.vite/deps/${n}.js'))`
// 1) último numeroControl FE real (no demo) de mi empresa en ambiente 00
const antes = await page.evaluate(async () => {
  const { db, auth } = await import('/src/firebase.js')
  const fs = await import(performance.getEntriesByType('resource').map(e => e.name).find(x => x.includes('/.vite/deps/firebase_firestore.js')))
  const u = await fs.getDoc(fs.doc(db, 'usuarios', auth.currentUser.uid)); const empresaId = u.data().empresaId
  const e = await fs.getDoc(fs.doc(db, 'empresas', empresaId))
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'facturas'), fs.where('empresaId', '==', empresaId), fs.where('dte_estado', '==', 'PROCESADO')))
  const fe = snap.docs.map(d => d.data()).filter(f => !f.dte_demo && /^DTE-01-/.test(f.numeroControl || ''))
  fe.sort((a, b) => (a.numeroControl > b.numeroControl ? -1 : 1))
  return { empresaId, esDemo: e.data()?.esDemo === true, ambiente: e.data()?.mh_ambiente, totalFE: fe.length, ultimo: fe[0]?.numeroControl || null, ultimoSello: fe[0]?.dte_sello?.slice(0, 12) }
})
console.log('[antes]', JSON.stringify(antes))
// 2) venta en el POS
await page.locator('input[placeholder*="Buscar producto"]').first().fill('TORNILLO GALVANIZADO'); await page.waitForTimeout(600)
await page.locator('.producto-card:not(.agotado)').first().click(); await page.waitForTimeout(400)
await page.locator('.btn-cobrar').first().click(); await page.waitForTimeout(600)
if (await page.locator('button:has-text("Confirmar Cobro")').count() === 0) { await page.keyboard.press('Enter'); await page.waitForTimeout(600) }
await page.locator('.cm-bill', { hasText: '$5' }).first().click(); await page.waitForTimeout(300)
await page.locator('button:has-text("Confirmar Cobro")').first().click()
await page.locator('.vc-vuelto').waitFor({ timeout: 60000 }); await page.waitForTimeout(1500)
// 3) transmitir esa venta de verdad al MH de pruebas
const r = await page.evaluate(async () => {
  const { db, auth } = await import('/src/firebase.js')
  const fs = await import(performance.getEntriesByType('resource').map(e => e.name).find(x => x.includes('/.vite/deps/firebase_firestore.js')))
  const { postAutenticado } = await import('/src/utils/apiAuth.js')
  const u = await fs.getDoc(fs.doc(db, 'usuarios', auth.currentUser.uid)); const empresaId = u.data().empresaId
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'ventas'), fs.where('empresaId', '==', empresaId), fs.where('createdAt', '>=', hoy)))
  const ventas = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
  const v = ventas[0]
  const resp = await postAutenticado('/api/dte/transmitir', { ventaId: v.id, ambiente: '00' })
  const texto = await resp.text(); let data = {}; try { data = JSON.parse(texto) } catch { data = { crudo: texto.slice(0, 300) } }
  return { ventaId: v.id, total: v.total, estadoAntes: v.dte_estado, status: resp.status, numeroControl: data.numeroControl, sello: (data.selloRecibido || data.sello || '').slice(0, 12), estado: data.estado, error: data.error || data.mensaje, obs: data.observaciones }
})
console.log('[transmitir]', JSON.stringify(r))
console.log('errores:', errores.length ? errores : 'ninguno')
await ctx.close()
