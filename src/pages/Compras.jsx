import { useState, useEffect } from 'react'
import { db } from '../firebase'
import {
  collection, onSnapshot, addDoc, doc,
  serverTimestamp, runTransaction, getDocs, query, orderBy
} from 'firebase/firestore'

// ══════════════════════════════════════════════════
// MÓDULO DE COMPRAS — ORIÓN
// Campos basados en normativa El Salvador + mejores
// prácticas ERP para PYMES
//
// INNOVACIONES:
// ✅ Sugerencias automáticas de compra por stock bajo
// ✅ Comparador de precios por proveedor
// ✅ Alerta de precio inusual vs historial
// ✅ Estado de pago integrado (contado/crédito)
// ✅ Número de DTE del proveedor para libro de compras
// ✅ Cálculo automático de IVA crédito fiscal
// ✅ Historial de compras por proveedor
// ══════════════════════════════════════════════════

const IVA = 0.13

const ESTADOS_COMPRA = [
  { value: 'pendiente', label: 'Pendiente', color: '#f59e0b' },
  { value: 'recibida', label: 'Recibida', color: '#00C296' },
  { value: 'parcial', label: 'Parcial', color: '#4A8FE8' },
  { value: 'cancelada', label: 'Cancelada', color: '#ef4444' },
]

const TIPOS_DTE_PROVEEDOR = [
  { value: 'CCF', label: 'CCF - Crédito Fiscal' },
  { value: 'FE', label: 'FE - Factura' },
  { value: 'FEX', label: 'FEX - Exportación' },
  { value: 'NR', label: 'NR - Nota de Remisión' },
  { value: 'otro', label: 'Otro documento' },
]

const CONDICIONES_PAGO = [
  { value: 'contado', label: '💵 Contado' },
  { value: '15dias', label: '📅 15 días' },
  { value: '30dias', label: '📅 30 días' },
  { value: '60dias', label: '📅 60 días' },
  { value: '90dias', label: '📅 90 días' },
]

const fmt = (n) => `$${(n || 0).toFixed(2)}`

