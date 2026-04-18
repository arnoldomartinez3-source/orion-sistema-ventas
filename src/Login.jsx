import { useState } from 'react'
import { useAuth } from './AuthContext'
import { OrionLogo } from './App'

const loginStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; min-height: 100vh; -webkit-font-smoothing: antialiased; }

  .login-page {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 360px 1fr;
    background: #0a1628;
  }
  @media (max-width: 900px) { .login-page { grid-template-columns: 1fr; } }

  /* ── COLUMNA IZQUIERDA — ORIÓN ── */
  .login-left {
    background: linear-gradient(170deg, #091420 0%, #0c1d38 60%, #091525 100%);
    display: flex; flex-direction: column;
    justify-content: space-between;
    padding: 40px 28px;
    border-right: 1px solid rgba(74,143,232,0.1);
    position: relative; overflow: hidden;
  }
  @media (max-width: 900px) { .login-left { display: none; } }

  .login-left::before {
    content: ''; position: absolute;
    width: 300px; height: 300px;
    background: radial-gradient(circle, rgba(46,236,197,0.05) 0%, transparent 70%);
    top: 35%; left: 50%; transform: translate(-50%, -50%);
    border-radius: 50%; pointer-events: none;
  }

  .left-top { position: relative; z-index: 1; text-align: center; }

  .left-tagline {
    font-size: 12px; color: rgba(255,255,255,0.28);
    line-height: 1.7; margin: 12px 0 22px;
  }

  .orion-sep {
    width: 32px; height: 2px;
    background: linear-gradient(90deg, #2E6FD4, #2EECC5);
    border-radius: 99px; margin: 10px auto 0;
  }

  .features { display: flex; flex-direction: column; gap: 10px; text-align: left; }
  .feature-item { display: flex; align-items: center; gap: 11px; }
  .feature-icon {
    width: 33px; height: 33px; border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; flex-shrink: 0;
  }
  .feature-label { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.4); }

  /* Texto inferior izquierda — BLANCO */
  .left-bottom {
    position: relative; z-index: 1;
    font-size: 10px; color: rgba(255,255,255,0.9);
    letter-spacing: 1.2px; text-transform: uppercase;
    text-align: center; font-weight: 600;
  }

  /* ── COLUMNA DERECHA — FORM ── */
  .login-right {
    background: #0a1628;
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    padding: 40px 48px;
  }
  @media (max-width: 600px) { .login-right { padding: 40px 24px; } }

  .login-box {
    width: 100%; max-width: 420px;
    display: flex; flex-direction: column; align-items: center;
  }

  /* Móvil */
  .mobile-orion { display: none; text-align: center; margin-bottom: 24px; }
  @media (max-width: 900px) { .mobile-orion { display: block; } }

  /* ── LOGO EMPRESA — centrado, pequeño y elegante ── */
  .empresa-logo-wrap {
    width: 100%;
    display: flex; justify-content: center;
    margin-bottom: 28px;
  }

  .empresa-card {
    background: #ffffff;
    border-radius: 14px;
    padding: 14px 28px;
    display: inline-flex;
    align-items: center; justify-content: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    max-width: 240px;
    min-height: 64px;
  }

  /* ── HEADER — centrado ── */
  .login-header { width: 100%; margin-bottom: 24px; text-align: center; }
  .login-title {
    font-size: 26px; font-weight: 800;
    letter-spacing: -0.8px; margin-bottom: 5px; color: #f0f4fc;
  }
  .login-subtitle { font-size: 13px; color: rgba(255,255,255,0.3); margin-bottom: 10px; }
  .login-divider-accent {
    width: 40px; height: 2.5px;
    background: linear-gradient(90deg, #2E6FD4, #2EECC5);
    border-radius: 99px; margin: 0 auto;
  }

  /* ── FORM ── */
  .login-form { display: flex; flex-direction: column; gap: 15px; width: 100%; }
  .form-group { display: flex; flex-direction: column; gap: 7px; }
  .form-label {
    font-size: 11px; font-weight: 700;
    color: rgba(255,255,255,0.4);
    letter-spacing: 1px; text-transform: uppercase;
  }

  .form-input {
    background: rgba(255,255,255,0.04);
    border: 1.5px solid rgba(74,143,232,0.18);
    border-radius: 13px; padding: 13px 18px;
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
    color: #fff; border: none; border-radius: 13px;
    padding: 14px; font-family: 'Inter', sans-serif;
    font-size: 15px; font-weight: 700; cursor: pointer;
    transition: all 0.2s; width: 100%;
    box-shadow: 0 4px 20px rgba(46,111,212,0.4);
    margin-top: 2px;
  }
  .btn-login:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(46,111,212,0.5); }
  .btn-login:active { transform: scale(0.98); }
  .btn-login:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .divider { display: flex; align-items: center; gap: 12px; margin: 6px 0; width: 100%; }
  .divider-line { flex: 1; height: 1px; background: rgba(255,255,255,0.07); }
  .divider-text { font-size: 12px; color: rgba(255,255,255,0.2); font-weight: 600; }

  .btn-google {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    background: rgba(255,255,255,0.04);
    border: 1.5px solid rgba(255,255,255,0.09);
    border-radius: 13px; padding: 13px;
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
    width: 100%;
  }

  /* Footer derecho — BLANCO */
  .login-footer {
    margin-top: 22px; text-align: center;
    font-size: 12px;
    color: rgba(255,255,255,0.9);
    line-height: 1.9; width: 100%;
  }
  .login-footer strong {
    color: #ffffff;
    font-weight: 700;
  }
`

const features = [
  { icon: '🛒', label: 'Punto de Venta con IVA automático', bg: 'rgba(46,111,212,0.15)' },
  { icon: '📦', label: 'Inventario con alertas de stock', bg: 'rgba(46,236,197,0.1)' },
  { icon: '🧾', label: 'Facturación DTE El Salvador', bg: 'rgba(245,158,11,0.1)' },
  { icon: '📊', label: 'Reportes en tiempo real', bg: 'rgba(99,102,241,0.1)' },
  { icon: '🔥', label: 'Datos seguros en Firebase', bg: 'rgba(239,68,68,0.1)' },
]

// Logo ONE GEO SYSTEMS — se reemplazará dinámicamente por el logo del cliente
const LogoEmpresa = () => (
  <svg viewBox="0 0 220 80" width="190" height="64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="eyeG" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#2E5FA3"/>
        <stop offset="100%" stopColor="#1B2E6B"/>
      </linearGradient>
    </defs>
    <ellipse cx="38" cy="38" rx="32" ry="22" fill="none" stroke="url(#eyeG)" strokeWidth="3"/>
    <line x1="6" y1="38" x2="18" y2="24" stroke="#2E5FA3" strokeWidth="2" strokeLinecap="round"/>
    <line x1="70" y1="38" x2="58" y2="24" stroke="#2E5FA3" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="38" cy="38" r="12" fill="none" stroke="#2E5FA3" strokeWidth="2"/>
    <circle cx="38" cy="38" r="6.5" fill="#1B2E6B"/>
    <circle cx="38" cy="38" r="3" fill="#4A7BC4"/>
    <circle cx="35.5" cy="35.5" r="1.5" fill="rgba(255,255,255,0.5)"/>
    <text x="82" y="24" fontFamily="'Arial Black',Arial,sans-serif" fontSize="15" fontWeight="900" fill="#1B2E6B">ONE GEO</text>
    <text x="82" y="42" fontFamily="'Arial Black',Arial,sans-serif" fontSize="15" fontWeight="900" fill="#1B2E6B">SYSTEMS</text>
    <text x="82" y="56" fontFamily="Arial,sans-serif" fontSize="7.5" fill="#4A7BC4" letterSpacing="1">Control · Seguridad · Innovación</text>
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

        {/* ── IZQUIERDA — ORIÓN ── */}
        <div className="login-left">
          <div className="left-top">
            <OrionLogo width={185} textColor="#ffffff"/>
            <div className="orion-sep"/>
            <div className="left-tagline">
              Sistema profesional de ventas<br/>
              y facturación DTE para empresas<br/>
              de El Salvador
            </div>
            <div className="features">
              {features.map((f) => (
                <div key={f.label} className="feature-item">
                  <div className="feature-icon" style={{ background: f.bg }}>{f.icon}</div>
                  <div className="feature-label">{f.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="left-bottom">ONE GEO SYSTEMS © 2026</div>
        </div>

        {/* ── DERECHA — FORM ── */}
        <div className="login-right">
          <div className="login-box">

            {/* Móvil */}
            <div className="mobile-orion">
              <OrionLogo width={140} textColor="#ffffff"/>
            </div>

            {/* Logo empresa centrado */}
            <div className="empresa-logo-wrap">
              <div className="empresa-card">
                <LogoEmpresa/>
              </div>
            </div>

            {/* Header centrado */}
            <div className="login-header">
              <div className="login-title">Bienvenido 👋</div>
              <div className="login-subtitle">Ingresa a tu cuenta para continuar</div>
              <div className="login-divider-accent"/>
            </div>

            {/* Form */}
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

            <div className="divider" style={{ margin: '18px 0' }}>
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

            {/* Footer en BLANCO */}
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
