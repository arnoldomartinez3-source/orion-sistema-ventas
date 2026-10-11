---
name: tanda-fotos
description: Procesar una tanda nueva de fotos de productos (códigos de barras) de la cajera de Super Lácteos y volcarla al Excel de inventario con los scripts de scripts/inventario-fotos. Úsalo cuando el usuario diga "llegaron fotos", "tanda nueva", "las fotos de la cajera", "actualiza el Excel de Super Lácteos" o comparta un zip/carpeta de fotos de productos.
argument-hint: [carpeta o zip con las fotos]
---

# /tanda-fotos — fotos de la cajera → Excel de inventario (Super Lácteos)

Todo es LOCAL: nada se escribe en Firestore. Los scripts viven en `scripts/inventario-fotos/` y el método
completo está en su `README.md` (leerlo si algo de aquí no cuadra). Requiere `xlsx` y `playwright-core`
del `node_modules` del repo y Chrome instalado. Correr los scripts desde `scripts/inventario-fotos/`.

Archivos:
- Trabajo: `Downloads\produc\INVENTARIO ORION + fotos 3-oct.xlsx` (hoja `productos`).
- Del dueño: `Downloads\produc\PRECIOS para revisar (con codigo de barras) - Super Lacteos.xlsx`.
- Plantilla de datos: `datos-fotos.ejemplo.mjs` (la tanda del 10-oct).

## Paso 1 — Preparar las fotos
1. Descomprimir en una carpeta nueva y vacía (p. ej. `fotos/nuevas/`), fuera de los scripts.
2. Quitar repetidas comparando md5 contra las tandas anteriores (`fotos/` de tandas previas).
3. Renumerar `1.jpeg … N.jpeg`. Decir al usuario cuántas fotos nuevas quedaron.

## Paso 2 — Leer códigos
```powershell
node leer-fotos.mjs fotos/nuevas
```
Lee ~1/3 con ZXing (varias rotaciones) y arma hojas de contacto de 6 fotos en `fotos/hojas/hoja-NN.png`.
El resto se lee A OJO con la herramienta Read sobre las hojas y, si hace falta, sobre la foto original.
Anotar por foto: nombre visible, presentación, código leído (o "ilegible").

## Paso 3 — Escribir `datos-fotos.mjs` (copiar del ejemplo)
- `ACTUALIZAR`: `[códigoInterno, nombreViejoExacto, nombreNuevo, barras, notaExtra]` → renombra y pone
  código a un producto existente. Buscar el interno con `node ver-inv.mjs "NOMBRE|OTRO"`.
- `NOTAS`: internos de genéricos que se separaron por variante (reciben la nota `SEP`).
- `NUEVOS`: `[nombre, categoría, precioConIva o '', barras, nota]` → filas nuevas con el siguiente P###.

Reglas del usuario (no negociables):
- Sabores y variantes son filas NUEVAS; el genérico se queda con nota hasta que el dueño confirme.
- Los precios salen del archivo del dueño; si no hay, `FALTA PRECIO` o "confirmar". No inventar precios.
- Nombres en MAYÚSCULAS, como el resto del catálogo.
- Validar el dígito verificador del EAN (el script lo exige). Un código adivinado o dudoso se DESCARTA:
  mejor sin código que mal.
- Código interno P### aparte del EAN (`codigoBarras`); nunca reutilizar un P###.

## Paso 4 — Validar y escribir
```powershell
node excel-fotos.mjs            # solo valida
node excel-fotos.mjs escribir   # respaldo "(antes de AAAA-MM-DD)", escribe y verifica sin repetidos
```
Si la validación marca barras o internos repetidos, corregir `datos-fotos.mjs`; no forzar.

## Paso 5 — Regenerar el archivo del dueño
```powershell
node precios-3hojas.mjs
```
Hojas: PRECIOS (las 244 originales), NUEVOS CON CODIGO (columna "Fotos del"), SIN CODIGO (SI / TAL VEZ / NO
según `clasif-sincodigo.mjs`).

## Informe final (corto)
Tabla con: fotos procesadas, actualizados, nuevos, sin precio, por confirmar con el dueño, códigos descartados.
Luego una sola pregunta si queda algo que decidir (p. ej. un genérico a separar).
