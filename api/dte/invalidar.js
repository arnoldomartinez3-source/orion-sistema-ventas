import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { importPKCS8, SignJWT } from 'jose'

iif (!getApps().length) {
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
  if (data.status !== 'OK') throw new Error('Error autenticando con MH')
  const token = data.body.token
  const expiraEn = Date.now() + (23 * 60 * 60 * 1000)
  await db.collection('mh_tokens').doc(ambiente).set({
    token, expiraEn, actualizadoEn: new Date()
  })
  return token
}

async function firmarDocumento(docJSON, privateKeyPem) {
  const privateKey = await importPKCS8(privateKeyPem, 'RS512')
  const jws = await new SignJWT(docJSON)
    .setProtectedHeader({ alg: 'RS512' })
    .sign(privateKey)
  return jws
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const { facturaId } = req.body

    if (!facturaId) {
      return res.status(400).json({ error: 'Falta facturaId' })
    }

    // Leer factura desde Firestore
    const facturaSnap = await db.collection('facturas').doc(facturaId).get()
    if (!facturaSnap.exists) {
      return res.status(404).json({ error: 'Factura no encontrada' })
    }
    const factura = { id: facturaSnap.id, ...facturaSnap.data() }

    // Verificar que tiene sello (fue procesada por el MH)
    if (!factura.dte_sello) {
      return res.status(400).json({
        error: 'Esta factura no tiene sello de recepción del MH. Solo se pueden invalidar DTEs que fueron transmitidos y procesados por el MH.'
      })
    }

    // Leer configuración
    const configSnap = await db.collection('configuracion')
  .where('mh_usuario', '!=', null)
  .limit(1)
  .get()
    if (configSnap.empty) {
      return res.status(400).json({ error: 'No hay configuración guardada' })
    }
    const config = configSnap.docs[0].data()

    const ambiente = config.mh_ambiente || '00'
    const baseUrl = MH_URLS[ambiente]

    // Obtener token
    const token = await obtenerToken(ambiente, baseUrl,
      config.mh_usuario, config.mh_password)

    // Leer evento de invalidación desde Firestore
    const eventosSnap = await db.collection('eventos_invalidacion')
      .where('facturaId', '==', facturaId)
      .orderBy('creadoEn', 'desc')
      .limit(1)
      .get()

    if (eventosSnap.empty) {
      return res.status(400).json({ error: 'No hay evento de invalidación registrado para esta factura' })
    }

    const evento = eventosSnap.docs[0].data()

    // Construir JSON de invalidación según schema MH v2
    const ahora = new Date()
    const codigoGeneracion = crypto.randomUUID().toUpperCase()

    const invalidacionJSON = {
      identificacion: {
        version: 2,
        ambiente,
        codigoGeneracion,
        fecAnula: ahora.toISOString().split('T')[0],
        horAnula: ahora.toTimeString().split(' ')[0]
      },
      emisor: {
        nit: config.nit?.replace(/[-]/g, ''),
        nombre: config.empresaNombre || config.nombre,
        tipoEstablecimiento: config.tipoEstablecimiento || '02',
        nomEstablecimiento: config.nombreComercial || null,
        codEstableMH: config.codEstableMH || null,
        codEstable: config.codEstable || null,
        codPuntoVentaMH: config.codPuntoVentaMH || null,
        codPuntoVenta: config.codPuntoVenta || null,
        telefono: config.telefono?.replace(/[-]/g, '') || null,
        correo: config.correo || config.email || ''
      },
      documento: {
        tipoDte: factura.tipoDte === 'FE' ? '01' :
                 factura.tipoDte === 'CCF' ? '03' :
                 factura.tipoDte === 'NC' ? '05' :
                 factura.tipoDte === 'ND' ? '06' : '01',
        codigoGeneracion: factura.codigoGeneracion,
        selloRecibido: factura.dte_sello,
        numeroControl: factura.numero,
        fecEmi: factura.fechaEmision,
        montoIva: parseFloat(factura.iva || 0),
        codigoGeneracionR: null,
        tipoDocumento: factura.tipoDocumento || '13',
        numDocumento: factura.numDocumento || factura.nit || '00000000-0',
        nombre: factura.cliente,
        telefono: factura.telefono || null,
        correo: factura.correo || factura.email || ''
      },
      motivo: {
        tipoAnulacion: parseInt(evento.tipoInvalidacion || '1'),
        motivoAnulacion: evento.motivoDetalle || null,
        nombreResponsable: config.empresaNombre || config.nombre,
        tipDocResponsable: '36',
        numDocResponsable: config.nit?.replace(/[-]/g, '') || '',
        nombreSolicita: factura.cliente || '',
        tipDocSolicita: factura.tipoDocumento || '13',
        numDocSolicita: factura.numDocumento || factura.nit || '00000000-0'
      }
    }

    // Firmar
    const privateKeyPem = config.certificado_pem ||
      process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

    const documentoFirmado = await firmarDocumento(invalidacionJSON, privateKeyPem)

    // Transmitir al MH
    const payload = {
      ambiente,
      idEnvio: 1,
      version: 2,
      documento: documentoFirmado
    }

    const mhResponse = await fetch(`${baseUrl}/fesv/anulardte`, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'User-Agent': 'ORION-OneGeoSystems/1.0'
      },
      body: JSON.stringify(payload)
    })

    const mhData = await mhResponse.json()

    // Guardar resultado
    if (mhData.estado === 'PROCESADO') {
      await db.collection('facturas').doc(facturaId).update({
        dte_estado: 'ANULADO_MH',
        dte_sello_anulacion: mhData.selloRecibido,
        dte_anulado_en: new Date()
      })

      await db.collection('eventos_invalidacion').doc(eventosSnap.docs[0].id).update({
        transmitidoMH: true,
        selloMH: mhData.selloRecibido,
        transmitidoEn: new Date()
      })

      return res.status(200).json({
        ok: true,
        estado: 'PROCESADO',
        selloRecibido: mhData.selloRecibido
      })

    } else {
      return res.status(200).json({
        ok: false,
        estado: 'RECHAZADO',
        observaciones: mhData.observaciones,
        detalleMH: mhData
      })
    }

  } catch (error) {
    console.error('Error invalidando DTE:', error)
    return res.status(500).json({
      error: 'Error interno',
      detalle: error.message
    })
  }
}