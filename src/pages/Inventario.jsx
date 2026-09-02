import { useState, useEffect, useRef } from 'react'
import { db } from '../firebase'
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, writeBatch, runTransaction, query, where, orderBy, getDocs, limit
} from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { usePermisos } from '../PermisosContext'
import { generarCodigoBarras, generarHTMLEtiquetas, barrasDataURL } from '../utils/etiquetas'

const IVA = 0.13

const UNIDADES_SISTEMA = [
  { nombre: 'Unidad',     factor: 1,      grupo: 'General' },
  { nombre: 'Docena',     factor: 12,     grupo: 'General' },
  { nombre: 'Ciento',     factor: 100,    grupo: 'General' },
  { nombre: 'Millar',     factor: 1000,   grupo: 'General' },
  { nombre: 'Par',        factor: 2,      grupo: 'General' },
  { nombre: 'Caja',       factor: 1,      grupo: 'Empaque' },
  { nombre: 'Paquete',    factor: 1,      grupo: 'Empaque' },
  { nombre: 'Resma',      factor: 500,    grupo: 'Empaque' },
  { nombre: 'Bolsa',      factor: 1,      grupo: 'Empaque' },
  { nombre: 'Saco',       factor: 1,      grupo: 'Empaque' },
  { nombre: 'Rollo',      factor: 1,      grupo: 'Empaque' },
  { nombre: 'Metro',      factor: 1,      grupo: 'Longitud' },
  { nombre: 'Centimetro', factor: 0.01,   grupo: 'Longitud' },
  { nombre: 'Vara',       factor: 0.836,  grupo: 'Longitud' },
  { nombre: 'Pie',        factor: 0.3048, grupo: 'Longitud' },
  { nombre: 'Pulgada',    factor: 0.0254, grupo: 'Longitud' },
  { nombre: 'Kilogramo',  factor: 1,      grupo: 'Peso' },
  { nombre: 'Gramo',      factor: 0.001,  grupo: 'Peso' },
  { nombre: 'Libra',      factor: 0.4536, grupo: 'Peso' },
  { nombre: 'Quintal',    factor: 45.36,  grupo: 'Peso' },
  { nombre: 'Tonelada',   factor: 1000,   grupo: 'Peso' },
  { nombre: 'Litro',      factor: 1,      grupo: 'Volumen' },
  { nombre: 'Mililitro',  factor: 0.001,  grupo: 'Volumen' },
  { nombre: 'Galon',      factor: 3.785,  grupo: 'Volumen' },
]

const TIPOS_MOVIMIENTO = [
  { value: 'entrada',    label: 'Entrada',    icon: '📥', color: '#00C296' },
  { value: 'salida',     label: 'Salida',     icon: '📤', color: '#ef4444' },
  { value: 'ajuste',     label: 'Ajuste',     icon: '🔧', color: '#f59e0b' },
  { value: 'devolucion', label: 'Devolucion', icon: '↩️', color: '#4A8FE8' },
  { value: 'traslado',   label: 'Traslado',   icon: '🚚', color: '#8b5cf6' },
]

const COLUMNAS_EXCEL = ['codigo','nombre','categoria','precio','stock','min','unidad','proveedor','codigoBarras','ubicacion','descuento','fechaVencimiento','pres1_nombre','pres1_factor','pres1_precio','pres2_nombre','pres2_factor','pres2_precio']

