import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import {
  collection, onSnapshot, doc, setDoc, updateDoc,
  deleteDoc, serverTimestamp, getDoc
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
  .users-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 24px; }
  @media (max-width: 900px) { .users-grid { grid-template-columns: repeat(2,1fr); } }
  @media (max-width: 600px) { .users-grid { grid-template-columns: 1fr; } }

  .user-card {
    background: var(--surface); border: 1.5px solid var(--border);
    border-radius: 16px; padding: 20px;
    box-shadow: 0 4px 20px var(--shadow2);
    transition: all 0.2s; position: relative; overflow: hidden;
  }
  .user-card:hover { border-color: var(--border2); transform: translateY(-2px); }
  .user-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background: var(--uc-color, var(--accent)); }

  .user-avatar-big {
    width: 56px; height: 56px; border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; font-weight: 800; color: #fff;
    margin-bottom: 12px; flex-shrink: 0;
  }
  .user-card-name { font-size: 15px; font-weight: 800; margin-bottom: 3px; }
  .user-card-email { font-size: 12px; color: var(--muted); margin-bottom: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .user-rol-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 700; margin-bottom: 14px; }
  .user-card-actions { display: flex; gap: 8px; }

  /* MODAL PERMISOS */
  .permisos-modal { max-width: 680px !important; max-height: 90vh; overflow-y: auto; }
  .modulo-section { margin-bottom: 16px; border: 1.5px solid var(--border); border-radius: 12px; overflow: hidden; }
  .modulo-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; background: var(--surface2);
    cursor: pointer; transition: background 0.15s;
  }
  .modulo-header:hover { background: var(--surface3); }
  .modulo-title { font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .modulo-count { font-size: 11px; color: var(--muted); }
  .permisos-list { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }

  /* CHECKBOX CUSTOM */
  .permiso-row { display: flex; align-items: center; gap: 12px; padding: 6px 8px; border-radius: 8px; cursor: pointer; transition: background 0.12s; }
  .permiso-row:hover { background: var(--surface2); }
  .permiso-check {
    width: 20px; height: 20px; border-radius: 6px; flex-shrink: 0;
    border: 2px solid var(--border2); background: var(--surface);
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; font-size: 12px;
  }
  .permiso-check.checked { background: var(--accent); border-color: var(--accent); color: white; }
  .permiso-label { font-size: 13px; color: var(--text2); flex: 1; }

  /* ROLES QUICK SELECT */
  .roles-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 16px; }
  @media (max-width: 500px) { .roles-grid { grid-template-columns: repeat(2,1fr); } }
  .rol-btn {
    padding: 10px; border-radius: 10px; border: 1.5px solid var(--border);
    background: var(--surface2); cursor: pointer; text-align: center;
    transition: all 0.15s; font-size: 12px; font-weight: 600; color: var(--muted);
  }
  .rol-btn:hover { border-color: var(--border2); color: var(--text); }
  .rol-btn.active { border-color: var(--accent); background: var(--glow); color: var(--accent); }
  .rol-icon { font-size: 20px; margin-bottom: 4px; }

  /* STATS */
  .user-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 24px; }
  @media (max-width: 700px) { .user-stats { grid-template-columns: repeat(2,1fr); } }
  .user-stat { background: var(--surface); border: 1.5px solid var(--border); border-radius: 14px; padding: 16px; text-align: center; }
  .user-stat-val { font-size: 28px; font-weight: 800; font-family: var(--mono); }
  .user-stat-label { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }

  /* ESTADO */
  .estado-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 5px; }

  /* PERMISOS RESUMEN */
  .permisos-resumen { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .permiso-tag { font-size: 10px; background: var(--surface2); border: 1px solid var(--border); color: var(--muted); padding: 2px 7px; border-radius: 4px; }
`

export default function Usuarios() {
  const { user: currentUser } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [permisosModal, setPermisosModal] = useState(null) // usuario editando permisos
  const [editando, setEditando] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [modulosAbiertos, setModulosAbiertos] = useState({})
  const [busqueda, setBusqueda] = useState('')
  const [modalEliminar, setModalEliminar] = useState(null)

  const [form, setForm] = useState({
    nombre: '', email: '', rol: 'cajero', activo: true,
    usuarioSimple: '', pin: '', tipoAcceso: 'email', // email o simple
  })
  const [permisos, setPermisos] = useState([])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'usuarios'), snap => {
      setUsuarios(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // Al cambiar rol, cargar permisos por defecto
  const cambiarRol = (rol) => {
    setForm(f => ({ ...f, rol }))
    setPermisos(PERMISOS_POR_ROL[rol] || [])
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
      setForm({ nombre: usuario.nombre || '', email: usuario.email || '', rol: usuario.rol || 'cajero', activo: usuario.activo !== false })
      setPermisos(usuario.permisos || PERMISOS_POR_ROL[usuario.rol] || [])
    } else {
      setEditando(null)
      setForm({ nombre: '', email: '', rol: 'cajero', activo: true })
      setPermisos(PERMISOS_POR_ROL['cajero'])
    }
    // Abrir todos los módulos
    const abiertos = {}
    MODULOS.forEach(m => { abiertos[m.key] = true })
    setModulosAbiertos(abiertos)
    setModalOpen(true)
  }

  const abrirPermisosModal = (usuario) => {
    setPermisosModal(usuario)
    setPermisos(usuario.permisos || PERMISOS_POR_ROL[usuario.rol] || [])
    const abiertos = {}
    MODULOS.forEach(m => { abiertos[m.key] = true })
    setModulosAbiertos(abiertos)
  }

  const guardarPermisos = async () => {
    if (!permisosModal) return
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'usuarios', permisosModal.id), {
        permisos, updatedAt: serverTimestamp()
      })
      setPermisosModal(null)
    } catch (e) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const guardar = async () => {
    if (!form.nombre || !form.email) { alert('Nombre y correo son obligatorios'); return }
    setGuardando(true)
    try {
      if (editando) {
        await updateDoc(doc(db, 'usuarios', editando), {
          nombre: form.nombre, rol: form.rol, activo: form.activo,
          permisos, updatedAt: serverTimestamp()
        })
      } else {
        const datosBase = {
          nombre: form.nombre, rol: form.rol,
          activo: true, permisos,
          tipoAcceso: form.tipoAcceso || 'email',
          creadoPor: currentUser?.uid || '',
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        }
        if (form.tipoAcceso === 'simple') {
          // Empleado con usuario simple y PIN
          if (!form.usuarioSimple || !form.pin) { alert('Agrega usuario y PIN'); return }
          await setDoc(doc(collection(db, 'usuarios')), {
            ...datosBase,
            usuarioSimple: form.usuarioSimple,
            pin: form.pin,
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

      {/* ROLES RESUMEN */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">🎭 Roles del Sistema</div>
        </div>
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
          {Object.entries(ROLES).map(([key, rol]) => (
            <div key={key} style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 12, background: 'var(--surface2)', border: '1.5px solid var(--border)' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{rol.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: rol.color }}>{rol.label}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, lineHeight: 1.4 }}>{rol.desc}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginTop: 6 }}>
                {usuarios.filter(u => u.rol === key).length} usuario(s)
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FILTRO */}
      <div style={{ marginBottom: 16 }}>
        <input className="input" style={{ maxWidth: 320 }}
          placeholder="🔍 Buscar por nombre, correo o rol..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}/>
      </div>

      {/* LISTA USUARIOS */}
      {loading ? (
        <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-text">Cargando...</div></div>
      ) : usuariosFiltrados.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👤</div>
          <div className="empty-text">No hay usuarios registrados.<br/>Crea el primer usuario.</div>
        </div>
      ) : (
        <div className="users-grid">
          {usuariosFiltrados.map(u => {
            const rolInfo = getRolInfo(u.rol)
            const activo = u.activo !== false
            return (
              <div key={u.id} className="user-card" style={{ '--uc-color': rolInfo.color, opacity: activo ? 1 : 0.6 }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  <div className="user-avatar-big" style={{ background: `linear-gradient(135deg, ${rolInfo.color}, ${rolInfo.color}99)` }}>
                    {getIniciales(u.nombre)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="user-card-name">{u.nombre}</div>
                    <div className="user-card-email">{u.email}</div>
                    <div className="user-rol-badge" style={{ background: rolInfo.color + '15', color: rolInfo.color, border: `1px solid ${rolInfo.color}30` }}>
                      {rolInfo.icon} {rolInfo.label}
                    </div>
                  </div>
                </div>

                {/* Estado */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 12 }}>
                  <div style={{ color: activo ? '#00C296' : '#ef4444', fontWeight: 600 }}>
                    <span className="estado-dot" style={{ background: activo ? '#00C296' : '#ef4444' }}/>
                    {activo ? 'Activo' : 'Inactivo'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {(u.permisos || []).length} permisos
                  </div>
                </div>

                {/* Permisos resumen */}
                <div className="permisos-resumen">
                  {MODULOS.filter(m => m.permisos.some(p => (u.permisos || []).includes(p.key))).map(m => (
                    <span key={m.key} className="permiso-tag">{m.icon} {m.label}</span>
                  ))}
                </div>

                {/* Acciones */}
                <div className="user-card-actions" style={{ marginTop: 14 }}>
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                    onClick={() => abrirPermisosModal(u)}
                    title="Gestionar permisos">
                    🔐 Permisos
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => abrirModal(u)} title="Editar">✏️</button>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => toggleActivo(u)}
                    title={activo ? 'Desactivar' : 'Activar'}
                    style={{ color: activo ? '#ef4444' : '#00C296' }}>
                    {activo ? '🔒' : '🔓'}
                  </button>
                  <button className="btn btn-danger btn-sm"
                    onClick={() => setModalEliminar(u)} title="Eliminar">🗑️</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── MODAL PERMISOS GRANULARES ── */}
      {permisosModal && (
        <div className="modal-overlay" onClick={() => setPermisosModal(null)}>
          <div className="modal permisos-modal" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div className="modal-title" style={{ marginBottom: 0 }}>🔐 Permisos — {permisosModal.nombre}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPermisosModal(null)}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>
              {getRolInfo(permisosModal.rol).icon} {getRolInfo(permisosModal.rol).label} · {permisos.length} permisos activos
            </div>

            {/* Aplicar rol rápido */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>
                Aplicar permisos de un rol como base:
              </div>
              <div className="roles-grid">
                {Object.entries(ROLES).map(([key, rol]) => (
                  <div key={key} className="rol-btn"
                    onClick={() => setPermisos(PERMISOS_POR_ROL[key] || [])}>
                    <div className="rol-icon">{rol.icon}</div>
                    <div>{rol.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Acciones rápidas */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button className="btn btn-ghost btn-sm"
                onClick={() => setPermisos(MODULOS.flatMap(m => m.permisos.map(p => p.key)))}>
                ✅ Seleccionar todo
              </button>
              <button className="btn btn-ghost btn-sm"
                onClick={() => setPermisos([])}>
                ❌ Quitar todo
              </button>
              <div style={{ flex: 1 }}/>
              <div style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>
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
                      {/* Checkbox módulo completo */}
                      <div
                        className={`permiso-check ${todosActivos ? 'checked' : permisosActivos > 0 ? 'checked' : ''}`}
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
                          <div key={permiso.key} className="permiso-row"
                            onClick={() => togglePermiso(permiso.key)}>
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

            <div className="modal-actions">
              <button className="btn btn-ghost"
                onClick={() => enviarResetPassword(permisosModal.email)}>
                📧 Resetear contraseña
              </button>
              <button className="btn btn-ghost" onClick={() => setPermisosModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarPermisos} disabled={guardando}>
                {guardando ? '⏳...' : '💾 Guardar Permisos'}
              </button>
            </div>
          </div>
        </div>
      )}

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

              {!editando && (
                <>
                  {/* Tipo de acceso */}
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

                  {form.tipoAcceso === 'email' ? (
                    <div className="form-group">
                      <label className="form-label">Correo electrónico *</label>
                      <input className="input" type="email" placeholder="juan@empresa.com"
                        value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}/>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">Nombre de usuario * <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>(sin espacios, sin @)</span></label>
                        <input className="input" placeholder="juan.cajero" autoCapitalize="none"
                          value={form.usuarioSimple}
                          onChange={e => setForm(f => ({ ...f, usuarioSimple: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '') }))}/>
                      </div>
                      <div className="form-group">
                        <label className="form-label">PIN * <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>(4-6 dígitos)</span></label>
                        <input className="input" type="number" placeholder="1234" maxLength={6}
                          value={form.pin}
                          onChange={e => setForm(f => ({ ...f, pin: e.target.value.slice(0, 6) }))}/>
                      </div>
                    </div>
                  )}
                </>
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
                  {getRolInfo(form.rol).icon} {getRolInfo(form.rol).desc} · {permisos.length} permisos cargados
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
                💡 Los permisos del rol <strong>{getRolInfo(form.rol).label}</strong> se cargan automáticamente. Puedes personalizarlos después desde el botón <strong>🔐 Permisos</strong>.
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
