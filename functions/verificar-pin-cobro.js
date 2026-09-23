// ══════════════════════════════════════════════════════════════
// verificar-pin-cobro — Cloud Function (Firebase v2)
//
// "PIN al cobrar": en una caja compartida (una gaveta, varias cajeras), la sesión
// del POS es una sola, y al tocar Cobrar el sistema pregunta QUIÉN cobra con su
// PIN. La venta se guarda con ese nombre (cobradoPor / cobradoPorId) para que el
// cierre y los reportes digan quién vendió qué, sin cambiar de usuario.
//
// El PIN se verifica aquí, con el Admin SDK, contra la bóveda 'pins_empleado'
// (hash scrypt) — nunca llega ningún PIN al navegador. Solo se buscan empleados
// de LA EMPRESA del que llama (sale de su token, no del body).
//
// Entrada (POST JSON, Authorization: Bearer <idToken>): { pin, usuarioId? }
// Salida: { ok: true, empleado: { id, nombre } }
//       | { ok: false, ambiguo: true, candidatos: [{ id, nombre }] }  ← dos con el mismo PIN
//       | { ok: false, error }
// ══════════════════════════════════════════════════════════════

import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { verificarPin } from './pin-util.js'
import { ipDe, estaBloqueado, registrarFallo, limpiarFallos } from './limites.js'

if (!getApps().length) initializeApp()
const db = getFirestore()

// Anti fuerza bruta: por caja (empresa) y por IP. Más holgado que el login porque
// una cajera apurada se equivoca, pero igual corta a quien prueba PINs.
const MAX_INTENTOS = 10
const VENTANA_MS = 10 * 60 * 1000
const LOCKOUT_MS = 2 * 60 * 1000

const nombreDe = (u) => u.nombre || u.usuarioSimple || u.email || 'Empleado'

export const verificarPinCobro = onRequest(
  { timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' })
    try {
      // ── Quién llama: una sesión real de ORIÓN (admin o empleada por PIN) ──
      const h = req.headers.authorization || ''
      const idToken = h.startsWith('Bearer ') ? h.slice(7) : null
      if (!idToken) return res.status(401).json({ ok: false, error: 'Sesión requerida' })
      let decoded
      try { decoded = await getAuth().verifyIdToken(idToken) }
      catch { return res.status(401).json({ ok: false, error: 'Sesión inválida' }) }

      const yoSnap = await db.collection('usuarios').doc(decoded.uid).get()
      const empresaId = yoSnap.exists ? yoSnap.data().empresaId : null
      if (!empresaId) return res.status(403).json({ ok: false, error: 'Esta sesión no pertenece a una empresa' })

      const pin = String(req.body?.pin || '').trim()
      const usuarioId = String(req.body?.usuarioId || '').trim()
      if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ ok: false, error: 'PIN inválido' })

      const claves = [`COBRO__EMP__${empresaId}`, `COBRO__IP__${ipDe(req)}`]
      const bloq = await estaBloqueado(claves)
      if (bloq.bloqueado) return res.status(429).json({ ok: false, error: `Demasiados intentos. Esperá ${bloq.segundos}s.` })

      // ── Empleados activos de la empresa (o solo el elegido si venía usuarioId) ──
      let candidatos
      if (usuarioId) {
        const d = await db.collection('usuarios').doc(usuarioId).get()
        candidatos = d.exists && d.data().empresaId === empresaId ? [d] : []
      } else {
        const snap = await db.collection('usuarios').where('empresaId', '==', empresaId).limit(80).get()
        candidatos = snap.docs
      }
      candidatos = candidatos.filter(d => d.data().activo !== false)
      if (!candidatos.length) return res.status(401).json({ ok: false, error: 'PIN incorrecto' })

      // Hashes de la bóveda en una sola lectura
      const refs = candidatos.map(d => db.collection('pins_empleado').doc(d.id))
      const hashes = await db.getAll(...refs)
      const hashPor = Object.fromEntries(hashes.map(s => [s.id, s.exists ? s.data().hash : null]))

      const coinciden = candidatos.filter(d => {
        const u = d.data()
        const hash = hashPor[d.id]
        if (hash) return verificarPin(pin, hash)
        // Legacy: PIN plano todavía en 'usuarios' (se migra al hacer login)
        return u.pin !== undefined && u.pin !== null && u.pin !== '' && String(u.pin) === pin
      })

      if (coinciden.length === 0) {
        await registrarFallo(claves, { max: MAX_INTENTOS, ventanaMs: VENTANA_MS, lockoutMs: LOCKOUT_MS })
        const b = await estaBloqueado(claves)
        if (b.bloqueado) return res.status(429).json({ ok: false, error: `Demasiados intentos. Esperá ${b.segundos}s.` })
        return res.status(401).json({ ok: false, error: 'PIN incorrecto' })
      }
      await limpiarFallos(claves)

      if (coinciden.length > 1) {
        // Dos empleadas con el mismo PIN: el POS pregunta cuál es y reenvía con usuarioId
        return res.status(200).json({ ok: false, ambiguo: true, candidatos: coinciden.map(d => ({ id: d.id, nombre: nombreDe(d.data()) })) })
      }
      const d = coinciden[0]
      const u = d.data()
      // También sirve para AUTORIZAR (descuento arriba del máximo): admin o permiso autorizar_descuentos
      const autorizaDescuentos = u.rol === 'administrador' || (Array.isArray(u.permisos) && u.permisos.includes('autorizar_descuentos'))
      return res.status(200).json({ ok: true, empleado: { id: d.id, nombre: nombreDe(u), autorizaDescuentos } })
    } catch (error) {
      console.error('Error en verificar-pin-cobro:', error)
      return res.status(500).json({ ok: false, error: 'Error interno' })
    }
  }
)