// Íconos de línea para las tarjetas del panel (heredan color vía currentColor)
const PanelIcon = ({ name }) => {
  const paths = {
    productos: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5" />,
    kardex: <><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M9 9h1M9 13h6M9 17h6" /></>,
    ajuste: <><path d="M13 3l-2 5h4l-2 5" /><circle cx="12" cy="12" r="9" /></>,
    bodega: <><path d="M3 21V8l9-5 9 5v13" /><path d="M3 21h18M9 21v-6h6v6" /></>,
    sucursal: <><path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M4 21v-7h6v7" /></>,
    alertas: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
    valoracion: <><line x1="4" y1="20" x2="4" y2="10" /><line x1="10" y1="20" x2="10" y2="4" /><line x1="16" y1="20" x2="16" y2="13" /><line x1="22" y1="20" x2="2" y2="20" /></>,
    categorias: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

const invStyles = `
  .inv-panel { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 12px; }
  @media (max-width: 1100px) { .inv-panel { grid-template-columns: repeat(3,1fr); } }
  @media (max-width: 700px) { .inv-panel { grid-template-columns: repeat(2,1fr); } }
  .inv-card {
    background: linear-gradient(135deg, color-mix(in srgb, var(--ic-color, var(--accent)) 13%, var(--surface)), var(--surface));
    border: 1.5px solid var(--border); border-radius: 14px; padding: 12px 14px;
    cursor: pointer; transition: transform 0.18s, border-color 0.18s, box-shadow 0.18s;
    position: relative; overflow: hidden;
  }
  .inv-card:hover { transform: translateY(-2px); box-shadow: 0 6px 22px var(--shadow); }
  .inv-card.activa { border-color: var(--ic-color, var(--accent)); box-shadow: 0 0 0 1.5px var(--ic-color, var(--accent)); }
  /* Ícono marca de agua (grande, tenue, esquina inferior derecha) */
  .inv-card-watermark { position: absolute; bottom: -10px; right: -8px; width: 56px; height: 56px; color: var(--ic-color, var(--accent)); opacity: 0.13; pointer-events: none; }
  .inv-card-watermark svg { width: 100%; height: 100%; }
  /* Ícono chico arriba */
  .inv-card-icon { width: 28px; height: 28px; color: var(--ic-color, var(--accent)); margin-bottom: 7px; }
  .inv-card-icon svg { width: 100%; height: 100%; }
  .inv-card-title { font-size: 15px; font-weight: 700; color: var(--text); position: relative; }
  .inv-card-val { font-size: 25px; font-weight: 800; font-family: var(--mono); letter-spacing: -0.5px; line-height: 1; margin-top: 4px; position: relative; }
  .inv-card-sub { font-size: 11px; color: var(--muted); margin-top: 3px; line-height: 1.4; position: relative; }

  /* ══ BARRA DE PÍLDORAS (navegación dentro de cada sección) ══ */
  /* ══ PAGINADOR ══ */
  .paginador { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
  .paginador-info { font-size: 12px; color: var(--muted); }
  .paginador-btns { display: flex; align-items: center; gap: 8px; }
  .paginador-btn { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 8px; padding: 6px 14px; font-size: 12px; font-weight: 600; color: var(--text); cursor: pointer; transition: all 0.15s; }
  .paginador-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .paginador-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .paginador-pag { font-size: 12px; font-weight: 700; color: var(--text2); min-width: 50px; text-align: center; }

  /* ══ RESUMEN ACCIONABLE (panel de inicio) ══ */
  .inv-resumen { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 800px) { .inv-resumen { grid-template-columns: 1fr; } }
  .inv-resumen-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 14px; padding: 16px; }
  .inv-resumen-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .inv-resumen-title { font-size: 13px; font-weight: 700; }
  .inv-resumen-badge { color: #fff; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 999px; margin-left: auto; }
  .inv-resumen-row { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
  .inv-resumen-row:last-of-type { border-bottom: none; }
  .inv-resumen-icon { font-weight: 800; font-size: 14px; }
  .inv-resumen-nombre { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .inv-resumen-val { font-family: var(--mono); font-weight: 700; font-size: 12px; }
  .inv-resumen-vacio { font-size: 12px; color: var(--muted); padding: 12px 0; text-align: center; }
  .inv-resumen-link { font-size: 11px; color: var(--accent); margin-top: 12px; cursor: pointer; font-weight: 600; }
  .inv-resumen-link:hover { text-decoration: underline; }

  .inv-pills { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 18px; }
  .inv-pill {
    display: inline-flex; align-items: center; gap: 9px;
    padding: 10px 18px; border-radius: 999px; cursor: pointer;
    background: var(--surface2); border: 1.5px solid transparent;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
    white-space: nowrap;
  }
  .inv-pill:hover { background: color-mix(in srgb, var(--ic-color, var(--accent)) 12%, var(--surface2)); }
  .inv-pill.activa {
    background: color-mix(in srgb, var(--ic-color, var(--accent)) 16%, transparent);
    border-color: var(--ic-color, var(--accent));
  }
  .inv-pill-icon { width: 19px; height: 19px; color: var(--ic-color, var(--accent)); display: flex; }
  .inv-pill-icon svg { width: 100%; height: 100%; }
  .inv-pill-label { font-size: 13px; font-weight: 600; color: var(--text2); }
  .inv-pill.activa .inv-pill-label { color: var(--ic-color, var(--accent)); }
  .inv-pill-num { font-size: 12px; font-weight: 700; color: #fff; background: var(--ic-color, var(--accent)); padding: 2px 9px; border-radius: 999px; }
  /* Home: más visible — fondo de color y borde */
  .inv-pill-home { padding: 10px 14px; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--surface2)); border: 1.5px solid color-mix(in srgb, var(--accent) 35%, transparent); }
  .inv-pill-home:hover { background: var(--accent); color: #fff; }
  .inv-pill-home svg { width: 19px; height: 19px; flex-shrink: 0; }
  .inv-card-badge { position: absolute; top: 14px; right: 14px; background: var(--ic-color, var(--accent)); color: #fff; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 99px; }
  .inv-back { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; margin-bottom: 20px; padding: 8px 14px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--surface2); transition: all 0.15s; }
  .inv-back:hover { color: var(--accent); border-color: var(--accent); }
  .inv-toolbar { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; align-items: center; }
  .inv-toolbar .input { max-width: 300px; }
  .stock-ok { color: var(--accent); font-weight: 600; font-family: var(--mono); }
  .stock-low { color: var(--accent3); font-weight: 600; font-family: var(--mono); }
  .stock-critical { color: var(--danger); font-weight: 600; font-family: var(--mono); }
  .action-btns { display: flex; gap: 8px; flex-wrap: wrap; }
  .action-btns .btn-sm { padding: 10px 16px; font-size: 16px; }
  .btn-sm { padding: 5px 10px; font-size: 11px; }
  .loading { text-align: center; padding: 40px; color: var(--muted); font-size: 14px; }
  .firebase-badge { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,160,0,0.12); color: #ffa000; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 6px; font-family: var(--mono); }
  .toolbar-group { display: flex; gap: 8px; align-items: center; margin-left: auto; flex-wrap: wrap; }
  .section-divider { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 1px; padding: 4px 0; border-bottom: 1px solid var(--border); margin-bottom: 4px; margin-top: 8px; }
  .iva-hint { background: rgba(0,212,170,0.08); border: 1px solid rgba(0,212,170,0.2); border-radius: 10px; padding: 10px 14px; font-size: 13px; }
  .tag-opcional { display: inline-block; background: var(--surface2); border: 1px solid var(--border); color: var(--muted); font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
  .modal-lg { max-width: 660px !important; max-height: 90vh; overflow-y: auto; }
  .modal-prod-horizontal { max-width: 1120px !important; max-height: 92vh; overflow-y: auto; }
  .prod-cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; align-items: start; }
  @media (max-width: 1000px) { .prod-cols { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 680px) { .prod-cols { grid-template-columns: 1fr; } }
  .prod-col { display: flex; flex-direction: column; gap: 12px; }
  .prod-tag { display: inline-flex; align-items: center; gap: 4px; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; font-size: 11px; color: var(--muted); }
  .prod-row td:first-child { position: relative; }
  .prod-row { transition: background 0.15s; }
  .prod-row:hover { background: color-mix(in srgb, #00C296 22%, transparent); }
  .prod-row:hover td { background: transparent; }
  .prod-row:hover td:first-child::before { content: ''; position: absolute; left: 0; top: 4px; bottom: 4px; width: 4px; background: #00C296; border-radius: 99px; }
  .prod-row:hover .prod-tag { border-color: rgba(0,194,150,0.5); color: #00C296; }
  .import-preview { max-height: 280px; overflow-y: auto; margin-top: 14px; border-radius: 10px; border: 1px solid var(--border); }
  .import-preview th { background: var(--surface2); position: sticky; top: 0; }
  .import-row-ok { background: rgba(0,212,170,0.05); }
  .import-row-err { background: rgba(255,77,109,0.07); }
  .kardex-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 20px; }
  @media (max-width: 700px) { .kardex-stats { grid-template-columns: repeat(2,1fr); } }
  .kardex-stat { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 12px; padding: 14px; text-align: center; }
  .kardex-stat-val { font-size: 20px; font-weight: 800; font-family: var(--mono); }
  .kardex-stat-label { font-size: 10px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
  .mov-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; }
  .unidad-adicional-row { display: flex; gap: 8px; align-items: center; background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
  .alerta-card { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 14px; border: 1.5px solid var(--border); background: var(--surface2); margin-bottom: 10px; transition: all 0.15s; }
  .alerta-card:hover { transform: translateX(4px); }
  .alerta-semaforo { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
  .alerta-critico { background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,0.5); }
  .alerta-bajo { background: #f59e0b; box-shadow: 0 0 8px rgba(245,158,11,0.5); }
  .valor-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 24px; }
  @media (max-width: 700px) { .valor-stats { grid-template-columns: 1fr; } }
  .valor-stat { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 14px; padding: 22px; text-align: center; }
  .valor-stat-val { font-size: 28px; font-weight: 900; font-family: var(--mono); letter-spacing: -1px; }
  .valor-stat-label { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; margin-top: 6px; }
  .bodega-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 20px; }
  @media (max-width: 900px) { .bodega-grid { grid-template-columns: repeat(2,1fr); } }
  .bodega-card { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 14px; padding: 18px; transition: all 0.15s; }
  .bodega-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 6px 20px var(--shadow); }
  .sucursal-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 16px; }
  @media (max-width: 700px) { .sucursal-grid { grid-template-columns: 1fr; } }
  .sucursal-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; padding: 20px; box-shadow: 0 4px 20px var(--shadow2); transition: all 0.15s; }
  .sucursal-card:hover { border-color: var(--accent2); transform: translateY(-2px); }
  .btn-kardex { background: rgba(74,143,232,0.1); color: var(--accent); border: 1.5px solid rgba(74,143,232,0.25); }
  .btn-kardex:hover { background: var(--accent); color: white; }
`

const precioFinal = (precio, descuento) => {
  const p = parseFloat(precio) || 0
  const d = parseFloat(descuento) || 0
  return p * (1 - d / 100) * (1 + IVA)
}

const getStockClass = (stock, min) => {
  if (stock === 0) return 'stock-critical'
  if (stock < min * 0.4) return 'stock-critical'
  if (stock < min) return 'stock-low'
  return 'stock-ok'
}

// Convierte el stock (en unidad base) a una lectura legible por presentaciones.
// Ej: stock 390, caja=100 → "3 Caja + 90 Unidad". Si no hay presentaciones, devuelve "".
const stockLegible = (producto) => {
  const stock = producto.stock || 0
  const adicionales = (producto.unidadesAdicionales || []).filter(u => (u.factor || 1) > 1)
  if (adicionales.length === 0 || stock === 0) return ''
  // Tomar la presentación de mayor factor para la lectura principal
  const mayor = [...adicionales].sort((a, b) => (b.factor || 1) - (a.factor || 1))[0]
  const factor = mayor.factor || 1
  const enteros = Math.floor(stock / factor)
  const resto = stock % factor
  if (enteros === 0) return ''
  let txt = `${enteros} ${mayor.nombre}`
  if (resto > 0) txt += ` + ${resto} ${producto.unidad}`
  return txt
}

const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`

const emptyForm = {
  codigo: '', nombre: '', precio: '', stock: '', min: '', unidad: 'Unidad',
  categoria: '', proveedor: '', codigoBarras: '', ubicacion: '', bodega: '',
  descuento: '', fechaVencimiento: '', imagen: '', unidadesAdicionales: [],
}

const imprimirIframe = (html) => {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'
  document.body.appendChild(iframe)
  iframe.contentDocument.open()
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 800)
  }
}

// Paginador reutilizable: recibe total de items, página actual y setter. 50 por página.
const POR_PAGINA = 50
const Paginador = ({ total, pagina, setPagina }) => {
  const paginas = Math.ceil(total / POR_PAGINA)
  if (paginas <= 1) return null
  const desde = pagina * POR_PAGINA + 1
  const hasta = Math.min((pagina + 1) * POR_PAGINA, total)
  return (
    <div className="paginador">
      <span className="paginador-info">{desde}–{hasta} de {total}</span>
      <div className="paginador-btns">
        <button className="paginador-btn" disabled={pagina === 0} onClick={() => setPagina(p => Math.max(0, p - 1))}>‹ Anterior</button>
        <span className="paginador-pag">{pagina + 1} / {paginas}</span>
        <button className="paginador-btn" disabled={pagina >= paginas - 1} onClick={() => setPagina(p => Math.min(paginas - 1, p + 1))}>Siguiente ›</button>
      </div>
    </div>
  )
}

export default function Inventario() {
  const { puede, empresaId } = usePermisos()
  const [vista, setVista] = useState('panel')
  // Paginación (50 por página) por lista
  const [pagProd, setPagProd] = useState(0)
  const [pagKardex, setPagKardex] = useState(0)
  const [pagAlerta, setPagAlerta] = useState(0)
  const [pagBodega, setPagBodega] = useState(0)
  const [pagSucursal, setPagSucursal] = useState(0)
  const [pagCategoria, setPagCategoria] = useState(0)
  const [productos, setProductos] = useState([])
  const [kardex, setKardex] = useState([])
  const [ultimosMov, setUltimosMov] = useState([]) // últimos 5 movimientos para el panel
  const [bodegas, setBodegas] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingKardex, setLoadingKardex] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [busKardex, setBusKardex] = useState('')
  const [busAjuste, setBusAjuste] = useState('')
  const [busBodega, setBusBodega] = useState('')
  const [busSucursal, setBusSucursal] = useState('')
  const [busAlerta, setBusAlerta] = useState('')
  const [busValoracion, setBusValoracion] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [kardexModal, setKardexModal] = useState(null)
  const [movModal, setMovModal] = useState(null)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(emptyForm)
  // Etiquetas de código de barras
  const [etiquetaModal, setEtiquetaModal] = useState(null)
  const [etiquetaCodigo, setEtiquetaCodigo] = useState('')
  const [etiquetaCopias, setEtiquetaCopias] = useState(1)
  const [etiquetaPreview, setEtiquetaPreview] = useState('')
  const [uploadingImg, setUploadingImg] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const [guardando, setGuardando] = useState(false)
  const [importData, setImportData] = useState([])
  const [importando, setImportando] = useState(false)
  const [movForm, setMovForm] = useState({ tipo: 'entrada', cantidad: '', unidad: '', motivo: '', referencia: '', sucursalOrigen: '', sucursalDestino: '' })
  const [busCategoria, setBusCategoria] = useState('')
  const [modalCategoria, setModalCategoria] = useState(false)
  const [editandoCategoria, setEditandoCategoria] = useState(null)
  const [formCategoria, setFormCategoria] = useState({ nombre: '', descripcion: '', color: '#4A8FE8', icono: '📦' })
  const [categorias, setCategorias] = useState([])
  const [ventas, setVentas] = useState([])
  const [modalBodega, setModalBodega] = useState(false)
  const [editandoBodega, setEditandoBodega] = useState(null)
  const [formBodega, setFormBodega] = useState({ nombre: '', descripcion: '', responsable: '' })
  const [modalSucursal, setModalSucursal] = useState(false)
  const [editandoSucursal, setEditandoSucursal] = useState(null)
  const [formSucursal, setFormSucursal] = useState({ nombre: '', direccion: '', telefono: '', responsable: '' })
  const fileRef = useRef()

  useEffect(() => {
    if (!empresaId) return // esperar empresaId del usuario
    const filtro = (col) => query(collection(db, col), where('empresaId', '==', empresaId))
    const u1 = onSnapshot(filtro('productos'), snap => { setProductos(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) })
    const u2 = onSnapshot(filtro('bodegas'), snap => setBodegas(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    const u3 = onSnapshot(filtro('sucursales'), snap => setSucursales(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    const u4 = onSnapshot(filtro('categorias'), snap => setCategorias(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    const u5 = onSnapshot(filtro('ventas'), snap => setVentas(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    return () => { u1(); u2(); u3(); u4(); u5() }
  }, [empresaId])

  useEffect(() => {
    if (vista !== 'kardex' || !empresaId) return
    setLoadingKardex(true)
    const unsub = onSnapshot(query(collection(db, 'kardex'), where('empresaId', '==', empresaId), orderBy('fecha', 'desc')), snap => { setKardex(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingKardex(false) })
    return () => unsub()
  }, [vista, empresaId])

  // Últimos movimientos para el panel — barato: solo lee 5 documentos
  useEffect(() => {
    if (vista !== 'panel' || !empresaId) return
    const unsub = onSnapshot(
      query(collection(db, 'kardex'), where('empresaId', '==', empresaId), orderBy('fecha', 'desc'), limit(5)),
      snap => setUltimosMov(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    )
    return () => unsub()
  }, [vista, empresaId])

  // Resetear paginación al cambiar de sección o búsqueda
  useEffect(() => { setPagProd(0); setPagKardex(0); setPagAlerta(0); setPagBodega(0); setPagSucursal(0); setPagCategoria(0) }, [vista, busqueda, busBodega, busSucursal, busCategoria, busAlerta])

  const cargarKardexProducto = async (producto) => {
    setLoadingKardex(true)
    setKardexModal(producto)
    setVista('kardex')
    try {
      // Óptimo: filtra por empresa + producto, ordenado por fecha (usa índice compuesto si existe)
      const snap = await getDocs(query(collection(db, 'kardex'), where('empresaId', '==', empresaId), where('productoId', '==', producto.id), orderBy('fecha', 'desc')))
      setKardex(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch {
      // Fallback sin índice compuesto: filtra solo por empresa (índice automático), el resto en cliente
      const snap = await getDocs(query(collection(db, 'kardex'), where('empresaId', '==', empresaId)))
      setKardex(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(k => k.productoId === producto.id)
        .sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0)))
    }
    setLoadingKardex(false)
  }

  const registrarMovimiento = async () => {
    // ── VALIDACIONES ──
    if (!movModal) return
    const cantidadIngresada = parseFloat(movForm.cantidad)
    if (isNaN(cantidadIngresada) || cantidadIngresada <= 0) { alert('La cantidad debe ser mayor a cero'); return }
    if (cantidadIngresada > 999999) { alert('Cantidad demasiado grande. Máximo 999,999'); return }
    if (!movForm.motivo?.trim()) { alert('El motivo es obligatorio para registrar un movimiento'); return }
    const tipo = movForm.tipo

    // ── PRESENTACIÓN / FACTOR ──
    // Si se eligió una presentación (caja, bobina...), el movimiento se hace en unidad base:
    // cantidad base = cantidad ingresada × factor. El kardex se registra SIEMPRE en unidad base.
    const presSel = (movModal.unidadesAdicionales || []).find(u => u.nombre === movForm.unidad)
    const factor = presSel ? (Number(presSel.factor) || 1) : 1
    const cantidad = cantidadIngresada * factor
    // Texto de referencia de la presentación para el kardex ("2 Caja")
    const refPresentacion = factor > 1 ? `${cantidadIngresada} ${movForm.unidad}` : ''

    try {
      // ── TRANSACCIÓN ATÓMICA — kardex + stock al mismo tiempo ──
      await runTransaction(db, async (transaction) => {
        const prodRef = doc(db, 'productos', movModal.id)
        const prodSnap = await transaction.get(prodRef)
        if (!prodSnap.exists()) throw new Error('Producto no encontrado')
        const stockActual = prodSnap.data().stock || 0
        let nuevoStock = stockActual

        if (['entrada','devolucion'].includes(tipo)) {
          nuevoStock = stockActual + cantidad
        } else if (tipo === 'salida') {
          if (cantidad > stockActual) throw new Error(`Stock insuficiente. Stock actual: ${stockActual} ${movModal.unidad}`)
          nuevoStock = stockActual - cantidad
        } else if (tipo === 'ajuste') {
          nuevoStock = cantidad
        } else if (tipo === 'traslado') {
          if (cantidad > stockActual) throw new Error(`Stock insuficiente para traslado. Stock actual: ${stockActual} ${movModal.unidad}`)
          if (!movForm.sucursalOrigen || !movForm.sucursalDestino) throw new Error('Selecciona sucursal de origen y destino')
          if (movForm.sucursalOrigen === movForm.sucursalDestino) throw new Error('La sucursal de origen y destino no pueden ser iguales')
          nuevoStock = stockActual - cantidad
        }

        if (nuevoStock < 0) throw new Error('El stock no puede ser negativo')

        // Registrar en kardex (cantidad SIEMPRE en unidad base)
        const kardexRef = doc(collection(db, 'kardex'))
        transaction.set(kardexRef, {
          productoId: movModal.id, productoCodigo: movModal.codigo,
          productoNombre: movModal.nombre, tipo, cantidad,
          unidad: movModal.unidad, // siempre la unidad base
          presentacion: refPresentacion, // "2 Caja" si aplicó factor, vacío si fue base
          stockAntes: stockActual, stockDespues: nuevoStock,
          motivo: movForm.motivo.trim(), referencia: movForm.referencia?.trim() || '',
          sucursalOrigen: movForm.sucursalOrigen || '',
          sucursalDestino: movForm.sucursalDestino || '',
          empresaId,
          fecha: serverTimestamp(),
        })

        // Actualizar stock del producto
        transaction.update(prodRef, { stock: nuevoStock, updatedAt: serverTimestamp() })
      })

      setMovModal(null)
      setMovForm({ tipo: 'entrada', cantidad: '', unidad: '', motivo: '', referencia: '', sucursalOrigen: '', sucursalDestino: '' })
    } catch (e) {
      alert('❌ Error: ' + e.message)
    }
  }

  const filtrados = productos.filter(p =>
    p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.proveedor?.toLowerCase().includes(busqueda.toLowerCase())
  )

  const kardexFiltrado = kardex.filter(k =>
    k.productoNombre?.toLowerCase().includes(busKardex.toLowerCase()) ||
    k.productoCodigo?.toLowerCase().includes(busKardex.toLowerCase()) ||
    k.tipo?.toLowerCase().includes(busKardex.toLowerCase()) ||
    k.motivo?.toLowerCase().includes(busKardex.toLowerCase()) ||
    k.referencia?.toLowerCase().includes(busKardex.toLowerCase())
  )

  const ajusteFiltrado = productos.filter(p =>
    p.nombre?.toLowerCase().includes(busAjuste.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busAjuste.toLowerCase()) ||
    (busAjuste === 'agotado' && p.stock === 0) ||
    (busAjuste === 'bajo' && p.stock > 0 && p.stock < (p.min || 0)) ||
    (busAjuste === 'normal' && p.stock >= (p.min || 0))
  )

  const bodegaFiltrada = bodegas.filter(b =>
    b.nombre?.toLowerCase().includes(busBodega.toLowerCase()) ||
    b.responsable?.toLowerCase().includes(busBodega.toLowerCase()) ||
    b.descripcion?.toLowerCase().includes(busBodega.toLowerCase())
  )

  const sucursalFiltrada = sucursales.filter(s =>
    s.nombre?.toLowerCase().includes(busSucursal.toLowerCase()) ||
    s.direccion?.toLowerCase().includes(busSucursal.toLowerCase()) ||
    s.responsable?.toLowerCase().includes(busSucursal.toLowerCase())
  )

  const valoracionFiltrada = productos.filter(p =>
    p.nombre?.toLowerCase().includes(busValoracion.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busValoracion.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(busValoracion.toLowerCase())
  ).sort((a,b) => ((b.precio||0)*(b.stock||0)) - ((a.precio||0)*(a.stock||0)))

  const abrirModal = (producto = null) => {
    if (producto) {
      setEditando(producto.id)
      setForm({ codigo: producto.codigo || '', nombre: producto.nombre || '', categoria: producto.categoria || '', precio: producto.precio?.toString() || '', stock: producto.stock?.toString() || '', min: producto.min?.toString() || '', unidad: producto.unidad || 'Unidad', proveedor: producto.proveedor || '', codigoBarras: producto.codigoBarras || '', ubicacion: producto.ubicacion || '', bodega: producto.bodega || '', descuento: producto.descuento?.toString() || '', fechaVencimiento: producto.fechaVencimiento || '', imagen: producto.imagen || '', unidadesAdicionales: producto.unidadesAdicionales || [] })
    } else { setEditando(null); setForm(emptyForm) }
    setModalOpen(true)
  }


  // ── UPLOAD DE IMAGEN A FIREBASE STORAGE ──
  const uploadImagen = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('Solo se permiten imágenes'); return }
    if (file.size > 5 * 1024 * 1024) { alert('La imagen no puede superar 5MB'); return }
    setUploadingImg(true)
    try {
      const storage = getStorage()
      const ext = file.name.split('.').pop()
      const filename = `productos/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const sRef = storageRef(storage, filename)
      await uploadBytes(sRef, file)
      const url = await getDownloadURL(sRef)
      setForm(f => ({ ...f, imagen: url }))
    } catch (e) { alert('Error al subir imagen: ' + e.message) }
    setUploadingImg(false)
  }

  const eliminarImagen = () => setForm(f => ({ ...f, imagen: '' }))

  const guardar = async () => {
    // ── VALIDACIONES ──
    const errores = []
    if (!form.codigo?.trim()) errores.push('El código es obligatorio')
    if (!form.nombre?.trim()) errores.push('El nombre es obligatorio')
    const precio = parseFloat(form.precio)
    if (isNaN(precio) || precio < 0) errores.push('El precio debe ser un número positivo')
    if (precio > 999999) errores.push('El precio es demasiado alto. Máximo $999,999')
    const stock = parseInt(form.stock)
    if (isNaN(stock) || stock < 0) errores.push('El stock no puede ser negativo')
    if (stock > 9999999) errores.push('Stock demasiado alto. Máximo 9,999,999')
    const min = parseInt(form.min) || 0
    if (min < 0) errores.push('El stock mínimo no puede ser negativo')
    if (errores.length > 0) { alert(errores.join(' | ')); return }

    // Verificar código duplicado
    const codigoExiste = productos.find(p => p.codigo?.trim() === form.codigo.trim() && p.id !== editando)
    if (codigoExiste) { alert(`⚠️ El código "${form.codigo}" ya existe en el producto "${codigoExiste.nombre}"`); return }

    setGuardando(true)
    const stockNuevo = parseInt(form.stock) || 0
    const stockAnterior = editando ? (productos.find(p => p.id === editando)?.stock || 0) : 0
    const data = { codigo: form.codigo.trim(), nombre: form.nombre.trim().toUpperCase(), categoria: form.categoria.trim(), precio: parseFloat(form.precio) || 0, stock: stockNuevo, min: parseInt(form.min) || 0, unidad: form.unidad || 'Unidad', unidadesAdicionales: (form.unidadesAdicionales || []).filter(u => u.nombre), ...(form.proveedor && { proveedor: form.proveedor.trim() }), ...(form.codigoBarras && { codigoBarras: form.codigoBarras.trim() }), ...(form.ubicacion && { ubicacion: form.ubicacion.trim() }), ...(form.bodega && { bodega: form.bodega }), ...(form.descuento && { descuento: parseFloat(form.descuento) || 0 }), ...(form.fechaVencimiento && { fechaVencimiento: form.fechaVencimiento }), ...(form.imagen && { imagen: form.imagen.trim() }), updatedAt: serverTimestamp() }
    try {
      if (editando) {
        await updateDoc(doc(db, 'productos', editando), data)
        if (stockNuevo !== stockAnterior) await addDoc(collection(db, 'kardex'), { productoId: editando, productoCodigo: form.codigo, productoNombre: form.nombre, tipo: 'ajuste', cantidad: Math.abs(stockNuevo - stockAnterior), unidad: form.unidad, stockAntes: stockAnterior, stockDespues: stockNuevo, motivo: 'Ajuste desde edicion', referencia: '', empresaId, fecha: serverTimestamp() })
      } else {
        const ref = await addDoc(collection(db, 'productos'), { ...data, empresaId, createdAt: serverTimestamp() })
        if (stockNuevo > 0) await addDoc(collection(db, 'kardex'), { productoId: ref.id, productoCodigo: form.codigo, productoNombre: form.nombre, tipo: 'entrada', cantidad: stockNuevo, unidad: form.unidad, stockAntes: 0, stockDespues: stockNuevo, motivo: 'Stock inicial', referencia: '', empresaId, fecha: serverTimestamp() })
      }
      setModalOpen(false)
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const eliminar = async (id) => { if (!confirm('Eliminar este producto?')) return; try { await deleteDoc(doc(db, 'productos', id)) } catch (e) { alert('Error: ' + e.message) } }

  // ── Etiquetas de código de barras ──
  const abrirEtiqueta = (p) => {
    // Si el producto no tiene código de barras, generamos uno único (se guarda al imprimir).
    const cod = p.codigoBarras || generarCodigoBarras(productos.map(x => x.codigoBarras))
    setEtiquetaModal(p)
    setEtiquetaCodigo(cod)
    setEtiquetaCopias(1)
  }

  // Vista previa del código de barras en el modal
  useEffect(() => {
    if (!etiquetaModal || !etiquetaCodigo) { setEtiquetaPreview(''); return }
    let cancelado = false
    barrasDataURL(etiquetaCodigo).then(url => { if (!cancelado) setEtiquetaPreview(url) }).catch(() => {})
    return () => { cancelado = true }
  }, [etiquetaModal, etiquetaCodigo])

  const imprimirEtiqueta = async () => {
    const p = etiquetaModal
    if (!p) return
    // Si el producto no tenía código de barras, guardamos el generado (queda escaneable).
    if (!p.codigoBarras && etiquetaCodigo) {
      try { await updateDoc(doc(db, 'productos', p.id), { codigoBarras: etiquetaCodigo, updatedAt: serverTimestamp() }) }
      catch (e) { alert('No se pudo guardar el código: ' + e.message); return }
    }
    const html = await generarHTMLEtiquetas([{ nombre: p.nombre, precio: p.precio, codigo: etiquetaCodigo, copias: etiquetaCopias }])
    imprimirIframe(html)
    setEtiquetaModal(null)
  }

  const exportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(productos.map(p => { const ua = p.unidadesAdicionales || []; return { codigo: p.codigo || '', nombre: p.nombre || '', categoria: p.categoria || '', precio: p.precio || 0, stock: p.stock || 0, min: p.min || 0, unidad: p.unidad || '', proveedor: p.proveedor || '', codigoBarras: p.codigoBarras || '', ubicacion: p.ubicacion || '', descuento: p.descuento || 0, fechaVencimiento: p.fechaVencimiento || '', pres1_nombre: ua[0]?.nombre || '', pres1_factor: ua[0]?.factor || '', pres1_precio: ua[0]?.precio || '', pres2_nombre: ua[1]?.nombre || '', pres2_factor: ua[1]?.factor || '', pres2_precio: ua[1]?.precio || '' } }), { header: COLUMNAS_EXCEL })
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
    XLSX.writeFile(wb, `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const descargarPlantilla = () => {
    const ws = XLSX.utils.json_to_sheet([{ codigo: 'P001', nombre: 'Producto Ejemplo', categoria: 'General', precio: 10.00, stock: 100, min: 10, unidad: 'Unidad', proveedor: 'Proveedor SV', codigoBarras: '', ubicacion: 'Bodega A', descuento: 0, fechaVencimiento: '', pres1_nombre: 'Caja', pres1_factor: 30, pres1_precio: 270.00, pres2_nombre: '', pres2_factor: '', pres2_precio: '' }], { header: COLUMNAS_EXCEL })
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Productos')
    XLSX.writeFile(wb, 'plantilla-inventario.xlsx')
  }

  const leerExcel = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' })
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      setImportData(raw.map((row, i) => {
        const codigo = String(row.codigo || '').trim(); const nombre = String(row.nombre || '').trim().toUpperCase(); const precio = parseFloat(row.precio || 0)
        const errores = []; if (!codigo) errores.push('Falta codigo'); if (!nombre) errores.push('Falta nombre'); if (isNaN(precio) || precio < 0) errores.push('Precio invalido')
        // Presentaciones (hasta 2): cada una requiere nombre + factor > 1. El precio es opcional.
        const unidadesAdicionales = []
        for (const n of [1, 2]) {
          const pNombre = String(row[`pres${n}_nombre`] || '').trim()
          const pFactor = parseFloat(row[`pres${n}_factor`] || 0)
          const pPrecio = parseFloat(row[`pres${n}_precio`] || 0)
          if (pNombre && pFactor > 1) {
            unidadesAdicionales.push({ nombre: pNombre, factor: pFactor, precio: isNaN(pPrecio) || pPrecio <= 0 ? precio * pFactor : pPrecio })
          } else if (pNombre && (!pFactor || pFactor <= 1)) {
            errores.push(`Presentacion "${pNombre}" necesita factor mayor a 1`)
          }
        }
        return { _fila: i + 2, codigo, nombre, categoria: String(row.categoria || '').trim(), precio, stock: parseInt(row.stock || 0), min: parseInt(row.min || 0), unidad: String(row.unidad || 'Unidad').trim(), proveedor: String(row.proveedor || '').trim(), codigoBarras: String(row.codigoBarras || '').trim(), ubicacion: String(row.ubicacion || '').trim(), descuento: parseFloat(row.descuento || 0), fechaVencimiento: String(row.fechaVencimiento || '').trim(), unidadesAdicionales, _errores: errores, _ok: errores.length === 0 }
      }))
      setImportModalOpen(true)
    }
    reader.readAsBinaryString(file); e.target.value = ''
  }

  const importarProductos = async () => {
    const validos = importData.filter(f => f._ok); if (!validos.length) return
    if (!empresaId) { alert('No se pudo identificar la empresa. Recarga la página.'); return }
    setImportando(true)
    try {
      // Índice de productos existentes por CÓDIGO → para NO duplicar al re-importar.
      const porCodigo = new Map()
      productos.forEach(p => { const c = String(p.codigo || '').trim().toLowerCase(); if (c) porCodigo.set(c, p.id) })
      let creados = 0, actualizados = 0
      for (let i = 0; i < validos.length; i += 400) {
        const batch = writeBatch(db)
        validos.slice(i, i + 400).forEach(p => {
          const { _fila, _errores, _ok, ...limpio } = p
          const clave = String(limpio.codigo || '').trim().toLowerCase()
          const existenteId = clave && porCodigo.get(clave)
          if (existenteId) {
            // Ya existe ese código → ACTUALIZAR (no duplicar). Se conserva el STOCK
            // actual (que cambia con las ventas); el Excel solo actualiza el catálogo.
            const { stock, ...sinStock } = limpio
            batch.set(doc(db, 'productos', existenteId), { ...sinStock, empresaId, updatedAt: serverTimestamp() }, { merge: true })
            actualizados++
          } else {
            const ref = doc(collection(db, 'productos'))
            batch.set(ref, { ...limpio, empresaId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
            if (clave) porCodigo.set(clave, ref.id) // por si el mismo código se repite dentro del archivo
            creados++
          }
        })
        await batch.commit()
      }
      setImportModalOpen(false); setImportData([])
      alert(`✅ Importación lista.\n\nNuevos: ${creados}\nActualizados (ya existían): ${actualizados}`)
    } catch (e) { alert('Error: ' + e.message) }
    setImportando(false)
  }


  const exportarKardex = () => {
    const ws = XLSX.utils.json_to_sheet(kardex.map(k => ({ fecha: k.fecha?.toDate?.()?.toLocaleString('es-SV') || '', producto: k.productoNombre, codigo: k.productoCodigo, tipo: k.tipo, cantidad: k.cantidad, unidad: k.unidad, presentacion: k.presentacion || '', stockAntes: k.stockAntes, stockDespues: k.stockDespues, motivo: k.motivo || '', referencia: k.referencia || '' })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Kardex')
    XLSX.writeFile(wb, `kardex-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exportarAlertas = () => {
    const datos = [...productos.filter(p => (p.stock || 0) === 0).map(p => ({ estado: 'AGOTADO', codigo: p.codigo, nombre: p.nombre, stock: 0, minimo: p.min, sugerido: Math.max((p.min || 0) * 2, 10) })), ...productos.filter(p => (p.stock || 0) > 0 && (p.stock || 0) < (p.min || 0)).map(p => ({ estado: 'BAJO', codigo: p.codigo, nombre: p.nombre, stock: p.stock, minimo: p.min, sugerido: Math.max((p.min || 0) * 2 - (p.stock || 0), 0) }))]
    const ws = XLSX.utils.json_to_sheet(datos); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Alertas')
    XLSX.writeFile(wb, `alertas-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exportarValoracion = () => {
    const ws = XLSX.utils.json_to_sheet(productos.map(p => ({ codigo: p.codigo, nombre: p.nombre, categoria: p.categoria || '', stock: p.stock || 0, unidad: p.unidad, precio_costo: p.precio || 0, precio_venta: ((p.precio || 0) * 1.13).toFixed(2), valor_costo: ((p.precio || 0) * (p.stock || 0)).toFixed(2), valor_venta: ((p.precio || 0) * 1.13 * (p.stock || 0)).toFixed(2) })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Valoracion')
    XLSX.writeFile(wb, `valoracion-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const imprimirValoracion = () => {
    const vc = productos.reduce((s, p) => s + (p.precio || 0) * (p.stock || 0), 0)
    const vv = productos.reduce((s, p) => s + (p.precio || 0) * 1.13 * (p.stock || 0), 0)
    const cats = {}
    productos.forEach(p => { const c = p.categoria || 'Sin categoria'; if (!cats[c]) cats[c] = { v: 0, u: 0, n: 0 }; cats[c].v += (p.precio||0)*(p.stock||0); cats[c].u += p.stock||0; cats[c].n++ })
    imprimirIframe(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Valoracion</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',sans-serif;color:#1a1a2e;font-size:13px;padding:30px;}.t{font-size:22px;font-weight:900;color:#1B2E6B;margin-bottom:4px;}.f{font-size:12px;color:#6b7280;margin-bottom:20px;}.s{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;}.sc{background:#f8faff;border:1px solid #e5eaf5;border-radius:10px;padding:14px;text-align:center;}.sv{font-size:22px;font-weight:900;color:#1B2E6B;font-family:monospace;}.sl{font-size:10px;color:#9ca3af;text-transform:uppercase;margin-top:4px;}table{width:100%;border-collapse:collapse;}thead{background:#1B2E6B;color:#fff;}th{padding:9px 12px;text-align:left;font-size:11px;}td{padding:9px 12px;border-bottom:1px solid #f0f4ff;font-size:12px;}.ft{text-align:center;margin-top:20px;font-size:11px;color:#9ca3af;}@media print{@page{margin:15mm;}}</style></head><body><div class="t">Valoracion del Inventario</div><div class="f">${new Date().toLocaleDateString('es-SV',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div><div class="s"><div class="sc"><div class="sv">${fmt(vc)}</div><div class="sl">Valor a costo</div></div><div class="sc"><div class="sv">${fmt(vv)}</div><div class="sl">Valor a venta</div></div><div class="sc"><div class="sv">${fmt(vv-vc)}</div><div class="sl">Ganancia estimada</div></div></div><table><thead><tr><th>Categoria</th><th>Productos</th><th>Unidades</th><th>Valor costo</th></tr></thead><tbody>${Object.entries(cats).map(([c,d])=>`<tr><td>${c}</td><td>${d.n}</td><td>${d.u}</td><td style="font-weight:700">${fmt(d.v)}</td></tr>`).join('')}</tbody></table><div class="ft">ORION · ONE GEO SYSTEMS · ${new Date().toLocaleString('es-SV')}</div></body></html>`)
  }

  const exportarBodega = () => {
    const ws = XLSX.utils.json_to_sheet(bodegas.map(b => ({ nombre: b.nombre, descripcion: b.descripcion || '', responsable: b.responsable || '', productos: productos.filter(p => p.bodega === b.id).length })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Bodegas')
    XLSX.writeFile(wb, `bodegas-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exportarSucursales = () => {
    const ws = XLSX.utils.json_to_sheet(sucursales.map(s => ({ nombre: s.nombre, direccion: s.direccion || '', telefono: s.telefono || '', responsable: s.responsable || '' })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sucursales')
    XLSX.writeFile(wb, `sucursales-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const guardarBodega = async () => {
    if (!formBodega.nombre) return; setGuardando(true)
    try { if (editandoBodega) await updateDoc(doc(db, 'bodegas', editandoBodega), { ...formBodega, updatedAt: serverTimestamp() }); else await addDoc(collection(db, 'bodegas'), { ...formBodega, empresaId, createdAt: serverTimestamp() }); setModalBodega(false); setEditandoBodega(null); setFormBodega({ nombre: '', descripcion: '', responsable: '' }) } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const guardarSucursal = async () => {
    if (!formSucursal.nombre) return; setGuardando(true)
    try { if (editandoSucursal) await updateDoc(doc(db, 'sucursales', editandoSucursal), { ...formSucursal, updatedAt: serverTimestamp() }); else await addDoc(collection(db, 'sucursales'), { ...formSucursal, empresaId, createdAt: serverTimestamp() }); setModalSucursal(false); setEditandoSucursal(null); setFormSucursal({ nombre: '', direccion: '', telefono: '', responsable: '' }) } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  // ── CRUD CATEGORÍAS ──
  const guardarCategoria = async () => {
    if (!formCategoria.nombre) return
    setGuardando(true)
    try {
      if (editandoCategoria) {
        await updateDoc(doc(db, 'categorias', editandoCategoria), { ...formCategoria, updatedAt: serverTimestamp() })
      } else {
        await addDoc(collection(db, 'categorias'), { ...formCategoria, empresaId, createdAt: serverTimestamp() })
      }
      setModalCategoria(false)
      setEditandoCategoria(null)
      setFormCategoria({ nombre: '', descripcion: '', color: '#4A8FE8', icono: '📦' })
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const exportarCategorias = () => {
    const datos = categorias.map(c => {
      const prods = productos.filter(p => p.categoria === c.nombre)
      const valor = prods.reduce((s, p) => s + (p.precio || 0) * (p.stock || 0), 0)
      const bajos = prods.filter(p => (p.stock || 0) < (p.min || 0)).length
      return { nombre: c.nombre, descripcion: c.descripcion || '', productos: prods.length, valor_inventario: valor.toFixed(2), alertas: bajos }
    })
    const ws = XLSX.utils.json_to_sheet(datos)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Categorias')
    XLSX.writeFile(wb, `categorias-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Análisis ABC por categoría
  const getClaseABC = (valor, maxValor) => {
    if (valor >= maxValor * 0.7) return { clase: 'A', color: '#00C296', desc: 'Alto valor' }
    if (valor >= maxValor * 0.3) return { clase: 'B', color: '#4A8FE8', desc: 'Valor medio' }
    return { clase: 'C', color: '#6b7280', desc: 'Bajo valor' }
  }

  const categoriasFiltradas = categorias.filter(c =>
    c.nombre?.toLowerCase().includes(busCategoria.toLowerCase()) ||
    c.descripcion?.toLowerCase().includes(busCategoria.toLowerCase())
  )

  // También incluir categorías de productos que no están en la colección
  const categoriasDeProductos = [...new Set(productos.map(p => p.categoria).filter(Boolean))]
  const todasCategorias = [
    ...categoriasFiltradas,
    ...categoriasDeProductos
      .filter(nombre => !categorias.find(c => c.nombre === nombre))
      .filter(nombre => nombre.toLowerCase().includes(busCategoria.toLowerCase()))
      .map(nombre => ({ nombre, descripcion: '', color: '#6b7280', icono: '📦', _auto: true }))
  ]

  const maxValorCategoria = Math.max(...todasCategorias.map(c => productos.filter(p => p.categoria === c.nombre).reduce((s, p) => s + (p.precio || 0) * (p.stock || 0), 0)), 1)

  const productosCriticos = productos.filter(p => (p.stock || 0) === 0)
  const productosBajos = productos.filter(p => (p.stock || 0) > 0 && (p.stock || 0) < (p.min || 0))

  const alertaCriticoFiltrada = productosCriticos.filter(p =>
    p.nombre?.toLowerCase().includes(busAlerta.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busAlerta.toLowerCase())
  )

  const alertaBajaFiltrada = productosBajos.filter(p =>
    p.nombre?.toLowerCase().includes(busAlerta.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busAlerta.toLowerCase())
  )
  const valorInventario = productos.reduce((s, p) => s + (p.precio || 0) * (p.stock || 0), 0)
  const totalOk = importData.filter(f => f._ok).length
  const totalErr = importData.filter(f => !f._ok).length
  const totalEntradas = kardex.filter(k => ['entrada','devolucion'].includes(k.tipo)).reduce((s, k) => s + (k.cantidad || 0), 0)
  const totalSalidas = kardex.filter(k => ['salida'].includes(k.tipo)).reduce((s, k) => s + (k.cantidad || 0), 0)
  const f = form

  // Las 8 secciones — fuente única para tarjetas grandes y píldoras
  const SECCIONES = [
    { id: 'productos',  icon: 'productos',  color: '#00C296', label: 'Productos',          val: productos.length, sub: 'articulos en inventario' },
    { id: 'kardex',     icon: 'kardex',     color: '#4A8FE8', label: 'Kardex',             val: productos.reduce((s, p) => s + (p.stock || 0), 0), sub: 'unidades en stock total' },
    { id: 'ajustes',    icon: 'ajuste',     color: '#f59e0b', label: 'Ajuste de Inventario', val: productos.filter(p => (p.stock || 0) <= (p.min || 0)).length, sub: 'productos necesitan atencion' },
    { id: 'bodega',     icon: 'bodega',     color: '#8b5cf6', label: 'Bodega',             val: bodegas.length, sub: 'zonas de almacenamiento' },
    { id: 'sucursales', icon: 'sucursal',   color: '#2E6FD4', label: 'Sucursales',         val: sucursales.length, sub: 'puntos de venta activos' },
    { id: 'alertas',    icon: 'alertas',    color: '#ef4444', label: 'Alertas de Stock',   val: productosCriticos.length, sub: `${productosCriticos.length} agotados · ${productosBajos.length} stock bajo`, badge: productosCriticos.length + productosBajos.length },
    { id: 'valoracion', icon: 'valoracion', color: '#00C296', label: 'Valoracion',         val: fmt(valorInventario), valChico: valorInventario > 99999, sub: 'valor del inventario a costo' },
    { id: 'categorias', icon: 'categorias', color: '#ec4899', label: 'Categorias',         val: todasCategorias.length, sub: `${categorias.length} registradas · ${categoriasDeProductos.length} en uso` },
  ]

  const BackBtn = () => null

  return (
    <>
      <style>{invStyles}</style>

      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">📦 Inventario</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {productos.length} productos · {bodegas.length} bodegas · {sucursales.length} sucursales
            <span className="firebase-badge">🔥 Firebase</span>
          </div>
        </div>
        {vista === 'productos' && puede('crear_productos') && <button className="btn btn-primary" onClick={() => abrirModal()}>+ Nuevo Producto</button>}
        {vista === 'bodega' && <button className="btn btn-primary" onClick={() => setModalBodega(true)}>+ Nueva Bodega</button>}
        {vista === 'categorias' && <button className="btn btn-primary" onClick={() => setModalCategoria(true)}>+ Nueva Categoria</button>}
      </div>

      {/* ══ PANEL DE INICIO — tarjetas grandes ══ */}
      {vista === 'panel' && (
        <>
        <div className="inv-panel">
          {SECCIONES.map(s => (
            <div key={s.id} className="inv-card" style={{ '--ic-color': s.color }} onClick={() => setVista(s.id)}>
              {s.badge > 0 && <div className="inv-card-badge">{s.badge}</div>}
              <div className="inv-card-watermark"><PanelIcon name={s.icon} /></div>
              <div className="inv-card-icon"><PanelIcon name={s.icon} /></div>
              <div className="inv-card-title">{s.label}</div>
              <div className="inv-card-val" style={{ color: s.color, fontSize: s.valChico ? 18 : undefined }}>{s.val}</div>
              <div className="inv-card-sub">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ══ RESUMEN ACCIONABLE ══ */}
        <div className="inv-resumen">
          {/* Reponer pronto */}
          <div className="inv-resumen-card">
            <div className="inv-resumen-head">
              <span className="inv-resumen-title" style={{ color: '#ef4444' }}>⚠ Reponer pronto</span>
              {(productosCriticos.length + productosBajos.length) > 0 && <span className="inv-resumen-badge" style={{ background: '#ef4444' }}>{productosCriticos.length + productosBajos.length}</span>}
            </div>
            {[...productosCriticos, ...productosBajos].slice(0, 6).length === 0 ? (
              <div className="inv-resumen-vacio">Todo el stock está en orden ✓</div>
            ) : (
              [...productosCriticos, ...productosBajos].slice(0, 6).map(p => (
                <div key={p.id} className="inv-resumen-row">
                  <span className="inv-resumen-nombre">{p.nombre}</span>
                  <span className="inv-resumen-val" style={{ color: (p.stock || 0) === 0 ? '#ef4444' : '#f59e0b' }}>{p.stock || 0} / {p.min || 0}</span>
                </div>
              ))
            )}
            {(productosCriticos.length + productosBajos.length) > 0 && (
              <div className="inv-resumen-link" onClick={() => setVista('alertas')}>Ver todas las alertas →</div>
            )}
          </div>

          {/* Movimientos recientes */}
          <div className="inv-resumen-card">
            <div className="inv-resumen-head">
              <span className="inv-resumen-title" style={{ color: '#4A8FE8' }}>↻ Movimientos recientes</span>
            </div>
            {ultimosMov.length === 0 ? (
              <div className="inv-resumen-vacio">Sin movimientos registrados</div>
            ) : (
              ultimosMov.map(m => (
                <div key={m.id} className="inv-resumen-row">
                  <span className="inv-resumen-icon" style={{ color: m.tipo === 'entrada' ? '#00C296' : '#ef4444' }}>{m.tipo === 'entrada' ? '↓' : '↑'}</span>
                  <span className="inv-resumen-nombre" style={{ flex: 1 }}>{m.productoNombre || '—'}<span style={{ color: 'var(--muted)', fontSize: 11 }}> · {m.motivo || m.tipo}</span></span>
                  <span className="inv-resumen-val" style={{ color: m.tipo === 'entrada' ? '#00C296' : '#ef4444' }}>{m.tipo === 'entrada' ? '+' : '−'}{m.cantidad || 0}</span>
                </div>
              ))
            )}
            <div className="inv-resumen-link" onClick={() => setVista('kardex')}>Ver Kardex completo →</div>
          </div>
        </div>
        </>
      )}

      {/* ══ BARRA DE PÍLDORAS — dentro de cada sección ══ */}
      {vista !== 'panel' && (
        <div className="inv-pills">
          <div className="inv-pill inv-pill-home" onClick={() => setVista('panel')} title="Volver al panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10"/></svg>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Inicio</span>
          </div>
          {SECCIONES.map(s => (
            <div key={s.id} className={`inv-pill ${vista === s.id ? 'activa' : ''}`} style={{ '--ic-color': s.color }} onClick={() => setVista(s.id)}>
              <span className="inv-pill-icon"><PanelIcon name={s.icon} /></span>
              <span className="inv-pill-label">{s.label}</span>
              {typeof s.val !== 'string' && <span className="inv-pill-num">{s.val}</span>}
            </div>
          ))}
        </div>
      )}

      {/* ══ PRODUCTOS ══ */}
      {vista === 'productos' && (<>
        <BackBtn />
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar por nombre, codigo, categoria o proveedor..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <div className="toolbar-group">
            {puede('importar_exportar') && <>
              <button className="btn btn-ghost btn-sm" onClick={descargarPlantilla}>📋 Plantilla</button>
              <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()}>📥 Importar</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={leerExcel} />
              <button className="btn btn-ghost btn-sm" onClick={exportarExcel} disabled={!productos.length}>📤 Exportar</button>
            </>}
          </div>
        </div>
        <div className="card">
          {loading ? <div className="loading">🔄 Cargando...</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>CODIGO</th><th>PRODUCTO</th><th>CATEGORIA</th><th>BODEGA</th><th>PRECIO</th><th>UNIDADES</th><th>STOCK</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
                <tbody>
                  {filtrados.length === 0 ? <tr><td colSpan={9}><div className="empty-state"><div className="empty-icon">📦</div><div className="empty-text">{busqueda ? 'No encontrado' : 'Agrega tu primer producto'}</div></div></td></tr>
                  : filtrados.slice(pagProd * POR_PAGINA, (pagProd + 1) * POR_PAGINA).map(p => (
                    <tr key={p.id} className="prod-row">
                      <td className="mono" style={{ fontSize: 12, color: 'var(--accent2)' }}>{p.codigo}</td>
                      <td><div style={{ fontWeight: 500 }}>{p.nombre}</div>{p.ubicacion && <div style={{ fontSize: 11, color: 'var(--muted)' }}>📍 {p.ubicacion}</div>}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.categoria || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{bodegas.find(b => b.id === p.bodega)?.nombre || '—'}</td>
                      <td><div className="amount" style={{ fontWeight: 700 }}>${((p.precio||0)*1.13).toFixed(2)}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>${(p.precio||0).toFixed(2)} s/IVA</div></td>
                      <td><div style={{ fontSize: 12, fontWeight: 600 }}>{p.unidad}</div>{(p.unidadesAdicionales||[]).length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>{p.unidadesAdicionales.map((u, i) => <span key={i} className="prod-tag">📦 {u.nombre}</span>)}</div>}</td>
                      <td><span className={getStockClass(p.stock||0,p.min||0)}>{p.stock||0}</span><div style={{ fontSize: 10, color: 'var(--muted)' }}>min: {p.min||0}</div>{stockLegible(p) && <div style={{ fontSize: 10, color: 'var(--accent2)', marginTop: 2 }}>≈ {stockLegible(p)}</div>}</td>
                      <td><span className={`status-pill ${p.stock===0?'agotado':p.stock<(p.min||0)?'bajo':'activo'}`}><span className="dot"/>{p.stock===0?'Agotado':p.stock<(p.min||0)?'Stock bajo':'Normal'}</span></td>
                      <td><div className="action-btns">
                        {puede('ver_kardex') && <button className="btn btn-kardex btn-sm" onClick={() => cargarKardexProducto(p)} title="Kardex">📋</button>}
                        {puede('registrar_movimientos') && <button className="btn btn-ghost btn-sm" onClick={() => { setMovModal(p); setMovForm({ tipo: 'entrada', cantidad: '', unidad: p.unidad, motivo: '', referencia: '', sucursalOrigen: '', sucursalDestino: '' }) }} title="Movimiento">⚡</button>}
                        {puede('editar_productos') && <button className="btn btn-ghost btn-sm" onClick={() => abrirEtiqueta(p)} title="Imprimir etiqueta de código de barras">🏷️</button>}
                        {puede('editar_productos') && <button className="btn btn-ghost btn-sm" onClick={() => abrirModal(p)}>✏️</button>}
                        {puede('eliminar_productos') && <button className="btn btn-danger btn-sm" onClick={() => eliminar(p.id)}>🗑️</button>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Paginador total={filtrados.length} pagina={pagProd} setPagina={setPagProd} />
        </div>
      </>)}

      {/* ══ KARDEX ══ */}
      {vista === 'kardex' && (<>
        <BackBtn />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{kardexModal ? `📋 Kardex — ${kardexModal.nombre}` : '📋 Kardex Global'}</div>
          <button className="btn btn-ghost btn-sm" onClick={exportarKardex}>📤 Exportar Excel</button>
        </div>
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar por producto, tipo, motivo o referencia..." value={busKardex} onChange={e => setBusKardex(e.target.value)} />
          {busKardex && <button className="btn btn-ghost btn-sm" onClick={() => setBusKardex('')}>✕ Limpiar</button>}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{kardexFiltrado.length} movimientos</span>
        </div>
        <div className="kardex-stats">
          <div className="kardex-stat"><div className="kardex-stat-val" style={{ color: '#00C296' }}>{totalEntradas.toFixed(0)}</div><div className="kardex-stat-label">Entradas</div></div>
          <div className="kardex-stat"><div className="kardex-stat-val" style={{ color: '#ef4444' }}>{totalSalidas.toFixed(0)}</div><div className="kardex-stat-label">Salidas</div></div>
          <div className="kardex-stat"><div className="kardex-stat-val">{kardex.length}</div><div className="kardex-stat-label">Movimientos</div></div>
          <div className="kardex-stat"><div className="kardex-stat-val" style={{ color: 'var(--accent2)' }}>{kardexModal ? `${kardexModal.stock} ${kardexModal.unidad}` : productos.length}</div><div className="kardex-stat-label">{kardexModal ? 'Stock Actual' : 'Productos'}</div></div>
        </div>
        <div className="card">
          {loadingKardex ? <div className="loading">🔄 Cargando...</div> : kardex.length === 0 ? <div className="empty-state"><div className="empty-icon">📋</div><div className="empty-text">Sin movimientos</div></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>FECHA</th>{!kardexModal && <th>PRODUCTO</th>}<th>TIPO</th><th>CANT.</th><th>UNIDAD</th><th>ANTES</th><th>DESPUES</th><th>MOTIVO</th><th>REF.</th></tr></thead>
                <tbody>
                  {kardexFiltrado.slice(pagKardex * POR_PAGINA, (pagKardex + 1) * POR_PAGINA).map(k => {
                    const mov = TIPOS_MOVIMIENTO.find(m => m.value === k.tipo) || TIPOS_MOVIMIENTO[0]
                    const fecha = k.fecha?.toDate?.() || new Date()
                    return (
                      <tr key={k.id}>
                        <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fecha.toLocaleDateString('es-SV')}<br/><span style={{ fontSize: 10 }}>{fecha.toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'})}</span></td>
                        {!kardexModal && <td><div style={{ fontWeight: 600, fontSize: 13 }}>{k.productoNombre}</div><div className="mono" style={{ fontSize: 10, color: 'var(--accent2)' }}>{k.productoCodigo}</div></td>}
                        <td><span className="mov-badge" style={{ background: mov.color+'15', color: mov.color, border: `1px solid ${mov.color}30` }}>{mov.icon} {mov.label}</span></td>
                        <td className="mono" style={{ fontWeight: 700, color: ['entrada','devolucion'].includes(k.tipo)?'#00C296':'#ef4444' }}>
                          {['entrada','devolucion'].includes(k.tipo)?'+':k.tipo==='ajuste'?'=':'-'}{k.cantidad}
                          {k.presentacion && <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>📦 {k.presentacion}</div>}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{k.unidad}</td>
                        <td className="mono" style={{ color: 'var(--muted)', fontSize: 13 }}>{k.stockAntes}</td>
                        <td className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{k.stockDespues}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{k.motivo || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--accent2)', fontFamily: 'var(--mono)' }}>{k.referencia || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Paginador total={kardexFiltrado.length} pagina={pagKardex} setPagina={setPagKardex} />
        </div>
      </>)}

      {/* ══ AJUSTES ══ */}
      {vista === 'ajustes' && (<>
        <BackBtn />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>⚡ Ajuste de Inventario</div>
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar por nombre, codigo o estado (agotado, bajo, normal)..." value={busAjuste} onChange={e => setBusAjuste(e.target.value)} />
          {busAjuste && <button className="btn btn-ghost btn-sm" onClick={() => setBusAjuste('')}>✕ Limpiar</button>}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{ajusteFiltrado.length} productos</span>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>CODIGO</th><th>PRODUCTO</th><th>STOCK ACTUAL</th><th>MINIMO</th><th>ESTADO</th><th>ACCION</th></tr></thead>
              <tbody>
                {ajusteFiltrado.map(p => (
                  <tr key={p.id}>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--accent2)' }}>{p.codigo}</td>
                    <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                    <td><span className={getStockClass(p.stock||0,p.min||0)}>{p.stock||0} {p.unidad}</span></td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{p.min||0}</td>
                    <td><span className={`status-pill ${p.stock===0?'agotado':p.stock<(p.min||0)?'bajo':'activo'}`}><span className="dot"/>{p.stock===0?'Agotado':p.stock<(p.min||0)?'Bajo':'Normal'}</span></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => { setMovModal(p); setMovForm({ tipo: 'ajuste', cantidad: '', unidad: p.unidad, motivo: '', referencia: '', sucursalOrigen: '', sucursalDestino: '' }) }}>⚡ Ajustar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}

      {/* ══ BODEGA ══ */}
      {vista === 'bodega' && (<>
        <BackBtn />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>🏭 Bodegas</div>
          <button className="btn btn-ghost btn-sm" onClick={exportarBodega}>📤 Exportar</button>
        </div>
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar por nombre o responsable..." value={busBodega} onChange={e => setBusBodega(e.target.value)} />
          {busBodega && <button className="btn btn-ghost btn-sm" onClick={() => setBusBodega('')}>✕ Limpiar</button>}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{bodegaFiltrada.length} bodegas</span>
        </div>
        {bodegas.length === 0 ? <div className="empty-state"><div className="empty-icon">🏭</div><div className="empty-text">No hay bodegas.<br/>Crea tu primera bodega.</div></div> : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>BODEGA</th><th>DESCRIPCION</th><th>RESPONSABLE</th><th>PRODUCTOS</th><th>VALOR</th><th>ACCIONES</th></tr></thead>
                <tbody>
                  {bodegaFiltrada.length === 0 ? <tr><td colSpan={6}><div className="empty-state"><div className="empty-text">No encontrado</div></div></td></tr>
                  : bodegaFiltrada.slice(pagBodega * POR_PAGINA, (pagBodega + 1) * POR_PAGINA).map(b => {
                    const prods = productos.filter(p => p.bodega === b.id)
                    const valor = prods.reduce((s, p) => s + (p.precio||0)*(p.stock||0), 0)
                    return (
                      <tr key={b.id} className="prod-row">
                        <td style={{ fontWeight: 600 }}>🏭 {b.nombre}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{b.descripcion || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{b.responsable ? `👤 ${b.responsable}` : '—'}</td>
                        <td><span className="amount" style={{ fontWeight: 700, color: 'var(--accent)' }}>{prods.length}</span></td>
                        <td><span className="amount" style={{ fontWeight: 700, color: '#4A8FE8' }}>{fmt(valor)}</span></td>
                        <td><div className="action-btns">
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditandoBodega(b.id); setFormBodega({ nombre: b.nombre, descripcion: b.descripcion||'', responsable: b.responsable||'' }); setModalBodega(true) }}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Eliminar bodega?')) deleteDoc(doc(db,'bodegas',b.id)) }}>🗑️</button>
                        </div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Paginador total={bodegaFiltrada.length} pagina={pagBodega} setPagina={setPagBodega} />
          </div>
        )}
      </>)}

      {/* ══ SUCURSALES ══ */}
      {vista === 'sucursales' && (<>
        <BackBtn />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>🏪 Sucursales</div>
          <button className="btn btn-ghost btn-sm" onClick={exportarSucursales}>📤 Exportar</button>
        </div>
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar por nombre, direccion o responsable..." value={busSucursal} onChange={e => setBusSucursal(e.target.value)} />
          {busSucursal && <button className="btn btn-ghost btn-sm" onClick={() => setBusSucursal('')}>✕ Limpiar</button>}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{sucursalFiltrada.length} sucursales</span>
        </div>
        {sucursales.length === 0 ? <div className="empty-state"><div className="empty-icon">🏪</div><div className="empty-text">No hay sucursales.<br/>Las gestiona One Geo.</div></div> : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>SUCURSAL</th><th>DIRECCION</th><th>TELEFONO</th><th>RESPONSABLE</th></tr></thead>
                <tbody>
                  {sucursalFiltrada.length === 0 ? <tr><td colSpan={4}><div className="empty-state"><div className="empty-text">No encontrado</div></div></td></tr>
                  : sucursalFiltrada.slice(pagSucursal * POR_PAGINA, (pagSucursal + 1) * POR_PAGINA).map(s => (
                    <tr key={s.id} className="prod-row">
                      <td style={{ fontWeight: 600 }}>🏪 {s.nombre}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{s.direccion ? `📍 ${s.direccion}` : '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{s.telefono ? `📞 ${s.telefono}` : '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{s.responsable ? `👤 ${s.responsable}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginador total={sucursalFiltrada.length} pagina={pagSucursal} setPagina={setPagSucursal} />
          </div>
        )}
      </>)}

      {/* ══ ALERTAS ══ */}
      {vista === 'alertas' && (<>
        <BackBtn />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>🚨 Alertas de Stock</div>
          <button className="btn btn-ghost btn-sm" onClick={exportarAlertas}>📤 Exportar Excel</button>
        </div>
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar por nombre o codigo..." value={busAlerta} onChange={e => setBusAlerta(e.target.value)} />
          {busAlerta && <button className="btn btn-ghost btn-sm" onClick={() => setBusAlerta('')}>✕ Limpiar</button>}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{alertaCriticoFiltrada.length + alertaBajaFiltrada.length} alertas</span>
        </div>
        {alertaCriticoFiltrada.length > 0 && (<>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>🔴 Agotados — {alertaCriticoFiltrada.length}</div>
          {alertaCriticoFiltrada.map(p => (
            <div key={p.id} className="alerta-card" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.04)' }}>
              <div className="alerta-semaforo alerta-critico"/>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{p.nombre}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.codigo} · {p.categoria||'Sin categoria'}</div></div>
              <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: '#ef4444', fontSize: 16 }}>0 {p.unidad}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Sugerido: {Math.max((p.min||0)*2,10)}</div></div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setMovModal(p); setMovForm({ tipo: 'entrada', cantidad: String(Math.max((p.min||0)*2,10)), unidad: p.unidad, motivo: 'Reposicion de stock', referencia: '', sucursalOrigen: '', sucursalDestino: '' }) }}>⚡ Reponer</button>
            </div>
          ))}
        </>)}
        {alertaBajaFiltrada.length > 0 && (<>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '18px 0 10px' }}>🟡 Stock Bajo — {alertaBajaFiltrada.length}</div>
          {alertaBajaFiltrada.map(p => (
            <div key={p.id} className="alerta-card" style={{ borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.04)' }}>
              <div className="alerta-semaforo alerta-bajo"/>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{p.nombre}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.codigo} · {p.categoria||'Sin categoria'}</div></div>
              <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: '#f59e0b', fontSize: 16 }}>{p.stock} {p.unidad}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Min: {p.min} · Pedir: {Math.max((p.min||0)*2-(p.stock||0),0)}</div></div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setMovModal(p); setMovForm({ tipo: 'entrada', cantidad: String(Math.max((p.min||0)*2-(p.stock||0),0)), unidad: p.unidad, motivo: 'Reposicion de stock', referencia: '', sucursalOrigen: '', sucursalDestino: '' }) }}>⚡ Reponer</button>
            </div>
          ))}
        </>)}
        {alertaCriticoFiltrada.length === 0 && alertaBajaFiltrada.length === 0 && <div className="empty-state"><div className="empty-icon">✅</div><div className="empty-text">¡Todo el inventario esta en buen estado!<br/>No hay alertas de stock.</div></div>}
      </>)}

      {/* ══ VALORACION ══ */}
      {vista === 'valoracion' && (<>
        <BackBtn />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>📊 Valoracion del Inventario</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={exportarValoracion}>📤 Excel</button>
            <button className="btn btn-ghost btn-sm" onClick={imprimirValoracion}>🖨️ PDF</button>
          </div>
        </div>
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar por nombre, codigo o categoria..." value={busValoracion} onChange={e => setBusValoracion(e.target.value)} />
          {busValoracion && <button className="btn btn-ghost btn-sm" onClick={() => setBusValoracion('')}>✕ Limpiar</button>}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{valoracionFiltrada.length} productos</span>
        </div>
        <div className="valor-stats">
          <div className="valor-stat"><div className="valor-stat-val" style={{ color: '#00C296' }}>{fmt(productos.reduce((s,p)=>s+(p.precio||0)*(p.stock||0),0))}</div><div className="valor-stat-label">Valor a Costo</div></div>
          <div className="valor-stat"><div className="valor-stat-val" style={{ color: '#4A8FE8' }}>{fmt(productos.reduce((s,p)=>s+(p.precio||0)*1.13*(p.stock||0),0))}</div><div className="valor-stat-label">Valor a Precio de Venta</div></div>
          <div className="valor-stat"><div className="valor-stat-val" style={{ color: '#8b5cf6' }}>{fmt(productos.reduce((s,p)=>s+(p.precio||0)*0.13*(p.stock||0),0))}</div><div className="valor-stat-label">Ganancia Estimada (IVA)</div></div>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>CODIGO</th><th>PRODUCTO</th><th>CATEGORIA</th><th>STOCK</th><th>PRECIO COSTO</th><th>PRECIO VENTA</th><th>VALOR COSTO</th><th>VALOR VENTA</th></tr></thead>
              <tbody>
                {valoracionFiltrada.map(p => (
                  <tr key={p.id}>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--accent2)' }}>{p.codigo}</td>
                    <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.categoria||'—'}</td>
                    <td className="mono">{p.stock||0} {p.unidad}</td>
                    <td className="amount">{fmt(p.precio)}</td>
                    <td className="amount">{fmt((p.precio||0)*1.13)}</td>
                    <td className="amount" style={{ fontWeight: 700, color: '#00C296' }}>{fmt((p.precio||0)*(p.stock||0))}</td>
                    <td className="amount" style={{ fontWeight: 700, color: '#4A8FE8' }}>{fmt((p.precio||0)*1.13*(p.stock||0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}

      {/* ══ CATEGORIAS ══ */}
      {vista === 'categorias' && (<>
        <BackBtn />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>🗂️ Categorias</div>
          <button className="btn btn-ghost btn-sm" onClick={exportarCategorias}>📤 Exportar</button>
        </div>
        <div className="inv-toolbar">
          <input className="input" placeholder="🔍 Buscar categoria..." value={busCategoria} onChange={e => setBusCategoria(e.target.value)} />
          {busCategoria && <button className="btn btn-ghost btn-sm" onClick={() => setBusCategoria('')}>✕ Limpiar</button>}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{todasCategorias.length} categorias</span>
        </div>

        {todasCategorias.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">🗂️</div><div className="empty-text">No hay categorias.<br/>Agrega productos con categoria o crea una nueva.</div></div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>CATEGORIA</th><th>PRODUCTOS</th><th>VALOR</th><th>MARGEN</th><th>STOCK BAJO</th><th>CLASE</th><th>ACCIONES</th></tr></thead>
                <tbody>
                  {todasCategorias.slice(pagCategoria * POR_PAGINA, (pagCategoria + 1) * POR_PAGINA).map((c, idx) => {
                    const prods = productos.filter(p => p.categoria === c.nombre)
                    const valor = prods.reduce((s, p) => s + (p.precio || 0) * (p.stock || 0), 0)
                    const valorVenta = prods.reduce((s, p) => s + (p.precio || 0) * 1.13 * (p.stock || 0), 0)
                    const margen = valor > 0 ? ((valorVenta - valor) / valor * 100) : 0
                    const bajos = prods.filter(p => (p.stock || 0) < (p.min || 0)).length
                    const abc = getClaseABC(valor, maxValorCategoria)
                    return (
                      <tr key={c.id || idx} className="prod-row">
                        <td style={{ fontWeight: 600 }}><span style={{ marginRight: 6 }}>{c.icono || '📦'}</span>{c.nombre}{c._auto && <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>(sin registrar)</span>}</td>
                        <td><span className="amount" style={{ fontWeight: 700, color: 'var(--accent)' }}>{prods.length}</span></td>
                        <td><span className="amount" style={{ fontWeight: 700, color: '#4A8FE8' }}>{fmt(valor)}</span></td>
                        <td style={{ fontSize: 12, fontWeight: 600, color: margen > 0 ? '#00C296' : 'var(--muted)' }}>{margen.toFixed(0)}%</td>
                        <td style={{ fontSize: 12, fontWeight: 600, color: bajos > 0 ? '#ef4444' : 'var(--muted)' }}>{bajos > 0 ? `${bajos} ⚠` : '—'}</td>
                        <td><span style={{ background: abc.color + '20', color: abc.color, border: `1.5px solid ${abc.color}40`, borderRadius: 7, padding: '2px 9px', fontSize: 12, fontWeight: 800 }}>{abc.clase}</span></td>
                        <td><div className="action-btns">
                          <button className="btn btn-ghost btn-sm" onClick={() => { setBusqueda(c.nombre); setVista('productos') }} title="Ver productos">📦</button>
                          {!c._auto && <>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditandoCategoria(c.id); setFormCategoria({ nombre: c.nombre, descripcion: c.descripcion || '', color: c.color || '#4A8FE8', icono: c.icono || '📦' }); setModalCategoria(true) }}>✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Eliminar categoria?')) deleteDoc(doc(db,'categorias',c.id)) }}>🗑️</button>
                          </>}
                        </div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Paginador total={todasCategorias.length} pagina={pagCategoria} setPagina={setPagCategoria} />
          </div>
        )}
      </>)}

      {/* MODAL MOVIMIENTO */}
      {movModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">⚡ Registrar Movimiento</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}><strong style={{ color: 'var(--text)' }}>{movModal.nombre}</strong> · Stock: <strong>{movModal.stock} {movModal.unidad}</strong></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
              {TIPOS_MOVIMIENTO.filter(m => !['venta','compra'].includes(m.value)).map(m => (
                <div key={m.value} onClick={() => setMovForm(f => ({ ...f, tipo: m.value }))}
                  style={{ padding: '10px 8px', borderRadius: 10, textAlign: 'center', cursor: 'pointer', border: `1.5px solid ${movForm.tipo===m.value?m.color:'var(--border)'}`, background: movForm.tipo===m.value?m.color+'15':'var(--surface2)', color: movForm.tipo===m.value?m.color:'var(--muted)', fontSize: 12, fontWeight: 600, transition: 'all 0.15s' }}>
                  {m.icon} {m.label}
                </div>
              ))}
            </div>
            {movForm.tipo === 'traslado' && (
              <div className="form-grid" style={{ marginBottom: 12 }}>
                <div className="form-group"><label className="form-label">Sucursal Origen</label><select className="input" value={movForm.sucursalOrigen} onChange={e => setMovForm(f=>({...f,sucursalOrigen:e.target.value}))}><option value="">Seleccionar...</option>{sucursales.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Sucursal Destino</label><select className="input" value={movForm.sucursalDestino} onChange={e => setMovForm(f=>({...f,sucursalDestino:e.target.value}))}><option value="">Seleccionar...</option>{sucursales.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
              </div>
            )}
            <div className="form-grid">
              <div className="form-group"><label className="form-label">{movForm.tipo==='ajuste'?'Nuevo Stock Total':'Cantidad'}</label><input className="input" type="number" min="0" step="0.01" placeholder="0" value={movForm.cantidad} onChange={e=>setMovForm(f=>({...f,cantidad:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">Unidad</label><select className="input" value={movForm.unidad} onChange={e=>setMovForm(f=>({...f,unidad:e.target.value}))}><option value={movModal.unidad}>{movModal.unidad} (principal)</option>{(movModal.unidadesAdicionales||[]).map((u,i)=><option key={i} value={u.nombre}>{u.nombre}</option>)}</select></div>
            </div>
            <div className="form-group"><label className="form-label">Motivo</label><input className="input" placeholder="Compra proveedor, Merma..." value={movForm.motivo} onChange={e=>setMovForm(f=>({...f,motivo:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Referencia</label><input className="input" placeholder="OC-001, FE-000023..." value={movForm.referencia} onChange={e=>setMovForm(f=>({...f,referencia:e.target.value}))}/></div>
            {movForm.cantidad && (() => {
              const presSel = (movModal.unidadesAdicionales || []).find(u => u.nombre === movForm.unidad)
              const factor = presSel ? (Number(presSel.factor) || 1) : 1
              const cantBase = (parseFloat(movForm.cantidad) || 0) * factor
              const nuevo = movForm.tipo === 'ajuste'
                ? cantBase
                : ['entrada','devolucion'].includes(movForm.tipo)
                  ? (movModal.stock || 0) + cantBase
                  : Math.max(0, (movModal.stock || 0) - cantBase)
              return (
                <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginTop: 8, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Stock actual: <strong>{movModal.stock}</strong></span>
                    <span style={{ fontSize: 18 }}>→</span>
                    <span>Nuevo: <strong style={{ color: 'var(--accent)', fontSize: 16 }}>{nuevo} {movModal.unidad}</strong></span>
                  </div>
                  {factor > 1 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
                      📦 {movForm.cantidad} {movForm.unidad} = <strong style={{ color: 'var(--accent)' }}>{cantBase} {movModal.unidad}</strong>
                    </div>
                  )}
                </div>
              )
            })()}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setMovModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={registrarMovimiento} disabled={!movForm.cantidad}>⚡ Registrar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ETIQUETA CÓDIGO DE BARRAS */}
      {etiquetaModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 380 }}>
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>🏷️ Etiqueta de código de barras</h3>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{etiquetaModal.nombre}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              {etiquetaModal.codigoBarras
                ? <>Código de barras: <strong>{etiquetaCodigo}</strong></>
                : <>Sin código — se generará y guardará: <strong>{etiquetaCodigo}</strong></>}
            </div>
            <div style={{ background: '#fff', borderRadius: 8, padding: 12, textAlign: 'center', minHeight: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {etiquetaPreview
                ? <img src={etiquetaPreview} alt="código de barras" style={{ maxWidth: '100%' }} />
                : <span style={{ color: '#999', fontSize: 12 }}>Generando vista previa…</span>}
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Cantidad de etiquetas a imprimir</label>
              <input className="input" type="number" min="1" max="200" value={etiquetaCopias}
                onChange={e => setEtiquetaCopias(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn btn-ghost" onClick={() => setEtiquetaModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={imprimirEtiqueta}>🖨️ Imprimir</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRODUCTO */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal modal-prod-horizontal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editando ? '✏️ Editar Producto' : '📦 Nuevo Producto'}</div>
            <div className="prod-cols">

              {/* COLUMNA 1 — Información básica */}
              <div className="prod-col">
                <div className="section-divider">INFORMACION BASICA</div>
                <div className="form-group"><label className="form-label">CODIGO *</label><input className="input" placeholder="P001" value={f.codigo} onChange={e=>setForm({...f,codigo:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">CATEGORIA</label><input className="input" placeholder="Electrico..." value={f.categoria} onChange={e=>setForm({...f,categoria:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">NOMBRE *</label><input className="input" placeholder="Nombre del producto" value={f.nombre} onChange={e=>setForm({...f,nombre:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">PRECIO (sin IVA) *</label><input className="input" type="number" step="0.01" placeholder="0.00" value={f.precio} onChange={e=>setForm({...f,precio:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">DESCUENTO (%)</label><input className="input" type="number" min="0" max="100" placeholder="0" value={f.descuento} onChange={e=>setForm({...f,descuento:e.target.value})}/></div>
                {f.precio && <div className="iva-hint">💡 Precio con IVA: <strong style={{ color: 'var(--accent)' }}>${precioFinal(f.precio,f.descuento).toFixed(2)}</strong></div>}
              </div>

              {/* COLUMNA 2 — Unidades de medida */}
              <div className="prod-col">
                <div className="section-divider">UNIDADES DE MEDIDA</div>
                <div className="form-group">
                  <label className="form-label">UNIDAD PRINCIPAL *</label>
                  <select className="input" value={f.unidad} onChange={e=>setForm({...f,unidad:e.target.value})}>
                    {['General','Empaque','Longitud','Peso','Volumen'].map(g=><optgroup key={g} label={g}>{UNIDADES_SISTEMA.filter(u=>u.grupo===g).map(u=><option key={u.nombre} value={u.nombre}>{u.nombre}</option>)}</optgroup>)}
                    <option value="Otra">Otra</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">STOCK *</label><input className="input" type="number" placeholder="0" value={f.stock} onChange={e=>setForm({...f,stock:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">STOCK MINIMO</label><input className="input" type="number" placeholder="0" value={f.min} onChange={e=>setForm({...f,min:e.target.value})}/></div>
                <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>📦 Unidades Adicionales <span className="tag-opcional">OPCIONAL</span></div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setForm(f=>({...f,unidadesAdicionales:[...(f.unidadesAdicionales||[]),{nombre:'',factor:1,precio:''}]}))}>+ Agregar</button>
                  </div>
                  {(f.unidadesAdicionales||[]).length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>Sin unidades adicionales</div>}
                  {(f.unidadesAdicionales||[]).map((u,idx)=>(
                    <div key={idx} className="unidad-adicional-row">
                      <div style={{ flex: 2 }}><div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Nombre</div><input className="input" style={{ height: 34, fontSize: 13 }} placeholder="Rollo, Caja..." value={u.nombre} onChange={e=>{const n=[...(f.unidadesAdicionales||[])];n[idx]={...n[idx],nombre:e.target.value};setForm({...f,unidadesAdicionales:n})}}/></div>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Factor</div><input className="input" type="number" style={{ height: 34, fontSize: 13 }} placeholder="100" value={u.factor} onChange={e=>{const n=[...(f.unidadesAdicionales||[])];n[idx]={...n[idx],factor:parseFloat(e.target.value)||1};setForm({...f,unidadesAdicionales:n})}}/></div>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Precio s/IVA</div><input className="input" type="number" step="0.01" style={{ height: 34, fontSize: 13 }} placeholder="0.00" value={u.precio} onChange={e=>{const n=[...(f.unidadesAdicionales||[])];n[idx]={...n[idx],precio:e.target.value};setForm({...f,unidadesAdicionales:n})}}/></div>
                      <button className="btn btn-danger btn-sm" style={{ height: 34, alignSelf: 'flex-end' }} onClick={()=>setForm(f=>({...f,unidadesAdicionales:f.unidadesAdicionales.filter((_,i)=>i!==idx)}))}>✕</button>
                    </div>
                  ))}
                  {(f.unidadesAdicionales||[]).filter(u => u.nombre && u.factor > 1 && u.precio).map((u, idx) => {
                    const precioSuelto = (parseFloat(f.precio) || 0) * (u.factor || 1)
                    const precioPres = parseFloat(u.precio) || 0
                    if (precioSuelto === 0) return null
                    const dif = precioSuelto - precioPres
                    const pct = ((dif / precioSuelto) * 100)
                    return (
                      <div key={'cmp'+idx} style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 12px', lineHeight: 1.5 }}>
                        💡 <strong>{u.nombre}:</strong> {u.factor} {f.unidad || 'u'} sueltas = ${precioSuelto.toFixed(2)} · vendés a ${precioPres.toFixed(2)} →{' '}
                        {dif > 0
                          ? <span style={{ color: 'var(--accent3)' }}>cliente ahorra ${dif.toFixed(2)} ({pct.toFixed(0)}% desc.)</span>
                          : dif < 0
                            ? <span style={{ color: 'var(--danger)' }}>⚠️ la caja sale ${Math.abs(dif).toFixed(2)} MÁS cara que suelto</span>
                            : <span>igual precio que suelto</span>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* COLUMNA 3 — Información adicional */}
              <div className="prod-col">
                <div className="section-divider">INFORMACION ADICIONAL <span className="tag-opcional">OPCIONAL</span></div>
                <div className="form-group"><label className="form-label">PROVEEDOR</label><input className="input" placeholder="Nombre del proveedor" value={f.proveedor} onChange={e=>setForm({...f,proveedor:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">CODIGO DE BARRAS</label><input className="input" placeholder="7500000001234" value={f.codigoBarras} onChange={e=>setForm({...f,codigoBarras:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">UBICACION EN BODEGA</label><input className="input" placeholder="Estante A-1..." value={f.ubicacion} onChange={e=>setForm({...f,ubicacion:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">BODEGA</label><select className="input" value={f.bodega} onChange={e=>setForm({...f,bodega:e.target.value})}><option value="">Sin bodega</option>{bodegas.map(b=><option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
                <div className="form-group"><label className="form-label">FECHA VENCIMIENTO</label><input className="input" type="date" value={f.fechaVencimiento} onChange={e=>setForm({...f,fechaVencimiento:e.target.value})}/></div>
                <div className="form-group">
                  <label className="form-label">IMAGEN DEL PRODUCTO</label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 70, height: 70, borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', cursor: 'pointer' }}
                      onClick={() => fileInputRef.current?.click()}>
                      {f.imagen ? <img src={f.imagen} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display='none'} /> : <span style={{ fontSize: 26, opacity: 0.3 }}>📷</span>}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadImagen(e.target.files[0])} />
                      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => uploadImagen(e.target.files[0])} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingImg} style={{ justifyContent: 'flex-start', flex: 1 }}>
                          {uploadingImg ? '⏳ Subiendo...' : '📁 Galería'}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => cameraInputRef.current?.click()} disabled={uploadingImg} style={{ justifyContent: 'flex-start', flex: 1 }}>
                          📸 Cámara
                        </button>
                      </div>
                      {f.imagen && <button type="button" className="btn btn-danger btn-sm" onClick={eliminarImagen} style={{ justifyContent: 'flex-start' }}>🗑️ Quitar imagen</button>}
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>JPG, PNG, WebP · Máx 5MB</div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando||!f.codigo||!f.nombre||!f.precio||!f.stock}>{guardando?'⏳ Guardando...':'💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CATEGORIA */}
      {modalCategoria && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editandoCategoria ? '✏️ Editar Categoria' : '🗂️ Nueva Categoria'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group"><label className="form-label">NOMBRE *</label><input className="input" placeholder="Ej: Electrico, Construccion..." value={formCategoria.nombre} onChange={e => setFormCategoria(f => ({ ...f, nombre: e.target.value }))}/></div>
              <div className="form-group"><label className="form-label">DESCRIPCION</label><input className="input" placeholder="Descripcion de la categoria" value={formCategoria.descripcion} onChange={e => setFormCategoria(f => ({ ...f, descripcion: e.target.value }))}/></div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">ICONO</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, marginTop: 4 }}>
                    {['📦','🔧','⚡','🏗️','🎨','🧴','🛠️','💡','🔩','🪵','🧱','🪣','🔌','💧','🌿','🍃','📐','🔑'].map(icon => (
                      <div key={icon} onClick={() => setFormCategoria(f => ({ ...f, icono: icon }))}
                        style={{ fontSize: 20, textAlign: 'center', padding: '6px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${formCategoria.icono === icon ? 'var(--accent)' : 'var(--border)'}`, background: formCategoria.icono === icon ? 'var(--glow)' : 'var(--surface2)', transition: 'all 0.12s' }}>
                        {icon}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">COLOR</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 4 }}>
                    {['#00C296','#4A8FE8','#ef4444','#f59e0b','#8b5cf6','#ec4899','#2E6FD4','#6b7280','#10b981','#f97316'].map(color => (
                      <div key={color} onClick={() => setFormCategoria(f => ({ ...f, color }))}
                        style={{ height: 32, borderRadius: 8, background: color, cursor: 'pointer', border: `2.5px solid ${formCategoria.color === color ? '#fff' : 'transparent'}`, boxShadow: formCategoria.color === color ? `0 0 0 2px ${color}` : 'none', transition: 'all 0.12s' }}/>
                    ))}
                  </div>
                  <input type="color" className="input" style={{ marginTop: 6, height: 36, padding: '2px 4px' }} value={formCategoria.color} onChange={e => setFormCategoria(f => ({ ...f, color: e.target.value }))}/>
                </div>
              </div>
              {/* Preview */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: formCategoria.color + '12', border: `1.5px solid ${formCategoria.color}30`, borderRadius: 12 }}>
                <div style={{ fontSize: 28, width: 44, height: 44, borderRadius: 10, background: formCategoria.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${formCategoria.color}30` }}>{formCategoria.icono}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{formCategoria.nombre || 'Nombre de categoria'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{formCategoria.descripcion || 'Descripcion...'}</div>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalCategoria(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarCategoria} disabled={guardando || !formCategoria.nombre}>{guardando ? '⏳...' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BODEGA */}
      {modalBodega && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-title">{editandoBodega?'✏️ Editar Bodega':'🏭 Nueva Bodega'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group"><label className="form-label">NOMBRE *</label><input className="input" placeholder="Bodega Principal" value={formBodega.nombre} onChange={e=>setFormBodega(f=>({...f,nombre:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">DESCRIPCION</label><input className="input" placeholder="Descripcion..." value={formBodega.descripcion} onChange={e=>setFormBodega(f=>({...f,descripcion:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">RESPONSABLE</label><input className="input" placeholder="Nombre del responsable" value={formBodega.responsable} onChange={e=>setFormBodega(f=>({...f,responsable:e.target.value}))}/></div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={()=>setModalBodega(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarBodega} disabled={guardando||!formBodega.nombre}>{guardando?'⏳...':'💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SUCURSAL */}
      {modalSucursal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-title">{editandoSucursal?'✏️ Editar Sucursal':'🏪 Nueva Sucursal'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group"><label className="form-label">NOMBRE *</label><input className="input" placeholder="Sucursal Centro" value={formSucursal.nombre} onChange={e=>setFormSucursal(f=>({...f,nombre:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">DIRECCION</label><input className="input" placeholder="Direccion..." value={formSucursal.direccion} onChange={e=>setFormSucursal(f=>({...f,direccion:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">TELEFONO</label><input className="input" placeholder="7000-0000" value={formSucursal.telefono} onChange={e=>setFormSucursal(f=>({...f,telefono:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">RESPONSABLE</label><input className="input" placeholder="Nombre del encargado" value={formSucursal.responsable} onChange={e=>setFormSucursal(f=>({...f,responsable:e.target.value}))}/></div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={()=>setModalSucursal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarSucursal} disabled={guardando||!formSucursal.nombre}>{guardando?'⏳...':'💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORTAR */}
      {importModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 680 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-title">📥 Importar desde Excel</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>📄 {importData.length} filas</span>
              <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>✅ {totalOk} validas</span>
              {totalErr > 0 && <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>❌ {totalErr} errores</span>}
            </div>
            <div className="import-preview">
              <table>
                <thead><tr><th style={{ padding: '8px 12px', fontSize: 10 }}>FILA</th><th style={{ padding: '8px 12px', fontSize: 10 }}>CODIGO</th><th style={{ padding: '8px 12px', fontSize: 10 }}>NOMBRE</th><th style={{ padding: '8px 12px', fontSize: 10 }}>PRECIO</th><th style={{ padding: '8px 12px', fontSize: 10 }}>STOCK</th><th style={{ padding: '8px 12px', fontSize: 10 }}>PRESENT.</th><th style={{ padding: '8px 12px', fontSize: 10 }}>ESTADO</th></tr></thead>
                <tbody>
                  {importData.map((row,i)=>(
                    <tr key={i} className={row._ok?'import-row-ok':'import-row-err'}>
                      <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--muted)' }}>{row._fila}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)' }}>{row.codigo}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12 }}>{row.nombre}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)' }}>${row.precio?.toFixed(2)}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12, fontFamily: 'var(--mono)' }}>{row.stock}</td>
                      <td style={{ padding: '7px 12px', fontSize: 11 }}>{(row.unidadesAdicionales||[]).length > 0 ? (row.unidadesAdicionales||[]).map((u,j)=><span key={j} className="prod-tag" style={{ marginRight: 4 }}>📦 {u.nombre}×{u.factor}</span>) : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                      <td style={{ padding: '7px 12px', fontSize: 11 }}>{row._ok?<span style={{ color: 'var(--accent)', fontWeight: 600 }}>✅ OK</span>:<span style={{ color: 'var(--danger)', fontWeight: 600 }}>❌ {row._errores.join(', ')}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={()=>{setImportModalOpen(false);setImportData([])}}>Cancelar</button>
              <button className="btn btn-primary" onClick={importarProductos} disabled={totalOk===0||importando}>{importando?'⏳ Importando...':`📥 Importar ${totalOk} productos`}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}