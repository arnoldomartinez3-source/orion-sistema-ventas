import { useState, useEffect, useMemo } from 'react'
import { db } from '../firebase'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'
import { orionAlert } from '../orionDialog'
import { imprimirIframe } from '../utils/imprimir'
import * as XLSX from 'xlsx'

// ══════════════════════════════════════════════════════════════════
// REPORTES (disponible en TODOS los planes; gated por permiso ver_reportes)
// Lee la colección `ventas` de la empresa y genera un análisis del período.
//  Etapa 1 · Resumen, por forma de pago / tipo / vendedor, más vendidos,
//            exportar a Excel.
//  Etapa 2 · Gráfica de ventas por día, comparativa con el período anterior,
//            imprimir/PDF.
//  Etapa 3 · Top clientes y crédito por cobrar (estado actual).
// NOTA: los productos no guardan costo de compra, así que NO se calcula
//       margen/utilidad (se necesitaría costeo aparte para no mentir números).
// Es solo lectura y cálculo en cliente.
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

// Aritmética de fechas sobre strings YYYY-MM-DD sin corrimiento de zona
// (mediodía UTC: un ±6h de El Salvador nunca cruza de día).
const aFecha = (s) => new Date(s + 'T12:00:00Z')
const aStr = (dt) => dt.toISOString().slice(0, 10)
const sumarDias = (s, n) => { const d = aFecha(s); d.setUTCDate(d.getUTCDate() + n); return aStr(d) }
const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 86400000)
// Variación porcentual (null si no hay base con la cual comparar)
const variacion = (act, ant) => (ant ? ((act - ant) / Math.abs(ant)) * 100 : null)

// ── Presentacionales (fuera del render para no recrearlos en cada pintado) ──

