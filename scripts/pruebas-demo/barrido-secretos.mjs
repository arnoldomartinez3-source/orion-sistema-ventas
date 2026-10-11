// Barrido de secretos MH: llama a la función secretosMH (acción migrarTodas) con la sesión del maestro.
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
import path from 'node:path'
const ctx = await chromium.launchPersistentContext((process.env.ORION_PERFIL || 'C:/Users/geova/.orion-pruebas/chrome-profile'), { channel: 'chrome', headless: true, viewport: { width: 1366, height: 900 } })
const page = ctx.pages()[0] || await ctx.newPage()
for (let i = 0; i < 20; i++) { try { await page.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 15000 }); break } catch { await page.waitForTimeout(2000) } }
await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(2000)
const r = await page.evaluate(async () => {
  const { auth } = await import('/src/firebase.js')
  const token = await auth.currentUser.getIdToken()
  const resp = await fetch('https://app.orionsv.net/api/dte/secretos-mh', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ accion: 'migrarTodas' }) })
  const texto = await resp.text()
  return { status: resp.status, usuario: auth.currentUser.email, texto: texto.slice(0, 500) }
})
console.log(JSON.stringify(r))
await ctx.close()
