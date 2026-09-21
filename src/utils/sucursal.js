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
