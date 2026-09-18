// ══════════════════════════════════════════════════════════════
// HORARIO DE ACCESO de los empleados.
//
// COPIA IDÉNTICA en functions/horario.js (el login de empleados lo revisa en el
// servidor). Las reglas de Firestore repiten la misma cuenta para no dejar guardar
// ventas fuera de horario. Si cambiás algo aquí, cambialo en los tres lugares.
//
// Datos:
//   configuracion/{empresa}.horario = { activo, dias:[1..7], desde, hasta }  (horario del negocio)
//   usuarios/{uid}.horarioModo = 'negocio' (por defecto) | 'propio' | 'libre'
//   usuarios/{uid}.horario = { dias, desde, hasta }                           (si es 'propio')
//   usuarios/{uid}.permisoHorarioHasta = fecha                                 (autorización temporal)
// dias: 1 = lunes … 7 = domingo. desde/hasta: minutos desde las 00:00 (07:00 = 420).
// Si 'hasta' es menor que 'desde', el turno pasa la medianoche (22:00–06:00).
// El administrador nunca queda bloqueado.
// ══════════════════════════════════════════════════════════════

export const DIAS_CORTOS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const OFFSET_SV_MS = 6 * 60 * 60 * 1000 // El Salvador = UTC-6 (sin horario de verano)

export const aMinutos = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(n => parseInt(n, 10) || 0)
  return h * 60 + m
}
export const aHHMM = (min) => `${String(Math.floor((min || 0) / 60)).padStart(2, '0')}:${String((min || 0) % 60).padStart(2, '0')}`

// Día (1-7) y minuto del día en hora de El Salvador.
export function momentoSV(fecha = new Date()) {
  const sv = new Date(fecha.getTime() - OFFSET_SV_MS)
  const d = sv.getUTCDay()
  return { dia: d === 0 ? 7 : d, minuto: sv.getUTCHours() * 60 + sv.getUTCMinutes() }
}

const aMillis = (v) => {
  if (!v) return 0
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  if (typeof v._seconds === 'number') return v._seconds * 1000
  return 0
}

// El horario que le toca a este usuario, o null si no tiene restricción.
export function horarioEfectivo(usuario, config) {
  if (!usuario || usuario.rol === 'administrador') return null
  const modo = usuario.horarioModo || 'negocio'
  if (modo === 'libre') return null
  if (modo === 'propio') return usuario.horario?.dias ? usuario.horario : null
  const h = config?.horario
  return h && h.activo === true && Array.isArray(h.dias) ? h : null
}

export function enRango(h, fecha = new Date()) {
  const { dia, minuto } = momentoSV(fecha)
  if (!h.dias.includes(dia)) return false
  return h.desde <= h.hasta
    ? minuto >= h.desde && minuto < h.hasta
    : minuto >= h.desde || minuto < h.hasta
}

/**
 * ¿Puede operar ahora?
 * @returns {{ permitido: boolean, motivo: 'libre'|'dentro'|'autorizado'|'fuera', horario: object|null, autorizadoHasta: number }}
 */
export function estadoHorario(usuario, config, fecha = new Date()) {
  const horario = horarioEfectivo(usuario, config)
  const autorizadoHasta = aMillis(usuario?.permisoHorarioHasta)
  if (!horario) return { permitido: true, motivo: 'libre', horario: null, autorizadoHasta }
  if (enRango(horario, fecha)) return { permitido: true, motivo: 'dentro', horario, autorizadoHasta }
  if (autorizadoHasta > fecha.getTime()) return { permitido: true, motivo: 'autorizado', horario, autorizadoHasta }
  return { permitido: false, motivo: 'fuera', horario, autorizadoHasta }
}

// "Lun–Sáb 07:00–18:00" (o días sueltos: "Lun, Mié, Vie 08:00–12:00").
export function describirHorario(h) {
  if (!h || !Array.isArray(h.dias) || h.dias.length === 0) return 'Sin días asignados'
  const dias = [...h.dias].sort((a, b) => a - b)
  const seguidos = dias.every((d, i) => i === 0 || d === dias[i - 1] + 1)
  const txtDias = dias.length === 7 ? 'Todos los días'
    : seguidos && dias.length > 2 ? `${DIAS_CORTOS[dias[0]]}–${DIAS_CORTOS[dias[dias.length - 1]]}`
    : dias.map(d => DIAS_CORTOS[d]).join(', ')
  return `${txtDias} ${aHHMM(h.desde)}–${aHHMM(h.hasta)}`
}
