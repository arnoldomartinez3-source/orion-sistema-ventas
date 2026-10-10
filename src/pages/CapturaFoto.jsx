import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db } from '../firebase'
import { usePermisos } from '../PermisosContext'
import { postAutenticado } from '../utils/apiAuth'

// ══════════════════════════════════════════════════════════════════
// FOTO CAPTURA INVENTARIO — pantalla del TELÉFONO (/captura/:id)
// La caja mostró un QR con este enlace. La cajera toma la foto del frente del
// producto; se sube a Storage, se anota en `capturas/{id}` y se pide a la IA
// que lea la etiqueta. La PC está escuchando ese doc y llena el nombre.
// El código de barras ya lo tiene la caja (lo puso el lector): aquí no se
// fotografía.
// ══════════════════════════════════════════════════════════════════

const estilos = `
  .cf-wrap { max-width: 480px; margin: 0 auto; padding: 8px 0 24px; }
  .cf-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; padding: 18px; }
  .cf-cod { font-family: var(--mono); font-size: 20px; font-weight: 800; letter-spacing: 1px; color: var(--text); }
  .cf-btn-foto { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 150px; border-radius: 16px;
    border: 2px dashed var(--accent3); background: rgba(216,169,60,0.08); color: var(--text); font: 700 17px var(--font); cursor: pointer; }
  .cf-btn-foto span.ico { font-size: 40px; line-height: 1; }
  .cf-prev { width: 100%; max-height: 360px; object-fit: contain; border-radius: 12px; background: #000; }
  .cf-estado { margin-top: 14px; padding: 12px 14px; border-radius: 12px; font-size: 14px; line-height: 1.45; }
  .cf-estado.ok { background: rgba(0,194,150,0.12); border: 1px solid rgba(0,194,150,0.4); }
  .cf-estado.esp { background: var(--surface2); border: 1px solid var(--border); }
  .cf-estado.err { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.4); }
  .cf-ia { margin-top: 10px; font-size: 15px; font-weight: 700; }
`

// Reduce la foto antes de subirla (los celulares sacan 3–8 MB; con 1280 px de lado alcanza para leerla).
async function reducir(file, maxLado = 1280, calidad = 0.82) {
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return file
  const esc = Math.min(1, maxLado / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return await new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', calidad))
}

export default function CapturaFoto() {
  const { id } = useParams()
  const { empresaId, userName } = usePermisos()
  const [cap, setCap] = useState(undefined) // undefined = cargando, null = no existe
  const [prev, setPrev] = useState('')
  const [fase, setFase] = useState('') // '', 'subiendo', 'leyendo', 'listo', 'error'
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!id) return
    return onSnapshot(doc(db, 'capturas', id), s => setCap(s.exists() ? { id: s.id, ...s.data() } : null), () => setCap(null))
  }, [id])

  const tomar = async (file) => {
    if (!file || !cap) return
    setError(''); setFase('subiendo')
    try {
      const blob = await reducir(file)
      setPrev(URL.createObjectURL(blob))
      const path = `empresas/${cap.empresaId}/capturas/${cap.id}.jpg`
      const sRef = storageRef(getStorage(), path)
      await uploadBytes(sRef, blob, { contentType: 'image/jpeg' })
      const url = await getDownloadURL(sRef)
      await updateDoc(doc(db, 'capturas', cap.id), { foto: url, fotoPath: path, estado: 'con_foto', subidaEn: serverTimestamp(), subidaPor: userName || '' })
      setFase('leyendo')
      const r = await postAutenticado('/api/leer-etiqueta', { capturaId: cap.id })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudo leer la etiqueta')
      setFase('listo')
    } catch (e) {
      setFase('error'); setError(e.message || String(e))
    }
  }

  if (cap === undefined) return <div className="cf-wrap"><style>{estilos}</style><div className="cf-card">Cargando…</div></div>
  if (cap === null || (empresaId && cap.empresaId !== empresaId)) {
    return <div className="cf-wrap"><style>{estilos}</style><div className="cf-card"><h2 style={{ marginBottom: 8 }}>Enlace no válido</h2><div style={{ color: 'var(--muted)' }}>Esta captura no existe o es de otra empresa. Volvé a escanear el QR que muestra la caja.</div></div></div>
  }
  const yaCerrada = cap.estado === 'cerrada'

  return (
    <div className="cf-wrap">
      <style>{estilos}</style>
      <div className="cf-card">
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Foto del producto</div>
        <div className="cf-cod">{cap.codigoBarras}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 14px', lineHeight: 1.45 }}>
          {yaCerrada ? 'La caja ya cerró este producto. Si hace falta otra foto, volvé a escanearlo.' : 'Tomá la foto del FRENTE del empaque, que se lean la marca, el sabor y el tamaño. El código de barras ya lo tiene la caja.'}
        </div>
        {!yaCerrada && (
          <>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { tomar(e.target.files?.[0]); e.target.value = '' }} />
            {prev
              ? <img className="cf-prev" src={prev} alt="Foto del producto" />
              : <button type="button" className="cf-btn-foto" onClick={() => inputRef.current?.click()}><span className="ico">📷</span>Tomar foto</button>}
            {fase === 'subiendo' && <div className="cf-estado esp">Subiendo la foto…</div>}
            {fase === 'leyendo' && <div className="cf-estado esp">Foto enviada. Leyendo la etiqueta… la PC se llena sola en unos segundos.</div>}
            {fase === 'listo' && (
              <div className="cf-estado ok">
                ✅ Listo. Revisá el nombre en la PC y guardá el producto.
                {cap.ia?.nombre && <div className="cf-ia">{cap.ia.nombre}</div>}
                {cap.ia?.advertencia && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>⚠️ {cap.ia.advertencia}</div>}
              </div>
            )}
            {fase === 'error' && <div className="cf-estado err">No se pudo: {error}. {cap.foto ? 'La foto sí quedó guardada; el nombre hay que escribirlo en la PC.' : ''}</div>}
            {(fase === 'listo' || fase === 'error') && (
              <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => { setPrev(''); setFase(''); inputRef.current?.click() }}>Tomar otra foto</button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
