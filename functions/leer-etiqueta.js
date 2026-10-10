import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { verificarLlamante, responderErrorAuth } from './verificar-llamante.js'

// ══════════════════════════════════════════════════════════════════
// FOTO CAPTURA INVENTARIO — módulo "foto_captura"
//
// 1) leerEtiqueta: la cajera tomó con el teléfono la foto del frente de un
//    producto que la caja no conocía (doc `capturas/{id}`, imagen en Storage).
//    Se lee la etiqueta con Claude (visión) y se escribe en la captura el
//    nombre, marca y tamaño propuestos; la PC está escuchando ese doc y llena
//    el formulario de "Producto nuevo". Tope mensual por empresa
//    (contadores_foto/{empresaId}_{AAAA-MM}, empresas.foto_tope, 300 por defecto).
//
// 2) catalogoAportar: cuando el producto se guarda, su nombre confirmado queda
//    en `catalogo_maestro/{codigoBarras}` (catálogo de One Geo compartido
//    entre tiendas: solo código, nombre, categoría, unidad e imagen; nunca
//    precios ni existencias). La siguiente tienda que escanee ese código
//    recibe el nombre ya revisado, sin foto ni IA. Un nombre marcado
//    `revisado: true` desde el Panel One Geo no se pisa.
//
// Secreto: ANTHROPIC_API_KEY (el mismo de extraer-productos).
// ══════════════════════════════════════════════════════════════════

if (!getApps().length) initializeApp()
const db = getFirestore()
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

const Etiqueta = z.object({
  nombre: z.string().describe('Nombre comercial del producto tal como se vende en una tienda, en MAYÚSCULAS: MARCA + PRODUCTO + SABOR/VARIANTE + TAMAÑO. Ej.: "GATORADE MELON 600 ML", "DIANA CHURRITOS MAX 25 G", "SALUD LECHE ENTERA GALON 3.785 LT". Sin precios ni códigos.'),
  marca: z.string().nullable().describe('Marca, o null si no se ve'),
  tamano: z.string().nullable().describe('Contenido neto como aparece en el empaque (ej. "600 ML", "25 G", "1.25 LT"), o null si no se ve'),
  categoria: z.string().nullable().describe('Una de: ABARROTES, BEBIDAS, SNACKS Y GOLOSINAS, LACTEOS, QUESOS, PANADERIA, LIMPIEZA E HIGIENE, HOGAR Y BAZAR, DESECHABLES, CONGELADOS, EMBUTIDOS, CARNES, HUEVOS, FARMACIA, FERRETERIA, OTROS'),
  unidad: z.string().describe('Unidad en que se vende la pieza fotografiada: Unidad, Botella, Lata, Bolsa, Paquete, Caja, Libra o Litro'),
  precioImpreso: z.number().nullable().describe('Precio en dólares impreso en el empaque (ej. "$0.25"), o null si no hay'),
  confianza: z.enum(['alta', 'media', 'baja']).describe('Qué tan legible estaba la etiqueta'),
  advertencia: z.string().nullable().describe('Si algo no se leyó bien (tamaño borroso, sabor dudoso), en una frase en español; si no, null'),
})

const TOPE_DEFAULT = 300
const periodoActual = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit' }).format(new Date())

async function reservarLectura(empresaId, tope, periodo) {
  const ref = db.collection('contadores_foto').doc(`${empresaId}_${periodo}`)
  let usadas
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const actual = snap.exists ? (snap.data().valor || 0) : 0
    if (actual >= tope) throw new Error(`Se alcanzó el tope de ${tope} fotos leídas este mes. Contactá a One Geo para ampliarlo.`)
    usadas = actual + 1
    tx.set(ref, { empresaId, periodo, valor: usadas, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true })
  })
  return usadas
}
const revertirLectura = (empresaId, periodo) => db.collection('contadores_foto').doc(`${empresaId}_${periodo}`)
  .set({ valor: FieldValue.increment(-1) }, { merge: true }).catch(() => {})

