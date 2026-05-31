import React, { useState, useEffect } from 'react'
import BuscadorActividad from '../components/BuscadorActividad'
import SelectorDepartamento from '../components/SelectorDepartamento'
import { buildComplemento } from '../data/departamentosMunicipios'
import { db } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, getDoc,
  getDocs, query, where
} from 'firebase/firestore'
import { useAuth } from '../AuthContext'
import { usePermisos } from '../PermisosContext'

const TIPOS_DTE = [
  { codigo: 'FE',   nombre: 'Factura de Consumidor Final',  desc: 'Para personas sin NRC',   color: '#00d4aa' },
  { codigo: 'CCF',  nombre: 'Comprobante de Credito Fiscal', desc: 'Para empresas con NRC',   color: '#4f8cff' },
  { codigo: 'NC',   nombre: 'Nota de Credito',              desc: 'Anular o ajustar factura', color: '#f59e0b' },
  { codigo: 'ND',   nombre: 'Nota de Debito',               desc: 'Cobros adicionales',       color: '#8b5cf6' },
  { codigo: 'FEX',  nombre: 'Factura de Exportacion',       desc: 'Ventas al extranjero',     color: '#ec4899' },
  { codigo: 'NR',   nombre: 'Nota de Remision',             desc: 'Envio sin cobro',          color: '#6b7280' },
]

const ESTADOS_PAGO = [
  { value: 'pagada',    label: 'Pagada',    color: '#00d4aa' },
  { value: 'pendiente', label: 'Pendiente', color: '#f59e0b' },
  { value: 'vencida',   label: 'Vencida',   color: '#ef4444' },
  { value: 'anulada',   label: 'Anulada',   color: '#6b7280' },
]

// Tipos con plazo de 24 horas para anulación
const TIPOS_24H = ['CCF', 'NC', 'ND']
// Tipos con plazo de 3 meses para anulación
const TIPOS_3M  = ['FE', 'FEX', 'FSEE', 'NR']

const MOTIVOS_ANULACION = [
  { value: '1', label: '01 — Error en monto' },
  { value: '2', label: '02 — Error en datos del receptor' },
  { value: '3', label: '03 — Error en descripcion de bienes/servicios' },
  { value: '4', label: '04 — Operacion no realizada' },
  { value: '5', label: '05 — Otro' },
]

// Devuelve la fecha actual en zona America/El_Salvador (UTC-6), formato YYYY-MM-DD.
// Necesario porque new Date().toISOString() devuelve UTC, lo que en horarios
// nocturnos SV (después de 6PM) genera fechas del día siguiente.
function fechaSV() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
}

const emptyForm = {
  tipoDte: 'FE', cliente: '', nit: '', nrc: '', direccion: '',
  descripcion: '', subtotal: '', iva: '', total: '',
  estadoPago: 'pagada',
  fechaEmision: fechaSV(),
  fechaVencimiento: '', notas: '',
}

const emptyAnulacion = {
  motivo: '1',
  motivoDetalle: '',
  tipoInvalidacion: '2',
  codigoGeneracionReemplazo: '',
  // Solicitante de la anulación (requerido por MH cuando la factura no tiene NIT/DUI)
  solicitanteNombre: '',
  solicitanteTipoDoc: '13',  // 13=DUI por defecto
  solicitanteNumDoc: '',
}

const factStyles = `
  .fact-resumen { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 20px; }
  @media (max-width: 900px) { .fact-resumen { grid-template-columns: repeat(2,1fr); } }

  .resumen-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; padding: 18px 20px; box-shadow: 0 4px 20px var(--shadow2); position: relative; overflow: hidden; }
  .resumen-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background: var(--rc-color, var(--accent)); }
  .resumen-val { font-size: 24px; font-weight: 800; font-family: var(--mono); margin: 6px 0 3px; letter-spacing: -1px; }
  .resumen-label { font-size: 11px; color: var(--muted); letter-spacing: 0.8px; font-weight: 700; text-transform: uppercase; }
  .resumen-sub { font-size: 12px; color: var(--muted); }

  .filtros-bar { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; align-items: center; }
  .filtros-bar .input { max-width: 280px; }
  .filter-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
  .filter-tab { padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; color: var(--muted); transition: all 0.15s; border: 1.5px solid var(--border); background: transparent; font-family: var(--font); }
  .filter-tab.active { background: rgba(0,212,170,0.12); color: var(--accent); border-color: rgba(0,212,170,0.3); }
  .filter-tab:hover { color: var(--text); border-color: var(--border2); }

  .tipo-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 6px; font-family: var(--mono); letter-spacing: 0.5px; border: 1.5px solid; }

  .estado-pago { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; border: 1px solid; }
  .estado-pago.pagada   { background: rgba(0,212,170,0.1);  color: #00d4aa; border-color: rgba(0,212,170,0.25); }
  .estado-pago.pendiente{ background: rgba(245,158,11,0.1); color: #f59e0b; border-color: rgba(245,158,11,0.25); }
  .estado-pago.vencida  { background: rgba(239,68,68,0.1);  color: #ef4444; border-color: rgba(239,68,68,0.25); }
  .estado-pago.anulada  { background: rgba(107,114,128,0.1);color: #6b7280; border-color: rgba(107,114,128,0.25); }

  .modal-xl { max-width: 640px !important; max-height: 90vh; overflow-y: auto; }
  .tipo-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 4px; }
  @media (max-width: 500px) { .tipo-grid { grid-template-columns: repeat(2,1fr); } }
  .tipo-option { border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 12px; cursor: pointer; transition: all 0.15s; text-align: left; }
  .tipo-option:hover { border-color: var(--border2); background: var(--surface2); }
  .tipo-option.selected { border-color: var(--to-color); background: rgba(0,0,0,0.05); }
  .tipo-option-code { font-size: 13px; font-weight: 800; font-family: var(--mono); }
  .tipo-option-name { font-size: 11px; color: var(--muted); margin-top: 2px; line-height: 1.3; }

  .iva-calc { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 14px; }
  .iva-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
  .iva-row.total { font-size: 16px; font-weight: 800; padding-top: 8px; border-top: 1.5px solid var(--border); margin-top: 4px; margin-bottom: 0; }
  .modal-section { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; padding-bottom: 8px; border-bottom: 1px solid var(--border); margin: 16px 0 12px; }

  .sello { font-family: var(--mono); font-size: 11px; color: var(--accent); background: rgba(0,212,170,0.08); padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(0,212,170,0.2); }

  .detalle-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
  .detalle-field { display: flex; flex-direction: column; gap: 3px; }
  .detalle-field-label { font-size: 10px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .detalle-field-value { font-size: 14px; font-weight: 600; }

  .action-btns { display: flex; gap: 6px; align-items: center; flex-wrap: nowrap; position: relative; }

  /* Botones grandes táctiles (mínimo 40x40px para dedos) */
  .btn-action {
    width: 40px; height: 40px; padding: 0; border-radius: 10px;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0; cursor: pointer; transition: all 0.15s;
    background: rgba(148,163,184,0.12); color: var(--text);
    border: 1.5px solid rgba(148,163,184,0.3);
  }
  .btn-action:hover { transform: translateY(-1px); background: rgba(148,163,184,0.22); }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .btn-action-primary { background: rgba(27,46,107,0.10); color: var(--accent); border-color: rgba(27,46,107,0.30); }
  .btn-action-primary:hover { background: var(--accent); color: white; border-color: var(--accent); }

  .btn-action-wa { background: rgba(37,211,102,0.15); color: #25D366; border-color: rgba(37,211,102,0.4); }
  .btn-action-wa:hover { background: #25D366; color: white; border-color: #25D366; }

  .btn-action-more { background: rgba(148,163,184,0.10); color: var(--muted); border-color: rgba(148,163,184,0.25); }
  .btn-action-more:hover { background: rgba(148,163,184,0.25); color: var(--text); }

  /* Chip del sello MH (no es botón, solo indicador) */
  .sello-mh-chip {
    display: inline-flex; align-items: center; gap: 4px; height: 40px;
    padding: 0 10px; background: rgba(0,212,170,0.15);
    border: 1.5px solid rgba(0,212,170,0.4); border-radius: 10px;
    color: #00d4aa; font-size: 11px; font-weight: 700; flex-shrink: 0;
  }

  /* Menú "Más acciones" — overlay + popover */
  .menu-acciones-overlay {
    position: fixed; inset: 0; z-index: 999; background: transparent;
  }
  .menu-acciones {
    position: absolute; right: 0; top: 48px; z-index: 1000;
    background: var(--surface); border: 1.5px solid var(--border); border-radius: 12px;
    box-shadow: 0 10px 32px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.02);
    min-width: 240px; padding: 8px; display: flex; flex-direction: column; gap: 2px;
  }
  .menu-acciones-titulo {
    font-size: 10px; font-weight: 800; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.6px;
    padding: 6px 12px 4px;
  }
  .menu-item {
    display: flex; align-items: center; gap: 12px;
    width: 100%; min-height: 44px; padding: 10px 12px;
    background: transparent; border: none; border-radius: 8px;
    color: var(--text); font-size: 14px; font-weight: 500; text-align: left;
    cursor: pointer; transition: background 0.12s;
  }
  .menu-item:hover { background: rgba(148,163,184,0.12); }
  .menu-icon { font-size: 18px; width: 22px; text-align: center; }

  .menu-item-nc { color: #8b5cf6; }
  .menu-item-nc:hover { background: rgba(139,92,246,0.10); }
  .menu-item-nd { color: #f59e0b; }
  .menu-item-nd:hover { background: rgba(245,158,11,0.10); }
  .menu-item-danger { color: #ef4444; }
  .menu-item-danger:hover { background: rgba(239,68,68,0.10); }

  /* ───────────────────────────────────────────────────────────────
     TABLA DE FACTURAS DTE — Fila clickeable + fila expandida
     ─────────────────────────────────────────────────────────────── */
  .fact-tabla .fact-tr-main { transition: background 0.15s ease; }
  .fact-tabla .fact-tr-main:hover { background: rgba(148,163,184,0.06); }
  .fact-tabla .fact-tr-main.fila-abierta {
    background: rgba(27,46,107,0.06);
  }
  .fact-tabla .fact-tr-main.fila-abierta td {
    border-bottom: 1.5px solid rgba(27,46,107,0.18);
  }

  .fact-cab-flecha { color: var(--muted); transition: transform 0.25s ease; }
  .fact-cab-flecha.abierta { transform: rotate(180deg); color: var(--accent); }

  /* Fila de detalle expandida */
  .fact-tr-detalle td {
    background: var(--surface2);
    border: none;
  }
  .fact-tarjetas-fila {
    padding: 16px 18px 18px;
    animation: factSlideDown 0.22s ease;
    overflow: visible;
  }
  @keyframes factSlideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

  .fact-sello-info {
    background: rgba(27,46,107,0.06);
    border: 1px solid rgba(27,46,107,0.15);
    padding: 8px 14px;
    border-radius: 8px;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .fact-sello-label { font-size: 11px; font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
  .fact-sello-valor { font-family: var(--mono); font-size: 11px; color: var(--text); word-break: break-all; }

  /* Tarjetas en UNA SOLA FILA HORIZONTAL con scroll si no caben.
     Padding interno generoso (6px en arriba/izq/der) para que las sombras del
     hover (box-shadow ring) NO se corten contra los bordes del contenedor con
     overflow-x: auto. El margin negativo compensa para mantener la alineación. */
  .fact-tarjetas-scroll {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    overflow-y: visible;
    padding: 6px 6px 10px 6px;
    margin: -6px -6px 0 -6px;
    scroll-behavior: smooth;
  }
  .fact-tarjetas-scroll::-webkit-scrollbar { height: 6px; }
  .fact-tarjetas-scroll::-webkit-scrollbar-track { background: transparent; }
  .fact-tarjetas-scroll::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }

  /* Tarjetas de acción */
  .fact-card-btn {
    flex: 0 0 auto;            /* No se encogen; mantienen tamaño en scroll horizontal */
    width: 140px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 16px 10px;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: inherit;
    color: var(--text);
    min-height: 105px;
    text-align: center;
  }
  .fact-card-btn:hover:not(:disabled) {
    box-shadow: 0 0 0 2px var(--accent), 0 4px 14px rgba(0,0,0,0.10);
  }
  .fact-card-btn:active:not(:disabled) { box-shadow: 0 0 0 2px var(--accent); }
  .fact-card-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .fact-card-titulo { font-size: 13px; font-weight: 700; margin-top: 2px; line-height: 1.2; }
  .fact-card-desc { font-size: 11px; color: var(--muted); font-weight: 500; line-height: 1.2; }

  /* Colores por categoría */
  .card-imprimir { color: #3b82f6; }
  .card-imprimir:hover { background: rgba(59,130,246,0.08); border-color: #3b82f6; box-shadow: 0 0 0 2px #3b82f6, 0 4px 14px rgba(59,130,246,0.20) !important; }
  .card-imprimir .fact-card-desc { color: rgba(59,130,246,0.7); }

  .card-compartir-wa { color: #25D366; }
  .card-compartir-wa:hover { background: rgba(37,211,102,0.08); border-color: #25D366; box-shadow: 0 0 0 2px #25D366, 0 4px 14px rgba(37,211,102,0.20) !important; }
  .card-compartir-wa .fact-card-desc { color: rgba(37,211,102,0.8); }

  .card-compartir-email { color: #f59e0b; }
  .card-compartir-email:hover { background: rgba(245,158,11,0.08); border-color: #f59e0b; box-shadow: 0 0 0 2px #f59e0b, 0 4px 14px rgba(245,158,11,0.20) !important; }
  .card-compartir-email .fact-card-desc { color: rgba(245,158,11,0.8); }

  .card-transmitir { color: #00b894; }
  .card-transmitir:hover { background: rgba(0,212,170,0.08); border-color: #00b894; box-shadow: 0 0 0 2px #00b894, 0 4px 14px rgba(0,184,148,0.20) !important; }
  .card-transmitir .fact-card-desc { color: rgba(0,184,148,0.8); }

  .card-nc { color: #8b5cf6; }
  .card-nc:hover { background: rgba(139,92,246,0.08); border-color: #8b5cf6; box-shadow: 0 0 0 2px #8b5cf6, 0 4px 14px rgba(139,92,246,0.20) !important; }
  .card-nc .fact-card-desc { color: rgba(139,92,246,0.8); }

  .card-nd { color: #f97316; }
  .card-nd:hover { background: rgba(249,115,22,0.08); border-color: #f97316; box-shadow: 0 0 0 2px #f97316, 0 4px 14px rgba(249,115,22,0.20) !important; }
  .card-nd .fact-card-desc { color: rgba(249,115,22,0.8); }

  .card-anular { color: #ef4444; border-color: rgba(239,68,68,0.3); }
  .card-anular:hover { background: rgba(239,68,68,0.08); border-color: #ef4444; box-shadow: 0 0 0 2px #ef4444, 0 4px 14px rgba(239,68,68,0.20) !important; }
  .card-anular .fact-card-desc { color: rgba(239,68,68,0.8); }

  /* ── Paginación ── */
  .fact-paginacion {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: var(--surface2);
    border-top: 1.5px solid var(--border);
    flex-wrap: wrap;
    gap: 12px;
  }
  .fact-pag-info { font-size: 13px; color: var(--muted); }
  .fact-pag-info strong { color: var(--text); font-family: var(--mono); }
  .fact-pag-controles { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .fact-pag-btn {
    padding: 8px 14px;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 8px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .fact-pag-btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(27,46,107,0.06);
  }
  .fact-pag-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .fact-pag-actual {
    padding: 0 12px;
    font-size: 13px;
    color: var(--muted);
  }
  .fact-pag-actual strong { color: var(--accent); font-family: var(--mono); }
  @media (max-width: 720px) {
    .fact-paginacion { flex-direction: column; align-items: stretch; }
    .fact-pag-controles { justify-content: center; }
  }

  .btn-wa { background: rgba(37,211,102,0.15); color: #25D366; border: 1.5px solid rgba(37,211,102,0.4); }
  .btn-wa:hover { background: #25D366; color: white; border-color: #25D366; }
  .btn-pdf { background: rgba(239,68,68,0.12); color: #ef4444; border: 1.5px solid rgba(239,68,68,0.35); }
  .btn-pdf:hover { background: #ef4444; color: white; border-color: #ef4444; }
  .btn-anular { background: rgba(239,68,68,0.12); color: #ef4444; border: 1.5px solid rgba(239,68,68,0.4); }
  .btn-anular:hover { background: #ef4444; color: white; border-color: #ef4444; }
  .ncnd-section { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 12px 14px; }
  .ncnd-section-title { font-size: 10px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px; }

  /* Modal anulación */
  .anulacion-alert { background: rgba(239,68,68,0.08); border: 1.5px solid rgba(239,68,68,0.25); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; }
  .anulacion-alert-title { font-size: 13px; font-weight: 700; color: #ef4444; margin-bottom: 4px; }
  .anulacion-alert-body { font-size: 12px; color: var(--muted); line-height: 1.6; }
  .plazo-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 99px; font-size: 12px; font-weight: 700; margin-bottom: 14px; }
  .plazo-24h { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.25); }
  .plazo-3m  { background: rgba(245,158,11,0.1); color: #f59e0b; border: 1px solid rgba(245,158,11,0.25); }

  /* Fila anulada en tabla */
  tr.fila-anulada td { opacity: 0.5; text-decoration: line-through; }
  tr.fila-anulada td:last-child { opacity: 1; text-decoration: none; }
`

