// ══════════════════════════════════════════════════════════════
// verificar-llamante — candado de autenticación compartido
//
// Los endpoints de DTE (transmitir / invalidar / contingencia) firman y
// transmiten documentos REALES al Ministerio de Hacienda con el certificado
// de la empresa. Sin este candado, cualquiera en internet podría emitir o
// anular un DTE a nombre de un cliente.
//
// Uso en una función:
//   const llamante = await verificarLlamante(req)          // 401 si no hay token
//   exigirMismaEmpresa(llamante, venta.empresaId)          // 403 si es de otra empresa
//
// El maestro de One Geo puede operar sobre cualquier empresa (lo necesita el
// Asistente de Certificación).
// ══════════════════════════════════════════════════════════════
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// Mismos correos que en certificacionConfig.js (frontend) y gestionar-admin.js.
const CORREOS_MAESTROS = [
  'arnoldomartinez3@gmail.com',
]

export class ErrorAuth extends Error {
  constructor(mensaje, estado) {
    super(mensaje)
    this.estado = estado
  }
}

// Verifica el ID token del header Authorization y resuelve quién llama.
// Devuelve { uid, email, empresaId, esMaestro }.
export async function verificarLlamante(req) {
  const header = req.headers.authorization || ''
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!idToken) throw new ErrorAuth('No autenticado', 401)

  let decoded
  try {
    decoded = await getAuth().verifyIdToken(idToken)
  } catch {
    throw new ErrorAuth('Sesión inválida o vencida. Vuelve a iniciar sesión.', 401)
  }

  const uid = decoded.uid
  const email = (decoded.email || '').trim().toLowerCase()
  const esMaestro = CORREOS_MAESTROS.map(c => c.toLowerCase()).includes(email)

  // La empresa del llamante se lee del SERVIDOR (no de lo que mande el navegador).
  const db = getFirestore()
  let empresaId = null

  const userSnap = await db.collection('usuarios').doc(uid).get()
  if (userSnap.exists) {
    empresaId = userSnap.data().empresaId || null
  } else {
    // Sesiones de empleado antiguas (login por PIN previo al custom token).
    const sesSnap = await db.collection('sesiones_empleado').doc(uid).get()
    if (sesSnap.exists) empresaId = sesSnap.data().empresaId || null
  }

  if (!empresaId && !esMaestro) throw new ErrorAuth('Usuario no válido', 403)

  return { uid, email, empresaId, esMaestro }
}

// Confirma que el llamante puede operar sobre documentos de esa empresa.
export function exigirMismaEmpresa(llamante, empresaIdDoc) {
  if (llamante.esMaestro) return // One Geo gestiona todas las empresas
  if (!empresaIdDoc) return      // documentos legacy sin empresaId (mono-empresa)
  if (llamante.empresaId !== empresaIdDoc) {
    throw new ErrorAuth('No autorizado para esta empresa', 403)
  }
}

// Responde el error de auth con su código. Devuelve true si lo manejó.
export function responderErrorAuth(err, res) {
  if (err instanceof ErrorAuth) {
    res.status(err.estado).json({ error: err.message })
    return true
  }
  return false
}
