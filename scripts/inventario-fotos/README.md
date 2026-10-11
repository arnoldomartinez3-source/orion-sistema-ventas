# Tandas de fotos de la cajera → Excel de inventario (Super Lácteos)

Método usado del 3 al 10 de octubre de 2026. Todo es local; no escribe nada en Firestore.

Archivo de trabajo: `Descargas\produc\INVENTARIO ORION + fotos 3-oct.xlsx` (hoja `productos`).
Archivo del dueño: `Descargas\produc\PRECIOS para revisar (con codigo de barras) - Super Lacteos.xlsx`.

## Pasos

1. **Descomprimir y numerar** las fotos nuevas en una carpeta `fotos/nuevas/1.jpeg … N.jpeg`
   (quitar las repetidas comparando md5 contra las tandas anteriores).
2. `node leer-fotos.mjs fotos/nuevas` → lee los códigos con ZXing (Chrome sin interfaz, varias
   rotaciones) y arma hojas de contacto de 6 fotos en `fotos/hojas/hoja-NN.png`. Lee ~1/3; el resto
   se lee a ojo en las hojas y, si hace falta, en la foto original.
3. Escribir `datos-fotos.mjs` (ver `datos-fotos.ejemplo.mjs`):
   - `ACTUALIZAR`: `[códigoInterno, nombreViejoExacto, nombreNuevo, barras, notaExtra]` → renombra y
     pone código a un producto existente (buscar el código interno con `node ver-inv.mjs "NOMBRE|OTRO"`).
   - `NOTAS`: códigos internos de genéricos que se separaron por variante (reciben la nota `SEP`).
   - `NUEVOS`: `[nombre, categoría, precioConIva o '', barras, nota]` → filas nuevas con el siguiente P###.
   Reglas: sabores/variantes son filas NUEVAS; el genérico queda con nota hasta que el dueño confirme;
   precio del genérico con "confirmar" o `FALTA PRECIO`; validar el dígito verificador (el script lo exige);
   un código adivinado se descarta (mejor sin código que mal).
4. `node excel-fotos.mjs` (solo valida) y `node excel-fotos.mjs escribir` (hace respaldo "(antes de AAAA-MM-DD)",
   escribe y verifica que no haya barras ni internos repetidos).
5. `node precios-3hojas.mjs` → regenera el archivo del dueño: hoja PRECIOS (las 244 originales),
   NUEVOS CON CODIGO (con columna "Fotos del") y SIN CODIGO (ordenada SI / TAL VEZ / NO según
   `clasif-sincodigo.mjs`).

Requisitos: `xlsx` y `playwright-core` del `node_modules` del repo, Chrome instalado.
