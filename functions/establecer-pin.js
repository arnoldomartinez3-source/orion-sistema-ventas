// ══════════════════════════════════════════════════════════════
// establecer-pin — Cloud Function (Firebase v2)
//
// Fija o cambia el PIN de login de un empleado. El PIN se HASHEA en el servidor
// (scrypt) y se guarda en la bóveda backend-only 'pins_empleado/{usuarioId}'.
// El frontend nunca escribe el PIN a Firestore; lo manda acá y este lo hashea.
//
// Candados: quien llama debe ser ADMIN (o 'crear_usuarios'/'editar_usuarios') de
// LA MISMA empresa que el usuario objetivo — o el maestro de One Geo.
//
// Entrada (POST JSON, con Authorization: Bearer <idToken>):
//   { empresaId, usuarioId, pin }
// ══════════════════════════════════════════════════════════════
import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { hashearPin, validarPinServidor } from './pin-util.js'

if (!getApps().length) {
  initializeApp()
}
const db = getFirestore()

const CORREOS_MAESTROS = ['arnoldomartinez3@gmail.com']

export const establecerPin = onRequest(
  { timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Método no permitido' })
    }
    try {
      // ── Autenticar al que llama ──
      const header = req.headers.authorization || ''
      const idToken = header.startsWith('Bearer ') ? header.slice(7) : null
      if (!idToken) return res.status(401).json({ ok: false, error: 'No autenticado' })
      let decoded
      try {
        decoded = await getAuth().verifyIdToken(idToken)
      } catch {
        return res.status(401).json({ ok: false, error: 'Sesión inválida' })
      }

      const { empresaId, usuarioId, pin, esNuevo } = req.body || {}
      if (!empresaId || !usuarioId || !pin) {
        return res.status(400).json({ ok: false, error: 'Faltan datos (empresaId, usuarioId, pin)' })
      }

      const email = (decoded.email || '').trim().toLowerCase()
      const esMaestro = CORREOS_MAESTROS.map(c => c.toLowerCase()).includes(email)

      // ── El que llama debe ser ADMIN de la MISMA empresa (o maestro) ──
      if (!esMaestro) {
        const callerSnap = await db.collection('usuarios').doc(decoded.uid).get()
        if (!callerSnap.exists) return res.status(403).json({ ok: false, error: 'Usuario no válido' })
        const caller = callerSnap.data()
        const permisos = caller.permisos || []
        const puedeGestionar = caller.rol === 'administrador'
          || permisos.includes('crear_usuarios') || permisos.includes('editar_usuarios')
        if (!puedeGestionar || caller.empresaId !== empresaId) {
          return res.status(403).json({ ok: false, error: 'No autorizado para gestionar usuarios de esta empresa' })
        }
      }

      // ── El usuario objetivo debe existir y ser de esa empresa ──
      const objSnap = await db.collection('usuarios').doc(usuarioId).get()
      if (!objSnap.exists) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' })
      if (objSnap.data().empresaId !== empresaId) {
        return res.status(403).json({ ok: false, error: 'El usuario no pertenece a esa empresa' })
      }

      // ── Tope de usuarios del PLAN (candado de negocio, solo al CREAR) ──
      // El doc ya fue creado por el cliente; si con él se supera el tope, se
      // REVIERTE (borra) y se rechaza. El maestro (One Geo) no tiene tope.
      if (esNuevo === true && !esMaestro) {
        const empSnap = await db.collection('empresas').doc(empresaId).get()
        const maxUsuarios = empSnap.exists ? empSnap.data().maxUsuarios : null
        if (maxUsuarios != null) {
          const cnt = await db.collection('usuarios').where('empresaId', '==', empresaId).count().get()
          if (cnt.data().count > maxUsuarios) {
            await db.collection('usuarios').doc(usuarioId).delete() // rollback del doc recién creado
            return res.status(403).json({
              ok: false,
              error: `Alcanzaste el límite de ${maxUsuarios} usuarios de tu plan. Contactá a One Geo para ampliarlo.`,
            })
          }
        }
      }

      // ── Validar el PIN también en el servidor (no depender del navegador) ──
      const errPin = validarPinServidor(pin)
      if (errPin) return res.status(400).json({ ok: false, error: errPin })

      // ── Hashear y guardar en la bóveda; borrar cualquier pin plano legacy ──
      await db.collection('pins_empleado').doc(usuarioId).set(
        { hash: hashearPin(pin), updatedAt: FieldValue.serverTimestamp(), updatedBy: email },
        { merge: true }
      )
      await db.collection('usuarios').doc(usuarioId).set(
        { pin: FieldValue.delete() },
        { merge: true }
      )

      return res.status(200).json({ ok: true })
    } catch (error) {
      console.error('Error en establecer-pin:', error)
      return res.status(500).json({ ok: false, error: 'Error interno' })
    }
  }
)
