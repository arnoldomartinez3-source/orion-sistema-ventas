import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { importPKCS8, SignJWT } from 'jose'

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
  '01': 1,
  '03': 3,
  '05': 3,
  '06': 3,
  '11': 1
}

// Obtener token del MH
async function obtenerToken(ambiente, baseUrl, mh_usuario, mh_password) {
  const tokenSnap = await db.collection('mh_tokens').doc(ambiente).get()

  if (tokenSnap.exists) {
    const tokenData = tokenSnap.data()
    if (tokenData.expiraEn && Date.now() < tokenData.expiraEn) {
      return tokenData.token
    }
  }

  const body = new URLSearchParams({ user: mh_usuario, pwd: mh_password })
  const response = await fetch(`${baseUrl}/seguridad/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'ORION-OneGeoSystems/1.0'
    },
    body: body.toString()
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

// Firmar DTE con JWS RS512
async function firmarDTE(dteJSON, privateKeyPem) {
  const privateKey = await importPKCS8(privateKeyPem, 'RS512')
  const payload = JSON.stringify(dteJSON)

  const jws = await new SignJWT(dteJSON)
    .setProtectedHeader({ alg: 'RS512' })
    .sign(privateKey)

  return jws
}

// Construir JSON del DTE
function buildDTE({ tipoDteNum, version, codigoGeneracion, numeroControl,
  ambiente, fecEmi, horEmi, emisor, receptor, cuerpo, resumen }) {
  return {
    identificacion: {
      version,
      ambiente,
      tipoDte: tipoDteNum,
      numeroControl,
      codigoGeneracion,
      tipoModelo: 1,
      tipoOperacion: 1,
      tipoContingencia: null,
      motivoContin: null,
      fecEmi,
      horEmi,
      tipoMoneda: 'USD'
    },
    documentoRelacionado: null,
    emisor,
    receptor,
    otrosDocumentos: null,
    ventaTercero: null,
    cuerpoDocumento: cuerpo,
    resumen,
    extension: null,
    apendice: null
  }
}

// Construir emisor desde configuración
function buildEmisor(config, sucursal) {
  return {
    nit: config.nit?.replace(/[-]/g, ''),
    nrc: config.nrc?.replace(/[-]/g, ''),
    nombre: config.empresaNombre || config.nombre,
    codActividad: config.codActividad,
    descActividad: config.descActividad,
    nombreComercial: config.nombreComercial || null,
    tipoEstablecimiento: sucursal?.tipoEstablecimiento || config.tipoEstablecimiento || '02',
    direccion: {
      departamento: sucursal?.codDep || config.codDep,
      municipio: sucursal?.codMun || config.codMun,
      complemento: sucursal?.direccion || config.complemento || ''
    },
    telefono: config.telefono?.replace(/[-]/g, '') || '',
    correo: config.correo || config.email || '',
    codEstableMH: sucursal?.codEstableMH || config.codEstableMH || '0001',
    codEstable: sucursal?.codEstable || config.codEstable || '0001',
    codPuntoVentaMH: sucursal?.codPuntoVentaMH || config.codPuntoVentaMH || '0001',
    codPuntoVenta: sucursal?.codPuntoVenta || config.codPuntoVenta || '1'
  }
}

// Construir receptor FE
function buildReceptorFE(venta) {
  return {
    tipoDocumento: venta.tipoDocumento || null,
    numDocumento: venta.numDocumento || null,
    nombre: venta.cliente || 'Consumidor Final',
    codActividad: null,
    descActividad: null,
    direccion: null,
    telefono: null,
    correo: venta.correoReceptor || null
  }
}

// Construir receptor CCF
function buildReceptorCCF(venta) {
  return {
    nit: venta.nit?.replace(/[-]/g, '') || null,
    nrc: venta.nrc?.replace(/[-]/g, '') || null,
    nombre: venta.cliente,
    codActividad: venta.codActividad || null,
    descActividad: venta.descActividad || null,
    nombreComercial: null,
    direccion: venta.direccion || null,
    telefono: venta.telefono?.replace(/[-]/g, '') || null,
    correo: venta.correo || venta.email || null
  }
}

// Construir cuerpo del documento
function buildCuerpo(items, tipoDteNum) {
  return items.map((item, index) => ({
    numItem: index + 1,
    tipoItem: 1,
    numeroDocumento: null,
    codigo: item.codigo || null,
    codTributo: null,
    descripcion: item.nombre || item.descripcion,
    cantidad: item.qty || item.cantidad || 1,
    uniMedida: 59,
    precioUni: parseFloat(item.precioBase || item.precioUni || 0),
    montoDescu: parseFloat(item.descuento || item.montoDescu || 0),
    ventaNoSuj: 0,
    ventaExenta: 0,
    ventaGravada: parseFloat(item.subtotal || item.ventaGravada || 0),
    tributos: null,
    psv: 0,
    noGravado: 0,
    ivaItem: parseFloat(((item.subtotal || 0) * 0.13).toFixed(8))
  }))
}

// Construir resumen
function buildResumen(venta, tipoDteNum) {
  const subtotal = parseFloat(venta.subtotal || 0)
  const iva = parseFloat(venta.iva || 0)
  const total = parseFloat(venta.total || 0)

  return {
    totalNoSuj: 0,
    totalExenta: 0,
    totalGravada: subtotal,
    subTotalVentas: subtotal,
    descuNoSuj: 0,
    descuExenta: 0,
    descuGravada: 0,
    porcentajeDescuento: 0,
    totalDescu: 0,
    tributos: null,
    subTotal: subtotal,
    ivaPerci1: 0,
    ivaRete1: 0,
    reteRenta: 0,
    montoTotalOperacion: total,
    totalNoGravado: 0,
    totalPagar: total,
    totalLetras: numberToLetras(total),
    saldoFavor: 0,
    condicionOperacion: venta.tipoPago === 'credito' ? 2 : 1,
    pagos: [{
      codigo: venta.formaPago === 'efectivo' ? '01' :
              venta.formaPago === 'tarjeta' ? '02' :
              venta.formaPago === 'transferencia' ? '03' :
              venta.formaPago === 'cheque' ? '04' : '99',
      montoPago: total,
      referencia: venta.referenciaPago || null,
      plazo: null,
      periodo: null
    }],
    numPagoElectronico: null
  }
}

// Convertir número a letras (simplificado)
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const { ventaId, ambiente: ambienteParam } = req.body

    if (!ventaId) {
      return res.status(400).json({ error: 'Falta ventaId' })
    }

    // Leer venta desde Firestore
    const ventaSnap = await db.collection('ventas').doc(ventaId).get()
    if (!ventaSnap.exists) {
      return res.status(404).json({ error: 'Venta no encontrada' })
    }
    const venta = { id: ventaSnap.id, ...ventaSnap.data() }

    // Leer configuración del emisor
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

    // Leer sucursal
    let sucursal = null
    if (venta.sucursalId) {
      const sucursalSnap = await db.collection('sucursales').doc(venta.sucursalId).get()
      if (sucursalSnap.exists) sucursal = sucursalSnap.data()
    }

    // Obtener token MH
    const token = await obtenerToken(ambiente, baseUrl,
      config.mh_usuario, config.mh_password)

    // Construir DTE
    const tipoDteNum = TIPOS_DTE[venta.tipoDte] || '01'
    const version = VERSIONES[tipoDteNum]
    const codigoGeneracion = venta.codigoGeneracion
    const numeroControl = venta.numero

    if (!codigoGeneracion) {
      return res.status(400).json({ error: 'La venta no tiene codigoGeneracion' })
    }

    const ahora = new Date()
    const fecEmi = ahora.toISOString().split('T')[0]
    const horEmi = ahora.toTimeString().split(' ')[0]

    const emisor = buildEmisor(config, sucursal)
    const receptor = venta.tipoDte === 'CCF'
      ? buildReceptorCCF(venta)
      : buildReceptorFE(venta)
    const cuerpo = buildCuerpo(venta.items || [], tipoDteNum)
    const resumen = buildResumen(venta, tipoDteNum)

    const dteJSON = buildDTE({
      tipoDteNum, version, codigoGeneracion, numeroControl,
      ambiente, fecEmi, horEmi, emisor, receptor,
      cuerpo, resumen
    })

    // Firmar DTE
    const privateKeyPem = config.certificado_pem ||
      process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

    const dteFirmado = await firmarDTE(dteJSON, privateKeyPem)

    // Transmitir al MH
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

    // Guardar resultado en Firestore
    if (mhData.estado === 'PROCESADO') {
      await db.collection('ventas').doc(ventaId).update({
        dte_estado: 'PROCESADO',
        dte_sello: mhData.selloRecibido,
        dte_fhProcesamiento: mhData.fhProcesamiento,
        dte_transmitidoEn: new Date()
      })

      // También actualizar en facturas si existe
      const facturasSnap = await db.collection('facturas')
        .where('codigoGeneracion', '==', codigoGeneracion).limit(1).get()

      if (!facturasSnap.empty) {
        await db.collection('facturas').doc(facturasSnap.docs[0].id).update({
          dte_estado: 'PROCESADO',
          dte_sello: mhData.selloRecibido,
          dte_fhProcesamiento: mhData.fhProcesamiento
        })
      }

      return res.status(200).json({
        ok: true,
        estado: 'PROCESADO',
        selloRecibido: mhData.selloRecibido,
        codigoGeneracion,
        fhProcesamiento: mhData.fhProcesamiento
      })

    } else {
      await db.collection('ventas').doc(ventaId).update({
        dte_estado: 'RECHAZADO',
        dte_observaciones: mhData.observaciones,
        dte_transmitidoEn: new Date()
      })

      return res.status(200).json({
        ok: false,
        estado: 'RECHAZADO',
        observaciones: mhData.observaciones,
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