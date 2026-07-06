import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTheme, useSidebar, OrionLogo } from '../App'
import { useAuth } from '../AuthContext'
import { usePermisos } from '../PermisosContext'
import { NAV_ITEMS, NavIcon, NAV_COLOR } from '../navConfig'
import { db } from '../firebase'
import { doc, getDoc } from 'firebase/firestore'

const sidebarStyles = `
  .sidebar {
    width: 260px;
    background: linear-gradient(185deg, #1b2f57 0%, #101d3a 100%);
    border-right: 1px solid rgba(255,255,255,0.07);
    display: flex; flex-direction: column;
    position: fixed; height: 100vh; z-index: 100;
    transition: width 0.3s cubic-bezier(0.4,0,0.2,1);
    overflow: visible;
  }
  .sidebar.collapsed { width: 92px; }
  @media (max-width: 768px) {
    .sidebar { width: 260px !important; transform: translateX(-100%); transition: transform 0.3s; }
    .sidebar.mobile-open { transform: translateX(0); box-shadow: 8px 0 40px rgba(0,0,0,0.5); }
  }

  /* LOGO */
  .sidebar-logo {
    padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    min-height: 64px; overflow: hidden; position: relative;
    background: rgba(0,0,0,0.18);
  }
  .sidebar.collapsed .sidebar-logo { justify-content: center; padding: 12px 0; }
  /* Recuadro compacto del logo (no ocupa todo el ancho → no tanto blanco) */
  .sidebar-logo-box {
    background: #ffffff; border-radius: 11px; padding: 5px 12px;
    height: 48px; flex: 1; min-width: 0; max-width: 170px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 3px 12px rgba(0,0,0,0.3); box-sizing: border-box;
  }
  /* Hamburguesa dentro del header, a la derecha del logo */
  .sidebar-ham {
    flex-shrink: 0; width: 38px; height: 38px; border-radius: 10px;
    background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
    color: #fff; cursor: pointer; padding: 0;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.18s, border-color 0.18s, color 0.18s;
  }
  .sidebar-ham:hover { background: rgba(212,168,58,0.18); border-color: #d4a83a; color: #d4a83a; }
  .sidebar-logo-mini-btn { cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .logo-box-mini {
    width: 52px; height: 52px; background: #fff; border-radius: 11px; padding: 5px;
    display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 12px rgba(0,0,0,0.3);
  }

  /* Logo mini — solo las 3 estrellas con las 3 líneas */
  .sidebar-logo-mini {
    width: 44px; height: 44px;
    background: linear-gradient(135deg, #0d1830, #1B2E6B);
    border-radius: 12px; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 14px rgba(27,46,107,0.5);
  }


  .close-btn-mobile { display: none; position: absolute; top: 16px; right: 14px; background: none; border: none; color: var(--muted); font-size: 22px; cursor: pointer; }
  @media (max-width: 768px) { .close-btn-mobile { display: block; } }

  /* NAV */
  .sidebar-nav { padding: 6px 10px; flex: 1; overflow-y: auto; overflow-x: hidden; }

  .nav-section-label {
    font-size: 10px; font-weight: 700; color: rgba(212,168,58,0.85);
    letter-spacing: 1.2px; text-transform: uppercase;
    padding: 0 10px 3px; margin-top: 8px;
    white-space: nowrap; overflow: hidden; transition: opacity 0.2s;
  }
  .sidebar.collapsed .nav-section-label { opacity: 0; }

  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 10px; border-radius: 10px; cursor: pointer;
    margin-bottom: 2px; transition: background 0.18s, transform 0.18s;
    position: relative; overflow: hidden; white-space: nowrap;
  }
  .nav-item:hover { background: rgba(255,255,255,0.06); transform: translateX(4px); }
  .nav-item:active { transform: translateX(4px) scale(0.98); }
  .nav-item.active { background: rgba(255,255,255,0.08); }
  .nav-item.active:hover { transform: translateX(4px); }
  .nav-item.active::before {
    content: ''; position: absolute; left: 0; top: 18%; bottom: 18%;
    width: 3px; background: #d4a83a; border-radius: 99px;
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
    width: 32px; height: 32px; flex-shrink: 0; border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.18s, transform 0.18s, border-color 0.18s;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 10%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--c) 20%, transparent);
  }
  .nav-icon-wrap svg { width: 18px; height: 18px; }
  .nav-item:hover .nav-icon-wrap, .nav-item.active .nav-icon-wrap {
    transform: scale(1.1);
    background: color-mix(in srgb, var(--c) 28%, transparent);
    border-color: var(--c);
  }
  .nav-item.active .nav-icon-wrap { transform: none; }

  .nav-label { font-size: 13px; font-weight: 600; color: #ffffff; transition: all 0.18s; overflow: hidden; }
  .nav-item:hover .nav-label { color: #fff; }
  .nav-item.active .nav-label { color: #fff; font-weight: 700; }

  .nav-tooltip {
    position: absolute; left: 82px; top: 50%; transform: translateY(-50%);
    background: var(--surface3); border: 1.5px solid var(--border2);
    color: var(--text); font-size: 13px; font-weight: 600;
    padding: 6px 12px; border-radius: 8px; white-space: nowrap;
    pointer-events: none; opacity: 0; transition: opacity 0.15s;
    box-shadow: 0 4px 16px var(--shadow); z-index: 999;
  }
  .sidebar.collapsed .nav-item:hover .nav-tooltip { opacity: 1; }

  /* COLAPSADO: ícono arriba + mini etiqueta debajo, centrado. Ancho 92px lo permite. */
  .sidebar.collapsed .nav-item {
    flex-direction: column; gap: 4px; padding: 8px 4px; justify-content: center;
  }
  .sidebar.collapsed .nav-item:hover { transform: none; } /* sin desplazar, está centrado */
  .sidebar.collapsed .nav-item.active:hover { transform: none; }
  .sidebar.collapsed .nav-label {
    font-size: 10px; font-weight: 700; text-align: center;
    width: 100%; line-height: 1.1; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  .sidebar.collapsed .nav-item.active::before { top: auto; bottom: 0; left: 20%; right: 20%; width: auto; height: 3px; }
  /* Con etiqueta visible ya no hace falta el tooltip al colapsar */
  .sidebar.collapsed .nav-tooltip { display: none; }

  /* FOOTER */
  .sidebar-footer { padding: 8px 10px; border-top: 1px solid rgba(255,255,255,0.08); overflow: hidden; }

  .user-row {
    display: flex; align-items: center; gap: 8px; padding: 8px;
    border-radius: 10px; margin-bottom: 6px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09);
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
  .user-name { font-size: 12px; font-weight: 700; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .user-email { font-size: 10px; color: rgba(255,255,255,0.7); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); overflow: hidden;
  }
  .theme-label { font-size: 12px; font-weight: 600; color: #ffffff; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .theme-label svg { width: 16px; height: 16px; }

  /* BOTTOM NAV */
  .bottom-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; background: var(--surface); border-top: 1.5px solid var(--border); padding: 10px 0 16px; z-index: 80; grid-template-columns: repeat(5,1fr); }
  @media (max-width: 768px) { .bottom-nav { display: grid; } }
  .bnav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; padding: 4px 0; color: var(--muted); transition: all 0.2s; }
  .bnav-item.active { color: var(--accent); }
  .bnav-icon { font-size: 22px; display: flex; align-items: center; justify-content: center; }
  .bnav-icon svg { width: 24px; height: 24px; }
  .bnav-label { font-size: 9px; font-weight: 700; letter-spacing: 0.3px; }

  /* OVERLAY (solo móvil) — oculto y sin capturar clics en desktop.
     Sin este CSS la clase quedaba tapando la pantalla y congelaba la página. */
  .overlay {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 70;
  }
  @media (max-width: 768px) {
    .overlay.open { display: block; }
  }

  /* HAMBURGER (solo móvil) — oculto en desktop */
  .hamburger {
    display: none;
    position: fixed; top: 18px; left: 18px; z-index: 85;
    width: 42px; height: 42px; border-radius: 11px;
    border: 1.5px solid var(--border); background: var(--surface);
    color: var(--text); font-size: 20px; cursor: pointer;
    align-items: center; justify-content: center;
  }
  @media (max-width: 768px) {
    .hamburger { display: flex; }
  }

  /* MODAL LOGOUT */
  .logout-modal { background: var(--surface); border: 1.5px solid var(--border); border-radius: 20px; padding: 28px; width: 100%; max-width: 360px; box-shadow: 0 25px 80px var(--shadow); text-align: center; }
  .logout-modal-icon { font-size: 48px; margin-bottom: 12px; }
  .logout-modal-title { font-size: 18px; font-weight: 800; margin-bottom: 8px; color: var(--text); }
  .logout-modal-sub { font-size: 14px; color: var(--muted); margin-bottom: 24px; }
  .logout-modal-actions { display: flex; gap: 10px; }
`

