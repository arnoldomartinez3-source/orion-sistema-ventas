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