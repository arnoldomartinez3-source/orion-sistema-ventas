// Nota de remisión desde Operaciones en DEMO: debe salir con la sucursal activa (sucursalId + correlativo por sucursal).
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
const ctx = await chromium.launchPersistentContext((process.env.ORION_PERFIL || 'C:/Users/geova/.orion-pruebas/chrome-profile'), { channel: 'chrome', headless: false, viewport: { width: 1366, height: 800 } })
const page = ctx.pages()[0] || await ctx.newPage()
const errores = []; page.on('pageerror', e => errores.push(e.message))
page.on('response', async r => { if (r.url().includes('/api/dte/transmitir')) console.log('transmitir →', r.status(), (await r.text().catch(() => '')).slice(0, 700)) })
for (let i = 0; i < 20; i++) { try { await page.goto('http://localhost:5173/operaciones', { waitUntil: 'domcontentloaded', timeout: 15000 }); break } catch { await page.waitForTimeout(1500) } }
await page.waitForTimeout(3000)
// Selector de sucursal (sesión nueva): elegir Sucursal Centro
const opcion = page.locator('text=Sucursal Centro').first()
if (await opcion.isVisible().catch(() => false) && await page.locator('.sidebar').count() === 0) { await opcion.click(); await page.waitForTimeout(300); await page.locator('button.btn-primary').last().click(); await page.waitForTimeout(1500) }
await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(1500)
const sucursalId = await page.evaluate(() => sessionStorage.getItem('orion_sucursal_activa'))
console.log('sucursal activa:', sucursalId)
await page.locator('button.id-btn-oro').first().click(); await page.waitForTimeout(800)
await page.locator('.pos-op-buscador-input').first().fill('TORNILLO'); await page.waitForTimeout(600)
await page.locator('.pos-op-productos-grid > *').first().click(); await page.waitForTimeout(400)
// receptor
const btnRec = page.locator('button.pos-op-receptor-cambiar'); if (await btnRec.count()) await btnRec.first().click(); else await page.locator('.pos-op-receptor-vacio, [class*="receptor"]').first().click()
await page.waitForTimeout(500)
await page.locator('.pos-op-cliente-row').first().click(); await page.waitForTimeout(600)
const act = page.locator('input[placeholder*="Actividad económica del receptor"]')
if (await act.count() && !(await act.first().inputValue())) { await act.first().fill('Venta al por menor'); await page.waitForTimeout(800); const sug = page.locator('div', { hasText: /^Venta al por menor/ }).last(); if (await sug.isVisible().catch(() => false)) await sug.click(); await page.waitForTimeout(400); await page.keyboard.press('Escape') }
await page.screenshot({ path: 'shots-pc/nr-antes.png' })
await page.locator('button.pos-op-btn-nr').first().click()
const t0 = Date.now(); await page.locator('.modal-overlay').filter({ hasText: /NR|Error|MH|pendiente|permiso|actividad/ }).first().waitFor({ timeout: 240000 }).catch(() => console.log('sin modal tras 240 s')); console.log('respuesta en', Math.round((Date.now() - t0) / 1000), 's')
await page.waitForTimeout(500)
const texto = await page.locator('body').innerText()
const m = texto.match(/(✅ NR transmitida[\s\S]{0,160}|❌ MH rechazó[\s\S]{0,300}|⚠️ NR pendiente[\s\S]{0,200}|Error al emitir NR[\s\S]{0,300}|Sin permiso[\s\S]{0,80}|Falta actividad[\s\S]{0,80})/)
console.log('resultado:', m ? m[1].replace(/\s+/g, ' ') : '(no se halló el mensaje)')
await page.screenshot({ path: 'shots-pc/nr-resultado.png' })
console.log('errores:', errores.length ? errores : 'ninguno')
await ctx.close()
