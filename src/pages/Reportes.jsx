import { useState, useEffect, useMemo } from 'react'
import { db } from '../firebase'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'
import { orionAlert } from '../orionDialog'
import { imprimirIframe } from '../utils/imprimir'
import { calcularCaja } from '../utils/caja'
import { esAnulada, esDevolucion, saldoFactura } from '../utils/devoluciones'
import { escuchar, escucharVentanas, enValores, unirPorId, inicioDelMes, MESES_VISIBLES } from '../utils/consultas'
import * as XLSX from 'xlsx'

// ══════════════════════════════════════════════════════════════════
// REPORTES (todos los planes; permiso ver_reportes)
// Centro de reportes con pestañas y un filtro común (período, cajero y
// sucursal):
//   Resumen  · cifras clave del negocio
//   Ventas   · por día, hora y día de la semana, vendedor, pago, documento,
//              categoría, descuentos, anulaciones, productos y clientes
//   Ingresos · de dónde entra el dinero: contado por medio de pago, cobros
//              de crédito y otros ingresos de caja
//   Caja     · cierres (con la diferencia recalculada), faltantes y sobrantes
//              por cajero, movimientos de efectivo y aperturas de gaveta
//   Utilidad · ganancia bruta por producto, categoría y día (Etapa 2)
//   Inventario · valor del inventario, agotados, bajo mínimo, sin movimiento
//              y clasificación ABC 80/20 (Etapa 2)
//   Clientes · mejores, nuevos, recurrentes, frecuencia, los que dejaron de
//              comprar y cuentas por cobrar por cliente (Etapa 3)
//   Vendedores · ventas y comisión, comandas y cotizaciones por vendedor (Etapa 3)
//   Compras  · por proveedor, IVA crédito fiscal, cuentas por pagar y productos
//              más comprados; solo con permiso ver_compras (Etapa 3)
// Solo lectura: todo se calcula en el navegador con las colecciones existentes.
// Costo: desde 2026-09-14 cada ítem vendido guarda `costo` (real). Para ventas
// anteriores se ESTIMA con el costo actual del producto, solo si el ítem es la
// unidad base (sin presentación), y se marca como estimado.
// ══════════════════════════════════════════════════════════════════

const COLOR = '#7c3aed'
const VERDE = '#12a06b'
const ROJO = '#dc2626'

// Nota de crédito y Evento de Retorno restan; el resto suma.
const signo = (tipoDte) => (tipoDte === 'NC' || tipoDte === 'Retorno' ? -1 : 1)
const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const n2 = (v) => Math.round((Number(v) || 0) * 100) / 100

// ── Fechas en hora de El Salvador ──
const TZ = 'America/El_Salvador'
const fechaSV = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const horaSV = (d) => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hour12: false }).format(d)) % 24
const DOW = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
const diaSemanaSV = (d) => DOW[new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d)] ?? 0
const hoySV = () => fechaSV(new Date())
const fechaDeVenta = (v) => (v.createdAt?.toDate ? fechaSV(v.createdAt.toDate()) : String(v.fechaEmision || '').slice(0, 10))
const fechaDeTs = (ts) => (ts?.toDate ? fechaSV(ts.toDate()) : '')
const fechaDeISO = (iso) => { try { return iso ? fechaSV(new Date(iso)) : '' } catch { return '' } }
const horaDeISO = (iso) => { try { return iso ? new Date(iso).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }) : '' } catch { return '' } }

const aFecha = (s) => new Date(s + 'T12:00:00Z')
const aStr = (dt) => dt.toISOString().slice(0, 10)
const sumarDias = (s, n) => { const d = aFecha(s); d.setUTCDate(d.getUTCDate() + n); return aStr(d) }
const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 86400000)
const limpiarDoc = (d) => String(d || '').replace(/[^0-9A-Za-z]/g, '')
const variacion = (act, ant) => (ant ? ((act - ant) / Math.abs(ant)) * 100 : null)

const LABEL_PAGO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', cheque: 'Cheque', mixto: 'Pago mixto', credito: 'Crédito' }
const esCredito = (v) => v.tipoPago === 'credito' || v.formaPago === 'credito'
const labelPago = (v) => (esCredito(v) ? 'Crédito' : (LABEL_PAGO[v.formaPago] || v.formaPago || 'Otro'))
const LABEL_DTE = { FE: 'Factura (FE)', CCF: 'Créd. Fiscal (CCF)', NC: 'Nota de Crédito', ND: 'Nota de Débito', FEX: 'Exportación (FEX)', FSE: 'Sujeto Excluido' }
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const PESTANAS = [
  { id: 'resumen', label: 'Resumen', icon: '📊' },
  { id: 'ventas', label: 'Ventas', icon: '🛒' },
  { id: 'ingresos', label: 'Ingresos', icon: '💵' },
  { id: 'caja', label: 'Caja', icon: '💰' },
  { id: 'utilidad', label: 'Utilidad', icon: '📈' },
  { id: 'inventario', label: 'Inventario', icon: '📦' },
  { id: 'clientes', label: 'Clientes', icon: '👥' },
  { id: 'vendedores', label: 'Vendedores', icon: '🧑‍💼' },
  { id: 'compras', label: 'Compras', icon: '🧾' },
]

const rangoRapido = (clave) => {
  const hoy = new Date()
  const y = hoy.getFullYear(), m = hoy.getMonth()
  if (clave === 'hoy') return { desde: hoySV(), hasta: hoySV() }
  if (clave === 'semana') {
    const d = new Date(hoy); d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return { desde: fechaSV(d), hasta: hoySV() }
  }
  if (clave === 'mes') return { desde: fechaSV(new Date(y, m, 1)), hasta: hoySV() }
  if (clave === 'mesAnterior') return { desde: fechaSV(new Date(y, m - 1, 1)), hasta: fechaSV(new Date(y, m, 0)) }
  return { desde: hoySV(), hasta: hoySV() }
}

// ══ Componentes presentacionales ══

const GraficaBarras = ({ series, alto = 170, color = COLOR, dinero = true, minAncho = 16 }) => {
  if (!series.length || series.every(d => !d.valor)) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos en el período.</div>
  const max = Math.max(...series.map(d => d.valor), 1)
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: Math.max(260, series.length * minAncho), height: alto, display: 'flex', alignItems: 'flex-end', gap: 3, padding: '6px 2px 0' }}>
        {series.map((d, i) => (
          <div key={i} title={`${d.titulo || d.label}: ${dinero ? '$' + fmt(d.valor) : d.valor}`} style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', minWidth: 10 }}>
            <div style={{ width: '100%', maxWidth: 26, height: `${Math.max(d.valor ? 2 : 0, (d.valor / max) * 100)}%`, background: color, borderRadius: '4px 4px 0 0', opacity: 0.85 }} />
            <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4, whiteSpace: 'nowrap' }}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const BadgeVar = ({ pct, invertir = false }) => {
  if (pct === null || pct === undefined) return <span style={{ fontSize: 11, color: 'var(--muted)' }}>sin base previa</span>
  const bueno = invertir ? pct <= 0 : pct >= 0
  return <span style={{ fontSize: 11, fontWeight: 700, color: bueno ? VERDE : ROJO }}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>
}

const Kpi = ({ label, valor, sub, dinero = true, valorColor }) => (
  <div className="card" style={{ padding: '14px 16px', borderRadius: 14, minWidth: 0 }}>
    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 21, fontWeight: 800, marginTop: 6, fontVariantNumeric: 'tabular-nums', color: valorColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dinero ? `$${fmt(valor)}` : valor}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
  </div>
)

const Tarjeta = ({ titulo, extra, children, style }) => (
  <div className="card" style={{ padding: 16, borderRadius: 14, overflowX: 'auto', ...style }}>
    {(titulo || extra) && (
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {titulo && <h3 style={{ margin: 0, fontSize: 15 }}>{titulo}</h3>}
        {extra && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{extra}</span>}
      </div>
    )}
    {children}
  </div>
)

// Tabla genérica: cols = [{ t, align, w, render(fila) }]
// `ancho` = ancho mínimo de la tabla antes de desplazarse de lado (solo tablas con muchas columnas).
const Tabla = ({ cols, filas, vacio = 'Sin datos en el período.', max, pie, notaMax, ancho = 0 }) => {
  if (!filas.length) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>{vacio}</div>
  const visibles = max ? filas.slice(0, max) : filas
  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: ancho }}>
        <thead>
          <tr style={{ color: 'var(--muted)', borderBottom: '1.5px solid var(--border)' }}>
            {cols.map((c, i) => <th key={i} style={{ padding: '6px 5px', textAlign: c.align || 'left', width: c.w, fontWeight: 700, fontSize: 12 }}>{c.t}</th>)}
          </tr>
        </thead>
        <tbody>
          {visibles.map((f, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              {cols.map((c, j) => <td key={j} style={{ padding: '7px 5px', textAlign: c.align || 'left', fontVariantNumeric: 'tabular-nums' }}>{c.render(f, i)}</td>)}
            </tr>
          ))}
          {pie && <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 800 }}>{pie.map((p, j) => <td key={j} style={{ padding: '8px 5px', textAlign: cols[j]?.align || 'left', fontVariantNumeric: 'tabular-nums' }}>{p}</td>)}</tr>}
        </tbody>
      </table>
      {max && filas.length > max && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>{notaMax || `Mostrando ${max} de ${filas.length}. Exportá a Excel para ver todo.`}</div>}
    </>
  )
}

const colsConcepto = (colValor = 'Total') => [
  { t: 'Concepto', render: x => <strong>{x.label}</strong> },
  { t: 'N.º', align: 'right', render: x => <span style={{ color: 'var(--muted)' }}>{x.num}</span> },
  { t: colValor, align: 'right', render: x => <strong>${fmt(x.total)}</strong> },
]

// Barra horizontal apilada con la proporción de cada tipo de ingreso
const BarraProporcion = ({ partes }) => {
  const total = partes.reduce((s, p) => s + Math.max(0, p.monto), 0)
  if (!total) return null
  return (
    <div style={{ display: 'flex', height: 14, borderRadius: 99, overflow: 'hidden', background: 'var(--surface2)', marginBottom: 14 }}>
      {partes.filter(p => p.monto > 0).map(p => (
        <div key={p.k} title={`${p.label}: $${fmt(p.monto)}`} style={{ width: `${(p.monto / total) * 100}%`, background: p.color }} />
      ))}
    </div>
  )
}

const estiloTabs = `
  .rep-tabs { display: flex; gap: 2px; padding: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 16px; overflow-x: auto; scrollbar-width: none; }
  .rep-tabs::-webkit-scrollbar { display: none; }
  .rep-tab { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: 9px; border: none; background: transparent; cursor: pointer; font-family: inherit; font-size: 13.5px; font-weight: 600; color: var(--text2); white-space: nowrap; flex-shrink: 0; }
  .rep-tab:hover { background: var(--surface2); }
  .rep-tab.on { background: color-mix(in srgb, ${COLOR} 14%, transparent); color: ${COLOR}; font-weight: 800; }
  .rep-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 18px; margin-bottom: 18px; }
  .rep-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 12px; margin-bottom: 16px; }
  @media (max-width: 480px) { .rep-kpis { grid-template-columns: 1fr 1fr; gap: 8px; } }
  .rep-filtros select { padding: 7px 10px; }
  @media (max-width: 768px) { .rep-grid { grid-template-columns: 1fr; } .rep-tab { padding: 8px 12px; font-size: 13px; } }
`

const colorMargen = (m) => (m < 0 ? ROJO : m < 10 ? '#d97706' : VERDE)
const Aviso = ({ children, tono = 'azul' }) => {
  const c = tono === 'ambar' ? ['rgba(245,158,11,0.09)', 'rgba(245,158,11,0.3)'] : ['rgba(37,99,235,0.07)', 'rgba(37,99,235,0.25)']
  return <div style={{ background: c[0], border: `1.5px solid ${c[1]}`, borderRadius: 12, padding: '10px 14px', fontSize: 12.5, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.5 }}>{children}</div>
}

