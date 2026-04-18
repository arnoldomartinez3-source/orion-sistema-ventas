import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../AuthContext'

const TIPOS_DTE = [
  { codigo: 'FE',  nombre: 'Factura Consumidor Final', color: '#00d4aa', icon: '🧾' },
  { codigo: 'CCF', nombre: 'Crédito Fiscal',           color: '#4f8cff', icon: '🏢' },
]

const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`
const precioConIva = (precio) => precio * 1.13

export default function TicketImpresion({ ventaFinalizada, onNuevaVenta }) {
  const { user } = useAuth()
  const [configEmpresa, setConfigEmpresa] = useState({})

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'configuracion', user.uid)).then(snap => {
      if (snap.exists()) setConfigEmpresa(snap.data())
    })
  }, [user])

  if (!ventaFinalizada) return null

  const v = ventaFinalizada
  const tipo = TIPOS_DTE.find(t => t.codigo === v.tipoDte) || TIPOS_DTE[0]
  const fechaHoy = new Date().toLocaleDateString('es-SV', { day: '2-digit', month: 'long', year: 'numeric' })
  const horaHoy = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })

  // ── HTML TICKET TÉRMICO 80mm ──
  const htmlTermico = () => {
    const empresa = configEmpresa
    const items = v.carrito.map((c) =>
      `<div class="row">
        <span class="prod-nombre">${c.nombre}</span>
        <span style="font-weight:700">${fmt(precioConIva(c.precio) * c.qty)}</span>
      </div>
      <div style="font-size:10px;color:#444;padding-left:3px;margin-bottom:3px">${c.qty} x ${fmt(precioConIva(c.precio))}</div>`
    ).join('')

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Ticket ${v.numeroDte}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Courier New',monospace; width:72mm; font-size:12px; color:#000; background:#fff; padding:3mm; }
    .c { text-align:center; }
    .b { font-weight:bold; }
    .line { border-top:1px dashed #000; margin:5px 0; }
    .row { display:flex; justify-content:space-between; margin:2px 0; font-size:11px; }
    .empresa { font-size:15px; font-weight:900; text-align:center; letter-spacing:-0.5px; }
    .dte { font-size:11px; text-align:center; padding:3px 6px; border:1px solid #000; margin:5px 0; font-weight:700; }
    .total { font-size:20px; font-weight:900; text-align:center; margin:8px 0 4px; }
    .pie { font-size:10px; text-align:center; color:#555; margin-top:4px; }
    .prod-nombre { flex:1; max-width:42mm; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
    @media print { @page { margin:2mm; size:80mm auto; } }
  </style>
</head>
<body>
  ${empresa.logoUrl ? `<div class="c" style="margin-bottom:4px"><img src="${empresa.logoUrl}" style="max-width:50mm;max-height:14mm;object-fit:contain;" onerror="this.style.display='none'"/></div>` : ''}
  <div class="empresa">${empresa.empresaNombre || 'Mi Empresa'}</div>
  <div class="c" style="font-size:10px;margin-top:2px">${empresa.direccion || ''}</div>
  <div class="c" style="font-size:10px">NIT: ${empresa.nit || '---'} | NRC: ${empresa.nrc || '---'}</div>
  ${empresa.telefono ? `<div class="c" style="font-size:10px">Tel: ${empresa.telefono}</div>` : ''}
  <div class="line"></div>
  <div class="dte">${tipo.nombre}</div>
  <div class="dte" style="font-size:13px;letter-spacing:1px">${v.numeroDte}</div>
  <div class="line"></div>
  <div class="row"><span>Fecha:</span><span>${new Date().toLocaleDateString('es-SV')}</span></div>
  <div class="row"><span>Hora:</span><span>${horaHoy}</span></div>
  <div class="row"><span>Cliente:</span><span style="font-weight:700">${v.cliente}</span></div>
  ${v.nit ? `<div class="row"><span>NIT:</span><span>${v.nit}</span></div>` : ''}
  ${v.nrc ? `<div class="row"><span>NRC:</span><span>${v.nrc}</span></div>` : ''}
  <div class="line"></div>
  <div class="b" style="font-size:11px;margin-bottom:3px">DETALLE DE VENTA</div>
  ${items}
  <div class="line"></div>
  <div class="row"><span>Subtotal:</span><span>${fmt(v.subtotal)}</span></div>
  <div class="row"><span>IVA 13%:</span><span>${fmt(v.ivaTotal)}</span></div>
  <div class="line"></div>
  <div class="total">TOTAL: ${fmt(v.total)}</div>
  <div class="line"></div>
  <div class="row b"><span>Forma de pago:</span><span>${v.tipoPago === 'contado' ? 'CONTADO' : 'CREDITO'}</span></div>
  ${v.tipoPago === 'credito' ? `<div class="row"><span>Vence:</span><span style="color:#c00;font-weight:700">${v.fechaVencimiento}</span></div>` : ''}
  <div class="line"></div>
  <div class="pie">Gracias por su compra!</div>
  <div class="pie">${empresa.empresaNombre || 'ORION'} - ONE GEO SYSTEMS</div>
  <div style="margin-top:10mm"></div>
</body>
</html>`
  }

  // ── HTML COMPROBANTE PDF CARTA ──
  const htmlPDF = () => {
    const empresa = configEmpresa
    const rows = v.carrito.map((c, i) =>
      `<tr>
        <td style="color:#9ca3af;font-size:11px">${i + 1}</td>
        <td style="font-weight:600">${c.nombre}</td>
        <td style="text-align:center">${c.qty}</td>
        <td style="text-align:right">${fmt(precioConIva(c.precio))}</td>
        <td style="text-align:right;font-weight:700">${fmt(precioConIva(c.precio) * c.qty)}</td>
      </tr>`
    ).join('')

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Comprobante ${v.numeroDte}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;background:#fff;font-size:13px;}
    .page{max-width:700px;margin:0 auto;padding:36px;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:18px;border-bottom:3px solid #1B2E6B;}
    .empresa h1{font-size:20px;font-weight:900;color:#1B2E6B;letter-spacing:-0.5px;}
    .empresa p{font-size:11px;color:#6b7280;margin-top:3px;}
    .doc-info{text-align:right;}
    .doc-tipo{font-size:10px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;}
    .doc-num{font-size:24px;font-weight:900;color:#1B2E6B;letter-spacing:-1px;}
    .doc-badge{display:inline-block;padding:4px 14px;border-radius:99px;font-size:11px;font-weight:700;background:rgba(27,46,107,0.1);color:#1B2E6B;border:1px solid rgba(27,46,107,0.2);margin-top:4px;}
    .info-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px;}
    .info-box{background:#f8faff;border-radius:10px;padding:14px;border:1px solid #e5eaf5;}
    .info-box h3{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:6px;font-weight:700;}
    .info-box p{font-size:13px;line-height:1.5;}
    table{width:100%;border-collapse:collapse;margin-bottom:18px;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(27,46,107,0.08);}
    thead{background:#1B2E6B;color:#fff;}
    th{padding:10px 14px;text-align:left;font-size:11px;letter-spacing:0.8px;font-weight:700;text-transform:uppercase;}
    th:last-child,td:last-child{text-align:right;}
    td{padding:10px 14px;border-bottom:1px solid #f0f4ff;font-size:13px;}
    tr:last-child td{border-bottom:none;}
    tr:nth-child(even) td{background:#fafbff;}
    .totales{display:flex;justify-content:flex-end;margin-bottom:20px;}
    .totales-box{min-width:220px;}
    .t-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f4ff;font-size:13px;color:#6b7280;}
    .t-row.fin{border-bottom:none;padding:10px 0 0;margin-top:4px;font-size:18px;font-weight:900;color:#1B2E6B;}
    .footer{text-align:center;padding-top:14px;border-top:1px solid #e5eaf5;font-size:11px;color:#9ca3af;}
    .firma-row{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:24px 0 16px;}
    .firma-linea{border-top:1.5px solid #1B2E6B;padding-top:7px;margin-top:36px;font-size:11px;color:#6b7280;text-align:center;}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{margin:15mm;}}
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="empresa">
      ${empresa.logoUrl ? `<img src="${empresa.logoUrl}" alt="Logo" style="max-height:50px;max-width:160px;object-fit:contain;margin-bottom:6px;display:block;" onerror="this.style.display='none'"/>` : ''}
      <h1>${empresa.empresaNombre || 'Mi Empresa'}</h1>
      <p>${empresa.direccion || ''}</p>
      <p>NIT: ${empresa.nit || '---'} | NRC: ${empresa.nrc || '---'}</p>
      ${empresa.telefono ? `<p>Tel: ${empresa.telefono}</p>` : ''}
    </div>
    <div class="doc-info">
      <div class="doc-tipo">Comprobante de Venta</div>
      <div class="doc-num">${v.numeroDte}</div>
      <div class="doc-badge">${tipo.nombre}</div>
      <p style="font-size:11px;color:#9ca3af;margin-top:6px">${fechaHoy} - ${horaHoy}</p>
    </div>
  </div>
  <div class="info-row">
    <div class="info-box">
      <h3>Cliente</h3>
      <p style="font-weight:700;font-size:15px;color:#1B2E6B">${v.cliente}</p>
      ${v.nit ? `<p style="margin-top:4px">NIT: <strong>${v.nit}</strong></p>` : ''}
      ${v.nrc ? `<p>NRC: <strong>${v.nrc}</strong></p>` : ''}
    </div>
    <div class="info-box">
      <h3>Detalle del Pago</h3>
      <p>Forma de pago: <strong>${v.tipoPago === 'contado' ? 'Contado' : 'Credito'}</strong></p>
      ${v.tipoPago === 'credito' ? `<p>Vence: <strong style="color:#c00">${v.fechaVencimiento}</strong></p>` : ''}
      <p>Tipo DTE: <strong>${tipo.nombre}</strong></p>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Descripcion</th>
        <th style="text-align:center">Cant.</th>
        <th style="text-align:right">Precio Unit.</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totales">
    <div class="totales-box">
      <div class="t-row"><span>Subtotal (sin IVA)</span><span>${fmt(v.subtotal)}</span></div>
      <div class="t-row"><span>IVA 13%</span><span>${fmt(v.ivaTotal)}</span></div>
      <div class="t-row fin"><span>TOTAL</span><span>${fmt(v.total)}</span></div>
    </div>
  </div>
  <div class="firma-row">
    <div class="firma-linea">Firma / ${v.cliente}</div>
    <div class="firma-linea">Autorizado / ${empresa.empresaNombre || ''}</div>
  </div>
  <div class="footer">
    <p>Este documento es un comprobante valido de su transaccion. Conserve para sus registros.</p>
    <p style="margin-top:5px">ORION - ${empresa.empresaNombre || 'Mi Empresa'} - ONE GEO SYSTEMS</p>
  </div>
</div>
</body>
</html>`
  }

  const abrirTermico = () => {
    const win = window.open('', '_blank', 'width=340,height=650,scrollbars=yes,resizable=yes')
    if (!win) { alert('Permite ventanas emergentes para imprimir'); return }
    win.document.write(htmlTermico())
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 1500)
  }

  const abrirPDF = () => {
    const win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes,resizable=yes')
    if (!win) { alert('Permite ventanas emergentes para imprimir'); return }
    win.document.write(htmlPDF())
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 1500)
  }

  return (
    <>
      <style>{`
        .ticket-pro{background:var(--surface);border:1.5px solid var(--border);border-radius:20px;padding:32px;text-align:center;box-shadow:0 8px 30px var(--shadow2);}
        .ticket-check{font-size:60px;margin-bottom:14px;}
        .ticket-title{font-size:24px;font-weight:800;letter-spacing:-0.5px;margin-bottom:6px;}
        .ticket-dte-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 18px;border-radius:99px;font-size:14px;font-weight:700;margin-bottom:20px;font-family:var(--mono);}
        .ticket-detalle{text-align:left;background:var(--surface2);border-radius:14px;padding:18px;margin-bottom:18px;border:1px solid var(--border);}
        .ticket-item{display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px;gap:12px;}
        .ticket-divider{border:none;border-top:1px solid var(--border);margin:12px 0;}
        .ticket-total-row{display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px;}
        .ticket-total-row.final{font-size:20px;font-weight:800;margin-top:10px;}
        .print-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;}
        .print-btn{padding:14px 10px;border-radius:14px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;transition:all 0.2s;}
        .print-btn:hover{transform:translateY(-2px);}
        .print-btn .sub{font-size:11px;font-weight:400;opacity:0.75;display:block;margin-top:3px;}
        .print-btn-termica{background:linear-gradient(135deg,#1B2E6B,#2E5FA3);color:white;box-shadow:0 4px 14px rgba(27,46,107,0.35);}
        .print-btn-pdf{background:var(--surface);color:var(--text);border:1.5px solid var(--border2);}
        .print-btn-pdf:hover{border-color:var(--accent);color:var(--accent);}
        .badge-row{display:flex;gap:10px;margin-bottom:18px;}
        .badge-box{flex:1;border-radius:12px;padding:12px;font-size:13px;text-align:center;}
        .btn-nueva-venta{width:100%;background:linear-gradient(135deg,var(--accent),var(--accent-dark));color:#fff;border:none;border-radius:14px;padding:15px;font-family:'Inter',sans-serif;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:10px;transition:all 0.2s;}
        .btn-nueva-venta:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(46,111,212,0.4);}
        .btn-ver-facturas{width:100%;background:var(--surface2);color:var(--text2);border:1.5px solid var(--border);border-radius:12px;padding:12px;font-family:'Inter',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;}
        .btn-ver-facturas:hover{border-color:var(--accent);color:var(--accent);}
        .print-section{background:var(--surface2);border:1.5px solid var(--border);border-radius:14px;padding:16px;margin-bottom:14px;}
        .print-section-label{font-size:12px;font-weight:700;color:var(--muted);letter-spacing:0.8px;text-transform:uppercase;margin-bottom:10px;}
      `}</style>

      <div style={{ maxWidth: 560, margin: '24px auto' }}>
        <div className="ticket-pro">

          <div className="ticket-check">{v.tipoPago === 'credito' ? '📋' : '✅'}</div>
          <div className="ticket-title">{v.tipoPago === 'credito' ? '¡Crédito Registrado!' : '¡Venta Completada!'}</div>
          <div className="ticket-dte-badge" style={{ background: tipo.color + '15', color: tipo.color, border: `1.5px solid ${tipo.color}30` }}>
            {tipo.icon} {v.numeroDte} — {tipo.nombre}
          </div>

          {v.tipoPago === 'credito' && (
            <div style={{ background: 'rgba(245,158,11,0.1)', border: '1.5px solid rgba(245,158,11,0.25)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, textAlign: 'left' }}>
              📅 <strong style={{ color: '#f59e0b' }}>Vence:</strong> {v.fechaVencimiento}
            </div>
          )}

          <div className="ticket-detalle">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text2)', display: 'flex', justifyContent: 'space-between' }}>
              <span>👤 {v.cliente}</span>
              {v.nit && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>NIT: {v.nit}</span>}
            </div>
            {v.carrito.map(c => (
              <div key={c.id} className="ticket-item">
                <span style={{ color: 'var(--text2)', flex: 1 }}>{c.qty}x {c.nombre}</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(precioConIva(c.precio) * c.qty)}</span>
              </div>
            ))}
            <hr className="ticket-divider"/>
            <div className="ticket-total-row"><span style={{ color: 'var(--muted)' }}>Subtotal</span><span>{fmt(v.subtotal)}</span></div>
            <div className="ticket-total-row"><span style={{ color: 'var(--muted)' }}>IVA 13%</span><span>{fmt(v.ivaTotal)}</span></div>
            <div className="ticket-total-row final">
              <span>TOTAL</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(v.total)}</span>
            </div>
          </div>

          <div className="badge-row">
            <div className="badge-box" style={{ background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.2)' }}>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Guardado en</div>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>🔥 Firebase</div>
            </div>
            <div className="badge-box" style={{ background: 'rgba(79,140,255,0.08)', border: '1px solid rgba(79,140,255,0.2)' }}>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Stock actualizado</div>
              <div style={{ fontWeight: 700, color: 'var(--accent2)' }}>📦 Inventario</div>
            </div>
          </div>

          <div className="print-section">
            <div className="print-section-label">🖨️ Imprimir Comprobante</div>
            <div className="print-grid">
              <button className="print-btn print-btn-termica" onClick={abrirTermico}>
                🧾 Ticket Térmico
                <span className="sub">Impresora 80mm</span>
              </button>
              <button className="print-btn print-btn-pdf" onClick={abrirPDF}>
                📄 Comprobante PDF
                <span className="sub">Hoja carta / A4</span>
              </button>
            </div>
          </div>

          <button className="btn-nueva-venta" onClick={onNuevaVenta}>
            + Nueva Venta
          </button>
          <button className="btn-ver-facturas" onClick={() => window.location.href = '/facturas'}>
            🧾 Ver en Facturas DTE
          </button>

        </div>
      </div>
    </>
  )
}
