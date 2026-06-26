import { useState, useEffect, useMemo } from 'react'
import { db } from '../firebase'
import { usePermisos } from '../PermisosContext'
import { collection, onSnapshot, query, where, doc, getDoc, setDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'

// ══════════════════════════════════════════════════
// PLANILLA (Etapa 4 — nivel BÁSICO) — ORIÓN
// Por período (mes / quincena): bruto − días no pagados − ISSS − AFP = NETO.
// Descuentos de ley CONFIGURABLES (doc nomina_config/{empresaId}), pre-cargados
// con valores 2026 de El Salvador. ISR (renta) queda para el sub-paso avanzado.
// Aviso: ORIÓN calcula, el dueño valida con su contador.
// ══════════════════════════════════════════════════

const NOMINA_DEFAULT = {
  issEmpleado: 3,     // % al empleado
  issTope: 30,        // $ tope mensual ISSS
  afpEmpleado: 7.25,  // % al empleado
  issPatronal: 7.5,   // % patronal (lo paga el dueño)
  afpPatronal: 8.75,  // % patronal
  // Tabla ISR (renta) MENSUAL de El Salvador (editable; para quincena se aplica /2).
  // ISR = cuotaFija + (baseGravable − sobreExceso) × % ; baseGravable = devengado − ISSS − AFP.
  isrTramos: [
    { hasta: 472.00,  porcentaje: 0,  cuotaFija: 0,      sobreExceso: 0 },
    { hasta: 895.24,  porcentaje: 10, cuotaFija: 17.67,  sobreExceso: 472.00 },
    { hasta: 2038.10, porcentaje: 20, cuotaFija: 60.00,  sobreExceso: 895.24 },
    { hasta: 9999999, porcentaje: 30, cuotaFija: 288.57, sobreExceso: 2038.10 },
  ],
}

const dosD = (n) => String(n).padStart(2, '0')
const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${dosD(d.getMonth() + 1)}` }
const ultimoDiaMes = (y, m) => new Date(y, m, 0).getDate()
const TIPOS = [{ v: 'mensual', l: 'Mensual' }, { v: 'q1', l: 'Quincena 1' }, { v: 'q2', l: 'Quincena 2' }]
const nombreMes = (mes) => { const [y, m] = mes.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('es-SV', { month: 'long', year: 'numeric' }) }

export default function Planilla({ empleados = [] }) {
  const { empresaId, userId } = usePermisos()
  const [mes, setMes] = useState(mesActual())
  const [tipo, setTipo] = useState('mensual')
  const [justifs, setJustifs] = useState([])
  const [ajustes, setAjustes] = useState([])
  const [ajusteEmp, setAjusteEmp] = useState(null)
  const [ajForm, setAjForm] = useState({ tipo: 'bono', concepto: '', monto: '' })
  const [dnl, setDnl] = useState([])
  const [dnlOpen, setDnlOpen] = useState(false)
  const [dnlForm, setDnlForm] = useState({ fecha: '', tipo: 'Asueto', concepto: '', sePaga: true })
  const [cfg, setCfg] = useState(NOMINA_DEFAULT)
  const [cfgForm, setCfgForm] = useState(NOMINA_DEFAULT)
  const [cfgOpen, setCfgOpen] = useState(false)
  const [empresa, setEmpresa] = useState({})
  const [boleta, setBoleta] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!empresaId) return
    const u = onSnapshot(query(collection(db, 'justificaciones'), where('empresaId', '==', empresaId)),
      s => setJustifs(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {})
    const u2 = onSnapshot(query(collection(db, 'nomina_ajustes'), where('empresaId', '==', empresaId)),
      s => setAjustes(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {})
    const u3 = onSnapshot(query(collection(db, 'dias_no_laborables'), where('empresaId', '==', empresaId)),
      s => setDnl(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {})
    return () => { u(); u2(); u3() }
  }, [empresaId])

  useEffect(() => {
    if (!empresaId) return
    getDoc(doc(db, 'nomina_config', empresaId)).then(s => { if (s.exists()) setCfg({ ...NOMINA_DEFAULT, ...s.data() }) }).catch(() => {})
    getDoc(doc(db, 'configuracion', empresaId)).then(s => { if (s.exists()) setEmpresa(s.data()) }).catch(() => {})
  }, [empresaId])

  const [y, m] = mes.split('-').map(Number)
  const ult = ultimoDiaMes(y, m)
  const rango = tipo === 'q1' ? [`${mes}-01`, `${mes}-15`]
    : tipo === 'q2' ? [`${mes}-16`, `${mes}-${dosD(ult)}`]
    : [`${mes}-01`, `${mes}-${dosD(ult)}`]
  const frecObjetivo = tipo === 'mensual' ? 'mensual' : 'quincenal'
  const diasPeriodo = tipo === 'mensual' ? 30 : 15
  const topePeriodo = tipo === 'mensual' ? Number(cfg.issTope) : Number(cfg.issTope) / 2
  const periodo = `${mes}-${tipo}`

  const activos = useMemo(
    () => empleados.filter(e => e.activo !== false && (e.frecuenciaPago || 'mensual') === frecObjetivo),
    [empleados, frecObjetivo]
  )

  const calcular = (emp) => {
    const sueldo = round2(emp.sueldo)
    const diasJustNoPag = justifs.filter(j => j.empleadoId === emp.id && j.sePaga === false && j.fecha >= rango[0] && j.fecha <= rango[1]).length
    const diasGenNoPag = dnl.filter(d => d.sePaga === false && d.fecha >= rango[0] && d.fecha <= rango[1]).length
    const diasNoPagados = diasJustNoPag + diasGenNoPag
    const descDias = round2((sueldo / diasPeriodo) * diasNoPagados)
    const devengado = round2(sueldo - descDias)
    const tieneAFP = emp.fondoAFP && emp.fondoAFP !== 'Solo ISSS'
    const iss = round2(Math.min(devengado * (Number(cfg.issEmpleado) / 100), topePeriodo))
    const afp = tieneAFP ? round2(devengado * (Number(cfg.afpEmpleado) / 100)) : 0
    const baseGravable = round2(devengado - iss - afp)
    const factor = tipo === 'mensual' ? 1 : 0.5
    const tramos = (cfg.isrTramos || NOMINA_DEFAULT.isrTramos).map(t => ({ hasta: Number(t.hasta) * factor, porcentaje: Number(t.porcentaje), cuotaFija: Number(t.cuotaFija) * factor, sobreExceso: Number(t.sobreExceso) * factor }))
    const tramo = tramos.find(t => baseGravable <= t.hasta) || tramos[tramos.length - 1]
    const isr = round2(Math.max(0, tramo.cuotaFija + (baseGravable - tramo.sobreExceso) * (tramo.porcentaje / 100)))
    const netoBase = round2(baseGravable - isr)
    const ajEmp = ajustes.filter(a => a.empleadoId === emp.id && a.periodo === periodo)
    const bonos = round2(ajEmp.filter(a => a.tipo === 'bono').reduce((s, a) => s + (Number(a.monto) || 0), 0))
    const descuentos = round2(ajEmp.filter(a => a.tipo === 'descuento').reduce((s, a) => s + (Number(a.monto) || 0), 0))
    const adelantos = round2(ajEmp.filter(a => a.tipo === 'adelanto').reduce((s, a) => s + (Number(a.monto) || 0), 0))
    const neto = round2(netoBase + bonos - descuentos - adelantos)
    const issPat = round2(devengado * (Number(cfg.issPatronal) / 100))
    const afpPat = tieneAFP ? round2(devengado * (Number(cfg.afpPatronal) / 100)) : 0
    const costoEmpleador = round2(devengado + issPat + afpPat)
    return { sueldo, diasNoPagados, descDias, devengado, iss, afp, isr, baseGravable, netoBase, bonos, descuentos, adelantos, neto, issPat, afpPat, costoEmpleador, tieneAFP, ajEmp }
  }

  const filas = useMemo(() => activos.map(e => ({ emp: e, c: calcular(e) })), [activos, justifs, ajustes, dnl, cfg, rango, diasPeriodo, topePeriodo, periodo])

  const tot = filas.reduce((a, { c }) => ({
    neto: a.neto + c.neto, iss: a.iss + c.iss, afp: a.afp + c.afp, isr: a.isr + c.isr,
    devengado: a.devengado + c.devengado, costo: a.costo + c.costoEmpleador,
  }), { neto: 0, iss: 0, afp: 0, isr: 0, devengado: 0, costo: 0 })

  const abrirCfg = () => { setCfgForm({ ...cfg, isrTramos: (cfg.isrTramos || NOMINA_DEFAULT.isrTramos).map(t => ({ ...t })) }); setCfgOpen(true) }
  const setTramo = (i, campo, val) => setCfgForm(f => { const t = [...(f.isrTramos || NOMINA_DEFAULT.isrTramos)]; t[i] = { ...t[i], [campo]: val }; return { ...f, isrTramos: t } })
  const guardarCfg = async () => {
    setGuardando(true)
    try {
      const limpio = {
        issEmpleado: Number(cfgForm.issEmpleado) || 0, issTope: Number(cfgForm.issTope) || 0,
        afpEmpleado: Number(cfgForm.afpEmpleado) || 0, issPatronal: Number(cfgForm.issPatronal) || 0,
        afpPatronal: Number(cfgForm.afpPatronal) || 0,
        isrTramos: (cfgForm.isrTramos || NOMINA_DEFAULT.isrTramos).map(t => ({
          hasta: Number(t.hasta) || 0, porcentaje: Number(t.porcentaje) || 0,
          cuotaFija: Number(t.cuotaFija) || 0, sobreExceso: Number(t.sobreExceso) || 0,
        })),
      }
      await setDoc(doc(db, 'nomina_config', empresaId), { ...limpio, empresaId, actualizadoPor: userId || '', updatedAt: serverTimestamp() }, { merge: true })
      setCfg(prev => ({ ...prev, ...limpio })); setCfgOpen(false)
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const agregarAjuste = async () => {
    if (!ajForm.concepto.trim() || !(Number(ajForm.monto) > 0)) { alert('Poné un concepto y un monto válido.'); return }
    try {
      await addDoc(collection(db, 'nomina_ajustes'), {
        empresaId, empleadoId: ajusteEmp.id, periodo,
        tipo: ajForm.tipo, concepto: ajForm.concepto.trim(), monto: round2(ajForm.monto),
        creadoPor: userId || '', createdAt: serverTimestamp(),
      })
      setAjForm({ tipo: 'bono', concepto: '', monto: '' })
    } catch (e) { alert('Error: ' + e.message) }
  }
  const borrarAjuste = async (id) => { try { await deleteDoc(doc(db, 'nomina_ajustes', id)) } catch (e) { alert('Error: ' + e.message) } }

  const agregarDnl = async () => {
    if (!dnlForm.fecha) { alert('Elegí una fecha.'); return }
    try {
      await setDoc(doc(db, 'dias_no_laborables', `${empresaId}_${dnlForm.fecha}`), {
        empresaId, fecha: dnlForm.fecha, tipo: dnlForm.tipo, concepto: dnlForm.concepto.trim(), sePaga: dnlForm.sePaga,
        creadoPor: userId || '', updatedAt: serverTimestamp(),
      }, { merge: true })
      setDnlForm({ fecha: '', tipo: 'Asueto', concepto: '', sePaga: true })
    } catch (e) { alert('Error: ' + e.message) }
  }
  const borrarDnl = async (id) => { try { await deleteDoc(doc(db, 'dias_no_laborables', id)) } catch (e) { alert('Error: ' + e.message) } }

  const periodoTxt = `${TIPOS.find(t => t.v === tipo).l} · ${nombreMes(mes)}`

  const imprimirBoleta = () => {
    const cont = document.getElementById('boleta-print')
    if (!cont) return
    const win = window.open('', '_blank', 'width=480,height=680')
    win.document.write(`<html><head><title>Boleta de pago</title><style>
      body{font-family:Arial,sans-serif;color:#16213f;padding:24px;max-width:420px;margin:0 auto;}
      .bl-row{display:flex;justify-content:space-between;padding:5px 0;font-size:14px;border-bottom:1px solid #eee;}
      .bl-tot{font-weight:800;font-size:18px;border-top:2px solid #16213f;margin-top:6px;padding-top:8px;}
      h2{margin:0 0 2px;} .muted{color:#777;font-size:12px;}
    </style></head><body>${cont.innerHTML}</body></html>`)
    win.document.close(); win.focus(); setTimeout(() => win.print(), 250)
  }

  return (
    <>
      {/* FILTROS */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="form-label">Mes</label>
          <input className="input" type="month" value={mes} onChange={e => setMes(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {TIPOS.map(t => (
            <button key={t.v} className={`btn btn-sm ${tipo === t.v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTipo(t.v)}>{t.l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => setDnlOpen(true)}>📅 Días no laborables</button>
        <button className="btn btn-ghost btn-sm" onClick={abrirCfg}>⚙️ Descuentos de ley</button>
      </div>

      {/* AVISO */}
      <div style={{ background: 'var(--gold-glow)', border: '1px solid rgba(193,154,46,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: 'var(--text2)', marginBottom: 16 }}>
        💡 Incluye <strong>ISSS, AFP e ISR (renta)</strong>. ORIÓN <strong>calcula</strong>, pero <strong>validá los montos y la tabla con tu contador</strong> — la ley cambia y la tabla es editable en ⚙️ Descuentos de ley.
      </div>

      {/* TOTALES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { l: 'Empleados', v: filas.length, c: '#0ea5e9' },
          { l: 'Total neto a pagar', v: fmt(tot.neto), c: '#00C296' },
          { l: 'Retenciones', v: fmt(tot.iss + tot.afp + tot.isr), c: '#d98a00' },
          { l: 'Costo patronal total', v: fmt(tot.costo), c: '#C19A2E' },
        ].map((k, i) => (
          <div key={i} className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: k.c, lineHeight: 1 }}>{k.v}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* PLANILLA */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>EMPLEADO</th><th>BRUTO</th><th>DÍAS NO PAG.</th><th>ISSS</th><th>AFP</th><th>ISR</th><th>NETO</th><th></th></tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>
                  Sin empleados {tipo === 'mensual' ? 'mensuales' : 'quincenales'} activos para este período.
                </td></tr>
              ) : filas.map(({ emp, c }) => (
                <tr key={emp.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{emp.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{emp.cargo || '—'} · {emp.fondoAFP || '—'}</div>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{fmt(c.sueldo)}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: c.diasNoPagados ? 'var(--danger)' : 'inherit' }}>{c.diasNoPagados ? `${c.diasNoPagados} (−${fmt(c.descDias)})` : '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{fmt(c.iss)}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{c.tieneAFP ? fmt(c.afp) : '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{c.isr > 0 ? fmt(c.isr) : '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: '#00C296' }}>{fmt(c.neto)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setAjusteEmp(emp); setAjForm({ tipo: 'bono', concepto: '', monto: '' }) }}>⚙ Ajustes</button>
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => setBoleta({ emp, c })}>📄 Boleta</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CONFIG DESCUENTOS */}
      {cfgOpen && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-title">⚙️ Descuentos de ley (El Salvador)</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>Valores 2026 pre-cargados. Editalos si la ley cambia. Validá con tu contador.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                ['issEmpleado', 'ISSS empleado (%)'], ['issTope', 'ISSS tope mensual ($)'],
                ['afpEmpleado', 'AFP empleado (%)'], ['issPatronal', 'ISSS patronal (%)'],
                ['afpPatronal', 'AFP patronal (%)'],
              ].map(([k, l]) => (
                <div key={k} className="form-group">
                  <label className="form-label">{l}</label>
                  <input className="input" type="number" step="0.01" value={cfgForm[k]} onChange={e => setCfgForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
            </div>

            <div className="form-label" style={{ marginTop: 16, marginBottom: 6 }}>Tabla ISR (renta) — mensual</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Para quincena se aplica a la mitad. ISR = cuota fija + (base gravable − sobre exceso) × %.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.7fr 1fr', gap: 6, fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
              <span>Sobre exceso</span><span>Hasta</span><span>%</span><span>Cuota fija</span>
            </div>
            {(cfgForm.isrTramos || NOMINA_DEFAULT.isrTramos).map((t, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.7fr 1fr', gap: 6, marginBottom: 6 }}>
                <input className="input" type="number" step="0.01" value={t.sobreExceso} onChange={e => setTramo(i, 'sobreExceso', e.target.value)} />
                <input className="input" type="number" step="0.01" value={t.hasta} onChange={e => setTramo(i, 'hasta', e.target.value)} />
                <input className="input" type="number" step="0.01" value={t.porcentaje} onChange={e => setTramo(i, 'porcentaje', e.target.value)} />
                <input className="input" type="number" step="0.01" value={t.cuotaFija} onChange={e => setTramo(i, 'cuotaFija', e.target.value)} />
              </div>
            ))}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setCfgOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarCfg} disabled={guardando}>{guardando ? '⏳…' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BOLETA */}
      {boleta && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div id="boleta-print">
              <h2 style={{ margin: '0 0 2px' }}>{empresa.nombre || empresa.nombreComercial || 'Boleta de pago'}</h2>
              <div className="muted" style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 12 }}>Boleta de pago · {periodoTxt}</div>
              <div className="bl-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14, borderBottom: '1px solid var(--border)' }}><span>Empleado</span><strong>{boleta.emp.nombre}</strong></div>
              <div className="bl-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14, borderBottom: '1px solid var(--border)' }}><span>Cargo</span><span>{boleta.emp.cargo || '—'}</span></div>
              <div className="bl-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14, borderBottom: '1px solid var(--border)' }}><span>Sueldo bruto</span><strong>{fmt(boleta.c.sueldo)}</strong></div>
              {boleta.c.diasNoPagados > 0 && (
                <div className="bl-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14, borderBottom: '1px solid var(--border)', color: '#c0392b' }}><span>{boleta.c.diasNoPagados} día(s) no pagado(s)</span><span>− {fmt(boleta.c.descDias)}</span></div>
              )}
              <div className="bl-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14, borderBottom: '1px solid var(--border)' }}><span>ISSS</span><span>− {fmt(boleta.c.iss)}</span></div>
              <div className="bl-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14, borderBottom: '1px solid var(--border)' }}><span>AFP {boleta.emp.fondoAFP && boleta.emp.fondoAFP !== 'Solo ISSS' ? `(${boleta.emp.fondoAFP})` : ''}</span><span>− {fmt(boleta.c.afp)}</span></div>
              {boleta.c.isr > 0 && <div className="bl-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14, borderBottom: '1px solid var(--border)' }}><span>ISR (renta)</span><span>− {fmt(boleta.c.isr)}</span></div>}
              {boleta.c.ajEmp.map(a => (
                <div key={a.id} className="bl-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14, borderBottom: '1px solid var(--border)', color: a.tipo === 'bono' ? '#1a7f4f' : '#c0392b' }}>
                  <span>{a.concepto}</span><span>{a.tipo === 'bono' ? '+' : '−'} {fmt(a.monto)}</span>
                </div>
              ))}
              <div className="bl-row bl-tot" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18, borderTop: '2px solid var(--text)', marginTop: 6, paddingTop: 8 }}><span>NETO A PAGAR</span><span>{fmt(boleta.c.neto)}</span></div>
              <div className="muted" style={{ color: 'var(--muted)', fontSize: 11, marginTop: 12 }}>Costo patronal (no se descuenta): ISSS {fmt(boleta.c.issPat)} + AFP {fmt(boleta.c.afpPat)}. Cálculo estimado — validar con contador.</div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setBoleta(null)}>Cerrar</button>
              <button className="btn btn-primary" onClick={imprimirBoleta}>🖨️ Imprimir / PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AJUSTES (bono / descuento / adelanto) */}
      {ajusteEmp && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-title">⚙ Ajustes · {ajusteEmp.nombre}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>{periodoTxt}</div>

            {(() => {
              const lista = ajustes.filter(a => a.empleadoId === ajusteEmp.id && a.periodo === periodo)
              return lista.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '8px 0 14px' }}>Sin ajustes este período.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {lista.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 10, background: 'var(--surface2)' }}>
                      <span style={{ fontSize: 18 }}>{a.tipo === 'bono' ? '🎁' : a.tipo === 'adelanto' ? '💸' : '➖'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{a.concepto}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{a.tipo}</div>
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: a.tipo === 'bono' ? '#00C296' : 'var(--danger)' }}>{a.tipo === 'bono' ? '+' : '−'}{fmt(a.monto)}</div>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => borrarAjuste(a.id)}>🗑</button>
                    </div>
                  ))}
                </div>
              )
            })()}

            <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['bono', '🎁 Bono'], ['descuento', '➖ Descuento'], ['adelanto', '💸 Adelanto']].map(([v, l]) => (
                  <button key={v} className={`btn btn-sm ${ajForm.tipo === v ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setAjForm(f => ({ ...f, tipo: v }))}>{l}</button>
                ))}
              </div>
              <input className="input" placeholder="Concepto (ej. Bono por meta, Préstamo, Adelanto quincena)" value={ajForm.concepto} onChange={e => setAjForm(f => ({ ...f, concepto: e.target.value }))} />
              <input className="input" type="number" step="0.01" placeholder="Monto ($)" value={ajForm.monto} onChange={e => setAjForm(f => ({ ...f, monto: e.target.value }))} />
              <button className="btn btn-primary" onClick={agregarAjuste}>+ Agregar ajuste</button>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setAjusteEmp(null)}>Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DÍAS NO LABORABLES (general — todos los empleados) */}
      {dnlOpen && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-title">📅 Días no laborables (todos)</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>Asuetos, vacaciones colectivas o cierres. Aplican a TODOS los empleados (asistencia y planilla). Si marcás "No se paga", se descuenta ese día.</div>
            {dnl.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '8px 0 14px' }}>Sin días cargados.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, maxHeight: 220, overflowY: 'auto' }}>
                {[...dnl].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 10, background: 'var(--surface2)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{d.fecha} · {d.tipo}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{d.concepto || '—'}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: d.sePaga ? 'rgba(0,194,150,0.14)' : 'rgba(239,68,68,0.14)', color: d.sePaga ? '#00C296' : '#ef4444' }}>{d.sePaga ? 'Se paga' : 'No se paga'}</span>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => borrarDnl(d.id)}>🗑</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" type="date" style={{ flex: 1 }} value={dnlForm.fecha} onChange={e => setDnlForm(f => ({ ...f, fecha: e.target.value }))} />
                <select className="input" style={{ flex: 1 }} value={dnlForm.tipo} onChange={e => setDnlForm(f => ({ ...f, tipo: e.target.value }))}>
                  {['Asueto', 'Vacación', 'Cierre', 'Otro'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <input className="input" placeholder="Concepto (ej. Día de la Independencia)" value={dnlForm.concepto} onChange={e => setDnlForm(f => ({ ...f, concepto: e.target.value }))} />
              <div onClick={() => setDnlForm(f => ({ ...f, sePaga: !f.sePaga }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface2)' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>¿Se paga este día?</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: dnlForm.sePaga ? 'rgba(0,194,150,0.14)' : 'rgba(239,68,68,0.14)', color: dnlForm.sePaga ? '#00C296' : '#ef4444' }}>{dnlForm.sePaga ? '💵 Sí' : '🚫 No'}</span>
              </div>
              <button className="btn btn-primary" onClick={agregarDnl}>+ Agregar día</button>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDnlOpen(false)}>Listo</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
