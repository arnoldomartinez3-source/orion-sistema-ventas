// Exporta el inventario de una empresa a un Excel pensado para que el DUEÑO llene la columna
// "precioConIva" (precio de venta al público). Luego se sube en Inventario → Importar: el importador
// convierte precioConIva → precio sin IVA (/1.13) y conserva el stock que ya tienen.
// Uso (con la llave de servicio en GOOGLE_APPLICATION_CREDENTIALS):
//   node scripts/exportar-precios-con-iva.mjs <empresaId> "<ruta salida.xlsx>"
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import XLSX from 'xlsx'

const [empresaId, salida] = process.argv.slice(2)
if (!empresaId || !salida) { console.error('uso: node exportar-precios-con-iva.mjs <empresaId> <salida.xlsx>'); process.exit(1) }
initializeApp({ credential: applicationDefault() }); const db = getFirestore()

const emp = await db.collection('empresas').doc(empresaId).get()
const s = await db.collection('productos').where('empresaId', '==', empresaId).get()
const filas = s.docs.map(d => d.data())
  .sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '') || (a.nombre || '').localeCompare(b.nombre || ''))
  .map(p => ({
    codigo: p.codigo || '',
    codigoBarras: p.codigoBarras || '',
    nombre: p.nombre || '',
    categoria: p.categoria || '',
    stock: p.stock || 0,
    precioConIva: p.precio ? Math.round(p.precio * 1.13 * 100) / 100 : '',
  }))
const ws = XLSX.utils.json_to_sheet(filas, { header: ['codigo', 'codigoBarras', 'nombre', 'categoria', 'stock', 'precioConIva'] })
ws['!cols'] = [{ wch: 10 }, { wch: 16 }, { wch: 48 }, { wch: 18 }, { wch: 8 }, { wch: 14 }]
// encabezados en negrita no aplican sin estilos; dejamos la fila 1 tal cual y congelamos
ws['!freeze'] = { xSplit: 0, ySplit: 1 }
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Precios')
const ayuda = XLSX.utils.aoa_to_sheet([
  ['CÓMO LLENAR ESTE ARCHIVO'],
  ['1. Solo escriba en la columna "precioConIva": el precio de venta al público, con IVA incluido, tal como lo cobra (ej. 1.25).'],
  ['2. No cambie "codigo", "codigoBarras" ni "nombre": así ORIÓN reconoce el producto.'],
  ['3. "stock" es informativo (las existencias que ya tienen); no se toca al subir el archivo.'],
  ['4. Puede dejar productos sin precio y subirlos después; los que tengan precio quedan listos para vender.'],
  ['5. Guarde el archivo y entréguelo para subirlo en Inventario → Importar.'],
])
ayuda['!cols'] = [{ wch: 120 }]
XLSX.utils.book_append_sheet(wb, ayuda, 'Instrucciones')
XLSX.writeFile(wb, salida)
console.log(`${emp.data()?.nombre || empresaId}: ${filas.length} productos → ${salida} (sin precio: ${filas.filter(f => f.precioConIva === '').length})`)
