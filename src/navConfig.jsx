// ══════════════════════════════════════════════════════════════
// navConfig.jsx — Configuración de navegación compartida
// Lo usan Sidebar.jsx y Dashboard.jsx. NO importa nada de App.jsx
// para evitar imports circulares (App → Dashboard → Sidebar → App).
// ══════════════════════════════════════════════════════════════

// ── Íconos SVG (heredan color vía currentColor) ──
export const NavIcon = ({ name }) => {
  const paths = {
    dashboard: <><line x1="4" y1="20" x2="4" y2="12"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="9"/><line x1="22" y1="20" x2="2" y2="20"/></>,
    caja: <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></>,
    venta: <><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2l2.4 12.5a2 2 0 0 0 2 1.5h7.7a2 2 0 0 0 2-1.5L21 7H5.2"/></>,
    inventario: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></>,
    compras: <><path d="M6 7V6a3 3 0 0 1 6 0v1M6 7h12l1 13H5L6 7z" transform="translate(3 0)"/><path d="M9 7V6a3 3 0 0 1 6 0v1"/><path d="M5 7h14l1 13H4L5 7z"/></>,
    clientes: <><circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6M21 20v-1a5 5 0 0 0-3.5-4.7"/></>,
    factura: <><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 9h1M9 13h6M9 17h6"/></>,
    operaciones: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V4z"/><path d="M9 11h6M9 15h4"/></>,
    cotizacion: <><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 13h6M9 17h4"/></>,
    sucursal: <><path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M4 21v-7h6v7"/></>,
    config: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></>,
    usuario: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></>,
    empleados: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="10" r="2.2"/><path d="M5 16.5a3.5 3.5 0 0 1 7 0"/><path d="M14.5 9.5h3.5M14.5 13h3.5"/></>,
    marcacion: <><circle cx="12" cy="13" r="8"/><path d="M12 9.5v4l2.5 1.5"/><path d="M8 2.5h8"/></>,
    contadores: <><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h2M14 18h2"/></>,
    reportes: <><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/></>,
    certificacion: <><circle cx="12" cy="9" r="6"/><path d="M9 14l-1.5 7L12 18l4.5 3L15 14"/><path d="M12 6.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L8.8 8.8l2.2-.3z"/></>,
    salir: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></>,
    luna: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></>,
    sol: <><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    inicio: <><line x1="4" y1="20" x2="4" y2="12"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="9"/><line x1="22" y1="20" x2="2" y2="20"/></>,
    onegeo: <><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3"/><path d="M9 9v.01M9 13v.01M9 17v.01"/></>,
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

// ── Color por categoría (se ve bien en claro y oscuro) ──
export const NAV_COLOR = {
  dashboard: '#4a8fe8', caja: '#00d4aa', venta: '#22c55e', inventario: '#f59e0b',
  compras: '#ec4899', clientes: '#8b5cf6', factura: '#4f8cff', operaciones: '#06b6d4',
  cotizacion: '#14b8a6', sucursal: '#f97316', config: '#64748b', usuario: '#a855f7',
  certificacion: '#eab308', inicio: '#4a8fe8', onegeo: '#4a8fe8', empleados: '#0ea5e9', marcacion: '#10b981',
  contadores: '#0891b2',
  reportes: '#7c3aed',
}

// ── Ítems del menú lateral ──
export const NAV_ITEMS = [
  { icon: 'dashboard', label: 'Dashboard',      path: '/',            permiso: 'ver_dashboard' },
  { icon: 'venta', label: 'Punto de Venta', path: '/ventas',      permiso: 'ver_punto_venta' },
  { icon: 'caja', label: 'Caja',            path: '/caja',        permiso: 'ver_punto_venta' },
  { icon: 'inventario', label: 'Inventario',     path: '/inventario',  permiso: 'ver_inventario' },
  { icon: 'compras', label: 'Compras',        path: '/compras',     permiso: 'ver_compras' },
  { icon: 'clientes', label: 'Clientes',       path: '/clientes',    permiso: 'ver_clientes' },
  { section: 'PERSONAL' },
  { icon: 'empleados', label: 'Empleados',      path: '/empleados',   permiso: 'gestionar_personal', modulo: 'empleados' },
  { section: 'FACTURACIÓN' },
  { icon: 'factura', label: 'Facturas DTE',   path: '/facturas',    permiso: 'ver_facturas' },
  { icon: 'operaciones', label: 'Operaciones',    path: '/operaciones', permiso: 'ver_facturas' },
  { icon: 'contadores', label: 'Contadores',     path: '/contadores',  permiso: 'ver_facturas', modulo: 'contadores' },
  { icon: 'reportes', label: 'Reportes',       path: '/reportes',    permiso: 'ver_reportes' },
  { icon: 'cotizacion', label: 'Cotizaciones',   path: '/cotizaciones',permiso: 'ver_cotizaciones' },
  { section: 'SISTEMA' },
  { icon: 'sucursal', label: 'Sucursales',     path: '/sucursales',  permiso: 'ver_configuracion' },
  { icon: 'config', label: 'Configuración',  path: '/config',      permiso: 'ver_configuracion' },
  { icon: 'usuario', label: 'Usuarios',       path: '/usuarios',    permiso: 'ver_usuarios' },
  { icon: 'certificacion', label: 'Certificación',  path: '/certificacion', soloCertificacion: true },
  { icon: 'onegeo', label: 'Panel One Geo',  path: '/superadmin', soloMaestro: true },
]
