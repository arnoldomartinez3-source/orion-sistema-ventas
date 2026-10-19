// ══════════════════════════════════════════════════════════════════
// GIFT CARDS — helpers compartidos (Punto de Venta, página Gift cards, modal de tarjeta)
//
// Regla fiscal acordada con el contador de la joyería (2026-10-19):
//   • La VENTA de la gift card emite el DTE (es una venta normal en la caja,
//     con la línea "Gift card $X"). El dinero entra a la caja ese día.
//   • El CANJE no emite DTE: solo entrega mercadería y descarga inventario,
//     aunque sea parcial. Si la compra supera el saldo, la diferencia se cobra
//     como una venta normal con su DTE ("Diferencia canje gift card").
//
// Etapa 2: vencimiento configurable (configuracion.giftVigenciaMeses, 0 = nunca),
// ticket con logo + QR, tarjeta digital (imagen PNG para WhatsApp) con estilos y
// código preimpreso (tarjeta física que ya trae su código: ORIÓN solo la activa).
// ══════════════════════════════════════════════════════════════════
import { crearIframeImpresion } from './html'
import { orionAlert, orionConfirm } from '../orionDialog'

// Sin 0/O/1/I para que se lea y se dicte sin error
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const grupo = () => Array.from({ length: 4 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join('')
export const generarCodigoGift = () => `GC-${grupo()}-${grupo()}`

// Código de una tarjeta física preimpresa: letras, números y guiones (4 a 24). Devuelve '' si no sirve.
export const normalizarCodigoPreimpreso = (s) => {
  const c = String(s || '').trim().toUpperCase().replace(/\s+/g, '')
  return /^[A-Z0-9-]{4,24}$/.test(c) ? c : ''
}

// El doc de la tarjeta usa un id determinístico (empresa + código) para que una transacción
// pueda garantizar que el código no exista ya (tx.get del mismo id).
export const idGift = (empresaId, codigo) => `${empresaId}_${codigo}`

// ── Vencimiento ──
export const calcularVencimiento = (meses) => {
  const m = parseInt(meses)
  if (!(m > 0)) return null
  const d = new Date()
  d.setMonth(d.getMonth() + m)
  d.setHours(23, 59, 59, 999)
  return d
}
export const fechaVence = (t) => t?.venceEl?.toDate?.() || (t?.venceEl ? new Date(t.venceEl) : null)
export const estaVencida = (t) => { const f = fechaVence(t); return !!f && f.getTime() < Date.now() }
// 'activa' | 'vencida' | 'agotada' | 'anulada' (vencida = activa con saldo pero fuera de fecha)
export const estadoVisible = (t) => (t?.estado === 'activa' && estaVencida(t) ? 'vencida' : t?.estado || 'activa')
export const textoVence = (t) => { const f = fechaVence(t); return f ? f.toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '' }

// ── Estilos de la tarjeta digital ──
export const ESTILOS = {
  oro:   { nombre: 'Azul y oro',  fondo: ['#14213D', '#243B6B'], acento: '#D4B46A', texto: '#FFFFFF', suave: 'rgba(255,255,255,.72)' },
  noche: { nombre: 'Noche',       fondo: ['#0B1220', '#1F2544'], acento: '#9DB4FF', texto: '#FFFFFF', suave: 'rgba(255,255,255,.70)' },
  rosa:  { nombre: 'Rosa',        fondo: ['#F7E6EA', '#E8BFCB'], acento: '#B0426B', texto: '#4A1C2C', suave: 'rgba(74,28,44,.70)' },
  verde: { nombre: 'Verde y oro', fondo: ['#16381B', '#1F4D2B'], acento: '#CFAE57', texto: '#F4E3CF', suave: 'rgba(244,227,207,.75)', salpicaduras: true },
}
const hexRgba = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return `rgba(255,255,255,${a})`; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})` }
const hexOk = (h, def) => (/^#[0-9a-f]{6}$/i.test(String(h || '')) ? h : def)

// Estilos que puede usar una empresa: los 4 de ORIÓN + "Mis colores" (giftColores) + "Mi diseño" (giftFondoUrl, imagen de fondo propia)
export function estilosDisponibles(empresa = {}) {
  const e = { ...ESTILOS }
  const c = empresa?.giftColores
  if (c && (c.fondo1 || c.acento)) {
    const texto = hexOk(c.texto, '#FFFFFF')
    e.propio = { nombre: 'Mis colores', fondo: [hexOk(c.fondo1, '#14213D'), hexOk(c.fondo2, hexOk(c.fondo1, '#14213D'))], acento: hexOk(c.acento, '#D4B46A'), texto, suave: hexRgba(texto, 0.72) }
  }
  if (empresa?.giftFondoUrl) {
    const texto = hexOk(c?.texto, '#FFFFFF')
    e.fondo = { nombre: 'Mi diseño', fondoUrl: empresa.giftFondoUrl, fondo: [hexOk(c?.fondo1, '#14213D'), hexOk(c?.fondo2, hexOk(c?.fondo1, '#14213D'))], acento: hexOk(c?.acento, '#D4B46A'), texto, suave: hexRgba(texto, 0.72) }
  }
  return e
}
// Estilo a usar: el pedido si existe; si no, el de la empresa; si tiene fondo propio y no eligió otro, su diseño
export const estiloDe = (k, empresa) => {
  const e = estilosDisponibles(empresa)
  if (k && e[k]) return k
  if (empresa?.giftEstilo && e[empresa.giftEstilo]) return empresa.giftEstilo
  return e.fondo ? 'fondo' : 'oro'
}

const fmt = (n) => '$' + (Number(n) || 0).toFixed(2)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const nombreDe = (empresa) => (typeof empresa === 'string' ? empresa : (empresa?.nombreComercial || empresa?.empresaNombre || '')) || 'ORIÓN'

const qrDataUrl = async (texto, color = '#14213D') => {
  const QRCode = (await import('qrcode')).default
  return QRCode.toDataURL(texto, { width: 300, margin: 1, color: { dark: color, light: '#FFFFFF' } })
}
const cargarImagen = (src) => new Promise(resolve => {
  if (!src) return resolve(null)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null)
  img.src = src
})

// ── Ticket de 80 mm (tiketera): logo, monto, QR + código, vigencia y mensaje ──
export async function imprimirGiftCard(t, empresa = '') {
  const nombre = nombreDe(empresa)
  const logo = typeof empresa === 'object' ? empresa?.logoUrl : ''
  const mensaje = (typeof empresa === 'object' && empresa?.giftMensaje) || ''
  const vence = textoVence(t)
  let qr = ''
  try { qr = await qrDataUrl(t.codigo) } catch { /* sin QR */ }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: 80mm auto; margin: 4mm } body { font-family: Arial, sans-serif; width: 72mm; margin: 0; text-align: center; color: #111 }
    .logo { max-width: 40mm; max-height: 18mm; margin: 0 auto 4px; display: block }
    .emp { font-weight: 700; font-size: 13px } .t { font-size: 11px; letter-spacing: 3px; margin: 8px 0 2px; font-weight: 700 }
    .m { font-size: 30px; font-weight: 900; margin: 2px 0 6px } .qr { width: 32mm; height: 32mm; display: block; margin: 0 auto }
    .cod { font-family: Consolas, monospace; font-size: 20px; font-weight: 900; letter-spacing: 2px; margin: 4px 0 }
    .s { font-size: 10px; color: #444; margin-top: 5px } .msg { font-size: 11px; font-style: italic; margin-top: 6px } .l { border-top: 1px dashed #999; margin: 8px 0 }
  </style></head><body>
    ${logo ? `<img class="logo" src="${esc(logo)}" onerror="this.style.display='none'">` : ''}
    <div class="emp">${esc(nombre)}</div>
    <div class="t">GIFT CARD</div>
    <div class="m">${fmt(t.monto)}</div>
    ${t.para ? `<div class="s" style="font-size:12px">Para: <b>${esc(t.para)}</b></div>` : ''}
    ${t.de ? `<div class="s" style="font-size:12px">De: <b>${esc(t.de)}</b></div>` : ''}
    ${mensaje ? `<div class="msg">${esc(mensaje)}</div>` : ''}
    <div class="l"></div>
    ${qr ? `<img class="qr" src="${qr}">` : ''}
    <div class="cod">${esc(t.codigo)}</div>
    ${vence ? `<div class="s">Válida hasta el ${vence}</div>` : ''}
    ${t.numeroDte ? `<div class="s">Comprobante: ${esc(t.numeroDte)}</div>` : ''}
    <div class="l"></div>
    <div class="s">Presentá este código (o el QR) al pagar en cualquiera de nuestras tiendas.<br>Consultá tu saldo en caja. No se cambia por efectivo.</div>
    <div class="s">${new Date().toLocaleDateString('es-SV')}</div>
  </body></html>`
  const iframe = crearIframeImpresion()
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'
  document.body.appendChild(iframe)
  iframe.contentDocument.open(); iframe.contentDocument.write(html); iframe.contentDocument.close()
  iframe.onload = () => setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 2000) }, 900)
}

