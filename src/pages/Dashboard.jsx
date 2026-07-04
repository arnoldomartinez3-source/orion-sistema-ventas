import { useNavigate } from 'react-router-dom'
import { usePermisos } from '../PermisosContext'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { NAV_ITEMS, NavIcon, NAV_COLOR } from '../navConfig'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const COLORS = ['#00d4aa', '#4f8cff', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

// Íconos SVG inline (stroke heredan currentColor)
const Icon = ({ name }) => {
  const paths = {
    cash: <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></>,
    invoice: <><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 9h1M9 13h6M9 17h6"/></>,
    box: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    cart: <><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M2 3h2l2.4 12.5a2 2 0 0 0 2 1.5h7.7a2 2 0 0 0 2-1.5L21 7H5.2"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

const dashStyles = `
  .stats-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 20px; width: 100%; }
  @media (max-width: 1000px) { .stats-grid { grid-template-columns: repeat(2,1fr); } }
  @media (max-width: 480px) { .stats-grid { grid-template-columns: 1fr 1fr; } }

  /* STAT CARD — acento lateral + ícono grande */
  .stat-card { background: linear-gradient(135deg, #1c2f5e, #14213d); border: 1.5px solid rgba(255,255,255,0.08); border-radius: 16px; position: relative; overflow: hidden; transition: all 0.2s; box-shadow: 0 6px 24px rgba(20,33,61,0.35); display: flex; align-items: stretch; }
  .stat-card:hover { transform: translateY(-2px); border-color: rgba(216,169,60,0.45); box-shadow: 0 10px 34px rgba(20,33,61,0.55); }
  .stat-accent { width: 5px; flex-shrink: 0; }
  .stat-card.green .stat-accent { background: linear-gradient(180deg, var(--accent), var(--accent-dark)); }
  .stat-card.blue .stat-accent { background: linear-gradient(180deg, #4f8cff, #3b6fd4); }
  .stat-card.orange .stat-accent { background: linear-gradient(180deg, #f59e0b, #d97706); }
  .stat-card.red .stat-accent { background: linear-gradient(180deg, var(--danger), var(--danger-dark)); }
  .stat-body { padding: 18px; flex: 1; display: flex; align-items: center; gap: 14px; min-width: 0; }
  .stat-iconbox { width: 48px; height: 48px; border-radius: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .stat-card.green .stat-iconbox { background: rgba(216,169,60,0.18); color: #e2bd5c; }
  .stat-card.blue .stat-iconbox { background: rgba(110,163,255,0.18); color: #8ab4ff; }
  .stat-card.orange .stat-iconbox { background: rgba(251,191,36,0.18); color: #fbbf24; }
  .stat-card.red .stat-iconbox { background: rgba(248,113,113,0.18); color: #f87171; }
  .stat-iconbox svg { width: 24px; height: 24px; }
  .stat-text { min-width: 0; flex: 1; }
  .stat-label { font-size: 11px; color: rgba(255,255,255,0.55); letter-spacing: 0.8px; margin-bottom: 4px; font-weight: 700; text-transform: uppercase; }
  .stat-value { font-size: 26px; font-weight: 800; letter-spacing: -1.5px; font-family: var(--mono); color: #fff; line-height: 1.1; }
  .stat-change { display: flex; align-items: center; gap: 4px; font-size: 12px; margin-top: 5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stat-change.up { color: #5fd39a; }
  .stat-change.down { color: #f78ba0; }

  /* MÓVIL: que no se corte el texto de las tarjetas */
  @media (max-width: 600px) {
    .stat-body { padding: 13px; gap: 10px; flex-direction: column; align-items: flex-start; }
    .stat-iconbox { width: 38px; height: 38px; border-radius: 10px; }
    .stat-iconbox svg { width: 20px; height: 20px; }
    .stat-value { font-size: 19px; letter-spacing: -0.8px; }
    .stat-label { font-size: 10px; letter-spacing: 0.4px; }
    .stat-change { font-size: 11px; white-space: normal; }
    .stat-text { width: 100%; }
  }

  .quick-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 20px; width: 100%; }
  @media (max-width: 900px) { .quick-grid { grid-template-columns: repeat(2,1fr); } }

  /* ACCESOS RÁPIDOS — solo móvil */
  .mobile-menu-grid { display: none; margin-bottom: 22px; }
  .mmg-title { font-size: 12px; font-weight: 700; color: var(--muted); letter-spacing: 0.8px; margin: 0 0 12px; padding: 0 2px; }
  .mmg-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .mmg-card {
    background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px;
    padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 9px;
    cursor: pointer; transition: transform 0.15s, border-color 0.15s;
  }
  .mmg-card:active { transform: scale(0.94); border-color: var(--c); }
  .mmg-iconwrap {
    width: 50px; height: 50px; border-radius: 14px; display: flex; align-items: center; justify-content: center;
    color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--c) 25%, transparent);
  }
  .mmg-iconwrap svg { width: 26px; height: 26px; }
  .mmg-label { font-size: 11.5px; font-weight: 600; color: var(--text); text-align: center; line-height: 1.2; }
  @media (max-width: 768px) { .mobile-menu-grid { display: block; } }
  @media (max-width: 360px) { .mmg-grid { grid-template-columns: repeat(2, 1fr); } }
  /* QUICK BTN — acento lateral + ícono grande */
  .quick-btn { background: linear-gradient(135deg, #1c2f5e, #14213d); border: 1.5px solid rgba(255,255,255,0.08); border-left: 5px solid var(--border); border-radius: 0 16px 16px 0; padding: 16px 18px; cursor: pointer; transition: all 0.18s; display: flex; align-items: center; gap: 14px; box-shadow: 0 6px 24px rgba(20,33,61,0.35); }
  .quick-btn:active { transform: scale(0.97); }
  .q-iconbox { width: 46px; height: 46px; border-radius: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .q-iconbox svg { width: 23px; height: 23px; }
  .q-info { flex: 1; min-width: 0; }
  .q-label { font-size: 15px; font-weight: 800; color: #fff; letter-spacing: -0.3px; }
  .q-desc { font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 2px; }
  .q-arrow { color: rgba(255,255,255,0.5); flex-shrink: 0; opacity: 0.7; transition: all 0.18s; }
  .q-arrow svg { width: 18px; height: 18px; }
  .quick-btn:hover .q-arrow { opacity: 1; transform: translateX(3px); }

  /* MÓVIL: quick-btn sin texto cortado */
  @media (max-width: 600px) {
    .quick-btn { padding: 13px 14px; gap: 11px; border-left-width: 4px; }
    .q-iconbox { width: 40px; height: 40px; border-radius: 11px; }
    .q-iconbox svg { width: 21px; height: 21px; }
    .q-label { font-size: 14px; }
    .q-desc { font-size: 11px; }
    .q-arrow { display: none; }
  }

  /* DASH GRID — ventas más ancha, alertas más compacta */
  .dash-grid { display: grid; grid-template-columns: 1fr 360px; gap: 16px; margin-bottom: 16px; width: 100%; }
  @media (max-width: 1100px) { .dash-grid { grid-template-columns: 1fr 300px; } }
  @media (max-width: 860px) { .dash-grid { grid-template-columns: 1fr; } }

  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; width: 100%; }
  @media (max-width: 960px) { .charts-grid { grid-template-columns: 1fr; } }

  /* TABLA — sin ancho fijo, columnas auto */
  .ventas-table { width: 100%; border-collapse: collapse; }
  .ventas-table th { padding: 11px 16px; text-align: left; font-size: 11px; color: var(--muted); letter-spacing: 0.8px; font-weight: 700; border-bottom: 1.5px solid var(--border); white-space: nowrap; text-transform: uppercase; background: var(--surface2); }
  .ventas-table td { padding: 13px 16px; font-size: 13px; border-bottom: 1px solid var(--border); }
  .ventas-table tr:last-child td { border-bottom: none; }
  .ventas-table tbody tr { transition: background 0.15s; }
  .ventas-table tbody tr td:first-child { box-shadow: inset 3px 0 0 transparent; transition: box-shadow 0.15s; }
  .ventas-table tbody tr:hover td { background: var(--surface3); }
  .ventas-table tbody tr:hover td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
  .ventas-table .col-dte { width: 110px; }
  .ventas-table .col-cliente { } /* auto — ocupa el resto */
  .ventas-table .col-total { width: 100px; text-align: right; }
  .ventas-table .col-fecha { width: 90px; }
  .ventas-table .col-estado { width: 110px; }

  /* ALERTAS — items más grandes y vistosos */
  .alert-item {
    display: flex; align-items: center; gap: 14px;
    padding: 16px 20px; border-bottom: 1px solid var(--border);
    transition: background 0.15s;
  }
  .alert-item:hover { background: var(--surface2); }
  .alert-item:last-child { border-bottom: none; }

  .alert-dot-wrap {
    width: 44px; height: 44px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; font-size: 20px;
  }
  .alert-dot-wrap.critical { background: rgba(239,68,68,0.12); }
  .alert-dot-wrap.warning { background: rgba(245,158,11,0.12); }

  .alert-info { flex: 1; min-width: 0; }
  .alert-nombre { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 3px; }
  .alert-stock-row { display: flex; align-items: center; gap: 8px; }
  .alert-stock-val { font-family: var(--mono); font-size: 13px; font-weight: 700; }
  .alert-stock-val.critical { color: var(--danger); }
  .alert-stock-val.warning { color: var(--accent3); }
  .alert-min { font-size: 12px; color: var(--muted); font-family: var(--mono); }

  .alert-badge {
    font-size: 10px; font-weight: 800; padding: 3px 8px;
    border-radius: 6px; flex-shrink: 0;
  }
  .alert-badge.critical { background: rgba(239,68,68,0.12); color: var(--danger); }
  .alert-badge.warning { background: rgba(245,158,11,0.12); color: var(--accent3); }

  .chart-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; color: var(--muted); gap: 8px; }
  .chart-empty-icon { font-size: 36px; opacity: 0.4; }
  .chart-empty-text { font-size: 13px; font-weight: 500; }
`

const quickActions = [
  { icon: 'cart', label: 'Nueva Venta', path: '/ventas', key: '1', color: '#00d4aa', desc: 'Registrar venta' },
  { icon: 'invoice', label: 'Emitir DTE', path: '/facturas', key: '2', color: '#4f8cff', desc: 'Factura electrónica' },
  { icon: 'box', label: 'Inventario', path: '/inventario', key: '3', color: '#f59e0b', desc: 'Ver productos' },
  { icon: 'user', label: 'Clientes', path: '/clientes', key: '4', color: '#8b5cf6', desc: 'Gestionar clientes' },
]

const CustomTooltip = ({ active, payload, label, prefix = '$' }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--surface3)', border: '1.5px solid var(--border2)', borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 24px var(--shadow)' }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ fontSize: 14, fontWeight: 700, color: p.color, fontFamily: 'var(--mono)' }}>
            {prefix}{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
          </div>
        ))}
      </div>
    )
  }
  return null
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { puede, esAdmin, userId, userName, rol, empresaId } = usePermisos()
  const [ventas, setVentas] = useState([])
  const [facturas, setFacturas] = useState([])
  const [productos, setProductos] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!empresaId) return // esperar empresaId del usuario
    // Cajero/vendedor solo ven lo SUYO (filtrado server-side por la query);
    // admin y demás roles, todo lo de la empresa.
    const soloPropias = !esAdmin && (rol === 'cajero' || rol === 'vendedor')
    const qVentas = soloPropias
      ? query(collection(db, 'ventas'), where('empresaId', '==', empresaId), where('cajeroId', '==', userId))
      : query(collection(db, 'ventas'), where('empresaId', '==', empresaId))
    const unsubVentas = onSnapshot(qVentas, snap => {
      const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // El cajero/vendedor ve solo las de HOY en su panel.
      if (soloPropias) {
        const hoy = new Date().toDateString()
        setVentas(todas.filter(v => { const f = v.createdAt?.toDate?.(); return f && f.toDateString() === hoy }))
      } else {
        setVentas(todas)
      }
    })
    const qFacturas = soloPropias
      ? query(collection(db, 'facturas'), where('empresaId', '==', empresaId), where('cajeroId', '==', userId))
      : query(collection(db, 'facturas'), where('empresaId', '==', empresaId))
    const unsubFacturas = onSnapshot(qFacturas, snap => setFacturas(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    const unsubProductos = onSnapshot(query(collection(db, 'productos'), where('empresaId', '==', empresaId)), snap => setProductos(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    const unsubClientes = onSnapshot(query(collection(db, 'clientes'), where('empresaId', '==', empresaId)), snap => { setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) })
    return () => { unsubVentas(); unsubFacturas(); unsubProductos(); unsubClientes() }
  }, [empresaId, esAdmin, rol, userId])

  const totalVentas = ventas.reduce((s, v) => s + (v.total || 0), 0)
  const totalDTEs = facturas.length
  const totalStock = productos.reduce((s, p) => s + (p.stock || 0), 0)
  const totalPendientes = facturas.filter(f => f.estadoPago === 'pendiente').reduce((s, f) => s + (f.total || 0), 0)
  const stockAlertas = productos.filter(p => p.stock < p.min)

  const ventasPorDia = () => {
    const dias = {}
    const hoy = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoy); d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString('es-SV', { weekday: 'short', day: 'numeric' })
      dias[key] = 0
    }
    ventas.forEach(v => {
      if (!v.createdAt?.seconds) return
      const fecha = new Date(v.createdAt.seconds * 1000)
      const diasAtras = Math.floor((hoy - fecha) / (1000 * 60 * 60 * 24))
      if (diasAtras <= 6) {
        const key = fecha.toLocaleDateString('es-SV', { weekday: 'short', day: 'numeric' })
        if (dias[key] !== undefined) dias[key] += v.total || 0
      }
    })
    return Object.entries(dias).map(([dia, total]) => ({ dia, total }))
  }

  const topProductos = () => {
    const prods = {}
    ventas.forEach(v => v.items?.forEach(item => { prods[item.nombre] = (prods[item.nombre] || 0) + item.qty }))
    return Object.entries(prods).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([nombre, qty]) => ({ nombre: nombre.length > 20 ? nombre.slice(0, 20) + '...' : nombre, qty }))
  }

  const estadoFacturas = () => {
    const estados = { Pagadas: 0, Pendientes: 0, Vencidas: 0, Anuladas: 0 }
    facturas.forEach(f => {
      if (f.estadoPago === 'pagada') estados.Pagadas++
      else if (f.estadoPago === 'pendiente') estados.Pendientes++
      else if (f.estadoPago === 'vencida') estados.Vencidas++
      else if (f.estadoPago === 'anulada') estados.Anuladas++
    })
    return Object.entries(estados).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))
  }

  const fmt = (n) => `$${(n || 0).toFixed(2)}`

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const map = { '1': '/ventas', '2': '/facturas', '3': '/inventario', '4': '/clientes' }
      if (map[e.key]) navigate(map[e.key])
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [navigate])

  const diasData = ventasPorDia()
  const prodData = topProductos()
  const estadoData = estadoFacturas()

  return (
    <>
      <style>{dashStyles}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Resumen general en tiempo real 🔥</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/ventas')}>🛒 Nueva Venta</button>
      </div>

      {/* SECCIONES SUPERIORES — se reordenan solo en móvil vía sistema responsive */}
      <div className="apilar-movil">

      {/* QUICK ACTIONS */}
      <div className="quick-grid orden-3">
        {quickActions.map((q) => (
          <div key={q.key} className="quick-btn"
            onClick={() => navigate(q.path)}
            style={{ borderLeftColor: q.color }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 8px 30px ${q.color}22`; e.currentTarget.style.transform = 'translateY(-3px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 20px var(--shadow2)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <div className="q-iconbox" style={{ background: q.color + '2e', color: q.color }}>
              <Icon name={q.icon} />
            </div>
            <div className="q-info">
              <div className="q-label">{q.label}</div>
              <div className="q-desc">{q.desc}</div>
            </div>
            <div className="q-arrow"><Icon name="arrow" /></div>
          </div>
        ))}
      </div>

      {/* STATS */}
      <div className="stats-grid orden-2">
        {[
          { color: 'green', icon: 'cash', label: 'TOTAL VENTAS', value: fmt(totalVentas), change: `${ventas.length} ventas registradas`, dir: 'up' },
          { color: 'blue', icon: 'invoice', label: 'DTEs EMITIDOS', value: totalDTEs, change: `${facturas.filter(f => f.tipoDte === 'CCF').length} CCF · ${facturas.filter(f => f.tipoDte === 'FE').length} FE`, dir: 'up' },
          { color: 'orange', icon: 'box', label: 'UNIDADES EN STOCK', value: totalStock.toLocaleString(), change: `${stockAlertas.length} alertas de stock bajo`, dir: stockAlertas.length > 0 ? 'down' : 'up' },
          { color: 'red', icon: 'clock', label: 'POR COBRAR', value: fmt(totalPendientes), change: `${facturas.filter(f => f.estadoPago === 'pendiente').length} facturas pendientes`, dir: 'down' },
        ].map((s) => (
          <div key={s.label} className={`stat-card ${s.color}`}>
            <div className="stat-accent" />
            <div className="stat-body">
              <div className="stat-iconbox"><Icon name={s.icon} /></div>
              <div className="stat-text">
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{loading ? '...' : s.value}</div>
                <div className={`stat-change ${s.dir}`}>{s.dir === 'up' ? '▲' : '▼'} {s.change}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── ACCESOS RÁPIDOS (SOLO MÓVIL) ── */}
      <div className="mobile-menu-grid orden-1">
        <p className="mmg-title">ACCESOS RÁPIDOS</p>
        <div className="mmg-grid">
          {NAV_ITEMS
            .filter(item => !item.section && item.icon !== 'dashboard' && !item.soloCertificacion && (!item.permiso || puede(item.permiso)))
            .map(item => {
              const c = NAV_COLOR[item.icon] || '#888'
              return (
                <div key={item.path} className="mmg-card" style={{ '--c': c }} onClick={() => navigate(item.path)}>
                  <div className="mmg-iconwrap"><NavIcon name={item.icon} /></div>
                  <span className="mmg-label">{item.label}</span>
                </div>
              )
            })}
        </div>
      </div>

      </div>{/* fin .apilar-movil */}

      {/* ── ÚLTIMAS VENTAS + ALERTAS ── */}
      <div className="dash-grid">

        {/* TABLA VENTAS — columnas sin espacio vacío */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">🛒 Últimas Ventas</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="dte-tag">🔒 MH SV</span>
              <span className="card-action" onClick={() => navigate('/facturas')}>Ver todas →</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="ventas-table">
              <thead>
                <tr>
                  <th className="col-dte">No. DTE</th>
                  <th className="col-cliente">CLIENTE</th>
                  <th className="col-total">TOTAL</th>
                  <th className="col-fecha">FECHA</th>
                  <th className="col-estado">ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {facturas.length === 0 ? (
                  <tr><td colSpan={5}>
                    <div className="empty-state" style={{ padding: '30px 20px' }}>
                      <div className="empty-icon" style={{ fontSize: 36 }}>🧾</div>
                      <div className="empty-text">Sin facturas aún</div>
                    </div>
                  </td></tr>
                ) : facturas.slice(0, 6).map((f) => (
                  <tr key={f.id}>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--accent2)', fontWeight: 600 }}>{f.numero}</td>
                    <td style={{ fontWeight: 600, fontSize: 14 }}>{f.cliente}</td>
                    <td className="amount" style={{ textAlign: 'right' }}>{fmt(f.total)}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{f.fechaEmision}</td>
                    <td>
                      <span className={`status-pill ${f.estadoPago}`}>
                        <span className="dot" />
                        {f.estadoPago?.charAt(0).toUpperCase() + f.estadoPago?.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ALERTAS — más grandes y vistosas */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">⚠️ Alertas de Stock</div>
            <span className="card-action" onClick={() => navigate('/inventario')}>Gestionar →</span>
          </div>

          {stockAlertas.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 20px' }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>✅</div>
              <div style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>Todo el stock está en niveles normales</div>
            </div>
          ) : stockAlertas.slice(0, 4).map((item) => {
            const nivel = item.stock === 0 ? 'critical' : 'warning'
            return (
              <div key={item.id} className="alert-item">
                <div className={`alert-dot-wrap ${nivel}`}>
                  {nivel === 'critical' ? '🚨' : '⚠️'}
                </div>
                <div className="alert-info">
                  <div className="alert-nombre">{item.nombre}</div>
                  <div className="alert-stock-row">
                    <span className={`alert-stock-val ${nivel}`}>
                      {item.stock} {item.unidad || 'uds'}
                    </span>
                    <span className="alert-min">/ mín: {item.min}</span>
                    <span className={`alert-badge ${nivel}`}>
                      {nivel === 'critical' ? 'AGOTADO' : 'BAJO'}
                    </span>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/inventario')}>
                  Reponer
                </button>
              </div>
            )
          })}

          <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/inventario')}>
              📦 Ver Inventario completo
            </button>
          </div>
        </div>
      </div>

      {/* ── GRÁFICA VENTAS 7 DÍAS ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">📈 Ventas últimos 7 días</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Total en dólares por día</div>
          </div>
          <span className="firebase-badge">🔥 Tiempo real</span>
        </div>
        <div style={{ padding: '20px 10px' }}>
          {ventas.length === 0 ? (
            <div className="chart-empty">
              <div className="chart-empty-icon">📈</div>
              <div className="chart-empty-text">Las gráficas aparecerán cuando registres ventas</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={diasData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00d4aa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="total" stroke="#00d4aa" strokeWidth={2.5} fill="url(#colorVentas)" dot={{ fill: '#00d4aa', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── PRODUCTOS + ESTADO FACTURAS ── */}
      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-title">🏆 Productos más vendidos</div>
            <span className="card-action" onClick={() => navigate('/inventario')}>Ver inventario →</span>
          </div>
          <div style={{ padding: '20px 10px' }}>
            {prodData.length === 0 ? (
              <div className="chart-empty">
                <div className="chart-empty-icon">🏆</div>
                <div className="chart-empty-text">Sin ventas registradas aún</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={prodData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="nombre" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                  <Tooltip content={<CustomTooltip prefix="" />} />
                  <Bar dataKey="qty" radius={[0, 6, 6, 0]}>
                    {prodData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">🧾 Estado de Facturas</div>
            <span className="card-action" onClick={() => navigate('/facturas')}>Ver todas →</span>
          </div>
          <div style={{ padding: '20px 10px' }}>
            {estadoData.length === 0 ? (
              <div className="chart-empty">
                <div className="chart-empty-icon">🧾</div>
                <div className="chart-empty-text">Sin facturas registradas aún</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={estadoData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value">
                    {estadoData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip prefix="" />} />
                  <Legend iconType="circle" iconSize={10} formatter={(value) => <span style={{ color: 'var(--text2)', fontSize: 12 }}>{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </>
  )
}