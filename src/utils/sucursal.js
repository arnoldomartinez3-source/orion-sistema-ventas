// ══════════════════════════════════════════════════════════════════
// Sucursal activa de la sesión.
// La elige el administrador al entrar (SelectorSucursal) y, en el empleado con
// PIN, viene de su usuario (Login.jsx la guarda al autenticar). Vive en
// sessionStorage: es de ESTA pestaña y de ESTE turno.
//
// Se sella en cada movimiento de kardex (ventas, compras, ajustes, devoluciones,
// levantamiento) aunque hoy la existencia sea UNA sola para toda la empresa. El
// día que el inventario se separe por sucursal, el historial ya va a decir en
// qué local pasó cada movimiento; sin esto, todo lo anterior sería un solo bloque
// imposible de repartir hacia atrás.
// ══════════════════════════════════════════════════════════════════
export const sucursalActivaId = () => {
  try { return sessionStorage.getItem('orion_sucursal_activa') || '' } catch { return '' }
}

// ══════════════════════════════════════════════════════════════════
// INVENTARIO POR SUCURSAL (módulo 'inventario_sucursal', por empresa).
//
// El producto conserva `stock` = TOTAL de la empresa (todo lo existente sigue
// leyendo ese campo) y gana `stockPorSucursal: { [sucursalId]: cantidad }`.
// La diferencia  stock − Σ stockPorSucursal  es lo "sin asignar": existencias de
// antes de activar el módulo, o movimientos que todavía no reparten por sucursal.
// Nunca se guarda: se calcula, así el total manda y nada se pierde.
// ══════════════════════════════════════════════════════════════════
export const SIN_ASIGNAR = 'sin'
const red3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000
export const sumaSucursales = (p) => red3(Object.values(p?.stockPorSucursal || {}).reduce((s, v) => s + (Number(v) || 0), 0))
export const sinAsignar = (p) => red3((Number(p?.stock) || 0) - sumaSucursales(p))
// Existencia visible: '' = total, SIN_ASIGNAR = lo no repartido, id = esa sucursal
export const stockEn = (p, sucursalId) => !sucursalId ? red3(p?.stock) : sucursalId === SIN_ASIGNAR ? sinAsignar(p) : red3(p?.stockPorSucursal?.[sucursalId])
