// ══════════════════════════════════════════════════════════════════
// CATÁLOGO DE TIPOS DE DTE — Asistente de Certificación ORIÓN
//
// Cada entrada define las reglas de un tipo de DTE para la certificación.
// Para AGREGAR UN TIPO NUEVO (ej. los que faltan: 04, 07, 08, 09, 14, 15):
//   1. Agregá su entrada aquí con sus reglas.
//   2. Agregá su generador de venta en datosPrueba.js (GENERADORES).
//   3. Listo — la UI y el flujo lo toman automáticamente.
//
// `estado`:
//   'certificado' = ya pasó certificación, generador listo y probado.
//   'pendiente'   = aún no implementado (falta schema del MH). Aparece en la
//                   UI como "próximamente" pero no se puede generar todavía.
// ══════════════════════════════════════════════════════════════════

export const CATALOGO_DTE = [
  {
    code: 'FE', tipoNum: '01', version: 1,
    nombre: 'Factura', icon: '🧾',
    estado: 'certificado',
    receptor: 'ficticio',          // datos inventados, el MH los acepta
    requiereDocRelacionado: false,
    ivaIncluido: true,
    descripcion: 'Factura de consumidor final. Receptor ficticio.',
  },
  {
    code: 'CCF', tipoNum: '03', version: 3,
    nombre: 'Crédito Fiscal', icon: '📑',
    estado: 'certificado',
    receptor: 'real',              // NIT/NRC validados contra el padrón del MH
    requiereDocRelacionado: false,
    ivaIncluido: false,
    descripcion: 'Comprobante de Crédito Fiscal. Receptor contribuyente real.',
  },
  {
    code: 'NC', tipoNum: '05', version: 3,
    nombre: 'Nota de Crédito', icon: '↩️',
    estado: 'certificado',
    receptor: 'real',
    requiereDocRelacionado: true,  // referencia un CCF ya PROCESADO
    referenciaDe: 'CCF',
    ivaIncluido: false,
    descripcion: 'Acredita un CCF previo. Requiere un CCF procesado.',
  },
  {
    code: 'ND', tipoNum: '06', version: 3,
    nombre: 'Nota de Débito', icon: '↪️',
    estado: 'certificado',
    receptor: 'real',
    requiereDocRelacionado: true,
    referenciaDe: 'CCF',
    ivaIncluido: false,
    descripcion: 'Debita un CCF previo. Requiere un CCF procesado.',
  },
  {
    code: 'FEX', tipoNum: '11', version: 1,
    nombre: 'Factura de Exportación', icon: '🌎',
    estado: 'certificado',
    receptor: 'extranjero',        // receptor extranjero ficticio
    requiereDocRelacionado: false,
    ivaIncluido: false,            // exportación: IVA 0%
    descripcion: 'Exportación. Receptor extranjero ficticio, IVA 0%.',
  },

  // ── PENDIENTES (faltan schemas del MH — enchufar cuando estén) ──
  {
    code: 'NR', tipoNum: '04', version: 4,
    nombre: 'Nota de Remisión', icon: '🚚',
    estado: 'certificado',
    receptor: 'real',
    requiereDocRelacionado: false,
    ivaIncluido: false,
    descripcion: 'Traslado de bienes (sin facturar). NR no es venta — ampara despacho.',
  },
  {
    code: 'CR', tipoNum: '07', version: 2,
    nombre: 'Comprobante de Retención', icon: '🧮',
    estado: 'certificado',
    receptor: 'real',
    requiereDocRelacionado: false,
    ivaIncluido: false,
    descripcion: 'Retención de IVA 1% a un proveedor. Referencia física en pruebas.',
  },
  {
    code: 'ERET', tipoNum: '18', version: 1,
    nombre: 'Evento de Retorno', icon: '↩️',
    estado: 'certificado',
    receptor: 'ficticio',           // consumidor final (como la FE que devuelve)
    requiereDocRelacionado: true,   // referencia una FE ya PROCESADA
    referenciaDe: 'FE',
    ivaIncluido: true,
    descripcion: 'Devolución sobre FE (consumidor final). Genera y referencia una FE procesada.',
  },
  {
    code: 'CL', tipoNum: '08', version: 1,
    nombre: 'Comprobante de Liquidación', icon: '📊',
    estado: 'pendiente',
    descripcion: 'Liquidación. Pendiente de schema e implementación.',
  },
  {
    code: 'DCL', tipoNum: '09', version: 1,
    nombre: 'Documento Contable de Liquidación', icon: '📋',
    estado: 'pendiente',
    descripcion: 'Contable de liquidación. Pendiente de schema e implementación.',
  },
  {
    code: 'FSE', tipoNum: '14', version: 2,
    nombre: 'Factura de Sujeto Excluido', icon: '🧍',
    estado: 'certificado',
    receptor: 'sujetoExcluido',    // persona natural NO inscrita al IVA (productor, etc.)
    requiereDocRelacionado: false,
    ivaIncluido: false,            // FSE: no hay IVA, hay retención de renta 10%
    descripcion: 'Compra a sujeto NO inscrito al IVA. Vos sos el comprador.',
  },
  {
    code: 'CD', tipoNum: '15', version: 1,
    nombre: 'Comprobante de Donación', icon: '🎁',
    estado: 'pendiente',
    descripcion: 'Donación. Pendiente de schema e implementación.',
  },
]

// Solo los tipos listos para generar pruebas
export const TIPOS_CERTIFICADOS = CATALOGO_DTE.filter(t => t.estado === 'certificado')

// Cantidades de prueba sugeridas (referencia One Geo). EDITABLES en la UI.
export const CANTIDADES_SUGERIDAS = {
  FE: 90, CCF: 75, NR: 50, NC: 50, ND: 25, FEX: 90, FSE: 25, CR: 50, ERET: 5,
}

export function getTipoDTE(code) {
  return CATALOGO_DTE.find(t => t.code === code) || null
}
