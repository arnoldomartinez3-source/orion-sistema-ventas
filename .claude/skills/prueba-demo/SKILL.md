---
name: prueba-demo
description: Prueba de humo de ORIÓN en la empresa DEMO (ferretería) con el dev server local y el perfil de Chrome con sesión guardada - las 14 funciones responden JSON, una venta real por el POS y, si aplica, el login con PIN. Úsalo cuando el usuario diga "prueba en DEMO", "corre las pruebas", "¿sigue funcionando?", después de un deploy o antes de un push.
argument-hint: [qué flujo extra probar]
---

# /prueba-demo — humo en DEMO

Empresa DEMO = ferretería, usuario `arnoldomartinez3+ferreteria@gmail.com` (NO maestro). Sesión ya
guardada en el perfil de Chrome `C:\Users\geova\.orion-pruebas\chrome-profile` (variable `ORION_PERFIL`
para otro path). Los scripts están en `scripts/pruebas-demo/` y esperan el dev server en
`http://localhost:5173`. Correr desde la raíz del repo. Nunca tocar empresas de clientes.

## Paso 1 — Dev server
```powershell
npm run dev -- --port 5173
```
En segundo plano; esperar a que Vite diga "ready" antes de correr scripts (los scripts reintentan 20 veces).

## Paso 2 — Las funciones responden
```powershell
node scripts/pruebas-demo/humo-functions.mjs    # 8 funciones con cors:true, desde el navegador
node scripts/pruebas-demo/humo-functions2.mjs   # 6 sin cors, desde Node con el token de la sesión
```
Lectura: `OK` = responde JSON con status < 500 (400/403/404 por cuerpo incompleto es correcto).
`REVISAR` = 500 o HTML → la función no cargó; ver `firebase functions:log` en `functions/`.
Apuntan a `https://app.orionsv.net`, o sea a las funciones YA DESPLEGADAS, no al código local.

## Paso 3 — Una venta real por el POS
```powershell
node scripts/pruebas-demo/prueba-vuelto-final.mjs
```
Paga $5 un tornillo de $0.17; imprime el bloque de vuelto y los `pageerror`. Deja captura en
`shots-pc/vuelto-final.png` (crear la carpeta antes si no existe; leerla con Read para confirmar que la
pantalla dibujó la venta). Abre Chrome visible (`headless: false`); no estorbar la ventana mientras corre.

## Paso 4 — Pantalla dibujada (si se tocó App/Dashboard/Permisos/Auth)
Script corto de Playwright con el mismo perfil: ir a `/`, esperar `.sidebar`, leer `innerText` del
contenido principal y confirmar que tiene texto del Dashboard. Si está vacío = pantalla en blanco (TDZ u
otro error de carga), aunque no haya excepción visible.

## Paso 5 — Login con PIN (solo si se tocó Login, AuthContext, PermisosContext o reglas de sesiones)
Manual o con Playwright en un contexto SIN perfil: abrir `/login`, entrar con el PIN de un empleado de DEMO
(pedirlo al usuario si no está en el chat), verificar nombre y rol en el encabezado, cerrar sesión y
confirmar que `sesiones_empleado/{uid}` desaparece. No hay script guardado para esto.

## Extras disponibles (según el cambio)
- `prueba-correlativo.mjs` / `test-correlativo.mjs`: contador por empresa (base simulada).
- `prueba-foto-vivo.mjs` / `prueba-reglas-foto.mjs`: Foto Captura y sus reglas.
- `barrido-secretos.mjs`: ninguna empresa expone secretos del MH.

## Informe final
Tabla corta: prueba | resultado | detalle en 5 palabras. Después, qué falló con la salida tal cual.
Si todo pasó, decirlo en una línea; no inventar resultados de pruebas que no se corrieron.
