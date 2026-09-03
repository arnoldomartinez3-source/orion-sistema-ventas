// ══════════════════════════════════════════════════════════════════
// CATÁLOGO DE PERMISOS Y ROLES — FUENTE ÚNICA DE VERDAD
//
// Antes esta lista estaba TRIPLICADA (PermisosContext, AuthContext y
// Usuarios.jsx). Si una se desincronizaba de otra → bugs. Ahora vive acá y
// los tres la importan. Para agregar/quitar un permiso, se toca SOLO este archivo.
//
//  - CATALOGO_PERMISOS → estructura agrupada por módulo (para la UI de Usuarios).
//  - TODOS_LOS_PERMISOS → lista plana (para el administrador principal).
//  - ROLES → definición visual de cada rol.
//  - PERMISOS_POR_ROL → permisos por defecto de cada rol.
// ══════════════════════════════════════════════════════════════════

// ── Catálogo agrupado por módulo (lo que el admin togglea en Gestión de Usuarios) ──
export const CATALOGO_PERMISOS = [
  {
    key: 'dashboard', label: 'Dashboard', icon: '📊',
    permisos: [
      { key: 'ver_dashboard', label: 'Ver Dashboard y estadísticas' },
      { key: 'ver_reportes',  label: 'Ver Reportes (ventas, vendedores, productos)' },
    ],
  },
  {
    key: 'punto_venta', label: 'Punto de Venta', icon: '🛒',
    permisos: [
      { key: 'ver_punto_venta',    label: 'Acceder al Punto de Venta' },
      { key: 'realizar_ventas',    label: 'Realizar ventas' },
      { key: 'aplicar_descuentos', label: 'Aplicar descuentos' },
      { key: 'cancelar_ventas',    label: 'Cancelar ventas' },
      { key: 'despachar_comandas', label: 'Despachar comandas / vales' },
    ],
  },
  {
    key: 'inventario', label: 'Inventario', icon: '📦',
    permisos: [
      { key: 'ver_inventario',        label: 'Ver inventario' },
      { key: 'crear_productos',       label: 'Crear productos' },
      { key: 'editar_productos',      label: 'Editar productos' },
      { key: 'eliminar_productos',    label: 'Eliminar productos' },
      { key: 'ver_kardex',            label: 'Ver Kardex' },
      { key: 'registrar_movimientos', label: 'Registrar movimientos de stock' },
      { key: 'importar_exportar',     label: 'Importar / Exportar Excel' },
    ],
  },
  {
    key: 'clientes', label: 'Clientes', icon: '👥',
    permisos: [
      { key: 'ver_clientes',    label: 'Ver clientes' },
      { key: 'crear_clientes',  label: 'Crear clientes' },
      { key: 'editar_clientes', label: 'Editar clientes' },
      { key: 'eliminar_clientes', label: 'Eliminar clientes' },
    ],
  },
  {
    key: 'compras', label: 'Compras', icon: '🛍️',
    permisos: [
      { key: 'ver_compras',    label: 'Ver compras' },
      { key: 'crear_compras',  label: 'Registrar compras' },
      { key: 'editar_compras', label: 'Editar compras' },
      { key: 'eliminar_compras', label: 'Eliminar compras' },
    ],
  },
  {
    key: 'cotizaciones', label: 'Cotizaciones', icon: '📄',
    permisos: [
      { key: 'ver_cotizaciones',    label: 'Ver cotizaciones' },
      { key: 'crear_cotizaciones',  label: 'Crear cotizaciones' },
      { key: 'editar_cotizaciones', label: 'Editar cotizaciones' },
      { key: 'eliminar_cotizaciones', label: 'Eliminar cotizaciones' },
      { key: 'convertir_a_venta',   label: 'Convertir cotización a venta' },
    ],
  },
  {
    key: 'facturas', label: 'Facturas DTE', icon: '🧾',
    permisos: [
      { key: 'ver_facturas',         label: 'Ver facturas' },
      { key: 'crear_facturas',       label: 'Crear / Emitir DTE' },
      { key: 'editar_facturas',      label: 'Editar facturas' },
      { key: 'eliminar_facturas',    label: 'Eliminar facturas' },
      { key: 'imprimir_facturas',    label: 'Imprimir / Descargar PDF' },
      { key: 'compartir_whatsapp',   label: 'Compartir por WhatsApp' },
    ],
  },
  {
    key: 'configuracion', label: 'Configuración', icon: '⚙️',
    permisos: [
      { key: 'ver_configuracion',    label: 'Ver configuración' },
      { key: 'editar_configuracion', label: 'Editar configuración de empresa' },
    ],
  },
  {
    key: 'usuarios', label: 'Gestión de Usuarios', icon: '👤',
    permisos: [
      { key: 'ver_usuarios',    label: 'Ver usuarios' },
      { key: 'crear_usuarios',  label: 'Crear usuarios' },
      { key: 'editar_usuarios', label: 'Editar usuarios y permisos' },
      { key: 'eliminar_usuarios', label: 'Eliminar usuarios' },
    ],
  },
  {
    key: 'personal', label: 'Personal (RR.HH.)', icon: '🧑‍💼',
    permisos: [
      { key: 'gestionar_personal', label: 'Gestionar empleados y planilla' },
    ],
  },
]

