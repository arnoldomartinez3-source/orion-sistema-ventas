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
    // Leer configuración
    const configSnap = await db.collection('configuracion').limit(1).get()
    if (configSnap.empty) {
      return res.status(400).json({ error: 'No hay configuración guardada' })
    }
    const config = configSnap.docs[0].data()

    const ambiente = config.mh_ambiente || '00'
    const baseUrl = MH_URLS[ambiente]

    // Obtener token
    const token = await obtenerToken(ambiente, baseUrl,
      config.mh_usuario, config.mh_password)

    // Leer DTEs pendientes en cola de contingencia
    const colaSnap = await db.collection('contingencia_queue')
      .where('estado', '==', 'PENDIENTE')
      .orderBy('creadoEn', 'asc')
      .limit(100)
      .get()

    if (colaSnap.empty) {
      return res.status(200).json({
        ok: true,
        mensaje: 'No hay DTEs pendientes en contingencia'
      })
    }

    const dtesPendientes = colaSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    // Registrar inicio y fin de contingencia
    const primerDTE = dtesPendientes[0]
    const ultimoDTE = dtesPendientes[dtesPendientes.length - 1]

    const fInicio = primerDTE.creadoEn?.toDate?.()?.toISOString()?.split('T')[0]
      || new Date().toISOString().split('T')[0]
    const fFin = ultimoDTE.creadoEn?.toDate?.()?.toISOString()?.split('T')[0]
      || new Date().toISOString().split('T')[0]
    const hInicio = primerDTE.creadoEn?.toDate?.()?.toTimeString()?.split(' ')[0]
      || '00:00:00'
    const hFin = new Date().toTimeString().split(' ')[0]

    const codigoGeneracion = crypto.randomUUID().toUpperCase()

    // Construir JSON de contingencia según schema MH v3
    const contingenciaJSON = {
      identificacion: {
        version: 3,
        ambiente,
        codigoGeneracion,
        fTransmision: new Date().toISOString().split('T')[0],
        hTransmision: new Date().toTimeString().split(' ')[0]
      },
      emisor: {
        nit: config.nit?.replace(/[-]/g, ''),
        nombre: config.empresaNombre || config.nombre,
        nombreResponsable: config.empresaNombre || config.nombre,
        tipoDocResponsable: '36',
        numeroDocResponsable: config.nit?.replace(/[-]/g, ''),
        tipoEstablecimiento: config.tipoEstablecimiento || '02',
        codEstableMH: config.codEstableMH || null,
        codPuntoVenta: config.codPuntoVenta || null,
        telefono: config.telefono?.replace(/[-]/g, '') || '',
        correo: config.correo || config.email || ''
      },
      detalleDTE: dtesPendientes.map((dte, index) => ({
        noItem: index + 1,
        codigoGeneracion: dte.codigoGeneracion,
        tipoDoc: dte.tipoDte === 'FE' ? '01' :
                 dte.tipoDte === 'CCF' ? '03' :
                 dte.tipoDte === 'NC' ? '05' :
                 dte.tipoDte === 'ND' ? '06' : '01'
      })),
      motivo: {
        fInicio,
        fFin,
        hInicio,
        hFin,
        tipoContingencia: 2,
        motivoContingencia: 'Sistema MH no disponible temporalmente'
      }
    }

    // Firmar
    const privateKeyPem = config.certificado_pem ||
      process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

    const documentoFirmado = await firmarDocumento(contingenciaJSON, privateKeyPem)

    // Transmitir evento de contingencia al MH
    const mhResponse = await fetch(`${baseUrl}/fesv/contingencia`, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'User-Agent': 'ORION-OneGeoSystems/1.0'
      },
      body: JSON.stringify({
        nit: config.nit?.replace(/[-]/g, ''),
        documento: documentoFirmado
      })
    })

    const mhData = await mhResponse.json()

    if (mhData.estado === 'RECIBIDO') {
      // Actualizar todos los DTEs de la cola como procesados
      const batch = db.batch()
      colaSnap.docs.forEach(doc => {
        batch.update(doc.ref, {
          estado: 'CONTINGENCIA_ENVIADA',
          selloContingencia: mhData.selloRecibido,
          actualizadoEn: new Date()
        })
      })
      await batch.commit()

      return res.status(200).json({
        ok: true,
        estado: 'RECIBIDO',
        selloRecibido: mhData.selloRecibido,
        totalDTEs: dtesPendientes.length,
        mensaje: `Evento de contingencia enviado con ${dtesPendientes.length} DTEs`
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
    console.error('Error en contingencia:', error)
    return res.status(500).json({
      error: 'Error interno',
      detalle: error.message
    })
  }
}