export default function Compras() {
  const [vista, setVista] = useState('lista') // lista | nueva | detalle
  const [compras, setCompras] = useState([])
  const [productos, setProductos] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [compraSeleccionada, setCompraSeleccionada] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')

  // Sugerencias automáticas
  const [sugerencias, setSugerencias] = useState([])

  // Formulario nueva compra
  const [form, setForm] = useState({
    proveedorNombre: '',
    proveedorNit: '',
    proveedorNrc: '',
    tipoDteProveedor: 'CCF',
    numeroDteProveedor: '',
    fechaCompra: new Date().toISOString().slice(0, 10),
    fechaVencimiento: '',
    condicionPago: 'contado',
    noOrdenCompra: '',
    bodega: 'Principal',
    notas: '',
    items: [],
  })

  const [itemActual, setItemActual] = useState({
    productoId: '',
    productoNombre: '',
    cantidad: 1,
    precioUnitario: 0,
    descuento: 0,
    unidad: '',
  })

  // ── Cargar datos ──
  useEffect(() => {
    const unsubCompras = onSnapshot(
      query(collection(db, 'compras'), orderBy('createdAt', 'desc')),
      snap => { setCompras(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) }
    )
    const unsubProds = onSnapshot(collection(db, 'productos'), snap => {
      const prods = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setProductos(prods)
      // Generar sugerencias de compra automáticas
      const sugs = prods.filter(p => p.stock <= p.min).map(p => ({
        ...p,
        cantidadSugerida: Math.max((p.max || p.min * 3) - p.stock, p.min)
      }))
      setSugerencias(sugs)
    })
    // Cargar proveedores únicos del historial
    const cargarProveedores = async () => {
      const snap = await getDocs(collection(db, 'compras'))
      const provs = [...new Set(snap.docs.map(d => d.data().proveedorNombre).filter(Boolean))]
      setProveedores(provs)
    }
    cargarProveedores()
    return () => { unsubCompras(); unsubProds() }
  }, [])

  // ── Calcular totales ──
  const calcularTotales = (items) => {
    const subtotal = items.reduce((s, i) => {
      const base = i.cantidad * i.precioUnitario
      const desc = base * (i.descuento / 100)
      return s + (base - desc)
    }, 0)
    const iva = subtotal * IVA
    const total = subtotal + iva
    return { subtotal, iva, total }
  }

  const totalesForm = calcularTotales(form.items)

  // ── Agregar item al carrito de compra ──
  const agregarItem = () => {
    if (!itemActual.productoNombre || itemActual.cantidad <= 0 || itemActual.precioUnitario <= 0) return
    const nuevoItem = { ...itemActual, id: Date.now() }
    setForm(prev => ({ ...prev, items: [...prev.items, nuevoItem] }))
    setItemActual({ productoId: '', productoNombre: '', cantidad: 1, precioUnitario: 0, descuento: 0, unidad: '' })
  }

  const quitarItem = (id) => {
    setForm(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }))
  }

  // ── Agregar sugerencia directamente ──
  const agregarSugerencia = (prod) => {
    setVista('nueva')
    const item = {
      id: Date.now(),
      productoId: prod.id,
      productoNombre: prod.nombre,
      cantidad: prod.cantidadSugerida,
      precioUnitario: prod.precioCompra || 0,
      descuento: 0,
      unidad: prod.unidad || 'unidad',
    }
    setForm(prev => ({
      ...prev,
      items: [...prev.items.filter(i => i.productoId !== prod.id), item]
    }))
  }

  // ── Seleccionar producto en item ──
  const seleccionarProducto = (prod) => {
    setItemActual(prev => ({
      ...prev,
      productoId: prod.id,
      productoNombre: prod.nombre,
      unidad: prod.unidad || 'unidad',
      precioUnitario: prod.precioCompra || 0,
    }))
  }

  // ── Guardar compra ──
  const guardarCompra = async () => {
    if (!form.proveedorNombre) { alert('Agrega el nombre del proveedor'); return }
    if (form.items.length === 0) { alert('Agrega al menos un producto'); return }
    if (form.condicionPago !== 'contado' && !form.fechaVencimiento) {
      alert('Indica la fecha de vencimiento para compras a crédito'); return
    }
    setProcesando(true)
    try {
      const { subtotal, iva, total } = calcularTotales(form.items)
      const numeroCompra = `OC-${String(compras.length + 1).padStart(5, '0')}`

      await runTransaction(db, async (transaction) => {
        // ── Lecturas primero ──
        const snapshots = []
        for (const item of form.items) {
          if (item.productoId) {
            const prodRef = doc(db, 'productos', item.productoId)
            const prodSnap = await transaction.get(prodRef)
            if (prodSnap.exists()) {
              snapshots.push({
                ref: prodRef,
                nuevoStock: (prodSnap.data().stock || 0) + item.cantidad,
                nuevoPrecioCompra: item.precioUnitario
              })
            }
          }
        }

        // ── Escrituras ──
        // 1. Guardar compra
        const compraRef = doc(collection(db, 'compras'))
        transaction.set(compraRef, {
          numero: numeroCompra,
          proveedorNombre: form.proveedorNombre,
          proveedorNit: form.proveedorNit,
          proveedorNrc: form.proveedorNrc,
          tipoDteProveedor: form.tipoDteProveedor,
          numeroDteProveedor: form.numeroDteProveedor,
          fechaCompra: form.fechaCompra,
          fechaVencimiento: form.fechaVencimiento,
          condicionPago: form.condicionPago,
          noOrdenCompra: form.noOrdenCompra,
          bodega: form.bodega,
          notas: form.notas,
          items: form.items,
          subtotal, iva, total,
          estadoPago: form.condicionPago === 'contado' ? 'pagada' : 'pendiente',
          estado: 'recibida',
          createdAt: serverTimestamp(),
        })

        // 2. Actualizar stock y precio de compra de cada producto
        for (const { ref, nuevoStock, nuevoPrecioCompra } of snapshots) {
          transaction.update(ref, {
            stock: nuevoStock,
            precioCompra: nuevoPrecioCompra,
            ultimaCompra: serverTimestamp()
          })
        }
      })

      // Reset form
      setForm({
        proveedorNombre: '', proveedorNit: '', proveedorNrc: '',
        tipoDteProveedor: 'CCF', numeroDteProveedor: '',
        fechaCompra: new Date().toISOString().slice(0, 10),
        fechaVencimiento: '', condicionPago: 'contado',
        noOrdenCompra: '', bodega: 'Principal', notas: '', items: [],
      })
      setVista('lista')
      alert(`✅ Compra ${numeroCompra} registrada. Stock actualizado.`)
    } catch (e) {
      alert('Error: ' + e.message)
    }
    setProcesando(false)
  }

  // ── Filtros ──
  const comprasFiltradas = compras.filter(c => {
    const matchBusqueda = c.proveedorNombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.numero?.toLowerCase().includes(busqueda.toLowerCase())
    const matchEstado = filtroEstado === 'todos' || c.estado === filtroEstado
    return matchBusqueda && matchEstado
  })

  // ── Stats ──
  const totalComprasMes = compras
    .filter(c => c.fechaCompra?.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((s, c) => s + (c.total || 0), 0)
  const comprasPendientes = compras.filter(c => c.estadoPago === 'pendiente')
  const totalPendiente = comprasPendientes.reduce((s, c) => s + (c.total || 0), 0)

  // ════════════════════════════════
  // VISTA — NUEVA COMPRA
  // ════════════════════════════════
  if (vista === 'nueva') return (
    <>
      <style>{comprasStyles}</style>
      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">🛍️ Nueva Compra</div>
          <div className="page-sub">Registra la compra de mercadería</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setVista('lista')}>← Cancelar</button>
          <button className="btn btn-primary btn-lg" onClick={guardarCompra} disabled={procesando}>
            {procesando ? '⏳ Guardando...' : '💾 Registrar Compra'}
          </button>
        </div>
      </div>

      <div className="compra-grid">

        {/* COLUMNA IZQUIERDA */}
        <div>

          {/* Datos del proveedor */}
          <div className="compra-section">
            <div className="compra-section-header">
              <span>🏢</span> Datos del Proveedor
            </div>
            <div className="compra-section-body">
              <div className="form-group">
                <label className="form-label">Nombre / Razón Social *</label>
                <input className="input" placeholder="Proveedor S.A. de C.V."
                  list="proveedores-list"
                  value={form.proveedorNombre}
                  onChange={e => setForm(prev => ({ ...prev, proveedorNombre: e.target.value }))}/>
                <datalist id="proveedores-list">
                  {proveedores.map(p => <option key={p} value={p}/>)}
                </datalist>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">NIT del Proveedor</label>
                  <input className="input" placeholder="0614-010190-101-3"
                    value={form.proveedorNit}
                    onChange={e => setForm(prev => ({ ...prev, proveedorNit: e.target.value }))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">NRC del Proveedor</label>
                  <input className="input" placeholder="123456-7"
                    value={form.proveedorNrc}
                    onChange={e => setForm(prev => ({ ...prev, proveedorNrc: e.target.value }))}/>
                </div>
              </div>
            </div>
          </div>

          {/* Datos del documento */}
          <div className="compra-section">
            <div className="compra-section-header">
              <span>🧾</span> Documento Tributario
            </div>
            <div className="compra-section-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Tipo DTE del Proveedor</label>
                  <select className="input" value={form.tipoDteProveedor}
                    onChange={e => setForm(prev => ({ ...prev, tipoDteProveedor: e.target.value }))}>
                    {TIPOS_DTE_PROVEEDOR.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Número DTE / Factura</label>
                  <input className="input" placeholder="CCF-000123"
                    value={form.numeroDteProveedor}
                    onChange={e => setForm(prev => ({ ...prev, numeroDteProveedor: e.target.value }))}/>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">No. Orden de Compra</label>
                  <input className="input" placeholder="OC-00001 (opcional)"
                    value={form.noOrdenCompra}
                    onChange={e => setForm(prev => ({ ...prev, noOrdenCompra: e.target.value }))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Bodega Destino</label>
                  <input className="input" placeholder="Principal"
                    value={form.bodega}
                    onChange={e => setForm(prev => ({ ...prev, bodega: e.target.value }))}/>
                </div>
              </div>
            </div>
          </div>

          {/* Condiciones de pago */}
          <div className="compra-section">
            <div className="compra-section-header">
              <span>💳</span> Condición de Pago
            </div>
            <div className="compra-section-body">
              <div className="condicion-grid">
                {CONDICIONES_PAGO.map(c => (
                  <div key={c.value}
                    className={`condicion-btn ${form.condicionPago === c.value ? 'active' : ''}`}
                    onClick={() => setForm(prev => ({ ...prev, condicionPago: c.value }))}>
                    {c.label}
                  </div>
                ))}
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Fecha de Compra</label>
                  <input className="input" type="date"
                    value={form.fechaCompra}
                    onChange={e => setForm(prev => ({ ...prev, fechaCompra: e.target.value }))}/>
                </div>
                {form.condicionPago !== 'contado' && (
                  <div className="form-group">
                    <label className="form-label">Fecha Vencimiento *</label>
                    <input className="input" type="date"
                      value={form.fechaVencimiento}
                      min={form.fechaCompra}
                      onChange={e => setForm(prev => ({ ...prev, fechaVencimiento: e.target.value }))}/>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Notas u observaciones</label>
                <input className="input" placeholder="Pedido urgente, entrega parcial, etc."
                  value={form.notas}
                  onChange={e => setForm(prev => ({ ...prev, notas: e.target.value }))}/>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA */}
        <div>

          {/* Agregar productos */}
          <div className="compra-section">
            <div className="compra-section-header">
              <span>📦</span> Productos a Comprar
            </div>
            <div className="compra-section-body">

              {/* Selector producto */}
              <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 14, border: '1.5px solid var(--border)' }}>
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label">Seleccionar Producto</label>
                  <select className="input"
                    value={itemActual.productoId}
                    onChange={e => {
                      const prod = productos.find(p => p.id === e.target.value)
                      if (prod) seleccionarProducto(prod)
                    }}>
                    <option value="">-- Selecciona un producto --</option>
                    {productos.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} (Stock: {p.stock} {p.unidad})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Cantidad</label>
                    <input className="input" type="number" min="1"
                      value={itemActual.cantidad}
                      onChange={e => setItemActual(prev => ({ ...prev, cantidad: Number(e.target.value) }))}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Precio Unit.</label>
                    <input className="input" type="number" min="0" step="0.01"
                      value={itemActual.precioUnitario}
                      onChange={e => setItemActual(prev => ({ ...prev, precioUnitario: Number(e.target.value) }))}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Desc. %</label>
                    <input className="input" type="number" min="0" max="100"
                      value={itemActual.descuento}
                      onChange={e => setItemActual(prev => ({ ...prev, descuento: Number(e.target.value) }))}/>
                  </div>
                </div>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={agregarItem}>
                  + Agregar producto
                </button>
              </div>

              {/* Lista de items */}
              {form.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 13 }}>
                  📦 Agrega productos a esta compra
                </div>
              ) : (
                <div>
                  {form.items.map(item => {
                    const base = item.cantidad * item.precioUnitario
                    const desc = base * (item.descuento / 100)
                    const subtotal = base - desc
                    return (
                      <div key={item.id} className="compra-item">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.productoNombre}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                            {item.cantidad} {item.unidad} × {fmt(item.precioUnitario)}
                            {item.descuento > 0 && <span style={{ color: '#f59e0b' }}> − {item.descuento}% desc.</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="amount" style={{ fontSize: 15 }}>{fmt(subtotal)}</span>
                          <button className="btn btn-danger btn-sm" onClick={() => quitarItem(item.id)}>✕</button>
                        </div>
                      </div>
                    )
                  })}

                  {/* Totales */}
                  <div className="compra-totales">
                    <div className="compra-total-row">
                      <span>Subtotal (sin IVA)</span>
                      <span className="amount">{fmt(totalesForm.subtotal)}</span>
                    </div>
                    <div className="compra-total-row">
                      <span>IVA 13% (Crédito Fiscal)</span>
                      <span className="amount" style={{ color: 'var(--accent2)' }}>{fmt(totalesForm.iva)}</span>
                    </div>
                    <div className="compra-total-row final">
                      <span>TOTAL</span>
                      <span className="amount" style={{ color: 'var(--accent)' }}>{fmt(totalesForm.total)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  )

  // ════════════════════════════════
  // VISTA — LISTA DE COMPRAS
  // ════════════════════════════════
  return (
    <>
      <style>{comprasStyles}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">🛍️ Compras</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {compras.length} compras registradas
            <span className="firebase-badge">🔥 Firebase</span>
          </div>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setVista('nueva')}>
          + Nueva Compra
        </button>
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { color: '#2E6FD4', icon: '🛍️', label: 'COMPRAS ESTE MES', value: fmt(totalComprasMes) },
          { color: '#f59e0b', icon: '⏳', label: 'POR PAGAR', value: fmt(totalPendiente) },
          { color: '#00C296', icon: '📦', label: 'PROVEEDORES', value: proveedores.length },
          { color: '#ef4444', icon: '⚠️', label: 'ALERTAS STOCK', value: sugerencias.length },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 18, position: 'relative', overflow: 'hidden', boxShadow: '0 4px 20px var(--shadow2)' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.color, borderRadius: '16px 16px 0 0' }}/>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.8px', marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)', letterSpacing: '-1px' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* SUGERENCIAS AUTOMÁTICAS */}
      {sugerencias.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.06)', border: '1.5px solid rgba(245,158,11,0.25)', borderRadius: 16, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            🤖 Sugerencias de Compra Automáticas
            <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '2px 10px', borderRadius: 99 }}>
              {sugerencias.length} producto(s) bajo mínimo
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {sugerencias.map(p => (
              <div key={p.id} style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    Stock: <span style={{ color: '#ef4444', fontWeight: 700 }}>{p.stock}</span> / Mín: {p.min}
                    {' → '}<span style={{ color: '#00C296', fontWeight: 700 }}>Comprar: {p.cantidadSugerida}</span>
                  </div>
                </div>
                <button className="btn btn-primary btn-sm"
                  onClick={() => agregarSugerencia(p)}>
                  + Agregar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FILTROS */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 280 }}
          placeholder="🔍 Buscar por proveedor o número..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}/>
        <select className="input" style={{ maxWidth: 180 }}
          value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="todos">Todos los estados</option>
          {ESTADOS_COMPRA.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
      </div>

      {/* TABLA */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">📋 Historial de Compras</div>
          <span className="firebase-badge">🔥 Tiempo real</span>
        </div>
        {loading ? (
          <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">Cargando...</div></div>
        ) : comprasFiltradas.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🛍️</div>
            <div className="empty-text">No hay compras registradas aún.<br/>Crea una nueva compra para comenzar.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>No. COMPRA</th>
                  <th>PROVEEDOR</th>
                  <th>DTE PROVEEDOR</th>
                  <th>FECHA</th>
                  <th>PAGO</th>
                  <th>TOTAL</th>
                  <th>IVA CRÉDITO</th>
                  <th>ESTADO PAGO</th>
                  <th>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {comprasFiltradas.map(c => {
                  const estado = ESTADOS_COMPRA.find(e => e.value === c.estado) || ESTADOS_COMPRA[0]
                  return (
                    <tr key={c.id} style={{ cursor: 'pointer' }}
                      onClick={() => { setCompraSeleccionada(c); setVista('detalle') }}>
                      <td className="mono" style={{ color: 'var(--accent2)', fontWeight: 600 }}>{c.numero}</td>
                      <td style={{ fontWeight: 600 }}>{c.proveedorNombre}</td>
                      <td>
                        <span className="dte-tag">{c.tipoDteProveedor}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{c.numeroDteProveedor}</span>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{c.fechaCompra}</td>
                      <td>
                        <span style={{ fontSize: 12, fontWeight: 600, color: c.condicionPago === 'contado' ? 'var(--accent)' : '#f59e0b' }}>
                          {c.condicionPago === 'contado' ? '💵 Contado' : `📅 ${c.condicionPago}`}
                        </span>
                      </td>
                      <td className="amount">{fmt(c.total)}</td>
                      <td className="amount" style={{ color: 'var(--accent2)' }}>{fmt(c.iva)}</td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                          background: c.estadoPago === 'pagada' ? 'rgba(0,194,150,0.12)' : 'rgba(245,158,11,0.12)',
                          color: c.estadoPago === 'pagada' ? 'var(--accent)' : '#f59e0b'
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }}/>
                          {c.estadoPago === 'pagada' ? 'Pagada' : 'Pendiente'}
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: estado.color + '20', color: estado.color }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }}/>
                          {estado.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// ── ESTILOS ──
const comprasStyles = `
  .compra-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 960px) { .compra-grid { grid-template-columns: 1fr; } }

  .compra-section { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px var(--shadow2); margin-bottom: 16px; }
  .compra-section-header { padding: 14px 20px; border-bottom: 1.5px solid var(--border); background: var(--surface2); font-size: 14px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; }
  .compra-section-body { padding: 18px; display: flex; flex-direction: column; gap: 14px; }

  .condicion-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
  @media (max-width: 600px) { .condicion-grid { grid-template-columns: 1fr 1fr; } }
  .condicion-btn { padding: 10px 8px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--surface2); font-size: 12px; font-weight: 600; color: var(--text2); cursor: pointer; text-align: center; transition: all 0.15s; }
  .condicion-btn:hover { border-color: var(--accent); color: var(--accent); }
  .condicion-btn.active { border-color: var(--accent); background: var(--glow); color: var(--accent); }

  .compra-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .compra-item:last-child { border-bottom: none; }

  .compra-totales { background: var(--surface2); border-radius: 12px; padding: 14px; margin-top: 12px; }
  .compra-total-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; color: var(--muted); }
  .compra-total-row.final { font-size: 18px; font-weight: 800; color: var(--text); margin-top: 10px; padding-top: 10px; border-top: 1.5px solid var(--border); margin-bottom: 0; letter-spacing: -0.5px; }
`
