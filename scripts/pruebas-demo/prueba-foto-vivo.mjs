// Prueba en vivo del módulo foto: abre Producto nuevo con QR en pantalla y espera a que el teléfono mande la foto.
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
import path from 'node:path'
import fs from 'node:fs'
const ctx = await chromium.launchPersistentContext((process.env.ORION_PERFIL || 'C:/Users/geova/.orion-pruebas/chrome-profile'), { channel: 'chrome', headless: false, viewport: { width: 1366, height: 900 } })
const page = ctx.pages()[0] || await ctx.newPage()
const errores = []; page.on('pageerror', e => errores.push(e.message))
const esperar = (ms) => page.waitForTimeout(ms)
const log = (...a) => { console.log(...a); fs.appendFileSync('foto-vivo.log', a.join(' ') + '\n') }
fs.writeFileSync('foto-vivo.log', '')

// módulo activo en DEMO?
await page.goto('http://localhost:5173/', { waitUntil: 'load' })
await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await esperar(2500)
const mod = await page.evaluate(async () => {
  const { db, auth } = await import('/src/firebase.js')
  const fs = await import(performance.getEntriesByType('resource').map(e => e.name).find(x => x.includes('/.vite/deps/firebase_firestore.js')))
  const u = await fs.getDoc(fs.doc(db, 'usuarios', auth.currentUser.uid)); const e = await fs.getDoc(fs.doc(db, 'empresas', u.data().empresaId))
  return { empresa: e.data()?.nombre, foto_captura: e.data()?.modulos?.foto_captura === true }
})
log('[0] módulo:', JSON.stringify(mod))
if (!mod.foto_captura) { log('El módulo NO está activo en DEMO todavía.'); await ctx.close(); process.exit(0) }

// encender la opción de productos nuevos en caja
await page.goto('http://localhost:5173/config?seccion=pos', { waitUntil: 'load' })
await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await esperar(2500)
const sw = page.locator('[aria-label="Agregar productos nuevos desde la caja"]').first()
if ((await sw.getAttribute('aria-checked')) !== 'true') { await sw.click(); await esperar(300); await page.locator('button:has-text("Guardar")').first().click(); await esperar(2500); await page.keyboard.press('Enter').catch(() => {}) }

await page.goto('http://localhost:5173/ventas', { waitUntil: 'load' })
await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await esperar(3500)
const buscar = page.locator('input[placeholder*="Buscar producto"]').first()
await buscar.click(); await page.keyboard.type('7411602705331', { delay: 5 }); await page.keyboard.press('Enter'); await esperar(4000) // Salutaris toronjada: no está en DEMO ni en la base pública
const modal = page.locator('.modal', { hasText: 'Producto nuevo' })
log('[1] ventana:', await modal.count(), '| QR:', await modal.locator('img[alt*="QR"]').count(), '| estado:', (await modal.locator('.pn-foto').innerText().catch(() => '')).replace(/\s+/g, ' '))
await page.screenshot({ path: 'shots-pc/foto-vivo-1.png' })
await page.bringToFront()
log('>>> Escanea el QR de la pantalla con el teléfono y toma la foto. Espero hasta 10 minutos…')
const t0 = Date.now(); let ultimo = ''
while (Date.now() - t0 < 10 * 60 * 1000) {
  const est = (await modal.locator('.pn-foto').innerText().catch(() => '')).replace(/\s+/g, ' ')
  const nombre = await modal.locator('input').first().inputValue().catch(() => '')
  const linea = est + ' | nombre: ' + nombre
  if (linea !== ultimo) { log(new Date().toLocaleTimeString(), linea); ultimo = linea }
  if (/Nombre leído|No se pudo/.test(est)) break
  await esperar(2000)
}
await page.screenshot({ path: 'shots-pc/foto-vivo-2.png' })
log('[2] final:', ultimo, '| errores:', errores.length ? errores.join(' / ') : 'ninguno')
log('La ventana queda abierta 60 s más para que la veas; luego se cierra sin guardar.')
await esperar(60000)
await page.keyboard.press('Escape').catch(() => {})
await ctx.close()
