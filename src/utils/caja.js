// ══════════════════════════════════════════════════════════════════
// Cálculo de una caja (turno) — FUENTE ÚNICA para la pantalla Caja y Reportes.
// Antes el cálculo vivía copiado en Caja.jsx y leía un campo que la venta
// nunca guarda (`metodoPago`), así que todo se sumaba como efectivo. Tenerlo
// en un solo lugar evita que las dos pantallas vuelvan a dar números distintos.
// ══════════════════════════════════════════════════════════════════
import { esAnulada, esDevolucion } from './devoluciones'

// Ventas que pertenecen a la caja: mismo cajero y dentro del turno
// (desde la apertura hasta el cierre; si sigue abierta, hasta ahora).
export function ventasDeCaja(caja, ventas) {
  const apertura = caja.fechaApertura?.toDate?.() || new Date(0)
  const cierre = caja.fechaCierre?.toDate?.() || new Date()
  return ventas.filter(v => {
    if (!v.createdAt) return false
    const fechaVenta = v.createdAt.toDate?.() || new Date()
    const cajeroMatch = v.cajeroId === caja.cajeroId || v.cajero === caja.cajeroNombre
    return cajeroMatch && fechaVenta >= apertura && (caja.estado === 'abierta' || fechaVenta <= cierre)
  })
}

// Reparte lo cobrado por medio de pago. La venta guarda `formaPago`
// ('efectivo' | 'tarjeta' | 'transferencia' | 'cheque' | 'mixto' | 'credito').
// El mixto se reparte con `pagosDesglose`; el crédito no entra a caja.
// No cuentan: lo ANULADO (ese dinero no se cobró o se devolvió) ni las devoluciones
// (NC / Evento de Retorno): el dinero devuelto en efectivo entra como SALIDA en
// `movimientosEfectivo` al registrar la devolución, así no se resta dos veces.
export function totalesPorMedio(ventas) {
  const porMedio = { efectivo: 0, tarjeta: 0, transferencia: 0, cheque: 0, credito: 0 }
  for (const v of ventas) {
    if (esAnulada(v) || esDevolucion(v)) continue
    const cobrado = Number(v.totalPagar ?? v.total) || 0
    const fp = v.formaPago || v.metodoPago || 'efectivo'
    if (fp === 'mixto' && Array.isArray(v.pagosDesglose)) {
      v.pagosDesglose.forEach(p => { if (porMedio[p.metodo] !== undefined) porMedio[p.metodo] += Number(p.monto) || 0 })
    } else if (porMedio[fp] !== undefined) {
      porMedio[fp] += cobrado
    } else {
      porMedio.efectivo += cobrado
    }
  }
  return porMedio
}

// Efectivo esperado de la caja:
//   inicial + ventas en efectivo + ingresos de efectivo − salidas de efectivo
// `movimientosEfectivo` = entradas/salidas que no son ventas; `retiros` es el
// formato viejo (solo salidas) y se sigue restando para cajas anteriores.
export function calcularCaja(caja, ventas) {
  const ventasCaja = ventasDeCaja(caja, ventas)
  const { efectivo, tarjeta, transferencia, cheque, credito } = totalesPorMedio(ventasCaja)
  const movs = caja.movimientosEfectivo || []
  const ingresos = movs.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + (Number(m.monto) || 0), 0)
  const salidas = movs.filter(m => m.tipo === 'salida').reduce((s, m) => s + (Number(m.monto) || 0), 0)
  const totalRetiros = (caja.retiros || []).reduce((s, r) => s + (Number(r.monto) || 0), 0) + salidas
  const montoEsperado = (Number(caja.montoInicial) || 0) + efectivo + ingresos - totalRetiros
  return {
    efectivo, tarjeta, transferencia, cheque, credito,
    totalVentas: efectivo + tarjeta + transferencia + cheque + credito,
    totalRetiros, ingresos, salidas, montoEsperado,
    cantidad: ventasCaja.length, ventasCaja,
  }
}
