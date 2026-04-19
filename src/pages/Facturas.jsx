import { useState, useEffect } from 'react'
import { db } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, getDoc
} from 'firebase/firestore'
import { useAuth } from '../AuthContext'

const TIPOS_DTE = [
  { codigo: 'FE',  nombre: 'Factura de Consumidor Final',   desc: 'Para personas sin NRC',  color: '#00d4aa' },
  { codigo: 'CCF', nombre: 'Comprobante de Credito Fiscal',  desc: 'Para empresas con NRC',  color: '#4f8cff' },
  { codigo: 'NC',  nombre: 'Nota de Credito',               desc: 'Anular o ajustar factura', color: '#f59e0b' },
  { codigo: 'ND',  nombre: 'Nota de Debito',                desc: 'Cobros adicionales',      color: '#8b5cf6' },
  { codigo: 'FEX', nombre: 'Factura de Exportacion',        desc: 'Ventas al extranjero',    color: '#ec4899' },
  { codigo: 'NR',  nombre: 'Nota de Remision',              desc: 'Envio sin cobro',         color: '#6b7280' },
]

const ESTADOS_PAGO = [
  { value: 'pagada',   label: 'Pagada',   color: '#00d4aa' },
  { value: 'pendiente',label: 'Pendiente',color: '#f59e0b' },
  { value: 'vencida',  label: 'Vencida',  color: '#ef4444' },
  { value: 'anulada',  label: 'Anulada',  color: '#6b7280' },
]

const emptyForm = {
  tipoDte: 'FE', cliente: '', nit: '', nrc: '', direccion: '',
  descripcion: '', subtotal: '', iva: '', total: '',
  estadoPago: 'pagada',
  fechaEmision: new Date().toISOString().slice(0, 10),
  fechaVencimiento: '', notas: '',
}

const factStyles = `
  .fact-resumen { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 20px; }
  @media (max-width: 900px) { .fact-resumen { grid-template-columns: repeat(2,1fr); } }

  .resumen-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; padding: 18px 20px; box-shadow: 0 4px 20px var(--shadow2); position: relative; overflow: hidden; }
  .resumen-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background: var(--rc-color, var(--accent)); }
  .resumen-val { font-size: 24px; font-weight: 800; font-family: var(--mono); margin: 6px 0 3px; letter-spacing: -1px; }
  .resumen-label { font-size: 11px; color: var(--muted); letter-spacing: 0.8px; font-weight: 700; text-transform: uppercase; }
  .resumen-sub { font-size: 12px; color: var(--muted); }

  .filtros-bar { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; align-items: center; }
  .filtros-bar .input { max-width: 280px; }
  .filter-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
  .filter-tab { padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; color: var(--muted); transition: all 0.15s; border: 1.5px solid var(--border); background: transparent; font-family: var(--font); }
  .filter-tab.active { background: rgba(0,212,170,0.12); color: var(--accent); border-color: rgba(0,212,170,0.3); }
  .filter-tab:hover { color: var(--text); border-color: var(--border2); }

  .tipo-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 6px; font-family: var(--mono); letter-spacing: 0.5px; border: 1.5px solid; }

  .estado-pago { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; border: 1px solid; }
  .estado-pago.pagada   { background: rgba(0,212,170,0.1);  color: #00d4aa; border-color: rgba(0,212,170,0.25); }
  .estado-pago.pendiente{ background: rgba(245,158,11,0.1); color: #f59e0b; border-color: rgba(245,158,11,0.25); }
  .estado-pago.vencida  { background: rgba(239,68,68,0.1);  color: #ef4444; border-color: rgba(239,68,68,0.25); }
  .estado-pago.anulada  { background: rgba(107,114,128,0.1);color: #6b7280; border-color: rgba(107,114,128,0.25); }

  .modal-xl { max-width: 640px !important; max-height: 90vh; overflow-y: auto; }
  .tipo-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 4px; }
  @media (max-width: 500px) { .tipo-grid { grid-template-columns: repeat(2,1fr); } }
  .tipo-option { border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 12px; cursor: pointer; transition: all 0.15s; text-align: left; }
  .tipo-option:hover { border-color: var(--border2); background: var(--surface2); }
  .tipo-option.selected { border-color: var(--to-color); background: rgba(0,0,0,0.05); }
  .tipo-option-code { font-size: 13px; font-weight: 800; font-family: var(--mono); }
  .tipo-option-name { font-size: 11px; color: var(--muted); margin-top: 2px; line-height: 1.3; }

  .iva-calc { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 14px; }
  .iva-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
  .iva-row.total { font-size: 16px; font-weight: 800; padding-top: 8px; border-top: 1.5px solid var(--border); margin-top: 4px; margin-bottom: 0; }
  .modal-section { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; padding-bottom: 8px; border-bottom: 1px solid var(--border); margin: 16px 0 12px; }

  .sello { font-family: var(--mono); font-size: 11px; color: var(--accent); background: rgba(0,212,170,0.08); padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(0,212,170,0.2); }

  /* Detalle modal mejorado */
  .detalle-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
  .detalle-field { display: flex; flex-direction: column; gap: 3px; }
  .detalle-field-label { font-size: 10px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .detalle-field-value { font-size: 14px; font-weight: 600; }

  /* Botones acción en tabla */
  .action-btns { display: flex; gap: 5px; }
  .btn-wa { background: rgba(37,211,102,0.12); color: #25D366; border: 1.5px solid rgba(37,211,102,0.25); }
  .btn-wa:hover { background: #25D366; color: white; }
  .btn-pdf { background: rgba(239,68,68,0.1); color: #ef4444; border: 1.5px solid rgba(239,68,68,0.2); }
  .btn-pdf:hover { background: #ef4444; color: white; }
`

