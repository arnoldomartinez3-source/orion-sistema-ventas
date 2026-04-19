import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '../AuthContext'
import { usePermisos } from '../PermisosContext'

export default function Configuracion() {
  const { user } = useAuth()
  const { esAdmin, loading: loadingPermisos } = usePermisos()
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const [config, setConfig] = useState({
    empresaNombre: '',
    empresaSlogan: '',
    logoUrl: '',
    colorPrimario: '#2E6FD4',
    nit: '',
    nrc: '',
    direccion: '',
    telefono: '',
    correo: '',
    actividadEconomica: '',
    tipoEstablecimiento: '01',
    departamento: '06',
    requerirCaja: false,
  })

  useEffect(() => {
    const cargar = async () => {
      if (!user) return
      try {
        const ref = doc(db, 'configuracion', user.uid)
        const snap = await getDoc(ref)
        if (snap.exists()) {
          setConfig(prev => ({ ...prev, ...snap.data() }))
        }
      } catch (e) {
        console.error('Error:', e)
      }
      setLoading(false)
    }
    cargar()
  }, [user])

  const handleChange = (campo, valor) => {
    setConfig(prev => ({ ...prev, [campo]: valor }))
    setGuardado(false)
    // Reset error de logo cuando cambia la URL
    if (campo === 'logoUrl') setLogoError(false)
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      const ref = doc(db, 'configuracion', user.uid)
      await setDoc(ref, { ...config, updatedAt: serverTimestamp() }, { merge: true })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
    } catch (e) {
      alert('Error al guardar: ' + e.message)
    }
    setGuardando(false)
  }

  // URL válida para preview — solo muestra si tiene http y más de 10 chars
  const urlValida = config.logoUrl && config.logoUrl.startsWith('http') && config.logoUrl.length > 10

  if (loading) return (
    <div className="empty-state">
      <div className="empty-icon">⏳</div>
      <div className="empty-text">Cargando configuración...</div>
    </div>
  )

  return (
    <>
      <style>{`
        .config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 768px) { .config-grid { grid-template-columns: 1fr; } }

        .config-section {
          background: var(--surface); border: 1.5px solid var(--border);
          border-radius: 16px; overflow: hidden;
          box-shadow: 0 4px 20px var(--shadow2); margin-bottom: 20px;
        }
        .config-section-header {
          padding: 16px 22px; border-bottom: 1.5px solid var(--border);
          background: var(--surface2);
          display: flex; align-items: center; gap: 10px;
        }
        .config-section-icon {
          width: 36px; height: 36px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; background: var(--surface3);
        }
        .config-section-title { font-size: 14px; font-weight: 700; color: var(--text); }
        .config-section-body { padding: 22px; display: flex; flex-direction: column; gap: 16px; }

        .logo-preview {
          width: 100%; min-height: 90px;
          background: #ffffff; border-radius: 12px;
          border: 2px dashed var(--border2);
          display: flex; align-items: center; justify-content: center;
          overflow: hidden; margin-bottom: 4px;
        }
        .logo-preview img { max-width: 200px; max-height: 70px; object-fit: contain; }
        .logo-preview-empty { font-size: 12px; color: var(--muted); text-align: center; padding: 16px; }
        .logo-preview-error { font-size: 12px; color: var(--danger); text-align: center; padding: 16px; }

        .color-row { display: flex; align-items: center; gap: 12px; }
        .color-swatch { width: 42px; height: 42px; border-radius: 10px; border: 2px solid var(--border2); cursor: pointer; flex-shrink: 0; overflow: hidden; }
        .color-swatch input[type="color"] { width: 100%; height: 100%; border: none; padding: 0; cursor: pointer; background: none; }

        .color-presets { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
        .color-preset { width: 28px; height: 28px; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: all 0.15s; }
        .color-preset:hover { transform: scale(1.15); }
        .color-preset.active { border-color: var(--text); }

        .saved-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(0,194,150,0.12); color: #00C296; border: 1px solid rgba(0,194,150,0.2); padding: 6px 14px; border-radius: 99px; font-size: 13px; font-weight: 600; }

        .login-preview { background: #0a1628; border-radius: 14px; padding: 20px; display: flex; gap: 16px; align-items: center; min-height: 110px; }
        .preview-left { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .preview-orion-badge { background: rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 12px; font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 1px; }
        .preview-right { flex: 1.4; }
        .preview-empresa-card { background: white; border-radius: 10px; padding: 10px 16px; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; min-height: 48px; }
        .preview-empresa-card img { max-width: 130px; max-height: 34px; object-fit: contain; }
        .preview-empresa-nombre { font-size: 11px; font-weight: 700; color: #1B2E6B; text-align: center; }
        .preview-form-mock { display: flex; flex-direction: column; gap: 6px; }
        .preview-input-mock { height: 26px; background: rgba(255,255,255,0.05); border: 1px solid rgba(74,143,232,0.2); border-radius: 6px; }
        .preview-btn-mock { height: 26px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: white; }

        .hint-box { background: rgba(74,143,232,0.08); border: 1px solid rgba(74,143,232,0.2); border-radius: 10px; padding: 12px 16px; font-size: 12px; color: var(--text2); line-height: 1.6; }
      `}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">⚙️ Configuración</div>
          <div className="page-sub">Personaliza tu empresa en ORIÓN</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {guardado && <span className="saved-badge">✅ Guardado</span>}
          <button className="btn btn-primary btn-lg" onClick={guardar} disabled={guardando}>
            {guardando ? '⏳ Guardando...' : '💾 Guardar cambios'}
          </button>
        </div>
      </div>

      {/* VISTA PREVIA LOGIN */}
      <div className="config-section" style={{ marginBottom: 20 }}>
        <div className="config-section-header">
          <div className="config-section-icon">👁️</div>
          <div className="config-section-title">Vista previa del Login</div>
        </div>
        <div style={{ padding: 22 }}>
          <div className="login-preview">
            <div className="preview-left">
              <div className="preview-orion-badge">⭐ ORIÓN</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: 1 }}>Sistema de Ventas</div>
            </div>
            <div className="preview-right">
              <div className="preview-empresa-card">
                {urlValida && !logoError ? (
                  <img
                    src={config.logoUrl}
                    alt={config.empresaNombre || 'Logo'}
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <div className="preview-empresa-nombre">
                    {config.empresaNombre || 'Tu Empresa'}
                  </div>
                )}
              </div>
              <div className="preview-form-mock">
                <div className="preview-input-mock"/>
                <div className="preview-input-mock"/>
                <div className="preview-btn-mock" style={{ background: config.colorPrimario }}>
                  🔐 Ingresar
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="config-grid">

        {/* ── IDENTIDAD VISUAL ── */}
        <div>
          <div className="config-section">
            <div className="config-section-header">
              <div className="config-section-icon">🎨</div>
              <div className="config-section-title">Identidad Visual</div>
            </div>
            <div className="config-section-body">

              {/* Instrucciones */}
              <div className="hint-box">
                💡 <strong>¿Cómo agregar tu logo?</strong><br/>
                1. Ve a <strong>imgur.com</strong> y sube tu imagen<br/>
                2. Haz clic derecho sobre la imagen → "Copiar dirección"<br/>
                3. La URL debe terminar en <strong>.png</strong> o <strong>.jpg</strong><br/>
                4. Pégala abajo y verás la vista previa en tiempo real
              </div>

              {/* URL Logo */}
              <div className="form-group">
                <label className="form-label">URL del Logo</label>
                <input
                  className="input"
                  placeholder="https://i.imgur.com/tulogo.png"
                  value={config.logoUrl}
                  onChange={e => handleChange('logoUrl', e.target.value)}
                />
              </div>

              {/* Preview logo */}
              <div className="logo-preview">
                {!config.logoUrl ? (
                  <div className="logo-preview-empty">
                    🖼️ El logo aparecerá aquí<br/>cuando pegues la URL
                  </div>
                ) : !urlValida ? (
                  <div className="logo-preview-empty">
                    ✏️ Escribe una URL completa que empiece con http...
                  </div>
                ) : logoError ? (
                  <div className="logo-preview-error">
                    ⚠️ No se pudo cargar la imagen<br/>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Verifica que la URL sea pública y termine en .png o .jpg</span>
                  </div>
                ) : (
                  <img
                    src={config.logoUrl}
                    alt="Logo preview"
                    onError={() => setLogoError(true)}
                  />
                )}
              </div>

              {/* Nombre */}
              <div className="form-group">
                <label className="form-label">Nombre de la Empresa</label>
                <input className="input" placeholder="Mi Empresa S.A. de C.V."
                  value={config.empresaNombre}
                  onChange={e => handleChange('empresaNombre', e.target.value)}/>
              </div>

              {/* Slogan */}
              <div className="form-group">
                <label className="form-label">Slogan (opcional)</label>
                <input className="input" placeholder="Control · Seguridad · Innovación"
                  value={config.empresaSlogan}
                  onChange={e => handleChange('empresaSlogan', e.target.value)}/>
              </div>

              {/* Color */}
              <div className="form-group">
                <label className="form-label">Color Principal</label>
                <div className="color-row">
                  <div className="color-swatch">
                    <input type="color" value={config.colorPrimario}
                      onChange={e => handleChange('colorPrimario', e.target.value)}/>
                  </div>
                  <input className="input" value={config.colorPrimario}
                    onChange={e => handleChange('colorPrimario', e.target.value)}
                    style={{ fontFamily: 'var(--mono)', fontSize: 13 }}/>
                </div>
                <div className="color-presets">
                  {['#2E6FD4','#1B2E6B','#00C296','#ef4444','#f59e0b','#8b5cf6','#ec4899','#0ea5e9'].map(c => (
                    <div key={c}
                      className={`color-preset ${config.colorPrimario === c ? 'active' : ''}`}
                      style={{ background: c }}
                      onClick={() => handleChange('colorPrimario', c)}/>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ── DATOS FISCALES ── */}
        <div>
          <div className="config-section">
            <div className="config-section-header">
              <div className="config-section-icon">🧾</div>
              <div className="config-section-title">Datos Fiscales (DTE)</div>
            </div>
            <div className="config-section-body">

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">NIT</label>
                  <input className="input" placeholder="0614-010190-101-3"
                    value={config.nit}
                    onChange={e => handleChange('nit', e.target.value)}/>
                </div>
                <div className="form-group">
                  <label className="form-label">NRC</label>
                  <input className="input" placeholder="123456-7"
                    value={config.nrc}
                    onChange={e => handleChange('nrc', e.target.value)}/>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Actividad Económica</label>
                <input className="input" placeholder="Venta al por menor de artículos"
                  value={config.actividadEconomica}
                  onChange={e => handleChange('actividadEconomica', e.target.value)}/>
              </div>

              <div className="form-group">
                <label className="form-label">Dirección</label>
                <input className="input" placeholder="Col. Escalón, San Salvador"
                  value={config.direccion}
                  onChange={e => handleChange('direccion', e.target.value)}/>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="input" placeholder="2222-3333"
                    value={config.telefono}
                    onChange={e => handleChange('telefono', e.target.value)}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Correo</label>
                  <input className="input" placeholder="info@empresa.com"
                    value={config.correo}
                    onChange={e => handleChange('correo', e.target.value)}/>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Departamento</label>
                  <select className="input" value={config.departamento}
                    onChange={e => handleChange('departamento', e.target.value)}>
                    <option value="01">Ahuachapán</option>
                    <option value="02">Santa Ana</option>
                    <option value="03">Sonsonate</option>
                    <option value="04">Chalatenango</option>
                    <option value="05">Cuscatlán</option>
                    <option value="06">La Libertad</option>
                    <option value="07">San Salvador</option>
                    <option value="08">Cabañas</option>
                    <option value="09">San Vicente</option>
                    <option value="10">La Paz</option>
                    <option value="11">Usulután</option>
                    <option value="12">San Miguel</option>
                    <option value="13">Morazán</option>
                    <option value="14">La Unión</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo Establecimiento</label>
                  <select className="input" value={config.tipoEstablecimiento}
                    onChange={e => handleChange('tipoEstablecimiento', e.target.value)}>
                    <option value="01">Sucursal / Agencia</option>
                    <option value="02">Casa Matriz</option>
                    <option value="07">Tránsito</option>
                    <option value="20">Otro</option>
                  </select>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>



      {/* Botón inferior */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
        {guardado && <span className="saved-badge">✅ Guardado correctamente</span>}
        <button className="btn btn-primary btn-lg" onClick={guardar} disabled={guardando}>
          {guardando ? '⏳ Guardando...' : '💾 Guardar cambios'}
        </button>
      </div>
    </>
  )
}
