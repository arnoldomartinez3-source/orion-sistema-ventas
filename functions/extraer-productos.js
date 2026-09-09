import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { verificarLlamante, responderErrorAuth } from './verificar-llamante.js'

// ══════════════════════════════════════════════════════════════════
// EXTRAER PRODUCTOS DESDE UNA FOTO (factura de compra / lista de precios)
// Lee la imagen con Claude (visión) y devuelve las líneas de producto en
// JSON estructurado para que el usuario las revise e importe al inventario
// (módulo "Levantar inventario", Etapa 2). No escribe en Firestore: solo
// extrae; la importación la hace el cliente con las reglas normales.
//
// Secreto: ANTHROPIC_API_KEY (firebase functions:secrets:set ANTHROPIC_API_KEY)
// Candados: usuario autenticado de la empresa con permiso crear/editar
// productos (o admin / maestro One Geo). Límite de imagen ~6 MB base64.
// ══════════════════════════════════════════════════════════════════

if (!getApps().length) initializeApp()
const db = getFirestore()

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

const Linea = z.object({
  nombre: z.string().describe('Nombre del producto en MAYÚSCULAS, limpio y completo (marca + producto + tamaño), sin códigos ni precios'),
  cantidad: z.number().describe('Cantidad comprada tal como aparece en el documento'),
  unidad: z.string().describe('Unidad de esa cantidad: Unidad, Libra, Litro, Kilo, Caja, Fardo, Paquete, Bolsa, Docena, Botella o Lata'),
  precioUnitario: z.number().nullable().describe('Precio unitario que muestra el documento (costo de compra), o null si no se ve'),
  codigo: z.string().nullable().describe('Código del producto si el documento lo muestra (código del proveedor o de barras), o null'),
})

const Salida = z.object({
  tipoDocumento: z.string().nullable().describe('factura, crédito fiscal, nota de remisión, lista de precios, otro, o null'),
  proveedor: z.string().nullable().describe('Nombre del proveedor/emisor si se ve, o null'),
  fecha: z.string().nullable().describe('Fecha del documento en formato YYYY-MM-DD si se ve, o null'),
  preciosIncluyenIva: z.boolean().nullable().describe('true si los precios unitarios ya incluyen IVA, false si son sin IVA, null si no se puede saber'),
  lineas: z.array(Linea),
  advertencias: z.array(z.string()).describe('Cosas ilegibles, dudas o líneas omitidas, en español'),
})

const MIMES = ['image/jpeg', 'image/png', 'image/webp']

// ── Tope mensual por empresa (mismo esquema que el módulo Correo) ──
// empresas/{id}.modulos.ia_facturas debe estar activo y el contador
// contadores_ia/{empresaId}_{YYYY-MM}.valor no puede pasar de ia_tope (100 por defecto).
// La lectura se RESERVA antes de llamar a la IA (atómico) y se revierte si falla.
const TOPE_DEFAULT = 100
const periodoActual = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit' }).format(new Date())

async function reservarLectura(empresaId, tope, periodo) {
  const ref = db.collection('contadores_ia').doc(`${empresaId}_${periodo}`)
  let usadas
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const actual = snap.exists ? (snap.data().valor || 0) : 0
    if (actual >= tope) {
      throw new Error(`Se alcanzó el tope de ${tope} fotos leídas con IA este mes. Contactá a One Geo para ampliarlo.`)
    }
    usadas = actual + 1
    tx.set(ref, { empresaId, periodo, valor: usadas, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true })
  })
  return usadas
}

function revertirLectura(empresaId, periodo) {
  return db.collection('contadores_ia').doc(`${empresaId}_${periodo}`)
    .set({ valor: FieldValue.increment(-1) }, { merge: true }).catch(() => {})
}

