// ════════════════════════════════════════════════════════════════════
// IMPRIMIR.JS — Funciones compartidas para generar PDF y Ticket Térmico
// ════════════════════════════════════════════════════════════════════
//
// Este archivo agrupa toda la lógica de impresión que comparten:
//   - Facturas.jsx (módulo Facturas DTE)
//   - PuntoDeVenta.jsx (POS)
//
// Funciones exportadas:
//   • generarPDF(factura, empresa)       → HTML del PDF oficial MH V2.0
//   • generarTicket(factura, empresa)    → HTML del ticket térmico 80mm
//   • imprimirIframe(html)               → imprime directo (iframe oculto)
//   • generarQRDataURL(texto)            → DataURL del QR (importa qrcode lib)
//   • numeroALetras(num)                 → "MIL DOSCIENTOS DÓLARES Y 50/100"
//   • extraerResumenOficial(factura)     → totales desde dte_json del MH
//   • formatFecha(fechaStr)              → "DD/MM/YYYY"
//   • buildUrlConsultaMH(factura)        → URL de validación del MH
//
// ────────────────────────────────────────────────────────────────────

// Mapeo de tipos a códigos numéricos (CAT-002 del MH)
export const TIPO_DTE_NUM = {
  'FE': '01', 'CCF': '03', 'NR': '04', 'NC': '05',
  'ND': '06', 'FEX': '11', 'FSE': '14'
}

// Mapeo de versiones del JSON por tipo (V2.0)
const VERSION_JSON = { '01': 2, '03': 4, '04': 4, '05': 4, '06': 4, '11': 3, '14': 2 }

// Nombre legible por tipo de DTE
export const NOMBRE_DTE = {
  'FE': 'FACTURA',
  'CCF': 'COMPROBANTE DE CRÉDITO FISCAL',
  'NR': 'NOTA DE REMISIÓN',
  'NC': 'NOTA DE CRÉDITO',
  'ND': 'NOTA DE DÉBITO',
  'FEX': 'FACTURA DE EXPORTACIÓN',
  'FSE': 'FACTURA SUJETO EXCLUIDO',
}

// Formatea monto en dólares
export const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2)}`

// Formatea fecha YYYY-MM-DD → DD/MM/YYYY
export const formatFecha = (fechaStr) => {
  if (!fechaStr) return '—'
  if (typeof fechaStr === 'object' && fechaStr.seconds) {
    return new Date(fechaStr.seconds * 1000).toLocaleDateString('es-SV')
  }
  const partes = String(fechaStr).split('-')
  if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`
  return fechaStr
}

// URL del MH para validar el DTE escaneando el QR
export const buildUrlConsultaMH = (f) => {
  const ambiente = f.dte_ambiente || '00'
  const codGen = f.codigoGeneracion || ''
  const fechaEmi = f.fechaEmision || ''
  return `https://admin.factura.gob.sv/consultaPublica?ambiente=${ambiente}&codGen=${codGen}&fechaEmi=${fechaEmi}`
}

// Genera el código QR como Data URL (PNG en base64).
// Carga la librería 'qrcode' dinámicamente para no inflar el bundle inicial.
export const generarQRDataURL = async (texto) => {
  try {
    const QRCode = (await import('qrcode')).default
    return await QRCode.toDataURL(texto, {
      width: 180, margin: 1, errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' }
    })
  } catch (e) {
    console.warn('No se pudo generar QR:', e)
    return null
  }
}

// Extrae totales del dte_json oficial guardado en Firestore.
// Devuelve null si la factura no tiene JSON oficial (POS recién emitida o vieja).
export const extraerResumenOficial = (f) => {
  if (!f.dte_json) return null
  try {
    const dte = typeof f.dte_json === 'string' ? JSON.parse(f.dte_json) : f.dte_json
    const r = dte?.resumen
    if (!r) return null
    return {
      totalNoSuj: r.totalNoSuj || 0,
      totalExenta: r.totalExenta || 0,
      totalGravada: r.totalGravada || r.subTotalVentas || 0,
      subTotalVentas: r.subTotalVentas || 0,
      descuNoSuj: r.descuNoSuj || 0,
      descuExenta: r.descuExenta || 0,
      descuGravada: r.descuGravada || 0,
      totalDescu: r.totalDescu || 0,
      subTotal: r.subTotal || 0,
      ivaRete1: r.ivaRete1 || 0,
      reteRenta: r.reteRenta || 0,
      totalIva: r.totalIva || 0,
      ivaTributo: (r.tributos || []).find(t => t.codigo === '20')?.valor || 0,
      montoTotalOperacion: r.montoTotalOperacion || 0,
      totalNoGravado: r.totalNoGravado || 0,
      totalPagar: r.totalPagar || 0,
    }
  } catch (e) {
    return null
  }
}

