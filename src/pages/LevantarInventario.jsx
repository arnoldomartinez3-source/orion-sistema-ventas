import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { db } from '../firebase'
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'
import { orionAlert } from '../orionDialog'
import { generarCodigoBarras } from '../utils/etiquetas'
import { postAutenticado } from '../utils/apiAuth'

// ══════════════════════════════════════════════════════════════════
// LEVANTAR INVENTARIO — pantalla móvil para contar productos caminando
// por los estantes (también sirve en PC con lector USB de códigos).
//  1. Escaneás el código de barras con la cámara (o lo escribe el lector USB).
//  2. Si el producto ya existe → solo cantidad contada (y precio si cambió).
//     Si no existe → se busca en la base pública Open Food Facts (nombre,
//     marca, tamaño, foto) y se completa precio/cantidad/categoría.
//  3. Guardar → productos (alta o ajuste de stock) + kardex, y a escanear el siguiente.
// Precio: el dueño piensa en precio de góndola CON IVA; ORIÓN guarda `precio`
// SIN IVA (como Inventario), así que aquí se convierte: neto = conIva / 1.13.
// ══════════════════════════════════════════════════════════════════

const IVA = 0.13
const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100
const limpiarCodigo = (s) => String(s || '').replace(/[^0-9A-Za-z-]/g, '').trim()
const UNIDADES = ['Unidad', 'Libra', 'Litro', 'Kilo', 'Paquete', 'Bolsa', 'Caja', 'Docena', 'Botella', 'Lata']

