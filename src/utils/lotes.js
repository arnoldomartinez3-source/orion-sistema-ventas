// ══════════════════════════════════════════════════════════════════
// Lotes de vencimiento por producto (solo para avisar, no para elegir en caja).
// Cada compra con fecha "Vence" agrega un lote {vence, qty, compra} al producto;
// cada venta descuenta primero del lote que vence antes (FIFO), sin preguntar
// nada al cajero. El stock total del producto sigue siendo el de siempre: los
// lotes solo dicen cuántas unidades vencen en cada fecha. `fechaVencimiento`
// del producto se mantiene igual a la del lote más próximo, así Dashboard,
// Inventario y el Excel siguen funcionando como antes.
// Productos sin lotes (cargados a mano o por Excel) usan su fechaVencimiento
// como un solo lote con todo el stock.
// ══════════════════════════════════════════════════════════════════

const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000

/** Lotes vigentes del producto (qty > 0), del que vence antes al que vence después. */
export function lotesDe(p) {
  const lotes = Array.isArray(p?.lotes) ? p.lotes : []
  return lotes
    .map(l => ({ vence: String(l.vence || ''), qty: r3(l.qty), compra: l.compra || '' }))
    .filter(l => l.vence && l.qty > 0)
    .sort((a, b) => a.vence.localeCompare(b.vence))
}

/** Agrega lo que entró en una compra. Si ya hay un lote con la misma fecha, se le suma. */
export function agregarLote(lotes, { vence, qty, compra }) {
  const q = r3(qty)
  if (!vence || q <= 0) return lotesDe({ lotes })
  const lista = lotesDe({ lotes })
  const igual = lista.find(l => l.vence === vence)
  if (igual) igual.qty = r3(igual.qty + q)
  else lista.push({ vence, qty: q, compra: compra || '' })
  return lista.sort((a, b) => a.vence.localeCompare(b.vence))
}

/** Descuenta una venta: primero del lote que vence antes. Lo que no alcance a cubrir se ignora. */
export function consumirLotes(lotes, qty) {
  let resta = r3(qty)
  const salida = []
  for (const l of lotesDe({ lotes })) {
    if (resta <= 0) { salida.push(l); continue }
    const toma = Math.min(l.qty, resta)
    resta = r3(resta - toma)
    if (l.qty - toma > 0) salida.push({ ...l, qty: r3(l.qty - toma) })
  }
  return salida
}

/** Una devolución repone al lote más próximo a vencer (lo más prudente para el aviso). */
export function reponerLotes(lotes, qty) {
  const lista = lotesDe({ lotes })
  if (!lista.length || !(qty > 0)) return lista
  lista[0] = { ...lista[0], qty: r3(lista[0].qty + qty) }
  return lista
}

/**
 * Campos a guardar en el producto después de mover lotes: los lotes y la
 * fechaVencimiento del más próximo. Si no quedan lotes, se limpia la fecha.
 */
export function camposDeLotes(lotes) {
  const lista = lotesDe({ lotes })
  return { lotes: lista, fechaVencimiento: lista[0]?.vence || '' }
}

/** Días que faltan para una fecha 'YYYY-MM-DD' (negativo = ya venció; hoy = 0). */
export function diasPara(fecha) {
  if (!fecha) return null
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0)
  return Math.round((new Date(fecha + 'T12:00:00') - hoy) / 86400000)
}

/**
 * Lotes del producto que vencen dentro de `dias` (o ya vencieron). Un producto sin
 * lotes pero con fechaVencimiento cuenta como un solo lote con todo su stock.
 */
export function lotesPorVencer(p, dias) {
  if (!(dias > 0) || !((p?.stock || 0) > 0)) return []
  let lotes = lotesDe(p)
  if (!lotes.length && p.fechaVencimiento) lotes = [{ vence: p.fechaVencimiento, qty: r3(p.stock), compra: '' }]
  return lotes.filter(l => diasPara(l.vence) <= dias)
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const fechaCorta = (f) => { const [, m, d] = String(f || '').split('-'); return m ? `${parseInt(d, 10)} ${MESES[parseInt(m, 10) - 1]}` : '' }
const fmtQty = (n) => (Number.isInteger(n) ? n : r3(n))

/** Texto para el aviso: "5 vencen el 12 oct, 20 el 30 oct" (o "vencido el 2 oct"). */
export function textoVencimiento(p, dias) {
  return lotesPorVencer(p, dias).map((l, i) => {
    const d = diasPara(l.vence)
    const cuando = d < 0 ? `vencido${i === 0 ? 's' : ''} el ${fechaCorta(l.vence)}` : d === 0 ? 'vencen hoy' : `${i === 0 ? 'vencen el ' : ''}${fechaCorta(l.vence)}`
    return `${fmtQty(l.qty)} ${p.unidad ? '' : ''}${cuando}`.replace(/\s+/g, ' ')
  }).join(', ')
}
