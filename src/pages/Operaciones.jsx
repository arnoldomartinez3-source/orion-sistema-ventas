// ════════════════════════════════════════════════════════════════════
// OPERACIONES — Módulo para emitir DTE que NO son ventas directas:
//   • NR (Nota de Remisión): traslado de mercadería antes de facturar
//   • FSE (Factura Sujeto Excluido): compras a personas sin NIT/NRC
//
// UI estilo Punto de Venta: split 50/50 con catálogo/formulario a la
// izquierda y "carrito" a la derecha con resumen y botón de emisión.
//
// Backend: ambas operaciones usan /api/dte/transmitir con operacionId.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react'
import { db } from '../firebase'
import {
  collection, onSnapshot, doc, addDoc,
  serverTimestamp, runTransaction, query, orderBy, getDoc, where
} from 'firebase/firestore'
import { useAuth } from '../AuthContext'
import { usePermisos } from '../PermisosContext'
import BuscadorActividad from '../components/BuscadorActividad'
import SelectorDepartamento from '../components/SelectorDepartamento'
import { buildComplemento } from '../data/departamentosMunicipios'

// ── HELPERS ──────────────────────────────────────────────────────
const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2)}`
const limpiarDoc = (v) => (v || '').replace(/[-\s]/g, '').trim()
const esDUIValido = (d) => /^\d{9}$/.test(limpiarDoc(d))

// CAT-014 — Tipos de traslado para NR
const TIPOS_TRASLADO_NR = [
  { value: '01', label: 'Traslado entre sucursales del mismo contribuyente' },
  { value: '02', label: 'Donación' },
  { value: '03', label: 'Venta a cuenta' },
  { value: '04', label: 'Importación' },
  { value: '05', label: 'Exportación' },
  { value: '06', label: 'Consignación' },
  { value: '07', label: 'Para depósito' },
  { value: '08', label: 'Otros' },
]

// CAT-025 — Título por el que se trasladan los bienes
const BIEN_TITULOS_NR = [
  { value: '01', label: 'Por compra' },
  { value: '02', label: 'Propio' },
  { value: '03', label: 'Otros' },
]

// ════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL — controla las sub-pestañas y carga datos comunes
// ════════════════════════════════════════════════════════════════════
export default function Operaciones() {
  const { user } = useAuth()
  const { puede, empresaId, esAdmin, rol, userId, userName } = usePermisos()

  // Vista actual: 'lista' (tabla) o 'nueva-NR' o 'nueva-FSE' (formulario POS-like)
  const [vista, setVista] = useState('lista')
  const [tabActiva, setTabActiva] = useState('NR')

  // ── Datos comunes ──
  const [empresa, setEmpresa] = useState({})
  const [productos, setProductos] = useState([])
  const [clientes, setClientes] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [operaciones, setOperaciones] = useState([])
  const [loading, setLoading] = useState(true)

  const [alerta, setAlerta] = useState(null)

  // ── CARGA INICIAL ──
  useEffect(() => {
    if (!empresaId) return
    let cancelado = false
    async function cargarConfig() {
      try {
        const snap = await getDoc(doc(db, 'configuracion', empresaId))
        if (snap.exists() && !cancelado) setEmpresa(snap.data())
      } catch (e) { console.warn('No se pudo cargar config:', e) }
    }
    cargarConfig()
    return () => { cancelado = true }
  }, [empresaId])

  useEffect(() => {
    if (!empresaId) return // esperar empresaId del usuario
    const unsubP = onSnapshot(query(collection(db, 'productos'), where('empresaId', '==', empresaId)), s => {
      setProductos(s.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    const unsubC = onSnapshot(query(collection(db, 'clientes'), where('empresaId', '==', empresaId)), s => {
      setClientes(s.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    const unsubProv = onSnapshot(query(collection(db, 'proveedores'), where('empresaId', '==', empresaId)), s => {
      setProveedores(s.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    // Cajero/vendedor solo ven SUS operaciones; admin y otros roles, todas.
    // (Para el cajero, 2 filtros == sin orderBy para no requerir índice compuesto;
    // se ordena en cliente.)
    const soloPropias = !esAdmin && (rol === 'cajero' || rol === 'vendedor')
    const qOp = soloPropias
      ? query(collection(db, 'operaciones'), where('empresaId', '==', empresaId), where('cajeroId', '==', userId))
      : query(collection(db, 'operaciones'), where('empresaId', '==', empresaId), orderBy('createdAt', 'desc'))
    const unsubOp = onSnapshot(qOp, s => {
      const data = s.docs.map(d => ({ id: d.id, ...d.data() }))
      if (soloPropias) data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setOperaciones(data)
      setLoading(false)
    })
    return () => { unsubP(); unsubC(); unsubProv(); unsubOp() }
  }, [empresaId, esAdmin, rol, userId])

  const operacionesActuales = operaciones.filter(op => op.tipoDte === tabActiva)

  // Si está en una vista de "Nueva", mostramos solo el formulario fullscreen
  if (vista === 'nueva-NR') {
    return (
      <>
        <NuevaNR
          productos={productos}
          clientes={clientes}
          empresa={empresa}
          user={user}
          puede={puede}
          empresaId={empresaId}
          setAlerta={setAlerta}
          volver={() => setVista('lista')}
        />
        <ModalAlerta alerta={alerta} cerrar={() => setAlerta(null)} />
      </>
    )
  }

  if (vista === 'nueva-FSE') {
    return (
      <>
        <NuevaFSE
          proveedores={proveedores}
          empresa={empresa}
          user={user}
          puede={puede}
          empresaId={empresaId}
          setAlerta={setAlerta}
          volver={() => setVista('lista')}
        />
        <ModalAlerta alerta={alerta} cerrar={() => setAlerta(null)} />
      </>
    )
  }

  // Vista por defecto: lista
  return (
    <>
      <style>{stylesGenerales}</style>

      <div className="op-topbar">
        <div>
          <div className="page-title">📋 Operaciones</div>
          <div className="page-sub" style={{ marginTop: 4 }}>
            DTE que no son ventas directas: traslados de mercadería y compras a sujetos excluidos
          </div>
        </div>
      </div>

      <div style={{ paddingLeft: 50, paddingRight: 24 }}>
        {/* Sub-tabs NR / FSE */}
        <div className="op-tabs">
          <button
            className={`op-tab ${tabActiva === 'NR' ? 'active' : ''}`}
            onClick={() => setTabActiva('NR')}
          >
            🚚 Notas de Remisión
          </button>
          <button
            className={`op-tab ${tabActiva === 'FSE' ? 'active' : ''}`}
            onClick={() => setTabActiva('FSE')}
          >
            💰 Facturas Sujeto Excluido
          </button>
        </div>

        {tabActiva === 'NR' && (
          <div className="op-info-banner">
            <strong>🚚 Nota de Remisión:</strong> documento para trasladar mercadería antes de facturar.
            No afecta IVA todavía. Cuando se cobre, la FE/CCF debe referenciar esta NR.
          </div>
        )}
        {tabActiva === 'FSE' && (
          <div className="op-info-banner">
            <strong>💰 Factura Sujeto Excluido:</strong> documento que <em>vos emitís</em> al
            comprarle a alguien sin NIT/NRC (agricultor, freelancer, etc.). Te sirve para deducir el gasto.
          </div>
        )}

        {/* Botón principal de acción */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, marginBottom: 14 }}>
          {puede('crear_facturas') && (
            <button
              className={`btn-nueva-op ${tabActiva === 'NR' ? 'btn-nueva-nr' : 'btn-nueva-fse'}`}
              onClick={() => setVista(`nueva-${tabActiva}`)}
            >
              <span className="btn-nueva-op-icono">{tabActiva === 'NR' ? '🚚' : '💰'}</span>
              <span>
                <span className="btn-nueva-op-titulo">
                  Nueva {tabActiva === 'NR' ? 'Nota de Remisión' : 'Factura Sujeto Excluido'}
                </span>
                <span className="btn-nueva-op-sub">
                  {tabActiva === 'NR' ? 'Traslado de mercadería' : 'Compra a persona sin NIT'}
                </span>
              </span>
              <span className="btn-nueva-op-plus">+</span>
            </button>
          )}
        </div>

        {/* Tabla */}
        <TablaOperaciones
          tipo={tabActiva}
          operaciones={operacionesActuales}
          loading={loading}
        />
      </div>

      <ModalAlerta alerta={alerta} cerrar={() => setAlerta(null)} />
    </>
  )
}

// ════════════════════════════════════════════════════════════════════
// TABLA DE OPERACIONES — vista del historial
// ════════════════════════════════════════════════════════════════════
function TablaOperaciones({ tipo, operaciones, loading }) {
  if (loading) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
        🔄 Cargando operaciones...
      </div>
    )
  }
  if (operaciones.length === 0) {
    return (
      <div className="card">
        <div className="op-vacio">
          <div className="op-vacio-icono">{tipo === 'NR' ? '🚚' : '💰'}</div>
          <div className="op-vacio-titulo">
            No hay {tipo === 'NR' ? 'Notas de Remisión' : 'Facturas Sujeto Excluido'} emitidas
          </div>
          <div className="op-vacio-sub">
            Tocá el botón de arriba para emitir la primera.
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="card">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>FECHA</th>
              <th>N° CONTROL</th>
              <th>{tipo === 'NR' ? 'RECEPTOR' : 'PROVEEDOR'}</th>
              <th>{tipo === 'NR' ? 'NIT/DUI' : 'DUI'}</th>
              <th>{tipo === 'NR' ? 'TIPO TRASLADO' : 'DESCRIPCIÓN'}</th>
              <th>{tipo === 'NR' ? 'VALOR' : 'MONTO'}</th>
              {tipo === 'FSE' && <th>RET. RENTA</th>}
              <th>ESTADO MH</th>
            </tr>
          </thead>
          <tbody>
            {operaciones.map(op => {
              const traslado = tipo === 'NR' ? TIPOS_TRASLADO_NR.find(t => t.value === op.tipoTraslado) : null
              const estado = op.dte_estado || 'PENDIENTE'
              const cfg = estado === 'PROCESADO' ? { bg: 'rgba(0,184,148,0.15)', color: '#00b894', text: '✓ Procesado' }
                        : estado === 'RECHAZADO' ? { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', text: '✕ Rechazado' }
                        : { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', text: '⏱ Pendiente' }
              const desc = tipo === 'FSE'
                ? (op.items?.[0]?.nombre || '—')
                : (traslado?.label.slice(0, 30) || op.tipoTraslado || '—')
              return (
                <tr key={op.id}>
                  <td style={{ fontSize: 12 }}>
                    {op.createdAt?.seconds
                      ? new Date(op.createdAt.seconds * 1000).toLocaleDateString('es-SV')
                      : '—'}
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>{op.numeroControl}</td>
                  <td style={{ fontWeight: 500 }}>{op.cliente}</td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {op.nit || op.dui || '—'}
                  </td>
                  <td style={{ fontSize: 12 }}>{desc.length > 40 ? desc.slice(0, 40) + '...' : desc}</td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(op.total)}</td>
                  {tipo === 'FSE' && (
                    <td style={{ fontFamily: 'var(--mono)', color: op.reteRenta > 0 ? '#f59e0b' : 'var(--muted)' }}>
                      {op.reteRenta > 0 ? fmt(op.reteRenta) : '—'}
                    </td>
                  )}
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px', borderRadius: 6,
                      background: cfg.bg, color: cfg.color,
                      fontSize: 10, fontWeight: 700,
                    }}>{cfg.text}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// NUEVA NR — Vista estilo POS (catálogo izquierda + carrito derecha)
// ════════════════════════════════════════════════════════════════════
function NuevaNR({ productos, clientes, empresa, user, puede, setAlerta, volver, empresaId }) {
  const [carrito, setCarrito] = useState([])
  const [clienteSel, setClienteSel] = useState(null)
  const [busquedaProd, setBusquedaProd] = useState('')
  const [busquedaCli, setBusquedaCli] = useState('')
  const [tipoTraslado, setTipoTraslado] = useState('03')
  const [bienTitulo, setBienTitulo] = useState('02')
  const [observaciones, setObservaciones] = useState('')
  const [codActividadNR, setCodActividadNR] = useState('')
  const [descActividadNR, setDescActividadNR] = useState('')
  const [transmitiendo, setTransmitiendo] = useState(false)
  const [mostrarBuscadorCliente, setMostrarBuscadorCliente] = useState(false)
  const [tabMovil, setTabMovil] = useState('catalogo') // 'catalogo' | 'carrito'

  // Productos filtrados
  const productosFiltrados = useMemo(() => {
    if (!busquedaProd.trim()) return productos.slice(0, 12)
    const q = busquedaProd.toLowerCase()
    return productos.filter(p =>
      p.nombre?.toLowerCase().includes(q) ||
      p.codigo?.toLowerCase().includes(q)
    ).slice(0, 24)
  }, [productos, busquedaProd])

  const clientesFiltrados = useMemo(() => {
    if (!busquedaCli.trim()) return clientes.slice(0, 8)
    const q = busquedaCli.toLowerCase()
    return clientes.filter(c =>
      c.nombre?.toLowerCase().includes(q) ||
      c.nit?.includes(busquedaCli) ||
      c.dui?.includes(busquedaCli)
    ).slice(0, 8)
  }, [clientes, busquedaCli])

  const agregarProducto = (p) => {
    const yaEsta = carrito.find(c => c.id === p.id)
    if (yaEsta) {
      setCarrito(c => c.map(it => it.id === p.id ? { ...it, qty: it.qty + 1 } : it))
    } else {
      setCarrito(c => [...c, {
        id: p.id, codigo: p.codigo, nombre: p.nombre,
        qty: 1, precio: p.precio || 0
      }])
    }
  }

  const removerProducto = (id) => setCarrito(c => c.filter(it => it.id !== id))
  const cambiarQty = (id, qty) => setCarrito(c => c.map(it =>
    it.id === id ? { ...it, qty: Math.max(1, parseFloat(qty) || 1) } : it
  ))

  const seleccionarCliente = (c) => {
    setClienteSel(c)
    if (c.codActividad && c.descActividad) {
      setCodActividadNR(c.codActividad)
      setDescActividadNR(c.descActividad)
    }
    setMostrarBuscadorCliente(false)
    setBusquedaCli('')
  }

  const totalNR = carrito.reduce((s, it) => s + (it.precio * it.qty), 0)

  // ── EMITIR NR ──
  const emitirNR = async () => {
    if (carrito.length === 0) {
      setAlerta({ titulo: 'Sin productos', mensaje: 'Agregá al menos un producto al carrito.', tipo: 'error' })
      return
    }
    if (!clienteSel) {
      setAlerta({ titulo: 'Sin receptor', mensaje: 'Seleccioná el cliente receptor de la mercadería.', tipo: 'error' })
      return
    }
    if (!codActividadNR || !descActividadNR) {
      setAlerta({ titulo: 'Falta actividad económica', mensaje: 'El MH exige la actividad económica del receptor.', tipo: 'error' })
      return
    }

    setTransmitiendo(true)
    try {
      const configSnap = await getDoc(doc(db, 'configuracion', empresaId))
      if (!configSnap.exists()) throw new Error('No hay documento de configuración en Firestore.')
      const configDocId = configSnap.id

      const codigoGeneracion = crypto.randomUUID().toUpperCase()
      let numeroDte = ''
      let operacionId = ''

      await runTransaction(db, async (tx) => {
        const configRef = doc(db, 'configuracion', configDocId)
        const configSnap = await tx.get(configRef)
        if (!configSnap.exists()) throw new Error('Documento de configuración no encontrado')
        const config = configSnap.data()

        const correlativoActual = parseInt(config.correlativo_NR || 0)
        const correlativoNuevo = correlativoActual + 1
        const numStr = String(correlativoNuevo).padStart(15, '0')
        const codEst = (config.codEstableMH || 'S001').padEnd(4, '0').slice(0, 4)
        const codPV  = (config.codPuntoVentaMH || 'P001').padEnd(4, '0').slice(0, 4)
        numeroDte = `DTE-04-${codEst}${codPV}-${numStr}`

        const opRef = doc(collection(db, 'operaciones'))
        operacionId = opRef.id

        tx.set(opRef, {
          tipoDte: 'NR',
          cajero: userName || '', cajeroId: userId || '',
          numero: numeroDte,
          numeroControl: numeroDte,
          codigoGeneracion,
          cliente: clienteSel.nombre,
          nit: clienteSel.nit || '',
          dui: clienteSel.dui || '',
          nrc: clienteSel.nrc || '',
          codActividad: codActividadNR,
          descActividad: descActividadNR,
          codDep: clienteSel.codDep || '',
          codMun: clienteSel.codMun || '',
          codDistrito: clienteSel.codDistrito || '',
          direccion: clienteSel.direccion || clienteSel.complemento || '',
          telefono: clienteSel.telefono || '',
          correo: clienteSel.email || '',
          tipoTraslado,
          bienTitulo,
          observaciones: observaciones.trim() || '',
          items: carrito.map(c => ({
            id: c.id, codigo: c.codigo, nombre: c.nombre,
            precioBase: c.precio, qty: c.qty,
            subtotal: c.precio * c.qty,
          })),
          subtotal: totalNR,
          total: totalNR,
          dte_estado: 'PENDIENTE',
          dte_ambiente: empresa.mh_ambiente || '00',
          emisor: { uid: user?.uid || '', nombre: user?.displayName || user?.email || '' },
          empresaId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        tx.update(configRef, { correlativo_NR: correlativoNuevo })
      })

      const resp = await fetch('/api/dte/transmitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operacionId, ventaId: operacionId, ambiente: empresa.mh_ambiente || '00' })
      })
      const data = await resp.json()

      if (data.estado === 'PROCESADO') {
        setAlerta({
          titulo: '✅ NR transmitida correctamente',
          mensaje: `Número: ${data.numeroControl || numeroDte}\nSello MH: ${data.selloRecibido?.slice(0, 20)}...`,
          tipo: 'exito'
        })
        setTimeout(() => volver(), 1500)
      } else if (data.estado === 'RECHAZADO') {
        const motivo = data.detalleMH?.descripcionMsg || data.observaciones?.join('\n') || 'Sin detalle'
        setAlerta({ titulo: '❌ MH rechazó la NR', mensaje: `Motivo: ${motivo}`, tipo: 'error' })
      } else {
        setAlerta({ titulo: '⚠️ NR pendiente', mensaje: 'No se obtuvo respuesta del MH. Quedó guardada para retransmitir.', tipo: 'error' })
      }
    } catch (e) {
      setAlerta({ titulo: 'Error al emitir NR', mensaje: e.message, tipo: 'error' })
    }
    setTransmitiendo(false)
  }

  return (
    <>
      <style>{stylesGenerales}</style>
      <style>{stylesPosLike}</style>

      {/* HEADER */}
      <div className="pos-op-header">
        <button className="pos-op-volver" onClick={volver}>← Volver</button>
        <div className="pos-op-titulo">
          <div className="pos-op-titulo-icono pos-op-titulo-nr">🚚</div>
          <div>
            <div className="pos-op-titulo-texto">Nueva Nota de Remisión</div>
            <div className="pos-op-titulo-sub">Traslado de mercadería · DTE tipo 04</div>
          </div>
        </div>
      </div>

      {/* TABS MÓVIL */}
      <div className="pos-op-tabs-movil">
        <button
          className={`pos-op-tab-movil ${tabMovil === 'catalogo' ? 'active' : ''}`}
          onClick={() => setTabMovil('catalogo')}
        >📦 Productos</button>
        <button
          className={`pos-op-tab-movil ${tabMovil === 'carrito' ? 'active' : ''}`}
          onClick={() => setTabMovil('carrito')}
        >
          📋 Carrito
          {carrito.length > 0 && <span className="pos-op-tab-badge">{carrito.length}</span>}
        </button>
      </div>

      {/* LAYOUT SPLIT */}
      <div className="pos-op-split">
        {/* IZQUIERDA: CATÁLOGO */}
        <div className={`pos-op-col pos-op-catalogo ${tabMovil === 'catalogo' ? 'tab-activo' : ''}`}>
          <div className="pos-op-buscador">
            <span className="pos-op-buscador-icono">🔍</span>
            <input
              type="text"
              className="pos-op-buscador-input"
              placeholder="Buscar producto por nombre o código..."
              value={busquedaProd}
              onChange={e => setBusquedaProd(e.target.value)}
              autoFocus
            />
          </div>

          <div className="pos-op-catalogo-scroll">
            {productosFiltrados.length === 0 ? (
              <div className="pos-op-vacio">
                <div style={{ fontSize: 36, opacity: 0.3 }}>📦</div>
                <div>No hay productos {busquedaProd ? `que coincidan con "${busquedaProd}"` : 'cargados'}</div>
              </div>
            ) : (
              <div className="pos-op-productos-grid">
                {productosFiltrados.map(p => {
                  const enCarrito = carrito.find(c => c.id === p.id)
                  return (
                    <div
                      key={p.id}
                      className={`pos-op-producto ${enCarrito ? 'en-carrito' : ''}`}
                      onClick={() => agregarProducto(p)}
                    >
                      {enCarrito && <div className="pos-op-producto-badge">{enCarrito.qty}</div>}
                      <div className="pos-op-producto-icono">📦</div>
                      <div className="pos-op-producto-nombre">{p.nombre}</div>
                      <div className="pos-op-producto-codigo">{p.codigo}</div>
                      <div className="pos-op-producto-precio">{fmt(p.precio)}</div>
                      <div className="pos-op-producto-stock">Stock: {p.stock || 0}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* DERECHA: CARRITO Y DATOS */}
        <div className={`pos-op-col pos-op-carrito ${tabMovil === 'carrito' ? 'tab-activo' : ''}`}>

          {/* RECEPTOR */}
          <div className="pos-op-receptor">
            {clienteSel ? (
              <div className="pos-op-receptor-card">
                <div className="pos-op-receptor-avatar">👤</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pos-op-receptor-nombre">{clienteSel.nombre}</div>
                  <div className="pos-op-receptor-datos">
                    {clienteSel.nit && `NIT ${clienteSel.nit}`}
                    {clienteSel.dui && !clienteSel.nit && `DUI ${clienteSel.dui}`}
                  </div>
                </div>
                <button className="pos-op-receptor-cambiar" onClick={() => { setClienteSel(null); setMostrarBuscadorCliente(true) }}>
                  Cambiar
                </button>
              </div>
            ) : (
              <button
                className="pos-op-receptor-selector"
                onClick={() => setMostrarBuscadorCliente(true)}
              >
                <span>👤</span>
                <span>Seleccionar receptor</span>
                <span style={{ marginLeft: 'auto' }}>›</span>
              </button>
            )}
          </div>

          {/* ITEMS DEL CARRITO */}
          <div className="pos-op-items">
            {carrito.length === 0 ? (
              <div className="pos-op-carrito-vacio">
                <div style={{ fontSize: 40, opacity: 0.25 }}>🛒</div>
                <div style={{ fontWeight: 700, marginTop: 8 }}>Carrito vacío</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Tocá productos del catálogo para agregarlos
                </div>
              </div>
            ) : (
              carrito.map(it => (
                <div key={it.id} className="pos-op-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pos-op-item-nombre">{it.nombre}</div>
                    <div className="pos-op-item-codigo">{it.codigo}</div>
                  </div>
                  <div className="pos-op-item-cant">
                    <button className="pos-op-cant-btn" onClick={() => cambiarQty(it.id, it.qty - 1)} disabled={it.qty <= 1}>−</button>
                    <input type="number" min="1" step="1" className="pos-op-cant-input" value={it.qty} onChange={e => cambiarQty(it.id, e.target.value)} />
                    <button className="pos-op-cant-btn" onClick={() => cambiarQty(it.id, it.qty + 1)}>+</button>
                  </div>
                  <div className="pos-op-item-total">{fmt(it.precio * it.qty)}</div>
                  <button className="pos-op-item-quitar" onClick={() => removerProducto(it.id)}>✕</button>
                </div>
              ))
            )}
          </div>

          {/* DATOS DE TRASLADO (siempre visibles) */}
          {carrito.length > 0 && (
            <div className="pos-op-datos-extra">
              <div className="pos-op-datos-titulo">📋 Datos del traslado</div>
              <BuscadorActividad
                codActividad={codActividadNR}
                descActividad={descActividadNR}
                onChange={({ codigo, descripcion }) => {
                  setCodActividadNR(codigo)
                  setDescActividadNR(descripcion)
                }}
                placeholder="Actividad económica del receptor..."
              />
              <div className="pos-op-grid-2">
                <select className="input" value={tipoTraslado} onChange={e => setTipoTraslado(e.target.value)} style={{ fontSize: 12 }}>
                  {TIPOS_TRASLADO_NR.map(t => (
                    <option key={t.value} value={t.value}>{t.label.length > 30 ? t.label.slice(0, 30) + '...' : t.label}</option>
                  ))}
                </select>
                <select className="input" value={bienTitulo} onChange={e => setBienTitulo(e.target.value)} style={{ fontSize: 12 }}>
                  {BIEN_TITULOS_NR.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <input
                type="text"
                className="input"
                placeholder="Observaciones (opcional)"
                value={observaciones}
                onChange={e => setObservaciones(e.target.value)}
                style={{ fontSize: 12 }}
              />
            </div>
          )}

          {/* RESUMEN Y BOTÓN */}
          <div className="pos-op-resumen">
            <div className="pos-op-resumen-row pos-op-resumen-total">
              <span>VALOR DE LOS BIENES</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{fmt(totalNR)}</span>
            </div>
          </div>

          <button
            className="pos-op-btn-emitir pos-op-btn-nr"
            onClick={emitirNR}
            disabled={transmitiendo || carrito.length === 0 || !clienteSel}
          >
            {transmitiendo ? '⏳ Transmitiendo...' : '📡 EMITIR Y FIRMAR'}
          </button>
        </div>
      </div>

      {/* MODAL BUSCADOR DE CLIENTE */}
      {mostrarBuscadorCliente && (
        <div className="pos-op-modal-overlay">
          <div className="pos-op-modal" onClick={e => e.stopPropagation()}>
            <div className="pos-op-modal-header">
              <div style={{ fontWeight: 800 }}>Seleccionar receptor</div>
              <button className="pos-op-modal-cerrar" onClick={() => setMostrarBuscadorCliente(false)}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              <div className="pos-op-buscador">
                <span className="pos-op-buscador-icono">🔍</span>
                <input
                  type="text"
                  className="pos-op-buscador-input"
                  placeholder="Buscar por nombre, NIT o DUI..."
                  value={busquedaCli}
                  onChange={e => setBusquedaCli(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ marginTop: 12, maxHeight: 360, overflowY: 'auto' }}>
                {clientesFiltrados.map(c => (
                  <div key={c.id} className="pos-op-cliente-row" onClick={() => seleccionarCliente(c)}>
                    <div className="pos-op-receptor-avatar" style={{ width: 32, height: 32, fontSize: 14 }}>👤</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {c.nit && `NIT ${c.nit}`}
                        {c.dui && !c.nit && `DUI ${c.dui}`}
                      </div>
                    </div>
                    <span style={{ color: 'var(--muted)' }}>→</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════
// NUEVA FSE — Vista estilo POS adaptado a sujetos excluidos
// Panel izquierdo: formulario para agregar conceptos al carrito
// Panel derecho: carrito de conceptos + proveedor + resumen + emitir
// ════════════════════════════════════════════════════════════════════
function NuevaFSE({ proveedores, empresa, user, puede, setAlerta, volver, empresaId }) {
  const [conceptos, setConceptos] = useState([])
  const [provSel, setProvSel] = useState(null)
  const [busquedaProv, setBusquedaProv] = useState('')
  const [mostrarBuscadorProv, setMostrarBuscadorProv] = useState(false)
  const [mostrarFormProv, setMostrarFormProv] = useState(false)
  const [observaciones, setObservaciones] = useState('')
  const [codActividadFSE, setCodActividadFSE] = useState('')
  const [descActividadFSE, setDescActividadFSE] = useState('')
  const [transmitiendo, setTransmitiendo] = useState(false)
  const [tabMovil, setTabMovil] = useState('formulario')

  // Formulario para agregar un concepto al carrito
  const [conceptoForm, setConceptoForm] = useState({ descripcion: '', cantidad: '1', precio: '' })

  // Form nuevo proveedor
  const emptyProv = { nombre: '', dui: '', telefono: '', email: '', codDep: '', codMun: '', codDistrito: '', distrito: '', complemento: '', codActividad: '', descActividad: '' }
  const [formProv, setFormProv] = useState(emptyProv)
  const [guardandoProv, setGuardandoProv] = useState(false)

  const proveedoresFiltrados = useMemo(() => {
    if (!busquedaProv.trim()) return proveedores.slice(0, 10)
    const q = busquedaProv.toLowerCase()
    return proveedores.filter(p =>
      p.nombre?.toLowerCase().includes(q) || p.dui?.includes(busquedaProv)
    ).slice(0, 10)
  }, [proveedores, busquedaProv])

  const totalCompra = conceptos.reduce((s, c) => s + (c.cantidad * c.precio), 0)
  const aplicaRetencion = totalCompra > 113.33
  const reteRenta = aplicaRetencion ? totalCompra * 0.10 : 0

  // ── AGREGAR CONCEPTO al carrito ──
  const agregarConcepto = () => {
    const desc = conceptoForm.descripcion.trim()
    const cant = parseFloat(conceptoForm.cantidad) || 0
    const prec = parseFloat(conceptoForm.precio) || 0
    if (!desc) {
      setAlerta({ titulo: 'Falta descripción', mensaje: 'Describí qué fue lo que compraste.', tipo: 'error' })
      return
    }
    if (cant <= 0 || prec <= 0) {
      setAlerta({ titulo: 'Monto inválido', mensaje: 'Cantidad y precio deben ser mayores a cero.', tipo: 'error' })
      return
    }
    setConceptos(c => [...c, {
      id: Date.now().toString(),
      descripcion: desc,
      cantidad: cant,
      precio: prec
    }])
    setConceptoForm({ descripcion: '', cantidad: '1', precio: '' })
  }

  const removerConcepto = (id) => setConceptos(c => c.filter(it => it.id !== id))

  const seleccionarProveedor = (p) => {
    setProvSel(p)
    if (p.codActividad && p.descActividad) {
      setCodActividadFSE(p.codActividad)
      setDescActividadFSE(p.descActividad)
    }
    setMostrarBuscadorProv(false)
    setBusquedaProv('')
  }

  // ── GUARDAR PROVEEDOR NUEVO ──
  const guardarProveedor = async () => {
    if (!formProv.nombre.trim()) {
      setAlerta({ titulo: 'Nombre requerido', mensaje: 'Ingresá el nombre del proveedor.', tipo: 'error' })
      return
    }
    if (!esDUIValido(formProv.dui)) {
      setAlerta({ titulo: 'DUI inválido', mensaje: 'El DUI debe tener 9 dígitos.', tipo: 'error' })
      return
    }
    setGuardandoProv(true)
    try {
      const duiLimpio = limpiarDoc(formProv.dui)
      const direccion = buildComplemento(formProv.distrito, formProv.complemento)
      const data = { ...formProv, dui: duiLimpio, direccion, empresaId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      const ref = await addDoc(collection(db, 'proveedores'), data)
      seleccionarProveedor({ id: ref.id, ...data })
      setMostrarFormProv(false)
      setFormProv(emptyProv)
    } catch (e) {
      setAlerta({ titulo: 'Error al guardar', mensaje: e.message, tipo: 'error' })
    }
    setGuardandoProv(false)
  }

  // ── EMITIR FSE ──
  const emitirFSE = async () => {
    if (!provSel) {
      setAlerta({ titulo: 'Sin proveedor', mensaje: 'Seleccioná o registrá el proveedor.', tipo: 'error' })
      return
    }
    const duiLimpio = limpiarDoc(provSel.dui)
    if (!esDUIValido(duiLimpio)) {
      setAlerta({ titulo: 'DUI inválido', mensaje: 'El DUI del proveedor no es válido (9 dígitos).', tipo: 'error' })
      return
    }
    if (!codActividadFSE || !descActividadFSE) {
      setAlerta({ titulo: 'Falta actividad económica', mensaje: 'Seleccioná la actividad económica del servicio prestado.', tipo: 'error' })
      return
    }
    if (conceptos.length === 0) {
      setAlerta({ titulo: 'Sin conceptos', mensaje: 'Agregá al menos un concepto al carrito.', tipo: 'error' })
      return
    }

    setTransmitiendo(true)
    try {
      const configSnap = await getDoc(doc(db, 'configuracion', empresaId))
      if (!configSnap.exists()) throw new Error('No hay documento de configuración.')
      const configDocId = configSnap.id

      const codigoGeneracion = crypto.randomUUID().toUpperCase()
      let numeroDte = ''
      let operacionId = ''

      await runTransaction(db, async (tx) => {
        const configRef = doc(db, 'configuracion', configDocId)
        const configSnap = await tx.get(configRef)
        if (!configSnap.exists()) throw new Error('Documento de configuración no encontrado')
        const config = configSnap.data()

        const correlativoActual = parseInt(config.correlativo_FSE || 0)
        const correlativoNuevo = correlativoActual + 1
        const numStr = String(correlativoNuevo).padStart(15, '0')
        const codEst = (config.codEstableMH || 'S001').padEnd(4, '0').slice(0, 4)
        const codPV  = (config.codPuntoVentaMH || 'P001').padEnd(4, '0').slice(0, 4)
        numeroDte = `DTE-14-${codEst}${codPV}-${numStr}`

        const opRef = doc(collection(db, 'operaciones'))
        operacionId = opRef.id

        tx.set(opRef, {
          tipoDte: 'FSE',
          cajero: userName || '', cajeroId: userId || '',
          numero: numeroDte,
          numeroControl: numeroDte,
          codigoGeneracion,
          cliente: provSel.nombre,
          dui: duiLimpio,
          codActividad: codActividadFSE,
          descActividad: descActividadFSE,
          codDep: provSel.codDep || '',
          codMun: provSel.codMun || '',
          codDistrito: provSel.codDistrito || '',
          direccion: provSel.direccion || provSel.complemento || '',
          telefono: provSel.telefono || '',
          correo: provSel.email || '',
          items: conceptos.map(c => ({
            nombre: c.descripcion,
            qty: c.cantidad,
            precioBase: c.precio,
            subtotal: c.cantidad * c.precio,
          })),
          subtotal: totalCompra,
          total: totalCompra,
          reteRenta,
          observaciones: observaciones.trim() || '',
          dte_estado: 'PENDIENTE',
          dte_ambiente: empresa.mh_ambiente || '00',
          emisor: { uid: user?.uid || '', nombre: user?.displayName || user?.email || '' },
          empresaId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        tx.update(configRef, { correlativo_FSE: correlativoNuevo })
      })

      const resp = await fetch('/api/dte/transmitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operacionId, ventaId: operacionId, ambiente: empresa.mh_ambiente || '00' })
      })
      const data = await resp.json()

      if (data.estado === 'PROCESADO') {
        setAlerta({
          titulo: '✅ FSE transmitida correctamente',
          mensaje: `Número: ${data.numeroControl || numeroDte}\nSello MH: ${data.selloRecibido?.slice(0, 20)}...`,
          tipo: 'exito'
        })
        setTimeout(() => volver(), 1500)
      } else if (data.estado === 'RECHAZADO') {
        const motivo = data.detalleMH?.descripcionMsg || data.observaciones?.join('\n') || 'Sin detalle'
        setAlerta({ titulo: '❌ MH rechazó la FSE', mensaje: `Motivo: ${motivo}`, tipo: 'error' })
      } else {
        setAlerta({ titulo: '⚠️ FSE pendiente', mensaje: 'No se obtuvo respuesta del MH.', tipo: 'error' })
      }
    } catch (e) {
      setAlerta({ titulo: 'Error al emitir FSE', mensaje: e.message, tipo: 'error' })
    }
    setTransmitiendo(false)
  }

  return (
    <>
      <style>{stylesGenerales}</style>
      <style>{stylesPosLike}</style>

      {/* HEADER */}
      <div className="pos-op-header">
        <button className="pos-op-volver" onClick={volver}>← Volver</button>
        <div className="pos-op-titulo">
          <div className="pos-op-titulo-icono pos-op-titulo-fse">💰</div>
          <div>
            <div className="pos-op-titulo-texto">Nueva Factura Sujeto Excluido</div>
            <div className="pos-op-titulo-sub">Compra a persona sin NIT/NRC · DTE tipo 14</div>
          </div>
        </div>
      </div>

      {/* TABS MÓVIL */}
      <div className="pos-op-tabs-movil">
        <button
          className={`pos-op-tab-movil ${tabMovil === 'formulario' ? 'active' : ''}`}
          onClick={() => setTabMovil('formulario')}
        >📝 Agregar concepto</button>
        <button
          className={`pos-op-tab-movil ${tabMovil === 'carrito' ? 'active' : ''}`}
          onClick={() => setTabMovil('carrito')}
        >
          📋 Comprobante
          {conceptos.length > 0 && <span className="pos-op-tab-badge">{conceptos.length}</span>}
        </button>
      </div>

      {/* LAYOUT SPLIT */}
      <div className="pos-op-split">
        {/* IZQUIERDA: FORMULARIO PARA AGREGAR CONCEPTOS */}
        <div className={`pos-op-col pos-op-formulario ${tabMovil === 'formulario' ? 'tab-activo' : ''}`}>
          <div className="pos-op-formulario-card">
            <div className="pos-op-formulario-titulo">
              <span style={{ fontSize: 18 }}>📝</span>
              <span>Agregar concepto al comprobante</span>
            </div>
            <div className="pos-op-formulario-help">
              Cada compra puede tener varios conceptos. Llená los datos y tap "Agregar al carrito".
            </div>

            <div className="form-group" style={{ marginTop: 16 }}>
              <label className="form-label">DESCRIPCIÓN DEL BIEN O SERVICIO</label>
              <input
                type="text"
                className="input"
                placeholder="Ej: Servicio de albañilería, 3 días..."
                value={conceptoForm.descripcion}
                onChange={e => setConceptoForm(f => ({ ...f, descripcion: e.target.value }))}
              />
            </div>

            <div className="pos-op-grid-2" style={{ marginTop: 12 }}>
              <div className="form-group">
                <label className="form-label">CANTIDAD</label>
                <input
                  type="number"
                  min="0" step="0.01"
                  className="input"
                  style={{ fontFamily: 'var(--mono)' }}
                  value={conceptoForm.cantidad}
                  onChange={e => setConceptoForm(f => ({ ...f, cantidad: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">PRECIO UNITARIO ($)</label>
                <input
                  type="number"
                  min="0" step="0.01"
                  className="input"
                  style={{ fontFamily: 'var(--mono)' }}
                  placeholder="0.00"
                  value={conceptoForm.precio}
                  onChange={e => setConceptoForm(f => ({ ...f, precio: e.target.value }))}
                />
              </div>
            </div>

            {/* Preview del subtotal */}
            <div className="pos-op-form-preview">
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>SUBTOTAL DE ESTE CONCEPTO</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>
                {fmt((parseFloat(conceptoForm.cantidad) || 0) * (parseFloat(conceptoForm.precio) || 0))}
              </span>
            </div>

            <button
              className="pos-op-btn-agregar"
              onClick={agregarConcepto}
              disabled={!conceptoForm.descripcion.trim() || !conceptoForm.precio}
            >
              + Agregar al comprobante
            </button>
          </div>

          {/* Ayuda visual sobre retenciones */}
          <div className="pos-op-tip">
            <div style={{ fontSize: 22 }}>💡</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Sobre la retención de renta</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                Si el total supera <strong>$113.33</strong>, se aplica automáticamente <strong>10% de retención de renta</strong>.
                Vos retenés ese monto y lo declarás. El proveedor cobra el neto.
              </div>
            </div>
          </div>
        </div>

        {/* DERECHA: CARRITO DE CONCEPTOS */}
        <div className={`pos-op-col pos-op-carrito ${tabMovil === 'carrito' ? 'tab-activo' : ''}`}>

          {/* PROVEEDOR */}
          <div className="pos-op-receptor">
            {provSel ? (
              <div className="pos-op-receptor-card pos-op-receptor-fse">
                <div className="pos-op-receptor-avatar">🧑</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pos-op-receptor-nombre">{provSel.nombre}</div>
                  <div className="pos-op-receptor-datos">DUI {provSel.dui || '—'}</div>
                </div>
                <button className="pos-op-receptor-cambiar" onClick={() => { setProvSel(null); setMostrarBuscadorProv(true) }}>
                  Cambiar
                </button>
              </div>
            ) : (
              <button
                className="pos-op-receptor-selector"
                onClick={() => setMostrarBuscadorProv(true)}
              >
                <span>🧑</span>
                <span>Seleccionar proveedor</span>
                <span style={{ marginLeft: 'auto' }}>›</span>
              </button>
            )}
          </div>

          {/* ITEMS */}
          <div className="pos-op-items">
            {conceptos.length === 0 ? (
              <div className="pos-op-carrito-vacio">
                <div style={{ fontSize: 40, opacity: 0.25 }}>🧾</div>
                <div style={{ fontWeight: 700, marginTop: 8 }}>Sin conceptos aún</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Agregá conceptos desde el formulario
                </div>
              </div>
            ) : (
              conceptos.map(c => (
                <div key={c.id} className="pos-op-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pos-op-item-nombre">{c.descripcion}</div>
                    <div className="pos-op-item-codigo">{c.cantidad} × {fmt(c.precio)}</div>
                  </div>
                  <div className="pos-op-item-total">{fmt(c.cantidad * c.precio)}</div>
                  <button className="pos-op-item-quitar" onClick={() => removerConcepto(c.id)}>✕</button>
                </div>
              ))
            )}
          </div>

          {/* ACTIVIDAD ECONÓMICA + OBSERVACIONES */}
          {conceptos.length > 0 && (
            <div className="pos-op-datos-extra">
              <div className="pos-op-datos-titulo">📋 Datos del comprobante</div>
              <BuscadorActividad
                codActividad={codActividadFSE}
                descActividad={descActividadFSE}
                onChange={({ codigo, descripcion }) => {
                  setCodActividadFSE(codigo)
                  setDescActividadFSE(descripcion)
                }}
                placeholder="Actividad económica del servicio..."
              />
              <input
                type="text"
                className="input"
                placeholder="Observaciones (opcional)"
                value={observaciones}
                onChange={e => setObservaciones(e.target.value)}
                style={{ fontSize: 12 }}
              />
            </div>
          )}

          {/* RESUMEN */}
          <div className="pos-op-resumen">
            <div className="pos-op-resumen-row">
              <span>Subtotal</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{fmt(totalCompra)}</span>
            </div>
            {aplicaRetencion && (
              <div className="pos-op-resumen-row" style={{ color: '#ef4444' }}>
                <span>Retención Renta 10%</span>
                <span style={{ fontFamily: 'var(--mono)' }}>-{fmt(reteRenta)}</span>
              </div>
            )}
            <div className="pos-op-resumen-row pos-op-resumen-total">
              <span>NETO A PAGAR</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{fmt(totalCompra - reteRenta)}</span>
            </div>
            {!aplicaRetencion && totalCompra > 0 && (
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
                ℹ️ Monto ≤ $113.33, no aplica retención
              </div>
            )}
          </div>

          <button
            className="pos-op-btn-emitir pos-op-btn-fse"
            onClick={emitirFSE}
            disabled={transmitiendo || conceptos.length === 0 || !provSel}
          >
            {transmitiendo ? '⏳ Transmitiendo...' : '📡 EMITIR Y FIRMAR'}
          </button>
        </div>
      </div>

      {/* MODAL BUSCADOR DE PROVEEDOR */}
      {mostrarBuscadorProv && (
        <div className="pos-op-modal-overlay">
          <div className="pos-op-modal" onClick={e => e.stopPropagation()}>
            <div className="pos-op-modal-header">
              <div style={{ fontWeight: 800 }}>Seleccionar proveedor</div>
              <button className="pos-op-modal-cerrar" onClick={() => setMostrarBuscadorProv(false)}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="pos-op-buscador" style={{ flex: 1 }}>
                  <span className="pos-op-buscador-icono">🔍</span>
                  <input
                    type="text"
                    className="pos-op-buscador-input"
                    placeholder="Buscar por nombre o DUI..."
                    value={busquedaProv}
                    onChange={e => setBusquedaProv(e.target.value)}
                    autoFocus
                  />
                </div>
                <button className="btn btn-primary" onClick={() => { setMostrarBuscadorProv(false); setMostrarFormProv(true) }}>
                  + Nuevo
                </button>
              </div>
              <div style={{ marginTop: 12, maxHeight: 360, overflowY: 'auto' }}>
                {proveedoresFiltrados.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>
                    No hay proveedores que coincidan.
                  </div>
                ) : (
                  proveedoresFiltrados.map(p => (
                    <div key={p.id} className="pos-op-cliente-row" onClick={() => seleccionarProveedor(p)}>
                      <div className="pos-op-receptor-avatar" style={{ width: 32, height: 32, fontSize: 14 }}>🧑</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>DUI {p.dui}</div>
                      </div>
                      <span style={{ color: 'var(--muted)' }}>→</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FORM PROVEEDOR */}
      {mostrarFormProv && (
        <div className="pos-op-modal-overlay">
          <div className="pos-op-modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div className="pos-op-modal-header">
              <div style={{ fontWeight: 800 }}>+ Nuevo Proveedor (Sujeto Excluido)</div>
              <button className="pos-op-modal-cerrar" onClick={() => setMostrarFormProv(false)}>✕</button>
            </div>
            <div style={{ padding: 16, maxHeight: '70vh', overflowY: 'auto' }}>
              <div className="form-group">
                <label className="form-label">NOMBRE COMPLETO *</label>
                <input className="input" value={formProv.nombre} onChange={e => setFormProv(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="pos-op-grid-2">
                <div className="form-group">
                  <label className="form-label">DUI *</label>
                  <input className="input" placeholder="12345678-9" value={formProv.dui} onChange={e => setFormProv(f => ({ ...f, dui: e.target.value }))} style={{ fontFamily: 'var(--mono)' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">TELÉFONO</label>
                  <input className="input" placeholder="2222-3333" value={formProv.telefono} onChange={e => setFormProv(f => ({ ...f, telefono: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">EMAIL (opcional)</label>
                <input className="input" value={formProv.email} onChange={e => setFormProv(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">ACTIVIDAD HABITUAL (opcional)</label>
                <BuscadorActividad
                  codActividad={formProv.codActividad}
                  descActividad={formProv.descActividad}
                  onChange={({ codigo, descripcion }) => setFormProv(f => ({ ...f, codActividad: codigo, descActividad: descripcion }))}
                  placeholder="Buscar..."
                />
              </div>
              <div>
                <label className="form-label" style={{ marginBottom: 6, display: 'block' }}>DIRECCIÓN</label>
                <SelectorDepartamento
                  codDep={formProv.codDep}
                  codMun={formProv.codMun}
                  distrito={formProv.distrito}
                  onChange={({ codDep, codMun, distrito, codDistrito }) =>
                    setFormProv(f => ({ ...f, codDep, codMun, distrito: distrito || '', codDistrito: codDistrito || '' }))}
                />
                <input className="input" style={{ marginTop: 8 }} placeholder="Complemento" value={formProv.complemento} onChange={e => setFormProv(f => ({ ...f, complemento: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setMostrarFormProv(false)} disabled={guardandoProv}>Cancelar</button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={guardarProveedor} disabled={guardandoProv}>
                  {guardandoProv ? '⏳ Guardando...' : '💾 Guardar Proveedor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════
// MODAL ALERTA — reutilizable
// ════════════════════════════════════════════════════════════════════
function ModalAlerta({ alerta, cerrar }) {
  if (!alerta) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '28px 32px', maxWidth: 420, width: '100%', boxShadow: '0 25px 80px rgba(0,0,0,0.5)', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{alerta.tipo === 'error' ? '⚠️' : alerta.tipo === 'exito' ? '✅' : 'ℹ️'}</div>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{alerta.titulo}</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24, whiteSpace: 'pre-wrap' }}>{alerta.mensaje}</div>
        <button className="btn btn-primary" style={{ width: '100%', padding: '12px' }} onClick={cerrar} autoFocus>Entendido</button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// ESTILOS GENERALES (lista de operaciones, tabs, etc.)
// ════════════════════════════════════════════════════════════════════
const stylesGenerales = `
  .op-topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; padding-left: 50px; }
  .op-tabs { display: flex; gap: 4px; background: var(--surface2); padding: 4px; border-radius: 12px; margin-bottom: 20px; max-width: 480px; }
  .op-tab { flex: 1; padding: 10px 18px; border-radius: 9px; background: transparent; border: none; color: var(--muted); font-weight: 700; cursor: pointer; transition: all 0.15s; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 6px; }
  .op-tab:hover { background: rgba(148,163,184,0.08); color: var(--text); }
  .op-tab.active { background: var(--surface); color: var(--accent2, var(--accent)); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
  .op-info-banner { background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); border-radius: 10px; padding: 12px 16px; margin-bottom: 18px; font-size: 12px; color: var(--text); line-height: 1.5; }
  .op-info-banner strong { color: #3b82f6; }

  .op-vacio { text-align: center; padding: 60px 20px; color: var(--muted); }
  .op-vacio-icono { font-size: 56px; opacity: 0.4; margin-bottom: 12px; }
  .op-vacio-titulo { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
  .op-vacio-sub { font-size: 12px; }

  .btn-nueva-op {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 22px; border-radius: 14px;
    border: 1.5px solid transparent; cursor: pointer;
    font-family: inherit; text-align: left;
    background: var(--surface); color: var(--text);
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .btn-nueva-op:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
  .btn-nueva-nr:hover { border-color: rgba(59,130,246,0.4); box-shadow: 0 8px 24px rgba(59,130,246,0.15); }
  .btn-nueva-fse:hover { border-color: rgba(245,158,11,0.4); box-shadow: 0 8px 24px rgba(245,158,11,0.15); }
  .btn-nueva-op-icono { font-size: 28px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
  .btn-nueva-nr .btn-nueva-op-icono { background: rgba(59,130,246,0.10); }
  .btn-nueva-fse .btn-nueva-op-icono { background: rgba(245,158,11,0.10); }
  .btn-nueva-op-titulo { display: block; font-weight: 700; font-size: 14px; }
  .btn-nueva-op-sub { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; }
  .btn-nueva-op-plus { font-size: 22px; font-weight: 300; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; margin-left: 4px; color: white; }
  .btn-nueva-nr .btn-nueva-op-plus { background: #3b82f6; }
  .btn-nueva-fse .btn-nueva-op-plus { background: #f59e0b; }
`

// ════════════════════════════════════════════════════════════════════
// ESTILOS LAYOUT POS-LIKE (para vistas Nueva NR / Nueva FSE)
// ════════════════════════════════════════════════════════════════════
const stylesPosLike = `
  /* HEADER */
  .pos-op-header {
    display: flex; align-items: center; gap: 16px;
    padding: 0 24px 0 50px; margin-bottom: 14px;
  }
  .pos-op-volver {
    background: var(--surface2); border: 1.5px solid var(--border);
    padding: 8px 14px; border-radius: 10px;
    font-size: 12px; font-weight: 700; color: var(--text);
    cursor: pointer; transition: all 0.15s;
  }
  .pos-op-volver:hover { background: var(--surface); border-color: var(--muted); transform: translateX(-2px); }
  .pos-op-titulo { display: flex; align-items: center; gap: 14px; }
  .pos-op-titulo-icono {
    width: 48px; height: 48px; border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 24px;
  }
  .pos-op-titulo-nr { background: rgba(59,130,246,0.12); }
  .pos-op-titulo-fse { background: rgba(245,158,11,0.12); }
  .pos-op-titulo-texto { font-size: 18px; font-weight: 800; }
  .pos-op-titulo-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }

  /* TABS MÓVIL */
  .pos-op-tabs-movil {
    display: none;
    margin: 0 24px 12px;
    background: var(--surface); border: 1.5px solid var(--border);
    border-radius: 14px; padding: 5px; gap: 4px;
  }
  @media (max-width: 900px) { .pos-op-tabs-movil { display: flex; } }
  .pos-op-tab-movil {
    flex: 1; padding: 10px 12px; border-radius: 10px; border: none;
    cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 700;
    transition: all 0.15s; color: var(--muted); background: transparent;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    position: relative;
  }
  .pos-op-tab-movil.active { background: var(--accent2, var(--accent)); color: white; }
  .pos-op-tab-badge { background: rgba(239,68,68,0.9); color: white; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 99px; }
  .pos-op-tab-movil.active .pos-op-tab-badge { background: rgba(255,255,255,0.3); }

  /* LAYOUT SPLIT */
  .pos-op-split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    padding: 0 24px 20px 50px;
    height: calc(100vh - 130px);
    align-items: start;
  }
  @media (max-width: 900px) {
    .pos-op-split { grid-template-columns: 1fr; padding: 0 16px 16px; height: auto; }
  }
  .pos-op-col {
    background: var(--surface); border: 1.5px solid var(--border);
    border-radius: 16px;
    height: calc(100vh - 130px);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  @media (max-width: 900px) {
    .pos-op-col { display: none; height: calc(100vh - 180px); }
    .pos-op-col.tab-activo { display: flex; }
  }

  /* BUSCADOR */
  .pos-op-buscador {
    display: flex; align-items: center; gap: 10px;
    margin: 12px 12px 8px;
    padding: 8px 14px;
    background: var(--surface2);
    border: 1.5px solid transparent;
    border-radius: 12px;
    transition: all 0.15s;
  }
  .pos-op-buscador:focus-within {
    background: var(--surface);
    border-color: rgba(59,130,246,0.4);
    box-shadow: 0 0 0 4px rgba(59,130,246,0.08);
  }
  .pos-op-buscador-icono { font-size: 14px; color: var(--muted); flex-shrink: 0; }
  .pos-op-buscador-input {
    flex: 1; background: transparent; border: none; outline: none;
    padding: 6px 0; font-size: 14px; color: var(--text);
    font-family: inherit; min-width: 0;
  }

  /* CATÁLOGO (NR) */
  .pos-op-catalogo-scroll {
    flex: 1; overflow-y: auto; padding: 4px 12px 12px;
  }
  .pos-op-productos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
  }
  .pos-op-producto {
    background: var(--surface2);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.15s;
    position: relative;
    display: flex; flex-direction: column;
  }
  .pos-op-producto:hover {
    border-color: #3b82f6;
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(59,130,246,0.15);
  }
  .pos-op-producto.en-carrito {
    border-color: rgba(59,130,246,0.5);
    background: rgba(59,130,246,0.05);
  }
  .pos-op-producto-icono { font-size: 22px; margin-bottom: 4px; }
  .pos-op-producto-nombre {
    font-size: 12px; font-weight: 700;
    line-height: 1.3;
    overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    min-height: 32px;
  }
  .pos-op-producto-codigo { font-size: 10px; color: var(--muted); margin-top: 4px; }
  .pos-op-producto-precio {
    font-family: var(--mono); font-weight: 800;
    font-size: 14px; color: #3b82f6; margin-top: 6px;
  }
  .pos-op-producto-stock { font-size: 9px; color: var(--muted); margin-top: 2px; }
  .pos-op-producto-badge {
    position: absolute; top: 8px; right: 8px;
    background: #3b82f6; color: white;
    width: 22px; height: 22px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 800;
    box-shadow: 0 2px 6px rgba(59,130,246,0.4);
  }

  /* FORMULARIO FSE (panel izquierdo) */
  .pos-op-formulario { padding: 16px; gap: 14px; }
  .pos-op-formulario-card {
    background: var(--surface2); border: 1.5px solid var(--border);
    border-radius: 14px; padding: 16px;
  }
  .pos-op-formulario-titulo {
    display: flex; align-items: center; gap: 8px;
    font-size: 15px; font-weight: 800;
  }
  .pos-op-formulario-help {
    font-size: 11px; color: var(--muted);
    margin-top: 4px; line-height: 1.5;
  }
  .pos-op-form-preview {
    margin-top: 16px;
    padding: 12px 14px;
    background: rgba(245,158,11,0.06);
    border: 1px dashed rgba(245,158,11,0.3);
    border-radius: 10px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .pos-op-btn-agregar {
    width: 100%; margin-top: 12px;
    padding: 12px; border-radius: 10px;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: white; border: none; cursor: pointer;
    font-family: inherit; font-size: 13px; font-weight: 800;
    transition: all 0.15s;
  }
  .pos-op-btn-agregar:hover:not(:disabled) {
    transform: translateY(-1px); box-shadow: 0 6px 18px rgba(245,158,11,0.4);
  }
  .pos-op-btn-agregar:disabled { opacity: 0.4; cursor: not-allowed; }
  .pos-op-tip {
    display: flex; gap: 12px; padding: 12px;
    background: rgba(59,130,246,0.06);
    border: 1px solid rgba(59,130,246,0.15);
    border-radius: 12px;
  }

  /* CARRITO (DERECHA) */
  .pos-op-carrito { padding: 0; }
  .pos-op-receptor { padding: 12px; border-bottom: 1.5px solid var(--border); }
  .pos-op-receptor-selector {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 12px 14px;
    background: var(--surface2);
    border: 1.5px dashed var(--border);
    border-radius: 12px;
    cursor: pointer; font-family: inherit;
    font-size: 13px; font-weight: 600;
    color: var(--muted); transition: all 0.15s;
  }
  .pos-op-receptor-selector:hover { background: var(--surface); border-color: var(--accent2, var(--accent)); color: var(--text); }
  .pos-op-receptor-card {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 14px;
    background: rgba(59,130,246,0.06);
    border: 1.5px solid rgba(59,130,246,0.25);
    border-radius: 12px;
  }
  .pos-op-receptor-fse {
    background: rgba(245,158,11,0.06);
    border-color: rgba(245,158,11,0.25);
  }
  .pos-op-receptor-avatar {
    width: 40px; height: 40px;
    border-radius: 12px;
    background: var(--surface);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; flex-shrink: 0;
  }
  .pos-op-receptor-nombre { font-weight: 700; font-size: 13px; }
  .pos-op-receptor-datos { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .pos-op-receptor-cambiar {
    background: transparent; border: 1px solid var(--border);
    padding: 6px 12px; border-radius: 8px;
    font-size: 11px; font-weight: 600; color: var(--muted);
    cursor: pointer; transition: all 0.15s;
  }
  .pos-op-receptor-cambiar:hover { color: var(--text); border-color: var(--muted); }

  .pos-op-items {
    flex: 1; overflow-y: auto;
    padding: 12px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .pos-op-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .pos-op-item-nombre { font-weight: 600; font-size: 13px; line-height: 1.3; }
  .pos-op-item-codigo { font-size: 10px; color: var(--muted); margin-top: 2px; }
  .pos-op-item-cant {
    display: flex; align-items: center;
    background: var(--surface); border-radius: 8px;
    overflow: hidden;
  }
  .pos-op-cant-btn {
    width: 26px; height: 26px;
    background: transparent; border: none;
    cursor: pointer; font-size: 14px; color: var(--text);
  }
  .pos-op-cant-btn:hover:not(:disabled) { background: var(--border); }
  .pos-op-cant-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .pos-op-cant-input {
    width: 36px; height: 26px;
    background: transparent; border: none;
    text-align: center; font-size: 12px; font-weight: 700;
    color: var(--text); font-family: var(--mono); outline: none;
  }
  .pos-op-item-total {
    font-family: var(--mono); font-weight: 800;
    font-size: 13px;
    min-width: 70px; text-align: right;
  }
  .pos-op-item-quitar {
    width: 24px; height: 24px; border-radius: 6px;
    background: transparent; border: none; cursor: pointer;
    color: var(--muted); font-size: 11px;
    transition: all 0.12s;
  }
  .pos-op-item-quitar:hover { background: rgba(239,68,68,0.1); color: #ef4444; }

  .pos-op-carrito-vacio {
    flex: 1;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 40px 20px;
    color: var(--muted); text-align: center;
  }

  .pos-op-datos-extra {
    padding: 12px;
    border-top: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 8px;
    background: var(--surface2);
  }
  .pos-op-datos-titulo {
    font-size: 11px; font-weight: 800;
    color: var(--muted); letter-spacing: 1px;
    margin-bottom: 4px;
  }

  .pos-op-resumen {
    padding: 12px 16px;
    border-top: 1.5px solid var(--border);
    background: var(--surface);
  }
  .pos-op-resumen-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 4px 0; font-size: 13px;
  }
  .pos-op-resumen-total {
    font-size: 16px; font-weight: 800;
    padding-top: 8px; margin-top: 4px;
    border-top: 1.5px solid var(--border);
  }

  .pos-op-btn-emitir {
    width: calc(100% - 24px); margin: 0 12px 12px;
    padding: 16px;
    border-radius: 12px; border: none;
    font-size: 16px; font-weight: 900;
    letter-spacing: 0.3px;
    cursor: pointer;
    color: white;
    transition: all 0.2s;
    font-family: inherit;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .pos-op-btn-nr {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    box-shadow: 0 6px 22px rgba(59,130,246,0.4);
  }
  .pos-op-btn-nr:hover:not(:disabled) {
    transform: translateY(-2px); box-shadow: 0 10px 32px rgba(59,130,246,0.5);
  }
  .pos-op-btn-fse {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    box-shadow: 0 6px 22px rgba(245,158,11,0.4);
  }
  .pos-op-btn-fse:hover:not(:disabled) {
    transform: translateY(-2px); box-shadow: 0 10px 32px rgba(245,158,11,0.5);
  }
  .pos-op-btn-emitir:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; box-shadow: none !important; }

  /* MODALES */
  .pos-op-modal-overlay {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(15,23,42,0.7);
    backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  }
  .pos-op-modal {
    background: var(--surface);
    border-radius: 18px;
    box-shadow: 0 30px 90px rgba(0,0,0,0.4);
    max-width: 480px; width: 100%;
    max-height: 86vh;
    overflow: hidden;
    display: flex; flex-direction: column;
  }
  .pos-op-modal-header {
    padding: 16px 18px;
    border-bottom: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center;
  }
  .pos-op-modal-cerrar {
    width: 32px; height: 32px;
    border-radius: 8px;
    background: var(--surface2); border: none;
    color: var(--muted); cursor: pointer;
    font-size: 14px;
  }
  .pos-op-modal-cerrar:hover { background: rgba(239,68,68,0.1); color: #ef4444; }
  .pos-op-cliente-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.12s;
  }
  .pos-op-cliente-row:hover { background: var(--surface2); }

  /* UTILIDADES */
  .pos-op-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .pos-op-vacio {
    text-align: center; padding: 40px 20px;
    color: var(--muted); display: flex; flex-direction: column;
    align-items: center; gap: 10px;
  }
`