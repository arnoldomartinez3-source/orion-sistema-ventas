import { createContext, useContext, useState, useEffect } from 'react'
import { auth, db } from './firebase'
import {
  onAuthStateChanged, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, signOut,
  signInWithCustomToken
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
  'editar_usuarios','eliminar_usuarios',
  'gestionar_personal'
]

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null) // ej. cuenta autenticada pero no autorizada
  // empleadoSesion guarda la sesión de empleados (login por PIN).
  // Se respalda en sessionStorage para sobrevivir recargas de página.
  const [empleadoSesion, setEmpleadoSesion] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('orion_empleado')) || null } catch { return null }
  })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      // ── CASO 1: Hay sesión de empleado (login por PIN) ──
      // El empleado usa una sesión ANÓNIMA de Firebase por detrás.
      // firebaseUser.isAnonymous === true. Sus datos reales (rol, permisos,
      // sucursal) viven en empleadoSesion (Firestore + sessionStorage).
      if (empleadoSesion) {
        setUser({
          uid: firebaseUser?.uid || empleadoSesion.id,
          authUid: firebaseUser?.uid || null,
          email: empleadoSesion.email || '',
          displayName: empleadoSesion.nombre,
          esEmpleado: true,
          isAnonymous: firebaseUser?.isAnonymous || false,
        })
        setPerfil(empleadoSesion)
        setLoading(false)
        return
      }

      // ── CASO 2: Usuario anónimo SIN sesión de empleado ──
      // Puede pasar si quedó una sesión anónima huérfana (ej. recarga rara).
      // No es un admin: lo ignoramos como "no logueado" para no crear
      // un perfil de admin por error.
      if (firebaseUser && firebaseUser.isAnonymous) {
        setUser(null)
        setPerfil(null)
        setLoading(false)
        return
      }

      // ── CASO 3: Admin con email / Google (NO anónimo) ──
      if (firebaseUser) {
        setUser(firebaseUser)
        const perfilRef = doc(db, 'usuarios', firebaseUser.uid)
        const perfilSnap = await getDoc(perfilRef)

        if (perfilSnap.exists()) {
          setPerfil(perfilSnap.data())
        } else {
          // No tiene perfil en 'usuarios'. Dos casos posibles:
          //  (a) PRIMER usuario del sistema (colección vacía) → bootstrap como admin.
          //  (b) Alguien que se autenticó (Google/email) pero NO fue dado de alta
          //      → NO se le crea cuenta huérfana (antes se creaba un 'cajero' con
          //      empresaId vacío). Se cierra la sesión y se avisa.
          let esPrimero = false
          try {
            const usuariosSnap = await getDocs(collection(db, 'usuarios'))
            esPrimero = usuariosSnap.empty
          } catch {
            esPrimero = false
          }

          if (esPrimero) {
            const nuevoPerfil = {
              nombre: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Administrador',
              email: firebaseUser.email,
              rol: 'administrador',
              activo: true,
              permisos: TODOS_LOS_PERMISOS,
              empresaId: '', // se asigna desde el Panel One Geo (Paso 2.5).
              creadoAutomaticamente: true,
              esPrimerUsuario: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }
            await setDoc(perfilRef, nuevoPerfil)
            setPerfil(nuevoPerfil)
          } else {
            // Cuenta autenticada pero sin alta en el sistema → rechazar.
            setAuthError('Tu cuenta no está autorizada en ORIÓN. Pedile a tu administrador que te dé de alta.')
            try { await signOut(auth) } catch { /* noop */ }
            setUser(null)
            setPerfil(null)
            setLoading(false)
            return
          }
        }
      } else {
        // ── CASO 4: Nadie logueado ──
        setUser(null)
        setPerfil(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [empleadoSesion])

  const loginEmail = (email, password) => {
    setAuthError(null)
    return signInWithEmailAndPassword(auth, email, password)
  }

  const loginGoogle = () => {
    setAuthError(null)
    return signInWithPopup(auth, googleProvider)
  }

  // ── Login de empleado (usuario + PIN) ──
  // El PIN ya fue validado en Login.jsx contra Firestore.
  // Aquí: 1) abrimos sesión ANÓNIMA en Firebase para que request.auth exista,
  //       2) creamos el índice 'sesiones_empleado/{authUid}' con sus permisos,
  //          que las reglas usan para autorizarlo del lado del servidor,
  //       3) guardamos la sesión local (sessionStorage) para sobrevivir recargas.
  const loginEmpleado = async (empleado, token) => {
    // 1) Iniciar sesión con el CUSTOM TOKEN del backend (uid = id del doc del
    //    empleado en 'usuarios'). Así las reglas leen su doc real usuarios/{uid}
    //    — que el empleado no puede editar. Reemplaza al esquema anónimo +
    //    'sesiones_empleado' (que el cliente escribía y podía falsificar).
    const cred = await signInWithCustomToken(auth, token)
    const authUid = cred.user.uid

    const empleadoConAuth = { ...empleado, authUid }

    // 2) Guardar sesión local (para la UI; sobrevive recargas en la pestaña)
    sessionStorage.setItem('orion_empleado', JSON.stringify(empleadoConAuth))
    setEmpleadoSesion(empleadoConAuth)
    setPerfil(empleadoConAuth)
    setUser({
      uid: authUid,
      authUid,
      email: empleado.email || '',
      displayName: empleado.nombre,
      esEmpleado: true,
      isAnonymous: false,
    })
  }

  const logout = async () => {
    try {
      if (empleadoSesion) {
        sessionStorage.removeItem('orion_empleado')
        setEmpleadoSesion(null)
        setUser(null)
        setPerfil(null)
        // Cerrar la sesión de Firebase del empleado (custom token)
        try { if (auth.currentUser) await signOut(auth) } catch (e) { /* noop */ }
      } else {
        await signOut(auth)
      }
    } finally {
      // ── Privacidad en equipos compartidos ──────────────────────────────
      // Al cerrar sesión borramos la caché local (IndexedDB) para que los
      // datos del negocio (ventas, clientes, precios) NO queden en este
      // navegador — importante en PCs públicas o en la máquina de soporte de
      // One Geo, donde entran varias empresas distintas.
      // Hay que terminar la instancia de Firestore antes de limpiar; luego
      // recargamos la página para reinicializar un Firestore limpio.
      try {
        const { terminate, clearIndexedDbPersistence } = await import('firebase/firestore')
        await terminate(db)
        await clearIndexedDbPersistence(db)
      } catch (e) { /* otras pestañas abiertas / navegador sin IndexedDB: no bloquea el cierre */ }
      window.location.reload()
    }
  }

  // ── Etapa 1 (Paso 6): empresaId disponible en el contexto ──
  // Cada usuario (admin/cliente o empleado) pertenece a UNA empresa.
  // El empresaId vive en su perfil (usuarios/{uid}) o en la sesión de empleado.
  // Exponerlo acá permite que cualquier página filtre sus datos por empresa
  // con: const { empresaId } = useAuth()
  const empresaId = perfil?.empresaId || ''

  return (
    <AuthContext.Provider value={{ user, perfil, empresaId, loading, authError, loginEmail, loginGoogle, loginEmpleado, logout }}>
      {children}
    </AuthContext.Provider>
  )
}