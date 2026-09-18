// ══════════════════════════════════════════════════════════════
// COMPARTIR un DTE con el cliente — lo usan Facturas DTE y el POS.
//
// WhatsApp: se arma el PDF en el navegador y se abre el menú "Compartir" del
// equipo (celular, o Windows con WhatsApp instalado) con el PDF ADJUNTO; la cajera
// elige el chat. No se publica nada en internet. Si el equipo no permite compartir
// archivos, se descarga el PDF y se abre WhatsApp con el texto para adjuntarlo.
//
// Correo: el envío real (función enviar-factura): PDF + JSON oficial adjuntos desde
// noreply@orionsv.net, con tope mensual por empresa (módulo 'correo').
// ══════════════════════════════════════════════════════════════
import { generarPdfBase64, buildUrlConsultaMH } from './imprimir'
import { postAutenticado } from './apiAuth'
import { orionAlert, orionConfirm, orionPrompt } from '../orionDialog'

const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2)}`

// Enlace oficial de consulta del MH (el mismo del QR), solo si el DTE ya tiene sello o es contingencia.
export const enlaceMH = (f) =>
  f?.codigoGeneracion && (f.dte_estado === 'PROCESADO' || f.dte_estado === 'CONTINGENCIA') ? buildUrlConsultaMH(f) : ''

// Texto que acompaña al PDF.
export function mensajeDTE({ tipoNombre, numero, total, empresaNombre, url }) {
  return [
    '¡Hola!',
    `Le compartimos su *${tipoNombre}*${numero ? ` No. ${numero}` : ''}${empresaNombre ? ` de *${empresaNombre}*` : ''}.`,
    `Total: *${fmt(total)}*`,
    url ? `\nPuede verificarla en el Ministerio de Hacienda:\n${url}` : '',
    '\n¡Gracias por su compra!',
  ].filter(Boolean).join('\n')
}

const aArchivoPdf = (base64, nombre) => {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  return new File([bytes], nombre, { type: 'application/pdf' })
}

// Teléfono de El Salvador (8 dígitos) → 503XXXXXXXX para abrir el chat directo.
const telefonoWA = (tel) => {
  const d = String(tel || '').replace(/\D/g, '')
  if (d.length === 8) return '503' + d
  if (d.length === 11 && d.startsWith('503')) return d
  return ''
}

/**
 * Comparte el PDF por WhatsApp. html = el PDF de ORIÓN (generarPDF).
 * @returns {Promise<'compartido'|'cancelado'|'descargado'>}
 */
export async function compartirPdfWhatsApp({ html, nombreArchivo, texto, telefono }) {
  const base64 = await generarPdfBase64(html)
  const archivo = aArchivoPdf(base64, nombreArchivo)

  if (navigator.canShare?.({ files: [archivo] })) {
    const compartir = () => navigator.share({ files: [archivo], text: texto, title: nombreArchivo })
    try {
      await compartir()
      return 'compartido'
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelado'
      // Armar el PDF tardó y el navegador ya no considera que fue un clic del usuario:
      // se pide un clic más y se comparte.
      if (e?.name === 'NotAllowedError') {
        const ok = await orionConfirm('El PDF está listo. Tocá Compartir y elegí WhatsApp.', { titulo: 'Compartir PDF', okLabel: 'Compartir', tipo: 'info' })
        if (!ok) return 'cancelado'
        try { await compartir(); return 'compartido' } catch (e2) { if (e2?.name === 'AbortError') return 'cancelado' }
      }
    }
  }

  // Sin "Compartir" en este equipo: descargar el PDF y abrir WhatsApp con el texto.
  const url = URL.createObjectURL(archivo)
  const a = Object.assign(document.createElement('a'), { href: url, download: nombreArchivo })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000)
  const tel = telefonoWA(telefono)
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank')
  orionAlert(`Se descargó ${nombreArchivo}. En WhatsApp tocá el clip 📎 y adjuntalo desde Descargas.`, { titulo: 'PDF descargado', tipo: 'info' })
  return 'descargado'
}

/**
 * Pide el correo (prellenado si el cliente lo tiene) y envía el DTE con PDF + JSON.
 * @returns {Promise<boolean>} true si se envió
 */
export async function enviarDTEPorCorreo({ empresaId, facturaId, coleccion = 'facturas', html, correoSugerido = '', titulo = '' }) {
  const destino = await orionPrompt(
    `Correo del cliente para enviar ${titulo}:`,
    { titulo: 'Enviar por correo', okLabel: 'Enviar', valorInicial: (correoSugerido || '').trim(), placeholder: 'cliente@correo.com', inputTipo: 'email' }
  )
  if (destino == null) return false
  const destinatario = destino.trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destinatario)) {
    orionAlert('El correo no tiene un formato válido.', { tipo: 'warning' })
    return false
  }
  try {
    let pdfBase64 = null
    try { pdfBase64 = await generarPdfBase64(html) } catch (ePdf) { console.warn('No se pudo generar el PDF, se enviará solo el JSON:', ePdf) }
    const resp = await postAutenticado('/api/dte/enviar-factura', { empresaId, facturaId, coleccion, destinatario, pdfBase64 })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || !data.ok) throw new Error(data.error || `Error ${resp.status}`)
    orionAlert(`Correo enviado a ${data.destinatario}.` + (data.tope ? `\n\nEnvíos este mes: ${data.enviadosMes} de ${data.tope}.` : ''), { titulo: 'Enviado', tipo: 'success' })
    return true
  } catch (e) {
    console.error('Error al enviar por correo:', e)
    orionAlert('No se pudo enviar el correo: ' + e.message, { tipo: 'error' })
    return false
  }
}
