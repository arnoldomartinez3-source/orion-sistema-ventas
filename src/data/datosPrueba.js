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

// ── Departamentos y municipios de El Salvador (códigos MH CAT-012/013) ──
// codDep / codMun según catálogo oficial. Muestra representativa.
const UBICACIONES = [
  { codDep: '06', codMun: '14', dep: 'San Salvador', mun: 'San Salvador Centro' },
  { codDep: '06', codMun: '20', dep: 'San Salvador', mun: 'Soyapango' },
  { codDep: '05', codMun: '13', dep: 'La Libertad', mun: 'Santa Tecla' },
  { codDep: '02', codMun: '14', dep: 'Santa Ana', mun: 'Santa Ana Centro' },
  { codDep: '08', codMun: '17', dep: 'San Miguel', mun: 'San Miguel Centro' },
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

// ── Países para FEX (códigos MH CAT-021) ──
// Países para FEX (catálogo MH CAT-021).
// Usamos SOLO '9300' (OTROS), confirmado como válido en el contexto de One Geo.
// Para certificar no se necesita variedad de países, solo que el MH los acepte.
const PAISES_FEX = [
  { cod: '9300', nombre: 'OTROS' },
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
    codDep: c.codDep, codMun: c.codMun, direccion: c.direccion,
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
    codDep: c.codDep, codMun: c.codMun, direccion: c.direccion,
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
export const GENERADORES = {
  FE: generarVentaFE,
  CCF: generarVentaCCF,
  NC: generarVentaNC,
  ND: generarVentaND,
  FEX: generarVentaFEX,
}

export { NOMBRES_FICTICIOS, UBICACIONES, ACTIVIDADES, PRODUCTOS, PAISES_FEX, uuidMayus }