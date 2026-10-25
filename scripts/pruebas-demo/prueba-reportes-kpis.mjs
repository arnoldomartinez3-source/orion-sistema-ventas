// Lee los KPI de cada pestaña de Reportes (período octubre) + Dashboard, para conciliar con calculo-independiente.mjs
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
const shots = 'C:/Users/geova/AppData/Local/Temp/claude/c--Users-geova-mi-sistema-ventas/4ff72822-8b12-4fce-85ac-88cd91930701/scratchpad/rep-'
const ctx = await chromium.launchPersistentContext('C:/Users/geova/.orion-pruebas/chrome-profile', { channel: 'chrome', headless: true, viewport: { width: 1366, height: 900 } })
const page = ctx.pages()[0] || await ctx.newPage()
const errores = []; page.on('pageerror', e => errores.push(e.message))
for (let i = 0; i < 20; i++) { try { await page.goto('http://localhost:5173/reportes', { waitUntil: 'domcontentloaded', timeout: 15000 }); break } catch { await page.waitForTimeout(2000) } }
await page.locator('.sidebar').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(2500)
// Período: 1 al 25 de octubre
const fechas = page.locator('input[type="date"]')
await fechas.nth(0).fill('2026-10-01'); await fechas.nth(1).fill('2026-10-25'); await page.waitForTimeout(2500)
const tabs = ['Resumen', 'Ventas', 'Ingresos', 'Caja', 'Utilidad', 'Inventario', 'Clientes', 'Vendedores', 'Compras']
for (const t of tabs) {
  await page.locator('button, [role=tab]').filter({ hasText: new RegExp('^\\S*\\s*' + t + '$') }).first().click().catch(async () => { await page.locator(`text=${t}`).first().click() })
  await page.waitForTimeout(1800)
  const kpis = await page.locator('.rep-kpis').first().innerText().catch(() => '(sin kpis)')
  console.log('== ' + t + ': ' + kpis.replace(/\s+/g, ' ').slice(0, 400))
  await page.screenshot({ path: shots + t.toLowerCase() + '.png', fullPage: false })
}
// Dashboard
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await page.locator('.sidebar').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(3000)
const body = await page.locator('body').innerText()
console.log('== Dashboard mes:', body.match(/Mes:[^\n]*/)?.[0], '| hoy:', body.match(/\$[\d,.]+\n\d+ ventas · \d+ DTE emitidos/)?.[0]?.replace(/\n/g, ' '))
console.log('errores:', errores.length ? errores : 'ninguno')
await ctx.close()
