// ══════════════════════════════════════════════════════════════════
// GIFT CARDS (módulo 'gift_cards') — Etapa 1
//
// • Vender: se hace en la CAJA como una venta normal (línea "Gift card $X") para
//   que salga su DTE y el dinero entre al corte. Desde aquí solo se prepara
//   (monto, para quién) y se manda al Punto de Venta.
// • Consultar saldo, ver canjes, imprimir el código y anular (nunca se borra).
// • Canjear: en el Punto de Venta, campo "Gift card" al cobrar. El canje entrega
//   mercadería y descarga inventario SIN DTE; si la compra supera el saldo, la
//   diferencia se cobra aparte con su DTE. (Regla del contador, 2026-10-19.)
// ══════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'
import { orionAlert, orionConfirm } from '../orionDialog'
import { imprimirGiftCard } from '../utils/giftcards'
import { estilosIdentidad } from '../estilos-identidad'

const fmt = (n) => '$' + (Number(n) || 0).toFixed(2)
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

const estilos = `
  .gc-wrap { max-width: 1100px; }
  .gc-grid { display: grid; grid-template-columns: 1fr 1.8fr; gap: 18px; align-items: start; }
  @media (max-width: 900px) { .gc-grid { grid-template-columns: 1fr; } }
  .gc-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 14px; padding: 18px; }
  .gc-card h3 { margin: 0 0 12px; font-size: 15px; }
  .gc-montos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
  .gc-montos button { font: inherit; font-weight: 800; font-family: var(--mono); padding: 9px 4px; border-radius: 9px; border: 1.5px solid var(--border); background: var(--surface2); color: var(--text); cursor: pointer; }
  .gc-montos button.on { border-color: var(--accent); color: var(--accent); background: var(--glow); }
  .gc-lista { display: flex; flex-direction: column; gap: 8px; }
  .gc-item { display: grid; grid-template-columns: 1fr auto; gap: 8px 14px; align-items: center; padding: 10px 14px; border: 1.5px solid var(--border); border-radius: 12px; background: var(--surface); cursor: pointer; }
  .gc-item:hover { border-color: var(--accent); }
  .gc-item .cod { font-family: var(--mono); font-weight: 800; font-size: 14px; }
  .gc-item .meta { font-size: 12px; color: var(--muted); }
  .gc-item .saldo { font-family: var(--mono); font-weight: 900; font-size: 18px; text-align: right; }
  .gc-item .saldo small { display: block; font-size: 10px; color: var(--muted); font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
  .gc-canjes { margin-top: 10px; border-top: 1px solid var(--border); padding-top: 8px; font-size: 12.5px; }
  .gc-canjes div { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; }
  .gc-regla { font-size: 12px; color: var(--muted); border-left: 3px solid var(--accent3, #C19A2E); padding: 6px 10px; margin-top: 12px; }
`

