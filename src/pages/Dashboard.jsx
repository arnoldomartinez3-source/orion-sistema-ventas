import { useNavigate } from 'react-router-dom'
import { usePermisos } from '../PermisosContext'
import { useEffect, useState, useMemo } from 'react'
import { db } from '../firebase'
import { collection, onSnapshot, query, where, doc, getDoc } from 'firebase/firestore'
import { NAV_ITEMS, NavIcon, NAV_COLOR } from '../navConfig'
import { useContingencia } from '../hooks/useContingencia'
import { escuchar, rango, enValores, unirPorId, inicioDelDia, inicioDelMes } from '../utils/consultas'
import { esAnulada, esDevolucion, montoNeto, signoTipo, saldoFactura } from '../utils/devoluciones'
import { calcularCaja, totalesPorMedio } from '../utils/caja'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = ['#00d4aa', '#4f8cff', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

// Íconos SVG inline (stroke heredan currentColor)
const Icon = ({ name }) => {
  const paths = {
    cash: <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></>,
    invoice: <><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 9h1M9 13h6M9 17h6"/></>,
    box: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    cart: <><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M2 3h2l2.4 12.5a2 2 0 0 0 2 1.5h7.7a2 2 0 0 0 2-1.5L21 7H5.2"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

const dashStyles = `
  /* ── INICIO EN TELÉFONO (solo ≤768; en PC se muestra el dashboard de siempre) ── */
  .dash-movil { flex-direction: column; gap: 14px; margin-bottom: 8px; }
  @media (max-width: 768px) { .solo-movil.dash-movil { display: flex; } }
  .dm-hero { background: linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%); color: #fff; border-radius: 16px; padding: 16px; position: relative; overflow: hidden; }
  .dm-hero::after { content: ''; position: absolute; right: -34px; top: -34px; width: 140px; height: 140px; border-radius: 50%; background: rgba(216,169,60,0.16); }
  .dm-hero-lbl { font-size: 11px; letter-spacing: 0.8px; text-transform: uppercase; opacity: 0.75; font-weight: 700; }
  .dm-hero-num { font-family: var(--mono); font-size: 34px; font-weight: 700; line-height: 1.1; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .dm-hero-var { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 99px; margin-top: 8px; }
  .dm-hero-var.up { background: rgba(0,184,148,0.22); color: #7ff0d2; }
  .dm-hero-var.down { background: rgba(239,68,68,0.22); color: #ffb4b4; }
  .dm-hero-mini { display: flex; gap: 18px; margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.14); }
  .dm-hero-mini div { font-size: 10.5px; opacity: 0.8; } .dm-hero-mini b { display: block; font-family: var(--mono); font-size: 15px; opacity: 1; color: #fff; font-variant-numeric: tabular-nums; }
  .dm-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .dm-acc { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 10px 4px; text-align: center; font-size: 10.5px; font-weight: 600; color: var(--text2); cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 6px; transition: transform 0.12s; }
  .dm-acc:active { transform: scale(0.94); border-color: var(--c); }
  .dm-acc-ico { width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
  .dm-acc-ico svg { width: 18px; height: 18px; }
  .dm-vertodo { background: none; border: none; color: var(--accent); font-family: inherit; font-weight: 700; font-size: 12.5px; cursor: pointer; padding: 2px 0; text-align: left; margin-top: -4px; }
  .dm-sec { font-size: 10.5px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: var(--muted); display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
  .dm-link { color: var(--accent); text-transform: none; letter-spacing: 0; font-weight: 700; font-size: 12px; cursor: pointer; }
  .dm-aten { display: flex; flex-direction: column; gap: 6px; }
  .dm-av { display: flex; flex-direction: column; gap: 2px; padding: 9px 12px 9px 18px; border-radius: 10px; font-size: 12.5px; font-weight: 700; position: relative; }
  .dm-av::before { content: ''; position: absolute; left: 7px; top: 9px; bottom: 9px; width: 4px; border-radius: 4px; background: currentColor; }
  .dm-av span { font-weight: 500; color: var(--text2); font-size: 11px; }
  .dm-av.warn { background: rgba(245,158,11,0.10); color: #d97706; cursor: pointer; }
  .dm-av.bad { background: rgba(239,68,68,0.10); color: #dc2626; cursor: pointer; }
  .dm-av.ok { background: rgba(0,184,148,0.10); color: #00a884; }
  .dm-lista { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 4px 14px; }
  .dm-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--border); }
  .dm-row:first-child { border-top: 0; }
  .dm-row b { font-size: 13px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .dm-row small { color: var(--muted); font-size: 10.5px; display: block; }
  .dm-monto { font-family: var(--mono); font-weight: 700; font-size: 13px; white-space: nowrap; }
  .dm-vacio { padding: 18px 0; text-align: center; color: var(--muted); font-size: 12.5px; }

  .stats-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 20px; width: 100%; }
  @media (max-width: 1000px) { .stats-grid { grid-template-columns: repeat(2,1fr); } }
  @media (max-width: 480px) { .stats-grid { grid-template-columns: 1fr 1fr; } }

  /* STAT CARD — Bento de color: un bloque de color por métrica */
  .stat-card {
    border-radius: 18px; padding: 17px 18px; position: relative; overflow: hidden; color: #fff;
    min-height: 118px; display: flex; flex-direction: column; justify-content: space-between;
    box-shadow: 0 8px 22px rgba(0,0,0,0.12); transition: transform 0.18s, box-shadow 0.18s;
  }
  .stat-card::after { content: ''; position: absolute; right: -32px; bottom: -42px; width: 124px; height: 124px; border-radius: 50%; background: rgba(255,255,255,0.14); pointer-events: none; }
  .stat-card:hover { transform: translateY(-3px); box-shadow: 0 16px 36px rgba(0,0,0,0.24); }
  .stat-card.emerald { background: linear-gradient(150deg, #169a67, #0d6f49); }
  .stat-card.gold    { background: linear-gradient(150deg, #c9962b, #a9741a); }
  .stat-card.violet  { background: linear-gradient(150deg, #7b57c9, #5a3ba0); }
  .stat-card.coral   { background: linear-gradient(150deg, #e0685f, #bd3f45); }
  .stat-ico { position: absolute; right: 15px; top: 15px; opacity: 0.85; }
  .stat-ico svg { width: 20px; height: 20px; }
  .stat-label { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; opacity: 0.92; }
  .stat-value { font-size: 29px; font-weight: 730; letter-spacing: -0.5px; font-family: var(--mono); line-height: 1.05; }
  .stat-change { font-size: 12.5px; font-weight: 600; opacity: 0.92; margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  @media (max-width: 600px) {
    .stat-card { min-height: 104px; padding: 13px 14px; }
    .stat-value { font-size: 22px; letter-spacing: -0.4px; }
    .stat-label { font-size: 10px; }
    .stat-change { font-size: 11px; white-space: normal; }
  }

  .quick-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 20px; width: 100%; }
  @media (max-width: 900px) { .quick-grid { grid-template-columns: repeat(2,1fr); } }

  /* ACCESOS RÁPIDOS — solo móvil */
  .mobile-menu-grid { display: none; margin-bottom: 22px; }
  .mmg-title { font-size: 12px; font-weight: 700; color: var(--muted); letter-spacing: 0.8px; margin: 0 0 12px; padding: 0 2px; }
  .mmg-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .mmg-card {
    background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px;
    padding: 16px 8px; display: flex; flex-direction: column; align-items: center; gap: 9px;
    cursor: pointer; transition: transform 0.15s, border-color 0.15s;
  }
  .mmg-card:active { transform: scale(0.94); border-color: var(--c); }
  .mmg-iconwrap {
    width: 50px; height: 50px; border-radius: 14px; display: flex; align-items: center; justify-content: center;
    color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--c) 25%, transparent);
  }
  .mmg-iconwrap svg { width: 26px; height: 26px; }
  .mmg-label { font-size: 11.5px; font-weight: 600; color: var(--text); text-align: center; line-height: 1.2; }
  @media (max-width: 768px) { .mobile-menu-grid { display: block; } }
  @media (max-width: 360px) { .mmg-grid { grid-template-columns: repeat(2, 1fr); } }
  /* QUICK BTN — Bento: ficha clara con chip de color */
  .quick-btn { background: var(--surface); border: 1.5px solid var(--border); border-radius: 14px; padding: 13px 15px; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 16px var(--shadow2); }
  .quick-btn:active { transform: scale(0.97); }
  .q-iconbox { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #fff; }
  .q-iconbox svg { width: 21px; height: 21px; }
  .q-info { flex: 1; min-width: 0; }
  .q-label { font-size: 14.5px; font-weight: 700; color: var(--text); letter-spacing: -0.2px; }
  .q-desc { font-size: 12px; color: var(--muted); margin-top: 1px; }
  .q-arrow { color: var(--muted); flex-shrink: 0; opacity: 0.55; transition: all 0.18s; }
  .q-arrow svg { width: 18px; height: 18px; }
  .quick-btn:hover .q-arrow { opacity: 1; transform: translateX(3px); }

  /* MÓVIL: quick-btn sin texto cortado */
  @media (max-width: 600px) {
    .quick-btn { padding: 12px 13px; gap: 11px; }
    .q-iconbox { width: 40px; height: 40px; border-radius: 11px; }
    .q-iconbox svg { width: 21px; height: 21px; }
    .q-label { font-size: 14px; }
    .q-desc { font-size: 11px; }
    .q-arrow { display: none; }
  }

  /* DASH GRID — ventas más ancha, alertas más compacta */
  .dash-grid { display: grid; grid-template-columns: 1fr 360px; gap: 16px; margin-bottom: 16px; width: 100%; }
  @media (max-width: 1100px) { .dash-grid { grid-template-columns: 1fr 300px; } }
  @media (max-width: 860px) { .dash-grid { grid-template-columns: 1fr; } }

  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; width: 100%; }
  @media (max-width: 960px) { .charts-grid { grid-template-columns: 1fr; } }

  /* TABLA — sin ancho fijo, columnas auto */
  .ventas-table { width: 100%; border-collapse: collapse; }
  .ventas-table th { padding: 11px 16px; text-align: left; font-size: 11px; color: var(--muted); letter-spacing: 0.8px; font-weight: 700; border-bottom: 1.5px solid var(--border); white-space: nowrap; text-transform: uppercase; background: var(--surface2); }
  .ventas-table td { padding: 13px 16px; font-size: 13px; border-bottom: 1px solid var(--border); }
  .ventas-table tr:last-child td { border-bottom: none; }
  .ventas-table tbody tr { transition: background 0.15s; }
  .ventas-table tbody tr td:first-child { box-shadow: inset 3px 0 0 transparent; transition: box-shadow 0.15s; }
  .ventas-table tbody tr:hover td { background: var(--surface3); }
  .ventas-table tbody tr:hover td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
  .ventas-table .col-dte { width: 110px; }
  .ventas-table .col-cliente { } /* auto — ocupa el resto */
  .ventas-table .col-total { width: 100px; text-align: right; }
  .ventas-table .col-fecha { width: 90px; }
  .ventas-table .col-estado { width: 110px; }

  /* ALERTAS — items más grandes y vistosos */
  .alert-item {
    display: flex; align-items: center; gap: 14px;
    padding: 16px 20px; border-bottom: 1px solid var(--border);
    transition: background 0.15s;
  }
  .alert-item:hover { background: var(--surface2); }
  .alert-item:last-child { border-bottom: none; }

  .alert-dot-wrap {
    width: 44px; height: 44px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; font-size: 20px;
  }
  .alert-dot-wrap.critical { background: rgba(239,68,68,0.12); }
  .alert-dot-wrap.warning { background: rgba(245,158,11,0.12); }

  .alert-info { flex: 1; min-width: 0; }
  .alert-nombre { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 3px; }
  .alert-stock-row { display: flex; align-items: center; gap: 8px; }
  .alert-stock-val { font-family: var(--mono); font-size: 13px; font-weight: 700; }
  .alert-stock-val.critical { color: var(--danger); }
  .alert-stock-val.warning { color: var(--accent3); }
  .alert-min { font-size: 12px; color: var(--muted); font-family: var(--mono); }

  .alert-badge {
    font-size: 10px; font-weight: 800; padding: 3px 8px;
    border-radius: 6px; flex-shrink: 0;
  }
  .alert-badge.critical { background: rgba(239,68,68,0.12); color: var(--danger); }
  .alert-badge.warning { background: rgba(245,158,11,0.12); color: var(--accent3); }

  .chart-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; color: var(--muted); gap: 8px; }
  .chart-empty-icon { font-size: 36px; opacity: 0.4; }
  .chart-empty-text { font-size: 13px; font-weight: 500; }

  /* ══════════ PANEL DE OPERACIÓN (PC) ══════════ */
  @media (min-width: 769px) { .dash-topbar { display: none; } }
  .op-estado { display: flex; align-items: center; background: var(--navy); color: #fff; border-radius: 14px;
    padding: 0 6px 0 18px; height: 58px; margin-bottom: 18px; box-shadow: 0 10px 26px -16px rgba(20,33,61,.9); }
  .dark-mode .op-estado { background: #0b1220; border: 1px solid var(--border); }
  .op-marca { display: flex; align-items: center; gap: 10px; padding-right: 18px; border-right: 1px solid rgba(255,255,255,.14); }
  .op-negocio { font-size: 17px; font-weight: 800; letter-spacing: .2px; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .op-item { display: flex; align-items: center; gap: 8px; padding: 0 18px; height: 100%; border-right: 1px solid rgba(255,255,255,.1); }
  .op-et { font-size: 10px; text-transform: uppercase; letter-spacing: .7px; color: rgba(255,255,255,.55); }
  .op-va { font-size: 13.5px; font-weight: 700; white-space: nowrap; }
  .op-punto { width: 8px; height: 8px; border-radius: 50%; background: #4ECB8E; box-shadow: 0 0 0 3px rgba(78,203,142,.22); flex-shrink: 0; }
  .op-punto.gris { background: #93a3bd; box-shadow: 0 0 0 3px rgba(147,163,189,.18); }
  .op-punto.rojo { background: #ef6b5e; box-shadow: 0 0 0 3px rgba(239,107,94,.25); }
  .op-punto.ambar { background: #e8b64c; box-shadow: 0 0 0 3px rgba(232,182,76,.22); }
  .op-prod { color: #7ff0d2; }
  .op-pruebas { color: #f3c969; letter-spacing: .5px; }
  .op-reloj { border-right: 0; }
  .op-reloj .op-et { text-transform: none; font-size: 11px; }
  .op-reloj .op-va { font-size: 17px; letter-spacing: .5px; }
  .op-acciones { margin-left: auto; display: flex; align-items: center; gap: 10px; padding-right: 8px; }
  .op-btn-oro { background: var(--accent3); color: #1a1204; border: none; border-radius: 9px; padding: 10px 18px; font: inherit; font-weight: 800; cursor: pointer; }
  .op-btn-oro:hover { filter: brightness(1.07); }
  .op-btn-linea { background: transparent; color: #fff; border: 1.5px solid rgba(255,255,255,.28); border-radius: 9px; padding: 9px 14px; font: inherit; font-weight: 700; cursor: pointer; }
  .op-btn-linea:hover { border-color: rgba(255,255,255,.6); }
  @media (max-width: 1250px) {
    .op-estado { height: auto; flex-wrap: wrap; padding: 10px 12px; gap: 10px; }
    .op-item { border-right: 0; padding: 0 10px; height: auto; }
    .op-acciones { width: 100%; justify-content: flex-end; }
  }

  .op-grid { display: grid; grid-template-columns: minmax(0,1.55fr) minmax(0,1fr); gap: 18px; align-items: start; }
  @media (max-width: 1100px) { .op-grid { grid-template-columns: 1fr; } }
  .op-col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
  .op-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden;
    box-shadow: 0 1px 1px var(--shadow2), 0 14px 28px -24px var(--shadow); }
  .op-panel-tit { display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 12px 18px; border-bottom: 1px solid var(--border); background: var(--surface2); }
  .op-panel-tit h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); font-weight: 800; }
  .op-enlace { font-size: 12.5px; color: var(--accent); font-weight: 700; cursor: pointer; white-space: nowrap; }
  .op-enlace:hover { text-decoration: underline; }

  .op-hoy { padding: 18px 22px 12px; }
  .op-monto { font-size: 46px; font-weight: 800; letter-spacing: -1.5px; line-height: 1.05; }
  .op-delta { display: inline-flex; align-items: center; gap: 4px; font-family: var(--font); font-size: 12.5px; font-weight: 800;
    color: #00a07c; background: rgba(0,194,150,.13); padding: 4px 10px; border-radius: 99px; margin-left: 10px; vertical-align: middle; }
  .op-delta.baja { color: #dc2626; background: rgba(239,68,68,.12); }
  .op-sub { color: var(--text2); font-size: 13.5px; margin-top: 3px; }

  .op-medios { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--border);
    border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
  .op-medio { background: var(--surface); padding: 12px 18px; }
  .op-medio-va { font-size: 18px; font-weight: 800; margin-top: 2px; }
  .op-medio .op-et { color: var(--muted); font-weight: 700; }
  .op-barra { height: 5px; border-radius: 99px; background: var(--border); margin-top: 8px; overflow: hidden; }
  .op-barra.chico { width: 64px; margin-top: 0; flex-shrink: 0; }
  .op-barra i { display: block; height: 100%; border-radius: 99px; background: var(--accent); }
  .op-barra i.c1 { background: var(--accent3); }
  .op-barra i.c2 { background: var(--muted); }
  .op-barra i.alerta { background: #d98a00; }
  .op-barra i.malo { background: #ef4444; }

  .op-mes { display: flex; align-items: center; gap: 12px; padding: 12px 22px 16px; font-size: 13px; color: var(--text2); flex-wrap: wrap; }
  .op-mes b { color: var(--text); }
  .op-mes-sep { width: 1px; height: 14px; background: var(--border); }

  .op-accion { display: flex; align-items: center; gap: 12px; padding: 13px 18px; border-bottom: 1px solid var(--border); cursor: pointer; }
  .op-accion:last-child { border-bottom: 0; }
  .op-accion:hover { background: var(--surface2); }
  .op-num { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-weight: 800; font-size: 15px; flex-shrink: 0; }
  .op-num.malo { background: rgba(239,68,68,.13); color: #dc2626; }
  .op-num.alerta { background: rgba(217,138,0,.16); color: #b8730b; }
  .op-accion-t { font-weight: 700; font-size: 13.5px; }
  .op-accion-d { font-size: 11.5px; color: var(--muted); margin-top: 1px; }
  .op-fl { margin-left: auto; color: var(--muted); font-size: 18px; }
  .op-vacio { padding: 18px; font-size: 13px; color: var(--muted); line-height: 1.5; }

  .op-caja { padding: 14px 18px 16px; }
  .op-caja-fila { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; color: var(--text2); }
  .op-caja-fila b { color: var(--text); font-weight: 700; }
  .op-caja-tot { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid var(--border); margin-top: 8px; padding-top: 10px; }
  .op-caja-tot span { font-size: 11.5px; text-transform: uppercase; letter-spacing: .6px; color: var(--muted); font-weight: 800; }
  .op-caja-tot b { font-size: 22px; font-weight: 800; }

  .op-evento { display: grid; grid-template-columns: 50px 12px 1fr auto; align-items: start; gap: 12px;
    padding: 11px 18px; border-bottom: 1px solid var(--border); }
  .op-evento:last-child { border-bottom: 0; }
  .op-evento:hover { background: var(--surface2); }
  .op-hora { font-size: 12.5px; color: var(--muted); padding-top: 2px; }
  .op-mark { width: 10px; height: 10px; border-radius: 50%; margin-top: 5px; background: #00C296; }
  .op-mark.oro { background: var(--accent3); } .op-mark.malo { background: #ef4444; } .op-mark.gris { background: var(--border2); }
  .op-ev-t { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .op-ev-d { font-size: 11.5px; color: var(--muted); margin-top: 1px; }
  .op-ev-m { font-weight: 800; font-size: 14px; white-space: nowrap; }
  .op-ev-btn { border: 1.5px solid #ef4444; color: #ef4444; background: transparent; border-radius: 8px;
    padding: 5px 12px; font: inherit; font-size: 11.5px; font-weight: 800; cursor: pointer; white-space: nowrap; }

  .op-top { display: flex; align-items: center; gap: 12px; padding: 11px 18px; border-bottom: 1px solid var(--border); }
  .op-top:last-child { border-bottom: 0; }
  .op-top-pos { width: 22px; font-weight: 800; color: var(--muted); font-size: 13px; }
  .op-top-n { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .op-top-q { text-align: right; }
  .op-top-q b { font-size: 15px; font-weight: 800; display: block; }
  .op-top-q small { font-size: 11px; color: var(--muted); }
  .op-stock { display: flex; align-items: center; gap: 12px; padding: 11px 18px; border-bottom: 1px solid var(--border); cursor: pointer; }
  .op-stock:last-child { border-bottom: 0; }
  .op-stock:hover { background: var(--surface2); }
`


// Hora de El Salvador (la PC del cliente puede estar en otra zona)
const ZONA = { timeZone: 'America/El_Salvador' }
const horaSV = (ts) => ts?.toDate?.().toLocaleTimeString('es-SV', { ...ZONA, hour: '2-digit', minute: '2-digit', hour12: false }) || '—'
const horaDe = (d) => horaSV(d?.createdAt)

const CustomTooltip = ({ active, payload, label, prefix = '$' }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--surface3)', border: '1.5px solid var(--border2)', borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 24px var(--shadow)' }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ fontSize: 14, fontWeight: 700, color: p.color, fontFamily: 'var(--mono)' }}>
            {prefix}{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
          </div>
        ))}
      </div>
    )
  }
  return null
}

