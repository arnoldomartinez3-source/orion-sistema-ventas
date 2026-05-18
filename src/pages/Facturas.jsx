import { useState, useEffect } from 'react'
import BuscadorActividad from '../components/BuscadorActividad'
import SelectorDepartamento from '../components/SelectorDepartamento'
import { buildComplemento } from '../data/departamentosMunicipios'
import { db } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, getDoc,
  getDocs, query, where
} from 'firebase/firestore'
import { useAuth } from '../AuthContext'
import { usePermisos } from '../PermisosContext'

const TIPOS_DTE = [
  { codigo: 'FE',   nombre: 'Factura de Consumidor Final',  desc: 'Para personas sin NRC',   color: '#00d4aa' },
  { codigo: 'CCF',  nombre: 'Comprobante de Credito Fiscal', desc: 'Para empresas con NRC',   color: '#4f8cff' },
  { codigo: 'NC',   nombre: 'Nota de Credito',              desc: 'Anular o ajustar factura', color: '#f59e0b' },
  { codigo: 'ND',   nombre: 'Nota de Debito',               desc: 'Cobros adicionales',       color: '#8b5cf6' },
  { codigo: 'FEX',  nombre: 'Factura de Exportacion',       desc: 'Ventas al extranjero',     color: '#ec4899' },
  { codigo: 'NR',   nombre: 'Nota de Remision',             desc: 'Envio sin cobro',          color: '#6b7280' },
]

const ESTADOS_PAGO = [
  { value: 'pagada',    label: 'Pagada',    color: '#00d4aa' },
  { value: 'pendiente', label: 'Pendiente', color: '#f59e0b' },
  { value: 'vencida',   label: 'Vencida',   color: '#ef4444' },
  { value: 'anulada',   label: 'Anulada',   color: '#6b7280' },
]

// Tipos con plazo de 24 horas para anulación
const TIPOS_24H = ['CCF', 'NC', 'ND']
// Tipos con plazo de 3 meses para anulación
const TIPOS_3M  = ['FE', 'FEX', 'FSEE', 'NR']

const MOTIVOS_ANULACION = [
  { value: '1', label: '01 — Error en monto' },
  { value: '2', label: '02 — Error en datos del receptor' },
  { value: '3', label: '03 — Error en descripcion de bienes/servicios' },
  { value: '4', label: '04 — Operacion no realizada' },
  { value: '5', label: '05 — Otro' },
]

// Devuelve la fecha actual en zona America/El_Salvador (UTC-6), formato YYYY-MM-DD.
// Necesario porque new Date().toISOString() devuelve UTC, lo que en horarios
// nocturnos SV (después de 6PM) genera fechas del día siguiente.
function fechaSV() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
}

const emptyForm = {
  tipoDte: 'FE', cliente: '', nit: '', nrc: '', direccion: '',
  descripcion: '', subtotal: '', iva: '', total: '',
  estadoPago: 'pagada',
  fechaEmision: fechaSV(),
  fechaVencimiento: '', notas: '',
}

const emptyAnulacion = {
  motivo: '1',
  motivoDetalle: '',
  tipoInvalidacion: '1',
}

const factStyles = `
  .fact-resumen { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 20px; }
  @media (max-width: 900px) { .fact-resumen { grid-template-columns: repeat(2,1fr); } }

  .resumen-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; padding: 18px 20px; box-shadow: 0 4px 20px var(--shadow2); position: relative; overflow: hidden; }
  .resumen-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background: var(--rc-color, var(--accent)); }
  .resumen-val { font-size: 24px; font-weight: 800; font-family: var(--mono); margin: 6px 0 3px; letter-spacing: -1px; }
  .resumen-label { font-size: 11px; color: var(--muted); letter-spacing: 0.8px; font-weight: 700; text-transform: uppercase; }
  .resumen-sub { font-size: 12px; color: var(--muted); }

  .filtros-bar { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; align-items: center; }
  .filtros-bar .input { max-width: 280px; }
  .filter-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
  .filter-tab { padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; color: var(--muted); transition: all 0.15s; border: 1.5px solid var(--border); background: transparent; font-family: var(--font); }
  .filter-tab.active { background: rgba(0,212,170,0.12); color: var(--accent); border-color: rgba(0,212,170,0.3); }
  .filter-tab:hover { color: var(--text); border-color: var(--border2); }

  .tipo-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 6px; font-family: var(--mono); letter-spacing: 0.5px; border: 1.5px solid; }

  .estado-pago { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; border: 1px solid; }
  .estado-pago.pagada   { background: rgba(0,212,170,0.1);  color: #00d4aa; border-color: rgba(0,212,170,0.25); }
  .estado-pago.pendiente{ background: rgba(245,158,11,0.1); color: #f59e0b; border-color: rgba(245,158,11,0.25); }
  .estado-pago.vencida  { background: rgba(239,68,68,0.1);  color: #ef4444; border-color: rgba(239,68,68,0.25); }
  .estado-pago.anulada  { background: rgba(107,114,128,0.1);color: #6b7280; border-color: rgba(107,114,128,0.25); }

  .modal-xl { max-width: 640px !important; max-height: 90vh; overflow-y: auto; }
  .tipo-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 4px; }
  @media (max-width: 500px) { .tipo-grid { grid-template-columns: repeat(2,1fr); } }
  .tipo-option { border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 12px; cursor: pointer; transition: all 0.15s; text-align: left; }
  .tipo-option:hover { border-color: var(--border2); background: var(--surface2); }
  .tipo-option.selected { border-color: var(--to-color); background: rgba(0,0,0,0.05); }
  .tipo-option-code { font-size: 13px; font-weight: 800; font-family: var(--mono); }
  .tipo-option-name { font-size: 11px; color: var(--muted); margin-top: 2px; line-height: 1.3; }

  .iva-calc { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 14px; }
  .iva-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
  .iva-row.total { font-size: 16px; font-weight: 800; padding-top: 8px; border-top: 1.5px solid var(--border); margin-top: 4px; margin-bottom: 0; }
  .modal-section { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; padding-bottom: 8px; border-bottom: 1px solid var(--border); margin: 16px 0 12px; }

  .sello { font-family: var(--mono); font-size: 11px; color: var(--accent); background: rgba(0,212,170,0.08); padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(0,212,170,0.2); }

  .detalle-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
  .detalle-field { display: flex; flex-direction: column; gap: 3px; }
  .detalle-field-label { font-size: 10px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .detalle-field-value { font-size: 14px; font-weight: 600; }

  .action-btns { display: flex; gap: 5px; }
  .btn-wa { background: rgba(37,211,102,0.12); color: #25D366; border: 1.5px solid rgba(37,211,102,0.25); }
  .btn-wa:hover { background: #25D366; color: white; }
  .btn-pdf { background: rgba(239,68,68,0.1); color: #ef4444; border: 1.5px solid rgba(239,68,68,0.2); }
  .btn-pdf:hover { background: #ef4444; color: white; }
  .btn-anular { background: rgba(239,68,68,0.1); color: #ef4444; border: 1.5px solid rgba(239,68,68,0.25); }
  .btn-anular:hover { background: #ef4444; color: white; }
  .ncnd-section { background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 12px 14px; }
  .ncnd-section-title { font-size: 10px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px; }

  /* Modal anulación */
  .anulacion-alert { background: rgba(239,68,68,0.08); border: 1.5px solid rgba(239,68,68,0.25); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; }
  .anulacion-alert-title { font-size: 13px; font-weight: 700; color: #ef4444; margin-bottom: 4px; }
  .anulacion-alert-body { font-size: 12px; color: var(--muted); line-height: 1.6; }
  .plazo-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 99px; font-size: 12px; font-weight: 700; margin-bottom: 14px; }
  .plazo-24h { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.25); }
  .plazo-3m  { background: rgba(245,158,11,0.1); color: #f59e0b; border: 1px solid rgba(245,158,11,0.25); }

  /* Fila anulada en tabla */
  tr.fila-anulada td { opacity: 0.5; text-decoration: line-through; }
  tr.fila-anulada td:last-child { opacity: 1; text-decoration: none; }
`

// ── Imprimir con iframe oculto ──
const imprimirIframe = (html) => {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'
  document.body.appendChild(iframe)
  iframe.contentDocument.open()
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
      setTimeout(() => { document.body.removeChild(iframe) }, 2000)
    }, 800)
  }
}

