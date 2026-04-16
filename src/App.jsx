import { Routes, Route, Navigate } from 'react-router-dom'
import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import Login from './Login'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Inventario from './pages/Inventario'
import Clientes from './pages/Clientes'
import PuntoDeVenta from './pages/PuntoDeVenta'
import Facturas from './pages/Facturas'

export const ThemeContext = createContext()
export const SidebarContext = createContext()
export const useTheme = () => useContext(ThemeContext)
export const useSidebar = () => useContext(SidebarContext)

// ── Paleta ORIÓN + ONE GEO SYSTEMS ──
const darkVars = `
  --accent: #2E6FD4;
  --accent-dark: #1B55B0;
  --accent2: #1B2E6B;
  --accent3: #f59e0b;
  --danger: #ef4444;
  --danger-dark: #dc2626;
  --purple: #6366f1;
  --navy: #1B2E6B;
  --navy-light: #2E5FA3;
  --bg: #080c14;
  --surface: #0d1220;
  --surface2: #121929;
  --surface3: #1a2438;
  --border: #1e2d45;
  --border2: #2a3f5f;
  --text: #e8edf5;
  --text2: #8fa3c0;
  --muted: #5a7394;
  --shadow: rgba(0,0,0,0.65);
  --shadow2: rgba(0,0,0,0.35);
  --glow: rgba(46,111,212,0.15);
`
const lightVars = `
  --accent: #2E6FD4;
  --accent-dark: #1B55B0;
  --accent2: #1B2E6B;
  --accent3: #f59e0b;
  --danger: #ef4444;
  --danger-dark: #dc2626;
  --purple: #6366f1;
  --navy: #1B2E6B;
  --navy-light: #2E5FA3;
  --bg: #dde4ef;
  --surface: #eef1f8;
  --surface2: #e4e9f3;
  --surface3: #d8dfed;
  --border: #c2cce0;
  --border2: #adbad4;
  --text: #0d1b35;
  --text2: #2a4070;
  --muted: #6080aa;
  --shadow: rgba(13,27,53,0.15);
  --shadow2: rgba(13,27,53,0.07);
  --glow: rgba(46,111,212,0.12);
`

const baseStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  html { font-size: 15px; }
  body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); overflow-x: hidden; transition: background 0.3s ease, color 0.3s ease; -webkit-font-smoothing: antialiased; }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--muted); }

  .app { display: flex; min-height: 100vh; }
  .main-content { flex: 1; min-width: 0; transition: margin-left 0.3s cubic-bezier(0.4,0,0.2,1); padding: 24px 28px; background: var(--bg); box-sizing: border-box; overflow-x: hidden; }
  .main-content.sidebar-full { margin-left: 260px; width: calc(100% - 260px); }
  .main-content.sidebar-mini { margin-left: 72px; width: calc(100% - 72px); }
  @media (max-width: 768px) { .main-content.sidebar-full, .main-content.sidebar-mini { margin-left: 0; width: 100%; padding: 16px; padding-bottom: 88px; } }

  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 20px; border-radius: 10px; border: none; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; transition: all 0.2s cubic-bezier(0.4,0,0.2,1); white-space: nowrap; }
  .btn:active { transform: scale(0.97); }
  .btn-primary { background: linear-gradient(135deg, #2E6FD4, #1B55B0); color: #fff; box-shadow: 0 4px 14px rgba(46,111,212,0.4); }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(46,111,212,0.5); }
  .btn-secondary { background: var(--surface); color: var(--text); border: 1.5px solid var(--border2); }
  .btn-secondary:hover { border-color: var(--accent); color: var(--accent); background: var(--glow); transform: translateY(-1px); }
  .btn-ghost { background: var(--surface2); color: var(--text2); border: 1.5px solid var(--border); }
  .btn-ghost:hover { background: var(--surface); color: var(--text); border-color: var(--border2); }
  .btn-danger { background: rgba(239,68,68,0.1); color: #ef4444; border: 1.5px solid rgba(239,68,68,0.25); }
  .btn-danger:hover { background: #ef4444; color: #fff; border-color: #ef4444; }
  .btn-icon { width: 38px; height: 38px; padding: 0; border-radius: 10px; }
  .btn-lg { padding: 13px 28px; font-size: 15px; border-radius: 14px; }
  .btn-sm { padding: 7px 14px; font-size: 12px; border-radius: 8px; }

  .card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px var(--shadow2); transition: all 0.2s; }
  .card:hover { border-color: var(--border2); }
  .card-header { padding: 18px 22px; border-bottom: 1.5px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; background: var(--surface); }
  .card-title { font-size: 15px; font-weight: 700; color: var(--text); letter-spacing: -0.3px; }
  .card-action { font-size: 13px; color: var(--accent); cursor: pointer; font-weight: 600; }
  .card-action:hover { opacity: 0.8; }

  .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; gap: 12px; flex-wrap: wrap; }
  .page-title { font-size: 22px; font-weight: 800; letter-spacing: -0.8px; color: var(--text); }
  .page-sub { font-size: 13px; color: var(--muted); margin-top: 3px; }
  .topbar-actions { display: flex; gap: 10px; align-items: center; flex-shrink: 0; }

  .hamburger { display: none; width: 40px; height: 40px; border-radius: 10px; background: var(--surface); border: 1.5px solid var(--border); color: var(--text); font-size: 18px; cursor: pointer; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
  .hamburger:hover { border-color: var(--accent); color: var(--accent); }
  @media (max-width: 768px) { .hamburger { display: flex; } }

  .status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; }
  .status-pill.emitida, .status-pill.activo, .status-pill.completada { background: rgba(46,111,212,0.12); color: #2E6FD4; border: 1px solid rgba(46,111,212,0.2); }
  .status-pill.pendiente, .status-pill.bajo { background: rgba(245,158,11,0.12); color: #f59e0b; border: 1px solid rgba(245,158,11,0.2); }
  .status-pill.anulada, .status-pill.inactivo, .status-pill.agotado { background: rgba(239,68,68,0.12); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }

  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th { padding: 12px 18px; text-align: left; font-size: 11px; color: var(--muted); letter-spacing: 0.8px; font-weight: 700; border-bottom: 1.5px solid var(--border); text-transform: uppercase; background: var(--surface2); white-space: nowrap; }
  td { padding: 14px 18px; font-size: 14px; border-bottom: 1px solid var(--border); color: var(--text); }
  tr:last-child td { border-bottom: none; }
  tbody tr { transition: all 0.2s; }
  tbody tr:hover td { background: var(--surface2); }

  .input { background: var(--surface); border: 1.5px solid var(--border2); border-radius: 10px; padding: 11px 16px; color: var(--text); font-family: 'Inter', sans-serif; font-size: 14px; outline: none; transition: all 0.2s; width: 100%; }
  .input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--glow); }
  .input::placeholder { color: var(--muted); }
  select.input { cursor: pointer; }

  .form-group { display: flex; flex-direction: column; gap: 7px; }
  .form-label { font-size: 12px; font-weight: 700; color: var(--text2); letter-spacing: 0.5px; text-transform: uppercase; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 520px) { .form-grid { grid-template-columns: 1fr; } }

  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 300; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(6px); }
  .modal { background: var(--surface); border: 1.5px solid var(--border); border-radius: 20px; padding: 28px; width: 100%; max-width: 500px; box-shadow: 0 25px 80px var(--shadow); }
  .modal-title { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 22px; }
  .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 24px; }

  .empty-state { text-align: center; padding: 56px 20px; }
  .empty-icon { font-size: 52px; margin-bottom: 14px; opacity: 0.6; }
  .empty-text { font-size: 15px; color: var(--muted); font-weight: 500; }

  .amount { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
  .mono { font-family: 'JetBrains Mono', monospace; }
  .firebase-badge { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,160,0,0.12); color: #ffa000; font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 99px; font-family: 'JetBrains Mono', monospace; border: 1px solid rgba(255,160,0,0.2); }
  .dte-tag { display: inline-flex; align-items: center; gap: 5px; background: rgba(46,111,212,0.12); color: #2E6FD4; font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 99px; font-family: 'JetBrains Mono', monospace; border: 1px solid rgba(46,111,212,0.2); }

  .theme-toggle { width: 46px; height: 26px; border-radius: 99px; border: none; cursor: pointer; position: relative; transition: background 0.3s; flex-shrink: 0; }
  .theme-toggle.dark { background: #2E6FD4; }
  .theme-toggle.light { background: var(--border2); }
  .toggle-knob { position: absolute; top: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: left 0.25s; box-shadow: 0 2px 6px rgba(0,0,0,0.25); }
  .theme-toggle.dark .toggle-knob { left: 23px; }
  .theme-toggle.light .toggle-knob { left: 3px; }

  .kbd { display: inline-flex; align-items: center; justify-content: center; background: var(--surface3); border: 1.5px solid var(--border2); border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; padding: 2px 7px; color: var(--text2); }

  .bottom-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; background: var(--surface); border-top: 1.5px solid var(--border); padding: 10px 0 16px; z-index: 80; grid-template-columns: repeat(5,1fr); }
  @media (max-width: 768px) { .bottom-nav { display: grid; } }
  .bnav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; padding: 4px 0; color: var(--muted); transition: all 0.2s; }
  .bnav-item.active { color: var(--accent); }
  .bnav-icon { font-size: 22px; }
  .bnav-label { font-size: 9px; font-weight: 700; letter-spacing: 0.3px; }

  .overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 90; backdrop-filter: blur(3px); }
  .overlay.open { display: block; }
