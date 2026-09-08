import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { db } from '../firebase'
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'
import { orionAlert } from '../orionDialog'
import { generarCodigoBarras } from '../utils/etiquetas'

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
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=product_name,product_name_es,brands,quantity,image_front_small_url`)
    if (!r.ok) return null
    const d = await r.json()
    if (d.status !== 1 || !d.product) return null
    const p = d.product
    const nombre = [p.product_name_es || p.product_name, p.quantity].filter(Boolean).join(' ').trim()
    if (!nombre) return null
    return { nombre: nombre.toUpperCase(), marca: p.brands || '', imagen: p.image_front_small_url || '' }
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

  // ── Cámara: BarcodeDetector nativo (Chrome Android) o ZXing (iPhone y otros) ──
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
            const codes = await detector.detect(videoRef.current)
            if (codes.length) onCodigo(codes[0].rawValue)
          } catch { /* frame no legible */ }
        }, 250)
      } else {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result) onCodigo(result.getText())
        })
        zxingRef.current = controls
      }
      setCamara(true)
    } catch (e) {
      setErrorCamara('No se pudo abrir la cámara: ' + (e.message || e) + '. Podés escribir el código o usar un lector USB.')
      detenerCamara()
    }
  }, [onCodigo, detenerCamara])

  // Reiniciar el detector cuando cambia onCodigo (nueva lista de productos)
  useEffect(() => () => detenerCamara(), [detenerCamara])
  useEffect(() => {
    if (!camara) return
    detenerCamara()
    const t = setTimeout(() => iniciarCamara(), 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCodigo])

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

      {modo === 'escanear' && (
        <>
          {/* Cámara */}
          <div className="card" style={{ padding: 10, marginBottom: 12 }}>
            <video ref={videoRef} playsInline muted autoPlay
              style={{ width: '100%', borderRadius: 10, background: '#000', aspectRatio: '4 / 3', display: camara ? 'block' : 'none' }} />
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
              🆕 Producto nuevo {buscandoPublica ? '· buscando en la base pública…' : sugerencia ? '· encontrado en la base pública' : '· no está en la base pública: escribí el nombre'}
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
