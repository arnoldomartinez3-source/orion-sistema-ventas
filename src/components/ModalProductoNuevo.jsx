import { useEffect, useRef, useState } from 'react'
import { db } from '../firebase'
import { collection, addDoc, doc, getDoc, serverTimestamp, onSnapshot, updateDoc } from 'firebase/firestore'
import QRCode from 'qrcode'
import { orionAlert } from '../orionDialog'
import { sucursalActivaId } from '../utils/sucursal'
import { generarCodigoInterno, buscarEnBasePublica } from '../utils/productoNuevo'
import { consultarCatalogo, aportarAlCatalogo } from '../utils/catalogoMaestro'

// ══════════════════════════════════════════════════════════════════
// PRODUCTO NUEVO DESDE LA CAJA
// El lector leyó un código de barras que no está en el inventario. En vez de
// no hacer nada, la caja pide los datos del producto (nombre, precio con IVA,
// categoría, unidad, existencias) y lo crea en Inventario con ESE código de
// barras; se puede agregar a la venta o solo guardarlo (jornada de ingreso sin
// clientes). Se activa por empresa en Configuración → Punto de venta.
//
// De dónde sale el nombre, en este orden:
//   1) Catálogo maestro de One Geo (nombres ya confirmados por otra tienda).
//   2) Módulo "Foto Captura Inventario": la cajera escanea el QR con el teléfono,
//      toma la foto del frente y la IA llena nombre/marca/tamaño; la foto queda
//      como imagen del producto. (capturas/{id}, página /captura/:id)
//   3) Base pública (Open Food Facts), solo como respaldo: sus nombres vienen
//      mal escritos a menudo.
// Al guardar, el nombre confirmado se aporta al catálogo maestro.
// ══════════════════════════════════════════════════════════════════

const IVA = 0.13
const UNIDADES = ['Unidad', 'Libra', 'Litro', 'Kilo', 'Paquete', 'Bolsa', 'Caja', 'Docena', 'Botella', 'Lata']

