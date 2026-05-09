// src/components/BuscadorActividad.jsx
// Componente reutilizable de autocompletado de actividad económica MH
import { useState, useRef, useEffect } from 'react'
import ACTIVIDADES_ECONOMICAS from '../data/actividadesEconomicas'

/**
 * Props:
 *   codActividad   — string — código actual
 *   descActividad  — string — descripción actual
 *   onChange       — fn({ codigo, descripcion }) — callback al seleccionar o escribir
 *   placeholder    — string — placeholder del input
 *   disabled       — bool
 */
export default function BuscadorActividad({ codActividad = '', descActividad = '', onChange, placeholder = 'Código o descripción...', disabled = false }) {
  const [query, setQuery]         = useState(descActividad || codActividad || '')
  const [sugerencias, setSug]     = useState([])
  const [open, setOpen]           = useState(false)
  const [focusIdx, setFocusIdx]   = useState(-1)
  const inputRef                  = useRef(null)
  const listRef                   = useRef(null)

  // Sincronizar si el padre cambia los valores externamente
  useEffect(() => {
    setQuery(descActividad ? `${codActividad} — ${descActividad}` : codActividad || '')
  }, [codActividad, descActividad])

  const filtrar = (val) => {
    if (!val || val.length < 2) return []
    const q = val.toLowerCase()
    return ACTIVIDADES_ECONOMICAS.filter(a =>
      a.codigo.includes(q) || a.descripcion.toLowerCase().includes(q)
    ).slice(0, 8)
  }

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    setFocusIdx(-1)
    const found = filtrar(val)
    setSug(found)
    setOpen(found.length > 0)
    // Notificar al padre con valor libre (no restrictivo)
    onChange?.({ codigo: val, descripcion: '' })
  }

  const seleccionar = (act) => {
    const display = `${act.codigo} — ${act.descripcion}`
    setQuery(display)
    setOpen(false)
    setSug([])
    setFocusIdx(-1)
    onChange?.({ codigo: act.codigo, descripcion: act.descripcion })
  }

  const handleKeyDown = (e) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, sugerencias.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, -1)) }
    if (e.key === 'Enter' && focusIdx >= 0) { e.preventDefault(); seleccionar(sugerencias[focusIdx]) }
    if (e.key === 'Escape') { setOpen(false); setFocusIdx(-1) }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        className="input"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (sugerencias.length > 0) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder={placeholder}
        disabled={disabled}
        style={{ fontSize: 13 }}
        autoComplete="off"
      />
      {open && sugerencias.length > 0 && (
        <div ref={listRef} style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1500,
          background: 'var(--surface)', border: '1.5px solid var(--accent)',
          borderRadius: 10, boxShadow: '0 8px 30px var(--shadow)',
          maxHeight: 280, overflowY: 'auto', marginTop: 4,
        }}>
          {sugerencias.map((a, i) => (
            <div key={a.codigo}
              onMouseDown={() => seleccionar(a)}
              onMouseEnter={() => setFocusIdx(i)}
              style={{
                padding: '10px 14px', cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                background: focusIdx === i ? 'rgba(0,212,170,0.1)' : 'transparent',
                borderLeft: focusIdx === i ? '3px solid var(--accent)' : '3px solid transparent',
                transition: 'all 0.1s',
              }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent2)', fontWeight: 700 }}>{a.codigo}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{a.descripcion}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
