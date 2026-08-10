import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { importPKCS8, SignJWT } from 'jose'
import { createPrivateKey, randomUUID } from 'crypto'
import { verificarLlamante, exigirMismaEmpresa, responderErrorAuth } from './verificar-llamante.js'
import { cargarConfigMH } from './cargar-config-mh.js'

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
  'NC':  '05',
  'ND':  '06',
  'FEX': '11'
}

// Versión del esquema de evento de invalidación (no del DTE original)
const VERSION_EVENTO = 3

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
// Devuelve la fecha actual en zona America/El_Salvador (UTC-6), formato YYYY-MM-DD.
function fechaSV() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
}

function validarPlazo(tipoDteCode, fechaEmision) {
  const tipoDteNum = TIPOS_DTE[tipoDteCode]
  const limite = PLAZOS_INVALIDACION[tipoDteNum]
  if (!limite || !fechaEmision) return { valido: true }

  // Comparar SOLO días-calendar en zona SV, no timestamps con horas UTC.
  // Esto evita que un CCF emitido a las 9 PM SV (3 AM UTC siguiente día) parezca
  // tener "1 día" cuando en realidad pasaron pocas horas.
  // Usamos Date.UTC con noon para que la suma/resta sea exacta en días enteros.
  const [emiY, emiM, emiD] = fechaEmision.split('-').map(Number)
  const [hoyY, hoyM, hoyD] = fechaSV().split('-').map(Number)
  if (!emiY || !hoyY) return { valido: true }

  const emiTs = Date.UTC(emiY, emiM - 1, emiD, 12, 0, 0)
  const hoyTs = Date.UTC(hoyY, hoyM - 1, hoyD, 12, 0, 0)
  const diffDias = Math.round((hoyTs - emiTs) / (1000 * 60 * 60 * 24))

  if (diffDias > limite) {
    const sugerencia = ['CCF','NC','ND'].includes(tipoDteCode)
      ? 'Para corregir, considerá emitir una Nota de Crédito en su lugar.'
      : 'El plazo de invalidación ya venció.'
    return {
      valido: false,
      motivo: `Plazo de invalidación excedido para ${tipoDteCode}. Máximo ${limite} día(s) desde emisión. Hace ${diffDias} día(s).`,
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
  // CRÍTICO: codificar credenciales con encodeURIComponent.
  // Sin esto, contraseñas con caracteres especiales (@, &, +, etc.)
  // rompen el parsing del form-urlencoded y devuelven 401 falsamente.
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
// Emisor invalidación v3: quita tipoEstablecimiento y nomEstablecimiento.
// Required: nit, nombre, codEstableMH, codEstable, codPuntoVentaMH, codPuntoVenta, telefono, correo.
function buildEmisorInvalidacion(config, sucursal) {
  return {
    nit: config.nit?.replace(/[-]/g, ''),
    nombre: config.empresaNombre || config.nombre,
    codEstableMH: sucursal?.codEstableMH || config.codEstableMH || 'S001',
    codEstable: sucursal?.codEstable || config.codEstable || null,
    codPuntoVentaMH: sucursal?.codPuntoVentaMH || config.codPuntoVentaMH || 'P001',
    codPuntoVenta: sucursal?.codPuntoVenta || config.codPuntoVenta || null,
    telefono: (config.telefono || '').replace(/[-]/g, '') || '',
    correo: config.correo || config.email || ''
  }
}

function buildEvento({ ambiente, factura, config, sucursal, tipoAnulacion, motivoAnulacion, responsable, solicitante, codigoGeneracionReemplazo }) {
  // Usar fecha/hora SV (UTC-6), no UTC del servidor.
  // v3: renombrados fecAnula→fecEmi, horAnula→horEmi.
  const fecEmi = fechaSV()
  const horEmi = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/El_Salvador',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date())
  const tipoDteNum = TIPOS_DTE[factura.tipoDte] || '01'

  // codigoGeneracionR:
  // - Tipo 1 (Error info): UUID del DTE reemplazo (proporcionado por el usuario).
  // - Tipo 2 (Rescindir) y 3 (Otro): null. No hay DTE reemplazo, el MH no acepta
  //   que sea el mismo codigoGeneracion del DTE invalidado.
  const codigoR = (tipoAnulacion === 1 && codigoGeneracionReemplazo)
    ? codigoGeneracionReemplazo.toUpperCase()
    : null

  // v3 quita montoIva. Agrega telefono y correo del receptor.
  // Para Consumidor Final sin documento, ambos campos (tipoDocumento Y numDocumento)
  // deben ir como null. Si solo uno va null, el MH responde:
  //   "[documento.tipoDocumento/numDocumento] VALOR EN CAMPO NO APLICA" (código 024)
  //
  // Limpieza robusta: tratar cadena vacía '', '   ', undefined y null como ausente.
  // Buscar también en campos alternativos donde puede estar guardado el DUI.
  const nitLimpio = (factura.nit || '').toString().replace(/[-\s]/g, '').trim()
  const duiLimpio = (
    factura.dui ||
    factura.numDocumento ||
    (factura.tipoDocumento === '13' ? factura.documento : '') ||
    ''
  ).toString().replace(/[-\s]/g, '').trim()

  // Si NIT tiene 14 dígitos es NIT real. Si tiene 9 dígitos es DUI.
  // (caso común: alguien guarda el DUI en el campo "nit" por error)
  let numDocReceptor = null
  let tipoDocReceptor = null
  if (nitLimpio.length === 14) {
    numDocReceptor = nitLimpio
    tipoDocReceptor = '36' // NIT
  } else if (duiLimpio.length === 9) {
    numDocReceptor = duiLimpio
    tipoDocReceptor = '13' // DUI
  } else if (nitLimpio.length === 9) {
    // DUI guardado en campo NIT
    numDocReceptor = nitLimpio
    tipoDocReceptor = '13' // DUI
  } else if (nitLimpio) {
    // Otro caso (pasaporte, residente, etc.)
    numDocReceptor = nitLimpio
    tipoDocReceptor = inferirTipoDocReceptor(nitLimpio)
  }

  // Log detallado para diagnosticar problemas con identificación del receptor
  console.log('Identificación receptor:', {
    nitRaw: factura.nit, duiRaw: factura.dui,
    nitLimpio, duiLimpio,
    numDocReceptor, tipoDocReceptor,
  })

  const documento = {
    tipoDte: tipoDteNum,
    codigoGeneracion: factura.codigoGeneracion,
    selloRecibido: factura.dte_sello,
    numeroControl: factura.numeroControl,
    fecEmi: factura.fechaEmision,
    codigoGeneracionR: codigoR,
    tipoDocumento: tipoDocReceptor,
    numDocumento: numDocReceptor,
    nombre: factura.cliente || 'Consumidor Final',
    telefono: (() => {
      const t = (factura.telefono || '').replace(/[-\s]/g, '')
      return t.length >= 8 ? t : null
    })(),
    correo: (factura.correo || factura.email || '').trim() || null
  }

  // motivoAnulacion siempre requerido por el MH. Debe ser un texto descriptivo.
  // Si el usuario no proporciona uno, usar un default según el tipoAnulacion.
  const motivoFinal = motivoAnulacion?.trim() || (
    tipoAnulacion === 1 ? 'Error en información del documento' :
    tipoAnulacion === 2 ? 'Rescindir la operación' :
    'Otro motivo'
  )

  const motivo = {
    tipoAnulacion,
    motivoAnulacion: motivoFinal,
    nombreResponsable: responsable.nombre,
    tipDocResponsable: responsable.tipoDoc,
    numDocResponsable: responsable.numDoc,
    nombreSolicita: solicitante.nombre,
    tipDocSolicita: solicitante.tipoDoc,
    numDocSolicita: solicitante.numDoc
  }

  return {
    identificacion: {
      version: VERSION_EVENTO,
      ambiente,
      codigoGeneracion: randomUUID().toUpperCase(),
      fecEmi,
      horEmi,
      fusion: null  // v3 nuevo: null si no aplica
    },
    emisor: buildEmisorInvalidacion(config, sucursal),
    documento,
    motivo
  }
}

export const invalidar = onRequest({ timeoutSeconds: 120, memory: '512MiB' }, async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  // ── CANDADO: solo un usuario autenticado de la empresa puede anular ──
  let llamante
  try {
    llamante = await verificarLlamante(req)
  } catch (err) {
    if (responderErrorAuth(err, res)) return
    return res.status(401).json({ error: 'No autenticado' })
  }

  try {
    const {
      facturaId,
      tipoAnulacion,
      motivoAnulacion,
      responsableId,
      codigoGeneracionReemplazo,
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
    if (tipoAnulInt === 1 && !codigoGeneracionReemplazo) {
      return res.status(400).json({
        error: 'tipoAnulacion=1 (Error en información) requiere indicar el código de generación del DTE que reemplaza al invalidado',
        ayuda: 'Primero emití el DTE corregido y después invalidá el viejo apuntando al nuevo.'
      })
    }

    // ── Leer factura ──
    // Buscamos primero en 'facturas' (POS) y luego en 'operaciones' (NR/FSE).
    // Cualquier DTE de cualquiera de las dos colecciones se puede invalidar.
    let facturaSnap = await db.collection('facturas').doc(facturaId).get()
    let coleccionOrigen = 'facturas'
    if (!facturaSnap.exists) {
      facturaSnap = await db.collection('operaciones').doc(facturaId).get()
      coleccionOrigen = 'operaciones'
    }
    if (!facturaSnap.exists) {
      return res.status(404).json({ error: 'Documento no encontrado en facturas ni operaciones' })
    }
    const factura = { id: facturaSnap.id, ...facturaSnap.data() }

    // El documento debe pertenecer a la empresa del llamante.
    try {
      exigirMismaEmpresa(llamante, factura.empresaId)
    } catch (err) {
      if (responderErrorAuth(err, res)) return
      return res.status(403).json({ error: 'No autorizado' })
    }
    console.log(`Invalidando desde colección '${coleccionOrigen}' (id: ${facturaId})`)

    // Validar que el código de reemplazo NO sea el mismo que el documento original.
    // El MH responde "[documento.codigoGeneracionR] VALORES REPETIDOS" si son iguales.
    if (tipoAnulInt === 1 && codigoGeneracionReemplazo) {
      const codR = codigoGeneracionReemplazo.toUpperCase().trim()
      const codO = (factura.codigoGeneracion || '').toUpperCase().trim()
      if (codR === codO) {
        return res.status(400).json({
          error: 'El código de generación de reemplazo NO puede ser igual al código del documento que se está invalidando',
          ayuda: 'El MH no acepta que un DTE se reemplace a sí mismo. Debés emitir un NUEVO DTE corregido y usar SU código de generación.',
          codigoOriginal: codO,
          codigoReemplazoEnviado: codR
        })
      }
    }

    // tipoAnulacion=1 (Error info) NO aplica para NC ni ND según el MH.
    // Para corregir una NC/ND no se invalida con tipo 1, sino que se emite otra NC/ND
    // que ajuste la situación. Para CCF y FE/FEX SÍ se permite tipo 1 cuando se
    // proporciona codigoGeneracionR (el DTE corregido que reemplaza al invalidado).
    if (tipoAnulInt === 1 && ['NC','ND'].includes(factura.tipoDte)) {
      return res.status(400).json({
        error: `El tipo de anulación 1 (Error en información) NO está permitido para ${factura.tipoDte}`,
        ayuda: `Para corregir un ${factura.tipoDte} con errores, emití otro ${factura.tipoDte} que ajuste la situación, o usá tipo 2 (Rescindir) si se cancela.`
      })
    }

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
    // Config de la empresa de la factura (no la primera con mh_usuario): evita
    // invalidar con certificado/credenciales de otra empresa en multi-empresa.
    let config = await cargarConfigMH(db, factura.empresaId)
    if (!config) {
      const configSnap = await db.collection('configuracion')
        .where('mh_usuario', '!=', null).limit(1).get()
      if (configSnap.empty) {
        return res.status(400).json({ error: 'No hay configuración guardada' })
      }
      config = configSnap.docs[0].data()
    }
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

    // ── Armar solicitante (quien PIDE la anulación) ──
    // Normalmente es el receptor del DTE (cliente). Si no tiene NIT/DUI,
    // el modal DEBE pedir los datos del solicitante real — no se debe
    // suplantar con datos del emisor (sería falsificar el solicitante).
    const numDocSolicita = req.body.solicitanteNumDoc
      || factura.nit?.replace(/[-]/g, '')
      || factura.dui?.replace(/[-]/g, '')
      || ''

    if (!numDocSolicita) {
      return res.status(400).json({
        error: 'Falta el documento del solicitante de la anulación',
        ayuda: 'La factura es a Consumidor Final sin NIT/DUI. Debés ingresar nombre, tipo y número de documento de quien solicita la anulación (cliente o representante).',
        camposRequeridos: ['solicitanteNombre', 'solicitanteTipoDoc', 'solicitanteNumDoc']
      })
    }

    const solicitante = {
      nombre: req.body.solicitanteNombre || factura.cliente || 'Cliente',
      tipoDoc: req.body.solicitanteTipoDoc || inferirTipoDocReceptor(numDocSolicita),
      numDoc: numDocSolicita
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
      solicitante,
      codigoGeneracionReemplazo
    })

    // ── Firmar ──
    const privateKeyPem = config.certificado_pem
    const password = config.certificado_password || null

    // Log del documento generado (útil para diagnosticar errores del MH)
    console.log('Evento documento (antes de firmar):', JSON.stringify({
      tipoDocumento: evento.documento.tipoDocumento,
      numDocumento: evento.documento.numDocumento,
      nombre: evento.documento.nombre,
      telefono: evento.documento.telefono,
      correo: evento.documento.correo,
      codigoGeneracionR: evento.documento.codigoGeneracionR,
    }))

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
      // La empresa dueña del evento: sin esto las reglas no pueden aislar la
      // lectura por empresa (cada quien ve solo sus propias invalidaciones).
      empresaId: factura.empresaId || null,
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
      // Actualizar factura como invalidada con todos los datos para el PDF del evento
      await db.collection(coleccionOrigen).doc(facturaId).update({
        dte_estado_invalidacion: 'INVALIDADO',
        dte_invalidadoEn: FieldValue.serverTimestamp(),
        dte_invalidacionSello: mhData.selloRecibido,
        dte_invalidacionTipo: tipoAnulInt,
        dte_invalidacionMotivo: motivoAnulacion || null,
        dte_invalidacionCodigoGeneracion: evento.identificacion.codigoGeneracion,
        // Datos del responsable y solicitante (necesarios para el PDF del evento)
        dte_invalidacionResponsable: responsable,
        dte_invalidacionSolicitante: solicitante,
        // Datos de tiempo del evento
        dte_invalidacionFecEmi: evento.identificacion.fecEmi,
        dte_invalidacionHorEmi: evento.identificacion.horEmi,
        dte_invalidacionFhProcesamiento: mhData.fhProcesamiento || null,
        dte_invalidacionAmbiente: ambiente,
        // Código de reemplazo (solo tipo 1)
        dte_invalidacionCodigoReemplazo: codigoGeneracionReemplazo || null,
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
})
