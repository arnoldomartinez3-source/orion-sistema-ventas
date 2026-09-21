import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { getDoc } from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'
import {
  collection, addDoc, updateDoc, onSnapshot,
  doc, query, where, orderBy, serverTimestamp
} from 'firebase/firestore'
import { orionAlert } from '../orionDialog'
import { calcularCaja } from '../utils/caja'
import { escuchar, rango, inicioDelDia } from '../utils/consultas'
import { esAnulada, esDevolucion, montoNeto } from '../utils/devoluciones'
import { crearIframeImpresion } from '../utils/html'

// ══════════════════════════════════════════════════
// MÓDULO DE CAJA — ORIÓN
// Apertura y cierre de caja con múltiples cajeros
// simultáneos, conteo de billetes y reporte PDF
// ══════════════════════════════════════════════════

const TURNOS = [
  { value: 'mañana',  label: 'Mañana',  icon: '🌅', hora: '06:00 - 14:00' },
  { value: 'tarde',   label: 'Tarde',   icon: '☀️', hora: '14:00 - 20:00' },
  { value: 'noche',   label: 'Noche',   icon: '🌙', hora: '20:00 - 06:00' },
  { value: 'completo',label: 'Completo',icon: '📅', hora: '06:00 - 22:00' },
]

const METODOS_PAGO = [
  { value: 'efectivo',      label: 'Efectivo',      icon: '💵', color: '#00C296' },
  { value: 'tarjeta',       label: 'Tarjeta',       icon: '💳', color: '#4A8FE8' },
  { value: 'transferencia', label: 'Transferencia', icon: '📲', color: '#8b5cf6' },
]

// Billetes y monedas de El Salvador (USD)
const DENOMINACIONES = [
  { valor: 100,  label: '$100',   tipo: 'billete' },
  { valor: 50,   label: '$50',    tipo: 'billete' },
  { valor: 20,   label: '$20',    tipo: 'billete' },
  { valor: 10,   label: '$10',    tipo: 'billete' },
  { valor: 5,    label: '$5',     tipo: 'billete' },
  { valor: 2,    label: '$2',     tipo: 'billete' },
  { valor: 1,    label: '$1',     tipo: 'billete' },
  { valor: 0.50, label: '$0.50',  tipo: 'moneda'  },
  { valor: 0.25, label: '$0.25',  tipo: 'moneda'  },
  { valor: 0.10, label: '$0.10',  tipo: 'moneda'  },
  { valor: 0.05, label: '$0.05',  tipo: 'moneda'  },
  { valor: 0.01, label: '$0.01',  tipo: 'moneda'  },
]

const cajaStyles = `
  /* ══ FRANJA DE ESTADO — los números de la caja, con la identidad de ORIÓN ══ */
  .cj-franja { display: flex; align-items: stretch; background: #14213D; border-radius: 14px; overflow: hidden;
    margin-bottom: 14px; box-shadow: 0 10px 26px -18px rgba(20,33,61,.9); }
  .dark-mode .cj-franja { background: #0b1220; border: 1px solid var(--border); }
  .cj-fr { flex: 1 1 0; min-width: 0; padding: 13px 20px; text-align: left; font: inherit; color: inherit; background: transparent; border: 0; }
  .cj-fr + .cj-fr { border-left: 2px solid rgba(255,255,255,.30); box-shadow: inset 2px 0 0 rgba(0,0,0,.35); }
  .cj-fr.clic { cursor: pointer; }
  .cj-fr.clic:hover { background: rgba(255,255,255,.06); }
  .cj-fr.activa { background: rgba(255,255,255,.10); }
  .cj-fr-et { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,.58); font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cj-fr-val { font-family: var(--mono); font-size: 25px; font-weight: 800; color: #fff; line-height: 1.15; margin-top: 3px; }
  .cj-fr-val.oro { color: var(--accent3); }
  .cj-fr-val.malo { color: #FF9C6E; }
  .cj-fr-sub { font-size: 11px; color: rgba(255,255,255,.55); margin-top: 1px; }
  .cj-fr-fila { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
  .cj-fr-fila .cj-fr-sub { margin-top: 0; }
  @media (max-width: 900px) {
    .cj-franja { display: grid; grid-template-columns: 1fr 1fr; }
    .cj-fr { padding: 11px 14px; border-top: 1.5px solid rgba(255,255,255,.20); }
    .cj-fr + .cj-fr { border-left: 0; box-shadow: none; }
    .cj-fr:nth-child(odd) { border-right: 1.5px solid rgba(255,255,255,.20); }
    .cj-fr:nth-child(1), .cj-fr:nth-child(2) { border-top: 0; }
    .cj-fr:nth-child(5) { grid-column: 1 / -1; border-right: 0; }
    .cj-fr-val { font-size: 21px; }
  }

  /* ══ FILTROS SEGMENTADOS ══ */
  .cj-filtros { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
  .cj-seg { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: 11px; padding: 3px; gap: 2px; }
  .cj-seg button { font: inherit; font-size: 13px; font-weight: 600; color: var(--text2); background: transparent; border: none; border-radius: 8px; padding: 7px 14px; cursor: pointer; white-space: nowrap; }
  .cj-seg button:hover { background: var(--surface2); color: var(--text); }
  .cj-seg button.activa { background: #14213D; color: #fff; font-weight: 700; }
  .dark-mode .cj-seg button.activa { background: var(--accent); }
  .cj-buscador { flex: 1 1 200px; min-width: 160px; display: flex; align-items: center; gap: 9px; background: var(--surface); border: 1px solid var(--border); border-radius: 11px; padding: 0 13px; height: 42px; }
  .cj-buscador input { font: inherit; font-size: 13.5px; color: var(--text); border: none; outline: none; background: transparent; width: 100%; }
  .cj-limpiar { font: inherit; font-size: 12.5px; font-weight: 700; color: var(--danger); background: transparent; border: none; cursor: pointer; }
  .cj-btn-linea { font: inherit; font-size: 13.5px; font-weight: 700; color: var(--text); background: var(--surface); border: 1.5px solid var(--border2); border-radius: 10px; padding: 10px 16px; cursor: pointer; }
  .cj-btn-linea:hover { border-color: var(--accent); color: var(--accent); }
  .cj-btn-oro { font: inherit; font-size: 13.5px; font-weight: 800; color: #1a1204; background: var(--accent3); border: none; border-radius: 10px; padding: 11px 19px; cursor: pointer; }
  .cj-btn-oro:hover { filter: brightness(1.07); }

  .cj-vacio { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 46px 40px; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .cj-vacio h3 { font-size: 20px; font-weight: 800; margin: 14px 0 6px; }
  .cj-vacio p { font-size: 13.5px; color: var(--text2); max-width: 480px; line-height: 1.5; }

  /* STATS — tarjetas (mismo estilo que Clientes/Facturas: gradiente + ícono + watermark) */
  .caja-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 16px; }
  @media (max-width: 900px) { .caja-stats { grid-template-columns: repeat(2,1fr); } }
  @media (max-width: 480px) { .caja-stats { grid-template-columns: 1fr; } }
  .caja-stat-card {
    background: linear-gradient(135deg, color-mix(in srgb, var(--cs-color, var(--accent)) 13%, var(--surface)), var(--surface));
    border: 1.5px solid var(--border); border-radius: 14px; padding: 14px 16px;
    position: relative; overflow: hidden; transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .caja-stat-card.clickable { cursor: pointer; }
  .caja-stat-card.clickable:hover { transform: translateY(-2px); box-shadow: 0 6px 22px var(--shadow); }
  .caja-stat-card.activa { border-color: var(--cs-color, var(--accent)); box-shadow: 0 0 0 1.5px var(--cs-color, var(--accent)); }
  .caja-stat-wm { position: absolute; bottom: -10px; right: -8px; width: 54px; height: 54px; color: var(--cs-color, var(--accent)); opacity: 0.13; pointer-events: none; }
  .caja-stat-wm svg { width: 100%; height: 100%; }
  .caja-stat-ic { width: 24px; height: 24px; color: var(--cs-color, var(--accent)); margin-bottom: 6px; position: relative; }
  .caja-stat-ic svg { width: 100%; height: 100%; }
  .caja-stat-num { font-size: 26px; font-weight: 800; font-family: var(--mono); letter-spacing: -0.5px; line-height: 1; position: relative; }
  .caja-stat-lbl { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; position: relative; }

  /* ESTADO CAJA */
  .caja-estado-abierta { background: rgba(0,194,150,0.1); color: #00C296; border: 1px solid rgba(0,194,150,0.25); padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; }
  .caja-estado-cerrada { background: rgba(107,114,128,0.1); color: #6b7280; border: 1px solid rgba(107,114,128,0.25); padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; }
  .caja-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; display: inline-block; }

  /* DATOS CAJA */
  .caja-data-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; margin-bottom: 8px; }
  .caja-data-label { color: var(--muted); }
  .caja-data-val { font-weight: 600; font-family: var(--mono); }

  /* MODAL APERTURA */
  .modal-caja { max-width: 520px !important; }

  /* TURNO SELECTOR */
  .turno-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 8px; margin-bottom: 14px; }
  .turno-btn {
    padding: 12px; border-radius: 12px; border: 1.5px solid var(--border);
    background: var(--surface2); cursor: pointer; text-align: center;
    transition: all 0.15s; font-family: inherit;
  }
  .turno-btn:hover { border-color: var(--border2); }
  .turno-btn.active { border-color: var(--accent); background: var(--glow); }
  .turno-icon { font-size: 22px; margin-bottom: 4px; }
  .turno-label { font-size: 13px; font-weight: 700; color: var(--text); }
  .turno-hora { font-size: 10px; color: var(--muted); margin-top: 2px; }

  /* CONTEO BILLETES */
  .billetes-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 5px; margin-bottom: 12px; }
  .billete-row {
    display: flex; align-items: center; gap: 6px;
    background: var(--surface2); border: 1.5px solid var(--border);
    border-radius: 8px; padding: 5px 8px;
    transition: border-color 0.15s;
  }
  @media (max-width: 560px) { .billetes-grid { grid-template-columns: repeat(2,1fr); } }
  .billete-row:focus-within { border-color: var(--accent); }
  .billete-denom { font-family: var(--mono); font-weight: 800; font-size: 12px; min-width: 30px; }
  .billete-tipo { display: none; }
  .billete-input { width: 38px; height: 28px; border-radius: 6px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); font-family: var(--mono); font-size: 12px; font-weight: 700; text-align: center; outline: none; flex-shrink: 0; }
  .billete-input:focus { border-color: var(--accent); }
  .billete-subtotal { font-family: var(--mono); font-size: 11px; font-weight: 700; color: var(--accent); flex: 1; text-align: right; min-width: 0; overflow: hidden; text-overflow: ellipsis; }

  /* TOTAL CONTEO */
  .conteo-total { background: var(--glow); border: 1.5px solid var(--accent); border-radius: 10px; padding: 10px 16px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center; }
  .conteo-total-label { font-size: 13px; font-weight: 700; color: var(--accent); }
  .conteo-total-val { font-family: var(--mono); font-size: 19px; font-weight: 900; color: var(--accent); }

  /* DIFERENCIA */
  .diferencia-box { border-radius: 10px; padding: 10px 16px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center; }
  .diferencia-ok { background: rgba(0,194,150,0.1); border: 1.5px solid rgba(0,194,150,0.3); }
  .diferencia-over { background: rgba(74,143,232,0.1); border: 1.5px solid rgba(74,143,232,0.3); }
  .diferencia-under { background: rgba(239,68,68,0.1); border: 1.5px solid rgba(239,68,68,0.3); }

  /* RESUMEN TURNO */
  .resumen-metodos { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin: 12px 0; }
  @media (max-width: 400px) { .resumen-metodos { grid-template-columns: repeat(3,1fr); gap: 5px; } }
  .metodo-box { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 10px; text-align: center; }
  .metodo-icon { font-size: 18px; margin-bottom: 4px; }
  .metodo-val { font-family: var(--mono); font-size: 14px; font-weight: 800; }
  @media (max-width: 500px) { .metodo-val { font-size: 12px; } .metodo-label { font-size: 9px; } }
  .metodo-label { font-size: 10px; color: var(--muted); margin-top: 2px; }

  /* TIMELINE */
  .timeline { display: flex; flex-direction: column; gap: 0; }
  .timeline-item { display: flex; gap: 14px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .timeline-item:last-child { border-bottom: none; }
  .timeline-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); flex-shrink: 0; margin-top: 4px; }
  .timeline-content { flex: 1; }
  .timeline-title { font-size: 13px; font-weight: 600; }
  .timeline-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .timeline-amount { font-family: var(--mono); font-size: 13px; font-weight: 700; color: var(--accent); }
`