// Convierte un número a letras en español (para "Total en Letras")
export const numeroALetras = (num) => {
  const entero = Math.floor(num)
  const decimales = Math.round((num - entero) * 100)
  const unidades = ['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE']
  const decenas = ['','','VEINTI','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA']
  const centenas = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS']
  const grupo = (n) => {
    if (n === 0) return ''
    if (n <= 20) return unidades[n]
    if (n < 100) {
      const d = Math.floor(n / 10), u = n % 10
      return d === 2 ? (u === 0 ? 'VEINTE' : 'VEINTI' + unidades[u]) : decenas[d] + (u ? ' Y ' + unidades[u] : '')
    }
    if (n === 100) return 'CIEN'
    if (n < 1000) {
      const c = Math.floor(n / 100), r = n % 100
      return centenas[c] + (r ? ' ' + grupo(r) : '')
    }
    if (n < 1000000) {
      const miles = Math.floor(n / 1000), r = n % 1000
      const milesStr = miles === 1 ? 'MIL' : grupo(miles) + ' MIL'
      return milesStr + (r ? ' ' + grupo(r) : '')
    }
    return n.toString()
  }
  const enteroLetras = entero === 0 ? 'CERO' : grupo(entero)
  return `${enteroLetras} DÓLARES Y ${String(decimales).padStart(2,'0')}/100`
}

