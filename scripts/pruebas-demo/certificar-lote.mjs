// Pruebas de certificación en LOTE contra el MH de pruebas (ambiente 00), sin navegador.
// Hace lo mismo que el Asistente de Certificación: crea la venta de prueba en `ventas`
// (_certificacion=true) y llama a /api/dte/transmitir con un ID token del usuario maestro.
//
// Uso (con GOOGLE_APPLICATION_CREDENTIALS apuntando a la llave de servicio):
//   node scripts/pruebas-demo/certificar-lote.mjs <empresaId> "FE=90,CCF=75,NC=50,ND=25,NR=50,FSE=25,CR=50,ERET=5,EI=5"
//   (las metas son TOTALES de procesadas; el script transmite solo lo que falte; NC/ND generan su CCF)
//   SOLO_UNA=1 → una sola transmisión del primer tipo (humo).  PAUSA_MS=300 entre llamadas.
import fs from 'node:fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { generarVentaFE, generarVentaCCF, generarVentaNC, generarVentaND, generarVentaFSE, generarVentaNR, generarVentaRetencion, generarVentaRetorno } from '../../src/data/datosPrueba.js'

const [empresaId, metasTxt = 'FE=90,CCF=75,NC=50,ND=25'] = process.argv.slice(2)
if (!empresaId) { console.error('falta empresaId'); process.exit(1) }
const METAS = Object.fromEntries(metasTxt.split(',').filter(Boolean).map(p => { const [k, v] = p.split('='); return [k.trim().toUpperCase(), parseInt(v) || 0] }))
const PAUSA = parseInt(process.env.PAUSA_MS || '300')
const SOLO_UNA = process.env.SOLO_UNA === '1'
const MAESTRO = 'arnoldomartinez3@gmail.com'
const BASE = 'https://app.orionsv.net'
const log = (...a) => { const s = a.join(' '); console.log(new Date().toLocaleTimeString('es-SV'), s); fs.appendFileSync('certificar-lote.log', new Date().toISOString() + ' ' + s + '\n') }

initializeApp({ credential: applicationDefault() }); const db = getFirestore()

// ── token del maestro: custom token → ID token (y refresco) ──
const apiKey = (() => {
  const f = fs.readdirSync('dist/assets').find(n => /^index-.*\.js$/.test(n))
  const m = fs.readFileSync('dist/assets/' + f, 'utf8').match(/AIza[0-9A-Za-z_-]{30,}/)
  if (!m) throw new Error('No encontré la API key web en dist/assets (corre npm run build)')
  return m[0]
})()
const maestro = await getAuth().getUserByEmail(MAESTRO)
let tok = null
async function token() {
  if (tok && Date.now() - tok.en < 50 * 60 * 1000) return tok.id
  const custom = await getAuth().createCustomToken(maestro.uid)
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true }) })
  const j = await r.json(); if (!j.idToken) throw new Error('No pude obtener ID token: ' + JSON.stringify(j).slice(0, 200))
  tok = { id: j.idToken, en: Date.now() }; return tok.id
}
async function api(ruta, body) {
  const r = await fetch(BASE + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + await token() }, body: JSON.stringify(body) })
  const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = { error: 'respuesta no JSON: ' + t.slice(0, 160) } }
  return { ok: r.ok, status: r.status, ...j }
}

