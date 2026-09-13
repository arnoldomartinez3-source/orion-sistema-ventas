import { useState } from 'react'
import { imprimirIframe } from '../utils/imprimir'

// ══════════════════════════════════════════════════════════════════
// GUÍA DE PASO A PRODUCCIÓN — lo que tiene que pasar, en orden, para que una
// empresa emita DTE reales con ORIÓN. Basada en el proceso REAL que One Geo
// hizo con su propio NIT (Manual Técnico de Conexión MH, mayo 2026).
// Se muestra en el Asistente de Certificación (solo One Geo) y se puede
// imprimir la parte del cliente para entregársela.
// ══════════════════════════════════════════════════════════════════

const PORTAL = 'https://admin.factura.gob.sv'

// Mínimos de pruebas que exige el MH para certificar (según el manual).
const MINIMOS_CERTIFICACION = [
  { tipo: 'FE',  nombre: 'Factura (FE)',                 min: 90, obligatorio: true },
  { tipo: 'CCF', nombre: 'Crédito Fiscal (CCF)',         min: 75, obligatorio: true },
  { tipo: 'NC',  nombre: 'Nota de Crédito (NC)',         min: 50, obligatorio: true },
  { tipo: 'ND',  nombre: 'Nota de Débito (ND)',          min: 25, obligatorio: true },
  { tipo: 'FEX', nombre: 'Factura de Exportación (FEX)', min: 90, obligatorio: false, nota: 'solo si el cliente exporta' },
  { tipo: 'EI',  nombre: 'Evento de Invalidación',       min: 5,  obligatorio: false },
  { tipo: 'EC',  nombre: 'Evento de Contingencia',       min: 5,  obligatorio: false },
]

