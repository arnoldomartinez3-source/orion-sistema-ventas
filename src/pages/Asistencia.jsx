import { useState, useEffect, useMemo } from 'react'
import { db } from '../firebase'
import { usePermisos } from '../PermisosContext'
import { collection, onSnapshot, query, where, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { orionAlert, orionConfirm } from '../orionDialog'
import { descargarExcel, descargarPdfTabla } from '../utils/exportar'

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
  /* Descargas: dos grupos claramente separados (uno del empleado, otro de todos) */
  .asis-descargas { display: flex; gap: 10px; flex-wrap: wrap; margin-left: auto; align-items: stretch; }
  .asis-desc-grupo { display: flex; flex-direction: column; gap: 6px; padding: 8px 12px; border: 1.5px solid var(--border); border-radius: 12px; background: var(--surface); }
  .asis-desc-tit { font-size: 11px; font-weight: 700; color: var(--text2); white-space: nowrap; }
  .asis-desc-btns { display: flex; gap: 6px; }
  @media (max-width: 860px) { .asis-descargas { margin-left: 0; width: 100%; } .asis-desc-grupo { flex: 1; } }
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
  const [dnl, setDnl] = useState([])
  const [detalle, setDetalle] = useState(null)   // fila seleccionada
  const [jForm, setJForm] = useState({ categoria: CATEGORIAS[0], detalle: '', sePaga: true })
  const [guardando, setGuardando] = useState(false)
  const [bajando, setBajando] = useState('')   // 'detalle' | 'resumen' mientras se arma el PDF

  useEffect(() => { if (!empleadoId && activos.length) setEmpleadoId(activos[0].id) }, [activos, empleadoId])

  useEffect(() => {
    if (!empresaId) return
    const u1 = onSnapshot(query(collection(db, 'marcaciones'), where('empresaId', '==', empresaId)),
      s => setMarcaciones(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {})
    const u2 = onSnapshot(query(collection(db, 'justificaciones'), where('empresaId', '==', empresaId)),
      s => setJustifs(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {})
    const u3 = onSnapshot(query(collection(db, 'dias_no_laborables'), where('empresaId', '==', empresaId)),
      s => setDnl(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {})
    return () => { u1(); u2(); u3() }
  }, [empresaId])

  const dias = useMemo(() => (desde && hasta && desde <= hasta ? rangoDias(desde, hasta) : []), [desde, hasta])

  // Nombre de la empresa para el encabezado de lo que se imprime
  const [empresaNombre, setEmpresaNombre] = useState('')
  useEffect(() => {
    if (!empresaId) return
    getDoc(doc(db, 'configuracion', empresaId))
      .then(s => setEmpresaNombre(s.exists() ? (s.data().nombreComercial || s.data().empresaNombre || '') : ''))
      .catch(() => {})
  }, [empresaId])

  // Días de UN empleado en el rango (la tabla en pantalla y las exportaciones usan esto).
  const filasDe = useMemo(() => (empId) => {
    if (!empId) return []
    const marcasEmp = marcaciones.filter(m => m.empleadoId === empId)
    const justEmp = justifs.filter(j => j.empleadoId === empId)
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
      let estado = entrada && salida ? 'completo' : entrada ? 'sinsalida' : salida ? 'sinentrada' : 'sinmarca'
      const feriado = dnl.find(d => d.fecha === fecha) || null
      if (feriado && estado === 'sinmarca') estado = 'feriado'
      return { fecha, entrada, salida, horas, horasMin, just, estado, feriado, delDia }
    }).reverse() // más reciente arriba
  }, [dias, marcaciones, justifs, dnl])

  const filas = useMemo(() => filasDe(empleadoId), [filasDe, empleadoId])

  const completos = filas.filter(f => f.estado === 'completo').length
  const sinMarca = filas.filter(f => f.estado === 'sinmarca').length
  const anomalias = filas.filter(f => f.estado === 'sinsalida' || f.estado === 'sinentrada').length
  const totalMin = filas.reduce((s, f) => s + f.horasMin, 0)
  const totalHoras = `${Math.floor(totalMin / 60)}h ${dosD(totalMin % 60)}m`

  const empleadoSel = empleados.find(e => e.id === empleadoId)

  // ── EXPORTAR ──────────────────────────────────────────────
  // Detalle = un empleado día por día. Resumen = todos, una línea por empleado.
  const ESTADOS = { completo: 'Completo', sinsalida: 'Sin salida', sinentrada: 'Sin entrada', sinmarca: 'Sin marca', feriado: 'No laborable' }
  const periodo = `${desde} a ${hasta}`
  // Nombres claros: se entiende de quién es y qué trae con solo leer el archivo.
  const limpio = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
  const nombreArchivo = (que, ext) => `asistencia-${que}-del-${desde}-al-${hasta}.${ext}`
  const nombreEmpleado = () => `detalle-${limpio(empleadoSel?.nombre) || 'empleado'}`
  const horasDe = (min) => `${Math.floor(min / 60)}h ${dosD(min % 60)}m`

  const filasDetalle = (lista) => lista.map(f => [
    f.fecha, diaSemana(f.fecha),
    f.entrada ? horaDe(f.entrada.timestamp) : '',
    f.salida ? horaDe(f.salida.timestamp) : '',
    f.horas || '', (f.horasMin / 60).toFixed(2).replace('.', ','),
    f.estado === 'feriado' ? `No laborable (${f.feriado.tipo})` : ESTADOS[f.estado],
    f.just?.categoria || '', f.just ? (f.just.sePaga !== false ? 'Sí' : 'No') : '', f.just?.detalle || '',
  ])
  const ENC_DETALLE = ['Fecha', 'Día', 'Entrada', 'Salida', 'Horas', 'Horas (decimal)', 'Estado', 'Justificación', '¿Se paga?', 'Detalle']

  const resumenTodos = () => activos.map(e => {
    const fs = filasDe(e.id)
    const min = fs.reduce((s, f) => s + f.horasMin, 0)
    return [
      e.nombre, e.cargo || '',
      fs.filter(f => f.estado === 'completo').length,
      fs.filter(f => f.estado === 'sinsalida' || f.estado === 'sinentrada').length,
      fs.filter(f => f.estado === 'sinmarca').length,
      fs.filter(f => f.just && f.just.sePaga === false).length,
      horasDe(min), (min / 60).toFixed(2).replace('.', ','),
    ]
  })
  const ENC_RESUMEN = ['Empleado', 'Cargo', 'Días completos', 'Anomalías', 'Días sin marca', 'Días no pagados', 'Horas', 'Horas (decimal)']

  const excelDetalle = () => {
    if (!filas.length) { orionAlert('No hay días en el rango seleccionado.', { tipo: 'warning' }); return }
    descargarExcel(nombreArchivo(nombreEmpleado(), 'csv'),
      [[empresaNombre || 'ORIÓN'], [`Asistencia de ${empleadoSel?.nombre || ''}`], [periodo], [], ENC_DETALLE, ...filasDetalle(filas)])
  }
  const excelResumen = () => {
    if (!activos.length) { orionAlert('No hay empleados activos.', { tipo: 'warning' }); return }
    descargarExcel(nombreArchivo('resumen-todo-el-personal', 'csv'),
      [[empresaNombre || 'ORIÓN'], ['Resumen de asistencia'], [periodo], [], ENC_RESUMEN, ...resumenTodos()])
  }
  const pdfDetalle = async () => {
    if (!filas.length) { orionAlert('No hay días en el rango seleccionado.', { tipo: 'warning' }); return }
    setBajando('detalle')
    try {
    await descargarPdfTabla({
      nombreArchivo: nombreArchivo(nombreEmpleado(), 'pdf'),
      empresa: empresaNombre, titulo: `Asistencia · ${empleadoSel?.nombre || ''}`,
      subtitulo: `${empleadoSel?.cargo || ''}${empleadoSel?.cargo ? ' · ' : ''}Del ${desde} al ${hasta}`,
      resumen: [
        { etiqueta: 'Días completos', valor: completos },
        { etiqueta: 'Horas trabajadas', valor: totalHoras },
        { etiqueta: 'Anomalías', valor: anomalias },
        { etiqueta: 'Días sin marca', valor: sinMarca },
      ],
      encabezados: ENC_DETALLE.filter(h => h !== 'Horas (decimal)'),
      filas: filasDetalle(filas).map(f => f.filter((_, i) => i !== 5)),
      pie: 'Firma del empleado: ______________________        Firma del patrono: ______________________',
    })
    } catch (e) { orionAlert('No se pudo armar el PDF: ' + e.message, { tipo: 'error' }) }
    setBajando('')
  }
  const pdfResumen = async () => {
    if (!activos.length) { orionAlert('No hay empleados activos.', { tipo: 'warning' }); return }
    setBajando('resumen')
    try {
      await descargarPdfTabla({
        nombreArchivo: nombreArchivo('resumen-todo-el-personal', 'pdf'),
        empresa: empresaNombre, titulo: 'Resumen de asistencia', subtitulo: `Del ${desde} al ${hasta} · ${activos.length} empleado(s)`,
        encabezados: ENC_RESUMEN.filter(h => h !== 'Horas (decimal)'),
        filas: resumenTodos().map(f => f.filter((_, i) => i !== 7)),
      })
    } catch (e) { orionAlert('No se pudo armar el PDF: ' + e.message, { tipo: 'error' }) }
    setBajando('')
  }

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
    } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
    setGuardando(false)
  }

  const cambiarTipo = async (m) => {
    const nuevo = m.tipo === 'entrada' ? 'salida' : 'entrada'
    if (!(await orionConfirm(`¿Cambiar esta marca de ${m.tipo} a ${nuevo}? La hora y la foto no cambian.`, { titulo: 'Corregir marca', okLabel: 'Cambiar', tipo: 'warning' }))) return
    try { await updateDoc(doc(db, 'marcaciones', m.id), { tipo: nuevo, corregido: true, corregidoPor: userId || '', updatedAt: serverTimestamp() }); setDetalle(null) }
    catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
  }
  const anularMarca = async (m) => {
    if (!(await orionConfirm(`¿Anular esta marca de ${m.tipo} (${horaDe(m.timestamp)})? No se puede deshacer.`, { titulo: 'Anular marca', okLabel: 'Anular', tipo: 'warning' }))) return
    try { await deleteDoc(doc(db, 'marcaciones', m.id)); setDetalle(null) }
    catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
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
        <div className="asis-descargas">
          <div className="asis-desc-grupo">
            <span className="asis-desc-tit">👤 {empleadoSel?.nombre?.split(' ')[0] || 'Este empleado'} · día por día</span>
            <div className="asis-desc-btns">
              <button className="btn btn-ghost btn-sm" onClick={pdfDetalle} disabled={bajando === 'detalle'} title="Día por día del empleado elegido, en PDF">
                {bajando === 'detalle' ? '⏳…' : '📄 PDF'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={excelDetalle} title="Día por día del empleado elegido, en Excel">📊 Excel</button>
            </div>
          </div>
          <div className="asis-desc-grupo">
            <span className="asis-desc-tit">👥 Todo el personal · resumen</span>
            <div className="asis-desc-btns">
              <button className="btn btn-ghost btn-sm" onClick={pdfResumen} disabled={bajando === 'resumen'} title="Una línea por empleado: días, horas y faltas, en PDF">
                {bajando === 'resumen' ? '⏳…' : '📄 PDF'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={excelResumen} title="Una línea por empleado, en Excel">📊 Excel</button>
            </div>
          </div>
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
                const b = f.estado === 'feriado' ? { txt: '🌴 ' + f.feriado.tipo, bg: 'rgba(74,143,232,0.14)', co: '#4A8FE8' } : badge(f.estado)
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
        <div className="modal-overlay">
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
