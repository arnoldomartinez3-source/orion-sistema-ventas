import { useState, useEffect, useRef } from 'react'
import { db } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, writeBatch
} from 'firebase/firestore'
import * as XLSX from 'xlsx'

const IVA = 0.13

const invStyles = `
  .inv-toolbar { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; align-items: center; }
  .inv-toolbar .input { max-width: 300px; }
  .stock-ok { color: var(--accent); font-weight: 600; font-family: var(--mono); }
  .stock-low { color: var(--accent3); font-weight: 600; font-family: var(--mono); }
  .stock-critical { color: var(--danger); font-weight: 600; font-family: var(--mono); }
  .action-btns { display: flex; gap: 6px; }
  .btn-sm { padding: 5px 10px; font-size: 11px; }
  .loading { text-align: center; padding: 40px; color: var(--muted); font-size: 14px; }
  .firebase-badge { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,160,0,0.12); color: #ffa000; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 6px; font-family: var(--mono); }
  .toolbar-group { display: flex; gap: 8px; align-items: center; margin-left: auto; flex-wrap: wrap; }
  .excel-btn { display: inline-flex; align-items: center; gap: 6px; }
  .optional-label { font-size: 10px; color: var(--muted); font-weight: 400; margin-left: 4px; }
  .required-label { font-size: 10px; color: var(--danger); font-weight: 600; margin-left: 2px; }
  .section-divider { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 1px; padding: 4px 0; border-bottom: 1px solid var(--border); margin-bottom: 4px; margin-top: 8px; }
  .iva-hint { background: rgba(0,212,170,0.08); border: 1px solid rgba(0,212,170,0.2); border-radius: 10px; padding: 10px 14px; font-size: 13px; }
  .descuento-hint { background: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.2); border-radius: 10px; padding: 10px 14px; font-size: 13px; }
  .campo-extra { display: flex; flex-direction: column; gap: 4px; }
  .tag-opcional { display: inline-block; background: var(--surface2); border: 1px solid var(--border); color: var(--muted); font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 4px; margin-left: 4px; letter-spacing: 0.5px; }

  /* Modal grande para formulario extendido */
  .modal-lg { max-width: 620px !important; max-height: 88vh; overflow-y: auto; }

  /* Vista detalle producto */
  .prod-detail { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .prod-tag { display: inline-flex; align-items: center; gap: 4px; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; font-size: 11px; color: var(--muted); }

  /* Import */
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
`

const COLUMNAS_EXCEL = ['codigo', 'nombre', 'categoria', 'precio', 'stock', 'min', 'unidad', 'proveedor', 'codigoBarras', 'ubicacion', 'descuento', 'fechaVencimiento', 'imagen']

function getStockClass(stock, min) {
  if (stock === 0) return 'stock-critical'
  if (stock < min * 0.4) return 'stock-critical'
  if (stock < min) return 'stock-low'
  return 'stock-ok'
}

function getStockLabel(stock, min) {
  if (stock === 0) return 'agotado'
  if (stock < min) return 'bajo'
  return 'activo'
}

const emptyForm = {
  // Obligatorios
  codigo: '', nombre: '', precio: '', stock: '', min: '', unidad: 'Unidad',
  // Opcionales
  categoria: '',
  proveedor: '',
  codigoBarras: '',
  ubicacion: '',
  descuento: '',
  fechaVencimiento: '',
  imagen: '',
}

const precioFinal = (precio, descuento) => {
  const p = parseFloat(precio) || 0
  const d = parseFloat(descuento) || 0
  const conDesc = p * (1 - d / 100)
  return conDesc * (1 + IVA)
}

