import { useState, useEffect, useMemo } from 'react'
import { db } from '../firebase'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'
import { orionAlert } from '../orionDialog'
import { generarDeclaracion, fmt } from '../utils/anexosMH'

// ══════════════════════════════════════════════════════════════════
// CONTADORES — Etapa 1
// Genera los CSV para el portal de Declaraciones en Línea del MH a partir
// de los DTE emitidos/recibidos del mes, y muestra las casillas F07/F14.
// Solo produce archivos y un resumen; la declaración la valida el contador.
// ══════════════════════════════════════════════════════════════════

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// Mes anterior al actual (lo normal es declarar el mes ya cerrado).
const periodoPorDefecto = () => {
  const hoy = new Date()
  let m = hoy.getMonth() // 0-11 → mes anterior = getMonth() (porque getMonth es 0-index del actual)
  let a = hoy.getFullYear()
  if (m === 0) { m = 12; a -= 1 } // enero → diciembre del año pasado
  return { mes: m, anio: a }
}

// `operaciones` no guarda fechaEmision → derivarla de createdAt en hora SV.
const fechaSVdesde = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const fechaDeOperacion = (op) => op.createdAt?.toDate ? fechaSVdesde(op.createdAt.toDate()) : (op.fechaEmision || '')

const descargarCSV = (nombre, csv) => {
  if (!csv) { orionAlert('No hay filas para este anexo en el período seleccionado.', { tipo: 'warning' }); return }
  // Sin BOM: el portal del MH no lo acepta.
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nombre
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Tarjeta de casilla (número MH + valor)
const Casilla = ({ n, label, valor, destacar }) => (
  <div className="card" style={{ padding: '12px 14px', borderRadius: 12, borderLeft: `4px solid ${destacar ? '#0891b2' : 'var(--border)'}` }}>
    <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      {n && <span style={{ fontWeight: 700, color: '#0891b2' }}>#{n}</span>}
    </div>
    <div style={{ fontSize: destacar ? 22 : 18, fontWeight: 800, marginTop: 4 }}>${fmt(valor)}</div>
  </div>
)

export default function Contadores() {
  const { empresaId } = usePermisos()
  const [facturas, setFacturas] = useState([])
  const [compras, setCompras] = useState([])
  const [operaciones, setOperaciones] = useState([])
  const [planillas, setPlanillas] = useState([])
  const [planillasError, setPlanillasError] = useState(false) // sin permiso de nómina → sin filas de empleados
  const [cargando, setCargando] = useState(true)
  const [{ mes, anio }, setPeriodo] = useState(periodoPorDefecto())

  // Clasificaciones editables (columnas que el DTE no trae). Defaults = fixture MH.
  const [defVentas, setDefVentas] = useState({ tipoOperacion: '1', tipoIngreso: '2' })
  const [defCompras, setDefCompras] = useState({ tipoOperacion: '1', clasificacion: '1', sector: '2', tipoCostoGasto: '5' })
  // Renta F-14: sueldos/servicios = Gravada · Gasto · Comercio · Gastos de administración (según tabla del manual).
  const [defRenta, setDefRenta] = useState({ tipoOperacion: '1', clasificacion: '2', sector: '2', tipoCostoGasto: '2' })

  useEffect(() => {
    if (!empresaId) return
    setCargando(true)
    const unsubF = onSnapshot(query(collection(db, 'facturas'), where('empresaId', '==', empresaId)), snap => {
      setFacturas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setCargando(false)
    })
    const unsubC = onSnapshot(query(collection(db, 'compras'), where('empresaId', '==', empresaId)), snap => {
      setCompras(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    // operaciones (FSE/Retención/FEX): se les inyecta fechaEmision derivada de createdAt.
    const unsubO = onSnapshot(query(collection(db, 'operaciones'), where('empresaId', '==', empresaId)), snap => {
      setOperaciones(snap.docs.map(d => { const data = d.data(); return { id: d.id, ...data, fechaEmision: fechaDeOperacion(data) } }))
    })
    // planillas cerradas (Empleados → Planilla → "Cerrar planilla"). Solo admin / gestionar_personal.
    const unsubP = onSnapshot(query(collection(db, 'planillas'), where('empresaId', '==', empresaId)),
      snap => { setPlanillas(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setPlanillasError(false) },
      () => setPlanillasError(true))
    return () => { unsubF(); unsubC(); unsubO(); unsubP() }
  }, [empresaId])

  const mesPad = String(mes).padStart(2, '0')
  const sufijo = `${anio}${mesPad}`

  // Planilla del mes: suma mensual + quincenas por empleado (una fila por persona).
  const planillaMes = useMemo(() => {
    const porEmp = {}
    planillas.filter(p => p.mes === `${anio}-${mesPad}`).forEach(p => {
      (p.filas || []).forEach(f => {
        const k = f.empleadoId || f.dui || f.nombre
        if (!porEmp[k]) porEmp[k] = { nombre: f.nombre, dui: f.dui, devengado: 0, bonos: 0, iss: 0, afp: 0, isr: 0, aguinaldoExento: 0, aguinaldoGravado: 0 }
        const e = porEmp[k]
        e.devengado += Number(f.devengado) || 0; e.bonos += Number(f.bonos) || 0
        e.iss += Number(f.iss) || 0; e.afp += Number(f.afp) || 0; e.isr += Number(f.isr) || 0
        e.aguinaldoExento += Number(f.aguinaldoExento) || 0; e.aguinaldoGravado += Number(f.aguinaldoGravado) || 0
      })
    })
    return Object.values(porEmp)
  }, [planillas, anio, mesPad])

  const decl = useMemo(
    () => generarDeclaracion({ facturas, compras, operaciones, planilla: planillaMes, anio, mes, defaults: { ventas: defVentas, compras: defCompras, renta: defRenta } }),
    [facturas, compras, operaciones, planillaMes, anio, mes, defVentas, defCompras, defRenta]
  )

  // Validaciones para el checklist
  const validaciones = useMemo(() => {
    const v = []
    const sinNrc = decl.ventasCCF.filter(f => !((f.nrc || '').replace(/\D/g, '') || (f.nit || '').replace(/\D/g, '')))
    if (sinNrc.length) v.push({ tipo: 'error', texto: `${sinNrc.length} venta(s) CCF sin NIT/NRC del cliente (columna obligatoria).` })
    const sinCodGen = decl.comprasPeriodo.filter(c => !(c.codigoGeneracionProveedor || '').trim())
    if (sinCodGen.length) v.push({ tipo: 'error', texto: `${sinCodGen.length} compra(s) sin Código de Generación — el Anexo 3 lo exige. Editá la compra y agregalo.` })
    if (decl.f14.ingresosServicios !== decl.f07.ventasGravadas) v.push({ tipo: 'warning', texto: 'Los ingresos del F14 no coinciden con las ventas del F07 (revisar). Presentá el F07 antes que el F14.' })
    v.push({ tipo: 'info', texto: 'Las columnas Tipo de Operación / Ingreso / Clasificación / Sector usan valores por defecto — revisalas con el contador.' })
    if (decl.anexo2.filas.length) v.push({ tipo: 'info', texto: `Anexo 2 (consumidor): ${decl.anexo2.totales.documentos} factura(s) agrupadas por día. La columna "gravadas" va con IVA incluido; el F07 usa la base neta en casilla 96.` })
    // Renta F-14
    if (planillasError) v.push({ tipo: 'warning', texto: 'No tenés permiso para leer la planilla (Gestionar empleados y planilla): el anexo de renta solo incluirá las FSE con retención 10%.' })
    else if (!planillaMes.length) v.push({ tipo: 'info', texto: 'No hay planilla cerrada para este mes. Si pagaste sueldos, cerrala en Empleados → Planilla → "Cerrar planilla" para que entre al anexo de renta (códigos 01/60).' })
    else v.push({ tipo: 'info', texto: `Anexo renta F-14: ${decl.anexoRenta.totales.empleados} empleado(s) de la planilla cerrada + ${decl.anexoRenta.totales.excluidos} FSE con retención 10%. El portal exige el nombre como "Apellidos, Nombres" en mayúsculas: revisá los nombres de los empleados.` })
    const sinDui = decl.anexoRenta.filas.filter(r => !r[3] && !r[4])
    if (sinDui.length) v.push({ tipo: 'error', texto: `${sinDui.length} fila(s) del anexo de renta sin DUI ni NIT (obligatorio). Completá el DUI del empleado o del sujeto excluido.` })
    v.push({ tipo: 'info', texto: 'Estos archivos son un borrador: validalos en el portal del MH antes de presentar. Incluyen CCF, consumidor final, NC/ND, sujetos excluidos, retención 1% IVA, exportación y retenciones de renta (F-14).' })
    return v
  }, [decl, planillasError, planillaMes])

  const selectDef = (valor, onChange, opciones) => (
    <select className="input" value={valor} onChange={e => onChange(e.target.value)} style={{ padding: '6px 8px', fontSize: 13 }}>
      {opciones.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
    </select>
  )

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#0891b2' }}>🧮</span> Contadores
        </h1>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13.5 }}>
          Genera los archivos CSV para el portal del MH (F07 IVA + F14 Pago a Cuenta y Retenciones de renta) del período seleccionado.
        </p>
      </div>

      {/* Selector de período */}
      <div className="card" style={{ padding: 16, borderRadius: 14, display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <label className="form-label" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Mes</label>
          <select className="input" value={mes} onChange={e => setPeriodo(p => ({ ...p, mes: Number(e.target.value) }))}>
            {MESES.map((nm, i) => <option key={i} value={i + 1}>{nm}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Año</label>
          <select className="input" value={anio} onChange={e => setPeriodo(p => ({ ...p, anio: Number(e.target.value) }))}>
            {[anio + 1, anio, anio - 1, anio - 2].filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => b - a).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)' }}>
          {cargando ? 'Cargando DTE…' : `${decl.ventasCCF.length} CCF · ${decl.ventasFE.length} consumidor · ${decl.comprasPeriodo.length} compra(s) · ${decl.fseExcluidos.length} excluido(s) · ${decl.invalidados.length} anulado(s)`}
        </div>
      </div>

      {/* Resumen F07 / F14 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 8 }}>
        <Casilla n="95" label="Ventas gravadas CCF" valor={decl.f07.ventasGravadasCCF} />
        <Casilla n="96" label="Ventas gravadas Facturas" valor={decl.f07.ventasGravadasFactura} />
        <Casilla n="80" label="Compras gravadas" valor={decl.f07.comprasGravadas} />
        <Casilla n="130" label="Crédito fiscal" valor={decl.f07.creditoFiscal} />
        <Casilla n="66" label="Compras a sujetos excluidos" valor={decl.f07.comprasSujetosExcluidos} />
        <Casilla n="170" label="Retención 1% IVA efectuada" valor={decl.f07.retencion1Efectuada} />
        {decl.f07.exportaciones > 0 && <Casilla n="90/94" label="Exportaciones" valor={decl.f07.exportaciones} />}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Casilla n="150" label="Débito fiscal total" valor={decl.f07.totalDebito} />
        <Casilla n="160/521" label="F07 · IVA a pagar" valor={decl.f07.totalPagar} destacar />
        <Casilla n="26" label="F14 · Ingresos gravables" valor={decl.f14.ingresosServicios} />
        <Casilla n="56" label="F14 · Pago a Cuenta (1.75%)" valor={decl.f14.totalPagar} destacar />
        <Casilla label="F14 · Renta retenida a terceros" valor={decl.f14.retencionesRenta} />
      </div>

      {/* Descargas de anexos */}
      <div className="card" style={{ padding: 16, borderRadius: 14, marginBottom: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Archivos para el portal (pestaña "Por Archivo")</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: 10 }}>
          <button className="btn btn-primary" onClick={() => descargarCSV(`Anexo1_Ventas_${sufijo}.csv`, decl.anexo1.csv)} disabled={!decl.anexo1.filas.length}>
            ⬇ Anexo 1 · Ventas CCF ({decl.anexo1.totales.cantidad})
          </button>
          <button className="btn btn-primary" onClick={() => descargarCSV(`Anexo2_Consumidor_${sufijo}.csv`, decl.anexo2.csv)} disabled={!decl.anexo2.filas.length}>
            ⬇ Anexo 2 · Consumidor ({decl.anexo2.totales.documentos})
          </button>
          <button className="btn btn-primary" onClick={() => descargarCSV(`Anexo3_Compras_${sufijo}.csv`, decl.anexo3.csv)} disabled={!decl.anexo3.filas.length}>
            ⬇ Anexo 3 · Compras ({decl.anexo3.totales.cantidad})
          </button>
          <button className="btn btn-primary" onClick={() => descargarCSV(`Anexo5_SujetosExcluidos_${sufijo}.csv`, decl.anexo5.csv)} disabled={!decl.anexo5.filas.length}>
            ⬇ Anexo 5 · Sujetos Excluidos ({decl.anexo5.totales.cantidad})
          </button>
          <button className="btn btn-primary" onClick={() => descargarCSV(`Anexo10_Retencion1_${sufijo}.csv`, decl.anexo10.csv)} disabled={!decl.anexo10.filas.length}>
            ⬇ Anexo 10 · Retención 1% ({decl.anexo10.totales.cantidad})
          </button>
          <button className="btn btn-ghost" onClick={() => descargarCSV(`Anexos_Anulados_${sufijo}.csv`, decl.anulados.csv)} disabled={!decl.anulados.filas.length}>
            ⬇ Anulados ({decl.anulados.totales.cantidad})
          </button>
          <button className="btn btn-gold" onClick={() => descargarCSV(`F14_RetRenta_${sufijo}.csv`, decl.anexoRenta.csv)} disabled={!decl.anexoRenta.filas.length}
            title="F-14 → pestaña 'Carga y Validación de Archivo de Retenciones'">
            ⬇ F-14 · Retenciones de renta ({decl.anexoRenta.totales.cantidad})
          </button>
        </div>
      </div>

      {/* Clasificaciones editables */}
      <div className="card" style={{ padding: 16, borderRadius: 14, marginBottom: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Clasificaciones (columnas que el DTE no trae)</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Se aplican a todas las filas del período. Revisalas con el contador según el giro.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Ventas · Tipo de Ingreso</label>
            {selectDef(defVentas.tipoIngreso, v => setDefVentas(d => ({ ...d, tipoIngreso: v })), [
              { v: '2', t: '2 · Servicios' }, { v: '3', t: '3 · Comercio' }, { v: '1', t: '1 · Industrial' }, { v: '9', t: '9 · Export. servicios' },
            ])}
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Compras · Clasificación</label>
            {selectDef(defCompras.clasificacion, v => setDefCompras(d => ({ ...d, clasificacion: v })), [
              { v: '1', t: '1 · Costo' }, { v: '2', t: '2 · Gasto' },
            ])}
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Compras · Sector</label>
            {selectDef(defCompras.sector, v => setDefCompras(d => ({ ...d, sector: v })), [
              { v: '1', t: '1 · Industrial' }, { v: '2', t: '2 · Comercial' }, { v: '3', t: '3 · Agropecuario' }, { v: '4', t: '4 · Servicios/Otros' },
            ])}
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Compras · Tipo Costo/Gasto</label>
            {selectDef(defCompras.tipoCostoGasto, v => setDefCompras(d => ({ ...d, tipoCostoGasto: v })), [
              { v: '1', t: '1' }, { v: '2', t: '2' }, { v: '3', t: '3' }, { v: '4', t: '4' }, { v: '5', t: '5 (default)' }, { v: '6', t: '6' }, { v: '7', t: '7' },
            ])}
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Renta F-14 · Clasificación</label>
            {selectDef(defRenta.clasificacion, v => setDefRenta(d => ({ ...d, clasificacion: v })), [
              { v: '2', t: '2 · Gasto' }, { v: '1', t: '1 · Costo' },
            ])}
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Renta F-14 · Sector</label>
            {selectDef(defRenta.sector, v => setDefRenta(d => ({ ...d, sector: v })), [
              { v: '1', t: '1 · Industria' }, { v: '2', t: '2 · Comercio' }, { v: '3', t: '3 · Agropecuaria' }, { v: '4', t: '4 · Servicios/Profesiones' },
            ])}
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Renta F-14 · Tipo Costo/Gasto</label>
            {selectDef(defRenta.tipoCostoGasto, v => setDefRenta(d => ({ ...d, tipoCostoGasto: v })), defRenta.clasificacion === '1'
              ? [{ v: '4', t: '4 · Costo importado' }, { v: '5', t: '5 · Costo interno' }, { v: '6', t: '6 · Costos indirectos' }, { v: '7', t: '7 · Mano de obra' }]
              : [{ v: '1', t: '1 · Gastos de venta' }, { v: '2', t: '2 · Gastos de administración' }, { v: '3', t: '3 · Gastos financieros' }])}
          </div>
        </div>
      </div>

      {/* Checklist de validaciones */}
      <div className="card" style={{ padding: 16, borderRadius: 14, marginBottom: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Verificaciones antes de presentar</div>
        {validaciones.map((x, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', fontSize: 13,
            color: x.tipo === 'error' ? '#dc2626' : x.tipo === 'warning' ? '#d97706' : 'var(--muted)' }}>
            <span>{x.tipo === 'error' ? '⛔' : x.tipo === 'warning' ? '⚠️' : 'ℹ️'}</span>
            <span>{x.texto}</span>
          </div>
        ))}
      </div>

      {/* Vista previa Anexo 1 */}
      {decl.anexo1.filas.length > 0 && (
        <div className="card" style={{ padding: 16, borderRadius: 14, marginBottom: 18, overflowX: 'auto' }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Vista previa · Anexo 1 (Ventas CCF)</div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: 4 }}>Fecha</th><th>Tipo</th><th>NIT/NRC</th><th>Cliente</th>
              <th style={{ textAlign: 'right' }}>Gravada</th><th style={{ textAlign: 'right' }}>Débito</th><th style={{ textAlign: 'right' }}>Total</th>
            </tr></thead>
            <tbody>
              {decl.anexo1.filas.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 4 }}>{r[0]}</td><td>{r[2]}</td><td>{r[7]}</td><td>{r[8]}</td>
                  <td style={{ textAlign: 'right' }}>{r[11]}</td><td style={{ textAlign: 'right' }}>{r[12]}</td><td style={{ textAlign: 'right' }}>{r[15]}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td style={{ padding: 4 }} colSpan={4}>Totales</td>
                <td style={{ textAlign: 'right' }}>{fmt(decl.anexo1.totales.gravada)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(decl.anexo1.totales.debito)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(decl.anexo1.totales.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Vista previa Anexo 2 */}
      {decl.anexo2.filas.length > 0 && (
        <div className="card" style={{ padding: 16, borderRadius: 14, marginBottom: 18, overflowX: 'auto' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Vista previa · Anexo 2 (Consumidor final, resumido por día)</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{decl.anexo2.totales.documentos} FE agrupadas en {decl.anexo2.totales.cantidad} fila(s).</div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: 4 }}>Fecha</th><th>Tipo</th><th>Cód. Gen. Del</th><th>Cód. Gen. Al</th>
              <th style={{ textAlign: 'right' }}>Gravada c/IVA</th><th style={{ textAlign: 'right' }}>Total</th>
            </tr></thead>
            <tbody>
              {decl.anexo2.filas.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 4 }}>{r[0]}</td><td>{r[2]}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r[7]}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r[8]}</td>
                  <td style={{ textAlign: 'right' }}>{r[13]}</td><td style={{ textAlign: 'right' }}>{r[19]}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td style={{ padding: 4 }} colSpan={4}>Totales</td>
                <td style={{ textAlign: 'right' }}>{fmt(decl.anexo2.totales.gravadaConIva)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(decl.anexo2.totales.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Vista previa F-14 · Retenciones de renta */}
      {decl.anexoRenta.filas.length > 0 && (
        <div className="card" style={{ padding: 16, borderRadius: 14, marginBottom: 18, overflowX: 'auto' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Vista previa · F-14 Retenciones de renta (planilla + FSE 10%)</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Resumen por código de ingreso, como lo muestra el portal al cargar el archivo.</div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', whiteSpace: 'nowrap', marginBottom: 14 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: 4 }}>Código</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Sujetos</th>
              <th style={{ textAlign: 'right' }}>Devengado</th><th style={{ textAlign: 'right' }}>Bonos</th><th style={{ textAlign: 'right' }}>Retenido</th>
            </tr></thead>
            <tbody>
              {decl.anexoRenta.porCodigo.map(c => (
                <tr key={c.codigo} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 4, fontFamily: 'monospace' }}>{c.codigo}</td><td>{c.descripcion}</td>
                  <td style={{ textAlign: 'right' }}>{c.cantidad}</td><td style={{ textAlign: 'right' }}>{fmt(c.devengado)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(c.bonos)}</td><td style={{ textAlign: 'right' }}>{fmt(c.retenido)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td style={{ padding: 4 }} colSpan={2}>Totales</td>
                <td style={{ textAlign: 'right' }}>{decl.anexoRenta.totales.cantidad}</td>
                <td style={{ textAlign: 'right' }}>{fmt(decl.anexoRenta.totales.devengado)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(decl.anexoRenta.totales.bonos)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(decl.anexoRenta.totales.retenido)}</td>
              </tr>
            </tbody>
          </table>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: 4 }}>Nombre</th><th>NIT</th><th>DUI</th><th>Cód.</th>
              <th style={{ textAlign: 'right' }}>Devengado</th><th style={{ textAlign: 'right' }}>Bonos</th><th style={{ textAlign: 'right' }}>ISR ret.</th>
              <th style={{ textAlign: 'right' }}>AFP</th><th style={{ textAlign: 'right' }}>ISSS</th>
            </tr></thead>
            <tbody>
              {decl.anexoRenta.filas.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)', color: !r[3] && !r[4] ? '#dc2626' : undefined }}>
                  <td style={{ padding: 4 }}>{r[2]}</td><td style={{ fontFamily: 'monospace' }}>{r[3] || '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r[4] || (r[3] ? '—' : '⛔ falta')}</td><td style={{ fontFamily: 'monospace' }}>{r[5]}</td>
                  <td style={{ textAlign: 'right' }}>{r[6]}</td><td style={{ textAlign: 'right' }}>{r[7]}</td><td style={{ textAlign: 'right' }}>{r[8]}</td>
                  <td style={{ textAlign: 'right' }}>{r[11]}</td><td style={{ textAlign: 'right' }}>{r[12]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Vista previa Anexo 3 */}
      {decl.anexo3.filas.length > 0 && (
        <div className="card" style={{ padding: 16, borderRadius: 14, overflowX: 'auto' }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Vista previa · Anexo 3 (Compras)</div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: 4 }}>Fecha</th><th>Tipo</th><th>NIT/NRC</th><th>Proveedor</th><th>Cód. Gen.</th>
              <th style={{ textAlign: 'right' }}>Gravada</th><th style={{ textAlign: 'right' }}>Crédito</th>
            </tr></thead>
            <tbody>
              {decl.anexo3.filas.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)', color: !r[3] ? '#dc2626' : undefined }}>
                  <td style={{ padding: 4 }}>{r[0]}</td><td>{r[2]}</td><td>{r[4]}</td><td>{r[5]}</td>
                  <td>{r[3] || '⛔ falta código'}</td>
                  <td style={{ textAlign: 'right' }}>{r[9]}</td><td style={{ textAlign: 'right' }}>{r[13]}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td style={{ padding: 4 }} colSpan={5}>Totales</td>
                <td style={{ textAlign: 'right' }}>{fmt(decl.anexo3.totales.gravada)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(decl.anexo3.totales.credito)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
