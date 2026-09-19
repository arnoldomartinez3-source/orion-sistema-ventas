import SelectorDepartamento from './SelectorDepartamento'
import BuscadorActividad from './BuscadorActividad'

// ══════════════════════════════════════════════════
// Formulario de CLIENTE reutilizable: lo usan la pantalla Clientes y el
// POS (ventana "Configurar DTE"), para dar de alta o corregir un cliente sin
// salir de la venta. Mismos campos y mismas validaciones en los dos lados.
// En PC va en 3 columnas (como "Nuevo producto" en Inventario); en el
// teléfono, en una sola. Usalo dentro de un modal con la clase .modal-cli-horizontal.
// ══════════════════════════════════════════════════

const estilos = `
  .modal-cli-horizontal { max-width: 1120px !important; max-height: 92vh; max-height: 92dvh; overflow-y: auto; }
  .cli-cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; align-items: start; }
  @media (max-width: 1000px) { .cli-cols { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 680px) { .cli-cols { grid-template-columns: 1fr; } }
  .cli-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .cli-col-titulo { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 1px; padding: 4px 0; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
  .cli-ayuda { font-size: 10.5px; color: var(--muted); margin-top: 3px; line-height: 1.45; }
  .cli-check { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text); }
`

export default function CamposCliente({ form, setForm }) {
  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))
  return (
    <div className="cli-cols">
      <style>{estilos}</style>

      {/* COLUMNA 1 — Identificación */}
      <div className="cli-col">
        <div className="cli-col-titulo">IDENTIFICACIÓN</div>
        <div className="form-group">
          <label className="form-label">NOMBRE / RAZÓN SOCIAL *</label>
          <input className="input" autoFocus placeholder="Nombre completo o razón social" value={form.nombre || ''} onChange={e => set('nombre', e.target.value)} />
        </div>
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
          <label className="form-label">
            NIT {form.tipo === 'Jurídico' && <span style={{ color: '#ef4444' }}>*</span>}
          </label>
          <input className="input" placeholder="0614-010190-101-3" value={form.nit || ''}
            onChange={e => set('nit', e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 13 }} />
          <div className="cli-ayuda">14 o 9 dígitos. Obligatorio para clientes Jurídicos.</div>
        </div>
        {/* DUI: solo se ofrece para personas Naturales */}
        {form.tipo !== 'Jurídico' && (
          <div className="form-group">
            <label className="form-label">
              DUI {!form.nit && <span style={{ color: '#f59e0b', fontSize: 10 }}>(o NIT)</span>}
            </label>
            <input className="input" placeholder="12345678-9" value={form.dui || ''}
              onChange={e => set('dui', e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 13 }} />
            <div className="cli-ayuda">9 dígitos. Para Consumidor Final identificado.</div>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">NRC (si aplica)</label>
          <input className="input" placeholder="12345-6" value={form.nrc || ''} onChange={e => set('nrc', e.target.value)} />
          <div className="cli-ayuda">Solo si el cliente pide Crédito Fiscal (CCF).</div>
        </div>
      </div>

      {/* COLUMNA 2 — Contacto y actividad */}
      <div className="cli-col">
        <div className="cli-col-titulo">CONTACTO Y ACTIVIDAD</div>
        <div className="form-group">
          <label className="form-label">TELÉFONO</label>
          <input className="input" placeholder="2222-3333" value={form.telefono || ''} onChange={e => set('telefono', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">EMAIL</label>
          <input className="input" placeholder="correo@empresa.com" value={form.email || ''} onChange={e => set('email', e.target.value)} />
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
            <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>⚠️ Obligatoria para clientes CCF</div>
          )}
        </div>
        <div className="form-group">
          <label className="cli-check">
            <input type="checkbox" checked={form.mayorista === true} onChange={e => set('mayorista', e.target.checked)} />
            🏷️ Cliente mayorista
          </label>
          <div className="cli-ayuda">
            En el POS se le cobra el <strong>precio de mayoreo</strong> de cada producto (el que definís en Inventario). Si un producto no tiene precio de mayoreo, paga el precio normal.
          </div>
        </div>
        {form.nrc && (
          <div className="form-group">
            <label className="cli-check">
              <input type="checkbox" checked={form.agenteRetencion === true} onChange={e => set('agenteRetencion', e.target.checked)} />
              Agente de retención (gran contribuyente)
            </label>
            <div className="cli-ayuda">Al emitirle un CCF de $100 o más, se le retiene el 1% de IVA automáticamente (baja el total a pagar).</div>
          </div>
        )}
      </div>

      {/* COLUMNA 3 — Dirección */}
      <div className="cli-col">
        <div className="cli-col-titulo">DIRECCIÓN</div>
        <SelectorDepartamento layout="column"
          codDep={form.codDep || ''}
          codMun={form.codMun || ''}
          distrito={form.distrito || ''}
          onChange={({ codDep, codMun, distrito, codDistrito }) =>
            setForm(f => ({ ...f, codDep, codMun, distrito: distrito || '', codDistrito: codDistrito || '' }))}
        />
        <div className="form-group">
          <label className="form-label">COMPLEMENTO</label>
          <input className="input" placeholder="Calle, colonia, número..." value={form.complemento || ''} onChange={e => set('complemento', e.target.value)} />
          <div className="cli-ayuda">Obligatoria para Crédito Fiscal.</div>
        </div>
      </div>
    </div>
  )
}
