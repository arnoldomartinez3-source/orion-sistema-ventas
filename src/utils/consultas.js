// ══════════════════════════════════════════════════════════════════
// Consultas acotadas (para no pagar lecturas de TODO el historial)
// Firestore cobra cada documento leído. Si una pantalla escucha
// `ventas where empresaId == X`, cada vez que se abre (o tras 30 min sin
// escuchar) relee todas las ventas desde el primer día, y el costo crece
// con los años. Por eso las pantallas piden solo lo que muestran:
// un rango de fechas, o los documentos en cierto estado.
//
// Estas consultas necesitan índices compuestos (firestore.indexes.json).
// Si el índice aún no está desplegado, Firestore responde
// `failed-precondition`: en ese caso se cae a la consulta completa y se
// filtra en el navegador, así nada se rompe antes del deploy.
// ══════════════════════════════════════════════════════════════════
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

const docsDe = (snap, extra) => snap.docs.map(d => ({ id: d.id, ...extra, ...d.data() }))

// Valor comparable de un campo: Timestamp → Date; string/number tal cual.
const valorCampo = (v) => (v?.toDate ? v.toDate() : v)

/**
 * Filtros de rango sobre un campo, en dos formas: constraints de Firestore y
 * predicado JS equivalente (para el respaldo sin índice).
 * `desde`/`hasta` pueden ser Date (campos Timestamp) o 'YYYY-MM-DD' (campos string).
 */
export function rango(campo, desde, hasta) {
  const filtros = []
  if (desde != null) filtros.push(where(campo, '>=', desde))
  if (hasta != null) filtros.push(where(campo, '<=', hasta))
  const cumple = (d) => {
    const v = valorCampo(d[campo])
    // Un serverTimestamp pendiente (venta recién creada offline) todavía no tiene valor: cuenta como "ahora".
    const val = v == null && desde instanceof Date ? new Date() : v
    if (val == null || val === '') return false
    if (desde != null && val < desde) return false
    if (hasta != null && val > hasta) return false
    return true
  }
  return { filtros, cumple }
}

/** Documentos cuyo `campo` está en `valores` (máx. 30). */
export function enValores(campo, valores) {
  return { filtros: [where(campo, 'in', valores)], cumple: (d) => valores.includes(d[campo]) }
}

const armar = (col, empresaId, cajeroId, filtros) => query(
  collection(db, col),
  where('empresaId', '==', empresaId),
  ...(cajeroId ? [where('cajeroId', '==', cajeroId)] : []),
  ...filtros,
)

/**
 * onSnapshot acotado con respaldo. Devuelve la función para dejar de escuchar.
 * @param {string} col colección
 * @param {{empresaId:string, cajeroId?:string, filtro:{filtros:any[], cumple:Function}, extra?:object}} opciones
 *        cajeroId: solo para roles que ven lo propio (reglas soloVeLoPropio)
 *        extra: campos que se agregan a cada documento (p. ej. `_origen`)
 */
export function escuchar(col, { empresaId, cajeroId, filtro, extra }, onDatos, onError) {
  let unsub = onSnapshot(armar(col, empresaId, cajeroId, filtro.filtros), s => onDatos(docsDe(s, extra)), err => {
    if (err?.code === 'failed-precondition') {
      console.warn(`[consultas] Falta índice para ${col}; se usa la consulta completa mientras se despliega.`, err.message)
      unsub = onSnapshot(armar(col, empresaId, cajeroId, []), s => onDatos(docsDe(s, extra).filter(filtro.cumple)), e => onError?.(e))
    } else {
      onError?.(err)
    }
  })
  return () => unsub()
}

/** Lectura única acotada (sin escuchar cambios), con el mismo respaldo. */
export async function leer(col, { empresaId, cajeroId, filtro, extra }) {
  try {
    return docsDe(await getDocs(armar(col, empresaId, cajeroId, filtro.filtros)), extra)
  } catch (err) {
    if (err?.code !== 'failed-precondition') throw err
    console.warn(`[consultas] Falta índice para ${col}; se usa la consulta completa mientras se despliega.`, err.message)
    return docsDe(await getDocs(armar(col, empresaId, cajeroId, [])), extra).filter(filtro.cumple)
  }
}

/**
 * Escucha la unión de varias ventanas de fechas sobre `campo` (una consulta por ventana).
 * Sirve para "los últimos 3 meses" + "el mes viejo que el usuario pidió", sin leer lo del medio.
 * @param {{desde:any, hasta?:any}[]} ventanas  Date para campos Timestamp, 'YYYY-MM-DD' para campos string
 */
export function escucharVentanas(col, { empresaId, cajeroId, campo, ventanas, extra }, onDatos, onError) {
  const partes = ventanas.map(() => [])
  const subs = ventanas.map((v, i) => escuchar(col, { empresaId, cajeroId, extra, filtro: rango(campo, v.desde, v.hasta) }, d => {
    partes[i] = d
    onDatos(unirPorId(...partes))
  }, onError))
  return () => subs.forEach(u => u())
}

/** Meses que el cliente ve sin pedir nada (incluye el mes en curso). */
export const MESES_VISIBLES = 3

/** Une varias listas por id (la última gana) — para combinar "recientes" + "pendientes". */
export function unirPorId(...listas) {
  const m = new Map()
  for (const l of listas) for (const d of (l || [])) m.set(d.id, d)
  return [...m.values()]
}

/** Inicio del día local `n` días atrás (0 = hoy a las 00:00). */
export function inicioDelDia(n = 0) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d
}

/** Inicio del mes local actual (o `n` meses atrás). */
export function inicioDelMes(n = 0) {
  const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - n, 1)
}
