# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**ORIÓN** is a sales + electronic-invoicing system for El Salvador, built by **One Geo Systems** ("One Geo" is the vendor, ORIÓN is the product). The core domain is **DTE** (*Documento Tributario Electrónico*) — the electronic tax documents that El Salvador's Ministerio de Hacienda (MH) requires. The whole codebase (identifiers, comments, UI) is in **Spanish**; match that when writing code.

It is **multi-tenant**: every user and every record belongs to one `empresaId` (company). One Geo's own master user can manage all client companies.

## Commands

Frontend (repo root):
- `npm run dev` — Vite dev server
- `npm run build` — production build to `dist/`
- `npm run lint` — ESLint
- `npm run preview` — preview the built bundle

There is **no test runner** configured (no `npm test`).

Cloud Functions (in `functions/`, a **separate npm package** — run these from inside `functions/`):
- `firebase deploy --only functions` (or `npm run deploy`) — deploy functions
- `firebase functions:log` (`npm run logs`) — tail logs
- `firebase emulators:start --only functions` (`npm run serve`) — local emulator

### Environment

The frontend needs `VITE_FIREBASE_*` env vars (see [src/firebase.js](src/firebase.js)) — `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`. Locally put them in `.env`; in CI they come from GitHub secrets.

### Deploy

- **Hosting (frontend)**: auto-deploys via GitHub Actions on push to `main` ([.github/workflows/firebase-hosting-merge.yml](.github/workflows/firebase-hosting-merge.yml) → `npm ci && npm run build` → Firebase Hosting, project `mi-sistema-ventas-7e541`). PRs get preview channels.
- **Functions**: **not** auto-deployed — deploy manually with `firebase deploy --only functions`.

## Architecture

### Stack
React 19 + React Router 7 SPA, built with Vite 8. Backend is entirely **Firebase**: Auth, Firestore (the database), Hosting, and Cloud Functions (Gen 2, Node 24, ES modules). No REST backend of our own beyond the functions.

### Frontend ↔ Functions boundary
The SPA calls functions through Hosting rewrites defined in [firebase.json](firebase.json): `/api/dte/transmitir`, `/api/dte/invalidar`, `/api/dte/contingencia`, `/api/dte/crear-admin`, `/api/dte/gestionar-admin`. Each maps to a function re-exported from [functions/index.js](functions/index.js). Anything involving the MH, certificate signing, or Firebase Admin SDK (creating Auth users, atomic counters) lives in functions — never in the browser.

### Pages and navigation
[src/App.jsx](src/App.jsx) holds the router, the global CSS-in-JS theme (dark/light CSS variables injected as `<style>`), the splash screen, and the protected-app shell. Each top-level screen is a page in [src/pages/](src/pages/) (Dashboard, Inventario, Clientes, PuntoDeVenta, Facturas, Operaciones, Compras, Cotizaciones, Caja, Sucursales, Usuarios, Configuracion, plus the One-Geo-only AsistenteCertificacion and SuperAdmin). The sidebar/menu is data-driven from [src/navConfig.jsx](src/navConfig.jsx) — add routes there **and** in `App.jsx`'s `<Routes>`.

### Auth model — two kinds of users
[src/AuthContext.jsx](src/AuthContext.jsx) handles both:
1. **Admins** — real Firebase Auth (email/password or Google). Profile lives in `usuarios/{uid}`. The first-ever user is bootstrapped as `administrador` with all permissions.
2. **Empleados (PIN login)** — authenticate by PIN (validated against Firestore in `Login.jsx`), then sign in **anonymously** to Firebase so `request.auth` exists. Their real identity/permissions live in `sesiones_empleado/{authUid}` (written on login, deleted on logout) and are mirrored in `sessionStorage` (`orion_empleado`). Firestore security rules use the `sesiones_empleado` doc as the server-side source of truth for an employee's permissions.

### Permissions
[src/PermisosContext.jsx](src/PermisosContext.jsx) exposes `usePermisos()` / `usePuede(permiso)`. Permission strings are flat (e.g. `realizar_ventas`, `ver_facturas`). The system owner (admin with no `usuarios` doc) implicitly has all permissions. The canonical permission list is duplicated in both `PermisosContext.jsx` and `AuthContext.jsx` — keep them in sync if you change it. Nav items gate on `permiso`, `soloCertificacion`, or `soloMaestro`.

### Sucursales (branches) + correlativos
[src/hooks/useSucursal.js](src/hooks/useSucursal.js) loads branches from the `sucursales` collection and tracks the active one (`sessionStorage: orion_sucursal_activa`). If a user has multiple branches and none selected, `App.jsx` shows `SelectorSucursal`. DTE correlative numbers are issued **atomically** via Firestore transactions — note there are two counter mechanisms: a per-branch field on the `sucursales` doc (`useSucursal.generarNumeroDTE`) and a dedicated `contadores/{tipoDte_codEstable_codPuntoVenta_ambiente}` doc used server-side in `transmitir.js` (authoritative for MH `numeroControl`).

