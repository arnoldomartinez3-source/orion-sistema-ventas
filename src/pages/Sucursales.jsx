import { useState, useEffect } from 'react'
import { db } from '../firebase'
import {
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, runTransaction, getDocs
} from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'

const TIPOS_DTE_CORRELATIVOS = ['FE', 'CCF', 'NC', 'ND', 'FEX']

const sucStyles = `
  .suc-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 24px; }
  @media (max-width: 1100px) { .suc-grid { grid-template-columns: repeat(2,1fr); } }
  @media (max-width: 700px) { .suc-grid { grid-template-columns: 1fr; } }

  .suc-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; padding: 20px; box-shadow: 0 4px 20px var(--shadow2); transition: all 0.15s; }
  .suc-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 8px 30px var(--shadow); }
  .suc-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
  .suc-card-nombre { font-size: 16px; font-weight: 800; margin-bottom: 3px; }
  .suc-card-codigos { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .suc-chip { background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 3px 8px; font-size: 11px; font-family: var(--mono); font-weight: 700; }
  .suc-chip.activa { background: rgba(0,212,170,0.1); border-color: rgba(0,212,170,0.3); color: var(--accent); }

  .correlativo-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 6px; margin-top: 10px; }
  .correlativo-item { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px; text-align: center; }
  .correlativo-tipo { font-size: 9px; font-weight: 800; color: var(--muted); text-transform: uppercase; margin-bottom: 3px; }
  .correlativo-val { font-size: 16px; font-weight: 900; font-family: var(--mono); color: var(--accent2); }
`

