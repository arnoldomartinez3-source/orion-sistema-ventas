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
  const [pasoWizard, setPasoWizard] = useState(1) // 1=receptor, 2=productos, 3=datos del traslado
  const [carrito, setCarrito] = useState([])
  const [busquedaProd, setBusquedaProd] = useState('')
  const [clienteSel, setClienteSel] = useState(null)
  const [busquedaCli, setBusquedaCli] = useState('')
  const [tipoTraslado, setTipoTraslado] = useState('03') // Venta a cuenta (común)
  const [bienTitulo, setBienTitulo] = useState('02')      // Propio
  const [observaciones, setObservaciones] = useState('')
  // Actividad económica del receptor — el MH la exige para NR.
  // Se autocompleta del cliente si tiene una; si no, hay que seleccionarla.
  const [codActividadNR, setCodActividadNR] = useState('')
  const [descActividadNR, setDescActividadNR] = useState('')
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
    setCodActividadNR(''); setDescActividadNR('')
    setPasoWizard(1)
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
    // La actividad económica del receptor es obligatoria para el MH en NR.
    // Si el cliente no la tiene, hay que seleccionarla manualmente.
    if (!codActividadNR || !descActividadNR) {
      setAlerta({
        titulo: 'Actividad económica requerida',
        mensaje: 'El MH exige la actividad económica del receptor. Seleccionala del catálogo (representa la actividad por la que se traslada la mercadería).',
        tipo: 'error'
      })
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
          // Actividad económica del receptor (el MH lo exige).
          // Se autocompletó del cliente si tenía, o el usuario la seleccionó.
          codActividad: codActividadNR,
          descActividad: descActividadNR,
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
        /* ─── BOTONES DE ACCIÓN PRINCIPALES ─── */
        .nr-acciones { display: flex; justify-content: flex-end; margin-bottom: 16px; }

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
        .btn-nueva-op-icono {
          font-size: 28px; width: 48px; height: 48px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 12px;
        }
        .btn-nueva-nr .btn-nueva-op-icono { background: rgba(59,130,246,0.10); }
        .btn-nueva-fse .btn-nueva-op-icono { background: rgba(245,158,11,0.10); }
        .btn-nueva-op-titulo { display: block; font-weight: 700; font-size: 14px; }
        .btn-nueva-op-sub { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; }
        .btn-nueva-op-plus {
          font-size: 22px; font-weight: 300;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 50%; margin-left: 4px;
        }
        .btn-nueva-nr .btn-nueva-op-plus { background: #3b82f6; color: white; }
        .btn-nueva-fse .btn-nueva-op-plus { background: #f59e0b; color: white; }

        .nr-tabla-vacia { text-align: center; padding: 60px 20px; color: var(--muted); }
        .nr-tabla-vacia .icono { font-size: 56px; opacity: 0.4; margin-bottom: 12px; }

        /* ═══ WIZARD / MODAL UNIFICADO ═══ */
        .wiz-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(15,23,42,0.7);
          backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
          animation: wiz-overlay-in 0.2s ease;
        }
        @keyframes wiz-overlay-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .wiz-modal {
          background: var(--surface);
          border-radius: 20px;
          box-shadow: 0 30px 90px rgba(0,0,0,0.4);
          max-width: 720px; width: 100%;
          max-height: 92vh;
          display: flex; flex-direction: column;
          overflow: hidden;
          animation: wiz-modal-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes wiz-modal-in {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .wiz-modal-nr { border-top: 4px solid #3b82f6; }
        .wiz-modal-fse { border-top: 4px solid #f59e0b; }

        /* ─── HEADER ─── */
        .wiz-header {
          padding: 20px 24px 16px;
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 16px;
        }
        .wiz-eyebrow {
          font-size: 10px; font-weight: 800;
          letter-spacing: 1.5px;
          color: #3b82f6;
          margin-bottom: 6px;
        }
        .wiz-header-fse .wiz-eyebrow { color: #f59e0b; }
        .wiz-titulo {
          font-size: 19px; font-weight: 800;
          color: var(--text); line-height: 1.3;
        }
        .wiz-cerrar {
          width: 36px; height: 36px;
          border-radius: 10px;
          background: var(--surface2);
          border: none; cursor: pointer;
          font-size: 14px; color: var(--muted);
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .wiz-cerrar:hover { background: rgba(239,68,68,0.12); color: #ef4444; }

        /* ─── PROGRESO DEL WIZARD ─── */
        .wiz-progreso {
          display: flex;
          padding: 0 24px 14px;
          gap: 10px;
        }
        .wiz-paso {
          display: flex; align-items: center; gap: 8px;
          flex: 1; opacity: 0.4;
          transition: opacity 0.3s;
        }
        .wiz-paso.activo { opacity: 1; }
        .wiz-paso-circ {
          width: 28px; height: 28px;
          border-radius: 50%;
          background: var(--surface2);
          color: var(--muted);
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700;
          transition: all 0.3s;
        }
        .wiz-paso.activo .wiz-paso-circ {
          background: #3b82f6; color: white;
        }
        .wiz-paso.actual .wiz-paso-circ {
          box-shadow: 0 0 0 4px rgba(59,130,246,0.15);
        }
        .wiz-paso-label {
          font-size: 12px; font-weight: 600;
          color: var(--muted);
        }
        .wiz-paso.activo .wiz-paso-label { color: var(--text); }

        /* ─── CUERPO ─── */
        .wiz-cuerpo {
          padding: 6px 24px 16px;
          overflow-y: auto;
          flex: 1;
        }
        .wiz-paso-contenido {
          animation: wiz-fade-in 0.25s ease;
        }
        @keyframes wiz-fade-in {
          from { opacity: 0; transform: translateX(8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .wiz-ayuda {
          font-size: 12px; color: var(--muted);
          margin-bottom: 14px; line-height: 1.5;
        }

        /* ─── BUSCADOR ─── */
        .wiz-buscador {
          display: flex; align-items: center;
          background: var(--surface2);
          border: 1.5px solid transparent;
          border-radius: 12px;
          padding: 4px 4px 4px 14px;
          gap: 10px;
          transition: all 0.15s;
        }
        .wiz-buscador:focus-within {
          background: var(--surface);
          border-color: rgba(59,130,246,0.4);
          box-shadow: 0 0 0 4px rgba(59,130,246,0.08);
        }
        .wiz-buscador-icono { font-size: 14px; color: var(--muted); }
        .wiz-input {
          flex: 1; background: transparent;
          border: none; outline: none;
          padding: 12px 0; font-size: 14px;
          color: var(--text);
          font-family: inherit;
        }
        .wiz-input::placeholder { color: var(--muted); }
        .wiz-buscador-accion {
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 12px; font-weight: 600;
          cursor: pointer; color: var(--text);
          flex-shrink: 0;
        }
        .wiz-buscador-accion:hover {
          background: #f59e0b; color: white; border-color: #f59e0b;
        }

        /* ─── RESULTADOS DE BÚSQUEDA ─── */
        .wiz-resultados {
          margin-top: 8px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          max-height: 280px; overflow-y: auto;
        }
        .wiz-resultado {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px;
          cursor: pointer;
          border-bottom: 1px solid var(--border);
          transition: all 0.12s;
        }
        .wiz-resultado:last-child { border-bottom: none; }
        .wiz-resultado:hover {
          background: rgba(59,130,246,0.06);
        }
        .wiz-modal-fse .wiz-resultado:hover {
          background: rgba(245,158,11,0.06);
        }
        .wiz-resultado-avatar {
          width: 36px; height: 36px;
          border-radius: 10px;
          background: var(--surface2);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }
        .wiz-resultado-nombre { font-weight: 600; font-size: 13px; }
        .wiz-resultado-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
        .wiz-resultado-precio { font-family: var(--mono); font-weight: 700; font-size: 13px; }
        .wiz-resultado-flecha {
          width: 28px; height: 28px;
          border-radius: 50%;
          background: var(--surface2);
          color: var(--muted);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: 600;
          transition: all 0.15s;
        }
        .wiz-resultado:hover .wiz-resultado-flecha {
          background: #3b82f6; color: white;
          transform: translateX(2px);
        }
        .wiz-modal-fse .wiz-resultado:hover .wiz-resultado-flecha {
          background: #f59e0b;
        }

        /* ─── TARJETA SELECCIONADA ─── */
        .wiz-tarjeta-sel {
          display: flex; align-items: center; gap: 14px;
          padding: 16px;
          background: rgba(59,130,246,0.06);
          border: 1.5px solid rgba(59,130,246,0.25);
          border-radius: 14px;
        }
        .wiz-modal-fse .wiz-tarjeta-sel {
          background: rgba(245,158,11,0.06);
          border-color: rgba(245,158,11,0.25);
        }
        .wiz-tarjeta-avatar {
          width: 48px; height: 48px;
          border-radius: 12px;
          background: var(--surface);
          display: flex; align-items: center; justify-content: center;
          font-size: 22px;
          flex-shrink: 0;
        }
        .wiz-tarjeta-info { flex: 1; min-width: 0; }
        .wiz-tarjeta-nombre { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
        .wiz-tarjeta-datos {
          display: flex; gap: 14px; flex-wrap: wrap;
          font-size: 11px; color: var(--muted);
        }
        .wiz-tarjeta-actividad {
          font-size: 11px; color: var(--muted);
          margin-top: 4px;
        }
        .wiz-tarjeta-quitar {
          background: transparent; border: 1px solid var(--border);
          padding: 8px 14px; border-radius: 8px;
          font-size: 11px; font-weight: 600; color: var(--muted);
          cursor: pointer; transition: all 0.15s;
        }
        .wiz-tarjeta-quitar:hover {
          color: #ef4444; border-color: #ef4444;
        }

        /* ─── CARRITO (PASO 2 DE NR) ─── */
        .wiz-carrito {
          margin-top: 14px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          overflow: hidden;
        }
        .wiz-carrito-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 16px;
          background: var(--surface2);
          font-size: 11px; font-weight: 700;
          letter-spacing: 0.5px;
          color: var(--muted);
        }
        .wiz-carrito-item {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
        }
        .wiz-carrito-item:last-child { border-bottom: none; }
        .wiz-carrito-nombre { font-size: 13px; font-weight: 600; }
        .wiz-carrito-codigo { font-size: 10px; color: var(--muted); margin-top: 2px; }
        .wiz-carrito-cant {
          display: flex; align-items: center; gap: 0;
          background: var(--surface2);
          border-radius: 8px;
          overflow: hidden;
        }
        .wiz-cant-btn {
          width: 28px; height: 28px;
          background: transparent; border: none;
          cursor: pointer; font-size: 14px;
          color: var(--text);
          transition: all 0.12s;
        }
        .wiz-cant-btn:hover:not(:disabled) { background: var(--border); }
        .wiz-cant-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .wiz-cant-input {
          width: 40px; height: 28px;
          background: transparent; border: none;
          text-align: center; font-size: 13px;
          font-weight: 600; color: var(--text);
          font-family: var(--mono);
          outline: none;
        }
        .wiz-carrito-total {
          font-family: var(--mono); font-weight: 700;
          font-size: 13px;
          min-width: 80px; text-align: right;
        }
        .wiz-carrito-eliminar {
          width: 28px; height: 28px;
          border-radius: 50%;
          background: transparent; border: none;
          color: var(--muted); cursor: pointer;
          font-size: 12px;
          transition: all 0.12s;
        }
        .wiz-carrito-eliminar:hover {
          background: rgba(239,68,68,0.1); color: #ef4444;
        }

        /* ─── ESTADO VACÍO ─── */
        .wiz-vacio {
          text-align: center;
          padding: 30px 20px;
          color: var(--muted); font-size: 13px;
          background: var(--surface2);
          border-radius: 12px;
          margin-top: 8px;
        }

        /* ─── RESUMEN (PASO 3 DE NR) ─── */
        .wiz-resumen-card {
          background: linear-gradient(135deg, rgba(59,130,246,0.05), rgba(59,130,246,0.02));
          border: 1px solid rgba(59,130,246,0.15);
          border-radius: 14px;
          padding: 14px 18px;
        }
        .wiz-resumen-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 6px 0;
          font-size: 13px;
        }
        .wiz-resumen-row:not(:last-child) {
          border-bottom: 1px dashed rgba(59,130,246,0.15);
        }
        .wiz-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        /* ═══ FSE — VISTA ÚNICA ESTILO FACTURA ═══ */
        .wiz-cuerpo-fse { padding-bottom: 8px; }

        .fse-section {
          display: flex; gap: 14px;
          padding: 14px 0;
          border-bottom: 1px dashed var(--border);
        }
        .fse-section:last-of-type { border-bottom: none; }
        .fse-section-num {
          width: 28px; height: 28px;
          border-radius: 50%;
          background: rgba(245,158,11,0.12);
          color: #f59e0b;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700;
          flex-shrink: 0; margin-top: 2px;
        }
        .fse-section-body { flex: 1; min-width: 0; }
        .fse-section-titulo {
          font-size: 13px; font-weight: 700;
          margin-bottom: 10px;
          color: var(--text);
        }

        .fse-monto-row {
          display: flex; align-items: flex-end; gap: 10px;
        }
        .fse-monto-x, .fse-monto-igual {
          font-size: 18px; font-weight: 700;
          color: var(--muted);
          padding-bottom: 14px;
        }
        .fse-input-mono { font-family: var(--mono); font-weight: 600; }
        .fse-subtotal-display {
          background: rgba(245,158,11,0.08);
          border: 1.5px solid rgba(245,158,11,0.25);
          border-radius: 10px;
          padding: 12px 14px;
          font-family: var(--mono); font-weight: 700;
          font-size: 16px; color: #f59e0b;
          text-align: right;
        }

        .fse-resumen {
          margin-top: 18px;
          padding: 16px 20px;
          background: linear-gradient(135deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02));
          border: 1px solid rgba(245,158,11,0.2);
          border-radius: 14px;
        }
        .fse-resumen-titulo {
          font-size: 10px; font-weight: 800;
          letter-spacing: 1px;
          color: #f59e0b;
          margin-bottom: 10px;
        }
        .fse-resumen-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 5px 0; font-size: 13px;
        }
        .fse-num { font-family: var(--mono); font-weight: 600; }
        .fse-resumen-retencion { color: #ef4444; }
        .fse-resumen-total {
          padding-top: 10px; margin-top: 6px;
          border-top: 2px solid rgba(245,158,11,0.25);
          font-size: 15px; font-weight: 800;
        }
        .fse-resumen-total .fse-num { font-size: 18px; color: #f59e0b; }
        .fse-resumen-nota {
          font-size: 11px; color: var(--muted);
          margin-top: 8px; font-style: italic;
        }
        .fse-info {
          margin-left: 4px; opacity: 0.6;
          font-size: 11px; cursor: help;
        }

        /* ─── FOOTER ─── */
        .wiz-footer {
          padding: 16px 24px;
          border-top: 1px solid var(--border);
          background: var(--surface2);
          display: flex; justify-content: space-between; align-items: center;
          gap: 12px;
        }
        .wiz-paso-indicador {
          font-size: 11px; color: var(--muted);
          font-weight: 600;
        }

        /* ─── RESPONSIVE ─── */
        @media (max-width: 640px) {
          .wiz-modal { max-height: 100vh; border-radius: 0; max-width: 100%; }
          .wiz-overlay { padding: 0; }
          .wiz-header { padding: 16px 18px 12px; }
          .wiz-titulo { font-size: 16px; }
          .wiz-cuerpo { padding: 6px 18px 16px; }
          .wiz-footer { padding: 12px 18px; flex-wrap: wrap; }
          .wiz-paso-indicador { width: 100%; text-align: center; order: -1; }
          .wiz-progreso { padding: 0 18px 12px; gap: 6px; }
          .wiz-paso-label { display: none; }
          .wiz-grid-2 { grid-template-columns: 1fr; }
          .fse-monto-row { flex-wrap: wrap; }
        }

        /* ═══ LEGACY: modal proveedor sigue usando el estilo anterior ═══ */
        .nr-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.7); z-index: 1100; display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(8px); }
        .nr-modal { background: var(--surface); border-radius: 18px; padding: 22px 26px; max-width: 560px; width: 100%; max-height: 92vh; overflow-y: auto; box-shadow: 0 30px 90px rgba(0,0,0,0.4); }
        .nr-modal-title { font-size: 17px; font-weight: 800; margin-bottom: 4px; }
        .nr-modal-sub { font-size: 12px; color: var(--muted); margin-bottom: 16px; }
        .nr-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      `}</style>

      <div className="nr-acciones">
        {puede('crear_facturas') && (
          <button className="btn-nueva-op btn-nueva-nr" onClick={() => { setPasoWizard(1); setModalNueva(true) }}>
            <span className="btn-nueva-op-icono">🚚</span>
            <span>
              <span className="btn-nueva-op-titulo">Nueva Nota de Remisión</span>
              <span className="btn-nueva-op-sub">Traslado de mercadería</span>
            </span>
            <span className="btn-nueva-op-plus">+</span>
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

      {/* WIZARD NUEVA NR — Diseño moderno por pasos */}
      {modalNueva && (
        <div className="wiz-overlay" onClick={e => e.stopPropagation()}>
          <div className="wiz-modal wiz-modal-nr" onClick={e => e.stopPropagation()}>

            {/* HEADER */}
            <div className="wiz-header">
              <div>
                <div className="wiz-eyebrow">🚚 NOTA DE REMISIÓN</div>
                <div className="wiz-titulo">
                  {pasoWizard === 1 && '¿A quién le trasladás la mercadería?'}
                  {pasoWizard === 2 && '¿Qué productos vas a trasladar?'}
                  {pasoWizard === 3 && 'Datos del traslado'}
                </div>
              </div>
              <button className="wiz-cerrar" onClick={() => { setModalNueva(false); limpiarForm() }} disabled={transmitiendo}>
                ✕
              </button>
            </div>

            {/* PROGRESO */}
            <div className="wiz-progreso">
              {[1, 2, 3].map(n => (
                <div key={n} className={`wiz-paso ${pasoWizard >= n ? 'activo' : ''} ${pasoWizard === n ? 'actual' : ''}`}>
                  <div className="wiz-paso-circ">{pasoWizard > n ? '✓' : n}</div>
                  <div className="wiz-paso-label">
                    {n === 1 && 'Receptor'}
                    {n === 2 && 'Productos'}
                    {n === 3 && 'Confirmar'}
                  </div>
                </div>
              ))}
            </div>

            {/* CUERPO — cambia según paso */}
            <div className="wiz-cuerpo">

              {/* PASO 1: RECEPTOR */}
              {pasoWizard === 1 && (
                <div className="wiz-paso-contenido">
                  <p className="wiz-ayuda">Buscá el cliente que va a recibir la mercadería. Si tiene NRC, los datos vienen autocompletados.</p>
                  {clienteSel ? (
                    <div className="wiz-tarjeta-sel">
                      <div className="wiz-tarjeta-avatar">👤</div>
                      <div className="wiz-tarjeta-info">
                        <div className="wiz-tarjeta-nombre">{clienteSel.nombre}</div>
                        <div className="wiz-tarjeta-datos">
                          {clienteSel.nit && <span>NIT: <strong>{clienteSel.nit}</strong></span>}
                          {clienteSel.dui && !clienteSel.nit && <span>DUI: <strong>{clienteSel.dui}</strong></span>}
                          {clienteSel.nrc && <span>NRC: <strong>{clienteSel.nrc}</strong></span>}
                        </div>
                        {clienteSel.descActividad && (
                          <div className="wiz-tarjeta-actividad">📋 {clienteSel.descActividad}</div>
                        )}
                      </div>
                      <button className="wiz-tarjeta-quitar" onClick={() => { setClienteSel(null); setBusquedaCli(''); setCodActividadNR(''); setDescActividadNR('') }}>
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="wiz-buscador">
                        <span className="wiz-buscador-icono">🔍</span>
                        <input
                          className="wiz-input"
                          placeholder="Buscar por nombre, NIT o DUI..."
                          value={busquedaCli}
                          onChange={e => setBusquedaCli(e.target.value)}
                          autoFocus
                        />
                      </div>
                      {clientesFiltrados.length > 0 && (
                        <div className="wiz-resultados">
                          {clientesFiltrados.map(c => (
                            <div key={c.id} className="wiz-resultado" onClick={() => {
                              setClienteSel(c); setBusquedaCli('')
                              if (c.codActividad && c.descActividad) {
                                setCodActividadNR(c.codActividad)
                                setDescActividadNR(c.descActividad)
                              }
                            }}>
                              <div className="wiz-resultado-avatar">{c.tipo === 'Jurídico' ? '🏢' : '👤'}</div>
                              <div style={{ flex: 1 }}>
                                <div className="wiz-resultado-nombre">{c.nombre}</div>
                                <div className="wiz-resultado-sub">
                                  {c.nit && `NIT ${c.nit}`}
                                  {c.dui && !c.nit && `DUI ${c.dui}`}
                                </div>
                              </div>
                              <div className="wiz-resultado-flecha">→</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {busquedaCli && clientesFiltrados.length === 0 && (
                        <div className="wiz-vacio">
                          <div style={{ fontSize: 30, marginBottom: 6 }}>🔍</div>
                          <div>No se encontró ningún cliente con "<strong>{busquedaCli}</strong>"</div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* PASO 2: PRODUCTOS */}
              {pasoWizard === 2 && (
                <div className="wiz-paso-contenido">
                  <p className="wiz-ayuda">Buscá y agregá los productos que vas a trasladar. Podés ajustar cantidades.</p>
                  <div className="wiz-buscador">
                    <span className="wiz-buscador-icono">📦</span>
                    <input
                      className="wiz-input"
                      placeholder="Buscar producto por nombre o código..."
                      value={busquedaProd}
                      onChange={e => setBusquedaProd(e.target.value)}
                    />
                  </div>
                  {productosFiltrados.length > 0 && (
                    <div className="wiz-resultados">
                      {productosFiltrados.map(p => (
                        <div key={p.id} className="wiz-resultado" onClick={() => agregarProducto(p)}>
                          <div className="wiz-resultado-avatar">📦</div>
                          <div style={{ flex: 1 }}>
                            <div className="wiz-resultado-nombre">{p.nombre}</div>
                            <div className="wiz-resultado-sub">{p.codigo} · Stock: {p.stock || 0}</div>
                          </div>
                          <div className="wiz-resultado-precio">{fmt(p.precio)}</div>
                          <div className="wiz-resultado-flecha">+</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {carrito.length > 0 ? (
                    <div className="wiz-carrito">
                      <div className="wiz-carrito-header">
                        <span>PRODUCTOS A TRASLADAR ({carrito.length})</span>
                        <span style={{ fontFamily: 'var(--mono)' }}>{fmt(carrito.reduce((s, it) => s + (it.precio * it.qty), 0))}</span>
                      </div>
                      {carrito.map(it => (
                        <div key={it.id} className="wiz-carrito-item">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="wiz-carrito-nombre">{it.nombre}</div>
                            <div className="wiz-carrito-codigo">{it.codigo}</div>
                          </div>
                          <div className="wiz-carrito-cant">
                            <button className="wiz-cant-btn" onClick={() => cambiarQty(it.id, it.qty - 1)} disabled={it.qty <= 1}>−</button>
                            <input type="number" min="1" step="1" className="wiz-cant-input" value={it.qty} onChange={e => cambiarQty(it.id, e.target.value)} />
                            <button className="wiz-cant-btn" onClick={() => cambiarQty(it.id, it.qty + 1)}>+</button>
                          </div>
                          <div className="wiz-carrito-total">{fmt(it.precio * it.qty)}</div>
                          <button className="wiz-carrito-eliminar" onClick={() => removerProducto(it.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="wiz-vacio" style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 36, marginBottom: 6 }}>📦</div>
                      <div>Aún no agregaste productos</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Buscá arriba y tocá un producto para agregarlo</div>
                    </div>
                  )}
                </div>
              )}

              {/* PASO 3: DATOS DEL TRASLADO */}
              {pasoWizard === 3 && (
                <div className="wiz-paso-contenido">
                  <p className="wiz-ayuda">Últimos datos antes de transmitir al MH.</p>

                  <div className="wiz-resumen-card">
                    <div className="wiz-resumen-row">
                      <span>🧑 Receptor</span>
                      <strong>{clienteSel?.nombre}</strong>
                    </div>
                    <div className="wiz-resumen-row">
                      <span>📦 Productos</span>
                      <strong>{carrito.length} ítems</strong>
                    </div>
                    <div className="wiz-resumen-row">
                      <span>💵 Valor</span>
                      <strong>{fmt(carrito.reduce((s, it) => s + (it.precio * it.qty), 0))}</strong>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: 16 }}>
                    <label className="form-label">
                      ACTIVIDAD ECONÓMICA DEL RECEPTOR <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <BuscadorActividad
                      codActividad={codActividadNR}
                      descActividad={descActividadNR}
                      onChange={({ codigo, descripcion }) => {
                        setCodActividadNR(codigo)
                        setDescActividadNR(descripcion)
                      }}
                      placeholder="Buscar actividad económica..."
                    />
                  </div>

                  <div className="wiz-grid-2" style={{ marginTop: 12 }}>
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

                  <div className="form-group" style={{ marginTop: 12 }}>
                    <label className="form-label">OBSERVACIONES (opcional)</label>
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="Ej: Traslado para evaluación en cliente..."
                      value={observaciones}
                      onChange={e => setObservaciones(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* FOOTER — botones de navegación */}
            <div className="wiz-footer">
              <button
                className="btn btn-ghost"
                onClick={() => pasoWizard > 1 ? setPasoWizard(pasoWizard - 1) : (setModalNueva(false), limpiarForm())}
                disabled={transmitiendo}
              >
                {pasoWizard === 1 ? 'Cancelar' : '← Atrás'}
              </button>

              <div className="wiz-paso-indicador">
                Paso <strong>{pasoWizard}</strong> de 3
              </div>

              {pasoWizard < 3 ? (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (pasoWizard === 1 && !clienteSel) {
                      setAlerta({ titulo: 'Falta el receptor', mensaje: 'Buscá y seleccioná el cliente.', tipo: 'error' })
                      return
                    }
                    if (pasoWizard === 2 && carrito.length === 0) {
                      setAlerta({ titulo: 'Faltan productos', mensaje: 'Agregá al menos un producto para trasladar.', tipo: 'error' })
                      return
                    }
                    setPasoWizard(pasoWizard + 1)
                  }}
                >
                  Siguiente →
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={emitirNR}
                  disabled={transmitiendo}
                  style={{ minWidth: 180 }}
                >
                  {transmitiendo ? '⏳ Transmitiendo al MH...' : '📡 Emitir y Transmitir'}
                </button>
              )}
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
  // Actividad económica POR FSE — el MH lo exige aunque el sujeto excluido
  // legalmente no tenga actividad registrada. Representa el tipo de servicio
  // o bien por el que se le está pagando. Se autocompleta del proveedor si
  // tiene una habitual, pero se puede cambiar en cada FSE.
  const [codActividadFSE, setCodActividadFSE] = useState('')
  const [descActividadFSE, setDescActividadFSE] = useState('')
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
    // La actividad económica del proveedor es OPCIONAL — los sujetos excluidos
    // legalmente NO tienen actividad económica registrada (por eso son excluidos).
    // Si se registra acá, sirve como autocompletado al emitir FSE.
    setGuardandoProv(true)
    try {
      // Limpiar el DUI: guardar SIN guiones (el MH lo exige así)
      const duiLimpio = limpiarDoc(formProv.dui)
      const direccion = buildComplemento(formProv.distrito, formProv.complemento)
      const data = { ...formProv, dui: duiLimpio, direccion, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      const ref = await addDoc(collection(db, 'proveedores'), data)
      // Auto-seleccionar el nuevo proveedor
      setProvSel({ id: ref.id, ...data })
      // Si el proveedor incluye actividad habitual, autocompletarla en la FSE
      if (data.codActividad && data.descActividad) {
        setCodActividadFSE(data.codActividad)
        setDescActividadFSE(data.descActividad)
      }
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
    // La actividad económica de la FSE representa el tipo de servicio o bien
    // por el que se está pagando. Es OBLIGATORIA para el MH aunque el sujeto
    // excluido no tenga una actividad económica registrada.
    if (!codActividadFSE || !descActividadFSE) {
      setAlerta({
        titulo: 'Actividad económica requerida',
        mensaje: 'Seleccioná la actividad económica que representa el servicio o bien por el que estás pagando. El MH lo exige.',
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
          // Actividad económica de esta FSE (representa el servicio prestado,
          // no la actividad formal del sujeto excluido). El MH lo exige.
          codActividad: codActividadFSE,
          descActividad: descActividadFSE,
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
        setCodActividadFSE(''); setDescActividadFSE('')
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
          <button className="btn-nueva-op btn-nueva-fse" onClick={() => setModalNueva(true)}>
            <span className="btn-nueva-op-icono">💰</span>
            <span>
              <span className="btn-nueva-op-titulo">Nueva Factura Sujeto Excluido</span>
              <span className="btn-nueva-op-sub">Compra a persona sin NIT</span>
            </span>
            <span className="btn-nueva-op-plus">+</span>
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

      {/* MODAL FSE — Estilo "factura de compra" en pantalla única */}
      {modalNueva && (
        <div className="wiz-overlay" onClick={e => e.stopPropagation()}>
          <div className="wiz-modal wiz-modal-fse" onClick={e => e.stopPropagation()}>

            {/* HEADER */}
            <div className="wiz-header wiz-header-fse">
              <div>
                <div className="wiz-eyebrow">💰 FACTURA SUJETO EXCLUIDO</div>
                <div className="wiz-titulo">Registrar compra a persona sin NIT/NRC</div>
              </div>
              <button className="wiz-cerrar" onClick={() => setModalNueva(false)} disabled={transmitiendo}>
                ✕
              </button>
            </div>

            <div className="wiz-cuerpo wiz-cuerpo-fse">

              {/* SECCIÓN 1: PROVEEDOR */}
              <div className="fse-section">
                <div className="fse-section-num">1</div>
                <div className="fse-section-body">
                  <div className="fse-section-titulo">A quién le pagaste</div>
                  {provSel ? (
                    <div className="wiz-tarjeta-sel">
                      <div className="wiz-tarjeta-avatar">🧑</div>
                      <div className="wiz-tarjeta-info">
                        <div className="wiz-tarjeta-nombre">{provSel.nombre}</div>
                        <div className="wiz-tarjeta-datos">
                          <span>DUI: <strong>{provSel.dui || '—'}</strong></span>
                          {provSel.telefono && <span>Tel: {provSel.telefono}</span>}
                        </div>
                      </div>
                      <button className="wiz-tarjeta-quitar" onClick={() => { setProvSel(null); setBusquedaProv(''); setCodActividadFSE(''); setDescActividadFSE('') }}>
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="wiz-buscador">
                        <span className="wiz-buscador-icono">🔍</span>
                        <input
                          className="wiz-input"
                          placeholder="Buscar proveedor por nombre o DUI..."
                          value={busquedaProv}
                          onChange={e => setBusquedaProv(e.target.value)}
                        />
                        <button className="wiz-buscador-accion" onClick={() => setModalProveedor(true)}>
                          + Nuevo
                        </button>
                      </div>
                      {proveedoresFiltrados.length > 0 && (
                        <div className="wiz-resultados">
                          {proveedoresFiltrados.map(p => (
                            <div key={p.id} className="wiz-resultado" onClick={() => {
                              setProvSel(p); setBusquedaProv('')
                              if (p.codActividad && p.descActividad) {
                                setCodActividadFSE(p.codActividad)
                                setDescActividadFSE(p.descActividad)
                              }
                            }}>
                              <div className="wiz-resultado-avatar">🧑</div>
                              <div style={{ flex: 1 }}>
                                <div className="wiz-resultado-nombre">{p.nombre}</div>
                                <div className="wiz-resultado-sub">DUI: {p.dui}</div>
                              </div>
                              <div className="wiz-resultado-flecha">→</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {busquedaProv && proveedoresFiltrados.length === 0 && (
                        <div className="wiz-vacio">
                          <div>No encontramos a "<strong>{busquedaProv}</strong>"</div>
                          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setModalProveedor(true)}>
                            + Registrar nuevo proveedor
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* SECCIÓN 2: QUÉ COMPRASTE */}
              <div className="fse-section">
                <div className="fse-section-num">2</div>
                <div className="fse-section-body">
                  <div className="fse-section-titulo">Qué le compraste</div>

                  <div className="form-group">
                    <label className="form-label">
                      ACTIVIDAD ECONÓMICA <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <BuscadorActividad
                      codActividad={codActividadFSE}
                      descActividad={descActividadFSE}
                      onChange={({ codigo, descripcion }) => {
                        setCodActividadFSE(codigo)
                        setDescActividadFSE(descripcion)
                      }}
                      placeholder="Tipo de servicio o bien por el que estás pagando..."
                    />
                  </div>

                  <div className="form-group" style={{ marginTop: 10 }}>
                    <label className="form-label">DESCRIPCIÓN *</label>
                    <input
                      className="input"
                      placeholder="Ej: Servicio de albañilería, 3 días de trabajo..."
                      value={descripcion}
                      onChange={e => setDescripcion(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* SECCIÓN 3: CUÁNTO */}
              <div className="fse-section">
                <div className="fse-section-num">3</div>
                <div className="fse-section-body">
                  <div className="fse-section-titulo">Cuánto le pagaste</div>

                  <div className="fse-monto-row">
                    <div className="form-group" style={{ flex: 0.6 }}>
                      <label className="form-label">CANTIDAD *</label>
                      <input
                        type="number"
                        className="input fse-input-mono"
                        min="0" step="0.01"
                        value={cantidad}
                        onChange={e => setCantidad(e.target.value)}
                      />
                    </div>
                    <div className="fse-monto-x">×</div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">PRECIO UNITARIO *</label>
                      <input
                        type="number"
                        className="input fse-input-mono"
                        min="0" step="0.01"
                        placeholder="0.00"
                        value={precioUni}
                        onChange={e => setPrecioUni(e.target.value)}
                      />
                    </div>
                    <div className="fse-monto-igual">=</div>
                    <div style={{ flex: 1 }}>
                      <label className="form-label">SUBTOTAL</label>
                      <div className="fse-subtotal-display">{fmt(totalCompra)}</div>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: 12 }}>
                    <label className="form-label">OBSERVACIONES (opcional)</label>
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="Notas adicionales..."
                      value={observaciones}
                      onChange={e => setObservaciones(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* RESUMEN FINAL — siempre visible */}
              <div className="fse-resumen">
                <div className="fse-resumen-titulo">RESUMEN DE LA OPERACIÓN</div>
                <div className="fse-resumen-row">
                  <span>Subtotal:</span>
                  <span className="fse-num">{fmt(totalCompra)}</span>
                </div>
                {aplicaRetencion && (
                  <div className="fse-resumen-row fse-resumen-retencion">
                    <span>
                      (-) Retención Renta 10%
                      <span className="fse-info" title="Se aplica cuando el monto supera $113.33">ⓘ</span>
                    </span>
                    <span className="fse-num">-{fmt(reteRenta)}</span>
                  </div>
                )}
                <div className="fse-resumen-row fse-resumen-total">
                  <span>NETO A PAGAR</span>
                  <span className="fse-num">{fmt(totalCompra - reteRenta)}</span>
                </div>
                {!aplicaRetencion && totalCompra > 0 && (
                  <div className="fse-resumen-nota">
                    ℹ️ Monto ≤ $113.33 — no aplica retención
                  </div>
                )}
              </div>

            </div>

            {/* FOOTER */}
            <div className="wiz-footer">
              <button className="btn btn-ghost" onClick={() => setModalNueva(false)} disabled={transmitiendo}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={emitirFSE} disabled={transmitiendo} style={{ minWidth: 200 }}>
                {transmitiendo ? '⏳ Transmitiendo al MH...' : '📡 Emitir y Transmitir'}
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
              <label className="form-label">ACTIVIDAD ECONÓMICA HABITUAL (opcional)</label>
              <BuscadorActividad
                codActividad={formProv.codActividad}
                descActividad={formProv.descActividad}
                onChange={({ codigo, descripcion }) => setFormProv(f => ({ ...f, codActividad: codigo, descActividad: descripcion }))}
                placeholder="Buscar por código o descripción..."
              />
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                Los sujetos excluidos legalmente no tienen actividad económica. Si lo registrás acá, sirve para autocompletar al emitir FSE.
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