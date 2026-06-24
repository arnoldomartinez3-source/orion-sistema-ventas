// ══════════════════════════════════════════════════════════════
// marcar — Cloud Function (Firebase v2)  ·  Módulo Asistencia, Etapa 2
//
// Registra una marcación de asistencia (entrada/salida) en el BACKEND.
// - Valida el PIN del empleado contra 'empleados' con Admin SDK → el PIN
//   NUNCA llega al navegador (el kiosco solo manda el PIN tecleado).
// - Sube la FOTO a Storage con Admin SDK (Storage queda 100% cerrado al
//   cliente); guarda solo la URL (con download token) en 'marcaciones'.
// - Usa HORA DEL SERVIDOR (serverTimestamp), nunca la del dispositivo.
// - Verifica que quien llama sea admin / gestionar_personal de ESA empresa
//   (el kiosco corre bajo la sesión del dueño — Opción A).
//
// Entrada (POST JSON, Authorization: Bearer <idToken del admin>):
//   { accion: 'validar', empresaId, pin }
//   { accion: 'marcar',  empresaId, pin, tipo, fotoBase64 }
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

// Verifica que el operador (la tablet logueada como dueño) sea admin o tenga
// 'gestionar_personal' en ESA empresa.
async function verificarOperador(req, empresaId) {
  const h = req.headers.authorization || ''
  const idToken = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!idToken) throw new Error('No autenticado')
  const decoded = await getAuth().verifyIdToken(idToken)
  const userSnap = await db.collection('usuarios').doc(decoded.uid).get()
  if (!userSnap.exists) throw new Error('Operador no válido')
  const u = userSnap.data()
  if (u.empresaId !== empresaId) throw new Error('La empresa no coincide')
  const ok = u.rol === 'administrador' || (Array.isArray(u.permisos) && u.permisos.includes('gestionar_personal'))
  if (!ok) throw new Error('Sin permiso para operar el kiosco')
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
      const { accion, empresaId, pin, tipo, fotoBase64 } = req.body || {}
      if (!empresaId || !pin) return res.status(400).json({ ok: false, error: 'Faltan datos' })

      await verificarOperador(req, empresaId)

      // Buscar el empleado activo por PIN (Admin SDK se salta las reglas)
      const snap = await db.collection('empleados')
        .where('empresaId', '==', empresaId)
        .where('pin', '==', String(pin))
        .limit(1).get()
      if (snap.empty) return res.status(200).json({ ok: false, error: 'PIN no válido' })
      const empDoc = snap.docs[0]
      const emp = empDoc.data()
      if (emp.activo === false) return res.status(200).json({ ok: false, error: 'Empleado inactivo' })

      const hoy = fechaSV(new Date())

      // Última marca de HOY → sugerir entrada/salida. Single equality, sin índice compuesto.
      const marcasEmp = await db.collection('marcaciones').where('empleadoId', '==', empDoc.id).get()
      let ultimoTipo = null, ultimoTs = 0
      marcasEmp.forEach(m => {
        const d = m.data()
        const ts = d.timestamp?.toMillis ? d.timestamp.toMillis() : 0
        if (d.fecha === hoy && ts >= ultimoTs) { ultimoTs = ts; ultimoTipo = d.tipo }
      })
      const sugerido = ultimoTipo === 'entrada' ? 'salida' : 'entrada'

      // ── Solo validar (mostrar nombre + sugerencia, sin escribir) ──
      if (accion === 'validar') {
        return res.status(200).json({ ok: true, nombre: emp.nombre, empleadoId: empDoc.id, ultimoTipo, sugerido })
      }

      // ── Registrar la marca ──
      if (!['entrada', 'salida'].includes(tipo)) return res.status(400).json({ ok: false, error: 'Tipo inválido' })
      if (!fotoBase64) return res.status(400).json({ ok: false, error: 'Falta la foto' })

      // Subir foto a Storage (Admin SDK). La URL usa download token; Storage queda cerrado al cliente.
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
