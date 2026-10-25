// Cálculo INDEPENDIENTE (sin usar el código de la app) de los totales de un período, para conciliar con Reportes/Dashboard/Caja.
// Uso: node scripts/pruebas-demo/calculo-independiente.mjs <empresaId> <YYYY-MM-DD desde> <YYYY-MM-DD hasta>
import admin from 'firebase-admin'
admin.initializeApp({ credential: admin.credential.applicationDefault() })
const db = admin.firestore()
const [E, D, H] = process.argv.slice(2)
const r2 = (n) => Math.round(n * 100) / 100
const fechaSV = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const todas = (await db.collection('ventas').where('empresaId', '==', E).get()).docs.map(d => ({ id: d.id, ...d.data() }))
const enPer = todas.filter(v => { const f = v.createdAt?.toDate ? fechaSV(v.createdAt.toDate()) : String(v.fechaEmision || '').slice(0, 10); return f >= D && f <= H })
const anulada = (v) => v.anulada === true || v.estado === 'anulada' || v.estadoPago === 'anulada' || v.dte_estado_invalidacion === 'INVALIDADO' || ['ANULADO', 'INVALIDADO'].includes(v.dte_estado)
const dev = (v) => v.tipoDte === 'NC' || v.tipoDte === 'Retorno'
const canje = (v) => v.tipoDte === 'CANJE'
let ventasBrutas = 0, devoluciones = 0, nVentas = 0, nDev = 0, nAnul = 0, nCanje = 0
const medios = { efectivo: 0, tarjeta: 0, transferencia: 0, cheque: 0, credito: 0, giftcard: 0 }
const porDia = {}, porVendedor = {}
for (const v of enPer) {
  if (anulada(v)) { nAnul++; continue }
  if (canje(v)) { nCanje++; continue }
  const total = Number(v.totalPagar ?? v.total) || 0
  if (dev(v)) { devoluciones += total; nDev++; continue }
  ventasBrutas += total; nVentas++
  const f = v.createdAt?.toDate ? fechaSV(v.createdAt.toDate()) : ''; porDia[f] = r2((porDia[f] || 0) + total)
  const vend = v.cobradoPor || v.vendedor || v.cajero || '?'; porVendedor[vend] = r2((porVendedor[vend] || 0) + total)
  const gift = Number(v.pagoGiftCard) || 0; medios.giftcard += gift
  const cobrado = total + (Number(v.redondeo) || 0) - gift
  if (cobrado <= 0) continue
  if (v.tipoPago === 'credito' || v.formaPago === 'credito') { medios.credito += cobrado; continue }
  const fp = v.formaPago || 'efectivo'
  if (fp === 'mixto' && Array.isArray(v.pagosDesglose)) v.pagosDesglose.forEach(p => { medios[p.metodo] = (medios[p.metodo] || 0) + (Number(p.monto) || 0) })
  else medios[fp] = (medios[fp] || 0) + cobrado
}
const neto = r2(ventasBrutas - devoluciones)
console.log(JSON.stringify({ periodo: [D, H], docs: enPer.length, ventas: nVentas, anuladas: nAnul, devoluciones: nDev, canjes: nCanje, ventasBrutas: r2(ventasBrutas), devolucionesMonto: r2(devoluciones), ventasNetas: neto, medios: Object.fromEntries(Object.entries(medios).map(([k, v]) => [k, r2(v)])), porDia, porVendedor }, null, 1))
