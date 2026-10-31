import { useState, useEffect, useRef } from 'react'
import { lotesPorVencer, lotesDe, diasPara } from '../utils/lotes'
import { db } from '../firebase'
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, writeBatch, runTransaction, query, where, orderBy, getDocs, limit
} from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { Link } from 'react-router-dom'
import { usePermisos } from '../PermisosContext'
import { generarCodigoBarras, generarHTMLEtiquetas, barrasDataURL } from '../utils/etiquetas'
import { generarHTMLEtiquetaJoyeria, generarHTMLPruebaJoyeria, descargarPdfEtiquetas } from '../utils/etiquetaJoyeria'
import { generarZplJoyeria, imprimirZpl, leerAjustesZebra, guardarAjustesZebra, cabeCode128, AJUSTES_ZEBRA_DEFECTO, MENSAJE_INSTALAR_BROWSER_PRINT } from '../utils/zebra'
import { orionAlert, orionConfirm } from '../orionDialog'
import { crearIframeImpresion, imprimirIframeConTitulo } from '../utils/html'
import { sucursalActivaId, SIN_ASIGNAR, TRANSITO, stockEn, sinAsignar, enTransito } from '../utils/sucursal'

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
  // Onza: unidad BASE para lo que se vende por pedazo y se pesa (queso, embutido).
  // La libra y la media libra se arman como unidades adicionales (factor 16 y 8),
  // porque el punto de venta no acepta cantidades con decimales: "media libra"
  // tiene que existir como presentación, no como 0.5.
  { nombre: 'Onza',       factor: 0.0283, grupo: 'Peso' },
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