// ── Etiqueta de 50×30 mm (impresora de etiquetas): se pega dentro de la tarjeta física ──
export async function imprimirEtiquetaGift(t, empresa = '') {
  const nombre = nombreDe(empresa)
  const vence = textoVence(t)
  let qr = ''
  try { qr = await qrDataUrl(t.codigo) } catch { /* sin QR */ }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: 50mm 30mm; margin: 0 } html, body { margin: 0; padding: 0 }
    body { width: 50mm; height: 30mm; font-family: Arial, sans-serif; color: #111; display: flex; align-items: center; gap: 1.5mm; padding: 1.5mm 2mm; box-sizing: border-box; overflow: hidden }
    .qr { width: 20mm; height: 20mm; flex: none } .d { flex: 1; min-width: 0; line-height: 1.15 }
    .emp { font-size: 6pt; font-weight: 700; letter-spacing: .3px; line-height: 1.1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
    .m { font-size: 13pt; font-weight: 900; margin: .3mm 0 } .cod { font-family: Consolas, monospace; font-size: 8.5pt; font-weight: 900; letter-spacing: .5px; white-space: nowrap }
    .s { font-size: 5.5pt; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  </style></head><body>
    ${qr ? `<img class="qr" src="${qr}">` : ''}
    <div class="d">
      <div class="emp">GIFT CARD · ${esc(nombre.toUpperCase())}</div>
      <div class="m">${fmt(t.monto)}</div>
      <div class="cod">${esc(t.codigo)}</div>
      ${t.para ? `<div class="s">Para: ${esc(t.para)}${t.de ? ' · De: ' + esc(t.de) : ''}</div>` : (t.de ? `<div class="s">De: ${esc(t.de)}</div>` : '')}
      ${vence ? `<div class="s">Válida hasta el ${vence}</div>` : ''}
    </div>
  </body></html>`
  const iframe = crearIframeImpresion()
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'
  document.body.appendChild(iframe)
  iframe.contentDocument.open(); iframe.contentDocument.write(html); iframe.contentDocument.close()
  iframe.onload = () => setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 2000) }, 900)
}

// ── Etiquetas de un LOTE (tarjetas sin vender): una etiqueta de 50×30 mm por página, seguidas ──
export async function imprimirEtiquetasLote(tarjetas, empresa = '') {
  const nombre = nombreDe(empresa)
  const meses = parseInt(typeof empresa === 'object' ? empresa?.giftVigenciaMeses ?? 12 : 12) || 0
  const qrs = await Promise.all(tarjetas.map(t => qrDataUrl(t.codigo).catch(() => '')))
  const paginas = tarjetas.map((t, i) => `<div class="et">
      ${qrs[i] ? `<img class="qr" src="${qrs[i]}">` : ''}
      <div class="d">
        <div class="emp">GIFT CARD · ${esc(nombre.toUpperCase())}</div>
        <div class="m">${Number(t.monto) > 0 ? fmt(t.monto) : 'Monto: $________'}</div>
        <div class="cod">${esc(t.codigo)}</div>
        <div class="s">${meses > 0 ? 'Vigencia: ' + meses + ' meses' : 'Sin vencimiento'}</div>
      </div>
    </div>`).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: 50mm 30mm; margin: 0 } html, body { margin: 0; padding: 0 }
    .et { width: 50mm; height: 30mm; font-family: Arial, sans-serif; color: #111; display: flex; align-items: center; gap: 1.5mm; padding: 1.5mm 2mm; box-sizing: border-box; overflow: hidden; page-break-after: always }
    .qr { width: 20mm; height: 20mm; flex: none } .d { flex: 1; min-width: 0; line-height: 1.15 }
    .emp { font-size: 6pt; font-weight: 700; letter-spacing: .3px; line-height: 1.1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
    .m { font-size: 13pt; font-weight: 900; margin: .3mm 0; white-space: nowrap } .cod { font-family: Consolas, monospace; font-size: 8.5pt; font-weight: 900; letter-spacing: .5px; white-space: nowrap }
    .s { font-size: 5.5pt; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  </style></head><body>${paginas}</body></html>`
  const iframe = crearIframeImpresion()
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'
  document.body.appendChild(iframe)
  iframe.contentDocument.open(); iframe.contentDocument.write(html); iframe.contentDocument.close()
  iframe.onload = () => setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 4000) }, 1200)
}

