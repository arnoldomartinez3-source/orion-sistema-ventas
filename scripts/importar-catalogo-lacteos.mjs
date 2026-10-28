// Carga el catálogo de Super Lácteos (Excel armado con las fotos de la cajera) como BASE en otra empresa:
// nombre, código interno, categoría y código de barras; SIN precio ni existencias (los pone el dueño después).
// Uso: GOOGLE_APPLICATION_CREDENTIALS=<llave> EMPRESA=<empresaId> node scripts/importar-catalogo-lacteos.mjs [--forzar]
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import XLSX from 'xlsx'

const EMPRESA = process.env.EMPRESA; if (!EMPRESA) { console.error('Falta EMPRESA'); process.exit(1) }
const EXCEL = process.env.EXCEL || 'C:/Users/geova/Downloads/produc/INVENTARIO ORION + fotos 3-oct.xlsx'
initializeApp({ credential: applicationDefault() }); const db = getFirestore()

const wb = XLSX.readFile(EXCEL)
const prod = XLSX.utils.sheet_to_json(wb.Sheets['productos'], { defval: '' })
const otros = XLSX.utils.sheet_to_json(wb.Sheets['otros'] || {}, { defval: '' })
const cod = r => String(r.codigoBarras || '').trim(); const valido = c => /^\d{8,14}$/.test(c)
const limpio = t => String(t || '').replace(/\s+/g, ' ').trim()
// Genéricos de Super Lácteos (filas que eran "precios" o un nombre sin variante y sin código): no sirven en otra tienda
const generico = r => (/^Separado por/i.test(String(r.nota || '')) || /^CHURR/i.test(limpio(r.nombre))) && !valido(cod(r))

const items = []; const vistosNombre = new Set(); const vistosCod = new Set(); let excluidos = 0
for (const r of prod) {
  const nombre = limpio(r.nombre); if (!nombre) continue
  if (generico(r)) { excluidos++; continue }
  const c = valido(cod(r)) ? cod(r) : ''
  if (c && vistosCod.has(c)) { excluidos++; continue }
  vistosNombre.add(nombre.toUpperCase()); if (c) vistosCod.add(c)
  items.push({ codigo: limpio(r.codigo), nombre, categoria: limpio(r.categoria).toUpperCase(), codigoBarras: c })
}
// Hoja "otros": productos sueltos que no estén ya; reciben código interno nuevo
let siguiente = Math.max(0, ...items.map(i => parseInt(String(i.codigo).replace(/\D/g, '')) || 0)) + 1
let deOtros = 0
for (const r of otros) {
  const nombre = limpio(r.nombre); if (!nombre) continue
  const c = valido(cod(r)) ? cod(r) : ''
  if (vistosNombre.has(nombre.toUpperCase()) || (c && vistosCod.has(c))) continue
  vistosNombre.add(nombre.toUpperCase()); if (c) vistosCod.add(c)
  items.push({ codigo: 'P' + String(siguiente++).padStart(3, '0'), nombre, categoria: limpio(r.categoria).toUpperCase(), codigoBarras: c }); deOtros++
}

const yaHay = await db.collection('productos').where('empresaId', '==', EMPRESA).count().get()
if (yaHay.data().count > 0 && !process.argv.includes('--forzar')) { console.error('La empresa ya tiene', yaHay.data().count, 'productos; use --forzar para agregar igual'); process.exit(1) }

// Categorías
const catSnap = await db.collection('categorias').where('empresaId', '==', EMPRESA).get()
const catExistentes = new Set(catSnap.docs.map(d => limpio(d.data().nombre).toUpperCase()))
const cats = [...new Set(items.map(i => i.categoria).filter(Boolean))].filter(c => !catExistentes.has(c))
let batch = db.batch(), n = 0
const flush = async () => { if (n) { await batch.commit(); batch = db.batch(); n = 0 } }
for (const c of cats) { batch.set(db.collection('categorias').doc(), { nombre: c, descripcion: '', color: '#4A8FE8', icono: '📦', empresaId: EMPRESA, createdAt: FieldValue.serverTimestamp() }); if (++n >= 400) await flush() }
for (const it of items) {
  batch.set(db.collection('productos').doc(), {
    codigo: it.codigo, nombre: it.nombre, categoria: it.categoria, precio: 0, precioMayoreo: 0, costo: 0, min: 0, stock: 0,
    unidad: 'Unidad', unidadesAdicionales: [], codigoBarras: it.codigoBarras, ubicacion: '', proveedor: '', descuento: 0, fechaVencimiento: '', imagen: '',
    empresaId: EMPRESA, _origen: 'catalogo-super-lacteos', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  }); if (++n >= 400) await flush()
}
await flush()
console.log(JSON.stringify({ importados: items.length, conCodigoBarras: items.filter(i => i.codigoBarras).length, deHojaOtros: deOtros, excluidosGenericosYRepetidos: excluidos, categoriasCreadas: cats.length }, null, 1))
