// src/components/SelectorDepartamento.jsx
import { DEPARTAMENTOS, getMunicipios } from '../data/departamentosMunicipios'

/**
 * Props:
 *   codDep    — string
 *   codMun    — string
 *   onChange  — fn({ codDep, codMun, nombreDep, nombreMun })
 *   layout    — 'grid' | 'column'
 *   disabled  — bool
 *   showLabels — bool (default true)
 */
export default function SelectorDepartamento({ codDep = '', codMun = '', onChange, layout = 'grid', disabled = false, showLabels = true }) {
  const municipios = getMunicipios(codDep)

  const handleDep = (e) => {
    const val = e.target.value
    const dep = DEPARTAMENTOS.find(d => d.codigo === val)
    onChange?.({ codDep: val, codMun: '', nombreDep: dep?.nombre || '', nombreMun: '' })
  }

  const handleMun = (e) => {
    const val = e.target.value
    const dep = DEPARTAMENTOS.find(d => d.codigo === codDep)
    const mun = getMunicipios(codDep).find(m => m.codigo === val)
    onChange?.({ codDep, codMun: val, nombreDep: dep?.nombre || '', nombreMun: mun?.nombre || '' })
  }

  const wrap = layout === 'grid'
    ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }
    : { display: 'flex', flexDirection: 'column', gap: 8 }

  return (
    <div style={wrap}>
      <div className="form-group">
        {showLabels && <label className="form-label">Departamento</label>}
        <select className="input" value={codDep} onChange={handleDep} disabled={disabled} style={{ fontSize: 13 }}>
          <option value="">Seleccionar departamento...</option>
          {DEPARTAMENTOS.map(d => (
            <option key={d.codigo} value={d.codigo}>{d.codigo} — {d.nombre}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        {showLabels && <label className="form-label">Municipio</label>}
        <select className="input" value={codMun} onChange={handleMun} disabled={disabled || !codDep || municipios.length === 0} style={{ fontSize: 13 }}>
          <option value="">Seleccionar municipio...</option>
          {municipios.map(m => (
            <option key={m.codigo} value={m.codigo}>{m.codigo} — {m.nombre}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
