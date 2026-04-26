import { createContext, useContext, useState, useEffect } from 'react'
import { auth, db } from './firebase'
import {
  onAuthStateChanged, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, signOut
} from 'firebase/auth'
import {
  doc, getDoc, setDoc, getDocs,
  collection, serverTimestamp
} from 'firebase/firestore'

const AuthContext = createContext()
export const useAuth = () => useContext(AuthContext)

const googleProvider = new GoogleAuthProvider()

const TODOS_LOS_PERMISOS = [
  'ver_dashboard','ver_punto_venta','realizar_ventas',
  'aplicar_descuentos','cancelar_ventas',
  'ver_inventario','crear_productos','editar_productos',
  'eliminar_productos','ver_kardex','registrar_movimientos',
  'importar_exportar','ver_clientes','crear_clientes',
  'editar_clientes','eliminar_clientes','ver_compras',
  'crear_compras','editar_compras','eliminar_compras',
  'ver_cotizaciones','crear_cotizaciones','editar_cotizaciones',
  'eliminar_cotizaciones','convertir_a_venta','ver_facturas',
  'crear_facturas','editar_facturas','eliminar_facturas',
  'imprimir_facturas','compartir_whatsapp','ver_configuracion',
  'editar_configuracion','ver_usuarios','crear_usuarios',
  'editar_usuarios','eliminar_usuarios'
]

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(true)
  // empleadoSesion guarda la sesión de empleados sin Firebase Auth
  const [empleadoSesion, setEmpleadoSesion] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('orion_empleado')) || null } catch { return null }
  })

  useEffect(() => {
    // Si hay sesión de empleado activa, usarla
    if (empleadoSesion) {
      setUser({ uid: empleadoSesion.id, email: empleadoSesion.email || '', displayName: empleadoSesion.nombre, esEmpleado: true })
      setPerfil(empleadoSesion)
      setLoading(false)
      return
    }

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        const perfilRef = doc(db, 'usuarios', firebaseUser.uid)
        const perfilSnap = await getDoc(perfilRef)

        if (perfilSnap.exists()) {
          setPerfil(perfilSnap.data())
        } else {
          // Verificar si es el primer usuario del sistema
          const usuariosSnap = await getDocs(collection(db, 'usuarios'))
          const esPrimero = usuariosSnap.empty

          const nuevoPerfil = {
            nombre: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Administrador',
            email: firebaseUser.email,
            rol: esPrimero ? 'administrador' : 'cajero',
            activo: true,
            permisos: esPrimero ? TODOS_LOS_PERMISOS : ['ver_dashboard','ver_punto_venta','realizar_ventas'],
            creadoAutomaticamente: true,
            esPrimerUsuario: esPrimero,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
          await setDoc(perfilRef, nuevoPerfil)
          setPerfil(nuevoPerfil)
        }
      } else {
        setUser(null)
        setPerfil(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [empleadoSesion])

  const loginEmail = (email, password) =>
    signInWithEmailAndPassword(auth, email, password)

  const loginGoogle = () => signInWithPopup(auth, googleProvider)

  // Login de empleado sin Firebase Auth
  const loginEmpleado = async (empleado) => {
    sessionStorage.setItem('orion_empleado', JSON.stringify(empleado))
    setEmpleadoSesion(empleado)
    setUser({ uid: empleado.id, email: empleado.email || '', displayName: empleado.nombre, esEmpleado: true })
    setPerfil(empleado)
  }

  const logout = async () => {
    if (empleadoSesion) {
      sessionStorage.removeItem('orion_empleado')
      setEmpleadoSesion(null)
      setUser(null)
      setPerfil(null)
    } else {
      await signOut(auth)
    }
  }

  return (
    <AuthContext.Provider value={{ user, perfil, loading, loginEmail, loginGoogle, loginEmpleado, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
