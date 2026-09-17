// ══════════════════════════════════════════════════════════════════
// HTML seguro para impresiones (tickets, PDF, vales, reportes)
// Las plantillas se arman con template strings y se escriben en un iframe del
// MISMO origen. Si un nombre de cliente o producto trae HTML (p. ej.
// `<img src=x onerror=...>`), ese código se ejecutaría con la sesión de quien
// imprime (un administrador). Dos defensas:
//   1) esc(): todo texto que viene de datos editables se escapa.
//   2) Los iframes de impresión llevan `sandbox` SIN allow-scripts: aunque algo
//      se escape por error, ningún script corre ahí adentro.
// ══════════════════════════════════════════════════════════════════

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

// Escapa texto para meterlo en HTML (contenido o atributo entre comillas)
export const esc = (valor) => String(valor ?? '').replace(/[&<>"']/g, c => ENTIDADES[c])

// Solo imágenes https o data:image; cualquier otra cosa (javascript:, comillas) se descarta
export const urlImagenSegura = (url) => {
  const s = String(url || '').trim()
  if (/^https:\/\/[^\s"'<>`]+$/i.test(s)) return s
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(s)) return s
  return ''
}

// Copia del objeto con los campos de texto indicados ya escapados (los demás quedan igual)
export const escCampos = (obj, campos) => {
  if (!obj || typeof obj !== 'object') return obj
  const copia = { ...obj }
  for (const c of campos) if (typeof copia[c] === 'string') copia[c] = esc(copia[c])
  return copia
}

// Permisos del iframe de impresión: mismo origen (el padre escribe el HTML y llama a print())
// y ventanas modales (el cuadro de impresión). Sin scripts.
export const SANDBOX_IMPRESION = 'allow-same-origin allow-modals'

// Crea el iframe aislado para imprimir / generar PDF
export const crearIframeImpresion = () => {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', SANDBOX_IMPRESION)
  return iframe
}

// Campos de texto de una factura/venta que se muestran en las impresiones
export const CAMPOS_DOC = [
  'cliente', 'nit', 'dui', 'nrc', 'descActividad', 'actividad', 'complemento', 'email', 'correo', 'telefono',
  'observaciones', 'notas', 'numero', 'numeroControl', 'codigoGeneracion', 'dte_sello', 'descripcion',
  'nombreReceptor', 'numDocumento', 'motivo', 'cajero', 'vendedor',
  'dte_invalidacionMotivo', 'dte_invalidacionCodigoGeneracion', 'dte_invalidacionSello', 'dte_invalidacionCodigoReemplazo',
]

// Campos de texto de la empresa (configuracion) que salen en encabezados
export const CAMPOS_EMPRESA = [
  'empresaNombre', 'nombreComercial', 'nombre', 'descActividad', 'actividadEconomica', 'nit', 'nrc', 'correo', 'email',
  'telefono', 'direccion', 'complemento', 'distrito', 'municipio', 'departamento', 'codEstableMH', 'codPuntoVentaMH',
  'empresaSlogan',
]

// Documento listo para imprimir: textos escapados, ítems con nombre escapado, dirección y personas del evento
export const docParaImprimir = (f) => {
  if (!f) return f
  const d = escCampos(f, CAMPOS_DOC)
  if (f.direccion && typeof f.direccion === 'object') d.direccion = escCampos(f.direccion, ['complemento'])
  else if (typeof f.direccion === 'string') d.direccion = esc(f.direccion)
  if (Array.isArray(f.items)) d.items = f.items.map(it => escCampos(it, ['nombre', 'descripcion', 'unidad', 'codigo']))
  for (const k of ['dte_invalidacionResponsable', 'dte_invalidacionSolicitante']) {
    if (f[k] && typeof f[k] === 'object') d[k] = escCampos(f[k], ['nombre', 'numDoc', 'tipoDoc'])
  }
  return d
}

export const empresaParaImprimir = (e = {}) => ({ ...escCampos(e || {}, CAMPOS_EMPRESA), logoUrl: urlImagenSegura(e?.logoUrl) })