// navItems ahora incluye permisos requeridos


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

export default function Sidebar({ puedeCertificar = false, esMaestro = false }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { dark, setDark } = useTheme()
  const { collapsed, setCollapsed } = useSidebar()
  const { user, logout } = useAuth()
  const { puede, esAdmin, rol, usuarioData, loading: loadingPermisos, empresaId, moduloActivo } = usePermisos()
  const [logoEmpresa, setLogoEmpresa] = useState('')

  // Cargar el logo de la empresa desde la colección 'empresas' (donde lo guarda el Panel One Geo).
  useEffect(() => {
    const id = empresaId || usuarioData?.empresaId
    if (!id) return
    getDoc(doc(db, 'empresas', id))
      .then(snap => { if (snap.exists() && snap.data().logo) setLogoEmpresa(snap.data().logo) })
      .catch(() => {})
  }, [empresaId, usuarioData])

  // Filtrar items del nav según permisos
  // Si los permisos aún están cargando, mostrar todos para evitar flash de sidebar vacío
  const navVisibles = NAV_ITEMS.filter(item => {
    if (item.section) return true
    // Candado de NEGOCIO: si el módulo está apagado para la empresa, se oculta
    // aunque el usuario tenga el permiso. (moduloActivo devuelve true para el maestro.)
    if (item.modulo && !moduloActivo(item.modulo)) return false
    // El item de certificación tiene su propio candado (correo maestro + flag),
    // que ya se resolvió en App.jsx y llega como prop.
    if (item.soloCertificacion) return puedeCertificar
    if (item.soloMaestro) return esMaestro
    if (!item.permiso) return true
    if (loadingPermisos) return true // esperar a que carguen los permisos
    if (esAdmin) return true // un administrador ve todos los módulos
    return puede(item.permiso)
  })
  // Ocultar rótulos de sección que quedaron SIN ítems visibles debajo
  // (p. ej. "PERSONAL" para un cajero, o si el permiso aún no se otorgó).
  const navItems = navVisibles.filter((item, i) => {
    if (!item.section) return true
    const sig = navVisibles[i + 1]
    return sig && !sig.section
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

      <button className="hamburger" onClick={() => setMobileOpen(true)}>☰</button>
      <div className={`overlay ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} />

      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* LOGO — empresa si existe; si no, ORIÓN */}
        <div className="sidebar-logo">
          {collapsed ? (
            <div className="sidebar-logo-mini-btn" onClick={() => setCollapsed(false)} title="Expandir menú">
              {logoEmpresa
                ? <div className="logo-box-mini">
                    <img src={logoEmpresa} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  </div>
                : <div className="sidebar-logo-mini"><OrionMini /></div>}
            </div>
          ) : (
            <>
              <div className="sidebar-logo-box">
                {logoEmpresa
                  ? <img src={logoEmpresa} alt="Logo de la empresa" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
                  : <div style={{ textAlign: 'center', lineHeight: 1 }}>
                      <div style={{ fontFamily: "'Georgia','Times New Roman',serif", fontSize: 19, fontWeight: 900, color: '#14213D', letterSpacing: 3, textTransform: 'uppercase' }}>ORIÓN</div>
                      <div style={{ width: 26, height: 2, background: 'linear-gradient(90deg,#1C2F5E,#C19A2E)', borderRadius: 99, margin: '3px auto 0' }}/>
                    </div>}
              </div>
              <button className="sidebar-ham" onClick={() => setCollapsed(true)} title="Contraer menú">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="20" height="20">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
            </>
          )}
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
                    <span style={{ fontSize: 9, fontWeight: 700, background: '#d4a83a', color: '#14213d', padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
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
        <div className="modal-overlay">
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