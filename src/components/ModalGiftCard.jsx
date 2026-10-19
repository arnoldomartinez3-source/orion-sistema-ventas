// Tarjeta digital de una gift card: vista previa, estilo, enviar por WhatsApp, descargar e imprimir ticket.
// La usan la pantalla "Venta completada" del POS y la página Gift cards.
import { useState, useEffect } from 'react'
import { ESTILOS, estiloDe, generarImagenGiftCard, compartirGiftCard, descargarGiftCard, imprimirGiftCard, textoVence } from '../utils/giftcards'
import { orionAlert } from '../orionDialog'

const fmt = (n) => '$' + (Number(n) || 0).toFixed(2)

export default function ModalGiftCard({ tarjeta, empresa, onClose }) {
  const [estilo, setEstilo] = useState(estiloDe(empresa?.giftEstilo))
  const [img, setImg] = useState('')
  const [ocupado, setOcupado] = useState('')

  useEffect(() => {
    let vivo = true, url = ''
    generarImagenGiftCard(tarjeta, empresa, estilo).then(b => { if (!vivo) return; url = URL.createObjectURL(b); setImg(url) }).catch(() => {})
    return () => { vivo = false; if (url) URL.revokeObjectURL(url) }
  }, [tarjeta, empresa, estilo])

  const correr = async (k, fn) => {
    setOcupado(k)
    try { await fn() } catch (e) { orionAlert('No se pudo: ' + e.message, { tipo: 'error' }) }
    setOcupado('')
  }
  const vence = textoVence(tarjeta)

  return (
    <div className="modal-overlay" style={{ zIndex: 10001 }} onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>Tarjeta digital · <span className="mono">{tarjeta.codigo}</span></span><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cerrar</button></div>
        <div>
          <div style={{ borderRadius: 14, overflow: 'hidden', background: 'var(--surface2)', aspectRatio: '1200 / 720', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            {img ? <img src={img} alt="Gift card" style={{ width: '100%', display: 'block' }} /> : <span style={{ color: 'var(--muted)', fontSize: 13 }}>Armando la tarjeta…</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, marginRight: 4 }}>Estilo</span>
            {Object.entries(ESTILOS).map(([k, e]) => (
              <button key={k} type="button" className={'btn btn-sm ' + (estilo === k ? 'btn-primary' : 'btn-ghost')} onClick={() => setEstilo(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 6, background: `linear-gradient(135deg, ${e.fondo[0]}, ${e.fondo[1]})`, border: `2px solid ${e.acento}` }} />{e.nombre}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
            {fmt(tarjeta.monto)}{tarjeta.para ? ` · para ${tarjeta.para}` : ''}{vence ? ` · válida hasta el ${vence}` : ' · sin vencimiento'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <button className="btn btn-primary" disabled={!!ocupado} onClick={() => correr('wa', () => compartirGiftCard(tarjeta, empresa, estilo))}>{ocupado === 'wa' ? '…' : '💬 Enviar por WhatsApp'}</button>
            <button className="btn btn-ghost" disabled={!!ocupado} onClick={() => correr('dl', () => descargarGiftCard(tarjeta, empresa, estilo))}>{ocupado === 'dl' ? '…' : '⬇ Descargar imagen'}</button>
            <button className="btn btn-ghost" disabled={!!ocupado} onClick={() => correr('pr', () => imprimirGiftCard(tarjeta, empresa))}>{ocupado === 'pr' ? '…' : '🧾 Imprimir ticket'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
