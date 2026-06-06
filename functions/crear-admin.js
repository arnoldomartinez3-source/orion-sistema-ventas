// ══════════════════════════════════════════════════════════════
// crear-admin — Cloud Function (Firebase v2)
//
// Crea un usuario ADMIN para una empresa cliente, SIN desloguear al
// maestro (One Geo). Esto no se puede hacer desde el navegador con el
// SDK normal (createUserWithEmailAndPassword cambia la sesión activa),
// por eso vive en el servidor con firebase-admin.
//
// SEGURIDAD (doble candado):
//   1) Verifica el ID token de Firebase del que llama (debe ser válido).
//   2) Confirma que el email del token es un CORREO MAESTRO de One Geo.
// Si no cumple, rechaza. Nadie más puede crear admins.
//
// Entrada (POST, JSON):
//   { email, password, nombre, empresaId }
// Salida:
//   { ok: true, uid } | { ok: false, error }
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
// Si agregás un maestro nuevo, actualizá ambos lugares.
const CORREOS_MAESTROS = [
  'arnoldomartinez3@gmail.com',
]

// Los 36 permisos del sistema. El admin de empresa los recibe todos
// (es el dueño de su negocio). Debe coincidir con TODOS_LOS_PERMISOS
// del frontend (AuthContext.jsx).
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

export const crearAdmin = onRequest(
  { timeoutSeconds: 60, memory: '256MiB', cors: true },
  async (req, res) => {
    // Solo POST
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Método no permitido' })
    }

    try {
      // ── 1) Verificar el token del que llama ──
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null

      if (!token) {
        return res.status(401).json({ ok: false, error: 'Falta el token de autenticación' })
      }

      let decoded
      try {
        decoded = await getAuth().verifyIdToken(token)
      } catch (e) {
        return res.status(401).json({ ok: false, error: 'Token inválido o expirado' })
      }

      // ── 2) Confirmar que es un correo maestro de One Geo ──
      const emailLlamante = (decoded.email || '').trim().toLowerCase()
      const esMaestro = CORREOS_MAESTROS.map(c => c.toLowerCase()).includes(emailLlamante)
      if (!esMaestro) {
        return res.status(403).json({ ok: false, error: 'No autorizado: solo One Geo puede crear administradores' })
      }

      // ── 3) Validar los datos de entrada ──
      const { email, password, nombre, empresaId } = req.body || {}

      if (!email || !password || !empresaId) {
        return res.status(400).json({ ok: false, error: 'Faltan datos: email, password y empresaId son obligatorios' })
      }
      if (String(password).length < 6) {
        return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' })
      }

      const emailLimpio = String(email).trim().toLowerCase()

      // ── 4) Crear el usuario en Firebase Auth ──
      let userRecord
      try {
        userRecord = await getAuth().createUser({
          email: emailLimpio,
          password: String(password),
          displayName: nombre || emailLimpio.split('@')[0],
          emailVerified: false,
        })
      } catch (e) {
        // Errores comunes: email ya existe, formato inválido
        if (e?.code === 'auth/email-already-exists') {
          return res.status(409).json({ ok: false, error: 'Ya existe un usuario con ese correo' })
        }
        if (e?.code === 'auth/invalid-email') {
          return res.status(400).json({ ok: false, error: 'El correo no tiene un formato válido' })
        }
        throw e
      }

      // ── 5) Crear su documento en 'usuarios' ──
      // ID del documento = uid (igual que AuthContext.jsx), y el email
      // dentro (PermisosContext.jsx busca por email). Así es compatible
      // con las dos formas en que el sistema lee el perfil.
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

    } catch (error) {
      console.error('Error creando admin:', error)
      return res.status(500).json({ ok: false, error: 'Error interno: ' + (error?.message || 'desconocido') })
    }
  }
)
