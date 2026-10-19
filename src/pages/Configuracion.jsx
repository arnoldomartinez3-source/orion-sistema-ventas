import { useState, useEffect, useMemo, useRef } from 'react'
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
import { orionAlert, orionConfirm } from '../orionDialog'
import { generarImagenGiftCard, estilosDisponibles, descargarPlantillaGuia } from '../utils/giftcards'

// ══════════════════════════════════════════════════
// CONFIGURACIÓN — pantalla tipo "Ajustes": menú de temas a la izquierda, un tema a la
// vez a la derecha (una opción por fila), buscador de opciones y barra fija de Guardar.
//   Mi empresa · Datos fiscales · Cobro · Tickets · Inventario y compras · Gift cards ·
//   Horario y accesos · Mi plan · Seguridad
// El cliente solo cambia lo NO fiscal (logo, contacto, preferencias). Los datos
// fiscales y del MH los administra One Geo (Panel One Geo) y aquí se ven de lectura.
// Quien solo tiene 'autorizar_fuera_horario' entra directo a Horario y accesos.
// Enlaces viejos (?seccion=pos) siguen funcionando: 'pos' → Cobro.
// ══════════════════════════════════════════════════

const TIPO_ESTABLECIMIENTO = { '01': 'Casa Matriz', '02': 'Sucursal / Agencia', '04': 'Bodega', '07': 'Transporte', '20': 'Otro' }

// Índice de opciones (para el buscador y para los títulos). tema = en qué pantalla vive.
const OPCIONES = {
  logo:                 { tema: 'empresa',    titulo: 'Logo de la empresa', texto: 'Sale en el inicio de sesión, los tickets (si lo activás) y la gift card digital. PNG o JPG, máximo 2MB, mejor con fondo transparente.' },
  nombreComercial:      { tema: 'empresa',    titulo: 'Nombre comercial', texto: 'Nombre con el que te conocen tus clientes. Sale en tickets, correos y tarjetas.' },
  contacto:             { tema: 'empresa',    titulo: 'Teléfono y correo', texto: 'Datos de contacto que van en los tickets y en los correos a tus clientes.' },
  requerirCaja:         { tema: 'cobro',      titulo: 'Exigir caja abierta para vender', texto: 'El cajero tiene que abrir su caja (con el efectivo inicial) antes de poder cobrar. Así el cierre cuadra.' },
  pinAlCobrar:          { tema: 'cobro',      titulo: 'Pedir PIN de quien cobra', texto: 'Para una gaveta compartida entre varias cajeras: la sesión es una sola y al tocar Cobrar se pide el PIN de quien cobra. Cada venta queda a su nombre y el cierre muestra quién vendió cuánto.' },
  tipoDtePorDefecto:    { tema: 'cobro',      titulo: 'Documento con el que abre el cobro', texto: 'Si casi todos tus clientes piden Crédito Fiscal, elegí CCF. Igual se puede cambiar en cada venta (F5 / F6).' },
  comandas:             { tema: 'cobro',      titulo: 'Comandas / vales', texto: 'El vendedor arma un vale en el mostrador y el cajero lo cobra después. Activa la pestaña Comandas en el POS y la opción «solo arma comandas» en Usuarios.' },
  comandasDespacho:     { tema: 'cobro',      titulo: 'Control de despacho', texto: 'Agrega el paso «Para despachar»: después de cobrar, alguien marca el vale como entregado (bodeguero o el mismo vendedor).' },
  venderSinStock:       { tema: 'cobro',      titulo: 'Vender sin existencias', texto: 'Deja cobrar un producto aunque el stock esté en 0 (queda en negativo hasta que registres la compra). Útil cuando el producto llega antes de anotarlo.' },
  productoNuevoEnCaja:  { tema: 'cobro',      titulo: 'Agregar productos nuevos desde la caja', texto: 'Cuando el lector lee un código de barras que no está en el inventario, la caja pide el nombre, el precio y las existencias, y lo guarda. Apagado, la caja no hace nada con un código desconocido.' },
  descuentoMaxPct:      { tema: 'cobro',      titulo: 'Descuento máximo sin autorización', texto: 'Porcentaje que una cajera puede dar por su cuenta. Arriba de eso, el POS pide el PIN de alguien con el permiso «Autorizar descuentos» (o un administrador). 0 = sin límite.' },
  redondeoEfectivo:     { tema: 'cobro',      titulo: 'Redondeo del efectivo', texto: 'Al pagar en efectivo, el total se redondea hacia abajo a favor del cliente para no andar con centavos. El documento sale con el monto exacto; el redondeo queda anotado en la venta y en la caja.' },
  efectivoMaxGaveta:    { tema: 'cobro',      titulo: 'Efectivo máximo en gaveta', texto: 'Cuando el efectivo esperado en la gaveta pase de este monto, el POS avisa para hacer un retiro y guardarlo. 0 = sin aviso.' },
  ticketMensaje:        { tema: 'tickets',    titulo: 'Mensaje al pie del ticket', texto: 'Ej.: «Cambios solo con ticket, 8 días» o tus redes sociales. Vacío = «¡Gracias por su compra!».' },
  ticketCopias:         { tema: 'tickets',    titulo: 'Copias del ticket', texto: 'Cuántos tickets se imprimen por venta. Dos sirve para crédito o para que uno quede en la gaveta.' },
  ticketOpciones:       { tema: 'tickets',    titulo: 'Qué lleva el ticket', texto: 'Los datos fiscales, el detalle y el QR van siempre. Esto es lo opcional: logo, «Le atendió», desglose del IVA, aviso de que no sustituye la factura.' },
  productosMayusculas:  { tema: 'tickets',    titulo: 'Nombres de productos en MAYÚSCULAS', texto: 'Al crear, importar o escanear un producto, el nombre se guarda en mayúsculas (útil en ferreterías). Apagalo para farmacias o boutiques. No cambia los productos que ya existen.' },
  diasAvisoVencimiento: { tema: 'inventario', titulo: 'Aviso de vencimiento', texto: 'Los productos con fecha de vencimiento dentro de estos días aparecen como «por vencer» en Inventario y en el Dashboard. 0 = sin aviso.' },
  costoPromedio:        { tema: 'inventario', titulo: 'Costo promedio', texto: 'Al registrar una compra, el costo del producto se calcula como promedio ponderado entre lo que había y lo que entra. Apagado = se queda con el último costo de compra.' },
  verStockOtrasSucursales: { tema: 'inventario', titulo: 'Ver existencias de otras sucursales en la caja', texto: 'Cuando un producto está agotado en la sucursal, la caja muestra un botón para ver cuántos hay en las demás. Solo aplica con el inventario por sucursal activo.' },
  giftVigenciaMeses:    { tema: 'gift',       titulo: 'Vigencia de las gift cards', texto: 'Meses que la tarjeta se puede canjear desde que se vende. Al vencer, la caja ya no la acepta y su saldo queda para el negocio. 0 = nunca vence.' },
  giftEstilo:           { tema: 'gift',       titulo: 'Estilo de la tarjeta digital', texto: 'Diseño de la imagen que se manda por WhatsApp. Se puede cambiar en cada tarjeta antes de enviarla.' },
  giftColores:          { tema: 'gift',       titulo: 'Mis colores', texto: 'Paleta propia para el estilo «Mis colores»: fondo (dos tonos para el degradado), acento y texto. También se usan para el texto sobre tu diseño.' },
  giftFondoUrl:         { tema: 'gift',       titulo: 'Mi diseño (fondo propio)', texto: 'Subí una imagen de 1200 × 720 px hecha por tu diseñador: ORIÓN escribe encima el monto, los nombres, el código y el QR. Descargá la plantilla para saber qué zonas dejar libres.' },
  giftMensaje:          { tema: 'gift',       titulo: 'Frase en la tarjeta', texto: 'Una línea corta que va en la tarjeta digital y en el ticket. Ej.: «Un regalo con cariño».' },
  giftPreview:          { tema: 'gift',       titulo: 'Vista previa', texto: 'Así se verá la tarjeta que se manda por WhatsApp. Guardá los cambios para que apliquen en la caja.' },
  horario:              { tema: 'horario',    titulo: 'Horario del negocio y accesos', texto: 'Días y horas en que los empleados pueden entrar, excepciones y autorizaciones fuera de horario.' },
  plan:                 { tema: 'plan',       titulo: 'Mi plan y uso', texto: 'Qué incluye tu plan de ORIÓN y cuánto llevás usado este mes.' },
  password:             { tema: 'seguridad',  titulo: 'Cambiar contraseña', texto: 'Contraseña de tu cuenta de administrador.' },
}

