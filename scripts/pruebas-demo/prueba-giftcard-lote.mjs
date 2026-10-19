// Gift cards etapa 3 en DEMO: lote de códigos sin vender → etiquetas → activar una al cobrar → una sin vender no canjea.
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const ctx = await chromium.launchPersistentContext((process.env.ORION_PERFIL || 'C:/Users/geova/.orion-pruebas/chrome-profile'), { channel: 'chrome', headless: true, viewport: { width: 1366, height: 800 } })
const page = ctx.pages()[0] || await ctx.newPage()
const errores = []; page.on('pageerror', e => errores.push(e.message))
const shots = 'C:/Users/geova/AppData/Local/Temp/claude/c--Users-geova-mi-sistema-ventas/4ff72822-8b12-4fce-85ac-88cd91930701/scratchpad/gcl-'
const log = (...a) => console.log(...a)
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(2500)
await page.evaluate(() => { window.print = () => {} })
await page.locator('.sidebar :text("Gift cards")').first().click(); await page.waitForTimeout(2000)

// 1) Generar lote de 3 a $25
await page.locator('button:has-text("Generar lote")').click(); await page.waitForTimeout(400)
await page.locator('.modal input[type="number"]').first().fill('3')
await page.locator('.modal input[placeholder*="Vacío"]').fill('25')
await page.locator('.modal input[placeholder*="Navidad"]').fill('Prueba lote')
await page.screenshot({ path: shots + '1-modal-lote.png' })
await page.locator('.modal button:has-text("Generar lote")').click(); await page.waitForTimeout(3000)
log('aviso:', (await page.locator('body').innerText()).match(/tarjetas del lote [^\n]*/)?.[0] || '(sin aviso)')
await page.locator('.modal-overlay button:has-text("Entendido"), .modal-overlay button:has-text("Aceptar"), .modal-overlay button:has-text("OK")').first().click().catch(() => {})
await page.waitForTimeout(800)
await page.screenshot({ path: shots + '2-sin-vender.png' })
const codigos = await page.locator('.gc-lista .gc-item .cod').allInnerTexts()
log('sin vender:', codigos.map(c => c.split(' ')[0]).join(', '))
const codigo = codigos[0].split(' ')[0]

// 2) Etiquetas del lote → capturar HTML del iframe y renderizar
await page.locator('button:has-text("Imprimir etiquetas (")').first().click(); await page.waitForTimeout(2500)
const html = await page.evaluate(() => { const f = [...document.querySelectorAll('iframe')].pop(); return f?.contentDocument?.documentElement?.outerHTML || '' })
log('etiquetas html:', html.length, 'chars,', (html.match(/class="et"/g) || []).length, 'etiquetas')
fs.writeFileSync(shots + 'etiquetas.html', html)

// 3) Canjear una sin vender en el POS → debe rechazar
await page.locator('.sidebar :text("Punto de Venta")').first().click(); await page.waitForTimeout(2500)
await page.locator('input[placeholder*="Buscar producto"]').first().fill('TORNILLO GALVANIZADO'); await page.waitForTimeout(600)
await page.locator('.producto-card:not(.agotado)').first().click(); await page.waitForTimeout(400)
await page.locator('.btn-cobrar').first().click(); await page.waitForTimeout(700)
if (await page.locator('button:has-text("Confirmar Cobro")').count() === 0) { await page.keyboard.press('Enter'); await page.waitForTimeout(700) }
await page.locator('input[placeholder*="GC-"]').fill(codigo)
await page.locator('button:has-text("Aplicar")').first().click(); await page.waitForTimeout(2000)
log('sin vender en POS:', (await page.locator('body').innerText()).match(/todavía no se ha vendido[^\n]*/)?.[0] || '(no avisó)')
await page.locator('.modal-overlay button:has-text("Entendido"), .modal-overlay button:has-text("Aceptar"), .modal-overlay button:has-text("OK")').first().click().catch(() => {})
// salir del cobro recargando (el carrito con el tornillo se descarta en la pantalla)
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(2000)
await page.evaluate(() => { window.print = () => {} })

// 4) Vender (activar) esa tarjeta desde Gift cards escaneando el código, sin escribir monto
await page.locator('.sidebar :text("Gift cards")').first().click(); await page.waitForTimeout(2000)
await page.locator('button:has-text("🗑️")').first().click().catch(() => {})
await page.locator('input[placeholder*="Quien la recibe"]').fill('Cliente Lote')
await page.locator('input[placeholder*="Escaneá o escribí"]').fill(codigo)
await page.locator('button:has-text("Cobrar en la caja")').first().click()
await page.waitForURL('**/ventas', { timeout: 15000 }); await page.waitForTimeout(1500)
log('línea:', (await page.locator('body').innerText()).match(/Gift card \$[^\n]*/)?.[0])
await page.locator('.btn-cobrar').first().click(); await page.waitForTimeout(700)
if (await page.locator('button:has-text("Confirmar Cobro")').count() === 0) { await page.keyboard.press('Enter'); await page.waitForTimeout(700) }
await page.locator('.cm-bill', { hasText: 'Exacto' }).first().click().catch(() => {})
await page.locator('button:has-text("Confirmar Cobro")').first().click()
await page.locator('.cm-gift-on .mono').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(800)
log('ACTIVADA:', (await page.locator('.cm-gift').first().innerText()).replace(/\s+/g, ' ').slice(0, 160))
await page.screenshot({ path: shots + '3-activada.png' })
await page.locator('.vc-nueva').first().click(); await page.waitForTimeout(600)

// 5) Lista: ahora activa con saldo $25; las otras dos siguen sin vender
await page.locator('.sidebar :text("Gift cards")').first().click(); await page.waitForTimeout(2000)
await page.locator('input[placeholder*="Buscar código"]').fill(codigo); await page.waitForTimeout(500)
log('activa en lista:', (await page.locator('.gc-item').first().innerText()).replace(/\s+/g, ' ').slice(0, 200))
await page.locator('button:text-is("Sin vender")').click(); await page.locator('input[placeholder*="Buscar código"]').fill(''); await page.waitForTimeout(500)
log('quedan sin vender:', await page.locator('.gc-lista .gc-item').count())
await page.screenshot({ path: shots + '4-lista.png' })
log('errores:', errores.length ? errores : 'ninguno')
await ctx.close()