// ── Lista plana de TODOS los permisos (derivada del catálogo) ──
export const TODOS_LOS_PERMISOS = CATALOGO_PERMISOS.flatMap(m => m.permisos.map(p => p.key))

// ── Roles (definición visual) ──
export const ROLES = {
  administrador: { label: 'Administrador', color: '#2E6FD4', icon: '👑', desc: 'Acceso completo al sistema' },
  cajero:        { label: 'Cajero',        color: '#00C296', icon: '💰', desc: 'Punto de Venta y Caja' },
  vendedor:      { label: 'Vendedor',      color: '#4A8FE8', icon: '🛒', desc: 'Ventas y Cotizaciones' },
  bodeguero:     { label: 'Bodeguero',     color: '#f59e0b', icon: '📦', desc: 'Inventario y Compras' },
  contador:      { label: 'Contador',      color: '#8b5cf6', icon: '📊', desc: 'Facturas y Reportes (solo lectura)' },
}

// ── Permisos por defecto de cada rol ──
// OJO: 'administrador' tiene acceso TOTAL de por sí (ver puede() en PermisosContext
// y esAdmin() en las reglas). Su lista es completa por consistencia, pero aunque se
// le quitaran permisos, sigue siendo admin. Para dar acceso PARCIAL usá otro rol.
export const PERMISOS_POR_ROL = {
  administrador: TODOS_LOS_PERMISOS,
  cajero: [
    'ver_dashboard', 'ver_punto_venta', 'realizar_ventas',
    'aplicar_descuentos', 'despachar_comandas', 'ver_clientes', 'crear_clientes',
    'ver_facturas', 'imprimir_facturas',
  ],
  vendedor: [
    'ver_dashboard', 'ver_punto_venta', 'realizar_ventas',
    'aplicar_descuentos', 'despachar_comandas', 'ver_clientes', 'crear_clientes', 'editar_clientes',
    'ver_cotizaciones', 'crear_cotizaciones', 'editar_cotizaciones',
    'convertir_a_venta', 'ver_facturas', 'imprimir_facturas', 'compartir_whatsapp',
  ],
  bodeguero: [
    'ver_dashboard', 'ver_inventario', 'crear_productos', 'editar_productos',
    'ver_kardex', 'registrar_movimientos', 'importar_exportar',
    'ver_compras', 'crear_compras', 'editar_compras',
  ],
  contador: [
    'ver_dashboard', 'ver_reportes', 'ver_facturas', 'imprimir_facturas',
    'ver_clientes', 'ver_compras', 'ver_cotizaciones', 'ver_inventario',
  ],
}
