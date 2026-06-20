import { useState, useEffect } from 'react'
import SelectorDepartamento from '../components/SelectorDepartamento'
import { buildComplemento } from '../data/departamentosMunicipios'
import BuscadorActividad from '../components/BuscadorActividad'
import { db } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, query, where
} from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'

const emptyForm = { nombre: '', tipo: 'Natural', nit: '', dui: '', nrc: '', email: '', telefono: '', codDep: '', codMun: '', distrito: '', codDistrito: '', complemento: '', codActividad: '', descActividad: '' }

// Helpers para validar formato salvadoreño
const limpiarDoc = (v) => (v || '').replace(/[-\s]/g, '').trim()
const esNITValido = (nit) => /^\d{14}$/.test(limpiarDoc(nit))
const esDUIValido = (dui) => /^\d{9}$/.test(limpiarDoc(dui))

// Íconos de línea para las métricas (heredan color vía currentColor)
const StatIcon = ({ name }) => {
  const paths = {
    total: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    natural: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    juridico: <><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3" /><path d="M9 9v.01M9 13v.01M9 17v.01" /></>,
    nrc: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 13h6M9 17h4" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

const cliStyles = `
  .cli-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 18px; }
  @media (max-width: 900px) { .cli-stats { grid-template-columns: repeat(2,1fr); } }
  @media (max-width: 480px) { .cli-stats { grid-template-columns: 1fr; } }
  .cli-stat {
    background: linear-gradient(135deg, color-mix(in srgb, var(--cs-color, var(--accent)) 13%, var(--surface)), var(--surface));
    border: 1.5px solid var(--border); border-radius: 14px; padding: 14px 16px;
    position: relative; overflow: hidden;
    cursor: pointer; transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .cli-stat:hover { transform: translateY(-2px); box-shadow: 0 6px 22px var(--shadow); }
  .cli-stat.activa { border-color: var(--cs-color, var(--accent)); box-shadow: 0 0 0 1.5px var(--cs-color, var(--accent)); }
  .cli-stat-watermark { position: absolute; bottom: -10px; right: -8px; width: 54px; height: 54px; color: var(--cs-color, var(--accent)); opacity: 0.13; pointer-events: none; }
  .cli-stat-watermark svg { width: 100%; height: 100%; }
  .cli-stat-icon { width: 24px; height: 24px; color: var(--cs-color, var(--accent)); margin-bottom: 6px; position: relative; }
  .cli-stat-icon svg { width: 100%; height: 100%; }
  .cli-stat-val { font-size: 26px; font-weight: 800; font-family: var(--mono); letter-spacing: -0.5px; line-height: 1; position: relative; }
  .cli-stat-label { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; position: relative; }
`

export default function Clientes() {
  const { empresaId } = usePermisos()
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos') // 'todos' | 'natural' | 'juridico' | 'nrc'
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [guardando, setGuardando] = useState(false)
  const [alerta, setAlerta] = useState(null) // { mensaje, titulo }

  useEffect(() => {
    if (!empresaId) return // esperar a que cargue el empresaId del usuario
    const q = query(collection(db, 'clientes'), where('empresaId', '==', empresaId))
    const unsub = onSnapshot(q, (snap) => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [empresaId])

  useEffect(() => {
    document.body.style.overflow = modalOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [modalOpen])

  // Coincide con el tipo elegido en las métricas (toggle de filtro)
  const coincideTipo = (c) => {
    if (filtroTipo === 'natural') return (c.tipo || 'Natural') === 'Natural'
    if (filtroTipo === 'juridico') return c.tipo === 'Jurídico'
    if (filtroTipo === 'nrc') return !!(c.nrc || '').trim()
    return true
  }

  const filtrados = clientes.filter(c =>
    coincideTipo(c) && (
      c.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.nit?.includes(busqueda) ||
      c.dui?.includes(busqueda) ||
      c.email?.toLowerCase().includes(busqueda.toLowerCase())
    )
  )

  // Métricas por tipo de cliente (siempre sobre el total, no sobre lo filtrado)
  const totalClientes = clientes.length
  const naturales = clientes.filter(c => (c.tipo || 'Natural') === 'Natural').length
  const juridicos = clientes.filter(c => c.tipo === 'Jurídico').length
  const contribuyentes = clientes.filter(c => (c.nrc || '').trim()).length

  // Clic en una métrica: activa ese filtro o lo quita si ya estaba activo
  const toggleFiltro = (tipo) => setFiltroTipo(prev => prev === tipo ? 'todos' : tipo)

  // ¿Ya existe el cliente VARIOS (consumidor final por defecto)?
  const existeVarios = clientes.some(c => c.esConsumidorFinal || c.nombre?.toUpperCase() === 'VARIOS')

  // Crear el cliente VARIOS por defecto (consumidor final sin documento).
  // Salta las validaciones normales porque es un caso especial controlado.
  const crearVarios = async () => {
    if (existeVarios) {
      setAlerta({ titulo: 'Ya existe', mensaje: 'El cliente VARIOS ya está creado.' })
      return
    }
    setGuardando(true)
    try {
      await addDoc(collection(db, 'clientes'), {
        nombre: 'VARIOS',
        tipo: 'Natural',
        nit: '', dui: '', nrc: '',
        email: '', telefono: '',
        codDep: '', codMun: '', distrito: '', codDistrito: '', complemento: '',
        codActividad: '', descActividad: '',
        direccion: '',
        esConsumidorFinal: true,
        empresaId,
        createdAt: serverTimestamp(),
      })
      setAlerta({ titulo: 'Listo', mensaje: 'Cliente VARIOS creado. Ya podés usarlo como consumidor final por defecto.' })
    } catch (e) {
      setAlerta({ titulo: 'Error', mensaje: e.message })
    }
    setGuardando(false)
  }

  const abrirModal = (cliente = null) => {
    if (cliente) { setEditando(cliente.id); setForm({ ...emptyForm, ...cliente }) }
    else { setEditando(null); setForm(emptyForm) }
    setModalOpen(true)
  }

  const guardar = async () => {
    if (!form.nombre) {
      setAlerta({ titulo: 'Campos requeridos', mensaje: 'El nombre o razón social es obligatorio.' })
      return
    }
    // Para Jurídico, NIT obligatorio. Para Natural, al menos uno de NIT o DUI.
    if (form.tipo === 'Jurídico') {
      if (!form.nit) {
        setAlerta({ titulo: 'NIT requerido', mensaje: 'Los clientes Jurídicos requieren NIT obligatoriamente.' })
        return
      }
      if (!esNITValido(form.nit)) {
        setAlerta({ titulo: 'Formato de NIT inválido', mensaje: 'El NIT debe tener 14 dígitos. Formato esperado: 0614-010190-101-3' })
        return
      }
    } else {
      // Natural: necesita al menos uno (DUI o NIT)
      if (!form.nit && !form.dui) {
        setAlerta({ titulo: 'Documento requerido', mensaje: 'Los clientes Naturales requieren DUI o NIT (uno de los dos).' })
        return
      }
      if (form.nit && !esNITValido(form.nit)) {
        setAlerta({ titulo: 'Formato de NIT inválido', mensaje: 'El NIT debe tener 14 dígitos. Si solo tenés DUI, dejá el NIT vacío.' })
        return
      }
      if (form.dui && !esDUIValido(form.dui)) {
        setAlerta({ titulo: 'Formato de DUI inválido', mensaje: 'El DUI debe tener 9 dígitos. Formato esperado: 12345678-9' })
        return
      }
    }
    if (form.nrc && (!form.codActividad || !form.descActividad)) {
      setAlerta({ titulo: 'Actividad Económica requerida', mensaje: 'Para clientes con NRC (CCF), la actividad económica es obligatoria y debe seleccionarse del catálogo del MH.' })
      return
    }
    setGuardando(true)
    const direccion = buildComplemento(form.distrito, form.complemento)
    // Limpiar campos de documento — guardar sin guiones es más consistente para queries.
    // Pero mantenemos los guiones visibles en form; el limpio se hace al usar el dato.
    const data = { ...form, direccion, updatedAt: serverTimestamp() }
    try {
      if (editando) {
        await updateDoc(doc(db, 'clientes', editando), data)
      } else {
        await addDoc(collection(db, 'clientes'), { ...data, empresaId, createdAt: serverTimestamp() })
      }
      setModalOpen(false)
    } catch (e) {
      setAlerta({ titulo: 'Error al guardar', mensaje: e.message })
    }
    setGuardando(false)
  }

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar este cliente?')) return
    try { await deleteDoc(doc(db, 'clientes', id)) }
    catch (e) { setAlerta({ titulo: 'Error', mensaje: e.message }) }
  }

  return (
    <>
      <style>{cliStyles}</style>

      {/* ── MODAL ALERTA ── */}
      {alerta && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '28px 32px', maxWidth: 400, width: '100%', boxShadow: '0 25px 80px rgba(0,0,0,0.5)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{alerta.titulo}</div>
            <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>{alerta.mensaje}</div>
            <button className="btn btn-primary" style={{ width: '100%', padding: '12px' }} onClick={() => setAlerta(null)} autoFocus>
              Entendido
            </button>
          </div>
        </div>
      )}

      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">👥 Clientes</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {clientes.length} clientes
            <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(255,160,0,0.12)', color:'#ffa000', fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, fontFamily:'var(--mono)' }}>🔥 Firebase</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!existeVarios && (
            <button className="btn btn-ghost" onClick={crearVarios} disabled={guardando} title="Crea un cliente por defecto para consumidor final sin datos">
              + Cliente VARIOS
            </button>
          )}
          <button className="btn btn-primary" onClick={() => abrirModal()}>+ Nuevo Cliente</button>
        </div>
      </div>

      {/* ── MÉTRICAS POR TIPO DE CLIENTE (clic para filtrar la tabla) ── */}
      <div className="cli-stats">
        <div className={`cli-stat ${filtroTipo === 'todos' ? 'activa' : ''}`} style={{ '--cs-color': '#4A8FE8' }}
          onClick={() => setFiltroTipo('todos')} title="Mostrar todos">
          <div className="cli-stat-watermark"><StatIcon name="total" /></div>
          <div className="cli-stat-icon"><StatIcon name="total" /></div>
          <div className="cli-stat-val" style={{ color: '#4A8FE8' }}>{totalClientes}</div>
          <div className="cli-stat-label">Total clientes</div>
        </div>
        <div className={`cli-stat ${filtroTipo === 'natural' ? 'activa' : ''}`} style={{ '--cs-color': '#00C296' }}
          onClick={() => toggleFiltro('natural')} title="Filtrar Persona Natural">
          <div className="cli-stat-watermark"><StatIcon name="natural" /></div>
          <div className="cli-stat-icon"><StatIcon name="natural" /></div>
          <div className="cli-stat-val" style={{ color: '#00C296' }}>{naturales}</div>
          <div className="cli-stat-label">Persona Natural</div>
        </div>
        <div className={`cli-stat ${filtroTipo === 'juridico' ? 'activa' : ''}`} style={{ '--cs-color': '#8b5cf6' }}
          onClick={() => toggleFiltro('juridico')} title="Filtrar Persona Jurídica">
          <div className="cli-stat-watermark"><StatIcon name="juridico" /></div>
          <div className="cli-stat-icon"><StatIcon name="juridico" /></div>
          <div className="cli-stat-val" style={{ color: '#8b5cf6' }}>{juridicos}</div>
          <div className="cli-stat-label">Persona Jurídica</div>
        </div>
        <div className={`cli-stat ${filtroTipo === 'nrc' ? 'activa' : ''}`} style={{ '--cs-color': '#f59e0b' }}
          onClick={() => toggleFiltro('nrc')} title="Filtrar contribuyentes con NRC">
          <div className="cli-stat-watermark"><StatIcon name="nrc" /></div>
          <div className="cli-stat-icon"><StatIcon name="nrc" /></div>
          <div className="cli-stat-val" style={{ color: '#f59e0b' }}>{contribuyentes}</div>
          <div className="cli-stat-label">Contribuyentes · NRC</div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <input className="input" style={{ maxWidth: 340 }} placeholder="🔍 Buscar por nombre, NIT o email..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>🔄 Cargando clientes desde Firebase...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>NOMBRE</th><th>TIPO</th><th>NIT / DUI</th><th>NRC</th><th>TELÉFONO</th><th>EMAIL</th><th>ACCIONES</th></tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr><td colSpan={7}>
                    <div className="empty-state">
                      <div className="empty-icon">👥</div>
                      <div className="empty-text">{(busqueda || filtroTipo !== 'todos') ? 'No se encontraron clientes' : 'Agrega tu primer cliente'}</div>
                    </div>
                  </td></tr>
                ) : filtrados.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>
                      {c.nombre}
                      {(c.esConsumidorFinal || c.nombre?.toUpperCase() === 'VARIOS') && (
                        <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, background: 'rgba(74,143,232,0.15)', color: '#4a8fe8', padding: '2px 7px', borderRadius: 5 }}>POR DEFECTO</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${c.tipo === 'Jurídico' ? 'emitida' : 'pendiente'}`}>
                        <span className="dot" />{c.tipo}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {c.nit ? (
                        <div><span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700 }}>NIT</span> {c.nit}</div>
                      ) : c.dui ? (
                        <div><span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700 }}>DUI</span> {c.dui}</div>
                      ) : '—'}
                    </td>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{c.nrc || '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>{c.telefono}</td>
                    <td style={{ color: 'var(--accent2)', fontSize: 12 }}>{c.email}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => abrirModal(c)}>✏️ Editar</button>
                        <button className="btn btn-danger" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => eliminar(c.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={e => e.stopPropagation()}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editando ? '✏️ Editar Cliente' : '+ Nuevo Cliente'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">NOMBRE / RAZÓN SOCIAL *</label>
                <input className="input" placeholder="Nombre completo o razón social" value={form.nombre || ''} onChange={e => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">TIPO DE PERSONA</label>
                  <select className="input" value={form.tipo || 'Natural'}
                    onChange={e => {
                      const nuevoTipo = e.target.value
                      // Si pasa a Jurídico, limpiar DUI (no aplica para empresas)
                      setForm(f => ({ ...f, tipo: nuevoTipo, dui: nuevoTipo === 'Jurídico' ? '' : f.dui }))
                    }}>
                    <option value="Natural">Natural</option>
                    <option value="Jurídico">Jurídico</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">TELÉFONO</label>
                  <input className="input" placeholder="2222-3333" value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">
                    NIT {form.tipo === 'Jurídico' && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>
                  <input
                    className="input"
                    placeholder="0614-010190-101-3"
                    value={form.nit || ''}
                    onChange={e => setForm({ ...form, nit: e.target.value })}
                    style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
                  />
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    14 dígitos. Obligatorio para clientes Jurídicos.
                  </div>
                </div>
                {/* DUI: solo se ofrece para personas Naturales */}
                {form.tipo === 'Natural' && (
                  <div className="form-group">
                    <label className="form-label">
                      DUI {!form.nit && <span style={{ color: '#f59e0b', fontSize: 10 }}>(o NIT)</span>}
                    </label>
                    <input
                      className="input"
                      placeholder="12345678-9"
                      value={form.dui || ''}
                      onChange={e => setForm({ ...form, dui: e.target.value })}
                      style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
                    />
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                      9 dígitos. Para Consumidor Final identificado.
                    </div>
                  </div>
                )}
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">NRC (si aplica)</label>
                  <input className="input" placeholder="12345-6" value={form.nrc || ''} onChange={e => setForm({ ...form, nrc: e.target.value })} />
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    Solo si el cliente emite CCF
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">EMAIL</label>
                  <input className="input" placeholder="correo@empresa.com" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">
                  ACTIVIDAD ECONÓMICA
                  {form.nrc && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
                </label>
                <BuscadorActividad
                  codActividad={form.codActividad || ''}
                  descActividad={form.descActividad || ''}
                  onChange={({ codigo, descripcion }) => setForm(f => ({ ...f, codActividad: codigo, descActividad: descripcion }))}
                  placeholder="Buscar por código o descripción..."
                />
                {form.nrc && !form.codActividad && (
                  <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
                    ⚠️ Obligatoria para clientes CCF
                  </div>
                )}
              </div>
              <div>
                <label className="form-label" style={{ marginBottom: 6, display: 'block' }}>DIRECCIÓN</label>
                <SelectorDepartamento
                  codDep={form.codDep || ''}
                  codMun={form.codMun || ''}
                  distrito={form.distrito || ''}
                  onChange={({ codDep, codMun, distrito, codDistrito }) =>
                    setForm(f => ({ ...f, codDep, codMun, distrito: distrito || '', codDistrito: codDistrito || '' }))}
                />
                <input className="input" style={{ marginTop: 8 }}
                  placeholder="Complemento: calle, colonia, número..."
                  value={form.complemento || ''}
                  onChange={e => setForm({ ...form, complemento: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
                {guardando ? '⏳ Guardando...' : '💾 Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}