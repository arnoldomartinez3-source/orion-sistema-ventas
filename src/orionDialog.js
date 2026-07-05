// ══════════════════════════════════════════════════════════════════
// Diálogos ORIÓN — reemplazo con estilo propio de alert() / confirm()
//
// API imperativa para usar desde cualquier página, casi drop-in:
//   await orionAlert('Mensaje')                       // en vez de alert()
//   if (await orionConfirm('¿Seguro?')) { ... }       // en vez de confirm()
//
// Requiere que <OrionDialog/> esté montado una sola vez (en App.jsx). Si no
// lo está, cae de forma segura al alert()/confirm() nativo del navegador.
// ══════════════════════════════════════════════════════════════════

let _handler = null

// Lo usa <OrionDialog/> para registrarse como el que muestra los diálogos.
// Devuelve una función para desregistrarse al desmontar.
export function _registrarOrionDialog(fn) {
  _handler = fn
  return () => { if (_handler === fn) _handler = null }
}

function _mostrar(cfg) {
  return new Promise((resolve) => {
    if (!_handler) {
      // Fallback nativo si el host no está montado (no rompe nada).
      if (cfg.modo === 'confirm') resolve(window.confirm(cfg.mensaje))
      else { window.alert(cfg.mensaje); resolve(true) }
      return
    }
    _handler({ ...cfg, resolve })
  })
}

// tipo: 'success' | 'error' | 'warning' | 'info' | 'pregunta'
export function orionAlert(mensaje, opts = {}) {
  return _mostrar({
    modo: 'alert',
    mensaje,
    titulo: opts.titulo || null,
    tipo: opts.tipo || 'info',
    okLabel: opts.okLabel || 'Entendido',
  })
}

export function orionConfirm(mensaje, opts = {}) {
  return _mostrar({
    modo: 'confirm',
    mensaje,
    titulo: opts.titulo || null,
    tipo: opts.tipo || 'pregunta',
    okLabel: opts.okLabel || 'Confirmar',
    cancelLabel: opts.cancelLabel || 'Cancelar',
  })
}
