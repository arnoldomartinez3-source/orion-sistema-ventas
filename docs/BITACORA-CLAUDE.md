# Bitácora de trabajo — ORIÓN (asistido por Claude Code)

> Registro de todo el trabajo realizado. Última actualización: **2026-06-28**.
> Proyecto: **ORIÓN** (sistema de ventas + facturación electrónica DTE para El Salvador, de One Geo Systems). Stack: React 19 + Vite + Firebase (Firestore, Auth, Hosting, Cloud Functions Gen 2).

---

## Resumen ejecutivo

El trabajo tuvo **dos grandes bloques**:

1. **Mejoras de interfaz (UI)** en varias páginas: tarjetas, métricas clickeables, vistas más compactas.
2. **Proyecto de seguridad multi-empresa** (el más grande): cerrar el aislamiento de datos por `empresaId` en las **15 colecciones** de Firestore, más arreglos de backend, un rediseño del panel One Geo, y el endurecimiento del login de empleados.

Todo se hizo de forma **incremental, probando en producción paso a paso, sin romper nada**.

---

## Parte 1 — Documentación inicial

- Se creó el archivo **`CLAUDE.md`** (guía del proyecto para futuras sesiones de Claude Code): qué es ORIÓN, comandos, arquitectura (frontend ↔ functions, modelo de auth, permisos, sucursales/correlativos, modo certificación One Geo), y el detalle del motor DTE (`functions/transmitir.js`).

---

## Parte 2 — Mejoras de interfaz (UI)

### Caja (`src/pages/Caja.jsx`)
- Las **4 tarjetas KPI** de arriba se convirtieron en una **barra horizontal compacta** (ocupaban mucho alto).
- Las secciones **"Cajas Abiertas"** y **"Cerradas Hoy"** pasaron de tarjetas grandes a **tablas densas** (estilo Historial), con acciones inline (👁️ Detalle, 💸 Retiro, 🔒 Cerrar / 🖨️ Imprimir).
- Se **compactó el modal de Cierre de Caja** para que entre sin scroll: conteo de billetes a 3 columnas, resumen del turno en una fila, márgenes reducidos.
- Se exploró primero el patrón "desplegable" de Facturas, pero se descartó a favor de la tabla densa.

### Compras (`src/pages/Compras.jsx`)
- Las tarjetas del panel se rediseñaron para que tengan **la misma forma que las de Inventario**: fondo con gradiente del color, **ícono SVG de línea monocromo** (componente `PanelIcon`) y **marca de agua** tenue. Antes usaban emojis y barra superior.

### Clientes (`src/pages/Clientes.jsx`)
- Se agregó un **panel de 4 métricas** arriba: Total, Persona Natural, Persona Jurídica, Contribuyentes (con NRC).
- Las métricas son **clickeables**: filtran la tabla por tipo (toggle); los conteos siempre reflejan el total real.

### Facturas (`src/pages/Facturas.jsx`)
- Las tarjetas de resumen (Total Cobrado, Por Cobrar, Vencidas, Total) se rediseñaron al estilo nuevo (gradiente + ícono SVG + marca de agua) y se hicieron **clickeables para filtrar por estado de pago**.

### Cotizaciones (`src/pages/Cotizaciones.jsx`)
- El panel de stats se rediseñó a **4 métricas por estado** (Total, Enviadas, Aceptadas, Rechazadas), clickeables para filtrar.

### Limpieza de lint
- Se limpiaron errores de ESLint (`no-unused-vars`, etc.) en **Facturas, Cotizaciones y Caja** (imports/variables sin uso, `catch (e)` → `catch`, `Date.now` movido fuera del render en Cotizaciones).

---

## Parte 3 — Proyecto de seguridad multi-empresa (el grande)

### El problema
ORIÓN es multi-empresa (cada documento tiene `empresaId`). Pero muchas colecciones tenían `allow read: if true` en las reglas de Firestore → **cualquier usuario podía leer datos de otra empresa** desde la consola del navegador.

