import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { usePermisos } from '../PermisosContext'
import Asistencia from './Asistencia'
import Planilla from './Planilla'
import {
  collection, onSnapshot, query, where,
  doc, setDoc, updateDoc, serverTimestamp
} from 'firebase/firestore'

// ══════════════════════════════════════════════════
// EMPLEADOS (RR.HH.) — Etapa 1 del módulo Asistencia + Planilla
// Registro de empleados. Colección 'empleados' SEPARADA de 'usuarios'
// (datos sensibles: sueldo/AFP/ISSS/PIN solo los lee el admin — ver reglas).
// El PIN es EXCLUSIVO de marcación (no es login del sistema).
// ══════════════════════════════════════════════════

const AFP_OPCIONES = ['Crecer', 'Confía', 'Solo ISSS']
const FRECUENCIAS = [
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
]

const FORM_VACIO = {
  nombre: '', cargo: '', pin: '',
  sueldo: '', frecuenciaPago: 'mensual', fechaIngreso: '',
  fondoAFP: 'Crecer', nroISSS: '', nroAFP: '', dui: '', telefono: '',
  activo: true,
}

const EmpIcon = ({ name }) => {
  const p = {
    total: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="10" r="2.2"/><path d="M5 16.5a3.5 3.5 0 0 1 7 0"/><path d="M14.5 9.5h3.5M14.5 13h3.5"/></>,
    activos: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M16 11l2 2 4-4"/></>,
    inactivos: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M17 8l5 5M22 8l-5 5"/></>,
    costo: <><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p[name]}</svg>
}

const empStyles = `
  .emp-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 16px; }
  @media (max-width: 900px) { .emp-stats { grid-template-columns: repeat(2,1fr); } }
  @media (max-width: 480px) { .emp-stats { grid-template-columns: 1fr; } }
  .emp-stat {
    background: linear-gradient(135deg, color-mix(in srgb, var(--cs-color, var(--accent)) 13%, var(--surface)), var(--surface));
    border: 1.5px solid var(--border); border-radius: 14px; padding: 14px 16px;
    position: relative; overflow: hidden; transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .emp-stat.clickable { cursor: pointer; }
  .emp-stat.clickable:hover { transform: translateY(-2px); box-shadow: 0 6px 22px var(--shadow); }
  .emp-stat.activa { border-color: var(--cs-color, var(--accent)); box-shadow: 0 0 0 1.5px var(--cs-color, var(--accent)); }
  .emp-stat-ic { width: 24px; height: 24px; color: var(--cs-color, var(--accent)); margin-bottom: 6px; }
  .emp-stat-ic svg { width: 100%; height: 100%; }
  .emp-stat-num { font-size: 26px; font-weight: 800; font-family: var(--mono); letter-spacing: -0.5px; line-height: 1; }
  .emp-stat-lbl { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }

  .emp-avatar { width: 34px; height: 34px; border-radius: 9px; background: linear-gradient(135deg,#14213D,#2E5FA3); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; flex-shrink: 0; }
  .emp-cell { display: flex; align-items: center; gap: 10px; }
  .emp-cell-name { font-weight: 700; font-size: 14px; color: var(--text); }
  .emp-cell-sub { font-size: 11px; color: var(--muted); }
  .emp-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.3px; }

  .emp-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 560px) { .emp-form-grid { grid-template-columns: 1fr; } }
  .emp-seg { display: flex; gap: 6px; }
  .emp-seg button { flex: 1; }

  .emp-tabs { display: flex; gap: 4px; margin-bottom: 18px; border-bottom: 1.5px solid var(--border); flex-wrap: wrap; }
  .emp-tabs button { background: none; border: none; border-bottom: 2.5px solid transparent; color: var(--muted);
    font-size: 14px; font-weight: 700; padding: 10px 16px; cursor: pointer; transition: color 0.15s, border-color 0.15s; margin-bottom: -1.5px; }
  .emp-tabs button:hover { color: var(--text); }
  .emp-tabs button.on { color: var(--accent); border-bottom-color: var(--accent3); }
`

