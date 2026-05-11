// src/data/departamentosMunicipios.js
// Catálogo oficial MH El Salvador v1.2 — vigente desde 9 octubre 2025
// IMPORTANTE: Los códigos de municipio NO son consecutivos desde 01.
// Siempre enviar codDep + codMun juntos al MH.

export const DEPARTAMENTOS = [
  { codigo: '00', nombre: 'Otro (Extranjero)' },
  { codigo: '01', nombre: 'Ahuachapán' },
  { codigo: '02', nombre: 'Santa Ana' },
  { codigo: '03', nombre: 'Sonsonate' },
  { codigo: '04', nombre: 'Chalatenango' },
  { codigo: '05', nombre: 'La Libertad' },
  { codigo: '06', nombre: 'San Salvador' },
  { codigo: '07', nombre: 'Cuscatlán' },
  { codigo: '08', nombre: 'La Paz' },
  { codigo: '09', nombre: 'Cabañas' },
  { codigo: '10', nombre: 'San Vicente' },
  { codigo: '11', nombre: 'Usulután' },
  { codigo: '12', nombre: 'San Miguel' },
  { codigo: '13', nombre: 'Morazán' },
  { codigo: '14', nombre: 'La Unión' },
]

export const MUNICIPIOS = {
  '00': [],
  '01': [
    { codigo: '13', nombre: 'Ahuachapán Norte' },
    { codigo: '14', nombre: 'Ahuachapán Centro' },
    { codigo: '15', nombre: 'Ahuachapán Sur' },
  ],
  '02': [
    { codigo: '14', nombre: 'Santa Ana Norte' },
    { codigo: '15', nombre: 'Santa Ana Centro' },
    { codigo: '16', nombre: 'Santa Ana Este' },
    { codigo: '17', nombre: 'Santa Ana Oeste' },
  ],
  '03': [
    { codigo: '17', nombre: 'Sonsonate Norte' },
    { codigo: '18', nombre: 'Sonsonate Centro' },
    { codigo: '19', nombre: 'Sonsonate Este' },
    { codigo: '20', nombre: 'Sonsonate Oeste' },
  ],
  '04': [
    { codigo: '34', nombre: 'Chalatenango Norte' },
    { codigo: '35', nombre: 'Chalatenango Centro' },
    { codigo: '36', nombre: 'Chalatenango Sur' },
  ],
  '05': [
    { codigo: '23', nombre: 'La Libertad Norte' },
    { codigo: '24', nombre: 'La Libertad Centro' },
    { codigo: '25', nombre: 'La Libertad Oeste' },
    { codigo: '26', nombre: 'La Libertad Este' },
    { codigo: '27', nombre: 'La Libertad Costa' },
    { codigo: '28', nombre: 'La Libertad Sur' },
  ],
  '06': [
    { codigo: '20', nombre: 'San Salvador Norte' },
    { codigo: '21', nombre: 'San Salvador Oeste' },
    { codigo: '22', nombre: 'San Salvador Este' },
    { codigo: '23', nombre: 'San Salvador Centro' },
    { codigo: '24', nombre: 'San Salvador Sur' },
  ],
  '07': [
    { codigo: '17', nombre: 'Cuscatlán Norte' },
    { codigo: '18', nombre: 'Cuscatlán Sur' },
  ],
  '08': [
    { codigo: '23', nombre: 'La Paz Oeste' },
    { codigo: '24', nombre: 'La Paz Centro' },
    { codigo: '25', nombre: 'La Paz Este' },
  ],
  '09': [
    { codigo: '10', nombre: 'Cabañas Oeste' },
    { codigo: '11', nombre: 'Cabañas Este' },
  ],
  '10': [
    { codigo: '14', nombre: 'San Vicente Norte' },
    { codigo: '15', nombre: 'San Vicente Sur' },
  ],
  '11': [
    { codigo: '24', nombre: 'Usulután Norte' },
    { codigo: '25', nombre: 'Usulután Este' },
    { codigo: '26', nombre: 'Usulután Oeste' },
  ],
  '12': [
    { codigo: '21', nombre: 'San Miguel Norte' },
    { codigo: '22', nombre: 'San Miguel Centro' },
    { codigo: '23', nombre: 'San Miguel Oeste' },
  ],
  '13': [
    { codigo: '27', nombre: 'Morazán Norte' },
    { codigo: '28', nombre: 'Morazán Sur' },
  ],
  '14': [
    { codigo: '19', nombre: 'La Unión Norte' },
    { codigo: '20', nombre: 'La Unión Sur' },
  ],
}

// Helpers
export const getMunicipios  = (codDep) => MUNICIPIOS[codDep] || []
export const getNombreDep   = (codigo) => DEPARTAMENTOS.find(d => d.codigo === codigo)?.nombre || ''
export const getNombreMun   = (codDep, codMun) => getMunicipios(codDep).find(m => m.codigo === codMun)?.nombre || ''
