// Generación e impresión de etiquetas con código de barras (Code128).
// Pensado para productos que NO traen código de barras de fábrica.
// El lector lee Code128 sin problema; el número se imprime debajo de las rayitas.

// Genera un código de barras numérico ÚNICO de 12 dígitos.
// Prefijo '2' = rango reservado para uso interno / in-store (no choca con los de
// fábrica, que usan otros prefijos). 12 dígitos cumplen el mínimo del auto-agregado.
export function generarCodigoBarras(existentes = []) {
  const usados = new Set((existentes || []).filter(Boolean).map(String))
  let codigo, intentos = 0
  do {
    codigo = '2' + String(Math.floor(Math.random() * 1e11)).padStart(11, '0')
    intentos++
  } while (usados.has(codigo) && intentos < 100)
  return codigo
}

// Renderiza un Code128 a dataURL PNG (en memoria, sin red — listo para imprimir).
export async function barrasDataURL(codigo) {
  const JsBarcode = (await import('jsbarcode')).default
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, String(codigo), {
    format: 'CODE128', width: 2, height: 45,
    displayValue: true, fontSize: 13, margin: 4, textMargin: 1,
  })
  return canvas.toDataURL('image/png')
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Construye el HTML imprimible de una hoja de etiquetas.
// items: [{ nombre, precio, codigo, copias }]
export async function generarHTMLEtiquetas(items, empresa = {}) {
  const cache = {}
  let celdas = ''
  for (const it of items) {
    const cod = String(it.codigo)
    if (!cache[cod]) cache[cod] = await barrasDataURL(cod)
    const url = cache[cod]
    const precio = (it.precio != null && it.precio !== '') ? `$${Number(it.precio).toFixed(2)}` : ''
    const copias = Math.max(1, parseInt(it.copias) || 1)
    for (let i = 0; i < copias; i++) {
      celdas += '<div class="lbl">'
        + (empresa?.empresaNombre ? `<div class="emp">${esc(empresa.empresaNombre)}</div>` : '')
        + `<div class="nom">${esc(it.nombre)}</div>`
        + `<img class="bc" src="${url}"/>`
        + (precio ? `<div class="precio">${precio}</div>` : '')
        + '</div>'
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
    @page { margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; }
    .grid { display: flex; flex-wrap: wrap; gap: 3mm; }
    .lbl { width: 48mm; border: 1px dashed #ccc; border-radius: 3px; padding: 2mm; text-align: center; page-break-inside: avoid; }
    .emp { font-size: 8px; color: #555; text-transform: uppercase; letter-spacing: .3px; }
    .nom { font-size: 10px; font-weight: 700; line-height: 1.1; height: 22px; overflow: hidden; margin: 1px 0; }
    .bc { max-width: 100%; height: auto; }
    .precio { font-size: 14px; font-weight: 800; margin-top: 1px; }
  </style></head><body><div class="grid">${celdas}</div></body></html>`
}
