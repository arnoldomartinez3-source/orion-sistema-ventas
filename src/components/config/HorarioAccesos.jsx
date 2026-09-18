import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, setDoc, updateDoc, where, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { usePermisos } from '../../PermisosContext'
import { orionAlert } from '../../orionDialog'
import { ROLES } from '../../data/permisos'
import { DIAS_CORTOS, aHHMM, aMinutos, describirHorario, estadoHorario } from '../../utils/horario'

// ══════════════════════════════════════════════════
// Configuración → HORARIO Y ACCESOS
//  1) Horario del negocio: lo usan todos los empleados salvo que tengan uno propio.
//  2) Por empleado: horario del negocio / propio / sin restricción.
//  3) Autorizar fuera de horario por unas horas (admin o 'autorizar_fuera_horario').
// La restricción real la aplican el login (servidor) y las reglas de Firestore.
// ══════════════════════════════════════════════════

const HORARIO_BASE = { activo: false, dias: [1, 2, 3, 4, 5, 6], desde: 420, hasta: 1080 }
const DURACIONES = [
  { key: '1h', label: '1 hora', ms: 60 * 60 * 1000 },
  { key: '2h', label: '2 horas', ms: 2 * 60 * 60 * 1000 },
  { key: '4h', label: '4 horas', ms: 4 * 60 * 60 * 1000 },
  { key: 'dia', label: 'Hasta el fin del día' },
]
const MODOS = [
  { key: 'negocio', label: 'Horario del negocio' },
  { key: 'propio', label: 'Horario propio' },
  { key: 'libre', label: 'Sin restricción' },
]

// 23:59 de HOY en El Salvador (UTC-6), en milisegundos.
const finDelDiaSV = () => {
  const SEIS_H = 6 * 60 * 60 * 1000, DIA = 24 * 60 * 60 * 1000
  const inicioSV = Math.floor((Date.now() - SEIS_H) / DIA) * DIA
  return inicioSV + DIA + SEIS_H - 60 * 1000
}
const horaSV = (ms) => new Date(ms).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', timeZone: 'America/El_Salvador' })

const estilos = `
  .ha-dias { display: flex; gap: 6px; flex-wrap: wrap; }
  .ha-dia { min-width: 44px; padding: 7px 0; border-radius: 8px; border: 1.5px solid var(--border); background: var(--surface2);
    color: var(--muted); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; text-align: center; }
  .ha-dia.on { background: var(--accent); border-color: var(--accent); color: #fff; }
  .ha-dia:disabled { cursor: default; opacity: 0.75; }
  .ha-horas { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ha-horas input { width: 130px; }
  .ha-fila { display: grid; grid-template-columns: minmax(160px, 1.2fr) minmax(170px, 1fr) minmax(150px, 1fr) minmax(210px, 1.2fr);
    gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .ha-fila:last-child { border-bottom: 0; }
  .ha-propio { grid-column: 1 / -1; background: var(--surface2); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  .ha-estado { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 99px; display: inline-block; }
  .ha-estado.dentro, .ha-estado.libre { background: rgba(0,194,150,0.13); color: #00a07c; }
  .ha-estado.fuera { background: rgba(239,68,68,0.12); color: #dc2626; }
  .ha-estado.autorizado { background: var(--gold-glow); color: var(--accent3-dark, #9C7C20); }
  .ha-autorizar { display: flex; gap: 6px; flex-wrap: wrap; }
  @media (max-width: 860px) {
    .ha-fila { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 520px) {
    .ha-fila { grid-template-columns: 1fr; }
  }
`

function EditorDias({ dias, onChange, disabled }) {
  const alternar = (d) => onChange(dias.includes(d) ? dias.filter(x => x !== d) : [...dias, d].sort((a, b) => a - b))
  return (
    <div className="ha-dias" role="group" aria-label="Días">
      {[1, 2, 3, 4, 5, 6, 7].map(d => (
        <button key={d} type="button" className={`ha-dia ${dias.includes(d) ? 'on' : ''}`} aria-pressed={dias.includes(d)}
          disabled={disabled} onClick={() => alternar(d)}>{DIAS_CORTOS[d]}</button>
      ))}
    </div>
  )
}

function EditorHoras({ desde, hasta, onChange, disabled }) {
  return (
    <div className="ha-horas">
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Desde</label>
      <input className="input" type="time" value={aHHMM(desde)} disabled={disabled} onChange={e => onChange({ desde: aMinutos(e.target.value), hasta })} />
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Hasta</label>
      <input className="input" type="time" value={aHHMM(hasta)} disabled={disabled} onChange={e => onChange({ desde, hasta: aMinutos(e.target.value) })} />
      {hasta < desde && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>(pasa la medianoche)</span>}
    </div>
  )
}

