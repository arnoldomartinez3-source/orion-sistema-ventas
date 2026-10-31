// Asigna un PIN de cobro a un ADMINISTRADOR (la pantalla Usuarios solo pone PIN a empleadas por PIN).
// El PIN sirve para "PIN al cobrar" y para autorizar descuentos arriba del tope. Se imprime UNA vez.
// Uso (con la llave de servicio en GOOGLE_APPLICATION_CREDENTIALS):
//   node scripts/pin-cobro-admin.mjs <empresaId> "<parte del nombre>" [PIN de 6 dígitos]
import fs from 'node:fs'
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { hashearPin, validarPinServidor } from '../functions/pin-util.js'

const [empresaId, nombre, pinDado] = process.argv.slice(2)
if (!empresaId || !nombre) { console.error('uso: node scripts/pin-cobro-admin.mjs <empresaId> "<nombre>" [PIN]'); process.exit(1) }
// Llave de servicio: la variable GOOGLE_APPLICATION_CREDENTIALS o, si no está, la de Descargas
const llave = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'C:/Users/geova/Downloads/mi-sistema-ventas-7e541-firebase-adminsdk-fbsvc-8a009dd2de.json'
if (!fs.existsSync(llave)) { console.error('No encuentro la llave de servicio:', llave); process.exit(1) }
initializeApp({ credential: process.env.GOOGLE_APPLICATION_CREDENTIALS ? applicationDefault() : cert(JSON.parse(fs.readFileSync(llave, 'utf8'))), projectId: 'mi-sistema-ventas-7e541' })
const db = getFirestore()

const s = await db.collection('usuarios').where('empresaId', '==', empresaId).where('rol', '==', 'administrador').get()
const u = s.docs.find(d => String(d.data().nombre || '').toLowerCase().includes(nombre.toLowerCase()))
if (!u) { console.error('No hay administrador con ese nombre en la empresa'); process.exit(1) }
let pin = pinDado
if (pin) { const mal = validarPinServidor(pin); if (mal) { console.error('PIN rechazado:', mal); process.exit(1) } }
else { do { pin = String(Math.floor(100000 + Math.random() * 900000)) } while (validarPinServidor(pin)) }
await db.collection('pins_empleado').doc(u.id).set({ hash: hashearPin(pin), updatedAt: FieldValue.serverTimestamp(), updatedBy: 'script pin-cobro-admin' })
await u.ref.update({ pinProvisional: true, updatedAt: FieldValue.serverTimestamp() })
console.log(`PIN de cobro para ${u.data().nombre}: ${pin}  (dáselo en persona; cámbialo cuando quieras volviendo a correr este script)`)
