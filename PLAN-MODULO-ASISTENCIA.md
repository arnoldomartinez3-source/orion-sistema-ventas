# MÓDULO ORIÓN — Control de Asistencia + Planilla

> El módulo que diferencia a ORIÓN: además de facturar, le resuelve al dueño el
> control de entrada/salida de sus empleados y el cálculo de la planilla de pagos.
> Pensado para ferreterías, farmacias, tiendas — negocios pequeños de El Salvador.
> Última actualización: 2026-06-21.

---

## La propuesta de valor (por qué es diferente)

Los sistemas de facturación solo facturan. ORIÓN, además:
- Controla la asistencia de los empleados (marcación con PIN + foto).
- Genera automáticamente la boleta por empleado y la planilla general.
- Le ahorra al dueño dos dolores de cabeza en un solo lugar: facturar Y pagar.

---

## DECISIONES TOMADAS (jun 2026)

### Marcación
- **PIN + FOTO obligatoria** (la foto confirma identidad, evita que marquen por otro).
- **Foto:** se guarda en **Firebase Storage** (NO base64 — base64 infla ~33% y llena Firestore).
  Además, **comprimir la foto** antes de subir (~200-400KB basta). En Firestore solo va la URL.
- **Hora del SERVIDOR** (serverTimestamp), NUNCA la del dispositivo (se puede alterar).

### El problema del "marcar desde cualquier lado"
Como ORIÓN es web (una URL), un empleado que sepa la dirección podría marcar desde su casa.
SOLUCIÓN: **base flexible con métodos de validación configurables por empresa.** El dueño elige:
- **Método A — Dispositivo autorizado (tablet fija):** el dueño registra la tablet del negocio.
  Solo desde ese dispositivo se puede marcar. Sin GPS. Resuelve el problema de raíz.
- **Método B — Teléfono personal + GPS:** el empleado marca desde su celular, pero solo
  dentro del perímetro del negocio (radio configurable, como el sistema del Ministerio).
DISEÑO CLAVE: la base se construye pensando en "método de validación configurable" desde el
inicio, aunque se implemente un método primero. Así agregar el otro después es fácil.

### Justificación de inasistencia
- Junto a cada marcación/día, el **DUEÑO** puede registrar una justificación.
- **Categorías** (menú): permiso, médico, falta injustificada, día personal, etc.
- **Texto libre** para el detalle ("trajo constancia", "avisó con anticipación").
- **Switch "¿Se paga este día?"** (Sí/No) — DECISIÓN DEL PATRÓN caso por caso. Algunos
  dueños perdonan el día, otros lo descuentan. Esto alimenta la planilla.

### Planilla y pagos
- **Sueldo FIJO** (no por horas). Mensual o quincenal — el dueño elige por empleado.
- **Descuentos de ley El Salvador (2026)** — valores OFICIALES, deben ser CONFIGURABLES
  (no quemados en el código), porque la ley cambia:
  - **ISSS empleado: 3%** del salario, TOPE $30/mes (base máxima $1,000).
  - **AFP empleado: 7.25%** del salario (sin tope hasta $7,045.06 cotizable).
  - **ISR (Renta):** se calcula DESPUÉS de restar ISSS y AFP (sobre la "base gravable").
    Tabla progresiva (tramos). Quien gana el mínimo (~$365) no paga renta.
  - Orden correcto: Bruto − ISSS − AFP = base gravable -> aplicar ISR -> = NETO.
- **Aportes patronales** (los paga el DUEÑO, NO se descuentan al empleado), útil mostrarlos
  como "costo real del empleado": ISSS patronal 7.5%, AFP patronal 8.75%.
- **Recomendación al dueño:** ORIÓN calcula, pero validar con su contador. Mostrar aviso.

---

## LAS ETAPAS (de lo simple a lo complejo)

### ETAPA 1 — Registro de empleados (base)
Página para dar de alta empleados:
- Datos: nombre, foto de perfil, cargo, sueldo (monto), frecuencia (quincenal/mensual),
  fecha de ingreso, activo/inactivo, fondo AFP (Crecer/Confía), nº ISSS.
- Cada empleado vinculado a empresaId.
- VALORAR con Claude Code: ORIÓN YA tiene empleados con PIN para el POS (en `usuarios`).
  Decidir si se reutiliza esa estructura o se crea `empleados` aparte. Probablemente
  reutilizar/extender para no duplicar.

### ETAPA 2 — Marcación (el corazón)
Pantalla tipo kiosco:
- El empleado pone su PIN -> se toma foto (cámara) -> registra entrada/salida.
- Validación de "dónde marca" según el método configurado (dispositivo autorizado o GPS).
- Guarda: empleadoId, empresaId, tipo (entrada/salida), serverTimestamp, fotoUrl.
- **Modo kiosco real:** la tablet queda fija en esta pantalla, el empleado NO puede navegar
  al resto del sistema. Un empleado tras otro.

### ETAPA 3 — Historial, justificaciones y reportes
- El dueño ve marcaciones por empleado, día, rango de fechas (tabla: fecha, día, entrada,
  salida, observación) — estilo la tabla del Ministerio.
- Detecta ausencias (días sin marcar) y anomalías (entrada sin salida).
- **Justificación de inasistencia** (categoría + texto + switch "¿se paga?").
- Exportar a Excel/PDF.

### ETAPA 4 — Planilla y boletas (el valor final)
- Por período (quincena/mes): boleta individual + planilla general.
- Aplica descuentos de ley (ISSS, AFP; ISR en nivel avanzado) sobre el sueldo fijo.
- Resta los días marcados "no se paga" en las justificaciones.
- Boleta: nombre, período, días trabajados, ausencias, bruto, ISSS, AFP, ISR, NETO.
- Planilla: tabla de todos los empleados + total a pagar + costo patronal.
- Exportar a PDF para imprimir/entregar.
- NIVEL BÁSICO primero (ISSS + AFP, simples). NIVEL AVANZADO después (ISR con tablas).

### ETAPA 5 — Segundo método de validación (si se arrancó con uno)
- Completar el método que no se hizo primero (GPS+teléfono o dispositivo autorizado).
- El dueño elige por empresa cuál usar.

---

## Temas a cuidar (zona sensible)

- **Fotos de personas:** privacidad. Storage con reglas por empresa. El dueño es responsable.
- **Hora del servidor** siempre (no del dispositivo).
- **Descuentos de ley configurables** (la ley cambia) + aviso de validar con contador.
- **Modo kiosco** que no deje salir de la pantalla de marcación.
- **Multi-empresa:** TODO filtra por empresaId, como el resto de ORIÓN.
- Los porcentajes ISSS/AFP/ISR son de 2026 y pueden cambiar — por eso configurables.

---

## Cómo construirlo con Claude Code

UNA ETAPA A LA VEZ. Cada etapa: se construye, se prueba, se confirma, y recién la siguiente.
NO pedirle todo el módulo de un prompt. Empezar por la ETAPA 1 (registro de empleados),
la base y la de menor riesgo. Que Claude Code PRIMERO analice cómo encaja con los empleados
PIN existentes y proponga, ANTES de tocar código.