export default function ModalProductoNuevo({ codigoBarras, productos, empresaId, userName, venderSinStock, moduloFoto = false, onCreado, onCerrar }) {
  const [form, setForm] = useState({ nombre: '', precioConIva: '', categoria: '', unidad: 'Unidad', stock: '' })
  const [origen, setOrigen] = useState(null) // { tipo: 'catalogo'|'foto'|'publica', nombre, imagen, marca, parcial, advertencia }
  const [buscando, setBuscando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mayusculas, setMayusculas] = useState(true)
  const [captura, setCaptura] = useState(null) // doc capturas/{id} en vivo (módulo foto)
  const [qr, setQr] = useState('')
  // Lo que hace Enter: lo último que se usó (en una jornada de ingreso queda en "solo guardar")
  const [modo] = useState(() => { try { return localStorage.getItem('orion_prod_nuevo_modo') === 'solo' ? 'solo' : 'venta' } catch { return 'venta' } })
  const nombreRef = useRef(null)
  const precioRef = useRef(null)
  const capturaIdRef = useRef(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const normNombre = (s) => { const t = String(s || '').trim().replace(/\s+/g, ' '); return mayusculas ? t.toUpperCase() : t }
  // Propone un nombre solo si el cajero no ha escrito uno distinto a mano
  const proponer = (nombre, datos) => {
    if (!nombre) return
    const escrito = nombreRef.current?.value.trim() || ''
    if (escrito && origen && escrito !== origen.nombre) return
    setOrigen(datos)
    setForm(f => ({ ...f, nombre, ...(datos.categoria && !f.categoria && { categoria: datos.categoria }), ...(datos.unidad && f.unidad === 'Unidad' && { unidad: datos.unidad }) }))
    setTimeout(() => precioRef.current?.focus(), 30)
  }

  // Nombres en MAYÚSCULAS: preferencia por empresa (Configuración → Productos). Default: sí.
  useEffect(() => {
    if (!empresaId) return
    getDoc(doc(db, 'configuracion', empresaId)).then(s => setMayusculas(s.data()?.productosMayusculas !== false)).catch(() => {})
  }, [empresaId])

  // 1) Catálogo maestro; 3) base pública de respaldo. Mientras llegan, el cajero ya puede escribir.
  useEffect(() => {
    let vivo = true
    nombreRef.current?.focus()
    ;(async () => {
      const cat = await consultarCatalogo(codigoBarras)
      if (!vivo) return
      if (cat?.nombre) { setBuscando(false); proponer(cat.nombre, { tipo: 'catalogo', nombre: cat.nombre, imagen: cat.imagen || '', categoria: cat.categoria || '', unidad: cat.unidad || '', revisado: cat.revisado === true }); return }
      const pub = await buscarEnBasePublica(codigoBarras)
      if (!vivo) return
      setBuscando(false)
      if (pub) proponer(pub.nombre, { tipo: 'publica', nombre: pub.nombre, imagen: pub.imagen, marca: pub.marca, parcial: pub.parcial })
    })()
    return () => { vivo = false }
  }, [codigoBarras]) // eslint-disable-line react-hooks/exhaustive-deps

  // 2) Módulo foto: se crea la captura, se muestra el QR y se escucha el doc hasta que llegue la foto y la lectura
  useEffect(() => {
    if (!moduloFoto || !empresaId) return
    let unsub = null, vivo = true
    ;(async () => {
      try {
        const ref = await addDoc(collection(db, 'capturas'), { empresaId, codigoBarras, estado: 'esperando', creadoPor: userName || '', createdAt: serverTimestamp() })
        if (!vivo) return
        capturaIdRef.current = ref.id
        // En desarrollo (localhost) el teléfono no alcanza esta PC: el QR apunta a la app publicada, que usa la misma base de datos
        const base = /^(localhost|127.|192.168.|10.)/.test(window.location.hostname) ? 'https://app.orionsv.net' : window.location.origin
        const url = `${base}/captura/${ref.id}`
        QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: '#14213D', light: '#FFFFFF' } }).then(d => vivo && setQr(d)).catch(() => {})
        unsub = onSnapshot(ref, s => {
          if (!s.exists()) return
          const c = { id: s.id, ...s.data() }
          setCaptura(c)
          if (c.ia?.nombre) proponer(c.ia.nombre, { tipo: 'foto', nombre: c.ia.nombre, imagen: c.foto || '', marca: c.ia.marca || '', categoria: c.ia.categoria || '', unidad: c.ia.unidad || '', advertencia: c.ia.advertencia || '', precioImpreso: c.ia.precioImpreso })
        })
      } catch (e) { console.warn('captura:', e.message) }
    })()
    return () => { vivo = false; if (unsub) unsub() }
  }, [moduloFoto, empresaId, codigoBarras]) // eslint-disable-line react-hooks/exhaustive-deps

  // Al cerrar la ventana, la captura queda cerrada (el teléfono deja de ofrecer tomar foto)
  const cerrarCaptura = () => { const id = capturaIdRef.current; if (id) updateDoc(doc(db, 'capturas', id), { estado: 'cerrada' }).catch(() => {}) }
  const cerrar = () => { cerrarCaptura(); onCerrar() }

  const categorias = [...new Set(productos.map(p => (p.categoria || '').trim()).filter(Boolean))].sort()
  const precioNum = parseFloat(form.precioConIva)
  const imagenFinal = captura?.foto || origen?.imagen || ''

  // aLaVenta: true = guardar y agregar al carrito; false = solo dejarlo en el inventario (jornada de ingreso)
  const guardar = async (aLaVenta = modo === 'venta') => {
    if (guardando) return
    const nombre = normNombre(form.nombre)
    const stock = Math.round((parseFloat(form.stock) || 0) * 1000) / 1000
    if (!nombre) { await orionAlert('Escribe el nombre del producto, con marca y tamaño.', { tipo: 'warning' }); nombreRef.current?.focus(); return }
    if (!(precioNum > 0)) { await orionAlert('Escribe el precio de venta (con IVA).', { tipo: 'warning' }); precioRef.current?.focus(); return }
    if (stock < 0) { await orionAlert('Las existencias no pueden ser negativas.', { tipo: 'warning' }); return }
    if (aLaVenta && !venderSinStock && stock < 1) { await orionAlert('Escribe cuántos hay en existencia (al menos 1) para poder venderlo.', { tipo: 'warning' }); return }
    const repetido = productos.find(p => (p.nombre || '').trim().toLowerCase() === nombre.toLowerCase())
    if (repetido) { await orionAlert(`Ya existe un producto llamado "${repetido.nombre}". Si es el mismo, agrégale el código de barras desde Inventario; si es otro tamaño o sabor, escríbelo en el nombre.`, { tipo: 'warning' }); return }
    setGuardando(true)
    try {
      const codigo = generarCodigoInterno(productos)
      const unidad = form.unidad.trim() || 'Unidad'
      const data = {
        codigo, nombre, categoria: form.categoria.trim(), precio: Math.round((precioNum / (1 + IVA)) * 10000) / 10000,
        stock, min: 0, unidad, unidadesAdicionales: [], codigoBarras,
        ...(imagenFinal && { imagen: imagenFinal }),
        ...(origen?.marca && { marca: origen.marca }),
        origen: 'caja', creadoPor: userName || '', // para poder revisar en Inventario lo que se cargó desde la caja
        ...(origen?.tipo && { nombreOrigen: origen.tipo }),
        empresaId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }
      const ref = await addDoc(collection(db, 'productos'), data)
      if (stock > 0) {
        await addDoc(collection(db, 'kardex'), {
          productoId: ref.id, productoCodigo: codigo, productoNombre: nombre,
          tipo: 'entrada', cantidad: stock, unidad, stockAntes: 0, stockDespues: stock,
          motivo: 'Producto nuevo desde la caja (stock inicial)', referencia: userName || '',
          sucursalId: sucursalActivaId(), empresaId, fecha: serverTimestamp(),
        })
      }
      // El nombre que la cajera confirmó alimenta el catálogo de One Geo (la próxima tienda ya no lo escribe)
      aportarAlCatalogo({ codigoBarras, nombre, categoria: data.categoria, unidad, imagen: imagenFinal })
      cerrarCaptura()
      try { localStorage.setItem('orion_prod_nuevo_modo', aLaVenta ? 'venta' : 'solo') } catch { /* sin almacenamiento */ }
      onCreado({ id: ref.id, ...data }, aLaVenta)
    } catch (e) {
      setGuardando(false)
      orionAlert('No se pudo guardar el producto: ' + e.message, { tipo: 'error' })
    }
  }

  // stopPropagation: los atajos de la caja (F9, Esc, flechas…) no deben actuar mientras se llena esta ventana
  const teclas = (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); if (!guardando) cerrar() }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); guardar() }
  }

  const ayudaNombre = buscando ? 'Buscando el nombre por el código…'
    : origen?.tipo === 'foto' ? <>Nombre leído de la foto{origen.advertencia ? ` (⚠️ ${origen.advertencia})` : ''}: revísalo y corrígelo si hace falta.</>
    : origen?.tipo === 'catalogo' ? <>Nombre del catálogo One Geo{origen.revisado ? '' : ' (cargado por otra tienda)'}: revísalo.</>
    : origen?.tipo === 'publica' ? <>Nombre propuesto por la base pública{origen.parcial ? ' (incompleto)' : ''}: suele venir incompleto, corrígelo con marca y tamaño.</>
    : moduloFoto ? 'No está en el catálogo: toma la foto con el teléfono o escríbelo como aparece en el empaque.'
    : 'No se encontró: escríbelo como aparece en el empaque.'
  const estadoFoto = !captura ? 'Preparando el código…'
    : captura.estado === 'esperando' ? 'Esperando la foto del teléfono…'
    : captura.estado === 'con_foto' ? 'Foto recibida. Leyendo la etiqueta…'
    : captura.estado === 'listo' ? '✅ Nombre leído de la foto'
    : captura.estado === 'error_ia' ? `No se pudo leer la etiqueta${captura.foto ? '; la foto sí quedó' : ''}. Escribe el nombre.`
    : ''

  return (
    <div className="modal-overlay" style={{ zIndex: 600 }} onClick={e => e.stopPropagation()} onKeyDown={teclas}>
      <div className="modal" style={{ maxWidth: moduloFoto ? 680 : 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ marginBottom: 8 }}>🆕 Producto nuevo</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.45 }}>
          El código <strong style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{codigoBarras}</strong> no está en el inventario.
          Completa los datos para guardarlo. Enter = «{modo === 'solo' ? 'Solo guardar' : 'Guardar y agregar a la venta'}».
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: moduloFoto ? '1fr 200px' : '1fr', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Nombre (marca, sabor y tamaño) *</label>
            <input ref={nombreRef} className="input" placeholder="Ej.: FANTA NARANJA 1.25 LT" value={form.nombre}
              style={{ textTransform: mayusculas ? 'uppercase' : 'none' }} onChange={e => set('nombre', e.target.value)} />
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{ayudaNombre}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Precio con IVA *</label>
              <input ref={precioRef} className="input" type="number" min="0" step="0.01" inputMode="decimal" placeholder={origen?.precioImpreso ? `En la bolsa dice $${Number(origen.precioImpreso).toFixed(2)}` : '0.00'}
                value={form.precioConIva} onChange={e => set('precioConIva', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Existencias</label>
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
        {moduloFoto && (
          <div className="pn-foto" style={{ textAlign: 'center', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 12 }}>
            {captura?.foto
              ? <img src={captura.foto} alt="Foto del producto" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, background: '#000' }} />
              : qr ? <img src={qr} alt="QR para tomar la foto" style={{ width: 160, height: 160, borderRadius: 8, background: '#fff', padding: 4 }} />
              : <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12 }}>…</div>}
            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>{captura?.foto ? 'Foto del producto' : '📱 Foto con el teléfono'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4, marginTop: 4 }}>
              {captura?.foto ? estadoFoto : <>Escanea el QR con el teléfono y toma la foto del frente. El nombre se llena solo.<br />{estadoFoto}</>}
            </div>
          </div>
        )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" disabled={guardando} onClick={cerrar}>Ahora no</button>
          <button className={`btn ${modo === 'solo' ? 'btn-primary' : 'btn-ghost'}`} disabled={guardando} onClick={() => guardar(false)}>Solo guardar</button>
          <button className={`btn ${modo === 'venta' ? 'btn-primary' : 'btn-ghost'}`} disabled={guardando} onClick={() => guardar(true)}>{guardando ? 'Guardando…' : 'Guardar y agregar a la venta'}</button>
        </div>
      </div>
    </div>
  )
}
