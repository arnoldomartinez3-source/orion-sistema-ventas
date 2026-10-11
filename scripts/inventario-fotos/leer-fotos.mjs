// Lee los códigos de barras de las fotos (ZXing en un Chrome sin interfaz) y arma hojas de contacto numeradas.
import { chromium } from 'file:///C:/Users/geova/mi-sistema-ventas/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import path from 'node:path'
const BASE = process.argv[2] || 'fotos/nuevas' // carpeta con las fotos numeradas 1.jpeg… (ver README)
const hora = (n) => parseFloat(n) || 0
const fotos = []
for (const carpeta of ['.']) for (const f of fs.readdirSync(`${BASE}/${carpeta}`)) if (/\.jpe?g$/i.test(f)) fotos.push({ carpeta, f, t: hora(f) })
fotos.sort((a, b) => a.carpeta.localeCompare(b.carpeta) || a.t - b.t)
fotos.forEach((x, i) => { x.n = i + 1 })
console.log('fotos:', fotos.length)

const zxing = fs.readFileSync('C:/Users/geova/mi-sistema-ventas/node_modules/@zxing/library/umd/index.min.js', 'utf8')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } })
await page.setContent('<html><body style="margin:0;background:#fff"></body></html>')
await page.addScriptTag({ content: zxing })
const okEAN = (s) => { const d = s.padStart(13, '0').split('').map(Number); const sum = d.slice(0, 12).reduce((a, x, i) => a + x * (i % 2 ? 3 : 1), 0); return (10 - sum % 10) % 10 === d[12] }

for (const x of fotos) {
  const b64 = fs.readFileSync(`${BASE}/${x.carpeta}/${x.f}`).toString('base64')
  x.codigo = await page.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode()
    const hints = new Map(); hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_E]); hints.set(ZXing.DecodeHintType.TRY_HARDER, true)
    const reader = new ZXing.MultiFormatReader(); reader.setHints(hints)
    // varias rotaciones y escalas: las etiquetas vienen de lado y a distintas distancias
    for (const esc of [1, 0.6]) for (const rot of [0, 90, 45, 135, 20, 70]) {
      const c = document.createElement('canvas'); const r = rot * Math.PI / 180
      const w = img.naturalWidth * esc, h = img.naturalHeight * esc
      c.width = Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r)); c.height = Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r))
      const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate(r); g.drawImage(img, -w / 2, -h / 2, w, h)
      const d = g.getImageData(0, 0, c.width, c.height)
      const lum = new Uint8ClampedArray(c.width * c.height)
      for (let i = 0; i < lum.length; i++) lum[i] = (d.data[i * 4] * 299 + d.data[i * 4 + 1] * 587 + d.data[i * 4 + 2] * 114) / 1000
      const src2 = new ZXing.RGBLuminanceSource(lum, c.width, c.height)
      for (const Bin of [ZXing.HybridBinarizer, ZXing.GlobalHistogramBinarizer]) {
        try { return reader.decode(new ZXing.BinaryBitmap(new Bin(src2))).getText() } catch { /* siguiente intento */ }
      }
    }
    return ''
  }, 'data:image/jpeg;base64,' + b64)
  if (x.codigo && !okEAN(x.codigo)) x.codigo = '?' + x.codigo
}
console.log('con código leído:', fotos.filter(x => x.codigo).length)

// Hojas de contacto: 6 fotos por hoja (3 x 2), con el número de foto y el código leído
fs.mkdirSync('fotos/hojas', { recursive: true })
for (let i = 0, h = 1; i < fotos.length; i += 6, h++) {
  const grupo = fotos.slice(i, i + 6)
  const html = `<html><body style="margin:0;background:#fff;font:700 15px Arial"><div style="display:grid;grid-template-columns:repeat(3,430px);gap:4px;padding:2px">${grupo.map(x =>
    `<div style="position:relative;height:445px;overflow:hidden;background:#000"><img src="data:image/jpeg;base64,${fs.readFileSync(`${BASE}/${x.carpeta}/${x.f}`).toString('base64')}" style="width:430px;height:445px;object-fit:contain"><div style="position:absolute;left:0;top:0;background:#ff0;color:#000;padding:2px 6px">#${x.n}${x.codigo ? ' · ' + x.codigo : ''}</div></div>`).join('')}</div></body></html>`
  await page.setContent(html); await page.waitForTimeout(250)
  await page.screenshot({ path: `fotos/hojas/hoja-${String(h).padStart(2, '0')}.png`, clip: { x: 0, y: 0, width: 1300, height: 898 } })
}
await browser.close()
fs.writeFileSync('fotos/fotos.json', JSON.stringify(fotos, null, 1))
console.log(fotos.map(x => `${x.n}:${x.codigo || '-'}`).join('  '))
