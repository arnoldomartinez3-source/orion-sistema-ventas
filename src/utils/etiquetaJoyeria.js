// Etiqueta colgante de joyería ("rat tail" / pesa) de 56 × 13 mm para impresora de etiquetas (Zebra ZD421).
// La etiqueta tiene dos paneles imprimibles en los extremos (≈20 mm cada uno) unidos por una tira
// angosta (≈16 mm) que se enrolla en el anillo: el panel IZQUIERDO lleva marca, precio y SKU; el panel
// DERECHO lleva el código (Code128 o QR) para leerlo con el lector en la caja.
// Todo en mm y vectorial (SVG) para que salga nítido a 203 o 300 dpi.

export const JOYERIA = { ancho: 56, alto: 13, panel: 20, cuello: 16 }

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const svgUrl = (svg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)

// Code128 vectorial: devuelve { url, modulos } (ancho real = modulos × mm por módulo)
async function code128(texto) {
  const JsBarcode = (await import('jsbarcode')).default
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  JsBarcode(el, String(texto), { format: 'CODE128', width: 1, height: 40, displayValue: false, margin: 0 })
  const modulos = parseFloat(el.getAttribute('width')) || 100
  return { url: svgUrl(el.outerHTML), modulos }
}
// QR vectorial (versión mínima que quepa el texto)
async function qr(texto) {
  const QRCode = (await import('qrcode')).default
  const svg = await QRCode.toString(String(texto), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
  return svgUrl(svg)
}

// items: [{ nombre, precio (con IVA), sku, codigoBarras, copias }]
// op: { tipo: 'code128' | 'qr', codigo: 'sku' | 'barras', modulo: mm por módulo (Code128), marca, variante }
export async function generarHTMLEtiquetaJoyeria(items, empresa = {}, op = {}) {
  const tipo = op.tipo || 'code128', fuente = op.codigo || 'sku', modulo = op.modulo || 0.25
  const marca = op.marca ?? (empresa.nombreComercial || empresa.empresaNombre || '')
  const { panel, cuello, ancho, alto } = { ...JOYERIA, ...(op.medidas || {}) }
  const cache = {}
  let etiquetas = ''
  for (const it of items) {
    const texto = fuente === 'barras' ? String(it.codigoBarras || it.sku || '') : String(it.sku || it.codigoBarras || '')
    if (!texto) continue
    const clave = tipo + ':' + texto
    if (!cache[clave]) cache[clave] = tipo === 'qr' ? { url: await qr(texto) } : await code128(texto)
    const c = cache[clave]
    const precio = (it.precio != null && it.precio !== '') ? '$' + Number(it.precio).toFixed(2) : ''
    const anchoBarras = tipo === 'qr' ? 0 : Math.min(panel - 1.6, c.modulos * modulo)
    const codigoHtml = tipo === 'qr'
      ? `<div class="qrbox"><img class="qr" src="${c.url}"/><div class="qrtxt">${esc(texto)}</div></div>`
      : `<img class="bc" src="${c.url}" style="width:${anchoBarras.toFixed(2)}mm"/><div class="bctxt">${esc(texto)}</div>`
    const copias = Math.max(1, parseInt(it.copias) || 1)
    for (let i = 0; i < copias; i++) {
      etiquetas += `<div class="etq">
  <div class="panel izq">${op.variante ? `<div class="var">${esc(op.variante)}</div>` : ''}${marca ? `<div class="marca">${esc(marca)}</div>` : ''}<div class="precio">${precio}</div><div class="sku">${esc(it.sku || '')}</div></div>
  <div class="panel der">${codigoHtml}</div>
</div>`
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas joyería</title><style>
    @page { size: ${ancho}mm ${alto}mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${ancho}mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; -webkit-print-color-adjust: exact; }
    .etq { position: relative; width: ${ancho}mm; height: ${alto}mm; overflow: hidden; page-break-after: always; break-after: page; }
    .panel { position: absolute; top: 0; height: ${alto}mm; width: ${panel}mm; padding: 0.7mm 0.8mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; overflow: hidden; }
    .izq { left: 0; }
    .der { left: ${panel + cuello}mm; }
    .marca { font-size: 4.6pt; font-weight: 700; letter-spacing: .3px; text-transform: uppercase; line-height: 1; }
    .precio { font-size: 9.5pt; font-weight: 800; line-height: 1.05; margin: 0.4mm 0; }
    .sku { font-size: 5.2pt; font-weight: 700; line-height: 1; letter-spacing: .2px; }
    .var { position: absolute; left: 0.5mm; top: 0.4mm; font-size: 4pt; color: #000; }
    .bc { display: block; height: 7.2mm; }
    .bctxt { font-size: 4.6pt; font-weight: 700; line-height: 1; margin-top: 0.5mm; letter-spacing: .3px; }
    .qrbox { display: flex; align-items: center; gap: 1mm; }
    .qr { width: 8.5mm; height: 8.5mm; display: block; }
    .qrtxt { font-size: 5pt; font-weight: 700; writing-mode: vertical-rl; transform: rotate(180deg); line-height: 1; }
    @media screen { body { background: #ddd; padding: 4mm; width: auto; } .etq { background: #fff; margin: 0 auto 3mm; box-shadow: 0 1px 3px rgba(0,0,0,.3); } .panel { outline: 0.2mm dashed #bbb; } }
  </style></head><body>${etiquetas}</body></html>`
}

// Hoja de PRUEBA: el mismo producto en 4 variantes para ver cuál lee mejor el lector de Andrea
// (203 dpi: cada módulo debe ser múltiplo de 0.125 mm; 300 dpi: de 0.0847 mm).
export async function generarHTMLPruebaJoyeria(item, empresa = {}) {
  const variantes = [
    { variante: '1', tipo: 'code128', codigo: 'sku', modulo: 0.25 },     // SKU, 2 puntos a 203 dpi
    { variante: '2', tipo: 'code128', codigo: 'barras', modulo: 0.25 },  // código de barras numérico (si lo tiene)
    { variante: '3', tipo: 'qr', codigo: 'sku' },                        // QR con el SKU (lector 2D)
    { variante: '4', tipo: 'code128', codigo: 'sku', modulo: 0.1875 },   // SKU más angosto (1.5 puntos: puede no leerse)
  ]
  let cuerpo = ''
  for (const v of variantes) {
    const html = await generarHTMLEtiquetaJoyeria([{ ...item, copias: 1 }], empresa, v)
    cuerpo += html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'))
  }
  const base = await generarHTMLEtiquetaJoyeria([{ ...item, copias: 1 }], empresa, {})
  return base.slice(0, base.indexOf('<body>') + 6) + cuerpo + '</body></html>'
}
