// ══════════════════════════════════════════════════════════════════
// GIFT CARDS — helpers compartidos (Punto de Venta y página Gift cards)
//
// Regla fiscal acordada con el contador de la joyería (2026-10-19):
//   • La VENTA de la gift card emite el DTE (es una venta normal en la caja,
//     con la línea "Gift card $X"). El dinero entra a la caja ese día.
//   • El CANJE no emite DTE: solo entrega mercadería y descarga inventario,
//     aunque sea parcial. Si la compra supera el saldo, la diferencia se cobra
//     como una venta normal con su DTE ("Diferencia canje gift card").
// ══════════════════════════════════════════════════════════════════
import { crearIframeImpresion } from './html'

// Sin 0/O/1/I para que se lea y se dicte sin error
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const grupo = () => Array.from({ length: 4 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join('')
export const generarCodigoGift = () => `GC-${grupo()}-${grupo()}`

const fmt = (n) => '$' + (Number(n) || 0).toFixed(2)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Ticket de 80 mm con el código de la tarjeta (se entrega al cliente)
export function imprimirGiftCard(t, nombreEmpresa = '') {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: 80mm auto; margin: 4mm } body { font-family: Arial, sans-serif; width: 72mm; margin: 0; text-align: center; color: #111 }
    .emp { font-weight: 700; font-size: 13px } .t { font-size: 11px; letter-spacing: 2px; margin: 8px 0 4px } .cod { font-family: Consolas, monospace; font-size: 22px; font-weight: 900; letter-spacing: 2px; margin: 6px 0 }
    .m { font-size: 26px; font-weight: 900; margin: 4px 0 } .s { font-size: 10px; color: #444; margin-top: 6px } .l { border-top: 1px dashed #999; margin: 8px 0 }
  </style></head><body>
    <div class="emp">${esc(nombreEmpresa || 'ORIÓN')}</div>
    <div class="t">GIFT CARD</div>
    <div class="m">${fmt(t.monto)}</div>
    <div class="cod">${esc(t.codigo)}</div>
    ${t.para ? `<div class="s">Para: ${esc(t.para)}</div>` : ''}
    ${t.numeroDte ? `<div class="s">Comprobante: ${esc(t.numeroDte)}</div>` : ''}
    <div class="l"></div>
    <div class="s">Presentá este código al pagar en cualquiera de nuestras tiendas.<br>Consultá tu saldo en caja. No se cambia por efectivo.</div>
    <div class="s">${new Date().toLocaleDateString('es-SV')}</div>
  </body></html>`
  const iframe = crearIframeImpresion()
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'
  document.body.appendChild(iframe)
  iframe.contentDocument.open(); iframe.contentDocument.write(html); iframe.contentDocument.close()
  iframe.onload = () => setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 2000) }, 600)
}