// Base pública de productos por código de barras (gratuita, con marcas centroamericanas).
async function buscarEnBasePublica(ean) {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=product_name,product_name_es,generic_name,generic_name_es,brands,quantity,image_front_small_url`)
    if (!r.ok) return null
    const d = await r.json()
    if (d.status !== 1 || !d.product) return null
    const p = d.product
    const marca = (p.brands || '').split(',')[0].trim()
    // Nombre: el específico; si no hay, el genérico; si tampoco, la marca. El tamaño
    // (quantity) se agrega al final. Si solo se conoce el tamaño, se marca como parcial
    // para que el usuario revise el nombre (antes salía solo "250 ML").
    const base = (p.product_name_es || p.product_name || p.generic_name_es || p.generic_name || '').trim()
    const partes = [base || marca, p.quantity].filter(Boolean)
    const nombre = partes.join(' ').trim()
    if (!nombre) return null
    return { nombre: nombre.toUpperCase(), marca, imagen: p.image_front_small_url || '', parcial: !base }
  } catch {
    return null
  }
}

// Pitido corto al leer un código (feedback sin mirar la pantalla)
function beep(ok = true) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = ok ? 1200 : 400; g.gain.value = 0.08
    o.start(); o.stop(ctx.currentTime + (ok ? 0.08 : 0.25))
  } catch { /* sin audio */ }
}

export default function LevantarInventario() {
  const { empresaId, userName } = usePermisos()
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [modo, setModo] = useState('escanear') // 'escanear' | 'form'
  const [codigo, setCodigo] = useState('')
  const [entrada, setEntrada] = useState('')
  const [producto, setProducto] = useState(null)     // existente (o null si es nuevo)
  const [sugerencia, setSugerencia] = useState(null) // de la base pública
  const [buscandoPublica, setBuscandoPublica] = useState(false)
  const [form, setForm] = useState({ nombre: '', categoria: '', precioConIva: '', cantidad: '', unidad: 'Unidad' })
  const [guardando, setGuardando] = useState(false)
  const [sesion, setSesion] = useState([]) // lo contado en esta sesión
  const [camara, setCamara] = useState(false)
  const [errorCamara, setErrorCamara] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const zxingRef = useRef(null)
  const timerRef = useRef(null)
  const ultimoRef = useRef({ code: '', t: 0 })
  const entradaRef = useRef(null)
  const cantidadRef = useRef(null)
  // Refs "siempre al día" para que la cámara NO tenga que reiniciarse cuando cambia
  // la lista de productos o el modo (antes se reiniciaba tras cada guardado y el
  // visor quedaba negro).
  const onCodigoRef = useRef(null)
  const modoRef = useRef('escanear')

  // ── Datos ──
  useEffect(() => {
    if (!empresaId) return
    const u1 = onSnapshot(query(collection(db, 'productos'), where('empresaId', '==', empresaId)),
      s => setProductos(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    const u2 = onSnapshot(query(collection(db, 'categorias'), where('empresaId', '==', empresaId)),
      s => setCategorias(s.docs.map(d => d.data().nombre).filter(Boolean).sort()), () => {})
    return () => { u1(); u2() }
  }, [empresaId])

  const categoriasTodas = useMemo(() => {
    const set = new Set(categorias)
    productos.forEach(p => { if (p.categoria) set.add(p.categoria) })
    return [...set].sort()
  }, [categorias, productos])

  // ── Al leer un código (cámara, lector USB o a mano) ──
  const onCodigo = useCallback(async (raw) => {
    const code = limpiarCodigo(raw)
    if (!code) return
    const ahora = Date.now()
    if (ultimoRef.current.code === code && ahora - ultimoRef.current.t < 2500) return // misma lectura repetida
    ultimoRef.current = { code, t: ahora }
    const existente = productos.find(p => (p.codigoBarras && p.codigoBarras === code) || p.codigo === code)
    beep(true)
    setCodigo(code)
    setEntrada('')
    setSugerencia(null)
    if (existente) {
      setProducto(existente)
      setForm({
        nombre: existente.nombre || '', categoria: existente.categoria || '',
        precioConIva: r2((existente.precio || 0) * (1 + IVA)).toFixed(2), cantidad: '', unidad: existente.unidad || 'Unidad'
      })
    } else {
      setProducto(null)
      setForm({ nombre: '', categoria: '', precioConIva: '', cantidad: '', unidad: 'Unidad' })
      if (/^\d{8,14}$/.test(code)) {
        setBuscandoPublica(true)
        const s = await buscarEnBasePublica(code)
        setBuscandoPublica(false)
        if (s) { setSugerencia(s); setForm(f => ({ ...f, nombre: f.nombre || s.nombre })) }
      }
    }
    setModo('form')
    setTimeout(() => cantidadRef.current?.focus(), 80)
  }, [productos])

  useEffect(() => { onCodigoRef.current = onCodigo }, [onCodigo])
  useEffect(() => { modoRef.current = modo }, [modo])

  // ── Cámara: BarcodeDetector nativo (Chrome Android) o ZXing (iPhone y otros) ──
  // Se inicia UNA vez y sigue viva mientras el usuario está en el formulario (el
  // visor queda oculto, no desmontado); la detección se pausa en modo formulario.
  const detenerCamara = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (zxingRef.current) { try { zxingRef.current.stop() } catch { /* ya detenido */ } zxingRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (videoRef.current) videoRef.current.srcObject = null
    setCamara(false)
  }, [])

  const iniciarCamara = useCallback(async () => {
    setErrorCamara('')
    try {
      if ('BarcodeDetector' in window) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
        streamRef.current = stream
        const v = videoRef.current
        v.srcObject = stream
        await v.play().catch(() => {})
        const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] })
        timerRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return
          try {
            if (modoRef.current !== 'escanear') return // pausada mientras se llena el formulario
            const codes = await detector.detect(videoRef.current)
            if (codes.length) onCodigoRef.current?.(codes[0].rawValue)
          } catch { /* frame no legible */ }
        }, 250)
      } else {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result && modoRef.current === 'escanear') onCodigoRef.current?.(result.getText())
        })
        zxingRef.current = controls
      }
      setCamara(true)
    } catch (e) {
      setErrorCamara('No se pudo abrir la cámara: ' + (e.message || e) + '. Podés escribir el código o usar un lector USB.')
      detenerCamara()
    }
  }, [detenerCamara])

  // Apagar la cámara al salir de la página
  useEffect(() => () => detenerCamara(), [detenerCamara])

  // ── Guardar ──
  const guardar = async () => {
    const cantidad = parseFloat(form.cantidad)
    const precioConIva = parseFloat(form.precioConIva)
    if (!form.nombre.trim()) { await orionAlert('Escribí el nombre del producto.', { tipo: 'warning' }); return }
    if (isNaN(cantidad) || cantidad < 0) { await orionAlert('Escribí la cantidad contada.', { tipo: 'warning' }); cantidadRef.current?.focus(); return }
    if (isNaN(precioConIva) || precioConIva <= 0) { await orionAlert('Escribí el precio de venta (con IVA).', { tipo: 'warning' }); return }
    const precioNeto = r2(precioConIva / (1 + IVA))
    const nombre = form.nombre.trim().toUpperCase()
    setGuardando(true)
    try {
      if (producto) {
        const stockAntes = Number(producto.stock) || 0
        const upd = { nombre, precio: precioNeto, stock: cantidad, unidad: form.unidad, updatedAt: serverTimestamp() }
        if (form.categoria.trim()) upd.categoria = form.categoria.trim()
        if (!producto.codigoBarras && /^\d{8,14}$/.test(codigo)) upd.codigoBarras = codigo
        await updateDoc(doc(db, 'productos', producto.id), upd)
        if (stockAntes !== cantidad) {
          await addDoc(collection(db, 'kardex'), {
            productoId: producto.id, productoCodigo: producto.codigo || codigo, productoNombre: nombre,
            tipo: 'ajuste', cantidad: Math.abs(cantidad - stockAntes), unidad: form.unidad,
            stockAntes, stockDespues: cantidad, motivo: 'Levantamiento de inventario', referencia: userName || '',
            empresaId, fecha: serverTimestamp()
          })
        }
        setSesion(s => [{ nombre, cantidad, nuevo: false, id: producto.id }, ...s].slice(0, 30))
      } else {
        const esEAN = /^\d{8,14}$/.test(codigo)
        const data = {
          codigo, nombre, categoria: form.categoria.trim(), precio: precioNeto, stock: cantidad, min: 0,
          unidad: form.unidad, unidadesAdicionales: [],
          ...(esEAN && { codigoBarras: codigo }),
          ...(sugerencia?.imagen && { imagen: sugerencia.imagen }),
          ...(sugerencia?.marca && { proveedor: '' , marca: sugerencia.marca }),
          empresaId, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        }
        const ref = await addDoc(collection(db, 'productos'), data)
        if (cantidad > 0) {
          await addDoc(collection(db, 'kardex'), {
            productoId: ref.id, productoCodigo: codigo, productoNombre: nombre,
            tipo: 'entrada', cantidad, unidad: form.unidad, stockAntes: 0, stockDespues: cantidad,
            motivo: 'Levantamiento de inventario (stock inicial)', referencia: userName || '',
            empresaId, fecha: serverTimestamp()
          })
        }
        setSesion(s => [{ nombre, cantidad, nuevo: true, id: ref.id }, ...s].slice(0, 30))
      }
      beep(true)
      volverAEscanear()
    } catch (e) {
      beep(false)
      await orionAlert('No se pudo guardar: ' + e.message, { tipo: 'error' })
    }
    setGuardando(false)
  }

  const volverAEscanear = () => {
    setModo('escanear'); setProducto(null); setSugerencia(null); setCodigo(''); setEntrada('')
    setForm({ nombre: '', categoria: '', precioConIva: '', cantidad: '', unidad: 'Unidad' })
    setTimeout(() => entradaRef.current?.focus(), 80)
  }

  // Producto sin código de barras (granel, pan, queso por libra…): código interno.
  const sinCodigo = () => {
    const interno = generarCodigoBarras(productos.map(p => p.codigoBarras).filter(Boolean))
    ultimoRef.current = { code: '', t: 0 }
    setCodigo(interno); setProducto(null); setSugerencia(null)
    setForm({ nombre: '', categoria: '', precioConIva: '', cantidad: '', unidad: 'Unidad' })
    setModo('form')
  }

  const nuevos = sesion.filter(s => s.nuevo).length
  const actualizados = sesion.length - nuevos
  const precioNetoPreview = form.precioConIva ? r2(parseFloat(form.precioConIva) / (1 + IVA)) : 0

  // ══ ETAPA 2: importar desde FOTO de factura de compra / lista de precios (IA) ══
  // La foto se reduce en el celular (máx 1600 px, JPEG) y va a /api/dte/extraer-productos,
  // que la lee con Claude (visión) y devuelve líneas {nombre, cantidad, unidad, precio, código}.
  // El usuario revisa/ajusta (precio de venta con IVA, categoría) y recién entonces se importa:
  // existente → suma stock (compra) y actualiza precio/costo; nuevo → alta + stock inicial.
  const [foto, setFoto] = useState(null)          // { dataUrl, base64, mime }
  const [extrayendo, setExtrayendo] = useState(false)
  const [lineas, setLineas] = useState([])        // filas editables de la factura
  const [metaDoc, setMetaDoc] = useState(null)
  const [margen, setMargen] = useState('30')      // % sobre costo para sugerir precio de venta
  const [importando, setImportando] = useState(false)
  const normalizar = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim()

  const comprimirImagen = (file) => new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const max = 1600
      const esc = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      const dataUrl = c.toDataURL('image/jpeg', 0.85)
      resolve({ dataUrl, base64: dataUrl.split(',')[1], mime: 'image/jpeg' })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')) }
    img.src = url
  })

  const elegirFoto = async (file) => {
    if (!file) return
    try { setFoto(await comprimirImagen(file)); setLineas([]); setMetaDoc(null) }
    catch (e) { await orionAlert(e.message, { tipo: 'error' }) }
  }

  const extraerConIA = async () => {
    if (!foto) return
    setExtrayendo(true)
    try {
      const r = await postAutenticado('/api/dte/extraer-productos', { imagenBase64: foto.base64, mimeType: foto.mime })
      const texto = await r.text()
      let d
      try { d = JSON.parse(texto) } catch { throw new Error(`El servidor respondió ${r.status} sin datos (¿función extraerProductos desplegada y con la clave de IA configurada?)`) }
      if (!r.ok || !d.ok) throw new Error(d.error || d.detalle || `Error ${r.status}`)
      const m = parseFloat(margen) || 0
      const filas = (d.lineas || []).map((l, i) => {
        const nombre = normalizar(l.nombre)
        const existente = productos.find(p => (l.codigo && (p.codigoBarras === l.codigo || p.codigo === l.codigo)) || normalizar(p.nombre) === nombre) || null
        const costo = l.precioUnitario != null ? (d.preciosIncluyenIva ? r2(l.precioUnitario / (1 + IVA)) : r2(l.precioUnitario)) : null
        const venta = existente ? r2((existente.precio || 0) * (1 + IVA)) : (costo != null ? r2(costo * (1 + m / 100) * (1 + IVA)) : null)
        return {
          id: i, sel: true, nombre, cantidad: l.cantidad ?? '', unidad: l.unidad || 'Unidad', costo,
          precioVenta: venta != null ? venta.toFixed(2) : '', categoria: existente?.categoria || '', codigo: l.codigo || '', existente
        }
      })
      setLineas(filas)
      setMetaDoc({ tipo: d.tipoDocumento, proveedor: d.proveedor, fecha: d.fecha, advertencias: d.advertencias || [], iva: d.preciosIncluyenIva })
      if (!filas.length) await orionAlert('La IA no encontró líneas de producto en la foto. Probá con una foto más nítida y derecha.', { tipo: 'warning' })
    } catch (e) {
      await orionAlert('No se pudo leer la foto: ' + e.message, { tipo: 'error' })
    }
    setExtrayendo(false)
  }

  const aplicarMargen = () => {
    const m = parseFloat(margen) || 0
    setLineas(ls => ls.map(l => (l.costo != null && !l.existente) ? { ...l, precioVenta: r2(l.costo * (1 + m / 100) * (1 + IVA)).toFixed(2) } : l))
  }
  const setLinea = (id, campo, valor) => setLineas(ls => ls.map(l => l.id === id ? { ...l, [campo]: valor } : l))

  const importarLineas = async () => {
    const sel = lineas.filter(l => l.sel)
    if (!sel.length) return
    const malas = sel.filter(l => !l.nombre || isNaN(parseFloat(l.cantidad)) || isNaN(parseFloat(l.precioVenta)) || parseFloat(l.precioVenta) <= 0)
    if (malas.length) { await orionAlert(`Revisá ${malas.length} fila(s): nombre, cantidad y precio de venta son obligatorios.`, { tipo: 'warning' }); return }
    setImportando(true)
    let nuevos = 0, actualizados = 0
    const usados = productos.map(p => p.codigoBarras).filter(Boolean)
    const motivoBase = 'Compra según factura (foto)' + (metaDoc?.proveedor ? ' · ' + metaDoc.proveedor : '')
    try {
      for (const l of sel) {
        const cantidad = parseFloat(l.cantidad)
        const precio = r2(parseFloat(l.precioVenta) / (1 + IVA))
        if (l.existente) {
          const antes = Number(l.existente.stock) || 0
          const despues = r2(antes + cantidad)
          const upd = { precio, stock: despues, updatedAt: serverTimestamp() }
          if (l.costo != null) upd.costo = l.costo
          if (l.categoria) upd.categoria = l.categoria
          await updateDoc(doc(db, 'productos', l.existente.id), upd)
          await addDoc(collection(db, 'kardex'), {
            productoId: l.existente.id, productoCodigo: l.existente.codigo || '', productoNombre: l.nombre,
            tipo: 'entrada', cantidad, unidad: l.unidad, stockAntes: antes, stockDespues: despues,
            motivo: motivoBase, referencia: userName || '', empresaId, fecha: serverTimestamp()
          })
          actualizados++
        } else {
          const codigo = l.codigo || generarCodigoBarras(usados)
          usados.push(codigo)
          const ref = await addDoc(collection(db, 'productos'), {
            codigo, nombre: l.nombre, categoria: l.categoria || '', precio, stock: cantidad, min: 0,
            unidad: l.unidad, unidadesAdicionales: [],
            ...(l.costo != null && { costo: l.costo }),
            ...(metaDoc?.proveedor && { proveedor: metaDoc.proveedor }),
            empresaId, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
          })
          if (cantidad > 0) {
            await addDoc(collection(db, 'kardex'), {
              productoId: ref.id, productoCodigo: codigo, productoNombre: l.nombre,
              tipo: 'entrada', cantidad, unidad: l.unidad, stockAntes: 0, stockDespues: cantidad,
              motivo: motivoBase + ' — stock inicial', referencia: userName || '', empresaId, fecha: serverTimestamp()
            })
          }
          nuevos++
        }
      }
      setSesion(s => [...sel.map(l => ({ nombre: l.nombre, cantidad: parseFloat(l.cantidad), nuevo: !l.existente, id: l.existente?.id || '' })), ...s].slice(0, 30))
      setLineas([]); setFoto(null); setMetaDoc(null)
      await orionAlert(`Nuevos: ${nuevos} · Actualizados (stock sumado): ${actualizados}`, { titulo: '✅ Factura importada', tipo: 'success' })
    } catch (e) {
      await orionAlert(`Error al importar: ${e.message}\n\nSe importaron ${nuevos + actualizados} antes del error.`, { tipo: 'error' })
    }
    setImportando(false)
  }

  // ── UI (móvil primero) ──
  const S = {
    page: { maxWidth: 520, margin: '0 auto', padding: '14px 14px 90px' },
    big: { fontSize: 18, padding: '14px 12px', width: '100%' },
    label: { fontSize: 12, color: 'var(--muted)', fontWeight: 700, marginBottom: 4, display: 'block' },
    btnBig: { width: '100%', padding: '16px', fontSize: 17, fontWeight: 800 },
  }

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>📦 Levantar inventario</h1>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{productos.length} productos</div>
      </div>

      {/* Visor de cámara SIEMPRE montado (solo se oculta en el formulario): así la
          transmisión no se pierde entre un producto y el siguiente. */}
      <video ref={videoRef} playsInline muted autoPlay
        style={{ width: '100%', borderRadius: 10, background: '#000', aspectRatio: '4 / 3', marginBottom: 10, display: camara && modo === 'escanear' ? 'block' : 'none' }} />

      {modo === 'escanear' && (
        <>
          {/* Cámara */}
          <div className="card" style={{ padding: 10, marginBottom: 12 }}>
            {!camara ? (
              <button className="btn btn-primary" style={S.btnBig} onClick={iniciarCamara}>📷 Escanear con la cámara</button>
            ) : (
              <button className="btn btn-ghost" style={{ ...S.btnBig, marginTop: 8 }} onClick={detenerCamara}>Detener cámara</button>
            )}
            {errorCamara && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{errorCamara}</div>}
            {camara && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>Apuntá al código de barras; suena un pitido al leerlo.</div>}
          </div>

          {/* Lector USB / a mano */}
          <label style={S.label}>Código (lector USB o a mano)</label>
          <input ref={entradaRef} className="input" style={S.big} inputMode="numeric" autoFocus placeholder="Escaneá o escribí el código y Enter"
            value={entrada} onChange={e => setEntrada(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCodigo(entrada) } }} />
          <button className="btn btn-ghost" style={{ ...S.btnBig, marginTop: 10 }} onClick={sinCodigo}>➕ Producto sin código de barras</button>

          {/* 📷 Importar desde foto de factura / lista de precios (IA) */}
          <div className="card" style={{ marginTop: 14, padding: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>📷 Importar desde foto de factura</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
              Tomale foto a una factura de compra o lista de precios: la IA saca los productos y vos revisás antes de importar.
            </div>
            <input type="file" accept="image/*" capture="environment" id="foto-factura" style={{ display: 'none' }}
              onChange={e => { elegirFoto(e.target.files?.[0]); e.target.value = '' }} />
            <label htmlFor="foto-factura" className="btn btn-ghost" style={{ ...S.btnBig, display: 'block', textAlign: 'center', cursor: 'pointer' }}>
              {foto ? '📷 Cambiar foto' : '📷 Tomar / elegir foto'}
            </label>
            {foto && (
              <>
                <img src={foto.dataUrl} alt="" style={{ width: '100%', borderRadius: 10, marginTop: 10, maxHeight: 260, objectFit: 'contain', background: '#000' }} />
                {lineas.length === 0 && (
                  <button className="btn btn-primary" style={{ ...S.btnBig, marginTop: 10 }} disabled={extrayendo} onClick={extraerConIA}>
                    {extrayendo ? '🤖 Leyendo la factura… (10-20 s)' : '🤖 Leer productos con IA'}
                  </button>
                )}
              </>
            )}
            {metaDoc && lineas.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                {metaDoc.tipo || 'Documento'}{metaDoc.proveedor ? ` · ${metaDoc.proveedor}` : ''}{metaDoc.fecha ? ` · ${metaDoc.fecha}` : ''}
                {' · precios '}{metaDoc.iva === true ? 'con IVA' : metaDoc.iva === false ? 'sin IVA' : '(IVA no indicado)'}
                {metaDoc.advertencias.length > 0 && <div style={{ color: '#f59e0b', marginTop: 4 }}>⚠️ {metaDoc.advertencias.join(' · ')}</div>}
              </div>
            )}
            {lineas.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, flexWrap: 'wrap' }}>
                  <span>Margen sobre costo:</span>
                  <input className="input" inputMode="decimal" value={margen} onChange={e => setMargen(e.target.value)} style={{ width: 64, padding: '4px 6px' }} />
                  <span>%</span>
                  <button className="btn btn-ghost btn-sm" onClick={aplicarMargen}>Aplicar a los nuevos</button>
                </div>
                <datalist id="cats-foto">{categoriasTodas.map(c => <option key={c} value={c} />)}</datalist>
                {lineas.map(l => (
                  <div key={l.id} style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10, opacity: l.sel ? 1 : 0.45 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={l.sel} onChange={e => setLinea(l.id, 'sel', e.target.checked)} />
                      <input className="input" value={l.nombre} onChange={e => setLinea(l.id, 'nombre', e.target.value.toUpperCase())} style={{ flex: 1, padding: '8px 10px', fontSize: 14 }} />
                    </div>
                    <div style={{ fontSize: 11, color: l.existente ? '#12a06b' : '#7c3aed', margin: '4px 0 6px 26px' }}>
                      {l.existente ? `✔️ Ya existe (stock ${l.existente.stock ?? 0}) → se suma la cantidad` : '🆕 Nuevo'}
                      {l.costo != null ? ` · costo $${l.costo.toFixed(2)} sin IVA` : ' · sin costo en la foto'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginLeft: 26 }}>
                      <div>
                        <label style={S.label}>Cant.</label>
                        <input className="input" inputMode="decimal" value={l.cantidad} onChange={e => setLinea(l.id, 'cantidad', e.target.value)} style={{ padding: 8, fontSize: 15 }} />
                      </div>
                      <div>
                        <label style={S.label}>Unidad</label>
                        <select className="input" value={l.unidad} onChange={e => setLinea(l.id, 'unidad', e.target.value)} style={{ padding: '8px 4px', fontSize: 13 }}>
                          {[...new Set([l.unidad, ...UNIDADES, 'Fardo'])].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={S.label}>Venta c/IVA</label>
                        <input className="input" inputMode="decimal" value={l.precioVenta} onChange={e => setLinea(l.id, 'precioVenta', e.target.value)} style={{ padding: 8, fontSize: 15 }} placeholder="0.00" />
                      </div>
                    </div>
                    {!l.existente && (
                      <div style={{ marginLeft: 26, marginTop: 6 }}>
                        <input className="input" list="cats-foto" value={l.categoria} onChange={e => setLinea(l.id, 'categoria', e.target.value)} placeholder="Categoría" style={{ padding: '8px 10px', fontSize: 13 }} />
                      </div>
                    )}
                  </div>
                ))}
                <button className="btn btn-primary" style={{ ...S.btnBig, marginTop: 12 }} disabled={importando} onClick={importarLineas}>
                  {importando ? 'Importando…' : `⬇️ Importar ${lineas.filter(l => l.sel).length} producto(s)`}
                </button>
              </>
            )}
          </div>

          {/* Resumen de la sesión */}
          <div className="card" style={{ marginTop: 14, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
              <strong>Esta sesión</strong>
              <span style={{ color: 'var(--muted)' }}>{nuevos} nuevos · {actualizados} actualizados</span>
            </div>
            {sesion.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Todavía no contaste nada. Escaneá el primer producto.</div>
            ) : sesion.slice(0, 8).map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{s.nuevo ? '🆕 ' : '✔️ '}{s.nombre}</span><strong>{s.cantidad}</strong>
              </div>
            ))}
          </div>
        </>
      )}

      {modo === 'form' && (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Código: <span style={{ fontFamily: 'var(--mono)' }}>{codigo}</span></div>
          {producto ? (
            <div style={{ background: 'rgba(18,160,107,0.08)', border: '1px solid rgba(18,160,107,0.3)', borderRadius: 10, padding: '8px 10px', fontSize: 13, marginBottom: 10 }}>
              ✔️ Ya existe · stock actual <strong>{producto.stock ?? 0}</strong> {producto.unidad || ''}
            </div>
          ) : (
            <div style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 10, padding: '8px 10px', fontSize: 13, marginBottom: 10 }}>
              🆕 Producto nuevo {buscandoPublica ? '· buscando en la base pública…' : sugerencia?.parcial ? '· la base pública solo trajo marca/tamaño: revisá el nombre' : sugerencia ? '· encontrado en la base pública' : '· no está en la base pública: escribí el nombre'}
            </div>
          )}
          {sugerencia?.imagen && <img src={sugerencia.imagen} alt="" style={{ height: 70, borderRadius: 8, marginBottom: 8 }} />}

          <label style={S.label}>Nombre</label>
          <input className="input" style={{ ...S.big, fontSize: 16 }} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: LECHE ENTERA 1 L" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div>
              <label style={S.label}>Cantidad contada</label>
              <input ref={cantidadRef} className="input" style={S.big} inputMode="decimal" value={form.cantidad}
                onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); guardar() } }} placeholder="0" />
            </div>
            <div>
              <label style={S.label}>Precio venta (con IVA)</label>
              <input className="input" style={S.big} inputMode="decimal" value={form.precioConIva}
                onChange={e => setForm(f => ({ ...f, precioConIva: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); guardar() } }} placeholder="0.00" />
              {precioNetoPreview > 0 && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>= ${precioNetoPreview.toFixed(2)} sin IVA</div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div>
              <label style={S.label}>Categoría</label>
              <input className="input" style={{ ...S.big, fontSize: 15 }} list="cats-levantar" value={form.categoria}
                onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} placeholder="Ej: LÁCTEOS" />
              <datalist id="cats-levantar">{categoriasTodas.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label style={S.label}>Unidad</label>
              <select className="input" style={{ ...S.big, fontSize: 15 }} value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 14 }}>
            <button className="btn btn-ghost" style={S.btnBig} onClick={volverAEscanear} disabled={guardando}>Cancelar</button>
            <button className="btn btn-primary" style={S.btnBig} onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : producto ? '✔️ Guardar conteo' : '➕ Crear y contar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
