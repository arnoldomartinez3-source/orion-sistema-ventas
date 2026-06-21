import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'

const TIPOS_DTE_CORRELATIVOS = ['FE', 'CCF', 'NC', 'ND', 'FEX']

const sucStyles = `
  .suc-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
  @media (max-width: 1100px) { .suc-grid { grid-template-columns: repeat(2,1fr); } }
  @media (max-width: 700px)  { .suc-grid { grid-template-columns: 1fr; } }

  .suc-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; padding: 20px; box-shadow: 0 4px 20px var(--shadow2); transition: all 0.15s; }
  .suc-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 8px 30px var(--shadow); }
  .suc-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
  .suc-card-nombre { font-size: 16px; font-weight: 800; margin-bottom: 3px; }
  .suc-card-codigos { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .suc-chip { background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 3px 8px; font-size: 11px; font-family: var(--mono); font-weight: 700; }
  .suc-chip.activa { background: rgba(0,212,170,0.1); border-color: rgba(0,212,170,0.3); color: var(--accent); }

  .correlativo-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 6px; margin-top: 10px; }
  .correlativo-item { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px; text-align: center; }
  .correlativo-tipo { font-size: 9px; font-weight: 800; color: var(--muted); text-transform: uppercase; margin-bottom: 3px; }
  .correlativo-val { font-size: 16px; font-weight: 900; font-family: var(--mono); color: var(--accent2); }
`

// Página SOLO-LECTURA: las sucursales las gestiona One Geo desde el Panel One Geo
// (SuperAdmin). El cliente solo las visualiza. Si necesita cambios, contacta a One Geo.
export default function GestionSucursales() {
  const { empresaId } = usePermisos()
  const [sucursales, setSucursales] = useState([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    if (!empresaId) return // esperar a tener empresaId antes de consultar
    const unsub = onSnapshot(query(collection(db, 'sucursales'), where('empresaId', '==', empresaId)), snap => {
      setSucursales(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [empresaId])

  return (
    <>
      <style>{sucStyles}</style>

      {/* ── TOPBAR ── */}
      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">🏪 Sucursales</div>
          <div className="page-sub" style={{ marginTop: 4 }}>
            {sucursales.length} sucursal{sucursales.length !== 1 ? 'es' : ''} configurada{sucursales.length !== 1 ? 's' : ''}
          </div>
        </div>
        {/* Las sucursales se gestionan desde el Panel One Geo (solo lectura para el cliente) */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '8px 14px', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
          🔒 Gestionadas por One Geo
        </div>
      </div>

      {/* ── CONTENIDO ── */}
      {loading ? (
        <div className="empty-state">
          <div className="empty-icon">⏳</div>
          <div className="empty-text">Cargando...</div>
        </div>
      ) : sucursales.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏪</div>
          <div className="empty-text">Sin sucursales configuradas.<br/>Contactá a One Geo para darlas de alta.</div>
        </div>
      ) : (
        <div className="suc-grid">
          {sucursales.map(s => (
            <div key={s.id} className="suc-card">
              <div className="suc-card-header">
                <div>
                  <div className="suc-card-nombre">{s.nombre}</div>
                  {s.responsable && <div style={{ fontSize: 12, color: 'var(--muted)' }}>👤 {s.responsable}</div>}
                  {s.direccion && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>📍 {s.direccion}</div>}
                </div>
                <span className={`suc-chip ${s.activa !== false ? 'activa' : ''}`}>
                  {s.activa !== false ? '✅ Activa' : '⛔ Inactiva'}
                </span>
              </div>

              <div className="suc-card-codigos">
                <span className="suc-chip">Est: {s.codEstablecimiento}</span>
                <span className="suc-chip">PV: {s.codPuntoVenta}</span>
                {s.codEstableMH && <span className="suc-chip">MH: {s.codEstableMH}/{s.codPuntoVentaMH || '—'}</span>}
              </div>

              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                Correlativos DTE
              </div>
              <div className="correlativo-grid">
                {TIPOS_DTE_CORRELATIVOS.map(t => (
                  <div key={t} className="correlativo-item">
                    <div className="correlativo-tipo">{t}</div>
                    <div className="correlativo-val">{s[`correlativo${t}`] || 1}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
