import { useEffect } from 'react'

// ══════════════════════════════════════════════════════════════════
// Trampa de foco para TODAS las ventanas emergentes de la app.
// Con Tab, el foco da vueltas dentro de la ventana que está al frente y no se
// escapa a la pantalla de atrás (tablas, buscadores, carrito).
// Los modales que ya usan useTrampaFoco (POS, diálogos) lo resuelven primero:
// aquí solo se actúa si nadie lo hizo (e.defaultPrevented).
// ══════════════════════════════════════════════════════════════════

const VENTANAS = '.modal-overlay, .ticket-overlay, .dte-overlay, [aria-modal="true"]'
const ENFOCABLES = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

const esVisible = (el) => el.offsetWidth > 0 || el.offsetHeight > 0

// La ventana de más arriba: la de mayor z-index; si empatan, la última del documento.
function ventanaAlFrente() {
  let mejor = null, mejorZ = -Infinity
  for (const el of document.querySelectorAll(VENTANAS)) {
    if (!esVisible(el)) continue
    const z = parseInt(getComputedStyle(el).zIndex, 10) || 0
    if (z >= mejorZ) { mejor = el; mejorZ = z }
  }
  return mejor
}

export default function TrampaFocoGlobal() {
  useEffect(() => {
    const alTeclear = (e) => {
      if (e.key !== 'Tab' || e.defaultPrevented) return
      const caja = ventanaAlFrente()
      if (!caja) return
      const lista = [...caja.querySelectorAll(ENFOCABLES)].filter(esVisible)
      if (!lista.length) { e.preventDefault(); return }
      const primero = lista[0], ultimo = lista[lista.length - 1]
      const actual = document.activeElement
      if (!caja.contains(actual)) { e.preventDefault(); (e.shiftKey ? ultimo : primero).focus(); return }
      if (e.shiftKey && actual === primero) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && actual === ultimo) { e.preventDefault(); primero.focus() }
    }
    // En window y en burbuja: corre DESPUÉS de las trampas propias de cada modal.
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [])
  return null
}
