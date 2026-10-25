// Casos de cobro para conciliar Reportes en DEMO: tarjeta, mixto (efectivo + tarjeta), crédito (y su cobro), CCF a cliente con NIT,
// y anulación de la venta con tarjeta (con devolución por tarjeta). Luego: calculo-independiente.mjs y _rep-kpis.mjs.
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
const shots = 'C:/Users/geova/AppData/Local/Temp/claude/c--Users-geova-mi-sistema-ventas/4ff72822-8b12-4fce-85ac-88cd91930701/scratchpad/casos-'
const ctx = await chromium.launchPersistentContext('C:/Users/geova/.orion-pruebas/chrome-profile', { channel: 'chrome', headless: true, viewport: { width: 1366, height: 900 } })
const page = ctx.pages()[0] || await ctx.newPage()
const errores = []; page.on('pageerror', e => errores.push(e.message))
const log = (...a) => console.log(...a)
const resultado = []
const SALTAR = (process.env.SALTAR || '').split(',').filter(Boolean)
if (process.env.DTE_TARJETA) resultado.push({ caso: 'tarjeta', dte: process.env.DTE_TARJETA })
const irPOS = async () => { await page.goto('http://localhost:5173/ventas', { waitUntil: 'domcontentloaded' }); await page.locator('input[placeholder*="Buscar producto"]').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(2000) }
const agregar = async (texto) => { await page.locator('input[placeholder*="Buscar producto"]').first().fill(texto); await page.waitForTimeout(700); await page.locator('.producto-card:not(.agotado)').first().click(); await page.waitForTimeout(400) }
const abrirCobro = async () => { await page.locator('.btn-cobrar').first().click(); await page.waitForTimeout(800) }
const continuar = async () => { if (await page.locator('button:has-text("Confirmar Cobro")').count() === 0) { await page.locator('button:has-text("Continuar")').first().click().catch(() => page.keyboard.press('Enter')); await page.waitForTimeout(800) } }
const confirmar = async (nombre) => {
  await page.locator('button:has-text("Confirmar Cobro")').first().click()
  await page.locator('.vc-nueva').first().waitFor({ timeout: 90000 }); await page.waitForTimeout(800)
  const txt = (await page.locator('body').innerText())
  const dte = txt.match(/DTE-\d{2}-[A-Z0-9]+-\d+/)?.[0] || '?'
  const total = txt.match(/TOTAL\s*\n?\s*\$([\d,.]+)/)?.[1] || '?'
  resultado.push({ caso: nombre, dte, total }); log('✔', nombre, dte, '$' + total)
  await page.screenshot({ path: shots + nombre.replace(/\W/g, '') + '.png' })
  await page.locator('.vc-nueva').first().click(); await page.waitForTimeout(800)
}

await irPOS()
// 1) TARJETA
if (!SALTAR.includes('tarjeta')) {
await agregar('GRIFERÍA PARA LAVAMANOS'); await abrirCobro(); await continuar()
await page.locator('.cm-fpago-btn:has-text("Tarjeta")').click(); await page.waitForTimeout(300)
await confirmar('tarjeta')
}
// 2) MIXTO: efectivo + tarjeta
if (!SALTAR.includes('mixto')) {
await agregar('PINTURA LÁTEX COLOR'); await abrirCobro(); await continuar()
await page.locator('.cm-fpago-btn:has-text("Mixto")').click(); await page.waitForTimeout(400)
const totalMixto = parseFloat((await page.locator('.cobro-modal-title, .cm-total, [class*="total"]').allInnerTexts()).join(' ').match(/\$([\d,.]+)/)?.[1].replace(',', '') || '0')
const inputs = page.locator('.cm-cambio-input')
await inputs.nth(0).fill('10.00'); await inputs.nth(1).fill((Math.round((totalMixto - 10) * 100) / 100).toFixed(2)); await page.waitForTimeout(300)
log('mixto total detectado:', totalMixto)
await confirmar('mixto')
}
// 3) CRÉDITO a cliente
await agregar('TALADRO PERCUTOR'); await abrirCobro()
await page.locator('input[placeholder^="👤 Buscar cliente"]').fill('Carlos'); await page.waitForTimeout(600)
await page.locator('.cliente-option').first().dispatchEvent('mousedown'); await page.waitForTimeout(400)
await continuar()
await page.locator('.cm-pago-btn:has-text("Crédito"), .cm-chip:has-text("Crédito")').first().click(); await page.waitForTimeout(400)
await page.locator('input[type="date"]').first().fill('2026-11-30').catch(() => {})
await confirmar('credito')
// 4) CCF a cliente con NIT
await agregar('SIERRA CIRCULAR'); await abrirCobro()
await page.locator('input[placeholder^="👤 Buscar cliente"]').fill('Progreso'); await page.waitForTimeout(600)
await page.locator('.cliente-option').first().dispatchEvent('mousedown'); await page.waitForTimeout(400)
await page.locator('select').filter({ has: page.locator('option[value="CCF"]') }).first().selectOption('CCF').catch(async () => { await page.keyboard.press('F6') }); await page.waitForTimeout(400)
await continuar()
await page.locator('.cm-bill', { hasText: 'Exacto' }).first().click().catch(() => {})
await confirmar('ccf')

// 5) Cobro del crédito y 6) anulación de la venta con tarjeta, desde Facturas DTE
await page.goto('http://localhost:5173/facturas', { waitUntil: 'domcontentloaded' }); await page.locator('.fact-card').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(2000)
const dteCredito = resultado.find(r => r.caso === 'credito')?.dte, dteTarjeta = resultado.find(r => r.caso === 'tarjeta')?.dte
const cardCred = page.locator('.fact-card', { hasText: dteCredito }).first()
await cardCred.locator('select.estado-pago').selectOption('pagada'); await page.waitForTimeout(1500); log('✔ crédito cobrado', dteCredito)
const cardTar = page.locator('.fact-card', { hasText: dteTarjeta }).first()
await cardTar.locator('.fact-card-cab').click(); await page.waitForTimeout(600)
await cardTar.locator('button:has-text("Anular DTE")').click(); await page.waitForTimeout(800)
await page.locator('.modal select').first().selectOption('2').catch(() => {})
await page.locator('input[placeholder*="Describa el motivo"]').fill('Prueba de conciliación de reportes')
await page.locator('input[placeholder*="Nombre y apellidos"]').fill('Alberto Alvarado').catch(() => {})
await page.locator('input[placeholder="01234567-8"]').fill('01234567-8').catch(() => {})
await page.locator('.btn-anular').last().click(); await page.waitForTimeout(3500)
// ¿Cómo devolviste el dinero? → tarjeta
await page.locator('#medio-tarjeta').check({ timeout: 15000 }).catch(e => log('sin modal de devolución:', e.message.split('\n')[0]))
await page.locator('.modal button:has-text("Registrar"), .modal .btn-primary').last().click().catch(() => {}); await page.waitForTimeout(2500)
log('✔ anulada', dteTarjeta)
await page.screenshot({ path: shots + 'facturas.png' })
console.log(JSON.stringify(resultado))
log('errores:', errores.length ? errores : 'ninguno')
await ctx.close()
