import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTheme, useSidebar, OrionLogo } from '../App'
import { useAuth } from '../AuthContext'
import { usePermisos } from '../PermisosContext'

// ══ ÍCONOS SVG — heredan color por categoría vía currentColor ══
const NavIcon = ({ name }) => {
  const paths = {
    dashboard: <><line x1="4" y1="20" x2="4" y2="12"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="9"/><line x1="22" y1="20" x2="2" y2="20"/></>,
    caja: <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></>,
    venta: <><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2l2.4 12.5a2 2 0 0 0 2 1.5h7.7a2 2 0 0 0 2-1.5L21 7H5.2"/></>,
    inventario: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></>,
    compras: <><path d="M6 7V6a3 3 0 0 1 6 0v1M6 7h12l1 13H5L6 7z" transform="translate(3 0)"/><path d="M9 7V6a3 3 0 0 1 6 0v1"/><path d="M5 7h14l1 13H4L5 7z"/></>,
    clientes: <><circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6M21 20v-1a5 5 0 0 0-3.5-4.7"/></>,
    factura: <><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 9h1M9 13h6M9 17h6"/></>,
    operaciones: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V4z"/><path d="M9 11h6M9 15h4"/></>,
    cotizacion: <><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 13h6M9 17h4"/></>,
    sucursal: <><path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M4 21v-7h6v7"/></>,
    config: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></>,
    usuario: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></>,
    certificacion: <><circle cx="12" cy="9" r="6"/><path d="M9 14l-1.5 7L12 18l4.5 3L15 14"/><path d="M12 6.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L8.8 8.8l2.2-.3z"/></>,
    salir: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></>,
    luna: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></>,
    sol: <><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    inicio: <><line x1="4" y1="20" x2="4" y2="12"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="9"/><line x1="22" y1="20" x2="2" y2="20"/></>,
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

// Color por categoría (se ve bien en claro y oscuro)
const NAV_COLOR = {
  dashboard: '#4a8fe8', caja: '#00d4aa', venta: '#22c55e', inventario: '#f59e0b',
  compras: '#ec4899', clientes: '#8b5cf6', factura: '#4f8cff', operaciones: '#06b6d4',
  cotizacion: '#14b8a6', sucursal: '#f97316', config: '#64748b', usuario: '#a855f7',
  certificacion: '#eab308', inicio: '#4a8fe8',
}

const sidebarStyles = `
  .sidebar {
    width: 260px; background: var(--surface);
    border-right: 1.5px solid var(--border);
    display: flex; flex-direction: column;
    position: fixed; height: 100vh; z-index: 100;
    transition: width 0.3s cubic-bezier(0.4,0,0.2,1);
    overflow: hidden;
  }
  .sidebar.collapsed { width: 72px; }
  @media (max-width: 768px) {
    .sidebar { width: 260px !important; transform: translateX(-100%); transition: transform 0.3s; }
    .sidebar.mobile-open { transform: translateX(0); box-shadow: 8px 0 40px rgba(0,0,0,0.5); }
  }

  /* LOGO */
  .sidebar-logo {
    padding: 14px 16px; border-bottom: 1.5px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    min-height: 64px; overflow: hidden; position: relative;
    background: var(--surface2);
  }
  .sidebar-logo-full { display: flex; align-items: center; justify-content: center; width: 100%; }

  /* Logo mini — solo las 3 estrellas con las 3 líneas */
  .sidebar-logo-mini {
    width: 44px; height: 44px;
    background: linear-gradient(135deg, #0d1830, #1B2E6B);
    border-radius: 12px; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 14px rgba(27,46,107,0.5);
  }

  .collapse-btn {
    position: absolute; top: 50%; right: -14px; transform: translateY(-50%);
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--surface); border: 1.5px solid var(--border);
    color: var(--muted); cursor: pointer; font-size: 13px;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s; z-index: 10; box-shadow: 0 2px 8px var(--shadow);
  }
  .collapse-btn:hover { color: var(--accent); border-color: var(--accent); }
  @media (max-width: 768px) { .collapse-btn { display: none; } }

  .close-btn-mobile { display: none; position: absolute; top: 16px; right: 14px; background: none; border: none; color: var(--muted); font-size: 22px; cursor: pointer; }
  @media (max-width: 768px) { .close-btn-mobile { display: block; } }

  /* NAV */
  .sidebar-nav { padding: 8px 10px; flex: 1; overflow-y: auto; overflow-x: hidden; }

  .nav-section-label {
    font-size: 10px; font-weight: 700; color: var(--muted);
    letter-spacing: 1.2px; text-transform: uppercase;
    padding: 0 10px 6px; margin-top: 16px;
    white-space: nowrap; overflow: hidden; transition: opacity 0.2s;
  }
  .sidebar.collapsed .nav-section-label { opacity: 0; }

  .nav-item {
    display: flex; align-items: center; gap: 12px;
    padding: 11px 12px; border-radius: 12px; cursor: pointer;
    margin-bottom: 3px; transition: background 0.18s, transform 0.18s;
    position: relative; overflow: hidden; white-space: nowrap;
  }
  .nav-item:hover { background: color-mix(in srgb, var(--c) 14%, transparent); transform: translateX(4px); }
  .nav-item:active { transform: translateX(4px) scale(0.98); }
  .nav-item.active { background: color-mix(in srgb, var(--c) 14%, transparent); }
  .nav-item.active:hover { transform: translateX(4px); }
  .nav-item.active::before {
    content: ''; position: absolute; left: 0; top: 20%; bottom: 20%;
    width: 3px; background: var(--c); border-radius: 99px;
  }

  /* RIPPLE — onda al hacer clic */
  .nav-ripple {
    position: absolute; border-radius: 50%; transform: scale(0);
    background: var(--c); opacity: 0.25; pointer-events: none;
    animation: navRipple 0.6s ease-out;
  }
  @keyframes navRipple {
    to { transform: scale(2.5); opacity: 0; }
  }

  .nav-icon-wrap {
    width: 40px; height: 40px; flex-shrink: 0; border-radius: 11px;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.18s, transform 0.18s, border-color 0.18s;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 10%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--c) 20%, transparent);
  }
  .nav-icon-wrap svg { width: 22px; height: 22px; }
  .nav-item:hover .nav-icon-wrap, .nav-item.active .nav-icon-wrap {
    transform: scale(1.1);
    background: color-mix(in srgb, var(--c) 28%, transparent);
    border-color: var(--c);
  }
  .nav-item.active .nav-icon-wrap { transform: none; }

  .nav-label { font-size: 13px; font-weight: 600; color: var(--text2); transition: all 0.18s; overflow: hidden; }
  .nav-item:hover .nav-label { color: var(--text); }
  .nav-item.active .nav-label { color: var(--c); font-weight: 700; }

  .nav-tooltip {
    position: absolute; left: 82px; top: 50%; transform: translateY(-50%);
    background: var(--surface3); border: 1.5px solid var(--border2);
    color: var(--text); font-size: 13px; font-weight: 600;
    padding: 6px 12px; border-radius: 8px; white-space: nowrap;
    pointer-events: none; opacity: 0; transition: opacity 0.15s;
    box-shadow: 0 4px 16px var(--shadow); z-index: 999;
  }
  .sidebar.collapsed .nav-item:hover .nav-tooltip { opacity: 1; }

  /* FOOTER */
  .sidebar-footer { padding: 8px 10px; border-top: 1.5px solid var(--border); overflow: hidden; }

  .user-row {
    display: flex; align-items: center; gap: 8px; padding: 8px;
    border-radius: 10px; margin-bottom: 6px;
    background: var(--surface2); border: 1.5px solid var(--border);
    overflow: hidden; white-space: nowrap;
  }
  .user-avatar {
    width: 30px; height: 30px; border-radius: 8px;
    background: linear-gradient(135deg, #1B2E6B, #2E5FA3);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 12px; color: #fff;
    flex-shrink: 0; overflow: hidden;
  }
  .user-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .user-info { overflow: hidden; flex: 1; min-width: 0; }
  .user-name { font-size: 12px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .user-email { font-size: 10px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .logout-btn {
    display: flex; align-items: center; gap: 8px; width: 100%;
    padding: 6px 10px; border-radius: 8px;
    border: 1.5px solid rgba(239,68,68,0.2);
    background: rgba(239,68,68,0.06); color: #ef4444;
    cursor: pointer; font-family: 'Inter', sans-serif;
    font-size: 12px; font-weight: 600;
    transition: all 0.18s; margin-bottom: 6px;
  }
  .logout-btn:hover { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.4); transform: translateY(-1px); }
  .logout-icon { width: 26px; height: 26px; border-radius: 7px; background: rgba(239,68,68,0.1); display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
  .logout-icon svg { width: 15px; height: 15px; }

  .theme-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 10px; border-radius: 8px;
    background: var(--surface3); border: 1.5px solid var(--border); overflow: hidden;
  }
  .theme-label { font-size: 12px; font-weight: 600; color: var(--text2); display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .theme-label svg { width: 16px; height: 16px; }

  /* BOTTOM NAV */
  .bottom-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; background: var(--surface); border-top: 1.5px solid var(--border); padding: 10px 0 16px; z-index: 80; grid-template-columns: repeat(5,1fr); }
  @media (max-width: 768px) { .bottom-nav { display: grid; } }
  .bnav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; padding: 4px 0; color: var(--muted); transition: all 0.2s; }
  .bnav-item.active { color: var(--accent); }
  .bnav-icon { font-size: 22px; display: flex; align-items: center; justify-content: center; }
  .bnav-icon svg { width: 24px; height: 24px; }
  .bnav-label { font-size: 9px; font-weight: 700; letter-spacing: 0.3px; }

  /* MODAL LOGOUT */
  .logout-modal { background: var(--surface); border: 1.5px solid var(--border); border-radius: 20px; padding: 28px; width: 100%; max-width: 360px; box-shadow: 0 25px 80px var(--shadow); text-align: center; }
  .logout-modal-icon { font-size: 48px; margin-bottom: 12px; }
  .logout-modal-title { font-size: 18px; font-weight: 800; margin-bottom: 8px; color: var(--text); }
  .logout-modal-sub { font-size: 14px; color: var(--muted); margin-bottom: 24px; }
  .logout-modal-actions { display: flex; gap: 10px; }
`

// navItems ahora incluye permisos requeridos
const NAV_ITEMS = [
  { icon: 'dashboard', label: 'Dashboard',      path: '/',            permiso: 'ver_dashboard' },
  { icon: 'caja', label: 'Caja',            path: '/caja',        permiso: 'ver_punto_venta' },
  { icon: 'venta', label: 'Punto de Venta', path: '/ventas',      permiso: 'ver_punto_venta' },
  { icon: 'inventario', label: 'Inventario',     path: '/inventario',  permiso: 'ver_inventario' },
  { icon: 'compras', label: 'Compras',        path: '/compras',     permiso: 'ver_compras' },
  { icon: 'clientes', label: 'Clientes',       path: '/clientes',    permiso: 'ver_clientes' },
  { section: 'FACTURACIÓN' },
  { icon: 'factura', label: 'Facturas DTE',   path: '/facturas',    permiso: 'ver_facturas' },
  { icon: 'operaciones', label: 'Operaciones',    path: '/operaciones', permiso: 'ver_facturas' },
  { icon: 'cotizacion', label: 'Cotizaciones',   path: '/cotizaciones',permiso: 'ver_cotizaciones' },
  { section: 'SISTEMA' },
  { icon: 'sucursal', label: 'Sucursales',     path: '/sucursales',  permiso: 'ver_configuracion' },
  { icon: 'config', label: 'Configuración',  path: '/config',      permiso: 'ver_configuracion' },
  { icon: 'usuario', label: 'Usuarios',       path: '/usuarios',    permiso: 'ver_usuarios' },
  { icon: 'certificacion', label: 'Certificación',  path: '/certificacion', soloCertificacion: true },
]

const bottomNavItems = [
  { icon: 'inicio', label: 'Inicio', path: '/' },
  { icon: 'venta', label: 'Ventas', path: '/ventas' },
  { icon: 'inventario', label: 'Stock', path: '/inventario' },
  { icon: 'factura', label: 'DTE', path: '/facturas' },
  { icon: 'clientes', label: 'Clientes', path: '/clientes' },
]

// ══ LOGO MINI — solo estrellas con 3 líneas para sidebar colapsado ══
const OrionMini = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="100 90 240 210" width="30" height="30">
    <defs>
      <filter id="smG" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="smB" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="smT" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <radialGradient id="smGG" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#fff"/><stop offset="40%" stopColor="#2EECC5"/><stop offset="100%" stopColor="#00B89F"/>
      </radialGradient>
      <radialGradient id="smGB" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#fff"/><stop offset="40%" stopColor="#5AC8F5"/><stop offset="100%" stopColor="#1E7FBA"/>
      </radialGradient>
      <radialGradient id="smGT" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#fff"/><stop offset="40%" stopColor="#35C4D8"/><stop offset="100%" stopColor="#0E87A8"/>
      </radialGradient>
      <linearGradient id="smL1" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#1A6FA3" stopOpacity="0.9"/><stop offset="100%" stopColor="#00B89F" stopOpacity="0.9"/>
      </linearGradient>
      <linearGradient id="smL2" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#1A6FA3" stopOpacity="0.85"/><stop offset="100%" stopColor="#35C4D8" stopOpacity="0.85"/>
      </linearGradient>
      <linearGradient id="smL3" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#35C4D8" stopOpacity="0.85"/><stop offset="100%" stopColor="#00B89F" stopOpacity="0.85"/>
      </linearGradient>
    </defs>
    {/* 3 líneas completas */}
    <line x1="148" y1="268" x2="310" y2="118" stroke="url(#smL1)" strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="148" y1="268" x2="292" y2="268" stroke="url(#smL2)" strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="292" y1="268" x2="310" y2="118" stroke="url(#smL3)" strokeWidth="3" strokeLinecap="round"/>
    {/* 3 estrellas */}
    <circle cx="310" cy="118" r="17" fill="url(#smGG)" filter="url(#smG)"/>
    <circle cx="148" cy="268" r="19" fill="url(#smGB)" filter="url(#smB)"/>
    <circle cx="292" cy="268" r="14" fill="url(#smGT)" filter="url(#smT)"/>
  </svg>
)

export default function Sidebar({ puedeCertificar = false }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { dark, setDark } = useTheme()
  const { collapsed, setCollapsed } = useSidebar()
  const { user, logout } = useAuth()
  const { puede, rol, usuarioData, loading: loadingPermisos } = usePermisos()

  // Filtrar items del nav según permisos
  // Si los permisos aún están cargando, mostrar todos para evitar flash de sidebar vacío
  const navItems = NAV_ITEMS.filter(item => {
    if (item.section) return true
    // El item de certificación tiene su propio candado (correo maestro + flag),
    // que ya se resolvió en App.jsx y llega como prop.
    if (item.soloCertificacion) return puedeCertificar
    if (!item.permiso) return true
    if (loadingPermisos) return true // esperar a que carguen los permisos
    return puede(item.permiso)
  })

  const goTo = (path) => { navigate(path); setMobileOpen(false) }

  // Crea la onda (ripple) desde el punto exacto del clic
  const lanzarRipple = (e) => {
    const item = e.currentTarget
    const circulo = document.createElement('span')
    const diametro = Math.max(item.clientWidth, item.clientHeight)
    const radio = diametro / 2
    const rect = item.getBoundingClientRect()
    circulo.style.width = circulo.style.height = `${diametro}px`
    circulo.style.left = `${e.clientX - rect.left - radio}px`
    circulo.style.top = `${e.clientY - rect.top - radio}px`
    circulo.className = 'nav-ripple'
    const previo = item.querySelector('.nav-ripple')
    if (previo) previo.remove()
    item.appendChild(circulo)
    setTimeout(() => circulo.remove(), 600)
  }
  const handleLogout = async () => { await logout(); setShowLogout(false); navigate('/') }
  const getIniciales = () => (user?.displayName || user?.email || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const getNombre = () => user?.displayName || user?.email?.split('@')[0] || 'Usuario'
  const getEmail = () => user?.email || ''

  return (
    <>
      <style>{sidebarStyles}</style>

      <button className="hamburger" style={{ position: 'fixed', top: 18, left: 18, zIndex: 85 }} onClick={() => setMobileOpen(true)}>☰</button>
      <div className={`overlay ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} />

      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '›' : '‹'}
        </button>

        {/* LOGO */}
        <div className="sidebar-logo">
          {collapsed
            ? <div className="sidebar-logo-mini"><OrionMini /></div>
            : <div className="sidebar-logo-full">
                <div style={{
                  background: '#ffffff', borderRadius: 12,
                  padding: '10px 20px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                  textAlign: 'center',
                }}>
                  <div style={{
                    fontFamily: "'Georgia','Times New Roman',serif",
                    fontSize: 22, fontWeight: 900,
                    color: '#1B2E6B', letterSpacing: 4,
                    textTransform: 'uppercase', lineHeight: 1.1,
                  }}>ORIÓN</div>
                  <div style={{
                    width: 32, height: 2,
                    background: 'linear-gradient(90deg,#2E6FD4,#2EECC5)',
                    borderRadius: 99, margin: '5px auto',
                  }}/>
                  <div style={{
                    fontFamily: "'Segoe UI',Arial,sans-serif",
                    fontSize: 8, fontWeight: 500,
                    color: '#4A7BC4', letterSpacing: 2,
                    textTransform: 'uppercase',
                  }}>Gestión de Ventas y Facturación</div>
                </div>
              </div>
          }
          <button className="close-btn-mobile" onClick={() => setMobileOpen(false)}>✕</button>
        </div>

        {/* NAV */}
        <nav className="sidebar-nav">
          {navItems.map((item, i) =>
            item.section ? (
              <div key={i} className="nav-section-label">{item.section}</div>
            ) : (
              <div key={i} className={`nav-item ${location.pathname === item.path ? 'active' : ''}`} style={{ '--c': NAV_COLOR[item.icon] || '#888' }} onClick={(e) => { lanzarRipple(e); goTo(item.path) }}>
                <div className="nav-icon-wrap">
                  <NavIcon name={item.icon} />
                </div>
                <span className="nav-label">{item.label}</span>
                <span className="nav-tooltip">{item.label}</span>
              </div>
            )
          )}
        </nav>

        {/* FOOTER */}
        <div className="sidebar-footer">
          <div className="user-row">
            <div className="user-avatar">
              {user?.photoURL ? <img src={user.photoURL} alt="avatar"/> : getIniciales()}
            </div>
            {!collapsed && (
              <div className="user-info">
                <div className="user-name">{usuarioData?.nombre || getNombre()}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {rol && rol !== 'administrador' && (
                    <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--accent)', color: '#0a0f0d', padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
                      {rol}
                    </span>
                  )}
                  {(!rol || rol === 'administrador') && (
                    <span style={{ fontSize: 9, fontWeight: 700, background: '#2E6FD4', color: '#fff', padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
                      admin
                    </span>
                  )}
                </div>
                <div className="user-email">{getEmail()}</div>
              </div>
            )}
          </div>

          <button className="logout-btn" onClick={() => setShowLogout(true)}>
            <div className="logout-icon" style={{ color: '#ef4444' }}><NavIcon name="salir" /></div>
            {!collapsed && <span>Cerrar sesión</span>}
          </button>

          <div className="theme-row">
            <span className="theme-label">
              <span style={{ display: 'flex', color: dark ? '#a855f7' : '#f59e0b' }}><NavIcon name={dark ? 'luna' : 'sol'} /></span>
              {!collapsed && <span>{dark ? 'Modo Oscuro' : 'Modo Claro'}</span>}
            </span>
            <button className={`theme-toggle ${dark ? 'dark' : 'light'}`} onClick={() => setDark(!dark)}>
              <div className="toggle-knob"/>
            </button>
          </div>
        </div>
      </aside>

      {/* BOTTOM NAV */}
      <nav className="bottom-nav">
        {bottomNavItems.map((item) => (
          <div key={item.path} className={`bnav-item ${location.pathname === item.path ? 'active' : ''}`} onClick={() => goTo(item.path)}>
            <span className="bnav-icon" style={{ color: NAV_COLOR[item.icon] || 'var(--muted)' }}><NavIcon name={item.icon} /></span>
            <span className="bnav-label">{item.label}</span>
          </div>
        ))}
      </nav>

      {/* MODAL LOGOUT */}
      {showLogout && (
        <div className="modal-overlay" onClick={() => setShowLogout(false)}>
          <div className="logout-modal" onClick={e => e.stopPropagation()}>
            <div className="logout-modal-icon" style={{ color: '#ef4444', display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="48" height="48"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg></div>
            <div className="logout-modal-title">¿Cerrar sesión?</div>
            <div className="logout-modal-sub">
              Saldrás de tu cuenta.<br/>
              <strong style={{ color: 'var(--text)' }}>{getEmail()}</strong>
            </div>
            <div className="logout-modal-actions">
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowLogout(false)}>Cancelar</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleLogout}>Salir</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}