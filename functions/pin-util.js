// ══════════════════════════════════════════════════════════════
// pin-util — hasheo del PIN de login de empleados
//
// El PIN NUNCA se guarda en texto plano. Se hashea con scrypt (lento, con salt)
// y solo se guarda `salt:hash` en la bóveda backend-only 'pins_empleado'. Así,
// ni un admin ni un volcado de la base de datos ven el PIN real.
//
// scrypt viene en el módulo 'crypto' de Node → sin dependencias externas.
// ══════════════════════════════════════════════════════════════
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

// Devuelve "salt:hash" (hex). Guardá esta cadena; no el PIN.
export function hashearPin(pin) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(pin), salt, 64).toString('hex')
  return `${salt}:${hash}`
}

// Compara un PIN tecleado contra el "salt:hash" almacenado (comparación
// de tiempo constante para no filtrar información por el tiempo de respuesta).
export function verificarPin(pin, almacenado) {
  if (!almacenado || typeof almacenado !== 'string' || !almacenado.includes(':')) return false
  const [salt, hash] = almacenado.split(':')
  if (!salt || !hash) return false
  const calc = scryptSync(String(pin), salt, 64).toString('hex')
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(calc, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

// Validación server-side del PIN (espejo de la del frontend): 6 dígitos y no
// débil. Devuelve un mensaje de error o null. Así el candado no depende del
// navegador (que se podría saltar).
export function validarPinServidor(pin) {
  const p = String(pin || '')
  if (!/^\d{6}$/.test(p)) return 'El PIN debe tener exactamente 6 dígitos.'
  if (/^(\d)\1{5}$/.test(p)) return 'PIN muy débil (todos los dígitos iguales).'
  if ('0123456789'.includes(p) || '9876543210'.includes(p)) return 'PIN muy débil (secuencia de números).'
  const comunes = ['123456', '654321', '123123', '121212', '112233', '159753', '147258', '696969', '123321', '456789']
  if (comunes.includes(p)) return 'Ese PIN es muy común.'
  return null
}