`

// ── LOGO ORIÓN SVG INLINE ──
export const OrionLogo = ({ width = 180, textColor = '#ffffff' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width={width} height={width}>
    <defs>
      <filter id="oGlowG" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="12" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="oGlowB" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="14" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="oGlowT" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="10" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <radialGradient id="oGG" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#fff"/><stop offset="40%" stopColor="#2EECC5"/><stop offset="100%" stopColor="#00B89F"/>
      </radialGradient>
      <radialGradient id="oGB" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#fff"/><stop offset="40%" stopColor="#5AC8F5"/><stop offset="100%" stopColor="#1E7FBA"/>
      </radialGradient>
      <radialGradient id="oGT" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#fff"/><stop offset="40%" stopColor="#35C4D8"/><stop offset="100%" stopColor="#0E87A8"/>
      </radialGradient>
      <linearGradient id="oLM" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#1A6FA3" stopOpacity="0.85"/><stop offset="100%" stopColor="#00B89F" stopOpacity="0.85"/>
      </linearGradient>
      <linearGradient id="oLB" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#1A6FA3" stopOpacity="0.8"/><stop offset="100%" stopColor="#35C4D8" stopOpacity="0.8"/>
      </linearGradient>
      <linearGradient id="oLR" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#35C4D8" stopOpacity="0.8"/><stop offset="100%" stopColor="#00B89F" stopOpacity="0.8"/>
      </linearGradient>
    </defs>

    {/* Líneas constelación — triángulo completo */}
    <line x1="148" y1="268" x2="292" y2="268" stroke="url(#oLB)" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="148" y1="268" x2="310" y2="118" stroke="url(#oLM)" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="292" y1="268" x2="310" y2="118" stroke="url(#oLR)" strokeWidth="2.2" strokeLinecap="round"/>

    {/* Estrella verde — arriba derecha */}
    <circle cx="310" cy="118" r="42" fill="#2EECC5" opacity="0.07" filter="url(#oGlowG)"/>
    <circle cx="310" cy="118" r="17" fill="url(#oGG)" filter="url(#oGlowG)"/>
    <circle cx="304" cy="112" r="5.5" fill="white" opacity="0.6"/>

    {/* Estrella azul — abajo izquierda */}
    <circle cx="148" cy="268" r="48" fill="#5AC8F5" opacity="0.08" filter="url(#oGlowB)"/>
    <circle cx="148" cy="268" r="19" fill="url(#oGB)" filter="url(#oGlowB)"/>
    <circle cx="141" cy="261" r="6.5" fill="white" opacity="0.55"/>

    {/* Estrella teal — abajo centro */}
    <circle cx="292" cy="268" r="36" fill="#35C4D8" opacity="0.07" filter="url(#oGlowT)"/>
    <circle cx="292" cy="268" r="14" fill="url(#oGT)" filter="url(#oGlowT)"/>
    <circle cx="287" cy="263" r="4.5" fill="white" opacity="0.55"/>

    {/* Texto ORIÓN */}
    <text x="250" y="390" textAnchor="middle" fontFamily="'Arial Black',Arial,sans-serif" fontSize="90" fontWeight="900" letterSpacing="3" fill={textColor}>ORIÓN</text>

    {/* Línea decorativa */}
    <line x1="75" y1="412" x2="425" y2="412" stroke="#4A9FD4" strokeWidth="1" opacity="0.3"/>

    {/* Subtexto */}
    <text x="250" y="442" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="16.5" fontWeight="600" letterSpacing="2" fill="#4ECFB3" opacity="0.85">Gestión de Ventas y Facturación</text>
  </svg>
)

// ── SPLASH SCREEN ──
function SplashScreen({ onDone }) {
  const [exiting, setExiting] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => { setExiting(true); setTimeout(onDone, 500) }, 3000)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        .splash{position:fixed;inset:0;z-index:9999;background:#080c14;display:flex;flex-direction:column;align-items:center;justify-content:center;}
        .splash-logo{animation:sFadeIn 0.9s ease forwards;opacity:0;}
        .splash-bar-wrap{width:220px;height:3px;background:rgba(255,255,255,0.08);border-radius:99px;margin-top:36px;overflow:hidden;animation:sFadeIn 0.5s 0.6s ease forwards;opacity:0;}
        .splash-bar{height:100%;width:0%;background:linear-gradient(90deg,#2E6FD4,#1B2E6B);border-radius:99px;animation:sProgress 2.2s 0.8s ease forwards;}
        .splash-sub{font-family:'Inter',sans-serif;font-size:11px;color:rgba(255,255,255,0.2);letter-spacing:2px;margin-top:14px;text-transform:uppercase;animation:sFadeIn 0.5s 0.8s ease forwards;opacity:0;}
        .splash-exit{animation:sFadeOut 0.5s ease forwards;}
        @keyframes sFadeIn{to{opacity:1}}
        @keyframes sFadeOut{from{opacity:1}to{opacity:0;pointer-events:none}}
        @keyframes sProgress{0%{width:0%}60%{width:72%}100%{width:100%}}
      `}</style>
      <div className={`splash ${exiting ? 'splash-exit' : ''}`}>
        <div className="splash-logo"><OrionLogo width={260} textColor="#ffffff"/></div>
        <div className="splash-bar-wrap"><div className="splash-bar"/></div>
        <div className="splash-sub">ONE GEO SYSTEMS</div>
      </div>
    </>
  )
}