export default function Reportes() {
  const { empresaId, esAdmin, rol, userId, puede } = usePermisos()
  const puedeCompras = esAdmin || puede('ver_compras')
  const puedeCotizaciones = esAdmin || puede('ver_cotizaciones')
  const [ventas, setVentas] = useState([])
  const [facturas, setFacturas] = useState([])
  const [cajas, setCajas] = useState([])
  const [productos, setProductos] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [clientesDb, setClientesDb] = useState([])
  const [compras, setCompras] = useState([])
  const [cotizaciones, setCotizaciones] = useState([])
  const [comandas, setComandas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [{ desde, hasta }, setRango] = useState(rangoRapido('mes'))
  const [filtroCajero, setFiltroCajero] = useState('')
  const [filtroSucursal, setFiltroSucursal] = useState('')
  const [diasSinMov, setDiasSinMov] = useState(60) // Inventario: "sin movimiento" = sin ventas en estos días
  const [diasInactivo, setDiasInactivo] = useState(45) // Clientes: "dejaron de comprar" = sin compras en estos días
  const [comisionPct, setComisionPct] = useState(() => { try { return Number(localStorage.getItem('orion_reportes_comision')) || 0 } catch { return 0 } })
  const [tabGuardada, setTab] = useState(() => { try { return localStorage.getItem('orion_reportes_tab') || 'resumen' } catch { return 'resumen' } })
  const pestanas = PESTANAS.filter(p => p.id !== 'compras' || puedeCompras)
  const tab = pestanas.some(p => p.id === tabGuardada) ? tabGuardada : 'resumen'
  const cambiarTab = (t) => { setTab(t); try { localStorage.setItem('orion_reportes_tab', t) } catch { /* sin storage */ } }

  const soloPropias = !esAdmin && (rol === 'cajero' || rol === 'vendedor')

  // ── Qué se lee ──
  // No todo el historial (Firestore cobra cada documento leído): los últimos MESES_VISIBLES meses
  // siempre, y un rango anterior SOLO si el período elegido (o su comparativa) cae antes de eso.
  const ventanas = useMemo(() => {
    const b = inicioDelMes(MESES_VISIBLES - 1)
    const baseStr = `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, '0')}-01`
    const lista = [[baseStr, null]]
    const dias = desde && hasta && hasta >= desde ? diasEntre(desde, hasta) + 1 : 0
    const pedidoDesde = desde ? sumarDias(desde, -dias) : baseStr
    if (pedidoDesde < baseStr) {
      const antesDeBase = sumarDias(baseStr, -1)
      lista.push([pedidoDesde, hasta && hasta < antesDeBase ? hasta : antesDeBase])
    }
    return JSON.stringify(lista)
  }, [desde, hasta])

  // ── Carga (cajero/vendedor: solo lo suyo) ──
  // Catálogos (pocos documentos, no crecen con las ventas)
  useEffect(() => {
    if (!empresaId) return
    const deEmpresa = (col) => query(collection(db, col), where('empresaId', '==', empresaId))
    const docs = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }))
    const u1 = onSnapshot(deEmpresa('cajas'), s => setCajas(docs(s)), () => {})
    const u2 = onSnapshot(deEmpresa('productos'), s => setProductos(docs(s)), () => {})
    const u3 = onSnapshot(deEmpresa('sucursales'), s => setSucursales(docs(s)), () => {})
    const u4 = onSnapshot(deEmpresa('clientes'), s => setClientesDb(docs(s)), () => {})
    return () => { u1(); u2(); u3(); u4() }
  }, [empresaId])

  // Movimientos: las ventanas de fechas + lo pendiente de cualquier fecha
  useEffect(() => {
    if (!empresaId) return
    const pares = JSON.parse(ventanas)
    // Campos string 'YYYY-MM-DD' y campos Timestamp usan la misma ventana en su propio formato
    const vStr = pares.map(([d, h]) => ({ desde: d, hasta: h ? h + '' : undefined }))
    const vFecha = pares.map(([d, h]) => ({ desde: new Date(d + 'T00:00:00'), hasta: h ? new Date(h + 'T23:59:59.999') : undefined }))
    const cajeroId = soloPropias ? userId : undefined
    const de = (filtro, propio = true) => ({ empresaId, cajeroId: propio ? cajeroId : undefined, filtro })
    const por = (campo, vs, propio = true) => ({ empresaId, cajeroId: propio ? cajeroId : undefined, campo, ventanas: vs })
    const u1 = escucharVentanas('ventas', por('createdAt', vFecha), d => { setVentas(d); setCargando(false) }, () => setCargando(false))
    // Facturas: emitidas en el rango + crédito pendiente (de cualquier fecha) + cobradas en el rango
    let fEmitidas = [], fPendientes = [], fCobradas = []
    const unirF = () => setFacturas(unirPorId(fEmitidas, fPendientes, fCobradas))
    const u2 = escucharVentanas('facturas', por('fechaEmision', vStr), d => { fEmitidas = d; unirF() })
    const u3 = escuchar('facturas', de(enValores('estadoPago', ['pendiente', 'vencida'])), d => { fPendientes = d; unirF() })
    const u4 = escucharVentanas('facturas', por('fechaPago', vStr), d => { fCobradas = d; unirF() })
    const u5 = escucharVentanas('comandas', por('createdAt', vFecha), setComandas)
    // Compras y cotizaciones solo si las reglas lo permiten (si no, la consulta falla)
    let cRango = [], cPendientes = []
    const unirC = () => setCompras(unirPorId(cRango, cPendientes))
    const u6 = puedeCompras ? escucharVentanas('compras', por('fechaCompra', vStr, false), d => { cRango = d; unirC() }, () => {}) : null
    const u7 = puedeCompras ? escuchar('compras', de(enValores('estadoPago', ['pendiente']), false), d => { cPendientes = d; unirC() }, () => {}) : null
    const u8 = puedeCotizaciones ? escucharVentanas('cotizaciones', por('createdAt', vFecha, false), setCotizaciones, () => setCotizaciones([])) : null
    return () => { u1(); u2(); u3(); u4(); u5(); u6?.(); u7?.(); u8?.() }
  }, [empresaId, soloPropias, userId, puedeCompras, puedeCotizaciones, ventanas])

  // ── Opciones de filtro ──
  const cajeros = useMemo(() => {
    const m = new Map()
    ventas.forEach(v => { const k = v.cajeroId || v.cajero; if (k) m.set(k, v.cajero || k) })
    cajas.forEach(c => { if (c.cajeroId) m.set(c.cajeroId, c.cajeroNombre || m.get(c.cajeroId) || c.cajeroId) })
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [ventas, cajas])

  const pasaCajero = (id, nombre) => !filtroCajero || id === filtroCajero || (!id && nombre === filtroCajero)
  const pasaSucursal = (sid) => !filtroSucursal || sid === filtroSucursal
  const catDeProducto = useMemo(() => Object.fromEntries(productos.map(p => [p.id, p.categoria || ''])), [productos])

  // Ventas que pasan cajero/sucursal (sin fecha): base de comparativa y de caja
  const ventasBase = useMemo(() => ventas.filter(v => pasaCajero(v.cajeroId, v.cajero) && pasaSucursal(v.sucursalId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ventas, filtroCajero, filtroSucursal])
  const enRango = (f) => f && f >= desde && f <= hasta
  const delPeriodo = useMemo(() => ventasBase.filter(v => !esAnulada(v) && enRango(fechaDeVenta(v))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ventasBase, desde, hasta])
  const facturasBase = useMemo(() => facturas.filter(f => pasaCajero(f.cajeroId, f.cajero) && pasaSucursal(f.sucursalId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facturas, filtroCajero, filtroSucursal])
  const cajasBase = useMemo(() => cajas.filter(c => (!soloPropias || c.cajeroId === userId) && pasaCajero(c.cajeroId, c.cajeroNombre)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cajas, soloPropias, userId, filtroCajero])

  // ══ VENTAS ══
  const datos = useMemo(() => {
    const resumen = { total: 0, subtotal: 0, iva: 0, ivaRete: 0, num: 0 }
    const porPago = {}, porTipo = {}, porVendedor = {}, porProducto = {}, porCliente = {}, porDia = {}, porCategoria = {}
    const porHora = Array.from({ length: 24 }, () => 0)
    const porDow = Array.from({ length: 7 }, () => 0)
    const descuentos = { total: 0, ventas: 0 }
    const sumar = (obj, k, total) => { obj[k] = obj[k] || { label: k, total: 0, num: 0 }; obj[k].total += total; obj[k].num += 1 }

    for (const v of delPeriodo) {
      const s = signo(v.tipoDte)
      const total = (Number(v.total) || 0) * s
      resumen.total += total
      resumen.subtotal += (Number(v.subtotal) || 0) * s
      resumen.iva += (Number(v.iva) || 0) * s
      resumen.ivaRete += (Number(v.ivaRete) || 0) * s
      resumen.num += 1
      sumar(porPago, labelPago(v), total)
      sumar(porTipo, LABEL_DTE[v.tipoDte] || v.tipoDte || 'Otro', total)
      sumar(porVendedor, v.cajero || 'Sin asignar', total)
      sumar(porCliente, v.cliente || 'Consumidor Final', total)
      const kf = fechaDeVenta(v)
      if (kf) { porDia[kf] = (porDia[kf] || 0) + total }
      const d = v.createdAt?.toDate?.()
      if (d) { porHora[horaSV(d)] += total; porDow[diaSemanaSV(d)] += total }

      let conDescuento = false
      const categoriasVenta = new Set()
      for (const it of (v.items || [])) {
        const qty = Number(it.qty) || 0
        const clave = (it.codigo || it.nombre || '—').toString()
        porProducto[clave] = porProducto[clave] || { codigo: it.codigo || '', nombre: it.nombre || '—', qty: 0, monto: 0 }
        porProducto[clave].qty += qty * s
        porProducto[clave].monto += (Number(it.subtotal) || 0) * s
        const cat = it.categoria || catDeProducto[it.id] || 'Sin categoría'
        porCategoria[cat] = porCategoria[cat] || { label: cat, total: 0, num: 0 }
        porCategoria[cat].total += (Number(it.subtotal) || 0) * s
        if (!categoriasVenta.has(cat)) { porCategoria[cat].num += 1; categoriasVenta.add(cat) }
        const desc = ((Number(it.precioOriginal) || 0) - (Number(it.precioBase) || 0)) * qty
        if (desc > 0.004 && s > 0) { descuentos.total += desc; conDescuento = true }
      }
      if (conDescuento) descuentos.ventas += 1
    }

    const ordenar = (obj) => Object.values(obj).sort((a, b) => b.total - a.total)
    const horasConDatos = porHora.map((v, h) => ({ h, v })).filter(x => x.v)
    const hMin = horasConDatos.length ? Math.min(...horasConDatos.map(x => x.h)) : 7
    const hMax = horasConDatos.length ? Math.max(...horasConDatos.map(x => x.h)) : 18
    const horaPico = horasConDatos.length ? horasConDatos.reduce((a, b) => (b.v > a.v ? b : a)) : null
    return {
      resumen,
      ticket: resumen.num ? resumen.total / resumen.num : 0,
      porPago: ordenar(porPago), porTipo: ordenar(porTipo), porVendedor: ordenar(porVendedor),
      clientes: ordenar(porCliente), categorias: ordenar(porCategoria),
      serieDia: Object.entries(porDia).sort((a, b) => a[0].localeCompare(b[0])).map(([f, valor]) => ({ label: f.slice(8, 10), titulo: f, valor })),
      serieHora: Array.from({ length: hMax - hMin + 1 }, (_, i) => ({ label: `${hMin + i}h`, titulo: `${hMin + i}:00 a ${hMin + i}:59`, valor: porHora[hMin + i] })),
      serieDow: DIAS.map((d, i) => ({ label: d, valor: porDow[i] })),
      horaPico, diaPico: porDow.some(Boolean) ? DIAS[porDow.indexOf(Math.max(...porDow))] : null,
      descuentos,
      productos: Object.values(porProducto).sort((a, b) => b.qty - a.qty),
    }
  }, [delPeriodo, catDeProducto])

  const comparativa = useMemo(() => {
    if (!desde || !hasta || hasta < desde) return null
    const dias = diasEntre(desde, hasta) + 1
    const pHasta = sumarDias(desde, -1)
    const pDesde = sumarDias(pHasta, -(dias - 1))
    let total = 0, num = 0
    for (const v of ventasBase) {
      if (esAnulada(v)) continue
      const f = fechaDeVenta(v)
      if (!f || f < pDesde || f > pHasta) continue
      total += (Number(v.total) || 0) * signo(v.tipoDte); num += 1
    }
    return { desde: pDesde, hasta: pHasta, total, num }
  }, [ventasBase, desde, hasta])

  // Anulaciones / invalidaciones del período (de facturas)
  const anuladas = useMemo(() => facturasBase
    .filter(f => (f.estadoPago === 'anulada' || f.anulada === true || f.dte_estado_invalidacion === 'INVALIDADO') && enRango(String(f.fechaEmision || '').slice(0, 10)))
    .map(f => ({ numero: f.numero || f.numeroControl || '', tipo: f.tipoDte || '', cliente: f.cliente || '', fecha: String(f.fechaEmision || '').slice(0, 10), cajero: f.cajero || '', monto: Number(f.total) || 0 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facturasBase, desde, hasta])

  // Crédito por cobrar (estado ACTUAL) — la verdad del estado de pago vive en `facturas`
  const credito = useMemo(() => {
    const hoy = hoySV()
    const filas = facturasBase
      .filter(f => f.tipoPago === 'credito' && !['pagada', 'anulada'].includes(f.estadoPago) && !f.anulada && saldoFactura(f) > 0.009)
      .map(f => {
        const venc = f.fechaVencimiento || ''
        return { cliente: f.cliente || 'Consumidor Final', numero: f.numero || '', fecha: String(f.fechaEmision || '').slice(0, 10), vencimiento: venc, diasVencido: venc && venc < hoy ? diasEntre(venc, hoy) : 0, monto: saldoFactura(f) }
      })
      .sort((a, b) => (a.vencimiento || '9999').localeCompare(b.vencimiento || '9999'))
    const tramo = (d) => (d <= 0 ? 'Al día' : d <= 30 ? '1 a 30 días' : d <= 60 ? '31 a 60 días' : d <= 90 ? '61 a 90 días' : 'Más de 90 días')
    const antiguedad = ['Al día', '1 a 30 días', '31 a 60 días', '61 a 90 días', 'Más de 90 días'].map(t => {
      const fs = filas.filter(f => tramo(f.diasVencido) === t)
      return { label: t, num: fs.length, total: fs.reduce((s, f) => s + f.monto, 0) }
    })
    return { filas, antiguedad, total: filas.reduce((s, f) => s + f.monto, 0), vencido: filas.reduce((s, f) => s + (f.diasVencido > 0 ? f.monto : 0), 0) }
  }, [facturasBase])

  // ══ INGRESOS (tipos de ingreso) ══
  const ingresos = useMemo(() => {
    const medios = { efectivo: { num: 0, monto: 0 }, tarjeta: { num: 0, monto: 0 }, transferencia: { num: 0, monto: 0 }, cheque: { num: 0, monto: 0 } }
    const porDia = {}
    const alDia = (f, m) => { if (f) porDia[f] = (porDia[f] || 0) + m }
    const creditoVendido = { num: 0, monto: 0 }

    for (const v of delPeriodo) {
      // Las devoluciones se cuentan abajo por el medio en que REALMENTE se devolvió el dinero
      if (esDevolucion(v)) continue
      const s = signo(v.tipoDte)
      const cobrado = (Number(v.totalPagar ?? v.total) || 0) * s
      if (esCredito(v)) { creditoVendido.num += 1; creditoVendido.monto += cobrado; continue }
      const f = fechaDeVenta(v)
      if (v.formaPago === 'mixto' && Array.isArray(v.pagosDesglose)) {
        v.pagosDesglose.forEach(p => {
          if (!medios[p.metodo]) return
          const m = (Number(p.monto) || 0) * s
          medios[p.metodo].num += 1; medios[p.metodo].monto += m; alDia(f, m)
        })
      } else {
        const k = medios[v.formaPago] ? v.formaPago : 'efectivo'
        medios[k].num += 1; medios[k].monto += cobrado; alDia(f, cobrado)
      }
    }

    // Cobros de crédito: facturas a crédito cobradas DENTRO del período (por fecha de cobro)
    const cobros = facturasBase
      .filter(f => f.tipoPago === 'credito' && f.estadoPago === 'pagada' && enRango(f.fechaPago))
      .map(f => ({ cliente: f.cliente || 'Consumidor Final', numero: f.numero || '', fechaVenta: String(f.fechaEmision || '').slice(0, 10), fechaPago: f.fechaPago, cobradoPor: f.cobradoPor || '', monto: Number(f.totalPagar ?? f.total) || 0 }))
      .sort((a, b) => a.fechaPago.localeCompare(b.fechaPago))
    cobros.forEach(c => alDia(c.fechaPago, c.monto))

    // Otros ingresos de caja (movimientos de efectivo tipo ingreso)
    const otros = []
    cajasBase.forEach(c => (c.movimientosEfectivo || []).forEach(m => {
      if (m.tipo !== 'ingreso') return
      const f = fechaDeISO(m.fecha)
      if (!enRango(f)) return
      otros.push({ fecha: f, hora: horaDeISO(m.fecha), usuario: m.usuario || c.cajeroNombre || '', motivo: m.motivo || 'Sin motivo', monto: Number(m.monto) || 0 })
      alDia(f, Number(m.monto) || 0)
    }))
    const otrosPorMotivo = Object.values(otros.reduce((acc, o) => { acc[o.motivo] = acc[o.motivo] || { label: o.motivo, num: 0, total: 0 }; acc[o.motivo].num += 1; acc[o.motivo].total += o.monto; return acc }, {})).sort((a, b) => b.total - a.total)

    // Dinero devuelto por NC / Evento de Retorno (registrado con "¿Cómo devolviste el dinero?").
    // Un abono a la cuenta o "sin dinero" no sale de ningún lado. Las anuladas ya no suman arriba.
    const devoluciones = facturasBase
      .filter(f => esDevolucion(f) && f.devolucion && ['efectivo', 'tarjeta', 'transferencia'].includes(f.devolucion.medio) && enRango(fechaDeISO(f.devolucion.fecha)))
      .map(f => ({ fecha: fechaDeISO(f.devolucion.fecha), cliente: f.cliente || 'Consumidor Final', numero: f.numeroControl || f.numero || '', medio: f.devolucion.medio, monto: Number(f.devolucion.monto) || 0 }))
    devoluciones.forEach(d => alDia(d.fecha, -d.monto))

    const tipos = [
      { k: 'efectivo', label: '💵 Ventas en efectivo', color: '#12a06b', ...medios.efectivo },
      { k: 'tarjeta', label: '💳 Ventas con tarjeta', color: '#4f8cff', ...medios.tarjeta },
      { k: 'transferencia', label: '🏦 Ventas por transferencia', color: '#8b5cf6', ...medios.transferencia },
      { k: 'cheque', label: '📝 Ventas con cheque', color: '#f59e0b', ...medios.cheque },
      { k: 'cobros', label: '📅 Cobros de crédito', color: '#0891b2', num: cobros.length, monto: cobros.reduce((s, c) => s + c.monto, 0) },
      { k: 'otros', label: '➕ Otros ingresos de caja', color: '#ec4899', num: otros.length, monto: otros.reduce((s, o) => s + o.monto, 0) },
      ...(devoluciones.length ? [{ k: 'devoluciones', label: '↩️ Devoluciones de dinero', color: '#dc2626', num: devoluciones.length, monto: -devoluciones.reduce((s, d) => s + d.monto, 0) }] : []),
    ]
    const total = tipos.reduce((s, t) => s + t.monto, 0)
    return {
      tipos, total, cobros, otros, otrosPorMotivo, creditoVendido,
      serieDia: Object.entries(porDia).sort((a, b) => a[0].localeCompare(b[0])).map(([f, valor]) => ({ label: f.slice(8, 10), titulo: f, valor })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delPeriodo, facturasBase, cajasBase, desde, hasta])

  // ══ CAJA ══
  const caja = useMemo(() => {
    const filas = cajasBase
      .filter(c => enRango(fechaDeTs(c.fechaApertura)))
      .sort((a, b) => (b.fechaApertura?.seconds || 0) - (a.fechaApertura?.seconds || 0))
      .map(c => {
        const calc = calcularCaja(c, ventas)
        const cerrada = c.estado === 'cerrada'
        const contado = cerrada ? Number(c.montoReal) || 0 : null
        const difRegistrada = cerrada ? (c.diferencia ?? ((Number(c.montoReal) || 0) - (Number(c.montoEsperado) || 0))) : null
        const difReal = cerrada ? contado - calc.montoEsperado : null
        return {
          id: c.id, fecha: fechaDeTs(c.fechaApertura), cajero: c.cajeroNombre || '—', turno: c.turno || '', estado: c.estado,
          inicial: Number(c.montoInicial) || 0, efectivo: calc.efectivo, ingresos: calc.ingresos, salidas: calc.totalRetiros,
          esperado: calc.montoEsperado, contado, diferencia: difReal, difRegistrada,
          corregida: cerrada && Math.abs((difReal || 0) - (difRegistrada || 0)) > 0.009,
        }
      })
    const cerradas = filas.filter(f => f.estado === 'cerrada')
    const porCajero = Object.values(cerradas.reduce((acc, f) => {
      acc[f.cajero] = acc[f.cajero] || { cajero: f.cajero, cierres: 0, faltantes: 0, sobrantes: 0, neto: 0, conFaltante: 0 }
      const a = acc[f.cajero]; a.cierres += 1; a.neto += f.diferencia
      if (f.diferencia < -0.009) { a.faltantes += -f.diferencia; a.conFaltante += 1 } else if (f.diferencia > 0.009) a.sobrantes += f.diferencia
      return acc
    }, {})).sort((a, b) => b.faltantes - a.faltantes)

    // Movimientos de efectivo (incluye retiros del formato viejo) por fecha propia
    const movs = []
    cajasBase.forEach(c => {
      ;(c.movimientosEfectivo || []).forEach(m => movs.push({ ...m, cajero: c.cajeroNombre }))
      ;(c.retiros || []).forEach(r => movs.push({ tipo: 'salida', monto: r.monto, motivo: r.motivo, fecha: r.fecha, usuario: r.cajero, cajero: c.cajeroNombre, origen: 'caja' }))
    })
    const movPeriodo = movs.filter(m => enRango(fechaDeISO(m.fecha)))
      .map(m => ({ fecha: fechaDeISO(m.fecha), hora: horaDeISO(m.fecha), tipo: m.tipo, motivo: m.motivo || 'Sin motivo', usuario: m.usuario || m.cajero || '', origen: m.origen === 'gaveta' ? 'Gaveta' : 'Caja', monto: Number(m.monto) || 0, ts: m.fecha }))
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
    const movPorMotivo = Object.values(movPeriodo.reduce((acc, m) => {
      const k = m.tipo + '|' + m.motivo
      acc[k] = acc[k] || { tipo: m.tipo, motivo: m.motivo, num: 0, total: 0 }
      acc[k].num += 1; acc[k].total += m.monto
      return acc
    }, {})).sort((a, b) => b.total - a.total)

    // Aperturas de gaveta sin venta
    const aperturas = []
    cajasBase.forEach(c => (c.aperturasGaveta || []).forEach(a => {
      const f = fechaDeISO(a.fecha)
      if (!enRango(f)) return
      aperturas.push({ fecha: f, hora: horaDeISO(a.fecha), usuario: a.usuario || c.cajeroNombre || '', motivo: a.motivo || '', tipo: a.tipo || 'solo', monto: Number(a.monto) || 0, ts: a.fecha })
    }))
    aperturas.sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
    const aperturasPorUsuario = Object.values(aperturas.reduce((acc, a) => {
      acc[a.usuario] = acc[a.usuario] || { usuario: a.usuario, total: 0, conDinero: 0, sinMotivo: 0 }
      const x = acc[a.usuario]; x.total += 1
      if (a.tipo !== 'solo' && a.monto > 0) x.conDinero += 1
      if (!a.motivo) x.sinMotivo += 1
      return acc
    }, {})).sort((a, b) => b.total - a.total)

    return {
      filas, cerradas, porCajero, movPeriodo, movPorMotivo, aperturas, aperturasPorUsuario,
      abiertas: filas.filter(f => f.estado === 'abierta').length,
      faltantes: porCajero.reduce((s, x) => s + x.faltantes, 0),
      sobrantes: porCajero.reduce((s, x) => s + x.sobrantes, 0),
      neto: cerradas.reduce((s, f) => s + f.diferencia, 0),
      salidas: movPeriodo.filter(m => m.tipo === 'salida').reduce((s, m) => s + m.monto, 0),
      entradas: movPeriodo.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0),
      hayCorregidas: cerradas.some(f => f.corregida),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cajasBase, ventas, desde, hasta])

  // ══ UTILIDAD ══
  // Costo actual del producto (neto): última compra o el importado con foto.
  const productoPorId = useMemo(() => Object.fromEntries(productos.map(p => [p.id, p])), [productos])
  const costoActualDe = (p) => Number(p?.precioCompra) || Number(p?.costo) || 0
  // Costo unitario de un ítem vendido. Ventas anteriores al costo por ítem: se estima con el costo
  // actual, solo si el ítem es la unidad base (una caja de 100 no cuesta lo de 1 unidad).
  const costoDeItem = (it) => {
    const real = Number(it.costo) || 0
    if (real) return { costoUnit: real, estimado: false }
    const prod = productoPorId[it.id]
    if (prod && (!it.factor || it.factor === 1) && (it.nombre || '') === (prod.nombre || '')) {
      const c = costoActualDe(prod)
      return { costoUnit: c, estimado: c > 0 }
    }
    return { costoUnit: 0, estimado: false }
  }

  const utilidad = useMemo(() => {
    const tot = { venta: 0, ventaConCosto: 0, costo: 0, estimado: 0 }
    const porProducto = {}, porCategoria = {}, porDia = {}
    const sinCosto = {}
    for (const v of delPeriodo) {
      const s = signo(v.tipoDte)
      const fecha = fechaDeVenta(v)
      for (const it of (v.items || [])) {
        const qty = Number(it.qty) || 0
        const venta = (Number(it.subtotal) || 0) * s
        tot.venta += venta
        const prod = productoPorId[it.id]
        const { costoUnit, estimado: esEstimado } = costoDeItem(it)
        const clave = (it.codigo || it.nombre || '—').toString()
        if (!costoUnit) {
          sinCosto[clave] = sinCosto[clave] || { codigo: it.codigo || '', nombre: it.nombre || '—', qty: 0, venta: 0 }
          sinCosto[clave].qty += qty * s; sinCosto[clave].venta += venta
          continue
        }
        const costo = costoUnit * qty * s
        tot.ventaConCosto += venta; tot.costo += costo
        if (esEstimado) tot.estimado += venta
        const g = porProducto[clave] = porProducto[clave] || { codigo: it.codigo || '', nombre: it.nombre || '—', qty: 0, venta: 0, costo: 0, estimado: false }
        g.qty += qty * s; g.venta += venta; g.costo += costo; if (esEstimado) g.estimado = true
        const cat = it.categoria || prod?.categoria || 'Sin categoría'
        const c = porCategoria[cat] = porCategoria[cat] || { label: cat, venta: 0, costo: 0 }
        c.venta += venta; c.costo += costo
        if (fecha) porDia[fecha] = (porDia[fecha] || 0) + (venta - costo)
      }
    }
    const conUtil = (x) => ({ ...x, utilidad: x.venta - x.costo, margen: x.venta ? ((x.venta - x.costo) / x.venta) * 100 : 0 })
    const productosU = Object.values(porProducto).map(conUtil).sort((a, b) => b.utilidad - a.utilidad)
    return {
      ...tot,
      utilidad: tot.ventaConCosto - tot.costo,
      margen: tot.ventaConCosto ? ((tot.ventaConCosto - tot.costo) / tot.ventaConCosto) * 100 : 0,
      cobertura: tot.venta ? (tot.ventaConCosto / tot.venta) * 100 : 0,
      productos: productosU,
      bajoCosto: productosU.filter(p => p.utilidad < -0.004).sort((a, b) => a.utilidad - b.utilidad),
      margenBajo: productosU.filter(p => p.utilidad >= -0.004 && p.margen < 10),
      categorias: Object.values(porCategoria).map(conUtil).sort((a, b) => b.utilidad - a.utilidad),
      sinCosto: Object.values(sinCosto).sort((a, b) => b.venta - a.venta),
      serieDia: Object.entries(porDia).sort((a, b) => a[0].localeCompare(b[0])).map(([fch, valor]) => ({ label: fch.slice(8, 10), titulo: fch, valor })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delPeriodo, productoPorId])

  // ══ INVENTARIO ══ (estado actual; el período solo cuenta para la clasificación ABC)
  const inventario = useMemo(() => {
    const hoy = hoySV()
    // Última venta de cada producto (todo el historial, no solo el período)
    const ultima = {}
    for (const v of ventasBase) {
      if (esAnulada(v)) continue
      const f = fechaDeVenta(v)
      for (const it of (v.items || [])) {
        const k = it.id || it.codigo
        if (k && (!ultima[k] || f > ultima[k])) ultima[k] = f
      }
    }
    // Ventas del período por producto (para ABC)
    const vendido = {}
    for (const v of delPeriodo) {
      const s = signo(v.tipoDte)
      for (const it of (v.items || [])) {
        const k = it.id || it.codigo
        if (k) vendido[k] = (vendido[k] || 0) + (Number(it.subtotal) || 0) * s
      }
    }
    const filas = productos.map(p => {
      const esServicio = String(p.unidad || '').toLowerCase() === 'servicio'
      const stock = Number(p.stock) || 0
      const min = Number(p.min) || 0
      const costoU = costoActualDe(p)
      const ult = ultima[p.id] || ultima[p.codigo] || ''
      return {
        id: p.id, codigo: p.codigo || '', nombre: p.nombre || '—', categoria: p.categoria || 'Sin categoría', unidad: p.unidad || '',
        esServicio, stock, min, costoU,
        valorCosto: esServicio ? 0 : Math.max(0, stock) * costoU,
        valorVenta: esServicio ? 0 : Math.max(0, stock) * (Number(p.precio) || 0) * 1.13,
        ultimaVenta: ult, diasSinVenta: ult ? diasEntre(ult, hoy) : null,
        vendidoPeriodo: vendido[p.id] || vendido[p.codigo] || 0,
      }
    })
    const fisicos = filas.filter(x => !x.esServicio)
    const agotados = fisicos.filter(x => x.stock <= 0).sort((a, b) => b.min - a.min)
    const bajoMinimo = fisicos.filter(x => x.stock > 0 && x.min > 0 && x.stock < x.min).sort((a, b) => (a.stock / a.min) - (b.stock / b.min))
    const sinMovimiento = fisicos.filter(x => x.stock > 0 && (x.diasSinVenta === null || x.diasSinVenta > diasSinMov))
      .sort((a, b) => (b.valorCosto - a.valorCosto) || ((b.diasSinVenta ?? 99999) - (a.diasSinVenta ?? 99999)))

    // ABC 80/20 con lo vendido en el período
    const vendidos = filas.filter(x => x.vendidoPeriodo > 0).sort((a, b) => b.vendidoPeriodo - a.vendidoPeriodo)
    const totalVendido = vendidos.reduce((s, x) => s + x.vendidoPeriodo, 0)
    let acum = 0
    const abc = vendidos.map(x => {
      const antes = acum; acum += x.vendidoPeriodo
      const clase = totalVendido && antes / totalVendido < 0.8 ? 'A' : totalVendido && antes / totalVendido < 0.95 ? 'B' : 'C'
      return { ...x, clase, pct: totalVendido ? (x.vendidoPeriodo / totalVendido) * 100 : 0 }
    })
    const resumenAbc = ['A', 'B', 'C'].map(c => {
      const fs2 = abc.filter(x => x.clase === c)
      return { clase: c, productos: fs2.length, monto: fs2.reduce((s, x) => s + x.vendidoPeriodo, 0) }
    })

    const porCategoria = Object.values(fisicos.reduce((acc, x) => {
      const c = acc[x.categoria] = acc[x.categoria] || { label: x.categoria, productos: 0, unidades: 0, valorCosto: 0, valorVenta: 0 }
      c.productos += 1; c.unidades += Math.max(0, x.stock); c.valorCosto += x.valorCosto; c.valorVenta += x.valorVenta
      return acc
    }, {})).sort((a, b) => b.valorCosto - a.valorCosto)

    return {
      filas, agotados, bajoMinimo, sinMovimiento, abc, resumenAbc, porCategoria,
      productos: fisicos.length,
      sinCostoCount: fisicos.filter(x => !x.costoU && x.stock > 0).length,
      valorCosto: fisicos.reduce((s, x) => s + x.valorCosto, 0),
      valorVenta: fisicos.reduce((s, x) => s + x.valorVenta, 0),
      capitalDetenido: sinMovimiento.reduce((s, x) => s + x.valorCosto, 0),
      sinVendidos: fisicos.filter(x => x.vendidoPeriodo <= 0).length,
    }
  }, [productos, ventasBase, delPeriodo, diasSinMov])

  // ══ CLIENTES ══ (historial completo para frecuencia e inactividad; el período para ranking)
  const clientesRep = useMemo(() => {
    const hoy = hoySV()
    const porId = Object.fromEntries(clientesDb.map(c => [c.id, c]))
    const porDoc = {}
    clientesDb.forEach(c => { [c.nit, c.dui].forEach(d => { const k = limpiarDoc(d); if (k) porDoc[k] = c }) })
    const esCF = (c) => c && (c.esConsumidorFinal || String(c.nombre || '').trim().toUpperCase() === 'VARIOS')

    // Identifica al cliente de una venta: id guardado → NIT/DUI → nombre. null = consumidor final.
    const identificar = (v) => {
      let c = v.clienteId ? porId[v.clienteId] : null
      const d = limpiarDoc(v.nit) || limpiarDoc(v.dui)
      if (!c && d) c = porDoc[d]
      if (esCF(c)) return null
      if (c) return { clave: 'id:' + c.id, nombre: c.nombre || v.cliente || '—', doc: c.nit || c.dui || '', mayorista: c.mayorista === true, telefono: c.telefono || '' }
      const n = String(v.cliente || '').trim()
      if (d) return { clave: 'doc:' + d, nombre: n || d, doc: v.nit || v.dui || '', mayorista: false, telefono: '' }
      if (!n || ['consumidor final', 'varios', 'clientes varios'].includes(n.toLowerCase())) return null
      return { clave: 'nom:' + n.toLowerCase(), nombre: n, doc: '', mayorista: false, telefono: '' }
    }

    const mapa = {}
    const cf = { num: 0, monto: 0 }
    const tipoCliente = { mayoreo: { label: 'Mayoristas', num: 0, total: 0 }, detalle: { label: 'Clientes registrados (detalle)', num: 0, total: 0 }, cf: { label: 'Consumidor final', num: 0, total: 0 } }
    for (const v of ventasBase) {
      if (esAnulada(v)) continue
      const f = fechaDeVenta(v)
      if (!f) continue
      const s = signo(v.tipoDte)
      const monto = (Number(v.total) || 0) * s
      const enPer = enRango(f)
      const id = identificar(v)
      if (!id) {
        if (enPer) { cf.monto += monto; if (s > 0) cf.num += 1; tipoCliente.cf.total += monto; if (s > 0) tipoCliente.cf.num += 1 }
        continue
      }
      const g = mapa[id.clave] = mapa[id.clave] || { ...id, compras: 0, monto: 0, primera: f, ultima: f, fechas: new Set(), comprasPer: 0, montoPer: 0 }
      g.monto += monto
      if (s > 0) { g.compras += 1; g.fechas.add(f); if (f < g.primera) g.primera = f; if (f > g.ultima) g.ultima = f }
      if (enPer) {
        g.montoPer += monto; if (s > 0) g.comprasPer += 1
        const t = id.mayorista ? tipoCliente.mayoreo : tipoCliente.detalle
        t.total += monto; if (s > 0) t.num += 1
      }
    }
    const lista = Object.values(mapa).map(g => {
      const dias = [...g.fechas].sort()
      const frecuencia = dias.length >= 2 ? diasEntre(dias[0], dias[dias.length - 1]) / (dias.length - 1) : null
      const diasSinComprar = diasEntre(g.ultima, hoy)
      return { ...g, fechas: undefined, frecuencia, diasSinComprar, nuevo: enRango(g.primera), ticket: g.comprasPer ? g.montoPer / g.comprasPer : 0 }
    })
    const conCompra = lista.filter(g => g.comprasPer > 0).sort((a, b) => b.montoPer - a.montoPer)
    const inactivos = lista.filter(g => g.compras > 0 && g.diasSinComprar > diasInactivo).sort((a, b) => b.monto - a.monto)
    // Atrasados: compran seguido (frecuencia conocida) y ya pasaron el doble de su costumbre, sin llegar a inactivos
    const atrasados = lista.filter(g => g.frecuencia && g.frecuencia >= 1 && g.diasSinComprar > Math.max(7, g.frecuencia * 2) && g.diasSinComprar <= diasInactivo)
      .sort((a, b) => (b.diasSinComprar / b.frecuencia) - (a.diasSinComprar / a.frecuencia))

    const cobrar = {}
    for (const f of credito.filas) {
      const c = cobrar[f.cliente] = cobrar[f.cliente] || { cliente: f.cliente, facturas: 0, monto: 0, vencido: 0, maxDias: 0 }
      c.facturas += 1; c.monto += f.monto
      if (f.diasVencido > 0) { c.vencido += f.monto; c.maxDias = Math.max(c.maxDias, f.diasVencido) }
    }
    const conCompras = new Set(lista.filter(g => g.clave.startsWith('id:')).map(g => g.clave.slice(3)))
    const totalPer = conCompra.reduce((s, g) => s + g.montoPer, 0) + cf.monto
    return {
      conCompra, inactivos, atrasados, cf, totalPer,
      nuevos: conCompra.filter(g => g.nuevo).length,
      recurrentes: conCompra.filter(g => g.comprasPer >= 2).length,
      tipos: Object.values(tipoCliente).filter(t => t.num || t.total),
      porCobrar: Object.values(cobrar).sort((a, b) => b.monto - a.monto),
      registrados: clientesDb.filter(c => !esCF(c)).length,
      nuncaCompraron: clientesDb.filter(c => !esCF(c) && !conCompras.has(c.id)).length,
      montoInactivos: inactivos.reduce((s, g) => s + g.monto, 0),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventasBase, clientesDb, credito, desde, hasta, diasInactivo])

  // ══ VENDEDORES ══ (vendedor = quien armó la comanda; si no, quien vendió)
  const vendedoresRep = useMemo(() => {
    const hoy = hoySV()
    const ventasV = {}
    const convertidas = { num: 0, monto: 0 }
    for (const v of delPeriodo) {
      const s = signo(v.tipoDte)
      const clave = v.vendedorId || v.cajeroId || v.vendedor || v.cajero || '—'
      const g = ventasV[clave] = ventasV[clave] || { vendedor: v.vendedor || v.cajero || 'Sin asignar', ventas: 0, neto: 0, total: 0, costo: 0, ventaConCosto: 0, deComanda: 0 }
      if (s > 0) g.ventas += 1
      g.neto += (Number(v.subtotal) || 0) * s
      g.total += (Number(v.total) || 0) * s
      if (v.comandaId && s > 0) g.deComanda += 1
      for (const it of (v.items || [])) {
        const { costoUnit } = costoDeItem(it)
        if (!costoUnit) continue
        g.costo += costoUnit * (Number(it.qty) || 0) * s
        g.ventaConCosto += (Number(it.subtotal) || 0) * s
      }
      if (v.cotizacionId && s > 0) { convertidas.num += 1; convertidas.monto += Number(v.total) || 0 }
    }
    const ventas = Object.values(ventasV).map(g => ({
      ...g, ticket: g.ventas ? g.total / g.ventas : 0,
      utilidad: g.ventaConCosto ? g.ventaConCosto - g.costo : null,
      comision: g.neto * (comisionPct / 100),
    })).sort((a, b) => b.neto - a.neto)

    // Comandas (vales) armadas en el período
    const comV = {}
    for (const c of comandas) {
      if (!enRango(fechaDeTs(c.createdAt))) continue
      const clave = c.vendedorId || c.vendedor || '—'
      const g = comV[clave] = comV[clave] || { vendedor: c.vendedor || 'Sin asignar', armadas: 0, cobradas: 0, canceladas: 0, pendientes: 0, montoCobrado: 0, montoArmado: 0 }
      g.armadas += 1; g.montoArmado += Number(c.total) || 0
      if (c.estado === 'cobrada' || c.estado === 'entregada') { g.cobradas += 1; g.montoCobrado += Number(c.total) || 0 }
      else if (c.estado === 'cancelada') g.canceladas += 1
      else g.pendientes += 1
    }
    const comandasV = Object.values(comV).map(g => ({ ...g, pctCobro: g.armadas ? (g.cobradas / g.armadas) * 100 : 0 })).sort((a, b) => b.montoCobrado - a.montoCobrado)

    // Cotizaciones emitidas en el período (los borradores no cuentan)
    const cotV = {}
    for (const c of cotizaciones) {
      if (c.estado === 'borrador') continue
      if (soloPropias && c.vendedorId !== userId) continue
      if (!enRango(c.fechaEmision || fechaDeTs(c.createdAt))) continue
      const clave = c.vendedorId || c.vendedor || '—'
      const g = cotV[clave] = cotV[clave] || { vendedor: c.vendedor || 'Sin registrar (anteriores)', emitidas: 0, aceptadas: 0, rechazadas: 0, vencidas: 0, montoCotizado: 0, montoAceptado: 0 }
      g.emitidas += 1; g.montoCotizado += Number(c.total) || 0
      if (c.estado === 'aceptada') { g.aceptadas += 1; g.montoAceptado += Number(c.total) || 0 }
      else if (c.estado === 'rechazada') g.rechazadas += 1
      else if (c.fechaVencimiento && c.fechaVencimiento < hoy) g.vencidas += 1
    }
    const cotizacionesV = Object.values(cotV).map(g => ({ ...g, conversion: g.emitidas ? (g.aceptadas / g.emitidas) * 100 : 0 })).sort((a, b) => b.montoAceptado - a.montoAceptado)
    const sum = (arr, k) => arr.reduce((s, x) => s + x[k], 0)
    const cotEmitidas = sum(cotizacionesV, 'emitidas'), cotAceptadas = sum(cotizacionesV, 'aceptadas')
    const comArmadas = sum(comandasV, 'armadas'), comCobradas = sum(comandasV, 'cobradas')
    return {
      ventas, comandas: comandasV, cotizaciones: cotizacionesV, convertidas,
      comisionTotal: sum(ventas, 'comision'),
      comArmadas, comCobradas, comPendientes: sum(comandasV, 'pendientes'),
      cotEmitidas, cotAceptadas, conversion: cotEmitidas ? (cotAceptadas / cotEmitidas) * 100 : 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delPeriodo, comandas, cotizaciones, comisionPct, productoPorId, soloPropias, userId, desde, hasta])

  // ══ COMPRAS ══ (período por fecha de compra; cuentas por pagar = estado actual)
  const comprasRep = useMemo(() => {
    const hoy = hoySV()
    const fechaCompra = (c) => String(c.fechaCompra || '').slice(0, 10) || fechaDeTs(c.createdAt)
    const per = compras.filter(c => c.estado !== 'anulada' && enRango(fechaCompra(c)))
    const tot = { num: per.length, subtotal: 0, iva: 0, total: 0, ivaCredito: 0, contado: 0, credito: 0 }
    const prov = {}, porDia = {}, prods = {}, porTipo = {}
    for (const c of per) {
      const subtotal = Number(c.subtotal) || 0, iva = Number(c.iva) || 0, total = Number(c.total) || 0
      tot.subtotal += subtotal; tot.iva += iva; tot.total += total
      if (c.tipoDteProveedor === 'CCF') tot.ivaCredito += iva
      if (c.condicionPago === 'credito') tot.credito += total; else tot.contado += total
      const kp = limpiarDoc(c.proveedorNit) || String(c.proveedorNombre || '—').trim().toLowerCase()
      const p = prov[kp] = prov[kp] || { proveedor: c.proveedorNombre || '—', nit: c.proveedorNit || '', num: 0, subtotal: 0, iva: 0, total: 0, ultima: '' }
      p.num += 1; p.subtotal += subtotal; p.iva += iva; p.total += total
      if (fechaCompra(c) > p.ultima) p.ultima = fechaCompra(c)
      const f = fechaCompra(c); porDia[f] = (porDia[f] || 0) + total
      const tipo = c.tipoDteProveedor || 'Otro'
      porTipo[tipo] = porTipo[tipo] || { label: tipo, num: 0, total: 0 }
      porTipo[tipo].num += 1; porTipo[tipo].total += total
      for (const it of (c.items || [])) {
        const base = (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0)
        const monto = base - base * ((Number(it.descuento) || 0) / 100)
        const k = it.productoId || it.productoNombre || '—'
        const g = prods[k] = prods[k] || { nombre: it.productoNombre || '—', codigo: it.codigoProducto || '', unidades: 0, unidad: it.unidadBase || it.unidad || '', monto: 0, compras: 0, ultimoCosto: 0, ultimaFecha: '' }
        const factor = Number(it.factorUnidad) || 1
        g.unidades += (Number(it.cantidad) || 0) * factor; g.monto += monto; g.compras += 1
        if (f >= g.ultimaFecha) { g.ultimaFecha = f; g.ultimoCosto = factor ? (Number(it.precioUnitario) || 0) / (it.modoPrecio === 'base' ? 1 : factor) : 0 }
      }
    }
    const porPagar = compras.filter(c => c.estadoPago === 'pendiente' && c.estado !== 'anulada').map(c => {
      const venc = c.fechaVencimiento || ''
      return { proveedor: c.proveedorNombre || '—', numero: c.numeroDteProveedor || c.numero || '', fecha: fechaCompra(c), vencimiento: venc, diasVencido: venc && venc < hoy ? diasEntre(venc, hoy) : 0, monto: Number(c.total) || 0 }
    }).sort((a, b) => (a.vencimiento || '9999').localeCompare(b.vencimiento || '9999'))
    const tramo = (d) => (d <= 0 ? 'Al día' : d <= 30 ? '1 a 30 días' : d <= 60 ? '31 a 60 días' : d <= 90 ? '61 a 90 días' : 'Más de 90 días')
    const antiguedad = ['Al día', '1 a 30 días', '31 a 60 días', '61 a 90 días', 'Más de 90 días'].map(t => {
      const fs2 = porPagar.filter(f => tramo(f.diasVencido) === t)
      return { label: t, num: fs2.length, total: fs2.reduce((s, f) => s + f.monto, 0) }
    })
    const provArr = Object.values(prov).sort((a, b) => b.total - a.total)
    return {
      ...tot, proveedores: provArr,
      productos: Object.values(prods).sort((a, b) => b.monto - a.monto),
      tipos: Object.values(porTipo).sort((a, b) => b.total - a.total),
      serieDia: Object.entries(porDia).sort((a, b) => a[0].localeCompare(b[0])).map(([fch, valor]) => ({ label: fch.slice(8, 10), titulo: fch, valor })),
      porPagar, antiguedad,
      totalPorPagar: porPagar.reduce((s, f) => s + f.monto, 0),
      vencidoPorPagar: porPagar.reduce((s, f) => s + (f.diasVencido > 0 ? f.monto : 0), 0),
      principal: provArr[0] && tot.total ? { ...provArr[0], pct: (provArr[0].total / tot.total) * 100 } : null,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compras, desde, hasta])

  const hayDatos = delPeriodo.length > 0 || caja.filas.length > 0 || ingresos.cobros.length > 0 || ingresos.otros.length > 0 || productos.length > 0

  // ══ EXPORTAR A EXCEL ══
  const exportarExcel = () => {
    if (!hayDatos) { orionAlert('No hay datos en el período seleccionado.', { tipo: 'warning' }); return }
    const r = datos.resumen
    const wb = XLSX.utils.book_new()
    const FMT_MONEDA = '"$"#,##0.00'
    const nuevaHoja = (nombre, aoa, cols, filaEncabezado = 0) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = cols.map(c => ({ wch: c.w }))
      const rango = XLSX.utils.decode_range(ws['!ref'])
      cols.forEach((c, ci) => {
        if (!c.money) return
        for (let fila = filaEncabezado + 1; fila <= rango.e.r; fila++) {
          const celda = ws[XLSX.utils.encode_cell({ r: fila, c: ci })]
          if (celda && typeof celda.v === 'number') celda.z = FMT_MONEDA
        }
      })
      XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31))
    }
    const hoja = (nombre, filas, cols) => { if (filas.length) nuevaHoja(nombre, [cols.map(c => c.t), ...filas], cols) }

    nuevaHoja('Resumen', [
      ['REPORTE DEL NEGOCIO', ''],
      ['Período', `${desde} a ${hasta}`],
      ['Cajero', filtroCajero ? (cajeros.find(c => c.id === filtroCajero)?.nombre || filtroCajero) : 'Todos'],
      ['', ''],
      ['Ventas netas', n2(r.total)], ['Gravado (neto sin IVA)', n2(r.subtotal)], ['IVA', n2(r.iva)], ['Retención IVA 1%', n2(r.ivaRete)],
      ['N.º de ventas', r.num], ['Ticket promedio', n2(datos.ticket)], ['Descuentos otorgados (neto)', n2(datos.descuentos.total)],
      ['Total de ingresos', n2(ingresos.total)], ['Ventas a crédito (por cobrar)', n2(ingresos.creditoVendido.monto)],
      ['Crédito por cobrar (actual)', n2(credito.total)], ['Diferencia neta de caja', n2(caja.neto)],
      ['Utilidad bruta (ventas con costo)', n2(utilidad.utilidad)], ['Margen bruto %', n2(utilidad.margen)], ['Cobertura de costo %', n2(utilidad.cobertura)],
      ['Inventario a costo (actual)', n2(inventario.valorCosto)], ['Inventario a precio de venta (actual)', n2(inventario.valorVenta)],
    ], [{ w: 30 }, { w: 20, money: true }], 3)

    hoja('Ingresos por tipo', ingresos.tipos.map(t => [t.label.replace(/^\S+\s/, ''), t.num, n2(t.monto), ingresos.total ? n2((t.monto / ingresos.total) * 100) : 0]),
      [{ t: 'Tipo de ingreso', w: 28 }, { t: 'N.º', w: 8 }, { t: 'Monto', w: 16, money: true }, { t: '% del total', w: 12 }])
    hoja('Cobros de credito', ingresos.cobros.map(c => [c.fechaPago, c.cliente, c.numero, c.fechaVenta, c.cobradoPor, n2(c.monto)]),
      [{ t: 'Fecha de cobro', w: 14 }, { t: 'Cliente', w: 30 }, { t: 'Documento', w: 30 }, { t: 'Fecha de venta', w: 14 }, { t: 'Cobró', w: 20 }, { t: 'Monto', w: 14, money: true }])
    hoja('Otros ingresos', ingresos.otros.map(o => [o.fecha, o.hora, o.usuario, o.motivo, n2(o.monto)]),
      [{ t: 'Fecha', w: 12 }, { t: 'Hora', w: 10 }, { t: 'Usuario', w: 22 }, { t: 'Motivo', w: 30 }, { t: 'Monto', w: 14, money: true }])
    hoja('Cierres de caja', caja.filas.map(f => [f.fecha, f.cajero, f.turno, f.estado, n2(f.inicial), n2(f.efectivo), n2(f.ingresos), n2(f.salidas), n2(f.esperado), f.contado === null ? '' : n2(f.contado), f.diferencia === null ? '' : n2(f.diferencia), f.corregida ? n2(f.difRegistrada) : '']),
      [{ t: 'Fecha', w: 12 }, { t: 'Cajero', w: 22 }, { t: 'Turno', w: 10 }, { t: 'Estado', w: 10 }, { t: 'Inicial', w: 12, money: true }, { t: 'Ventas efectivo', w: 14, money: true }, { t: 'Ingresos', w: 12, money: true }, { t: 'Salidas', w: 12, money: true }, { t: 'Esperado', w: 12, money: true }, { t: 'Contado', w: 12, money: true }, { t: 'Diferencia', w: 12, money: true }, { t: 'Diferencia registrada', w: 20, money: true }])
    hoja('Diferencias por cajero', caja.porCajero.map(x => [x.cajero, x.cierres, x.conFaltante, n2(x.faltantes), n2(x.sobrantes), n2(x.neto)]),
      [{ t: 'Cajero', w: 24 }, { t: 'Cierres', w: 10 }, { t: 'Con faltante', w: 12 }, { t: 'Faltantes', w: 14, money: true }, { t: 'Sobrantes', w: 14, money: true }, { t: 'Neto', w: 14, money: true }])
    hoja('Movimientos de efectivo', caja.movPeriodo.map(m => [m.fecha, m.hora, m.usuario, m.tipo === 'ingreso' ? 'Entrada' : 'Salida', m.motivo, m.origen, n2(m.tipo === 'ingreso' ? m.monto : -m.monto)]),
      [{ t: 'Fecha', w: 12 }, { t: 'Hora', w: 10 }, { t: 'Usuario', w: 22 }, { t: 'Tipo', w: 10 }, { t: 'Motivo', w: 30 }, { t: 'Desde', w: 10 }, { t: 'Monto', w: 14, money: true }])
    hoja('Aperturas de gaveta', caja.aperturas.map(a => [a.fecha, a.hora, a.usuario, a.tipo === 'salida' ? 'Salió dinero' : a.tipo === 'ingreso' ? 'Entró dinero' : 'Solo abrir', a.motivo, a.monto ? n2(a.monto) : '']),
      [{ t: 'Fecha', w: 12 }, { t: 'Hora', w: 10 }, { t: 'Usuario', w: 22 }, { t: 'Qué pasó', w: 14 }, { t: 'Motivo', w: 30 }, { t: 'Monto', w: 12, money: true }])
    hoja('Por vendedor', datos.porVendedor.map(x => [x.label, x.num, n2(x.total)]), [{ t: 'Vendedor/Cajero', w: 28 }, { t: 'N.º ventas', w: 12 }, { t: 'Total', w: 16, money: true }])
    hoja('Por forma de pago', datos.porPago.map(x => [x.label, x.num, n2(x.total)]), [{ t: 'Forma de pago', w: 20 }, { t: 'N.º ventas', w: 12 }, { t: 'Total', w: 16, money: true }])
    hoja('Por tipo', datos.porTipo.map(x => [x.label, x.num, n2(x.total)]), [{ t: 'Tipo de documento', w: 22 }, { t: 'N.º ventas', w: 12 }, { t: 'Total', w: 16, money: true }])
    hoja('Por categoria', datos.categorias.map(x => [x.label, x.num, n2(x.total)]), [{ t: 'Categoría', w: 26 }, { t: 'Ventas con la categoría', w: 20 }, { t: 'Monto (neto)', w: 16, money: true }])
    hoja('Por hora', datos.serieHora.map(x => [x.titulo, n2(x.valor)]), [{ t: 'Hora', w: 16 }, { t: 'Ventas', w: 16, money: true }])
    hoja('Por dia de semana', datos.serieDow.map(x => [x.label, n2(x.valor)]), [{ t: 'Día', w: 10 }, { t: 'Ventas', w: 16, money: true }])
    hoja('Productos', datos.productos.map(x => [x.codigo, x.nombre, n2(x.qty), n2(x.monto)]), [{ t: 'Código', w: 14 }, { t: 'Producto', w: 40 }, { t: 'Cantidad', w: 12 }, { t: 'Monto (neto)', w: 16, money: true }])
    hoja('Clientes', datos.clientes.map(x => [x.label, x.num, n2(x.total)]), [{ t: 'Cliente', w: 32 }, { t: 'N.º ventas', w: 12 }, { t: 'Total', w: 16, money: true }])
    hoja('Anulaciones', anuladas.map(a => [a.fecha, a.tipo, a.numero, a.cliente, a.cajero, n2(a.monto)]), [{ t: 'Fecha', w: 12 }, { t: 'Tipo', w: 8 }, { t: 'Documento', w: 30 }, { t: 'Cliente', w: 28 }, { t: 'Cajero', w: 20 }, { t: 'Monto', w: 14, money: true }])
    hoja('Credito por cobrar', credito.filas.map(c => [c.cliente, c.numero, c.fecha, c.vencimiento, c.diasVencido || '', n2(c.monto)]), [{ t: 'Cliente', w: 30 }, { t: 'Documento', w: 30 }, { t: 'Fecha', w: 12 }, { t: 'Vence', w: 12 }, { t: 'Días vencido', w: 12 }, { t: 'Monto', w: 16, money: true }])
    hoja('Detalle de ventas', delPeriodo.slice().sort((a, b) => fechaDeVenta(a).localeCompare(fechaDeVenta(b)))
      .map(v => [fechaDeVenta(v), v.numeroDte || '', v.tipoDte || '', v.cliente || '', v.cajero || '', labelPago(v), n2(v.total)]),
      [{ t: 'Fecha', w: 12 }, { t: 'N.º DTE', w: 30 }, { t: 'Tipo', w: 8 }, { t: 'Cliente', w: 30 }, { t: 'Vendedor', w: 22 }, { t: 'Forma de pago', w: 16 }, { t: 'Total', w: 14, money: true }])

    hoja('Utilidad por producto', utilidad.productos.map(p => [p.codigo, p.nombre, n2(p.qty), n2(p.venta), n2(p.costo), n2(p.utilidad), n2(p.margen), p.estimado ? 'estimado' : 'real']),
      [{ t: 'Código', w: 14 }, { t: 'Producto', w: 38 }, { t: 'Cantidad', w: 10 }, { t: 'Vendido (neto)', w: 14, money: true }, { t: 'Costo', w: 14, money: true }, { t: 'Utilidad', w: 14, money: true }, { t: 'Margen %', w: 10 }, { t: 'Costo', w: 10 }])
    hoja('Utilidad por categoria', utilidad.categorias.map(c => [c.label, n2(c.venta), n2(c.costo), n2(c.utilidad), n2(c.margen)]),
      [{ t: 'Categoría', w: 26 }, { t: 'Vendido (neto)', w: 14, money: true }, { t: 'Costo', w: 14, money: true }, { t: 'Utilidad', w: 14, money: true }, { t: 'Margen %', w: 10 }])
    hoja('Vendido sin costo', utilidad.sinCosto.map(p => [p.codigo, p.nombre, n2(p.qty), n2(p.venta)]),
      [{ t: 'Código', w: 14 }, { t: 'Producto', w: 38 }, { t: 'Cantidad', w: 10 }, { t: 'Vendido (neto)', w: 14, money: true }])
    const claseDe = Object.fromEntries(inventario.abc.map(x => [x.id, x.clase]))
    hoja('Inventario', inventario.filas.filter(x => !x.esServicio).map(x => [x.codigo, x.nombre, x.categoria, n2(x.stock), x.min, x.unidad, x.costoU ? n2(x.costoU) : '', n2(x.valorCosto), n2(x.valorVenta), x.ultimaVenta || 'más de 3 meses', claseDe[x.id] || '']),
      [{ t: 'Código', w: 14 }, { t: 'Producto', w: 36 }, { t: 'Categoría', w: 20 }, { t: 'Stock', w: 10 }, { t: 'Mínimo', w: 9 }, { t: 'Unidad', w: 10 }, { t: 'Costo unit.', w: 12, money: true }, { t: 'Valor a costo', w: 14, money: true }, { t: 'Valor a venta', w: 14, money: true }, { t: 'Última venta', w: 13 }, { t: 'ABC', w: 6 }])
    hoja('Agotados', inventario.agotados.map(x => [x.codigo, x.nombre, x.min, x.ultimaVenta || 'más de 3 meses']),
      [{ t: 'Código', w: 14 }, { t: 'Producto', w: 38 }, { t: 'Mínimo', w: 9 }, { t: 'Última venta', w: 13 }])
    hoja('Bajo minimo', inventario.bajoMinimo.map(x => [x.codigo, x.nombre, n2(x.stock), x.min, n2(x.min - x.stock)]),
      [{ t: 'Código', w: 14 }, { t: 'Producto', w: 38 }, { t: 'Stock', w: 10 }, { t: 'Mínimo', w: 9 }, { t: 'Faltan', w: 9 }])
    hoja(`Sin movimiento ${diasSinMov}d`, inventario.sinMovimiento.map(x => [x.codigo, x.nombre, x.categoria, n2(x.stock), x.ultimaVenta || 'más de 3 meses', x.diasSinVenta ?? '', n2(x.valorCosto)]),
      [{ t: 'Código', w: 14 }, { t: 'Producto', w: 36 }, { t: 'Categoría', w: 20 }, { t: 'Stock', w: 10 }, { t: 'Última venta', w: 13 }, { t: 'Días sin venta', w: 13 }, { t: 'Valor a costo', w: 14, money: true }])

    hoja('Clientes del periodo', clientesRep.conCompra.map(g => [g.nombre, g.doc, g.mayorista ? 'Sí' : '', g.nuevo ? 'Sí' : '', g.comprasPer, n2(g.montoPer), n2(g.ticket), g.frecuencia ? Math.round(g.frecuencia) : '', g.ultima]),
      [{ t: 'Cliente', w: 34 }, { t: 'NIT / DUI', w: 18 }, { t: 'Mayorista', w: 10 }, { t: 'Nuevo', w: 8 }, { t: 'Compras', w: 9 }, { t: 'Monto', w: 14, money: true }, { t: 'Ticket', w: 12, money: true }, { t: 'Compra cada (días)', w: 16 }, { t: 'Última compra', w: 13 }])
    hoja(`Inactivos ${diasInactivo}d`, clientesRep.inactivos.map(g => [g.nombre, g.doc, g.telefono, g.compras, n2(g.monto), g.ultima, g.diasSinComprar]),
      [{ t: 'Cliente', w: 34 }, { t: 'NIT / DUI', w: 18 }, { t: 'Teléfono', w: 14 }, { t: 'Compras (total)', w: 13 }, { t: 'Monto (total)', w: 14, money: true }, { t: 'Última compra', w: 13 }, { t: 'Días sin comprar', w: 14 }])
    hoja('Por cobrar por cliente', clientesRep.porCobrar.map(c => [c.cliente, c.facturas, n2(c.monto), n2(c.vencido), c.maxDias]),
      [{ t: 'Cliente', w: 34 }, { t: 'Facturas', w: 9 }, { t: 'Debe', w: 14, money: true }, { t: 'Vencido', w: 14, money: true }, { t: 'Máx. días vencido', w: 15 }])
    hoja('Vendedores', vendedoresRep.ventas.map(g => [g.vendedor, g.ventas, g.deComanda, n2(g.neto), n2(g.total), n2(g.ticket), g.utilidad === null ? '' : n2(g.utilidad), n2(g.comision)]),
      [{ t: 'Vendedor', w: 24 }, { t: 'Ventas', w: 8 }, { t: 'Desde comanda', w: 13 }, { t: 'Sin IVA', w: 14, money: true }, { t: 'Con IVA', w: 14, money: true }, { t: 'Ticket', w: 12, money: true }, { t: 'Utilidad', w: 14, money: true }, { t: `Comisión ${comisionPct}%`, w: 14, money: true }])
    hoja('Comandas por vendedor', vendedoresRep.comandas.map(g => [g.vendedor, g.armadas, g.cobradas, g.canceladas, g.pendientes, n2(g.pctCobro), n2(g.montoCobrado)]),
      [{ t: 'Vendedor', w: 24 }, { t: 'Armadas', w: 9 }, { t: 'Cobradas', w: 9 }, { t: 'Canceladas', w: 10 }, { t: 'Pendientes', w: 10 }, { t: '% cobro', w: 9 }, { t: 'Cobrado', w: 14, money: true }])
    hoja('Cotizaciones por vendedor', vendedoresRep.cotizaciones.map(g => [g.vendedor, g.emitidas, g.aceptadas, g.rechazadas, g.vencidas, n2(g.conversion), n2(g.montoCotizado), n2(g.montoAceptado)]),
      [{ t: 'Vendedor', w: 26 }, { t: 'Emitidas', w: 9 }, { t: 'Aceptadas', w: 10 }, { t: 'Rechazadas', w: 10 }, { t: 'Vencidas', w: 9 }, { t: '% aceptadas', w: 11 }, { t: 'Cotizado', w: 14, money: true }, { t: 'Aceptado', w: 14, money: true }])
    if (puedeCompras) {
      hoja('Compras por proveedor', comprasRep.proveedores.map(p => [p.proveedor, p.nit, p.num, n2(p.subtotal), n2(p.iva), n2(p.total), p.ultima]),
        [{ t: 'Proveedor', w: 34 }, { t: 'NIT', w: 18 }, { t: 'Compras', w: 9 }, { t: 'Sin IVA', w: 14, money: true }, { t: 'IVA', w: 12, money: true }, { t: 'Total', w: 14, money: true }, { t: 'Última', w: 12 }])
      hoja('Cuentas por pagar', comprasRep.porPagar.map(f => [f.proveedor, f.numero, f.fecha, f.vencimiento, f.diasVencido, n2(f.monto)]),
        [{ t: 'Proveedor', w: 34 }, { t: 'Documento', w: 22 }, { t: 'Fecha', w: 12 }, { t: 'Vence', w: 12 }, { t: 'Días vencido', w: 12 }, { t: 'Monto', w: 14, money: true }])
      hoja('Productos comprados', comprasRep.productos.map(p => [p.codigo, p.nombre, n2(p.unidades), p.unidad, n2(p.monto), n2(p.ultimoCosto)]),
        [{ t: 'Código', w: 14 }, { t: 'Producto', w: 36 }, { t: 'Unidades', w: 10 }, { t: 'Unidad', w: 10 }, { t: 'Monto', w: 14, money: true }, { t: 'Último costo unit.', w: 15, money: true }])
    }

    XLSX.writeFile(wb, `Reporte_${desde}_a_${hasta}.xlsx`)
  }

  // ══ IMPRIMIR / PDF ══
  const imprimirReporte = () => {
    if (!hayDatos) { orionAlert('No hay datos en el período seleccionado.', { tipo: 'warning' }); return }
    const r = datos.resumen
    const kpi = (label, valor) => `<div class="sc"><div class="sv">$${fmt(valor)}</div><div class="sl">${label}</div></div>`
    const tabla = (titulo, cabeceras, filas) => filas.length ? `<div class="tt">${titulo}</div><table><thead><tr>${cabeceras.map(c => `<th class="${c.r ? 'r' : ''}">${c.t}</th>`).join('')}</tr></thead><tbody>${filas.map(f => `<tr>${f.map((v, i) => `<td class="${cabeceras[i].r ? 'r' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''
    const conc = (titulo, filas) => tabla(titulo, [{ t: 'Concepto' }, { t: 'N.º', r: 1 }, { t: 'Total', r: 1 }], filas.map(x => [x.label, x.num, '$' + fmt(x.total)]))
    const cajeroTxt = filtroCajero ? ` · Cajero: ${cajeros.find(c => c.id === filtroCajero)?.nombre || ''}` : ''

    imprimirIframe(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Reporte</title><style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;color:#1a1a2e;font-size:12px;padding:28px}
      .t{font-size:22px;font-weight:900;color:#22345F}.f{font-size:12px;color:#6b7280;margin:2px 0 14px}
      .s{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
      .sc{background:#f6f5fb;border:1px solid #e7e4f2;border-radius:10px;padding:10px;text-align:center}
      .sv{font-size:17px;font-weight:900;color:#22345F;font-family:monospace}.sl{font-size:9px;color:#9ca3af;text-transform:uppercase;margin-top:4px}
      .tt{font-size:13px;font-weight:800;color:#22345F;margin:16px 0 6px}
      table{width:100%;border-collapse:collapse;margin-bottom:6px}thead{background:#22345F;color:#fff}
      th{padding:6px 8px;text-align:left;font-size:10px}td{padding:5px 8px;border-bottom:1px solid #eef0f6;font-size:11px}.r{text-align:right}
      .ft{text-align:center;margin-top:20px;font-size:10px;color:#9ca3af}
      @media print{@page{margin:14mm}}
    </style></head><body>
      <div class="t">Reporte del Negocio</div>
      <div class="f">Período: ${desde} a ${hasta}${cajeroTxt}</div>
      <div class="s">${kpi('Ventas netas', r.total)}${kpi('Ticket promedio', datos.ticket)}${kpi('Total de ingresos', ingresos.total)}${kpi('Crédito por cobrar', credito.total)}</div>
      ${tabla('Ingresos por tipo', [{ t: 'Tipo de ingreso' }, { t: 'N.º', r: 1 }, { t: 'Monto', r: 1 }, { t: '%', r: 1 }], ingresos.tipos.filter(t => t.monto).map(t => [t.label.replace(/^\S+\s/, ''), t.num, '$' + fmt(t.monto), ingresos.total ? ((t.monto / ingresos.total) * 100).toFixed(1) + '%' : '']))}
      ${conc('Ventas por vendedor / cajero', datos.porVendedor)}
      ${conc('Ventas por forma de pago', datos.porPago)}
      ${conc('Ventas por categoría', datos.categorias)}
      ${tabla('Productos más vendidos', [{ t: '#' }, { t: 'Producto' }, { t: 'Cant.', r: 1 }, { t: 'Monto', r: 1 }], datos.productos.slice(0, 20).map((p, i) => [i + 1, p.nombre, fmt(p.qty), '$' + fmt(p.monto)]))}
      ${tabla('Cierres de caja', [{ t: 'Fecha' }, { t: 'Cajero' }, { t: 'Esperado', r: 1 }, { t: 'Contado', r: 1 }, { t: 'Diferencia', r: 1 }], caja.filas.map(f => [f.fecha, f.cajero, '$' + fmt(f.esperado), f.contado === null ? 'abierta' : '$' + fmt(f.contado), f.diferencia === null ? '—' : (f.diferencia >= 0 ? '+' : '') + '$' + fmt(f.diferencia)]))}
      ${tabla('Movimientos de efectivo', [{ t: 'Fecha' }, { t: 'Usuario' }, { t: 'Motivo' }, { t: 'Monto', r: 1 }], caja.movPeriodo.map(m => [`${m.fecha} ${m.hora}`, m.usuario, m.motivo, (m.tipo === 'ingreso' ? '+' : '−') + '$' + fmt(m.monto)]))}
      ${tabla('Ventas por vendedor', [{ t: 'Vendedor' }, { t: 'Ventas', r: 1 }, { t: 'Sin IVA', r: 1 }, { t: comisionPct ? `Comisión ${comisionPct}%` : 'Ticket', r: 1 }], vendedoresRep.ventas.map(g => [g.vendedor, g.ventas, '$' + fmt(g.neto), '$' + fmt(comisionPct ? g.comision : g.ticket)]))}
      ${tabla('Mejores clientes', [{ t: 'Cliente' }, { t: 'Compras', r: 1 }, { t: 'Monto', r: 1 }], clientesRep.conCompra.slice(0, 15).map(g => [g.nombre, g.comprasPer, '$' + fmt(g.montoPer)]))}
      ${tabla(`Clientes que dejaron de comprar (más de ${diasInactivo} días)`, [{ t: 'Cliente' }, { t: 'Última compra' }, { t: 'Compró en total', r: 1 }], clientesRep.inactivos.slice(0, 15).map(g => [g.nombre, g.ultima, '$' + fmt(g.monto)]))}
      ${puedeCompras ? tabla('Compras por proveedor', [{ t: 'Proveedor' }, { t: 'Compras', r: 1 }, { t: 'IVA', r: 1 }, { t: 'Total', r: 1 }], comprasRep.proveedores.map(p => [p.proveedor, p.num, '$' + fmt(p.iva), '$' + fmt(p.total)])) : ''}
      ${puedeCompras ? tabla('Cuentas por pagar', [{ t: 'Proveedor' }, { t: 'Vence' }, { t: 'Monto', r: 1 }], comprasRep.porPagar.map(f => [f.proveedor, f.vencimiento || '—', '$' + fmt(f.monto)])) : ''}
      <div class="ft">ORIÓN · ONE GEO SYSTEMS · ${new Date().toLocaleString('es-SV')}</div>
    </body></html>`)
  }

  // ══ RENDER ══
  const r = datos.resumen
  const colorDif = (d) => (d === null ? 'var(--muted)' : d < -0.009 ? ROJO : d > 0.009 ? '#2563eb' : VERDE)

  return (
    <div className="pad-movil-0" style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <style>{estiloTabs}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <h1 className="titulo-con-menu" style={{ margin: 0, fontSize: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: COLOR }}>📈</span> Reportes
        </h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={imprimirReporte} disabled={cargando || !hayDatos}>🖨️ Imprimir / PDF</button>
          <button className="btn btn-primary" onClick={exportarExcel} disabled={cargando || !hayDatos}>⬇️ Exportar a Excel</button>
        </div>
      </div>

      {/* Filtros comunes */}
      <div className="card rep-filtros" style={{ padding: 16, borderRadius: 14, marginBottom: 16, display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Desde</label>
          <input type="date" className="input" value={desde} max={hasta} onChange={e => setRango(x => ({ ...x, desde: e.target.value }))} style={{ padding: '7px 10px' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Hasta</label>
          <input type="date" className="input" value={hasta} min={desde} max={hoySV()} onChange={e => setRango(x => ({ ...x, hasta: e.target.value }))} style={{ padding: '7px 10px' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setRango(rangoRapido('hoy'))}>Hoy</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setRango(rangoRapido('semana'))}>Esta semana</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setRango(rangoRapido('mes'))}>Este mes</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setRango(rangoRapido('mesAnterior'))}>Mes anterior</button>
        </div>
        {!soloPropias && cajeros.length > 1 && (
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Cajero</label>
            <select className="input" value={filtroCajero} onChange={e => setFiltroCajero(e.target.value)}>
              <option value="">Todos</option>
              {cajeros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}
        {sucursales.length > 1 && (
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Sucursal</label>
            <select className="input" value={filtroSucursal} onChange={e => setFiltroSucursal(e.target.value)}>
              <option value="">Todas</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre || s.id}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Pestañas */}
      <div className="rep-tabs" role="tablist">
        {pestanas.map(p => (
          <button key={p.id} role="tab" aria-selected={tab === p.id} className={`rep-tab ${tab === p.id ? 'on' : ''}`} onClick={() => cambiarTab(p.id)}>
            <span>{p.icon}</span>{p.label}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando datos…</div>
      ) : (
        <>
          {/* ═════════ RESUMEN ═════════ */}
          {tab === 'resumen' && (
            <>
              <div className="rep-kpis">
                <Kpi label="Ventas netas" valor={r.total} sub={<>{r.num} venta(s) · <BadgeVar pct={comparativa ? variacion(r.total, comparativa.total) : null} /></>} />
                <Kpi label="Ticket promedio" valor={datos.ticket} />
                <Kpi label="Total de ingresos" valor={ingresos.total} color={VERDE} sub="contado + cobros + otros" />
                <Kpi label="Crédito por cobrar" valor={credito.total} color="#0891b2" sub={credito.vencido > 0 ? <span style={{ color: ROJO }}>${fmt(credito.vencido)} vencido</span> : 'estado actual'} />
                <Kpi label="Diferencia de caja" valor={caja.neto} color={caja.neto < -0.009 ? ROJO : VERDE} valorColor={colorDif(caja.cerradas.length ? caja.neto : null)} sub={`${caja.cerradas.length} cierre(s)`} />
                <Kpi label="Utilidad bruta" valor={utilidad.utilidad} valorColor={utilidad.ventaConCosto ? (utilidad.utilidad < 0 ? ROJO : VERDE) : undefined} sub={utilidad.ventaConCosto ? `margen ${utilidad.margen.toFixed(1)}% · ${utilidad.cobertura.toFixed(0)}% con costo` : 'sin costos registrados'} />
              </div>
              <div className="rep-grid">
                <Tarjeta titulo="Ventas por día"><GraficaBarras series={datos.serieDia} /></Tarjeta>
                <Tarjeta titulo="Ingresos por tipo" extra={`$${fmt(ingresos.total)}`}>
                  <BarraProporcion partes={ingresos.tipos} />
                  <Tabla filas={ingresos.tipos.filter(t => t.monto)} cols={[
                    { t: 'Tipo', render: t => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: t.color, flexShrink: 0 }} />{t.label}</span> },
                    { t: '%', align: 'right', render: t => <span style={{ color: 'var(--muted)' }}>{ingresos.total ? ((t.monto / ingresos.total) * 100).toFixed(0) : 0}%</span> },
                    { t: 'Monto', align: 'right', render: t => <strong>${fmt(t.monto)}</strong> },
                  ]} />
                </Tarjeta>
              </div>
              <div className="rep-grid">
                <Tarjeta titulo="Productos más vendidos">
                  <Tabla filas={datos.productos} max={5} notaMax={`Top 5 de ${datos.productos.length}. La lista completa está en la pestaña Ventas.`} cols={[
                    { t: 'Producto', render: p => <strong>{p.nombre}</strong> },
                    { t: 'Cant.', align: 'right', render: p => fmt(p.qty) },
                    { t: 'Monto', align: 'right', render: p => `$${fmt(p.monto)}` },
                  ]} />
                </Tarjeta>
                <Tarjeta titulo="Caja por cajero" extra="faltantes y sobrantes del período">
                  <Tabla filas={caja.porCajero} vacio="Sin cierres de caja en el período." cols={[
                    { t: 'Cajero', render: x => <strong>{x.cajero}</strong> },
                    { t: 'Cierres', align: 'right', render: x => x.cierres },
                    { t: 'Neto', align: 'right', render: x => <strong style={{ color: colorDif(x.neto) }}>{x.neto >= 0 ? '+' : ''}${fmt(x.neto)}</strong> },
                  ]} />
                </Tarjeta>
              </div>
            </>
          )}

          {/* ═════════ VENTAS ═════════ */}
          {tab === 'ventas' && (
            <>
              <div className="rep-kpis">
                <Kpi label="Ventas netas" valor={r.total} sub={`${r.num} venta(s) · gravado ${fmt(r.subtotal)} · IVA ${fmt(r.iva)}`} />
                <Kpi label="Ticket promedio" valor={datos.ticket} />
                {r.ivaRete !== 0 && <Kpi label="Retención IVA 1%" valor={r.ivaRete} />}
                <Kpi label="Descuentos (neto)" valor={datos.descuentos.total} color="#f59e0b" sub={`en ${datos.descuentos.ventas} venta(s)`} />
                <Kpi label="Anulaciones" valor={anuladas.reduce((s, a) => s + a.monto, 0)} color={ROJO} sub={`${anuladas.length} documento(s)`} />
              </div>

              {comparativa && (
                <div className="card" style={{ padding: '10px 16px', borderRadius: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>vs. período anterior ({comparativa.desde} a {comparativa.hasta}):</span>
                  <strong>${fmt(comparativa.total)}</strong>
                  <span style={{ color: 'var(--muted)' }}>· {comparativa.num} venta(s)</span>
                  <BadgeVar pct={variacion(r.total, comparativa.total)} />
                </div>
              )}

              <Tarjeta titulo="Ventas por día" style={{ marginBottom: 18 }}><GraficaBarras series={datos.serieDia} /></Tarjeta>

              <div className="rep-grid">
                <Tarjeta titulo="Horas pico" extra={datos.horaPico ? `más vendida: ${datos.horaPico.h}:00` : ''}>
                  <GraficaBarras series={datos.serieHora} color="#0891b2" alto={150} minAncho={22} />
                </Tarjeta>
                <Tarjeta titulo="Días de la semana" extra={datos.diaPico ? `mejor día: ${datos.diaPico}` : ''}>
                  <GraficaBarras series={datos.serieDow} color="#12a06b" alto={150} minAncho={30} />
                </Tarjeta>
              </div>

              <div className="rep-grid">
                <Tarjeta titulo="Ventas por vendedor / cajero"><Tabla filas={datos.porVendedor} cols={colsConcepto()} /></Tarjeta>
                <Tarjeta titulo="Ventas por forma de pago"><Tabla filas={datos.porPago} cols={colsConcepto()} /></Tarjeta>
                <Tarjeta titulo="Ventas por tipo de documento"><Tabla filas={datos.porTipo} cols={colsConcepto()} /></Tarjeta>
                <Tarjeta titulo="Ventas por categoría" extra="monto neto de los productos"><Tabla filas={datos.categorias} cols={colsConcepto('Monto')} /></Tarjeta>
              </div>

              <Tarjeta titulo="Productos más vendidos" style={{ marginBottom: 18 }}>
                <Tabla filas={datos.productos} max={30} ancho={420} cols={[
                  { t: '#', w: 34, render: (p, i) => <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{i + 1}</span> },
                  { t: 'Producto', render: p => <><strong>{p.nombre}</strong>{p.codigo ? <span style={{ color: 'var(--muted)' }}> · {p.codigo}</span> : null}</> },
                  { t: 'Cantidad', align: 'right', render: p => <strong>{fmt(p.qty)}</strong> },
                  { t: 'Monto (neto)', align: 'right', render: p => `$${fmt(p.monto)}` },
                ]} />
              </Tarjeta>

              <div className="rep-grid">
                <Tarjeta titulo="Top clientes"><Tabla filas={datos.clientes} max={15} cols={colsConcepto()} /></Tarjeta>
                <Tarjeta titulo="Anulaciones e invalidaciones">
                  <Tabla filas={anuladas} vacio="Sin anulaciones en el período. 🎉" max={15} cols={[
                    { t: 'Fecha', render: a => a.fecha },
                    { t: 'Documento', render: a => <><strong>{a.tipo}</strong> <span style={{ color: 'var(--muted)', fontSize: 11 }}>{a.cliente}</span></> },
                    { t: 'Monto', align: 'right', render: a => <strong style={{ color: ROJO }}>${fmt(a.monto)}</strong> },
                  ]} />
                </Tarjeta>
              </div>

              <Tarjeta titulo="Crédito por cobrar" extra="estado actual (no depende del período)">
                {credito.filas.length === 0 ? (
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin créditos pendientes. 🎉</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                      {credito.antiguedad.map((t, i) => (
                        <div key={t.label} style={{ flex: '1 1 120px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
                          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{t.label}</div>
                          <div style={{ fontSize: 17, fontWeight: 800, color: i >= 3 && t.total ? ROJO : i >= 1 && t.total ? '#d97706' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>${fmt(t.total)}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{t.num} documento(s)</div>
                        </div>
                      ))}
                    </div>
                    <Tabla filas={credito.filas} max={20} cols={[
                      { t: 'Cliente', render: c => <strong>{c.cliente}</strong> },
                      { t: 'Vence', render: c => <>{c.vencimiento || '—'}{c.diasVencido > 0 && <span style={{ color: ROJO, fontWeight: 700, fontSize: 11 }}> ({c.diasVencido}d)</span>}</> },
                      { t: 'Monto', align: 'right', render: c => <strong>${fmt(c.monto)}</strong> },
                    ]} />
                  </>
                )}
              </Tarjeta>
            </>
          )}

          {/* ═════════ INGRESOS ═════════ */}
          {tab === 'ingresos' && (
            <>
              <div className="rep-kpis">
                <Kpi label="Total de ingresos" valor={ingresos.total} color={VERDE} sub="lo que efectivamente entró" />
                <Kpi label="Ventas de contado" valor={ingresos.tipos.slice(0, 4).reduce((s, t) => s + t.monto, 0)} />
                <Kpi label="Cobros de crédito" valor={ingresos.tipos[4].monto} color="#0891b2" sub={`${ingresos.cobros.length} cobro(s)`} />
                <Kpi label="Otros ingresos de caja" valor={ingresos.tipos[5].monto} color="#ec4899" sub={`${ingresos.otros.length} movimiento(s)`} />
                <Kpi label="Vendido al crédito" valor={ingresos.creditoVendido.monto} color="#94a3b8" sub="aún no es ingreso" />
              </div>

              <div className="rep-grid">
                <Tarjeta titulo="Tipos de ingreso" extra={`$${fmt(ingresos.total)}`}>
                  <BarraProporcion partes={ingresos.tipos} />
                  <Tabla filas={ingresos.tipos} cols={[
                    { t: 'Tipo de ingreso', render: t => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: t.color, flexShrink: 0 }} /><strong>{t.label}</strong></span> },
                    { t: 'N.º', align: 'right', render: t => <span style={{ color: 'var(--muted)' }}>{t.num}</span> },
                    { t: '%', align: 'right', render: t => <span style={{ color: 'var(--muted)' }}>{ingresos.total ? ((t.monto / ingresos.total) * 100).toFixed(1) : '0.0'}%</span> },
                    { t: 'Monto', align: 'right', render: t => <strong>${fmt(t.monto)}</strong> },
                  ]} pie={['Total', ingresos.tipos.reduce((s, t) => s + t.num, 0), '100%', `$${fmt(ingresos.total)}`]} />
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
                    El pago mixto se reparte en cada medio. Las ventas al crédito no cuentan como ingreso hasta que se cobran; ahí aparecen en "Cobros de crédito" el día del cobro.
                  </div>
                </Tarjeta>
                <Tarjeta titulo="Ingresos por día"><GraficaBarras series={ingresos.serieDia} color={VERDE} /></Tarjeta>
              </div>

              <div className="rep-grid">
                <Tarjeta titulo="Cobros de crédito" extra="por fecha de cobro">
                  <Tabla filas={ingresos.cobros} max={20} vacio="Sin cobros de crédito en el período." cols={[
                    { t: 'Cobrado', render: c => c.fechaPago },
                    { t: 'Cliente', render: c => <><strong>{c.cliente}</strong><div style={{ fontSize: 11, color: 'var(--muted)' }}>vendido {c.fechaVenta}{c.cobradoPor ? ` · cobró ${c.cobradoPor}` : ''}</div></> },
                    { t: 'Monto', align: 'right', render: c => <strong>${fmt(c.monto)}</strong> },
                  ]} />
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Se registra la fecha del cobro desde el 14/09/2026 (al marcar la factura como Pagada).</div>
                </Tarjeta>
                <Tarjeta titulo="Otros ingresos de caja" extra="dinero que entró sin ser venta">
                  <Tabla filas={ingresos.otrosPorMotivo} vacio="Sin otros ingresos en el período." cols={colsConcepto('Monto')} />
                </Tarjeta>
              </div>
            </>
          )}

          {/* ═════════ CAJA ═════════ */}
          {tab === 'caja' && (
            <>
              <div className="rep-kpis">
                <Kpi label="Cierres del período" valor={caja.cerradas.length} dinero={false} sub={caja.abiertas ? `${caja.abiertas} caja(s) abierta(s)` : 'sin cajas abiertas'} />
                <Kpi label="Faltantes" valor={caja.faltantes} color={ROJO} valorColor={caja.faltantes > 0.009 ? ROJO : undefined} />
                <Kpi label="Sobrantes" valor={caja.sobrantes} color="#2563eb" />
                <Kpi label="Diferencia neta" valor={caja.neto} color={caja.neto < -0.009 ? ROJO : VERDE} valorColor={colorDif(caja.cerradas.length ? caja.neto : null)} />
                <Kpi label="Salidas de efectivo" valor={caja.salidas} color="#f59e0b" sub={`entradas $${fmt(caja.entradas)}`} />
                <Kpi label="Aperturas de gaveta" valor={caja.aperturas.length} dinero={false} color="#8b5cf6" sub="sin venta" />
              </div>

              {caja.hayCorregidas && (
                <div style={{ background: 'rgba(37,99,235,0.07)', border: '1.5px solid rgba(37,99,235,0.25)', borderRadius: 12, padding: '10px 14px', fontSize: 12.5, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.5 }}>
                  ↻ Algunos cierres muestran la diferencia <strong>recalculada</strong>. Hasta el 14/09/2026 la caja contaba las ventas con tarjeta, transferencia y crédito como si fueran efectivo, lo que generaba faltantes que no existían. Entre paréntesis queda la diferencia que se registró ese día.
                </div>
              )}

              <Tarjeta titulo="Cierres de caja" style={{ marginBottom: 18 }}>
                <Tabla filas={caja.filas} vacio="Sin cajas abiertas en el período." max={40} ancho={760} cols={[
                  { t: 'Fecha', render: f => <>{f.fecha}<div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{f.turno}</div></> },
                  { t: 'Cajero', render: f => <strong>{f.cajero}</strong> },
                  { t: 'Inicial', align: 'right', render: f => `$${fmt(f.inicial)}` },
                  { t: '+ Efectivo', align: 'right', render: f => `$${fmt(f.efectivo)}` },
                  { t: '± Movim.', align: 'right', render: f => <span style={{ color: 'var(--muted)' }}>{f.ingresos ? `+${fmt(f.ingresos)} ` : ''}{f.salidas ? `−${fmt(f.salidas)}` : (f.ingresos ? '' : '—')}</span> },
                  { t: 'Esperado', align: 'right', render: f => <strong>${fmt(f.esperado)}</strong> },
                  { t: 'Contado', align: 'right', render: f => (f.contado === null ? <span style={{ color: '#0891b2', fontWeight: 700 }}>abierta</span> : `$${fmt(f.contado)}`) },
                  { t: 'Diferencia', align: 'right', render: f => (f.diferencia === null ? '—' : <>
                    <strong style={{ color: colorDif(f.diferencia) }}>{f.diferencia >= 0 ? '+' : ''}${fmt(f.diferencia)}</strong>
                    {f.corregida && <div style={{ fontSize: 10.5, color: 'var(--muted)' }} title="Diferencia registrada al cerrar">↻ ({f.difRegistrada >= 0 ? '+' : ''}${fmt(f.difRegistrada)})</div>}
                  </>) },
                ]} />
              </Tarjeta>

              <div className="rep-grid">
                <Tarjeta titulo="Faltantes y sobrantes por cajero">
                  <Tabla filas={caja.porCajero} vacio="Sin cierres en el período." cols={[
                    { t: 'Cajero', render: x => <strong>{x.cajero}</strong> },
                    { t: 'Cierres', align: 'right', render: x => <>{x.cierres}{x.conFaltante ? <div style={{ fontSize: 10.5, color: ROJO }}>{x.conFaltante} con faltante</div> : null}</> },
                    { t: 'Faltantes', align: 'right', render: x => <span style={{ color: x.faltantes ? ROJO : 'var(--muted)' }}>${fmt(x.faltantes)}</span> },
                    { t: 'Sobrantes', align: 'right', render: x => <span style={{ color: x.sobrantes ? '#2563eb' : 'var(--muted)' }}>${fmt(x.sobrantes)}</span> },
                    { t: 'Neto', align: 'right', render: x => <strong style={{ color: colorDif(x.neto) }}>{x.neto >= 0 ? '+' : ''}${fmt(x.neto)}</strong> },
                  ]} />
                </Tarjeta>
                <Tarjeta titulo="Movimientos de efectivo por motivo">
                  <Tabla filas={caja.movPorMotivo} vacio="Sin movimientos de efectivo en el período." cols={[
                    { t: 'Motivo', render: m => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ color: m.tipo === 'ingreso' ? VERDE : ROJO, fontWeight: 800 }}>{m.tipo === 'ingreso' ? '+' : '−'}</span><strong>{m.motivo}</strong></span> },
                    { t: 'N.º', align: 'right', render: m => <span style={{ color: 'var(--muted)' }}>{m.num}</span> },
                    { t: 'Monto', align: 'right', render: m => <strong style={{ color: m.tipo === 'ingreso' ? VERDE : ROJO }}>${fmt(m.total)}</strong> },
                  ]} />
                </Tarjeta>
              </div>

              <div className="rep-grid">
                <Tarjeta titulo="Detalle de movimientos de efectivo">
                  <Tabla filas={caja.movPeriodo} vacio="Sin movimientos en el período." max={25} cols={[
                    { t: 'Fecha', render: m => <>{m.fecha}<div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.hora} · {m.origen}</div></> },
                    { t: 'Quién / motivo', render: m => <><strong>{m.motivo}</strong><div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.usuario}</div></> },
                    { t: 'Monto', align: 'right', render: m => <strong style={{ color: m.tipo === 'ingreso' ? VERDE : ROJO }}>{m.tipo === 'ingreso' ? '+' : '−'}${fmt(m.monto)}</strong> },
                  ]} />
                </Tarjeta>
                <Tarjeta titulo="Aperturas de gaveta sin venta" extra="control del dueño">
                  <Tabla filas={caja.aperturasPorUsuario} vacio="Nadie abrió la gaveta sin venta en el período." cols={[
                    { t: 'Usuario', render: a => <strong>{a.usuario}</strong> },
                    { t: 'Aperturas', align: 'right', render: a => a.total },
                    { t: 'Con dinero', align: 'right', render: a => <span style={{ color: 'var(--muted)' }}>{a.conDinero}</span> },
                    { t: 'Sin motivo', align: 'right', render: a => <span style={{ color: a.sinMotivo ? '#d97706' : 'var(--muted)', fontWeight: a.sinMotivo ? 700 : 400 }}>{a.sinMotivo}</span> },
                  ]} />
                </Tarjeta>
              </div>
            </>
          )}

          {/* ═════════ UTILIDAD ═════════ */}
          {tab === 'utilidad' && (
            <>
              <div className="rep-kpis">
                <Kpi label="Utilidad bruta" valor={utilidad.utilidad} valorColor={utilidad.ventaConCosto ? (utilidad.utilidad < 0 ? ROJO : VERDE) : undefined} sub={`margen ${utilidad.margen.toFixed(1)}%`} />
                <Kpi label="Vendido con costo (neto)" valor={utilidad.ventaConCosto} />
                <Kpi label="Costo de lo vendido" valor={utilidad.costo} />
                <Kpi label="Cobertura de costo" valor={`${utilidad.cobertura.toFixed(0)}%`} dinero={false} sub={utilidad.estimado > 0.004 ? `$${fmt(utilidad.estimado)} con costo estimado` : 'de lo vendido tiene costo'} />
              </div>

              {utilidad.venta > 0 && utilidad.cobertura < 99.5 && (
                <Aviso tono="ambar">
                  ⚠️ <strong>${fmt(utilidad.venta - utilidad.ventaConCosto)}</strong> de lo vendido ({(100 - utilidad.cobertura).toFixed(0)}%) no tiene costo registrado y <strong>no entra en la utilidad</strong>. El costo se toma de la última compra del producto (Compras) o de la importación con foto. La lista está abajo, en "Sin costo registrado".
                </Aviso>
              )}
              {utilidad.estimado > 0.004 && (
                <Aviso>
                  ↻ Las ventas anteriores al 14/09/2026 no guardaban el costo: para esas se usa el <strong>costo actual</strong> del producto, así que la utilidad de esas ventas es <strong>estimada</strong> (marcada con "est."). Desde esa fecha cada venta guarda su costo real.
                </Aviso>
              )}

              <div className="rep-grid">
                <Tarjeta titulo="Utilidad por día"><GraficaBarras series={utilidad.serieDia} color={VERDE} /></Tarjeta>
                <Tarjeta titulo="Utilidad por categoría">
                  <Tabla filas={utilidad.categorias} vacio="Sin ventas con costo en el período." cols={[
                    { t: 'Categoría', render: c => <strong>{c.label}</strong> },
                    { t: 'Vendido', align: 'right', render: c => `$${fmt(c.venta)}` },
                    { t: 'Utilidad', align: 'right', render: c => <strong style={{ color: c.utilidad < 0 ? ROJO : undefined }}>${fmt(c.utilidad)}</strong> },
                    { t: 'Margen', align: 'right', render: c => <strong style={{ color: colorMargen(c.margen) }}>{c.margen.toFixed(1)}%</strong> },
                  ]} />
                </Tarjeta>
              </div>

              <Tarjeta titulo="Utilidad por producto" extra="ordenado por lo que más dejó" style={{ marginBottom: 18 }}>
                <Tabla filas={utilidad.productos} max={40} ancho={600} vacio="Sin ventas con costo en el período." cols={[
                  { t: 'Producto', render: p => <><strong>{p.nombre}</strong>{p.estimado && <span title="Costo estimado con el costo actual del producto" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#2563eb', background: 'rgba(37,99,235,0.1)', padding: '1px 6px', borderRadius: 5 }}>est.</span>}{p.codigo ? <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.codigo}</div> : null}</> },
                  { t: 'Cant.', align: 'right', render: p => fmt(p.qty) },
                  { t: 'Vendido', align: 'right', render: p => `$${fmt(p.venta)}` },
                  { t: 'Costo', align: 'right', render: p => <span style={{ color: 'var(--muted)' }}>${fmt(p.costo)}</span> },
                  { t: 'Utilidad', align: 'right', render: p => <strong style={{ color: p.utilidad < 0 ? ROJO : undefined }}>${fmt(p.utilidad)}</strong> },
                  { t: 'Margen', align: 'right', render: p => <strong style={{ color: colorMargen(p.margen) }}>{p.margen.toFixed(1)}%</strong> },
                ]} />
              </Tarjeta>

              <div className="rep-grid">
                <Tarjeta titulo="Vendidos por debajo del costo" extra="cada venta pierde dinero">
                  <Tabla filas={utilidad.bajoCosto} vacio="Ningún producto se vendió por debajo del costo. 🎉" cols={[
                    { t: 'Producto', render: p => <strong>{p.nombre}</strong> },
                    { t: 'Vendido', align: 'right', render: p => `$${fmt(p.venta)}` },
                    { t: 'Pérdida', align: 'right', render: p => <strong style={{ color: ROJO }}>${fmt(p.utilidad)}</strong> },
                  ]} />
                  {utilidad.margenBajo.length > 0 && <div style={{ fontSize: 11.5, color: '#d97706', marginTop: 10 }}>Además, {utilidad.margenBajo.length} producto(s) dejan menos del 10% de margen.</div>}
                </Tarjeta>
                <Tarjeta titulo="Sin costo registrado" extra="no entran en la utilidad">
                  <Tabla filas={utilidad.sinCosto} max={15} vacio="Todo lo vendido tiene costo. 🎉" cols={[
                    { t: 'Producto', render: p => <><strong>{p.nombre}</strong>{p.codigo ? <span style={{ color: 'var(--muted)', fontSize: 11 }}> · {p.codigo}</span> : null}</> },
                    { t: 'Vendido', align: 'right', render: p => `$${fmt(p.venta)}` },
                  ]} />
                </Tarjeta>
              </div>
            </>
          )}

          {/* ═════════ INVENTARIO ═════════ */}
          {tab === 'inventario' && (
            <>
              <div className="rep-kpis">
                <Kpi label="Valor a costo" valor={inventario.valorCosto} sub={inventario.sinCostoCount ? `${inventario.sinCostoCount} producto(s) sin costo` : `${inventario.productos} productos`} />
                <Kpi label="Valor a precio de venta" valor={inventario.valorVenta} sub="con IVA" />
                <Kpi label="Agotados" valor={inventario.agotados.length} dinero={false} valorColor={inventario.agotados.length ? ROJO : undefined} sub="sin existencias" />
                <Kpi label="Bajo el mínimo" valor={inventario.bajoMinimo.length} dinero={false} valorColor={inventario.bajoMinimo.length ? '#d97706' : undefined} sub="conviene reponer" />
                <Kpi label="Sin movimiento" valor={inventario.sinMovimiento.length} dinero={false} sub={`$${fmt(inventario.capitalDetenido)} detenido`} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>El inventario muestra el estado <strong>actual</strong>. El período elegido arriba solo se usa para la clasificación ABC.</div>

              <div className="rep-grid">
                <Tarjeta titulo="Agotados">
                  <Tabla filas={inventario.agotados} max={20} vacio="Ningún producto agotado. 🎉" cols={[
                    { t: 'Producto', render: p => <><strong>{p.nombre}</strong>{p.codigo ? <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.codigo}</div> : null}</> },
                    { t: 'Mínimo', align: 'right', render: p => p.min || '—' },
                    { t: 'Última venta', align: 'right', render: p => <span style={{ color: 'var(--muted)' }}>{p.ultimaVenta || '+3 meses'}</span> },
                  ]} />
                </Tarjeta>
                <Tarjeta titulo="Bajo el mínimo">
                  <Tabla filas={inventario.bajoMinimo} max={20} vacio="Nada por debajo del mínimo." cols={[
                    { t: 'Producto', render: p => <strong>{p.nombre}</strong> },
                    { t: 'Stock / mín.', align: 'right', render: p => <><strong style={{ color: '#d97706' }}>{fmt(p.stock)}</strong> <span style={{ color: 'var(--muted)' }}>/ {p.min}</span></> },
                    { t: 'Faltan', align: 'right', render: p => <strong>{fmt(p.min - p.stock)}</strong> },
                  ]} />
                </Tarjeta>
              </div>

              <Tarjeta titulo="Sin movimiento" extra={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  sin ventas en
                  <select className="input" value={diasSinMov} onChange={e => setDiasSinMov(Number(e.target.value))} style={{ padding: '3px 6px', fontSize: 12, width: 'auto' }}>
                    {[30, 45, 60].map(d => <option key={d} value={d}>{d} días</option>)}
                  </select>
                </span>
              } style={{ marginBottom: 18 }}>
                <Tabla filas={inventario.sinMovimiento} max={25} ancho={520} vacio="Todo lo que tiene stock se vendió en ese tiempo. 🎉" cols={[
                  { t: 'Producto', render: p => <><strong>{p.nombre}</strong><div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.categoria}</div></> },
                  { t: 'Stock', align: 'right', render: p => `${fmt(p.stock)} ${(p.unidad || '').toLowerCase()}` },
                  { t: 'Última venta', align: 'right', render: p => (p.ultimaVenta ? <>{p.ultimaVenta}<div style={{ fontSize: 11, color: 'var(--muted)' }}>hace {p.diasSinVenta} días</div></> : <span style={{ color: 'var(--muted)' }}>+3 meses</span>) },
                  { t: 'Valor a costo', align: 'right', render: p => (p.costoU ? <strong>${fmt(p.valorCosto)}</strong> : <span style={{ color: 'var(--muted)' }}>sin costo</span>) },
                ]} />
              </Tarjeta>

              <div className="rep-grid">
                <Tarjeta titulo="Clasificación ABC" extra="según lo vendido en el período">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                    {inventario.resumenAbc.map(c => (
                      <div key={c.clase} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: c.clase === 'A' ? VERDE : c.clase === 'B' ? '#2563eb' : 'var(--muted)' }}>{c.clase}</div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{c.productos} producto(s)</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>${fmt(c.monto)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
                    <strong>A</strong>: los que hacen el 80% de las ventas, nunca deben faltar. <strong>B</strong>: el siguiente 15%. <strong>C</strong>: el último 5%. {inventario.sinVendidos} producto(s) no se vendieron en el período.
                  </div>
                  <Tabla filas={inventario.abc} max={15} vacio="Sin ventas en el período." cols={[
                    { t: 'Clase', w: 44, render: p => <strong style={{ color: p.clase === 'A' ? VERDE : p.clase === 'B' ? '#2563eb' : 'var(--muted)' }}>{p.clase}</strong> },
                    { t: 'Producto', render: p => <strong>{p.nombre}</strong> },
                    { t: '% ventas', align: 'right', render: p => `${p.pct.toFixed(1)}%` },
                  ]} />
                </Tarjeta>
                <Tarjeta titulo="Valor por categoría">
                  <Tabla filas={inventario.porCategoria} vacio="Sin productos." cols={[
                    { t: 'Categoría', render: c => <><strong>{c.label}</strong><div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.productos} producto(s)</div></> },
                    { t: 'A costo', align: 'right', render: c => <strong>${fmt(c.valorCosto)}</strong> },
                    { t: 'A venta', align: 'right', render: c => <span style={{ color: 'var(--muted)' }}>${fmt(c.valorVenta)}</span> },
                  ]} pie={['Total', `$${fmt(inventario.valorCosto)}`, `$${fmt(inventario.valorVenta)}`]} />
                </Tarjeta>
              </div>
            </>
          )}

          {/* ═════════ CLIENTES ═════════ */}
          {tab === 'clientes' && (
            <>
              <div className="rep-kpis">
                <Kpi label="Clientes que compraron" valor={clientesRep.conCompra.length} dinero={false} sub={`${clientesRep.registrados} registrado(s)`} />
                <Kpi label="Clientes nuevos" valor={clientesRep.nuevos} dinero={false} sub="primera compra en el período" />
                <Kpi label="Recurrentes" valor={clientesRep.recurrentes} dinero={false} sub="2 o más compras en el período" />
                <Kpi label="Consumidor final" valor={clientesRep.cf.monto} sub={`${clientesRep.cf.num} venta(s) · ${clientesRep.totalPer ? ((clientesRep.cf.monto / clientesRep.totalPer) * 100).toFixed(0) : 0}% de lo vendido`} />
                <Kpi label="Dejaron de comprar" valor={clientesRep.inactivos.length} dinero={false} valorColor={clientesRep.inactivos.length ? '#d97706' : undefined} sub={`más de ${diasInactivo} días`} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
                El cliente se reconoce por el cliente elegido en la venta, su NIT/DUI o su nombre. Las ventas sin cliente cuentan como <strong>consumidor final</strong>.
              </div>

              <Tarjeta titulo="Mejores clientes del período" extra="ordenado por monto" style={{ marginBottom: 18 }}>
                <Tabla filas={clientesRep.conCompra} max={25} ancho={640} vacio="Sin ventas a clientes identificados en el período." cols={[
                  { t: 'Cliente', render: g => <><strong>{g.nombre}</strong>{g.mayorista && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: '#d97706', background: 'rgba(245,158,11,0.14)', padding: '1px 6px', borderRadius: 5 }}>MAYORISTA</span>}{g.nuevo && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: VERDE, background: 'rgba(18,160,107,0.1)', padding: '1px 6px', borderRadius: 5 }}>nuevo</span>}{g.doc ? <div style={{ fontSize: 11, color: 'var(--muted)' }}>{g.doc}</div> : null}</> },
                  { t: 'Compras', align: 'right', render: g => g.comprasPer },
                  { t: 'Monto', align: 'right', render: g => <strong>${fmt(g.montoPer)}</strong> },
                  { t: 'Ticket', align: 'right', render: g => `$${fmt(g.ticket)}` },
                  { t: 'Compra cada', align: 'right', render: g => (g.frecuencia ? `${Math.round(g.frecuencia)} día(s)` : <span style={{ color: 'var(--muted)' }}>—</span>) },
                  { t: 'Última', align: 'right', render: g => <span style={{ color: 'var(--muted)' }}>{g.ultima}</span> },
                ]} />
              </Tarjeta>

              <Tarjeta titulo="Clientes que dejaron de comprar" extra={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  sin comprar en
                  <select className="input" value={diasInactivo} onChange={e => setDiasInactivo(Number(e.target.value))} style={{ padding: '3px 6px', fontSize: 12, width: 'auto' }}>
                    {[30, 45, 60].map(d => <option key={d} value={d}>{d} días</option>)}
                  </select>
                </span>
              } style={{ marginBottom: 18 }}>
                {clientesRep.inactivos.length > 0 && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>Antes te compraron <strong>${fmt(clientesRep.montoInactivos)}</strong> en total. Vale la pena llamarlos.</div>}
                <Tabla filas={clientesRep.inactivos} max={25} ancho={560} vacio="Todos tus clientes compraron en ese tiempo. 🎉" cols={[
                  { t: 'Cliente', render: g => <><strong>{g.nombre}</strong>{g.telefono ? <div style={{ fontSize: 11, color: 'var(--muted)' }}>📞 {g.telefono}</div> : null}</> },
                  { t: 'Compró en total', align: 'right', render: g => <><strong>${fmt(g.monto)}</strong><div style={{ fontSize: 11, color: 'var(--muted)' }}>{g.compras} compra(s)</div></> },
                  { t: 'Última compra', align: 'right', render: g => <>{g.ultima}<div style={{ fontSize: 11, color: '#d97706' }}>hace {g.diasSinComprar} días</div></> },
                ]} />
              </Tarjeta>

              <div className="rep-grid">
                <Tarjeta titulo="Atrasados" extra="compran seguido y ya se tardaron">
                  <Tabla filas={clientesRep.atrasados} max={15} vacio="Nadie atrasado según su costumbre." cols={[
                    { t: 'Cliente', render: g => <strong>{g.nombre}</strong> },
                    { t: 'Suele comprar', align: 'right', render: g => `cada ${Math.round(g.frecuencia)} día(s)` },
                    { t: 'Sin comprar', align: 'right', render: g => <strong style={{ color: '#d97706' }}>{g.diasSinComprar} días</strong> },
                  ]} />
                </Tarjeta>
                <Tarjeta titulo="Ventas por tipo de cliente">
                  <Tabla filas={clientesRep.tipos} vacio="Sin ventas en el período." cols={colsConcepto('Monto')} />
                </Tarjeta>
              </div>

              <Tarjeta titulo="Cuentas por cobrar por cliente" extra="estado actual" style={{ marginBottom: 18 }}>
                <Tabla filas={clientesRep.porCobrar} max={25} ancho={520} vacio="Ningún cliente te debe. 🎉" cols={[
                  { t: 'Cliente', render: c => <strong>{c.cliente}</strong> },
                  { t: 'Facturas', align: 'right', render: c => c.facturas },
                  { t: 'Debe', align: 'right', render: c => <strong>${fmt(c.monto)}</strong> },
                  { t: 'Vencido', align: 'right', render: c => (c.vencido > 0 ? <><strong style={{ color: ROJO }}>${fmt(c.vencido)}</strong><div style={{ fontSize: 11, color: 'var(--muted)' }}>hasta {c.maxDias} días</div></> : <span style={{ color: VERDE }}>al día</span>) },
                ]} pie={['Total', clientesRep.porCobrar.reduce((s, c) => s + c.facturas, 0), `$${fmt(credito.total)}`, `$${fmt(credito.vencido)}`]} />
              </Tarjeta>
            </>
          )}

          {/* ═════════ VENDEDORES ═════════ */}
          {tab === 'vendedores' && (
            <>
              <div className="rep-kpis">
                <Kpi label="Vendedores con ventas" valor={vendedoresRep.ventas.length} dinero={false} />
                <Kpi label="Comisiones" valor={vendedoresRep.comisionTotal} sub={comisionPct ? `${comisionPct}% sobre ventas sin IVA` : 'poné el % abajo'} />
                <Kpi label="Comandas cobradas" valor={`${vendedoresRep.comCobradas} de ${vendedoresRep.comArmadas}`} dinero={false} sub={vendedoresRep.comPendientes ? `${vendedoresRep.comPendientes} pendiente(s)` : 'vales armados en el período'} />
                <Kpi label="Cotizaciones aceptadas" valor={`${vendedoresRep.conversion.toFixed(0)}%`} dinero={false} sub={`${vendedoresRep.cotAceptadas} de ${vendedoresRep.cotEmitidas} emitida(s)`} />
              </div>

              <Tarjeta titulo="Ventas y comisión por vendedor" extra={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  comisión
                  <input type="number" className="input" min="0" max="100" step="0.5" value={comisionPct || ''} placeholder="0"
                    onChange={e => { const n = Math.max(0, Math.min(100, Number(e.target.value) || 0)); setComisionPct(n); try { localStorage.setItem('orion_reportes_comision', String(n)) } catch { /* sin storage */ } }}
                    style={{ padding: '3px 6px', fontSize: 12, width: 64 }} />
                  %
                </span>
              } style={{ marginBottom: 18 }}>
                <Tabla filas={vendedoresRep.ventas} ancho={640} vacio="Sin ventas en el período." cols={[
                  { t: 'Vendedor', render: g => <><strong>{g.vendedor}</strong>{g.deComanda > 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{g.deComanda} desde comanda</div>}</> },
                  { t: 'Ventas', align: 'right', render: g => g.ventas },
                  { t: 'Sin IVA', align: 'right', render: g => <strong>${fmt(g.neto)}</strong> },
                  { t: 'Ticket', align: 'right', render: g => `$${fmt(g.ticket)}` },
                  { t: 'Utilidad', align: 'right', render: g => (g.utilidad === null ? <span style={{ color: 'var(--muted)' }}>sin costo</span> : `$${fmt(g.utilidad)}`) },
                  { t: 'Comisión', align: 'right', render: g => <strong style={{ color: comisionPct ? VERDE : 'var(--muted)' }}>${fmt(g.comision)}</strong> },
                ]} pie={['Total', vendedoresRep.ventas.reduce((s, g) => s + g.ventas, 0), `$${fmt(vendedoresRep.ventas.reduce((s, g) => s + g.neto, 0))}`, '', '', `$${fmt(vendedoresRep.comisionTotal)}`]} />
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
                  Si la venta vino de una comanda, cuenta para quien <strong>armó el vale</strong>, aunque la cobre otro. Esto se registra desde el 15/09/2026; antes cuenta para quien cobró. La comisión es un cálculo del reporte y no se guarda.
                </div>
              </Tarjeta>

              <div className="rep-grid">
                <Tarjeta titulo="Comandas por vendedor" extra="vales armados en el período">
                  <Tabla filas={vendedoresRep.comandas} vacio="Sin comandas en el período." cols={[
                    { t: 'Vendedor', render: g => <strong>{g.vendedor}</strong> },
                    { t: 'Armadas', align: 'right', render: g => g.armadas },
                    { t: 'Cobradas', align: 'right', render: g => <>{g.cobradas} <span style={{ color: 'var(--muted)', fontSize: 11 }}>({g.pctCobro.toFixed(0)}%)</span></> },
                    { t: 'Canc.', align: 'right', render: g => <span style={{ color: g.canceladas ? ROJO : 'var(--muted)' }}>{g.canceladas}</span> },
                    { t: 'Cobrado', align: 'right', render: g => <strong>${fmt(g.montoCobrado)}</strong> },
                  ]} />
                </Tarjeta>
                <Tarjeta titulo="Cotizaciones por vendedor" extra={vendedoresRep.convertidas.num ? `${vendedoresRep.convertidas.num} convertida(s) en venta · $${fmt(vendedoresRep.convertidas.monto)}` : 'emitidas en el período'}>
                  <Tabla filas={vendedoresRep.cotizaciones} vacio={puedeCotizaciones ? 'Sin cotizaciones en el período.' : 'No tenés permiso para ver cotizaciones.'} cols={[
                    { t: 'Vendedor', render: g => <strong>{g.vendedor}</strong> },
                    { t: 'Emitidas', align: 'right', render: g => g.emitidas },
                    { t: 'Aceptadas', align: 'right', render: g => <>{g.aceptadas} <span style={{ color: 'var(--muted)', fontSize: 11 }}>({g.conversion.toFixed(0)}%)</span></> },
                    { t: 'Monto aceptado', align: 'right', render: g => <strong>${fmt(g.montoAceptado)}</strong> },
                  ]} />
                </Tarjeta>
              </div>
            </>
          )}

          {/* ═════════ COMPRAS ═════════ */}
          {tab === 'compras' && puedeCompras && (
            <>
              <div className="rep-kpis">
                <Kpi label="Total comprado" valor={comprasRep.total} sub={`${comprasRep.num} compra(s)`} />
                <Kpi label="IVA crédito fiscal" valor={comprasRep.ivaCredito} sub="de compras con CCF" />
                <Kpi label="Cuentas por pagar" valor={comprasRep.totalPorPagar} sub={comprasRep.vencidoPorPagar > 0 ? <span style={{ color: ROJO }}>${fmt(comprasRep.vencidoPorPagar)} vencido</span> : 'estado actual'} />
                <Kpi label="Comprado vs. vendido" valor={r.total ? `${((comprasRep.total / r.total) * 100).toFixed(0)}%` : '—'} dinero={false} sub="de lo vendido en el período" />
                {comprasRep.principal && <Kpi label="Proveedor principal" valor={comprasRep.principal.proveedor} dinero={false} sub={`${comprasRep.principal.pct.toFixed(0)}% de las compras`} />}
              </div>

              <div className="rep-grid">
                <Tarjeta titulo="Compras por día"><GraficaBarras series={comprasRep.serieDia} color="#0891b2" /></Tarjeta>
                <Tarjeta titulo="Por tipo de documento" extra={`contado $${fmt(comprasRep.contado)} · crédito $${fmt(comprasRep.credito)}`}>
                  <Tabla filas={comprasRep.tipos} vacio="Sin compras en el período." cols={colsConcepto()} />
                </Tarjeta>
              </div>

              <Tarjeta titulo="Compras por proveedor" style={{ marginBottom: 18 }}>
                <Tabla filas={comprasRep.proveedores} max={25} ancho={600} vacio="Sin compras en el período." cols={[
                  { t: 'Proveedor', render: p => <><strong>{p.proveedor}</strong>{p.nit ? <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.nit}</div> : null}</> },
                  { t: 'Compras', align: 'right', render: p => p.num },
                  { t: 'Sin IVA', align: 'right', render: p => `$${fmt(p.subtotal)}` },
                  { t: 'IVA', align: 'right', render: p => <span style={{ color: 'var(--muted)' }}>${fmt(p.iva)}</span> },
                  { t: 'Total', align: 'right', render: p => <strong>${fmt(p.total)}</strong> },
                  { t: 'Última', align: 'right', render: p => <span style={{ color: 'var(--muted)' }}>{p.ultima}</span> },
                ]} pie={['Total', comprasRep.num, `$${fmt(comprasRep.subtotal)}`, `$${fmt(comprasRep.iva)}`, `$${fmt(comprasRep.total)}`, '']} />
              </Tarjeta>

              <div className="rep-grid">
                <Tarjeta titulo="Cuentas por pagar" extra="estado actual">
                  <BarraProporcion partes={comprasRep.antiguedad.map((a, i) => ({ ...a, k: a.label, monto: a.total, color: [VERDE, '#eab308', '#f59e0b', '#ea580c', ROJO][i] }))} />
                  <Tabla filas={comprasRep.porPagar} max={15} vacio="No debés nada a proveedores. 🎉" cols={[
                    { t: 'Proveedor', render: f => <><strong>{f.proveedor}</strong><div style={{ fontSize: 11, color: 'var(--muted)' }}>{f.numero || f.fecha}</div></> },
                    { t: 'Vence', align: 'right', render: f => (f.vencimiento ? <>{f.vencimiento}{f.diasVencido > 0 && <div style={{ fontSize: 11, color: ROJO }}>vencida {f.diasVencido} días</div>}</> : <span style={{ color: 'var(--muted)' }}>sin fecha</span>) },
                    { t: 'Monto', align: 'right', render: f => <strong>${fmt(f.monto)}</strong> },
                  ]} />
                </Tarjeta>
                <Tarjeta titulo="Productos más comprados">
                  <Tabla filas={comprasRep.productos} max={15} vacio="Sin compras en el período." cols={[
                    { t: 'Producto', render: p => <strong>{p.nombre}</strong> },
                    { t: 'Unidades', align: 'right', render: p => `${fmt(p.unidades)} ${(p.unidad || '').toLowerCase()}` },
                    { t: 'Monto', align: 'right', render: p => <strong>${fmt(p.monto)}</strong> },
                    { t: 'Últ. costo', align: 'right', render: p => <span style={{ color: 'var(--muted)' }}>${fmt(p.ultimoCosto)}</span> },
                  ]} />
                </Tarjeta>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
