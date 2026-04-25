import { useState, useEffect, useRef } from 'react'
import { db } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, writeBatch, query, where, orderBy, getDocs
} from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { usePermisos } from '../PermisosContext'

const IVA = 0.13

const UNIDADES_SISTEMA = [
  { nombre: 'Unidad',     factor: 1,      grupo: 'General' },
  { nombre: 'Docena',     factor: 12,     grupo: 'General' },
  { nombre: 'Ciento',     factor: 100,    grupo: 'General' },
  { nombre: 'Millar',     factor: 1000,   grupo: 'General' },
  { nombre: 'Par',        factor: 2,      grupo: 'General' },
  { nombre: 'Caja',       factor: 1,      grupo: 'Empaque' },
  { nombre: 'Paquete',    factor: 1,      grupo: 'Empaque' },
  { nombre: 'Resma',      factor: 500,    grupo: 'Empaque' },
  { nombre: 'Bolsa',      factor: 1,      grupo: 'Empaque' },
  { nombre: 'Saco',       factor: 1,      grupo: 'Empaque' },
  { nombre: 'Rollo',      factor: 1,      grupo: 'Empaque' },
  { nombre: 'Metro',      factor: 1,      grupo: 'Longitud' },
  { nombre: 'Centimetro', factor: 0.01,   grupo: 'Longitud' },
  { nombre: 'Vara',       factor: 0.836,  grupo: 'Longitud' },
  { nombre: 'Pie',        factor: 0.3048, grupo: 'Longitud' },
  { nombre: 'Pulgada',    factor: 0.0254, grupo: 'Longitud' },
  { nombre: 'Kilogramo',  factor: 1,      grupo: 'Peso' },
  { nombre: 'Gramo',      factor: 0.001,  grupo: 'Peso' },
  { nombre: 'Libra',      factor: 0.4536, grupo: 'Peso' },
  { nombre: 'Quintal',    factor: 45.36,  grupo: 'Peso' },
  { nombre: 'Tonelada',   factor: 1000,   grupo: 'Peso' },
  { nombre: 'Litro',      factor: 1,      grupo: 'Volumen' },
  { nombre: 'Mililitro',  factor: 0.001,  grupo: 'Volumen' },
  { nombre: 'Galon',      factor: 3.785,  grupo: 'Volumen' },
]

const TIPOS_MOVIMIENTO = [
  { value: 'entrada',    label: 'Entrada',    icon: '📥', color: '#00C296' },
  { value: 'salida',     label: 'Salida',     icon: '📤', color: '#ef4444' },
  { value: 'ajuste',     label: 'Ajuste',     icon: '🔧', color: '#f59e0b' },
  { value: 'devolucion', label: 'Devolucion', icon: '↩️', color: '#4A8FE8' },
  { value: 'traslado',   label: 'Traslado',   icon: '🚚', color: '#8b5cf6' },
]

const COLUMNAS_EXCEL = ['codigo','nombre','categoria','precio','stock','min','unidad','proveedor','codigoBarras','ubicacion','descuento','fechaVencimiento']

const invStyles = `
  .inv-panel { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 28px; }
  @media (max-width: 1100px) { .inv-panel { grid-template-columns: repeat(3,1fr); } }
  @media (max-width: 700px) { .inv-panel { grid-template-columns: repeat(2,1fr); } }
  .inv-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 18px; padding: 22px; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; box-shadow: 0 4px 20px var(--shadow2); }
  .inv-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background: var(--ic-color, var(--accent)); }
  .inv-card:hover { transform: translateY(-3px); border-color: var(--ic-color, var(--accent)); box-shadow: 0 8px 30px var(--shadow); }
  .inv-card-icon { font-size: 34px; margin-bottom: 12px; }
  .inv-card-title { font-size: 14px; font-weight: 800; margin-bottom: 6px; }
  .inv-card-val { font-size: 28px; font-weight: 900; font-family: var(--mono); letter-spacing: -1px; }
  .inv-card-sub { font-size: 11px; color: var(--muted); margin-top: 5px; line-height: 1.4; }
  .inv-card-badge { position: absolute; top: 14px; right: 14px; background: var(--ic-color, var(--accent)); color: #fff; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 99px; }
  .inv-back { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; margin-bottom: 20px; padding: 8px 14px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--surface2); transition: all 0.15s; }
  .inv-back:hover { color: var(--accent); border-color: var(--accent); }
  .inv-toolbar { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; align-items: center; }
  .inv-toolbar .input { max-width: 300px; }
  .stock-ok { color: var(--accent); font-weight: 600; font-family: var(--mono); }
  .stock-low { color: var(--accent3); font-weight: 600; font-family: var(--mono); }
  .stock-critical { color: var(--danger); font-weight: 600; font-family: var(--mono); }
  .action-btns { display: flex; gap: 5px; flex-wrap: wrap; }
  .btn-sm { padding: 5px 10px; font-size: 11px; }
  .loading { text-align: center; padding: 40px; color: var(--muted); font-size: 14px; }
  .firebase-badge { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,160,0,0.12); color: #ffa000; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 6px; font-family: var(--mono); }
  .toolbar-group { display: flex; gap: 8px; align-items: center; margin-left: auto; flex-wrap: wrap; }
  .section-divider { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 1px; padding: 4px 0; border-bottom: 1px solid var(--border); margin-bottom: 4px; margin-top: 8px; }
  .iva-hint { background: rgba(0,212,170,0.08); border: 1px solid rgba(0,212,170,0.2); border-radius: 10px; padding: 10px 14px; font-size: 13px; }
  .tag-opcional { display: inline-block; background: var(--surface2); border: 1px solid var(--border); color: var(--muted); font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
  .modal-lg { max-width: 660px !important; max-height: 90vh; overflow-y: auto; }
  .prod-tag { display: inline-flex; align-items: center; gap: 4px; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; font-size: 11px; color: var(--muted); }
  .import-preview { max-height: 280px; overflow-y: auto; margin-top: 14px; border-radius: 10px; border: 1px solid var(--border); }
  .import-preview th { background: var(--surface2); position: sticky; top: 0; }
  .import-row-ok { background: rgba(0,212,170,0.05); }
  .import-row-err { background: rgba(255,77,109,0.07); }
  .kardex-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 20px; }
  @media (max-width: 700px) { .kardex-stats { grid-template-columns: repeat(2,1fr); } }
  .kardex-stat { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 12px; padding: 14px; text-align: center; }
  .kardex-stat-val { font-size: 20px; font-weight: 800; font-family: var(--mono); }
  .kardex-stat-label { font-size: 10px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
  .mov-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; }
  .unidad-adicional-row { display: flex; gap: 8px; align-items: center; background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
  .alerta-card { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 14px; border: 1.5px solid var(--border); background: var(--surface2); margin-bottom: 10px; transition: all 0.15s; }
  .alerta-card:hover { transform: translateX(4px); }
  .alerta-semaforo { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
  .alerta-critico { background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,0.5); }
  .alerta-bajo { background: #f59e0b; box-shadow: 0 0 8px rgba(245,158,11,0.5); }
  .valor-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 24px; }
  @media (max-width: 700px) { .valor-stats { grid-template-columns: 1fr; } }
  .valor-stat { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 14px; padding: 22px; text-align: center; }
  .valor-stat-val { font-size: 28px; font-weight: 900; font-family: var(--mono); letter-spacing: -1px; }
  .valor-stat-label { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; margin-top: 6px; }
  .bodega-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 20px; }
  @media (max-width: 900px) { .bodega-grid { grid-template-columns: repeat(2,1fr); } }
  .bodega-card { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 14px; padding: 18px; transition: all 0.15s; }
  .bodega-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 6px 20px var(--shadow); }
  .sucursal-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 16px; }
  @media (max-width: 700px) { .sucursal-grid { grid-template-columns: 1fr; } }
  .sucursal-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; padding: 20px; box-shadow: 0 4px 20px var(--shadow2); transition: all 0.15s; }
  .sucursal-card:hover { border-color: var(--accent2); transform: translateY(-2px); }
  .btn-kardex { background: rgba(74,143,232,0.1); color: var(--accent); border: 1.5px solid rgba(74,143,232,0.25); }
  .btn-kardex:hover { background: var(--accent); color: white; }
`

