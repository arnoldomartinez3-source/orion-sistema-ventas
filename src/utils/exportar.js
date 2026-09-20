// ══════════════════════════════════════════════════════════════
// Exportar a Excel (CSV) y a PDF (la ventana de impresión del navegador).
// Lo usan Asistencia y Planilla. Los CSV del portal del MH NO usan esto:
// Contadores arma los suyos sin BOM porque el portal no lo acepta.
// ══════════════════════════════════════════════════════════════
import { esc } from './html'
import { imprimirIframe } from './imprimir'

const BOM = '﻿'   // para que Excel respete tildes y la Ñ

// Una celda: comillas si trae ; " o salto de línea. Los números se dejan tal cual.
const celda = (v) => {
  const s = v == null ? '' : String(v)
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Descarga filas (array de arrays) como CSV que Excel abre bien. */
export function descargarExcel(nombreArchivo, filas) {
  const csv = filas.map(f => f.map(celda).join(';')).join('\r\n')
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: nombreArchivo })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30 * 1000)
}

/**
 * Abre la ventana de impresión con una hoja tamaño carta. Desde ahí se imprime
 * o se guarda como PDF ("Destino: Guardar como PDF").
 * @param {object} opciones { titulo, empresa, subtitulo, encabezados, filas, pie, resumen }
 *   resumen: [{ etiqueta, valor }] tarjetas arriba de la tabla.
 */
export function imprimirTabla(opciones) {
  imprimirIframe(htmlTabla(opciones))
}

/** El HTML de la hoja, separado para poder revisarlo sin abrir la impresión. */
export function htmlTabla({ titulo, empresa = '', subtitulo = '', encabezados = [], filas = [], resumen = [], pie = '', horizontal = false }) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>
  @page { size: letter ${horizontal ? 'landscape' : 'portrait'}; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #16213f; margin: 0; font-size: 12px; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  .sub { color: #555; font-size: 12px; margin-bottom: 4px; }
  .emp { font-size: 12px; font-weight: bold; color: #22345F; }
  .linea { border-bottom: 2px solid #22345F; margin: 8px 0 12px; }
  .resumen { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  .r-item { border: 1px solid #d7dbe6; border-radius: 8px; padding: 6px 12px; min-width: 110px; }
  .r-item b { display: block; font-size: 15px; }
  .r-item span { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #eef1f8; text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; padding: 6px 8px; border-bottom: 1px solid #c9cfdd; }
  td { padding: 5px 8px; border-bottom: 1px solid #eceef4; }
  tr:nth-child(even) td { background: #fafbfe; }
  .pie { margin-top: 14px; font-size: 10.5px; color: #666; }
  @media print { tr { break-inside: avoid; } thead { display: table-header-group; } }
</style></head><body>
  ${empresa ? `<div class="emp">${esc(empresa)}</div>` : ''}
  <h1>${esc(titulo)}</h1>
  ${subtitulo ? `<div class="sub">${esc(subtitulo)}</div>` : ''}
  <div class="linea"></div>
  ${resumen.length ? `<div class="resumen">${resumen.map(r => `<div class="r-item"><b>${esc(r.valor)}</b><span>${esc(r.etiqueta)}</span></div>`).join('')}</div>` : ''}
  <table>
    <thead><tr>${encabezados.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${filas.map(f => `<tr>${f.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
  ${pie ? `<div class="pie">${esc(pie)}</div>` : ''}
  <div class="pie">Generado por ORIÓN · ${new Date().toLocaleString('es-SV', { timeZone: 'America/El_Salvador' })}</div>
</body></html>`
}
