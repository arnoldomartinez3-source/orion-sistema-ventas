// ══════════════════════════════════════════════════════════════════
// Identidad de ORIÓN — piezas compartidas por las pantallas.
//
// Nace del rediseño del Dashboard: azul marino y dorado, números
// monoespaciados, sin degradados ni emojis, y la información que el dueño
// necesita atender en vez de tarjetas de colores que casi siempre dicen cero.
//
//   .id-franja   franja azul con los números de la pantalla (las áreas pueden
//                ser <button> para filtrar; la división entre ellas es marcada)
//   .id-seg      barra de secciones segmentada (la activa en azul marino)
//   .id-buscador campo de búsqueda al lado de las secciones
//   .id-btn-*    botones del encabezado: linea (secundario) y oro (principal)
//   .id-vacio    pantalla vacía que explica y ofrece la acción
//
// Se usa metiéndolo en el <style> de cada página:  {`${estilosIdentidad} ...`}
// ══════════════════════════════════════════════════════════════════

export const estilosIdentidad = `
  /* ── Franja de estado ── */
  .id-franja { display: flex; align-items: stretch; background: #14213D; border-radius: 14px; overflow: hidden;
    margin-bottom: 14px; box-shadow: 0 10px 26px -18px rgba(20,33,61,.9); }
  .dark-mode .id-franja { background: #0b1220; border: 1px solid var(--border); }
  .id-fr { flex: 1 1 0; min-width: 0; padding: 13px 20px; text-align: left; font: inherit; color: inherit; background: transparent; border: 0; }
  .id-fr + .id-fr { border-left: 2px solid rgba(255,255,255,.30); box-shadow: inset 2px 0 0 rgba(0,0,0,.35); }
  .id-fr.clic { cursor: pointer; }
  .id-fr.clic:hover { background: rgba(255,255,255,.06); }
  .id-fr.activa { background: rgba(255,255,255,.10); }
  .id-fr-et { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,.58);
    font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .id-fr-val { font-family: var(--mono); font-size: 25px; font-weight: 800; color: #fff; line-height: 1.15; margin-top: 3px; }
  .id-fr-val.oro { color: var(--accent3); }
  .id-fr-val.alerta { color: #FF9C6E; }
  .id-fr-val.malo { color: #FF6B5E; }
  .id-fr-sub { font-size: 11px; color: rgba(255,255,255,.55); margin-top: 1px; }
  .id-fr-fila { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
  .id-fr-fila .id-fr-sub { margin-top: 0; }
  @media (max-width: 900px) {
    .id-franja { display: grid; grid-template-columns: 1fr 1fr; }
    .id-fr { padding: 11px 14px; border-top: 1.5px solid rgba(255,255,255,.20); }
    .id-fr + .id-fr { border-left: 0; box-shadow: none; }
    .id-fr:nth-child(odd) { border-right: 1.5px solid rgba(255,255,255,.20); }
    .id-fr:nth-child(1), .id-fr:nth-child(2) { border-top: 0; }
    .id-fr:nth-child(5) { grid-column: 1 / -1; border-right: 0; }
    .id-fr-val { font-size: 21px; }
  }

  /* ── Barra de secciones ── */
  .id-secs { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .id-seg { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: 11px;
    padding: 3px; gap: 2px; overflow-x: auto; scrollbar-width: none; max-width: 100%; }
  .id-seg::-webkit-scrollbar { display: none; }
  .id-seg button { font: inherit; font-size: 13px; font-weight: 600; color: var(--text2); background: transparent;
    border: none; border-radius: 8px; padding: 8px 15px; cursor: pointer; white-space: nowrap;
    display: inline-flex; align-items: center; gap: 7px; transition: background .15s, color .15s; }
  .id-seg button:hover { background: var(--surface2); color: var(--text); }
  .id-seg button.activa { background: #14213D; color: #fff; font-weight: 700; }
  .dark-mode .id-seg button.activa { background: var(--accent); }
  .id-seg .num { font-family: var(--mono); font-size: 11px; font-weight: 700; background: rgba(239,68,68,.15);
    color: #dc2626; border-radius: 99px; padding: 1px 7px; }
  .id-seg button.activa .num { background: rgba(255,255,255,.2); color: #fff; }

  /* ── Buscador ── */
  .id-buscador { flex: 1 1 220px; min-width: 170px; display: flex; align-items: center; gap: 10px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 11px; padding: 0 14px; height: 44px; }
  .id-buscador input { font: inherit; font-size: 13.5px; color: var(--text); border: none; outline: none;
    background: transparent; width: 100%; }
  .id-solo-lectores { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

  /* ── Botones del encabezado ── */
  .id-acc { display: inline-flex; align-items: center; gap: 9px; flex-wrap: wrap; }
  .id-btn-linea { font: inherit; font-size: 13.5px; font-weight: 700; color: var(--text); background: var(--surface);
    border: 1.5px solid var(--border2); border-radius: 10px; padding: 10px 16px; cursor: pointer;
    text-decoration: none; display: inline-flex; align-items: center; gap: 7px; }
  .id-btn-linea:hover { border-color: var(--accent); color: var(--accent); }
  .id-btn-oro { font: inherit; font-size: 13.5px; font-weight: 800; color: #1a1204; background: var(--accent3);
    border: none; border-radius: 10px; padding: 11px 19px; cursor: pointer; }
  .id-btn-oro:hover { filter: brightness(1.07); }

  /* ── Pantalla vacía ── */
  .id-vacio { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 46px 40px;
    display: flex; flex-direction: column; align-items: center; text-align: center; }
  .id-vacio h3 { font-size: 20px; font-weight: 800; margin: 14px 0 6px; }
  .id-vacio p { font-size: 13.5px; color: var(--text2); max-width: 500px; line-height: 1.5; }
  .id-vacio-btns { display: flex; gap: 9px; margin-top: 18px; flex-wrap: wrap; justify-content: center; }
`
