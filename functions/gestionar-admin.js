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
import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

if (!getApps().length) {
  initializeApp()
}

const db = getFirestore()

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
  { timeoutSeconds: 60, memory: '256MiB', cors: true },
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
        const { email, password, nombre, empresaId } = req.body || {}
        if (!email || !password || !empresaId) {
          return res.status(400).json({ ok: false, error: 'Faltan datos: email, password y empresaId son obligatorios' })
        }
        if (String(password).length < 6) {
          return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' })
        }
        const emailLimpio = String(email).trim().toLowerCase()

        let userRecord
        try {
          userRecord = await getAuth().createUser({
            email: emailLimpio,
            password: String(password),
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

        return res.status(200).json({ ok: true, uid: userRecord.uid })
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

      // Acción no reconocida
      return res.status(400).json({ ok: false, error: 'Acción no válida: ' + accion })

    } catch (error) {
      console.error('Error en gestionarAdmin:', error)
      return res.status(500).json({ ok: false, error: 'Error interno: ' + (error?.message || 'desconocido') })
    }
  }
)