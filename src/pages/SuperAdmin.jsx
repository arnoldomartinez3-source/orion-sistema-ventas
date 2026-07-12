import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, addDoc, onSnapshot, doc, getDoc, updateDoc, setDoc, serverTimestamp, query, orderBy, where } from 'firebase/firestore'
import { useAuth } from '../AuthContext'
import { extraerClavePEM } from '../utils/certificado'
import { esUsuarioMaestro } from '../data/certificacionConfig'
import SelectorDepartamento from '../components/SelectorDepartamento'
import BuscadorActividad from '../components/BuscadorActividad'
import { buildComplemento } from '../data/departamentosMunicipios'
import { MODULOS } from '../data/modulos'

// ══════════════════════════════════════════════════════════════
// PANEL ONE GEO — Registro y gestión de empresas (multi-empresa)
//
// Acceso EXCLUSIVO del usuario maestro de One Geo (esUsuarioMaestro).
// No depende del flag modoCertificacion: el registro de empresas es una
// herramienta permanente de la plataforma, no algo temporal por cliente.
// ══════════════════════════════════════════════════════════════

const PLANES = ['basico', 'premium']

// Estado inicial del formulario
const FORM_VACIO = {
  nit: '', nrc: '', nombre: '', nombreComercial: '',
  codActividad: '', descActividad: '',
  codDep: '', codMun: '', distrito: '', codDistrito: '', complemento: '',
  telefono: '', correo: '',
  codEstable: '0001', codPuntoVenta: '1',
  plan: 'basico', activa: true,
  logo: '',
  // Perillas controladas solo por One Geo (super-admin)
  esDemo: false,
  esPruebas: false, // empresa de pruebas/certificación (ambiente 00): permite reusar el NIT
  asistenteCertificacionActivo: false,
  maxSucursales: 1,
  maxUsuarios: 3,
}

// Sucursales: One Geo las gestiona (el cliente solo las ve). Form vacío.
const TIPOS_DTE_CORRELATIVOS = ['FE', 'CCF', 'NC', 'ND', 'FEX']
// Correlativos iniciales (migración desde otro sistema): tipo de DTE → código MH
// usado en el id del contador `{codigo}_{codEstableMH}_{codPuntoVentaMH}_{ambiente}`.
const TIPOS_DTE_CODIGO_MH = [
  { code: '01', label: 'Factura (FE)' },
  { code: '03', label: 'Crédito Fiscal (CCF)' },
  { code: '05', label: 'Nota de Crédito (NC)' },
  { code: '06', label: 'Nota de Débito (ND)' },
  { code: '11', label: 'Factura de Exportación (FEX)' },
  { code: '04', label: 'Nota de Remisión (NR)' },
  { code: '14', label: 'Sujeto Excluido (FSE)' },
]
const SUC_VACIA = {
  nombre: '', codEstablecimiento: '', codPuntoVenta: '',
  codEstableMH: '', codPuntoVentaMH: '',
  codDep: '', codMun: '', distrito: '', codDistrito: '', complemento: '',
  telefono: '', responsable: '', activa: true,
}

