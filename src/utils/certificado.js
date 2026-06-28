// Extrae la clave privada en formato PKCS#8 PEM desde el archivo de certificado
// del Ministerio de Hacienda. El .crt del MH es un XML que contiene
// <privateKey>...<encodied>BASE64</encodied>. También acepta que el archivo ya
// venga como PEM (-----BEGIN PRIVATE KEY-----). Mismo proceso que extraer_clave.cjs,
// pero en el navegador. Lanza error con mensaje claro si no encuentra la clave.
export function extraerClavePEM(texto) {
  if (!texto || typeof texto !== 'string') throw new Error('Archivo vacío o ilegible.')

  // Caso 1: el archivo ya es un PEM de clave privada → usar tal cual.
  const pem = texto.match(/-----BEGIN (?:RSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |ENCRYPTED )?PRIVATE KEY-----/)
  if (pem) return pem[0].trim() + '\n'

  // Caso 2: XML del MH con <privateKey><encodied>BASE64</encodied>.
  const bloque = texto.match(/<privateKey>[\s\S]*?<\/privateKey>/)
  if (!bloque) throw new Error('No se encontró la clave privada en el archivo. ¿Es el .crt correcto del MH?')
  const enc = bloque[0].match(/<encodied>([\s\S]*?)<\/encodied>/)
  if (!enc) throw new Error('No se encontró <encodied> dentro de <privateKey>.')
  const base64 = enc[1].replace(/\s+/g, '')
  if (!base64) throw new Error('La clave privada está vacía.')
  const lineas = base64.match(/.{1,64}/g).join('\n')
  return '-----BEGIN PRIVATE KEY-----\n' + lineas + '\n-----END PRIVATE KEY-----\n'
}
