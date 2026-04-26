import { useState, useEffect } from 'react'
import { db } from '../firebase'
import {
  collection, onSnapshot, doc, serverTimestamp,
  runTransaction, getDocs, getDoc
} from 'firebase/firestore'
import TicketImpresion from '../components/TicketImpresion'
import { usePermisos } from '../PermisosContext'
import { useAuth } from '../AuthContext'

const IVA = 0.13

const TIPOS_DTE = [
  { codigo: 'FE', nombre: 'Factura Consumidor Final', desc: 'Cliente sin NRC', color: '#00d4aa', icon: '🧾' },
  { codigo: 'CCF', nombre: 'Crédito Fiscal', desc: 'Empresa con NRC', color: '#4f8cff', icon: '🏢' },
]

const pvStyles = `
  /* ── LAYOUT ESCRITORIO: lado a lado ── */
  .pv-layout {
    display: grid;
    grid-template-columns: 1fr 580px;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 1300px) { .pv-layout { grid-template-columns: 1fr 520px; } }
  @media (max-width: 1100px) { .pv-layout { grid-template-columns: 1fr 460px; } }

  /* ── MÓVIL: una sola columna con tabs ── */
  @media (max-width: 860px) {
    .pv-layout { grid-template-columns: 1fr; gap: 0; }
    .pv-panel-productos { display: none; }
    .pv-panel-carrito { display: none; }
    .pv-panel-productos.activo { display: block; }
    .pv-panel-carrito.activo { display: block; }
    .carrito-wrap { position: static; }
  }

  /* TABS MÓVIL */
  .pv-tabs-mobile {
    display: none;
    margin-bottom: 14px;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 14px;
    padding: 6px;
    gap: 6px;
  }
  @media (max-width: 860px) { .pv-tabs-mobile { display: flex; } }

  .pv-tab {
    flex: 1; padding: 12px 8px; border-radius: 10px;
    border: none; cursor: pointer; font-family: var(--font);
    font-size: 14px; font-weight: 700; transition: all 0.18s;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    color: var(--muted); background: transparent;
  }
  .pv-tab.active {
    background: linear-gradient(135deg, var(--accent), var(--accent-dark));
    color: #0a0f0d;
    box-shadow: 0 4px 12px rgba(0,212,170,0.3);
  }
  .pv-tab-badge {
    background: var(--danger); color: #fff;
    font-size: 11px; font-weight: 800;
    padding: 2px 8px; border-radius: 99px; min-width: 22px; text-align: center;
  }
  .pv-tab.active .pv-tab-badge {
    background: rgba(0,0,0,0.2); color: #0a0f0d;
  }

  /* PRODUCTOS */
  .producto-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 16px; }
  @media (max-width: 500px) { .producto-grid { grid-template-columns: repeat(2,1fr); gap: 10px; padding: 12px; } }

  .producto-card { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 14px; padding: 16px; cursor: pointer; transition: all 0.15s; position: relative; }
  .producto-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 6px 20px var(--shadow); }
  .producto-card:active { transform: scale(0.97); }
  .producto-card.agotado { opacity: 0.45; cursor: not-allowed; }
  .producto-card.agotado:hover { transform: none; border-color: var(--border); box-shadow: none; }
  .agotado-badge { position: absolute; top: 8px; right: 8px; background: var(--danger); color: #fff; font-size: 9px; font-weight: 800; padding: 2px 7px; border-radius: 6px; }
  .prod-nombre { font-size: 14px; font-weight: 700; margin-bottom: 10px; line-height: 1.4; }
  .prod-precios { display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px; }
  .prod-precio-base { font-size: 12px; color: var(--muted); }
  .prod-precio-iva { font-family: var(--mono); font-size: 20px; font-weight: 800; color: var(--accent); }
  .prod-iva-badge { font-size: 10px; font-weight: 700; background: rgba(0,212,170,0.15); color: var(--accent); padding: 1px 5px; border-radius: 4px; margin-left: 4px; }
  .prod-stock { font-size: 12px; margin-top: 2px; }
  .prod-stock.ok { color: var(--muted); }
  .prod-stock.low { color: var(--accent3); font-weight: 600; }
  .prod-stock.out { color: var(--danger); font-weight: 600; }

  /* CARRITO */
  .carrito-wrap { position: sticky; top: 20px; max-height: calc(100vh - 40px); display: flex; flex-direction: column; }

  .carrito-items { flex: 1; overflow-y: auto; padding: 10px 14px; display: flex; flex-direction: column; gap: 10px; max-height: calc(100vh - 320px); }
  @media (max-width: 860px) { .carrito-items { max-height: calc(100vh - 420px); flex: none; overflow-y: auto; } }
  @media (max-width: 500px) { .carrito-items { max-height: calc(100vh - 460px); } }

  /* Item cajita alargada */
  .carrito-item { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 14px; padding: 14px 16px; transition: all 0.15s; box-shadow: 0 2px 10px var(--shadow2); }
  .carrito-item:hover { border-color: var(--accent); box-shadow: 0 6px 18px var(--shadow); }

  /* Fila 1: nombre */
  .ci-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
  .ci-info { flex: 1; min-width: 0; }
  .ci-nombre { font-size: 15px; font-weight: 700; line-height: 1.3; }
  .ci-precio-iva { font-size: 12px; color: var(--muted); font-family: var(--mono); margin-top: 2px; }

  /* Fila 2: todo en una línea */
  .ci-bottom-row { display: flex; align-items: center; gap: 8px; }
  .ci-qty { display: flex; align-items: center; gap: 6px; }
  .qty-btn { width: 30px; height: 30px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; font-size: 17px; display: flex; align-items: center; justify-content: center; transition: all 0.1s; font-weight: 700; flex-shrink: 0; }
  .qty-btn:hover { border-color: var(--accent); color: var(--accent); background: rgba(0,212,170,0.08); }
  .ci-qty-input { width: 100px; height: 30px; border-radius: 8px; border: 1.5px solid var(--accent); background: var(--glow); color: var(--accent); font-family: var(--mono); font-size: 15px; font-weight: 800; text-align: center; outline: none; box-shadow: 0 0 6px rgba(0,212,170,0.15); }
  .ci-qty-input:focus { box-shadow: 0 0 12px rgba(0,212,170,0.3); }
  .ci-desc-input { width: 60px; height: 30px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); font-family: var(--mono); font-size: 13px; text-align: center; outline: none; }
  .ci-desc-input:focus { border-color: #f59e0b; }
  .ci-total { font-family: var(--mono); font-size: 11px; font-weight: 900; color: var(--accent); flex-shrink: 0; margin-left: auto; }
  .ci-precios { display: none; }
  .ci-bottom { display: none; }
  .ci-qty-num { display: none; }

  .carrito-header-inner {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px; border-bottom: 1.5px solid var(--border);
    background: linear-gradient(135deg, rgba(0,212,170,0.06), transparent);
  }
  .carrito-title { font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 10px; }
  .carrito-count { background: var(--accent); color: #0a0f0d; font-size: 12px; font-weight: 800; padding: 3px 10px; border-radius: 99px; }

  .carrito-cliente { padding: 14px 20px; border-bottom: 1.5px solid var(--border); position: relative; }
  .cliente-dropdown { position: absolute; left: 14px; right: 14px; top: 100%; background: var(--surface); border: 1.5px solid var(--accent); border-radius: 12px; z-index: 999; box-shadow: 0 8px 24px var(--shadow); overflow: hidden; max-height: 220px; overflow-y: auto; }
  .cliente-option { padding: 12px 16px; cursor: pointer; transition: background 0.12s; border-bottom: 1px solid var(--border); }
  .cliente-option:last-child { border-bottom: none; }
  .cliente-option:hover { background: var(--glow); }
  .cliente-option-nombre { font-size: 14px; font-weight: 700; }
  .cliente-option-detalle { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .cliente-seleccionado { display: flex; align-items: center; justify-content: space-between; background: var(--glow); border: 1.5px solid var(--accent); border-radius: 10px; padding: 10px 14px; margin-top: 8px; }
  .cliente-sel-nombre { font-size: 14px; font-weight: 700; color: var(--accent); }
  .cliente-sel-detalle { font-size: 11px; color: var(--muted); margin-top: 2px; }



  .total-box { padding: 16px 20px; border-top: 2px solid var(--border); background: var(--surface2); flex-shrink: 0; }
  @media (max-width: 860px) { .total-box { padding: 12px 16px; position: sticky; bottom: 0; } }
  .total-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px; color: var(--muted); }
  @media (max-width: 500px) { .total-row { font-size: 13px; margin-bottom: 6px; } }
  .total-row.final { font-size: 22px; font-weight: 800; color: var(--text); margin-top: 10px; padding-top: 10px; border-top: 2px solid var(--border); margin-bottom: 0; letter-spacing: -0.8px; }
  @media (max-width: 500px) { .total-row.final { font-size: 18px; margin-top: 8px; padding-top: 8px; } }

  .btn-cobrar { width: 100%; margin-top: 12px; padding: 14px; font-size: 16px; font-weight: 800; letter-spacing: -0.3px; border-radius: 14px; border: none; cursor: pointer; background: linear-gradient(135deg, var(--accent), var(--accent-dark)); color: #0a0f0d; transition: all 0.18s; box-shadow: 0 4px 20px rgba(0,212,170,0.35); display: flex; align-items: center; justify-content: center; gap: 10px; font-family: var(--font); }
  .btn-cobrar:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,212,170,0.45); }
  .btn-cobrar:active { transform: scale(0.98); }
  .btn-cobrar:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: none; }

  .carrito-empty { padding: 48px 20px; text-align: center; }
  .carrito-empty-icon { font-size: 52px; margin-bottom: 14px; opacity: 0.25; }
  .carrito-empty-text { font-size: 14px; color: var(--muted); font-weight: 500; line-height: 1.6; }

  /* TABS INTERNOS (Productos/Historial) solo escritorio */
  .inner-tabs { display: flex; gap: 4px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .inner-tab { padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--muted); transition: all 0.15s; border: none; background: none; font-family: var(--font); }
  .inner-tab.active { background: rgba(0,212,170,0.12); color: var(--accent); }
  .inner-tab:hover { color: var(--text); }

  .historial-item { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border); transition: background 0.15s; }
  .historial-item:hover { background: var(--surface2); }
  .historial-item:last-child { border-bottom: none; }

  /* PANTALLA DTE */
  .dte-screen { max-width: 560px; margin: 0 auto; }
  .dte-tipo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; }
  .dte-tipo-btn { border: 2px solid var(--border); border-radius: 16px; padding: 20px; cursor: pointer; transition: all 0.18s; text-align: left; background: var(--surface); }
  .dte-tipo-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px var(--shadow); }
  .dte-tipo-btn.selected { border-color: var(--btn-color); }
  .dte-tipo-icon { font-size: 30px; margin-bottom: 10px; }
  .dte-tipo-code { font-size: 17px; font-weight: 800; font-family: var(--mono); margin-bottom: 4px; }
  .dte-tipo-name { font-size: 13px; font-weight: 600; margin-bottom: 3px; }
  .dte-tipo-desc { font-size: 11px; color: var(--muted); }

  .pago-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; }
  .pago-btn { border: 2px solid var(--border); border-radius: 16px; padding: 18px; cursor: pointer; transition: all 0.18s; text-align: center; background: var(--surface); }
  .pago-btn:hover { transform: translateY(-2px); }
  .pago-btn.selected-contado { border-color: #00d4aa; background: rgba(0,212,170,0.06); }
  .pago-btn.selected-credito { border-color: #f59e0b; background: rgba(245,158,11,0.06); }
  .pago-icon { font-size: 30px; margin-bottom: 8px; }
  .pago-label { font-size: 15px; font-weight: 800; margin-bottom: 3px; }
  .pago-desc { font-size: 12px; color: var(--muted); }
  .section-title { font-size: 15px; font-weight: 700; margin-bottom: 14px; color: var(--text); }

  /* TICKET */
  .ticket { background: var(--surface); border: 1.5px solid var(--border); border-radius: 20px; padding: 32px; text-align: center; box-shadow: 0 8px 30px var(--shadow2); }
  .ticket-check { font-size: 60px; margin-bottom: 14px; }
  .ticket-title { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 6px; }
  .ticket-dte-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 18px; border-radius: 99px; font-size: 14px; font-weight: 700; margin-bottom: 20px; font-family: var(--mono); }
  .ticket-detalle { text-align: left; background: var(--surface2); border-radius: 14px; padding: 18px; margin-bottom: 18px; border: 1px solid var(--border); }
  .ticket-item { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px; gap: 12px; }
  .ticket-divider { border: none; border-top: 1px solid var(--border); margin: 12px 0; }
  .ticket-total-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px; }
  .ticket-total-row.final { font-size: 20px; font-weight: 800; margin-top: 10px; }
`