export default function HorarioAccesos({ empresaId, horarioNegocio, puedeEditarNegocio, onGuardado }) {
  const { esAdmin, puede, userId, userName } = usePermisos()
  const puedeEditarUsuarios = esAdmin || puede('editar_usuarios')
  const puedeAutorizar = esAdmin || puede('autorizar_fuera_horario')

  const [negocio, setNegocio] = useState(() => ({ ...HORARIO_BASE, ...(horarioNegocio || {}) }))
  const [guardandoNegocio, setGuardandoNegocio] = useState(false)
  const [usuarios, setUsuarios] = useState([])
  const [propios, setPropios] = useState({})   // borradores de horario propio por usuario
  const [duracion, setDuracion] = useState({})  // duración elegida por usuario
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    if (!empresaId) return
    return onSnapshot(query(collection(db, 'usuarios'), where('empresaId', '==', empresaId)), snap => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.rol !== 'administrador')
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
      setUsuarios(lista)
    }, () => setUsuarios([]))
  }, [empresaId])

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30 * 1000)
    return () => clearInterval(t)
  }, [])

  const guardarNegocio = async () => {
    if (negocio.activo && negocio.dias.length === 0) { orionAlert('Elegí al menos un día.', { tipo: 'warning' }); return }
    if (negocio.desde === negocio.hasta) { orionAlert('La hora de inicio y la de cierre no pueden ser iguales.', { tipo: 'warning' }); return }
    setGuardandoNegocio(true)
    try {
      const h = { activo: negocio.activo === true, dias: negocio.dias, desde: negocio.desde, hasta: negocio.hasta }
      await setDoc(doc(db, 'configuracion', empresaId), { horario: h, updatedAt: serverTimestamp() }, { merge: true })
      onGuardado?.(h)
      orionAlert(h.activo ? `Horario guardado: ${describirHorario(h)}.` : 'Guardado. El control de horario está apagado.', { tipo: 'success' })
    } catch (e) {
      orionAlert('No se pudo guardar el horario: ' + e.message, { tipo: 'error' })
    }
    setGuardandoNegocio(false)
  }

  const cambiarModo = async (u, modo) => {
    try {
      const extra = modo === 'propio' && !u.horario?.dias ? { horario: { dias: negocio.dias, desde: negocio.desde, hasta: negocio.hasta } } : {}
      await updateDoc(doc(db, 'usuarios', u.id), { horarioModo: modo, ...extra })
    } catch (e) { orionAlert('No se pudo cambiar: ' + e.message, { tipo: 'error' }) }
  }

  const guardarPropio = async (u) => {
    const h = propios[u.id]
    if (!h) return
    if (h.dias.length === 0) { orionAlert('Elegí al menos un día.', { tipo: 'warning' }); return }
    if (h.desde === h.hasta) { orionAlert('La hora de inicio y la de cierre no pueden ser iguales.', { tipo: 'warning' }); return }
    try {
      await updateDoc(doc(db, 'usuarios', u.id), { horario: { dias: h.dias, desde: h.desde, hasta: h.hasta } })
      setPropios(p => { const n = { ...p }; delete n[u.id]; return n })
    } catch (e) { orionAlert('No se pudo guardar: ' + e.message, { tipo: 'error' }) }
  }

  const autorizar = async (u) => {
    const d = DURACIONES.find(x => x.key === (duracion[u.id] || '2h'))
    const hasta = d.key === 'dia' ? finDelDiaSV() : Date.now() + d.ms
    try {
      await updateDoc(doc(db, 'usuarios', u.id), {
        permisoHorarioHasta: Timestamp.fromMillis(hasta),
        permisoHorarioPor: userName || '',
        permisoHorarioEn: serverTimestamp(),
      })
      orionAlert(`${u.nombre} puede trabajar hasta las ${horaSV(hasta)}.`, { tipo: 'success' })
    } catch (e) { orionAlert('No se pudo autorizar: ' + e.message, { tipo: 'error' }) }
  }

  const quitarAutorizacion = async (u) => {
    try {
      await updateDoc(doc(db, 'usuarios', u.id), { permisoHorarioHasta: null, permisoHorarioPor: userName || '', permisoHorarioEn: serverTimestamp() })
    } catch (e) { orionAlert('No se pudo quitar: ' + e.message, { tipo: 'error' }) }
  }

  const configNegocio = { horario: horarioNegocio || HORARIO_BASE }   // el GUARDADO (no el borrador)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{estilos}</style>

      {/* ── HORARIO DEL NEGOCIO ── */}
      <div className="config-section">
        <div className="config-section-header">
          <div className="config-section-icon">🕒</div>
          <div className="config-section-title">Horario del negocio</div>
        </div>
        <div className="config-section-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Controlar el horario de los empleados</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, lineHeight: 1.45 }}>
                Fuera de este horario los empleados no pueden entrar ni registrar ventas o documentos. Los administradores no tienen restricción.
              </div>
            </div>
            <button type="button" role="switch" aria-checked={negocio.activo} disabled={!puedeEditarNegocio}
              onClick={() => setNegocio(n => ({ ...n, activo: !n.activo }))}
              style={{ width: 46, height: 26, borderRadius: 99, border: 'none', cursor: puedeEditarNegocio ? 'pointer' : 'default', flexShrink: 0, background: negocio.activo ? 'var(--accent)' : 'var(--border2)', position: 'relative', transition: 'background 0.25s' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: negocio.activo ? 23 : 3, transition: 'left 0.25s', boxShadow: '0 2px 4px rgba(0,0,0,0.25)' }} />
            </button>
          </div>
          <div style={{ opacity: negocio.activo ? 1 : 0.55, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <EditorDias dias={negocio.dias} disabled={!puedeEditarNegocio} onChange={dias => setNegocio(n => ({ ...n, dias }))} />
            <EditorHoras desde={negocio.desde} hasta={negocio.hasta} disabled={!puedeEditarNegocio} onChange={v => setNegocio(n => ({ ...n, ...v }))} />
          </div>
          {puedeEditarNegocio && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={guardarNegocio} disabled={guardandoNegocio}>
                {guardandoNegocio ? '⏳ Guardando...' : '💾 Guardar horario'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── EMPLEADOS ── */}
      <div className="config-section">
        <div className="config-section-header">
          <div className="config-section-icon">👥</div>
          <div className="config-section-title">Empleados</div>
        </div>
        <div className="config-section-body" style={{ gap: 0 }}>
          {usuarios.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', padding: '6px 0' }}>No hay empleados (los administradores no tienen horario).</div>
          ) : usuarios.map(u => {
            const modo = u.horarioModo || 'negocio'
            const est = estadoHorario(u, configNegocio, ahora)
            const borrador = propios[u.id] || (u.horario?.dias ? u.horario : { dias: negocio.dias, desde: negocio.desde, hasta: negocio.hasta })
            const esYo = u.id === userId
            return (
              <div key={u.id} className="ha-fila">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{u.nombre || u.usuarioSimple || u.email}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{ROLES[u.rol]?.label || u.rol || '—'}{u.activo === false ? ' · inactivo' : ''}</div>
                </div>
                <select className="input" value={modo} disabled={!puedeEditarUsuarios || esYo} aria-label={`Horario de ${u.nombre}`}
                  onChange={e => cambiarModo(u, e.target.value)}>
                  {MODOS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
                <div>
                  {est.motivo === 'libre' && <span className="ha-estado libre">Sin restricción</span>}
                  {est.motivo === 'dentro' && <span className="ha-estado dentro">En horario</span>}
                  {est.motivo === 'fuera' && <span className="ha-estado fuera">Fuera de horario</span>}
                  {est.motivo === 'autorizado' && <span className="ha-estado autorizado">Autorizado hasta {horaSV(est.autorizadoHasta)}</span>}
                  {est.horario && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{describirHorario(est.horario)}</div>}
                </div>
                <div className="ha-autorizar">
                  {puedeAutorizar && !esYo && est.horario && (est.motivo === 'autorizado' ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => quitarAutorizacion(u)}>Quitar autorización</button>
                  ) : (
                    <>
                      <select className="input" style={{ width: 'auto', padding: '6px 8px', fontSize: 12 }} aria-label="Por cuánto tiempo"
                        value={duracion[u.id] || '2h'} onChange={e => setDuracion(d => ({ ...d, [u.id]: e.target.value }))}>
                        {DURACIONES.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                      </select>
                      <button className="btn btn-primary btn-sm" onClick={() => autorizar(u)}>⏰ Autorizar</button>
                    </>
                  ))}
                </div>
                {modo === 'propio' && (
                  <div className="ha-propio">
                    <EditorDias dias={borrador.dias} disabled={!puedeEditarUsuarios || esYo}
                      onChange={dias => setPropios(p => ({ ...p, [u.id]: { ...borrador, dias } }))} />
                    <EditorHoras desde={borrador.desde} hasta={borrador.hasta} disabled={!puedeEditarUsuarios || esYo}
                      onChange={v => setPropios(p => ({ ...p, [u.id]: { ...borrador, ...v } }))} />
                    {propios[u.id] && (
                      <div><button className="btn btn-primary btn-sm" onClick={() => guardarPropio(u)}>💾 Guardar horario de {u.nombre?.split(' ')[0] || 'este empleado'}</button></div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {puedeAutorizar && (
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
              💡 <strong>Autorizar</strong> deja trabajar a un empleado fuera de su horario por el tiempo que elijas. Queda registrado quién autorizó.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
