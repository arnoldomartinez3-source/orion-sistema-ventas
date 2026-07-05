import { useState, useEffect } from 'react'
import { db } from '../firebase'
import {
  collection, doc, getDoc, deleteDoc, addDoc,
  query, where, getDocs, onSnapshot, serverTimestamp
} from 'firebase/firestore'
import { useAuth } from '../AuthContext'
import GestionContribuyentes from './GestionContribuyentes'
import { TIPOS_CERTIFICADOS, CANTIDADES_SUGERIDAS } from '../data/catalogoDTE'
import {
  generarVentaFE, generarVentaCCF, generarVentaNC,
  generarVentaND, generarVentaFEX, generarVentaFSE, generarVentaNR,
  generarVentaRetencion,
} from '../data/datosPrueba'

// Endpoint de transmisión (mismo que usa el sistema, en api/dte/)
const ENDPOINT_TRANSMITIR = '/api/dte/transmitir'

// Convierte una fecha del MH (dd/MM/yyyy o yyyy-MM-dd) a ISO yyyy-MM-dd.
// El MH exige yyyy-MM-dd en documentoRelacionado/fechaEmision.
function aFechaISO(fecha) {
  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' }) // en-CA da yyyy-MM-dd
  if (!fecha || typeof fecha !== 'string') return hoyISO
  // Si ya viene como yyyy-MM-dd (con o sin hora), tomar los primeros 10
  if (/^\d{4}-\d{2}-\d{2}/.test(fecha)) return fecha.slice(0, 10)
  // Si viene como dd/MM/yyyy (con o sin hora), reordenar
  const m = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return hoyISO
}