// ── contribuyentes reales para CCF / NC / ND / CR / NR ──
const contribuyentes = (await db.collection('contribuyentes_prueba').get()).docs.map(d => d.data())
const cliPrueba = (await db.collection('clientes').where('empresaId', '==', empresaId).where('nit', '==', '11260405261018').get()).docs[0]?.data()
if (cliPrueba) contribuyentes.unshift({ nombre: cliPrueba.nombre, nit: cliPrueba.nit, nrc: cliPrueba.nrc, codActividad: cliPrueba.codActividad, descActividad: cliPrueba.descActividad, nombreComercial: cliPrueba.nombre, codDep: cliPrueba.codDep, codMun: cliPrueba.codMun, codDistrito: cliPrueba.codDistrito, direccion: cliPrueba.direccion, telefono: cliPrueba.telefono, correo: cliPrueba.email })
// SOLO_NIT=1: solo contribuyentes con NIT de 14 dígitos (los de DUI como documento los rechaza la NR:
// "receptor/tipoDocumento no permitido", "nrc inválido")
if (process.env.SOLO_NIT === '1') { const f = contribuyentes.filter(c => String(c.nit || '').replace(/-/g, '').length === 14); contribuyentes.length = 0; contribuyentes.push(...f) }
if (!contribuyentes.length) throw new Error('Sin contribuyentes de prueba')
let idxContrib = 0
const contrib = () => contribuyentes[(idxContrib++) % contribuyentes.length]

