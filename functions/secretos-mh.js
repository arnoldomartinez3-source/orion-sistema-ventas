// ══════════════════════════════════════════════════════════════
// secretos-mh — Cloud Function (Firebase v2)
//
// Guarda y lee los SECRETOS del MH (mh_usuario, mh_password, certificado_pem,
// certificado_password) en 'secretos_mh/{empresaId}', que en las reglas está
// bloqueado a todo el cliente (read/write:false). Solo el MAESTRO de One Geo
// puede llamar esta función (se valida el token). Así un empleado (cajero) ya
// NO puede leer el certificado privado ni las credenciales desde la consola.
//
// El frontend (Panel One Geo) usa:
//   { accion:'leer',    empresaId }              → metadatos (sin devolver secretos)
//   { accion:'guardar', empresaId, ...secretos } → escribe en secretos_mh
//
// Migración: al 'leer' o 'guardar', si la empresa todavía tiene los secretos en
// 'configuracion' (esquema viejo), se copian a 'secretos_mh' y se BORRAN de
// 'configuracion'. Así el hueco se cierra en cuanto se toca cada empresa.
// ══════════════════════════════════════════════════════════════

import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

if (!getApps().length) {
  initializeApp()
}
const db = getFirestore()

const CORREOS_MAESTROS = [
  'arnoldomartinez3@gmail.com',
]

// Campos secretos que viven en 'secretos_mh' (NO en 'configuracion').
const CAMPOS_SECRETOS = ['mh_usuario', 'mh_password', 'certificado_pem', 'certificado_password']

// Si la empresa aún tiene secretos en 'configuracion', migrarlos a 'secretos_mh'
// y borrarlos de 'configuracion'. Idempotente.
async function migrarSiHaceFalta(empresaId) {
  const cfgRef = db.collection('configuracion').doc(empresaId)
  const cfgSnap = await cfgRef.get()
  if (!cfgSnap.exists) return
  const cfg = cfgSnap.data()
  const aMigrar = {}
  const aBorrar = {}
  let hay = false
  for (const campo of CAMPOS_SECRETOS) {
    if (cfg[campo] !== undefined && cfg[campo] !== null && cfg[campo] !== '') {
      aMigrar[campo] = cfg[campo]
      hay = true
    }
    if (cfg[campo] !== undefined) aBorrar[campo] = FieldValue.delete()
  }
  if (!hay && Object.keys(aBorrar).length === 0) return
  if (hay) {
    // No pisar lo que ya exista en secretos_mh (merge sin sobrescribir con vacío).
    await db.collection('secretos_mh').doc(empresaId).set(
      { ...aMigrar, migradoEn: FieldValue.serverTimestamp() },
      { merge: true }
    )
  }
  if (Object.keys(aBorrar).length > 0) {
    await cfgRef.set(aBorrar, { merge: true }) // FieldValue.delete() dentro de merge borra esos campos
  }
}

export const secretosMH = onRequest(
  { timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Método no permitido' })
    }
    try {
      // ── Validar token del MAESTRO ──
      const header = req.headers.authorization || ''
      const idToken = header.startsWith('Bearer ') ? header.slice(7) : null
      if (!idToken) return res.status(401).json({ ok: false, error: 'No autenticado' })
      let decoded
      try {
        decoded = await getAuth().verifyIdToken(idToken)
      } catch {
        return res.status(401).json({ ok: false, error: 'Sesión inválida' })
      }
      const email = (decoded.email || '').trim().toLowerCase()
      if (!CORREOS_MAESTROS.map(c => c.toLowerCase()).includes(email)) {
        return res.status(403).json({ ok: false, error: 'Solo One Geo puede gestionar los secretos del MH' })
      }

      const { accion, empresaId } = req.body || {}
      if (!empresaId) return res.status(400).json({ ok: false, error: 'Falta empresaId' })

      // Siempre intentamos migrar/limpiar la empresa que se está tocando.
      await migrarSiHaceFalta(empresaId)

      if (accion === 'leer') {
        const [secSnap, cfgSnap] = await Promise.all([
          db.collection('secretos_mh').doc(empresaId).get(),
          db.collection('configuracion').doc(empresaId).get(),
        ])
        const sec = secSnap.exists ? secSnap.data() : {}
        const cfg = cfgSnap.exists ? cfgSnap.data() : {}
        // Devolvemos SOLO metadatos: nunca la clave privada ni las contraseñas.
        return res.status(200).json({
          ok: true,
          mh_usuario: sec.mh_usuario || '',
          mh_ambiente: cfg.mh_ambiente || '00',
          tieneCert: !!sec.certificado_pem,
          tienePassword: !!sec.mh_password,
          tieneCertPassword: !!sec.certificado_password,
        })
      }

      if (accion === 'guardar') {
        const { mh_usuario, mh_ambiente, mh_password, certificado_password, certificado_pem } = req.body || {}

        // Secretos → secretos_mh (contraseña/cert solo si vienen; no se pisan con vacío).
        const secretos = { updatedAt: FieldValue.serverTimestamp(), updatedBy: email }
        if (mh_usuario !== undefined) secretos.mh_usuario = String(mh_usuario || '').trim()
        if (certificado_password !== undefined && certificado_password !== '') secretos.certificado_password = certificado_password
        if (mh_password) secretos.mh_password = mh_password
        if (certificado_pem) secretos.certificado_pem = certificado_pem
        await db.collection('secretos_mh').doc(empresaId).set(secretos, { merge: true })

        // mh_ambiente NO es secreto → se queda en configuracion.
        if (mh_ambiente !== undefined) {
          await db.collection('configuracion').doc(empresaId).set(
            { mh_ambiente: mh_ambiente || '00', updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          )
        }

        // Asegurar que NADA sensible quede en configuracion (por si el guardado viejo lo dejó).
        const limpiar = {}
        for (const campo of CAMPOS_SECRETOS) limpiar[campo] = FieldValue.delete()
        await db.collection('configuracion').doc(empresaId).set(limpiar, { merge: true })

        return res.status(200).json({ ok: true })
      }

      return res.status(400).json({ ok: false, error: 'Acción no válida' })
    } catch (error) {
      console.error('Error en secretos-mh:', error)
      return res.status(500).json({ ok: false, error: 'Error interno' })
    }
  }
)
