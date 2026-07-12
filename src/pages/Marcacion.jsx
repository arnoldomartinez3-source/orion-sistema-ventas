import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../firebase'
import { usePermisos } from '../PermisosContext'

// ══════════════════════════════════════════════════
// MARCACIÓN (kiosco) — Etapa 2 del módulo Asistencia
// Pantalla completa tipo kiosco: el empleado teclea su PIN → elige
// entrada/salida → se toma la foto → la Cloud Function `marcar` valida el
// PIN en el servidor, sube la foto a Storage y registra con hora del servidor.
// Corre bajo la sesión del dueño (Opción A): se oculta todo el sistema y para
// SALIR se pide un PIN de salida que el dueño define al entrar.
// ══════════════════════════════════════════════════

const KIOSCO_PIN_KEY = 'orion_kiosco_pin'

const kioscoStyles = `
  .kio { position: fixed; inset: 0; z-index: 9999; background: linear-gradient(160deg, #16264d 0%, #0c1730 100%);
    display: flex; flex-direction: column; color: #fff; font-family: 'Inter', sans-serif; }
  .kio-top { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; }
  .kio-reloj { font-family: var(--mono), monospace; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
  .kio-fecha { font-size: 12px; color: rgba(255,255,255,0.55); text-transform: capitalize; margin-top: 2px; }
  .kio-salir { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: rgba(255,255,255,0.7);
    border-radius: 10px; padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer; }
  .kio-salir:hover { background: rgba(239,68,68,0.18); border-color: #ef4444; color: #fff; }

  .kio-body { flex: 1; display: flex; align-items: center; justify-content: center; gap: 48px; flex-wrap: wrap; padding: 16px; }
  .kio-cam { width: 280px; height: 280px; border-radius: 20px; overflow: hidden; background: #000;
    border: 2px solid rgba(212,168,58,0.5); box-shadow: 0 12px 40px rgba(0,0,0,0.5); flex-shrink: 0; }
  .kio-cam video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
  .kio-cam-off { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.4); font-size: 13px; text-align: center; padding: 16px; }

  .kio-panel { width: 320px; }
  .kio-titulo { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
  .kio-sub { font-size: 14px; color: rgba(255,255,255,0.55); margin-bottom: 18px; }

  .kio-dots { display: flex; gap: 12px; justify-content: center; margin-bottom: 18px; height: 18px; }
  .kio-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); }
  .kio-dot.on { background: #d4a83a; border-color: #d4a83a; }

  .kio-keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .kio-key { aspect-ratio: 1.6; border-radius: 14px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
    color: #fff; font-size: 24px; font-weight: 700; cursor: pointer; transition: background 0.12s, transform 0.08s; }
  .kio-key:hover { background: rgba(255,255,255,0.14); }
  .kio-key:active { transform: scale(0.96); }
  .kio-key.accion { font-size: 15px; font-weight: 800; }

  .kio-btn-grande { width: 100%; padding: 22px; border-radius: 16px; border: none; cursor: pointer;
    font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 14px; transition: transform 0.1s, box-shadow 0.15s; }
  .kio-btn-grande:hover { transform: translateY(-2px); }
  .kio-btn-entrada { background: linear-gradient(135deg, #00C296, #00936f); box-shadow: 0 8px 24px rgba(0,194,150,0.35); }
  .kio-btn-salida  { background: linear-gradient(135deg, #ef6b4d, #d33c1f); box-shadow: 0 8px 24px rgba(211,60,31,0.35); }
  .kio-btn-grande.tenue { opacity: 0.5; }
  .kio-sugerido { font-size: 11px; color: #d4a83a; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; margin-bottom: 10px; }

  .kio-feedback { text-align: center; }
  .kio-feedback .big { font-size: 64px; line-height: 1; margin-bottom: 12px; }
  .kio-feedback .msg { font-size: 24px; font-weight: 800; }
  .kio-feedback .det { font-size: 16px; color: rgba(255,255,255,0.6); margin-top: 6px; }

  .kio-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(6,12,28,0.85); display: flex;
    align-items: center; justify-content: center; padding: 20px; }
  .kio-card { background: #16264d; border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; padding: 28px;
    width: 100%; max-width: 360px; color: #fff; text-align: center; }

  /* Móvil: cámara chica arriba + teclado completo visible (sin scroll) */
  @media (max-width: 560px) {
    .kio-body { flex-direction: column; gap: 14px; padding: 10px 12px 24px; overflow-y: auto; }
    .kio-cam { width: 120px; height: 120px; border-radius: 16px; }
    .kio-panel { width: 100%; max-width: 340px; }
    .kio-key { aspect-ratio: 2.4; font-size: 20px; border-radius: 12px; }
    .kio-titulo { font-size: 19px; }
    .kio-sub { margin-bottom: 12px; }
    .kio-dots { margin-bottom: 12px; }
  }
`

