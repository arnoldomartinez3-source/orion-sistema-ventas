import { useState, useEffect } from 'react'
import SelectorDepartamento from '../components/SelectorDepartamento'
import { buildComplemento } from '../data/departamentosMunicipios'
import BuscadorActividad from '../components/BuscadorActividad'
import { db } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp
} from 'firebase/firestore'

const emptyForm = { nombre: '', tipo: 'Natural', nit: '', dui: '', nrc: '', email: '', telefono: '', codDep: '', codMun: '', distrito: '', codDistrito: '', complemento: '', codActividad: '', descActividad: '' }

// Helpers para validar formato salvadoreño
const limpiarDoc = (v) => (v || '').replace(/[-\s]/g, '').trim()
const esNITValido = (nit) => /^\d{14}$/.test(limpiarDoc(nit))
const esDUIValido = (dui) => /^\d{9}$/.test(limpiarDoc(dui))

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [guardando, setGuardando] = useState(false)
  const [alerta, setAlerta] = useState(null) // { mensaje, titulo }

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clientes'), (snap) => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    document.body.style.overflow = modalOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [modalOpen])

  const filtrados = clientes.filter(c =>
    c.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.nit?.includes(busqueda) ||
    c.dui?.includes(busqueda) ||
    c.email?.toLowerCase().includes(busqueda.toLowerCase())
  )

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
        await addDoc(collection(db, 'clientes'), { ...data, createdAt: serverTimestamp() })
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
        <button className="btn btn-primary" onClick={() => abrirModal()}>+ Nuevo Cliente</button>
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
                      <div className="empty-text">{busqueda ? 'No se encontraron clientes' : 'Agrega tu primer cliente'}</div>
                    </div>
                  </td></tr>
                ) : filtrados.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.nombre}</td>
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