// ¿Documento del mes en curso? (sin createdAt = recién creado, aún sin hora del servidor)
const esteMes = (x) => { const f = x.createdAt?.toDate?.(); return !f || f >= inicioDelMes() }

export default function Dashboard() {
  const navigate = useNavigate()
  const { puede, esAdmin, userId, rol, empresaId } = usePermisos()
  const { activa: contingenciaActiva } = useContingencia()
  const [todosAccesos, setTodosAccesos] = useState(false)
  const [ventas, setVentas] = useState([])
  const [facturas, setFacturas] = useState([])
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!empresaId) return // esperar empresaId del usuario
    // Cajero/vendedor solo ven lo SUYO (filtrado server-side por la query);
    // admin y demás roles, todo lo de la empresa.
    const soloPropias = !esAdmin && (rol === 'cajero' || rol === 'vendedor')
    // Solo lo que el inicio muestra: ventas y DTE del MES (y 7 días atrás para la gráfica y "vs. ayer"),
    // más lo PENDIENTE sin importar la fecha (por cobrar y sin transmitir). No todo el historial.
    const desde = new Date(Math.min(inicioDelMes().getTime(), inicioDelDia(7).getTime()))
    const cajeroId = soloPropias ? userId : undefined
    const unsubVentas = escuchar('ventas', { empresaId, cajeroId, filtro: rango('createdAt', desde) }, todas => {
      // El cajero/vendedor ve solo las de HOY en su panel.
      if (soloPropias) {
        const hoy = new Date().toDateString()
        setVentas(todas.filter(v => { const f = v.createdAt?.toDate?.(); return !f || f.toDateString() === hoy }))
      } else {
        setVentas(todas)
      }
    })
    let recientes = [], porCobrar = [], sinTransmitir = []
    const unirFacturas = () => setFacturas(unirPorId(recientes, porCobrar, sinTransmitir)
      .sort((a, b) => (b.createdAt?.seconds ?? Infinity) - (a.createdAt?.seconds ?? Infinity)))
    const u1 = escuchar('facturas', { empresaId, cajeroId, filtro: rango('createdAt', desde) }, d => { recientes = d; unirFacturas() })
    const u2 = escuchar('facturas', { empresaId, cajeroId, filtro: enValores('estadoPago', ['pendiente', 'vencida']) }, d => { porCobrar = d; unirFacturas() })
    const u3 = escuchar('facturas', { empresaId, cajeroId, filtro: enValores('dte_estado', ['PENDIENTE', 'RECHAZADO', 'CONTINGENCIA']) }, d => { sinTransmitir = d; unirFacturas() })
    const unsubFacturas = () => { u1(); u2(); u3() }
    const unsubProductos = onSnapshot(query(collection(db, 'productos'), where('empresaId', '==', empresaId)), snap => { setProductos(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) }, () => setLoading(false))
    return () => { unsubVentas(); unsubFacturas(); unsubProductos() }
  }, [empresaId, esAdmin, rol, userId])

  // Del MES en curso (las listas traen también 7 días atrás y los pendientes viejos)
  // Las anuladas no cuentan; las devoluciones (NC / Evento de Retorno) restan del total
  const movimientosMes = useMemo(() => ventas.filter(v => esteMes(v) && !esAnulada(v)), [ventas])
  const ventasMes = useMemo(() => movimientosMes.filter(v => !esDevolucion(v)), [movimientosMes])
  const facturasMes = useMemo(() => facturas.filter(esteMes), [facturas])
  const totalVentas = movimientosMes.reduce((s, v) => s + montoNeto(v), 0)
  const totalDTEs = facturasMes.length
  const totalPendientes = facturas.filter(f => f.estadoPago === 'pendiente').reduce((s, f) => s + saldoFactura(f), 0)
  const stockAlertas = productos.filter(p => p.stock < p.min)




  const fmt = (n) => `$${(n || 0).toFixed(2)}`

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const map = { '1': '/ventas', '2': '/facturas', '3': '/inventario', '4': '/clientes' }
      if (map[e.key]) navigate(map[e.key])
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [navigate])


  // ── Datos del inicio en TELÉFONO: ventas de hoy vs. ayer, atención, accesos ──
  const esDeFecha = (v, d) => { const f = v.createdAt?.toDate?.(); return !!f && f.toDateString() === (typeof d === 'string' ? d : d.toDateString()) }
  const hoyD = new Date(), ayerD = new Date(); ayerD.setDate(ayerD.getDate() - 1)
  const hoyTxt = hoyD.toDateString()   // string estable: sirve de dependencia de los useMemo
  const ventasHoy = ventas.filter(v => esDeFecha(v, hoyTxt) && !esAnulada(v) && !esDevolucion(v))
  const totalHoy = ventas.filter(v => esDeFecha(v, hoyTxt)).reduce((s, v) => s + montoNeto(v), 0)
  const totalAyer = ventas.filter(v => esDeFecha(v, ayerD)).reduce((s, v) => s + montoNeto(v), 0)
  const variacionAyer = totalAyer > 0 ? ((totalHoy - totalAyer) / totalAyer) * 100 : null
  const ticketPromedio = ventasHoy.length ? totalHoy / ventasHoy.length : 0
  const facturasVencidas = facturas.filter(f => f.estadoPago === 'vencida')
  const dteSinTransmitir = facturas.filter(f => ['PENDIENTE', 'RECHAZADO', 'CONTINGENCIA'].includes(f.dte_estado) && f.estadoPago !== 'anulada' && !f.anulada)
  const dteProcesados = facturasMes.filter(f => f.dte_estado === 'PROCESADO').length
  const ORDEN_ACCESOS = ['/ventas', '/caja', '/facturas', '/inventario', '/clientes', '/compras', '/reportes', '/cotizaciones']
  const NOMBRE_CORTO = { '/ventas': 'Vender', '/facturas': 'DTE', '/cotizaciones': 'Cotizar', '/config': 'Config.', '/superadmin': 'One Geo', '/operaciones': 'Operac.', '/contadores': 'Contador', '/sucursales': 'Sucursal.' }
  const accesosDisponibles = NAV_ITEMS
    .filter(item => !item.section && item.icon !== 'dashboard' && !item.soloCertificacion && !item.soloMaestro && !(item.sinRoles && !esAdmin && item.sinRoles.includes(rol)) && (!item.permiso || puede(item.permiso)))
    .sort((a, b) => { const ia = ORDEN_ACCESOS.indexOf(a.path), ib = ORDEN_ACCESOS.indexOf(b.path); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) })
  const accesosMovil = todosAccesos ? accesosDisponibles : accesosDisponibles.slice(0, 8)

  // ══════════════════════════════════════════════════════════════
  // PANEL DE OPERACIÓN (PC) — el día de hoy, el estado del MH y lo que hay que atender.
  // El teléfono sigue con su propio diseño (.dash-movil, más arriba).
  // ══════════════════════════════════════════════════════════════
  const soloPropias = !esAdmin && (rol === 'cajero' || rol === 'vendedor')

  // Reloj de la franja (hora de El Salvador), se refresca cada segundo.
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 1000); return () => clearInterval(t) }, [])
  const horaReloj = ahora.toLocaleTimeString('es-SV', { ...ZONA, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const diaReloj = ahora.toLocaleDateString('es-SV', { ...ZONA, weekday: 'long', day: 'numeric', month: 'long' })

  // Caja abierta (la propia si es cajero; si es admin, la primera abierta) y datos de la empresa
  const [cajaAbierta, setCajaAbierta] = useState(null)
  const [empresaCfg, setEmpresaCfg] = useState({})
  useEffect(() => {
    if (!empresaId) return
    const filtros = [where('empresaId', '==', empresaId), where('estado', '==', 'abierta')]
    if (soloPropias && userId) filtros.push(where('cajeroId', '==', userId))
    const u = onSnapshot(query(collection(db, 'cajas'), ...filtros), snap => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setCajaAbierta(lista.find(c => c.cajeroId === userId) || lista[0] || null)
    }, () => setCajaAbierta(null))
    getDoc(doc(db, 'configuracion', empresaId)).then(s => { if (s.exists()) setEmpresaCfg(s.data()) }).catch(() => {})
    return () => u()
  }, [empresaId, soloPropias, userId])

  const enProduccion = (empresaCfg.mh_ambiente || '00') === '01'
  const nombreNegocio = empresaCfg.nombreComercial || empresaCfg.empresaNombre || ''

  // Hoy: medios de pago, caja y último DTE
  const mediosHoy = useMemo(() => totalesPorMedio(ventasHoy), [ventasHoy])
  const cajaCalc = useMemo(() => (cajaAbierta ? calcularCaja(cajaAbierta, ventas) : null), [cajaAbierta, ventas])
  const facturasHoy = useMemo(() => facturas.filter(f => esDeFecha(f, hoyTxt)), [facturas, hoyTxt])
  const ultimoDTE = useMemo(() => facturasHoy
    .filter(f => f.dte_estado === 'PROCESADO')
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0] || null, [facturasHoy])

  // Estado del MH: no se inventa un "en línea"; se deduce de lo que pasó hoy.
  const estadoMH = contingenciaActiva
    ? { punto: 'rojo', texto: 'Contingencia activa' }
    : dteSinTransmitir.length > 0
      ? { punto: 'ambar', texto: `${dteSinTransmitir.length} DTE por transmitir` }
      : facturasHoy.some(f => f.dte_estado === 'PROCESADO')
        ? { punto: '', texto: 'Sellando bien' }
        : { punto: 'gris', texto: 'Sin DTE todavía' }

  // Serie de los últimos 14 días para la gráfica del panel de hoy
  const serie14 = useMemo(() => {
    const dias = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      dias.push({ clave: d.toDateString(), dia: d.toLocaleDateString('es-SV', { day: 'numeric', month: 'short' }), total: 0 })
    }
    ventas.forEach(v => {
      const f = v.createdAt?.toDate?.(); if (!f) return
      const d = dias.find(x => x.clave === f.toDateString())
      if (d) d.total += montoNeto(v)
    })
    return dias
  }, [ventas])

  // Lo más vendido HOY (unidades), descontando devoluciones
  const topHoy = useMemo(() => {
    const acc = {}
    ventas.filter(v => esDeFecha(v, hoyTxt) && !esAnulada(v)).forEach(v => {
      const signo = signoTipo(v.tipoDte)
      v.items?.forEach(it => {
        const nombre = it.nombre || 'Sin nombre'
        if (!acc[nombre]) acc[nombre] = { nombre, qty: 0, monto: 0, unidad: it.unidad || '' }
        acc[nombre].qty += (Number(it.qty) || 0) * signo
        acc[nombre].monto += (Number(it.subtotal) || (Number(it.precioBase) || 0) * (Number(it.qty) || 0)) * signo
      })
    })
    return Object.values(acc).filter(p => p.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, 5)
  }, [ventas, hoyTxt])

  // Bitácora: lo que pasó hoy, en orden, con su hora
  const bitacora = useMemo(() => {
    const evs = []
    facturasHoy.forEach(f => {
      const anulada = f.estadoPago === 'anulada' || f.anulada
      const estado = anulada ? 'anulada' : f.dte_estado
      evs.push({
        id: 'f' + f.id, ts: f.createdAt?.seconds || 0, hora: horaDe(f),
        tono: anulada ? 'gris' : estado === 'PROCESADO' ? 'ok' : estado === 'RECHAZADO' ? 'malo' : 'oro',
        titulo: `${f.tipoDte || 'DTE'} ${f.numero || ''}`,
        cliente: f.cliente || 'Consumidor Final',
        detalle: anulada ? 'Anulada' :
          estado === 'PROCESADO' ? 'Sellada por el MH' :
          estado === 'RECHAZADO' ? `Rechazada por el MH${f.dte_mensaje ? ': ' + f.dte_mensaje : ''}` :
          estado === 'CONTINGENCIA' ? 'Emitida en contingencia · pendiente de transmitir' : 'Pendiente de transmitir',
        monto: montoNeto(f), accion: estado === 'RECHAZADO' || estado === 'PENDIENTE' ? 'Revisar' : null,
      })
    })
    if (cajaAbierta?.fechaApertura?.toDate) {
      evs.push({
        id: 'caja', ts: cajaAbierta.fechaApertura.seconds, tono: 'ok',
        hora: horaSV(cajaAbierta.fechaApertura),
        titulo: 'Caja abierta', cliente: cajaAbierta.cajeroNombre || '', detalle: 'Fondo inicial contado',
        monto: Number(cajaAbierta.montoInicial) || 0,
      })
    }
    ;(cajaAbierta?.movimientosEfectivo || []).forEach((m, i) => {
      evs.push({
        id: 'm' + i, ts: m.fecha ? Math.floor(new Date(m.fecha).getTime() / 1000) : 0, tono: 'oro',
        hora: m.fecha ? new Date(m.fecha).toLocaleTimeString('es-SV', { ...ZONA, hour: '2-digit', minute: '2-digit', hour12: false }) : '—',
        titulo: m.tipo === 'ingreso' ? 'Entrada de efectivo' : 'Salida de gaveta',
        cliente: m.usuario || '', detalle: m.motivo || m.concepto || 'Sin concepto',
        monto: (m.tipo === 'ingreso' ? 1 : -1) * (Number(m.monto) || 0),
      })
    })
    return evs.sort((a, b) => b.ts - a.ts).slice(0, 8)
  }, [facturasHoy, cajaAbierta])

  return (
    <>
      <style>{dashStyles}</style>

      {/* TOPBAR */}
      <div className="topbar dash-topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Resumen general en tiempo real 🔥</div>
        </div>
        <button className="btn btn-primary solo-desktop" onClick={() => navigate('/ventas')}>🛒 Nueva Venta</button>
      </div>

      {/* ══ INICIO EN TELÉFONO: ventas de hoy + 8 accesos + "Atención hoy" + últimas ventas ══ */}
      <div className="solo-movil dash-movil">
        <div className="dm-hero">
          <div className="dm-hero-lbl">Ventas de hoy</div>
          <div className="dm-hero-num">{loading ? '…' : fmt(totalHoy)}</div>
          {variacionAyer !== null && (
            <span className={`dm-hero-var ${variacionAyer >= 0 ? 'up' : 'down'}`}>{variacionAyer >= 0 ? '▲' : '▼'} {Math.abs(variacionAyer).toFixed(0)}% vs. ayer</span>
          )}
          <div className="dm-hero-mini">
            <div>Ventas<b>{ventasHoy.length}</b></div>
            <div>Ticket promedio<b>{fmt(ticketPromedio)}</b></div>
            <div>Por cobrar<b>{fmt(totalPendientes)}</b></div>
          </div>
        </div>

        <div className="dm-grid">
          {accesosMovil.map(item => (
            <div key={item.path} className="dm-acc" style={{ '--c': NAV_COLOR[item.icon] || 'var(--accent)' }} onClick={() => navigate(item.path)}>
              <div className="dm-acc-ico"><NavIcon name={item.icon} /></div>
              <span>{NOMBRE_CORTO[item.path] || item.label}</span>
            </div>
          ))}
        </div>
        {accesosDisponibles.length > 8 && (
          <button className="dm-vertodo" onClick={() => setTodosAccesos(v => !v)}>{todosAccesos ? 'Ver menos' : `Ver todo el menú (${accesosDisponibles.length})`}</button>
        )}

        <div className="dm-sec">Atención hoy</div>
        <div className="dm-aten">
          {stockAlertas.length > 0 ? (
            <div className="dm-av warn" onClick={() => navigate('/inventario')}>
              <b>{stockAlertas.length} producto{stockAlertas.length === 1 ? '' : 's'} con stock bajo</b>
              <span>{stockAlertas.slice(0, 3).map(p => p.nombre).join(', ')}{stockAlertas.length > 3 ? '…' : ''}</span>
            </div>
          ) : (
            <div className="dm-av ok"><b>Stock en orden</b><span>Ningún producto bajo el mínimo</span></div>
          )}
          {facturasVencidas.length > 0 && (
            <div className="dm-av bad" onClick={() => navigate('/facturas')}>
              <b>{facturasVencidas.length} factura{facturasVencidas.length === 1 ? '' : 's'} vencida{facturasVencidas.length === 1 ? '' : 's'} · {fmt(facturasVencidas.reduce((s, f) => s + (f.total || 0), 0))}</b>
              <span>{facturasVencidas.slice(0, 3).map(f => f.cliente).join(', ')}</span>
            </div>
          )}
          {contingenciaActiva ? (
            <div className="dm-av warn" onClick={() => navigate('/facturas')}><b>Contingencia activa</b><span>{dteSinTransmitir.length} DTE en cola para Hacienda</span></div>
          ) : dteSinTransmitir.length > 0 ? (
            <div className="dm-av warn" onClick={() => navigate('/facturas')}><b>{dteSinTransmitir.length} DTE sin transmitir</b><span>Revisá Facturas DTE</span></div>
          ) : (
            <div className="dm-av ok"><b>Hacienda al día</b><span>{dteProcesados} DTE procesados</span></div>
          )}
        </div>

        <div className="dm-sec">Últimas ventas <span className="dm-link" onClick={() => navigate('/facturas')}>Ver todas →</span></div>
        <div className="dm-lista">
          {facturas.length === 0 ? <div className="dm-vacio">Sin ventas todavía</div> : facturas.slice(0, 5).map(f => (
            <div key={f.id} className="dm-row">
              <div style={{ minWidth: 0 }}><b>{f.cliente}</b><small>{f.numero} · {f.fechaEmision}</small></div>
              <div className="dm-monto">{fmt(f.total)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="solo-desktop">

      {/* ── FRANJA DE ESTADO: lo primero que mira el dueño ── */}
      <div className="op-estado">
        <div className="op-marca">
          <div className="op-negocio">{nombreNegocio || 'Mi empresa'}</div>
        </div>

        <div className="op-item">
          <span className={`op-punto ${cajaAbierta ? '' : 'gris'}`} />
          <div><div className="op-et">Caja</div>
            <div className="op-va">{cajaAbierta ? `Abierta · ${(cajaAbierta.cajeroNombre || '').split(' ')[0] || '—'}` : 'Cerrada'}</div></div>
        </div>

        <div className="op-item">
          <span className={`op-punto ${estadoMH.punto}`} />
          <div><div className="op-et">Ministerio de Hacienda</div>
            <div className="op-va">
              {estadoMH.texto} · <span className={enProduccion ? 'op-prod' : 'op-pruebas'}>{enProduccion ? 'Producción' : 'PRUEBAS'}</span>
            </div></div>
        </div>

        <div className="op-item">
          <div><div className="op-et">Último DTE</div>
            <div className="op-va mono">{ultimoDTE ? `${horaDe(ultimoDTE)} · ${(ultimoDTE.numero || '').slice(-10)}` : 'Sin DTE hoy'}</div></div>
        </div>

        <div className="op-item op-reloj">
          <div><div className="op-et">{diaReloj}</div><div className="op-va mono">{horaReloj}</div></div>
        </div>

        <div className="op-acciones">
          <button className="op-btn-linea" onClick={() => navigate('/caja')}>{cajaAbierta ? 'Cerrar caja' : 'Abrir caja'}</button>
          <button className="op-btn-oro" onClick={() => navigate('/ventas')}>Nueva venta</button>
        </div>
      </div>

      <div className="op-grid">
        {/* ── HOY ── */}
        <section className="op-panel">
          <div className="op-panel-tit">
            <h2>Hoy · {ahora.toLocaleDateString('es-SV', { ...ZONA, weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            <span className="op-enlace" onClick={() => navigate('/reportes')}>Ver reportes →</span>
          </div>

          <div className="op-hoy">
            <div className="op-monto mono">
              {loading ? '···' : fmt(totalHoy)}
              {variacionAyer !== null && (
                <span className={`op-delta ${variacionAyer >= 0 ? '' : 'baja'}`}>
                  {variacionAyer >= 0 ? '▲' : '▼'} {Math.abs(variacionAyer).toFixed(0)}% vs. ayer
                </span>
              )}
            </div>
            <div className="op-sub">
              {ventasHoy.length} ventas · {facturasHoy.length} DTE emitidos
              {ticketPromedio > 0 && ` · ticket promedio ${fmt(ticketPromedio)}`}
            </div>

            <div style={{ marginTop: 10 }}>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={serie14} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="opArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.30} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={52} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="total" stroke="var(--accent)" strokeWidth={2.4} fill="url(#opArea)" dot={false} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="op-medios">
            {[
              { et: 'Efectivo', v: mediosHoy.efectivo },
              { et: 'Tarjeta / transferencia', v: mediosHoy.tarjeta + mediosHoy.transferencia + mediosHoy.cheque },
              { et: 'Crédito', v: mediosHoy.credito },
            ].map((m, i) => {
              const base = mediosHoy.efectivo + mediosHoy.tarjeta + mediosHoy.transferencia + mediosHoy.cheque + mediosHoy.credito
              return (
                <div key={m.et} className="op-medio">
                  <div className="op-et">{m.et}</div>
                  <div className="op-medio-va mono">{fmt(m.v)}</div>
                  <div className="op-barra"><i className={`c${i}`} style={{ width: base > 0 ? `${(m.v / base) * 100}%` : '0%' }} /></div>
                </div>
              )
            })}
          </div>

          <div className="op-mes">
            <span>Mes: <b className="mono">{fmt(totalVentas)}</b> · {ventasMes.length} ventas · {totalDTEs} DTE</span>
            <span className="op-mes-sep" />
            <span>Por cobrar: <b className="mono">{fmt(totalPendientes)}</b></span>
          </div>
        </section>

        {/* ── REQUIERE ACCIÓN + CAJA ── */}
        <div className="op-col">
          <section className="op-panel">
            <div className="op-panel-tit"><h2>Requiere acción</h2></div>
            {[
              { n: dteSinTransmitir.length, tono: 'malo', t: 'DTE sin transmitir al MH', d: 'Se transmiten desde Facturas DTE', ir: '/facturas' },
              { n: stockAlertas.length, tono: 'alerta', t: 'Productos en stock bajo', d: `${stockAlertas.filter(p => p.stock === 0).length} agotados`, ir: '/inventario' },
              { n: facturasVencidas.length, tono: 'alerta', t: 'Facturas de crédito vencidas', d: `${fmt(facturasVencidas.reduce((s, f) => s + saldoFactura(f), 0))} por cobrar`, ir: '/facturas' },
            ].filter(a => a.n > 0).map(a => (
              <div key={a.t} className="op-accion" onClick={() => navigate(a.ir)}>
                <div className={`op-num ${a.tono}`}>{a.n}</div>
                <div><div className="op-accion-t">{a.t}</div><div className="op-accion-d">{a.d}</div></div>
                <div className="op-fl">›</div>
              </div>
            ))}
            {dteSinTransmitir.length === 0 && stockAlertas.length === 0 && facturasVencidas.length === 0 && (
              <div className="op-vacio">✅ Todo al día: sin DTE pendientes, sin stock bajo y sin facturas vencidas.</div>
            )}
          </section>

          <section className="op-panel">
            <div className="op-panel-tit">
              <h2>Caja de hoy</h2>
              <span className="op-enlace" onClick={() => navigate('/caja')}>Ir a Caja →</span>
            </div>
            {cajaAbierta && cajaCalc ? (
              <div className="op-caja">
                <div className="op-caja-fila"><span>Fondo inicial</span><b className="mono">{fmt(Number(cajaAbierta.montoInicial) || 0)}</b></div>
                <div className="op-caja-fila"><span>Ventas en efectivo</span><b className="mono">{fmt(cajaCalc.efectivo)}</b></div>
                <div className="op-caja-fila"><span>Entradas / salidas</span><b className="mono">{fmt(cajaCalc.ingresos - cajaCalc.totalRetiros)}</b></div>
                <div className="op-caja-tot"><span>Debe haber en gaveta</span><b className="mono">{fmt(cajaCalc.montoEsperado)}</b></div>
              </div>
            ) : (
              <div className="op-vacio">
                No hay caja abierta. Abrila antes de empezar a cobrar para que el cierre cuadre.
                <div style={{ marginTop: 10 }}><button className="btn btn-primary btn-sm" onClick={() => navigate('/caja')}>Abrir caja</button></div>
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="op-grid" style={{ marginTop: 18 }}>
        {/* ── BITÁCORA ── */}
        <section className="op-panel">
          <div className="op-panel-tit">
            <h2>Bitácora de hoy</h2>
            <span className="op-enlace" onClick={() => navigate('/facturas')}>Ver todo →</span>
          </div>
          {bitacora.length === 0 ? (
            <div className="op-vacio">Todavía no hay movimientos hoy. Aparecerán aquí conforme se vaya vendiendo.</div>
          ) : bitacora.map(e => (
            <div key={e.id} className="op-evento">
              <div className="op-hora mono">{e.hora}</div>
              <div className={`op-mark ${e.tono}`} />
              <div style={{ minWidth: 0 }}>
                <div className="op-ev-t"><b>{e.titulo}</b>{e.cliente ? ` · ${e.cliente}` : ''}</div>
                <div className="op-ev-d">{e.detalle}</div>
              </div>
              {e.accion
                ? <button className="op-ev-btn" onClick={() => navigate('/facturas')}>{e.accion}</button>
                : <div className="op-ev-m mono">{e.monto < 0 ? `−${fmt(Math.abs(e.monto))}` : fmt(e.monto)}</div>}
            </div>
          ))}
        </section>

        {/* ── MÁS VENDIDOS HOY + REPONER ── */}
        <div className="op-col">
          <section className="op-panel">
            <div className="op-panel-tit">
              <h2>Más vendidos hoy</h2>
              <span className="op-enlace" onClick={() => navigate('/reportes')}>Reportes →</span>
            </div>
            {topHoy.length === 0 ? (
              <div className="op-vacio">Sin ventas hoy todavía.</div>
            ) : topHoy.map((p, i) => {
              const tope = topHoy[0].qty || 1
              return (
                <div key={p.nombre} className="op-top">
                  <div className="op-top-pos mono">{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="op-top-n" title={p.nombre}>{p.nombre}</div>
                    <div className="op-barra"><i className="c0" style={{ width: `${(p.qty / tope) * 100}%` }} /></div>
                  </div>
                  <div className="op-top-q">
                    <b className="mono">{p.qty}</b>
                    <small className="mono">{fmt(p.monto)}</small>
                  </div>
                </div>
              )
            })}
          </section>

          <section className="op-panel">
            <div className="op-panel-tit">
              <h2>Reponer pronto</h2>
              <span className="op-enlace" onClick={() => navigate('/inventario')}>Inventario →</span>
            </div>
            {stockAlertas.length === 0 ? (
              <div className="op-vacio">✅ Todo el stock está en niveles normales.</div>
            ) : stockAlertas.slice(0, 4).map(p => (
              <div key={p.id} className="op-stock" onClick={() => navigate('/inventario')}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="op-top-n">{p.nombre}</div>
                  <div className="op-ev-d mono">{p.stock} de {p.min} mín.</div>
                </div>
                <div className="op-barra chico"><i className={p.stock === 0 ? 'malo' : 'alerta'} style={{ width: `${Math.min(100, ((p.min - p.stock) / (p.min || 1)) * 100)}%` }} /></div>
              </div>
            ))}
          </section>
        </div>
      </div>

      </div>{/* fin .solo-desktop */}

    </>
  )
}