// Gráfica de barras vertical (CSS puro: sin librería, respeta el tema).
const GraficaBarras = ({ series, alto = 170 }) => {
  if (!series.length) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos en el período.</div>
  const max = Math.max(...series.map(d => d.valor), 1)
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: Math.max(280, series.length * 16), height: alto, display: 'flex', alignItems: 'flex-end', gap: 3, padding: '6px 2px 0' }}>
        {series.map((d, i) => (
          <div key={i} title={`${d.titulo || d.label}: $${fmt(d.valor)}`} style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', minWidth: 10 }}>
            <div style={{ width: '100%', maxWidth: 24, height: `${Math.max(2, (d.valor / max) * 100)}%`, background: COLOR, borderRadius: '4px 4px 0 0', opacity: 0.85 }} />
            <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4, whiteSpace: 'nowrap' }}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Badge de variación (▲ verde / ▼ rojo) vs. período anterior
const BadgeVar = ({ pct }) => {
  if (pct === null || pct === undefined) return <span style={{ fontSize: 11, color: 'var(--muted)' }}>sin base previa</span>
  const sube = pct >= 0
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: sube ? '#12a06b' : '#dc2626' }}>
      {sube ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}
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
    const porPago = {}, porTipo = {}, porVendedor = {}, porProducto = {}, porCliente = {}, porDia = {}

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

      const kc = v.cliente || 'Consumidor Final'
      porCliente[kc] = porCliente[kc] || { label: kc, total: 0, num: 0 }
      porCliente[kc].total += total; porCliente[kc].num += 1

      const kf = fechaDeVenta(v)
      if (kf) { porDia[kf] = porDia[kf] || { fecha: kf, valor: 0 }; porDia[kf].valor += total }

      for (const it of (v.items || [])) {
        const clave = (it.codigo || it.nombre || '—').toString()
        porProducto[clave] = porProducto[clave] || { codigo: it.codigo || '', nombre: it.nombre || '—', qty: 0, monto: 0 }
        porProducto[clave].qty += (Number(it.qty) || 0) * s
        porProducto[clave].monto += (Number(it.subtotal) || 0) * s
      }
    }

    const ordenar = (obj) => Object.values(obj).sort((a, b) => b.total - a.total)
    const serieDia = Object.values(porDia)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map(d => ({ label: d.fecha.slice(8, 10), titulo: d.fecha, valor: d.valor }))
    return {
      resumen,
      ticket: resumen.num ? resumen.total / resumen.num : 0,
      porPago: ordenar(porPago),
      porTipo: ordenar(porTipo),
      porVendedor: ordenar(porVendedor),
      clientes: ordenar(porCliente),
      serieDia,
      productos: Object.values(porProducto).sort((a, b) => b.qty - a.qty),
    }
  }, [delPeriodo])

  // ── Comparativa con el período inmediatamente anterior (mismo # de días) ──
  const comparativa = useMemo(() => {
    if (!desde || !hasta || hasta < desde) return null
    const dias = diasEntre(desde, hasta) + 1
    const pHasta = sumarDias(desde, -1)
    const pDesde = sumarDias(pHasta, -(dias - 1))
    let total = 0, num = 0
    for (const v of ventas) {
      if (v.estado === 'anulada') continue
      const f = fechaDeVenta(v)
      if (!f || f < pDesde || f > pHasta) continue
      total += (Number(v.total) || 0) * signo(v.tipoDte); num += 1
    }
    return { desde: pDesde, hasta: pHasta, total, num }
  }, [ventas, desde, hasta])

  // ── Crédito por cobrar (estado ACTUAL, no depende del filtro de fechas) ──
  const credito = useMemo(() => {
    const hoy = hoySV()
    const filas = ventas
      .filter(v => v.tipoPago === 'credito' && v.estadoPago !== 'pagada' && v.estado !== 'anulada')
      .map(v => {
        const monto = Number(v.totalPagar) || Number(v.total) || 0
        const venc = v.fechaVencimiento || ''
        return {
          cliente: v.cliente || 'Consumidor Final',
          fecha: fechaDeVenta(v),
          vencimiento: venc,
          diasVencido: venc && venc < hoy ? diasEntre(venc, hoy) : 0,
          monto,
        }
      })
      .sort((a, b) => (a.vencimiento || '9999').localeCompare(b.vencimiento || '9999'))
    return { filas, total: filas.reduce((s, f) => s + f.monto, 0), vencido: filas.reduce((s, f) => s + (f.diasVencido > 0 ? f.monto : 0), 0) }
  }, [ventas])

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
    hoja('Clientes', datos.clientes.map(x => [x.label, x.num, n2(x.total)]),
      [{ t: 'Cliente', w: 32 }, { t: 'N.º ventas', w: 12 }, { t: 'Total', w: 16, money: true }])
    if (credito.filas.length) {
      hoja('Credito por cobrar', credito.filas.map(c => [c.cliente, c.fecha, c.vencimiento, c.diasVencido || '', n2(c.monto)]),
        [{ t: 'Cliente', w: 32 }, { t: 'Fecha', w: 12 }, { t: 'Vence', w: 12 }, { t: 'Días vencido', w: 12 }, { t: 'Monto', w: 16, money: true }])
    }
    hoja('Detalle', delPeriodo
      .slice()
      .sort((a, b) => fechaDeVenta(a).localeCompare(fechaDeVenta(b)))
      .map(v => [fechaDeVenta(v), v.numeroDte || '', v.tipoDte || '', v.cliente || '', v.cajero || '', labelPago(v), n2(v.total)]),
      [{ t: 'Fecha', w: 12 }, { t: 'N.º DTE', w: 16 }, { t: 'Tipo', w: 8 }, { t: 'Cliente', w: 30 }, { t: 'Vendedor', w: 22 }, { t: 'Forma de pago', w: 16 }, { t: 'Total', w: 14, money: true }])

    XLSX.writeFile(wb, `Reporte_ventas_${desde}_a_${hasta}.xlsx`)
  }

  // ── Imprimir / PDF (HTML limpio en iframe oculto) ──
  const imprimirReporte = () => {
    if (!delPeriodo.length) { orionAlert('No hay ventas en el período seleccionado.', { tipo: 'warning' }); return }
    const r = datos.resumen
    const kpi = (label, valor) => `<div class="sc"><div class="sv">$${fmt(valor)}</div><div class="sl">${label}</div></div>`
    const tabla = (titulo, filas) => `<div class="tt">${titulo}</div><table><thead><tr><th>Concepto</th><th class="r">N.º</th><th class="r">Total</th></tr></thead><tbody>${filas.map(x => `<tr><td>${x.label}</td><td class="r">${x.num}</td><td class="r">$${fmt(x.total)}</td></tr>`).join('')}</tbody></table>`
    const comp = comparativa
      ? `<div class="cmp">vs. período anterior (${comparativa.desde} a ${comparativa.hasta}): $${fmt(comparativa.total)} · ${comparativa.num} venta(s)${variacion(r.total, comparativa.total) !== null ? ` · ${variacion(r.total, comparativa.total) >= 0 ? '▲' : '▼'} ${Math.abs(variacion(r.total, comparativa.total)).toFixed(1)}%` : ''}</div>`
      : ''
    const prod = `<div class="tt">Productos más vendidos</div><table><thead><tr><th>#</th><th>Producto</th><th class="r">Cant.</th><th class="r">Monto</th></tr></thead><tbody>${datos.productos.slice(0, 20).map((p, i) => `<tr><td>${i + 1}</td><td>${p.nombre}${p.codigo ? ' · ' + p.codigo : ''}</td><td class="r">${fmt(p.qty)}</td><td class="r">$${fmt(p.monto)}</td></tr>`).join('')}</tbody></table>`

    imprimirIframe(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Reporte de ventas</title><style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;color:#1a1a2e;font-size:12px;padding:28px}
      .t{font-size:22px;font-weight:900;color:#22345F}.f{font-size:12px;color:#6b7280;margin:2px 0 14px}
      .cmp{font-size:11px;color:#6b7280;margin-bottom:16px}
      .s{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
      .sc{background:#f6f5fb;border:1px solid #e7e4f2;border-radius:10px;padding:12px;text-align:center}
      .sv{font-size:18px;font-weight:900;color:#22345F;font-family:monospace}.sl{font-size:9px;color:#9ca3af;text-transform:uppercase;margin-top:4px}
      .tt{font-size:13px;font-weight:800;color:#22345F;margin:16px 0 6px}
      table{width:100%;border-collapse:collapse;margin-bottom:6px}thead{background:#22345F;color:#fff}
      th{padding:6px 9px;text-align:left;font-size:10px}td{padding:6px 9px;border-bottom:1px solid #eef0f6;font-size:11px}.r{text-align:right}
      .ft{text-align:center;margin-top:20px;font-size:10px;color:#9ca3af}
      @media print{@page{margin:14mm}}
    </style></head><body>
      <div class="t">Reporte de Ventas</div>
      <div class="f">Período: ${desde} a ${hasta}</div>
      ${comp}
      <div class="s">${kpi('Ventas netas', r.total)}${kpi('Ticket promedio', datos.ticket)}${kpi('Gravado (neto)', r.subtotal)}${kpi('IVA', r.iva)}</div>
      ${tabla('Ventas por vendedor / cajero', datos.porVendedor)}
      ${tabla('Ventas por forma de pago', datos.porPago)}
      ${tabla('Ventas por tipo de documento', datos.porTipo)}
      ${prod}
      ${datos.clientes.length ? tabla('Top clientes', datos.clientes.slice(0, 15)) : ''}
      <div class="ft">ORIÓN · ONE GEO SYSTEMS · ${new Date().toLocaleString('es-SV')}</div>
    </body></html>`)
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: COLOR }}>📈</span> Reportes
        </h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={imprimirReporte} disabled={cargando || !delPeriodo.length}>
            🖨️ Imprimir / PDF
          </button>
          <button className="btn btn-primary" onClick={exportarExcel} disabled={cargando || !delPeriodo.length}>
            ⬇️ Exportar a Excel
          </button>
        </div>
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
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <Kpi label="Ventas netas" valor={datos.resumen.total} sub={`${datos.resumen.num} venta(s)`} />
            <Kpi label="Ticket promedio" valor={datos.ticket} />
            <Kpi label="Gravado (neto)" valor={datos.resumen.subtotal} />
            <Kpi label="IVA" valor={datos.resumen.iva} />
            {datos.resumen.ivaRete !== 0 && <Kpi label="Retención IVA 1%" valor={datos.resumen.ivaRete} />}
          </div>

          {/* Comparativa con el período anterior */}
          {comparativa && (
            <div className="card" style={{ padding: '10px 16px', borderRadius: 12, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ color: 'var(--muted)' }}>vs. período anterior ({comparativa.desde} a {comparativa.hasta}):</span>
              <strong>${fmt(comparativa.total)}</strong>
              <span style={{ color: 'var(--muted)' }}>· {comparativa.num} venta(s)</span>
              <BadgeVar pct={variacion(datos.resumen.total, comparativa.total)} />
            </div>
          )}

          {/* Gráfica de ventas por día */}
          <div className="card" style={{ padding: 16, borderRadius: 14, marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Ventas por día</h3>
            <GraficaBarras series={datos.serieDia} />
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

          {/* Top clientes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, marginTop: 18 }}>
            <TablaSimple titulo="Top clientes" filas={datos.clientes.slice(0, 15)} />

            {/* Crédito por cobrar (estado actual) */}
            <div className="card" style={{ padding: 16, borderRadius: 14, overflowX: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>Crédito por cobrar</h3>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>estado actual (no del período)</span>
              </div>
              {credito.filas.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin créditos pendientes. 🎉</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
                    <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Total pendiente</div><div style={{ fontSize: 20, fontWeight: 800 }}>${fmt(credito.total)}</div></div>
                    {credito.vencido > 0 && <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Vencido</div><div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626' }}>${fmt(credito.vencido)}</div></div>}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 360 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--muted)', borderBottom: '1.5px solid var(--border)' }}>
                        <th style={{ padding: '6px 4px' }}>Cliente</th>
                        <th style={{ padding: '6px 4px' }}>Vence</th>
                        <th style={{ padding: '6px 4px', textAlign: 'right' }}>Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {credito.filas.slice(0, 20).map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 4px', fontWeight: 600 }}>{c.cliente}</td>
                          <td style={{ padding: '7px 4px' }}>
                            {c.vencimiento || '—'}
                            {c.diasVencido > 0 && <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 11 }}> ({c.diasVencido}d)</span>}
                          </td>
                          <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700 }}>${fmt(c.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {credito.filas.length > 20 && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Mostrando 20 de {credito.filas.length}.</div>}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