export default function Marcacion() {
  const navigate = useNavigate()
  const { empresaId } = usePermisos()
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [salidaPin, setSalidaPin] = useState(() => localStorage.getItem(KIOSCO_PIN_KEY) || '')
  const [setupPin, setSetupPin] = useState('')

  const [pin, setPin] = useState('')
  const [fase, setFase] = useState('pin')        // pin | tipo | enviando | ok | error
  const [empleado, setEmpleado] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [fotoPreview, setFotoPreview] = useState(null)
  const [reloj, setReloj] = useState(new Date())
  const [camaraOk, setCamaraOk] = useState(true)

  const [salirOpen, setSalirOpen] = useState(false)
  const [salirPin, setSalirPin] = useState('')
  const [salirErr, setSalirErr] = useState(false)

  // Reloj
  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 15000)
    return () => clearInterval(t)
  }, [])

  // Cámara (una vez configurado el PIN de salida)
  useEffect(() => {
    if (!salidaPin) return
    let cancelado = false
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: 640 }, audio: false })
      .then(stream => {
        if (cancelado) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setCamaraOk(true)
      })
      .catch(() => setCamaraOk(false))
    return () => { cancelado = true; streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [salidaPin])

  const capturarFoto = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return null
    const escala = Math.min(1, 480 / v.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(v.videoWidth * escala)
    canvas.height = Math.round(v.videoHeight * escala)
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.55)
  }

  const llamar = async (body) => {
    const idToken = await auth.currentUser.getIdToken()
    const resp = await fetch('/api/marcar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ ...body, empresaId }),
    })
    return resp.json()
  }

  const reset = () => { setPin(''); setEmpleado(null); setMensaje(''); setFotoPreview(null); setFase('pin') }
  const teclear = (d) => { if (fase === 'pin') setPin(p => (p.length < 6 ? p + d : p)) }
  const borrar = () => setPin(p => p.slice(0, -1))

  const validar = async () => {
    if (pin.length < 4) return
    setFase('enviando')
    try {
      const r = await llamar({ accion: 'validar', pin })
      if (r.ok) { setEmpleado(r); setFase('tipo') }
      else { setMensaje(r.error || 'PIN no válido'); setFase('error'); setTimeout(reset, 2200) }
    } catch { setMensaje('Error de conexión'); setFase('error'); setTimeout(reset, 2200) }
  }

  const registrar = async (tipo) => {
    const foto = capturarFoto()
    if (!foto) { setMensaje('No se pudo tomar la foto. Revisá la cámara.'); setFase('error'); setTimeout(reset, 2600); return }
    setFotoPreview(foto)
    setFase('enviando')
    try {
      const r = await llamar({ accion: 'marcar', pin, tipo, fotoBase64: foto })
      if (r.ok) { setEmpleado(e => ({ ...e, ...r })); setFase('ok'); setTimeout(reset, 3200) }
      else { setMensaje(r.error || 'No se pudo marcar'); setFase('error'); setTimeout(reset, 2600) }
    } catch { setMensaje('Error de conexión'); setFase('error'); setTimeout(reset, 2600) }
  }

  const intentarSalir = () => {
    if (salirPin === salidaPin) {
      streamRef.current?.getTracks().forEach(t => t.stop())
      navigate('/empleados')
    } else { setSalirErr(true); setSalirPin('') }
  }

  const horaTxt = reloj.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })
  const fechaTxt = reloj.toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long' })

  // ── Pantalla de configuración del PIN de salida (primera vez) ──
  if (!salidaPin) {
    return (
      <>
        <style>{kioscoStyles}</style>
        <div className="kio" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div className="kio-card">
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Modo Marcación</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 18 }}>
              Definí un <strong>PIN de salida</strong> (4–6 dígitos). Te lo pedirá para salir del kiosco; los empleados no podrán salir sin él.
            </div>
            <input className="input" type="number" inputMode="numeric" placeholder="PIN de salida"
              style={{ textAlign: 'center', fontSize: 22, letterSpacing: 6, marginBottom: 14 }}
              value={setupPin} onChange={e => setSetupPin(e.target.value.slice(0, 6))} autoFocus />
            <button className="btn btn-primary" style={{ width: '100%' }}
              disabled={setupPin.length < 4}
              onClick={() => { localStorage.setItem(KIOSCO_PIN_KEY, setupPin); setSalidaPin(setupPin) }}>
              Comenzar
            </button>
            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => navigate('/empleados')}>
              Cancelar
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{kioscoStyles}</style>
      <div className="kio">
        {/* TOP */}
        <div className="kio-top">
          <div>
            <div className="kio-reloj">{horaTxt}</div>
            <div className="kio-fecha">{fechaTxt}</div>
          </div>
          <button className="kio-salir" onClick={() => { setSalirOpen(true); setSalirPin(''); setSalirErr(false) }}>⎋ Salir</button>
        </div>

        {/* BODY */}
        <div className="kio-body">
          {/* Cámara */}
          <div className="kio-cam">
            {camaraOk
              ? <video ref={videoRef} autoPlay playsInline muted />
              : <div className="kio-cam-off">📷 Cámara no disponible.<br/>Dale permiso o revisa el dispositivo.</div>}
          </div>

          {/* Panel */}
          <div className="kio-panel">
            {fase === 'pin' && (
              <>
                <div className="kio-titulo">Marcá tu asistencia</div>
                <div className="kio-sub">Ingresá tu PIN</div>
                <div className="kio-dots">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className={`kio-dot ${i < pin.length ? 'on' : ''}`} />)}
                </div>
                <div className="kio-keys">
                  {['1','2','3','4','5','6','7','8','9'].map(n => (
                    <button key={n} className="kio-key" onClick={() => teclear(n)}>{n}</button>
                  ))}
                  <button className="kio-key accion" onClick={borrar}>⌫</button>
                  <button className="kio-key" onClick={() => teclear('0')}>0</button>
                  <button className="kio-key accion" style={{ background: 'rgba(212,168,58,0.25)', borderColor: '#d4a83a' }}
                    onClick={validar} disabled={pin.length < 4}>OK</button>
                </div>
              </>
            )}

            {fase === 'tipo' && empleado && (
              <>
                <div className="kio-titulo">Hola, {empleado.nombre?.split(' ')[0]} 👋</div>
                <div className="kio-sub">¿Qué quieres registrar?</div>
                <div className="kio-sugerido">Sugerido: {empleado.sugerido}</div>
                <button className={`kio-btn-grande kio-btn-entrada ${empleado.sugerido !== 'entrada' ? 'tenue' : ''}`} onClick={() => registrar('entrada')}>↳ Entrada</button>
                <button className={`kio-btn-grande kio-btn-salida ${empleado.sugerido !== 'salida' ? 'tenue' : ''}`} onClick={() => registrar('salida')}>↰ Salida</button>
                <button className="btn btn-ghost" style={{ width: '100%', color: 'rgba(255,255,255,0.6)' }} onClick={reset}>Cancelar</button>
              </>
            )}

            {fase === 'enviando' && (
              <div className="kio-feedback"><div className="big">⏳</div><div className="msg">Registrando…</div></div>
            )}

            {fase === 'ok' && empleado && (
              <div className="kio-feedback">
                {fotoPreview && <img src={fotoPreview} alt="" style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'cover', transform: 'scaleX(-1)', border: '2px solid #00C296', marginBottom: 10 }} />}
                <div className="big" style={{ fontSize: 44, marginBottom: 4 }}>✅</div>
                <div className="msg">{empleado.tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada</div>
                <div className="det">{empleado.nombre} · {empleado.hora}</div>
              </div>
            )}

            {fase === 'error' && (
              <div className="kio-feedback">
                <div className="big">⚠️</div>
                <div className="msg" style={{ color: '#ff9a8a' }}>{mensaje}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL SALIR */}
      {salirOpen && (
        <div className="kio-overlay" onClick={() => setSalirOpen(false)}>
          <div className="kio-card" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Salir del modo marcación</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>Ingresá el PIN de salida.</div>
            <input className="input" type="number" inputMode="numeric" autoFocus
              style={{ textAlign: 'center', fontSize: 22, letterSpacing: 6, marginBottom: salirErr ? 6 : 14, borderColor: salirErr ? '#ef4444' : undefined }}
              value={salirPin} onChange={e => { setSalirPin(e.target.value.slice(0, 6)); setSalirErr(false) }} />
            {salirErr && <div style={{ color: '#ff9a8a', fontSize: 12, marginBottom: 12 }}>PIN incorrecto</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setSalirOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={intentarSalir}>Salir</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
