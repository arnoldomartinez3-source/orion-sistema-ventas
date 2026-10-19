// Gift cards en DEMO (ferretería): 1) vender una gift card de $20 desde /giftcards → caja (DTE),
// 2) canjearla en el POS con una compra menor (saldo queda), 3) canjear el resto con una compra mayor (diferencia por cobrar).
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
const ctx = await chromium.launchPersistentContext((process.env.ORION_PERFIL || 'C:/Users/geova/.orion-pruebas/chrome-profile'), { channel: 'chrome', headless: true, viewport: { width: 1366, height: 800 } })
const page = ctx.pages()[0] || await ctx.newPage()
const errores = []; page.on('pageerror', e => errores.push(e.message))
const shots = 'C:/Users/geova/AppData/Local/Temp/claude/c--Users-geova-mi-sistema-ventas/4ff72822-8b12-4fce-85ac-88cd91930701/scratchpad/gc-'
const log = (...a) => console.log(...a)
const textoModal = async () => (await page.locator('.modal, .modal-content, [role=dialog]').last().innerText().catch(() => '')).replace(/\s+/g, ' ')

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(2500)
await page.locator('.sidebar a:has-text("Gift cards"), .sidebar :text("Gift cards")').first().click(); await page.waitForTimeout(2000)
await page.screenshot({ path: shots + '1-pagina.png' })

// 1) Preparar la venta de una gift card de $20
await page.locator('button:has-text("$20"), button:text-is("20")').first().click().catch(async () => { await page.locator('input[placeholder="Otro monto"]').fill('20') })
await page.locator('input[placeholder*="Nombre de quien"]').fill('Prueba Playwright')
await page.locator('button:has-text("Cobrar en la caja")').first().click()
await page.waitForURL('**/ventas', { timeout: 15000 }); await page.waitForTimeout(2000)
await page.screenshot({ path: shots + '2-carrito.png' })
log('carrito:', (await page.locator('.carrito, .pv-carrito, .cart').first().innerText().catch(() => '?')).replace(/\s+/g, ' ').slice(0, 200))

await page.locator('.btn-cobrar').first().click(); await page.waitForTimeout(700)
if (await page.locator('button:has-text("Confirmar Cobro")').count() === 0) { await page.keyboard.press('Enter'); await page.waitForTimeout(700) }
await page.locator('.cm-bill', { hasText: '$20' }).first().click().catch(() => page.locator('input[placeholder="0.00"]').first().fill('20'))
await page.waitForTimeout(300)
await page.locator('button:has-text("Confirmar Cobro")').first().click()
await page.locator('.cm-gift-on .mono').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(800)
const codigo = (await page.locator('.cm-gift-on .mono').first().innerText()).trim()
log('GIFT CARD EMITIDA:', codigo)
await page.screenshot({ path: shots + '3-emitida.png' })
await page.locator('.vc-nueva').first().click(); await page.waitForTimeout(800)

// 2) Canje parcial: un producto barato
const canje = async (busq, efectivoExtra) => {
  await page.locator('input[placeholder*="Buscar producto"]').first().fill(busq); await page.waitForTimeout(600)
  await page.locator('.producto-card:not(.agotado)').first().click(); await page.waitForTimeout(400)
  await page.locator('.btn-cobrar').first().click(); await page.waitForTimeout(700)
  if (await page.locator('button:has-text("Confirmar Cobro")').count() === 0) { await page.keyboard.press('Enter'); await page.waitForTimeout(700) }
  await page.locator('input[placeholder*="GC-"]').fill(codigo)
  await page.locator('button:has-text("Aplicar")').first().click(); await page.waitForTimeout(1500)
  await page.screenshot({ path: shots + '4-aplicada-' + busq.replace(/\W/g, '') + '.png' })
  log('bloque gift:', (await page.locator('.cm-gift').first().innerText()).replace(/\s+/g, ' '))
  log('botón:', (await page.locator('button:has-text("Confirmar Cobro")').first().innerText()).replace(/\s+/g, ' '))
  await page.locator('button:has-text("Confirmar Cobro")').first().click()
  await page.waitForTimeout(3500)
  log('respuesta:', (await page.locator('body').innerText()).match(/Canje [^\n]*|No se pudo registrar[^\n]*/)?.[0] || '(sin mensaje)')
  await page.screenshot({ path: shots + '5-canje-' + busq.replace(/\W/g, '') + '.png' })
  // cerrar la alerta
  await page.locator('.modal-overlay button:has-text("Entendido")').first().click().catch(() => {})
  await page.waitForTimeout(600)
  if (efectivoExtra) {
    // quedó la línea de diferencia en el carrito: cobrarla en efectivo
    log('carrito tras canje:', (await page.locator('body').innerText()).match(/Diferencia canje[^\n]*/)?.[0] || '(sin línea de diferencia)')
    if (await page.locator('button:has-text("Confirmar Cobro")').count() === 0) { await page.locator('.btn-cobrar').first().click(); await page.waitForTimeout(700) }
    if (await page.locator('button:has-text("Confirmar Cobro")').count() === 0) { await page.keyboard.press('Enter'); await page.waitForTimeout(700) }
    await page.locator('input[placeholder="0.00"]').first().fill(String(efectivoExtra)).catch(() => {})
    await page.locator('.cm-bill', { hasText: '$20' }).first().click().catch(() => {})
    await page.waitForTimeout(300)
    await page.locator('button:has-text("Confirmar Cobro")').first().click()
    await page.locator('.vc-nueva').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(800)
    await page.screenshot({ path: shots + '6-diferencia-cobrada.png' })
    log('venta de diferencia:', (await page.locator('body').innerText()).match(/Diferencia canje[^\n]*/)?.[0])
    await page.locator('.vc-nueva').first().click(); await page.waitForTimeout(800)
  }
}
await canje('TORNILLO GALVANIZADO', 0)      // compra pequeña (< $20)
await canje("GRIFERÍA PARA LAVAMANOS", 20)                 // compra mayor que el saldo → diferencia

// 3) Página Gift cards: la tarjeta debe verse agotada con sus canjes
await page.locator('.sidebar :text("Gift cards")').first().click(); await page.waitForTimeout(2500)
await page.locator('input[placeholder*="Buscar código"]').fill(codigo); await page.waitForTimeout(600)
await page.locator('button:has-text("Todas")').first().click(); await page.waitForTimeout(600)
await page.screenshot({ path: shots + '7-lista.png' })
log('en lista:', (await page.locator('body').innerText()).split('\n').filter(l => l.includes(codigo) || /Saldo|Canje|agotada/i.test(l)).slice(0, 8).join(' | '))
log('errores:', errores.length ? errores : 'ninguno')
await ctx.close()