function Interruptor({ activo, onChange, disabled, etiqueta }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} disabled={disabled} onClick={onChange}
      style={{ width: 46, height: 26, borderRadius: 99, border: 'none', cursor: disabled ? 'default' : 'pointer', flexShrink: 0, background: activo ? 'var(--accent)' : 'var(--border2)', position: 'relative', transition: 'background 0.25s', opacity: disabled ? 0.6 : 1 }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: activo ? 23 : 3, transition: 'left 0.25s', boxShadow: '0 2px 4px rgba(0,0,0,0.25)' }} />
    </button>
  )
}

// Una fila de ajuste: título y explicación a la izquierda, el control a la derecha.
// `abajo` = el control va debajo del texto (para controles anchos: chips, colores, campos de texto).
function Opcion({ k, titulo, texto, children, abajo, resaltada }) {
  const meta = OPCIONES[k] || {}
  return (
    <div className={'aj-op' + (resaltada ? ' aj-hit' : '') + (abajo ? ' aj-abajo' : '')} data-opcion={k}>
      <div className="aj-op-txt">
        <div className="aj-op-t">{titulo || meta.titulo}</div>
        <div className="aj-op-d">{texto || meta.texto}</div>
      </div>
      {children && <div className="aj-op-ctl">{children}</div>}
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
  const [sucio, setSucio] = useState(false)          // hay cambios sin guardar
  const [logoError, setLogoError] = useState(false)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [subiendoFondo, setSubiendoFondo] = useState(false)
  const [previewGift, setPreviewGift] = useState('')
  const [busq, setBusq] = useState('')
  const [resaltada, setResaltada] = useState('')
  const originalRef = useRef(null)                    // lo que vino de Firestore, para "Descartar"
  const [config, setConfig] = useState({
    empresaNombre: '', nombreComercial: '', logoUrl: '',
    nit: '', nrc: '', telefono: '', correo: '', direccion: '',
    requerirCaja: false,
    pinAlCobrar: false, // gaveta compartida: pedir el PIN de quien cobra en cada venta
    productoNuevoEnCaja: false, // al escanear un código que no existe, la caja ofrece crear el producto
    venderSinStock: false,   // dejar cobrar aunque el stock esté en 0 (queda negativo hasta que se registre la compra)
    descuentoMaxPct: 0,      // % máximo que da una cajera sin autorización; 0 = sin límite
    redondeoEfectivo: '0',   // '0' | '0.05' | '0.25': redondeo del efectivo a favor del cliente
    efectivoMaxGaveta: 0,    // $ en gaveta a partir de los cuales el POS pide hacer un retiro; 0 = sin aviso
    ticketCopias: 1,         // 1 o 2 tickets por venta
    ticketOpciones: { logo: false, atendio: true, desgloseIva: true, noEsFactura: false },
    diasAvisoVencimiento: 15, // productos que vencen dentro de estos días aparecen como "por vencer"
    costoPromedio: false,    // Compras: costo promedio ponderado en vez de último costo
    verStockOtrasSucursales: false, // Caja: botón para ver existencias de otras sucursales en productos agotados (módulo inventario por sucursal)
    comandas: undefined,          // Comandas / vales (undefined = hereda lo que tenía por plan)
    comandasDespacho: undefined,  // paso "Para despachar"
    giftVigenciaMeses: 12,   // gift cards: meses de vigencia desde la venta (0 = sin vencimiento)
    giftEstilo: 'oro',       // gift cards: estilo por defecto de la tarjeta digital
    giftMensaje: '',         // gift cards: frase que va en la tarjeta
    giftColores: null,       // gift cards: { fondo1, fondo2, acento, texto } para el estilo "Mis colores"
    giftFondoUrl: '',        // gift cards: imagen de fondo propia (1200×720) para el estilo "Mi diseño"
    productosMayusculas: true, // nombres de producto en MAYÚSCULAS (por empresa)
    tipoDtePorDefecto: 'FE',
    ticketMensaje: '',
  })

  const puedeVer = esAdmin || puede('ver_configuracion')
  const puedeEditar = esAdmin || puede('editar_configuracion')
  const puedeHorario = puedeVer || puede('autorizar_fuera_horario')
  const conCorreo = !!user?.email && !user.isAnonymous

  // Temas del menú (los de módulos solo si la empresa los tiene)
  const temas = [
    puedeVer && { key: 'empresa', icono: '🏢', label: 'Mi empresa', guarda: true },
    puedeVer && { key: 'fiscal', icono: '🧾', label: 'Datos fiscales' },
    puedeVer && { key: 'cobro', icono: '🛒', label: 'Cobro', guarda: true },
    puedeVer && { key: 'tickets', icono: '🖨️', label: 'Tickets y productos', guarda: true },
    puedeVer && { key: 'inventario', icono: '📦', label: 'Inventario y compras', guarda: true },
    puedeVer && modulos?.gift_cards === true && { key: 'gift', icono: '🎁', label: 'Gift cards', guarda: true },
    puedeHorario && { key: 'horario', icono: '🕒', label: 'Horario y accesos' },
    puedeVer && { key: 'plan', icono: '⭐', label: 'Mi plan' },
    puedeVer && conCorreo && { key: 'seguridad', icono: '🔐', label: 'Seguridad' },
  ].filter(Boolean)
  const pedida = params.get('seccion') === 'pos' ? 'cobro' : params.get('seccion')
  const tema = temas.some(s => s.key === pedida) ? pedida : temas[0]?.key
  const temaActual = temas.find(s => s.key === tema)
  const irA = (key) => { setParams({ seccion: key }, { replace: true }); setBusq('') }

  useEffect(() => {
    const cargar = async () => {
      if (!user || !empresaId) return
      try {
        const snap = await getDoc(doc(db, 'configuracion', empresaId))
        if (snap.exists()) { originalRef.current = snap.data(); setConfig(prev => ({ ...prev, ...snap.data() })) }
      } catch (e) {
        console.error('Error:', e)
      }
      setLoading(false)
    }
    cargar()
  }, [user, empresaId])

  // Aviso del navegador si se va con cambios sin guardar
  useEffect(() => {
    if (!sucio) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [sucio])

  const tocar = () => { setGuardado(false); setSucio(true) }
  const handleChange = (campo, valor) => {
    setConfig(prev => ({ ...prev, [campo]: valor }))
    tocar()
    if (campo === 'logoUrl') setLogoError(false)
  }

  // ── Buscador: opciones cuyo título o texto contienen lo escrito ──
  const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const resultados = useMemo(() => {
    const q = normal(busq.trim())
    if (q.length < 2) return []
    const visibles = new Set(temas.map(t => t.key))
    return Object.entries(OPCIONES).filter(([, o]) => visibles.has(o.tema) && (normal(o.titulo).includes(q) || normal(o.texto).includes(q))).slice(0, 8)
  }, [busq, temas])
  const irAOpcion = (k) => {
    const o = OPCIONES[k]
    irA(o.tema)
    setResaltada(k)
    setTimeout(() => { document.querySelector(`[data-opcion="${k}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, 80)
    setTimeout(() => setResaltada(''), 2600)
  }

  // ── Fondo propio de la gift card digital (carpeta 'gift' en Storage) ──
  const subirFondoGift = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { orionAlert('Solo se permiten imágenes', { tipo: 'warning' }); return }
    if (file.size > 4 * 1024 * 1024) { orionAlert('La imagen no puede superar 4MB', { tipo: 'warning' }); return }
    setSubiendoFondo(true)
    try {
      const ext = file.name.split('.').pop()
      const sRef = storageRef(getStorage(), `empresas/${empresaId}/gift/fondo-${Date.now()}.${ext}`)
      await uploadBytes(sRef, file)
      const url = await getDownloadURL(sRef)
      setConfig(prev => ({ ...prev, giftFondoUrl: url, giftEstilo: 'fondo' }))
      tocar()
    } catch (e) { orionAlert('Error al subir la imagen: ' + e.message, { tipo: 'error' }) }
    setSubiendoFondo(false)
  }
  const colorGift = (k, v) => { setConfig(prev => ({ ...prev, giftColores: { fondo1: '#14213D', fondo2: '#243B6B', acento: '#D4B46A', texto: '#FFFFFF', ...(prev.giftColores || {}), [k]: v }, giftEstilo: 'propio' })); tocar() }

  // Vista previa de la tarjeta digital con la configuración actual (se rearma al cambiar algo)
  useEffect(() => {
    if (!modulos?.gift_cards || tema !== 'gift') return
    let vivo = true, url = ''
    const t = setTimeout(() => {
      const vence = new Date(); vence.setMonth(vence.getMonth() + (parseInt(config.giftVigenciaMeses ?? 12) || 0))
      generarImagenGiftCard({ codigo: 'GC-EJEM-PLO1', monto: 50, para: 'María Fernanda', de: 'Andrea', venceEl: (parseInt(config.giftVigenciaMeses ?? 12) || 0) > 0 ? vence : null }, config, config.giftEstilo)
        .then(b => { if (!vivo) return; url = URL.createObjectURL(b); setPreviewGift(url) }).catch(() => {})
    }, 350)
    return () => { vivo = false; clearTimeout(t); if (url) URL.revokeObjectURL(url) }
  }, [config.giftEstilo, config.giftColores, config.giftFondoUrl, config.giftMensaje, config.logoUrl, config.nombreComercial, config.giftVigenciaMeses, tema, modulos]) // eslint-disable-line react-hooks/exhaustive-deps

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
      tocar()
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
        productoNuevoEnCaja: config.productoNuevoEnCaja === true,
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
        verStockOtrasSucursales: config.verStockOtrasSucursales === true,
        comandas: comandasOn,
        comandasDespacho: comandasOn && despachoOn,
        tipoDtePorDefecto: config.tipoDtePorDefecto === 'CCF' ? 'CCF' : 'FE',
        ticketMensaje: (config.ticketMensaje || '').trim().slice(0, 80),
        giftVigenciaMeses: Math.min(120, Math.max(0, parseInt(config.giftVigenciaMeses) || 0)),
        giftEstilo: ['oro', 'noche', 'rosa', 'verde', 'propio', 'fondo'].includes(config.giftEstilo) ? config.giftEstilo : 'oro',
        giftColores: config.giftColores ? Object.fromEntries(['fondo1', 'fondo2', 'acento', 'texto'].map(k => [k, /^#[0-9a-f]{6}$/i.test(config.giftColores[k] || '') ? config.giftColores[k] : ''])) : null,
        giftFondoUrl: config.giftFondoUrl || '',
        giftMensaje: (config.giftMensaje || '').trim().slice(0, 60),
      }
      await setDoc(doc(db, 'configuracion', empresaId), { ...campos, updatedAt: serverTimestamp() }, { merge: true })
      originalRef.current = { ...(originalRef.current || {}), ...campos }
      setSucio(false)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
    } catch (e) {
      orionAlert('Error al guardar: ' + e.message, { tipo: 'error' })
    }
    setGuardando(false)
  }

  const descartar = async () => {
    if (!(await orionConfirm('¿Descartar los cambios sin guardar?', { tipo: 'warning', okLabel: 'Descartar' }))) return
    setConfig(prev => ({ ...prev, ...(originalRef.current || {}) }))
    setSucio(false)
  }

  const urlValida = config.logoUrl && config.logoUrl.startsWith('http') && config.logoUrl.length > 10
  const conGuardar = puedeEditar && !!temaActual?.guarda

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
  const op = (k, extra = {}) => ({ k, resaltada: resaltada === k, ...extra })

  return (
    <>
      <style>{`
        .ajustes { display: grid; grid-template-columns: 236px minmax(0, 1fr); gap: 22px; align-items: start; }
        .aj-nav { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 4px; }
        .aj-temas { display: flex; flex-direction: column; gap: 4px; }
        .aj-busq { position: relative; margin-bottom: 8px; }
        .aj-busq .input { padding-left: 34px; height: 40px; }
        .aj-busq-ico { position: absolute; left: 11px; top: 11px; font-size: 15px; opacity: .6; pointer-events: none; }
        .aj-res { position: absolute; left: 0; right: 0; top: 44px; z-index: 20; background: var(--surface); border: 1.5px solid var(--border); border-radius: 12px; box-shadow: 0 12px 30px var(--shadow2); overflow: hidden; }
        .aj-res button { display: block; width: 100%; text-align: left; background: none; border: 0; border-bottom: 1px solid var(--border); padding: 9px 12px; cursor: pointer; font: inherit; color: var(--text); }
        .aj-res button:last-child { border-bottom: 0; } .aj-res button:hover { background: var(--surface2); }
        .aj-res b { display: block; font-size: 13px; } .aj-res small { color: var(--muted); font-size: 11px; }
        .aj-tema { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px; border: 1.5px solid transparent; background: none; color: var(--text2, var(--text)); font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; text-align: left; }
        .aj-tema:hover { background: var(--surface2); }
        .aj-tema.on { background: var(--surface); border-color: var(--border); color: var(--accent); box-shadow: 0 4px 14px var(--shadow2); }
        .aj-tema .ic { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: var(--surface3); font-size: 15px; flex-shrink: 0; }
        .aj-panel { max-width: 760px; min-width: 0; }
        .aj-card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; box-shadow: 0 4px 20px var(--shadow2); padding: 6px 22px; }
        .aj-h { padding: 18px 0 8px; } .aj-h h2 { margin: 0; font-size: 18px; font-weight: 800; letter-spacing: -.3px; } .aj-h p { margin: 4px 0 0; font-size: 12.5px; color: var(--muted); }
        .aj-op { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 15px 0; border-top: 1px solid var(--border); border-radius: 8px; transition: background .3s, box-shadow .3s; }
        .aj-op.aj-abajo { flex-direction: column; align-items: stretch; gap: 10px; }
        .aj-op-txt { min-width: 0; } .aj-op-t { font-weight: 700; font-size: 14px; } .aj-op-d { font-size: 12px; color: var(--muted); margin-top: 3px; line-height: 1.45; }
        .aj-op-ctl { flex-shrink: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .aj-abajo .aj-op-ctl { justify-content: flex-start; }
        .aj-hit { background: var(--glow, rgba(212,180,106,.12)); box-shadow: inset 3px 0 0 var(--accent3, #C19A2E); padding-left: 10px; padding-right: 10px; }
        .aj-sub { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px dashed var(--border); }
        .aj-sub:first-of-type { border-top: 0; }
        .aj-sub b { font-size: 13px; font-weight: 600; display: block; } .aj-sub small { font-size: 11px; color: var(--muted); }
        .aj-barra { position: sticky; bottom: 10px; margin-top: 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-radius: 14px; background: var(--surface); border: 1.5px solid var(--border); box-shadow: 0 10px 30px var(--shadow2); z-index: 5; }
        .aj-barra.sucia { border-color: var(--accent3, #C19A2E); }
        .aj-barra span { font-size: 13px; color: var(--muted); }
        .cfg-num { display: flex; align-items: center; gap: 6px; flex-shrink: 0; font-size: 13px; color: var(--muted); font-weight: 600; }
        .cfg-num .input { width: 84px; text-align: right; height: 38px; font-family: var(--mono); }
        .seg { display: inline-flex; flex-shrink: 0; border: 1.5px solid var(--border); border-radius: 10px; overflow: hidden; }
        .seg button { font: inherit; font-size: 13px; font-weight: 700; padding: 8px 16px; border: none; background: var(--surface2); color: var(--muted); cursor: pointer; }
        .seg button.on { background: var(--accent); color: #fff; }
        .seg button:disabled { cursor: default; }
        .logo-preview { width: 100%; min-height: 90px; background: #ffffff; border-radius: 12px; border: 2px dashed var(--border2); display: flex; align-items: center; justify-content: center; overflow: hidden; }
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
        .fiscal-fila { display: grid; grid-template-columns: 200px 1fr; gap: 10px; font-size: 13px; padding: 9px 0; border-top: 1px solid var(--border); }
        .fiscal-fila span:first-child { color: var(--muted); font-weight: 700; font-size: 12px; }
        @media (max-width: 860px) {
          .ajustes { grid-template-columns: minmax(0, 1fr); gap: 12px; }
          .aj-nav { position: static; gap: 8px; min-width: 0; }
          .aj-temas { flex-direction: row; overflow-x: auto; gap: 6px; padding-bottom: 4px; }
          .aj-busq { margin-bottom: 0; }
          .aj-tema { white-space: nowrap; padding: 7px 10px; font-size: 12.5px; } .aj-tema .ic { display: none; }
          .aj-card { padding: 4px 14px; }
          .aj-op { flex-direction: column; align-items: stretch; gap: 10px; } .aj-op-ctl { justify-content: flex-start; }
          .fiscal-fila { grid-template-columns: 1fr; gap: 2px; }
        }
      `}</style>

      <div className="topbar">
        <div className="titulo-con-menu">
          <div className="page-title">⚙️ Configuración</div>
          <div className="page-sub">Tu empresa, la caja, los tickets y los accesos, tema por tema</div>
        </div>
        {guardado && <span className="saved-badge">✅ Guardado</span>}
      </div>

      <div className="ajustes">
        {/* ── Menú de temas + buscador ── */}
        <nav className="aj-nav" aria-label="Temas de configuración">
          <div className="aj-busq">
            <span className="aj-busq-ico">🔍</span>
            <input className="input" placeholder="Buscar una opción…" value={busq} onChange={e => setBusq(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && resultados[0]) irAOpcion(resultados[0][0]); if (e.key === 'Escape') setBusq('') }} />
            {resultados.length > 0 && (
              <div className="aj-res">
                {resultados.map(([k, o]) => (
                  <button key={k} type="button" onClick={() => irAOpcion(k)}><b>{o.titulo}</b><small>{temas.find(t => t.key === o.tema)?.label}</small></button>
                ))}
              </div>
            )}
            {busq.trim().length >= 2 && resultados.length === 0 && <div className="aj-res"><button type="button" disabled><small>Nada con «{busq.trim()}»</small></button></div>}
          </div>
          <div className="aj-temas">
            {temas.map(s => (
              <button key={s.key} type="button" className={'aj-tema' + (tema === s.key ? ' on' : '')} aria-current={tema === s.key ? 'page' : undefined} onClick={() => irA(s.key)}>
                <span className="ic">{s.icono}</span>{s.label}
              </button>
            ))}
          </div>
        </nav>

        {/* ── Panel del tema ── */}
        <div className="aj-panel">
          {/* ══════════ MI EMPRESA ══════════ */}
          {tema === 'empresa' && (
            <div className="aj-card">
              <div className="aj-h"><h2>Mi empresa</h2><p>Lo que ven tus clientes: logo, nombre y contacto.</p></div>
              <fieldset disabled={!puedeEditar} style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
                <Opcion {...op('logo', { abajo: true })}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                    <div className="logo-preview" style={{ flex: '1 1 220px', minHeight: 80 }}>
                      {!config.logoUrl ? <div className="logo-preview-empty">🖼️ El logo aparecerá aquí</div>
                        : !urlValida || logoError ? <div className="logo-preview-error">⚠️ No se pudo cargar la imagen. Subila de nuevo.</div>
                        : <img src={config.logoUrl} alt="Logo" onError={() => setLogoError(true)} />}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <label className="btn btn-primary" style={{ cursor: subiendoLogo ? 'wait' : 'pointer', opacity: subiendoLogo || !puedeEditar ? 0.6 : 1 }}>
                        {subiendoLogo ? '⏳ Subiendo...' : (config.logoUrl ? '🔄 Cambiar logo' : '📤 Subir logo')}
                        <input type="file" accept="image/*" style={{ display: 'none' }} disabled={subiendoLogo || !puedeEditar}
                          onChange={e => { const f = e.target.files?.[0]; if (f) subirLogo(f); e.target.value = '' }} />
                      </label>
                      {config.logoUrl && <button className="btn btn-ghost" onClick={() => handleChange('logoUrl', '')} disabled={subiendoLogo}>Quitar</button>}
                    </div>
                  </div>
                </Opcion>
                <Opcion {...op('nombreComercial')}>
                  <input className="input" style={{ width: 300, maxWidth: '100%' }} placeholder="Nombre con el que te conocen"
                    value={config.nombreComercial || ''} onChange={e => handleChange('nombreComercial', e.target.value)} />
                </Opcion>
                <Opcion {...op('contacto')}>
                  <input className="input" style={{ width: 140 }} placeholder="2222-3333" value={config.telefono || ''} onChange={e => handleChange('telefono', e.target.value)} />
                  <input className="input" style={{ width: 220, maxWidth: '100%' }} type="email" placeholder="info@empresa.com" value={config.correo || ''} onChange={e => handleChange('correo', e.target.value)} />
                </Opcion>
              </fieldset>
              <div className="aj-op aj-abajo" data-opcion="loginPreview">
                <div className="aj-op-txt"><div className="aj-op-t">Así se ve tu inicio de sesión</div><div className="aj-op-d">Tu logo o tu nombre comercial reciben a tus empleados al entrar.</div></div>
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
                      <div className="preview-input-mock" /><div className="preview-input-mock" />
                      <div className="preview-btn-mock">🔐 Ingresar</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════ DATOS FISCALES ══════════ */}
          {tema === 'fiscal' && (
            <div className="aj-card">
              <div className="aj-h"><h2>Datos fiscales (DTE)</h2><p>🔒 Van en tus facturas y los registra <strong>One Geo Systems</strong> con el Ministerio de Hacienda. Si alguno cambió, contactá a soporte.</p></div>
              <div style={{ paddingBottom: 10 }}>
                {datosFiscales.map(([etiqueta, valor]) => (
                  <div key={etiqueta} className="fiscal-fila"><span>{etiqueta}</span><span>{valor || '—'}</span></div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════ COBRO ══════════ */}
          {tema === 'cobro' && (
            <div className="aj-card">
              <div className="aj-h"><h2>Cobro</h2><p>Cómo trabaja la caja al cobrar.</p></div>
              <Opcion {...op('requerirCaja')}>
                <Interruptor etiqueta="Exigir caja abierta" activo={config.requerirCaja === true} disabled={!puedeEditar}
                  onChange={() => handleChange('requerirCaja', !(config.requerirCaja === true))} />
              </Opcion>
              <Opcion {...op('pinAlCobrar')}>
                <Interruptor etiqueta="PIN al cobrar" activo={config.pinAlCobrar === true} disabled={!puedeEditar}
                  onChange={() => handleChange('pinAlCobrar', !(config.pinAlCobrar === true))} />
              </Opcion>
              <Opcion {...op('tipoDtePorDefecto')}>
                <div className="seg" role="group" aria-label="Documento por defecto">
                  {['FE', 'CCF'].map(t => (
                    <button key={t} type="button" disabled={!puedeEditar} aria-pressed={(config.tipoDtePorDefecto || 'FE') === t}
                      className={(config.tipoDtePorDefecto || 'FE') === t ? 'on' : ''} onClick={() => handleChange('tipoDtePorDefecto', t)}>{t}</button>
                  ))}
                </div>
              </Opcion>
              <Opcion {...op('comandas')}>
                <Interruptor etiqueta="Comandas / vales" activo={comandasOn} disabled={!puedeEditar} onChange={() => handleChange('comandas', !comandasOn)} />
              </Opcion>
              {comandasOn && (
                <Opcion {...op('comandasDespacho')}>
                  <Interruptor etiqueta="Control de despacho" activo={despachoOn} disabled={!puedeEditar} onChange={() => handleChange('comandasDespacho', !despachoOn)} />
                </Opcion>
              )}
              <Opcion {...op('venderSinStock')}>
                <Interruptor etiqueta="Vender sin existencias" activo={config.venderSinStock === true} disabled={!puedeEditar}
                  onChange={() => handleChange('venderSinStock', !(config.venderSinStock === true))} />
              </Opcion>
              <Opcion {...op('productoNuevoEnCaja')}>
                <Interruptor etiqueta="Agregar productos nuevos desde la caja" activo={config.productoNuevoEnCaja === true} disabled={!puedeEditar}
                  onChange={() => handleChange('productoNuevoEnCaja', !(config.productoNuevoEnCaja === true))} />
              </Opcion>
              <Opcion {...op('descuentoMaxPct')}>
                <div className="cfg-num"><input className="input" type="number" min="0" max="100" step="1" inputMode="numeric" disabled={!puedeEditar}
                  value={config.descuentoMaxPct ?? 0} onChange={e => handleChange('descuentoMaxPct', e.target.value)} /><span>%</span></div>
              </Opcion>
              <Opcion {...op('redondeoEfectivo')}>
                <div className="seg" role="group" aria-label="Redondeo del efectivo">
                  {[['0', 'Sin'], ['0.05', '$0.05'], ['0.25', '$0.25']].map(([v, l]) => (
                    <button key={v} type="button" disabled={!puedeEditar} aria-pressed={String(config.redondeoEfectivo || '0') === v}
                      className={String(config.redondeoEfectivo || '0') === v ? 'on' : ''} onClick={() => handleChange('redondeoEfectivo', v)}>{l}</button>
                  ))}
                </div>
              </Opcion>
              <Opcion {...op('efectivoMaxGaveta')}>
                <div className="cfg-num"><span>$</span><input className="input" type="number" min="0" step="10" inputMode="decimal" disabled={!puedeEditar}
                  value={config.efectivoMaxGaveta ?? 0} onChange={e => handleChange('efectivoMaxGaveta', e.target.value)} /></div>
              </Opcion>
            </div>
          )}

          {/* ══════════ TICKETS Y PRODUCTOS ══════════ */}
          {tema === 'tickets' && (
            <div className="aj-card">
              <div className="aj-h"><h2>Tickets y productos</h2><p>Lo que se imprime y cómo se guardan los nombres.</p></div>
              <Opcion {...op('ticketMensaje', { abajo: true })}>
                <div style={{ width: '100%' }}>
                  <input className="input" maxLength={80} disabled={!puedeEditar} placeholder="¡Gracias por su compra!"
                    value={config.ticketMensaje || ''} onChange={e => handleChange('ticketMensaje', e.target.value)} />
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{(config.ticketMensaje || '').length}/80</div>
                </div>
              </Opcion>
              <Opcion {...op('ticketCopias')}>
                <div className="seg" role="group" aria-label="Copias del ticket">
                  {[1, 2].map(n => (
                    <button key={n} type="button" disabled={!puedeEditar} aria-pressed={(Number(config.ticketCopias) || 1) === n}
                      className={(Number(config.ticketCopias) || 1) === n ? 'on' : ''} onClick={() => handleChange('ticketCopias', n)}>{n}</button>
                  ))}
                </div>
              </Opcion>
              <Opcion {...op('ticketOpciones', { abajo: true })}>
                <div style={{ width: '100%' }}>
                  {[
                    ['logo', 'Logo de la empresa arriba', 'Necesita un logo cargado en «Mi empresa». En impresora térmica sale en blanco y negro.'],
                    ['atendio', '«Le atendió: nombre»', 'Sale cuando la venta tiene a alguien que cobró (PIN al cobrar).'],
                    ['desgloseIva', 'Desglose del IVA', 'La línea «IVA 13%» en los totales (en factura de consumidor el IVA ya va incluido en los precios).'],
                    ['noEsFactura', 'Aviso «Este comprobante no sustituye la factura electrónica»', 'Para tickets de cortesía o cuando el DTE se envía por correo.'],
                  ].map(([k, t, d]) => (
                    <div key={k} className="aj-sub">
                      <div><b>{t}</b><small>{d}</small></div>
                      <Interruptor etiqueta={t} disabled={!puedeEditar}
                        activo={k === 'atendio' || k === 'desgloseIva' ? config.ticketOpciones?.[k] !== false : config.ticketOpciones?.[k] === true}
                        onChange={() => handleChange('ticketOpciones', { ...(config.ticketOpciones || {}), [k]: !(k === 'atendio' || k === 'desgloseIva' ? config.ticketOpciones?.[k] !== false : config.ticketOpciones?.[k] === true) })} />
                    </div>
                  ))}
                </div>
              </Opcion>
              <Opcion {...op('productosMayusculas')}>
                <Interruptor etiqueta="Nombres en mayúsculas" activo={config.productosMayusculas !== false} disabled={!puedeEditar}
                  onChange={() => handleChange('productosMayusculas', config.productosMayusculas === false)} />
              </Opcion>
            </div>
          )}

          {/* ══════════ INVENTARIO Y COMPRAS ══════════ */}
          {tema === 'inventario' && (
            <div className="aj-card">
              <div className="aj-h"><h2>Inventario y compras</h2><p>Avisos, costos y existencias entre sucursales.</p></div>
              <Opcion {...op('diasAvisoVencimiento')}>
                <div className="cfg-num"><input className="input" type="number" min="0" max="365" step="1" inputMode="numeric" disabled={!puedeEditar}
                  value={config.diasAvisoVencimiento ?? 15} onChange={e => handleChange('diasAvisoVencimiento', e.target.value)} /><span>días</span></div>
              </Opcion>
              <Opcion {...op('costoPromedio')}>
                <Interruptor etiqueta="Costo promedio" activo={config.costoPromedio === true} disabled={!puedeEditar}
                  onChange={() => handleChange('costoPromedio', !(config.costoPromedio === true))} />
              </Opcion>
              <Opcion {...op('verStockOtrasSucursales')}>
                <Interruptor etiqueta="Ver existencias de otras sucursales" activo={config.verStockOtrasSucursales === true} disabled={!puedeEditar}
                  onChange={() => handleChange('verStockOtrasSucursales', !(config.verStockOtrasSucursales === true))} />
              </Opcion>
            </div>
          )}

          {/* ══════════ GIFT CARDS ══════════ */}
          {tema === 'gift' && (
            <div className="aj-card">
              <div className="aj-h"><h2>Gift cards</h2><p>Vigencia y diseño de la tarjeta digital que se manda por WhatsApp.</p></div>
              <Opcion {...op('giftVigenciaMeses')}>
                <div className="cfg-num"><input className="input" type="number" min="0" max="120" step="1" inputMode="numeric" disabled={!puedeEditar}
                  value={config.giftVigenciaMeses ?? 12} onChange={e => handleChange('giftVigenciaMeses', e.target.value)} /><span>meses</span></div>
              </Opcion>
              <Opcion {...op('giftEstilo', { abajo: true })}>
                <div className="seg" role="group" aria-label="Estilo de la tarjeta" style={{ flexWrap: 'wrap' }}>
                  {Object.entries(estilosDisponibles(config)).map(([v, e]) => (
                    <button key={v} type="button" disabled={!puedeEditar} aria-pressed={(config.giftEstilo || 'oro') === v}
                      className={(config.giftEstilo || 'oro') === v ? 'on' : ''} onClick={() => handleChange('giftEstilo', v)}>{e.nombre}</button>
                  ))}
                </div>
              </Opcion>
              <Opcion {...op('giftColores')}>
                {[['fondo1', 'Fondo 1', '#14213D'], ['fondo2', 'Fondo 2', '#243B6B'], ['acento', 'Acento', '#D4B46A'], ['texto', 'Texto', '#FFFFFF']].map(([k, l, def]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                    <input type="color" disabled={!puedeEditar} value={config.giftColores?.[k] || def} onChange={e => colorGift(k, e.target.value)} style={{ width: 34, height: 28, border: '1px solid var(--border)', borderRadius: 6, padding: 0, background: 'none', cursor: 'pointer' }} />{l}
                  </label>
                ))}
              </Opcion>
              <Opcion {...op('giftFondoUrl')}>
                <label className="btn btn-primary btn-sm" style={{ cursor: subiendoFondo ? 'wait' : 'pointer', opacity: subiendoFondo || !puedeEditar ? 0.6 : 1 }}>
                  {subiendoFondo ? '⏳ Subiendo...' : (config.giftFondoUrl ? '🔄 Cambiar imagen' : '📤 Subir imagen')}
                  <input type="file" accept="image/*" style={{ display: 'none' }} disabled={subiendoFondo || !puedeEditar}
                    onChange={e => { const f = e.target.files?.[0]; if (f) subirFondoGift(f); e.target.value = '' }} />
                </label>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => descargarPlantillaGuia().catch(e => orionAlert(e.message, { tipo: 'error' }))}>⬇ Plantilla guía</button>
                {config.giftFondoUrl && <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }} disabled={!puedeEditar} onClick={() => { setConfig(prev => ({ ...prev, giftFondoUrl: '', giftEstilo: prev.giftEstilo === 'fondo' ? 'oro' : prev.giftEstilo })); tocar() }}>Quitar</button>}
              </Opcion>
              <Opcion {...op('giftMensaje')}>
                <input className="input" style={{ width: 300, maxWidth: '100%' }} maxLength={60} disabled={!puedeEditar} placeholder="Un regalo con cariño"
                  value={config.giftMensaje || ''} onChange={e => handleChange('giftMensaje', e.target.value)} />
              </Opcion>
              <Opcion {...op('giftPreview', { abajo: true })}>
                <div style={{ width: '100%', borderRadius: 12, overflow: 'hidden', background: 'var(--surface2)', aspectRatio: '1200 / 720', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {previewGift ? <img src={previewGift} alt="Vista previa de la gift card" style={{ width: '100%', display: 'block' }} /> : <span style={{ fontSize: 12, color: 'var(--muted)' }}>Armando la vista previa…</span>}
                </div>
              </Opcion>
            </div>
          )}

          {/* ══════════ HORARIO Y ACCESOS ══════════ */}
          {tema === 'horario' && (
            <HorarioAccesos empresaId={empresaId} horarioNegocio={config.horario} puedeEditarNegocio={puedeEditar}
              onGuardado={h => setConfig(c => ({ ...c, horario: h }))} />
          )}

          {/* ══════════ MI PLAN ══════════ */}
          {tema === 'plan' && <PlanUso empresaId={empresaId} />}

          {/* ══════════ SEGURIDAD ══════════ */}
          {tema === 'seguridad' && <div style={{ maxWidth: 560 }}><CambiarPassword /></div>}

          {!puedeEditar && temaActual?.guarda && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Solo lectura: para cambiar estos datos se necesita el permiso «Editar configuración».</div>
          )}

          {/* ── Barra de guardar (fija abajo mientras el tema tenga algo que guardar) ── */}
          {conGuardar && (
            <div className={'aj-barra' + (sucio ? ' sucia' : '')}>
              <span>{sucio ? '● Tenés cambios sin guardar' : (guardado ? '✅ Guardado' : 'Sin cambios pendientes')}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {sucio && <button className="btn btn-ghost" onClick={descartar} disabled={guardando}>Descartar</button>}
                <button className="btn btn-primary" onClick={guardar} disabled={guardando || !sucio}>{guardando ? '⏳ Guardando...' : '💾 Guardar cambios'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
