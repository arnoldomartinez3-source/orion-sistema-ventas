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

// Array con distritos + CÓDIGOS oficiales CAT-008 (uso para DTE V2.0)
// Cada distrito: { nombre, codigo } — el código viene del catálogo oficial MH (CAT-008).
export const departamentosMunicipios = [
  { codigo: '00', nombre: 'Otro (Extranjero)', municipios: [] },
  { codigo: '01', nombre: 'Ahuachapán', municipios: [
    { codigo: '13', nombre: 'Ahuachapán Norte', distritos: [{ nombre: 'Atiquizaya', codigo: '03' }, { nombre: 'El Refugio', codigo: '05' }, { nombre: 'San Lorenzo', codigo: '09' }, { nombre: 'Turín', codigo: '12' }] },
    { codigo: '14', nombre: 'Ahuachapán Centro', distritos: [{ nombre: 'Ahuachapán', codigo: '01' }, { nombre: 'Apaneca', codigo: '02' }, { nombre: 'Concepción de Ataco', codigo: '04' }, { nombre: 'Tacuba', codigo: '11' }] },
    { codigo: '15', nombre: 'Ahuachapán Sur', distritos: [{ nombre: 'Guaymango', codigo: '06' }, { nombre: 'Jujutla', codigo: '07' }, { nombre: 'San Francisco Menéndez', codigo: '08' }, { nombre: 'San Pedro Puxtla', codigo: '10' }] },
  ]},
  { codigo: '02', nombre: 'Santa Ana', municipios: [
    { codigo: '14', nombre: 'Santa Ana Norte', distritos: [{ nombre: 'Masahuat', codigo: '06' }, { nombre: 'Metapán', codigo: '07' }, { nombre: 'Santa Rosa Guachipilín', codigo: '11' }, { nombre: 'Texistepeque', codigo: '13' }] },
    { codigo: '15', nombre: 'Santa Ana Centro', distritos: [{ nombre: 'Santa Ana', codigo: '10' }] },
    { codigo: '16', nombre: 'Santa Ana Este', distritos: [{ nombre: 'Coatepeque', codigo: '02' }, { nombre: 'El Congo', codigo: '04' }] },
    { codigo: '17', nombre: 'Santa Ana Oeste', distritos: [{ nombre: 'Candelaria de la Frontera', codigo: '01' }, { nombre: 'Chalchuapa', codigo: '03' }, { nombre: 'El Porvenir', codigo: '05' }, { nombre: 'San Antonio Pajonal', codigo: '08' }, { nombre: 'San Sebastián Salitrillo', codigo: '09' }, { nombre: 'Santiago de la Frontera', codigo: '12' }] },
  ]},
  { codigo: '03', nombre: 'Sonsonate', municipios: [
    { codigo: '17', nombre: 'Sonsonate Norte', distritos: [{ nombre: 'Juayúa', codigo: '07' }, { nombre: 'Nahuizalco', codigo: '08' }, { nombre: 'Salcoatitán', codigo: '10' }, { nombre: 'Santa Catarina Masahuat', codigo: '13' }] },
    { codigo: '18', nombre: 'Sonsonate Centro', distritos: [{ nombre: 'Sonsonate', codigo: '15' }, { nombre: 'Sonzacate', codigo: '16' }, { nombre: 'Nahulingo', codigo: '09' }, { nombre: 'San Antonio del Monte', codigo: '11' }, { nombre: 'Santo Domingo de Guzmán', codigo: '14' }] },
    { codigo: '19', nombre: 'Sonsonate Este', distritos: [{ nombre: 'Izalco', codigo: '06' }, { nombre: 'Armenia', codigo: '02' }, { nombre: 'Caluco', codigo: '03' }, { nombre: 'San Julián', codigo: '12' }, { nombre: 'Cuisnahuat', codigo: '04' }, { nombre: 'Santa Isabel Ishuatán', codigo: '05' }] },
    { codigo: '20', nombre: 'Sonsonate Oeste', distritos: [{ nombre: 'Acajutla', codigo: '01' }] },
  ]},
  { codigo: '04', nombre: 'Chalatenango', municipios: [
    { codigo: '34', nombre: 'Chalatenango Norte', distritos: [{ nombre: 'La Palma', codigo: '12' }, { nombre: 'Citalá', codigo: '04' }, { nombre: 'San Ignacio', codigo: '25' }] },
    { codigo: '35', nombre: 'Chalatenango Centro', distritos: [{ nombre: 'Nueva Concepción', codigo: '16' }, { nombre: 'Tejutla', codigo: '33' }, { nombre: 'La Reina', codigo: '13' }, { nombre: 'Agua Caliente', codigo: '01' }, { nombre: 'Dulce Nombre de María', codigo: '08' }, { nombre: 'El Paraíso', codigo: '10' }, { nombre: 'San Fernando', codigo: '22' }, { nombre: 'San Francisco Morazán', codigo: '24' }, { nombre: 'San Rafael', codigo: '31' }, { nombre: 'Santa Rita', codigo: '32' }] },
    { codigo: '36', nombre: 'Chalatenango Sur', distritos: [{ nombre: 'Chalatenango', codigo: '07' }, { nombre: 'Arcatao', codigo: '02' }, { nombre: 'Azacualpa', codigo: '03' }, { nombre: 'Comalapa', codigo: '05' }, { nombre: 'Concepción Quezaltepeque', codigo: '06' }, { nombre: 'El Carrizal', codigo: '09' }, { nombre: 'La Laguna', codigo: '11' }, { nombre: 'Las Vueltas', codigo: '14' }, { nombre: 'Nombre de Jesús', codigo: '15' }, { nombre: 'Nueva Trinidad', codigo: '17' }, { nombre: 'Ojos de Agua', codigo: '18' }, { nombre: 'Potonico', codigo: '19' }, { nombre: 'San Antonio de la Cruz', codigo: '20' }, { nombre: 'San Antonio Los Ranchos', codigo: '21' }, { nombre: 'San Francisco Lempa', codigo: '23' }, { nombre: 'San Isidro Labrador', codigo: '26' }, { nombre: 'San José Cancasque', codigo: '27' }, { nombre: 'San José Las Flores', codigo: '28' }, { nombre: 'San Luis del Carmen', codigo: '29' }, { nombre: 'San Miguel de Mercedes', codigo: '30' }] },
  ]},
  { codigo: '05', nombre: 'La Libertad', municipios: [
    { codigo: '23', nombre: 'La Libertad Norte', distritos: [{ nombre: 'Quezaltepeque', codigo: '12' }, { nombre: 'San Matías', codigo: '16' }, { nombre: 'San Pablo Tacachico', codigo: '17' }] },
    { codigo: '24', nombre: 'La Libertad Centro', distritos: [{ nombre: 'San Juan Opico', codigo: '15' }, { nombre: 'Ciudad Arce', codigo: '02' }] },
    { codigo: '25', nombre: 'La Libertad Oeste', distritos: [{ nombre: 'Colón', codigo: '03' }, { nombre: 'Jayaque', codigo: '07' }, { nombre: 'Sacacoyo', codigo: '13' }, { nombre: 'Tepecoyo', codigo: '21' }, { nombre: 'Talnique', codigo: '19' }] },
    { codigo: '26', nombre: 'La Libertad Este', distritos: [{ nombre: 'Antiguo Cuscatlán', codigo: '01' }, { nombre: 'Huizúcar', codigo: '06' }, { nombre: 'Nuevo Cuscatlán', codigo: '10' }, { nombre: 'San José Villanueva', codigo: '14' }, { nombre: 'Zaragoza', codigo: '22' }] },
    { codigo: '27', nombre: 'La Libertad Costa', distritos: [{ nombre: 'Chiltiupán', codigo: '05' }, { nombre: 'Jicalapa', codigo: '08' }, { nombre: 'La Libertad', codigo: '09' }, { nombre: 'Tamanique', codigo: '18' }, { nombre: 'Teotepeque', codigo: '20' }] },
    { codigo: '28', nombre: 'La Libertad Sur', distritos: [{ nombre: 'Comasagua', codigo: '04' }, { nombre: 'Santa Tecla', codigo: '11' }] },
  ]},
  { codigo: '06', nombre: 'San Salvador', municipios: [
    { codigo: '20', nombre: 'San Salvador Norte', distritos: [{ nombre: 'Aguilares', codigo: '01' }, { nombre: 'El Paisnal', codigo: '05' }, { nombre: 'Guazapa', codigo: '06' }] },
    { codigo: '21', nombre: 'San Salvador Oeste', distritos: [{ nombre: 'Apopa', codigo: '02' }, { nombre: 'Nejapa', codigo: '09' }] },
    { codigo: '22', nombre: 'San Salvador Este', distritos: [{ nombre: 'Ilopango', codigo: '07' }, { nombre: 'San Martín', codigo: '13' }, { nombre: 'Soyapango', codigo: '17' }, { nombre: 'Tonacatepeque', codigo: '18' }] },
    { codigo: '23', nombre: 'San Salvador Centro', distritos: [{ nombre: 'Ayutuxtepeque', codigo: '03' }, { nombre: 'Mejicanos', codigo: '08' }, { nombre: 'San Salvador', codigo: '14' }, { nombre: 'Cuscatancingo', codigo: '04' }, { nombre: 'Ciudad Delgado', codigo: '19' }] },
    { codigo: '24', nombre: 'San Salvador Sur', distritos: [{ nombre: 'Panchimalco', codigo: '10' }, { nombre: 'Rosario de Mora', codigo: '11' }, { nombre: 'San Marcos', codigo: '12' }, { nombre: 'Santo Tomás', codigo: '16' }, { nombre: 'Santiago Texacuangos', codigo: '15' }] },
  ]},
  { codigo: '07', nombre: 'Cuscatlán', municipios: [
    { codigo: '17', nombre: 'Cuscatlán Norte', distritos: [{ nombre: 'Suchitoto', codigo: '15' }, { nombre: 'San José Guayabal', codigo: '09' }, { nombre: 'Oratorio de Concepción', codigo: '06' }, { nombre: 'San Bartolomé Perulapía', codigo: '07' }, { nombre: 'San Pedro Perulapán', codigo: '10' }] },
    { codigo: '18', nombre: 'Cuscatlán Sur', distritos: [{ nombre: 'Cojutepeque', codigo: '02' }, { nombre: 'San Rafael Cedros', codigo: '11' }, { nombre: 'Candelaria', codigo: '01' }, { nombre: 'Monte San Juan', codigo: '05' }, { nombre: 'El Carmen', codigo: '03' }, { nombre: 'San Cristóbal', codigo: '08' }, { nombre: 'Santa Cruz Michapa', codigo: '14' }, { nombre: 'San Ramón', codigo: '12' }, { nombre: 'El Rosario', codigo: '04' }, { nombre: 'Santa Cruz Analquito', codigo: '13' }, { nombre: 'Tenancingo', codigo: '16' }] },
  ]},
  { codigo: '08', nombre: 'La Paz', municipios: [
    { codigo: '23', nombre: 'La Paz Oeste', distritos: [{ nombre: 'Cuyultitán', codigo: '01' }, { nombre: 'Olocuilta', codigo: '05' }, { nombre: 'San Juan Talpa', codigo: '11' }, { nombre: 'San Luis Talpa', codigo: '13' }, { nombre: 'San Pedro Masahuat', codigo: '15' }, { nombre: 'Tapalhuaca', codigo: '20' }, { nombre: 'San Francisco Chinameca', codigo: '09' }] },
    { codigo: '24', nombre: 'La Paz Centro', distritos: [{ nombre: 'El Rosario', codigo: '02' }, { nombre: 'Jerusalén', codigo: '03' }, { nombre: 'Mercedes La Ceiba', codigo: '04' }, { nombre: 'Paraíso de Osorio', codigo: '06' }, { nombre: 'San Antonio Masahuat', codigo: '07' }, { nombre: 'San Emigdio', codigo: '08' }, { nombre: 'San Juan Tepezontes', codigo: '12' }, { nombre: 'San Luis La Herradura', codigo: '22' }, { nombre: 'San Miguel Tepezontes', codigo: '14' }, { nombre: 'San Pedro Nonualco', codigo: '16' }, { nombre: 'Santa María Ostuma', codigo: '18' }, { nombre: 'Santiago Nonualco', codigo: '19' }] },
    { codigo: '25', nombre: 'La Paz Este', distritos: [{ nombre: 'San Juan Nonualco', codigo: '10' }, { nombre: 'San Rafael Obrajuelo', codigo: '17' }, { nombre: 'Zacatecoluca', codigo: '21' }] },
  ]},
  { codigo: '09', nombre: 'Cabañas', municipios: [
    { codigo: '10', nombre: 'Cabañas Oeste', distritos: [{ nombre: 'Ilobasco', codigo: '03' }, { nombre: 'Tejutepeque', codigo: '07' }, { nombre: 'Jutiapa', codigo: '04' }, { nombre: 'Cinquera', codigo: '01' }] },
    { codigo: '11', nombre: 'Cabañas Este', distritos: [{ nombre: 'Sensuntepeque', codigo: '06' }, { nombre: 'Victoria', codigo: '08' }, { nombre: 'Dolores', codigo: '09' }, { nombre: 'Guacotecti', codigo: '02' }, { nombre: 'San Isidro', codigo: '05' }] },
  ]},
  { codigo: '10', nombre: 'San Vicente', municipios: [
    { codigo: '14', nombre: 'San Vicente Norte', distritos: [{ nombre: 'Apastepeque', codigo: '01' }, { nombre: 'Santa Clara', codigo: '04' }, { nombre: 'San Ildefonso', codigo: '07' }, { nombre: 'San Esteban Catarina', codigo: '06' }, { nombre: 'San Sebastián', codigo: '09' }, { nombre: 'San Lorenzo', codigo: '08' }, { nombre: 'Santo Domingo', codigo: '05' }] },
    { codigo: '15', nombre: 'San Vicente Sur', distritos: [{ nombre: 'San Vicente', codigo: '10' }, { nombre: 'Guadalupe', codigo: '02' }, { nombre: 'Verapaz', codigo: '13' }, { nombre: 'Tepetitán', codigo: '12' }, { nombre: 'Tecoluca', codigo: '11' }, { nombre: 'San Cayetano Istepeque', codigo: '03' }] },
  ]},
  { codigo: '11', nombre: 'Usulután', municipios: [
    { codigo: '24', nombre: 'Usulután Norte', distritos: [{ nombre: 'Santiago de María', codigo: '21' }, { nombre: 'Alegría', codigo: '01' }, { nombre: 'Berlín', codigo: '02' }, { nombre: 'Mercedes Umaña', codigo: '11' }, { nombre: 'Jucuapa', codigo: '09' }, { nombre: 'El Triunfo', codigo: '05' }, { nombre: 'Estanzuelas', codigo: '07' }, { nombre: 'San Buenaventura', codigo: '16' }, { nombre: 'Nueva Granada', codigo: '12' }] },
    { codigo: '25', nombre: 'Usulután Este', distritos: [{ nombre: 'Usulután', codigo: '23' }, { nombre: 'Jucuarán', codigo: '10' }, { nombre: 'San Dionisio', codigo: '17' }, { nombre: 'Concepción Batres', codigo: '04' }, { nombre: 'Santa María', codigo: '20' }, { nombre: 'Ozatlán', codigo: '13' }, { nombre: 'Tecapán', codigo: '22' }, { nombre: 'Santa Elena', codigo: '18' }, { nombre: 'California', codigo: '03' }, { nombre: 'Ereguayquín', codigo: '06' }] },
    { codigo: '26', nombre: 'Usulután Oeste', distritos: [{ nombre: 'Jiquilisco', codigo: '08' }, { nombre: 'Puerto El Triunfo', codigo: '14' }, { nombre: 'San Agustín', codigo: '15' }, { nombre: 'San Francisco Javier', codigo: '19' }] },
  ]},
  { codigo: '12', nombre: 'San Miguel', municipios: [
    { codigo: '21', nombre: 'San Miguel Norte', distritos: [{ nombre: 'Ciudad Barrios', codigo: '02' }, { nombre: 'Sesori', codigo: '19' }, { nombre: 'Nuevo Edén de San Juan', codigo: '11' }, { nombre: 'San Gerardo', codigo: '14' }, { nombre: 'San Luis de la Reina', codigo: '16' }, { nombre: 'Carolina', codigo: '01' }, { nombre: 'San Antonio del Mosco', codigo: '13' }, { nombre: 'Chapeltique', codigo: '04' }] },
    { codigo: '22', nombre: 'San Miguel Centro', distritos: [{ nombre: 'San Miguel', codigo: '17' }, { nombre: 'Comacarán', codigo: '03' }, { nombre: 'Uluazapa', codigo: '20' }, { nombre: 'Moncagua', codigo: '09' }, { nombre: 'Quelepa', codigo: '12' }, { nombre: 'Chirilagua', codigo: '06' }] },
    { codigo: '23', nombre: 'San Miguel Oeste', distritos: [{ nombre: 'Chinameca', codigo: '05' }, { nombre: 'Nueva Guadalupe', codigo: '10' }, { nombre: 'Lolotique', codigo: '08' }, { nombre: 'San Jorge', codigo: '15' }, { nombre: 'San Rafael Oriente', codigo: '18' }, { nombre: 'El Tránsito', codigo: '07' }] },
  ]},
  { codigo: '13', nombre: 'Morazán', municipios: [
    { codigo: '27', nombre: 'Morazán Norte', distritos: [{ nombre: 'Arambala', codigo: '01' }, { nombre: 'Cacaopera', codigo: '02' }, { nombre: 'Corinto', codigo: '03' }, { nombre: 'El Rosario', codigo: '07' }, { nombre: 'Joateca', codigo: '10' }, { nombre: 'Jocoaitique', codigo: '11' }, { nombre: 'Meanguera', codigo: '14' }, { nombre: 'Perquín', codigo: '16' }, { nombre: 'San Fernando', codigo: '18' }, { nombre: 'San Isidro', codigo: '20' }, { nombre: 'Torola', codigo: '24' }] },
    { codigo: '28', nombre: 'Morazán Sur', distritos: [{ nombre: 'Chilanga', codigo: '04' }, { nombre: 'Delicias de Concepción', codigo: '05' }, { nombre: 'El Divisadero', codigo: '06' }, { nombre: 'Gualococti', codigo: '08' }, { nombre: 'Guatajiagua', codigo: '09' }, { nombre: 'Jocoro', codigo: '12' }, { nombre: 'Lolotiquillo', codigo: '13' }, { nombre: 'Osicala', codigo: '15' }, { nombre: 'San Carlos', codigo: '17' }, { nombre: 'San Francisco Gotera', codigo: '19' }, { nombre: 'San Simón', codigo: '21' }, { nombre: 'Sensembra', codigo: '22' }, { nombre: 'Sociedad', codigo: '23' }, { nombre: 'Yamabal', codigo: '25' }, { nombre: 'Yoloaiquín', codigo: '26' }] },
  ]},
  { codigo: '14', nombre: 'La Unión', municipios: [
    { codigo: '19', nombre: 'La Unión Norte', distritos: [{ nombre: 'Anamorós', codigo: '01' }, { nombre: 'Bolívar', codigo: '02' }, { nombre: 'Concepción de Oriente', codigo: '03' }, { nombre: 'El Sauce', codigo: '06' }, { nombre: 'Lislique', codigo: '09' }, { nombre: 'Nueva Esparta', codigo: '11' }, { nombre: 'Pasaquina', codigo: '12' }, { nombre: 'Polorós', codigo: '13' }, { nombre: 'San José La Fuente', codigo: '15' }, { nombre: 'Santa Rosa de Lima', codigo: '16' }] },
    { codigo: '20', nombre: 'La Unión Sur', distritos: [{ nombre: 'Conchagua', codigo: '04' }, { nombre: 'El Carmen', codigo: '05' }, { nombre: 'Intipucá', codigo: '07' }, { nombre: 'La Unión', codigo: '08' }, { nombre: 'Meanguera del Golfo', codigo: '10' }, { nombre: 'San Alejo', codigo: '14' }, { nombre: 'Yayantique', codigo: '17' }, { nombre: 'Yucuaiquín', codigo: '18' }] },
  ]},
]

export const getDistritos = (codDep, codMun) =>
  departamentosMunicipios.find(d => d.codigo === codDep)
    ?.municipios.find(m => m.codigo === codMun)
    ?.distritos || []

// Devuelve el CÓDIGO oficial CAT-008 de un distrito por su nombre (dentro de dep+mun)
export const getCodigoDistrito = (codDep, codMun, nombreDistrito) => {
  const lista = getDistritos(codDep, codMun)
  const d = lista.find(x => (typeof x === 'string' ? x : x.nombre) === nombreDistrito)
  return d && typeof d === 'object' ? d.codigo : null
}

export const buildComplemento = (distrito, complementoAdicional) => {
  const partes = []
  if (distrito?.trim()) partes.push('DISTRITO DE ' + distrito.trim().toUpperCase())
  if (complementoAdicional?.trim()) partes.push(complementoAdicional.trim())
  return partes.join(', ')
}