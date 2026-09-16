// ══════════════════════════════════════════════════════════════════
// Plazos OFICIALES para el Evento de Invalidación (MH El Salvador)
// Fuente: Manual de Usuario del Sistema de Facturación V2.0, págs. 44-46.
// COPIA IDÉNTICA en src/utils/plazosInvalidacion.js y functions/plazos-invalidacion.js — mantener ambas iguales.
//
// • FE, FEX, FSE: 3 meses desde el sello de recepción (hasta las 23:59:59).
// • CCF, NR, NC, ND, Retención, Liquidación, Evento de Retorno: hasta el
//   DÉCIMO DÍA HÁBIL del mes siguiente al del sello (23:59:59).
//   Ej. del manual: sello 01/01/2026 → hasta el 13/02/2026.
// Días hábiles = lunes a viernes. Los feriados no se descuentan (el plazo
// real puede ser unos días MÁS largo, nunca más corto): queda del lado seguro.
// ══════════════════════════════════════════════════════════════════

export const TIPOS_PLAZO_LARGO = ['FE', 'FEX', 'FSE', 'FSEE']
export const TIPOS_PLAZO_CORTO = ['CCF', 'NR', 'NC', 'ND', 'Retencion', 'Retención', 'CLE', 'Liquidacion', 'Retorno']

// Fecha del sello en hora de El Salvador → { y, m, d } (m = 1..12)
// Acepta el fhProcesamiento del MH ("dd/MM/yyyy HH:mm:ss"), un Date, o "YYYY-MM-DD".
export function fechaDelSello({ fhProcesamiento, fechaEmision, fecha } = {}) {
  const fh = String(fhProcesamiento || '')
  const mh = fh.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (mh) return { y: +mh[3], m: +mh[2], d: +mh[1] }
  // ISO con hora (p. ej. el sello simulado de DEMO, en UTC): convertir a hora de El Salvador
  if (/^\d{4}-\d{2}-\d{2}T/.test(fh) && !isNaN(new Date(fh))) {
    fecha = new Date(fh)
  } else {
    const iso = fh.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return { y: +iso[1], m: +iso[2], d: +iso[3] }
  }
  if (fecha instanceof Date && !isNaN(fecha)) {
    const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(fecha).split('-').map(Number)
    return { y, m, d }
  }
  const f = String(fechaEmision || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (f) return { y: +f[1], m: +f[2], d: +f[3] }
  return null
}

// Último día permitido como 'YYYY-MM-DD' (se puede invalidar hasta ese día inclusive), o null si el tipo no tiene plazo definido.
export function fechaLimiteInvalidacion(tipoDte, sello) {
  if (!sello) return null
  const pad = (n) => String(n).padStart(2, '0')
  if (TIPOS_PLAZO_LARGO.includes(tipoDte)) {
    // Mismo día, 3 meses después (si ese mes no tiene el día, el último día del mes)
    const mesDestino = new Date(Date.UTC(sello.y, sello.m - 1 + 3, 1))
    const ultimoDia = new Date(Date.UTC(mesDestino.getUTCFullYear(), mesDestino.getUTCMonth() + 1, 0)).getUTCDate()
    return `${mesDestino.getUTCFullYear()}-${pad(mesDestino.getUTCMonth() + 1)}-${pad(Math.min(sello.d, ultimoDia))}`
  }
  if (TIPOS_PLAZO_CORTO.includes(tipoDte)) {
    // Décimo día hábil (lun-vie) del mes siguiente
    const d = new Date(Date.UTC(sello.y, sello.m, 1, 12))
    let habiles = 0
    for (;;) {
      const dow = d.getUTCDay()
      if (dow !== 0 && dow !== 6) { habiles += 1; if (habiles === 10) break }
      d.setUTCDate(d.getUTCDate() + 1)
    }
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  return null
}

// Hoy en hora de El Salvador, 'YYYY-MM-DD'
export const hoyElSalvador = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

// Días que faltan (0 = hoy es el último día; negativo = vencido)
export function diasRestantes(limite, hoy = hoyElSalvador()) {
  const a = Date.UTC(...hoy.split('-').map((n, i) => (i === 1 ? n - 1 : +n)))
  const b = Date.UTC(...limite.split('-').map((n, i) => (i === 1 ? n - 1 : +n)))
  return Math.round((b - a) / 86400000)
}
