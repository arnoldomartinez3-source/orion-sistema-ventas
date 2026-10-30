// Impresión DIRECTA en ZPL a una impresora Zebra por medio de "Zebra Browser Print" (programa gratuito de
// Zebra para Windows y Mac que escucha en localhost:9100 / :9101 y pasa lo que le mandamos a la impresora).
// Evita el driver y el cuadro de impresión de Chrome: con el driver, un trabajo de varias páginas avanzaba
// papel en blanco y dejaba la Zebra en error; en ZPL cada etiqueta es un bloque ^XA…^XZ y salen seguidas.
// Calibrado con la Zebra ZD421 (300 dpi) de PALMARIA el 2026-10-30 (ver instalador/zebra-zpl.ps1).

import { JOYERIA } from './etiquetaJoyeria'

// Corrimientos en mm para cuadrar la impresión con la etiqueta física; se guardan por equipo (cada Zebra es distinta).
export const AJUSTES_ZEBRA_DEFECTO = { arribaMm: 3, derechaMm: 4, panelIzqMm: 3, panelAbajoMm: 1, barrasAbajoMm: 1, oscuridad: 25, dpi: 300 }
const CLAVE = 'orion_zebra_ajustes'
export const leerAjustesZebra = () => { try { return { ...AJUSTES_ZEBRA_DEFECTO, ...JSON.parse(localStorage.getItem(CLAVE) || '{}') } } catch { return { ...AJUSTES_ZEBRA_DEFECTO } } }
export const guardarAjustesZebra = (a) => { try { localStorage.setItem(CLAVE, JSON.stringify(a)) } catch { /* sin almacenamiento */ } }

// ^ ~ y \ son caracteres de control del ZPL: no pueden ir dentro de un texto
const zplTexto = (s) => String(s ?? '').replace(/[\^~\\]/g, ' ')

// items: [{ precio (con IVA), sku, codigoBarras, copias }]
// op: { marca, tipo: 'code128' | 'qr', codigo: 'sku' | 'barras', ajustes }
export function generarZplJoyeria(items, op = {}) {
  const a = { ...AJUSTES_ZEBRA_DEFECTO, ...(op.ajustes || {}) }
  const dpi = Number(a.dpi) || 300
  const tipo = op.tipo || 'code128', fuente = op.codigo || 'sku'
  const mm = (v) => Math.round((Number(v) || 0) / 25.4 * dpi)
  const f = (v) => Math.round(v * dpi / 300) // medidas pensadas a 300 dpi
  const pw = mm(JOYERIA.ancho), ll = mm(JOYERIA.alto)
  const lt = -mm(a.arribaMm), dx = mm(a.derechaMm)
  const xi = Math.max(0, f(18) + dx - mm(a.panelIzqMm)) // panel izquierdo (marca / precio / SKU)
  const dy = mm(a.panelAbajoMm)                          // el panel izquierdo baja aparte del resto
  const xb = f(438) + dx                                 // panel derecho (código)
  const yb = f(18) + mm(a.barrasAbajoMm)
  const marca = zplTexto(op.marca || '').toUpperCase()
  let zpl = ''
  for (const it of items) {
    const texto = zplTexto(fuente === 'barras' ? (it.codigoBarras || it.sku) : (it.sku || it.codigoBarras)).trim()
    if (!texto) continue
    const precio = (it.precio != null && it.precio !== '') ? '$' + Number(it.precio).toFixed(2) : ''
    const derecho = tipo === 'qr'
      ? `^FO${xb},${yb}^BQN,2,${f(3)}^FDMA,${texto}^FS^FO${xb + f(72)},${yb + f(20)}^A0N,${f(22)},${f(22)}^FB${f(95)},2,0,L^FD${texto}^FS`
      : `^FO${xb},${yb}^BY2,2.5,${f(78)}^BCN,${f(78)},Y,N,N^FD${texto}^FS`
    const etiqueta = `^XA^PW${pw}^LL${ll}^LT${lt}^LH0,0^MD${Math.max(0, Math.min(30, Number(a.oscuridad) || 25))}^CI28` +
      (marca ? `^FO${xi},${f(14) + dy}^A0N,${f(22)},${f(22)}^FB${f(200)},1,0,C^FD${marca}^FS` : '') +
      `^FO${xi},${f(44) + dy}^A0N,${f(52)},${f(52)}^FB${f(200)},1,0,C^FD${precio}^FS` +
      `^FO${xi},${f(104) + dy}^A0N,${f(26)},${f(26)}^FB${f(200)},1,0,C^FD${zplTexto(it.sku || '')}^FS` +
      derecho + '^XZ'
    const copias = Math.max(1, parseInt(it.copias) || 1)
    for (let i = 0; i < copias; i++) zpl += etiqueta
  }
  return zpl
}

// ── Zebra Browser Print ──
// Primero http (Chrome permite localhost desde una página https) y luego https (puerto 9101 con el certificado
// que instala el propio Browser Print, necesario en Safari/Mac).
const BASES = ['http://localhost:9100', 'https://localhost:9101']
async function bp(ruta, opciones = {}) {
  let error
  for (const base of BASES) {
    try {
      const r = await fetch(base + ruta, { ...opciones, signal: AbortSignal.timeout(5000) })
      if (r.ok) return r
      error = new Error('Browser Print respondió ' + r.status)
    } catch (e) { error = e }
  }
  throw error || new Error('sin respuesta')
}
export class SinBrowserPrint extends Error { constructor(m) { super(m); this.name = 'SinBrowserPrint' } }

// Impresora predeterminada de Browser Print (la Zebra conectada por USB)
export async function impresoraZebra() {
  let r
  try { r = await bp('/default?type=printer') }
  catch { throw new SinBrowserPrint('No se encuentra Zebra Browser Print en este equipo.') }
  const texto = await r.text()
  let dev = null
  try { dev = JSON.parse(texto) } catch { dev = null }
  if (!dev || !dev.uid) throw new SinBrowserPrint('Browser Print está abierto pero no ve ninguna Zebra conectada.')
  return dev
}

// Manda el ZPL a la Zebra. Devuelve el nombre de la impresora.
export async function imprimirZpl(zpl) {
  if (!zpl) throw new Error('No hay etiquetas que imprimir')
  const dev = await impresoraZebra()
  try {
    await bp('/write', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ device: dev, data: zpl }) })
  } catch (e) { throw new Error('La Zebra no recibió la impresión: ' + (e.message || e)) }
  return dev.name || 'Zebra'
}

export const MENSAJE_INSTALAR_BROWSER_PRINT = 'Para imprimir directo en la Zebra hace falta el programa gratuito "Zebra Browser Print" (Windows o Mac): se descarga de zebra.com buscando "Browser Print", se instala y se deja abierto. La primera vez te pedirá permitir el acceso desde app.orionsv.net. Mientras tanto puedes usar "Imprimir por Chrome".'
