import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { importPKCS8, SignJWT } from 'jose'
import { createPrivateKey } from 'crypto'

// En Firebase Functions, admin se auto-inicializa con las credenciales del entorno.
// No se necesita cargar un service account manual.
if (!getApps().length) {
  initializeApp()
}

const db = getFirestore()

const MH_URLS = {
  '00': 'https://apitest.dtes.mh.gob.sv',
  '01': 'https://api.dtes.mh.gob.sv'
}

const TIPOS_DTE = {
  'FE':  '01',
  'CCF': '03',
  'NR':  '04',
  'NC':  '05',
  'ND':  '06',
  'FEX': '11',
  'FSE': '14',
  'Retencion': '07'
}

const VERSIONES = {
  '01': 2,
  '03': 4,
  '04': 4,
  '05': 4,
  '06': 4,
  '11': 3,
  '14': 2,
  '07': 1
}

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100

// Obtiene un correlativo único de forma atómica para el tipo de DTE, sucursal y ambiente.
// La transacción de Firestore garantiza que dos llamadas simultáneas nunca obtengan el mismo número.
async function obtenerCorrelativo(tipoDteCode, codEstableMH, codPuntoVentaMH, ambiente) {
  const docId = `${tipoDteCode}_${codEstableMH}_${codPuntoVentaMH}_${ambiente}`
  const contadorRef = db.collection('contadores').doc(docId)
  let correlativo
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(contadorRef)
    const actual = snap.exists ? (snap.data().valor || 0) : 0
    correlativo = actual + 1
    tx.set(contadorRef, {
      valor: correlativo,
      tipoDte: tipoDteCode,
      codEstableMH,
      codPuntoVentaMH,
      ambiente,
      actualizadoEn: FieldValue.serverTimestamp()
    }, { merge: true })
  })
  return correlativo
}

