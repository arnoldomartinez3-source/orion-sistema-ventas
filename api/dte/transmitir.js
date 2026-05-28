import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { importPKCS8, SignJWT } from 'jose'
import { createPrivateKey } from 'crypto'

if (!getApps().length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
  )
  initializeApp({
    credential: cert(serviceAccount)
  })
}

const db = getFirestore()

const MH_URLS = {
  '00': 'https://apitest.dtes.mh.gob.sv',
  '01': 'https://api.dtes.mh.gob.sv'
}

const TIPOS_DTE = {
  'FE':  '01',
  'CCF': '03',
  'NC':  '05',
  'ND':  '06',
  'FEX': '11'
}

const VERSIONES = {
  '01': 2,
  '03': 4,
  '05': 4,
  '06': 3,
  '11': 1
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
  const body = `user=${mh_usuario}&pwd=${mh_password}`
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
  // FEX usa "motivoContigencia" (así, con la 'g' — es como lo pide el MH).
  // FE/CCF/NC/ND usan "motivoContin".
  if (esFEX) {
    identificacion.motivoContigencia = null
  } else {
    identificacion.motivoContin = null
  }
  // NC V2.0 (05): campo nuevo 'fusion' (obligatorio en v4)
  if (tipoDteNum === '05') {
    identificacion.fusion = null
  }

  const dte = {
    identificacion,
    emisor,
    receptor,
  }

  // documentoRelacionado: solo NC/ND lo llevan (con contenido). FEX NO lo permite.
  if (!esFEX) {
    dte.documentoRelacionado = documentoRelacionado
  }

  // otrosDocumentos NO va en NC/ND, pero ventaTercero sí es requerido (como null).
  if (!esNCoND) {
    dte.otrosDocumentos = null
  }
  dte.ventaTercero = null
  dte.cuerpoDocumento = cuerpo
  dte.resumen = resumen

  // extension: FEX NO la permite. V2.0 (FE/CCF/NC) tampoco la lleva.
  // ND (06) v3 sí la lleva como null.
  if (!esFEX && tipoDteNum !== '01' && tipoDteNum !== '03' && tipoDteNum !== '05') {
    dte.extension = null
  }
  dte.apendice = null
  return dte
}

