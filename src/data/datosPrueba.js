// ══════════════════════════════════════════════════════════════════
// DATOS DE PRUEBA — Asistente de Certificación ORIÓN
// Banco de datos ficticios salvadoreños + generador de ventas de prueba.
//
// Estos datos se usan SOLO para generar DTE de prueba (ambiente "00")
// durante la certificación ante el MH. No tocan datos reales del negocio.
//
// REGLA CLAVE:
//  - FE / FEX: receptor 100% ficticio (el MH lo acepta).
//  - CCF / NC / ND: receptor debe ser un CONTRIBUYENTE REAL (el MH valida
//    NIT/NRC contra su padrón). Esos vienen del catálogo que carga One Geo.
// ══════════════════════════════════════════════════════════════════

// ── Nombres ficticios (consumidores finales para FE) ──
const NOMBRES_FICTICIOS = [
  'Carlos Alberto Méndez Flores', 'María José Rivera Campos',
  'José Antonio Hernández Mejía', 'Ana Gabriela Martínez Soto',
  'Luis Fernando Ramírez Cruz', 'Sofía Beatriz Guzmán Reyes',
  'Roberto Carlos Vásquez Lara', 'Claudia Patricia Morales Díaz',
  'Jorge Ernesto Flores Aguilar', 'Karla Yesenia Castro Romero',
  'Mario Alejandro Pérez Cortez', 'Gabriela Lucía Alfaro Mejía',
  'Óscar Mauricio Rivas Portillo', 'Diana Carolina Cáceres Bonilla',
  'Walter Eduardo Sánchez Quintanilla', 'Verónica Esmeralda Torres Lazo',
]

// ── Ubicaciones para datos de prueba (catálogos V2.0) ──
// Uso solo Usulután Oeste/Jiquilisco (ya validada en producción con One Geo).
// V2.0 reorganizó municipios y agregó codDistrito separado del municipio.
const UBICACIONES = [
  { codDep: '11', codMun: '26', codDistrito: '08', dep: 'Usulután', mun: 'Usulután Oeste', dist: 'Jiquilisco' },
]

// ── Direcciones ficticias ──
const DIRECCIONES = [
  'Colonia Escalón, Calle La Reforma #123',
  'Residencial Las Margaritas, Pasaje 4, Casa 17',
  'Barrio El Centro, 2a Avenida Norte #45',
  'Colonia Médica, Final 25 Avenida Norte',
  'Reparto Santa Fe, Boulevard del Hipódromo #88',
  'Urbanización La Sultana, Calle Principal #210',
]

// ── Actividades económicas (códigos MH CAT-019) ──
const ACTIVIDADES = [
  { cod: '47190', desc: 'Venta al por menor en comercios no especializados' },
  { cod: '46900', desc: 'Venta al por mayor de diversos productos' },
  { cod: '41001', desc: 'Construcción de edificios residenciales' },
  { cod: '56101', desc: 'Restaurantes y puestos de comida' },
  { cod: '45200', desc: 'Mantenimiento y reparación de vehículos' },
]

// ── Productos ficticios (para los items de las facturas) ──
const PRODUCTOS = [
  { codigo: 'P001', nombre: 'Cemento gris 42.5 kg', precioBase: 8.50 },
  { codigo: 'P002', nombre: 'Varilla de hierro 3/8"', precioBase: 6.25 },
  { codigo: 'P003', nombre: 'Lámina galvanizada', precioBase: 12.00 },
  { codigo: 'P004', nombre: 'Pintura látex galón', precioBase: 18.75 },
  { codigo: 'P005', nombre: 'Tubo PVC 1/2"', precioBase: 3.40 },
  { codigo: 'P006', nombre: 'Cerradura de pomo', precioBase: 9.90 },
  { codigo: 'P007', nombre: 'Brocha 4 pulgadas', precioBase: 2.15 },
  { codigo: 'P008', nombre: 'Cable eléctrico THHN (metro)', precioBase: 0.85 },
  { codigo: 'P009', nombre: 'Foco LED 9W', precioBase: 1.95 },
  { codigo: 'P010', nombre: 'Saco de arena', precioBase: 4.50 },
]

// ── Países para FEX (catálogo MH CAT-020 V2.0) ──
// V2.0: el catálogo oficial usa códigos ISO de 2 letras (no '9xxx' del v1).
// US = Estados Unidos. Otros comunes: GT, HN, NI, CR, MX, ES.
const PAISES_FEX = [
  { cod: 'US', nombre: 'Estados Unidos' },
]

