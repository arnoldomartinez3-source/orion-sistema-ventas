import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getNombreDep, getNombreMun } from '../data/departamentosMunicipios'
import { db } from '../firebase'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useAuth } from '../AuthContext'
import { usePermisos } from '../PermisosContext'
import CambiarPassword from '../components/CambiarPassword'
import HorarioAccesos from '../components/config/HorarioAccesos'
import PlanUso from '../components/config/PlanUso'
import { orionAlert } from '../orionDialog'

// ══════════════════════════════════════════════════
// CONFIGURACIÓN — por secciones:
//   Mi empresa · Punto de venta · Horario y accesos · Mi plan · Seguridad
// El cliente solo cambia lo NO fiscal (logo, contacto, preferencias). Los datos
// fiscales y del MH los administra One Geo (Panel One Geo) y aquí se ven de lectura.
// Quien solo tiene 'autorizar_fuera_horario' entra directo a Horario y accesos.
// ══════════════════════════════════════════════════

const TIPO_ESTABLECIMIENTO = { '01': 'Casa Matriz', '02': 'Sucursal / Agencia', '04': 'Bodega', '07': 'Transporte', '20': 'Otro' }

function Interruptor({ activo, onChange, disabled, etiqueta }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} disabled={disabled} onClick={onChange}
      style={{ width: 46, height: 26, borderRadius: 99, border: 'none', cursor: disabled ? 'default' : 'pointer', flexShrink: 0, background: activo ? 'var(--accent)' : 'var(--border2)', position: 'relative', transition: 'background 0.25s', opacity: disabled ? 0.6 : 1 }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: activo ? 23 : 3, transition: 'left 0.25s', boxShadow: '0 2px 4px rgba(0,0,0,0.25)' }} />
    </button>
  )
}

function Opcion({ titulo, texto, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{titulo}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, lineHeight: 1.45 }}>{texto}</div>
      </div>
      {children}
    </div>
  )
}