export default function GestionSucursales() {
  const { puede } = usePermisos()
  const [sucursales, setSucursales] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({
    nombre: '', codEstablecimiento: '', codPuntoVenta: '',
    direccion: '', telefono: '', responsable: '', activa: true
  })

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'sucursales'), snap => {
      setSucursales(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const abrirModal = (suc = null) => {
    if (suc) {
      setEditando(suc.id)
      setForm({
        nombre: suc.nombre || '',
        codEstablecimiento: suc.codEstablecimiento || '',
        codPuntoVenta: suc.codPuntoVenta || '',
        direccion: suc.direccion || '',
        telefono: suc.telefono || '',
        responsable: suc.responsable || '',
        activa: suc.activa !== false,
      })
    } else {
      setEditando(null)
      setForm({ nombre: '', codEstablecimiento: '', codPuntoVenta: '', direccion: '', telefono: '', responsable: '', activa: true })
    }
    setModalOpen(true)
  }

  const guardar = async () => {
    if (!form.nombre?.trim()) { alert('El nombre es obligatorio'); return }
    if (!form.codEstablecimiento?.trim()) { alert('El código de establecimiento es obligatorio (4 dígitos)'); return }
    if (!/^\d{4}$/.test(form.codEstablecimiento)) { alert('El código de establecimiento debe ser exactamente 4 dígitos numéricos'); return }
    if (!form.codPuntoVenta?.trim()) { alert('El código de punto de venta es obligatorio'); return }

    setGuardando(true)
    try {
      const data = {
        nombre: form.nombre.trim(),
        codEstablecimiento: form.codEstablecimiento.trim(),
        codPuntoVenta: form.codPuntoVenta.trim(),
        direccion: form.direccion?.trim() || '',
        telefono: form.telefono?.trim() || '',
        responsable: form.responsable?.trim() || '',
        activa: form.activa,
        updatedAt: serverTimestamp(),
      }

      if (editando) {
        await updateDoc(doc(db, 'sucursales', editando), data)
      } else {
        // Inicializar correlativos en 1 para todos los tipos DTE
        const correlativos = {}
        TIPOS_DTE_CORRELATIVOS.forEach(t => { correlativos[`correlativo${t}`] = 1 })
        await addDoc(collection(db, 'sucursales'), {
          ...data,
          ...correlativos,
          createdAt: serverTimestamp(),
        })
      }
      setModalOpen(false)
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar esta sucursal? Esta acción no se puede deshacer.')) return
    try { await deleteDoc(doc(db, 'sucursales', id)) } catch (e) { alert('Error: ' + e.message) }
  }

  const toggleActiva = async (suc) => {
    await updateDoc(doc(db, 'sucursales', suc.id), { activa: !suc.activa, updatedAt: serverTimestamp() })
  }

  return (
    <>
      <style>{sucStyles}</style>
      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">🏪 Sucursales</div>
          <div className="page-sub" style={{ marginTop: 4 }}>{sucursales.length} sucursales configuradas</div>
        </div>
        {puede('ver_configuracion') && (
          <button className="btn btn-primary" onClick={() => abrirModal()}>+ Nueva Sucursal</button>
        )}
      </div>

      {loading ? (
        <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">Cargando...</div></div>
      ) : sucursales.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏪</div>
          <div className="empty-text">Sin sucursales. Crea la primera.</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => abrirModal()}>+ Nueva Sucursal</button>
        </div>
      ) : (
        <div className="suc-grid">
          {sucursales.map(s => (
            <div key={s.id} className="suc-card">
              <div className="suc-card-header">
                <div>
                  <div className="suc-card-nombre">{s.nombre}</div>
                  {s.responsable && <div style={{ fontSize: 12, color: 'var(--muted)' }}>👤 {s.responsable}</div>}
                  {s.direccion && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>📍 {s.direccion}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {puede('ver_configuracion') && (
                    <button className="btn btn-ghost btn-sm" onClick={() => abrirModal(s)}>✏️</button>
                  )}
                  {puede('ver_configuracion') && (
                    <button className="btn btn-danger btn-sm" onClick={() => eliminar(s.id)}>🗑️</button>
                  )}
                </div>
              </div>

              <div className="suc-card-codigos">
                <span className="suc-chip">Est: {s.codEstablecimiento}</span>
                <span className="suc-chip">PV: {s.codPuntoVenta}</span>
                <span className={`suc-chip ${s.activa !== false ? 'activa' : ''}`}
                  style={{ cursor: 'pointer' }} onClick={() => toggleActiva(s)}>
                  {s.activa !== false ? '✅ Activa' : '⛔ Inactiva'}
                </span>
              </div>

              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                Correlativos DTE
              </div>
              <div className="correlativo-grid">
                {TIPOS_DTE_CORRELATIVOS.map(t => (
                  <div key={t} className="correlativo-item">
                    <div className="correlativo-tipo">{t}</div>
                    <div className="correlativo-val">{s[`correlativo${t}`] || 1}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editando ? '✏️ Editar Sucursal' : '🏪 Nueva Sucursal'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              <div className="form-group">
                <label className="form-label">NOMBRE *</label>
                <input className="input" placeholder="Sucursal Centro" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">COD. ESTABLECIMIENTO * <span style={{ fontSize: 10, color: 'var(--muted)' }}>(4 dígitos)</span></label>
                  <input className="input" placeholder="0001" maxLength={4} value={form.codEstablecimiento}
                    onChange={e => setForm(f => ({ ...f, codEstablecimiento: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">COD. PUNTO DE VENTA * <span style={{ fontSize: 10, color: 'var(--muted)' }}>(máx 15 car.)</span></label>
                  <input className="input" placeholder="0001" maxLength={15} value={form.codPuntoVenta}
                    onChange={e => setForm(f => ({ ...f, codPuntoVenta: e.target.value.slice(0, 15) }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">DIRECCIÓN</label>
                <input className="input" placeholder="Dirección de la sucursal" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">TELÉFONO</label>
                  <input className="input" placeholder="7000-0000" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">RESPONSABLE</label>
                  <input className="input" placeholder="Nombre del encargado" value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <input type="checkbox" id="activa" checked={form.activa} onChange={e => setForm(f => ({ ...f, activa: e.target.checked }))} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                <label htmlFor="activa" style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Sucursal activa</label>
              </div>

              {!editando && (
                <div style={{ background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--muted)' }}>
                  💡 Los correlativos FE, CCF, NC, ND y FEX se inicializarán en 1 automáticamente.
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando || !form.nombre || !form.codEstablecimiento || !form.codPuntoVenta}>
                {guardando ? '⏳ Guardando...' : '💾 Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}