import { useState, useEffect, useRef } from 'react'
import { db } from '../firebase'
import {
  collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, runTransaction, getDocs, query, orderBy, where
} from 'firebase/firestore'
import * as XLSX from 'xlsx'

// ══════════════════════════════════════════════════
// COMPRAS ORIÓN — Panel completo con proveedores,
// órdenes inteligentes y estadísticas
// ══════════════════════════════════════════════════

const IVA = 0.13

const ESTADOS_COMPRA = [
  { value: 'pendiente', label: 'Pendiente',  color: '#f59e0b' },
  { value: 'recibida',  label: 'Recibida',   color: '#00C296' },
  { value: 'parcial',   label: 'Parcial',    color: '#4A8FE8' },
  { value: 'cancelada', label: 'Cancelada',  color: '#ef4444' },
]

const ESTADOS_OC = [
  { value: 'borrador',  label: 'Borrador',   color: '#6b7280' },
  { value: 'enviada',   label: 'Enviada',    color: '#4A8FE8' },
  { value: 'aprobada',  label: 'Aprobada',   color: '#00C296' },
  { value: 'recibida',  label: 'Recibida',   color: '#8b5cf6' },
  { value: 'cancelada', label: 'Cancelada',  color: '#ef4444' },
]

const TIPOS_DTE_PROVEEDOR = [
  { value: 'CCF',  label: 'CCF - Credito Fiscal' },
  { value: 'FE',   label: 'FE - Factura' },
  { value: 'FEX',  label: 'FEX - Exportacion' },
  { value: 'NR',   label: 'NR - Nota de Remision' },
  { value: 'otro', label: 'Otro documento' },
]

const CONDICIONES_PAGO = [
  { value: 'contado', label: '💵 Contado' },
  { value: '15dias',  label: '📅 15 dias' },
  { value: '30dias',  label: '📅 30 dias' },
  { value: '60dias',  label: '📅 60 dias' },
  { value: '90dias',  label: '📅 90 dias' },
]

const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`

const FORM_INICIAL = {
  proveedorNombre: '', proveedorNit: '', proveedorNrc: '',
  tipoDteProveedor: 'CCF', numeroDteProveedor: '',
  fechaCompra: new Date().toISOString().slice(0, 10),
  fechaVencimiento: '', condicionPago: 'contado',
  noOrdenCompra: '', bodega: 'Principal', notas: '', items: [],
}

const ITEM_INICIAL = {
  productoId: '', productoNombre: '', codigoProducto: '',
  cantidad: 1, precioUnitario: 0, descuento: 0, unidad: '',
}

const comprasStyles = `
  /* PANEL */
  .comp-panel { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 28px; }
  @media (max-width: 900px) { .comp-panel { grid-template-columns: repeat(2,1fr); } }
  @media (max-width: 600px) { .comp-panel { grid-template-columns: 1fr; } }

  .comp-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 18px; padding: 22px; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; box-shadow: 0 4px 20px var(--shadow2); }
  .comp-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background: var(--cc-color, var(--accent)); }
  .comp-card:hover { transform: translateY(-3px); border-color: var(--cc-color, var(--accent)); box-shadow: 0 8px 30px var(--shadow); }
  .comp-card-icon { font-size: 34px; margin-bottom: 12px; }
  .comp-card-title { font-size: 14px; font-weight: 800; margin-bottom: 6px; }
  .comp-card-val { font-size: 26px; font-weight: 900; font-family: var(--mono); letter-spacing: -1px; }
  .comp-card-sub { font-size: 11px; color: var(--muted); margin-top: 5px; line-height: 1.4; }
  .comp-card-badge { position: absolute; top: 14px; right: 14px; background: var(--cc-color, var(--accent)); color: #fff; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 99px; }

  .comp-back { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; margin-bottom: 20px; padding: 8px 14px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--surface2); transition: all 0.15s; }
  .comp-back:hover { color: var(--accent); border-color: var(--accent); }

  /* COMPRA FORM */
  .compra-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 960px) { .compra-grid { grid-template-columns: 1fr; } }
  .compra-section { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px var(--shadow2); margin-bottom: 16px; }
  .compra-section-header { padding: 14px 20px; border-bottom: 1.5px solid var(--border); background: var(--surface2); font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .compra-section-body { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
  .condicion-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
  .condicion-btn { padding: 10px 8px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--surface2); font-size: 12px; font-weight: 600; color: var(--text2); cursor: pointer; text-align: center; transition: all 0.15s; }
  .condicion-btn:hover { border-color: var(--accent); color: var(--accent); }
  .condicion-btn.active { border-color: var(--accent); background: var(--glow); color: var(--accent); }
  .compra-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .compra-item:last-child { border-bottom: none; }
  .compra-totales { background: var(--surface2); border-radius: 12px; padding: 14px; margin-top: 12px; }
  .compra-total-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; color: var(--muted); }
  .compra-total-row.final { font-size: 18px; font-weight: 800; color: var(--text); margin-top: 10px; padding-top: 10px; border-top: 1.5px solid var(--border); margin-bottom: 0; }

  /* PROVEEDORES */
  .prov-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
  @media (max-width: 900px) { .prov-grid { grid-template-columns: repeat(2,1fr); } }
  .prov-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; padding: 20px; box-shadow: 0 4px 20px var(--shadow2); transition: all 0.2s; }
  .prov-card:hover { border-color: var(--accent); transform: translateY(-2px); }
  .prov-avatar { width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg,#2E6FD4,#4A8FE8); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; color: #fff; margin-bottom: 12px; }

  /* ORDEN INTELIGENTE */
  .oc-item { display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-radius: 12px; border: 1.5px solid var(--border); background: var(--surface2); margin-bottom: 8px; transition: all 0.15s; }
  .oc-item:hover { border-color: var(--accent); }
  .oc-semaforo { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }

  /* ESTADÍSTICAS */
  .stats-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 20px; }
  @media (max-width: 700px) { .stats-grid { grid-template-columns: 1fr; } }
  .stat-box { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 14px; padding: 18px; text-align: center; }
  .stat-box-val { font-size: 24px; font-weight: 900; font-family: var(--mono); letter-spacing: -1px; }
  .stat-box-label { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; margin-top: 5px; }

  /* TOOLBAR */
  .comp-toolbar { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; align-items: center; }
  .comp-toolbar .input { max-width: 300px; }
  .firebase-badge { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,160,0,0.12); color: #ffa000; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 6px; }
  .dte-tag { display: inline-flex; align-items: center; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 5px; background: rgba(74,143,232,0.12); color: var(--accent2); font-family: var(--mono); }