// ── estado actual ──
const aFechaISO = (f) => { const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' }); if (!f || typeof f !== 'string') return hoy; if (/^\d{4}-\d{2}-\d{2}/.test(f)) return f.slice(0, 10); const m = f.match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : hoy }
// Cuenta TODO lo procesado por el MH de pruebas para la empresa (ventas + operaciones, con o sin
// _certificacion): el portal del MH cuenta lo recibido bajo el NIT, no solo lo del Asistente.
async function conteos() {
  const c = {}
  for (const col of ['ventas', 'operaciones']) {
    const s = await db.collection(col).where('empresaId', '==', empresaId).where('dte_estado', '==', 'PROCESADO').get()
    s.docs.forEach(d => { const v = d.data(); if (v.dte_ambiente && v.dte_ambiente !== '00') return; const t = String(v.tipoDte || '').toUpperCase(); const k = t === 'RETENCION' ? 'CR' : t === 'RETORNO' ? 'ERET' : t; c[k] = (c[k] || 0) + 1; if (v.dte_estado_invalidacion === 'INVALIDADO') c.EI = (c.EI || 0) + 1 })
  }
  // invalidaciones también quedan en facturas
  const f = await db.collection('facturas').where('empresaId', '==', empresaId).where('dte_estado_invalidacion', '==', 'INVALIDADO').get()
  c.EI = Math.max(c.EI || 0, f.size)
  return c
}

// ── transmitir una venta de prueba ──
async function transmitir(venta, tipo) {
  // EXENTO=1: la venta va como EXENTA de IVA (cliente con resolución) para probar ventaExenta/totalExenta
  const extra = process.env.EXENTO === '1' ? { exentoIva: true, resolucionExencion: 'RES-PRUEBA-001' } : {}
  const ref = await db.collection('ventas').add({ ...venta, ...extra, _esPrueba: true, _certificacion: true, empresaId, cajero: 'Certificación (script)', cajeroId: maestro.uid, estado: 'completada', createdAt: FieldValue.serverTimestamp() })
  const d = await api('/api/dte/transmitir', { ventaId: ref.id, ambiente: '00' })
  const estado = d.estado || (d.ok ? 'PROCESADO' : 'RECHAZADO')
  const msg = d.detalleMH?.descripcionMsg || d.descripcionMsg || d.observaciones || d.error || ''
  log(`${tipo} ${estado} ${d.numeroControl || ''} ${estado === 'PROCESADO' ? '' : '→ ' + String(Array.isArray(msg) ? msg.join('; ') : msg).slice(0, 160)}`)
  return { ok: estado === 'PROCESADO', ventaId: ref.id, data: d, venta }
}
const pausa = () => new Promise(r => setTimeout(r, PAUSA))

let fallosSeguidos = 0
const fallo = (r) => { if (r.ok) { fallosSeguidos = 0; return false } fallosSeguidos++; if (fallosSeguidos >= 3) { log('DETENIDO: 3 rechazos seguidos'); return true } return false }

async function lote(tipo, faltan) {
  log(`== ${tipo}: faltan ${faltan}`)
  for (let i = 0; i < faltan; i++) {
    let r
    if (tipo === 'FE') r = await transmitir(generarVentaFE(), 'FE')
    else if (tipo === 'CCF') r = await transmitir(generarVentaCCF(contrib()), 'CCF')
    else if (tipo === 'NR') r = await transmitir(generarVentaNR(contrib()), 'NR')
    else if (tipo === 'FSE') r = await transmitir(generarVentaFSE(), 'FSE')
    else if (tipo === 'CR') r = await transmitir(generarVentaRetencion(contrib()), 'CR')
    else if (tipo === 'NC' || tipo === 'ND') {
      const c = contrib(); const ccf = await transmitir(generarVentaCCF(c), 'CCF'); if (fallo(ccf)) return; if (!ccf.ok) { await pausa(); continue }
      await pausa()
      const ref = { codigoGeneracion: ccf.venta.codigoGeneracion, fechaEmision: aFechaISO(ccf.data.fhProcesamiento), contribuyente: c, items: ccf.venta.items }
      r = await transmitir(tipo === 'NC' ? generarVentaNC(ref) : generarVentaND(ref), tipo)
    } else if (tipo === 'ERET') {
      const fe = await transmitir(generarVentaFE(), 'FE'); if (fallo(fe)) return; if (!fe.ok) { await pausa(); continue }
      await pausa()
      r = await transmitir(generarVentaRetorno({ codigoGeneracion: fe.venta.codigoGeneracion, fechaEmision: aFechaISO(fe.data.fhProcesamiento), items: fe.venta.items, cliente: fe.venta.cliente, total: fe.data.totalPagar || fe.venta.total || null }), 'ERET')
    } else if (tipo === 'EI') {
      // invalidar una FE de prueba procesada y no invalidada (hoy, tipo 2 = rescindir)
      const s = await db.collection('ventas').where('empresaId', '==', empresaId).where('tipoDte', '==', 'FE').where('dte_estado', '==', 'PROCESADO').get()
      const cand = s.docs.find(d => !d.data().dte_estado_invalidacion && d.data().codigoGeneracion)
      if (!cand) { log('EI: no hay FE procesada sin invalidar'); return }
      const f = (await db.collection('facturas').where('empresaId', '==', empresaId).where('codigoGeneracion', '==', cand.data().codigoGeneracion).get()).docs[0]
      if (!f) { log('EI: la FE ' + cand.id + ' no tiene doc en facturas; se marca para no reintentar'); await cand.ref.update({ dte_estado_invalidacion: 'SIN_FACTURA' }); continue }
      const d = await api('/api/dte/invalidar', { facturaId: f.id, tipoAnulacion: 2, motivoAnulacion: 'Prueba de certificación', ambiente: '00' })
      const ok = d.ok && (d.estado === 'PROCESADO' || d.estado === 'INVALIDADO' || d.dte_estado_invalidacion === 'INVALIDADO')
      if (!ok) await cand.ref.update({ dte_estado_invalidacion: 'ERROR_PRUEBA' })
      log(`EI ${ok ? 'INVALIDADO' : 'RECHAZADO'} ${f.data().numeroControl || ''} ${ok ? '' : '→ ' + String(d.detalleMH?.descripcionMsg || d.descripcionMsg || d.error || '').slice(0, 160)}`)
      r = { ok }
    } else { log('tipo no soportado: ' + tipo); return }
    if (fallo(r)) return
    if (SOLO_UNA) return
    await pausa()
  }
}

const antes = await conteos(); log('antes:', JSON.stringify(antes))
for (const [tipo, meta] of Object.entries(METAS)) {
  const ya = antes[tipo] || 0
  if (meta > ya) { await lote(tipo, meta - ya); if (SOLO_UNA) break; if (fallosSeguidos >= 3) break }
  else log(`== ${tipo}: meta ${meta} ya cumplida (${ya})`)
}
log('después:', JSON.stringify(await conteos()))
