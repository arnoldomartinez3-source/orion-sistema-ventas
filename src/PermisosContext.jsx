import { createContext, useContext, useState, useEffect } from 'react'
import { db } from './firebase'
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore'
import { useAuth } from './AuthContext'
import { esUsuarioMaestro, EMPRESA_ID_ONEGEO } from './data/certificacionConfig'
import { moduloEstaActivo } from './data/modulos'
import { TODOS_LOS_PERMISOS } from './data/permisos'

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
  const [modulosEmpresa, setModulosEmpresa] = useState(null) // mapa empresas/{id}.modulos (null = cargando)

  useEffect(() => {
    if (!user) {
      setPermisos([])
      setRol(null)
      setUsuarioData(null)
      setLoading(false)
      return
    }

    // Para empleados con PIN: leer su doc usuarios EN VIVO (el custom token usa
    // uid = id del doc). Así los cambios de permisos/rol que haga el admin se
    // reflejan SIN re-login. Si el doc no se puede leer, fallback al sessionStorage.
    if (user.esEmpleado) {
      const aplicarSession = () => {
        const perfilEmpleado = JSON.parse(sessionStorage.getItem('orion_empleado') || '{}')
        setUsuarioData({ id: user.uid, ...perfilEmpleado })
        setRol(perfilEmpleado.rol || 'cajero')
        setPermisos(perfilEmpleado.permisos || [])
        setLoading(false)
      }
      aplicarSession() // inmediato (evita parpadeo); el onSnapshot lo refresca en vivo
      const unsub = onSnapshot(doc(db, 'usuarios', user.uid), snap => {
        if (snap.exists()) {
          const data = snap.data()
          setUsuarioData({ id: snap.id, ...data })
          setRol(data.rol || 'cajero')
          setPermisos(data.permisos || [])
          setLoading(false)
        }
      })
      return () => unsub()
    }

    // Para admins: buscar por uid primero, luego por email como fallback
    const q = query(collection(db, 'usuarios'), where('email', '==', user.email))
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        const data = snap.docs[0].data()
        setUsuarioData({ id: snap.docs[0].id, ...data })
        setRol(data.rol || 'administrador')
        setPermisos(data.permisos || TODOS_LOS_PERMISOS)
      } else {
        // Si no existe en la colección usuarios, es admin (el dueño del sistema)
        setRol('administrador')
        setPermisos(TODOS_LOS_PERMISOS)
        setUsuarioData(null)
      }
      setLoading(false)
    })

    return () => unsub()
  }, [user])

  // empresaId del usuario (el maestro de One Geo se mapea a su empresa)
  const empresaId = usuarioData?.empresaId || (esUsuarioMaestro(user) ? EMPRESA_ID_ONEGEO : '')
  const esMaestro = esUsuarioMaestro(user)

  // ── Módulos activos de la empresa (candado de NEGOCIO, controlado por One Geo) ──
  // Se leen en vivo de empresas/{empresaId}.modulos → al togglear en el Panel One Geo,
  // el menú del cliente se actualiza sin re-login.
  useEffect(() => {
    if (!empresaId) { setModulosEmpresa(null); return }
    const unsub = onSnapshot(
      doc(db, 'empresas', empresaId),
      snap => setModulosEmpresa(snap.exists() ? (snap.data().modulos || {}) : {}),
      () => setModulosEmpresa({})
    )
    return () => unsub()
  }, [empresaId])

  // ¿La empresa tiene activo este módulo opcional? (candado de negocio)
  const moduloActivo = (key) => moduloEstaActivo(key, modulosEmpresa, esMaestro)

  // Verificar si el usuario tiene un permiso.
  // 'administrador' = acceso TOTAL (coincide con esAdmin() de las reglas). Antes
  // solo el dueño del sistema (admin sin doc) era total; un admin CON doc quedaba
  // limitado por su array de permisos en la UI, pero las reglas igual le daban
  // todo → incoherencia. Ahora admin = todo en ambos lados. Para acceso parcial,
  // usá un rol NO-admin (cajero, vendedor, etc.).
  const puede = (permiso) => {
    if (rol === 'administrador') return true
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
      empresaId, // maestro = One Geo
      modulos: modulosEmpresa,   // mapa { empleados: true, ... }
      moduloActivo,              // moduloActivo('empleados') → bool
    }}>
      {children}
    </PermisosContext.Provider>
  )
}