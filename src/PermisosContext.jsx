import { createContext, useContext, useState, useEffect } from 'react'
import { db } from './firebase'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { useAuth } from './AuthContext'

// ══════════════════════════════════════════════════
// CONTEXTO DE PERMISOS — ORIÓN
// Carga los permisos del usuario actual desde Firebase
// y los hace disponibles en toda la app
// ══════════════════════════════════════════════════

const PermisosContext = createContext(null)

export const usePermisos = () => useContext(PermisosContext)

// Hook simple para verificar un permiso
export const usePuede = (permiso) => {
  const ctx = useContext(PermisosContext)
  if (!ctx) return false
  return ctx.puede(permiso)
}

export function PermisosProvider({ children }) {
  const { user } = useAuth()
  const [permisos, setPermisos] = useState([])
  const [rol, setRol] = useState(null)
  const [usuarioData, setUsuarioData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setPermisos([])
      setRol(null)
      setUsuarioData(null)
      setLoading(false)
      return
    }

    // Para empleados con PIN: sus permisos ya vienen en el objeto de sesión
    if (user.esEmpleado) {
      const perfilEmpleado = JSON.parse(sessionStorage.getItem('orion_empleado') || '{}')
      setUsuarioData({ id: user.uid, ...perfilEmpleado })
      setRol(perfilEmpleado.rol || 'cajero')
      setPermisos(perfilEmpleado.permisos || [])
      setLoading(false)
      return
    }

    // Para admins: buscar por uid primero, luego por email como fallback
    const q = query(collection(db, 'usuarios'), where('email', '==', user.email))
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        const data = snap.docs[0].data()
        setUsuarioData({ id: snap.docs[0].id, ...data })
        setRol(data.rol || 'administrador')
        setPermisos(data.permisos || todosLosPermisos())
      } else {
        // Si no existe en la colección usuarios, es admin (el dueño del sistema)
        setRol('administrador')
        setPermisos(todosLosPermisos())
        setUsuarioData(null)
      }
      setLoading(false)
    })

    return () => unsub()
  }, [user])

  // Verificar si el usuario tiene un permiso
  const puede = (permiso) => {
    if (rol === 'administrador' && !usuarioData) return true // dueño del sistema
    return permisos.includes(permiso)
  }

  // Verificar múltiples permisos (al menos uno)
  const puedeAlguno = (...listaPermisos) => listaPermisos.some(p => puede(p))

  // Verificar múltiples permisos (todos)
  const puedeTodos = (...listaPermisos) => listaPermisos.every(p => puede(p))

  return (
    <PermisosContext.Provider value={{
      permisos, rol, usuarioData, loading,
      puede, puedeAlguno, puedeTodos,
      esAdmin: rol === 'administrador',
      userId: user?.uid,
      userEmail: user?.email,
      userName: usuarioData?.nombre || user?.displayName || user?.email,
    }}>
      {children}
    </PermisosContext.Provider>
  )
}

// Todos los permisos del sistema (para el administrador principal)
function todosLosPermisos() {
  return [
    'ver_dashboard', 'ver_punto_venta', 'realizar_ventas',
    'aplicar_descuentos', 'cancelar_ventas',
    'ver_inventario', 'crear_productos', 'editar_productos',
    'eliminar_productos', 'ver_kardex', 'registrar_movimientos', 'importar_exportar',
    'ver_clientes', 'crear_clientes', 'editar_clientes', 'eliminar_clientes',
    'ver_compras', 'crear_compras', 'editar_compras', 'eliminar_compras',
    'ver_cotizaciones', 'crear_cotizaciones', 'editar_cotizaciones',
    'eliminar_cotizaciones', 'convertir_a_venta',
    'ver_facturas', 'crear_facturas', 'editar_facturas',
    'eliminar_facturas', 'imprimir_facturas', 'compartir_whatsapp',
    'ver_configuracion', 'editar_configuracion',
    'ver_usuarios', 'crear_usuarios', 'editar_usuarios', 'eliminar_usuarios',
  ]
}
