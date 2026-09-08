import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'
import { postAutenticado } from '../utils/apiAuth'

// ══════════════════════════════════════════════════════════════════
// BANNER GLOBAL DE CONTINGENCIA DTE ("MH no disponible")
// Lee contingencias/{empresaId}_{ambiente}, que transmitir.js crea cuando
// un DTE tuvo que emitirse firmado en contingencia. Mientras esté activa:
//  · avisa en todas las pantallas (período, documentos en cola),
//  · verifica el MH cada 15 min (política oficial, Normativa p.20) con un
//    "ping" al backend, que anota mhDisponibleDesde cuando vuelve,
//  · muestra el plazo de 24 h para que un admin informe el evento.
// El evento NO se envía solo: lo confirma un administrador en Facturas DTE.
// ══════════════════════════════════════════════════════════════════
const PING_MS = 15 * 60 * 1000

const fmtHora = (d) => d.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })
const fmtFechaHora = (d) => d.toLocaleString('es-SV', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function BannerContingencia() {
  const { empresaId, esAdmin } = usePermisos()
  const [ambiente, setAmbiente] = useState('00')
  const [cont, setCont] = useState(null)

  // Ambiente DTE de la empresa (00 pruebas / 01 producción)
  useEffect(() => {
    if (!empresaId) return
    return onSnapshot(doc(db, 'empresas', empresaId), s => setAmbiente(s.data()?.mh_ambiente || '00'), () => {})
  }, [empresaId])

  // Estado de contingencia de la empresa en ese ambiente
  useEffect(() => {
    if (!empresaId) return
    return onSnapshot(doc(db, 'contingencias', `${empresaId}_${ambiente}`), s => setCont(s.exists() ? s.data() : null), () => setCont(null))
  }, [empresaId, ambiente])

  const activa = cont?.activa === true

  // Verificación del MH cada 15 min mientras dure la contingencia
  useEffect(() => {
    if (!activa) return
    const ping = () => postAutenticado('/api/dte/transmitir', { ping: true, ambiente }).catch(() => {})
    ping()
    const t = setInterval(ping, PING_MS)
    return () => clearInterval(t)
  }, [activa, ambiente])

  if (!activa) return null

  const docs = cont.documentos || 0
  const volvio = cont.mhDisponibleDesde?.toDate ? cont.mhDisponibleDesde.toDate() : null
  const limite = volvio ? new Date(volvio.getTime() + 24 * 60 * 60 * 1000) : null
  const vencido = limite && Date.now() > limite.getTime()

  return (
    <div style={{
      background: vencido ? '#b91c1c' : '#7c3aed', color: '#fff', padding: '8px 16px', fontSize: 13,
      display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 300,
    }}>
      <strong>⚡ CONTINGENCIA DTE ACTIVA</strong>
      <span>desde {cont.fInicio} {cont.hInicio} · {docs} documento(s) firmados en cola</span>
      {volvio ? (
        <span>
          · El MH volvió a responder a las {fmtHora(volvio)} → informar el evento <strong>antes de {fmtFechaHora(limite)}</strong>
          {vencido ? ' (PLAZO VENCIDO)' : ''}
        </span>
      ) : (
        <span>· El MH sigue sin responder; se verifica cada 15 min</span>
      )}
      {esAdmin && (
        <Link to="/facturas" style={{ color: '#fff', fontWeight: 700, marginLeft: 'auto', textDecoration: 'underline' }}>
          Informar evento en Facturas DTE →
        </Link>
      )}
    </div>
  )
}
