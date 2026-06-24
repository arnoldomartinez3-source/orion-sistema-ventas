import { useState, useEffect, useMemo } from 'react'
import { db } from '../firebase'
import { usePermisos } from '../PermisosContext'
import { collection, onSnapshot, query, where, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'

// ══════════════════════════════════════════════════
// ASISTENCIA (historial + justificaciones) — Etapa 3 del módulo
// Tabla por día (estilo Ministerio): entrada/salida/horas/estado, por empleado
// y rango de fechas. Detecta "sin salida" y "sin marca". El dueño justifica
// cada día (categoría + texto + "¿se paga?") → alimenta la planilla (Etapa 4).
// Solo lectura de 'marcaciones'; escribe 'justificaciones' (colección cerrada).
// ══════════════════════════════════════════════════

const CATEGORIAS = [
  'Permiso con goce', 'Permiso sin goce', 'Incapacidad/médico',
  'Falta injustificada', 'Día personal', 'Vacación', 'Misión oficial', 'Otro',
]

const dosD = (n) => String(n).padStart(2, '0')
const hoyStr = () => { const d = new Date(); return `${d.getFullYear()}-${dosD(d.getMonth() + 1)}-${dosD(d.getDate())}` }
const primerDiaMes = () => { const d = new Date(); return `${d.getFullYear()}-${dosD(d.getMonth() + 1)}-01` }

function rangoDias(desde, hasta) {
  const dias = []
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = hasta.split('-').map(Number)
  let d = new Date(y1, m1 - 1, d1)
  const fin = new Date(y2, m2 - 1, d2)
  let guarda = 0
  while (d <= fin && guarda < 400) {
    dias.push(`${d.getFullYear()}-${dosD(d.getMonth() + 1)}-${dosD(d.getDate())}`)
    d.setDate(d.getDate() + 1); guarda++
  }
  return dias
}
const diaSemana = (f) => { const [y, m, d] = f.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-SV', { weekday: 'short' }) }
const horaDe = (ts) => ts?.toDate ? ts.toDate().toLocaleTimeString('es-SV', { timeZone: 'America/El_Salvador', hour: '2-digit', minute: '2-digit' }) : '—'

const asisStyles = `
  .asis-bar { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 16px; }
  .asis-bar .grp { display: flex; flex-direction: column; gap: 4px; }
  .asis-bar label { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; }
  .asis-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 16px; }
  @media (max-width: 700px) { .asis-stats { grid-template-columns: repeat(2,1fr); } }
  .asis-stat { background: var(--surface); border: 1.5px solid var(--border); border-radius: 12px; padding: 12px 14px; }
  .asis-stat .v { font-size: 22px; font-weight: 800; font-family: var(--mono); line-height: 1; }
  .asis-stat .l { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 4px; }
  .asis-badge { font-size: 10px; font-weight: 700; padding: 2px 9px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
  .asis-row { cursor: pointer; }
  .asis-row:hover td { background: var(--surface2); }
  .asis-foto { width: 120px; height: 120px; border-radius: 12px; object-fit: cover; transform: scaleX(-1); border: 1.5px solid var(--border); background: #000; }
`

const badge = (estado) => {
  if (estado === 'completo') return { txt: '✅ Completo', bg: 'rgba(0,194,150,0.14)', co: '#00C296' }
  if (estado === 'sinsalida') return { txt: '⚠️ Sin salida', bg: 'rgba(245,158,11,0.16)', co: '#d98a00' }
  if (estado === 'sinentrada') return { txt: '⚠️ Sin entrada', bg: 'rgba(245,158,11,0.16)', co: '#d98a00' }
  return { txt: '🚫 Sin marca', bg: 'rgba(239,68,68,0.12)', co: '#ef4444' }
}

export default function Asistencia({ empleados = [] }) {
  const { empresaId, userId } = usePermisos()
  const activos = useMemo(() => empleados.filter(e => e.activo !== false), [empleados])

  const [empleadoId, setEmpleadoId] = useState('')
  const [desde, setDesde] = useState(primerDiaMes())
  const [hasta, setHasta] = useState(hoyStr())
  const [marcaciones, setMarcaciones] = useState([])
  const [justifs, setJustifs] = useState([])
  const [detalle, setDetalle] = useState(null)   // fila seleccionada
  const [jForm, setJForm] = useState({ categoria: CATEGORIAS[0], detalle: '', sePaga: true })
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { if (!empleadoId && activos.length) setEmpleadoId(activos[0].id) }, [activos, empleadoId])

  useEffect(() => {
    if (!empresaId) return
    const u1 = onSnapshot(query(collection(db, 'marcaciones'), where('empresaId', '==', empresaId)),
      s => setMarcaciones(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {})
    const u2 = onSnapshot(query(collection(db, 'justificaciones'), where('empresaId', '==', empresaId)),
      s => setJustifs(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {})
    return () => { u1(); u2() }
  }, [empresaId])

  const dias = useMemo(() => (desde && hasta && desde <= hasta ? rangoDias(desde, hasta) : []), [desde, hasta])

  const filas = useMemo(() => {
    if (!empleadoId) return []
    const marcasEmp = marcaciones.filter(m => m.empleadoId === empleadoId)
    const justEmp = justifs.filter(j => j.empleadoId === empleadoId)
    const ms = (m) => (m.timestamp?.toMillis ? m.timestamp.toMillis() : 0)
    return dias.map(fecha => {
      const delDia = marcasEmp.filter(m => m.fecha === fecha)
      const entrada = delDia.filter(m => m.tipo === 'entrada').sort((a, b) => ms(a) - ms(b))[0] || null
      const salidasOrd = delDia.filter(m => m.tipo === 'salida').sort((a, b) => ms(a) - ms(b))
      const salida = salidasOrd[salidasOrd.length - 1] || null
      let horas = '', horasMin = 0
      if (entrada?.timestamp?.toMillis && salida?.timestamp?.toMillis) {
        const dif = salida.timestamp.toMillis() - entrada.timestamp.toMillis()
        if (dif > 0) { horasMin = Math.round(dif / 60000); horas = `${Math.floor(horasMin / 60)}h ${dosD(horasMin % 60)}m` }
      }
      const just = justEmp.find(j => j.fecha === fecha) || null
      const estado = entrada && salida ? 'completo' : entrada ? 'sinsalida' : salida ? 'sinentrada' : 'sinmarca'
      return { fecha, entrada, salida, horas, horasMin, just, estado, delDia }
    }).reverse() // más reciente arriba
  }, [dias, empleadoId, marcaciones, justifs])

  const completos = filas.filter(f => f.estado === 'completo').length
  const sinMarca = filas.filter(f => f.estado === 'sinmarca').length
  const anomalias = filas.filter(f => f.estado === 'sinsalida' || f.estado === 'sinentrada').length
  const totalMin = filas.reduce((s, f) => s + f.horasMin, 0)
  const totalHoras = `${Math.floor(totalMin / 60)}h ${dosD(totalMin % 60)}m`

  const empleadoSel = empleados.find(e => e.id === empleadoId)

  const abrirDetalle = (fila) => {
    setDetalle(fila)
    setJForm(fila.just
      ? { categoria: fila.just.categoria || CATEGORIAS[0], detalle: fila.just.detalle || '', sePaga: fila.just.sePaga !== false }
      : { categoria: CATEGORIAS[0], detalle: '', sePaga: true })
  }

  const guardarJustif = async () => {
    if (!detalle || !empleadoId) return
    setGuardando(true)
    try {
      await setDoc(doc(db, 'justificaciones', `${empleadoId}_${detalle.fecha}`), {
        empresaId, empleadoId, fecha: detalle.fecha,
        categoria: jForm.categoria, detalle: jForm.detalle.trim(), sePaga: jForm.sePaga,
        creadoPor: userId || '', updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
      }, { merge: true })
      setDetalle(null)
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const cambiarTipo = async (m) => {
    const nuevo = m.tipo === 'entrada' ? 'salida' : 'entrada'
    if (!window.confirm(`¿Cambiar esta marca de ${m.tipo} a ${nuevo}? (la hora y la foto no cambian)`)) return
    try { await updateDoc(doc(db, 'marcaciones', m.id), { tipo: nuevo, corregido: true, corregidoPor: userId || '', updatedAt: serverTimestamp() }); setDetalle(null) }
    catch (e) { alert('Error: ' + e.message) }
  }
  const anularMarca = async (m) => {
    if (!window.confirm(`¿Anular esta marca de ${m.tipo} (${horaDe(m.timestamp)})? No se puede deshacer.`)) return
    try { await deleteDoc(doc(db, 'marcaciones', m.id)); setDetalle(null) }
    catch (e) { alert('Error: ' + e.message) }
  }

  return (
    <>
      <style>{asisStyles}</style>

      {/* FILTROS */}
      <div className="asis-bar">
        <div className="grp">
          <label>Empleado</label>
          <select className="input" style={{ minWidth: 200 }} value={empleadoId} onChange={e => setEmpleadoId(e.target.value)}>
            {activos.length === 0 && <option value="">— sin empleados —</option>}
            {activos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div className="grp">
          <label>Desde</label>
          <input className="input" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div className="grp">
          <label>Hasta</label>
          <input className="input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
      </div>

      {/* STATS */}
      <div className="asis-stats">
        <div className="asis-stat"><div className="v" style={{ color: '#00C296' }}>{completos}</div><div className="l">Días completos</div></div>
        <div className="asis-stat"><div className="v" style={{ color: '#4A8FE8' }}>{totalHoras}</div><div className="l">Horas trabajadas</div></div>
        <div className="asis-stat"><div className="v" style={{ color: '#d98a00' }}>{anomalias}</div><div className="l">Anomalías</div></div>
        <div className="asis-stat"><div className="v" style={{ color: '#ef4444' }}>{sinMarca}</div><div className="l">Días sin marca</div></div>
      </div>

      {/* TABLA */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>FECHA</th><th>DÍA</th><th>ENTRADA</th><th>SALIDA</th><th>HORAS</th><th>ESTADO</th><th>JUSTIFICACIÓN</th></tr>
            </thead>
            <tbody>
              {!empleadoId ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>Elegí un empleado para ver su asistencia.</td></tr>
              ) : filas.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>Rango de fechas inválido.</td></tr>
              ) : filas.map(f => {
                const b = badge(f.estado)
                return (
                  <tr key={f.fecha} className="asis-row" onClick={() => abrirDetalle(f)}>
                    <td style={{ fontFamily: 'var(--mono)' }}>{f.fecha}</td>
                    <td style={{ textTransform: 'capitalize' }}>{diaSemana(f.fecha)}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{f.entrada ? horaDe(f.entrada.timestamp) : '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{f.salida ? horaDe(f.salida.timestamp) : '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{f.horas || '—'}</td>
                    <td><span className="asis-badge" style={{ background: b.bg, color: b.co }}>{b.txt}</span></td>
                    <td style={{ fontSize: 13 }}>
                      {f.just
                        ? <span style={{ color: 'var(--text2)' }}>{f.just.categoria} {f.just.sePaga ? '· 💵' : '· 🚫'}</span>
                        : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETALLE DEL DÍA + JUSTIFICACIÓN */}
      {detalle && (
        <div className="modal-overlay" onClick={() => setDetalle(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-title">{empleadoSel?.nombre} · {detalle.fecha}</div>

            {/* Marcaciones del día (con corrección del dueño) */}
            <div className="form-label" style={{ marginBottom: 8 }}>Marcaciones del día</div>
            {detalle.delDia.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '12px 0 18px' }}>Sin marcaciones este día.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                {[...detalle.delDia].sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0)).map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--surface2)' }}>
                    {m.fotoUrl
                      ? <img src={m.fotoUrl} alt="" style={{ width: 54, height: 54, borderRadius: 10, objectFit: 'cover', transform: 'scaleX(-1)', flexShrink: 0 }} />
                      : <div style={{ width: 54, height: 54, borderRadius: 10, background: 'var(--surface3)', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="asis-badge" style={{ background: m.tipo === 'entrada' ? 'rgba(0,194,150,0.14)' : 'rgba(211,60,31,0.14)', color: m.tipo === 'entrada' ? '#00C296' : '#d33c1f' }}>{m.tipo}</span>
                      {m.corregido && <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>· corregido</span>}
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, marginTop: 4 }}>{horaDe(m.timestamp)}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => cambiarTipo(m)}>↔ {m.tipo === 'entrada' ? 'Salida' : 'Entrada'}</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => anularMarca(m)}>🗑</button>
                  </div>
                ))}
              </div>
            )}

            {/* Justificación */}
            <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 16 }}>
              <div className="form-label" style={{ marginBottom: 10 }}>Justificación del día</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <select className="input" value={jForm.categoria} onChange={e => setJForm(f => ({ ...f, categoria: e.target.value }))}>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="input" placeholder="Detalle (ej. trajo constancia, avisó con anticipación)…"
                  value={jForm.detalle} onChange={e => setJForm(f => ({ ...f, detalle: e.target.value }))} />
                <div onClick={() => setJForm(f => ({ ...f, sePaga: !f.sePaga }))}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                    padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface2)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>¿Se paga este día?</span>
                  <span className="asis-badge" style={{ background: jForm.sePaga ? 'rgba(0,194,150,0.14)' : 'rgba(239,68,68,0.14)', color: jForm.sePaga ? '#00C296' : '#ef4444' }}>
                    {jForm.sePaga ? '💵 Sí se paga' : '🚫 No se paga'}
                  </span>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDetalle(null)}>Cerrar</button>
              <button className="btn btn-primary" onClick={guardarJustif} disabled={guardando}>
                {guardando ? '⏳…' : '💾 Guardar justificación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
