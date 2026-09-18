import { useEffect, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { MODULOS, moduloEstaActivo } from '../../data/modulos'

// ══════════════════════════════════════════════════
// Configuración → MI PLAN Y USO (solo lectura).
// Lo que One Geo le activó a la empresa (Panel One Geo → Plan y límites) y cuánto
// lleva usado este mes. Para cambiar algo, el cliente contacta a One Geo.
// ══════════════════════════════════════════════════

const NOMBRE_PLAN = { emprendedor: 'Emprendedor', negocio: 'Negocio (Pro)', empresa: 'Empresa (Premium)', basico: 'Básico', premium: 'Premium' }
const TOPE_CORREO = 500   // mismos valores por defecto que las funciones
const TOPE_IA = 100

const periodoSV = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit' }).format(new Date())
const mesSV = () => new Intl.DateTimeFormat('es-SV', { timeZone: 'America/El_Salvador', month: 'long' }).format(new Date())

function Medidor({ titulo, usado, tope, detalle }) {
  const pct = tope ? Math.min(100, Math.round((usado / tope) * 100)) : 0
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? 'var(--accent3)' : 'var(--accent)'
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', marginTop: 4 }}>
        {usado ?? '—'}{tope ? <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}> / {tope}</span> : null}
      </div>
      {tope ? (
        <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, marginTop: 8, overflow: 'hidden' }}
          role="meter" aria-valuemin={0} aria-valuemax={tope} aria-valuenow={usado || 0} aria-label={titulo}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
        </div>
      ) : null}
      {detalle && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{detalle}</div>}
    </div>
  )
}

export default function PlanUso({ empresaId }) {
  const [empresa, setEmpresa] = useState(null)
  const [uso, setUso] = useState({ usuarios: null, sucursales: null, correos: null, ia: null })

  useEffect(() => {
    if (!empresaId) return
    const periodo = periodoSV()
    const contar = async (col) => {
      try { return (await getDocs(query(collection(db, col), where('empresaId', '==', empresaId)))).size } catch { return null }
    }
    const valor = async (col) => {
      try { const s = await getDoc(doc(db, col, `${empresaId}_${periodo}`)); return s.exists() ? (s.data().valor || 0) : 0 } catch { return null }
    }
    ;(async () => {
      const s = await getDoc(doc(db, 'empresas', empresaId)).catch(() => null)
      setEmpresa(s?.exists() ? s.data() : {})
      const [usuarios, sucursales, correos, ia] = await Promise.all([contar('usuarios'), contar('sucursales'), valor('contadores_correo'), valor('contadores_ia')])
      setUso({ usuarios, sucursales, correos, ia })
    })()
  }, [empresaId])

  if (!empresa) return <div className="empty-state"><div className="empty-text">Cargando tu plan…</div></div>

  const activo = (key) => moduloEstaActivo(key, empresa.modulos || {}, false)
  const tieneCorreo = activo('correo')
  const tieneIA = activo('ia_facturas')

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="config-section">
        <div className="config-section-header">
          <div className="config-section-icon">⭐</div>
          <div className="config-section-title">Tu plan: {NOMBRE_PLAN[empresa.plan] || 'Emprendedor'}</div>
        </div>
        <div className="config-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <Medidor titulo="Usuarios" usado={uso.usuarios} tope={empresa.maxUsuarios || null} />
            <Medidor titulo="Sucursales" usado={uso.sucursales} tope={empresa.maxSucursales || null} />
            {tieneCorreo && <Medidor titulo={`Correos de ${mesSV()}`} usado={uso.correos} tope={Number(empresa.correo_tope) > 0 ? Number(empresa.correo_tope) : TOPE_CORREO} detalle="Facturas enviadas por correo" />}
            {tieneIA && <Medidor titulo={`Fotos con IA de ${mesSV()}`} usado={uso.ia} tope={Number(empresa.ia_tope) > 0 ? Number(empresa.ia_tope) : TOPE_IA} detalle="Facturas de compra leídas con IA" />}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Los contadores del mes se reinician el día 1. Para ampliar tu plan o activar un módulo, contactá a <strong>One Geo Systems</strong>.
          </div>
        </div>
      </div>

      <div className="config-section">
        <div className="config-section-header">
          <div className="config-section-icon">🧩</div>
          <div className="config-section-title">Módulos</div>
        </div>
        <div className="config-section-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {MODULOS.map(m => {
              const on = activo(m.key)
              return (
                <div key={m.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 12,
                  border: `1.5px solid ${on ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'var(--border)'}`,
                  background: on ? 'color-mix(in srgb, var(--accent) 5%, var(--surface))' : 'var(--surface2)', opacity: on ? 1 : 0.7 }}>
                  <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1.2 }}>{on ? '✅' : '➖'}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.label}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.45, marginTop: 2 }}>{on ? 'Activo' : 'No incluido'} · {m.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
