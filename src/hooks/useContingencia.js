import { useEffect, useState } from 'react'
import { db } from '../firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'

// ══════════════════════════════════════════════════════════════════
// Estado de CONTINGENCIA DTE de la empresa.
// Lee el ambiente (configuracion/{empresaId}.mh_ambiente: '00' pruebas,
// '01' producción) y el registro contingencias/{empresaId}_{ambiente}
// que escribe el backend (transmitir.js / contingencia.js).
// Úsalo para el banner, el panel de Facturas y para BLOQUEAR documentos
// que la Normativa no permite emitir en contingencia (Retención, NC,
// Liquidación) mientras `activa` sea true.
// ══════════════════════════════════════════════════════════════════
export function useContingencia() {
  const { empresaId } = usePermisos()
  const [ambiente, setAmbiente] = useState('00')
  const [contingencia, setContingencia] = useState(null)

  useEffect(() => {
    if (!empresaId) return
    return onSnapshot(doc(db, 'configuracion', empresaId),
      s => setAmbiente(s.exists() ? (s.data().mh_ambiente || '00') : '00'), () => {})
  }, [empresaId])

  useEffect(() => {
    if (!empresaId) return
    return onSnapshot(doc(db, 'contingencias', `${empresaId}_${ambiente}`),
      s => setContingencia(s.exists() ? s.data() : null), () => setContingencia(null))
  }, [empresaId, ambiente])

  return { contingencia, activa: contingencia?.activa === true, simulando: contingencia?.simularCaida === true, ambiente }
}