### Hallazgo inicial
- El archivo de reglas **no estaba versionado** en el repo. Se creó **`firestore.rules`** con el contenido real (se publica manualmente en la consola de Firebase; no hay sección `firestore` en `firebase.json`).

### Las 15 colecciones cerradas por `empresaId`
Se cerraron **una por una, desplegando y probando cada una** antes de seguir:

`compras` · `cotizaciones` · `proveedores` · `operaciones` · `facturas` · `productos` · `bodegas` · `categorias` · `cajas` · `kardex` · `clientes` · `ventas` · `sucursales` · `usuarios` · `configuracion`

**Patrones de regla usados:**
- Las que tenían permiso: `(puede('ver_X') || esAdmin()) && resource.data.empresaId == misDatos().empresaId`.
- Las que eran `if true`: `logueado() && resource.data.empresaId == misDatos().empresaId`.
- `ventas`: lleva además una cláusula para el módulo de certificación: `|| (resource.data._certificacion == true && esMaestroOneGeo())`.

### Arreglos de frontend necesarios (para no romper al cerrar)
- **kardex**: `cargarKardexProducto` (Inventario) ahora filtra por `empresaId`, con fallback para no requerir índice compuesto.
- **Operaciones**: 3 lecturas de config que usaban `limit(1)` → `getDoc(configuracion/{empresaId})`.
- **TicketImpresion**: leía `configuracion/{user.uid}` (id equivocado, nunca cargaba datos) → corregido a `configuracion/{empresaId}`.
- **useSucursal.js + Sucursales.jsx**: ahora leen `sucursales` filtrando por `empresaId` (antes leían la colección completa).
- **Bug `codDistrito`**: el formulario de Sucursales no guardaba el código de distrito (CAT-008) → el MH rechazaba el DTE por "distrito no cumple el formato". Corregido.

### Fix multi-empresa en el backend (Cloud Functions del MH) 🔴
**Bug grave:** `transmitir.js`, `invalidar.js` y `contingencia.js` leían la configuración con `where('mh_usuario','!=',null).limit(1)` — tomaban **la primera config con credenciales**, sin filtrar por empresa. Con varias empresas, una podía transmitir con el **certificado/credenciales de otra**.
- **Arreglo:** los tres ahora leen `configuracion/{empresaId}` (de la venta / factura / dtes), con fallback retrocompatible.
- Probado: FE emitida, FE anulada, NR y FSE.

