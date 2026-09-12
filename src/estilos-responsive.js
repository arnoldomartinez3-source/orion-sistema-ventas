// ══════════════════════════════════════════════════════════════
// estilos-responsive.js — Sistema responsive central de ORIÓN
//
// Se inyecta UNA sola vez en App.jsx:  <style>{estilosResponsive}</style>
// y queda disponible en todas las páginas. No requiere imports por página.
//
// BREAKPOINTS UNIFICADOS (usar siempre estos, no inventar otros):
//   ≤ 480px  → móvil
//   ≤ 768px  → tablet / móvil grande
//   ≥ 769px  → desktop
//
// CÓMO SE USA: agregá las clases utilitarias al className de cualquier
// elemento. Ejemplos al final de este archivo.
// ══════════════════════════════════════════════════════════════

export const estilosResponsive = `
  /* ── VISIBILIDAD ───────────────────────────────────────────── */
  /* Oculta en desktop, muestra en móvil/tablet */
  .solo-movil { display: none; }
  @media (max-width: 768px) {
    .solo-movil { display: block; }
    .solo-desktop { display: none !important; }
  }

  /* ── APILAR GRIDS EN MÓVIL ─────────────────────────────────── */
  /* Cualquier grid con esta clase pasa a 1 columna en móvil */
  @media (max-width: 768px) {
    .apilar-movil { display: flex !important; flex-direction: column !important; }
    .apilar-tablet-2 { grid-template-columns: 1fr 1fr !important; }
  }
  @media (max-width: 480px) {
    .apilar-movil-1 { grid-template-columns: 1fr !important; }
  }

  /* ── REORDENAR EN MÓVIL ────────────────────────────────────── */
  /* Funciona dentro de un contenedor .apilar-movil (flex column).
     Menor número = aparece más arriba. Desktop NO se ve afectado. */
  @media (max-width: 768px) {
    .orden-1 { order: 1; }
    .orden-2 { order: 2; }
    .orden-3 { order: 3; }
    .orden-4 { order: 4; }
    .orden-5 { order: 5; }
  }

  /* ── TABLAS ANCHAS: SCROLL EN VEZ DE CORTARSE ──────────────── */
  /* Envolvé una tabla ancha con un <div className="scroll-x-movil"> */
  @media (max-width: 768px) {
    .scroll-x-movil { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .scroll-x-movil > table { min-width: 560px; }
  }

  /* ── ESPACIADO COMPACTO EN MÓVIL ───────────────────────────── */
  @media (max-width: 480px) {
    .padding-compacto-movil { padding: 12px !important; }
    .gap-compacto-movil { gap: 10px !important; }
  }

  /* ── TEXTO QUE NO SE CORTA ─────────────────────────────────── */
  /* Para valores/números que no deben truncarse */
  .texto-flexible { white-space: normal !important; overflow-wrap: break-word; }
`

/*
  ─────────────────────────────────────────────────────────────
  EJEMPLOS DE USO
  ─────────────────────────────────────────────────────────────

  1) Reordenar secciones solo en móvil:
     <div className="apilar-movil">
       <div className="seccionA orden-3">...</div>
       <div className="seccionB orden-1">...</div>   ← sube al top en móvil
       <div className="seccionC orden-2">...</div>
     </div>

  2) Mostrar algo solo en móvil (ej: menú de accesos):
     <div className="solo-movil">...</div>

  3) Ocultar en móvil algo pesado del desktop:
     <div className="solo-desktop">...gráfica grande...</div>

  4) Grid que se apila en móvil:
     <div className="mi-grid apilar-movil-1">...</div>

  5) Tabla ancha que en móvil hace scroll horizontal:
     <div className="scroll-x-movil">
       <table>...</table>
     </div>
  ─────────────────────────────────────────────────────────────
*/
// ── Utilidades agregadas en la revisión móvil (2026-09-11) ──
// Todas aplican SOLO en teléfono/tablet; en desktop no cambian nada.
//   .titulo-con-menu → deja lugar al botón ☰ fijo (arriba a la izquierda)
//   .pad-movil-0     → quita el padding propio de la página (ya lo pone .main-content)
//   .cols-1-movil / .cols-2-movil → grillas inline que se apilan (usa !important para ganarle al style=)
//   .wrap-movil      → filas de botones que pueden pasar a 2 líneas
export const estilosResponsiveExtra = `
  @media (max-width: 768px) {
    .titulo-con-menu { padding-left: 50px !important; }
    .pad-movil-0 { padding: 0 !important; }
    .cols-2-movil { grid-template-columns: 1fr 1fr !important; }
    .wrap-movil { flex-wrap: wrap !important; }
  }
  @media (max-width: 480px) {
    .cols-1-movil { grid-template-columns: 1fr !important; }
  }
`

// ── Tarjetas genéricas para listas en teléfono (.mcard) ──
// Se renderizan dentro de .solo-movil, así que no necesitan media query. Las
// usan Clientes, Compras, Cotizaciones, Empleados y Kardex (Inventario y
// Facturas tienen su propia tarjeta con más campos).
export const estilosTarjetasMovil = `
  .mcards { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
  .mcard { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; }
  .mcard-top { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
  .mcard-titulo { font-weight: 700; font-size: 14px; line-height: 1.25; }
  .mcard-meta { font-size: 11.5px; color: var(--muted); margin-top: 3px; word-break: break-word; }
  .mcard-meta .mono { color: var(--accent2); font-weight: 700; }
  .mcard-monto { font-family: var(--mono); font-weight: 800; font-size: 17px; white-space: nowrap; text-align: right; flex-shrink: 0; }
  .mcard-monto small { display: block; font-size: 10px; color: var(--muted); font-weight: 600; }
  .mcard-mid { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 9px; font-size: 12px; }
  .mcard-acciones { display: flex; gap: 6px; margin-top: 10px; }
  .mcard-acciones .btn { flex: 1; padding: 9px 0; font-size: 14px; }
  .mcard-vacio { padding: 28px 12px; text-align: center; color: var(--muted); }
`
