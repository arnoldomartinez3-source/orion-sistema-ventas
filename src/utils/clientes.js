import { buildComplemento } from '../data/departamentosMunicipios'

// Datos y validaciones del CLIENTE, compartidos por la pantalla Clientes y el POS
// (ventana "Configurar DTE"). El formulario visual está en components/FormCliente.jsx.

export const CLIENTE_VACIO = { nombre: '', tipo: 'Natural', nit: '', dui: '', nrc: '', email: '', telefono: '', codDep: '', codMun: '', distrito: '', codDistrito: '', complemento: '', codActividad: '', descActividad: '', agenteRetencion: false, mayorista: false }

// Helpers para validar formato salvadoreño
const limpiarDoc = (v) => (v || '').replace(/[-\s]/g, '').trim()
// El MH acepta NIT de 14 dígitos (formato viejo) o de 9 dígitos (homologado al DUI)
const esNITValido = (nit) => /^(\d{9}|\d{14})$/.test(limpiarDoc(nit))
const esDUIValido = (dui) => /^\d{9}$/.test(limpiarDoc(dui))

/**
 * Revisa el cliente antes de guardarlo. Devuelve { titulo, mensaje } o null si está bien.
 * paraCcf: además exige lo que el MH pide en el receptor de un CCF.
 */
export function validarCliente(form, { paraCcf = false } = {}) {
  if (!form.nombre?.trim()) return { titulo: 'Campos requeridos', mensaje: 'El nombre o razón social es obligatorio.' }
  // Para Jurídico, NIT obligatorio. Para Natural, al menos uno de NIT o DUI.
  if (form.tipo === 'Jurídico') {
    if (!form.nit) return { titulo: 'NIT requerido', mensaje: 'Los clientes Jurídicos requieren NIT obligatoriamente.' }
    if (!esNITValido(form.nit)) return { titulo: 'Formato de NIT inválido', mensaje: 'El NIT debe tener 14 dígitos (ej: 0614-010190-101-3) o 9 dígitos (homologado al DUI).' }
  } else {
    if (!form.nit && !form.dui) return { titulo: 'Documento requerido', mensaje: 'Los clientes Naturales requieren DUI o NIT (uno de los dos).' }
    if (form.nit && !esNITValido(form.nit)) return { titulo: 'Formato de NIT inválido', mensaje: 'El NIT debe tener 14 o 9 dígitos. Si solo tienes DUI, deja el NIT vacío.' }
    if (form.dui && !esDUIValido(form.dui)) return { titulo: 'Formato de DUI inválido', mensaje: 'El DUI debe tener 9 dígitos. Formato esperado: 12345678-9' }
  }
  if (form.nrc && (!form.codActividad || !form.descActividad)) {
    return { titulo: 'Actividad Económica requerida', mensaje: 'Para clientes con NRC (CCF), la actividad económica es obligatoria y debe seleccionarse del catálogo del MH.' }
  }
  if (paraCcf) {
    const faltan = []
    if (!form.nit) faltan.push('NIT')
    if (!form.nrc) faltan.push('NRC')
    if (!form.codActividad) faltan.push('Actividad económica')
    if (!form.codDep) faltan.push('Departamento')
    if (!form.codMun) faltan.push('Municipio')
    if (!form.complemento?.trim()) faltan.push('Dirección')
    if (faltan.length) return { titulo: 'Faltan datos para el CCF', mensaje: 'El Crédito Fiscal requiere: ' + faltan.join(', ') + '.' }
  }
  return null
}

// Datos listos para guardar en 'clientes' (sin empresaId ni fechas).
export function datosCliente(form) {
  const { id: _id, ...resto } = form
  return { ...CLIENTE_VACIO, ...resto, nombre: form.nombre.trim(), direccion: buildComplemento(form.distrito, form.complemento) }
}
