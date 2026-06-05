import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, addDoc, onSnapshot, doc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore'
import { useAuth } from '../AuthContext'
import { esUsuarioMaestro } from '../data/certificacionConfig'
import SelectorDepartamento from '../components/SelectorDepartamento'
import BuscadorActividad from '../components/BuscadorActividad'
import { buildComplemento } from '../data/departamentosMunicipios'

// ══════════════════════════════════════════════════════════════
// PANEL ONE GEO — Registro y gestión de empresas (multi-empresa)
//
// Acceso EXCLUSIVO del usuario maestro de One Geo (esUsuarioMaestro).
// No depende del flag modoCertificacion: el registro de empresas es una
// herramienta permanente de la plataforma, no algo temporal por cliente.
// ══════════════════════════════════════════════════════════════

const PLANES = ['basico', 'premium']

// Estado inicial del formulario
const FORM_VACIO = {
  nit: '', nrc: '', nombre: '', nombreComercial: '',
  codActividad: '', descActividad: '',
  codDep: '', codMun: '', distrito: '', codDistrito: '', complemento: '',
  telefono: '', correo: '',
  codEstable: '0001', codPuntoVenta: '1',
  plan: 'basico', activa: true,
  logo: '',
}

const styles = `
  .sa-wrap { max-width: 1100px; margin: 0 auto; padding: 4px 0 40px; }
  .sa-error { display: block; font-size: 11px; color: var(--danger); margin-top: 4px; font-weight: 600; }
  .sa-cols { display: grid; grid-template-columns: 1fr; gap: 18px; align-items: start; }
  @media (min-width: 900px) { .sa-cols { grid-template-columns: 1.4fr 1fr; } }
  .sa-col-lista { position: sticky; top: 12px; }
  @media (max-width: 899px) { .sa-col-lista { position: static; } }
  .sa-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
  .sa-head-icon { width: 42px; height: 42px; border-radius: 12px; background: rgba(74,143,232,0.14); border: 1.5px solid rgba(74,143,232,0.3); display: flex; align-items: center; justify-content: center; color: #4a8fe8; flex-shrink: 0; }
  .sa-head-icon svg { width: 22px; height: 22px; }
  .sa-title { font-size: 19px; font-weight: 800; color: var(--text); letter-spacing: -0.4px; }
  .sa-sub { font-size: 13px; color: var(--muted); margin-top: 1px; }

  .sa-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; padding: 22px; box-shadow: 0 4px 20px var(--shadow2); }
  .sa-card + .sa-card { margin-top: 16px; }
  .sa-section-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; margin: 0 0 10px; }
  .sa-section + .sa-section { margin-top: 20px; }

  .sa-grid { display: grid; gap: 12px; }
  .sa-g2 { grid-template-columns: 1fr 1fr; }
  .sa-g3 { grid-template-columns: 1fr 1fr 1fr; }
  .sa-g-actividad { grid-template-columns: 1fr 2fr; }
  .sa-full { grid-column: 1 / -1; }
  @media (max-width: 640px) { .sa-g2, .sa-g3, .sa-g-actividad { grid-template-columns: 1fr; } }

  .sa-field label { display: block; font-size: 12px; color: var(--muted); font-weight: 600; margin-bottom: 4px; }
  .sa-field input, .sa-field select {
    width: 100%; padding: 9px 11px; border-radius: 9px; font-size: 14px;
    background: var(--surface2); border: 1.5px solid var(--border); color: var(--text);
    transition: border-color 0.15s; box-sizing: border-box;
  }
  .sa-field input:focus, .sa-field select:focus { outline: none; border-color: var(--accent); }

  /* Logo */
  .sa-logo-row { display: flex; align-items: center; gap: 16px; }
  .sa-logo-box { width: 80px; height: 80px; border-radius: 14px; border: 2px dashed var(--border2); background: var(--surface2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; color: var(--muted); }
  .sa-logo-box img { width: 100%; height: 100%; object-fit: contain; }
  .sa-logo-box svg { width: 30px; height: 30px; }
  .sa-logo-info { flex: 1; min-width: 0; }
  .sa-btn-file { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 9px; background: var(--surface3); border: 1.5px solid var(--border); color: var(--text); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  .sa-btn-file:hover { border-color: var(--accent); }
  .sa-btn-file svg { width: 16px; height: 16px; }
  .sa-logo-hint { font-size: 11px; color: var(--muted); margin-top: 6px; }

  .sa-btn-guardar {
    width: 100%; margin-top: 20px; padding: 12px; border-radius: 11px; border: none;
    background: linear-gradient(135deg, #4a8fe8, #3b6fd4); color: white;
    font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.15s;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .sa-btn-guardar:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(74,143,232,0.3); }
  .sa-btn-guardar:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
  .sa-btn-guardar svg { width: 17px; height: 17px; }

  /* Lista */
  .sa-list-title { font-size: 13px; color: var(--muted); font-weight: 600; margin: 24px 0 10px; }
  .sa-emp { background: var(--surface); border: 1.5px solid var(--border); border-radius: 13px; padding: 13px 15px; display: flex; align-items: center; gap: 13px; }
  .sa-emp + .sa-emp { margin-top: 8px; }
  .sa-emp-logo { width: 42px; height: 42px; border-radius: 10px; background: var(--surface2); border: 1.5px solid var(--border); display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; color: var(--muted); }
  .sa-emp-logo img { width: 100%; height: 100%; object-fit: contain; }
  .sa-emp-logo svg { width: 20px; height: 20px; }
  .sa-emp-info { flex: 1; min-width: 0; }
  .sa-emp-nombre { font-size: 14px; font-weight: 700; color: var(--text); }
  .sa-emp-meta { font-size: 12px; color: var(--muted); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sa-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; flex-shrink: 0; cursor: pointer; border: none; }
  .sa-badge.activa { background: rgba(34,197,94,0.15); color: #16a34a; }
  .sa-badge.suspendida { background: rgba(239,68,68,0.15); color: #dc2626; }

  .sa-msg { padding: 11px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; margin-bottom: 14px; }
  .sa-msg.ok { background: rgba(34,197,94,0.12); color: #16a34a; }
  .sa-msg.err { background: rgba(239,68,68,0.12); color: #dc2626; }

  .sa-denegado { max-width: 440px; margin: 60px auto; text-align: center; color: var(--muted); }
  .sa-denegado svg { width: 48px; height: 48px; color: var(--danger); margin-bottom: 12px; }
`

