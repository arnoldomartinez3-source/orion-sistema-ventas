// Fotos del 10-oct (abarrotes, lacteos, galletas y desechables): actualiza existentes y agrega filas nuevas.
import * as XLSX from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/xlsx/xlsx.mjs'
import fs from 'node:fs'
XLSX.set_fs(fs)
const ARCHIVO = 'C:/Users/geova/Downloads/produc/INVENTARIO ORION + fotos 3-oct.xlsx'
const RESPALDO = ARCHIVO.replace('.xlsx', ' (antes de ' + new Date().toISOString().slice(0, 10) + ').xlsx')
const ok = (s) => { if (s.length === 12) s = '0' + s; const d = s.split('').map(Number); const w = d.length === 8 ? [3, 1, 3, 1, 3, 1, 3] : [1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3]; const sum = d.slice(0, -1).reduce((a, x, i) => a + x * w[i], 0); return (10 - sum % 10) % 10 === d[d.length - 1] }
import { F, ACTUALIZAR, SEP, NOTAS, NUEVOS } from './datos-fotos.mjs'
const todos = [...ACTUALIZAR.filter(x => x[3]).map(x => x[3]), ...NUEVOS.filter(x => x[3]).map(x => x[3])]
const malos = todos.filter(c => !ok(c)); if (malos.length) { console.log('VERIFICADOR INVÁLIDO:', malos); process.exit(1) }
const rep = todos.filter((c, i, a) => a.indexOf(c) !== i); if (rep.length) { console.log('REPETIDOS:', rep); process.exit(1) }
console.log('códigos:', todos.length, 'válidos y sin repetir')
if (process.argv[2] !== 'escribir') process.exit(0)
if (!fs.existsSync(RESPALDO)) fs.copyFileSync(ARCHIVO, RESPALDO)
const wb = XLSX.readFile(ARCHIVO, { cellFormula: true }); const ws = wb.Sheets['productos']
const rango = XLSX.utils.decode_range(ws['!ref'])
const cab = []; for (let c = 0; c <= rango.e.c; c++) cab.push(String(ws[XLSX.utils.encode_cell({ r: 0, c })]?.v || ''))
const dir = (r, n) => XLSX.utils.encode_cell({ r, c: cab.indexOf(n) }); const val = (r, n) => String(ws[dir(r, n)]?.v ?? '').trim()
const texto = (r, n, v) => { ws[dir(r, n)] = { t: 's', v: String(v), z: '@' } }
const filaDe = (codigo) => { for (let r = 1; r <= rango.e.r; r++) if (val(r, 'codigo') === codigo && val(r, 'nombre')) return r; throw new Error('no está ' + codigo) }
const usados = new Map(); let ultimo = 0, fin = 0
for (let r = 1; r <= rango.e.r; r++) if (val(r, 'nombre')) { fin = r; const m = /^P(\d+)$/.exec(val(r, 'codigo')); if (m) ultimo = Math.max(ultimo, +m[1]); if (val(r, 'codigoBarras')) usados.set(val(r, 'codigoBarras'), val(r, 'nombre')) }
for (const [cod, viejo, nuevo, barras, extra] of ACTUALIZAR) {
  const r = filaDe(cod)
  if (val(r, 'nombre') !== viejo) throw new Error(`${cod}: "${val(r, 'nombre')}" no es "${viejo}"`)
  if (/^\d{8,14}$/.test(val(r, 'codigoBarras'))) throw new Error(cod + ' ya tenía código')
  if (barras && usados.has(barras)) throw new Error(barras + ' ya está en ' + usados.get(barras))
  texto(r, 'nombre', nuevo); if (barras) { texto(r, 'codigoBarras', barras); usados.set(barras, nuevo) }
  const n = val(r, 'nota'); texto(r, 'nota', (n ? n + ' · ' : '') + `${F}${barras ? 'código agregado' : 'sin código'}. Antes se llamaba "${viejo}"` + (extra ? '. ' + extra : ''))
}
for (const cod of NOTAS) { const r = filaDe(cod); const n = val(r, 'nota'); if (!n.includes(SEP)) texto(r, 'nota', (n ? n + ' · ' : '') + SEP) }
const formulaModelo = ws[dir(1, 'precio')]?.f
let r = fin, agregados = 0
for (const [nombre, cat, precio, barras, nota] of NUEVOS) {
  if (barras && usados.has(barras)) throw new Error(barras + ' ya está en ' + usados.get(barras))
  r++; ultimo++
  for (let c = 0; c < cab.length; c++) delete ws[XLSX.utils.encode_cell({ r, c })]
  texto(r, 'codigo', 'P' + String(ultimo).padStart(3, '0')); texto(r, 'nombre', nombre); texto(r, 'categoria', cat)
  if (precio !== '') ws[dir(r, 'precio_con_iva_ayuda')] = { t: 'n', v: precio }
  ws[dir(r, 'precio')] = { t: 'n', f: formulaModelo.replace(/([A-Z]+)2\b/g, `$1${r + 1}`), ...(precio !== '' ? { v: Math.round(precio / 1.13 * 10000) / 10000 } : {}) }
  if (barras) { texto(r, 'codigoBarras', barras); usados.set(barras, nombre) } texto(r, 'nota', nota); agregados++
}
ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rango.e.r, r), c: rango.e.c } })
XLSX.writeFile(wb, ARCHIVO)
const f = XLSX.utils.sheet_to_json(XLSX.readFile(ARCHIVO).Sheets['productos'], { defval: '' }).filter(x => String(x.nombre).trim())
const cods = f.map(x => String(x.codigoBarras).trim()).filter(c => /^\d{8,14}$/.test(c)); const ints = f.map(x => x.codigo)
console.log('actualizados:', ACTUALIZAR.length, '| nuevos:', agregados, '| productos:', f.length, '| con código:', cods.length, '| barras repetidas:', cods.filter((c, i) => cods.indexOf(c) !== i), '| internos repetidos:', ints.filter((c, i) => ints.indexOf(c) !== i))
console.log('sin precio:', f.filter(x => !(parseFloat(x.precio_con_iva_ayuda) > 0)).length)