// ── Tarjeta digital: imagen PNG 1200×720 (para WhatsApp / descargar) ──
const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath() }
const recortar = (ctx, texto, max) => { let s = String(texto || ''); while (s.length > 1 && ctx.measureText(s).width > max) s = s.slice(0, -1); return s.length < String(texto || '').length ? s.replace(/\s*$/, '') + '…' : s }

export async function generarImagenGiftCard(t, empresa = {}, estiloKey) {
  const e = estilosDisponibles(empresa)[estiloDe(estiloKey, empresa)]
  const W = 1200, H = 720
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')
  // Fondo con degradado + arcos decorativos
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, e.fondo[0]); g.addColorStop(1, e.fondo[1])
  rr(ctx, 0, 0, W, H, 44); ctx.fillStyle = g; ctx.fill()
  const fondoImg = e.fondoUrl ? await cargarImagen(e.fondoUrl) : null
  if (fondoImg) {
    // Imagen del cliente (1200×720 recomendado): se ajusta tipo "cover" y se recorta con las esquinas redondeadas
    ctx.save(); rr(ctx, 0, 0, W, H, 44); ctx.clip()
    const esc_ = Math.max(W / fondoImg.width, H / fondoImg.height), fw = fondoImg.width * esc_, fh = fondoImg.height * esc_
    ctx.drawImage(fondoImg, (W - fw) / 2, (H - fh) / 2, fw, fh)
    ctx.restore()
  }
  ctx.save(); rr(ctx, 0, 0, W, H, 44); ctx.clip()
  if (!fondoImg) { // con fondo propio no se dibujan los adornos de ORIÓN
    ctx.globalAlpha = 0.10; ctx.strokeStyle = e.acento; ctx.lineWidth = 90
    ctx.beginPath(); ctx.arc(W - 120, 120, 420, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(W - 120, 120, 260, 0, Math.PI * 2); ctx.stroke()
    ctx.globalAlpha = 0.07; ctx.fillStyle = e.acento
    ctx.beginPath(); ctx.arc(140, H - 60, 260, 0, Math.PI * 2); ctx.fill()
  }
  if (e.salpicaduras && !fondoImg) {
    // Salpicaduras doradas en dos esquinas (como las tarjetas impresas); deterministas por código
    let semilla = [...String(t.codigo || '')].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7)
    const rnd = () => { semilla = (semilla * 1103515245 + 12345) >>> 0; return (semilla >>> 8) / 16777216 }
    ctx.fillStyle = e.acento
    for (let i = 0; i < 70; i++) {
      const esq = i % 2 === 0
      const x = esq ? rnd() * 380 : W - rnd() * 380, y = esq ? rnd() * 150 : H - rnd() * 150
      ctx.globalAlpha = 0.35 + rnd() * 0.55
      ctx.beginPath(); ctx.arc(x, y, 1.5 + rnd() * rnd() * 11, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
  }
  ctx.restore()
  // Línea de acento arriba
  if (!fondoImg) { ctx.fillStyle = e.acento; rr(ctx, 70, 64, 90, 6, 3); ctx.fill() }

  // Logo o nombre de la empresa
  const logo = fondoImg ? null : await cargarImagen(empresa?.logoUrl)
  const nombre = nombreDe(empresa)
  ctx.fillStyle = e.texto; ctx.textBaseline = 'top'
  if (fondoImg) { /* el logo y el nombre ya vienen en el diseño del cliente */ } else if (logo) {
    const h = 72, w = Math.min(320, logo.width * (h / logo.height))
    ctx.drawImage(logo, 70, 90, w, h)
  } else {
    ctx.font = '700 40px Georgia, "Times New Roman", serif'
    ctx.fillText(recortar(ctx, nombre.toUpperCase(), 760), 70, 96)
  }
  // Etiqueta GIFT CARD
  if (!fondoImg) { ctx.textAlign = 'right'; ctx.fillStyle = e.acento; ctx.font = '800 26px Arial, sans-serif'; ctx.letterSpacing = '8px'; ctx.fillText('GIFT CARD', W - 70, 100); ctx.letterSpacing = '0px'; ctx.textAlign = 'left' }

  // Monto
  ctx.fillStyle = e.texto; ctx.font = '900 150px Arial, sans-serif'
  ctx.fillText(fmt(t.monto), 64, 230)
  // Para / mensaje
  let y = 400
  if (t.para) { ctx.fillStyle = e.suave; ctx.font = '400 30px Arial, sans-serif'; ctx.fillText('Para', 70, y); ctx.fillStyle = e.texto; ctx.font = '700 44px Georgia, serif'; ctx.fillText(recortar(ctx, t.para + (t.de ? '' : ''), 700), 70, y + 36); y += 96 }
  if (t.de) { ctx.fillStyle = e.suave; ctx.font = '400 28px Arial, sans-serif'; ctx.fillText('De ', 70, y); const wDe = ctx.measureText('De ').width; ctx.fillStyle = e.texto; ctx.font = '700 32px Georgia, serif'; ctx.fillText(recortar(ctx, t.de, 640), 70 + wDe, y - 2); y += 50 }
  const mensaje = empresa?.giftMensaje || ''
  if (mensaje) { ctx.fillStyle = e.suave; ctx.font = 'italic 400 30px Georgia, serif'; ctx.fillText(recortar(ctx, mensaje, 720), 70, y) }

  // Código + vigencia abajo a la izquierda
  ctx.fillStyle = e.acento; ctx.font = '800 20px Arial, sans-serif'; ctx.letterSpacing = '4px'; ctx.fillText('CÓDIGO', 70, H - 150); ctx.letterSpacing = '0px'
  ctx.fillStyle = e.texto; ctx.font = '900 56px Consolas, "Courier New", monospace'; ctx.letterSpacing = '3px'; ctx.fillText(t.codigo, 70, H - 122); ctx.letterSpacing = '0px'
  const vence = textoVence(t)
  ctx.fillStyle = e.suave; ctx.font = '400 24px Arial, sans-serif'
  ctx.fillText(vence ? `Válida hasta el ${vence} · Canjeable en tienda · No se cambia por efectivo` : 'Canjeable en tienda · No se cambia por efectivo', 70, H - 52)

  // QR abajo a la derecha, sobre fondo blanco
  try {
    const qr = await cargarImagen(await qrDataUrl(t.codigo, '#14213D'))
    if (qr) { rr(ctx, W - 70 - 210, H - 70 - 210, 210, 210, 18); ctx.fillStyle = '#fff'; ctx.fill(); ctx.drawImage(qr, W - 70 - 196, H - 70 - 196, 182, 182) }
  } catch { /* sin QR */ }

  return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo generar la imagen')), 'image/png'))
}

// Plantilla guía para el diseñador del cliente: marca las zonas que ORIÓN escribe encima del fondo propio
export async function descargarPlantillaGuia() {
  const W = 1200, H = 720
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#F2F2F2'; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#FFFFFF'; rr(ctx, 0, 0, W, H, 44); ctx.fill()
  ctx.strokeStyle = '#9AA3B2'; ctx.lineWidth = 3; ctx.setLineDash([12, 8]); rr(ctx, 1.5, 1.5, W - 3, H - 3, 44); ctx.stroke()
  const zona = (x, y, w, h, titulo, nota) => {
    ctx.setLineDash([10, 6]); ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h)
    ctx.fillStyle = 'rgba(192,57,43,.06)'; ctx.fillRect(x, y, w, h)
    ctx.setLineDash([]); ctx.fillStyle = '#C0392B'; ctx.textBaseline = 'top'; ctx.font = '800 22px Arial, sans-serif'; ctx.fillText(titulo, x + 12, y + 10)
    if (nota) { ctx.fillStyle = '#7A1F17'; ctx.font = '400 17px Arial, sans-serif'; ctx.fillText(nota, x + 12, y + 40) }
  }
  zona(60, 215, 720, 190, 'MONTO', 'Ej. $50.00 en letra grande')
  zona(60, 395, 720, 155, 'PARA / DE', 'Nombre de quien la recibe y de quien la regala')
  zona(60, H - 160, 640, 125, 'CÓDIGO Y VIGENCIA', 'GC-XXXX-XXXX y "Válida hasta el …"')
  zona(W - 290, H - 290, 230, 230, 'QR', '')
  ctx.fillStyle = '#334155'; ctx.font = '700 26px Arial, sans-serif'; ctx.textBaseline = 'top'
  ctx.fillText('Plantilla para el fondo de la gift card digital · 1200 × 720 px', 60, 60)
  ctx.font = '400 20px Arial, sans-serif'; ctx.fillStyle = '#475569'
  ctx.fillText('Diseñá libremente (logo, texto "Gift card", frase, adornos) pero dejá limpias las zonas rojas:', 60, 100)
  ctx.fillText('ahí ORIÓN escribe los datos de cada tarjeta. Exportá en PNG o JPG a 1200 × 720 px y subilo en Configuración.', 60, 128)
  ctx.font = '400 17px Arial, sans-serif'; ctx.fillStyle = '#64748B'
  ctx.fillText('Las esquinas se redondean al generar la tarjeta. El texto se escribe con el color "Texto" de "Mis colores".', 60, 172)
  const blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('No se pudo generar')), 'image/png'))
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: 'ORION-plantilla-gift-card-1200x720.png' })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000)
}