export default function Configuracion() {
  const { user } = useAuth()
  const { esAdmin, puede, empresaId, modulos } = usePermisos()
  const [params, setParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [config, setConfig] = useState({
    empresaNombre: '', nombreComercial: '', logoUrl: '',
    nit: '', nrc: '', telefono: '', correo: '', direccion: '',
    requerirCaja: false,
    pinAlCobrar: false, // gaveta compartida: pedir el PIN de quien cobra en cada venta
    venderSinStock: false,   // dejar cobrar aunque el stock esté en 0 (queda negativo hasta que se registre la compra)
    descuentoMaxPct: 0,      // % máximo que da una cajera sin autorización; 0 = sin límite
    redondeoEfectivo: '0',   // '0' | '0.05' | '0.25': redondeo del efectivo a favor del cliente
    efectivoMaxGaveta: 0,    // $ en gaveta a partir de los cuales el POS pide hacer un retiro; 0 = sin aviso
    ticketCopias: 1,         // 1 o 2 tickets por venta
    ticketOpciones: { logo: false, atendio: true, desgloseIva: true, noEsFactura: false },
    diasAvisoVencimiento: 15, // productos que vencen dentro de estos días aparecen como "por vencer"
    costoPromedio: false,    // Compras: costo promedio ponderado en vez de último costo
    comandas: undefined,          // Comandas / vales (undefined = hereda lo que tenía por plan)
    comandasDespacho: undefined,  // paso "Para despachar"
    productosMayusculas: true, // nombres de producto en MAYÚSCULAS (por empresa)
    tipoDtePorDefecto: 'FE',
    ticketMensaje: '',
  })

  const puedeVer = esAdmin || puede('ver_configuracion')
  const puedeEditar = esAdmin || puede('editar_configuracion')
  const puedeHorario = puedeVer || puede('autorizar_fuera_horario')
  const conCorreo = !!user?.email && !user.isAnonymous

  const secciones = [
    puedeVer && { key: 'empresa', label: '🏢 Mi empresa' },
    puedeVer && { key: 'pos', label: '🛒 Punto de venta' },
    puedeHorario && { key: 'horario', label: '🕒 Horario y accesos' },
    puedeVer && { key: 'plan', label: '⭐ Mi plan' },
    puedeVer && conCorreo && { key: 'seguridad', label: '🔐 Seguridad' },
  ].filter(Boolean)
  const pedida = params.get('seccion')
  const seccion = secciones.some(s => s.key === pedida) ? pedida : secciones[0]?.key
  const irA = (key) => setParams({ seccion: key }, { replace: true })

  useEffect(() => {
    const cargar = async () => {
      if (!user || !empresaId) return
      try {
        const snap = await getDoc(doc(db, 'configuracion', empresaId))
        if (snap.exists()) setConfig(prev => ({ ...prev, ...snap.data() }))
      } catch (e) {
        console.error('Error:', e)
      }
      setLoading(false)
    }
    cargar()
  }, [user, empresaId])

  const handleChange = (campo, valor) => {
    setConfig(prev => ({ ...prev, [campo]: valor }))
    setGuardado(false)
    if (campo === 'logoUrl') setLogoError(false)
  }

  // ── Subir logo a Firebase Storage (mismo patrón que Inventario) ──
  const subirLogo = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { orionAlert('Solo se permiten imágenes', { tipo: 'warning' }); return }
    if (file.size > 2 * 1024 * 1024) { orionAlert('El logo no puede superar 2MB', { tipo: 'warning' }); return }
    if (!empresaId) { orionAlert('No se pudo identificar la empresa', { tipo: 'error' }); return }
    setSubiendoLogo(true)
    try {
      const ext = file.name.split('.').pop()
      const sRef = storageRef(getStorage(), `empresas/${empresaId}/logos/${Date.now()}.${ext}`)
      await uploadBytes(sRef, file)
      const url = await getDownloadURL(sRef)
      setConfig(prev => ({ ...prev, logoUrl: url }))
      setLogoError(false)
      setGuardado(false)
    } catch (e) {
      orionAlert('Error al subir el logo: ' + e.message, { tipo: 'error' })
    }
    setSubiendoLogo(false)
  }

  // Comandas: si la empresa nunca lo guardó en configuración, hereda lo que tenía por plan (empresas.modulos)
  const comandasOn = config.comandas !== undefined ? config.comandas === true : modulos?.comandas === true
  const despachoOn = config.comandasDespacho !== undefined ? config.comandasDespacho === true : modulos?.comandas_despacho === true

  const guardar = async () => {
    if (!empresaId) { orionAlert('No se pudo identificar la empresa.', { tipo: 'error' }); return }
    setGuardando(true)
    try {
      // SOLO campos NO fiscales. Los fiscales y el certificado nunca se tocan desde
      // aquí (Panel One Geo). Lista explícita: las reglas rechazan cualquier otro.
      const campos = {
        nombreComercial: (config.nombreComercial || '').trim(),
        logoUrl: config.logoUrl || '',
        telefono: (config.telefono || '').trim(),
        correo: (config.correo || '').trim(),
        productosMayusculas: config.productosMayusculas !== false,
        requerirCaja: config.requerirCaja === true,
        pinAlCobrar: config.pinAlCobrar === true,
        venderSinStock: config.venderSinStock === true,
        descuentoMaxPct: Math.min(100, Math.max(0, parseFloat(config.descuentoMaxPct) || 0)),
        redondeoEfectivo: ['0.05', '0.25'].includes(String(config.redondeoEfectivo)) ? String(config.redondeoEfectivo) : '0',
        efectivoMaxGaveta: Math.max(0, parseFloat(config.efectivoMaxGaveta) || 0),
        ticketCopias: Number(config.ticketCopias) === 2 ? 2 : 1,
        ticketOpciones: {
          logo: config.ticketOpciones?.logo === true,
          atendio: config.ticketOpciones?.atendio !== false,
          desgloseIva: config.ticketOpciones?.desgloseIva !== false,
          noEsFactura: config.ticketOpciones?.noEsFactura === true,
        },
        diasAvisoVencimiento: Math.min(365, Math.max(0, parseInt(config.diasAvisoVencimiento) || 0)),
        costoPromedio: config.costoPromedio === true,
        comandas: comandasOn,
        comandasDespacho: comandasOn && despachoOn,
        tipoDtePorDefecto: config.tipoDtePorDefecto === 'CCF' ? 'CCF' : 'FE',
        ticketMensaje: (config.ticketMensaje || '').trim().slice(0, 80),
      }
      await setDoc(doc(db, 'configuracion', empresaId), { ...campos, updatedAt: serverTimestamp() }, { merge: true })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
    } catch (e) {
      orionAlert('Error al guardar: ' + e.message, { tipo: 'error' })
    }
    setGuardando(false)
  }

  const urlValida = config.logoUrl && config.logoUrl.startsWith('http') && config.logoUrl.length > 10
  const conGuardar = puedeEditar && (seccion === 'empresa' || seccion === 'pos')

  if (loading) return (
    <div className="empty-state">
      <div className="empty-icon">⏳</div>
      <div className="empty-text">Cargando configuración...</div>
    </div>
  )

  const direccionFiscal = [config.complemento, getNombreMun(config.codDep || config.departamento, config.codMun), getNombreDep(config.codDep || config.departamento)]
    .filter(Boolean).join(', ') || config.direccion || '—'
  const datosFiscales = [
    ['Razón social', config.empresaNombre],
    ['NIT', config.nit],
    ['NRC', config.nrc],
    ['Actividad económica', config.descActividad ? `${config.codActividad || ''} — ${config.descActividad}` : (config.actividadEconomica || config.codActividad)],
    ['Dirección', direccionFiscal],
    ['Tipo de establecimiento', TIPO_ESTABLECIMIENTO[config.tipoEstablecimiento] || config.tipoEstablecimiento],
    ['Cód. establecimiento (contribuyente)', config.codEstable],
    ['Cód. establecimiento MH', config.codEstableMH],
    ['Cód. punto de venta (contribuyente)', config.codPuntoVenta],
    ['Cód. punto de venta MH', config.codPuntoVentaMH],
  ]

  return (
    <>
      <style>{`
        .config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 768px) { .config-grid { grid-template-columns: 1fr; } }

        .cfg-num { display: flex; align-items: center; gap: 6px; flex-shrink: 0; font-size: 13px; color: var(--muted); font-weight: 600; }
        .cfg-num .input { width: 84px; text-align: right; height: 38px; font-family: var(--mono); }
        .config-tabs { display: flex; gap: 4px; margin-bottom: 18px; border-bottom: 1.5px solid var(--border); overflow-x: auto; }
        .config-tabs button { background: none; border: none; border-bottom: 2.5px solid transparent; color: var(--muted);
          font: inherit; font-size: 14px; font-weight: 700; padding: 10px 16px; cursor: pointer; margin-bottom: -1.5px; white-space: nowrap; }
        .config-tabs button:hover { color: var(--text); }
        .config-tabs button.on { color: var(--accent); border-bottom-color: var(--accent3); }

        .config-section {
          background: var(--surface); border: 1.5px solid var(--border);
          border-radius: 16px; overflow: hidden;
          box-shadow: 0 4px 20px var(--shadow2); margin-bottom: 20px;
        }
        .config-section-header {
          padding: 16px 22px; border-bottom: 1.5px solid var(--border);
          background: var(--surface2);
          display: flex; align-items: center; gap: 10px;
        }
        .config-section-icon {
          width: 36px; height: 36px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; background: var(--surface3);
        }
        .config-section-title { font-size: 14px; font-weight: 700; color: var(--text); }
        .config-section-body { padding: 22px; display: flex; flex-direction: column; gap: 16px; }
        @media (max-width: 520px) { .config-section-body { padding: 16px; } }

        .logo-preview {
          width: 100%; min-height: 90px;
          background: #ffffff; border-radius: 12px;
          border: 2px dashed var(--border2);
          display: flex; align-items: center; justify-content: center;
          overflow: hidden; margin-bottom: 4px;
        }
        .logo-preview img { max-width: 200px; max-height: 70px; object-fit: contain; }
        .logo-preview-empty { font-size: 12px; color: var(--muted); text-align: center; padding: 16px; }
        .logo-preview-error { font-size: 12px; color: var(--danger); text-align: center; padding: 16px; }

        .saved-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(0,194,150,0.12); color: #00C296; border: 1px solid rgba(0,194,150,0.2); padding: 6px 14px; border-radius: 99px; font-size: 13px; font-weight: 600; }

        .login-preview { background: #0a1628; border-radius: 14px; padding: 20px; display: flex; gap: 16px; align-items: center; min-height: 110px; }
        .preview-left { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .preview-orion-badge { background: rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 12px; font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 1px; }
        .preview-right { flex: 1.4; }
        .preview-empresa-card { background: white; border-radius: 10px; padding: 10px 16px; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; min-height: 48px; }
        .preview-empresa-card img { max-width: 130px; max-height: 34px; object-fit: contain; }
        .preview-empresa-nombre { font-size: 11px; font-weight: 700; color: #1B2E6B; text-align: center; }
        .preview-form-mock { display: flex; flex-direction: column; gap: 6px; }
        .preview-input-mock { height: 26px; background: rgba(255,255,255,0.05); border: 1px solid rgba(74,143,232,0.2); border-radius: 6px; }
        .preview-btn-mock { background: var(--accent); height: 26px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: white; }

        .fiscal-fila { display: grid; grid-template-columns: 170px 1fr; gap: 10px; font-size: 13px; padding: 8px 0; border-bottom: 1px solid var(--border); }
        .fiscal-fila:last-child { border-bottom: 0; }
        .fiscal-fila span:first-child { color: var(--muted); font-weight: 700; font-size: 12px; }
        @media (max-width: 520px) { .fiscal-fila { grid-template-columns: 1fr; gap: 2px; } }

        .seg { display: inline-flex; flex-shrink: 0; border: 1.5px solid var(--border); border-radius: 10px; overflow: hidden; }
        .seg button { font: inherit; font-size: 13px; font-weight: 700; padding: 8px 16px; border: none; background: var(--surface2); color: var(--muted); cursor: pointer; }
        .seg button.on { background: var(--accent); color: #fff; }
        .seg button:disabled { cursor: default; }
      `}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="titulo-con-menu">
          <div className="page-title">⚙️ Configuración</div>
          <div className="page-sub">Tu empresa, el punto de venta y los accesos</div>
        </div>
        {conGuardar && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {guardado && <span className="saved-badge">✅ Guardado</span>}
            <button className="btn btn-primary btn-lg" onClick={guardar} disabled={guardando}>
              {guardando ? '⏳ Guardando...' : '💾 Guardar cambios'}
            </button>
          </div>
        )}
      </div>

      <div className="config-tabs" role="tablist">
        {secciones.map(s => (
          <button key={s.key} role="tab" aria-selected={seccion === s.key} className={seccion === s.key ? 'on' : ''} onClick={() => irA(s.key)}>{s.label}</button>
        ))}
      </div>

      {/* ══════════ MI EMPRESA ══════════ */}
      {seccion === 'empresa' && (
        <div className="config-grid">
          <div>
            <div className="config-section">
              <div className="config-section-header">
                <div className="config-section-icon">🎨</div>
                <div className="config-section-title">Imagen y contacto</div>
              </div>
              <fieldset disabled={!puedeEditar} className="config-section-body" style={{ border: 'none', margin: 0, minWidth: 0 }}>
                <div className="form-group">
                  <label className="form-label">Logo de la empresa</label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label className="btn btn-primary" style={{ cursor: subiendoLogo ? 'wait' : 'pointer', opacity: subiendoLogo || !puedeEditar ? 0.6 : 1 }}>
                      {subiendoLogo ? '⏳ Subiendo...' : (config.logoUrl ? '🔄 Cambiar logo' : '📤 Subir logo')}
                      <input type="file" accept="image/*" style={{ display: 'none' }} disabled={subiendoLogo || !puedeEditar}
                        onChange={e => { const f = e.target.files?.[0]; if (f) subirLogo(f); e.target.value = '' }} />
                    </label>
                    {config.logoUrl && (
                      <button className="btn btn-danger" onClick={() => handleChange('logoUrl', '')} disabled={subiendoLogo}>🗑️ Quitar</button>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>PNG o JPG, máximo 2MB. Se recomienda fondo transparente.</div>
                </div>

                <div className="logo-preview">
                  {!config.logoUrl ? (
                    <div className="logo-preview-empty">🖼️ El logo aparecerá aquí<br />cuando lo subas</div>
                  ) : !urlValida || logoError ? (
                    <div className="logo-preview-error">⚠️ No se pudo cargar la imagen. Subila de nuevo.</div>
                  ) : (
                    <img src={config.logoUrl} alt="Logo" onError={() => setLogoError(true)} />
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">NOMBRE COMERCIAL</label>
                  <input className="input" placeholder="Nombre con el que te conocen tus clientes"
                    value={config.nombreComercial || ''} onChange={e => handleChange('nombreComercial', e.target.value)} />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">TELÉFONO</label>
                    <input className="input" placeholder="2222-3333" value={config.telefono || ''} onChange={e => handleChange('telefono', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">CORREO</label>
                    <input className="input" type="email" placeholder="info@empresa.com" value={config.correo || ''} onChange={e => handleChange('correo', e.target.value)} />
                  </div>
                </div>
              </fieldset>
            </div>
          </div>

          <div>
            <div className="config-section">
              <div className="config-section-header">
                <div className="config-section-icon">👁️</div>
                <div className="config-section-title">Así se ve tu inicio de sesión</div>
              </div>
              <div className="config-section-body">
                <div className="login-preview">
                  <div className="preview-left">
                    <div className="preview-orion-badge">⭐ ORIÓN</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: 1 }}>Sistema de Ventas</div>
                  </div>
                  <div className="preview-right">
                    <div className="preview-empresa-card">
                      {urlValida && !logoError
                        ? <img src={config.logoUrl} alt={config.empresaNombre || 'Logo'} onError={() => setLogoError(true)} />
                        : <div className="preview-empresa-nombre">{config.nombreComercial || config.empresaNombre || 'Tu Empresa'}</div>}
                    </div>
                    <div className="preview-form-mock">
                      <div className="preview-input-mock" />
                      <div className="preview-input-mock" />
                      <div className="preview-btn-mock">🔐 Ingresar</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="config-section">
              <div className="config-section-header">
                <div className="config-section-icon">🧾</div>
                <div className="config-section-title">Datos fiscales (DTE)</div>
              </div>
              <div className="config-section-body" style={{ gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                  🔒 Estos datos van en tus facturas y los registra <strong>One Geo Systems</strong> con el Ministerio de Hacienda. Si alguno cambió, contactá a soporte.
                </div>
                <div>
                  {datosFiscales.map(([etiqueta, valor]) => (
                    <div key={etiqueta} className="fiscal-fila"><span>{etiqueta}</span><span>{valor || '—'}</span></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ PUNTO DE VENTA ══════════ */}
      {seccion === 'pos' && (
        <div className="config-grid">
          <div>
            <div className="config-section">
              <div className="config-section-header">
                <div className="config-section-icon">🛒</div>
                <div className="config-section-title">Cobro</div>
              </div>
              <div className="config-section-body">
                <Opcion titulo="Exigir caja abierta para vender"
                  texto="El cajero tiene que abrir su caja (con el efectivo inicial) antes de poder cobrar. Así el cierre cuadra.">
                  <Interruptor etiqueta="Exigir caja abierta" activo={config.requerirCaja === true} disabled={!puedeEditar}
                    onChange={() => handleChange('requerirCaja', !(config.requerirCaja === true))} />
                </Opcion>
                <Opcion titulo="Pedir PIN de quien cobra"
                  texto="Para una gaveta compartida entre varias cajeras: la sesión es una sola y al tocar Cobrar se pide el PIN de quien cobra. Cada venta queda a su nombre y el cierre muestra quién vendió cuánto.">
                  <Interruptor etiqueta="PIN al cobrar" activo={config.pinAlCobrar === true} disabled={!puedeEditar}
                    onChange={() => handleChange('pinAlCobrar', !(config.pinAlCobrar === true))} />
                </Opcion>
                <Opcion titulo="Documento con el que abre el cobro"
                  texto="Si casi todos tus clientes piden Crédito Fiscal, elegí CCF. Igual se puede cambiar en cada venta (F5 / F6).">
                  <div className="seg" role="group" aria-label="Documento por defecto">
                    {['FE', 'CCF'].map(t => (
                      <button key={t} type="button" disabled={!puedeEditar} aria-pressed={(config.tipoDtePorDefecto || 'FE') === t}
                        className={(config.tipoDtePorDefecto || 'FE') === t ? 'on' : ''} onClick={() => handleChange('tipoDtePorDefecto', t)}>{t}</button>
                    ))}
                  </div>
                </Opcion>
                <Opcion titulo="Comandas / vales"
                  texto="El vendedor arma un vale en el mostrador y el cajero lo cobra después. Activa la pestaña Comandas en el POS y la opción «solo arma comandas» en Usuarios.">
                  <Interruptor etiqueta="Comandas / vales" activo={comandasOn} disabled={!puedeEditar}
                    onChange={() => handleChange('comandas', !comandasOn)} />
                </Opcion>
                {comandasOn && (
                  <Opcion titulo="Control de despacho"
                    texto="Agrega el paso «Para despachar»: después de cobrar, alguien marca el vale como entregado (bodeguero o el mismo vendedor).">
                    <Interruptor etiqueta="Control de despacho" activo={despachoOn} disabled={!puedeEditar}
                      onChange={() => handleChange('comandasDespacho', !despachoOn)} />
                  </Opcion>
                )}
                <Opcion titulo="Vender sin existencias"
                  texto="Deja cobrar un producto aunque el stock esté en 0 (queda en negativo hasta que registres la compra). Útil cuando el producto llega antes de anotarlo.">
                  <Interruptor etiqueta="Vender sin existencias" activo={config.venderSinStock === true} disabled={!puedeEditar}
                    onChange={() => handleChange('venderSinStock', !(config.venderSinStock === true))} />
                </Opcion>
                <Opcion titulo="Descuento máximo sin autorización"
                  texto="Porcentaje que una cajera puede dar por su cuenta. Arriba de eso, el POS pide el PIN de alguien con el permiso «Autorizar descuentos» (o un administrador). 0 = sin límite.">
                  <div className="cfg-num"><input className="input" type="number" min="0" max="100" step="1" inputMode="numeric" disabled={!puedeEditar}
                    value={config.descuentoMaxPct ?? 0} onChange={e => handleChange('descuentoMaxPct', e.target.value)} /><span>%</span></div>
                </Opcion>
                <Opcion titulo="Redondeo del efectivo"
                  texto="Al pagar en efectivo, el total se redondea hacia abajo a favor del cliente para no andar con centavos. El documento sale con el monto exacto; el redondeo queda anotado en la venta y en la caja.">
                  <div className="seg" role="group" aria-label="Redondeo del efectivo">
                    {[['0', 'Sin'], ['0.05', '5 ¢'], ['0.25', '25 ¢']].map(([v, l]) => (
                      <button key={v} type="button" disabled={!puedeEditar} aria-pressed={String(config.redondeoEfectivo || '0') === v}
                        className={String(config.redondeoEfectivo || '0') === v ? 'on' : ''} onClick={() => handleChange('redondeoEfectivo', v)}>{l}</button>
                    ))}
                  </div>
                </Opcion>
                <Opcion titulo="Efectivo máximo en gaveta"
                  texto="Cuando el efectivo esperado en la gaveta pase de este monto, el POS avisa para hacer un retiro y guardarlo. 0 = sin aviso.">
                  <div className="cfg-num"><span>$</span><input className="input" type="number" min="0" step="10" inputMode="decimal" disabled={!puedeEditar}
                    value={config.efectivoMaxGaveta ?? 0} onChange={e => handleChange('efectivoMaxGaveta', e.target.value)} /></div>
                </Opcion>
              </div>
            </div>
          </div>
          <div>
            <div className="config-section">
              <div className="config-section-header">
                <div className="config-section-icon">🧾</div>
                <div className="config-section-title">Tickets y productos</div>
              </div>
              <div className="config-section-body">
                <div className="form-group">
                  <label className="form-label">MENSAJE AL PIE DEL TICKET</label>
                  <input className="input" maxLength={80} disabled={!puedeEditar} placeholder="¡Gracias por su compra!"
                    value={config.ticketMensaje || ''} onChange={e => handleChange('ticketMensaje', e.target.value)} />
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    Ej.: «Cambios solo con ticket, 8 días» o tus redes sociales. Vacío = «¡Gracias por su compra!». {(config.ticketMensaje || '').length}/80
                  </div>
                </div>
                <Opcion titulo="Copias del ticket"
                  texto="Cuántos tickets se imprimen por venta. Dos sirve para crédito o para que uno quede en la gaveta.">
                  <div className="seg" role="group" aria-label="Copias del ticket">
                    {[1, 2].map(n => (
                      <button key={n} type="button" disabled={!puedeEditar} aria-pressed={(Number(config.ticketCopias) || 1) === n}
                        className={(Number(config.ticketCopias) || 1) === n ? 'on' : ''} onClick={() => handleChange('ticketCopias', n)}>{n}</button>
                    ))}
                  </div>
                </Opcion>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Qué lleva el ticket</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, marginBottom: 8, lineHeight: 1.45 }}>Los datos fiscales, el detalle y el QR van siempre. Esto es lo opcional.</div>
                  {[
                    ['logo', 'Logo de la empresa arriba', 'Necesita un logo cargado en «Mi empresa». En impresora térmica sale en blanco y negro.'],
                    ['atendio', '«Le atendió: nombre»', 'Sale cuando la venta tiene a alguien que cobró (PIN al cobrar).'],
                    ['desgloseIva', 'Desglose del IVA', 'La línea «IVA 13%» en los totales (en factura de consumidor el IVA ya va incluido en los precios).'],
                    ['noEsFactura', 'Aviso «Este comprobante no sustituye la factura electrónica»', 'Para tickets de cortesía o cuando el DTE se envía por correo.'],
                  ].map(([k, t, d]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderTop: '1px solid var(--border)' }}>
                      <div><div style={{ fontSize: 13, fontWeight: 600 }}>{t}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{d}</div></div>
                      <Interruptor etiqueta={t} disabled={!puedeEditar}
                        activo={k === 'atendio' || k === 'desgloseIva' ? config.ticketOpciones?.[k] !== false : config.ticketOpciones?.[k] === true}
                        onChange={() => handleChange('ticketOpciones', { ...(config.ticketOpciones || {}), [k]: !(k === 'atendio' || k === 'desgloseIva' ? config.ticketOpciones?.[k] !== false : config.ticketOpciones?.[k] === true) })} />
                    </div>
                  ))}
                </div>
                <Opcion titulo="Nombres de productos en MAYÚSCULAS"
                  texto="Al crear, importar o escanear un producto, el nombre se guarda en mayúsculas (útil en ferreterías). Apagalo para farmacias o boutiques. No cambia los productos que ya existen.">
                  <Interruptor etiqueta="Nombres en mayúsculas" activo={config.productosMayusculas !== false} disabled={!puedeEditar}
                    onChange={() => handleChange('productosMayusculas', config.productosMayusculas === false)} />
                </Opcion>
              </div>
            </div>
            <div className="config-section">
              <div className="config-section-header">
                <div className="config-section-icon">📦</div>
                <div className="config-section-title">Inventario y compras</div>
              </div>
              <div className="config-section-body">
                <Opcion titulo="Aviso de vencimiento"
                  texto="Los productos con fecha de vencimiento dentro de estos días aparecen como «por vencer» en Inventario y en el Dashboard. 0 = sin aviso.">
                  <div className="cfg-num"><input className="input" type="number" min="0" max="365" step="1" inputMode="numeric" disabled={!puedeEditar}
                    value={config.diasAvisoVencimiento ?? 15} onChange={e => handleChange('diasAvisoVencimiento', e.target.value)} /><span>días</span></div>
                </Opcion>
                <Opcion titulo="Costo promedio"
                  texto="Al registrar una compra, el costo del producto se calcula como promedio ponderado entre lo que había y lo que entra. Apagado = se queda con el último costo de compra.">
                  <Interruptor etiqueta="Costo promedio" activo={config.costoPromedio === true} disabled={!puedeEditar}
                    onChange={() => handleChange('costoPromedio', !(config.costoPromedio === true))} />
                </Opcion>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ HORARIO Y ACCESOS ══════════ */}
      {seccion === 'horario' && (
        <HorarioAccesos empresaId={empresaId} horarioNegocio={config.horario} puedeEditarNegocio={puedeEditar}
          onGuardado={h => setConfig(c => ({ ...c, horario: h }))} />
      )}

      {/* ══════════ MI PLAN ══════════ */}
      {seccion === 'plan' && <PlanUso empresaId={empresaId} />}

      {/* ══════════ SEGURIDAD ══════════ */}
      {seccion === 'seguridad' && (
        <div style={{ maxWidth: 560 }}><CambiarPassword /></div>
      )}

      {!puedeEditar && (seccion === 'empresa' || seccion === 'pos') && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Solo lectura: para cambiar estos datos se necesita el permiso «Editar configuración».</div>
      )}
    </>
  )
}
