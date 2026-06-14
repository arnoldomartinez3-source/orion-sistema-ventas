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

// Versión del esquema del evento de contingencia
const VERSION_EVENTO = 4

// Fecha actual en zona America/El_Salvador (UTC-6), formato YYYY-MM-DD.
function fechaSV() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
}

// Hora actual en zona SV, formato HH:mm:ss
function horaSV() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/El_Salvador',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date())
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

// Emisor del evento de contingencia (según schema oficial v4).
// Obligatorios: nit, nombre, nombreResponsable, tipoDocResponsable,
// numeroDocResponsable, tipoEstablecimiento, telefono, correo.
// Opcionales (pueden ser null): codEstableMH, codPuntoVentaMH.
// CAMBIO v3→v4: codPuntoVenta se renombró a codPuntoVentaMH.
function buildEmisorContingencia(config, sucursal, responsable) {
  // telefono: obligatorio, mínimo 8 caracteres. Si falta, fallback genérico.
  let telefono = (config.telefono || '').replace(/[-\s]/g, '')
  if (telefono.length < 8) telefono = '00000000'

  // correo: obligatorio y formato email válido. Si no es válido, fallback.
  let correo = (config.correo || config.email || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) correo = 'facturacion@onegeosystems.com'

  // nombreResponsable: obligatorio, mínimo 5 caracteres.
  let nombreResp = responsable.nombre || 'Responsable'
  if (nombreResp.length < 5) nombreResp = 'Responsable Sistema'

  // numeroDocResponsable: obligatorio, mínimo 5 caracteres.
  let numDocResp = responsable.numDoc || ''
  if (numDocResp.length < 5) numDocResp = config.nit?.replace(/[-]/g, '') || '00000000000000'

  return {
    nit: config.nit?.replace(/[-]/g, ''),
    nombre: config.empresaNombre || config.nombre,
    nombreResponsable: nombreResp,
    tipoDocResponsable: responsable.tipoDoc || '36',
    numeroDocResponsable: numDocResp,
    tipoEstablecimiento: sucursal?.tipoEstablecimiento || config.tipoEstablecimiento || '02',
    codEstableMH: sucursal?.codEstableMH || config.codEstableMH || null,
    codPuntoVentaMH: sucursal?.codPuntoVentaMH || config.codPuntoVentaMH || null,
    telefono,
    correo
  }
}

