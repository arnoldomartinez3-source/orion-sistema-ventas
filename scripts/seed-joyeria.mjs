#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// seed-joyeria.mjs · ORIÓN — Generador de datos DEMO de una JOYERÍA
//
// Mismo mecanismo que seed-ferreteria.mjs: categorías, productos, clientes y
// proveedores para UNA empresa, marcados con _seedTag para poder resetear.
//
// ── Uso (PowerShell, desde la raíz del repo) ────────────────────────────────
//   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\geova\Downloads\<llave-de-servicio>.json"
//   node scripts/seed-joyeria.mjs GEO-1234          (código de empresa o empresaId)
//   node scripts/seed-joyeria.mjs GEO-1234 --solo-limpiar
//
// • Re-ejecutar BORRA primero lo que sembró este script (por _seedTag) y vuelve
//   a insertar; los datos cargados a mano no se tocan.
// • NIT/NRC/DUI y códigos de barras son FICTICIOS (ambiente de pruebas).
// • Precios: precio de VENTA SIN IVA (la app le suma el 13 %), como en la ferretería.
// ══════════════════════════════════════════════════════════════════════════

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const SEED_TAG = 'joyeria-demo'
const argEmpresa = process.argv[2]
const soloLimpiar = process.argv.includes('--solo-limpiar')

if (!argEmpresa || argEmpresa.startsWith('--')) {
  console.error('\n❌ Falta el empresaId o el código de empresa.')
  console.error('   Uso: node scripts/seed-joyeria.mjs <empresaId|CODIGO> [--solo-limpiar]\n')
  process.exit(1)
}

initializeApp({ credential: applicationDefault() })
const db = getFirestore()
const ts = () => FieldValue.serverTimestamp()
let empresaId = null

async function resolverEmpresa(arg) {
  const byId = await db.collection('empresas').doc(arg).get()
  if (byId.exists) return { id: byId.id, nombre: byId.data().nombreComercial || byId.data().nombre || '' }
  const q = await db.collection('empresas').where('codigoAcceso', '==', String(arg).toUpperCase().trim()).limit(1).get()
  if (!q.empty) return { id: q.docs[0].id, nombre: q.docs[0].data().nombreComercial || q.docs[0].data().nombre || '' }
  return null
}

const pad = (n, w = 3) => String(n).padStart(w, '0')
const barcode = (i) => '7401' + pad(2000 + i, 4)

async function insertar(coleccion, docs) {
  let creados = 0
  for (let i = 0; i < docs.length; i += 400) {
    const lote = db.batch()
    for (const d of docs.slice(i, i + 400)) {
      lote.set(db.collection(coleccion).doc(), { ...d, empresaId, _seedTag: SEED_TAG, createdAt: ts() })
      creados++
    }
    await lote.commit()
  }
  console.log(`   ✓ ${coleccion.padEnd(12)} ${creados} documentos`)
  return creados
}

async function purgarSeedPrevio() {
  let total = 0
  for (const col of ['productos', 'clientes', 'proveedores', 'categorias']) {
    const snap = await db.collection(col).where('empresaId', '==', empresaId).where('_seedTag', '==', SEED_TAG).get()
    if (snap.empty) continue
    for (let i = 0; i < snap.docs.length; i += 400) {
      const lote = db.batch()
      snap.docs.slice(i, i + 400).forEach(doc => lote.delete(doc.ref))
      await lote.commit()
    }
    total += snap.size
    console.log(`   ✓ ${col.padEnd(12)} ${snap.size} borrados`)
  }
  if (total === 0) console.log('   (no había datos previos del seed)')
  return total
}

