import { useState, useRef } from 'react'
import { db } from '../firebase'
import { doc, collection, runTransaction, serverTimestamp } from 'firebase/firestore'
import { orionAlert } from '../orionDialog'
import { useTrampaFoco } from '../hooks/useTrampaFoco'
import { camposDelta, stockEn } from '../utils/sucursal'
import { imprimirIframe } from '../utils/imprimir'

// ══════════════════════════════════════════════════════════════════
// CAMBIO DE PRODUCTO (joyería y boutique): el cliente regresa una pieza en buen estado y se lleva otra.
//  · Igual valor o menor: NO hay dinero ni DTE nuevo. Se registra en inventario la pieza que regresa
//    (Devolución) y la que se lleva (Salida), con motivo "Cambio de producto". Opcional: comprobante.
//  · Mayor valor: se registra la pieza que regresa y la nueva entra al carrito con un DESCUENTO igual al
//    valor de la devuelta; la caja cobra la diferencia con su FE normal (el DTE muestra el descuento).
// Es lo que las tiendas ya hacían a mano; aquí queda cuadrado el inventario y con rastro de quién lo hizo.
// ══════════════════════════════════════════════════════════════════

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const fmt = (n) => '$' + r2(n).toFixed(2)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export default function ModalCambioProducto({ productos, empresaId, sucursalId, porSucursal, venderSinStock, userName, userId, precioConIva, nombreEmpresa, onCerrar, onVenderDiferencia }) {
  const cajaRef = useRef(null)
  useTrampaFoco(true, cajaRef)
  const [busqDev, setBusqDev] = useState('')
  const [prodDev, setProdDev] = useState(null)
  const [qtyDev, setQtyDev] = useState(1)
  const [busqNuevo, setBusqNuevo] = useState('')
  const [prodNuevo, setProdNuevo] = useState(null)
  const [qtyNuevo, setQtyNuevo] = useState(1)
  const [referencia, setReferencia] = useState('')
  const [imprimir, setImprimir] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const buscar = (q) => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return []
    return productos.filter(p => String(p.nombre || '').toLowerCase().includes(t) || String(p.codigo || '').toLowerCase().includes(t) || String(p.codigoBarras || '').toLowerCase() === t).slice(0, 8)
  }
  const resDev = buscar(busqDev)
  const resNuevo = buscar(busqNuevo)

  const valorDev = prodDev ? r2(precioConIva(prodDev.precio) * (parseFloat(qtyDev) || 0)) : 0
  const valorNuevo = prodNuevo ? r2(precioConIva(prodNuevo.precio) * (parseFloat(qtyNuevo) || 0)) : 0
  const diferencia = r2(valorNuevo - valorDev)
  const stockNuevo = prodNuevo ? (porSucursal && sucursalId ? stockEn(prodNuevo, sucursalId) : (Number(prodNuevo.stock) || 0)) : 0
  const listo = prodDev && prodNuevo && (parseFloat(qtyDev) || 0) > 0 && (parseFloat(qtyNuevo) || 0) > 0 && !guardando

  const comprobante = () => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cambio de producto</title><style>
    @page{size:80mm auto;margin:3mm} body{font-family:Arial,sans-serif;font-size:12px;width:72mm;margin:0;color:#000}
    h1{font-size:14px;text-align:center;margin:0 0 4px} .c{text-align:center} .sep{border-top:1px dashed #000;margin:6px 0}
    .fila{display:flex;justify-content:space-between;gap:6px} b{font-weight:700}</style></head><body>
    <h1>${esc(nombreEmpresa || '')}</h1><div class="c">COMPROBANTE DE CAMBIO</div><div class="c">${new Date().toLocaleString('es-SV')}</div>
    <div class="sep"></div>
    <div><b>Regresa:</b></div><div class="fila"><span>${esc(qtyDev)} × ${esc(prodDev?.nombre)}</span><span>${fmt(valorDev)}</span></div>
    <div style="margin-top:4px"><b>Se lleva:</b></div><div class="fila"><span>${esc(qtyNuevo)} × ${esc(prodNuevo?.nombre)}</span><span>${fmt(valorNuevo)}</span></div>
    <div class="sep"></div>
    <div class="fila"><span>Diferencia</span><b>${diferencia > 0 ? fmt(diferencia) + ' (se cobra con factura)' : diferencia < 0 ? fmt(-diferencia) + ' a favor de la tienda' : 'sin diferencia'}</b></div>
    ${referencia ? `<div>Ref. factura original: ${esc(referencia)}</div>` : ''}
    <div>Atendió: ${esc(userName || '')}</div>
    <div class="sep"></div><div class="c">No es un documento tributario. La venta original conserva su factura.</div>
    </body></html>`

  // Inventario: la devuelta ENTRA; la entregada SALE solo cuando no hay diferencia que cobrar (si la hay, sale con la venta).
  const registrarInventario = async (sacarNueva) => {
    const qD = parseFloat(qtyDev) || 0, qN = parseFloat(qtyNuevo) || 0
    const motivoRef = referencia.trim() ? 'Cambio de producto · fact. ' + referencia.trim() : 'Cambio de producto'
    await runTransaction(db, async (tx) => {
      const refD = doc(db, 'productos', prodDev.id), refN = doc(db, 'productos', prodNuevo.id)
      const sD = await tx.get(refD); const sN = sacarNueva ? await tx.get(refN) : null
      if (!sD.exists()) throw new Error('La pieza que regresa ya no está en el catálogo')
      const pdD = sD.data()
      const antesD = porSucursal && sucursalId ? stockEn(pdD, sucursalId) : (Number(pdD.stock) || 0)
      tx.update(refD, { ...camposDelta(pdD, qD, sucursalId, porSucursal), updatedAt: serverTimestamp() })
      tx.set(doc(collection(db, 'kardex')), { productoId: prodDev.id, productoCodigo: pdD.codigo || '', productoNombre: pdD.nombre || '', tipo: 'devolucion', cantidad: qD, unidad: pdD.unidad || 'Unidad', presentacion: '',
        stockAntes: antesD, stockDespues: antesD + qD, stockTotal: (Number(pdD.stock) || 0) + qD, motivo: motivoRef + ' (regresa' + (prodNuevo ? ', se lleva ' + prodNuevo.nombre : '') + ')', referencia: referencia.trim(), sucursalId: sucursalId || '', sucursalOrigen: '', sucursalDestino: '', usuario: userName || '', usuarioId: userId || '', empresaId, fecha: serverTimestamp() })
      if (sacarNueva) {
        if (!sN.exists()) throw new Error('La pieza que se lleva ya no está en el catálogo')
        const pdN = sN.data()
        const antesN = porSucursal && sucursalId ? stockEn(pdN, sucursalId) : (Number(pdN.stock) || 0)
        if (!venderSinStock && qN > antesN) throw new Error(`No hay existencia de "${pdN.nombre}" en esta tienda (hay ${antesN}).`)
        tx.update(refN, { ...camposDelta(pdN, -qN, sucursalId, porSucursal), updatedAt: serverTimestamp() })
        tx.set(doc(collection(db, 'kardex')), { productoId: prodNuevo.id, productoCodigo: pdN.codigo || '', productoNombre: pdN.nombre || '', tipo: 'salida', cantidad: qN, unidad: pdN.unidad || 'Unidad', presentacion: '',
          stockAntes: antesN, stockDespues: antesN - qN, stockTotal: (Number(pdN.stock) || 0) - qN, motivo: motivoRef + ' (se lleva, regresó ' + prodDev.nombre + ')', referencia: referencia.trim(), sucursalId: sucursalId || '', sucursalOrigen: '', sucursalDestino: '', usuario: userName || '', usuarioId: userId || '', empresaId, fecha: serverTimestamp() })
      }
    })
  }

  const confirmar = async () => {
    if (!listo) return
    setGuardando(true)
    try {
      if (diferencia > 0.005) {
        // Hay diferencia: la devuelta entra ahora; la nueva sale con la venta (descuento = valor devuelto)
        await registrarInventario(false)
        onVenderDiferencia(prodNuevo, parseFloat(qtyNuevo) || 1, valorDev, `Cambio: regresó ${qtyDev} × ${prodDev.nombre}` + (referencia.trim() ? ' · fact. ' + referencia.trim() : ''))
        if (imprimir) { try { imprimirIframe(comprobante()) } catch { /* sin impresora */ } }
        await orionAlert(`Pieza devuelta registrada. "${prodNuevo.nombre}" ya está en el carrito con descuento de ${fmt(valorDev)}: cobra la diferencia de ${fmt(diferencia)} como una venta normal.`, { titulo: '🔁 Cambio con diferencia', tipo: 'success' })
      } else {
        await registrarInventario(true)
        if (imprimir) { try { imprimirIframe(comprobante()) } catch { /* sin impresora */ } }
        await orionAlert(`Cambio registrado sin dinero: regresó ${qtyDev} × ${prodDev.nombre} y se llevó ${qtyNuevo} × ${prodNuevo.nombre}.` + (diferencia < -0.005 ? `\n\nLa pieza nueva vale ${fmt(-diferencia)} menos; no se devuelve diferencia.` : ''), { titulo: '🔁 Cambio registrado', tipo: 'success' })
      }
      onCerrar(true)
    } catch (e) { orionAlert('No se pudo registrar el cambio: ' + e.message, { tipo: 'error' }) }
    setGuardando(false)
  }

  // Función (no componente): si fuera un componente definido aquí, React lo remontaría en cada tecla y el input perdería el foco
  const buscador = ({ label, busq, setBusq, res, prod, setProd, qty, setQty, nota }) => (
    <div className="form-group" style={{ marginBottom: 10 }}>
      <label className="form-label">{label}</label>
      {prod ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', border: '1.5px solid var(--accent)', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prod.nombre}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}><span className="mono">{prod.codigo}</span> · {fmt(precioConIva(prod.precio))} c/u{nota ? ' · ' + nota : ''}</div>
          </div>
          <input className="input" type="number" min="1" step="1" value={qty} onChange={e => setQty(e.target.value)} style={{ width: 64, padding: '4px 6px', textAlign: 'center' }} aria-label="Cantidad" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setProd(null); setBusq('') }} aria-label="Quitar">✕</button>
        </div>
      ) : (
        <>
          <input className="input" placeholder="Escaneá o escribí el código o el nombre" value={busq} onChange={e => setBusq(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && res.length === 1) { setProd(res[0]); setBusq('') } }} />
          {res.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: 'auto' }}>
              {res.map(p => (
                <div key={p.id} onClick={() => { setProd(p); setBusq('') }} style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span className="mono" style={{ color: 'var(--muted)', fontSize: 11 }}>{p.codigo}</span> {p.nombre}</span>
                  <span style={{ whiteSpace: 'nowrap' }}>{fmt(precioConIva(p.precio))}{porSucursal && sucursalId ? ` · ${stockEn(p, sucursalId)} en tienda` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className="modal-overlay" style={{ zIndex: 400 }}>
      <div className="modal" ref={cajaRef} style={{ maxWidth: 560, maxHeight: '94vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div className="modal-title" style={{ margin: 0 }}>🔁 Cambio de producto</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCerrar(false)} aria-label="Cerrar">✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>La pieza que regresa vuelve al inventario de esta tienda. Si la nueva vale lo mismo o menos, no hay cobro ni factura nueva. Si vale más, entra al carrito con descuento y se cobra la diferencia con factura.</div>

        {buscador({ label: 'Pieza que REGRESA el cliente', busq: busqDev, setBusq: setBusqDev, res: resDev, prod: prodDev, setProd: setProdDev, qty: qtyDev, setQty: setQtyDev })}
        {buscador({ label: 'Pieza que SE LLEVA', busq: busqNuevo, setBusq: setBusqNuevo, res: resNuevo, prod: prodNuevo, setProd: setProdNuevo, qty: qtyNuevo, setQty: setQtyNuevo, nota: prodNuevo ? `${stockNuevo} en tienda` : '' })}
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label className="form-label">Factura original (opcional)</label>
          <input className="input" placeholder="Nº de la factura con la que se compró" value={referencia} onChange={e => setReferencia(e.target.value)} maxLength={40} />
        </div>

        {prodDev && prodNuevo && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Regresa</span><b>{fmt(valorDev)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Se lleva</span><b>{fmt(valorNuevo)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border)', fontSize: 14 }}>
              <span>{diferencia > 0.005 ? 'Diferencia a cobrar' : diferencia < -0.005 ? 'Diferencia a favor de la tienda (no se devuelve)' : 'Sin diferencia'}</span>
              <b style={{ color: diferencia > 0.005 ? 'var(--accent)' : 'inherit' }}>{fmt(Math.abs(diferencia))}</b>
            </div>
            {diferencia > 0.005 && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Al confirmar, "{prodNuevo.nombre}" entra al carrito con descuento de {fmt(valorDev)} y cobras {fmt(diferencia)} con factura.</div>}
          </div>
        )}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
          <input type="checkbox" checked={imprimir} onChange={e => setImprimir(e.target.checked)} /> Imprimir comprobante de cambio para el cliente
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => onCerrar(false)} disabled={guardando}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={!listo}>{guardando ? 'Registrando…' : diferencia > 0.005 ? 'Registrar y cobrar diferencia' : 'Registrar cambio'}</button>
        </div>
      </div>
    </div>
  )
}