const FASES = [
  {
    id: 1, quien: 'cliente', titulo: 'El cliente pide acceso al ambiente de PRUEBAS en el portal del MH',
    pasos: [
      <>Entrar a <strong>{PORTAL}</strong> con el <strong>NIT</strong> y la <strong>contraseña de servicios en línea de la DGII</strong>.</>,
      <>Ir a <strong>“Solicitud de Ingreso al Ambiente para Pruebas”</strong> → Nueva solicitud → Aceptar → <strong>Iniciar</strong>.</>,
      <>Elegir <strong>“Sistema de Transmisión DTE”</strong> (no “Sistema de Facturación”) y marcar los tipos: <strong>Factura, CCF, Nota de Crédito, Nota de Débito</strong> (y FEX solo si exporta).</>,
      <>⏱️ Desde que toca <strong>Iniciar</strong> corren <strong>2 meses</strong> para terminar las pruebas. Conviene tener ORIÓN listo antes.</>,
    ],
  },
  {
    id: 2, quien: 'cliente', titulo: 'El cliente genera el certificado y las contraseñas',
    pasos: [
      <>El portal pide <strong>dos contraseñas simples</strong> para el certificado (clave pública y clave privada): 8 a 30 caracteres, una mayúscula, un carácter especial, sin secuencias ni espacios. Ejemplo: <code>MiTienda@Pri2026</code>. <strong>Guardarlas.</strong></>,
      <>Luego pide la <strong>contraseña API</strong>. Es <strong>otra</strong> contraseña distinta. <strong>Guardarla aparte</strong>: es la que ORIÓN usa para conectarse.</>,
      <>Tocar <strong>“Acreditar Contribuyente”</strong>.</>,
      <>🚨 En la pantalla de resumen, <strong>ANTES de “Finalizar”</strong>, tocar <strong>“Descargar Certificados”</strong> (pide la clave pública una vez y la privada dos veces). Esa pantalla <strong>no vuelve a aparecer</strong>. Se bajan 3 archivos: PublicKey, PrivateKey y <strong>Certificado_[NIT].crt</strong>.</>,
      <>En el portal: <strong>Certificado → Carga de Certificado</strong> → subir el <strong>.crt</strong> con la clave privada → debe decir “cargado con éxito”.</>,
    ],
  },
  {
    id: 3, quien: 'cliente', titulo: 'El cliente le entrega a One Geo',
    pasos: [
      <>El archivo <strong>Certificado_[NIT].crt</strong> (ORIÓN extrae la clave privada de ahí; los archivos .key suelen venir con error 813 y no sirven).</>,
      <>La <strong>contraseña API</strong> (no las del certificado).</>,
      <>NIT, NRC, razón social, actividad económica, departamento, municipio, dirección, teléfono y correo.</>,
      <>Los códigos que el MH le asignó: <strong>establecimiento</strong> (S001 o M001) y <strong>punto de venta</strong> (P001).</>,
    ],
  },
  {
    id: 4, quien: 'onegeo', titulo: 'One Geo configura ORIÓN (Panel One Geo → la empresa)',
    pasos: [
      <><strong>Datos fiscales</strong>: NIT, NRC, nombre, actividad, dirección, tipo de establecimiento, códigos MH (codEstableMH / codPuntoVentaMH) y propios.</>,
      <><strong>Conexión MH</strong>: ambiente <strong>Prueba (00)</strong>, usuario API = <strong>NIT sin guiones</strong> (no el número facturador), contraseña API, y subir el <strong>.crt</strong>. Contraseña del certificado: vacía.</>,
      <>Si el cliente viene de otro sistema, fijar los <strong>correlativos iniciales</strong> en Sucursales.</>,
      <>Encender el <strong>Asistente de Certificación</strong> para esa empresa y verificar que una FE de prueba sale <strong>PROCESADA</strong>.</>,
    ],
  },
  {
    id: 5, quien: 'onegeo', titulo: 'Pruebas de certificación (este Asistente)',
    pasos: [
      <>Generar los lotes hasta cubrir los mínimos de abajo. El progreso se cuenta solo con las <strong>PROCESADAS</strong>.</>,
      <>Cuando el portal marque las pruebas como completas, el MH revisa y <strong>habilita el ambiente productivo</strong> del cliente.</>,
    ],
  },
  {
    id: 6, quien: 'ambos', titulo: 'Paso a PRODUCCIÓN',
    pasos: [
      <>El cliente <strong>repite el acreditamiento en ambiente productivo</strong> (fases 1 a 3): certificado nuevo con contraseñas nuevas, contraseña API nueva y un <strong>.crt nuevo</strong>. Nada de pruebas sirve en producción.</>,
      <>One Geo, en <strong>Conexión MH</strong>: ambiente <strong>Producción (01)</strong>, la contraseña API de producción y el .crt de producción. Los correlativos de producción arrancan en 1 solos.</>,
      <>Apagar el Asistente de Certificación de la empresa. ORIÓN muestra el banner rojo <strong>MODO PRODUCCIÓN</strong>.</>,
      <>Hacer la <strong>primera venta real</strong> y confirmar que llega el <strong>sello del MH</strong>. Si da 101 (credenciales) o 802 (firma), revisar usuario = NIT y que el .crt cargado sea el de producción.</>,
    ],
  },
]

const QUIEN = {
  cliente: { txt: 'Cliente', bg: 'rgba(245,158,11,0.14)', color: '#b45309' },
  onegeo:  { txt: 'One Geo', bg: 'rgba(65,120,212,0.14)', color: '#2C56AD' },
  ambos:   { txt: 'Cliente + One Geo', bg: 'rgba(124,58,237,0.14)', color: '#6d28d9' },
}

