// Archivo del dueño con 3 hojas: PRECIOS (la misma de 244 que ya tiene), NUEVOS CON CODIGO (lo que no ha visto) y SIN CODIGO.
import * as XLSX from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/xlsx/xlsx.mjs'
import fs from 'node:fs'
import { probable } from './clasif-sincodigo.mjs'
XLSX.set_fs(fs)
const f = XLSX.utils.sheet_to_json(XLSX.readFile('C:/Users/geova/Downloads/produc/INVENTARIO ORION + fotos 3-oct.xlsx').Sheets['productos'], { defval: '' }).filter(x => String(x.nombre).trim())
const generico = (x) => /Separado por (sabor|variante)|Genérico de boquitas/.test(String(x.nota))
const conCodigo = (x) => /^[0-9]{8,14}$/.test(String(x.codigoBarras).trim())
const nuevo = (x) => /producto nuevo/.test(String(x.nota))
const tanda = (x) => { const m = /Foto ([0-9]+)-oct/.exec(String(x.nota)); return m ? +m[1] : 0 }
const estado = (x) => !(parseFloat(x.precio_con_iva_ayuda) > 0) ? '1 FALTA PRECIO' : /confirmar/i.test(x.nota) && /^Fotos? /.test(x.nota) ? '2 CONFIRMAR' : '3 Revisar'
const motivo = (x) => { const n = String(x.nota); if (/impreso/.test(n)) return 'Precio impreso en la bolsa'; if (/a mano/.test(n)) return 'Precio escrito a mano en la bolsa'; if (/deducido/.test(n)) return 'Precio deducido de la etiqueta'; const m = /tomado de[l]? "?([^":]+)"?/.exec(n); if (m) return 'Precio tomado de: ' + m[1].trim(); return '' }
const fila = (x) => ({ tanda: tanda(x) ? String(tanda(x)).padStart(2, '0') + '-oct' : '', estado: estado(x), codigo: x.codigo, barras: String(x.codigoBarras).trim(), producto: x.nombre, categoria: String(x.categoria).trim(), precio_actual: parseFloat(x.precio_con_iva_ayuda) > 0 ? Number(x.precio_con_iva_ayuda) : '', precio_correcto: '', observacion: motivo(x) })
const orden = (a, b) => a.estado.localeCompare(b.estado) || a.categoria.localeCompare(b.categoria) || a.producto.localeCompare(b.producto)
const base = f.filter(x => !generico(x) || conCodigo(x)) // un producto con código no es genérico
// Hoja 1: exactamente lo que ya tiene el dueño (códigos que había hasta el 4-oct)
const viejos = base.filter(x => conCodigo(x) && (nuevo(x) ? tanda(x) <= 4 : tanda(x) <= 3)).map(fila).sort(orden)
// Hoja 2: con código, que el dueño no ha visto (nuevos del 5, 7 y 9 + existentes que recibieron código después)
const nuevosCod = base.filter(x => conCodigo(x) && !(nuevo(x) ? tanda(x) <= 4 : tanda(x) <= 3)).map(fila).sort((a, b) => b.tanda.localeCompare(a.tanda) || orden(a, b))
// Hoja 3: sin código de barras (sin los genéricos que ya se separaron por sabor)
const sinCod = base.filter(x => !conCodigo(x)).map(x => ({ ...fila(x), probable: probable(x.codigo) })).sort((a, b) => a.probable.localeCompare(b.probable) || a.categoria.localeCompare(b.categoria) || a.producto.localeCompare(b.producto))
const hoja = (rows, { conTanda = false, conBarras = true, conProbable = false } = {}) => {
  const ws = XLSX.utils.json_to_sheet(rows.map(r => ({ ...(conProbable ? { '¿Tiene código de barras?': r.probable.slice(2) } : {}), ...(conTanda ? { 'Fotos del': r.tanda } : {}), 'Estado': r.estado.slice(2), 'Código': r.codigo, ...(conBarras ? { 'Código de barras': r.barras } : {}), 'Producto': r.producto, 'Categoría': r.categoria, 'Precio actual (con IVA)': r.precio_actual, 'PRECIO CORRECTO (con IVA)': r.precio_correcto, 'Observación': r.observacion })))
  const cols = [...(conProbable ? [{ wch: 22 }] : []), ...(conTanda ? [{ wch: 10 }] : []), { wch: 14 }, { wch: 8 }, ...(conBarras ? [{ wch: 17 }] : []), { wch: 46 }, { wch: 24 }, { wch: 22 }, { wch: 26 }, { wch: 44 }]
  ws['!cols'] = cols; ws['!autofilter'] = { ref: ws['!ref'] }; ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  const letra = (i) => XLSX.utils.encode_col(i); const iBarras = (conProbable ? 1 : 0) + (conTanda ? 1 : 0) + 2; const iPrecio = iBarras + (conBarras ? 1 : 0) + 2
  for (let r = 2; r <= rows.length + 1; r++) { for (const c of [letra(iPrecio), letra(iPrecio + 1)]) if (ws[c + r] && ws[c + r].t === 'n') ws[c + r].z = '0.00'; if (conBarras) { ws[letra(iBarras) + r].t = 's'; ws[letra(iBarras) + r].z = '@' } }
  return ws }
