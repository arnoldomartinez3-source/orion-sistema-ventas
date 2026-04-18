import { useState } from 'react'
import { useAuth } from './AuthContext'
import { OrionLogo } from './App'

const loginStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; min-height: 100vh; -webkit-font-smoothing: antialiased; }

  /* ── LAYOUT 2 COLUMNAS — izquierda angosta, derecha amplia ── */
  .login-page {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 380px 1fr;
    background: #0a1628;
  }
  @media (max-width: 960px) { .login-page { grid-template-columns: 1fr; } }

  /* ── COLUMNA IZQUIERDA — ORIÓN angosta ── */
  .login-left {
    background: linear-gradient(170deg, #091420 0%, #0c1d38 60%, #091525 100%);
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    padding: 40px 28px; position: relative; overflow: hidden;
    border-right: 1px solid rgba(74,143,232,0.1);
  }
  @media (max-width: 960px) { .login-left { display: none; } }

  .login-left::before {
    content: ''; position: absolute;
    width: 350px; height: 350px;
    background: radial-gradient(circle, rgba(46,236,197,0.06) 0%, transparent 70%);
    top: 35%; left: 50%; transform: translate(-50%, -50%);
    border-radius: 50%; pointer-events: none;
  }

  .left-content {
    position: relative; z-index: 1;
    text-align: center; width: 100%;
  }

  .left-tagline {
    font-size: 12px; color: rgba(255,255,255,0.3);
    line-height: 1.7; margin: 14px 0 24px;
  }

  .features { display: flex; flex-direction: column; gap: 11px; text-align: left; }
  .feature-item { display: flex; align-items: center; gap: 11px; }
  .feature-icon {
    width: 34px; height: 34px; border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; flex-shrink: 0;
  }
  .feature-label { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.45); }

  /* Línea decorativa bajo ORIÓN */
  .orion-sep {
    width: 36px; height: 2px;
    background: linear-gradient(90deg, #2E6FD4, #2EECC5);
    border-radius: 99px; margin: 12px auto 0;
  }

  /* Powered by */
  .powered-by {
    font-size: 9px; color: rgba(255,255,255,0.15);
    letter-spacing: 1.5px; text-transform: uppercase;
    margin-top: 28px; text-align: center;
  }

  /* ── COLUMNA DERECHA — FORM con logo empresa ── */
  .login-right {
    background: #0a1628;
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    padding: 40px 48px;
  }
  @media (max-width: 600px) { .login-right { padding: 40px 24px; } }

  .login-box { width: 100%; max-width: 440px; }

  /* ── LOGO EMPRESA — arriba del Bienvenido ── */
  .empresa-logo-wrap {
    display: flex; justify-content: flex-start;
    margin-bottom: 24px;
  }

  .empresa-card {
    background: #ffffff;
    border-radius: 16px;
    padding: 16px 24px;
    display: inline-flex;
    align-items: center; justify-content: center;
    box-shadow: 0 4px 24px rgba(0,0,0,0.35);
    min-width: 160px; min-height: 72px;
  }

  /* Móvil — logo ORIÓN arriba */
  .mobile-orion { display: none; text-align: center; margin-bottom: 24px; }
  @media (max-width: 960px) { .mobile-orion { display: block; } }

  /* ── HEADER ── */
  .login-header { margin-bottom: 28px; }
  .login-title {
    font-size: 28px; font-weight: 800;
    letter-spacing: -0.8px; margin-bottom: 6px; color: #f0f4fc;
  }
  .login-subtitle { font-size: 14px; color: rgba(255,255,255,0.35); margin-bottom: 10px; }
  .login-divider-accent {
    width: 48px; height: 2.5px;
    background: linear-gradient(90deg, #2E6FD4, #2EECC5);
    border-radius: 99px;
  }

  /* ── FORM ── */
  .login-form { display: flex; flex-direction: column; gap: 16px; }
  .form-group { display: flex; flex-direction: column; gap: 7px; }
  .form-label {
    font-size: 11px; font-weight: 700;
    color: rgba(255,255,255,0.45);
    letter-spacing: 1px; text-transform: uppercase;
  }

  .form-input {
    background: rgba(255,255,255,0.04);
    border: 1.5px solid rgba(74,143,232,0.18);
    border-radius: 14px; padding: 14px 18px;
    color: #f0f4fc; font-family: 'Inter', sans-serif;
    font-size: 14px; outline: none; transition: all 0.2s; width: 100%;
  }
  .form-input:focus {
    border-color: rgba(74,143,232,0.55);
    background: rgba(255,255,255,0.06);
    box-shadow: 0 0 0 3px rgba(74,143,232,0.08);
  }
  .form-input::placeholder { color: rgba(255,255,255,0.15); }

  .password-wrap { position: relative; }
  .password-wrap .form-input { padding-right: 50px; }
  .toggle-pass {
    position: absolute; right: 16px; top: 50%; transform: translateY(-50%);
    background: none; border: none; cursor: pointer;
    color: rgba(255,255,255,0.3); font-size: 18px; transition: color 0.2s;
  }
  .toggle-pass:hover { color: rgba(255,255,255,0.6); }

  .btn-login {
    background: linear-gradient(135deg, #2E6FD4, #1B4FA0);
    color: #fff; border: none; border-radius: 14px;
    padding: 15px; font-family: 'Inter', sans-serif;
    font-size: 15px; font-weight: 700; cursor: pointer;
    transition: all 0.2s; width: 100%;
    box-shadow: 0 4px 20px rgba(46,111,212,0.4);
    margin-top: 4px; letter-spacing: -0.2px;
  }
  .btn-login:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(46,111,212,0.5); }
  .btn-login:active { transform: scale(0.98); }
  .btn-login:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .divider { display: flex; align-items: center; gap: 12px; margin: 6px 0; }
  .divider-line { flex: 1; height: 1px; background: rgba(255,255,255,0.07); }
  .divider-text { font-size: 12px; color: rgba(255,255,255,0.2); font-weight: 600; }

  .btn-google {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    background: rgba(255,255,255,0.04);
    border: 1.5px solid rgba(255,255,255,0.09);
    border-radius: 14px; padding: 14px;
    font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600;
    color: rgba(255,255,255,0.65); cursor: pointer; transition: all 0.2s; width: 100%;
  }
  .btn-google:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.18); transform: translateY(-1px); }
  .btn-google:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .error-box {
    background: rgba(239,68,68,0.08);
    border: 1.5px solid rgba(239,68,68,0.25);
    border-radius: 10px; padding: 12px 16px;
    font-size: 13px; color: #ef4444;
    display: flex; align-items: center; gap: 8px;
  }

  .login-footer {
    margin-top: 24px; text-align: center;
    font-size: 12px; color: rgba(255,255,255,0.18); line-height: 1.8;
  }
  .login-footer strong { color: rgba(255,255,255,0.3); }