// ══════════════════════════════════════════════════════════════════
// ASISTENTE DE CERTIFICACIÓN — pantalla principal
// ══════════════════════════════════════════════════════════════════
export default function AsistenteCertificacion() {
  const { user } = useAuth()

  const [flagEncendido, setFlagEncendido] = useState(false)
  const [loading, setLoading] = useState(true)
  const [contribuyentes, setContribuyentes] = useState([])
  const [tipoActivo, setTipoActivo] = useState('FE')
  const [cantidades, setCantidades] = useState({ ...CANTIDADES_SUGERIDAS })
  const [generado, setGenerado] = useState(null)   // { tipo, venta, ventaId, estado }
  const [trabajando, setTrabajando] = useState(false)
  const [log, setLog] = useState([])               // historial de resultados
  const [ultimoCCFProcesado, setUltimoCCFProcesado] = useState(null)
  const [modalContrib, setModalContrib] = useState(false)  // modal gestión contribuyentes
  const [empresas, setEmpresas] = useState([])
  const [empresaCert, setEmpresaCert] = useState('')       // empresa BAJO LA CUAL se certifica (sus credenciales)

  // ── Cargar flag (una vez) ──
  useEffect(() => {
    getDoc(doc(db, 'configuracion', 'global'))
      .then(s => { if (s.exists()) setFlagEncendido(s.data().modoCertificacion === true) })
      .catch(e => console.error('Error cargando config:', e))
      .finally(() => setLoading(false))
  }, [])

  // ── Contribuyentes en vivo (se actualizan al agregar/borrar desde el modal) ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'contribuyentes_prueba'), snap => {
      setContribuyentes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, e => console.error('Error contribuyentes:', e))
    return () => unsub()
  }, [])

  // ── Empresas: se elige BAJO CUÁL certificar (usa sus credenciales de prueba).
  // Clave: los DTE de prueba deben emitirse con las credenciales de una empresa
  // en ambiente 00 (ej. "One Geo PRUEBAS"), no las de producción. Por defecto se
  // preselecciona la marcada como empresa de pruebas.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'empresas'), snap => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setEmpresas(lista)
      setEmpresaCert(prev => prev || (lista.find(e => e.esPruebas)?.id || lista[0]?.id || ''))
    }, e => console.error('Error empresas:', e))
    return () => unsub()
  }, [])

  const agregarLog = (entrada) => setLog(prev => [entrada, ...prev].slice(0, 50))

  // ── Generar UNA venta de prueba del tipo activo ──
  // Genera una venta del tipo activo (pura — no toca estado). Devuelve null si falta requisito.
  // Recibe ccfActual opcional para evitar usar el estado stale dentro de un loop async.
  const construirVenta = (tipo, ccfActual = null) => {
    if (tipo === 'FE') return generarVentaFE()
    if (tipo === 'FEX') return generarVentaFEX()
    if (tipo === 'FSE') return generarVentaFSE()
    if (tipo === 'CCF') {
      if (contribuyentes.length === 0) throw new Error('Cargá al menos un contribuyente real para los CCF.')
      const c = contribuyentes[Math.floor(Math.random() * contribuyentes.length)]
      return generarVentaCCF(c)
    }
    if (tipo === 'CR') {
      if (contribuyentes.length === 0) throw new Error('Cargá al menos un contribuyente real para la Retención.')
      const c = contribuyentes[Math.floor(Math.random() * contribuyentes.length)]
      return generarVentaRetencion(c)
    }
    if (tipo === 'NR') {
      // NR usa contribuyente real si existe (más realista). Sino, ficticio.
      const c = contribuyentes.length > 0
        ? contribuyentes[Math.floor(Math.random() * contribuyentes.length)]
        : null
      return generarVentaNR(c)
    }
    if (tipo === 'NC' || tipo === 'ND') {
      const ccfRef = ccfActual || ultimoCCFProcesado
      if (!ccfRef) throw new Error(`${tipo} requiere un CCF ya transmitido y PROCESADO.`)
      return tipo === 'NC' ? generarVentaNC(ccfRef) : generarVentaND(ccfRef)
    }
    throw new Error(`Tipo ${tipo} no implementado en construirVenta.`)
  }

  const generarUno = () => {
    try {
      const venta = construirVenta(tipoActivo)
      setGenerado({ tipo: tipoActivo, venta, ventaId: null, estado: 'generado' })
    } catch (e) {
      alert('Error al generar: ' + e.message)
    }
  }

  // Transmite una venta dada. Devuelve {entrada, ccfRef} para poder encadenar.
  // No depende del estado `generado` — recibe la venta como parámetro.
  const transmitirVenta = async (venta, tipo) => {
    // 1) Crear la venta de prueba en Firestore
    const ventaRef = await addDoc(collection(db, 'ventas'), {
      ...venta,
      _esPrueba: true,
      _certificacion: true,
      // empresaId = empresa BAJO la que se certifica → el backend usa SUS
      // credenciales de prueba (no el fallback, que tomaba las de producción).
      empresaId: empresaCert || '',
      cajero: user?.displayName || user?.email || 'Certificación',
      cajeroId: user?.uid || '',
      estado: 'completada',
      createdAt: serverTimestamp(),
    })

    // 2) Llamar al endpoint de transmisión
    const resp = await fetch(ENDPOINT_TRANSMITIR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ventaId: ventaRef.id, ambiente: '00' }),
    })
    const data = await resp.json()

    const entrada = {
      tipo,
      ventaId: ventaRef.id,
      codigoGeneracion: venta.codigoGeneracion,
      estado: data.estado || (resp.ok ? 'PROCESADO' : 'RECHAZADO'),
      sello: data.selloRecibido || null,
      observaciones: data.observaciones || data.descripcionMsg || data.error || null,
      descripcionMsg: data.detalleMH?.descripcionMsg || data.descripcionMsg || null,
      codigoMsg: data.detalleMH?.codigoMsg || data.codigoMsg || null,
      ts: new Date().toLocaleTimeString('es-SV'),
    }

    // Si fue CCF procesado, devolvemos el ref para encadenar NC/ND
    let ccfRef = null
    if (tipo === 'CCF' && entrada.estado === 'PROCESADO') {
      ccfRef = {
        codigoGeneracion: venta.codigoGeneracion,
        fechaEmision: aFechaISO(data.fhProcesamiento),
        contribuyente: contribuyentes.find(c => c.nombre === venta.cliente) || contribuyentes[0],
        items: venta.items,
      }
    }

    return { entrada, ccfRef, ventaId: ventaRef.id }
  }

  // ── Transmitir la venta generada (acción manual del botón "Transmitir") ──
  const transmitir = async () => {
    if (!generado?.venta) return
    setTrabajando(true)
    try {
      const { entrada, ccfRef, ventaId } = await transmitirVenta(generado.venta, generado.tipo)
      agregarLog(entrada)
      if (ccfRef) setUltimoCCFProcesado(ccfRef)
      setGenerado(g => g ? { ...g, ventaId, estado: entrada.estado } : g)
    } catch (e) {
      agregarLog({
        tipo: generado.tipo, estado: 'ERROR',
        observaciones: e.message, ts: new Date().toLocaleTimeString('es-SV'),
      })
    }
    setTrabajando(false)
  }

  // ── LOTE: generar y transmitir N pruebas seguidas hasta llegar a la meta ──
  // Para NC/ND: requiere un CCF procesado (encadena automáticamente si se interrumpe).
  // Se detiene si ocurren 3 rechazos seguidos (para no quemar pruebas si algo está mal).
  const [progresoLote, setProgresoLote] = useState(null) // { hechas, meta, fallosSeguidos }
  const generarYTransmitirLote = async () => {
    const tipo = tipoActivo
    const meta = cantidades[tipo] || 0
    const yaProcesadas = procesadasPorTipo(tipo)
    const faltan = meta - yaProcesadas
    if (faltan <= 0) {
      alert(`${tipo}: ya alcanzaste la meta de ${meta} pruebas procesadas.`)
      return
    }
    if (!confirm(
      `Vas a generar y transmitir ${faltan} ${tipo} seguidas.\n` +
      ((tipo === 'NC' || tipo === 'ND')
        ? `\nNota: cada ${tipo} requiere un CCF nuevo (se generarán automáticamente). Esto consumirá también ${faltan} CCF.\n`
        : '') +
      `\n¿Continuar?`
    )) return

    setTrabajando(true)
    let hechas = 0
    let fallosSeguidos = 0
    let ccfLocal = ultimoCCFProcesado  // copia local para no depender del estado React (stale)

    for (let i = 0; i < faltan; i++) {
      try {
        // Para NC/ND: generar y transmitir un CCF fresco ANTES de cada una.
        // Razón: una NC/ND no puede acreditar más de lo que el CCF facturó.
        // En lote, asegurarse de tener un CCF nuevo por cada NC/ND evita
        // rechazos por sobrepasar el monto facturado.
        if (tipo === 'NC' || tipo === 'ND') {
          const ccfVenta = construirVenta('CCF')
          const ccfResult = await transmitirVenta(ccfVenta, 'CCF')
          agregarLog(ccfResult.entrada)
          if (!ccfResult.ccfRef) {
            // El CCF falló — no podemos hacer la NC/ND. Saltamos esta iteración.
            fallosSeguidos++
            if (fallosSeguidos >= 3) {
              agregarLog({ tipo, estado: 'ERROR', observaciones: 'Lote detenido: 3 CCF rechazados seguidos', ts: new Date().toLocaleTimeString('es-SV') })
              break
            }
            continue
          }
          ccfLocal = ccfResult.ccfRef
          setUltimoCCFProcesado(ccfResult.ccfRef)
          await new Promise(r => setTimeout(r, 300))
        }

        const venta = construirVenta(tipo, ccfLocal)
        const { entrada, ccfRef } = await transmitirVenta(venta, tipo)
        agregarLog(entrada)
        if (ccfRef) {
          ccfLocal = ccfRef
          setUltimoCCFProcesado(ccfRef)
        }
        hechas++
        if (entrada.estado === 'PROCESADO') fallosSeguidos = 0
        else {
          fallosSeguidos++
          if (fallosSeguidos >= 3) {
            agregarLog({ tipo, estado: 'ERROR', observaciones: 'Lote detenido: 3 rechazos seguidos', ts: new Date().toLocaleTimeString('es-SV') })
            break
          }
        }
        setProgresoLote({ hechas, meta: faltan, fallosSeguidos })
        // pausa corta entre llamadas para no saturar el endpoint del MH
        await new Promise(r => setTimeout(r, 300))
      } catch (e) {
        agregarLog({ tipo, estado: 'ERROR', observaciones: e.message, ts: new Date().toLocaleTimeString('es-SV') })
        fallosSeguidos++
        if (fallosSeguidos >= 3) break
      }
    }
    setProgresoLote(null)
    setTrabajando(false)
  }

  // ── Limpiar ventas de prueba de Firestore ──
  const limpiarPruebas = async () => {
    if (!confirm('¿Borrar todas las ventas de prueba de certificación? Esto no afecta ventas reales.')) return
    setTrabajando(true)
    try {
      const q = query(collection(db, 'ventas'), where('_certificacion', '==', true))
      const snap = await getDocs(q)
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'ventas', d.id))))
      setLog([])
      setGenerado(null)
      setUltimoCCFProcesado(null)
      alert(`Se borraron ${snap.size} ventas de prueba.`)
    } catch (e) {
      alert('Error al limpiar: ' + e.message)
    }
    setTrabajando(false)
  }

  // ── Conteo de procesadas por tipo (desde el log) ──
  const procesadasPorTipo = (tipoCode) =>
    log.filter(l => l.tipo === tipoCode && l.estado === 'PROCESADO').length

  // El render se completa en la siguiente parte del archivo.
  return renderUI({
    user, flagEncendido, loading, contribuyentes,
    tipoActivo, setTipoActivo, cantidades, setCantidades,
    generado, trabajando, log, ultimoCCFProcesado,
    generarUno, transmitir, limpiarPruebas, procesadasPorTipo,
    generarYTransmitirLote, progresoLote,
    modalContrib, setModalContrib,
  })
}

