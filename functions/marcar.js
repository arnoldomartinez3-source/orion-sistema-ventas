// ══════════════════════════════════════════════════════════════
// marcar — Cloud Function (Firebase v2)  ·  Módulo Asistencia
//
// Registra una marcación (entrada/salida) en el BACKEND.
// - Valida el PIN del empleado contra 'empleados' con Admin SDK → el PIN
//   NUNCA llega al navegador.
// - Sube la FOTO a Storage con Admin SDK (Storage cerrado al cliente).
// - Usa HORA DEL SERVIDOR (serverTimestamp), nunca la del dispositivo.
//
// DOS formas de operar el kiosco:
//   (A) Dueño logueado (real) con 'gestionar_personal' → usa SU empresaId.
//   (B) Tablet DEDICADA en modo kiosco: sesión ANÓNIMA + código de empresa.
//       La empresa se resuelve del código en el servidor. Así el kiosco NO
//       depende del login del dueño — se deja la tablet abierta y listo.
//
// Entrada (POST JSON, Authorization: Bearer <idToken>):
//   { accion: 'kiosco_init', codigoEmpresa }              → confirma el código
//   { accion: 'validar', pin, [codigoEmpresa|empresaId] }
//   { accion: 'marcar',  pin, tipo, fotoBase64, [codigoEmpresa|empresaId] }
//   { accion: 'fijar_pin', empleadoId, pin }   (admin: guarda el PIN cifrado)
//   { accion: 'migrar_pines' }                 (admin: cifra los PIN viejos en texto)
// ══════════════════════════════════════════════════════════════

import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { getAuth } from 'firebase-admin/auth'
import { randomUUID, createHmac } from 'node:crypto'
import { defineSecret } from 'firebase-functions/params'
import { ipDe, estaBloqueado, registrarFallo, limpiarFallos } from './limites.js'
import { validarPinServidor } from './pin-util.js'

// ── PIN de marcación CIFRADO ──
// El kiosco identifica al empleado SOLO por su PIN, así que hay que poder buscarlo.
// Un hash con salt (como el PIN de login) no se puede buscar; por eso se usa un
// HMAC con una clave secreta del servidor: el mismo PIN da la misma huella, pero sin
// la clave nadie (ni un admin, ni un volcado de la base) puede sacar el PIN de ella.
// Las huellas viven en 'pins_marcacion/{empleadoId}' (backend-only).
// Secreto: firebase functions:secrets:set PIN_MARCACION_CLAVE
const PIN_MARCACION_CLAVE = defineSecret('PIN_MARCACION_CLAVE')
const huellaPin = (empresaId, pin) =>
  createHmac('sha256', PIN_MARCACION_CLAVE.value()).update(`${empresaId}:${String(pin)}`).digest('hex')

// ¿Quién tiene este PIN en la empresa? Devuelve el doc del empleado o null.
async function buscarPorPin(empresaId, pin) {
  const h = await db.collection('pins_marcacion')
    .where('empresaId', '==', empresaId)
    .where('huella', '==', huellaPin(empresaId, pin))
    .limit(1).get()
  if (!h.empty) {
    const e = await db.collection('empleados').doc(h.docs[0].id).get()
    if (e.exists && e.data().empresaId === empresaId) return e
  }
  // Empleados de antes del cifrado (PIN en texto en su ficha): se encuentran igual.
  const viejo = await db.collection('empleados')
    .where('empresaId', '==', empresaId)
    .where('pin', '==', String(pin))
    .limit(1).get()
  return viejo.empty ? null : viejo.docs[0]
}

// Pasa el PIN a la bóveda y lo borra de la ficha del empleado.
async function guardarHuella(empresaId, empleadoId, pin) {
  const batch = db.batch()
  batch.set(db.collection('pins_marcacion').doc(empleadoId), {
    empresaId, huella: huellaPin(empresaId, pin), actualizadoEn: FieldValue.serverTimestamp(),
  })
  batch.update(db.collection('empleados').doc(empleadoId), { pin: FieldValue.delete(), tienePin: true })
  await batch.commit()
}

if (!getApps().length) {
  initializeApp()
}
const db = getFirestore()

// Límite anti-abuso del kiosco anónimo: como el código no es secreto, evitamos
// que alguien enumere PINs de empleados por fuerza bruta.
const MARCA_MAX = 20               // fallos por empresa dentro de la ventana
const MARCA_IP_MAX = 10            // fallos desde una misma conexión (internet) dentro de la ventana
const MARCA_VENTANA = 10 * 60 * 1000
const MARCA_LOCKOUT = 5 * 60 * 1000

