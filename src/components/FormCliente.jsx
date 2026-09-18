import SelectorDepartamento from './SelectorDepartamento'
import BuscadorActividad from './BuscadorActividad'

// ══════════════════════════════════════════════════
// Formulario de CLIENTE reutilizable: lo usan la pantalla Clientes y el
// POS (ventana "Configurar DTE"), para dar de alta o corregir un cliente sin
// salir de la venta. Mismos campos y mismas validaciones en los dos lados.
// ══════════════════════════════════════════════════

export default function CamposCliente({ form, setForm }) {
  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="form-group">
        <label className="form-label">NOMBRE / RAZÓN SOCIAL *</label>
        <input className="input" placeholder="Nombre completo o razón social" value={form.nombre || ''} onChange={e => set('nombre', e.target.value)} />
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">TIPO DE PERSONA</label>
          <select className="input" value={form.tipo || 'Natural'}
            onChange={e => {
              const nuevoTipo = e.target.value
              // Si pasa a Jurídico, limpiar DUI (no aplica para empresas)
              setForm(f => ({ ...f, tipo: nuevoTipo, dui: nuevoTipo === 'Jurídico' ? '' : f.dui }))
            }}>
            <option value="Natural">Natural</option>
            <option value="Jurídico">Jurídico</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">TELÉFONO</label>
          <input className="input" placeholder="2222-3333" value={form.telefono || ''} onChange={e => set('telefono', e.target.value)} />
        </div>
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">
            NIT {form.tipo === 'Jurídico' && <span style={{ color: '#ef4444' }}>*</span>}
          </label>
          <input className="input" placeholder="0614-010190-101-3" value={form.nit || ''}
            onChange={e => set('nit', e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 13 }} />
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
            14 o 9 dígitos. Obligatorio para clientes Jurídicos.
          </div>
        </div>
        {/* DUI: solo se ofrece para personas Naturales */}
        {form.tipo !== 'Jurídico' && (
          <div className="form-group">
            <label className="form-label">
              DUI {!form.nit && <span style={{ color: '#f59e0b', fontSize: 10 }}>(o NIT)</span>}
            </label>
            <input className="input" placeholder="12345678-9" value={form.dui || ''}
              onChange={e => set('dui', e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 13 }} />
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
              9 dígitos. Para Consumidor Final identificado.
            </div>
          </div>
        )}
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">NRC (si aplica)</label>
          <input className="input" placeholder="12345-6" value={form.nrc || ''} onChange={e => set('nrc', e.target.value)} />
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
            Solo si el cliente emite CCF
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">EMAIL</label>
          <input className="input" placeholder="correo@empresa.com" value={form.email || ''} onChange={e => set('email', e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">
          ACTIVIDAD ECONÓMICA
          {form.nrc && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </label>
        <BuscadorActividad
          codActividad={form.codActividad || ''}
          descActividad={form.descActividad || ''}
          onChange={({ codigo, descripcion }) => setForm(f => ({ ...f, codActividad: codigo, descActividad: descripcion }))}
          placeholder="Buscar por código o descripción..."
        />
        {form.nrc && !form.codActividad && (
          <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
            ⚠️ Obligatoria para clientes CCF
          </div>
        )}
      </div>
      <div className="form-group" style={{ marginTop: 4 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          <input type="checkbox" checked={form.mayorista === true}
            onChange={e => set('mayorista', e.target.checked)} />
          🏷️ Cliente mayorista
        </label>
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 }}>
          En el POS se le cobra el <strong>precio de mayoreo</strong> de cada producto (el que definís en Inventario). Si un producto no tiene precio de mayoreo, paga el precio normal.
        </div>
      </div>
      {form.nrc && (
        <div className="form-group" style={{ marginTop: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            <input type="checkbox" checked={form.agenteRetencion === true}
              onChange={e => set('agenteRetencion', e.target.checked)} />
            Agente de retención (gran contribuyente)
          </label>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 }}>
            Al emitirle un CCF de $100 o más, se le retiene el 1% de IVA automáticamente (baja el total a pagar).
          </div>
        </div>
      )}
      <div>
        <label className="form-label" style={{ marginBottom: 6, display: 'block' }}>DIRECCIÓN</label>
        <SelectorDepartamento
          codDep={form.codDep || ''}
          codMun={form.codMun || ''}
          distrito={form.distrito || ''}
          onChange={({ codDep, codMun, distrito, codDistrito }) =>
            setForm(f => ({ ...f, codDep, codMun, distrito: distrito || '', codDistrito: codDistrito || '' }))}
        />
        <input className="input" style={{ marginTop: 8 }}
          placeholder="Complemento: calle, colonia, número..."
          value={form.complemento || ''}
          onChange={e => set('complemento', e.target.value)} />
      </div>
    </div>
  )
}
