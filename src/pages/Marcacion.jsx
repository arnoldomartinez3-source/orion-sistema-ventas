import { useState, useEffect, useRef } from 'react'
import { auth } from '../firebase'
import { signInAnonymously } from 'firebase/auth'

// ══════════════════════════════════════════════════════════════
// MARCACIÓN — Kiosco STANDALONE (independiente del login del dueño)
//
// Se abre en /kiosco. La tablet se configura UNA vez con el CÓDIGO DE EMPRESA
// (el mismo del login de empleados) + un PIN de salida. Luego se deja abierta:
// cada empleado teclea su PIN → elige Entrada/Salida → toma la foto → marca.
// La sesión es ANÓNIMA; la función `marcar` resuelve la empresa desde el código.
// Diseño limpio (header navy, tarjetas grandes, foto con vista previa).
// ══════════════════════════════════════════════════════════════

const K_CODIGO = 'orion_kiosco_codigo'
const K_PIN = 'orion_kiosco_pin'
const K_EMP = 'orion_kiosco_empresa'

const css = `
  .kx { position: fixed; inset: 0; z-index: 9999; background: #eaeef4; color: #1f2430;
    font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex; flex-direction: column; overflow-y: auto; }
  :root[data-theme="dark"] .kx { background: #0f1218; color: #eceef2; }

  /* Header navy */
  .kx-head { background: linear-gradient(160deg, #123056 0%, #0c2240 100%); color: #fff;
    border-radius: 0 0 26px 26px; padding: 20px 22px 22px; box-shadow: 0 10px 30px rgba(12,34,64,.25); }
  .kx-head-top { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .kx-star { width: 34px; height: 34px; flex: none; }
  .kx-reloj { text-align: right; }
  .kx-reloj .h { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -.5px; }
  .kx-reloj .f { font-size: 11px; color: rgba(255,255,255,.6); text-transform: capitalize; }
  .kx-pill { margin: 16px auto 0; display: inline-flex; flex-direction: column; align-items: center;
    background: rgba(255,255,255,.08); border: 1px solid rgba(200,164,77,.3); border-radius: 16px; padding: 9px 22px; }
  .kx-pill .lbl { font-size: 10.5px; letter-spacing: .16em; color: rgba(255,255,255,.55); text-transform: uppercase; }
  .kx-pill .emp { font-size: 17px; font-weight: 800; display: flex; align-items: center; gap: 9px; }
  .kx-dot { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 8px #22c55e; }
  .kx-head-center { display: flex; justify-content: center; }

  .kx-body { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 22px 18px 30px; }
  .kx-card { width: 100%; max-width: 460px; background: #fff; border-radius: 20px; padding: 24px 22px;
    box-shadow: 0 12px 34px rgba(30,40,60,.10); border: 1px solid #e6e9ef; }
  :root[data-theme="dark"] .kx-card { background: #1b1f27; border-color: #2a2f3a; }

  .kx-hola { font-size: 15px; color: #6b7280; }
  .kx-nombre { font-size: 22px; font-weight: 800; color: #0c2240; margin-top: 2px; }
  :root[data-theme="dark"] .kx-nombre { color: #cfe0ff; }
  .kx-cargo { font-size: 13px; color: #6b7280; margin-top: 2px; }

  /* Teclado PIN */
  .kx-titulo { font-size: 20px; font-weight: 800; text-align: center; }
  .kx-sub { font-size: 14px; color: #6b7280; text-align: center; margin-top: 3px; margin-bottom: 18px; }
  .kx-dots { display: flex; gap: 13px; justify-content: center; margin-bottom: 20px; height: 18px; }
  .kx-d { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #c9cfda; }
  .kx-d.on { background: #c8a44d; border-color: #c8a44d; }
  .kx-keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .kx-key { aspect-ratio: 1.7; border-radius: 15px; background: #f3f5f9; border: 1px solid #e3e7ee;
    color: #1f2430; font-size: 25px; font-weight: 700; cursor: pointer; transition: transform .07s, background .12s; }
  :root[data-theme="dark"] .kx-key { background: #232833; border-color: #313745; color: #eceef2; }
  .kx-key:active { transform: scale(.95); }
  .kx-key.ok { background: #0c2240; color: #fff; border-color: #0c2240; font-size: 17px; font-weight: 800; }
  .kx-key.ok:disabled { opacity: .4; }
  .kx-key.del { font-size: 20px; color: #6b7280; }

  /* Tarjetas Entrada / Salida */
  .kx-acciones { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 6px; }
  .kx-acc { border-radius: 18px; padding: 22px 14px; cursor: pointer; text-align: center; border: 2px solid transparent;
    transition: transform .1s, box-shadow .15s; background: #fff; box-shadow: 0 6px 20px rgba(30,40,60,.08); }
  :root[data-theme="dark"] .kx-acc { background: #232833; }
  .kx-acc:active { transform: scale(.97); }
  .kx-acc .ico { width: 58px; height: 58px; margin: 0 auto 10px; border-radius: 16px; display: grid; place-items: center; }
  .kx-acc .nom { font-size: 19px; font-weight: 800; }
  .kx-acc.entrada { border-color: rgba(22,184,120,.35); } .kx-acc.entrada .ico { background: rgba(22,184,120,.14); color: #12a366; }
  .kx-acc.salida { border-color: rgba(220,60,50,.30); } .kx-acc.salida .ico { background: rgba(220,60,50,.12); color: #d3402c; }
  .kx-sugerido { text-align: center; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #a9842f; margin-bottom: 12px; }

  /* Cámara / foto */
  .kx-cam-wrap { display: flex; flex-direction: column; align-items: center; }
  .kx-cam { width: 240px; height: 240px; border-radius: 20px; overflow: hidden; background: #0c1420;
    border: 3px solid #c8a44d; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
  .kx-cam video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
  .kx-cam-off { width: 100%; height: 100%; display: grid; place-items: center; color: rgba(255,255,255,.5); font-size: 13px; text-align: center; padding: 16px; }
  .kx-cap { margin-top: 16px; width: 100%; padding: 16px; border-radius: 14px; border: none; cursor: pointer;
    font-size: 17px; font-weight: 800; color: #fff; display: flex; align-items: center; justify-content: center; gap: 10px; }
  .kx-cap.entrada { background: linear-gradient(135deg, #16b877, #0d9a63); }
  .kx-cap.salida { background: linear-gradient(135deg, #ef6b4d, #d33c1f); }

  .kx-btn-sec { width: 100%; margin-top: 10px; padding: 13px; border-radius: 12px; background: transparent;
    border: 1px solid #d5dae3; color: #6b7280; font-weight: 700; font-size: 14px; cursor: pointer; }
  :root[data-theme="dark"] .kx-btn-sec { border-color: #333a47; color: #a3a9b4; }

  .kx-fb { text-align: center; padding: 14px 0; }
  .kx-fb .big { font-size: 60px; line-height: 1; }
  .kx-fb .msg { font-size: 23px; font-weight: 800; margin-top: 8px; }
  .kx-fb .det { font-size: 16px; color: #6b7280; margin-top: 4px; }
  .kx-fb .msg.err { color: #d3402c; }

  .kx-salir { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
    background: rgba(255,255,255,.7); border: 1px solid #d5dae3; color: #6b7280; border-radius: 999px;
    padding: 8px 18px; font-size: 12.5px; font-weight: 700; cursor: pointer; }
  :root[data-theme="dark"] .kx-salir { background: rgba(30,34,42,.7); border-color: #333a47; color: #a3a9b4; }

  .kx-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(10,16,28,.6); display: grid; place-items: center; padding: 20px; }
  .kx-modal { background: #fff; border-radius: 18px; padding: 26px; width: 100%; max-width: 360px; text-align: center; }
  :root[data-theme="dark"] .kx-modal { background: #1b1f27; }
  .kx-input { width: 100%; text-align: center; font-size: 18px; letter-spacing: 4px; padding: 11px; border-radius: 11px;
    border: 1.5px solid #d5dae3; margin-bottom: 12px; background: #fff; color: #1f2430; box-sizing: border-box; }
  :root[data-theme="dark"] .kx-input { background: #232833; border-color: #333a47; color: #eceef2; }
  .kx-btn { width: 100%; padding: 15px; border-radius: 13px; border: none; cursor: pointer; font-size: 16px; font-weight: 800;
    background: #0c2240; color: #fff; }
  .kx-btn:disabled { opacity: .45; }
  .kx-btn.ghost { background: transparent; color: #6b7280; border: 1px solid #d5dae3; margin-top: 8px; }

  @media (max-width: 560px) {
    .kx-cam { width: 200px; height: 200px; }
    .kx-key { aspect-ratio: 2.2; font-size: 22px; }
  }
`

