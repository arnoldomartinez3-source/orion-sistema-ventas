import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { getDoc } from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'
import {
  collection, addDoc, updateDoc, onSnapshot,
  doc, query, where, orderBy, serverTimestamp, getDocs
} from 'firebase/firestore'

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
  { valor: 1,    label: '$1',     tipo: 'billete' },
  { valor: 0.25, label: '$0.25',  tipo: 'moneda'  },
  { valor: 0.10, label: '$0.10',  tipo: 'moneda'  },
  { valor: 0.05, label: '$0.05',  tipo: 'moneda'  },
]

const cajaStyles = `
  /* STATS */
  .caja-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 24px; }
  @media (max-width: 900px) { .caja-stats { grid-template-columns: repeat(2,1fr); } }
  .caja-stat { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; padding: 18px 20px; position: relative; overflow: hidden; box-shadow: 0 4px 20px var(--shadow2); }
  .caja-stat::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background: var(--cs-color, var(--accent)); }
  .caja-stat-val { font-size: 26px; font-weight: 800; font-family: var(--mono); margin: 6px 0 3px; letter-spacing: -1px; }
  .caja-stat-label { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; }
  .caja-stat-sub { font-size: 12px; color: var(--muted); margin-top: 3px; }

  /* GRID CAJAS */
  .cajas-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 24px; }
  @media (max-width: 1100px) { .cajas-grid { grid-template-columns: repeat(2,1fr); } }
  @media (max-width: 650px) { .cajas-grid { grid-template-columns: 1fr; } }

  /* TARJETA CAJA */
  .caja-card {
    background: var(--surface); border: 1.5px solid var(--border);
    border-radius: 18px; overflow: hidden;
    box-shadow: 0 4px 24px var(--shadow2);
    transition: all 0.2s;
  }
  .caja-card:hover { transform: translateY(-2px); border-color: var(--border2); }
  .caja-card-header {
    padding: 16px 20px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1.5px solid var(--border);
  }
  .caja-card-body { padding: 16px 20px; }
  .caja-card-footer { padding: 12px 20px; border-top: 1.5px solid var(--border); display: flex; gap: 8px; }

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
  .billetes-grid { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
  .billete-row {
    display: flex; align-items: center; gap: 12px;
    background: var(--surface2); border: 1.5px solid var(--border);
    border-radius: 10px; padding: 10px 14px;
    transition: border-color 0.15s;
  }
  .billete-row:focus-within { border-color: var(--accent); }
  .billete-denom { font-family: var(--mono); font-weight: 800; font-size: 14px; min-width: 40px; }
  .billete-tipo { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; flex: 1; }
  .billete-input { width: 70px; height: 34px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); font-family: var(--mono); font-size: 14px; font-weight: 700; text-align: center; outline: none; }
  .billete-input:focus { border-color: var(--accent); }
  .billete-subtotal { font-family: var(--mono); font-size: 13px; font-weight: 700; color: var(--accent); min-width: 70px; text-align: right; }

  /* TOTAL CONTEO */
  .conteo-total { background: var(--glow); border: 1.5px solid var(--accent); border-radius: 12px; padding: 14px 18px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center; }
  .conteo-total-label { font-size: 13px; font-weight: 700; color: var(--accent); }
  .conteo-total-val { font-family: var(--mono); font-size: 22px; font-weight: 900; color: var(--accent); }

  /* DIFERENCIA */
  .diferencia-box { border-radius: 12px; padding: 14px 18px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center; }
  .diferencia-ok { background: rgba(0,194,150,0.1); border: 1.5px solid rgba(0,194,150,0.3); }
  .diferencia-over { background: rgba(74,143,232,0.1); border: 1.5px solid rgba(74,143,232,0.3); }
  .diferencia-under { background: rgba(239,68,68,0.1); border: 1.5px solid rgba(239,68,68,0.3); }

  /* RESUMEN TURNO */
  .resumen-metodos { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin: 12px 0; }
  .metodo-box { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 10px; text-align: center; }
  .metodo-icon { font-size: 18px; margin-bottom: 4px; }
  .metodo-val { font-family: var(--mono); font-size: 14px; font-weight: 800; }
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
<div class="row"><span>Retiros:</span><span>-$${(caja.totalRetiros||0).toFixed(2)}</span></div>
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
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 600)
  }
}

export default function Caja() {
  const { user } = useAuth()
  const { puede, userName, usuarioData, esAdmin } = usePermisos()

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
  const [montoInicial, setMontoInicial] = useState('')
  const [notasApertura, setNotasApertura] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Conteo billetes cierre
  const [conteo, setConteo] = useState({})
  const [notasCierre, setNotasCierre] = useState('')

  // Retiro
  const [retiroMonto, setRetiroMonto] = useState('')
  const [retiroMotivo, setRetiroMotivo] = useState('')

  useEffect(() => {
    // Cargar config
    getDoc(doc(db, 'configuracion', user.uid)).then(snap => {
      if (snap.exists()) setRequerirCaja(snap.data().requerirCaja || false)
    })

    const unsubCajas = onSnapshot(
      query(collection(db, 'cajas'), orderBy('fechaApertura', 'desc')),
      snap => { setCajas(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) }
    )
    const unsubVentas = onSnapshot(collection(db, 'ventas'), snap => {
      setVentas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    if (user) {
      import('../firebase').then(({ db }) => {
        import('firebase/firestore').then(({ doc, getDoc }) => {
          getDoc(doc(db, 'configuracion', user.uid)).then(snap => {
            if (snap.exists()) setEmpresa(snap.data())
          })
        })
      })
    }
    return () => { unsubCajas(); unsubVentas() }
  }, [user])

  // Calcular ventas de una caja
  const calcularVentasCaja = (caja) => {
    const ventasCaja = ventas.filter(v => {
      if (!v.createdAt) return false
      const fechaVenta = v.createdAt.toDate?.() || new Date()
      const apertura = caja.fechaApertura?.toDate?.() || new Date(0)
      const cierre = caja.fechaCierre?.toDate?.() || new Date()
      const cajeroMatch = v.cajeroId === caja.cajeroId || v.cajero === caja.cajeroNombre
      return cajeroMatch && fechaVenta >= apertura && (caja.estado === 'abierta' || fechaVenta <= cierre)
    })

    const efectivo = ventasCaja.filter(v => !v.metodoPago || v.metodoPago === 'efectivo').reduce((s, v) => s + (v.total || 0), 0)
    const tarjeta = ventasCaja.filter(v => v.metodoPago === 'tarjeta').reduce((s, v) => s + (v.total || 0), 0)
    const transferencia = ventasCaja.filter(v => v.metodoPago === 'transferencia').reduce((s, v) => s + (v.total || 0), 0)
    const totalVentas = efectivo + tarjeta + transferencia
    const totalRetiros = (caja.retiros || []).reduce((s, r) => s + (r.monto || 0), 0)
    const montoEsperado = (caja.montoInicial || 0) + efectivo - totalRetiros

    return { efectivo, tarjeta, transferencia, totalVentas, totalRetiros, montoEsperado, cantidad: ventasCaja.length, ventasCaja }
  }

  // Total conteo billetes
  const totalConteo = DENOMINACIONES.reduce((sum, d) => sum + (parseFloat(conteo[d.valor] || 0) * d.valor), 0)

  // Apertura de caja
  const abrirCaja = async () => {
    if (!montoInicial) { alert('Ingresa el monto inicial'); return }
    // Verificar que el cajero no tenga ya una caja abierta
    const cajaYaAbierta = cajas.find(c =>
      c.estado === 'abierta' &&
      (c.cajeroId === user?.uid || c.cajeroNombre === userName)
    )
    if (cajaYaAbierta) {
      alert('Ya tienes una caja abierta. Debes cerrarla antes de abrir otra.')
      setModalApertura(false)
      return
    }
    setGuardando(true)
    try {
      await addDoc(collection(db, 'cajas'), {
        cajeroId: user?.uid || '',
        cajeroNombre: userName || user?.email || 'Cajero',
        turno, montoInicial: parseFloat(montoInicial) || 0,
        notasApertura, estado: 'abierta',
        retiros: [],
        fechaApertura: serverTimestamp(),
        createdAt: serverTimestamp(),
      })
      setModalApertura(false)
      setMontoInicial(''); setNotasApertura(''); setTurno('mañana')
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  // Registrar retiro
  const registrarRetiro = async () => {
    if (!retiroMonto || !modalRetiro) return
    setGuardando(true)
    try {
      const retiros = [...(modalRetiro.retiros || []), {
        monto: parseFloat(retiroMonto), motivo: retiroMotivo,
        fecha: new Date().toISOString(), cajero: userName
      }]
      await updateDoc(doc(db, 'cajas', modalRetiro.id), { retiros })
      setModalRetiro(null); setRetiroMonto(''); setRetiroMotivo('')
    } catch (e) { alert('Error: ' + e.message) }
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
        totalVentas: datos.cantidad,
        totalRetiros: datos.totalRetiros,
        conteo,
        notasCierre,
        fechaCierre: serverTimestamp(),
      })
      setModalCierre(null); setConteo({}); setNotasCierre('')
    } catch (e) { alert('Error: ' + e.message) }
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
  const ventasHoy = ventas.filter(v => v.createdAt?.toDate?.()?.toDateString() === hoy)
  const totalHoy = ventasHoy.reduce((s, v) => s + (v.total || 0), 0)

  const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`

  const toggleRequerirCaja = async () => {
    const nuevo = !requerirCaja
    setRequerirCaja(nuevo)
    try {
      await import('firebase/firestore').then(({ doc: fDoc, setDoc } ) => {
        setDoc(fDoc(db, 'configuracion', user.uid), { requerirCaja: nuevo }, { merge: true })
      })
    } catch (e) { console.error(e) }
  }
  const fmtHora = (ts) => ts?.toDate?.()?.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }) || '--:--'
  const fmtFecha = (ts) => ts?.toDate?.()?.toLocaleDateString('es-SV') || '—'

  return (
    <>
      <style>{cajaStyles}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">💰 Caja</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {cajasAbiertas.length} caja(s) abierta(s)
            <span className="firebase-badge">🔥 Firebase</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {esAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '8px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
                🔒 Requerir caja para vender
              </div>
              <div onClick={toggleRequerirCaja} style={{ width: 44, height: 24, borderRadius: 99, cursor: 'pointer', background: requerirCaja ? 'var(--accent)' : 'var(--border2)', position: 'relative', transition: 'all 0.25s', flexShrink: 0, boxShadow: requerirCaja ? '0 0 10px rgba(0,212,170,0.4)' : 'none' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: requerirCaja ? 23 : 3, transition: 'left 0.25s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}/>
              </div>
            </div>
          )}
          <button className="btn btn-primary" onClick={() => setModalApertura(true)}>
            + Abrir Caja
          </button>
        </div>
      </div>

      {/* FILTROS */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>

        {/* Búsqueda */}
        <input className="input" style={{ maxWidth: 220 }}
          placeholder="🔍 Buscar cajero..."
          value={filtroBusqueda}
          onChange={e => setFiltroBusqueda(e.target.value)}/>

        {/* Fecha */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { value: 'hoy',    label: 'Hoy' },
            { value: 'semana', label: 'Semana' },
            { value: 'mes',    label: 'Mes' },
            { value: 'todos',  label: 'Todos' },
          ].map(f => (
            <button key={f.value}
              className={`btn btn-sm ${filtroFecha === f.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFiltroFecha(f.value)}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Estado */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { value: 'todas',   label: '📋 Todas' },
            { value: 'abiertas',label: '🟢 Abiertas' },
            { value: 'cerradas',label: '🔴 Cerradas' },
          ].map(f => (
            <button key={f.value}
              className={`btn btn-sm ${filtroEstado === f.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFiltroEstado(f.value)}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Diferencia */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { value: 'todas',     label: '💰 Todas' },
            { value: 'cuadradas', label: '✅ Cuadradas' },
            { value: 'sobrante',  label: '⬆️ Sobrante' },
            { value: 'faltante',  label: '⬇️ Faltante' },
          ].map(f => (
            <button key={f.value}
              className={`btn btn-sm ${filtroDiferencia === f.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFiltroDiferencia(f.value)}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Limpiar filtros */}
        {(filtroBusqueda || filtroEstado !== 'todas' || filtroFecha !== 'hoy' || filtroDiferencia !== 'todas') && (
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
            onClick={() => { setFiltroBusqueda(''); setFiltroEstado('todas'); setFiltroFecha('hoy'); setFiltroDiferencia('todas') }}>
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* STATS */}
      <div className="caja-stats">
        <div className="caja-stat" style={{ '--cs-color': '#00C296' }}>
          <div className="caja-stat-label">Cajas Abiertas</div>
          <div className="caja-stat-val" style={{ color: '#00C296' }}>{cajasAbiertas.length}</div>
          <div className="caja-stat-sub">en este momento</div>
        </div>
        <div className="caja-stat" style={{ '--cs-color': '#4A8FE8' }}>
          <div className="caja-stat-label">Ventas Hoy</div>
          <div className="caja-stat-val" style={{ color: '#4A8FE8' }}>{fmt(totalHoy)}</div>
          <div className="caja-stat-sub">{ventasHoy.length} transacciones</div>
        </div>
        <div className="caja-stat" style={{ '--cs-color': '#f59e0b' }}>
          <div className="caja-stat-label">Cajas Cerradas</div>
          <div className="caja-stat-val" style={{ color: '#f59e0b' }}>{cajasCerradas.length}</div>
          <div className="caja-stat-sub">historial total</div>
        </div>
        <div className="caja-stat" style={{ '--cs-color': '#8b5cf6' }}>
          <div className="caja-stat-label">Cajeros Activos</div>
          <div className="caja-stat-val" style={{ color: '#8b5cf6' }}>
            {new Set(cajasAbiertas.map(c => c.cajeroId)).size}
          </div>
          <div className="caja-stat-sub">trabajando ahora</div>
        </div>
      </div>

      {/* CAJAS ABIERTAS */}
      {cajasAbiertas.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 14 }}>
            🟢 Cajas Abiertas
          </div>
          <div className="cajas-grid">
            {cajasAbiertas.map(caja => {
              const datos = calcularVentasCaja(caja)
              return (
                <div key={caja.id} className="caja-card" style={{ borderColor: 'rgba(0,194,150,0.3)' }}>
                  <div className="caja-card-header" style={{ background: 'rgba(0,194,150,0.04)' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>
                        {TURNOS.find(t => t.value === caja.turno)?.icon} Caja — {caja.turno}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        Abierta a las {fmtHora(caja.fechaApertura)}
                      </div>
                    </div>
                    <span className="caja-estado-abierta">
                      <span className="caja-dot"/> Abierta
                    </span>
                  </div>

                  <div className="caja-card-body">
                    {/* Cajero */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#2E6FD4,#4A8FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                        {(caja.cajeroNombre || 'C').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{caja.cajeroNombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Cajero activo</div>
                      </div>
                    </div>

                    <div className="caja-data-row">
                      <span className="caja-data-label">Monto inicial</span>
                      <span className="caja-data-val">{fmt(caja.montoInicial)}</span>
                    </div>
                    <div className="caja-data-row">
                      <span className="caja-data-label">Ventas efectivo</span>
                      <span className="caja-data-val" style={{ color: '#00C296' }}>{fmt(datos.efectivo)}</span>
                    </div>
                    <div className="caja-data-row">
                      <span className="caja-data-label">Ventas tarjeta</span>
                      <span className="caja-data-val" style={{ color: '#4A8FE8' }}>{fmt(datos.tarjeta)}</span>
                    </div>
                    <div className="caja-data-row">
                      <span className="caja-data-label">Retiros</span>
                      <span className="caja-data-val" style={{ color: '#ef4444' }}>-{fmt(datos.totalRetiros)}</span>
                    </div>
                    <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 10, marginTop: 6 }}>
                      <div className="caja-data-row">
                        <span style={{ fontWeight: 700 }}>Efectivo esperado</span>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 16, color: 'var(--accent)' }}>{fmt(datos.montoEsperado)}</span>
                      </div>
                    </div>

                    {/* Métodos de pago */}
                    <div className="resumen-metodos" style={{ marginTop: 12 }}>
                      {METODOS_PAGO.map(m => (
                        <div key={m.value} className="metodo-box">
                          <div className="metodo-icon">{m.icon}</div>
                          <div className="metodo-val" style={{ color: m.color }}>
                            {fmt(m.value === 'efectivo' ? datos.efectivo : m.value === 'tarjeta' ? datos.tarjeta : datos.transferencia)}
                          </div>
                          <div className="metodo-label">{m.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="caja-card-footer">
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                      onClick={() => setModalDetalle(caja)}>
                      👁️ Detalle
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                      onClick={() => setModalRetiro(caja)}>
                      💸 Retiro
                    </button>
                    <button className="btn btn-danger btn-sm" style={{ flex: 1 }}
                      onClick={() => { setModalCierre(caja); setConteo({}) }}>
                      🔒 Cerrar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* CAJAS CERRADAS HOY */}
      {cajasCerradas.filter(c => c.fechaCierre?.toDate?.()?.toDateString() === hoy).length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 14, marginTop: 8 }}>
            🔴 Cerradas Hoy
          </div>
          <div className="cajas-grid">
            {cajasCerradas.filter(c => c.fechaCierre?.toDate?.()?.toDateString() === hoy).map(caja => {
              const diferencia = (caja.montoReal || 0) - (caja.montoEsperado || 0)
              return (
                <div key={caja.id} className="caja-card" style={{ opacity: 0.85 }}>
                  <div className="caja-card-header">
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>
                        {TURNOS.find(t => t.value === caja.turno)?.icon} Caja — {caja.turno}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {caja.cajeroNombre} · Cerrada {fmtHora(caja.fechaCierre)}
                      </div>
                    </div>
                    <span className="caja-estado-cerrada">
                      <span className="caja-dot"/> Cerrada
                    </span>
                  </div>
                  <div className="caja-card-body">
                    <div className="caja-data-row">
                      <span className="caja-data-label">Total esperado</span>
                      <span className="caja-data-val">{fmt(caja.montoEsperado)}</span>
                    </div>
                    <div className="caja-data-row">
                      <span className="caja-data-label">Total contado</span>
                      <span className="caja-data-val">{fmt(caja.montoReal)}</span>
                    </div>
                    <div className={`diferencia-box ${diferencia === 0 ? 'diferencia-ok' : diferencia > 0 ? 'diferencia-over' : 'diferencia-under'}`} style={{ marginTop: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        {diferencia === 0 ? '✅ Cuadrada' : diferencia > 0 ? '⬆️ Sobrante' : '⬇️ Faltante'}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 16 }}>
                        {diferencia >= 0 ? '+' : ''}{fmt(diferencia)}
                      </span>
                    </div>
                  </div>
                  <div className="caja-card-footer">
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                      onClick={() => setModalDetalle(caja)}>
                      👁️ Ver detalle
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                      onClick={() => imprimirReporte(caja, empresa)}>
                      🖨️ Imprimir
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* HISTORIAL */}
      {cajasCerradas.filter(c => c.fechaCierre?.toDate?.()?.toDateString() !== hoy).length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 14, marginTop: 8 }}>
            📋 Historial
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

      {!loading && cajas.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">💰</div>
          <div className="empty-text">No hay cajas registradas.<br/>Abre la primera caja del día.</div>
        </div>
      )}

      {/* ── MODAL APERTURA ── */}
      {modalApertura && (
        <div className="modal-overlay" onClick={() => setModalApertura(false)}>
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
                    onClick={() => setTurno(t.value)}>
                    <div className="turno-icon">{t.icon}</div>
                    <div className="turno-label">{t.label}</div>
                    <div className="turno-hora">{t.hora}</div>
                  </div>
                ))}
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
        <div className="modal-overlay" onClick={() => setModalCierre(null)}>
          <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">🔒 Cierre de Caja</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
              <strong style={{ color: 'var(--text)' }}>{modalCierre.cajeroNombre}</strong> ·
              Turno {modalCierre.turno} · Abierta {fmtHora(modalCierre.fechaApertura)}
            </div>

            {/* Resumen esperado */}
            {(() => {
              const datos = calcularVentasCaja(modalCierre)
              return (
                <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Resumen del turno</div>
                  <div className="caja-data-row"><span className="caja-data-label">Monto inicial</span><span className="caja-data-val">{fmt(modalCierre.montoInicial)}</span></div>
                  <div className="caja-data-row"><span className="caja-data-label">+ Ventas efectivo</span><span className="caja-data-val" style={{ color: '#00C296' }}>{fmt(datos.efectivo)}</span></div>
                  <div className="caja-data-row"><span className="caja-data-label">+ Ventas tarjeta</span><span className="caja-data-val" style={{ color: '#4A8FE8' }}>{fmt(datos.tarjeta)}</span></div>
                  <div className="caja-data-row"><span className="caja-data-label">- Retiros</span><span className="caja-data-val" style={{ color: '#ef4444' }}>{fmt(datos.totalRetiros)}</span></div>
                  <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                    <div className="caja-data-row">
                      <span style={{ fontWeight: 700 }}>Efectivo esperado en caja</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 18, color: 'var(--accent)' }}>{fmt(datos.montoEsperado)}</span>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Conteo de billetes */}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Conteo de billetes y monedas
            </div>
            <div className="billetes-grid">
              {DENOMINACIONES.map(d => {
                const cantidad = parseFloat(conteo[d.valor] || 0)
                const subtotal = cantidad * d.valor
                return (
                  <div key={d.valor} className="billete-row">
                    <span className="billete-denom">{d.label}</span>
                    <span className="billete-tipo">{d.tipo}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>×</span>
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
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {diferencia === 0 ? '✅ Caja cuadrada' : diferencia > 0 ? '⬆️ Sobrante' : '⬇️ Faltante'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {diferencia === 0 ? 'El conteo coincide perfectamente' : diferencia > 0 ? 'Hay más dinero del esperado' : 'Hay menos dinero del esperado'}
                    </div>
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 900, fontSize: 22 }}>
                    {diferencia >= 0 ? '+' : ''}{fmt(diferencia)}
                  </span>
                </div>
              )
            })()}

            <div className="form-group" style={{ marginTop: 14 }}>
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
        <div className="modal-overlay" onClick={() => setModalRetiro(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">💸 Registrar Retiro</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
              Retiro de efectivo de la caja de <strong style={{ color: 'var(--text)' }}>{modalRetiro.cajeroNombre}</strong>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Monto a retirar *</label>
              <input className="input" type="number" step="0.01" placeholder="0.00"
                value={retiroMonto} onChange={e => setRetiroMonto(e.target.value)}
                style={{ fontSize: 20, fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'center' }}/>
            </div>
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label className="form-label">Motivo *</label>
              <input className="input" placeholder="Ej: Pago a proveedor, Gastos del día..."
                value={retiroMotivo} onChange={e => setRetiroMotivo(e.target.value)}/>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalRetiro(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={registrarRetiro} disabled={guardando || !retiroMonto || !retiroMotivo}>
                {guardando ? '⏳...' : '💸 Registrar Retiro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DETALLE ── */}
      {modalDetalle && (
        <div className="modal-overlay" onClick={() => setModalDetalle(null)}>
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