// ── LOADING ──
function LoadingScreen() {
  return (
    <>
      <style>{`
        *{margin:0;padding:0;box-sizing:border-box;}
        .ls{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#080c14;flex-direction:column;gap:16px;}
        .ls-logo{animation:lsPulse 1.5s infinite;}
        .ls-text{font-size:13px;color:rgba(255,255,255,0.25);font-family:sans-serif;letter-spacing:1px;}
        @keyframes lsPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(0.96)}}
      `}</style>
      <div className="ls">
        <div className="ls-logo"><OrionLogo width={140} textColor="#ffffff"/></div>
        <div className="ls-text">Cargando...</div>
      </div>
    </>
  )
}

// ── APP PROTEGIDA ──
function ProtectedApp() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') !== 'light')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar') === 'collapsed')
  useEffect(() => { localStorage.setItem('theme', dark ? 'dark' : 'light') }, [dark])
  useEffect(() => { localStorage.setItem('sidebar', collapsed ? 'collapsed' : 'full') }, [collapsed])

  return (
    <ThemeContext.Provider value={{ dark, setDark }}>
      <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
        <style>{baseStyles}</style>
        <style>{`:root { ${dark ? darkVars : lightVars} }`}</style>
        <div className={`app ${dark ? 'dark-mode' : 'light-mode'}`}>
          <Sidebar />
          <div className={`main-content ${collapsed ? 'sidebar-mini' : 'sidebar-full'}`}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/inventario" element={<Inventario />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/ventas" element={<PuntoDeVenta />} />
              <Route path="/facturas" element={<Facturas />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
        </div>
      </SidebarContext.Provider>
    </ThemeContext.Provider>
  )
}

// ── APP PRINCIPAL ──
export default function App() {
  const authContext = useAuth()
  const [splashDone, setSplashDone] = useState(false)

  if (!authContext) return <LoadingScreen />
  if (!splashDone) return <SplashScreen onDone={() => setSplashDone(true)} />
  if (authContext.loading) return <LoadingScreen />
  if (!authContext.user) return <Login />
  return <ProtectedApp />
}
