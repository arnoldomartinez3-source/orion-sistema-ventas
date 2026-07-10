// ══════════════════════════════════════════════════════════════
// enviar-factura — Cloud Function (Firebase v2)  ·  Módulo Correo, Fase 1
//
// Envía por correo un DTE ya emitido al receptor, con el mismo patrón que
// usan los certificadores (ej. Infile): cuerpo con marca ORIÓN + resumen del
// documento + los archivos adjuntos (PDF y JSON).
//
// - Lee la factura del BACKEND con Admin SDK → el resumen (emisor, receptor,
//   totales, sello) es confiable, no depende del navegador.
// - El PDF se genera en el cliente (el "PDF" de ORIÓN es HTML renderizado) y
//   llega como base64 en 'pdfBase64'; el JSON oficial se arma acá.
// - Candados: (1) quien llama pertenece a ESA empresa; (2) el módulo 'correo'
//   está activo en la empresa; (3) no se pasó el tope mensual de envíos.
// - Envía con Resend (REST vía fetch). El API key vive como secreto
//   RESEND_API_KEY, nunca en el código.
//
// Entrada (POST JSON, Authorization: Bearer <idToken>):
//   { empresaId, facturaId, coleccion?, destinatario?, pdfBase64? }
// ══════════════════════════════════════════════════════════════

import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

if (!getApps().length) {
  initializeApp()
}

const db = getFirestore()

const RESEND_API_KEY = defineSecret('RESEND_API_KEY')

// Remitente con marca ORIÓN (dominio verificado en Resend).
const REMITENTE = 'ORIÓN <noreply@orionsv.net>'

// Tope mensual de envíos por defecto si la empresa no define 'correo_tope'.
const TOPE_DEFAULT = 500

const TIPOS_DTE_NOMBRE = {
  'FE':  'Factura de consumidor',
  'CCF': 'Comprobante de crédito fiscal',
  'NR':  'Nota de remisión',
  'NC':  'Nota de crédito',
  'ND':  'Nota de débito',
  'FEX': 'Factura de exportación',
  'FSE': 'Factura de sujeto excluido',
  'Retencion': 'Comprobante de retención',
}

const money = (n) => `$${(parseFloat(n) || 0).toFixed(2)}`
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

// Verifica que quien llama pertenezca a la empresa. Soporta ambos tipos de
// usuario: admin real (usuarios/{uid}) y empleado por PIN (sesiones_empleado/{uid}).
async function verificarLlamante(req, empresaId) {
  const h = req.headers.authorization || ''
  const idToken = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!idToken) throw new Error('No autenticado')
  const decoded = await getAuth().verifyIdToken(idToken)
  const uid = decoded.uid

  const userSnap = await db.collection('usuarios').doc(uid).get()
  if (userSnap.exists) {
    if (userSnap.data().empresaId !== empresaId) throw new Error('La empresa no coincide')
    return
  }
  const sesSnap = await db.collection('sesiones_empleado').doc(uid).get()
  if (sesSnap.exists) {
    if (sesSnap.data().empresaId !== empresaId) throw new Error('La empresa no coincide')
    return
  }
  throw new Error('Usuario no válido')
}

// Reserva un envío de forma atómica contra el tope mensual. Devuelve el
// consumo actualizado. Lanza si se pasó el tope.
async function reservarEnvio(empresaId, tope, periodo) {
  const ref = db.collection('contadores_correo').doc(`${empresaId}_${periodo}`)
  let enviados
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const actual = snap.exists ? (snap.data().valor || 0) : 0
    if (actual >= tope) {
      throw new Error(`Se alcanzó el tope de ${tope} correos de este mes. Contactá a One Geo para ampliarlo.`)
    }
    enviados = actual + 1
    tx.set(ref, {
      empresaId, periodo, valor: enviados,
      actualizadoEn: FieldValue.serverTimestamp(),
    }, { merge: true })
  })
  return enviados
}

// Devuelve el objeto contador para poder revertir si el envío falla.
function contadorRef(empresaId, periodo) {
  return db.collection('contadores_correo').doc(`${empresaId}_${periodo}`)
}

