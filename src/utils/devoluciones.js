// ══════════════════════════════════════════════════════════════════
// Devoluciones: Nota de Crédito, Evento de Retorno y Anulación
// Hacienda solo recibe el documento; ORIÓN además tiene que mover lo interno:
//   • caja      → salida de efectivo si el dinero se devolvió en efectivo
//   • inventario→ los productos vuelven al stock (entrada en el kardex)
//   • crédito   → la NC baja lo que el cliente debe (abono a su cuenta)
// Y los totales (caja, Dashboard, POS, Reportes) tienen que RESTAR la
// devolución y NO contar lo anulado. Estas funciones son la fuente única.
// ══════════════════════════════════════════════════════════════════
import {
  collection, doc, getDocs, query, where, runTransaction, updateDoc, arrayUnion, increment, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

// ¿El documento (venta o factura) quedó anulado / invalidado?
export const esAnulada = (d) => !!d && (
  d.estado === 'anulada' || d.estadoPago === 'anulada' || d.anulada === true || d.dte_estado_invalidacion === 'INVALIDADO'
)

// ¿Es un documento que DEVUELVE dinero (resta de las ventas)?
export const esDevolucion = (d) => d?.tipoDte === 'NC' || d?.tipoDte === 'Retorno'

// +1 venta normal (incluye ND), −1 devolución
export const signoTipo = (tipoDte) => (tipoDte === 'NC' || tipoDte === 'Retorno' ? -1 : 1)

// Monto con signo para sumar ventas: 0 si está anulada, negativo si es devolución
export const montoNeto = (d, campo = 'total') => (esAnulada(d) ? 0 : (Number(d?.[campo]) || 0) * signoTipo(d?.tipoDte))

// Lo que el cliente todavía debe de una factura al crédito (descontando notas de crédito aplicadas)
export const saldoFactura = (f) => Math.max(0, Math.round(((Number(f?.totalPagar ?? f?.total) || 0) - (Number(f?.notasCreditoMonto) || 0)) * 100) / 100)

export const MEDIOS_DEVOLUCION = [
  { id: 'efectivo', label: 'Efectivo', desc: 'Sale de tu caja abierta y se abre la gaveta' },
  { id: 'tarjeta', label: 'Tarjeta', desc: 'Reverso en el POS del banco. No toca la caja' },
  { id: 'transferencia', label: 'Transferencia', desc: 'Se le transfiere. No toca la caja' },
  { id: 'abono', label: 'Abono a su cuenta', desc: 'Baja lo que el cliente debe de su factura al crédito' },
  { id: 'ninguno', label: 'No se devolvió dinero', desc: 'Cambio de producto o solo corrección del documento' },
]

// Medio sugerido según cómo se cobró el documento original
export function medioSugerido({ tipo, facturaOrigen }) {
  const credito = facturaOrigen?.tipoPago === 'credito'
  if (tipo === 'anulacion') return credito ? 'ninguno' : (['tarjeta', 'transferencia'].includes(facturaOrigen?.formaPago) ? facturaOrigen.formaPago : 'efectivo')
  if (credito && saldoFactura(facturaOrigen) > 0 && !esAnulada(facturaOrigen)) return 'abono'
  return ['tarjeta', 'transferencia'].includes(facturaOrigen?.formaPago) ? facturaOrigen.formaPago : 'efectivo'
}

// Ítems a reponer: se cruzan los ítems devueltos con los de la VENTA original, que guarda el id del
// producto y el factor de la presentación. `itemsDevueltos` null = devolución total.
export async function itemsParaReponer({ empresaId, codigoGeneracion, itemsDevueltos }) {
  if (!codigoGeneracion) return []
  const snap = await getDocs(query(collection(db, 'ventas'), where('empresaId', '==', empresaId), where('codigoGeneracion', '==', codigoGeneracion)))
  const venta = snap.docs[0]?.data()
  const originales = (venta?.items || []).filter(it => it.id && !String(it.id).startsWith('libre_'))
  if (!itemsDevueltos) {
    return originales.map(it => ({ id: it.id, nombre: it.nombre || '', codigo: it.codigo || '', qty: Number(it.qty) || 0, factor: Number(it.factor) || 1 }))
  }
  const usados = new Set()
  return itemsDevueltos.map(dev => {
    const i = originales.findIndex((it, idx) => !usados.has(idx) && ((dev.codigo && it.codigo === dev.codigo && it.nombre === dev.nombre) || it.nombre === dev.nombre))
    if (i < 0) return null
    usados.add(i)
    const it = originales[i]
    return { id: it.id, nombre: it.nombre || '', codigo: it.codigo || '', qty: Number(dev.qty) || 0, factor: Number(it.factor) || 1 }
  }).filter(x => x && x.qty > 0)
}

/**
 * Registra en ORIÓN los efectos de una devolución. Cada paso es independiente: si uno falla
 * (por ejemplo, sin permiso de inventario) los demás siguen y se devuelve el aviso.
 * @param {object} p
 * @param {'nc'|'retorno'|'anulacion'} p.tipo
 * @param {object} p.docDevolucion   factura de la NC / del retorno / la factura anulada (con id y _origen)
 * @param {object} p.facturaOrigen   factura que se devuelve (para el abono al crédito)
 * @param {number} p.monto           dinero devuelto
 * @param {string} p.medio           efectivo | tarjeta | transferencia | abono | ninguno
 * @param {Array}  p.items           ítems a reponer (de itemsParaReponer); vacío = no tocar inventario
 */
export async function registrarDevolucion({ empresaId, usuario, tipo, docDevolucion, facturaOrigen, monto, medio, items = [], codigoGeneracionOrigen = '' }) {
  const resultado = { avisos: [], caja: false, stock: 0, abono: false }
  const referencia = `${docDevolucion?.tipoDte === 'Retorno' ? 'Retorno' : tipo === 'anulacion' ? 'Anulación' : 'NC'} ${docDevolucion?.numeroControl || docDevolucion?.numero || ''}`.trim()
  const valor = Math.round((Number(monto) || 0) * 100) / 100
  const ahora = new Date()

  // 1) Caja: salida de efectivo en la caja abierta de quien devuelve
  let cajaId = null
  if (medio === 'efectivo' && valor > 0) {
    try {
      const snap = await getDocs(query(collection(db, 'cajas'), where('empresaId', '==', empresaId), where('cajeroId', '==', usuario.id), where('estado', '==', 'abierta')))
      // Solo la caja de QUIEN devuelve: ponerla en la de otro cajero le crearía un faltante ajeno.
      const caja = snap.docs.find(d => d.data().cajeroId === usuario.id) || null
      // Venta ANULADA del mismo turno de esta caja: la caja ya deja de contarla al anularla
      // (totalesPorMedio salta lo anulado); registrar además la salida la restaría dos veces.
      let mismoTurno = false
      if (caja && tipo === 'anulacion' && codigoGeneracionOrigen) {
        const vs = await getDocs(query(collection(db, 'ventas'), where('empresaId', '==', empresaId), where('codigoGeneracion', '==', codigoGeneracionOrigen)))
        const v = vs.docs[0]?.data()
        const c = caja.data()
        const fv = v?.createdAt?.toDate?.(), fa = c.fechaApertura?.toDate?.()
        mismoTurno = !!(fv && fa && fv >= fa && (v.cajeroId === c.cajeroId || v.cajero === c.cajeroNombre))
      }
      if (mismoTurno) {
        cajaId = caja.id
        resultado.mismoTurno = true
      } else if (!caja) {
        resultado.avisos.push('No hay una caja abierta a tu nombre: la salida de efectivo NO quedó registrada. Registrala desde Caja → Movimiento de efectivo.')
      } else {
        cajaId = caja.id
        await updateDoc(doc(db, 'cajas', caja.id), {
          movimientosEfectivo: arrayUnion({
            tipo: 'salida', monto: valor, motivo: `Devolución · ${referencia}`,
            fecha: ahora.toISOString(), usuario: usuario.nombre || '', usuarioId: usuario.id || '', origen: 'devolucion',
          }),
        })
        resultado.caja = true
      }
    } catch (e) {
      resultado.avisos.push('No se pudo registrar la salida en la caja: ' + e.message)
    }
  }

  // 2) Inventario: los productos vuelven al stock (unidad base = cantidad × factor)
  const aReponer = (items || []).filter(it => it.id && it.qty > 0)
  if (aReponer.length) {
    try {
      await runTransaction(db, async (tx) => {
        const lecturas = []
        const porProducto = {}
        for (const it of aReponer) {
          porProducto[it.id] = porProducto[it.id] || { ...it, unidades: 0 }
          porProducto[it.id].unidades += it.qty * (it.factor || 1)
        }
        for (const id of Object.keys(porProducto)) {
          const ref = doc(db, 'productos', id)
          const snap = await tx.get(ref)
          if (snap.exists()) lecturas.push({ ref, snap, it: porProducto[id] })
        }
        for (const { ref, snap, it } of lecturas) {
          const p = snap.data()
          const antes = Number(p.stock) || 0
          const despues = Math.round((antes + it.unidades) * 10000) / 10000
          tx.update(ref, { stock: despues })
          tx.set(doc(collection(db, 'kardex')), {
            productoId: ref.id, productoCodigo: p.codigo || it.codigo || '', productoNombre: p.nombre || it.nombre || '',
            tipo: 'entrada', cantidad: it.unidades, unidad: p.unidad || 'u', presentacion: '',
            stockAntes: antes, stockDespues: despues,
            motivo: 'Devolución', referencia,
            sucursalOrigen: '', sucursalDestino: '',
            empresaId, fecha: serverTimestamp(),
          })
        }
        resultado.stock = lecturas.length
      })
    } catch (e) {
      resultado.avisos.push('Los productos NO volvieron al inventario (' + e.message + '). Ajustalo desde Inventario.')
    }
  }

  // 3) Abono: la NC baja lo que el cliente debe de la factura al crédito
  if (medio === 'abono' && valor > 0 && facturaOrigen?.id) {
    try {
      const saldo = Math.round((saldoFactura(facturaOrigen) - valor) * 100) / 100
      await updateDoc(doc(db, facturaOrigen._origen || 'facturas', facturaOrigen.id), {
        notasCreditoMonto: increment(valor),
        ...(saldo <= 0.009 && !esAnulada(facturaOrigen) && {
          estadoPago: 'pagada', fechaPago: ahora.toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' }),
          cobradoPor: usuario.nombre || '', cobradoPorId: usuario.id || '',
        }),
        updatedAt: serverTimestamp(),
      })
      resultado.abono = true
    } catch (e) {
      resultado.avisos.push('No se pudo descontar de la cuenta del cliente: ' + e.message)
    }
  }

  // 4) Marca en el documento para no registrarla dos veces
  if (docDevolucion?.id) {
    try {
      await updateDoc(doc(db, docDevolucion._origen || 'facturas', docDevolucion.id), {
        devolucion: {
          medio, monto: valor, stockRepuesto: resultado.stock, cajaId,
          fecha: ahora.toISOString(), usuario: usuario.nombre || '', usuarioId: usuario.id || '',
        },
      })
    } catch (e) {
      resultado.avisos.push('La devolución se registró, pero no se pudo marcar el documento: ' + e.message)
    }
  }
  return resultado
}