// ── Imprimir con iframe oculto ──
const imprimirIframe = (html) => {
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

export default function Facturas() {
  const { user } = useAuth()
  const [facturas, setFacturas] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [detalleOpen, setDetalleOpen] = useState(null)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [guardando, setGuardando] = useState(false)
  const [empresa, setEmpresa] = useState({})

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'facturas'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setFacturas(data)
      setLoading(false)
    })
    // Cargar config empresa
    if (user) {
      getDoc(doc(db, 'configuracion', user.uid)).then(snap => {
        if (snap.exists()) setEmpresa(snap.data())
      })
    }
    return () => unsub()
  }, [user])

  const calcularIva = (subtotal) => {
    const s = parseFloat(subtotal) || 0
    const iva = s * 0.13
    setForm(f => ({ ...f, subtotal, iva: iva.toFixed(2), total: (s + iva).toFixed(2) }))
  }

  const filtradas = facturas.filter(f => {
    const q = busqueda.toLowerCase()
    const coincide = f.cliente?.toLowerCase().includes(q) || f.numero?.toLowerCase().includes(q) || f.nit?.includes(q)
    const tipo = filtroTipo === 'todos' || f.tipoDte === filtroTipo
    const estado = filtroEstado === 'todos' || f.estadoPago === filtroEstado
    return coincide && tipo && estado
  })

  const totalPagadas   = facturas.filter(f => f.estadoPago === 'pagada').reduce((s, f) => s + (f.total || 0), 0)
  const totalPendientes= facturas.filter(f => f.estadoPago === 'pendiente').reduce((s, f) => s + (f.total || 0), 0)
  const totalVencidas  = facturas.filter(f => f.estadoPago === 'vencida').reduce((s, f) => s + (f.total || 0), 0)

  const abrirModal = (factura = null) => {
    if (factura) {
      setEditando(factura.id)
      setForm({ ...emptyForm, ...factura })
    } else {
      setEditando(null)
      setForm({ ...emptyForm, numero: `FE-${String(facturas.length + 1).padStart(6, '0')}` })
    }
    setModalOpen(true)
  }

  const guardar = async () => {
    if (!form.cliente || !form.tipoDte) return
    setGuardando(true)
    const data = {
      tipoDte: form.tipoDte,
      numero: form.numero || `${form.tipoDte}-${String(facturas.length + 1).padStart(6, '0')}`,
      cliente: form.cliente, nit: form.nit || '', nrc: form.nrc || '',
      direccion: form.direccion || '', descripcion: form.descripcion || '',
      subtotal: parseFloat(form.subtotal) || 0, iva: parseFloat(form.iva) || 0, total: parseFloat(form.total) || 0,
      estadoPago: form.estadoPago, fechaEmision: form.fechaEmision,
      fechaVencimiento: form.fechaVencimiento || '', notas: form.notas || '',
      updatedAt: serverTimestamp()
    }
    try {
      if (editando) {
        await updateDoc(doc(db, 'facturas', editando), data)
      } else {
        await addDoc(collection(db, 'facturas'), { ...data, createdAt: serverTimestamp() })
      }
      setModalOpen(false)
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const cambiarEstado = async (id, nuevoEstado) => {
    try { await updateDoc(doc(db, 'facturas', id), { estadoPago: nuevoEstado, updatedAt: serverTimestamp() }) }
    catch (e) { alert('Error: ' + e.message) }
  }

  const eliminar = async (id) => {
    if (!confirm('Eliminar esta factura?')) return
    try { await deleteDoc(doc(db, 'facturas', id)) }
    catch (e) { alert('Error: ' + e.message) }
  }

  const getTipoInfo = (codigo) => TIPOS_DTE.find(t => t.codigo === codigo) || TIPOS_DTE[0]
  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  const formatFecha = (fecha) => { if (!fecha) return '—'; const [y,m,d] = fecha.split('-'); return `${d}/${m}/${y}` }

  // ── Generar PDF de factura ──
  const generarPDF = (f) => {
    const tipo = getTipoInfo(f.tipoDte)
    const items = f.items || [{ descripcion: f.descripcion || 'Productos/Servicios', cantidad: 1, precioUnitario: f.subtotal, total: f.subtotal }]

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>${f.tipoDte} ${f.numero}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;font-size:13px;}
.page{max-width:700px;margin:0 auto;padding:36px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:18px;border-bottom:3px solid #1B2E6B;}
.emp h1{font-size:20px;font-weight:900;color:#1B2E6B;}
.emp p{font-size:11px;color:#6b7280;margin-top:2px;}
.doc{text-align:right;}
.doc-tipo{font-size:10px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;}
.doc-num{font-size:22px;font-weight:900;color:#1B2E6B;}
.doc-badge{display:inline-block;padding:4px 14px;border-radius:99px;font-size:11px;font-weight:700;margin-top:4px;}
.info-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px;}
.box{background:#f8faff;border-radius:10px;padding:14px;border:1px solid #e5eaf5;}
.box h3{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:6px;font-weight:700;}
.box p{font-size:13px;line-height:1.6;}
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
.stamp{display:inline-block;padding:6px 16px;border-radius:99px;font-size:11px;font-weight:700;}
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
      <div class="doc-tipo">${tipo.nombre}</div>
      <div class="doc-num">${f.numero}</div>
      <div class="doc-badge" style="background:${tipo.color}15;color:${tipo.color};border:1px solid ${tipo.color}40">${f.tipoDte}</div>
      <p style="font-size:11px;color:#9ca3af;margin-top:6px">Emision: ${formatFecha(f.fechaEmision)}</p>
      ${f.fechaVencimiento ? `<p style="font-size:11px;color:#f59e0b">Vence: ${formatFecha(f.fechaVencimiento)}</p>` : ''}
    </div>
  </div>

  <div class="info-row">
    <div class="box">
      <h3>Cliente</h3>
      <p style="font-weight:700;font-size:15px;color:#1B2E6B">${f.cliente}</p>
      ${f.nit ? `<p>NIT: <strong>${f.nit}</strong></p>` : ''}
      ${f.nrc ? `<p>NRC: <strong>${f.nrc}</strong></p>` : ''}
      ${f.direccion ? `<p>${f.direccion}</p>` : ''}
    </div>
    <div class="box">
      <h3>Estado del Documento</h3>
      <div class="stamp" style="background:${ESTADOS_PAGO.find(e=>e.value===f.estadoPago)?.color || '#00d4aa'}15;color:${ESTADOS_PAGO.find(e=>e.value===f.estadoPago)?.color || '#00d4aa'};border:1px solid ${ESTADOS_PAGO.find(e=>e.value===f.estadoPago)?.color || '#00d4aa'}40">
        ${f.estadoPago?.charAt(0).toUpperCase() + f.estadoPago?.slice(1) || 'Pagada'}
      </div>
      <p style="margin-top:8px">Forma de pago: <strong>${f.tipoPago === 'credito' ? 'Credito' : 'Contado'}</strong></p>
    </div>
  </div>

  <table>
    <thead><tr><th>#</th><th>Descripcion</th><th style="text-align:right">Subtotal</th></tr></thead>
    <tbody>
      <tr>
        <td style="color:#9ca3af">1</td>
        <td style="font-weight:600">${f.descripcion || 'Productos y/o Servicios'}</td>
        <td style="text-align:right;font-weight:700">${fmt(f.subtotal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="tots">
    <div class="tots-box">
      <div class="trow"><span>Subtotal (sin IVA)</span><span>${fmt(f.subtotal)}</span></div>
      <div class="trow"><span>IVA 13%</span><span>${fmt(f.iva)}</span></div>
      <div class="trow fin"><span>TOTAL</span><span>${fmt(f.total)}</span></div>
    </div>
  </div>

  ${f.notas ? `<div style="background:#fffbeb;border:1px solid #f59e0b40;border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#92400e">Notas: ${f.notas}</div>` : ''}

  <div class="firmas">
    <div class="firma">Firma / ${f.cliente}</div>
    <div class="firma">Autorizado / ${empresa.empresaNombre || ''}</div>
  </div>

  <div class="footer">
    <p>Documento generado electronicamente. Valido como comprobante fiscal.</p>
    <p style="margin-top:4px">ORION - ${empresa.empresaNombre || 'Mi Empresa'} - ONE GEO SYSTEMS</p>
  </div>
</div>
</body>
</html>`
  }

  const imprimirPDF = (f) => imprimirIframe(generarPDF(f))

  const imprimirTermico = (f) => {
    const tipo = getTipoInfo(f.tipoDte)
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:"Courier New",monospace;width:72mm;font-size:14px;color:#000;padding:3mm;}.c{text-align:center;}.b{font-weight:bold;}.sep{border-top:1px dashed #000;margin:5px 0;}.row{display:flex;justify-content:space-between;margin:2px 0;font-size:12px;}.empresa{font-size:15px;font-weight:900;text-align:center;}.dte{border:1px solid #000;text-align:center;padding:3px;margin:4px 0;font-weight:700;}.total{font-size:18px;font-weight:900;text-align:center;margin:6px 0;}.pie{font-size:11px;text-align:center;color:#555;}@media print{@page{margin:2mm;size:80mm auto;}}</style></head><body><div class="empresa">${empresa.empresaNombre || "Mi Empresa"}</div>${empresa.direccion ? `<div class="c" style="font-size:11px">${empresa.direccion}</div>` : ""}<div class="c" style="font-size:11px">NIT:${empresa.nit || "---"} NRC:${empresa.nrc || "---"}</div><div class="sep"></div><div class="dte">${tipo.nombre}</div><div class="dte">${f.numero}</div><div class="sep"></div><div class="row"><span>Fecha:</span><span>${formatFecha(f.fechaEmision)}</span></div><div class="row"><span>Cliente:</span><span>${f.cliente}</span></div>${f.nit ? `<div class="row"><span>NIT:</span><span>${f.nit}</span></div>` : ""}<div class="sep"></div><div style="font-size:12px;margin:3px 0">${f.descripcion || "Productos/Servicios"}</div><div class="sep"></div><div class="row"><span>Subtotal:</span><span>$${(f.subtotal||0).toFixed(2)}</span></div><div class="row"><span>IVA 13%:</span><span>$${(f.iva||0).toFixed(2)}</span></div><div class="sep"></div><div class="total">TOTAL: $${(f.total||0).toFixed(2)}</div><div class="sep"></div><div class="pie">Gracias por su compra!</div><div class="pie">${empresa.empresaNombre || "ORION"}</div><div style="margin-top:8mm"></div></body></html>`
    imprimirIframe(html)
  }

  // ── WhatsApp ──
  const compartirWA = (f) => {
    const tipo = getTipoInfo(f.tipoDte)
    const msg = encodeURIComponent(
      `Hola! Te comparto el detalle de tu documento fiscal:\n\n` +
      `*${tipo.nombre}*\n` +
      `No: *${f.numero}*\n` +
      `Fecha: ${formatFecha(f.fechaEmision)}\n` +
      `Cliente: *${f.cliente}*\n\n` +
      `Subtotal: ${fmt(f.subtotal)}\n` +
      `IVA 13%: ${fmt(f.iva)}\n` +
      `*TOTAL: ${fmt(f.total)}*\n\n` +
      `${f.notas ? `Notas: ${f.notas}\n\n` : ''}` +
      `Emitido por ${empresa.empresaNombre || 'ORION'}`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  return (
    <>
      <style>{factStyles}</style>

      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">🧾 Facturas DTE</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {facturas.length} documentos
            <span className="firebase-badge">🔥 Firebase</span>
            <span className="dte-tag">🔒 MH SV</span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => abrirModal()}>+ Emitir DTE</button>
      </div>

      <div className="fact-resumen">
        <div className="resumen-card" style={{ '--rc-color': '#00d4aa' }}>
          <div className="resumen-label">TOTAL COBRADO</div>
          <div className="resumen-val" style={{ color: 'var(--accent)' }}>{fmt(totalPagadas)}</div>
          <div className="resumen-sub">{facturas.filter(f => f.estadoPago === 'pagada').length} facturas pagadas</div>
        </div>
        <div className="resumen-card" style={{ '--rc-color': '#f59e0b' }}>
          <div className="resumen-label">POR COBRAR</div>
          <div className="resumen-val" style={{ color: '#f59e0b' }}>{fmt(totalPendientes)}</div>
          <div className="resumen-sub">{facturas.filter(f => f.estadoPago === 'pendiente').length} pendientes</div>
        </div>
        <div className="resumen-card" style={{ '--rc-color': '#ef4444' }}>
          <div className="resumen-label">VENCIDAS</div>
          <div className="resumen-val" style={{ color: '#ef4444' }}>{fmt(totalVencidas)}</div>
          <div className="resumen-sub">{facturas.filter(f => f.estadoPago === 'vencida').length} documentos</div>
        </div>
        <div className="resumen-card" style={{ '--rc-color': '#4f8cff' }}>
          <div className="resumen-label">TOTAL DOCUMENTOS</div>
          <div className="resumen-val">{facturas.length}</div>
          <div className="resumen-sub">todos los tipos</div>
        </div>
      </div>

      <div className="filtros-bar">
        <input className="input" placeholder="🔍 Buscar cliente, No. DTE o NIT..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <div className="filter-tabs">
          {['todos', ...TIPOS_DTE.map(t => t.codigo)].map(t => (
            <button key={t} className={`filter-tab ${filtroTipo === t ? 'active' : ''}`} onClick={() => setFiltroTipo(t)}>
              {t === 'todos' ? 'Todos' : t}
            </button>
          ))}
        </div>
        <div className="filter-tabs">
          {['todos', 'pagada', 'pendiente', 'vencida', 'anulada'].map(e => (
            <button key={e} className={`filter-tab ${filtroEstado === e ? 'active' : ''}`} onClick={() => setFiltroEstado(e)}>
              {e.charAt(0).toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">Cargando facturas...</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>TIPO</th><th>No. DTE</th><th>CLIENTE</th><th>NIT</th>
                  <th>SUBTOTAL</th><th>IVA</th><th>TOTAL</th>
                  <th>EMISION</th><th>VENCE</th><th>ESTADO</th><th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 ? (
                  <tr><td colSpan={11}>
                    <div className="empty-state">
                      <div className="empty-icon">🧾</div>
                      <div className="empty-text">{busqueda ? 'No se encontraron documentos' : 'Emite tu primer DTE'}</div>
                    </div>
                  </td></tr>
                ) : filtradas.map((f) => {
                  const tipo = getTipoInfo(f.tipoDte)
                  return (
                    <tr key={f.id}>
                      <td>
                        <span className="tipo-tag" style={{ color: tipo.color, borderColor: tipo.color + '40', background: tipo.color + '12' }}>
                          {f.tipoDte}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--accent2)' }}>{f.numero}</td>
                      <td style={{ fontWeight: 600 }}>{f.cliente}</td>
                      <td className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{f.nit || '—'}</td>
                      <td className="amount">{fmt(f.subtotal)}</td>
                      <td style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 13 }}>{fmt(f.iva)}</td>
                      <td className="amount" style={{ fontWeight: 700 }}>{fmt(f.total)}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{formatFecha(f.fechaEmision)}</td>
                      <td style={{ color: f.fechaVencimiento ? 'var(--accent3)' : 'var(--muted)', fontSize: 12 }}>{formatFecha(f.fechaVencimiento)}</td>
                      <td>
                        <select
                          className={`estado-pago ${f.estadoPago}`}
                          value={f.estadoPago}
                          onChange={e => cambiarEstado(f.id, e.target.value)}
                          style={{ border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 12, outline: 'none', background: 'transparent' }}>
                          {ESTADOS_PAGO.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button className="btn btn-ghost btn-sm" onClick={() => setDetalleOpen(f)} title="Ver detalle">👁️</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => imprimirTermico(f)} title="Ticket termico">🧾</button>
                          <button className="btn btn-pdf btn-sm" onClick={() => imprimirPDF(f)} title="Descargar PDF">📄</button>
                          <button className="btn btn-wa btn-sm" onClick={() => compartirWA(f)} title="Compartir WhatsApp">💬</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => abrirModal(f)} title="Editar">✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => eliminar(f.id)} title="Eliminar">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL EMITIR DTE ── */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editando ? '✏️ Editar DTE' : '🧾 Emitir Nuevo DTE'}</div>

            <div className="modal-section">TIPO DE DOCUMENTO</div>
            <div className="tipo-grid">
              {TIPOS_DTE.map(t => (
                <div key={t.codigo}
                  className={`tipo-option ${form.tipoDte === t.codigo ? 'selected' : ''}`}
                  style={{ '--to-color': t.color }}
                  onClick={() => setForm(f => ({ ...f, tipoDte: t.codigo }))}>
                  <div className="tipo-option-code" style={{ color: t.color }}>{t.codigo}</div>
                  <div className="tipo-option-name">{t.nombre}</div>
                </div>
              ))}
            </div>

            <div className="modal-section">DATOS DEL CLIENTE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">NOMBRE / RAZON SOCIAL *</label>
                <input className="input" placeholder="Nombre del cliente" value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">NIT</label>
                  <input className="input" placeholder="0614-010190-101-3" value={form.nit} onChange={e => setForm(f => ({ ...f, nit: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">NRC {form.tipoDte === 'CCF' && <span style={{ color: 'var(--danger)' }}>*</span>}</label>
                  <input className="input" placeholder="12345-6" value={form.nrc} onChange={e => setForm(f => ({ ...f, nrc: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">DIRECCION</label>
                <input className="input" placeholder="Direccion del cliente" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
              </div>
            </div>

            <div className="modal-section">DETALLE Y MONTOS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">DESCRIPCION</label>
                <input className="input" placeholder="Venta de articulos" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">SUBTOTAL (SIN IVA) $</label>
                <input className="input" type="number" step="0.01" placeholder="0.00"
                  value={form.subtotal}
                  onChange={e => calcularIva(e.target.value)} />
              </div>
              <div className="iva-calc">
                <div className="iva-row"><span style={{ color: 'var(--muted)' }}>Subtotal</span><span className="amount">${parseFloat(form.subtotal || 0).toFixed(2)}</span></div>
                <div className="iva-row"><span style={{ color: 'var(--muted)' }}>IVA 13%</span><span className="amount" style={{ color: 'var(--accent3)' }}>${parseFloat(form.iva || 0).toFixed(2)}</span></div>
                <div className="iva-row total"><span>TOTAL</span><span className="amount" style={{ color: 'var(--accent)' }}>${parseFloat(form.total || 0).toFixed(2)}</span></div>
              </div>
            </div>

            <div className="modal-section">FECHAS Y ESTADO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">FECHA EMISION</label>
                  <input className="input" type="date" value={form.fechaEmision} onChange={e => setForm(f => ({ ...f, fechaEmision: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">FECHA VENCIMIENTO</label>
                  <input className="input" type="date" value={form.fechaVencimiento} onChange={e => setForm(f => ({ ...f, fechaVencimiento: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">ESTADO DE PAGO</label>
                <select className="input" value={form.estadoPago} onChange={e => setForm(f => ({ ...f, estadoPago: e.target.value }))}>
                  {ESTADOS_PAGO.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">NOTAS</label>
                <input className="input" placeholder="Observaciones adicionales" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando || !form.cliente}>
                {guardando ? '⏳ Guardando...' : '💾 Guardar DTE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DETALLE ── */}
      {detalleOpen && (
        <div className="modal-overlay" onClick={() => setDetalleOpen(null)}>
          <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            {(() => {
              const f = detalleOpen
              const tipo = getTipoInfo(f.tipoDte)
              return (
                <>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div className="modal-title" style={{ marginBottom: 0 }}>📄 Detalle del DTE</div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDetalleOpen(null)}>✕</button>
                  </div>

                  {/* Tipo y estado */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                    <span className="tipo-tag" style={{ color: tipo.color, borderColor: tipo.color + '40', background: tipo.color + '12', fontSize: 13, padding: '5px 14px' }}>
                      {f.tipoDte} — {tipo.nombre}
                    </span>
                    <span className={`estado-pago ${f.estadoPago}`}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }}/>
                      {f.estadoPago?.charAt(0).toUpperCase() + f.estadoPago?.slice(1)}
                    </span>
                  </div>

                  {/* Campos */}
                  <div className="detalle-grid">
                    {[
                      { label: 'No. DTE', value: f.numero, mono: true },
                      { label: 'Fecha Emision', value: formatFecha(f.fechaEmision) },
                      { label: 'Cliente', value: f.cliente },
                      { label: 'NIT', value: f.nit || '—', mono: true },
                      { label: 'NRC', value: f.nrc || '—', mono: true },
                      { label: 'Vence', value: formatFecha(f.fechaVencimiento) },
                    ].map(item => (
                      <div key={item.label} className="detalle-field">
                        <div className="detalle-field-label">{item.label}</div>
                        <div className="detalle-field-value" style={{ fontFamily: item.mono ? 'var(--mono)' : 'var(--font)' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {f.descripcion && (
                    <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>DESCRIPCION</div>
                      <div style={{ fontSize: 14 }}>{f.descripcion}</div>
                    </div>
                  )}

                  <div className="iva-calc">
                    <div className="iva-row"><span style={{ color: 'var(--muted)' }}>Subtotal</span><span className="amount">{fmt(f.subtotal)}</span></div>
                    <div className="iva-row"><span style={{ color: 'var(--muted)' }}>IVA (13%)</span><span className="amount" style={{ color: 'var(--accent3)' }}>{fmt(f.iva)}</span></div>
                    <div className="iva-row total"><span>TOTAL</span><span className="amount" style={{ color: 'var(--accent)', fontSize: 18 }}>{fmt(f.total)}</span></div>
                  </div>

                  {f.notas && (
                    <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, fontSize: 13, color: 'var(--muted)' }}>
                      📝 {f.notas}
                    </div>
                  )}

                  {/* Acciones del modal */}
                  <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost" onClick={() => { setDetalleOpen(null); abrirModal(f) }}>✏️ Editar</button>
                    <button className="btn btn-wa" onClick={() => compartirWA(f)}>💬 WhatsApp</button>
                    <button className="btn btn-ghost" onClick={() => imprimirTermico(f)}>🧾 Ticket</button>
                    <button className="btn btn-pdf" onClick={() => imprimirPDF(f)}>📄 Descargar PDF</button>
                    <button className="btn btn-primary" onClick={() => setDetalleOpen(null)}>Cerrar</button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </>
  )
}
