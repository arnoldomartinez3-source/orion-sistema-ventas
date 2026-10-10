// ══════════════════════════════════════════════════════════════════
// Catálogo maestro de One Geo: código de barras → nombre ya confirmado por
// alguna tienda (sin precios ni existencias). Se consulta antes que la base
// pública al escanear un código desconocido, y se alimenta cuando se guarda
// un producto nuevo desde la caja. La escritura la hace la función
// `catalogoAportar` (Admin SDK); desde el navegador solo se lee.
// ══════════════════════════════════════════════════════════════════
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { postAutenticado } from './apiAuth'

/** { nombre, categoria, unidad, imagen, revisado } o null si nadie lo ha cargado. */
export async function consultarCatalogo(codigoBarras) {
  try {
    const cod = String(codigoBarras || '').trim()
    if (!/^\d{8,14}$/.test(cod)) return null
    const s = await getDoc(doc(db, 'catalogo_maestro', cod))
    return s.exists() ? s.data() : null
  } catch { return null }
}

/** Aporta el nombre confirmado al catálogo. No bloquea ni avisa si falla. */
export function aportarAlCatalogo({ codigoBarras, nombre, categoria, unidad, imagen }) {
  postAutenticado('/api/catalogo-aportar', { codigoBarras, nombre, categoria, unidad, imagen }).catch(() => {})
}