// ── Imprimir con iframe oculto ──
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
      setTimeout(() => { document.body.removeChild(iframe) }, 2000)
    }, 800)
  }
}

// ── Validar plazo de anulación según MH El Salvador ──
const validarPlazoAnulacion = (factura) => {
  const tipo = factura.tipoDte
  const fechaEmision = new Date(factura.fechaEmision + 'T00:00:00')
  const ahora = new Date()

  if (TIPOS_24H.includes(tipo)) {
    // CCF, NC, ND: máximo 24 horas
    const diffHoras = (ahora - fechaEmision) / (1000 * 60 * 60)
    if (diffHoras > 24) {
      return {
        permitido: false,
        mensaje: `El tipo ${tipo} solo puede anularse dentro de las 24 horas siguientes a su emisión. Han transcurrido ${Math.floor(diffHoras)} horas.`,
        plazo: '24 horas'
      }
    }
    return { permitido: true, plazo: '24 horas', tipo: 'corto' }
  }

  if (TIPOS_3M.includes(tipo)) {
    // FE, FEX, FSEE: máximo 3 meses
    const limite = new Date(fechaEmision)
    limite.setMonth(limite.getMonth() + 3)
    if (ahora > limite) {
      return {
        permitido: false,
        mensaje: `El tipo ${tipo} solo puede anularse dentro de los 3 meses siguientes a su emisión. El plazo venció el ${limite.toLocaleDateString('es-SV')}.`,
        plazo: '3 meses'
      }
    }
    return { permitido: true, plazo: '3 meses', tipo: 'largo' }
  }

  // Tipos no contemplados: permitir con advertencia
  return { permitido: true, plazo: 'sin plazo definido', tipo: 'largo' }
}

export default function Facturas() {
  const { user } = useAuth()
  const { puede } = usePermisos()
  const [facturas, setFacturas] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [detalleOpen, setDetalleOpen] = useState(null)
  // Fila expandida actualmente (id de la factura). Solo puede haber una a la vez.
  // Null = ninguna fila expandida (todas plegadas).
  const [filaExpandida, setFilaExpandida] = useState(null)
  // Paginación
  const [paginaActual, setPaginaActual] = useState(1)
  const [anulacionOpen, setAnulacionOpen] = useState(null)
  const [ncndOpen, setNcndOpen]           = useState(null)
  const [ncndTipo, setNcndTipo]           = useState('NC')
  const [guardandoNcNd, setGuardandoNcNd] = useState(false)
  const [ncndForm, setNcndForm]           = useState({
    nombre: '', nit: '', nrc: '', codActividad: '', descActividad: '',
    departamento: '', municipio: '', distrito: '', codDistrito: '', complemento: '', telefono: '', correo: '',
    tipoDocumento: '01', tipoGeneracion: '2', numeroDocumento: '', fechaEmision: '',
    monto: '', motivo: '',
    itemsDevueltos: [],
  })
  const [formAnulacion, setFormAnulacion] = useState(emptyAnulacion)
  // ── Estado del modal de contingencia ──
  const [contingenciaOpen, setContingenciaOpen] = useState(false)
  const [enviandoContingencia, setEnviandoContingencia] = useState(false)
  const [contingenciaForm, setContingenciaForm] = useState({
    fInicio: '', hInicio: '08:00',
    fFin: '', hFin: '17:00',
    tipoContingencia: '2',
    motivoContingencia: '',
    seleccionadas: {},
  })
  const [contingenciaResultado, setContingenciaResultado] = useState(null)
  const [anulando, setAnulando] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [guardando, setGuardando] = useState(false)
  const [transmitiendo, setTransmitiendo] = useState(null) // id de la factura en transmisión
  const [menuAccionesOpen, setMenuAccionesOpen] = useState(null) // id de la factura con el menú "Más" abierto
  const [empresa, setEmpresa] = useState({})

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'facturas'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setFacturas(data)
      setLoading(false)
    })
    if (user) {
      getDoc(doc(db, 'configuracion', user.uid)).then(snap => {
        if (snap.exists()) setEmpresa(snap.data())
      })
    }
    return () => unsub()
  }, [user])

  // Bloquear scroll del body cuando hay un modal abierto, para que el fondo
  // no se mueva al hacer scroll dentro del modal.
  useEffect(() => {
    const hayModal = modalOpen || detalleOpen || anulacionOpen || ncndOpen || contingenciaOpen
    if (hayModal) {
      const original = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = original }
    }
  }, [modalOpen, detalleOpen, anulacionOpen, ncndOpen, contingenciaOpen])

  const calcularIva = (subtotal) => {
    const s = parseFloat(subtotal) || 0
    const iva = s * 0.13
    setForm(f => ({ ...f, subtotal, iva: iva.toFixed(2), total: (s + iva).toFixed(2) }))
  }

  const filtradas = facturas.filter(f => {
    const q = busqueda.toLowerCase()
    const coincide = f.cliente?.toLowerCase().includes(q) || f.numero?.toLowerCase().includes(q) || f.nit?.includes(q)
    const tipo = filtroTipo === 'todos' || f.tipoDte === filtroTipo
    const estado = filtroEstado === 'todos' || f.estadoPago === filtroEstado
    return coincide && tipo && estado
  })

  // Paginación: 50 facturas por página. Resetea al cambiar filtros/búsqueda.
  const POR_PAGINA = 50
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaSegura = Math.min(paginaActual, totalPaginas)
  const inicio = (paginaSegura - 1) * POR_PAGINA
  const paginadas = filtradas.slice(inicio, inicio + POR_PAGINA)

  // Cuando cambia búsqueda/filtros, volver a página 1 (evita quedar en página inexistente).
  useEffect(() => {
    setPaginaActual(1)
    setFilaExpandida(null)
  }, [busqueda, filtroTipo, filtroEstado])

  const totalPagadas    = facturas.filter(f => f.estadoPago === 'pagada').reduce((s, f) => s + (f.total || 0), 0)
  const totalPendientes = facturas.filter(f => f.estadoPago === 'pendiente').reduce((s, f) => s + (f.total || 0), 0)
  const totalVencidas   = facturas.filter(f => f.estadoPago === 'vencida').reduce((s, f) => s + (f.total || 0), 0)

  const abrirModal = () => {
    setForm({ ...emptyForm, numero: `FE-${String(facturas.length + 1).padStart(6, '0')}` })
    setModalOpen(true)
  }

  const guardar = async () => {
    if (!form.cliente || !form.tipoDte) return
    setGuardando(true)
    const data = {
      tipoDte: form.tipoDte,
      numero: form.numero || `${form.tipoDte}-${String(facturas.length + 1).padStart(6, '0')}`,
      cliente: form.cliente, nit: form.nit || '', nrc: form.nrc || '',
      direccion: form.direccion || '', descripcion: form.descripcion || '',
      subtotal: parseFloat(form.subtotal) || 0, iva: parseFloat(form.iva) || 0, total: parseFloat(form.total) || 0,
      estadoPago: form.estadoPago, fechaEmision: form.fechaEmision,
      fechaVencimiento: form.fechaVencimiento || '', notas: form.notas || '',
      updatedAt: serverTimestamp()
    }
    try {
      await addDoc(collection(db, 'facturas'), { ...data, createdAt: serverTimestamp() })
      setModalOpen(false)
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const cambiarEstado = async (id, nuevoEstado) => {
    // No permitir cambiar estado si ya está anulada
    const factura = facturas.find(f => f.id === id)
    if (factura?.estadoPago === 'anulada') return
    try { await updateDoc(doc(db, 'facturas', id), { estadoPago: nuevoEstado, updatedAt: serverTimestamp() }) }
    catch (e) { alert('Error: ' + e.message) }
  }

  // ── Abrir modal de anulación ──
  const abrirAnulacion = (factura) => {
    const validacion = validarPlazoAnulacion(factura)
    if (!validacion.permitido) {
      alert(`⚠️ Anulación fuera de plazo\n\n${validacion.mensaje}\n\nSegún el Ministerio de Hacienda de El Salvador, no es posible emitir el Evento de Invalidación fuera del plazo establecido.`)
      return
    }
    setFormAnulacion(emptyAnulacion)
    setAnulacionOpen(factura)
  }

  // ── Ejecutar anulación con Evento de Invalidación ──
  const ejecutarAnulacion = async () => {
    if (!anulacionOpen) return
    if (!formAnulacion.motivoDetalle.trim()) {
      alert('Debe ingresar el detalle del motivo de anulación.')
      return
    }
    setAnulando(true)
    const factura = anulacionOpen
    try {
      // El DTE original debe haber sido transmitido y procesado por el MH.
      if (!factura.codigoGeneracion || !factura.dte_sello || !factura.numeroControl) {
        alert('⚠️ Este DTE no fue transmitido al Ministerio de Hacienda.\n\nSolo se pueden invalidar DTE en estado PROCESADO con sello del MH.')
        setAnulando(false)
        return
      }

      // Si la factura es a Consumidor Final sin documento, el MH exige
      // ingresar datos del solicitante (cliente o representante real).
      const facturaSinDoc = !factura.nit && !factura.dui
      if (facturaSinDoc && !formAnulacion.solicitanteNumDoc.trim()) {
        alert('⚠️ La factura es a Consumidor Final sin documento.\n\nDebés ingresar los datos del solicitante de la anulación.')
        setAnulando(false)
        return
      }

      // Llamar al endpoint de invalidación. El endpoint:
      //  - Valida plazo según tipo (FE/FEX 90 días, CCF/NC/ND 1 día).
      //  - Arma el evento, lo firma y lo transmite al MH.
      //  - Guarda en `eventos_invalidacion` con el sello del MH.
      //  - Actualiza la factura y venta con `dte_estado_invalidacion: 'INVALIDADO'`.
      const resp = await fetch('/api/dte/invalidar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facturaId: factura.id,
          tipoAnulacion: parseInt(formAnulacion.tipoInvalidacion),
          motivoAnulacion: formAnulacion.motivoDetalle,
          responsableId: user?.uid || null,
          codigoGeneracionReemplazo: formAnulacion.tipoInvalidacion === '1'
            ? formAnulacion.codigoGeneracionReemplazo.trim()
            : null,
          // Solicitante: el backend usa estos datos si vienen, sino infiere desde la factura
          solicitanteNombre: formAnulacion.solicitanteNombre.trim() || null,
          solicitanteTipoDoc: formAnulacion.solicitanteTipoDoc || null,
          solicitanteNumDoc: formAnulacion.solicitanteNumDoc.replace(/[-\s]/g, '').trim() || null,
        })
      })
      const data = await resp.json()

      if (!resp.ok) {
        throw new Error(data.error || data.mensaje || 'Error al invalidar')
      }

      if (data.estado === 'PROCESADO') {
        // Marcar la factura localmente como anulada para que la UI se actualice
        // de inmediato (el endpoint ya escribió dte_estado_invalidacion en backend).
        try {
          await updateDoc(doc(db, 'facturas', factura.id), {
            estadoPago: 'anulada',
            anulada: true,
            updatedAt: serverTimestamp(),
          })
        } catch (e) { console.warn('No se pudo actualizar estado local:', e) }

        alert(`✅ DTE invalidado correctamente.\n\nSello del evento: ${data.selloRecibido}\nCódigo del evento: ${data.codigoGeneracionEvento}`)
        setAnulacionOpen(null)
        setDetalleOpen(null)
      } else {
        // El MH rechazó la invalidación. La factura NO se anula.
        const observ = Array.isArray(data.observaciones)
          ? data.observaciones.join('\n')
          : (data.observaciones || 'Sin detalles del MH')
        alert(`❌ DTE RECHAZADO por el Ministerio de Hacienda\n\n${observ}\n\nLa factura NO fue invalidada. Corregí los datos y reintentá.`)
      }
    } catch (e) {
      alert('❌ Error al anular: ' + e.message)
    }
    setAnulando(false)
  }
