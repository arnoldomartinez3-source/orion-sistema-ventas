// Monta una empresa NO contribuyente (modo sin DTE) con su configuración, sucursal principal, logo y admin.
// Uso: GOOGLE_APPLICATION_CREDENTIALS=<llave> node scripts/crear-empresa-sin-dte.mjs
//   NOMBRE="SUPERMARKET DÍAZ" DUENO="Miguel Díaz" EMAIL=info+supermarketdiaz@orionsv.net PASS=... LOGO=C:/ruta/logo.png [PLAN=emprendedor]
// Replica lo que hace el Panel One Geo (empresas + configuracion + sucursales + usuarios) con el Admin SDK.
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'

const { NOMBRE, DUENO, EMAIL, PASS, LOGO, PLAN = 'emprendedor' } = process.env
if (!NOMBRE || !DUENO || !EMAIL || !PASS) { console.error('Faltan NOMBRE, DUENO, EMAIL o PASS'); process.exit(1) }
initializeApp({ credential: applicationDefault(), storageBucket: 'mi-sistema-ventas-7e541.firebasestorage.app' })
const db = getFirestore()
const PLANES = { emprendedor: { maxUsuarios: 2, maxSucursales: 1 }, negocio: { maxUsuarios: 5, maxSucursales: 1 }, empresa: { maxUsuarios: 10, maxSucursales: 3 } }
const plan = PLANES[PLAN] ? PLAN : 'emprendedor'
// Los 36 permisos (igual que functions/crear-admin.js)
const TODOS_LOS_PERMISOS = ['ver_dashboard', 'ver_punto_venta', 'realizar_ventas', 'aplicar_descuentos', 'cancelar_ventas', 'ver_inventario', 'crear_productos', 'editar_productos', 'eliminar_productos', 'ver_kardex', 'registrar_movimientos', 'importar_exportar', 'ver_clientes', 'crear_clientes', 'editar_clientes', 'eliminar_clientes', 'ver_compras', 'crear_compras', 'editar_compras', 'eliminar_compras', 'ver_cotizaciones', 'crear_cotizaciones', 'editar_cotizaciones', 'eliminar_cotizaciones', 'convertir_a_venta', 'ver_facturas', 'crear_facturas', 'editar_facturas', 'eliminar_facturas', 'imprimir_facturas', 'compartir_whatsapp', 'ver_configuracion', 'editar_configuracion', 'ver_usuarios', 'crear_usuarios', 'editar_usuarios', 'eliminar_usuarios']

const email = EMAIL.trim().toLowerCase()
const ya = await db.collection('empresas').where('nombre', '==', NOMBRE).get()
if (ya.size) { console.error('Ya existe una empresa con ese nombre:', ya.docs[0].id); process.exit(1) }

// Código de acceso único (login de empleados por PIN): 3 letras + 4 dígitos
const usados = new Set((await db.collection('empresas').get()).docs.map(d => d.data().codigoAcceso).filter(Boolean))
const base = NOMBRE.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'ORN'
let codigoAcceso = ''
for (let i = 0; i < 80 && !codigoAcceso; i++) { const c = `${base}-${Math.floor(1000 + Math.random() * 9000)}`; if (!usados.has(c)) codigoAcceso = c }

const empresa = {
  nit: '', nrc: '', nombre: NOMBRE, nombreComercial: NOMBRE, codActividad: '', descActividad: '',
  codDep: '', codMun: '', distrito: '', codDistrito: '', complemento: '', direccion: '', telefono: '', correo: email,
  codEstable: '0001', codPuntoVenta: '1', plan, activa: true, logo: '',
  esDemo: false, esPruebas: false, asistenteCertificacionActivo: false,
  maxSucursales: PLANES[plan].maxSucursales, maxUsuarios: PLANES[plan].maxUsuarios,
  modulos: { levantar_inventario: true },
  sinDte: true, // no contribuyente: comprobantes de venta, sin MH
  propietario: DUENO, codigoAcceso,
  createdAt: FieldValue.serverTimestamp(), createdBy: 'script One Geo (crear-empresa-sin-dte)',
}
const ref = await db.collection('empresas').add(empresa)
const E = ref.id

// Logo → Storage (misma ruta que usa Configuración) con token de descarga
let logoUrl = ''
if (LOGO && fs.existsSync(LOGO)) {
  const bucket = getStorage().bucket(); const token = randomUUID()
  const destino = `empresas/${E}/logos/${Date.now()}.png`
  await bucket.upload(LOGO, { destination: destino, metadata: { contentType: 'image/png', metadata: { firebaseStorageDownloadTokens: token } } })
  logoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destino)}?alt=media&token=${token}`
}

await db.collection('configuracion').doc(E).set({
  empresaNombre: NOMBRE, nombreComercial: NOMBRE, nit: '', nrc: '', codActividad: '', descActividad: '',
  codDep: '', codMun: '', distrito: '', codDistrito: '', complemento: '', direccion: '', telefono: '', correo: email,
  codEstable: '0001', codPuntoVenta: '1',
  logoUrl, ticketOpciones: { logo: !!logoUrl, atendio: true, desgloseIva: false, noEsFactura: false, correo: false },
  ticketMensaje: '¡Gracias por su compra!', updatedAt: FieldValue.serverTimestamp(),
}, { merge: true })

const correlativos = {}; for (const t of ['FE', 'CCF', 'NC', 'ND', 'FEX', 'NR', 'FSE', 'Retencion']) correlativos['correlativo' + t] = 1
await db.collection('sucursales').add({
  nombre: 'Principal', codEstablecimiento: '0001', codEstable: '0001', codPuntoVenta: '0001', codEstableMH: '', codPuntoVentaMH: '',
  codDep: '', codMun: '', distrito: '', codDistrito: '', complemento: '', direccion: '', telefono: '', responsable: DUENO,
  activa: true, principal: true, empresaId: E, ...correlativos, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
})

let user
try { user = await getAuth().createUser({ email, password: String(PASS), displayName: DUENO, emailVerified: false }) }
catch (e) { if (e?.code === 'auth/email-already-exists') { user = await getAuth().getUserByEmail(email); console.log('(el usuario Auth ya existía; se reutiliza)') } else throw e }
await db.collection('usuarios').doc(user.uid).set({
  nombre: DUENO, email, rol: 'administrador', activo: true, permisos: TODOS_LOS_PERMISOS, empresaId: E,
  creadoPorMaestro: true, creadoPor: 'script One Geo', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
})
console.log(JSON.stringify({ empresaId: E, codigoAcceso, plan, sinDte: true, logo: !!logoUrl, admin: email, uid: user.uid }, null, 1))