export default function PuntoDeVenta() {
  const { user } = useAuth()
  const { puede, userName, userId, esAdmin } = usePermisos()
  const [cajaAbierta, setCajaAbierta] = useState(null)
  const [requerirCaja, setRequerirCaja] = useState(false)
  const [productos, setProductos] = useState([])
  const [ventas, setVentas] = useState([])
  const [loadingProds, setLoadingProds] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState([])
  const [clientes, setClientes] = useState([])
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [mostrarDropdown, setMostrarDropdown] = useState(false)
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [innerTab, setInnerTab] = useState('productos') // productos | historial
  const [vistaMovil, setVistaMovil] = useState('productos') // productos | carrito
  const [pantalla, setPantalla] = useState('venta')
  const [tipoDte, setTipoDte] = useState('FE')
  const [tipoPago, setTipoPago] = useState('contado')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [nit, setNit] = useState('')
  const [nrc, setNrc] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [ventaFinalizada, setVentaFinalizada] = useState(null)
  const [modalUnidad, setModalUnidad] = useState(null) // producto con multiples unidades

  // Cargar config y verificar caja abierta
  useEffect(() => {
    if (!user) return
    // Cargar configuracion
    getDoc(doc(db, 'configuracion', user.uid)).then(snap => {
      if (snap.exists()) setRequerirCaja(snap.data().requerirCaja || false)
    })
    // Verificar si hay caja abierta para este usuario
    const unsubCaja = onSnapshot(collection(db, 'cajas'), snap => {
      const cajas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const miCaja = cajas.find(c =>
        c.estado === 'abierta' &&
        (c.cajeroId === user?.uid || c.cajeroNombre === userName)
      )
      setCajaAbierta(miCaja || null)
    })
    return () => unsubCaja()
  }, [user, userName])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clientes'), snap => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'productos'), (snap) => {
      setProductos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoadingProds(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ventas'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setVentas(data)
    })
    return () => unsub()
  }, [])

  const filtrados = productos.filter(p =>
    p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busqueda.toLowerCase())
  )

  const precioConIva = (precio) => precio * (1 + IVA)
  const fmt = (n) => `$${(n || 0).toFixed(2)}`

  const agregar = (producto, unidadSeleccionada = null) => {
    if (producto.stock <= 0) return
    // Si tiene unidades adicionales y no se ha seleccionado una, mostrar modal
    if (!unidadSeleccionada && (producto.unidadesAdicionales || []).length > 0) {
      setModalUnidad(producto)
      return
    }
    // Calcular precio según unidad seleccionada
    let precioFinal = producto.precio
    let unidadFinal = producto.unidad
    let factorUnidad = 1
    if (unidadSeleccionada && unidadSeleccionada.nombre !== producto.unidad) {
      unidadFinal = unidadSeleccionada.nombre
      factorUnidad = unidadSeleccionada.factor || 1
      precioFinal = unidadSeleccionada.precio || (producto.precio * factorUnidad)
    }
    const carritoId = producto.id + '_' + unidadFinal
    const existe = carrito.find(c => c.carritoId === carritoId)
    if (existe) {
      if (existe.qty >= producto.stock) return
      setCarrito(carrito.map(c => c.carritoId === carritoId ? { ...c, qty: c.qty + 1 } : c))
    } else {
      setCarrito([...carrito, { ...producto, carritoId, precio: precioFinal, unidad: unidadFinal, factorUnidad, qty: 1 }])
    }
  }

  const cambiarQty = (carritoId, delta) => {
    const item = carrito.find(c => c.carritoId === carritoId)
    const producto = item ? productos.find(p => p.id === item.id) : null
    setCarrito(carrito
      .map(c => {
        if (c.carritoId !== carritoId) return c
        const newQty = c.qty + delta
        if (newQty > (producto?.stock || 999)) return c
        return { ...c, qty: newQty }
      })
      .filter(c => c.qty > 0)
    )
  }

  const subtotal = carrito.reduce((sum, c) => sum + c.precio * c.qty, 0)
  const ivaTotal = subtotal * IVA
  const total = subtotal + ivaTotal

  const irADte = () => { if (carrito.length > 0) setPantalla('dte') }

  const procesarVenta = async () => {
    if (procesando) return
    if (tipoDte === 'CCF' && !nrc) { alert('El CCF requiere el NRC del cliente.'); return }
    if (tipoPago === 'credito' && !fechaVencimiento) { alert('Debes indicar la fecha de vencimiento.'); return }
    setProcesando(true)
    try {
      const facturasSnap = await getDocs(collection(db, 'facturas'))
      const numeroDte = `${tipoDte}-${String(facturasSnap.size + 1).padStart(6, '0')}`
      const estadoPago = tipoPago === 'contado' ? 'pagada' : 'pendiente'

      await runTransaction(db, async (transaction) => {
        const snapshots = []
        for (const item of carrito) {
          const prodRef = doc(db, 'productos', item.id)
          const prodSnap = await transaction.get(prodRef)
          if (!prodSnap.exists()) throw new Error(`Producto "${item.nombre}" no encontrado`)
          const stockActual = prodSnap.data().stock
          if (stockActual < item.qty) throw new Error(`Stock insuficiente para "${item.nombre}". Disponible: ${stockActual}`)
          snapshots.push({ ref: prodRef, nuevoStock: stockActual - item.qty })
        }
        const ventaRef = doc(collection(db, 'ventas'))
        transaction.set(ventaRef, {
          cliente: clienteNombre || 'Consumidor Final', tipoDte, numeroDte, tipoPago,
          cajero: userName || '', cajeroId: userId || '',
          items: carrito.map(c => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, precioBase: c.precio, precioConIva: precioConIva(c.precio), qty: c.qty, subtotal: c.precio * c.qty })),
          subtotal, iva: ivaTotal, total, estado: 'completada', createdAt: serverTimestamp()
        })
        const facturaRef = doc(collection(db, 'facturas'))
        transaction.set(facturaRef, {
          tipoDte, numero: numeroDte, cliente: clienteNombre || 'Consumidor Final',
          nit: nit || '', nrc: nrc || '',
          descripcion: `Venta de ${carrito.length} producto(s)`,
          items: carrito.map(c => ({ nombre: c.nombre, qty: c.qty, precioBase: c.precio, subtotal: c.precio * c.qty })),
          subtotal, iva: ivaTotal, total, estadoPago,
          fechaEmision: new Date().toISOString().slice(0, 10),
          fechaVencimiento: tipoPago === 'credito' ? fechaVencimiento : '',
          tipoPago, notas: tipoPago === 'credito' ? `Crédito — vence ${fechaVencimiento}` : '',
          origenVenta: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        })
        for (const { ref, nuevoStock } of snapshots) {
          transaction.update(ref, { stock: nuevoStock })
        }
      })

      setVentaFinalizada({ carrito: [...carrito], cliente: clienteNombre || 'Consumidor Final', tipoDte, numeroDte, tipoPago, fechaVencimiento, subtotal, ivaTotal, total, nit, nrc })
      setCarrito([]); setClienteNombre(''); setNit(''); setNrc(''); setFechaVencimiento('')
      setVistaMovil('productos')
      setPantalla('ticket')
    } catch (e) { alert('Error: ' + e.message) }
    setProcesando(false)
  }

  const nuevaVenta = () => {
    setPantalla('venta'); setVentaFinalizada(null)
    setTipoDte('FE'); setTipoPago('contado')
    setClienteSeleccionado(null); setBusquedaCliente('')
    setBusqueda(''); setInnerTab('productos'); setVistaMovil('productos')
  }

  const formatFecha = (ts) => {
    if (!ts) return '—'
    const d = new Date(ts.seconds * 1000)
    return d.toLocaleDateString('es-SV') + ' ' + d.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })
  }

  const tipoInfo = TIPOS_DTE.find(t => t.codigo === tipoDte)

  // ── PANTALLA DTE ──
  if (pantalla === 'dte') return (
    <>
      <style>{pvStyles}</style>
      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">🧾 Emitir DTE</div>
          <div className="page-sub">Completa los datos del documento</div>
        </div>
        <button className="btn btn-ghost" onClick={() => setPantalla('venta')}>← Volver</button>
      </div>
      <div className="dte-screen">
        <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 22, marginBottom: 20, boxShadow: '0 4px 20px var(--shadow2)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>📋 Resumen</div>
          {carrito.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8, gap: 12 }}>
              <span style={{ color: 'var(--text2)' }}>{c.qty}x {c.nombre}</span>
              <span className="amount">{fmt(precioConIva(c.precio) * c.qty)}</span>
            </div>
          ))}
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }}><span>IVA 13%</span><span>{fmt(ivaTotal)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 800, marginTop: 10, letterSpacing: '-0.5px' }}>
            <span>TOTAL</span><span className="amount" style={{ color: 'var(--accent)' }}>{fmt(total)}</span>
          </div>
        </div>

        <div className="section-title">1️⃣ Tipo de Documento</div>
        <div className="dte-tipo-grid">
          {TIPOS_DTE.map(t => (
            <div key={t.codigo} className={`dte-tipo-btn ${tipoDte === t.codigo ? 'selected' : ''}`}
              style={{ '--btn-color': t.color }}
              onClick={() => setTipoDte(t.codigo)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = t.color }}
              onMouseLeave={e => { if (tipoDte !== t.codigo) e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <div className="dte-tipo-icon">{t.icon}</div>
              <div className="dte-tipo-code" style={{ color: t.color }}>{t.codigo}</div>
              <div className="dte-tipo-name">{t.nombre}</div>
              <div className="dte-tipo-desc">{t.desc}</div>
            </div>
          ))}
        </div>

        <div className="section-title">2️⃣ Forma de Pago</div>
        <div className="pago-grid">
          <div className={`pago-btn ${tipoPago === 'contado' ? 'selected-contado' : ''}`} onClick={() => setTipoPago('contado')}>
            <div className="pago-icon">💵</div>
            <div className="pago-label" style={{ color: tipoPago === 'contado' ? '#00d4aa' : 'var(--text)' }}>Contado</div>
            <div className="pago-desc">Paga ahora</div>
          </div>
          <div className={`pago-btn ${tipoPago === 'credito' ? 'selected-credito' : ''}`} onClick={() => setTipoPago('credito')}>
            <div className="pago-icon">📅</div>
            <div className="pago-label" style={{ color: tipoPago === 'credito' ? '#f59e0b' : 'var(--text)' }}>Crédito</div>
            <div className="pago-desc">Paga después</div>
          </div>
        </div>

        {tipoPago === 'credito' && (
          <div style={{ marginBottom: 18, padding: '16px', background: 'rgba(245,158,11,0.06)', border: '1.5px solid rgba(245,158,11,0.25)', borderRadius: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>
              📅 FECHA DE VENCIMIENTO <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input className="input" type="date" value={fechaVencimiento} min={new Date().toISOString().slice(0, 10)} onChange={e => setFechaVencimiento(e.target.value)} />
          </div>
        )}

        <div className="section-title">3️⃣ Datos del Cliente</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
          <div className="form-group">
            <label className="form-label">NOMBRE / RAZÓN SOCIAL</label>
            {clienteSeleccionado ? (
              <div className="cliente-seleccionado">
                <div>
                  <div className="cliente-sel-nombre">👤 {clienteSeleccionado.nombre}</div>
                  <div className="cliente-sel-detalle">
                    {clienteSeleccionado.nit && `NIT: ${clienteSeleccionado.nit}`}
                    {clienteSeleccionado.nit && clienteSeleccionado.nrc && ' · '}
                    {clienteSeleccionado.nrc && `NRC: ${clienteSeleccionado.nrc}`}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                  onClick={() => { setClienteSeleccionado(null); setClienteNombre(''); setBusquedaCliente(''); setNit(''); setNrc('') }}>
                  ✕ Cambiar
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input className="input"
                  placeholder="🔍 Buscar cliente o escribir nombre..."
                  value={busquedaCliente}
                  onChange={e => { setBusquedaCliente(e.target.value); setClienteNombre(e.target.value); setMostrarDropdown(true) }}
                  onFocus={() => setMostrarDropdown(true)}
                  onBlur={() => setTimeout(() => setMostrarDropdown(false), 200)}
                />
                {mostrarDropdown && busquedaCliente.length > 0 && (
                  <div className="cliente-dropdown">
                    {clientes.filter(c =>
                      c.nombre?.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
                      c.nit?.includes(busquedaCliente) ||
                      c.nrc?.includes(busquedaCliente)
                    ).slice(0, 6).map(c => (
                      <div key={c.id} className="cliente-option"
                        onMouseDown={() => {
                          setClienteSeleccionado(c)
                          setClienteNombre(c.nombre)
                          setNit(c.nit || '')
                          setNrc(c.nrc || '')
                          setBusquedaCliente(c.nombre)
                          setMostrarDropdown(false)
                        }}>
                        <div className="cliente-option-nombre">👤 {c.nombre}</div>
                        <div className="cliente-option-detalle">
                          {c.nit && `NIT: ${c.nit}`}{c.nit && c.nrc && ' · '}{c.nrc && `NRC: ${c.nrc}`}
                          {c.telefono && ` · 📞 ${c.telefono}`}
                        </div>
                      </div>
                    ))}
                    {clientes.filter(c =>
                      c.nombre?.toLowerCase().includes(busquedaCliente.toLowerCase())
                    ).length === 0 && (
                      <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
                        No encontrado — se usará como nombre libre
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">NIT</label>
              <input className="input" placeholder="0614-010190-101-3" value={nit} onChange={e => setNit(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">NRC {tipoDte === 'CCF' && <span style={{ color: 'var(--danger)' }}>*</span>}</label>
              <input className="input" placeholder={tipoDte === 'CCF' ? 'Requerido' : 'Opcional'} value={nrc} onChange={e => setNrc(e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 18px', borderRadius: 12, marginBottom: 22, background: tipoInfo.color + '10', border: `1.5px solid ${tipoInfo.color}30`, fontSize: 13 }}>
          <strong style={{ color: tipoInfo.color }}>{tipoInfo.codigo}:</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>{tipoDte === 'FE' ? 'Para consumidores finales. IVA incluido.' : 'Para empresas con NRC. IVA desglosado.'}</span>
        </div>

        <button className="btn-cobrar" onClick={procesarVenta} disabled={procesando}>
          {procesando ? '⏳ Procesando...' : `🧾 Emitir ${tipoDte} — ${tipoPago === 'contado' ? 'Cobrar ahora' : 'A crédito'}`}
        </button>
      </div>
    </>
  )

  // ── TICKET ──
  if (pantalla === 'ticket' && ventaFinalizada) {
 return <TicketImpresion ventaFinalizada={ventaFinalizada} onNuevaVenta={nuevaVenta} />
  }
  // ── PUNTO DE VENTA PRINCIPAL ──
  return (
    <>
      <style>{pvStyles}</style>

      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">🛒 Punto de Venta</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {ventas.length} ventas
            <span className="firebase-badge">🔥 Firebase</span>
          </div>
        </div>
      </div>

      {/* ── TABS MÓVIL ── */}
      <div className="pv-tabs-mobile">
        <button
          className={`pv-tab ${vistaMovil === 'productos' ? 'active' : ''}`}
          onClick={() => setVistaMovil('productos')}
        >
          📦 Productos
        </button>
        <button
          className={`pv-tab ${vistaMovil === 'carrito' ? 'active' : ''}`}
          onClick={() => setVistaMovil('carrito')}
        >
          🛒 Carrito
          {carrito.length > 0 && <span className="pv-tab-badge">{carrito.length}</span>}
        </button>
      </div>

      <div className="pv-layout">

        {/* ── PANEL PRODUCTOS ── */}
        <div className={`pv-panel-productos ${vistaMovil === 'productos' ? 'activo' : ''}`}>
          <div className="card">
            <div className="inner-tabs">
              <button className={`inner-tab ${innerTab === 'productos' ? 'active' : ''}`} onClick={() => setInnerTab('productos')}>📦 Productos</button>
              <button className={`inner-tab ${innerTab === 'historial' ? 'active' : ''}`} onClick={() => setInnerTab('historial')}>📋 Historial ({ventas.length})</button>
            </div>

            {innerTab === 'productos' && (
              <>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(0,212,170,0.04)', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  💡 <strong style={{ color: 'var(--muted)' }}>sin IVA</strong> → <strong style={{ color: 'var(--accent)' }}>con IVA</strong>
                </div>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <input className="input" placeholder="🔍 Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                </div>
                {loadingProds ? (
                  <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">Cargando...</div></div>
                ) : filtrados.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon">📦</div><div className="empty-text">No hay productos.</div></div>
                ) : (
                  <div className="producto-grid">
                    {filtrados.map(p => {
                      const agotado = p.stock <= 0
                      const bajo = p.stock > 0 && p.stock < p.min
                      return (
                        <div key={p.id} className={`producto-card ${agotado ? 'agotado' : ''}`}
                          onClick={() => { agregar(p); setVistaMovil('carrito') }}
                        >
                          {agotado && <span className="agotado-badge">AGOTADO</span>}
                          <div className="prod-nombre">{p.nombre}</div>
                          <div className="prod-precios">
                            <div className="prod-precio-base">Sin IVA: ${p.precio?.toFixed(2)}</div>
                            <div className="prod-precio-iva">${precioConIva(p.precio).toFixed(2)}<span className="prod-iva-badge">+IVA</span></div>
                          </div>
                          <div className={`prod-stock ${agotado ? 'out' : bajo ? 'low' : 'ok'}`}>📦 {p.stock} {p.unidad}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {innerTab === 'historial' && (
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {ventas.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon">📋</div><div className="empty-text">Sin ventas aún</div></div>
                ) : ventas.map(v => (
                  <div key={v.id} className="historial-item">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {v.cliente}
                        {v.tipoDte && <span style={{ fontSize: 10, fontWeight: 800, fontFamily: 'var(--mono)', background: 'rgba(79,140,255,0.12)', color: 'var(--accent2)', padding: '1px 7px', borderRadius: 4 }}>{v.tipoDte}</span>}
                        {v.tipoPago === 'credito' && <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', padding: '1px 7px', borderRadius: 4 }}>CRÉDITO</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{v.items?.length} producto(s) · {formatFecha(v.createdAt)}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.items?.map(i => `${i.qty}x ${i.nombre}`).join(', ')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="amount" style={{ fontSize: 15 }}>{fmt(v.total)}</div>
                      <span className="status-pill completada" style={{ marginTop: 4, display: 'inline-flex', fontSize: 11 }}>
                        <span className="dot" />Completada
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── PANEL CARRITO ── */}
        <div className={`pv-panel-carrito ${vistaMovil === 'carrito' ? 'activo' : ''}`}>
          <div className="carrito-wrap">
            <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div className="carrito-header-inner">
                <div className="carrito-title">
                  🛒 Carrito
                  <span className="carrito-count">{carrito.length}</span>
                </div>
                {carrito.length > 0 && puede('cancelar_ventas') && (
                  <button className="btn btn-danger btn-sm" onClick={() => setCarrito([])}>🗑️ Limpiar</button>
                )}
              </div>

              <div className="carrito-cliente">
                {clienteSeleccionado ? (
                  <div className="cliente-seleccionado">
                    <div>
                      <div className="cliente-sel-nombre">👤 {clienteSeleccionado.nombre}</div>
                      <div className="cliente-sel-detalle">
                        {clienteSeleccionado.nit && `NIT: ${clienteSeleccionado.nit}`}
                        {clienteSeleccionado.nit && clienteSeleccionado.nrc && ' · '}
                        {clienteSeleccionado.nrc && `NRC: ${clienteSeleccionado.nrc}`}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                      onClick={() => { setClienteSeleccionado(null); setClienteNombre(''); setBusquedaCliente(''); setNit(''); setNrc('') }}>
                      ✕ Cambiar
                    </button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input className="input"
                      placeholder="👤 Buscar cliente o escribir nombre..."
                      value={busquedaCliente}
                      onChange={e => { setBusquedaCliente(e.target.value); setClienteNombre(e.target.value); setMostrarDropdown(true) }}
                      onFocus={() => setMostrarDropdown(true)}
                      onBlur={() => setTimeout(() => setMostrarDropdown(false), 200)}
                    />
                    {mostrarDropdown && busquedaCliente.length > 0 && (
                      <div className="cliente-dropdown">
                        {clientes.filter(c =>
                          c.nombre?.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
                          c.nit?.includes(busquedaCliente) ||
                          c.nrc?.includes(busquedaCliente)
                        ).slice(0, 6).map(c => (
                          <div key={c.id} className="cliente-option"
                            onMouseDown={() => {
                              setClienteSeleccionado(c)
                              setClienteNombre(c.nombre)
                              setNit(c.nit || '')
                              setNrc(c.nrc || '')
                              setBusquedaCliente(c.nombre)
                              setMostrarDropdown(false)
                            }}>
                            <div className="cliente-option-nombre">👤 {c.nombre}</div>
                            <div className="cliente-option-detalle">
                              {c.nit && `NIT: ${c.nit}`}{c.nit && c.nrc && ' · '}{c.nrc && `NRC: ${c.nrc}`}
                              {c.telefono && ` · 📞 ${c.telefono}`}
                            </div>
                          </div>
                        ))}
                        {clientes.filter(c =>
                          c.nombre?.toLowerCase().includes(busquedaCliente.toLowerCase())
                        ).length === 0 && (
                          <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
                            No encontrado — se usará como nombre libre
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="carrito-items">
                {carrito.length === 0 ? (
                  <div className="carrito-empty">
                    <div className="carrito-empty-icon">🛒</div>
                    <div className="carrito-empty-text">
                      El carrito está vacío<br />
                      <span style={{ fontSize: 12 }}>Selecciona productos de la pestaña Productos</span>
                    </div>
                  </div>
                ) : carrito.map(c => (
                  <div key={c.carritoId || c.id} className="carrito-item">
                    {/* Fila 1: nombre + badge */}
                    <div className="ci-top">
                      <div className="ci-info">
                        <div className="ci-nombre">
                          {c.nombre}
                          {c.unidad && <span style={{ fontSize: 10, color: 'var(--accent2)', fontWeight: 700, marginLeft: 6, background: 'rgba(74,143,232,0.1)', padding: '2px 7px', borderRadius: 4 }}>{c.unidad}</span>}
                          {c.descuento > 0 && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, marginLeft: 4, background: 'rgba(245,158,11,0.1)', padding: '2px 7px', borderRadius: 4 }}>-{c.descuento}%</span>}
                        </div>
                        <div className="ci-precio-iva">${precioConIva(c.precio).toFixed(2)} c/IVA</div>
                      </div>
                    </div>
                    {/* Fila 2: desc + qty + eliminar + total — todo en una línea */}
                    <div className="ci-bottom-row">
                      {puede('aplicar_descuentos') && (
                        <input
                          className="ci-desc-input"
                          type="number" min="0" max="100"
                          placeholder="Desc%"
                          title="Descuento %"
                          value={c.descuento || ''}
                          onChange={e => {
                            const desc = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0))
                            setCarrito(cart => cart.map(item =>
                              (item.carritoId || item.id) === (c.carritoId || c.id)
                                ? { ...item, descuento: desc, precio: (item.precioOriginal || item.precio) * (1 - desc/100) }
                                : item
                            ))
                          }}
                          onClick={() => {
                            if (!c.precioOriginal) {
                              setCarrito(cart => cart.map(item =>
                                (item.carritoId || item.id) === (c.carritoId || c.id)
                                  ? { ...item, precioOriginal: item.precio }
                                  : item
                              ))
                            }
                          }}
                        />
                      )}
                      <div className="ci-qty">
                        <button className="qty-btn" onClick={() => cambiarQty(c.carritoId || c.id, -1)}>−</button>
                        <input
                          className="ci-qty-input"
                          type="number" min="1"
                          value={c.qty}
                          onChange={e => {
                            const val = Math.max(1, parseInt(e.target.value) || 1)
                            const prod = productos.find(p => p.id === c.id)
                            const max = prod?.stock || 9999
                            setCarrito(cart => cart.map(item =>
                              (item.carritoId || item.id) === (c.carritoId || c.id)
                                ? { ...item, qty: Math.min(val, max) }
                                : item
                            ))
                          }}
                        />
                        <button className="qty-btn" onClick={() => cambiarQty(c.carritoId || c.id, 1)}>+</button>
                      </div>
                      <button className="qty-btn" style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)', fontSize: 13 }}
                        onClick={() => setCarrito(cart => cart.filter(item => (item.carritoId || item.id) !== (c.carritoId || c.id)))}>
                        ✕
                      </button>
                      <div className="ci-total">{fmt(precioConIva(c.precio) * c.qty)}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="total-box">
                <div className="total-row"><span>Subtotal (sin IVA)</span><span className="amount">{fmt(subtotal)}</span></div>
                <div className="total-row"><span>IVA (13%)</span><span className="amount">{fmt(ivaTotal)}</span></div>
                <div className="total-row final">
                  <span>TOTAL</span>
                  <span className="amount" style={{ color: 'var(--accent)' }}>{fmt(total)}</span>
                </div>
                {requerirCaja && !cajaAbierta ? (
                <div style={{
                  marginTop: 16, padding: '14px 16px', borderRadius: 14,
                  background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.25)',
                  textAlign: 'center', fontSize: 13,
                }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>🔒</div>
                  <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Caja no abierta</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>Debes abrir tu caja antes de realizar ventas</div>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 10, width: '100%' }}
                    onClick={() => window.location.href = '/caja'}>
                    💰 Ir a Caja
                  </button>
                </div>
              ) : (
                <button className="btn-cobrar" onClick={irADte} disabled={carrito.length === 0}>
                  🧾 Cobrar y Emitir DTE
                </button>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL SELECCIÓN DE UNIDAD ── */}
      {modalUnidad && (
        <div className="modal-overlay" onClick={() => setModalUnidad(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">📦 Seleccionar Unidad</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              <strong style={{ color: 'var(--text)' }}>{modalUnidad.nombre}</strong><br/>
              Stock disponible: {modalUnidad.stock} {modalUnidad.unidad}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Unidad principal */}
              <div
                onClick={() => { agregar(modalUnidad, { nombre: modalUnidad.unidad, factor: 1, precio: modalUnidad.precio }); setModalUnidad(null); setVistaMovil('carrito') }}
                style={{ padding: '14px 16px', borderRadius: 12, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--surface2)', transition: 'all 0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{modalUnidad.unidad}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Unidad principal</div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 15 }}>
                  ${(modalUnidad.precio * 1.13).toFixed(2)}
                </div>
              </div>
              {/* Unidades adicionales */}
              {(modalUnidad.unidadesAdicionales || []).map((u, i) => (
                <div key={i}
                  onClick={() => { agregar(modalUnidad, u); setModalUnidad(null); setVistaMovil('carrito') }}
                  style={{ padding: '14px 16px', borderRadius: 12, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--surface2)', transition: 'all 0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent2)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{u.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>= {u.factor} {modalUnidad.unidad}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent2)', fontSize: 15 }}>
                    ${u.precio ? (parseFloat(u.precio) * 1.13).toFixed(2) : (modalUnidad.precio * u.factor * 1.13).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalUnidad(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}