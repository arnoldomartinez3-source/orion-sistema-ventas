import { useEffect, useState, useCallback, useRef } from 'react'
import { _registrarOrionDialog } from '../orionDialog'

// Host único de los diálogos ORIÓN. Montar una sola vez en App.jsx.
// Escucha las llamadas a orionAlert/orionConfirm y las muestra como modal
// con el look de ORIÓN (navy/dorado, clases .modal-overlay / .modal / .btn).

const ICONOS = {
  success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️', pregunta: '❓',
}
const COLORES = {
  success: 'var(--success, #22c55e)',
  error: 'var(--danger, #ef4444)',
  warning: 'var(--gold, #d8a93c)',
  info: 'var(--navy-light, #2E5FA3)',
  pregunta: 'var(--gold, #d8a93c)',
}
const TITULOS = {
  success: 'Listo', error: 'Ocurrió un problema', warning: 'Atención',
  info: 'Aviso', pregunta: 'Confirmar',
}

export default function OrionDialog() {
  const [cola, setCola] = useState([])
  const [valor, setValor] = useState('')
  const inputRef = useRef(null)
  const actual = cola[0] || null

  useEffect(() => _registrarOrionDialog((cfg) => setCola(c => [...c, cfg])), [])

  const cerrar = useCallback((valorRes) => {
    setCola(c => {
      const [head, ...rest] = c
      if (head) head.resolve(valorRes)
      return rest
    })
  }, [])

  const esPrompt = actual?.modo === 'prompt'
  const esConfirm = actual?.modo === 'confirm'

  // Al mostrar un prompt: precargar el valor inicial y enfocar el input.
  useEffect(() => {
    if (esPrompt) {
      setValor(actual.valorInicial || '')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [actual, esPrompt])

  useEffect(() => {
    if (!actual) return
    const onKey = (e) => {
      if (e.key === 'Escape') cerrar(esPrompt ? null : (esConfirm ? false : true))
      else if (e.key === 'Enter') cerrar(esPrompt ? (valor.trim() || null) : true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actual, cerrar, esPrompt, esConfirm, valor])

  if (!actual) return null

  const color = COLORES[actual.tipo] || COLORES.info
  const icono = ICONOS[actual.tipo] || ICONOS.info
  const titulo = actual.titulo || TITULOS[actual.tipo] || 'Aviso'

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 500 }}
      onClick={() => cerrar(esPrompt ? null : (esConfirm ? false : true))}
    >
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
            background: 'var(--surface2)', border: `1.5px solid ${color}`,
          }}>{icono}</div>
          <div className="modal-title" style={{ margin: 0, color }}>{titulo}</div>
        </div>

        <div style={{
          fontSize: 14, lineHeight: 1.6, color: 'var(--text)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>{actual.mensaje}</div>

        {esPrompt && (
          <input
            ref={inputRef}
            className="input"
            type={actual.inputTipo || 'text'}
            placeholder={actual.placeholder || ''}
            value={valor}
            onChange={e => setValor(e.target.value)}
            style={{ width: '100%', marginTop: 14 }}
          />
        )}

        <div className="modal-actions">
          {(esConfirm || esPrompt) && (
            <button className="btn btn-ghost" onClick={() => cerrar(esPrompt ? null : false)}>
              {actual.cancelLabel}
            </button>
          )}
          <button
            className="btn btn-primary"
            style={actual.tipo === 'error'
              ? { background: 'var(--danger, #ef4444)', borderColor: 'var(--danger, #ef4444)', color: '#fff' }
              : undefined}
            onClick={() => cerrar(esPrompt ? (valor.trim() || null) : true)}
          >
            {actual.okLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