async function obtenerToken(ambiente, baseUrl, mh_usuario, mh_password) {
  const tokenSnap = await db.collection('mh_tokens').doc(ambiente).get()
  if (tokenSnap.exists) {
    const tokenData = tokenSnap.data()
    if (tokenData.expiraEn && Date.now() < tokenData.expiraEn) {
      return tokenData.token
    }
  }
  // CRÍTICO: codificar las credenciales con encodeURIComponent.
  // Application/x-www-form-urlencoded EXIGE que caracteres especiales
  // (@, &, +, =, espacios, etc.) estén codificados como %XX.
  // Sin esto, contraseñas con '@' rompen el parsing del MH y devuelven 401.
  const body = `user=${encodeURIComponent(mh_usuario)}&pwd=${encodeURIComponent(mh_password)}`
  const response = await fetch(`${baseUrl}/seguridad/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'ORION-OneGeoSystems/1.0'
    },
    body
  })
  const data = await response.json()
  if (data.status !== 'OK') throw new Error('Error autenticando con MH: ' + JSON.stringify(data))
  const token = data.body.token
  const expiraEn = Date.now() + (23 * 60 * 60 * 1000)
  await db.collection('mh_tokens').doc(ambiente).set({
    token, expiraEn, actualizadoEn: new Date()
  })
  return token
}

async function firmarDTE(dteJSON, privateKeyPem, password) {
  let privateKey
  try {
    const keyObj = createPrivateKey({
      key: privateKeyPem,
      format: 'pem',
      passphrase: password || undefined
    })
    const decryptedPem = keyObj.export({ type: 'pkcs8', format: 'pem' }).toString()
    privateKey = await importPKCS8(decryptedPem, 'RS512')
  } catch (e) {
    privateKey = await importPKCS8(privateKeyPem, 'RS512')
  }
  const jws = await new SignJWT(dteJSON)
    .setProtectedHeader({ alg: 'RS512' })
    .sign(privateKey)
  return jws
}

function buildDTE({ tipoDteNum, version, codigoGeneracion, numeroControl,
  ambiente, fecEmi, horEmi, emisor, receptor, cuerpo, resumen,
  documentoRelacionado = null }) {
  const esNCoND = ['05','06'].includes(tipoDteNum)
  const esFEX = tipoDteNum === '11'
  const esFSE = tipoDteNum === '14'
  const esNR = tipoDteNum === '04'
  const esRetencion = tipoDteNum === '07'

  const identificacion = {
    version,
    ambiente,
    tipoDte: tipoDteNum,
    numeroControl,
    codigoGeneracion,
    tipoModelo: 1,
    tipoOperacion: 1,
    tipoContingencia: null,
    fecEmi,
    horEmi,
    tipoMoneda: 'USD'
  }
  // FEX v3 corrigió el typo: ahora usa "motivoContin" como los demás.
  identificacion.motivoContin = null
  // NC/ND V2.0: campo nuevo 'fusion' (obligatorio en v4)
  if (tipoDteNum === '05' || tipoDteNum === '06') {
    identificacion.fusion = null
  }

  const dte = {
    identificacion,
    emisor,
    receptor,
  }

  // FSE v2 y Retención v1: estructura mínima — solo identificacion, emisor,
  // receptor, cuerpo, resumen y apendice. NO llevan documentoRelacionado,
  // otrosDocumentos, ventaTercero, compraTercero ni extension.
  if (!esFSE && !esRetencion) {
    // documentoRelacionado: NC/ND lo llevan con contenido. FEX v3 lo lleva null.
    // FE/CCF lo llevan null.
    dte.documentoRelacionado = documentoRelacionado

    // otrosDocumentos NO va en NC/ND ni NR, pero sí en FE/CCF/FEX (como null).
    if (!esNCoND && !esNR) {
      dte.otrosDocumentos = null
    }
    dte.ventaTercero = null
    // compraTercero: FEX v3 lo requiere (como null si no aplica).
    if (esFEX) {
      dte.compraTercero = null
    }
  }

  dte.cuerpoDocumento = cuerpo
  dte.resumen = resumen

  // Retención (07): 'extension' es REQUERIDA en la raíz.
  if (esRetencion) {
    dte.extension = { nombEntrega: null, docuEntrega: null, nombRecibe: null, docuRecibe: null, observaciones: null }
  }

  // extension: FEX NO la permite. V2.0 (FE/CCF/NC/ND/FSE) tampoco la lleva.
  dte.apendice = null
  return dte
}

function buildEmisor(config, sucursal, tipoDteNum = '01') {
  // Código de distrito (CAT-008). Fallback '01' si no está configurado.
  const distritoCod = sucursal?.codDistrito || config.codDistrito || sucursal?.distrito || config.distrito || '01'

  // ── V2.0: FE (01) y CCF (03) ──
  // Cambios v2/v4: se quita tipoEstablecimiento/codEstableMH/codPuntoVentaMH,
  // se agrega distrito (obligatorio) en la dirección. codEstable/codPuntoVenta se mantienen.
  if (tipoDteNum === '01' || tipoDteNum === '03' || tipoDteNum === '04') {
    return {
      nit: config.nit?.replace(/[-]/g, ''),
      nrc: config.nrc?.replace(/[-]/g, ''),
      nombre: config.empresaNombre || config.nombre,
      codActividad: config.codActividad || config.actividadEconomica,
      descActividad: config.descActividad || config.actividadEconomica,
      nombreComercial: config.nombreComercial || null,
      codEstable: sucursal?.codEstable || config.codEstable || '0001',
      codPuntoVenta: sucursal?.codPuntoVenta || config.codPuntoVenta || '1',
      direccion: {
        departamento: sucursal?.codDep || config.codDep || config.departamento || '06',
        municipio: sucursal?.codMun || config.codMun || '23',
        distrito: distritoCod,
        complemento: sucursal?.direccion || config.complemento || config.direccion || ''
      },
      telefono: config.telefono?.replace(/[-]/g, '') || '',
      correo: config.correo || config.email || '',
    }
  }

  // ── NC/ND V2.0 (05, 06): emisor SIN codEstable/codPuntoVenta ──
  // El schema v4 de NC y ND no permite esos campos (igual que en v3). Distrito sí va.
  if (tipoDteNum === '05' || tipoDteNum === '06') {
    return {
      nit: config.nit?.replace(/[-]/g, ''),
      nrc: config.nrc?.replace(/[-]/g, ''),
      nombre: config.empresaNombre || config.nombre,
      codActividad: config.codActividad || config.actividadEconomica,
      descActividad: config.descActividad || config.actividadEconomica,
      nombreComercial: config.nombreComercial || null,
      direccion: {
        departamento: sucursal?.codDep || config.codDep || config.departamento || '06',
        municipio: sucursal?.codMun || config.codMun || '23',
        distrito: distritoCod,
        complemento: sucursal?.direccion || config.complemento || config.direccion || ''
      },
      telefono: config.telefono?.replace(/[-]/g, '') || '',
      correo: config.correo || config.email || '',
    }
  }

  // ── FSE V2 (tipo 14): Factura Sujeto Excluido ──
  // El "emisor" en FSE es el COMPRADOR (ej: One Geo) — yo compro a un sujeto
  // no inscrito al IVA (productor, persona natural). Estructura compacta SIN
  // nombreComercial (el schema no lo incluye).
  if (tipoDteNum === '14') {
    return {
      nit: config.nit?.replace(/[-]/g, ''),
      nrc: config.nrc?.replace(/[-]/g, ''),
      nombre: config.empresaNombre || config.nombre,
      codActividad: config.codActividad || config.actividadEconomica,
      descActividad: config.descActividad || config.actividadEconomica,
      direccion: {
        departamento: sucursal?.codDep || config.codDep || config.departamento || '06',
        municipio: sucursal?.codMun || config.codMun || '23',
        distrito: distritoCod,
        complemento: sucursal?.direccion || config.complemento || config.direccion || ''
      },
      telefono: config.telefono?.replace(/[-]/g, '') || '',
      codEstable: sucursal?.codEstable || config.codEstable || '0001',
      codPuntoVenta: sucursal?.codPuntoVenta || config.codPuntoVenta || '1',
      correo: config.correo || config.email || '',
    }
  }

  // ── Comprobante de Retención V1 (tipo 07): emisor = agente de retención ──
  // Esquema v1 (más viejo): usa tipoEstablecimiento + códigos MH y dirección
  // SIN distrito (a diferencia de v2/v4). PRIMER BORRADOR — ajustar por rechazos MH.
  if (tipoDteNum === '07') {
    return {
      nit: config.nit?.replace(/[-]/g, ''),
      nrc: config.nrc?.replace(/[-]/g, ''),
      nombre: config.empresaNombre || config.nombre,
      codActividad: config.codActividad || config.actividadEconomica,
      descActividad: config.descActividad || config.actividadEconomica,
      nombreComercial: config.nombreComercial || null,
      tipoEstablecimiento: config.tipoEstablecimiento || '01',
      direccion: {
        departamento: sucursal?.codDep || config.codDep || config.departamento || '06',
        municipio: sucursal?.codMun || config.codMun || '23',
        complemento: sucursal?.direccion || config.complemento || config.direccion || ''
      },
      telefono: config.telefono?.replace(/[-]/g, '') || '',
      correo: config.correo || config.email || '',
      // El 07 usa estos nombres (no codEstable/codEstableMH/etc.)
      codigo: sucursal?.codEstable || config.codEstable || '0001',
      codigoMH: sucursal?.codEstableMH || config.codEstableMH || null,
      puntoVenta: sucursal?.codPuntoVenta || config.codPuntoVenta || '1',
      puntoVentaMH: sucursal?.codPuntoVentaMH || config.codPuntoVentaMH || null,
    }
  }

  // ── FEX V3 (tipo 11) ──
  // Cambios v3: quita tipoEstablecimiento/codEstableMH/codPuntoVentaMH,
  // agrega distrito y tipoRegimen. Mantiene codEstable/codPuntoVenta.
  // Campos de exportación: tipoItemExpor, recintoFiscal, regimen.
  return {
    nit: config.nit?.replace(/[-]/g, ''),
    nrc: config.nrc?.replace(/[-]/g, ''),
    nombre: config.empresaNombre || config.nombre,
    codActividad: config.codActividad || config.actividadEconomica,
    descActividad: config.descActividad || config.actividadEconomica,
    nombreComercial: config.nombreComercial || null,
    tipoItemExpor: 2,
    recintoFiscal: null,
    regimen: null,
    tipoRegimen: null,
    codEstable: sucursal?.codEstable || config.codEstable || '0001',
    codPuntoVenta: sucursal?.codPuntoVenta || config.codPuntoVenta || '1',
    direccion: {
      departamento: sucursal?.codDep || config.codDep || config.departamento || '06',
      municipio: sucursal?.codMun || config.codMun || '23',
      distrito: distritoCod,
      complemento: sucursal?.direccion || config.complemento || config.direccion || ''
    },
    telefono: config.telefono?.replace(/[-]/g, '') || '',
    correo: config.correo || config.email || '',
  }
}

// Receptor FEX: cliente extranjero. No tiene NIT/NRC salvadoreño.
// Lleva país destino, tipoPersona (1=natural, 2=jurídica) y datos de contacto.
// El MH exige valores reales (no null) en codPais, tipoDocumento, numDocumento,
// nombre, complemento, descActividad y nombrePais.
function buildReceptorFEX(venta) {
  return {
    // tipoPersona: 1=Persona Natural, 2=Persona Jurídica
    tipoPersona: parseInt(venta.tipoPersonaFex || 1),
    // tipoDocumento del receptor extranjero: '37'=Otro (el más común para extranjeros).
    // Otros válidos del catálogo MH CAT-022: '36'=NIT, '13'=DUI, '03'=Pasaporte, etc.
    tipoDocumento: venta.tipoDocFex || '37',
    numDocumento: venta.numDocFex || '0000',
    nombre: venta.nombreReceptorFex || venta.cliente || 'Cliente Exportacion',
    nombreComercial: venta.nombreComercialFex || venta.nombreReceptorFex || venta.cliente || 'Cliente Exportacion',
    // codPais del catálogo MH CAT-020 V2.0 (códigos ISO de 2 letras).
    // 'US'=Estados Unidos, 'GT'=Guatemala, 'HN'=Honduras... (catálogo CAT-020).
    codPais: venta.paisDestino || 'US',
    nombrePais: venta.nombrePaisFex || 'Estados Unidos',
    complemento: venta.direccionFex || venta.complementoFex || 'Direccion en el exterior',
    descActividad: venta.actividadFex || 'Exportacion de bienes',
    telefono: venta.telefonoFex?.replace(/[-]/g, '') || null,
    // El MH valida que correo sea un email real. Si no lo es, mandamos null.
    correo: esEmailValido(venta.correoFex) ? venta.correoFex.trim() : null
  }
}

// Valida formato básico de email. El MH rechaza correos mal formados.
function esEmailValido(email) {
  if (!email || typeof email !== 'string') return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function buildReceptorFE(venta) {
  // Detectar identificación del receptor:
  // - Si vienen tipoDocumento/numDocumento explícitos, usarlos
  // - Si no, derivar de venta.nit (14 dígitos) o venta.dui (9 dígitos)
  // El campo 'nit' del POS a veces guarda un DUI por error, así que se valida por longitud.
  let tipoDoc = venta.tipoDocumento || null
  let numDoc = venta.numDocumento || null
  if (!tipoDoc || !numDoc) {
    const nitLimpio = (venta.nit || '').replace(/[-\s]/g, '').trim()
    const duiLimpio = (venta.dui || '').replace(/[-\s]/g, '').trim()
    if (duiLimpio.length === 9) {
      tipoDoc = '13'; numDoc = duiLimpio
    } else if (nitLimpio.length === 14) {
      tipoDoc = '36'; numDoc = nitLimpio
    } else if (nitLimpio.length === 9) {
      // DUI guardado en campo NIT (caso histórico)
      tipoDoc = '13'; numDoc = nitLimpio
    }
  }
  return {
    tipoDocumento: tipoDoc,
    numDocumento: numDoc,
    nrc: null,
    nombre: venta.cliente || 'Consumidor Final',
    codActividad: null,
    descActividad: null,
    direccion: null,
    telefono: null,
    correo: esEmailValido(venta.correoReceptor) ? venta.correoReceptor.trim() : null
  }
}

function buildReceptorCCF(venta) {
  // CCF V2.0: receptor.direccion exige departamento, municipio, distrito, complemento.
  // Distrito viene como código (CAT-008). Fallback '01' si no está completo (algunos
  // contribuyentes viejos pueden no tener el código aún).
  return {
    nit: venta.nit?.replace(/[-]/g, '') || null,
    nrc: venta.nrc?.replace(/[-]/g, '') || null,
    nombre: venta.cliente,
    codActividad: venta.codActividad || null,
    descActividad: venta.descActividad || null,
    nombreComercial: venta.nombreComercial || null,
    direccion: {
      departamento: venta.codDep || null,
      municipio: venta.codMun || null,
      distrito: venta.codDistrito || '01',
      complemento: venta.direccion || ''
    },
    telefono: venta.telefono?.replace(/[-]/g, '') || null,
    correo: esEmailValido(venta.correo || venta.email) ? (venta.correo || venta.email).trim() : null
  }
}

// NC/ND V2.0: receptor cambia respecto a CCF — ahora usa tipoDocumento + numDocumento
// en lugar de nit directo. tipoDocumento 36=NIT, 13=DUI, etc. (CAT-022).
function buildReceptorNCND(venta) {
  // El tipo del DTE original que se está corrigiendo: '01'=FE, '03'=CCF.
  const tipoOriginal = venta.documentoRelacionado?.tipoDocumento || '03'
  const esSobreFE = tipoOriginal === '01'

  // Si la NC/ND es sobre una FE (consumidor final), el receptor puede no tener
  // documento. Aplicamos la MISMA lógica probada de buildReceptorFE / invalidar.js:
  // derivar tipoDoc/numDoc según lo disponible, y si no hay nada dejar AMBOS null.
  // (Regla del MH: si solo uno va null → rechazo código 024 "VALOR EN CAMPO NO APLICA".)
  if (esSobreFE) {
    let tipoDoc = venta.tipoDocumento || null
    let numDoc = venta.numDocumento || null
    if (!tipoDoc || !numDoc) {
      const nitLimpio = (venta.nit || '').replace(/[-\s]/g, '').trim()
      const duiLimpio = (venta.dui || '').replace(/[-\s]/g, '').trim()
      if (duiLimpio.length === 9) {
        tipoDoc = '13'; numDoc = duiLimpio
      } else if (nitLimpio.length === 14) {
        tipoDoc = '36'; numDoc = nitLimpio
      } else if (nitLimpio.length === 9) {
        tipoDoc = '13'; numDoc = nitLimpio  // DUI guardado en campo NIT
      } else {
        tipoDoc = null; numDoc = null       // consumidor final sin documento → ambos null
      }
    }
    return {
      tipoDocumento: tipoDoc,
      numDocumento: numDoc,
      nrc: null,
      nombre: venta.cliente || 'Consumidor Final',
      codActividad: null,
      descActividad: null,
      nombreComercial: null,
      direccion: {
        departamento: venta.codDep || null,
        municipio: venta.codMun || null,
        distrito: venta.codDistrito || '01',
        complemento: venta.direccion || ''
      },
      telefono: venta.telefono?.replace(/[-]/g, '') || null,
      correo: esEmailValido(venta.correo || venta.email) ? (venta.correo || venta.email).trim() : null
    }
  }

  // NC/ND sobre CCF (contribuyente): datos completos como antes.
  return {
    tipoDocumento: '36',  // NIT por defecto (CAT-022)
    numDocumento: venta.nit?.replace(/[-]/g, '') || null,
    nrc: venta.nrc?.replace(/[-]/g, '') || null,
    nombre: venta.cliente,
    codActividad: venta.codActividad || null,
    descActividad: venta.descActividad || null,
    nombreComercial: venta.nombreComercial || null,
    direccion: {
      departamento: venta.codDep || null,
      municipio: venta.codMun || null,
      distrito: venta.codDistrito || '01',
      complemento: venta.direccion || ''
    },
    telefono: venta.telefono?.replace(/[-]/g, '') || null,
    correo: esEmailValido(venta.correo || venta.email) ? (venta.correo || venta.email).trim() : null
  }
}

// Receptor FSE V2 (tipo 14): el "sujeto excluido" — quien me vendió.
// Es persona NO contribuyente del IVA: productor, persona natural, etc.
// Lleva tipoDocumento (CAT-022) + numDocumento. Sin NIT/NRC.
function buildReceptorFSE(venta) {
  // El sujeto excluido suele identificarse con DUI (tipoDocumento 13).
  // Buscar la actividad económica en varios campos posibles (compatibilidad
  // con módulo Operaciones que usa codActividad genérico, no el de CCF).
  return {
    tipoDocumento: venta.tipoDocReceptor || '13',
    numDocumento: (venta.docReceptor || venta.dui || '').replace(/[-]/g, ''),
    nombre: venta.cliente || venta.nombreReceptor,
    codActividad: venta.codActividad || venta.codActividadReceptor || venta.codActividadCcf || '',
    descActividad: venta.descActividad || venta.descActividadReceptor || venta.actividadCcf || '',
    direccion: {
      departamento: venta.codDep || '06',
      municipio: venta.codMun || '23',
      distrito: venta.codDistrito || '01',
      complemento: venta.direccion || ''
    },
    telefono: (venta.telefono || '').replace(/[-]/g, '') || null,
    correo: venta.correo || null
  }
}

// Cuerpo FSE V2 (tipo 14): item con campo 'compra' (no ventaGravada), sin IVA.
function buildCuerpoFSE(items) {
  return items.map((item, index) => {
    const cantidad = item.qty || item.cantidad || 1
    const precioUni = round2(parseFloat(item.precioBase || item.precioUni || 0))
    const compra = round2(precioUni * cantidad)
    return {
      numItem: index + 1,
      tipoItem: item.tipoItem || 1,
      cantidad,
      codigo: item.codigo || null,
      uniMedida: 59,
      descripcion: item.nombre || item.descripcion,
      precioUni,
      montoDescu: round2(item.descuento || item.montoDescu || 0),
      compra
    }
  })
}

// Resumen FSE V2: simple — totalCompra, reteRenta (10% sobre montos > $113.43),
// totalPagar. Sin IVA ni tributos.
function buildResumenFSE(venta, cuerpo) {
  const totalCompra = round2(cuerpo.reduce((s, i) => s + i.compra, 0))
  const totalDescu = round2(cuerpo.reduce((s, i) => s + i.montoDescu, 0))
  const subTotal = round2(totalCompra - totalDescu)

  // Retención de renta 10% (Art. 162-A CT): aplica cuando subTotal > $113.43.
  const aplicaRete = venta.aplicaReteRenta ?? (subTotal > 113.43)
  const reteRenta = aplicaRete ? round2(subTotal * 0.10) : 0
  const totalPagar = round2(subTotal - reteRenta)

  const formaPago = venta.formaPagoCod || (venta.formaPago === 'efectivo' ? '01' : '01')

  return {
    totalCompra,
    descu: 0,
    totalDescu,
    subTotal,
    reteRenta,
    totalPagar,
    totalLetras: numberToLetras(totalPagar),
    condicionOperacion: venta.tipoPago === 'credito' ? 2 : 1,
    pagos: [{
      codigo: formaPago,
      montoPago: totalPagar,
      referencia: venta.referenciaPago || null,
      plazo: null,
      periodo: null
    }],
    observaciones: venta.observaciones || null
  }
}

// Receptor NR V4 (tipo 04): muy similar al CCF pero con campo bienTitulo (CAT-025).
// bienTitulo = título por el que se remiten los bienes: 01=Depósito, 02=Propiedad,
// 03=Consignación, 04=Traslado, 05=Otros.
function buildReceptorNR(venta) {
  // Detectar tipo de documento automáticamente por longitud.
  // IMPORTANTE: tratamos strings vacíos como null (el MH no acepta "").
  // - NIT: 14 dígitos sin guiones → tipoDocumento 36
  // - DUI: 9 dígitos sin guiones → tipoDocumento 13
  const nitLimpio = (venta.nit || '').replace(/[-\s]/g, '').trim()
  const duiLimpio = (venta.dui || '').replace(/[-\s]/g, '').trim()
  const nrcLimpio = (venta.nrc || '').replace(/[-\s]/g, '').trim()
  let tipoDocumento = venta.tipoDocReceptor || null
  let numDocumento = null
  if (venta.docReceptor) {
    numDocumento = venta.docReceptor.replace(/[-\s]/g, '')
    if (!tipoDocumento) tipoDocumento = numDocumento.length === 9 ? '13' : '36'
  } else if (nitLimpio.length === 14) {
    tipoDocumento = tipoDocumento || '36'
    numDocumento = nitLimpio
  } else if (duiLimpio.length === 9) {
    tipoDocumento = tipoDocumento || '13'
    numDocumento = duiLimpio
  } else if (nitLimpio.length === 9) {
    // DUI guardado en campo NIT (caso histórico)
    tipoDocumento = tipoDocumento || '13'
    numDocumento = nitLimpio
  }
  // Si no logramos detectar, fallback a DUI (más común para NR a persona natural).
  // Sin tipoDocumento el MH rechaza con "Valor no permitido".
  if (!tipoDocumento) tipoDocumento = '13'
  // El MH rechaza nrc="" (string vacío). Solo enviar nrc si es válido (al menos 6 dígitos).
  // Si receptor no tiene NRC (persona natural típica), enviar null.
  const nrcFinal = nrcLimpio.length >= 6 ? nrcLimpio : null

  return {
    tipoDocumento,
    numDocumento,
    nrc: nrcFinal,
    nombre: venta.cliente || venta.nombreReceptor,
    codActividad: venta.codActividad || null,
    descActividad: venta.descActividad || null,
    nombreComercial: venta.nombreComercial || null,
    direccion: {
      departamento: venta.codDep || '06',
      municipio: venta.codMun || '23',
      distrito: venta.codDistrito || '01',
      complemento: venta.direccion || ''
    },
    telefono: (venta.telefono || '').replace(/[-]/g, '') || null,
    correo: venta.correo || null,
    bienTitulo: venta.bienTitulo || '02', // Propiedad por defecto
  }
}

// Cuerpo NR V4: similar a CCF pero SIN IVA (NR no factura, solo traslada bienes).
// El cuerpo lleva ventaGravada pero NO calcula tributo de IVA al cobrar.
function buildCuerpoNR(items) {
  return items.map((item, index) => {
    const cantidad = item.qty || item.cantidad || 1
    const precioUni = round2(parseFloat(item.precioBase || item.precioUni || 0))
    const ventaGravada = round2(precioUni * cantidad)
    return {
      numItem: index + 1,
      tipoItem: item.tipoItem || 1,
      numeroDocumento: null,
      codigo: item.codigo || null,
      codTributo: null,
      descripcion: item.nombre || item.descripcion,
      cantidad,
      uniMedida: 59,
      precioUni,
      montoDescu: round2(item.descuento || item.montoDescu || 0),
      ventaNoSuj: 0,
      ventaExenta: 0,
      ventaGravada,
      tributos: ['20']  // El MH exige tributos en el cuerpo (probar ["20"] como CCF)
    }
  })
}

// Resumen NR V4: simple, sin pagos (no se cobra). Solo totales y descripción.
function buildResumenNR(venta, cuerpo) {
  const totalGravada = round2(cuerpo.reduce((s, i) => s + i.ventaGravada, 0))
  const totalDescu = round2(cuerpo.reduce((s, i) => s + (i.montoDescu || 0), 0))
  const ivaCalculado = round2(totalGravada * 0.13)
  return {
    totalNoSuj: 0,
    totalExenta: 0,
    totalGravada,
    subTotalVentas: totalGravada,
    descuNoSuj: 0,
    descuExenta: 0,
    descuGravada: 0,
    porcentajeDescuento: 0,
    totalDescu,
    tributos: [{
      codigo: '20',
      descripcion: 'Impuesto al Valor Agregado 13%',
      valor: ivaCalculado
    }],
    subTotal: totalGravada,
    montoTotalOperacion: round2(totalGravada + ivaCalculado),
    totalLetras: numberToLetras(round2(totalGravada + ivaCalculado)),
    observaciones: venta.observaciones || null,
  }
}

// Reglas El Salvador:
// - FE (01): precioUni y ventaGravada van CON IVA incluido. ivaItem es el IVA contenido.
// - CCF (03): precioUni y ventaGravada van SIN IVA. tributos = ["20"] (sin ivaItem).
// - NC (05), ND (06): IVA agregado, mismo cálculo que CCF. PERO item tiene
// - FSE (14): cuerpo y resumen propios. Ver buildCuerpoFSE / buildResumenFSE.
// ── Comprobante de Retención (tipo 07) — PRIMER BORRADOR, ajustar por rechazos MH ──
// Receptor = el contribuyente al que se le retuvo (proveedor). Identificado por NIT+NRC.
function buildReceptorRetencion(venta) {
  return {
    tipoDocumento: '36', // 36 = NIT
    numDocumento: venta.nit?.replace(/[-]/g, '') || null,
    nrc: venta.nrc?.replace(/[-]/g, '') || null,
    nombre: venta.cliente,
    codActividad: venta.codActividad || null,
    descActividad: venta.descActividad || null,
    nombreComercial: venta.nombreComercial || null,
    direccion: {
      departamento: venta.codDep || '06',
      municipio: venta.codMun || '23',
      complemento: venta.direccion || ''
    },
    telefono: venta.telefono?.replace(/[-]/g, '') || null,
    correo: esEmailValido(venta.correo || venta.email) ? (venta.correo || venta.email).trim() : null,
  }
}

// Cuerpo: una línea por documento retenido (referencia al CCF/FSE + monto + IVA retenido).
function buildCuerpoRetencion(venta) {
  const lineas = venta.lineasRetencion || []
  return lineas.map((l, index) => ({
    numItem: index + 1,
    tipoDte: l.tipoDocRef || '03',
    tipoDoc: null,
    numDocumento: (l.numDocumento || '').trim().toUpperCase(),
    fechaEmision: (l.fechaEmision || '').slice(0, 10),
    montoSujetoGrav: round2(l.montoSujeto),
    codigoRetencionMH: l.codigoRetencion || '22',
    ivaRetenido: round2(l.ivaRetenido),
    descripcion: l.descripcion || 'Retención IVA',
  }))
}

function buildResumenRetencion(venta, cuerpo) {
  const totalSujeto = round2(cuerpo.reduce((s, i) => s + (i.montoSujetoGrav || 0), 0))
  const totalRetenido = round2(cuerpo.reduce((s, i) => s + (i.ivaRetenido || 0), 0))
  return {
    totalSujetoRetencion: totalSujeto,
    totalIVAretenido: totalRetenido,
    totalIVAretenidoLetras: numberToLetras(totalRetenido),
  }
}

function buildCuerpo(items, tipoDteNum, numeroDocumentoRelacionado = null) {
  return items.map((item, index) => {
    const cantidad = item.qty || item.cantidad || 1
    const precioBaseRaw = parseFloat(item.precioBase || item.precioUni || 0)
    const precioConIvaRaw = parseFloat(item.precioConIva || (precioBaseRaw * 1.13))

    let precioUni, ventaGravada, ivaItem
    if (tipoDteNum === '01') {
      // FE: precio al consumidor incluye IVA
      precioUni = round2(precioConIvaRaw)
      ventaGravada = round2(precioUni * cantidad)
      ivaItem = round2(ventaGravada * 0.13 / 1.13)
    } else if (tipoDteNum === '05' || tipoDteNum === '06') {
      // NC/ND V2.0: PRUEBA con round2 en todo (como V1.2 que sí pasó).
      // El schema dice multipleOf 1e-08 en el item, pero en la práctica el MH
      // parece validar contra round2. Probamos esta combinación.
      precioUni = round2(precioBaseRaw)
      ventaGravada = round2(precioUni * cantidad)
      ivaItem = round2(ventaGravada * 0.13)
    } else {
      // CCF, ND v3: IVA aparte (V1.2)
      precioUni = round2(precioBaseRaw)
      ventaGravada = round2(precioUni * cantidad)
      ivaItem = round2(ventaGravada * 0.13)
    }

    const itemBase = {
      numItem: index + 1,
      tipoItem: 1,
      // En FE/CCF: numeroDocumento siempre null.
      // En NC/ND: numeroDocumento debe ser el codigoGeneracion del DTE original
      //          que se está corrigiendo (mismo para todos los items de esta NC/ND).
      numeroDocumento: ['05','06'].includes(tipoDteNum) ? numeroDocumentoRelacionado : null,
      codigo: item.codigo || null,
      codTributo: null,
      descripcion: item.nombre || item.descripcion,
      cantidad,
      uniMedida: 59,
      precioUni,
      montoDescu: round2(item.descuento || item.montoDescu || 0),
      ventaNoSuj: 0,
      ventaExenta: 0,
      ventaGravada,
    }

    // psv (precio sugerido venta) solo en FE/CCF. ND v3 también va sin psv.
    // noGravado: FE/CCF lo llevan; NC v4 también; ND v3 no.
    if (!['05','06'].includes(tipoDteNum)) {
      itemBase.psv = 0
      itemBase.noGravado = 0
    }

    // NC/ND V2.0 (05, 06): regla confirmada por el MH —
    // cuerpo[].totalIva debe ir SIEMPRE en 0. El IVA real va únicamente
    // en resumen.tributos[].valor. Mandar otro valor da "CALCULO INCORRECTO".
    if (tipoDteNum === '05' || tipoDteNum === '06') {
      itemBase.noGravado = 0
      itemBase.ivaPerci = 0
      itemBase.ivaRete = 0
      itemBase.totalIva = 0
    }

    if (tipoDteNum === '03' || tipoDteNum === '05' || tipoDteNum === '06') {
      // CCF, NC y ND: el item lleva tributos ['20']. El resumen.tributos[].valor
      // consolida estos códigos del cuerpo (ítem 138 de la Normativa), por eso
      // deben ser consistentes: si el resumen declara tributo 20, el cuerpo también.
      itemBase.tributos = ['20']
    } else {
      // FE, FEX: ivaItem por línea, tributos null
      itemBase.tributos = null
      itemBase.ivaItem = ivaItem
    }

    return itemBase
  })
}

// Cuerpo FEX V3 (tipo 11): exportación. IVA tasa 0% (exenta).
// v3 agrega: tipoItem, codTributo, numeroDocumento al item.
function buildCuerpoFEX(items) {
  return items.map((item, index) => {
    const cantidad = item.qty || item.cantidad || 1
    const precioUni = round2(parseFloat(item.precioBase || item.precioUni || 0))
    const ventaGravada = round2(precioUni * cantidad)
    return {
      numItem: index + 1,
      tipoItem: 1,
      numeroDocumento: null,
      cantidad,
      codigo: item.codigo || null,
      codTributo: null,
      uniMedida: 59,
      descripcion: item.nombre || item.descripcion,
      precioUni,
      montoDescu: round2(item.descuento || item.montoDescu || 0),
      ventaGravada,
      tributos: ['C3'],
      noGravado: 0
    }
  })
}

// Resumen FEX: exportación. Sin IVA. Incluye flete, seguro e incoterms.
function buildResumenFEX(venta, cuerpo) {
  const totalGravada = round2(cuerpo.reduce((s, i) => s + i.ventaGravada, 0))
  const flete = round2(parseFloat(venta.fleteFex || 0))
  const seguro = round2(parseFloat(venta.seguroFex || 0))
  const totalDescu = round2(cuerpo.reduce((s, i) => s + (i.montoDescu || 0), 0))
  const montoTotal = round2(totalGravada - totalDescu + flete + seguro)

  const formaPago = venta.formaPago === 'efectivo' ? '01' :
                    venta.formaPago === 'tarjeta' ? '02' :
                    venta.formaPago === 'transferencia' ? '03' :
                    venta.formaPago === 'cheque' ? '04' : '99'

  return {
    totalGravada,
    descuGravada: 0,
    porcentajeDescuento: 0,
    totalDescu,
    seguro,
    flete,
    tributos: [{
      codigo: 'C3',
      descripcion: 'Impuesto al Valor Agregado (exportaciones) 0%',
      valor: 0
    }],
    montoTotalOperacion: montoTotal,
    totalNoGravado: 0,
    totalNoOnerosas: 0,
    totalPagar: montoTotal,
    totalLetras: numberToLetras(montoTotal),
    saldoFavor: 0,
    condicionOperacion: venta.tipoPago === 'credito' ? 2 : 1,
    pagos: [{
      codigo: formaPago,
      montoPago: montoTotal,
      referencia: venta.referenciaPago || null,
      plazo: null,
      periodo: null
    }],
    codIncoterms: venta.incotermFex || null,
    descIncoterms: INCOTERMS_DESC[venta.incotermFex] || venta.descIncotermFex || null,
    numPagoElectronico: null,
    observaciones: null
  }
}

// Descripciones oficiales de incoterms (CAT-031 del MH). El MH pide código + descripción.
const INCOTERMS_DESC = {
  '01': 'EXW-En fabrica',
  '02': 'FCA-Libre transportista',
  '03': 'CPT-Transporte pagado hasta',
  '04': 'CIP-Transporte y seguro pagado hasta',
  '05': 'DAP-Entrega en el lugar',
  '06': 'DPU-Entregado en el lugar descargado',
  '07': 'DDP-Entrega con impuestos pagados',
  '08': 'FAS-Libre al costado del buque',
  '09': 'FOB-Libre a bordo',
  '10': 'CFR-Costo y flete',
  '11': 'CIF-Costo seguro y flete',
}

function numberToLetras(num) {
  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
  const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
  const especiales = ['ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

  const entero = Math.floor(num)
  const centavos = Math.round((num - entero) * 100)

  const convertirCentenas = (n) => {
    if (n === 0) return ''
    if (n === 100) return 'CIEN'
    let resultado = centenas[Math.floor(n / 100)]
    const resto = n % 100
    if (resto === 0) return resultado
    if (resultado) resultado += ' '
    if (resto >= 11 && resto <= 19) return resultado + especiales[resto - 11]
    const dec = Math.floor(resto / 10)
    const uni = resto % 10
    if (dec > 0) resultado += decenas[dec]
    if (dec > 0 && uni > 0) resultado += ' Y '
    if (uni > 0) resultado += unidades[uni]
    return resultado
  }

  let letras = ''
  if (entero >= 1000) {
    const miles = Math.floor(entero / 1000)
    letras += (miles === 1 ? 'MIL' : convertirCentenas(miles) + ' MIL')
    const resto = entero % 1000
    if (resto > 0) letras += ' ' + convertirCentenas(resto)
  } else {
    letras = convertirCentenas(entero)
  }

  letras += ` DÓLARES Y ${centavos.toString().padStart(2, '0')}/100`
  return letras.trim()
}

function buildResumen(venta, cuerpo, tipoDteNum) {
  // Sumar desde el cuerpo (fuente única de verdad), no desde venta.subtotal/iva
  // que pueden venir mal guardados desde el front.
  const totalGravada = round2(cuerpo.reduce((s, i) => s + i.ventaGravada, 0))

  // FE: cada item tiene ivaItem en el cuerpo → suma desde ahí.
  // CCF/NC/ND: items NO llevan ivaItem en el cuerpo → calcular desde totalGravada.
  const totalIva = tipoDteNum === '01'
    ? round2(cuerpo.reduce((s, i) => s + (i.ivaItem || 0), 0))
    : round2(totalGravada * 0.13)

  // FE: el IVA ya está dentro de totalGravada, no se suma.
  // CCF/NC/ND: el IVA va aparte, se suma para el total.
  const montoTotal = tipoDteNum === '01'
    ? totalGravada
    : round2(totalGravada + totalIva)

  const formaPago = venta.formaPago === 'efectivo' ? '01' :
                    venta.formaPago === 'tarjeta' ? '02' :
                    venta.formaPago === 'transferencia' ? '03' :
                    venta.formaPago === 'cheque' ? '04' : '99'

  // ══════════════════════════════════════════════════════════════
  // NC V2.0 (tipo 05): resumen con estructura propia (v4)
  // Quita: descuExenta, descuGravada, descuNoSuj, subTotal, ivaPerci1, ivaRete1, reteRenta
  // Agrega: totalIva, totalNoGravado, totalPagar, ivaPerci, ivaRete, observaciones, codigoRetencionMH
  // ══════════════════════════════════════════════════════════════
  if (tipoDteNum === '05') {
    // Regla del MH (confirmada por su mesa de ayuda):
    //   - cuerpo[].totalIva = 0  (siempre)
    //   - resumen.totalIva = 0  (siempre)
    //   - El IVA real va SOLO en resumen.tributos[].valor = totalGravada * 0.13
    const ivaTributoNC = round2(totalGravada * 0.13)
    const totalConIva = round2(totalGravada + ivaTributoNC)
    return {
      totalNoSuj: 0,
      totalExenta: 0,
      totalGravada,
      subTotalVentas: totalGravada,
      totalDescu: 0,
      tributos: [{
        codigo: '20',
        descripcion: 'Impuesto al Valor Agregado 13%',
        valor: ivaTributoNC
      }],
      ivaPerci: 0,
      ivaRete: 0,
      codigoRetencionMH: null,
      totalIva: 0,
      montoTotalOperacion: totalConIva,
      totalNoGravado: 0,
      totalPagar: totalConIva,
      totalLetras: numberToLetras(totalConIva),
      condicionOperacion: venta.tipoPago === 'credito' ? 2 : 1,
      observaciones: null,
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ND V2.0 (tipo 06): resumen propio v4
  // Igual a NC v4 PERO con `numPagoElectronico`. tributos SÍ va (el MH lo exige).
  // ══════════════════════════════════════════════════════════════
  if (tipoDteNum === '06') {
    // Misma regla que NC: cuerpo[].totalIva=0, resumen.totalIva=0,
    // IVA solo en resumen.tributos[].valor.
    const ivaTributoND = round2(totalGravada * 0.13)
    const totalConIva = round2(totalGravada + ivaTributoND)
    return {
      totalNoSuj: 0,
      totalExenta: 0,
      totalGravada,
      subTotalVentas: totalGravada,
      totalDescu: 0,
      tributos: [{
        codigo: '20',
        descripcion: 'Impuesto al Valor Agregado 13%',
        valor: ivaTributoND
      }],
      ivaPerci: 0,
      ivaRete: 0,
      codigoRetencionMH: null,
      totalIva: 0,
      montoTotalOperacion: totalConIva,
      totalNoGravado: 0,
      totalPagar: totalConIva,
      totalLetras: numberToLetras(totalConIva),
      condicionOperacion: venta.tipoPago === 'credito' ? 2 : 1,
      numPagoElectronico: null,
      observaciones: null,
    }
  }

  const esNCoND = ['05','06'].includes(tipoDteNum)

  // Resumen base común a todos los tipos
  const resumen = {
    totalNoSuj: 0,
    totalExenta: 0,
    totalGravada,
    subTotalVentas: totalGravada,
    descuNoSuj: 0,
    descuExenta: 0,
    descuGravada: 0,
  }

  // porcentajeDescuento NO va en NC/ND, pero totalDescu sí es requerido.
  if (!esNCoND) {
    resumen.porcentajeDescuento = 0
  }
  resumen.totalDescu = 0

  // tributos detallados van en CCF/NC/ND
  resumen.tributos = ['03','05','06'].includes(tipoDteNum) ? [{
    codigo: '20',
    descripcion: 'Impuesto al Valor Agregado 13%',
    valor: totalIva
  }] : null

  resumen.subTotal = totalGravada
  // V2.0 (FE y CCF): ivaRete (sin el "1"), sin reteRenta, con observaciones.
  // NC/ND (v1.2): siguen con ivaRete1 + reteRenta.
  if (tipoDteNum === '01' || tipoDteNum === '03') {
    resumen.ivaRete = 0
    resumen.observaciones = null
  } else {
    resumen.ivaRete1 = 0
    resumen.reteRenta = 0
  }
  resumen.montoTotalOperacion = montoTotal
  resumen.totalLetras = numberToLetras(montoTotal)
  resumen.condicionOperacion = venta.tipoPago === 'credito' ? 2 : 1

  // Campos exclusivos de FE/CCF (operaciones de venta con pagos).
  // NC y ND son ajustes contables, no incluyen información de cobro.
  if (tipoDteNum === '01' || tipoDteNum === '03') {
    resumen.totalNoGravado = 0
    resumen.totalPagar = montoTotal
    resumen.saldoFavor = 0
    resumen.pagos = [{
      codigo: formaPago,
      montoPago: montoTotal,
      referencia: venta.referenciaPago || null,
      plazo: null,
      periodo: null
    }]
    resumen.numPagoElectronico = null
  }

  // numPagoElectronico también es requerido por el MH en ND (06).
  // En NC (05) no lo pide. Diferencia sutil del schema entre NC y ND.
  if (tipoDteNum === '06') {
    resumen.numPagoElectronico = null
  }

  // Campo específico por tipo:
  // - FE V2.0: totalIva (IVA contenido total)
  // - CCF V2.0: ivaPerci (sin totalIva en resumen)
  // - NC/ND (v1.2): ivaPerci1
  if (tipoDteNum === '03') {
    resumen.ivaPerci = 0
  } else if (tipoDteNum === '05' || tipoDteNum === '06') {
    resumen.ivaPerci1 = 0
  } else {
    resumen.totalIva = totalIva
  }

  return resumen
}

export const transmitir = onRequest({ timeoutSeconds: 120, memory: '512MiB' }, async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const { ventaId, operacionId: opIdParam, ambiente: ambienteParam } = req.body
    // Aceptamos tanto ventaId como operacionId (compat con NR/FSE desde módulo Operaciones)
    const docId = opIdParam || ventaId

    if (!docId) {
      return res.status(400).json({ error: 'Falta ventaId u operacionId' })
    }

    // Primero buscar en 'ventas' (flujo normal del POS).
    // Si no está, buscar en 'operaciones' (NR / FSE del módulo Operaciones).
    let ventaSnap = await db.collection('ventas').doc(docId).get()
    let coleccionOrigen = 'ventas'
    if (!ventaSnap.exists) {
      ventaSnap = await db.collection('operaciones').doc(docId).get()
      coleccionOrigen = 'operaciones'
    }
    if (!ventaSnap.exists) {
      return res.status(404).json({ error: 'Documento no encontrado en ventas ni en operaciones', docId })
    }
    const venta = { id: ventaSnap.id, ...ventaSnap.data() }
    console.log(`Transmitiendo ${venta.tipoDte} desde colección '${coleccionOrigen}' (id: ${docId})`)

    // La config (datos del emisor + credenciales/certificado MH) DEBE ser la de la
    // empresa de la venta. Antes se tomaba la primera con mh_usuario, lo que en
    // multi-empresa cruzaba datos/credenciales entre empresas. Ahora se lee por empresaId.
    let config = null
    if (venta.empresaId) {
      const cfgDoc = await db.collection('configuracion').doc(venta.empresaId).get()
      if (cfgDoc.exists && cfgDoc.data().mh_usuario) config = cfgDoc.data()
    }
    if (!config) {
      // Fallback retrocompatible (datos viejos sin empresaId / mono-empresa)
      const configSnap = await db.collection('configuracion')
        .where('mh_usuario', '!=', null).limit(1).get()
      if (configSnap.empty) {
        return res.status(400).json({ error: 'No hay configuración guardada' })
      }
      config = configSnap.docs[0].data()
    }

    const ambiente = ambienteParam || config.mh_ambiente || '00'
    const baseUrl = MH_URLS[ambiente]

    let sucursal = null
    if (venta.sucursalId) {
      const sucursalSnap = await db.collection('sucursales').doc(venta.sucursalId).get()
      if (sucursalSnap.exists) sucursal = sucursalSnap.data()
    }

    const token = await obtenerToken(ambiente, baseUrl, config.mh_usuario, config.mh_password)

    const tipoDteCode = venta.tipoDte || 'FE'
    const tipoDteNum = TIPOS_DTE[tipoDteCode] || '01'
    const version = VERSIONES[tipoDteNum]
    const codigoGeneracion = venta.codigoGeneracion

    if (!codigoGeneracion) {
      return res.status(400).json({ error: 'La venta no tiene codigoGeneracion' })
    }

    // Validación de datos del receptor obligatorios para CCF/NC/ND.
    // (Requieren receptor contribuyente IVA con datos fiscales completos.)
    // EXCEPCIÓN: una NC/ND (05/06) sobre una FE (documentoRelacionado tipo '01')
    // es a consumidor final — los datos del receptor son opcionales (igual que la FE).
    const esNcNdSobreFE = ['05','06'].includes(tipoDteNum)
      && (venta.documentoRelacionado?.tipoDocumento === '01')
    if (['03','05','06'].includes(tipoDteNum) && !esNcNdSobreFE) {
      const faltantes = []
      if (!venta.nit) faltantes.push('NIT del cliente')
      if (!venta.nrc) faltantes.push('NRC del cliente')
      if (!venta.codActividad) faltantes.push('Código de actividad económica')
      if (!venta.descActividad) faltantes.push('Descripción de actividad económica')
      if (!venta.codDep) faltantes.push('Código de departamento')
      if (!venta.codMun) faltantes.push('Código de municipio')
      if (!venta.direccion) faltantes.push('Dirección del cliente')
      if (faltantes.length > 0) {
        return res.status(400).json({
          error: `Datos del cliente ${tipoDteCode} incompletos`,
          faltantes,
          mensaje: `Un ${tipoDteCode} requiere todos los datos del receptor. Completar el cliente y reintentar.`
        })
      }
    }

    // Validación específica para NC/ND: documento relacionado + items
    if (['05','06'].includes(tipoDteNum)) {
      const docRel = venta.documentoRelacionado
      if (!docRel) {
        return res.status(400).json({
          error: `Falta documentoRelacionado para ${tipoDteCode}`,
          mensaje: `${tipoDteCode} debe referenciar el DTE original que está corrigiendo.`
        })
      }
      const faltantesDoc = []
      if (!docRel.tipoDocumento)   faltantesDoc.push('tipo del DTE original')
      if (!docRel.numeroDocumento) faltantesDoc.push('código de generación del DTE original')
      if (!docRel.fechaEmision)    faltantesDoc.push('fecha de emisión del DTE original')
      if (faltantesDoc.length > 0) {
        return res.status(400).json({
          error: 'Datos del documento relacionado incompletos',
          faltantes: faltantesDoc,
          mensaje: `${tipoDteCode} debe incluir tipo, número y fecha del DTE original.`
        })
      }
      if (!Array.isArray(venta.items) || venta.items.length === 0) {
        return res.status(400).json({
          error: `${tipoDteCode} requiere al menos 1 item`,
          mensaje: `Especificar los items que se están ${tipoDteCode === 'NC' ? 'acreditando' : 'debitando'}.`
        })
      }
    }

    const codEstMH = sucursal?.codEstableMH || config.codEstableMH || 'S001'
    const codPVMH = sucursal?.codPuntoVentaMH || config.codPuntoVentaMH || 'P001'

    // Si la venta ya tiene correlativo asignado (retransmisión tras RECHAZADO),
    // lo reusamos para no consumir otro número del contador.
    // Si no, sacamos uno nuevo atómicamente.
    // IMPORTANTE: usamos 'let' porque pueden reasignarse si el MH responde 004
    // (numeroControl duplicado) y necesitamos avanzar al siguiente correlativo.
    let correlativo = venta.correlativo || await obtenerCorrelativo(tipoDteCode, codEstMH, codPVMH, ambiente)
    let numeroControl = venta.numeroControl ||
      `DTE-${tipoDteNum}-${codEstMH}${codPVMH}-${String(correlativo).padStart(15, '0')}`

    // Fecha y hora del DTE en zona America/El_Salvador (UTC-6), no UTC del servidor.
    // Esto es crítico: el MH guarda lo que recibe aquí y luego, en invalidación,
    // valida que las fechas coincidan exactamente.
    const fecEmi = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/El_Salvador',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date())
    const horEmi = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/El_Salvador',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date())

    const emisor = buildEmisor(config, sucursal, tipoDteNum)
    const receptor = tipoDteNum === '07'
      ? buildReceptorRetencion(venta)
      : tipoDteNum === '11'
      ? buildReceptorFEX(venta)
      : tipoDteNum === '14'
        ? buildReceptorFSE(venta)
        : tipoDteNum === '04'
          ? buildReceptorNR(venta)
          : (tipoDteNum === '05' || tipoDteNum === '06')
            ? buildReceptorNCND(venta)
            : venta.tipoDte === 'CCF'
              ? buildReceptorCCF(venta)
              : buildReceptorFE(venta)

    // Documento relacionado para NC/ND (referencia al DTE original)
    const documentoRelacionado = ['05','06'].includes(tipoDteNum) && venta.documentoRelacionado
      ? [{
          tipoDocumento: venta.documentoRelacionado.tipoDocumento || '03',
          tipoGeneracion: parseInt(venta.documentoRelacionado.tipoGeneracion ?? 2),
          numeroDocumento: venta.documentoRelacionado.numeroDocumento,
          fechaEmision:    venta.documentoRelacionado.fechaEmision
        }]
      : null

    // En NC/ND cada item lleva el numeroDocumento del DTE original que se está corrigiendo.
    const numDocRelItems = ['05','06'].includes(tipoDteNum) && venta.documentoRelacionado
      ? venta.documentoRelacionado.numeroDocumento
      : null

    const cuerpo = tipoDteNum === '07'
      ? buildCuerpoRetencion(venta)
      : tipoDteNum === '11'
      ? buildCuerpoFEX(venta.items || [])
      : tipoDteNum === '14'
        ? buildCuerpoFSE(venta.items || [])
        : tipoDteNum === '04'
          ? buildCuerpoNR(venta.items || [])
          : buildCuerpo(venta.items || [], tipoDteNum, numDocRelItems)
    const resumen = tipoDteNum === '07'
      ? buildResumenRetencion(venta, cuerpo)
      : tipoDteNum === '11'
      ? buildResumenFEX(venta, cuerpo)
      : tipoDteNum === '14'
        ? buildResumenFSE(venta, cuerpo)
        : tipoDteNum === '04'
          ? buildResumenNR(venta, cuerpo)
          : buildResumen(venta, cuerpo, tipoDteNum)

    // ═══════════════════════════════════════════════════════════════
    // BUCLE DE TRANSMISIÓN CON AUTO-REINTENTO ANTE 004 (numeroControl duplicado)
    //
    // El MH a veces tiene registros previos con el mismo número (test repetidos,
    // correlativos desincronizados, etc.). Cuando responde "YA EXISTE UN REGISTRO
    // CON ESE VALOR" (codigoMsg 004), avanzamos el correlativo y reintentamos.
    // Máximo MAX_INTENTOS para evitar loops infinitos si hay otro problema.
    // ═══════════════════════════════════════════════════════════════
    const MAX_INTENTOS = 5
    let intento = 0
    let mhData = null
    let dteFirmado = null
    let dteJSONString = null

    while (intento < MAX_INTENTOS) {
      intento++

      // Construir DTE con el numeroControl/correlativo actuales
      const dteJSON = buildDTE({
        tipoDteNum, version, codigoGeneracion, numeroControl,
        ambiente, fecEmi, horEmi, emisor, receptor,
        cuerpo, resumen, documentoRelacionado
      })

      const privateKeyPem = config.certificado_pem
      const password = config.certificado_password || null

      dteFirmado = await firmarDTE(dteJSON, privateKeyPem, password)
      dteJSONString = JSON.stringify(dteJSON)

      const payload = {
        ambiente,
        idEnvio: 1,
        version,
        tipoDte: tipoDteNum,
        documento: dteFirmado,
        codigoGeneracion
      }

      const mhResponse = await fetch(`${baseUrl}/fesv/recepciondte`, {
        method: 'POST',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json',
          'User-Agent': 'ORION-OneGeoSystems/1.0'
        },
        body: JSON.stringify(payload)
      })

      mhData = await mhResponse.json()

      // ¿Es el error "YA EXISTE UN REGISTRO CON ESE VALOR"? Si no, salimos del loop.
      const esDuplicado = mhData?.estado === 'RECHAZADO' && mhData?.codigoMsg === '004' &&
        /YA EXISTE|EXISTE UN REGISTRO/i.test(mhData?.descripcionMsg || '')

      if (!esDuplicado) break // PROCESADO, otro RECHAZO, o cualquier otro caso → salir

      console.warn(`[Intento ${intento}/${MAX_INTENTOS}] MH respondió 004 (numeroControl duplicado: ${numeroControl}). Avanzando correlativo y reintentando...`)

      if (intento >= MAX_INTENTOS) {
        console.error(`Llegamos al máximo de ${MAX_INTENTOS} intentos. Devolviendo el último error del MH.`)
        break
      }

      // Avanzar el correlativo y rearmar el numeroControl para el siguiente intento.
      // Esto NO consume el correlativo "viejo" en el contador — solo avanza el actual.
      correlativo = correlativo + 1
      const numStr = String(correlativo).padStart(15, '0')
      numeroControl = `DTE-${tipoDteNum}-${codEstMH}${codPVMH}-${numStr}`

      // También actualizar el contador para que próximas transmisiones empiecen desde aquí.
      try {
        const docId = `${tipoDteCode}_${codEstMH}_${codPVMH}_${ambiente}`
        await db.collection('contadores').doc(docId).set({
          valor: correlativo,
          actualizadoEn: FieldValue.serverTimestamp(),
          notas: `Avanzado por auto-reintento ante 004`
        }, { merge: true })
      } catch (e) {
        console.warn('No se pudo actualizar el contador (no es crítico):', e.message)
      }
    }
    // ═══════════════════════════════════════════════════════════════
    // FIN BUCLE — usar mhData, dteFirmado, dteJSONString, correlativo, numeroControl
    // ═══════════════════════════════════════════════════════════════

    if (mhData.estado === 'PROCESADO') {
      if (intento > 1) {
        console.log(`✅ Transmisión exitosa en intento ${intento} con numeroControl=${numeroControl} (correlativo avanzado)`)
      }
      await db.collection(coleccionOrigen).doc(docId).update({
        dte_estado: 'PROCESADO',
        dte_sello: mhData.selloRecibido,
        dte_fhProcesamiento: mhData.fhProcesamiento,
        dte_transmitidoEn: new Date(),
        dte_firmado: dteFirmado,           // JWS RS512 firmado (legalmente válido) — string
        dte_json: dteJSONString,            // DTE armado como string JSON (parsear al leer)
        dte_ambiente: ambiente,
        correlativo,
        numeroControl
      })

      const facturasSnap = await db.collection('facturas')
        .where('codigoGeneracion', '==', codigoGeneracion).limit(1).get()

      if (!facturasSnap.empty) {
        const facturaDoc = facturasSnap.docs[0]
        const facturaData = facturaDoc.data()
        const updateData = {
          dte_estado: 'PROCESADO',
          dte_sello: mhData.selloRecibido,
          dte_fhProcesamiento: mhData.fhProcesamiento,
          dte_firmado: dteFirmado,
          dte_json: dteJSONString,
          dte_ambiente: ambiente,
          correlativo,
          numeroControl
        }
        // Si la factura tenía un número PENDIENTE (caso típico de NC/ND creadas
        // desde Facturas.jsx, que no pasan por el POS), lo actualizamos al
        // número oficial del MH para que se vea bien en la lista.
        if (!facturaData.numero || facturaData.numero.includes('PENDIENTE')) {
          updateData.numero = numeroControl
        }
        await db.collection('facturas').doc(facturaDoc.id).update(updateData)
      }

      return res.status(200).json({
        ok: true,
        estado: 'PROCESADO',
        selloRecibido: mhData.selloRecibido,
        codigoGeneracion,
        numeroControl,
        correlativo,
        fhProcesamiento: mhData.fhProcesamiento
      })

    } else {
      // Aún en RECHAZADO guardamos el correlativo/numeroControl asignados.
      // El correlativo ya fue "gastado" del contador y la próxima retransmisión
      // de esta misma venta debe reusar el mismo número, no consumir otro.
      await db.collection(coleccionOrigen).doc(docId).update({
        dte_estado: 'RECHAZADO',
        dte_observaciones: mhData.observaciones,
        dte_descripcionMsg: mhData.descripcionMsg || null,
        dte_codigoMsg: mhData.codigoMsg || null,
        dte_clasificaMsg: mhData.clasificaMsg || null,
        dte_transmitidoEn: new Date(),
        correlativo,
        numeroControl
      })

      return res.status(200).json({
        ok: false,
        estado: 'RECHAZADO',
        observaciones: mhData.observaciones,
        numeroControl,
        correlativo,
        detalleMH: mhData
      })
    }

  } catch (error) {
    console.error('Error transmitiendo DTE:', error)
    return res.status(500).json({
      error: 'Error interno',
      detalle: error.message
    })
  }
})
