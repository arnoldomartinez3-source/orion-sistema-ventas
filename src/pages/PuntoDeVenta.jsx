import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { db } from '../firebase'
import { getNombreDep, getNombreMun } from '../data/departamentosMunicipios'
import {
  collection, onSnapshot, doc, serverTimestamp,
  runTransaction, getDocs, getDoc, addDoc, query, where
} from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'
import { useAuth } from '../AuthContext'
import { generarPDF, generarTicket, imprimirIframe } from '../utils/imprimir'
import { orionPrompt } from '../orionDialog'

const IVA = 0.13

// Devuelve la fecha actual en zona America/El_Salvador (UTC-6), formato YYYY-MM-DD.
// Necesario porque new Date().toISOString() devuelve UTC, lo que en horarios
// nocturnos SV (después de 6PM) genera fechas del día siguiente.
function fechaSV() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
}

const TIPOS_DTE = [
  { codigo: 'FE',  nombre: 'Consumidor Final',    desc: 'Sin NRC',     color: '#00d4aa', icon: '🧾' },
  { codigo: 'CCF', nombre: 'Crédito Fiscal',      desc: 'Con NRC',     color: '#4f8cff', icon: '🏢' },
]
// NC y ND se emiten desde el módulo Facturas DTE; FEX desde Operaciones (uso raro). No en el POS.


const FORMAS_PAGO = [
  { id: 'efectivo',      icon: '💵', label: 'Efectivo',      color: '#00d4aa', key: '1' },
  { id: 'tarjeta',       icon: '💳', label: 'Tarjeta',       color: '#4f8cff', key: '2' },
  { id: 'transferencia', icon: '🏦', label: 'Transferencia', color: '#8b5cf6', key: '3' },
  { id: 'cheque',        icon: '📝', label: 'Cheque',        color: '#f59e0b', key: '4' },
  { id: 'mixto',         icon: '🔀', label: 'Mixto',         color: '#ec4899', key: '5' },
]

// ── ICONO SVG INLINE PARA PRODUCTOS (siempre carga, sin dependencias) ──
// ── Ícono automático por producto (emoji) ──────────────────────────────
// Asigna un emoji + tono de color según la categoría o el nombre del producto.
// Es TEXTO (Unicode), no imágenes: cero almacenamiento, cero costo de Firebase,
// se calcula al instante en el navegador. Si el producto tiene imagen propia,
// esa manda; esto es el fallback lindo en vez del candado genérico.
const ICONO_POR_CATEGORIA = {
  audio: ['🎧', 'audio'], accesorios: ['🔌', 'acc'], servicios: ['🔧', 'serv'],
  servicio: ['🔧', 'serv'], almacenamiento: ['💾', 'alm'], computadoras: ['💻', 'acc'],
  telefonia: ['📱', 'acc'], 'telefonía': ['📱', 'acc'], hogar: ['🏠', 'acc'],
  oficina: ['📎', 'acc'], herramientas: ['🛠️', 'serv'], redes: ['🌐', 'serv'],
}
const ICONO_POR_PALABRA = [
  [/parlante|bocina|speaker|sonido/i, '🔊', 'audio'],
  [/audifon|aud[íi]fono|auricular|headphone|earbud/i, '🎧', 'audio'],
  [/c[áa]mara|webcam|vigila|seguridad/i, '📷', 'serv'],
  [/cable|hdmi|adaptador|conector/i, '🔌', 'acc'],
  [/cargador|bater[íi]a|power\s?bank|pila/i, '🔋', 'pow'],
  [/memoria|usb|microsd|flash|pendrive/i, '💾', 'alm'],
  [/disco|ssd|hdd|almacen/i, '💿', 'alm'],
  [/mouse|rat[óo]n|teclado|keyboard/i, '⌨️', 'acc'],
  [/monitor|pantalla|display|tv\b/i, '🖥️', 'acc'],
  [/laptop|computad|\bpc\b|cpu|notebook/i, '💻', 'acc'],
  [/tel[ée]fono|celular|smartphone|m[óo]vil/i, '📱', 'acc'],
  [/router|red|wifi|internet|switch/i, '🌐', 'serv'],
  [/instala|mantenim|reparac|formate|configur|soporte t[ée]cnico/i, '🔧', 'serv'],
  [/soporte|base|stand|tripode|tr[íi]pode/i, '📐', 'acc'],
  [/impresora|tinta|t[óo]ner|impresi[óo]n/i, '🖨️', 'acc'],
  [/tarjeta|placa|chip/i, '🎛️', 'acc'],
]
function iconoDeProducto(p) {
  const cat = (p?.categoria || '').toLowerCase().trim()
  if (ICONO_POR_CATEGORIA[cat]) return ICONO_POR_CATEGORIA[cat]
  const txt = `${p?.nombre || ''} ${p?.categoria || ''}`
  for (const [re, emoji, tono] of ICONO_POR_PALABRA) if (re.test(txt)) return [emoji, tono]
  if ((p?.unidad || '').toLowerCase() === 'servicio') return ['🛠️', 'serv']
  return ['📦', 'acc']
}
const ProductIcon = ({ producto }) => {
  const [emoji, tono] = iconoDeProducto(producto)
  return <span className={`prod-emoji tono-${tono}`}>{emoji}</span>
}

