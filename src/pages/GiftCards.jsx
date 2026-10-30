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
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, getDocs, limit, writeBatch } from 'firebase/firestore'
import { usePermisos } from '../PermisosContext'
import { orionAlert, orionConfirm } from '../orionDialog'
import { imprimirGiftCard, imprimirEtiquetaGift, imprimirEtiquetasLote, generarCodigoGift, idGift, normalizarCodigoPreimpreso, estadoVisible, textoVence } from '../utils/giftcards'
import ModalGiftCard from '../components/ModalGiftCard'
import { estilosIdentidad } from '../estilos-identidad'

const fmt = (n) => '$' + (Number(n) || 0).toFixed(2)
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

const estilos = `
  .gc-wrap { max-width: 1100px; }
  .gc-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 14px; padding: 18px; }
  .gc-card h3 { margin: 0 0 12px; font-size: 15px; }
  .gc-montos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
  .gc-acciones { display: flex; gap: 8px; flex-wrap: wrap; }
  .gc-modal-sub { font-size: 12.5px; color: var(--muted); line-height: 1.45; margin: -6px 0 14px; }
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
  const { puede, esAdmin, empresaId, userName, userId, rol } = usePermisos()
  // Cajeras: solo venden y consultan UNA tarjeta por su código (saldo y vencimiento); la lista completa,
  // los totales y los lotes son de encargadas y administración.
  const esCajera = !esAdmin && (rol === 'cajero' || rol === 'vendedor')
  const navigate = useNavigate()
  const [tarjetas, setTarjetas] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [monto, setMonto] = useState('')
  const [para, setPara] = useState('')
  const [de, setDe] = useState('')
  const [busq, setBusq] = useState('')
  const [filtro, setFiltro] = useState('activa')
  const [abierta, setAbierta] = useState(null)
  const [empresa, setEmpresa] = useState({})
  const [codigoFisico, setCodigoFisico] = useState('')
  const [tarjetaDigital, setTarjetaDigital] = useState(null)
  const [preparando, setPreparando] = useState(false)
  const [modalLote, setModalLote] = useState(null) // { cantidad, monto, nombre }
  const [modalVenta, setModalVenta] = useState(false) // ventana "Vender gift card"
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    if (!empresaId) return
    const u1 = onSnapshot(query(collection(db, 'giftcards'), where('empresaId', '==', empresaId)), s =>
      setTarjetas(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0))), () => {})
    const u2 = onSnapshot(query(collection(db, 'sucursales'), where('empresaId', '==', empresaId)), s => setSucursales(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {})
    const u3 = onSnapshot(doc(db, 'configuracion', empresaId), s => setEmpresa(s.data() || {}), () => {})
    return () => { u1(); u2(); u3() }
  }, [empresaId])

  const nombreSuc = (id) => sucursales.find(s => s.id === id)?.nombre || ''
  const fecha = (f) => f?.toDate?.() ? f.toDate().toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' }) : (f ? new Date(f).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' }) : '')

  // La venta real ocurre en la caja (DTE + dinero al corte): aquí solo se prepara la línea
  const venderEnCaja = async () => {
    let m = r2(monto)
    // Tarjeta física con código: puede ser una tarjeta de un LOTE (sin vender → se activa al cobrar) o un
    // código preimpreso nuevo (no debe existir). La caja lo vuelve a comprobar dentro de la transacción.
    let codigo = '', activar = false
    if (codigoFisico.trim()) {
      codigo = normalizarCodigoPreimpreso(codigoFisico)
      if (!codigo) { orionAlert('El código de la tarjeta solo puede llevar letras, números y guiones (4 a 24 caracteres).', { tipo: 'warning' }); return }
      setPreparando(true)
      try {
        const ya = await getDocs(query(collection(db, 'giftcards'), where('empresaId', '==', empresaId), where('codigo', '==', codigo), limit(1)))
        if (!ya.empty) {
          const d = ya.docs[0].data()
          if (d.estado !== 'sin_vender') { orionAlert('La tarjeta ' + codigo + ' ya está registrada (' + { activa: 'activa', agotada: 'canjeada', anulada: 'anulada' }[d.estado] + '). Revisá el código o usá otra tarjeta.', { tipo: 'warning' }); setPreparando(false); return }
          activar = true
          if (Number(d.monto) > 0) {
            if (m > 0 && r2(d.monto) !== m) { orionAlert('Esa tarjeta es de un lote de ' + fmt(d.monto) + '. Se cobra por ese monto.', { tipo: 'info' }) }
            m = r2(d.monto)
          }
        }
      } catch (e) { orionAlert('No se pudo comprobar el código: ' + e.message, { tipo: 'error' }); setPreparando(false); return }
      setPreparando(false)
    }
    if (!(m > 0)) { orionAlert('Escribí el monto de la gift card.', { tipo: 'warning' }); return }
    if (m > 5000) { orionAlert('Monto demasiado alto. Máximo $5,000.', { tipo: 'warning' }); return }
    navigate('/ventas', { state: { giftCard: { monto: m, para: para.trim(), de: de.trim(), codigo, activar } } })
  }

  // LOTE: tarjetas "sin vender" con código ya asignado, para imprimir las etiquetas por adelantado (impresora de
  // etiquetas en casa o en una sucursal), pegarlas en las tarjetas físicas y repartirlas. Se activan al cobrarlas.
  const generarLote = async () => {
    const n = parseInt(modalLote?.cantidad)
    const m = r2(modalLote?.monto)
    if (!(n >= 1 && n <= 300)) { orionAlert('La cantidad debe estar entre 1 y 300.', { tipo: 'warning' }); return }
    if (modalLote?.monto && !(m > 0 && m <= 5000)) { orionAlert('El monto del lote no es válido (dejalo vacío para monto abierto).', { tipo: 'warning' }); return }
    setGenerando(true)
    try {
      const lote = 'L-' + Date.now().toString(36).toUpperCase().slice(-6)
      const existentes = new Set(tarjetas.map(t => t.codigo))
      const codigos = new Set()
      while (codigos.size < n) { const c = generarCodigoGift(); if (!existentes.has(c)) codigos.add(c) }
      const batch = writeBatch(db)
      for (const codigo of codigos) {
        batch.set(doc(db, 'giftcards', idGift(empresaId, codigo)), { empresaId, codigo, monto: m > 0 ? m : 0, saldo: 0, estado: 'sin_vender', lote, loteNombre: (modalLote?.nombre || '').trim(), para: '', de: '', nota: '', canjes: [], creadoEn: serverTimestamp(), creadoPor: userName || '', creadoPorId: userId || '' })
      }
      await batch.commit()
      setModalLote(null); setFiltro('sin_vender'); setBusq(lote)
      orionAlert(n + ' tarjetas del lote ' + lote + ' quedaron registradas sin vender. Usá "Imprimir etiquetas" para sacarlas en la impresora de etiquetas.', { titulo: 'Lote generado', tipo: 'success' })
    } catch (e) { orionAlert('No se pudo generar el lote: ' + e.message, { tipo: 'error' }) }
    setGenerando(false)
  }

  const anular = async (t) => {
    const msg = t.estado === 'sin_vender' ? `¿Anular la tarjeta ${t.codigo} del lote? Ya no se podrá vender (por ejemplo, si se perdió la etiqueta).` : `¿Anular la gift card ${t.codigo}? Su saldo de ${fmt(t.saldo)} ya no se podrá usar. Queda registrada como anulada.`
    if (!(await orionConfirm(msg, { tipo: 'warning', okLabel: 'Anular' }))) return
    try {
      await updateDoc(doc(db, 'giftcards', t.id), { estado: 'anulada', anuladaPor: userName || '', anuladaPorId: userId || '', anuladaEn: serverTimestamp() })
      setAbierta(null)
    } catch (e) { orionAlert('Error: ' + e.message, { tipo: 'error' }) }
  }

  const lista = useMemo(() => tarjetas.filter(t => {
    if (!esCajera && filtro !== 'todas' && estadoVisible(t) !== filtro) return false
    const q = busq.trim().toUpperCase()
    if (esCajera && q.length < 3) return false
    return !q || t.codigo.includes(q) || (t.lote || '').toUpperCase().includes(q) || (t.para || '').toUpperCase().includes(q) || (t.vendidaPor || '').toUpperCase().includes(q) || (t.numeroDte || '').toUpperCase().includes(q)
  }), [tarjetas, filtro, busq, esCajera])
  const activas = tarjetas.filter(t => estadoVisible(t) === 'activa')
  const vencidas = tarjetas.filter(t => estadoVisible(t) === 'vencida')
  const sinVender = tarjetas.filter(t => t.estado === 'sin_vender')
  // Lotes con tarjetas sin vender (para imprimir sus etiquetas de una vez)
  const lotes = useMemo(() => { const m = new Map(); for (const t of sinVender) { if (!t.lote) continue; if (!m.has(t.lote)) m.set(t.lote, { lote: t.lote, nombre: t.loteNombre || '', monto: t.monto, tarjetas: [] }); m.get(t.lote).tarjetas.push(t) } return [...m.values()] }, [sinVender])
  const vigenciaMeses = parseInt(empresa.giftVigenciaMeses ?? 12) || 0
  const saldoVivo = r2(activas.reduce((s, t) => s + (Number(t.saldo) || 0), 0))
  const vendidoMes = r2(tarjetas.filter(t => { const f = (t.vendidaEn || t.creadoEn)?.toDate?.(); const h = new Date(); return f && f.getMonth() === h.getMonth() && f.getFullYear() === h.getFullYear() && t.estado !== 'anulada' && t.estado !== 'sin_vender' }).reduce((s, t) => s + (Number(t.monto) || 0), 0))
  const puedeVender = puede('realizar_ventas') || esAdmin

  return (
    <>
      <style>{estilosIdentidad}{estilos}</style>
      {tarjetaDigital && <ModalGiftCard tarjeta={tarjetaDigital} empresa={empresa} onClose={() => setTarjetaDigital(null)} />}
      {modalVenta && (
        <div className="modal-overlay" style={{ zIndex: 10001 }} onClick={() => !preparando && setModalVenta(false)} onKeyDown={e => { if (e.key === 'Escape' && !preparando) setModalVenta(false) }}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>Vender gift card</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => setModalVenta(false)}>Cerrar</button></div>
            <div className="gc-modal-sub">Se cobra en la caja como una venta normal, con su factura. Al terminar el cobro aparece el código para entregarlo, imprimirlo o mandarlo por WhatsApp.</div>
            <div className="form-label">Monto</div>
            <div className="gc-montos">
              {[10, 20, 25, 50, 75, 100, 150, 200].map(v => <button key={v} type="button" className={r2(monto) === v ? 'on' : ''} onClick={() => setMonto(String(v))}>${v}</button>)}
            </div>
            <input className="input" type="number" min="1" step="0.01" placeholder="Otro monto" value={monto} onChange={e => setMonto(e.target.value)} style={{ marginBottom: 10 }} autoFocus />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="form-group"><label className="form-label">Para (opcional)</label><input className="input" placeholder="Quien la recibe" value={para} onChange={e => setPara(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">De (opcional)</label><input className="input" placeholder="Quien la regala" value={de} onChange={e => setDe(e.target.value)} /></div>
            </div>
            <div className="form-group"><label className="form-label">Tarjeta física con código impreso (opcional)</label>
              <input className="input" placeholder="Escaneá o escribí el código de la tarjeta" style={{ fontFamily: 'var(--mono)', textTransform: 'uppercase' }} value={codigoFisico} onChange={e => setCodigoFisico(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') venderEnCaja() }} />
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>Si se deja vacío, ORIÓN genera el código. Si es una tarjeta de un lote, se activa al cobrarla.</div></div>
            <button className="btn btn-primary" style={{ width: '100%', padding: '12px 0', fontSize: 15 }} onClick={venderEnCaja} disabled={(!(r2(monto) > 0) && !codigoFisico.trim()) || preparando}>{preparando ? 'Comprobando…' : 'Cobrar en la caja ' + (r2(monto) > 0 ? fmt(monto) : '')}</button>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, textAlign: 'center' }}>{vigenciaMeses > 0 ? 'Vigencia: ' + vigenciaMeses + ' meses desde la venta' : 'Sin vencimiento'} · Al canjearla no hay nueva factura; si la compra supera el saldo, la diferencia se cobra aparte.</div>
          </div>
        </div>
      )}
      {modalLote && (
        <div className="modal-overlay" style={{ zIndex: 10001 }} onClick={() => !generando && setModalLote(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ marginBottom: 6 }}>Generar lote de códigos</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.45, marginBottom: 14 }}>Códigos por adelantado para imprimir las etiquetas con QR, pegarlas en las tarjetas físicas y repartirlas a las sucursales. No valen hasta que se cobran en la caja.</div>
            <div className="form-group"><label className="form-label">Cantidad de tarjetas</label><input className="input" type="number" min="1" max="300" value={modalLote.cantidad} onChange={e => setModalLote({ ...modalLote, cantidad: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Monto fijo (opcional)</label><input className="input" type="number" min="1" step="0.01" placeholder="Vacío = el monto se pone al vender" value={modalLote.monto} onChange={e => setModalLote({ ...modalLote, monto: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Nombre del lote (opcional)</label><input className="input" maxLength={40} placeholder="Ej. Navidad 2026" value={modalLote.nombre} onChange={e => setModalLote({ ...modalLote, nombre: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} disabled={generando} onClick={() => setModalLote(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={generando} onClick={generarLote}>{generando ? 'Generando…' : 'Generar lote'}</button>
            </div>
          </div>
        </div>
      )}
      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">Gift cards</div>
          <div className="page-sub">Se venden en la caja con su factura; se usan como pago en cualquier sucursal.</div>
        </div>
        {puedeVender && (
          <div className="gc-acciones">
            {!esCajera && <button className="btn btn-ghost" title="Códigos por adelantado para imprimir etiquetas y pegarlas en las tarjetas físicas" onClick={() => setModalLote({ cantidad: '50', monto: '', nombre: '' })}>Generar lote</button>}
            <button className="btn btn-primary" onClick={() => setModalVenta(true)}>+ Vender gift card</button>
          </div>
        )}
      </div>
      {!esCajera && <div className="id-franja">
        <div className="id-fr"><div className="id-fr-et">Activas</div><div className="id-fr-val">{activas.length}</div>{sinVender.length > 0 && <div className="id-fr-sub">{sinVender.length} sin vender (lotes)</div>}</div>
        <div className="id-fr"><div className="id-fr-et">Saldo por canjear</div><div className="id-fr-val">{fmt(saldoVivo)}</div><div className="id-fr-sub">mercadería que se debe entregar</div></div>
        <div className="id-fr"><div className="id-fr-et">Vendido este mes</div><div className="id-fr-val">{fmt(vendidoMes)}</div></div>
        <div className="id-fr"><div className="id-fr-et">Canjeadas por completo</div><div className="id-fr-val">{tarjetas.filter(t => t.estado === 'agotada').length}</div>{vencidas.length > 0 && <div className="id-fr-sub">{vencidas.length} vencida{vencidas.length === 1 ? '' : 's'} con saldo</div>}</div>
      </div>}

      <div className="gc-wrap">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            {!esCajera && <div className="id-seg">
              {[['activa', 'Activas'], ['sin_vender', 'Sin vender'], ['vencida', 'Vencidas'], ['agotada', 'Canjeadas'], ['anulada', 'Anuladas'], ['todas', 'Todas']].map(([k, l]) => <button key={k} type="button" className={filtro === k ? 'activa' : ''} onClick={() => setFiltro(k)}>{l}</button>)}
            </div>}
            <input className="input" style={{ maxWidth: esCajera ? 420 : 260, marginLeft: esCajera ? 0 : 'auto' }} placeholder={esCajera ? 'Escaneá o escribí el código de la tarjeta' : 'Buscar código, nombre o DTE'} value={busq} onChange={e => setBusq(e.target.value)} />
          </div>
          {filtro === 'sin_vender' && lotes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {lotes.map(l => (
                <div key={l.lote} className="gc-item" style={{ cursor: 'default', background: 'var(--surface2)' }}>
                  <div><div className="cod">Lote {l.lote}{l.nombre ? ' · ' + l.nombre : ''}</div><div className="meta">{l.tarjetas.length} sin vender · {Number(l.monto) > 0 ? fmt(l.monto) + ' cada una' : 'monto abierto'}</div></div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setBusq(l.lote)}>Ver</button>
                    <button className="btn btn-primary btn-sm" onClick={() => imprimirEtiquetasLote(l.tarjetas, empresa)}>Imprimir etiquetas ({l.tarjetas.length})</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {lista.length === 0 ? <div className="id-vacio">{esCajera ? 'Escaneá o escribí el código de la tarjeta para ver su saldo y vencimiento.' : (tarjetas.length ? 'Nada con ese filtro.' : 'Todavía no se ha vendido ninguna gift card.')}</div> : (
            <div className="gc-lista">
              {lista.map(t => (
                <div key={t.id} className="gc-item" onClick={() => setAbierta(abierta?.id === t.id ? null : t)}>
                  <div>
                    <div className="cod">{t.codigo} <span className={`status-pill ${estadoVisible(t) === 'activa' ? 'activo' : estadoVisible(t) === 'agotada' ? 'bajo' : 'agotado'}`} style={{ marginLeft: 8 }}><span className="dot"/>{{ activa: 'Activa', vencida: 'Vencida', agotada: 'Canjeada', anulada: 'Anulada', sin_vender: 'Sin vender' }[estadoVisible(t)]}</span>{textoVence(t) && <span className="meta" style={{ marginLeft: 8, fontWeight: 400 }}>vence {textoVence(t)}</span>}</div>
                    <div className="meta">{t.estado === 'sin_vender' ? `Lote ${t.lote || '—'} · ${fecha(t.creadoEn)} · ${t.creadoPor || ''}` : <>{fecha(t.vendidaEn || t.creadoEn)} · {t.sucursalNombre || nombreSuc(t.sucursalId) || 'sin sucursal'} · {t.vendidaPor}{t.para ? ` · para ${t.para}` : ''}{t.de ? ` · de ${t.de}` : ''}{t.numeroDte ? ` · ${t.numeroDte}` : ''}</>}</div>
                  </div>
                  {t.estado === 'sin_vender' ? <div className="saldo"><small>monto</small>{Number(t.monto) > 0 ? fmt(t.monto) : '—'}<small style={{ marginTop: 2 }}>{Number(t.monto) > 0 ? 'fijo' : 'abierto'}</small></div>
                    : <div className="saldo"><small>saldo</small>{fmt(t.saldo)}<small style={{ marginTop: 2 }}>de {fmt(t.monto)}</small></div>}
                  {abierta?.id === t.id && (
                    <div style={{ gridColumn: '1 / -1' }} onClick={e => e.stopPropagation()}>
                      <div className="gc-canjes">
                        {(t.canjes || []).length === 0 ? <div style={{ color: 'var(--muted)' }}>Sin canjes todavía.</div>
                          : t.canjes.map((c, i) => <div key={i}><span>{fecha(c.fecha)} · {c.sucursalNombre || nombreSuc(c.sucursalId)} · {c.por}{c.numero ? ` · ${c.numero}` : ''}</span><b className="mono">−{fmt(c.monto)}</b></div>)}
                        {t.estado === 'anulada' && <div style={{ color: '#ef4444' }}><span>Anulada por {t.anuladaPor}</span><span>{fecha(t.anuladaEn)}</span></div>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        {t.estado === 'sin_vender' ? <button className="btn btn-primary btn-sm" onClick={() => imprimirEtiquetaGift(t, empresa)}>Imprimir etiqueta</button> : <>
                          <button className="btn btn-primary btn-sm" onClick={() => setTarjetaDigital(t)}>Tarjeta digital</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => imprimirGiftCard(t, empresa)}>Imprimir</button>
                        </>}
                        {(t.estado === 'activa' || t.estado === 'sin_vender') && puedeVender && <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }} onClick={() => anular(t)}>Anular</button>}
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
