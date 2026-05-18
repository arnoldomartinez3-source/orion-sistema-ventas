import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { importPKCS8, SignJWT } from 'jose'
import { createPrivateKey, randomUUID } from 'crypto'

if (!getApps().length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
  )
  initializeApp({ credential: cert(serviceAccount) })
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

// Versión del esquema de evento de invalidación (no del DTE original)
const VERSION_EVENTO = 2

// Plazos máximos para invalidar según tipo de DTE (en días)
const PLAZOS_INVALIDACION = {
  '01': 90,  // FE: 90 días
  '11': 90,  // FEX: 90 días
  '03': 1,   // CCF: 1 día
  '05': 1,   // NC: 1 día
  '06': 1    // ND: 1 día
}

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100

// Infiere el tipo de documento del receptor según el formato del número.
// 36 = NIT (14 dígitos), 13 = DUI (9 dígitos), 36 por defecto.
function inferirTipoDocReceptor(numDoc) {
  if (!numDoc) return '36'
  const clean = String(numDoc).replace(/[-]/g, '')
  if (clean.length === 9) return '13'   // DUI homologado
  return '36'                            // NIT
}

// Valida que el DTE esté dentro del plazo permitido para invalidación.
function validarPlazo(tipoDteCode, fechaEmision) {
  const tipoDteNum = TIPOS_DTE[tipoDteCode]
  const limite = PLAZOS_INVALIDACION[tipoDteNum]
  if (!limite || !fechaEmision) return { valido: true }

  const fechaEmi = new Date(fechaEmision)
  if (isNaN(fechaEmi.getTime())) return { valido: true }

  const ahora = new Date()
  const diffDias = (ahora - fechaEmi) / (1000 * 60 * 60 * 24)

  if (diffDias > limite) {
    const sugerencia = ['CCF','NC','ND'].includes(tipoDteCode)
      ? 'Para corregir, considerá emitir una Nota de Crédito en su lugar.'
      : 'El plazo de invalidación ya venció.'
    return {
      valido: false,
      motivo: `Plazo de invalidación excedido para ${tipoDteCode}. Máximo ${limite} día(s) desde emisión. Hace ${Math.floor(diffDias)} día(s).`,
      sugerencia
    }
  }
  return { valido: true }
}