export default function GiftCards() {
  const { puede, esAdmin, empresaId, userName, userId } = usePermisos()
  const navigate = useNavigate()
  const [tarjetas, setTarjetas] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [monto, setMonto] = useState('')
  const [para, setPara] = useState('')
  const [busq, setBusq] = useState('')
  const [filtro, setFiltro] = useState('activa')
  const [abierta, setAbierta] = useState(null)
  const [nombreEmpresa, setNombreEmpresa] = useState('')

  useEffect(() => {
    if (!empresaId) return
    const u1 = onSnapshot(query(collection(db, 'giftcards'), where('empresaId', '==', empresaId)), s =>
      setTarjetas(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0))), () => {})
    const u2 = onSnapshot(query(collection(db, 'sucursales'), where('empresaId', '==', empresaId)), s => setSucursales(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {})
    const u3 = onSnapshot(doc(db, 'configuracion', empresaId), s => setNombreEmpresa(s.data()?.nombreComercial || s.data()?.empresaNombre || ''), () => {})
    return () => { u1(); u2(); u3() }
  }, [empresaId])

  const nombreSuc = (id) => sucursales.find(s => s.id === id)?.nombre || ''
  const fecha = (f) => f?.toDate?.() ? f.toDate().toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' }) : (f ? new Date(f).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' }) : '')

  // La venta real ocurre en la caja (DTE + dinero al corte): aquí solo se prepara la línea
  const venderEnCaja = () => {
    const m = r2(monto)
    if (!(m > 0)) { orionAlert('Escribí el monto de la gift card.', { tipo: 'warning' }); return }
    if (m > 5000) { orionAlert('Monto demasiado alto. Máximo $5,000.', { tipo: 'warning' }); return }
    navigate('/ventas', { state: { giftCard: { monto: m, para: para.trim() } } })
  }

  const anular = async (t) => {
    if (!(await orionConfirm(`¿Anular la gift card ${t.codigo}? Su saldo de ${fmt(t.saldo)} ya no se podrá usar. Queda registrada como anulada.`, { tipo: 'warning', okLabel: 'Anular' }))) return
    try {
      await updateDoc(doc(db, 'giftcards', t.id), { estado: 'anulada', anuladaPor: userName || '', anuladaPorId: userId || '', anuladaEn: serverTimestamp() })
      setAbierta(null)
    } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
  }

  const lista = useMemo(() => tarjetas.filter(t => {
    if (filtro !== 'todas' && t.estado !== filtro) return false
    const q = busq.trim().toUpperCase()
    return !q || t.codigo.includes(q) || (t.para || '').toUpperCase().includes(q) || (t.vendidaPor || '').toUpperCase().includes(q) || (t.numeroDte || '').toUpperCase().includes(q)
  }), [tarjetas, filtro, busq])
  const activas = tarjetas.filter(t => t.estado === 'activa')
  const saldoVivo = r2(activas.reduce((s, t) => s + (Number(t.saldo) || 0), 0))
  const vendidoMes = r2(tarjetas.filter(t => { const f = t.creadoEn?.toDate?.(); const h = new Date(); return f && f.getMonth() === h.getMonth() && f.getFullYear() === h.getFullYear() && t.estado !== 'anulada' }).reduce((s, t) => s + (Number(t.monto) || 0), 0))
  const puedeVender = puede('realizar_ventas') || esAdmin

  return (
    <>
      <style>{estilosIdentidad}{estilos}</style>
      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">Gift cards</div>
          <div className="page-sub">Se venden en la caja con su factura; se usan como pago en cualquier sucursal.</div>
        </div>
      </div>
      <div className="id-franja">
        <div className="id-fr"><div className="id-fr-et">Activas</div><div className="id-fr-val">{activas.length}</div></div>
        <div className="id-fr"><div className="id-fr-et">Saldo por canjear</div><div className="id-fr-val">{fmt(saldoVivo)}</div><div className="id-fr-sub">mercadería que se debe entregar</div></div>
        <div className="id-fr"><div className="id-fr-et">Vendido este mes</div><div className="id-fr-val">{fmt(vendidoMes)}</div></div>
        <div className="id-fr"><div className="id-fr-et">Canjeadas por completo</div><div className="id-fr-val">{tarjetas.filter(t => t.estado === 'agotada').length}</div></div>
      </div>

      <div className="gc-wrap gc-grid">
        <div className="gc-card">
          <h3>Vender una gift card</h3>
          {!puedeVender ? <div className="id-vacio">Tu usuario no puede vender gift cards.</div> : (<>
            <div className="form-label">Monto</div>
            <div className="gc-montos">
              {[10, 20, 25, 50, 75, 100, 150, 200].map(v => <button key={v} type="button" className={r2(monto) === v ? 'on' : ''} onClick={() => setMonto(String(v))}>${v}</button>)}
            </div>
            <input className="input" type="number" min="1" step="0.01" placeholder="Otro monto" value={monto} onChange={e => setMonto(e.target.value)} style={{ marginBottom: 10 }} />
            <div className="form-group"><label className="form-label">Para (opcional)</label><input className="input" placeholder="Nombre de quien la recibe" value={para} onChange={e => setPara(e.target.value)} /></div>
            <button className="btn btn-primary" style={{ width: '100%', padding: '12px 0', fontSize: 15 }} onClick={venderEnCaja} disabled={!(r2(monto) > 0)}>Cobrar en la caja {r2(monto) > 0 ? fmt(monto) : ''}</button>
            <div className="gc-regla">La tarjeta se cobra en la caja como una venta normal, con su factura electrónica. Al terminar el cobro aparece el código para entregarlo o imprimirlo.</div>
            <div className="gc-regla">Al canjearla, el cliente se lleva la mercadería sin nueva factura; si la compra supera el saldo, la diferencia se cobra aparte.</div>
          </>)}
        </div>

        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <div className="id-seg">
              {[['activa', 'Activas'], ['agotada', 'Canjeadas'], ['anulada', 'Anuladas'], ['todas', 'Todas']].map(([k, l]) => <button key={k} type="button" className={filtro === k ? 'activa' : ''} onClick={() => setFiltro(k)}>{l}</button>)}
            </div>
            <input className="input" style={{ maxWidth: 260, marginLeft: 'auto' }} placeholder="Buscar código, nombre o DTE" value={busq} onChange={e => setBusq(e.target.value)} />
          </div>
          {lista.length === 0 ? <div className="id-vacio">{tarjetas.length ? 'Nada con ese filtro.' : 'Todavía no se ha vendido ninguna gift card.'}</div> : (
            <div className="gc-lista">
              {lista.map(t => (
                <div key={t.id} className="gc-item" onClick={() => setAbierta(abierta?.id === t.id ? null : t)}>
                  <div>
                    <div className="cod">{t.codigo} <span className={`status-pill ${t.estado === 'activa' ? 'activo' : t.estado === 'agotada' ? 'bajo' : 'agotado'}`} style={{ marginLeft: 8 }}><span className="dot"/>{t.estado === 'activa' ? 'Activa' : t.estado === 'agotada' ? 'Canjeada' : 'Anulada'}</span></div>
                    <div className="meta">{fecha(t.creadoEn)} · {t.sucursalNombre || nombreSuc(t.sucursalId) || 'sin sucursal'} · {t.vendidaPor}{t.para ? ` · para ${t.para}` : ''}{t.numeroDte ? ` · ${t.numeroDte}` : ''}</div>
                  </div>
                  <div className="saldo"><small>saldo</small>{fmt(t.saldo)}<small style={{ marginTop: 2 }}>de {fmt(t.monto)}</small></div>
                  {abierta?.id === t.id && (
                    <div style={{ gridColumn: '1 / -1' }} onClick={e => e.stopPropagation()}>
                      <div className="gc-canjes">
                        {(t.canjes || []).length === 0 ? <div style={{ color: 'var(--muted)' }}>Sin canjes todavía.</div>
                          : t.canjes.map((c, i) => <div key={i}><span>{fecha(c.fecha)} · {c.sucursalNombre || nombreSuc(c.sucursalId)} · {c.por}{c.numero ? ` · ${c.numero}` : ''}</span><b className="mono">−{fmt(c.monto)}</b></div>)}
                        {t.estado === 'anulada' && <div style={{ color: '#ef4444' }}><span>Anulada por {t.anuladaPor}</span><span>{fecha(t.anuladaEn)}</span></div>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => imprimirGiftCard(t, nombreEmpresa)}>Imprimir</button>
                        {t.estado === 'activa' && puedeVender && <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }} onClick={() => anular(t)}>Anular</button>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
