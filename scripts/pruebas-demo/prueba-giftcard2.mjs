// Gift cards etapa 2 en DEMO: código preimpreso, vencimiento, tarjeta digital (modal + descarga), código repetido rechazado.
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
const CODIGO = process.argv[2] || ('JOY-' + Date.now().toString(36).toUpperCase().slice(-5))
const ctx = await chromium.launchPersistentContext((process.env.ORION_PERFIL || 'C:/Users/geova/.orion-pruebas/chrome-profile'), { channel: 'chrome', headless: true, viewport: { width: 1366, height: 800 }, acceptDownloads: true })
const page = ctx.pages()[0] || await ctx.newPage()
const errores = []; page.on('pageerror', e => errores.push(e.message))
const shots = 'C:/Users/geova/AppData/Local/Temp/claude/c--Users-geova-mi-sistema-ventas/4ff72822-8b12-4fce-85ac-88cd91930701/scratchpad/gc2-'
const log = (...a) => console.log(...a)
const irA = async (txt) => { await page.locator('.sidebar :text("' + txt + '")').first().click(); await page.waitForTimeout(2000) }

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(2500)
await irA('Gift cards')
log('vigencia en página:', (await page.locator('body').innerText()).match(/Vigencia[^\n]*|Sin vencimiento[^\n]*/)?.[0])

// 1) Vender con código preimpreso
await page.locator('button:text-is("$25")').first().click()
await page.locator('input[placeholder*="Nombre de quien"]').fill('Cliente Tarjeta Física')
await page.locator('input[placeholder*="Escaneá o escribí"]').fill(CODIGO.toLowerCase())
await page.locator('button:has-text("Cobrar en la caja")').first().click()
await page.waitForURL('**/ventas', { timeout: 15000 }); await page.waitForTimeout(1500)
log('línea carrito:', (await page.locator('body').innerText()).match(/Gift card \$25[^\n]*/)?.[0])
await page.locator('.btn-cobrar').first().click(); await page.waitForTimeout(700)
if (await page.locator('button:has-text("Confirmar Cobro")').count() === 0) { await page.keyboard.press('Enter'); await page.waitForTimeout(700) }
await page.locator('.cm-bill', { hasText: 'Exacto' }).first().click().catch(() => page.locator('input[placeholder="0.00"]').first().fill('25'))
await page.waitForTimeout(300)
await page.locator('button:has-text("Confirmar Cobro")').first().click()
await page.locator('.cm-gift-on .mono').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(800)
log('EMITIDA:', (await page.locator('.cm-gift-on .mono').first().innerText()).trim(), '|', (await page.locator('.cm-gift').first().innerText()).replace(/\s+/g, ' ').slice(0, 140))
await page.screenshot({ path: shots + '1-emitida.png' })
// 2) Tarjeta digital desde la venta completada
await page.locator('button:has-text("Tarjeta digital")').first().click()
await page.locator('.modal img[alt="Gift card"]').waitFor({ timeout: 20000 }); await page.waitForTimeout(600)
await page.screenshot({ path: shots + '2-tarjeta-oro.png' })
await page.locator('.modal button:has-text("Rosa")').click(); await page.waitForTimeout(1200)
await page.screenshot({ path: shots + '3-tarjeta-rosa.png' })
const [descarga] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.locator('.modal button:has-text("Descargar imagen")').click()])
log('descarga:', descarga.suggestedFilename())
await descarga.saveAs(shots + 'descarga.png')
await page.locator('.modal button:has-text("Cerrar")').click(); await page.waitForTimeout(400)
await page.locator('.vc-nueva').first().click(); await page.waitForTimeout(800)

// 3) Mismo código otra vez → rechazado en la página
await irA('Gift cards')
await page.locator('button:text-is("$10")').first().click()
await page.locator('input[placeholder*="Escaneá o escribí"]').fill(CODIGO)
await page.locator('button:has-text("Cobrar en la caja")').first().click(); await page.waitForTimeout(2500)
log('repetido:', (await page.locator('body').innerText()).match(/ya está registrada[^\n]*/)?.[0] || '(no avisó)', '| url:', page.url())
await page.screenshot({ path: shots + '4-repetido.png' })
await page.locator('button:has-text("Entendido"), button:has-text("Aceptar"), button:has-text("OK")').first().click().catch(() => {})

// 4) Lista: la tarjeta con fecha de vencimiento y el modal desde la lista
await page.locator('input[placeholder*="Buscar código"]').fill(CODIGO); await page.waitForTimeout(600)
log('en lista:', (await page.locator('.gc-item').first().innerText()).replace(/\s+/g, ' ').slice(0, 200))
await page.locator('.gc-item').first().click(); await page.waitForTimeout(400)
await page.locator('.gc-item button:has-text("Tarjeta digital")').click()
await page.locator('.modal img[alt="Gift card"]').waitFor({ timeout: 20000 }); await page.waitForTimeout(500)
await page.screenshot({ path: shots + '5-lista-modal.png' })
await page.locator('.modal button:has-text("Cerrar")').click()
log('errores:', errores.length ? errores : 'ninguno')
await ctx.close()