const pvStyles = `
  /* Cancela solo el padding SUPERIOR del .main-content (los lados quedan normales para no chocar con el sidebar) */
  .pv-fullbleed { margin-top: -24px; }
  @media (max-width: 768px) { .pv-fullbleed { margin-top: -16px; } }

  /* ── LAYOUT 50/50 ── */
  .pv-3col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    align-items: stretch;
    height: calc(100vh - 120px); /* respaldo; el JS ajusta al alto real disponible */
  }

  .pv-col { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

  /* ── MÓVIL: tabs (debe ir DESPUÉS de la regla base para sobreescribirla) ── */
  @media (max-width: 768px) {
    .pv-3col { grid-template-columns: 1fr; height: auto; gap: 0; }
    .pv-col { display: none; height: calc(100vh - 200px); }
    .pv-col.tab-activo { display: flex; flex-direction: column; }
  }

  /* TABS MÓVIL */
  .pv-tabs {
    display: none; margin-bottom: 10px;
    background: var(--surface); border: 1.5px solid var(--border);
    border-radius: 14px; padding: 5px; gap: 4px;
  }
  @media (max-width: 960px) { .pv-tabs { display: flex; } }
  .pv-tab {
    flex: 1; padding: 10px 6px; border-radius: 10px; border: none;
    cursor: pointer; font-family: var(--font); font-size: 13px; font-weight: 700;
    transition: all 0.15s; color: var(--muted); background: transparent;
    display: flex; align-items: center; justify-content: center; gap: 6px;
  }
  .pv-tab.active { background: var(--accent); color: #fff; box-shadow: 0 3px 10px rgba(0,212,170,0.3); }
  .pv-tab-badge { background: var(--danger); color: #fff; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 99px; }
  .pv-tab.active .pv-tab-badge { background: rgba(0,0,0,0.2); color: #fff; }

  /* MINI-BAR CARRITO MÓVIL — fija al pie cuando estás en Productos con items */
  .pv-minibar {
    display: none;
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--accent); color: #fff;
    padding: 12px 18px;
    align-items: center; justify-content: space-between;
    box-shadow: 0 -4px 20px rgba(0,212,170,0.35);
    z-index: 50; cursor: pointer;
    animation: minibarUp 0.25s ease-out;
  }
  @keyframes minibarUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @media (max-width: 960px) { .pv-minibar.visible { display: flex; } }
  .pv-minibar-info { display: flex; align-items: center; gap: 12px; }
  .pv-minibar-icon { font-size: 24px; }
  .pv-minibar-text { line-height: 1.2; }
  .pv-minibar-count { font-size: 11px; font-weight: 700; opacity: 0.75; }
  .pv-minibar-total { font-size: 17px; font-weight: 800; font-family: var(--mono); }
  .pv-minibar-cta { background: rgba(0,0,0,0.15); padding: 8px 14px; border-radius: 10px; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; }

  /* BADGE CANTIDAD EN CARRITO (sobre producto-card) */
  .prod-en-carrito-badge {
    position: absolute; top: 4px; right: 4px;
    background: var(--accent); color: #fff;
    font-size: 10px; font-weight: 900;
    min-width: 20px; height: 20px;
    border-radius: 99px;
    display: flex; align-items: center; justify-content: center;
    padding: 0 6px;
    box-shadow: 0 2px 6px rgba(0,212,170,0.4);
    z-index: 2;
  }
  .producto-card.en-carrito { border-color: rgba(0,212,170,0.4); background: rgba(0,212,170,0.04); }

  /* PRODUCTOS */
  .prod-search { padding: 10px 12px; border-bottom: 1px solid var(--border); }
  .pos-chips { display: flex; flex-wrap: wrap; gap: 7px; padding: 10px 12px 4px; flex-shrink: 0; }
  .pos-chip { font-size: 12px; font-weight: 600; padding: 6px 13px; border-radius: 20px; border: 1.5px solid var(--border); background: var(--surface2); color: var(--muted); cursor: pointer; white-space: nowrap; transition: all .12s; font-family: var(--font); flex-shrink: 0; }
  .pos-chip:hover:not(.on) { border-color: var(--border2); color: var(--text); }
  .pos-chip.on { background: var(--accent); border-color: var(--accent); color: #fff; }
  /* GRID PRODUCTOS — cuadrícula táctil */
  .producto-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(138px, 1fr)); gap: 10px; padding: 12px; overflow-y: auto; flex: 1; align-content: start; }

  .producto-card { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 14px; cursor: pointer; transition: transform 0.12s, box-shadow 0.12s, border-color 0.12s; position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 14px 10px 16px; gap: 7px; min-height: 158px; }
  .producto-card:hover { border-color: var(--accent); box-shadow: 0 8px 22px var(--shadow); transform: translateY(-3px); }
  .producto-card:active { transform: scale(0.97); }
  .producto-card.agotado { opacity: 0.45; cursor: not-allowed; }
  .producto-card.agotado:hover { border-color: var(--border); box-shadow: none; transform: none; }
  .producto-card.focused { border-color: var(--accent) !important; box-shadow: 0 0 0 3px rgba(0,212,170,0.25) !important; transform: translateY(-3px); }
  .agotado-badge { position: absolute; top: 6px; left: 6px; background: var(--danger); color: #fff; font-size: 8px; font-weight: 800; padding: 2px 5px; border-radius: 4px; z-index: 2; }
  .prod-info { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; min-width: 0; }
  .prod-nombre { font-size: 12.5px; font-weight: 600; line-height: 1.25; color: var(--text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.5em; width: 100%; }
  .prod-cod-inline { font-family: var(--mono); color: var(--text2); font-weight: 600; }
  .prod-precio-iva { font-family: var(--mono); font-size: 17px; font-weight: 800; color: var(--accent); white-space: nowrap; }
  .prod-precio-base { display: none; }
  .prod-stock { font-size: 11px; color: var(--text2); font-weight: 600; white-space: nowrap; }
  .prod-stock.ok { color: var(--text2); }
  .prod-stock.low { color: var(--accent3); font-weight: 700; }
  .prod-stock.out { color: var(--danger); font-weight: 700; }
  .prod-img-wrap { flex-shrink: 0; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; overflow: hidden; }
  .prod-img { display: none; }
  .prod-emoji { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 26px; line-height: 1; border-radius: 14px; }
  .prod-emoji.tono-audio { background: rgba(124,63,214,0.15); }
  .prod-emoji.tono-acc   { background: rgba(43,110,190,0.15); }
  .prod-emoji.tono-serv  { background: rgba(180,130,30,0.18); }
  .prod-emoji.tono-alm   { background: rgba(21,138,82,0.15); }
  .prod-emoji.tono-pow   { background: rgba(200,70,47,0.15); }

  /* ── TOGGLE DE VISTA (grid / tabla) ── */
  .vista-toggle { display: flex; gap: 2px; background: var(--surface2); border: 1px solid var(--border); border-radius: 9px; padding: 2px; align-self: center; }
  .vista-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 26px; border: none; border-radius: 7px; background: none; color: var(--muted); cursor: pointer; transition: all .12s; }
  .vista-btn:hover { color: var(--text); }
  .vista-btn.on { background: var(--surface); color: var(--accent); box-shadow: 0 1px 3px var(--shadow2); }

  /* ── VISTA TABLA (lista densa) ── */
  .producto-tabla { flex: 1; overflow-y: auto; }
  .tabla-head { display: grid; grid-template-columns: 56px 1fr 100px 92px; gap: 12px; padding: 10px 18px; position: sticky; top: 0; background: var(--surface2); border-bottom: 1.5px solid var(--border); font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); z-index: 2; }
  .prod-fila { display: grid; grid-template-columns: 56px 1fr 100px 92px; gap: 12px; align-items: center; padding: 9px 18px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background .12s; }
  .prod-fila:hover { background: rgba(0,212,170,0.05); }
  .prod-fila.focused { background: rgba(0,212,170,0.1); box-shadow: inset 3px 0 0 var(--accent); }
  .prod-fila.en-carrito { background: rgba(0,212,170,0.05); }
  .prod-fila.agotado { opacity: 0.45; cursor: not-allowed; }
  .prod-fila.agotado:hover { background: none; }
  .pf-cod { font-family: var(--mono); font-size: 12.5px; font-weight: 700; color: var(--accent); }
  .pf-nom { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .pf-nom-txt { font-size: 14.5px; font-weight: 500; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pf-encarrito { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: var(--accent); color: #fff; font-size: 10px; font-weight: 800; min-width: 18px; height: 18px; border-radius: 99px; padding: 0 5px; }
  .pf-stock { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.1; }
  .pf-stock-n { font-size: 13.5px; font-weight: 600; color: var(--muted); opacity: 0.85; }
  .pf-stock-u { font-size: 10px; color: var(--muted); font-weight: 400; text-transform: lowercase; }
  .pf-stock.low .pf-stock-n { color: var(--accent3); }
  .pf-stock.out .pf-stock-n { color: var(--danger); }
  .pf-stock-serv { font-size: 12px; color: var(--muted); font-weight: 600; }
  .pf-precio { font-family: var(--mono); font-size: 16px; font-weight: 800; color: var(--text); text-align: right; white-space: nowrap; }

  /* IMAGEN AMPLIADA — popover draggable */
  .img-popover { position: fixed; z-index: 400; background: var(--surface); border: 2px solid var(--accent); border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); overflow: hidden; animation: popIn 0.15s ease; pointer-events: auto; cursor: move; user-select: none; }
  @keyframes popIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
  .img-popover img { display: block; width: 300px; height: 300px; object-fit: cover; pointer-events: none; }
  .img-popover-nombre { padding: 10px 14px; font-size: 13px; font-weight: 700; border-top: 1px solid var(--border); background: var(--surface2); }
  .img-popover-close { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 99px; background: rgba(0,0,0,0.6); color: #fff; border: none; cursor: pointer; font-size: 15px; display: flex; align-items: center; justify-content: center; font-weight: 700; z-index: 1; }
  .img-backdrop { position: fixed; inset: 0; z-index: 399; }

  /* TABS PAUSA */
  .pausa-bar { display: flex; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--surface2); overflow-x: auto; flex-shrink: 0; align-items: center; }
  .pausa-tab { display: flex; align-items: center; gap: 7px; padding: 8px 16px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--surface); font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: all 0.15s; color: var(--muted); flex-shrink: 0; }
  .pausa-tab.active { border-color: var(--accent); color: var(--accent); background: rgba(0,212,170,0.06); }
  .pausa-tab:hover:not(.active) { border-color: var(--border2); color: var(--text); }
  .pausa-tab.nueva { border-style: dashed; padding: 8px 18px; }
  .pausa-tab.nueva:hover { border-color: var(--accent); color: var(--accent); }
  .pausa-count { background: var(--accent); color: #fff; font-size: 9px; font-weight: 900; padding: 1px 5px; border-radius: 99px; }
  .pausa-count.rojo { background: var(--danger); color: #fff; }

  /* MODAL TICKET */
  .ticket-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 500; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(6px); }
  .ticket-modal { background: var(--surface); border: 1.5px solid var(--border); border-radius: 20px; padding: 28px; width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 80px var(--shadow); }

  /* CARRITO */
  .carrito-col { background: var(--surface); border: 1px solid color-mix(in srgb, var(--border) 55%, transparent); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; flex: 1; }
  .carrito-header { padding: 8px 12px; border-bottom: 1.5px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: var(--surface2); flex-shrink: 0; }
  .carrito-title { font-size: 13px; font-weight: 800; display: flex; align-items: center; gap: 6px; }
  .carrito-count { background: var(--accent); color: #fff; font-size: 11px; font-weight: 800; padding: 2px 9px; border-radius: 99px; }

  .carrito-cliente { padding: 6px 10px; border-bottom: 1px solid var(--border); position: relative; flex-shrink: 0; }
  .cliente-dropdown { position: absolute; left: 0; right: 0; top: 100%; background: var(--surface); border: 1.5px solid var(--accent); border-radius: 10px; z-index: 1100; box-shadow: 0 12px 40px var(--shadow); overflow: hidden; max-height: 260px; overflow-y: auto; }
  .cliente-option { padding: 12px 16px; cursor: pointer; transition: background 0.12s; border-bottom: 1px solid var(--border); }
  .cliente-option:last-child { border-bottom: none; }
  .cliente-option:hover { background: var(--glow); }
  .cliente-option-focused { background: rgba(0,212,170,0.12) !important; border-left: 3px solid var(--accent); color: var(--accent); }
  .cliente-option-nombre { font-size: 14px; font-weight: 700; }
  .cliente-option-detalle { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .cliente-seleccionado { display: flex; align-items: center; justify-content: space-between; background: var(--glow); border: 1.5px solid var(--accent); border-radius: 8px; padding: 8px 12px; margin-top: 6px; }
  .cliente-sel-nombre { font-size: 13px; font-weight: 700; color: var(--accent); }
  .cliente-sel-detalle { font-size: 10px; color: var(--muted); margin-top: 1px; }

  .carrito-items { flex: 1; overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 8px; }
  .carrito-item { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 9px 14px; transition: all 0.15s; display: flex; align-items: center; gap: 10px; min-height: 52px; flex-shrink: 0; }
  .carrito-item:hover { border-color: var(--accent); }
  .carrito-item-focused { border-color: var(--accent) !important; box-shadow: 0 0 0 2px rgba(0,212,170,0.2) !important; background: rgba(0,212,170,0.04) !important; }
  .ci-top { display: flex; flex-direction: column; min-width: 0; flex: 1; justify-content: center; }
  .ci-nombre { font-size: 14px; font-weight: 700; line-height: 1.3; }
  .ci-precio-iva { font-size: 12px; color: var(--muted); font-family: var(--mono); margin-top: 2px; }
  .ci-bottom-row { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .ci-qty { display: flex; align-items: center; gap: 4px; }
  .qty-btn { width: 32px; height: 32px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: all 0.1s; font-weight: 700; flex-shrink: 0; }
  .qty-btn:hover { border-color: var(--accent); color: var(--accent); }
  .ci-qty-input { width: 56px; height: 32px; border-radius: 8px; border: 1.5px solid var(--accent); background: var(--glow); color: var(--accent); font-family: var(--mono); font-size: 14px; font-weight: 800; text-align: center; outline: none; }
  .ci-desc-input { width: 52px; height: 26px; border-radius: 7px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); font-family: var(--mono); font-size: 12px; text-align: center; outline: none; }
  .ci-desc-input:focus { border-color: #f59e0b; }
  .ci-total { font-family: var(--mono); font-size: 15px; font-weight: 900; color: var(--accent); flex-shrink: 0; white-space: nowrap; min-width: 70px; text-align: right; }

  /* ── CARRITO ITEM EN MÓVIL — 2 filas para que no se apriete ── */
  @media (max-width: 768px) {
    .carrito-item { flex-direction: column; align-items: stretch; gap: 10px; min-height: 0; padding: 12px 14px; }
    .ci-top { flex: none; }
    .ci-nombre { font-size: 15px; }
    .ci-bottom-row { justify-content: space-between; flex-wrap: nowrap; gap: 6px; }
    .ci-total { font-size: 14px; min-width: 0; flex: 1; padding-left: 4px; }
    .ci-desc-input { width: 40px; height: 32px; font-size: 11px; }
    .qty-btn { width: 32px; height: 32px; font-size: 15px; }
    .ci-qty-input { width: 44px; height: 32px; font-size: 14px; }
  }

  /* TOTAL BOX */
  .total-box { padding: 8px 12px; border-top: 2px solid var(--border); background: var(--surface2); flex-shrink: 0; }
  .total-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px; color: var(--text); padding: 5px 12px; background: var(--surface2); border-radius: 7px; font-weight: 600; }
  .total-row .amount { font-weight: 800; color: var(--text); font-family: var(--mono); }
  .total-row.final { font-size: 22px; font-weight: 900; color: var(--text); margin-top: 8px; padding: 10px 12px; background: transparent; border-top: 2px solid var(--border); border-radius: 0; margin-bottom: 0; letter-spacing: -0.5px; }

  /* ÁREA ACTIVA */
  .pv-col-inner { transition: all 0.2s; }
  .area-activa .carrito-col,
  .area-activa .cobro-col,
  .area-activa .card { border-color: var(--accent) !important; box-shadow: 0 0 0 2px rgba(0,212,170,0.15) !important; }

  /* COBRO COLUMNA */
  .cobro-col { background: var(--surface); border: 1.5px solid var(--border); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; height: 100%; }
  .cobro-header { padding: 8px 12px; border-bottom: 1.5px solid var(--border); background: var(--surface2); flex-shrink: 0; }
  .cobro-title { font-size: 13px; font-weight: 800; }
  .cobro-body { flex: 1; overflow: hidden; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }

  /* DTE selector compacto */
  .dte-selector { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .dte-btn { border: 2px solid var(--border); border-radius: 8px; padding: 7px 6px; cursor: pointer; transition: all 0.15s; text-align: center; background: var(--surface2); }
  .dte-btn:hover { transform: translateY(-1px); }
  .dte-btn.selected { border-color: var(--btn-color); background: color-mix(in srgb, var(--btn-color) 8%, var(--surface2)); }
  .dte-code { font-size: 12px; font-weight: 800; font-family: var(--mono); margin-bottom: 1px; }
  .dte-name { font-size: 9px; color: var(--muted); }

  /* Tipo pago compacto */
  .tipopago-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tipopago-btn { border: 2px solid var(--border); border-radius: 8px; padding: 7px 6px; cursor: pointer; transition: all 0.15s; text-align: center; background: var(--surface2); }
  .tipopago-btn.selected-contado { border-color: #00d4aa; background: rgba(0,212,170,0.06); }
  .tipopago-btn.selected-credito { border-color: #f59e0b; background: rgba(245,158,11,0.06); }
  .tipopago-label { font-size: 11px; font-weight: 800; }
  .tipopago-desc { font-size: 9px; color: var(--muted); }

  /* Métodos pago */
  .fpago-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 5px; }
  .fpago-btn { border: 2px solid var(--border); border-radius: 7px; padding: 5px 3px; cursor: pointer; transition: all 0.15s; text-align: center; background: var(--surface2); position: relative; }
  .fpago-btn:hover { transform: translateY(-1px); }
  .fpago-btn.selected { border-color: var(--fp-color); background: color-mix(in srgb, var(--fp-color) 8%, transparent); }
  .fpago-icon { font-size: 14px; margin-bottom: 2px; }
  .fpago-label { font-size: 8px; font-weight: 800; }
  .fpago-atajo { position: absolute; top: 3px; right: 4px; font-size: 8px; font-weight: 700; color: var(--muted); font-family: var(--mono); }

  /* Calculadora cambio */
  .cambio-box { background: rgba(0,212,170,0.05); border: 1.5px solid rgba(0,212,170,0.2); border-radius: 8px; padding: 7px 8px; }
  .cambio-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 11px; }
  .cambio-total-lbl { font-size: 15px; font-weight: 900; color: var(--accent); font-family: var(--mono); }
  .cambio-vuelto { font-size: 14px; font-weight: 900; font-family: var(--mono); }
  /* Carrito vacío: ícono grande que flota */
  .carrito-vacio-icon { font-size: 144px; opacity: 0.7; display: inline-block; animation: carritoFlota 2.8s ease-in-out infinite; filter: saturate(1.4) drop-shadow(0 8px 18px rgba(0,0,0,0.15)); }
  @keyframes carritoFlota {
    0%, 100% { transform: translateY(0) rotate(-2deg); }
    50% { transform: translateY(-12px) rotate(2deg); }
  }
  .cambio-vuelto.ok { color: #00d4aa; }
  .cambio-vuelto.falta { color: #ef4444; }
  .cambio-input { font-size: 14px; font-weight: 800; font-family: var(--mono); width: 85px; text-align: right; padding: 4px 8px; }
  .cambio-bills { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 6px; }
  .cambio-bill { padding: 7px 10px; border-radius: 7px; border: 1.5px solid var(--border); font-size: 11px; font-weight: 800; cursor: pointer; font-family: var(--mono); background: var(--surface); transition: all 0.12s; flex: 1; text-align: center; }
  .cambio-bill:hover { border-color: var(--accent); color: var(--accent); }

  .ref-box { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 8px; padding: 7px 8px; }
  .cobro-label { font-size: 9px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }

  /* BOTÓN COBRAR */
  .btn-cobrar { width: calc(100% - 16px); padding: 16px; font-size: 17px; font-weight: 900; letter-spacing: 0.3px; border-radius: 12px; border: none; cursor: pointer; background: linear-gradient(135deg, #16b877, #0d9a63); color: #fff; transition: all 0.18s; box-shadow: 0 6px 24px rgba(16,160,110,0.45); display: flex; align-items: center; justify-content: center; gap: 8px; font-family: var(--font); flex-shrink: 0; margin: 10px; text-shadow: 0 1px 3px rgba(0,0,0,0.2); }
  .btn-cobrar:hover { transform: translateY(-2px); box-shadow: 0 10px 36px rgba(16,160,110,0.58); }
  .btn-cobrar:active { transform: scale(0.98); }
  .btn-cobrar:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: none; }

  /* MODAL DTE */
  .dte-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 500; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(8px); }
  .dte-modal { background: var(--surface); border: 1.5px solid var(--border); border-radius: 20px; width: 100%; max-width: 580px; min-height: 520px; max-height: 92vh; display: flex; flex-direction: column; box-shadow: 0 30px 100px var(--shadow); overflow: hidden; }
  .dte-modal-header { padding: 14px 20px; border-bottom: 1.5px solid var(--border); background: var(--surface2); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .dte-modal-body { padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; flex: 1; }
  .dte-modal-footer { padding: 12px 20px; border-top: 1.5px solid var(--border); background: var(--surface2); display: flex; gap: 10px; flex-shrink: 0; }

  /* MODAL COBRO */
  .cobro-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 500; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(8px); }
  .cobro-modal { background: var(--surface); border: 1.5px solid var(--border); border-radius: 20px; width: 100%; max-width: 520px; max-height: 92vh; display: flex; flex-direction: column; box-shadow: 0 30px 100px var(--shadow); overflow: hidden; }
  .cobro-modal-header { padding: 14px 20px; border-bottom: 1.5px solid var(--border); background: var(--surface2); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .cobro-modal-body { padding: 16px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; min-height: 0; }
  .cobro-modal-footer { padding: 12px 20px; border-top: 1.5px solid var(--border); background: var(--surface2); display: flex; gap: 10px; flex-shrink: 0; }
  .cobro-modal-title { font-size: 16px; font-weight: 800; letter-spacing: -0.3px; }

  .cm-resumen { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 12px; overflow: hidden; }
  .cm-resumen-header { padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
  .cm-item { display: flex; justify-content: space-between; padding: 8px 14px; font-size: 13px; border-bottom: 1px solid var(--border); gap: 10px; }
  .cm-item:last-child { border-bottom: none; }
  .cm-totales { padding: 8px 14px; background: var(--surface3, var(--surface)); }
  .cm-total-row { display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); margin-bottom: 4px; }
  .cm-total-final { display: flex; justify-content: space-between; font-size: 20px; font-weight: 900; padding-top: 6px; border-top: 2px solid var(--border); margin-top: 4px; }

  .cm-label { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 6px; }
  .cm-dte-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .cm-dte-btn { border: 2px solid var(--border); border-radius: 14px; padding: 16px 14px; cursor: pointer; transition: all 0.18s; text-align: center; background: var(--surface2); }
  .cm-dte-btn:hover { border-color: var(--btn-color); transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.08); }
  .cm-dte-btn.selected { border-color: var(--btn-color); background: color-mix(in srgb, var(--btn-color) 12%, var(--surface2)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--btn-color) 20%, transparent), 0 8px 22px color-mix(in srgb, var(--btn-color) 18%, transparent); transform: translateY(-2px); }
  .cm-dte-icon { font-size: 28px; line-height: 1; margin-bottom: 7px; }
  .cm-dte-code { font-size: 17px; font-weight: 800; font-family: var(--mono); letter-spacing: 0.5px; }
  .cm-dte-name { font-size: 11px; color: var(--muted); margin-top: 3px; }

  .cm-pago-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .cm-pago-btn { border: 2px solid var(--border); border-radius: 10px; padding: 10px; cursor: pointer; transition: all 0.15s; text-align: center; background: var(--surface2); }
  .cm-pago-btn.selected-contado { border-color: #00d4aa; background: rgba(0,212,170,0.08); }
  .cm-pago-btn.selected-credito { border-color: #f59e0b; background: rgba(245,158,11,0.08); }
  .cm-pago-label { font-size: 13px; font-weight: 800; }
  .cm-pago-desc { font-size: 10px; color: var(--muted); margin-top: 2px; }

  .cm-fpago-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 6px; }
  .cm-fpago-btn { border: 2px solid var(--border); border-radius: 12px; padding: 14px 6px 10px; cursor: pointer; transition: all 0.15s; text-align: center; background: var(--surface2); position: relative; box-shadow: 0 2px 8px var(--shadow2); }
  .cm-fpago-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 16px var(--shadow); }
  .cm-fpago-btn.selected { border-color: var(--fp-color); background: color-mix(in srgb, var(--fp-color) 12%, var(--surface2)); box-shadow: 0 4px 16px color-mix(in srgb, var(--fp-color) 30%, transparent); transform: translateY(-1px); }
  .cm-fpago-icon { font-size: 24px; margin-bottom: 6px; display: block; }
  .cm-fpago-label { font-size: 11px; font-weight: 800; display: block; }
  .cm-fpago-key { position: absolute; top: 4px; right: 5px; font-size: 9px; color: var(--muted); font-family: var(--mono); background: var(--surface); padding: 1px 4px; border-radius: 3px; border: 1px solid var(--border); }

  .cm-cambio { background: rgba(0,212,170,0.06); border: 1.5px solid rgba(0,212,170,0.2); border-radius: 10px; padding: 12px; }
  .cm-cambio-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 13px; }
  .cm-cambio-total { font-size: 20px; font-weight: 900; color: var(--accent); font-family: var(--mono); }
  .cm-cambio-input { font-size: 18px; font-weight: 800; font-family: var(--mono); width: 110px; text-align: right; padding: 6px 10px; border-radius: 8px; border: 1.5px solid var(--accent); background: var(--surface); color: var(--text); outline: none; }
  .cm-bills { display: grid; grid-template-columns: repeat(4,1fr); gap: 5px; margin-top: 8px; }
  .cm-bill { padding: 9px 4px; border-radius: 7px; border: 1.5px solid var(--border); font-size: 12px; font-weight: 800; cursor: pointer; font-family: var(--mono); background: var(--surface); transition: all 0.12s; text-align: center; }
  .cm-bill:hover { border-color: var(--accent); color: var(--accent); }
  .cm-vuelto { font-size: 16px; font-weight: 900; font-family: var(--mono); }
  .cm-vuelto.ok { color: #00d4aa; }
  .cm-vuelto.falta { color: #ef4444; }

  .cm-ref { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }

  /* ── MÓVIL: ajustes para modales DTE y Cobro ── */
  @media (max-width: 768px) {
    /* Overlay con menos padding para más espacio del modal */
    .dte-overlay, .cobro-overlay { padding: 6px; }
    /* Modales: usar todo el ancho disponible */
    .dte-modal, .cobro-modal { max-width: 100%; max-height: 96vh; min-height: 0; }
    .dte-modal { min-height: 0; }
    /* Header puede hacer wrap si el chip de keyboard no cabe */
    .dte-modal-header, .cobro-modal-header { flex-wrap: wrap; gap: 6px; padding: 12px 14px; }
    /* Body con menos padding lateral */
    .dte-modal-body, .cobro-modal-body { padding: 14px; }
    /* Métodos de cobro: 3 columnas en lugar de 5 */
    .cm-fpago-grid, .fpago-grid { grid-template-columns: repeat(3, 1fr); }
    .cm-fpago-btn { padding: 12px 4px 8px; }
    .cm-fpago-icon { font-size: 22px; margin-bottom: 4px; }
    .cm-fpago-label { font-size: 11px; }
    /* Footer con botones apilados, el principal arriba */
    .dte-modal-footer, .cobro-modal-footer { flex-direction: column-reverse; gap: 8px; padding: 12px 14px; }
    .dte-modal-footer > *, .cobro-modal-footer > * { width: 100%; flex: none !important; }
  }
  .cm-cliente-fields { display: flex; flex-direction: column; gap: 6px; }

  /* MODAL CONFIRMACIÓN (mantener para compatibilidad) */
  .confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 500; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(6px); }
  .confirm-modal { background: var(--surface); border: 1.5px solid var(--border); border-radius: 20px; padding: 28px; width: 100%; max-width: 460px; box-shadow: 0 25px 80px var(--shadow); }
  .confirm-title { font-size: 20px; font-weight: 800; margin-bottom: 18px; text-align: center; }
  .confirm-items { background: var(--surface2); border-radius: 12px; padding: 14px; margin-bottom: 16px; max-height: 200px; overflow-y: auto; }
  .confirm-item { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; gap: 12px; }
  .confirm-total { display: flex; justify-content: space-between; font-size: 22px; font-weight: 900; padding-top: 12px; border-top: 2px solid var(--border); margin-top: 8px; }
  .confirm-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
  .confirm-badge { padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; border: 1.5px solid; }

  /* TICKET */
  .ticket-screen { max-width: 480px; margin: 0 auto; }
  .ticket { background: var(--surface); border: 1.5px solid var(--border); border-radius: 20px; padding: 28px; text-align: center; box-shadow: 0 8px 30px var(--shadow2); }
  .ticket-check { font-size: 56px; margin-bottom: 12px; }
  .ticket-title { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 6px; }
  .ticket-dte-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 16px; border-radius: 99px; font-size: 13px; font-weight: 700; margin-bottom: 18px; font-family: var(--mono); }
  .ticket-detalle { text-align: left; background: var(--surface2); border-radius: 12px; padding: 14px; margin-bottom: 16px; border: 1px solid var(--border); }
  .ticket-item { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; gap: 10px; }
  .ticket-divider { border: none; border-top: 1px solid var(--border); margin: 10px 0; }
  .ticket-total-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px; }
  .ticket-total-row.final { font-size: 18px; font-weight: 800; margin-top: 8px; }
  .ticket-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
  .ticket-actions-row { display: flex; gap: 10px; }

  /* HISTORIAL */
  .historial-item { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border); transition: background 0.15s; }
  .historial-item:hover { background: var(--surface2); }
  .historial-item:last-child { border-bottom: none; }

  /* ATAJOS */
  .atajos-toggle { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: var(--surface); border: 1.5px solid var(--border); border-radius: 99px; padding: 6px 14px; font-size: 11px; font-weight: 700; cursor: pointer; z-index: 200; color: var(--muted); display: flex; align-items: center; gap: 5px; box-shadow: 0 4px 16px var(--shadow2); transition: all 0.15s; white-space: nowrap; }
  .atajos-toggle:hover { border-color: var(--accent); color: var(--accent); }
  .atajos-panel { position: fixed; bottom: 52px; left: 50%; transform: translateX(-50%); background: var(--surface); border: 1.5px solid var(--border); border-radius: 14px; padding: 12px 16px; z-index: 200; box-shadow: 0 8px 30px var(--shadow); min-width: 210px; }
  .atajos-title { font-size: 10px; font-weight: 700; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px; }
  .atajo-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; gap: 14px; }
  .atajo-key { display: inline-flex; align-items: center; justify-content: center; background: var(--surface2); border: 1.5px solid var(--border2); border-radius: 5px; font-family: var(--mono); font-size: 10px; font-weight: 800; padding: 2px 7px; color: var(--text2); min-width: 28px; }
  .atajo-desc { color: var(--muted); font-size: 10px; }
`

