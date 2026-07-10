// ══════════════════════════════════════════════════════════════════════
// anexosMH — Módulo Contadores (Etapa 1)
//
// Genera, a partir de los DTE ya emitidos/recibidos en un período (mes),
// los archivos CSV que el contador sube al portal de Declaraciones en Línea
// del Ministerio de Hacienda (MH) de El Salvador, y calcula las casillas de
// los formularios F07 (IVA) y F14 (Pago a Cuenta).
//
// Etapa 1: CCF (Anexo 1 ventas + Anexo 3 compras + Anexo de anulados) y el
// resumen F07/F14. Etapa 2: consumidor final (Anexo 2, resumido por día,
// 23 columnas según spec MH jul-2026). NC/ND, FSE y retenciones se agregan
// en etapas siguientes.
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

// ── Anexo 1 — Ventas a Contribuyentes (CCF, y NC/ND a contribuyente). 20 columnas ──
// Las Notas de Crédito (05) restan (montos NEGATIVOS); las Notas de Débito (06)
// suman. El MH los quiere en el MISMO anexo que los CCF que ajustan.
export function generarAnexo1(ventasCCF, opts = {}) {
  const { tipoOperacion = '1', tipoIngreso = '2' } = opts
  const filas = ventasCCF.map(f => {
    const signo = String(f.tipoDte).toUpperCase() === 'NC' ? -1 : 1
    const gravada = round2((parseFloat(f.subtotal) || 0) * signo)
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

// ── Anexo 2 — Detalle de Ventas a Consumidor Final (FE tipo 01 / FEX tipo 11). ──
// A diferencia del Anexo 1 (una fila por CCF), el Anexo 2 se reporta
// RESUMIDO POR DÍA: una fila por (fecha, tipo de documento), con el rango de
// documentos DEL–AL emitidos ese día. 23 columnas (layout MH jul-2026).
//
// Reglas propias (spec MH, distintas al Anexo 1):
//   • H/I = CÓDIGO DE GENERACIÓN (sin guiones) del primer/último DTE del día
//     (ordenado por correlativo), NO el número de control.
//   • N "Ventas Gravadas Locales" va CON IVA INCLUIDO (lo que pagó el cliente).
//     El F07 usa la base NETA por separado (casilla 96) — ver `totales`.
//   • D/E/F/G llevan el literal 'N/A' (no aplica a DTE), no van vacías.
export function generarAnexo2(ventasFE, opts = {}) {
  const { tipoOperacion = '1', tipoIngreso = '2' } = opts
  // Agrupa por día (fechaEmision) + tipo de documento.
  const grupos = new Map()
  for (const f of ventasFE) {
    const clave = `${f.fechaEmision}|${codTipo(f.tipoDte)}`
    if (!grupos.has(clave)) grupos.set(clave, [])
    grupos.get(clave).push(f)
  }

  const filas = []
  const metaFilas = [] // valores netos por fila (para F07), en paralelo a `filas`
  const claves = [...grupos.keys()].sort()
  for (const clave of claves) {
    // Primer/último del día = por correlativo del número de control (orden de emisión).
    const docs = grupos.get(clave)
      .slice()
      .sort((a, b) => uuidLimpio(a.numeroControl).localeCompare(uuidLimpio(b.numeroControl)))
    const primero = docs[0]
    const ultimo = docs[docs.length - 1]
    const tipo = codTipo(primero.tipoDte)

    const gravadaNeta = round2(docs.reduce((s, f) => s + (parseFloat(f.subtotal) || 0), 0))
    const debito = round2(gravadaNeta * IVA_RATE)
    const gravadaConIva = round2(gravadaNeta + debito) // columna N: con IVA incluido
    const exentas = 0, noSujetas = 0, exentasNoProp = 0
    const expCA = 0, expFuera = 0, expServ = 0, zonasFrancas = 0, terceros = 0
    const total = round2(exentas + exentasNoProp + noSujetas + gravadaConIva + expCA + expFuera + expServ + zonasFrancas + terceros)
    // Tipo de Ingreso (Renta): FEX (11) = 9 (exportación); resto = default.
    const ingreso = tipo === '11' ? '9' : String(tipoIngreso)

    filas.push([
      fechaDMY(primero.fechaEmision),   // A Fecha de Emisión (día)
      '4',                              // B Clase de Documento (DTE)
      tipo,                             // C Tipo de Documento (01 FC / 11 FEX)
      'N/A',                            // D Número de Resolución
      'N/A',                            // E Serie de Documento
      'N/A',                            // F Nº Control Interno (Del)
      'N/A',                            // G Nº Control Interno (Al)
      uuidLimpio(primero.codigoGeneracion), // H Nº Documento (Del) = cód. generación del primero
      uuidLimpio(ultimo.codigoGeneracion),  // I Nº Documento (Al) = cód. generación del último
      '',                               // J Nº Máquina Registradora (vacío para DTE)
      fmt(exentas),                     // K Ventas Exentas
      fmt(exentasNoProp),               // L Ventas Exentas No Sujetas a Proporcionalidad
      fmt(noSujetas),                   // M Ventas No Sujetas
      fmt(gravadaConIva),               // N Ventas Gravadas Locales (CON IVA incluido)
      fmt(expCA),                       // O Exportaciones Dentro de C.A.
      fmt(expFuera),                    // P Exportaciones Fuera de C.A.
      fmt(expServ),                     // Q Exportaciones de Servicios
      fmt(zonasFrancas),                // R Ventas a Zonas Francas y DPA (tasa 0)
      fmt(terceros),                    // S Ventas a Cuenta de Terceros No Domic.
      fmt(total),                       // T Total Ventas
      String(tipoOperacion),            // U Tipo de Operación (Renta)
      ingreso,                          // V Tipo de Ingreso (Renta)
      '2',                              // W Número de Anexo
    ])
    metaFilas.push({ gravadaNeta, debito, gravadaConIva })
  }

  return {
    filas,
    csv: toCSV(filas),
    totales: {
      gravadaNeta: round2(metaFilas.reduce((s, m) => s + m.gravadaNeta, 0)), // base F07 (casilla 96)
      debito: round2(metaFilas.reduce((s, m) => s + m.debito, 0)),           // débito F07 (casilla 140)
      gravadaConIva: round2(metaFilas.reduce((s, m) => s + m.gravadaConIva, 0)), // suma columna N
      total: round2(filas.reduce((s, r) => s + parseFloat(r[19]), 0)),       // suma columna T
      documentos: ventasFE.length, // Nº de FE individuales
      cantidad: filas.length,      // Nº de filas (días × tipo)
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

// ── Anexo 5 — Compras a Sujetos Excluidos (casilla 66). 13 columnas ──
// Fuente: manual oficial F-07 V14 (700-DGII-MN-2021-26031), sección VII.
// La FSE (tipo 14) la emite el declarante para documentar una compra a un
// sujeto excluido del IVA. Se lee de `operaciones` (tipoDte 'FSE').
//   • A = tipo de documento del excluido (1 NIT / 2 DUI / 3 Otro).
//   • E = Nº de serie = SELLO del DTE; F = Nº de documento = código de generación.
//   • H = Retención de IVA 13% (0.00 si no aplica — es DISTINTA de la retención
//     de renta `reteRenta`, que va en el F-14). Se toma de `op.reteIva13`.
//   • Columnas I,J,K,L (tipo operación/clasificación/sector/costo-gasto) aplican
//     desde feb-2024; M = número de anexo = 5.
export function generarAnexo5Excluidos(fseOps, opts = {}) {
  const { tipoOperacion = '1', clasificacion = '2', sector = '4', tipoCostoGasto = '1' } = opts
  const filas = fseOps.map(op => {
    // Identificación: si hay NIT úsalo (tipo 1), si no DUI (tipo 2).
    const nit = soloDigitos(op.nit)
    const dui = soloDigitos(op.dui)
    const tipoDoc = nit ? '1' : '2'
    const numDoc = nit || dui
    const monto = round2(op.subtotal != null ? op.subtotal : op.total)
    const retIva13 = round2(op.reteIva13 || 0) // retención de IVA 13% (0 si no aplica)
    return [
      tipoDoc,                                  // A Tipo de Documento
      numDoc,                                   // B Número NIT/DUI/Otro (sin guiones)
      String(op.cliente || '').toUpperCase(),   // C Nombre del sujeto excluido
      fechaDMY(op.fechaEmision),                // D Fecha de Emisión (DD/MM/AAAA)
      String(op.dte_sello || ''),               // E Número de Serie (= sello)
      uuidLimpio(op.codigoGeneracion),          // F Número de Documento (= cód. generación)
      fmt(monto),                               // G Monto de la Operación
      fmt(retIva13),                            // H Retención de IVA 13%
      String(tipoOperacion),                    // I Tipo de Operación
      String(clasificacion),                    // J Clasificación (1 Costo / 2 Gasto)
      String(sector),                           // K Sector
      String(tipoCostoGasto),                   // L Tipo de Costo/Gasto
      '5',                                      // M Número de Anexo
    ]
  })
  return {
    filas,
    csv: toCSV(filas),
    totales: {
      monto: round2(filas.reduce((s, r) => s + parseFloat(r[6]), 0)),        // casilla 66
      retencionIva: round2(filas.reduce((s, r) => s + parseFloat(r[7]), 0)),
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
// Ventas CCF → casillas 95 (base) / 135 (débito); Ventas a Consumidor (Facturas)
// → 96 (base) / 140 (débito). El débito total (150) suma ambas.
export function calcularF07(totVentasCCF, totVentasFE, totCompras) {
  const debitoCCF = round2(totVentasCCF.debito)
  const debitoFactura = round2(totVentasFE.debito)
  const debito = round2(debitoCCF + debitoFactura)
  const credito = round2(totCompras.credito)
  return {
    ventasGravadasCCF: round2(totVentasCCF.gravada),     // 95
    debitoFiscalCCF: debitoCCF,                          // 135
    ventasGravadasFactura: round2(totVentasFE.gravada),  // 96 (base neta)
    debitoFiscalFactura: debitoFactura,                  // 140
    ventasGravadas: round2(totVentasCCF.gravada + totVentasFE.gravada), // total base ventas
    debitoFiscal: debito,                                // (compat) débito total
    comprasGravadas: round2(totCompras.gravada),         // 80
    creditoFiscal: credito,                              // 130
    totalDebito: debito,                                 // 150
    totalCredito: credito,                               // 145
    impuestoDeterminado: round2(Math.max(0, debito - credito)), // 160
    remanenteCredito: round2(Math.max(0, credito - debito)),    // 155
    totalPagar: round2(Math.max(0, debito - credito)),          // 521 (sin retenciones aún)
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
// operaciones: docs de la colección `operaciones` (FSE/Retención/FEX/NR). OJO:
// no traen `fechaEmision` — la página debe normalizarla desde createdAt antes.
export function generarDeclaracion({ facturas = [], compras = [], operaciones = [], anio, mes, defaults = {} }) {
  // Anexo 1 = CCF + NC/ND a contribuyente (los que tienen NIT/NRC). Procesados,
  // no invalidados, del período. NC resta, ND suma (lo maneja generarAnexo1).
  const ventasAnexo1 = facturas.filter(f =>
    ['CCF', 'NC', 'ND'].includes(String(f.tipoDte).toUpperCase()) &&
    f.dte_estado === 'PROCESADO' &&
    !estaInvalidada(f) &&
    enPeriodo(f.fechaEmision, anio, mes)
  )
  const ventasCCF = ventasAnexo1.filter(f => String(f.tipoDte).toUpperCase() === 'CCF')
  const notasCredito = ventasAnexo1.filter(f => String(f.tipoDte).toUpperCase() === 'NC')
  const notasDebito = ventasAnexo1.filter(f => String(f.tipoDte).toUpperCase() === 'ND')
  // Ventas a consumidor final: FE (tipo 01). Procesadas, no invalidadas, del período.
  const ventasFE = facturas.filter(f =>
    ['FE', 'FC', '01'].includes(String(f.tipoDte).toUpperCase()) &&
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

  // Compras a sujetos excluidos (FSE tipo 14) — se leen de `operaciones`.
  const fseExcluidos = operaciones.filter(op =>
    String(op.tipoDte).toUpperCase() === 'FSE' &&
    op.dte_estado === 'PROCESADO' &&
    enPeriodo(op.fechaEmision, anio, mes)
  )

  const anexo1 = generarAnexo1(ventasAnexo1, defaults.ventas)
  const anexo2 = generarAnexo2(ventasFE, defaults.ventas)
  const anexo3 = generarAnexo3(comprasPeriodo, defaults.compras)
  const anexo5 = generarAnexo5Excluidos(fseExcluidos, defaults.excluidos)
  const anulados = generarAnexoAnulados(invalidados)
  // F07: CCF (Anexo 1) en casillas 95/135; Consumidor (Anexo 2) en 96/140 con
  // su base NETA (gravadaNeta), no la columna N que va con IVA.
  const totVentasFE = { gravada: anexo2.totales.gravadaNeta, debito: anexo2.totales.debito }
  const f07 = calcularF07(anexo1.totales, totVentasFE, anexo3.totales)
  f07.comprasSujetosExcluidos = anexo5.totales.monto // casilla 66 (informativa)
  // F14: ingresos gravables = ventas gravadas NETAS (CCF + consumidor).
  const f14 = calcularF14(round2(anexo1.totales.gravada + anexo2.totales.gravadaNeta))
  return { anexo1, anexo2, anexo3, anexo5, anulados, f07, f14, ventasCCF, notasCredito, notasDebito, ventasFE, comprasPeriodo, fseExcluidos, invalidados }
}
