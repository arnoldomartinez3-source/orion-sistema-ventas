import { initializeApp } from "firebase/app"
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore"
import { getAuth } from "firebase/auth"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

const app = initializeApp(firebaseConfig)

// ── Persistencia offline (caché local en IndexedDB) ──────────────────
// Reduce DRÁSTICAMENTE las lecturas facturadas: al re-abrir/navegar, Firestore
// sirve los datos desde el caché local y solo relee del servidor lo que CAMBIÓ
// (usando resume tokens), en vez de releer las colecciones enteras cada vez.
// `persistentMultipleTabManager` permite tener el POS abierto en varias pestañas.
// Si el navegador no soporta IndexedDB (modo incógnito viejo), degrada solo a
// memoria sin romper la app.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

export const auth = getAuth(app)
