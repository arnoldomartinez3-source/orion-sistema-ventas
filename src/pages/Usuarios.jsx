import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { usePermisos } from '../PermisosContext'
import {
  collection, onSnapshot, doc, setDoc, updateDoc,
  deleteDoc, serverTimestamp, getDoc, query, where
} from 'firebase/firestore'
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'

// ══════════════════════════════════════════════════
// GESTIÓN DE USUARIOS Y PERMISOS — ORIÓN
// Sistema de roles con permisos granulares por módulo
// ══════════════════════════════════════════════════

// ── ROLES PREDEFINIDOS ──
const ROLES = {
  administrador: {
    label: 'Administrador',
    color: '#2E6FD4',
    icon: '👑',
    desc: 'Acceso completo al sistema',
  },
  cajero: {
    label: 'Cajero',
    color: '#00C296',
    icon: '💰',
    desc: 'Punto de Venta y Caja',
  },
  vendedor: {
    label: 'Vendedor',
    color: '#4A8FE8',
    icon: '🛒',
    desc: 'Ventas y Cotizaciones',
  },
  bodeguero: {
    label: 'Bodeguero',
    color: '#f59e0b',
    icon: '📦',
    desc: 'Inventario y Compras',
  },
  contador: {
    label: 'Contador',
    color: '#8b5cf6',
    icon: '📊',
    desc: 'Facturas y Reportes (solo lectura)',
  },
}

// ── MÓDULOS Y PERMISOS ──
const MODULOS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: '📊',
    permisos: [
      { key: 'ver_dashboard', label: 'Ver Dashboard y estadísticas' },
    ]
  },
  {
    key: 'punto_venta',
    label: 'Punto de Venta',
    icon: '🛒',
    permisos: [
      { key: 'ver_punto_venta',    label: 'Acceder al Punto de Venta' },
      { key: 'realizar_ventas',    label: 'Realizar ventas' },
      { key: 'aplicar_descuentos', label: 'Aplicar descuentos' },
      { key: 'cancelar_ventas',    label: 'Cancelar ventas' },
    ]
  },
  {
    key: 'inventario',
    label: 'Inventario',
    icon: '📦',
    permisos: [
      { key: 'ver_inventario',        label: 'Ver inventario' },
      { key: 'crear_productos',       label: 'Crear productos' },
      { key: 'editar_productos',      label: 'Editar productos' },
      { key: 'eliminar_productos',    label: 'Eliminar productos' },
      { key: 'ver_kardex',            label: 'Ver Kardex' },
      { key: 'registrar_movimientos', label: 'Registrar movimientos de stock' },
      { key: 'importar_exportar',     label: 'Importar / Exportar Excel' },
    ]
  },
  {
    key: 'clientes',
    label: 'Clientes',
    icon: '👥',
    permisos: [
      { key: 'ver_clientes',    label: 'Ver clientes' },
      { key: 'crear_clientes',  label: 'Crear clientes' },
      { key: 'editar_clientes', label: 'Editar clientes' },
      { key: 'eliminar_clientes', label: 'Eliminar clientes' },
    ]
  },
  {
    key: 'compras',
    label: 'Compras',
    icon: '🛍️',
    permisos: [
      { key: 'ver_compras',    label: 'Ver compras' },
      { key: 'crear_compras',  label: 'Registrar compras' },
      { key: 'editar_compras', label: 'Editar compras' },
      { key: 'eliminar_compras', label: 'Eliminar compras' },
    ]
  },
  {
    key: 'cotizaciones',
    label: 'Cotizaciones',
    icon: '📄',
    permisos: [
      { key: 'ver_cotizaciones',    label: 'Ver cotizaciones' },
      { key: 'crear_cotizaciones',  label: 'Crear cotizaciones' },
      { key: 'editar_cotizaciones', label: 'Editar cotizaciones' },
      { key: 'eliminar_cotizaciones', label: 'Eliminar cotizaciones' },
      { key: 'convertir_a_venta',   label: 'Convertir cotización a venta' },
    ]
  },
  {
    key: 'facturas',
    label: 'Facturas DTE',
    icon: '🧾',
    permisos: [
      { key: 'ver_facturas',         label: 'Ver facturas' },
      { key: 'crear_facturas',       label: 'Crear / Emitir DTE' },
      { key: 'editar_facturas',      label: 'Editar facturas' },
      { key: 'eliminar_facturas',    label: 'Eliminar facturas' },
      { key: 'imprimir_facturas',    label: 'Imprimir / Descargar PDF' },
      { key: 'compartir_whatsapp',   label: 'Compartir por WhatsApp' },
    ]
  },
  {
    key: 'configuracion',
    label: 'Configuración',
    icon: '⚙️',
    permisos: [
      { key: 'ver_configuracion',    label: 'Ver configuración' },
      { key: 'editar_configuracion', label: 'Editar configuración de empresa' },
    ]
  },
  {
    key: 'usuarios',
    label: 'Gestión de Usuarios',
    icon: '👤',
    permisos: [
      { key: 'ver_usuarios',    label: 'Ver usuarios' },
      { key: 'crear_usuarios',  label: 'Crear usuarios' },
      { key: 'editar_usuarios', label: 'Editar usuarios y permisos' },
      { key: 'eliminar_usuarios', label: 'Eliminar usuarios' },
    ]
  },
]