// Arma el JSON oficial que se adjunta (DTE + sello), igual que descargarJSON del front.
function construirJsonOficial(f, empresa) {
  let dteParseado = null
  if (f.dte_json) {
    try { dteParseado = typeof f.dte_json === 'string' ? JSON.parse(f.dte_json) : f.dte_json } catch { /* fallback */ }
  }
  return {
    ...(dteParseado || {
      identificacion: {
        codigoGeneracion: f.codigoGeneracion,
        numeroControl: f.numeroControl,
        fecEmi: f.fechaEmision,
        ambiente: f.dte_ambiente || '00',
      },
      emisor: { nit: empresa?.nit, nombre: empresa?.empresaNombre },
      receptor: { nit: f.nit || null, nombre: f.cliente },
    }),
    selloRecibido: f.dte_sello || null,
    fhProcesamiento: f.dte_fhProcesamiento || null,
    ...(f.dte_estado_invalidacion ? { invalidacion: f.dte_estado_invalidacion } : {}),
  }
}

// Cuerpo del correo con marca ORIÓN (navy + dorado), estilo certificador.
function construirHtml({ receptorNombre, receptorNit, emisorNombre, emisorNit, tipoNombre, numeroControl, codigoGeneracion, fecha, total }) {
  const fila = (label, val, alt) => `
    <tr style="background:${alt ? '#eef2f7' : '#ffffff'}">
      <td style="padding:10px 14px;color:#64748b;font-size:13px;">${esc(label)}</td>
      <td style="padding:10px 14px;color:#0c2240;font-size:13px;font-weight:600;text-align:right;">${esc(val)}</td>
    </tr>`
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(12,34,64,.08);">
          <tr><td style="background:#0c2240;padding:22px 28px;">
            <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">ORI<span style="color:#c8a44d;">Ó</span>N</span>
            <span style="color:#94a3b8;font-size:12px;float:right;padding-top:8px;">Documento electrónico</span>
          </td></tr>
          <tr><td style="padding:26px 28px 6px;">
            <p style="margin:0 0 4px;color:#0c2240;font-size:15px;">Estimado cliente: <strong>${esc(receptorNombre)}</strong></p>
            ${receptorNit ? `<p style="margin:0 0 14px;color:#64748b;font-size:13px;">NIT/Documento: ${esc(receptorNit)}</p>` : ''}
            <p style="margin:0 0 18px;color:#334155;font-size:14px;"><strong>${esc(emisorNombre)}</strong> le emitió un documento electrónico:</p>
          </td></tr>
          <tr><td style="padding:0 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
              ${fila('Tipo', tipoNombre, true)}
              ${fila('Número de control', numeroControl, false)}
              ${fila('Código de generación', codigoGeneracion, true)}
              ${fila('NIT Emisor', emisorNit, false)}
              ${fila('Fecha de emisión', fecha, true)}
              <tr style="background:#0c2240;">
                <td style="padding:12px 14px;color:#c8a44d;font-size:14px;font-weight:700;">Total</td>
                <td style="padding:12px 14px;color:#ffffff;font-size:16px;font-weight:700;text-align:right;">${esc(total)}</td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding:20px 28px 6px;">
            <p style="margin:0;color:#475569;font-size:13px;">Adjunto a este correo encontrará el <strong>PDF</strong> y el <strong>JSON</strong> oficial del documento, válidos ante el Ministerio de Hacienda.</p>
          </td></tr>
          <tr><td style="padding:16px 28px 24px;">
            <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.5;">AVISO DE CONFIDENCIALIDAD: Este mensaje y sus documentos adjuntos contienen información confidencial de uso exclusivo del destinatario. Si usted no es el receptor autorizado, por favor bórrelo e informe al remitente.</p>
          </td></tr>
          <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;">
            <p style="margin:0;color:#64748b;font-size:12px;">Att. Equipo <strong style="color:#0c2240;">ORIÓN</strong> · One Geo Systems</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`
}

export const enviarFactura = onRequest(
  { timeoutSeconds: 60, memory: '512MiB', cors: true, secrets: [RESEND_API_KEY] },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Método no permitido' })
    }
    let empresaIdG, periodoG, reservado = false // para revertir el contador si el envío falla
    try {
      const { empresaId, facturaId, coleccion, destinatario, pdfBase64 } = req.body || {}
      if (!empresaId || !facturaId) return res.status(400).json({ ok: false, error: 'Faltan datos' })

      await verificarLlamante(req, empresaId)

      // Candado de módulo: 'correo' debe estar activo en la empresa.
      const empSnap = await db.collection('empresas').doc(empresaId).get()
      const empresa = empSnap.exists ? empSnap.data() : {}
      if (!(empresa.modulos && empresa.modulos.correo === true)) {
        return res.status(403).json({ ok: false, error: 'El módulo de correo no está activo para esta empresa.' })
      }

      // Datos del emisor para el remitente/Reply-To y el resumen.
      const cfgSnap = await db.collection('configuracion').doc(empresaId).get()
      const cfg = cfgSnap.exists ? cfgSnap.data() : {}

      // Leer la factura (fuente confiable). Se busca en la colección indicada,
      // con fallback a 'ventas' y 'facturas'.
      const colecciones = coleccion ? [coleccion, 'ventas', 'facturas'] : ['ventas', 'facturas']
      let f = null
      for (const c of [...new Set(colecciones)]) {
        const s = await db.collection(c).doc(facturaId).get()
        if (s.exists) { f = s.data(); break }
      }
      if (!f) return res.status(404).json({ ok: false, error: 'No se encontró el documento' })
      if (f.empresaId && f.empresaId !== empresaId) {
        return res.status(403).json({ ok: false, error: 'El documento no pertenece a esta empresa' })
      }

      const para = (destinatario || f.email || f.correo || '').trim()
      if (!para || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) {
        return res.status(400).json({ ok: false, error: 'El destinatario no tiene un correo válido' })
      }

      // Reservar contra el tope mensual (atómico) ANTES de enviar.
      const tope = Number(empresa.correo_tope) > 0 ? Number(empresa.correo_tope) : TOPE_DEFAULT
      const periodo = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit' })
        .format(new Date()).replace('-', '') // YYYYMM
      empresaIdG = empresaId; periodoG = periodo
      const enviadosMes = await reservarEnvio(empresaId, tope, periodo)
      reservado = true

      // Armar resumen + adjuntos.
      const tipoNombre = TIPOS_DTE_NOMBRE[f.tipoDte] || f.tipoDte || 'Documento electrónico'
      const jsonOficial = construirJsonOficial(f, { nit: cfg.nit || empresa.nit, empresaNombre: cfg.empresaNombre || empresa.nombre })
      const jsonB64 = Buffer.from(JSON.stringify(jsonOficial, null, 2), 'utf-8').toString('base64')
      const nombreArch = String(f.numeroControl || f.numero || f.codigoGeneracion || 'documento').replace(/[^\w-]/g, '_')

      const adjuntos = [{ filename: `${nombreArch}.json`, content: jsonB64 }]
      if (pdfBase64) {
        const limpio = String(pdfBase64).replace(/^data:application\/pdf;base64,/, '')
        adjuntos.push({ filename: `${nombreArch}.pdf`, content: limpio })
      }

      const html = construirHtml({
        receptorNombre: f.cliente || f.nombreReceptor || 'Cliente',
        receptorNit: f.nit || f.numDocumento || '',
        emisorNombre: cfg.empresaNombre || empresa.nombre || 'Su proveedor',
        emisorNit: cfg.nit || empresa.nit || '',
        tipoNombre,
        numeroControl: f.numeroControl || '—',
        codigoGeneracion: f.codigoGeneracion || '—',
        fecha: f.fechaEmision || f.fecha || '—',
        total: money(f.total),
      })

      const replyTo = (cfg.correo || cfg.email || '').trim()
      const payload = {
        from: REMITENTE,
        to: [para],
        subject: `${tipoNombre} ${f.numeroControl || ''} — ${cfg.empresaNombre || empresa.nombre || 'ORIÓN'}`.trim(),
        html,
        attachments: adjuntos,
        ...(replyTo && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(replyTo) ? { reply_to: replyTo } : {}),
      }

      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY.value()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!r.ok) {
        // Revertir la reserva del contador: el envío no ocurrió.
        await contadorRef(empresaId, periodo).set({ valor: FieldValue.increment(-1) }, { merge: true }).catch(() => {})
        const txt = await r.text().catch(() => '')
        console.error('Resend error:', r.status, txt)
        return res.status(502).json({ ok: false, error: `El proveedor de correo rechazó el envío (${r.status}).` })
      }

      const data = await r.json().catch(() => ({}))

      // Bitácora de auditoría.
      await db.collection('envios_correo').add({
        empresaId, facturaId,
        tipoDte: f.tipoDte || null,
        numeroControl: f.numeroControl || null,
        destinatario: para,
        proveedorId: data.id || null,
        conPdf: !!pdfBase64,
        enviadoEn: FieldValue.serverTimestamp(),
      }).catch(() => {})

      return res.status(200).json({ ok: true, id: data.id || null, destinatario: para, enviadosMes, tope })
    } catch (e) {
      // Si ya reservamos el contador y algo falló después, revertir.
      if (reservado && empresaIdG && periodoG) {
        await contadorRef(empresaIdG, periodoG).set({ valor: FieldValue.increment(-1) }, { merge: true }).catch(() => {})
      }
      console.error('Error en enviarFactura:', e)
      return res.status(400).json({ ok: false, error: e.message || 'Error al enviar' })
    }
  }
)
