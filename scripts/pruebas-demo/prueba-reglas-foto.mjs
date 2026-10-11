// Verifica desde la sesión DEMO que las reglas nuevas están desplegadas: crear captura, subir foto a Storage, leer catálogo.
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
import path from 'node:path'
const ctx = await chromium.launchPersistentContext((process.env.ORION_PERFIL || 'C:/Users/geova/.orion-pruebas/chrome-profile'), { channel: 'chrome', headless: false, viewport: { width: 1366, height: 900 } })
const page = ctx.pages()[0] || await ctx.newPage()
await page.goto('http://localhost:5173/', { waitUntil: 'load' })
await page.locator('.sidebar').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(2500)
const r = await page.evaluate(async () => {
  const out = {}
  const { db, auth } = await import('/src/firebase.js')
  const urlDe = (n) => performance.getEntriesByType('resource').map(e => e.name).find(x => x.includes('/.vite/deps/' + n + '.js'))
  const fs = await import(urlDe('firebase_firestore'))
  const st = await import(urlDe('firebase_storage') || '/node_modules/.vite/deps/firebase_storage.js')
  const uid = auth.currentUser?.uid
  const u = await fs.getDoc(fs.doc(db, 'usuarios', uid)).catch(() => null)
  const empresaId = u?.exists() ? u.data().empresaId : null
  out.empresaId = empresaId
  // 1) captura
  try { const ref = await fs.addDoc(fs.collection(db, 'capturas'), { empresaId, codigoBarras: '7411001803546', estado: 'esperando', creadoPor: 'prueba', createdAt: fs.serverTimestamp() }); out.captura = 'creada ' + ref.id; out.capturaId = ref.id } catch (e) { out.captura = 'ERROR ' + e.code }
  // 2) actualizar campos permitidos
  if (out.capturaId) { try { await fs.updateDoc(fs.doc(db, 'capturas', out.capturaId), { estado: 'cerrada' }); out.capturaUpd = 'ok' } catch (e) { out.capturaUpd = 'ERROR ' + e.code } }
  // 3) storage carpeta capturas
  try { const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }); const sref = st.ref(st.getStorage(), `empresas/${empresaId}/capturas/prueba-reglas.jpg`); await st.uploadBytes(sref, blob, { contentType: 'image/jpeg' }); out.storage = 'subido'; await st.deleteObject(sref).catch(() => {}) } catch (e) { out.storage = 'ERROR ' + e.code }
  // 4) catálogo maestro (lectura)
  try { const s = await fs.getDoc(fs.doc(db, 'catalogo_maestro', '7411001803546')); out.catalogo = 'lectura ok, existe=' + s.exists() } catch (e) { out.catalogo = 'ERROR ' + e.code }
  // 5) contadores_foto (lectura propia)
  try { await fs.getDoc(fs.doc(db, 'contadores_foto', empresaId + '_2026-10')); out.contador = 'lectura ok' } catch (e) { out.contador = 'ERROR ' + e.code }
  // limpieza
  if (out.capturaId) { try { await fs.deleteDoc(fs.doc(db, 'capturas', out.capturaId)); out.limpieza = 'captura borrada' } catch (e) { out.limpieza = 'no se pudo borrar: ' + e.code } }
  return out
})
console.log(JSON.stringify(r, null, 1))
await ctx.close()
