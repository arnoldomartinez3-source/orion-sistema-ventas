#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// seed-ferreteria.mjs · ORIÓN — Generador de datos DEMO de una FERRETERÍA
//
// Crea un catálogo realista (categorías, productos, clientes, proveedores)
// para UNA empresa, listo para hacer pruebas (POS, facturación, compras).
//
// ── Uso (PowerShell, desde la raíz del repo) ────────────────────────────────
//   1) Instalá firebase-admin una sola vez (aislado, no toca package.json):
//        npm install --no-save firebase-admin
//   2) Descargá una LLAVE DE SERVICIO del proyecto:
//        Firebase Console → ⚙ Configuración del proyecto → Cuentas de servicio
//        → "Generar nueva clave privada" → guardá el .json FUERA del repo.
//   3) Apuntá la variable a esa llave (ajustá la ruta):
//        $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\geova\Downloads\clave-orion.json"
//   4) Corré el seed con el empresaId O el código de empresa (ej. GEO-4821):
//        node scripts/seed-ferreteria.mjs GEO-4821
//        node scripts/seed-ferreteria.mjs <empresaId>
//
//   Opcional — solo borrar lo que sembró este script (sin insertar):
//        node scripts/seed-ferreteria.mjs GEO-4821 --solo-limpiar
//
// ── Notas ───────────────────────────────────────────────────────────────────
// • Todo lo creado se marca con  _seedTag:'ferreteria-demo'. Al re-ejecutar,
//   primero BORRA lo anterior con esa marca (idempotente) — así podés resetear
//   el DEMO cuantas veces quieras SIN tocar los datos que cargaste a mano.
// • El empresaId es OBLIGATORIO: sin él correcto, nada aparece en la app.
//   Lo sacás del Panel One Geo (tarjeta de la empresa) o de usuarios/{uid}.empresaId.
// • NIT/NRC/DUI y códigos son FICTICIOS, para pruebas en ambiente 00 (test).
// • La llave de servicio da acceso TOTAL: nunca la subas a git ni la compartas.
// ══════════════════════════════════════════════════════════════════════════

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const SEED_TAG = 'ferreteria-demo'
const argEmpresa = process.argv[2]                       // empresaId crudo O código de acceso (GEO-4821)
const soloLimpiar = process.argv.includes('--solo-limpiar')

if (!argEmpresa || argEmpresa.startsWith('--')) {
  console.error('\n❌ Falta el empresaId o el código de empresa.')
  console.error('   Uso: node scripts/seed-ferreteria.mjs <empresaId|CODIGO> [--solo-limpiar]')
  console.error('   Ej:  node scripts/seed-ferreteria.mjs GEO-4821\n')
  process.exit(1)
}

initializeApp({ credential: applicationDefault() })
const db = getFirestore()
const ts = () => FieldValue.serverTimestamp()
let empresaId = null      // se resuelve en main() a partir de argEmpresa

