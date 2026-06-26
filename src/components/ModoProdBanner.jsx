import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { usePermisos } from '../PermisosContext'
import { doc, getDoc } from 'firebase/firestore'

// Banner de advertencia: se muestra cuando la empresa activa está en AMBIENTE
// DE PRODUCCIÓN (configuracion.dte_ambiente === '01'). Sirve para no confundir
// pruebas con DTE reales mientras se siguen haciendo mejoras.
export default function ModoProdBanner() {
  const { empresaId } = usePermisos()
  const [prod, setProd] = useState(false)

  useEffect(() => {
    if (!empresaId) { setProd(false); return }
    getDoc(doc(db, 'configuracion', empresaId))
      .then(s => setProd(s.exists() && s.data().dte_ambiente === '01'))
      .catch(() => {})
  }, [empresaId])

  if (!prod) return null
  return (
    <div style={{
      background: 'linear-gradient(90deg,#b91c1c,#dc2626)', color: '#fff',
      textAlign: 'center', padding: '8px 12px', fontSize: 13, fontWeight: 800,
      letterSpacing: 0.3, borderRadius: 10, marginBottom: 16,
      boxShadow: '0 2px 12px rgba(185,28,28,0.35)',
    }}>
      🔴 MODO PRODUCCIÓN — los DTE que emitís son REALES ante el Ministerio de Hacienda
    </div>
  )
}
