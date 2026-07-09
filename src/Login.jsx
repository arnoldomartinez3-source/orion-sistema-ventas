import { useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
// OrionLogo removido — ahora se usa texto elegante

// ══════════════════════════════════════════════════════
// LOGO DE LA EMPRESA CLIENTE
//
// Cuando implementes el módulo de configuración por empresa,
// reemplaza este componente por una imagen desde Firebase así:
//
// const logoUrl = empresa.logoUrl  // viene de Firestore
//
// <img
//   src={logoUrl}
//   alt={empresa.nombre}
//   style={{ maxWidth: 180, maxHeight: 60, objectFit: 'contain' }}
// />
//
// Por ahora muestra el logo de ONE GEO SYSTEMS como demo.
// ══════════════════════════════════════════════════════
const loginStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; min-height: 100vh; -webkit-font-smoothing: antialiased; }

  .login-page {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 420px 1fr;
    background: #071629;
  }
  @media (max-width: 900px) { .login-page { grid-template-columns: 1fr; } }

  /* ── COLUMNA IZQUIERDA — marca (solo escritorio) ── */
  .login-left {
    background: linear-gradient(165deg, #0c2240 0%, #0a1c34 55%, #071629 100%);
    display: flex; flex-direction: column;
    justify-content: space-between;
    padding: 48px 40px;
    border-right: 1px solid rgba(200,164,77,0.14);
    position: relative; overflow: hidden;
  }
  @media (max-width: 900px) { .login-left { display: none; } }

  /* halo dorado + estrella de marca muy sutil */
  .login-left::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(420px 420px at 50% 30%, rgba(200,164,77,0.10) 0%, transparent 70%);
    pointer-events: none;
  }
  .login-left::after {
    content: ''; position: absolute; right: -70px; bottom: -70px;
    width: 280px; height: 280px; opacity: 0.06;
    background: url('/brand/orion-star-solid.svg') center/contain no-repeat;
    pointer-events: none;
  }

  .left-top { position: relative; z-index: 1; }
  .brand-logo-full { width: 100%; max-width: 300px; height: auto; display: block; margin: 6px auto 0; filter: drop-shadow(0 8px 28px rgba(200,164,77,0.18)); }
  .left-tagline { font-size: 12.5px; color: rgba(244,239,225,0.45); line-height: 1.7; margin: 22px 0 20px; text-align: center; }
  .left-tagline strong { color: #e6cd8a; font-weight: 700; }

  .features { display: flex; flex-direction: column; gap: 11px; text-align: left; }
  .feature-item { display: flex; align-items: center; gap: 12px; }
  .feature-icon { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; border: 1px solid rgba(200,164,77,0.18); }
  .feature-label { font-size: 12.5px; font-weight: 500; color: rgba(244,239,225,0.55); }

  .left-foot { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 16px; }
  .left-highlight { font-size: 11.5px; color: rgba(244,239,225,0.62); line-height: 1.6; padding: 12px 14px; border: 1px solid rgba(200,164,77,0.22); border-radius: 12px; background: rgba(200,164,77,0.06); text-align: center; }
  .left-highlight strong { color: #e6cd8a; font-weight: 700; }
  .left-bottom { font-size: 10px; color: rgba(230,205,138,0.7); letter-spacing: 1.6px; text-transform: uppercase; text-align: center; font-weight: 700; }

  /* ── COLUMNA DERECHA ── */
  .login-right {
    background: #071629;
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    padding: 40px 48px;
  }
  @media (max-width: 600px) { .login-right { padding: 32px 20px; } }

  .login-box {
    width: 100%; max-width: 400px;
    display: flex; flex-direction: column; align-items: center;
  }

  /* ── LOGO (badge de ORIÓN sobre tarjeta clara) ── */
  .empresa-logo-wrap {
    width: 100%; display: flex;
    justify-content: center; margin-bottom: 26px;
  }
  .empresa-card {
    background: #fffdf8; border-radius: 16px;
    padding: 18px 30px;
    display: inline-flex; align-items: center; justify-content: center;
    box-shadow: 0 10px 34px rgba(0,0,0,0.35);
    border: 1px solid rgba(200,164,77,0.22);
  }
  .brand-logo-compact { height: 34px; width: auto; display: block; }

  /* ── HEADER ── */
  .login-header { width: 100%; margin-bottom: 22px; text-align: center; }
  .login-title { font-size: 25px; font-weight: 800; letter-spacing: -0.6px; margin-bottom: 5px; color: #f4efe1; }
  .login-subtitle { font-size: 13px; color: rgba(244,239,225,0.4); margin-bottom: 12px; }
  .login-divider-accent { width: 44px; height: 2.5px; background: linear-gradient(90deg,#e6cd8a,#c8a44d,#9a7529); border-radius: 99px; margin: 0 auto; }

  /* ── FORM ── */
  .login-form { display: flex; flex-direction: column; gap: 14px; width: 100%; }
  .form-group { display: flex; flex-direction: column; gap: 7px; }
  .form-label { font-size: 11px; font-weight: 700; color: rgba(244,239,225,0.5); letter-spacing: 1px; text-transform: uppercase; }

  .form-input {
    background: rgba(255,255,255,0.04);
    border: 1.5px solid rgba(200,164,77,0.20);
    border-radius: 13px; padding: 13px 18px;
    color: #f4efe1; font-family: 'Inter', sans-serif;
    font-size: 14px; outline: none; transition: all 0.2s; width: 100%;
  }
  .form-input:focus { border-color: rgba(200,164,77,0.6); background: rgba(255,255,255,0.06); box-shadow: 0 0 0 3px rgba(200,164,77,0.12); }
  .form-input::placeholder { color: rgba(244,239,225,0.2); }

  .password-wrap { position: relative; }
  .password-wrap .form-input { padding-right: 50px; }
  .toggle-pass { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: rgba(244,239,225,0.35); font-size: 18px; transition: color 0.2s; }
  .toggle-pass:hover { color: rgba(244,239,225,0.7); }

  .btn-login { background: #c8a44d; color: #0c2240; border: none; border-radius: 13px; padding: 14px; font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 800; letter-spacing: 0.2px; cursor: pointer; transition: background 0.18s, transform 0.15s; width: 100%; margin-top: 2px; }
  .btn-login:hover { background: #d4af4e; transform: translateY(-1px); }
  .btn-login:active { transform: scale(0.98); }
  .btn-login:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

  .divider { display: flex; align-items: center; gap: 12px; margin: 6px 0; width: 100%; }
  .divider-line { flex: 1; height: 1px; background: rgba(244,239,225,0.08); }
  .divider-text { font-size: 12px; color: rgba(244,239,225,0.25); font-weight: 600; }

  .btn-google { display: flex; align-items: center; justify-content: center; gap: 10px; background: rgba(255,255,255,0.04); border: 1.5px solid rgba(255,255,255,0.10); border-radius: 13px; padding: 13px; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; color: rgba(244,239,225,0.7); cursor: pointer; transition: all 0.2s; width: 100%; }
  .btn-google:hover { background: rgba(255,255,255,0.08); border-color: rgba(200,164,77,0.32); transform: translateY(-1px); }
  .btn-google:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .error-box { background: rgba(224,101,95,0.10); border: 1.5px solid rgba(224,101,95,0.3); border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #e0655f; display: flex; align-items: center; gap: 8px; width: 100%; }

  .login-footer { margin-top: 20px; text-align: center; font-size: 12px; color: rgba(244,239,225,0.55); line-height: 1.9; width: 100%; }
  .login-footer strong { color: #e6cd8a; font-weight: 700; }
`

const features = [
  { icon: '🛒', label: 'Punto de Venta rápido con IVA automático', bg: 'rgba(200,164,77,0.10)' },
  { icon: '🧾', label: 'Facturación DTE: FE, CCF, NC/ND, FEX, Retención', bg: 'rgba(200,164,77,0.10)' },
  { icon: '📦', label: 'Inventario con alertas de stock bajo', bg: 'rgba(200,164,77,0.10)' },
  { icon: '👥', label: 'Clientes, proveedores y cotizaciones', bg: 'rgba(200,164,77,0.10)' },
  { icon: '💵', label: 'Caja, cierres y control de efectivo', bg: 'rgba(200,164,77,0.10)' },
  { icon: '👔', label: 'Empleados, asistencia y planilla', bg: 'rgba(200,164,77,0.10)' },
  { icon: '📊', label: 'Reportes y dashboard en tiempo real', bg: 'rgba(200,164,77,0.10)' },
  { icon: '🏢', label: 'Multi-sucursal y multi-empresa', bg: 'rgba(200,164,77,0.10)' },
]

export default function Login() {
  const { loginEmail, loginGoogle, loginEmpleado, authError } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Detecta automáticamente si es admin (tiene @) o empleado
  const esAdmin = usuario.includes('@')

  // Si el contexto rechaza la cuenta (autenticada pero sin alta), salir del estado de carga.
  useEffect(() => { if (authError) setLoading(false) }, [authError])

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!usuario || !password) { setError('Completa todos los campos'); return }
    setLoading(true); setError('')

    if (esAdmin) {
      // ── Login Admin con Firebase Auth ──
      try {
        await loginEmail(usuario, password)
      } catch (err) {
        const msgs = {
          'auth/user-not-found': 'No existe una cuenta con ese correo',
          'auth/wrong-password': 'Contraseña incorrecta',
          'auth/invalid-email': 'Correo electrónico inválido',
          'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde',
          'auth/invalid-credential': 'Correo o contraseña incorrectos',
        }
        setError(msgs[err.code] || 'Correo o contraseña incorrectos')
      }
    } else {
      // ── Login Empleado con usuario + PIN (validado en el backend) ──
      // El PIN se verifica en la Cloud Function /api/login-empleado (Admin SDK),
      // así no se expone leyendo 'usuarios' desde el navegador.
      try {
        const resp = await fetch('/api/login-empleado', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuarioSimple: usuario.toLowerCase().trim(), pin: password }),
        })
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok || data.ok === false) {
          setError(data.error || 'No se pudo iniciar sesión')
          setLoading(false)
          return
        }
        const empleado = data.empleado
        // Guardar sucursal asignada en sessionStorage antes de entrar
        if (empleado.sucursalId) {
          sessionStorage.setItem('orion_sucursal_activa', empleado.sucursalId)
        } else {
          sessionStorage.removeItem('orion_sucursal_activa')
        }
        // Login exitoso como empleado (perfil + custom token desde el backend)
        await loginEmpleado(empleado, data.token)
      } catch (err) {
        setError('Error al iniciar sesión: ' + err.message)
      }
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

        {/* ── IZQUIERDA — solo escritorio ── */}
        <div className="login-left">
          <div className="left-top">
            <img className="brand-logo-full" src="/brand/orion-logo-full-dark.svg" alt="ORIÓN — Software de Gestión Empresarial Integral" />
            <div className="left-tagline">
              Todo lo que tu negocio necesita para<br/>
              <strong>vender, facturar y crecer</strong> — en un solo lugar.
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
          <div className="left-foot">
            <div className="left-highlight">🇸🇻 Facturación electrónica <strong>certificada por el Ministerio de Hacienda</strong> de El Salvador</div>
            <div className="left-bottom">ONE GEO SYSTEMS © 2026</div>
          </div>
        </div>

        {/* ── DERECHA — escritorio y móvil ── */}
        <div className="login-right">
          <div className="login-box">

            {/* Header */}
            <div className="login-header">
              <div className="login-title">Bienvenido 👋</div>
              <div className="login-subtitle">Ingresa a tu cuenta para continuar</div>
              <div className="login-divider-accent"/>
            </div>

            {/* Form */}
            <form className="login-form" onSubmit={handleLogin}>
              {(error || authError) && <div className="error-box">⚠️ {error || authError}</div>}

              <div className="form-group">
                <label className="form-label">
                  {esAdmin ? '📧 Correo electrónico' : '👤 Usuario'}
                  {usuario.length > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 700,
                      background: esAdmin ? 'rgba(200,164,77,0.16)' : 'rgba(0,194,150,0.15)',
                      color: esAdmin ? '#d8a93c' : '#00C296' }}>
                      {esAdmin ? '👑 Administrador' : '👤 Empleado'}
                    </span>
                  )}
                </label>
                <input className="form-input"
                  type="text"
                  placeholder="correo@empresa.com o usuario"
                  value={usuario}
                  onChange={e => { setUsuario(e.target.value); setError('') }}
                  autoComplete="username"
                  autoCapitalize="none"/>
              </div>

              <div className="form-group">
                <label className="form-label">
                  {esAdmin ? '🔑 Contraseña' : '🔢 PIN'}
                </label>
                <div className="password-wrap">
                  <input className="form-input"
                    type={showPass ? 'text' : 'password'}
                    placeholder={esAdmin ? '••••••••' : '• • • •'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    autoComplete="current-password"
                    maxLength={esAdmin ? 100 : 6}/>
                  <button type="button" className="toggle-pass" onClick={() => setShowPass(!showPass)}>
                    {showPass ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button className="btn-login" type="submit" disabled={loading}>
                {loading ? '⏳ Ingresando...' : '🔐 Ingresar a ORIÓN'}
              </button>
            </form>

            {esAdmin && <>
            <div className="divider" style={{ margin: '16px 0' }}>
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
            </>}

            {/* Footer en blanco */}
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