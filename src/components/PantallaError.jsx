import { Component } from 'react'

// Red de seguridad: si una pantalla revienta al dibujarse (un ReferenceError, un dato
// inesperado), React desmonta TODO y el usuario ve la página en blanco. Este boundary
// atrapa el error y muestra un aviso con botón para recargar o volver al inicio, y lo
// deja en consola para diagnosticarlo. Envuelve las rutas en App.jsx; el resto del
// cascarón (menú, sesión) sigue vivo.
export default class PantallaError extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ORIÓN] Error al dibujar la pantalla:', error, info?.componentStack)
  }

  componentDidUpdate(prevProps) {
    // Al cambiar de ruta se vuelve a intentar (el error era de la pantalla anterior)
    if (this.state.error && prevProps.ruta !== this.props.ruta) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    const mensaje = String(this.state.error?.message || this.state.error || '')
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="card" style={{ maxWidth: 520, width: '100%', padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Esta pantalla tuvo un problema</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.5, margin: '0 0 16px' }}>
            Tus datos están a salvo: nada se perdió. Recarga la página para seguir; si vuelve a pasar,
            avísale a soporte con el detalle de abajo.
          </p>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--danger)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', marginBottom: 18, wordBreak: 'break-word', textAlign: 'left' }}>
            {mensaje.slice(0, 300)}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Recargar</button>
            <button className="btn btn-secondary" onClick={() => { window.location.href = '/' }}>Ir al inicio</button>
          </div>
        </div>
      </div>
    )
  }
}
