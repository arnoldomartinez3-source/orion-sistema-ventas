import { useEffect } from 'react'

// ══════════════════════════════════════════════════════════════════
// Trampa de foco para ventanas emergentes (modales)
// Sin esto, al presionar Tab dentro de un modal el foco se escapa a lo que
// está DETRÁS (en el POS: el buscador de productos y el carrito), porque el
// navegador sigue el orden del documento. Aquí el Tab da vueltas dentro del
// modal y, al abrirse, el foco entra al primer elemento.
// ══════════════════════════════════════════════════════════════════

const ENFOCABLES = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

const visibles = (caja) => [...caja.querySelectorAll(ENFOCABLES)]
  .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement)

/**
 * @param {boolean} activo  si el modal está abierto
 * @param {object} ref      ref al contenedor del modal
 * @param {boolean} enfocarAlAbrir  poner el foco adentro al abrir (default: true)
 */
export function useTrampaFoco(activo, ref, enfocarAlAbrir = true) {
  useEffect(() => {
    if (!activo) return
    const t = enfocarAlAbrir ? setTimeout(() => {
      const caja = ref.current
      if (!caja || caja.contains(document.activeElement)) return
      const primero = visibles(caja)[0]
      if (primero) primero.focus()
    }, 60) : null

    const alTeclear = (e) => {
      if (e.key !== 'Tab') return
      const caja = ref.current
      if (!caja) return
      const lista = visibles(caja)
      if (!lista.length) { e.preventDefault(); return }
      const primero = lista[0], ultimo = lista[lista.length - 1]
      const actual = document.activeElement
      if (!caja.contains(actual)) { e.preventDefault(); (e.shiftKey ? ultimo : primero).focus(); return }
      if (e.shiftKey && actual === primero) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && actual === ultimo) { e.preventDefault(); primero.focus() }
    }
    document.addEventListener('keydown', alTeclear, true)
    return () => { if (t) clearTimeout(t); document.removeEventListener('keydown', alTeclear, true) }
  }, [activo, ref, enfocarAlAbrir])
}