// ════════════════════════════════════════════════════════════════════
// PDF OFICIAL MH V2.0 — Conforme al Anexo Normativa V2.0
// ════════════════════════════════════════════════════════════════════
export const generarPDF = async (f, empresa = {}) => {
  const tipoNum = TIPO_DTE_NUM[f.tipoDte] || '01'
  const nombreTipo = NOMBRE_DTE[f.tipoDte] || f.tipoDte
  const esAnulada = f.estadoPago === 'anulada' || f.anulada
  const esProcesado = f.dte_estado === 'PROCESADO'

  const urlConsulta = buildUrlConsultaMH(f)
  const qrDataURL = esProcesado ? await generarQRDataURL(urlConsulta) : null

  const items = (f.items && f.items.length > 0) ? f.items : [{
    nombre: f.descripcion || 'Productos y/o Servicios',
    qty: 1, precioBase: f.subtotal || 0, descuento: 0
  }]

  const resOf = extraerResumenOficial(f)
  const totalNoSuj = resOf?.totalNoSuj ?? 0
  const totalExenta = resOf?.totalExenta ?? 0
  const totalGravada = resOf?.totalGravada ?? (f.subtotal || 0)
  const descuNoSuj = resOf?.descuNoSuj ?? 0
  const descuExenta = resOf?.descuExenta ?? 0
  const descuGravada = resOf?.descuGravada ?? 0
  const subTotal = resOf?.subTotal ?? (f.subtotal || 0)
  const ivaCalculado = resOf?.ivaTributo || resOf?.totalIva || (f.iva || 0)
  const ivaRete1 = resOf?.ivaRete1 ?? 0
  const reteRenta = resOf?.reteRenta ?? 0
  const montoTotalOperacion = resOf?.montoTotalOperacion ?? (f.total || 0)
  const totalNoGravado = resOf?.totalNoGravado ?? 0
  const totalPagar = resOf?.totalPagar ?? (f.total || 0)

  const totalLetras = numeroALetras(totalPagar)
  const ambiente = f.dte_ambiente || '00'
  const ambienteTexto = ambiente === '01' ? 'PRODUCCIÓN' : 'PRUEBAS'

  const horaGen = f.createdAt?.seconds
    ? new Date(f.createdAt.seconds * 1000).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', hour12: false })
    : ''
  const fechaHoraGen = `${formatFecha(f.fechaEmision)}${horaGen ? ' ' + horaGen : ''}`

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>${nombreTipo} ${f.numero || f.numeroControl || ''}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;font-size:10px;line-height:1.3;}
.page{max-width:780px;margin:0 auto;padding:24px 18px 14px;}
.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:140px;font-weight:900;color:rgba(239,68,68,0.18);z-index:0;letter-spacing:8px;pointer-events:none;}
.contenido{position:relative;z-index:1;}
.cab-rotulo{display:flex;justify-content:space-between;align-items:center;padding:4px 10px;margin-bottom:6px;background:#1B2E6B;color:#fff;border-radius:3px;font-size:9.5px;}
.cab-rotulo strong{font-weight:700;letter-spacing:0.3px;}
.cab-emisor{display:grid;grid-template-columns:1.4fr 1.4fr 1fr;gap:12px;margin-bottom:8px;padding-bottom:8px;border-bottom:1.5px solid #1B2E6B;align-items:start;}
.cab-emisor-nombre{font-weight:800;color:#1B2E6B;font-size:14px;text-align:center;grid-column:1 / -1;margin-bottom:4px;}
.cab-emisor-col{font-size:10px;line-height:1.4;}
.cab-emisor-col p{margin-bottom:1px;}
.cab-emisor-col strong{font-weight:700;color:#374151;}
.cab-emisor-logo{text-align:right;}
.cab-emisor-logo img{max-height:60px;max-width:120px;object-fit:contain;}
.bloque-dte{border:1px solid #6b7280;border-radius:3px;margin-bottom:8px;}
.bloque-dte-titulo{background:#e5e7eb;padding:4px 10px;text-align:center;font-weight:800;font-size:10px;letter-spacing:0.5px;color:#1a1a2e;}
.bloque-dte-subtitulo{background:#f3f4f6;padding:3px 10px;text-align:center;font-weight:700;font-size:10px;color:#374151;border-top:1px solid #e5e7eb;}
.bloque-dte-body{display:grid;grid-template-columns:140px 1fr;gap:8px;padding:8px;}
.bloque-dte-qr{display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #e5e7eb;border-radius:3px;padding:4px;background:#fff;}
.bloque-dte-qr img{width:100%;max-width:130px;height:auto;}
.bloque-dte-qr-placeholder{width:130px;height:130px;border:2px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:9px;text-align:center;padding:6px;}
.bloque-dte-info{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:9.5px;line-height:1.35;}
.bloque-dte-info > div strong{display:block;font-weight:700;color:#1a1a2e;font-size:9px;letter-spacing:0.2px;}
.bloque-dte-info > div span{color:#374151;word-break:break-all;}
.bloque-receptor{border:1px solid #6b7280;border-radius:3px;margin-bottom:8px;}
.bloque-receptor-titulo{background:#e5e7eb;padding:4px 10px;text-align:center;font-weight:800;font-size:10px;letter-spacing:0.5px;color:#1a1a2e;}
.bloque-receptor-body{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 14px;padding:8px;font-size:9.5px;line-height:1.35;}
.bloque-receptor-body > div strong{display:block;font-weight:700;font-size:9px;color:#1a1a2e;}
.bloque-receptor-body > div span{color:#374151;}
.tabla-cuerpo{border:1px solid #6b7280;border-radius:3px;overflow:hidden;margin-bottom:8px;}
.tabla-cuerpo-titulo{background:#e5e7eb;padding:4px 10px;text-align:center;font-weight:800;font-size:10px;letter-spacing:0.5px;}
table{width:100%;border-collapse:collapse;font-size:9px;}
table thead{background:#9ca3af;color:#fff;}
table thead th{padding:4px 4px;text-align:center;font-weight:700;font-size:8.5px;border-right:1px solid rgba(255,255,255,0.18);}
table thead th:last-child{border-right:none;}
table tbody td{padding:4px 4px;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;font-size:9.5px;}
table tbody td:last-child{border-right:none;}
table tbody tr:last-child td{border-bottom:none;}
table tbody tr.fila-relleno td{height:14px;padding:2px 4px;}
.td-right{text-align:right;}
.td-center{text-align:center;}
.bloque-inferior{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;}
.bloque-letras{border:1px solid #6b7280;border-radius:3px;}
.bloque-letras-titulo{background:#e5e7eb;padding:4px 10px;font-weight:800;font-size:10px;}
.bloque-letras-obs{padding:4px 10px;font-size:9.5px;border-top:1px solid #e5e7eb;line-height:1.35;}
.bloque-letras-obs strong{display:block;font-size:9px;margin-bottom:1px;}
.bloque-letras-cond{padding:4px 10px;font-size:9.5px;border-top:1px solid #e5e7eb;}
.bloque-letras-cond strong{display:block;font-size:9px;margin-bottom:1px;}
.bloque-totales{border:1px solid #6b7280;border-radius:3px;font-size:9.5px;}
.bloque-totales-fila{display:grid;grid-template-columns:1fr auto;padding:3px 10px;border-bottom:1px solid #e5e7eb;gap:8px;}
.bloque-totales-fila:last-child{border-bottom:none;background:#f3f4f6;font-weight:800;font-size:11px;}
.bloque-totales-encab{display:grid;grid-template-columns:1fr repeat(3, 70px);background:#e5e7eb;padding:3px 10px;font-weight:700;font-size:8.5px;text-align:right;gap:6px;}
.bloque-totales-encab > div:first-child{text-align:left;}
.bloque-totales-encab-row{display:grid;grid-template-columns:1fr repeat(3, 70px);padding:3px 10px;font-size:9.5px;text-align:right;border-bottom:1px solid #e5e7eb;gap:6px;}
.bloque-totales-encab-row > div:first-child{text-align:left;font-weight:600;}
.pie-mh{margin-top:6px;padding:5px 10px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:3px;font-size:8.5px;color:#475569;text-align:center;line-height:1.4;}
.pie-mh strong{color:#1B2E6B;}
@media print {
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  @page{size:A4;margin:0;}
  .page{padding:14mm 8mm 6mm 8mm;}
  .bloque-dte, .bloque-receptor, .tabla-cuerpo, .bloque-inferior { page-break-inside: avoid; break-inside: avoid; }
  table thead { display: table-header-group; }
  table tbody tr { page-break-inside: avoid; break-inside: avoid; }
}
</style>
</head>
<body>
${esAnulada ? '<div class="watermark">INVALIDADO</div>' : ''}
${ambiente === '00' ? '<div class="watermark" style="font-size:90px;color:rgba(245,158,11,0.18);">AMBIENTE PRUEBAS</div>' : ''}

<div class="page contenido">

  <div class="cab-rotulo">
    <div><span><strong>EMISIÓN:</strong> ${fechaHoraGen}</span></div>
    <div style="display:flex;gap:14px;"><span><strong>${nombreTipo.toUpperCase()}</strong></span><span><strong>N°:</strong> ${f.numeroControl || f.numero || '—'}</span></div>
  </div>

  <div class="cab-emisor">
    <div class="cab-emisor-nombre">${empresa.empresaNombre || 'Mi Empresa'}</div>
    <div class="cab-emisor-col">
      <p><strong>Nombre o Razón Social:</strong> ${empresa.empresaNombre || '—'}</p>
      <p><strong>Actividad Económica:</strong> ${empresa.descActividad || empresa.actividadEconomica || '—'}</p>
      <p><strong>NIT:</strong> ${empresa.nit || '—'} &nbsp; <strong>NRC:</strong> ${empresa.nrc || '—'}</p>
      <p><strong>Correo:</strong> ${empresa.correo || empresa.email || '—'}</p>
      <p><strong>Teléfono:</strong> ${empresa.telefono || '—'}</p>
    </div>
    <div class="cab-emisor-col">
      <p><strong>Dirección:</strong> ${empresa.direccion || empresa.complemento || '—'}</p>
      <p><strong>Distrito:</strong> ${empresa.distrito || '—'}</p>
      <p><strong>Municipio:</strong> ${empresa.municipio || '—'}</p>
      <p><strong>Departamento:</strong> ${empresa.departamento || '—'}</p>
      <p><strong>Casa Matriz/Sucursal:</strong> ${empresa.codEstableMH || 'S001'} &nbsp; <strong>Punto de Venta:</strong> ${empresa.codPuntoVentaMH || 'P001'}</p>
    </div>
    <div class="cab-emisor-logo">
      ${empresa.logoUrl ? `<img src="${empresa.logoUrl}" onerror="this.style.display='none'"/>` : ''}
    </div>
  </div>

  <div class="bloque-dte">
    <div class="bloque-dte-titulo">DOCUMENTO TRIBUTARIO ELECTRÓNICO</div>
    <div class="bloque-dte-subtitulo">${nombreTipo.toUpperCase()}</div>
    <div class="bloque-dte-body">
      <div class="bloque-dte-qr">
        ${qrDataURL
          ? `<img src="${qrDataURL}" alt="QR de consulta MH"/>`
          : `<div class="bloque-dte-qr-placeholder">QR disponible<br/>al procesar<br/>en el MH</div>`
        }
      </div>
      <div class="bloque-dte-info">
        <div><strong>Modelo de Facturación:</strong><span>${f.dte_modelo === 2 ? 'MODELO FACTURACIÓN DIFERIDO (CONTINGENCIA)' : 'MODELO FACTURACIÓN PREVIO'}</span></div>
        <div><strong>Tipo de Transmisión:</strong><span>${f.dte_modelo === 2 ? 'TRANSMISIÓN CONTINGENCIA' : 'TRANSMISIÓN NORMAL'}</span></div>
        <div><strong>Fecha y Hora de Generación:</strong><span>${fechaHoraGen}</span></div>
        <div><strong>Versión del JSON:</strong><span>${VERSION_JSON[tipoNum] || ''}</span></div>
        <div><strong>Código de Generación:</strong><span style="font-family:monospace;font-size:10px">${f.codigoGeneracion || '—'}</span></div>
        <div><strong>Ambiente:</strong><span>${ambienteTexto}</span></div>
        <div><strong>Número de Control:</strong><span style="font-family:monospace;font-size:10px">${f.numeroControl || f.numero || '—'}</span></div>
        <div><strong>Sello de Recepción:</strong><span style="font-family:monospace;font-size:9.5px">${f.dte_sello || (esProcesado ? '—' : 'Pendiente de transmisión')}</span></div>
      </div>
    </div>
  </div>

  <div class="bloque-receptor">
    <div class="bloque-receptor-titulo">RECEPTOR</div>
    <div class="bloque-receptor-body">
      <div><strong>Nombre o Razón Social:</strong><span>${f.cliente || 'Consumidor Final'}</span></div>
      <div><strong>Tipo de Documento:</strong><span>${f.nit ? 'NIT' : f.dui ? 'DUI' : '—'}</span></div>
      <div><strong>N° Documento:</strong><span style="font-family:monospace">${f.nit || f.dui || '—'}</span></div>
      <div><strong>Actividad Económica:</strong><span>${f.descActividad || f.actividad || '—'}</span></div>
      <div><strong>Dirección:</strong><span>${(typeof f.direccion === 'object' ? f.direccion?.complemento : f.direccion) || f.complemento || '—'}</span></div>
      <div><strong>Correo Electrónico:</strong><span>${f.email || f.correo || '—'}</span></div>
      <div><strong>NRC:</strong><span>${f.nrc || '—'}</span></div>
      <div><strong>Teléfono:</strong><span>${f.telefono || '—'}</span></div>
      <div></div>
    </div>
  </div>

  <div class="tabla-cuerpo">
    <div class="tabla-cuerpo-titulo">CUERPO DEL DOCUMENTO</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px;">N°</th>
          <th style="width:50px;">Cant.</th>
          <th style="width:60px;">Unidad</th>
          <th>Descripción</th>
          <th style="width:75px;">Precio Unitario</th>
          <th style="width:70px;">Descuento por Ítem</th>
          <th style="width:70px;">Otros Montos No Afectos</th>
          <th style="width:70px;">Ventas No Sujetas</th>
          <th style="width:65px;">Ventas Exentas</th>
          <th style="width:70px;">Ventas Gravadas</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, i) => {
          const cant = parseFloat(item.qty || item.cantidad || 1)
          const precio = parseFloat(item.precioBase || item.precioUni || 0)
          const desc = parseFloat(item.descuento || item.montoDescu || 0)
          const ventaNoSuj = parseFloat(item.ventaNoSuj || 0)
          const ventaExenta = parseFloat(item.ventaExenta || 0)
          const ventaGravada = item.ventaGravada !== undefined
            ? parseFloat(item.ventaGravada)
            : ((precio * cant) - desc)
          const noGravado = parseFloat(item.noGravado || 0)
          return `
          <tr>
            <td class="td-center">${i + 1}</td>
            <td class="td-center">${cant.toFixed(2)}</td>
            <td class="td-center">Unidad</td>
            <td>${item.nombre || item.descripcion || '—'}</td>
            <td class="td-right">${fmt(precio)}</td>
            <td class="td-right">${fmt(desc)}</td>
            <td class="td-right">${fmt(noGravado)}</td>
            <td class="td-right">${fmt(ventaNoSuj)}</td>
            <td class="td-right">${fmt(ventaExenta)}</td>
            <td class="td-right">${fmt(ventaGravada)}</td>
          </tr>`
        }).join('')}
        ${Array.from({ length: Math.max(0, 8 - items.length) }).map(() => `
          <tr class="fila-relleno">
            <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="bloque-inferior">
    <div class="bloque-letras">
      <div class="bloque-letras-titulo">Total en Letras: ${totalLetras}</div>
      <div class="bloque-letras-obs"><strong>Observaciones:</strong>${f.observaciones || f.notas || '—'}</div>
      <div class="bloque-letras-cond"><strong>Condición de la Operación:</strong>${f.tipoPago === 'credito' ? 'CRÉDITO' : 'CONTADO'}</div>
    </div>
    <div class="bloque-totales">
      <div class="bloque-totales-encab">
        <div>Total Operaciones</div><div>No Sujetas</div><div>Exentas</div><div>Gravadas</div>
      </div>
      <div class="bloque-totales-encab-row">
        <div>Sumatoria de Ventas</div>
        <div>${fmt(totalNoSuj)}</div>
        <div>${fmt(totalExenta)}</div>
        <div>${fmt(totalGravada)}</div>
      </div>
      <div class="bloque-totales-fila"><span>Monto Global Descuento, Bonificaciones, Rebajas a Ventas No Sujetas:</span><span>${fmt(descuNoSuj)}</span></div>
      <div class="bloque-totales-fila"><span>Monto Global Descuento, Bonificaciones, Rebajas a Ventas Exentas:</span><span>${fmt(descuExenta)}</span></div>
      <div class="bloque-totales-fila"><span>Monto Global Descuento, Bonificaciones, Rebajas a Ventas Gravadas:</span><span>${fmt(descuGravada)}</span></div>
      <div class="bloque-totales-fila"><span>Sub Total:</span><span>${fmt(subTotal)}</span></div>
      <div class="bloque-totales-fila"><span>IVA 13%:</span><span>${fmt(ivaCalculado)}</span></div>
      <div class="bloque-totales-fila"><span>(-) IVA Retenido:</span><span>${fmt(ivaRete1)}</span></div>
      <div class="bloque-totales-fila"><span>(-) Retención Renta:</span><span>${fmt(reteRenta)}</span></div>
      <div class="bloque-totales-fila"><span>Monto Total de la Operación:</span><span>${fmt(montoTotalOperacion)}</span></div>
      <div class="bloque-totales-fila"><span>Total Otros Montos No Afectos:</span><span>${fmt(totalNoGravado)}</span></div>
      <div class="bloque-totales-fila"><span>Total a Pagar:</span><span>${fmt(totalPagar)}</span></div>
    </div>
  </div>

  <div class="pie-mh">
    <p>Documento generado electrónicamente. La validez de este DTE puede verificarse en el sitio web del Ministerio de Hacienda escaneando el código QR superior o visitando:</p>
    <p style="margin-top:4px;font-family:monospace;font-size:9px;word-break:break-all;color:#1B2E6B;"><strong>${urlConsulta}</strong></p>
    <p style="margin-top:6px;">Generado con <strong>ORIÓN</strong> · ONE GEO SYSTEMS</p>
  </div>

</div>
</body>
</html>`
}

// ════════════════════════════════════════════════════════════════════
// TICKET TÉRMICO 80mm — Con QR del MH y datos oficiales
// ════════════════════════════════════════════════════════════════════
export const generarTicket = async (f, empresa = {}) => {
  const nombreTipo = NOMBRE_DTE[f.tipoDte] || f.tipoDte
  const esAnulada = f.estadoPago === 'anulada' || f.anulada
  const esProcesado = f.dte_estado === 'PROCESADO'
  const ambiente = f.dte_ambiente || '00'

  const urlConsulta = buildUrlConsultaMH(f)
  const qrDataURL = esProcesado ? await generarQRDataURL(urlConsulta) : null

  const resOf = extraerResumenOficial(f)
  const subTotal = resOf?.subTotal ?? (f.subtotal || 0)
  const ivaCalculado = resOf?.ivaTributo || resOf?.totalIva || (f.iva || 0)
  const ivaRete1 = resOf?.ivaRete1 ?? 0
  const reteRenta = resOf?.reteRenta ?? 0
  const totalPagar = resOf?.totalPagar ?? (f.total || 0)

  const horaGen = f.createdAt?.seconds
    ? new Date(f.createdAt.seconds * 1000).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', hour12: false })
    : ''

  const items = (f.items && f.items.length > 0) ? f.items : [{
    nombre: f.descripcion || 'Productos/Servicios',
    qty: 1, precioBase: f.subtotal || 0
  }]

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Ticket ${f.numero || f.numeroControl || ''}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html, body { background: #e5e7eb; }
body{font-family:'Courier New',monospace;width:72mm;font-size:11px;color:#000;padding:3mm;line-height:1.35;background:#fff;margin:24px auto;box-shadow:0 6px 24px rgba(0,0,0,0.15);min-height:auto;border-radius:2px;}
.c{text-align:center;}
.b{font-weight:bold;}
.sep{border-top:1px dashed #000;margin:4px 0;}
.sep2{border-top:2px solid #000;margin:5px 0;}
.empresa{font-size:13px;font-weight:900;text-align:center;letter-spacing:0.5px;}
.empresa-sub{font-size:10px;text-align:center;line-height:1.4;}
.dte-titulo{text-align:center;font-weight:900;font-size:12px;padding:3px;border:1.5px solid #000;margin:4px 0;letter-spacing:0.5px;}
.row{display:flex;justify-content:space-between;gap:8px;font-size:10.5px;margin:1px 0;}
.row .lbl{font-weight:700;}
.row .val{text-align:right;word-break:break-all;}
.row-mono{font-family:'Courier New',monospace;font-size:9.5px;}
.bloque-titulo{font-size:10px;font-weight:900;text-align:center;background:#000;color:#fff;padding:2px;letter-spacing:0.5px;margin:4px 0 2px;}
.item{margin:3px 0;}
.item-nombre{font-size:10.5px;font-weight:600;}
.item-detalle{display:flex;justify-content:space-between;font-size:10px;color:#333;}
.tot-row{display:flex;justify-content:space-between;font-size:11px;margin:1px 0;}
.tot-row.fin{font-size:14px;font-weight:900;border-top:2px solid #000;padding-top:4px;margin-top:3px;}
.qr-box{text-align:center;margin:6px 0;}
.qr-box img{width:42mm;max-width:100%;}
.qr-leyenda{font-size:9px;text-align:center;margin-top:2px;line-height:1.3;}
.pie{font-size:9.5px;text-align:center;color:#000;line-height:1.4;}
.anulado{border:2px solid #000;text-align:center;font-weight:900;padding:5px;margin:4px 0;font-size:14px;letter-spacing:1px;}
.ambiente-prueba{background:#000;color:#fff;text-align:center;font-weight:900;padding:2px;font-size:10px;letter-spacing:1px;margin-bottom:4px;}
@media print {
  @page{margin:0;size:80mm auto;}
  html, body { background: #fff !important; }
  body{padding:2mm;margin:0;box-shadow:none;border-radius:0;}
}
</style>
</head>
<body>
${ambiente === '00' ? '<div class="ambiente-prueba">*** AMBIENTE DE PRUEBAS ***</div>' : ''}
${esAnulada ? '<div class="anulado">*** DOCUMENTO ANULADO ***</div>' : ''}

<div class="empresa">${empresa.empresaNombre || 'Mi Empresa'}</div>
<div class="empresa-sub">${empresa.direccion || ''}</div>
<div class="empresa-sub">NIT: ${empresa.nit || '—'} | NRC: ${empresa.nrc || '—'}</div>
${empresa.telefono ? `<div class="empresa-sub">Tel: ${empresa.telefono}</div>` : ''}
${empresa.correo || empresa.email ? `<div class="empresa-sub">${empresa.correo || empresa.email}</div>` : ''}

<div class="dte-titulo">${nombreTipo.toUpperCase()}</div>

<div class="bloque-titulo">DATOS DEL DOCUMENTO</div>
<div class="row"><span class="lbl">Fecha:</span><span class="val">${formatFecha(f.fechaEmision)}${horaGen ? ' ' + horaGen : ''}</span></div>
<div class="row row-mono"><span class="lbl">No. Control:</span><span class="val">${f.numeroControl || f.numero || '—'}</span></div>
<div class="row row-mono"><span class="lbl">Cod. Gen:</span><span class="val">${f.codigoGeneracion || '—'}</span></div>
${f.dte_sello ? `<div class="row row-mono"><span class="lbl">Sello MH:</span><span class="val">${f.dte_sello}</span></div>` : ''}

<div class="bloque-titulo">CLIENTE</div>
<div class="row"><span class="lbl">Nombre:</span><span class="val">${f.cliente || 'Consumidor Final'}</span></div>
${f.nit ? `<div class="row"><span class="lbl">NIT:</span><span class="val">${f.nit}</span></div>` : ''}
${f.dui ? `<div class="row"><span class="lbl">DUI:</span><span class="val">${f.dui}</span></div>` : ''}
${f.telefono ? `<div class="row"><span class="lbl">Tel:</span><span class="val">${f.telefono}</span></div>` : ''}

<div class="bloque-titulo">DETALLE</div>
${items.map((item, i) => {
  const cant = parseFloat(item.qty || item.cantidad || 1)
  const precio = parseFloat(item.precioConIva || item.precioBase || item.precioUni || 0)
  const total = precio * cant
  return `
  <div class="item">
    <div class="item-nombre">${i + 1}. ${item.nombre || item.descripcion || '—'}</div>
    <div class="item-detalle">
      <span>${cant.toFixed(2)} x ${fmt(precio)}</span>
      <span><strong>${fmt(total)}</strong></span>
    </div>
  </div>`
}).join('')}

<div class="sep"></div>

<div class="tot-row"><span>Sub Total:</span><span>${fmt(subTotal)}</span></div>
<div class="tot-row"><span>IVA 13%:</span><span>${fmt(ivaCalculado)}</span></div>
${ivaRete1 > 0 ? `<div class="tot-row"><span>(-) IVA Retenido:</span><span>${fmt(ivaRete1)}</span></div>` : ''}
${reteRenta > 0 ? `<div class="tot-row"><span>(-) Ret. Renta:</span><span>${fmt(reteRenta)}</span></div>` : ''}
<div class="tot-row fin"><span>TOTAL:</span><span>${fmt(totalPagar)}</span></div>

<div class="sep"></div>
<div class="c" style="font-size:10px">Pago: <strong>${f.tipoPago === 'credito' ? 'CRÉDITO' : 'CONTADO'}</strong></div>
${f.efectivoRecibido ? `
<div class="row"><span>Recibido:</span><span>${fmt(parseFloat(f.efectivoRecibido))}</span></div>
<div class="row"><span>Vuelto:</span><span>${fmt(parseFloat(f.efectivoRecibido) - totalPagar)}</span></div>
` : ''}

${qrDataURL ? `
<div class="qr-box">
  <img src="${qrDataURL}" alt="QR validación MH"/>
  <div class="qr-leyenda">Escanee para validar en el MH</div>
</div>
` : ''}

<div class="sep2"></div>
<div class="pie">¡Gracias por su compra!</div>
<div class="pie" style="margin-top:3px">Documento generado electrónicamente</div>
<div class="pie">Conforme al MH El Salvador</div>
<div class="pie" style="margin-top:4px"><strong>ORIÓN</strong> · ONE GEO SYSTEMS</div>

<div style="margin-top:8mm"></div>
</body>
</html>`
}

// ════════════════════════════════════════════════════════════════════
// IMPRESIÓN DIRECTA — Para uso en POS (sin preview, rápido)
// ════════════════════════════════════════════════════════════════════
export const imprimirIframe = (html) => {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;'
  document.body.appendChild(iframe)
  iframe.contentDocument.open()
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 800)
  }
}
