import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Inicializar Firebase Admin solo una vez
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const { ambiente } = req.body

    if (!ambiente) {
      return res.status(400).json({ error: 'Falta el campo ambiente' })
    }

    // Leer credenciales MH desde Firestore
    const configSnap = await db.collection('configuracion').limit(1).get()

    if (configSnap.empty) {
      return res.status(400).json({ error: 'No hay configuración guardada' })
    }

    const config = configSnap.docs[0].data()
    const { mh_usuario, mh_password } = config

    if (!mh_usuario || !mh_password) {
      return res.status(400).json({ error: 'Faltan credenciales MH en configuración' })
    }

    // Verificar si ya hay un token válido guardado
    const tokenSnap = await db.collection('mh_tokens').doc(ambiente).get()

    if (tokenSnap.exists) {
      const tokenData = tokenSnap.data()
      const ahora = Date.now()
      const expira = tokenData.expiraEn

      // Si el token tiene menos de 23 horas, reutilizarlo
      if (expira && ahora < expira) {
        return res.status(200).json({
          ok: true,
          token: tokenData.token,
          cached: true
        })
      }
    }

    // Obtener nuevo token del MH
    const baseUrl = MH_URLS[ambiente]
    const body = new URLSearchParams({
      user: mh_usuario,
      pwd: mh_password
    })

    const response = await fetch(`${baseUrl}/seguridad/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ORION-OneGeoSystems/1.0'
      },
      body: body.toString()
    })

    const data = await response.json()

    if (data.status !== 'OK') {
      return res.status(401).json({
        error: 'Credenciales MH inválidas',
        detalle: data
      })
    }

    const token = data.body.token

    // Guardar token en Firestore con expiración de 23 horas
    const expiraEn = Date.now() + (23 * 60 * 60 * 1000)
    await db.collection('mh_tokens').doc(ambiente).set({
      token,
      expiraEn,
      actualizadoEn: new Date()
    })

    return res.status(200).json({
      ok: true,
      token,
      cached: false
    })

  } catch (error) {
    console.error('Error en auth MH:', error)
    return res.status(500).json({
      error: 'Error interno',
      detalle: error.message
    })
  }
}