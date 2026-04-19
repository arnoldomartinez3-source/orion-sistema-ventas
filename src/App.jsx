import { Routes, Route, Navigate } from 'react-router-dom'
import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import { PermisosProvider } from './PermisosContext'
import Login from './Login'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Inventario from './pages/Inventario'
import Clientes from './pages/Clientes'
import PuntoDeVenta from './pages/PuntoDeVenta'
import Facturas from './pages/Facturas'
import Configuracion from './pages/Configuracion'
import Compras from './pages/Compras'
import Cotizaciones from './pages/Cotizaciones'
import Usuarios from './pages/Usuarios'

export const ThemeContext = createContext()
export const SidebarContext = createContext()
export const useTheme = () => useContext(ThemeContext)
export const useSidebar = () => useContext(SidebarContext)

const darkVars = `
  --accent: #4A8FE8;
  --accent-dark: #2E6FD4;
  --accent2: #2E5FA3;
  --accent3: #f59e0b;
  --danger: #ef4444;
  --danger-dark: #dc2626;
  --navy: #1B2E6B;
  --navy-light: #2E5FA3;
  --bg: #07090f;
  --surface: #0e1219;
  --surface2: #141b27;
  --surface3: #1c2535;
  --border: #222d42;
  --border2: #2e3f5c;
  --text: #f0f4fc;
  --text2: #c8d8f0;
  --muted: #7a9cc0;
  --shadow: rgba(0,0,0,0.7);
  --shadow2: rgba(0,0,0,0.4);
  --glow: rgba(74,143,232,0.18);
`
const lightVars = `
  --accent: #2E6FD4;
  --accent-dark: #1B55B0;
  --accent2: #1B2E6B;
  --accent3: #f59e0b;
  --danger: #ef4444;
  --danger-dark: #dc2626;
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
  body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); overflow-x: hidden; transition: background 0.3s, color 0.3s; -webkit-font-smoothing: antialiased; }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--muted); }

  .app { display: flex; min-height: 100vh; }
  .main-content { flex: 1; min-width: 0; transition: margin-left 0.3s cubic-bezier(0.4,0,0.2,1); padding: 24px 28px; background: var(--bg); box-sizing: border-box; overflow-x: hidden; }
  .main-content.sidebar-full { margin-left: 260px; width: calc(100% - 260px); }
  .main-content.sidebar-mini { margin-left: 72px; width: calc(100% - 72px); }
  @media (max-width: 768px) { .main-content.sidebar-full, .main-content.sidebar-mini { margin-left: 0; width: 100%; padding: 16px; padding-bottom: 88px; } }

  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 20px; border-radius: 10px; border: none; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; transition: all 0.2s; white-space: nowrap; }
  .btn:active { transform: scale(0.97); }
  .btn-primary { background: linear-gradient(135deg, var(--accent), var(--accent-dark)); color: #fff; box-shadow: 0 4px 14px rgba(46,111,212,0.4); }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(46,111,212,0.5); }
  .btn-secondary { background: var(--surface); color: var(--text); border: 1.5px solid var(--border2); }
  .btn-secondary:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }
  .btn-ghost { background: var(--surface2); color: var(--text2); border: 1.5px solid var(--border); }
  .btn-ghost:hover { background: var(--surface); color: var(--text); border-color: var(--border2); }
  .btn-danger { background: rgba(239,68,68,0.1); color: #ef4444; border: 1.5px solid rgba(239,68,68,0.25); }
  .btn-danger:hover { background: #ef4444; color: #fff; }
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
  .status-pill.emitida, .status-pill.activo, .status-pill.completada { background: rgba(74,143,232,0.15); color: var(--accent); border: 1px solid rgba(74,143,232,0.25); }
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
  .dte-tag { display: inline-flex; align-items: center; gap: 5px; background: rgba(74,143,232,0.12); color: var(--accent); font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 99px; font-family: 'JetBrains Mono', monospace; border: 1px solid rgba(74,143,232,0.2); }

  .theme-toggle { width: 46px; height: 26px; border-radius: 99px; border: none; cursor: pointer; position: relative; transition: background 0.3s; flex-shrink: 0; }
  .theme-toggle.dark { background: var(--accent); }
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

// ══════════════════════════════════════════════════════
// LOGO ORIÓN SVG
// Estrellas:
//   Verde (A): cx=310 cy=118  arriba derecha
//   Azul  (B): cx=148 cy=268  abajo izquierda
//   Teal  (C): cx=292 cy=268  abajo centro
//
// 3 LÍNEAS (triángulo completo):
//   L1: B→A  diagonal izquierda  (148,268)→(310,118)
//   L2: B→C  base horizontal     (148,268)→(292,268)
//   L3: C→A  diagonal derecha    (292,268)→(310,118)  ← SIEMPRE INCLUIDA
// ══════════════════════════════════════════════════════
export const OrionLogo = ({ width = 180, textColor = '#ffffff' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="50 80 420 400" width={width} height={width}>
    <defs>
      <filter id="fG" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="10" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="fB" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="12" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="fT" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="8" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <radialGradient id="rG" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#fff"/>
        <stop offset="35%" stopColor="#2EECC5"/>
        <stop offset="100%" stopColor="#00B89F"/>
      </radialGradient>
      <radialGradient id="rB" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#fff"/>
        <stop offset="35%" stopColor="#5AC8F5"/>
        <stop offset="100%" stopColor="#1E7FBA"/>
      </radialGradient>
      <radialGradient id="rT" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#fff"/>
        <stop offset="35%" stopColor="#35C4D8"/>
        <stop offset="100%" stopColor="#0E87A8"/>
      </radialGradient>
      <linearGradient id="lL1" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#5AC8F5" stopOpacity="1"/>
        <stop offset="100%" stopColor="#2EECC5" stopOpacity="1"/>
      </linearGradient>
      <linearGradient id="lL2" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#5AC8F5" stopOpacity="1"/>
        <stop offset="100%" stopColor="#35C4D8" stopOpacity="1"/>
      </linearGradient>
      <linearGradient id="lL3" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#35C4D8" stopOpacity="1"/>
        <stop offset="100%" stopColor="#2EECC5" stopOpacity="1"/>
      </linearGradient>
    </defs>

    {/* ══ LÍNEA 1: B(148,268) → A(310,118) — diagonal izquierda ══ */}
    <line x1="148" y1="268" x2="310" y2="118"
          stroke="url(#lL1)" strokeWidth="3" strokeLinecap="round" opacity="0.9"/>

    {/* ══ LÍNEA 2: B(148,268) → C(292,268) — base horizontal ══ */}
    <line x1="148" y1="268" x2="292" y2="268"
          stroke="url(#lL2)" strokeWidth="3" strokeLinecap="round" opacity="0.9"/>

    {/* ══ LÍNEA 3: C(292,268) → A(310,118) — diagonal derecha ══ */}
    <line x1="292" y1="268" x2="310" y2="118"
          stroke="url(#lL3)" strokeWidth="3" strokeLinecap="round" opacity="0.9"/>

    {/* ══ ESTRELLA VERDE A — arriba derecha ══ */}
    <circle cx="310" cy="118" r="40" fill="#2EECC5" opacity="0.08"/>
    <circle cx="310" cy="118" r="18" fill="url(#rG)" filter="url(#fG)"/>
    <circle cx="304" cy="112" r="6" fill="white" opacity="0.6"/>

    {/* ══ ESTRELLA AZUL B — abajo izquierda ══ */}
    <circle cx="148" cy="268" r="44" fill="#5AC8F5" opacity="0.08"/>
    <circle cx="148" cy="268" r="21" fill="url(#rB)" filter="url(#fB)"/>
    <circle cx="141" cy="261" r="7" fill="white" opacity="0.55"/>

    {/* ══ ESTRELLA TEAL C — abajo centro ══ */}
    <circle cx="292" cy="268" r="32" fill="#35C4D8" opacity="0.07"/>
    <circle cx="292" cy="268" r="15" fill="url(#rT)" filter="url(#fT)"/>
    <circle cx="287" cy="263" r="5" fill="white" opacity="0.55"/>

    {/* ══ TEXTO ORIÓN ══ */}
    <text x="230" y="390" textAnchor="middle"
          fontFamily="'Arial Black',Arial,sans-serif"
          fontSize="86" fontWeight="900" letterSpacing="4"
          fill={textColor}>ORIÓN</text>

    {/* ══ LÍNEA DECORATIVA ══ */}
    <line x1="75" y1="410" x2="400" y2="410"
          stroke="#4A9FD4" strokeWidth="1" opacity="0.35"/>

    {/* ══ SUBTEXTO ══ */}
    <text x="230" y="438" textAnchor="middle"
          fontFamily="Arial,sans-serif"
          fontSize="15.5" fontWeight="600" letterSpacing="2.5"
          fill="#4ECFB3" opacity="0.9">Gestión de Ventas y Facturación</text>
  </svg>
)

// ══ LOGO ONE GEO SYSTEMS (ojo geométrico simplificado) ══
const OneGeoLogo = ({ opacity = 1 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="200" height="120" style={{ opacity }}>
    <defs>
      <linearGradient id="ogEye" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4A7BC4"/>
        <stop offset="100%" stopColor="#1B2E6B"/>
      </linearGradient>
    </defs>
    {/* Ojo geométrico */}
    <ellipse cx="45" cy="45" rx="38" ry="28" fill="none" stroke="url(#ogEye)" strokeWidth="3"/>
    <line x1="7" y1="45" x2="20" y2="30" stroke="#4A7BC4" strokeWidth="2"/>
    <line x1="83" y1="45" x2="70" y2="30" stroke="#4A7BC4" strokeWidth="2"/>
    <circle cx="45" cy="45" r="14" fill="none" stroke="#2E5FA3" strokeWidth="2.5"/>
    <circle cx="45" cy="45" r="7" fill="#1B2E6B"/>
    <circle cx="45" cy="45" r="3" fill="#4A7BC4"/>
    {/* Texto */}
    <text x="92" y="35" fontFamily="'Arial Black',Arial,sans-serif" fontSize="16" fontWeight="900" fill="#ffffff" letterSpacing="0.5">ONE</text>
    <text x="92" y="52" fontFamily="'Arial Black',Arial,sans-serif" fontSize="16" fontWeight="900" fill="#ffffff" letterSpacing="0.5">GEO</text>
    <text x="92" y="69" fontFamily="'Arial Black',Arial,sans-serif" fontSize="16" fontWeight="900" fill="#ffffff" letterSpacing="0.5">SYSTEMS</text>
    <text x="92" y="86" fontFamily="Arial,sans-serif" fontSize="8" fontWeight="500" fill="#4A7BC4" letterSpacing="1.5" opacity="0.8">SOLUCIONES TECNOLÓGICAS</text>
  </svg>
)

// ══ SPLASH SCREEN — primero ORIÓN, luego ONE GEO con desvanecimiento ══
function SplashScreen({ onDone }) {
  const [fase, setFase] = useState(1) // 1=orion, 2=transicion, 3=onegeo, 4=salida

  useEffect(() => {
    const t1 = setTimeout(() => setFase(2), 2000) // fade out orion
    const t2 = setTimeout(() => setFase(3), 2000) // fade in one geo
    const t3 = setTimeout(() => setFase(4), 4700) // fade out todo
    const t4 = setTimeout(onDone, 5200)            // termina — total 5s
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [onDone])

  return (
    <>
      <style>{`
        *{margin:0;padding:0;box-sizing:border-box;}
        .splash{
          position:fixed;inset:0;z-index:9999;
          background:#0a1628;
          display:flex;flex-direction:column;
          align-items:center;justify-content:center;
        }
        .splash-exit{animation:sFO 0.5s ease forwards;}
        @keyframes sFO{from{opacity:1}to{opacity:0;pointer-events:none}}

        /* BLOQUE ORIÓN */
        .sp-orion{
          position:absolute;
          display:flex;flex-direction:column;align-items:center;
          transition:opacity 0.5s ease, transform 0.5s ease;
          text-align:center;
        }
        .sp-orion.visible{opacity:1;transform:translateY(0);}
        .sp-orion.hidden{opacity:0;transform:translateY(-16px);pointer-events:none;}

        .sp-orion-title{
          font-family:'Georgia','Times New Roman',serif;
          font-size:72px;font-weight:900;
          color:#ffffff;
          letter-spacing:8px;text-transform:uppercase;
          text-shadow:0 0 60px rgba(74,143,232,0.5), 0 2px 4px rgba(0,0,0,0.5);
          line-height:1;
          animation:spFI 0.8s ease forwards;opacity:0;
        }
        .sp-orion-sub{
          font-family:'Segoe UI',Arial,sans-serif;
          font-size:15px;font-weight:400;
          color:rgba(255,255,255,0.55);
          letter-spacing:3px;text-transform:uppercase;
          margin-top:14px;
          animation:spFI 0.8s 0.3s ease forwards;opacity:0;
        }
        .sp-line{
          width:60px;height:2px;
          background:linear-gradient(90deg,#4A8FE8,#2EECC5);
          border-radius:99px;margin-top:20px;
          animation:spFI 0.8s 0.5s ease forwards;opacity:0;
        }

        /* BLOQUE ONE GEO */
        .sp-geo{
          position:absolute;
          display:flex;flex-direction:column;align-items:center;
          transition:opacity 0.5s ease, transform 0.5s ease;
          text-align:center;
        }
        .sp-geo.visible{opacity:1;transform:translateY(0);animation:spGeoIn 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards;}
.sp-geo.hidden{opacity:0;transform:translateY(24px);pointer-events:none;}
@keyframes spGeoIn{
  0%{opacity:0;transform:translateY(24px) scale(0.95);}
  60%{opacity:1;}
  100%{opacity:1;transform:translateY(0) scale(1);}
}

        .sp-geo-one{
          font-family:'Georgia','Times New Roman',serif;
          font-size:56px;font-weight:900;
          color:#ffffff;
          letter-spacing:6px;text-transform:uppercase;
          line-height:1;
          text-shadow:0 2px 4px rgba(0,0,0,0.4);
        }
        .sp-geo-geo{
          font-family:'Georgia','Times New Roman',serif;
          font-size:56px;font-weight:900;
          color:#4A8FE8;
          letter-spacing:6px;text-transform:uppercase;
          line-height:1;
          text-shadow:0 0 40px rgba(74,143,232,0.4);
        }
        .sp-geo-systems{
          font-family:'Segoe UI',Arial,sans-serif;
          font-size:16px;font-weight:700;
          color:rgba(255,255,255,0.5);
          letter-spacing:8px;text-transform:uppercase;
          margin-top:10px;
        }
        .sp-geo-tagline{
          font-family:'Segoe UI',Arial,sans-serif;
          font-size:12px;font-weight:400;
          color:rgba(255,255,255,0.3);
          letter-spacing:2px;
          margin-top:8px;
        }
        .sp-geo-dots{
          color:rgba(74,143,232,0.6);
          margin:0 8px;
        }

        @keyframes spFI{to{opacity:1}}
      `}</style>

      <div className={`splash ${fase === 4 ? 'splash-exit' : ''}`}>

        {/* ORIÓN — fases 1-2 */}
        <div className={`sp-orion ${fase <= 2 ? 'visible' : 'hidden'}`}>
          <div className="sp-orion-title">ORIÓN</div>
          <div className="sp-line"/>
          <div className="sp-orion-sub">Gestión de Ventas y Facturación</div>
        </div>

        {/* ONE GEO SYSTEMS — fase 3 */}
        <div className={`sp-geo ${fase >= 3 ? 'visible' : 'hidden'}`}>
          <div style={{display:'flex',alignItems:'baseline',gap:16}}>
            <span className="sp-geo-one">ONE</span>
            <span className="sp-geo-geo">GEO</span>
          </div>
          <div className="sp-geo-systems">S Y S T E M S</div>
          <div className="sp-geo-tagline">
            Control <span className="sp-geo-dots">·</span>
            Seguridad <span className="sp-geo-dots">·</span>
            Innovación
          </div>
        </div>

      </div>
    </>
  )
}

// ── LOADING ──
function LoadingScreen() {
  return (
    <>
      <style>{`*{margin:0;padding:0;box-sizing:border-box;}.ls{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#07090f;flex-direction:column;gap:16px;}.ls-logo{animation:lsP 1.5s infinite;}.ls-text{font-size:13px;color:rgba(255,255,255,0.25);font-family:sans-serif;letter-spacing:1px;}@keyframes lsP{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(0.96)}}`}</style>
      <div className="ls">
        <div className="ls-logo"><OrionLogo width={140} textColor="#ffffff"/></div>
        <div className="ls-text">Cargando ORIÓN...</div>
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
    <PermisosProvider>
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
                <Route path="/config" element={<Configuracion />} />
                <Route path="/compras" element={<Compras />} />
                <Route path="/cotizaciones" element={<Cotizaciones />} />
                <Route path="/usuarios" element={<Usuarios />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </div>
          </div>
        </SidebarContext.Provider>
      </ThemeContext.Provider>
    </PermisosProvider>
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
