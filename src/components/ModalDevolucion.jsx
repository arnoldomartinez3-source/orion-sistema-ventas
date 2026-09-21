import { useEffect, useRef, useState } from 'react'
import { usePermisos } from '../PermisosContext'
import { orionAlert } from '../orionDialog'
import { useTrampaFoco } from '../hooks/useTrampaFoco'
import { generarTicket, imprimirIframe, htmlMiniGaveta } from '../utils/imprimir'
import { MEDIOS_DEVOLUCION, medioSugerido, itemsParaReponer, registrarDevolucion, saldoFactura } from '../utils/devoluciones'

// ══════════════════════════════════════════════════════════════════
// "¿Cómo devolviste el dinero?" — se abre cuando Hacienda aceptó una Nota de
// Crédito, un Evento de Retorno o una Anulación (o luego, desde la factura).
// Registra la salida de caja, abre la gaveta / imprime el comprobante, devuelve
// los productos al inventario y abona al crédito del cliente.
//
// props.datos = { tipo: 'nc'|'retorno'|'anulacion', docDevolucion, facturaOrigen,
//                 monto, itemsDevueltos (null = total), codigoGeneracionOrigen }
// ══════════════════════════════════════════════════════════════════

const TITULOS = { nc: 'Nota de Crédito', retorno: 'Evento de Retorno', anulacion: 'Anulación' }
const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`

export default function ModalDevolucion({ datos, empresa, onCerrar }) {
  if (!datos) return null
  // key: cada devolución arranca con su propio estado (sugerencias del documento)
  const clave = `${datos.tipo}-${datos.docDevolucion?.id || ''}`
  return <Contenido key={clave} datos={datos} empresa={empresa} onCerrar={onCerrar} />
}

function Contenido({ datos, empresa, onCerrar }) {
  const { empresaId, userId, userName, puede, esAdmin, rol } = usePermisos()
  // Cajero/vendedor solo leen sus propias ventas: sin este filtro las reglas rechazan la consulta.
  const filtroCajero = (!esAdmin && (rol === 'cajero' || rol === 'vendedor')) ? userId : undefined
  const cajaRef = useRef(null)
  useTrampaFoco(true, cajaRef)

  const [medio, setMedio] = useState(() => medioSugerido({ tipo: datos.tipo, facturaOrigen: datos.facturaOrigen }))
  const [monto, setMonto] = useState(() => (Number(datos.monto) || 0).toFixed(2))
  const [items, setItems] = useState([])
  const [cargandoItems, setCargandoItems] = useState(true)
  const [reponer, setReponer] = useState(true)
  const [imprimir, setImprimir] = useState(true)
  const [guardando, setGuardando] = useState(false)

  // Productos que se pueden devolver al inventario (se cruzan con la venta original)
  useEffect(() => {
    let vivo = true
    itemsParaReponer({ empresaId, codigoGeneracion: datos.codigoGeneracionOrigen, itemsDevueltos: datos.itemsDevueltos ?? null, cajeroId: filtroCajero })
      .then(r => { if (vivo) setItems(r) })
      .catch(() => { if (vivo) setItems([]) })
      .finally(() => { if (vivo) setCargandoItems(false) })
    return () => { vivo = false }
  }, [datos, empresaId, filtroCajero])

  const origenCredito = datos.facturaOrigen?.tipoPago === 'credito'
  const medios = MEDIOS_DEVOLUCION.filter(m => m.id !== 'abono' || (datos.tipo === 'nc' && origenCredito))
  const puedeGaveta = esAdmin || puede('abrir_gaveta')

  const confirmar = async () => {
    const valor = parseFloat(monto) || 0
    if (medio !== 'ninguno' && !(valor > 0)) { orionAlert('Escribí cuánto dinero se devolvió.', { tipo: 'warning' }); return }
    setGuardando(true)
    try {
      const r = await registrarDevolucion({
        empresaId, usuario: { id: userId, nombre: userName },
        tipo: datos.tipo, docDevolucion: datos.docDevolucion, facturaOrigen: datos.facturaOrigen,
        monto: medio === 'ninguno' ? 0 : valor, medio, items: reponer ? items : [],
        codigoGeneracionOrigen: datos.codigoGeneracionOrigen, cajeroId: filtroCajero,
      })
      // Tiquetera y gaveta: en efectivo se abre la gaveta (con el comprobante o con un mini ticket)
      if (medio === 'efectivo' && puedeGaveta) {
        if (imprimir && datos.docDevolucion) {
          try { imprimirIframe(await generarTicket(datos.docDevolucion, empresa || {})) }
          catch { imprimirIframe(htmlMiniGaveta(`· Devolución ${fmt(valor)} · ${userName || ''} ·`)) }
        } else {
          imprimirIframe(htmlMiniGaveta(`· Devolución ${fmt(valor)} · ${userName || ''} ·`))
        }
      } else if (imprimir && datos.docDevolucion && medio !== 'ninguno') {
        try { imprimirIframe(await generarTicket(datos.docDevolucion, empresa || {})) } catch { /* el comprobante se puede reimprimir desde la factura */ }
      }
      const hechos = [
        r.caja && `Salida de ${fmt(valor)} registrada en la caja`,
        r.mismoTurno && 'La venta era de este mismo turno: la caja ya la descuenta al estar anulada',
        r.stock > 0 && `${r.stock} producto(s) devueltos al inventario`,
        r.abono && `${fmt(valor)} descontados de la cuenta del cliente`,
      ].filter(Boolean)
      await orionAlert(
        (hechos.length ? '✔ ' + hechos.join('\n✔ ') : 'Devolución registrada.') + (r.avisos.length ? '\n\n⚠️ ' + r.avisos.join('\n⚠️ ') : ''),
        { titulo: 'Devolución registrada', tipo: r.avisos.length ? 'warning' : 'success' },
      )
      onCerrar(true)
    } catch (e) {
      orionAlert('No se pudo registrar la devolución: ' + e.message, { tipo: 'error' })
    }
    setGuardando(false)
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 450 }}>
      <div className="modal" ref={cajaRef} style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ marginBottom: 4 }}>↩️ ¿Cómo devolviste el dinero?</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
          {TITULOS[datos.tipo]} {datos.docDevolucion?.numeroControl || datos.docDevolucion?.numero || ''} · {datos.docDevolucion?.cliente || 'Consumidor Final'}
          {origenCredito && datos.tipo === 'nc' && <> · la factura original es al crédito (debe {fmt(saldoFactura(datos.facturaOrigen))})</>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }} role="radiogroup" aria-label="Cómo se devolvió el dinero">
          {medios.map(m => (
            <label key={m.id} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
              border: `1.5px solid ${medio === m.id ? 'var(--accent)' : 'var(--border)'}`,
              background: medio === m.id ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface2)',
            }}>
              <input type="radio" name="medio-devolucion" id={`medio-${m.id}`} checked={medio === m.id} onChange={() => setMedio(m.id)} style={{ marginTop: 3 }} />
              <span><strong style={{ fontSize: 14 }}>{m.label}</strong><br /><span style={{ fontSize: 12, color: 'var(--muted)' }}>{m.desc}</span></span>
            </label>
          ))}
        </div>

        {medio !== 'ninguno' && (
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label" htmlFor="monto-devolucion">Monto devuelto</label>
            <input id="monto-devolucion" className="input" type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} style={{ maxWidth: 180 }} />
          </div>
        )}

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, marginBottom: 8, cursor: items.length ? 'pointer' : 'default', opacity: items.length ? 1 : 0.6 }}>
          <input type="checkbox" id="reponer-stock" checked={reponer && items.length > 0} disabled={!items.length} onChange={e => setReponer(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            Devolver los productos al inventario
            <br />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {cargandoItems ? 'Buscando los productos…'
                : items.length ? items.map(it => `${it.qty} × ${it.nombre}`).join(' · ')
                : 'No hay productos del inventario ligados a este documento.'}
            </span>
          </span>
        </label>

        {medio !== 'ninguno' && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, marginBottom: 6, cursor: 'pointer' }}>
            <input type="checkbox" id="imprimir-comprobante" checked={imprimir} onChange={e => setImprimir(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              Imprimir el comprobante en la tiquetera
              {medio === 'efectivo' && <><br /><span style={{ fontSize: 12, color: 'var(--muted)' }}>{puedeGaveta ? 'La gaveta se abre igual aunque no lo imprimas.' : 'No tenés permiso para abrir la gaveta.'}</span></>}
            </span>
          </label>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => onCerrar(false)} disabled={guardando}>Ahora no</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={guardando || cargandoItems}>
            {guardando ? 'Registrando…' : 'Registrar devolución'}
          </button>
        </div>
      </div>
    </div>
  )
}
