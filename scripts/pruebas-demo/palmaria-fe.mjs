// PALMARIA (AND-1930, ambiente 00): iniciar sesión con el admin de la empresa y emitir una FE desde la caja.
// Credenciales SOLO por variables de entorno (ORION_USER / ORION_PASS); perfil de Chrome aparte.
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
const PERFIL = process.env.ORION_PERFIL || 'C:/Users/geova/.orion-pruebas/chrome-palmaria'
const SUCURSAL = process.env.SUCURSAL || 'MULTIPLAZA'
const ctx = await chromium.launchPersistentContext(PERFIL, { channel: 'chrome', headless: false, viewport: { width: 1366, height: 800 } })
const page = ctx.pages()[0] || await ctx.newPage()
const errores = []; page.on('pageerror', e => errores.push(e.message))
page.on('response', async r => { if (r.url().includes('/api/dte/')) console.log(r.url().split('/api/')[1], '→', r.status(), (await r.text().catch(() => '')).slice(0, 400)) })
for (let i = 0; i < 20; i++) { try { await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 15000 }); break } catch { await page.waitForTimeout(1500) } }
await page.waitForTimeout(3500)
if (await page.locator('.login-form').count()) {
  if (!process.env.ORION_USER || !process.env.ORION_PASS) throw new Error('Faltan ORION_USER / ORION_PASS')
  await page.locator('.login-form input').first().fill(process.env.ORION_USER)
  await page.locator('.login-form input[type="password"]').first().fill(process.env.ORION_PASS)
  await page.locator('.btn-login').click()
  await page.waitForTimeout(5000)
}
// selector de sucursal
const opcion = page.locator('div', { hasText: new RegExp('^' + SUCURSAL + '$') }).first()
if (await page.locator('.sidebar').count() === 0 && await opcion.isVisible().catch(() => false)) { await opcion.click(); await page.waitForTimeout(300); await page.locator('button.btn-primary').last().click(); await page.waitForTimeout(1500) }
await page.locator('.sidebar').first().waitFor({ timeout: 30000 })
console.log('sesión OK, sucursal:', await page.evaluate(() => sessionStorage.getItem('orion_sucursal_activa')))
if (process.env.SOLO_LOGIN) { await ctx.close(); process.exit(0) }
await page.goto('http://localhost:5173/ventas', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000)
console.log('sucursal en caja:', await page.evaluate(() => sessionStorage.getItem('orion_sucursal_activa')))
await page.locator('input[placeholder*="Buscar producto"]').first().fill(process.env.PRODUCTO || 'Piña lisa'); await page.waitForTimeout(700)
await page.locator('.producto-card').first().click(); await page.waitForTimeout(400)
await page.locator('.btn-cobrar').first().click(); await page.waitForTimeout(800)
if (await page.locator('button:has-text("Confirmar Cobro")').count() === 0) { await page.keyboard.press('Enter'); await page.waitForTimeout(600) }
const ex = page.locator('.cm-bill-exacto'); if (await ex.count()) await ex.first().click(); else await page.locator('input[placeholder="0.00"]').first().fill('100'); await page.waitForTimeout(400)
await page.locator('button:has-text("Confirmar Cobro")').first().click()
await page.locator('.vc-vuelto, .venta-completada, .modal-overlay').first().waitFor({ timeout: 120000 })
await page.waitForTimeout(4000)
const texto = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
const m = texto.match(/(DTE-\d{2}-[A-Z0-9]{8}-\d{15})/); console.log('número:', m ? m[1] : '(no visible)')
console.log('sello/estado visible:', /PROCESADO|Sello|sello/i.test(texto) ? 'sí' : 'no', '| contingencia:', /contingencia/i.test(texto) ? 'SÍ' : 'no')
await page.screenshot({ path: 'shots-pc/palmaria-fe.png' })
console.log('errores:', errores.length ? errores : 'ninguno')
await ctx.close()
