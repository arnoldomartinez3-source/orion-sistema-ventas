// ══════════════════════════════════════════════════════════════
// limites — control de intentos fallidos (anti fuerza bruta)
//
// Antes cada función leía el contador, sumaba y lo guardaba: dos intentos a la
// vez se pisaban y el límite se podía saltar mandando pedidos en paralelo. Acá
// el conteo va dentro de una TRANSACCIÓN, y se cuenta por varias "puertas":
// empresa, usuario y dirección IP, para que un atacante de internet no pueda
// dejar bloqueada a toda la empresa ni probar PINs sin freno.
// ══════════════════════════════════════════════════════════════
import { getFirestore } from 'firebase-admin/firestore'

// getFirestore() se llama DENTRO de cada función: el módulo se importa antes de que
// la función dueña ejecute initializeApp().
const db = () => getFirestore()
const COL = 'login_intentos'

// IP de quien llama (Cloud Run la pone en x-forwarded-for). Se limpia para usarla como id.
export function ipDe(req) {
  const xf = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
  const ip = xf || req?.ip || 'sin-ip'
  return ip.replace(/[^\w.:-]/g, '_').slice(0, 60)
}

/**
 * ¿Alguna de las puertas está bloqueada ahora?
 * @param {string[]} claves  ids de los contadores (empresa, usuario, IP…)
 * @returns {Promise<{bloqueado:boolean, segundos:number}>}
 */
export async function estaBloqueado(claves) {
  const ahora = Date.now()
  const snaps = await db().getAll(...claves.map(c => db().collection(COL).doc(c)))
  let hasta = 0
  for (const s of snaps) {
    const d = s.exists ? s.data() : null
    if (d?.bloqueadoHasta && d.bloqueadoHasta > ahora) hasta = Math.max(hasta, d.bloqueadoHasta)
  }
  return { bloqueado: hasta > 0, segundos: hasta ? Math.ceil((hasta - ahora) / 1000) : 0 }
}

/** Suma un fallo a cada puerta (transaccional) y bloquea la que llegue al máximo. */
export async function registrarFallo(claves, { max, ventanaMs, lockoutMs }) {
  const ahora = Date.now()
  await Promise.all(claves.map(clave => db().runTransaction(async (tx) => {
    const ref = db().collection(COL).doc(clave)
    const snap = await tx.get(ref)
    const d = snap.exists ? snap.data() : null
    const dentro = d?.ultimo && (ahora - d.ultimo) < ventanaMs
    const intentos = (dentro ? (d.intentos || 0) : 0) + 1
    tx.set(ref, intentos >= max
      ? { intentos, ultimo: ahora, bloqueadoHasta: ahora + lockoutMs }
      : { intentos, ultimo: ahora, bloqueadoHasta: 0 },
      { merge: true })
  })))
}

/** Borra los contadores tras un ingreso correcto. */
export async function limpiarFallos(claves) {
  await Promise.all(claves.map(c => db().collection(COL).doc(c).set({ intentos: 0, bloqueadoHasta: 0 }, { merge: true })))
}
