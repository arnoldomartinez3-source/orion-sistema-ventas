import { useState, useEffect, useRef } from 'react'
import { db } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, writeBatch, query, where, orderBy, getDocs
} from 'firebase/firestore'
import * as XLSX from 'xlsx'

// ══════════════════════════════════════════════════
// INVENTARIO ORIÓN — Con Kardex y múltiples unidades
// ══════════════════════════════════════════════════

const IVA = 0.13

// Unidades predefinidas con factores de conversión base
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
  { nombre: 'Centímetro', factor: 0.01,   grupo: 'Longitud' },
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
  { nombre: 'Galón',      factor: 3.785,  grupo: 'Volumen' },
]

const TIPOS_MOVIMIENTO = [
  { value: 'entrada',    label: 'Entrada',    icon: '📥', color: '#00C296' },
  { value: 'salida',     label: 'Salida',     icon: '📤', color: '#ef4444' },
  { value: 'ajuste',     label: 'Ajuste',     icon: '🔧', color: '#f59e0b' },
  { value: 'devolucion', label: 'Devolución', icon: '↩️', color: '#4A8FE8' },
  { value: 'venta',      label: 'Venta',      icon: '🛒', color: '#8b5cf6' },
  { value: 'compra',     label: 'Compra',     icon: '🛍️', color: '#2E6FD4' },
]

const COLUMNAS_EXCEL = ['codigo','nombre','categoria','precio','stock','min','unidad','unidades_adicionales','proveedor','codigoBarras','ubicacion','descuento','fechaVencimiento','imagen']