const precioFinal = (precio, descuento) => {
  const p = parseFloat(precio) || 0
  const d = parseFloat(descuento) || 0
  return p * (1 - d / 100) * (1 + IVA)
}

const getStockClass = (stock, min) => {
  if (stock === 0) return 'stock-critical'
  if (stock < min * 0.4) return 'stock-critical'
  if (stock < min) return 'stock-low'
  return 'stock-ok'
}

const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`

const emptyForm = {
  codigo: '', nombre: '', precio: '', stock: '', min: '', unidad: 'Unidad',
  categoria: '', proveedor: '', codigoBarras: '', ubicacion: '', bodega: '',
  descuento: '', fechaVencimiento: '', imagen: '', unidadesAdicionales: [],
}

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

export default function Inventario() {
  const { puede } = usePermisos()
  const [vista, setVista] = useState('panel')
  const [productos, setProductos] = useState([])
  const [kardex, setKardex] = useState([])
  const [bodegas, setBodegas] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingKardex, setLoadingKardex] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [busKardex, setBusKardex] = useState('')
  const [busAjuste, setBusAjuste] = useState('')
  const [busBodega, setBusBodega] = useState('')
  const [busSucursal, setBusSucursal] = useState('')
  const [busAlerta, setBusAlerta] = useState('')
  const [busValoracion, setBusValoracion] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [kardexModal, setKardexModal] = useState(null)
  const [movModal, setMovModal] = useState(null)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [guardando, setGuardando] = useState(false)
  const [importData, setImportData] = useState([])
  const [importando, setImportando] = useState(false)
  const [movForm, setMovForm] = useState({ tipo: 'entrada', cantidad: '', unidad: '', motivo: '', referencia: '', sucursalOrigen: '', sucursalDestino: '' })
  const [modalBodega, setModalBodega] = useState(false)
  const [editandoBodega, setEditandoBodega] = useState(null)
  const [formBodega, setFormBodega] = useState({ nombre: '', descripcion: '', responsable: '' })
  const [modalSucursal, setModalSucursal] = useState(false)
  const [editandoSucursal, setEditandoSucursal] = useState(null)
  const [formSucursal, setFormSucursal] = useState({ nombre: '', direccion: '', telefono: '', responsable: '' })
  const fileRef = useRef()

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'productos'), snap => { setProductos(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) })
    const u2 = onSnapshot(collection(db, 'bodegas'), snap => setBodegas(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    const u3 = onSnapshot(collection(db, 'sucursales'), snap => setSucursales(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    return () => { u1(); u2(); u3() }
  }, [])

  useEffect(() => {
    if (vista !== 'kardex') return
    setLoadingKardex(true)
    const unsub = onSnapshot(query(collection(db, 'kardex'), orderBy('fecha', 'desc')), snap => { setKardex(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingKardex(false) })
    return () => unsub()
  }, [vista])

  const cargarKardexProducto = async (producto) => {
    setLoadingKardex(true)
    setKardexModal(producto)
    setVista('kardex')
    try {
      const snap = await getDocs(query(collection(db, 'kardex'), where('productoId', '==', producto.id), orderBy('fecha', 'desc')))
      setKardex(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch {
      const snap = await getDocs(query(collection(db, 'kardex'), where('productoId', '==', producto.id)))
      setKardex(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0)))
    }
    setLoadingKardex(false)
  }

  const registrarMovimiento = async () => {
    if (!movForm.cantidad || !movModal) return
    const cantidad = parseFloat(movForm.cantidad) || 0
    const tipo = movForm.tipo
    let nuevoStock = movModal.stock || 0
    if (['entrada','devolucion'].includes(tipo)) nuevoStock += cantidad
    else if (['salida'].includes(tipo)) { if (cantidad > nuevoStock) { alert('Stock insuficiente'); return }; nuevoStock -= cantidad }
    else if (tipo === 'ajuste') nuevoStock = cantidad
    else if (tipo === 'traslado') { if (cantidad > nuevoStock) { alert('Stock insuficiente'); return }; nuevoStock -= cantidad }
    try {
      await addDoc(collection(db, 'kardex'), { productoId: movModal.id, productoCodigo: movModal.codigo, productoNombre: movModal.nombre, tipo, cantidad, unidad: movForm.unidad || movModal.unidad, stockAntes: movModal.stock || 0, stockDespues: nuevoStock, motivo: movForm.motivo || '', referencia: movForm.referencia || '', sucursalOrigen: movForm.sucursalOrigen || '', sucursalDestino: movForm.sucursalDestino || '', fecha: serverTimestamp() })
      await updateDoc(doc(db, 'productos', movModal.id), { stock: nuevoStock, updatedAt: serverTimestamp() })
      setMovModal(null)
      setMovForm({ tipo: 'entrada', cantidad: '', unidad: '', motivo: '', referencia: '', sucursalOrigen: '', sucursalDestino: '' })
    } catch (e) { alert('Error: ' + e.message) }
  }

  const filtrados = productos.filter(p =>
    p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.proveedor?.toLowerCase().includes(busqueda.toLowerCase())
  )

  const kardexFiltrado = kardex.filter(k =>
    k.productoNombre?.toLowerCase().includes(busKardex.toLowerCase()) ||
    k.productoCodigo?.toLowerCase().includes(busKardex.toLowerCase()) ||
    k.tipo?.toLowerCase().includes(busKardex.toLowerCase()) ||
    k.motivo?.toLowerCase().includes(busKardex.toLowerCase()) ||
    k.referencia?.toLowerCase().includes(busKardex.toLowerCase())
  )

  const ajusteFiltrado = productos.filter(p =>
    p.nombre?.toLowerCase().includes(busAjuste.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busAjuste.toLowerCase()) ||
    (busAjuste === 'agotado' && p.stock === 0) ||
    (busAjuste === 'bajo' && p.stock > 0 && p.stock < (p.min || 0)) ||
    (busAjuste === 'normal' && p.stock >= (p.min || 0))
  )

  const bodegaFiltrada = bodegas.filter(b =>
    b.nombre?.toLowerCase().includes(busBodega.toLowerCase()) ||
    b.responsable?.toLowerCase().includes(busBodega.toLowerCase()) ||
    b.descripcion?.toLowerCase().includes(busBodega.toLowerCase())
  )

  const sucursalFiltrada = sucursales.filter(s =>
    s.nombre?.toLowerCase().includes(busSucursal.toLowerCase()) ||
    s.direccion?.toLowerCase().includes(busSucursal.toLowerCase()) ||
    s.responsable?.toLowerCase().includes(busSucursal.toLowerCase())
  )

  const alertaCriticoFiltrada = productosCriticos.filter(p =>
    p.nombre?.toLowerCase().includes(busAlerta.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busAlerta.toLowerCase())
  )

  const alertaBajaFiltrada = productosBajos.filter(p =>
    p.nombre?.toLowerCase().includes(busAlerta.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busAlerta.toLowerCase())
  )

  const valoracionFiltrada = productos.filter(p =>
    p.nombre?.toLowerCase().includes(busValoracion.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busValoracion.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(busValoracion.toLowerCase())
  ).sort((a,b) => ((b.precio||0)*(b.stock||0)) - ((a.precio||0)*(a.stock||0)))

  const abrirModal = (producto = null) => {
    if (producto) {
      setEditando(producto.id)
      setForm({ codigo: producto.codigo || '', nombre: producto.nombre || '', categoria: producto.categoria || '', precio: producto.precio?.toString() || '', stock: producto.stock?.toString() || '', min: producto.min?.toString() || '', unidad: producto.unidad || 'Unidad', proveedor: producto.proveedor || '', codigoBarras: producto.codigoBarras || '', ubicacion: producto.ubicacion || '', bodega: producto.bodega || '', descuento: producto.descuento?.toString() || '', fechaVencimiento: producto.fechaVencimiento || '', imagen: producto.imagen || '', unidadesAdicionales: producto.unidadesAdicionales || [] })
    } else { setEditando(null); setForm(emptyForm) }
    setModalOpen(true)
  }

  const guardar = async () => {
    if (!form.nombre || !form.codigo || !form.precio || !form.stock) return
    setGuardando(true)
    const stockNuevo = parseInt(form.stock) || 0
    const stockAnterior = editando ? (productos.find(p => p.id === editando)?.stock || 0) : 0
    const data = { codigo: form.codigo.trim(), nombre: form.nombre.trim(), categoria: form.categoria.trim(), precio: parseFloat(form.precio) || 0, stock: stockNuevo, min: parseInt(form.min) || 0, unidad: form.unidad || 'Unidad', unidadesAdicionales: (form.unidadesAdicionales || []).filter(u => u.nombre), ...(form.proveedor && { proveedor: form.proveedor.trim() }), ...(form.codigoBarras && { codigoBarras: form.codigoBarras.trim() }), ...(form.ubicacion && { ubicacion: form.ubicacion.trim() }), ...(form.bodega && { bodega: form.bodega }), ...(form.descuento && { descuento: parseFloat(form.descuento) || 0 }), ...(form.fechaVencimiento && { fechaVencimiento: form.fechaVencimiento }), ...(form.imagen && { imagen: form.imagen.trim() }), updatedAt: serverTimestamp() }
    try {
      if (editando) {
        await updateDoc(doc(db, 'productos', editando), data)
        if (stockNuevo !== stockAnterior) await addDoc(collection(db, 'kardex'), { productoId: editando, productoCodigo: form.codigo, productoNombre: form.nombre, tipo: 'ajuste', cantidad: Math.abs(stockNuevo - stockAnterior), unidad: form.unidad, stockAntes: stockAnterior, stockDespues: stockNuevo, motivo: 'Ajuste desde edicion', referencia: '', fecha: serverTimestamp() })
      } else {
        const ref = await addDoc(collection(db, 'productos'), { ...data, createdAt: serverTimestamp() })
        if (stockNuevo > 0) await addDoc(collection(db, 'kardex'), { productoId: ref.id, productoCodigo: form.codigo, productoNombre: form.nombre, tipo: 'entrada', cantidad: stockNuevo, unidad: form.unidad, stockAntes: 0, stockDespues: stockNuevo, motivo: 'Stock inicial', referencia: '', fecha: serverTimestamp() })
      }
      setModalOpen(false)
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const eliminar = async (id) => { if (!confirm('Eliminar este producto?')) return; try { await deleteDoc(doc(db, 'productos', id)) } catch (e) { alert('Error: ' + e.message) } }

  const exportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(productos.map(p => ({ codigo: p.codigo || '', nombre: p.nombre || '', categoria: p.categoria || '', precio: p.precio || 0, stock: p.stock || 0, min: p.min || 0, unidad: p.unidad || '', proveedor: p.proveedor || '', codigoBarras: p.codigoBarras || '', ubicacion: p.ubicacion || '', descuento: p.descuento || 0, fechaVencimiento: p.fechaVencimiento || '' })), { header: COLUMNAS_EXCEL })
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
    XLSX.writeFile(wb, `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const descargarPlantilla = () => {
    const ws = XLSX.utils.json_to_sheet([{ codigo: 'P001', nombre: 'Producto Ejemplo', categoria: 'General', precio: 10.00, stock: 100, min: 10, unidad: 'Unidad', proveedor: 'Proveedor SV', codigoBarras: '', ubicacion: 'Bodega A', descuento: 0, fechaVencimiento: '' }], { header: COLUMNAS_EXCEL })
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Productos')
    XLSX.writeFile(wb, 'plantilla-inventario.xlsx')
  }

  const leerExcel = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' })
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      setImportData(raw.map((row, i) => {
        const codigo = String(row.codigo || '').trim(); const nombre = String(row.nombre || '').trim(); const precio = parseFloat(row.precio || 0)
        const errores = []; if (!codigo) errores.push('Falta codigo'); if (!nombre) errores.push('Falta nombre'); if (isNaN(precio) || precio < 0) errores.push('Precio invalido')
        return { _fila: i + 2, codigo, nombre, categoria: String(row.categoria || '').trim(), precio, stock: parseInt(row.stock || 0), min: parseInt(row.min || 0), unidad: String(row.unidad || 'Unidad').trim(), proveedor: String(row.proveedor || '').trim(), codigoBarras: String(row.codigoBarras || '').trim(), ubicacion: String(row.ubicacion || '').trim(), descuento: parseFloat(row.descuento || 0), fechaVencimiento: String(row.fechaVencimiento || '').trim(), _errores: errores, _ok: errores.length === 0 }
      }))
      setImportModalOpen(true)
    }
    reader.readAsBinaryString(file); e.target.value = ''
  }

  const importarProductos = async () => {
    const validos = importData.filter(f => f._ok); if (!validos.length) return
    setImportando(true)
    try {
      for (let i = 0; i < validos.length; i += 400) {
        const batch = writeBatch(db)
        validos.slice(i, i + 400).forEach(p => { const ref = doc(collection(db, 'productos')); batch.set(ref, { ...p, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }) })
        await batch.commit()
      }
      setImportModalOpen(false); setImportData([]); alert(`✅ ${validos.length} productos importados`)
    } catch (e) { alert('Error: ' + e.message) }
    setImportando(false)
  }

  const exportarKardex = () => {
    const ws = XLSX.utils.json_to_sheet(kardex.map(k => ({ fecha: k.fecha?.toDate?.()?.toLocaleString('es-SV') || '', producto: k.productoNombre, codigo: k.productoCodigo, tipo: k.tipo, cantidad: k.cantidad, unidad: k.unidad, stockAntes: k.stockAntes, stockDespues: k.stockDespues, motivo: k.motivo || '', referencia: k.referencia || '' })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Kardex')
    XLSX.writeFile(wb, `kardex-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exportarAlertas = () => {
    const datos = [...productos.filter(p => (p.stock || 0) === 0).map(p => ({ estado: 'AGOTADO', codigo: p.codigo, nombre: p.nombre, stock: 0, minimo: p.min, sugerido: Math.max((p.min || 0) * 2, 10) })), ...productos.filter(p => (p.stock || 0) > 0 && (p.stock || 0) < (p.min || 0)).map(p => ({ estado: 'BAJO', codigo: p.codigo, nombre: p.nombre, stock: p.stock, minimo: p.min, sugerido: Math.max((p.min || 0) * 2 - (p.stock || 0), 0) }))]
    const ws = XLSX.utils.json_to_sheet(datos); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Alertas')
    XLSX.writeFile(wb, `alertas-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exportarValoracion = () => {
    const ws = XLSX.utils.json_to_sheet(productos.map(p => ({ codigo: p.codigo, nombre: p.nombre, categoria: p.categoria || '', stock: p.stock || 0, unidad: p.unidad, precio_costo: p.precio || 0, precio_venta: ((p.precio || 0) * 1.13).toFixed(2), valor_costo: ((p.precio || 0) * (p.stock || 0)).toFixed(2), valor_venta: ((p.precio || 0) * 1.13 * (p.stock || 0)).toFixed(2) })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Valoracion')
    XLSX.writeFile(wb, `valoracion-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const imprimirValoracion = () => {
    const vc = productos.reduce((s, p) => s + (p.precio || 0) * (p.stock || 0), 0)
    const vv = productos.reduce((s, p) => s + (p.precio || 0) * 1.13 * (p.stock || 0), 0)
    const cats = {}
    productos.forEach(p => { const c = p.categoria || 'Sin categoria'; if (!cats[c]) cats[c] = { v: 0, u: 0, n: 0 }; cats[c].v += (p.precio||0)*(p.stock||0); cats[c].u += p.stock||0; cats[c].n++ })
    imprimirIframe(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Valoracion</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',sans-serif;color:#1a1a2e;font-size:13px;padding:30px;}.t{font-size:22px;font-weight:900;color:#1B2E6B;margin-bottom:4px;}.f{font-size:12px;color:#6b7280;margin-bottom:20px;}.s{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;}.sc{background:#f8faff;border:1px solid #e5eaf5;border-radius:10px;padding:14px;text-align:center;}.sv{font-size:22px;font-weight:900;color:#1B2E6B;font-family:monospace;}.sl{font-size:10px;color:#9ca3af;text-transform:uppercase;margin-top:4px;}table{width:100%;border-collapse:collapse;}thead{background:#1B2E6B;color:#fff;}th{padding:9px 12px;text-align:left;font-size:11px;}td{padding:9px 12px;border-bottom:1px solid #f0f4ff;font-size:12px;}.ft{text-align:center;margin-top:20px;font-size:11px;color:#9ca3af;}@media print{@page{margin:15mm;}}</style></head><body><div class="t">Valoracion del Inventario</div><div class="f">${new Date().toLocaleDateString('es-SV',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div><div class="s"><div class="sc"><div class="sv">${fmt(vc)}</div><div class="sl">Valor a costo</div></div><div class="sc"><div class="sv">${fmt(vv)}</div><div class="sl">Valor a venta</div></div><div class="sc"><div class="sv">${fmt(vv-vc)}</div><div class="sl">Ganancia estimada</div></div></div><table><thead><tr><th>Categoria</th><th>Productos</th><th>Unidades</th><th>Valor costo</th></tr></thead><tbody>${Object.entries(cats).map(([c,d])=>`<tr><td>${c}</td><td>${d.n}</td><td>${d.u}</td><td style="font-weight:700">${fmt(d.v)}</td></tr>`).join('')}</tbody></table><div class="ft">ORION · ONE GEO SYSTEMS · ${new Date().toLocaleString('es-SV')}</div></body></html>`)
  }

  const exportarBodega = () => {
    const ws = XLSX.utils.json_to_sheet(bodegas.map(b => ({ nombre: b.nombre, descripcion: b.descripcion || '', responsable: b.responsable || '', productos: productos.filter(p => p.bodega === b.id).length })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Bodegas')
    XLSX.writeFile(wb, `bodegas-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exportarSucursales = () => {
    const ws = XLSX.utils.json_to_sheet(sucursales.map(s => ({ nombre: s.nombre, direccion: s.direccion || '', telefono: s.telefono || '', responsable: s.responsable || '' })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sucursales')
    XLSX.writeFile(wb, `sucursales-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const guardarBodega = async () => {
    if (!formBodega.nombre) return; setGuardando(true)
    try { if (editandoBodega) await updateDoc(doc(db, 'bodegas', editandoBodega), { ...formBodega, updatedAt: serverTimestamp() }); else await addDoc(collection(db, 'bodegas'), { ...formBodega, createdAt: serverTimestamp() }); setModalBodega(false); setEditandoBodega(null); setFormBodega({ nombre: '', descripcion: '', responsable: '' }) } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const guardarSucursal = async () => {
    if (!formSucursal.nombre) return; setGuardando(true)
    try { if (editandoSucursal) await updateDoc(doc(db, 'sucursales', editandoSucursal), { ...formSucursal, updatedAt: serverTimestamp() }); else await addDoc(collection(db, 'sucursales'), { ...formSucursal, createdAt: serverTimestamp() }); setModalSucursal(false); setEditandoSucursal(null); setFormSucursal({ nombre: '', direccion: '', telefono: '', responsable: '' }) } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const productosCriticos = productos.filter(p => (p.stock || 0) === 0)
  const productosBajos = productos.filter(p => (p.stock || 0) > 0 && (p.stock || 0) < (p.min || 0))
  const valorInventario = productos.reduce((s, p) => s + (p.precio || 0) * (p.stock || 0), 0)
  const totalOk = importData.filter(f => f._ok).length
  const totalErr = importData.filter(f => !f._ok).length
  const totalEntradas = kardex.filter(k => ['entrada','devolucion'].includes(k.tipo)).reduce((s, k) => s + (k.cantidad || 0), 0)
  const totalSalidas = kardex.filter(k => ['salida'].includes(k.tipo)).reduce((s, k) => s + (k.cantidad || 0), 0)
  const f = form

  const BackBtn = () => (
    <div className="inv-back" onClick={() => { setVista('panel'); setKardexModal(null) }}>
      ← Volver al Panel
    </div>
  )

  return (
    <>
      <style>{invStyles}</style>

      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">📦 Inventario</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {productos.length} productos · {bodegas.length} bodegas · {sucursales.length} sucursales
            <span className="firebase-badge">🔥 Firebase</span>
          </div>
        </div>
        {vista === 'productos' && puede('crear_productos') && <button className="btn btn-primary" onClick={() => abrirModal()}>+ Nuevo Producto</button>}
        {vista === 'bodega' && <button className="btn btn-primary" onClick={() => setModalBodega(true)}>+ Nueva Bodega</button>}
        {vista === 'sucursales' && <button className="btn btn-primary" onClick={() => setModalSucursal(true)}>+ Nueva Sucursal</button>}
      </div>

      {/* ══ PANEL ══ */}
      {vista === 'panel' && (
        <div className="inv-panel">
          <div className="inv-card" style={{ '--ic-color': '#00C296' }} onClick={() => setVista('productos')}>
            <div className="inv-card-icon">📦</div>
            <div className="inv-card-title">Productos</div>
            <div className="inv-card-val" style={{ color: '#00C296' }}>{productos.length}</div>
            <div className="inv-card-sub">articulos en inventario</div>
          </div>
          <div className="inv-card" style={{ '--ic-color': '#4A8FE8' }} onClick={() => setVista('kardex')}>
            <div className="inv-card-icon">📋</div>
            <div className="inv-card-title">Kardex</div>
            <div className="inv-card-val" style={{ color: '#4A8FE8' }}>{productos.reduce((s, p) => s + (p.stock || 0), 0)}</div>
            <div className="inv-card-sub">unidades en stock total</div>
          </div>
          <div className="inv-card" style={{ '--ic-color': '#f59e0b' }} onClick={() => setVista('ajustes')}>
            <div className="inv-card-icon">⚡</div>
            <div className="inv-card-title">Ajuste de Inventario</div>
            <div className="inv-card-val" style={{ color: '#f59e0b' }}>{productos.filter(p => (p.stock || 0) <= (p.min || 0)).length}</div>
            <div className="inv-card-sub">productos necesitan atencion</div>
          </div>
          <div className="inv-card" style={{ '--ic-color': '#8b5cf6' }} onClick={() => setVista('bodega')}>
            <div className="inv-card-icon">🏭</div>
            <div className="inv-card-title">Bodega</div>
            <div className="inv-card-val" style={{ color: '#8b5cf6' }}>{bodegas.length}</div>
            <div className="inv-card-sub">zonas de almacenamiento</div>
          </div>
          <div className="inv-card" style={{ '--ic-color': '#2E6FD4' }} onClick={() => setVista('sucursales')}>
            <div className="inv-card-icon">🏪</div>
            <div className="inv-card-title">Sucursales</div>
            <div className="inv-card-val" style={{ color: '#2E6FD4' }}>{sucursales.length}</div>
            <div className="inv-card-sub">puntos de venta activos</div>
          </div>
          <div className="inv-card" style={{ '--ic-color': '#ef4444' }} onClick={() => setVista('alertas')}>
            {(productosCriticos.length + productosBajos.length) > 0 && <div className="inv-card-badge">{productosCriticos.length + productosBajos.length}</div>}
            <div className="inv-card-icon">🚨</div>
            <div className="inv-card-title">Alertas de Stock</div>
            <div className="inv-card-val" style={{ color: '#ef4444' }}>{productosCriticos.length}</div>
            <div className="inv-card-sub">{productosCriticos.length} agotados · {productosBajos.length} stock bajo</div>
          </div>
          <div className="inv-card" style={{ '--ic-color': '#00C296' }} onClick={() => setVista('valoracion')}>
            <div className="inv-card-icon">📊</div>
            <div className="inv-card-title">Valoracion</div>
            <div className="inv-card-val" style={{ color: '#00C296', fontSize: valorInventario > 99999 ? 18 : 24 }}>{fmt(valorInventario)}</div>
            <div className="inv-card-sub">valor del inventario a costo</div>
          </div>
        </div>
      )}

      {/* ══ PRODUCTOS ══ */}
      {vista === 'productos' && (<>
        <BackBtn />
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar por nombre, codigo, categoria o proveedor..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <div className="toolbar-group">
            {puede('importar_exportar') && <>
              <button className="btn btn-ghost btn-sm" onClick={descargarPlantilla}>📋 Plantilla</button>
              <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()}>📥 Importar</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={leerExcel} />
              <button className="btn btn-ghost btn-sm" onClick={exportarExcel} disabled={!productos.length}>📤 Exportar</button>
            </>}
          </div>
        </div>
        <div className="card">
          {loading ? <div className="loading">🔄 Cargando...</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>CODIGO</th><th>PRODUCTO</th><th>CATEGORIA</th><th>BODEGA</th><th>PRECIO</th><th>UNIDADES</th><th>STOCK</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
                <tbody>
                  {filtrados.length === 0 ? <tr><td colSpan={9}><div className="empty-state"><div className="empty-icon">📦</div><div className="empty-text">{busqueda ? 'No encontrado' : 'Agrega tu primer producto'}</div></div></td></tr>
                  : filtrados.map(p => (
                    <tr key={p.id}>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--accent2)' }}>{p.codigo}</td>
                      <td><div style={{ fontWeight: 500 }}>{p.nombre}</div>{p.ubicacion && <div style={{ fontSize: 11, color: 'var(--muted)' }}>📍 {p.ubicacion}</div>}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.categoria || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{bodegas.find(b => b.id === p.bodega)?.nombre || '—'}</td>
                      <td><div className="amount" style={{ fontWeight: 700 }}>${((p.precio||0)*1.13).toFixed(2)}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>${(p.precio||0).toFixed(2)} s/IVA</div></td>
                      <td><div style={{ fontSize: 12, fontWeight: 600 }}>{p.unidad}</div>{(p.unidadesAdicionales||[]).length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>{p.unidadesAdicionales.map((u, i) => <span key={i} className="prod-tag">📦 {u.nombre}</span>)}</div>}</td>
                      <td><span className={getStockClass(p.stock||0,p.min||0)}>{p.stock||0}</span><div style={{ fontSize: 10, color: 'var(--muted)' }}>min: {p.min||0}</div></td>
                      <td><span className={`status-pill ${p.stock===0?'agotado':p.stock<(p.min||0)?'bajo':'activo'}`}><span className="dot"/>{p.stock===0?'Agotado':p.stock<(p.min||0)?'Stock bajo':'Normal'}</span></td>
                      <td><div className="action-btns">
                        {puede('ver_kardex') && <button className="btn btn-kardex btn-sm" onClick={() => cargarKardexProducto(p)} title="Kardex">📋</button>}
                        {puede('registrar_movimientos') && <button className="btn btn-ghost btn-sm" onClick={() => { setMovModal(p); setMovForm({ tipo: 'entrada', cantidad: '', unidad: p.unidad, motivo: '', referencia: '', sucursalOrigen: '', sucursalDestino: '' }) }} title="Movimiento">⚡</button>}
                        {puede('editar_productos') && <button className="btn btn-ghost btn-sm" onClick={() => abrirModal(p)}>✏️</button>}
                        {puede('eliminar_productos') && <button className="btn btn-danger btn-sm" onClick={() => eliminar(p.id)}>🗑️</button>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>)}

      {/* ══ KARDEX ══ */}
      {vista === 'kardex' && (<>
        <BackBtn />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{kardexModal ? `📋 Kardex — ${kardexModal.nombre}` : '📋 Kardex Global'}</div>
          <button className="btn btn-ghost btn-sm" onClick={exportarKardex}>📤 Exportar Excel</button>
        </div>
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar por producto, tipo, motivo o referencia..." value={busKardex} onChange={e => setBusKardex(e.target.value)} />
          {busKardex && <button className="btn btn-ghost btn-sm" onClick={() => setBusKardex('')}>✕ Limpiar</button>}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{kardexFiltrado.length} movimientos</span>
        </div>
        <div className="kardex-stats">
          <div className="kardex-stat"><div className="kardex-stat-val" style={{ color: '#00C296' }}>{totalEntradas.toFixed(0)}</div><div className="kardex-stat-label">Entradas</div></div>
          <div className="kardex-stat"><div className="kardex-stat-val" style={{ color: '#ef4444' }}>{totalSalidas.toFixed(0)}</div><div className="kardex-stat-label">Salidas</div></div>
          <div className="kardex-stat"><div className="kardex-stat-val">{kardex.length}</div><div className="kardex-stat-label">Movimientos</div></div>
          <div className="kardex-stat"><div className="kardex-stat-val" style={{ color: 'var(--accent2)' }}>{kardexModal ? `${kardexModal.stock} ${kardexModal.unidad}` : productos.length}</div><div className="kardex-stat-label">{kardexModal ? 'Stock Actual' : 'Productos'}</div></div>
        </div>
        <div className="card">
          {loadingKardex ? <div className="loading">🔄 Cargando...</div> : kardex.length === 0 ? <div className="empty-state"><div className="empty-icon">📋</div><div className="empty-text">Sin movimientos</div></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>FECHA</th>{!kardexModal && <th>PRODUCTO</th>}<th>TIPO</th><th>CANT.</th><th>UNIDAD</th><th>ANTES</th><th>DESPUES</th><th>MOTIVO</th><th>REF.</th></tr></thead>
                <tbody>
                  {kardexFiltrado.map(k => {
                    const mov = TIPOS_MOVIMIENTO.find(m => m.value === k.tipo) || TIPOS_MOVIMIENTO[0]
                    const fecha = k.fecha?.toDate?.() || new Date()
                    return (
                      <tr key={k.id}>
                        <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fecha.toLocaleDateString('es-SV')}<br/><span style={{ fontSize: 10 }}>{fecha.toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'})}</span></td>
                        {!kardexModal && <td><div style={{ fontWeight: 600, fontSize: 13 }}>{k.productoNombre}</div><div className="mono" style={{ fontSize: 10, color: 'var(--accent2)' }}>{k.productoCodigo}</div></td>}
                        <td><span className="mov-badge" style={{ background: mov.color+'15', color: mov.color, border: `1px solid ${mov.color}30` }}>{mov.icon} {mov.label}</span></td>
                        <td className="mono" style={{ fontWeight: 700, color: ['entrada','devolucion'].includes(k.tipo)?'#00C296':'#ef4444' }}>{['entrada','devolucion'].includes(k.tipo)?'+':k.tipo==='ajuste'?'=':'-'}{k.cantidad}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{k.unidad}</td>
                        <td className="mono" style={{ color: 'var(--muted)', fontSize: 13 }}>{k.stockAntes}</td>
                        <td className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{k.stockDespues}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{k.motivo || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--accent2)', fontFamily: 'var(--mono)' }}>{k.referencia || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>)}

      {/* ══ AJUSTES ══ */}
      {vista === 'ajustes' && (<>
        <BackBtn />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>⚡ Ajuste de Inventario</div>
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar por nombre, codigo o estado (agotado, bajo, normal)..." value={busAjuste} onChange={e => setBusAjuste(e.target.value)} />
          {busAjuste && <button className="btn btn-ghost btn-sm" onClick={() => setBusAjuste('')}>✕ Limpiar</button>}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{ajusteFiltrado.length} productos</span>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>CODIGO</th><th>PRODUCTO</th><th>STOCK ACTUAL</th><th>MINIMO</th><th>ESTADO</th><th>ACCION</th></tr></thead>
              <tbody>
                {ajusteFiltrado.map(p => (
                  <tr key={p.id}>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--accent2)' }}>{p.codigo}</td>
                    <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                    <td><span className={getStockClass(p.stock||0,p.min||0)}>{p.stock||0} {p.unidad}</span></td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{p.min||0}</td>
                    <td><span className={`status-pill ${p.stock===0?'agotado':p.stock<(p.min||0)?'bajo':'activo'}`}><span className="dot"/>{p.stock===0?'Agotado':p.stock<(p.min||0)?'Bajo':'Normal'}</span></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => { setMovModal(p); setMovForm({ tipo: 'ajuste', cantidad: '', unidad: p.unidad, motivo: '', referencia: '', sucursalOrigen: '', sucursalDestino: '' }) }}>⚡ Ajustar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}

      {/* ══ BODEGA ══ */}
      {vista === 'bodega' && (<>
        <BackBtn />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>🏭 Bodegas</div>
          <button className="btn btn-ghost btn-sm" onClick={exportarBodega}>📤 Exportar</button>
        </div>
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar por nombre o responsable..." value={busBodega} onChange={e => setBusBodega(e.target.value)} />
          {busBodega && <button className="btn btn-ghost btn-sm" onClick={() => setBusBodega('')}>✕ Limpiar</button>}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{bodegaFiltrada.length} bodegas</span>
        </div>
        {bodegas.length === 0 ? <div className="empty-state"><div className="empty-icon">🏭</div><div className="empty-text">No hay bodegas.<br/>Crea tu primera bodega.</div></div> : (
          <div className="bodega-grid">
            {bodegaFiltrada.map(b => {
              const prods = productos.filter(p => p.bodega === b.id)
              const valor = prods.reduce((s, p) => s + (p.precio||0)*(p.stock||0), 0)
              return (
                <div key={b.id} className="bodega-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800 }}>🏭 {b.nombre}</div>
                      {b.descripcion && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{b.descripcion}</div>}
                      {b.responsable && <div style={{ fontSize: 12, color: 'var(--muted)' }}>👤 {b.responsable}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditandoBodega(b.id); setFormBodega({ nombre: b.nombre, descripcion: b.descripcion||'', responsable: b.responsable||'' }); setModalBodega(true) }}>✏️</button>
                      <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Eliminar bodega?')) deleteDoc(doc(db,'bodegas',b.id)) }}>🗑️</button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px', border: '1px solid var(--border)', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{prods.length}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Productos</div>
                    </div>
                    <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px', border: '1px solid var(--border)', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#4A8FE8' }}>{fmt(valor)}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Valor</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </>)}

      {/* ══ SUCURSALES ══ */}
      {vista === 'sucursales' && (<>
        <BackBtn />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>🏪 Sucursales</div>
          <button className="btn btn-ghost btn-sm" onClick={exportarSucursales}>📤 Exportar</button>
        </div>
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar por nombre, direccion o responsable..." value={busSucursal} onChange={e => setBusSucursal(e.target.value)} />
          {busSucursal && <button className="btn btn-ghost btn-sm" onClick={() => setBusSucursal('')}>✕ Limpiar</button>}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{sucursalFiltrada.length} sucursales</span>
        </div>
        {sucursales.length === 0 ? <div className="empty-state"><div className="empty-icon">🏪</div><div className="empty-text">No hay sucursales.<br/>Crea tu primera sucursal.</div></div> : (
          <div className="sucursal-grid">
            {sucursalFiltrada.map(s => (
              <div key={s.id} className="sucursal-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>🏪 {s.nombre}</div>
                    {s.direccion && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>📍 {s.direccion}</div>}
                    {s.telefono && <div style={{ fontSize: 12, color: 'var(--muted)' }}>📞 {s.telefono}</div>}
                    {s.responsable && <div style={{ fontSize: 12, color: 'var(--muted)' }}>👤 {s.responsable}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditandoSucursal(s.id); setFormSucursal({ nombre: s.nombre, direccion: s.direccion||'', telefono: s.telefono||'', responsable: s.responsable||'' }); setModalSucursal(true) }}>✏️</button>
                    <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Eliminar sucursal?')) deleteDoc(doc(db,'sucursales',s.id)) }}>🗑️</button>
                  </div>
                </div>
                <div style={{ background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--muted)' }}>
                  🔄 Traslados entre sucursales se registran en el Kardex
                </div>
              </div>
            ))}
          </div>
        )}
      </>)}

      {/* ══ ALERTAS ══ */}
      {vista === 'alertas' && (<>
        <BackBtn />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>🚨 Alertas de Stock</div>
          <button className="btn btn-ghost btn-sm" onClick={exportarAlertas}>📤 Exportar Excel</button>
        </div>
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar por nombre o codigo..." value={busAlerta} onChange={e => setBusAlerta(e.target.value)} />
          {busAlerta && <button className="btn btn-ghost btn-sm" onClick={() => setBusAlerta('')}>✕ Limpiar</button>}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{alertaCriticoFiltrada.length + alertaBajaFiltrada.length} alertas</span>
        </div>
        {alertaCriticoFiltrada.length > 0 && (<>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>🔴 Agotados — {alertaCriticoFiltrada.length}</div>
          {alertaCriticoFiltrada.map(p => (
            <div key={p.id} className="alerta-card" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.04)' }}>
              <div className="alerta-semaforo alerta-critico"/>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{p.nombre}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.codigo} · {p.categoria||'Sin categoria'}</div></div>
              <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: '#ef4444', fontSize: 16 }}>0 {p.unidad}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Sugerido: {Math.max((p.min||0)*2,10)}</div></div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setMovModal(p); setMovForm({ tipo: 'entrada', cantidad: String(Math.max((p.min||0)*2,10)), unidad: p.unidad, motivo: 'Reposicion de stock', referencia: '', sucursalOrigen: '', sucursalDestino: '' }) }}>⚡ Reponer</button>
            </div>
          ))}
        </>)}
        {alertaBajaFiltrada.length > 0 && (<>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '18px 0 10px' }}>🟡 Stock Bajo — {alertaBajaFiltrada.length}</div>
          {alertaBajaFiltrada.map(p => (
            <div key={p.id} className="alerta-card" style={{ borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.04)' }}>
              <div className="alerta-semaforo alerta-bajo"/>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{p.nombre}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.codigo} · {p.categoria||'Sin categoria'}</div></div>
              <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: '#f59e0b', fontSize: 16 }}>{p.stock} {p.unidad}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Min: {p.min} · Pedir: {Math.max((p.min||0)*2-(p.stock||0),0)}</div></div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setMovModal(p); setMovForm({ tipo: 'entrada', cantidad: String(Math.max((p.min||0)*2-(p.stock||0),0)), unidad: p.unidad, motivo: 'Reposicion de stock', referencia: '', sucursalOrigen: '', sucursalDestino: '' }) }}>⚡ Reponer</button>
            </div>
          ))}
        </>)}
        {alertaCriticoFiltrada.length === 0 && alertaBajaFiltrada.length === 0 && <div className="empty-state"><div className="empty-icon">✅</div><div className="empty-text">¡Todo el inventario esta en buen estado!<br/>No hay alertas de stock.</div></div>}
      </>)}

      {/* ══ VALORACION ══ */}
      {vista === 'valoracion' && (<>
        <BackBtn />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>📊 Valoracion del Inventario</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={exportarValoracion}>📤 Excel</button>
            <button className="btn btn-ghost btn-sm" onClick={imprimirValoracion}>🖨️ PDF</button>
          </div>
        </div>
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar por nombre, codigo o categoria..." value={busValoracion} onChange={e => setBusValoracion(e.target.value)} />
          {busValoracion && <button className="btn btn-ghost btn-sm" onClick={() => setBusValoracion('')}>✕ Limpiar</button>}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{valoracionFiltrada.length} productos</span>
        </div>
        <div className="valor-stats">
          <div className="valor-stat"><div className="valor-stat-val" style={{ color: '#00C296' }}>{fmt(productos.reduce((s,p)=>s+(p.precio||0)*(p.stock||0),0))}</div><div className="valor-stat-label">Valor a Costo</div></div>
          <div className="valor-stat"><div className="valor-stat-val" style={{ color: '#4A8FE8' }}>{fmt(productos.reduce((s,p)=>s+(p.precio||0)*1.13*(p.stock||0),0))}</div><div className="valor-stat-label">Valor a Precio de Venta</div></div>
          <div className="valor-stat"><div className="valor-stat-val" style={{ color: '#8b5cf6' }}>{fmt(productos.reduce((s,p)=>s+(p.precio||0)*0.13*(p.stock||0),0))}</div><div className="valor-stat-label">Ganancia Estimada (IVA)</div></div>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>CODIGO</th><th>PRODUCTO</th><th>CATEGORIA</th><th>STOCK</th><th>PRECIO COSTO</th><th>PRECIO VENTA</th><th>VALOR COSTO</th><th>VALOR VENTA</th></tr></thead>
              <tbody>
                {valoracionFiltrada.map(p => (
                  <tr key={p.id}>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--accent2)' }}>{p.codigo}</td>
                    <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.categoria||'—'}</td>
                    <td className="mono">{p.stock||0} {p.unidad}</td>
                    <td className="amount">{fmt(p.precio)}</td>
                    <td className="amount">{fmt((p.precio||0)*1.13)}</td>
                    <td className="amount" style={{ fontWeight: 700, color: '#00C296' }}>{fmt((p.precio||0)*(p.stock||0))}</td>
                    <td className="amount" style={{ fontWeight: 700, color: '#4A8FE8' }}>{fmt((p.precio||0)*1.13*(p.stock||0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}

      {/* MODAL MOVIMIENTO */}
      {movModal && (
        <div className="modal-overlay" onClick={() => setMovModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">⚡ Registrar Movimiento</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}><strong style={{ color: 'var(--text)' }}>{movModal.nombre}</strong> · Stock: <strong>{movModal.stock} {movModal.unidad}</strong></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
              {TIPOS_MOVIMIENTO.filter(m => !['venta','compra'].includes(m.value)).map(m => (
                <div key={m.value} onClick={() => setMovForm(f => ({ ...f, tipo: m.value }))}
                  style={{ padding: '10px 8px', borderRadius: 10, textAlign: 'center', cursor: 'pointer', border: `1.5px solid ${movForm.tipo===m.value?m.color:'var(--border)'}`, background: movForm.tipo===m.value?m.color+'15':'var(--surface2)', color: movForm.tipo===m.value?m.color:'var(--muted)', fontSize: 12, fontWeight: 600, transition: 'all 0.15s' }}>
                  {m.icon} {m.label}
                </div>
              ))}
            </div>
            {movForm.tipo === 'traslado' && (
              <div className="form-grid" style={{ marginBottom: 12 }}>
                <div className="form-group"><label className="form-label">Sucursal Origen</label><select className="input" value={movForm.sucursalOrigen} onChange={e => setMovForm(f=>({...f,sucursalOrigen:e.target.value}))}><option value="">Seleccionar...</option>{sucursales.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Sucursal Destino</label><select className="input" value={movForm.sucursalDestino} onChange={e => setMovForm(f=>({...f,sucursalDestino:e.target.value}))}><option value="">Seleccionar...</option>{sucursales.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
              </div>
            )}
            <div className="form-grid">
              <div className="form-group"><label className="form-label">{movForm.tipo==='ajuste'?'Nuevo Stock Total':'Cantidad'}</label><input className="input" type="number" min="0" step="0.01" placeholder="0" value={movForm.cantidad} onChange={e=>setMovForm(f=>({...f,cantidad:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">Unidad</label><select className="input" value={movForm.unidad} onChange={e=>setMovForm(f=>({...f,unidad:e.target.value}))}><option value={movModal.unidad}>{movModal.unidad} (principal)</option>{(movModal.unidadesAdicionales||[]).map((u,i)=><option key={i} value={u.nombre}>{u.nombre}</option>)}</select></div>
            </div>
            <div className="form-group"><label className="form-label">Motivo</label><input className="input" placeholder="Compra proveedor, Merma..." value={movForm.motivo} onChange={e=>setMovForm(f=>({...f,motivo:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Referencia</label><input className="input" placeholder="OC-001, FE-000023..." value={movForm.referencia} onChange={e=>setMovForm(f=>({...f,referencia:e.target.value}))}/></div>
            {movForm.cantidad && (
              <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginTop: 8, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Stock actual: <strong>{movModal.stock}</strong></span>
                <span style={{ fontSize: 18 }}>→</span>
                <span>Nuevo: <strong style={{ color: 'var(--accent)', fontSize: 16 }}>{movForm.tipo==='ajuste'?parseFloat(movForm.cantidad)||0:['entrada','devolucion'].includes(movForm.tipo)?(movModal.stock||0)+(parseFloat(movForm.cantidad)||0):Math.max(0,(movModal.stock||0)-(parseFloat(movForm.cantidad)||0))} {movModal.unidad}</strong></span>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setMovModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={registrarMovimiento} disabled={!movForm.cantidad}>⚡ Registrar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRODUCTO */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editando ? '✏️ Editar Producto' : '📦 Nuevo Producto'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="section-divider">INFORMACION BASICA</div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">CODIGO *</label><input className="input" placeholder="P001" value={f.codigo} onChange={e=>setForm({...f,codigo:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">CATEGORIA</label><input className="input" placeholder="Electrico..." value={f.categoria} onChange={e=>setForm({...f,categoria:e.target.value})}/></div>
              </div>
              <div className="form-group"><label className="form-label">NOMBRE *</label><input className="input" placeholder="Nombre del producto" value={f.nombre} onChange={e=>setForm({...f,nombre:e.target.value})}/></div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">PRECIO (sin IVA) *</label><input className="input" type="number" step="0.01" placeholder="0.00" value={f.precio} onChange={e=>setForm({...f,precio:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">DESCUENTO (%)</label><input className="input" type="number" min="0" max="100" placeholder="0" value={f.descuento} onChange={e=>setForm({...f,descuento:e.target.value})}/></div>
              </div>
              {f.precio && <div className="iva-hint">💡 Precio con IVA: <strong style={{ color: 'var(--accent)' }}>${precioFinal(f.precio,f.descuento).toFixed(2)}</strong></div>}
              <div className="section-divider">UNIDADES DE MEDIDA</div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">UNIDAD PRINCIPAL *</label>
                  <select className="input" value={f.unidad} onChange={e=>setForm({...f,unidad:e.target.value})}>
                    {['General','Empaque','Longitud','Peso','Volumen'].map(g=><optgroup key={g} label={g}>{UNIDADES_SISTEMA.filter(u=>u.grupo===g).map(u=><option key={u.nombre} value={u.nombre}>{u.nombre}</option>)}</optgroup>)}
                    <option value="Otra">Otra</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">STOCK *</label><input className="input" type="number" placeholder="0" value={f.stock} onChange={e=>setForm({...f,stock:e.target.value})}/></div>
              </div>
              <div className="form-group"><label className="form-label">STOCK MINIMO</label><input className="input" type="number" placeholder="0" value={f.min} onChange={e=>setForm({...f,min:e.target.value})}/></div>
              <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>📦 Unidades Adicionales <span className="tag-opcional">OPCIONAL</span></div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setForm(f=>({...f,unidadesAdicionales:[...(f.unidadesAdicionales||[]),{nombre:'',factor:1,precio:''}]}))}>+ Agregar</button>
                </div>
                {(f.unidadesAdicionales||[]).length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>Sin unidades adicionales</div>}
                {(f.unidadesAdicionales||[]).map((u,idx)=>(
                  <div key={idx} className="unidad-adicional-row">
                    <div style={{ flex: 2 }}><div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Nombre</div><input className="input" style={{ height: 34, fontSize: 13 }} placeholder="Rollo, Caja..." value={u.nombre} onChange={e=>{const n=[...(f.unidadesAdicionales||[])];n[idx]={...n[idx],nombre:e.target.value};setForm({...f,unidadesAdicionales:n})}}/></div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Factor</div><input className="input" type="number" style={{ height: 34, fontSize: 13 }} placeholder="100" value={u.factor} onChange={e=>{const n=[...(f.unidadesAdicionales||[])];n[idx]={...n[idx],factor:parseFloat(e.target.value)||1};setForm({...f,unidadesAdicionales:n})}}/></div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Precio s/IVA</div><input className="input" type="number" step="0.01" style={{ height: 34, fontSize: 13 }} placeholder="0.00" value={u.precio} onChange={e=>{const n=[...(f.unidadesAdicionales||[])];n[idx]={...n[idx],precio:e.target.value};setForm({...f,unidadesAdicionales:n})}}/></div>
                    <button className="btn btn-danger btn-sm" style={{ height: 34, alignSelf: 'flex-end' }} onClick={()=>setForm(f=>({...f,unidadesAdicionales:f.unidadesAdicionales.filter((_,i)=>i!==idx)}))}>✕</button>
                  </div>
                ))}
              </div>
              <div className="section-divider">INFORMACION ADICIONAL <span className="tag-opcional">OPCIONAL</span></div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">PROVEEDOR</label><input className="input" placeholder="Nombre del proveedor" value={f.proveedor} onChange={e=>setForm({...f,proveedor:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">CODIGO DE BARRAS</label><input className="input" placeholder="7500000001234" value={f.codigoBarras} onChange={e=>setForm({...f,codigoBarras:e.target.value})}/></div>
              </div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">UBICACION EN BODEGA</label><input className="input" placeholder="Estante A-1..." value={f.ubicacion} onChange={e=>setForm({...f,ubicacion:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">BODEGA</label><select className="input" value={f.bodega} onChange={e=>setForm({...f,bodega:e.target.value})}><option value="">Sin bodega</option>{bodegas.map(b=><option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
              </div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">FECHA VENCIMIENTO</label><input className="input" type="date" value={f.fechaVencimiento} onChange={e=>setForm({...f,fechaVencimiento:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">URL IMAGEN</label><input className="input" placeholder="https://..." value={f.imagen} onChange={e=>setForm({...f,imagen:e.target.value})}/></div>
              </div>
              {f.imagen && <img src={f.imagen} alt="preview" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} onError={e=>e.target.style.display='none'}/>}
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando||!f.codigo||!f.nombre||!f.precio||!f.stock}>{guardando?'⏳ Guardando...':'💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BODEGA */}
      {modalBodega && (
        <div className="modal-overlay" onClick={() => setModalBodega(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-title">{editandoBodega?'✏️ Editar Bodega':'🏭 Nueva Bodega'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group"><label className="form-label">NOMBRE *</label><input className="input" placeholder="Bodega Principal" value={formBodega.nombre} onChange={e=>setFormBodega(f=>({...f,nombre:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">DESCRIPCION</label><input className="input" placeholder="Descripcion..." value={formBodega.descripcion} onChange={e=>setFormBodega(f=>({...f,descripcion:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">RESPONSABLE</label><input className="input" placeholder="Nombre del responsable" value={formBodega.responsable} onChange={e=>setFormBodega(f=>({...f,responsable:e.target.value}))}/></div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={()=>setModalBodega(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarBodega} disabled={guardando||!formBodega.nombre}>{guardando?'⏳...':'💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SUCURSAL */}
      {modalSucursal && (
        <div className="modal-overlay" onClick={() => setModalSucursal(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-title">{editandoSucursal?'✏️ Editar Sucursal':'🏪 Nueva Sucursal'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group"><label className="form-label">NOMBRE *</label><input className="input" placeholder="Sucursal Centro" value={formSucursal.nombre} onChange={e=>setFormSucursal(f=>({...f,nombre:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">DIRECCION</label><input className="input" placeholder="Direccion..." value={formSucursal.direccion} onChange={e=>setFormSucursal(f=>({...f,direccion:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">TELEFONO</label><input className="input" placeholder="7000-0000" value={formSucursal.telefono} onChange={e=>setFormSucursal(f=>({...f,telefono:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">RESPONSABLE</label><input className="input" placeholder="Nombre del encargado" value={formSucursal.responsable} onChange={e=>setFormSucursal(f=>({...f,responsable:e.target.value}))}/></div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={()=>setModalSucursal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarSucursal} disabled={guardando||!formSucursal.nombre}>{guardando?'⏳...':'💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORTAR */}
      {importModalOpen && (
        <div className="modal-overlay" onClick={() => { setImportModalOpen(false); setImportData([]) }}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-title">📥 Importar desde Excel</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>📄 {importData.length} filas</span>
              <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>✅ {totalOk} validas</span>
              {totalErr > 0 && <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>❌ {totalErr} errores</span>}
            </div>
            <div className="import-preview">
              <table>
                <thead><tr><th style={{ padding: '8px 12px', fontSize: 10 }}>FILA</th><th style={{ padding: '8px 12px', fontSize: 10 }}>CODIGO</th><th style={{ padding: '8px 12px', fontSize: 10 }}>NOMBRE</th><th style={{ padding: '8px 12px', fontSize: 10 }}>PRECIO</th><th style={{ padding: '8px 12px', fontSize: 10 }}>STOCK</th><th style={{ padding: '8px 12px', fontSize: 10 }}>ESTADO</th></tr></thead>
                <tbody>
                  {importData.map((row,i)=>(
                    <tr key={i} className={row._ok?'import-row-ok':'import-row-err'}>
                      <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--muted)' }}>{row._fila}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)' }}>{row.codigo}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12 }}>{row.nombre}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)' }}>${row.precio?.toFixed(2)}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)' }}>{row.stock}</td>
                      <td style={{ padding: '7px 12px', fontSize: 11 }}>{row._ok?<span style={{ color: 'var(--accent)', fontWeight: 600 }}>✅ OK</span>:<span style={{ color: 'var(--danger)', fontWeight: 600 }}>❌ {row._errores.join(', ')}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={()=>{setImportModalOpen(false);setImportData([])}}>Cancelar</button>
              <button className="btn btn-primary" onClick={importarProductos} disabled={totalOk===0||importando}>{importando?'⏳ Importando...':`📥 Importar ${totalOk} productos`}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}