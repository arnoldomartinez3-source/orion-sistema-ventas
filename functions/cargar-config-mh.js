// ══════════════════════════════════════════════════════════════
// cargar-config-mh — carga la config del emisor + los secretos MH
//
// Los datos NO sensibles (NIT, nombre, códigos MH del emisor, mh_ambiente…)
// viven en 'configuracion/{empresaId}' (legibles por la empresa).
// Los SECRETOS (mh_usuario, mh_password, certificado_pem, certificado_password)
// viven en 'secretos_mh/{empresaId}', que en las reglas está bloqueado a todo el
// cliente (read/write:false) — SOLO el backend (Admin SDK) los lee acá.
//
// Compatibilidad: si una empresa aún no fue migrada y sus secretos siguen en
// 'configuracion', igual funciona (se fusionan y 'secretos_mh' tiene prioridad).
// Así el despliegue no rompe la firma; la migración se hace al tocar el modal MH.
// ══════════════════════════════════════════════════════════════

// Devuelve el objeto fusionado { ...configuracion, ...secretos_mh } o null si no
// hay credenciales (mh_usuario) por ningún lado.
export async function cargarConfigMH(db, empresaId) {
  if (!empresaId) return null
  const [cfgDoc, secDoc] = await Promise.all([
    db.collection('configuracion').doc(empresaId).get(),
    db.collection('secretos_mh').doc(empresaId).get(),
  ])
  const cfg = cfgDoc.exists ? cfgDoc.data() : {}
  const sec = secDoc.exists ? secDoc.data() : {}
  const merged = { ...cfg, ...sec } // los secretos_mh pisan a los legacy de configuracion
  return merged.mh_usuario ? merged : null
}