// ── Validar plazo de anulación según MH El Salvador ──
const validarPlazoAnulacion = (factura) => {
  const tipo = factura.tipoDte
  const fechaEmision = new Date(factura.fechaEmision + 'T00:00:00')
  const ahora = new Date()

  if (TIPOS_24H.includes(tipo)) {
    // CCF, NC, ND: máximo 24 horas
    const diffHoras = (ahora - fechaEmision) / (1000 * 60 * 60)
    if (diffHoras > 24) {
      return {
        permitido: false,
        mensaje: `El tipo ${tipo} solo puede anularse dentro de las 24 horas siguientes a su emisión. Han transcurrido ${Math.floor(diffHoras)} horas.`,
        plazo: '24 horas'
      }
    }
    return { permitido: true, plazo: '24 horas', tipo: 'corto' }
  }

  if (TIPOS_3M.includes(tipo)) {
    // FE, FEX, FSEE: máximo 3 meses
    const limite = new Date(fechaEmision)
    limite.setMonth(limite.getMonth() + 3)
    if (ahora > limite) {
      return {
        permitido: false,
        mensaje: `El tipo ${tipo} solo puede anularse dentro de los 3 meses siguientes a su emisión. El plazo venció el ${limite.toLocaleDateString('es-SV')}.`,
        plazo: '3 meses'
      }
    }
    return { permitido: true, plazo: '3 meses', tipo: 'largo' }
  }

  // Tipos no contemplados: permitir con advertencia
  return { permitido: true, plazo: 'sin plazo definido', tipo: 'largo' }
}

export default function Facturas() {
  const { user } = useAuth()
  const { puede } = usePermisos()
  const [facturas, setFacturas] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [detalleOpen, setDetalleOpen] = useState(null)
  const [anulacionOpen, setAnulacionOpen] = useState(null)
  const [ncndOpen, setNcndOpen]           = useState(null)
  const [ncndTipo, setNcndTipo]           = useState('NC')
  const [guardandoNcNd, setGuardandoNcNd] = useState(false)
  const [ncndForm, setNcndForm]           = useState({
    nombre: '', nit: '', nrc: '', codActividad: '', descActividad: '',
    departamento: '', municipio: '', distrito: '', complemento: '', telefono: '', correo: '',
    tipoDocumento: '01', tipoGeneracion: '2', numeroDocumento: '', fechaEmision: '',
    monto: '', motivo: '',
    itemsDevueltos: [],
  })
  const [formAnulacion, setFormAnulacion] = useState(emptyAnulacion)
  const [anulando, setAnulando] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [guardando, setGuardando] = useState(false)
  const [transmitiendo, setTransmitiendo] = useState(null) // id de la factura en transmisión
  const [empresa, setEmpresa] = useState({})

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'facturas'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setFacturas(data)
      setLoading(false)
    })
    if (user) {
      getDoc(doc(db, 'configuracion', user.uid)).then(snap => {
        if (snap.exists()) setEmpresa(snap.data())
      })
    }
    return () => unsub()
  }, [user])

  const calcularIva = (subtotal) => {
    const s = parseFloat(subtotal) || 0
    const iva = s * 0.13
    setForm(f => ({ ...f, subtotal, iva: iva.toFixed(2), total: (s + iva).toFixed(2) }))
  }

  const filtradas = facturas.filter(f => {
    const q = busqueda.toLowerCase()
    const coincide = f.cliente?.toLowerCase().includes(q) || f.numero?.toLowerCase().includes(q) || f.nit?.includes(q)
    const tipo = filtroTipo === 'todos' || f.tipoDte === filtroTipo
    const estado = filtroEstado === 'todos' || f.estadoPago === filtroEstado
    return coincide && tipo && estado
  })

  const totalPagadas    = facturas.filter(f => f.estadoPago === 'pagada').reduce((s, f) => s + (f.total || 0), 0)
  const totalPendientes = facturas.filter(f => f.estadoPago === 'pendiente').reduce((s, f) => s + (f.total || 0), 0)
  const totalVencidas   = facturas.filter(f => f.estadoPago === 'vencida').reduce((s, f) => s + (f.total || 0), 0)

  const abrirModal = () => {
    setForm({ ...emptyForm, numero: `FE-${String(facturas.length + 1).padStart(6, '0')}` })
    setModalOpen(true)
  }

  const guardar = async () => {
    if (!form.cliente || !form.tipoDte) return
    setGuardando(true)
    const data = {
      tipoDte: form.tipoDte,
      numero: form.numero || `${form.tipoDte}-${String(facturas.length + 1).padStart(6, '0')}`,
      cliente: form.cliente, nit: form.nit || '', nrc: form.nrc || '',
      direccion: form.direccion || '', descripcion: form.descripcion || '',
      subtotal: parseFloat(form.subtotal) || 0, iva: parseFloat(form.iva) || 0, total: parseFloat(form.total) || 0,
      estadoPago: form.estadoPago, fechaEmision: form.fechaEmision,
      fechaVencimiento: form.fechaVencimiento || '', notas: form.notas || '',
      updatedAt: serverTimestamp()
    }
    try {
      await addDoc(collection(db, 'facturas'), { ...data, createdAt: serverTimestamp() })
      setModalOpen(false)
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const cambiarEstado = async (id, nuevoEstado) => {
    // No permitir cambiar estado si ya está anulada
    const factura = facturas.find(f => f.id === id)
    if (factura?.estadoPago === 'anulada') return
    try { await updateDoc(doc(db, 'facturas', id), { estadoPago: nuevoEstado, updatedAt: serverTimestamp() }) }
    catch (e) { alert('Error: ' + e.message) }
  }

  // ── Abrir modal de anulación ──
  const abrirAnulacion = (factura) => {
    const validacion = validarPlazoAnulacion(factura)
    if (!validacion.permitido) {
      alert(`⚠️ Anulación fuera de plazo\n\n${validacion.mensaje}\n\nSegún el Ministerio de Hacienda de El Salvador, no es posible emitir el Evento de Invalidación fuera del plazo establecido.`)
      return
    }
    setFormAnulacion(emptyAnulacion)
    setAnulacionOpen(factura)
  }

  // ── Ejecutar anulación con Evento de Invalidación ──
  const ejecutarAnulacion = async () => {
    if (!anulacionOpen) return
    if (!formAnulacion.motivoDetalle.trim()) {
      alert('Debe ingresar el detalle del motivo de anulación.')
      return
    }
    setAnulando(true)
    const factura = anulacionOpen
    try {
      // El DTE original debe haber sido transmitido y procesado por el MH.
      if (!factura.codigoGeneracion || !factura.dte_sello || !factura.numeroControl) {
        alert('⚠️ Este DTE no fue transmitido al Ministerio de Hacienda.\n\nSolo se pueden invalidar DTE en estado PROCESADO con sello del MH.')
        setAnulando(false)
        return
      }

      // Llamar al endpoint de invalidación. El endpoint:
      //  - Valida plazo según tipo (FE/FEX 90 días, CCF/NC/ND 1 día).
      //  - Arma el evento, lo firma y lo transmite al MH.
      //  - Guarda en `eventos_invalidacion` con el sello del MH.
      //  - Actualiza la factura y venta con `dte_estado_invalidacion: 'INVALIDADO'`.
      const resp = await fetch('/api/dte/invalidar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facturaId: factura.id,
          tipoAnulacion: parseInt(formAnulacion.tipoInvalidacion),
          motivoAnulacion: formAnulacion.motivoDetalle,
          responsableId: user?.uid || null,
        })
      })
      const data = await resp.json()

      if (!resp.ok) {
        throw new Error(data.error || data.mensaje || 'Error al invalidar')
      }

      if (data.estado === 'PROCESADO') {
        // Marcar la factura localmente como anulada para que la UI se actualice
        // de inmediato (el endpoint ya escribió dte_estado_invalidacion en backend).
        try {
          await updateDoc(doc(db, 'facturas', factura.id), {
            estadoPago: 'anulada',
            anulada: true,
            updatedAt: serverTimestamp(),
          })
        } catch (e) { console.warn('No se pudo actualizar estado local:', e) }

        alert(`✅ DTE invalidado correctamente.\n\nSello del evento: ${data.selloRecibido}\nCódigo del evento: ${data.codigoGeneracionEvento}`)
        setAnulacionOpen(null)
        setDetalleOpen(null)
      } else {
        // El MH rechazó la invalidación. La factura NO se anula.
        const observ = Array.isArray(data.observaciones)
          ? data.observaciones.join('\n')
          : (data.observaciones || 'Sin detalles del MH')
        alert(`❌ DTE RECHAZADO por el Ministerio de Hacienda\n\n${observ}\n\nLa factura NO fue invalidada. Corregí los datos y reintentá.`)
      }
    } catch (e) {
      alert('❌ Error al anular: ' + e.message)
    }
    setAnulando(false)
  }
