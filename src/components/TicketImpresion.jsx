import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../AuthContext'

const TIPOS_DTE = [
  { codigo: 'FE',  nombre: 'Factura Consumidor Final', color: '#00d4aa', icon: '🧾' },
  { codigo: 'CCF', nombre: 'Credito Fiscal',           color: '#4f8cff', icon: '🏢' },
]

const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`
const pIva = (precio) => precio * 1.13

// Imprime HTML usando iframe oculto — sin popups, sin problemas de Chrome
const imprimirConIframe = (html) => {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'
  document.body.appendChild(iframe)
  iframe.contentDocument.open()
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
      setTimeout(() => { document.body.removeChild(iframe) }, 2000)
    }, 800)
  }
}

export default function TicketImpresion({ ventaFinalizada, onNuevaVenta }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [empresa, setEmpresa] = useState({})

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'configuracion', user.uid)).then(snap => {
      if (snap.exists()) setEmpresa(snap.data())
    })
  }, [user])

  if (!ventaFinalizada) return null

  const v = ventaFinalizada
  const tipo = TIPOS_DTE.find(t => t.codigo === v.tipoDte) || TIPOS_DTE[0]
  const fecha = new Date().toLocaleDateString('es-SV')
  const hora = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })

  // ── TICKET TERMICO 80mm ──
  const imprimirTermico = () => {
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Courier New',monospace;width:72mm;font-size:14px;color:#000;padding:3mm;}
.c{text-align:center;}
.b{font-weight:bold;}
.sep{border-top:1px dashed #000;margin:5px 0;}
.row{display:flex;justify-content:space-between;margin:2px 0;font-size:11px;}
.empresa{font-size:14px;font-weight:900;text-align:center;}
.dte{border:1px solid #000;text-align:center;padding:3px;margin:4px 0;font-weight:700;font-size:11px;}
.total{font-size:18px;font-weight:900;text-align:center;margin:6px 0;}
.pie{font-size:12px;text-align:center;color:#555;}
@media print{@page{margin:2mm;size:80mm auto;}}
</style>
</head>
<body>
<div class="empresa">${empresa.empresaNombre || 'Mi Empresa'}</div>
${empresa.direccion ? `<div class="c" style="font-size:10px">${empresa.direccion}</div>` : ''}
<div class="c" style="font-size:10px">NIT:${empresa.nit || '---'} NRC:${empresa.nrc || '---'}</div>
${empresa.telefono ? `<div class="c" style="font-size:10px">Tel:${empresa.telefono}</div>` : ''}
<div class="sep"></div>
<div class="dte">${tipo.nombre}</div>
<div class="dte">${v.numeroDte}</div>
<div class="sep"></div>
<div class="row"><span>Fecha:</span><span>${fecha}</span></div>
<div class="row"><span>Hora:</span><span>${hora}</span></div>
<div class="row"><span>Cliente:</span><span>${v.cliente}</span></div>
${v.nit ? `<div class="row"><span>NIT:</span><span>${v.nit}</span></div>` : ''}
<div class="sep"></div>
<div class="b" style="font-size:13px">PRODUCTOS</div>
${v.carrito.map(c => `
<div class="row"><span style="flex:1;overflow:hidden">${c.nombre}</span><span>${fmt(pIva(c.precio)*c.qty)}</span></div>
<div style="font-size:10px;color:#444;padding-left:3px">${c.qty} x ${fmt(pIva(c.precio))}</div>
`).join('')}
<div class="sep"></div>
<div class="row"><span>Subtotal:</span><span>${fmt(v.subtotal)}</span></div>
<div class="row"><span>IVA 13%:</span><span>${fmt(v.ivaTotal)}</span></div>
<div class="sep"></div>
<div class="total">TOTAL: ${fmt(v.total)}</div>
<div class="sep"></div>
<div class="row b"><span>Pago:</span><span>${v.tipoPago === 'contado' ? 'CONTADO' : 'CREDITO'}</span></div>
${v.tipoPago === 'credito' ? `<div class="row"><span>Vence:</span><span>${v.fechaVencimiento}</span></div>` : ''}
<div class="sep"></div>
<div class="pie">Gracias por su compra!</div>
<div class="pie">${empresa.empresaNombre || 'ORION'}</div>
<div style="margin-top:8mm"></div>
</body>
</html>`
    imprimirConIframe(html)
  }

  // ── COMPROBANTE PDF CARTA ──
  const imprimirPDF = () => {
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;font-size:13px;}
.page{max-width:700px;margin:0 auto;padding:36px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:18px;border-bottom:3px solid #1B2E6B;}
.emp h1{font-size:20px;font-weight:900;color:#1B2E6B;}
.emp p{font-size:11px;color:#6b7280;margin-top:2px;}
.doc{text-align:right;}
.doc-tipo{font-size:10px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;}
.doc-num{font-size:24px;font-weight:900;color:#1B2E6B;}
.doc-badge{display:inline-block;padding:3px 12px;border-radius:99px;font-size:11px;font-weight:700;background:rgba(27,46,107,0.1);color:#1B2E6B;border:1px solid rgba(27,46,107,0.2);margin-top:4px;}
.info-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px;}
.box{background:#f8faff;border-radius:10px;padding:14px;border:1px solid #e5eaf5;}
.box h3{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:6px;font-weight:700;}
.box p{font-size:13px;line-height:1.5;}
table{width:100%;border-collapse:collapse;margin-bottom:18px;border-radius:10px;overflow:hidden;}
thead{background:#1B2E6B;color:#fff;}
th{padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;font-weight:700;}
th:last-child,td:last-child{text-align:right;}
td{padding:10px 14px;border-bottom:1px solid #f0f4ff;font-size:13px;}
tr:last-child td{border-bottom:none;}
tr:nth-child(even) td{background:#fafbff;}
.tots{display:flex;justify-content:flex-end;margin-bottom:20px;}
.tots-box{min-width:220px;}
.trow{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f4ff;font-size:13px;color:#6b7280;}
.trow.fin{border-bottom:none;padding:10px 0 0;font-size:18px;font-weight:900;color:#1B2E6B;}
.firmas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:24px 0 16px;}
.firma{border-top:1.5px solid #1B2E6B;padding-top:6px;margin-top:36px;font-size:11px;color:#6b7280;text-align:center;}
.footer{text-align:center;padding-top:12px;border-top:1px solid #e5eaf5;font-size:11px;color:#9ca3af;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{margin:15mm;}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="emp">
      ${empresa.logoUrl ? `<img src="${empresa.logoUrl}" style="max-height:50px;max-width:160px;object-fit:contain;margin-bottom:6px;display:block;" onerror="this.style.display='none'"/>` : ''}
      <h1>${empresa.empresaNombre || 'Mi Empresa'}</h1>
      <p>${empresa.direccion || ''}</p>
      <p>NIT: ${empresa.nit || '---'} | NRC: ${empresa.nrc || '---'}</p>
      ${empresa.telefono ? `<p>Tel: ${empresa.telefono}</p>` : ''}
    </div>
    <div class="doc">
      <div class="doc-tipo">Comprobante de Venta</div>
      <div class="doc-num">${v.numeroDte}</div>
      <div class="doc-badge">${tipo.nombre}</div>
      <p style="font-size:11px;color:#9ca3af;margin-top:6px">${fecha} - ${hora}</p>
    </div>
  </div>
  <div class="info-row">
    <div class="box">
      <h3>Cliente</h3>
      <p style="font-weight:700;font-size:15px;color:#1B2E6B">${v.cliente}</p>
      ${v.nit ? `<p>NIT: <strong>${v.nit}</strong></p>` : ''}
      ${v.nrc ? `<p>NRC: <strong>${v.nrc}</strong></p>` : ''}
    </div>
    <div class="box">
      <h3>Pago</h3>
      <p>Forma: <strong>${v.tipoPago === 'contado' ? 'Contado' : 'Credito'}</strong></p>
      ${v.tipoPago === 'credito' ? `<p>Vence: <strong style="color:#c00">${v.fechaVencimiento}</strong></p>` : ''}
    </div>
  </div>
  <table>
    <thead>
      <tr><th>#</th><th>Producto</th><th style="text-align:center">Cant</th><th style="text-align:right">Precio</th><th style="text-align:right">Total</th></tr>
    </thead>
    <tbody>
      ${v.carrito.map((c, i) => `
        <tr>
          <td style="color:#9ca3af;font-size:11px">${i+1}</td>
          <td style="font-weight:600">${c.nombre}</td>
          <td style="text-align:center">${c.qty}</td>
          <td style="text-align:right">${fmt(pIva(c.precio))}</td>
          <td style="text-align:right;font-weight:700">${fmt(pIva(c.precio)*c.qty)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="tots">
    <div class="tots-box">
      <div class="trow"><span>Subtotal</span><span>${fmt(v.subtotal)}</span></div>
      <div class="trow"><span>IVA 13%</span><span>${fmt(v.ivaTotal)}</span></div>
      <div class="trow fin"><span>TOTAL</span><span>${fmt(v.total)}</span></div>
    </div>
  </div>
  <div class="firmas">
    <div class="firma">Firma / ${v.cliente}</div>
    <div class="firma">Autorizado / ${empresa.empresaNombre || ''}</div>
  </div>
  <div class="footer">
    <p>Comprobante valido de transaccion. Conserve para sus registros.</p>
    <p style="margin-top:4px">ORION - ${empresa.empresaNombre || 'Mi Empresa'} - ONE GEO SYSTEMS</p>
  </div>
</div>
</body>
</html>`
    imprimirConIframe(html)
  }

  return (
    <>
      <style>{`
        .tpro{background:var(--surface);border:1.5px solid var(--border);border-radius:20px;padding:32px;text-align:center;box-shadow:0 8px 30px var(--shadow2);}
        .tcheck{font-size:60px;margin-bottom:14px;}
        .ttitle{font-size:24px;font-weight:800;letter-spacing:-0.5px;margin-bottom:6px;}
        .tbadge{display:inline-flex;align-items:center;gap:6px;padding:6px 18px;border-radius:99px;font-size:14px;font-weight:700;margin-bottom:20px;font-family:var(--mono);}
        .tdet{text-align:left;background:var(--surface2);border-radius:14px;padding:18px;margin-bottom:18px;border:1px solid var(--border);}
        .titem{display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px;gap:12px;}
        .tdiv{border:none;border-top:1px solid var(--border);margin:12px 0;}
        .trow{display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px;}
        .trow.fin{font-size:20px;font-weight:800;margin-top:10px;}
        .badges{display:flex;gap:10px;margin-bottom:18px;}
        .badge{flex:1;border-radius:12px;padding:12px;font-size:13px;text-align:center;}
        .psec{background:var(--surface2);border:1.5px solid var(--border);border-radius:14px;padding:16px;margin-bottom:14px;}
        .psec-lbl{font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.8px;text-transform:uppercase;margin-bottom:10px;}
        .pgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
        .pbtn{padding:14px 10px;border-radius:14px;border:none;cursor:pointer;font-size:13px;font-weight:700;transition:all 0.2s;}
        .pbtn:hover{transform:translateY(-2px);}
        .pbtn .sub{font-size:11px;font-weight:400;opacity:0.75;display:block;margin-top:3px;}
        .pbtn-t{background:linear-gradient(135deg,#1B2E6B,#2E5FA3);color:white;box-shadow:0 4px 14px rgba(27,46,107,0.35);}
        .pbtn-p{background:var(--surface);color:var(--text);border:1.5px solid var(--border2);}
        .pbtn-p:hover{border-color:var(--accent);color:var(--accent);}
        .bnv{width:100%;background:linear-gradient(135deg,var(--accent),var(--accent-dark));color:#fff;border:none;border-radius:14px;padding:15px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:10px;transition:all 0.2s;}
        .bnv:hover{transform:translateY(-2px);}
        .bvf{width:100%;background:var(--surface2);color:var(--text2);border:1.5px solid var(--border);border-radius:12px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;}
        .bvf:hover{border-color:var(--accent);color:var(--accent);}
      `}</style>

      <div style={{ maxWidth: 560, margin: '24px auto' }}>
        <div className="tpro">

          <div className="tcheck">{v.tipoPago === 'credito' ? '📋' : '✅'}</div>
          <div className="ttitle">{v.tipoPago === 'credito' ? '¡Credito Registrado!' : '¡Venta Completada!'}</div>
          <div className="tbadge" style={{ background: tipo.color + '15', color: tipo.color, border: `1.5px solid ${tipo.color}30` }}>
            {tipo.icon} {v.numeroDte} — {tipo.nombre}
          </div>

          {v.tipoPago === 'credito' && (
            <div style={{ background: 'rgba(245,158,11,0.1)', border: '1.5px solid rgba(245,158,11,0.25)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, textAlign: 'left' }}>
              📅 <strong style={{ color: '#f59e0b' }}>Vence:</strong> {v.fechaVencimiento}
            </div>
          )}

          <div className="tdet">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text2)', display: 'flex', justifyContent: 'space-between' }}>
              <span>👤 {v.cliente}</span>
              {v.nit && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>NIT: {v.nit}</span>}
            </div>
            {v.carrito.map(c => (
              <div key={c.id} className="titem">
                <span style={{ color: 'var(--text2)', flex: 1 }}>{c.qty}x {c.nombre}</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(pIva(c.precio) * c.qty)}</span>
              </div>
            ))}
            <hr className="tdiv"/>
            <div className="trow"><span style={{ color: 'var(--muted)' }}>Subtotal</span><span>{fmt(v.subtotal)}</span></div>
            <div className="trow"><span style={{ color: 'var(--muted)' }}>IVA 13%</span><span>{fmt(v.ivaTotal)}</span></div>
            <div className="trow fin">
              <span>TOTAL</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(v.total)}</span>
            </div>
          </div>

          <div className="badges">
            <div className="badge" style={{ background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.2)' }}>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Guardado en</div>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>🔥 Firebase</div>
            </div>
            <div className="badge" style={{ background: 'rgba(79,140,255,0.08)', border: '1px solid rgba(79,140,255,0.2)' }}>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Stock actualizado</div>
              <div style={{ fontWeight: 700, color: 'var(--accent2)' }}>📦 Inventario</div>
            </div>
          </div>

          <div className="psec">
            <div className="psec-lbl">🖨️ Imprimir Comprobante</div>
            <div className="pgrid">
              <button className="pbtn pbtn-t" onClick={imprimirTermico}>
                🧾 Ticket Termico
                <span className="sub">Impresora 80mm</span>
              </button>
              <button className="pbtn pbtn-p" onClick={imprimirPDF}>
                📄 Comprobante PDF
                <span className="sub">Hoja carta / A4</span>
              </button>
            </div>
          </div>

          <button className="bnv" onClick={onNuevaVenta}>+ Nueva Venta</button>
          <button className="bvf" onClick={() => navigate('/facturas')}>🧾 Ver en Facturas DTE</button>

        </div>
      </div>
    </>
  )
}