// ══════════════════════════════════════════════════════════════════
// UI del Asistente (separada para mantener la lógica arriba legible)
// ══════════════════════════════════════════════════════════════════
function renderUI(p) {
  const {
    flagEncendido, loading, contribuyentes,
    tipoActivo, setTipoActivo, cantidades, setCantidades,
    generado, trabajando, log,
    generarUno, transmitir, limpiarPruebas, procesadasPorTipo,
    generarYTransmitirLote, progresoLote,
    modalContrib, setModalContrib,
  } = p

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>⏳ Cargando asistente...</div>
  }

  return (
    <>
      <style>{certStyles}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">🏅 Asistente de Certificación</div>
          <div className="page-sub" style={{ marginTop: 4 }}>
            Genera los DTE de prueba para certificar ante el MH
          </div>
        </div>
      </div>

      {/* BANNER MODO CERTIFICACIÓN */}
      <div className="cert-banner">
        <span style={{ fontSize: 20 }}>🛡️</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            Modo certificación activo · ambiente de pruebas (00)
          </div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>
            Solo visible para tu usuario maestro. Apágalo desde Configuración al entregar el sistema.
          </div>
        </div>
      </div>

      {/* EMPRESA BAJO LA QUE SE CERTIFICA (define las credenciales de prueba) */}
      <div className="cert-card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🏢 Certificar bajo la empresa</div>
        <select className="input" value={empresaCert} onChange={e => setEmpresaCert(e.target.value)} style={{ maxWidth: 440 }}>
          {empresas.length === 0 && <option value="">(cargando empresas…)</option>}
          {empresas.map(e => (
            <option key={e.id} value={e.id}>
              {e.nombreComercial || e.nombre || e.id}{e.esPruebas ? ' · 🔬 PRUEBAS' : ''}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          Los DTE de prueba se emiten con las <strong>credenciales de esta empresa</strong>. Elegí una de <strong>pruebas</strong> (ambiente 00) — no una que ya esté en producción.
        </div>
      </div>

      {/* CONTRIBUYENTES REALES */}
      <div className="cert-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            👥 Contribuyentes reales para CCF/NC/ND ({contribuyentes.length})
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setModalContrib(true)}>
            ⚙️ Gestionar
          </button>
        </div>
        {contribuyentes.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
            ⚠️ No hay contribuyentes reales cargados. Los CCF/NC/ND los necesitan
            (el MH valida el NIT/NRC). Tocá <strong>Gestionar</strong> para agregarlos.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {contribuyentes.map(c => (
              <span key={c.id} className="cert-pill cert-pill-real">
                {c.nombre} · NIT {c.nit}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* GRID DE TIPOS */}
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
        Elegí el tipo de DTE, indicá cuántas pruebas y generá una a una:
      </div>
      <div className="cert-grid">
        {TIPOS_CERTIFICADOS.map(t => {
          const procesadas = procesadasPorTipo(t.code)
          const meta = cantidades[t.code] || 0
          const pct = meta > 0 ? Math.min(100, Math.round((procesadas / meta) * 100)) : 0
          const sel = tipoActivo === t.code
          // Un solo onPointerDown en el contenedor — gana al focus de inputs
          // (selecciona al primer toque). Marcamos el input para que su click
          // no propague hacia arriba y no cambie de tarjeta sin querer.
          return (
            <div key={t.code} className={`cert-card cert-tipo ${sel ? 'sel' : ''}`}
              onPointerDown={() => setTipoActivo(t.code)}>
              <div className="cert-tipo-nombre">{t.icon} {t.code}</div>
              <div className="cert-tipo-desc">{t.nombre}</div>
              <div className="cert-row" onPointerDown={e => e.stopPropagation()}>
                <input className="input cert-qty" type="number" min="0"
                  value={cantidades[t.code] ?? 0}
                  onChange={e => setCantidades(prev => ({ ...prev, [t.code]: parseInt(e.target.value) || 0 }))} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>pruebas</span>
              </div>
              <div className="cert-bar"><div className="cert-fill" style={{ width: `${pct}%` }} /></div>
              <div style={{ fontSize: 11, color: procesadas > 0 ? '#00C296' : 'var(--muted)', marginTop: 4 }}>
                {procesadas}/{meta} procesadas
                {t.requiereDocRelacionado && procesadas === 0 ? ' · requiere CCF' : ''}
              </div>
            </div>
          )
        })}
      </div>

      {/* ACCIONES GENERAR */}
      <div style={{ display: 'flex', gap: 10, margin: '14px 0', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={generarUno} disabled={trabajando}>
          ⚡ Generar {tipoActivo}
        </button>
        <button className="btn btn-primary" onClick={generarYTransmitirLote} disabled={trabajando}
          style={{ background: '#00966f' }}>
          🚀 Generar y transmitir lote
        </button>
        <button className="btn btn-ghost" onClick={limpiarPruebas} disabled={trabajando}>
          🗑️ Limpiar pruebas
        </button>
      </div>

      {/* PROGRESO DEL LOTE */}
      {progresoLote && (
        <div style={{ background: 'var(--surface2)', padding: 10, borderRadius: 8, marginBottom: 10, fontSize: 13 }}>
          🔄 Lote en progreso: <strong>{progresoLote.hechas} / {progresoLote.meta}</strong>
          {progresoLote.fallosSeguidos > 0 && <span style={{ color: '#ef4444', marginLeft: 10 }}>
            ⚠️ {progresoLote.fallosSeguidos} rechazos seguidos
          </span>}
        </div>
      )}

      {/* PANEL DE REVISIÓN */}
      {generado && (
        <div className="cert-card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              Revisar antes de transmitir · {generado.tipo}
            </div>
            <span className={`cert-pill ${
              generado.estado === 'PROCESADO' ? 'cert-pill-ok'
              : generado.estado === 'RECHAZADO' || generado.estado === 'ERROR' ? 'cert-pill-bad'
              : 'cert-pill-gray'}`}>
              {generado.estado}
            </span>
          </div>
          <pre className="cert-json">{JSON.stringify(generado.venta, null, 2)}</pre>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={generarUno} disabled={trabajando}>
              🔄 Regenerar
            </button>
            <button className="btn btn-primary btn-sm" onClick={transmitir}
              disabled={trabajando || generado.estado === 'PROCESADO'}>
              {trabajando ? '⏳ Transmitiendo...' : '📤 Transmitir a MH'}
            </button>
          </div>
        </div>
      )}

      {/* LOG DE RESULTADOS */}
      {log.length > 0 && (
        <div className="cert-card">
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            📋 Historial de transmisiones ({log.length})
          </div>
          <div className="cert-log">
            {log.map((l, i) => (
              <div key={i} className="cert-log-row">
                <span className={`cert-dot ${
                  l.estado === 'PROCESADO' ? 'ok'
                  : l.estado === 'RECHAZADO' || l.estado === 'ERROR' ? 'bad' : 'gray'}`} />
                <span style={{ fontWeight: 700, minWidth: 40 }}>{l.tipo}</span>
                <span style={{ flex: 1, color: 'var(--muted)', fontSize: 11 }}>
                  {l.estado}
                  {l.descripcionMsg ? ` · ${l.descripcionMsg}` : ''}
                  {l.observaciones && (Array.isArray(l.observaciones) ? l.observaciones.length > 0 : true)
                    ? ` · ${typeof l.observaciones === 'string' ? l.observaciones : JSON.stringify(l.observaciones)}` : ''}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{l.ts}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* MODAL GESTIÓN DE CONTRIBUYENTES */}
      {modalContrib && (
        <GestionContribuyentes onCerrar={() => setModalContrib(false)} />
      )}
    </>
  )
}

const certStyles = `
  .cert-banner {
    display: flex; align-items: center; gap: 12px;
    background: rgba(245,158,11,0.12); border: 1.5px solid rgba(245,158,11,0.3);
    border-radius: 14px; padding: 12px 16px; margin-bottom: 16px; color: #b45309;
  }
  .cert-card {
    background: var(--surface); border: 1.5px solid var(--border);
    border-radius: 14px; padding: 14px 16px;
  }
  .cert-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .cert-tipo { cursor: pointer; transition: all 0.18s; user-select: none; }
  .cert-tipo:hover { border-color: var(--border2); transform: translateY(-1px); }
  .cert-tipo.sel {
    border-color: var(--accent);
    border-width: 2px;
    background: linear-gradient(135deg, rgba(27,46,107,0.10), rgba(27,46,107,0.04));
    box-shadow: 0 0 0 3px rgba(27,46,107,0.15), 0 4px 12px rgba(27,46,107,0.18);
    transform: translateY(-1px);
  }
  .cert-tipo.sel .cert-tipo-nombre { color: var(--accent); }
  .cert-tipo-nombre { font-size: 14px; font-weight: 800; }
  .cert-tipo-desc { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .cert-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
  .cert-qty { width: 64px; }
  .cert-bar { height: 5px; background: var(--surface2); border-radius: 99px; overflow: hidden; margin-top: 8px; }
  .cert-fill { height: 100%; background: #00C296; transition: width 0.3s; }
  .cert-pill { font-size: 11px; padding: 3px 10px; border-radius: 99px; font-weight: 700; }
  .cert-pill-real { background: rgba(245,158,11,0.12); color: #b45309; border: 1px solid rgba(245,158,11,0.25); }
  .cert-pill-ok { background: rgba(0,194,150,0.12); color: #00966f; }
  .cert-pill-bad { background: rgba(239,68,68,0.12); color: #ef4444; }
  .cert-pill-gray { background: var(--surface2); color: var(--muted); }
  .cert-json {
    background: var(--surface2); border-radius: 10px; padding: 12px;
    font-family: var(--mono); font-size: 11px; color: var(--text2);
    max-height: 280px; overflow: auto; white-space: pre-wrap; word-break: break-word;
  }
  .cert-log { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; }
  .cert-log-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; background: var(--surface2); font-size: 12px; }
  .cert-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .cert-dot.ok { background: #00C296; }
  .cert-dot.bad { background: #ef4444; }
  .cert-dot.gray { background: var(--muted); }
`