// ── Transmitir DTE al MH ──
  const transmitirMH = async (factura) => {
    if (!factura.codigoGeneracion) {
      alert('⚠️ Esta factura no tiene código de generación.\n\nSolo facturas creadas desde Punto de Venta pueden transmitirse al MH.')
      return
    }
    if (factura.dte_estado === 'PROCESADO') {
      alert('✓ Esta factura ya fue transmitida y aceptada por el MH.')
      return
    }

    setTransmitiendo(factura.id)
    try {
      // Buscar la venta por codigoGeneracion
      const ventasQuery = query(
        collection(db, 'ventas'),
        where('codigoGeneracion', '==', factura.codigoGeneracion)
      )
      const ventasSnap = await getDocs(ventasQuery)
      if (ventasSnap.empty) {
        alert('❌ No se encontró la venta asociada a esta factura.\n\nNo se puede transmitir al MH sin los datos de la venta original.')
        setTransmitiendo(null)
        return
      }
      const ventaId = ventasSnap.docs[0].id

      // Llamar al endpoint
      const res = await fetch('/api/dte/transmitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ventaId, ambiente: '00' })
      })
      const data = await res.json()

      if (data.estado === 'PROCESADO') {
        alert(`✅ DTE PROCESADO por el Ministerio de Hacienda\n\nSello: ${data.selloRecibido}\nFecha: ${data.fhProcesamiento}`)
      } else if (data.estado === 'RECHAZADO') {
        const detalle = data.detalleMH?.descripcionMsg || JSON.stringify(data.observaciones) || 'Sin detalle'
        alert(`❌ DTE RECHAZADO por el MH\n\n${detalle}\n\nLa factura no fue modificada. Corregí los datos y reintentá.`)
      } else {
        alert(`⚠️ Respuesta inesperada del servidor:\n\n${JSON.stringify(data)}`)
      }
    } catch (e) {
      alert('❌ Error al transmitir:\n\n' + e.message)
    }
    setTransmitiendo(null)
  }
  const getTipoInfo = (codigo) => TIPOS_DTE.find(t => t.codigo === codigo) || TIPOS_DTE[0]
  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  const formatFecha = (fecha) => { if (!fecha) return '—'; const [y, m, d] = fecha.split('-'); return `${d}/${m}/${y}` }

  // ── Generar PDF de factura ──
  // Mapeo de tipos a códigos numéricos (CAT-002 del MH)
  const TIPO_DTE_NUM = {
    'FE': '01', 'CCF': '03', 'NR': '04', 'NC': '05',
    'ND': '06', 'FEX': '11', 'FSE': '14'
  }

  // Mapeo de tipo de documento del receptor (CAT-022) a texto legible
  const TIPO_DOC_RECEPTOR = {
    '13': 'DUI', '36': 'NIT', '02': 'Carnet Residente',
    '03': 'Pasaporte', '37': 'Otro'
  }

  // Genera el código QR como Data URL (PNG en base64).
  // Carga la librería 'qrcode' dinámicamente para no inflar el bundle inicial.
  const generarQRDataURL = async (texto) => {
    try {
      const QRCode = (await import('qrcode')).default
      return await QRCode.toDataURL(texto, {
        width: 180,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#FFFFFF' }
      })
    } catch (e) {
      console.warn('No se pudo generar QR:', e)
      return null
    }
  }

  // Construye la URL pública del MH para consultar el DTE.
  // Formato oficial: https://admin.factura.gob.sv/consultaPublica?ambiente=00&codGen=XXX&fechaEmi=YYYY-MM-DD
  const buildUrlConsultaMH = (f) => {
    const ambiente = f.dte_ambiente || '00'
    const codGen = f.codigoGeneracion || ''
    const fechaEmi = f.fechaEmision || ''
    return `https://admin.factura.gob.sv/consultaPublica?ambiente=${ambiente}&codGen=${codGen}&fechaEmi=${fechaEmi}`
  }

  // Extrae los totales del dte_json oficial guardado en Firestore.
  // Si el JSON no existe (facturas viejas) o no se puede parsear, devuelve null
  // y se usan los campos planos de la factura (subtotal/iva/total).
  // Esto permite mostrar correctamente exentas, no sujetas, retenciones, etc.
  // cuando esos campos sí existen en el DTE oficial procesado por el MH.
  const extraerResumenOficial = (f) => {
    if (!f.dte_json) return null
    try {
      const dte = typeof f.dte_json === 'string' ? JSON.parse(f.dte_json) : f.dte_json
      const r = dte?.resumen
      if (!r) return null
      return {
        totalNoSuj: r.totalNoSuj || 0,
        totalExenta: r.totalExenta || 0,
        totalGravada: r.totalGravada || r.subTotalVentas || 0,
        subTotalVentas: r.subTotalVentas || 0,
        descuNoSuj: r.descuNoSuj || 0,
        descuExenta: r.descuExenta || 0,
        descuGravada: r.descuGravada || 0,
        totalDescu: r.totalDescu || 0,
        subTotal: r.subTotal || 0,
        ivaRete1: r.ivaRete1 || 0,
        reteRenta: r.reteRenta || 0,
        totalIva: r.totalIva || 0,
        // El IVA puede venir como totalIva o consolidado en tributos[]
        ivaTributo: (r.tributos || []).find(t => t.codigo === '20')?.valor || 0,
        montoTotalOperacion: r.montoTotalOperacion || 0,
        totalNoGravado: r.totalNoGravado || 0,
        totalPagar: r.totalPagar || 0,
      }
    } catch (e) {
      return null
    }
  }

  // Convierte un número a letras en español (para "Total en Letras")
  const numeroALetras = (num) => {
    const entero = Math.floor(num)
    const decimales = Math.round((num - entero) * 100)
    const unidades = ['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE']
    const decenas = ['','','VEINTI','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA']
    const centenas = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS']
    const grupo = (n) => {
      if (n === 0) return ''
      if (n <= 20) return unidades[n]
      if (n < 100) {
        const d = Math.floor(n / 10), u = n % 10
        return d === 2 ? (u === 0 ? 'VEINTE' : 'VEINTI' + unidades[u]) : decenas[d] + (u ? ' Y ' + unidades[u] : '')
      }
      if (n === 100) return 'CIEN'
      if (n < 1000) {
        const c = Math.floor(n / 100), r = n % 100
        return centenas[c] + (r ? ' ' + grupo(r) : '')
      }
      if (n < 1000000) {
        const miles = Math.floor(n / 1000), r = n % 1000
        const milesStr = miles === 1 ? 'MIL' : grupo(miles) + ' MIL'
        return milesStr + (r ? ' ' + grupo(r) : '')
      }
      return n.toString()
    }
    const enteroLetras = entero === 0 ? 'CERO' : grupo(entero)
    return `${enteroLetras} DÓLARES Y ${String(decimales).padStart(2,'0')}/100`
  }

  // PDF oficial conforme al Anexo Normativa V2.0 del Ministerio de Hacienda.
  // Incluye: QR con link al portal del MH, sello de recepción, todos los datos
  // fiscales obligatorios, y soporte para todos los tipos de DTE.
  const generarPDF = async (f) => {
    const tipo = getTipoInfo(f.tipoDte)
    const tipoNum = TIPO_DTE_NUM[f.tipoDte] || '01'
    const esAnulada = f.estadoPago === 'anulada' || f.anulada
    const esProcesado = f.dte_estado === 'PROCESADO'

    // Generar QR solo si el DTE fue procesado por el MH
    const urlConsulta = buildUrlConsultaMH(f)
    const qrDataURL = esProcesado ? await generarQRDataURL(urlConsulta) : null

    // Items para la tabla (si no hay items individuales, mostrar línea única)
    const items = (f.items && f.items.length > 0) ? f.items : [{
      nombre: f.descripcion || 'Productos y/o Servicios',
      qty: 1, precioBase: f.subtotal || 0, descuento: 0
    }]

    // Extraer totales del JSON oficial del MH (si existe). Si no existe (facturas
    // viejas o sin transmitir), usar los campos planos de la factura como fallback.
    const resOf = extraerResumenOficial(f)
    const totalNoSuj = resOf?.totalNoSuj ?? 0
    const totalExenta = resOf?.totalExenta ?? 0
    const totalGravada = resOf?.totalGravada ?? (f.subtotal || 0)
    const subTotalVentas = resOf?.subTotalVentas ?? (f.subtotal || 0)
    const descuNoSuj = resOf?.descuNoSuj ?? 0
    const descuExenta = resOf?.descuExenta ?? 0
    const descuGravada = resOf?.descuGravada ?? 0
    const subTotal = resOf?.subTotal ?? (f.subtotal || 0)
    const ivaCalculado = resOf?.ivaTributo || resOf?.totalIva || (f.iva || 0)
    const ivaRete1 = resOf?.ivaRete1 ?? 0
    const reteRenta = resOf?.reteRenta ?? 0
    const montoTotalOperacion = resOf?.montoTotalOperacion ?? (f.total || 0)
    const totalNoGravado = resOf?.totalNoGravado ?? 0
    const totalPagar = resOf?.totalPagar ?? (f.total || 0)

    const totalLetras = numeroALetras(totalPagar)
    const ambiente = f.dte_ambiente || '00'
    const ambienteTexto = ambiente === '01' ? 'PRODUCCIÓN' : 'PRUEBAS'

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>${tipo.nombre} ${f.numero || f.numeroControl || ''}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;font-size:10px;line-height:1.3;}
.page{max-width:780px;margin:0 auto;padding:14px 18px;}
.relativa { position: relative; }

/* Marca de agua INVALIDADO si aplica */
.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:140px;font-weight:900;color:rgba(239,68,68,0.18);z-index:0;letter-spacing:8px;pointer-events:none;}
.contenido{position:relative;z-index:1;}