export default function PuntoDeVenta() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { puede, userName, userId, empresaId, esAdmin, rol } = usePermisos()

  // ── DATOS ──
  const [productos, setProductos]         = useState([])
  const [ventas, setVentas]               = useState([])
  const [clientes, setClientes]           = useState([])
  const [empresa, setEmpresa]             = useState({})
  const [loadingProds, setLoadingProds]   = useState(true)
  const [cajaAbierta, setCajaAbierta]     = useState(null)
  const [requerirCaja, setRequerirCaja]   = useState(false)

  // ── CARRITO / COBRO: ahora viven en ventasPausa (ver helpers más abajo) ──
  const [busqueda, setBusqueda]           = useState('')
  const [catActiva, setCatActiva]         = useState('todas') // chip de categoría activo en el POS
  const [vistaProd, setVistaProd]         = useState(() => localStorage.getItem('orion_pos_vista') || 'grid') // 'grid' | 'tabla'
  const [limiteProductos, setLimiteProductos] = useState(50) // scroll infinito: cuántos productos mostrar
  const [mostrarDropdown, setMostrarDropdown] = useState(false)
  const [busquedaClienteModal, setBusquedaClienteModal] = useState('')
  const [mostrarDropdownModal, setMostrarDropdownModal] = useState(false)
  const [clienteFocusIdxModal, setClienteFocusIdxModal] = useState(-1)
  const [efectivoRecibido, setEfectivoRecibido] = useState('')
  const [pagosMixto, setPagosMixto] = useState({ efectivo: '', tarjeta: '', transferencia: '', cheque: '' })
  const [refCheque, setRefCheque]         = useState('')
  const [bancoCheque, setBancoCheque]     = useState('')
  const [refTransferencia, setRefTransferencia] = useState('')
  const [bancoTransferencia, setBancoTransferencia] = useState('')

  // ── UI ──
  const [tabMovil, setTabMovil]           = useState('productos')
  const [innerTab, setInnerTab]           = useState('productos')
  const [modalUnidad, setModalUnidad]     = useState(null)
  const [unidadFocusIdx, setUnidadFocusIdx] = useState(0)
  const [modalDTE, setModalDTE]           = useState(false) // Modal 1: configurar DTE
  const [modalCobro, setModalCobro]       = useState(false) // Modal 2: cobrar
  const [procesando, setProcesando]       = useState(false)
  const [ventaFinalizada, setVentaFinalizada] = useState(null)
  const [mostrarTicket, setMostrarTicket] = useState(false)
  // Estado de la transmisión al MH desde el POS.
  // null = no iniciada, 'transmitiendo' | 'procesado' | 'rechazado' | 'timeout' | 'error'
  const [estadoTransmisionPOS, setEstadoTransmisionPOS] = useState(null)
  // Datos del resultado de la transmisión (sello, motivo, etc.)
  const [resultadoTransmisionPOS, setResultadoTransmisionPOS] = useState(null)
  // Modo DEMO: si la empresa tiene esDemo:true, las ventas se SIMULAN (no van al MH).
  const [esDemo, setEsDemo] = useState(false)
  const [mostrarCamposCliente, setMostrarCamposCliente] = useState(false)
  const [resumenExpandido, setResumenExpandido] = useState(false)
  const [alerta, setAlerta] = useState(null)
  const mostrarAlerta = (mensaje, titulo) => setAlerta({ titulo: titulo || 'Atención', mensaje })
  const [imgAmpliada, setImgAmpliada] = useState(null) // { src, nombre }

  // ── NAVEGACIÓN POR TECLADO ──
  const [areaActiva, setAreaActiva]       = useState('productos') // productos | carrito | cobro
  const [prodFocusIdx, setProdFocusIdx]   = useState(0)  // índice producto enfocado
  const [itemFocusIdx, setItemFocusIdx]   = useState(0)  // índice item carrito enfocado
  const [clienteFocusIdx, setClienteFocusIdx] = useState(-1) // índice cliente dropdown
  const [cobrarFocused, setCobrarFocused] = useState(false) // botón cobrar enfocado
  const clienteInputRef = useRef(null)
  const gridRef = useRef(null)
  const layoutRef = useRef(null) // contenedor .pv-3col: se le calcula el alto real disponible

  // ── VENTAS EN PAUSA: persisten en sessionStorage al navegar ──
  const [ventaActual, setVentaActual]     = useState(0)
  const [ventasPausa, setVentasPausa]     = useState(() => {
    const ventaVacia = () => ({ id: 0, carrito: [], clienteNombre: '', clienteSeleccionado: null, busquedaCliente: '', nit: '', dui: '', nrc: '', tipoDte: 'FE', tipoPago: 'contado', formaPago: 'efectivo', fechaVencimiento: '',
      dteReferencia: '', numeroReferencia: '', motivoNcNd: ''
    })
    try {
      const saved = sessionStorage.getItem('orion_ventas_pausa')
      if (saved) {
        const arr = JSON.parse(saved)
        // Separar pausa de recarga: las ventas PAUSADAS a propósito (índice 1+)
        // sobreviven al recargar. La venta ACTIVA (índice 0) NO — arranca limpia.
        if (Array.isArray(arr) && arr.length > 1) {
          return [ventaVacia(), ...arr.slice(1)]
        }
      }
    } catch {}
    return [ventaVacia()]
  })

  const busquedaRef = useRef(null)
  const efectivoRef = useRef(null)

  // Alto del layout del POS = espacio real disponible hasta el fondo de la ventana.
  // Se mide en vivo para adaptarse al banner de producción, barra de favoritos, etc.
  // (evita que sobre espacio abajo o que la página entera scrollee y mueva el carrito).
  useEffect(() => {
    const el = layoutRef.current
    if (!el) return
    const ajustar = () => {
      const top = el.getBoundingClientRect().top
      el.style.height = `${Math.max(320, window.innerHeight - top - 12)}px`
    }
    ajustar()
    // Re-medir varias veces al inicio (el banner y la config cargan async).
    const t1 = setTimeout(ajustar, 60)
    const t2 = setTimeout(ajustar, 400)
    window.addEventListener('resize', ajustar)
    // .main-content es el abuelo: ahí se inserta/quita el banner de producción.
    const mainContent = el.parentElement?.parentElement
    const ro = new ResizeObserver(ajustar)          // cambios de tamaño
    const mo = new MutationObserver(ajustar)        // banner que aparece/desaparece
    if (mainContent) { ro.observe(mainContent); mo.observe(mainContent, { childList: true }) }
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('resize', ajustar); ro.disconnect(); mo.disconnect() }
  }, [])

  // ── VENTAS EN PAUSA: helpers ──
  const ventaData = ventasPausa[ventaActual] || ventasPausa[0]
  const carrito = ventaData.carrito
  const clienteNombre = ventaData.clienteNombre
  const clienteSeleccionado = ventaData.clienteSeleccionado
  const busquedaCliente = ventaData.busquedaCliente
  const nit = ventaData.nit
  const dui = ventaData.dui
  const nrc = ventaData.nrc
  const tipoDte = ventaData.tipoDte
  const tipoPago = ventaData.tipoPago
  const formaPago = ventaData.formaPago
  const fechaVencimiento = ventaData.fechaVencimiento

  const setCarrito = (val) => actualizarVenta('carrito', typeof val === 'function' ? val(carrito) : val)
  const setClienteNombre = (v) => actualizarVenta('clienteNombre', v)
  const setClienteSeleccionado = (v) => actualizarVenta('clienteSeleccionado', v)
  const setBusquedaCliente = (v) => actualizarVenta('busquedaCliente', v)
  const setNit = (v) => actualizarVenta('nit', v)
  const setDui = (v) => actualizarVenta('dui', v)
  const setNrc = (v) => actualizarVenta('nrc', v)
  const setTipoDte = (v) => { actualizarVenta('tipoDte', v); setMostrarCamposCliente(false) }
  const setTipoPago = (v) => actualizarVenta('tipoPago', v)
  const setFormaPago = (v) => actualizarVenta('formaPago', v)
  const setFechaVencimiento = (v) => actualizarVenta('fechaVencimiento', v)

  // Helpers NC/ND
  const dteReferencia    = ventaData.dteReferencia || ''
  const numeroReferencia = ventaData.numeroReferencia || ''
  const motivoNcNd       = ventaData.motivoNcNd || ''
  const setDteReferencia    = (v) => actualizarVenta('dteReferencia', v)
  const setNumeroReferencia = (v) => actualizarVenta('numeroReferencia', v)
  const setMotivoNcNd       = (v) => actualizarVenta('motivoNcNd', v)

  const actualizarVenta = (campo, valor) => {
    setVentasPausa(prev => prev.map((v, i) => i === ventaActual ? { ...v, [campo]: valor } : v))
  }

  // ── PERSISTIR VENTAS EN PAUSA EN SESSIONSSTORAGE ──
  useEffect(() => {
    try {
      // Serializar omitiendo clienteSeleccionado (objeto complejo) — se reselecciona al volver
      const toSave = ventasPausa.map(v => ({ ...v, clienteSeleccionado: null }))
      sessionStorage.setItem('orion_ventas_pausa', JSON.stringify(toSave))
      sessionStorage.setItem('orion_venta_actual', String(ventaActual))
    } catch {}
  }, [ventasPausa, ventaActual])

  // ── CARGA DE DATOS ──
  useEffect(() => {
    if (!user) return
    // Leer el flag esDemo desde la colección 'empresas' (es donde el Panel One Geo lo escribe).
    // OJO: la config de la empresa vive en 'configuracion', pero el flag DEMO vive en 'empresas'.
    if (empresaId) {
      getDoc(doc(db, 'empresas', empresaId)).then(snap => {
        if (snap.exists()) setEsDemo(snap.data().esDemo === true)
      }).catch(() => {})
    }
    if (!empresaId) return // esperar a tener empresaId antes de leer
    // Config de la empresa (requerirCaja, datos) por empresaId
    getDoc(doc(db, 'configuracion', empresaId)).then(snap => {
      if (snap.exists()) {
        setRequerirCaja(snap.data().requerirCaja || false)
        setEmpresa(snap.data())
      }
    })
    const unsubCaja = onSnapshot(query(collection(db, 'cajas'), where('empresaId', '==', empresaId)), snap => {
      const cajas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const miCaja = cajas.find(c => c.estado === 'abierta' && (c.cajeroId === user?.uid || c.cajeroNombre === userName))
      setCajaAbierta(miCaja || null)
    })
    return () => unsubCaja()
  }, [user, userName, empresaId])

  useEffect(() => {
    if (!empresaId) return // esperar a tener empresaId antes de leer
    const u1 = onSnapshot(query(collection(db, 'productos'), where('empresaId', '==', empresaId)), snap => {
      setProductos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoadingProds(false)
    })
    const u2 = onSnapshot(query(collection(db, 'clientes'), where('empresaId', '==', empresaId)), snap => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    // Cajero/vendedor solo leen SUS ventas; admin y otros roles, todas las de la empresa.
    const soloPropias = !esAdmin && (rol === 'cajero' || rol === 'vendedor')
    const qVentas = soloPropias
      ? query(collection(db, 'ventas'), where('empresaId', '==', empresaId), where('cajeroId', '==', userId))
      : query(collection(db, 'ventas'), where('empresaId', '==', empresaId))
    const u3 = onSnapshot(qVentas, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setVentas(data)
    })
    return () => { u1(); u2(); u3() }
  }, [empresaId, esAdmin, rol, userId])

  // ── RECIBIR COTIZACIÓN desde la página de Cotizaciones ──
  // Cotizaciones navega a /ventas con state.cotizacion. Cargamos su contenido
  // al carrito (resolviendo la presentación de cada item por su factor) y los
  // datos del cliente. Luego el usuario sigue el flujo normal (DTE + transmitir).
  const [cotizacionCargada, setCotizacionCargada] = useState(false)
  useEffect(() => {
    const cot = location.state?.cotizacion
    if (!cot || cotizacionCargada || loadingProds) return

    const nuevoCarrito = []
    for (const item of (cot.items || [])) {
      // Buscar el producto real (para tener stock, unidad base y presentaciones)
      const prod = productos.find(p => p.id === item.productoId)
      if (!prod) {
        // Producto libre (sin id) — lo agregamos como línea simple sin descuento de stock
        nuevoCarrito.push({
          id: 'libre_' + Date.now() + Math.random(), carritoId: 'libre_' + Date.now() + Math.random(),
          nombre: item.descripcion, precio: item.precioUnitario, unidad: item.unidad || 'unidad',
          factorUnidad: 1, qty: item.cantidad || 1, stock: 999999, sinStock: true,
        })
        continue
      }
      // Resolver la presentación: ¿el item usa la unidad base o una presentación?
      let factorUnidad = 1, unidadFinal = prod.unidad, precioFinal = item.precioUnitario ?? prod.precio
      const pres = (prod.unidadesAdicionales || []).find(u => u.nombre === item.unidad)
      if (pres) { factorUnidad = pres.factor || 1; unidadFinal = pres.nombre }
      nuevoCarrito.push({
        ...prod,
        carritoId: prod.id + '_' + unidadFinal,
        precio: precioFinal,
        unidad: unidadFinal,
        unidadBase: prod.unidad,
        factorUnidad,
        qty: item.cantidad || 1,
      })
    }

    // Cargar carrito + datos del cliente en la venta actual
    actualizarVenta('carrito', nuevoCarrito)
    if (cot.clienteNombre) actualizarVenta('clienteNombre', cot.clienteNombre)
    if (cot.clienteNit) actualizarVenta('nit', cot.clienteNit)
    actualizarVenta('origenCotizacion', cot.numero || '')

    setCotizacionCargada(true)
    mostrarAlerta(`Cotización ${cot.numero || ''} cargada. Revisá y procesá la venta.`)
    // Limpiar el state para que no se recargue si el usuario navega
    navigate('/ventas', { replace: true, state: {} })
  }, [location.state, productos, loadingProds, cotizacionCargada])

  // ── CÁLCULOS ──
  const precioConIva = (p) => parseFloat(((p || 0) * (1 + IVA)).toFixed(2))
  const fmt = (n) => `$${(n || 0).toFixed(2)}`
  // Nombre del ítem incluyendo la presentación, para que el DTE lo muestre en la descripción.
  // Ej: "Acetaminofén 500mg MK - Caja de 30 Unidad". Si es la unidad base, devuelve el nombre tal cual.
  const nombreConPresentacion = (c) => {
    const factor = c.factorUnidad || 1
    if (factor > 1 && c.unidad && c.unidadBase) {
      return `${c.nombre} - ${c.unidad} de ${factor} ${c.unidadBase}`
    }
    return c.nombre
  }
  const subtotal = carrito.reduce((s, c) => s + c.precio * c.qty, 0)
  const ivaTotal = subtotal * IVA
  const total    = subtotal + ivaTotal
  // Redondeado a centavos para evitar pelusa decimal (ej. pago exacto mostraba "Falta $0.00").
  const vuelto   = Math.round((parseFloat(efectivoRecibido || 0) - total) * 100) / 100
  const tipoInfo = TIPOS_DTE.find(t => t.codigo === tipoDte)
  // ── BLOQUEAR SCROLL FONDO CUANDO HAY MODAL ──
  useEffect(() => {
    const hayModal = modalDTE || modalCobro || !!alerta || !!imgAmpliada
    document.body.style.overflow = hayModal ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [modalDTE, modalCobro, alerta, imgAmpliada])

  // ── RESUMEN DE VENTAS ──
  const ventasHoy = ventas.filter(v => {
    if (!v.createdAt) return false
    const fecha = v.createdAt.toDate ? v.createdAt.toDate() : new Date(v.createdAt)
    return fecha.toDateString() === new Date().toDateString()
  })
  const totalHoy = ventasHoy.reduce((s, v) => s + (v.total || 0), 0)
  const productosVendidosHoy = ventasHoy.reduce((s, v) => s + (v.items?.reduce((a, i) => a + (i.qty || 0), 0) || 0), 0)
  const ventasPendientes = ventas.filter(v => v.tipoPago === 'credito' && v.estadoPago !== 'pagada').length

  // Categorías presentes en el catálogo (para los chips del POS).
  const categoriasPOS = [...new Set(productos.map(p => (p.categoria || '').trim()).filter(Boolean))].sort()
  const filtrados = productos.filter(p =>
    (catActiva === 'todas' || (p.categoria || '').trim() === catActiva) &&
    (
      p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.codigoBarras?.toLowerCase().includes(busqueda.toLowerCase())
    )
  )
  // Scroll infinito: solo renderizamos los primeros N para no congelar el navegador con 500 de golpe.
  const visibles = filtrados.slice(0, limiteProductos)
  // Cargar más al acercarse al fondo del contenedor de productos
  const onScrollProductos = (e) => {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && limiteProductos < filtrados.length) {
      setLimiteProductos(n => n + 50)
    }
  }

  // ── AGREGAR PRODUCTO ──
  const agregar = (producto, unidadSeleccionada = null) => {
    if (producto.stock <= 0) return
    if (!unidadSeleccionada && (producto.unidadesAdicionales || []).length > 0) {
      setModalUnidad(producto); setUnidadFocusIdx(0); return
    }
    let precioFinal = producto.precio, unidadFinal = producto.unidad, factorUnidad = 1
    if (unidadSeleccionada && unidadSeleccionada.nombre !== producto.unidad) {
      unidadFinal = unidadSeleccionada.nombre
      factorUnidad = unidadSeleccionada.factor || 1
      precioFinal = unidadSeleccionada.precio || (producto.precio * factorUnidad)
    }
    const carritoId = producto.id + '_' + unidadFinal
    const existe = carrito.find(c => c.carritoId === carritoId)
    if (existe) {
      // No dejar agregar más de lo que permite el stock en unidad base
      if ((existe.qty + 1) * (existe.factorUnidad || 1) > producto.stock) return
      setCarrito(carrito.map(c => c.carritoId === carritoId ? { ...c, qty: c.qty + 1 } : c))
    } else {
      if (factorUnidad > producto.stock) return // ni una presentación cabe en el stock
      setCarrito([...carrito, { ...producto, carritoId, precio: precioFinal, unidad: unidadFinal, unidadBase: producto.unidad, factorUnidad, qty: 1 }])
    }
    setTabMovil('carrito')
  }

  const cambiarQty = (carritoId, delta) => {
    const item = carrito.find(c => c.carritoId === carritoId)
    const prod = item ? productos.find(p => p.id === item.id) : null
    setCarrito(carrito.map(c => {
      if (c.carritoId !== carritoId) return c
      const newQty = c.qty + delta
      const factor = c.factorUnidad || 1
      // El stock está en unidad base: newQty de esta presentación consume newQty*factor
      if (newQty * factor > (prod?.stock || 999999)) return c
      return { ...c, qty: newQty }
    }).filter(c => c.qty > 0))
  }

  const pausarYNuevaVenta = () => {
    if (ventasPausa.length >= 5) { mostrarAlerta('Máximo 5 ventas simultáneas'); return }
    const nuevaId = Date.now()
    setVentasPausa(prev => [...prev, { id: nuevaId, carrito: [], clienteNombre: '', clienteSeleccionado: null, busquedaCliente: '', nit: '', nrc: '', tipoDte: 'FE', tipoPago: 'contado', formaPago: 'efectivo', fechaVencimiento: '', dteReferencia: '', numeroReferencia: '', motivoNcNd: '' }])
    setVentaActual(ventasPausa.length)
    setTabMovil('productos')
  }

  const cambiarVenta = (idx) => {
    setVentaActual(idx)
    setTabMovil('productos')
    setPagosMixto({ efectivo: '', tarjeta: '', transferencia: '', cheque: '' })
    setEfectivoRecibido('')
    setBusquedaClienteModal('')
    setMostrarDropdownModal(false)
    setMostrarDropdown(false)
  }

  const cerrarVentaPausa = (idx) => {
    if (ventasPausa.length === 1) return // siempre debe haber al menos una
    setVentasPausa(prev => prev.filter((_, i) => i !== idx))
    setVentaActual(Math.max(0, ventaActual - 1))
  }

  // ── RESET ──
  const nuevaVenta = () => {
    setVentaFinalizada(null); setMostrarTicket(false)
    setEstadoTransmisionPOS(null); setResultadoTransmisionPOS(null)
    setModalDTE(false); setModalCobro(false)
    setVentasPausa(prev => prev.map((v, i) => i === ventaActual ? {
      ...v,
      carrito: [], clienteNombre: '', clienteSeleccionado: null,
      busquedaCliente: '', nit: '', nrc: '',
      tipoDte: 'FE', tipoPago: 'contado', formaPago: 'efectivo',
      fechaVencimiento: '', dteReferencia: '', numeroReferencia: '', motivoNcNd: '',
      correoFe: '', telefonoFe: '', correoCcf: '', telefonoCcf: '',
      codActividadCcf: '', actividadCcf: '', departamentoCcf: '', municipioCcf: '', direccionCcf: '',
    } : v))
    setEfectivoRecibido('')
    setPagosMixto({ efectivo: '', tarjeta: '', transferencia: '', cheque: '' })
    setRefCheque(''); setBancoCheque(''); setRefTransferencia(''); setBancoTransferencia('')
    setBusqueda('')
    setBusquedaClienteModal('')
    setMostrarDropdownModal(false)
    setMostrarDropdown(false)
    setMostrarCamposCliente(false)
    setResumenExpandido(false)
    setClienteNombre('')
    setNit('')
    setDui('')
    setNrc('')
    setTabMovil('productos')
    setInnerTab('productos')
  }

  // ── PROCESAR VENTA ──
  const procesarVenta = async () => {
    if (procesando) return
    if (carrito.length === 0)      { mostrarAlerta('El carrito está vacío'); return }
    if (carrito.length > 100)      { mostrarAlerta('Máximo 100 items por venta'); return }
    if (tipoDte === 'CCF') {
      const faltantesCCF = []
      if (!nit) faltantesCCF.push('NIT')
      if (!nrc) faltantesCCF.push('NRC')
      if (!ventaData.codActividadCcf) faltantesCCF.push('Código de actividad')
      if (!ventaData.actividadCcf)    faltantesCCF.push('Descripción de actividad')
      if (!ventaData.departamentoCcf) faltantesCCF.push('Departamento')
      if (!ventaData.municipioCcf)    faltantesCCF.push('Municipio')
      if (!ventaData.direccionCcf)    faltantesCCF.push('Dirección')
      if (faltantesCCF.length > 0) {
        mostrarAlerta('El CCF requiere los siguientes datos del cliente: ' + faltantesCCF.join(', '))
        return
      }
    }
    if (['NC','ND'].includes(tipoDte) && !numeroReferencia) { mostrarAlerta('NC/ND requiere el número del DTE que corrige'); return }
    if (['NC','ND'].includes(tipoDte) && !motivoNcNd) { mostrarAlerta('NC/ND requiere el motivo'); return }
    if (tipoPago === 'credito' && !fechaVencimiento) { mostrarAlerta('Indica la fecha de vencimiento'); return }
    if (tipoPago === 'credito' && fechaVencimiento <= fechaSV()) { mostrarAlerta('La fecha de vencimiento debe ser posterior a hoy'); return }
    if (total <= 0 || total > 999999) { mostrarAlerta('Total fuera de rango'); return }
    if (tipoPago === 'contado' && formaPago === 'efectivo') {
      const recibido = parseFloat(efectivoRecibido || 0)
      if (recibido <= 0) { mostrarAlerta('Ingresa el efectivo recibido'); return }
      // Redondear la DIFERENCIA (no cada lado): así el pago exacto nunca muestra "Faltan $0.00".
      const faltaEfectivo = Math.round((total - recibido) * 100)
      if (faltaEfectivo > 0) { mostrarAlerta('Faltan ' + fmt(faltaEfectivo / 100) + ' para completar el pago'); return }
    }
    if (tipoPago === 'contado' && formaPago === 'mixto') {
      const totalPagado = ['efectivo','tarjeta','transferencia','cheque']
        .reduce((s, m) => s + (parseFloat(pagosMixto[m]) || 0), 0)
      if (totalPagado <= 0) { mostrarAlerta('Ingresa al menos un método de pago'); return }
      const faltaMixto = Math.round((total - totalPagado) * 100)
      if (faltaMixto > 0) { mostrarAlerta('Faltan ' + fmt(faltaMixto / 100) + ' para completar el pago'); return }
    }



    for (const item of carrito) {
      if (item.qty <= 0 || item.qty > 99999) { mostrarAlerta('Cantidad inválida en "' + item.nombre + '"'); return }
      if (item.precio < 0) { mostrarAlerta('Precio inválido en "' + item.nombre + '"'); return }
    }

    // ── Confirmación de MODO PRODUCCIÓN ──────────────────────────────
    // Si la empresa está en ambiente de producción, el DTE es REAL ante Hacienda.
    // Se exige escribir "ok" como último paso para no emitir por accidente.
    if ((empresa.mh_ambiente || '00') === '01') {
      const conf = await orionPrompt(
        'Este DTE se emitirá REAL ante el Ministerio de Hacienda (no es una prueba).\n\nEscribí "ok" para confirmar y procesar la venta.',
        { titulo: '🔴 Modo Producción', tipo: 'warning', okLabel: 'Emitir DTE', cancelLabel: 'Cancelar', placeholder: 'Escribí: ok' }
      )
      if (conf == null) return // canceló
      if (conf.trim().toLowerCase() !== 'ok') { mostrarAlerta('Para emitir en producción, escribe exactamente "ok".', 'No confirmado'); return }
    }

    setProcesando(true)
    try {
      const estadoPago = tipoPago === 'contado' ? 'pagada' : 'pendiente'
      const fmtPago    = tipoPago === 'contado' ? formaPago : 'credito'
      const campoCorrelativo = 'correlativo' + tipoDte
      const sucursalId = sessionStorage.getItem('orion_sucursal_activa')
      let numeroDte = ''
      let codigoGeneracion = ''
      let ventaIdGuardada = ''

      await runTransaction(db, async (tx) => {

        // ══════════════════════════════════════
        // FASE 1 — TODAS LAS LECTURAS PRIMERO
        // ══════════════════════════════════════

        // 1a. Leer sucursal (si existe)
        let sucRef = null
        let correlativoActual = 1
        let codEst    = '0000'
        let codPV     = '0001'
        let codEstMH  = ''
        let codPVMH   = ''
        let conSucursal = false

        if (sucursalId) {
          sucRef = doc(db, 'sucursales', sucursalId)
          const sucSnap = await tx.get(sucRef)
          if (sucSnap.exists()) {
            const sucData = sucSnap.data()
            correlativoActual = sucData[campoCorrelativo] || 1
            codEst   = String(sucData.codEstablecimiento || '0000').padStart(4, '0')
            codPV    = String(sucData.codPuntoVenta      || '0001').padStart(4, '0')
            codEstMH = String(sucData.codEstableMH       || codEst)
            codPVMH  = String(sucData.codPuntoVentaMH    || codPV)
            conSucursal = true
          }
        }

        // 1b. Leer stock de todos los productos (solo líneas con producto real)
        const prodRefs = carrito.map(item => (item.sinStock ? null : doc(db, 'productos', item.id)))
        const prodSnaps = await Promise.all(prodRefs.map(ref => ref ? tx.get(ref) : Promise.resolve(null)))

        // Validar existencia y stock — AGRUPANDO por producto.
        // Un mismo producto puede estar en varias líneas (ej. 1 Caja + 1 unidad).
        // Hay que sumar TODAS las unidades base de ese producto y descontar UNA sola vez,
        // si no, una línea pisa la otra y el stock queda mal.
        const consumoPorProducto = {} // { productoId: { unidadesBase, stockActual, ref, nombre, unidad } }
        for (let i = 0; i < carrito.length; i++) {
          const item = carrito[i]
          const snap = prodSnaps[i]
          if (item.sinStock) continue // líneas libres (sin producto real) no descuentan
          if (!snap.exists()) throw new Error('Producto "' + item.nombre + '" no encontrado')
          const factor = item.factorUnidad || 1
          const unidadesBase = item.qty * factor
          const pid = item.id
          if (!consumoPorProducto[pid]) {
            consumoPorProducto[pid] = { unidadesBase: 0, stockActual: snap.data().stock, ref: prodRefs[i], nombre: item.nombre, unidad: snap.data().unidad || 'u', codigo: item.codigo || '', productoId: pid }
          }
          consumoPorProducto[pid].unidadesBase += unidadesBase
        }
        // Validar cada producto contra su stock (con el consumo TOTAL sumado)
        const stockUpdates = []
        for (const pid in consumoPorProducto) {
          const c = consumoPorProducto[pid]
          if (c.stockActual < c.unidadesBase) {
            throw new Error('Stock insuficiente para "' + c.nombre + '". Disponible: ' + c.stockActual + ' ' + c.unidad + ' (necesita ' + c.unidadesBase + ')')
          }
          stockUpdates.push({ ref: c.ref, nuevoStock: c.stockActual - c.unidadesBase, _kardex: { productoId: c.productoId, codigo: c.codigo, nombre: c.nombre, unidad: c.unidad, cantidad: c.unidadesBase, stockAntes: c.stockActual, stockDespues: c.stockActual - c.unidadesBase } })
        }

        // ══════════════════════════════════════
        // FASE 2 — CALCULAR VALORES
        // ══════════════════════════════════════

        // Mapa tipo DTE → código numérico MH obligatorio
        const TIPO_DTE_CODIGO = { FE: '01', CCF: '03', NC: '05', ND: '06' }
        const tipoDteCodigo = TIPO_DTE_CODIGO[tipoDte] || '01'

        // UUID único para este DTE — obligatorio para el MH y para referencias NC/ND
        // Asignamos a la variable externa para poder usarla fuera de la transacción
        codigoGeneracion = crypto.randomUUID().toUpperCase()

        if (conSucursal) {
          const correlativoNuevo = correlativoActual + 1
          const numStr = String(correlativoNuevo).padStart(15, '0')
          // Formato oficial MH: DTE-{tipoCodigo}-{codEstableMH}{codPuntoVentaMH}-{correlativo 15 dígitos}
          numeroDte = 'DTE-' + tipoDteCodigo + '-' + codEstMH + codPVMH + '-' + numStr
        } else {
          numeroDte = 'DTE-' + tipoDteCodigo + '-0000-' + String(Date.now()).slice(-15).padStart(15, '0')
        }

        const ventaRef   = doc(collection(db, 'ventas'))
        const facturaRef = doc(collection(db, 'facturas'))
        // Guardamos el ID fuera del scope para usarlo en la transmisión MH
        ventaIdGuardada = ventaRef.id

        // ══════════════════════════════════════
        // FASE 3 — TODAS LAS ESCRITURAS AL FINAL
        // ══════════════════════════════════════

        // 3a. Actualizar correlativo de sucursal al nuevo valor
        if (conSucursal && sucRef) {
          tx.update(sucRef, { [campoCorrelativo]: correlativoActual + 1 })
        }

        // 3b. Guardar venta
        tx.set(ventaRef, {
          cliente: clienteNombre || 'Consumidor Final', tipoDte, numeroDte, codigoGeneracion, tipoPago,
          dte_ambiente: empresa.mh_ambiente || '00', // ambiente desde la creación (prod 01 / prueba 00)
          cajero: userName || '', cajeroId: userId || '',
          sucursalId: sucursalId || '',
          formaPago: fmtPago,
          refPago:  formaPago === 'cheque' ? refCheque  : formaPago === 'transferencia' ? refTransferencia : '',
          bancoPago: formaPago === 'cheque' ? bancoCheque : formaPago === 'transferencia' ? bancoTransferencia : '',
          nit: nit || '',
          dui: dui || '',
          nrc: nrc || '',
          correo: ventaData.correoCcf || ventaData.correoFe || '',
          ...((['CCF','NC','ND'].includes(tipoDte)) && {
            codActividad:  ventaData.codActividadCcf  || '',
            descActividad: ventaData.actividadCcf     || '',
            codDep:        ventaData.departamentoCcf  || '',
            codMun:        ventaData.municipioCcf     || '',
            codDistrito:   ventaData.distritoCcf      || '',
            direccion:     ventaData.direccionCcf     || '',
            correo:        ventaData.correoCcf        || '',
            telefono:      ventaData.telefonoCcf      || '',
          }),
          ...(formaPago === 'mixto' && tipoPago === 'contado' && {
            pagosDesglose: ['efectivo','tarjeta','transferencia','cheque']
              .map(m => ({ metodo: m, monto: parseFloat(pagosMixto[m]) || 0 }))
              .filter(p => p.monto > 0)
          }),
          items: carrito.map(c => ({ id: c.id, codigo: c.codigo, nombre: nombreConPresentacion(c), precioBase: c.precio, precioConIva: precioConIva(c.precio), qty: c.qty, subtotal: c.precio * c.qty })),
          subtotal, iva: ivaTotal, total, estado: 'completada', empresaId, createdAt: serverTimestamp()
        })

        // 3c. Guardar factura DTE
        tx.set(facturaRef, {
          tipoDte, numero: numeroDte, codigoGeneracion, cliente: clienteNombre || 'Consumidor Final',
          dte_ambiente: empresa.mh_ambiente || '00', // ambiente desde la creación (prod 01 / prueba 00)
          formaPago: fmtPago, nit: nit || '', dui: dui || '', nrc: nrc || '',
          sucursalId: sucursalId || '',
          correlativo: correlativoActual + 1,
          descripcion: 'Venta de ' + carrito.length + ' producto(s)',
          ...((['NC','ND'].includes(tipoDte)) && { dteReferencia, numeroReferencia, motivoNcNd, tipoDocRef: dteReferencia }),
          direccion: ventaData.direccionCcf || ventaData.direccionFe || '',
          actividad: ventaData.actividadCcf || '',
          telefono:  ventaData.telefonoCcf  || ventaData.telefonoFe  || '',
          correo:    ventaData.correoCcf    || ventaData.correoFe    || '',
          items: carrito.map(c => ({ nombre: nombreConPresentacion(c), qty: c.qty, precioBase: c.precio, subtotal: c.precio * c.qty })),
          subtotal, iva: ivaTotal, total, estadoPago,
          cajero: userName || '', cajeroId: userId || '',
          fechaEmision: fechaSV(),
          fechaVencimiento: tipoPago === 'credito' ? fechaVencimiento : '',
          tipoPago, notas: tipoPago === 'credito' ? 'Crédito — vence ' + fechaVencimiento : '',
          origenVenta: true, empresaId, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        })

        // 3d. Actualizar stock de productos + registrar salida en el Kardex (una línea por producto)
        for (const upd of stockUpdates) {
          tx.update(upd.ref, { stock: upd.nuevoStock })
          if (upd._kardex) {
            const k = upd._kardex
            const kardexRef = doc(collection(db, 'kardex'))
            tx.set(kardexRef, {
              productoId: k.productoId, productoCodigo: k.codigo, productoNombre: k.nombre,
              tipo: 'salida', cantidad: k.cantidad, unidad: k.unidad,
              presentacion: '', // las ventas ya consolidan en unidad base
              stockAntes: k.stockAntes, stockDespues: k.stockDespues,
              motivo: 'Venta', referencia: numeroDte || '',
              sucursalOrigen: '', sucursalDestino: '',
              empresaId, fecha: serverTimestamp(),
            })
          }
        }
      })
      setVentaFinalizada({ carrito: [...carrito], cliente: clienteNombre || 'Consumidor Final', tipoDte, numeroDte, codigoGeneracion, tipoPago, formaPago, fechaVencimiento, subtotal, ivaTotal, total, nit, dui, nrc, efectivoRecibido })
      setMostrarTicket(true)
      setModalCobro(false)
      setModalDTE(false)

      // Disparar transmisión automática al MH en segundo plano (con timeout 10s).
      // Si tarda más, la venta queda PENDIENTE para reintentar desde Facturas DTE.
      if (ventaIdGuardada) {
        transmitirAutoMH(ventaIdGuardada, codigoGeneracion)
      }
    } catch (e) {
      mostrarAlerta(e.message, 'Error al procesar')
    }
    setProcesando(false)
  }

  const formatFecha = (ts) => {
    if (!ts) return '—'
    const d = new Date(ts.seconds * 1000)
    return d.toLocaleDateString('es-SV') + ' ' + d.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })
  }

  // ── TRANSMISIÓN AUTOMÁTICA AL MH ──
  // Tras procesar la venta, intentamos transmitir al MH con un timeout de 10s.
  // - Si responde rápido y es PROCESADO: el ticket queda con sello + QR oficial
  // - Si responde RECHAZADO: avisamos al cajero, el cajero puede ir a Facturas DTE
  // - Si tarda más de 10s: queda PENDIENTE para retransmitir desde Facturas DTE
  // - Si hay error de red: queda PENDIENTE
  const transmitirAutoMH = async (ventaId, codigoGen) => {
    if (!ventaId) return
    setEstadoTransmisionPOS('transmitiendo')
    setResultadoTransmisionPOS(null)

    // ── MODO DEMO ──
    // Si la empresa es de demostración, NO se transmite al MH: se simula una respuesta
    // PROCESADA con sello ficticio. Así el flujo se ve completo sin tocar el Ministerio.
    if (esDemo) {
      const selloDemo = 'DEMO-' + Date.now().toString(36).toUpperCase()
      const fhDemo = new Date().toISOString()
      setEstadoTransmisionPOS('procesado')
      setResultadoTransmisionPOS({ sello: selloDemo, fhProcesamiento: fhDemo, demo: true })
      setVentaFinalizada(prev => prev ? {
        ...prev,
        dte_estado: 'PROCESADO',
        dte_sello: selloDemo,
        dte_fhProcesamiento: fhDemo,
        esDemo: true,
      } : prev)
      return
    }

    // Promise.race entre el fetch y un timeout de 10 segundos
    const TIMEOUT_MS = 10000
    const fetchPromise = fetch('/api/dte/transmitir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ventaId, ambiente: empresa.mh_ambiente || '00' })
    }).then(r => r.json())

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
    )

    try {
      const data = await Promise.race([fetchPromise, timeoutPromise])

      if (data.estado === 'PROCESADO') {
        setEstadoTransmisionPOS('procesado')
        setResultadoTransmisionPOS({
          sello: data.selloRecibido,
          fhProcesamiento: data.fhProcesamiento,
        })
        // Actualizar la venta en el state local con el sello (para que el ticket
        // tenga el QR válido del MH al imprimir)
        setVentaFinalizada(prev => prev ? {
          ...prev,
          dte_estado: 'PROCESADO',
          dte_sello: data.selloRecibido,
          dte_fhProcesamiento: data.fhProcesamiento,
          // El número de control OFICIAL lo asigna el backend (contador por ambiente),
          // que puede diferir del numeroDte local (contador de sucursal, que en pruebas
          // quedó inflado). Usar el real para que el ticket/PDF coincida con el MH.
          numeroDte: data.numeroControl || prev.numeroDte,
        } : prev)
      } else if (data.estado === 'RECHAZADO') {
        setEstadoTransmisionPOS('rechazado')
        setResultadoTransmisionPOS({
          motivo: data.detalleMH?.descripcionMsg || 'Sin detalle del MH'
        })
      } else {
        setEstadoTransmisionPOS('error')
        setResultadoTransmisionPOS({ motivo: 'Respuesta inesperada' })
      }
    } catch (e) {
      // Timeout o error de red — queda PENDIENTE para retransmisión manual
      const esTimeout = e.message === 'TIMEOUT'
      setEstadoTransmisionPOS(esTimeout ? 'timeout' : 'error')
      setResultadoTransmisionPOS({
        motivo: esTimeout
          ? 'El MH tardó más de 10 segundos. Quedó pendiente.'
          : 'Sin conexión con el MH. Quedó pendiente.'
      })
    }
  }



  // ── IMPRESIÓN (usa utils/imprimir.js compartido con Facturas DTE) ──

  // Adapta la venta del POS al formato que esperan generarPDF/generarTicket
  // (compatible con el formato de "factura" usado en Facturas.jsx).
  const ventaAFactura = (v) => ({
    tipoDte: v.tipoDte,
    numero: v.numeroDte,
    numeroControl: v.numeroDte,
    codigoGeneracion: v.codigoGeneracion || '',
    cliente: v.cliente,
    nit: v.nit || '',
    dui: v.dui || '',
    nrc: v.nrc || '',
    fechaEmision: fechaSV(),
    fechaVencimiento: v.fechaVencimiento || '',
    tipoPago: v.tipoPago,
    formaPago: v.formaPago,
    items: v.carrito.map(c => ({
      nombre: c.nombre,
      qty: c.qty,
      precioBase: c.precio,
      precioConIva: precioConIva(c.precio),
      descuento: 0,
    })),
    subtotal: v.subtotal,
    iva: v.ivaTotal,
    total: v.total,
    efectivoRecibido: v.efectivoRecibido,
    descripcion: 'Venta de ' + v.carrito.length + ' producto(s)',
    // Estado de transmisión MH — si ya está procesado, el ticket muestra QR + sello
    dte_estado: v.dte_estado || 'PENDIENTE',
    dte_sello: v.dte_sello || '',
    dte_fhProcesamiento: v.dte_fhProcesamiento || '',
    dte_ambiente: empresa.mh_ambiente || '00',
    // Para que el ticket muestre la hora actual
    createdAt: { seconds: Math.floor(Date.now() / 1000) },
  })

  // Imprime ticket térmico directo (sin preview) — para rapidez en POS
  const imprimirTicket = async (v) => {
    try {
      const html = await generarTicket(ventaAFactura(v), empresa)
      imprimirIframe(html)
    } catch (e) {
      console.error('Error al imprimir ticket:', e)
      alert('Error al imprimir ticket: ' + e.message)
    }
  }

  // Imprime PDF directo (sin preview) — para rapidez en POS
  const imprimirPDFVenta = async (v) => {
    try {
      const html = await generarPDF(ventaAFactura(v), empresa)
      imprimirIframe(html)
    } catch (e) {
      console.error('Error al imprimir PDF:', e)
      alert('Error al imprimir PDF: ' + e.message)
    }
  }


  // ── REF PARA INPUTS DE CANTIDAD EN CARRITO ──
  const qtyRefs = useRef({})

  // ── SISTEMA DE NAVEGACIÓN POR TECLADO ──
  useEffect(() => {
    const FORMAS = ['efectivo','tarjeta','transferencia','cheque','mixto']

    const handler = (e) => {
      const tag = document.activeElement?.tagName
      const enInput = ['INPUT','TEXTAREA','SELECT'].includes(tag)

      // ── MODAL UNIDAD ──
      if (modalUnidad) {
        const unidades = [{ nombre: modalUnidad.unidad, factor: 1, precio: modalUnidad.precio }, ...(modalUnidad.unidadesAdicionales || [])]
        if (e.key === 'ArrowDown') { e.preventDefault(); setUnidadFocusIdx(i => Math.min(i+1, unidades.length-1)) }
        if (e.key === 'ArrowUp')   { e.preventDefault(); setUnidadFocusIdx(i => Math.max(i-1, 0)) }
        if (e.key === 'Enter')     { e.preventDefault(); agregar(modalUnidad, unidades[unidadFocusIdx]); setModalUnidad(null) }
        if (e.key === 'Escape')    { e.preventDefault(); setModalUnidad(null) }
        return
      }

      // ── MODAL TICKET ──
      if (mostrarTicket && ventaFinalizada) {
        if (e.key === 'Enter') { e.preventDefault(); nuevaVenta(); return }
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); nuevaVenta() }
        if (e.key === 't' || e.key === 'T') { e.preventDefault(); imprimirTicket(ventaFinalizada) }
        if (e.key === 'p' || e.key === 'P') { e.preventDefault(); imprimirPDFVenta(ventaFinalizada) }
        if (e.key === 'F10') { e.preventDefault(); nuevaVenta() }
        return
      }

      // ── MODAL COBRO (Modal 2) ──
      if (modalCobro) {
        if (e.key === 'Escape') { e.preventDefault(); if (enInput) { document.activeElement?.blur() } else { setModalCobro(false); setModalDTE(true) }; return }
        if (e.key === 'Enter' && !procesando && !enInput) { e.preventDefault(); procesarVenta(); return }
        if (e.key === 'F5') { e.preventDefault(); setTipoPago('contado'); return }
        if (e.key === 'F6') { e.preventDefault(); setTipoPago('credito'); return }
        if (!enInput && e.key >= '1' && e.key <= '5' && tipoPago === 'contado') {
          const f = FORMAS[parseInt(e.key)-1]
          setFormaPago(f)
          if (f === 'efectivo') setTimeout(() => efectivoRef.current?.focus(), 50)
        }
        if (enInput && e.key === 'Escape') { e.preventDefault(); document.activeElement?.blur() }
        return
      }

      // ── MODAL DTE (Modal 1) ──
      if (modalDTE) {
        if (e.key === 'Escape') { e.preventDefault(); if (enInput) { document.activeElement?.blur() } else { setModalDTE(false) }; return }
        if (e.key === 'F5') { e.preventDefault(); setTipoDte('FE'); return }
        if (e.key === 'F6') { e.preventDefault(); setTipoDte('CCF'); return }
        if (e.key === 'F7') { e.preventDefault(); setMostrarCamposCliente(v => !v); return }
        if (!enInput && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); document.querySelector('.dte-modal input[placeholder*="Buscar"]')?.focus(); return }
        if (e.key === 'Enter' && !enInput) { e.preventDefault(); setModalDTE(false); setModalCobro(true); return }
        // Navegación cliente en modal DTE
        if (mostrarDropdownModal) {
          const filtM = clientes.filter(c => c.nombre?.toLowerCase().includes(busquedaClienteModal.toLowerCase()) || c.nit?.includes(busquedaClienteModal)).slice(0,6)
          if (e.key === 'ArrowDown') { e.preventDefault(); setClienteFocusIdxModal(i => Math.min(i+1, filtM.length-1)) }
          if (e.key === 'ArrowUp')   { e.preventDefault(); setClienteFocusIdxModal(i => Math.max(i-1, -1)) }
          if (e.key === 'Enter' && clienteFocusIdxModal >= 0) {
            e.preventDefault()
            const c = filtM[clienteFocusIdxModal]
            if (c) {
              setClienteSeleccionado(c); setClienteNombre(c.nombre); setNit(c.nit||''); setDui(c.dui||''); setNrc(c.nrc||'')
              setBusquedaClienteModal(c.nombre); setMostrarDropdownModal(false); setClienteFocusIdxModal(-1)
              actualizarVenta('correoFe', c.email||''); actualizarVenta('telefonoFe', c.telefono||'')
              actualizarVenta('correoCcf', c.email||''); actualizarVenta('telefonoCcf', c.telefono||'')
              actualizarVenta('codActividadCcf', c.codActividad||''); actualizarVenta('actividadCcf', c.descActividad||'')
              actualizarVenta('departamentoCcf', c.codDep||''); actualizarVenta('municipioCcf', c.codMun||''); actualizarVenta('distritoCcf', c.codDistrito||'')
              actualizarVenta('direccionCcf', c.complemento||c.direccion||'')
            }
          }
          if (e.key === 'Escape') { e.preventDefault(); setMostrarDropdownModal(false); setClienteFocusIdxModal(-1) }
          return
        }
        if (enInput && e.key === 'Escape') { e.preventDefault(); document.activeElement?.blur() }
        return
      }

      // ── TECLAS GLOBALES ──
      if (e.key === 'F9') { e.preventDefault(); if (carrito.length > 0) { setModalDTE(true); setMostrarCamposCliente(false); actualizarVenta('tipoDte','FE') }; return }
      if (e.key === 'F10') { e.preventDefault(); nuevaVenta(); return }
      if (e.key === 'F8') { e.preventDefault(); pausarYNuevaVenta(); return }

      // ── ESC GLOBAL ──
      if (e.key === 'Escape') {
        e.preventDefault()
        if (enInput) { document.activeElement?.blur(); return }
        setAreaActiva('productos')
        setBusqueda('')
        setMostrarDropdown(false)
        setTimeout(() => busquedaRef.current?.focus(), 50)
        return
      }

      // ── TAB: cambiar área ──
      if (e.key === 'Tab' && !enInput) {
        e.preventDefault()
        const areas = ['productos','carrito']
        const idx = areas.indexOf(areaActiva)
        const next = e.shiftKey ? areas[(idx-1+areas.length)%areas.length] : areas[(idx+1)%areas.length]
        setAreaActiva(next)
        if (next === 'productos') setTimeout(() => busquedaRef.current?.focus(), 50)
        if (next === 'carrito') { setItemFocusIdx(0); document.activeElement?.blur() }
        return
      }

      // ── ÁREA PRODUCTOS ──
      if (areaActiva === 'productos') {
        if (!enInput && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) { busquedaRef.current?.focus(); return }
        // Nº de columnas REAL de la grilla (para que las flechas sigan la cuadrícula).
        const g = gridRef.current
        const cols = Math.max(1, g ? getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length : 1)
        // Mueve el foco con clamp y carga más productos si se acerca al límite renderizado.
        const mover = (nuevo) => {
          const idx = Math.max(0, Math.min(nuevo, filtrados.length - 1))
          setProdFocusIdx(idx)
          if (idx >= limiteProductos - cols) setLimiteProductos(l => Math.min(filtrados.length, l + 50))
        }
        if (enInput && e.key === 'ArrowDown') { e.preventDefault(); document.activeElement?.blur(); setProdFocusIdx(0); return }
        if (!enInput) {
          if (e.key === 'ArrowRight') { e.preventDefault(); mover(prodFocusIdx + 1) }
          if (e.key === 'ArrowLeft')  { e.preventDefault(); mover(prodFocusIdx - 1) }
          if (e.key === 'ArrowDown')  { e.preventDefault(); mover(prodFocusIdx + cols) }
          if (e.key === 'ArrowUp')    { e.preventDefault(); if (prodFocusIdx < cols) busquedaRef.current?.focus(); else mover(prodFocusIdx - cols) }
          if (e.key === 'Enter') { e.preventDefault(); const prod = filtrados[prodFocusIdx]; if (prod && prod.stock > 0) agregar(prod) }
        }
      }

      // ── ÁREA CARRITO ──
      if (areaActiva === 'carrito') {
        if (mostrarDropdown && enInput) {
          const filtC = clientes.filter(c => c.nombre?.toLowerCase().includes(busquedaCliente.toLowerCase()) || c.nit?.includes(busquedaCliente)).slice(0,6)
          if (e.key === 'ArrowDown') { e.preventDefault(); setClienteFocusIdx(i => Math.min(i+1, filtC.length-1)) }
          if (e.key === 'ArrowUp')   { e.preventDefault(); setClienteFocusIdx(i => Math.max(i-1, -1)) }
          if (e.key === 'Enter' && clienteFocusIdx >= 0) {
            e.preventDefault()
            const c = filtC[clienteFocusIdx]
            if (c) {
              setClienteSeleccionado(c); setClienteNombre(c.nombre); setNit(c.nit||''); setDui(c.dui||''); setNrc(c.nrc||'')
              setBusquedaCliente(c.nombre); setMostrarDropdown(false); setClienteFocusIdx(-1)
              actualizarVenta('correoFe', c.email||''); actualizarVenta('telefonoFe', c.telefono||'')
              actualizarVenta('correoCcf', c.email||''); actualizarVenta('telefonoCcf', c.telefono||'')
              actualizarVenta('codActividadCcf', c.codActividad||''); actualizarVenta('actividadCcf', c.descActividad||'')
              actualizarVenta('departamentoCcf', c.codDep||''); actualizarVenta('municipioCcf', c.codMun||''); actualizarVenta('distritoCcf', c.codDistrito||'')
              actualizarVenta('direccionCcf', c.complemento||c.direccion||'')
            }
          }
          if (e.key === 'Escape') { setMostrarDropdown(false); setClienteFocusIdx(-1) }
          return
        }
        if (enInput) {
          if (e.key === 'Enter') { e.preventDefault(); document.activeElement?.blur(); setItemFocusIdx(i => Math.min(i+1, carrito.length-1)) }
          if (e.key === 'Escape') { e.preventDefault(); document.activeElement?.blur() }
          return
        }
        if (e.key === 'ArrowDown') { e.preventDefault(); setItemFocusIdx(i => Math.min(i+1, carrito.length-1)) }
        if (e.key === 'ArrowUp')   { e.preventDefault(); setItemFocusIdx(i => Math.max(i-1, 0)) }
        if (e.key === 'Enter')     { e.preventDefault(); const item = carrito[itemFocusIdx]; if (item) { const ref = qtyRefs.current[item.carritoId]; if (ref) { ref.focus(); ref.select() } } }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); const item = carrito[itemFocusIdx]; if (item) setCarrito(c => c.map(x => x.carritoId === item.carritoId ? {...x, qty: x.qty+1} : x)) }
        if (e.key === '-')         { e.preventDefault(); const item = carrito[itemFocusIdx]; if (item) setCarrito(c => c.map(x => x.carritoId === item.carritoId ? {...x, qty: Math.max(1,x.qty-1)} : x)) }
        if (e.key === 'Delete')    { e.preventDefault(); const item = carrito[itemFocusIdx]; if (item) { setCarrito(c => c.filter(x => x.carritoId !== item.carritoId)); setItemFocusIdx(i => Math.max(0,i-1)) } }
        if (e.key === 'c' || e.key === 'C') { e.preventDefault(); clienteInputRef.current?.focus() }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [areaActiva, carrito, filtrados, prodFocusIdx, itemFocusIdx, clienteFocusIdx, mostrarDropdown, busquedaCliente, clientes, modalDTE, modalCobro, mostrarTicket, ventaFinalizada, tipoPago, tipoDte, formaPago, procesando, mostrarDropdownModal, busquedaClienteModal, clienteFocusIdxModal, modalUnidad, unidadFocusIdx, limiteProductos])

  // ── TICKET: ahora es modal, no pantalla separada ──

  // ── RENDER PRINCIPAL ──
  return (
    <div className="pv-fullbleed">
      <style>{pvStyles}</style>

      {/* ── TOPBAR: título izquierda + pausa ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px 8px 56px', borderBottom: '1.5px solid var(--border)', background: 'var(--surface)', flexShrink: 0, minHeight: 52 }}>
        {/* Título grande */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.5px' }}>🛒 Punto de Venta</div>
        </div>
        {/* Separador */}
        <div style={{ width: 1, height: 30, background: 'var(--border)', flexShrink: 0 }} />
        {/* Tabs pausa */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto' }}>
          {ventasPausa.map((v, idx) => (
            <div key={v.id} className={`pausa-tab ${ventaActual === idx ? 'active' : ''}`} onClick={() => cambiarVenta(idx)}
              style={{ padding: '6px 14px', fontSize: 13 }}>
              <span>Venta {idx + 1}</span>
              {v.carrito.length > 0 && <span className={`pausa-count ${ventaActual !== idx ? 'rojo' : ''}`}>{v.carrito.length}</span>}
              {ventasPausa.length > 1 && ventaActual !== idx && (
                <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2, cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); cerrarVentaPausa(idx) }}>✕</span>
              )}
            </div>
          ))}
          {ventasPausa.length < 5 && (
            <div className="pausa-tab nueva" onClick={pausarYNuevaVenta} style={{ padding: '6px 14px', fontSize: 13 }}>
              ⏸ + Pausar y nueva
            </div>
          )}
        </div>
        {/* Saludo al usuario de la sesión */}
        <div style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 14, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', paddingLeft: 12 }}>
          ¡Hola, {(userName || '').split(' ')[0] || 'bienvenido'}! 😊
        </div>
      </div>

      {/* TABS MÓVIL */}
      <div className="pv-tabs">
        {[
          { key: 'productos', label: '📦 Productos' },
          { key: 'carrito',   label: `🛒 Carrito`, badge: carrito.length },
        ].map(t => (
          <button key={t.key} className={`pv-tab ${tabMovil === t.key ? 'active' : ''}`} onClick={() => setTabMovil(t.key)}>
            {t.label}
            {t.badge > 0 && <span className="pv-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="pv-3col" ref={layoutRef}>

        {/* ── COL 1: PRODUCTOS ── */}
        <div className={`pv-col ${tabMovil === 'productos' ? 'tab-activo' : ''} ${areaActiva === 'productos' ? 'area-activa' : ''}`} onClick={() => setAreaActiva('productos')}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', border: '1px solid color-mix(in srgb, var(--border) 55%, transparent)' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
              <button className={`inner-tab ${innerTab === 'productos' ? 'active' : ''}`} onClick={() => setInnerTab('productos')} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'var(--font)', background: innerTab === 'productos' ? 'rgba(0,212,170,0.12)' : 'none', color: innerTab === 'productos' ? 'var(--accent)' : 'var(--muted)' }}>📦 Productos</button>
              <button className={`inner-tab ${innerTab === 'historial' ? 'active' : ''}`} onClick={() => setInnerTab('historial')} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'var(--font)', background: innerTab === 'historial' ? 'rgba(0,212,170,0.12)' : 'none', color: innerTab === 'historial' ? 'var(--accent)' : 'var(--muted)' }}>📋 Historial ({ventas.length})</button>
              {innerTab === 'productos' && (
                <div className="vista-toggle" style={{ marginLeft: 'auto' }}>
                  <button className={`vista-btn ${vistaProd === 'grid' ? 'on' : ''}`} title="Vista de tarjetas"
                    onClick={() => { setVistaProd('grid'); localStorage.setItem('orion_pos_vista', 'grid') }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                  </button>
                  <button className={`vista-btn ${vistaProd === 'tabla' ? 'on' : ''}`} title="Vista de lista"
                    onClick={() => { setVistaProd('tabla'); localStorage.setItem('orion_pos_vista', 'tabla') }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                  </button>
                </div>
              )}
            </div>

            {innerTab === 'productos' && (
              <>
                <div className="prod-search">
                  <input ref={busquedaRef} className="input" placeholder="🔍 Buscar producto..." value={busqueda} onChange={e => {
                  const val = e.target.value
                  setBusqueda(val)
                  setProdFocusIdx(0)
                  setLimiteProductos(50) // al buscar, volvemos a la primera tanda
                  // Auto-agregar si hay match exacto por código de barras (lector)
                  if (val.length >= 6) {
                    const exacto = productos.find(p =>
                      p.codigoBarras?.toLowerCase() === val.toLowerCase() ||
                      p.codigo?.toLowerCase() === val.toLowerCase()
                    )
                    if (exacto && exacto.stock > 0) {
                      // Pequeño delay para que el lector termine de enviar Enter
                      setTimeout(() => {
                        agregar(exacto)
                        setBusqueda('')
                      }, 80)
                    }
                  }
                }} />
                </div>
                {categoriasPOS.length > 0 && (
                  <div className="pos-chips">
                    <button className={`pos-chip ${catActiva === 'todas' ? 'on' : ''}`} onClick={() => { setCatActiva('todas'); setLimiteProductos(50); setProdFocusIdx(0) }}>◉ Todos</button>
                    {categoriasPOS.map(cat => (
                      <button key={cat} className={`pos-chip ${catActiva === cat ? 'on' : ''}`} onClick={() => { setCatActiva(cat); setLimiteProductos(50); setProdFocusIdx(0) }}>{cat}</button>
                    ))}
                  </div>
                )}
                {loadingProds ? (
                  <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">Cargando productos...</div></div>
                ) : filtrados.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon">📦</div><div className="empty-text">No se encontraron productos</div></div>
                ) : vistaProd === 'grid' ? (
                  <div className="producto-grid" ref={gridRef} onScroll={onScrollProductos}>
                    {visibles.map((p, idx) => {
                      const agotado = p.stock <= 0
                      const bajo = p.stock > 0 && p.stock < (p.min || 0)
                      const enCarrito = carrito.filter(c => c.id === p.id).reduce((s, c) => s + c.qty, 0)
                      return (
                        <div key={p.id} className={`producto-card ${agotado ? 'agotado' : ''} ${enCarrito > 0 ? 'en-carrito' : ''} ${areaActiva === 'productos' && prodFocusIdx === idx ? 'focused' : ''}`}
                          ref={prodFocusIdx === idx ? el => el?.scrollIntoView({block:'nearest'}) : null}
                          onClick={() => { if (!agotado) agregar(p) }}>
                          {agotado && <span className="agotado-badge">AGOTADO</span>}
                          {enCarrito > 0 && <span className="prod-en-carrito-badge">{enCarrito}</span>}
                          {/* Ícono/imagen: clic abre popover, stopPropagation evita agregar */}
                          <div className="prod-img-wrap" style={{ cursor: p.imagen ? 'zoom-in' : 'inherit' }}
                            onClick={p.imagen ? (e => { e.stopPropagation(); setImgAmpliada({ src: p.imagen, nombre: p.nombre }) }) : undefined}>
                            {p.imagen
                              ? <img src={p.imagen} alt="" style={{width:56,height:56,objectFit:'cover',borderRadius:14}}
                                  onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
                              : null}
                            <span style={{ display: p.imagen ? 'none' : 'flex', width: '100%', height: '100%' }}><ProductIcon producto={p} /></span>
                          </div>
                          {/* Info */}
                          <div className="prod-info">
                            <div className="prod-nombre" title={p.nombre}>{p.nombre}</div>
                            <div className="prod-precio-iva">${precioConIva(p.precio).toFixed(2)}</div>
                            <div className={`prod-stock ${agotado ? 'out' : bajo ? 'low' : 'ok'}`}>
                              {p.codigo && <span className="prod-cod-inline">{p.codigo} · </span>}
                              {(p.unidad || '').toLowerCase() === 'servicio' ? 'Servicio' : `${p.stock} ${p.unidad || ''}`}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {visibles.length < filtrados.length && (
                      <div style={{ padding: '10px', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                        Mostrando {visibles.length} de {filtrados.length} · baja para ver más
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="producto-tabla" onScroll={onScrollProductos}>
                    <div className="tabla-head">
                      <span>Cód</span>
                      <span>Producto</span>
                      <span style={{ textAlign: 'right' }}>Stock</span>
                      <span style={{ textAlign: 'right' }}>Precio</span>
                    </div>
                    {visibles.map((p, idx) => {
                      const agotado = p.stock <= 0
                      const bajo = p.stock > 0 && p.stock < (p.min || 0)
                      const enCarrito = carrito.filter(c => c.id === p.id).reduce((s, c) => s + c.qty, 0)
                      return (
                        <div key={p.id} className={`prod-fila ${agotado ? 'agotado' : ''} ${enCarrito > 0 ? 'en-carrito' : ''} ${areaActiva === 'productos' && prodFocusIdx === idx ? 'focused' : ''}`}
                          ref={prodFocusIdx === idx ? el => el?.scrollIntoView({block:'nearest'}) : null}
                          onClick={() => { if (!agotado) agregar(p) }}>
                          <span className="pf-cod">{p.codigo || '—'}</span>
                          <span className="pf-nom">
                            <span className="pf-nom-txt" title={p.nombre}>{p.nombre}</span>
                            {enCarrito > 0 && <span className="pf-encarrito">{enCarrito}</span>}
                          </span>
                          <span className={`pf-stock ${agotado ? 'out' : bajo ? 'low' : 'ok'}`}>
                            {(p.unidad || '').toLowerCase() === 'servicio'
                              ? <span className="pf-stock-serv">Servicio</span>
                              : <><span className="pf-stock-n">{p.stock}</span><span className="pf-stock-u">{p.unidad || ''}</span></>}
                          </span>
                          <span className="pf-precio">${precioConIva(p.precio).toFixed(2)}</span>
                        </div>
                      )
                    })}
                    {visibles.length < filtrados.length && (
                      <div style={{ padding: '10px', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                        Mostrando {visibles.length} de {filtrados.length} · baja para ver más
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {innerTab === 'historial' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {ventas.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon">📋</div><div className="empty-text">Sin ventas aún</div></div>
                ) : ventas.map(v => (
                  <div key={v.id} className="historial-item">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {v.cliente}
                        {v.tipoDte && <span style={{ fontSize: 10, fontWeight: 800, fontFamily: 'var(--mono)', background: 'rgba(79,140,255,0.12)', color: 'var(--accent2)', padding: '1px 6px', borderRadius: 4 }}>{v.tipoDte}</span>}
                        {v.tipoPago === 'credito' && <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', padding: '1px 6px', borderRadius: 4 }}>CRÉDITO</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{v.items?.length} prod · {formatFecha(v.createdAt)}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="amount" style={{ fontSize: 14 }}>{fmt(v.total)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── MINI-BAR CARRITO (solo móvil, tab productos, carrito con items) ── */}
        <div className={`pv-minibar ${tabMovil === 'productos' && carrito.length > 0 ? 'visible' : ''}`}
          onClick={() => setTabMovil('carrito')}>
          <div className="pv-minibar-info">
            <span className="pv-minibar-icon">🛒</span>
            <div className="pv-minibar-text">
              <div className="pv-minibar-count">{carrito.length} {carrito.length === 1 ? 'item' : 'items'} en carrito</div>
              <div className="pv-minibar-total">{fmt(total)}</div>
            </div>
          </div>
          <div className="pv-minibar-cta">Ver carrito <span style={{ fontSize: 14 }}>→</span></div>
        </div>

        {/* ── COL 2: CARRITO ── */}
        <div className={`pv-col ${tabMovil === 'carrito' ? 'tab-activo' : ''} ${areaActiva === 'carrito' ? 'area-activa' : ''}`} onClick={() => setAreaActiva('carrito')}>

          {/* Stats encima del carrito — Estilo G (degradado + ícono), compactas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10, flexShrink: 0 }}>
            {[
              { label: 'Ventas hoy', val: ventasHoy.length, color: '#00d4aa', icon: <><path d="M3 3h2l2.4 12.5a2 2 0 0 0 2 1.5h7.7a2 2 0 0 0 2-1.5L21 7H5.2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></> },
              { label: 'Total hoy',  val: fmt(totalHoy),    color: '#4f8cff', icon: <><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></> },
              { label: 'Unidades',   val: productosVendidosHoy, color: '#8b5cf6', icon: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></> },
              { label: 'Por cobrar', val: ventasPendientes,  color: ventasPendientes > 0 ? '#f59e0b' : '#00d4aa', icon: <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></> },
            ].map((s, i) => (
              <div key={i} style={{
                background: `linear-gradient(135deg, color-mix(in srgb, ${s.color} 14%, var(--surface)), var(--surface))`,
                border: `1.5px solid var(--border)`, borderRadius: 12, padding: '8px 11px', minHeight: 54,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: `color-mix(in srgb, ${s.color} 16%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>{s.icon}</svg>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--mono)', color: s.color, lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 2 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="carrito-col">
            <div className="carrito-header">
              <div className="carrito-title">🛒 Carrito <span className="carrito-count">{carrito.length}</span><span style={{fontSize:9,color:"var(--muted)",fontWeight:400,marginLeft:6,fontFamily:"var(--mono)"}}>Tab·↑↓·Enter·Del</span></div>
              {carrito.length > 0 && puede('cancelar_ventas') && (
                <button className="btn btn-danger btn-sm" onClick={nuevaVenta}>🗑️</button>
              )}
            </div>

            <div className="carrito-cliente">
              {clienteSeleccionado ? (
                <div className="cliente-seleccionado">
                  <div>
                    <div className="cliente-sel-nombre">👤 {clienteSeleccionado.nombre}</div>
                    <div className="cliente-sel-detalle">{clienteSeleccionado.nit && `NIT: ${clienteSeleccionado.nit}`}{clienteSeleccionado.nit && clienteSeleccionado.nrc && ' · '}{clienteSeleccionado.nrc && `NRC: ${clienteSeleccionado.nrc}`}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => { setClienteSeleccionado(null); setClienteNombre(''); setBusquedaCliente(''); setNit(''); setDui(''); setNrc('') }}>✕</button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input ref={clienteInputRef} className="input" placeholder="👤 Buscar cliente... (C)" value={busquedaCliente}
                    onChange={e => { setBusquedaCliente(e.target.value); setClienteNombre(e.target.value); setMostrarDropdown(true) }}
                    onFocus={() => setMostrarDropdown(true)}
                    onBlur={() => setTimeout(() => setMostrarDropdown(false), 200)}
                  />
                  {mostrarDropdown && busquedaCliente.length > 0 && (
                    <div className="cliente-dropdown">
                      {clientes.filter(c => c.nombre?.toLowerCase().includes(busquedaCliente.toLowerCase()) || c.nit?.includes(busquedaCliente)).slice(0, 6).map((c, ci) => (
                        <div key={c.id}
                          className={`cliente-option ${clienteFocusIdx === ci ? 'cliente-option-focused' : ''}`}
                          onMouseEnter={() => setClienteFocusIdx(ci)}
                          onMouseLeave={() => setClienteFocusIdx(-1)}
                          onMouseDown={() => {
                              setClienteSeleccionado(c); setClienteNombre(c.nombre)
                              setNit(c.nit||''); setDui(c.dui||''); setNrc(c.nrc||'')
                              setBusquedaCliente(c.nombre); setMostrarDropdown(false); setClienteFocusIdx(-1)
                              actualizarVenta('correoFe', c.email||'')
                              actualizarVenta('telefonoFe', c.telefono||'')
                              actualizarVenta('correoCcf', c.email||'')
                              actualizarVenta('telefonoCcf', c.telefono||'')
                              actualizarVenta('codActividadCcf', c.codActividad||'')
                              actualizarVenta('actividadCcf', c.descActividad||'')
                              actualizarVenta('departamentoCcf', c.codDep||'')
                              actualizarVenta('municipioCcf', c.codMun||'')
                              actualizarVenta('distritoCcf', c.codDistrito||'')
                              actualizarVenta('direccionCcf', c.complemento||c.direccion||'')
                            }}>
                          <div className="cliente-option-nombre">👤 {c.nombre}</div>
                          <div className="cliente-option-detalle">{c.nit && `NIT: ${c.nit}`}{c.nit && c.nrc && ' · '}{c.nrc && `NRC: ${c.nrc}`}</div>
                        </div>
                      ))}
                      {clientes.filter(c => c.nombre?.toLowerCase().includes(busquedaCliente.toLowerCase())).length === 0 && (
                        <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>Se usará como nombre libre</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="carrito-items">
              {carrito.length === 0 ? (
                <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                  <div className="carrito-vacio-icon">🛒</div>
                  <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 14 }}>Agrega productos</div>
                </div>
              ) : carrito.map((c, ci) => (
                <div key={c.carritoId} className={`carrito-item ${areaActiva === 'carrito' && itemFocusIdx === ci ? 'carrito-item-focused' : ''}`}>
                  <div className="ci-top">
                    <div className="ci-nombre">{c.nombre}{c.unidad && <span style={{ fontSize: 9, color: 'var(--accent2)', fontWeight: 700, background: 'rgba(74,143,232,0.1)', padding: '1px 5px', borderRadius: 3, marginLeft: 4 }}>{c.unidad}</span>}</div>
                    <div className="ci-precio-iva">${precioConIva(c.precio).toFixed(2)} c/IVA{c.descuento > 0 && <span style={{ color: '#ef4444', marginLeft: 4 }}>-{c.descuento}%</span>}</div>
                  </div>
                  <div className="ci-bottom-row">
                    {puede('aplicar_descuentos') && (
                      <input className="ci-desc-input" type="number" min="0" max="100" placeholder="%" title="Descuento %"
                        value={c.descuento || ''}
                        onChange={e => {
                          const desc = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0))
                          setCarrito(cart => cart.map(item => item.carritoId === c.carritoId ? { ...item, descuento: desc, precio: (item.precioOriginal || item.precio) * (1 - desc/100) } : item))
                        }}
                        onClick={() => { if (!c.precioOriginal) setCarrito(cart => cart.map(item => item.carritoId === c.carritoId ? { ...item, precioOriginal: item.precio } : item)) }}
                      />
                    )}
                    <button className="qty-btn" onClick={() => cambiarQty(c.carritoId, -1)}>−</button>
                    <input className="ci-qty-input" type="number" min="1" value={c.qty}
                      ref={el => { if (el) qtyRefs.current[c.carritoId] = el; else delete qtyRefs.current[c.carritoId] }}
                      onChange={e => {
                        const val = Math.max(1, parseInt(e.target.value) || 1)
                        const prod = productos.find(p => p.id === c.id)
                        setCarrito(cart => cart.map(item => item.carritoId === c.carritoId ? { ...item, qty: Math.min(val, prod?.stock || 9999) } : item))
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); setItemFocusIdx(i => Math.min(i+1, carrito.length-1)) } }}
                    />
                    <button className="qty-btn" onClick={() => cambiarQty(c.carritoId, 1)}>+</button>
                    <div className="ci-total">{fmt(precioConIva(c.precio) * c.qty)}</div>
                    <button className="qty-btn" style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)', fontSize: 11 }}
                      onClick={() => setCarrito(cart => cart.filter(item => item.carritoId !== c.carritoId))}>✕</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="total-box">
              <div className="total-row"><span>Subtotal (sin IVA)</span><span className="amount">{fmt(subtotal)}</span></div>
              <div className="total-row"><span>IVA (13%)</span><span className="amount">{fmt(ivaTotal)}</span></div>
              <div className="total-row final"><span>TOTAL</span><span className="amount" style={{ color: 'var(--accent)' }}>{fmt(total)}</span></div>
              <button className="btn-cobrar" style={{ marginTop: 10 }}
                onClick={() => { if (carrito.length > 0) { setModalDTE(true); setMostrarCamposCliente(false); actualizarVenta('tipoDte','FE') } }}
                disabled={carrito.length === 0 || (requerirCaja && !cajaAbierta)}>
                🧾 Cobrar {fmt(total)} <span style={{fontFamily:'var(--mono)',fontSize:11,opacity:0.6,marginLeft:6,background:'rgba(0,0,0,0.2)',padding:'2px 7px',borderRadius:4}}>F9</span>
              </button>
            </div>
          </div>
        </div>


      </div>

      {/* ── MODAL 1: CONFIGURAR DTE ── */}
      {modalDTE && (
        <div className="dte-overlay">
          <div className="dte-modal">
            <div className="dte-modal-header">
              <div style={{ fontWeight: 800, fontSize: 16 }}>🧾 Configurar DTE</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', background: 'var(--surface3,var(--surface2))', padding: '2px 8px', borderRadius: 5, border: '1px solid var(--border)' }}>F5 FE · F6 CCF · Enter →</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setModalDTE(false)}>✕ Esc</button>
              </div>
            </div>

            <div className="dte-modal-body">

              {/* Tipo DTE */}
              <div>
                <div className="cm-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  Tipo de Documento
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, background: 'rgba(0,0,0,0.08)', padding: '1px 6px', borderRadius: 3, border: '1px solid var(--border)', fontWeight: 700 }}>F5</span>
                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>FE</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, background: 'rgba(0,0,0,0.08)', padding: '1px 6px', borderRadius: 3, border: '1px solid var(--border)', fontWeight: 700 }}>F6</span>
                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>CCF</span>
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  {TIPOS_DTE.map(t => (
                    <div key={t.codigo}
                      className={`cm-dte-btn ${tipoDte === t.codigo ? 'selected' : ''}`}
                      style={{ '--btn-color': t.color, cursor: 'pointer', flex: '0 1 180px' }}
                      onClick={() => setTipoDte(t.codigo)}>
                      <div className="cm-dte-icon">{t.icon}</div>
                      <div className="cm-dte-code" style={{ color: tipoDte === t.codigo ? t.color : 'var(--text)' }}>{t.codigo}</div>
                      <div className="cm-dte-name">{t.nombre}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cliente */}
              <div>
                <div className="cm-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  Cliente
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, background: 'rgba(0,0,0,0.08)', padding: '1px 6px', borderRadius: 3, border: '1px solid var(--border)', fontWeight: 700 }}>↑↓ Enter</span>
                </div>
                {clienteSeleccionado ? (
                  <div className="cliente-seleccionado">
                    <div>
                      <div className="cliente-sel-nombre">👤 {clienteSeleccionado.nombre}</div>
                      <div className="cliente-sel-detalle">{clienteSeleccionado.nit && `NIT: ${clienteSeleccionado.nit}`}{clienteSeleccionado.nrc && ` · NRC: ${clienteSeleccionado.nrc}`}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setClienteSeleccionado(null); setClienteNombre(''); setBusquedaClienteModal(''); setNit(''); setDui(''); setNrc('') }}>✕</button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input className="input" placeholder="🔍 Buscar cliente..." value={busquedaClienteModal}
                      onChange={e => { setBusquedaClienteModal(e.target.value); setClienteNombre(e.target.value); setMostrarDropdownModal(true) }}
                      onFocus={() => setMostrarDropdownModal(true)}
                      onBlur={() => setTimeout(() => setMostrarDropdownModal(false), 200)}
                      style={{ fontSize: 14 }}
                    />
                    {mostrarDropdownModal && busquedaClienteModal.length > 0 && (
                      <div className="cliente-dropdown" style={{ zIndex: 1200 }}>
                        {clientes.filter(c => c.nombre?.toLowerCase().includes(busquedaClienteModal.toLowerCase()) || c.nit?.includes(busquedaClienteModal)).slice(0, 6).map((c, ci) => (
                          <div key={c.id}
                            className={`cliente-option ${clienteFocusIdxModal === ci ? 'cliente-option-focused' : ''}`}
                            onMouseEnter={() => setClienteFocusIdxModal(ci)}
                            onMouseLeave={() => setClienteFocusIdxModal(-1)}
                            onMouseDown={() => {
                              setClienteSeleccionado(c); setClienteNombre(c.nombre)
                              setNit(c.nit||''); setDui(c.dui||''); setNrc(c.nrc||'')
                              setBusquedaClienteModal(c.nombre); setMostrarDropdownModal(false); setClienteFocusIdxModal(-1)
                              actualizarVenta('correoFe', c.email||'')
                              actualizarVenta('telefonoFe', c.telefono||'')
                              actualizarVenta('correoCcf', c.email||'')
                              actualizarVenta('telefonoCcf', c.telefono||'')
                              actualizarVenta('codActividadCcf', c.codActividad||'')
                              actualizarVenta('actividadCcf', c.descActividad||'')
                              actualizarVenta('departamentoCcf', c.codDep||'')
                              actualizarVenta('municipioCcf', c.codMun||'')
                              actualizarVenta('distritoCcf', c.codDistrito||'')
                              actualizarVenta('direccionCcf', c.complemento||c.direccion||'')
                            }}>
                            <div className="cliente-option-nombre">👤 {c.nombre}</div>
                            <div className="cliente-option-detalle">{c.nit && `NIT: ${c.nit}`}{c.nit && c.nrc && ' · '}{c.nrc && `NRC: ${c.nrc}`}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Campos según tipo — solo FE y CCF usan este panel.
                  NC y ND tienen sus propios bloques más abajo. */}
              {['FE','CCF'].includes(tipoDte) && (
              <div>
                <button onClick={() => setMostrarCamposCliente(v => !v)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${mostrarCamposCliente ? 'var(--accent)' : 'var(--border)'}`, background: mostrarCamposCliente ? 'rgba(0,212,170,0.06)' : 'var(--surface2)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700, color: mostrarCamposCliente ? 'var(--accent)' : 'var(--muted)', transition: 'all 0.15s' }}>
                  <span>📋 Datos del cliente {tipoDte} {tipoDte === 'FE' && <span style={{ fontWeight: 400, fontSize: 11 }}>(opcionales)</span>} <span style={{fontFamily:"var(--mono)",fontSize:9,opacity:0.6,background:"rgba(0,0,0,0.1)",padding:"1px 5px",borderRadius:3,border:"1px solid var(--border)"}}>F7</span></span>
                  <span>{mostrarCamposCliente ? '▲' : '▼'}</span>
                </button>
                 {mostrarCamposCliente && tipoDte === 'FE' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                    <input className="input" placeholder="Nombre del cliente" value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input className="input" placeholder="DUI (opcional)" value={dui} onChange={e => setDui(e.target.value)} style={{ fontFamily: 'var(--mono)' }} />
                      <input className="input" placeholder="Teléfono (opcional)" value={ventaData.telefonoFe || ''} onChange={e => actualizarVenta('telefonoFe', e.target.value)} />
                    </div>
                    <input className="input" placeholder="Correo electrónico (opcional)" value={ventaData.correoFe || ''} onChange={e => actualizarVenta('correoFe', e.target.value)} />
                  </div>
                )}
                 {mostrarCamposCliente && tipoDte === 'CCF' && (
                  <div style={{ marginTop: 10 }}>
                    {/* Tarjeta solo lectura — datos del cliente CCF */}
                    {clienteSeleccionado ? (
                      <div style={{ background: 'rgba(79,140,255,0.06)', border: '1.5px solid rgba(79,140,255,0.25)', borderRadius: 12, padding: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#4f8cff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                          Datos del cliente CCF (solo lectura)
                        </div>
                        {[
                          ['Nombre', clienteNombre],
                          ['NIT', nit],
                          ['NRC', nrc],
                          ['Actividad', ventaData.codActividadCcf && ventaData.actividadCcf ? `${ventaData.codActividadCcf} — ${ventaData.actividadCcf}` : ventaData.codActividadCcf || '—'],
                          ['Departamento', getNombreDep(ventaData.departamentoCcf) || ventaData.departamentoCcf || '—'],
                          ['Municipio', getNombreMun(ventaData.departamentoCcf, ventaData.municipioCcf) || ventaData.municipioCcf || '—'],
                          ['Dirección', ventaData.direccionCcf || '—'],
                          ['Teléfono', ventaData.telefonoCcf || '—'],
                          ['Correo', ventaData.correoCcf || '—'],
                        ].map(([label, val]) => (
                          <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
                            <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 700, minWidth: 90, paddingTop: 1 }}>{label}:</span>
                            <span style={{ color: 'var(--text)', fontWeight: 500, wordBreak: 'break-word' }}>{val}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(79,140,255,0.08)', borderRadius: 8, fontSize: 11, color: '#4f8cff' }}>
                          💡 Si los datos están mal, cancela la venta, edita el cliente en el módulo Clientes y vuelve.
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
                        Busca y selecciona un cliente para ver sus datos CCF
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* Campos NC / ND: referencia al DTE original */}
              {['NC','ND'].includes(tipoDte) && (
                <div style={{ background: 'rgba(139,92,246,0.06)', border: '1.5px solid rgba(139,92,246,0.25)', borderRadius: 12, padding: 14 }}>
                  <div className="cm-label" style={{ color: '#8b5cf6', marginBottom: 8 }}>
                    📎 DTE que se {tipoDte === 'NC' ? 'corrige' : 'complementa'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 700 }}>Tipo DTE referencia *</div>
                        <select className="input" value={dteReferencia} onChange={e => setDteReferencia(e.target.value)} style={{ fontSize: 13 }}>
                          <option value="">Seleccionar...</option>
                          <option value="FE">FE — Factura</option>
                          <option value="CCF">CCF — Crédito Fiscal</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 700 }}>Número del DTE *</div>
                        <input className="input" placeholder="FE-000001" value={numeroReferencia} onChange={e => setNumeroReferencia(e.target.value)} style={{ fontSize: 13 }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 700 }}>Motivo *</div>
                      <input className="input" placeholder={tipoDte === 'NC' ? 'Error en precio, devolución...' : 'Gasto adicional, diferencia...'} value={motivoNcNd} onChange={e => setMotivoNcNd(e.target.value)} style={{ fontSize: 13 }} />
                    </div>
                  </div>
                </div>
              )}

            </div>

            <div className="dte-modal-footer">
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setModalDTE(false)}>✕ Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 2, fontSize: 15 }}
                onClick={() => { setModalDTE(false); setModalCobro(true) }}
                autoFocus>
                Continuar al Cobro → <span style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.7, marginLeft: 6 }}>Enter</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: COBRAR ── */}
      {modalCobro && (
        <div className="cobro-overlay">
          <div className="cobro-modal">
            <div className="cobro-modal-header">
              <div>
                <div className="cobro-modal-title">💳 Cobrar</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {tipoDte} · {clienteNombre || 'Consumidor Final'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 900, color: 'var(--accent)' }}>{fmt(total)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => { setModalCobro(false); setModalDTE(true) }}>← Esc</button>
              </div>
            </div>

            <div className="cobro-modal-body">

              {/* Resumen colapsable — total siempre visible */}
              <div className="cm-resumen">
                <div onClick={() => setResumenExpandido(v => !v)}
                  style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                    {resumenExpandido ? '▲' : '▼'} {carrito.length} producto{carrito.length !== 1 ? 's' : ''}
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                    {fmt(total)}
                  </span>
                </div>
                {resumenExpandido && (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', maxHeight: 160, overflowY: 'auto' }}>
                      {carrito.map((c, i) => (
                        <div key={i} className="cm-item">
                          <span style={{ color: 'var(--text2)' }}>{c.qty}× {c.nombre}</span>
                          <span className="amount">{fmt(precioConIva(c.precio) * c.qty)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="cm-totales" style={{ borderTop: '1px solid var(--border)' }}>
                      <div className="cm-total-row"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                      <div className="cm-total-row"><span>IVA 13%</span><span>{fmt(ivaTotal)}</span></div>
                    </div>
                  </>
                )}
              </div>

              {/* Contado / Crédito */}
              <div>
                <div className="cm-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  Forma de Pago
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, background: 'rgba(0,0,0,0.08)', padding: '1px 6px', borderRadius: 3, border: '1px solid var(--border)', fontWeight: 700 }}>F5</span>
                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>Contado</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, background: 'rgba(0,0,0,0.08)', padding: '1px 6px', borderRadius: 3, border: '1px solid var(--border)', fontWeight: 700 }}>F6</span>
                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>Crédito</span>
                </div>
                <div className="cm-pago-grid">
                  <div className={`cm-pago-btn ${tipoPago === 'contado' ? 'selected-contado' : ''}`} onClick={() => setTipoPago('contado')}>
                    <div className="cm-pago-label" style={{ color: tipoPago === 'contado' ? '#00d4aa' : 'var(--text)' }}>💵 Contado</div>
                    <div className="cm-pago-desc">Paga ahora</div>
                  </div>
                  <div className={`cm-pago-btn ${tipoPago === 'credito' ? 'selected-credito' : ''}`} onClick={() => setTipoPago('credito')}>
                    <div className="cm-pago-label" style={{ color: tipoPago === 'credito' ? '#f59e0b' : 'var(--text)' }}>📅 Crédito</div>
                    <div className="cm-pago-desc">Paga después</div>
                  </div>
                </div>
              </div>

              {tipoPago === 'credito' && (
                <div>
                  <div className="cm-label" style={{ marginBottom: 8 }}>Fecha de Vencimiento *</div>
                  <input className="input" type="date" value={fechaVencimiento} min={fechaSV()} onChange={e => setFechaVencimiento(e.target.value)} style={{ fontSize: 14 }} />
                </div>
              )}

              {tipoPago === 'contado' && (
                <>
                  <div>
                    <div className="cm-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      Método de Cobro
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, background: 'rgba(0,0,0,0.08)', padding: '1px 6px', borderRadius: 3, border: '1px solid var(--border)', fontWeight: 700 }}>1–5</span>
                    </div>
                    <div className="cm-fpago-grid">
                      {FORMAS_PAGO.map(f => (
                        <div key={f.id} className={`cm-fpago-btn ${formaPago === f.id ? 'selected' : ''}`}
                          style={{ '--fp-color': f.color }}
                          onClick={() => {
                            setFormaPago(f.id)
                            if (f.id !== 'efectivo') setEfectivoRecibido('')
                            if (f.id !== 'mixto') setPagosMixto({ efectivo: '', tarjeta: '', transferencia: '', cheque: '' })
                          }}>
                          <span className="cm-fpago-key">{f.key}</span>
                          <div className="cm-fpago-icon">{f.icon}</div>
                          <div className="cm-fpago-label" style={{ color: formaPago === f.id ? f.color : 'var(--text)' }}>{f.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                 {formaPago === 'efectivo' && (
                    <div className="cm-cambio">
                      <div className="cm-cambio-row">
                        <span style={{ fontWeight: 700 }}>Total a cobrar</span>
                        <span className="cm-cambio-total">{fmt(total)}</span>
                      </div>
                      <div className="cm-cambio-row">
                        <span style={{ fontWeight: 700 }}>Efectivo recibido</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--muted)' }}>$</span>
                          <input ref={efectivoRef} className="cm-cambio-input" type="number" step="0.01" min="0"
                            placeholder="0.00" value={efectivoRecibido} onChange={e => setEfectivoRecibido(e.target.value)} autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }} />
                        </div>
                      </div>
                      <div className="cm-bills">
                        {[1,5,10,20,50,100].map(b => <button key={b} className="cm-bill" onClick={() => setEfectivoRecibido(String(b))}>${b}</button>)}
                        <button className="cm-bill" style={{ borderColor: 'rgba(0,212,170,0.4)', color: 'var(--accent)' }} onClick={() => setEfectivoRecibido(total.toFixed(2))}>Exacto</button>
                      </div>
                      {efectivoRecibido && (
                        <div className="cm-cambio-row" style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, background: vuelto >= 0 ? 'rgba(79,140,255,0.14)' : 'rgba(239,68,68,0.12)', border: `1.5px solid ${vuelto >= 0 ? 'rgba(79,140,255,0.5)' : 'rgba(239,68,68,0.4)'}`, marginBottom: 0 }}>
                          <span style={{ fontWeight: 800, fontSize: 17 }}>{vuelto >= 0 ? '💵 Vuelto' : '⚠️ Falta'}</span>
                          <span style={{ fontSize: 22, fontWeight: 900, fontFamily: 'var(--mono)', color: vuelto >= 0 ? '#4f8cff' : '#ef4444' }}>{vuelto >= 0 ? fmt(vuelto) : fmt(Math.abs(vuelto))}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {formaPago === 'mixto' && (() => {
                    const totalPagado = ['efectivo','tarjeta','transferencia','cheque']
                      .reduce((s, m) => s + (parseFloat(pagosMixto[m]) || 0), 0)
                    const restante = Math.round((total - totalPagado) * 100) / 100 // centavos, evita pelusa decimal
                    const setPagoMetodo = (metodo, valor) => setPagosMixto(p => ({ ...p, [metodo]: valor }))
                    const METODOS_MIXTO = [
                      { id: 'efectivo',      icon: '💵', label: 'Efectivo',      color: '#00d4aa' },
                      { id: 'tarjeta',       icon: '💳', label: 'Tarjeta',       color: '#4f8cff' },
                      { id: 'transferencia', icon: '🏦', label: 'Transferencia', color: '#8b5cf6' },
                      { id: 'cheque',        icon: '📝', label: 'Cheque',        color: '#f59e0b' },
                    ]
                    return (
                      <div className="cm-cambio">
                        <div className="cm-cambio-row">
                          <span style={{ fontWeight: 700 }}>Total a cobrar</span>
                          <span className="cm-cambio-total">{fmt(total)}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                          {METODOS_MIXTO.map(m => (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 18, width: 26, textAlign: 'center' }}>{m.icon}</span>
                              <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: m.color }}>{m.label}</span>
                              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>$</span>
                              <input className="cm-cambio-input" type="number" step="0.01" min="0"
                                placeholder="0.00" value={pagosMixto[m.id]}
                                onChange={e => setPagoMetodo(m.id, e.target.value)}
                                style={{ width: 110, textAlign: 'right' }} />
                            </div>
                          ))}
                        </div>
                        <div className="cm-cambio-row" style={{ marginTop: 12, paddingTop: 10, borderTop: '2px solid var(--border)' }}>
                          <span style={{ fontWeight: 800, fontSize: 14 }}>Total pagado</span>
                          <span style={{ fontWeight: 800, fontSize: 16, fontFamily: 'var(--mono)' }}>{fmt(totalPagado)}</span>
                        </div>
                        {totalPagado > 0 && (
                          <div className="cm-cambio-row" style={{ marginBottom: 0 }}>
                            <span style={{ fontWeight: 800, fontSize: 15 }}>{Math.round(restante * 100) > 0 ? 'Falta' : 'Vuelto'}</span>
                            <span className={`cm-vuelto ${Math.round(restante * 100) <= 0 ? 'ok' : 'falta'}`}>
                              {Math.round(restante * 100) <= 0 ? fmt(Math.abs(restante)) : `Faltan ${fmt(restante)}`}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {formaPago === 'cheque' && (
                    <div className="cm-ref">
                      <div className="cm-label" style={{ color: '#f59e0b', marginBottom: 8 }}>📝 Datos del Cheque (opcional)</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input className="input" placeholder="No. de cheque" value={refCheque} onChange={e => setRefCheque(e.target.value)} />
                        <input className="input" placeholder="Banco emisor" value={bancoCheque} onChange={e => setBancoCheque(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {formaPago === 'transferencia' && (
                    <div className="cm-ref">
                      <div className="cm-label" style={{ color: '#8b5cf6', marginBottom: 8 }}>🏦 Datos de Transferencia (opcional)</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input className="input" placeholder="No. de referencia" value={refTransferencia} onChange={e => setRefTransferencia(e.target.value)} />
                        <input className="input" placeholder="Banco origen" value={bancoTransferencia} onChange={e => setBancoTransferencia(e.target.value)} />
                      </div>
                    </div>
                  )}
                </>
              )}

              {requerirCaja && !cajaAbierta && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>🔒 Caja no abierta</div>
                  <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={() => { setModalCobro(false); navigate('/caja') }}>💰 Ir a Caja</button>
                </div>
              )}

            </div>

            <div className="cobro-modal-footer">
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setModalCobro(false); setModalDTE(true) }}>← Volver</button>
              <button className="btn btn-primary" style={{ flex: 3, fontSize: 15, padding: '12px 0' }}
                onClick={procesarVenta}
                disabled={procesando || (requerirCaja && !cajaAbierta)}>
                {procesando ? '⏳ Procesando...' : <><span>✅ Confirmar Cobro {fmt(total)}</span><span style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.6, marginLeft: 8, background: 'rgba(0,0,0,0.15)', padding: '2px 7px', borderRadius: 4 }}>Enter</span></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ALERTA SISTEMA ── */}
      {alerta && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}
          onClick={() => setAlerta(null)}>
          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '28px 32px', maxWidth: 380, width: '100%', boxShadow: '0 25px 80px rgba(0,0,0,0.5)', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{alerta.titulo}</div>
            <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>{alerta.mensaje}</div>
            <button className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: 15 }} onClick={() => setAlerta(null)} autoFocus>
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* ── POPOVER IMAGEN AMPLIADA ── */}
      {imgAmpliada && (
        <>
          {/* Backdrop transparente — clic cierra */}
          <div className="img-backdrop" onClick={() => setImgAmpliada(null)} />
          {/* Popover draggable */}
          <div className="img-popover"
            style={{ top: imgAmpliada.y ?? '50%', left: imgAmpliada.x ?? '30%', transform: imgAmpliada.x ? 'none' : 'translate(-50%, -50%)' }}
            onMouseDown={e => {
              if (e.target.classList.contains('img-popover-close')) return
              const el = e.currentTarget
              const startX = e.clientX - el.getBoundingClientRect().left
              const startY = e.clientY - el.getBoundingClientRect().top
              const onMove = ev => {
                const x = ev.clientX - startX
                const y = ev.clientY - startY
                el.style.left = x + 'px'
                el.style.top = y + 'px'
                el.style.transform = 'none'
              }
              const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
              window.addEventListener('mousemove', onMove)
              window.addEventListener('mouseup', onUp)
            }}
            onTouchStart={e => {
              const touch = e.touches[0]
              const el = e.currentTarget
              const rect = el.getBoundingClientRect()
              const startX = touch.clientX - rect.left
              const startY = touch.clientY - rect.top
              const onMove = ev => {
                const t = ev.touches[0]
                el.style.left = (t.clientX - startX) + 'px'
                el.style.top = (t.clientY - startY) + 'px'
                el.style.transform = 'none'
              }
              const onEnd = () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd) }
              window.addEventListener('touchmove', onMove, { passive: true })
              window.addEventListener('touchend', onEnd)
            }}>
            <button className="img-popover-close" onClick={e => { e.stopPropagation(); setImgAmpliada(null) }}>✕</button>
            <img src={imgAmpliada.src} alt={imgAmpliada.nombre} />
            <div className="img-popover-nombre">{imgAmpliada.nombre}</div>
          </div>
        </>
      )}

            {/* ── MODAL UNIDADES ── */}
      {modalUnidad && (
        <div className="modal-overlay" onClick={e => e.stopPropagation()}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">📦 Seleccionar Unidad</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}><strong style={{ color: 'var(--text)' }}>{modalUnidad.nombre}</strong> · Stock: {modalUnidad.stock} {modalUnidad.unidad}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[{ nombre: modalUnidad.unidad, factor: 1, precio: modalUnidad.precio, desc: 'Unidad principal', esPrincipal: true }, ...(modalUnidad.unidadesAdicionales || []).map(u => ({ ...u, desc: `= ${u.factor} ${modalUnidad.unidad}`, esPrincipal: false }))].map((u, i) => (
                <div key={i}
                  onClick={() => { agregar(modalUnidad, u); setModalUnidad(null) }}
                  onMouseEnter={() => setUnidadFocusIdx(i)}
                  style={{
                    padding: '13px 16px', borderRadius: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.12s',
                    border: unidadFocusIdx === i ? '2px solid var(--accent)' : '1.5px solid var(--border)',
                    background: unidadFocusIdx === i ? 'rgba(0,212,170,0.08)' : 'var(--surface2)',
                    boxShadow: unidadFocusIdx === i ? '0 0 0 3px rgba(0,212,170,0.15)' : 'none',
                  }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: unidadFocusIdx === i ? 'var(--accent)' : 'var(--text)' }}>{u.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{u.desc}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: unidadFocusIdx === i ? 'var(--accent)' : 'var(--accent2)', fontSize: 16 }}>
                    ${u.esPrincipal ? precioConIva(u.precio).toFixed(2) : (u.precio ? (parseFloat(u.precio)*1.13).toFixed(2) : (modalUnidad.precio*u.factor*1.13).toFixed(2))}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setModalUnidad(null)}>Cancelar</button></div>
          </div>
        </div>
      )}

      {/* ── MODAL TICKET VENTA COMPLETADA ── */}
      {mostrarTicket && ventaFinalizada && (() => {
        const v = ventaFinalizada
        const tipoI = TIPOS_DTE.find(t => t.codigo === v.tipoDte)
        const msgWA = encodeURIComponent(
          `¡Gracias por su compra! 🛒\n\n` +
          `*${tipoI?.nombre}* · ${v.numeroDte}\n` +
          `Cliente: ${v.cliente}\n\n` +
          v.carrito.map(c => `• ${c.qty}x ${c.nombre}: $${(precioConIva(c.precio)*c.qty).toFixed(2)}`).join('\n') +
          `\n\nSubtotal: $${v.subtotal.toFixed(2)}\nIVA 13%: $${v.ivaTotal.toFixed(2)}\n*TOTAL: $${v.total.toFixed(2)}*\n\nPagó con: ${v.formaPago || v.tipoPago}`
        )
        const asunto = encodeURIComponent(`${tipoI?.nombre} ${v.numeroDte} - ${v.cliente}`)
        const cuerpo = encodeURIComponent(
          `Estimado/a ${v.cliente},\n\nAdjuntamos el detalle de su compra:\n\n` +
          v.carrito.map(c => `• ${c.qty}x ${c.nombre}: $${(precioConIva(c.precio)*c.qty).toFixed(2)}`).join('\n') +
          `\n\nSubtotal: $${v.subtotal.toFixed(2)}\nIVA: $${v.ivaTotal.toFixed(2)}\nTOTAL: $${v.total.toFixed(2)}\n\nGracias por su preferencia.`
        )
        return (
          <div className="ticket-overlay">
            <div className="ticket-modal" onClick={e => e.stopPropagation()}>
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>¡Venta Completada!</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: tipoI.color + '18', color: tipoI.color, border: `1px solid ${tipoI.color}40`, fontFamily: 'var(--mono)' }}>
                  🧾 {v.numeroDte} — {tipoI?.nombre}
                </div>
              </div>

              <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 14, marginBottom: 14, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>👤 {v.cliente}</div>
                {v.carrito.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5, gap: 10 }}>
                    <span style={{ color: 'var(--text2)' }}>{c.qty}x {c.nombre}</span>
                    <span className="amount">{fmt(precioConIva(c.precio) * c.qty)}</span>
                  </div>
                ))}
                <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 3 }}><span>Subtotal</span><span>{fmt(v.subtotal)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}><span>IVA 13%</span><span>{fmt(v.ivaTotal)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 900 }}><span>TOTAL</span><span className="amount" style={{ color: 'var(--accent)' }}>{fmt(v.total)}</span></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>GUARDADO</div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>🔥 Firebase</div>
                </div>
                <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>STOCK</div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>📦 Actualizado</div>
                </div>
                {/* Estado de la transmisión al MH */}
                <div style={{
                  background:
                    estadoTransmisionPOS === 'procesado' ? 'rgba(0,212,170,0.15)'
                    : estadoTransmisionPOS === 'rechazado' ? 'rgba(239,68,68,0.15)'
                    : estadoTransmisionPOS === 'timeout' || estadoTransmisionPOS === 'error' ? 'rgba(245,158,11,0.15)'
                    : 'var(--surface2)',
                  border: `1.5px solid ${
                    estadoTransmisionPOS === 'procesado' ? 'rgba(0,212,170,0.4)'
                    : estadoTransmisionPOS === 'rechazado' ? 'rgba(239,68,68,0.4)'
                    : estadoTransmisionPOS === 'timeout' || estadoTransmisionPOS === 'error' ? 'rgba(245,158,11,0.4)'
                    : 'transparent'
                  }`,
                  borderRadius: 10, padding: 10, textAlign: 'center'
                }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>MIN. HACIENDA</div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>
                    {estadoTransmisionPOS === 'transmitiendo' && '🔄 Enviando...'}
                    {estadoTransmisionPOS === 'procesado' && '✅ Procesado'}
                    {estadoTransmisionPOS === 'rechazado' && '❌ Rechazado'}
                    {estadoTransmisionPOS === 'timeout' && '⏰ Tardó MH'}
                    {estadoTransmisionPOS === 'error' && '⚠️ Sin red'}
                    {!estadoTransmisionPOS && '— Pendiente'}
                  </div>
                </div>
              </div>

              {/* Detalle del resultado del MH */}
              {estadoTransmisionPOS === 'procesado' && resultadoTransmisionPOS?.sello && (
                <div style={{
                  background: resultadoTransmisionPOS?.demo ? 'rgba(168,85,247,0.08)' : 'rgba(0,212,170,0.08)',
                  border: `1px solid ${resultadoTransmisionPOS?.demo ? 'rgba(168,85,247,0.3)' : 'rgba(0,212,170,0.3)'}`,
                  borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 11,
                }}>
                  <div style={{ fontWeight: 700, color: resultadoTransmisionPOS?.demo ? '#a855f7' : '#00b894', marginBottom: 3 }}>
                    {resultadoTransmisionPOS?.demo ? '🧪 Sello simulado (DEMO — no transmitido al MH)' : '✓ Sello de Recepción del MH'}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)', wordBreak: 'break-all' }}>
                    {resultadoTransmisionPOS.sello}
                  </div>
                </div>
              )}
              {(estadoTransmisionPOS === 'rechazado' || estadoTransmisionPOS === 'timeout' || estadoTransmisionPOS === 'error') && resultadoTransmisionPOS?.motivo && (
                <div style={{
                  background: estadoTransmisionPOS === 'rechazado' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                  border: `1px solid ${estadoTransmisionPOS === 'rechazado' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
                  borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 11,
                }}>
                  <div style={{ fontWeight: 700, color: estadoTransmisionPOS === 'rechazado' ? '#ef4444' : '#f59e0b', marginBottom: 3 }}>
                    {estadoTransmisionPOS === 'rechazado' ? '❌ El MH rechazó el DTE' : '⏰ Quedó pendiente'}
                  </div>
                  <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{resultadoTransmisionPOS.motivo}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>
                    💡 La venta está guardada. Andá a <strong>Facturas DTE</strong> para retransmitirla.
                  </div>
                </div>
              )}

              {/* Imprimir */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <button className="btn btn-ghost" style={{ padding: '12px 8px', fontSize: 14 }} onClick={() => imprimirTicket(v)}>🧾 Ticket Térmico</button>
                <button className="btn btn-ghost" style={{ padding: '12px 8px', fontSize: 14 }} onClick={() => imprimirPDFVenta(v)}>📄 PDF Completo</button>
              </div>

              {/* Enviar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <a href={`https://wa.me/?text=${msgWA}`} target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 8px', borderRadius: 12, border: '1.5px solid rgba(37,211,102,0.3)', background: 'rgba(37,211,102,0.08)', color: '#25D366', fontWeight: 700, fontSize: 14, cursor: 'pointer', textDecoration: 'none' }}>
                  💬 WhatsApp
                </a>
                <a href={`mailto:?subject=${asunto}&body=${cuerpo}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 8px', borderRadius: 12, border: '1.5px solid rgba(74,143,232,0.3)', background: 'rgba(74,143,232,0.08)', color: 'var(--accent)', fontWeight: 700, fontSize: 14, cursor: 'pointer', textDecoration: 'none' }}>
                  📧 Correo
                </a>
              </div>

              <button className="btn btn-ghost" style={{ width: '100%', marginBottom: 10, padding: '12px', fontSize: 14 }} onClick={() => { nuevaVenta(); navigate('/facturas') }}>📋 Ver en Facturas DTE</button>
              <button className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: 16, fontWeight: 800 }} onClick={nuevaVenta}>+ Nueva Venta <span style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.6, marginLeft: 6, background: 'rgba(0,0,0,0.2)', padding: '2px 7px', borderRadius: 4 }}>Enter</span></button>
            </div>
          </div>
        )
      })()}

      {/* ATAJOS - removido panel flotante */}
      {false && (
        <div className="atajos-panel">
          <div className="atajos-title">⌨️ Atajos de Teclado</div>
          {[
            ['Escribí','Buscar producto'],
            ['↑↓←→','Navegar productos (grilla)'],
            ['Enter','Agregar / siguiente'],
            ['Tab','Cambiar área (productos ↔ carrito)'],
            ['Esc','Volver a Productos'],
            ['C','Buscar cliente (en carrito)'],
            ['+ / −','Cantidad del ítem'],
            ['Del','Eliminar ítem del carrito'],
            ['F9','Cobrar'],
            ['F10','Nueva venta'],
            ['F8','Pausar y abrir nueva'],
            ['1 – 5','Método de pago (en cobro)'],
            ['F5 / F6','Contado/Crédito · FE/CCF'],
            ['T / P / N','Ticket / PDF / Nueva (en ticket)'],
            ['?','Mostrar/ocultar'],
          ].map(([k,d]) => (
            <div key={k} className="atajo-row"><span className="atajo-key">{k}</span><span className="atajo-desc">{d}</span></div>
          ))}
        </div>
      )}
    </div>
  )
}