/* global __VERSION_ORION__ */
import { useEffect, useRef, useState } from 'react'

// ══════════════════════════════════════════════════
// Aviso de VERSIÓN NUEVA. Cada publicación deja un /version.json con su fecha;
// la app lo consulta cada pocos minutos (archivo estático de Hosting, no gasta
// Firestore) y si no coincide con la versión que está corriendo, muestra una
// ventana para actualizar. Así el cliente no tiene que adivinar cuándo dar F5.
//
// automatico (kiosco de marcación): nadie lo atiende, así que se recarga solo
// cuando la pantalla lleva un rato sin que la toquen.
// ══════════════════════════════════════════════════

const CADA_MS = 5 * 60 * 1000          // revisar cada 5 minutos
const POSPONER_MS = 10 * 60 * 1000     // "Más tarde" = 10 minutos
const QUIETO_MS = 60 * 1000            // kiosco: 1 minuto sin tocar la pantalla

const VERSION_ACTUAL = typeof __VERSION_ORION__ !== 'undefined' ? __VERSION_ORION__ : ''

// Estilos propios: esta ventana también sale en el login y en el kiosco, donde no
// están cargados los estilos generales de la app. Usa los colores del tema si existen.
const estilos = `
  .aviso-act-fondo { position: fixed; inset: 0; z-index: 10000; background: rgba(8,14,30,0.62); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center; padding: 16px; font-family: var(--font, 'Segoe UI', system-ui, sans-serif); }
  .aviso-act-caja { width: 100%; max-width: 420px; background: var(--surface, #ffffff); color: var(--text, #14213D);
    border: 1px solid var(--border, #E1E4EE); border-radius: 16px; padding: 28px 24px; text-align: center;
    box-shadow: 0 25px 80px rgba(0,0,0,0.35); }
  .aviso-act-icono { font-size: 44px; line-height: 1; margin-bottom: 10px; }
  .aviso-act-titulo { font-size: 19px; font-weight: 800; margin-bottom: 8px; }
  .aviso-act-texto { font-size: 14px; line-height: 1.55; margin: 0 0 6px; color: var(--text2, #4A5372); }
  .aviso-act-nota { font-size: 12px; line-height: 1.5; margin: 0 0 20px; color: var(--muted, #7A8199); }
  .aviso-act-botones { display: flex; gap: 10px; }
  .aviso-act-btn { font: inherit; font-size: 14px; font-weight: 700; padding: 11px 14px; border-radius: 10px; cursor: pointer; border: 1.5px solid transparent; }
  .aviso-act-btn.secundario { flex: 1; background: transparent; color: var(--text2, #4A5372); border-color: var(--border, #E1E4EE); }
  .aviso-act-btn.principal { flex: 2; background: var(--accent, #22345F); color: #fff; }
  .aviso-act-btn:focus-visible { outline: 2px solid var(--accent3, #C19A2E); outline-offset: 2px; }
`

export default function AvisoActualizacion({ automatico = false }) {
  const [hayNueva, setHayNueva] = useState(false)
  const [pospuesto, setPospuesto] = useState(false)
  const ultimoToque = useRef(0)

  useEffect(() => {
    // En desarrollo no hay version.json (y no hace falta avisar).
    if (!import.meta.env.PROD || !VERSION_ACTUAL) return
    let vivo = true
    const revisar = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const { version } = await r.json()
        if (vivo && version && version !== VERSION_ACTUAL) setHayNueva(true)
      } catch { /* sin internet: se reintenta en la próxima vuelta */ }
    }
    const alVolver = () => { if (document.visibilityState === 'visible') revisar() }
    const primera = setTimeout(revisar, 30 * 1000)
    const intervalo = setInterval(revisar, CADA_MS)
    document.addEventListener('visibilitychange', alVolver)
    return () => { vivo = false; clearTimeout(primera); clearInterval(intervalo); document.removeEventListener('visibilitychange', alVolver) }
  }, [])

  // Kiosco: recargar solo cuando nadie está marcando.
  useEffect(() => {
    if (!automatico || !hayNueva) return
    const toque = () => { ultimoToque.current = Date.now() }
    toque()   // contar el minuto de calma desde que se detectó la versión nueva
    window.addEventListener('pointerdown', toque)
    window.addEventListener('keydown', toque)
    const t = setInterval(() => {
      if (Date.now() - ultimoToque.current > QUIETO_MS) window.location.reload()
    }, 5000)
    return () => { window.removeEventListener('pointerdown', toque); window.removeEventListener('keydown', toque); clearInterval(t) }
  }, [automatico, hayNueva])

  // Al terminar el "Más tarde", volver a mostrar la ventana.
  useEffect(() => {
    if (!pospuesto) return
    const t = setTimeout(() => setPospuesto(false), POSPONER_MS)
    return () => clearTimeout(t)
  }, [pospuesto])

  if (!hayNueva || automatico || pospuesto) return null

  return (
    <div className="aviso-act-fondo" role="dialog" aria-modal="true" aria-labelledby="aviso-act-titulo">
      <style>{estilos}</style>
      <div className="aviso-act-caja">
        <div className="aviso-act-icono">🚀</div>
        <div id="aviso-act-titulo" className="aviso-act-titulo">Hay una versión nueva de ORIÓN</div>
        <p className="aviso-act-texto">Agregamos mejoras y correcciones. Tocá <strong>Actualizar</strong> para empezar a usarlas.</p>
        <p className="aviso-act-nota">Si estás a mitad de una venta o de un documento, terminalo primero y después actualizá.</p>
        <div className="aviso-act-botones">
          <button className="aviso-act-btn secundario" onClick={() => setPospuesto(true)}>Más tarde</button>
          <button className="aviso-act-btn principal" autoFocus onClick={() => window.location.reload()}>🔄 Actualizar ahora</button>
        </div>
      </div>
    </div>
  )
}
