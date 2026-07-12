// ══════════════════════════════════════════════════════════════
// gestionar-admin — Cloud Function (Firebase v2)
//
// Gestiona los usuarios ADMIN de una empresa cliente desde el Panel One Geo.
// UNA sola función con un campo "accion" que decide qué hacer. Esto evita
// tener muchas funciones que desplegar y mantener.
//
// Todo se hace con firebase-admin (Admin SDK), porque crear/editar usuarios
// de Auth (correo, contraseña) NO se puede desde el navegador.
//
// SEGURIDAD (doble candado, igual que crear-admin):
//   1) Verifica el ID token de Firebase del que llama (debe ser válido).
//   2) Confirma que el email del token es un CORREO MAESTRO de One Geo.
//
// Entrada (POST, JSON): { accion, ...datos }
//   accion 'crear'           → { email, password, nombre, empresaId }
//   accion 'listar'          → { empresaId }
//   accion 'cambiar_correo'  → { uid, email }
//   accion 'cambiar_clave'   → { uid, password }
//   accion 'toggle_activo'   → { uid, activo }   (true = activar, false = desactivar)
//
// Salida: { ok: true, ... } | { ok: false, error }
// ══════════════════════════════════════════════════════════════

import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { randomBytes } from 'node:crypto'

if (!getApps().length) {
  initializeApp()
}

const db = getFirestore()

