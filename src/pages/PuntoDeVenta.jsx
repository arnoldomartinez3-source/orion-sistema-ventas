import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import {
  collection, onSnapshot, doc, serverTimestamp,
  runTransaction, getDocs, getDoc, addDoc
} from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'
import { useAuth } from '../AuthContext'

const IVA = 0.13

const TIPOS_DTE = [
  { codigo: 'FE',  nombre: 'Consumidor Final', desc: 'Sin NRC', color: '#00d4aa', icon: '🧾' },
  { codigo: 'CCF', nombre: 'Crédito Fiscal',   desc: 'Con NRC', color: '#4f8cff', icon: '🏢' },
]

const FORMAS_PAGO = [
  { id: 'efectivo',      icon: '💵', label: 'Efectivo',      color: '#00d4aa', key: '1' },
  { id: 'tarjeta',       icon: '💳', label: 'Tarjeta',       color: '#4f8cff', key: '2' },
  { id: 'transferencia', icon: '🏦', label: 'Transferencia', color: '#8b5cf6', key: '3' },
  { id: 'cheque',        icon: '📝', label: 'Cheque',        color: '#f59e0b', key: '4' },
  { id: 'mixto',         icon: '🔀', label: 'Mixto',         color: '#ec4899', key: '5' },
]

// ── IMÁGENES SVG INLINE PARA PRODUCTOS (placeholder hasta configurar Firebase Storage) ──
const PRODUCT_IMAGES = [
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%230e1219'/%3E%3Crect x='15' y='28' width='50' height='36' rx='6' fill='%2300d4aa1a' stroke='%2300d4aa' stroke-width='2'/%3E%3Cpath d='M15 36h50' stroke='%2300d4aa' stroke-width='1.5'/%3E%3Crect x='32' y='28' width='16' height='8' rx='2' fill='%2300d4aa33' stroke='%2300d4aa' stroke-width='1.5'/%3E%3Ccircle cx='40' cy='52' r='5' fill='%2300d4aa44'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%230e1219'/%3E%3Crect x='18' y='20' width='38' height='48' rx='6' fill='%234f8cff1a' stroke='%234f8cff' stroke-width='2'/%3E%3Cline x1='26' y1='35' x2='48' y2='35' stroke='%234f8cff' stroke-width='2' stroke-linecap='round'/%3E%3Cline x1='26' y1='44' x2='44' y2='44' stroke='%234f8cff' stroke-width='1.5' stroke-linecap='round'/%3E%3Cline x1='26' y1='52' x2='40' y2='52' stroke='%234f8cff' stroke-width='1.5' stroke-linecap='round'/%3E%3Ccircle cx='37' cy='26' r='4' fill='%234f8cff44'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%230e1219'/%3E%3Cpath d='M22 34h36l-4 28H26z' fill='%23f59e0b1a' stroke='%23f59e0b' stroke-width='2' stroke-linejoin='round'/%3E%3Cpath d='M31 34c0-8 18-8 18 0' fill='none' stroke='%23f59e0b' stroke-width='2'/%3E%3Cline x1='33' y1='46' x2='33' y2='54' stroke='%23f59e0b' stroke-width='1.5'/%3E%3Cline x1='47' y1='46' x2='47' y2='54' stroke='%23f59e0b' stroke-width='1.5'/%3E%3C/svg%3E"
]

