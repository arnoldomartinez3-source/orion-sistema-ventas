import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { usePermisos } from '../PermisosContext'
import { estadoHorario, describirHorario } from '../utils/horario'

// ══════════════════════════════════════════════════
// Horario de acceso en la PANTALLA. Si el empleado queda fuera de su horario
// (ej. se le pasó la hora con la sesión abierta), se tapa la app con un aviso.
// La protección real está en el servidor (login) y en las reglas (no deja
// guardar ventas); esto es para que la persona entienda qué pasa.
// Si tiene una autorización temporal, se muestra una franja con la hora límite.
// ══════════════════════════════════════════════════

const hora = (ms) => new Date(ms).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', timeZone: 'America/El_Salvador' })

export default function BloqueoHorario() {
  const { logout } = useAuth()
  const { usuarioData, rol, empresaId, esMaestro } = usePermisos()
  const [config, setConfig] = useState(null)
  const [ahora, setAhora] = useState(() => new Date())

  const aplica = !!empresaId && !esMaestro && rol && rol !== 'administrador'

  useEffect(() => {
    if (!aplica) return
    return onSnapshot(doc(db, 'configuracion', empresaId), s => setConfig(s.exists() ? s.data() : {}), () => {})
  }, [aplica, empresaId])

  // Se revisa cada 30 s: la hora avanza aunque nadie toque nada.
  useEffect(() => {
    if (!aplica) return
    const t = setInterval(() => setAhora(new Date()), 30 * 1000)
    return () => clearInterval(t)
  }, [aplica])

  if (!aplica || !config || !usuarioData) return null
  const estado = estadoHorario({ ...usuarioData, rol }, config, ahora)

  if (estado.motivo === 'autorizado') {
    return (
      <div style={{ position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 900,
        background: 'var(--surface)', border: '1.5px solid var(--accent3)', color: 'var(--text)', borderRadius: 99,
        padding: '7px 16px', fontSize: 12.5, fontWeight: 600, boxShadow: '0 6px 22px var(--shadow)', whiteSpace: 'nowrap' }}>
        ⏰ Autorizado fuera de horario hasta las <strong>{hora(estado.autorizadoHasta)}</strong>
      </div>
    )
  }
  if (estado.permitido) return null

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="bh-titulo"
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(8,14,30,0.72)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="modal" style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{ fontSize: 46, lineHeight: 1, marginBottom: 10 }}>🕒</div>
        <div id="bh-titulo" style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>Estás fuera de tu horario</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 6 }}>
          Tu horario es <strong>{describirHorario(estado.horario)}</strong>. Fuera de ese horario no se pueden registrar ventas ni documentos.
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 20 }}>
          Si necesitás terminar algo, pedile a tu administrador que te autorice. Esta pantalla se quita sola al autorizarte.
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={logout}>Cerrar sesión</button>
      </div>
    </div>
  )
}