const RESEND_API_KEY = defineSecret('RESEND_API_KEY')
const REMITENTE = 'ORIÓN <noreply@orionsv.net>'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Correo de invitación: genera el link para que el usuario ESTABLEZCA su propia
// contraseña (One Geo nunca la conoce) y lo envía con la marca ORIÓN vía Resend.
function htmlInvitacion({ nombre, link, empresaNombre }) {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;"><tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(12,34,64,.08);">
        <tr><td style="background:#0c2240;padding:22px 28px;"><span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:1px;">ORI<span style="color:#c8a44d;">Ó</span>N</span></td></tr>
        <tr><td style="padding:28px 28px 6px;">
          <p style="margin:0 0 6px;color:#0c2240;font-size:16px;">¡Hola${nombre ? ' ' + esc(nombre) : ''}!</p>
          <p style="margin:0 0 16px;color:#334155;font-size:14.5px;line-height:1.6;">Se creó tu cuenta en <strong>ORIÓN</strong>${empresaNombre ? ' para <strong>' + esc(empresaNombre) + '</strong>' : ''}. Para empezar, establece tu contraseña:</p>
        </td></tr>
        <tr><td align="center" style="padding:6px 28px 24px;">
          <a href="${link}" style="display:inline-block;background:#c8a44d;color:#0c2240;font-weight:700;text-decoration:none;padding:13px 30px;border-radius:10px;font-size:15px;">Establecer mi contraseña</a>
        </td></tr>
        <tr><td style="padding:0 28px 22px;"><p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">Por seguridad, el enlace vence en poco tiempo. Si no funciona, solicita que te reenvíen la invitación.</p></td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;"><p style="margin:0;color:#64748b;font-size:12px;">Att. Equipo <strong style="color:#0c2240;">ORIÓN</strong> · One Geo Systems</p></td></tr>
      </table>
    </td></tr></table></body></html>`
}

async function enviarInvitacion(email, nombre, empresaNombre) {
  const link = await getAuth().generatePasswordResetLink(email)
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: REMITENTE, to: [email],
      subject: 'Bienvenido a ORIÓN — establecé tu contraseña',
      html: htmlInvitacion({ nombre, link, empresaNombre }),
    }),
  })
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`Resend ${r.status} ${t}`) }
}

// Correos maestros de One Geo (mismos que en certificacionConfig.js del frontend).
const CORREOS_MAESTROS = [
  'arnoldomartinez3@gmail.com',
]

// Los 36 permisos del sistema. El admin de empresa los recibe todos.
const TODOS_LOS_PERMISOS = [
  'ver_dashboard', 'ver_punto_venta', 'realizar_ventas',
  'aplicar_descuentos', 'cancelar_ventas',
  'ver_inventario', 'crear_productos', 'editar_productos',
  'eliminar_productos', 'ver_kardex', 'registrar_movimientos', 'importar_exportar',
  'ver_clientes', 'crear_clientes', 'editar_clientes', 'eliminar_clientes',
  'ver_compras', 'crear_compras', 'editar_compras', 'eliminar_compras',
  'ver_cotizaciones', 'crear_cotizaciones', 'editar_cotizaciones',
  'eliminar_cotizaciones', 'convertir_a_venta',
  'ver_facturas', 'crear_facturas', 'editar_facturas',
  'eliminar_facturas', 'imprimir_facturas', 'compartir_whatsapp',
  'ver_configuracion', 'editar_configuracion',
  'ver_usuarios', 'crear_usuarios', 'editar_usuarios', 'eliminar_usuarios',
]

export const gestionarAdmin = onRequest(
  { timeoutSeconds: 60, memory: '256MiB', cors: true, secrets: [RESEND_API_KEY] },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Método no permitido' })
    }

    try {
      // ── 1) Verificar token del que llama ──
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
      if (!token) {
        return res.status(401).json({ ok: false, error: 'Falta el token de autenticación' })
      }

      let decoded
      try {
        decoded = await getAuth().verifyIdToken(token)
      } catch (e) {
        return res.status(401).json({ ok: false, error: 'Token inválido o expirado' })
      }

      // ── 2) Confirmar correo maestro ──
      const emailLlamante = (decoded.email || '').trim().toLowerCase()
      const esMaestro = CORREOS_MAESTROS.map(c => c.toLowerCase()).includes(emailLlamante)
      if (!esMaestro) {
        return res.status(403).json({ ok: false, error: 'No autorizado: solo One Geo puede gestionar administradores' })
      }

      // ── 3) Despachar según la acción ──
      const { accion } = req.body || {}

      // ─────────────────────────────────────────────────────────
      // CREAR
      // ─────────────────────────────────────────────────────────
      if (accion === 'crear') {
        const { email, nombre, empresaId } = req.body || {}
        if (!email || !empresaId) {
          return res.status(400).json({ ok: false, error: 'Faltan datos: email y empresaId son obligatorios' })
        }
        const emailLimpio = String(email).trim().toLowerCase()
        // Contraseña aleatoria fuerte que NADIE ve. El cliente establece la suya
        // con el link de invitación → One Geo nunca conoce su contraseña.
        const passAleatoria = randomBytes(24).toString('base64')

        let userRecord
        try {
          userRecord = await getAuth().createUser({
            email: emailLimpio,
            password: passAleatoria,
            displayName: nombre || emailLimpio.split('@')[0],
            emailVerified: false,
          })
        } catch (e) {
          if (e?.code === 'auth/email-already-exists') {
            return res.status(409).json({ ok: false, error: 'Ya existe un usuario con ese correo' })
          }
          if (e?.code === 'auth/invalid-email') {
            return res.status(400).json({ ok: false, error: 'El correo no tiene un formato válido' })
          }
          throw e
        }

        await db.collection('usuarios').doc(userRecord.uid).set({
          nombre: nombre || emailLimpio.split('@')[0],
          email: emailLimpio,
          rol: 'administrador',
          activo: true,
          permisos: TODOS_LOS_PERMISOS,
          empresaId: String(empresaId),
          creadoPorMaestro: true,
          creadoPor: emailLlamante,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        // Enviar la invitación para que el cliente establezca su contraseña.
        let invitacion = 'enviada'
        try {
          const empSnap = await db.collection('empresas').doc(String(empresaId)).get()
          const empresaNombre = empSnap.exists ? (empSnap.data().nombreComercial || empSnap.data().nombre || '') : ''
          await enviarInvitacion(emailLimpio, nombre, empresaNombre)
        } catch (e) {
          console.error('No se pudo enviar la invitación:', e)
          invitacion = 'error'
        }

        return res.status(200).json({ ok: true, uid: userRecord.uid, invitacion })
      }

      // ─────────────────────────────────────────────────────────
      // LISTAR — admins de una empresa
      // ─────────────────────────────────────────────────────────
      if (accion === 'listar') {
        const { empresaId } = req.body || {}
        if (!empresaId) {
          return res.status(400).json({ ok: false, error: 'Falta empresaId' })
        }
        const snap = await db.collection('usuarios')
          .where('empresaId', '==', String(empresaId))
          .where('rol', '==', 'administrador')
          .get()

        const admins = snap.docs.map(d => {
          const data = d.data()
          return {
            uid: d.id,
            nombre: data.nombre || '',
            email: data.email || '',
            activo: data.activo !== false,
          }
        })
        return res.status(200).json({ ok: true, admins })
      }

      // ─────────────────────────────────────────────────────────
      // CAMBIAR CORREO — en Auth Y en el doc usuarios
      // ─────────────────────────────────────────────────────────
      if (accion === 'cambiar_correo') {
        const { uid, email } = req.body || {}
        if (!uid || !email) {
          return res.status(400).json({ ok: false, error: 'Faltan datos: uid y email' })
        }
        const emailLimpio = String(email).trim().toLowerCase()
        try {
          await getAuth().updateUser(uid, { email: emailLimpio })
        } catch (e) {
          if (e?.code === 'auth/email-already-exists') {
            return res.status(409).json({ ok: false, error: 'Ya existe un usuario con ese correo' })
          }
          if (e?.code === 'auth/invalid-email') {
            return res.status(400).json({ ok: false, error: 'El correo no tiene un formato válido' })
          }
          if (e?.code === 'auth/user-not-found') {
            return res.status(404).json({ ok: false, error: 'No se encontró el usuario' })
          }
          throw e
        }
        await db.collection('usuarios').doc(uid).update({
          email: emailLimpio,
          updatedAt: FieldValue.serverTimestamp(),
        })
        return res.status(200).json({ ok: true })
      }

      // ─────────────────────────────────────────────────────────
      // CAMBIAR CONTRASEÑA — solo en Auth
      // ─────────────────────────────────────────────────────────
      if (accion === 'cambiar_clave') {
        const { uid, password } = req.body || {}
        if (!uid || !password) {
          return res.status(400).json({ ok: false, error: 'Faltan datos: uid y password' })
        }
        if (String(password).length < 6) {
          return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' })
        }
        try {
          await getAuth().updateUser(uid, { password: String(password) })
        } catch (e) {
          if (e?.code === 'auth/user-not-found') {
            return res.status(404).json({ ok: false, error: 'No se encontró el usuario' })
          }
          throw e
        }
        await db.collection('usuarios').doc(uid).update({
          updatedAt: FieldValue.serverTimestamp(),
        })
        return res.status(200).json({ ok: true })
      }

      // ─────────────────────────────────────────────────────────
      // ACTIVAR / DESACTIVAR — campo activo en usuarios + disabled en Auth
      // ─────────────────────────────────────────────────────────
      if (accion === 'toggle_activo') {
        const { uid, activo } = req.body || {}
        if (!uid || typeof activo !== 'boolean') {
          return res.status(400).json({ ok: false, error: 'Faltan datos: uid y activo (true/false)' })
        }
        try {
          // disabled en Auth es lo opuesto de activo (activo=true → disabled=false)
          await getAuth().updateUser(uid, { disabled: !activo })
        } catch (e) {
          if (e?.code === 'auth/user-not-found') {
            return res.status(404).json({ ok: false, error: 'No se encontró el usuario' })
          }
          throw e
        }
        await db.collection('usuarios').doc(uid).update({
          activo: activo,
          updatedAt: FieldValue.serverTimestamp(),
        })
        return res.status(200).json({ ok: true })
      }

      // ─────────────────────────────────────────────────────────
      // REENVIAR INVITACIÓN — nuevo link para establecer contraseña
      // ─────────────────────────────────────────────────────────
      if (accion === 'reenviar_invitacion') {
        const { email } = req.body || {}
        if (!email) {
          return res.status(400).json({ ok: false, error: 'Falta el email' })
        }
        const emailLimpio = String(email).trim().toLowerCase()
        let nombre = ''
        try {
          const u = await getAuth().getUserByEmail(emailLimpio)
          nombre = u.displayName || ''
        } catch (e) {
          return res.status(404).json({ ok: false, error: 'No se encontró un usuario con ese correo' })
        }
        try {
          await enviarInvitacion(emailLimpio, nombre, '')
        } catch (e) {
          console.error('No se pudo reenviar la invitación:', e)
          return res.status(502).json({ ok: false, error: 'No se pudo enviar el correo de invitación.' })
        }
        return res.status(200).json({ ok: true })
      }

      // Acción no reconocida
      return res.status(400).json({ ok: false, error: 'Acción no válida: ' + accion })

    } catch (error) {
      console.error('Error en gestionarAdmin:', error)
      return res.status(500).json({ ok: false, error: 'Error interno: ' + (error?.message || 'desconocido') })
    }
  }
)