const pvStyles = `
  /* ── LAYOUT 3 COLUMNAS ── */
  .pv-3col {
    display: grid;
    grid-template-columns: 1fr 340px 320px;
    gap: 14px;
    align-items: start;
    height: calc(100vh - 100px);
  }
  @media (max-width: 1400px) { .pv-3col { grid-template-columns: 1fr 300px 290px; } }
  @media (max-width: 1200px) { .pv-3col { grid-template-columns: 1fr 280px 270px; } }

  /* ── MÓVIL: tabs ── */
  @media (max-width: 960px) {
    .pv-3col { grid-template-columns: 1fr; height: auto; gap: 0; }
    .pv-col { display: none; }
    .pv-col.tab-activo { display: flex; flex-direction: column; }
  }

  .pv-col { display: flex; flex-direction: column; height: calc(100vh - 100px); overflow: hidden; }
  @media (max-width: 960px) { .pv-col { height: auto; } }

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
  .pv-tab.active { background: var(--accent); color: #0a0f0d; box-shadow: 0 3px 10px rgba(0,212,170,0.3); }
  .pv-tab-badge { background: var(--danger); color: #fff; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 99px; }
  .pv-tab.active .pv-tab-badge { background: rgba(0,0,0,0.2); color: #0a0f0d; }

  /* PRODUCTOS */
  .prod-search { padding: 10px 12px; border-bottom: 1px solid var(--border); }
  /* GRID PRODUCTOS — 2 columnas, imagen a la derecha */
  .producto-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 10px; overflow-y: auto; flex: 1; }

  .producto-card { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; cursor: pointer; transition: all 0.15s; position: relative; overflow: hidden; display: flex; flex-direction: row; align-items: stretch; min-height: 72px; }
  .producto-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 6px 20px var(--shadow); }
  .producto-card:active { transform: scale(0.97); }
  .producto-card.agotado { opacity: 0.4; cursor: not-allowed; }
  .producto-card.agotado:hover { transform: none; border-color: var(--border); box-shadow: none; }
  .agotado-badge { position: absolute; top: 4px; left: 4px; background: var(--danger); color: #fff; font-size: 8px; font-weight: 800; padding: 1px 5px; border-radius: 4px; z-index: 2; }
  .prod-info { padding: 8px 10px; flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
  .prod-nombre { font-size: 11px; font-weight: 700; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; margin-bottom: 3px; }
  .prod-precio-iva { font-family: var(--mono); font-size: 13px; font-weight: 800; color: var(--accent); }
  .prod-precio-base { font-size: 10px; color: var(--muted); }
  .prod-stock { font-size: 9px; margin-top: 2px; }
  .prod-stock.ok { color: var(--muted); }
  .prod-stock.low { color: var(--accent3); font-weight: 600; }
  .prod-stock.out { color: var(--danger); font-weight: 600; }
  .prod-img { width: 70px; height: 100%; object-fit: cover; flex-shrink: 0; border-left: 1px solid var(--border); }

  /* TABS PAUSA */
  .pausa-bar { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--surface2); overflow-x: auto; flex-shrink: 0; align-items: center; }
  .pausa-tab { display: flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--surface); font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: all 0.15s; color: var(--muted); flex-shrink: 0; }
  .pausa-tab.active { border-color: var(--accent); color: var(--accent); background: rgba(0,212,170,0.06); }
  .pausa-tab:hover:not(.active) { border-color: var(--border2); color: var(--text); }
  .pausa-tab.nueva { border-style: dashed; }
  .pausa-tab.nueva:hover { border-color: var(--accent); color: var(--accent); }
  .pausa-count { background: var(--accent); color: #0a0f0d; font-size: 9px; font-weight: 900; padding: 1px 5px; border-radius: 99px; }
  .pausa-count.rojo { background: var(--danger); color: #fff; }

  /* MODAL TICKET */
  .ticket-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 500; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(6px); }
  .ticket-modal { background: var(--surface); border: 1.5px solid var(--border); border-radius: 20px; padding: 28px; width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 80px var(--shadow); }

  /* CARRITO */
  .carrito-col { background: var(--surface); border: 1.5px solid var(--border); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; flex: 1; }
  .carrito-header { padding: 12px 14px; border-bottom: 1.5px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: var(--surface2); flex-shrink: 0; }
  .carrito-title { font-size: 14px; font-weight: 800; display: flex; align-items: center; gap: 8px; }
  .carrito-count { background: var(--accent); color: #0a0f0d; font-size: 11px; font-weight: 800; padding: 2px 9px; border-radius: 99px; }

  .carrito-cliente { padding: 10px 12px; border-bottom: 1px solid var(--border); position: relative; flex-shrink: 0; }
  .cliente-dropdown { position: absolute; left: 10px; right: 10px; top: 100%; background: var(--surface); border: 1.5px solid var(--accent); border-radius: 10px; z-index: 999; box-shadow: 0 8px 24px var(--shadow); overflow: hidden; max-height: 200px; overflow-y: auto; }
  .cliente-option { padding: 10px 14px; cursor: pointer; transition: background 0.12s; border-bottom: 1px solid var(--border); }
  .cliente-option:last-child { border-bottom: none; }
  .cliente-option:hover { background: var(--glow); }
  .cliente-option-nombre { font-size: 13px; font-weight: 700; }
  .cliente-option-detalle { font-size: 10px; color: var(--muted); margin-top: 1px; }
  .cliente-seleccionado { display: flex; align-items: center; justify-content: space-between; background: var(--glow); border: 1.5px solid var(--accent); border-radius: 8px; padding: 8px 12px; margin-top: 6px; }
  .cliente-sel-nombre { font-size: 13px; font-weight: 700; color: var(--accent); }
  .cliente-sel-detalle { font-size: 10px; color: var(--muted); margin-top: 1px; }

  .carrito-items { flex: 1; overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 8px; }
  .carrito-item { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 12px; transition: all 0.15s; }
  .carrito-item:hover { border-color: var(--accent); }
  .ci-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; margin-bottom: 8px; }
  .ci-nombre { font-size: 12px; font-weight: 700; line-height: 1.3; }
  .ci-precio-iva { font-size: 11px; color: var(--muted); font-family: var(--mono); margin-top: 1px; }
  .ci-bottom-row { display: flex; align-items: center; gap: 6px; }
  .ci-qty { display: flex; align-items: center; gap: 4px; }
  .qty-btn { width: 26px; height: 26px; border-radius: 7px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; font-size: 15px; display: flex; align-items: center; justify-content: center; transition: all 0.1s; font-weight: 700; flex-shrink: 0; }
  .qty-btn:hover { border-color: var(--accent); color: var(--accent); }
  .ci-qty-input { width: 52px; height: 26px; border-radius: 7px; border: 1.5px solid var(--accent); background: var(--glow); color: var(--accent); font-family: var(--mono); font-size: 13px; font-weight: 800; text-align: center; outline: none; }
  .ci-desc-input { width: 52px; height: 26px; border-radius: 7px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); font-family: var(--mono); font-size: 12px; text-align: center; outline: none; }
  .ci-desc-input:focus { border-color: #f59e0b; }
  .ci-total { font-family: var(--mono); font-size: 12px; font-weight: 900; color: var(--accent); flex-shrink: 0; white-space: nowrap; margin-left: auto; }

  /* TOTAL BOX */
  .total-box { padding: 12px 14px; border-top: 2px solid var(--border); background: var(--surface2); flex-shrink: 0; }
  .total-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; color: var(--muted); }
  .total-row.final { font-size: 20px; font-weight: 900; color: var(--text); margin-top: 8px; padding-top: 8px; border-top: 2px solid var(--border); margin-bottom: 0; letter-spacing: -0.5px; }

  /* COBRO COLUMNA */
  .cobro-col { background: var(--surface); border: 1.5px solid var(--border); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; flex: 1; }
  .cobro-header { padding: 12px 14px; border-bottom: 1.5px solid var(--border); background: var(--surface2); flex-shrink: 0; }
  .cobro-title { font-size: 14px; font-weight: 800; }
  .cobro-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }

  /* DTE selector compacto */
  .dte-selector { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .dte-btn { border: 2px solid var(--border); border-radius: 10px; padding: 10px; cursor: pointer; transition: all 0.15s; text-align: center; background: var(--surface2); }
  .dte-btn:hover { transform: translateY(-1px); }
  .dte-btn.selected { border-color: var(--btn-color); background: color-mix(in srgb, var(--btn-color) 8%, var(--surface2)); }
  .dte-code { font-size: 14px; font-weight: 800; font-family: var(--mono); margin-bottom: 2px; }
  .dte-name { font-size: 10px; color: var(--muted); }

  /* Tipo pago compacto */
  .tipopago-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tipopago-btn { border: 2px solid var(--border); border-radius: 10px; padding: 10px; cursor: pointer; transition: all 0.15s; text-align: center; background: var(--surface2); }
  .tipopago-btn.selected-contado { border-color: #00d4aa; background: rgba(0,212,170,0.06); }
  .tipopago-btn.selected-credito { border-color: #f59e0b; background: rgba(245,158,11,0.06); }
  .tipopago-label { font-size: 13px; font-weight: 800; }
  .tipopago-desc { font-size: 10px; color: var(--muted); }

  /* Métodos pago */
  .fpago-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 5px; }
  .fpago-btn { border: 2px solid var(--border); border-radius: 8px; padding: 8px 4px; cursor: pointer; transition: all 0.15s; text-align: center; background: var(--surface2); position: relative; }
  .fpago-btn:hover { transform: translateY(-1px); }
  .fpago-btn.selected { border-color: var(--fp-color); background: color-mix(in srgb, var(--fp-color) 8%, transparent); }
  .fpago-icon { font-size: 16px; margin-bottom: 3px; }
  .fpago-label { font-size: 9px; font-weight: 800; }
  .fpago-atajo { position: absolute; top: 3px; right: 4px; font-size: 8px; font-weight: 700; color: var(--muted); font-family: var(--mono); }

  /* Calculadora cambio */
  .cambio-box { background: rgba(0,212,170,0.05); border: 1.5px solid rgba(0,212,170,0.2); border-radius: 10px; padding: 10px; }
  .cambio-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 12px; }
  .cambio-total-lbl { font-size: 18px; font-weight: 900; color: var(--accent); font-family: var(--mono); }
  .cambio-vuelto { font-size: 16px; font-weight: 900; font-family: var(--mono); }
  .cambio-vuelto.ok { color: #00d4aa; }
  .cambio-vuelto.falta { color: #ef4444; }
  .cambio-input { font-size: 16px; font-weight: 800; font-family: var(--mono); width: 100px; text-align: right; padding: 6px 10px; }
  .cambio-bills { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
  .cambio-bill { padding: 4px 8px; border-radius: 6px; border: 1.5px solid var(--border); font-size: 10px; font-weight: 700; cursor: pointer; font-family: var(--mono); background: var(--surface); transition: all 0.1s; }
  .cambio-bill:hover { border-color: var(--accent); color: var(--accent); }

  .ref-box { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 10px; }
  .cobro-label { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }

  /* BOTÓN COBRAR */
  .btn-cobrar { width: 100%; padding: 14px; font-size: 15px; font-weight: 800; letter-spacing: -0.3px; border-radius: 12px; border: none; cursor: pointer; background: linear-gradient(135deg, var(--accent), var(--accent-dark)); color: #0a0f0d; transition: all 0.18s; box-shadow: 0 4px 20px rgba(0,212,170,0.35); display: flex; align-items: center; justify-content: center; gap: 8px; font-family: var(--font); flex-shrink: 0; margin: 12px; }
  .btn-cobrar:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,212,170,0.45); }
  .btn-cobrar:active { transform: scale(0.98); }
  .btn-cobrar:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: none; }

  /* MODAL CONFIRMACIÓN */
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
  .atajos-toggle { position: fixed; bottom: 20px; right: 20px; background: var(--surface); border: 1.5px solid var(--border); border-radius: 99px; padding: 7px 12px; font-size: 11px; font-weight: 700; cursor: pointer; z-index: 200; color: var(--muted); display: flex; align-items: center; gap: 5px; box-shadow: 0 4px 16px var(--shadow2); transition: all 0.15s; }
  .atajos-toggle:hover { border-color: var(--accent); color: var(--accent); }
  .atajos-panel { position: fixed; bottom: 58px; right: 20px; background: var(--surface); border: 1.5px solid var(--border); border-radius: 14px; padding: 12px 16px; z-index: 200; box-shadow: 0 8px 30px var(--shadow); min-width: 210px; }
  .atajos-title { font-size: 10px; font-weight: 700; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px; }
  .atajo-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; gap: 14px; }
  .atajo-key { display: inline-flex; align-items: center; justify-content: center; background: var(--surface2); border: 1.5px solid var(--border2); border-radius: 5px; font-family: var(--mono); font-size: 10px; font-weight: 800; padding: 2px 7px; color: var(--text2); min-width: 28px; }
  .atajo-desc { color: var(--muted); font-size: 10px; }
`

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

