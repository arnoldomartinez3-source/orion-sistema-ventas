// ════════════════════════════════════════════════════════════════════
// OPERACIONES — Módulo para emitir DTE que NO son ventas directas:
//   • NR (Nota de Remisión): traslado de mercadería antes de facturar
//   • FSE (Factura Sujeto Excluido): compras a personas sin NIT/NRC
//
// Cada uno tiene su propio flujo:
//   - NR hala productos del catálogo (como POS)
//   - FSE tiene formulario libre + colección de proveedores
//
// Ambos se transmiten al MH usando el mismo endpoint /api/dte/transmitir
// que ya soporta tipoDte = 'NR' y tipoDte = 'FSE'.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { db } from '../firebase'
import {
  collection, onSnapshot, doc, getDoc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, runTransaction, query, where, orderBy, getDocs, limit
} from 'firebase/firestore'
import { useAuth } from '../AuthContext'
import { usePermisos } from '../PermisosContext'
import BuscadorActividad from '../components/BuscadorActividad'
import SelectorDepartamento from '../components/SelectorDepartamento'
import { buildComplemento } from '../data/departamentosMunicipios'

// Helpers de formato/validación
const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2)}`
const limpiarDoc = (v) => (v || '').replace(/[-\s]/g, '').trim()
const esDUIValido = (d) => /^\d{9}$/.test(limpiarDoc(d))
const esNITValido = (n) => /^\d{14}$/.test(limpiarDoc(n))
const fechaSV = () => {
  const ahora = new Date()
  const sv = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/El_Salvador' }))
  const y = sv.getFullYear(), m = String(sv.getMonth() + 1).padStart(2, '0'), d = String(sv.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Tipos de razón del traslado para NR (CAT-014 del MH)
// Valores típicos según Normativa V2.0
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

// Título del bien para NR (CAT-025)
const BIEN_TITULOS_NR = [
  { value: '01', label: 'Por compra' },
  { value: '02', label: 'Propio' },
  { value: '03', label: 'Otros' },
]

// Permisos del sistema para Operaciones (usa el mismo de Facturas DTE)
export default function Operaciones() {
  const { user } = useAuth()
  const { puede } = usePermisos()

  // Sub-pestaña activa: 'NR' o 'FSE'
  const [tabActiva, setTabActiva] = useState('NR')

  // ── Estado COMÚN ──
  const [empresa, setEmpresa] = useState({})
  const [productos, setProductos] = useState([])
  const [clientes, setClientes] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [operaciones, setOperaciones] = useState([])
  const [loading, setLoading] = useState(true)

  // Estado de alerta global
  const [alerta, setAlerta] = useState(null) // { titulo, mensaje, tipo }

  // ── CARGAR DATOS DE FIREBASE ──
  useEffect(() => {
    let cancelado = false
    async function cargarConfig() {
      try {
        const snap = await getDocs(query(collection(db, 'configuracion'), limit(1)))
        if (!snap.empty && !cancelado) setEmpresa(snap.docs[0].data())
      } catch (e) { console.warn('No se pudo cargar config:', e) }
    }
    cargarConfig()
    return () => { cancelado = true }
  }, [])

  useEffect(() => {
    const unsubP = onSnapshot(collection(db, 'productos'), s => {
      setProductos(s.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    const unsubC = onSnapshot(collection(db, 'clientes'), s => {
      setClientes(s.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    const unsubProv = onSnapshot(collection(db, 'proveedores'), s => {
      setProveedores(s.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    const unsubOp = onSnapshot(
      query(collection(db, 'operaciones'), orderBy('createdAt', 'desc')),
      s => {
        setOperaciones(s.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      }
    )
    return () => { unsubP(); unsubC(); unsubProv(); unsubOp() }
  }, [])

  // Filtrar operaciones por tipo según pestaña activa
  const operacionesActuales = operaciones.filter(op => op.tipoDte === tabActiva)

  return (
    <>
      <style>{`
        .op-topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; padding-left: 50px; }
        .op-tabs { display: flex; gap: 4px; background: var(--surface2); padding: 4px; border-radius: 12px; margin-bottom: 20px; max-width: 480px; }
        .op-tab { flex: 1; padding: 10px 18px; border-radius: 9px; background: transparent; border: none; color: var(--muted); font-weight: 700; cursor: pointer; transition: all 0.15s; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .op-tab:hover { background: rgba(148,163,184,0.08); color: var(--text); }
        .op-tab.active { background: var(--surface); color: var(--accent2); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .op-info-banner { background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); border-radius: 10px; padding: 12px 16px; margin-bottom: 18px; font-size: 12px; color: var(--text); line-height: 1.5; }
        .op-info-banner strong { color: #3b82f6; }
      `}</style>

      <div className="op-topbar">
        <div>
          <div className="page-title">📋 Operaciones</div>
          <div className="page-sub" style={{ marginTop: 4 }}>
            DTE que no son ventas directas: traslados de mercadería y compras a sujetos excluidos
          </div>
        </div>
      </div>

      {/* Tabs NR / FSE */}
      <div style={{ paddingLeft: 50, paddingRight: 24 }}>
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

        {/* Banner explicativo según pestaña */}
        {tabActiva === 'NR' && (
          <div className="op-info-banner">
            <strong>🚚 Nota de Remisión:</strong> documento para trasladar mercadería antes de facturar.
            No afecta IVA todavía. Cuando se cobre la venta, la FE o CCF debe referenciar esta NR.
            <br/>Si en 8 días no se factura, se debe invalidar.
          </div>
        )}
        {tabActiva === 'FSE' && (
          <div className="op-info-banner">
            <strong>💰 Factura Sujeto Excluido:</strong> documento que <em>vos emitís</em> al
            comprarle a alguien sin NIT/NRC (agricultor, freelancer, etc.). Sirve para que vos
            deduzcas el gasto. Incluye retención de impuestos automática según monto.
          </div>
        )}
      </div>

      {/* Render del módulo correspondiente */}
      <div style={{ paddingLeft: 50, paddingRight: 24, paddingBottom: 40 }}>
        {tabActiva === 'NR' && (
          <ModuloNR
            productos={productos}
            clientes={clientes}
            empresa={empresa}
            operaciones={operacionesActuales}
            loading={loading}
            user={user}
            puede={puede}
            setAlerta={setAlerta}
          />
        )}
        {tabActiva === 'FSE' && (
          <ModuloFSE
            proveedores={proveedores}
            empresa={empresa}
            operaciones={operacionesActuales}
            loading={loading}
            user={user}
            puede={puede}
            setAlerta={setAlerta}
          />
        )}
      </div>

      {/* MODAL ALERTA GLOBAL */}
      {alerta && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '28px 32px', maxWidth: 420, width: '100%', boxShadow: '0 25px 80px rgba(0,0,0,0.5)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{alerta.tipo === 'error' ? '⚠️' : alerta.tipo === 'exito' ? '✅' : 'ℹ️'}</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{alerta.titulo}</div>
            <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24, whiteSpace: 'pre-wrap' }}>{alerta.mensaje}</div>
            <button className="btn btn-primary" style={{ width: '100%', padding: '12px' }} onClick={() => setAlerta(null)} autoFocus>
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════
// MÓDULO NR — Notas de Remisión
// Flujo: armar lista de productos → seleccionar receptor → emitir → transmitir MH
// ════════════════════════════════════════════════════════════════════
function ModuloNR({ productos, clientes, empresa, operaciones, loading, user, puede, setAlerta }) {
  // Estado del formulario nueva NR
  const [modalNueva, setModalNueva] = useState(false)
  const [carrito, setCarrito] = useState([])
  const [busquedaProd, setBusquedaProd] = useState('')
  const [clienteSel, setClienteSel] = useState(null)
  const [busquedaCli, setBusquedaCli] = useState('')
  const [tipoTraslado, setTipoTraslado] = useState('03') // Venta a cuenta (común)
  const [bienTitulo, setBienTitulo] = useState('02')      // Propio
  const [observaciones, setObservaciones] = useState('')
  const [transmitiendo, setTransmitiendo] = useState(false)

  // Lista filtrada para búsqueda
  const productosFiltrados = busquedaProd.trim()
    ? productos.filter(p =>
        p.nombre?.toLowerCase().includes(busquedaProd.toLowerCase()) ||
        p.codigo?.toLowerCase().includes(busquedaProd.toLowerCase())
      ).slice(0, 8)
    : []

  const clientesFiltrados = busquedaCli.trim()
    ? clientes.filter(c =>
        c.nombre?.toLowerCase().includes(busquedaCli.toLowerCase()) ||
        c.nit?.includes(busquedaCli) ||
        c.dui?.includes(busquedaCli)
      ).slice(0, 6)
    : []

  // Agregar producto al carrito (cantidad 1 por defecto)
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
    setBusquedaProd('')
  }

  const removerProducto = (id) => setCarrito(c => c.filter(it => it.id !== id))
  const cambiarQty = (id, qty) => setCarrito(c => c.map(it => it.id === id ? { ...it, qty: Math.max(1, parseFloat(qty) || 1) } : it))

  // Resetea el formulario al abrir/cerrar
  const limpiarForm = () => {
    setCarrito([]); setBusquedaProd(''); setClienteSel(null); setBusquedaCli('')
    setTipoTraslado('03'); setBienTitulo('02'); setObservaciones('')
  }

  // ── EMITIR NR ──
  // 1. Crear documento en 'operaciones' (Firestore) con todos los datos
  // 2. Llamar /api/dte/transmitir con ese ID
  // 3. Mostrar resultado
  const emitirNR = async () => {
    if (carrito.length === 0) {
      setAlerta({ titulo: 'Sin productos', mensaje: 'Agregá al menos un producto para emitir la Nota de Remisión.', tipo: 'error' })
      return
    }
    if (!clienteSel) {
      setAlerta({ titulo: 'Sin receptor', mensaje: 'Seleccioná el receptor de la mercadería (cliente).', tipo: 'error' })
      return
    }

    setTransmitiendo(true)
    try {
      // Calcular subtotal (NR no tiene IVA, pero registramos el valor de los bienes)
      const subtotal = carrito.reduce((s, it) => s + (it.precio * it.qty), 0)

      // Generar correlativo dentro de una transacción para evitar duplicados.
      // Primero buscamos el ID del documento de configuración (firestore lo genera
      // automáticamente, no tiene ID fijo como 'principal').
      const configQuery = await getDocs(query(collection(db, 'configuracion'), limit(1)))
      if (configQuery.empty) {
        throw new Error('No hay documento de configuración en Firestore. Configurá la empresa primero.')
      }
      const configDocId = configQuery.docs[0].id

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

        // Crear operación en Firestore
        const opRef = doc(collection(db, 'operaciones'))
        operacionId = opRef.id

        tx.set(opRef, {
          tipoDte: 'NR',
          numero: numeroDte,
          numeroControl: numeroDte,
          codigoGeneracion,
          cliente: clienteSel.nombre,
          nit: clienteSel.nit || '',
          dui: clienteSel.dui || '',
          nrc: clienteSel.nrc || '',
          codActividad: clienteSel.codActividad || '',
          descActividad: clienteSel.descActividad || '',
          codDep: clienteSel.codDep || '',
          codMun: clienteSel.codMun || '',
          codDistrito: clienteSel.codDistrito || '',
          direccion: clienteSel.direccion || clienteSel.complemento || '',
          telefono: clienteSel.telefono || '',
          correo: clienteSel.email || '',
          // Datos específicos de NR
          tipoTraslado,
          bienTitulo,
          observaciones: observaciones.trim() || '',
          // Items
          items: carrito.map(c => ({
            id: c.id, codigo: c.codigo, nombre: c.nombre,
            precioBase: c.precio, qty: c.qty,
            subtotal: c.precio * c.qty,
          })),
          subtotal,
          total: subtotal, // NR no tiene IVA
          dte_estado: 'PENDIENTE',
          dte_ambiente: empresa.dte_ambiente || '00',
          emisor: { uid: user?.uid || '', nombre: user?.displayName || user?.email || '' },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        // Actualizar correlativo
        tx.update(configRef, { correlativo_NR: correlativoNuevo })
      })

      // Transmitir al MH
      const resp = await fetch('/api/dte/transmitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operacionId,  // El backend debe soportar este parámetro alternativo a ventaId
          ventaId: operacionId,  // Compatibilidad con backend actual
          ambiente: '00'
        })
      })
      const data = await resp.json()

      if (data.estado === 'PROCESADO') {
        setAlerta({
          titulo: 'NR transmitida correctamente',
          mensaje: `Número: ${numeroDte}\nSello MH: ${data.selloRecibido?.slice(0, 20)}...`,
          tipo: 'exito'
        })
        setModalNueva(false)
        limpiarForm()
      } else if (data.estado === 'RECHAZADO') {
        const motivo = data.detalleMH?.descripcionMsg || data.observaciones?.join('\n') || 'Sin detalle'
        setAlerta({
          titulo: 'MH rechazó la NR',
          mensaje: `Motivo: ${motivo}\n\nLa NR quedó guardada como PENDIENTE. Podés revisarla y reintentar.`,
          tipo: 'error'
        })
        setModalNueva(false)
        limpiarForm()
      } else {
        setAlerta({
          titulo: 'NR pendiente',
          mensaje: 'No se obtuvo respuesta del MH. La NR quedó guardada para retransmitir luego.',
          tipo: 'error'
        })
        setModalNueva(false)
        limpiarForm()
      }
    } catch (e) {
      setAlerta({ titulo: 'Error al emitir NR', mensaje: e.message, tipo: 'error' })
    }
    setTransmitiendo(false)
  }

  return (
    <>
      <style>{`
        .nr-acciones { display: flex; justify-content: flex-end; margin-bottom: 16px; }
        .nr-tabla-vacia { text-align: center; padding: 60px 20px; color: var(--muted); }
        .nr-tabla-vacia .icono { font-size: 56px; opacity: 0.4; margin-bottom: 12px; }
        .nr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(6px); }
        .nr-modal { background: var(--surface); border: 1.5px solid var(--border); border-radius: 18px; padding: 24px 28px; max-width: 880px; width: 100%; max-height: 92vh; overflow-y: auto; box-shadow: 0 25px 80px rgba(0,0,0,0.5); }
        .nr-modal-title { font-size: 18px; font-weight: 800; margin-bottom: 4px; }
        .nr-modal-sub { font-size: 12px; color: var(--muted); margin-bottom: 18px; }
        .nr-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .nr-section { padding: 14px; background: var(--surface2); border-radius: 12px; margin-bottom: 14px; }
        .nr-section-title { font-size: 11px; font-weight: 800; color: var(--muted); letter-spacing: 1px; margin-bottom: 10px; text-transform: uppercase; }
        .nr-resultado { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-top: 4px; max-height: 240px; overflow-y: auto; }
        .nr-resultado-item { padding: 8px 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); }
        .nr-resultado-item:hover { background: rgba(74,143,232,0.08); }
        .nr-resultado-item:last-child { border-bottom: none; }
        .nr-cliente-sel { background: rgba(74,143,232,0.08); border: 1.5px solid rgba(74,143,232,0.3); border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; }
        .nr-carrito-item { display: grid; grid-template-columns: 1fr 80px 90px 32px; gap: 10px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--border); }
        .nr-carrito-item:last-child { border-bottom: none; }
      `}</style>

      <div className="nr-acciones">
        {puede('crear_facturas') && (
          <button className="btn btn-primary" onClick={() => setModalNueva(true)}>
            + Nueva Nota de Remisión
          </button>
        )}
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            🔄 Cargando operaciones...
          </div>
        ) : operaciones.length === 0 ? (
          <div className="nr-tabla-vacia">
            <div className="icono">🚚</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No hay Notas de Remisión emitidas</div>
            <div style={{ fontSize: 12 }}>Tap "+ Nueva Nota de Remisión" para emitir la primera.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>FECHA</th>
                  <th>N° CONTROL</th>
                  <th>RECEPTOR</th>
                  <th>NIT/DUI</th>
                  <th>TIPO TRASLADO</th>
                  <th>VALOR</th>
                  <th>ESTADO MH</th>
                </tr>
              </thead>
              <tbody>
                {operaciones.map(op => {
                  const traslado = TIPOS_TRASLADO_NR.find(t => t.value === op.tipoTraslado)
                  const estado = op.dte_estado || 'PENDIENTE'
                  const cfg = estado === 'PROCESADO' ? { bg: 'rgba(0,184,148,0.15)', color: '#00b894', text: '✓ Procesado' }
                            : estado === 'RECHAZADO' ? { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', text: '✕ Rechazado' }
                            : { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', text: '⏱ Pendiente' }
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
                      <td style={{ fontSize: 11 }}>{traslado?.label.slice(0, 30) || op.tipoTraslado}</td>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(op.total)}</td>
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
        )}
      </div>

      {/* MODAL NUEVA NR */}
      {modalNueva && (
        <div className="nr-modal-overlay" onClick={e => e.stopPropagation()}>
          <div className="nr-modal" onClick={e => e.stopPropagation()}>
            <div className="nr-modal-title">🚚 Nueva Nota de Remisión</div>
            <div className="nr-modal-sub">
              Traslado de mercadería sin facturación inmediata.
              Cuando se cobre, la FE/CCF debe referenciar esta NR.
            </div>

            {/* RECEPTOR */}
            <div className="nr-section">
              <div className="nr-section-title">RECEPTOR DE LA MERCADERÍA</div>
              {clienteSel ? (
                <div className="nr-cliente-sel">
                  <div>
                    <div style={{ fontWeight: 700 }}>👤 {clienteSel.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {clienteSel.nit && `NIT: ${clienteSel.nit}`}
                      {clienteSel.dui && !clienteSel.nit && `DUI: ${clienteSel.dui}`}
                      {clienteSel.nrc && ` · NRC: ${clienteSel.nrc}`}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setClienteSel(null); setBusquedaCli('') }}>✕</button>
                </div>
              ) : (
                <>
                  <input
                    className="input"
                    placeholder="🔍 Buscar cliente por nombre, NIT o DUI..."
                    value={busquedaCli}
                    onChange={e => setBusquedaCli(e.target.value)}
                  />
                  {clientesFiltrados.length > 0 && (
                    <div className="nr-resultado">
                      {clientesFiltrados.map(c => (
                        <div key={c.id} className="nr-resultado-item" onClick={() => { setClienteSel(c); setBusquedaCli('') }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                              {c.nit && `NIT: ${c.nit}`}
                              {c.dui && !c.nit && `DUI: ${c.dui}`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* PRODUCTOS */}
            <div className="nr-section">
              <div className="nr-section-title">PRODUCTOS A TRASLADAR</div>
              <input
                className="input"
                placeholder="🔍 Buscar producto por nombre o código..."
                value={busquedaProd}
                onChange={e => setBusquedaProd(e.target.value)}
              />
              {productosFiltrados.length > 0 && (
                <div className="nr-resultado">
                  {productosFiltrados.map(p => (
                    <div key={p.id} className="nr-resultado-item" onClick={() => agregarProducto(p)}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.codigo} · Stock: {p.stock || 0}</div>
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(p.precio)}</div>
                    </div>
                  ))}
                </div>
              )}
              {carrito.length > 0 && (
                <div style={{ marginTop: 12, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  {carrito.map(it => (
                    <div key={it.id} className="nr-carrito-item">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{it.nombre}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{it.codigo}</div>
                      </div>
                      <input
                        type="number"
                        min="1" step="0.01"
                        className="input"
                        value={it.qty}
                        onChange={e => cambiarQty(it.id, e.target.value)}
                        style={{ padding: '6px 8px', fontSize: 13 }}
                      />
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right' }}>{fmt(it.precio * it.qty)}</div>
                      <button className="btn btn-ghost btn-sm" style={{ padding: 6 }} onClick={() => removerProducto(it.id)}>✕</button>
                    </div>
                  ))}
                  <div style={{ padding: '10px 12px', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>VALOR DE LOS BIENES</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 16 }}>
                      {fmt(carrito.reduce((s, it) => s + (it.precio * it.qty), 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* DATOS DEL TRASLADO */}
            <div className="nr-section">
              <div className="nr-section-title">DATOS DEL TRASLADO</div>
              <div className="nr-grid-2">
                <div className="form-group">
                  <label className="form-label">TIPO DE TRASLADO *</label>
                  <select className="input" value={tipoTraslado} onChange={e => setTipoTraslado(e.target.value)}>
                    {TIPOS_TRASLADO_NR.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">TÍTULO DEL BIEN *</label>
                  <select className="input" value={bienTitulo} onChange={e => setBienTitulo(e.target.value)}>
                    {BIEN_TITULOS_NR.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 10 }}>
                <label className="form-label">OBSERVACIONES (opcional)</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Ej: Traslado a sucursal Santa Ana para feria comercial..."
                  value={observaciones}
                  onChange={e => setObservaciones(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { setModalNueva(false); limpiarForm() }} disabled={transmitiendo}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={emitirNR} disabled={transmitiendo}>
                {transmitiendo ? '⏳ Transmitiendo al MH...' : '📡 Emitir y Transmitir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════
// MÓDULO FSE — Facturas Sujeto Excluido
// Flujo: seleccionar/registrar proveedor → describir compra → emitir
// ════════════════════════════════════════════════════════════════════
function ModuloFSE({ proveedores, empresa, operaciones, loading, user, puede, setAlerta }) {
  const [modalNueva, setModalNueva] = useState(false)
  const [modalProveedor, setModalProveedor] = useState(false)
  const [provSel, setProvSel] = useState(null)
  const [busquedaProv, setBusquedaProv] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [precioUni, setPrecioUni] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [transmitiendo, setTransmitiendo] = useState(false)

  // Formulario nuevo proveedor
  const emptyProv = { nombre: '', dui: '', telefono: '', email: '', codDep: '', codMun: '', codDistrito: '', distrito: '', complemento: '', codActividad: '', descActividad: '' }
  const [formProv, setFormProv] = useState(emptyProv)
  const [guardandoProv, setGuardandoProv] = useState(false)

  const proveedoresFiltrados = busquedaProv.trim()
    ? proveedores.filter(p =>
        p.nombre?.toLowerCase().includes(busquedaProv.toLowerCase()) ||
        p.dui?.includes(busquedaProv)
      ).slice(0, 6)
    : []

  const totalCompra = (parseFloat(cantidad) || 0) * (parseFloat(precioUni) || 0)

  // Retenciones automáticas según monto (reglas MH)
  // Renta: 10% sobre el monto si supera $113.33 (mínimo legal)
  // IVA: 13% si supera $113.33 (al ser sujeto excluido, vos retenés el IVA y lo declarás)
  const aplicaRetencion = totalCompra > 113.33
  const reteRenta = aplicaRetencion ? totalCompra * 0.10 : 0
  // Nota: el IVA para sujeto excluido NO se retiene en el FSE típico — es solo renta.

  // ── GUARDAR PROVEEDOR ──
  const guardarProveedor = async () => {
    if (!formProv.nombre.trim()) {
      setAlerta({ titulo: 'Nombre requerido', mensaje: 'Ingresá el nombre del proveedor.', tipo: 'error' })
      return
    }
    if (!esDUIValido(formProv.dui)) {
      setAlerta({ titulo: 'DUI inválido', mensaje: 'El DUI debe tener 9 dígitos. Formato: 12345678-9', tipo: 'error' })
      return
    }
    // El MH exige actividad económica para sujetos excluidos en la FSE.
    // Sin esto el MH rechaza con "codActividad/descActividad no cumple el formato".
    if (!formProv.codActividad || !formProv.descActividad) {
      setAlerta({ titulo: 'Actividad económica requerida', mensaje: 'El MH exige que el sujeto excluido tenga actividad económica registrada (CAT-019). Seleccioná una del catálogo.', tipo: 'error' })
      return
    }
    setGuardandoProv(true)
    try {
      // Limpiar el DUI: guardar SIN guiones (el MH lo exige así)
      const duiLimpio = limpiarDoc(formProv.dui)
      const direccion = buildComplemento(formProv.distrito, formProv.complemento)
      const data = { ...formProv, dui: duiLimpio, direccion, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      const ref = await addDoc(collection(db, 'proveedores'), data)
      // Auto-seleccionar el nuevo proveedor
      setProvSel({ id: ref.id, ...data })
      setModalProveedor(false)
      setFormProv(emptyProv)
    } catch (e) {
      setAlerta({ titulo: 'Error al guardar', mensaje: e.message, tipo: 'error' })
    }
    setGuardandoProv(false)
  }

  // ── EMITIR FSE ──
  const emitirFSE = async () => {
    if (!provSel) {
      setAlerta({ titulo: 'Sin proveedor', mensaje: 'Seleccioná o registrá el proveedor (sujeto excluido).', tipo: 'error' })
      return
    }
    // Validar que el proveedor tenga actividad económica (el MH lo exige).
    // Si fue creado antes de este fix, podría no tenerla. Hay que editarlo.
    if (!provSel.codActividad || !provSel.descActividad) {
      setAlerta({
        titulo: 'Proveedor sin actividad económica',
        mensaje: 'El proveedor seleccionado no tiene actividad económica registrada. El MH exige este campo.\n\nEditá el proveedor (desde el botón "+ Nuevo" buscalo, registralo de nuevo con actividad) o creá uno nuevo con actividad económica.',
        tipo: 'error'
      })
      return
    }
    // Validar formato del DUI (debe ser 9 dígitos sin guion para el MH)
    const duiLimpio = limpiarDoc(provSel.dui)
    if (!esDUIValido(duiLimpio)) {
      setAlerta({
        titulo: 'DUI inválido del proveedor',
        mensaje: 'El DUI del proveedor no tiene 9 dígitos. Editá el proveedor con un DUI válido.',
        tipo: 'error'
      })
      return
    }
    if (!descripcion.trim()) {
      setAlerta({ titulo: 'Falta descripción', mensaje: 'Describí qué fue lo que compraste o el servicio recibido.', tipo: 'error' })
      return
    }
    if (totalCompra <= 0) {
      setAlerta({ titulo: 'Monto inválido', mensaje: 'Ingresá cantidad y precio unitario válidos.', tipo: 'error' })
      return
    }

    setTransmitiendo(true)
    try {
      // Buscar el doc de configuración (Firestore genera ID automático)
      const configQuery = await getDocs(query(collection(db, 'configuracion'), limit(1)))
      if (configQuery.empty) {
        throw new Error('No hay documento de configuración en Firestore. Configurá la empresa primero.')
      }
      const configDocId = configQuery.docs[0].id

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
          numero: numeroDte,
          numeroControl: numeroDte,
          codigoGeneracion,
          // Datos del sujeto excluido (receptor desde la perspectiva del DTE)
          cliente: provSel.nombre,
          dui: duiLimpio,
          codActividad: provSel.codActividad || '',
          descActividad: provSel.descActividad || '',
          codDep: provSel.codDep || '',
          codMun: provSel.codMun || '',
          codDistrito: provSel.codDistrito || '',
          direccion: provSel.direccion || provSel.complemento || '',
          telefono: provSel.telefono || '',
          correo: provSel.email || '',
          // Datos de la compra
          items: [{
            nombre: descripcion.trim(),
            qty: parseFloat(cantidad),
            precioBase: parseFloat(precioUni),
            subtotal: totalCompra,
          }],
          subtotal: totalCompra,
          total: totalCompra,
          reteRenta,
          observaciones: observaciones.trim() || '',
          dte_estado: 'PENDIENTE',
          dte_ambiente: empresa.dte_ambiente || '00',
          emisor: { uid: user?.uid || '', nombre: user?.displayName || user?.email || '' },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        tx.update(configRef, { correlativo_FSE: correlativoNuevo })
      })

      // Transmitir
      const resp = await fetch('/api/dte/transmitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operacionId, ventaId: operacionId, ambiente: '00'
        })
      })
      const data = await resp.json()

      if (data.estado === 'PROCESADO') {
        setAlerta({
          titulo: 'FSE transmitida correctamente',
          mensaje: `Número: ${numeroDte}\nSello MH: ${data.selloRecibido?.slice(0, 20)}...`,
          tipo: 'exito'
        })
        setModalNueva(false)
        // Limpiar form
        setProvSel(null); setDescripcion(''); setCantidad('1'); setPrecioUni(''); setObservaciones('')
      } else if (data.estado === 'RECHAZADO') {
        const motivo = data.detalleMH?.descripcionMsg || data.observaciones?.join('\n') || 'Sin detalle'
        setAlerta({
          titulo: 'MH rechazó la FSE',
          mensaje: `Motivo: ${motivo}\n\nLa FSE quedó guardada como PENDIENTE.`,
          tipo: 'error'
        })
        setModalNueva(false)
      } else {
        setAlerta({
          titulo: 'FSE pendiente',
          mensaje: 'No se obtuvo respuesta del MH. La FSE quedó guardada para retransmitir.',
          tipo: 'error'
        })
        setModalNueva(false)
      }
    } catch (e) {
      setAlerta({ titulo: 'Error al emitir FSE', mensaje: e.message, tipo: 'error' })
    }
    setTransmitiendo(false)
  }

  return (
    <>
      <div className="nr-acciones">
        {puede('crear_facturas') && (
          <button className="btn btn-primary" onClick={() => setModalNueva(true)}>
            + Nueva FSE
          </button>
        )}
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>🔄 Cargando...</div>
        ) : operaciones.length === 0 ? (
          <div className="nr-tabla-vacia">
            <div className="icono">💰</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No hay FSE emitidas</div>
            <div style={{ fontSize: 12 }}>Tap "+ Nueva FSE" para registrar la primera compra a sujeto excluido.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>FECHA</th>
                  <th>N° CONTROL</th>
                  <th>PROVEEDOR</th>
                  <th>DUI</th>
                  <th>DESCRIPCIÓN</th>
                  <th>MONTO</th>
                  <th>RET. RENTA</th>
                  <th>ESTADO MH</th>
                </tr>
              </thead>
              <tbody>
                {operaciones.map(op => {
                  const estado = op.dte_estado || 'PENDIENTE'
                  const cfg = estado === 'PROCESADO' ? { bg: 'rgba(0,184,148,0.15)', color: '#00b894', text: '✓ Procesado' }
                            : estado === 'RECHAZADO' ? { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', text: '✕ Rechazado' }
                            : { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', text: '⏱ Pendiente' }
                  const desc = op.items?.[0]?.nombre || '—'
                  return (
                    <tr key={op.id}>
                      <td style={{ fontSize: 12 }}>
                        {op.createdAt?.seconds
                          ? new Date(op.createdAt.seconds * 1000).toLocaleDateString('es-SV')
                          : '—'}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{op.numeroControl}</td>
                      <td style={{ fontWeight: 500 }}>{op.cliente}</td>
                      <td className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{op.dui || '—'}</td>
                      <td style={{ fontSize: 12, maxWidth: 240 }}>{desc.length > 40 ? desc.slice(0, 40) + '...' : desc}</td>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(op.total)}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: op.reteRenta > 0 ? '#f59e0b' : 'var(--muted)' }}>
                        {op.reteRenta > 0 ? fmt(op.reteRenta) : '—'}
                      </td>
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
        )}
      </div>

      {/* MODAL NUEVA FSE */}
      {modalNueva && (
        <div className="nr-modal-overlay" onClick={e => e.stopPropagation()}>
          <div className="nr-modal" onClick={e => e.stopPropagation()}>
            <div className="nr-modal-title">💰 Nueva Factura Sujeto Excluido</div>
            <div className="nr-modal-sub">
              Documento que <strong>vos emitís</strong> al pagarle a alguien sin NIT/NRC.
              Te sirve para deducir el gasto. Si supera $113.33, retenés 10% de renta.
            </div>

            {/* PROVEEDOR */}
            <div className="nr-section">
              <div className="nr-section-title">PROVEEDOR (SUJETO EXCLUIDO)</div>
              {provSel ? (
                <div className="nr-cliente-sel">
                  <div>
                    <div style={{ fontWeight: 700 }}>🧑 {provSel.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      DUI: {provSel.dui || '—'}
                      {provSel.telefono && ` · Tel: ${provSel.telefono}`}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setProvSel(null); setBusquedaProv('') }}>✕</button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input"
                      placeholder="🔍 Buscar proveedor por nombre o DUI..."
                      value={busquedaProv}
                      onChange={e => setBusquedaProv(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button className="btn btn-ghost" onClick={() => setModalProveedor(true)}>
                      + Nuevo
                    </button>
                  </div>
                  {proveedoresFiltrados.length > 0 && (
                    <div className="nr-resultado">
                      {proveedoresFiltrados.map(p => (
                        <div key={p.id} className="nr-resultado-item" onClick={() => { setProvSel(p); setBusquedaProv('') }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>DUI: {p.dui}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {busquedaProv && proveedoresFiltrados.length === 0 && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                      No se encontró. <button className="btn btn-ghost btn-sm" onClick={() => setModalProveedor(true)}>Registrar nuevo proveedor</button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* DETALLE DE LA COMPRA */}
            <div className="nr-section">
              <div className="nr-section-title">DETALLE DE LA COMPRA</div>
              <div className="form-group">
                <label className="form-label">DESCRIPCIÓN *</label>
                <input
                  className="input"
                  placeholder="Ej: Servicio de albañilería, 3 días de trabajo..."
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                />
              </div>
              <div className="nr-grid-2" style={{ marginTop: 10 }}>
                <div className="form-group">
                  <label className="form-label">CANTIDAD *</label>
                  <input
                    type="number"
                    className="input"
                    min="0" step="0.01"
                    value={cantidad}
                    onChange={e => setCantidad(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">PRECIO UNITARIO *</label>
                  <input
                    type="number"
                    className="input"
                    min="0" step="0.01"
                    placeholder="0.00"
                    value={precioUni}
                    onChange={e => setPrecioUni(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 10 }}>
                <label className="form-label">OBSERVACIONES (opcional)</label>
                <textarea
                  className="input"
                  rows={2}
                  value={observaciones}
                  onChange={e => setObservaciones(e.target.value)}
                />
              </div>
            </div>

            {/* RESUMEN */}
            <div className="nr-section" style={{ background: 'rgba(74,143,232,0.06)' }}>
              <div className="nr-section-title">RESUMEN</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                <span>Subtotal:</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(totalCompra)}</span>
              </div>
              {aplicaRetencion && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: '#f59e0b' }}>
                  <span>(-) Retención Renta 10%:</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(reteRenta)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', fontSize: 15, fontWeight: 800, borderTop: '1.5px solid var(--border)', marginTop: 4 }}>
                <span>NETO A PAGAR:</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{fmt(totalCompra - reteRenta)}</span>
              </div>
              {!aplicaRetencion && totalCompra > 0 && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8, fontStyle: 'italic' }}>
                  ℹ️ El monto es ≤ $113.33, no aplica retención de renta.
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalNueva(false)} disabled={transmitiendo}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={emitirFSE} disabled={transmitiendo}>
                {transmitiendo ? '⏳ Transmitiendo...' : '📡 Emitir y Transmitir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVO PROVEEDOR */}
      {modalProveedor && (
        <div className="nr-modal-overlay" onClick={e => e.stopPropagation()}>
          <div className="nr-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="nr-modal-title">+ Nuevo Proveedor (Sujeto Excluido)</div>
            <div className="nr-modal-sub">Personas naturales sin NIT/NRC a quienes les comprás bienes o servicios.</div>

            <div className="form-group">
              <label className="form-label">NOMBRE COMPLETO *</label>
              <input className="input" placeholder="Nombre completo" value={formProv.nombre} onChange={e => setFormProv(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="nr-grid-2">
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
              <input className="input" placeholder="correo@ejemplo.com" value={formProv.email} onChange={e => setFormProv(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">ACTIVIDAD ECONÓMICA <span style={{ color: '#ef4444' }}>*</span></label>
              <BuscadorActividad
                codActividad={formProv.codActividad}
                descActividad={formProv.descActividad}
                onChange={({ codigo, descripcion }) => setFormProv(f => ({ ...f, codActividad: codigo, descActividad: descripcion }))}
                placeholder="Buscar por código o descripción..."
              />
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                ⚠️ Obligatoria. El MH exige que el sujeto excluido tenga actividad económica del CAT-019.
              </div>
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
              <input className="input" style={{ marginTop: 8 }} placeholder="Complemento de dirección" value={formProv.complemento} onChange={e => setFormProv(f => ({ ...f, complemento: e.target.value }))} />
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalProveedor(false)} disabled={guardandoProv}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarProveedor} disabled={guardandoProv}>
                {guardandoProv ? '⏳ Guardando...' : '💾 Guardar Proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}