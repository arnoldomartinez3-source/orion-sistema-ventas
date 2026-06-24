import { useState, useEffect, useMemo } from 'react'
import { db } from '../firebase'
import { usePermisos } from '../PermisosContext'
import { collection, onSnapshot, query, where, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'

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
    return () => u()
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

  const activos = useMemo(
    () => empleados.filter(e => e.activo !== false && (e.frecuenciaPago || 'mensual') === frecObjetivo),
    [empleados, frecObjetivo]
  )

  const calcular = (emp) => {
    const sueldo = round2(emp.sueldo)
    const diasNoPagados = justifs.filter(j => j.empleadoId === emp.id && j.sePaga === false && j.fecha >= rango[0] && j.fecha <= rango[1]).length
    const descDias = round2((sueldo / diasPeriodo) * diasNoPagados)
    const devengado = round2(sueldo - descDias)
    const tieneAFP = emp.fondoAFP && emp.fondoAFP !== 'Solo ISSS'
    const iss = round2(Math.min(devengado * (Number(cfg.issEmpleado) / 100), topePeriodo))
    const afp = tieneAFP ? round2(devengado * (Number(cfg.afpEmpleado) / 100)) : 0
    const neto = round2(devengado - iss - afp)
    const issPat = round2(devengado * (Number(cfg.issPatronal) / 100))
    const afpPat = tieneAFP ? round2(devengado * (Number(cfg.afpPatronal) / 100)) : 0
    const costoEmpleador = round2(devengado + issPat + afpPat)
    return { sueldo, diasNoPagados, descDias, devengado, iss, afp, neto, issPat, afpPat, costoEmpleador, tieneAFP }
  }

  const filas = useMemo(() => activos.map(e => ({ emp: e, c: calcular(e) })), [activos, justifs, cfg, rango, diasPeriodo, topePeriodo])

  const tot = filas.reduce((a, { c }) => ({
    neto: a.neto + c.neto, iss: a.iss + c.iss, afp: a.afp + c.afp,
    devengado: a.devengado + c.devengado, costo: a.costo + c.costoEmpleador,
  }), { neto: 0, iss: 0, afp: 0, devengado: 0, costo: 0 })

  const abrirCfg = () => { setCfgForm(cfg); setCfgOpen(true) }
  const guardarCfg = async () => {
    setGuardando(true)
    try {
      const limpio = {
        issEmpleado: Number(cfgForm.issEmpleado) || 0, issTope: Number(cfgForm.issTope) || 0,
        afpEmpleado: Number(cfgForm.afpEmpleado) || 0, issPatronal: Number(cfgForm.issPatronal) || 0,
        afpPatronal: Number(cfgForm.afpPatronal) || 0,
      }
      await setDoc(doc(db, 'nomina_config', empresaId), { ...limpio, empresaId, actualizadoPor: userId || '', updatedAt: serverTimestamp() }, { merge: true })
      setCfg(prev => ({ ...prev, ...limpio })); setCfgOpen(false)
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

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
        <button className="btn btn-ghost btn-sm" onClick={abrirCfg}>⚙️ Descuentos de ley</button>
      </div>

      {/* AVISO */}
      <div style={{ background: 'var(--gold-glow)', border: '1px solid rgba(193,154,46,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: 'var(--text2)', marginBottom: 16 }}>
        💡 <strong>Nivel básico</strong> (ISSS + AFP). ORIÓN <strong>calcula</strong>, pero <strong>validá los montos con tu contador</strong>. La renta (ISR) se suma en el próximo paso.
      </div>

      {/* TOTALES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { l: 'Empleados', v: filas.length, c: '#0ea5e9' },
          { l: 'Total neto a pagar', v: fmt(tot.neto), c: '#00C296' },
          { l: 'ISSS + AFP', v: fmt(tot.iss + tot.afp), c: '#d98a00' },
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
              <tr><th>EMPLEADO</th><th>BRUTO</th><th>DÍAS NO PAG.</th><th>ISSS</th><th>AFP</th><th>NETO</th><th></th></tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>
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
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: '#00C296' }}>{fmt(c.neto)}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={() => setBoleta({ emp, c })}>📄 Boleta</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CONFIG DESCUENTOS */}
      {cfgOpen && (
        <div className="modal-overlay" onClick={() => setCfgOpen(false)}>
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
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setCfgOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarCfg} disabled={guardando}>{guardando ? '⏳…' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BOLETA */}
      {boleta && (
        <div className="modal-overlay" onClick={() => setBoleta(null)}>
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
    </>
  )
}