`

const features = [
  { icon: '🛒', label: 'Punto de Venta con IVA automático', bg: 'rgba(46,111,212,0.15)' },
  { icon: '📦', label: 'Inventario con alertas de stock', bg: 'rgba(46,236,197,0.1)' },
  { icon: '🧾', label: 'Facturación DTE El Salvador', bg: 'rgba(245,158,11,0.1)' },
  { icon: '📊', label: 'Reportes en tiempo real', bg: 'rgba(99,102,241,0.1)' },
  { icon: '🔥', label: 'Datos seguros en Firebase', bg: 'rgba(239,68,68,0.1)' },
]

// Logo ONE GEO SYSTEMS — aparece en la caja blanca sobre el Bienvenido
// Cuando tengas clientes, esto se cargará dinámicamente desde Firebase
const LogoEmpresa = () => (
  <svg viewBox="0 0 240 90" width="200" height="72" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="eyeG" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#2E5FA3"/>
        <stop offset="100%" stopColor="#1B2E6B"/>
      </linearGradient>
    </defs>
    {/* Ojo geométrico */}
    <ellipse cx="46" cy="44" rx="38" ry="26" fill="none" stroke="url(#eyeG)" strokeWidth="3.2"/>
    <line x1="8" y1="44" x2="22" y2="28" stroke="#2E5FA3" strokeWidth="2.2" strokeLinecap="round"/>
    <line x1="84" y1="44" x2="70" y2="28" stroke="#2E5FA3" strokeWidth="2.2" strokeLinecap="round"/>
    <circle cx="46" cy="44" r="14" fill="none" stroke="#2E5FA3" strokeWidth="2.2"/>
    <circle cx="46" cy="44" r="7.5" fill="#1B2E6B"/>
    <circle cx="46" cy="44" r="3.5" fill="#4A7BC4"/>
    <circle cx="43" cy="41" r="1.8" fill="rgba(255,255,255,0.45)"/>
    {/* Texto */}
    <text x="98" y="30" fontFamily="'Arial Black',Arial,sans-serif" fontSize="17" fontWeight="900" fill="#1B2E6B" letterSpacing="0.5">ONE</text>
    <text x="98" y="48" fontFamily="'Arial Black',Arial,sans-serif" fontSize="17" fontWeight="900" fill="#1B2E6B" letterSpacing="0.5">GEO</text>
    <text x="98" y="66" fontFamily="'Arial Black',Arial,sans-serif" fontSize="17" fontWeight="900" fill="#1B2E6B" letterSpacing="0.5">SYSTEMS</text>
    <text x="98" y="80" fontFamily="Arial,sans-serif" fontSize="8" fill="#4A7BC4" letterSpacing="1.2" opacity="0.9">Control · Seguridad · Innovación</text>
  </svg>
)

export default function Login() {
  const { loginEmail, loginGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleEmail = async (e) => {
    e.preventDefault()
    if (!email || !password) { setError('Completa todos los campos'); return }
    setLoading(true); setError('')
    try {
      await loginEmail(email, password)
    } catch (err) {
      const msgs = {
        'auth/user-not-found': 'No existe una cuenta con ese correo',
        'auth/wrong-password': 'Contraseña incorrecta',
        'auth/invalid-email': 'Correo electrónico inválido',
        'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde',
        'auth/invalid-credential': 'Correo o contraseña incorrectos',
      }
      setError(msgs[err.code] || 'Error al iniciar sesión')
    }
    setLoading(false)
  }

  const handleGoogle = async () => {
    setLoading(true); setError('')
    try { await loginGoogle() }
    catch (err) { if (err.code !== 'auth/popup-closed-by-user') setError('Error al iniciar con Google') }
    setLoading(false)
  }

  return (
    <>
      <style>{loginStyles}</style>
      <div className="login-page">

        {/* ── COLUMNA IZQUIERDA — ORIÓN ── */}
        <div className="login-left">
          <div className="left-content">
            <OrionLogo width={190} textColor="#ffffff"/>
            <div className="orion-sep"/>
            <div className="left-tagline">
              Sistema profesional de ventas<br/>y facturación DTE para empresas<br/>de El Salvador
            </div>
            <div className="features">
              {features.map((f) => (
                <div key={f.label} className="feature-item">
                  <div className="feature-icon" style={{ background: f.bg }}>{f.icon}</div>
                  <div className="feature-label">{f.label}</div>
                </div>
              ))}
            </div>
            <div className="powered-by">ONE GEO SYSTEMS © 2026</div>
          </div>
        </div>

        {/* ── COLUMNA DERECHA — FORM ── */}
        <div className="login-right">
          <div className="login-box">

            {/* Logo ORIÓN en móvil */}
            <div className="mobile-orion">
              <OrionLogo width={150} textColor="#ffffff"/>
            </div>

            {/* ── LOGO EMPRESA — arriba del Bienvenido ── */}
            <div className="empresa-logo-wrap">
              <div className="empresa-card">
                <LogoEmpresa/>
              </div>
            </div>

            {/* HEADER */}
            <div className="login-header">
              <div className="login-title">Bienvenido 👋</div>
              <div className="login-subtitle">Ingresa a tu cuenta para continuar</div>
              <div className="login-divider-accent"/>
            </div>

            {/* FORM */}
            <form className="login-form" onSubmit={handleEmail}>
              {error && <div className="error-box">⚠️ {error}</div>}

              <div className="form-group">
                <label className="form-label">Correo electrónico</label>
                <input className="form-input" type="email"
                  placeholder="correo@empresa.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  autoComplete="email"/>
              </div>

              <div className="form-group">
                <label className="form-label">Contraseña</label>
                <div className="password-wrap">
                  <input className="form-input"
                    type={showPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    autoComplete="current-password"/>
                  <button type="button" className="toggle-pass" onClick={() => setShowPass(!showPass)}>
                    {showPass ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button className="btn-login" type="submit" disabled={loading}>
                {loading ? '⏳ Ingresando...' : '🔐 Ingresar a ORIÓN'}
              </button>
            </form>

            <div className="divider" style={{ margin: '20px 0' }}>
              <div className="divider-line"/>
              <div className="divider-text">O continúa con</div>
              <div className="divider-line"/>
            </div>

            <button className="btn-google" onClick={handleGoogle} disabled={loading}>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuar con Google
            </button>

            <div className="login-footer">
              ¿Problemas para ingresar? Contacta a tu administrador<br/>
              <strong>ORIÓN — ONE GEO SYSTEMS</strong>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