export default function Inventario() {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [guardando, setGuardando] = useState(false)
  const [importData, setImportData] = useState([])
  const [importando, setImportando] = useState(false)
  const [verDetalle, setVerDetalle] = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'productos'), (snap) => {
      setProductos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [])

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
    const data = {
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim(),
      precio: parseFloat(form.precio) || 0,
      stock: parseInt(form.stock) || 0,
      min: parseInt(form.min) || 0,
      unidad: form.unidad || 'Unidad',
      // Opcionales — solo se guardan si tienen valor
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
      } else {
        await addDoc(collection(db, 'productos'), { ...data, createdAt: serverTimestamp() })
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
    catch (e) { alert('Error al eliminar: ' + e.message) }
  }

  // ── EXPORTAR ──
  const exportarExcel = () => {
    const datos = productos.map(p => ({
      codigo: p.codigo || '',
      nombre: p.nombre || '',
      categoria: p.categoria || '',
      precio: p.precio || 0,
      stock: p.stock || 0,
      min: p.min || 0,
      unidad: p.unidad || '',
      proveedor: p.proveedor || '',
      codigoBarras: p.codigoBarras || '',
      ubicacion: p.ubicacion || '',
      descuento: p.descuento || 0,
      fechaVencimiento: p.fechaVencimiento || '',
      imagen: p.imagen || '',
    }))
    const ws = XLSX.utils.json_to_sheet(datos, { header: COLUMNAS_EXCEL })
    ws['!cols'] = [
      { wch: 12 }, { wch: 35 }, { wch: 18 }, { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 16 }, { wch: 20 },
      { wch: 12 }, { wch: 18 }, { wch: 40 }
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
    XLSX.writeFile(wb, `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const descargarPlantilla = () => {
    const ejemplo = [
      { codigo: 'P001', nombre: 'Papel Bond A4 (Resma)', categoria: 'Papelería', precio: 4.50, stock: 100, min: 10, unidad: 'Resma', proveedor: 'Papelera Nacional', codigoBarras: '7500000001', ubicacion: 'Estante A-1', descuento: 0, fechaVencimiento: '', imagen: '' },
      { codigo: 'P002', nombre: 'Lapicero BIC Azul', categoria: 'Papelería', precio: 0.35, stock: 200, min: 50, unidad: 'Unidad', proveedor: 'Distribuidora ABC', codigoBarras: '7500000002', ubicacion: 'Estante B-3', descuento: 5, fechaVencimiento: '', imagen: '' },
    ]
    const ws = XLSX.utils.json_to_sheet(ejemplo, { header: COLUMNAS_EXCEL })
    ws['!cols'] = [
      { wch: 12 }, { wch: 35 }, { wch: 18 }, { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 16 }, { wch: 20 },
      { wch: 12 }, { wch: 18 }, { wch: 40 }
    ]
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
        const stock = parseInt(row.stock || 0)
        const errores = []
        if (!codigo) errores.push('Falta código')
        if (!nombre) errores.push('Falta nombre')
        if (isNaN(precio) || precio < 0) errores.push('Precio inválido')
        return {
          _fila: i + 2,
          codigo, nombre,
          categoria: String(row.categoria || '').trim(),
          precio, stock,
          min: parseInt(row.min || 0),
          unidad: String(row.unidad || 'Unidad').trim(),
          proveedor: String(row.proveedor || '').trim(),
          codigoBarras: String(row.codigoBarras || '').trim(),
          ubicacion: String(row.ubicacion || '').trim(),
          descuento: parseFloat(row.descuento || 0),
          fechaVencimiento: String(row.fechaVencimiento || '').trim(),
          imagen: String(row.imagen || '').trim(),
          _errores: errores,
          _ok: errores.length === 0
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
          const data = {
            codigo: p.codigo, nombre: p.nombre, categoria: p.categoria,
            precio: p.precio, stock: p.stock, min: p.min, unidad: p.unidad,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp()
          }
          if (p.proveedor) data.proveedor = p.proveedor
          if (p.codigoBarras) data.codigoBarras = p.codigoBarras
          if (p.ubicacion) data.ubicacion = p.ubicacion
          if (p.descuento) data.descuento = p.descuento
          if (p.fechaVencimiento) data.fechaVencimiento = p.fechaVencimiento
          if (p.imagen) data.imagen = p.imagen
          batch.set(ref, data)
        })
        await batch.commit()
      }
      setImportModalOpen(false)
      setImportData([])
      alert(`✅ ${validos.length} productos importados correctamente`)
    } catch (e) {
      alert('Error al importar: ' + e.message)
    }
    setImportando(false)
  }

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

      <div className="inv-toolbar">
        <input className="input" placeholder="🔍 Buscar por nombre, código, categoría o proveedor..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <div className="toolbar-group">
          <button className="btn btn-ghost btn-sm excel-btn" onClick={descargarPlantilla}>📋 Plantilla</button>
          <button className="btn btn-ghost btn-sm excel-btn" onClick={() => fileRef.current.click()}>📥 Importar Excel</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={leerExcel} />
          <button className="btn btn-ghost btn-sm excel-btn" onClick={exportarExcel} disabled={productos.length === 0}>📤 Exportar Excel</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">🔄 Cargando productos desde Firebase...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CÓDIGO</th><th>PRODUCTO</th><th>CATEGORÍA</th><th>PROVEEDOR</th>
                  <th>PRECIO</th><th>DESCUENTO</th><th>STOCK</th><th>ESTADO</th><th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr><td colSpan={9}>
                    <div className="empty-state">
                      <div className="empty-icon">📦</div>
                      <div className="empty-text">{busqueda ? 'No se encontraron productos' : 'Agrega tu primer producto o importa desde Excel'}</div>
                    </div>
                  </td></tr>
                ) : filtrados.map((p) => (
                  <tr key={p.id}>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--accent2)' }}>{p.codigo}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{p.nombre}</div>
                      {(p.codigoBarras || p.ubicacion) && (
                        <div className="prod-detail">
                          {p.codigoBarras && <span className="prod-tag">🔲 {p.codigoBarras}</span>}
                          {p.ubicacion && <span className="prod-tag">📍 {p.ubicacion}</span>}
                          {p.fechaVencimiento && <span className="prod-tag">📅 {p.fechaVencimiento}</span>}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{p.categoria || '—'}</td>
                    <td style={{ fontSize: 12 }}>{p.proveedor || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td>
                      <div className="amount">${p.precio?.toFixed(2)}</div>
                      <div style={{ fontSize: 11, color: 'var(--accent)' }}>${(p.precio * (1 + IVA)).toFixed(2)} c/IVA</div>
                    </td>
                    <td style={{ color: p.descuento > 0 ? 'var(--accent3)' : 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 13 }}>
                      {p.descuento > 0 ? `${p.descuento}%` : '—'}
                    </td>
                    <td className={getStockClass(p.stock, p.min)}>{p.stock} {p.unidad}</td>
                    <td>
                      <span className={`status-pill ${getStockLabel(p.stock, p.min)}`}>
                        <span className="dot" />
                        {getStockLabel(p.stock, p.min).charAt(0).toUpperCase() + getStockLabel(p.stock, p.min).slice(1)}
                      </span>
                    </td>
                    <td>
                      <div className="action-btns">
                        <button className="btn btn-ghost btn-sm" onClick={() => abrirModal(p)}>✏️</button>
                        <button className="btn btn-danger btn-sm" onClick={() => eliminar(p.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL PRODUCTO ── */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editando ? '✏️ Editar Producto' : '+ Nuevo Producto'}</div>

            {/* ── CAMPOS OBLIGATORIOS ── */}
            <div className="section-divider">INFORMACIÓN BÁSICA <span style={{ color: 'var(--danger)' }}>* obligatorio</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">CÓDIGO <span className="required-label">*</span></label>
                  <input className="input" placeholder="P001" value={f.codigo} onChange={e => setForm({ ...f, codigo: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">CATEGORÍA <span className="tag-opcional">OPCIONAL</span></label>
                  <input className="input" placeholder="Papelería, Tecnología..." value={f.categoria} onChange={e => setForm({ ...f, categoria: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">NOMBRE DEL PRODUCTO <span className="required-label">*</span></label>
                <input className="input" placeholder="Nombre completo del producto" value={f.nombre} onChange={e => setForm({ ...f, nombre: e.target.value })} />
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">PRECIO SIN IVA ($) <span className="required-label">*</span></label>
                  <input className="input" type="number" step="0.01" placeholder="0.00" value={f.precio} onChange={e => setForm({ ...f, precio: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">UNIDAD <span className="required-label">*</span></label>
                  <select className="input" value={f.unidad} onChange={e => setForm({ ...f, unidad: e.target.value })}>
                    <option>Unidad</option>
                    <option>Caja</option>
                    <option>Resma</option>
                    <option>Paquete</option>
                    <option>Litro</option>
                    <option>Kilogramo</option>
                    <option>Metro</option>
                    <option>Par</option>
                  </select>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">STOCK ACTUAL <span className="required-label">*</span></label>
                  <input className="input" type="number" placeholder="0" value={f.stock} onChange={e => setForm({ ...f, stock: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">STOCK MÍNIMO <span className="required-label">*</span></label>
                  <input className="input" type="number" placeholder="0" value={f.min} onChange={e => setForm({ ...f, min: e.target.value })} />
                </div>
              </div>

              {/* Preview precio con IVA y descuento */}
              {f.precio && (
                <div className="iva-hint">
                  {f.descuento > 0
                    ? <>💡 Con descuento {f.descuento}%: <strong style={{ color: 'var(--accent3)' }}>${(parseFloat(f.precio) * (1 - parseFloat(f.descuento) / 100)).toFixed(2)}</strong> → con IVA: <strong style={{ color: 'var(--accent)' }}>${precioFinal(f.precio, f.descuento).toFixed(2)}</strong></>
                    : <>💡 Precio con IVA (13%): <strong style={{ color: 'var(--accent)' }}>${(parseFloat(f.precio) * 1.13).toFixed(2)}</strong></>
                  }
                </div>
              )}

              {/* ── CAMPOS OPCIONALES ── */}
              <div className="section-divider" style={{ marginTop: 8 }}>INFORMACIÓN ADICIONAL <span className="tag-opcional">OPCIONAL</span></div>

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
                  <label className="form-label">DESCUENTO (%)</label>
                  <input className="input" type="number" min="0" max="100" placeholder="0" value={f.descuento} onChange={e => setForm({ ...f, descuento: e.target.value })} />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">FECHA DE VENCIMIENTO</label>
                  <input className="input" type="date" value={f.fechaVencimiento} onChange={e => setForm({ ...f, fechaVencimiento: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">URL DE IMAGEN</label>
                  <input className="input" placeholder="https://..." value={f.imagen} onChange={e => setForm({ ...f, imagen: e.target.value })} />
                </div>
              </div>

              {/* Preview imagen */}
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
                    <th style={{ padding: '8px 12px', fontSize: 10 }}>PROVEEDOR</th>
                    <th style={{ padding: '8px 12px', fontSize: 10 }}>ESTADO</th>
                  </tr>
                </thead>
                <tbody>
                  {importData.map((row, i) => (
                    <tr key={i} className={row._ok ? 'import-row-ok' : 'import-row-err'}>
                      <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--muted)' }}>{row._fila}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)' }}>{row.codigo}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12 }}>{row.nombre || <span style={{ color: 'var(--danger)' }}>—</span>}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)' }}>${row.precio?.toFixed(2)}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)' }}>{row.stock}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--muted)' }}>{row.proveedor || '—'}</td>
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
            {totalErr > 0 && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.2)', borderRadius: 10, fontSize: 12, color: 'var(--danger)' }}>
                ⚠️ Las filas con errores no se importarán. Corrígelas en el archivo Excel y vuelve a importar.
              </div>
            )}
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