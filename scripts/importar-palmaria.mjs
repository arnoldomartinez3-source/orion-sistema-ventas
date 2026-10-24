// ══════════════════════════════════════════════════════════════════
// Importa el inventario de PALMARIA desde su Google Sheet (en vivo) a una empresa de ORIÓN
// y pinta de VERDE la celda del SKU de cada fila importada, para que Andrea sepa qué ya entró.
//
// Reglas (acordadas 2026-10-20):
//   • Una fila se importa cuando tiene SKU + descripción + precio. Existencias y foto pueden venir después.
//   • El SKU de ella ES el código del producto en ORIÓN (uno por pieza). SKU repetido → se avisa y no se importa.
//   • El precio del sheet es al público CON IVA → ORIÓN guarda el neto (precio / 1.13, 4 decimales).
//   • Las filas con texto en la columna SKU y nada más son CATEGORÍAS ("PULSERAS PLATA S925 - PBR" → "PULSERAS PLATA S925").
//   • Existencias: columnas E-H (MULTIPLAZA, MILLENNIUM, BOLENGO, RAMBLAS) → sucursales según MAPA_SUCURSALES.
//     Solo se escriben al CREAR el producto o si el producto aún tiene stock 0 (nunca pisan un conteo hecho en ORIÓN).
//   • Re-ejecutable: lo existente (por código) se actualiza nombre/categoría/precio; nada se duplica.
//
// Uso (desde la raíz del repo, con GOOGLE_APPLICATION_CREDENTIALS apuntando a la llave de servicio):
//   node scripts/importar-palmaria.mjs --empresa eWVgsQboA71k8RcYXrgo            (simulación: no escribe nada)
//   node scripts/importar-palmaria.mjs --empresa eWVgsQboA71k8RcYXrgo --aplicar  (importa + pinta verde)
//   node scripts/importar-palmaria.mjs --empresa <id> --aplicar --sin-verde      (importa sin tocar el sheet)
// Requisitos: Sheets API habilitada en el proyecto y el sheet compartido como Editor con la cuenta de servicio.
// ══════════════════════════════════════════════════════════════════
import admin from 'firebase-admin'
import { JWT } from 'google-auth-library'
import fs from 'node:fs'

const SHEET_ID = '1HG0E3l0wyauV_-P85Knitlseq-tOBcwKavG1Kchzg9s'
const HOJA = 'INVENTARIO GRAL'
const IVA = 0.13
// Columnas del sheet: se detectan por el encabezado (fila 1) y por los nombres de tienda (fila 2), porque Andrea
// agrega columnas (p. ej. UNIDAD/PAR entre PRECIO y EXISTENCIAS). Valores por defecto si no se encuentran.
const COL = { sku: 0, img: 1, desc: 2, precio: 3, unidad: -1, tiendas: [4, 5, 6, 7] }
const TIENDAS = ['MULTIPLAZA', 'MILLENNIUM', 'BOLENGO', 'RAMBLAS']
// Nombre de la tienda en el sheet → nombre de la sucursal en ORIÓN (en la empresa de práctica los nombres son otros)
const MAPA_SUCURSALES = {
  // (AND-1930 ya tiene los nombres reales desde el 2026-10-20; se deja el ejemplo por si una empresa usa otros)
  // ejemploEmpresaId: { MULTIPLAZA: 'CENTRO', MILLENNIUM: 'METROCENTRO', BOLENGO: 'TERCERA', RAMBLAS: 'CUARTA' },
}

const args = process.argv.slice(2)
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const EMPRESA = arg('--empresa')
const APLICAR = args.includes('--aplicar')
const PINTAR = !args.includes('--sin-verde')
const FIJAR = args.includes('--fijar-existencias') // arranque: las existencias del sheet PISAN lo que haya (práctica, negativos)
if (!EMPRESA) { console.error('Falta --empresa <empresaId>'); process.exit(1) }

const r2 = (n) => Math.round(n * 100) / 100
const r4 = (n) => Math.round(n * 10000) / 10000
const limpiar = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const esSku = (s) => /^[A-Z]{1,8}-?[A-Z0-9-]*\d[A-Z0-9-]*$/i.test(s)
const num = (v) => { const n = parseFloat(String(v).replace(/[$,\s]/g, '')); return isNaN(n) ? null : n }

