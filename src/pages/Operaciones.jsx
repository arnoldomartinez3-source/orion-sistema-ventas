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
import { postAutenticado } from '../utils/apiAuth'
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
import { orionPrompt } from '../orionDialog'

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

// Países para FEX — codPais es ISO 3166-1 alpha-2 (CAT-020 V2.0). 'US' es el que
// está certificado. OJO: NO son códigos numéricos (eso daba "codPais VALOR NO VALIDO").
const PAISES_FEX = [
  { codigo: 'US', nombre: 'Estados Unidos' },
  { codigo: 'GT', nombre: 'Guatemala' },
  { codigo: 'HN', nombre: 'Honduras' },
  { codigo: 'NI', nombre: 'Nicaragua' },
  { codigo: 'CR', nombre: 'Costa Rica' },
  { codigo: 'PA', nombre: 'Panamá' },
  { codigo: 'MX', nombre: 'México' },
  { codigo: 'BR', nombre: 'Brasil' },
  { codigo: 'ES', nombre: 'España' },
  { codigo: 'DE', nombre: 'Alemania' },
  { codigo: 'FR', nombre: 'Francia' },
  { codigo: 'IT', nombre: 'Italia' },
  { codigo: 'GB', nombre: 'Reino Unido' },
  { codigo: 'CN', nombre: 'China' },
  { codigo: 'JP', nombre: 'Japón' },
]

// ── Catálogos de EXPORTACIÓN FORMAL (solo cuando se activa el modo aduana) ──
// El MH exige estos campos para permitir el incoterm en una FEX.
const RECINTOS_FISCALES = [ // CAT-027
  { codigo: '01', nombre: 'Terrestre San Bartolo' }, { codigo: '02', nombre: 'Marítima de Acajutla' },
  { codigo: '03', nombre: 'Aérea De Comalapa' }, { codigo: '04', nombre: 'Terrestre Las Chinamas' },
  { codigo: '05', nombre: 'Terrestre La Hachadura' }, { codigo: '06', nombre: 'Terrestre Santa Ana' },
  { codigo: '07', nombre: 'Terrestre San Cristóbal' }, { codigo: '08', nombre: 'Terrestre Anguiatú' },
  { codigo: '09', nombre: 'Terrestre El Amatillo' }, { codigo: '10', nombre: 'Marítima La Unión' },
  { codigo: '11', nombre: 'Terrestre El Poy' }, { codigo: '12', nombre: 'Terrestre Metalío' },
  { codigo: '15', nombre: 'Fardos Postales' }, { codigo: '16', nombre: 'Z.F. San Marcos' },
  { codigo: '17', nombre: 'Z.F. El Pedregal' }, { codigo: '18', nombre: 'Z.F. San Bartolo' },
  { codigo: '20', nombre: 'Z.F. Exportsalva' }, { codigo: '21', nombre: 'Z.F. American Park' },
  { codigo: '23', nombre: 'Z.F. Internacional' }, { codigo: '24', nombre: 'Z.F. Diez' },
  { codigo: '26', nombre: 'Z.F. Miramar' }, { codigo: '27', nombre: 'Z.F. Santo Tomas' },
  { codigo: '28', nombre: 'Z.F. Santa Tecla' }, { codigo: '29', nombre: 'Z.F. Santa Ana' },
  { codigo: '30', nombre: 'Z.F. La Concordia' }, { codigo: '31', nombre: 'Aérea Ilopango' },
  { codigo: '32', nombre: 'Z.F. Pipil' }, { codigo: '33', nombre: 'Puerto Barillas' },
  { codigo: '34', nombre: 'Z.F. Calvo Conservas' }, { codigo: '35', nombre: 'Feria Internacional' },
  { codigo: '36', nombre: 'Aduana El Papalón' }, { codigo: '37', nombre: 'Z.F. Sam-Li' },
  { codigo: '38', nombre: 'Z.F. San José' }, { codigo: '39', nombre: 'Z.F. Las Mercedes' },
  { codigo: '40', nombre: 'Z.F. EMCO' }, { codigo: '41', nombre: 'Z.F. Gigante' },
  { codigo: '42', nombre: 'Z.F. NOVABES' }, { codigo: '43', nombre: 'Z.F. INHDELVA' },
  { codigo: '71', nombre: 'Aldesa' }, { codigo: '72', nombre: 'Agdosa Merliot' },
  { codigo: '73', nombre: 'Bodesa' }, { codigo: '76', nombre: 'Delegacion DHL' },
  { codigo: '77', nombre: 'Transauto' }, { codigo: '80', nombre: 'Nejapa' },
  { codigo: '81', nombre: 'Almaconsa' }, { codigo: '83', nombre: 'Agdosa Apopa' },
  { codigo: '85', nombre: 'Gutiérrez Courier Y Cargo' }, { codigo: '99', nombre: 'San Bartolo Envío Hn/Gt' },
]
const TIPOS_REGIMEN = [ // CAT-033
  { codigo: 'EX-1', nombre: 'EX-1 Exportación Definitiva' },
  { codigo: 'EX-2', nombre: 'EX-2 Exportación Temporal' },
  { codigo: 'EX-3', nombre: 'EX-3 Reexportación' },
  { codigo: 'TA-1', nombre: 'TA-1 Tránsito Aduanero' },
]
const REGIMENES_FEX = [ // CAT-028 (los más comunes de exportación)
  { codigo: '1000.000', nombre: '1000.000 · Exportación Definitiva, Régimen Común' },
  { codigo: '1040.000', nombre: '1040.000 · Exp. Definitiva, Sustitución de Mercancías' },
]
const INCOTERMS_FEX = [ // CAT-031
  { codigo: '01', nombre: 'EXW - En fábrica' }, { codigo: '02', nombre: 'FCA - Libre transportista' },
  { codigo: '03', nombre: 'CPT - Transporte pagado hasta' }, { codigo: '04', nombre: 'CIP - Transporte y seguro pagado' },
  { codigo: '05', nombre: 'DAP - Entrega en el lugar' }, { codigo: '06', nombre: 'DPU - Entregado descargado' },
  { codigo: '07', nombre: 'DDP - Entrega con impuestos pagados' }, { codigo: '08', nombre: 'FAS - Libre al costado del buque' },
  { codigo: '09', nombre: 'FOB - Libre a bordo' }, { codigo: '10', nombre: 'CFR - Costo y flete' },
  { codigo: '11', nombre: 'CIF - Costo, seguro y flete' },
]