export default function Empleados() {
  const { empresaId, esAdmin, userId, puede } = usePermisos()
  const puedeGestionar = esAdmin || puede('gestionar_personal')
  const navigate = useNavigate()
  const [tab, setTab] = useState('lista')   // lista | marcacion | asistencia

  const [empleados, setEmpleados] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')   // todos | activos | inactivos
  const [filtroFrec, setFiltroFrec] = useState('todas')       // todas | quincenal | mensual

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!empresaId) return
    const unsub = onSnapshot(
      query(collection(db, 'empleados'), where('empresaId', '==', empresaId)),
      snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        data.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
        setEmpleados(data)
        setLoading(false)
      },
      () => setLoading(false)
    )
    return () => unsub()
  }, [empresaId])

  // ── Métricas ──
  const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`
  const activos = empleados.filter(e => e.activo !== false)
  const inactivos = empleados.filter(e => e.activo === false)
  const costoMes = activos.reduce((s, e) => {
    const m = Number(e.sueldo) || 0
    return s + (e.frecuenciaPago === 'quincenal' ? m * 2 : m)
  }, 0)

  // ── Filtros ──
  const visibles = empleados.filter(e => {
    if (filtroEstado === 'activos' && e.activo === false) return false
    if (filtroEstado === 'inactivos' && e.activo !== false) return false
    if (filtroFrec !== 'todas' && e.frecuenciaPago !== filtroFrec) return false
    if (busqueda) {
      const q = busqueda.toLowerCase()
      if (!(e.nombre || '').toLowerCase().includes(q) && !(e.cargo || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  // ── Form ──
  const abrirNuevo = () => { setEditando(null); setForm(FORM_VACIO); setModalOpen(true) }
  const abrirEditar = (e) => {
    setEditando(e.id)
    setForm({
      nombre: e.nombre || '', cargo: e.cargo || '', pin: e.pin || '',
      sueldo: e.sueldo != null ? String(e.sueldo) : '', frecuenciaPago: e.frecuenciaPago || 'mensual',
      fechaIngreso: e.fechaIngreso || '', fondoAFP: e.fondoAFP || 'Crecer',
      nroISSS: e.nroISSS || '', nroAFP: e.nroAFP || '', dui: e.dui || '', telefono: e.telefono || '',
      activo: e.activo !== false,
    })
    setModalOpen(true)
  }

  const guardar = async () => {
    if (!form.nombre.trim()) { alert('El nombre es obligatorio'); return }
    if (!form.pin || form.pin.length < 4) { alert('El PIN de marcación debe tener al menos 4 dígitos'); return }
    if (!form.sueldo || Number(form.sueldo) <= 0) { alert('Ingresá un sueldo válido'); return }
    // PIN único dentro de la empresa (lo usará la marcación para identificar)
    const pinDup = empleados.some(e => e.pin === form.pin && e.id !== editando)
    if (pinDup) { alert('Ese PIN ya lo usa otro empleado. Elegí uno distinto.'); return }

    setGuardando(true)
    try {
      const base = {
        nombre: form.nombre.trim(), cargo: form.cargo.trim(), pin: form.pin,
        sueldo: Number(form.sueldo) || 0, frecuenciaPago: form.frecuenciaPago,
        fechaIngreso: form.fechaIngreso, fondoAFP: form.fondoAFP,
        nroISSS: form.nroISSS.trim(), nroAFP: form.nroAFP.trim(),
        dui: form.dui.trim(), telefono: form.telefono.trim(),
        activo: form.activo, updatedAt: serverTimestamp(),
      }
      if (editando) {
        await updateDoc(doc(db, 'empleados', editando), base)
      } else {
        await setDoc(doc(collection(db, 'empleados')), {
          ...base, empresaId,
          fotoUrl: '',        // se completa en una etapa posterior (Storage)
          usuarioId: '',      // enlace opcional al usuario del sistema (POS)
          creadoPor: userId || '',
          createdAt: serverTimestamp(),
        })
      }
      setModalOpen(false)
    } catch (e) {
      alert('Error al guardar: ' + e.message)
    }
    setGuardando(false)
  }

  const getIniciales = (n) => (n || '?').trim().split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2)
  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  if (!puedeGestionar) {
    return (
      <div className="empty-state" style={{ padding: 60, textAlign: 'center' }}>
        <div className="empty-text">No tenés permiso para gestionar el personal.</div>
      </div>
    )
  }

  return (
    <>
      <style>{empStyles}</style>

      {/* TOPBAR + PESTAÑAS */}
      <div className="topbar">
        <div>
          <div className="page-title">Personal</div>
          <div className="page-sub">Empleados, marcación y asistencia</div>
        </div>
        {tab === 'lista' && (
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={abrirNuevo}>+ Nuevo empleado</button>
          </div>
        )}
      </div>

      <div className="emp-tabs">
        <button className={tab === 'lista' ? 'on' : ''} onClick={() => setTab('lista')}>👥 Empleados</button>
        <button className={tab === 'marcacion' ? 'on' : ''} onClick={() => setTab('marcacion')}>🕒 Marcación</button>
        <button className={tab === 'asistencia' ? 'on' : ''} onClick={() => setTab('asistencia')}>📅 Asistencia</button>
        <button className={tab === 'planilla' ? 'on' : ''} onClick={() => setTab('planilla')}>💵 Planilla</button>
      </div>

      {/* PESTAÑA: MARCACIÓN (lanzador del kiosco) */}
      {tab === 'marcacion' && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>🕒</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Modo Marcación (kiosco)</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 470, margin: '0 auto 20px' }}>
            Abrí esta pantalla en la tablet del negocio. Los empleados marcan entrada/salida con su PIN y foto.
            Para volver al sistema te pedirá tu PIN de salida.
          </div>
          <button className="btn btn-primary" style={{ fontSize: 16, padding: '12px 28px' }} onClick={() => navigate('/marcacion')}>
            ▶ Abrir modo marcación
          </button>
        </div>
      )}

      {/* PESTAÑA: ASISTENCIA */}
      {tab === 'asistencia' && <Asistencia empleados={empleados} />}

      {/* PESTAÑA: PLANILLA */}
      {tab === 'planilla' && <Planilla empleados={empleados} />}

      {/* PESTAÑA: EMPLEADOS (registro) */}
      {tab === 'lista' && (
      <>
      {/* TARJETAS */}
      <div className="emp-stats">
        <div className="emp-stat" style={{ '--cs-color': '#0ea5e9' }}>
          <div className="emp-stat-ic"><EmpIcon name="total" /></div>
          <div className="emp-stat-num" style={{ color: '#0ea5e9' }}>{empleados.length}</div>
          <div className="emp-stat-lbl">Total empleados</div>
        </div>
        <div className={`emp-stat clickable ${filtroEstado === 'activos' ? 'activa' : ''}`} style={{ '--cs-color': '#00C296' }}
          onClick={() => setFiltroEstado(filtroEstado === 'activos' ? 'todos' : 'activos')}>
          <div className="emp-stat-ic"><EmpIcon name="activos" /></div>
          <div className="emp-stat-num" style={{ color: '#00C296' }}>{activos.length}</div>
          <div className="emp-stat-lbl">Activos</div>
        </div>
        <div className={`emp-stat clickable ${filtroEstado === 'inactivos' ? 'activa' : ''}`} style={{ '--cs-color': '#ef4444' }}
          onClick={() => setFiltroEstado(filtroEstado === 'inactivos' ? 'todos' : 'inactivos')}>
          <div className="emp-stat-ic"><EmpIcon name="inactivos" /></div>
          <div className="emp-stat-num" style={{ color: '#ef4444' }}>{inactivos.length}</div>
          <div className="emp-stat-lbl">Inactivos</div>
        </div>
        <div className="emp-stat" style={{ '--cs-color': '#C19A2E' }} title="Suma de sueldos activos, normalizada a un mes">
          <div className="emp-stat-ic"><EmpIcon name="costo" /></div>
          <div className="emp-stat-num" style={{ color: '#C19A2E' }}>{fmt(costoMes)}</div>
          <div className="emp-stat-lbl">Costo planilla / mes</div>
        </div>
      </div>

      {/* FILTROS (debajo de las tarjetas) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" style={{ maxWidth: 240 }}
          placeholder="🔍 Buscar por nombre o cargo..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ value: 'todos', label: 'Todos' }, { value: 'activos', label: 'Activos' }, { value: 'inactivos', label: 'Inactivos' }].map(f => (
            <button key={f.value} className={`btn btn-sm ${filtroEstado === f.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFiltroEstado(f.value)}>{f.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ value: 'todas', label: '💵 Todas' }, { value: 'quincenal', label: 'Quincenal' }, { value: 'mensual', label: 'Mensual' }].map(f => (
            <button key={f.value} className={`btn btn-sm ${filtroFrec === f.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFiltroFrec(f.value)}>{f.label}</button>
          ))}
        </div>
        {(busqueda || filtroEstado !== 'todos' || filtroFrec !== 'todas') && (
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
            onClick={() => { setBusqueda(''); setFiltroEstado('todos'); setFiltroFrec('todas') }}>✕ Limpiar</button>
        )}
      </div>

      {/* TABLA */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>EMPLEADO</th><th>FRECUENCIA</th><th>SUELDO</th>
                <th>INGRESO</th><th>AFP</th><th>ESTADO</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>Cargando…</td></tr>
              ) : visibles.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>
                  {empleados.length === 0 ? 'Aún no hay empleados. Agregá el primero con “+ Nuevo empleado”.' : 'Sin resultados con esos filtros.'}
                </td></tr>
              ) : visibles.map(e => (
                <tr key={e.id}>
                  <td>
                    <div className="emp-cell">
                      <div className="emp-avatar">{getIniciales(e.nombre)}</div>
                      <div>
                        <div className="emp-cell-name">{e.nombre}</div>
                        <div className="emp-cell-sub">{e.cargo || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{e.frecuenciaPago || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmt(e.sueldo)}</td>
                  <td>{e.fechaIngreso || '—'}</td>
                  <td>{e.fondoAFP || '—'}</td>
                  <td>
                    <span className="emp-badge" style={{
                      background: e.activo !== false ? 'rgba(0,194,150,0.14)' : 'rgba(239,68,68,0.14)',
                      color: e.activo !== false ? '#00C296' : '#ef4444',
                    }}>{e.activo !== false ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => abrirEditar(e)}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* MODAL ALTA / EDICIÓN */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={ev => ev.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-title">{editando ? '✏️ Editar empleado' : '🧑‍💼 Nuevo empleado'}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
              <div className="form-group">
                <label className="form-label">Nombre completo *</label>
                <input className="input" placeholder="Juan Carlos Argueta" value={form.nombre} onChange={e => set('nombre', e.target.value)} />
              </div>

              <div className="emp-form-grid">
                <div className="form-group">
                  <label className="form-label">Cargo</label>
                  <input className="input" placeholder="Cajero / Bodeguero…" value={form.cargo} onChange={e => set('cargo', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">PIN de marcación * <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>(4-6 dígitos, solo para marcar)</span></label>
                  <input className="input" type="number" placeholder="1234" value={form.pin}
                    onChange={e => set('pin', e.target.value.slice(0, 6))} />
                </div>
              </div>

              <div className="emp-form-grid">
                <div className="form-group">
                  <label className="form-label">Sueldo (por período) *</label>
                  <input className="input" type="number" placeholder="365.00" value={form.sueldo} onChange={e => set('sueldo', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Frecuencia de pago</label>
                  <div className="emp-seg">
                    {FRECUENCIAS.map(f => (
                      <button key={f.value} className={`btn btn-sm ${form.frecuenciaPago === f.value ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => set('frecuenciaPago', f.value)}>{f.label}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="emp-form-grid">
                <div className="form-group">
                  <label className="form-label">Fecha de ingreso</label>
                  <input className="input" type="date" value={form.fechaIngreso} onChange={e => set('fechaIngreso', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fondo AFP</label>
                  <select className="input" value={form.fondoAFP} onChange={e => set('fondoAFP', e.target.value)}>
                    {AFP_OPCIONES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <div className="emp-form-grid">
                <div className="form-group">
                  <label className="form-label">Nº ISSS</label>
                  <input className="input" placeholder="000000000" value={form.nroISSS} onChange={e => set('nroISSS', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nº AFP (NUP) <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>(opcional)</span></label>
                  <input className="input" placeholder="—" value={form.nroAFP} onChange={e => set('nroAFP', e.target.value)} />
                </div>
              </div>

              <div className="emp-form-grid">
                <div className="form-group">
                  <label className="form-label">DUI <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>(opcional)</span></label>
                  <input className="input" placeholder="00000000-0" value={form.dui} onChange={e => set('dui', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>(opcional)</span></label>
                  <input className="input" placeholder="0000-0000" value={form.telefono} onChange={e => set('telefono', e.target.value)} />
                </div>
              </div>

              {editando && (
                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[true, false].map(v => (
                      <div key={String(v)} onClick={() => set('activo', v)}
                        style={{
                          flex: 1, padding: '10px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
                          border: `1.5px solid ${form.activo === v ? (v ? '#00C296' : '#ef4444') : 'var(--border)'}`,
                          background: form.activo === v ? (v ? 'rgba(0,194,150,0.1)' : 'rgba(239,68,68,0.1)') : 'var(--surface2)',
                          color: form.activo === v ? (v ? '#00C296' : '#ef4444') : 'var(--muted)',
                          fontSize: 13, fontWeight: 600,
                        }}>{v ? '✅ Activo' : '🔒 Inactivo'}</div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ background: 'var(--gold-glow)', border: '1px solid rgba(193,154,46,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--text2)' }}>
                💡 El <strong>PIN</strong> solo sirve para que el empleado <strong>marque asistencia</strong> (no entra al sistema). Los datos de planilla son privados: solo vos los ves.
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando || !form.nombre || !form.pin || !form.sueldo}>
                {guardando ? '⏳…' : editando ? '💾 Guardar cambios' : '🧑‍💼 Crear empleado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
