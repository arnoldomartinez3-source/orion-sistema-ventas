// ══════════════════════════════════════════════════════════════════
// Fotos del inventario de PALMARIA: las que Andrea pega EN LA CELDA de la columna IMAGEN de su Google Sheet.
// La API de Sheets no las entrega, así que: Drive API exporta el sheet a .xlsx → las fotos vienen como dibujos
// anclados a la fila (xl/drawings/drawing1.xml) → fila ↔ SKU (columna A) → se comprime (Chrome sin ventana,
// máx. 900 px, JPEG 82 %) → se sube a Storage empresas/{empresaId}/productos/{SKU}.jpg → productos.imagen.
//
// Uso: node scripts/fotos-palmaria.mjs --empresa eWVgsQboA71k8RcYXrgo [--aplicar] [--forzar]
//   sin --aplicar: solo dice qué haría · --forzar: reemplaza fotos que el producto ya tenga
// Requiere Drive API habilitada y el sheet compartido con la cuenta de servicio.
// ══════════════════════════════════════════════════════════════════
import admin from 'firebase-admin'
import { JWT } from 'google-auth-library'
import JSZip from 'jszip'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { chromium } from 'playwright-core'

const SHEET_ID = '1HG0E3l0wyauV_-P85Knitlseq-tOBcwKavG1Kchzg9s'
const BUCKET = 'mi-sistema-ventas-7e541.firebasestorage.app'
const args = process.argv.slice(2)
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const EMPRESA = arg('--empresa'), APLICAR = args.includes('--aplicar'), FORZAR = args.includes('--forzar')
if (!EMPRESA) { console.error('Falta --empresa'); process.exit(1) }

// 1) Exportar el sheet a xlsx (Drive API)
const key = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))
const auth = new JWT({ email: key.client_email, key: key.private_key, scopes: ['https://www.googleapis.com/auth/drive.readonly'] })
// Drive API export tiene tope de 10 MB (el sheet con fotos pesa >100 MB); el export de docs.google.com con el mismo token no lo tiene.
const tok = (await auth.getAccessToken()).token
const resp = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`, { headers: { Authorization: 'Bearer ' + tok } })
if (!resp.ok || (resp.headers.get('content-type') || '').includes('html')) { console.error('No se pudo exportar el sheet:', resp.status); process.exit(1) }
const xlsx = Buffer.from(await resp.arrayBuffer())
console.log('xlsx exportado:', (xlsx.length / 1048576).toFixed(1), 'MB')

// 2) Fotos ancladas → fila; fila → SKU (hoja 1, columna A)
const zip = await JSZip.loadAsync(xlsx)
const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string')
const sst = zip.file('xl/sharedStrings.xml') ? await zip.file('xl/sharedStrings.xml').async('string') : ''
const strings = [...sst.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(t => t[1]).join(''))
const skuPorFila = {}
for (const m of sheetXml.matchAll(/<c r="A(\d+)"([^>]*)>(?:<v>([^<]*)<\/v>|<is><t>([^<]*)<\/t><\/is>)/g)) {
  const fila = +m[1], esStr = /t="s"/.test(m[2]), v = m[3] ?? m[4] ?? ''
  skuPorFila[fila] = String(esStr ? strings[+v] : v).trim().toUpperCase()
}
const drawingPath = Object.keys(zip.files).find(k => /^xl\/drawings\/drawing\d+\.xml$/.test(k))
if (!drawingPath) { console.log('El sheet no tiene fotos insertadas.'); process.exit(0) }
const dr = await zip.file(drawingPath).async('string')
const rels = await zip.file(drawingPath.replace('drawings/', 'drawings/_rels/') + '.rels').async('string')
const relMap = {}; for (const m of rels.matchAll(/Id="(rId\d+)"[^>]*Target="\.\.\/media\/([^"]+)"/g)) relMap[m[1]] = m[2]
const fotos = []
for (const m of dr.matchAll(/<xdr:(?:twoCellAnchor|oneCellAnchor)[\s\S]*?<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?r:embed="(rId\d+)"[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g)) {
  const fila = +m[2] + 1, sku = skuPorFila[fila]
  if (relMap[m[3]] && sku) fotos.push({ fila, sku, archivo: relMap[m[3]] })
}
console.log('fotos ancladas a una fila con SKU:', fotos.length)

// 3) Productos de la empresa
admin.initializeApp({ credential: admin.credential.applicationDefault(), storageBucket: BUCKET })
const db = admin.firestore(), bucket = admin.storage().bucket()
const prods = new Map(); (await db.collection('productos').where('empresaId', '==', EMPRESA).get()).docs.forEach(d => prods.set(String(d.data().codigo || '').toUpperCase(), { id: d.id, ...d.data() }))
const pendientes = fotos.filter(f => prods.has(f.sku) && (FORZAR || !prods.get(f.sku).imagen))
const sinProducto = fotos.filter(f => !prods.has(f.sku))
console.log(`a subir: ${pendientes.length} · ya tenían foto: ${fotos.length - pendientes.length - sinProducto.length} · con foto pero la pieza aún no está en ORIÓN: ${sinProducto.length}` + (sinProducto.length ? ' (' + sinProducto.slice(0, 8).map(f => f.sku).join(', ') + '…)' : ''))
if (!APLICAR || !pendientes.length) { console.log(APLICAR ? 'Nada que subir.' : '(simulación: agregá --aplicar para subir)'); process.exit(0) }

// 4) Comprimir con Chrome (canvas) y subir
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
let subidas = 0
for (const f of pendientes) {
  const orig = await zip.file('xl/media/' + f.archivo).async('nodebuffer')
  const mime = f.archivo.endsWith('.png') ? 'image/png' : 'image/jpeg'
  const dataUrl = `data:${mime};base64,${orig.toString('base64')}`
  const jpegB64 = await page.evaluate(async (src) => {
    const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = src })
    const max = 900, esc = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas'); c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc)
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.82).split(',')[1]
  }, dataUrl)
  const jpeg = Buffer.from(jpegB64, 'base64')
  const token = crypto.randomUUID()
  const ruta = `empresas/${EMPRESA}/productos/${f.sku.replace(/[^A-Z0-9-]/g, '_')}.jpg`
  await bucket.file(ruta).save(jpeg, { contentType: 'image/jpeg', metadata: { metadata: { firebaseStorageDownloadTokens: token, origen: 'sheet-palmaria' } } })
  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(ruta)}?alt=media&token=${token}`
  await db.collection('productos').doc(prods.get(f.sku).id).update({ imagen: url, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
  subidas++
  if (subidas % 10 === 0) console.log('  …', subidas)
}
await browser.close()
console.log(`✔ ${subidas} fotos subidas (de ~${(pendientes.length * 1.4).toFixed(0)} MB originales a ~${Math.round(subidas * 0.12)} MB)`)
