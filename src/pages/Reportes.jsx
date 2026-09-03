import { useState, useEffect, useMemo } from 'react'
import { db } from '../firebase'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'
import { orionAlert } from '../orionDialog'
import * as XLSX from 'xlsx'

// ══════════════════════════════════════════════════════════════════
// REPORTES — Etapa 1 (disponible en TODOS los planes; gated por permiso)
// Lee la colección `ventas` de la empresa y genera un análisis del período:
//  · Resumen (ventas netas, # ventas, ticket promedio, IVA, retención)
//  · Ventas por forma de pago
//  · Ventas por tipo de documento (FE/CCF/NC/…)
//  · Ventas por vendedor/cajero
//  · Productos más vendidos
// Todo se puede exportar a Excel. Es solo lectura y cálculo en cliente.
// ══════════════════════════════════════════════════════════════════

const IVA = 0.13
const COLOR = '#7c3aed'

// Nota de crédito resta; el resto suma (ventas netas del período).
const signo = (tipoDte) => (tipoDte === 'NC' ? -1 : 1)

const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Fecha de la venta en hora de El Salvador (YYYY-MM-DD). `ventas` guarda
// createdAt (Timestamp) como fuente principal; fechaEmision como respaldo.
const fechaSV = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const fechaDeVenta = (v) => (v.createdAt?.toDate ? fechaSV(v.createdAt.toDate()) : String(v.fechaEmision || '').slice(0, 10))

const hoySV = () => fechaSV(new Date())

// Etiqueta legible de la forma de pago
const LABEL_PAGO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', cheque: 'Cheque', mixto: 'Pago mixto', credito: 'Crédito' }
const labelPago = (v) => (v.tipoPago === 'credito' ? 'Crédito' : (LABEL_PAGO[v.formaPago] || v.formaPago || 'Otro'))

const LABEL_DTE = { FE: 'Factura (FE)', CCF: 'Créd. Fiscal (CCF)', NC: 'Nota de Crédito', ND: 'Nota de Débito', FEX: 'Exportación (FEX)', FSE: 'Sujeto Excluido' }

// ── Presentacionales (fuera del render para no recrearlos en cada pintado) ──
const Kpi = ({ label, valor, sub, dinero = true }) => (
  <div className="card" style={{ padding: '14px 16px', borderRadius: 14, borderTop: `3px solid ${COLOR}`, flex: '1 1 150px', minWidth: 150 }}>
    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{dinero ? `$${fmt(valor)}` : valor}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
  </div>
)

