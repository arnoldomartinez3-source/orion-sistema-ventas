import { useState, useEffect } from 'react'
import { db } from '../firebase'
import {
  collection, onSnapshot, addDoc, deleteDoc, doc,
  serverTimestamp, writeBatch,
} from 'firebase/firestore'
import SelectorDepartamento from '../components/SelectorDepartamento'

// ══════════════════════════════════════════════════════════════════
// GESTIÓN DE CONTRIBUYENTES REALES — para CCF/NC/ND de certificación
//
// El MH valida NIT/NRC contra su padrón, así que estos datos deben ser
// de contribuyentes REALES. Se guardan en la colección 'contribuyentes_prueba'.
//
// Dos formas de cargar:
//  1) Formulario uno por uno (con selector de departamento/municipio).
//  2) Pegado masivo desde Excel (columnas separadas por TAB).
// ══════════════════════════════════════════════════════════════════

const FORM_VACIO = {
  nombre: '', nit: '', nrc: '',
  codActividad: '', descActividad: '',
  nombreComercial: '', codDep: '', codMun: '', distrito: '', codDistrito: '',
  direccion: '', telefono: '', correo: '',
}

export default function GestionContribuyentes({ onCerrar }) {
  const [lista, setLista] = useState([])
  const [modo, setModo] = useState('lista')   // 'lista' | 'form' | 'pegar'
  const [form, setForm] = useState(FORM_VACIO)
  const [textoPegado, setTextoPegado] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [previewPegado, setPreviewPegado] = useState([])

  // ── Cargar lista en vivo ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'contribuyentes_prueba'), snap => {
      setLista(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  // ── Guardar uno (formulario) ──
  const guardarUno = async () => {
    if (!form.nombre || !form.nit || !form.nrc) {
      alert('Nombre, NIT y NRC son obligatorios.')
      return
    }
    setGuardando(true)
    try {
      await addDoc(collection(db, 'contribuyentes_prueba'), {
        ...form, createdAt: serverTimestamp(),
      })
      setForm(FORM_VACIO)
      setModo('lista')
    } catch (e) {
      alert('Error al guardar: ' + e.message)
    }
    setGuardando(false)
  }

  // ── Parsear texto pegado (TAB-separated, una fila por línea) ──
  // Orden esperado: nombre | NIT | NRC | codActividad | descActividad | codDep | codMun | direccion
  const parsearPegado = (texto) => {
    const filas = texto.trim().split('\n').filter(l => l.trim())
    return filas.map(fila => {
      const cols = fila.split('\t').map(c => c.trim())
      return {
        nombre: cols[0] || '',
        nit: cols[1] || '',
        nrc: cols[2] || '',
        codActividad: cols[3] || '',
        descActividad: cols[4] || '',
        codDep: cols[5] || '',
        codMun: cols[6] || '',
        direccion: cols[7] || '',
        nombreComercial: cols[0] || '',
        distrito: '', codDistrito: '', telefono: '', correo: '',
        _valido: !!(cols[0] && cols[1] && cols[2]),
      }
    })
  }

  const onChangePegado = (texto) => {
    setTextoPegado(texto)
    setPreviewPegado(texto.trim() ? parsearPegado(texto) : [])
  }

  // ── Guardar varios (pegado) ──
  const guardarVarios = async () => {
    const validos = previewPegado.filter(c => c._valido)
    if (validos.length === 0) {
      alert('No hay filas válidas. Cada fila necesita al menos nombre, NIT y NRC.')
      return
    }
    setGuardando(true)
    try {
      const batch = writeBatch(db)
      validos.forEach(c => {
        const { _valido, ...datos } = c
        const ref = doc(collection(db, 'contribuyentes_prueba'))
        batch.set(ref, { ...datos, createdAt: serverTimestamp() })
      })
      await batch.commit()
      setTextoPegado('')
      setPreviewPegado([])
      setModo('lista')
      alert(`Se cargaron ${validos.length} contribuyentes.`)
    } catch (e) {
      alert('Error al guardar: ' + e.message)
    }
    setGuardando(false)
  }

  // ── Eliminar uno ──
  const eliminar = async (id) => {
    if (!confirm('¿Eliminar este contribuyente?')) return
    try {
      await deleteDoc(doc(db, 'contribuyentes_prueba', id))
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  return (
    <div className="gc-overlay" onClick={onCerrar}>
      <div className="gc-modal" onClick={e => e.stopPropagation()}>
        <style>{gcStyles}</style>

        {/* HEADER */}
        <div className="gc-header">
          <div style={{ fontSize: 16, fontWeight: 800 }}>
            👥 Contribuyentes reales ({lista.length})
          </div>
          <button className="gc-x" onClick={onCerrar}>✕</button>
        </div>

        {/* TABS */}
        <div className="gc-tabs">
          <button className={`gc-tab ${modo === 'lista' ? 'on' : ''}`} onClick={() => setModo('lista')}>
            📋 Lista
          </button>
          <button className={`gc-tab ${modo === 'form' ? 'on' : ''}`} onClick={() => setModo('form')}>
            ➕ Agregar uno
          </button>
          <button className={`gc-tab ${modo === 'pegar' ? 'on' : ''}`} onClick={() => setModo('pegar')}>
            📥 Pegar varios
          </button>
        </div>

        <div className="gc-body">
          {/* ── LISTA ── */}
          {modo === 'lista' && (
            lista.length === 0 ? (
              <div className="gc-empty">
                <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                Sin contribuyentes. Agrega uno o pega varios desde Excel.
              </div>
            ) : (
              <div className="gc-list">
                {lista.map(c => (
                  <div key={c.id} className="gc-item">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{c.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        NIT {c.nit} · NRC {c.nrc} · {c.codActividad || 's/act'} · Dep {c.codDep || '?'}/{c.codMun || '?'}
                      </div>
                    </div>
                    <button className="gc-del" onClick={() => eliminar(c.id)}>🗑️</button>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── FORMULARIO UNO ── */}
          {modo === 'form' && (
            <div className="gc-form">
              <Campo label="Nombre / Razón social *" value={form.nombre}
                onChange={v => setForm(f => ({ ...f, nombre: v }))} />
              <div className="gc-grid2">
                <Campo label="NIT *" value={form.nit} onChange={v => setForm(f => ({ ...f, nit: v }))} />
                <Campo label="NRC *" value={form.nrc} onChange={v => setForm(f => ({ ...f, nrc: v }))} />
              </div>
              <div className="gc-grid2">
                <Campo label="Cód. actividad" value={form.codActividad}
                  onChange={v => setForm(f => ({ ...f, codActividad: v }))} />
                <Campo label="Desc. actividad" value={form.descActividad}
                  onChange={v => setForm(f => ({ ...f, descActividad: v }))} />
              </div>
              <Campo label="Nombre comercial" value={form.nombreComercial}
                onChange={v => setForm(f => ({ ...f, nombreComercial: v }))} />

              <label className="gc-label">Departamento / Municipio</label>
              <SelectorDepartamento
                codDep={form.codDep}
                codMun={form.codMun}
                distrito={form.distrito}
                onChange={({ codDep, codMun, distrito, codDistrito }) =>
                  setForm(f => ({ ...f, codDep, codMun, distrito: distrito || '', codDistrito: codDistrito || '' }))}
              />

              <Campo label="Dirección (complemento)" value={form.direccion}
                onChange={v => setForm(f => ({ ...f, direccion: v }))} />
              <div className="gc-grid2">
                <Campo label="Teléfono" value={form.telefono}
                  onChange={v => setForm(f => ({ ...f, telefono: v }))} />
                <Campo label="Correo" value={form.correo}
                  onChange={v => setForm(f => ({ ...f, correo: v }))} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button className="btn btn-ghost" onClick={() => { setForm(FORM_VACIO); setModo('lista') }}>
                  Cancelar
                </button>
                <button className="btn btn-primary" onClick={guardarUno} disabled={guardando}>
                  {guardando ? '⏳...' : '💾 Guardar'}
                </button>
              </div>
            </div>
          )}

          {/* ── PEGAR VARIOS ── */}
          {modo === 'pegar' && (
            <div className="gc-form">
              <div className="gc-help">
                Pegá desde Excel, una fila por contribuyente, columnas en este orden
                (separadas por tabulación):
                <div className="gc-cols">
                  nombre · NIT · NRC · códActividad · descActividad · codDep · codMun · dirección
                </div>
              </div>
              <textarea className="gc-textarea" rows={6}
                placeholder="Pegá aquí las filas copiadas de Excel..."
                value={textoPegado}
                onChange={e => onChangePegado(e.target.value)} />

              {previewPegado.length > 0 && (
                <div className="gc-preview">
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    Vista previa: {previewPegado.filter(c => c._valido).length} válidos de {previewPegado.length}
                  </div>
                  {previewPegado.map((c, i) => (
                    <div key={i} className={`gc-prev-row ${c._valido ? '' : 'bad'}`}>
                      <span>{c._valido ? '✅' : '⚠️'}</span>
                      <span style={{ flex: 1 }}>{c.nombre || '(sin nombre)'} · NIT {c.nit || '?'} · NRC {c.nrc || '?'}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button className="btn btn-ghost" onClick={() => { setTextoPegado(''); setPreviewPegado([]); setModo('lista') }}>
                  Cancelar
                </button>
                <button className="btn btn-primary" onClick={guardarVarios}
                  disabled={guardando || previewPegado.filter(c => c._valido).length === 0}>
                  {guardando ? '⏳...' : `💾 Cargar ${previewPegado.filter(c => c._valido).length}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Campo de texto simple reutilizable
function Campo({ label, value, onChange }) {
  return (
    <div className="gc-campo">
      <label className="gc-label">{label}</label>
      <input className="input" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

const gcStyles = `
  .gc-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
  .gc-modal { background: var(--surface); border-radius: 16px; width: 100%; max-width: 560px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; }
  .gc-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1.5px solid var(--border); }
  .gc-x { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--muted); }
  .gc-tabs { display: flex; gap: 4px; padding: 10px 12px; border-bottom: 1.5px solid var(--border); }
  .gc-tab { flex: 1; padding: 8px; border-radius: 8px; border: none; background: var(--surface2); cursor: pointer; font-size: 12px; font-weight: 600; color: var(--muted); }
  .gc-tab.on { background: var(--accent); color: #fff; }
  .gc-body { padding: 16px 18px; overflow-y: auto; }
  .gc-empty { text-align: center; padding: 40px 20px; color: var(--muted); font-size: 13px; }
  .gc-list { display: flex; flex-direction: column; gap: 8px; }
  .gc-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--surface2); border-radius: 10px; }
  .gc-del { background: none; border: none; cursor: pointer; font-size: 14px; opacity: 0.7; }
  .gc-del:hover { opacity: 1; }
  .gc-form { display: flex; flex-direction: column; gap: 10px; }
  .gc-campo { display: flex; flex-direction: column; gap: 4px; }
  .gc-label { font-size: 12px; font-weight: 600; color: var(--muted); }
  .gc-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .gc-help { font-size: 12px; color: var(--muted); background: var(--surface2); padding: 10px 12px; border-radius: 10px; }
  .gc-cols { font-family: var(--mono); font-size: 11px; margin-top: 6px; color: var(--text2); }
  .gc-textarea { width: 100%; border: 1.5px solid var(--border); border-radius: 10px; padding: 10px; font-family: var(--mono); font-size: 12px; background: var(--surface); color: var(--text); resize: vertical; }
  .gc-preview { margin-top: 12px; background: var(--surface2); border-radius: 10px; padding: 10px 12px; max-height: 180px; overflow-y: auto; }
  .gc-prev-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 4px 0; }
  .gc-prev-row.bad { color: #ef4444; }
`