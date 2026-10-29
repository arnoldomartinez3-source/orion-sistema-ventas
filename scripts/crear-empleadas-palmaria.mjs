// Crea las empleadas de PALMARIA (usuario + PIN provisional) replicando lo que hace Usuarios.jsx +
// functions/establecer-pin.js: doc en 'usuarios', hash scrypt en 'pins_empleado/{uid}' y reserva global
// del nombre en 'usuarios_simple/{usuarioSimple}'. Correr desde la raíz del repo con la llave de servicio.
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { hashearPin, validarPinServidor } from '../functions/pin-util.js'

const EMPRESA = 'eWVgsQboA71k8RcYXrgo' // PALMARIA (AND-1930)
initializeApp({ credential: applicationDefault() }); const db = getFirestore()

const CAJERO = ['ver_dashboard', 'ver_punto_venta', 'realizar_ventas', 'aplicar_descuentos', 'despachar_comandas', 'abrir_gaveta', 'ver_clientes', 'crear_clientes', 'ver_facturas', 'imprimir_facturas']
const ENCARGADO = ['ver_dashboard', 'ver_punto_venta', 'realizar_ventas', 'aplicar_descuentos', 'abrir_gaveta', 'ver_clientes', 'crear_clientes', 'editar_clientes', 'ver_facturas', 'imprimir_facturas', 'compartir_whatsapp', 'ver_inventario', 'crear_productos', 'editar_productos', 'ver_kardex', 'registrar_movimientos', 'ver_compras', 'crear_compras', 'ver_cotizaciones', 'crear_cotizaciones', 'convertir_a_venta', 'ver_reportes']
// Andrea: todas anulan y hacen notas; las encargadas además autorizan descuentos arriba del tope
const EXTRA_TODAS = ['eliminar_facturas', 'crear_facturas', 'compartir_whatsapp']
const EXTRA_ENCARGADA = ['autorizar_descuentos']

const sucs = await db.collection('sucursales').where('empresaId', '==', EMPRESA).get()
const idSuc = (nombre) => { const d = sucs.docs.find(x => x.data().nombre.toUpperCase().startsWith(nombre)); if (!d) throw new Error('sucursal ' + nombre); return d.id }

const personal = [
  ['MULTIPLAZA', 'Laura', 'encargado'], ['MULTIPLAZA', 'Ariana', 'cajero'], ['MULTIPLAZA', 'Fátima', 'cajero'],
  ['MILLENNIUM', 'Alejandra', 'encargado'], ['MILLENNIUM', 'Alisson', 'cajero'],
  ['RAMBLAS', 'Flor', 'encargado'], ['RAMBLAS', 'Beatriz', 'cajero'],
  ['BOLENGO', 'Carolina', 'encargado'], ['BOLENGO', 'Helen', 'cajero'],
]
const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// PIN provisional distinto por persona (6 dígitos, no débil); se cambia con cada una el día de la capacitación
const pinDe = (i) => { let p; do { p = String(Math.floor(100000 + Math.random() * 900000)) } while (validarPinServidor(p)); return p }

const existentes = await db.collection('usuarios').where('empresaId', '==', EMPRESA).get()
const salida = []
for (let i = 0; i < personal.length; i++) {
  const [tienda, nombre, rol] = personal[i]
  const usuarioSimple = sinAcentos(nombre) + '.palmaria'
  if (existentes.docs.some(d => (d.data().usuarioSimple || '') === usuarioSimple)) { salida.push({ tienda, nombre, usuario: usuarioSimple, estado: 'ya existía' }); continue }
  const reserva = await db.collection('usuarios_simple').doc(usuarioSimple).get()
  if (reserva.exists && reserva.data().uid) { const due = await db.collection('usuarios').doc(reserva.data().uid).get(); if (due.exists) { salida.push({ tienda, nombre, usuario: usuarioSimple, estado: 'NOMBRE OCUPADO en otra empresa' }); continue } }
  const pin = pinDe(i)
  const permisos = [...new Set([...(rol === 'encargado' ? ENCARGADO : CAJERO), ...EXTRA_TODAS, ...(rol === 'encargado' ? EXTRA_ENCARGADA : [])])]
  const ref = db.collection('usuarios').doc()
  await ref.set({
    nombre, rol, activo: true, permisos, soloComanda: false, dui: '', tipoAcceso: 'simple', creadoPor: 'script One Geo (capacitación 2026-10-30)',
    empresaId: EMPRESA, usuarioSimple, sucursalId: idSuc(tienda), email: '', pinProvisional: true,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  })
  await db.collection('pins_empleado').doc(ref.id).set({ hash: hashearPin(pin), updatedAt: FieldValue.serverTimestamp(), updatedBy: 'script One Geo' })
  await db.collection('usuarios_simple').doc(usuarioSimple).set({ uid: ref.id, empresaId: EMPRESA, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true })
  salida.push({ tienda, nombre, rol, usuario: usuarioSimple, pin, estado: 'creada' })
}
console.table(salida)
