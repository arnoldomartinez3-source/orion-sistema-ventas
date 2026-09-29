// ══════════════════════════════════════════════════════════════════
// Pago a proveedor ↔ caja ↔ compra
//
// Dos caminos para que el dinero y el inventario no queden descuadrados:
//   A) PAGO PRIMERO: la cajera saca dinero de la gaveta con el motivo
//      "Pago a proveedor". Se registra la salida en la caja y se crea una
//      compra "por completar" (pagada, sin productos). Después alguien con
//      acceso a Compras la abre, agrega los productos y ahí sube el inventario.
//   B) COMPRA PRIMERO: al registrar una compra de contado se dice con qué se
//      pagó; si fue "efectivo de la caja", se registra la salida en la caja
//      abierta del usuario y se abre la gaveta.
// En los dos casos la compra guarda `pagoCaja` (de qué caja salió y cuánto),
// para no descontar dos veces y poder revertirlo si la compra se elimina.
// ══════════════════════════════════════════════════════════════════
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, query, where, arrayUnion, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { sucursalActivaId } from './sucursal'
import { calcularCaja } from './caja'
import { leer, rango } from './consultas'

export const MOTIVO_PAGO_PROVEEDOR = 'Pago a proveedor'
export const ESTADO_POR_COMPLETAR = 'por_completar'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Fecha de hoy en El Salvador, 'YYYY-MM-DD' (la compra guarda la fecha como texto)
export const hoySV = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' })

/** Nombres de los proveedores guardados, para sugerir al escribir. Si el rol no puede leerlos, lista vacía. */
export async function nombresDeProveedores(empresaId) {
  if (!empresaId) return []
  try {
    const snap = await getDocs(query(collection(db, 'proveedores'), where('empresaId', '==', empresaId)))
    return [...new Set(snap.docs.map(d => (d.data().nombre || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  } catch { return [] }
}

/** La caja ABIERTA del usuario (las cajas son por cajero). null si no tiene. */
export async function cajaAbiertaDe(empresaId, usuarioId) {
  if (!empresaId || !usuarioId) return null
  const snap = await getDocs(query(collection(db, 'cajas'),
    where('empresaId', '==', empresaId), where('cajeroId', '==', usuarioId), where('estado', '==', 'abierta')))
  return snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null
}

/** Efectivo que debería haber en la gaveta de una caja abierta (para avisar si el pago no alcanza). null si no se pudo calcular. */
export async function efectivoEsperado(caja, empresaId) {
  try {
    const desde = caja.fechaApertura?.toDate?.() || new Date(0)
    const ventas = await leer('ventas', { empresaId, cajeroId: caja.cajeroId, filtro: rango('createdAt', desde) })
    return r2(calcularCaja(caja, ventas).montoEsperado)
  } catch { return null }
}

/** Anota en la caja una salida (o un ingreso) de efectivo ligado a una compra. */
export async function moverEfectivoDeCaja(cajaId, { tipo = 'salida', monto, motivo, usuario, usuarioId, origen, compraId = '' }) {
  await updateDoc(doc(db, 'cajas', cajaId), {
    movimientosEfectivo: arrayUnion({
      tipo, monto: r2(monto), motivo: String(motivo || '').trim(),
      fecha: new Date().toISOString(), usuario: usuario || '', usuarioId: usuarioId || '',
      origen, ...(compraId && { compraId }),
    }),
  })
}

/**
 * Camino A: crea la compra "por completar" de un pago hecho desde la gaveta.
 * El monto pagado es el TOTAL (con IVA); los productos se agregan después en Compras.
 * Devuelve el id de la compra.
 */
export async function crearCompraPendiente({ empresaId, proveedorNombre, numeroDocumento = '', monto, cajaId = '', usuario = '', usuarioId = '' }) {
  const total = r2(monto)
  const subtotal = r2(total / 1.13)
  const ahora = new Date()
  const sello = hoySV().slice(2).replace(/-/g, '') + '-' + ahora.toLocaleTimeString('en-GB', { timeZone: 'America/El_Salvador', hour: '2-digit', minute: '2-digit' }).replace(':', '')
  const ref = await addDoc(collection(db, 'compras'), {
    numero: `PP-${sello}`, // provisional; al completar recibe su número OC
    proveedorNombre: String(proveedorNombre || '').trim(), proveedorNit: '', proveedorNrc: '',
    tipoDteProveedor: 'CCF', numeroDteProveedor: String(numeroDocumento || '').trim(), codigoGeneracionProveedor: '',
    fechaCompra: hoySV(), fechaVencimiento: '', condicionPago: 'contado', pagoCon: 'caja',
    noOrdenCompra: '', bodega: 'Principal', notas: '', numeroLote: '', lugarEntrega: '',
    items: [], subtotal, iva: r2(total - subtotal), total,
    estado: ESTADO_POR_COMPLETAR, estadoPago: 'pagada', origen: 'gaveta',
    pagoCaja: { cajaId, monto: total, fecha: ahora.toISOString(), usuario, usuarioId },
    registradoPor: usuario, registradoPorId: usuarioId, sucursalId: sucursalActivaId(),
    empresaId, createdAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Al eliminar una compra que se pagó de la caja: devuelve el dinero a ESA caja si sigue abierta.
 * Devuelve 'revertido' | 'caja-cerrada' | 'sin-pago' | 'error'.
 */
export async function revertirPagoDeCaja(compra, { usuario, usuarioId }) {
  const pago = compra?.pagoCaja
  if (!pago?.cajaId || !(Number(pago.monto) > 0)) return 'sin-pago'
  try {
    const snap = await getDoc(doc(db, 'cajas', pago.cajaId))
    if (!snap.exists() || snap.data().estado !== 'abierta') return 'caja-cerrada'
    await moverEfectivoDeCaja(pago.cajaId, {
      tipo: 'ingreso', monto: pago.monto, usuario, usuarioId, origen: 'compra', compraId: compra.id,
      motivo: `Reverso de compra ${compra.numero || ''} — ${compra.proveedorNombre || ''}`.trim(),
    })
    return 'revertido'
  } catch { return 'error' }
}