/* Cabecera del emisor */
.cab-emisor{display:grid;grid-template-columns:1.4fr 1.4fr 1fr;gap:12px;margin-bottom:8px;padding-bottom:8px;border-bottom:1.5px solid #1B2E6B;align-items:start;}
.cab-emisor-nombre{font-weight:800;color:#1B2E6B;font-size:14px;text-align:center;grid-column:1 / -1;margin-bottom:4px;}
.cab-emisor-col{font-size:10px;line-height:1.4;}
.cab-emisor-col p{margin-bottom:1px;}
.cab-emisor-col strong{font-weight:700;color:#374151;}
.cab-emisor-logo{text-align:right;}
.cab-emisor-logo img{max-height:60px;max-width:120px;object-fit:contain;}

/* Bloque del DTE con QR + datos */
.bloque-dte{border:1px solid #6b7280;border-radius:3px;margin-bottom:8px;}
.bloque-dte-titulo{background:#e5e7eb;padding:4px 10px;text-align:center;font-weight:800;font-size:10px;letter-spacing:0.5px;color:#1a1a2e;}
.bloque-dte-subtitulo{background:#f3f4f6;padding:3px 10px;text-align:center;font-weight:700;font-size:10px;color:#374151;border-top:1px solid #e5e7eb;}
.bloque-dte-body{display:grid;grid-template-columns:140px 1fr;gap:8px;padding:8px;}
.bloque-dte-qr{display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #e5e7eb;border-radius:3px;padding:4px;background:#fff;}
.bloque-dte-qr img{width:100%;max-width:130px;height:auto;}
.bloque-dte-qr-placeholder{width:130px;height:130px;border:2px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:9px;text-align:center;padding:6px;}
.bloque-dte-info{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:9.5px;line-height:1.35;}
.bloque-dte-info > div strong{display:block;font-weight:700;color:#1a1a2e;font-size:9px;letter-spacing:0.2px;}
.bloque-dte-info > div span{color:#374151;word-break:break-all;}

/* Bloque receptor */
.bloque-receptor{border:1px solid #6b7280;border-radius:3px;margin-bottom:8px;}
.bloque-receptor-titulo{background:#e5e7eb;padding:4px 10px;text-align:center;font-weight:800;font-size:10px;letter-spacing:0.5px;color:#1a1a2e;}
.bloque-receptor-body{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 14px;padding:8px;font-size:9.5px;line-height:1.35;}
.bloque-receptor-body > div strong{display:block;font-weight:700;font-size:9px;color:#1a1a2e;}
.bloque-receptor-body > div span{color:#374151;}

/* Tabla del cuerpo */
.tabla-cuerpo{border:1px solid #6b7280;border-radius:3px;overflow:hidden;margin-bottom:8px;}
.tabla-cuerpo-titulo{background:#e5e7eb;padding:4px 10px;text-align:center;font-weight:800;font-size:10px;letter-spacing:0.5px;}
table{width:100%;border-collapse:collapse;font-size:9px;}
table thead{background:#9ca3af;color:#fff;}
table thead th{padding:4px 4px;text-align:center;font-weight:700;font-size:8.5px;border-right:1px solid rgba(255,255,255,0.18);}
table thead th:last-child{border-right:none;}
table tbody td{padding:4px 4px;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;font-size:9.5px;}
table tbody td:last-child{border-right:none;}
table tbody tr:last-child td{border-bottom:none;}
.td-right{text-align:right;}
.td-center{text-align:center;}

/* Bloque inferior: totales + letras + extensión */
.bloque-inferior{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;}
.bloque-letras{border:1px solid #6b7280;border-radius:3px;}
.bloque-letras-titulo{background:#e5e7eb;padding:4px 10px;font-weight:800;font-size:10px;}
.bloque-letras-body{padding:5px 10px;font-size:10px;font-weight:700;line-height:1.35;}
.bloque-letras-obs{padding:4px 10px;font-size:9.5px;border-top:1px solid #e5e7eb;line-height:1.35;}
.bloque-letras-obs strong{display:block;font-size:9px;margin-bottom:1px;}
.bloque-letras-cond{padding:4px 10px;font-size:9.5px;border-top:1px solid #e5e7eb;}
.bloque-letras-cond strong{display:block;font-size:9px;margin-bottom:1px;}

.bloque-totales{border:1px solid #6b7280;border-radius:3px;font-size:9.5px;}
.bloque-totales-fila{display:grid;grid-template-columns:1fr auto;padding:3px 10px;border-bottom:1px solid #e5e7eb;gap:8px;}
.bloque-totales-fila:last-child{border-bottom:none;background:#f3f4f6;font-weight:800;font-size:11px;}
.bloque-totales-encab{display:grid;grid-template-columns:1fr repeat(3, 70px);background:#e5e7eb;padding:3px 10px;font-weight:700;font-size:8.5px;text-align:right;gap:6px;}
.bloque-totales-encab > div:first-child{text-align:left;}
.bloque-totales-encab-row{display:grid;grid-template-columns:1fr repeat(3, 70px);padding:3px 10px;font-size:9.5px;text-align:right;border-bottom:1px solid #e5e7eb;gap:6px;}
.bloque-totales-encab-row > div:first-child{text-align:left;font-weight:600;}

/* Pie con info adicional MH */
.pie-mh{margin-top:6px;padding:5px 10px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:3px;font-size:8.5px;color:#475569;text-align:center;line-height:1.4;}
.pie-mh strong{color:#1B2E6B;}

@media print {
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  @page{size:A4;margin:6mm;}
  .page{padding:0;}
  /* Evitar saltos dentro de los bloques principales */
  .bloque-dte, .bloque-receptor, .tabla-cuerpo, .bloque-inferior { page-break-inside: avoid; break-inside: avoid; }
  /* Si la tabla es larga, repetir el thead en cada página */
  table thead { display: table-header-group; }
  table tbody tr { page-break-inside: avoid; break-inside: avoid; }
}
</style>
</head>
<body>
${esAnulada ? '<div class="watermark">INVALIDADO</div>' : ''}
${ambiente === '00' ? '<div class="watermark" style="font-size:90px;color:rgba(245,158,11,0.18);">AMBIENTE PRUEBAS</div>' : ''}

<div class="page contenido">

  <!-- CABECERA EMISOR -->
  <div class="cab-emisor">
    <div class="cab-emisor-nombre">${empresa.empresaNombre || 'Mi Empresa'}</div>
    <div class="cab-emisor-col">
      <p><strong>Nombre o Razón Social:</strong> ${empresa.empresaNombre || '—'}</p>
      <p><strong>Actividad Económica:</strong> ${empresa.descActividad || empresa.actividadEconomica || '—'}</p>
      <p><strong>NIT:</strong> ${empresa.nit || '—'} &nbsp; <strong>NRC:</strong> ${empresa.nrc || '—'}</p>
      <p><strong>Correo:</strong> ${empresa.correo || empresa.email || '—'}</p>
      <p><strong>Teléfono:</strong> ${empresa.telefono || '—'}</p>
    </div>
    <div class="cab-emisor-col">
      <p><strong>Dirección:</strong> ${empresa.direccion || empresa.complemento || '—'}</p>
      <p><strong>Distrito:</strong> ${empresa.distrito || '—'}</p>
      <p><strong>Municipio:</strong> ${empresa.municipio || '—'}</p>
      <p><strong>Departamento:</strong> ${empresa.departamento || '—'}</p>
      <p><strong>Casa Matriz/Sucursal:</strong> ${empresa.codEstableMH || 'S001'} &nbsp; <strong>Punto de Venta:</strong> ${empresa.codPuntoVentaMH || 'P001'}</p>
    </div>
    <div class="cab-emisor-logo">
      ${empresa.logoUrl ? `<img src="${empresa.logoUrl}" onerror="this.style.display='none'"/>` : ''}
    </div>
  </div>

  <!-- BLOQUE DTE: QR + datos -->
  <div class="bloque-dte">
    <div class="bloque-dte-titulo">DOCUMENTO TRIBUTARIO ELECTRÓNICO</div>
    <div class="bloque-dte-subtitulo">${(tipo.nombre || f.tipoDte).toUpperCase()}</div>
    <div class="bloque-dte-body">
      <div class="bloque-dte-qr">
        ${qrDataURL
          ? `<img src="${qrDataURL}" alt="QR de consulta MH"/>`
          : `<div class="bloque-dte-qr-placeholder">QR disponible<br/>solo en DTE<br/>procesados</div>`
        }
      </div>
      <div class="bloque-dte-info">
        <div><strong>Modelo de Facturación:</strong><span>${f.dte_modelo === 2 ? 'MODELO FACTURACIÓN DIFERIDO (CONTINGENCIA)' : 'MODELO FACTURACIÓN PREVIO'}</span></div>
        <div><strong>Tipo de Transmisión:</strong><span>${f.dte_modelo === 2 ? 'TRANSMISIÓN CONTINGENCIA' : 'TRANSMISIÓN NORMAL'}</span></div>
        <div><strong>Fecha y Hora de Generación:</strong><span>${formatFecha(f.fechaEmision)} ${f.createdAt?.seconds ? new Date(f.createdAt.seconds * 1000).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}</span></div>
        <div><strong>Versión del JSON:</strong><span>${({'01':2,'03':4,'04':4,'05':4,'06':4,'11':3,'14':2})[tipoNum] || ''}</span></div>
        <div><strong>Código de Generación:</strong><span style="font-family:monospace;font-size:10px">${f.codigoGeneracion || '—'}</span></div>
        <div><strong>Ambiente:</strong><span>${ambienteTexto}</span></div>
        <div><strong>Número de Control:</strong><span style="font-family:monospace;font-size:10px">${f.numeroControl || f.numero || '—'}</span></div>
        <div><strong>Sello de Recepción:</strong><span style="font-family:monospace;font-size:9.5px">${f.dte_sello || (esProcesado ? '—' : 'Pendiente de transmisión')}</span></div>
      </div>
    </div>
  </div>

  <!-- RECEPTOR -->
  <div class="bloque-receptor">
    <div class="bloque-receptor-titulo">RECEPTOR</div>
    <div class="bloque-receptor-body">
      <div><strong>Nombre o Razón Social:</strong><span>${f.cliente || 'Consumidor Final'}</span></div>
      <div><strong>Tipo de Documento:</strong><span>${f.nit ? 'NIT' : f.dui ? 'DUI' : '—'}</span></div>
      <div><strong>N° Documento:</strong><span style="font-family:monospace">${f.nit || f.dui || '—'}</span></div>
      <div><strong>Actividad Económica:</strong><span>${f.descActividad || f.actividad || '—'}</span></div>
      <div><strong>Dirección:</strong><span>${(typeof f.direccion === 'object' ? f.direccion?.complemento : f.direccion) || f.complemento || '—'}</span></div>
      <div><strong>Correo Electrónico:</strong><span>${f.email || f.correo || '—'}</span></div>
      <div><strong>NRC:</strong><span>${f.nrc || '—'}</span></div>
      <div><strong>Teléfono:</strong><span>${f.telefono || '—'}</span></div>
      <div></div>
    </div>
  </div>

  <!-- CUERPO DEL DOCUMENTO -->
  <div class="tabla-cuerpo">
    <div class="tabla-cuerpo-titulo">CUERPO DEL DOCUMENTO</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px;">N°</th>
          <th style="width:50px;">Cant.</th>
          <th style="width:60px;">Unidad</th>
          <th>Descripción</th>
          <th style="width:75px;">Precio Unitario</th>
          <th style="width:70px;">Descuento por Ítem</th>
          <th style="width:70px;">Otros Montos No Afectos</th>
          <th style="width:70px;">Ventas No Sujetas</th>
          <th style="width:65px;">Ventas Exentas</th>
          <th style="width:70px;">Ventas Gravadas</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, i) => {
          const cant = parseFloat(item.qty || item.cantidad || 1)
          const precio = parseFloat(item.precioBase || item.precioUni || 0)
          const desc = parseFloat(item.descuento || item.montoDescu || 0)
          // Si el item viene del DTE oficial, ya tiene ventaGravada/ventaExenta/ventaNoSuj
          // Si no, asumimos que es 100% gravado (el caso común)
          const ventaNoSuj = parseFloat(item.ventaNoSuj || 0)
          const ventaExenta = parseFloat(item.ventaExenta || 0)
          const ventaGravada = item.ventaGravada !== undefined
            ? parseFloat(item.ventaGravada)
            : ((precio * cant) - desc)
          const noGravado = parseFloat(item.noGravado || 0)
          return `
          <tr>
            <td class="td-center">${i + 1}</td>
            <td class="td-center">${cant.toFixed(2)}</td>
            <td class="td-center">Unidad</td>
            <td>${item.nombre || item.descripcion || '—'}</td>
            <td class="td-right">${fmt(precio)}</td>
            <td class="td-right">${fmt(desc)}</td>
            <td class="td-right">${fmt(noGravado)}</td>
            <td class="td-right">${fmt(ventaNoSuj)}</td>
            <td class="td-right">${fmt(ventaExenta)}</td>
            <td class="td-right">${fmt(ventaGravada)}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- BLOQUE INFERIOR: Total en letras + Totales -->
  <div class="bloque-inferior">
    <div class="bloque-letras">
      <div class="bloque-letras-titulo">Total en Letras: ${totalLetras}</div>
      <div class="bloque-letras-obs"><strong>Observaciones:</strong>${f.observaciones || f.notas || '—'}</div>
      <div class="bloque-letras-cond"><strong>Condición de la Operación:</strong>${f.tipoPago === 'credito' ? 'CRÉDITO' : 'CONTADO'}</div>
    </div>
    <div class="bloque-totales">
      <div class="bloque-totales-encab">
        <div>Total Operaciones</div>
        <div>No Sujetas</div>
        <div>Exentas</div>
        <div>Gravadas</div>
      </div>
      <div class="bloque-totales-encab-row">
        <div>Sumatoria de Ventas</div>
        <div>${fmt(totalNoSuj)}</div>
        <div>${fmt(totalExenta)}</div>
        <div>${fmt(totalGravada)}</div>
      </div>
      <div class="bloque-totales-fila"><span>Monto Global Descuento, Bonificaciones, Rebajas a Ventas No Sujetas:</span><span>${fmt(descuNoSuj)}</span></div>
      <div class="bloque-totales-fila"><span>Monto Global Descuento, Bonificaciones, Rebajas a Ventas Exentas:</span><span>${fmt(descuExenta)}</span></div>
      <div class="bloque-totales-fila"><span>Monto Global Descuento, Bonificaciones, Rebajas a Ventas Gravadas:</span><span>${fmt(descuGravada)}</span></div>
      <div class="bloque-totales-fila"><span>Sub Total:</span><span>${fmt(subTotal)}</span></div>
      <div class="bloque-totales-fila"><span>IVA 13%:</span><span>${fmt(ivaCalculado)}</span></div>
      <div class="bloque-totales-fila"><span>(-) IVA Retenido:</span><span>${fmt(ivaRete1)}</span></div>
      <div class="bloque-totales-fila"><span>(-) Retención Renta:</span><span>${fmt(reteRenta)}</span></div>
      <div class="bloque-totales-fila"><span>Monto Total de la Operación:</span><span>${fmt(montoTotalOperacion)}</span></div>
      <div class="bloque-totales-fila"><span>Total Otros Montos No Afectos:</span><span>${fmt(totalNoGravado)}</span></div>
      <div class="bloque-totales-fila"><span>Total a Pagar:</span><span>${fmt(totalPagar)}</span></div>
    </div>
  </div>

  <!-- PIE LEGAL -->
  <div class="pie-mh">
    <p>Documento generado electrónicamente. La validez de este DTE puede verificarse en el sitio web del Ministerio de Hacienda escaneando el código QR superior o visitando:</p>
    <p style="margin-top:4px;font-family:monospace;font-size:9px;word-break:break-all;color:#1B2E6B;"><strong>${urlConsulta}</strong></p>
    <p style="margin-top:6px;">Generado con <strong>ORIÓN</strong> · ONE GEO SYSTEMS</p>
  </div>

</div>
</body>
</html>`
  }

  const imprimirPDF = async (f) => {
    const html = await generarPDF(f)
    imprimirIframe(html)
  }

  // Descarga el JSON oficial del DTE: incluye el JWS firmado (legalmente válido),
  // el JSON estructurado tal cual lo recibió el MH, y el sello de recepción.
  // Es el archivo que se entrega al cliente como respaldo legal — su contador
  // lo usa para conciliar IVA. Conforme a la Normativa V2.0 del MH El Salvador.
  const descargarJSON = (f) => {
    try {
      // dte_json se guarda como string serializado en Firestore (más robusto).
      // Lo parseamos para reconstruirlo como objeto.
      let dteParseado = null
      if (f.dte_json) {
        try {
          dteParseado = typeof f.dte_json === 'string' ? JSON.parse(f.dte_json) : f.dte_json
        } catch (e) {
          console.warn('dte_json no se pudo parsear, usando fallback:', e)
        }
      }

      const dteOficial = {
        // 1. El DTE original (estructura V2.0) — si está disponible
        ...(dteParseado || {
          // Fallback: si no tenemos el dte_json guardado, armamos uno básico
          identificacion: {
            codigoGeneracion: f.codigoGeneracion,
            numeroControl: f.numeroControl,
            fecEmi: f.fechaEmision,
            ambiente: f.dte_ambiente || '00',
          },
          emisor: { nit: empresa.nit, nombre: empresa.empresaNombre },
          receptor: { nit: f.nit || null, nombre: f.cliente },
        }),
        // 2. Sello de recepción del MH (lo que valida el documento ante terceros)
        selloRecibido: f.dte_sello || null,
        // 3. Fecha/hora de procesamiento del MH
        fhProcesamiento: f.dte_fhProcesamiento || null,
        // 4. Estado de invalidación (si aplica)
        ...(f.dte_estado_invalidacion ? { invalidacion: f.dte_estado_invalidacion } : {}),
      }

      const blob = new Blob([JSON.stringify(dteOficial, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${f.numeroControl || f.numero}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Error al descargar JSON: ' + e.message)
    }
  }

  const imprimirTermico = (f) => {
    const tipo = getTipoInfo(f.tipoDte)
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:"Courier New",monospace;width:72mm;font-size:14px;color:#000;padding:3mm;}.c{text-align:center;}.b{font-weight:bold;}.sep{border-top:1px dashed #000;margin:5px 0;}.row{display:flex;justify-content:space-between;margin:2px 0;font-size:12px;}.empresa{font-size:15px;font-weight:900;text-align:center;}.dte{border:1px solid #000;text-align:center;padding:3px;margin:4px 0;font-weight:700;}.total{font-size:18px;font-weight:900;text-align:center;margin:6px 0;}.pie{font-size:11px;text-align:center;color:#555;}@media print{@page{margin:2mm;size:80mm auto;}}</style></head><body><div class="empresa">${empresa.empresaNombre || "Mi Empresa"}</div>${empresa.direccion ? `<div class="c" style="font-size:11px">${empresa.direccion}</div>` : ""}<div class="c" style="font-size:11px">NIT:${empresa.nit || "---"} NRC:${empresa.nrc || "---"}</div><div class="sep"></div>${f.anulada ? '<div style="border:2px solid #000;text-align:center;font-weight:900;padding:4px;margin:4px 0">*** ANULADO ***</div>' : ''}<div class="dte">${tipo.nombre}</div><div class="dte">${f.numero}</div><div class="sep"></div><div class="row"><span>Fecha:</span><span>${formatFecha(f.fechaEmision)}</span></div><div class="row"><span>Cliente:</span><span>${f.cliente}</span></div>${f.nit ? `<div class="row"><span>NIT:</span><span>${f.nit}</span></div>` : ""}<div class="sep"></div><div style="font-size:12px;margin:3px 0">${f.descripcion || "Productos/Servicios"}</div><div class="sep"></div><div class="row"><span>Subtotal:</span><span>$${(f.subtotal||0).toFixed(2)}</span></div><div class="row"><span>IVA 13%:</span><span>$${(f.iva||0).toFixed(2)}</span></div><div class="sep"></div><div class="total">TOTAL: $${(f.total||0).toFixed(2)}</div><div class="sep"></div><div class="pie">Gracias por su compra!</div><div class="pie">${empresa.empresaNombre || "ORION"}</div><div style="margin-top:8mm"></div></body></html>`
    imprimirIframe(html)
  }

  const compartirWA = (f) => {
    const tipo = getTipoInfo(f.tipoDte)
    const msg = encodeURIComponent(
      `Hola! Te comparto el detalle de tu documento fiscal:\n\n` +
      `*${tipo.nombre}*\n` +
      `No: *${f.numero}*\n` +
      `Fecha: ${formatFecha(f.fechaEmision)}\n` +
      `Cliente: *${f.cliente}*\n\n` +
      `Subtotal: ${fmt(f.subtotal)}\n` +
      `IVA 13%: ${fmt(f.iva)}\n` +
      `*TOTAL: ${fmt(f.total)}*\n\n` +
      `${f.notas ? `Notas: ${f.notas}\n\n` : ''}` +
      `Emitido por ${empresa.empresaNombre || 'ORION'}`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  // ── Contingencia ──
  // DTE pendientes = los que tienen codigoGeneracion pero aún no están PROCESADOS.
  const dtePendientes = facturas.filter(f =>
    f.codigoGeneracion && f.dte_estado !== 'PROCESADO' && f.estadoPago !== 'anulada'
  )

  const abrirContingencia = () => {
    const hoy = fechaSV()
    setContingenciaForm({
      fInicio: hoy, hInicio: '08:00',
      fFin: hoy, hFin: '17:00',
      tipoContingencia: '2',
      motivoContingencia: '',
      seleccionadas: {},
    })
    setContingenciaResultado(null)
    setContingenciaOpen(true)
  }

  const toggleContingenciaFactura = (id) => {
    setContingenciaForm(f => ({
      ...f,
      seleccionadas: { ...f.seleccionadas, [id]: !f.seleccionadas[id] }
    }))
  }

  const toggleTodasContingencia = () => {
    const todasSeleccionadas = dtePendientes.length > 0 &&
      dtePendientes.every(f => contingenciaForm.seleccionadas[f.id])
    const nuevas = {}
    if (!todasSeleccionadas) {
      dtePendientes.forEach(f => { nuevas[f.id] = true })
    }
    setContingenciaForm(f => ({ ...f, seleccionadas: nuevas }))
  }

  const enviarContingencia = async () => {
    const ids = Object.keys(contingenciaForm.seleccionadas).filter(id => contingenciaForm.seleccionadas[id])
    if (ids.length === 0) {
      alert('Seleccioná al menos un DTE para informar en contingencia.')
      return
    }
    if (contingenciaForm.tipoContingencia === '5' && !contingenciaForm.motivoContingencia.trim()) {
      alert('El tipo "Otro" requiere describir el motivo.')
      return
    }
    setEnviandoContingencia(true)
    setContingenciaResultado(null)
    try {
      const resp = await fetch('/api/dte/contingencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facturaIds: ids,
          tipoContingencia: parseInt(contingenciaForm.tipoContingencia),
          motivoContingencia: contingenciaForm.motivoContingencia || null,
          fInicio: contingenciaForm.fInicio,
          hInicio: (contingenciaForm.hInicio || '08:00') + ':00',
          fFin: contingenciaForm.fFin,
          hFin: (contingenciaForm.hFin || '17:00') + ':00',
          responsableId: user?.uid || null,
        })
      })
      const data = await resp.json()
      if (data.ok && data.estado === 'RECIBIDO') {
        setContingenciaResultado({
          ok: true,
          sello: data.selloRecibido,
          cantidad: data.cantidadDTE,
          mensaje: data.mensaje || 'Contingencia informada correctamente',
        })
      } else {
        setContingenciaResultado({
          ok: false,
          observaciones: data.observaciones || [data.mensaje || data.error || 'Error desconocido'],
        })
      }
    } catch (e) {
      setContingenciaResultado({ ok: false, observaciones: ['Error de conexión: ' + e.message] })
    } finally {
      setEnviandoContingencia(false)
    }
  }

  return (
    <>
      <style>{factStyles}</style>

      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">🧾 Facturas DTE</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {facturas.length} documentos
            <span className="firebase-badge">🔥 Firebase</span>
            <span className="dte-tag">🔒 MH SV</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {puede('crear_facturas') && (
            <button className="btn btn-ghost" onClick={abrirContingencia}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              🔌 Contingencia
            </button>
          )}
          {puede('crear_facturas') && <button className="btn btn-primary" onClick={abrirModal}>+ Emitir DTE</button>}
        </div>
      </div>

      {/* Resumen */}
      <div className="fact-resumen">
        <div className="resumen-card" style={{ '--rc-color': '#00d4aa' }}>
          <div className="resumen-label">TOTAL COBRADO</div>
          <div className="resumen-val" style={{ color: 'var(--accent)' }}>{fmt(totalPagadas)}</div>
          <div className="resumen-sub">{facturas.filter(f => f.estadoPago === 'pagada').length} facturas pagadas</div>
        </div>
        <div className="resumen-card" style={{ '--rc-color': '#f59e0b' }}>
          <div className="resumen-label">POR COBRAR</div>
          <div className="resumen-val" style={{ color: '#f59e0b' }}>{fmt(totalPendientes)}</div>
          <div className="resumen-sub">{facturas.filter(f => f.estadoPago === 'pendiente').length} pendientes</div>
        </div>
        <div className="resumen-card" style={{ '--rc-color': '#ef4444' }}>
          <div className="resumen-label">VENCIDAS</div>
          <div className="resumen-val" style={{ color: '#ef4444' }}>{fmt(totalVencidas)}</div>
          <div className="resumen-sub">{facturas.filter(f => f.estadoPago === 'vencida').length} documentos</div>
        </div>
        <div className="resumen-card" style={{ '--rc-color': '#4f8cff' }}>
          <div className="resumen-label">TOTAL DOCUMENTOS</div>
          <div className="resumen-val">{facturas.length}</div>
          <div className="resumen-sub">todos los tipos</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="filtros-bar">
        <input className="input" placeholder="🔍 Buscar cliente, No. DTE o NIT..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <div className="filter-tabs">
          {['todos', ...TIPOS_DTE.map(t => t.codigo)].map(t => (
            <button key={t} className={`filter-tab ${filtroTipo === t ? 'active' : ''}`} onClick={() => setFiltroTipo(t)}>
              {t === 'todos' ? 'Todos' : t}
            </button>
          ))}
        </div>
        <div className="filter-tabs">
          {['todos', 'pagada', 'pendiente', 'vencida', 'anulada'].map(e => (
            <button key={e} className={`filter-tab ${filtroEstado === e ? 'active' : ''}`} onClick={() => setFiltroEstado(e)}>
              {e.charAt(0).toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="card">
        {loading ? (
          <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">Cargando facturas...</div></div>
        ) : filtradas.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🧾</div>
            <div className="empty-text">{busqueda ? 'No se encontraron documentos' : 'Emite tu primer DTE'}</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="fact-tabla">
              <thead>
                <tr>
                  <th>TIPO</th><th>No. DTE</th><th>CLIENTE</th><th>NIT</th>
                  <th>SUBTOTAL</th><th>IVA</th><th>TOTAL</th>
                  <th>EMISION</th><th>VENCE</th><th>ESTADO</th><th></th>
                </tr>
              </thead>
              <tbody>
                {paginadas.map((f) => {
                  const tipo = getTipoInfo(f.tipoDte)
                  const esAnulada = f.estadoPago === 'anulada' || f.anulada
                  const estaAbierta = filaExpandida === f.id
                  const horaEmi = f.createdAt?.seconds
                    ? new Date(f.createdAt.seconds * 1000).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', hour12: true })
                    : ''
                  return (
                    <React.Fragment key={f.id}>
                      {/* FILA PRINCIPAL (clickeable para expandir, salvo en elementos interactivos) */}
                      <tr
                        className={`fact-tr-main ${esAnulada ? 'fila-anulada' : ''} ${estaAbierta ? 'fila-abierta' : ''}`}
                        onClick={(e) => {
                          // Ignorar clicks en elementos interactivos (select, button, input).
                          // Solo expandir si el click fue sobre celdas/texto.
                          const tag = e.target.tagName
                          if (tag === 'SELECT' || tag === 'OPTION' || tag === 'BUTTON' || tag === 'INPUT' || e.target.closest('select') || e.target.closest('button')) {
                            return
                          }
                          setFilaExpandida(estaAbierta ? null : f.id)
                        }}
                        style={{ cursor: 'pointer' }}>
                        <td>
                          <span className="tipo-tag" style={{ color: tipo.color, borderColor: tipo.color + '40', background: tipo.color + '12' }}>
                            {f.tipoDte}
                          </span>
                        </td>
                        <td className="mono" style={{ fontSize: 12, color: 'var(--accent2)' }}>{f.numero}</td>
                        <td style={{ fontWeight: 600 }}>{f.cliente}</td>
                        <td className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{f.nit || '—'}</td>
                        <td className="amount">{fmt(f.subtotal)}</td>
                        <td style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 13 }}>{fmt(f.iva)}</td>
                        <td className="amount" style={{ fontWeight: 700 }}>{fmt(f.total)}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                          <div>{formatFecha(f.fechaEmision)}</div>
                          {horaEmi && <div style={{ fontSize: 11, opacity: 0.75 }}>{horaEmi}</div>}
                        </td>
                        <td style={{ color: f.fechaVencimiento ? 'var(--accent3)' : 'var(--muted)', fontSize: 12 }}>{formatFecha(f.fechaVencimiento)}</td>
                        <td onClick={e => e.stopPropagation()}>
                          {esAnulada ? (
                            <span className="estado-pago anulada">
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }}/>
                              Anulada
                            </span>
                          ) : (
                            <select
                              className={`estado-pago ${f.estadoPago}`}
                              value={f.estadoPago}
                              onChange={e => cambiarEstado(f.id, e.target.value)}
                              style={{ border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 12, outline: 'none', background: 'transparent' }}>
                              {ESTADOS_PAGO.filter(e => e.value !== 'anulada').map(e => (
                                <option key={e.value} value={e.value}>{e.label}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`fact-cab-flecha ${estaAbierta ? 'abierta' : ''}`} style={{ display: 'inline-flex' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                          </span>
                        </td>
                      </tr>

                      {/* FILA EXPANDIDA — todas las tarjetas en una sola fila horizontal */}
                      {estaAbierta && (
                        <tr className="fact-tr-detalle"
                          onClick={e => e.stopPropagation()}
                          onPointerDown={e => e.stopPropagation()}>
                          <td colSpan={11} style={{ padding: 0 }}>
                            <div className="fact-tarjetas-fila"
                              onClick={e => e.stopPropagation()}
                              onPointerDown={e => e.stopPropagation()}>
                              {/* Sello MH si existe */}
                              {f.dte_sello && (
                                <div className="fact-sello-info">
                                  <span className="fact-sello-label">Sello MH:</span>
                                  <span className="fact-sello-valor">{f.dte_sello}</span>
                                </div>
                              )}

                              {/* Tarjetas grandes en una sola fila horizontal */}
                              <div className="fact-tarjetas-scroll">
                                <button className="fact-card-btn card-imprimir" onClick={() => imprimirTermico(f)}>
                                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                                  <div className="fact-card-titulo">Ticket</div>
                                  <div className="fact-card-desc">Térmico 80mm</div>
                                </button>

                                <button className="fact-card-btn card-imprimir" onClick={() => imprimirPDF(f)}>
                                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13h6M9 17h4"/></svg>
                                  <div className="fact-card-titulo">PDF</div>
                                  <div className="fact-card-desc">Documento</div>
                                </button>

                                {f.dte_estado === 'PROCESADO' && (
                                  <button className="fact-card-btn card-imprimir" onClick={() => descargarJSON(f)}>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M10 13l-2 2 2 2M14 13l2 2-2 2"/></svg>
                                    <div className="fact-card-titulo">JSON</div>
                                    <div className="fact-card-desc">Oficial MH</div>
                                  </button>
                                )}

                                {!esAnulada && puede('compartir_whatsapp') && (
                                  <button className="fact-card-btn card-compartir-wa" onClick={() => compartirWA(f)}>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                                    <div className="fact-card-titulo">WhatsApp</div>
                                    <div className="fact-card-desc">Enviar al chat</div>
                                  </button>
                                )}

                                {!esAnulada && (f.correo || f.email) && (
                                  <button className="fact-card-btn card-compartir-email" onClick={() => alert('Envío por correo: pendiente')}>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                    <div className="fact-card-titulo">Email</div>
                                    <div className="fact-card-desc">Enviar correo</div>
                                  </button>
                                )}

                                {!esAnulada && f.codigoGeneracion && f.dte_estado !== 'PROCESADO' && puede('crear_facturas') && (
                                  <button className="fact-card-btn card-transmitir" onClick={() => transmitirMH(f)} disabled={transmitiendo === f.id}>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                    <div className="fact-card-titulo">{transmitiendo === f.id ? 'Enviando...' : f.dte_estado === 'RECHAZADO' ? 'Reintentar' : 'Transmitir'}</div>
                                    <div className="fact-card-desc">{f.dte_estado === 'RECHAZADO' ? 'Reenvío MH' : 'Enviar al MH'}</div>
                                  </button>
                                )}

                                {(f.tipoDte === 'FE' || f.tipoDte === 'CCF') && f.dte_estado === 'PROCESADO' && !esAnulada && (
                                  <>
                                    <button className="fact-card-btn card-nc" onClick={async () => {
                                      setNcndTipo('NC'); setNcndOpen(f); setFilaExpandida(null)
                                      let datos = {
                                        nombre: f.cliente || '', nit: f.nit || '', nrc: f.nrc || '',
                                        codActividad: f.codActividad || '', descActividad: f.descActividad || f.actividad || '',
                                        departamento: f.codDep || (typeof f.direccion === 'object' ? f.direccion?.departamento : '') || '',
                                        municipio: f.codMun || (typeof f.direccion === 'object' ? f.direccion?.municipio : '') || '',
                                        distrito: f.distrito || '', codDistrito: f.codDistrito || '',
                                        complemento: f.complemento || (typeof f.direccion === 'object' ? f.direccion?.complemento : '') || (typeof f.direccion === 'string' ? f.direccion : ''),
                                        telefono: f.telefono || '', correo: f.email || f.correo || '',
                                        numeroDocumento: f.codigoGeneracion || '', fechaEmision: f.fechaEmision || '',
                                        tipoDocumento: '03', monto: '',
                                      }
                                      if (f.nit) {
                                        try {
                                          const q = query(collection(db, 'clientes'), where('nit', '==', f.nit))
                                          const snap = await getDocs(q)
                                          if (!snap.empty) {
                                            const cl = snap.docs[0].data()
                                            datos = { ...datos,
                                              codActividad: cl.codActividad || datos.codActividad,
                                              descActividad: cl.descActividad || datos.descActividad,
                                              departamento: cl.codDep || datos.departamento,
                                              municipio: cl.codMun || datos.municipio,
                                              distrito: cl.distrito || datos.distrito,
                                              codDistrito: cl.codDistrito || datos.codDistrito,
                                              complemento: cl.complemento || datos.complemento,
                                              telefono: cl.telefono || datos.telefono,
                                              correo: cl.email || datos.correo,
                                            }
                                          }
                                        } catch(e) { console.warn('No se pudo cargar cliente:', e) }
                                      }
                                      setNcndForm({
                                        tipoDocumento: datos.tipoDocumento, tipoGeneracion: '2',
                                        numeroDocumento: datos.numeroDocumento, fechaEmision: datos.fechaEmision,
                                        nombre: datos.nombre, nit: datos.nit, nrc: datos.nrc,
                                        codActividad: datos.codActividad, descActividad: datos.descActividad,
                                        departamento: datos.departamento, municipio: datos.municipio,
                                        distrito: datos.distrito, codDistrito: datos.codDistrito || '',
                                        complemento: datos.complemento, telefono: datos.telefono, correo: datos.correo,
                                        monto: '', motivo: '',
                                        itemsDevueltos: (f.items || []).map(it => {
                                          const pb = parseFloat(it.precioBase) || 0
                                          return { codigo: it.codigo || '', nombre: it.nombre || 'Sin nombre', precioBase: pb, precioAcreditar: pb, qtyOriginal: parseFloat(it.qty) || 1, qtyDevuelta: 0, seleccionado: false }
                                        }),
                                      })
                                    }}>
                                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="14" x2="16" y2="14"/></svg>
                                      <div className="fact-card-titulo">Nota Crédito</div>
                                      <div className="fact-card-desc">Devolución</div>
                                    </button>
                                    <button className="fact-card-btn card-nd" onClick={async () => {
                                      setNcndTipo('ND'); setNcndOpen(f); setFilaExpandida(null)
                                      let datos = {
                                        nombre: f.cliente || '', nit: f.nit || '', nrc: f.nrc || '',
                                        codActividad: f.codActividad || '', descActividad: f.descActividad || f.actividad || '',
                                        departamento: f.codDep || (typeof f.direccion === 'object' ? f.direccion?.departamento : '') || '',
                                        municipio: f.codMun || (typeof f.direccion === 'object' ? f.direccion?.municipio : '') || '',
                                        distrito: f.distrito || '', codDistrito: f.codDistrito || '',
                                        complemento: f.complemento || (typeof f.direccion === 'object' ? f.direccion?.complemento : '') || (typeof f.direccion === 'string' ? f.direccion : ''),
                                        telefono: f.telefono || '', correo: f.email || f.correo || '',
                                        numeroDocumento: f.codigoGeneracion || '', fechaEmision: f.fechaEmision || '',
                                        tipoDocumento: '03', monto: '',
                                      }
                                      if (f.nit) {
                                        try {
                                          const q = query(collection(db, 'clientes'), where('nit', '==', f.nit))
                                          const snap = await getDocs(q)
                                          if (!snap.empty) {
                                            const cl = snap.docs[0].data()
                                            datos = { ...datos,
                                              codActividad: cl.codActividad || datos.codActividad,
                                              descActividad: cl.descActividad || datos.descActividad,
                                              departamento: cl.codDep || datos.departamento,
                                              municipio: cl.codMun || datos.municipio,
                                              distrito: cl.distrito || datos.distrito,
                                              codDistrito: cl.codDistrito || datos.codDistrito,
                                              complemento: cl.complemento || datos.complemento,
                                              telefono: cl.telefono || datos.telefono,
                                              correo: cl.email || datos.correo,
                                            }
                                          }
                                        } catch(e) { console.warn('No se pudo cargar cliente:', e) }
                                      }
                                      setNcndForm({
                                        tipoDocumento: datos.tipoDocumento, tipoGeneracion: '2',
                                        numeroDocumento: datos.numeroDocumento, fechaEmision: datos.fechaEmision,
                                        nombre: datos.nombre, nit: datos.nit, nrc: datos.nrc,
                                        codActividad: datos.codActividad, descActividad: datos.descActividad,
                                        departamento: datos.departamento, municipio: datos.municipio,
                                        distrito: datos.distrito, codDistrito: datos.codDistrito || '',
                                        complemento: datos.complemento, telefono: datos.telefono, correo: datos.correo,
                                        monto: '', motivo: '',
                                        itemsDevueltos: (f.items || []).map(it => {
                                          const pb = parseFloat(it.precioBase) || 0
                                          return { codigo: it.codigo || '', nombre: it.nombre || 'Sin nombre', precioBase: pb, precioAcreditar: pb, qtyOriginal: parseFloat(it.qty) || 1, qtyDevuelta: 0, seleccionado: false }
                                        }),
                                      })
                                    }}>
                                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                                      <div className="fact-card-titulo">Nota Débito</div>
                                      <div className="fact-card-desc">Cargo adicional</div>
                                    </button>
                                  </>
                                )}

                                {!esAnulada && puede('eliminar_facturas') && (
                                  <button className="fact-card-btn card-anular" onClick={() => { setFilaExpandida(null); abrirAnulacion(f) }}>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                                    <div className="fact-card-titulo">Anular</div>
                                    <div className="fact-card-desc">Invalidar MH</div>
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>

            {/* ── CONTROLES DE PAGINACIÓN ── */}
            {totalPaginas > 1 && (
              <div className="fact-paginacion">
                <div className="fact-pag-info">
                  Mostrando <strong>{inicio + 1}-{Math.min(inicio + POR_PAGINA, filtradas.length)}</strong> de <strong>{filtradas.length}</strong>
                </div>
                <div className="fact-pag-controles">
                  <button
                    className="fact-pag-btn"
                    onClick={() => { setPaginaActual(1); setFilaExpandida(null) }}
                    disabled={paginaSegura === 1}
                    title="Primera página">
                    « Primera
                  </button>
                  <button
                    className="fact-pag-btn"
                    onClick={() => { setPaginaActual(p => Math.max(1, p - 1)); setFilaExpandida(null) }}
                    disabled={paginaSegura === 1}>
                    ‹ Anterior
                  </button>
                  <span className="fact-pag-actual">
                    Página <strong>{paginaSegura}</strong> de <strong>{totalPaginas}</strong>
                  </span>
                  <button
                    className="fact-pag-btn"
                    onClick={() => { setPaginaActual(p => Math.min(totalPaginas, p + 1)); setFilaExpandida(null) }}
                    disabled={paginaSegura === totalPaginas}>
                    Siguiente ›
                  </button>
                  <button
                    className="fact-pag-btn"
                    onClick={() => { setPaginaActual(totalPaginas); setFilaExpandida(null) }}
                    disabled={paginaSegura === totalPaginas}
                    title="Última página">
                    Última »
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL EMITIR DTE ── */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🧾 Emitir Nuevo DTE</div>

            <div className="modal-section">TIPO DE DOCUMENTO</div>
            <div className="tipo-grid">
              {TIPOS_DTE.map(t => (
                <div key={t.codigo}
                  className={`tipo-option ${form.tipoDte === t.codigo ? 'selected' : ''}`}
                  style={{ '--to-color': t.color }}
                  onClick={() => setForm(f => ({ ...f, tipoDte: t.codigo }))}>
                  <div className="tipo-option-code" style={{ color: t.color }}>{t.codigo}</div>
                  <div className="tipo-option-name">{t.nombre}</div>
                </div>
              ))}
            </div>

            <div className="modal-section">DATOS DEL CLIENTE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">NOMBRE / RAZON SOCIAL *</label>
                <input className="input" placeholder="Nombre del cliente" value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">NIT</label>
                  <input className="input" placeholder="0614-010190-101-3" value={form.nit} onChange={e => setForm(f => ({ ...f, nit: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">NRC {form.tipoDte === 'CCF' && <span style={{ color: 'var(--danger)' }}>*</span>}</label>
                  <input className="input" placeholder="12345-6" value={form.nrc} onChange={e => setForm(f => ({ ...f, nrc: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">DIRECCION</label>
                <input className="input" placeholder="Direccion del cliente" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
              </div>
            </div>

            <div className="modal-section">DETALLE Y MONTOS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">DESCRIPCION</label>
                <input className="input" placeholder="Venta de articulos" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">SUBTOTAL (SIN IVA) $</label>
                <input className="input" type="number" step="0.01" placeholder="0.00" value={form.subtotal} onChange={e => calcularIva(e.target.value)} />
              </div>
              <div className="iva-calc">
                <div className="iva-row"><span style={{ color: 'var(--muted)' }}>Subtotal</span><span className="amount">${parseFloat(form.subtotal || 0).toFixed(2)}</span></div>
                <div className="iva-row"><span style={{ color: 'var(--muted)' }}>IVA 13%</span><span className="amount" style={{ color: 'var(--accent3)' }}>${parseFloat(form.iva || 0).toFixed(2)}</span></div>
                <div className="iva-row total"><span>TOTAL</span><span className="amount" style={{ color: 'var(--accent)' }}>${parseFloat(form.total || 0).toFixed(2)}</span></div>
              </div>
            </div>

            <div className="modal-section">FECHAS Y ESTADO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">FECHA EMISION</label>
                  <input className="input" type="date" value={form.fechaEmision} onChange={e => setForm(f => ({ ...f, fechaEmision: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">FECHA VENCIMIENTO</label>
                  <input className="input" type="date" value={form.fechaVencimiento} onChange={e => setForm(f => ({ ...f, fechaVencimiento: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">ESTADO DE PAGO</label>
                <select className="input" value={form.estadoPago} onChange={e => setForm(f => ({ ...f, estadoPago: e.target.value }))}>
                  {ESTADOS_PAGO.filter(e => e.value !== 'anulada').map(e => (
                    <option key={e.value} value={e.value}>{e.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">NOTAS</label>
                <input className="input" placeholder="Observaciones adicionales" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando || !form.cliente}>
                {guardando ? '⏳ Guardando...' : '💾 Guardar DTE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DETALLE ── */}
      {detalleOpen && (
        <div className="modal-overlay" onClick={() => setDetalleOpen(null)}>
          <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            {(() => {
              const f = detalleOpen
              const tipo = getTipoInfo(f.tipoDte)
              const esAnulada = f.estadoPago === 'anulada' || f.anulada
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div className="modal-title" style={{ marginBottom: 0 }}>📄 Detalle del DTE</div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDetalleOpen(null)}>✕</button>
                  </div>

                  {esAnulada && (
                    <div className="anulacion-alert" style={{ marginBottom: 16 }}>
                      <div className="anulacion-alert-title">🚫 Documento Anulado</div>
                      <div className="anulacion-alert-body">Este documento fue anulado mediante Evento de Invalidación ante el Ministerio de Hacienda. No tiene validez fiscal.</div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                    <span className="tipo-tag" style={{ color: tipo.color, borderColor: tipo.color + '40', background: tipo.color + '12', fontSize: 13, padding: '5px 14px' }}>
                      {f.tipoDte} — {tipo.nombre}
                    </span>
                    <span className={`estado-pago ${f.estadoPago}`}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }}/>
                      {f.estadoPago?.charAt(0).toUpperCase() + f.estadoPago?.slice(1)}
                    </span>
                  </div>

                  <div className="detalle-grid">
                    {[
                      { label: 'No. DTE', value: f.numero, mono: true },
                      { label: 'Fecha Emision', value: formatFecha(f.fechaEmision) },
                      { label: 'Cliente', value: f.cliente },
                      { label: 'NIT', value: f.nit || '—', mono: true },
                      { label: 'NRC', value: f.nrc || '—', mono: true },
                      { label: 'Vence', value: formatFecha(f.fechaVencimiento) },
                    ].map(item => (
                      <div key={item.label} className="detalle-field">
                        <div className="detalle-field-label">{item.label}</div>
                        <div className="detalle-field-value" style={{ fontFamily: item.mono ? 'var(--mono)' : 'var(--font)' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {f.descripcion && (
                    <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>DESCRIPCION</div>
                      <div style={{ fontSize: 14 }}>{f.descripcion}</div>
                    </div>
                  )}

                  <div className="iva-calc">
                    <div className="iva-row"><span style={{ color: 'var(--muted)' }}>Subtotal</span><span className="amount">{fmt(f.subtotal)}</span></div>
                    <div className="iva-row"><span style={{ color: 'var(--muted)' }}>IVA (13%)</span><span className="amount" style={{ color: 'var(--accent3)' }}>{fmt(f.iva)}</span></div>
                    <div className="iva-row total"><span>TOTAL</span><span className="amount" style={{ color: 'var(--accent)', fontSize: 18 }}>{fmt(f.total)}</span></div>
                  </div>

                  {f.notas && (
                    <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, fontSize: 13, color: 'var(--muted)' }}>
                      📝 {f.notas}
                    </div>
                  )}

                  <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
                    {!esAnulada && (
                      <>
                        <button className="btn btn-wa" onClick={() => compartirWA(f)}>💬 WhatsApp</button>
                        {f.codigoGeneracion && f.dte_estado !== 'PROCESADO' && puede('crear_facturas') && (
                          <button
                            className="btn"
                            style={{
                              background: f.dte_estado === 'RECHAZADO' ? 'rgba(239,68,68,0.12)' : 'rgba(0,212,170,0.12)',
                              color: f.dte_estado === 'RECHAZADO' ? '#ef4444' : '#00d4aa',
                              border: `1.5px solid ${f.dte_estado === 'RECHAZADO' ? 'rgba(239,68,68,0.25)' : 'rgba(0,212,170,0.25)'}`
                            }}
                            onClick={() => transmitirMH(f)}
                            disabled={transmitiendo === f.id}>
                            {transmitiendo === f.id ? '⏳ Transmitiendo...' : f.dte_estado === 'RECHAZADO' ? '🔄 Reintentar al MH' : '📡 Transmitir al MH'}
                          </button>
                        )}
                        {f.dte_estado === 'PROCESADO' && (
                          <div style={{ flex: 1, padding: '8px 14px', background: 'rgba(0,212,170,0.08)', border: '1.5px solid rgba(0,212,170,0.25)', borderRadius: 10, fontSize: 12, color: '#00d4aa', fontFamily: 'var(--mono)' }}>
                            ✓ Transmitida al MH<br/>
                            <span style={{ fontSize: 10, opacity: 0.7 }}>Sello: {f.dte_sello}</span>
                          </div>
                        )}
                        <button className="btn btn-ghost" onClick={() => imprimirTermico(f)}>🧾 Ticket</button>
                        <button className="btn btn-pdf" onClick={() => imprimirPDF(f)}>📄 PDF</button>
                        {f.dte_estado === 'PROCESADO' && (
                          <button className="btn" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1.5px solid rgba(59,130,246,0.25)' }} onClick={() => descargarJSON(f)}>
                            📥 JSON
                          </button>
                        )}
                        {puede('eliminar_facturas') && (
                          <button className="btn btn-anular" onClick={() => { setDetalleOpen(null); abrirAnulacion(f) }}>🚫 Anular DTE</button>
                        )}
                      </>
                    )}
                    <button className="btn btn-primary" onClick={() => setDetalleOpen(null)}>Cerrar</button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── MODAL ANULACIÓN DTE ── */}
      {anulacionOpen && (
        <div className="modal-overlay" onClick={() => setAnulacionOpen(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ color: '#ef4444' }}>🚫 Anular DTE — Evento de Invalidación</div>

            {/* Info del documento */}
            <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{anulacionOpen.numero}</span>
                <span className="tipo-tag" style={{ color: getTipoInfo(anulacionOpen.tipoDte).color, borderColor: getTipoInfo(anulacionOpen.tipoDte).color + '40', background: getTipoInfo(anulacionOpen.tipoDte).color + '12' }}>
                  {anulacionOpen.tipoDte}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Cliente: <strong style={{ color: 'var(--text)' }}>{anulacionOpen.cliente}</strong></div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Total: <strong style={{ color: 'var(--text)' }}>{fmt(anulacionOpen.total)}</strong> — Emitida: <strong style={{ color: 'var(--text)' }}>{formatFecha(anulacionOpen.fechaEmision)}</strong></div>
            </div>

            {/* Badge de plazo */}
            {(() => {
              const v = validarPlazoAnulacion(anulacionOpen)
              return (
                <div className={`plazo-badge ${v.tipo === 'corto' ? 'plazo-24h' : 'plazo-3m'}`}>
                  ⏱ Plazo de anulación: <strong>{v.plazo}</strong> desde la emisión
                </div>
              )
            })()}

            {/* Alerta */}
            <div className="anulacion-alert">
              <div className="anulacion-alert-title">⚠️ Esta acción es irreversible</div>
              <div className="anulacion-alert-body">
                Se registrará un Evento de Invalidación conforme al Art. 115-A del Código Tributario de El Salvador.
                El documento quedará anulado en el sistema y no podrá ser reactivado.
              </div>
            </div>

            {/* Formulario */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">TIPO DE INVALIDACIÓN</label>
                <select className="input" value={formAnulacion.tipoInvalidacion} onChange={e => setFormAnulacion(f => ({ ...f, tipoInvalidacion: e.target.value, codigoGeneracionReemplazo: '' }))}>
                  {/* Tipo 1 (Error info) NO aplica para NC/ND según el MH.
                      Para NC/ND los errores se corrigen emitiendo otro DTE, no invalidando con tipo 1. */}
                  {!['NC','ND'].includes(anulacionOpen.tipoDte) && (
                    <option value="1">1 — Error en la información del documento</option>
                  )}
                  <option value="2">2 — Rescindir la operación (devolución, cancelación)</option>
                  {/* Tipo 3 (Otro motivo) fue restringido en el manual V1.2 del MH.
                      No se ofrece para evitar rechazos garantizados. */}
                </select>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  {formAnulacion.tipoInvalidacion === '1'
                    ? 'Requiere emitir primero el DTE corregido y pegarlo abajo.'
                    : 'La operación queda cancelada sin reemplazo.'}
                </div>
              </div>

              {/* Campo CÓDIGO DEL DTE REEMPLAZO solo cuando tipoInvalidacion === '1' */}
              {formAnulacion.tipoInvalidacion === '1' && (
                <div className="form-group">
                  <label className="form-label">CÓDIGO DE GENERACIÓN DEL DTE REEMPLAZO *</label>
                  <input
                    className="input"
                    placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                    value={formAnulacion.codigoGeneracionReemplazo}
                    onChange={e => setFormAnulacion(f => ({ ...f, codigoGeneracionReemplazo: e.target.value.toUpperCase().trim() }))}
                    style={{ fontFamily: 'var(--mono)', fontSize: 12 }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    UUID del DTE corregido que reemplaza al que se va a invalidar.
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">MOTIVO</label>
                <select className="input" value={formAnulacion.motivo} onChange={e => setFormAnulacion(f => ({ ...f, motivo: e.target.value }))}>
                  {MOTIVOS_ANULACION.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">DETALLE DEL MOTIVO *</label>
                <input
                  className="input"
                  placeholder="Describa el motivo de la anulación..."
                  value={formAnulacion.motivoDetalle}
                  onChange={e => setFormAnulacion(f => ({ ...f, motivoDetalle: e.target.value }))}
                />
              </div>

              {/* ── SOLICITANTE (solo si la factura es a Consumidor Final sin documento) ── */}
              {anulacionOpen && !anulacionOpen.nit && !anulacionOpen.dui && (
                <div style={{
                  marginTop: 16,
                  padding: 14,
                  border: '1.5px dashed #f59e0b',
                  borderRadius: 10,
                  background: 'rgba(245, 158, 11, 0.05)'
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', marginBottom: 4 }}>
                    👤 DATOS DEL SOLICITANTE *
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
                    Esta factura es a Consumidor Final sin documento. El MH exige los datos de quien solicita la anulación (cliente o representante).
                  </div>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">NOMBRE COMPLETO</label>
                    <input
                      className="input"
                      placeholder="Nombre y apellidos del solicitante"
                      value={formAnulacion.solicitanteNombre}
                      onChange={e => setFormAnulacion(f => ({ ...f, solicitanteNombre: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">TIPO DOC.</label>
                      <select
                        className="input"
                        value={formAnulacion.solicitanteTipoDoc}
                        onChange={e => setFormAnulacion(f => ({ ...f, solicitanteTipoDoc: e.target.value }))}>
                        <option value="13">DUI</option>
                        <option value="36">NIT</option>
                        <option value="03">Pasaporte</option>
                        <option value="02">Carnet Residente</option>
                        <option value="37">Otro</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">NÚMERO *</label>
                      <input
                        className="input"
                        placeholder={formAnulacion.solicitanteTipoDoc === '13' ? '01234567-8' : 'Número de documento'}
                        value={formAnulacion.solicitanteNumDoc}
                        onChange={e => setFormAnulacion(f => ({ ...f, solicitanteNumDoc: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setAnulacionOpen(null)}>Cancelar</button>
              <button
                className="btn btn-anular"
                onClick={ejecutarAnulacion}
                disabled={
                  anulando ||
                  !formAnulacion.motivoDetalle.trim() ||
                  (formAnulacion.tipoInvalidacion === '1' && !formAnulacion.codigoGeneracionReemplazo.trim()) ||
                  (anulacionOpen && !anulacionOpen.nit && !anulacionOpen.dui && !formAnulacion.solicitanteNumDoc.trim())
                }
                style={{ fontWeight: 700 }}>
                {anulando ? '⏳ Anulando...' : '🚫 Confirmar Anulación'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── MODAL NC / ND ── */}
      {ncndOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 580 }}>
            <div className="modal-title" style={{ color: ncndTipo === 'NC' ? '#8b5cf6' : '#f59e0b' }}>
              {ncndTipo === 'NC' ? '📝 Nota de Crédito' : '📋 Nota de Débito'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
              {ncndTipo === 'NC' ? 'Reduce o anula el monto de un DTE ya emitido' : 'Añade un cargo adicional a un DTE ya emitido'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '65vh', overflowY: 'auto', paddingRight: 4 }}>

              <div className="ncnd-section">
                <div className="ncnd-section-title">📎 DTE Relacionado</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div className="form-group">
                    <label className="form-label">Tipo documento *</label>
                    <div className="input" style={{
                      display: 'flex', alignItems: 'center',
                      background: 'var(--surface2)', cursor: 'not-allowed',
                      color: 'var(--text)', fontWeight: 600
                    }}>
                      03 — Crédito Fiscal (CCF)
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tipo generación *</label>
                    <select className="input" value={ncndForm.tipoGeneracion} onChange={e => setNcndForm(f => ({ ...f, tipoGeneracion: e.target.value }))}>
                      <option value="1">1 — Físico</option>
                      <option value="2">2 — Electrónico</option>
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label className="form-label">UUID (codigoGeneracion) del DTE *</label>
                  <input className="input" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                    value={ncndForm.numeroDocumento}
                    onChange={e => setNcndForm(f => ({ ...f, numeroDocumento: e.target.value }))}
                    style={{ fontFamily: 'var(--mono)', fontSize: 12 }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha emisión del DTE *</label>
                  <input className="input" type="date" value={ncndForm.fechaEmision} onChange={e => setNcndForm(f => ({ ...f, fechaEmision: e.target.value }))} />
                </div>
              </div>

              <div className="ncnd-section">
                <div className="ncnd-section-title">👤 Receptor</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input className="input" placeholder="Nombre / Razón Social *" value={ncndForm.nombre} onChange={e => setNcndForm(f => ({ ...f, nombre: e.target.value }))} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input className="input" placeholder="NIT *" value={ncndForm.nit} onChange={e => setNcndForm(f => ({ ...f, nit: e.target.value }))} />
                    <input className="input" placeholder="NRC *" value={ncndForm.nrc} onChange={e => setNcndForm(f => ({ ...f, nrc: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Actividad Económica *</label>
                    <BuscadorActividad
                      codActividad={ncndForm.codActividad}
                      descActividad={ncndForm.descActividad}
                      onChange={({ codigo, descripcion }) => setNcndForm(f => ({ ...f, codActividad: codigo, descActividad: descripcion }))}
                      placeholder="Buscar por código o descripción..."
                    />
                  </div>
                  <SelectorDepartamento
                    codDep={ncndForm.departamento}
                    codMun={ncndForm.municipio}
                    distrito={ncndForm.distrito || ''}
                    onChange={({ codDep, codMun, distrito, codDistrito }) => setNcndForm(f => ({ ...f, departamento: codDep, municipio: codMun, distrito: distrito || '', codDistrito: codDistrito || '' }))}
                  />
                  <input className="input" placeholder="Complemento de dirección" value={ncndForm.complemento} onChange={e => setNcndForm(f => ({ ...f, complemento: e.target.value }))} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input className="input" placeholder="Teléfono *" value={ncndForm.telefono} onChange={e => setNcndForm(f => ({ ...f, telefono: e.target.value }))} />
                    <input className="input" placeholder="Correo *" value={ncndForm.correo} onChange={e => setNcndForm(f => ({ ...f, correo: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="ncnd-section">
                <div className="ncnd-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>📦 Items a {ncndTipo === 'NC' ? 'acreditar' : 'cobrar'}</span>
                  {ncndForm.itemsDevueltos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setNcndForm(f => ({
                        ...f,
                        itemsDevueltos: f.itemsDevueltos.map(it => ({
                          ...it, seleccionado: true, qtyDevuelta: it.qtyOriginal
                        }))
                      }))}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 6,
                        border: '1.5px solid var(--border)', background: 'var(--surface2)',
                        cursor: 'pointer', color: ncndTipo === 'NC' ? '#8b5cf6' : '#f59e0b',
                        fontWeight: 600
                      }}
                    >
                      ✓ {ncndTipo === 'NC' ? 'Devolver TODO' : 'Cobrar TODO'}
                    </button>
                  )}
                </div>

                {ncndForm.itemsDevueltos.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)', padding: 10, textAlign: 'center' }}>
                    El DTE original no tiene items detallados.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ncndForm.itemsDevueltos.map((it, idx) => (
                      <div key={idx} style={{
                        background: 'var(--surface2)', border: '1.5px solid var(--border)',
                        borderRadius: 8, padding: '10px 12px',
                        opacity: it.seleccionado ? 1 : 0.55,
                        transition: 'opacity 0.15s'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <input
                            type="checkbox"
                            checked={it.seleccionado}
                            onChange={e => {
                              const checked = e.target.checked
                              setNcndForm(f => {
                                const items = [...f.itemsDevueltos]
                                items[idx] = {
                                  ...items[idx], seleccionado: checked,
                                  qtyDevuelta: checked ? items[idx].qtyOriginal : 0
                                }
                                return { ...f, itemsDevueltos: items }
                              })
                            }}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                          />
                          <span style={{ fontWeight: 600, fontSize: 13 }}>
                            {it.codigo ? <span style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{it.codigo} · </span> : null}
                            {it.nombre}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, marginLeft: 24 }}>
                          Original: {it.qtyOriginal} × ${it.precioBase.toFixed(4)} = ${(it.qtyOriginal * it.precioBase).toFixed(2)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 24, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, minWidth: 70 }}>{ncndTipo === 'NC' ? 'Devolver' : 'Cobrar'}:</span>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max={it.qtyOriginal}
                            step="any"
                            value={it.qtyDevuelta}
                            disabled={!it.seleccionado}
                            onChange={e => {
                              let qty = parseFloat(e.target.value) || 0
                              if (qty < 0) qty = 0
                              if (qty > it.qtyOriginal) qty = it.qtyOriginal
                              setNcndForm(f => {
                                const items = [...f.itemsDevueltos]
                                items[idx] = { ...items[idx], qtyDevuelta: qty }
                                return { ...f, itemsDevueltos: items }
                              })
                            }}
                            style={{ width: 80, fontSize: 13, padding: '4px 8px' }}
                          />
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>de {it.qtyOriginal}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 24, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, minWidth: 70 }}>Precio acred.:</span>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>$</span>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max={it.precioBase}
                            step="0.01"
                            value={it.precioAcreditar}
                            disabled={!it.seleccionado}
                            onChange={e => {
                              let p = parseFloat(e.target.value) || 0
                              if (p < 0) p = 0
                              if (p > it.precioBase) p = it.precioBase
                              setNcndForm(f => {
                                const items = [...f.itemsDevueltos]
                                items[idx] = { ...items[idx], precioAcreditar: p }
                                return { ...f, itemsDevueltos: items }
                              })
                            }}
                            style={{ width: 100, fontSize: 13, padding: '4px 8px' }}
                          />
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                            (orig. ${it.precioBase.toFixed(4)})
                          </span>
                        </div>
                        <div style={{ marginLeft: 24, fontSize: 12, fontWeight: 600, color: ncndTipo === 'NC' ? '#8b5cf6' : '#f59e0b' }}>
                          Subtotal item: ${(it.qtyDevuelta * it.precioAcreditar).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(() => {
                  const sub = ncndForm.itemsDevueltos.reduce((s, it) => s + (it.qtyDevuelta * it.precioAcreditar), 0)
                  const ivaCalc = Math.round(sub * 0.13 * 100) / 100
                  const totalCalc = Math.round((sub + ivaCalc) * 100) / 100
                  const subR = Math.round(sub * 100) / 100
                  return (
                    <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Subtotal:</span><strong>${subR.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>IVA 13%:</span><strong>${ivaCalc.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                        <span>Total {ncndTipo}:</span>
                        <strong style={{ color: ncndTipo === 'NC' ? '#8b5cf6' : '#f59e0b', fontSize: 14 }}>
                          ${totalCalc.toFixed(2)}
                        </strong>
                      </div>
                    </div>
                  )
                })()}

                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Motivo *</label>
                  <input className="input"
                    placeholder={ncndTipo === 'NC' ? 'Error en precio, devolución de producto...' : 'Cargo adicional, diferencia de precio...'}
                    value={ncndForm.motivo} onChange={e => setNcndForm(f => ({ ...f, motivo: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setNcndOpen(null)}>Cancelar</button>
              <button className="btn btn-primary"
                style={{ background: ncndTipo === 'NC' ? '#8b5cf6' : '#f59e0b', boxShadow: 'none' }}
                disabled={
                  guardandoNcNd || !ncndForm.nombre || !ncndForm.nit || !ncndForm.nrc ||
                  !ncndForm.numeroDocumento || !ncndForm.motivo ||
                  ncndForm.itemsDevueltos.filter(it => it.seleccionado && it.qtyDevuelta > 0).length === 0
                }
                onClick={async () => {
                  setGuardandoNcNd(true)
                  try {
                    // 1. Filtrar solo los items seleccionados con cantidad > 0
                    const itemsSel = ncndForm.itemsDevueltos.filter(it => it.seleccionado && it.qtyDevuelta > 0)
                    if (itemsSel.length === 0) {
                      alert('Seleccioná al menos un item con cantidad mayor a 0')
                      setGuardandoNcNd(false)
                      return
                    }

                    // 2. Calcular totales (mismo cálculo que se muestra en el modal)
                    const subtotal = itemsSel.reduce((s, it) => s + (it.qtyDevuelta * it.precioAcreditar), 0)
                    const iva = Math.round(subtotal * 0.13 * 100) / 100
                    const total = Math.round((subtotal + iva) * 100) / 100
                    const subR = Math.round(subtotal * 100) / 100

                    // 3. Generar codigoGeneracion nuevo para esta NC/ND
                    const codigoGeneracion = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random())).toUpperCase()

                    // 4. Construir items del DTE NC/ND (con la cantidad devuelta)
                    const itemsDTE = itemsSel.map(it => ({
                      codigo: it.codigo || '',
                      nombre: it.nombre,
                      precioBase: it.precioAcreditar,
                      precioConIva: Math.round(it.precioAcreditar * 1.13 * 10000) / 10000,
                      qty: it.qtyDevuelta,
                      subtotal: Math.round(it.qtyDevuelta * it.precioAcreditar * 100) / 100,
                    }))

                    // 5. Construir el documentoRelacionado (referencia al DTE original)
                    const docRel = {
                      tipoDocumento: ncndForm.tipoDocumento,
                      tipoGeneracion: parseInt(ncndForm.tipoGeneracion),
                      numeroDocumento: ncndForm.numeroDocumento,
                      fechaEmision: ncndForm.fechaEmision,
                    }

                    // 6. Crear doc en VENTAS (el endpoint lee de aquí para transmitir)
                    const ventaData = {
                      tipoDte: ncndTipo, // 'NC' o 'ND'
                      codigoGeneracion,
                      cliente: ncndForm.nombre,
                      nit: ncndForm.nit,
                      nrc: ncndForm.nrc,
                      codActividad: ncndForm.codActividad,
                      descActividad: ncndForm.descActividad,
                      codDep: ncndForm.departamento,
                      codMun: ncndForm.municipio,
                      codDistrito: ncndForm.codDistrito || '',
                      direccion: buildComplemento(ncndForm.distrito, ncndForm.complemento),
                      correo: ncndForm.correo,
                      telefono: ncndForm.telefono,
                      tipoPago: 'contado',
                      formaPago: 'efectivo',
                      items: itemsDTE,
                      subtotal: subR,
                      iva,
                      total,
                      documentoRelacionado: docRel,
                      motivo: ncndForm.motivo,
                      sucursalId: ncndOpen.sucursalId || '',
                      origenNcNd: true,
                      facturaOrigenId: ncndOpen.id,
                      estado: 'completada',
                      cajero: user?.displayName || user?.email || '',
                      cajeroId: user?.uid || '',
                      createdAt: serverTimestamp(),
                    }
                    const ventaRef = await addDoc(collection(db, 'ventas'), ventaData)

                    // 7. Crear doc en FACTURAS (para que aparezca en la lista)
                    await addDoc(collection(db, 'facturas'), {
                      tipoDte: ncndTipo,
                      numero: `${ncndTipo}-PENDIENTE`,
                      codigoGeneracion,
                      cliente: ncndForm.nombre,
                      nit: ncndForm.nit, nrc: ncndForm.nrc,
                      codActividad: ncndForm.codActividad,
                      descActividad: ncndForm.descActividad,
                      codDep: ncndForm.departamento, codMun: ncndForm.municipio,
                      codDistrito: ncndForm.codDistrito || '',
                      distrito: ncndForm.distrito || '',
                      direccion: buildComplemento(ncndForm.distrito, ncndForm.complemento),
                      telefono: ncndForm.telefono, email: ncndForm.correo,
                      documentoRelacionado: docRel,
                      items: itemsDTE,
                      subtotal: subR, iva, total,
                      motivo: ncndForm.motivo,
                      estadoPago: 'pagada', tipoPago: 'contado',
                      fechaEmision: fechaSV(),
                      sucursalId: ncndOpen.sucursalId || '',
                      origenNcNd: true,
                      facturaOrigenId: ncndOpen.id,
                      ventaId: ventaRef.id,
                      estado: 'pendiente_envio',
                      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                    })

                    // 8. Cerrar modal y resetear form
                    setNcndOpen(null)
                    setNcndForm({
                      nombre: '', nit: '', nrc: '', codActividad: '', descActividad: '',
                      departamento: '', municipio: '', distrito: '', codDistrito: '', complemento: '',
                      telefono: '', correo: '', tipoDocumento: '01', tipoGeneracion: '2',
                      numeroDocumento: '', fechaEmision: '', monto: '', motivo: '',
                      itemsDevueltos: [],
                    })

                    // 9. Transmitir al MH
                    const resp = await fetch('/api/dte/transmitir', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ventaId: ventaRef.id })
                    })
                    const data = await resp.json()

                    if (data.ok && data.estado === 'PROCESADO') {
                      alert(`✅ ${ncndTipo} transmitida y procesada por el MH.\n\nSello: ${data.selloRecibido}\nNúmero de control: ${data.numeroControl}`)
                    } else if (data.estado === 'RECHAZADO') {
                      const obs = Array.isArray(data.observaciones) ? data.observaciones.join('\n') : (data.observaciones || data.detalleMH?.descripcionMsg || 'Sin detalles')
                      alert(`❌ ${ncndTipo} RECHAZADA por el MH\n\n${obs}\n\nEl ${ncndTipo} quedó guardado como pendiente. Corregí los datos y reintentá con el botón 📡.`)
                    } else {
                      alert(`⚠️ Respuesta inesperada del servidor\n\n${data.error || JSON.stringify(data).slice(0, 200)}\n\nEl ${ncndTipo} quedó guardado. Reintentá con el botón 📡.`)
                    }
                  } catch (e) {
                    alert('Error: ' + e.message)
                  }
                  setGuardandoNcNd(false)
                }}>
                {guardandoNcNd ? '⏳ Procesando...' : 'Emitir ' + ncndTipo}
              </button>
            </div>
          </div>
        </div>
      )}

    {/* ── Modal de Contingencia ── */}
      {contingenciaOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 19, display: 'flex', alignItems: 'center', gap: 8 }}>
                  🔌 Evento de Contingencia
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  Informá al Ministerio de Hacienda los DTE emitidos sin conexión
                </p>
              </div>
              <button onClick={() => setContingenciaOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>
                ×
              </button>
            </div>

            {!contingenciaResultado && (
              <>
                {/* Período */}
                <div className="modal-section">Período de la contingencia</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">Desde</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="date" className="input" value={contingenciaForm.fInicio}
                        onChange={e => setContingenciaForm(f => ({ ...f, fInicio: e.target.value }))} />
                      <input type="time" className="input" value={contingenciaForm.hInicio} style={{ maxWidth: 100 }}
                        onChange={e => setContingenciaForm(f => ({ ...f, hInicio: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Hasta</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="date" className="input" value={contingenciaForm.fFin}
                        onChange={e => setContingenciaForm(f => ({ ...f, fFin: e.target.value }))} />
                      <input type="time" className="input" value={contingenciaForm.hFin} style={{ maxWidth: 100 }}
                        onChange={e => setContingenciaForm(f => ({ ...f, hFin: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* Motivo */}
                <div className="modal-section">Motivo</div>
                <select className="input" value={contingenciaForm.tipoContingencia}
                  onChange={e => setContingenciaForm(f => ({ ...f, tipoContingencia: e.target.value }))}>
                  <option value="1">1 — No disponibilidad del sistema del MH</option>
                  <option value="2">2 — No disponibilidad de internet del emisor</option>
                  <option value="3">3 — Falla en el suministro eléctrico</option>
                  <option value="4">4 — Falla en el sistema del emisor</option>
                  <option value="5">5 — Otro</option>
                </select>
                {contingenciaForm.tipoContingencia === '5' && (
                  <input className="input" style={{ marginTop: 8 }} placeholder="Describí el motivo de la contingencia"
                    value={contingenciaForm.motivoContingencia}
                    onChange={e => setContingenciaForm(f => ({ ...f, motivoContingencia: e.target.value }))} />
                )}

                {/* DTE pendientes */}
                <div className="modal-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>DTE pendientes de transmisión</span>
                  {dtePendientes.length > 0 && (
                    <button onClick={toggleTodasContingencia}
                      style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
                      {dtePendientes.every(f => contingenciaForm.seleccionadas[f.id]) ? 'Quitar todos' : 'Seleccionar todos'}
                    </button>
                  )}
                </div>

                {dtePendientes.length === 0 ? (
                  <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, background: 'var(--surface2)', borderRadius: 10, border: '1.5px solid var(--border)' }}>
                    No hay DTE pendientes de transmisión. <br />
                    <span style={{ fontSize: 11 }}>Todos los documentos ya fueron procesados por el MH.</span>
                  </div>
                ) : (
                  <div style={{ maxHeight: 240, overflowY: 'auto', border: '1.5px solid var(--border)', borderRadius: 10 }}>
                    {dtePendientes.map(f => {
                      const tipo = TIPOS_DTE.find(t => t.codigo === f.tipoDte)
                      const sel = !!contingenciaForm.seleccionadas[f.id]
                      return (
                        <div key={f.id} onClick={() => toggleContingenciaFactura(f.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                            borderBottom: '1px solid var(--border)', cursor: 'pointer',
                            background: sel ? 'rgba(0,212,170,0.06)' : 'transparent'
                          }}>
                          <input type="checkbox" checked={sel} readOnly
                            style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                          <span className="tipo-tag" style={{ color: tipo?.color, borderColor: tipo?.color }}>
                            {f.tipoDte}
                          </span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent2)', flex: 1 }}>
                            {f.numero || f.numeroControl || f.codigoGeneracion?.slice(0, 13)}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {f.cliente}
                          </span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>
                            {fmt(f.total)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
                {dtePendientes.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                    {Object.values(contingenciaForm.seleccionadas).filter(Boolean).length} seleccionados de {dtePendientes.length}
                  </div>
                )}

                {/* Botones */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                  <button className="btn btn-ghost" onClick={() => setContingenciaOpen(false)}>
                    Cancelar
                  </button>
                  <button className="btn btn-primary" onClick={enviarContingencia}
                    disabled={enviandoContingencia || dtePendientes.length === 0}>
                    {enviandoContingencia ? '⏳ Enviando...' : '📡 Informar al MH'}
                  </button>
                </div>
              </>
            )}

            {/* Resultado */}
            {contingenciaResultado && (
              <div style={{ marginTop: 16 }}>
                {contingenciaResultado.ok ? (
                  <div style={{ padding: '18px 16px', background: 'rgba(0,212,170,0.08)', border: '1.5px solid rgba(0,212,170,0.3)', borderRadius: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)', marginBottom: 8 }}>
                      ✓ Contingencia informada
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>
                      {contingenciaResultado.cantidad} DTE reportados correctamente al MH.
                    </div>
                    {contingenciaResultado.sello && (
                      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)', wordBreak: 'break-all' }}>
                        Sello: {contingenciaResultado.sello}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '18px 16px', background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.3)', borderRadius: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--danger)', marginBottom: 8 }}>
                      ✕ Contingencia rechazada
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text)' }}>
                      {contingenciaResultado.observaciones.map((o, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>{o}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                  {!contingenciaResultado.ok && (
                    <button className="btn btn-ghost" onClick={() => setContingenciaResultado(null)}>
                      ← Volver
                    </button>
                  )}
                  <button className="btn btn-primary" onClick={() => setContingenciaOpen(false)}>
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </>
  )
}