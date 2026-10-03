// ══════════════════════════════════════════════════════════════════
// Alta de un producto a partir de su código de barras (Levantar inventario
// y la ventana "Producto nuevo" de la caja).
// ══════════════════════════════════════════════════════════════════

/** ¿Parece un código de barras de fabricante? (EAN-8, UPC-A, EAN-13, ITF-14) */
export const esEAN = (c) => /^\d{8,14}$/.test(String(c || ''))

// Código INTERNO corto (P001, P002…) distinto del código de barras del fabricante,
// que va en `codigoBarras`. Sigue la numeración P### que ya usa la empresa.
export const generarCodigoInterno = (lista, usados = []) => {
  let max = 0
  ;[...lista.map(p => p.codigo), ...usados].forEach(c => {
    const m = /^P(\d{3,})$/i.exec(String(c || '').trim())
    if (m) max = Math.max(max, parseInt(m[1], 10))
  })
  return 'P' + String(max + 1).padStart(3, '0')
}

// Base pública de productos por código de barras (gratuita, con marcas centroamericanas).
export async function buscarEnBasePublica(ean) {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=product_name,product_name_es,generic_name,generic_name_es,brands,quantity,image_front_small_url`)
    if (!r.ok) return null
    const d = await r.json()
    if (d.status !== 1 || !d.product) return null
    const p = d.product
    const marca = (p.brands || '').split(',')[0].trim()
    // Nombre: el específico; si no hay, el genérico; si tampoco, la marca. El tamaño
    // (quantity) se agrega al final. Si solo se conoce el tamaño, se marca como parcial
    // para que el usuario revise el nombre (antes salía solo "250 ML").
    const base = (p.product_name_es || p.product_name || p.generic_name_es || p.generic_name || '').trim()
    const partes = [base || marca, p.quantity].filter(Boolean)
    const nombre = partes.join(' ').trim()
    if (!nombre) return null
    return { nombre, marca, imagen: p.image_front_small_url || '', parcial: !base }
  } catch {
    return null
  }
}
