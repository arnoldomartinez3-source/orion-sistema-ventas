import { useEffect, useRef, useState } from 'react'
import { db } from '../firebase'
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { orionAlert } from '../orionDialog'
import { sucursalActivaId } from '../utils/sucursal'
import { generarCodigoInterno, buscarEnBasePublica } from '../utils/productoNuevo'

// ══════════════════════════════════════════════════════════════════
// PRODUCTO NUEVO DESDE LA CAJA
// El lector leyó un código de barras que no está en el inventario. En vez de
// no hacer nada, la caja pide los datos del producto (nombre, precio con IVA,
// categoría, unidad, existencias), lo crea en Inventario con ESE código de
// barras y lo agrega a la venta. El nombre se propone desde la base pública
// (Open Food Facts) cuando el código está ahí; siempre se puede corregir.
// Solo para productos con código de barras: se abre únicamente al escanear.
// ══════════════════════════════════════════════════════════════════

const IVA = 0.13
const UNIDADES = ['Unidad', 'Libra', 'Litro', 'Kilo', 'Paquete', 'Bolsa', 'Caja', 'Docena', 'Botella', 'Lata']

export default function ModalProductoNuevo({ codigoBarras, productos, empresaId, userName, venderSinStock, onCreado, onCerrar }) {
  const [form, setForm] = useState({ nombre: '', precioConIva: '', categoria: '', unidad: 'Unidad', stock: '' })
  const [sugerencia, setSugerencia] = useState(null)
  const [buscando, setBuscando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mayusculas, setMayusculas] = useState(true)
  const nombreRef = useRef(null)
  const precioRef = useRef(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const normNombre = (s) => { const t = String(s || '').trim().replace(/\s+/g, ' '); return mayusculas ? t.toUpperCase() : t }

  // Nombres en MAYÚSCULAS: preferencia por empresa (Configuración → Productos). Default: sí.
  useEffect(() => {
    if (!empresaId) return
    getDoc(doc(db, 'configuracion', empresaId)).then(s => setMayusculas(s.data()?.productosMayusculas !== false)).catch(() => {})
  }, [empresaId])

  // Propuesta de nombre desde la base pública; mientras llega, el cajero ya puede escribir
  useEffect(() => {
    let vivo = true
    nombreRef.current?.focus()
    buscarEnBasePublica(codigoBarras).then(s => {
      if (!vivo) return
      setBuscando(false)
      if (!s) return
      setSugerencia(s)
      // Si el cajero aún no escribió nada, se propone el nombre y lo siguiente es el precio
      if (!nombreRef.current?.value.trim()) setTimeout(() => precioRef.current?.focus(), 30)
      setForm(f => (f.nombre.trim() ? f : { ...f, nombre: s.nombre }))
    })
    return () => { vivo = false }
  }, [codigoBarras])

  const categorias = [...new Set(productos.map(p => (p.categoria || '').trim()).filter(Boolean))].sort()
  const precioNum = parseFloat(form.precioConIva)

  const guardar = async () => {
    if (guardando) return
    const nombre = normNombre(form.nombre)
    const stock = Math.round((parseFloat(form.stock) || 0) * 1000) / 1000
    if (!nombre) { await orionAlert('Escribe el nombre del producto, con marca y tamaño.', { tipo: 'warning' }); nombreRef.current?.focus(); return }
    if (!(precioNum > 0)) { await orionAlert('Escribe el precio de venta (con IVA).', { tipo: 'warning' }); precioRef.current?.focus(); return }
    if (stock < 0) { await orionAlert('Las existencias no pueden ser negativas.', { tipo: 'warning' }); return }
    if (!venderSinStock && stock < 1) { await orionAlert('Escribe cuántos hay en existencia (al menos 1) para poder venderlo.', { tipo: 'warning' }); return }
    const repetido = productos.find(p => (p.nombre || '').trim().toLowerCase() === nombre.toLowerCase())
    if (repetido) { await orionAlert(`Ya existe un producto llamado "${repetido.nombre}". Si es el mismo, agrégale el código de barras desde Inventario; si es otro tamaño o sabor, escríbelo en el nombre.`, { tipo: 'warning' }); return }
    setGuardando(true)
    try {
      const codigo = generarCodigoInterno(productos)
      const data = {
        codigo, nombre, categoria: form.categoria.trim(), precio: Math.round((precioNum / (1 + IVA)) * 10000) / 10000,
        stock, min: 0, unidad: form.unidad.trim() || 'Unidad', unidadesAdicionales: [], codigoBarras,
        ...(sugerencia?.imagen && { imagen: sugerencia.imagen }),
        ...(sugerencia?.marca && { marca: sugerencia.marca }),
        origen: 'caja', creadoPor: userName || '', // para poder revisar en Inventario lo que se cargó desde la caja
        empresaId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }
      const ref = await addDoc(collection(db, 'productos'), data)
      if (stock > 0) {
        await addDoc(collection(db, 'kardex'), {
          productoId: ref.id, productoCodigo: codigo, productoNombre: nombre,
          tipo: 'entrada', cantidad: stock, unidad: data.unidad, stockAntes: 0, stockDespues: stock,
          motivo: 'Producto nuevo desde la caja (stock inicial)', referencia: userName || '',
          sucursalId: sucursalActivaId(), empresaId, fecha: serverTimestamp(),
        })
      }
      onCreado({ id: ref.id, ...data })
    } catch (e) {
      setGuardando(false)
      orionAlert('No se pudo guardar el producto: ' + e.message, { tipo: 'error' })
    }
  }

  // stopPropagation: los atajos de la caja (F9, Esc, flechas…) no deben actuar mientras se llena esta ventana
  const teclas = (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); if (!guardando) onCerrar() }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); guardar() }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 600 }} onClick={e => e.stopPropagation()} onKeyDown={teclas}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ marginBottom: 8 }}>🆕 Producto nuevo</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.45 }}>
          El código <strong style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{codigoBarras}</strong> no está en el inventario.
          Completa los datos y entra a la venta.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Nombre (marca, sabor y tamaño) *</label>
            <input ref={nombreRef} className="input" placeholder="Ej.: FANTA NARANJA 1.25 LT" value={form.nombre}
              style={{ textTransform: mayusculas ? 'uppercase' : 'none' }} onChange={e => set('nombre', e.target.value)} />
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              {buscando ? 'Buscando el nombre por el código…'
                : sugerencia ? <>Nombre propuesto por la base pública{sugerencia.parcial ? ' (incompleto)' : ''}: revísalo y corrígelo si hace falta.</>
                : 'No se encontró en la base pública: escríbelo como aparece en el empaque.'}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Precio con IVA *</label>
              <input ref={precioRef} className="input" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
                value={form.precioConIva} onChange={e => set('precioConIva', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Existencias {venderSinStock ? '' : '*'}</label>
              <input className="input" type="number" min="0" step="any" inputMode="decimal" placeholder="¿Cuántos hay?"
                value={form.stock} onChange={e => set('stock', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Categoría</label>
              <input className="input" list="cat-producto-nuevo" placeholder="Elige o escribe" value={form.categoria} onChange={e => set('categoria', e.target.value)} />
              <datalist id="cat-producto-nuevo">{categorias.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Unidad</label>
              <input className="input" list="uni-producto-nuevo" value={form.unidad} onChange={e => set('unidad', e.target.value)} />
              <datalist id="uni-producto-nuevo">{UNIDADES.map(u => <option key={u} value={u} />)}</datalist>
            </div>
          </div>
          {precioNum > 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Se guarda a ${(precioNum / (1 + IVA)).toFixed(4)} sin IVA · al público <strong style={{ color: 'var(--text)' }}>${precioNum.toFixed(2)}</strong>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" disabled={guardando} onClick={onCerrar}>Ahora no</button>
          <button className="btn btn-primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar y agregar a la venta'}</button>
        </div>
      </div>
    </div>
  )
}
