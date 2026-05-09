// src/components/SelectorDepartamento.jsx
// Componente reutilizable para seleccionar departamento y municipio de El Salvador
import { DEPARTAMENTOS, getMunicipios } from '../data/departamentosMunicipios'

/**
 * Props:
 *   codDep     — código del departamento seleccionado (2 dígitos)
 *   codMun     — código del municipio seleccionado (2 dígitos)
 *   onChange   — fn({ codDep, codMun, nombreDep, nombreMun })
 *   layout     — 'grid' | 'column' (default: 'grid')
 *   disabled   — bool
 */
export default function SelectorDepartamento({ codDep = '', codMun = '', onChange, layout = 'grid', disabled = false }) {
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

  const containerStyle = layout === 'grid'
    ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }
    : { display: 'flex', flexDirection: 'column', gap: 8 }

  return (
    <div style={containerStyle}>
      <div className="form-group">
        <label className="form-label">Departamento</label>
        <select className="input" value={codDep} onChange={handleDep} disabled={disabled} style={{ fontSize: 13 }}>
          <option value="">Seleccionar...</option>
          {DEPARTAMENTOS.map(d => (
            <option key={d.codigo} value={d.codigo}>{d.codigo} — {d.nombre}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Municipio</label>
        <select className="input" value={codMun} onChange={handleMun} disabled={disabled || !codDep} style={{ fontSize: 13 }}>
          <option value="">Seleccionar...</option>
          {municipios.map(m => (
            <option key={m.codigo} value={m.codigo}>{m.codigo} — {m.nombre}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
