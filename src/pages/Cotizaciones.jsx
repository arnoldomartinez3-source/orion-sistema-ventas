import { useState, useEffect, useRef } from 'react'
import { db } from '../firebase'
import {
  collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, getDocs, query, orderBy
} from 'firebase/firestore'
import { useAuth } from '../AuthContext'

// ══════════════════════════════════════════════════
// MÓDULO DE COTIZACIONES — ORIÓN
// Diseño profesional con vista previa en tiempo real
// ══════════════════════════════════════════════════

const IVA = 0.13
const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`

const ESTADOS = [
  { value: 'borrador',  label: 'Borrador',  color: '#7a9cc0', bg: 'rgba(122,156,192,0.12)', icon: '📝' },
  { value: 'enviada',   label: 'Enviada',   color: '#4A8FE8', bg: 'rgba(74,143,232,0.12)',  icon: '📤' },
  { value: 'aceptada',  label: 'Aceptada',  color: '#00C296', bg: 'rgba(0,194,150,0.12)',   icon: '✅' },
  { value: 'rechazada', label: 'Rechazada', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   icon: '❌' },
  { value: 'vencida',   label: 'Vencida',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏰' },
]

const FORM_INICIAL = {
  clienteNombre: '', clienteNit: '', clienteEmail: '', clienteTelefono: '', clienteDireccion: '',
  validezDias: 15, notas: '', terminosCondiciones: 'Esta cotización tiene validez por los días indicados. Los precios pueden variar sin previo aviso.',
  items: [], incluirIva: true,
}

const ITEM_INICIAL = {
  productoId: '', descripcion: '', cantidad: 1, precioUnitario: 0, descuento: 0, unidad: 'unidad'
}

export default function Cotizaciones() {
  const { user } = useAuth()
  const [vista, setVista] = useState('lista')
  const [cotizaciones, setCotizaciones] = useState([])
  const [productos, setProductos] = useState([])
  const [clientes, setClientes] = useState([])
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [cotizacionActual, setCotizacionActual] = useState(null)
  const [form, setForm] = useState(FORM_INICIAL)
  const [itemActual, setItemActual] = useState(ITEM_INICIAL)
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [dropProd, setDropProd] = useState(false)
  const [dropCliente, setDropCliente] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [modalEliminar, setModalEliminar] = useState(null)
  const prodRef = useRef(null)
  const clienteRef = useRef(null)

  useEffect(() => {
    const unsubCot = onSnapshot(
      query(collection(db, 'cotizaciones'), orderBy('createdAt', 'desc')),
      snap => { setCotizaciones(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) }
    )
    const unsubProd = onSnapshot(collection(db, 'productos'), snap => {
      setProductos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    const unsubCli = onSnapshot(collection(db, 'clientes'), snap => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    // Cargar config empresa
    if (user) {
      getDocs(collection(db, 'configuracion')).then(snap => {
        snap.docs.forEach(d => { if (d.id === user.uid) setConfig(d.data()) })
      })
    }
    const handleClick = (e) => {
      if (prodRef.current && !prodRef.current.contains(e.target)) setDropProd(false)
      if (clienteRef.current && !clienteRef.current.contains(e.target)) setDropCliente(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => { unsubCot(); unsubProd(); unsubCli(); document.removeEventListener('mousedown', handleClick) }
  }, [user])

  // ── Totales ──
  const calcTotales = (items, incluirIva) => {
    const subtotal = items.reduce((s, i) => {
      const base = i.cantidad * i.precioUnitario
      return s + base - base * (i.descuento / 100)
    }, 0)
    const iva = incluirIva ? subtotal * IVA : 0
    return { subtotal, iva, total: subtotal + iva }
  }
  const totales = calcTotales(form.items, form.incluirIva)

  // ── Productos filtrados ──
  const prodsFiltrados = productos.filter(p => {
    const q = busquedaProducto.toLowerCase()
    return p.nombre?.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q)
  }).slice(0, 8)

  // ── Clientes filtrados ──
  const clientesFiltrados = clientes.filter(c =>
    c.nombre?.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
    c.nit?.includes(busquedaCliente)
  ).slice(0, 6)

  const seleccionarProducto = (prod) => {
    setItemActual(p => ({
      ...p, productoId: prod.id, descripcion: prod.nombre,
      unidad: prod.unidad || 'unidad', precioUnitario: prod.precioVenta || 0,
    }))
    setBusquedaProducto(prod.nombre)
    setDropProd(false)
  }

  const seleccionarCliente = (cli) => {
    setForm(p => ({
      ...p, clienteNombre: cli.nombre, clienteNit: cli.nit || '',
      clienteEmail: cli.email || '', clienteTelefono: cli.telefono || '',
      clienteDireccion: cli.direccion || '',
    }))
    setBusquedaCliente(cli.nombre)
    setDropCliente(false)
  }

  const agregarItem = () => {
    if (!itemActual.descripcion || itemActual.precioUnitario <= 0) {
      alert('Completa la descripción y precio'); return
    }
    setForm(p => ({ ...p, items: [...p.items, { ...itemActual, id: Date.now() }] }))
    setItemActual(ITEM_INICIAL)
    setBusquedaProducto('')
  }

  const quitarItem = (id) => setForm(p => ({ ...p, items: p.items.filter(i => i.id !== id) }))

  const actualizarItem = (id, campo, valor) => {
    setForm(p => ({ ...p, items: p.items.map(i => i.id === id ? { ...i, [campo]: valor } : i) }))
  }

  // ── Fecha vencimiento ──
  const fechaVencimiento = () => {
    const d = new Date()
    d.setDate(d.getDate() + (form.validezDias || 15))
    return d.toLocaleDateString('es-SV', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  // ── Número correlativo ──
  const numeroCot = cotizacionActual?.numero || `COT-${String(cotizaciones.length + 1).padStart(5, '0')}`

  // ── Guardar cotización ──
  const guardar = async (estado = 'borrador') => {
    if (!form.clienteNombre) { alert('Agrega el nombre del cliente'); return }
    if (form.items.length === 0) { alert('Agrega al menos un producto'); return }
    setProcesando(true)
    try {
      const { subtotal, iva, total } = calcTotales(form.items, form.incluirIva)
      const fechaVence = new Date()
      fechaVence.setDate(fechaVence.getDate() + (form.validezDias || 15))

      const data = {
        ...form, subtotal, iva, total, estado,
        fechaEmision: new Date().toISOString().slice(0, 10),
        fechaVencimiento: fechaVence.toISOString().slice(0, 10),
        updatedAt: serverTimestamp(),
      }

      if (cotizacionActual) {
        await updateDoc(doc(db, 'cotizaciones', cotizacionActual.id), data)
      } else {
        await addDoc(collection(db, 'cotizaciones'), {
          ...data,
          numero: `COT-${String(cotizaciones.length + 1).padStart(5, '0')}`,
          createdAt: serverTimestamp(),
        })
      }
      setForm(FORM_INICIAL)
      setCotizacionActual(null)
      setBusquedaCliente('')
      setVista('lista')
    } catch (e) { alert('Error: ' + e.message) }
    setProcesando(false)
  }

  // ── Cambiar estado ──
  const cambiarEstado = async (cot, nuevoEstado) => {
    await updateDoc(doc(db, 'cotizaciones', cot.id), { estado: nuevoEstado, updatedAt: serverTimestamp() })
  }

  // ── Convertir a venta ──
  const convertirAVenta = async (cot) => {
    if (!window.confirm(`¿Convertir ${cot.numero} a venta? Esto creará una nueva venta en el sistema.`)) return
    try {
      await addDoc(collection(db, 'ventas'), {
        clienteNombre: cot.clienteNombre, clienteNit: cot.clienteNit,
        items: cot.items, subtotal: cot.subtotal, iva: cot.iva, total: cot.total,
        origen: 'cotizacion', cotizacionNumero: cot.numero,
        estado: 'completada', tipoPago: 'contado',
        fecha: new Date().toISOString().slice(0, 10),
        createdAt: serverTimestamp(),
      })
      await updateDoc(doc(db, 'cotizaciones', cot.id), { estado: 'aceptada', updatedAt: serverTimestamp() })
      alert(`✅ ${cot.numero} convertida a venta exitosamente`)
    } catch (e) { alert('Error: ' + e.message) }
  }

  // ── Compartir WhatsApp ──
  const compartirWhatsApp = (cot) => {
    const msg = encodeURIComponent(
      `Hola! Te envío la cotización *${cot.numero}* de *${config.empresaNombre || 'ORIÓN'}*\n\n` +
      `📋 *Detalle:*\n` +
      cot.items.map(i => `• ${i.descripcion}: ${i.cantidad} × ${fmt(i.precioUnitario)} = ${fmt(i.cantidad * i.precioUnitario)}`).join('\n') +
      `\n\n💰 *Total: ${fmt(cot.total)}*\n` +
      `📅 *Válida hasta:* ${cot.fechaVencimiento}\n\n` +
      `Para aceptar o consultar, contáctanos. ¡Gracias!`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  // ── Imprimir PDF ──
  const imprimirPDF = (cot) => {
    const cotToUse = cot || { ...form, numero: numeroCot, fechaEmision: new Date().toISOString().slice(0,10), fechaVencimiento: new Date(Date.now() + form.validezDias * 86400000).toISOString().slice(0,10), ...calcTotales(form.items, form.incluirIva) }
    const win = window.open('', '_blank')
    win.document.write(generarHTML(cotToUse))
    win.document.close()
    win.print()
  }

  // ── Generar HTML del PDF ──
  const generarHTML = (cot) => {
    const tots = calcTotales(cot.items || [], cot.incluirIva !== false)
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Cotización ${cot.numero}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; background: #fff; font-size: 13px; }
    .page { max-width: 800px; margin: 0 auto; padding: 40px; }

    /* HEADER */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 3px solid #1B2E6B; }
    .empresa-info h1 { font-size: 22px; font-weight: 900; color: #1B2E6B; letter-spacing: -0.5px; }
    .empresa-info p { font-size: 11px; color: #6b7280; margin-top: 3px; }
    .cot-badge { text-align: right; }
    .cot-numero { font-size: 28px; font-weight: 900; color: #1B2E6B; letter-spacing: -1px; }
    .cot-tipo { font-size: 11px; color: #6b7280; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
    .cot-estado { display: inline-block; padding: 4px 14px; border-radius: 99px; font-size: 11px; font-weight: 700; background: rgba(0,194,150,0.12); color: #00856b; border: 1px solid rgba(0,194,150,0.3); }

    /* INFO ROW */
    .info-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
    .info-box { background: #f8faff; border-radius: 10px; padding: 16px; border: 1px solid #e5eaf5; }
    .info-box h3 { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px; font-weight: 700; }
    .info-box p { font-size: 13px; color: #1a1a2e; font-weight: 500; line-height: 1.6; }
    .info-box .highlight { font-size: 15px; font-weight: 800; color: #1B2E6B; }

    /* VALIDEZ */
    .validez-banner { background: linear-gradient(135deg, #1B2E6B, #2E5FA3); color: white; border-radius: 10px; padding: 12px 20px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .validez-banner span { font-size: 12px; opacity: 0.8; }
    .validez-banner strong { font-size: 14px; }

    /* TABLA */
    .tabla-header { background: #1B2E6B; color: white; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(27,46,107,0.1); }
    th { padding: 12px 16px; text-align: left; font-size: 11px; letter-spacing: 0.8px; font-weight: 700; text-transform: uppercase; }
    th:last-child, td:last-child { text-align: right; }
    td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #f0f4ff; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #fafbff; }
    .item-num { width: 30px; color: #9ca3af; font-size: 11px; }
    .item-desc { font-weight: 600; }
    .item-cant { width: 70px; text-align: center !important; }
    .item-precio, .item-desc_pct, .item-total { width: 100px; }

    /* TOTALES */
    .totales { display: flex; justify-content: flex-end; margin-bottom: 24px; }
    .totales-box { min-width: 260px; }
    .total-row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #f0f4ff; font-size: 13px; color: #6b7280; }
    .total-row.final { border-bottom: none; padding: 12px 0 0; margin-top: 4px; }
    .total-row.final .label { font-size: 16px; font-weight: 800; color: #1B2E6B; }
    .total-row.final .value { font-size: 20px; font-weight: 900; color: #1B2E6B; }

    /* NOTAS */
    .notas-section { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 28px; }
    .nota-box { background: #f8faff; border-radius: 10px; padding: 16px; border: 1px solid #e5eaf5; }
    .nota-box h3 { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px; font-weight: 700; }
    .nota-box p { font-size: 12px; color: #4b5563; line-height: 1.6; }

    /* FOOTER */
    .footer { text-align: center; padding-top: 20px; border-top: 1px solid #e5eaf5; }
    .footer p { font-size: 11px; color: #9ca3af; margin-bottom: 4px; }
    .footer .powered { font-size: 10px; color: #d1d5db; margin-top: 8px; letter-spacing: 1px; }

    /* FIRMA */
    .firma-row { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin: 24px 0; }
    .firma-box { text-align: center; }
    .firma-linea { border-top: 1.5px solid #1B2E6B; padding-top: 8px; margin-top: 40px; font-size: 11px; color: #6b7280; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 20px; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="empresa-info">
      ${config.logoUrl ? `<img src="${config.logoUrl}" alt="${config.empresaNombre || 'Empresa'}" style="max-height:60px;max-width:200px;object-fit:contain;margin-bottom:8px;display:block;"/>` : ''}
      <h1>${config.empresaNombre || 'Mi Empresa'}</h1>
      <p>${config.direccion || ''}</p>
      <p>NIT: ${config.nit || ''} | NRC: ${config.nrc || ''}</p>
      ${config.telefono ? `<p>Tel: ${config.telefono}</p>` : ''}
    </div>
    <div class="cot-badge">
      <div class="cot-tipo">Cotización</div>
      <div class="cot-numero">${cot.numero || numeroCot}</div>
      <div class="cot-estado">${ESTADOS.find(e => e.value === cot.estado)?.label || 'Borrador'}</div>
    </div>
  </div>

  <!-- BANNER VALIDEZ -->
  <div class="validez-banner">
    <div><span>Fecha de emisión</span><br/><strong>${cot.fechaEmision || new Date().toLocaleDateString('es-SV')}</strong></div>
    <div style="text-align:center"><span>Validez</span><br/><strong>${cot.validezDias || 15} días</strong></div>
    <div style="text-align:right"><span>Válida hasta</span><br/><strong>${cot.fechaVencimiento || fechaVencimiento()}</strong></div>
  </div>

  <!-- INFO CLIENTE / EMPRESA -->
  <div class="info-row">
    <div class="info-box">
      <h3>Para</h3>
      <p class="highlight">${cot.clienteNombre || ''}</p>
      ${cot.clienteNit ? `<p>NIT: ${cot.clienteNit}</p>` : ''}
      ${cot.clienteEmail ? `<p>${cot.clienteEmail}</p>` : ''}
      ${cot.clienteTelefono ? `<p>Tel: ${cot.clienteTelefono}</p>` : ''}
      ${cot.clienteDireccion ? `<p>${cot.clienteDireccion}</p>` : ''}
    </div>
    <div class="info-box">
      <h3>Elaborada por</h3>
      <p class="highlight">${config.empresaNombre || 'Mi Empresa'}</p>
      ${config.correo ? `<p>${config.correo}</p>` : ''}
      ${config.telefono ? `<p>Tel: ${config.telefono}</p>` : ''}
      <p style="margin-top:8px;font-size:11px;color:#9ca3af;">Generada con ORIÓN · ONE GEO SYSTEMS</p>
    </div>
  </div>

  <!-- TABLA PRODUCTOS -->
  <table>
    <thead class="tabla-header">
      <tr>
        <th class="item-num">#</th>
        <th class="item-desc">Descripción</th>
        <th class="item-cant" style="text-align:center">Cant.</th>
        <th class="item-precio" style="text-align:right">Precio Unit.</th>
        <th class="item-desc_pct" style="text-align:right">Desc.</th>
        <th class="item-total" style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${(cot.items || []).map((item, i) => {
        const base = item.cantidad * item.precioUnitario
        const desc = base * (item.descuento / 100)
        const total = base - desc
        return `<tr>
          <td class="item-num">${i + 1}</td>
          <td class="item-desc">${item.descripcion}<br/><span style="font-size:11px;color:#9ca3af;">${item.unidad}</span></td>
          <td style="text-align:center">${item.cantidad}</td>
          <td style="text-align:right">${fmt(item.precioUnitario)}</td>
          <td style="text-align:right;color:#f59e0b">${item.descuento > 0 ? item.descuento + '%' : '—'}</td>
          <td style="text-align:right;font-weight:700">${fmt(total)}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>

  <!-- TOTALES -->
  <div class="totales">
    <div class="totales-box">
      <div class="total-row"><span class="label">Subtotal</span><span class="value">${fmt(tots.subtotal)}</span></div>
      ${tots.iva > 0 ? `<div class="total-row"><span class="label">IVA 13%</span><span class="value">${fmt(tots.iva)}</span></div>` : ''}
      <div class="total-row final"><span class="label">TOTAL</span><span class="value">${fmt(tots.total)}</span></div>
    </div>
  </div>

  <!-- NOTAS Y TÉRMINOS -->
  ${(cot.notas || cot.terminosCondiciones) ? `
  <div class="notas-section">
    ${cot.notas ? `<div class="nota-box"><h3>Notas</h3><p>${cot.notas}</p></div>` : '<div></div>'}
    ${cot.terminosCondiciones ? `<div class="nota-box"><h3>Términos y Condiciones</h3><p>${cot.terminosCondiciones}</p></div>` : ''}
  </div>` : ''}

  <!-- FIRMAS -->
  <div class="firma-row">
    <div class="firma-box">
      <div class="firma-linea">Firma del Cliente / ${cot.clienteNombre || ''}</div>
    </div>
    <div class="firma-box">
      <div class="firma-linea">Firma Autorizada / ${config.empresaNombre || ''}</div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <p>Esta cotización fue generada electrónicamente y es válida sin firma cuando se envía por medios digitales.</p>
    <p>Para aceptar esta cotización, comuníquese con nosotros antes del ${cot.fechaVencimiento || fechaVencimiento()}.</p>
    <div class="powered">ORIÓN · ONE GEO SYSTEMS · Sistema de Gestión Empresarial</div>
  </div>