const styles = `
  .sa-wrap { max-width: 1100px; margin: 0 auto; padding: 4px 0 40px; }
  .sa-error { display: block; font-size: 11px; color: var(--danger); margin-top: 4px; font-weight: 600; }
  .sa-cols { display: grid; grid-template-columns: 1fr; gap: 18px; align-items: start; }
  @media (min-width: 900px) { .sa-cols { grid-template-columns: 1.4fr 1fr; } }
  .sa-col-lista { position: sticky; top: 12px; }
  @media (max-width: 899px) { .sa-col-lista { position: static; } }
  .sa-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
  .sa-head-icon { width: 42px; height: 42px; border-radius: 12px; background: rgba(74,143,232,0.14); border: 1.5px solid rgba(74,143,232,0.3); display: flex; align-items: center; justify-content: center; color: var(--accent); flex-shrink: 0; }
  .sa-head-icon svg { width: 22px; height: 22px; }
  .sa-title { font-size: 19px; font-weight: 800; color: var(--text); letter-spacing: -0.4px; }
  .sa-sub { font-size: 13px; color: var(--muted); margin-top: 1px; }

  .sa-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; padding: 22px; box-shadow: 0 4px 20px var(--shadow2); }
  .sa-card + .sa-card { margin-top: 16px; }
  .sa-section-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; margin: 0 0 10px; }
  .sa-section + .sa-section { margin-top: 20px; }

  .sa-grid { display: grid; gap: 12px; }
  .sa-g2 { grid-template-columns: 1fr 1fr; }
  .sa-g3 { grid-template-columns: 1fr 1fr 1fr; }
  .sa-g-actividad { grid-template-columns: 1fr 2fr; }
  .sa-full { grid-column: 1 / -1; }
  @media (max-width: 640px) { .sa-g2, .sa-g3, .sa-g-actividad { grid-template-columns: 1fr; } }

  .sa-field label { display: block; font-size: 12px; color: var(--muted); font-weight: 600; margin-bottom: 4px; }
  .sa-field input, .sa-field select {
    width: 100%; padding: 9px 11px; border-radius: 9px; font-size: 14px;
    background: var(--surface2); border: 1.5px solid var(--border); color: var(--text);
    transition: border-color 0.15s; box-sizing: border-box;
  }
  .sa-field input:focus, .sa-field select:focus { outline: none; border-color: var(--accent); }

  /* Correlativos iniciales (migración) */
  .sa-corr-lista { border: 1.5px solid var(--border); border-radius: 12px; overflow: hidden; margin-top: 8px; }
  .sa-corr-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; }
  .sa-corr-row + .sa-corr-row { border-top: 1px solid var(--border); }
  .sa-corr-head { background: var(--surface2); }
  .sa-corr-head span { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
  .sa-corr-label { flex: 1; font-size: 13px; font-weight: 600; color: var(--text); }
  .sa-corr-input { width: 150px; padding: 8px 11px; border-radius: 9px; font-size: 14px; font-family: var(--mono); text-align: right; background: var(--surface); border: 1.5px solid var(--border); color: var(--text); box-sizing: border-box; transition: border-color 0.15s; }
  .sa-corr-input:focus { outline: none; border-color: var(--accent); }
  .sa-corr-prox { width: 120px; text-align: right; font-size: 13px; font-weight: 800; font-family: var(--mono); color: var(--accent); }
  .sa-corr-prox.vacio { color: var(--muted); font-weight: 400; }

  /* Logo */
  .sa-logo-row { display: flex; align-items: center; gap: 16px; }
  .sa-logo-box { width: 80px; height: 80px; border-radius: 14px; border: 2px dashed var(--border2); background: var(--surface2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; color: var(--muted); }
  .sa-logo-box img { width: 100%; height: 100%; object-fit: contain; }
  .sa-logo-box svg { width: 30px; height: 30px; }
  .sa-logo-info { flex: 1; min-width: 0; }
  .sa-btn-file { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 9px; background: var(--surface3); border: 1.5px solid var(--border); color: var(--text); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  .sa-btn-file:hover { border-color: var(--accent); }
  .sa-btn-file svg { width: 16px; height: 16px; }
  .sa-logo-hint { font-size: 11px; color: var(--muted); margin-top: 6px; }

  .sa-btn-guardar {
    width: 100%; margin-top: 20px; padding: 12px; border-radius: 11px; border: none;
    background: linear-gradient(135deg, var(--accent), var(--accent-dark)); color: white;
    font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.15s;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .sa-btn-guardar:hover { transform: translateY(-1px); box-shadow: 0 8px 24px var(--glow); }
  .sa-btn-guardar:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
  .sa-btn-guardar svg { width: 17px; height: 17px; }

  /* Lista */
  .sa-list-title { font-size: 13px; color: var(--muted); font-weight: 600; margin: 24px 0 10px; }
  .sa-emp { background: var(--surface); border: 1.5px solid var(--border); border-radius: 13px; padding: 13px 15px; display: flex; align-items: center; gap: 13px; }
  .sa-emp + .sa-emp { margin-top: 8px; }
  .sa-emp-logo { width: 42px; height: 42px; border-radius: 10px; background: var(--surface2); border: 1.5px solid var(--border); display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; color: var(--muted); }
  .sa-emp-logo img { width: 100%; height: 100%; object-fit: contain; }
  .sa-emp-logo svg { width: 20px; height: 20px; }
  .sa-emp-info { flex: 1; min-width: 0; }
  .sa-emp-nombre { font-size: 14px; font-weight: 700; color: var(--text); }
  .sa-emp-meta { font-size: 12px; color: var(--muted); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sa-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; flex-shrink: 0; cursor: pointer; border: none; }
  .sa-badge.activa { background: rgba(34,197,94,0.15); color: #16a34a; }
  .sa-badge.suspendida { background: rgba(239,68,68,0.15); color: #dc2626; }

  .sa-msg { padding: 11px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; margin-bottom: 14px; }
  .sa-msg.ok { background: rgba(34,197,94,0.12); color: #16a34a; }
  .sa-msg.err { background: rgba(239,68,68,0.12); color: #dc2626; }

  /* Tanda 2: título form, buscador, fecha, acciones */
  .sa-form-titulo { font-size: 15px; font-weight: 800; color: var(--text); margin-bottom: 16px; letter-spacing: -0.3px; }
  .sa-buscador {
    width: 100%; padding: 9px 12px; border-radius: 10px; font-size: 13px; margin-bottom: 12px;
    background: var(--surface2); border: 1.5px solid var(--border); color: var(--text); box-sizing: border-box;
  }
  .sa-buscador:focus { outline: none; border-color: var(--accent); }
  .sa-emp.editando { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(74,143,232,0.12); }
  .sa-emp-fecha { font-size: 11px; color: var(--muted); margin-top: 3px; }
  .sa-emp-acciones { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; flex-shrink: 0; }
  .sa-btn-editar {
    display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700;
    padding: 4px 10px; border-radius: 8px; cursor: pointer;
    background: var(--surface3); border: 1.5px solid var(--border); color: var(--text); transition: all 0.15s;
  }
  .sa-btn-editar:hover { border-color: var(--accent); color: var(--accent); }
  .sa-btn-editar svg { width: 13px; height: 13px; }
  .sa-btn-cancelar {
    padding: 12px 18px; border-radius: 11px; cursor: pointer; font-size: 14px; font-weight: 700;
    background: var(--surface3); border: 1.5px solid var(--border); color: var(--text); transition: all 0.15s;
  }
  .sa-btn-cancelar:hover { border-color: var(--danger); color: var(--danger); }

  .sa-denegado { max-width: 440px; margin: 60px auto; text-align: center; color: var(--muted); }
  .sa-denegado svg { width: 48px; height: 48px; color: var(--danger); margin-bottom: 12px; }

  /* ══ REDISEÑO: tarjetas expandibles + acciones + modales ══ */
  .sa-topbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  .sa-btn-nueva {
    display: inline-flex; align-items: center; gap: 7px; padding: 10px 16px; border-radius: 11px; border: none;
    background: linear-gradient(135deg, var(--accent), var(--accent-dark)); color: #fff; font-size: 14px; font-weight: 700; cursor: pointer;
    transition: all 0.15s; flex-shrink: 0;
  }
  .sa-btn-nueva:hover { transform: translateY(-1px); box-shadow: 0 8px 24px var(--glow); }
  .sa-btn-nueva svg { width: 16px; height: 16px; }
  .sa-topbar .sa-buscador { flex: 1; min-width: 200px; margin-bottom: 0; }

  /* Métricas globales */
  .sa-metricas { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  @media (max-width: 640px) { .sa-metricas { grid-template-columns: repeat(2, 1fr); } }
  .sa-metrica { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 11px; padding: 13px 15px; }
  .sa-metrica.m-empresas { background: rgba(55,138,221,0.10); border-color: rgba(55,138,221,0.35); }
  .sa-metrica.m-empresas .sa-metrica-valor { color: #2563eb; }
  .sa-metrica.m-activas { background: rgba(34,197,94,0.10); border-color: rgba(34,197,94,0.35); }
  .sa-metrica.m-activas .sa-metrica-valor { color: #16a34a; }
  .sa-metrica.m-suspendidas { background: rgba(239,68,68,0.10); border-color: rgba(239,68,68,0.35); }
  .sa-metrica.m-suspendidas .sa-metrica-valor { color: #dc2626; }
  .sa-metrica.m-demo { background: rgba(168,85,247,0.10); border-color: rgba(168,85,247,0.35); }
  .sa-metrica.m-demo .sa-metrica-valor { color: #a855f7; }
  .sa-metrica-label { font-size: 12px; color: var(--muted); font-weight: 600; }
  .sa-metrica-valor { font-size: 23px; font-weight: 800; color: var(--text); margin-top: 2px; letter-spacing: -0.5px; }

  /* Tarjeta de empresa (cabecera clickeable) */
  .sa-emp-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 14px; margin-bottom: 10px; overflow: hidden; transition: border-color 0.15s; }
  .sa-emp-card.abierta { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(74,143,232,0.10); }
  .sa-emp-cab { display: flex; align-items: center; gap: 13px; padding: 14px 16px; cursor: pointer; }
  .sa-emp-cab:hover { background: var(--surface2); }
  .sa-emp-badges { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 4px; }
  .sa-tag { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; }
  .sa-tag.demo { background: rgba(168,85,247,0.15); color: #a855f7; }
  .sa-tag.cert { background: rgba(245,158,11,0.15); color: #d97706; }
  .sa-tag.estado-activa { background: rgba(34,197,94,0.15); color: #16a34a; }
  .sa-tag.estado-susp { background: rgba(239,68,68,0.15); color: #dc2626; }
  .sa-chevron { color: var(--muted); transition: transform 0.2s; flex-shrink: 0; }
  .sa-chevron svg { width: 18px; height: 18px; }
  .sa-emp-card.abierta .sa-chevron { transform: rotate(180deg); }

  /* Zona de acciones (al expandir) */
  .sa-acciones { padding: 16px; background: var(--surface2); border-top: 1.5px solid var(--border); }
  .sa-acciones-titulo { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; margin: 0 0 12px; }
  .sa-acc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  @media (max-width: 640px) { .sa-acc-grid { grid-template-columns: repeat(2, 1fr); } }
  .sa-acc-btn {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
    background: var(--surface); border: 1.5px solid var(--border); border-radius: 13px; padding: 14px 8px;
    cursor: pointer; transition: all 0.15s; font-family: inherit; color: var(--text); min-height: 86px; text-align: center;
  }
  .sa-acc-btn:hover:not(:disabled) { box-shadow: 0 0 0 2px currentColor, 0 4px 14px rgba(0,0,0,0.10); }
  .sa-acc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .sa-acc-btn svg { width: 22px; height: 22px; }
  .sa-acc-titulo { font-size: 13px; font-weight: 700; line-height: 1.2; }
  .sa-acc-desc { font-size: 10px; color: var(--muted); line-height: 1.2; }
  .sa-acc-btn.acc-editar { color: #378ADD; }
  .sa-acc-btn.acc-config { color: #7F77DD; }
  .sa-acc-btn.acc-admin { color: #1D9E75; }
  .sa-acc-btn.acc-estado { color: #BA7517; }
  .sa-acc-btn.acc-suspender { color: #E24B4A; }
  .sa-acc-btn.acc-asistente { color: #d97706; }
  .sa-acc-btn.acc-asistente.activo { background: rgba(245,158,11,0.12); border-color: #d97706; box-shadow: 0 0 0 2px rgba(245,158,11,0.4); }
  .sa-acc-btn.acc-demo { color: #a855f7; }
  .sa-acc-btn.acc-demo.activo { background: rgba(168,85,247,0.12); border-color: #a855f7; box-shadow: 0 0 0 2px rgba(168,85,247,0.4); }
  .sa-acc-estado-txt { font-size: 10px; font-weight: 800; }
  .sa-acc-estado-txt.on { color: #16a34a; }
  .sa-acc-estado-txt.off { color: var(--muted); }

  /* Modales responsivos: horizontal en escritorio, vertical en móvil */
  .sa-modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000;
    display: flex; align-items: center; justify-content: center; padding: 20px;
  }
  .sa-modal {
    background: var(--surface); border-radius: 18px; border: 1.5px solid var(--border);
    width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }
  .sa-modal-sm { max-width: 560px; }
  .sa-modal-lg { max-width: 960px; }
  .sa-modal-cab { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1.5px solid var(--border); position: sticky; top: 0; background: var(--surface); z-index: 1; }
  .sa-modal-titulo { font-size: 16px; font-weight: 800; color: var(--text); }
  .sa-modal-x { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 24px; line-height: 1; padding: 0 4px; }
  .sa-modal-x:hover { color: var(--text); }
  .sa-modal-body { padding: 22px; }
  .sa-modal-footer { display: flex; gap: 10px; padding: 16px 22px; border-top: 1.5px solid var(--border); position: sticky; bottom: 0; background: var(--surface); }

  /* Grid horizontal del formulario en escritorio (2 columnas), vertical en móvil */
  .sa-modal-cols { display: grid; grid-template-columns: 1fr; gap: 20px; }
  @media (min-width: 760px) { .sa-modal-cols { grid-template-columns: 1fr 1fr; } }
  .sa-modal-cols .sa-full-modal { grid-column: 1 / -1; }
  /* Filas de administradores */
  .sa-admin-row { display: flex; align-items: center; gap: 12px; background: var(--surface2); border: 1.5px solid var(--border); border-radius: 12px; padding: 12px 14px; flex-wrap: wrap; }
  .sa-admin-info { flex: 1; min-width: 180px; }
  .sa-admin-nombre { font-size: 14px; font-weight: 700; color: var(--text); display: flex; align-items: center; flex-wrap: wrap; }
  .sa-admin-email { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .sa-admin-acciones { display: flex; gap: 6px; flex-wrap: wrap; }
  .sa-admin-btn { font-size: 12px; font-weight: 600; padding: 6px 11px; border-radius: 8px; cursor: pointer; background: var(--surface3); border: 1.5px solid var(--border); color: var(--text); transition: all 0.15s; }
  .sa-admin-btn:hover { border-color: var(--accent); color: var(--accent); }
  .sa-admin-btn.peligro:hover { border-color: var(--danger); color: var(--danger); }
  /* Dentro del modal, los sub-grids de 2 columnas pasan a 1 para no apretarse en media columna */
  @media (min-width: 760px) { .sa-modal-cols .sa-section:not(.sa-full-modal) .sa-g2 { grid-template-columns: 1fr; } }
`

