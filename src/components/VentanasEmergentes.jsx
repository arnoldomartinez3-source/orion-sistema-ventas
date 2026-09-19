import { useEffect } from 'react'

// ══════════════════════════════════════════════════════════════════
// Comportamiento común de TODAS las ventanas emergentes de la app:
//  1) Foco: con Tab, el foco da vueltas dentro de la ventana que está al frente y
//     no se escapa a la pantalla de atrás. Los modales que ya usan useTrampaFoco
//     (POS, diálogos) lo resuelven primero; aquí solo se actúa si nadie lo hizo.
//  2) Scroll: mientras haya una ventana abierta, la página de atrás no se mueve;
//     la ruedita del mouse solo desplaza la ventana.
// Una ventana se reconoce por sus clases (.modal-overlay, .ticket-overlay,
// .dte-overlay) o por aria-modal="true".
// ══════════════════════════════════════════════════════════════════

const VENTANAS = '.modal-overlay, .ticket-overlay, .dte-overlay, [aria-modal="true"]'
const ENFOCABLES = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

const estilos = `
  .modal, .ticket-modal, .dte-modal, .dte-modal-body { overscroll-behavior: contain; }
`

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

export default function VentanasEmergentes() {
  // ── 1) Foco ──
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

  // ── 2) Scroll del fondo ──
  // No se bloquea la página entera (eso la hacía saltar hasta arriba al abrir la
  // ventana): se ignora la ruedita/el dedo cuando está sobre el fondo oscuro, y la
  // ventana no le pasa el scroll a la página al llegar a su final (overscroll-behavior).
  useEffect(() => {
    const alDesplazar = (e) => {
      const capa = ventanaAlFrente()
      if (!capa) return
      const caja = capa.querySelector('.modal, .ticket-modal, .dte-modal') || capa
      if (!caja.contains(e.target)) e.preventDefault()
    }
    window.addEventListener('wheel', alDesplazar, { passive: false })
    window.addEventListener('touchmove', alDesplazar, { passive: false })
    return () => {
      window.removeEventListener('wheel', alDesplazar)
      window.removeEventListener('touchmove', alDesplazar)
    }
  }, [])

  return <style>{estilos}</style>
}