// ── Google Sheets ──
const key = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))
const auth = new JWT({ email: key.client_email, key: key.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const api = (url, opts = {}) => auth.request({ url: `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${url}`, ...opts }).then(r => r.data)
const meta = await api('?fields=sheets.properties')
const hoja = meta.sheets.find(s => s.properties.title === HOJA)
if (!hoja) { console.error('No existe la hoja', HOJA); process.exit(1) }
const filasTotal = hoja.properties.gridProperties.rowCount
const valores = (await api(`/values/${encodeURIComponent(HOJA)}!A1:P${filasTotal}?valueRenderOption=UNFORMATTED_VALUE`)).values || []
{
  const enc = (valores[0] || []).map(c => limpiar(c).toUpperCase()), fila2 = (valores[1] || []).map(c => limpiar(c).toUpperCase())
  const idx = (n) => enc.findIndex(c => c.startsWith(n))
  if (idx('SKU') >= 0) COL.sku = idx('SKU'); if (idx('DESC') >= 0) COL.desc = idx('DESC'); if (idx('PRECIO') >= 0) COL.precio = idx('PRECIO')
  COL.unidad = idx('UNIDAD')
  const t = TIENDAS.map(n => fila2.indexOf(n)); if (t.every(i => i >= 0)) COL.tiendas = t
  console.log('Columnas:', JSON.stringify(COL))
}
// Colores actuales de la columna A (para saber qué ya está en verde y no repintar)
const fmt = await api(`?ranges=${encodeURIComponent(HOJA)}!A1:A${filasTotal}&fields=sheets.data.rowData.values.effectiveFormat.backgroundColor`)
const colorA = (fmt.sheets?.[0]?.data?.[0]?.rowData || []).map(r => r?.values?.[0]?.effectiveFormat?.backgroundColor || null)
const yaVerde = (i) => { const c = colorA[i]; return !!c && (c.green ?? 1) > 0.85 && (c.red ?? 1) < 0.95 && (c.blue ?? 1) < 0.95 }

// ── Leer filas ──
let categoria = ''
const items = [], avisos = []
const vistos = new Map()
for (let i = 2; i < valores.length; i++) { // fila 3 en adelante (1 = encabezado, 2 = tiendas)
  const f = valores[i] || []
  const sku = limpiar(f[COL.sku]).toUpperCase(), desc = limpiar(f[COL.desc]), precio = num(f[COL.precio])
  const llenas = [f[COL.sku], f[COL.desc], f[COL.precio], ...COL.tiendas.map(c => f[c])].filter(v => limpiar(v) !== '').length
  if (!sku && !desc && precio == null) continue
  if (sku && !desc && precio == null && !esSku(sku) && llenas === 1) { categoria = sku.replace(/\s*-\s*[A-Z]{1,6}$/i, '').trim(); continue }
  const fila = i + 1
  const ex = {}; COL.tiendas.forEach((c, k) => { const n = num(f[c]); if (n != null && n >= 0) ex[TIENDAS[k]] = n })
  const up = COL.unidad >= 0 ? limpiar(f[COL.unidad]).toUpperCase() : ''
  const unidad = up.startsWith('PAR') ? 'Par' : 'Unidad' // UNIDAD/PAR del sheet: cómo se vende (y se cuenta) la pieza
  if (!sku) { avisos.push(`fila ${fila}: sin SKU ("${desc}")`); continue }
  if (!desc) { avisos.push(`fila ${fila}: ${sku} sin descripción`); continue }
  if (precio == null || precio <= 0) { avisos.push(`fila ${fila}: ${sku} sin precio`); continue }
  if (vistos.has(sku)) { avisos.push(`fila ${fila}: SKU repetido ${sku} (ya en fila ${vistos.get(sku)})`); continue }
  vistos.set(sku, fila)
  items.push({ fila, sku, nombre: desc, categoria, precio, unidad, existencias: ex, verde: yaVerde(i) })
}
console.log(`Sheet "${HOJA}": ${valores.length} filas · ${items.length} piezas completas · ${avisos.length} filas incompletas`)

// ── Firestore ──
admin.initializeApp({ credential: admin.credential.applicationDefault() })
const db = admin.firestore()
const sucSnap = await db.collection('sucursales').where('empresaId', '==', EMPRESA).get()
const sucPorNombre = {}; sucSnap.docs.forEach(d => { sucPorNombre[limpiar(d.data().nombre).toUpperCase()] = d.id })
const mapa = MAPA_SUCURSALES[EMPRESA] || Object.fromEntries(TIENDAS.map(t => [t, t]))
const sucDe = (tienda) => sucPorNombre[limpiar(mapa[tienda] || tienda).toUpperCase()] || null
const faltanSuc = TIENDAS.filter(t => !sucDe(t))
if (faltanSuc.length) console.log('⚠ Sin sucursal en ORIÓN para:', faltanSuc.join(', '), '(sus existencias no se cargan)')

const prodSnap = await db.collection('productos').where('empresaId', '==', EMPRESA).get()
const existentes = new Map(); prodSnap.docs.forEach(d => { const c = limpiar(d.data().codigo).toUpperCase(); if (c) existentes.set(c, { id: d.id, ...d.data() }) })
console.log(`Empresa ${EMPRESA}: ${sucSnap.size} sucursales, ${prodSnap.size} productos ya en ORIÓN`)

let crear = 0, actualizar = 0, iguales = 0, conStock = 0
const ops = [], filasVerdes = []
for (const it of items) {
  const precioNeto = r4(it.precio / (1 + IVA))
  const stockPorSucursal = {}; let total = 0
  for (const [tienda, n] of Object.entries(it.existencias)) { const id = sucDe(tienda); if (id && n > 0) { stockPorSucursal[id] = (stockPorSucursal[id] || 0) + n; total += n } }
  const ex = existentes.get(it.sku)
  if (!ex) {
    ops.push({ tipo: 'set', ref: db.collection('productos').doc(), data: {
      codigo: it.sku, nombre: it.nombre, categoria: it.categoria, precio: precioNeto, costo: 0, min: 0, unidad: it.unidad, unidadesAdicionales: [], codigoBarras: '', ubicacion: '',
      stock: total, stockPorSucursal, empresaId: EMPRESA, _origen: 'sheet-palmaria', _filaSheet: it.fila,
      createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    } })
    crear++; if (total > 0) conStock++
  } else {
    const upd = {}
    if (ex.nombre !== it.nombre) upd.nombre = it.nombre
    if ((ex.categoria || '') !== it.categoria) upd.categoria = it.categoria
    if (r4(ex.precio) !== precioNeto) upd.precio = precioNeto
    if ((ex.unidad || 'Unidad') !== it.unidad) upd.unidad = it.unidad
    if (total > 0 && (FIJAR || !(Number(ex.stock) > 0))) { upd.stock = total; upd.stockPorSucursal = stockPorSucursal; conStock++ }
    else if (total > 0 && Number(ex.stock) > 0) avisos.push(`fila ${it.fila}: ${it.sku} tiene existencias en el sheet pero ORIÓN ya tiene ${ex.stock} (no se pisa)`)
    if (Object.keys(upd).length) { upd.updatedAt = admin.firestore.FieldValue.serverTimestamp(); upd._filaSheet = it.fila; ops.push({ tipo: 'update', ref: db.collection('productos').doc(ex.id), data: upd }); actualizar++ } else iguales++
  }
  if (!it.verde) filasVerdes.push(it.fila)
}

console.log(`\nResultado: ${crear} a crear · ${actualizar} a actualizar · ${iguales} sin cambios · ${conStock} con existencias · ${filasVerdes.length} filas por pintar de verde`)
console.log('Unidad/Par:', items.filter(i => i.unidad === 'Par').length, 'piezas en Par ·', items.filter(i => i.unidad === 'Unidad').length, 'por unidad')
const cats = {}; items.forEach(i => { cats[i.categoria] = (cats[i.categoria] || 0) + 1 }); console.log('Por categoría:', Object.entries(cats).map(([k, v]) => `${k || '(sin categoría)'} ${v}`).join(' · '))
if (avisos.length) { console.log(`\nFilas que NO entran (${avisos.length}), primeras 25:`); avisos.slice(0, 25).forEach(a => console.log('  -', a)) }

if (!APLICAR) { console.log('\n(simulación: nada escrito; agregá --aplicar para importar)'); process.exit(0) }

// ── Escribir en lotes ──
for (let i = 0; i < ops.length; i += 400) {
  const b = db.batch()
  ops.slice(i, i + 400).forEach(o => o.tipo === 'set' ? b.set(o.ref, o.data) : b.update(o.ref, o.data))
  await b.commit()
}
console.log(`\n✔ Firestore: ${ops.length} escrituras hechas`)

// ── Pintar verde la celda del SKU (col A) de cada fila importada ──
if (PINTAR && filasVerdes.length) {
  const verde = { red: 0.72, green: 0.88, blue: 0.70 }
  const requests = filasVerdes.map(f => ({ repeatCell: { range: { sheetId: hoja.properties.sheetId, startRowIndex: f - 1, endRowIndex: f, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: verde } }, fields: 'userEnteredFormat.backgroundColor' } }))
  for (let i = 0; i < requests.length; i += 500) await api(':batchUpdate', { method: 'POST', data: { requests: requests.slice(i, i + 500) } })
  console.log(`✔ Sheet: ${filasVerdes.length} SKU pintados de verde`)
}
