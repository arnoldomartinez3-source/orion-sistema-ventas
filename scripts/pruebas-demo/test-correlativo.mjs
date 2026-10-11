// Prueba de lógica de obtenerCorrelativo con una base falsa (sin Firestore): 5 escenarios.
import fs from 'node:fs'
const src = fs.readFileSync('C:/Users/geova/mi-sistema-ventas/functions/transmitir.js', 'utf8')
const ini = src.indexOf('const idContador ='); const fin = src.indexOf('// El token del MH pertenece')
const codigo = src.slice(ini, fin)
const TIPOS_DTE = { FE: '01', CCF: '03' }
const FieldValue = { serverTimestamp: () => 'TS' }
function baseFalsa(docs, porNumeroControl) {
  const col = (nombre) => ({
    doc: (id) => ({ _k: nombre + '/' + id }),
    where: (campo, op, val) => ({ limit: () => ({ _q: { nombre, val } }) }),
  })
  const tx = {
    get: async (ref) => {
      if (ref._q) { const d = porNumeroControl[ref._q.nombre]?.[ref._q.val]; return { empty: !d, docs: d ? [{ data: () => d }] : [] } }
      const d = docs[ref._k]; return { exists: !!d, data: () => d }
    },
    set: (ref, data, opts) => { docs[ref._k] = { ...(opts?.merge ? docs[ref._k] : {}), ...data } },
  }
  return { collection: col, runTransaction: async (fn) => fn(tx), _docs: docs }
}
const casos = [
  ['ya tiene contador propio → suma 1', { 'contadores/A_FE_S001_P001_01': { valor: 40 } }, {}, 'A', 41, null],
  ['sin propio; legado 120 cuyo último número es de A → hereda 121 y marca', { 'contadores/FE_S001_P001_01': { valor: 120 } }, { facturas: { 'DTE-01-S001P001-000000000000120': { empresaId: 'A' } } }, 'A', 121, 'A'],
  ['sin propio; legado 120 de OTRA empresa → arranca en 1 y no toca el legado', { 'contadores/FE_S001_P001_01': { valor: 120 } }, { facturas: { 'DTE-01-S001P001-000000000000120': { empresaId: 'B' } } }, 'A', 1, undefined],
  ['sin propio; legado ya migrado a B → arranca en 1', { 'contadores/FE_S001_P001_01': { valor: 120, migradoA: 'B' } }, {}, 'A', 1, 'B'],
  ['sin propio; legado 7 sin dueño rastreable (número no está guardado) → hereda 8', { 'contadores/FE_S001_P001_01': { valor: 7 } }, {}, 'A', 8, 'A'],
  ['sin propio ni legado → 1', {}, {}, 'A', 1, undefined],
]
let fallos = 0
for (const [nombre, docs, porNC, emp, esperado, migradoA] of casos) {
  const db = baseFalsa({ ...docs }, porNC)
  const fn = new Function('db', 'FieldValue', 'TIPOS_DTE', codigo + '\nreturn obtenerCorrelativo')(db, FieldValue, TIPOS_DTE)
  const n = await fn(emp, 'FE', 'S001', 'P001', '01')
  const propio = db._docs['contadores/A_FE_S001_P001_01']; const legado = db._docs['contadores/FE_S001_P001_01']
  const ok = n === esperado && propio?.valor === esperado && propio?.empresaId === 'A' && (legado?.migradoA ?? undefined) === (migradoA ?? undefined)
  if (!ok) fallos++
  console.log(ok ? 'OK  ' : 'FALLA', nombre, '→', n, '| propio:', JSON.stringify(propio), '| legado:', JSON.stringify(legado))
}
// segunda llamada tras heredar: debe seguir desde el propio
{ const db = baseFalsa({ 'contadores/FE_S001_P001_01': { valor: 120 } }, { facturas: { 'DTE-01-S001P001-000000000000120': { empresaId: 'A' } } })
  const fn = new Function('db', 'FieldValue', 'TIPOS_DTE', codigo + '\nreturn obtenerCorrelativo')(db, FieldValue, TIPOS_DTE)
  const a = await fn('A', 'FE', 'S001', 'P001', '01'), b = await fn('A', 'FE', 'S001', 'P001', '01'), c = await fn('B', 'FE', 'S001', 'P001', '01')
  const ok = a === 121 && b === 122 && c === 1; if (!ok) fallos++
  console.log(ok ? 'OK  ' : 'FALLA', 'A hereda 121, luego 122; B después arranca en 1 →', a, b, c) }
console.log(fallos ? `FALLOS: ${fallos}` : 'TODO OK')
