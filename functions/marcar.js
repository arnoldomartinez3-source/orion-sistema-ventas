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
// ══════════════════════════════════════════════════════════════

import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { getAuth } from 'firebase-admin/auth'
import { randomUUID } from 'node:crypto'

if (!getApps().length) {
  initializeApp()
}
const db = getFirestore()

// Límite anti-abuso del kiosco anónimo: como el código no es secreto, evitamos
// que alguien enumere PINs de empleados por fuerza bruta.
const MARCA_MAX = 20               // fallos por empresa dentro de la ventana
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
    const codigo = String(body.codigoEmpresa || '').toUpperCase().trim()
    if (!codigo) throw new Error('Falta el código de empresa')
    const empSnap = await db.collection('empresas').where('codigoAcceso', '==', codigo).limit(1).get()
    if (empSnap.empty) throw new Error('Código de empresa inválido')
    const emp = empSnap.docs[0]
    return { empresaId: emp.id, empresaNombre: emp.data().nombreComercial || emp.data().nombre || '' }
  }

  const userSnap = await db.collection('usuarios').doc(decoded.uid).get()
  if (!userSnap.exists) throw new Error('Operador no válido')
  const u = userSnap.data()
  const ok = u.rol === 'administrador' || (Array.isArray(u.permisos) && u.permisos.includes('gestionar_personal'))
  if (!ok) throw new Error('Sin permiso para operar el kiosco')
  return { empresaId: u.empresaId, empresaNombre: '' }
}

const fechaSV = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const horaSV = (d) => new Intl.DateTimeFormat('es-SV', { timeZone: 'America/El_Salvador', hour: '2-digit', minute: '2-digit' }).format(d)

export const marcar = onRequest(
  { timeoutSeconds: 30, memory: '512MiB', cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Método no permitido' })
    }
    try {
      const body = req.body || {}
      const { accion, pin, tipo, fotoBase64 } = body

      const ctx = await resolverContexto(req, body)
      const empresaId = ctx.empresaId

      // ── Confirmar el código al configurar la tablet ──
      if (accion === 'kiosco_init') {
        return res.status(200).json({ ok: true, empresaId, empresaNombre: ctx.empresaNombre })
      }

      if (!pin) return res.status(400).json({ ok: false, error: 'Falta el PIN' })

      // ── Rate-limit por empresa (anti fuerza bruta del PIN de marcación) ──
      const AHORA = Date.now()
      const rlRef = db.collection('login_intentos').doc(`MARCA__${empresaId}`)
      const rlSnap = await rlRef.get()
      const rl = rlSnap.exists ? rlSnap.data() : null
      if (rl?.bloqueadoHasta && rl.bloqueadoHasta > AHORA) {
        const seg = Math.ceil((rl.bloqueadoHasta - AHORA) / 1000)
        return res.status(429).json({ ok: false, error: `Demasiados intentos. Esperá ${seg}s.` })
      }

      const fallo = async () => {
        const dentro = rl?.ultimo && (AHORA - rl.ultimo) < MARCA_VENTANA
        const intentos = (dentro ? (rl.intentos || 0) : 0) + 1
        await rlRef.set(
          intentos >= MARCA_MAX
            ? { intentos: 0, ultimo: AHORA, bloqueadoHasta: AHORA + MARCA_LOCKOUT }
            : { intentos, ultimo: AHORA },
          { merge: true }
        )
      }

      // Buscar el empleado activo por PIN dentro de la empresa
      const snap = await db.collection('empleados')
        .where('empresaId', '==', empresaId)
        .where('pin', '==', String(pin))
        .limit(1).get()
      if (snap.empty) { await fallo(); return res.status(200).json({ ok: false, error: 'PIN no válido' }) }
      const empDoc = snap.docs[0]
      const emp = empDoc.data()
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
