// ══════════════════════════════════════════════════════════════════════
// anexosMH — Módulo Contadores (Etapa 1)
//
// Genera, a partir de los DTE ya emitidos/recibidos en un período (mes),
// los archivos CSV que el contador sube al portal de Declaraciones en Línea
// del Ministerio de Hacienda (MH) de El Salvador, y calcula las casillas de
// los formularios F07 (IVA) y F14 (Pago a Cuenta).
//
// Etapa 1: CCF (Anexo 1 ventas + Anexo 3 compras + Anexo de anulados) y el
// resumen F07/F14. Consumidor final (Anexo 2), NC/ND, FSE y retenciones se
// agregan en etapas siguientes.
//
// Reglas MH comunes a los CSV: UTF-8, separador ';', SIN encabezados, montos
// con punto y 2 decimales, Nº de control y código de generación SIN guiones,
// fechas dd/mm/aaaa. NO se incluyen DTE rechazados; los invalidados van solo
// en el anexo de anulados.
//
// Este módulo es JS puro (sin DOM) para poder verificarse contra el fixture.
// La descarga de archivos (Blob) vive en la página Contadores.
// ══════════════════════════════════════════════════════════════════════

export const IVA_RATE = 0.13
export const PAGO_CUENTA_RATE = 0.0175

// Redondeo a 2 decimales (half-up) y formato de monto para el CSV.
export const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100
export const fmt = (n) => round2(n).toFixed(2)

