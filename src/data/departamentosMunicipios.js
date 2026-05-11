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

// Array con distritos (uso interno ORIÓN)
export const departamentosMunicipios = [
  { codigo: '00', nombre: 'Otro (Extranjero)', municipios: [] },
  { codigo: '01', nombre: 'Ahuachapán', municipios: [
    { codigo: '13', nombre: 'Ahuachapán Norte', distritos: ['Atiquizaya','El Refugio','San Lorenzo','Turín'] },
    { codigo: '14', nombre: 'Ahuachapán Centro', distritos: ['Ahuachapán','Apaneca','Concepción de Ataco','Tacuba'] },
    { codigo: '15', nombre: 'Ahuachapán Sur', distritos: ['Guaymango','Jujutla','San Francisco Menéndez','San Pedro Puxtla'] },
  ]},
  { codigo: '02', nombre: 'Santa Ana', municipios: [
    { codigo: '14', nombre: 'Santa Ana Norte', distritos: ['Masahuat','Metapán','Santa Rosa Guachipilín','Texistepeque'] },
    { codigo: '15', nombre: 'Santa Ana Centro', distritos: ['Santa Ana'] },
    { codigo: '16', nombre: 'Santa Ana Este', distritos: ['Coatepeque','El Congo'] },
    { codigo: '17', nombre: 'Santa Ana Oeste', distritos: ['Candelaria de la Frontera','Chalchuapa','El Porvenir','San Antonio Pajonal','San Sebastián Salitrillo','Santiago de la Frontera'] },
  ]},
  { codigo: '03', nombre: 'Sonsonate', municipios: [
    { codigo: '17', nombre: 'Sonsonate Norte', distritos: ['Juayúa','Nahuizalco','Salcoatitán','Santa Catarina Masahuat'] },
    { codigo: '18', nombre: 'Sonsonate Centro', distritos: ['Sonsonate','Sonzacate','Nahulingo','San Antonio del Monte','Santo Domingo de Guzmán'] },
    { codigo: '19', nombre: 'Sonsonate Este', distritos: ['Izalco','Armenia','Caluco','San Julián','Cuisnahuat','Santa Isabel Ishuatán'] },
    { codigo: '20', nombre: 'Sonsonate Oeste', distritos: ['Acajutla'] },
  ]},
  { codigo: '04', nombre: 'Chalatenango', municipios: [
    { codigo: '34', nombre: 'Chalatenango Norte', distritos: ['La Palma','Citalá','San Ignacio'] },
    { codigo: '35', nombre: 'Chalatenango Centro', distritos: ['Nueva Concepción','Tejutla','La Reina','Agua Caliente','Dulce Nombre de María','El Paraíso','San Fernando','San Francisco Morazán','San Rafael','Santa Rita'] },
    { codigo: '36', nombre: 'Chalatenango Sur', distritos: ['Chalatenango','Arcatao','Azacualpa','Comalapa','Concepción Quezaltepeque','El Carrizal','La Laguna','Las Vueltas','Nombre de Jesús','Nueva Trinidad','Ojos de Agua','Potonico','San Antonio de la Cruz','San Antonio Los Ranchos','San Francisco Lempa','San Isidro Labrador','San José Cancasque','San José Las Flores','San Luis del Carmen','San Miguel de Mercedes'] },
  ]},
  { codigo: '05', nombre: 'La Libertad', municipios: [
    { codigo: '23', nombre: 'La Libertad Norte', distritos: ['Quezaltepeque','San Matías','San Pablo Tacachico'] },
    { codigo: '24', nombre: 'La Libertad Centro', distritos: ['San Juan Opico','Ciudad Arce'] },
    { codigo: '25', nombre: 'La Libertad Oeste', distritos: ['Colón','Jayaque','Sacacoyo','Tepecoyo','Talnique'] },
    { codigo: '26', nombre: 'La Libertad Este', distritos: ['Antiguo Cuscatlán','Huizúcar','Nuevo Cuscatlán','San José Villanueva','Zaragoza'] },
    { codigo: '27', nombre: 'La Libertad Costa', distritos: ['Chiltiupán','Jicalapa','La Libertad','Tamanique','Teotepeque'] },
    { codigo: '28', nombre: 'La Libertad Sur', distritos: ['Comasagua','Santa Tecla'] },
  ]},
  { codigo: '06', nombre: 'San Salvador', municipios: [
    { codigo: '20', nombre: 'San Salvador Norte', distritos: ['Aguilares','El Paisnal','Guazapa'] },
    { codigo: '21', nombre: 'San Salvador Oeste', distritos: ['Apopa','Nejapa'] },
    { codigo: '22', nombre: 'San Salvador Este', distritos: ['Ilopango','San Martín','Soyapango','Tonacatepeque'] },
    { codigo: '23', nombre: 'San Salvador Centro', distritos: ['Ayutuxtepeque','Mejicanos','San Salvador','Cuscatancingo','Ciudad Delgado'] },
    { codigo: '24', nombre: 'San Salvador Sur', distritos: ['Panchimalco','Rosario de Mora','San Marcos','Santo Tomás','Santiago Texacuangos'] },
  ]},
  { codigo: '07', nombre: 'Cuscatlán', municipios: [
    { codigo: '17', nombre: 'Cuscatlán Norte', distritos: ['Suchitoto','San José Guayabal','Oratorio de Concepción','San Bartolomé Perulapía','San Pedro Perulapán'] },
    { codigo: '18', nombre: 'Cuscatlán Sur', distritos: ['Cojutepeque','San Rafael Cedros','Candelaria','Monte San Juan','El Carmen','San Cristóbal','Santa Cruz Michapa','San Ramón','El Rosario','Santa Cruz Analquito','Tenancingo'] },
  ]},
  { codigo: '08', nombre: 'La Paz', municipios: [
    { codigo: '23', nombre: 'La Paz Oeste', distritos: ['Cuyultitán','Olocuilta','San Juan Talpa','San Luis Talpa','San Pedro Masahuat','Tapalhuaca','San Francisco Chinameca'] },
    { codigo: '24', nombre: 'La Paz Centro', distritos: ['El Rosario','Jerusalén','Mercedes La Ceiba','Paraíso de Osorio','San Antonio Masahuat','San Emigdio','San Juan Tepezontes','San Luis La Herradura','San Miguel Tepezontes','San Pedro Nonualco','Santa María Ostuma','Santiago Nonualco'] },
    { codigo: '25', nombre: 'La Paz Este', distritos: ['San Juan Nonualco','San Rafael Obrajuelo','Zacatecoluca'] },
  ]},
  { codigo: '09', nombre: 'Cabañas', municipios: [
    { codigo: '10', nombre: 'Cabañas Oeste', distritos: ['Ilobasco','Tejutepeque','Jutiapa','Cinquera'] },
    { codigo: '11', nombre: 'Cabañas Este', distritos: ['Sensuntepeque','Victoria','Dolores','Guacotecti','San Isidro'] },
  ]},
  { codigo: '10', nombre: 'San Vicente', municipios: [
    { codigo: '14', nombre: 'San Vicente Norte', distritos: ['Apastepeque','Santa Clara','San Ildefonso','San Esteban Catarina','San Sebastián','San Lorenzo','Santo Domingo'] },
    { codigo: '15', nombre: 'San Vicente Sur', distritos: ['San Vicente','Guadalupe','Verapaz','Tepetitán','Tecoluca','San Cayetano Istepeque'] },
  ]},
  { codigo: '11', nombre: 'Usulután', municipios: [
    { codigo: '24', nombre: 'Usulután Norte', distritos: ['Santiago de María','Alegría','Berlín','Mercedes Umaña','Jucuapa','El Triunfo','Estanzuelas','San Buenaventura','Nueva Granada'] },
    { codigo: '25', nombre: 'Usulután Este', distritos: ['Usulután','Jucuarán','San Dionisio','Concepción Batres','Santa María','Ozatlán','Tecapán','Santa Elena','California','Ereguayquín'] },
    { codigo: '26', nombre: 'Usulután Oeste', distritos: ['Jiquilisco','Puerto El Triunfo','San Agustín','San Francisco Javier'] },
  ]},
  { codigo: '12', nombre: 'San Miguel', municipios: [
    { codigo: '21', nombre: 'San Miguel Norte', distritos: ['Ciudad Barrios','Sesori','Nuevo Edén de San Juan','San Gerardo','San Luis de la Reina','Carolina','San Antonio del Mosco','Chapeltique'] },
    { codigo: '22', nombre: 'San Miguel Centro', distritos: ['San Miguel','Comacarán','Uluazapa','Moncagua','Quelepa','Chirilagua'] },
    { codigo: '23', nombre: 'San Miguel Oeste', distritos: ['Chinameca','Nueva Guadalupe','Lolotique','San Jorge','San Rafael Oriente','El Tránsito'] },
  ]},
  { codigo: '13', nombre: 'Morazán', municipios: [
    { codigo: '27', nombre: 'Morazán Norte', distritos: ['Arambala','Cacaopera','Corinto','El Rosario','Joateca','Jocoaitique','Meanguera','Perquín','San Fernando','San Isidro','Torola'] },
    { codigo: '28', nombre: 'Morazán Sur', distritos: ['Chilanga','Delicias de Concepción','El Divisadero','Gualococti','Guatajiagua','Jocoro','Lolotiquillo','Osicala','San Carlos','San Francisco Gotera','San Simón','Sensembra','Sociedad','Yamabal','Yoloaiquín'] },
  ]},
  { codigo: '14', nombre: 'La Unión', municipios: [
    { codigo: '19', nombre: 'La Unión Norte', distritos: ['Anamorós','Bolívar','Concepción de Oriente','El Sauce','Lislique','Nueva Esparta','Pasaquina','Polorós','San José La Fuente','Santa Rosa de Lima'] },
    { codigo: '20', nombre: 'La Unión Sur', distritos: ['Conchagua','El Carmen','Intipucá','La Unión','Meanguera del Golfo','San Alejo','Yayantique','Yucuaiquín'] },
  ]},
]

export const getDistritos = (codDep, codMun) =>
  departamentosMunicipios.find(d => d.codigo === codDep)
    ?.municipios.find(m => m.codigo === codMun)
    ?.distritos || []

export const buildComplemento = (distrito, complementoAdicional) => {
  const partes = []
  if (distrito?.trim()) partes.push('DISTRITO DE ' + distrito.trim().toUpperCase())
  if (complementoAdicional?.trim()) partes.push(complementoAdicional.trim())
  return partes.join(', ')
}