import { useState, useEffect } from 'react'
import { db } from '../firebase'
import {
  collection, onSnapshot, doc, runTransaction, getDoc
} from 'firebase/firestore'
import { useAuth } from '../AuthContext'
import { usePermisos } from '../PermisosContext'

// Hook para manejar la sucursal activa del usuario
export function useSucursal() {
  const { user } = useAuth()
  const { userName, userId, esAdmin } = usePermisos()
  const [sucursales, setSucursales] = useState([])
  const [sucursalActiva, setSucursalActiva] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'sucursales'), snap => {
      const todas = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.activa !== false)
      setSucursales(todas)

      // Empleado: tiene sucursal asignada fija
      if (!esAdmin && userId) {
        // Buscar sucursal asignada al empleado
        const asignada = todas.find(s => (s.empleadosIds || []).includes(userId))
        if (asignada) setSucursalActiva(asignada)
        else if (todas.length === 1) setSucursalActiva(todas[0]) // si solo hay una, asignar automáticamente
      }

      // Admin: recuperar sucursal de sessionStorage
      if (esAdmin) {
        const saved = sessionStorage.getItem('orion_sucursal_activa')
        if (saved) {
          const suc = todas.find(s => s.id === saved)
          if (suc) setSucursalActiva(suc)
        } else if (todas.length === 1) {
          setSucursalActiva(todas[0])
          sessionStorage.setItem('orion_sucursal_activa', todas[0].id)
        }
      }

      setLoading(false)
    })
    return () => unsub()
  }, [userId, esAdmin])

  const seleccionarSucursal = (suc) => {
    setSucursalActiva(suc)
    sessionStorage.setItem('orion_sucursal_activa', suc.id)
  }

  // Obtener y reservar el siguiente correlativo con transacción atómica
  const siguienteCorrelativo = async (tipoDte) => {
    if (!sucursalActiva) throw new Error('No hay sucursal seleccionada')
    const campo = `correlativo${tipoDte}`
    const sucRef = doc(db, 'sucursales', sucursalActiva.id)
    let numeracion = 1

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(sucRef)
      if (!snap.exists()) throw new Error('Sucursal no encontrada')
      numeracion = snap.data()[campo] || 1
      tx.update(sucRef, { [campo]: numeracion + 1 })
    })

    return numeracion
  }

  // Generar número DTE completo según formato MH
  // Formato: tipoDte + codEstablecimiento + codPuntoVenta + numeracion (15 dígitos)
  const generarNumeroDTE = async (tipoDte) => {
    if (!sucursalActiva) throw new Error('No hay sucursal seleccionada')
    const num = await siguienteCorrelativo(tipoDte)
    const numStr = String(num).padStart(15, '0')
    return `${tipoDte}${sucursalActiva.codEstablecimiento}${sucursalActiva.codPuntoVenta}${numStr}`
  }

  return {
    sucursales,
    sucursalActiva,
    loading,
    seleccionarSucursal,
    siguienteCorrelativo,
    generarNumeroDTE,
  }
}
