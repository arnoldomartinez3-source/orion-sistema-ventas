import { useState } from 'react'
import { useAuth } from '../AuthContext'

// Cambiar la propia contraseña (usuario logueado con correo/contraseña).
// Flujo seguro de Firebase: re-autentica con la clave ACTUAL y luego actualiza.
// No se muestra a empleados (login por PIN = sesión anónima, sin correo).
export default function CambiarPassword() {
  const { user } = useAuth()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [abierto, setAbierto] = useState(false)

  // Solo para cuentas con correo/contraseña.
  if (!user?.email || user.isAnonymous) return null

  const cambiar = async () => {
    setMsg(null)
    if (!actual) { setMsg({ tipo: 'err', texto: 'Ingresá tu contraseña actual.' }); return }
    if (nueva.length < 6) { setMsg({ tipo: 'err', texto: 'La nueva contraseña debe tener al menos 6 caracteres.' }); return }
    if (nueva !== confirmar) { setMsg({ tipo: 'err', texto: 'Las contraseñas nuevas no coinciden.' }); return }
    if (nueva === actual) { setMsg({ tipo: 'err', texto: 'La nueva contraseña debe ser distinta a la actual.' }); return }
    setGuardando(true)
    try {
      const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('firebase/auth')
      const cred = EmailAuthProvider.credential(user.email, actual)
      await reauthenticateWithCredential(user, cred)
      await updatePassword(user, nueva)
      setMsg({ tipo: 'ok', texto: '✅ Contraseña actualizada. Usá la nueva la próxima vez que ingreses.' })
      setActual(''); setNueva(''); setConfirmar('')
    } catch (e) {
      const map = {
        'auth/wrong-password': 'La contraseña actual es incorrecta.',
        'auth/invalid-credential': 'La contraseña actual es incorrecta.',
        'auth/too-many-requests': 'Demasiados intentos. Esperá un momento y probá de nuevo.',
        'auth/weak-password': 'La nueva contraseña es muy débil.',
        'auth/requires-recent-login': 'Por seguridad, cerrá sesión y volvé a entrar para cambiar la contraseña.',
      }
      setMsg({ tipo: 'err', texto: map[e.code] || ('No se pudo cambiar: ' + (e.message || 'error')) })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="card" style={{ padding: 20, borderRadius: 14, maxWidth: 460 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>🔑 Contraseña</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>Cambiá tu contraseña de acceso. Solo vos la conocés.</div>
        </div>
        {!abierto && (
          <button className="btn btn-ghost" onClick={() => { setAbierto(true); setMsg(null) }} style={{ flexShrink: 0 }}>Cambiar</button>
        )}
      </div>

      {abierto && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {msg && (
            <div style={{ fontSize: 13, padding: '9px 12px', borderRadius: 9,
              background: msg.tipo === 'ok' ? 'rgba(0,194,150,0.12)' : 'rgba(239,68,68,0.1)',
              color: msg.tipo === 'ok' ? '#0a9d6b' : '#dc2626',
              border: `1px solid ${msg.tipo === 'ok' ? 'rgba(0,194,150,0.3)' : 'rgba(239,68,68,0.25)'}` }}>
              {msg.texto}
            </div>
          )}
          <input className="input" type="password" placeholder="Contraseña actual" value={actual} onChange={e => setActual(e.target.value)} autoComplete="current-password" />
          <input className="input" type="password" placeholder="Nueva contraseña (mín. 6)" value={nueva} onChange={e => setNueva(e.target.value)} autoComplete="new-password" />
          <input className="input" type="password" placeholder="Repetir nueva contraseña" value={confirmar} onChange={e => setConfirmar(e.target.value)} autoComplete="new-password"
            onKeyDown={e => { if (e.key === 'Enter' && !guardando) cambiar() }} />
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={() => { setAbierto(false); setMsg(null); setActual(''); setNueva(''); setConfirmar('') }} disabled={guardando}>Cancelar</button>
            <button className="btn btn-primary" onClick={cambiar} disabled={guardando} style={{ flex: 1 }}>
              {guardando ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
