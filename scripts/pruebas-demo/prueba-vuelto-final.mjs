// Venta real en DEMO (ferretería, ambiente de pruebas): pagar $5 un tornillo de $0.17 y ver el vuelto en la pantalla final.
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
import path from 'node:path'
const ctx = await chromium.launchPersistentContext((process.env.ORION_PERFIL || 'C:/Users/geova/.orion-pruebas/chrome-profile'), { channel: 'chrome', headless: false, viewport: { width: 1366, height: 800 } })
const page = ctx.pages()[0] || await ctx.newPage()
const errores = []; page.on('pageerror', e => errores.push(e.message))
await page.goto('http://localhost:5173/ventas', { waitUntil: 'domcontentloaded' })
await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(3000)
await page.locator('input[placeholder*="Buscar producto"]').first().fill('TORNILLO GALVANIZADO'); await page.waitForTimeout(500)
await page.locator('.producto-card:not(.agotado)').first().click(); await page.waitForTimeout(400)
await page.locator('.btn-cobrar').first().click(); await page.waitForTimeout(600)
if (await page.locator('button:has-text("Confirmar Cobro")').count() === 0) { await page.keyboard.press('Enter'); await page.waitForTimeout(600) }
await page.locator('.cm-bill', { hasText: '$5' }).first().click(); await page.waitForTimeout(300)
await page.locator('button:has-text("Confirmar Cobro")').first().click()
await page.locator('.vc-vuelto').waitFor({ timeout: 60000 })
await page.waitForTimeout(800)
console.log('bloque vuelto:', await page.locator('.vc-vuelto').innerText().then(t => t.replace(/\s+/g, ' ')))
await page.screenshot({ path: 'shots-pc/vuelto-final.png' })
console.log('errores:', errores.length ? errores : 'ninguno')
await ctx.close()