`

// Imprimir con iframe
const imprimirIframe = (html) => {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'
  document.body.appendChild(iframe)
  iframe.contentDocument.open()
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 800)
  }
}

export default function Compras() {
  // Vista: panel | lista | nueva | proveedores | orden | estadisticas | sugerencias
  const [vista, setVista] = useState('panel')
  const [compras, setCompras] = useState([])
  const [productos, setProductos] = useState([])
  const [proveedoresBD, setProveedoresBD] = useState([]) // colección proveedores
  const [loading, setLoading] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [compraEditando, setCompraEditando] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [busProveedor, setBusProveedor] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [sugerencias, setSugerencias] = useState([])
  const [modalEliminar, setModalEliminar] = useState(null)
  const [form, setForm] = useState(FORM_INICIAL)
  const [itemActual, setItemActual] = useState(ITEM_INICIAL)
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [dropdownVisible, setDropdownVisible] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Proveedores CRUD
  const [modalProveedor, setModalProveedor] = useState(false)
  const [editandoProveedor, setEditandoProveedor] = useState(null)
  const [formProveedor, setFormProveedor] = useState({ nombre: '', contacto: '', telefono: '', email: '', nit: '', nrc: '', direccion: '', condicionPago: 'contado', notas: '' })

  // Orden Inteligente
  const [ordenItems, setOrdenItems] = useState([])
  const [ordenProveedor, setOrdenProveedor] = useState('')
  const [ordenNotas, setOrdenNotas] = useState('')
  const [generandoOrden, setGenerandoOrden] = useState(false)

  const busquedaRef = useRef(null)
  const fileRef = useRef()

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, 'compras'), orderBy('createdAt', 'desc')), snap => { setCompras(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) })
    const u2 = onSnapshot(collection(db, 'productos'), snap => {
      const prods = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setProductos(prods)
      setSugerencias(prods.filter(p => (p.stock || 0) <= (p.min || 0)).map(p => ({ ...p, cantidadSugerida: Math.max((p.max || (p.min || 1) * 3) - (p.stock || 0), p.min || 1) })))
    })
    const u3 = onSnapshot(collection(db, 'proveedores'), snap => setProveedoresBD(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    return () => { u1(); u2(); u3() }
  }, [])

  useEffect(() => {
    const handleClick = (e) => { if (busquedaRef.current && !busquedaRef.current.contains(e.target)) setDropdownVisible(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const productosFiltrados = productos.filter(p => {
    const q = busquedaProducto.toLowerCase()
    return p.nombre?.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q)
  }).slice(0, 8)

  const seleccionarProducto = (prod) => {
    setItemActual(prev => ({ ...prev, productoId: prod.id, productoNombre: prod.nombre, codigoProducto: prod.codigo || '', unidad: prod.unidad || 'unidad', precioUnitario: prod.precioCompra || 0 }))
    setBusquedaProducto(prod.nombre)
    setDropdownVisible(false)
  }

  const calcularTotales = (items) => {
    const subtotal = items.reduce((s, i) => { const base = i.cantidad * i.precioUnitario; return s + base - base * (i.descuento / 100) }, 0)
    const iva = subtotal * IVA
    return { subtotal, iva, total: subtotal + iva }
  }

  const totalesForm = calcularTotales(form.items)

  const agregarItem = () => {
    if (!itemActual.productoNombre) { alert('Selecciona un producto'); return }
    if (itemActual.cantidad <= 0 || isNaN(itemActual.cantidad)) { alert('La cantidad debe ser mayor a cero'); return }
    if (itemActual.cantidad > 9999999) { alert('Cantidad demasiado alta. Máximo 9,999,999'); return }
    if (itemActual.precioUnitario < 0) { alert('El precio no puede ser negativo'); return }
    if (itemActual.precioUnitario > 999999) { alert('El precio es demasiado alto. Máximo $999,999'); return }
    if (itemActual.descuento < 0 || itemActual.descuento > 100) { alert('El descuento debe estar entre 0% y 100%'); return }
    setForm(prev => ({ ...prev, items: [...prev.items, { ...itemActual, id: Date.now() }] }))
    setItemActual(ITEM_INICIAL); setBusquedaProducto('')
  }

  const quitarItem = (id) => setForm(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }))

  const guardarCompra = async () => {
    // ── VALIDACIONES ──
    const errores = []
    if (!form.proveedorNombre?.trim()) errores.push('El proveedor es obligatorio')
    if (form.items.length === 0) errores.push('Agrega al menos un producto')
    if (form.items.length > 200) errores.push('Demasiados productos. Máximo 200 por compra')
    if (form.condicionPago !== 'contado' && !form.fechaVencimiento) errores.push('Indica la fecha de vencimiento del crédito')
    if (form.condicionPago !== 'contado' && form.fechaVencimiento <= form.fechaCompra) errores.push('La fecha de vencimiento debe ser posterior a la fecha de compra')
    if (!form.fechaCompra) errores.push('La fecha de compra es obligatoria')

    // Validar items
    for (const item of form.items) {
      if (item.cantidad <= 0) errores.push(`Cantidad inválida en "${item.productoNombre}"`)
      if (item.precioUnitario < 0) errores.push(`Precio inválido en "${item.productoNombre}"`)
      if (item.cantidad > 9999999) errores.push(`Cantidad demasiado alta en "${item.productoNombre}"`)
      if (item.precioUnitario > 999999) errores.push(`Precio demasiado alto en "${item.productoNombre}"`)
      if (item.descuento < 0 || item.descuento > 100) errores.push(`Descuento inválido en "${item.productoNombre}". Debe ser entre 0 y 100`)
    }

    const { total } = calcularTotales(form.items)
    if (total > 9999999) errores.push('El total de la compra excede el límite permitido')

    if (errores.length > 0) { alert(errores.join(' | ')); return }

    setProcesando(true)
    try {
      const { subtotal, iva, total } = calcularTotales(form.items)
      if (compraEditando) {
        await updateDoc(doc(db, 'compras', compraEditando.id), { ...form, subtotal, iva, total, updatedAt: serverTimestamp() })
        alert('✅ Compra actualizada')
      } else {
        const numeroCompra = `OC-${String(compras.length + 1).padStart(5, '0')}`
        await runTransaction(db, async (transaction) => {
          const snapshots = []
          for (const item of form.items) {
            if (item.productoId) {
              const ref = doc(db, 'productos', item.productoId)
              const snap = await transaction.get(ref)
              if (snap.exists()) snapshots.push({ ref, nuevoStock: (snap.data().stock || 0) + item.cantidad, nuevoPrecioCompra: item.precioUnitario })
            }
          }
          const compraRef = doc(collection(db, 'compras'))
          transaction.set(compraRef, { numero: numeroCompra, ...form, subtotal, iva, total, estadoPago: form.condicionPago === 'contado' ? 'pagada' : 'pendiente', estado: 'recibida', createdAt: serverTimestamp() })
          for (const { ref, nuevoStock, nuevoPrecioCompra } of snapshots) {
            transaction.update(ref, { stock: nuevoStock, precioCompra: nuevoPrecioCompra, ultimaCompra: serverTimestamp() })
          }
        })
        alert(`✅ Compra ${numeroCompra} registrada`)
      }
      setForm(FORM_INICIAL); setCompraEditando(null); setVista('lista')
    } catch (e) {
      if (e.message.includes('insuficiente')) {
        alert('❌ ' + e.message)
      } else {
        alert('❌ Error al guardar la compra: ' + e.message)
      }
    }
    setProcesando(false)
  }

  const editarCompra = (compra) => {
    setCompraEditando(compra)
    setForm({ proveedorNombre: compra.proveedorNombre || '', proveedorNit: compra.proveedorNit || '', proveedorNrc: compra.proveedorNrc || '', tipoDteProveedor: compra.tipoDteProveedor || 'CCF', numeroDteProveedor: compra.numeroDteProveedor || '', fechaCompra: compra.fechaCompra || '', fechaVencimiento: compra.fechaVencimiento || '', condicionPago: compra.condicionPago || 'contado', noOrdenCompra: compra.noOrdenCompra || '', bodega: compra.bodega || 'Principal', notas: compra.notas || '', items: compra.items || [] })
    setVista('nueva')
  }

  const eliminarCompra = async (compra) => {
    setProcesando(true)
    try { await deleteDoc(doc(db, 'compras', compra.id)); setModalEliminar(null) } catch (e) { alert('Error: ' + e.message) }
    setProcesando(false)
  }

  // ── PROVEEDORES ──
  const guardarProveedor = async () => {
    if (!formProveedor.nombre) return
    setGuardando(true)
    try {
      if (editandoProveedor) await updateDoc(doc(db, 'proveedores', editandoProveedor), { ...formProveedor, updatedAt: serverTimestamp() })
      else await addDoc(collection(db, 'proveedores'), { ...formProveedor, createdAt: serverTimestamp() })
      setModalProveedor(false); setEditandoProveedor(null)
      setFormProveedor({ nombre: '', contacto: '', telefono: '', email: '', nit: '', nrc: '', direccion: '', condicionPago: 'contado', notas: '' })
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const exportarProveedores = () => {
    const ws = XLSX.utils.json_to_sheet(proveedoresBD.map(p => ({ nombre: p.nombre, contacto: p.contacto || '', telefono: p.telefono || '', email: p.email || '', nit: p.nit || '', nrc: p.nrc || '', condicion: p.condicionPago || '' })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Proveedores')
    XLSX.writeFile(wb, `proveedores-${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  // ── ORDEN INTELIGENTE ──
  const generarOrdenInteligente = () => {
    const items = sugerencias.map(p => ({
      id: Date.now() + Math.random(),
      productoId: p.id, productoNombre: p.nombre,
      codigoProducto: p.codigo || '',
      stockActual: p.stock || 0, minimo: p.min || 0,
      cantidad: p.cantidadSugerida,
      precioUnitario: p.precioCompra || 0,
      unidad: p.unidad || 'unidad',
      proveedor: p.proveedor || '',
      seleccionado: true,
    }))
    setOrdenItems(items)
  }

  const imprimirOrden = () => {
    const itemsSeleccionados = ordenItems.filter(i => i.seleccionado)
    const total = itemsSeleccionados.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0)
    const numero = `OC-${String(compras.length + 1).padStart(5, '0')}`
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Orden de Compra</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',sans-serif;color:#1a1a2e;font-size:13px;padding:30px;}
.titulo{font-size:22px;font-weight:900;color:#1B2E6B;}.sub{font-size:12px;color:#6b7280;margin-bottom:20px;}
.info{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;}
.box{background:#f8faff;border:1px solid #e5eaf5;border-radius:10px;padding:14px;}
.box h3{font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;}
table{width:100%;border-collapse:collapse;margin-bottom:20px;}
thead{background:#1B2E6B;color:#fff;}th{padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;}
td{padding:9px 12px;border-bottom:1px solid #f0f4ff;font-size:12px;}
.total-box{background:#1B2E6B;color:#fff;border-radius:12px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;}
.firma{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:24px 0;}
.firma-linea{border-top:1.5px solid #1B2E6B;padding-top:6px;margin-top:36px;font-size:11px;color:#6b7280;text-align:center;}
.footer{text-align:center;margin-top:16px;font-size:11px;color:#9ca3af;}
@media print{@page{margin:15mm;}}
</style></head><body>
<div class="titulo">Orden de Compra — ${numero}</div>
<div class="sub">${new Date().toLocaleDateString('es-SV',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
<div class="info">
  <div class="box"><h3>Para Proveedor</h3><p style="font-weight:700;font-size:15px">${ordenProveedor || 'Proveedor por definir'}</p></div>
  <div class="box"><h3>Estado</h3><p style="font-weight:700;color:#00C296">🤖 Generada Automaticamente</p>${ordenNotas?`<p style="margin-top:6px;font-size:12px;color:#6b7280">${ordenNotas}</p>`:''}</div>
</div>
<table>
<thead><tr><th>#</th><th>Producto</th><th>Stock Actual</th><th>Minimo</th><th>Cantidad a Pedir</th><th>Unidad</th><th>Precio Unit.</th><th>Total</th></tr></thead>
<tbody>
${itemsSeleccionados.map((item,i)=>`<tr><td style="color:#9ca3af">${i+1}</td><td style="font-weight:600">${item.productoNombre}</td><td style="color:#ef4444;font-weight:700">${item.stockActual}</td><td>${item.minimo}</td><td style="font-weight:700;color:#1B2E6B">${item.cantidad}</td><td>${item.unidad}</td><td>$${item.precioUnitario.toFixed(2)}</td><td style="font-weight:700">$${(item.cantidad*item.precioUnitario).toFixed(2)}</td></tr>`).join('')}
</tbody>
</table>
<div class="total-box"><span style="font-size:14px;font-weight:700">TOTAL ESTIMADO</span><span style="font-size:24px;font-weight:900;font-family:monospace">$${total.toFixed(2)}</span></div>
<div class="firma"><div class="firma-linea">Solicitado por / Administrador</div><div class="firma-linea">Aprobado por</div></div>
<div class="footer">ORION · ONE GEO SYSTEMS · Orden generada automaticamente por analisis de stock</div>
</body></html>`
    imprimirIframe(html)
  }

  const enviarOrdenWA = () => {
    const itemsSeleccionados = ordenItems.filter(i => i.seleccionado)
    const total = itemsSeleccionados.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0)
    const numero = `OC-${String(compras.length + 1).padStart(5, '0')}`
    const msg = encodeURIComponent(
      `Estimado proveedor, le enviamos nuestra Orden de Compra *${numero}*:\n\n` +
      itemsSeleccionados.map(i => `• ${i.productoNombre}: *${i.cantidad} ${i.unidad}*`).join('\n') +
      `\n\n*Total estimado: $${total.toFixed(2)}*\n` +
      (ordenNotas ? `\nNotas: ${ordenNotas}\n` : '') +
      `\nGenerado por ORION · ONE GEO SYSTEMS`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  const convertirOrdenACompra = () => {
    const itemsSeleccionados = ordenItems.filter(i => i.seleccionado)
    setForm({ ...FORM_INICIAL, proveedorNombre: ordenProveedor, notas: `Orden generada automaticamente. ${ordenNotas}`, items: itemsSeleccionados.map(i => ({ id: Date.now() + Math.random(), productoId: i.productoId, productoNombre: i.productoNombre, codigoProducto: i.codigoProducto, cantidad: i.cantidad, precioUnitario: i.precioUnitario, descuento: 0, unidad: i.unidad })) })
    setCompraEditando(null); setVista('nueva')
  }

  // ── EXPORTAR ──
  const exportarCompras = () => {
    const ws = XLSX.utils.json_to_sheet(compras.map(c => ({ numero: c.numero, proveedor: c.proveedorNombre, nit: c.proveedorNit, tipoDte: c.tipoDteProveedor, numeroDte: c.numeroDteProveedor, fecha: c.fechaCompra, condicionPago: c.condicionPago, subtotal: c.subtotal?.toFixed(2), iva: c.iva?.toFixed(2), total: c.total?.toFixed(2), estadoPago: c.estadoPago, estado: c.estado })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Compras')
    XLSX.writeFile(wb, `compras-${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  // ── FILTROS ──
  const comprasFiltradas = compras.filter(c => {
    const q = busqueda.toLowerCase()
    const match = c.proveedorNombre?.toLowerCase().includes(q) || c.numero?.toLowerCase().includes(q) || c.numeroDteProveedor?.toLowerCase().includes(q)
    const est = filtroEstado === 'todos' || c.estado === filtroEstado
    return match && est
  })

  const proveedoresFiltrados = proveedoresBD.filter(p =>
    p.nombre?.toLowerCase().includes(busProveedor.toLowerCase()) ||
    p.contacto?.toLowerCase().includes(busProveedor.toLowerCase()) ||
    p.telefono?.includes(busProveedor)
  )

  // ── STATS ──
  const mesActual = new Date().toISOString().slice(0, 7)
  const totalMes = compras.filter(c => c.fechaCompra?.startsWith(mesActual)).reduce((s, c) => s + (c.total || 0), 0)
  const totalPendiente = compras.filter(c => c.estadoPago === 'pendiente').reduce((s, c) => s + (c.total || 0), 0)

  // Stats por proveedor
  const statsPorProveedor = proveedoresBD.map(p => {
    const comprasProveedor = compras.filter(c => c.proveedorNombre === p.nombre)
    const totalComprado = comprasProveedor.reduce((s, c) => s + (c.total || 0), 0)
    return { ...p, totalCompras: comprasProveedor.length, totalComprado }
  }).sort((a, b) => b.totalComprado - a.totalComprado)

  const BackBtn = ({ label = 'Panel' }) => (
    <div className="comp-back" onClick={() => setVista('panel')}>← {label}</div>
  )

  // ════════════════════════════════
  // VISTA NUEVA / EDITAR
  // ════════════════════════════════
  if (vista === 'nueva') return (
    <>
      <style>{comprasStyles}</style>
      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">{compraEditando ? '✏️ Editar Compra' : '🛍️ Nueva Compra'}</div>
          <div className="page-sub">{compraEditando ? `Editando ${compraEditando.numero}` : 'Registra la compra de mercaderia'}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => { setVista('lista'); setCompraEditando(null); setForm(FORM_INICIAL) }}>← Cancelar</button>
          <button className="btn btn-primary btn-lg" onClick={guardarCompra} disabled={procesando}>{procesando ? '⏳ Guardando...' : compraEditando ? '💾 Guardar Cambios' : '💾 Registrar Compra'}</button>
        </div>
      </div>

      <div className="compra-grid">
        <div>
          {/* Proveedor */}
          <div className="compra-section">
            <div className="compra-section-header">🏢 Datos del Proveedor</div>
            <div className="compra-section-body">
              <div className="form-group">
                <label className="form-label">Nombre / Razon Social *</label>
                <input className="input" placeholder="Proveedor S.A. de C.V." list="provs-list" value={form.proveedorNombre} onChange={e => setForm(p => ({ ...p, proveedorNombre: e.target.value }))}/>
                <datalist id="provs-list">{proveedoresBD.map(p => <option key={p.id} value={p.nombre}/>)}</datalist>
              </div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">NIT</label><input className="input" placeholder="0614-010190-101-3" value={form.proveedorNit} onChange={e => setForm(p => ({ ...p, proveedorNit: e.target.value }))}/></div>
                <div className="form-group"><label className="form-label">NRC</label><input className="input" placeholder="123456-7" value={form.proveedorNrc} onChange={e => setForm(p => ({ ...p, proveedorNrc: e.target.value }))}/></div>
              </div>
            </div>
          </div>

          {/* Documento */}
          <div className="compra-section">
            <div className="compra-section-header">🧾 Documento Tributario</div>
            <div className="compra-section-body">
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Tipo DTE</label><select className="input" value={form.tipoDteProveedor} onChange={e => setForm(p => ({ ...p, tipoDteProveedor: e.target.value }))}>{TIPOS_DTE_PROVEEDOR.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                <div className="form-group"><label className="form-label">No. DTE / Factura</label><input className="input" placeholder="CCF-000123" value={form.numeroDteProveedor} onChange={e => setForm(p => ({ ...p, numeroDteProveedor: e.target.value }))}/></div>
              </div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">No. Orden de Compra</label><input className="input" placeholder="Opcional" value={form.noOrdenCompra} onChange={e => setForm(p => ({ ...p, noOrdenCompra: e.target.value }))}/></div>
                <div className="form-group"><label className="form-label">Bodega Destino</label><input className="input" placeholder="Principal" value={form.bodega} onChange={e => setForm(p => ({ ...p, bodega: e.target.value }))}/></div>
              </div>
            </div>
          </div>

          {/* Pago */}
          <div className="compra-section">
            <div className="compra-section-header">💳 Condicion de Pago</div>
            <div className="compra-section-body">
              <div className="condicion-grid">
                {CONDICIONES_PAGO.map(c => <div key={c.value} className={`condicion-btn ${form.condicionPago === c.value ? 'active' : ''}`} onClick={() => setForm(p => ({ ...p, condicionPago: c.value }))}>{c.label}</div>)}
              </div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Fecha de Compra</label><input className="input" type="date" value={form.fechaCompra} onChange={e => setForm(p => ({ ...p, fechaCompra: e.target.value }))}/></div>
                {form.condicionPago !== 'contado' && <div className="form-group"><label className="form-label">Fecha Vencimiento *</label><input className="input" type="date" value={form.fechaVencimiento} min={form.fechaCompra} onChange={e => setForm(p => ({ ...p, fechaVencimiento: e.target.value }))}/></div>}
              </div>
              <div className="form-group"><label className="form-label">Notas</label><input className="input" placeholder="Pedido urgente, entrega parcial..." value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}/></div>
            </div>
          </div>
        </div>

        <div>
          <div className="compra-section">
            <div className="compra-section-header">📦 Productos a Comprar</div>
            <div className="compra-section-body">
              <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 14, border: '1.5px solid var(--border)' }}>
                <div className="form-group" style={{ marginBottom: 10, position: 'relative' }} ref={busquedaRef}>
                  <label className="form-label">Buscar producto</label>
                  <input className="input" placeholder="🔍 Nombre o codigo..." value={busquedaProducto} onChange={e => { setBusquedaProducto(e.target.value); setDropdownVisible(true) }} onFocus={() => setDropdownVisible(true)}/>
                  {dropdownVisible && busquedaProducto.length > 0 && productosFiltrados.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 30px var(--shadow)', maxHeight: 240, overflowY: 'auto', marginTop: 4 }}>
                      {productosFiltrados.map(p => (
                        <div key={p.id} style={{ padding: '11px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onMouseDown={() => seleccionarProducto(p)}>
                          <div><div style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre}</div><div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{p.codigo && <span style={{ fontFamily: 'var(--mono)', marginRight: 8, color: 'var(--accent2)' }}>{p.codigo}</span>}Stock: {p.stock} {p.unidad}</div></div>
                          <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>{fmt(p.precioCompra)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {itemActual.productoNombre && <div style={{ background: 'rgba(74,143,232,0.08)', border: '1px solid rgba(74,143,232,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: 'var(--accent2)' }}>✅ <strong>{itemActual.productoNombre}</strong></div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div className="form-group"><label className="form-label">Cantidad</label><input className="input" type="number" min="1" value={itemActual.cantidad} onChange={e => setItemActual(p => ({ ...p, cantidad: Number(e.target.value) }))}/></div>
                  <div className="form-group"><label className="form-label">Precio Unit.</label><input className="input" type="number" min="0" step="0.01" value={itemActual.precioUnitario} onChange={e => setItemActual(p => ({ ...p, precioUnitario: Number(e.target.value) }))}/></div>
                  <div className="form-group"><label className="form-label">Desc. %</label><input className="input" type="number" min="0" max="100" value={itemActual.descuento} onChange={e => setItemActual(p => ({ ...p, descuento: Number(e.target.value) }))}/></div>
                </div>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={agregarItem}>+ Agregar producto</button>
              </div>

              {form.items.length === 0 ? <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 13 }}>📦 Agrega productos</div> : (
                <div>
                  {form.items.map(item => {
                    const base = item.cantidad * item.precioUnitario
                    const subtotal = base - base * (item.descuento / 100)
                    return (
                      <div key={item.id} className="compra-item">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.productoNombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, fontFamily: 'var(--mono)' }}>
                            {item.codigoProducto && <span style={{ color: 'var(--accent2)', marginRight: 8 }}>{item.codigoProducto}</span>}
                            {item.cantidad} {item.unidad} × {fmt(item.precioUnitario)}
                            {item.descuento > 0 && <span style={{ color: '#f59e0b' }}> − {item.descuento}%</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="amount" style={{ fontSize: 15 }}>{fmt(subtotal)}</span>
                          <button className="btn btn-danger btn-sm" onClick={() => quitarItem(item.id)}>✕</button>
                        </div>
                      </div>
                    )
                  })}
                  <div className="compra-totales">
                    <div className="compra-total-row"><span>Subtotal (sin IVA)</span><span className="amount">{fmt(totalesForm.subtotal)}</span></div>
                    <div className="compra-total-row"><span>IVA 13%</span><span className="amount" style={{ color: 'var(--accent2)' }}>{fmt(totalesForm.iva)}</span></div>
                    <div className="compra-total-row final"><span>TOTAL</span><span className="amount" style={{ color: 'var(--accent)' }}>{fmt(totalesForm.total)}</span></div>
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
  // VISTAS DEL PANEL
  // ════════════════════════════════
  return (
    <>
      <style>{comprasStyles}</style>

      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">🛍️ Compras</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {compras.length} compras · {proveedoresBD.length} proveedores
            <span className="firebase-badge">🔥 Firebase</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {vista === 'lista' && <>
            <button className="btn btn-ghost btn-sm" onClick={exportarCompras}>📤 Exportar</button>
            <button className="btn btn-primary" onClick={() => { setForm(FORM_INICIAL); setCompraEditando(null); setVista('nueva') }}>+ Nueva Compra</button>
          </>}
          {vista === 'proveedores' && <button className="btn btn-primary" onClick={() => setModalProveedor(true)}>+ Nuevo Proveedor</button>}
          {vista === 'orden' && ordenItems.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={enviarOrdenWA}>💬 WhatsApp</button>
              <button className="btn btn-ghost btn-sm" onClick={imprimirOrden}>🖨️ PDF</button>
              <button className="btn btn-primary btn-sm" onClick={convertirOrdenACompra}>✅ Convertir a Compra</button>
            </div>
          )}
        </div>
      </div>

      {/* ══ PANEL ══ */}
      {vista === 'panel' && (
        <div className="comp-panel">
          <div className="comp-card" style={{ '--cc-color': '#2E6FD4' }} onClick={() => setVista('lista')}>
            <div className="comp-card-icon">📋</div>
            <div className="comp-card-title">Compras</div>
            <div className="comp-card-val" style={{ color: '#2E6FD4' }}>{compras.length}</div>
            <div className="comp-card-sub">historial de compras registradas</div>
          </div>
          <div className="comp-card" style={{ '--cc-color': '#00C296' }} onClick={() => setVista('proveedores')}>
            <div className="comp-card-icon">🏢</div>
            <div className="comp-card-title">Proveedores</div>
            <div className="comp-card-val" style={{ color: '#00C296' }}>{proveedoresBD.length}</div>
            <div className="comp-card-sub">proveedores registrados</div>
          </div>
          <div className="comp-card" style={{ '--cc-color': '#8b5cf6' }} onClick={() => { setVista('orden'); generarOrdenInteligente() }}>
            {sugerencias.length > 0 && <div className="comp-card-badge">{sugerencias.length}</div>}
            <div className="comp-card-icon">🤖</div>
            <div className="comp-card-title">Orden Inteligente</div>
            <div className="comp-card-val" style={{ color: '#8b5cf6' }}>{sugerencias.length}</div>
            <div className="comp-card-sub">productos bajo minimo para pedir</div>
          </div>
          <div className="comp-card" style={{ '--cc-color': '#f59e0b' }} onClick={() => setVista('pendientes')}>
            <div className="comp-card-icon">⏰</div>
            <div className="comp-card-title">Por Pagar</div>
            <div className="comp-card-val" style={{ color: '#f59e0b', fontSize: totalPendiente > 9999 ? 20 : 26 }}>{fmt(totalPendiente)}</div>
            <div className="comp-card-sub">{compras.filter(c => c.estadoPago === 'pendiente').length} compras pendientes</div>
          </div>
          <div className="comp-card" style={{ '--cc-color': '#ec4899' }} onClick={() => setVista('estadisticas')}>
            <div className="comp-card-icon">📊</div>
            <div className="comp-card-title">Estadisticas</div>
            <div className="comp-card-val" style={{ color: '#ec4899', fontSize: totalMes > 9999 ? 20 : 26 }}>{fmt(totalMes)}</div>
            <div className="comp-card-sub">comprado este mes</div>
          </div>
          <div className="comp-card" style={{ '--cc-color': '#ef4444' }} onClick={() => setVista('sugerencias')}>
            {sugerencias.length > 0 && <div className="comp-card-badge">{sugerencias.length}</div>}
            <div className="comp-card-icon">💡</div>
            <div className="comp-card-title">Sugerencias</div>
            <div className="comp-card-val" style={{ color: '#ef4444' }}>{sugerencias.length}</div>
            <div className="comp-card-sub">productos que necesitan reposicion</div>
          </div>
        </div>
      )}

      {/* ══ LISTA COMPRAS ══ */}
      {vista === 'lista' && (<>
        <BackBtn />
        <div className="comp-toolbar">
          <input className="input" placeholder="🔍 Buscar por proveedor, numero o DTE..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <select className="input" style={{ maxWidth: 180 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="todos">Todos los estados</option>
            {ESTADOS_COMPRA.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{comprasFiltradas.length} compras</span>
        </div>
        <div className="card">
          {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>⏳ Cargando...</div>
          : comprasFiltradas.length === 0 ? <div className="empty-state"><div className="empty-icon">🛍️</div><div className="empty-text">No hay compras registradas.</div></div>
          : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>No. COMPRA</th><th>PROVEEDOR</th><th>DTE</th><th>FECHA</th><th>PAGO</th><th>TOTAL</th><th>IVA</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
                <tbody>
                  {comprasFiltradas.map(c => {
                    const estado = ESTADOS_COMPRA.find(e => e.value === c.estado) || ESTADOS_COMPRA[0]
                    return (
                      <tr key={c.id}>
                        <td className="mono" style={{ color: 'var(--accent2)', fontWeight: 600 }}>{c.numero}</td>
                        <td style={{ fontWeight: 600 }}>{c.proveedorNombre}</td>
                        <td><span className="dte-tag">{c.tipoDteProveedor}</span><span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{c.numeroDteProveedor}</span></td>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{c.fechaCompra}</td>
                        <td><span style={{ fontSize: 12, fontWeight: 600, color: c.condicionPago === 'contado' ? 'var(--accent)' : '#f59e0b' }}>{c.condicionPago === 'contado' ? '💵 Contado' : `📅 ${c.condicionPago}`}</span></td>
                        <td className="amount">{fmt(c.total)}</td>
                        <td className="amount" style={{ color: 'var(--accent2)' }}>{fmt(c.iva)}</td>
                        <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: estado.color + '20', color: estado.color }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }}/>{estado.label}</span></td>
                        <td><div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => editarCompra(c)}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setModalEliminar(c)}>🗑️</button>
                        </div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>)}

      {/* ══ PROVEEDORES ══ */}
      {vista === 'proveedores' && (<>
        <BackBtn />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>🏢 Proveedores</div>
          <button className="btn btn-ghost btn-sm" onClick={exportarProveedores}>📤 Exportar</button>
        </div>
        <div className="comp-toolbar">
          <input className="input" placeholder="🔍 Buscar por nombre, contacto o telefono..." value={busProveedor} onChange={e => setBusProveedor(e.target.value)} />
          {busProveedor && <button className="btn btn-ghost btn-sm" onClick={() => setBusProveedor('')}>✕ Limpiar</button>}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{proveedoresFiltrados.length} proveedores</span>
        </div>
        {proveedoresFiltrados.length === 0 ? <div className="empty-state"><div className="empty-icon">🏢</div><div className="empty-text">No hay proveedores.<br/>Agrega tu primer proveedor.</div></div> : (
          <div className="prov-grid">
            {proveedoresFiltrados.map(p => {
              const comprasProveedor = compras.filter(c => c.proveedorNombre === p.nombre)
              const totalComprado = comprasProveedor.reduce((s, c) => s + (c.total || 0), 0)
              return (
                <div key={p.id} className="prov-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="prov-avatar">{(p.nombre || 'P').charAt(0).toUpperCase()}</div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{p.nombre}</div>
                        {p.contacto && <div style={{ fontSize: 12, color: 'var(--muted)' }}>👤 {p.contacto}</div>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditandoProveedor(p.id); setFormProveedor({ nombre: p.nombre, contacto: p.contacto||'', telefono: p.telefono||'', email: p.email||'', nit: p.nit||'', nrc: p.nrc||'', direccion: p.direccion||'', condicionPago: p.condicionPago||'contado', notas: p.notas||'' }); setModalProveedor(true) }}>✏️</button>
                      <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Eliminar proveedor?')) deleteDoc(doc(db,'proveedores',p.id)) }}>🗑️</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                    {p.telefono && <div>📞 {p.telefono}</div>}
                    {p.email && <div>📧 {p.email}</div>}
                    {p.nit && <div>🆔 NIT: {p.nit}</div>}
                    {p.condicionPago && <div>💳 {p.condicionPago}</div>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--border)', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#2E6FD4' }}>{comprasProveedor.length}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Compras</div>
                    </div>
                    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--border)', textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#00C296' }}>{fmt(totalComprado)}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Total</div>
                    </div>
                  </div>
                  {p.notas && <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', background: 'var(--surface2)', borderRadius: 8, padding: '6px 10px' }}>📝 {p.notas}</div>}
                </div>
              )
            })}
          </div>
        )}
      </>)}

      {/* ══ ORDEN INTELIGENTE ══ */}
      {vista === 'orden' && (<>
        <BackBtn />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>🤖 Orden de Compra Inteligente</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>Generada automaticamente por analisis de stock bajo. Selecciona los productos y ajusta cantidades.</div>

        {sugerencias.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">✅</div><div className="empty-text">¡Todo el inventario esta en buen estado!<br/>No hay productos que necesiten reposicion.</div></div>
        ) : (<>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div className="form-group">
              <label className="form-label">Proveedor para esta orden</label>
              <input className="input" placeholder="Nombre del proveedor..." list="provs-oc" value={ordenProveedor} onChange={e => setOrdenProveedor(e.target.value)}/>
              <datalist id="provs-oc">{proveedoresBD.map(p => <option key={p.id} value={p.nombre}/>)}</datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Notas de la orden</label>
              <input className="input" placeholder="Urgente, entrega en bodega..." value={ordenNotas} onChange={e => setOrdenNotas(e.target.value)}/>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setOrdenItems(items => items.map(i => ({ ...i, seleccionado: true })))}>✅ Seleccionar todo</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOrdenItems(items => items.map(i => ({ ...i, seleccionado: false })))}>❌ Deseleccionar todo</button>
            <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center', marginLeft: 'auto' }}>
              {ordenItems.filter(i => i.seleccionado).length} de {ordenItems.length} seleccionados
            </span>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>✓</th><th>PRODUCTO</th><th>STOCK ACTUAL</th><th>MINIMO</th><th>CANTIDAD</th><th>UNIDAD</th><th>PRECIO UNIT.</th><th>TOTAL</th></tr></thead>
                <tbody>
                  {ordenItems.map((item, idx) => (
                    <tr key={item.id} style={{ opacity: item.seleccionado ? 1 : 0.4 }}>
                      <td>
                        <input type="checkbox" checked={item.seleccionado || false}
                          onChange={e => setOrdenItems(items => items.map((i,j) => j===idx ? {...i,seleccionado:e.target.checked} : i))}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}/>
                      </td>
                      <td style={{ fontWeight: 600 }}>{item.productoNombre}<br/><span className="mono" style={{ fontSize: 10, color: 'var(--accent2)' }}>{item.codigoProducto}</span></td>
                      <td><span style={{ color: item.stockActual === 0 ? '#ef4444' : '#f59e0b', fontWeight: 700, fontFamily: 'var(--mono)' }}>{item.stockActual}</span></td>
                      <td style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{item.minimo}</td>
                      <td>
                        <input type="number" min="1" value={item.cantidad}
                          onChange={e => setOrdenItems(items => items.map((i,j) => j===idx ? {...i,cantidad:parseInt(e.target.value)||1} : i))}
                          style={{ width: 70, height: 30, borderRadius: 7, border: '1.5px solid var(--accent)', background: 'var(--glow)', color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800, textAlign: 'center', outline: 'none' }}/>
                      </td>
                      <td style={{ fontSize: 12 }}>{item.unidad}</td>
                      <td>
                        <input type="number" min="0" step="0.01" value={item.precioUnitario}
                          onChange={e => setOrdenItems(items => items.map((i,j) => j===idx ? {...i,precioUnitario:parseFloat(e.target.value)||0} : i))}
                          style={{ width: 80, height: 30, borderRadius: 7, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'center', outline: 'none' }}/>
                      </td>
                      <td className="amount" style={{ fontWeight: 700 }}>{fmt(item.cantidad * item.precioUnitario)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Total orden */}
          <div style={{ background: 'linear-gradient(135deg,#1B2E6B,#2E5FA3)', color: '#fff', borderRadius: 14, padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>Total estimado de la orden</div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>{ordenItems.filter(i=>i.seleccionado).length} productos seleccionados</div>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 900, letterSpacing: -1 }}>
              {fmt(ordenItems.filter(i=>i.seleccionado).reduce((s,i)=>s+i.cantidad*i.precioUnitario,0))}
            </div>
          </div>
        </>)}
      </>)}

      {/* ══ PENDIENTES ══ */}
      {vista === 'pendientes' && (<>
        <BackBtn />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>⏰ Compras por Pagar</div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>No. COMPRA</th><th>PROVEEDOR</th><th>FECHA COMPRA</th><th>VENCE</th><th>CONDICION</th><th>TOTAL</th><th>ACCION</th></tr></thead>
              <tbody>
                {compras.filter(c => c.estadoPago === 'pendiente').length === 0
                  ? <tr><td colSpan={7}><div className="empty-state"><div className="empty-icon">✅</div><div className="empty-text">No hay compras pendientes de pago</div></div></td></tr>
                  : compras.filter(c => c.estadoPago === 'pendiente').map(c => {
                    const vence = c.fechaVencimiento ? new Date(c.fechaVencimiento) : null
                    const vencida = vence && vence < new Date()
                    return (
                      <tr key={c.id}>
                        <td className="mono" style={{ color: 'var(--accent2)', fontWeight: 600 }}>{c.numero}</td>
                        <td style={{ fontWeight: 600 }}>{c.proveedorNombre}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{c.fechaCompra}</td>
                        <td style={{ fontSize: 12, color: vencida ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>{c.fechaVencimiento || '—'} {vencida && '⚠️'}</td>
                        <td style={{ fontSize: 12 }}>{c.condicionPago}</td>
                        <td className="amount" style={{ fontWeight: 700, color: '#f59e0b' }}>{fmt(c.total)}</td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={async () => { await updateDoc(doc(db,'compras',c.id), { estadoPago: 'pagada', updatedAt: serverTimestamp() }); alert('✅ Marcada como pagada') }}>
                            ✅ Marcar pagada
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </>)}

      {/* ══ ESTADISTICAS ══ */}
      {vista === 'estadisticas' && (<>
        <BackBtn />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>📊 Estadisticas de Compras</div>
        <div className="stats-grid">
          <div className="stat-box"><div className="stat-box-val" style={{ color: '#2E6FD4' }}>{fmt(compras.reduce((s,c)=>s+(c.total||0),0))}</div><div className="stat-box-label">Total comprado historico</div></div>
          <div className="stat-box"><div className="stat-box-val" style={{ color: '#00C296' }}>{fmt(totalMes)}</div><div className="stat-box-label">Comprado este mes</div></div>
          <div className="stat-box"><div className="stat-box-val" style={{ color: '#f59e0b' }}>{fmt(totalPendiente)}</div><div className="stat-box-label">Por pagar</div></div>
        </div>

        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🏆 Ranking de Proveedores</div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>PROVEEDOR</th><th>COMPRAS</th><th>TOTAL COMPRADO</th><th>PROMEDIO POR COMPRA</th></tr></thead>
              <tbody>
                {statsPorProveedor.length === 0
                  ? <tr><td colSpan={5}><div className="empty-state"><div className="empty-icon">📊</div><div className="empty-text">Sin datos aun</div></div></td></tr>
                  : statsPorProveedor.map((p, i) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 800, color: i === 0 ? '#f59e0b' : i === 1 ? '#6b7280' : i === 2 ? '#8b5cf6' : 'var(--muted)', fontSize: 16 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}</td>
                      <td style={{ fontWeight: 700 }}>{p.nombre}</td>
                      <td className="mono">{p.totalCompras}</td>
                      <td className="amount" style={{ fontWeight: 700, color: '#00C296' }}>{fmt(p.totalComprado)}</td>
                      <td className="amount">{fmt(p.totalCompras > 0 ? p.totalComprado / p.totalCompras : 0)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}

      {/* ══ SUGERENCIAS ══ */}
      {vista === 'sugerencias' && (<>
        <BackBtn />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>💡 Sugerencias de Compra</div>
          <button className="btn btn-primary btn-sm" onClick={() => { setVista('orden'); generarOrdenInteligente() }}>🤖 Generar Orden Inteligente</button>
        </div>
        {sugerencias.length === 0
          ? <div className="empty-state"><div className="empty-icon">✅</div><div className="empty-text">¡Todo el inventario esta en buen estado!</div></div>
          : sugerencias.map(p => (
            <div key={p.id} className="oc-item">
              <div className="oc-semaforo" style={{ background: p.stock === 0 ? '#ef4444' : '#f59e0b', boxShadow: `0 0 8px ${p.stock === 0 ? 'rgba(239,68,68,0.5)' : 'rgba(245,158,11,0.5)'}` }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {p.codigo && <span className="mono" style={{ color: 'var(--accent2)', marginRight: 8 }}>{p.codigo}</span>}
                  Stock: <strong style={{ color: p.stock === 0 ? '#ef4444' : '#f59e0b' }}>{p.stock}</strong> / Min: {p.min}
                  {p.proveedor && <span style={{ marginLeft: 8 }}>· 🏢 {p.proveedor}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: '#00C296', fontSize: 15 }}>Pedir: {p.cantidadSugerida} {p.unidad}</div>
                {p.precioCompra > 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>~{fmt(p.cantidadSugerida * p.precioCompra)}</div>}
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => { setForm({ ...FORM_INICIAL, items: [{ id: Date.now(), productoId: p.id, productoNombre: p.nombre, codigoProducto: p.codigo||'', cantidad: p.cantidadSugerida, precioUnitario: p.precioCompra||0, descuento: 0, unidad: p.unidad||'unidad' }] }); setCompraEditando(null); setVista('nueva') }}>
                + Comprar
              </button>
            </div>
          ))
        }
      </>)}

      {/* MODAL PROVEEDOR */}
      {modalProveedor && (
        <div className="modal-overlay" onClick={() => setModalProveedor(false)}>
          <div className="modal" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editandoProveedor ? '✏️ Editar Proveedor' : '🏢 Nuevo Proveedor'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group"><label className="form-label">NOMBRE / RAZON SOCIAL *</label><input className="input" placeholder="Proveedor S.A." value={formProveedor.nombre} onChange={e => setFormProveedor(f => ({ ...f, nombre: e.target.value }))}/></div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">CONTACTO</label><input className="input" placeholder="Nombre del contacto" value={formProveedor.contacto} onChange={e => setFormProveedor(f => ({ ...f, contacto: e.target.value }))}/></div>
                <div className="form-group"><label className="form-label">TELEFONO</label><input className="input" placeholder="7000-0000" value={formProveedor.telefono} onChange={e => setFormProveedor(f => ({ ...f, telefono: e.target.value }))}/></div>
              </div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">EMAIL</label><input className="input" type="email" placeholder="ventas@proveedor.com" value={formProveedor.email} onChange={e => setFormProveedor(f => ({ ...f, email: e.target.value }))}/></div>
                <div className="form-group"><label className="form-label">NIT</label><input className="input" placeholder="0614-010190-101-3" value={formProveedor.nit} onChange={e => setFormProveedor(f => ({ ...f, nit: e.target.value }))}/></div>
              </div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">NRC</label><input className="input" placeholder="123456-7" value={formProveedor.nrc} onChange={e => setFormProveedor(f => ({ ...f, nrc: e.target.value }))}/></div>
                <div className="form-group"><label className="form-label">CONDICION DE PAGO</label><select className="input" value={formProveedor.condicionPago} onChange={e => setFormProveedor(f => ({ ...f, condicionPago: e.target.value }))}>{CONDICIONES_PAGO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
              </div>
              <div className="form-group"><label className="form-label">DIRECCION</label><input className="input" placeholder="Direccion del proveedor" value={formProveedor.direccion} onChange={e => setFormProveedor(f => ({ ...f, direccion: e.target.value }))}/></div>
              <div className="form-group"><label className="form-label">NOTAS</label><input className="input" placeholder="Dias de entrega, condiciones especiales..." value={formProveedor.notas} onChange={e => setFormProveedor(f => ({ ...f, notas: e.target.value }))}/></div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalProveedor(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarProveedor} disabled={guardando || !formProveedor.nombre}>{guardando ? '⏳...' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR */}
      {modalEliminar && (
        <div className="modal-overlay" onClick={() => setModalEliminar(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🗑️ Eliminar compra?</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 8 }}>Compra <strong style={{ color: 'var(--text)' }}>{modalEliminar.numero}</strong> de <strong style={{ color: 'var(--text)' }}>{modalEliminar.proveedorNombre}</strong>.</p>
            <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 20 }}>⚠️ El stock NO se revertira automaticamente.</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalEliminar(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => eliminarCompra(modalEliminar)} disabled={procesando}>{procesando ? '⏳...' : '🗑️ Eliminar'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}