// Arma el evento de contingencia completo.
// motivo.tipoContingencia: 1=No disponibilidad MH, 2=No disponibilidad internet emisor,
//   3=Falla suministro eléctrico, 4=Falla en sistema del emisor, 5=Otro.
function buildEventoContingencia({ ambiente, config, sucursal, responsable, dtes, tipoContingencia, motivoContingencia, fInicio, hInicio, fFin, hFin }) {
  const detalleDTE = dtes.map((dte, idx) => ({
    noItem: idx + 1,
    codigoGeneracion: String(dte.codigoGeneracion).toUpperCase(),
    tipoDoc: TIPOS_DTE[dte.tipoDte] || dte.tipoDoc || '01'
  }))

  const motivoFinal = motivoContingencia?.trim() || (
    tipoContingencia === 1 ? 'No disponibilidad del sistema del Ministerio de Hacienda' :
    tipoContingencia === 2 ? 'No disponibilidad de servicio de internet del emisor' :
    tipoContingencia === 3 ? 'Falla en el suministro de servicio eléctrico del emisor' :
    tipoContingencia === 4 ? 'Falla en el sistema del emisor' :
    'Otro motivo de contingencia'
  )

  return {
    identificacion: {
      version: VERSION_EVENTO,
      ambiente,
      codigoGeneracion: randomUUID().toUpperCase(),
      fTransmision: fechaSV(),
      hTransmision: horaSV()
    },
    emisor: buildEmisorContingencia(config, sucursal, responsable),
    detalleDTE,
    motivo: {
      fInicio,
      fFin,
      hInicio,
      hFin,
      tipoContingencia,
      motivoContingencia: tipoContingencia === 5 ? motivoFinal : null
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const {
      facturaIds,           // array de IDs de facturas emitidas en contingencia
      tipoContingencia,     // 1-5
      motivoContingencia,   // texto (requerido si tipo 5)
      fInicio, hInicio,     // inicio del período de contingencia
      fFin, hFin,           // fin del período
      responsableId,
      ambiente: ambienteParam
    } = req.body

    // ── Validaciones de input ──
    if (!Array.isArray(facturaIds) || facturaIds.length === 0) {
      return res.status(400).json({ error: 'Falta facturaIds (array de DTE en contingencia)' })
    }
    if (facturaIds.length > 100) {
      return res.status(400).json({ error: 'Máximo 100 DTE por evento de contingencia' })
    }
    const tipoCont = parseInt(tipoContingencia)
    if (![1, 2, 3, 4, 5].includes(tipoCont)) {
      return res.status(400).json({
        error: 'tipoContingencia debe ser 1-5',
        ayuda: '1=No disp. MH, 2=No disp. internet, 3=Falla eléctrica, 4=Falla sistema emisor, 5=Otro'
      })
    }
    if (tipoCont === 5 && !motivoContingencia?.trim()) {
      return res.status(400).json({ error: 'tipoContingencia=5 (Otro) requiere indicar motivoContingencia' })
    }

    // ── Leer las facturas ──
    const dtes = []
    for (const fid of facturaIds) {
      const snap = await db.collection('facturas').doc(fid).get()
      if (snap.exists) {
        const f = { id: snap.id, ...snap.data() }
        if (f.codigoGeneracion) dtes.push(f)
      }
    }
    if (dtes.length === 0) {
      return res.status(404).json({ error: 'Ninguna factura válida encontrada (sin codigoGeneracion)' })
    }

    // ── Leer configuración del emisor: primero por empresa (del primer DTE),
    //    con fallback al modo viejo para compatibilidad. ──
    let config = null
    const empresaIdDte = dtes[0]?.empresaId
    if (empresaIdDte) {
      const docEmpresa = await db.collection('configuracion').doc(empresaIdDte).get()
      if (docEmpresa.exists) config = docEmpresa.data()
    }
    if (!config) {
      const configSnap = await db.collection('configuracion')
        .where('mh_usuario', '!=', null)
        .limit(1)
        .get()
      if (!configSnap.empty) config = configSnap.docs[0].data()
    }
    if (!config) {
      return res.status(400).json({ error: 'No hay configuración guardada' })
    }
    const ambiente = ambienteParam || config.mh_ambiente || '00'
    const baseUrl = MH_URLS[ambiente]

    // ── Sucursal del primer DTE ──
    let sucursal = null
    if (dtes[0].sucursalId) {
      const sucSnap = await db.collection('sucursales').doc(dtes[0].sucursalId).get()
      if (sucSnap.exists) sucursal = sucSnap.data()
    }

    // ── Responsable ──
    let responsable = {
      nombre: config.empresaNombre || config.nombre || 'Sistema',
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
        }
      }
    }

    // ── Período de contingencia (default: hoy SV) ──
    const hoy = fechaSV()
    const periodo = {
      fInicio: fInicio || hoy,
      fFin: fFin || hoy,
      hInicio: hInicio || '08:00:00',
      hFin: hFin || horaSV()
    }

    // ── Token ──
    let token = await obtenerToken(ambiente, baseUrl, config.mh_usuario, config.mh_password)

    // ── Armar evento ──
    const evento = buildEventoContingencia({
      ambiente, config, sucursal, responsable, dtes,
      tipoContingencia: tipoCont, motivoContingencia,
      ...periodo
    })

    // ── Firmar ──
    const privateKeyPem = config.certificado_pem
    const password = config.certificado_password || null
    const eventoFirmado = await firmarEvento(evento, privateKeyPem, password)

    // ── Transmitir a /fesv/contingencia ──
    const nitEmisor = config.nit?.replace(/[-]/g, '')
    async function enviar(tok) {
      return fetch(`${baseUrl}/fesv/contingencia`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ORION-OneGeoSystems/1.0',
          'Authorization': tok
        },
        body: JSON.stringify({
          nit: nitEmisor,
          documento: eventoFirmado
        })
      })
    }

    let resp = await enviar(token)
    // Si el token expiró (401), refrescar y reintentar una vez.
    if (resp.status === 401) {
      token = await obtenerToken(ambiente, baseUrl, config.mh_usuario, config.mh_password, true)
      resp = await enviar(token)
    }

    const texto = await resp.text()
    let mhData
    try {
      mhData = texto ? JSON.parse(texto) : {}
    } catch (e) {
      mhData = { estado: 'ERROR', mensaje: 'Respuesta no-JSON del MH', raw: texto }
    }

    // ── Procesar respuesta ──
    if (mhData.estado === 'RECIBIDO') {
      // Marcar las facturas como informadas en contingencia
      const batch = db.batch()
      for (const f of dtes) {
        batch.update(db.collection('facturas').doc(f.id), {
          contingencia_informada: true,
          contingencia_sello: mhData.selloRecibido || null,
          contingencia_fecha: mhData.fechaHora || null
        })
      }
      await batch.commit()

      // Guardar el evento de contingencia
      await db.collection('eventos_contingencia').add({
        codigoGeneracion: evento.identificacion.codigoGeneracion,
        selloRecibido: mhData.selloRecibido || null,
        tipoContingencia: tipoCont,
        cantidadDTE: dtes.length,
        facturaIds: dtes.map(f => f.id),
        ambiente,
        creadoEn: FieldValue.serverTimestamp()
      })

      return res.status(200).json({
        ok: true,
        estado: 'RECIBIDO',
        selloRecibido: mhData.selloRecibido,
        mensaje: mhData.mensaje,
        cantidadDTE: dtes.length,
        codigoGeneracion: evento.identificacion.codigoGeneracion
      })
    } else {
      return res.status(400).json({
        ok: false,
        estado: mhData.estado || 'RECHAZADO',
        mensaje: mhData.mensaje,
        observaciones: mhData.observaciones || [],
        codigoGeneracion: evento.identificacion.codigoGeneracion,
        detalleMH: mhData
      })
    }

  } catch (error) {
    console.error('Error en contingencia:', error)
    return res.status(500).json({ error: 'Error interno', detalle: error.message })
  }
}