// Deja solo alfanuméricos en MAYÚSCULAS (para Nº de control y código de generación sin guiones).
export const uuidLimpio = (s) => String(s || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
// Deja solo dígitos (para NIT/NRC sin guion).
export const soloDigitos = (s) => String(s || '').replace(/\D/g, '')

// 'YYYY-MM-DD' → 'dd/mm/aaaa'
export const fechaDMY = (f) => {
  const m = String(f || '').match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(f || '')
}

// Tipo de DTE (string interno) → código MH.
const COD_TIPO = {
  FE: '01', FC: '01', CCF: '03', NR: '04', NC: '05', ND: '06',
  FEX: '11', FSE: '14', RETENCION: '07',
}
export const codTipo = (t) => COD_TIPO[String(t || '').toUpperCase()] || String(t || '')

// ¿El DTE está invalidado/anulado? (varios campos por compatibilidad con datos viejos)
export const estaInvalidada = (f) => (
  f.dte_estado_invalidacion === 'INVALIDADO' || f.estadoPago === 'anulada' || f.anulada === true
)

// ¿La fecha 'YYYY-MM-DD' cae en el período (anio, mes)?
export const enPeriodo = (fechaStr, anio, mes) => {
  const m = String(fechaStr || '').match(/(\d{4})-(\d{2})-(\d{2})/)
  return !!m && Number(m[1]) === Number(anio) && Number(m[2]) === Number(mes)
}

// Une filas (arrays) en un CSV con ';' y saltos CRLF.
const toCSV = (filas) => filas.map(r => r.join(';')).join('\r\n')

// ── Anexo 1 — Ventas a Contribuyentes (CCF). 20 columnas ──
export function generarAnexo1(ventasCCF, opts = {}) {
  const { tipoOperacion = '1', tipoIngreso = '2' } = opts
  const filas = ventasCCF.map(f => {
    const gravada = round2(f.subtotal)
    const debito = round2(gravada * IVA_RATE)
    const exentas = 0, noSujetas = 0, terceros = 0, debTerceros = 0
    const total = round2(exentas + noSujetas + gravada + debito + terceros + debTerceros)
    return [
      fechaDMY(f.fechaEmision),                    // A Fecha de Emisión
      '4',                                         // B Clase de Documento (DTE)
      codTipo(f.tipoDte),                          // C Tipo de Documento
      uuidLimpio(f.numeroControl),                 // D Número de Resolución (= Nº control sin guiones)
      String(f.dte_sello || ''),                   // E Número de Serie (= sello)
      uuidLimpio(f.codigoGeneracion),              // F Número de Documento (= cód. generación sin guiones)
      '',                                          // G Nº Control Interno (vacío para DTE)
      soloDigitos(f.nrc) || soloDigitos(f.nit),    // H NIT o NRC del Cliente
      String(f.cliente || '').toUpperCase(),       // I Nombre / Razón Social
      fmt(exentas),                                // J Ventas Exentas
      fmt(noSujetas),                              // K Ventas No Sujetas
      fmt(gravada),                                // L Ventas Gravadas Locales
      fmt(debito),                                 // M Débito Fiscal
      fmt(terceros),                               // N Ventas a Cuenta de Terceros
      fmt(debTerceros),                            // O Débito por Venta a Terceros
      fmt(total),                                  // P Total Ventas
      '',                                          // Q DUI del Cliente
      String(tipoOperacion),                       // R Tipo de Operación (Renta)
      String(tipoIngreso),                         // S Tipo de Ingreso (Renta)
      '1',                                         // T Número de Anexo
    ]
  })
  return {
    filas,
    csv: toCSV(filas),
    totales: {
      gravada: round2(filas.reduce((s, r) => s + parseFloat(r[11]), 0)),
      debito: round2(filas.reduce((s, r) => s + parseFloat(r[12]), 0)),
      total: round2(filas.reduce((s, r) => s + parseFloat(r[15]), 0)),
      cantidad: filas.length,
    },
  }
}

// ── Anexo 3 — Compras. 21 columnas ──
export function generarAnexo3(compras, opts = {}) {
  const { tipoOperacion = '1', clasificacion = '1', sector = '2', tipoCostoGasto = '5' } = opts
  const filas = compras.map(c => {
    const gravada = round2(c.subtotal)
    const credito = round2(gravada * IVA_RATE)
    const totalCompras = round2(gravada) // G+H+I+J+K+L+M (solo J tiene valor en Etapa 1)
    return [
      fechaDMY(c.fechaCompra),                                   // A Fecha de Emisión
      '4',                                                       // B Clase de Documento
      codTipo(c.tipoDteProveedor),                               // C Tipo de Documento
      uuidLimpio(c.codigoGeneracionProveedor),                   // D Número de Documento (cód. generación)
      soloDigitos(c.proveedorNrc) || soloDigitos(c.proveedorNit),// E NIT o NRC del Proveedor
      String(c.proveedorNombre || '').toUpperCase(),             // F Nombre del Proveedor
      fmt(0),                                                    // G Compras Internas Exentas
      fmt(0),                                                    // H Internaciones Exentas
      fmt(0),                                                    // I Importaciones Exentas
      fmt(gravada),                                              // J Compras Internas Gravadas
      fmt(0),                                                    // K Internaciones Gravadas
      fmt(0),                                                    // L Importaciones Gravadas Bienes
      fmt(0),                                                    // M Importaciones Gravadas Servicios
      fmt(credito),                                              // N Crédito Fiscal
      fmt(totalCompras),                                         // O Total de Compras
      '',                                                        // P DUI del Proveedor
      String(tipoOperacion),                                     // Q Tipo de Operación
      String(clasificacion),                                     // R Clasificación (1 Costo / 2 Gasto)
      String(sector),                                            // S Sector
      String(tipoCostoGasto),                                    // T Tipo de Costo/Gasto
      '3',                                                       // U Número de Anexo
    ]
  })
  return {
    filas,
    csv: toCSV(filas),
    totales: {
      gravada: round2(filas.reduce((s, r) => s + parseFloat(r[9]), 0)),
      credito: round2(filas.reduce((s, r) => s + parseFloat(r[13]), 0)),
      total: round2(filas.reduce((s, r) => s + parseFloat(r[14]), 0)),
      cantidad: filas.length,
    },
  }
}

// ── Anexo de Documentos Anulados / Invalidados. 10 columnas ──
export function generarAnexoAnulados(invalidados) {
  const filas = invalidados.map(f => [
    uuidLimpio(f.numeroControl),      // A Número de Resolución (Nº control sin guiones)
    '4',                              // B Clase de Documento
    '0',                              // C Desde (Preimpreso)
    '0',                              // D Hasta (Preimpreso)
    codTipo(f.tipoDte),               // E Tipo de Documento
    'D',                              // F Tipo de Detalle (D = Invalidado)
    String(f.dte_sello || ''),        // G Serie (= sello)
    '0',                              // H Desde (rango control)
    '0',                              // I Hasta (rango control)
    uuidLimpio(f.codigoGeneracion),   // J Código de Generación
  ])
  return { filas, csv: toCSV(filas), totales: { cantidad: filas.length } }
}

// ── F07 — casillas de IVA (para contraste con el portal) ──
export function calcularF07(totVentas, totCompras) {
  const debito = round2(totVentas.debito)
  const credito = round2(totCompras.credito)
  return {
    ventasGravadas: round2(totVentas.gravada), // 95
    debitoFiscal: debito,                       // 135
    comprasGravadas: round2(totCompras.gravada),// 80
    creditoFiscal: credito,                     // 130
    totalDebito: debito,                        // 150
    totalCredito: credito,                      // 145
    impuestoDeterminado: round2(Math.max(0, debito - credito)), // 160
    remanenteCredito: round2(Math.max(0, credito - debito)),    // 155
    totalPagar: round2(Math.max(0, debito - credito)),          // 521 (Etapa 1: sin retenciones)
  }
}

// ── F14 — Pago a Cuenta (1.75% sobre ingresos gravables) ──
export function calcularF14(ingresosServicios) {
  const ingresos = round2(ingresosServicios)
  const entero = round2(ingresos * PAGO_CUENTA_RATE)
  return {
    ingresosServicios: ingresos, // casilla 26
    enteroComputado: entero,     // 44/45
    totalPagar: entero,          // 56
  }
}

// ── Orquestador: dado el set de DTE del mes, arma todo ──
// facturas: docs de ventas/facturas emitidas (con dte_estado, dte_sello, etc.)
// compras:  docs de la colección compras
export function generarDeclaracion({ facturas = [], compras = [], anio, mes, defaults = {} }) {
  // Ventas CCF procesadas y NO invalidadas, del período.
  const ventasCCF = facturas.filter(f =>
    String(f.tipoDte).toUpperCase() === 'CCF' &&
    f.dte_estado === 'PROCESADO' &&
    !estaInvalidada(f) &&
    enPeriodo(f.fechaEmision, anio, mes)
  )
  // Compras del período (Etapa 1: CCF).
  const comprasPeriodo = compras.filter(c =>
    enPeriodo(c.fechaCompra, anio, mes) &&
    ['CCF', 'FSE', '03', '14'].includes(String(c.tipoDteProveedor).toUpperCase())
  ).filter(c => String(c.tipoDteProveedor).toUpperCase() === 'CCF' || codTipo(c.tipoDteProveedor) === '03')
  // Invalidados del período (por fecha de invalidación si existe, si no por emisión).
  const invalidados = facturas.filter(f =>
    estaInvalidada(f) &&
    enPeriodo(f.dte_invalidacionFecEmi || f.fechaEmision, anio, mes)
  )

  const anexo1 = generarAnexo1(ventasCCF, defaults.ventas)
  const anexo3 = generarAnexo3(comprasPeriodo, defaults.compras)
  const anulados = generarAnexoAnulados(invalidados)
  const f07 = calcularF07(anexo1.totales, anexo3.totales)
  const f14 = calcularF14(anexo1.totales.gravada) // Etapa 1: ingresos = ventas CCF netas
  return { anexo1, anexo3, anulados, f07, f14, ventasCCF, comprasPeriodo, invalidados }
}