// Imprimir reporte de cierre con iframe
const imprimirReporte = (caja, empresa = {}) => {
  const fecha = caja.fechaApertura?.toDate?.() || new Date()
  const fechaCierre = caja.fechaCierre?.toDate?.() || new Date()
  const diferencia = (caja.montoReal || 0) - (caja.montoEsperado || 0)

  // Detalle de lo que entró/salió de la gaveta sin ser venta, para justificar la diferencia.
  const movs = [
    ...(caja.movimientosEfectivo || []),
    ...(caja.retiros || []).map(r => ({ tipo: 'salida', monto: r.monto, motivo: r.motivo, fecha: r.fecha, usuario: r.cajero })),
  ]
  const movsHtml = movs.length === 0 ? '' :
    `<div class="sep"></div><div class="b" style="font-size:11px">DETALLE DE MOVIMIENTOS</div>` +
    movs.map(m => {
      const hora = m.fecha ? new Date(m.fecha).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }) : ''
      const signo = m.tipo === 'ingreso' ? '+' : '-'
      return `<div class="row" style="font-size:10px"><span>${hora} ${(m.motivo || 'Sin motivo').slice(0, 26)}</span><span>${signo}$${(m.monto || 0).toFixed(2)}</span></div>`
    }).join('')

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Courier New',monospace;width:72mm;font-size:12px;color:#000;padding:3mm;}
.c{text-align:center;}.b{font-weight:bold;}
.sep{border-top:1px dashed #000;margin:6px 0;}
.row{display:flex;justify-content:space-between;margin:3px 0;font-size:11px;}
.empresa{font-size:14px;font-weight:900;text-align:center;}
.titulo{font-size:13px;font-weight:900;text-align:center;margin:4px 0;}
.total{font-size:16px;font-weight:900;}
.ok{color:#000;}.under{color:#000;}
@media print{@page{margin:2mm;size:80mm auto;}}
</style></head>
<body>
<div class="empresa">${empresa.empresaNombre || 'ORIÓN'}</div>
<div class="c" style="font-size:10px">${empresa.direccion || ''}</div>
<div class="sep"></div>
<div class="titulo">REPORTE DE CIERRE DE CAJA</div>
<div class="sep"></div>
<div class="row"><span>Cajero:</span><span class="b">${caja.cajeroNombre}</span></div>
<div class="row"><span>Turno:</span><span>${caja.turno?.toUpperCase()}</span></div>
<div class="row"><span>Apertura:</span><span>${fecha.toLocaleString('es-SV')}</span></div>
<div class="row"><span>Cierre:</span><span>${fechaCierre.toLocaleString('es-SV')}</span></div>
<div class="sep"></div>
<div class="row"><span>Monto inicial:</span><span>$${(caja.montoInicial||0).toFixed(2)}</span></div>
<div class="row"><span>Ventas efectivo:</span><span>$${(caja.ventasEfectivo||0).toFixed(2)}</span></div>
<div class="row"><span>Ventas tarjeta:</span><span>$${(caja.ventasTarjeta||0).toFixed(2)}</span></div>
<div class="row"><span>Ventas transfer.:</span><span>$${(caja.ventasTransferencia||0).toFixed(2)}</span></div>
${(caja.totalIngresos||0) > 0 ? `<div class="row"><span>Otros ingresos:</span><span>+$${(caja.totalIngresos||0).toFixed(2)}</span></div>` : ''}
<div class="row"><span>Salidas de efectivo:</span><span>-$${(caja.totalRetiros||0).toFixed(2)}</span></div>
${movsHtml}
<div class="sep"></div>
<div class="row b"><span>Total esperado:</span><span>$${(caja.montoEsperado||0).toFixed(2)}</span></div>
<div class="row b"><span>Total contado:</span><span>$${(caja.montoReal||0).toFixed(2)}</span></div>
<div class="sep"></div>
<div class="row b total"><span>DIFERENCIA:</span><span>${diferencia >= 0 ? '+' : ''}$${diferencia.toFixed(2)}</span></div>
<div class="sep"></div>
<div class="row"><span>Total ventas:</span><span>${caja.totalVentas || 0}</span></div>
<div class="c" style="margin-top:8px;font-size:10px">${diferencia === 0 ? '✓ Caja cuadrada perfectamente' : diferencia > 0 ? '↑ Sobrante en caja' : '↓ Faltante en caja'}</div>
<div class="sep"></div>
<div class="c" style="font-size:10px">Firma cajero: ________________</div>
<div class="c" style="font-size:10px;margin-top:10px">${empresa.empresaNombre || 'ORIÓN'} · ONE GEO SYSTEMS</div>
<div style="margin-top:10mm"></div>
</body></html>`

  const iframe = crearIframeImpresion()   /* sandbox sin scripts (utils/html.js) */
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'
  document.body.appendChild(iframe)
  iframe.contentDocument.open()
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 600)
  }
}

const CajaStatIcon = ({ name }) => {
  const p = {
    abiertas: <><path d="M3 9l1-5h16l1 5"/><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9z"/><path d="M9 13h6"/></>,
    ventas: <><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    cerradas: <><rect x="3" y="9" width="18" height="11" rx="1"/><path d="M7 9V6a5 5 0 0 1 10 0v3"/></>,
    cajeros: <><circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6M21 20v-1a5 5 0 0 0-3.5-4.7"/></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p[name]}</svg>
}

export default function Caja() {
  const { user } = useAuth()
  const { userName, esAdmin, empresaId, rol, userId } = usePermisos()

  const [requerirCaja, setRequerirCaja] = useState(false)
  const [cajas, setCajas] = useState([])
  const [filtroBusqueda, setFiltroBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [filtroFecha, setFiltroFecha] = useState('hoy')
  const [filtroDiferencia, setFiltroDiferencia] = useState('todas')
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [empresa, setEmpresa] = useState({})

  // Modales
  const [modalApertura, setModalApertura] = useState(false)
  const [modalCierre, setModalCierre] = useState(null)
  const [modalDetalle, setModalDetalle] = useState(null)
  const [modalRetiro, setModalRetiro] = useState(null)

  // Form apertura
  const [turno, setTurno] = useState('mañana')
  const [horaInicio, setHoraInicio] = useState('06:00')
  const [horaFin, setHoraFin] = useState('14:00')
  const [montoInicial, setMontoInicial] = useState('')
  const [notasApertura, setNotasApertura] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Conteo billetes cierre
  const [conteo, setConteo] = useState({})
  const [notasCierre, setNotasCierre] = useState('')

  // Movimiento de efectivo (entra o sale dinero que no es una venta)
  const [retiroMonto, setRetiroMonto] = useState('')
  const [retiroMotivo, setRetiroMotivo] = useState('')
  const [retiroTipo, setRetiroTipo] = useState('salida') // 'salida' | 'ingreso'

  useEffect(() => {
    if (!empresaId) return // esperar empresaId del usuario para las consultas filtradas

    // Cargar config (requerirCaja) por empresa
    getDoc(doc(db, 'configuracion', empresaId)).then(snap => {
      if (snap.exists()) setRequerirCaja(snap.data().requerirCaja || false)
    })

    // Cargar datos de la empresa (nombre, dirección) desde 'empresas' — donde los guarda el Panel One Geo.
    getDoc(doc(db, 'empresas', empresaId)).then(snap => {
      if (snap.exists()) {
        const e = snap.data()
        setEmpresa(prev => ({
          ...prev,
          empresaNombre: e.nombreComercial || e.nombre || prev.empresaNombre || '',
          direccion: e.direccion || prev.direccion || '',
        }))
      }
    }).catch(() => {})

    // Cajero y vendedor solo ven SUS cajas (montos, diferencias y movimientos de otros cajeros son
    // privados). Con dos filtros == no hace falta índice compuesto: se ordena aquí.
    const soloPropiasCaja = !esAdmin && (rol === 'cajero' || rol === 'vendedor')
    const qCajas = soloPropiasCaja
      ? query(collection(db, 'cajas'), where('empresaId', '==', empresaId), where('cajeroId', '==', userId))
      : query(collection(db, 'cajas'), where('empresaId', '==', empresaId), orderBy('fechaApertura', 'desc'))
    const unsubCajas = onSnapshot(qCajas,
      snap => {
        const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        if (soloPropiasCaja) arr.sort((a, b) => (b.fechaApertura?.seconds || 0) - (a.fechaApertura?.seconds || 0))
        setCajas(arr)
        setLoading(false)
      },
      () => setLoading(false)
    )
    if (user) {
      import('../firebase').then(({ db }) => {
        import('firebase/firestore').then(({ doc, getDoc }) => {
          getDoc(doc(db, 'configuracion', empresaId)).then(snap => {
            if (snap.exists()) setEmpresa(snap.data())
          })
        })
      })
    }
    return () => { unsubCajas() }
  }, [user, empresaId, esAdmin, rol, userId])

  // Ventas: solo desde hoy o desde la apertura de la caja abierta más vieja. Las cajas CERRADAS
  // ya guardan sus totales al cerrar, así que no hace falta leer todo el historial de ventas.
  const desdeVentasMs = Math.min(inicioDelDia().getTime(), ...cajas
    .filter(c => c.estado === 'abierta' && c.fechaApertura?.toDate)
    .map(c => c.fechaApertura.toDate().getTime()))
  useEffect(() => {
    if (!empresaId) return
    // Cajero/vendedor solo leen SUS ventas; admin y otros roles, todas.
    const soloPropias = !esAdmin && (rol === 'cajero' || rol === 'vendedor')
    return escuchar('ventas', { empresaId, cajeroId: soloPropias ? userId : undefined, filtro: rango('createdAt', new Date(desdeVentasMs)) }, setVentas)
  }, [empresaId, esAdmin, rol, userId, desdeVentasMs])

  // Calcular una caja: la fórmula vive en src/utils/caja.js (la usa también Reportes).
  const calcularVentasCaja = (caja) => calcularCaja(caja, ventas)

  // Total conteo billetes
  const totalConteo = DENOMINACIONES.reduce((sum, d) => sum + (parseFloat(conteo[d.valor] || 0) * d.valor), 0)

  // Apertura de caja
  const abrirCaja = async () => {
    if (!montoInicial) { orionAlert('Ingresa el monto inicial', { tipo: 'warning' }); return }
    // Verificar que el cajero no tenga ya una caja abierta
    const cajaYaAbierta = cajas.find(c =>
      c.estado === 'abierta' &&
      (c.cajeroId === user?.uid || c.cajeroNombre === userName)
    )
    if (cajaYaAbierta) {
      orionAlert('Ya tienes una caja abierta. Debes cerrarla antes de abrir otra.', { tipo: 'warning' })
      setModalApertura(false)
      return
    }
    setGuardando(true)
    try {
      await addDoc(collection(db, 'cajas'), {
        cajeroId: user?.uid || '',
        cajeroNombre: userName || user?.email || 'Cajero',
        turno, turnoHoraInicio: horaInicio, turnoHoraFin: horaFin,
        montoInicial: parseFloat(montoInicial) || 0,
        notasApertura, estado: 'abierta',
        retiros: [],
        empresaId,
        fechaApertura: serverTimestamp(),
        createdAt: serverTimestamp(),
      })
      setModalApertura(false)
      setMontoInicial(''); setNotasApertura(''); setTurno('mañana')
    } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
    setGuardando(false)
  }

  // Registrar un movimiento de efectivo (entra o sale dinero que no es una venta)
  const registrarMovimiento = async () => {
    if (!retiroMonto || !modalRetiro) return
    const monto = parseFloat(retiroMonto)
    if (!(monto > 0)) { orionAlert('El monto debe ser mayor que cero.', { tipo: 'warning' }); return }
    setGuardando(true)
    try {
      const movimientosEfectivo = [...(modalRetiro.movimientosEfectivo || []), {
        tipo: retiroTipo, monto, motivo: (retiroMotivo || '').trim(),
        fecha: new Date().toISOString(), usuario: userName || '', usuarioId: userId || '', origen: 'caja',
      }]
      await updateDoc(doc(db, 'cajas', modalRetiro.id), { movimientosEfectivo })
      setModalRetiro(null); setRetiroMonto(''); setRetiroMotivo(''); setRetiroTipo('salida')
    } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
    setGuardando(false)
  }

  // Cierre de caja
  const cerrarCaja = async () => {
    if (!modalCierre) return
    setGuardando(true)
    const datos = calcularVentasCaja(modalCierre)
    try {
      await updateDoc(doc(db, 'cajas', modalCierre.id), {
        estado: 'cerrada',
        montoEsperado: datos.montoEsperado,
        montoReal: totalConteo,
        diferencia: totalConteo - datos.montoEsperado,
        ventasEfectivo: datos.efectivo,
        ventasTarjeta: datos.tarjeta,
        ventasTransferencia: datos.transferencia,
        ventasCheque: datos.cheque,
        ventasCredito: datos.credito,
        totalVentas: datos.cantidad,
        totalRetiros: datos.totalRetiros,   // salidas de efectivo (movimientos + retiros viejos)
        totalIngresos: datos.ingresos,      // entradas de efectivo que no son ventas
        conteo,
        notasCierre,
        fechaCierre: serverTimestamp(),
      })
      setModalCierre(null); setConteo({}); setNotasCierre('')
    } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
    setGuardando(false)
  }

  // Stats globales
  // ── FILTROS ──
  const cajasFiltradas = cajas.filter(c => {
    // Filtro búsqueda
    if (filtroBusqueda && !c.cajeroNombre?.toLowerCase().includes(filtroBusqueda.toLowerCase())) return false

    // Filtro fecha
    const fecha = c.fechaApertura?.toDate?.() || new Date()
    const hoy = new Date()
    if (filtroFecha === 'hoy') {
      if (fecha.toDateString() !== hoy.toDateString()) return false
    } else if (filtroFecha === 'semana') {
      const semana = new Date(hoy); semana.setDate(hoy.getDate() - 7)
      if (fecha < semana) return false
    } else if (filtroFecha === 'mes') {
      const mes = new Date(hoy); mes.setDate(hoy.getDate() - 30)
      if (fecha < mes) return false
    }

    // Filtro estado
    if (filtroEstado === 'abiertas' && c.estado !== 'abierta') return false
    if (filtroEstado === 'cerradas' && c.estado !== 'cerrada') return false

    // Filtro diferencia (solo cajas cerradas)
    if (filtroDiferencia !== 'todas' && c.estado === 'cerrada') {
      const diff = (c.montoReal || 0) - (c.montoEsperado || 0)
      if (filtroDiferencia === 'cuadradas' && diff !== 0) return false
      if (filtroDiferencia === 'sobrante' && diff <= 0) return false
      if (filtroDiferencia === 'faltante' && diff >= 0) return false
    }

    return true
  })

  // Admin ve todas las cajas, cajero solo la suya
  const cajasAbiertas = cajasFiltradas.filter(c => {
    if (c.estado !== 'abierta') return false
    if (esAdmin) return true
    return c.cajeroId === user?.uid || c.cajeroNombre === userName
  })
  const cajasCerradas = cajasFiltradas.filter(c => c.estado === 'cerrada')
  const hoy = new Date().toDateString()
  const movimientosHoy = ventas.filter(v => v.createdAt?.toDate?.()?.toDateString() === hoy)
  const ventasHoy = movimientosHoy.filter(v => !esAnulada(v) && !esDevolucion(v))
  const totalHoy = movimientosHoy.reduce((s, v) => s + montoNeto(v), 0)   // devoluciones restan, anuladas no cuentan

  // ── Números de la franja de estado ──
  // Lo que DEBE haber en las gavetas abiertas ahora mismo (inicial + efectivo
  // + ingresos − salidas) y cómo cerraron las cajas del período filtrado.
  const esperadoEnGavetas = cajasAbiertas.reduce((s, c) => s + (calcularVentasCaja(c).montoEsperado || 0), 0)
  const difsCerradas = cajasCerradas.map(c => (Number(c.montoReal) || 0) - (Number(c.montoEsperado) || 0))
  const faltantes = difsCerradas.filter(d => d < 0).reduce((s, d) => s + Math.abs(d), 0)
  const sobrantes = difsCerradas.filter(d => d > 0).reduce((s, d) => s + d, 0)
  const difNeta = sobrantes - faltantes

  const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`

  const fmtHora = (ts) => ts?.toDate?.()?.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }) || '--:--'

  const generarCorteZ = () => {
    const hoy = new Date()
    const cajasHoy = cajas.filter(c => {
      const fecha = c.fechaApertura?.toDate?.()
      return fecha && fecha.toDateString() === hoy.toDateString()
    })

    const totalEfectivo = cajasHoy.reduce((s, c) => s + (c.ventasEfectivo || 0), 0)
    const totalTarjeta = cajasHoy.reduce((s, c) => s + (c.ventasTarjeta || 0), 0)
    const totalTransferencia = cajasHoy.reduce((s, c) => s + (c.ventasTransferencia || 0), 0)
    const totalVentas = cajasHoy.reduce((s, c) => s + ((c.ventasEfectivo||0)+(c.ventasTarjeta||0)+(c.ventasTransferencia||0)), 0)
    const totalTransacciones = cajasHoy.reduce((s, c) => s + (c.totalVentas || 0), 0)
    const totalRetiros = cajasHoy.reduce((s, c) => s + (c.totalRetiros || 0), 0)

    // Ventas abiertas (calcular en tiempo real)
    const cajasAbiertas = cajasHoy.filter(c => c.estado === 'abierta')
    cajasAbiertas.forEach(caja => {
      const datos = calcularVentasCaja(caja)
      caja._efectivo = datos.efectivo
      caja._tarjeta = datos.tarjeta
      caja._transferencia = datos.transferencia
      caja._total = datos.totalVentas
      caja._transacciones = datos.cantidad
    })
    const totalEfectivoAbiertas = cajasAbiertas.reduce((s, c) => s + (c._efectivo || 0), 0)
    const totalTarjetaAbiertas = cajasAbiertas.reduce((s, c) => s + (c._tarjeta || 0), 0)
    const totalTransAbiertas = cajasAbiertas.reduce((s, c) => s + (c._transferencia || 0), 0)
    const totalVentasAbiertas = cajasAbiertas.reduce((s, c) => s + (c._total || 0), 0)
    const totalTransAbiertas2 = cajasAbiertas.reduce((s, c) => s + (c._transacciones || 0), 0)

    const grandTotal = totalVentas + totalVentasAbiertas
    const grandEfectivo = totalEfectivo + totalEfectivoAbiertas
    const grandTarjeta = totalTarjeta + totalTarjetaAbiertas
    const grandTransferencia = totalTransferencia + totalTransAbiertas
    const grandTransacciones = totalTransacciones + totalTransAbiertas2
    const grandPromedio = grandTransacciones > 0 ? grandTotal / grandTransacciones : 0

    const filasDetalle = cajasHoy.map(c => {
      const esCerrada = c.estado === 'cerrada'
      const ef = esCerrada ? (c.ventasEfectivo||0) : (c._efectivo||0)
      const ta = esCerrada ? (c.ventasTarjeta||0) : (c._tarjeta||0)
      const tr = esCerrada ? (c.ventasTransferencia||0) : (c._transferencia||0)
      const tot = ef + ta + tr
      const diff = esCerrada ? ((c.montoReal||0) - (c.montoEsperado||0)) : null
      return `
        <tr>
          <td>${c.cajeroNombre}</td>
          <td style="text-align:center">${TURNOS.find(t=>t.value===c.turno)?.label || c.turno}</td>
          <td style="text-align:right">$${ef.toFixed(2)}</td>
          <td style="text-align:right">$${ta.toFixed(2)}</td>
          <td style="text-align:right">$${tr.toFixed(2)}</td>
          <td style="text-align:right;font-weight:700">$${tot.toFixed(2)}</td>
          <td style="text-align:center">${esCerrada ? (diff===0?'✓ OK':diff>0?'+$'+diff.toFixed(2):'-$'+Math.abs(diff).toFixed(2)) : '🟢 Abierta'}</td>
        </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<title>Corte Z - ${hoy.toLocaleDateString('es-SV')}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;font-size:13px;padding:20px;}
.header{text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #1B2E6B;}
.empresa{font-size:22px;font-weight:900;color:#1B2E6B;}
.titulo{font-size:16px;font-weight:700;color:#1B2E6B;margin:6px 0 4px;}
.fecha{font-size:12px;color:#6b7280;}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0;}
.stat{background:#f8faff;border:1px solid #e5eaf5;border-radius:10px;padding:14px;text-align:center;}
.stat-val{font-size:20px;font-weight:900;color:#1B2E6B;font-family:monospace;}
.stat-label{font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-top:4px;}
.section{margin:20px 0 10px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;}
table{width:100%;border-collapse:collapse;margin-bottom:20px;}
thead{background:#1B2E6B;color:#fff;}
th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;}
td{padding:9px 12px;border-bottom:1px solid #f0f4ff;font-size:12px;}
tr:last-child td{border-bottom:none;}
tr:nth-child(even) td{background:#fafbff;}
.metodos{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0;}
.metodo{background:#f8faff;border:1px solid #e5eaf5;border-radius:10px;padding:14px;text-align:center;}
.metodo-val{font-size:18px;font-weight:900;font-family:monospace;}
.metodo-label{font-size:11px;color:#6b7280;margin-top:4px;}
.total-box{background:#1B2E6B;color:#fff;border-radius:12px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:16px;}
.total-label{font-size:14px;font-weight:700;}
.total-val{font-size:28px;font-weight:900;font-family:monospace;}
.footer{text-align:center;margin-top:20px;padding-top:14px;border-top:1px solid #e5eaf5;font-size:11px;color:#9ca3af;}
.firma{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:20px 0;}
.firma-linea{border-top:1.5px solid #1B2E6B;padding-top:6px;margin-top:36px;font-size:11px;color:#6b7280;text-align:center;}
@media print{body{padding:10px;}@page{margin:15mm;}}
</style></head>
<body>
<div class="header">
  <div class="empresa">${empresa.empresaNombre || 'ORIÓN'}</div>
  <div class="titulo">CORTE Z — REPORTE DE CIERRE DEL DÍA</div>
  <div class="fecha">${hoy.toLocaleDateString('es-SV',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · Generado: ${hoy.toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'})}</div>
</div>

<div class="stats">
  <div class="stat"><div class="stat-val">$${grandTotal.toFixed(2)}</div><div class="stat-label">Total del día</div></div>
  <div class="stat"><div class="stat-val">${grandTransacciones}</div><div class="stat-label">Transacciones</div></div>
  <div class="stat"><div class="stat-val">$${grandPromedio.toFixed(2)}</div><div class="stat-label">Ticket promedio</div></div>
  <div class="stat"><div class="stat-val">${cajasHoy.length}</div><div class="stat-label">Cajas del día</div></div>
</div>

<div class="section">Desglose por método de pago</div>
<div class="metodos">
  <div class="metodo"><div class="metodo-val" style="color:#00C296">$${grandEfectivo.toFixed(2)}</div><div class="metodo-label">💵 Efectivo</div></div>
  <div class="metodo"><div class="metodo-val" style="color:#4A8FE8">$${grandTarjeta.toFixed(2)}</div><div class="metodo-label">💳 Tarjeta</div></div>
  <div class="metodo"><div class="metodo-val" style="color:#8b5cf6">$${grandTransferencia.toFixed(2)}</div><div class="metodo-label">📲 Transferencia</div></div>
</div>

<div class="section">Detalle por cajero</div>
<table>
  <thead>
    <tr><th>Cajero</th><th style="text-align:center">Turno</th><th style="text-align:right">Efectivo</th><th style="text-align:right">Tarjeta</th><th style="text-align:right">Transfer.</th><th style="text-align:right">Total</th><th style="text-align:center">Diferencia</th></tr>
  </thead>
  <tbody>${filasDetalle}</tbody>
</table>

${totalRetiros > 0 ? `<div class="section">Retiros del día</div><p style="font-size:13px;color:#6b7280;margin-bottom:16px">Total retirado de cajas: <strong style="color:#ef4444">$${totalRetiros.toFixed(2)}</strong></p>` : ''}

<div class="total-box">
  <div class="total-label">TOTAL NETO DEL DÍA</div>
  <div class="total-val">$${grandTotal.toFixed(2)}</div>
</div>

<div class="firma">
  <div class="firma-linea">Elaborado por / Administrador</div>
  <div class="firma-linea">Revisado por / Contador</div>
</div>

<div class="footer">
  <p>${empresa.empresaNombre || 'ORIÓN'} · NIT: ${empresa.nit||'---'} · NRC: ${empresa.nrc||'---'}</p>
  <p style="margin-top:4px">Generado por ORIÓN · ONE GEO SYSTEMS</p>
</div>
</body></html>`

    const iframe = crearIframeImpresion()   /* sandbox sin scripts (utils/html.js) */
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'
    document.body.appendChild(iframe)
    iframe.contentDocument.open()
    iframe.contentDocument.write(html)
    iframe.contentDocument.close()
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
        setTimeout(() => document.body.removeChild(iframe), 2000)
      }, 800)
    }
  }
  const fmtFecha = (ts) => ts?.toDate?.()?.toLocaleDateString('es-SV') || '—'

  return (
    <>
      <style>{cajaStyles}</style>

      {/* TOPBAR */}
      <div className="topbar" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">Caja</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {cajasAbiertas.length} caja(s) abierta(s)
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {esAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '8px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
                🔒 Requerir caja para vender
              </div>
              {/* Link, NO <a href>: con el ancla el navegador recargaba la app entera
                  (volvía a salir el splash de ORIÓN) en vez de cambiar de pantalla. */}
              <Link to="/config?seccion=pos" title="Se cambia en Configuración → Punto de venta"
                style={{ fontSize: 12, fontWeight: 700, color: requerirCaja ? 'var(--accent)' : 'var(--muted)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                {requerirCaja ? 'Activado' : 'Desactivado'} · cambiar ›
              </Link>
            </div>
          )}
          {esAdmin && <button className="cj-btn-linea" onClick={generarCorteZ}>Corte Z del día</button>}
          <button className="cj-btn-oro" onClick={() => setModalApertura(true)}>Abrir caja</button>
        </div>
      </div>

      {/* ══ FRANJA DE ESTADO — reemplaza las 4 tarjetas de colores ══ */}
      <div className="cj-franja">
        <button type="button" className={`cj-fr clic ${filtroEstado === 'abiertas' ? 'activa' : ''}`}
          onClick={() => setFiltroEstado(filtroEstado === 'abiertas' ? 'todas' : 'abiertas')} title="Ver solo las cajas abiertas">
          <div className="cj-fr-et">Cajas abiertas</div>
          <div className="cj-fr-fila">
            <div className="cj-fr-val">{cajasAbiertas.length}</div>
            <div className="cj-fr-sub">{new Set(cajasAbiertas.map(c => c.cajeroId)).size} cajero(s)</div>
          </div>
        </button>
        <div className="cj-fr">
          <div className="cj-fr-et">Debe haber en gaveta</div>
          <div className="cj-fr-val oro">{fmt(esperadoEnGavetas)}</div>
          <div className="cj-fr-sub">en las cajas abiertas</div>
        </div>
        <div className="cj-fr">
          <div className="cj-fr-et">Ventas de hoy</div>
          <div className="cj-fr-fila">
            <div className="cj-fr-val">{fmt(totalHoy)}</div>
            <div className="cj-fr-sub">{ventasHoy.length} venta(s)</div>
          </div>
        </div>
        <button type="button" className={`cj-fr clic ${filtroEstado === 'cerradas' ? 'activa' : ''}`}
          onClick={() => setFiltroEstado(filtroEstado === 'cerradas' ? 'todas' : 'cerradas')} title="Ver solo las cajas cerradas">
          <div className="cj-fr-et">Cajas cerradas</div>
          <div className="cj-fr-val">{cajasCerradas.length}</div>
          <div className="cj-fr-sub">del período que estás viendo</div>
        </button>
        <div className="cj-fr">
          <div className="cj-fr-et">Diferencia</div>
          <div className={`cj-fr-val ${difNeta < 0 ? 'malo' : ''}`}>{difNeta > 0 ? '+' : ''}{fmt(difNeta)}</div>
          <div className="cj-fr-sub">{faltantes > 0 ? `faltó ${fmt(faltantes)}` : 'sin faltantes'}{sobrantes > 0 ? ` · sobró ${fmt(sobrantes)}` : ''}</div>
        </div>
      </div>

      {/* ══ FILTROS — segmentados, con la identidad ══ */}
      <div className="cj-filtros">
        <div className="cj-seg">
          {[{ v: 'hoy', l: 'Hoy' }, { v: 'semana', l: 'Semana' }, { v: 'mes', l: 'Mes' }, { v: 'todos', l: 'Todos' }].map(o => (
            <button type="button" key={o.v} className={filtroFecha === o.v ? 'activa' : ''} onClick={() => setFiltroFecha(o.v)}>{o.l}</button>
          ))}
        </div>
        <div className="cj-seg">
          {[{ v: 'todas', l: 'Todas' }, { v: 'abiertas', l: 'Abiertas' }, { v: 'cerradas', l: 'Cerradas' }].map(o => (
            <button type="button" key={o.v} className={filtroEstado === o.v ? 'activa' : ''} onClick={() => setFiltroEstado(o.v)}>{o.l}</button>
          ))}
        </div>
        <div className="cj-seg">
          {[{ v: 'todas', l: 'Cuadre: todas' }, { v: 'cuadradas', l: 'Cuadradas' }, { v: 'sobrante', l: 'Sobrante' }, { v: 'faltante', l: 'Faltante' }].map(o => (
            <button type="button" key={o.v} className={filtroDiferencia === o.v ? 'activa' : ''} onClick={() => setFiltroDiferencia(o.v)}>{o.l}</button>
          ))}
        </div>
        <div className="cj-buscador">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <label htmlFor="cj-buscar" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Buscar cajero</label>
          <input id="cj-buscar" type="search" placeholder="Buscar cajero" value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)} />
        </div>
        {(filtroBusqueda || filtroEstado !== 'todas' || filtroFecha !== 'hoy' || filtroDiferencia !== 'todas') && (
          <button type="button" className="cj-limpiar"
            onClick={() => { setFiltroBusqueda(''); setFiltroEstado('todas'); setFiltroFecha('hoy'); setFiltroDiferencia('todas') }}>Limpiar filtros</button>
        )}
      </div>

      {/* CAJAS ABIERTAS */}
      {cajasAbiertas.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 14 }}>
            Cajas abiertas
          </div>
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>TURNO</th><th>CAJERO</th><th>ABRIÓ</th>
                    <th>EFECTIVO</th><th>TARJETA</th><th>RETIROS</th>
                    <th>ESPERADO</th><th>ESTADO</th><th>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {cajasAbiertas.map(caja => {
                    const datos = calcularVentasCaja(caja)
                    return (
                      <tr key={caja.id}>
                        <td><span style={{ fontSize: 12 }}>{TURNOS.find(t => t.value === caja.turno)?.icon} {caja.turno}</span></td>
                        <td style={{ fontWeight: 600 }}>{caja.cajeroNombre}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtHora(caja.fechaApertura)}</td>
                        <td className="amount" style={{ color: '#00C296' }}>{fmt(datos.efectivo)}</td>
                        <td className="amount" style={{ color: '#4A8FE8' }}>{fmt(datos.tarjeta)}</td>
                        <td className="amount" style={{ color: datos.totalRetiros > 0 ? '#ef4444' : 'var(--muted)' }}>
                          {datos.totalRetiros > 0 ? `-${fmt(datos.totalRetiros)}` : fmt(0)}
                        </td>
                        <td className="amount" style={{ fontWeight: 800, color: 'var(--accent)' }}>{fmt(datos.montoEsperado)}</td>
                        <td><span className="caja-estado-abierta"><span className="caja-dot"/> Abierta</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-ghost btn-sm" title="Detalle" onClick={() => setModalDetalle(caja)}>👁️</button>
                            <button className="btn btn-ghost btn-sm" title="Movimiento de efectivo (entrada o salida que no es venta)" onClick={() => { setRetiroTipo('salida'); setRetiroMonto(''); setRetiroMotivo(''); setModalRetiro(caja) }}>💵</button>
                            <button className="btn btn-danger btn-sm" title="Cerrar caja" onClick={() => { setModalCierre(caja); setConteo({}) }}>🔒</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* CAJAS CERRADAS HOY */}
      {cajasCerradas.filter(c => c.fechaCierre?.toDate?.()?.toDateString() === hoy).length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 14, marginTop: 8 }}>
            🔴 Cerradas Hoy
          </div>
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>TURNO</th><th>CAJERO</th><th>CERRÓ</th>
                    <th>VENTAS</th><th>ESPERADO</th><th>CONTADO</th>
                    <th>DIFERENCIA</th><th>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {cajasCerradas.filter(c => c.fechaCierre?.toDate?.()?.toDateString() === hoy).map(caja => {
                    const diferencia = (caja.montoReal || 0) - (caja.montoEsperado || 0)
                    const colorDif = diferencia === 0 ? '#00C296' : diferencia > 0 ? '#4A8FE8' : '#ef4444'
                    return (
                      <tr key={caja.id}>
                        <td><span style={{ fontSize: 12 }}>{TURNOS.find(t => t.value === caja.turno)?.icon} {caja.turno}</span></td>
                        <td style={{ fontWeight: 600 }}>{caja.cajeroNombre}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtHora(caja.fechaCierre)}</td>
                        <td className="amount">{fmt((caja.ventasEfectivo || 0) + (caja.ventasTarjeta || 0) + (caja.ventasTransferencia || 0))}</td>
                        <td className="amount">{fmt(caja.montoEsperado)}</td>
                        <td className="amount">{fmt(caja.montoReal)}</td>
                        <td>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: colorDif }}>
                            {diferencia >= 0 ? '+' : ''}{fmt(diferencia)}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-ghost btn-sm" title="Ver detalle" onClick={() => setModalDetalle(caja)}>👁️</button>
                            <button className="btn btn-ghost btn-sm" title="Imprimir reporte" onClick={() => imprimirReporte(caja, empresa)}>🖨️</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* HISTORIAL */}
      {cajasCerradas.filter(c => c.fechaCierre?.toDate?.()?.toDateString() !== hoy).length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 14, marginTop: 8 }}>
            Historial
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>FECHA</th><th>CAJERO</th><th>TURNO</th>
                    <th>VENTAS</th><th>ESPERADO</th><th>CONTADO</th>
                    <th>DIFERENCIA</th><th>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {cajasCerradas.filter(c => c.fechaCierre?.toDate?.()?.toDateString() !== hoy)
                    .slice(0, 30).map(caja => {
                    const diferencia = (caja.montoReal || 0) - (caja.montoEsperado || 0)
                    return (
                      <tr key={caja.id}>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtFecha(caja.fechaApertura)}</td>
                        <td style={{ fontWeight: 600 }}>{caja.cajeroNombre}</td>
                        <td>
                          <span style={{ fontSize: 12 }}>
                            {TURNOS.find(t => t.value === caja.turno)?.icon} {caja.turno}
                          </span>
                        </td>
                        <td className="amount">{fmt((caja.ventasEfectivo||0)+(caja.ventasTarjeta||0)+(caja.ventasTransferencia||0))}</td>
                        <td className="amount">{fmt(caja.montoEsperado)}</td>
                        <td className="amount">{fmt(caja.montoReal)}</td>
                        <td>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: diferencia === 0 ? '#00C296' : diferencia > 0 ? '#4A8FE8' : '#ef4444' }}>
                            {diferencia >= 0 ? '+' : ''}{fmt(diferencia)}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setModalDetalle(caja)}>👁️</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => imprimirReporte(caja, empresa)}>🖨️</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {loading && (
        <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">Cargando cajas...</div></div>
      )}

      {!loading && cajasFiltradas.length === 0 && (
        <div className="cj-vacio">
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--border2)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>
          {cajas.length === 0 ? (<>
            <h3>Todavía no se ha abierto una caja</h3>
            <p>La caja se abre al empezar el turno, con el sencillo que hay en la gaveta. Desde ahí ORIÓN lleva la cuenta de lo que debería haber al cerrar.</p>
            <button className="cj-btn-oro" style={{ marginTop: 18 }} onClick={() => setModalApertura(true)}>Abrir la primera caja</button>
          </>) : (<>
            <h3>No hay cajas en este período</h3>
            <p>Nadie abrió caja en {filtroFecha === 'hoy' ? 'el día de hoy' : filtroFecha === 'semana' ? 'esta semana' : 'este mes'}, o los filtros de arriba están dejando todo fuera.</p>
            <div style={{ display: 'flex', gap: 9, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="cj-btn-linea" onClick={() => { setFiltroFecha('todos'); setFiltroEstado('todas'); setFiltroDiferencia('todas'); setFiltroBusqueda('') }}>Ver todas las cajas</button>
              <button className="cj-btn-oro" onClick={() => setModalApertura(true)}>Abrir caja</button>
            </div>
          </>)}
        </div>
      )}

      {/* ── MODAL APERTURA ── */}
      {modalApertura && (
        <div className="modal-overlay">
          <div className="modal modal-caja" onClick={e => e.stopPropagation()}>
            <div className="modal-title">💰 Abrir Caja</div>

            <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 18, fontSize: 13 }}>
              <div style={{ fontWeight: 700 }}>{userName || user?.email}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Cajero — {new Date().toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            </div>

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Turno</label>
              <div className="turno-grid">
                {TURNOS.map(t => (
                  <div key={t.value} className={`turno-btn ${turno === t.value ? 'active' : ''}`}
                    onClick={() => {
                      setTurno(t.value)
                      // Precargar las horas por defecto del turno (siguen siendo editables)
                      const [ini, fin] = (t.hora || '').split(' - ')
                      if (ini) setHoraInicio(ini.trim())
                      if (fin) setHoraFin(fin.trim())
                    }}>
                    <div className="turno-icon">{t.icon}</div>
                    <div className="turno-label">{t.label}</div>
                    <div className="turno-hora">{t.hora}</div>
                  </div>
                ))}
              </div>
              {/* Horas editables del turno */}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Hora inicio</label>
                  <input type="time" className="billete-input" style={{ width: '100%', height: 38 }}
                    value={horaInicio} onChange={e => setHoraInicio(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>Hora fin</label>
                  <input type="time" className="billete-input" style={{ width: '100%', height: 38 }}
                    value={horaFin} onChange={e => setHoraFin(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Monto inicial en efectivo *</label>
              <input className="input" type="number" step="0.01" placeholder="0.00"
                value={montoInicial} onChange={e => setMontoInicial(e.target.value)}
                style={{ fontSize: 20, fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'center' }}/>
            </div>

            <div className="form-group" style={{ marginBottom: 18 }}>
              <label className="form-label">Notas (opcional)</label>
              <input className="input" placeholder="Observaciones de apertura..."
                value={notasApertura} onChange={e => setNotasApertura(e.target.value)}/>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalApertura(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={abrirCaja} disabled={guardando || !montoInicial}>
                {guardando ? '⏳...' : '💰 Abrir Caja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CIERRE ── */}
      {modalCierre && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560, maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ marginBottom: 8 }}>🔒 Cierre de Caja</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
              <strong style={{ color: 'var(--text)' }}>{modalCierre.cajeroNombre}</strong> ·
              Turno {modalCierre.turno} · Abierta {fmtHora(modalCierre.fechaApertura)}
            </div>

            {/* Resumen esperado — compacto en una fila */}
            {(() => {
              const datos = calcularVentasCaja(modalCierre)
              return (
                <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, fontFamily: 'var(--mono)' }}>
                    <span>Inicial <b>{fmt(modalCierre.montoInicial)}</b></span>
                    <span style={{ color: '#00C296' }}>+ Efec {fmt(datos.efectivo)}</span>
                    <span style={{ color: '#4A8FE8' }}>+ Tarj {fmt(datos.tarjeta)}</span>
                    {datos.ingresos > 0 && <span style={{ color: '#00C296' }}>+ Ingresos {fmt(datos.ingresos)}</span>}
                    <span style={{ color: '#ef4444' }}>− Salidas {fmt(datos.totalRetiros)}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Efectivo esperado</div>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 18, color: 'var(--accent)' }}>{fmt(datos.montoEsperado)}</div>
                  </div>
                </div>
              )
            })()}

            {/* Conteo de billetes */}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Conteo de billetes y monedas
            </div>
            <div className="billetes-grid">
              {DENOMINACIONES.map(d => {
                const cantidad = parseFloat(conteo[d.valor] || 0)
                const subtotal = cantidad * d.valor
                return (
                  <div key={d.valor} className="billete-row">
                    <span className="billete-denom">{d.label}</span>
                    <input className="billete-input" type="number" min="0"
                      placeholder="0"
                      value={conteo[d.valor] || ''}
                      onChange={e => setConteo(c => ({ ...c, [d.valor]: e.target.value }))}/>
                    <span className="billete-subtotal">{subtotal > 0 ? fmt(subtotal) : '—'}</span>
                  </div>
                )
              })}
            </div>

            {/* Total conteo */}
            <div className="conteo-total">
              <span className="conteo-total-label">Total contado en caja</span>
              <span className="conteo-total-val">{fmt(totalConteo)}</span>
            </div>

            {/* Diferencia */}
            {totalConteo > 0 && (() => {
              const datos = calcularVentasCaja(modalCierre)
              const diferencia = totalConteo - datos.montoEsperado
              return (
                <div className={`diferencia-box ${diferencia === 0 ? 'diferencia-ok' : diferencia > 0 ? 'diferencia-over' : 'diferencia-under'}`}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {diferencia === 0 ? '✅ Caja cuadrada' : diferencia > 0 ? '⬆️ Sobrante' : '⬇️ Faltante'}
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 900, fontSize: 20 }}>
                    {diferencia >= 0 ? '+' : ''}{fmt(diferencia)}
                  </span>
                </div>
              )
            })()}

            <div className="form-group" style={{ marginTop: 10 }}>
              <label className="form-label">Notas de cierre</label>
              <input className="input" placeholder="Observaciones del turno..."
                value={notasCierre} onChange={e => setNotasCierre(e.target.value)}/>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalCierre(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={cerrarCaja} disabled={guardando}>
                {guardando ? '⏳...' : '🔒 Cerrar Caja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RETIRO ── */}
      {modalRetiro && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">💵 Movimiento de efectivo</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              Dinero que entra o sale de la caja de <strong style={{ color: 'var(--text)' }}>{modalRetiro.cajeroNombre}</strong> sin ser una venta. Se descuenta o se suma al efectivo esperado del cierre.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[
                { v: 'salida', t: '➖ Salió dinero', c: '#ef4444' },
                { v: 'ingreso', t: '➕ Entró dinero', c: '#00C296' },
              ].map(o => (
                <div key={o.v} onClick={() => { setRetiroTipo(o.v); setRetiroMotivo('') }}
                  style={{
                    padding: '12px 8px', borderRadius: 10, textAlign: 'center', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                    border: `2px solid ${retiroTipo === o.v ? o.c : 'var(--border)'}`,
                    background: retiroTipo === o.v ? `${o.c}18` : 'var(--surface2)',
                    color: retiroTipo === o.v ? o.c : 'var(--text2)',
                  }}>{o.t}</div>
              ))}
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Monto *</label>
              <input className="input" type="number" step="0.01" min="0" placeholder="0.00"
                value={retiroMonto} onChange={e => setRetiroMonto(e.target.value)}
                style={{ fontSize: 20, fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'center' }}/>
            </div>

            <div className="form-group" style={{ marginBottom: 18 }}>
              <label className="form-label">Motivo *</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {(retiroTipo === 'salida'
                  ? ['Pago a proveedor', 'Gasto menor', 'Vale o préstamo', 'Depósito al banco', 'Retiro del dueño']
                  : ['Fondo adicional', 'Abono de cliente', 'Devolución de vale', 'Otro ingreso']
                ).map(m => (
                  <span key={m} onClick={() => setRetiroMotivo(m)}
                    style={{
                      padding: '5px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                      border: `1.5px solid ${retiroMotivo === m ? 'var(--accent)' : 'var(--border)'}`,
                      background: retiroMotivo === m ? 'rgba(65,120,212,0.12)' : 'var(--surface2)',
                      color: retiroMotivo === m ? 'var(--accent)' : 'var(--text2)',
                    }}>{m}</span>
                ))}
              </div>
              <input className="input" placeholder="O escribí el motivo…"
                value={retiroMotivo} onChange={e => setRetiroMotivo(e.target.value)}/>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { setModalRetiro(null); setRetiroMonto(''); setRetiroMotivo(''); setRetiroTipo('salida') }}>Cancelar</button>
              <button className="btn btn-primary" onClick={registrarMovimiento} disabled={guardando || !retiroMonto || !retiroMotivo}>
                {guardando ? '⏳...' : retiroTipo === 'salida' ? '➖ Registrar salida' : '➕ Registrar ingreso'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DETALLE ── */}
      {modalDetalle && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div className="modal-title" style={{ marginBottom: 0 }}>📋 Detalle de Caja</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalDetalle(null)}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Cajero', value: modalDetalle.cajeroNombre },
                { label: 'Turno', value: `${TURNOS.find(t => t.value === modalDetalle.turno)?.icon} ${modalDetalle.turno}` },
                { label: 'Apertura', value: fmtHora(modalDetalle.fechaApertura) },
                { label: 'Cierre', value: modalDetalle.fechaCierre ? fmtHora(modalDetalle.fechaCierre) : '—' },
                { label: 'Monto inicial', value: fmt(modalDetalle.montoInicial) },
                { label: 'Estado', value: modalDetalle.estado === 'abierta' ? '🟢 Abierta' : '🔴 Cerrada' },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Resumen ventas */}
            {modalDetalle.estado === 'cerrada' && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Resumen de ventas</div>
                <div className="resumen-metodos" style={{ marginBottom: 16 }}>
                  {METODOS_PAGO.map(m => (
                    <div key={m.value} className="metodo-box">
                      <div className="metodo-icon">{m.icon}</div>
                      <div className="metodo-val" style={{ color: m.color }}>
                        {fmt(m.value === 'efectivo' ? modalDetalle.ventasEfectivo : m.value === 'tarjeta' ? modalDetalle.ventasTarjeta : modalDetalle.ventasTransferencia)}
                      </div>
                      <div className="metodo-label">{m.label}</div>
                    </div>
                  ))}
                </div>

                {/* Diferencia */}
                {(() => {
                  const diferencia = (modalDetalle.montoReal || 0) - (modalDetalle.montoEsperado || 0)
                  return (
                    <div className={`diferencia-box ${diferencia === 0 ? 'diferencia-ok' : diferencia > 0 ? 'diferencia-over' : 'diferencia-under'}`} style={{ marginBottom: 16 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{diferencia === 0 ? '✅ Caja cuadrada' : diferencia > 0 ? '⬆️ Sobrante' : '⬇️ Faltante'}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Esperado: {fmt(modalDetalle.montoEsperado)} · Contado: {fmt(modalDetalle.montoReal)}</div>
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 900, fontSize: 20 }}>
                        {diferencia >= 0 ? '+' : ''}{fmt(diferencia)}
                      </span>
                    </div>
                  )
                })()}
              </>
            )}

            {/* Retiros */}
            {(modalDetalle.retiros || []).length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Retiros</div>
                <div className="timeline" style={{ marginBottom: 16 }}>
                  {modalDetalle.retiros.map((r, i) => (
                    <div key={i} className="timeline-item">
                      <div className="timeline-dot" style={{ background: '#ef4444' }}/>
                      <div className="timeline-content">
                        <div className="timeline-title">{r.motivo}</div>
                        <div className="timeline-sub">{r.cajero} · {new Date(r.fecha).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <div className="timeline-amount" style={{ color: '#ef4444' }}>-{fmt(r.monto)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Movimientos de efectivo: dinero que entró o salió sin ser venta */}
            {(modalDetalle.movimientosEfectivo || []).length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Movimientos de efectivo</div>
                <div className="timeline" style={{ marginBottom: 16 }}>
                  {modalDetalle.movimientosEfectivo.map((m, i) => {
                    const esIngreso = m.tipo === 'ingreso'
                    return (
                      <div key={i} className="timeline-item">
                        <div className="timeline-dot" style={{ background: esIngreso ? '#00C296' : '#ef4444' }}/>
                        <div className="timeline-content">
                          <div className="timeline-title">{m.motivo || (esIngreso ? 'Ingreso de efectivo' : 'Salida de efectivo')}</div>
                          <div className="timeline-sub">
                            {m.usuario} · {new Date(m.fecha).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}
                            {m.origen === 'gaveta' && ' · desde la gaveta'}
                          </div>
                        </div>
                        <div className="timeline-amount" style={{ color: esIngreso ? '#00C296' : '#ef4444' }}>
                          {esIngreso ? '+' : '−'}{fmt(m.monto)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Aperturas de gaveta sin venta (botón 🔓 Gaveta del POS) */}
            {(modalDetalle.aperturasGaveta || []).length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Aperturas de gaveta sin venta</div>
                <div className="timeline" style={{ marginBottom: 16 }}>
                  {modalDetalle.aperturasGaveta.map((a, i) => (
                    <div key={i} className="timeline-item">
                      <div className="timeline-dot" style={{ background: '#f59e0b' }}/>
                      <div className="timeline-content">
                        <div className="timeline-title">{a.motivo || 'Sin motivo indicado'}</div>
                        <div className="timeline-sub">{a.usuario} · {new Date(a.fecha).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <div className="timeline-amount" style={{ color: '#f59e0b' }}>🔓</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {modalDetalle.notasCierre && (
              <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
                📝 {modalDetalle.notasCierre}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalDetalle(null)}>Cerrar</button>
              {modalDetalle.estado === 'cerrada' && (
                <button className="btn btn-primary" onClick={() => { imprimirReporte(modalDetalle, empresa); setModalDetalle(null) }}>
                  🖨️ Imprimir Reporte
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}