export default function GuiaProduccion({ progreso = {}, empresaNombre = '' }) {
  const [abierta, setAbierta] = useState(false)

  const imprimirParaCliente = () => {
    const fases = FASES.filter(f => f.quien !== 'onegeo')
    const li = (nodes) => nodes.map(n => `<li>${nodoATexto(n)}</li>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Guía para emitir DTE con ORIÓN</title><style>
      body{font-family:Arial,sans-serif;color:#1a2540;max-width:760px;margin:0 auto;padding:28px;font-size:13px;line-height:1.5}
      h1{font-size:20px;margin:0 0 4px}.sub{color:#666;margin:0 0 18px}h2{font-size:15px;margin:18px 0 6px;padding-bottom:4px;border-bottom:1.5px solid #ddd}
      ol{padding-left:20px}li{margin:4px 0}code{background:#f2f2f2;padding:1px 5px;border-radius:4px}.aviso{background:#fff7e6;border:1px solid #f0c36d;border-radius:8px;padding:10px 12px;margin-top:16px}
      @media print{@page{margin:15mm}}
    </style></head><body>
      <h1>Cómo obtener sus accesos del Ministerio de Hacienda</h1>
      <p class="sub">Guía para ${empresaNombre || 'el cliente'} · ORIÓN · One Geo Systems</p>
      ${fases.map(f => `<h2>${f.id}. ${f.titulo}</h2><ol>${li(f.pasos)}</ol>`).join('')}
      <div class="aviso"><strong>Muy importante:</strong> guarde las tres contraseñas (clave pública, clave privada y contraseña API) en un lugar seguro y descargue el certificado antes de tocar “Finalizar”. Sin el archivo .crt y la contraseña API, ORIÓN no puede conectarse al Ministerio.</div>
      <p style="margin-top:18px;color:#666;font-size:11px">Portal: ${PORTAL} · Dudas: One Geo Systems</p>
    </body></html>`
    imprimirIframe(html)
  }

  return (
    <div className="cert-card" style={{ marginBottom: 14 }}>
      <div onClick={() => setAbierta(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>🗺️ Ruta a producción: qué hace el cliente y qué hace One Geo</div>
        <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>{abierta ? 'Ocultar ▴' : 'Ver la guía ▾'}</span>
      </div>

      {abierta && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FASES.map(f => (
            <div key={f.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--navy)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12 }}>{f.id}</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{f.titulo}</span>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: QUIEN[f.quien].bg, color: QUIEN[f.quien].color }}>{QUIEN[f.quien].txt}</span>
              </div>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, lineHeight: 1.55, color: 'var(--text2)' }}>
                {f.pasos.map((p, i) => <li key={i} style={{ margin: '3px 0' }}>{p}</li>)}
              </ol>

              {f.id === 5 && (
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                  {MINIMOS_CERTIFICACION.map(m => {
                    const n = progreso[m.tipo] || 0
                    const pct = Math.min(100, Math.round((n / m.min) * 100))
                    const ok = n >= m.min
                    return (
                      <div key={m.tipo} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700 }}>
                          <span>{m.nombre}{!m.obligatorio && <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · opcional</span>}</span>
                          <span style={{ fontFamily: 'var(--mono)', color: ok ? '#00a884' : 'var(--text)' }}>{n}/{m.min}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 4, background: 'var(--border)', marginTop: 6, overflow: 'hidden' }}>
                          <div style={{ width: pct + '%', height: '100%', background: ok ? '#00b894' : 'var(--accent)', transition: 'width 0.3s' }} />
                        </div>
                        {m.nota && <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>{m.nota}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary btn-sm" onClick={imprimirParaCliente}>🖨️ Imprimir la parte del cliente</button>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Hoja con las fases 1 a 3 y 6 para entregarle al cliente (sin datos internos).</span>
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', lineHeight: 1.5 }}>
            <strong>Errores típicos:</strong> <em>101 credenciales inválidas</em> → el usuario API es el NIT, no el número facturador. <em>802 firma no válida</em> → el .crt cargado en ORIÓN no es el mismo que está en el portal (o es el de pruebas en producción). <em>numeroControl no cumple formato</em> → códigos MH (S001/P001) mal cargados. <em>.key con error 813</em> → normal; ORIÓN usa el .crt.
          </div>
        </div>
      )}
    </div>
  )
}

// Convierte los nodos JSX de los pasos a texto/HTML simple para la hoja imprimible.
function nodoATexto(n) {
  if (n == null || typeof n === 'boolean') return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(nodoATexto).join('')
  const hijos = nodoATexto(n.props?.children)
  if (n.type === 'strong') return `<strong>${hijos}</strong>`
  if (n.type === 'code') return `<code>${hijos}</code>`
  return hijos
}