// Íconos SVG inline
const Ico = ({ d, paths }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {paths || <path d={d} />}
  </svg>
)
const IcoTienda = () => <Ico paths={<><path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M4 21v-7h6v7" /></>} />
const IcoUpload = () => <Ico paths={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></>} />
const IcoImg = () => <Ico paths={<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></>} />
const IcoPlus = () => <Ico paths={<><path d="M12 5v14M5 12h14" /></>} />
const IcoLock = () => <Ico paths={<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>} />

// Comprime una imagen a máx 400px de ancho y devuelve base64 (controla peso/costo)
function comprimirImagen(file, maxW = 400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const escala = Math.min(1, maxW / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = img.width * escala
        canvas.height = img.height * escala
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png', 0.85))
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Validaciones de NIT/NRC (mismo criterio que Clientes.jsx) ──
function validarNit(nit) {
  const limpio = (nit || '').replace(/[-\s]/g, '')
  if (!limpio) return 'El NIT es obligatorio.'
  if (!/^\d{14}$/.test(limpio)) return 'El NIT debe tener 14 dígitos. Formato: 0614-010190-101-3'
  return null
}
function validarNrc(nrc) {
  const limpio = (nrc || '').replace(/[-\s]/g, '')
  if (!limpio) return null // NRC es opcional
  if (!/^\d+$/.test(limpio)) return 'El NRC solo debe tener números.'
  if (limpio.length > 8) return 'El NRC no debe superar 8 dígitos.'
  return null
}

export default function SuperAdmin() {
  const { user } = useAuth()
  const [form, setForm] = useState(FORM_VACIO)
  const [empresas, setEmpresas] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [errores, setErrores] = useState({})

  // Suscripción a la lista de empresas
  useEffect(() => {
    if (!esUsuarioMaestro(user)) return
    const q = query(collection(db, 'empresas'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setEmpresas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, err => console.warn('Error cargando empresas:', err?.message))
    return () => unsub()
  }, [user])

  // ── CANDADO: solo el maestro de One Geo entra ──
  if (!esUsuarioMaestro(user)) {
    return (
      <>
        <style>{styles}</style>
        <div className="sa-denegado">
          <IcoLock />
          <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Acceso restringido</p>
          <p>Este panel es exclusivo de One Geo Systems.</p>
        </div>
      </>
    )
  }

  const set = (campo, valor) => {
    setForm(f => ({ ...f, [campo]: valor }))
    if (errores[campo]) setErrores(e => ({ ...e, [campo]: null }))
  }

  const onLogo = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const base64 = await comprimirImagen(file)
      set('logo', base64)
    } catch {
      setMsg({ tipo: 'err', texto: 'No se pudo procesar la imagen.' })
    }
  }

  const registrar = async () => {
    // Validación con mensajes por campo
    const errNit = validarNit(form.nit)
    const errNrc = validarNrc(form.nrc)
    const errNombre = !form.nombre.trim() ? 'La razón social es obligatoria.' : null
    const nuevosErrores = {}
    if (errNit) nuevosErrores.nit = errNit
    if (errNrc) nuevosErrores.nrc = errNrc
    if (errNombre) nuevosErrores.nombre = errNombre
    setErrores(nuevosErrores)
    if (Object.keys(nuevosErrores).length > 0) {
      setMsg({ tipo: 'err', texto: 'Revisá los campos marcados en rojo.' })
      return
    }
    setGuardando(true)
    setMsg(null)
    try {
      const direccion = buildComplemento(form.distrito, form.complemento)
      await addDoc(collection(db, 'empresas'), {
        ...form,
        nit: form.nit.replace(/[-\s]/g, ''),
        nrc: form.nrc.replace(/[-\s]/g, ''),
        direccion,
        createdAt: serverTimestamp(),
        createdBy: user.email,
      })
      setMsg({ tipo: 'ok', texto: `Empresa "${form.nombreComercial || form.nombre}" registrada correctamente.` })
      setForm(FORM_VACIO)
      setErrores({})
    } catch (err) {
      setMsg({ tipo: 'err', texto: 'Error al registrar: ' + (err?.message || 'desconocido') })
    } finally {
      setGuardando(false)
    }
  }

  const toggleEstado = async (emp) => {
    try {
      await updateDoc(doc(db, 'empresas', emp.id), { activa: !emp.activa })
    } catch (err) {
      setMsg({ tipo: 'err', texto: 'No se pudo cambiar el estado.' })
    }
  }

  return (
    <>
      <style>{styles}</style>
      <div className="sa-wrap">

        <div className="sa-head">
          <div className="sa-head-icon"><IcoTienda /></div>
          <div>
            <div className="sa-title">Panel One Geo — Empresas</div>
            <div className="sa-sub">Registrar y gestionar clientes de ORIÓN</div>
          </div>
        </div>

        {msg && <div className={`sa-msg ${msg.tipo}`}>{msg.texto}</div>}

        <div className="sa-cols">
        <div className="sa-col-form">
        <div className="sa-card">

          {/* LOGO */}
          <div className="sa-section">
            <p className="sa-section-label">Logo</p>
            <div className="sa-logo-row">
              <div className="sa-logo-box">
                {form.logo ? <img src={form.logo} alt="logo" /> : <IcoImg />}
              </div>
              <div className="sa-logo-info">
                <label className="sa-btn-file">
                  <IcoUpload /> Subir logo
                  <input type="file" accept="image/*" onChange={onLogo} style={{ display: 'none' }} />
                </label>
                <p className="sa-logo-hint">Se comprime automáticamente. PNG o JPG.</p>
              </div>
            </div>
          </div>

          {/* IDENTIFICACIÓN FISCAL */}
          <div className="sa-section">
            <p className="sa-section-label">Identificación fiscal</p>
            <div className="sa-grid sa-g2">
              <div className="sa-field">
                <label>NIT *</label>
                <input value={form.nit} onChange={e => set('nit', e.target.value)} placeholder="0614-XXXXXX-XXX-X" style={errores.nit ? { borderColor: 'var(--danger)' } : {}} />
                {errores.nit && <span className="sa-error">{errores.nit}</span>}
              </div>
              <div className="sa-field">
                <label>NRC</label>
                <input value={form.nrc} onChange={e => set('nrc', e.target.value)} placeholder="123456-7" style={errores.nrc ? { borderColor: 'var(--danger)' } : {}} />
                {errores.nrc && <span className="sa-error">{errores.nrc}</span>}
              </div>
              <div className="sa-field sa-full">
                <label>Razón social *</label>
                <input value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Distribuidora López, S.A. de C.V." style={errores.nombre ? { borderColor: 'var(--danger)' } : {}} />
                {errores.nombre && <span className="sa-error">{errores.nombre}</span>}
              </div>
              <div className="sa-field sa-full"><label>Nombre comercial</label><input value={form.nombreComercial} onChange={e => set('nombreComercial', e.target.value)} placeholder="Ferretería López" /></div>
            </div>
          </div>

          {/* ACTIVIDAD ECONÓMICA */}
          <div className="sa-section">
            <p className="sa-section-label">Actividad económica</p>
            <BuscadorActividad
              codActividad={form.codActividad || ''}
              descActividad={form.descActividad || ''}
              onChange={({ codigo, descripcion }) => setForm(f => ({ ...f, codActividad: codigo, descActividad: descripcion }))}
            />
          </div>

          {/* DIRECCIÓN */}
          <div className="sa-section">
            <p className="sa-section-label">Dirección</p>
            <SelectorDepartamento
              codDep={form.codDep || ''}
              codMun={form.codMun || ''}
              distrito={form.distrito || ''}
              onChange={({ codDep, codMun, distrito, codDistrito }) =>
                setForm(f => ({ ...f, codDep, codMun, distrito: distrito || '', codDistrito: codDistrito || '' }))}
            />
            <div className="sa-field" style={{ marginTop: 12 }}><label>Complemento</label><input value={form.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Calle Roosevelt #45, Local 3" /></div>
          </div>

          {/* CONTACTO Y ESTABLECIMIENTO */}
          <div className="sa-section">
            <p className="sa-section-label">Contacto y establecimiento</p>
            <div className="sa-grid sa-g2">
              <div className="sa-field"><label>Teléfono</label><input value={form.telefono} onChange={e => set('telefono', e.target.value)} placeholder="2222-0000" /></div>
              <div className="sa-field"><label>Correo</label><input value={form.correo} onChange={e => set('correo', e.target.value)} placeholder="facturacion@empresa.com" /></div>
              <div className="sa-field"><label>Cód. establecimiento</label><input value={form.codEstable} onChange={e => set('codEstable', e.target.value)} placeholder="0001" /></div>
              <div className="sa-field"><label>Cód. punto de venta</label><input value={form.codPuntoVenta} onChange={e => set('codPuntoVenta', e.target.value)} placeholder="1" /></div>
            </div>
          </div>

          {/* PLAN Y ESTADO */}
          <div className="sa-section">
            <p className="sa-section-label">Plan y estado (SaaS)</p>
            <div className="sa-grid sa-g2">
              <div className="sa-field">
                <label>Plan</label>
                <select value={form.plan} onChange={e => set('plan', e.target.value)}>
                  {PLANES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div className="sa-field">
                <label>Estado</label>
                <select value={form.activa ? 'activa' : 'suspendida'} onChange={e => set('activa', e.target.value === 'activa')}>
                  <option value="activa">Activa</option>
                  <option value="suspendida">Suspendida</option>
                </select>
              </div>
            </div>
          </div>

          <button className="sa-btn-guardar" onClick={registrar} disabled={guardando}>
            <IcoPlus /> {guardando ? 'Registrando...' : 'Registrar empresa'}
          </button>
        </div>
        </div>{/* fin sa-col-form */}

        {/* LISTA DE EMPRESAS */}
        <div className="sa-col-lista">
        <p className="sa-list-title">Empresas registradas ({empresas.length})</p>
        {empresas.length === 0 ? (
          <div className="sa-emp" style={{ justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Aún no hay empresas registradas.
          </div>
        ) : empresas.map(emp => (
          <div key={emp.id} className="sa-emp">
            <div className="sa-emp-logo">{emp.logo ? <img src={emp.logo} alt="" /> : <IcoTienda />}</div>
            <div className="sa-emp-info">
              <div className="sa-emp-nombre">{emp.nombreComercial || emp.nombre}</div>
              <div className="sa-emp-meta">NIT {emp.nit} · Plan {emp.plan ? emp.plan.charAt(0).toUpperCase() + emp.plan.slice(1) : '—'}</div>
            </div>
            <button className={`sa-badge ${emp.activa ? 'activa' : 'suspendida'}`} onClick={() => toggleEstado(emp)}>
              {emp.activa ? 'Activa' : 'Suspendida'}
            </button>
          </div>
        ))}
        </div>{/* fin sa-col-lista */}

        </div>{/* fin sa-cols */}

      </div>
    </>
  )
}