export default function PuntoDeVenta() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { puede, userName, userId } = usePermisos()

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
  const [mostrarDropdown, setMostrarDropdown] = useState(false)
  const [efectivoRecibido, setEfectivoRecibido] = useState('')
  const [refCheque, setRefCheque]         = useState('')
  const [bancoCheque, setBancoCheque]     = useState('')
  const [refTransferencia, setRefTransferencia] = useState('')
  const [bancoTransferencia, setBancoTransferencia] = useState('')

  // ── UI ──
  const [tabMovil, setTabMovil]           = useState('productos')
  const [innerTab, setInnerTab]           = useState('productos')
  const [modalUnidad, setModalUnidad]     = useState(null)
  const [modalConfirm, setModalConfirm]   = useState(false)
  const [procesando, setProcesando]       = useState(false)
  const [ventaFinalizada, setVentaFinalizada] = useState(null)
  const [mostrarAtajos, setMostrarAtajos] = useState(false)
  const [mostrarTicket, setMostrarTicket] = useState(false)

  // ── VENTAS EN PAUSA: persisten en sessionStorage al navegar ──
  const [ventaActual, setVentaActual]     = useState(() => {
    try { return parseInt(sessionStorage.getItem('orion_venta_actual') || '0') } catch { return 0 }
  })
  const [ventasPausa, setVentasPausa]     = useState(() => {
    try {
      const saved = sessionStorage.getItem('orion_ventas_pausa')
      if (saved) return JSON.parse(saved)
    } catch {}
    return [{ id: 0, carrito: [], clienteNombre: '', clienteSeleccionado: null, busquedaCliente: '', nit: '', nrc: '', tipoDte: 'FE', tipoPago: 'contado', formaPago: 'efectivo', fechaVencimiento: '' }]
  })

  const busquedaRef = useRef(null)
  const efectivoRef = useRef(null)

  // ── VENTAS EN PAUSA: helpers ──
  const ventaData = ventasPausa[ventaActual] || ventasPausa[0]
  const carrito = ventaData.carrito
  const clienteNombre = ventaData.clienteNombre
  const clienteSeleccionado = ventaData.clienteSeleccionado
  const busquedaCliente = ventaData.busquedaCliente
  const nit = ventaData.nit
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
  const setNrc = (v) => actualizarVenta('nrc', v)
  const setTipoDte = (v) => actualizarVenta('tipoDte', v)
  const setTipoPago = (v) => actualizarVenta('tipoPago', v)
  const setFormaPago = (v) => actualizarVenta('formaPago', v)
  const setFechaVencimiento = (v) => actualizarVenta('fechaVencimiento', v)

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
    getDoc(doc(db, 'configuracion', user.uid)).then(snap => {
      if (snap.exists()) {
        setRequerirCaja(snap.data().requerirCaja || false)
        setEmpresa(snap.data())
      }
    })
    const unsubCaja = onSnapshot(collection(db, 'cajas'), snap => {
      const cajas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const miCaja = cajas.find(c => c.estado === 'abierta' && (c.cajeroId === user?.uid || c.cajeroNombre === userName))
      setCajaAbierta(miCaja || null)
    })
    return () => unsubCaja()
  }, [user, userName])

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'productos'), snap => {
      setProductos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoadingProds(false)
    })
    const u2 = onSnapshot(collection(db, 'clientes'), snap => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    const u3 = onSnapshot(collection(db, 'ventas'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setVentas(data)
    })
    return () => { u1(); u2(); u3() }
  }, [])

  // ── CÁLCULOS ──
  const precioConIva = (p) => parseFloat(((p || 0) * (1 + IVA)).toFixed(2))
  const fmt = (n) => `$${(n || 0).toFixed(2)}`
  const subtotal = carrito.reduce((s, c) => s + c.precio * c.qty, 0)
  const ivaTotal = subtotal * IVA
  const total    = subtotal + ivaTotal
  const vuelto   = parseFloat(efectivoRecibido || 0) - total
  const tipoInfo = TIPOS_DTE.find(t => t.codigo === tipoDte)
  const filtrados = productos.filter(p =>
    p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(busqueda.toLowerCase())
  )

  // ── AGREGAR PRODUCTO ──
  const agregar = (producto, unidadSeleccionada = null) => {
    if (producto.stock <= 0) return
    if (!unidadSeleccionada && (producto.unidadesAdicionales || []).length > 0) {
      setModalUnidad(producto); return
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
      if (existe.qty >= producto.stock) return
      setCarrito(carrito.map(c => c.carritoId === carritoId ? { ...c, qty: c.qty + 1 } : c))
    } else {
      setCarrito([...carrito, { ...producto, carritoId, precio: precioFinal, unidad: unidadFinal, factorUnidad, qty: 1 }])
    }
    setTabMovil('carrito')
  }

  const cambiarQty = (carritoId, delta) => {
    const item = carrito.find(c => c.carritoId === carritoId)
    const prod = item ? productos.find(p => p.id === item.id) : null
    setCarrito(carrito.map(c => {
      if (c.carritoId !== carritoId) return c
      const newQty = c.qty + delta
      if (newQty > (prod?.stock || 999)) return c
      return { ...c, qty: newQty }
    }).filter(c => c.qty > 0))
  }

  const pausarYNuevaVenta = () => {
    if (ventasPausa.length >= 5) { alert('Máximo 5 ventas simultáneas'); return }
    const nuevaId = Date.now()
    setVentasPausa(prev => [...prev, { id: nuevaId, carrito: [], clienteNombre: '', clienteSeleccionado: null, busquedaCliente: '', nit: '', nrc: '', tipoDte: 'FE', tipoPago: 'contado', formaPago: 'efectivo', fechaVencimiento: '' }])
    setVentaActual(ventasPausa.length)
    setTabMovil('productos')
  }

  const cambiarVenta = (idx) => {
    setVentaActual(idx)
    setTabMovil('productos')
    setEfectivoRecibido('')
  }

  const cerrarVentaPausa = (idx) => {
    if (ventasPausa.length === 1) return // siempre debe haber al menos una
    setVentasPausa(prev => prev.filter((_, i) => i !== idx))
    setVentaActual(Math.max(0, ventaActual - 1))
  }

  // ── RESET ──
  const nuevaVenta = () => {
    setVentaFinalizada(null); setMostrarTicket(false)
    // Reemplazar venta actual con una vacía
    setVentasPausa(prev => prev.map((v, i) => i === ventaActual ? { ...v, carrito: [], clienteNombre: '', clienteSeleccionado: null, busquedaCliente: '', nit: '', nrc: '', tipoDte: 'FE', tipoPago: 'contado', formaPago: 'efectivo', fechaVencimiento: '' } : v))
    setEfectivoRecibido('')
    setRefCheque(''); setBancoCheque(''); setRefTransferencia(''); setBancoTransferencia('')
    setBusqueda(''); setTabMovil('productos'); setInnerTab('productos')
  }

  // ── PROCESAR VENTA ──
  const procesarVenta = async () => {
    if (procesando) return
    if (carrito.length === 0)      { alert('El carrito está vacío'); return }
    if (carrito.length > 100)      { alert('Máximo 100 items por venta'); return }
    if (tipoDte === 'CCF' && !nrc) { alert('El CCF requiere el NRC del cliente'); return }
    if (tipoPago === 'credito' && !fechaVencimiento) { alert('Indica la fecha de vencimiento'); return }
    if (tipoPago === 'credito' && fechaVencimiento <= new Date().toISOString().slice(0, 10)) { alert('La fecha de vencimiento debe ser posterior a hoy'); return }
    if (total <= 0 || total > 999999) { alert('Total fuera de rango'); return }
    for (const item of carrito) {
      if (item.qty <= 0 || item.qty > 99999) { alert(`Cantidad inválida en "${item.nombre}"`); return }
      if (item.precio < 0) { alert(`Precio inválido en "${item.nombre}"`); return }
    }

    setProcesando(true)
    try {
      const facturasSnap = await getDocs(collection(db, 'facturas'))
      const numeroDte = `${tipoDte}-${String(facturasSnap.size + 1).padStart(6, '0')}`
      const estadoPago = tipoPago === 'contado' ? 'pagada' : 'pendiente'
      const fmtPago = tipoPago === 'contado' ? formaPago : 'credito'
      await runTransaction(db, async (tx) => {
        const snaps = []
        for (const item of carrito) {
          const ref = doc(db, 'productos', item.id)
          const snap = await tx.get(ref)
          if (!snap.exists()) throw new Error(`Producto "${item.nombre}" no encontrado`)
          const stock = snap.data().stock
          if (stock < item.qty) throw new Error(`Stock insuficiente para "${item.nombre}". Disponible: ${stock}`)
          snaps.push({ ref, nuevoStock: stock - item.qty })
        }
        const ventaRef = doc(collection(db, 'ventas'))
        tx.set(ventaRef, {
          cliente: clienteNombre || 'Consumidor Final', tipoDte, numeroDte, tipoPago,
          cajero: userName || '', cajeroId: userId || '',
          formaPago: fmtPago,
          refPago: formaPago === 'cheque' ? refCheque : formaPago === 'transferencia' ? refTransferencia : '',
          bancoPago: formaPago === 'cheque' ? bancoCheque : formaPago === 'transferencia' ? bancoTransferencia : '',
          items: carrito.map(c => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, precioBase: c.precio, precioConIva: precioConIva(c.precio), qty: c.qty, subtotal: c.precio * c.qty })),
          subtotal, iva: ivaTotal, total, estado: 'completada', createdAt: serverTimestamp()
        })
        const facturaRef = doc(collection(db, 'facturas'))
        tx.set(facturaRef, {
          tipoDte, numero: numeroDte, cliente: clienteNombre || 'Consumidor Final',
          formaPago: fmtPago, nit: nit || '', nrc: nrc || '',
          descripcion: `Venta de ${carrito.length} producto(s)`,
          items: carrito.map(c => ({ nombre: c.nombre, qty: c.qty, precioBase: c.precio, subtotal: c.precio * c.qty })),
          subtotal, iva: ivaTotal, total, estadoPago,
          fechaEmision: new Date().toISOString().slice(0, 10),
          fechaVencimiento: tipoPago === 'credito' ? fechaVencimiento : '',
          tipoPago, notas: tipoPago === 'credito' ? `Crédito — vence ${fechaVencimiento}` : '',
          origenVenta: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        })
        for (const { ref, nuevoStock } of snaps) tx.update(ref, { stock: nuevoStock })
      })
      setVentaFinalizada({ carrito: [...carrito], cliente: clienteNombre || 'Consumidor Final', tipoDte, numeroDte, tipoPago, formaPago, fechaVencimiento, subtotal, ivaTotal, total, nit, nrc })
      setMostrarTicket(true)
      setModalConfirm(false)
    } catch (e) {
      alert('❌ Error: ' + e.message)
    }
    setProcesando(false)
  }

  const formatFecha = (ts) => {
    if (!ts) return '—'
    const d = new Date(ts.seconds * 1000)
    return d.toLocaleDateString('es-SV') + ' ' + d.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })
  }

  // ── IMPRESIÓN ──
  const generarTicketTermico = (v) => {
    const emp = empresa
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:"Courier New",monospace;width:72mm;font-size:13px;color:#000;padding:3mm;}.c{text-align:center;}.b{font-weight:bold;}.sep{border-top:1px dashed #000;margin:5px 0;}.row{display:flex;justify-content:space-between;margin:2px 0;font-size:12px;}.emp{font-size:15px;font-weight:900;text-align:center;}.dte{border:1px solid #000;text-align:center;padding:3px;margin:4px 0;font-weight:700;}.total{font-size:18px;font-weight:900;text-align:center;margin:6px 0;}.pie{font-size:11px;text-align:center;color:#555;}@media print{@page{margin:2mm;size:80mm auto;}}</style></head><body>
    <div class="emp">${emp.empresaNombre || 'ORIÓN'}</div>
    ${emp.direccion ? `<div class="c" style="font-size:11px">${emp.direccion}</div>` : ''}
    <div class="c" style="font-size:11px">NIT:${emp.nit||'---'} NRC:${emp.nrc||'---'}</div>
    <div class="sep"></div>
    <div class="dte">${TIPOS_DTE.find(t=>t.codigo===v.tipoDte)?.nombre||v.tipoDte}</div>
    <div class="dte">${v.numeroDte}</div>
    <div class="sep"></div>
    <div class="row"><span>Fecha:</span><span>${new Date().toLocaleDateString('es-SV')}</span></div>
    <div class="row"><span>Cliente:</span><span>${v.cliente}</span></div>
    ${v.nit ? `<div class="row"><span>NIT:</span><span>${v.nit}</span></div>` : ''}
    <div class="sep"></div>
    ${v.carrito.map(c => `<div class="row"><span>${c.qty}x ${c.nombre}</span><span>$${(precioConIva(c.precio)*c.qty).toFixed(2)}</span></div>`).join('')}
    <div class="sep"></div>
    <div class="row"><span>Subtotal:</span><span>$${v.subtotal.toFixed(2)}</span></div>
    <div class="row"><span>IVA 13%:</span><span>$${v.ivaTotal.toFixed(2)}</span></div>
    <div class="sep"></div>
    <div class="total">TOTAL: $${v.total.toFixed(2)}</div>
    <div class="row"><span>Pago:</span><span>${v.formaPago||v.tipoPago}</span></div>
    ${v.tipoPago==='efectivo'&&v.efectivoRecibido ? `<div class="row"><span>Recibido:</span><span>$${parseFloat(v.efectivoRecibido).toFixed(2)}</span></div><div class="row"><span>Vuelto:</span><span>$${(parseFloat(v.efectivoRecibido)-v.total).toFixed(2)}</span></div>` : ''}
    <div class="sep"></div>
    <div class="pie">¡Gracias por su compra!</div>
    <div class="pie">${emp.empresaNombre||'ORIÓN'} · ONE GEO SYSTEMS</div>
    <div style="margin-top:8mm"></div>
    </body></html>`
  }

  const generarPDFCompleto = (v) => {
    const emp = empresa
    const tipoI = TIPOS_DTE.find(t => t.codigo === v.tipoDte)
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${v.tipoDte} ${v.numeroDte}</title><style>
    *{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;font-size:13px;}
    .page{max-width:700px;margin:0 auto;padding:36px;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:18px;border-bottom:3px solid #1B2E6B;}
    .emp h1{font-size:20px;font-weight:900;color:#1B2E6B;}.emp p{font-size:11px;color:#6b7280;margin-top:2px;}
    .doc{text-align:right;}.doc-tipo{font-size:10px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;}
    .doc-num{font-size:22px;font-weight:900;color:#1B2E6B;}
    .info-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px;}
    .box{background:#f8faff;border-radius:10px;padding:14px;border:1px solid #e5eaf5;}
    .box h3{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:6px;font-weight:700;}
    table{width:100%;border-collapse:collapse;margin-bottom:18px;}
    thead{background:#1B2E6B;color:#fff;}th{padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;font-weight:700;}
    th:last-child,td:last-child{text-align:right;}td{padding:10px 14px;border-bottom:1px solid #f0f4ff;font-size:13px;}
    tr:last-child td{border-bottom:none;}tr:nth-child(even) td{background:#fafbff;}
    .tots{display:flex;justify-content:flex-end;margin-bottom:20px;}.tots-box{min-width:220px;}
    .trow{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f4ff;font-size:13px;color:#6b7280;}
    .trow.fin{border-bottom:none;padding:10px 0 0;font-size:18px;font-weight:900;color:#1B2E6B;}
    .firmas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:24px 0 16px;}
    .firma{border-top:1.5px solid #1B2E6B;padding-top:6px;margin-top:36px;font-size:11px;color:#6b7280;text-align:center;}
    .footer{text-align:center;padding-top:12px;border-top:1px solid #e5eaf5;font-size:11px;color:#9ca3af;}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{margin:15mm;}}
    </style></head><body><div class="page">
    <div class="header">
      <div class="emp">
        <h1>${emp.empresaNombre||'Mi Empresa'}</h1>
        <p>${emp.direccion||''}</p>
        <p>NIT: ${emp.nit||'---'} | NRC: ${emp.nrc||'---'}</p>
        ${emp.telefono ? `<p>Tel: ${emp.telefono}</p>` : ''}
      </div>
      <div class="doc">
        <div class="doc-tipo">${tipoI?.nombre||v.tipoDte}</div>
        <div class="doc-num">${v.numeroDte}</div>
        <p style="font-size:11px;color:#9ca3af;margin-top:6px">Emisión: ${new Date().toLocaleDateString('es-SV')}</p>
      </div>
    </div>
    <div class="info-row">
      <div class="box"><h3>Cliente</h3><p style="font-weight:700;font-size:15px;color:#1B2E6B">${v.cliente}</p>${v.nit?`<p>NIT: <strong>${v.nit}</strong></p>`:''} ${v.nrc?`<p>NRC: <strong>${v.nrc}</strong></p>`:''}</div>
      <div class="box"><h3>Pago</h3><p><strong>${v.tipoPago==='contado'?'Contado':'Crédito'}</strong></p><p>Método: ${v.formaPago||'—'}</p>${v.tipoPago==='credito'?`<p>Vence: ${v.fechaVencimiento}</p>`:''}</div>
    </div>
    <table><thead><tr><th>#</th><th>Producto</th><th>Cant.</th><th>P. Unit.</th><th>Total</th></tr></thead>
    <tbody>${v.carrito.map((c,i)=>`<tr><td style="color:#9ca3af">${i+1}</td><td style="font-weight:600">${c.nombre}</td><td>${c.qty}</td><td>$${precioConIva(c.precio).toFixed(2)}</td><td>$${(precioConIva(c.precio)*c.qty).toFixed(2)}</td></tr>`).join('')}</tbody></table>
    <div class="tots"><div class="tots-box">
      <div class="trow"><span>Subtotal (sin IVA)</span><span>$${v.subtotal.toFixed(2)}</span></div>
      <div class="trow"><span>IVA 13%</span><span>$${v.ivaTotal.toFixed(2)}</span></div>
      <div class="trow fin"><span>TOTAL</span><span>$${v.total.toFixed(2)}</span></div>
    </div></div>
    <div class="firmas"><div class="firma">Firma / ${v.cliente}</div><div class="firma">Autorizado / ${emp.empresaNombre||''}</div></div>
    <div class="footer"><p>Documento generado electrónicamente · ORIÓN · ONE GEO SYSTEMS</p></div>
    </div></body></html>`
  }

  // ── ATAJOS DE TECLADO ──
  useEffect(() => {
    const handler = (e) => {
      const enInput = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)
      if (e.key === 'F1') { e.preventDefault(); busquedaRef.current?.focus() }
      if (e.key === 'F3') { e.preventDefault(); if (carrito.length > 0) setModalConfirm(true) }
      if (e.key === 'F4') { e.preventDefault(); nuevaVenta() }
      if (e.key === 'Escape') { setModalConfirm(false); setModalUnidad(null) }
      if (e.key === '?' && !enInput) { e.preventDefault(); setMostrarAtajos(v => !v) }
      if (!enInput) {
        if (e.key === '+' || e.key === '=') setCarrito(c => { if (!c.length) return c; const last = c[c.length-1]; return c.map(i => i.carritoId === last.carritoId ? {...i, qty: i.qty+1} : i) })
        if (e.key === '-') setCarrito(c => { if (!c.length) return c; const last = c[c.length-1]; return c.map(i => i.carritoId === last.carritoId ? {...i, qty: Math.max(1,i.qty-1)} : i) })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [carrito])

  useEffect(() => {
    const FORMAS = ['efectivo','tarjeta','transferencia','cheque','mixto']
    const handler = (e) => {
      const enInput = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)
      if (enInput) return
      // Teclas 1-5 siempre disponibles cuando tipoPago es contado (en columna cobro o modal)
      if (e.key >= '1' && e.key <= '5' && tipoPago === 'contado') {
        const f = FORMAS[parseInt(e.key)-1]
        setFormaPago(f)
        if (f === 'efectivo' || f === 'mixto') setTimeout(() => efectivoRef.current?.focus(), 50)
      }
      if (e.key === 'Enter' && modalConfirm && !procesando) procesarVenta()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modalConfirm, tipoPago, procesando, ventaActual])

  // ── TICKET: ahora es modal, no pantalla separada ──

  // ── RENDER PRINCIPAL ──
  return (
    <>
      <style>{pvStyles}</style>

      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">🛒 Punto de Venta</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {ventas.length} ventas hoy
            <span className="firebase-badge">🔥 Firebase</span>
          </div>
        </div>
      </div>

      {/* ── BARRA DE VENTAS EN PAUSA ── */}
      <div className="pausa-bar">
        {ventasPausa.map((v, idx) => (
          <div key={v.id} className={`pausa-tab ${ventaActual === idx ? 'active' : ''}`} onClick={() => cambiarVenta(idx)}>
            <span>Venta {idx + 1}</span>
            {v.carrito.length > 0 && <span className={`pausa-count ${ventaActual !== idx ? 'rojo' : ''}`}>{v.carrito.length}</span>}
            {ventasPausa.length > 1 && ventaActual !== idx && (
              <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2, cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); cerrarVentaPausa(idx) }}>✕</span>
            )}
          </div>
        ))}
        {ventasPausa.length < 5 && (
          <div className="pausa-tab nueva" onClick={pausarYNuevaVenta}>
            ⏸ + Pausar y nueva
          </div>
        )}
      </div>

      {/* TABS MÓVIL */}
      <div className="pv-tabs">
        {[
          { key: 'productos', label: '📦 Productos' },
          { key: 'carrito',   label: `🛒 Carrito`, badge: carrito.length },
          { key: 'cobro',     label: '💳 Cobrar' },
        ].map(t => (
          <button key={t.key} className={`pv-tab ${tabMovil === t.key ? 'active' : ''}`} onClick={() => setTabMovil(t.key)}>
            {t.label}
            {t.badge > 0 && <span className="pv-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="pv-3col">

        {/* ── COL 1: PRODUCTOS ── */}
        <div className={`pv-col ${tabMovil === 'productos' ? 'tab-activo' : ''}`}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
              <button className={`inner-tab ${innerTab === 'productos' ? 'active' : ''}`} onClick={() => setInnerTab('productos')} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'var(--font)', background: innerTab === 'productos' ? 'rgba(0,212,170,0.12)' : 'none', color: innerTab === 'productos' ? 'var(--accent)' : 'var(--muted)' }}>📦 Productos</button>
              <button className={`inner-tab ${innerTab === 'historial' ? 'active' : ''}`} onClick={() => setInnerTab('historial')} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'var(--font)', background: innerTab === 'historial' ? 'rgba(0,212,170,0.12)' : 'none', color: innerTab === 'historial' ? 'var(--accent)' : 'var(--muted)' }}>📋 Historial ({ventas.length})</button>
            </div>

            {innerTab === 'productos' && (
              <>
                <div className="prod-search">
                  <input ref={busquedaRef} className="input" placeholder="🔍 Buscar producto... (F1)" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                </div>
                {loadingProds ? (
                  <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">Cargando productos...</div></div>
                ) : filtrados.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon">📦</div><div className="empty-text">No se encontraron productos</div></div>
                ) : (
                  <div className="producto-grid">
                    {filtrados.map((p, idx) => {
                      const agotado = p.stock <= 0
                      const bajo = p.stock > 0 && p.stock < (p.min || 0)
                      const img = p.imagen || PRODUCT_IMAGES[idx % 3]
                      return (
                        <div key={p.id} className={`producto-card ${agotado ? 'agotado' : ''}`} onClick={() => agregar(p)}>
                          {agotado && <span className="agotado-badge">AGOTADO</span>}
                          <div className="prod-info">
                            <div className="prod-nombre" title={p.nombre}>{p.nombre}</div>
                            <div className="prod-precio-base">Sin IVA: ${p.precio?.toFixed(2)}</div>
                            <div className="prod-precio-iva">${precioConIva(p.precio).toFixed(2)}</div>
                            <div className={`prod-stock ${agotado ? 'out' : bajo ? 'low' : 'ok'}`}>📦 {p.stock} {p.unidad}</div>
                          </div>
                          <img src={img} alt={p.nombre} className="prod-img" draggable={false} onError={e => e.target.style.display='none'} />
                        </div>
                      )
                    })}
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

        {/* ── COL 2: CARRITO ── */}
        <div className={`pv-col ${tabMovil === 'carrito' ? 'tab-activo' : ''}`}>
          <div className="carrito-col">
            <div className="carrito-header">
              <div className="carrito-title">🛒 Carrito <span className="carrito-count">{carrito.length}</span></div>
              {carrito.length > 0 && puede('cancelar_ventas') && (
                <button className="btn btn-danger btn-sm" onClick={() => setCarrito([])}>🗑️</button>
              )}
            </div>

            <div className="carrito-cliente">
              {clienteSeleccionado ? (
                <div className="cliente-seleccionado">
                  <div>
                    <div className="cliente-sel-nombre">👤 {clienteSeleccionado.nombre}</div>
                    <div className="cliente-sel-detalle">{clienteSeleccionado.nit && `NIT: ${clienteSeleccionado.nit}`}{clienteSeleccionado.nit && clienteSeleccionado.nrc && ' · '}{clienteSeleccionado.nrc && `NRC: ${clienteSeleccionado.nrc}`}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => { setClienteSeleccionado(null); setClienteNombre(''); setBusquedaCliente(''); setNit(''); setNrc('') }}>✕</button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input className="input" placeholder="👤 Buscar cliente..." value={busquedaCliente}
                    onChange={e => { setBusquedaCliente(e.target.value); setClienteNombre(e.target.value); setMostrarDropdown(true) }}
                    onFocus={() => setMostrarDropdown(true)}
                    onBlur={() => setTimeout(() => setMostrarDropdown(false), 200)}
                  />
                  {mostrarDropdown && busquedaCliente.length > 0 && (
                    <div className="cliente-dropdown">
                      {clientes.filter(c => c.nombre?.toLowerCase().includes(busquedaCliente.toLowerCase()) || c.nit?.includes(busquedaCliente)).slice(0, 6).map(c => (
                        <div key={c.id} className="cliente-option" onMouseDown={() => { setClienteSeleccionado(c); setClienteNombre(c.nombre); setNit(c.nit||''); setNrc(c.nrc||''); setBusquedaCliente(c.nombre); setMostrarDropdown(false) }}>
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
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: 40, opacity: 0.2, marginBottom: 10 }}>🛒</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Agrega productos</div>
                </div>
              ) : carrito.map(c => (
                <div key={c.carritoId} className="carrito-item">
                  <div className="ci-top">
                    <div>
                      <div className="ci-nombre">{c.nombre} {c.unidad && <span style={{ fontSize: 9, color: 'var(--accent2)', fontWeight: 700, background: 'rgba(74,143,232,0.1)', padding: '1px 5px', borderRadius: 3 }}>{c.unidad}</span>}</div>
                      <div className="ci-precio-iva">${precioConIva(c.precio).toFixed(2)} c/IVA</div>
                    </div>
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
                    <div className="ci-qty">
                      <button className="qty-btn" onClick={() => cambiarQty(c.carritoId, -1)}>−</button>
                      <input className="ci-qty-input" type="number" min="1" value={c.qty}
                        onChange={e => {
                          const val = Math.max(1, parseInt(e.target.value) || 1)
                          const prod = productos.find(p => p.id === c.id)
                          setCarrito(cart => cart.map(item => item.carritoId === c.carritoId ? { ...item, qty: Math.min(val, prod?.stock || 9999) } : item))
                        }}
                      />
                      <button className="qty-btn" onClick={() => cambiarQty(c.carritoId, 1)}>+</button>
                    </div>
                    <button className="qty-btn" style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)', fontSize: 12 }}
                      onClick={() => setCarrito(cart => cart.filter(item => item.carritoId !== c.carritoId))}>✕</button>
                    <div className="ci-total">{fmt(precioConIva(c.precio) * c.qty)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="total-box">
              <div className="total-row"><span>Subtotal (sin IVA)</span><span className="amount">{fmt(subtotal)}</span></div>
              <div className="total-row"><span>IVA (13%)</span><span className="amount">{fmt(ivaTotal)}</span></div>
              <div className="total-row final"><span>TOTAL</span><span className="amount" style={{ color: 'var(--accent)' }}>{fmt(total)}</span></div>
            </div>
          </div>
        </div>

        {/* ── COL 3: COBRO ── */}
        <div className={`pv-col ${tabMovil === 'cobro' ? 'tab-activo' : ''}`}>
          <div className="cobro-col">
            <div className="cobro-header">
              <div className="cobro-title">🧾 Configurar DTE</div>
            </div>
            <div className="cobro-body">

              {/* Tipo DTE */}
              <div>
                <div className="cobro-label">Tipo de Documento</div>
                <div className="dte-selector">
                  {TIPOS_DTE.map(t => (
                    <div key={t.codigo} className={`dte-btn ${tipoDte === t.codigo ? 'selected' : ''}`}
                      style={{ '--btn-color': t.color }}
                      onClick={() => setTipoDte(t.codigo)}>
                      <div className="dte-code" style={{ color: tipoDte === t.codigo ? t.color : 'var(--text)' }}>{t.icon} {t.codigo}</div>
                      <div className="dte-name">{t.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Datos cliente FE (opcionales) */}
              {tipoDte === 'FE' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="cobro-label">Datos del Cliente FE <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcionales)</span></div>
                  <input className="input" placeholder="Nombre del cliente" value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} style={{ fontSize: 12, padding: '7px 10px' }} />
                  <input className="input" placeholder="DUI (00000000-0)" value={nit} onChange={e => setNit(e.target.value)} style={{ fontSize: 12, padding: '7px 10px' }} />
                  <input className="input" placeholder="Dirección" value={ventaData.direccionFe || ''} onChange={e => actualizarVenta('direccionFe', e.target.value)} style={{ fontSize: 12, padding: '7px 10px' }} />
                  <input className="input" placeholder="Teléfono" value={ventaData.telefonoFe || ''} onChange={e => actualizarVenta('telefonoFe', e.target.value)} style={{ fontSize: 12, padding: '7px 10px' }} />
                </div>
              )}

              {/* Datos fiscales para CCF */}
              {tipoDte === 'CCF' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="cobro-label">Datos Fiscales CCF</div>
                  <input className="input" placeholder="NIT del cliente" value={nit} onChange={e => setNit(e.target.value)} style={{ fontSize: 13, padding: '8px 12px' }} />
                  <input className="input" placeholder="NRC del cliente *" value={nrc} onChange={e => setNrc(e.target.value)} style={{ fontSize: 13, padding: '8px 12px' }} />
                </div>
              )}

              {/* Contado / Crédito */}
              <div>
                <div className="cobro-label">Forma de Pago</div>
                <div className="tipopago-row">
                  <div className={`tipopago-btn ${tipoPago === 'contado' ? 'selected-contado' : ''}`} onClick={() => setTipoPago('contado')}>
                    <div className="tipopago-label" style={{ color: tipoPago === 'contado' ? '#00d4aa' : 'var(--text)' }}>💵 Contado</div>
                    <div className="tipopago-desc">Paga ahora</div>
                  </div>
                  <div className={`tipopago-btn ${tipoPago === 'credito' ? 'selected-credito' : ''}`} onClick={() => setTipoPago('credito')}>
                    <div className="tipopago-label" style={{ color: tipoPago === 'credito' ? '#f59e0b' : 'var(--text)' }}>📅 Crédito</div>
                    <div className="tipopago-desc">Paga después</div>
                  </div>
                </div>
              </div>

              {/* Fecha vencimiento crédito */}
              {tipoPago === 'credito' && (
                <div>
                  <div className="cobro-label">Fecha de Vencimiento *</div>
                  <input className="input" type="date" value={fechaVencimiento} min={new Date().toISOString().slice(0, 10)} onChange={e => setFechaVencimiento(e.target.value)} style={{ fontSize: 13, padding: '8px 12px' }} />
                </div>
              )}

              {/* Métodos de pago contado */}
              {tipoPago === 'contado' && (
                <div>
                  <div className="cobro-label">Método de Cobro (teclas 1–5)</div>
                  <div className="fpago-grid">
                    {FORMAS_PAGO.map(f => (
                      <div key={f.id} className={`fpago-btn ${formaPago === f.id ? 'selected' : ''}`}
                        style={{ '--fp-color': f.color }}
                        onClick={() => { setFormaPago(f.id); if (f.id !== 'efectivo' && f.id !== 'mixto') setEfectivoRecibido('') }}>
                        <span className="fpago-atajo">{f.key}</span>
                        <div className="fpago-icon">{f.icon}</div>
                        <div className="fpago-label" style={{ color: formaPago === f.id ? f.color : 'var(--text)' }}>{f.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Calculadora */}
                  {(formaPago === 'efectivo' || formaPago === 'mixto') && (
                    <div className="cambio-box" style={{ marginTop: 8 }}>
                      <div className="cambio-row">
                        <span style={{ fontWeight: 700 }}>Total</span>
                        <span className="cambio-total-lbl">{fmt(total)}</span>
                      </div>
                      <div className="cambio-row">
                        <span style={{ fontWeight: 700 }}>Recibido</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>$</span>
                          <input ref={efectivoRef} className="input cambio-input" type="number" step="0.01" min="0" placeholder="0.00" value={efectivoRecibido} onChange={e => setEfectivoRecibido(e.target.value)} />
                        </div>
                      </div>
                      <div className="cambio-bills">
                        {[1,5,10,20,50,100].map(b => <button key={b} className="cambio-bill" onClick={() => setEfectivoRecibido(String(b))}>${b}</button>)}
                        <button className="cambio-bill" style={{ borderColor: 'rgba(0,212,170,0.4)', color: 'var(--accent)' }} onClick={() => setEfectivoRecibido(total.toFixed(2))}>Exacto</button>
                      </div>
                      {efectivoRecibido && (
                        <div className="cambio-row" style={{ marginTop: 8, paddingTop: 8, borderTop: '1.5px solid var(--border)', marginBottom: 0 }}>
                          <span style={{ fontWeight: 800, fontSize: 13 }}>Vuelto</span>
                          <span className={`cambio-vuelto ${vuelto >= 0 ? 'ok' : 'falta'}`}>{vuelto >= 0 ? fmt(vuelto) : `Faltan ${fmt(Math.abs(vuelto))}`}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cheque */}
                  {formaPago === 'cheque' && (
                    <div className="ref-box" style={{ marginTop: 8 }}>
                      <div className="cobro-label" style={{ color: '#f59e0b' }}>📝 Datos del Cheque (opcional)</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input className="input" placeholder="No. de cheque" value={refCheque} onChange={e => setRefCheque(e.target.value)} style={{ fontSize: 12, padding: '7px 10px' }} />
                        <input className="input" placeholder="Banco emisor" value={bancoCheque} onChange={e => setBancoCheque(e.target.value)} style={{ fontSize: 12, padding: '7px 10px' }} />
                      </div>
                    </div>
                  )}

                  {/* Transferencia */}
                  {formaPago === 'transferencia' && (
                    <div className="ref-box" style={{ marginTop: 8 }}>
                      <div className="cobro-label" style={{ color: '#8b5cf6' }}>🏦 Datos de Transferencia (opcional)</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input className="input" placeholder="No. de referencia" value={refTransferencia} onChange={e => setRefTransferencia(e.target.value)} style={{ fontSize: 12, padding: '7px 10px' }} />
                        <input className="input" placeholder="Banco origen" value={bancoTransferencia} onChange={e => setBancoTransferencia(e.target.value)} style={{ fontSize: 12, padding: '7px 10px' }} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Aviso si requiere caja */}
              {requerirCaja && !cajaAbierta && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: 12, textAlign: 'center', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>🔒 Caja no abierta</div>
                  <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 6 }} onClick={() => navigate('/caja')}>💰 Ir a Caja</button>
                </div>
              )}

            </div>

            {/* BOTÓN COBRAR */}
            <button className="btn-cobrar"
              onClick={() => setModalConfirm(true)}
              disabled={carrito.length === 0 || (requerirCaja && !cajaAbierta)}>
              {`🧾 Cobrar ${fmt(total)} · ${tipoDte} ${tipoPago === 'credito' ? '(Crédito)' : ''}`}
            </button>
          </div>
        </div>

      </div>

      {/* ── MODAL CONFIRMACIÓN ── */}
      {modalConfirm && (
        <div className="confirm-overlay" onClick={() => setModalConfirm(false)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-title">✅ Confirmar Cobro</div>

            <div className="confirm-items">
              {carrito.map((c, i) => (
                <div key={i} className="confirm-item">
                  <span style={{ color: 'var(--text2)' }}>{c.qty}x {c.nombre}</span>
                  <span className="amount">{fmt(precioConIva(c.precio) * c.qty)}</span>
                </div>
              ))}
              <div className="confirm-total">
                <span>TOTAL</span>
                <span className="amount" style={{ color: 'var(--accent)' }}>{fmt(total)}</span>
              </div>
            </div>

            <div className="confirm-meta">
              <span className="confirm-badge" style={{ color: tipoInfo.color, borderColor: tipoInfo.color + '40', background: tipoInfo.color + '12' }}>{tipoInfo.icon} {tipoDte}</span>
              <span className="confirm-badge" style={{ color: tipoPago === 'contado' ? '#00d4aa' : '#f59e0b', borderColor: tipoPago === 'contado' ? 'rgba(0,212,170,0.3)' : 'rgba(245,158,11,0.3)', background: tipoPago === 'contado' ? 'rgba(0,212,170,0.08)' : 'rgba(245,158,11,0.08)' }}>
                {tipoPago === 'contado' ? '💵 Contado' : '📅 Crédito'}
              </span>
              {tipoPago === 'contado' && <span className="confirm-badge" style={{ color: 'var(--muted)', borderColor: 'var(--border)', background: 'var(--surface2)' }}>{FORMAS_PAGO.find(f => f.id === formaPago)?.icon} {formaPago}</span>}
              {clienteNombre && <span className="confirm-badge" style={{ color: 'var(--text2)', borderColor: 'var(--border)', background: 'var(--surface2)' }}>👤 {clienteNombre}</span>}
            </div>

            {(formaPago === 'efectivo' || formaPago === 'mixto') && efectivoRecibido && tipoPago === 'contado' && (
              <div style={{ background: 'rgba(0,212,170,0.06)', border: '1.5px solid rgba(0,212,170,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>Recibido: <strong>{fmt(parseFloat(efectivoRecibido))}</strong></span>
                <span>Vuelto: <strong style={{ color: vuelto >= 0 ? '#00d4aa' : '#ef4444' }}>{fmt(Math.abs(vuelto))}</strong></span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setModalConfirm(false)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={procesarVenta} disabled={procesando}>
                {procesando ? '⏳ Procesando...' : '✅ Confirmar · Enter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL UNIDADES ── */}
      {modalUnidad && (
        <div className="modal-overlay" onClick={() => setModalUnidad(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">📦 Seleccionar Unidad</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}><strong style={{ color: 'var(--text)' }}>{modalUnidad.nombre}</strong> · Stock: {modalUnidad.stock} {modalUnidad.unidad}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div onClick={() => { agregar(modalUnidad, { nombre: modalUnidad.unidad, factor: 1, precio: modalUnidad.precio }); setModalUnidad(null) }}
                style={{ padding: '12px 14px', borderRadius: 10, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><div style={{ fontWeight: 700, fontSize: 13 }}>{modalUnidad.unidad}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>Unidad principal</div></div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>${precioConIva(modalUnidad.precio).toFixed(2)}</div>
              </div>
              {(modalUnidad.unidadesAdicionales || []).map((u, i) => (
                <div key={i} onClick={() => { agregar(modalUnidad, u); setModalUnidad(null) }}
                  style={{ padding: '12px 14px', borderRadius: 10, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><div style={{ fontWeight: 700, fontSize: 13 }}>{u.nombre}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>= {u.factor} {modalUnidad.unidad}</div></div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent2)', fontSize: 14 }}>${u.precio ? (parseFloat(u.precio)*1.13).toFixed(2) : (modalUnidad.precio*u.factor*1.13).toFixed(2)}</div>
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
          <div className="ticket-overlay" onClick={() => { setMostrarTicket(false) }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>GUARDADO EN</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>🔥 Firebase</div>
                </div>
                <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>STOCK</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>📦 Actualizado</div>
                </div>
              </div>

              {/* Imprimir */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => imprimirIframe(generarTicketTermico(v))}>🧾 Ticket Térmico</button>
                <button className="btn btn-ghost btn-sm" onClick={() => imprimirIframe(generarPDFCompleto(v))}>📄 PDF Completo</button>
              </div>

              {/* Enviar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                <a href={`https://wa.me/?text=${msgWA}`} target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 10, border: '1.5px solid rgba(37,211,102,0.3)', background: 'rgba(37,211,102,0.08)', color: '#25D366', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'none' }}>
                  💬 WhatsApp
                </a>
                <a href={`mailto:?subject=${asunto}&body=${cuerpo}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 10, border: '1.5px solid rgba(74,143,232,0.3)', background: 'rgba(74,143,232,0.08)', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'none' }}>
                  📧 Correo
                </a>
              </div>

              <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginBottom: 8 }} onClick={() => navigate('/facturas')}>📋 Ver en Facturas DTE</button>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={nuevaVenta}>+ Nueva Venta</button>
            </div>
          </div>
        )
      })()}

      {/* ATAJOS */}
      {mostrarAtajos && (
        <div className="atajos-panel">
          <div className="atajos-title">⌨️ Atajos de Teclado</div>
          {[['F1','Buscar producto'],['F3','Abrir cobro'],['F4','Nueva venta'],['Esc','Cerrar modal'],['+','Aumentar último item'],['-','Reducir último item'],['1–5','Método de pago (en cobro)'],['Enter','Confirmar cobro'],['?','Mostrar/ocultar']].map(([k,d]) => (
            <div key={k} className="atajo-row"><span className="atajo-key">{k}</span><span className="atajo-desc">{d}</span></div>
          ))}
        </div>
      )}
      <button className="atajos-toggle" onClick={() => setMostrarAtajos(v => !v)}>⌨️ Atajos <span style={{ opacity: 0.5, fontFamily: 'var(--mono)' }}>?</span></button>
    </>
  )
}