const NOMBRES_EXTRANJEROS = [
  'Global Imports LLC', 'Central America Trading Co.',
  'Pacific Goods Inc.', 'Distribuidora Internacional S.A.',
]

// ── Helpers de aleatoriedad ──
const elegir = (arr) => arr[Math.floor(Math.random() * arr.length)]
const entero = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

// UUID v4 en MAYÚSCULAS (el MH lo exige así)
function uuidMayus() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  }).toUpperCase()
}

// Genera entre 1 y `maxItems` items de productos al azar
function generarItems(maxItems = 4) {
  const n = entero(1, maxItems)
  const usados = new Set()
  const items = []
  for (let i = 0; i < n; i++) {
    let prod = elegir(PRODUCTOS)
    let intentos = 0
    while (usados.has(prod.codigo) && intentos < 10) { prod = elegir(PRODUCTOS); intentos++ }
    usados.add(prod.codigo)
    const qty = entero(1, 8)
    items.push({
      codigo: prod.codigo,
      nombre: prod.nombre,
      precioBase: prod.precioBase,
      precioConIva: Math.round(prod.precioBase * 1.13 * 100) / 100,
      qty,
    })
  }
  return items
}

// ══════════════════════════════════════════════════════════════════
// GENERADORES DE VENTA POR TIPO
// Cada función devuelve un objeto `venta` con la forma EXACTA que
// transmitir.js espera. No duplica la lógica de construcción del DTE:
// solo provee los datos de entrada.
// ══════════════════════════════════════════════════════════════════

// FE — Factura consumidor final. Receptor ficticio.
export function generarVentaFE() {
  return {
    tipoDte: 'FE',
    codigoGeneracion: uuidMayus(),
    cliente: elegir(NOMBRES_FICTICIOS),
    correoReceptor: null,
    items: generarItems(4),
    condicionOperacion: 1,
    _esPrueba: true,
  }
}

// CCF — Crédito Fiscal. Receptor REAL (viene del catálogo de One Geo).
export function generarVentaCCF(contribuyenteReal) {
  if (!contribuyenteReal) throw new Error('CCF requiere un contribuyente real')
  return {
    tipoDte: 'CCF',
    codigoGeneracion: uuidMayus(),
    cliente: contribuyenteReal.nombre,
    nit: contribuyenteReal.nit,
    nrc: contribuyenteReal.nrc,
    codActividad: contribuyenteReal.codActividad,
    descActividad: contribuyenteReal.descActividad,
    nombreComercial: contribuyenteReal.nombreComercial || contribuyenteReal.nombre,
    codDep: contribuyenteReal.codDep,
    codMun: contribuyenteReal.codMun,
    codDistrito: contribuyenteReal.codDistrito || '01',
    direccion: contribuyenteReal.direccion,
    telefono: contribuyenteReal.telefono || null,
    correo: contribuyenteReal.correo || null,
    items: generarItems(5),
    condicionOperacion: 1,
    _esPrueba: true,
  }
}

// NC — Nota de Crédito. Referencia un CCF ya PROCESADO.
// `ccfProcesado` = objeto con { codigoGeneracion, fechaEmision, contribuyente, items }
export function generarVentaNC(ccfProcesado) {
  if (!ccfProcesado) throw new Error('NC requiere un CCF previo procesado')
  const c = ccfProcesado.contribuyente
  return {
    tipoDte: 'NC',
    codigoGeneracion: uuidMayus(),
    cliente: c.nombre,
    nit: c.nit, nrc: c.nrc,
    codActividad: c.codActividad, descActividad: c.descActividad,
    codDep: c.codDep, codMun: c.codMun, codDistrito: c.codDistrito || '01', direccion: c.direccion,
    telefono: c.telefono || null, correo: c.correo || null,
    // NC acredita parte del CCF: usamos un subconjunto de sus items
    items: (ccfProcesado.items || []).slice(0, 1),
    documentoRelacionado: {
      tipoDocumento: '03',
      tipoGeneracion: 2,
      numeroDocumento: ccfProcesado.codigoGeneracion,
      fechaEmision: ccfProcesado.fechaEmision,
    },
    condicionOperacion: 1,
    _esPrueba: true,
  }
}

