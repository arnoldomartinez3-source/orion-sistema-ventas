// ══════════════════════════════════════════════════════════════════
// CONFIG DEL ASISTENTE DE CERTIFICACIÓN — ORIÓN / One Geo Systems
//
// Módulo INTERNO de One Geo. Permite generar los DTE de prueba que el MH
// exige para certificar a un cliente, sin hacerlos a mano.
//
// DOBLE CANDADO de acceso (ambos deben cumplirse para ver el módulo):
//   1) El usuario es el MAESTRO (correo de One Geo).
//   2) El flag 'modoCertificacion' está ENCENDIDO en configuracion/global.
//
// Al entregar el sistema al cliente: apagar el flag. El módulo desaparece.
// ══════════════════════════════════════════════════════════════════

// Correos autorizados como "usuario maestro" de One Geo.
// Puede haber más de uno (ej. si sumás un socio o técnico de confianza).
export const CORREOS_MAESTROS = [
  'arnoldomartinez3@gmail.com',
]

// ID de la empresa One Geo en la colección 'empresas'.
// El usuario maestro pertenece a esta empresa (además de gestionar las demás).
export const EMPRESA_ID_ONEGEO = 'eaQSlj4KYmJo6fIelAgq'

// ¿El usuario actual es un maestro de One Geo?
export function esUsuarioMaestro(user) {
  if (!user) return false
  const email = (user.email || '').trim().toLowerCase()
  return CORREOS_MAESTROS.map(c => c.toLowerCase()).includes(email)
}

// ¿Puede ACCEDER al módulo? Doble candado:
//   - es maestro (correo de One Geo), Y
//   - el flag modoCertificacion está encendido.
//
// NOTA de seguridad: a propósito NO usamos un permiso asignable desde la
// pantalla de Usuarios. Si fuera un checkbox, un admin del cliente podría
// activárselo. El acceso queda atado al correo maestro de One Geo, que el
// cliente no controla. `flagEncendido` viene de configuracion.modoCertificacion.
export function puedeUsarCertificacion(user, flagEncendido) {
  return esUsuarioMaestro(user) && flagEncendido === true
}

// Solo el maestro puede VER el switch que enciende/apaga el modo certificación
// (aunque el flag esté apagado). Esto es para que el cliente nunca vea el switch.
export function puedeVerSwitchCertificacion(user) {
  return esUsuarioMaestro(user)
}