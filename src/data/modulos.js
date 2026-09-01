// ══════════════════════════════════════════════════════════════════
// MÓDULOS OPCIONALES — se activan/desactivan POR EMPRESA desde el
// Panel One Geo → "Plan y límites". Es el candado de NEGOCIO (lo que
// One Geo vende), independiente del candado de PERMISOS (por usuario/rol).
//
// Un módulo se muestra solo si: la empresa lo tiene activo Y el usuario
// tiene el permiso correspondiente.
//
// ── CÓMO AGREGAR UN MÓDULO FUTURO (ej. Contabilidad) ──
//   1) Agregá su entrada acá abajo (key único + label + defaultOn).
//   2) En src/navConfig.jsx, poné `modulo: '<key>'` en su ítem de menú.
//   3) En src/App.jsx, envolvé su <Route> con el candado (ver empleados).
//   4) Construí su página.
//   → El toggle en el Panel One Geo aparece automáticamente.
//
// `defaultOn`: qué pasa cuando la empresa AÚN no tiene guardado ese módulo.
//   true  = ya estaba en uso por todos → no se lo quitamos (grandfather).
//   false = módulo nuevo de pago → apagado hasta que One Geo lo active y venda.
// ══════════════════════════════════════════════════════════════════

export const MODULOS = [
  {
    key: 'empleados',
    label: 'Empleados y Planilla',
    desc: 'Registro de personal, asistencia y planilla',
    icon: 'empleados',
    defaultOn: true, // ya lo usaban todos → no se lo quitamos a nadie
  },
  {
    key: 'correo',
    label: 'Envío por correo',
    desc: 'Enviar el DTE (PDF + JSON) al cliente por correo electrónico',
    icon: 'config',
    defaultOn: false, // servicio de pago → apagado hasta que One Geo lo active
  },
  {
    key: 'contadores',
    label: 'Contadores',
    desc: 'Genera los CSV para el portal del MH (F07 IVA + F14 Pago a Cuenta)',
    icon: 'config',
    defaultOn: false, // servicio de pago → apagado hasta que One Geo lo active
  },
  {
    key: 'comandas',
    label: 'Comandas / Vales',
    desc: 'El vendedor arma un vale (comanda) y el cajero lo cobra después. Ideal para ferreterías con despacho.',
    icon: 'venta',
    defaultOn: false, // opcional → apagado hasta que el cliente lo pida
  },
  {
    key: 'comandas_despacho',
    label: 'Comandas: control de despacho',
    desc: 'Agrega el paso "Para despachar": marcar el vale como entregado tras cobrarlo (bodeguero o el mismo vendedor).',
    icon: 'venta',
    defaultOn: false, // opcional → solo si el negocio controla la entrega
  },
  // Futuros (ejemplos — descomentar/crear cuando existan):
  // { key: 'contabilidad', label: 'Contabilidad', desc: 'Libros contables y reportes', icon: 'config', defaultOn: false },
]

const MODULOS_MAP = Object.fromEntries(MODULOS.map(m => [m.key, m]))

// ¿Está activo el módulo para esta empresa?
//  - modulosEmpresa: el mapa guardado en empresas/{id}.modulos ({} si no hay).
//  - esMaestro: One Geo ve todo, siempre.
export function moduloEstaActivo(key, modulosEmpresa, esMaestro = false) {
  if (esMaestro) return true
  const def = MODULOS_MAP[key]
  if (!def) return true // key desconocida = no gateada = visible
  // null/undefined = aún cargando → no ocultar (evita parpadeo)
  if (modulosEmpresa == null) return true
  const val = modulosEmpresa[key]
  return val === undefined ? def.defaultOn : val === true
}