// ND — Nota de Débito. Igual que NC pero debita.
export function generarVentaND(ccfProcesado) {
  if (!ccfProcesado) throw new Error('ND requiere un CCF previo procesado')
  const c = ccfProcesado.contribuyente
  return {
    tipoDte: 'ND',
    codigoGeneracion: uuidMayus(),
    cliente: c.nombre,
    nit: c.nit, nrc: c.nrc,
    codActividad: c.codActividad, descActividad: c.descActividad,
    codDep: c.codDep, codMun: c.codMun, codDistrito: c.codDistrito || '01', direccion: c.direccion,
    telefono: c.telefono || null, correo: c.correo || null,
    items: (ccfProcesado.items || []).slice(0, 1),
    documentoRelacionado: {
      tipoDocumento: '03',
      tipoGeneracion: 2,
      numeroDocumento: ccfProcesado.codigoGeneracion,
      fechaEmision: ccfProcesado.fechaEmision,
    },
    condicionOperacion: 1,
    _esPrueba: true,
  }
}

// FEX — Factura de Exportación. Receptor extranjero ficticio.
export function generarVentaFEX() {
  const pais = elegir(PAISES_FEX)
  const items = generarItems(3).map(it => ({ ...it, precioConIva: it.precioBase }))
  return {
    tipoDte: 'FEX',
    codigoGeneracion: uuidMayus(),
    cliente: elegir(NOMBRES_EXTRANJEROS),
    tipoPersonaFex: elegir([1, 2]),
    tipoDocFex: '37',
    numDocFex: String(entero(100000, 999999)),
    nombreReceptorFex: elegir(NOMBRES_EXTRANJEROS),
    nombreComercialFex: elegir(NOMBRES_EXTRANJEROS),
    paisDestino: pais.cod,
    nombrePaisFex: pais.nombre,
    direccionFex: 'Dirección en el exterior',
    actividadFex: 'Importación de materiales de construcción',
    telefonoFex: null,
    correoFex: null,
    items,
    seguro: 0,
    flete: 0,
    codIncoterms: '09',
    descIncoterms: 'FOB',
    condicionOperacion: 1,
    _esPrueba: true,
  }
}

// Mapa de generadores por tipo (para el catálogo extensible)
// FSE — Factura Sujeto Excluido. Le COMPRO a un productor/persona natural
// no inscrito al IVA. Receptor con DUI, sin NIT/NRC.
export function generarVentaFSE() {
  // Códigos de actividad económica VERIFICADOS contra CAT-019 oficial V2.0.
  const productores = [
    { nombre: 'José Antonio Hernández Cruz', dui: '01234567-8', codAct: '01111', descAct: 'Cultivo de cereales excepto arroz y para forrajes' },
    { nombre: 'María Elena Pérez de Romero', dui: '02345678-9', codAct: '01410', descAct: 'Cría y engorde de ganado bovino' },
    { nombre: 'Carlos Roberto Ayala', dui: '03456789-0', codAct: '03110', descAct: 'Pesca marítima de altura y costera' },
  ]
  const p = productores[Math.floor(Math.random() * productores.length)]
  const ubic = UBICACIONES[Math.floor(Math.random() * UBICACIONES.length)]
  const direccion = DIRECCIONES[Math.floor(Math.random() * DIRECCIONES.length)]
  // Items de compra (productos agrícolas / no industriales)
  const itemsCompra = [
    { codigo: 'M01', nombre: 'Quintal de maíz blanco', precioBase: 18.50 },
    { codigo: 'F01', nombre: 'Quintal de frijol rojo', precioBase: 95.00 },
    { codigo: 'L01', nombre: 'Litro de leche cruda', precioBase: 0.55 },
    { codigo: 'C01', nombre: 'Quintal de café cereza', precioBase: 65.00 },
  ]
  const items = [itemsCompra[Math.floor(Math.random() * itemsCompra.length)]]
    .map(p => ({ ...p, qty: Math.floor(Math.random() * 4) + 1 }))

  return {
    tipoDte: 'FSE',
    codigoGeneracion: uuidMayus(),
    cliente: p.nombre,
    docReceptor: p.dui,
    tipoDocReceptor: '13', // DUI
    codActividadReceptor: p.codAct,
    descActividadReceptor: p.descAct,
    codDep: ubic.codDep, codMun: ubic.codMun, codDistrito: ubic.codDistrito || '01',
    direccion,
    telefono: null, correo: null,
    items,
    condicionOperacion: 1,
    formaPago: 'efectivo',
    _esPrueba: true,
  }
}