const invStyles = `
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
  .excel-btn { display: inline-flex; align-items: center; gap: 6px; }
  .optional-label { font-size: 10px; color: var(--muted); font-weight: 400; margin-left: 4px; }
  .required-label { font-size: 10px; color: var(--danger); font-weight: 600; margin-left: 2px; }
  .section-divider { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 1px; padding: 4px 0; border-bottom: 1px solid var(--border); margin-bottom: 4px; margin-top: 8px; }
  .iva-hint { background: rgba(0,212,170,0.08); border: 1px solid rgba(0,212,170,0.2); border-radius: 10px; padding: 10px 14px; font-size: 13px; }
  .tag-opcional { display: inline-block; background: var(--surface2); border: 1px solid var(--border); color: var(--muted); font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 4px; margin-left: 4px; letter-spacing: 0.5px; }
  .modal-lg { max-width: 660px !important; max-height: 90vh; overflow-y: auto; }
  .modal-xl2 { max-width: 780px !important; max-height: 92vh; overflow-y: auto; }
  .prod-detail { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .prod-tag { display: inline-flex; align-items: center; gap: 4px; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; font-size: 11px; color: var(--muted); }
  .import-preview { max-height: 280px; overflow-y: auto; margin-top: 14px; border-radius: 10px; border: 1px solid var(--border); }
  .import-preview table { min-width: 100%; }
  .import-preview th { background: var(--surface2); position: sticky; top: 0; }
  .import-row-ok { background: rgba(0,212,170,0.05); }
  .import-row-err { background: rgba(255,77,109,0.07); }
  .import-stats { display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
  .import-stat { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
  .import-stat.ok { color: var(--accent); }
  .import-stat.err { color: var(--danger); }
  .import-stat.total { color: var(--muted); }

  /* KARDEX */
  .kardex-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; flex-wrap: wrap; gap: 10px; }
  .kardex-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 20px; }
  @media (max-width: 700px) { .kardex-stats { grid-template-columns: repeat(2,1fr); } }
  .kardex-stat { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 12px; padding: 14px; text-align: center; }
  .kardex-stat-val { font-size: 20px; font-weight: 800; font-family: var(--mono); }
  .kardex-stat-label { font-size: 10px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
  .mov-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; }

  /* UNIDADES ADICIONALES */
  .unidad-adicional-row { display: flex; gap: 8px; align-items: center; background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
  .unidad-adicional-row input, .unidad-adicional-row select { flex: 1; }

  /* TABS */
  .inv-tabs { display: flex; gap: 4px; margin-bottom: 20px; flex-wrap: wrap; }
  .inv-tab { padding: 9px 18px; border-radius: 10px; border: 1.5px solid var(--border); background: transparent; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; transition: all 0.15s; font-family: inherit; }
  .inv-tab.active { background: var(--glow); color: var(--accent); border-color: var(--accent); }
  .inv-tab:hover { color: var(--text); border-color: var(--border2); }

  /* BOTONES ACCION KARDEX */
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
  categoria: '', proveedor: '', codigoBarras: '', ubicacion: '',
  descuento: '', fechaVencimiento: '', imagen: '',
  unidadesAdicionales: [], // [{nombre, factor, precio}]
}

export default function Inventario() {
  const [tab, setTab] = useState('inventario') // inventario | kardex
  const [productos, setProductos] = useState([])
  const [kardex, setKardex] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingKardex, setLoadingKardex] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [kardexModal, setKardexModal] = useState(null) // producto seleccionado para kardex
  const [movModal, setMovModal] = useState(null) // producto para registrar movimiento manual
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [guardando, setGuardando] = useState(false)
  const [importData, setImportData] = useState([])
  const [importando, setImportando] = useState(false)
  const [movForm, setMovForm] = useState({ tipo: 'entrada', cantidad: '', unidad: '', motivo: '', referencia: '' })
  const fileRef = useRef()

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'productos'), (snap) => {
      setProductos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // Cargar kardex global
  useEffect(() => {
    if (tab !== 'kardex') return
    setLoadingKardex(true)
    const q = query(collection(db, 'kardex'), orderBy('fecha', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setKardex(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoadingKardex(false)
    })
    return () => unsub()
  }, [tab])

  // Cargar kardex de un producto específico
  const cargarKardexProducto = async (producto) => {
    setLoadingKardex(true)
    setKardexModal(producto)
    try {
      const q = query(collection(db, 'kardex'), where('productoId', '==', producto.id), orderBy('fecha', 'desc'))
      const snap = await getDocs(q)
      setKardex(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      // Si no hay índice aún, carga sin orden
      const snap = await getDocs(query(collection(db, 'kardex'), where('productoId', '==', producto.id)))
      setKardex(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0)))
    }
    setLoadingKardex(false)
  }

  // Registrar movimiento manual en kardex
  const registrarMovimiento = async () => {
    if (!movForm.cantidad || !movModal) return
    const producto = movModal
    const cantidad = parseFloat(movForm.cantidad) || 0
    const tipo = movForm.tipo
    let nuevoStock = producto.stock || 0

    if (tipo === 'entrada' || tipo === 'compra' || tipo === 'devolucion') {
      nuevoStock += cantidad
    } else if (tipo === 'salida' || tipo === 'venta') {
      if (cantidad > nuevoStock) { alert('Stock insuficiente'); return }
      nuevoStock -= cantidad
    } else if (tipo === 'ajuste') {
      nuevoStock = cantidad // ajuste directo al valor
    }

    try {
      // 1. Registrar en kardex
      await addDoc(collection(db, 'kardex'), {
        productoId: producto.id,
        productoCodigo: producto.codigo,
        productoNombre: producto.nombre,
        tipo,
        cantidad,
        unidad: movForm.unidad || producto.unidad,
        stockAntes: producto.stock || 0,
        stockDespues: nuevoStock,
        motivo: movForm.motivo || '',
        referencia: movForm.referencia || '',
        fecha: serverTimestamp(),
      })
      // 2. Actualizar stock del producto
      await updateDoc(doc(db, 'productos', producto.id), {
        stock: nuevoStock,
        updatedAt: serverTimestamp()
      })
      setMovModal(null)
      setMovForm({ tipo: 'entrada', cantidad: '', unidad: '', motivo: '', referencia: '' })
      alert(`✅ Movimiento registrado. Stock: ${nuevoStock} ${producto.unidad}`)
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  // Agregar unidad adicional al form
  const agregarUnidadAdicional = () => {
    setForm(f => ({
      ...f,
      unidadesAdicionales: [...(f.unidadesAdicionales || []), { nombre: '', factor: 1, precio: '' }]
    }))
  }

  const actualizarUnidadAdicional = (idx, campo, valor) => {
    setForm(f => {
      const nuevas = [...(f.unidadesAdicionales || [])]
      nuevas[idx] = { ...nuevas[idx], [campo]: valor }
      return { ...f, unidadesAdicionales: nuevas }
    })
  }

  const quitarUnidadAdicional = (idx) => {
    setForm(f => ({
      ...f,
      unidadesAdicionales: f.unidadesAdicionales.filter((_, i) => i !== idx)
    }))
  }

  const filtrados = productos.filter(p =>
    p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.proveedor?.toLowerCase().includes(busqueda.toLowerCase())
  )

  const abrirModal = (producto = null) => {
    if (producto) {
      setEditando(producto.id)
      setForm({
        codigo: producto.codigo || '',
        nombre: producto.nombre || '',
        categoria: producto.categoria || '',
        precio: producto.precio?.toString() || '',
        stock: producto.stock?.toString() || '',
        min: producto.min?.toString() || '',
        unidad: producto.unidad || 'Unidad',
        proveedor: producto.proveedor || '',
        codigoBarras: producto.codigoBarras || '',
        ubicacion: producto.ubicacion || '',
        descuento: producto.descuento?.toString() || '',
        fechaVencimiento: producto.fechaVencimiento || '',
        imagen: producto.imagen || '',
        unidadesAdicionales: producto.unidadesAdicionales || [],
      })
    } else {
      setEditando(null)
      setForm(emptyForm)
    }
    setModalOpen(true)
  }

  const guardar = async () => {
    if (!form.nombre || !form.codigo || !form.precio || !form.stock) return
    setGuardando(true)
    const stockNuevo = parseInt(form.stock) || 0
    const stockAnterior = editando ? (productos.find(p => p.id === editando)?.stock || 0) : 0

    const data = {
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim(),
      precio: parseFloat(form.precio) || 0,
      stock: stockNuevo,
      min: parseInt(form.min) || 0,
      unidad: form.unidad || 'Unidad',
      unidadesAdicionales: (form.unidadesAdicionales || []).filter(u => u.nombre),
      ...(form.proveedor && { proveedor: form.proveedor.trim() }),
      ...(form.codigoBarras && { codigoBarras: form.codigoBarras.trim() }),
      ...(form.ubicacion && { ubicacion: form.ubicacion.trim() }),
      ...(form.descuento && { descuento: parseFloat(form.descuento) || 0 }),
      ...(form.fechaVencimiento && { fechaVencimiento: form.fechaVencimiento }),
      ...(form.imagen && { imagen: form.imagen.trim() }),
      updatedAt: serverTimestamp()
    }

    try {
      if (editando) {
        await updateDoc(doc(db, 'productos', editando), data)
        // Si el stock cambió, registrar en kardex
        if (stockNuevo !== stockAnterior) {
          const diff = stockNuevo - stockAnterior
          await addDoc(collection(db, 'kardex'), {
            productoId: editando,
            productoCodigo: form.codigo,
            productoNombre: form.nombre,
            tipo: diff > 0 ? 'ajuste' : 'ajuste',
            cantidad: Math.abs(diff),
            unidad: form.unidad,
            stockAntes: stockAnterior,
            stockDespues: stockNuevo,
            motivo: 'Ajuste desde edición de producto',
            referencia: '',
            fecha: serverTimestamp(),
          })
        }
      } else {
        const ref = await addDoc(collection(db, 'productos'), { ...data, createdAt: serverTimestamp() })
        // Registrar entrada inicial en kardex
        if (stockNuevo > 0) {
          await addDoc(collection(db, 'kardex'), {
            productoId: ref.id,
            productoCodigo: form.codigo,
            productoNombre: form.nombre,
            tipo: 'entrada',
            cantidad: stockNuevo,
            unidad: form.unidad,
            stockAntes: 0,
            stockDespues: stockNuevo,
            motivo: 'Stock inicial',
            referencia: '',
            fecha: serverTimestamp(),
          })
        }
      }
      setModalOpen(false)
    } catch (e) {
      alert('Error al guardar: ' + e.message)
    }
    setGuardando(false)
  }

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar este producto?')) return
    try { await deleteDoc(doc(db, 'productos', id)) }
    catch (e) { alert('Error: ' + e.message) }
  }

  // Exportar Excel
  const exportarExcel = () => {
    const datos = productos.map(p => ({
      codigo: p.codigo || '', nombre: p.nombre || '',
      categoria: p.categoria || '', precio: p.precio || 0,
      stock: p.stock || 0, min: p.min || 0, unidad: p.unidad || '',
      unidades_adicionales: (p.unidadesAdicionales || []).map(u => `${u.nombre}(x${u.factor})`).join(' | '),
      proveedor: p.proveedor || '', codigoBarras: p.codigoBarras || '',
      ubicacion: p.ubicacion || '', descuento: p.descuento || 0,
      fechaVencimiento: p.fechaVencimiento || '', imagen: p.imagen || '',
    }))
    const ws = XLSX.utils.json_to_sheet(datos, { header: COLUMNAS_EXCEL })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
    XLSX.writeFile(wb, `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const descargarPlantilla = () => {
    const ejemplo = [
      { codigo: 'CAB001', nombre: 'Cable eléctrico #14', categoria: 'Eléctrico', precio: 0.85, stock: 500, min: 50, unidad: 'Metro', unidades_adicionales: 'Rollo(x100)', proveedor: 'El. Nacional', codigoBarras: '', ubicacion: 'Bodega A', descuento: 0, fechaVencimiento: '', imagen: '' },
      { codigo: 'CEM001', nombre: 'Cemento gris', categoria: 'Construcción', precio: 7.50, stock: 100, min: 20, unidad: 'Bolsa', unidades_adicionales: 'Quintal(x2)', proveedor: 'Cemex SV', codigoBarras: '', ubicacion: 'Bodega B', descuento: 0, fechaVencimiento: '', imagen: '' },
    ]
    const ws = XLSX.utils.json_to_sheet(ejemplo, { header: COLUMNAS_EXCEL })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Productos')
    XLSX.writeFile(wb, 'plantilla-inventario.xlsx')
  }

  const leerExcel = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
      const filas = raw.map((row, i) => {
        const codigo = String(row.codigo || '').trim()
        const nombre = String(row.nombre || '').trim()
        const precio = parseFloat(row.precio || 0)
        const errores = []
        if (!codigo) errores.push('Falta código')
        if (!nombre) errores.push('Falta nombre')
        if (isNaN(precio) || precio < 0) errores.push('Precio inválido')
        return {
          _fila: i + 2, codigo, nombre,
          categoria: String(row.categoria || '').trim(),
          precio, stock: parseInt(row.stock || 0),
          min: parseInt(row.min || 0),
          unidad: String(row.unidad || 'Unidad').trim(),
          proveedor: String(row.proveedor || '').trim(),
          codigoBarras: String(row.codigoBarras || '').trim(),
          ubicacion: String(row.ubicacion || '').trim(),
          descuento: parseFloat(row.descuento || 0),
          fechaVencimiento: String(row.fechaVencimiento || '').trim(),
          imagen: String(row.imagen || '').trim(),
          _errores: errores, _ok: errores.length === 0
        }
      })
      setImportData(filas)
      setImportModalOpen(true)
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const importarProductos = async () => {
    const validos = importData.filter(f => f._ok)
    if (validos.length === 0) return
    setImportando(true)
    try {
      const loteSize = 400
      for (let i = 0; i < validos.length; i += loteSize) {
        const batch = writeBatch(db)
        validos.slice(i, i + loteSize).forEach(p => {
          const ref = doc(collection(db, 'productos'))
          batch.set(ref, {
            codigo: p.codigo, nombre: p.nombre, categoria: p.categoria,
            precio: p.precio, stock: p.stock, min: p.min, unidad: p.unidad,
            ...(p.proveedor && { proveedor: p.proveedor }),
            ...(p.codigoBarras && { codigoBarras: p.codigoBarras }),
            ...(p.ubicacion && { ubicacion: p.ubicacion }),
            ...(p.descuento && { descuento: p.descuento }),
            ...(p.fechaVencimiento && { fechaVencimiento: p.fechaVencimiento }),
            createdAt: serverTimestamp(), updatedAt: serverTimestamp()
          })
        })
        await batch.commit()
      }
      setImportModalOpen(false)
      setImportData([])
      alert(`✅ ${validos.length} productos importados`)
    } catch (e) { alert('Error: ' + e.message) }
    setImportando(false)
  }

  // Stats kardex
  const totalEntradas = kardex.filter(k => ['entrada','compra','devolucion'].includes(k.tipo)).reduce((s, k) => s + (k.cantidad || 0), 0)
  const totalSalidas = kardex.filter(k => ['salida','venta'].includes(k.tipo)).reduce((s, k) => s + (k.cantidad || 0), 0)
  const totalOk = importData.filter(f => f._ok).length
  const totalErr = importData.filter(f => !f._ok).length
  const f = form

  return (
    <>
      <style>{invStyles}</style>

      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">📦 Inventario</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {productos.length} productos
            <span className="firebase-badge">🔥 Firebase</span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => abrirModal()}>+ Nuevo Producto</button>
      </div>

      {/* TABS */}
      <div className="inv-tabs">
        <button className={`inv-tab ${tab === 'inventario' ? 'active' : ''}`} onClick={() => setTab('inventario')}>
          📦 Inventario
        </button>
        <button className={`inv-tab ${tab === 'kardex' ? 'active' : ''}`} onClick={() => { setTab('kardex'); setKardexModal(null) }}>
          📋 Kardex Global
        </button>
      </div>

      {/* ════ TAB INVENTARIO ════ */}
      {tab === 'inventario' && (
        <>
          <div className="inv-toolbar">
            <input className="input" placeholder="🔍 Buscar por nombre, código, categoría o proveedor..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <div className="toolbar-group">
              <button className="btn btn-ghost btn-sm excel-btn" onClick={descargarPlantilla}>📋 Plantilla</button>
              <button className="btn btn-ghost btn-sm excel-btn" onClick={() => fileRef.current.click()}>📥 Importar</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={leerExcel} />
              <button className="btn btn-ghost btn-sm excel-btn" onClick={exportarExcel} disabled={productos.length === 0}>📤 Exportar</button>
            </div>
          </div>

          <div className="card">
            {loading ? (
              <div className="loading">🔄 Cargando productos...</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>CÓDIGO</th><th>PRODUCTO</th><th>CATEGORÍA</th><th>PROVEEDOR</th>
                      <th>PRECIO</th><th>UNIDADES</th><th>STOCK</th><th>ESTADO</th><th>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.length === 0 ? (
                      <tr><td colSpan={9}>
                        <div className="empty-state">
                          <div className="empty-icon">📦</div>
                          <div className="empty-text">{busqueda ? 'No se encontraron productos' : 'Agrega tu primer producto'}</div>
                        </div>
                      </td></tr>
                    ) : filtrados.map((p) => (
                      <tr key={p.id}>
                        <td className="mono" style={{ fontSize: 12, color: 'var(--accent2)' }}>{p.codigo}</td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{p.nombre}</div>
                          {p.ubicacion && <div style={{ fontSize: 11, color: 'var(--muted)' }}>📍 {p.ubicacion}</div>}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.categoria || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.proveedor || '—'}</td>
                        <td>
                          <div className="amount" style={{ fontWeight: 700 }}>${((p.precio || 0) * 1.13).toFixed(2)}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>${(p.precio || 0).toFixed(2)} s/IVA</div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{p.unidad}</div>
                          {(p.unidadesAdicionales || []).length > 0 && (
                            <div className="prod-detail">
                              {p.unidadesAdicionales.map((u, i) => (
                                <span key={i} className="prod-tag">📦 {u.nombre} (x{u.factor})</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={getStockClass(p.stock || 0, p.min || 0)}>
                            {p.stock || 0}
                          </span>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>mín: {p.min || 0}</div>
                        </td>
                        <td>
                          <span className={`status-pill ${p.stock === 0 ? 'agotado' : p.stock < (p.min || 0) ? 'bajo' : 'activo'}`}>
                            <span className="dot"/>
                            {p.stock === 0 ? 'Agotado' : p.stock < (p.min || 0) ? 'Stock bajo' : 'Normal'}
                          </span>
                        </td>
                        <td>
                          <div className="action-btns">
                            <button className="btn btn-kardex btn-sm" onClick={() => cargarKardexProducto(p)} title="Ver Kardex">📋</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setMovModal(p); setMovForm({ tipo: 'entrada', cantidad: '', unidad: p.unidad, motivo: '', referencia: '' }) }} title="Movimiento">⚡</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => abrirModal(p)} title="Editar">✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={() => eliminar(p.id)} title="Eliminar">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════ TAB KARDEX GLOBAL ════ */}
      {tab === 'kardex' && (
        <>
          <div className="kardex-header">
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {kardexModal ? `📋 Kardex — ${kardexModal.nombre}` : '📋 Kardex Global — Todos los movimientos'}
              </div>
              {kardexModal && (
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
                  onClick={() => { setKardexModal(null); setTab('kardex') }}>
                  ← Ver todos los movimientos
                </button>
              )}
            </div>
          </div>

          <div className="kardex-stats">
            <div className="kardex-stat">
              <div className="kardex-stat-val" style={{ color: '#00C296' }}>{totalEntradas.toFixed(0)}</div>
              <div className="kardex-stat-label">Total Entradas</div>
            </div>
            <div className="kardex-stat">
              <div className="kardex-stat-val" style={{ color: '#ef4444' }}>{totalSalidas.toFixed(0)}</div>
              <div className="kardex-stat-label">Total Salidas</div>
            </div>
            <div className="kardex-stat">
              <div className="kardex-stat-val">{kardex.length}</div>
              <div className="kardex-stat-label">Movimientos</div>
            </div>
            <div className="kardex-stat">
              <div className="kardex-stat-val" style={{ color: 'var(--accent2)' }}>
                {kardexModal ? `${kardexModal.stock} ${kardexModal.unidad}` : productos.length}
              </div>
              <div className="kardex-stat-label">{kardexModal ? 'Stock Actual' : 'Productos'}</div>
            </div>
          </div>

          <div className="card">
            {loadingKardex ? (
              <div className="loading">🔄 Cargando movimientos...</div>
            ) : kardex.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <div className="empty-text">No hay movimientos registrados aún</div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>FECHA</th>
                      {!kardexModal && <th>PRODUCTO</th>}
                      <th>TIPO</th>
                      <th>CANT.</th>
                      <th>UNIDAD</th>
                      <th>STOCK ANTES</th>
                      <th>STOCK DESPUÉS</th>
                      <th>MOTIVO</th>
                      <th>REFERENCIA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kardex.map(k => {
                      const mov = TIPOS_MOVIMIENTO.find(m => m.value === k.tipo) || TIPOS_MOVIMIENTO[0]
                      const fecha = k.fecha?.toDate?.() || new Date()
                      return (
                        <tr key={k.id}>
                          <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                            {fecha.toLocaleDateString('es-SV')}<br/>
                            <span style={{ fontSize: 10 }}>{fecha.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}</span>
                          </td>
                          {!kardexModal && (
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{k.productoNombre}</div>
                              <div className="mono" style={{ fontSize: 10, color: 'var(--accent2)' }}>{k.productoCodigo}</div>
                            </td>
                          )}
                          <td>
                            <span className="mov-badge" style={{ background: mov.color + '15', color: mov.color, border: `1px solid ${mov.color}30` }}>
                              {mov.icon} {mov.label}
                            </span>
                          </td>
                          <td className="mono" style={{ fontWeight: 700, color: ['entrada','compra','devolucion'].includes(k.tipo) ? '#00C296' : '#ef4444' }}>
                            {['entrada','compra','devolucion'].includes(k.tipo) ? '+' : k.tipo === 'ajuste' ? '=' : '-'}{k.cantidad}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>{k.unidad}</td>
                          <td className="mono" style={{ color: 'var(--muted)', fontSize: 13 }}>{k.stockAntes}</td>
                          <td className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{k.stockDespues}</td>
                          <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.motivo || '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--accent2)', fontFamily: 'var(--mono)' }}>{k.referencia || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── MODAL KARDEX PRODUCTO (desde tabla) ── */}
      {kardexModal && tab === 'inventario' && (
        <div className="modal-overlay" onClick={() => setKardexModal(null)}>
          <div className="modal modal-xl2" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div className="modal-title" style={{ marginBottom: 2 }}>📋 Kardex — {kardexModal.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Código: <span className="mono">{kardexModal.codigo}</span> · Stock actual: <strong>{kardexModal.stock} {kardexModal.unidad}</strong>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setKardexModal(null)}>✕</button>
            </div>

            <div className="kardex-stats">
              <div className="kardex-stat">
                <div className="kardex-stat-val" style={{ color: '#00C296' }}>
                  {kardex.filter(k => ['entrada','compra','devolucion'].includes(k.tipo)).reduce((s, k) => s + (k.cantidad || 0), 0)}
                </div>
                <div className="kardex-stat-label">Entradas</div>
              </div>
              <div className="kardex-stat">
                <div className="kardex-stat-val" style={{ color: '#ef4444' }}>
                  {kardex.filter(k => ['salida','venta'].includes(k.tipo)).reduce((s, k) => s + (k.cantidad || 0), 0)}
                </div>
                <div className="kardex-stat-label">Salidas</div>
              </div>
              <div className="kardex-stat">
                <div className="kardex-stat-val">{kardex.length}</div>
                <div className="kardex-stat-label">Movimientos</div>
              </div>
              <div className="kardex-stat">
                <div className="kardex-stat-val" style={{ color: 'var(--accent)' }}>{kardexModal.stock} {kardexModal.unidad}</div>
                <div className="kardex-stat-label">Stock Actual</div>
              </div>
            </div>

            {loadingKardex ? (
              <div className="loading">🔄 Cargando...</div>
            ) : kardex.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">📋</div><div className="empty-text">Sin movimientos registrados</div></div>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr><th>FECHA</th><th>TIPO</th><th>CANT.</th><th>UNIDAD</th><th>ANTES</th><th>DESPUÉS</th><th>MOTIVO</th><th>REF.</th></tr>
                  </thead>
                  <tbody>
                    {kardex.map(k => {
                      const mov = TIPOS_MOVIMIENTO.find(m => m.value === k.tipo) || TIPOS_MOVIMIENTO[0]
                      const fecha = k.fecha?.toDate?.() || new Date()
                      return (
                        <tr key={k.id}>
                          <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {fecha.toLocaleDateString('es-SV')} {fecha.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>
                            <span className="mov-badge" style={{ background: mov.color + '15', color: mov.color, border: `1px solid ${mov.color}30`, fontSize: 10 }}>
                              {mov.icon} {mov.label}
                            </span>
                          </td>
                          <td className="mono" style={{ fontWeight: 700, color: ['entrada','compra','devolucion'].includes(k.tipo) ? '#00C296' : '#ef4444' }}>
                            {['entrada','compra','devolucion'].includes(k.tipo) ? '+' : k.tipo === 'ajuste' ? '=' : '-'}{k.cantidad}
                          </td>
                          <td style={{ fontSize: 11 }}>{k.unidad}</td>
                          <td className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{k.stockAntes}</td>
                          <td className="mono" style={{ fontWeight: 700, fontSize: 12 }}>{k.stockDespues}</td>
                          <td style={{ fontSize: 11, color: 'var(--muted)' }}>{k.motivo || '—'}</td>
                          <td style={{ fontSize: 10, color: 'var(--accent2)', fontFamily: 'var(--mono)' }}>{k.referencia || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setKardexModal(null)}>Cerrar</button>
              <button className="btn btn-primary" onClick={() => { setKardexModal(null); setMovModal(kardexModal); setMovForm({ tipo: 'entrada', cantidad: '', unidad: kardexModal.unidad, motivo: '', referencia: '' }) }}>
                ⚡ Registrar Movimiento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL MOVIMIENTO MANUAL ── */}
      {movModal && (
        <div className="modal-overlay" onClick={() => setMovModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">⚡ Registrar Movimiento</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
              <strong style={{ color: 'var(--text)' }}>{movModal.nombre}</strong> · Stock actual: <strong>{movModal.stock} {movModal.unidad}</strong>
            </div>

            {/* Tipo de movimiento */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Tipo de Movimiento</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {TIPOS_MOVIMIENTO.filter(m => m.value !== 'venta' && m.value !== 'compra').map(m => (
                  <div key={m.value}
                    onClick={() => setMovForm(f => ({ ...f, tipo: m.value }))}
                    style={{
                      padding: '10px 8px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
                      border: `1.5px solid ${movForm.tipo === m.value ? m.color : 'var(--border)'}`,
                      background: movForm.tipo === m.value ? m.color + '15' : 'var(--surface2)',
                      color: movForm.tipo === m.value ? m.color : 'var(--muted)',
                      fontSize: 12, fontWeight: 600, transition: 'all 0.15s'
                    }}>
                    {m.icon} {m.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">
                  {movForm.tipo === 'ajuste' ? 'Nuevo Stock Total' : 'Cantidad'}
                </label>
                <input className="input" type="number" min="0" step="0.01"
                  placeholder={movForm.tipo === 'ajuste' ? 'Cantidad total real' : 'Cantidad a mover'}
                  value={movForm.cantidad}
                  onChange={e => setMovForm(f => ({ ...f, cantidad: e.target.value }))}/>
              </div>
              <div className="form-group">
                <label className="form-label">Unidad</label>
                <select className="input" value={movForm.unidad}
                  onChange={e => setMovForm(f => ({ ...f, unidad: e.target.value }))}>
                  <option value={movModal.unidad}>{movModal.unidad} (principal)</option>
                  {(movModal.unidadesAdicionales || []).map((u, i) => (
                    <option key={i} value={u.nombre}>{u.nombre} (x{u.factor} {movModal.unidad})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Motivo</label>
              <input className="input" placeholder="Ej: Compra proveedor, Venta directa, Merma, Conteo físico..."
                value={movForm.motivo}
                onChange={e => setMovForm(f => ({ ...f, motivo: e.target.value }))}/>
            </div>

            <div className="form-group">
              <label className="form-label">Referencia (No. documento)</label>
              <input className="input" placeholder="Ej: OC-00001, FE-000023..."
                value={movForm.referencia}
                onChange={e => setMovForm(f => ({ ...f, referencia: e.target.value }))}/>
            </div>

            {/* Preview del resultado */}
            {movForm.cantidad && (
              <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginTop: 8, fontSize: 13 }}>
                <div style={{ color: 'var(--muted)', marginBottom: 6 }}>Vista previa del resultado:</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Stock actual: <strong>{movModal.stock}</strong></span>
                  <span style={{ fontSize: 18 }}>→</span>
                  <span>Nuevo stock: <strong style={{ color: 'var(--accent)', fontSize: 16 }}>
                    {movForm.tipo === 'ajuste'
                      ? parseFloat(movForm.cantidad) || 0
                      : ['entrada','devolucion'].includes(movForm.tipo)
                        ? (movModal.stock || 0) + (parseFloat(movForm.cantidad) || 0)
                        : Math.max(0, (movModal.stock || 0) - (parseFloat(movForm.cantidad) || 0))
                    } {movModal.unidad}
                  </strong></span>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setMovModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={registrarMovimiento} disabled={!movForm.cantidad}>
                ⚡ Registrar Movimiento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL PRODUCTO ── */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editando ? '✏️ Editar Producto' : '📦 Nuevo Producto'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              <div className="section-divider">INFORMACIÓN BÁSICA</div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">CÓDIGO <span className="required-label">*</span></label>
                  <input className="input" placeholder="P001" value={f.codigo} onChange={e => setForm({ ...f, codigo: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">CATEGORÍA</label>
                  <input className="input" placeholder="Eléctrico, Construcción..." value={f.categoria} onChange={e => setForm({ ...f, categoria: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">NOMBRE <span className="required-label">*</span></label>
                <input className="input" placeholder="Nombre del producto" value={f.nombre} onChange={e => setForm({ ...f, nombre: e.target.value })} />
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">PRECIO (sin IVA) <span className="required-label">*</span></label>
                  <input className="input" type="number" step="0.01" placeholder="0.00" value={f.precio} onChange={e => setForm({ ...f, precio: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">DESCUENTO (%)</label>
                  <input className="input" type="number" min="0" max="100" placeholder="0" value={f.descuento} onChange={e => setForm({ ...f, descuento: e.target.value })} />
                </div>
              </div>

              {f.precio && (
                <div className="iva-hint">
                  💡 Precio con IVA: <strong style={{ color: 'var(--accent)' }}>${precioFinal(f.precio, f.descuento).toFixed(2)}</strong>
                </div>
              )}

              <div className="section-divider">UNIDADES DE MEDIDA</div>

              {/* Unidad principal */}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">UNIDAD PRINCIPAL <span className="required-label">*</span></label>
                  <select className="input" value={f.unidad} onChange={e => setForm({ ...f, unidad: e.target.value })}>
                    {['General','Empaque','Longitud','Peso','Volumen'].map(grupo => (
                      <optgroup key={grupo} label={grupo}>
                        {UNIDADES_SISTEMA.filter(u => u.grupo === grupo).map(u => (
                          <option key={u.nombre} value={u.nombre}>{u.nombre}</option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="Otra">Otra (personalizada)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">STOCK <span className="required-label">*</span></label>
                  <input className="input" type="number" placeholder="0" value={f.stock} onChange={e => setForm({ ...f, stock: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">STOCK MÍNIMO <span className="required-label">*</span></label>
                <input className="input" type="number" placeholder="0" value={f.min} onChange={e => setForm({ ...f, min: e.target.value })} />
              </div>

              {/* Unidades adicionales */}
              <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>
                    📦 Unidades Adicionales
                    <span className="tag-opcional">OPCIONAL</span>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={agregarUnidadAdicional}>+ Agregar</button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                  Ej: Si la unidad principal es Metro, agrega Rollo = 100 metros
                </div>
                {(f.unidadesAdicionales || []).length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>
                    Sin unidades adicionales
                  </div>
                )}
                {(f.unidadesAdicionales || []).map((u, idx) => (
                  <div key={idx} className="unidad-adicional-row">
                    <div style={{ flex: 2 }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Nombre</div>
                      <input className="input" style={{ height: 34, fontSize: 13 }}
                        placeholder="Ej: Rollo, Caja, Quintal..."
                        value={u.nombre}
                        onChange={e => actualizarUnidadAdicional(idx, 'nombre', e.target.value)}/>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Factor (equivale a)</div>
                      <input className="input" type="number" style={{ height: 34, fontSize: 13 }}
                        placeholder="100"
                        value={u.factor}
                        onChange={e => actualizarUnidadAdicional(idx, 'factor', parseFloat(e.target.value) || 1)}/>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Precio s/IVA</div>
                      <input className="input" type="number" step="0.01" style={{ height: 34, fontSize: 13 }}
                        placeholder="0.00"
                        value={u.precio}
                        onChange={e => actualizarUnidadAdicional(idx, 'precio', e.target.value)}/>
                    </div>
                    <button className="btn btn-danger btn-sm" style={{ height: 34, alignSelf: 'flex-end' }}
                      onClick={() => quitarUnidadAdicional(idx)}>✕</button>
                  </div>
                ))}
              </div>

              <div className="section-divider">INFORMACIÓN ADICIONAL <span className="tag-opcional">OPCIONAL</span></div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">PROVEEDOR</label>
                  <input className="input" placeholder="Nombre del proveedor" value={f.proveedor} onChange={e => setForm({ ...f, proveedor: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">CÓDIGO DE BARRAS</label>
                  <input className="input" placeholder="7500000001234" value={f.codigoBarras} onChange={e => setForm({ ...f, codigoBarras: e.target.value })} />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">UBICACIÓN EN BODEGA</label>
                  <input className="input" placeholder="Estante A-1, Bodega 2..." value={f.ubicacion} onChange={e => setForm({ ...f, ubicacion: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">FECHA DE VENCIMIENTO</label>
                  <input className="input" type="date" value={f.fechaVencimiento} onChange={e => setForm({ ...f, fechaVencimiento: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">URL DE IMAGEN</label>
                <input className="input" placeholder="https://..." value={f.imagen} onChange={e => setForm({ ...f, imagen: e.target.value })} />
              </div>

              {f.imagen && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src={f.imagen} alt="preview" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} onError={e => e.target.style.display = 'none'} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Vista previa de imagen</span>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando || !f.codigo || !f.nombre || !f.precio || !f.stock}>
                {guardando ? '⏳ Guardando...' : '💾 Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL IMPORTAR ── */}
      {importModalOpen && (
        <div className="modal-overlay" onClick={() => { setImportModalOpen(false); setImportData([]) }}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">📥 Importar desde Excel</div>
            <div className="import-stats">
              <div className="import-stat total">📄 {importData.length} filas leídas</div>
              <div className="import-stat ok">✅ {totalOk} válidas</div>
              {totalErr > 0 && <div className="import-stat err">❌ {totalErr} con errores</div>}
            </div>
            <div className="import-preview">
              <table>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 12px', fontSize: 10 }}>FILA</th>
                    <th style={{ padding: '8px 12px', fontSize: 10 }}>CÓDIGO</th>
                    <th style={{ padding: '8px 12px', fontSize: 10 }}>NOMBRE</th>
                    <th style={{ padding: '8px 12px', fontSize: 10 }}>PRECIO</th>
                    <th style={{ padding: '8px 12px', fontSize: 10 }}>STOCK</th>
                    <th style={{ padding: '8px 12px', fontSize: 10 }}>UNIDAD</th>
                    <th style={{ padding: '8px 12px', fontSize: 10 }}>ESTADO</th>
                  </tr>
                </thead>
                <tbody>
                  {importData.map((row, i) => (
                    <tr key={i} className={row._ok ? 'import-row-ok' : 'import-row-err'}>
                      <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--muted)' }}>{row._fila}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)' }}>{row.codigo}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12 }}>{row.nombre}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)' }}>${row.precio?.toFixed(2)}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)' }}>{row.stock}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12 }}>{row.unidad}</td>
                      <td style={{ padding: '7px 12px', fontSize: 11 }}>
                        {row._ok
                          ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>✅ OK</span>
                          : <span style={{ color: 'var(--danger)', fontWeight: 600 }}>❌ {row._errores.join(', ')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { setImportModalOpen(false); setImportData([]) }}>Cancelar</button>
              <button className="btn btn-primary" onClick={importarProductos} disabled={totalOk === 0 || importando}>
                {importando ? '⏳ Importando...' : `📥 Importar ${totalOk} productos`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
