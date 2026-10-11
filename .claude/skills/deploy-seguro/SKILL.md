---
name: deploy-seguro
description: Procedimiento obligatorio de ORIÓN antes de tocar producción (push a main, firestore.rules, storage.rules, functions/transmitir.js o cualquier deploy). Anuncia el cambio, lint + build, prueba en DEMO, commit en main, da los comandos de deploy al usuario y verifica después. Úsalo cuando el usuario pida "sube esto", "haz push", "despliega", "deploy", "pasa a producción" o cuando el cambio toque reglas/functions.
argument-hint: [qué se va a desplegar]
---

# /deploy-seguro — llevar un cambio de ORIÓN a producción sin sorpresas

ORIÓN es UN solo proyecto Firebase (`mi-sistema-ventas-7e541`) para TODOS los clientes: un error en producción
afecta a todos a la vez. No hay ramas ni PR: se trabaja en `main`, el hosting se publica solo con el push.
Reglas y functions NO se despliegan solas: las despliega el usuario con los comandos que le doy.

## Antes de empezar: decir QUÉ y POR QUÉ
Escribir en una o dos frases qué archivos se van a tocar o desplegar y por qué, ANTES de editar
`functions/transmitir.js`, `firestore.rules`, `storage.rules` o pedir un deploy. Si surge una duda de si algo
es de ORIÓN o de otro proyecto (Clínica, Tallaje), parar y confirmar: solo cuenta lo que está en este repo.

## Paso 1 — Lint y build (desde la raíz del repo)
```powershell
npx eslint <archivos tocados>
npm run build
```
Si tocaste `functions/`, además desde `functions/`:
```powershell
node --input-type=module -e "import('./index.js').then(()=>console.log('index carga OK')).catch(e=>console.log('FALLO:',e.message))"
```

## Paso 2 — Probar en DEMO (empresa ferretería, usuario arnoldomartinez3+ferreteria@gmail.com, no maestro)
1. Dev server: `npm run dev -- --port 5173` (en segundo plano).
2. Correr `/prueba-demo` (o directamente `node scripts/pruebas-demo/humo-functions.mjs` y
   `humo-functions2.mjs`; una venta con `prueba-vuelto-final.mjs`).
3. Si tocaste `App.jsx`, `Dashboard`, `PermisosContext` o `AuthContext`: cargar `/` con Playwright
   (perfil `C:\Users\geova\.orion-pruebas\chrome-profile`, variable `ORION_PERFIL`) y verificar que la
   pantalla DIBUJÓ contenido real (`.sidebar` visible + texto del Dashboard), no solo que no hubo error.
   Una pantalla en blanco por TDZ ya llegó a producción una vez; `PantallaError` es la red, no la prueba.
4. Nunca escribir datos en empresas de clientes: las pruebas solo tocan DEMO.

## Paso 3 — Commit en main y push
```powershell
git add <archivos>
git commit -m "<área>: <qué cambió en una línea en español>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```
El push publica el hosting solo (GitHub Actions → Firebase Hosting). Avisar al usuario qué probar
en https://app.orionsv.net cuando termine el Action (~3 min); el aviso "Hay una versión nueva" aparece solo.

## Paso 4 — Si hay reglas, storage o functions: dar los comandos (los ejecuta el usuario)
```powershell
firebase deploy --only firestore:rules
firebase deploy --only storage
cd functions
$env:FUNCTIONS_DISCOVERY_TIMEOUT="60"; firebase deploy --only functions:<nombre>
```
- Desplegar solo la función tocada (`functions:transmitir`, `functions:enviarFactura`, …), no todas.
- Una función que responde HTML en vez de JSON = no cargó: revisar `firebase functions:log` y que el
  invoker de Cloud Run sea público.
- `transmitir` tiene `minInstances` apagado a propósito (sin cliente real transmitiendo al MH); no encenderlo
  sin que el usuario lo pida.

## Paso 5 — Después del deploy
1. `node scripts/pruebas-demo/humo-functions.mjs` y `humo-functions2.mjs`: todas las funciones deben
   responder JSON con status < 500.
2. Probar en DEMO el flujo que cambió (venta, factura, lo que aplique).
3. Si falló algo: decirlo con la salida tal cual; no reportar como hecho lo que no se verificó.

## Paso 6 — Memoria
Actualizar la memoria del proyecto (`~/.claude/projects/c--Users-geova-mi-sistema-ventas/memory/`) con lo
que quedó DESPLEGADO y la fecha absoluta; si algo quedó pendiente de deploy por el usuario, anotarlo así.

## Informe final al usuario (corto, es su preferencia)
- Qué se subió y a dónde (hosting solo / reglas / función X).
- Qué comandos le tocan a él, si alguno.
- Qué probar en DEMO, en 2 o 3 viñetas.