const TablaSimple = ({ titulo, filas, colValor = 'Total' }) => (
  <div className="card" style={{ padding: 16, borderRadius: 14, marginBottom: 18, overflowX: 'auto' }}>
    <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{titulo}</h3>
    {filas.length === 0 ? (
      <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos en el período.</div>
    ) : (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 320 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--muted)', borderBottom: '1.5px solid var(--border)' }}>
            <th style={{ padding: '6px 4px' }}>Concepto</th>
            <th style={{ padding: '6px 4px', textAlign: 'right' }}>N.º</th>
            <th style={{ padding: '6px 4px', textAlign: 'right' }}>{colValor}</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((x, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '7px 4px', fontWeight: 600 }}>{x.label}</td>
              <td style={{ padding: '7px 4px', textAlign: 'right', color: 'var(--muted)' }}>{x.num}</td>
              <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700 }}>${fmt(x.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
)

// Rangos rápidos → { desde, hasta } en YYYY-MM-DD (hora SV)
const rangoRapido = (clave) => {
  const hoy = new Date()
  const y = hoy.getFullYear(), m = hoy.getMonth()
  const iso = (dt) => fechaSV(dt)
  if (clave === 'hoy') return { desde: hoySV(), hasta: hoySV() }
  if (clave === 'semana') {
    const d = new Date(hoy); const dia = (d.getDay() + 6) % 7 // lunes = 0
    d.setDate(d.getDate() - dia)
    return { desde: iso(d), hasta: hoySV() }
  }
  if (clave === 'mes') return { desde: iso(new Date(y, m, 1)), hasta: hoySV() }
  if (clave === 'mesAnterior') return { desde: iso(new Date(y, m - 1, 1)), hasta: iso(new Date(y, m, 0)) }
  return { desde: hoySV(), hasta: hoySV() }
}

export default function Reportes() {
  const { empresaId, esAdmin, rol, userId } = usePermisos()
  const [ventas, setVentas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [{ desde, hasta }, setRango] = useState(rangoRapido('mes'))

  // ── Cargar ventas de la empresa (cajero/vendedor solo ven las suyas) ──
  useEffect(() => {
    if (!empresaId) return
    const soloPropias = !esAdmin && (rol === 'cajero' || rol === 'vendedor')
    const q = soloPropias
      ? query(collection(db, 'ventas'), where('empresaId', '==', empresaId), where('cajeroId', '==', userId))
      : query(collection(db, 'ventas'), where('empresaId', '==', empresaId))
    const unsub = onSnapshot(q, (snap) => {
      setVentas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setCargando(false)
    }, () => setCargando(false))
    return () => unsub()
  }, [empresaId, esAdmin, rol, userId])

  // ── Filtrar por período (excluye anuladas) ──
  const delPeriodo = useMemo(() => {
    return ventas.filter(v => {
      if (v.estado === 'anulada') return false
      const f = fechaDeVenta(v)
      return f && f >= desde && f <= hasta
    })
  }, [ventas, desde, hasta])

  // ── Cálculos ──
  const datos = useMemo(() => {
    const resumen = { total: 0, subtotal: 0, iva: 0, ivaRete: 0, num: 0 }
    const porPago = {}, porTipo = {}, porVendedor = {}, porProducto = {}

    for (const v of delPeriodo) {
      const s = signo(v.tipoDte)
      const total = (Number(v.total) || 0) * s
      const sub = (Number(v.subtotal) || 0) * s
      const iva = (Number(v.iva) || 0) * s
      const rete = (Number(v.ivaRete) || 0) * s

      resumen.total += total; resumen.subtotal += sub; resumen.iva += iva; resumen.ivaRete += rete; resumen.num += 1

      const kp = labelPago(v)
      porPago[kp] = porPago[kp] || { label: kp, total: 0, num: 0 }
      porPago[kp].total += total; porPago[kp].num += 1

      const kt = LABEL_DTE[v.tipoDte] || v.tipoDte || 'Otro'
      porTipo[kt] = porTipo[kt] || { label: kt, total: 0, num: 0 }
      porTipo[kt].total += total; porTipo[kt].num += 1

      const kv = v.cajero || 'Sin asignar'
      porVendedor[kv] = porVendedor[kv] || { label: kv, total: 0, num: 0 }
      porVendedor[kv].total += total; porVendedor[kv].num += 1

      for (const it of (v.items || [])) {
        const clave = (it.codigo || it.nombre || '—').toString()
        porProducto[clave] = porProducto[clave] || { codigo: it.codigo || '', nombre: it.nombre || '—', qty: 0, monto: 0 }
        porProducto[clave].qty += (Number(it.qty) || 0) * s
        porProducto[clave].monto += (Number(it.subtotal) || 0) * s
      }
    }

    const ordenar = (obj) => Object.values(obj).sort((a, b) => b.total - a.total)
    return {
      resumen,
      ticket: resumen.num ? resumen.total / resumen.num : 0,
      porPago: ordenar(porPago),
      porTipo: ordenar(porTipo),
      porVendedor: ordenar(porVendedor),
      productos: Object.values(porProducto).sort((a, b) => b.qty - a.qty),
    }
  }, [delPeriodo])

  const setQuick = (clave) => setRango(rangoRapido(clave))

  // ── Exportar a Excel (varias hojas) ──
  const exportarExcel = () => {
    if (!delPeriodo.length) { orionAlert('No hay ventas en el período seleccionado.', { tipo: 'warning' }); return }
    const r = datos.resumen
    const wb = XLSX.utils.book_new()
    const n2 = (v) => Math.round((Number(v) || 0) * 100) / 100
    const FMT_MONEDA = '"$"#,##0.00'

    // Crea una hoja: fija anchos de columna (!cols) y formato de moneda ($) por columna.
    // cols = [{ w, money? }, …]  ·  encabezado en la primera fila del aoa.
    const nuevaHoja = (nombre, aoa, cols, filaEncabezado = 0) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = cols.map(c => ({ wch: c.w }))
      const rango = XLSX.utils.decode_range(ws['!ref'])
      cols.forEach((c, ci) => {
        if (!c.money) return
        for (let fila = filaEncabezado + 1; fila <= rango.e.r; fila++) {
          const addr = XLSX.utils.encode_cell({ r: fila, c: ci })
          const celda = ws[addr]
          if (celda && typeof celda.v === 'number') celda.z = FMT_MONEDA
        }
      })
      XLSX.utils.book_append_sheet(wb, ws, nombre)
    }

    // Resumen (etiqueta | valor); moneda en col B salvo las filas de conteo.
    const hResumen = [
      ['REPORTE DE VENTAS', ''],
      ['Período', `${desde} a ${hasta}`],
      ['', ''],
      ['Ventas netas', n2(r.total)],
      ['Gravado (neto sin IVA)', n2(r.subtotal)],
      ['IVA', n2(r.iva)],
      ['Retención IVA 1%', n2(r.ivaRete)],
      ['N.º de ventas', r.num],
      ['Ticket promedio', n2(datos.ticket)],
    ]
    nuevaHoja('Resumen', hResumen, [{ w: 24 }, { w: 18, money: true }], 2)

    const hoja = (nombre, filas, cols) => nuevaHoja(nombre, [cols.map(c => c.t), ...filas], cols)
    hoja('Por vendedor', datos.porVendedor.map(x => [x.label, x.num, n2(x.total)]),
      [{ t: 'Vendedor/Cajero', w: 28 }, { t: 'N.º ventas', w: 12 }, { t: 'Total', w: 16, money: true }])
    hoja('Por forma de pago', datos.porPago.map(x => [x.label, x.num, n2(x.total)]),
      [{ t: 'Forma de pago', w: 20 }, { t: 'N.º ventas', w: 12 }, { t: 'Total', w: 16, money: true }])
    hoja('Por tipo', datos.porTipo.map(x => [x.label, x.num, n2(x.total)]),
      [{ t: 'Tipo de documento', w: 22 }, { t: 'N.º ventas', w: 12 }, { t: 'Total', w: 16, money: true }])
    hoja('Productos', datos.productos.map(x => [x.codigo, x.nombre, n2(x.qty), n2(x.monto)]),
      [{ t: 'Código', w: 14 }, { t: 'Producto', w: 40 }, { t: 'Cantidad', w: 12 }, { t: 'Monto (neto)', w: 16, money: true }])
    hoja('Detalle', delPeriodo
      .slice()
      .sort((a, b) => fechaDeVenta(a).localeCompare(fechaDeVenta(b)))
      .map(v => [fechaDeVenta(v), v.numeroDte || '', v.tipoDte || '', v.cliente || '', v.cajero || '', labelPago(v), n2(v.total)]),
      [{ t: 'Fecha', w: 12 }, { t: 'N.º DTE', w: 16 }, { t: 'Tipo', w: 8 }, { t: 'Cliente', w: 30 }, { t: 'Vendedor', w: 22 }, { t: 'Forma de pago', w: 16 }, { t: 'Total', w: 14, money: true }])

    XLSX.writeFile(wb, `Reporte_ventas_${desde}_a_${hasta}.xlsx`)
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: COLOR }}>📈</span> Reportes
        </h1>
        <button className="btn btn-primary" onClick={exportarExcel} disabled={cargando || !delPeriodo.length}>
          ⬇️ Exportar a Excel
        </button>
      </div>

      {/* Filtro de período */}
      <div className="card" style={{ padding: 16, borderRadius: 14, marginBottom: 18, display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Desde</label>
          <input type="date" className="input" value={desde} max={hasta} onChange={e => setRango(r => ({ ...r, desde: e.target.value }))} style={{ padding: '7px 10px' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Hasta</label>
          <input type="date" className="input" value={hasta} min={desde} max={hoySV()} onChange={e => setRango(r => ({ ...r, hasta: e.target.value }))} style={{ padding: '7px 10px' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setQuick('hoy')}>Hoy</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setQuick('semana')}>Esta semana</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setQuick('mes')}>Este mes</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setQuick('mesAnterior')}>Mes anterior</button>
        </div>
      </div>

      {cargando ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando ventas…</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <Kpi label="Ventas netas" valor={datos.resumen.total} sub={`${datos.resumen.num} venta(s)`} />
            <Kpi label="Ticket promedio" valor={datos.ticket} />
            <Kpi label="Gravado (neto)" valor={datos.resumen.subtotal} />
            <Kpi label="IVA" valor={datos.resumen.iva} />
            {datos.resumen.ivaRete !== 0 && <Kpi label="Retención IVA 1%" valor={datos.resumen.ivaRete} />}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
            <TablaSimple titulo="Ventas por vendedor / cajero" filas={datos.porVendedor} />
            <TablaSimple titulo="Ventas por forma de pago" filas={datos.porPago} />
            <TablaSimple titulo="Ventas por tipo de documento" filas={datos.porTipo} />
          </div>

          {/* Productos más vendidos */}
          <div className="card" style={{ padding: 16, borderRadius: 14, marginTop: 18, overflowX: 'auto' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Productos más vendidos</h3>
            {datos.productos.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos en el período.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 420 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)', borderBottom: '1.5px solid var(--border)' }}>
                    <th style={{ padding: '6px 4px', width: 34 }}>#</th>
                    <th style={{ padding: '6px 4px' }}>Producto</th>
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>Cantidad</th>
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>Monto (neto)</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.productos.slice(0, 30).map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 4px', color: 'var(--muted)', fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: '7px 4px', fontWeight: 600 }}>
                        {p.nombre}{p.codigo ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {p.codigo}</span> : null}
                      </td>
                      <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700 }}>{fmt(p.qty)}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right' }}>${fmt(p.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {datos.productos.length > 30 && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Mostrando 30 de {datos.productos.length}. Exporta a Excel para ver todos.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