// Tipo de documento del receptor extranjero (CAT-022). Debe ser CÓDIGO, no texto.
// Para un cliente en el exterior lo normal es 'Otro' (37) o 'Pasaporte' (03).
const TIPOS_DOC_FEX = [
  { codigo: '37', nombre: 'Otro' },
  { codigo: '03', nombre: 'Pasaporte' },
  { codigo: '02', nombre: 'Carnet de Residente' },
  { codigo: '13', nombre: 'DUI' },
  { codigo: '36', nombre: 'NIT' },
]

// ════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL — controla las sub-pestañas y carga datos comunes
// ════════════════════════════════════════════════════════════════════
export default function Operaciones() {
  const { user } = useAuth()
  const { puede, empresaId, esAdmin, rol, userId } = usePermisos()

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

  if (vista === 'nueva-FEX') {
    return (
      <>
        <NuevaFEX
          productos={productos}
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

  if (vista === 'nueva-Retencion') {
    return (
      <>
        <NuevaRetencion
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

  // Vista por defecto: lista
  return (
    <>
      <style>{stylesGenerales}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">📋 Operaciones</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            {operacionesActuales.length} {tabActiva === 'NR' ? 'nota(s) de remisión' : tabActiva === 'FSE' ? 'factura(s) sujeto excluido' : tabActiva === 'FEX' ? 'factura(s) de exportación' : 'comprobante(s) de retención'}
            <span className="firebase-badge">🔥 Firebase</span>
          </div>
        </div>
        {puede('crear_facturas') && (
          <button className="btn btn-primary" onClick={() => setVista(`nueva-${tabActiva}`)}>
            + Nueva {tabActiva === 'NR' ? 'Remisión' : tabActiva === 'FSE' ? 'FSE' : tabActiva === 'FEX' ? 'Exportación' : 'Retención'}
          </button>
        )}
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
          <button
            className={`op-tab ${tabActiva === 'Retencion' ? 'active' : ''}`}
            onClick={() => setTabActiva('Retencion')}
          >
            🧾 Comprobantes de Retención
          </button>
          <button
            className={`op-tab ${tabActiva === 'FEX' ? 'active' : ''}`}
            onClick={() => setTabActiva('FEX')}
          >
            ✈️ Facturas de Exportación
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
            <strong>💰 Factura Sujeto Excluido:</strong> documento que <em>emites</em> al
            comprarle a alguien sin NIT/NRC (agricultor, freelancer, etc.). Te sirve para deducir el gasto.
          </div>
        )}
        {tabActiva === 'Retencion' && (
          <div className="op-info-banner">
            <strong>🧾 Comprobante de Retención:</strong> documento que <em>emites</em> como
            agente de retención al retenerle IVA a un proveedor. Referencia las facturas (CCF) sobre las que retuviste.
          </div>
        )}
        {tabActiva === 'FEX' && (
          <div className="op-info-banner">
            <strong>✈️ Factura de Exportación:</strong> venta a un cliente <em>en el extranjero</em>.
            Exenta de IVA (tasa 0%). Se usa muy poco, por eso vive acá y no en el Punto de Venta.
          </div>
        )}

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
  // Etiquetas por tipo de operación (NR / FSE / FEX / Retención)
  const L = {
    NR:        { icono: '🚚', nombre: 'Notas de Remisión',         receptor: 'RECEPTOR',  doc: 'NIT/DUI', desc: 'TIPO TRASLADO', valor: 'VALOR' },
    FSE:       { icono: '💰', nombre: 'Facturas Sujeto Excluido',  receptor: 'PROVEEDOR', doc: 'DUI',     desc: 'DESCRIPCIÓN',   valor: 'MONTO' },
    FEX:       { icono: '✈️', nombre: 'Facturas de Exportación',   receptor: 'RECEPTOR',  doc: 'PAÍS',    desc: 'DESCRIPCIÓN',   valor: 'TOTAL' },
    Retencion: { icono: '🧾', nombre: 'Comprobantes de Retención', receptor: 'PROVEEDOR', doc: 'NIT',     desc: 'DETALLE',       valor: 'RETENIDO' },
  }[tipo] || { icono: '📋', nombre: 'Operaciones', receptor: 'RECEPTOR', doc: 'DOC', desc: 'DETALLE', valor: 'VALOR' }

  if (operaciones.length === 0) {
    return (
      <div className="card">
        <div className="op-vacio">
          <div className="op-vacio-icono">{L.icono}</div>
          <div className="op-vacio-titulo">No hay {L.nombre} emitidas</div>
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
              <th>{L.receptor}</th>
              <th>{L.doc}</th>
              <th>{L.desc}</th>
              <th>{L.valor}</th>
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
              const desc = tipo === 'NR' ? (traslado?.label.slice(0, 30) || op.tipoTraslado || '—')
                        : tipo === 'Retencion' ? (op.lineasRetencion?.length ? `${op.lineasRetencion.length} documento(s)` : '—')
                        : (op.items?.[0]?.nombre || '—')
              const docCol = tipo === 'FEX' ? (op.nombrePaisFex || '—') : (op.nit || op.dui || '—')
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
                    {docCol}
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
  const { userName, userId } = usePermisos()   // cajero/cajeroId para el filtro de seguridad
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

  // En MODO PRODUCCIÓN exige escribir "ok" antes de transmitir un DTE real al MH.
  // Devuelve true si se puede continuar; false si se cancela.
  const confirmarProduccion = async () => {
    if ((empresa.mh_ambiente || '00') !== '01') return true
    const conf = await orionPrompt(
      'Este DTE se transmitirá REAL al Ministerio de Hacienda (no es una prueba).\n\nEscribí "ok" para confirmar la transmisión.',
      { titulo: '🔴 Modo Producción', tipo: 'warning', okLabel: 'Transmitir', cancelLabel: 'Cancelar', placeholder: 'Escribí: ok' }
    )
    if (conf == null) return false
    if (conf.trim().toLowerCase() !== 'ok') {
      setAlerta({ titulo: 'No confirmado', mensaje: 'Para transmitir en producción, escribe exactamente "ok".', tipo: 'error' })
      return false
    }
    return true
  }

  // ── EMITIR NR ──
  const emitirNR = async () => {
    if (!puede('crear_facturas')) { setAlerta({ titulo: 'Sin permiso', mensaje: 'No puedes emitir DTE.', tipo: 'error' }); return }
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

    if (!(await confirmarProduccion())) return
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

      const resp = await postAutenticado('/api/dte/transmitir', { operacionId, ventaId: operacionId, ambiente: empresa.mh_ambiente || '00' })
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
  const { userName, userId } = usePermisos()   // cajero/cajeroId para el filtro de seguridad
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
      setAlerta({ titulo: 'Falta descripción', mensaje: 'Describe qué fue lo que compraste.', tipo: 'error' })
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
    if (!puede('crear_facturas')) { setAlerta({ titulo: 'Sin permiso', mensaje: 'No puedes emitir DTE.', tipo: 'error' }); return }
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

    if (!(await confirmarProduccion())) return
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

      const resp = await postAutenticado('/api/dte/transmitir', { operacionId, ventaId: operacionId, ambiente: empresa.mh_ambiente || '00' })
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
                Tú retienes ese monto y lo declaras. El proveedor cobra el neto.
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
// NUEVA RETENCIÓN (Comprobante de Retención, DTE 07) — formulario limpio
// ════════════════════════════════════════════════════════════════════
const CODIGOS_RETENCION = [
  { code: '22', label: '1% — Retención IVA (Gran Contribuyente)', rate: 0.01 },
  { code: 'C4', label: '13% — Retención IVA', rate: 0.13 },
]
const RET_LINEA_VACIA = { tipoDocRef: '03', tipoGeneracion: '1', numDoc: '', fecha: '', monto: '', codRet: '22', descripcion: '' }

// ════════════════════════════════════════════════════════════════════
// NUEVA FEX — Factura de Exportación (DTE tipo 11). Estilo POS: catálogo
// a la izquierda, comprobante (receptor extranjero + carrito + comercial)
// a la derecha. IVA 0% (exenta). Movida desde el Punto de Venta (uso raro).
// ════════════════════════════════════════════════════════════════════
function NuevaFEX({ productos, empresa, user, puede, setAlerta, volver, empresaId }) {
  const { userName, userId } = usePermisos()
  const [carrito, setCarrito] = useState([])
  const [busquedaProd, setBusquedaProd] = useState('')
  const [tabMovil, setTabMovil] = useState('catalogo')
  const [transmitiendo, setTransmitiendo] = useState(false)
  // Receptor extranjero
  const [rec, setRec] = useState({
    nombre: '', paisDestino: 'US', tipoPersona: '1', tipoDoc: '37', numDoc: '',
    actividad: '', telefono: '', correo: '',
  })
  // Datos comerciales. Nota: NO se manda incoterm — el MH rechaza cualquier código
  // de incoterm en esta configuración de FEX ("codIncoterms VALOR NO ES PERMITIDO");
  // solo null pasa (igual que el path certificado).
  const [com, setCom] = useState({ tipoItemExpor: '1', flete: '', seguro: '' })
  // Exportación formal (aduana): habilita el incoterm. Apagada por defecto → export simple.
  const [exp, setExp] = useState({ formal: false, recinto: '', regimen: '1000.000', tipoRegimen: 'EX-1', incoterm: '09' })
  const setR = (k, v) => setRec(r => ({ ...r, [k]: v }))
  const setC = (k, v) => setCom(c => ({ ...c, [k]: v }))
  const setE = (k, v) => setExp(x => ({ ...x, [k]: v }))

  const productosFiltrados = useMemo(() => {
    if (!busquedaProd.trim()) return productos.slice(0, 12)
    const q = busquedaProd.toLowerCase()
    return productos.filter(p => p.nombre?.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q)).slice(0, 24)
  }, [productos, busquedaProd])

  const agregarProducto = (p) => {
    const ya = carrito.find(c => c.id === p.id)
    if (ya) setCarrito(c => c.map(it => it.id === p.id ? { ...it, qty: it.qty + 1 } : it))
    else setCarrito(c => [...c, { id: p.id, codigo: p.codigo, nombre: p.nombre, qty: 1, precio: p.precio || 0 }])
  }
  const removerProducto = (id) => setCarrito(c => c.filter(it => it.id !== id))
  const cambiarQty = (id, qty) => setCarrito(c => c.map(it => it.id === id ? { ...it, qty: Math.max(1, parseFloat(qty) || 1) } : it))

  const subtotal = Math.round(carrito.reduce((s, it) => s + (it.precio * it.qty), 0) * 100) / 100
  const flete = parseFloat(com.flete) || 0
  const seguro = parseFloat(com.seguro) || 0
  const totalFEX = Math.round((subtotal + flete + seguro) * 100) / 100

  const emitirFEX = async () => {
    if (!puede('crear_facturas')) { setAlerta({ titulo: 'Sin permiso', mensaje: 'No puedes emitir DTE.', tipo: 'error' }); return }
    if (carrito.length === 0) { setAlerta({ titulo: 'Sin productos', mensaje: 'Agregá al menos un producto al carrito.', tipo: 'error' }); return }
    if (!rec.nombre.trim()) { setAlerta({ titulo: 'Falta el receptor', mensaje: 'Ingresá el nombre del receptor extranjero.', tipo: 'error' }); return }
    if (!rec.paisDestino) { setAlerta({ titulo: 'Falta país destino', mensaje: 'Seleccioná el país destino.', tipo: 'error' }); return }
    if (exp.formal && !exp.recinto) { setAlerta({ titulo: 'Falta recinto fiscal', mensaje: 'En exportación formal elige el recinto fiscal (aduana).', tipo: 'error' }); return }

    if (!(await confirmarProduccion())) return
    setTransmitiendo(true)
    try {
      const codigoGeneracion = crypto.randomUUID().toUpperCase()
      const nombrePais = (PAISES_FEX.find(p => p.codigo === rec.paisDestino)?.nombre) || ''
      let numeroDte = '', operacionId = ''
      await runTransaction(db, async (tx) => {
        const configRef = doc(db, 'configuracion', empresaId)
        const configSnap = await tx.get(configRef)
        if (!configSnap.exists()) throw new Error('No hay documento de configuración.')
        const config = configSnap.data()
        const correlativoNuevo = parseInt(config.correlativo_FEX || 0) + 1
        const numStr = String(correlativoNuevo).padStart(15, '0')
        const codEst = (config.codEstableMH || 'S001').padEnd(4, '0').slice(0, 4)
        const codPV = (config.codPuntoVentaMH || 'P001').padEnd(4, '0').slice(0, 4)
        numeroDte = `DTE-11-${codEst}${codPV}-${numStr}`
        const opRef = doc(collection(db, 'operaciones'))
        operacionId = opRef.id
        tx.set(opRef, {
          tipoDte: 'FEX',
          cajero: userName || '', cajeroId: userId || '', // seguridad: filtro por cajero + empresa
          numero: numeroDte, numeroControl: numeroDte, codigoGeneracion,
          cliente: rec.nombre.trim(),
          // Campos que lee transmitir.js (buildReceptorFEX / buildResumenFEX)
          nombreReceptorFex: rec.nombre.trim(),
          tipoPersonaFex: parseInt(rec.tipoPersona) || 1,
          tipoDocFex: rec.tipoDoc.trim() || '37',
          numDocFex: rec.numDoc.trim() || '0000',
          paisDestino: rec.paisDestino,
          nombrePaisFex: nombrePais,
          actividadFex: rec.actividad.trim() || 'Exportacion de bienes',
          telefonoFex: rec.telefono.trim() || null,
          correoFex: rec.correo.trim() || null,
          direccionFex: 'Direccion en el exterior',
          // Exportación formal (aduana): manda incoterm + régimen. Simple: todo null.
          incotermFex: exp.formal ? (exp.incoterm || null) : null,
          recintoFiscal: exp.formal ? (exp.recinto || null) : null,
          regimen: exp.formal ? (exp.regimen.trim() || '1000.000') : null,
          tipoRegimen: exp.formal ? (exp.tipoRegimen || 'EX-1') : null,
          tipoItemExpor: parseInt(com.tipoItemExpor) || 1,
          fleteFex: flete,
          seguroFex: seguro,
          items: carrito.map(c => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, precioBase: c.precio, qty: c.qty, subtotal: c.precio * c.qty })),
          subtotal, total: totalFEX,
          formaPago: 'transferencia',
          dte_estado: 'PENDIENTE',
          dte_ambiente: empresa.mh_ambiente || '00',
          emisor: { uid: user?.uid || '', nombre: user?.displayName || user?.email || '' },
          empresaId,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        })
        tx.update(configRef, { correlativo_FEX: correlativoNuevo })
      })

      const resp = await postAutenticado('/api/dte/transmitir', { operacionId, ventaId: operacionId, ambiente: empresa.mh_ambiente || '00' })
      const data = await resp.json()
      if (data.estado === 'PROCESADO') {
        setAlerta({ titulo: '✅ FEX transmitida', mensaje: `Número: ${data.numeroControl || numeroDte}`, tipo: 'exito' })
        setTimeout(() => volver(), 1500)
      } else if (data.estado === 'RECHAZADO') {
        const motivo = data.detalleMH?.descripcionMsg || (data.observaciones && data.observaciones.join('\n')) || 'Sin detalle'
        setAlerta({ titulo: '❌ MH rechazó la FEX', mensaje: `Motivo: ${motivo}`, tipo: 'error' })
      } else {
        setAlerta({ titulo: '⚠️ FEX pendiente', mensaje: 'No se obtuvo respuesta del MH. Quedó guardada para retransmitir.', tipo: 'error' })
      }
    } catch (e) {
      setAlerta({ titulo: 'Error al emitir FEX', mensaje: e.message, tipo: 'error' })
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
          <div className="pos-op-titulo-icono pos-op-titulo-fex">✈️</div>
          <div>
            <div className="pos-op-titulo-texto">Nueva Factura de Exportación</div>
            <div className="pos-op-titulo-sub">Exportación · IVA 0% · DTE tipo 11</div>
          </div>
        </div>
      </div>

      {/* TABS MÓVIL */}
      <div className="pos-op-tabs-movil">
        <button className={`pos-op-tab-movil ${tabMovil === 'catalogo' ? 'active' : ''}`} onClick={() => setTabMovil('catalogo')}>📦 Productos</button>
        <button className={`pos-op-tab-movil ${tabMovil === 'carrito' ? 'active' : ''}`} onClick={() => setTabMovil('carrito')}>
          📋 Comprobante
          {carrito.length > 0 && <span className="pos-op-tab-badge">{carrito.length}</span>}
        </button>
      </div>

      {/* LAYOUT SPLIT */}
      <div className="pos-op-split">
        {/* IZQUIERDA: CATÁLOGO */}
        <div className={`pos-op-col pos-op-catalogo ${tabMovil === 'catalogo' ? 'tab-activo' : ''}`}>
          <div className="pos-op-buscador">
            <span className="pos-op-buscador-icono">🔍</span>
            <input type="text" className="pos-op-buscador-input" placeholder="Buscar producto por nombre o código..." value={busquedaProd} onChange={e => setBusquedaProd(e.target.value)} autoFocus />
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
                    <div key={p.id} className={`pos-op-producto ${enCarrito ? 'en-carrito' : ''}`} onClick={() => agregarProducto(p)}>
                      {enCarrito && <div className="pos-op-producto-badge">{enCarrito.qty}</div>}
                      <div className="pos-op-producto-nombre">{p.nombre}</div>
                      <div className="pos-op-producto-codigo">{p.codigo}</div>
                      <div className="pos-op-producto-precio">{fmt(p.precio || 0)}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* DERECHA: COMPROBANTE */}
        <div className={`pos-op-col pos-op-carrito ${tabMovil === 'carrito' ? 'tab-activo' : ''}`}>
          {/* RECEPTOR EXTRANJERO */}
          <div className="pos-op-datos-extra" style={{ marginTop: 0 }}>
            <div className="pos-op-datos-titulo">✈️ Receptor extranjero</div>
            <input className="input" placeholder="Nombre del receptor *" value={rec.nombre} onChange={e => setR('nombre', e.target.value)} style={{ fontSize: 12 }} />
            <div className="pos-op-grid-2">
              <select className="input" value={rec.paisDestino} onChange={e => setR('paisDestino', e.target.value)} style={{ fontSize: 12 }}>
                {PAISES_FEX.map(p => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
              </select>
              <select className="input" value={rec.tipoPersona} onChange={e => setR('tipoPersona', e.target.value)} style={{ fontSize: 12 }}>
                <option value="1">Natural</option>
                <option value="2">Jurídica</option>
              </select>
            </div>
            <div className="pos-op-grid-2">
              <select className="input" value={rec.tipoDoc} onChange={e => setR('tipoDoc', e.target.value)} style={{ fontSize: 12 }}>
                {TIPOS_DOC_FEX.map(t => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
              </select>
              <input className="input" placeholder="Núm. doc. / Pasaporte" value={rec.numDoc} onChange={e => setR('numDoc', e.target.value)} style={{ fontSize: 12 }} />
            </div>
            <input className="input" placeholder="Actividad económica" value={rec.actividad} onChange={e => setR('actividad', e.target.value)} style={{ fontSize: 12 }} />
            <div className="pos-op-grid-2">
              <input className="input" placeholder="Teléfono" value={rec.telefono} onChange={e => setR('telefono', e.target.value)} style={{ fontSize: 12 }} />
              <input className="input" placeholder="Correo" value={rec.correo} onChange={e => setR('correo', e.target.value)} style={{ fontSize: 12 }} />
            </div>
          </div>

          {/* ITEMS DEL CARRITO */}
          <div className="pos-op-items">
            {carrito.length === 0 ? (
              <div className="pos-op-carrito-vacio">
                <div style={{ fontSize: 40, opacity: 0.25 }}>🛒</div>
                <div style={{ fontWeight: 700, marginTop: 8 }}>Sin productos</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Tocá productos del catálogo para agregarlos</div>
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

          {/* DATOS COMERCIALES */}
          {carrito.length > 0 && (
            <div className="pos-op-datos-extra">
              <div className="pos-op-datos-titulo">🌎 Datos comerciales</div>
              <div className="pos-op-grid-2">
                <select className="input" value={com.tipoItemExpor} onChange={e => setC('tipoItemExpor', e.target.value)} style={{ fontSize: 12 }}>
                  <option value="1">Bienes</option>
                  <option value="2">Servicios</option>
                  <option value="3">Ambos</option>
                </select>
                <input className="input" type="number" placeholder="Flete (opcional)" value={com.flete} onChange={e => setC('flete', e.target.value)} style={{ fontSize: 12 }} />
              </div>
              <div className="pos-op-grid-2">
                <input className="input" type="number" placeholder="Seguro (opcional)" value={com.seguro} onChange={e => setC('seguro', e.target.value)} style={{ fontSize: 12 }} />
                <div />
              </div>

              {/* Exportación formal (aduana) — habilita el incoterm */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={exp.formal} onChange={e => setE('formal', e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <span><strong>Exportación formal con aduana</strong> (habilita incoterm)</span>
              </label>
              {exp.formal && (
                <>
                  <div style={{ fontSize: 10, color: 'var(--muted)', margin: '6px 0 6px' }}>
                    Solo para exportaciones con trámite aduanero. El MH exige recinto fiscal + régimen para aceptar el incoterm.
                  </div>
                  <div className="pos-op-grid-2">
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, fontWeight: 700 }}>Recinto fiscal (aduana)</div>
                      <select className="input" value={exp.recinto} onChange={e => setE('recinto', e.target.value)} style={{ fontSize: 12 }}>
                        <option value="">Elegir…</option>
                        {RECINTOS_FISCALES.map(r => <option key={r.codigo} value={r.codigo}>{r.codigo} · {r.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, fontWeight: 700 }}>Tipo de régimen</div>
                      <select className="input" value={exp.tipoRegimen} onChange={e => setE('tipoRegimen', e.target.value)} style={{ fontSize: 12 }}>
                        {TIPOS_REGIMEN.map(t => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="pos-op-grid-2" style={{ marginTop: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, fontWeight: 700 }}>Régimen (tipo de exportación)</div>
                      <select className="input" value={exp.regimen} onChange={e => setE('regimen', e.target.value)} style={{ fontSize: 12 }}>
                        {REGIMENES_FEX.map(r => <option key={r.codigo} value={r.codigo}>{r.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, fontWeight: 700 }}>Incoterm (término de entrega)</div>
                      <select className="input" value={exp.incoterm} onChange={e => setE('incoterm', e.target.value)} style={{ fontSize: 12 }}>
                        {INCOTERMS_FEX.map(i => <option key={i.codigo} value={i.codigo}>{i.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* RESUMEN Y BOTÓN */}
          <div className="pos-op-resumen">
            <div className="pos-op-resumen-row" style={{ fontSize: 12, color: 'var(--muted)' }}>
              <span>Subtotal (exento IVA)</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{fmt(subtotal)}</span>
            </div>
            {(flete > 0 || seguro > 0) && (
              <div className="pos-op-resumen-row" style={{ fontSize: 12, color: 'var(--muted)' }}>
                <span>Flete + Seguro</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{fmt(flete + seguro)}</span>
              </div>
            )}
            <div className="pos-op-resumen-row pos-op-resumen-total">
              <span>TOTAL A EXPORTAR</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{fmt(totalFEX)}</span>
            </div>
          </div>

          <button className="pos-op-btn-emitir pos-op-btn-fex" onClick={emitirFEX} disabled={transmitiendo || carrito.length === 0 || !rec.nombre.trim()}>
            {transmitiendo ? '⏳ Transmitiendo...' : '📡 EMITIR Y FIRMAR'}
          </button>
        </div>
      </div>
    </>
  )
}

function NuevaRetencion({ clientes, empresa, user, puede, setAlerta, volver, empresaId }) {
  const { userName, userId } = usePermisos()
  const [receptorSel, setReceptorSel] = useState(null)
  const [busquedaCli, setBusquedaCli] = useState('')
  const [mostrarBuscador, setMostrarBuscador] = useState(false)
  const [lineas, setLineas] = useState([{ ...RET_LINEA_VACIA }])
  const [transmitiendo, setTransmitiendo] = useState(false)

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCli.toLowerCase()
    return (clientes || []).filter(c => c.nit && (
      c.nombre?.toLowerCase().includes(q) || c.nit?.includes(busquedaCli) || (c.nrc || '').includes(busquedaCli)
    )).slice(0, 8)
  }, [clientes, busquedaCli])

  const rateDe = (code) => (CODIGOS_RETENCION.find(r => r.code === code)?.rate || 0.01)
  const ivaDeLinea = (l) => Math.round((parseFloat(l.monto || 0) * rateDe(l.codRet)) * 100) / 100
  const totalSujeto = Math.round(lineas.reduce((s, l) => s + (parseFloat(l.monto) || 0), 0) * 100) / 100
  const totalRetenido = Math.round(lineas.reduce((s, l) => s + ivaDeLinea(l), 0) * 100) / 100

  const setLinea = (i, campo, valor) => setLineas(ls => ls.map((l, idx) => idx === i ? { ...l, [campo]: valor } : l))
  const agregarLinea = () => setLineas(ls => [...ls, { ...RET_LINEA_VACIA }])
  const quitarLinea = (i) => setLineas(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)

  const emitir = async () => {
    if (!puede('crear_facturas')) { setAlerta({ titulo: 'Sin permiso', mensaje: 'No puedes emitir DTE.', tipo: 'error' }); return }
    if (!receptorSel) { setAlerta({ titulo: 'Falta el proveedor', mensaje: 'Seleccioná al contribuyente al que le retuviste.', tipo: 'error' }); return }
    if (!receptorSel.nit || !receptorSel.nrc) { setAlerta({ titulo: 'Datos incompletos', mensaje: 'El receptor debe tener NIT y NRC (es un contribuyente registrado).', tipo: 'error' }); return }
    const lineasValidas = lineas.filter(l => parseFloat(l.monto) > 0 && l.numDoc.trim() && l.fecha)
    if (lineasValidas.length === 0) { setAlerta({ titulo: 'Faltan líneas', mensaje: 'Agregá al menos una línea con documento, fecha y monto.', tipo: 'error' }); return }

    if (!(await confirmarProduccion())) return
    setTransmitiendo(true)
    try {
      const codigoGeneracion = crypto.randomUUID().toUpperCase()
      let numeroDte = '', operacionId = ''
      await runTransaction(db, async (tx) => {
        const configRef = doc(db, 'configuracion', empresaId)
        const configSnap = await tx.get(configRef)
        if (!configSnap.exists()) throw new Error('No hay documento de configuración.')
        const config = configSnap.data()
        const correlativoNuevo = parseInt(config.correlativo_Retencion || 0) + 1
        const numStr = String(correlativoNuevo).padStart(15, '0')
        const codEst = (config.codEstableMH || 'S001').padEnd(4, '0').slice(0, 4)
        const codPV = (config.codPuntoVentaMH || 'P001').padEnd(4, '0').slice(0, 4)
        numeroDte = `DTE-07-${codEst}${codPV}-${numStr}`
        const opRef = doc(collection(db, 'operaciones'))
        operacionId = opRef.id
        tx.set(opRef, {
          tipoDte: 'Retencion',
          cajero: userName || '', cajeroId: userId || '', // seguridad: filtro por cajero + empresa
          numero: numeroDte, numeroControl: numeroDte, codigoGeneracion,
          cliente: receptorSel.nombre,
          nit: receptorSel.nit || '', nrc: receptorSel.nrc || '',
          codActividad: receptorSel.codActividad || '', descActividad: receptorSel.descActividad || '',
          codDep: receptorSel.codDep || '', codMun: receptorSel.codMun || '', codDistrito: receptorSel.codDistrito || '',
          direccion: receptorSel.direccion || receptorSel.complemento || '',
          telefono: receptorSel.telefono || '', correo: receptorSel.email || '',
          lineasRetencion: lineasValidas.map(l => ({
            tipoDocRef: l.tipoDocRef, tipoGeneracion: l.tipoGeneracion, numDocumento: l.numDoc.trim(), fechaEmision: l.fecha,
            montoSujeto: Math.round((parseFloat(l.monto) || 0) * 100) / 100,
            codigoRetencion: l.codRet, ivaRetenido: ivaDeLinea(l),
            descripcion: l.descripcion?.trim() || 'Retención IVA',
          })),
          totalSujetoRetencion: totalSujeto,
          totalIVAretenido: totalRetenido,
          subtotal: totalSujeto, total: totalRetenido,
          dte_estado: 'PENDIENTE',
          dte_ambiente: empresa.mh_ambiente || '00', // ambiente desde la creación
          emisor: { uid: user?.uid || '', nombre: user?.displayName || user?.email || '' },
          empresaId,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        })
        tx.update(configRef, { correlativo_Retencion: correlativoNuevo })
      })

      const resp = await postAutenticado('/api/dte/transmitir', { operacionId, ventaId: operacionId, ambiente: empresa.mh_ambiente || '00' })
      const data = await resp.json()
      if (data.estado === 'PROCESADO') {
        setAlerta({ titulo: '✅ Retención transmitida', mensaje: `Número: ${data.numeroControl || numeroDte}`, tipo: 'exito' })
        setTimeout(() => volver(), 1500)
      } else if (data.estado === 'RECHAZADO') {
        const motivo = data.detalleMH?.descripcionMsg || (data.observaciones && data.observaciones.join('\n')) || data.detalle || 'Sin detalle'
        setAlerta({ titulo: '❌ MH rechazó la Retención', mensaje: `Motivo: ${motivo}`, tipo: 'error' })
      } else {
        setAlerta({ titulo: '⚠️ Retención pendiente', mensaje: data.detalle || 'No se obtuvo respuesta del MH.', tipo: 'error' })
      }
    } catch (e) {
      setAlerta({ titulo: 'Error al emitir Retención', mensaje: e.message, tipo: 'error' })
    }
    setTransmitiendo(false)
  }

  return (
    <>
      <style>{stylesGenerales}</style>
      <style>{stylesPosLike}</style>

      {/* HEADER (unificado con NR/FSE) */}
      <div className="pos-op-header">
        <button className="pos-op-volver" onClick={volver}>← Volver</button>
        <div className="pos-op-titulo">
          <div className="pos-op-titulo-icono pos-op-titulo-ret">🧾</div>
          <div>
            <div className="pos-op-titulo-texto">Nueva Retención</div>
            <div className="pos-op-titulo-sub">Comprobante de Retención · DTE tipo 07</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '0 16px 40px' }}>
        {/* 1 · RECEPTOR */}
        {/* overflow visible + zIndex: el dropdown de búsqueda es absolute y la clase
            .card trae overflow:hidden, que lo recortaba ("se escondía" el resultado). */}
        <div className="card" style={{ padding: 18, marginBottom: 16, overflow: 'visible', position: 'relative', zIndex: 5 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>1 · Proveedor al que le retuviste</div>
          {receptorSel ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{receptorSel.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>NIT {receptorSel.nit || '—'} · NRC {receptorSel.nrc || '—'}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setReceptorSel(null); setMostrarBuscador(true) }}>Cambiar</button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input className="input" placeholder="🔍 Buscar por nombre, NIT o NRC..." value={busquedaCli}
                onChange={e => { setBusquedaCli(e.target.value); setMostrarBuscador(true) }} onFocus={() => setMostrarBuscador(true)} />
              {mostrarBuscador && busquedaCli && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, marginTop: 4, maxHeight: 260, overflowY: 'auto', boxShadow: '0 8px 24px var(--shadow)' }}>
                  {clientesFiltrados.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>Sin resultados con NIT. El receptor debe tener NIT/NRC.</div>
                  ) : clientesFiltrados.map(c => (
                    <div key={c.id} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                      onClick={() => { setReceptorSel(c); setMostrarBuscador(false); setBusquedaCli('') }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>NIT {c.nit} · NRC {c.nrc || '—'}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Debe ser un contribuyente con NIT y NRC. Si no aparece, cargalo en Clientes.</div>
            </div>
          )}
        </div>

        {/* 2 · LÍNEAS */}
        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>2 · Documentos retenidos</div>
            <button className="btn btn-ghost btn-sm" onClick={agregarLinea}>+ Agregar línea</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {lineas.map((l, i) => (
              <div key={i} style={{ border: '1.5px solid var(--border)', borderRadius: 10, padding: 12, position: 'relative' }}>
                {lineas.length > 1 && <button onClick={() => quitarLinea(i)} title="Quitar" style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>✕</button>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Tipo de documento</label>
                    <select className="input" value={l.tipoDocRef} onChange={e => setLinea(i, 'tipoDocRef', e.target.value)}>
                      <option value="03">Crédito Fiscal (CCF)</option>
                      <option value="14">Factura Sujeto Excluido</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Generación</label>
                    <select className="input" value={l.tipoGeneracion} onChange={e => setLinea(i, 'tipoGeneracion', e.target.value)}>
                      <option value="1">Físico (papel)</option>
                      <option value="2">Electrónico (DTE)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{l.tipoGeneracion === '2' ? 'Código de generación' : 'N° de documento'}</label>
                    <input className="input" value={l.numDoc} onChange={e => setLinea(i, 'numDoc', e.target.value)}
                      placeholder={l.tipoGeneracion === '2' ? 'Cód. generación (UUID del CCF)' : 'N° del documento físico'} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha de emisión</label>
                    <input className="input" type="date" value={l.fecha} onChange={e => setLinea(i, 'fecha', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Retención</label>
                    <select className="input" value={l.codRet} onChange={e => setLinea(i, 'codRet', e.target.value)}>
                      {CODIGOS_RETENCION.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Monto sujeto ($)</label>
                    <input className="input" inputMode="decimal" value={l.monto} onChange={e => setLinea(i, 'monto', e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">IVA retenido</label>
                    <input className="input" value={fmt(ivaDeLinea(l))} readOnly style={{ background: 'var(--surface2)', fontFamily: 'var(--mono)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3 · RESUMEN + EMITIR */}
        <div className="card" style={{ padding: 18, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 24 }}>
            <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Total sujeto</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)' }}>{fmt(totalSujeto)}</div></div>
            <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Total IVA retenido</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent3)' }}>{fmt(totalRetenido)}</div></div>
          </div>
          <button className="btn btn-primary" disabled={transmitiendo} onClick={emitir} style={{ minWidth: 190 }}>
            {transmitiendo ? '⏳ Emitiendo...' : '🧾 Emitir Retención'}
          </button>
        </div>
      </div>
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
  .op-tab.active { background: var(--surface); color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1.5px solid rgba(74,143,232,0.3); }
  .op-info-banner { background: rgba(74,143,232,0.07); border: 1px solid rgba(74,143,232,0.18); border-radius: 10px; padding: 10px 14px; margin-bottom: 16px; font-size: 12px; color: var(--text); line-height: 1.5; }
  .op-info-banner strong { color: var(--accent); }

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
  .btn-nueva-nr .btn-nueva-op-plus { background: var(--accent); }
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
  .pos-op-titulo-ret { background: rgba(16,185,129,0.12); }
  .pos-op-titulo-fex { background: rgba(236,72,153,0.12); }
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
    border-color: var(--accent);
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
    font-size: 14px; color: var(--accent); margin-top: 6px;
  }
  .pos-op-producto-stock { font-size: 9px; color: var(--muted); margin-top: 2px; }
  .pos-op-producto-badge {
    position: absolute; top: 8px; right: 8px;
    background: var(--accent); color: white;
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
    background: linear-gradient(135deg, var(--accent), var(--accent-dark));
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
  .pos-op-btn-fex {
    background: linear-gradient(135deg, #ec4899, #db2777);
    box-shadow: 0 6px 22px rgba(236,72,153,0.4);
  }
  .pos-op-btn-fex:hover:not(:disabled) {
    transform: translateY(-2px); box-shadow: 0 10px 32px rgba(236,72,153,0.5);
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