// Acepta el empresaId directo O el código de acceso (empresas.codigoAcceso)
async function resolverEmpresa(arg) {
  const byId = await db.collection('empresas').doc(arg).get()
  if (byId.exists) return { id: byId.id, nombre: byId.data().nombreComercial || byId.data().nombre || '' }
  const q = await db.collection('empresas').where('codigoAcceso', '==', String(arg).toUpperCase().trim()).limit(1).get()
  if (!q.empty) return { id: q.docs[0].id, nombre: q.docs[0].data().nombreComercial || q.docs[0].data().nombre || '' }
  return null
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const pad = (n, w = 3) => String(n).padStart(w, '0')
const barcode = (i) => '7400' + pad(1000 + i, 4) // código de barras ficticio y único

// Inserta en lotes de 400 (límite Firestore = 500 por batch)
async function insertar(coleccion, docs) {
  let creados = 0
  for (let i = 0; i < docs.length; i += 400) {
    const lote = db.batch()
    for (const d of docs.slice(i, i + 400)) {
      const ref = db.collection(coleccion).doc()
      lote.set(ref, { ...d, empresaId, _seedTag: SEED_TAG, createdAt: ts() })
      creados++
    }
    await lote.commit()
  }
  console.log(`   ✓ ${coleccion.padEnd(12)} ${creados} documentos`)
  return creados
}

// Borra lo que sembró este script antes (por _seedTag + empresaId)
async function purgarSeedPrevio() {
  const colecciones = ['productos', 'clientes', 'proveedores', 'categorias']
  let total = 0
  for (const col of colecciones) {
    const snap = await db.collection(col)
      .where('empresaId', '==', empresaId)
      .where('_seedTag', '==', SEED_TAG)
      .get()
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
  { nombre: 'Tornillería y fijaciones', descripcion: 'Tornillos, clavos, tuercas, anclas', color: '#6B7280', icono: '🔩' },
  { nombre: 'Cemento y construcción',   descripcion: 'Cemento, varilla, block, agregados', color: '#9CA3AF', icono: '🧱' },
  { nombre: 'Pinturas y solventes',     descripcion: 'Pintura, thinner, brochas, lija',    color: '#EF4444', icono: '🎨' },
  { nombre: 'Herramientas manuales',    descripcion: 'Martillos, llaves, alicates',        color: '#F59E0B', icono: '🔨' },
  { nombre: 'Herramientas eléctricas',  descripcion: 'Taladros, pulidoras, sierras',       color: '#3B82F6', icono: '⚡' },
  { nombre: 'Tubería y PVC',            descripcion: 'Tubos, codos, pegamento PVC',        color: '#8B5CF6', icono: '🚰' },
  { nombre: 'Eléctrico e iluminación',  descripcion: 'Cable, focos, tomas, interruptores', color: '#EAB308', icono: '💡' },
  { nombre: 'Plomería',                 descripcion: 'Llaves, grifería, empaques',         color: '#06B6D4', icono: '🔧' },
  { nombre: 'Ferretería general',       descripcion: 'Adhesivos, candados, cinta, varios', color: '#10B981', icono: '📦' },
]

// ── PRODUCTOS ────────────────────────────────────────────────────────────────
// Campos: nombre, categoria (string que coincide con el nombre de la categoría),
//         precio, stock, min, unidad, [proveedor, ubicacion, unidadesAdicionales]
const T = 'Tornillería y fijaciones', C = 'Cemento y construcción', PI = 'Pinturas y solventes',
      HM = 'Herramientas manuales', HE = 'Herramientas eléctricas', PV = 'Tubería y PVC',
      EL = 'Eléctrico e iluminación', PL = 'Plomería', G = 'Ferretería general'

const PRODUCTOS_BASE = [
  // Tornillería y fijaciones
  { nombre: 'Tornillo galvanizado 1/4" x 2"', categoria: T, precio: 0.15, stock: 850, min: 100, ubicacion: 'Pasillo 1 - A', unidadesAdicionales: [{ nombre: 'Caja (100 u)', factor: 100, precio: 12.50 }] },
  { nombre: 'Tornillo autorroscante 8 x 1"',  categoria: T, precio: 0.10, stock: 1200, min: 150, ubicacion: 'Pasillo 1 - A', unidadesAdicionales: [{ nombre: 'Caja (100 u)', factor: 100, precio: 8.00 }] },
  { nombre: 'Clavo de acero 2" (libra)',       categoria: T, precio: 1.10, stock: 180, min: 20, unidad: 'Libra', ubicacion: 'Pasillo 1 - B' },
  { nombre: 'Clavo de acero 3" (libra)',       categoria: T, precio: 1.05, stock: 160, min: 20, unidad: 'Libra', ubicacion: 'Pasillo 1 - B' },
  { nombre: 'Tuerca hexagonal 1/4"',           categoria: T, precio: 0.08, stock: 900, min: 100, ubicacion: 'Pasillo 1 - A' },
  { nombre: 'Ancla plástica #8 (bolsa 50)',    categoria: T, precio: 2.25, stock: 120, min: 15, unidad: 'Bolsa', ubicacion: 'Pasillo 1 - C' },
  { nombre: 'Perno de anclaje 3/8" x 3"',      categoria: T, precio: 0.75, stock: 240, min: 30, ubicacion: 'Pasillo 1 - C' },
  { nombre: 'Arandela plana 1/4" (100 u)',     categoria: T, precio: 3.50, stock: 90, min: 10, unidad: 'Bolsa', ubicacion: 'Pasillo 1 - A' },

  // Cemento y construcción
  { nombre: 'Cemento gris Portland 42.5 kg', categoria: C, precio: 9.75, stock: 320, min: 40, unidad: 'Bolsa', ubicacion: 'Bodega - Patio', unidadesAdicionales: [{ nombre: 'Tarima (40 bolsas)', factor: 40, precio: 375.00 }] },
  { nombre: 'Varilla corrugada 3/8" x 6 m',  categoria: C, precio: 6.50, stock: 150, min: 20, unidad: 'Unidad', ubicacion: 'Bodega - Patio' },
  { nombre: 'Varilla corrugada 1/2" x 6 m',  categoria: C, precio: 11.25, stock: 110, min: 15, unidad: 'Unidad', ubicacion: 'Bodega - Patio' },
  { nombre: 'Block de concreto 15 x 20 x 40', categoria: C, precio: 0.85, stock: 2400, min: 200, unidad: 'Unidad', ubicacion: 'Bodega - Patio' },
  { nombre: 'Arena blanca (saco 50 lb)',     categoria: C, precio: 3.20, stock: 180, min: 25, unidad: 'Saco', ubicacion: 'Bodega - Patio' },
  { nombre: 'Grava #1 (saco 50 lb)',         categoria: C, precio: 3.50, stock: 160, min: 25, unidad: 'Saco', ubicacion: 'Bodega - Patio' },
  { nombre: 'Cal hidratada 25 kg',           categoria: C, precio: 5.40, stock: 95, min: 12, unidad: 'Bolsa', ubicacion: 'Bodega - Patio' },

  // Pinturas y solventes
  { nombre: 'Pintura látex blanca (galón)',    categoria: PI, precio: 16.90, stock: 140, min: 15, unidad: 'Galón', ubicacion: 'Pasillo 2 - A' },
  { nombre: 'Pintura látex color (galón)',     categoria: PI, precio: 18.50, stock: 130, min: 15, unidad: 'Galón', ubicacion: 'Pasillo 2 - A' },
  { nombre: 'Pintura anticorrosiva (1/4 gal)', categoria: PI, precio: 6.75, stock: 110, min: 12, unidad: 'Unidad', ubicacion: 'Pasillo 2 - B' },
  { nombre: 'Thinner estándar (galón)',        categoria: PI, precio: 9.25, stock: 85, min: 10, unidad: 'Galón', ubicacion: 'Pasillo 2 - C' },
  { nombre: 'Brocha de 3"',                    categoria: PI, precio: 2.40, stock: 200, min: 25, ubicacion: 'Pasillo 2 - B' },
  { nombre: 'Rodillo de 9" con felpa',         categoria: PI, precio: 4.10, stock: 150, min: 20, ubicacion: 'Pasillo 2 - B' },
  { nombre: 'Lija de agua #120 (pliego)',      categoria: PI, precio: 0.55, stock: 400, min: 50, ubicacion: 'Pasillo 2 - C' },
  { nombre: 'Espátula metálica 4"',            categoria: PI, precio: 3.30, stock: 90, min: 10, ubicacion: 'Pasillo 2 - B' },

  // Herramientas manuales
  { nombre: 'Martillo de uña 16 oz',        categoria: HM, precio: 8.90, stock: 70, min: 8, ubicacion: 'Pasillo 3 - A' },
  { nombre: 'Desarmador Phillips #2',       categoria: HM, precio: 3.50, stock: 120, min: 15, ubicacion: 'Pasillo 3 - A' },
  { nombre: 'Desarmador plano 1/4"',        categoria: HM, precio: 3.30, stock: 120, min: 15, ubicacion: 'Pasillo 3 - A' },
  { nombre: 'Juego de llaves Allen (9 pz)', categoria: HM, precio: 5.75, stock: 60, min: 8, ubicacion: 'Pasillo 3 - B' },
  { nombre: 'Llave ajustable 10"',          categoria: HM, precio: 9.40, stock: 55, min: 6, ubicacion: 'Pasillo 3 - B' },
  { nombre: 'Alicate universal 8"',         categoria: HM, precio: 7.20, stock: 65, min: 8, ubicacion: 'Pasillo 3 - B' },
  { nombre: 'Cinta métrica 5 m',            categoria: HM, precio: 4.80, stock: 130, min: 15, ubicacion: 'Pasillo 3 - C' },
  { nombre: 'Nivel de burbuja 24"',         categoria: HM, precio: 11.50, stock: 40, min: 5, ubicacion: 'Pasillo 3 - C' },
  { nombre: 'Serrucho 20"',                 categoria: HM, precio: 8.60, stock: 45, min: 6, ubicacion: 'Pasillo 3 - C' },

  // Herramientas eléctricas
  { nombre: 'Taladro percutor 1/2" 650 W',  categoria: HE, precio: 54.90, stock: 25, min: 3, ubicacion: 'Vitrina - 1' },
  { nombre: 'Pulidora angular 4-1/2" 750 W', categoria: HE, precio: 42.50, stock: 22, min: 3, ubicacion: 'Vitrina - 1' },
  { nombre: 'Sierra circular 7-1/4" 1400 W', categoria: HE, precio: 68.00, stock: 15, min: 2, ubicacion: 'Vitrina - 1' },
  { nombre: 'Set de brocas para metal (13 pz)', categoria: HE, precio: 12.75, stock: 50, min: 6, ubicacion: 'Vitrina - 2' },
  { nombre: 'Disco de corte metal 4-1/2"',  categoria: HE, precio: 1.20, stock: 300, min: 40, ubicacion: 'Vitrina - 2' },
  { nombre: 'Extensión eléctrica 10 m',     categoria: HE, precio: 14.30, stock: 40, min: 5, ubicacion: 'Vitrina - 2' },

  // Tubería y PVC
  { nombre: 'Tubo PVC 1/2" x 6 m (potable)', categoria: PV, precio: 3.90, stock: 200, min: 25, unidad: 'Unidad', ubicacion: 'Pasillo 4 - A' },
  { nombre: 'Tubo PVC 4" x 6 m (drenaje)',   categoria: PV, precio: 12.40, stock: 90, min: 12, unidad: 'Unidad', ubicacion: 'Pasillo 4 - A' },
  { nombre: 'Codo PVC 1/2" x 90°',           categoria: PV, precio: 0.35, stock: 500, min: 60, ubicacion: 'Pasillo 4 - B' },
  { nombre: 'Tee PVC 1/2"',                  categoria: PV, precio: 0.45, stock: 420, min: 50, ubicacion: 'Pasillo 4 - B' },
  { nombre: 'Pegamento PVC (1/4 gal)',       categoria: PV, precio: 7.80, stock: 70, min: 8, unidad: 'Unidad', ubicacion: 'Pasillo 4 - C' },
  { nombre: 'Adaptador macho PVC 1/2"',      categoria: PV, precio: 0.30, stock: 480, min: 60, ubicacion: 'Pasillo 4 - B' },

  // Eléctrico e iluminación
  { nombre: 'Cable THHN #12 (metro)', categoria: EL, precio: 0.55, stock: 1500, min: 200, unidad: 'Metro', ubicacion: 'Pasillo 5 - A', unidadesAdicionales: [{ nombre: 'Rollo (100 m)', factor: 100, precio: 48.00 }] },
  { nombre: 'Cable THHN #14 (metro)', categoria: EL, precio: 0.42, stock: 1800, min: 200, unidad: 'Metro', ubicacion: 'Pasillo 5 - A', unidadesAdicionales: [{ nombre: 'Rollo (100 m)', factor: 100, precio: 37.00 }] },
  { nombre: 'Foco LED 9 W luz blanca', categoria: EL, precio: 2.10, stock: 260, min: 30, ubicacion: 'Pasillo 5 - B' },
  { nombre: 'Interruptor sencillo',    categoria: EL, precio: 1.75, stock: 180, min: 20, ubicacion: 'Pasillo 5 - B' },
  { nombre: 'Tomacorriente doble',     categoria: EL, precio: 2.30, stock: 170, min: 20, ubicacion: 'Pasillo 5 - B' },
  { nombre: 'Tape aislante (rollo)',   categoria: EL, precio: 0.90, stock: 350, min: 40, ubicacion: 'Pasillo 5 - C' },
  { nombre: 'Caja rectangular EMT',    categoria: EL, precio: 0.65, stock: 300, min: 40, ubicacion: 'Pasillo 5 - C' },

  // Plomería
  { nombre: 'Llave de chorro 1/2"',          categoria: PL, precio: 4.50, stock: 90, min: 12, ubicacion: 'Pasillo 6 - A' },
  { nombre: 'Grifería para lavamanos',       categoria: PL, precio: 22.90, stock: 30, min: 4, ubicacion: 'Pasillo 6 - A' },
  { nombre: 'Empaque de cera para inodoro',  categoria: PL, precio: 2.60, stock: 110, min: 15, ubicacion: 'Pasillo 6 - B' },
  { nombre: 'Cinta teflón (rollo)',          categoria: PL, precio: 0.50, stock: 400, min: 50, ubicacion: 'Pasillo 6 - B' },
  { nombre: 'Manguera flexible lavamanos',   categoria: PL, precio: 3.75, stock: 120, min: 15, ubicacion: 'Pasillo 6 - B' },
  { nombre: 'Válvula de pase 1/2"',          categoria: PL, precio: 5.20, stock: 80, min: 10, ubicacion: 'Pasillo 6 - A' },

  // Ferretería general
  { nombre: 'Silicón transparente (tubo)',   categoria: G, precio: 3.10, stock: 150, min: 20, ubicacion: 'Pasillo 7 - A' },
  { nombre: 'Pegamento de contacto (1/4)',   categoria: G, precio: 4.40, stock: 90, min: 12, unidad: 'Unidad', ubicacion: 'Pasillo 7 - A' },
  { nombre: 'Candado de bronce 40 mm',       categoria: G, precio: 5.90, stock: 100, min: 12, ubicacion: 'Pasillo 7 - B' },
  { nombre: 'Cinta adhesiva transparente',   categoria: G, precio: 0.95, stock: 260, min: 30, ubicacion: 'Pasillo 7 - B' },
  { nombre: 'Guantes de trabajo (par)',      categoria: G, precio: 2.80, stock: 140, min: 18, unidad: 'Par', ubicacion: 'Pasillo 7 - C' },
  { nombre: 'Escoba plástica',               categoria: G, precio: 3.60, stock: 80, min: 10, ubicacion: 'Pasillo 7 - C' },
  { nombre: 'Bolsa para basura (paq. 10)',   categoria: G, precio: 1.90, stock: 200, min: 25, unidad: 'Paquete', ubicacion: 'Pasillo 7 - C' },
]

const PRODUCTOS = PRODUCTOS_BASE.map((p, i) => ({
  codigo: 'FER-' + pad(i + 1),
  nombre: p.nombre,
  categoria: p.categoria,
  precio: p.precio,
  stock: p.stock,
  min: p.min,
  unidad: p.unidad || 'Unidad',
  unidadesAdicionales: p.unidadesAdicionales || [],
  codigoBarras: barcode(i + 1),
  ...(p.ubicacion ? { ubicacion: p.ubicacion } : {}),
  updatedAt: ts(),
}))

// ── CLIENTES ─────────────────────────────────────────────────────────────────
// Consumidor Final (Natural, sin NRC) y Crédito Fiscal (Jurídico con NRC + actividad).
// Direcciones: San Salvador Centro (codDep 06 / codMun 14 / codDistrito 01).
const dirSS = { codDep: '06', codMun: '14', distrito: 'San Salvador Centro', codDistrito: '01' }
const vacio = { nit: '', dui: '', nrc: '', codDep: '', codMun: '', distrito: '', codDistrito: '', complemento: '', codActividad: '', descActividad: '' }

const CLIENTES = [
  // Consumidor final genérico (lo que el POS usa por defecto)
  { nombre: 'VARIOS', tipo: 'Natural', ...vacio, email: '', telefono: '', direccion: '', esConsumidorFinal: true },

  // Consumidores finales (personas naturales, con DUI)
  { nombre: 'Juan Carlos Martínez',   tipo: 'Natural', ...vacio, dui: '04512345-6', telefono: '7712-3456', email: 'jcmartinez@correo.com', direccion: '' },
  { nombre: 'María Elena Rodríguez',  tipo: 'Natural', ...vacio, dui: '03987654-1', telefono: '7855-9012', email: 'mrodriguez@correo.com', direccion: '' },
  { nombre: 'José Alfredo Guzmán',    tipo: 'Natural', ...vacio, dui: '05123498-7', telefono: '7601-2233', email: '', direccion: '' },
  { nombre: 'Ana Patricia Hernández', tipo: 'Natural', ...vacio, dui: '02456789-3', telefono: '7999-4455', email: 'aphernandez@correo.com', direccion: '' },
  { nombre: 'Carlos Mauricio Flores', tipo: 'Natural', ...vacio, dui: '06345612-8', telefono: '7233-6677', email: '', direccion: '' },

  // Persona natural CONTRIBUYENTE (con NRC → puede pedir CCF)
  { nombre: 'Roberto Antonio Cáceres', tipo: 'Natural', ...dirSS, nit: '0614-150385-102-4', dui: '04789123-5', nrc: '198456-2', telefono: '2260-7788', email: 'rcaceres.taller@correo.com', complemento: 'Col. Miramonte, Calle Los Abetos #24', codActividad: '43210', descActividad: 'Instalaciones eléctricas' },

  // Créditos fiscales (personas jurídicas, con NIT + NRC + actividad económica)
  { nombre: 'Constructora Salvadoreña, S.A. de C.V.',        tipo: 'Jurídico', ...dirSS, nit: '0614-230695-101-2', nrc: '145236-8', telefono: '2245-1000', email: 'compras@construsal.com.sv', complemento: 'Blvd. Los Héroes, Edif. Torre 2, Local 5', codActividad: '41001', descActividad: 'Construcción de edificios residenciales' },
  { nombre: 'Ferretería El Progreso, S.A. de C.V.',         tipo: 'Jurídico', ...dirSS, nit: '0614-110780-103-9', nrc: '112398-5', telefono: '2298-4455', email: 'gerencia@elprogreso.com.sv', complemento: 'Av. Independencia #145, Centro', codActividad: '47521', descActividad: 'Venta al por menor de artículos de ferretería' },
  { nombre: 'Inversiones López Hnos., S.A. de C.V.',        tipo: 'Jurídico', ...dirSS, nit: '0614-050612-104-7', nrc: '223145-1', telefono: '2211-3322', email: 'admin@inverlopez.com', complemento: 'Calle Rubén Darío #310', codActividad: '68100', descActividad: 'Compra, venta y alquiler de inmuebles' },
  { nombre: 'Servicios Eléctricos ELECTROSAL, S.A. de C.V.', tipo: 'Jurídico', ...dirSS, nit: '0614-190901-105-3', nrc: '267890-4', telefono: '2225-9988', email: 'ventas@electrosal.com.sv', complemento: 'Col. Escalón, 87 Av. Norte #4-2', codActividad: '43210', descActividad: 'Instalaciones eléctricas' },
  { nombre: 'Distribuidora de Materiales DIMACO, S.A. de C.V.', tipo: 'Jurídico', ...dirSS, nit: '0614-280488-106-1', nrc: '134567-9', telefono: '2270-1234', email: 'pedidos@dimaco.com.sv', complemento: 'Carretera a Santa Ana Km 12', codActividad: '46630', descActividad: 'Venta al por mayor de materiales de construcción' },
  { nombre: 'Constructora y Urbanizadora del Valle, S.A. de C.V.', tipo: 'Jurídico', ...dirSS, nit: '0614-071199-107-8', nrc: '245789-3', telefono: '2288-5566', email: 'proyectos@urbanivalle.com', complemento: 'Santa Elena, Antiguo Cuscatlán', codActividad: '42101', descActividad: 'Construcción de carreteras y calles' },
  { nombre: 'Taller Industrial MetalCorp, S.A. de C.V.',    tipo: 'Jurídico', ...dirSS, nit: '0614-120277-108-6', nrc: '256134-7', telefono: '2251-7070', email: 'contacto@metalcorp.com.sv', complemento: 'Zona Industrial Plan de La Laguna', codActividad: '25110', descActividad: 'Fabricación de productos metálicos estructurales' },
].map(c => ({
  ...c,
  // 'direccion' derivada (distrito + complemento), como hace la app
  direccion: c.direccion !== undefined ? c.direccion : [c.distrito, c.complemento].filter(Boolean).join(', '),
  complemento: c.complemento || '',
  updatedAt: ts(),
}))

// ── PROVEEDORES ──────────────────────────────────────────────────────────────
const PROVEEDORES = [
  { nombre: 'Distribuidora Ferretera del Pacífico, S.A. de C.V.', contacto: 'Luis Alvarado',  telefono: '2225-4400', email: 'ventas@ferrepacifico.com.sv', nit: '0614-100592-110-2', nrc: '301245-6', direccion: 'San Salvador', condicionPago: 'contado', notas: 'Entrega los martes y jueves.' },
  { nombre: 'Importaciones Metálicas SALMETAL, S.A. de C.V.',     contacto: 'Karla Menjívar',  telefono: '2260-7788', email: 'pedidos@salmetal.com.sv',   nit: '0614-050387-111-9', nrc: '312456-3', direccion: 'Soyapango', condicionPago: 'contado', notas: 'Tornillería y varilla.' },
  { nombre: 'Cementos y Agregados CEMAGRO, S.A. de C.V.',         contacto: 'Mario Portillo',  telefono: '2310-1200', email: 'distribucion@cemagro.com',  nit: '0614-220675-112-5', nrc: '289134-8', direccion: 'Nejapa', condicionPago: 'contado', notas: 'Cemento y agregados a granel.' },
  { nombre: 'Pinturas y Recubrimientos COLORSA, S.A. de C.V.',    contacto: 'Sofía Ramírez',   telefono: '2243-9900', email: 'ventas@colorsa.com.sv',     nit: '0614-140891-113-1', nrc: '276890-2', direccion: 'Santa Tecla', condicionPago: 'contado', notas: 'Línea de pintura y solventes.' },
  { nombre: 'ElectroSuministros del Norte, S.A. de C.V.',         contacto: 'Diego Cortez',    telefono: '2265-3311', email: 'compras@electronorte.com',  nit: '0614-081093-114-8', nrc: '298456-1', direccion: 'Mejicanos', condicionPago: 'contado', notas: 'Cable y material eléctrico.' },
  { nombre: 'Tuberías y Conexiones TUBOPLAST, S.A. de C.V.',      contacto: 'Gabriela Sosa',   telefono: '2278-6644', email: 'ventas@tuboplast.com.sv',   nit: '0614-190784-115-4', nrc: '267123-5', direccion: 'Apopa', condicionPago: 'contado', notas: 'PVC y accesorios.' },
  { nombre: 'Herramientas Profesionales HERRAPRO, S.A. de C.V.',  contacto: 'Ernesto Barrera', telefono: '2251-8822', email: 'info@herrapro.com.sv',      nit: '0614-030699-116-0', nrc: '245678-9', direccion: 'San Salvador', condicionPago: 'contado', notas: 'Herramienta manual y eléctrica.' },
  { nombre: 'Suministros Generales La Bodega, S.A. de C.V.',      contacto: 'Patricia Vega',   telefono: '2290-4477', email: 'labodega@suministros.com',  nit: '0614-260582-117-7', nrc: '234561-4', direccion: 'Ilopango', condicionPago: 'contado', notas: 'Artículos varios de ferretería.' },
]

// ── EJECUCIÓN ────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════════════')
  console.log('  ORIÓN · Seed de Ferretería DEMO')
  console.log('══════════════════════════════════════════════════')

  const emp = await resolverEmpresa(argEmpresa)
  if (!emp) {
    console.error(`\n❌ No encontré ninguna empresa con id ni código "${argEmpresa}".`)
    console.error('   Revisá el código en Panel One Geo (tarjeta de la empresa) o el')
    console.error('   ID del documento en Firestore → colección "empresas".\n')
    process.exit(1)
  }
  empresaId = emp.id

  console.log(`  Empresa:  ${emp.nombre || '(sin nombre)'}`)
  console.log(`  empresaId: ${empresaId}`)
  console.log(`  marca (_seedTag): ${SEED_TAG}`)
  console.log('──────────────────────────────────────────────────')

  console.log('\n🧹 Limpiando datos previos del seed...')
  await purgarSeedPrevio()

  if (soloLimpiar) {
    console.log('\n✅ Solo-limpiar: listo. No se insertó nada.\n')
    return
  }

  console.log('\n📦 Insertando datos DEMO...')
  await insertar('categorias', CATEGORIAS)
  await insertar('productos', PRODUCTOS)
  await insertar('clientes', CLIENTES)
  await insertar('proveedores', PROVEEDORES)

  console.log('\n══════════════════════════════════════════════════')
  console.log('  ✅ LISTO. Resumen:')
  console.log(`     ${CATEGORIAS.length} categorías`)
  console.log(`     ${PRODUCTOS.length} productos`)
  console.log(`     ${CLIENTES.length} clientes  (1 VARIOS + ${CLIENTES.length - 1} con datos)`)
  console.log(`     ${PROVEEDORES.length} proveedores`)
  console.log('══════════════════════════════════════════════════')
  console.log('  Abrí la app en esa empresa y revisá Inventario,')
  console.log('  Clientes, Compras (proveedores) y el POS.')
  console.log('══════════════════════════════════════════════════\n')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error al sembrar:', err?.message || err)
    console.error(err)
    process.exit(1)
  })