// ── CATEGORÍAS ───────────────────────────────────────────────────────────────
const CATEGORIAS = [
  { nombre: 'Anillos',            descripcion: 'Anillos de oro, plata y compromiso',     color: '#EAB308', icono: '💍' },
  { nombre: 'Cadenas y collares', descripcion: 'Cadenas, collares y gargantillas',       color: '#F59E0B', icono: '📿' },
  { nombre: 'Aretes',             descripcion: 'Aretes, argollas y topitos',             color: '#EC4899', icono: '✨' },
  { nombre: 'Pulseras',           descripcion: 'Pulseras, esclavas y brazaletes',        color: '#8B5CF6', icono: '⭕' },
  { nombre: 'Dijes y medallas',   descripcion: 'Dijes, medallas y cruces',               color: '#3B82F6', icono: '🔱' },
  { nombre: 'Relojes',            descripcion: 'Relojes de dama y caballero',            color: '#0EA5E9', icono: '⌚' },
  { nombre: 'Acero y fantasía',   descripcion: 'Joyería de acero inoxidable y fantasía', color: '#6B7280', icono: '🔗' },
  { nombre: 'Estuches y empaque', descripcion: 'Cajas, bolsas y tarjetas de regalo',     color: '#10B981', icono: '🎁' },
  { nombre: 'Servicios',          descripcion: 'Reparación, grabado y ajuste de talla',  color: '#EF4444', icono: '🛠️' },
]

// ── PRODUCTOS ────────────────────────────────────────────────────────────────
const AN = 'Anillos', CA = 'Cadenas y collares', AR = 'Aretes', PU = 'Pulseras', DI = 'Dijes y medallas',
      RE = 'Relojes', AC = 'Acero y fantasía', EM = 'Estuches y empaque', SE = 'Servicios'