function buildEmisor(config, sucursal, tipoDteNum = '01') {
  // Código de distrito (CAT-008). Fallback '01' si no está configurado.
  const distritoCod = sucursal?.codDistrito || config.codDistrito || sucursal?.distrito || config.distrito || '01'

  // ── V2.0: FE (01) y CCF (03) ──
  // Cambios v2/v4: se quita tipoEstablecimiento/codEstableMH/codPuntoVentaMH,
  // se agrega distrito (obligatorio) en la dirección. codEstable/codPuntoVenta se mantienen.
  if (tipoDteNum === '01' || tipoDteNum === '03') {
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

  // ── NC V2.0 (05): emisor SIN codEstable/codPuntoVenta ──
  // El schema v4 de NC no permite esos campos (igual que en v3). Distrito sí va.
  if (tipoDteNum === '05') {
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

  // ── V1.2 (CCF/NC/ND/FEX) — sin cambios mientras migramos ──
  const emisor = {
    nit: config.nit?.replace(/[-]/g, ''),
    nrc: config.nrc?.replace(/[-]/g, ''),
    nombre: config.empresaNombre || config.nombre,
    codActividad: config.codActividad || config.actividadEconomica,
    descActividad: config.descActividad || config.actividadEconomica,
    nombreComercial: config.nombreComercial || null,
    tipoEstablecimiento: sucursal?.tipoEstablecimiento || config.tipoEstablecimiento || '02',
    direccion: {
      departamento: sucursal?.codDep || config.codDep || config.departamento || '06',
      municipio: sucursal?.codMun || config.codMun || '23',
      complemento: sucursal?.direccion || config.complemento || config.direccion || ''
    },
    telefono: config.telefono?.replace(/[-]/g, '') || '',
    correo: config.correo || config.email || '',
  }
  if (!['05','06'].includes(tipoDteNum)) {
    emisor.codEstableMH = sucursal?.codEstableMH || config.codEstableMH || 'S001'
    emisor.codEstable = sucursal?.codEstable || config.codEstable || '0001'
    emisor.codPuntoVentaMH = sucursal?.codPuntoVentaMH || config.codPuntoVentaMH || 'P001'
    emisor.codPuntoVenta = sucursal?.codPuntoVenta || config.codPuntoVenta || '1'
  }
  if (tipoDteNum === '11') {
    emisor.tipoItemExpor = 1
    emisor.recintoFiscal = null
    emisor.regimen = null
  }
  return emisor
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
    // codPais del catálogo MH CAT-021. '9300' = "OTROS (PAISES NO DEFINIDOS)".
    // Ej: '0249'=USA, '0064'=Guatemala, '0086'=Honduras... (depende del catálogo).
    codPais: venta.paisDestino || '9300',
    nombrePais: venta.nombrePaisFex || 'OTROS',
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
  return {
    tipoDocumento: venta.tipoDocumento || null,
    numDocumento: venta.numDocumento || null,
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

// NC V2.0: receptor cambia respecto a CCF — ahora usa tipoDocumento + numDocumento
// en lugar de nit directo. tipoDocumento 36=NIT, 13=DUI, etc. (CAT-022).
function buildReceptorNC(venta) {
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

// Reglas El Salvador:
// - FE (01): precioUni y ventaGravada van CON IVA incluido. ivaItem es el IVA contenido.
// - CCF (03): precioUni y ventaGravada van SIN IVA. tributos = ["20"] (sin ivaItem).
// - NC (05), ND (06): IVA agregado, mismo cálculo que CCF. PERO item tiene
//   numeroDocumento (codigoGeneracion del DTE original) y NO tiene psv/noGravado.
// - FEX (11): exportaciones (exentas/cero IVA) — caso aparte, no cubierto aún.
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
    } else if (tipoDteNum === '05') {
      // NC V2.0: regla del MH — items con 8 decimales (manual de transmisión V2.0)
      precioUni = Math.round(precioBaseRaw * 1e8) / 1e8
      ventaGravada = Math.round(precioUni * cantidad * 1e8) / 1e8
      ivaItem = Math.round(ventaGravada * 0.13 * 1e8) / 1e8
    } else {
      // CCF, ND: IVA aparte (V1.2)
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

    // NC V2.0 (05): cada ítem lleva sus propios totales de IVA.
    // REGLA: precioUni/ventaGravada con 8 decimales (regla MH manual V2.0).
    // totalIva del item: probamos round2 (el MH parece esperarlo así, no a 8 decimales).
    if (tipoDteNum === '05') {
      itemBase.noGravado = 0
      itemBase.ivaPerci = 0
      itemBase.ivaRete = 0
      itemBase.totalIva = round2(ivaItem)
    }

    if (['03','05','06'].includes(tipoDteNum)) {
      // CCF, NC, ND: tributos como array de códigos, sin ivaItem por línea
      itemBase.tributos = ['20']
    } else {
      // FE, FEX: ivaItem por línea, tributos null
      itemBase.tributos = null
      itemBase.ivaItem = ivaItem
    }

    return itemBase
  })
}

// Cuerpo FEX (tipo 11): exportación. IVA tasa 0% (exenta), estructura más simple.
// El item NO lleva ivaItem, ventaNoSuj, ventaExenta, psv ni tributos de IVA.
function buildCuerpoFEX(items) {
  return items.map((item, index) => {
    const cantidad = item.qty || item.cantidad || 1
    const precioUni = round2(parseFloat(item.precioBase || item.precioUni || 0))
    const ventaGravada = round2(precioUni * cantidad)
    return {
      numItem: index + 1,
      cantidad,
      codigo: item.codigo || null,
      uniMedida: 59,
      descripcion: item.nombre || item.descripcion,
      precioUni,
      montoDescu: round2(item.descuento || item.montoDescu || 0),
      ventaGravada,
      tributos: null,
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
    descuento: 0,
    porcentajeDescuento: 0,
    totalDescu,
    seguro,
    flete,
    montoTotalOperacion: montoTotal,
    totalNoGravado: 0,
    totalPagar: montoTotal,
    totalLetras: numberToLetras(montoTotal),
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
    // El MH calcula totalIva como round2(totalGravada * 0.13).
    // Probamos esta fórmula directa (vs suma de items) por si el MH la prefiere.
    const totalIvaNC = round2(totalGravada * 0.13)
    return {
      totalNoSuj: 0,
      totalExenta: 0,
      totalGravada,
      subTotalVentas: totalGravada,
      totalDescu: 0,
      tributos: [{
        codigo: '20',
        descripcion: 'Impuesto al Valor Agregado 13%',
        valor: totalIvaNC
      }],
      ivaPerci: 0,
      ivaRete: 0,
      codigoRetencionMH: null,
      totalIva: totalIvaNC,
      montoTotalOperacion: round2(totalGravada + totalIvaNC),
      totalNoGravado: 0,
      totalPagar: round2(totalGravada + totalIvaNC),
      totalLetras: numberToLetras(round2(totalGravada + totalIvaNC)),
      condicionOperacion: venta.tipoPago === 'credito' ? 2 : 1,
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const { ventaId, ambiente: ambienteParam } = req.body

    if (!ventaId) {
      return res.status(400).json({ error: 'Falta ventaId' })
    }

    const ventaSnap = await db.collection('ventas').doc(ventaId).get()
    if (!ventaSnap.exists) {
      return res.status(404).json({ error: 'Venta no encontrada' })
    }
    const venta = { id: ventaSnap.id, ...ventaSnap.data() }

    const configSnap = await db.collection('configuracion')
      .where('mh_usuario', '!=', null)
      .limit(1)
      .get()
    if (configSnap.empty) {
      return res.status(400).json({ error: 'No hay configuración guardada' })
    }
    const config = configSnap.docs[0].data()

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
    // (Todos requieren receptor contribuyente IVA con datos fiscales completos.)
    if (['03','05','06'].includes(tipoDteNum)) {
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
    const correlativo = venta.correlativo || await obtenerCorrelativo(tipoDteCode, codEstMH, codPVMH, ambiente)
    const numeroControl = venta.numeroControl ||
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
    const receptor = tipoDteNum === '11'
      ? buildReceptorFEX(venta)
      : tipoDteNum === '05'
        ? buildReceptorNC(venta)
        : ['CCF','ND'].includes(venta.tipoDte)
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

    const cuerpo = tipoDteNum === '11'
      ? buildCuerpoFEX(venta.items || [])
      : buildCuerpo(venta.items || [], tipoDteNum, numDocRelItems)
    const resumen = tipoDteNum === '11'
      ? buildResumenFEX(venta, cuerpo)
      : buildResumen(venta, cuerpo, tipoDteNum)

    const dteJSON = buildDTE({
      tipoDteNum, version, codigoGeneracion, numeroControl,
      ambiente, fecEmi, horEmi, emisor, receptor,
      cuerpo, resumen, documentoRelacionado
    })

    // LOG TEMPORAL — diagnóstico NC (eliminar después)
    if (tipoDteNum === '05') {
      console.log('=== DEBUG NC — DTE completo ===')
      console.log(JSON.stringify(dteJSON, null, 2))
    }

    const privateKeyPem = config.certificado_pem
    const password = config.certificado_password || null

    const dteFirmado = await firmarDTE(dteJSON, privateKeyPem, password)

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

    const mhData = await mhResponse.json()

    if (mhData.estado === 'PROCESADO') {
      await db.collection('ventas').doc(ventaId).update({
        dte_estado: 'PROCESADO',
        dte_sello: mhData.selloRecibido,
        dte_fhProcesamiento: mhData.fhProcesamiento,
        dte_transmitidoEn: new Date(),
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
      await db.collection('ventas').doc(ventaId).update({
        dte_estado: 'RECHAZADO',
        dte_observaciones: mhData.observaciones,
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
}