export const leerEtiqueta = onRequest(
  { timeoutSeconds: 60, memory: '512MiB', invoker: 'public', secrets: [ANTHROPIC_API_KEY] },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
    let llamante
    try { llamante = await verificarLlamante(req) } catch (err) { if (responderErrorAuth(err, res)) return; return res.status(401).json({ error: 'No autenticado' }) }

    const { capturaId } = req.body || {}
    if (!capturaId || typeof capturaId !== 'string') return res.status(400).json({ error: 'Falta capturaId' })
    const capRef = db.collection('capturas').doc(capturaId)
    const capSnap = await capRef.get()
    if (!capSnap.exists) return res.status(404).json({ error: 'La captura no existe' })
    const cap = capSnap.data()
    if (!llamante.esMaestro && cap.empresaId !== llamante.empresaId) return res.status(403).json({ error: 'La captura es de otra empresa' })
    if (!cap.fotoPath) return res.status(400).json({ error: 'La captura todavía no tiene foto' })

    // Módulo activo + tope del mes (el consumo lo paga One Geo)
    const empSnap = await db.collection('empresas').doc(cap.empresaId).get()
    const empresa = empSnap.exists ? empSnap.data() : null
    if (!(empresa?.modulos?.foto_captura === true)) return res.status(403).json({ ok: false, error: 'El módulo "Foto Captura Inventario" no está activo para esta empresa.' })
    const tope = Number(empresa.foto_tope) > 0 ? Number(empresa.foto_tope) : TOPE_DEFAULT
    const periodo = periodoActual()
    let usadas
    try { usadas = await reservarLectura(cap.empresaId, tope, periodo) } catch (e) { return res.status(429).json({ ok: false, error: e.message, tope }) }

    try {
      const [buf] = await getStorage().bucket().file(cap.fotoPath).download()
      if (buf.length > 5 * 1024 * 1024) throw new Error('La foto pesa más de 5 MB')
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })
      const response = await client.messages.parse({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: [
          'Sos un asistente de inventario para tiendas de El Salvador (lácteos, abarrotes, boquitas, limpieza).',
          'Te dan la FOTO DEL FRENTE de un producto. Leé la etiqueta y devolvé el nombre comercial completo con marca, variante y tamaño, como se escribiría en el inventario de una tienda.',
          'No inventes: si el tamaño o el sabor no se ven, dejalos null y decilo en advertencia. Nombres en MAYÚSCULAS, sin acentos.',
        ].join(' '),
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } },
          { type: 'text', text: `Código de barras escaneado: ${cap.codigoBarras || 'desconocido'}. ¿Qué producto es?` },
        ] }],
        output_config: { format: zodOutputFormat(Etiqueta) },
      })
      const out = response.parsed_output
      if (response.stop_reason === 'refusal' || !out) throw new Error('La IA no pudo leer la etiqueta; probá con una foto más nítida.')
      await capRef.update({ ia: out, estado: 'listo', iaEn: FieldValue.serverTimestamp(), iaModelo: 'claude-haiku-4-5-20251001' })
      return res.status(200).json({ ok: true, ...out, cuota: { usadas, tope, periodo } })
    } catch (e) {
      console.error('leerEtiqueta:', e)
      await revertirLectura(cap.empresaId, periodo)
      await capRef.update({ estado: 'error_ia', iaError: e?.message || String(e) }).catch(() => {})
      const status = e?.status && e.status >= 400 && e.status < 600 ? e.status : 500
      return res.status(status).json({ ok: false, error: 'No se pudo leer la foto', detalle: e?.message || String(e) })
    }
  }
)

const limpiar = (s, max) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, max)

export const catalogoAportar = onRequest(
  { timeoutSeconds: 30, memory: '256MiB', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
    let llamante
    try { llamante = await verificarLlamante(req) } catch (err) { if (responderErrorAuth(err, res)) return; return res.status(401).json({ error: 'No autenticado' }) }
    const { codigoBarras, nombre, categoria, unidad, imagen } = req.body || {}
    const codigo = limpiar(codigoBarras, 14)
    if (!/^\d{8,14}$/.test(codigo)) return res.status(400).json({ error: 'codigoBarras inválido' })
    const nom = limpiar(nombre, 120)
    if (nom.length < 3) return res.status(400).json({ error: 'nombre inválido' })
    const ref = db.collection('catalogo_maestro').doc(codigo)
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        const actual = snap.exists ? snap.data() : null
        if (actual?.revisado === true) { tx.update(ref, { veces: FieldValue.increment(1) }); return } // nombre revisado por One Geo: no se pisa
        tx.set(ref, {
          codigoBarras: codigo, nombre: nom, categoria: limpiar(categoria, 60), unidad: limpiar(unidad, 30) || 'Unidad',
          ...(typeof imagen === 'string' && /^https:\/\//.test(imagen) && { imagen: imagen.slice(0, 600) }),
          empresaOrigen: llamante.empresaId || null, aportadoPor: llamante.uid, revisado: false,
          veces: FieldValue.increment(1), actualizadoEn: FieldValue.serverTimestamp(),
          ...(!actual && { creadoEn: FieldValue.serverTimestamp() }),
        }, { merge: true })
      })
      return res.status(200).json({ ok: true })
    } catch (e) {
      console.error('catalogoAportar:', e)
      return res.status(500).json({ ok: false, error: e?.message || String(e) })
    }
  }
)