// ── Transmitir DTE al MH ──
  const transmitirMH = async (factura) => {
    if (!factura.codigoGeneracion) {
      alert('⚠️ Esta factura no tiene código de generación.\n\nSolo facturas creadas desde Punto de Venta pueden transmitirse al MH.')
      return
    }
    if (factura.dte_estado === 'PROCESADO') {
      alert('✓ Esta factura ya fue transmitida y aceptada por el MH.')
      return
    }

    setTransmitiendo(factura.id)
    try {
      // Buscar la venta por codigoGeneracion
      const ventasQuery = query(
        collection(db, 'ventas'),
        where('codigoGeneracion', '==', factura.codigoGeneracion)
      )
      const ventasSnap = await getDocs(ventasQuery)
      if (ventasSnap.empty) {
        alert('❌ No se encontró la venta asociada a esta factura.\n\nNo se puede transmitir al MH sin los datos de la venta original.')
        setTransmitiendo(null)
        return
      }
      const ventaId = ventasSnap.docs[0].id

      // Llamar al endpoint
      const res = await fetch('/api/dte/transmitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ventaId, ambiente: '00' })
      })
      const data = await res.json()

      if (data.estado === 'PROCESADO') {
        alert(`✅ DTE PROCESADO por el Ministerio de Hacienda\n\nSello: ${data.selloRecibido}\nFecha: ${data.fhProcesamiento}`)
      } else if (data.estado === 'RECHAZADO') {
        const detalle = data.detalleMH?.descripcionMsg || JSON.stringify(data.observaciones) || 'Sin detalle'
        alert(`❌ DTE RECHAZADO por el MH\n\n${detalle}\n\nLa factura no fue modificada. Corregí los datos y reintentá.`)
      } else {
        alert(`⚠️ Respuesta inesperada del servidor:\n\n${JSON.stringify(data)}`)
      }
    } catch (e) {
      alert('❌ Error al transmitir:\n\n' + e.message)
    }
    setTransmitiendo(null)
  }
  const getTipoInfo = (codigo) => TIPOS_DTE.find(t => t.codigo === codigo) || TIPOS_DTE[0]
  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  const formatFecha = (fecha) => { if (!fecha) return '—'; const [y, m, d] = fecha.split('-'); return `${d}/${m}/${y}` }

  // ── Generar PDF de factura ──
  const generarPDF = (f) => {
    const tipo = getTipoInfo(f.tipoDte)
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>${f.tipoDte} ${f.numero}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;font-size:13px;}
.page{max-width:700px;margin:0 auto;padding:36px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:18px;border-bottom:3px solid #1B2E6B;}
.emp h1{font-size:20px;font-weight:900;color:#1B2E6B;}
.emp p{font-size:11px;color:#6b7280;margin-top:2px;}
.doc{text-align:right;}
.doc-tipo{font-size:10px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;}
.doc-num{font-size:22px;font-weight:900;color:#1B2E6B;}
.doc-badge{display:inline-block;padding:4px 14px;border-radius:99px;font-size:11px;font-weight:700;margin-top:4px;}
.info-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px;}
.box{background:#f8faff;border-radius:10px;padding:14px;border:1px solid #e5eaf5;}
.box h3{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:6px;font-weight:700;}
.box p{font-size:13px;line-height:1.6;}
table{width:100%;border-collapse:collapse;margin-bottom:18px;border-radius:10px;overflow:hidden;}
thead{background:#1B2E6B;color:#fff;}
th{padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;font-weight:700;}
th:last-child,td:last-child{text-align:right;}
td{padding:10px 14px;border-bottom:1px solid #f0f4ff;font-size:13px;}
tr:last-child td{border-bottom:none;}
tr:nth-child(even) td{background:#fafbff;}
.tots{display:flex;justify-content:flex-end;margin-bottom:20px;}
.tots-box{min-width:220px;}
.trow{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f4ff;font-size:13px;color:#6b7280;}
.trow.fin{border-bottom:none;padding:10px 0 0;font-size:18px;font-weight:900;color:#1B2E6B;}
.firmas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:24px 0 16px;}
.firma{border-top:1.5px solid #1B2E6B;padding-top:6px;margin-top:36px;font-size:11px;color:#6b7280;text-align:center;}
.footer{text-align:center;padding-top:12px;border-top:1px solid #e5eaf5;font-size:11px;color:#9ca3af;}
.stamp{display:inline-block;padding:6px 16px;border-radius:99px;font-size:11px;font-weight:700;}
.anulado-banner{background:#fee2e2;border:2px solid #ef4444;border-radius:10px;padding:12px 18px;text-align:center;color:#b91c1c;font-weight:900;font-size:16px;letter-spacing:2px;margin-bottom:18px;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{margin:15mm;}}
</style>
</head>
<body>
<div class="page">
  ${f.anulada ? '<div class="anulado-banner">⚠ DOCUMENTO ANULADO — EVENTO DE INVALIDACIÓN EMITIDO</div>' : ''}
  <div class="header">
    <div class="emp">
      ${empresa.logoUrl ? `<img src="${empresa.logoUrl}" style="max-height:50px;max-width:160px;object-fit:contain;margin-bottom:6px;display:block;" onerror="this.style.display='none'"/>` : ''}
      <h1>${empresa.empresaNombre || 'Mi Empresa'}</h1>
      <p>${empresa.direccion || ''}</p>
      <p>NIT: ${empresa.nit || '---'} | NRC: ${empresa.nrc || '---'}</p>
      ${empresa.telefono ? `<p>Tel: ${empresa.telefono}</p>` : ''}
    </div>
    <div class="doc">
      <div class="doc-tipo">${tipo.nombre}</div>
      <div class="doc-num">${f.numero}</div>
      <div class="doc-badge" style="background:${tipo.color}15;color:${tipo.color};border:1px solid ${tipo.color}40">${f.tipoDte}</div>
      <p style="font-size:11px;color:#9ca3af;margin-top:6px">Emision: ${formatFecha(f.fechaEmision)}</p>
      ${f.fechaVencimiento ? `<p style="font-size:11px;color:#f59e0b">Vence: ${formatFecha(f.fechaVencimiento)}</p>` : ''}
    </div>
  </div>
  <div class="info-row">
    <div class="box">
      <h3>Cliente</h3>
      <p style="font-weight:700;font-size:15px;color:#1B2E6B">${f.cliente}</p>
      ${f.nit ? `<p>NIT: <strong>${f.nit}</strong></p>` : ''}
      ${f.nrc ? `<p>NRC: <strong>${f.nrc}</strong></p>` : ''}
      ${f.direccion ? `<p>${f.direccion}</p>` : ''}
    </div>
    <div class="box">
      <h3>Estado del Documento</h3>
      <div class="stamp" style="background:${ESTADOS_PAGO.find(e=>e.value===f.estadoPago)?.color || '#00d4aa'}15;color:${ESTADOS_PAGO.find(e=>e.value===f.estadoPago)?.color || '#00d4aa'};border:1px solid ${ESTADOS_PAGO.find(e=>e.value===f.estadoPago)?.color || '#00d4aa'}40">
        ${f.estadoPago?.charAt(0).toUpperCase() + f.estadoPago?.slice(1) || 'Pagada'}
      </div>
      <p style="margin-top:8px">Forma de pago: <strong>${f.tipoPago === 'credito' ? 'Credito' : 'Contado'}</strong></p>
    </div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Descripcion</th><th style="text-align:right">Subtotal</th></tr></thead>
    <tbody>
      <tr>
        <td style="color:#9ca3af">1</td>
        <td style="font-weight:600">${f.descripcion || 'Productos y/o Servicios'}</td>
        <td style="text-align:right;font-weight:700">${fmt(f.subtotal)}</td>
      </tr>
    </tbody>
  </table>
  <div class="tots">
    <div class="tots-box">
      <div class="trow"><span>Subtotal (sin IVA)</span><span>${fmt(f.subtotal)}</span></div>
      <div class="trow"><span>IVA 13%</span><span>${fmt(f.iva)}</span></div>
      <div class="trow fin"><span>TOTAL</span><span>${fmt(f.total)}</span></div>
    </div>
  </div>
  ${f.notas ? `<div style="background:#fffbeb;border:1px solid #f59e0b40;border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#92400e">Notas: ${f.notas}</div>` : ''}
  <div class="firmas">
    <div class="firma">Firma / ${f.cliente}</div>
    <div class="firma">Autorizado / ${empresa.empresaNombre || ''}</div>
  </div>
  <div class="footer">
    <p>Documento generado electronicamente. Valido como comprobante fiscal.</p>
    <p style="margin-top:4px">ORION - ${empresa.empresaNombre || 'Mi Empresa'} - ONE GEO SYSTEMS</p>
  </div>
</div>
</body>
</html>`
  }

  const imprimirPDF = (f) => imprimirIframe(generarPDF(f))

  const imprimirTermico = (f) => {
    const tipo = getTipoInfo(f.tipoDte)
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:"Courier New",monospace;width:72mm;font-size:14px;color:#000;padding:3mm;}.c{text-align:center;}.b{font-weight:bold;}.sep{border-top:1px dashed #000;margin:5px 0;}.row{display:flex;justify-content:space-between;margin:2px 0;font-size:12px;}.empresa{font-size:15px;font-weight:900;text-align:center;}.dte{border:1px solid #000;text-align:center;padding:3px;margin:4px 0;font-weight:700;}.total{font-size:18px;font-weight:900;text-align:center;margin:6px 0;}.pie{font-size:11px;text-align:center;color:#555;}@media print{@page{margin:2mm;size:80mm auto;}}</style></head><body><div class="empresa">${empresa.empresaNombre || "Mi Empresa"}</div>${empresa.direccion ? `<div class="c" style="font-size:11px">${empresa.direccion}</div>` : ""}<div class="c" style="font-size:11px">NIT:${empresa.nit || "---"} NRC:${empresa.nrc || "---"}</div><div class="sep"></div>${f.anulada ? '<div style="border:2px solid #000;text-align:center;font-weight:900;padding:4px;margin:4px 0">*** ANULADO ***</div>' : ''}<div class="dte">${tipo.nombre}</div><div class="dte">${f.numero}</div><div class="sep"></div><div class="row"><span>Fecha:</span><span>${formatFecha(f.fechaEmision)}</span></div><div class="row"><span>Cliente:</span><span>${f.cliente}</span></div>${f.nit ? `<div class="row"><span>NIT:</span><span>${f.nit}</span></div>` : ""}<div class="sep"></div><div style="font-size:12px;margin:3px 0">${f.descripcion || "Productos/Servicios"}</div><div class="sep"></div><div class="row"><span>Subtotal:</span><span>$${(f.subtotal||0).toFixed(2)}</span></div><div class="row"><span>IVA 13%:</span><span>$${(f.iva||0).toFixed(2)}</span></div><div class="sep"></div><div class="total">TOTAL: $${(f.total||0).toFixed(2)}</div><div class="sep"></div><div class="pie">Gracias por su compra!</div><div class="pie">${empresa.empresaNombre || "ORION"}</div><div style="margin-top:8mm"></div></body></html>`
    imprimirIframe(html)
  }

  const compartirWA = (f) => {
    const tipo = getTipoInfo(f.tipoDte)
    const msg = encodeURIComponent(
      `Hola! Te comparto el detalle de tu documento fiscal:\n\n` +
      `*${tipo.nombre}*\n` +
      `No: *${f.numero}*\n` +
      `Fecha: ${formatFecha(f.fechaEmision)}\n` +
      `Cliente: *${f.cliente}*\n\n` +
      `Subtotal: ${fmt(f.subtotal)}\n` +
      `IVA 13%: ${fmt(f.iva)}\n` +
      `*TOTAL: ${fmt(f.total)}*\n\n` +
      `${f.notas ? `Notas: ${f.notas}\n\n` : ''}` +
      `Emitido por ${empresa.empresaNombre || 'ORION'}`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  return (
    <>
      <style>{factStyles}</style>

      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">🧾 Facturas DTE</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {facturas.length} documentos
            <span className="firebase-badge">🔥 Firebase</span>
            <span className="dte-tag">🔒 MH SV</span>
          </div>
        </div>
        {puede('crear_facturas') && <button className="btn btn-primary" onClick={abrirModal}>+ Emitir DTE</button>}
      </div>

      {/* Resumen */}
      <div className="fact-resumen">
        <div className="resumen-card" style={{ '--rc-color': '#00d4aa' }}>
          <div className="resumen-label">TOTAL COBRADO</div>
          <div className="resumen-val" style={{ color: 'var(--accent)' }}>{fmt(totalPagadas)}</div>
          <div className="resumen-sub">{facturas.filter(f => f.estadoPago === 'pagada').length} facturas pagadas</div>
        </div>
        <div className="resumen-card" style={{ '--rc-color': '#f59e0b' }}>
          <div className="resumen-label">POR COBRAR</div>
          <div className="resumen-val" style={{ color: '#f59e0b' }}>{fmt(totalPendientes)}</div>
          <div className="resumen-sub">{facturas.filter(f => f.estadoPago === 'pendiente').length} pendientes</div>
        </div>
        <div className="resumen-card" style={{ '--rc-color': '#ef4444' }}>
          <div className="resumen-label">VENCIDAS</div>
          <div className="resumen-val" style={{ color: '#ef4444' }}>{fmt(totalVencidas)}</div>
          <div className="resumen-sub">{facturas.filter(f => f.estadoPago === 'vencida').length} documentos</div>
        </div>
        <div className="resumen-card" style={{ '--rc-color': '#4f8cff' }}>
          <div className="resumen-label">TOTAL DOCUMENTOS</div>
          <div className="resumen-val">{facturas.length}</div>
          <div className="resumen-sub">todos los tipos</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="filtros-bar">
        <input className="input" placeholder="🔍 Buscar cliente, No. DTE o NIT..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <div className="filter-tabs">
          {['todos', ...TIPOS_DTE.map(t => t.codigo)].map(t => (
            <button key={t} className={`filter-tab ${filtroTipo === t ? 'active' : ''}`} onClick={() => setFiltroTipo(t)}>
              {t === 'todos' ? 'Todos' : t}
            </button>
          ))}
        </div>
        <div className="filter-tabs">
          {['todos', 'pagada', 'pendiente', 'vencida', 'anulada'].map(e => (
            <button key={e} className={`filter-tab ${filtroEstado === e ? 'active' : ''}`} onClick={() => setFiltroEstado(e)}>
              {e.charAt(0).toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="card">
        {loading ? (
          <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">Cargando facturas...</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>TIPO</th><th>No. DTE</th><th>CLIENTE</th><th>NIT</th>
                  <th>SUBTOTAL</th><th>IVA</th><th>TOTAL</th>
                  <th>EMISION</th><th>VENCE</th><th>ESTADO</th><th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 ? (
                  <tr><td colSpan={11}>
                    <div className="empty-state">
                      <div className="empty-icon">🧾</div>
                      <div className="empty-text">{busqueda ? 'No se encontraron documentos' : 'Emite tu primer DTE'}</div>
                    </div>
                  </td></tr>
                ) : filtradas.map((f) => {
                  const tipo = getTipoInfo(f.tipoDte)
                  const esAnulada = f.estadoPago === 'anulada' || f.anulada
                  return (
                    <tr key={f.id} className={esAnulada ? 'fila-anulada' : ''}>
                      <td>
                        <span className="tipo-tag" style={{ color: tipo.color, borderColor: tipo.color + '40', background: tipo.color + '12' }}>
                          {f.tipoDte}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--accent2)' }}>{f.numero}</td>
                      <td style={{ fontWeight: 600 }}>{f.cliente}</td>
                      <td className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{f.nit || '—'}</td>
                      <td className="amount">{fmt(f.subtotal)}</td>
                      <td style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 13 }}>{fmt(f.iva)}</td>
                      <td className="amount" style={{ fontWeight: 700 }}>{fmt(f.total)}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{formatFecha(f.fechaEmision)}</td>
                      <td style={{ color: f.fechaVencimiento ? 'var(--accent3)' : 'var(--muted)', fontSize: 12 }}>{formatFecha(f.fechaVencimiento)}</td>
                      <td>
                        {esAnulada ? (
                          <span className="estado-pago anulada">
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }}/>
                            Anulada
                          </span>
                        ) : (
                          <select
                            className={`estado-pago ${f.estadoPago}`}
                            value={f.estadoPago}
                            onChange={e => cambiarEstado(f.id, e.target.value)}
                            style={{ border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 12, outline: 'none', background: 'transparent' }}>
                            {ESTADOS_PAGO.filter(e => e.value !== 'anulada').map(e => (
                              <option key={e.value} value={e.value}>{e.label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <div className="action-btns">
                          <button className="btn btn-ghost btn-sm" onClick={() => setDetalleOpen(f)} title="Ver detalle">👁️</button>
                          {!esAnulada && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => imprimirTermico(f)} title="Ticket termico">🧾</button>
                              {f.codigoGeneracion && f.dte_estado !== 'PROCESADO' && puede('crear_facturas') && (
                                <button
                                  className="btn btn-sm"
                                  style={{
                                    background: f.dte_estado === 'RECHAZADO' ? 'rgba(239,68,68,0.12)' : 'rgba(0,212,170,0.12)',
                                    color: f.dte_estado === 'RECHAZADO' ? '#ef4444' : '#00d4aa',
                                    border: `1.5px solid ${f.dte_estado === 'RECHAZADO' ? 'rgba(239,68,68,0.25)' : 'rgba(0,212,170,0.25)'}`
                                  }}
                                  onClick={() => transmitirMH(f)}
                                  disabled={transmitiendo === f.id}
                                  title={f.dte_estado === 'RECHAZADO' ? 'Reintentar transmisión' : 'Transmitir al MH'}>
                                  {transmitiendo === f.id ? '⏳' : f.dte_estado === 'RECHAZADO' ? '🔄' : '📡'}
                                </button>
                              )}
                              {f.dte_estado === 'PROCESADO' && (
                                <span
                                  className="sello"
                                  title={`Sello MH: ${f.dte_sello || ''}`}
                                  style={{ display: 'inline-flex', alignItems: 'center', fontSize: 10 }}>
                                  ✓ MH
                                </span>
                              )}
                              <button className="btn btn-pdf btn-sm" onClick={() => imprimirPDF(f)} title="Descargar PDF">📄</button>
                              {puede('compartir_whatsapp') && (
                                <button className="btn btn-wa btn-sm" onClick={() => compartirWA(f)} title="Compartir WhatsApp">💬</button>
                              )}
                              {puede('eliminar_facturas') && (
                                <button className="btn btn-anular btn-sm" onClick={() => abrirAnulacion(f)} title="Anular DTE">🚫</button>
                              )}
                              {(f.tipoDte === 'FE' || f.tipoDte === 'CCF') && (
                                <>
                                  <button className="btn btn-ghost btn-sm"
                                    style={{ color: '#8b5cf6', borderColor: 'rgba(139,92,246,0.3)', fontSize: 10, padding: '3px 7px' }}
                                    title="Emitir Nota de Crédito"
                                    onClick={async () => {
                                      setNcndTipo('NC'); setNcndOpen(f)
                                      // Valores base desde la factura
                                      let datos = {
                                        nombre: f.cliente || '', nit: f.nit || '', nrc: f.nrc || '',
                                        codActividad: f.codActividad || '',
                                        descActividad: f.descActividad || f.actividad || '',
                                        departamento: f.codDep || (typeof f.direccion === 'object' ? f.direccion?.departamento : '') || '',
                                        municipio: f.codMun || (typeof f.direccion === 'object' ? f.direccion?.municipio : '') || '',
                                        distrito: f.distrito || '',
                                        complemento: f.complemento || (typeof f.direccion === 'object' ? f.direccion?.complemento : '') || (typeof f.direccion === 'string' ? f.direccion : ''),
                                        telefono: f.telefono || '',
                                        correo: f.email || f.correo || '',
                                        numeroDocumento: f.codigoGeneracion || '',
                                        fechaEmision: f.fechaEmision || '',
                                        tipoDocumento: f.tipoDte === 'FE' ? '01' : '03',
                                        monto: '',
                                      }
                                      // Enriquecer con datos del cliente en Firestore si tiene NIT
                                      if (f.nit) {
                                        try {
                                          const q = query(collection(db, 'clientes'), where('nit', '==', f.nit))
                                          const snap = await getDocs(q)
                                          if (!snap.empty) {
                                            const cl = snap.docs[0].data()
                                            datos = { ...datos,
                                              codActividad: cl.codActividad || datos.codActividad,
                                              descActividad: cl.descActividad || datos.descActividad,
                                              departamento: cl.codDep || datos.departamento,
                                              municipio: cl.codMun || datos.municipio,
                                              distrito: cl.distrito || datos.distrito,
                                              complemento: cl.complemento || datos.complemento,
                                              telefono: cl.telefono || datos.telefono,
                                              correo: cl.email || datos.correo,
                                            }
                                          }
                                        } catch(e) { console.warn('No se pudo cargar cliente:', e) }
                                      }
                                      setNcndForm({
                                        tipoDocumento: datos.tipoDocumento,
                                        tipoGeneracion: '2',
                                        numeroDocumento: datos.numeroDocumento,
                                        fechaEmision: datos.fechaEmision,
                                        nombre: datos.nombre,
                                        nit: datos.nit,
                                        nrc: datos.nrc,
                                        codActividad: datos.codActividad,
                                        descActividad: datos.descActividad,
                                        departamento: datos.departamento,
                                        municipio: datos.municipio,
                                        distrito: datos.distrito,
                                        complemento: datos.complemento,
                                        telefono: datos.telefono,
                                        correo: datos.correo,
                                        monto: '',
                                        motivo: '',
                                        itemsDevueltos: (f.items || []).map(it => ({
                                          codigo: it.codigo || '',
                                          nombre: it.nombre || 'Sin nombre',
                                          precioBase: parseFloat(it.precioBase) || 0,
                                          qtyOriginal: parseFloat(it.qty) || 1,
                                          qtyDevuelta: 0,
                                          seleccionado: false,
                                        })),
                                      })
                                    }}>NC</button>
                                  <button className="btn btn-ghost btn-sm"
                                    style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)', fontSize: 10, padding: '3px 7px' }}
                                    title="Emitir Nota de Débito"
                                    onClick={async () => {
                                      setNcndTipo('ND'); setNcndOpen(f)
                                      let datos = {
                                        nombre: f.cliente || '', nit: f.nit || '', nrc: f.nrc || '',
                                        codActividad: f.codActividad || '',
                                        descActividad: f.descActividad || f.actividad || '',
                                        departamento: f.codDep || (typeof f.direccion === 'object' ? f.direccion?.departamento : '') || '',
                                        municipio: f.codMun || (typeof f.direccion === 'object' ? f.direccion?.municipio : '') || '',
                                        distrito: f.distrito || '',
                                        complemento: f.complemento || (typeof f.direccion === 'object' ? f.direccion?.complemento : '') || (typeof f.direccion === 'string' ? f.direccion : ''),
                                        telefono: f.telefono || '',
                                        correo: f.email || f.correo || '',
                                        numeroDocumento: f.codigoGeneracion || '',
                                        fechaEmision: f.fechaEmision || '',
                                        tipoDocumento: f.tipoDte === 'FE' ? '01' : '03',
                                        monto: '',
                                      }
                                      if (f.nit) {
                                        try {
                                          const q = query(collection(db, 'clientes'), where('nit', '==', f.nit))
                                          const snap = await getDocs(q)
                                          if (!snap.empty) {
                                            const cl = snap.docs[0].data()
                                            datos = { ...datos,
                                              codActividad: cl.codActividad || datos.codActividad,
                                              descActividad: cl.descActividad || datos.descActividad,
                                              departamento: cl.codDep || datos.departamento,
                                              municipio: cl.codMun || datos.municipio,
                                              distrito: cl.distrito || datos.distrito,
                                              complemento: cl.complemento || datos.complemento,
                                              telefono: cl.telefono || datos.telefono,
                                              correo: cl.email || datos.correo,
                                            }
                                          }
                                        } catch(e) { console.warn('No se pudo cargar cliente:', e) }
                                      }
                                      setNcndForm({
                                        tipoDocumento: datos.tipoDocumento,
                                        tipoGeneracion: '2',
                                        numeroDocumento: datos.numeroDocumento,
                                        fechaEmision: datos.fechaEmision,
                                        nombre: datos.nombre,
                                        nit: datos.nit,
                                        nrc: datos.nrc,
                                        codActividad: datos.codActividad,
                                        descActividad: datos.descActividad,
                                        departamento: datos.departamento,
                                        municipio: datos.municipio,
                                        distrito: datos.distrito,
                                        complemento: datos.complemento,
                                        telefono: datos.telefono,
                                        correo: datos.correo,
                                        monto: '',
                                        motivo: '',
                                        itemsDevueltos: (f.items || []).map(it => ({
                                          codigo: it.codigo || '',
                                          nombre: it.nombre || 'Sin nombre',
                                          precioBase: parseFloat(it.precioBase) || 0,
                                          qtyOriginal: parseFloat(it.qty) || 1,
                                          qtyDevuelta: 0,
                                          seleccionado: false,
                                        })),
                                      })
                                    }}>ND</button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL EMITIR DTE ── */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🧾 Emitir Nuevo DTE</div>

            <div className="modal-section">TIPO DE DOCUMENTO</div>
            <div className="tipo-grid">
              {TIPOS_DTE.map(t => (
                <div key={t.codigo}
                  className={`tipo-option ${form.tipoDte === t.codigo ? 'selected' : ''}`}
                  style={{ '--to-color': t.color }}
                  onClick={() => setForm(f => ({ ...f, tipoDte: t.codigo }))}>
                  <div className="tipo-option-code" style={{ color: t.color }}>{t.codigo}</div>
                  <div className="tipo-option-name">{t.nombre}</div>
                </div>
              ))}
            </div>

            <div className="modal-section">DATOS DEL CLIENTE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">NOMBRE / RAZON SOCIAL *</label>
                <input className="input" placeholder="Nombre del cliente" value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">NIT</label>
                  <input className="input" placeholder="0614-010190-101-3" value={form.nit} onChange={e => setForm(f => ({ ...f, nit: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">NRC {form.tipoDte === 'CCF' && <span style={{ color: 'var(--danger)' }}>*</span>}</label>
                  <input className="input" placeholder="12345-6" value={form.nrc} onChange={e => setForm(f => ({ ...f, nrc: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">DIRECCION</label>
                <input className="input" placeholder="Direccion del cliente" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
              </div>
            </div>

            <div className="modal-section">DETALLE Y MONTOS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">DESCRIPCION</label>
                <input className="input" placeholder="Venta de articulos" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">SUBTOTAL (SIN IVA) $</label>
                <input className="input" type="number" step="0.01" placeholder="0.00" value={form.subtotal} onChange={e => calcularIva(e.target.value)} />
              </div>
              <div className="iva-calc">
                <div className="iva-row"><span style={{ color: 'var(--muted)' }}>Subtotal</span><span className="amount">${parseFloat(form.subtotal || 0).toFixed(2)}</span></div>
                <div className="iva-row"><span style={{ color: 'var(--muted)' }}>IVA 13%</span><span className="amount" style={{ color: 'var(--accent3)' }}>${parseFloat(form.iva || 0).toFixed(2)}</span></div>
                <div className="iva-row total"><span>TOTAL</span><span className="amount" style={{ color: 'var(--accent)' }}>${parseFloat(form.total || 0).toFixed(2)}</span></div>
              </div>
            </div>

            <div className="modal-section">FECHAS Y ESTADO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">FECHA EMISION</label>
                  <input className="input" type="date" value={form.fechaEmision} onChange={e => setForm(f => ({ ...f, fechaEmision: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">FECHA VENCIMIENTO</label>
                  <input className="input" type="date" value={form.fechaVencimiento} onChange={e => setForm(f => ({ ...f, fechaVencimiento: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">ESTADO DE PAGO</label>
                <select className="input" value={form.estadoPago} onChange={e => setForm(f => ({ ...f, estadoPago: e.target.value }))}>
                  {ESTADOS_PAGO.filter(e => e.value !== 'anulada').map(e => (
                    <option key={e.value} value={e.value}>{e.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">NOTAS</label>
                <input className="input" placeholder="Observaciones adicionales" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando || !form.cliente}>
                {guardando ? '⏳ Guardando...' : '💾 Guardar DTE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DETALLE ── */}
      {detalleOpen && (
        <div className="modal-overlay" onClick={() => setDetalleOpen(null)}>
          <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            {(() => {
              const f = detalleOpen
              const tipo = getTipoInfo(f.tipoDte)
              const esAnulada = f.estadoPago === 'anulada' || f.anulada
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div className="modal-title" style={{ marginBottom: 0 }}>📄 Detalle del DTE</div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDetalleOpen(null)}>✕</button>
                  </div>

                  {esAnulada && (
                    <div className="anulacion-alert" style={{ marginBottom: 16 }}>
                      <div className="anulacion-alert-title">🚫 Documento Anulado</div>
                      <div className="anulacion-alert-body">Este documento fue anulado mediante Evento de Invalidación ante el Ministerio de Hacienda. No tiene validez fiscal.</div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                    <span className="tipo-tag" style={{ color: tipo.color, borderColor: tipo.color + '40', background: tipo.color + '12', fontSize: 13, padding: '5px 14px' }}>
                      {f.tipoDte} — {tipo.nombre}
                    </span>
                    <span className={`estado-pago ${f.estadoPago}`}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }}/>
                      {f.estadoPago?.charAt(0).toUpperCase() + f.estadoPago?.slice(1)}
                    </span>
                  </div>

                  <div className="detalle-grid">
                    {[
                      { label: 'No. DTE', value: f.numero, mono: true },
                      { label: 'Fecha Emision', value: formatFecha(f.fechaEmision) },
                      { label: 'Cliente', value: f.cliente },
                      { label: 'NIT', value: f.nit || '—', mono: true },
                      { label: 'NRC', value: f.nrc || '—', mono: true },
                      { label: 'Vence', value: formatFecha(f.fechaVencimiento) },
                    ].map(item => (
                      <div key={item.label} className="detalle-field">
                        <div className="detalle-field-label">{item.label}</div>
                        <div className="detalle-field-value" style={{ fontFamily: item.mono ? 'var(--mono)' : 'var(--font)' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {f.descripcion && (
                    <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>DESCRIPCION</div>
                      <div style={{ fontSize: 14 }}>{f.descripcion}</div>
                    </div>
                  )}

                  <div className="iva-calc">
                    <div className="iva-row"><span style={{ color: 'var(--muted)' }}>Subtotal</span><span className="amount">{fmt(f.subtotal)}</span></div>
                    <div className="iva-row"><span style={{ color: 'var(--muted)' }}>IVA (13%)</span><span className="amount" style={{ color: 'var(--accent3)' }}>{fmt(f.iva)}</span></div>
                    <div className="iva-row total"><span>TOTAL</span><span className="amount" style={{ color: 'var(--accent)', fontSize: 18 }}>{fmt(f.total)}</span></div>
                  </div>

                  {f.notas && (
                    <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, fontSize: 13, color: 'var(--muted)' }}>
                      📝 {f.notas}
                    </div>
                  )}

                  <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
                    {!esAnulada && (
                      <>
                        <button className="btn btn-wa" onClick={() => compartirWA(f)}>💬 WhatsApp</button>
                        {f.codigoGeneracion && f.dte_estado !== 'PROCESADO' && puede('crear_facturas') && (
                          <button
                            className="btn"
                            style={{
                              background: f.dte_estado === 'RECHAZADO' ? 'rgba(239,68,68,0.12)' : 'rgba(0,212,170,0.12)',
                              color: f.dte_estado === 'RECHAZADO' ? '#ef4444' : '#00d4aa',
                              border: `1.5px solid ${f.dte_estado === 'RECHAZADO' ? 'rgba(239,68,68,0.25)' : 'rgba(0,212,170,0.25)'}`
                            }}
                            onClick={() => transmitirMH(f)}
                            disabled={transmitiendo === f.id}>
                            {transmitiendo === f.id ? '⏳ Transmitiendo...' : f.dte_estado === 'RECHAZADO' ? '🔄 Reintentar al MH' : '📡 Transmitir al MH'}
                          </button>
                        )}
                        {f.dte_estado === 'PROCESADO' && (
                          <div style={{ flex: 1, padding: '8px 14px', background: 'rgba(0,212,170,0.08)', border: '1.5px solid rgba(0,212,170,0.25)', borderRadius: 10, fontSize: 12, color: '#00d4aa', fontFamily: 'var(--mono)' }}>
                            ✓ Transmitida al MH<br/>
                            <span style={{ fontSize: 10, opacity: 0.7 }}>Sello: {f.dte_sello}</span>
                          </div>
                        )}
                        <button className="btn btn-ghost" onClick={() => imprimirTermico(f)}>🧾 Ticket</button>
                        <button className="btn btn-pdf" onClick={() => imprimirPDF(f)}>📄 PDF</button>
                        {puede('eliminar_facturas') && (
                          <button className="btn btn-anular" onClick={() => { setDetalleOpen(null); abrirAnulacion(f) }}>🚫 Anular DTE</button>
                        )}
                      </>
                    )}
                    <button className="btn btn-primary" onClick={() => setDetalleOpen(null)}>Cerrar</button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── MODAL ANULACIÓN DTE ── */}
      {anulacionOpen && (
        <div className="modal-overlay" onClick={() => setAnulacionOpen(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ color: '#ef4444' }}>🚫 Anular DTE — Evento de Invalidación</div>

            {/* Info del documento */}
            <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{anulacionOpen.numero}</span>
                <span className="tipo-tag" style={{ color: getTipoInfo(anulacionOpen.tipoDte).color, borderColor: getTipoInfo(anulacionOpen.tipoDte).color + '40', background: getTipoInfo(anulacionOpen.tipoDte).color + '12' }}>
                  {anulacionOpen.tipoDte}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Cliente: <strong style={{ color: 'var(--text)' }}>{anulacionOpen.cliente}</strong></div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Total: <strong style={{ color: 'var(--text)' }}>{fmt(anulacionOpen.total)}</strong> — Emitida: <strong style={{ color: 'var(--text)' }}>{formatFecha(anulacionOpen.fechaEmision)}</strong></div>
            </div>

            {/* Badge de plazo */}
            {(() => {
              const v = validarPlazoAnulacion(anulacionOpen)
              return (
                <div className={`plazo-badge ${v.tipo === 'corto' ? 'plazo-24h' : 'plazo-3m'}`}>
                  ⏱ Plazo de anulación: <strong>{v.plazo}</strong> desde la emisión
                </div>
              )
            })()}

            {/* Alerta */}
            <div className="anulacion-alert">
              <div className="anulacion-alert-title">⚠️ Esta acción es irreversible</div>
              <div className="anulacion-alert-body">
                Se registrará un Evento de Invalidación conforme al Art. 115-A del Código Tributario de El Salvador.
                El documento quedará anulado en el sistema y no podrá ser reactivado.
              </div>
            </div>

            {/* Formulario */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">TIPO DE INVALIDACIÓN</label>
                <select className="input" value={formAnulacion.tipoInvalidacion} onChange={e => setFormAnulacion(f => ({ ...f, tipoInvalidacion: e.target.value }))}>
                  <option value="1">1 — Error en la información del documento</option>
                  <option value="2">2 — Rescindir la operación (devolución, cancelación)</option>
                  <option value="3">3 — Otro motivo (especificar abajo)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">MOTIVO</label>
                <select className="input" value={formAnulacion.motivo} onChange={e => setFormAnulacion(f => ({ ...f, motivo: e.target.value }))}>
                  {MOTIVOS_ANULACION.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">DETALLE DEL MOTIVO *</label>
                <input
                  className="input"
                  placeholder="Describa el motivo de la anulación..."
                  value={formAnulacion.motivoDetalle}
                  onChange={e => setFormAnulacion(f => ({ ...f, motivoDetalle: e.target.value }))}
                />
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setAnulacionOpen(null)}>Cancelar</button>
              <button
                className="btn btn-anular"
                onClick={ejecutarAnulacion}
                disabled={anulando || !formAnulacion.motivoDetalle.trim()}
                style={{ fontWeight: 700 }}>
                {anulando ? '⏳ Anulando...' : '🚫 Confirmar Anulación'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── MODAL NC / ND ── */}
      {ncndOpen && (
        <div className="modal-overlay" onClick={() => setNcndOpen(null)}>
          <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ color: ncndTipo === 'NC' ? '#8b5cf6' : '#f59e0b' }}>
              {ncndTipo === 'NC' ? '📝 Nota de Crédito' : '📋 Nota de Débito'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
              {ncndTipo === 'NC' ? 'Reduce o anula el monto de un DTE ya emitido' : 'Añade un cargo adicional a un DTE ya emitido'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '65vh', overflowY: 'auto', paddingRight: 4 }}>

              <div className="ncnd-section">
                <div className="ncnd-section-title">📎 DTE Relacionado</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div className="form-group">
                    <label className="form-label">Tipo documento *</label>
                    <select className="input" value={ncndForm.tipoDocumento} onChange={e => setNcndForm(f => ({ ...f, tipoDocumento: e.target.value }))}>
                      <option value="01">01 — Factura (FE)</option>
                      <option value="03">03 — Crédito Fiscal (CCF)</option>
                      <option value="11">11 — FEX</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tipo generación *</label>
                    <select className="input" value={ncndForm.tipoGeneracion} onChange={e => setNcndForm(f => ({ ...f, tipoGeneracion: e.target.value }))}>
                      <option value="1">1 — Físico</option>
                      <option value="2">2 — Electrónico</option>
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label className="form-label">UUID (codigoGeneracion) del DTE *</label>
                  <input className="input" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                    value={ncndForm.numeroDocumento}
                    onChange={e => setNcndForm(f => ({ ...f, numeroDocumento: e.target.value }))}
                    style={{ fontFamily: 'var(--mono)', fontSize: 12 }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha emisión del DTE *</label>
                  <input className="input" type="date" value={ncndForm.fechaEmision} onChange={e => setNcndForm(f => ({ ...f, fechaEmision: e.target.value }))} />
                </div>
              </div>

              <div className="ncnd-section">
                <div className="ncnd-section-title">👤 Receptor</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input className="input" placeholder="Nombre / Razón Social *" value={ncndForm.nombre} onChange={e => setNcndForm(f => ({ ...f, nombre: e.target.value }))} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input className="input" placeholder="NIT *" value={ncndForm.nit} onChange={e => setNcndForm(f => ({ ...f, nit: e.target.value }))} />
                    <input className="input" placeholder="NRC *" value={ncndForm.nrc} onChange={e => setNcndForm(f => ({ ...f, nrc: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Actividad Económica *</label>
                    <BuscadorActividad
                      codActividad={ncndForm.codActividad}
                      descActividad={ncndForm.descActividad}
                      onChange={({ codigo, descripcion }) => setNcndForm(f => ({ ...f, codActividad: codigo, descActividad: descripcion }))}
                      placeholder="Buscar por código o descripción..."
                    />
                  </div>
                  <SelectorDepartamento
                    codDep={ncndForm.departamento}
                    codMun={ncndForm.municipio}
                    distrito={ncndForm.distrito || ''}
                    onChange={({ codDep, codMun, distrito }) => setNcndForm(f => ({ ...f, departamento: codDep, municipio: codMun, distrito: distrito || '' }))}
                  />
                  <input className="input" placeholder="Complemento de dirección" value={ncndForm.complemento} onChange={e => setNcndForm(f => ({ ...f, complemento: e.target.value }))} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input className="input" placeholder="Teléfono *" value={ncndForm.telefono} onChange={e => setNcndForm(f => ({ ...f, telefono: e.target.value }))} />
                    <input className="input" placeholder="Correo *" value={ncndForm.correo} onChange={e => setNcndForm(f => ({ ...f, correo: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="ncnd-section">
                <div className="ncnd-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>📦 Items a {ncndTipo === 'NC' ? 'acreditar' : 'cobrar'}</span>
                  {ncndForm.itemsDevueltos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setNcndForm(f => ({
                        ...f,
                        itemsDevueltos: f.itemsDevueltos.map(it => ({
                          ...it, seleccionado: true, qtyDevuelta: it.qtyOriginal
                        }))
                      }))}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 6,
                        border: '1.5px solid var(--border)', background: 'var(--surface2)',
                        cursor: 'pointer', color: ncndTipo === 'NC' ? '#8b5cf6' : '#f59e0b',
                        fontWeight: 600
                      }}
                    >
                      ✓ {ncndTipo === 'NC' ? 'Devolver TODO' : 'Cobrar TODO'}
                    </button>
                  )}
                </div>

                {ncndForm.itemsDevueltos.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)', padding: 10, textAlign: 'center' }}>
                    El DTE original no tiene items detallados.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ncndForm.itemsDevueltos.map((it, idx) => (
                      <div key={idx} style={{
                        background: 'var(--surface2)', border: '1.5px solid var(--border)',
                        borderRadius: 8, padding: '10px 12px',
                        opacity: it.seleccionado ? 1 : 0.55,
                        transition: 'opacity 0.15s'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <input
                            type="checkbox"
                            checked={it.seleccionado}
                            onChange={e => {
                              const checked = e.target.checked
                              setNcndForm(f => {
                                const items = [...f.itemsDevueltos]
                                items[idx] = {
                                  ...items[idx], seleccionado: checked,
                                  qtyDevuelta: checked ? items[idx].qtyOriginal : 0
                                }
                                return { ...f, itemsDevueltos: items }
                              })
                            }}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                          />
                          <span style={{ fontWeight: 600, fontSize: 13 }}>
                            {it.codigo ? <span style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{it.codigo} · </span> : null}
                            {it.nombre}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, marginLeft: 24 }}>
                          Original: {it.qtyOriginal} × ${it.precioBase.toFixed(4)} = ${(it.qtyOriginal * it.precioBase).toFixed(2)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 24 }}>
                          <span style={{ fontSize: 12 }}>{ncndTipo === 'NC' ? 'Devolver' : 'Cobrar'}:</span>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max={it.qtyOriginal}
                            step="any"
                            value={it.qtyDevuelta}
                            disabled={!it.seleccionado}
                            onChange={e => {
                              let qty = parseFloat(e.target.value) || 0
                              if (qty < 0) qty = 0
                              if (qty > it.qtyOriginal) qty = it.qtyOriginal
                              setNcndForm(f => {
                                const items = [...f.itemsDevueltos]
                                items[idx] = { ...items[idx], qtyDevuelta: qty }
                                return { ...f, itemsDevueltos: items }
                              })
                            }}
                            style={{ width: 80, fontSize: 13, padding: '4px 8px' }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            de {it.qtyOriginal} → ${(it.qtyDevuelta * it.precioBase).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(() => {
                  const sub = ncndForm.itemsDevueltos.reduce((s, it) => s + (it.qtyDevuelta * it.precioBase), 0)
                  const ivaCalc = Math.round(sub * 0.13 * 100) / 100
                  const totalCalc = Math.round((sub + ivaCalc) * 100) / 100
                  const subR = Math.round(sub * 100) / 100
                  return (
                    <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Subtotal:</span><strong>${subR.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>IVA 13%:</span><strong>${ivaCalc.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                        <span>Total {ncndTipo}:</span>
                        <strong style={{ color: ncndTipo === 'NC' ? '#8b5cf6' : '#f59e0b', fontSize: 14 }}>
                          ${totalCalc.toFixed(2)}
                        </strong>
                      </div>
                    </div>
                  )
                })()}

                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Motivo *</label>
                  <input className="input"
                    placeholder={ncndTipo === 'NC' ? 'Error en precio, devolución de producto...' : 'Cargo adicional, diferencia de precio...'}
                    value={ncndForm.motivo} onChange={e => setNcndForm(f => ({ ...f, motivo: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setNcndOpen(null)}>Cancelar</button>
              <button className="btn btn-primary"
                style={{ background: ncndTipo === 'NC' ? '#8b5cf6' : '#f59e0b', boxShadow: 'none' }}
                disabled={
                  guardandoNcNd || !ncndForm.nombre || !ncndForm.nit || !ncndForm.nrc ||
                  !ncndForm.numeroDocumento || !ncndForm.motivo ||
                  ncndForm.itemsDevueltos.filter(it => it.seleccionado && it.qtyDevuelta > 0).length === 0
                }
                onClick={async () => {
                  setGuardandoNcNd(true)
                  try {
                    // 1. Filtrar solo los items seleccionados con cantidad > 0
                    const itemsSel = ncndForm.itemsDevueltos.filter(it => it.seleccionado && it.qtyDevuelta > 0)
                    if (itemsSel.length === 0) {
                      alert('Seleccioná al menos un item con cantidad mayor a 0')
                      setGuardandoNcNd(false)
                      return
                    }

                    // 2. Calcular totales (mismo cálculo que se muestra en el modal)
                    const subtotal = itemsSel.reduce((s, it) => s + (it.qtyDevuelta * it.precioBase), 0)
                    const iva = Math.round(subtotal * 0.13 * 100) / 100
                    const total = Math.round((subtotal + iva) * 100) / 100
                    const subR = Math.round(subtotal * 100) / 100

                    // 3. Generar codigoGeneracion nuevo para esta NC/ND
                    const codigoGeneracion = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random())).toUpperCase()

                    // 4. Construir items del DTE NC/ND (con la cantidad devuelta)
                    const itemsDTE = itemsSel.map(it => ({
                      codigo: it.codigo || '',
                      nombre: it.nombre,
                      precioBase: it.precioBase,
                      precioConIva: Math.round(it.precioBase * 1.13 * 10000) / 10000,
                      qty: it.qtyDevuelta,
                      subtotal: Math.round(it.qtyDevuelta * it.precioBase * 100) / 100,
                    }))

                    // 5. Construir el documentoRelacionado (referencia al DTE original)
                    const docRel = {
                      tipoDocumento: ncndForm.tipoDocumento,
                      tipoGeneracion: parseInt(ncndForm.tipoGeneracion),
                      numeroDocumento: ncndForm.numeroDocumento,
                      fechaEmision: ncndForm.fechaEmision,
                    }

                    // 6. Crear doc en VENTAS (el endpoint lee de aquí para transmitir)
                    const ventaData = {
                      tipoDte: ncndTipo, // 'NC' o 'ND'
                      codigoGeneracion,
                      cliente: ncndForm.nombre,
                      nit: ncndForm.nit,
                      nrc: ncndForm.nrc,
                      codActividad: ncndForm.codActividad,
                      descActividad: ncndForm.descActividad,
                      codDep: ncndForm.departamento,
                      codMun: ncndForm.municipio,
                      direccion: buildComplemento(ncndForm.distrito, ncndForm.complemento),
                      correo: ncndForm.correo,
                      telefono: ncndForm.telefono,
                      tipoPago: 'contado',
                      formaPago: 'efectivo',
                      items: itemsDTE,
                      subtotal: subR,
                      iva,
                      total,
                      documentoRelacionado: docRel,
                      motivo: ncndForm.motivo,
                      sucursalId: ncndOpen.sucursalId || '',
                      origenNcNd: true,
                      facturaOrigenId: ncndOpen.id,
                      estado: 'completada',
                      cajero: user?.displayName || user?.email || '',
                      cajeroId: user?.uid || '',
                      createdAt: serverTimestamp(),
                    }
                    const ventaRef = await addDoc(collection(db, 'ventas'), ventaData)

                    // 7. Crear doc en FACTURAS (para que aparezca en la lista)
                    await addDoc(collection(db, 'facturas'), {
                      tipoDte: ncndTipo,
                      numero: `${ncndTipo}-PENDIENTE`,
                      codigoGeneracion,
                      cliente: ncndForm.nombre,
                      nit: ncndForm.nit, nrc: ncndForm.nrc,
                      codActividad: ncndForm.codActividad,
                      descActividad: ncndForm.descActividad,
                      codDep: ncndForm.departamento, codMun: ncndForm.municipio,
                      distrito: ncndForm.distrito || '',
                      direccion: buildComplemento(ncndForm.distrito, ncndForm.complemento),
                      telefono: ncndForm.telefono, email: ncndForm.correo,
                      documentoRelacionado: docRel,
                      items: itemsDTE,
                      subtotal: subR, iva, total,
                      motivo: ncndForm.motivo,
                      estadoPago: 'pagada', tipoPago: 'contado',
                      fechaEmision: fechaSV(),
                      sucursalId: ncndOpen.sucursalId || '',
                      origenNcNd: true,
                      facturaOrigenId: ncndOpen.id,
                      ventaId: ventaRef.id,
                      estado: 'pendiente_envio',
                      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                    })

                    // 8. Cerrar modal y resetear form
                    setNcndOpen(null)
                    setNcndForm({
                      nombre: '', nit: '', nrc: '', codActividad: '', descActividad: '',
                      departamento: '', municipio: '', distrito: '', complemento: '',
                      telefono: '', correo: '', tipoDocumento: '01', tipoGeneracion: '2',
                      numeroDocumento: '', fechaEmision: '', monto: '', motivo: '',
                      itemsDevueltos: [],
                    })

                    // 9. Transmitir al MH
                    const resp = await fetch('/api/dte/transmitir', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ventaId: ventaRef.id })
                    })
                    const data = await resp.json()

                    if (data.ok && data.estado === 'PROCESADO') {
                      alert(`✅ ${ncndTipo} transmitida y procesada por el MH.\n\nSello: ${data.selloRecibido}\nNúmero de control: ${data.numeroControl}`)
                    } else if (data.estado === 'RECHAZADO') {
                      const obs = Array.isArray(data.observaciones) ? data.observaciones.join('\n') : (data.observaciones || data.detalleMH?.descripcionMsg || 'Sin detalles')
                      alert(`❌ ${ncndTipo} RECHAZADA por el MH\n\n${obs}\n\nEl ${ncndTipo} quedó guardado como pendiente. Corregí los datos y reintentá con el botón 📡.`)
                    } else {
                      alert(`⚠️ Respuesta inesperada del servidor\n\n${data.error || JSON.stringify(data).slice(0, 200)}\n\nEl ${ncndTipo} quedó guardado. Reintentá con el botón 📡.`)
                    }
                  } catch (e) {
                    alert('Error: ' + e.message)
                  }
                  setGuardandoNcNd(false)
                }}>
                {guardandoNcNd ? '⏳ Procesando...' : 'Emitir ' + ncndTipo}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}