// NR — Nota de Remisión. Traslado de mercadería SIN facturar todavía.
// Receptor con NIT (contribuyente o cliente). bienTitulo CAT-025.
export function generarVentaNR(contribuyente) {
  // Si no hay contribuyente real, usar uno ficticio con NIT genérico.
  const c = contribuyente || {
    nombre: 'CLIENTE GENÉRICO PARA REMISIÓN',
    nit: '00000000000000',
    nrc: null,
    codActividad: '47190',
    descActividad: 'Venta al por menor en establecimientos no especializados',
    codDep: '11', codMun: '26', codDistrito: '08',
    direccion: 'Dirección de entrega',
    telefono: null, correo: null,
  }
  const items = generarItems(3)
  // CAT-025 Título: 01=Depósito, 02=Propiedad, 03=Consignación, 04=Traslado, 05=Otros
  const titulos = ['01', '02', '03', '04']
  const bienTitulo = titulos[Math.floor(Math.random() * titulos.length)]

  return {
    tipoDte: 'NR',
    codigoGeneracion: uuidMayus(),
    cliente: c.nombre,
    nit: c.nit, nrc: c.nrc,
    codActividad: c.codActividad, descActividad: c.descActividad,
    codDep: c.codDep, codMun: c.codMun, codDistrito: c.codDistrito || '01', direccion: c.direccion,
    telefono: c.telefono || null, correo: c.correo || null,
    items,
    bienTitulo,
    _esPrueba: true,
  }
}

// CR — Comprobante de Retención (07). Receptor REAL (NIT+NRC+actividad).
// Referencia FÍSICA (tipoGeneracion 1): el MH no valida existencia de documentos
// físicos, ideal para certificar en lote sin CCF de proveedor reales.
export function generarVentaRetencion(contribuyenteReal) {
  if (!contribuyenteReal) throw new Error('Retención requiere un contribuyente real')
  const monto = Math.round((Math.random() * 900 + 50) * 100) / 100 // 50–950
  const ivaRet = Math.round(monto * 0.01 * 100) / 100              // 1%
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' })
  return {
    tipoDte: 'Retencion',
    codigoGeneracion: uuidMayus(),
    cliente: contribuyenteReal.nombre,
    nit: contribuyenteReal.nit,
    nrc: contribuyenteReal.nrc,
    codActividad: contribuyenteReal.codActividad,
    descActividad: contribuyenteReal.descActividad,
    nombreComercial: contribuyenteReal.nombreComercial || contribuyenteReal.nombre,
    codDep: contribuyenteReal.codDep,
    codMun: contribuyenteReal.codMun,
    codDistrito: contribuyenteReal.codDistrito || '01',
    direccion: contribuyenteReal.direccion,
    telefono: contribuyenteReal.telefono || null,
    correo: contribuyenteReal.correo || null,
    lineasRetencion: [{
      tipoDocRef: '03', tipoGeneracion: '1',
      numDocumento: String(Math.floor(Math.random() * 900000) + 100000),
      fechaEmision: hoy, montoSujeto: monto,
      codigoRetencion: '22', ivaRetenido: ivaRet,
      descripcion: 'Retención IVA 1%',
    }],
    totalSujetoRetencion: monto,
    totalIVAretenido: ivaRet,
    subtotal: monto, total: ivaRet,
    _esPrueba: true,
  }
}

// ERET — Evento de Retorno. Reporta la devolución de una FE ya PROCESADA
// (consumidor final, que no admite Nota de Crédito). Referencia esa FE.
// `feProcesada` = { codigoGeneracion, fechaEmision, items, cliente, total }
// El backend lee el dte_json de la FE original para reflejar los montos exactos.
export function generarVentaRetorno(feProcesada) {
  if (!feProcesada) throw new Error('El Evento de Retorno requiere una FE previa procesada')
  const items = (feProcesada.items || []).map(it => ({
    ...it,
    codigoGeneracion: feProcesada.codigoGeneracion,
  }))
  return {
    tipoDte: 'Retorno',
    codigoGeneracion: uuidMayus(),
    cliente: feProcesada.cliente || 'Consumidor Final',
    items,
    documentosRetorno: [{
      tipoDocumento: '01',
      codigoGeneracion: feProcesada.codigoGeneracion,
      fechaEmision: feProcesada.fechaEmision,
    }],
    total: feProcesada.total || 0,
    _esPrueba: true,
  }
}

export const GENERADORES = {
  FE: generarVentaFE,
  CCF: generarVentaCCF,
  NR: generarVentaNR,
  NC: generarVentaNC,
  ND: generarVentaND,
  FEX: generarVentaFEX,
  FSE: generarVentaFSE,
  CR: generarVentaRetencion,
  ERET: generarVentaRetorno,
}

export { NOMBRES_FICTICIOS, UBICACIONES, ACTIVIDADES, PRODUCTOS, PAISES_FEX, uuidMayus }