</div>
</body>
</html>`
  }

  // ── Editar cotización ──
  const editarCotizacion = (cot) => {
    setCotizacionActual(cot)
    setForm({
      clienteNombre: cot.clienteNombre || '', clienteNit: cot.clienteNit || '',
      clienteEmail: cot.clienteEmail || '', clienteTelefono: cot.clienteTelefono || '',
      clienteDireccion: cot.clienteDireccion || '', validezDias: cot.validezDias || 15,
      notas: cot.notas || '', terminosCondiciones: cot.terminosCondiciones || '',
      items: cot.items || [], incluirIva: cot.incluirIva !== false,
    })
    setBusquedaCliente(cot.clienteNombre || '')
    setVista('nueva')
  }

  // Filtros lista
  const cotsFiltradas = cotizaciones.filter(c => {
    const q = busqueda.toLowerCase()
    const match = c.clienteNombre?.toLowerCase().includes(q) || c.numero?.toLowerCase().includes(q)
    const matchE = filtroEstado === 'todos' || c.estado === filtroEstado
    return match && matchE
  })

  // Stats
  const totalAceptadas = cotizaciones.filter(c => c.estado === 'aceptada').reduce((s, c) => s + (c.total || 0), 0)
  const totalPendientes = cotizaciones.filter(c => c.estado === 'enviada').length
  const tasaExito = cotizaciones.length > 0
    ? Math.round((cotizaciones.filter(c => c.estado === 'aceptada').length / cotizaciones.filter(c => c.estado !== 'borrador').length) * 100) || 0
    : 0

  // ════════════════════════════════
  // VISTA NUEVA / EDITAR
  // ════════════════════════════════
  if (vista === 'nueva') return (
    <>
      <style>{cotStyles}</style>
      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">{cotizacionActual ? '✏️ Editar Cotización' : '📄 Nueva Cotización'}</div>
          <div className="page-sub">{cotizacionActual ? cotizacionActual.numero : numeroCot}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => { setVista('lista'); setCotizacionActual(null); setForm(FORM_INICIAL); setBusquedaCliente('') }}>
            ← Cancelar
          </button>
          <button className="btn btn-ghost" onClick={() => imprimirPDF(null)}>
            🖨️ Vista Previa PDF
          </button>
          <button className="btn btn-secondary" onClick={() => guardar('borrador')} disabled={procesando}>
            💾 Guardar Borrador
          </button>
          <button className="btn btn-primary btn-lg" onClick={() => guardar('enviada')} disabled={procesando}>
            {procesando ? '⏳...' : '📤 Guardar y Enviar'}
          </button>
        </div>
      </div>

      <div className="cot-grid">

        {/* COLUMNA IZQUIERDA */}
        <div>

          {/* Cliente */}
          <div className="cot-section">
            <div className="cot-section-header"><span>👤</span> Datos del Cliente</div>
            <div className="cot-section-body">
              <div className="form-group" style={{ position: 'relative' }} ref={clienteRef}>
                <label className="form-label">Buscar Cliente *</label>
                <input className="input" placeholder="🔍 Nombre o NIT del cliente..."
                  value={busquedaCliente}
                  onChange={e => { setBusquedaCliente(e.target.value); setForm(p => ({ ...p, clienteNombre: e.target.value })); setDropCliente(true) }}
                  onFocus={() => setDropCliente(true)}/>
                {dropCliente && busquedaCliente.length > 0 && clientesFiltrados.length > 0 && (
                  <div className="search-dropdown">
                    {clientesFiltrados.map(c => (
                      <div key={c.id} className="search-dropdown-item" onMouseDown={() => seleccionarCliente(c)}>
                        <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.nit} {c.email}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">NIT / DUI</label>
                  <input className="input" placeholder="0614-010190-101-3"
                    value={form.clienteNit}
                    onChange={e => setForm(p => ({ ...p, clienteNit: e.target.value }))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="input" placeholder="7777-8888"
                    value={form.clienteTelefono}
                    onChange={e => setForm(p => ({ ...p, clienteTelefono: e.target.value }))}/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Correo Electrónico</label>
                <input className="input" placeholder="cliente@empresa.com"
                  value={form.clienteEmail}
                  onChange={e => setForm(p => ({ ...p, clienteEmail: e.target.value }))}/>
              </div>
              <div className="form-group">
                <label className="form-label">Dirección</label>
                <input className="input" placeholder="Dirección del cliente"
                  value={form.clienteDireccion}
                  onChange={e => setForm(p => ({ ...p, clienteDireccion: e.target.value }))}/>
              </div>
            </div>
          </div>

          {/* Configuración */}
          <div className="cot-section">
            <div className="cot-section-header"><span>⚙️</span> Configuración</div>
            <div className="cot-section-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Validez (días)</label>
                  <input className="input" type="number" min="1" max="365"
                    value={form.validezDias}
                    onChange={e => setForm(p => ({ ...p, validezDias: Number(e.target.value) }))}/>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    📅 Vence el {fechaVencimiento()}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">IVA</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    {[true, false].map(v => (
                      <div key={String(v)}
                        className={`condicion-btn ${form.incluirIva === v ? 'active' : ''}`}
                        style={{ flex: 1, textAlign: 'center' }}
                        onClick={() => setForm(p => ({ ...p, incluirIva: v }))}>
                        {v ? '✅ Con IVA' : '❌ Sin IVA'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notas para el cliente</label>
                <textarea className="input" rows={3} placeholder="Incluye tiempo de entrega, condiciones especiales, etc."
                  style={{ resize: 'vertical', lineHeight: 1.5 }}
                  value={form.notas}
                  onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}/>
              </div>
              <div className="form-group">
                <label className="form-label">Términos y Condiciones</label>
                <textarea className="input" rows={3}
                  style={{ resize: 'vertical', lineHeight: 1.5 }}
                  value={form.terminosCondiciones}
                  onChange={e => setForm(p => ({ ...p, terminosCondiciones: e.target.value }))}/>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA */}
        <div>
          <div className="cot-section">
            <div className="cot-section-header"><span>🛒</span> Productos / Servicios</div>
            <div className="cot-section-body">

              {/* Buscador producto */}
              <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 14, border: '1.5px solid var(--border)' }}>
                <div className="form-group" style={{ position: 'relative', marginBottom: 10 }} ref={prodRef}>
                  <label className="form-label">Buscar por nombre, código o escribe descripción libre</label>
                  <input className="input" placeholder="🔍 Producto, servicio o descripción..."
                    value={busquedaProducto}
                    onChange={e => { setBusquedaProducto(e.target.value); setItemActual(p => ({ ...p, descripcion: e.target.value })); setDropProd(true) }}
                    onFocus={() => setDropProd(true)}/>
                  {dropProd && busquedaProducto.length > 0 && prodsFiltrados.length > 0 && (
                    <div className="search-dropdown">
                      {prodsFiltrados.map(p => (
                        <div key={p.id} className="search-dropdown-item" onMouseDown={() => seleccionarProducto(p)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                {p.codigo && <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent2)', marginRight: 8 }}>{p.codigo}</span>}
                                Stock: {p.stock} {p.unidad}
                              </div>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{fmt(p.precioVenta)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Cantidad</label>
                    <input className="input" type="number" min="1" step="0.01"
                      value={itemActual.cantidad}
                      onChange={e => setItemActual(p => ({ ...p, cantidad: Number(e.target.value) }))}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Precio Unit.</label>
                    <input className="input" type="number" min="0" step="0.01"
                      value={itemActual.precioUnitario}
                      onChange={e => setItemActual(p => ({ ...p, precioUnitario: Number(e.target.value) }))}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Desc. %</label>
                    <input className="input" type="number" min="0" max="100"
                      value={itemActual.descuento}
                      onChange={e => setItemActual(p => ({ ...p, descuento: Number(e.target.value) }))}/>
                  </div>
                </div>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={agregarItem}>
                  + Agregar ítem
                </button>
              </div>

              {/* Items */}
              {form.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--muted)', fontSize: 13 }}>
                  🛒 Agrega productos o servicios a cotizar
                </div>
              ) : (
                <div>
                  {form.items.map((item, idx) => {
                    const base = item.cantidad * item.precioUnitario
                    const sub = base - base * (item.descuento / 100)
                    return (
                      <div key={item.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                              <span style={{ color: 'var(--muted)', fontSize: 11, marginRight: 8 }}>#{idx + 1}</span>
                              {item.descripcion}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input
                                style={{ width: 60, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', color: 'var(--text)', fontSize: 12 }}
                                type="number" value={item.cantidad} min="0.01" step="0.01"
                                onChange={e => actualizarItem(item.id, 'cantidad', Number(e.target.value))}/>
                              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.unidad} ×</span>
                              <input
                                style={{ width: 80, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', color: 'var(--text)', fontSize: 12 }}
                                type="number" value={item.precioUnitario} min="0" step="0.01"
                                onChange={e => actualizarItem(item.id, 'precioUnitario', Number(e.target.value))}/>
                              {item.descuento > 0 && <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>−{item.descuento}%</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <span className="amount" style={{ fontSize: 15 }}>{fmt(sub)}</span>
                            <button className="btn btn-danger btn-sm" onClick={() => quitarItem(item.id)}>✕</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Totales */}
                  <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 16, marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                      <span>Subtotal</span><span className="amount">{fmt(totales.subtotal)}</span>
                    </div>
                    {form.incluirIva && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--accent2)', marginBottom: 8 }}>
                        <span>IVA 13%</span><span className="amount">{fmt(totales.iva)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 900, color: 'var(--accent)', borderTop: '1.5px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                      <span>TOTAL</span><span className="amount">{fmt(totales.total)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )

  // ════════════════════════════════
  // VISTA LISTA
  // ════════════════════════════════
  return (
    <>
      <style>{cotStyles}</style>

      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">📄 Cotizaciones</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {cotizaciones.length} cotizaciones
            <span className="firebase-badge">🔥 Firebase</span>
          </div>
        </div>
        <button className="btn btn-primary btn-lg"
          onClick={() => { setForm(FORM_INICIAL); setCotizacionActual(null); setBusquedaCliente(''); setVista('nueva') }}>
          + Nueva Cotización
        </button>
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { color: '#00C296', icon: '✅', label: 'MONTO ACEPTADO', value: fmt(totalAceptadas) },
          { color: '#4A8FE8', icon: '📤', label: 'ENVIADAS PENDIENTES', value: totalPendientes },
          { color: '#f59e0b', icon: '📊', label: 'TASA DE ÉXITO', value: `${tasaExito}%` },
          { color: '#2E6FD4', icon: '📄', label: 'TOTAL COTIZACIONES', value: cotizaciones.length },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 18, position: 'relative', overflow: 'hidden', boxShadow: '0 4px 20px var(--shadow2)' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.color }}/>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.8px', marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)', letterSpacing: '-1px' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* FILTROS */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 300 }}
          placeholder="🔍 Buscar por cliente o número..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}/>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['todos', ...ESTADOS.map(e => e.value)].map(v => {
            const est = ESTADOS.find(e => e.value === v)
            return (
              <button key={v}
                onClick={() => setFiltroEstado(v)}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: '1.5px solid',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                  borderColor: filtroEstado === v ? (est?.color || 'var(--accent)') : 'var(--border)',
                  background: filtroEstado === v ? (est?.bg || 'var(--glow)') : 'var(--surface)',
                  color: filtroEstado === v ? (est?.color || 'var(--accent)') : 'var(--muted)',
                }}>
                {est ? `${est.icon} ${est.label}` : '📋 Todos'}
              </button>
            )
          })}
        </div>
      </div>

      {/* TABLA */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">📋 Historial de Cotizaciones</div>
        </div>
        {loading ? (
          <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">Cargando...</div></div>
        ) : cotsFiltradas.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📄</div>
            <div className="empty-text">No hay cotizaciones aún.<br/>Crea tu primera cotización.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>NÚMERO</th><th>CLIENTE</th><th>EMISIÓN</th>
                  <th>VENCE</th><th>TOTAL</th><th>ESTADO</th><th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {cotsFiltradas.map(c => {
                  const est = ESTADOS.find(e => e.value === c.estado) || ESTADOS[0]
                  const vencida = c.fechaVencimiento && new Date(c.fechaVencimiento) < new Date() && c.estado === 'enviada'
                  return (
                    <tr key={c.id}>
                      <td className="mono" style={{ color: 'var(--accent2)', fontWeight: 700 }}>{c.numero}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.clienteNombre}</div>
                        {c.clienteEmail && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.clienteEmail}</div>}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{c.fechaEmision}</td>
                      <td style={{ color: vencida ? '#ef4444' : 'var(--muted)', fontSize: 13, fontWeight: vencida ? 700 : 400 }}>
                        {c.fechaVencimiento}{vencida && ' ⚠️'}
                      </td>
                      <td className="amount" style={{ fontWeight: 700 }}>{fmt(c.total)}</td>
                      <td>
                        <select
                          style={{ background: est.bg, color: est.color, border: `1.5px solid ${est.color}40`, borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', outline: 'none' }}
                          value={c.estado}
                          onChange={e => cambiarEstado(c, e.target.value)}>
                          {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.icon} {e.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => imprimirPDF(c)} title="PDF">🖨️</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => compartirWhatsApp(c)} title="WhatsApp" style={{ color: '#25D366' }}>💬</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => editarCotizacion(c)} title="Editar">✏️</button>
                          {c.estado === 'aceptada' && (
                            <button className="btn btn-primary btn-sm" onClick={() => convertirAVenta(c)} title="Convertir a venta">🛒</button>
                          )}
                          <button className="btn btn-danger btn-sm" onClick={() => setModalEliminar(c)} title="Eliminar">🗑️</button>
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

      {/* MODAL ELIMINAR */}
      {modalEliminar && (
        <div className="modal-overlay" onClick={() => setModalEliminar(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🗑️ ¿Eliminar cotización?</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
              Se eliminará permanentemente la cotización <strong style={{ color: 'var(--text)' }}>{modalEliminar.numero}</strong> de <strong style={{ color: 'var(--text)' }}>{modalEliminar.clienteNombre}</strong>.
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalEliminar(null)}>Cancelar</button>
              <button className="btn btn-danger" disabled={procesando}
                onClick={async () => {
                  setProcesando(true)
                  await deleteDoc(doc(db, 'cotizaciones', modalEliminar.id))
                  setModalEliminar(null); setProcesando(false)
                }}>
                {procesando ? '⏳...' : '🗑️ Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const cotStyles = `
  .cot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 960px) { .cot-grid { grid-template-columns: 1fr; } }

  .cot-section { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px var(--shadow2); margin-bottom: 16px; }
  .cot-section-header { padding: 14px 20px; border-bottom: 1.5px solid var(--border); background: var(--surface2); font-size: 14px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; }
  .cot-section-body { padding: 18px; display: flex; flex-direction: column; gap: 14px; }

  .condicion-btn { padding: 10px 8px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--surface2); font-size: 12px; font-weight: 600; color: var(--text2); cursor: pointer; text-align: center; transition: all 0.15s; }
  .condicion-btn:hover { border-color: var(--accent); color: var(--accent); }
  .condicion-btn.active { border-color: var(--accent); background: var(--glow); color: var(--accent); }

  .search-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 200; background: var(--surface); border: 1.5px solid var(--border); border-radius: 12px; box-shadow: 0 8px 30px var(--shadow); max-height: 240px; overflow-y: auto; }
  .search-dropdown-item { padding: 11px 16px; cursor: pointer; border-bottom: 1px solid var(--border); transition: background 0.15s; }
  .search-dropdown-item:last-child { border-bottom: none; }
  .search-dropdown-item:hover { background: var(--surface2); }
`