// Resuelve la empresa y valida quién opera el kiosco.
//  - anónimo  → requiere código de empresa (se resuelve en el servidor).
//  - real     → debe ser admin / gestionar_personal.
async function resolverContexto(req, body) {
  const h = req.headers.authorization || ''
  const idToken = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!idToken) throw new Error('No autenticado')
  const decoded = await getAuth().verifyIdToken(idToken)
  const esAnon = decoded.firebase?.sign_in_provider === 'anonymous'

  if (esAnon) {
    // (A) Tablet ENROLADA: token largo y aleatorio que creó un administrador desde su
    //     cuenta. No se puede adivinar (el código de empresa sí).
    const token = String(body.kioscoToken || '').trim()
    if (token) {
      const kSnap = await db.collection('kioscos').doc(token).get()
      if (!kSnap.exists || kSnap.data().activo === false) throw new Error('Esta tablet ya no está autorizada')
      const k = kSnap.data()
      const empSnap = await db.collection('empresas').doc(k.empresaId).get()
      return {
        empresaId: k.empresaId,
        empresaNombre: empSnap.exists ? (empSnap.data().nombreComercial || empSnap.data().nombre || '') : '',
        esAnon: true,
      }
    }
    // (B) Compatibilidad: tablets viejas configuradas con el código de empresa.
    const codigo = String(body.codigoEmpresa || '').toUpperCase().trim()
    if (!codigo) throw new Error('Esta tablet no está autorizada')
    const empSnap = await db.collection('empresas').where('codigoAcceso', '==', codigo).limit(1).get()
    if (empSnap.empty) throw new Error('Código de empresa inválido')
    const emp = empSnap.docs[0]
    return { empresaId: emp.id, empresaNombre: emp.data().nombreComercial || emp.data().nombre || '', esAnon: true }
  }

  const userSnap = await db.collection('usuarios').doc(decoded.uid).get()
  if (!userSnap.exists) throw new Error('Operador no válido')
  const u = userSnap.data()
  const ok = u.rol === 'administrador' || (Array.isArray(u.permisos) && u.permisos.includes('gestionar_personal'))
  if (!ok) throw new Error('Sin permiso para operar el kiosco')
  return { empresaId: u.empresaId, empresaNombre: '', esAnon: false, uid: decoded.uid }
}

const fechaSV = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const horaSV = (d) => new Intl.DateTimeFormat('es-SV', { timeZone: 'America/El_Salvador', hour: '2-digit', minute: '2-digit' }).format(d)

