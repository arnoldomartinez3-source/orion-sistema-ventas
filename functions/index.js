// ══════════════════════════════════════════════════════════════
// Cloud Functions for Firebase — ORIÓN / One Geo Systems
//
// Punto de entrada. Cada función vive en su propio archivo y se
// re-exporta acá para que Firebase la despliegue.
//
// Funciones expuestas:
//   - transmitir     → emite y transmite un DTE al MH
//   - invalidar      → anula/invalida un DTE ante el MH
//   - contingencia   → registra eventos de contingencia
//   - crearAdmin     → crea el usuario admin de una empresa cliente
//   - gestionarAdmin → gestiona admins de una empresa (crear, listar,
//                      cambiar correo/clave, activar/desactivar)
// ══════════════════════════════════════════════════════════════

export { transmitir } from './transmitir.js'
export { invalidar } from './invalidar.js'
export { contingencia } from './contingencia.js'
export { crearAdmin } from './crear-admin.js'
export { gestionarAdmin } from './gestionar-admin.js'
export { loginEmpleado } from './login-empleado.js'