const wb = XLSX.utils.book_new()
const ins = XLSX.utils.aoa_to_sheet([['COMO LLENAR ESTE ARCHIVO'], [''], ['Este archivo tiene 3 hojas de productos:'], ['   PRECIOS = la misma lista que ya tenia (productos con codigo de barras hasta el 4 de octubre).'], ['   NUEVOS CON CODIGO = productos que NO estaban en esa lista: los nuevos de las fotos del 5, 7 y 9 de octubre y algunos existentes que ya recibieron su codigo. La columna "Fotos del" dice de que dia son las fotos.'], ['   SIN CODIGO = productos que todavia no tienen codigo de barras. Tambien necesitan su precio. Van primero los que SI deberian tener codigo en su empaque (a esos hay que tomarles la foto del codigo),'], ['   luego los que TAL VEZ (unidades sueltas de un paquete, desechables, bazar) y al final los que NO (quesos, cremas, carnes, pan artesanal, especias a granel).'], [''], ['En cada hoja:'], ['1. Mire la columna "Precio actual (con IVA)".'], ['2. Si el precio esta BIEN, no escriba nada.'], ['3. Si esta MAL o esta vacio, escriba el precio correcto en la columna "PRECIO CORRECTO (con IVA)".'], ['4. Escriba siempre el precio al publico, con IVA incluido. Ejemplo: 0.25'], ['5. No cambie la columna "Codigo": con ella se unen los precios al inventario.'], [''], ['Arriba estan primero los que no tienen precio (FALTA PRECIO),'], ['luego los que hay que confirmar (CONFIRMAR) y al final el resto (Revisar).'], ['Puede filtrar por Estado o por Categoria con las flechitas del encabezado.'], [''], ['Si un producto ya no se vende, escriba NO SE VENDE en "Observacion".'], ['Guarde el archivo con el mismo nombre y devuelvalo.']])
ins['!cols'] = [{ wch: 110 }]
XLSX.utils.book_append_sheet(wb, ins, 'INSTRUCCIONES')
XLSX.utils.book_append_sheet(wb, hoja(viejos), 'PRECIOS')
XLSX.utils.book_append_sheet(wb, hoja(nuevosCod, { conTanda: true }), 'NUEVOS CON CODIGO')
XLSX.utils.book_append_sheet(wb, hoja(sinCod, { conBarras: false, conProbable: true }), 'SIN CODIGO')
const dest = 'C:/Users/geova/Downloads/produc/PRECIOS para revisar (con codigo de barras) - Super Lacteos.xlsx'
XLSX.writeFile(wb, dest)
const cuenta = (rows) => { const c = {}; rows.forEach(r => c[r.estado.slice(2)] = (c[r.estado.slice(2)] || 0) + 1); return c }
console.log('PRECIOS:', viejos.length, cuenta(viejos)); console.log('NUEVOS CON CODIGO:', nuevosCod.length, cuenta(nuevosCod)); console.log('SIN CODIGO:', sinCod.length, cuenta(sinCod), (() => { const c = {}; sinCod.forEach(r => c[r.probable] = (c[r.probable] || 0) + 1); return c })()); console.log('genéricos excluidos:', f.filter(x => generico(x) && !conCodigo(x)).length, '| total:', viejos.length + nuevosCod.length + sinCod.length + f.filter(x => generico(x) && !conCodigo(x)).length, 'de', f.length)
const rep = [...viejos, ...nuevosCod].map(r => r.barras).filter((c, i, a) => a.indexOf(c) !== i); console.log('barras repetidas:', rep)
