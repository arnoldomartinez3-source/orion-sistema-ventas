import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, onSnapshot, doc, runTransaction, getDocs, query, where } from 'firebase/firestore'
import { useAuth } from '../AuthContext'
import { usePermisos } from '../PermisosContext'

export function useSucursal() {
  const { user } = useAuth()
  const { userId, esAdmin, empresaId } = usePermisos()
  const [sucursales, setSucursales]     = useState([])
  const [sucursalActiva, setSucursalActiva] = useState(null)
  // Empezar en true para evitar flash del selector mientras carga
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    if (!empresaId) return // esperar a tener empresaId antes de consultar (corre en toda la app)
    const unsub = onSnapshot(query(collection(db, 'sucursales'), where('empresaId', '==', empresaId)), async snap => {
      const todas = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.activa !== false)
      setSucursales(todas)

      // Si la sucursal guardada en sessionStorage NO pertenece a ESTA empresa
      // (quedó de otra empresa al cambiar de cuenta, o fue borrada), limpiarla.
      // Si no, el POS intentaría leer/actualizar una sucursal de otra empresa y
      // las reglas lo rechazan con "Missing or insufficient permissions".
      const guardadaId = sessionStorage.getItem('orion_sucursal_activa')
      if (guardadaId && !todas.some(s => s.id === guardadaId)) {
        sessionStorage.removeItem('orion_sucursal_activa')
        setSucursalActiva(null)
      }

      if (todas.length === 0) { setLoading(false); return }

      // ── EMPLEADO CON PIN ──
      // Lee sucursalId desde sessionStorage (lo guardó Login.jsx al autenticar con PIN)
      if (!esAdmin) {
        const sucursalId = sessionStorage.getItem('orion_sucursal_activa')
        if (sucursalId) {
          const suc = todas.find(s => s.id === sucursalId)
          if (suc) { setSucursalActiva(suc); setLoading(false); return }
        }
        // Fallback: si solo hay una sucursal, asignarla automáticamente
        if (todas.length === 1) {
          setSucursalActiva(todas[0])
          sessionStorage.setItem('orion_sucursal_activa', todas[0].id)
          setLoading(false); return
        }
        // Sin sucursal asignada — necesitará selector (raro en empleados)
        setLoading(false); return
      }

      // ── ADMIN ──
      const saved = sessionStorage.getItem('orion_sucursal_activa')
      if (saved) {
        const suc = todas.find(s => s.id === saved)
        if (suc) { setSucursalActiva(suc); setLoading(false); return }
      }
      // Si solo hay una, asignar automáticamente sin mostrar selector
      if (todas.length === 1) {
        setSucursalActiva(todas[0])
        sessionStorage.setItem('orion_sucursal_activa', todas[0].id)
        setLoading(false); return
      }
      // Varias sucursales y no hay una guardada → necesita selector
      setLoading(false)
    })
    return () => unsub()
  }, [userId, esAdmin, empresaId])

  const seleccionarSucursal = (suc) => {
    setSucursalActiva(suc)
    sessionStorage.setItem('orion_sucursal_activa', suc.id)
  }

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

  const generarNumeroDTE = async (tipoDte) => {
    if (!sucursalActiva) throw new Error('No hay sucursal seleccionada')
    const num = await siguienteCorrelativo(tipoDte)
    const numStr = String(num).padStart(15, '0')
    return `${tipoDte}${sucursalActiva.codEstablecimiento}${sucursalActiva.codPuntoVenta}${numStr}`
  }

  return { sucursales, sucursalActiva, loading, seleccionarSucursal, siguienteCorrelativo, generarNumeroDTE }
}