// PALMARIA ambiente 00: ciclo de pruebas con la sesión ya guardada en el perfil chrome-palmaria.
// PASOS=nr,ccf,nc,anular (separados por coma) · SUCURSAL_ID fija la sucursal activa (p. ej. MILLENNIUM).
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
const PASOS = (process.env.PASOS || 'nr,ccf').split(',')
const ctx = await chromium.launchPersistentContext('C:/Users/geova/.orion-pruebas/chrome-palmaria', { channel: 'chrome', headless: false, viewport: { width: 1366, height: 800 } })
const page = ctx.pages()[0] || await ctx.newPage()
const errores = []; page.on('pageerror', e => errores.push(e.message))
page.on('response', async r => { if (r.url().includes('/api/dte/') && r.request().method() === 'POST') console.log('  ' + r.url().split('/api/')[1], '->', r.status(), (await r.text().catch(() => '')).slice(0, 300).replace(/\s+/g, ' ')) })
const ir = async (ruta) => { await page.goto('http://localhost:5173' + ruta, { waitUntil: 'domcontentloaded' }); await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(2500) }
await ir('/')
if (process.env.SUCURSAL_ID) { await page.evaluate((id) => sessionStorage.setItem('orion_sucursal_activa', id), process.env.SUCURSAL_ID); await ir('/') }
console.log('sucursal activa:', await page.evaluate(() => sessionStorage.getItem('orion_sucursal_activa')))
const resultado = async (nombre) => {
  await page.waitForTimeout(1500)
  const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  const m = t.match(/(\u2705[^\u2715]{0,140}|\u274C[^\u2715]{0,220}|\u26A0\uFE0F[^\u2715]{0,200}|Error[^\u2715]{0,200}|rechaz[^\u2715]{0,200})/i)
  console.log('  ' + nombre + ':', m ? m[1].trim().slice(0, 220) : '(sin mensaje visible)')
  await page.screenshot({ path: 'shots-pc/palmaria-' + nombre + '.png' })
}
const cerrarAlertas = async () => { for (let i = 0; i < 3; i++) { const b = page.locator('.modal-overlay button', { hasText: /Entendido|Cerrar|OK/ }).first(); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(400) } } }
const fallo = async (nombre, e) => { console.log('  ' + nombre + ' fallo:', e.message.split('\n')[0]); await page.screenshot({ path: 'shots-pc/palmaria-' + nombre + '-error.png' }) }

if (PASOS.includes('nr')) {
  try {
    console.log('> NR (nota de remision) desde Operaciones')
    await ir('/operaciones')
    await page.locator('button.id-btn-oro').first().click(); await page.waitForTimeout(800)
    await page.locator('.pos-op-buscador-input').first().fill('Pina'); await page.waitForTimeout(300)
    await page.locator('.pos-op-buscador-input').first().fill('Pi\u00f1a'); await page.waitForTimeout(600)
    await page.locator('.pos-op-productos-grid > *').first().click(); await page.waitForTimeout(400)
    const btnRec = page.locator('button.pos-op-receptor-cambiar')
    if (await btnRec.count()) await btnRec.first().click(); else await page.locator('[class*="receptor"]').first().click()
    await page.waitForTimeout(500)
    await page.locator('input[placeholder*="Buscar por nombre, NIT"]').first().fill('PRUEBA ONE GEO'); await page.waitForTimeout(500)
    await page.locator('.pos-op-cliente-row').first().click(); await page.waitForTimeout(600)
    await page.keyboard.press('Escape')
    await page.locator('button.pos-op-btn-nr').first().click()
    await page.locator('.modal-overlay').filter({ hasText: /NR|Error|MH|pendiente|permiso|actividad/ }).first().waitFor({ timeout: 180000 })
    await resultado('nr'); await cerrarAlertas()
  } catch (e) { await fallo('nr', e) }
}