// Permisos por defecto para cada rol
const PERMISOS_POR_ROL = {
  administrador: MODULOS.flatMap(m => m.permisos.map(p => p.key)),
  cajero: [
    'ver_dashboard', 'ver_punto_venta', 'realizar_ventas',
    'aplicar_descuentos', 'ver_clientes', 'crear_clientes',
    'ver_facturas', 'imprimir_facturas',
  ],
  vendedor: [
    'ver_dashboard', 'ver_punto_venta', 'realizar_ventas',
    'aplicar_descuentos', 'ver_clientes', 'crear_clientes', 'editar_clientes',
    'ver_cotizaciones', 'crear_cotizaciones', 'editar_cotizaciones',
    'convertir_a_venta', 'ver_facturas', 'imprimir_facturas', 'compartir_whatsapp',
  ],
  bodeguero: [
    'ver_dashboard', 'ver_inventario', 'crear_productos', 'editar_productos',
    'ver_kardex', 'registrar_movimientos', 'importar_exportar',
    'ver_compras', 'crear_compras', 'editar_compras',
  ],
  contador: [
    'ver_dashboard', 'ver_facturas', 'imprimir_facturas',
    'ver_clientes', 'ver_compras', 'ver_cotizaciones', 'ver_inventario',
  ],
}

