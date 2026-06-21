// ══════════════════════════════════════════════════════════════
// login-empleado — Cloud Function (Firebase v2)
//
// Valida el login de un EMPLEADO (usuario simple + PIN) en el BACKEND,
// con el Admin SDK (se salta las reglas de Firestore). Así el PIN NO se
// expone al navegador.
//
// ANTES: Login.jsx leía toda la colección 'usuarios' SIN autenticación y
// comparaba el PIN en el cliente → cualquiera podía leer los PINs desde la
// consola. Esto es lo que habilita, además, cerrar la regla de 'usuarios'.
//
// Entrada (POST JSON): { usuarioSimple, pin }
// Salida: { ok: true, empleado: {...sin pin...} } | { ok: false, error }
//
// El frontend, tras recibir ok:true, hace signInAnonymously y crea su sesión
// (sesiones_empleado) como hasta ahora.
// ══════════════════════════════════════════════════════════════

import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

if (!getApps().length) {
  initializeApp()
}

const db = getFirestore()

export const loginEmpleado = onRequest(
  { timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Método no permitido' })
    }

    try {
      const { usuarioSimple, pin } = req.body || {}
      if (!usuarioSimple || !pin) {
        return res.status(400).json({ ok: false, error: 'Faltan usuario o PIN' })
      }

      const usuario = String(usuarioSimple).toLowerCase().trim()

      // Buscar el empleado por usuarioSimple (Admin SDK: se salta las reglas)
      const snap = await db.collection('usuarios')
        .where('usuarioSimple', '==', usuario)
        .limit(1)
        .get()

      if (snap.empty) {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' })
      }

      const docu = snap.docs[0]
      const data = docu.data()

      if (data.activo === false) {
        return res.status(403).json({ ok: false, error: 'Tu cuenta está desactivada' })
      }

      // Comparación del PIN en el backend (nunca llega al navegador)
      if (String(data.pin) !== String(pin)) {
        return res.status(401).json({ ok: false, error: 'PIN incorrecto' })
      }

      // Custom token con el id del doc como uid. Al loguearse con él, request.auth.uid
      // será el id del doc 'usuarios' del empleado, así las reglas (misDatos) leen SU
      // doc real — que el empleado NO puede editar. Reemplaza a 'sesiones_empleado'
      // (que el cliente escribía y podía falsificar).
      const token = await getAuth().createCustomToken(docu.id, { empleadoPin: true })

      // Devolver el perfil SIN el pin
      const { pin: _omitPin, ...sinPin } = data
      return res.status(200).json({
        ok: true,
        token,
        empleado: { id: docu.id, ...sinPin },
      })
    } catch (error) {
      console.error('Error en login-empleado:', error)
      return res.status(500).json({ ok: false, error: 'Error interno' })
    }
  }
)
