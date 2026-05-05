import { useState } from 'react'

// Modal para que el admin seleccione sucursal al hacer login
export default function SelectorSucursal({ sucursales, onSeleccionar }) {
  const [seleccion, setSeleccion] = useState(sucursales[0]?.id || '')

  if (sucursales.length === 0) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 20, padding: 40, maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏪</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Sin sucursales activas</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24 }}>Configura al menos una sucursal en el módulo de Sucursales antes de continuar.</div>
          <a href="/sucursales" className="btn btn-primary" style={{ display: 'inline-block' }}>Ir a Sucursales</a>
        </div>
      </div>
    )
  }

  if (sucursales.length === 1) {
    // Auto-seleccionar si solo hay una
    onSeleccionar(sucursales[0])
    return null
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(8px)' }}>
      <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 20, padding: 32, maxWidth: 480, width: '100%', boxShadow: '0 30px 100px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>🏪</div>
        <div style={{ fontSize: 20, fontWeight: 800, textAlign: 'center', marginBottom: 6 }}>Seleccionar Sucursal</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', marginBottom: 24 }}>¿Desde qué sucursal vas a trabajar hoy?</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {sucursales.map(s => (
            <div key={s.id}
              onClick={() => setSeleccion(s.id)}
              style={{
                padding: '14px 18px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
                border: seleccion === s.id ? '2px solid var(--accent)' : '1.5px solid var(--border)',
                background: seleccion === s.id ? 'rgba(0,212,170,0.08)' : 'var(--surface2)',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: seleccion === s.id ? 'var(--accent)' : 'var(--text)' }}>{s.nombre}</div>
                  {s.direccion && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>📍 {s.direccion}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--surface)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: 5 }}>
                    {s.codEstablecimiento}-{s.codPuntoVenta}
                  </span>
                  {seleccion === s.id && <span style={{ color: 'var(--accent)', fontSize: 18 }}>✓</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: 16 }}
          onClick={() => {
            const suc = sucursales.find(s => s.id === seleccion)
            if (suc) onSeleccionar(suc)
          }}
          disabled={!seleccion}>
          Continuar con esta sucursal →
        </button>
      </div>
    </div>
  )
}
