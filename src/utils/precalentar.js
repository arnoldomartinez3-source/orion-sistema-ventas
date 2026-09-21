// ══════════════════════════════════════════════════════════════════
// Precalentar una función de la nube.
//
// Las funciones (guardar el PIN, transmitir al Ministerio de Hacienda) se
// APAGAN cuando nadie las usa por un rato. La primera llamada después de ese
// descanso tiene que encender el contenedor, y eso tarda varios segundos: es lo
// que se siente como "el sistema se quedó pensando" justo en el peor momento,
// al cobrar o al guardar.
//
// Un OPTIONS (el saludo que el navegador manda antes de un POST) la enciende sin
// hacer nada más: no escribe, no cobra, no transmite. Se manda ANTES, cuando la
// persona todavía está llenando el formulario o el carrito, para que al dar el
// clic la función ya esté despierta.
//
// Si falla, no pasa nada: solo no se precalentó.
// ══════════════════════════════════════════════════════════════════

// No repetir el aviso muchas veces seguidas: una vez cada 10 minutos por ruta
// alcanza (la nube mantiene la función despierta bastante más que eso).
const ultimo = {}
const CADA = 10 * 60 * 1000

export function precalentar(ruta) {
  const ahora = Date.now()
  if (ultimo[ruta] && ahora - ultimo[ruta] < CADA) return
  ultimo[ruta] = ahora
  try {
    fetch(ruta, { method: 'OPTIONS' }).catch(() => { /* sin red o función caída: se ignora */ })
  } catch { /* navegador sin fetch: se ignora */ }
}