export const marcar = onRequest(
  { timeoutSeconds: 30, memory: '512MiB', cors: true, secrets: [PIN_MARCACION_CLAVE] },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Método no permitido' })
    }
    try {
      const body = req.body || {}
      const { accion, pin, tipo, fotoBase64 } = body

      // Límite por conexión: el código de empresa no es secreto, así que alguien de
      // internet no debe poder probar códigos ni PINs sin freno (ni bloquear a toda la empresa).
      const claveIp = `MARCAIP__${ipDe(req)}`
      const bloqIp = await estaBloqueado([claveIp])
      if (bloqIp.bloqueado) {
        return res.status(429).json({ ok: false, error: `Demasiados intentos. Esperá ${bloqIp.segundos}s.` })
      }

      let ctx
      try {
        ctx = await resolverContexto(req, body)
      } catch (e) {
        // Código equivocado: se cuenta el fallo y se responde sin decir si existe o no.
        await registrarFallo([claveIp], { max: MARCA_IP_MAX, ventanaMs: MARCA_VENTANA, lockoutMs: MARCA_LOCKOUT })
        return res.status(401).json({ ok: false, error: e.message === 'Código de empresa inválido' ? 'Código o PIN incorrecto' : (e.message || 'No autorizado') })
      }
      const empresaId = ctx.empresaId

      // ── Confirmar el código al configurar la tablet (compatibilidad) ──
      if (accion === 'kiosco_init') {
        return res.status(200).json({ ok: true, empresaId, empresaNombre: ctx.empresaNombre })
      }

      // ── Enrolar ESTA tablet: crea un token propio ligado a la empresa ──
      // Lo pide un administrador (o quien gestiona personal) con su sesión, una sola vez.
      // Después la tablet marca con ese token y ya nadie escribe códigos.
      if (accion === 'kiosco_token') {
        if (ctx.esAnon) {
          return res.status(403).json({ ok: false, error: 'Iniciá sesión como administrador en esta tablet para activarla.' })
        }
        const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, '')
        await db.collection('kioscos').doc(token).set({
          empresaId,
          activo: true,
          dispositivo: String(body.dispositivo || '').slice(0, 60),
          creadoPor: ctx.uid || '',
          creadoEn: FieldValue.serverTimestamp(),
        })
        const empSnap = await db.collection('empresas').doc(empresaId).get()
        return res.status(200).json({
          ok: true,
          kioscoToken: token,
          empresaNombre: empSnap.exists ? (empSnap.data().nombreComercial || empSnap.data().nombre || '') : '',
        })
      }

      // ── Fijar / cambiar el PIN de un empleado (lo hace el admin desde Personal) ──
      if (accion === 'fijar_pin') {
        if (ctx.esAnon) return res.status(403).json({ ok: false, error: 'Sin permiso' })
        const empleadoId = String(body.empleadoId || '')
        const empSnap = empleadoId ? await db.collection('empleados').doc(empleadoId).get() : null
        if (!empSnap?.exists || empSnap.data().empresaId !== empresaId) {
          return res.status(404).json({ ok: false, error: 'Empleado no encontrado' })
        }
        const errPin = validarPinServidor(pin)
        if (errPin) return res.status(400).json({ ok: false, error: errPin })
        const otro = await buscarPorPin(empresaId, pin)
        if (otro && otro.id !== empleadoId) {
          return res.status(409).json({ ok: false, error: 'Ese PIN ya lo usa otro empleado. Elegí uno distinto.' })
        }
        await guardarHuella(empresaId, empleadoId, pin)
        return res.status(200).json({ ok: true })
      }

      // ── Cifrar los PIN que quedaron en texto (empleados de antes del cambio) ──
      if (accion === 'migrar_pines') {
        if (ctx.esAnon) return res.status(403).json({ ok: false, error: 'Sin permiso' })
        const snap = await db.collection('empleados').where('empresaId', '==', empresaId).get()
        let migrados = 0
        for (const d of snap.docs) {
          const p = d.data().pin
          if (p === undefined || p === null || p === '') continue
          await guardarHuella(empresaId, d.id, p)
          migrados++
        }
        return res.status(200).json({ ok: true, migrados })
      }

      if (!pin) return res.status(400).json({ ok: false, error: 'Falta el PIN' })

      // ── Rate-limit por empresa y por conexión (anti fuerza bruta del PIN) ──
      const claveEmpresa = `MARCA__${empresaId}`
      const bloq = await estaBloqueado([claveEmpresa])
      if (bloq.bloqueado) {
        return res.status(429).json({ ok: false, error: `Demasiados intentos. Esperá ${bloq.segundos}s.` })
      }

      const fallo = async () => {
        await registrarFallo([claveEmpresa], { max: MARCA_MAX, ventanaMs: MARCA_VENTANA, lockoutMs: MARCA_LOCKOUT })
        await registrarFallo([claveIp], { max: MARCA_IP_MAX, ventanaMs: MARCA_VENTANA, lockoutMs: MARCA_LOCKOUT })
      }

      // Buscar el empleado activo por PIN dentro de la empresa
      const empDoc = await buscarPorPin(empresaId, pin)
      if (!empDoc) { await fallo(); return res.status(200).json({ ok: false, error: 'PIN no válido' }) }
      const emp = empDoc.data()
      // Si todavía estaba en texto, se cifra en este mismo momento.
      if (emp.pin !== undefined && emp.pin !== null && emp.pin !== '') {
        await guardarHuella(empresaId, empDoc.id, emp.pin).catch(() => {})
      }
      await limpiarFallos([claveEmpresa, claveIp])   // PIN correcto: se olvidan los fallos previos
      if (emp.activo === false) return res.status(200).json({ ok: false, error: 'Empleado inactivo' })

      const hoy = fechaSV(new Date())

      // Última marca de HOY → sugerir entrada/salida
      const marcasEmp = await db.collection('marcaciones').where('empleadoId', '==', empDoc.id).get()
      let ultimoTipo = null, ultimoTs = 0
      marcasEmp.forEach(m => {
        const d = m.data()
        const ts = d.timestamp?.toMillis ? d.timestamp.toMillis() : 0
        if (d.fecha === hoy && ts >= ultimoTs) { ultimoTs = ts; ultimoTipo = d.tipo }
      })
      const sugerido = ultimoTipo === 'entrada' ? 'salida' : 'entrada'

      // ── Solo validar (mostrar nombre + sugerencia) ──
      if (accion === 'validar') {
        return res.status(200).json({ ok: true, nombre: emp.nombre, empleadoId: empDoc.id, foto: emp.fotoUrl || null, cargo: emp.cargo || '', ultimoTipo, sugerido })
      }

      // ── Registrar la marca ──
      if (!['entrada', 'salida'].includes(tipo)) return res.status(400).json({ ok: false, error: 'Tipo inválido' })
      if (!fotoBase64) return res.status(400).json({ ok: false, error: 'Falta la foto' })

      const buffer = Buffer.from(String(fotoBase64).replace(/^data:image\/\w+;base64,/, ''), 'base64')
      const token = randomUUID()
      const path = `empresas/${empresaId}/marcaciones/${empDoc.id}/${Date.now()}.jpg`
      const bucket = getStorage().bucket()
      await bucket.file(path).save(buffer, {
        resumable: false,
        metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: token } },
      })
      const fotoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`

      const ahora = new Date()
      const ref = await db.collection('marcaciones').add({
        empresaId,
        empleadoId: empDoc.id,
        empleadoNombre: emp.nombre,
        tipo,
        fotoUrl,
        metodoValidacion: 'dispositivo',
        fecha: hoy,
        timestamp: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      })

      return res.status(200).json({ ok: true, id: ref.id, nombre: emp.nombre, tipo, hora: horaSV(ahora) })
    } catch (e) {
      console.error('Error en marcar:', e)
      return res.status(401).json({ ok: false, error: e.message || 'Error' })
    }
  }
)