### One Geo "maestro" / certification mode
[src/data/certificacionConfig.js](src/data/certificacionConfig.js) defines the master accounts (`CORREOS_MAESTROS`) and One Geo's own `EMPRESA_ID_ONEGEO`. Two One-Geo-only areas: **SuperAdmin / Panel One Geo** (manage client companies and their admins, backed by the `gestionar-admin` / `crear-admin` functions, which double-check the caller's ID token is a master email) and the **Asistente de Certificación**, gated by a *double lock*: caller must be a master **and** `configuracion/{empresaId}.modoCertificacion === true`. The flag is intentionally not a UI-assignable permission so a client admin can never grant it to themselves.

## DTE engine — [functions/transmitir.js](functions/transmitir.js)

This is the most intricate and highest-stakes file. It builds, signs, and transmits a DTE to the MH. Treat its quirks as hard-won; the MH rejects on tiny schema deviations.

- **Document types** (`TIPOS_DTE` / `VERSIONES`): FE `01` v2, CCF `03` v4, NR `04` v4, NC `05` v4, ND `06` v4, FEX `11` v3, FSE `14` v2. Each type has its own `buildEmisor` branch, `buildReceptor*`, `buildCuerpo*`, and `buildResumen*` — the JSON shape differs per type **and** per schema version. Read the inline comments before changing any field; many encode specific MH rejection codes (e.g. NC/ND require `cuerpo[].totalIva = 0` with IVA only in `resumen.tributos[].valor`; a half-null receptor document triggers code 024).
- **IVA rules differ by type**: FE carries IVA *inside* `precioUni`/`ventaGravada` (`ivaItem` is the contained IVA); CCF/NC/ND carry IVA separately via `tributos: ['20']`.
- **Environments** (`ambiente`): `'00'` = test (`apitest.dtes.mh.gob.sv`), `'01'` = production (`api.dtes.mh.gob.sv`).
- **Auth tokens** are cached in `mh_tokens/{ambiente}` (~23h TTL). MH credentials live in the `configuracion` doc (`mh_usuario`, `mh_password`); credentials are URL-encoded for the form-urlencoded auth call (passwords with `@` break otherwise).
- **Signing**: the DTE JSON is signed as a JWS with **RS512** using the company's PKCS#8 private key (`configuracion.certificado_pem`, optional `certificado_password`).
- **Dates/times** are formatted in `America/El_Salvador` (UTC-6), never server UTC — MH validates exact-match on invalidation.
- **Source documents**: `transmitir` reads from the `ventas` collection first, then falls back to `operaciones` (NR/FSE come from the Operaciones module). On success it writes `dte_estado: 'PROCESADO'` + sello back to that doc and to the matching `facturas` doc.
- **Auto-retry on 004**: when MH says "numeroControl already exists", it advances the correlative and the `contadores` doc and retries (up to 5 times).

## Firestore collections (informal)
`usuarios`, `sesiones_empleado`, `empresas`, `configuracion`, `sucursales`, `contadores`, `mh_tokens`, `ventas`, `operaciones`, `facturas`, plus inventory/clients/etc. Most app data is scoped by `empresaId`.

### Filtrado por cajero (LEER al agregar tipos de DTE)
Los docs de `ventas`, `facturas` y `operaciones` guardan **`cajeroId`** (el `userId`/uid de quien emitió) + **`cajero`** (el `userName`). Las reglas restringen la lectura con el helper `soloVeLoPropio()`: los roles **`cajero` y `vendedor` solo ven los docs cuyo `cajeroId == su uid`**; **admin y los demás roles ven todos** los de su empresa. La regla aplica a **toda la colección, sin importar el `tipoDte`**, así que un tipo de DTE nuevo ya queda cubierto por seguridad automáticamente. **Requisito al crear CUALQUIER venta/factura/operación nueva (incluido un tipo de DTE nuevo): incluir `cajero: userName || ''` y `cajeroId: userId || ''`** (de `usePermisos`) — si no, el propio cajero no verá su documento. El frontend filtra la query por `cajeroId` cuando el rol es `cajero`/`vendedor` (usa 2 filtros `==` sin `orderBy` para no requerir índices compuestos; ordena en cliente).

## Conventions
- Spanish naming throughout; keep new code consistent.
- Styling is CSS-in-JS via injected `<style>` blocks (see `baseStyles` in `App.jsx` and [src/estilos-responsive.js](src/estilos-responsive.js)) plus the `.btn/.card/.input/.modal` utility classes defined there — reuse those classes rather than inventing per-component styles.
- Functions are plain ES modules (`"type": "module"`), one function per file, re-exported from `index.js`.
