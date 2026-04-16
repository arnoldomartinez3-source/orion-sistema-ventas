import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"
import { getAuth } from "firebase/auth"

const firebaseConfig = {
  apiKey: "AIzaSyBhZDB_APK2dON1mDonUn0RF9ooj-zAZvY",
  authDomain: "mi-sistema-ventas-7e541.firebaseapp.com",
  projectId: "mi-sistema-ventas-7e541",
  storageBucket: "mi-sistema-ventas-7e541.firebasestorage.app",
  messagingSenderId: "469018064019",
  appId: "1:469018064019:web:296bc7fdc15e3e65734966"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)

