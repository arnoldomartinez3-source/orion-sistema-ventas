import * as XLSX from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/xlsx/xlsx.mjs'
import fs from 'node:fs'; XLSX.set_fs(fs)
const f = XLSX.utils.sheet_to_json(XLSX.readFile('C:/Users/geova/Downloads/produc/INVENTARIO ORION + fotos 3-oct.xlsx').Sheets['productos'], { defval: '' }).filter(x => String(x.nombre).trim())
const re = new RegExp(process.argv[2], 'i')
f.filter(x => re.test(x.nombre)).forEach(x => console.log(`${x.codigo} | ${x.nombre} | $${x.precio_con_iva_ayuda} | ${x.codigoBarras} | ${String(x.nota).slice(0, 40)}`))