const userStyles = `
  /* ══ STATS ══ */
  .user-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 20px; }
  @media (max-width: 700px) { .user-stats { grid-template-columns: repeat(2,1fr); } }
  .user-stat { background: var(--surface); border: 1.5px solid var(--border); border-radius: 14px; padding: 16px; text-align: center; }
  .user-stat-val { font-size: 28px; font-weight: 800; font-family: var(--mono); }
  .user-stat-label { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }

  /* ══ LAYOUT MAESTRO-DETALLE ══ */
  .um-layout { display: grid; grid-template-columns: 320px 1fr; gap: 16px; align-items: start; }

  /* ══ COLUMNA LISTA ══ */
  .um-list-col { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; overflow: hidden; }
  .um-list-search { padding: 12px; border-bottom: 1.5px solid var(--border); }
  .um-list-scroll { max-height: 70vh; overflow-y: auto; }
  .um-list-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.12s; }
  .um-list-item:last-child { border-bottom: none; }
  .um-list-item:hover { background: var(--surface2); }
  .um-list-item.active { background: var(--glow); border-left: 3px solid var(--accent); padding-left: 11px; }
  .um-list-name { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .um-list-sub { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ══ AVATAR ══ */
  .um-avatar { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #fff; flex-shrink: 0; }
  .um-avatar.sm { width: 38px; height: 38px; font-size: 13px; }
  .um-avatar.lg { width: 52px; height: 52px; font-size: 18px; border-radius: 14px; }

  /* ══ PANEL DETALLE ══ */
  .um-detail { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; overflow: hidden; }
  .um-detail-head { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-bottom: 1.5px solid var(--border); }
  .um-detail-body { padding: 18px 20px; }
  .um-back-btn { display: none; }

  /* ══ ESTADO VACÍO DETALLE ══ */
  .um-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; text-align: center; color: var(--muted); }

  /* ══ MÓDULOS DE PERMISOS ══ */
  .modulo-section { margin-bottom: 12px; border: 1.5px solid var(--border); border-radius: 12px; overflow: hidden; }
  .modulo-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--surface2); cursor: pointer; transition: background 0.15s; }
  .modulo-header:hover { background: var(--surface3); }
  .modulo-title { font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .modulo-count { font-size: 11px; color: var(--muted); }
  .permisos-list { padding: 10px 16px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  @media (max-width: 600px) { .permisos-list { grid-template-columns: 1fr; } }

  .permiso-row { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; cursor: pointer; transition: background 0.12s; }
  .permiso-row:hover { background: var(--surface2); }
  .permiso-check { width: 20px; height: 20px; border-radius: 6px; flex-shrink: 0; border: 2px solid var(--border2); background: var(--surface); display: flex; align-items: center; justify-content: center; transition: all 0.15s; font-size: 12px; }
  .permiso-check.checked { background: var(--accent); border-color: var(--accent); color: white; }
  .permiso-label { font-size: 13px; color: var(--text2); flex: 1; }

  /* ══ ROLES QUICK SELECT ══ */
  .roles-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; }
  @media (max-width: 700px) { .roles-grid { grid-template-columns: repeat(3,1fr); } }
  @media (max-width: 400px) { .roles-grid { grid-template-columns: repeat(2,1fr); } }
  .rol-btn { padding: 10px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--surface2); cursor: pointer; text-align: center; transition: all 0.15s; font-size: 12px; font-weight: 600; color: var(--muted); }
  .rol-btn:hover { border-color: var(--border2); color: var(--text); }
  .rol-btn.active { border-color: var(--accent); background: var(--glow); color: var(--accent); }
  .rol-icon { font-size: 20px; margin-bottom: 4px; }

  /* ══ MÓVIL: pantallas separadas ══ */
  @media (max-width: 820px) {
    .um-layout { grid-template-columns: 1fr; }
    .um-layout.viewing-detail .um-list-col { display: none; }
    .um-layout:not(.viewing-detail) .um-detail { display: none; }
    .um-back-btn { display: inline-flex; }
    .um-list-scroll { max-height: none; }
  }

  .estado-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
`
export default function Usuarios() {
  const { user: currentUser } = useAuth()
  const { empresaId } = usePermisos()
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [seleccionado, setSeleccionado] = useState(null) // usuario abierto en el panel detalle
  const [vistaDetalle, setVistaDetalle] = useState(false) // móvil: mostrar detalle vs lista
  const [editando, setEditando] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [modulosAbiertos, setModulosAbiertos] = useState({})
  const [busqueda, setBusqueda] = useState('')
  const [modalEliminar, setModalEliminar] = useState(null)

  const [form, setForm] = useState({
    nombre: '', email: '', rol: 'cajero', activo: true,
    usuarioSimple: '', pin: '', tipoAcceso: 'email',
    sucursalId: '', // sucursal fija para empleados con PIN
  })
  const [permisos, setPermisos] = useState([])
  const [sucursales, setSucursales] = useState([])

  useEffect(() => {
    if (!empresaId) return
    const unsub = onSnapshot(query(collection(db, 'sucursales'), where('empresaId', '==', empresaId)), snap => {
      setSucursales(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.activa !== false))
    })
    return () => unsub()
  }, [empresaId])

  useEffect(() => {
    if (!empresaId) return
    const unsub = onSnapshot(query(collection(db, 'usuarios'), where('empresaId', '==', empresaId)), snap => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setUsuarios(lista)
      setLoading(false)
      // Si hay un usuario abierto en el detalle, refrescar su versión
      // (o limpiar el panel si fue eliminado).
      setSeleccionado(sel => {
        if (!sel) return sel
        const actualizado = lista.find(u => u.id === sel.id)
        return actualizado || null
      })
    })
    return () => unsub()
  }, [empresaId])

  // Al cambiar rol en el formulario solo actualizamos form.rol.
  // Los permisos por defecto se aplican al CREAR (en guardar), y para
  // usuarios existentes se editan en el panel de detalle.
  const cambiarRol = (rol) => {
    setForm(f => ({ ...f, rol }))
  }

  const togglePermiso = (key) => {
    setPermisos(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    )
  }

  const toggleModulo = (moduloKey) => {
    const modulo = MODULOS.find(m => m.key === moduloKey)
    if (!modulo) return
    const keys = modulo.permisos.map(p => p.key)
    const todosActivos = keys.every(k => permisos.includes(k))
    if (todosActivos) {
      setPermisos(prev => prev.filter(p => !keys.includes(p)))
    } else {
      setPermisos(prev => [...new Set([...prev, ...keys])])
    }
  }

  const toggleModuloAbierto = (key) => {
    setModulosAbiertos(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const abrirModal = (usuario = null) => {
    if (usuario) {
      setEditando(usuario.id)
      setForm({ nombre: usuario.nombre || '', email: usuario.email || '', rol: usuario.rol || 'cajero', activo: usuario.activo !== false, usuarioSimple: usuario.usuarioSimple || '', pin: usuario.pin || '', tipoAcceso: usuario.tipoAcceso || 'email', sucursalId: usuario.sucursalId || '' })
      // NO tocamos `permisos` aquí: al editar datos, los permisos siguen
      // gestionándose en el panel de detalle.
    } else {
      setEditando(null)
      setForm({ nombre: '', email: '', rol: 'cajero', activo: true, usuarioSimple: '', pin: '', tipoAcceso: 'email', sucursalId: '' })
    }
    setModalOpen(true)
  }

  // Seleccionar un usuario abre su detalle en el panel derecho (o pantalla en móvil)
  const seleccionarUsuario = (usuario) => {
    setSeleccionado(usuario)
    setPermisos(usuario.permisos || PERMISOS_POR_ROL[usuario.rol] || [])
    const abiertos = {}
    MODULOS.forEach(m => { abiertos[m.key] = true })
    setModulosAbiertos(abiertos)
    setVistaDetalle(true) // en móvil, navega al detalle
  }

  const volverALista = () => {
    setVistaDetalle(false)
  }

  const guardarPermisos = async () => {
    if (!seleccionado) return
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'usuarios', seleccionado.id), {
        permisos, updatedAt: serverTimestamp()
      })
      // Reflejar el cambio en el usuario seleccionado sin cerrar el panel
      setSeleccionado(s => s ? { ...s, permisos } : s)
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const guardar = async () => {
    if (!form.nombre) { alert('El nombre es obligatorio'); return }
if (!editando && form.tipoAcceso !== 'simple' && !form.email) { alert('El correo es obligatorio'); return }
    setGuardando(true)
    try {
      if (editando) {
        const updateData = {
          nombre: form.nombre, rol: form.rol, activo: form.activo,
          updatedAt: serverTimestamp()
        }
        // NOTA: los permisos NO se tocan aquí — se gestionan en el panel
        // de detalle (sección Permisos). Editar datos no debe pisarlos.
        // Si es empleado con PIN, guardar también sucursal y PIN (si se cambió)
        if (form.tipoAcceso === 'simple') {
          updateData.sucursalId = form.sucursalId || ''
          if (form.pin) updateData.pin = form.pin
        }
        await updateDoc(doc(db, 'usuarios', editando), updateData)
      } else {
        // Al CREAR, asignar permisos por defecto del rol elegido.
        const permisosIniciales = PERMISOS_POR_ROL[form.rol] || []
        const datosBase = {
          nombre: form.nombre, rol: form.rol,
          activo: true, permisos: permisosIniciales,
          tipoAcceso: form.tipoAcceso || 'email',
          creadoPor: currentUser?.uid || '',
          empresaId,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        }
        if (form.tipoAcceso === 'simple') {
          // Empleado con usuario simple y PIN
          if (!form.usuarioSimple || !form.pin) { alert('Agrega usuario y PIN'); return }
          await setDoc(doc(collection(db, 'usuarios')), {
            ...datosBase,
            usuarioSimple: form.usuarioSimple,
            pin: form.pin,
            sucursalId: form.sucursalId || '',
            email: '',
          })
        } else {
          // Admin con email
          if (!form.email && form.tipoAcceso !== 'simple') { alert('Agrega el correo electrónico'); return }
          await setDoc(doc(collection(db, 'usuarios')), {
            ...datosBase,
            email: form.email,
          })
        }

      }
      setModalOpen(false)
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const toggleActivo = async (usuario) => {
    await updateDoc(doc(db, 'usuarios', usuario.id), {
      activo: !usuario.activo, updatedAt: serverTimestamp()
    })
  }

  const eliminar = async (usuario) => {
    try {
      await deleteDoc(doc(db, 'usuarios', usuario.id))
      setModalEliminar(null)
      setVistaDetalle(false) // en móvil, regresar a la lista
    } catch (e) { alert('Error: ' + e.message) }
  }

  const enviarResetPassword = async (email) => {
    try {
      const auth = getAuth()
      await sendPasswordResetEmail(auth, email)
      alert(`✅ Correo de restablecimiento enviado a ${email}`)
    } catch (e) { alert('Error: ' + e.message) }
  }

  const usuariosFiltrados = usuarios.filter(u =>
    u.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.email?.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.rol?.toLowerCase().includes(busqueda.toLowerCase())
  )

  const getIniciales = (nombre) => (nombre || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const getRolInfo = (rol) => ROLES[rol] || { label: rol, color: '#6b7280', icon: '👤', desc: '' }


  return (
    <>
      <style>{userStyles}</style>

      {/* TOPBAR */}
      <div className="topbar">
        <div style={{ paddingLeft: 50 }}>
          <div className="page-title">👤 Gestión de Usuarios</div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {usuarios.length} usuarios registrados
            <span className="firebase-badge">🔥 Firebase</span>
          </div>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => abrirModal()}>
          + Nuevo Usuario
        </button>
      </div>

      {/* STATS */}
      <div className="user-stats">
        <div className="user-stat">
          <div className="user-stat-val">{usuarios.length}</div>
          <div className="user-stat-label">Total usuarios</div>
        </div>
        <div className="user-stat">
          <div className="user-stat-val" style={{ color: '#00C296' }}>{usuarios.filter(u => u.activo !== false).length}</div>
          <div className="user-stat-label">Activos</div>
        </div>
        <div className="user-stat">
          <div className="user-stat-val" style={{ color: '#ef4444' }}>{usuarios.filter(u => u.activo === false).length}</div>
          <div className="user-stat-label">Inactivos</div>
        </div>
        <div className="user-stat">
          <div className="user-stat-val" style={{ color: '#2E6FD4' }}>{Object.keys(ROLES).length}</div>
          <div className="user-stat-label">Roles disponibles</div>
        </div>
      </div>

      {/* ══ LAYOUT MAESTRO-DETALLE ══ */}
      <div className={`um-layout ${vistaDetalle ? 'viewing-detail' : ''}`}>

        {/* ── COLUMNA IZQUIERDA: LISTA ── */}
        <div className="um-list-col">
          <div className="um-list-search">
            <input className="input" placeholder="🔍 Buscar usuario..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div className="um-list-scroll">
            {loading ? (
              <div className="um-empty" style={{ padding: '40px 20px' }}>⏳ Cargando...</div>
            ) : usuariosFiltrados.length === 0 ? (
              <div className="um-empty" style={{ padding: '40px 20px' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
                <div style={{ fontSize: 13 }}>Sin usuarios</div>
              </div>
            ) : usuariosFiltrados.map(u => {
              const rolInfo = getRolInfo(u.rol)
              const activo = u.activo !== false
              const esSel = seleccionado?.id === u.id
              return (
                <div key={u.id} className={`um-list-item ${esSel ? 'active' : ''}`}
                  onClick={() => seleccionarUsuario(u)}>
                  <div className="um-avatar sm" style={{ background: `linear-gradient(135deg, ${rolInfo.color}, ${rolInfo.color}99)` }}>
                    {getIniciales(u.nombre)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="um-list-name">{u.nombre}</div>
                    <div className="um-list-sub">
                      {rolInfo.icon} {rolInfo.label}{u.tipoAcceso === 'simple' ? ' · PIN' : ''}
                    </div>
                  </div>
                  <span className="estado-dot" style={{ background: activo ? '#00C296' : 'var(--muted)' }} />
                </div>
              )
            })}
          </div>
        </div>

        {/* ── COLUMNA DERECHA: DETALLE ── */}
        <div className="um-detail">
          {!seleccionado ? (
            <div className="um-empty">
              <div style={{ fontSize: 48, marginBottom: 12 }}>👈</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text2)' }}>Selecciona un usuario</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Elige alguien de la lista para ver y editar sus permisos.</div>
            </div>
          ) : (
            <>
              {/* Header detalle */}
              <div className="um-detail-head">
                <button className="btn btn-ghost btn-sm um-back-btn" onClick={volverALista}>← Volver</button>
                <div className="um-avatar lg" style={{ background: `linear-gradient(135deg, ${getRolInfo(seleccionado.rol).color}, ${getRolInfo(seleccionado.rol).color}99)` }}>
                  {getIniciales(seleccionado.nombre)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{seleccionado.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="user-rol-badge" style={{ background: getRolInfo(seleccionado.rol).color + '15', color: getRolInfo(seleccionado.rol).color, border: `1px solid ${getRolInfo(seleccionado.rol).color}30`, padding: '2px 10px', borderRadius: 99, fontWeight: 700 }}>
                      {getRolInfo(seleccionado.rol).icon} {getRolInfo(seleccionado.rol).label}
                    </span>
                    <span>{seleccionado.tipoAcceso === 'simple' ? `👤 ${seleccionado.usuarioSimple}` : seleccionado.email}</span>
                    <span>· {permisos.length} permisos</span>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => abrirModal(seleccionado)} title="Editar datos">✏️ Editar</button>
              </div>

              {/* Body detalle */}
              <div className="um-detail-body">
                {/* Acciones de cuenta */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleActivo(seleccionado)}
                    style={{ color: seleccionado.activo !== false ? '#ef4444' : '#00C296' }}>
                    {seleccionado.activo !== false ? '🔒 Desactivar' : '🔓 Activar'}
                  </button>
                  {seleccionado.tipoAcceso !== 'simple' && seleccionado.email && (
                    <button className="btn btn-ghost btn-sm" onClick={() => enviarResetPassword(seleccionado.email)}>
                      📧 Resetear contraseña
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => setModalEliminar(seleccionado)} style={{ color: '#ef4444' }}>
                    🗑️ Eliminar
                  </button>
                </div>

                {/* Sección permisos */}
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
                  Aplicar permisos de un rol como base:
                </div>
                <div className="roles-grid" style={{ marginBottom: 16 }}>
                  {Object.entries(ROLES).map(([key, rol]) => (
                    <div key={key} className="rol-btn" onClick={() => setPermisos(PERMISOS_POR_ROL[key] || [])}>
                      <div className="rol-icon">{rol.icon}</div>
                      <div>{rol.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPermisos(MODULOS.flatMap(m => m.permisos.map(p => p.key)))}>
                    ✅ Seleccionar todo
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPermisos([])}>
                    ❌ Quitar todo
                  </button>
                  <div style={{ flex: 1 }} />
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {permisos.length} / {MODULOS.flatMap(m => m.permisos).length} permisos
                  </div>
                </div>

                {/* Módulos con checklist */}
                {MODULOS.map(modulo => {
                  const permisosActivos = modulo.permisos.filter(p => permisos.includes(p.key)).length
                  const todosActivos = permisosActivos === modulo.permisos.length
                  const abierto = modulosAbiertos[modulo.key] !== false
                  return (
                    <div key={modulo.key} className="modulo-section">
                      <div className="modulo-header" onClick={() => toggleModuloAbierto(modulo.key)}>
                        <div className="modulo-title">
                          <div
                            className={`permiso-check ${permisosActivos > 0 ? 'checked' : ''}`}
                            style={permisosActivos > 0 && !todosActivos ? { background: 'var(--accent)', opacity: 0.5, border: 'none' } : {}}
                            onClick={e => { e.stopPropagation(); toggleModulo(modulo.key) }}>
                            {todosActivos ? '✓' : permisosActivos > 0 ? '−' : ''}
                          </div>
                          <span>{modulo.icon} {modulo.label}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="modulo-count">{permisosActivos}/{modulo.permisos.length}</span>
                          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{abierto ? '▲' : '▼'}</span>
                        </div>
                      </div>
                      {abierto && (
                        <div className="permisos-list">
                          {modulo.permisos.map(permiso => {
                            const activo = permisos.includes(permiso.key)
                            return (
                              <div key={permiso.key} className="permiso-row" onClick={() => togglePermiso(permiso.key)}>
                                <div className={`permiso-check ${activo ? 'checked' : ''}`}>
                                  {activo ? '✓' : ''}
                                </div>
                                <span className="permiso-label">{permiso.label}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Guardar permisos */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={guardarPermisos} disabled={guardando}>
                    {guardando ? '⏳...' : '💾 Guardar Permisos'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── MODAL NUEVO / EDITAR USUARIO ── */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editando ? '✏️ Editar Usuario' : '👤 Nuevo Usuario'}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Nombre completo *</label>
                <input className="input" placeholder="Juan Martínez"
                  value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}/>
              </div>

              {/* Tipo de acceso — solo al crear */}
              {!editando && (
                <div className="form-group">
                  <label className="form-label">Tipo de acceso</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div onClick={() => setForm(f => ({ ...f, tipoAcceso: 'email' }))}
                      style={{ padding: '12px', borderRadius: 10, border: `1.5px solid ${form.tipoAcceso === 'email' ? 'var(--accent)' : 'var(--border)'}`, background: form.tipoAcceso === 'email' ? 'var(--glow)' : 'var(--surface2)', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>📧</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: form.tipoAcceso === 'email' ? 'var(--accent)' : 'var(--muted)' }}>Email + Contraseña</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>Para administradores</div>
                    </div>
                    <div onClick={() => setForm(f => ({ ...f, tipoAcceso: 'simple' }))}
                      style={{ padding: '12px', borderRadius: 10, border: `1.5px solid ${form.tipoAcceso === 'simple' ? '#00C296' : 'var(--border)'}`, background: form.tipoAcceso === 'simple' ? 'rgba(0,194,150,0.08)' : 'var(--surface2)', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>🔢</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: form.tipoAcceso === 'simple' ? '#00C296' : 'var(--muted)' }}>Usuario + PIN</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>Para empleados</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Email — al crear con tipoAcceso email, o al editar admin */}
              {((!editando && form.tipoAcceso === 'email') || (editando && form.tipoAcceso === 'email')) && (
                <div className="form-group">
                  <label className="form-label">Correo electrónico {!editando ? '*' : ''}</label>
                  <input className="input" type="email" placeholder="juan@empresa.com"
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    disabled={!!editando} style={{ opacity: editando ? 0.6 : 1 }}/>
                  {editando && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>El correo no se puede cambiar desde aquí.</div>}
                </div>
              )}

              {/* Campos PIN y sucursal — al crear simple, o al editar empleado simple */}
              {form.tipoAcceso === 'simple' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {!editando && (
                    <div className="form-group">
                      <label className="form-label">Nombre de usuario * <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>(sin espacios, sin @)</span></label>
                      <input className="input" placeholder="juan.cajero" autoCapitalize="none"
                        value={form.usuarioSimple}
                        onChange={e => setForm(f => ({ ...f, usuarioSimple: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '') }))}/>
                    </div>
                  )}
                  {editando && (
                    <div className="form-group">
                      <label className="form-label">Nombre de usuario</label>
                      <input className="input" value={form.usuarioSimple} disabled style={{ opacity: 0.6 }}/>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>El usuario no se puede cambiar.</div>
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">PIN <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>(4-6 dígitos — dejar vacío para no cambiar)</span></label>
                    <input className="input" type="number" placeholder={editando ? '••••••' : '1234'} maxLength={6}
                      value={form.pin}
                      onChange={e => setForm(f => ({ ...f, pin: e.target.value.slice(0, 6) }))}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">SUCURSAL ASIGNADA</label>
                    <select className="input" value={form.sucursalId}
                      onChange={e => setForm(f => ({ ...f, sucursalId: e.target.value }))}>
                      <option value="">Sin sucursal fija (elige al entrar)</option>
                      {sucursales.map(s => (
                        <option key={s.id} value={s.id}>{s.nombre} — Est: {s.codEstablecimiento}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Rol</label>
                <div className="roles-grid">
                  {Object.entries(ROLES).map(([key, rol]) => (
                    <div key={key}
                      className={`rol-btn ${form.rol === key ? 'active' : ''}`}
                      onClick={() => cambiarRol(key)}>
                      <div className="rol-icon">{rol.icon}</div>
                      <div>{rol.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {getRolInfo(form.rol).icon} {getRolInfo(form.rol).desc}
                </div>
              </div>

              {editando && (
                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[true, false].map(v => (
                      <div key={String(v)}
                        onClick={() => setForm(f => ({ ...f, activo: v }))}
                        style={{
                          flex: 1, padding: '10px', borderRadius: 10, textAlign: 'center',
                          border: `1.5px solid ${form.activo === v ? (v ? '#00C296' : '#ef4444') : 'var(--border)'}`,
                          background: form.activo === v ? (v ? 'rgba(0,194,150,0.1)' : 'rgba(239,68,68,0.1)') : 'var(--surface2)',
                          color: form.activo === v ? (v ? '#00C296' : '#ef4444') : 'var(--muted)',
                          cursor: 'pointer', fontSize: 13, fontWeight: 600
                        }}>
                        {v ? '✅ Activo' : '🔒 Inactivo'}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ background: 'rgba(74,143,232,0.08)', border: '1px solid rgba(74,143,232,0.2)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: 'var(--text2)' }}>
                💡 {editando
                  ? <>Los permisos se editan en el panel del usuario, en la sección <strong>Permisos</strong>.</>
                  : <>Al crear, se asignan los permisos por defecto del rol <strong>{getRolInfo(form.rol).label}</strong>. Podés personalizarlos después seleccionando al usuario.</>}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando || !form.nombre || (!editando && form.tipoAcceso === 'email' && !form.email) || (!editando && form.tipoAcceso === 'simple' && (!form.usuarioSimple || !form.pin))}>
                {guardando ? '⏳...' : editando ? '💾 Guardar cambios' : '👤 Crear Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ELIMINAR ── */}
      {modalEliminar && (
        <div className="modal-overlay" onClick={() => setModalEliminar(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">🗑️ ¿Eliminar usuario?</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
              Se eliminará permanentemente a <strong style={{ color: 'var(--text)' }}>{modalEliminar.nombre}</strong>.<br/>
              Esta acción no se puede deshacer.
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalEliminar(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => eliminar(modalEliminar)}>
                🗑️ Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}