if (PASOS.includes('ccf')) {
  try {
    console.log('> CCF desde la caja (cliente PRUEBA ONE GEO)')
    await ir('/ventas')
    await page.locator('input[placeholder*="Buscar producto"]').first().fill('Pi\u00f1a lisa'); await page.waitForTimeout(700)
    await page.locator('.producto-card').first().click(); await page.waitForTimeout(400)
    await page.locator('input[placeholder*="Buscar cliente"]').first().fill('PRUEBA ONE GEO'); await page.waitForTimeout(700)
    await page.locator('.cliente-dropdown > *').first().click(); await page.waitForTimeout(500)
    await page.locator('.btn-cobrar').first().click(); await page.waitForTimeout(800)
    await page.locator('.cm-dte-btn', { hasText: 'CCF' }).first().click(); await page.waitForTimeout(500)
    const cont = page.locator('button', { hasText: 'Continuar al Cobro' }); if (await cont.count()) { await cont.first().click(); await page.waitForTimeout(800) }
    const ex = page.locator('.cm-bill-exacto')
    if (await ex.count()) await ex.first().click(); else await page.locator('input[placeholder="0.00"]').first().fill('100')
    await page.waitForTimeout(400)
    await page.locator('button:has-text("Confirmar Cobro")').first().click()
    await page.locator('.vc-vuelto, .venta-completada, .modal-overlay').first().waitFor({ timeout: 120000 })
    await page.waitForTimeout(6000)
    const t = (await page.locator('body').innerText()).replace(/\s+/g, ' '); const m = t.match(/(DTE-03-[A-Z0-9]{8}-\d{15})/)
    console.log('  CCF numero:', m ? m[1] : '(no visible)'); await resultado('ccf'); await cerrarAlertas()
  } catch (e) { await fallo('ccf', e) }
}

if (PASOS.includes('nc')) {
  try {
    console.log('> NC sobre el ultimo CCF (Facturas)')
    await ir('/facturas')
    await page.locator('tr.fact-tr-main', { hasText: 'CCF' }).first().click(); await page.waitForTimeout(800)
    await page.locator('button.card-nc:visible').first().click(); await page.waitForTimeout(1500)
    const modal = page.locator('.modal-overlay').last()
    await modal.locator('input[placeholder*="otivo"], textarea[placeholder*="otivo"]').first().fill('Prueba One Geo: devolucion parcial')
    await page.screenshot({ path: 'shots-pc/palmaria-nc-form.png' })
    await modal.locator('.modal-actions button').last().click()
    await page.locator('.modal-overlay').filter({ hasText: /NC|Nota|Error|MH|rechaz/i }).first().waitFor({ timeout: 180000 }).catch(() => {})
    await resultado('nc'); await cerrarAlertas()
  } catch (e) { await fallo('nc', e) }
}

if (PASOS.includes('anular')) {
  try {
    console.log('> Anular la FE', process.env.FE_NUM || '(ultima FE)')
    await ir('/facturas')
    await page.locator('tr.fact-tr-main', { hasText: process.env.FE_NUM || 'FE' }).first().click(); await page.waitForTimeout(800)
    await page.locator('button.card-anular:visible').first().click(); await page.waitForTimeout(1200)
    const modal = page.locator('.modal-overlay').last()
    const sel = modal.locator('select.input').first()
    if (await sel.locator('option[value="2"]').count()) await sel.selectOption('2')
    await modal.locator('input[placeholder*="Describa el motivo"], textarea[placeholder*="Describa el motivo"]').first().fill('Prueba One Geo: cliente cancelo la compra')
    const nom = modal.locator('input[placeholder*="Nombre y apellidos"]'); if (await nom.count()) await nom.first().fill('CLIENTE DE PRUEBA')
    const doc = modal.locator('input[placeholder="01234567-8"]'); if (await doc.count()) await doc.first().fill('01234567-8')
    await page.screenshot({ path: 'shots-pc/palmaria-anular-form.png' })
    const esperaInv = page.waitForResponse(r => r.url().includes('/api/dte/invalidar') && r.request().method() === 'POST', { timeout: 180000 }).catch(() => null)
    await modal.locator('button.btn-anular').first().click()
    const rInv = await esperaInv; if (rInv) console.log('  invalidar ->', rInv.status(), (await rInv.text().catch(() => '')).slice(0, 600).replace(/s+/g, ' '))
    await page.waitForTimeout(2500)
    await resultado('anular'); await cerrarAlertas()
  } catch (e) { await fallo('anular', e) }
}

console.log('errores de pagina:', errores.length ? errores : 'ninguno')
await ctx.close()