async function obtenerToken(ambiente, baseUrl, mh_usuario, mh_password, forceRefresh = false) {
  if (!forceRefresh) {
    const tokenSnap = await db.collection('mh_tokens').doc(ambiente).get()
    if (tokenSnap.exists) {
      const tokenData = tokenSnap.data()
      if (tokenData.expiraEn && Date.now() < tokenData.expiraEn) {
        return tokenData.token
      }
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

async function firmarEvento(eventoJSON, privateKeyPem, password) {
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
  const jws = await new SignJWT(eventoJSON)
    .setProtectedHeader({ alg: 'RS512' })
    .sign(privateKey)
  return jws
}

// El emisor en el evento de invalidación tiene una estructura más simple
// que el emisor de un DTE: NO lleva codActividad, descActividad, nrc ni direccion.
function buildEmisorInvalidacion(config, sucursal) {
  return {
    nit: config.nit?.replace(/[-]/g, ''),
    nombre: config.empresaNombre || config.nombre,
    tipoEstablecimiento: sucursal?.tipoEstablecimiento || config.tipoEstablecimiento || '02',
    nomEstablecimiento: sucursal?.nombre || sucursal?.descripcion || config.nomEstablecimiento || null,
    codEstableMH: sucursal?.codEstableMH || config.codEstableMH || 'S001',
    codEstable: sucursal?.codEstable || config.codEstable || null,
    codPuntoVentaMH: sucursal?.codPuntoVentaMH || config.codPuntoVentaMH || 'P001',
    codPuntoVenta: sucursal?.codPuntoVenta || config.codPuntoVenta || null,
    telefono: (config.telefono || '').replace(/[-]/g, '') || '',
    correo: config.correo || config.email || ''
  }
}

function buildEvento({ ambiente, factura, config, sucursal, tipoAnulacion, motivoAnulacion, responsable, solicitante }) {
  const ahora = new Date()
  const fecAnula = ahora.toISOString().split('T')[0]
  const horAnula = ahora.toTimeString().split(' ')[0]
  const tipoDteNum = TIPOS_DTE[factura.tipoDte] || '01'

  // montoIva solo aplica a CCF/NC/ND. Para FE/FEX debe ir null o no enviarse.
  const montoIva = ['03','05','06'].includes(tipoDteNum)
    ? round2(parseFloat(factura.iva || 0))
    : null

  return {
    identificacion: {
      version: VERSION_EVENTO,
      ambiente,
      codigoGeneracion: randomUUID().toUpperCase(),
      fecAnula,
      horAnula
    },
    emisor: buildEmisorInvalidacion(config, sucursal),
    documento: {
      tipoDte: tipoDteNum,
      codigoGeneracion: factura.codigoGeneracion,
      selloRecibido: factura.dte_sello,
      numeroControl: factura.numeroControl,
      fecEmi: factura.fechaEmision,
      montoIva,
      codigoGeneracionR: null,
      tipoDocumento: inferirTipoDocReceptor(factura.nit),
      numDocumento: factura.nit?.replace(/[-]/g, '') || null,
      nombre: factura.cliente || 'Consumidor Final'
    },
    motivo: {
      tipoAnulacion,
      motivoAnulacion: motivoAnulacion || null,
      nombreResponsable: responsable.nombre,
      tipDocResponsable: responsable.tipoDoc,
      numDocResponsable: responsable.numDoc,
      nombreSolicita: solicitante.nombre,
      tipDocSolicita: solicitante.tipoDoc,
      numDocSolicita: solicitante.numDoc
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const {
      facturaId,
      tipoAnulacion,
      motivoAnulacion,
      responsableId,
      ambiente: ambienteParam
    } = req.body

    // ── Validaciones de input ──
    if (!facturaId) {
      return res.status(400).json({ error: 'Falta facturaId' })
    }
    const tipoAnulInt = parseInt(tipoAnulacion)
    if (![1, 2, 3].includes(tipoAnulInt)) {
      return res.status(400).json({
        error: 'tipoAnulacion debe ser 1, 2 o 3',
        ayuda: '1=Error en información, 2=Rescindir operación, 3=Otro (requiere motivo)'
      })
    }
    if (tipoAnulInt === 3 && !motivoAnulacion) {
      return res.status(400).json({ error: 'tipoAnulacion=3 (Otro) requiere indicar motivoAnulacion' })
    }

    // ── Leer factura ──
    const facturaSnap = await db.collection('facturas').doc(facturaId).get()
    if (!facturaSnap.exists) {
      return res.status(404).json({ error: 'Factura no encontrada' })
    }
    const factura = { id: facturaSnap.id, ...facturaSnap.data() }

    // ── Validaciones de estado ──
    if (factura.dte_estado !== 'PROCESADO') {
      return res.status(400).json({
        error: 'Solo se pueden invalidar DTE en estado PROCESADO',
        estadoActual: factura.dte_estado || 'no transmitido'
      })
    }
    if (factura.dte_estado_invalidacion === 'INVALIDADO') {
      return res.status(400).json({ error: 'Este DTE ya fue invalidado previamente' })
    }
    if (!factura.codigoGeneracion || !factura.dte_sello || !factura.numeroControl) {
      return res.status(400).json({
        error: 'La factura no tiene los datos necesarios para invalidar',
        faltantes: [
          !factura.codigoGeneracion && 'codigoGeneracion',
          !factura.dte_sello && 'dte_sello',
          !factura.numeroControl && 'numeroControl'
        ].filter(Boolean)
      })
    }

    // ── Validar plazo ──
    const plazo = validarPlazo(factura.tipoDte, factura.fechaEmision)
    if (!plazo.valido) {
      return res.status(400).json({
        error: plazo.motivo,
        mensaje: plazo.sugerencia
      })
    }

    // ── Leer configuración del emisor ──
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

    // ── Leer sucursal del DTE original ──
    let sucursal = null
    if (factura.sucursalId) {
      const sucSnap = await db.collection('sucursales').doc(factura.sucursalId).get()
      if (sucSnap.exists) sucursal = sucSnap.data()
    }

    // ── Armar responsable (usuario que ejecuta la invalidación) ──
    // Si el usuario en Firestore tiene un campo de DUI, lo usa. Si no, fallback al NIT
    // del emisor como número de documento del responsable.
    let responsable = {
      nombre: 'Sistema',
      tipoDoc: '36',
      numDoc: config.nit?.replace(/[-]/g, '') || ''
    }
    if (responsableId) {
      const userSnap = await db.collection('usuarios').doc(responsableId).get()
      if (userSnap.exists) {
        const user = userSnap.data()
        responsable.nombre = user.nombre || responsable.nombre
        if (user.dui) {
          responsable.tipoDoc = '13'
          responsable.numDoc = String(user.dui).replace(/[-]/g, '')
        } else if (user.nit) {
          responsable.tipoDoc = inferirTipoDocReceptor(user.nit)
          responsable.numDoc = String(user.nit).replace(/[-]/g, '')
        }
      }
    }

    // ── Armar solicitante (receptor del DTE original) ──
    const solicitante = {
      nombre: factura.cliente || 'Consumidor Final',
      tipoDoc: inferirTipoDocReceptor(factura.nit),
      numDoc: factura.nit?.replace(/[-]/g, '') || ''
    }

    // ── Obtener token MH ──
    let token = await obtenerToken(ambiente, baseUrl, config.mh_usuario, config.mh_password)

    // ── Armar evento ──
    const evento = buildEvento({
      ambiente,
      factura,
      config,
      sucursal,
      tipoAnulacion: tipoAnulInt,
      motivoAnulacion,
      responsable,
      solicitante
    })

    // ── Firmar ──
    const privateKeyPem = config.certificado_pem
    const password = config.certificado_password || null
    const eventoFirmado = await firmarEvento(evento, privateKeyPem, password)

    // ── Transmitir a MH ──
    // El payload externo replica la estructura que usa transmitir.js (que sí
    // funciona). El MH valida permisos contra tipoDte y codigoGeneracion antes
    // de descifrar el JWT, por eso esos campos son necesarios afuera también.
    const tipoDteNumOriginal = TIPOS_DTE[factura.tipoDte] || '01'
    const payload = {
      ambiente,
      idEnvio: 1,
      version: VERSION_EVENTO,
      tipoDte: tipoDteNumOriginal,
      documento: eventoFirmado,
      codigoGeneracion: evento.identificacion.codigoGeneracion
    }

    const enviarMH = async (authToken, withBearer = false) => {
      const authValue = withBearer ? `Bearer ${authToken}` : authToken
      // URL correcta según Manual Técnico oficial MH (sección 4.5):
      // /fesv/anulardte (NO /fesv/recepcion/invalidacion que es lo que asumimos al inicio)
      const resp = await fetch(`${baseUrl}/fesv/anulardte`, {
        method: 'POST',
        headers: {
          'Authorization': authValue,
          'Content-Type': 'application/json',
          'User-Agent': 'ORION-OneGeoSystems/1.0'
        },
        body: JSON.stringify(payload)
      })
      const txt = await resp.text()
      return { status: resp.status, text: txt }
    }

    // Estrategia escalonada para superar el 401:
    // 1) Token cacheado sin Bearer (como transmitir.js)
    // 2) Si 401: token fresco sin Bearer (por si el cache estaba mal)
    // 3) Si 401: token fresco con prefijo "Bearer " (algunos endpoints lo exigen)
    let { status: mhStatus, text: mhText } = await enviarMH(token, false)
    console.log('MH invalidación intento 1 (cache, sin Bearer) → status:', mhStatus)

    if (mhStatus === 401) {
      console.log('Intento 1 falló con 401. Regenerando token y reintentando sin Bearer...')
      token = await obtenerToken(ambiente, baseUrl, config.mh_usuario, config.mh_password, true)
      const retry2 = await enviarMH(token, false)
      mhStatus = retry2.status
      mhText = retry2.text
      console.log('MH invalidación intento 2 (fresco, sin Bearer) → status:', mhStatus)

      if (mhStatus === 401) {
        console.log('Intento 2 también falló con 401. Probando con prefijo Bearer...')
        const retry3 = await enviarMH(token, true)
        mhStatus = retry3.status
        mhText = retry3.text
        console.log('MH invalidación intento 3 (fresco, con Bearer) → status:', mhStatus)
      }
    }

    console.log('MH invalidación → body:', mhText?.slice(0, 2000))

    let mhData
    if (!mhText || mhText.trim().length === 0) {
      // Respuesta vacía: lo más común es que el MH rechazó el payload
      // antes de procesarlo (mal formato, firma inválida, credenciales).
      return res.status(502).json({
        ok: false,
        estado: 'ERROR_MH',
        error: 'El MH devolvió respuesta vacía',
        mensaje: `Status HTTP del MH: ${mhStatus}. Esto suele ocurrir por payload mal formado, firma inválida o problema de credenciales. Revisar logs del servidor para ver el payload enviado.`,
        statusHttpMH: mhStatus,
        codigoGeneracionEvento: evento.identificacion.codigoGeneracion,
        payloadEnviado: payload
      })
    }
    try {
      mhData = JSON.parse(mhText)
    } catch (e) {
      // No es JSON válido (a veces el MH devuelve HTML de error)
      return res.status(502).json({
        ok: false,
        estado: 'ERROR_MH',
        error: 'El MH devolvió una respuesta que no es JSON',
        respuestaCruda: mhText.slice(0, 500),
        statusHttpMH: mhStatus,
        codigoGeneracionEvento: evento.identificacion.codigoGeneracion
      })
    }

    // ── Guardar evento en colección eventos_invalidacion ──
    const eventoDoc = {
      facturaId: factura.id,
      facturaCodigoGeneracion: factura.codigoGeneracion,
      facturaTipoDte: factura.tipoDte,
      facturaNumeroControl: factura.numeroControl,
      codigoGeneracionEvento: evento.identificacion.codigoGeneracion,
      tipoAnulacion: tipoAnulInt,
      motivoAnulacion: motivoAnulacion || null,
      responsable,
      solicitante,
      estado: mhData.estado || 'DESCONOCIDO',
      selloRecibido: mhData.selloRecibido || null,
      fhProcesamiento: mhData.fhProcesamiento || null,
      observaciones: mhData.observaciones || null,
      transmitidoEn: FieldValue.serverTimestamp(),
      ambiente
    }
    await db.collection('eventos_invalidacion').add(eventoDoc)

    if (mhData.estado === 'PROCESADO') {
      // Actualizar factura como invalidada
      await db.collection('facturas').doc(facturaId).update({
        dte_estado_invalidacion: 'INVALIDADO',
        dte_invalidadoEn: FieldValue.serverTimestamp(),
        dte_invalidacionSello: mhData.selloRecibido,
        dte_invalidacionTipo: tipoAnulInt,
        dte_invalidacionMotivo: motivoAnulacion || null,
        dte_invalidacionCodigoGeneracion: evento.identificacion.codigoGeneracion
      })

      // Si hay venta asociada, marcarla también
      const ventasSnap = await db.collection('ventas')
        .where('codigoGeneracion', '==', factura.codigoGeneracion)
        .limit(1)
        .get()
      if (!ventasSnap.empty) {
        await db.collection('ventas').doc(ventasSnap.docs[0].id).update({
          dte_estado_invalidacion: 'INVALIDADO',
          dte_invalidadoEn: FieldValue.serverTimestamp()
        })
      }

      return res.status(200).json({
        ok: true,
        estado: 'PROCESADO',
        selloRecibido: mhData.selloRecibido,
        codigoGeneracionEvento: evento.identificacion.codigoGeneracion,
        fhProcesamiento: mhData.fhProcesamiento
      })
    } else {
      return res.status(200).json({
        ok: false,
        estado: 'RECHAZADO',
        observaciones: mhData.observaciones,
        codigoGeneracionEvento: evento.identificacion.codigoGeneracion,
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