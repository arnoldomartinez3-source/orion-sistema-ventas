import { createContext, useContext, useState, useEffect } from 'react'
import { auth } from './firebase'
import {
  onAuthStateChanged, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, signOut
} from 'firebase/auth'

const AuthContext = createContext()
export const useAuth = () => useContext(AuthContext)

const googleProvider = new GoogleAuthProvider()

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser || null)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const loginEmail = (email, password) =>
    signInWithEmailAndPassword(auth, email, password)

  const loginGoogle = () => signInWithPopup(auth, googleProvider)

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, loading, loginEmail, loginGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  )
}