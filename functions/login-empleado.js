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
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { hashearPin, verificarPin } from './pin-util.js'

if (!getApps().length) {
  initializeApp()
}

const db = getFirestore()

// Anti fuerza bruta del PIN: tras MAX_INTENTOS fallidos dentro de VENTANA_MS,
// se bloquea ese usuario por LOCKOUT_MS. El conteo vive en 'login_intentos/{usuario}'
// (solo el Admin SDK lo toca; en las reglas va read/write: if false).
import { ipDe, estaBloqueado, registrarFallo, limpiarFallos } from './limites.js'

// Mismo mensaje para código, usuario o PIN equivocados: si cada caso dijera algo
// distinto, cualquiera podría averiguar qué códigos de empresa y qué usuarios existen.
const MSG_CREDENCIALES = 'Código de empresa, usuario o PIN incorrecto.'

const MAX_INTENTOS = 5
const LOCKOUT_MS = 5 * 60 * 1000   // 5 minutos de bloqueo
const VENTANA_MS = 15 * 60 * 1000  // ventana para contar fallos consecutivos

// Límite a nivel EMPRESA: corta el "rociado de PIN" (un PIN común probado en
// muchos usuarios distintos, que el límite por-usuario no alcanza a frenar).
const EMPRESA_MAX = 25              // fallos en la empresa dentro de la ventana
const VENTANA_EMP = 10 * 60 * 1000 // ventana de conteo (10 min)
const LOCKOUT_EMP = 5 * 60 * 1000  // bloqueo de TODA la empresa (5 min)

export const loginEmpleado = onRequest(
  { timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Método no permitido' })
    }

    try {
      const { usuarioSimple, pin, codigoEmpresa } = req.body || {}
      if (!usuarioSimple || !pin) {
        return res.status(400).json({ ok: false, error: 'Faltan usuario o PIN' })
      }
      if (!codigoEmpresa) {
        return res.status(400).json({ ok: false, error: 'Falta el código de empresa' })
      }

      const usuario = String(usuarioSimple).toLowerCase().trim()
      const codigo = String(codigoEmpresa).toUpperCase().trim()

      // ── Resolver la EMPRESA por su código, EN EL SERVIDOR (no se confía en lo
      // que manda el navegador). Así 'usuarioSimple' se busca SOLO dentro de esa
      // empresa → dos empresas pueden tener el mismo usuario/PIN sin cruzarse. ──
      // Límite por IP antes de tocar nada (un atacante de internet no debe poder
      // probar códigos ni usuarios sin freno, ni dejar bloqueada a una empresa entera).
      const ip = ipDe(req)
      const claveIp = `IP__${ip}`
      const bloqIp = await estaBloqueado([claveIp])
      if (bloqIp.bloqueado) {
        return res.status(429).json({ ok: false, error: `Demasiados intentos. Esperá ${bloqIp.segundos}s e intentá de nuevo.` })
      }

      const empSnap = await db.collection('empresas')
        .where('codigoAcceso', '==', codigo).limit(1).get()
      if (empSnap.empty) {
        await registrarFallo([claveIp], { max: EMPRESA_MAX, ventanaMs: VENTANA_EMP, lockoutMs: LOCKOUT_EMP })
        return res.status(401).json({ ok: false, error: MSG_CREDENCIALES })
      }
      const empresaId = empSnap.docs[0].id
      const empData = empSnap.docs[0].data()
      const empresaNombre = empData.nombreComercial || empData.nombre || ''

      // ── ¿Bloqueado por intentos fallidos? (empresa, empresa+usuario o IP) ──
      const empRlRef = db.collection('login_intentos').doc(`EMP__${empresaId}`)
      const rlRef = db.collection('login_intentos').doc(`${empresaId}__${usuario}`)
      const bloqueoPrevio = await estaBloqueado([empRlRef.id, rlRef.id, claveIp])
      if (bloqueoPrevio.bloqueado) {
        return res.status(429).json({ ok: false, error: `Demasiados intentos fallidos. Esperá ${bloqueoPrevio.segundos}s e intentá de nuevo.` })
      }

      // Buscar el empleado por usuarioSimple DENTRO de la empresa resuelta.
      // Sin límite: si por error hubiera dos iguales en la MISMA empresa, no
      // elegimos al azar → se rechaza para no arriesgar una sesión incorrecta.
      // (Dos filtros == no requieren índice compuesto en Firestore.)
      const snap = await db.collection('usuarios')
        .where('empresaId', '==', empresaId)
        .where('usuarioSimple', '==', usuario)
        .get()

      if (snap.empty) {
        await registrarFallo([claveIp, empRlRef.id], { max: EMPRESA_MAX, ventanaMs: VENTANA_EMP, lockoutMs: LOCKOUT_EMP })
        return res.status(401).json({ ok: false, error: MSG_CREDENCIALES })
      }
      if (snap.size > 1) {
        return res.status(409).json({ ok: false, error: 'Usuario duplicado en esta empresa. Contactá a tu administrador.' })
      }

      const docu = snap.docs[0]
      const data = docu.data()

      if (data.activo === false) {
        return res.status(403).json({ ok: false, error: 'Tu cuenta está desactivada' })
      }

      // ── Verificar el PIN (nunca llega al navegador en texto plano) ──
      // Primero contra el HASH de la bóveda 'pins_empleado'. Si el usuario todavía
      // no fue migrado (PIN plano legacy en 'usuarios'), se compara con ese y se
      // MIGRA al hash en el acto (borrando el pin plano). Así no hay interrupción.
      let pinOk = false
      const pinRef = db.collection('pins_empleado').doc(docu.id)
      const pinSnap = await pinRef.get()
      if (pinSnap.exists && pinSnap.data().hash) {
        pinOk = verificarPin(pin, pinSnap.data().hash)
      } else if (data.pin !== undefined && data.pin !== null && data.pin !== '') {
        pinOk = String(data.pin) === String(pin)
        if (pinOk) {
          await pinRef.set({ hash: hashearPin(pin), migradoEn: FieldValue.serverTimestamp() }, { merge: true })
          await db.collection('usuarios').doc(docu.id).set({ pin: FieldValue.delete() }, { merge: true })
        }
      }

      if (!pinOk) {
        // Se cuenta el fallo en las tres puertas (usuario, empresa e IP), de forma transaccional.
        await registrarFallo([rlRef.id], { max: MAX_INTENTOS, ventanaMs: VENTANA_MS, lockoutMs: LOCKOUT_MS })
        await registrarFallo([empRlRef.id, claveIp], { max: EMPRESA_MAX, ventanaMs: VENTANA_EMP, lockoutMs: LOCKOUT_EMP })
        const bloqueo = await estaBloqueado([rlRef.id, empRlRef.id, claveIp])
        if (bloqueo.bloqueado) {
          return res.status(429).json({ ok: false, error: `Demasiados intentos fallidos. Esperá ${bloqueo.segundos}s e intentá de nuevo.` })
        }
        return res.status(401).json({ ok: false, error: MSG_CREDENCIALES })
      }

      // Login correcto → limpiar los contadores.
      await limpiarFallos([rlRef.id, empRlRef.id, claveIp])

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
        empresaNombre,
        empleado: { id: docu.id, ...sinPin },
      })
    } catch (error) {
      console.error('Error en login-empleado:', error)
      return res.status(500).json({ ok: false, error: 'Error interno' })
    }
  }
)
