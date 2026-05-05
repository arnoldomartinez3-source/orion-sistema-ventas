import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTheme, useSidebar, OrionLogo } from '../App'
import { useAuth } from '../AuthContext'
import { usePermisos } from '../PermisosContext'

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
    min-height: 82px; overflow: hidden; position: relative;
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
  .sidebar-nav { padding: 12px 10px; flex: 1; overflow-y: auto; overflow-x: hidden; }

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
    margin-bottom: 3px; transition: all 0.18s; position: relative;
    overflow: hidden; white-space: nowrap;
  }
  .nav-item:hover { background: var(--surface2); }
  .nav-item.active { background: rgba(74,143,232,0.12); }
  .nav-item.active::before {
    content: ''; position: absolute; left: 0; top: 20%; bottom: 20%;
    width: 3px; background: var(--accent); border-radius: 99px;
  }

  .nav-icon-wrap {
    width: 38px; height: 38px; flex-shrink: 0; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 19px; transition: all 0.18s; background: var(--surface3);
  }
  .nav-item.active .nav-icon-wrap { background: rgba(74,143,232,0.18); }

  .nav-label { font-size: 14px; font-weight: 600; color: var(--text2); transition: all 0.18s; overflow: hidden; }
  .nav-item:hover .nav-label { color: var(--text); }
  .nav-item.active .nav-label { color: var(--accent); font-weight: 700; }

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
  .sidebar-footer { padding: 14px 12px; border-top: 1.5px solid var(--border); overflow: hidden; }

  .user-row {
    display: flex; align-items: center; gap: 10px; padding: 10px;
    border-radius: 12px; margin-bottom: 10px;
    background: var(--surface2); border: 1.5px solid var(--border);
    overflow: hidden; white-space: nowrap;
  }
  .user-avatar {
    width: 38px; height: 38px; border-radius: 10px;
    background: linear-gradient(135deg, #1B2E6B, #2E5FA3);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 14px; color: #fff;
    flex-shrink: 0; overflow: hidden;
  }
  .user-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .user-info { overflow: hidden; flex: 1; min-width: 0; }
  .user-name { font-size: 13px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .user-email { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .logout-btn {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 10px 12px; border-radius: 10px;
    border: 1.5px solid rgba(239,68,68,0.2);
    background: rgba(239,68,68,0.06); color: #ef4444;
    cursor: pointer; font-family: 'Inter', sans-serif;
    font-size: 13px; font-weight: 600;
    transition: all 0.18s; margin-bottom: 10px;
  }
  .logout-btn:hover { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.4); transform: translateY(-1px); }
  .logout-icon { width: 32px; height: 32px; border-radius: 8px; background: rgba(239,68,68,0.1); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }

  .theme-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 12px; border-radius: 10px;
    background: var(--surface3); border: 1.5px solid var(--border); overflow: hidden;
  }
  .theme-label { font-size: 13px; font-weight: 600; color: var(--text2); display: flex; align-items: center; gap: 7px; white-space: nowrap; }

  /* BOTTOM NAV */
  .bottom-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; background: var(--surface); border-top: 1.5px solid var(--border); padding: 10px 0 16px; z-index: 80; grid-template-columns: repeat(5,1fr); }
  @media (max-width: 768px) { .bottom-nav { display: grid; } }
  .bnav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; padding: 4px 0; color: var(--muted); transition: all 0.2s; }
  .bnav-item.active { color: var(--accent); }
  .bnav-icon { font-size: 22px; }
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
  { icon: '📊', label: 'Dashboard',      path: '/',            permiso: 'ver_dashboard' },
  { icon: '💰', label: 'Caja',            path: '/caja',        permiso: 'ver_punto_venta' },
  { icon: '🛒', label: 'Punto de Venta', path: '/ventas',      permiso: 'ver_punto_venta' },
  { icon: '📦', label: 'Inventario',     path: '/inventario',  permiso: 'ver_inventario' },
  { icon: '🛍️', label: 'Compras',        path: '/compras',     permiso: 'ver_compras' },
  { icon: '👥', label: 'Clientes',       path: '/clientes',    permiso: 'ver_clientes' },
  { section: 'FACTURACIÓN' },
  { icon: '🧾', label: 'Facturas DTE',   path: '/facturas',    permiso: 'ver_facturas' },
  { icon: '📄', label: 'Cotizaciones',   path: '/cotizaciones',permiso: 'ver_cotizaciones' },
  { section: 'SISTEMA' },
  { icon: '🏪', label: 'Sucursales',     path: '/sucursales',  permiso: 'ver_configuracion' },
  { icon: '⚙️', label: 'Configuración',  path: '/config',      permiso: 'ver_configuracion' },
  { icon: '👤', label: 'Usuarios',       path: '/usuarios',    permiso: 'ver_usuarios' },
]

const bottomNavItems = [
  { icon: '📊', label: 'Inicio', path: '/' },
  { icon: '🛒', label: 'Ventas', path: '/ventas' },
  { icon: '📦', label: 'Stock', path: '/inventario' },
  { icon: '🧾', label: 'DTE', path: '/facturas' },
  { icon: '👥', label: 'Clientes', path: '/clientes' },
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

export default function Sidebar() {
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
    if (!item.permiso) return true
    if (loadingPermisos) return true // esperar a que carguen los permisos
    return puede(item.permiso)
  })

  const goTo = (path) => { navigate(path); setMobileOpen(false) }
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
              <div key={i} className={`nav-item ${location.pathname === item.path ? 'active' : ''}`} onClick={() => goTo(item.path)}>
                <div className="nav-icon-wrap">{item.icon}</div>
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
            <div className="logout-icon">🚪</div>
            {!collapsed && <span>Cerrar sesión</span>}
          </button>

          <div className="theme-row">
            <span className="theme-label">
              {dark ? '🌙' : '☀️'}
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
            <span className="bnav-icon">{item.icon}</span>
            <span className="bnav-label">{item.label}</span>
          </div>
        ))}
      </nav>

      {/* MODAL LOGOUT */}
      {showLogout && (
        <div className="modal-overlay" onClick={() => setShowLogout(false)}>
          <div className="logout-modal" onClick={e => e.stopPropagation()}>
            <div className="logout-modal-icon">🚪</div>
            <div className="logout-modal-title">¿Cerrar sesión?</div>
            <div className="logout-modal-sub">
              Saldrás de tu cuenta.<br/>
              <strong style={{ color: 'var(--text)' }}>{getEmail()}</strong>
            </div>
            <div className="logout-modal-actions">
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowLogout(false)}>Cancelar</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleLogout}>🚪 Salir</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}