const nombreArchivo = (t) => `GiftCard-${t.codigo}.png`
export const textoGift = (t, empresa) => [
  `🎁 *Gift card de ${nombreDe(empresa)}*`,
  `Monto: *${fmt(t.monto)}*${t.para ? `\nPara: ${t.para}` : ''}${t.de ? `\nDe: ${t.de}` : ''}`,
  `Código: *${t.codigo}*`,
  textoVence(t) ? `Válida hasta el ${textoVence(t)}.` : '',
  'Presentá el código o el QR al pagar en cualquiera de nuestras tiendas.',
].filter(Boolean).join('\n')

export async function descargarGiftCard(t, empresa, estilo) {
  const blob = await generarImagenGiftCard(t, empresa, estilo)
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: nombreArchivo(t) })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000)
}

// Comparte la imagen por el menú "Compartir" del equipo (celular o Windows con WhatsApp);
// si no se puede, la descarga y abre WhatsApp con el texto para adjuntarla.
export async function compartirGiftCard(t, empresa, estilo, telefono = '') {
  const blob = await generarImagenGiftCard(t, empresa, estilo)
  const archivo = new File([blob], nombreArchivo(t), { type: 'image/png' })
  const texto = textoGift(t, empresa)
  if (navigator.canShare?.({ files: [archivo] })) {
    const compartir = () => navigator.share({ files: [archivo], text: texto, title: 'Gift card ' + t.codigo })
    try { await compartir(); return 'compartido' } catch (err) {
      if (err?.name === 'AbortError') return 'cancelado'
      if (err?.name === 'NotAllowedError') {
        const ok = await orionConfirm('La tarjeta está lista. Tocá Compartir y elegí WhatsApp.', { titulo: 'Compartir tarjeta', okLabel: 'Compartir', tipo: 'info' })
        if (!ok) return 'cancelado'
        try { await compartir(); return 'compartido' } catch (e2) { if (e2?.name === 'AbortError') return 'cancelado' }
      }
    }
  }
  const url = URL.createObjectURL(archivo)
  const a = Object.assign(document.createElement('a'), { href: url, download: nombreArchivo(t) })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000)
  const d = String(telefono || '').replace(/\D/g, '')
  const tel = d.length === 8 ? '503' + d : (d.length === 11 && d.startsWith('503') ? d : '')
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank')
  orionAlert(`Se descargó ${nombreArchivo(t)}. En WhatsApp tocá el clip 📎 y adjuntala desde Descargas.`, { titulo: 'Tarjeta descargada', tipo: 'info' })
  return 'descargado'
}
