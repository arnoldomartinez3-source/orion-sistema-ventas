// src/components/SelectorDepartamento.jsx
// Selector de Departamento + Municipio + Distrito (MH v1.2)
// Distrito es solo uso interno ORIÓN — no se envía al MH como campo separado
import { DEPARTAMENTOS, getMunicipios, getDistritos } from '../data/departamentosMunicipios'

/**
 * Props:
 *   codDep      — string — código departamento seleccionado
 *   codMun      — string — código municipio seleccionado
 *   distrito    — string — distrito seleccionado (uso interno)
 *   onChange    — fn({ codDep, codMun, nombreDep, nombreMun, distrito })
 *   layout      — 'grid' | 'column' (default: 'grid')
 *   disabled    — bool
 *   showLabels  — bool (default: true)
 *   showDistrito — bool (default: true)
 */
export default function SelectorDepartamento({
  codDep = '', codMun = '', distrito = '',
  onChange, layout = 'grid', disabled = false,
  showLabels = true, showDistrito = true
}) {
  const municipios = getMunicipios(codDep)
  const distritos  = getDistritos(codDep, codMun)

  const handleDep = (e) => {
    const val = e.target.value
    const dep = DEPARTAMENTOS.find(d => d.codigo === val)
    onChange?.({ codDep: val, codMun: '', nombreDep: dep?.nombre || '', nombreMun: '', distrito: '' })
  }

  const handleMun = (e) => {
    const val = e.target.value
    const dep = DEPARTAMENTOS.find(d => d.codigo === codDep)
    const mun = getMunicipios(codDep).find(m => m.codigo === val)
    onChange?.({ codDep, codMun: val, nombreDep: dep?.nombre || '', nombreMun: mun?.nombre || '', distrito: '' })
  }

  const handleDistrito = (e) => {
    const val = e.target.value
    const dep = DEPARTAMENTOS.find(d => d.codigo === codDep)
    const mun = getMunicipios(codDep).find(m => m.codigo === codMun)
    onChange?.({ codDep, codMun, nombreDep: dep?.nombre || '', nombreMun: mun?.nombre || '', distrito: val })
  }

  const wrap = layout === 'column'
    ? { display: 'flex', flexDirection: 'column', gap: 8 }
    : { display: 'grid', gridTemplateColumns: showDistrito && distritos.length > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8 }

  return (
    <div style={wrap}>
      {/* Departamento */}
      <div className="form-group" style={{ margin: 0 }}>
        {showLabels && <label className="form-label">Departamento</label>}
        <select className="input" value={codDep} onChange={handleDep} disabled={disabled} style={{ fontSize: 13 }}>
          <option value="">Seleccionar departamento...</option>
          {DEPARTAMENTOS.map(d => (
            <option key={d.codigo} value={d.codigo}>{d.codigo} — {d.nombre}</option>
          ))}
        </select>
      </div>

      {/* Municipio */}
      <div className="form-group" style={{ margin: 0 }}>
        {showLabels && <label className="form-label">Municipio</label>}
        <select className="input" value={codMun} onChange={handleMun}
          disabled={disabled || !codDep || municipios.length === 0} style={{ fontSize: 13 }}>
          <option value="">Seleccionar municipio...</option>
          {municipios.map(m => (
            <option key={m.codigo} value={m.codigo}>{m.codigo} — {m.nombre}</option>
          ))}
        </select>
      </div>

      {/* Distrito — solo si hay municipio seleccionado y hay distritos */}
      {showDistrito && codMun && distritos.length > 0 && (
        <div className="form-group" style={{ margin: 0 }}>
          {showLabels && <label className="form-label">Distrito <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 400 }}>(uso interno)</span></label>}
          <select className="input" value={distrito} onChange={handleDistrito} disabled={disabled} style={{ fontSize: 13 }}>
            <option value="">Sin distrito...</option>
            {distritos.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
