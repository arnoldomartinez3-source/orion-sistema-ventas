import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
initializeApp({ credential: applicationDefault() })
const db = getFirestore()
const snap = await db.collection('empresas').get()
const filas = []
for (const d of snap.docs) {
  const e = d.data()
  const prods = await db.collection('productos').where('empresaId', '==', d.id).count().get()
  const c = e.createdAt?.toDate?.() || e.creadaEn?.toDate?.() || null
  filas.push({ id: d.id, nombre: e.nombreComercial || e.nombre || '', codigo: e.codigoAcceso || '', rubro: e.rubro || e.giro || '', creada: c ? c.toISOString().slice(0, 10) : '?', productos: prods.data().count })
}
filas.sort((a, b) => (b.creada > a.creada ? 1 : -1))
for (const f of filas) console.log(`${f.creada}  ${String(f.productos).padStart(4)} prod  ${f.codigo.padEnd(9)} ${f.nombre}  [${f.id}] ${f.rubro}`)
