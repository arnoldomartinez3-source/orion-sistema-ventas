import { useState } from 'react'
import { useAuth } from './AuthContext'

const loginStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  body { font-family: 'Inter', sans-serif; background: #080c14; color: #e8edf5; min-height: 100vh; -webkit-font-smoothing: antialiased; }

  .login-page { min-height: 100vh; display: grid; grid-template-columns: 1fr 1fr; }
  @media (max-width: 768px) { .login-page { grid-template-columns: 1fr; } }

  /* Panel izquierdo */
  .login-left {
    background: linear-gradient(160deg, #0a1020 0%, #0d1830 40%, #0a1525 100%);
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    padding: 60px 40px; position: relative; overflow: hidden;
  }
  @media (max-width: 768px) { .login-left { display: none; } }

  .login-left::before {
    content: ''; position: absolute;
    width: 600px; height: 600px;
    background: radial-gradient(circle, rgba(0,194,150,0.07) 0%, transparent 70%);
    top: 50%; left: 50%; transform: translate(-50%, -50%);
    border-radius: 50%;
  }
  .login-left::after {
    content: ''; position: absolute;
    width: 400px; height: 400px;
    background: radial-gradient(circle, rgba(46,111,212,0.06) 0%, transparent 70%);
    top: 20%; right: -100px; border-radius: 50%;
  }

  .left-content { position: relative; z-index: 1; text-align: center; max-width: 400px; }
  .left-tagline { font-size: 15px; color: rgba(255,255,255,0.35); margin-top: 20px; letter-spacing: 1px; }

  .features { display: flex; flex-direction: column; gap: 16px; text-align: left; margin-top: 40px; }
  .feature-item { display: flex; align-items: center; gap: 14px; }
  .feature-icon { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
  .feature-label { font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.5); }

  /* Panel derecho */
  .login-right { display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 40px 32px; background: #080c14; }
  .login-box { width: 100%; max-width: 400px; }

  .login-header { margin-bottom: 36px; }
  .login-title { font-size: 28px; font-weight: 800; letter-spacing: -0.8px; margin-bottom: 6px; color: #e8edf5; }
  .login-subtitle { font-size: 14px; color: #5a7394; }

  .login-form { display: flex; flex-direction: column; gap: 16px; }
  .form-group { display: flex; flex-direction: column; gap: 7px; }
  .form-label { font-size: 12px; font-weight: 700; color: #8fa3c0; letter-spacing: 0.5px; text-transform: uppercase; }

  .form-input { background: #0d1220; border: 1.5px solid #1e2d45; border-radius: 12px; padding: 13px 16px; color: #e8edf5; font-family: 'Inter', sans-serif; font-size: 14px; outline: none; transition: all 0.2s; width: 100%; }
  .form-input:focus { border-color: #00C296; box-shadow: 0 0 0 3px rgba(0,194,150,0.12); background: #121929; }
  .form-input::placeholder { color: #2a3f5f; }

  .password-wrap { position: relative; }
  .password-wrap .form-input { padding-right: 48px; }
  .toggle-pass { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #5a7394; font-size: 18px; transition: color 0.2s; }
  .toggle-pass:hover { color: #8fa3c0; }

  .btn-login { background: linear-gradient(135deg, #00C296, #009B78); color: #fff; border: none; border-radius: 12px; padding: 14px; font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s; width: 100%; box-shadow: 0 4px 14px rgba(0,194,150,0.35); margin-top: 4px; }
  .btn-login:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,194,150,0.45); }
  .btn-login:active { transform: scale(0.98); }
  .btn-login:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

  .divider { display: flex; align-items: center; gap: 12px; margin: 4px 0; }
  .divider-line { flex: 1; height: 1px; background: #1e2d45; }
  .divider-text { font-size: 12px; color: #2a3f5f; font-weight: 600; }

  .btn-google { display: flex; align-items: center; justify-content: center; gap: 10px; background: #0d1220; border: 1.5px solid #1e2d45; border-radius: 12px; padding: 13px; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; color: #e8edf5; cursor: pointer; transition: all 0.2s; width: 100%; }
  .btn-google:hover { border-color: #2a3f5f; background: #121929; transform: translateY(-1px); }
  .btn-google:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

  .error-box { background: rgba(239,68,68,0.08); border: 1.5px solid rgba(239,68,68,0.25); border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #ef4444; display: flex; align-items: center; gap: 8px; }

  .login-footer { margin-top: 32px; text-align: center; font-size: 12px; color: #2a3f5f; line-height: 1.8; }
  .login-footer strong { color: #5a7394; }

  .mobile-logo { display: none; text-align: center; margin-bottom: 32px; }
  @media (max-width: 768px) { .mobile-logo { display: block; } }

  /* Powered by */
  .powered-by { margin-top: 8px; font-size: 11px; color: #1e2d45; letter-spacing: 1px; text-align: center; text-transform: uppercase; }
  .powered-by span { color: #2E5FA3; font-weight: 600; }
`

// Logo inline
const OrionLogo = ({ width = 180, dark = true }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width={width} height={width}>
    <defs>
      <filter id="lgGreen" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="12" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="lgBlue" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="14" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="lgTeal" x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="10" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <radialGradient id="lgGG" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#fff"/><stop offset="40%" stopColor="#2EECC5"/><stop offset="100%" stopColor="#00B89F"/>
      </radialGradient>
      <radialGradient id="lgGB" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#fff"/><stop offset="40%" stopColor="#5AC8F5"/><stop offset="100%" stopColor="#1E7FBA"/>
      </radialGradient>
      <radialGradient id="lgGT" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#fff"/><stop offset="40%" stopColor="#35C4D8"/><stop offset="100%" stopColor="#0E87A8"/>
      </radialGradient>
      <linearGradient id="lgLM" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#1A6FA3" stopOpacity="0.85"/><stop offset="100%" stopColor="#00B89F" stopOpacity="0.85"/>
      </linearGradient>
      <linearGradient id="lgLB" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#1A6FA3" stopOpacity="0.8"/><stop offset="100%" stopColor="#35C4D8" stopOpacity="0.8"/>
      </linearGradient>
      <linearGradient id="lgLR" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#35C4D8" stopOpacity="0.8"/><stop offset="100%" stopColor="#00B89F" stopOpacity="0.8"/>
      </linearGradient>
    </defs>
    <line x1="148" y1="268" x2="292" y2="268" stroke="url(#lgLB)" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="148" y1="268" x2="310" y2="118" stroke="url(#lgLM)" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="292" y1="268" x2="310" y2="118" stroke="url(#lgLR)" strokeWidth="2.2" strokeLinecap="round"/>
    <circle cx="310" cy="118" r="42" fill="#2EECC5" opacity="0.07" filter="url(#lgGreen)"/>
    <circle cx="310" cy="118" r="17" fill="url(#lgGG)" filter="url(#lgGreen)"/>
    <circle cx="304" cy="112" r="5.5" fill="white" opacity="0.6"/>
    <circle cx="148" cy="268" r="48" fill="#5AC8F5" opacity="0.08" filter="url(#lgBlue)"/>
    <circle cx="148" cy="268" r="19" fill="url(#lgGB)" filter="url(#lgBlue)"/>
    <circle cx="141" cy="261" r="6.5" fill="white" opacity="0.55"/>
    <circle cx="292" cy="268" r="36" fill="#35C4D8" opacity="0.07" filter="url(#lgTeal)"/>
    <circle cx="292" cy="268" r="14" fill="url(#lgGT)" filter="url(#lgTeal)"/>
    <circle cx="287" cy="263" r="4.5" fill="white" opacity="0.55"/>
    <text x="250" y="390" textAnchor="middle" fontFamily="'Arial Black',Arial,sans-serif" fontSize="90" fontWeight="900" letterSpacing="3" fill={dark ? '#ffffff' : '#0C2461'}>ORIÓN</text>
    <line x1="75" y1="412" x2="425" y2="412" stroke="#4A9FD4" strokeWidth="1" opacity="0.25"/>
    <text x="250" y="440" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="16.5" fontWeight="600" letterSpacing="2" fill="#4ECFB3" opacity="0.8">Gestión de Ventas y Facturación</text>
  </svg>
)

const features = [
  { icon: '🛒', label: 'Punto de Venta con IVA automático1', bg: 'rgba(0,194,150,0.1)' },
  { icon: '📦', label: 'Inventario con alertas de stock1', bg: 'rgba(46,111,212,0.1)' },
  { icon: '🧾', label: 'Facturación DTE El Salvador1', bg: 'rgba(245,158,11,0.1)' },
  { icon: '📊', label: 'Reportes y estadísticas en tiempo real1', bg: 'rgba(99,102,241,0.1)' },
  { icon: '🔥', label: 'Datos seguros en Firebase1', bg: 'rgba(239,68,68,0.1)' },
]

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
    catch (err) { if (err.code !== 'auth/popup-closed-by-user') setError('Error con Google') }
    setLoading(false)
  }

  return (
    <>
      <style>{loginStyles}</style>
      <div className="login-page">

        {/* Panel izquierdo */}
        <div className="login-left">
          <div className="left-content">
            <OrionLogo width={220} dark={true} />
            <div className="left-tagline">Sistema profesional para empresas de El Salvador</div>
            <div className="features">
              {features.map((f) => (
                <div key={f.label} className="feature-item">
                  <div className="feature-icon" style={{ background: f.bg }}>{f.icon}</div>
                  <div className="feature-label">{f.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Panel derecho */}
        <div className="login-right">
          <div className="login-box">

            <div className="mobile-logo">
              <OrionLogo width={160} dark={true} />
            </div>

            <div className="login-header">
              <div className="login-title">Bienvenido 👋</div>
              <div className="login-subtitle">Ingresa a tu cuenta para continuar</div>
            </div>

            <form className="login-form" onSubmit={handleEmail}>
              {error && <div className="error-box">⚠️ {error}</div>}

              <div className="form-group">
                <label className="form-label">Correo electrónico</label>
                <input className="form-input" type="email" placeholder="correo@empresa.com"
                  value={email} onChange={e => { setEmail(e.target.value); setError('') }} autoComplete="email"/>
              </div>

              <div className="form-group">
                <label className="form-label">Contraseña</label>
                <div className="password-wrap">
                  <input className="form-input" type={showPass ? 'text' : 'password'} placeholder="••••••••"
                    value={password} onChange={e => { setPassword(e.target.value); setError('') }} autoComplete="current-password"/>
                  <button type="button" className="toggle-pass" onClick={() => setShowPass(!showPass)}>
                    {showPass ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button className="btn-login" type="submit" disabled={loading}>
                {loading ? '⏳ Ingresando...' : '🔐 Ingresar'}
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
              <strong>ORIÓN — ONE GEO SYSTEMS 1.2</strong>
            </div>
            <div className="powered-by">Powered by <span>ONE GEO SYSTEMS</span></div>
          </div>
        </div>
      </div>
    </>
  )
}