const PRODUCTOS_BASE = [
  // Anillos
  { nombre: 'Anillo de compromiso oro 14k con circonia', categoria: AN, precio: 185.00, costo: 120.00, stock: 6,  min: 2, ubicacion: 'Vitrina 1 - Oro' },
  { nombre: 'Anillo de matrimonio oro 14k 4 mm (par)',   categoria: AN, precio: 320.00, costo: 215.00, stock: 4,  min: 1, unidad: 'Par', ubicacion: 'Vitrina 1 - Oro' },
  { nombre: 'Anillo oro 10k con piedra roja',            categoria: AN, precio: 95.00,  costo: 62.00,  stock: 5,  min: 2, ubicacion: 'Vitrina 1 - Oro' },
  { nombre: 'Anillo de graduación oro 10k',              categoria: AN, precio: 140.00, costo: 92.00,  stock: 3,  min: 1, ubicacion: 'Vitrina 1 - Oro' },
  { nombre: 'Anillo plata 925 solitario circonia',       categoria: AN, precio: 28.00,  costo: 15.00,  stock: 18, min: 5, ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Anillo plata 925 infinito',                 categoria: AN, precio: 22.00,  costo: 12.00,  stock: 15, min: 5, ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Anillo plata 925 corazón',                  categoria: AN, precio: 24.00,  costo: 13.00,  stock: 14, min: 5, ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Anillo plata 925 caballero ónix',           categoria: AN, precio: 45.00,  costo: 26.00,  stock: 8,  min: 2, ubicacion: 'Vitrina 2 - Plata' },

  // Cadenas y collares
  { nombre: 'Cadena oro 14k tejido cubano 50 cm',        categoria: CA, precio: 650.00, costo: 480.00, stock: 2,  min: 1, ubicacion: 'Caja fuerte' },
  { nombre: 'Cadena oro 10k tejido cartier 45 cm',       categoria: CA, precio: 260.00, costo: 180.00, stock: 3,  min: 1, ubicacion: 'Caja fuerte' },
  { nombre: 'Cadena oro 10k tejido veneciano 40 cm',     categoria: CA, precio: 175.00, costo: 118.00, stock: 4,  min: 1, ubicacion: 'Vitrina 1 - Oro' },
  { nombre: 'Cadena plata 925 tejido cartier 50 cm',     categoria: CA, precio: 38.00,  costo: 21.00,  stock: 12, min: 4, ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Cadena plata 925 tejido rolo 45 cm',        categoria: CA, precio: 32.00,  costo: 17.00,  stock: 14, min: 4, ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Collar plata 925 con perla cultivada',      categoria: CA, precio: 55.00,  costo: 30.00,  stock: 7,  min: 2, ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Gargantilla plata 925 con circonias',       categoria: CA, precio: 48.00,  costo: 26.00,  stock: 8,  min: 2, ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Collar de perlas de agua dulce 45 cm',      categoria: CA, precio: 85.00,  costo: 48.00,  stock: 5,  min: 2, ubicacion: 'Vitrina 3' },

  // Aretes
  { nombre: 'Aretes oro 14k argolla 20 mm',              categoria: AR, precio: 145.00, costo: 98.00,  stock: 5,  min: 2, unidad: 'Par', ubicacion: 'Vitrina 1 - Oro' },
  { nombre: 'Aretes oro 10k topito circonia',            categoria: AR, precio: 68.00,  costo: 44.00,  stock: 8,  min: 3, unidad: 'Par', ubicacion: 'Vitrina 1 - Oro' },
  { nombre: 'Aretes oro 10k de bebé (topito)',           categoria: AR, precio: 55.00,  costo: 36.00,  stock: 10, min: 3, unidad: 'Par', ubicacion: 'Vitrina 1 - Oro' },
  { nombre: 'Aretes plata 925 argolla 30 mm',            categoria: AR, precio: 18.00,  costo: 9.50,   stock: 20, min: 6, unidad: 'Par', ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Aretes plata 925 topito circonia 5 mm',     categoria: AR, precio: 14.00,  costo: 7.00,   stock: 25, min: 8, unidad: 'Par', ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Aretes plata 925 largos con perla',         categoria: AR, precio: 32.00,  costo: 17.00,  stock: 9,  min: 3, unidad: 'Par', ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Aretes plata 925 mariposa',                 categoria: AR, precio: 16.00,  costo: 8.00,   stock: 16, min: 5, unidad: 'Par', ubicacion: 'Vitrina 2 - Plata' },

  // Pulseras
  { nombre: 'Pulsera oro 14k tejido cubano 20 cm',       categoria: PU, precio: 390.00, costo: 285.00, stock: 2,  min: 1, ubicacion: 'Caja fuerte' },
  { nombre: 'Esclava oro 10k para bebé grabable',        categoria: PU, precio: 110.00, costo: 72.00,  stock: 6,  min: 2, ubicacion: 'Vitrina 1 - Oro' },
  { nombre: 'Pulsera plata 925 tejido cartier 20 cm',    categoria: PU, precio: 26.00,  costo: 14.00,  stock: 15, min: 5, ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Pulsera plata 925 con dijes (charms)',      categoria: PU, precio: 42.00,  costo: 23.00,  stock: 8,  min: 3, ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Esclava plata 925 caballero 22 cm',         categoria: PU, precio: 58.00,  costo: 33.00,  stock: 6,  min: 2, ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Pulsera de perlas de agua dulce',           categoria: PU, precio: 35.00,  costo: 18.00,  stock: 9,  min: 3, ubicacion: 'Vitrina 3' },
  { nombre: 'Pulsera tobillera plata 925',               categoria: PU, precio: 20.00,  costo: 10.50,  stock: 12, min: 4, ubicacion: 'Vitrina 2 - Plata' },

  // Dijes y medallas
  { nombre: 'Dije oro 10k cruz 2 cm',                    categoria: DI, precio: 85.00,  costo: 56.00,  stock: 6,  min: 2, ubicacion: 'Vitrina 1 - Oro' },
  { nombre: 'Medalla oro 10k Virgen de Guadalupe',       categoria: DI, precio: 95.00,  costo: 63.00,  stock: 5,  min: 2, ubicacion: 'Vitrina 1 - Oro' },
  { nombre: 'Dije oro 10k letra inicial',                categoria: DI, precio: 62.00,  costo: 40.00,  stock: 12, min: 4, ubicacion: 'Vitrina 1 - Oro' },
  { nombre: 'Dije plata 925 cruz',                       categoria: DI, precio: 15.00,  costo: 7.50,   stock: 20, min: 6, ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Dije plata 925 corazón grabable',           categoria: DI, precio: 18.00,  costo: 9.00,   stock: 18, min: 6, ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Medalla plata 925 San Benito',              categoria: DI, precio: 17.00,  costo: 8.50,   stock: 15, min: 5, ubicacion: 'Vitrina 2 - Plata' },
  { nombre: 'Dije plata 925 árbol de la vida',           categoria: DI, precio: 19.00,  costo: 9.80,   stock: 14, min: 5, ubicacion: 'Vitrina 2 - Plata' },

  // Relojes
  { nombre: 'Reloj caballero acero cuarzo',              categoria: RE, precio: 65.00,  costo: 38.00,  stock: 8,  min: 2, ubicacion: 'Vitrina 4 - Relojes' },
  { nombre: 'Reloj dama acero dorado cuarzo',            categoria: RE, precio: 58.00,  costo: 34.00,  stock: 9,  min: 2, ubicacion: 'Vitrina 4 - Relojes' },
  { nombre: 'Reloj caballero cuero cronógrafo',          categoria: RE, precio: 89.00,  costo: 54.00,  stock: 5,  min: 2, ubicacion: 'Vitrina 4 - Relojes' },
  { nombre: 'Reloj dama malla milanesa',                 categoria: RE, precio: 49.00,  costo: 28.00,  stock: 10, min: 3, ubicacion: 'Vitrina 4 - Relojes' },
  { nombre: 'Reloj digital deportivo',                   categoria: RE, precio: 25.00,  costo: 13.00,  stock: 15, min: 4, ubicacion: 'Vitrina 4 - Relojes' },
  { nombre: 'Batería de reloj SR626SW',                  categoria: RE, precio: 2.50,   costo: 0.60,   stock: 80, min: 20, ubicacion: 'Gaveta taller' },
  { nombre: 'Correa de reloj cuero 20 mm',               categoria: RE, precio: 9.00,   costo: 4.00,   stock: 24, min: 6, ubicacion: 'Gaveta taller' },

  // Acero y fantasía
  { nombre: 'Cadena acero inoxidable cubana 60 cm',      categoria: AC, precio: 18.00,  costo: 7.50,   stock: 22, min: 6, ubicacion: 'Vitrina 5 - Acero' },
  { nombre: 'Anillo acero inoxidable caballero',         categoria: AC, precio: 12.00,  costo: 4.50,   stock: 30, min: 8, ubicacion: 'Vitrina 5 - Acero' },
  { nombre: 'Pulsera acero inoxidable cuero trenzado',   categoria: AC, precio: 14.00,  costo: 5.50,   stock: 20, min: 6, ubicacion: 'Vitrina 5 - Acero' },
  { nombre: 'Aretes acero inoxidable argolla',           categoria: AC, precio: 8.00,   costo: 3.00,   stock: 35, min: 10, unidad: 'Par', ubicacion: 'Vitrina 5 - Acero' },
  { nombre: 'Set collar y aretes fantasía',              categoria: AC, precio: 15.00,  costo: 6.00,   stock: 18, min: 5, unidad: 'Set', ubicacion: 'Vitrina 5 - Acero' },
  { nombre: 'Pulsera de hilo rojo con dije',             categoria: AC, precio: 5.00,   costo: 1.50,   stock: 40, min: 10, ubicacion: 'Mostrador' },

  // Estuches y empaque
  { nombre: 'Estuche para anillo terciopelo',            categoria: EM, precio: 2.50,   costo: 0.90,   stock: 60, min: 15, ubicacion: 'Bodega' },
  { nombre: 'Estuche para cadena o pulsera',             categoria: EM, precio: 3.50,   costo: 1.30,   stock: 40, min: 10, ubicacion: 'Bodega' },
  { nombre: 'Bolsa de regalo pequeña',                   categoria: EM, precio: 1.25,   costo: 0.40,   stock: 100, min: 25, ubicacion: 'Bodega' },
  { nombre: 'Paño limpiador de joyas',                   categoria: EM, precio: 3.00,   costo: 1.10,   stock: 50, min: 12, ubicacion: 'Mostrador' },
  { nombre: 'Líquido limpiador de plata 120 ml',         categoria: EM, precio: 6.50,   costo: 3.00,   stock: 24, min: 6, ubicacion: 'Mostrador' },

  // Servicios (sin stock; se venden como servicio)
  { nombre: 'Ajuste de talla de anillo',                 categoria: SE, precio: 12.00,  costo: 3.00,   stock: 999, min: 0, unidad: 'Servicio', ubicacion: 'Taller' },
  { nombre: 'Grabado láser (hasta 20 caracteres)',       categoria: SE, precio: 8.00,   costo: 1.00,   stock: 999, min: 0, unidad: 'Servicio', ubicacion: 'Taller' },
  { nombre: 'Soldadura de cadena',                       categoria: SE, precio: 10.00,  costo: 2.00,   stock: 999, min: 0, unidad: 'Servicio', ubicacion: 'Taller' },
  { nombre: 'Cambio de batería de reloj',                categoria: SE, precio: 5.00,   costo: 0.60,   stock: 999, min: 0, unidad: 'Servicio', ubicacion: 'Taller' },
  { nombre: 'Baño de oro (pieza pequeña)',               categoria: SE, precio: 25.00,  costo: 9.00,   stock: 999, min: 0, unidad: 'Servicio', ubicacion: 'Taller' },
  { nombre: 'Limpieza y pulido de joya',                 categoria: SE, precio: 6.00,   costo: 1.00,   stock: 999, min: 0, unidad: 'Servicio', ubicacion: 'Taller' },
]

const PRODUCTOS = PRODUCTOS_BASE.map((p, i) => ({
  codigo: 'JOY-' + pad(i + 1),
  nombre: p.nombre,
  categoria: p.categoria,
  precio: p.precio,
  costo: p.costo,
  stock: p.stock,
  min: p.min,
  unidad: p.unidad || 'Unidad',
  unidadesAdicionales: [],
  codigoBarras: barcode(i + 1),
  ...(p.ubicacion ? { ubicacion: p.ubicacion } : {}),
  updatedAt: ts(),
}))

// ── CLIENTES ─────────────────────────────────────────────────────────────────
const dirSS = { codDep: '06', codMun: '14', distrito: 'San Salvador Centro', codDistrito: '01' }
const vacio = { nit: '', dui: '', nrc: '', codDep: '', codMun: '', distrito: '', codDistrito: '', complemento: '', codActividad: '', descActividad: '' }

const CLIENTES = [
  { nombre: 'VARIOS', tipo: 'Natural', ...vacio, email: '', telefono: '', direccion: '', esConsumidorFinal: true },
  { nombre: 'Claudia Marisol Pineda',   tipo: 'Natural', ...vacio, dui: '04123456-7', telefono: '7701-2233', email: 'cpineda@correo.com', direccion: '' },
  { nombre: 'Jorge Alberto Menéndez',   tipo: 'Natural', ...vacio, dui: '03654321-9', telefono: '7845-6677', email: '', direccion: '' },
  { nombre: 'Gabriela Alejandra Rivas', tipo: 'Natural', ...vacio, dui: '05234567-2', telefono: '7612-8899', email: 'grivas@correo.com', direccion: '' },
  { nombre: 'Ricardo Ernesto Molina',   tipo: 'Natural', ...vacio, dui: '02876543-4', telefono: '7988-1122', email: '', direccion: '' },
  { nombre: 'Daniela Sofía Campos',     tipo: 'Natural', ...vacio, dui: '06456789-0', telefono: '7244-3355', email: 'dcampos@correo.com', direccion: '' },
  // Natural contribuyente (puede pedir CCF)
  { nombre: 'Mauricio Antonio Orellana', tipo: 'Natural', ...dirSS, nit: '0614-120480-101-6', dui: '04567891-3', nrc: '187654-3', telefono: '2270-4455', email: 'morellana.eventos@correo.com', complemento: 'Col. San Benito, Calle La Reforma #210', codActividad: '82300', descActividad: 'Organización de convenciones y eventos' },
  // Jurídicos (CCF)
  { nombre: 'Eventos y Bodas Elegance, S.A. de C.V.',       tipo: 'Jurídico', ...dirSS, nit: '0614-150398-102-1', nrc: '156789-4', telefono: '2263-7788', email: 'compras@elegance.com.sv', complemento: 'Col. Escalón, Paseo General Escalón #3450', codActividad: '82300', descActividad: 'Organización de convenciones y eventos' },
  { nombre: 'Hotel Plaza Real, S.A. de C.V.',               tipo: 'Jurídico', ...dirSS, nit: '0614-080790-103-5', nrc: '123456-7', telefono: '2250-9000', email: 'gerencia@plazareal.com.sv', complemento: 'Blvd. del Hipódromo #540', codActividad: '55101', descActividad: 'Hoteles' },
  { nombre: 'Distribuidora de Regalos Detalles, S.A. de C.V.', tipo: 'Jurídico', ...dirSS, nit: '0614-220605-104-3', nrc: '234567-8', telefono: '2222-1133', email: 'pedidos@detalles.com.sv', complemento: 'Centro Comercial Metrocentro, Local 112', codActividad: '47789', descActividad: 'Venta al por menor de otros productos' },
  { nombre: 'Corporación Premios y Reconocimientos, S.A. de C.V.', tipo: 'Jurídico', ...dirSS, nit: '0614-030201-105-0', nrc: '245678-9', telefono: '2298-6600', email: 'admin@premiosrec.com', complemento: 'Col. Flor Blanca, 49 Av. Sur #815', codActividad: '46900', descActividad: 'Venta al por mayor de otros productos' },
].map(c => ({
  ...c,
  direccion: c.direccion !== undefined ? c.direccion : [c.distrito, c.complemento].filter(Boolean).join(', '),
  complemento: c.complemento || '',
  updatedAt: ts(),
}))

// ── PROVEEDORES ──────────────────────────────────────────────────────────────
const PROVEEDORES = [
  { nombre: 'Importadora de Oro y Plata AURUM, S.A. de C.V.',  contacto: 'Verónica Castillo', telefono: '2264-1100', email: 'ventas@aurum.com.sv',       nit: '0614-100595-120-2', nrc: '301122-6', direccion: 'San Salvador', condicionPago: 'contado', notas: 'Oro 10k y 14k, plata 925 por gramo.' },
  { nombre: 'Distribuidora de Relojes CRONOS, S.A. de C.V.',   contacto: 'Fernando Quintanilla', telefono: '2245-3300', email: 'pedidos@cronos.com.sv',  nit: '0614-050387-121-9', nrc: '312233-3', direccion: 'Santa Tecla', condicionPago: 'contado', notas: 'Relojes, baterías y correas.' },
  { nombre: 'Joyería de Acero STEELART, S.A. de C.V.',         contacto: 'Lorena Ayala',      telefono: '2210-5500', email: 'ventas@steelart.com',        nit: '0614-220675-122-5', nrc: '289344-8', direccion: 'Soyapango', condicionPago: 'contado', notas: 'Acero inoxidable y fantasía al por mayor.' },
  { nombre: 'Empaques y Estuches PRESENTA, S.A. de C.V.',      contacto: 'Óscar Monterrosa',  telefono: '2278-7700', email: 'info@presenta.com.sv',       nit: '0614-140891-123-1', nrc: '276455-2', direccion: 'Ilopango', condicionPago: 'contado', notas: 'Estuches, bolsas y paños.' },
  { nombre: 'Perlas y Gemas del Pacífico, S.A. de C.V.',       contacto: 'Ingrid Salazar',    telefono: '2290-2211', email: 'ventas@perlasgemas.com',     nit: '0614-081093-124-8', nrc: '298877-1', direccion: 'San Salvador', condicionPago: 'contado', notas: 'Perlas cultivadas y piedras.' },
]

// ── EJECUCIÓN ────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════════════')
  console.log('  ORIÓN · Seed de Joyería DEMO')
  console.log('══════════════════════════════════════════════════')

  const emp = await resolverEmpresa(argEmpresa)
  if (!emp) {
    console.error(`\n❌ No encontré ninguna empresa con id ni código "${argEmpresa}".\n`)
    process.exit(1)
  }
  empresaId = emp.id
  console.log(`  Empresa:  ${emp.nombre || '(sin nombre)'}`)
  console.log(`  empresaId: ${empresaId}`)
  console.log(`  marca (_seedTag): ${SEED_TAG}`)
  console.log('──────────────────────────────────────────────────')

  console.log('\n🧹 Limpiando datos previos del seed...')
  await purgarSeedPrevio()
  if (soloLimpiar) { console.log('\n✅ Solo-limpiar: listo. No se insertó nada.\n'); return }

  console.log('\n📦 Insertando datos DEMO...')
  await insertar('categorias', CATEGORIAS)
  await insertar('productos', PRODUCTOS)
  await insertar('clientes', CLIENTES)
  await insertar('proveedores', PROVEEDORES)

  console.log('\n✅ Listo. Abrí la app con un usuario de esta empresa y revisá Inventario, Clientes y Compras.\n')
}

main().catch(e => { console.error('\n❌ Error:', e.message); process.exit(1) })