const StarSVG = () => (
  <svg className="kx-star" viewBox="0 0 100 100" aria-hidden="true">
    <defs><linearGradient id="kxg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e6cd8a"/><stop offset=".55" stopColor="#c8a44d"/><stop offset="1" stopColor="#9a7529"/></linearGradient></defs>
    <path d="M 50 2 L 52.7 43.5 L 69.1 30.9 L 56.5 47.3 L 98 50 L 56.5 52.7 L 69.1 69.1 L 52.7 56.5 L 50 98 L 47.3 56.5 L 30.9 69.1 L 43.5 52.7 L 2 50 L 43.5 47.3 L 30.9 30.9 L 47.3 43.5 Z" fill="url(#kxg)"/>
  </svg>
)

export default function Marcacion() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [codigo, setCodigo] = useState(() => localStorage.getItem(K_CODIGO) || '')
  const [empresaNombre, setEmpresaNombre] = useState(() => localStorage.getItem(K_EMP) || '')
  const [exitPin, setExitPin] = useState(() => localStorage.getItem(K_PIN) || '')

  // Setup
  const [setupCodigo, setSetupCodigo] = useState('')
  const [setupPin, setSetupPin] = useState('')
  const [setupErr, setSetupErr] = useState('')
  const [setupCargando, setSetupCargando] = useState(false)

  const [fase, setFase] = useState('pin')     // pin | accion | foto | enviando | ok | error
  const [pin, setPin] = useState('')
  const [empleado, setEmpleado] = useState(null)
  const [tipoElegido, setTipoElegido] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [fotoPreview, setFotoPreview] = useState(null)
  const [reloj, setReloj] = useState(new Date())
  const [camaraOk, setCamaraOk] = useState(true)

  const [salirOpen, setSalirOpen] = useState(false)
  const [salirPin, setSalirPin] = useState('')
  const [salirErr, setSalirErr] = useState(false)

  const configurado = !!(codigo && exitPin)

  // Reloj
  useEffect(() => { const t = setInterval(() => setReloj(new Date()), 10000); return () => clearInterval(t) }, [])

  // Sesión anónima + cámara (una vez configurado)
  useEffect(() => {
    if (!configurado) return
    let cancelado = false
    // Asegurar sesión anónima (independiente del dueño)
    ;(async () => {
      try {
        if (!auth.currentUser || !auth.currentUser.isAnonymous) await signInAnonymously(auth)
      } catch { /* si falla, el primer marcar avisará */ }
    })()
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: 640 }, audio: false })
      .then(stream => {
        if (cancelado) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setCamaraOk(true)
      })
      .catch(() => setCamaraOk(false))
    return () => { cancelado = true; streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [configurado])

  // Adjuntar el stream al <video> cuando aparece la pantalla de foto.
  // (El <video> sólo existe en fase 'foto'; por eso no basta con asignarlo arriba.)
  useEffect(() => {
    if (fase !== 'foto') return
    const v = videoRef.current
    if (v && streamRef.current) {
      v.srcObject = streamRef.current
      v.play?.().catch(() => {})
    }
  }, [fase, camaraOk])

  const llamar = async (body) => {
    if (!auth.currentUser) await signInAnonymously(auth)
    const idToken = await auth.currentUser.getIdToken()
    const resp = await fetch('/api/marcar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ ...body, codigoEmpresa: codigo }),
    })
    return resp.json()
  }

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

  const reset = () => { setPin(''); setEmpleado(null); setTipoElegido(null); setMensaje(''); setFotoPreview(null); setFase('pin') }
  const teclear = (d) => { if (fase === 'pin') setPin(p => (p.length < 6 ? p + d : p)) }
  const borrar = () => setPin(p => p.slice(0, -1))

  const validar = async () => {
    if (pin.length < 4) return
    setFase('enviando')
    try {
      const r = await llamar({ accion: 'validar', pin })
      if (r.ok) { setEmpleado(r); setFase('accion') }
      else { setMensaje(r.error || 'PIN no válido'); setFase('error'); setTimeout(reset, 2200) }
    } catch { setMensaje('Error de conexión'); setFase('error'); setTimeout(reset, 2200) }
  }

  const elegir = (tipo) => { setTipoElegido(tipo); setFase('foto') }

  const capturarYMarcar = async () => {
    const foto = capturarFoto()
    if (!foto) { setMensaje('No se pudo tomar la foto. Revisá la cámara.'); setFase('error'); setTimeout(reset, 2600); return }
    setFotoPreview(foto)
    setFase('enviando')
    try {
      const r = await llamar({ accion: 'marcar', pin, tipo: tipoElegido, fotoBase64: foto })
      if (r.ok) { setEmpleado(e => ({ ...e, ...r })); setFase('ok'); setTimeout(reset, 3400) }
      else { setMensaje(r.error || 'No se pudo marcar'); setFase('error'); setTimeout(reset, 2600) }
    } catch { setMensaje('Error de conexión'); setFase('error'); setTimeout(reset, 2600) }
  }

  const iniciarSetup = async () => {
    setSetupErr('')
    const cod = setupCodigo.trim().toUpperCase()
    if (!cod) { setSetupErr('Escribí el código de empresa.'); return }
    if (setupPin.length < 4) { setSetupErr('El PIN de salida debe tener 4–6 dígitos.'); return }
    setSetupCargando(true)
    try {
      if (!auth.currentUser || !auth.currentUser.isAnonymous) await signInAnonymously(auth)
      const idToken = await auth.currentUser.getIdToken()
      const resp = await fetch('/api/marcar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ accion: 'kiosco_init', codigoEmpresa: cod }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || data.ok === false) { setSetupErr(data.error || 'No se pudo validar el código.'); setSetupCargando(false); return }
      localStorage.setItem(K_CODIGO, cod)
      localStorage.setItem(K_PIN, setupPin)
      localStorage.setItem(K_EMP, data.empresaNombre || '')
      setCodigo(cod); setExitPin(setupPin); setEmpresaNombre(data.empresaNombre || '')
    } catch (e) {
      const cod = e?.code || ''
      if (cod.includes('operation-not-allowed') || cod.includes('admin-restricted')) {
        setSetupErr('El inicio de sesión anónimo está deshabilitado. One Geo debe habilitarlo en Firebase (Authentication → Anónimo).')
      } else {
        setSetupErr('No se pudo iniciar: ' + (e?.message || cod || 'revisá el internet'))
      }
    } finally {
      setSetupCargando(false)
    }
  }

  const intentarSalir = () => {
    if (salirPin === exitPin) {
      streamRef.current?.getTracks().forEach(t => t.stop())
      window.location.href = '/'
    } else { setSalirErr(true); setSalirPin('') }
  }
  const reconfigurar = () => {
    if (salirPin !== exitPin) { setSalirErr(true); setSalirPin(''); return }
    localStorage.removeItem(K_CODIGO); localStorage.removeItem(K_PIN); localStorage.removeItem(K_EMP)
    setCodigo(''); setExitPin(''); setEmpresaNombre(''); setSalirOpen(false); reset()
  }

  const horaTxt = reloj.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })
  const fechaTxt = reloj.toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long' })

  // ── SETUP (primera vez / reconfigurar) ──
  if (!configurado) {
    return (
      <>
        <style>{css}</style>
        <div className="kx" style={{ alignItems: 'center', justifyContent: 'flex-start', padding: '5vh 22px 40px' }}>
          <div className="kx-card" style={{ maxWidth: 340, width: '100%', textAlign: 'center' }}>
            <StarSVG />
            <div style={{ fontSize: 21, fontWeight: 800, margin: '10px 0 4px' }}>Modo Marcación</div>
            <div style={{ fontSize: 13.5, color: '#6b7280', marginBottom: 20 }}>
              Configurá esta tablet una sola vez. Después la dejás abierta y tus empleados marcan con su PIN.
            </div>
            {setupErr && <div style={{ background: 'rgba(220,60,50,.1)', color: '#d3402c', borderRadius: 10, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>{setupErr}</div>}
            <div style={{ textAlign: 'left', fontSize: 12.5, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>Código de empresa</div>
            <input className="kx-input" style={{ letterSpacing: 2, textTransform: 'uppercase' }} placeholder="GEO-4821"
              value={setupCodigo} onChange={e => setSetupCodigo(e.target.value.toUpperCase())} autoFocus />
            <div style={{ textAlign: 'left', fontSize: 12.5, fontWeight: 700, color: '#6b7280', marginBottom: 5 }}>PIN de salida (para cerrar el kiosco)</div>
            <input className="kx-input" type="number" inputMode="numeric" placeholder="••••"
              value={setupPin} onChange={e => setSetupPin(e.target.value.slice(0, 6))} />
            <button className="kx-btn" disabled={setupCargando} onClick={iniciarSetup}>
              {setupCargando ? 'Validando…' : 'Comenzar'}
            </button>
            <button className="kx-btn ghost" onClick={() => window.location.href = '/'}>Cancelar</button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{css}</style>
      <div className="kx">
        {/* HEADER */}
        <div className="kx-head">
          <div className="kx-head-top">
            <StarSVG />
            <div className="kx-reloj">
              <div className="h">{horaTxt}</div>
              <div className="f">{fechaTxt}</div>
            </div>
          </div>
          <div className="kx-head-center">
            <div className="kx-pill">
              <span className="lbl">Sistema de marcación</span>
              <span className="emp"><span className="kx-dot" />{empresaNombre || 'ORIÓN'}</span>
            </div>
          </div>
        </div>

        {/* BODY */}
        <div className="kx-body">
          <div className="kx-card">
            {/* PIN */}
            {fase === 'pin' && (
              <>
                <div className="kx-titulo">Marcá tu asistencia</div>
                <div className="kx-sub">Ingresá tu PIN</div>
                <div className="kx-dots">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className={`kx-d ${i < pin.length ? 'on' : ''}`} />)}
                </div>
                <div className="kx-keys">
                  {['1','2','3','4','5','6','7','8','9'].map(n => <button key={n} className="kx-key" onClick={() => teclear(n)}>{n}</button>)}
                  <button className="kx-key del" onClick={borrar}>⌫</button>
                  <button className="kx-key" onClick={() => teclear('0')}>0</button>
                  <button className="kx-key ok" onClick={validar} disabled={pin.length < 4}>OK</button>
                </div>
              </>
            )}

            {/* ELEGIR ENTRADA/SALIDA */}
            {fase === 'accion' && empleado && (
              <>
                {empleado.foto && <img src={empleado.foto} alt="" style={{ width: 66, height: 66, borderRadius: '50%', objectFit: 'cover', border: '2px solid #c8a44d', marginBottom: 10, display: 'block' }} />}
                <div className="kx-hola">Hola,</div>
                <div className="kx-nombre">{empleado.nombre}</div>
                {empleado.cargo ? <div className="kx-cargo">{empleado.cargo}</div> : null}
                <div style={{ height: 16 }} />
                <div className="kx-sugerido">Sugerido: {empleado.sugerido === 'entrada' ? 'Entrada' : 'Salida'}</div>
                <div className="kx-acciones">
                  <div className="kx-acc entrada" onClick={() => elegir('entrada')}>
                    <div className="ico"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg></div>
                    <div className="nom">Entrada</div>
                  </div>
                  <div className="kx-acc salida" onClick={() => elegir('salida')}>
                    <div className="ico"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg></div>
                    <div className="nom">Salida</div>
                  </div>
                </div>
                <button className="kx-btn-sec" onClick={reset}>Cancelar</button>
              </>
            )}

            {/* FOTO */}
            {fase === 'foto' && (
              <div className="kx-cam-wrap">
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Registrar {tipoElegido}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: tipoElegido === 'entrada' ? '#12a366' : '#d3402c', marginBottom: 14, textTransform: 'uppercase' }}>{tipoElegido}</div>
                <div className="kx-cam">
                  {camaraOk ? <video ref={videoRef} autoPlay playsInline muted /> : <div className="kx-cam-off">📷 Cámara no disponible.<br/>Dale permiso al navegador.</div>}
                </div>
                <button className={`kx-cap ${tipoElegido}`} onClick={capturarYMarcar}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Capturar y marcar
                </button>
                <button className="kx-btn-sec" onClick={reset}>Cancelar</button>
              </div>
            )}

            {fase === 'enviando' && <div className="kx-fb"><div className="big">⏳</div><div className="msg">Registrando…</div></div>}

            {fase === 'ok' && empleado && (
              <div className="kx-fb">
                {fotoPreview && <img src={fotoPreview} alt="" style={{ width: 84, height: 84, borderRadius: 14, objectFit: 'cover', transform: 'scaleX(-1)', border: '3px solid #16b877', marginBottom: 8 }} />}
                <div className="big" style={{ fontSize: 46 }}>✅</div>
                <div className="msg">{empleado.tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada</div>
                <div className="det">{empleado.nombre} · {empleado.hora}</div>
              </div>
            )}

            {fase === 'error' && (
              <div className="kx-fb"><div className="big">⚠️</div><div className="msg err">{mensaje}</div></div>
            )}
          </div>
        </div>

        <button className="kx-salir" onClick={() => { setSalirOpen(true); setSalirPin(''); setSalirErr(false) }}>⎋ Salir del kiosco</button>
      </div>

      {/* MODAL SALIR */}
      {salirOpen && (
        <div className="kx-overlay" onClick={() => setSalirOpen(false)}>
          <div className="kx-modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Salir del modo marcación</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Ingresá el PIN de salida.</div>
            <input className="kx-input" type="number" inputMode="numeric" autoFocus
              style={{ borderColor: salirErr ? '#d3402c' : undefined }}
              value={salirPin} onChange={e => { setSalirPin(e.target.value.slice(0, 6)); setSalirErr(false) }} />
            {salirErr && <div style={{ color: '#d3402c', fontSize: 12.5, marginBottom: 10 }}>PIN incorrecto</div>}
            <button className="kx-btn" onClick={intentarSalir}>Salir</button>
            <button className="kx-btn ghost" onClick={reconfigurar}>Reconfigurar esta tablet (cambiar empresa)</button>
            <button className="kx-btn ghost" onClick={() => setSalirOpen(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </>
  )
}
