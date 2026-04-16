import { useState, useEffect } from 'react'
import { db } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp
} from 'firebase/firestore'

const emptyForm = { nombre1: '', tipo1: 'Natural', nit1: '', nrc: '', email: '', telefono: '', direccion: '' }

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clientes'), (snap) => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const filtrados = clientes.filter(c =>
    c.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.nit?.includes(busqueda) ||
    c.email?.toLowerCase().includes(busqueda.toLowerCase())
  )

  const abrirModal = (cliente = null) => {
    if (cliente) { setEditando(cliente.id); setForm({ ...emptyForm, ...cliente }) }
    else { setEditando(null); setForm(emptyForm) }
    setModalOpen(true)
  }

  const guardar = async () => {
    if (!form.nombre || !form.nit) return
    setGuardando(true)
    const data = { ...form, updatedAt: serverTimestamp() }
    try {
      if (editando) {
        await updateDoc(doc(db, 'clientes', editando), data)
      } else {
        await addDoc(collection(db, 'clientes'), { ...data, createdAt: serverTimestamp() })
      }
      setModalOpen(false)
    } catch (e) {
      alert('Error al guardar: ' + e.message)
    }
    setGuardando(false)
  }

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar este cliente?')) return
    try { await deleteDoc(doc(db, 'clientes', id)) }
    catch (e) { alert('Error: ' + e.message) }
  }

  return (
    <>
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
                <tr><th>NOMBRE</th><th>TIPO</th><th>NIT</th><th>NRC</th><th>TELÉFONO</th><th>EMAIL</th><th>ACCIONES</th></tr>
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
                    <td className="mono" style={{ fontSize: 12 }}>{c.nit}</td>
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
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editando ? '✏️ Editar Cliente' : '+ Nuevo Cliente'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">NOMBRE / RAZÓN SOCIAL</label>
                <input className="input" placeholder="Nombre completo o razón social" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">TIPO DE PERSONA</label>
                  <select className="input" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                    <option>Natural</option>
                    <option>Jurídico</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">TELÉFONO</label>
                  <input className="input" placeholder="2222-3333" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">NIT</label>
                  <input className="input" placeholder="0614-010190-101-3" value={form.nit} onChange={e => setForm({ ...form, nit: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">NRC (si aplica)</label>
                  <input className="input" placeholder="12345-6" value={form.nrc} onChange={e => setForm({ ...form, nrc: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">EMAIL</label>
                <input className="input" placeholder="correo@empresa.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">DIRECCIÓN</label>
                <input className="input" placeholder="Dirección completa" value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} />
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