// "precioConIva" es opcional: si viene con valor y "precio" (sin IVA) va vacío, se guarda precioConIva / 1.13.
// Sirve para que el dueño llene precios de venta al público sin calcular el IVA.
const COLUMNAS_EXCEL = ['codigo','nombre','categoria','precio','precioConIva','precioMayoreo','stock','min','unidad','fraccion','proveedor','codigoBarras','ubicacion','descuento','fechaVencimiento','pres1_nombre','pres1_factor','pres1_precio','pres1_codigoBarras','pres2_nombre','pres2_factor','pres2_precio','pres2_codigoBarras','presAlVender']

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

  /* ── Barra de secciones: una sola tira segmentada (en teléfono se desliza horizontal) ── */
  /* ══ FRANJA DE ESTADO — los números del inventario, con la identidad de ORIÓN ══ */
  .inv-franja { display: flex; align-items: stretch; background: #14213D; border-radius: 14px; overflow: hidden;
    margin-bottom: 14px; box-shadow: 0 10px 26px -18px rgba(20,33,61,.9); }
  .dark-mode .inv-franja { background: #0b1220; border: 1px solid var(--border); }
  .inv-fr { flex: 1 1 0; min-width: 0; padding: 13px 20px; }
  /* División marcada entre áreas: línea clara + sombra del lado oscuro */
  .inv-fr + .inv-fr { border-left: 2px solid rgba(255,255,255,.30); box-shadow: inset 2px 0 0 rgba(0,0,0,.35); }
  .inv-fr-et { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,.58); font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .inv-fr-val { font-family: var(--mono); font-size: 25px; font-weight: 800; color: #fff; line-height: 1.15; margin-top: 3px; }
  .inv-fr-val.oro { color: var(--accent3); }
  .inv-fr-val.alerta { color: #FF9C6E; }
  .inv-fr-sub { font-size: 11px; color: rgba(255,255,255,.55); margin-top: 1px; }
  .inv-fr-fila { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
  .inv-fr-fila .inv-fr-sub { margin-top: 0; }
  @media (max-width: 900px) {
    /* En el teléfono la franja se vuelve cuadrícula de 2, con línea entre todas las áreas */
    .inv-franja { display: grid; grid-template-columns: 1fr 1fr; }
    .inv-fr { padding: 11px 14px; border-top: 1.5px solid rgba(255,255,255,.20); }
    .inv-fr + .inv-fr { border-left: 0; box-shadow: none; }
    .inv-fr:nth-child(odd) { border-right: 1.5px solid rgba(255,255,255,.20); }
    .inv-fr:nth-child(1), .inv-fr:nth-child(2) { border-top: 0; }
    .inv-fr:nth-child(5) { grid-column: 1 / -1; border-right: 0; }
    .inv-fr-val { font-size: 21px; }
  }

  .inv-suc-chip { display: inline-flex; align-items: center; gap: 8px; background: var(--surface); border: 1.5px solid var(--border2); border-radius: 10px; padding: 6px 12px; }
  .inv-suc-chip small { display: block; font-size: 9.5px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); font-weight: 800; }
  .inv-suc-chip b { display: block; font-size: 13px; font-weight: 700; }

  /* ══ BARRA DE SECCIONES (segmentada, como la maqueta) ══ */
  .inv-secs { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .inv-seg { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: 11px; padding: 3px; gap: 2px; flex-shrink: 0; overflow-x: auto; scrollbar-width: none; }
  .inv-seg::-webkit-scrollbar { display: none; }
  .inv-seg button { font: inherit; font-size: 13px; font-weight: 600; color: var(--text2); background: transparent; border: none; border-radius: 8px; padding: 8px 15px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 7px; transition: background .15s, color .15s; }
  .inv-seg button:hover { background: var(--surface2); color: var(--text); }
  .inv-seg button.activa { background: #14213D; color: #fff; font-weight: 700; }
  .dark-mode .inv-seg button.activa { background: var(--accent); }
  .inv-seg .num { font-family: var(--mono); font-size: 11px; font-weight: 700; background: rgba(239,68,68,.15); color: #dc2626; border-radius: 99px; padding: 1px 7px; }
  .inv-seg button.activa .num { background: rgba(255,255,255,.2); color: #fff; }
  .inv-buscador { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 11px; padding: 0 14px; height: 44px; }
  .sr-solo { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .inv-buscador input { font: inherit; font-size: 13.5px; color: var(--text); border: none; outline: none; background: transparent; width: 100%; }
  @media (max-width: 900px) { .inv-secs { flex-direction: column; align-items: stretch; } .inv-seg { overflow-x: auto; } }

  /* ══ ACCIONES DEL ENCABEZADO ══ */
  .inv-acc { display: inline-flex; align-items: center; gap: 9px; flex-wrap: wrap; }
  .inv-btn-linea { font: inherit; font-size: 13.5px; font-weight: 700; color: var(--text); background: var(--surface); border: 1.5px solid var(--border2); border-radius: 10px; padding: 10px 16px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 7px; }
  .inv-btn-linea:hover { border-color: var(--accent); color: var(--accent); }
  .inv-btn-oro { font: inherit; font-size: 13.5px; font-weight: 800; color: #1a1204; background: var(--accent3); border: none; border-radius: 10px; padding: 11px 19px; cursor: pointer; }
  .inv-btn-oro:hover { filter: brightness(1.07); }

  /* ══ ESTADO VACÍO — las tres formas de cargar el catálogo ══ */
  .inv-vacio { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 46px 40px; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .inv-vacio h3 { font-size: 21px; font-weight: 800; margin: 14px 0 6px; }
  .inv-vacio p { font-size: 14px; color: var(--text2); max-width: 520px; line-height: 1.5; }
  .inv-vacio-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; margin-top: 30px; width: 100%; max-width: 900px; text-align: left; }
  @media (max-width: 820px) { .inv-vacio-grid { grid-template-columns: 1fr; } }
  .inv-vacio-card { border: 1px solid var(--border); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 8px; }
  .inv-vacio-card.destacada { border: 1.5px solid #14213D; }
  .dark-mode .inv-vacio-card.destacada { border-color: var(--accent); }
  .inv-vacio-card h4 { font-size: 15px; font-weight: 800; display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
  .inv-vacio-card p { font-size: 12.5px; color: var(--text2); line-height: 1.5; max-width: none; }
  .inv-vacio-tag { font-size: 10px; font-weight: 800; letter-spacing: .6px; color: #1a1204; background: var(--accent3); border-radius: 99px; padding: 3px 8px; }
  .inv-vacio-btns { margin-top: auto; padding-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; }
  .inv-vacio-btn { font: inherit; font-size: 12.5px; font-weight: 700; color: #fff; background: #14213D; border: none; border-radius: 9px; padding: 9px 14px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
  .dark-mode .inv-vacio-btn { background: var(--accent); }
  .inv-vacio-btn.linea { color: var(--text); background: var(--surface); border: 1.5px solid var(--border2); }
  .inv-vacio-pie { font-size: 12.5px; color: var(--muted); margin-top: 24px; }

  .inv-pills { display: flex; align-items: center; gap: 2px; margin-bottom: 18px; padding: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; flex-wrap: wrap; }
  @media (max-width: 768px) { .inv-pills { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; } }
  .inv-pills::-webkit-scrollbar { display: none; }
  .inv-pill {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 8px 12px; border-radius: 9px; cursor: pointer;
    background: transparent; border: none; white-space: nowrap; flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
  }
  .inv-pill:hover { background: var(--surface2); }
  .inv-pill.activa { background: color-mix(in srgb, var(--ic-color, var(--accent)) 14%, transparent); }
  .inv-pill-icon { width: 17px; height: 17px; color: var(--ic-color, var(--accent)); display: flex; }
  .inv-pill-icon svg { width: 100%; height: 100%; }
  .inv-pill-label { font-size: 13px; font-weight: 600; color: var(--text2); }
  .inv-pill.activa .inv-pill-label { color: var(--ic-color, var(--accent)); font-weight: 700; }
  .inv-pill-num { font-size: 11px; font-weight: 700; color: var(--muted); background: var(--surface3); padding: 1px 7px; border-radius: 999px; min-width: 22px; text-align: center; }
  .inv-pill.activa .inv-pill-num { color: #fff; background: var(--ic-color, var(--accent)); }
  /* Inicio: separado con una línea, sin fondo */
  .inv-pill-home { padding: 8px 10px; color: var(--accent); border-right: 1px solid var(--border); border-radius: 9px 0 0 9px; margin-right: 4px; }
  .inv-pill-home:hover { background: var(--surface2); color: var(--accent); }
  .inv-pill-home svg { width: 17px; height: 17px; flex-shrink: 0; }
  @media (max-width: 768px) { .inv-pill { padding: 8px 10px; } .inv-pill-label { font-size: 12px; } }
  .inv-card-badge { position: absolute; top: 14px; right: 14px; background: var(--ic-color, var(--accent)); color: #fff; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 99px; }
  .inv-back { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; margin-bottom: 20px; padding: 8px 14px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--surface2); transition: all 0.15s; }
  .inv-back:hover { color: var(--accent); border-color: var(--accent); }
  .inv-toolbar { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; align-items: center; }
  /* Inventario por sucursal: pestañas de existencias y aviso de "sin asignar" */
  .inv-suc-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .inv-suc-tabs button { font: inherit; font-size: 12.5px; font-weight: 700; padding: 7px 13px; border-radius: 999px; border: 1.5px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; }
  .inv-suc-tabs button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
  .inv-banner-suc { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; background: rgba(245,158,11,0.08); border: 1.5px solid rgba(245,158,11,0.35); border-radius: 12px; padding: 12px 16px; margin-bottom: 14px; font-size: 13px; }
  /* Traslados: resumen, tarjetas, modal y línea de tiempo */
  .tras-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
  @media (max-width: 640px) { .tras-kpis { grid-template-columns: 1fr 1fr; } }
  .tras-kpi { background: var(--surface); border: 1.5px solid var(--border); border-radius: 12px; padding: 10px 14px; display: flex; align-items: baseline; gap: 8px; }
  .tras-kpi b { font-family: var(--mono); font-size: 20px; } .tras-kpi span { font-size: 10.5px; color: var(--muted); font-weight: 800; letter-spacing: .8px; text-transform: uppercase; }
  .tras-lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
  .tras-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 12px; padding: 0; cursor: pointer; display: flex; flex-direction: column; overflow: hidden; transition: transform .12s, box-shadow .12s, border-color .12s; }
  .tras-card-body { padding: 12px 16px 14px; display: flex; flex-direction: column; gap: 8px; }
  .tras-card:hover { transform: translateY(-2px); box-shadow: 0 8px 22px var(--shadow); border-color: var(--accent); }
  .tras-card.estado-cancelado { opacity: .75; }
  .tras-card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 9px 16px; background: var(--surface2); border-bottom: 1px solid var(--border); }
  .tras-num { font-family: var(--mono); font-weight: 800; font-size: 15px; }
  .tras-ruta { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; flex-wrap: wrap; }
  .tras-ruta svg { color: var(--muted); flex: none; }
  .tras-meta { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
  .tras-acciones { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
  .tras-modal { max-width: 760px; width: calc(100% - 24px); }
  .tras-ruta-grande { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; }
  @media (max-width: 560px) { .tras-ruta-grande { grid-template-columns: 1fr; } .tras-ruta-grande svg { transform: rotate(90deg); justify-self: center; } }
  .tras-ruta-caja { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 12px; padding: 10px 12px; min-width: 0; }
  .tras-ruta-caja small { display: block; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); font-weight: 800; margin-bottom: 3px; }
  .tras-ruta-caja b { font-size: 15px; } .tras-ruta-caja .input { margin-top: 2px; }
  .tras-resultados { border: 1.5px solid var(--border); border-radius: 12px; margin-top: 6px; max-height: 230px; overflow: auto; background: var(--surface); }
  .tras-res { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 9px 12px; cursor: pointer; border-bottom: 1px solid var(--border); }
  .tras-res:last-child { border-bottom: 0; } .tras-res:hover { background: var(--surface2); } .tras-res.sin { opacity: .5; cursor: not-allowed; }
  .tras-res-nom { font-weight: 600; font-size: 13.5px; }
  .tras-res-stock { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: 11.5px; color: var(--muted); white-space: nowrap; }
  .tras-vacio { border: 1.5px dashed var(--border); border-radius: 12px; padding: 18px; text-align: center; color: var(--muted); font-size: 13px; margin-bottom: 10px; }
  .tras-tabla th { font-size: 10.5px; } .tras-tabla tr.excede td { background: rgba(239,68,68,0.06); }
  .tras-qty { display: inline-flex; align-items: center; border: 1.5px solid var(--border); border-radius: 10px; overflow: hidden; }
  .tras-qty button { width: 32px; height: 34px; border: none; background: var(--surface2); font-size: 18px; cursor: pointer; color: var(--text); }
  .tras-qty input { width: 70px; height: 34px; border: none; text-align: center; font-family: var(--mono); font-weight: 700; font-size: 14px; background: var(--surface); color: var(--text); }
  .tras-rec-input { width: 90px; text-align: right; font-family: var(--mono); font-weight: 700; padding: 6px 8px; margin-left: auto; }
  .tras-resumen { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 13px; background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 14px; margin: 4px 0 10px; }
  .tras-det-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
  .tras-timeline { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; margin-bottom: 14px; position: relative; }
  @media (max-width: 560px) { .tras-timeline { grid-template-columns: 1fr; } }
  .tras-paso { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border-top: 3px solid var(--border); font-size: 12.5px; color: var(--muted); }
  .tras-paso.hecho { border-top-color: #00C296; color: var(--text); } .tras-paso.activo { border-top-color: #f59e0b; } .tras-paso.malo { border-top-color: #ef4444; }
  .tras-paso-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border); margin-top: 5px; flex: none; }
  .tras-paso.hecho .tras-paso-dot { background: #00C296; } .tras-paso.activo .tras-paso-dot { background: #f59e0b; box-shadow: 0 0 0 4px rgba(245,158,11,.2); } .tras-paso.malo .tras-paso-dot { background: #ef4444; }
  .tras-paso b { display: block; font-size: 13px; } .tras-paso small { display: block; font-size: 11.5px; color: var(--muted); }
  .tras-notas { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 8px 12px; font-size: 13px; margin-bottom: 12px; }
  .inv-toolbar .input { max-width: 300px; }
  .stock-ok { color: var(--accent); font-weight: 600; font-family: var(--mono); }
  .stock-low { color: var(--accent3); font-weight: 600; font-family: var(--mono); }
  .stock-critical { color: var(--danger); font-weight: 600; font-family: var(--mono); }
  .action-btns { display: flex; gap: 6px; flex-wrap: nowrap; white-space: nowrap; }
  .action-btns .btn-sm { padding: 8px 11px; font-size: 15px; }
  .btn-sm { padding: 5px 10px; font-size: 11px; }
  .loading { text-align: center; padding: 40px; color: var(--muted); font-size: 14px; }
  .firebase-badge { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,160,0,0.12); color: #ffa000; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 6px; font-family: var(--mono); }
  .toolbar-group { display: flex; gap: 8px; align-items: center; margin-left: auto; flex-wrap: wrap; }
  /* ── Tarjetas de producto (solo teléfono; en PC sigue la tabla) ── */
  .prod-cards { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
  .prod-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; }
  .prod-card-top { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
  .prod-card-nombre { font-weight: 700; font-size: 14px; line-height: 1.25; }
  .prod-card-meta { font-size: 11.5px; color: var(--muted); margin-top: 3px; }
  .prod-card-meta .mono { color: var(--accent2); font-weight: 700; }
  .prod-card-precio { font-family: var(--mono); font-weight: 800; font-size: 17px; white-space: nowrap; text-align: right; }
  .prod-card-precio small { display: block; font-size: 10px; color: var(--muted); font-weight: 600; }
  .prod-card-mid { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 9px; font-size: 12px; }
  .prod-card-stock { font-family: var(--mono); font-weight: 800; font-size: 13px; }
  .prod-card-acciones { display: flex; gap: 6px; margin-top: 10px; }
  .prod-card-acciones .btn { flex: 1; padding: 9px 0; font-size: 15px; }
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
  .prod-row.seleccionada td, .prod-card.seleccionada { background: color-mix(in srgb, #00C296 14%, transparent); }
  .prod-row td input[type=checkbox], .prod-row th input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; }
  .import-preview { max-height: 280px; overflow: auto; margin-top: 14px; border-radius: 10px; border: 1px solid var(--border); }
  .import-preview th { background: var(--surface2); position: sticky; top: 0; }
  .import-row-ok { background: rgba(0,212,170,0.05); }
  .import-row-err { background: rgba(255,77,109,0.07); }
  .kardex-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 20px; }
  @media (max-width: 700px) { .kardex-stats { grid-template-columns: repeat(2,1fr); } }
  .kardex-stat { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 12px; padding: 14px; text-align: center; }
  .kardex-stat-val { font-size: 20px; font-weight: 800; font-family: var(--mono); }
  .kardex-stat-label { font-size: 10px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
  .mov-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; }
  .unidad-adicional-row { display: grid; grid-template-columns: minmax(96px, 1.4fr) minmax(64px, .7fr) minmax(84px, .9fr) minmax(118px, 1.3fr) 36px;
    gap: 8px; align-items: end; background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px;
    padding: 10px 12px; margin-bottom: 8px; }
  .unidad-adicional-row .ua-campo { min-width: 0; }
  .unidad-adicional-row .ua-et { font-size: 10px; color: var(--muted); margin-bottom: 3px; white-space: nowrap; }
  .unidad-adicional-row input { height: 38px; font-size: 14px; width: 100%; padding: 8px 10px; }
  /* Sin las flechitas de los campos numéricos: se comían el espacio del número */
  .unidad-adicional-row input[type=number] { -moz-appearance: textfield; }
  .unidad-adicional-row input[type=number]::-webkit-outer-spin-button,
  .unidad-adicional-row input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .ua-defecto { margin: 4px 0 8px; padding: 10px 12px; border-radius: 10px; background: rgba(200,164,77,0.10); border: 1.5px solid rgba(200,164,77,0.45); }
  @media (max-width: 1150px) {
    .unidad-adicional-row { grid-template-columns: 1fr 1fr 36px; }
    .unidad-adicional-row .ua-campo:first-child { grid-column: 1 / -1; }
    .unidad-adicional-row .ua-campo:nth-child(4) { grid-column: 1 / span 2; }
  }
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

// Con separador de miles y SIEMPRE 2 decimales: $37,905.60 (sin esto el
// inventario de una ferretería se leía "$37905.60").
const fmt = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const emptyForm = {
  codigo: '', nombre: '', precio: '', precioMayoreo: '', stock: '', min: '', unidad: 'Unidad',
  categoria: '', proveedor: '', codigoBarras: '', ubicacion: '', bodega: '',
  descuento: '', fechaVencimiento: '', imagen: '', unidadesAdicionales: [],
  vendeFraccion: false, // se vende por peso o en fracciones (¼ ½ ¾): el POS acepta cantidades con decimales
}

const imprimirIframe = (html) => {
  const iframe = crearIframeImpresion()   /* sandbox sin scripts (utils/html.js) */
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'
  document.body.appendChild(iframe)
  iframe.contentDocument.open()
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus()
      imprimirIframeConTitulo(iframe)
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
  const { puede, empresaId, moduloActivo, soloSuSucursal, sucursalFija, userName, userId } = usePermisos()
  const [vista, setVista] = useState('productos')
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
  // Formato de etiqueta: hoja de 48 mm (impresora normal) o colgante de joyería 56×13 mm (Zebra); se recuerda por equipo
  const [etiquetaFormato, setEtiquetaFormato] = useState(() => { try { return localStorage.getItem('orion_etiqueta_formato') || 'hoja' } catch { return 'hoja' } })
  const [etiquetaTipo, setEtiquetaTipo] = useState(() => { try { return localStorage.getItem('orion_etiqueta_tipo') || 'code128' } catch { return 'code128' } })
  const [zebraAjustes, setZebraAjustes] = useState(leerAjustesZebra)   // corrimientos de la Zebra de ESTE equipo
  const [zebraAjustar, setZebraAjustar] = useState(false)
  const [zebraOcupado, setZebraOcupado] = useState(false)
  const [seleccion, setSeleccion] = useState(() => new Set())  // productos marcados en la lista para etiquetas en lote
  const [loteModal, setLoteModal] = useState(null)             // [{ p, cod, copias }]
  const [etiquetaPrevJoy, setEtiquetaPrevJoy] = useState('')
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

  // Nombres de producto en MAYÚSCULAS: opción por empresa (Configuración → Productos). Default: sí.
  const [mayusculas, setMayusculas] = useState(true)
  // Días de aviso de vencimiento (Configuración → Inventario). 0 = sin aviso.
  const [diasAvisoVenc, setDiasAvisoVenc] = useState(15)
  const [nombreEmpresa, setNombreEmpresa] = useState('') // encabezado del comprobante de traslado
  const [verOtrasSuc, setVerOtrasSuc] = useState(false) // Configuración: ver existencias de otras sucursales
  const [otrasModal, setOtrasModal] = useState(null)
  useEffect(() => {
    if (!empresaId) return
    return onSnapshot(doc(db, 'configuracion', empresaId), s => {
      setMayusculas(s.data()?.productosMayusculas !== false)
      setDiasAvisoVenc(s.data()?.diasAvisoVencimiento === undefined ? 15 : (parseInt(s.data().diasAvisoVencimiento) || 0))
      setNombreEmpresa(s.data()?.nombreComercial || s.data()?.empresaNombre || '')
      setVerOtrasSuc(s.data()?.verStockOtrasSucursales === true)
    }, () => {})
  }, [empresaId])
  const normNombre = (s) => { const t = String(s || '').trim(); return mayusculas ? t.toUpperCase() : t }

  // ── INVENTARIO POR SUCURSAL (módulo por empresa, Panel One Geo) ──
  // Ver utils/sucursal.js: `stock` sigue siendo el total; `stockPorSucursal` reparte por local.
  const porSucursal = moduloActivo('inventario_sucursal') && sucursales.length > 0
  const [sucVista, setSucVista] = useState(() => sucursalActivaId() || '')   // '' = todas, id, o SIN_ASIGNAR
  // Encargada de sucursal: todo queda fijo en SU sucursal (sin "Todas", sin asignar ni traslados desde otra)
  const sucPropia = soloSuSucursal ? (sucursalFija || sucursalActivaId()) : ''
  useEffect(() => { if (sucPropia) setSucVista(sucPropia) }, [sucPropia])
  const [sucAsignar, setSucAsignar] = useState('')                             // destino del botón "asignar todo"
  const [asignando, setAsignando] = useState(false)
  const nombreSuc = (id) => id === SIN_ASIGNAR || !id ? 'Sin asignar' : (sucursales.find(s => s.id === id)?.nombre || '—')
  const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000
  // Lo que se muestra como existencia según la pestaña elegida (total si el módulo está apagado)
  const stockMostrar = (p) => porSucursal && sucVista ? stockEn(p, sucVista) : r3(p.stock)
  // Encargada de sucursal: valoración, totales y kardex SOLO de su tienda (el resto del inventario no es suyo)
  const stockPropio = (p) => (porSucursal && sucPropia) ? stockEn(p, sucPropia) : r3(p.stock)
  const kardexVisible = sucPropia ? kardex.filter(k => k.sucursalId === sucPropia || k.sucursalOrigen === sucPropia || k.sucursalDestino === sucPropia) : kardex
  const desglose = (p) => {
    if (!porSucursal) return ''
    if (sucVista) return `total ${r3(p.stock)}`
    const partes = sucursales.filter(s => stockEn(p, s.id) !== 0).map(s => `${s.nombre}: ${stockEn(p, s.id)}`)
    const libre = sinAsignar(p); if (libre !== 0) partes.push(`sin asignar: ${libre}`)
    const tr = enTransito(p); if (tr !== 0) partes.push(`en tránsito: ${tr}`)
    return partes.join(' · ')
  }

  // ── TRASLADOS CON CONFIRMACIÓN DE RECIBO ──
  // Salen de la sucursal origen a la cubeta TRANSITO; entran al destino cuando este confirma.
  const [traslados, setTraslados] = useState([])
  const [trasModal, setTrasModal] = useState(false)
  const [trasForm, setTrasForm] = useState({ destino: '', notas: '', items: [], busq: '' })
  const [trasGuardando, setTrasGuardando] = useState(false)
  useEffect(() => {
    if (!empresaId || !porSucursal) return
    return onSnapshot(query(collection(db, 'traslados'), where('empresaId', '==', empresaId)), snap => {
      // Encargada de sucursal: solo los traslados que salen de SU tienda o llegan a ella (los demás no son suyos)
      setTraslados(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t.tipo !== 'contador' && (!sucPropia || t.origenId === sucPropia || t.destinoId === sucPropia))
        .sort((a, b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0)))
    }, () => {})
  }, [empresaId, porSucursal, sucPropia])
  const trasOrigen = sucPropia || sucursalActivaId() || sucursales[0]?.id || ''
  const trasPendientes = traslados.filter(t => t.estado === 'enviado' && (!sucPropia || t.destinoId === sucPropia))
  const puedeRecibir = (t) => puede('registrar_movimientos') && (!sucPropia || t.destinoId === sucPropia)
  const puedeCancelar = (t) => puede('registrar_movimientos') && (!sucPropia || t.origenId === sucPropia)
  const agregarLineaTraslado = (p) => setTrasForm(f => f.items.some(i => i.productoId === p.id) ? { ...f, busq: '' } : { ...f, busq: '', items: [...f.items, { productoId: p.id, nombre: p.nombre, cantidad: 1 }] })
  const kardexTras = (s, pd, cant, sentido, sucursalId, antes, despues, motivo, numero, origen, destino) => ({
    productoId: s.id, productoCodigo: pd.codigo || '', productoNombre: pd.nombre || '', tipo: 'traslado', sentido, cantidad: cant,
    unidad: pd.unidad || 'Unidad', presentacion: '', stockAntes: antes, stockDespues: despues, stockTotal: r3(pd.stock),
    motivo, referencia: numero, sucursalId, sucursalOrigen: origen, sucursalDestino: destino, empresaId, fecha: serverTimestamp(),
  })

  const crearTraslado = async () => {
    const origen = trasOrigen, destino = trasForm.destino
    if (!origen || !destino || origen === destino) { orionAlert('Elegí la sucursal destino (distinta a la de origen).', { tipo: 'warning' }); return }
    const items = trasForm.items.map(i => ({ ...i, cantidad: r3(i.cantidad) })).filter(i => i.cantidad > 0)
    if (!items.length) { orionAlert('Agregá al menos un producto con cantidad.', { tipo: 'warning' }); return }
    setTrasGuardando(true)
    try {
      let numero = ''
      await runTransaction(db, async (tx) => {
        const contRef = doc(db, 'traslados', `_contador_${empresaId}`)
        const contSnap = await tx.get(contRef)
        const refs = items.map(i => doc(db, 'productos', i.productoId))
        const snaps = []
        for (const r of refs) snaps.push(await tx.get(r))
        const n = (contSnap.exists() ? (Number(contSnap.data().valor) || 0) : 0) + 1
        numero = 'TR-' + String(n).padStart(5, '0')
        const lineas = []
        snaps.forEach((s, idx) => {
          if (!s.exists()) throw new Error('Producto no encontrado: ' + items[idx].nombre)
          const pd = s.data(), cant = items[idx].cantidad
          const mapa = { ...(pd.stockPorSucursal || {}) }
          const antes = r3(mapa[origen])
          if (cant > antes) throw new Error(`Stock insuficiente de "${pd.nombre}" en ${nombreSuc(origen)}: ${antes} ${pd.unidad || ''}`)
          mapa[origen] = r3(antes - cant)
          mapa[TRANSITO] = r3((Number(mapa[TRANSITO]) || 0) + cant)
          tx.update(refs[idx], { stockPorSucursal: mapa, updatedAt: serverTimestamp() })
          tx.set(doc(collection(db, 'kardex')), kardexTras(s, pd, cant, 'salida', origen, antes, r3(antes - cant), `Traslado ${numero} a ${nombreSuc(destino)} (en tránsito)`, numero, origen, destino))
          lineas.push({ productoId: s.id, codigo: pd.codigo || '', nombre: pd.nombre || '', unidad: pd.unidad || 'Unidad', cantidad: cant })
        })
        tx.set(contRef, { empresaId, tipo: 'contador', valor: n }, { merge: true })
        tx.set(doc(collection(db, 'traslados')), { empresaId, numero, origenId: origen, destinoId: destino, origenNombre: nombreSuc(origen), destinoNombre: nombreSuc(destino), estado: 'enviado', items: lineas, notas: trasForm.notas.trim(), creadoPor: userName || '', creadoPorId: userId || '', creadoEn: serverTimestamp() })
      })
      setTrasModal(false); setTrasForm({ destino: '', notas: '', items: [], busq: '' })
      orionAlert(`Traslado ${numero} enviado. Queda "en tránsito" hasta que ${nombreSuc(destino)} confirme el recibo.`, { tipo: 'success' })
    } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
    setTrasGuardando(false)
  }

  // Recibir (entra al destino, con recibo parcial) o cancelar (regresa al origen). Ambos vacían TRANSITO.
  // `recibidas` = { productoId: cantidad } al recibir; lo que falte respecto a lo enviado se registra como
  // FALTANTE en el destino (sale del total) para que quede rastro y la dueña lo investigue.
  const cerrarTraslado = async (t, accion, recibidas = null) => {
    const recibir = accion === 'recibir'
    const items = t.items || []
    const recDe = (i) => {
      const env = r3(i.cantidad)
      if (!recibir) return env
      const v = recibidas && recibidas[i.productoId] !== undefined && recibidas[i.productoId] !== '' ? r3(recibidas[i.productoId]) : env
      return Math.min(env, Math.max(0, v))
    }
    const faltanteTotal = recibir ? r3(items.reduce((s, i) => s + (r3(i.cantidad) - recDe(i)), 0)) : 0
    const msg = recibir
      ? (faltanteTotal > 0
          ? `Vas a confirmar el recibo del traslado ${t.numero} en ${t.destinoNombre} con ${faltanteTotal} unidad(es) menos de las enviadas. El faltante queda registrado en el kardex de ${t.destinoNombre}. ¿Continuar?`
          : `¿Confirmar el recibo completo del traslado ${t.numero} en ${t.destinoNombre}? Sus ${items.length} línea(s) entran al inventario de esa sucursal.`)
      : `¿Cancelar el traslado ${t.numero}? La mercadería regresa a ${t.origenNombre}.`
    if (!(await orionConfirm(msg, { tipo: 'warning', okLabel: recibir ? 'Confirmar' : 'Cancelar traslado' }))) return
    setTrasGuardando(true)
    try {
      await runTransaction(db, async (tx) => {
        const tRef = doc(db, 'traslados', t.id)
        const tSnap = await tx.get(tRef)
        if (!tSnap.exists() || tSnap.data().estado !== 'enviado') throw new Error('Este traslado ya fue recibido o cancelado')
        const refs = items.map(i => doc(db, 'productos', i.productoId))
        const snaps = []
        for (const r of refs) snaps.push(await tx.get(r))
        const haciaId = recibir ? t.destinoId : t.origenId
        const lineas = []
        snaps.forEach((s, idx) => {
          const it = items[idx]
          const env = r3(it.cantidad), rec = recDe(it), falt = r3(env - rec)
          lineas.push({ ...it, recibida: recibir ? rec : undefined, faltante: recibir ? falt : undefined })
          if (!s.exists()) return
          const pd = s.data()
          const mapa = { ...(pd.stockPorSucursal || {}) }
          const antes = r3(mapa[haciaId])
          mapa[TRANSITO] = r3((Number(mapa[TRANSITO]) || 0) - env)
          mapa[haciaId] = r3(antes + rec)
          const nuevoTotal = r3((Number(pd.stock) || 0) - falt)
          tx.update(refs[idx], { stockPorSucursal: mapa, ...(falt > 0 ? { stock: nuevoTotal } : {}), updatedAt: serverTimestamp() })
          if (rec > 0) tx.set(doc(collection(db, 'kardex')), kardexTras(s, pd, rec, 'entrada', haciaId, antes, r3(antes + rec),
            recibir ? `Traslado ${t.numero} recibido de ${t.origenNombre}` : `Traslado ${t.numero} cancelado (regresa a ${t.origenNombre})`, t.numero, t.origenId, t.destinoId))
          if (falt > 0) tx.set(doc(collection(db, 'kardex')), { productoId: s.id, productoCodigo: pd.codigo || '', productoNombre: pd.nombre || '', tipo: 'salida', cantidad: falt, unidad: pd.unidad || 'Unidad', presentacion: '',
            stockAntes: r3(antes + rec + falt), stockDespues: r3(antes + rec), stockTotal: nuevoTotal, motivo: `Faltante en traslado ${t.numero} (enviadas ${env}, recibidas ${rec})`, referencia: t.numero,
            sucursalId: haciaId, sucursalOrigen: t.origenId, sucursalDestino: t.destinoId, empresaId, fecha: serverTimestamp() })
        })
        tx.update(tRef, recibir
          ? { estado: 'recibido', items: lineas.map(l => ({ productoId: l.productoId, codigo: l.codigo || '', nombre: l.nombre || '', unidad: l.unidad || 'Unidad', cantidad: l.cantidad, recibida: l.recibida, faltante: l.faltante })), conDiferencias: faltanteTotal > 0, faltanteTotal, recibidoPor: userName || '', recibidoPorId: userId || '', recibidoEn: serverTimestamp() }
          : { estado: 'cancelado', canceladoPor: userName || '', canceladoPorId: userId || '', canceladoEn: serverTimestamp() })
      })
      setTrasDetalle(null); setTrasRecibiendo(false)
    } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
    setTrasGuardando(false)
  }

  // ── Lista, detalle y comprobante ──
  const [trasFiltro, setTrasFiltro] = useState('todos')
  const [trasBusq, setTrasBusq] = useState('')
  const [trasDetalle, setTrasDetalle] = useState(null)
  const [trasRecibiendo, setTrasRecibiendo] = useState(false)
  const [trasRecibidas, setTrasRecibidas] = useState({})
  const etiquetaEstadoTras = (t) => t.estado === 'enviado' ? 'En tránsito' : t.estado === 'cancelado' ? 'Cancelado' : (t.conDiferencias ? 'Recibido con diferencias' : 'Recibido')
  const fechaCorta = (f) => f?.toDate?.() ? f.toDate().toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' }) : ''
  const fechaLarga = (f) => f?.toDate?.() ? f.toDate().toLocaleString('es-SV', { dateStyle: 'medium', timeStyle: 'short' }) : ''
  const trasladosFiltrados = traslados.filter(t => (trasFiltro === 'todos' || t.estado === trasFiltro) && (!trasBusq.trim() || [t.numero, t.origenNombre, t.destinoNombre, t.creadoPor, ...(t.items || []).map(i => i.nombre)].join(' ').toLowerCase().includes(trasBusq.trim().toLowerCase())))
  const abrirDetalleTraslado = (t, recibir = false) => { setTrasDetalle(t); if (recibir && t.estado === 'enviado' && puedeRecibir(t)) iniciarRecibo(t); else setTrasRecibiendo(false) }
  const iniciarRecibo = (t) => { setTrasRecibidas(Object.fromEntries((t.items || []).map(i => [i.productoId, i.cantidad]))); setTrasRecibiendo(true) }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const imprimirComprobanteTraslado = (t) => {
    const items = t.items || []
    const total = r3(items.reduce((s, i) => s + (Number(i.cantidad) || 0), 0))
    const filas = items.map((i, n) => `<tr><td>${n + 1}</td><td class="mono">${esc(i.codigo)}</td><td>${esc(i.nombre)}</td><td class="num">${esc(i.cantidad)} ${esc(i.unidad)}</td><td class="num">${t.estado === 'recibido' ? esc(i.recibida ?? i.cantidad) : ''}</td></tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Traslado ${esc(t.numero)}</title><style>
      @page { size: letter; margin: 16mm } body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; margin: 0 }
      h1 { font-size: 20px; margin: 0 } .enc { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0c2240; padding-bottom: 10px; margin-bottom: 14px }
      .emp { font-size: 15px; font-weight: 700 } .sub { color: #555; font-size: 11px } .num { text-align: right; font-variant-numeric: tabular-nums } .mono { font-family: Consolas, monospace; font-size: 11px }
      .ruta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px } .caja { border: 1px solid #bbb; border-radius: 6px; padding: 8px 10px } .caja small { display: block; color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 1px } .caja b { font-size: 14px }
      table { width: 100%; border-collapse: collapse; margin-bottom: 14px } th, td { border-bottom: 1px solid #ccc; padding: 6px 6px; text-align: left; vertical-align: top } th { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #444; background: #f3f3f3 }
      tfoot td { font-weight: 700; border-top: 2px solid #0c2240 } .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px } .firma { border-top: 1px solid #333; padding-top: 6px; font-size: 11px; text-align: center } .firma small { display: block; color: #666 }
      .notas { border: 1px dashed #999; border-radius: 6px; padding: 8px 10px; margin-bottom: 14px; min-height: 28px } .estado { display: inline-block; border: 1px solid #0c2240; border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 700 }
    </style></head><body>
      <div class="enc"><div><div class="emp">${esc(nombreEmpresa || 'ORIÓN')}</div><div class="sub">Comprobante de traslado entre sucursales</div></div><div style="text-align:right"><h1>${esc(t.numero)}</h1><div class="sub">${esc(fechaLarga(t.creadoEn))}</div><div class="estado">${esc(etiquetaEstadoTras(t))}</div></div></div>
      <div class="ruta"><div class="caja"><small>Sale de</small><b>${esc(t.origenNombre)}</b><div class="sub">Envía: ${esc(t.creadoPor || '')}</div></div><div class="caja"><small>Llega a</small><b>${esc(t.destinoNombre)}</b><div class="sub">${t.estado === 'recibido' ? 'Recibió: ' + esc(t.recibidoPor || '') + ' · ' + esc(fechaLarga(t.recibidoEn)) : 'Pendiente de confirmar el recibo'}</div></div></div>
      <table><thead><tr><th>#</th><th>Código</th><th>Producto</th><th class="num">Enviado</th><th class="num">Recibido</th></tr></thead><tbody>${filas}</tbody><tfoot><tr><td colspan="3">${items.length} producto(s)</td><td class="num">${total}</td><td class="num">${t.estado === 'recibido' ? r3(items.reduce((s, i) => s + (Number(i.recibida ?? i.cantidad) || 0), 0)) : ''}</td></tr></tfoot></table>
      <div class="notas"><small style="color:#666;text-transform:uppercase;font-size:10px;letter-spacing:1px">Notas</small><div>${esc(t.notas || '')}</div></div>
      <div class="firmas"><div class="firma">${esc(t.creadoPor || '')}<small>Entrega · ${esc(t.origenNombre)}</small></div><div class="firma">${esc(t.recibidoPor || '')}&nbsp;<small>Recibe · ${esc(t.destinoNombre)} · fecha y hora</small></div></div>
    </body></html>`
    imprimirIframe(html)
  }
  // Kardex: un traslado entra en el destino (+) y sale del origen (−); el resto como siempre.
  const kPositivo = (k) => ['entrada', 'devolucion'].includes(k.tipo) || (k.tipo === 'traslado' && k.sentido === 'entrada')
  const sucKardex = (k) => k.tipo === 'traslado' && (k.sucursalOrigen || k.sucursalDestino)
    ? `${nombreSuc(k.sucursalOrigen)} → ${nombreSuc(k.sucursalDestino)}`
    : nombreSuc(k.sucursalId)
  const prodsSinAsignar = porSucursal ? productos.filter(p => sinAsignar(p) !== 0) : []
  const totalSinAsignar = r3(prodsSinAsignar.reduce((s, p) => s + sinAsignar(p), 0))
  // Sucursal que afecta un movimiento (entrada/salida/ajuste/devolución): la elegida en el modal,
  // si no la del turno, si no la primera. Con el módulo apagado no se usa.
  const sucMovimiento = sucPropia || movForm.sucursal || sucursalActivaId() || sucursales[0]?.id || SIN_ASIGNAR

  // Reparte TODO lo "sin asignar" a una sucursal (migración al activar el módulo, o conciliación).
  // Cada producto: una línea de kardex tipo traslado (Sin asignar → sucursal). El total no cambia.
  const asignarTodo = async () => {
    const destino = sucAsignar || sucursales[0]?.id
    if (!destino || !prodsSinAsignar.length) return
    const ok = await orionConfirm(`Se asignarán ${totalSinAsignar} unidades (${prodsSinAsignar.length} productos) a "${nombreSuc(destino)}". El total de cada producto no cambia. ¿Continuar?`, { tipo: 'warning', okLabel: 'Asignar' })
    if (!ok) return
    setAsignando(true)
    try {
      for (let i = 0; i < prodsSinAsignar.length; i += 200) {
        const batch = writeBatch(db)
        prodsSinAsignar.slice(i, i + 200).forEach(p => {
          const libre = sinAsignar(p)
          const mapa = { ...(p.stockPorSucursal || {}) }
          const antes = r3(mapa[destino]); const despues = r3(antes + libre)
          mapa[destino] = despues
          batch.update(doc(db, 'productos', p.id), { stockPorSucursal: mapa, updatedAt: serverTimestamp() })
          batch.set(doc(collection(db, 'kardex')), { productoId: p.id, productoCodigo: p.codigo || '', productoNombre: p.nombre || '', tipo: 'traslado', sentido: 'entrada', cantidad: Math.abs(libre), unidad: p.unidad || 'Unidad', presentacion: '', stockAntes: antes, stockDespues: despues, stockTotal: r3(p.stock), motivo: libre > 0 ? 'Asignación inicial a sucursal' : 'Conciliación con el total', referencia: '', sucursalId: destino, sucursalOrigen: SIN_ASIGNAR, sucursalDestino: destino, empresaId, fecha: serverTimestamp() })
        })
        await batch.commit()
      }
      orionAlert(`Listo: ${prodsSinAsignar.length} productos asignados a "${nombreSuc(destino)}".`, { tipo: 'success' })
    } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
    setAsignando(false)
  }

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
    if (isNaN(cantidadIngresada) || cantidadIngresada <= 0) { orionAlert('La cantidad debe ser mayor a cero', { tipo: 'warning' }); return }
    if (cantidadIngresada > 999999) { orionAlert('Cantidad demasiado grande. Máximo 999,999', { tipo: 'warning' }); return }
    if (!movForm.motivo?.trim()) { orionAlert('El motivo es obligatorio para registrar un movimiento', { tipo: 'warning' }); return }
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

        if (porSucursal) {
          // ── INVENTARIO POR SUCURSAL ──
          // Cada movimiento toca UNA cubeta (o dos en un traslado) y el total de la empresa.
          // "Sin asignar" = total − Σ cubetas: se calcula, no se guarda (utils/sucursal.js).
          const pd = prodSnap.data()
          const mapa = { ...(pd.stockPorSucursal || {}) }
          const suma = r3(Object.values(mapa).reduce((s, v) => s + (Number(v) || 0), 0))
          const libre = r3(stockActual - suma)
          const enCubeta = (id) => id === SIN_ASIGNAR ? libre : r3(mapa[id])
          const base = { productoId: movModal.id, productoCodigo: movModal.codigo, productoNombre: movModal.nombre, unidad: movModal.unidad, presentacion: refPresentacion, motivo: movForm.motivo.trim(), referencia: movForm.referencia?.trim() || '', empresaId, fecha: serverTimestamp() }

          if (tipo === 'traslado') {
            const o = sucPropia || movForm.sucursalOrigen, d = movForm.sucursalDestino
            if (!o || !d) throw new Error('Selecciona sucursal de origen y destino')
            if (o === d) throw new Error('La sucursal de origen y destino no pueden ser iguales')
            if (d === SIN_ASIGNAR) throw new Error('El destino debe ser una sucursal')
            const antesO = enCubeta(o), antesD = enCubeta(d)
            if (cantidad > antesO) throw new Error(`Stock insuficiente en ${nombreSuc(o)}: ${antesO} ${movModal.unidad}`)
            if (o !== SIN_ASIGNAR) mapa[o] = r3(antesO - cantidad)
            mapa[d] = r3(antesD + cantidad)
            // Dos líneas de kardex (salida en origen, entrada en destino). El TOTAL no cambia.
            transaction.set(doc(collection(db, 'kardex')), { ...base, tipo: 'traslado', sentido: 'salida', cantidad, stockAntes: antesO, stockDespues: r3(antesO - cantidad), stockTotal: stockActual, sucursalId: o === SIN_ASIGNAR ? '' : o, sucursalOrigen: o, sucursalDestino: d })
            transaction.set(doc(collection(db, 'kardex')), { ...base, tipo: 'traslado', sentido: 'entrada', cantidad, stockAntes: antesD, stockDespues: r3(antesD + cantidad), stockTotal: stockActual, sucursalId: d, sucursalOrigen: o, sucursalDestino: d })
            transaction.update(prodRef, { stockPorSucursal: mapa, updatedAt: serverTimestamp() })
            return
          }

          const sid = sucMovimiento
          const antes = enCubeta(sid)
          let despues = antes
          if (['entrada', 'devolucion'].includes(tipo)) despues = r3(antes + cantidad)
          else if (tipo === 'salida') { if (cantidad > antes) throw new Error(`Stock insuficiente en ${nombreSuc(sid)}: ${antes} ${movModal.unidad}`); despues = r3(antes - cantidad) }
          else if (tipo === 'ajuste') despues = r3(cantidad)
          if (despues < 0) throw new Error('El stock no puede ser negativo')
          const nuevoTotal = r3(stockActual + (despues - antes))
          if (nuevoTotal < 0) throw new Error('El stock no puede ser negativo')
          if (sid !== SIN_ASIGNAR) mapa[sid] = despues
          transaction.set(doc(collection(db, 'kardex')), { ...base, tipo, cantidad, stockAntes: antes, stockDespues: despues, stockTotal: nuevoTotal, sucursalId: sid === SIN_ASIGNAR ? '' : sid, sucursalOrigen: '', sucursalDestino: '' })
          transaction.update(prodRef, { stock: nuevoTotal, stockPorSucursal: mapa, updatedAt: serverTimestamp() })
          return
        }

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
          sucursalId: sucursalActivaId(),
          empresaId,
          fecha: serverTimestamp(),
        })

        // Actualizar stock del producto
        transaction.update(prodRef, { stock: nuevoStock, updatedAt: serverTimestamp() })
      })

      setMovModal(null)
      setMovForm({ tipo: 'entrada', cantidad: '', unidad: '', motivo: '', referencia: '', sucursalOrigen: '', sucursalDestino: '' })
    } catch (e) {
      orionAlert('Error: ' + e.message, { tipo: 'error' })
    }
  }

  const filtrados = productos.filter(p =>
    p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.proveedor?.toLowerCase().includes(busqueda.toLowerCase())
  )

  const kardexFiltrado = kardexVisible.filter(k =>
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
  ).sort((a,b) => ((b.precio||0)*stockPropio(b)) - ((a.precio||0)*stockPropio(a)))

  const abrirModal = (producto = null) => {
    if (producto) {
      setEditando(producto.id)
      setForm({ codigo: producto.codigo || '', nombre: producto.nombre || '', categoria: producto.categoria || '', precio: producto.precio?.toString() || '', precioMayoreo: producto.precioMayoreo?.toString() || '', stock: producto.stock?.toString() || '', min: producto.min?.toString() || '', unidad: producto.unidad || 'Unidad', vendeFraccion: producto.vendeFraccion === true, proveedor: producto.proveedor || '', codigoBarras: producto.codigoBarras || '', ubicacion: producto.ubicacion || '', bodega: producto.bodega || '', descuento: producto.descuento?.toString() || '', fechaVencimiento: producto.fechaVencimiento || '', imagen: producto.imagen || '', unidadesAdicionales: producto.unidadesAdicionales || [] })
    } else { setEditando(null); setForm(emptyForm) }
    setModalOpen(true)
  }


  // ── UPLOAD DE IMAGEN A FIREBASE STORAGE ──
  const uploadImagen = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { orionAlert('Solo se permiten imágenes', { tipo: 'warning' }); return }
    if (file.size > 5 * 1024 * 1024) { orionAlert('La imagen no puede superar 5MB', { tipo: 'warning' }); return }
    setUploadingImg(true)
    try {
      const storage = getStorage()
      const ext = file.name.split('.').pop()
      // Carpeta por empresa: las reglas de archivos solo dejan entrar a la propia
      const filename = `empresas/${empresaId}/productos/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const sRef = storageRef(storage, filename)
      await uploadBytes(sRef, file)
      const url = await getDownloadURL(sRef)
      setForm(f => ({ ...f, imagen: url }))
    } catch (e) { orionAlert('Error al subir imagen: ' + e.message, { tipo: 'error' }) }
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
    const stock = parseFloat(form.stock) // con decimales: un producto por peso puede tener 17.5 libras
    if (isNaN(stock) || stock < 0) errores.push('El stock no puede ser negativo')
    if (stock > 9999999) errores.push('Stock demasiado alto. Máximo 9,999,999')
    const min = parseFloat(form.min) || 0
    if (min < 0) errores.push('El stock mínimo no puede ser negativo')
    if (errores.length > 0) { orionAlert(errores.join(' | '), { tipo: 'warning' }); return }

    // Verificar código duplicado
    const codigoExiste = productos.find(p => p.codigo?.trim() === form.codigo.trim() && p.id !== editando)
    if (codigoExiste) { orionAlert(`El código "${form.codigo}" ya existe en el producto "${codigoExiste.nombre}"`, { tipo: 'warning' }); return }

    setGuardando(true)
    const stockAnterior = editando ? (productos.find(p => p.id === editando)?.stock || 0) : 0
    // Con inventario por sucursal, el stock de un producto existente solo cambia con Movimientos
    // (por sucursal): el formulario no lo toca. Al crear, lo inicial entra a la sucursal del turno.
    const stockNuevo = porSucursal && editando ? stockAnterior : Math.round((parseFloat(form.stock) || 0) * 1000) / 1000
    const sucInicial = porSucursal ? (sucursalActivaId() || sucursales[0]?.id || '') : ''
    const data = { codigo: form.codigo.trim(), nombre: normNombre(form.nombre), categoria: form.categoria.trim(), precio: parseFloat(form.precio) || 0, precioMayoreo: parseFloat(form.precioMayoreo) || 0, stock: stockNuevo, min: parseFloat(form.min) || 0, unidad: form.unidad || 'Unidad', vendeFraccion: form.vendeFraccion === true, unidadesAdicionales: (form.unidadesAdicionales || []).filter(u => u.nombre).map(u => { const { codigoBarras, ...r } = u; const cb = String(codigoBarras || '').trim(); return cb ? { ...r, codigoBarras: cb } : r }), ...(form.proveedor && { proveedor: form.proveedor.trim() }), ...(form.codigoBarras && { codigoBarras: form.codigoBarras.trim() }), ...(form.ubicacion && { ubicacion: form.ubicacion.trim() }), ...(form.bodega && { bodega: form.bodega }), ...(form.descuento && { descuento: parseFloat(form.descuento) || 0 }), ...(form.fechaVencimiento && { fechaVencimiento: form.fechaVencimiento }), ...(form.imagen && { imagen: form.imagen.trim() }), updatedAt: serverTimestamp() }
    try {
      if (editando) {
        await updateDoc(doc(db, 'productos', editando), data)
        if (stockNuevo !== stockAnterior) await addDoc(collection(db, 'kardex'), { productoId: editando, productoCodigo: form.codigo, productoNombre: form.nombre, tipo: 'ajuste', cantidad: Math.abs(stockNuevo - stockAnterior), unidad: form.unidad, stockAntes: stockAnterior, stockDespues: stockNuevo, motivo: 'Ajuste desde edicion', referencia: '', sucursalId: sucursalActivaId(), empresaId, fecha: serverTimestamp() })
      } else {
        const ref = await addDoc(collection(db, 'productos'), { ...data, ...(sucInicial && stockNuevo > 0 ? { stockPorSucursal: { [sucInicial]: stockNuevo } } : {}), empresaId, createdAt: serverTimestamp() })
        if (stockNuevo > 0) await addDoc(collection(db, 'kardex'), { productoId: ref.id, productoCodigo: form.codigo, productoNombre: form.nombre, tipo: 'entrada', cantidad: stockNuevo, unidad: form.unidad, stockAntes: 0, stockDespues: stockNuevo, motivo: 'Stock inicial', referencia: '', sucursalId: sucursalActivaId(), empresaId, fecha: serverTimestamp() })
      }
      setModalOpen(false)
    } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
    setGuardando(false)
  }

  const eliminar = async (id) => { if (!(await orionConfirm('Eliminar este producto?', { tipo: 'warning', okLabel: 'Eliminar' }))) return; try { await deleteDoc(doc(db, 'productos', id)) } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) } }

  // ── Etiquetas de código de barras ──
  // Colgante de joyería: precio al público (con IVA), SKU como código legible y el código de barras si lo tiene
  const itemJoyeria = (p, cod, copias = 1) => ({ nombre: p.nombre, precio: Math.round((Number(p.precio) || 0) * 1.13 * 100) / 100, sku: p.codigo || cod, codigoBarras: cod, copias })
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

  // Vista previa del colgante de joyería (HTML real de impresión, a tamaño natural)
  useEffect(() => {
    if (!etiquetaModal || etiquetaFormato !== 'joyeria') { setEtiquetaPrevJoy(''); return }
    let vivo = true
    generarHTMLEtiquetaJoyeria([itemJoyeria(etiquetaModal, etiquetaCodigo)], { nombreComercial: nombreEmpresa }, { tipo: etiquetaTipo, codigo: 'sku' })
      .then(h => { if (vivo) setEtiquetaPrevJoy(h) }).catch(() => {})
    return () => { vivo = false }
  }, [etiquetaModal, etiquetaCodigo, etiquetaFormato, etiquetaTipo, nombreEmpresa]) // eslint-disable-line react-hooks/exhaustive-deps

  const imprimirPruebaJoyeria = async () => {
    const p = etiquetaModal; if (!p) return
    imprimirIframe(await generarHTMLPruebaJoyeria(itemJoyeria(p, etiquetaCodigo), { nombreComercial: nombreEmpresa }))
  }
  // PDF con páginas de 56×13 mm (una por etiqueta) para imprimir "a tamaño real" en la Zebra desde otro equipo
  const pdfJoyeria = async (prueba = false) => {
    const p = etiquetaModal; if (!p) return
    try {
      const html = prueba
        ? await generarHTMLPruebaJoyeria(itemJoyeria(p, etiquetaCodigo), { nombreComercial: nombreEmpresa })
        : await generarHTMLEtiquetaJoyeria([itemJoyeria(p, etiquetaCodigo, etiquetaCopias)], { nombreComercial: nombreEmpresa }, { tipo: etiquetaTipo, codigo: 'sku' })
      const n = await descargarPdfEtiquetas(html, (prueba ? 'Prueba-etiquetas-' : 'Etiquetas-') + String(p.codigo || etiquetaCodigo).replace(/[^A-Za-z0-9_-]/g, '') + '.pdf')
      orionAlert(n + ' etiqueta(s) en un PDF de 56 × 13 mm, en Descargas. Al imprimirlo en la Zebra: tamaño real (100 %), sin ajustar a la página.', { titulo: '📄 PDF listo' })
    } catch (e) { orionAlert('No se pudo generar el PDF: ' + e.message, { tipo: 'error' }) }
  }

  // Si el producto no tenía código de barras, guardamos el generado (queda escaneable).
  const guardarCodigoGenerado = async (p) => {
    if (p.codigoBarras || !etiquetaCodigo) return true
    try { await updateDoc(doc(db, 'productos', p.id), { codigoBarras: etiquetaCodigo, updatedAt: serverTimestamp() }); return true }
    catch (e) { orionAlert('No se pudo guardar el código: ' + e.message, { tipo: 'error' }); return false }
  }

  // Zebra directa (ZPL por Browser Print): la etiqueta sale exacta y varias copias salen seguidas.
  // prueba = una con barras y una con QR, para ver cuál lee mejor el lector.
  const imprimirZebra = async (prueba = false) => {
    const p = etiquetaModal; if (!p || zebraOcupado) return
    if (!prueba && !(await guardarCodigoGenerado(p))) return
    setZebraOcupado(true)
    try {
      const marca = nombreEmpresa
      const zpl = prueba
        ? generarZplJoyeria([itemJoyeria(p, etiquetaCodigo, 1)], { marca, tipo: 'code128', ajustes: zebraAjustes })
          + generarZplJoyeria([itemJoyeria(p, etiquetaCodigo, 1)], { marca, tipo: 'qr', ajustes: zebraAjustes })
        : generarZplJoyeria([itemJoyeria(p, etiquetaCodigo, etiquetaCopias)], { marca, tipo: etiquetaTipo, ajustes: zebraAjustes })
      const nombre = await imprimirZpl(zpl)
      if (prueba) orionAlert('Enviadas 2 etiquetas de prueba (barras y QR) a ' + nombre + '.', { tipo: 'success' })
      else setEtiquetaModal(null)
    } catch (e) {
      if (e.name === 'SinBrowserPrint') orionAlert(e.message + '\n\n' + MENSAJE_INSTALAR_BROWSER_PRINT, { titulo: '🦓 Zebra no conectada', tipo: 'warning' })
      else orionAlert(e.message, { tipo: 'error' })
    }
    setZebraOcupado(false)
  }
  const cambiarAjusteZebra = (campo, valor) => {
    const n = { ...zebraAjustes, [campo]: valor === '' ? '' : Number(valor) }
    setZebraAjustes(n); guardarAjustesZebra(n)
  }

  // ── Etiquetas de VARIOS productos a la vez (selección en la lista) ──
  const alternarSel = (id) => setSeleccion(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const idsPagina = () => filtrados.slice(pagProd * POR_PAGINA, (pagProd + 1) * POR_PAGINA).map(p => p.id)
  const alternarPagina = () => setSeleccion(s => { const ids = idsPagina(); const n = new Set(s); if (ids.every(id => n.has(id))) ids.forEach(id => n.delete(id)); else ids.forEach(id => n.add(id)); return n })
  const abrirLote = () => {
    const usados = productos.map(x => x.codigoBarras).filter(Boolean)
    const items = productos.filter(p => seleccion.has(p.id)).map(p => {
      let cod = p.codigoBarras
      if (!cod) { cod = generarCodigoBarras(usados); usados.push(cod) }
      return { p, cod, copias: 1 }
    })
    if (items.length) setLoteModal(items)
  }
  const itemsLoteJoyeria = () => loteModal.map(({ p, cod, copias }) => itemJoyeria(p, cod, copias))
  const guardarCodigosLote = async () => {
    for (const it of loteModal) {
      if (it.p.codigoBarras) continue
      try { await updateDoc(doc(db, 'productos', it.p.id), { codigoBarras: it.cod, updatedAt: serverTimestamp() }) }
      catch (e) { orionAlert('No se pudo guardar el código de ' + it.p.nombre + ': ' + e.message, { tipo: 'error' }); return false }
    }
    return true
  }
  const htmlLote = async () => etiquetaFormato === 'joyeria'
    ? generarHTMLEtiquetaJoyeria(itemsLoteJoyeria(), { nombreComercial: nombreEmpresa }, { tipo: etiquetaTipo, codigo: 'sku' })
    : generarHTMLEtiquetas(loteModal.map(({ p, cod, copias }) => ({ nombre: p.nombre, precio: p.precio, codigo: cod, copias })))
  const cerrarLote = () => { setLoteModal(null); setSeleccion(new Set()) }
  const imprimirLote = async (destino) => {
    if (!loteModal?.length || zebraOcupado) return
    if (!(await guardarCodigosLote())) return
    setZebraOcupado(true)
    try {
      if (destino === 'zebra') {
        const nombre = await imprimirZpl(generarZplJoyeria(itemsLoteJoyeria(), { marca: nombreEmpresa, tipo: etiquetaTipo, ajustes: zebraAjustes }))
        orionAlert(totalLote() + ' etiqueta(s) enviadas a ' + nombre + '.', { tipo: 'success' })
        cerrarLote()
      } else if (destino === 'pdf') {
        const n = await descargarPdfEtiquetas(await htmlLote(), 'Etiquetas-' + loteModal.length + '-productos.pdf')
        orionAlert(n + ' etiqueta(s) en un PDF de 56 × 13 mm, en Descargas.', { titulo: '📄 PDF listo' })
      } else {
        imprimirIframe(await htmlLote())
        cerrarLote()
      }
    } catch (e) {
      if (e.name === 'SinBrowserPrint') orionAlert(e.message + '\n\n' + MENSAJE_INSTALAR_BROWSER_PRINT, { titulo: '🦓 Zebra no conectada', tipo: 'warning' })
      else orionAlert(e.message, { tipo: 'error' })
    }
    setZebraOcupado(false)
  }
  const totalLote = () => (loteModal || []).reduce((s, it) => s + (Math.max(1, parseInt(it.copias) || 1)), 0)

  const imprimirEtiqueta = async () => {
    const p = etiquetaModal
    if (!p) return
    if (!(await guardarCodigoGenerado(p))) return
    const html = etiquetaFormato === 'joyeria'
      ? await generarHTMLEtiquetaJoyeria([itemJoyeria(p, etiquetaCodigo, etiquetaCopias)], { nombreComercial: nombreEmpresa }, { tipo: etiquetaTipo, codigo: 'sku' })
      : await generarHTMLEtiquetas([{ nombre: p.nombre, precio: p.precio, codigo: etiquetaCodigo, copias: etiquetaCopias }])
    imprimirIframe(html)
    setEtiquetaModal(null)
  }

  const exportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(productos.map(p => { const ua = p.unidadesAdicionales || []; return { codigo: p.codigo || '', nombre: p.nombre || '', categoria: p.categoria || '', precio: p.precio || 0, precioConIva: p.precio ? Math.round(p.precio * 1.13 * 100) / 100 : '', precioMayoreo: p.precioMayoreo || '', stock: p.stock || 0, min: p.min || 0, unidad: p.unidad || '', fraccion: p.vendeFraccion ? 'SI' : '', proveedor: p.proveedor || '', codigoBarras: p.codigoBarras || '', ubicacion: p.ubicacion || '', descuento: p.descuento || 0, fechaVencimiento: p.fechaVencimiento || '', pres1_nombre: ua[0]?.nombre || '', pres1_factor: ua[0]?.factor || '', pres1_precio: ua[0]?.precio || '', pres1_codigoBarras: ua[0]?.codigoBarras || '', pres2_nombre: ua[1]?.nombre || '', pres2_factor: ua[1]?.factor || '', pres2_precio: ua[1]?.precio || '', pres2_codigoBarras: ua[1]?.codigoBarras || '', presAlVender: ua.find(u => u.porDefecto)?.nombre || '' } }), { header: COLUMNAS_EXCEL })
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
    XLSX.writeFile(wb, `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const descargarPlantilla = () => {
    const ws = XLSX.utils.json_to_sheet([{ codigo: 'P001', nombre: 'Producto Ejemplo', categoria: 'General', precio: 10.00, precioConIva: '', precioMayoreo: 9.00, stock: 100, min: 10, unidad: 'Unidad', fraccion: '', proveedor: 'Proveedor SV', codigoBarras: '', ubicacion: 'Bodega A', descuento: 0, fechaVencimiento: '', pres1_nombre: 'Caja', pres1_factor: 30, pres1_precio: 270.00, pres1_codigoBarras: '', pres2_nombre: '', pres2_factor: '', pres2_precio: '', pres2_codigoBarras: '', presAlVender: '' }], { header: COLUMNAS_EXCEL })
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
        const codigo = String(row.codigo || '').trim(); const nombre = normNombre(row.nombre)
        let precio = parseFloat(row.precio || 0)
        const conIva = parseFloat(String(row.precioConIva ?? '').replace(/[$,\s]/g, '') || 0)
        if ((!precio || isNaN(precio)) && conIva > 0) precio = Math.round(conIva / 1.13 * 10000) / 10000 // el dueño escribió el precio al público
        const errores = []; if (!codigo) errores.push('Falta codigo'); if (!nombre) errores.push('Falta nombre'); if (isNaN(precio) || precio < 0) errores.push('Precio invalido')
        // Presentaciones (hasta 2): cada una requiere nombre + factor > 1. El precio es opcional.
        const unidadesAdicionales = []
        for (const n of [1, 2]) {
          const pNombre = String(row[`pres${n}_nombre`] || '').trim()
          const pFactor = parseFloat(row[`pres${n}_factor`] || 0)
          const pPrecio = parseFloat(row[`pres${n}_precio`] || 0)
          const pCodigo = String(row[`pres${n}_codigoBarras`] || '').trim() // opcional: el código propio de la caja
          if (pNombre && pFactor > 1) {
            unidadesAdicionales.push({ nombre: pNombre, factor: pFactor, precio: isNaN(pPrecio) || pPrecio <= 0 ? precio * pFactor : pPrecio, ...(pCodigo && { codigoBarras: pCodigo }) })
          } else if (pNombre && (!pFactor || pFactor <= 1)) {
            errores.push(`Presentacion "${pNombre}" necesita factor mayor a 1`)
          }
        }
        // Columna opcional "presAlVender" (el nombre de la presentación, o 1 / 2): la que entra al tocar el
        // producto en la caja. Si el archivo no la trae, se conserva la que ya tenía el producto.
        const alVender = 'presAlVender' in row
          ? String(row.presAlVender).trim().toLowerCase()
          : String((productos.find(p => String(p.codigo || '').trim().toLowerCase() === codigo.toLowerCase())?.unidadesAdicionales || []).find(u => u.porDefecto)?.nombre || '').toLowerCase()
        if (alVender) {
          const porNumero = /^[12]$/.test(alVender) ? String(row[`pres${alVender}_nombre`] || '').trim().toLowerCase() : ''
          const marcada = unidadesAdicionales.find(u => u.nombre.toLowerCase() === (porNumero || alVender))
          if (marcada) marcada.porDefecto = true
        }
        return { _fila: i + 2, codigo, nombre, categoria: String(row.categoria || '').trim(), precio, precioMayoreo: parseFloat(row.precioMayoreo || 0) || 0, stock: Math.round((parseFloat(row.stock || 0) || 0) * 1000) / 1000, min: parseFloat(row.min || 0) || 0, unidad: String(row.unidad || 'Unidad').trim(),
          // Columna opcional "fraccion" (SI): solo se toca si el archivo la trae, para no apagarla al reimportar un Excel viejo
          ...('fraccion' in row ? { vendeFraccion: /^(si|sí|s|x|1|true|verdadero)$/i.test(String(row.fraccion).trim()) } : {}), proveedor: String(row.proveedor || '').trim(), codigoBarras: String(row.codigoBarras || '').trim(), ubicacion: String(row.ubicacion || '').trim(), descuento: parseFloat(row.descuento || 0), fechaVencimiento: String(row.fechaVencimiento || '').trim(), unidadesAdicionales, _errores: errores, _ok: errores.length === 0 }
      }))
      setImportModalOpen(true)
    }
    reader.readAsBinaryString(file); e.target.value = ''
  }

  const importarProductos = async () => {
    const validos = importData.filter(f => f._ok); if (!validos.length) return
    if (!empresaId) { orionAlert('No se pudo identificar la empresa. Recarga la página.', { tipo: 'error' }); return }
    setImportando(true)
    // Inventario por sucursal: el stock de los productos NUEVOS del Excel entra a la sucursal del turno.
    const sucImp = porSucursal ? (sucursalActivaId() || sucursales[0]?.id || '') : ''
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
            batch.set(ref, { ...limpio, ...(sucImp && Number(limpio.stock) > 0 ? { stockPorSucursal: { [sucImp]: Number(limpio.stock) } } : {}), empresaId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
            if (clave) porCodigo.set(clave, ref.id) // por si el mismo código se repite dentro del archivo
            creados++
          }
        })
        await batch.commit()
      }
      setImportModalOpen(false); setImportData([])
      orionAlert(`Importación lista.\n\nNuevos: ${creados}\nActualizados (ya existían): ${actualizados}`, { tipo: 'success' })
    } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
    setImportando(false)
  }


  const exportarKardex = () => {
    const ws = XLSX.utils.json_to_sheet(kardexVisible.map(k => ({ fecha: k.fecha?.toDate?.()?.toLocaleString('es-SV') || '', producto: k.productoNombre, codigo: k.productoCodigo, tipo: k.tipo, ...(porSucursal ? { sucursal: sucKardex(k) } : {}), cantidad: k.cantidad, unidad: k.unidad, presentacion: k.presentacion || '', stockAntes: k.stockAntes, stockDespues: k.stockDespues, motivo: k.motivo || '', referencia: k.referencia || '' })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Kardex')
    XLSX.writeFile(wb, `kardex-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exportarAlertas = () => {
    const datos = [...productos.filter(p => (p.stock || 0) === 0).map(p => ({ estado: 'AGOTADO', codigo: p.codigo, nombre: p.nombre, stock: 0, minimo: p.min, sugerido: Math.max((p.min || 0) * 2, 10) })), ...productos.filter(p => (p.stock || 0) > 0 && (p.stock || 0) < (p.min || 0)).map(p => ({ estado: 'BAJO', codigo: p.codigo, nombre: p.nombre, stock: p.stock, minimo: p.min, sugerido: Math.max((p.min || 0) * 2 - (p.stock || 0), 0) }))]
    const ws = XLSX.utils.json_to_sheet(datos); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Alertas')
    XLSX.writeFile(wb, `alertas-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exportarValoracion = () => {
    const ws = XLSX.utils.json_to_sheet(productos.map(p => ({ codigo: p.codigo, nombre: p.nombre, categoria: p.categoria || '', stock: stockPropio(p), unidad: p.unidad, precio_costo: p.precio || 0, precio_venta: ((p.precio || 0) * 1.13).toFixed(2), valor_costo: ((p.precio || 0) * stockPropio(p)).toFixed(2), valor_venta: ((p.precio || 0) * 1.13 * stockPropio(p)).toFixed(2) })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Valoracion')
    XLSX.writeFile(wb, `valoracion-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const imprimirValoracion = () => {
    const vc = productos.reduce((s, p) => s + (p.precio || 0) * stockPropio(p), 0)
    const vv = productos.reduce((s, p) => s + (p.precio || 0) * 1.13 * stockPropio(p), 0)
    const cats = {}
    productos.forEach(p => { const c = p.categoria || 'Sin categoria'; if (!cats[c]) cats[c] = { v: 0, u: 0, n: 0 }; cats[c].v += (p.precio||0)*stockPropio(p); cats[c].u += stockPropio(p); cats[c].n++ })
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
    try { if (editandoBodega) await updateDoc(doc(db, 'bodegas', editandoBodega), { ...formBodega, updatedAt: serverTimestamp() }); else await addDoc(collection(db, 'bodegas'), { ...formBodega, empresaId, createdAt: serverTimestamp() }); setModalBodega(false); setEditandoBodega(null); setFormBodega({ nombre: '', descripcion: '', responsable: '' }) } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
    setGuardando(false)
  }

  const guardarSucursal = async () => {
    if (!formSucursal.nombre) return; setGuardando(true)
    try { if (editandoSucursal) await updateDoc(doc(db, 'sucursales', editandoSucursal), { ...formSucursal, updatedAt: serverTimestamp() }); else await addDoc(collection(db, 'sucursales'), { ...formSucursal, empresaId, createdAt: serverTimestamp() }); setModalSucursal(false); setEditandoSucursal(null); setFormSucursal({ nombre: '', direccion: '', telefono: '', responsable: '' }) } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
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
    } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
    setGuardando(false)
  }

  const exportarCategorias = () => {
    const datos = categorias.map(c => {
      const prods = productos.filter(p => p.categoria === c.nombre)
      const valor = prods.reduce((s, p) => s + (p.precio || 0) * stockPropio(p), 0)
      const bajos = prods.filter(p => stockPropio(p) < (p.min || 0)).length
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

  const maxValorCategoria = Math.max(...todasCategorias.map(c => productos.filter(p => p.categoria === c.nombre).reduce((s, p) => s + (p.precio || 0) * stockPropio(p), 0)), 1)

  // Por vencer: con fecha de vencimiento dentro de los días de aviso (o ya vencidos) y con existencias
  // Por lote (utils/lotes.js): un producto cuenta si alguno de sus lotes vence dentro del aviso
  const porVencer = productos.filter(p => lotesPorVencer(p, diasAvisoVenc).length > 0)
  const yaVencidos = porVencer.filter(p => lotesPorVencer(p, diasAvisoVenc).some(l => diasPara(l.vence) < 0)).length
  // Alertas según la pestaña de sucursal elegida (total si el módulo está apagado o en "Todas")
  const productosCriticos = productos.filter(p => stockMostrar(p) === 0)
  const productosBajos = productos.filter(p => stockMostrar(p) > 0 && stockMostrar(p) < (p.min || 0))

  const alertaCriticoFiltrada = productosCriticos.filter(p =>
    p.nombre?.toLowerCase().includes(busAlerta.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busAlerta.toLowerCase())
  )

  const alertaBajaFiltrada = productosBajos.filter(p =>
    p.nombre?.toLowerCase().includes(busAlerta.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busAlerta.toLowerCase())
  )
  const valorInventario = productos.reduce((s, p) => s + (p.precio || 0) * stockPropio(p), 0)
  const totalOk = importData.filter(f => f._ok).length
  const totalErr = importData.filter(f => !f._ok).length
  const totalEntradas = kardexVisible.filter(k => ['entrada','devolucion'].includes(k.tipo)).reduce((s, k) => s + (k.cantidad || 0), 0)
  const totalSalidas = kardexVisible.filter(k => ['salida'].includes(k.tipo)).reduce((s, k) => s + (k.cantidad || 0), 0)
  // ── Números de la franja de estado ──
  // "costo" y "venta" siguen el mismo criterio que la sección Valoración:
  // costo = precio sin IVA; venta = ese precio + 13%.
  // Categorías para el desplegable del formulario: las registradas + las que ya
  // están en uso en algún producto, sin repetir y en orden.
  const opcionesCategoria = [...new Set([
    ...categorias.map(c => c.nombre),
    ...categoriasDeProductos,
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'))

  const unidadesTotal = productos.reduce((s, p) => s + stockPropio(p), 0)
  const valorVenta = valorInventario * 1.13
  const sinPrecio = productos.filter(p => !((p.precio || 0) > 0)).length
  const sucursalDelTurno = sucursales.find(su => su.id === sucursalActivaId()) || null

  const f = form

  // Las 8 secciones — fuente única para tarjetas grandes y píldoras
  const SECCIONES = [
    { id: 'productos',  icon: 'productos',  color: '#00C296', label: 'Productos',          val: productos.length, sub: 'articulos en inventario' },
    { id: 'kardex',     icon: 'kardex',     color: '#4A8FE8', label: 'Kardex',             val: productos.reduce((s, p) => s + stockPropio(p), 0), sub: 'unidades en stock total' },
    { id: 'ajustes',    icon: 'ajuste',     color: '#f59e0b', label: 'Ajuste de Inventario', corto: 'Ajustes', val: productos.filter(p => stockMostrar(p) <= (p.min || 0)).length, sub: 'productos necesitan atencion' },
    { id: 'bodega',     icon: 'bodega',     color: '#8b5cf6', label: 'Bodega',             val: bodegas.length, sub: 'zonas de almacenamiento' },
    { id: 'sucursales', icon: 'sucursal',   color: '#2E6FD4', label: 'Sucursales',         val: sucursales.length, sub: 'puntos de venta activos' },
    ...(porSucursal ? [{ id: 'traslados', icon: 'sucursal', color: '#0ea5e9', label: 'Traslados', val: trasPendientes.length, sub: 'por recibir' }] : []),
    { id: 'alertas',    icon: 'alertas',    color: '#ef4444', label: 'Alertas de Stock',   corto: 'Alertas', val: productosCriticos.length, sub: `${productosCriticos.length} agotados · ${productosBajos.length} stock bajo`, badge: productosCriticos.length + productosBajos.length },
    { id: 'valoracion', icon: 'valoracion', color: '#00C296', label: 'Valoracion',         val: fmt(valorInventario), valChico: valorInventario > 99999, sub: 'valor del inventario a costo' },
    { id: 'categorias', icon: 'categorias', color: '#ec4899', label: 'Categorias',         val: todasCategorias.length, sub: `${categorias.length} registradas · ${categoriasDeProductos.length} en uso` },
  ]

  const BackBtn = () => null

  return (
    <>
      <style>{invStyles}</style>

      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">Inventario</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {productos.length} productos · {bodegas.length} bodegas
          </div>
        </div>
        {sucursalDelTurno && (
          <div className="inv-suc-chip" title="Sucursal en la que estás trabajando">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}><path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M4 21v-7h6v7"/></svg>
            <span><small>Sucursal</small><b>{sucursalDelTurno.nombre}</b></span>
          </div>
        )}
        {vista === 'productos' && (
          <div className="inv-acc">
            {puede('importar_exportar') && <button className="inv-btn-linea" onClick={() => fileRef.current.click()}>Importar desde Excel</button>}
            {moduloActivo('levantar_inventario') && puede('crear_productos') && (
              <Link to="/inventario/levantar" className="inv-btn-linea" title="Contar productos escaneando códigos de barras con el celular">Levantar con el celular</Link>
            )}
            {puede('crear_productos') && <button className="inv-btn-oro" onClick={() => abrirModal()}>Nuevo producto</button>}
          </div>
        )}
        {vista === 'bodega' && <button className="inv-btn-oro" onClick={() => setModalBodega(true)}>Nueva bodega</button>}
        {vista === 'categorias' && <button className="inv-btn-oro" onClick={() => setModalCategoria(true)}>Nueva categoría</button>}
      </div>

      {/* ══ FRANJA DE ESTADO — reemplaza las 8 tarjetas de colores ══ */}
      <div className="inv-franja">
        <div className="inv-fr">
          <div className="inv-fr-et">Productos</div>
          <div className="inv-fr-val">{productos.length}</div>
        </div>
        <div className="inv-fr">
          <div className="inv-fr-et">Unidades en existencia</div>
          <div className="inv-fr-val">{unidadesTotal.toLocaleString('en-US')}</div>
        </div>
        <div className="inv-fr">
          <div className="inv-fr-et">Valoración</div>
          <div className="inv-fr-fila">
            <div className="inv-fr-val oro">{fmt(valorInventario)}</div>
            <div className="inv-fr-sub">a costo</div>
          </div>
          <div className="inv-fr-sub">{fmt(valorVenta)} a precio de venta</div>
        </div>
        <div className="inv-fr">
          <div className="inv-fr-et">Hay que reponer</div>
          <div className="inv-fr-fila">
            <div className={'inv-fr-val ' + ((productosCriticos.length + productosBajos.length) > 0 ? 'alerta' : '')}>{productosCriticos.length + productosBajos.length}</div>
            <div className="inv-fr-sub">{productosCriticos.length} agotados</div>
          </div>
        </div>
        {diasAvisoVenc > 0 && (
          <div className="inv-fr">
            <div className="inv-fr-et">Por vencer ({diasAvisoVenc} días)</div>
            <div className="inv-fr-fila">
              <div className={'inv-fr-val ' + (porVencer.length > 0 ? 'alerta' : '')}>{porVencer.length}</div>
              <div className="inv-fr-sub">{yaVencidos > 0 ? yaVencidos + ' ya vencidos' : (porVencer.length > 0 ? 'con existencias' : 'nada por vencer')}</div>
            </div>
          </div>
        )}
        <div className="inv-fr">
          <div className="inv-fr-et">Sin precio registrado</div>
          <div className="inv-fr-fila">
            <div className="inv-fr-val">{sinPrecio}</div>
            <div className="inv-fr-sub">{sinPrecio > 0 ? 'no suman a la valoración' : 'todo con precio'}</div>
          </div>
        </div>
      </div>

      {/* ══ BARRA DE SECCIONES — el menú de la pantalla, con el buscador al lado ══ */}
      <div className="inv-secs">
        <div className="inv-seg">
          <button type="button" className={vista === 'panel' ? 'activa' : ''} onClick={() => setVista('panel')}>Inicio</button>
          {SECCIONES.map(sec => (
            <button type="button" key={sec.id} className={vista === sec.id ? 'activa' : ''}
              onClick={e => { setVista(sec.id); e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }) }}>
              {sec.corto || sec.label}
              {sec.id === 'alertas' && sec.badge > 0 && <span className="num">{sec.badge}</span>}
            </button>
          ))}
        </div>
        {vista === 'productos' && productos.length > 0 && (
          <div className="inv-buscador">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <label htmlFor="inv-buscar" className="sr-solo">Buscar producto</label>
            <input id="inv-buscar" type="search" placeholder="Buscar por nombre, código o código de barras"
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
        )}
      </div>

      {/* ══ PANEL DE INICIO — lo accionable; los números se fueron a la franja ══ */}
      {vista === 'panel' && (
        <>
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

      {/* ══ PRODUCTOS ══ */}
      {vista === 'productos' && (<>
        <BackBtn />
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={leerExcel} />

        {/* ══ TODAVÍA NO HAY PRODUCTOS — las tres formas de cargar el catálogo ══ */}
        {!loading && productos.length === 0 ? (
          <div className="inv-vacio">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--border2)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>
            <h3>Todavía no hay productos</h3>
            <p>Cargá tu catálogo una sola vez. Después, cada venta, compra y devolución mueve el inventario sola.</p>
            <div className="inv-vacio-grid">
              {puede('importar_exportar') && (
                <div className="inv-vacio-card destacada">
                  <h4>Desde Excel <span className="inv-vacio-tag">MÁS RÁPIDO</span></h4>
                  <p>Bajás la plantilla, la llenás con tus productos y precios, y la subís. Cientos de productos de una vez.</p>
                  <div className="inv-vacio-btns">
                    <button className="inv-vacio-btn" onClick={descargarPlantilla}>Bajar plantilla</button>
                    <button className="inv-vacio-btn linea" onClick={() => fileRef.current.click()}>Importar</button>
                  </div>
                </div>
              )}
              {moduloActivo('levantar_inventario') && puede('crear_productos') && (
                <div className="inv-vacio-card">
                  <h4>Con el celular</h4>
                  <p>Recorrés la tienda escaneando el código de barras y contando. ORIÓN va creando cada producto.</p>
                  <div className="inv-vacio-btns">
                    <Link to="/inventario/levantar" className="inv-vacio-btn linea">Levantar inventario</Link>
                  </div>
                </div>
              )}
              {puede('crear_productos') && (
                <div className="inv-vacio-card">
                  <h4>Uno por uno</h4>
                  <p>Para empezar con los diez que más vende y agregar el resto sobre la marcha.</p>
                  <div className="inv-vacio-btns">
                    <button className="inv-vacio-btn linea" onClick={() => abrirModal()}>Nuevo producto</button>
                  </div>
                </div>
              )}
            </div>
            <div className="inv-vacio-pie">El precio de venta se digita sin IVA: abajo del campo te mostramos cuánto queda con IVA.</div>
          </div>
        ) : (<>
        {porSucursal && !soloSuSucursal && prodsSinAsignar.length > 0 && puede('editar_productos') && (
          <div className="inv-banner-suc">
            <div><b>{prodsSinAsignar.length} productos</b> tienen <b>{totalSinAsignar} unidades</b> sin sucursal asignada: existencias de antes de activar el inventario por sucursal. Asignalas a la sucursal donde están físicamente; después podés trasladar entre sucursales con el movimiento <b>Traslado</b>.</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="input" style={{ width: 'auto' }} value={sucAsignar || sucursales[0]?.id || ''} onChange={e => setSucAsignar(e.target.value)}>{sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
              <button className="btn btn-primary btn-sm" onClick={asignarTodo} disabled={asignando}>{asignando ? '⏳ Asignando...' : 'Asignar todo a esta sucursal'}</button>
            </div>
          </div>
        )}
        {porSucursal && (
          <div className="inv-suc-tabs" role="tablist" aria-label="Existencias por sucursal">
            {!sucPropia && <button role="tab" aria-selected={!sucVista} className={!sucVista ? 'on' : ''} onClick={() => setSucVista('')}>Todas</button>}
            {sucursales.filter(s => !sucPropia || s.id === sucPropia).map(s => <button key={s.id} role="tab" aria-selected={sucVista === s.id} className={sucVista === s.id ? 'on' : ''} onClick={() => setSucVista(s.id)}>{s.nombre}</button>)}
            {!sucPropia && prodsSinAsignar.length > 0 && <button role="tab" aria-selected={sucVista === SIN_ASIGNAR} className={sucVista === SIN_ASIGNAR ? 'on' : ''} onClick={() => setSucVista(SIN_ASIGNAR)}>Sin asignar · {totalSinAsignar}</button>}
          </div>
        )}
        <div className="inv-toolbar">
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{filtrados.length} de {productos.length} productos{porSucursal && sucVista && <> · existencias en <b>{nombreSuc(sucVista)}</b></>}</div>
          <div className="toolbar-group">
            {seleccion.size > 0 && puede('editar_productos') && <>
              <button className="btn btn-primary btn-sm" onClick={abrirLote}>🏷️ Etiquetas de {seleccion.size} producto{seleccion.size === 1 ? '' : 's'}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSeleccion(new Set())}>Quitar selección</button>
            </>}
            {puede('importar_exportar') && <>
              <button className="btn btn-ghost btn-sm" onClick={descargarPlantilla}>Plantilla</button>
              <button className="btn btn-ghost btn-sm" onClick={exportarExcel} disabled={!productos.length}>Exportar a Excel</button>
            </>}
          </div>
        </div>
        <div className="card">
          {loading ? <div className="loading">🔄 Cargando...</div> : (<>
            {/* TELÉFONO: una tarjeta por producto (la tabla de 9 columnas no se puede trabajar en 390 px) */}
            <div className="solo-movil">
              <div className="prod-cards">
                {filtrados.length === 0 ? <div className="empty-state"><div className="empty-icon">📦</div><div className="empty-text">{busqueda ? 'No encontrado' : 'Agrega tu primer producto'}</div></div>
                : filtrados.slice(pagProd * POR_PAGINA, (pagProd + 1) * POR_PAGINA).map(p => (
                  <div key={p.id} className={'prod-card' + (seleccion.has(p.id) ? ' seleccionada' : '')}>
                    <div className="prod-card-top">
                      {puede('editar_productos') && <input type="checkbox" aria-label="Seleccionar para etiquetas" checked={seleccion.has(p.id)} onChange={() => alternarSel(p.id)} style={{ width: 18, height: 18, flexShrink: 0, marginRight: 8 }} />}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="prod-card-nombre">{p.nombre}</div>
                        <div className="prod-card-meta"><span className="mono">{p.codigo}</span>{p.categoria && <> · {p.categoria}</>}{p.ubicacion && <> · 📍 {p.ubicacion}</>}</div>
                      </div>
                      <div className="prod-card-precio">
                        ${((p.precio||0)*1.13).toFixed(2)}
                        <small>${(p.precio||0).toFixed(2)} s/IVA</small>
                        {p.precioMayoreo > 0 && <small style={{ color: 'var(--accent2)', fontWeight: 700 }}>🏷️ Mayoreo ${(p.precioMayoreo*1.13).toFixed(2)}</small>}
                      </div>
                    </div>
                    <div className="prod-card-mid">
                      <span className="prod-card-stock"><span className={getStockClass(stockMostrar(p),p.min||0)}>{stockMostrar(p)}</span> <span style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>{p.unidad} · mín {p.min||0}{porSucursal && desglose(p) && <> · {desglose(p)}</>}</span></span>{porSucursal && verOtrasSuc && sucVista && sucVista !== SIN_ASIGNAR && <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 7px' }} onClick={() => setOtrasModal(p)}>Otras sucursales</button>}
                      <span className={`status-pill ${p.stock===0?'agotado':p.stock<(p.min||0)?'bajo':'activo'}`}><span className="dot"/>{p.stock===0?'Agotado':p.stock<(p.min||0)?'Stock bajo':'Normal'}</span>
                      {stockLegible(p) && <span style={{ fontSize: 11, color: 'var(--accent2)' }}>≈ {stockLegible(p)}</span>}
                      {(p.unidadesAdicionales||[]).map((u, i) => <span key={i} className="prod-tag" title={u.porDefecto ? 'Entra así al vender' : undefined}>{u.porDefecto ? '⭐' : '📦'} {u.nombre}</span>)}
                    </div>
                    <div className="prod-card-acciones">
                      {puede('ver_kardex') && <button className="btn btn-kardex btn-sm" onClick={() => cargarKardexProducto(p)} title="Kardex">📋</button>}
                      {puede('registrar_movimientos') && <button className="btn btn-ghost btn-sm" onClick={() => { setMovModal(p); setMovForm({ tipo: 'entrada', cantidad: '', unidad: p.unidad, motivo: '', referencia: '', sucursalOrigen: '', sucursalDestino: '' }) }} title="Movimiento">⚡</button>}
                      {puede('editar_productos') && <button className="btn btn-ghost btn-sm" onClick={() => abrirEtiqueta(p)} title="Etiqueta">🏷️</button>}
                      {puede('editar_productos') && <button className="btn btn-ghost btn-sm" onClick={() => abrirModal(p)} title="Editar">✏️</button>}
                      {puede('eliminar_productos') && <button className="btn btn-danger btn-sm" onClick={() => eliminar(p.id)} title="Eliminar">🗑️</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="table-wrap solo-desktop">
              <table>
                <thead><tr>{puede('editar_productos') && <th style={{ width: 34 }}><input type="checkbox" title="Seleccionar todos los de esta página (para etiquetas)" checked={filtrados.length > 0 && idsPagina().every(id => seleccion.has(id))} onChange={alternarPagina} /></th>}<th>CODIGO</th><th>PRODUCTO</th><th>CATEGORIA</th><th>BODEGA</th><th>PRECIO</th><th>UNIDADES</th><th>STOCK</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
                <tbody>
                  {filtrados.length === 0 ? <tr><td colSpan={10}><div className="empty-state"><div className="empty-icon">📦</div><div className="empty-text">{busqueda ? 'No encontrado' : 'Agrega tu primer producto'}</div></div></td></tr>
                  : filtrados.slice(pagProd * POR_PAGINA, (pagProd + 1) * POR_PAGINA).map(p => (
                    <tr key={p.id} className={'prod-row' + (seleccion.has(p.id) ? ' seleccionada' : '')}>
                      {puede('editar_productos') && <td><input type="checkbox" aria-label="Seleccionar para etiquetas" checked={seleccion.has(p.id)} onChange={() => alternarSel(p.id)} /></td>}
                      <td className="mono" style={{ fontSize: 12, color: 'var(--accent2)' }}>{p.codigo}</td>
                      <td><div style={{ fontWeight: 500 }}>{p.nombre}</div>{p.ubicacion && <div style={{ fontSize: 11, color: 'var(--muted)' }}>📍 {p.ubicacion}</div>}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.categoria || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{bodegas.find(b => b.id === p.bodega)?.nombre || '—'}</td>
                      <td><div className="amount" style={{ fontWeight: 700 }}>${((p.precio||0)*1.13).toFixed(2)}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>${(p.precio||0).toFixed(2)} s/IVA</div>{p.precioMayoreo > 0 && <div style={{ fontSize: 10, color: 'var(--accent2)', fontWeight: 700 }}>🏷️ Mayoreo ${(p.precioMayoreo*1.13).toFixed(2)}</div>}</td>
                      <td><div style={{ fontSize: 12, fontWeight: 600 }}>{p.unidad}</div>{(p.unidadesAdicionales||[]).length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>{p.unidadesAdicionales.map((u, i) => <span key={i} className="prod-tag" title={u.porDefecto ? 'Entra así al vender' : undefined}>{u.porDefecto ? '⭐' : '📦'} {u.nombre}</span>)}</div>}</td>
                      <td><span className={getStockClass(stockMostrar(p),p.min||0)}>{stockMostrar(p)}</span><div style={{ fontSize: 10, color: 'var(--muted)' }}>min: {p.min||0}</div>{porSucursal && desglose(p) && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, maxWidth: 180 }}>{desglose(p)}</div>}{porSucursal && verOtrasSuc && sucVista && sucVista !== SIN_ASIGNAR && <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 4, fontSize: 10, padding: '2px 7px' }} onClick={() => setOtrasModal(p)}>Otras sucursales</button>}{stockLegible(p) && <div style={{ fontSize: 10, color: 'var(--accent2)', marginTop: 2 }}>≈ {stockLegible(p)}</div>}</td>
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
          </>)}
          <Paginador total={filtrados.length} pagina={pagProd} setPagina={setPagProd} />
        </div>
        </>)}
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
              {/* TELÉFONO: una tarjeta por movimiento */}
              <div className="solo-movil">
                <div className="mcards">
                  {kardexFiltrado.slice(pagKardex * POR_PAGINA, (pagKardex + 1) * POR_PAGINA).map(k => {
                    const mov = TIPOS_MOVIMIENTO.find(m => m.value === k.tipo) || TIPOS_MOVIMIENTO[0]
                    const fecha = k.fecha?.toDate?.() || new Date()
                    const positivo = kPositivo(k)
                    return (
                      <div key={k.id} className="mcard">
                        <div className="mcard-top">
                          <div style={{ minWidth: 0 }}>
                            {!kardexModal && <div className="mcard-titulo">{k.productoNombre} <span className="mono" style={{ fontSize: 10, color: 'var(--accent2)' }}>{k.productoCodigo}</span></div>}
                            <div className="mcard-meta">{fecha.toLocaleDateString('es-SV')} {fecha.toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'})}</div>
                          </div>
                          <div className="mcard-monto" style={{ color: positivo ? '#00C296' : k.tipo === 'ajuste' ? 'var(--text)' : '#ef4444' }}>
                            {positivo ? '+' : k.tipo === 'ajuste' ? '=' : '-'}{k.cantidad}<small>{k.presentacion ? `📦 ${k.presentacion}` : k.unidad}</small>
                          </div>
                        </div>
                        <div className="mcard-mid">
                          <span className="mov-badge" style={{ background: mov.color+'15', color: mov.color, border: `1px solid ${mov.color}30` }}>{mov.icon} {mov.label}</span>
                          {porSucursal && <span style={{ fontSize: 11, color: 'var(--muted)' }}>🏪 {sucKardex(k)}</span>}
                          <span className="mono" style={{ fontSize: 12 }}><span style={{ color: 'var(--muted)' }}>{k.stockAntes}</span> → <strong>{k.stockDespues}</strong></span>
                        </div>
                        {(k.motivo || k.referencia) && <div className="mcard-meta" style={{ marginTop: 6 }}>{k.motivo}{k.motivo && k.referencia && ' · '}{k.referencia && <span className="mono">{k.referencia}</span>}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
              <table className="solo-desktop">
                <thead><tr><th>FECHA</th>{!kardexModal && <th>PRODUCTO</th>}<th>TIPO</th>{porSucursal && <th>SUCURSAL</th>}<th>CANT.</th><th>UNIDAD</th><th>ANTES</th><th>DESPUES</th><th>MOTIVO</th><th>REF.</th></tr></thead>
                <tbody>
                  {kardexFiltrado.slice(pagKardex * POR_PAGINA, (pagKardex + 1) * POR_PAGINA).map(k => {
                    const mov = TIPOS_MOVIMIENTO.find(m => m.value === k.tipo) || TIPOS_MOVIMIENTO[0]
                    const fecha = k.fecha?.toDate?.() || new Date()
                    return (
                      <tr key={k.id}>
                        <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fecha.toLocaleDateString('es-SV')}<br/><span style={{ fontSize: 10 }}>{fecha.toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'})}</span></td>
                        {!kardexModal && <td><div style={{ fontWeight: 600, fontSize: 13 }}>{k.productoNombre}</div><div className="mono" style={{ fontSize: 10, color: 'var(--accent2)' }}>{k.productoCodigo}</div></td>}
                        <td><span className="mov-badge" style={{ background: mov.color+'15', color: mov.color, border: `1px solid ${mov.color}30` }}>{mov.icon} {mov.label}</span></td>
                        {porSucursal && <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{sucKardex(k)}</td>}
                        <td className="mono" style={{ fontWeight: 700, color: kPositivo(k)?'#00C296':'#ef4444' }}>
                          {kPositivo(k)?'+':k.tipo==='ajuste'?'=':'-'}{k.cantidad}
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
                    <td><span className={getStockClass(stockMostrar(p),p.min||0)}>{stockMostrar(p)} {p.unidad}</span>{porSucursal && sucVista && <div style={{ fontSize: 10, color: 'var(--muted)' }}>total {p.stock||0}</div>}</td>
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
                    const valor = prods.reduce((s, p) => s + (p.precio||0)*stockPropio(p), 0)
                    return (
                      <tr key={b.id} className="prod-row">
                        <td style={{ fontWeight: 600 }}>🏭 {b.nombre}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{b.descripcion || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{b.responsable ? `👤 ${b.responsable}` : '—'}</td>
                        <td><span className="amount" style={{ fontWeight: 700, color: 'var(--accent)' }}>{prods.length}</span></td>
                        <td><span className="amount" style={{ fontWeight: 700, color: '#4A8FE8' }}>{fmt(valor)}</span></td>
                        <td><div className="action-btns">
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditandoBodega(b.id); setFormBodega({ nombre: b.nombre, descripcion: b.descripcion||'', responsable: b.responsable||'' }); setModalBodega(true) }}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={async () => { if (await orionConfirm('Eliminar bodega?', { tipo: 'warning', okLabel: 'Eliminar' })) deleteDoc(doc(db,'bodegas',b.id)) }}>🗑️</button>
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

      {/* ══ TRASLADOS ENTRE SUCURSALES (con confirmación de recibo) ══ */}
      {vista === 'traslados' && porSucursal && (<>
        <BackBtn />
        <div className="inv-toolbar" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Traslados entre sucursales</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Salen de una sucursal, viajan "en tránsito" y entran cuando la sucursal destino confirma el recibo.</div>
          </div>
          {puede('registrar_movimientos') && sucursales.length > 1 && <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { setTrasForm({ destino: '', notas: '', items: [], busq: '' }); setTrasModal(true) }}>+ Nuevo traslado</button>}
        </div>
        <div className="tras-kpis">
          <div className="tras-kpi"><b>{traslados.filter(t => t.estado === 'enviado').length}</b><span>en tránsito</span></div>
          <div className="tras-kpi"><b>{trasPendientes.length}</b><span>por recibir {sucPropia ? 'aquí' : ''}</span></div>
          <div className="tras-kpi"><b>{traslados.filter(t => t.estado === 'recibido' && t.conDiferencias).length}</b><span>con diferencias</span></div>
          <div className="tras-kpi"><b>{traslados.filter(t => t.estado === 'recibido').length}</b><span>recibidos</span></div>
        </div>
        <div className="inv-toolbar">
          <div className="inv-suc-tabs" style={{ marginBottom: 0 }}>
            {[['todos', 'Todos'], ['enviado', 'En tránsito'], ['recibido', 'Recibidos'], ['cancelado', 'Cancelados']].map(([k, l]) => (
              <button key={k} type="button" className={trasFiltro === k ? 'on' : ''} onClick={() => setTrasFiltro(k)}>{l}</button>
            ))}
          </div>
          <input className="input" style={{ maxWidth: 320, marginLeft: 'auto' }} placeholder="🔍 Número, sucursal o producto..." value={trasBusq} onChange={e => setTrasBusq(e.target.value)} />
        </div>
        {trasladosFiltrados.length === 0 ? (
          <div className="card"><div className="empty-state"><div className="empty-icon" aria-hidden="true">⇄</div><div className="empty-text">{traslados.length ? 'Nada con ese filtro' : 'Todavía no hay traslados'}</div></div></div>
        ) : (
          <div className="tras-lista">
            {trasladosFiltrados.map(t => {
              const unidades = r3((t.items || []).reduce((s, i) => s + (Number(i.cantidad) || 0), 0))
              return (
                <div key={t.id} className={`tras-card estado-${t.estado}`} onClick={() => abrirDetalleTraslado(t)}>
                  <div className="tras-card-top">
                    <span className="tras-num">{t.numero}</span>
                    <span className={`status-pill ${t.estado === 'recibido' ? (t.conDiferencias ? 'bajo' : 'activo') : t.estado === 'cancelado' ? 'agotado' : 'bajo'}`}><span className="dot"/>{etiquetaEstadoTras(t)}</span>
                  </div>
                  <div className="tras-card-body">
                  <div className="tras-ruta">
                    <span>{t.origenNombre}</span>
                    <svg width="26" height="12" viewBox="0 0 26 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6h22M18 1l5 5-5 5"/></svg>
                    <span>{t.destinoNombre}</span>
                  </div>
                  <div className="tras-meta">
                    <span>{(t.items || []).length} producto{(t.items || []).length === 1 ? '' : 's'} · {unidades} unidades</span>
                    <span>{fechaCorta(t.creadoEn)} · {t.creadoPor}</span>
                  </div>
                  <div className="tras-acciones" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" onClick={() => abrirDetalleTraslado(t)}>Ver detalle</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => imprimirComprobanteTraslado(t)} title="Comprobante para firmar">Comprobante</button>
                    {t.estado === 'enviado' && puedeRecibir(t) && <button className="btn btn-primary btn-sm" onClick={() => abrirDetalleTraslado(t, true)}>Recibir</button>}
                  </div>
                  </div>
                </div>
              )
            })}
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
              <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: '#f59e0b', fontSize: 16 }}>{stockMostrar(p)} {p.unidad}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Min: {p.min} · Pedir: {Math.max((p.min||0)*2-(p.stock||0),0)}</div></div>
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
          <div className="valor-stat"><div className="valor-stat-val" style={{ color: '#00C296' }}>{fmt(productos.reduce((s,p)=>s+(p.precio||0)*stockPropio(p),0))}</div><div className="valor-stat-label">Valor a Costo</div></div>
          <div className="valor-stat"><div className="valor-stat-val" style={{ color: '#4A8FE8' }}>{fmt(productos.reduce((s,p)=>s+(p.precio||0)*1.13*stockPropio(p),0))}</div><div className="valor-stat-label">Valor a Precio de Venta</div></div>
          <div className="valor-stat"><div className="valor-stat-val" style={{ color: '#8b5cf6' }}>{fmt(productos.reduce((s,p)=>s+(p.precio||0)*0.13*stockPropio(p),0))}</div><div className="valor-stat-label">Ganancia Estimada (IVA)</div></div>
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
                    <td className="mono">{stockPropio(p)} {p.unidad}</td>
                    <td className="amount">{fmt(p.precio)}</td>
                    <td className="amount">{fmt((p.precio||0)*1.13)}</td>
                    <td className="amount" style={{ fontWeight: 700, color: '#00C296' }}>{fmt((p.precio||0)*stockPropio(p))}</td>
                    <td className="amount" style={{ fontWeight: 700, color: '#4A8FE8' }}>{fmt((p.precio||0)*1.13*stockPropio(p))}</td>
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
                    const valor = prods.reduce((s, p) => s + (p.precio || 0) * stockPropio(p), 0)
                    const valorVenta = prods.reduce((s, p) => s + (p.precio || 0) * 1.13 * stockPropio(p), 0)
                    const margen = valor > 0 ? ((valorVenta - valor) / valor * 100) : 0
                    const bajos = prods.filter(p => stockPropio(p) < (p.min || 0)).length
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
                            <button className="btn btn-danger btn-sm" onClick={async () => { if (await orionConfirm('Eliminar categoria?', { tipo: 'warning', okLabel: 'Eliminar' })) deleteDoc(doc(db,'categorias',c.id)) }}>🗑️</button>
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

      {/* MODAL EXISTENCIAS EN OTRAS SUCURSALES (opción de Configuración) */}
      {otrasModal && (() => {
        const pr = productos.find(x => x.id === otrasModal.id) || otrasModal
        const mi = sucVista && sucVista !== SIN_ASIGNAR ? sucVista : sucursalActivaId()
        return (
          <div className="modal-overlay" onClick={() => setOtrasModal(null)}>
            <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
              <div className="modal-title">Existencias en otras sucursales</div>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>{pr.nombre} <span className="mono" style={{ fontSize: 11, color: 'var(--accent2)' }}>{pr.codigo}</span></div>
              <div className="table-wrap"><table>
                <thead><tr><th>SUCURSAL</th><th style={{ textAlign: 'right' }}>EXISTENCIA</th></tr></thead>
                <tbody>
                  {sucursales.map(s => { const n = stockEn(pr, s.id); return (
                    <tr key={s.id} style={{ opacity: s.id === mi ? 0.55 : 1 }}>
                      <td>{s.nombre}{s.id === mi ? ' (esta sucursal)' : ''}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: n > 0 ? '#00C296' : 'var(--muted)' }}>{n} {pr.unidad || ''}</td>
                    </tr>) })}
                  {enTransito(pr) > 0 && <tr><td style={{ color: 'var(--muted)' }}>En tránsito</td><td className="mono" style={{ textAlign: 'right', color: 'var(--muted)' }}>{enTransito(pr)}</td></tr>}
                  <tr><td style={{ fontWeight: 700 }}>Total empresa</td><td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{r3(pr.stock)}</td></tr>
                </tbody>
              </table></div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Para traerlo, pedí un traslado desde esa sucursal (Inventario → Traslados).</div>
              <div className="modal-actions"><button className="btn btn-primary" onClick={() => setOtrasModal(null)}>Cerrar</button></div>
            </div>
          </div>
        )
      })()}

      {/* MODAL NUEVO TRASLADO */}
      {trasModal && (() => {
        const destinoNombre = trasForm.destino ? nombreSuc(trasForm.destino) : ''
        const totalUnidades = r3(trasForm.items.reduce((s, i) => s + (Number(i.cantidad) || 0), 0))
        const q = trasForm.busq.trim().toLowerCase()
        const resultados = q.length >= 2 ? productos.filter(p => (p.nombre || '').toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q) || (p.codigoBarras || '') === q).slice(0, 8) : []
        const excedidos = trasForm.items.filter(i => (Number(i.cantidad) || 0) > stockEn(productos.find(p => p.id === i.productoId) || {}, trasOrigen))
        return (
        <div className="modal-overlay">
          <div className="modal tras-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Nuevo traslado</div>
            <div className="tras-ruta-grande">
              <div className="tras-ruta-caja"><small>Desde</small><b>{nombreSuc(trasOrigen)}</b></div>
              <svg width="34" height="14" viewBox="0 0 34 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 7h30M26 1l6 6-6 6"/></svg>
              <div className="tras-ruta-caja">
                <small>Hacia</small>
                <select className="input" value={trasForm.destino} onChange={e => setTrasForm(f => ({ ...f, destino: e.target.value }))}>
                  <option value="">Elegir sucursal…</option>
                  {sucursales.filter(s => s.id !== trasOrigen).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 14 }}>
              <label className="form-label">Agregar producto</label>
              <input className="input" autoFocus placeholder="Escribí el nombre, el código o escaneá el código de barras" value={trasForm.busq} onChange={e => setTrasForm(f => ({ ...f, busq: e.target.value }))} />
              {q.length >= 2 && (
                <div className="tras-resultados">
                  {resultados.length === 0 && <div className="tras-res" style={{ color: 'var(--muted)', cursor: 'default' }}>Sin resultados</div>}
                  {resultados.map(p => {
                    const enOrigen = stockEn(p, trasOrigen)
                    return (
                      <div key={p.id} className={`tras-res ${enOrigen <= 0 ? 'sin' : ''}`} onClick={() => { if (enOrigen > 0) agregarLineaTraslado(p) }}>
                        <div><div className="tras-res-nom">{p.nombre}</div><div className="mono" style={{ fontSize: 11, color: 'var(--accent2)' }}>{p.codigo}</div></div>
                        <div className="tras-res-stock">
                          <span>{nombreSuc(trasOrigen)}: <b>{enOrigen}</b></span>
                          {trasForm.destino && <span>{destinoNombre}: <b>{stockEn(p, trasForm.destino)}</b></span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {trasForm.items.length === 0 ? (
              <div className="tras-vacio">Todavía no hay productos en este traslado. Buscá arriba y tocá un resultado.</div>
            ) : (
              <div className="table-wrap" style={{ marginBottom: 10 }}>
                <table className="tras-tabla">
                  <thead><tr><th>PRODUCTO</th><th style={{ textAlign: 'right' }}>EN {nombreSuc(trasOrigen).toUpperCase()}</th><th>CANTIDAD</th><th></th></tr></thead>
                  <tbody>
                    {trasForm.items.map((it, i) => {
                      const p = productos.find(x => x.id === it.productoId) || {}
                      const disp = stockEn(p, trasOrigen)
                      const cant = Number(it.cantidad) || 0
                      const setCant = (v) => setTrasForm(f => ({ ...f, items: f.items.map((x, j) => j === i ? { ...x, cantidad: v } : x) }))
                      return (
                        <tr key={it.productoId} className={cant > disp ? 'excede' : ''}>
                          <td><div style={{ fontWeight: 600 }}>{it.nombre}</div><div className="mono" style={{ fontSize: 11, color: 'var(--accent2)' }}>{p.codigo}</div></td>
                          <td className="mono" style={{ textAlign: 'right' }}>{disp} {p.unidad || ''}</td>
                          <td>
                            <div className="tras-qty">
                              <button type="button" onClick={() => setCant(Math.max(0, r3(cant - 1)))}>−</button>
                              <input type="number" min="0" step="any" value={it.cantidad} onChange={e => setCant(e.target.value)} />
                              <button type="button" onClick={() => setCant(r3(cant + 1))}>+</button>
                            </div>
                            {cant > disp && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>Solo hay {disp}</div>}
                          </td>
                          <td><button className="btn btn-ghost btn-sm" onClick={() => setTrasForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}>✕</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="form-group"><label className="form-label">Notas</label><input className="input" placeholder="Quién lo lleva, motivo, referencia…" value={trasForm.notas} onChange={e => setTrasForm(f => ({ ...f, notas: e.target.value }))} /></div>
            <div className="tras-resumen">
              <span>{trasForm.items.length} producto{trasForm.items.length === 1 ? '' : 's'} · <b>{totalUnidades}</b> unidades</span>
              {destinoNombre ? <span>{nombreSuc(trasOrigen)} → {destinoNombre}</span> : <span style={{ color: 'var(--muted)' }}>Falta elegir el destino</span>}
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setTrasModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={crearTraslado} disabled={trasGuardando || !trasForm.destino || !trasForm.items.length || excedidos.length > 0 || totalUnidades <= 0}>{trasGuardando ? 'Enviando...' : 'Enviar traslado'}</button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* MODAL DETALLE DE TRASLADO (línea de tiempo, líneas, recibo parcial) */}
      {trasDetalle && (() => {
        const t = traslados.find(x => x.id === trasDetalle.id) || trasDetalle
        const items = t.items || []
        const enviadas = r3(items.reduce((s, i) => s + (Number(i.cantidad) || 0), 0))
        const recibidasTot = r3(items.reduce((s, i) => s + (Number(trasRecibiendo ? trasRecibidas[i.productoId] : i.recibida ?? (t.estado === 'recibido' ? i.cantidad : 0)) || 0), 0))
        const pasos = [
          { k: 'enviado', t: 'Enviado', por: t.creadoPor, en: fechaLarga(t.creadoEn), hecho: true },
          { k: 'transito', t: 'En tránsito', por: '', en: t.estado === 'enviado' ? 'Esperando confirmación de ' + t.destinoNombre : '', hecho: true, activo: t.estado === 'enviado' },
          t.estado === 'cancelado'
            ? { k: 'cancelado', t: 'Cancelado', por: t.canceladoPor, en: fechaLarga(t.canceladoEn), hecho: true, malo: true }
            : { k: 'recibido', t: t.conDiferencias ? 'Recibido con diferencias' : 'Recibido', por: t.recibidoPor, en: fechaLarga(t.recibidoEn), hecho: t.estado === 'recibido' },
        ]
        return (
        <div className="modal-overlay">
          <div className="modal tras-modal" onClick={e => e.stopPropagation()}>
            <div className="tras-det-head">
              <div>
                <div className="modal-title" style={{ margin: 0 }}>Traslado {t.numero}</div>
                <div className="tras-ruta" style={{ marginTop: 4 }}><span>{t.origenNombre}</span><svg width="26" height="12" viewBox="0 0 26 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6h22M18 1l5 5-5 5"/></svg><span>{t.destinoNombre}</span></div>
              </div>
              <span className={`status-pill ${t.estado === 'recibido' ? (t.conDiferencias ? 'bajo' : 'activo') : t.estado === 'cancelado' ? 'agotado' : 'bajo'}`}><span className="dot"/>{etiquetaEstadoTras(t)}</span>
            </div>
            <div className="tras-timeline">
              {pasos.map(p => (
                <div key={p.k} className={`tras-paso ${p.hecho ? 'hecho' : ''} ${p.activo ? 'activo' : ''} ${p.malo ? 'malo' : ''}`}>
                  <span className="tras-paso-dot"/>
                  <div><b>{p.t}</b>{(p.por || p.en) && <small>{[p.por, p.en].filter(Boolean).join(' · ')}</small>}</div>
                </div>
              ))}
            </div>
            {t.notas && <div className="tras-notas"><b style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginRight: 8 }}>Notas</b>{t.notas}</div>}
            <div className="table-wrap" style={{ marginBottom: 10 }}>
              <table className="tras-tabla">
                <thead><tr><th>PRODUCTO</th><th style={{ textAlign: 'right' }}>ENVIADO</th><th style={{ textAlign: 'right' }}>RECIBIDO</th><th style={{ textAlign: 'right' }}>DIFERENCIA</th></tr></thead>
                <tbody>
                  {items.map(i => {
                    const env = Number(i.cantidad) || 0
                    const rec = trasRecibiendo ? (Number(trasRecibidas[i.productoId]) || 0) : (t.estado === 'recibido' ? (i.recibida ?? env) : null)
                    const dif = rec === null ? null : r3(env - rec)
                    return (
                      <tr key={i.productoId} className={dif ? 'excede' : ''}>
                        <td><div style={{ fontWeight: 600 }}>{i.nombre}</div><div className="mono" style={{ fontSize: 11, color: 'var(--accent2)' }}>{i.codigo}</div></td>
                        <td className="mono" style={{ textAlign: 'right' }}>{env} {i.unidad}</td>
                        <td style={{ textAlign: 'right' }}>
                          {trasRecibiendo
                            ? <input className="input tras-rec-input" type="number" min="0" max={env} step="any" value={trasRecibidas[i.productoId] ?? ''} onChange={e => setTrasRecibidas(r => ({ ...r, [i.productoId]: e.target.value }))} />
                            : <span className="mono">{rec === null ? '—' : rec}</span>}
                        </td>
                        <td className="mono" style={{ textAlign: 'right', color: dif ? '#ef4444' : 'var(--muted)' }}>{dif === null ? '—' : dif === 0 ? '0' : `−${dif}`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="tras-resumen">
              <span>{items.length} producto{items.length === 1 ? '' : 's'} · enviadas <b>{enviadas}</b>{(trasRecibiendo || t.estado === 'recibido') && <> · recibidas <b>{recibidasTot}</b></>}</span>
              {trasRecibiendo && enviadas - recibidasTot > 0 && <span style={{ color: '#ef4444' }}>Faltan {r3(enviadas - recibidasTot)}: se registran como faltante en {t.destinoNombre}</span>}
            </div>
            <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => imprimirComprobanteTraslado(t)}>Imprimir comprobante</button>
              {t.estado === 'enviado' && puedeCancelar(t) && !trasRecibiendo && <button className="btn btn-ghost" style={{ color: '#ef4444' }} onClick={() => cerrarTraslado(t, 'cancelar')}>Cancelar traslado</button>}
              <span style={{ flex: 1 }} />
              <button className="btn btn-ghost" onClick={() => { setTrasDetalle(null); setTrasRecibiendo(false) }}>{trasRecibiendo ? 'Volver' : 'Cerrar'}</button>
              {t.estado === 'enviado' && puedeRecibir(t) && !trasRecibiendo && <button className="btn btn-primary" onClick={() => iniciarRecibo(t)}>Recibir</button>}
              {trasRecibiendo && <button className="btn btn-primary" onClick={() => cerrarTraslado(t, 'recibir', trasRecibidas)} disabled={trasGuardando}>{trasGuardando ? 'Guardando...' : (enviadas - recibidasTot > 0 ? 'Confirmar recibo con diferencias' : 'Confirmar recibo completo')}</button>}
            </div>
          </div>
        </div>
        )
      })()}

      {/* MODAL MOVIMIENTO */}
      {movModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">⚡ Registrar Movimiento</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}><strong style={{ color: 'var(--text)' }}>{movModal.nombre}</strong> · Stock: <strong>{movModal.stock} {movModal.unidad}</strong>
              {porSucursal && (() => { const pm = productos.find(p => p.id === movModal.id) || movModal; return <div style={{ marginTop: 4, fontSize: 12 }}>{sucursales.map(s => <span key={s.id} style={{ marginRight: 10 }}>{s.nombre}: <b>{stockEn(pm, s.id)}</b></span>)}{sinAsignar(pm) !== 0 && <span>Sin asignar: <b>{sinAsignar(pm)}</b></span>}</div> })()}
            </div>
            <div className="cols-1-movil" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
              {/* 'traslado' solo con inventario por sucursal: sin el módulo restaba del total sin sumar en ningún destino */ TIPOS_MOVIMIENTO.filter(m => !['venta','compra', ...(porSucursal ? [] : ['traslado'])].includes(m.value)).map(m => (
                <div key={m.value} onClick={() => setMovForm(f => ({ ...f, tipo: m.value }))}
                  style={{ padding: '10px 8px', borderRadius: 10, textAlign: 'center', cursor: 'pointer', border: `1.5px solid ${movForm.tipo===m.value?m.color:'var(--border)'}`, background: movForm.tipo===m.value?m.color+'15':'var(--surface2)', color: movForm.tipo===m.value?m.color:'var(--muted)', fontSize: 12, fontWeight: 600, transition: 'all 0.15s' }}>
                  {m.icon} {m.label}
                </div>
              ))}
            </div>
            {movForm.tipo === 'traslado' && (() => { const pm = productos.find(p => p.id === movModal.id) || movModal; return (
              <div className="form-grid" style={{ marginBottom: 12 }}>
                <div className="form-group"><label className="form-label">Sucursal Origen</label><select className="input" value={sucPropia || movForm.sucursalOrigen} disabled={!!sucPropia} onChange={e => setMovForm(f=>({...f,sucursalOrigen:e.target.value}))}><option value="">Seleccionar...</option>{sucursales.map(s=><option key={s.id} value={s.id}>{s.nombre} ({stockEn(pm, s.id)})</option>)}{sinAsignar(pm) > 0 && <option value={SIN_ASIGNAR}>Sin asignar ({sinAsignar(pm)})</option>}</select></div>
                <div className="form-group"><label className="form-label">Sucursal Destino</label><select className="input" value={movForm.sucursalDestino} onChange={e => setMovForm(f=>({...f,sucursalDestino:e.target.value}))}><option value="">Seleccionar...</option>{sucursales.map(s=><option key={s.id} value={s.id}>{s.nombre} ({stockEn(pm, s.id)})</option>)}</select></div>
              </div>
            ) })()}
            {porSucursal && movForm.tipo !== 'traslado' && (() => { const pm = productos.find(p => p.id === movModal.id) || movModal; return (
              <div className="form-group"><label className="form-label">Sucursal del movimiento</label>
                <select className="input" value={sucMovimiento} disabled={!!sucPropia} onChange={e => setMovForm(f=>({...f,sucursal:e.target.value}))}>
                  {sucursales.map(s=><option key={s.id} value={s.id}>{s.nombre} ({stockEn(pm, s.id)} {movModal.unidad})</option>)}
                  {sinAsignar(pm) !== 0 && <option value={SIN_ASIGNAR}>Sin asignar ({sinAsignar(pm)} {movModal.unidad})</option>}
                </select>
              </div>
            ) })()}
            <div className="form-grid">
              <div className="form-group"><label className="form-label">{movForm.tipo==='ajuste'?(porSucursal?'Nuevo stock en la sucursal':'Nuevo Stock Total'):'Cantidad'}</label><input className="input" type="number" min="0" step="0.01" placeholder="0" value={movForm.cantidad} onChange={e=>setMovForm(f=>({...f,cantidad:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">Unidad</label><select className="input" value={movForm.unidad} onChange={e=>setMovForm(f=>({...f,unidad:e.target.value}))}><option value={movModal.unidad}>{movModal.unidad} (principal)</option>{(movModal.unidadesAdicionales||[]).map((u,i)=><option key={i} value={u.nombre}>{u.nombre}</option>)}</select></div>
            </div>
            <div className="form-group"><label className="form-label">Motivo</label><input className="input" placeholder="Compra proveedor, Merma..." value={movForm.motivo} onChange={e=>setMovForm(f=>({...f,motivo:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Referencia</label><input className="input" placeholder="OC-001, FE-000023..." value={movForm.referencia} onChange={e=>setMovForm(f=>({...f,referencia:e.target.value}))}/></div>
            {movForm.cantidad && (() => {
              const presSel = (movModal.unidadesAdicionales || []).find(u => u.nombre === movForm.unidad)
              const factor = presSel ? (Number(presSel.factor) || 1) : 1
              const cantBase = (parseFloat(movForm.cantidad) || 0) * factor
              // Con inventario por sucursal el "actual" es la cubeta afectada (origen en un traslado)
              const pm = productos.find(p => p.id === movModal.id) || movModal
              const cubeta = movForm.tipo === 'traslado' ? (sucPropia || movForm.sucursalOrigen || SIN_ASIGNAR) : sucMovimiento
              const actual = porSucursal ? stockEn(pm, cubeta) : (movModal.stock || 0)
              const nuevo = movForm.tipo === 'ajuste'
                ? cantBase
                : ['entrada','devolucion'].includes(movForm.tipo)
                  ? actual + cantBase
                  : Math.max(0, actual - cantBase)
              return (
                <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginTop: 8, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{porSucursal ? `${nombreSuc(cubeta)}: ` : 'Stock actual: '}<strong>{actual}</strong></span>
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
          <div className="modal" style={{ maxWidth: 400, maxHeight: '94vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h3 style={{ margin: 0 }}>🏷️ Etiqueta de código de barras</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEtiquetaModal(null)} title="Cerrar" aria-label="Cerrar">✕</button>
            </div>
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
              <label className="form-label">Formato</label>
              <select className="input" value={etiquetaFormato} onChange={e => { setEtiquetaFormato(e.target.value); try { localStorage.setItem('orion_etiqueta_formato', e.target.value) } catch { /* sin almacenamiento */ } }}>
                <option value="hoja">Hoja de etiquetas 48 mm (impresora normal)</option>
                <option value="joyeria">Colgante de joyería 56 × 13 mm (Zebra)</option>
              </select>
            </div>
            {etiquetaFormato === 'joyeria' && (
              <div style={{ marginTop: 4 }}>
                <div className="form-group">
                  <label className="form-label">Código en la etiqueta</label>
                  <select className="input" value={etiquetaTipo} onChange={e => { setEtiquetaTipo(e.target.value); try { localStorage.setItem('orion_etiqueta_tipo', e.target.value) } catch { /* sin almacenamiento */ } }}>
                    <option value="code128">Barras (Code128) con el SKU</option>
                    <option value="qr">QR con el SKU (lector 2D)</option>
                  </select>
                </div>
                {etiquetaPrevJoy && <iframe title="Vista previa del colgante" sandbox="" srcDoc={etiquetaPrevJoy} style={{ width: '100%', height: 96, border: '1px solid var(--border)', borderRadius: 8, background: '#ddd' }} />}
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Panel izquierdo: marca, precio con IVA y SKU · panel derecho: el código. La tira del centro va en blanco.</div>
                {etiquetaTipo === 'code128' && !cabeCode128(etiquetaModal.codigo || etiquetaCodigo) && (
                  <div style={{ fontSize: 11, color: '#b45309', background: 'rgba(245,158,11,.12)', borderRadius: 6, padding: '4px 8px', marginTop: 4 }}>⚠️ El SKU <b>{etiquetaModal.codigo || etiquetaCodigo}</b> es largo para barras en un panel de 20 mm: el lector puede no leerlo. Usa <b>QR</b> (el lector 2D lo lee sin problema) o un SKU más corto.</div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={zebraOcupado} onClick={() => imprimirZebra(true)}>🧪 Prueba en Zebra (barras + QR)</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setZebraAjustar(v => !v)}>📐 Ajustar posición</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => pdfJoyeria(false)}>📄 PDF</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={imprimirPruebaJoyeria} title="Hoja de 4 variantes por el cuadro de impresión de Chrome">🌐 Prueba por Chrome</button>
                </div>
                {zebraAjustar && (
                  <div style={{ marginTop: 8, padding: 8, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Corrimientos de la Zebra de este equipo (mm)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {[['arribaMm', 'Todo hacia arriba'], ['derechaMm', 'Todo a la derecha'], ['panelIzqMm', 'Precio a la izquierda'], ['panelAbajoMm', 'Precio hacia abajo'], ['barrasIzqMm', 'Código a la izquierda'], ['barrasAbajoMm', 'Código hacia abajo'], ['oscuridad', 'Oscuridad (0–30)']].map(([k, t]) => (
                        <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ color: 'var(--muted)' }}>{t}</span>
                          <input className="input" type="number" step={k === 'oscuridad' ? 1 : 0.5} value={zebraAjustes[k] ?? ''} onChange={e => cambiarAjusteZebra(k, e.target.value)} />
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setZebraAjustes({ ...AJUSTES_ZEBRA_DEFECTO }); guardarAjustesZebra({ ...AJUSTES_ZEBRA_DEFECTO }) }}>Volver a los de fábrica</button>
                      <span style={{ color: 'var(--muted)', alignSelf: 'center' }}>Se guardan en esta computadora. Usa "Prueba en Zebra" para verlos.</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Cantidad de etiquetas a imprimir</label>
              <input className="input" type="number" min="1" max="200" value={etiquetaCopias}
                onChange={e => setEtiquetaCopias(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => setEtiquetaModal(null)}>Cancelar</button>
              {etiquetaFormato === 'joyeria'
                ? <>
                    <button className="btn btn-ghost" onClick={imprimirEtiqueta} title="Por el cuadro de impresión de Chrome (de una en una)">🌐 Por Chrome</button>
                    <button className="btn btn-primary" disabled={zebraOcupado} onClick={() => imprimirZebra(false)}>{zebraOcupado ? 'Enviando…' : '🦓 Imprimir en Zebra'}</button>
                  </>
                : <button className="btn btn-primary" onClick={imprimirEtiqueta}>🖨️ Imprimir</button>}
            </div>
          </div>
        </div>
      )}

      {/* MODAL ETIQUETAS DE VARIOS PRODUCTOS */}
      {loteModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560, maxHeight: '94vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h3 style={{ margin: 0 }}>🏷️ Etiquetas de {loteModal.length} producto{loteModal.length === 1 ? '' : 's'}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLoteModal(null)} title="Cerrar" aria-label="Cerrar">✕</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Pon cuántas etiquetas quieres de cada uno. Los productos sin código de barras reciben uno nuevo que se guarda al imprimir.</div>
            <div style={{ maxHeight: '42vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              {loteModal.map((it, i) => (
                <div key={it.p.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 72px 70px 30px', gap: 8, alignItems: 'center', padding: '6px 8px', borderBottom: i < loteModal.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.p.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}><span className="mono">{it.p.codigo || it.cod}</span>{!it.p.codigoBarras && <> · código nuevo {it.cod}</>}</div>
                  </div>
                  <div className="amount" style={{ fontWeight: 700, fontSize: 13 }}>${((it.p.precio || 0) * 1.13).toFixed(2)}</div>
                  <input className="input" type="number" min="1" max="200" value={it.copias} style={{ padding: '4px 6px' }}
                    onChange={e => setLoteModal(l => l.map((x, j) => j === i ? { ...x, copias: Math.max(1, Math.min(200, parseInt(e.target.value) || 1)) } : x))} />
                  <button type="button" className="btn btn-ghost btn-sm" title="Quitar de la lista" onClick={() => { const resto = loteModal.filter((_, j) => j !== i); if (resto.length) setLoteModal(resto); else cerrarLote() }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Formato</label>
                <select className="input" value={etiquetaFormato} onChange={e => { setEtiquetaFormato(e.target.value); try { localStorage.setItem('orion_etiqueta_formato', e.target.value) } catch { /* sin almacenamiento */ } }}>
                  <option value="hoja">Hoja de etiquetas 48 mm</option>
                  <option value="joyeria">Colgante de joyería 56 × 13 mm (Zebra)</option>
                </select>
              </div>
              {etiquetaFormato === 'joyeria' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Código en la etiqueta</label>
                  <select className="input" value={etiquetaTipo} onChange={e => { setEtiquetaTipo(e.target.value); try { localStorage.setItem('orion_etiqueta_tipo', e.target.value) } catch { /* sin almacenamiento */ } }}>
                    <option value="code128">Barras (Code128) con el SKU</option>
                    <option value="qr">QR con el SKU (lector 2D)</option>
                  </select>
                </div>
              )}
            </div>
            {etiquetaFormato === 'joyeria' && etiquetaTipo === 'code128' && loteModal.some(it => !cabeCode128(it.p.codigo || it.cod)) && (
              <div style={{ fontSize: 11, color: '#b45309', background: 'rgba(245,158,11,.12)', borderRadius: 6, padding: '4px 8px', marginTop: 8 }}>⚠️ {loteModal.filter(it => !cabeCode128(it.p.codigo || it.cod)).length} SKU son largos para barras en 20 mm y el lector puede no leerlos. Con <b>QR</b> salen bien todos.</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Total: <b>{totalLote()}</b> etiqueta{totalLote() === 1 ? '' : 's'}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" onClick={() => setLoteModal(null)}>Cancelar</button>
                {etiquetaFormato === 'joyeria' && <button className="btn btn-ghost" disabled={zebraOcupado} onClick={() => imprimirLote('pdf')}>📄 PDF</button>}
                <button className="btn btn-ghost" disabled={zebraOcupado} onClick={() => imprimirLote('chrome')}>🌐 Por Chrome</button>
                {etiquetaFormato === 'joyeria' && <button className="btn btn-primary" disabled={zebraOcupado} onClick={() => imprimirLote('zebra')}>{zebraOcupado ? 'Enviando…' : '🦓 Imprimir en Zebra'}</button>}
              </div>
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
                <div className="form-group"><label className="form-label">CODIGO *</label><input className="input" autoFocus placeholder="P001" value={f.codigo} onChange={e=>setForm({...f,codigo:e.target.value})}/></div>
                {/* Se despliegan las categorías que ya existen (registradas y las que
                    están en uso), pero se puede escribir una nueva: así no se inventan
                    tres formas de escribir "LACTEOS" y tampoco hay que salir a crearla. */}
                <div className="form-group">
                  <label className="form-label">CATEGORIA</label>
                  <input className="input" list="categorias-orion" placeholder="Elegí una o escribí la nueva"
                    value={f.categoria} onChange={e=>setForm({...f,categoria:e.target.value})} />
                  <datalist id="categorias-orion">
                    {opcionesCategoria.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className="form-group"><label className="form-label">NOMBRE *</label><input className="input" placeholder="Nombre del producto" value={f.nombre} onChange={e=>setForm({...f,nombre:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">PRECIO (sin IVA) *</label><input className="input" type="number" step="0.01" placeholder="0.00" value={f.precio} onChange={e=>setForm({...f,precio:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">DESCUENTO (%)</label><input className="input" type="number" min="0" max="100" placeholder="0" value={f.descuento} onChange={e=>setForm({...f,descuento:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">PRECIO MAYOREO (sin IVA)</label><input className="input" type="number" step="0.01" placeholder="Vacío = sin precio de mayoreo" value={f.precioMayoreo} onChange={e=>setForm({...f,precioMayoreo:e.target.value})}/></div>
                {parseFloat(f.precioMayoreo) > 0 && <div className="iva-hint">🏷️ Mayoreo con IVA: <strong style={{ color: 'var(--accent2)' }}>${(parseFloat(f.precioMayoreo)*1.13).toFixed(2)}</strong> · se aplica solo a clientes marcados como mayoristas</div>}
                {f.precio && <div className="iva-hint">💡 Precio con IVA: <strong style={{ color: 'var(--accent)' }}>${precioFinal(f.precio,f.descuento).toFixed(2)}</strong></div>}
              </div>

              {/* COLUMNA 2 — Unidades de medida */}
              <div className="prod-col">
                <div className="section-divider">UNIDADES DE MEDIDA</div>
                <div className="form-group">
                  <label className="form-label">UNIDAD PRINCIPAL *</label>
                  {/* Texto libre con sugerencias, NO una lista cerrada: cada negocio vende
                      con su propia unidad (cuarta de crema, guacal de quesillo, manojo).
                      Antes era un <select>, y una unidad que no estuviera en la lista —la
                      que entró por Excel, por ejemplo— se cambiaba sola al guardar. */}
                  <input className="input" list="unidades-orion" placeholder="Unidad, Libra, Onza, Cuarta…"
                    value={f.unidad} onChange={e=>setForm({...f,unidad:e.target.value})} />
                  <datalist id="unidades-orion">
                    {UNIDADES_SISTEMA.map(u => <option key={u.nombre} value={u.nombre}>{u.grupo}</option>)}
                  </datalist>
                </div>
                {/* Por peso / fracciones: el queso se registra por Libra y en la caja se toca ¼, ½ o ¾ (sin onzas ni presentaciones) */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', background: f.vendeFraccion ? 'rgba(200,164,77,0.12)' : 'var(--surface2)', border: `1.5px solid ${f.vendeFraccion ? 'rgba(200,164,77,0.55)' : 'var(--border)'}`, borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                  <input type="checkbox" checked={f.vendeFraccion === true} onChange={e => setForm({ ...f, vendeFraccion: e.target.checked })} style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0 }} />
                  <span>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>Se vende por peso o en fracciones</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4, marginTop: 2 }}>Para queso, crema o granos: la unidad es la <strong>Libra</strong> (o la botella) y en la caja aparecen los botones ¼ · ½ · ¾ · 1. El stock y el precio van por esa unidad, sin presentaciones.</span>
                  </span>
                </label>
                <div className="form-group"><label className="form-label">STOCK *</label><input className="input" type="number" step="any" placeholder="0" value={f.stock} disabled={porSucursal && !!editando} onChange={e=>setForm({...f,stock:e.target.value})}/>
                  {porSucursal && (editando
                    ? <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Por sucursal: se cambia desde ⚡ Movimientos.</div>
                    : <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Entra a la sucursal <b>{nombreSuc(sucursalActivaId() || sucursales[0]?.id)}</b>.</div>)}
                </div>
                <div className="form-group"><label className="form-label">STOCK MINIMO</label><input className="input" type="number" step="any" placeholder="0" value={f.min} onChange={e=>setForm({...f,min:e.target.value})}/></div>
                <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>📦 Unidades Adicionales <span className="tag-opcional">OPCIONAL</span></div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setForm(f=>({...f,unidadesAdicionales:[...(f.unidadesAdicionales||[]),{nombre:'',factor:1,precio:''}]}))}>+ Agregar</button>
                  </div>
                  {(f.unidadesAdicionales||[]).length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>Sin unidades adicionales</div>}
                  {(f.unidadesAdicionales||[]).map((u,idx)=>(
                    <div key={idx} className="unidad-adicional-row">
                      <div className="ua-campo"><div className="ua-et">Nombre</div><input className="input" placeholder="Libra, Caja, Guacal…" value={u.nombre} onChange={e=>{const n=[...(f.unidadesAdicionales||[])];n[idx]={...n[idx],nombre:e.target.value};setForm({...f,unidadesAdicionales:n})}}/></div>
                      <div className="ua-campo"><div className="ua-et">Factor</div><input className="input" type="number" inputMode="decimal" placeholder="10" value={u.factor} onChange={e=>{const n=[...(f.unidadesAdicionales||[])];n[idx]={...n[idx],factor:parseFloat(e.target.value)||1};setForm({...f,unidadesAdicionales:n})}}/></div>
                      <div className="ua-campo"><div className="ua-et">Precio s/IVA</div><input className="input" type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={u.precio} onChange={e=>{const n=[...(f.unidadesAdicionales||[])];n[idx]={...n[idx],precio:e.target.value};setForm({...f,unidadesAdicionales:n})}}/></div>
                      {/* Código propio de la presentación (la caja suele traer el suyo): al escanearlo en el POS entra directo como caja */}
                      <div className="ua-campo"><div className="ua-et">Cód. barras (opcional)</div><input className="input" inputMode="numeric" placeholder="El de la caja" value={u.codigoBarras || ''} onChange={e=>{const n=[...(f.unidadesAdicionales||[])];n[idx]={...n[idx],codigoBarras:e.target.value};setForm({...f,unidadesAdicionales:n})}}/></div>
                      <button className="btn btn-danger btn-sm" style={{ height: 38, padding: 0 }} title="Quitar esta unidad" onClick={()=>setForm(f=>({...f,unidadesAdicionales:f.unidadesAdicionales.filter((_,i)=>i!==idx)}))}>✕</button>
                    </div>
                  ))}
                  {/* Presentación que entra al vender: lo que casi siempre se vende en grupo (3 sobres de café por $0.25)
                      entra así al tocar o escanear el producto; el cajero cambia a suelto o caja desde la línea. */}
                  {(() => {
                    const validas = (f.unidadesAdicionales || []).map((u, idx) => ({ u, idx })).filter(x => x.u.nombre && x.u.factor > 1)
                    if (!validas.length) return null
                    const sel = validas.find(x => x.u.porDefecto === true)
                    const marcar = (i) => setForm({ ...f, unidadesAdicionales: (f.unidadesAdicionales || []).map((u, k) => { const r = { ...u }; delete r.porDefecto; return k === i ? { ...r, porDefecto: true } : r }) })
                    return (
                      <div className="ua-defecto">
                        <div className="ua-et" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>Al tocar el producto en la caja entra como</div>
                        <select className="input" style={{ height: 38, fontSize: 14, padding: '6px 10px' }} value={sel ? String(sel.idx) : ''} onChange={e => marcar(e.target.value === '' ? -1 : Number(e.target.value))}>
                          <option value="">{f.unidad || 'Unidad'} (unidad principal)</option>
                          {validas.map(x => <option key={x.idx} value={x.idx}>{x.u.nombre} ({x.u.factor} {f.unidad || 'u'})</option>)}
                        </select>
                        {sel && <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4, marginTop: 4 }}>En la venta entra directo como <strong>{sel.u.nombre}</strong> y descuenta {sel.u.factor} {f.unidad || 'u'} del stock. El cajero lo cambia a suelto o a otra presentación desde la línea.</div>}
                      </div>
                    )
                  })()}
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
                        {' '}· al público <strong>${(Math.round(precioPres * 1.13 * 100) / 100).toFixed(2)}</strong> con IVA
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
                <div className="form-group"><label className="form-label">FECHA VENCIMIENTO</label><input className="input" type="date" value={f.fechaVencimiento} onChange={e=>setForm({...f,fechaVencimiento:e.target.value})}/>
                  {/* Lotes que entraron por Compras con fecha "Vence": cuántas unidades vencen en cada fecha */}
                  {editando && lotesDe(productos.find(p => p.id === editando)).length > 0 && (
                    <div className="iva-hint" style={{ marginTop: 6, fontSize: 12 }}>📅 Lotes: {lotesDe(productos.find(p => p.id === editando)).map(l => `${l.qty} vencen el ${l.vence}`).join(' · ')}<br/><span style={{ color: 'var(--muted)' }}>La fecha de arriba es la del lote más próximo; la venta descuenta primero de ese lote.</span></div>
                  )}
                </div>
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