export const extraerProductos = onRequest(
  { timeoutSeconds: 120, memory: '1GiB', invoker: 'public', secrets: [ANTHROPIC_API_KEY] },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

    let llamante
    try {
      llamante = await verificarLlamante(req)
    } catch (err) {
      if (responderErrorAuth(err, res)) return
      return res.status(401).json({ error: 'No autenticado' })
    }

    // Permiso: admin, maestro o crear/editar productos (mismo criterio que las reglas de `productos`).
    if (!llamante.esMaestro) {
      const snap = await db.collection('usuarios').doc(llamante.uid).get()
      const u = snap.exists ? snap.data() : null
      const ok = u && (u.rol === 'administrador' || (u.permisos || []).some(p => ['crear_productos', 'editar_productos'].includes(p)))
      if (!ok) return res.status(403).json({ error: 'Sin permiso para crear/editar productos' })
    }

    // ── Módulo activo + tope mensual (el consumo lo paga One Geo) ──
    const empresaIdG = llamante.empresaId || req.body?.empresaId || null
    if (!empresaIdG) return res.status(400).json({ error: 'No se pudo determinar la empresa' })
    const empSnap = await db.collection('empresas').doc(empresaIdG).get()
    const empresa = empSnap.exists ? empSnap.data() : null
    if (!(empresa?.modulos?.ia_facturas === true)) {
      return res.status(403).json({ ok: false, error: 'El módulo "IA: leer facturas" no está activo para esta empresa. Pedilo a One Geo.' })
    }
    const tope = Number(empresa.ia_tope) > 0 ? Number(empresa.ia_tope) : TOPE_DEFAULT
    const periodoG = periodoActual()
    let reservado = false
    let usadasMes = 0

    const { imagenBase64, mimeType } = req.body || {}
    if (!imagenBase64 || typeof imagenBase64 !== 'string') return res.status(400).json({ error: 'Falta imagenBase64' })
    if (!MIMES.includes(mimeType)) return res.status(400).json({ error: 'mimeType debe ser image/jpeg, image/png o image/webp' })
    if (imagenBase64.length > 6 * 1024 * 1024) return res.status(413).json({ error: 'Imagen demasiado grande (máx. ~4 MB). Reducila antes de enviarla.' })

    // Reservar la lectura contra el tope ANTES de gastar créditos (atómico).
    try {
      usadasMes = await reservarLectura(empresaIdG, tope, periodoG)
      reservado = true
    } catch (e) {
      return res.status(429).json({ ok: false, error: e.message, tope })
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })
    try {
      const response = await client.messages.parse({
        model: 'claude-opus-5',
        max_tokens: 16000,
        system: [
          'Sos un asistente de inventario para tiendas de El Salvador (lácteos, abarrotes, primera necesidad).',
          'Te dan la FOTO de una factura de compra, crédito fiscal, nota de remisión o lista de precios de un proveedor.',
          'Extraé cada línea de producto con precisión. No inventes: si un dato no se ve o es ilegible, dejalo null y explicalo en advertencias.',
          'Nombres en MAYÚSCULAS, limpios y completos (marca, producto y tamaño), sin abreviaturas raras ni precios dentro del nombre.',
          'La cantidad es la que aparece en el documento (no la conviertas); indicá su unidad tal cual (Caja, Fardo, Unidad, Libra…).',
          'El precio unitario es el que muestra el documento (costo de compra). Indicá si los precios incluyen IVA cuando se pueda saber.',
        ].join(' '),
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imagenBase64 } },
            { type: 'text', text: 'Extraé todas las líneas de producto de este documento.' },
          ],
        }],
        output_config: { format: zodOutputFormat(Salida) },
      })

      if (response.stop_reason === 'refusal') {
        if (reservado) await revertirLectura(empresaIdG, periodoG)
        return res.status(422).json({ ok: false, error: 'La IA no pudo procesar esta imagen', detalle: response.stop_details?.explanation || null })
      }
      const out = response.parsed_output
      if (!out) {
        if (reservado) await revertirLectura(empresaIdG, periodoG)
        return res.status(502).json({ ok: false, error: 'La IA no devolvió datos legibles; probá con una foto más nítida.' })
      }

      return res.status(200).json({
        ok: true,
        ...out,
        uso: { entrada: response.usage?.input_tokens ?? null, salida: response.usage?.output_tokens ?? null },
        cuota: { usadas: usadasMes, tope, periodo: periodoG },
      })
    } catch (e) {
      console.error('extraerProductos:', e)
      if (reservado) await revertirLectura(empresaIdG, periodoG) // la lectura no ocurrió: no se cobra
      const status = e?.status && e.status >= 400 && e.status < 600 ? e.status : 500
      return res.status(status).json({ ok: false, error: 'No se pudo leer la imagen', detalle: e?.message || String(e) })
    }
  }
)
