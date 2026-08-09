import { auth } from '../firebase'

// POST autenticado a las Cloud Functions (/api/...).
// Adjunta el ID token del usuario para que el backend confirme QUIÉN llama y a
// qué empresa pertenece. Los endpoints de DTE (transmitir / invalidar /
// contingencia) firman documentos reales ante Hacienda: sin este token el
// backend responde 401 y no emite nada.
export async function postAutenticado(url, body) {
  const user = auth.currentUser
  if (!user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')
  const idToken = await user.getIdToken()
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  })
}