// Íconos SVG inline
const Ico = ({ d, paths }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {paths || <path d={d} />}
  </svg>
)
const IcoTienda = () => <Ico paths={<><path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M4 21v-7h6v7" /></>} />
const IcoUpload = () => <Ico paths={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></>} />
const IcoImg = () => <Ico paths={<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></>} />
const IcoPlus = () => <Ico paths={<><path d="M12 5v14M5 12h14" /></>} />
const IcoLock = () => <Ico paths={<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>} />
const IcoEditar = () => <Ico paths={<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></>} />
const IcoConfig = () => <Ico paths={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>} />
const IcoAdmin = () => <Ico paths={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>} />
const IcoChevron = () => <Ico paths={<><path d="M6 9l6 6 6-6" /></>} />
const IcoPausa = () => <Ico paths={<><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>} />
const IcoPlay = () => <Ico paths={<><path d="M5 3l14 9-14 9V3z" /></>} />
const IcoCertif = () => <Ico paths={<><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></>} />

// Comprime una imagen a máx 400px de ancho y devuelve base64 (controla peso/costo)
function comprimirImagen(file, maxW = 400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const escala = Math.min(1, maxW / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = img.width * escala
        canvas.height = img.height * escala
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png', 0.85))
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Validaciones de NIT/NRC (mismo criterio que Clientes.jsx) ──
function validarNit(nit) {
  const limpio = (nit || '').replace(/[-\s]/g, '')
  if (!limpio) return 'El NIT es obligatorio.'
  // El MH acepta dos formatos: NIT de 14 dígitos o DUI de 9 dígitos (persona natural).
  if (!/^\d{14}$/.test(limpio) && !/^\d{9}$/.test(limpio)) return 'El NIT debe tener 14 dígitos (0614-010190-101-3) o 9 dígitos (DUI).'
  return null
}
function validarNrc(nrc) {
  const limpio = (nrc || '').replace(/[-\s]/g, '')
  if (!limpio) return null // NRC es opcional
  if (!/^\d+$/.test(limpio)) return 'El NRC solo debe tener números.'
  if (limpio.length > 8) return 'El NRC no debe superar 8 dígitos.'
  return null
}

export default function SuperAdmin() {
  const { user } = useAuth()
  const [form, setForm] = useState(FORM_VACIO)
  const [empresas, setEmpresas] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [errores, setErrores] = useState({})
  const [editandoId, setEditandoId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [expandida, setExpandida] = useState(null)       // empresa con acciones desplegadas
  const [modalForm, setModalForm] = useState(false)      // modal de alta/edición
  const [modalConfig, setModalConfig] = useState(null)   // empresa cuya config/límites se edita
  const [modalMH, setModalMH] = useState(null)           // empresa cuya conexión MH / certificado se edita
  const [mhGuardando, setMhGuardando] = useState(false)
  const [mhMsg, setMhMsg] = useState(null)
  const [modalAdmin, setModalAdmin] = useState(null)     // empresa cuyos admins se gestionan
  const [adminForm, setAdminForm] = useState({ nombre: '', email: '', password: '' })
  const [creandoAdmin, setCreandoAdmin] = useState(false)
  const [adminMsg, setAdminMsg] = useState(null)
  const [cfgGuardando, setCfgGuardando] = useState(false)
  const [adminsLista, setAdminsLista] = useState([])     // admins de la empresa abierta
  const [adminsCargando, setAdminsCargando] = useState(false)
  const [adminVista, setAdminVista] = useState('lista')  // 'lista' | 'crear' | 'correo' | 'clave'
  const [adminSel, setAdminSel] = useState(null)         // admin seleccionado para editar
  const [adminCampo, setAdminCampo] = useState('')       // valor del campo (correo o clave nueva)
  const [adminAccion, setAdminAccion] = useState(false)  // procesando una acción
  // Gestión de sucursales de una empresa (panel One Geo)
  const [modalSucursales, setModalSucursales] = useState(null) // empresa cuyas sucursales se gestionan
  const [sucursalesLista, setSucursalesLista] = useState([])
  const [sucVista, setSucVista] = useState('lista')      // 'lista' | 'form'
  const [sucForm, setSucForm] = useState(SUC_VACIA)
  const [sucEditandoId, setSucEditandoId] = useState(null)
  const [sucGuardando, setSucGuardando] = useState(false)
  const [sucMsg, setSucMsg] = useState(null)
  // Correlativos iniciales (migración) de una sucursal
  const [sucCorrSuc, setSucCorrSuc] = useState(null)       // sucursal seleccionada
  const [sucCorrAmbiente, setSucCorrAmbiente] = useState('01')
  const [sucCorrForm, setSucCorrForm] = useState({})        // { '01': '150', '03': '...' }
  const [sucCorrGuardando, setSucCorrGuardando] = useState(false)

  // Suscripción a la lista de empresas
  useEffect(() => {
    if (!esUsuarioMaestro(user)) return
    const q = query(collection(db, 'empresas'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setEmpresas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, err => console.warn('Error cargando empresas:', err?.message))
    return () => unsub()
  }, [user])

  // Suscripción a las sucursales de la empresa abierta en el modal
  useEffect(() => {
    if (!modalSucursales) { setSucursalesLista([]); return }
    const unsub = onSnapshot(
      query(collection(db, 'sucursales'), where('empresaId', '==', modalSucursales.id)),
      snap => setSucursalesLista(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.warn('Error cargando sucursales:', err?.message)
    )
    return () => unsub()
  }, [modalSucursales])

  // ── CANDADO: solo el maestro de One Geo entra ──
  if (!esUsuarioMaestro(user)) {
    return (
      <>
        <style>{styles}</style>
        <div className="sa-denegado">
          <IcoLock />
          <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Acceso restringido</p>
          <p>Este panel es exclusivo de One Geo Systems.</p>
        </div>
      </>
    )
  }

  const set = (campo, valor) => {
    setForm(f => ({ ...f, [campo]: valor }))
    if (errores[campo]) setErrores(e => ({ ...e, [campo]: null }))
  }

  const onLogo = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const base64 = await comprimirImagen(file)
      set('logo', base64)
    } catch {
      setMsg({ tipo: 'err', texto: 'No se pudo procesar la imagen.' })
    }
  }

  const registrar = async () => {
    // Validación con mensajes por campo
    const errNit = validarNit(form.nit)
    const errNrc = validarNrc(form.nrc)
    const errNombre = !form.nombre.trim() ? 'La razón social es obligatoria.' : null
    // Evitar NIT duplicado entre empresas (excluye la que se está editando).
    const nitLimpio = form.nit.replace(/[-\s]/g, '')
    // Las empresas de pruebas/certificación pueden reusar un NIT ya registrado
    // (el MH trata prueba y producción como ambientes separados del mismo contribuyente).
    const errDupNit = (!errNit && !form.esPruebas && nitLimpio && empresas.some(e => e.id !== editandoId && !e.esPruebas && (e.nit || '').replace(/[-\s]/g, '') === nitLimpio))
      ? 'Ya existe una empresa registrada con este NIT.'
      : null
    const nuevosErrores = {}
    if (errNit || errDupNit) nuevosErrores.nit = errNit || errDupNit
    if (errNrc) nuevosErrores.nrc = errNrc
    if (errNombre) nuevosErrores.nombre = errNombre
    setErrores(nuevosErrores)
    if (Object.keys(nuevosErrores).length > 0) {
      setMsg({ tipo: 'err', texto: 'Revisá los campos marcados en rojo.' })
      return
    }
    setGuardando(true)
    setMsg(null)
    try {
      const direccion = buildComplemento(form.distrito, form.complemento)
      const datos = {
        ...form,
        nit: form.nit.replace(/[-\s]/g, ''),
        nrc: form.nrc.replace(/[-\s]/g, ''),
        direccion,
      }
      // Datos fiscales que el DTE lee desde 'configuracion'. Los carga One Geo, NO
      // el cliente (su página de Configuración solo edita campos cosméticos).
      // merge:true preserva: cosméticos del cliente, códigos MH (se llenan al
      // certificar) y los secretos MH / certificado.
      const datosFiscalesConfig = {
        empresaNombre: form.nombre,
        nombreComercial: form.nombreComercial || '',
        nit: datos.nit,
        nrc: datos.nrc,
        codActividad: form.codActividad || '',
        descActividad: form.descActividad || '',
        codDep: form.codDep || '',
        codMun: form.codMun || '',
        distrito: form.distrito || '',
        codDistrito: form.codDistrito || '',
        complemento: form.complemento || '',
        direccion,
        telefono: form.telefono || '',
        correo: form.correo || '',
        codEstable: form.codEstable || '',
        codPuntoVenta: form.codPuntoVenta || '',
      }
      if (editandoId) {
        // EDITAR: actualiza la empresa y sincroniza sus datos fiscales en configuracion
        await updateDoc(doc(db, 'empresas', editandoId), { ...datos, updatedAt: serverTimestamp(), updatedBy: user.email })
        await setDoc(doc(db, 'configuracion', editandoId), { ...datosFiscalesConfig, updatedAt: serverTimestamp() }, { merge: true })
        setMsg({ tipo: 'ok', texto: `Empresa "${form.nombreComercial || form.nombre}" actualizada correctamente.` })
      } else {
        // CREAR: la empresa y su configuración fiscal inicial (mismo id = empresaId)
        const ref = await addDoc(collection(db, 'empresas'), { ...datos, createdAt: serverTimestamp(), createdBy: user.email })
        await setDoc(doc(db, 'configuracion', ref.id), { ...datosFiscalesConfig, updatedAt: serverTimestamp() }, { merge: true })
        setMsg({ tipo: 'ok', texto: `Empresa "${form.nombreComercial || form.nombre}" registrada correctamente.` })
      }
      setForm(FORM_VACIO)
      setErrores({})
      setEditandoId(null)
      setModalForm(false)
    } catch (err) {
      setMsg({ tipo: 'err', texto: 'Error al guardar: ' + (err?.message || 'desconocido') })
    } finally {
      setGuardando(false)
    }
  }

  // Cargar una empresa en el formulario para editarla
  const editar = (emp) => {
    setEditandoId(emp.id)
    setForm({
      nit: emp.nit || '', nrc: emp.nrc || '', nombre: emp.nombre || '', nombreComercial: emp.nombreComercial || '',
      codActividad: emp.codActividad || '', descActividad: emp.descActividad || '',
      codDep: emp.codDep || '', codMun: emp.codMun || '', distrito: emp.distrito || '', codDistrito: emp.codDistrito || '',
      complemento: emp.complemento || '',
      telefono: emp.telefono || '', correo: emp.correo || '',
      codEstable: emp.codEstable || '0001', codPuntoVenta: emp.codPuntoVenta || '1',
      plan: emp.plan || 'basico', activa: emp.activa !== false, logo: emp.logo || '',
      esDemo: emp.esDemo === true,
      esPruebas: emp.esPruebas === true,
      asistenteCertificacionActivo: emp.asistenteCertificacionActivo === true,
      maxSucursales: emp.maxSucursales ?? 1,
      maxUsuarios: emp.maxUsuarios ?? 3,
    })
    setErrores({})
    setMsg(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Cancelar edición y limpiar formulario
  const cancelarEdicion = () => {
    setEditandoId(null)
    setForm(FORM_VACIO)
    setErrores({})
    setMsg(null)
  }

  const toggleEstado = async (emp) => {
    try {
      await updateDoc(doc(db, 'empresas', emp.id), { activa: !emp.activa })
    } catch (err) {
      setMsg({ tipo: 'err', texto: 'No se pudo cambiar el estado.' })
    }
  }

  // ── Prender/apagar el modo certificación de una empresa (toggle) ──
  const toggleAsistente = async (emp) => {
    const nuevo = !(emp.asistenteCertificacionActivo === true)
    try {
      await updateDoc(doc(db, 'empresas', emp.id), { asistenteCertificacionActivo: nuevo, updatedAt: serverTimestamp(), updatedBy: user.email })
      setMsg({ tipo: 'ok', texto: nuevo
        ? `Asistente de certificación ACTIVADO para "${emp.nombreComercial || emp.nombre}".`
        : `Asistente de certificación apagado para "${emp.nombreComercial || emp.nombre}".` })
    } catch (err) {
      setMsg({ tipo: 'err', texto: 'No se pudo cambiar el modo certificación.' })
    }
  }

  // ── Prender/apagar el modo DEMO de una empresa (toggle) ──
  const toggleDemo = async (emp) => {
    const nuevo = !(emp.esDemo === true)
    try {
      await updateDoc(doc(db, 'empresas', emp.id), { esDemo: nuevo, updatedAt: serverTimestamp(), updatedBy: user.email })
      setMsg({ tipo: 'ok', texto: nuevo
        ? `Modo DEMO ACTIVADO para "${emp.nombreComercial || emp.nombre}". Las ventas se simulan, no van al MH.`
        : `Modo DEMO apagado para "${emp.nombreComercial || emp.nombre}". Las ventas se transmitirán al MH.` })
    } catch (err) {
      setMsg({ tipo: 'err', texto: 'No se pudo cambiar el modo DEMO.' })
    }
  }

  // ── Abrir modal de NUEVA empresa ──
  const abrirNueva = () => {
    setEditandoId(null)
    setForm(FORM_VACIO)
    setErrores({})
    setMsg(null)
    setModalForm(true)
  }

  // ── Abrir modal de EDITAR empresa ──
  const abrirEditar = (emp) => {
    editar(emp)
    setModalForm(true)
  }

  // ── Guardar SOLO la config/límites de una empresa (desde su modal) ──
  const guardarConfig = async () => {
    if (!modalConfig) return
    setCfgGuardando(true)
    try {
      await updateDoc(doc(db, 'empresas', modalConfig.id), {
        maxSucursales: Number(modalConfig.maxSucursales) || 1,
        maxUsuarios: Number(modalConfig.maxUsuarios) || 1,
        plan: modalConfig.plan || 'basico',
        modulos: modalConfig.modulos || {}, // candado de negocio por empresa
        correo_tope: modalConfig.correo_tope === '' || modalConfig.correo_tope == null ? null : Number(modalConfig.correo_tope),
        updatedAt: serverTimestamp(),
        updatedBy: user.email,
      })
      setMsg({ tipo: 'ok', texto: `Configuración de "${modalConfig.nombreComercial || modalConfig.nombre}" guardada.` })
      setModalConfig(null)
    } catch (err) {
      setMsg({ tipo: 'err', texto: 'No se pudo guardar la configuración: ' + (err?.message || '') })
    } finally {
      setCfgGuardando(false)
    }
  }

  // ── Conexión MH / Certificado DTE de una empresa ──
  // Carga el certificado (.crt del MH) y las credenciales API en configuracion/{empresaId}.
  // Solo el maestro One Geo puede hacerlo (las reglas de Firestore lo restringen).
  const abrirMH = async (emp) => {
    setMhMsg(null)
    setModalMH({ id: emp.id, nombre: emp.nombreComercial || emp.nombre, mh_usuario: '', mh_ambiente: '00', mh_password: '', certificado_password: '', certificado_pem: null, certNombre: '', tieneCert: false, cargando: true })
    try {
      const snap = await getDoc(doc(db, 'configuracion', emp.id))
      const c = snap.exists() ? snap.data() : {}
      setModalMH(m => m ? { ...m, mh_usuario: c.mh_usuario || '', mh_ambiente: c.mh_ambiente || '00', certificado_password: c.certificado_password || '', tieneCert: !!c.certificado_pem, cargando: false } : m)
    } catch {
      setModalMH(m => m ? { ...m, cargando: false } : m)
    }
  }

  const cargarCrt = async (file) => {
    if (!file) return
    try {
      const texto = await file.text()
      const pem = extraerClavePEM(texto)
      setModalMH(m => ({ ...m, certificado_pem: pem, certNombre: file.name }))
      setMhMsg({ tipo: 'ok', texto: `Certificado leído (${file.name}). Se guardará al presionar Guardar.` })
    } catch (e) {
      setMhMsg({ tipo: 'err', texto: 'No se pudo leer el certificado: ' + e.message })
    }
  }

  const guardarMH = async () => {
    if (!modalMH) return
    setMhGuardando(true)
    try {
      const datos = {
        mh_usuario: (modalMH.mh_usuario || '').trim(),
        mh_ambiente: modalMH.mh_ambiente || '00',
        certificado_password: modalMH.certificado_password || '',
        updatedAt: serverTimestamp(),
        updatedBy: user.email,
      }
      // La contraseña API y el certificado solo se sobreescriben si se ingresaron/cargaron.
      if (modalMH.mh_password) datos.mh_password = modalMH.mh_password
      if (modalMH.certificado_pem) datos.certificado_pem = modalMH.certificado_pem
      await setDoc(doc(db, 'configuracion', modalMH.id), datos, { merge: true })
      setMsg({ tipo: 'ok', texto: `Conexión MH de "${modalMH.nombre}" guardada.` })
      setModalMH(null)
    } catch (err) {
      setMhMsg({ tipo: 'err', texto: 'No se pudo guardar: ' + (err?.message || '') })
    } finally {
      setMhGuardando(false)
    }
  }

  // ── Crear ADMIN de una empresa (llama a la función crearAdmin del backend) ──
  // El backend valida el TOKEN del maestro, crea el usuario en Auth y su doc en
  // 'usuarios' con el empresaId. No desloguea al maestro.
  // ── Helper: llamar a la función gestionarAdmin del backend con el token del maestro ──
  const llamarGestionAdmin = async (payload) => {
    const { auth } = await import('../firebase')
    const token = await auth.currentUser.getIdToken()
    const resp = await fetch('/api/dte/gestionar-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || data.ok === false) throw new Error(data.error || `Error ${resp.status}`)
    return data
  }

  // ── Abrir el modal de Administradores de una empresa ──
  const abrirAdmins = async (emp) => {
    setModalAdmin(emp)
    setAdminVista('lista')
    setAdminMsg(null)
    setAdminForm({ nombre: '', email: '', password: '' })
    setAdminSel(null)
    setAdminCampo('')
    await cargarAdmins(emp.id)
  }

  // ── Cargar la lista de admins de una empresa ──
  const cargarAdmins = async (empresaId) => {
    setAdminsCargando(true)
    setAdminsLista([])
    try {
      const data = await llamarGestionAdmin({ accion: 'listar', empresaId })
      setAdminsLista(data.admins || [])
    } catch (err) {
      setAdminMsg({ tipo: 'err', texto: 'No se pudieron cargar los admins: ' + (err?.message || '') })
    } finally {
      setAdminsCargando(false)
    }
  }

  // ── Crear un admin nuevo ──
  const crearAdminCliente = async () => {
    if (!modalAdmin) return
    setAdminMsg(null)
    if (!adminForm.nombre.trim()) { setAdminMsg({ tipo: 'err', texto: 'El nombre es obligatorio.' }); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminForm.email)) { setAdminMsg({ tipo: 'err', texto: 'Correo inválido.' }); return }
    setCreandoAdmin(true)
    try {
      const data = await llamarGestionAdmin({
        accion: 'crear',
        nombre: adminForm.nombre.trim(),
        email: adminForm.email.trim().toLowerCase(),
        empresaId: modalAdmin.id,
      })
      setAdminMsg(data.invitacion === 'error'
        ? { tipo: 'err', texto: 'Admin creado, pero el correo de invitación no salió. Usá "Reenviar invitación" en la lista.' }
        : { tipo: 'ok', texto: `Admin creado. Le enviamos una invitación a ${adminForm.email.trim().toLowerCase()} para que establezca su propia contraseña.` })
      setAdminForm({ nombre: '', email: '', password: '' })
      setAdminVista('lista')
      await cargarAdmins(modalAdmin.id)
    } catch (err) {
      setAdminMsg({ tipo: 'err', texto: 'No se pudo crear el admin: ' + (err?.message || 'desconocido') })
    } finally {
      setCreandoAdmin(false)
    }
  }

  // ── Reenviar la invitación (link para establecer contraseña) ──
  const reenviarInvitacion = async (a) => {
    setAdminMsg(null)
    setAdminAccion(true)
    try {
      await llamarGestionAdmin({ accion: 'reenviar_invitacion', email: a.email })
      setAdminMsg({ tipo: 'ok', texto: `Invitación reenviada a ${a.email}. El cliente puede establecer su contraseña desde ese correo.` })
    } catch (err) {
      setAdminMsg({ tipo: 'err', texto: 'No se pudo reenviar la invitación: ' + (err?.message || '') })
    } finally {
      setAdminAccion(false)
    }
  }

  // ── Cambiar el correo de un admin ──
  const cambiarCorreoAdmin = async () => {
    if (!adminSel) return
    setAdminMsg(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminCampo)) { setAdminMsg({ tipo: 'err', texto: 'Correo inválido.' }); return }
    setAdminAccion(true)
    try {
      await llamarGestionAdmin({ accion: 'cambiar_correo', uid: adminSel.uid, email: adminCampo.trim().toLowerCase() })
      setAdminMsg({ tipo: 'ok', texto: 'Correo actualizado. El admin deberá iniciar sesión con el nuevo correo.' })
      setAdminVista('lista')
      await cargarAdmins(modalAdmin.id)
    } catch (err) {
      setAdminMsg({ tipo: 'err', texto: 'No se pudo cambiar el correo: ' + (err?.message || '') })
    } finally {
      setAdminAccion(false)
    }
  }

  // ── Cambiar la contraseña de un admin ──
  const cambiarClaveAdmin = async () => {
    if (!adminSel) return
    setAdminMsg(null)
    if ((adminCampo || '').length < 6) { setAdminMsg({ tipo: 'err', texto: 'La contraseña debe tener al menos 6 caracteres.' }); return }
    setAdminAccion(true)
    try {
      await llamarGestionAdmin({ accion: 'cambiar_clave', uid: adminSel.uid, password: adminCampo })
      setAdminMsg({ tipo: 'ok', texto: 'Contraseña actualizada.' })
      setAdminVista('lista')
      setAdminCampo('')
    } catch (err) {
      setAdminMsg({ tipo: 'err', texto: 'No se pudo cambiar la contraseña: ' + (err?.message || '') })
    } finally {
      setAdminAccion(false)
    }
  }

  // ── Activar/desactivar un admin ──
  const toggleActivoAdmin = async (admin) => {
    setAdminMsg(null)
    try {
      await llamarGestionAdmin({ accion: 'toggle_activo', uid: admin.uid, activo: !admin.activo })
      setAdminMsg({ tipo: 'ok', texto: admin.activo ? 'Admin desactivado.' : 'Admin activado.' })
      await cargarAdmins(modalAdmin.id)
    } catch (err) {
      setAdminMsg({ tipo: 'err', texto: 'No se pudo cambiar el estado: ' + (err?.message || '') })
    }
  }

  // ── Sucursales de una empresa (las gestiona One Geo; el cliente solo las ve) ──
  const abrirSucursales = (emp) => {
    setModalSucursales(emp)
    setSucVista('lista')
    setSucForm(SUC_VACIA)
    setSucEditandoId(null)
    setSucMsg(null)
  }

  const editarSucursal = (s) => {
    setSucEditandoId(s.id)
    setSucForm({
      nombre: s.nombre || '', codEstablecimiento: s.codEstablecimiento || s.codEstable || '', codPuntoVenta: s.codPuntoVenta || '',
      codEstableMH: s.codEstableMH || '', codPuntoVentaMH: s.codPuntoVentaMH || '',
      codDep: s.codDep || '', codMun: s.codMun || '', distrito: s.distrito || '', codDistrito: s.codDistrito || '',
      complemento: s.complemento || '', telefono: s.telefono || '', responsable: s.responsable || '', activa: s.activa !== false,
    })
    setSucVista('form')
    setSucMsg(null)
  }

  const guardarSucursal = async () => {
    if (!modalSucursales) return
    if (!sucForm.nombre.trim()) { setSucMsg({ tipo: 'err', texto: 'El nombre es obligatorio.' }); return }
    if (!/^\d{4}$/.test(sucForm.codEstablecimiento)) { setSucMsg({ tipo: 'err', texto: 'El código de establecimiento debe ser exactamente 4 dígitos.' }); return }
    if (!sucForm.codPuntoVenta.trim()) { setSucMsg({ tipo: 'err', texto: 'El código de punto de venta es obligatorio.' }); return }
    setSucGuardando(true)
    try {
      const direccion = buildComplemento(sucForm.distrito, sucForm.complemento)
      const data = {
        nombre: sucForm.nombre.trim(),
        codEstablecimiento: sucForm.codEstablecimiento.trim(),
        codEstable: sucForm.codEstablecimiento.trim(),  // emisor del DTE usa codEstable
        codPuntoVenta: sucForm.codPuntoVenta.trim(),
        codEstableMH: sucForm.codEstableMH?.trim() || '',
        codPuntoVentaMH: sucForm.codPuntoVentaMH?.trim() || '',
        codDep: sucForm.codDep || '', codMun: sucForm.codMun || '',
        distrito: sucForm.distrito || '', codDistrito: sucForm.codDistrito || '',
        complemento: sucForm.complemento || '', direccion,
        telefono: sucForm.telefono?.trim() || '', responsable: sucForm.responsable?.trim() || '',
        activa: sucForm.activa,
        empresaId: modalSucursales.id,
        updatedAt: serverTimestamp(),
      }
      if (sucEditandoId) {
        await updateDoc(doc(db, 'sucursales', sucEditandoId), data)
      } else {
        const correlativos = {}
        TIPOS_DTE_CORRELATIVOS.forEach(t => { correlativos[`correlativo${t}`] = 1 })
        await addDoc(collection(db, 'sucursales'), { ...data, ...correlativos, createdAt: serverTimestamp() })
      }
      setSucVista('lista')
      setSucForm(SUC_VACIA)
      setSucEditandoId(null)
      setSucMsg({ tipo: 'ok', texto: 'Sucursal guardada.' })
    } catch (err) {
      setSucMsg({ tipo: 'err', texto: 'No se pudo guardar: ' + (err?.message || '') })
    } finally {
      setSucGuardando(false)
    }
  }

  // ── Correlativos iniciales (migración desde otro sistema) ──
  // Escribe el contador OFICIAL del MH: contadores/{codigo}_{codEstableMH}_{codPuntoVentaMH}_{ambiente}.
  // valor = último número emitido en el sistema anterior → el próximo DTE será valor+1.
  const abrirCorrelativos = (s) => {
    setSucCorrSuc(s)
    setSucCorrAmbiente('01')
    setSucCorrForm({})
    setSucMsg(null)
    setSucVista('correlativos')
  }

  const guardarCorrelativos = async () => {
    if (!sucCorrSuc) return
    const estable = (sucCorrSuc.codEstableMH || '').trim()
    const pv = (sucCorrSuc.codPuntoVentaMH || '').trim()
    if (!estable || !pv) {
      setSucMsg({ tipo: 'err', texto: 'Esta sucursal no tiene códigos MH (codEstableMH / codPuntoVentaMH). Cargalos primero en "Editar".' })
      return
    }
    const entradas = Object.entries(sucCorrForm)
      .map(([code, v]) => [code, parseInt(String(v).replace(/\D/g, ''), 10)])
      .filter(([, n]) => Number.isInteger(n) && n >= 0)
    if (!entradas.length) {
      setSucMsg({ tipo: 'err', texto: 'Ingresá al menos un correlativo.' })
      return
    }
    setSucCorrGuardando(true)
    try {
      const aplicados = []
      const omitidos = []
      for (const [code, ultimo] of entradas) {
        const ref = doc(db, 'contadores', `${code}_${estable}_${pv}_${sucCorrAmbiente}`)
        const snap = await getDoc(ref)
        const actual = snap.exists() ? (snap.data().valor || 0) : 0
        // No bajar un contador que ya está más adelante (evitaría reusar números → rechazo 004).
        if (actual > ultimo) { omitidos.push(`${code} (ya está en ${actual})`); continue }
        await setDoc(ref, {
          valor: ultimo, tipoDte: code, codEstableMH: estable, codPuntoVentaMH: pv,
          ambiente: sucCorrAmbiente, migradoDesdeSistemaAnterior: true,
          actualizadoEn: serverTimestamp(), actualizadoPor: user.email,
        }, { merge: true })
        aplicados.push(`${code} → próximo ${ultimo + 1}`)
      }
      let texto = aplicados.length ? `Correlativos guardados: ${aplicados.join(', ')}.` : 'No se aplicó ningún cambio.'
      if (omitidos.length) texto += ` Omitidos (ya estaban más adelante): ${omitidos.join(', ')}.`
      setSucMsg({ tipo: (!aplicados.length && omitidos.length) ? 'err' : 'ok', texto })
      if (aplicados.length) setSucVista('lista')
    } catch (err) {
      setSucMsg({ tipo: 'err', texto: 'No se pudo guardar: ' + (err?.message || '') })
    } finally {
      setSucCorrGuardando(false)
    }
  }

  // Desactivar/activar (NO se borra: preserva códigos MH y correlativos)
  const toggleSucursalActiva = async (s) => {
    try {
      await updateDoc(doc(db, 'sucursales', s.id), { activa: !(s.activa !== false), updatedAt: serverTimestamp() })
    } catch (err) {
      setSucMsg({ tipo: 'err', texto: 'No se pudo cambiar el estado: ' + (err?.message || '') })
    }
  }

  // Formatea la fecha de registro (createdAt es un Timestamp de Firestore)
  const fmtFecha = (ts) => {
    if (!ts) return '—'
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts)
      return d.toLocaleString('es-SV', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch { return '—' }
  }

  // Empresas filtradas por búsqueda (nombre, comercial o NIT)
  const empresasFiltradas = busqueda.trim()
    ? empresas.filter(e => {
        const t = busqueda.toLowerCase()
        return (e.nombre || '').toLowerCase().includes(t)
          || (e.nombreComercial || '').toLowerCase().includes(t)
          || (e.nit || '').includes(busqueda.replace(/[-\s]/g, ''))
      })
    : empresas


  // ── Formulario de empresa (se usa dentro del modal alta/edición) ──
  const formularioEmpresa = (
    <div className="sa-modal-cols">
      {/* LOGO */}
      <div className="sa-section sa-full-modal">
        <p className="sa-section-label">Logo</p>
        <div className="sa-logo-row">
          <div className="sa-logo-box">
            {form.logo ? <img src={form.logo} alt="logo" /> : <IcoImg />}
          </div>
          <div className="sa-logo-info">
            <label className="sa-btn-file">
              <IcoUpload /> Subir logo
              <input type="file" accept="image/*" onChange={onLogo} style={{ display: 'none' }} />
            </label>
            <p className="sa-logo-hint">Se comprime automáticamente. PNG o JPG.</p>
          </div>
        </div>
      </div>

      {/* IDENTIFICACIÓN FISCAL */}
      <div className="sa-section sa-full-modal">
        <p className="sa-section-label">Identificación fiscal</p>
        <div className="sa-grid sa-g2">
          <div className="sa-field">
            <label>NIT *</label>
            <input value={form.nit} onChange={e => set('nit', e.target.value)} placeholder="14 díg. (0614-010190-101-3) o 9 díg. (DUI)" style={errores.nit ? { borderColor: 'var(--danger)' } : {}} />
            {errores.nit && <span className="sa-error">{errores.nit}</span>}
          </div>
          <div className="sa-field">
            <label>NRC</label>
            <input value={form.nrc} onChange={e => set('nrc', e.target.value)} placeholder="123456-7" style={errores.nrc ? { borderColor: 'var(--danger)' } : {}} />
            {errores.nrc && <span className="sa-error">{errores.nrc}</span>}
          </div>
          <div className="sa-field sa-full">
            <label>Razón social *</label>
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Distribuidora López, S.A. de C.V." style={errores.nombre ? { borderColor: 'var(--danger)' } : {}} />
            {errores.nombre && <span className="sa-error">{errores.nombre}</span>}
          </div>
          <div className="sa-field sa-full"><label>Nombre comercial</label><input value={form.nombreComercial} onChange={e => set('nombreComercial', e.target.value)} placeholder="Ferretería López" /></div>
          <div className="sa-field sa-full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="emp-pruebas" checked={form.esPruebas} onChange={e => set('esPruebas', e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }} />
            <label htmlFor="emp-pruebas" style={{ cursor: 'pointer', margin: 0, fontSize: 13 }}>
              🔬 Empresa de <strong>pruebas / certificación</strong> (ambiente 00) — permite reusar un NIT ya registrado
            </label>
          </div>
        </div>
      </div>

      {/* ACTIVIDAD ECONÓMICA */}
      <div className="sa-section">
        <p className="sa-section-label">Actividad económica</p>
        <BuscadorActividad
          codActividad={form.codActividad || ''}
          descActividad={form.descActividad || ''}
          onChange={({ codigo, descripcion }) => setForm(f => ({ ...f, codActividad: codigo, descActividad: descripcion }))}
        />
      </div>

      {/* DIRECCIÓN */}
      <div className="sa-section">
        <p className="sa-section-label">Dirección</p>
        <SelectorDepartamento
          codDep={form.codDep || ''}
          codMun={form.codMun || ''}
          distrito={form.distrito || ''}
          onChange={({ codDep, codMun, distrito, codDistrito }) =>
            setForm(f => ({ ...f, codDep, codMun, distrito: distrito || '', codDistrito: codDistrito || '' }))}
        />
        <div className="sa-field" style={{ marginTop: 12 }}><label>Complemento</label><input value={form.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Calle Roosevelt #45, Local 3" /></div>
      </div>

      {/* CONTACTO Y ESTABLECIMIENTO */}
      <div className="sa-section">
        <p className="sa-section-label">Contacto y establecimiento</p>
        <div className="sa-grid sa-g2">
          <div className="sa-field"><label>Teléfono</label><input value={form.telefono} onChange={e => set('telefono', e.target.value)} placeholder="2222-0000" /></div>
          <div className="sa-field"><label>Correo</label><input value={form.correo} onChange={e => set('correo', e.target.value)} placeholder="facturacion@empresa.com" /></div>
          <div className="sa-field"><label>Cód. establecimiento</label><input value={form.codEstable} onChange={e => set('codEstable', e.target.value)} placeholder="0001" /></div>
          <div className="sa-field"><label>Cód. punto de venta</label><input value={form.codPuntoVenta} onChange={e => set('codPuntoVenta', e.target.value)} placeholder="1" /></div>
        </div>
      </div>

      {/* PLAN Y ESTADO */}
      <div className="sa-section">
        <p className="sa-section-label">Plan y estado (SaaS)</p>
        <div className="sa-grid sa-g2">
          <div className="sa-field">
            <label>Plan</label>
            <select value={form.plan} onChange={e => set('plan', e.target.value)}>
              {PLANES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <div className="sa-field">
            <label>Estado</label>
            <select value={form.activa ? 'activa' : 'suspendida'} onChange={e => set('activa', e.target.value === 'activa')}>
              <option value="activa">Activa</option>
              <option value="suspendida">Suspendida</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <style>{styles}</style>
      <div className="sa-wrap">

        <div className="sa-head">
          <div className="sa-head-icon"><IcoTienda /></div>
          <div>
            <div className="sa-title">Panel One Geo — Centro de Control</div>
            <div className="sa-sub">Gestión de empresas-clientes de ORIÓN</div>
          </div>
        </div>

        {msg && <div className={`sa-msg ${msg.tipo}`}>{msg.texto}</div>}

        {/* MÉTRICAS GLOBALES */}
        <div className="sa-metricas">
          <div className="sa-metrica m-empresas">
            <div className="sa-metrica-label">Empresas</div>
            <div className="sa-metrica-valor">{empresas.length}</div>
          </div>
          <div className="sa-metrica m-activas">
            <div className="sa-metrica-label">Activas</div>
            <div className="sa-metrica-valor">{empresas.filter(e => e.activa !== false).length}</div>
          </div>
          <div className="sa-metrica m-suspendidas">
            <div className="sa-metrica-label">Suspendidas</div>
            <div className="sa-metrica-valor">{empresas.filter(e => e.activa === false).length}</div>
          </div>
          <div className="sa-metrica m-demo">
            <div className="sa-metrica-label">DEMO</div>
            <div className="sa-metrica-valor">{empresas.filter(e => e.esDemo === true).length}</div>
          </div>
        </div>

        {/* BARRA: nueva empresa + buscador */}
        <div className="sa-topbar">
          <button className="sa-btn-nueva" onClick={abrirNueva}><IcoPlus /> Nueva empresa</button>
          <input
            className="sa-buscador"
            placeholder="🔍 Buscar por nombre o NIT..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        {/* LISTA DE EMPRESAS (tarjetas expandibles) */}
        {empresas.length === 0 ? (
          <div className="sa-emp-card"><div className="sa-emp-cab" style={{ cursor: 'default', color: 'var(--muted)', fontSize: 13 }}>Aún no hay empresas registradas.</div></div>
        ) : empresasFiltradas.length === 0 ? (
          <div className="sa-emp-card"><div className="sa-emp-cab" style={{ cursor: 'default', color: 'var(--muted)', fontSize: 13 }}>Sin resultados para "{busqueda}".</div></div>
        ) : empresasFiltradas.map(emp => (
          <div key={emp.id} className={`sa-emp-card ${expandida === emp.id ? 'abierta' : ''}`}>
            <div className="sa-emp-cab" onClick={() => setExpandida(expandida === emp.id ? null : emp.id)}>
              <div className="sa-emp-logo">{emp.logo ? <img src={emp.logo} alt="" /> : <IcoTienda />}</div>
              <div className="sa-emp-info">
                <div className="sa-emp-nombre">{emp.nombreComercial || emp.nombre}</div>
                <div className="sa-emp-meta">NIT {emp.nit} · Plan {emp.plan ? emp.plan.charAt(0).toUpperCase() + emp.plan.slice(1) : '—'}</div>
                <div className="sa-emp-badges">
                  <span className={`sa-tag ${emp.activa !== false ? 'estado-activa' : 'estado-susp'}`}>{emp.activa !== false ? 'Activa' : 'Suspendida'}</span>
                  {emp.esDemo === true && <span className="sa-tag demo">🧪 DEMO</span>}
                  {emp.esPruebas === true && <span className="sa-tag" style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>🔬 PRUEBAS</span>}
                  {emp.asistenteCertificacionActivo === true && <span className="sa-tag cert">🎓 Certif.</span>}
                </div>
              </div>
              <span className="sa-chevron"><IcoChevron /></span>
            </div>

            {expandida === emp.id && (
              <div className="sa-acciones">
                <p className="sa-acciones-titulo">Acciones</p>
                <div className="sa-acc-grid">
                  <button className="sa-acc-btn acc-editar" onClick={() => abrirEditar(emp)}>
                    <IcoEditar />
                    <span className="sa-acc-titulo">Editar datos</span>
                    <span className="sa-acc-desc">datos fiscales</span>
                  </button>
                  <button className="sa-acc-btn acc-config" onClick={() => setModalConfig({ ...emp, maxSucursales: emp.maxSucursales ?? 1, maxUsuarios: emp.maxUsuarios ?? 3, plan: emp.plan || 'basico', modulos: emp.modulos || {}, correo_tope: emp.correo_tope ?? '' })}>
                    <IcoConfig />
                    <span className="sa-acc-titulo">Plan y límites</span>
                    <span className="sa-acc-desc">plan, topes</span>
                  </button>
                  <button className="sa-acc-btn acc-admin" onClick={() => abrirAdmins(emp)}>
                    <IcoAdmin />
                    <span className="sa-acc-titulo">Administradores</span>
                    <span className="sa-acc-desc">cuentas del cliente</span>
                  </button>
                  <button className="sa-acc-btn" style={{ color: '#0EA5A5' }} onClick={() => abrirSucursales(emp)}>
                    <IcoTienda />
                    <span className="sa-acc-titulo">Sucursales</span>
                    <span className="sa-acc-desc">puntos de venta y códigos MH</span>
                  </button>
                  <button className="sa-acc-btn" style={{ color: 'var(--accent3)' }} onClick={() => abrirMH(emp)}>
                    <span style={{ fontSize: 22 }}>🔐</span>
                    <span className="sa-acc-titulo">Conexión MH</span>
                    <span className="sa-acc-desc">certificado y credenciales DTE</span>
                  </button>
                  <button className={`sa-acc-btn acc-demo ${emp.esDemo === true ? 'activo' : ''}`} onClick={() => toggleDemo(emp)}>
                    <span style={{ fontSize: 22 }}>🧪</span>
                    <span className="sa-acc-titulo">Modo DEMO</span>
                    <span className={`sa-acc-estado-txt ${emp.esDemo === true ? 'on' : 'off'}`}>
                      {emp.esDemo === true ? '● ACTIVO' : '○ apagado'}
                    </span>
                  </button>
                  <button className={`sa-acc-btn acc-asistente ${emp.asistenteCertificacionActivo === true ? 'activo' : ''}`} onClick={() => toggleAsistente(emp)}>
                    <IcoCertif />
                    <span className="sa-acc-titulo">Asistente certif.</span>
                    <span className={`sa-acc-estado-txt ${emp.asistenteCertificacionActivo === true ? 'on' : 'off'}`}>
                      {emp.asistenteCertificacionActivo === true ? '● ACTIVO' : '○ apagado'}
                    </span>
                  </button>
                  <button className={`sa-acc-btn ${emp.activa !== false ? 'acc-suspender' : 'acc-estado'}`} onClick={() => toggleEstado(emp)}>
                    {emp.activa !== false ? <IcoPausa /> : <IcoPlay />}
                    <span className="sa-acc-titulo">{emp.activa !== false ? 'Suspender' : 'Activar'}</span>
                    <span className="sa-acc-desc">cambiar estado</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

      </div>

      {/* ══ MODAL: alta / edición de empresa ══ */}
      {modalForm && (
        <div className="sa-modal-overlay">
          <div className="sa-modal sa-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="sa-modal-cab">
              <span className="sa-modal-titulo">{editandoId ? '✏️ Editar empresa' : '➕ Nueva empresa'}</span>
              <button className="sa-modal-x" onClick={() => { setModalForm(false); cancelarEdicion() }}>×</button>
            </div>
            <div className="sa-modal-body">{formularioEmpresa}</div>
            <div className="sa-modal-footer">
              <button className="sa-btn-cancelar" onClick={() => { setModalForm(false); cancelarEdicion() }} disabled={guardando}>Cancelar</button>
              <button className="sa-btn-guardar" onClick={registrar} disabled={guardando} style={{ marginTop: 0, flex: 1 }}>
                <IcoPlus /> {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Registrar empresa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: plan y límites ══ */}
      {modalConfig && (
        <div className="sa-modal-overlay">
          <div className="sa-modal sa-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="sa-modal-cab">
              <span className="sa-modal-titulo">⚙️ Plan y límites · {modalConfig.nombreComercial || modalConfig.nombre}</span>
              <button className="sa-modal-x" onClick={() => setModalConfig(null)}>×</button>
            </div>
            <div className="sa-modal-body">
              <div className="sa-modal-cols">
                <div className="sa-field">
                  <label>Plan</label>
                  <select value={modalConfig.plan || 'basico'} onChange={e => setModalConfig(c => ({ ...c, plan: e.target.value }))}>
                    {PLANES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
                <div className="sa-field">
                  <label>Sucursales máximas</label>
                  <input type="number" min="1" value={modalConfig.maxSucursales} onChange={e => setModalConfig(c => ({ ...c, maxSucursales: Number(e.target.value) }))} />
                </div>
                <div className="sa-field">
                  <label>Usuarios máximos</label>
                  <input type="number" min="1" value={modalConfig.maxUsuarios} onChange={e => setModalConfig(c => ({ ...c, maxUsuarios: Number(e.target.value) }))} />
                </div>
              </div>

              {/* ── MÓDULOS OPCIONALES (candado de negocio por empresa) ── */}
              <div style={{ marginTop: 18 }}>
                <p className="sa-section-label">Módulos habilitados</p>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                  Activa/desactiva los módulos que incluye el plan de esta empresa. Los módulos base (ventas, facturas, inventario, clientes…) siempre están.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {MODULOS.map(m => {
                    const activo = modalConfig.modulos?.[m.key] ?? m.defaultOn
                    return (
                      <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 10, cursor: 'pointer',
                        border: `1.5px solid ${activo ? 'rgba(0,194,150,0.4)' : 'var(--border)'}`, background: activo ? 'rgba(0,194,150,0.06)' : 'var(--surface2)' }}>
                        <input type="checkbox" checked={activo} style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
                          onChange={e => setModalConfig(c => ({ ...c, modulos: { ...(c.modulos || {}), [m.key]: e.target.checked } }))} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.label}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{m.desc}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: activo ? '#00966f' : 'var(--muted)' }}>{activo ? '● ACTIVO' : '○ apagado'}</span>
                      </label>
                    )
                  })}
                </div>
                {(modalConfig.modulos?.correo ?? false) && (
                  <div style={{ marginTop: 12, padding: '11px 13px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface2)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Tope de correos por mes</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>Máximo de correos que esta empresa puede enviar al mes (control de costo). Vacío = 500 por defecto.</div>
                    <input type="number" min="0" className="input" placeholder="500"
                      value={modalConfig.correo_tope ?? ''}
                      onChange={e => setModalConfig(c => ({ ...c, correo_tope: e.target.value === '' ? '' : Number(e.target.value) }))}
                      style={{ width: 140 }} />
                  </div>
                )}
              </div>
            </div>
            <div className="sa-modal-footer">
              <button className="sa-btn-cancelar" onClick={() => setModalConfig(null)} disabled={cfgGuardando}>Cancelar</button>
              <button className="sa-btn-guardar" onClick={guardarConfig} disabled={cfgGuardando} style={{ marginTop: 0, flex: 1 }}>
                {cfgGuardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Conexión MH / Certificado DTE ══ */}
      {modalMH && (
        <div className="sa-modal-overlay">
          <div className="sa-modal sa-modal-sm">
            <div className="sa-modal-cab">
              <span className="sa-modal-titulo">🔐 Conexión MH · {modalMH.nombre}</span>
              <button className="sa-modal-x" onClick={() => setModalMH(null)}>×</button>
            </div>
            <div className="sa-modal-body">
              {mhMsg && <div className={`sa-msg ${mhMsg.tipo}`} style={{ marginBottom: 14 }}>{mhMsg.texto}</div>}
              {modalMH.cargando ? <p style={{ color: 'var(--muted)' }}>Cargando configuración…</p> : (
                <>
                  <div className="sa-grid sa-g2">
                    <div className="sa-field">
                      <label>Ambiente</label>
                      <select value={modalMH.mh_ambiente} onChange={e => setModalMH(m => ({ ...m, mh_ambiente: e.target.value }))}>
                        <option value="00">Prueba (00)</option>
                        <option value="01">Producción (01)</option>
                      </select>
                    </div>
                    <div className="sa-field">
                      <label>Usuario API (NIT)</label>
                      <input value={modalMH.mh_usuario} onChange={e => setModalMH(m => ({ ...m, mh_usuario: e.target.value }))} placeholder="11260405261018" />
                    </div>
                  </div>
                  <div className="sa-field">
                    <label>Contraseña API {modalMH.tieneCert && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(dejar vacío para no cambiarla)</span>}</label>
                    <input type="password" value={modalMH.mh_password} onChange={e => setModalMH(m => ({ ...m, mh_password: e.target.value }))} placeholder="••••••••" autoComplete="new-password" />
                  </div>
                  <div className="sa-field">
                    <label>
                      Certificado (.crt del MH)
                      {modalMH.tieneCert && !modalMH.certificado_pem && <span style={{ color: '#10b981', fontWeight: 400 }}> · ya hay uno cargado</span>}
                    </label>
                    <input type="file" accept=".crt,.key,.pem,.xml,text/xml,text/plain" onChange={e => cargarCrt(e.target.files?.[0])} />
                    {modalMH.certificado_pem && <div style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>✓ {modalMH.certNombre} — clave leída, lista para guardar</div>}
                  </div>
                  <div className="sa-field">
                    <label>Contraseña del certificado <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(normalmente vacío)</span></label>
                    <input value={modalMH.certificado_password} onChange={e => setModalMH(m => ({ ...m, certificado_password: e.target.value }))} placeholder="(vacío)" />
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12, lineHeight: 1.5 }}>
                    🔒 El certificado y las credenciales se guardan en la configuración de esta empresa. Solo One Geo puede cargarlos. El archivo .crt se procesa en tu navegador: se extrae la clave privada y se guarda; el archivo no se sube a ningún tercero.
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                    🔢 ¿Cliente que venía de otro sistema? Configurá los <strong>correlativos iniciales</strong> en <strong>Sucursales → Correlativos</strong> para continuar su numeración (en producción).
                  </p>
                </>
              )}
            </div>
            <div className="sa-modal-footer">
              <button className="sa-btn-cancelar" onClick={() => setModalMH(null)} disabled={mhGuardando}>Cancelar</button>
              <button className="sa-btn-guardar" onClick={guardarMH} disabled={mhGuardando || modalMH.cargando} style={{ marginTop: 0, flex: 1 }}>
                {mhGuardando ? 'Guardando…' : '💾 Guardar conexión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Administradores (lista + crear + cambiar correo/clave) ══ */}
      {modalAdmin && (
        <div className="sa-modal-overlay">
          <div className="sa-modal sa-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="sa-modal-cab">
              <span className="sa-modal-titulo">👤 Administradores · {modalAdmin.nombreComercial || modalAdmin.nombre}</span>
              <button className="sa-modal-x" onClick={() => setModalAdmin(null)}>×</button>
            </div>
            <div className="sa-modal-body">
              {adminMsg && <div className={`sa-msg ${adminMsg.tipo}`} style={{ marginBottom: 16 }}>{adminMsg.tipo === 'ok' ? '✅ ' : ''}{adminMsg.texto}</div>}

              {/* VISTA: LISTA */}
              {adminVista === 'lista' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                    <button className="sa-btn-nueva" onClick={() => { setAdminVista('crear'); setAdminForm({ nombre: '', email: '', password: '' }); setAdminMsg(null) }}>
                      <IcoPlus /> Nuevo administrador
                    </button>
                  </div>
                  {adminsCargando ? (
                    <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, padding: 20 }}>Cargando administradores...</p>
                  ) : adminsLista.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, padding: 20 }}>Esta empresa todavía no tiene administradores. Creá el primero.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {adminsLista.map(a => (
                        <div key={a.uid} className="sa-admin-row">
                          <div className="sa-admin-info">
                            <div className="sa-admin-nombre">
                              {a.nombre || '(sin nombre)'}
                              <span className={`sa-tag ${a.activo ? 'estado-activa' : 'estado-susp'}`} style={{ marginLeft: 8 }}>{a.activo ? '● Activo' : '○ Inactivo'}</span>
                            </div>
                            <div className="sa-admin-email">{a.email}</div>
                          </div>
                          <div className="sa-admin-acciones">
                            <button className="sa-admin-btn" onClick={() => reenviarInvitacion(a)} disabled={adminAccion}>📩 Reenviar invitación</button>
                            <button className="sa-admin-btn" onClick={() => { setAdminSel(a); setAdminCampo(a.email); setAdminVista('correo'); setAdminMsg(null) }}>✉️ Correo</button>
                            <button className="sa-admin-btn" onClick={() => { setAdminSel(a); setAdminCampo(''); setAdminVista('clave'); setAdminMsg(null) }}>🔑 Clave</button>
                            <button className={`sa-admin-btn ${a.activo ? 'peligro' : ''}`} onClick={() => toggleActivoAdmin(a)}>{a.activo ? 'Desactivar' : 'Activar'}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* VISTA: CREAR */}
              {adminVista === 'crear' && (
                <div className="sa-modal-cols">
                  <div className="sa-field sa-full-modal">
                    <label>Nombre</label>
                    <input value={adminForm.nombre} onChange={e => setAdminForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre del administrador" />
                  </div>
                  <div className="sa-field">
                    <label>Correo (para iniciar sesión)</label>
                    <input value={adminForm.email} onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))} placeholder="correo@empresa.com" />
                  </div>
                  <div className="sa-field sa-full-modal">
                    <label>Contraseña</label>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', lineHeight: 1.5 }}>
                      🔐 No la defines tú. Al crear la cuenta, le enviamos al correo una <strong style={{ color: 'var(--text)' }}>invitación para que establezca su propia contraseña</strong>. Nadie de One Geo la conoce.
                    </div>
                  </div>
                </div>
              )}

              {/* VISTA: CAMBIAR CORREO */}
              {adminVista === 'correo' && adminSel && (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0, marginBottom: 14 }}>
                    Cambiar correo de <strong style={{ color: 'var(--text)' }}>{adminSel.nombre || adminSel.email}</strong>
                  </p>
                  <div className="sa-field">
                    <label>Nuevo correo</label>
                    <input value={adminCampo} onChange={e => setAdminCampo(e.target.value)} placeholder="nuevo@correo.com" />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>⚠️ El admin deberá iniciar sesión con el nuevo correo.</p>
                </div>
              )}

              {/* VISTA: CAMBIAR CLAVE */}
              {adminVista === 'clave' && adminSel && (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0, marginBottom: 14 }}>
                    Cambiar contraseña de <strong style={{ color: 'var(--text)' }}>{adminSel.nombre || adminSel.email}</strong>
                  </p>
                  <div className="sa-field">
                    <label>Nueva contraseña (mínimo 6 caracteres)</label>
                    <input type="text" value={adminCampo} onChange={e => setAdminCampo(e.target.value)} placeholder="Nueva contraseña" />
                  </div>
                </div>
              )}
            </div>

            {/* FOOTER segun vista */}
            <div className="sa-modal-footer">
              {adminVista === 'lista' && (
                <button className="sa-btn-cancelar" onClick={() => setModalAdmin(null)} style={{ flex: 1 }}>Cerrar</button>
              )}
              {adminVista === 'crear' && (
                <>
                  <button className="sa-btn-cancelar" onClick={() => { setAdminVista('lista'); setAdminMsg(null) }} disabled={creandoAdmin}>← Volver</button>
                  <button className="sa-btn-guardar" onClick={crearAdminCliente} disabled={creandoAdmin} style={{ marginTop: 0, flex: 1 }}>
                    {creandoAdmin ? 'Creando...' : 'Crear administrador'}
                  </button>
                </>
              )}
              {adminVista === 'correo' && (
                <>
                  <button className="sa-btn-cancelar" onClick={() => { setAdminVista('lista'); setAdminMsg(null) }} disabled={adminAccion}>← Volver</button>
                  <button className="sa-btn-guardar" onClick={cambiarCorreoAdmin} disabled={adminAccion} style={{ marginTop: 0, flex: 1 }}>
                    {adminAccion ? 'Guardando...' : 'Cambiar correo'}
                  </button>
                </>
              )}
              {adminVista === 'clave' && (
                <>
                  <button className="sa-btn-cancelar" onClick={() => { setAdminVista('lista'); setAdminMsg(null) }} disabled={adminAccion}>← Volver</button>
                  <button className="sa-btn-guardar" onClick={cambiarClaveAdmin} disabled={adminAccion} style={{ marginTop: 0, flex: 1 }}>
                    {adminAccion ? 'Guardando...' : 'Cambiar contraseña'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Sucursales de la empresa (gestionadas por One Geo) ══ */}
      {modalSucursales && (
        <div className="sa-modal-overlay">
          <div className="sa-modal sa-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="sa-modal-cab">
              <span className="sa-modal-titulo">🏪 Sucursales · {modalSucursales.nombreComercial || modalSucursales.nombre}</span>
              <button className="sa-modal-x" onClick={() => setModalSucursales(null)}>×</button>
            </div>
            <div className="sa-modal-body">
              {sucMsg && <div className={`sa-msg ${sucMsg.tipo}`} style={{ marginBottom: 16 }}>{sucMsg.tipo === 'ok' ? '✅ ' : ''}{sucMsg.texto}</div>}

              {/* VISTA: LISTA */}
              {sucVista === 'lista' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                    <button className="sa-btn-nueva" onClick={() => { setSucVista('form'); setSucForm(SUC_VACIA); setSucEditandoId(null); setSucMsg(null) }}>
                      <IcoPlus /> Nueva sucursal
                    </button>
                  </div>
                  {sucursalesLista.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, padding: 20 }}>Esta empresa todavía no tiene sucursales. Creá la primera.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {sucursalesLista.map(s => (
                        <div key={s.id} className="sa-admin-row">
                          <div className="sa-admin-info">
                            <div className="sa-admin-nombre">
                              {s.nombre || '(sin nombre)'}
                              <span className={`sa-tag ${s.activa !== false ? 'estado-activa' : 'estado-susp'}`} style={{ marginLeft: 8 }}>{s.activa !== false ? '● Activa' : '○ Inactiva'}</span>
                            </div>
                            <div className="sa-admin-email">
                              Estab. {s.codEstablecimiento || s.codEstable || '—'} · PV {s.codPuntoVenta || '—'} · MH {s.codEstableMH || '—'}/{s.codPuntoVentaMH || '—'}
                            </div>
                          </div>
                          <div className="sa-admin-acciones">
                            <button className="sa-admin-btn" onClick={() => editarSucursal(s)}>✏️ Editar</button>
                            <button className="sa-admin-btn" onClick={() => abrirCorrelativos(s)} title="Continuar numeración de un sistema anterior">🔢 Correlativos</button>
                            <button className={`sa-admin-btn ${s.activa !== false ? 'peligro' : ''}`} onClick={() => toggleSucursalActiva(s)}>{s.activa !== false ? 'Desactivar' : 'Activar'}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* VISTA: FORM (crear/editar) */}
              {sucVista === 'form' && (
                <div className="sa-modal-cols">
                  <div className="sa-field sa-full-modal">
                    <label>Nombre *</label>
                    <input value={sucForm.nombre} onChange={e => setSucForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Sucursal Centro" />
                  </div>
                  <div className="sa-field">
                    <label>Cód. establecimiento * (4 dígitos)</label>
                    <input value={sucForm.codEstablecimiento} maxLength={4} onChange={e => setSucForm(f => ({ ...f, codEstablecimiento: e.target.value.replace(/\D/g, '').slice(0, 4) }))} placeholder="0001" />
                  </div>
                  <div className="sa-field">
                    <label>Cód. punto de venta *</label>
                    <input value={sucForm.codPuntoVenta} maxLength={15} onChange={e => setSucForm(f => ({ ...f, codPuntoVenta: e.target.value.slice(0, 15) }))} placeholder="0001" />
                  </div>
                  <div className="sa-field">
                    <label>Cód. establecimiento MH</label>
                    <input value={sucForm.codEstableMH} onChange={e => setSucForm(f => ({ ...f, codEstableMH: e.target.value }))} placeholder="lo asigna el MH al certificar" />
                  </div>
                  <div className="sa-field">
                    <label>Cód. punto de venta MH</label>
                    <input value={sucForm.codPuntoVentaMH} onChange={e => setSucForm(f => ({ ...f, codPuntoVentaMH: e.target.value }))} placeholder="lo asigna el MH al certificar" />
                  </div>
                  <div className="sa-field sa-full-modal">
                    <label>Ubicación</label>
                    <SelectorDepartamento
                      codDep={sucForm.codDep} codMun={sucForm.codMun} distrito={sucForm.distrito}
                      onChange={({ codDep, codMun, distrito, codDistrito }) => setSucForm(f => ({ ...f, codDep, codMun, distrito: distrito || '', codDistrito: codDistrito || '' }))}
                    />
                    <input style={{ marginTop: 8 }} value={sucForm.complemento} onChange={e => setSucForm(f => ({ ...f, complemento: e.target.value }))} placeholder="Complemento: calle, colonia, número..." />
                  </div>
                  <div className="sa-field">
                    <label>Teléfono</label>
                    <input value={sucForm.telefono} onChange={e => setSucForm(f => ({ ...f, telefono: e.target.value }))} placeholder="7000-0000" />
                  </div>
                  <div className="sa-field">
                    <label>Responsable</label>
                    <input value={sucForm.responsable} onChange={e => setSucForm(f => ({ ...f, responsable: e.target.value }))} placeholder="Encargado" />
                  </div>
                  <div className="sa-field sa-full-modal" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" id="suc-activa" checked={sucForm.activa} onChange={e => setSucForm(f => ({ ...f, activa: e.target.checked }))} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                    <label htmlFor="suc-activa" style={{ cursor: 'pointer', margin: 0 }}>Sucursal activa</label>
                  </div>
                </div>
              )}

              {/* VISTA: CORRELATIVOS INICIALES (migración desde otro sistema) */}
              {sucVista === 'correlativos' && sucCorrSuc && (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
                    Continuar la numeración de <strong style={{ color: 'var(--text)' }}>{sucCorrSuc.nombre}</strong> desde otro sistema.
                    Ingresá el <strong>último número emitido</strong> por tipo de DTE; el próximo será ese +1.
                  </p>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                    Códigos MH de esta sucursal: <strong>{sucCorrSuc.codEstableMH || '—'}</strong> / <strong>{sucCorrSuc.codPuntoVentaMH || '—'}</strong>
                  </div>
                  <div className="sa-field" style={{ maxWidth: 220 }}>
                    <label>Ambiente</label>
                    <select value={sucCorrAmbiente} onChange={e => setSucCorrAmbiente(e.target.value)}>
                      <option value="01">Producción (01)</option>
                      <option value="00">Prueba (00)</option>
                    </select>
                  </div>
                  <div className="sa-corr-lista">
                    <div className="sa-corr-row sa-corr-head">
                      <span style={{ flex: 1 }}>Tipo de DTE</span>
                      <span style={{ width: 150, textAlign: 'right' }}>Último emitido</span>
                      <span style={{ width: 120, textAlign: 'right' }}>Próximo</span>
                    </div>
                    {TIPOS_DTE_CODIGO_MH.map(t => {
                      const v = sucCorrForm[t.code] ?? ''
                      const n = parseInt(String(v).replace(/\D/g, ''), 10)
                      const prox = Number.isInteger(n) ? n + 1 : null
                      return (
                        <div key={t.code} className="sa-corr-row">
                          <span className="sa-corr-label">{t.label}</span>
                          <input className="sa-corr-input" inputMode="numeric" value={v}
                            onChange={e => setSucCorrForm(f => ({ ...f, [t.code]: e.target.value.replace(/\D/g, '') }))}
                            placeholder="—" />
                          <span className={`sa-corr-prox ${prox ? '' : 'vacio'}`}>{prox ? `→ ${prox}` : '—'}</span>
                        </div>
                      )
                    })}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 14, lineHeight: 1.5 }}>
                    ⚠️ Llena solo los DTE que el cliente ya usaba; deja el resto vacío. No se baja un contador que ya esté más adelante (evita reusar números → rechazo 004 del MH).
                  </p>
                </div>
              )}
            </div>
            <div className="sa-modal-footer">
              {sucVista === 'lista' && (
                <button className="sa-btn-cancelar" onClick={() => setModalSucursales(null)} style={{ flex: 1 }}>Cerrar</button>
              )}
              {sucVista === 'correlativos' && (
                <>
                  <button className="sa-btn-cancelar" onClick={() => { setSucVista('lista'); setSucMsg(null) }} disabled={sucCorrGuardando}>← Volver</button>
                  <button className="sa-btn-guardar" onClick={guardarCorrelativos} disabled={sucCorrGuardando} style={{ marginTop: 0, flex: 1 }}>
                    {sucCorrGuardando ? 'Guardando…' : '💾 Guardar correlativos'}
                  </button>
                </>
              )}
              {sucVista === 'form' && (
                <>
                  <button className="sa-btn-cancelar" onClick={() => { setSucVista('lista'); setSucMsg(null) }} disabled={sucGuardando}>← Volver</button>
                  <button className="sa-btn-guardar" onClick={guardarSucursal} disabled={sucGuardando} style={{ marginTop: 0, flex: 1 }}>
                    {sucGuardando ? 'Guardando...' : (sucEditandoId ? 'Guardar cambios' : 'Crear sucursal')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}