### Rediseño del Panel One Geo (`SuperAdmin.jsx`)
Decisión de modelo: **One Geo gestiona los datos fiscales y las sucursales; el cliente solo los ve.**
- **Parte A:** al registrar/editar una empresa, SuperAdmin ahora **escribe los datos fiscales en `configuracion/{empresaId}`** (con `merge`, sin pisar cosméticos ni secretos). Elimina la duplicidad de datos.
- **Gestión de sucursales:** nuevo modal en SuperAdmin para crear/editar/**desactivar** (no borra) sucursales por empresa, **con los códigos MH** (`codEstableMH`/`codPuntoVentaMH`) que antes no se podían cargar desde ningún formulario.
- **Cliente read-only:** `Sucursales.jsx` y la sección de sucursales de `Inventario.jsx` quedaron **solo lectura** (sin crear/editar/borrar). Mensaje "Gestionadas por One Geo".

### Endurecimiento del login de empleados (#1 — el más jugoso) 🔐
**Problema:** el login por PIN leía toda la colección `usuarios` **sin autenticación** (exponía los PINs) y guardaba los permisos en un doc `sesiones_empleado` que **el propio empleado podía falsificar** desde la consola (poniéndose permisos de admin o el `empresaId` de otra empresa).

**Solución (refactor en 3 sub-pasos):**
1. **Cloud Function `login-empleado`** (`functions/login-empleado.js`): valida usuario+PIN con Admin SDK (no expone PINs) y devuelve un **custom token** cuyo `uid` = el id del doc `usuarios` del empleado.
2. **Frontend** (`Login.jsx` + `AuthContext.jsx`): el empleado entra con `signInWithCustomToken` (ya no anónimo, ya no escribe `sesiones_empleado`). Las reglas leen su **doc real** (`usuarios/{uid}`), que él no puede editar.
3. **Reglas:** `sesiones_empleado` → `read, write: if false` (sella la falsificación).

**Obstáculo resuelto (IAM):** crear custom tokens requirió darle a la *service account* de las Functions (`{número}-compute@developer.gserviceaccount.com`) el rol **"Service Account Token Creator"** y habilitar la **"IAM Service Account Credentials API"** en Google Cloud Console. Sin eso daba `iam.serviceAccounts.signBlob denied`.

---

## Parte 4 — Bugs encontrados y arreglados

| Bug | Detalle | Estado |
|---|---|---|
| `codDistrito` en Sucursales | El form no guardaba el código de distrito → MH rechazaba el DTE | ✅ Arreglado |
| Config DTE cruzada entre empresas | `transmitir/invalidar/contingencia` tomaban la config equivocada | ✅ Arreglado |
| Ticket muestra "Mi Empresa" | Empresas creadas antes de la Parte A no tienen datos fiscales en `configuracion` → **solución: editar+guardar la empresa en SuperAdmin una vez** | ✅ Explicado |
| `sesiones_empleado` falsificable | Empleado podía inflar sus permisos | ✅ Arreglado (custom token) |
| Correlativo de sucursal | Al cerrar `sucursales` write-solo-maestro, se rompió la venta de NO-maestros (el POS hace `tx.update(sucRef, {correlativoX})` en cada venta) | ✅ Arreglado con helper `soloCambiaCorrelativoSucursal()` |
| TicketImpresion id equivocado | Leía `configuracion/{user.uid}` en vez de `{empresaId}` | ✅ Arreglado |

> **Lección importante:** las reglas hay que **probarlas siempre con un usuario NO-maestro** (empleado o admin de cliente). El usuario maestro de One Geo se salta varias restricciones, así que un bug puede pasar desapercibido si solo se prueba con él.

---

## Estado final

### ✅ Completado
- **15/15 colecciones** aisladas por `empresaId`.
- Backend DTE seguro en multi-empresa.
- Login de empleados endurecido (custom token).
- Rediseño One Geo (gestión centralizada de datos fiscales y sucursales).
- Mejoras de UI en Caja, Compras, Clientes, Facturas, Cotizaciones.

### ⏳ Pendientes (opcionales, anotados en la memoria de Claude)
**Seguridad:**
1. `write` de `usuarios` y `configuracion` aún no valida `empresaId` (el *read* sí). Un admin podría editar datos de otra empresa si supiera el id.
2. **Deshabilitar el login anónimo** en Firebase Auth (ya no se usa) — 1 clic en la consola.
3. **Facturas por cajero**: que un cajero vea solo sus facturas / las de su sucursal (pedido del usuario, a futuro).

**Limpieza / menores:**
4. Borrar docs `sesiones_empleado` viejos y simplificar `misDatos()` (quitar la rama legacy).
5. Bloquear el auto-registro de usuarios (hoy crea usuarios huérfanos con `empresaId` vacío).
6. SuperAdmin: validar NIT duplicado al crear empresa.
7. `login-empleado` sin rate-limit (riesgo de fuerza bruta del PIN).
8. Limpiar warnings de ESLint preexistentes en varios archivos.

**A verificar (no es código):**
9. **Correlativo anual del MH**: confirmar con el contador si el DTE reinicia el correlativo cada año (lo más probable es que sea **continuo**, no anual; reiniciarlo daría rechazo 004 del MH).

---

## Notas operativas (importante para futuras sesiones)

- **Reglas de Firestore (`firestore.rules`)**: NO se auto-despliegan. Se publican **manualmente** copiando/pegando todo el archivo en la consola de Firebase. (No hay sección `firestore` en `firebase.json`.) Para revertir, basta volver una regla a `if true` y publicar — es instantáneo.
- **Frontend**: auto-deploy con `git push` a `main` (GitHub Actions → Firebase Hosting).
- **Cloud Functions**: deploy **manual** con `firebase deploy --only functions`. El rewrite `/api/login-empleado` está en `firebase.json`.
- **El docId** de `configuracion` y de `empresas` **es el `empresaId`**.
- **Probar siempre con usuario NO-maestro.**
- Toda empresa creada **antes** del rediseño necesita un **editar+guardar** en SuperAdmin para poblar su `configuracion` (si no, ticket/factura muestran "Mi Empresa").

---

---

# 🗓️ SESIÓN 2026-06-27 — Identidad/UI, Módulo Asistencia+Planilla, y paso a PRODUCCIÓN DTE

> Esta sesión cerró los últimos temas de seguridad, rediseñó la identidad visual, construyó un **módulo nuevo completo (Asistencia + Planilla)**, y — lo más importante — **puso ORIÓN en producción real ante el MH**: One Geo emitió sus **primeros CCF legales**.

## Parte 5 — Cierre de seguridad pendiente
- **`usuarios` write por empresa (#1):** la escritura ahora valida `empresaId` (antes solo el read). Un admin ya no puede editar usuarios de otra empresa.
- **Login anónimo deshabilitado (#2):** se apagó en Firebase Auth (ya no se usa desde el refactor de empleados con custom token). Sin costo/uso colgando.
- **Permisos en vivo para empleados PIN:** los cambios de permisos se reflejan al instante (sin re-login).
- **Facturas/ventas por cajero:** los roles `cajero` y `vendedor` ven **solo sus propios** documentos (`cajeroId == su uid`); admin y demás ven todo. Cubierto en reglas (`soloVeLoPropio()`) y en el frontend. **Requisito al crear cualquier DTE nuevo:** incluir `cajero` y `cajeroId`.

## Parte 6 — Rediseño de identidad visual (navy + dorado)
- Paleta **navy + dorado** como identidad de ORIÓN. **Sidebar navy** con **texto totalmente blanco**.
- **Logo**: el espacio quedó **cuadrado** (no se ve todo lo blanco del PNG); se adapta mejor.
- **Hamburguesa (☰)** para esconder la sidebar, ubicada **dentro del sidebar a la izquierda** (ya no le quita espacio al logo).
- **Caja**: las KPIs pasaron a **tarjetas**; los **filtros quedaron debajo** de las tarjetas.
- **Sidebar**: orden — **Punto de Venta** y debajo **Caja**.

## Parte 7 — MÓDULO NUEVO: Asistencia + Planilla de empleados
Construido por etapas (1 a 4). Decisión clave: **NO reutilizar `usuarios`** — los empleados van en una colección **`empleados`** aparte, con su propio **PIN de marcación**.

- **Etapa 1 — Registro de empleados** (`src/pages/Empleados.jsx`): colección `empleados` (solo admin/`gestionar_personal`), con `pin`, `sueldo`, `frecuenciaPago`, `fondoAFP`, `nroISSS`, `activo`, etc. Página con pestañas (Empleados / Marcación / Asistencia / Planilla).
- **Etapa 2 — Marcación (kiosco)** (`src/pages/Marcacion.jsx` + `functions/marcar.js`): pantalla full-screen con **PIN + foto** (cámara). El PIN se valida **server-side** (Cloud Function), la foto se sube a **Storage** con el Admin SDK. PIN de salida del kiosco guardado en `localStorage`.
- **Etapa 3 — Asistencia** (`src/pages/Asistencia.jsx`): tabla por día (entrada/salida/horas/estado), **justificaciones**, **corrección de marca** (cambiar tipo / anular cuando un empleado marca salida en vez de entrada), días no laborables.
- **Etapa 4 — Planilla** (`src/pages/Planilla.jsx`): cálculo de **ISSS + AFP + ISR** (tabla de tramos ES, con medio tramo para quincena) + **bonos/descuentos/adelantos** + días no laborables + **boletas imprimibles**. Colecciones `nomina_config`, `nomina_ajustes`, `dias_no_laborables`.
- **Reglas + nav + storage**: bloques nuevos en `firestore.rules` (`empleados`, `marcaciones`, `justificaciones`, `nomina_config`, `nomina_ajustes`, `dias_no_laborables`), `storage.rules`, rewrite `/api/marcar`, nav `PERSONAL → Empleados` (permiso `gestionar_personal`). El admin ve todo el nav (`if (esAdmin) return true`).

## Parte 8 — UX global
- **Los modales ya no se cierran al hacer clic afuera** (se quitó el `onClick` del overlay en ~24 archivos). Solo cierran con Cancelar/Cerrar/X. Evita perder datos a medio llenar.

## Parte 9 — 🔴 PASO A PRODUCCIÓN DTE (lo más importante)
One Geo pasó de pruebas a **producción real** para emitir CCF legales.

- **Ambiente por empresa = campo `mh_ambiente`** (string `"01"` producción / `"00"` prueba) en `configuracion/{empresaId}`. Es el campo que usa el **backend** (`transmitir.js`) y el **manual técnico** del usuario.
  - **Fix:** el frontend mandaba `ambiente: '00'` FIJO en las 4 transmisiones → todo quedaba en prueba. Ahora leen `empresa.mh_ambiente`. (Primero por error usé `dte_ambiente`; corregido a `mh_ambiente` para alinear con backend + manual.)
- **Banner de producción** (`src/components/ModoProdBanner.jsx`): barra roja "🔴 MODO PRODUCCIÓN" cuando `mh_ambiente === '01'`. Por empresa.
- **Certificado de producción** (según el **manual técnico** del usuario, `Manual_Tecnico_Conexion_MH_DTE.pdf`):
  - El certificado y las contraseñas son **DISTINTOS** entre prueba y producción (acreditamiento se repite en el ambiente productivo).
  - La clave privada **NO** se saca del `.key` (suele venir con **error 813**); se **extrae del `.crt`** (que es un XML): campo `<privateKey>…<encodied>BASE64</encodied>` → convertir a PEM. Se hizo con un script local (`extraer_clave.cjs`), **sin pegar la clave en el chat**.
  - Firestore (`configuracion/eaQSlj4KYmJo6fIelAgq`): `certificado_pem` (clave de producción), `certificado_password` = "", `mh_usuario` = NIT `11260405261018`, `mh_password` = **contraseña API de producción** (distinta a la de prueba y a la del certificado), `mh_ambiente` = `"01"`.
  - Autenticación de producción verificada con `POST api.dtes.mh.gob.sv/seguridad/auth` → `status:OK`. (Antes dio `codigoMsg 106 CREDENCIALES INVÁLIDAS` con la contraseña de prueba.)
- **NIT de 9 o 14 dígitos** (`Clientes.jsx`): el MH acepta NIT de 14 (viejo) o 9 (homologado al DUI). El modal solo aceptaba 14 → ahora acepta ambos. El backend ya lo manejaba.

## Parte 10 — Primeros CCF reales y correcciones
Se emitieron los primeros CCF de producción (instalación de cámaras). Aprendizajes y fixes:

- **IVA / declaración**: el precio en ORIÓN es **NETO (sin IVA)**; el sistema agrega el 13%. Para un CCF, el IVA va **aparte**. Se trabajó el caso real (compra con crédito fiscal vs venta con débito fiscal) para declarar bien al MH.
- **Número de control desincronizado** (cosmético, no afecta lo legal): ORIÓN tiene **dos contadores** — el de **sucursal** (frontend, `numeroDte`, quedó inflado por las facturas de prueba → mostraba 272) y el de **ambiente** (backend, `contadores`, el que registra el MH → 2, 3). El MH siempre usó el del backend (correcto). **Fix:** el ticket del POS ahora usa el `numeroControl` oficial que devuelve el backend, no el contador local. (Imprimir desde Facturas ya mostraba el correcto.)
- **Ocultar DTE de prueba en producción** (`Facturas.jsx`): cuando la empresa está en producción, la lista y los totales muestran **solo DTE de producción** (`dte_ambiente === '01'`), con botón **🧪 Ver prueba**. Multiempresa-seguro (las empresas en prueba ven todo). **No borra nada.**
- **Marcar el ambiente al crear** (POS, NC/ND, manual; Operaciones ya lo hacía): toda venta/factura nueva guarda `dte_ambiente` desde su creación (no solo al transmitir), así una de producción **pendiente** igual aparece en la lista y las viejas de prueba se ocultan.

---

## Estado de pendientes (actualizado)
- ✅ #1 write `usuarios` por empresa — hecho.
- ✅ #2 login anónimo deshabilitado — hecho.
- ✅ #3 facturas por cajero — hecho.
- ⏳ Sigue pendiente (menores): rate-limit en `login-empleado`, NIT duplicado en SuperAdmin, limpiar `sesiones_empleado` legacy, warnings ESLint, confirmar correlativo anual con el contador.
- ⏳ **Mejoras ofrecidas para otro día:** toggle de `mh_ambiente` en SuperAdmin/Configuración (sin tocar Firestore a mano); `tipoItem: 2` para servicios (hoy todos van como `1` "bien", el MH no rechaza); registrar las **2 compras de los kits en Compras** (crédito fiscal de fin de mes); limpiar el script temporal `extraer_clave.cjs`.

## Notas operativas nuevas
- **Campo de ambiente DTE = `mh_ambiente`** (NO `dte_ambiente`). El campo `dte_ambiente` existe en los **documentos** de venta/factura (lo marca el backend y ahora también el frontend al crear), pero el de **configuración** que decide prueba/producción es `mh_ambiente`.
- **Certificado de producción**: guardar el `.crt` en lugar seguro (única copia). Nunca pegar la clave privada en el chat. `.gitignore` ya ignora `*.crt`, `*.key`, `*.pem`.
- **One Geo `empresaId`** = `eaQSlj4KYmJo6fIelAgq`. **NIT** = `11260405261018`. **Usuario API** = el NIT (no el número facturador).

---

---

# 🗓️ SESIÓN 2026-06-28 — Código de barras, etiquetas, panel de certificado y tema

> Tras emitir los primeros CCF reales, esta sesión sumó herramientas operativas (lector de código de barras, etiquetas), facilitó el alta de clientes en DTE (panel de certificado en One Geo) y aplicó la identidad navy+dorado a las páginas que faltaban.

## Parte 11 — Lector de código de barras
- **Concepto:** el código de barras es solo un **número (ID)**; el sistema reconoce el producto porque ese número está **vinculado en Inventario** (`codigoBarras`). Todas las unidades del mismo producto comparten el mismo código.
- **Punto de Venta:** ya tenía soporte — busca por `codigoBarras` y **auto-agrega** al escanear (match exacto, ≥6 dígitos, stock > 0).
- **Compras** (`Compras.jsx`): se **agregó** el soporte. El buscador ahora filtra también por `codigoBarras` y, al escanear, **selecciona el producto y enfoca la cantidad** (no auto-agrega 1, porque en una compra entran varias unidades).
- **Nota de hardware:** los lectores CCD/láser **no leen de pantalla**, solo de **papel impreso**. Los códigos del manual con nombres de países son de **configuración** (idioma de teclado), no de datos.

## Parte 12 — Generar e imprimir etiquetas (`src/utils/etiquetas.js` + Inventario)
- Para productos **sin código de barras de fábrica**. Botón **🏷️** por producto en Inventario.
- Si el producto no tiene código, **genera uno único** (Code128, 12 dígitos, prefijo `2` = uso interno) y lo **guarda** al imprimir → queda escaneable en POS y Compras.
- Modal con **vista previa** + cantidad de copias. Hoja imprimible con **nombre + barras + precio**.
- Usa **`jsbarcode`** (import dinámico, como el QR). Reusa el `imprimirIframe` local de Inventario.

## Parte 13 — Panel One Geo: cargar certificado y credenciales MH (`SuperAdmin.jsx` + `src/utils/certificado.js`)
Nueva opción **🔐 Conexión MH** en el Centro de Control de cada empresa (facilita dar de alta clientes en DTE sin openssl/consola):
- **Subir el `.crt`** del MH → `extraerClavePEM()` saca la clave privada **en el navegador** (mismo proceso que `extraer_clave.cjs`) y la guarda en `certificado_pem`. Acepta también un `.pem` ya convertido.
- Campos: **Ambiente** (Prueba 00 / Producción 01 — sirve también de toggle de ambiente), **Usuario API (NIT)**, **Contraseña API** (solo se sobreescribe si se ingresa), **Contraseña del certificado** (normalmente vacío).
- Guarda en `configuracion/{empresaId}` con `merge`. **Solo el maestro** (reglas ya lo restringen; SuperAdmin ya escribía configuracion).
- Recordatorios: `certificado_password` va **vacío** (la clave del `.crt` sale sin cifrar); la **Contraseña API** es la del Paso 3 del acreditamiento (distinta a las del certificado).

## Parte 14 — Correcciones DTE post-producción
- **Número de control en el POS:** el ticket usaba el `numeroDte` local (contador de sucursal, inflado por las pruebas → mostraba 272) en vez del `numeroControl` oficial del backend (contador por ambiente → 2, 3, el que registra el MH). **Fix:** al recibir PROCESADO el POS toma `data.numeroControl`. (Imprimir desde Facturas ya mostraba el correcto.)
- **Ocultar DTE de prueba en producción** (`Facturas.jsx`): si la empresa está en producción (`mh_ambiente 01`), la lista y los totales muestran **solo producción** (`dte_ambiente 01`), con botón **🧪 Ver prueba**. Multiempresa-seguro. No borra nada.
- **Marcar ambiente al crear:** POS, NC/ND y manual ahora guardan `dte_ambiente` desde la creación (Operaciones ya lo hacía) → una de producción pendiente igual aparece.
- **NIT de 9 o 14 dígitos** (`Clientes.jsx`): el MH acepta ambos (14 viejo / 9 homologado al DUI); el modal solo aceptaba 14.

## Parte 15 — Identidad navy + dorado en Operaciones y Panel One Geo
- Se rutearon los acentos primarios hardcodeados (azul claro `#4a8fe8`/`#3b82f6`) a `var(--accent)`/`var(--accent-dark)`: botón Guardar, Nueva empresa e ícono del header en SuperAdmin; banner de info y botones NR en Operaciones. Botón **Conexión MH** en **dorado** (`var(--accent3)`).
- Los **modales** de ambas páginas ya usaban las variables del tema (heredan navy+dorado). Se conservan los colores semánticos (rojo/ámbar/verde) y el color-coding de acciones.

---

## Estado de pendientes (al 2026-06-28)
- ✅ Toggle de ambiente (dentro de Conexión MH) · ✅ Etiquetas · ✅ Escáner en Compras · ✅ Panel de certificado · ✅ Tema navy+dorado en las páginas que faltaban.
- ⏳ **Operativo:** registrar las 2 compras de los kits (crédito fiscal) — a la espera de una consulta al contador (los CCF se facturaron como mano de obra; ver si separa bien/servicio y crédito del kit).
- ⏳ **`tipoItem: 2` (servicio)** en el DTE — **depende** de la respuesta del contador (bien vs servicio).
- ⏳ Botón “Probar conexión” en el panel del certificado (valida contra el MH; requiere función nueva).
- ⏳ Menores: limpiar `extraer_clave.cjs`, rate-limit en `login-empleado`, NIT duplicado en SuperAdmin, bloquear auto-registro de usuarios, limpiar `sesiones_empleado` + warnings ESLint, confirmar con el contador si el correlativo del MH es anual o continuo.
- 🔵 Asistencia (opcional): GPS, foto de perfil, “días trabajados” en la boleta.

---

*Documento generado como bitácora del trabajo asistido por Claude Code.*
