# Product MVP Audit

## 1. Executive Summary

### Product

CloudValley. Experiencia desplegada en [platform.cloudvalley.vc](https://platform.cloudvalley.vc).

### Audit Date

29 de septiembre de 2026.

### MVP Status

**NOT READY**

Evaluación de preparación para un lanzamiento validable. El producto ya está desplegado y tiene funcionalidades operativas; el estado no significa que carezca de valor ni que deba reconstruirse.

### Overall Finding

CloudValley permite consultar métricas, gestionar fuentes, preparar reportes, organizar documentos y mantener conexiones con fondos. **El principal faltante es cerrar y validar un circuito de valor acotado**, con información comprensible, resultados confiables y criterios de éxito.

Los problemas más relevantes observados son:

- La apertura directa de Métricas y Roadmap devuelve al dashboard, aunque la navegación interna funciona.
- El dashboard combina “Readiness 100/100” con “insights 0% confiables”, sin explicar suficientemente qué significa cada indicador.
- Un reporte existente presenta valores junto a varias métricas no disponibles.
- Se ofrecen integraciones que explícitamente todavía no actualizan las métricas.
- No se dispone de evidencia suficiente sobre ICP, hipótesis validada, activación, retención y proceso de feedback.

**Alcance y extracción de evidencia**

La revisión se realizó sobre producción mediante el MCP Playwright y su sesión autenticada de Founder. Se excluyeron `/redesign`, el prototipo y los cambios locales como evidencia del producto desplegado.

| Evidencia | Observación en producción |
|---|---|
| E1 · [Dashboard](https://platform.cloudvalley.vc/dashboard) | KPIs con valores, acciones de IA, alertas de fuentes antiguas, tareas y dos indicadores distintos de readiness/confianza. |
| E2 · [Métricas](https://platform.cloudvalley.vc/metrics) | Accesible por navegación interna. KPIs, escenarios y requisito de un fondo marcado “Sin vincular”. |
| E3 · [Fuentes](https://platform.cloudvalley.vc/growth-tracker/sheets) | Google Sheets conectado, archivos Excel/CSV, configuración, sincronización e historial de cargas. |
| E4 · [Reporting](https://platform.cloudvalley.vc/reporting) | Dos reportes existentes; uno figura compartido con un fondo. Editor con secciones, métricas, vista previa y controles de distribución. |
| E5 · Vista previa de reporte | Métricas con valores y cinco bloques “Métrica no disponible”. El nombre refiere a abril y la vista permite seleccionar otros períodos. |
| E6 · [Conexiones](https://platform.cloudvalley.vc/conexiones) | Una conexión activa y referencia al reporte compartido. |
| E7 · [Data Room](https://platform.cloudvalley.vc/data-room) | Documentos, carpetas y controles de acceso. |
| E8 · [Roadmap](https://platform.cloudvalley.vc/roadmap) | Accesible internamente; muestra readiness y tareas pendientes. |
| E9 · [Configuración](https://platform.cloudvalley.vc/settings) | Equipo, privacidad e integraciones. Stripe, Mercury y Amplitude advierten que todavía no actualizan Growth Tracker. |
| E10 · Navegación y móvil | Ingreso directo a Métricas/Roadmap retorna al dashboard. Editor de reporte sin desbordamiento horizontal global a 390 px. |

Convenciones utilizadas:

- **FACT:** observado directamente.
- **ASSUMPTION:** interpretación o hipótesis que requiere validación.
- **MISSING INFORMATION — FALTA INFORMACIÓN:** evidencia no disponible; no implica que la capacidad no exista.
- Las recomendaciones son propuestas, no decisiones ya aprobadas.

**Límites:** una sesión Founder y una startup. No se ejecutaron altas, cargas, sincronizaciones, guardados ni cambios de permisos. No se verificó una sesión Investor independiente. La inspección del editor no registró errores de consola, pero no certifica el circuito completo.

---

## 2. Product Readiness

| Area | Status | Key Finding |
|---|---|---|
| Problem | PARTIAL | Se infiere preparación y comunicación de información a fondos; falta evidencia del problema prioritario. |
| User | PARTIAL | Founder y fondo aparecen en el producto. ICP, comprador y usuario principal no están confirmados. |
| Value Proposition | PARTIAL | Las capacidades existen; falta elegir el resultado principal que se promete. |
| MVP Scope | PARTIAL | Conviven reporting, fundraising, documentos, métricas, integraciones e IA. |
| Core User Flow | PARTIAL | Hay piezas del circuito; no se verificó carga → reporte → consumo autorizado. |
| UX | PARTIAL | Navegación interna funcional, con fricciones de acceso directo y lectura de estados. |
| UI | PARTIAL | Interfaz estructurada y controles visibles; revisión móvil y de accesibilidad limitada. |
| Requirements | PARTIAL | Se observan reglas y controles; FALTA INFORMACIÓN sobre criterios de aceptación aprobados. |
| Validation | MISSING | FALTA INFORMACIÓN sobre investigación, experimentos y resultados. |
| Analytics | PARTIAL | Existe una entrada “Actividad”; no se verificó un embudo de producto. |
| Feedback Loop | MISSING | FALTA INFORMACIÓN sobre canal, responsable y cadencia de aprendizaje. |

---

## 3. Key Findings

### P0 — Blockers

| ID | Area | Finding | Impact | Required Action |
|---|---|---|---|---|
| P0-01 | Estrategia | FALTA INFORMACIÓN sobre usuario prioritario y resultado central del MVP. | Impide decidir qué es indispensable y qué constituye éxito. | Acordar ICP, problema, promesa y un único circuito principal. |
| P0-02 | Valor y confianza | El circuito completo con datos reales y receptor autorizado no fue verificado. | No puede certificarse entrega efectiva del valor. | Probar carga/actualización, persistencia, reporte y lectura con una cuenta Investor independiente. |
| P0-03 | Validación | FALTA INFORMACIÓN sobre hipótesis, cohorte y regla de decisión. | El lanzamiento puede producir actividad sin aprendizaje interpretable. | Definir un piloto medible antes de ampliar alcance. |

### P1 — Critical Before Launch

| ID | Area | Finding | Impact | Required Action |
|---|---|---|---|---|
| P1-01 | Navegación | Ingresar directamente a Métricas/Roadmap devuelve al dashboard; entrar internamente funciona. | Rompe enlaces guardados y continuidad de uso. | Conservar el destino tras resolver sesión y permisos. |
| P1-02 | Confianza | Conviven readiness 100/100 y confianza 0%. | El usuario puede confundir preparación documental con calidad de datos. | Explicar dimensiones, cálculo, límites y siguiente acción de cada indicador. |
| P1-03 | Reporting | La vista previa contiene cinco métricas no disponibles. | Un reporte puede resultar incompleto o generar aclaraciones adicionales. | Definir reglas de completitud, explicación del faltante y revisión antes de compartir. |
| P1-04 | Fuentes | Una fuente muestra “success”, programación diaria y última sincronización de hace 25 días. | No queda claro si está operativa, atrasada o detenida. | Separar último resultado, vigencia y estado actual de sincronización. |
| P1-05 | Integraciones | Se ofrecen conexiones que no alimentan Growth Tracker. | Introduce esfuerzo sin valor visible para el circuito principal. | Retirarlas del recorrido inicial o presentarlas claramente como no disponibles para ese uso. |
| P1-06 | Aprendizaje | No se verificaron eventos de activación ni un mecanismo de feedback. | Dificulta distinguir abandono, asistencia y valor recurrente. | Instrumentar el embudo mínimo y asignar un responsable de seguimiento. |

### P2 — Post-MVP

| ID | Area | Finding | Impact | Recommended Action |
|---|---|---|---|---|
| P2-01 | IA | Hay múltiples entradas para generar resúmenes, cambios y mejoras. | Aumenta superficie de validación antes de demostrar el circuito básico. | Ampliar después de demostrar utilidad y confianza. |
| P2-02 | Configuración | Fuentes, mapeos y métricas permiten una experiencia amplia. | Puede elevar el esfuerzo de activación. | Limitar los formatos soportados por el piloto. |
| P2-03 | Fundraising | Roadmap y Data Room amplían el trabajo más allá del reporte periódico. | Dispersan el MVP si reporting es el resultado elegido. | Incorporarlos según evidencia del caso de uso prioritario. |

### P3 — Nice to Have

| ID | Area | Finding | Impact | Recommendation |
|---|---|---|---|---|
| P3-01 | UI | Hay mezcla de términos como Reporting, Growth Tracker, Overview y Fuentes. | Añade esfuerzo de interpretación. | Unificar progresivamente; priorizar etiquetas del circuito principal. |
| P3-02 | Personalización | Selección de KPIs y varias superficies de consulta. | Valor adicional, sin demostrar necesidad para activación. | Evitar nuevas opciones hasta observar demanda. |

---

## 4. Product Strategy Findings

### Problem

**FACT:** el producto reúne datos, métricas, reportes, documentos y relaciones con fondos.

**ASSUMPTION:** busca reducir el trabajo de preparar y mantener información que una startup necesita comunicar a inversores.

**MISSING INFORMATION — FALTA INFORMACIÓN:** frecuencia del problema, tiempo invertido actualmente, errores habituales, alternativa utilizada y consecuencias de resolverlo mal.

Obtener ejemplos recientes de un reporte o actualización real, incluyendo quién lo prepara, quién lo recibe y qué aclaraciones solicita.

### Target User

**FACT:** la sesión auditada corresponde a un Founder; existen conexiones institucionales y requisitos de fondos.

**FALTA INFORMACIÓN:** etapa, modelo de negocio, tamaño del equipo, madurez de datos, geografía y quién paga.

**Recomendación:** elegir una cohorte de founders con una obligación concreta y próxima de reportar a un fondo. La existencia de métricas SaaS no demuestra que todo el ICP deba ser SaaS.

### JTBD

**ASSUMPTION, propuesta para validar:**

> Cuando tengo que actualizar a mi fondo, quiero convertir mis datos del período en un reporte claro y compartible, para comunicar el estado de la startup sin reconstruir la información ni responder aclaraciones evitables.

El contexto, la frecuencia y el resultado deseado deben contrastarse con usuarios.

### Value Proposition

**Propuesta recomendada para el piloto:**

> Prepará y compartí un reporte periódico con métricas verificables, manteniendo control sobre quién lo recibe.

**FALTA INFORMACIÓN:** si esta promesa resulta más valiosa que preparar una ronda, ordenar documentos o recibir orientación mediante IA.

### Main Hypothesis

**ASSUMPTION:** founders con datos disponibles y un destinatario concreto pueden preparar un reporte útil con menos esfuerzo que con su proceso actual, y repetir el uso en el siguiente ciclo.

### Differentiation

**FACT:** fuentes, métricas, reportes y relaciones con fondos están reunidos en la misma experiencia.

**FALTA INFORMACIÓN:** ventaja percibida frente al proceso actual del usuario, razones para cambiar y disposición a pagar.

La cantidad de módulos no prueba diferenciación.

---

## 5. MVP Scope Analysis

El siguiente recorte es una **recomendación condicionada a elegir reporting periódico como core**. Si el objetivo principal es fundraising readiness, debe revisarse.

### KEEP IN MVP

| Feature | Reason |
|---|---|
| Core · Datos del período mediante un camino soportado | Sin datos utilizables no hay reporte que entregue valor. |
| Core · Conjunto mínimo de métricas acordado con el receptor | Permite responder una necesidad concreta. |
| Core · Revisión de valores, período y faltantes | Evita comunicar información ambigua. |
| Core · Reporte simple con vista previa | Materializa el resultado principal. |
| Core · Compartir y revocar acceso a un fondo | Cierra la entrega y mantiene control del usuario. |
| Core · Acceso del receptor autorizado | Un reporte preparado pero no consumible no completa el circuito. |
| Supporting · Login, membresía y recuperación | Habilita acceso y continuidad. |
| Supporting · Feedback y medición mínima | Permite aprender del piloto. |

### REMOVE FROM MVP

Retirar del recorrido y de la promesa inicial; no implica eliminar código ni recursos existentes.

| Feature | Reason |
|---|---|
| Stripe, Mercury y Amplitude como vías de activación | Producción advierte que todavía no actualizan las métricas. |
| Múltiples generaciones de IA como pasos obligatorios | El reporte puede entregar valor sin depender de ellas. |
| Configuración exhaustiva antes del primer reporte | Incrementa trabajo previo a experimentar el beneficio. |
| Completar todos los módulos como condición de onboarding | No es necesario para probar un único resultado. |

### VALIDATE BEFORE BUILDING

| Idea / Feature | What Should Be Validated |
|---|---|
| Resumen ejecutivo y recomendaciones de IA | Si ayudan a comprender o decidir mejor que la lectura directa. |
| Automatización adicional de fuentes | Si la actualización manual es una barrera recurrente. |
| Roadmap de preparación de ronda | Si cambia acciones relevantes del founder. |
| Requisitos personalizados por fondo | Si reducen aclaraciones y aumentan adopción. |
| Editor más flexible | Si los usuarios necesitan esa flexibilidad para reportes reales. |

### POST-MVP

| Feature | Reason |
|---|---|
| Nuevos proveedores e integraciones | Un camino confiable basta para el experimento inicial. |
| Nuevos formatos y mapeos avanzados | Limitar formatos reduce variabilidad del piloto. |
| Ampliación de escenarios y personalizaciones | No es indispensable para un primer reporte real. |
| Analítica detallada de consumo | Antes debe demostrarse que los reportes se usan. |
| Expansión de Data Room y Roadmap | Condicionada al JTBD elegido y evidencia posterior. |

---

## 6. Core User Journey

```text
Entry: invitación o acceso a CloudValley
  ↓
Onboarding: pertenecer a una startup y conocer el resultado esperado
  ↓
First Value: ver métricas propias comprensibles del período
  ↓
Core Action: preparar y revisar el reporte
  ↓
Result: el fondo autorizado puede consumirlo
  ↓
Repeat: actualizar y reportar en el siguiente ciclo
```

### Journey Findings

**FACT:** producción muestra métricas, fuentes, reportes y una conexión activa.

**FALTA INFORMACIÓN:** experiencia de una cuenta nueva, tiempo hasta primer valor, necesidad de asistencia y recepción efectiva del reporte.

El dashboard presenta varias acciones posibles. **ASSUMPTION:** un usuario nuevo podría no reconocer cuál lo acerca al resultado principal.

### Aha Moment

**Hipótesis:** “Ya tengo un reporte con mis números, entiendo qué falta y mi fondo puede verlo”.

Debe observarse en usuarios; abrir el dashboard no equivale a alcanzarlo.

### Main Friction Points

1. Elegir entre métricas, fuentes, roadmap, documentos e IA.
2. Comprender mapeos y resolver datos faltantes.
3. Interpretar indicadores de preparación y confianza.
4. Identificar período y completitud del reporte.
5. Retomar el trabajo desde un enlace directo.
6. Completar la entrega si el fondo todavía no está conectado.

---

## 7. Core User Flow

### Flow

```text
Necesidad concreta de reportar
  ↓
Elegir período y destinatario
  ↓
Cargar o actualizar datos por un camino soportado
  ↓
Revisar métricas y resolver faltantes esenciales
  ↓
Preparar y previsualizar reporte
  ↓
Guardar y confirmar destinatario
  ↓
Compartir
  ↓
Receptor autorizado accede y confirma utilidad
```

### Missing Elements

| Flujo crítico | Trigger / Goal | Inputs y decisiones | Output / Success | Pendiente de validar |
|---|---|---|---|---|
| Acceso | Invitación o retorno al producto | Identidad, membresía y destino | Usuario llega al trabajo esperado | Alta nueva, enlace vencido, membresía pendiente y destino tras login. |
| Actualización | Nuevo período o fuente antigua | Fuente, período, formato y mapeo | Valores persistidos y trazables | Error parcial, reintento, ausencia de datos y resultado tras recarga. |
| Preparación | Necesidad de enviar reporte | Métricas, secciones y período | Vista previa comprensible | Reglas ante bloques no disponibles y cambios sin guardar. |
| Distribución | Reporte listo | Fondo y permisos | Receptor autorizado accede | Confirmación real, revocación y sesión Investor independiente. |
| Repetición | Siguiente ciclo | Nuevos datos | Segundo reporte útil | Conservación de configuración y reducción del esfuerzo. |

**FACT:** se observaron estados de carga, vistas con datos, bloques no disponibles y controles de distribución. No se verificaron los estados de éxito/error de las operaciones de escritura.

### Edge Cases

- Métrica esencial sin dato: distinguir ausencia de un cero real.
- Nombre del reporte y período seleccionado no coincidentes.
- Fuente conectada, pero información antigua.
- Fondo sin conexión activa o acceso revocado.
- Reapertura de una ruta protegida desde un enlace.
- Reintento tras fallo sin duplicar registros.
- Corrección de datos después de compartir: definir si el receptor ve una versión actualizable o una edición fija.

Los cuatro últimos contratos necesitan evidencia o definición explícita; no deben inferirse de la existencia de botones.

---

## 8. UX/UI Readiness

| Area | Status | Finding | Action |
|---|---|---|---|
| Information Architecture | PARTIAL | Módulos identificables; el resultado principal atraviesa varios. | Diseñar un recorrido corto hacia el primer reporte. |
| Navigation | PARTIAL | Funciona internamente; se observaron desvíos al entrar directamente. | Verificar enlaces, recarga y recuperación del destino. |
| Onboarding | PARTIAL | Solo se comprobó acceso con sesión existente. | Observar una cuenta nueva hasta primer valor. |
| Core Flow | PARTIAL | Preparación visible; entrega completa no verificada. | Probar con founder y receptor. |
| Empty States | PARTIAL | IA sin generar y métricas no disponibles tienen mensajes. | Dar una acción específica para resolver faltantes esenciales. |
| Loading States | PARTIAL | Se observaron cargas que luego completaron. | Verificar espera prolongada y recuperación. |
| Error States | PARTIAL | No se provocaron fallos controlados. | Validar error de carga, guardado y acceso sin pérdida del trabajo. |
| Success States | PARTIAL | Hay estados existentes de compartido y conexión. | Confirmar correspondencia con persistencia y permisos reales. |
| Responsive | PARTIAL | Editor sin overflow global a 390 px. | Completar revisión de formularios y recorrido principal en móvil. |
| Accessibility | PARTIAL | Hay encabezados, controles con nombre y enlace para saltar al contenido. | Verificar teclado, foco, contraste y anuncios de estado. |
| Microcopy | PARTIAL | Confianza porcentual, estados técnicos y terminología mixta. | Explicar estado, consecuencia y próxima acción con lenguaje del usuario. |

---

## 9. Product Requirements

Las historias y criterios siguientes son **propuestas de cierre**, no requisitos previamente aprobados.

| Feature | User Story | Requirements | Acceptance Criteria | Status |
|---|---|---|---|---|
| Acceso | Como founder, quiero retomar mi trabajo. | Resolver sesión, membresía y destino. | Abrir Métricas por enlace conserva el destino; falta de acceso muestra una salida clara. | PARTIAL |
| Datos | Quiero actualizar mis números del período. | Camino soportado, validación, trazabilidad y recuperación. | Valor persiste tras recarga; ausencia no se convierte en cero; reintento no duplica. | PARTIAL |
| Métricas | Quiero entender qué número estoy compartiendo. | Definición, unidad, período y origen. | Usuario puede identificar significado y fuente; faltantes tienen motivo y acción. | PARTIAL |
| Reporte | Quiero comunicar un resultado coherente. | Selección mínima, revisión y reglas de completitud. | Período explícito, guardado confirmado y tratamiento aprobado de faltantes. | PARTIAL |
| Distribución | Quiero controlar quién ve mi reporte. | Destinatario, conexión, acceso y revocación. | Cuenta autorizada accede; otra no; revocar impide acceso posterior. | PARTIAL |
| Repetición | Quiero actualizar sin empezar de cero. | Reutilización del reporte y cambio de período. | Segundo ciclo conserva estructura y muestra los datos correctos. | PARTIAL |

### Missing Product Decisions

1. Usuario principal, comprador y caso de uso del piloto.
2. Resultado central: reporte periódico, preparación de ronda o asistencia operativa.
3. Datos y métricas mínimos para considerar útil un reporte.
4. Formato de entrada soportado inicialmente.
5. Política ante información faltante o antigua.
6. Significado y límites de readiness y confianza.
7. Reporte compartido dinámico o versión fija.
8. Modelo de acceso y significado de “público”, “visible” y “compartido”.
9. Nivel de asistencia permitido y promesa comercial del piloto.

---

## 10. Validation Plan

### Main Hypothesis

**ASSUMPTION:** el founder puede preparar un reporte que el fondo considera útil, con menor esfuerzo que su método actual, y repetir el proceso.

### What Needs To Be Validated

1. Que el problema ocurre con suficiente frecuencia y relevancia.
2. Que el usuario puede llegar al primer reporte.
3. Que el receptor entiende y utiliza la información.
4. Que los faltantes y permisos se interpretan correctamente.
5. Que existe repetición por necesidad, no solo por acompañamiento.

### Recommended MVP Experiment

**Propuesta:** piloto asistido con cinco startups que tengan un reporte real próximo y al menos un destinatario participante por startup.

- Registrar el proceso actual y su tiempo.
- Acordar las métricas esenciales.
- Usar un único camino de entrada de datos.
- Observar preparación y entrega.
- Entrevistar al receptor sobre utilidad y aclaraciones necesarias.
- Repetir en el siguiente ciclo natural.

La asistencia manual es válida, pero debe registrarse para no confundir un servicio intensivo con autonomía del producto.

### Success Signals

Umbrales **propuestos**, pendientes de acuerdo antes de iniciar:

- Al menos 4 de 5 startups completan un reporte utilizable.
- Al menos 4 receptores confirman que sirve para el propósito acordado.
- Al menos 3 startups repiten en el siguiente ciclo.
- Ningún acceso indebido ni pérdida de información en las pruebas del circuito.

### Metrics

- Reportes útiles completados / startups que iniciaron.
- Tiempo activo de preparación frente al proceso anterior.
- Cantidad y tipo de intervenciones del equipo.
- Reportes consumidos por el destinatario.
- Repetición en el siguiente período.

### Decisions After Validation

- **Valor y repetición:** ampliar gradualmente el piloto.
- **Valor con mucha asistencia:** simplificar configuración antes de sumar funciones.
- **Preparación sin consumo:** revisar destinatario, contenido y distribución.
- **Consumo sin repetición:** investigar frecuencia y beneficio recurrente.
- **Sin utilidad suficiente:** revisar problema e ICP.

---

## 11. Product Analytics

### Critical Events

Eventos recomendados; su implementación actual no fue verificada.

| Event | Why It Matters |
|---|---|
| `workspace_ready` | Define quién puede iniciar el circuito. |
| `period_data_ready` | Indica que existen datos mínimos utilizables. |
| `report_saved` | Registra preparación persistida, no solo apertura del editor. |
| `report_shared` | Identifica entrega intentada a un destinatario. |
| `recipient_report_opened` | Confirma acceso del receptor; excluir vista previa del founder. |
| `core_flow_failed` | Identifica paso y categoría de fallo recuperable. |

Propiedades mínimas: identificadores internos, rol, período, reporte, etapa y resultado. Evitar capturar contenidos financieros en eventos.

### Activation

**Definición propuesta:** primera entrega de un reporte con el mínimo acordado y apertura por un receptor autorizado.

Medir aparte la activación del founder: primer reporte útil guardado.

### Core Product Action

Preparar y compartir información del período que el destinatario puede utilizar.

Una generación de IA o visita al dashboard no sustituye esta acción.

### Retention Signal

La misma startup vuelve a completar el circuito en su siguiente ciclo esperado.

No asumir que retención diaria sea pertinente para una tarea mensual.

### Drop-off Points

- Acceso → pertenencia a startup.
- Workspace listo → datos utilizables.
- Datos → reporte guardado.
- Reporte → compartido.
- Compartido → abierto por receptor.
- Primer período → siguiente período.

**FALTA INFORMACIÓN:** eventos actuales, exclusión de cuentas de prueba, denominadores y cohortes.

---

## 12. Feedback Loop

### Feedback Sources

- Observación del primer reporte.
- Entrevista breve al founder.
- Entrevista al receptor.
- Canal de soporte del piloto.
- Embudo mínimo y registro de asistencia.

### Information To Capture

- Objetivo que intentaba lograr.
- Paso donde se detuvo.
- Interpretación de métricas, períodos y permisos.
- Trabajo manual fuera del producto.
- Utilidad concreta del reporte.
- Motivo de repetición o abandono.

### Post-Launch Learning

1. Revisar los bloqueos después de cada sesión inicial.
2. Agrupar por problema y etapa del recorrido.
3. Resolver primero obstáculos a entrega y comprensión.
4. Revisar repetición al cerrar el siguiente ciclo.
5. Convertir solicitudes en tareas solo si sostienen la hipótesis principal.

**Owner propuesto:** Product Manager. **FALTA INFORMACIÓN:** responsable real, canal y capacidad de seguimiento.

---

## 13. Overbuilding Risks

| Feature / Area | Why It May Be Overbuilding | Recommendation |
|---|---|---|
| Múltiples superficies de IA | Exigen validar varias promesas antes del resultado principal. | Mantenerlas opcionales durante el piloto. |
| Integraciones sin impacto visible | Añaden configuración sin completar el circuito. | Sacarlas de activación. |
| Diversidad de archivos y mapeos | Multiplica variantes de soporte. | Soportar un formato principal y asistencia manual. |
| Editor altamente flexible | Configuración excesiva para reportes similares. | Usar una estructura inicial acordada con la cohorte. |
| Roadmap + Data Room + reporting | Atienden trabajos relacionados, pero distintos. | Elegir cuál entrega el primer valor. |
| Indicadores globales de preparación | Pueden aparentar precisión sin una interpretación validada. | Mostrar componentes, límites y acciones concretas. |
| Ampliación de analítica de lectura | Puede optimizar consumo antes de demostrar utilidad. | Comenzar por apertura del receptor y feedback. |

---

## 14. Critical Product Dependencies

```text
Elegir usuario y resultado
  ↓
Definir datos mínimos y reporte útil
  ↓
Resolver recorrido, estados y permisos
  ↓
Ajustar la experiencia productiva
  ↓
Verificar circuito entre founder y receptor
  ↓
Ejecutar piloto medible
  ↓
Decidir lanzamiento ampliado
```

### Dependencies

1. El caso de uso determina si Roadmap y Data Room son core.
2. El reporte mínimo determina qué fuentes y métricas deben soportarse.
3. La política de faltantes determina estados, bloqueos y microcopy.
4. El modelo de distribución determina las pruebas de acceso.
5. La frecuencia de uso determina la ventana de retención.
6. La definición de activación determina la instrumentación.

---

## 15. Product Backlog

Owners propuestos por función; personas y disponibilidad: **FALTA INFORMACIÓN**.

| Priority | ID | Area | Task | Owner | Dependency | Status |
|---|---|---|---|---|---|---|
| P0 | B01 | Estrategia | Elegir ICP, JTBD y resultado del piloto. | PM + negocio | Ninguna | Decisión pendiente |
| P0 | B02 | Scope | Acordar reporte mínimo y camino de datos soportado. | PM + usuarios piloto | B01 | Pendiente |
| P0 | B03 | Validación | Definir cohorte, hipótesis y umbrales. | PM | B01–B02 | Pendiente |
| P0 | B04 | Core flow | Verificar actualización → persistencia → entrega → acceso. | QA + PM | B02, cuentas de prueba | No verificado |
| P1 | B05 | Navegación | Corregir pérdida de destino en ingreso directo. | Desarrollo | Reproducción observada | Pendiente |
| P1 | B06 | Reporting | Definir y presentar faltantes, período y condición de compartir. | PM + Diseño | B02 | Decisión pendiente |
| P1 | B07 | Confianza | Aclarar readiness, vigencia y estado de fuentes. | PM + Diseño | Definición de indicadores | Pendiente |
| P1 | B08 | Scope | Retirar integraciones sin valor actual del recorrido inicial. | PM + Desarrollo | B02 | Propuesto |
| P1 | B09 | Analytics | Verificar o incorporar los eventos mínimos. | Producto + Desarrollo | B03 | Estado actual desconocido |
| P1 | B10 | Feedback | Asignar canal, responsable y registro de asistencia. | PM | B03 | Pendiente |
| P1 | B11 | UX | Validar onboarding, errores, teclado y móvil del core. | Diseño + QA | B02, B05–B07 | Parcial |
| P2 | B12 | Expansión | Reconsiderar integraciones, IA y módulos adicionales. | PM | Resultados del piloto | Postergado |

---

## 16. Recommended Execution Order

### Phase 1 — Product Definition

1. Elegir un resultado y un segmento.
2. Acordar contenido mínimo, formato de entrada y criterio de reporte útil.
3. Definir hipótesis, cohorte y responsabilidad de seguimiento.

### Phase 2 — UX/UI

1. Diseñar el recorrido mínimo sobre producción.
2. Resolver significado de indicadores, períodos y faltantes.
3. Definir éxito, error, carga, vacío y recuperación de cada paso.

### Phase 3 — Development Readiness

1. Documentar criterios de aceptación del circuito.
2. Resolver navegación directa y ajustes críticos.
3. Verificar persistencia y acceso con dos roles.
4. Incorporar o comprobar medición y feedback.

### Phase 4 — Validation

1. Ejecutar sesiones con datos y destinatarios reales.
2. Registrar asistencia, tiempos, comprensión y utilidad.
3. Observar el siguiente ciclo y decidir según los umbrales.

### Phase 5 — Launch

1. Abrir el piloto cuando el circuito y sus permisos estén comprobados.
2. Ampliarlo cuando existan señales de utilidad y repetición.
3. Comunicar un alcance acorde con las capacidades verificadas.

---

## 17. MVP Launch Criteria

The MVP should not be considered ready until:

- [ ] Problem is clearly defined
- [ ] Target user is defined
- [ ] Value proposition is clear
- [ ] MVP scope is defined
- [ ] Core flow is defined
- [ ] Core UX is designed
- [ ] Critical states are defined
- [ ] Core requirements are documented
- [ ] Validation hypothesis is defined
- [ ] Critical metrics are defined
- [ ] Feedback mechanism exists

Criterios específicos de CloudValley:

- [ ] Abrir enlaces directos conserva la pantalla solicitada.
- [ ] El usuario comprende período, origen y faltantes del reporte.
- [ ] Los indicadores de preparación y calidad tienen significado explícito.
- [ ] El camino de actualización elegido produce valores persistidos.
- [ ] Un receptor autorizado accede al reporte correcto.
- [ ] La revocación y la falta de permisos se verifican con otra cuenta.
- [ ] Las integraciones ofrecidas en activación entregan valor observable.
- [ ] Existe una cohorte y un responsable del aprendizaje.

Los casilleros reflejan criterios **no acreditados completamente por esta auditoría**, no ausencia absoluta de implementación.

---

## 18. Top 5 Next Actions

### 1. Elegir qué resultado vende y valida el MVP

**Why:**
El producto soporta varios trabajos y todavía no está acreditado cuál debe organizar el lanzamiento.

**Owner:**
PM + responsable de negocio.

**Expected outcome:**
Una definición breve de ICP, problema, promesa, resultado y exclusiones.

### 2. Probar un reporte de punta a punta con dos roles

**Why:**
Se observaron preparación y estados de compartido, pero no se verificó el circuito completo.

**Owner:**
QA + PM + founder y receptor piloto.

**Expected outcome:**
Evidencia de actualización, persistencia, lectura autorizada y revocación.

### 3. Resolver comprensión de datos antes de compartir

**Why:**
La vista previa contiene métricas no disponibles y los indicadores globales pueden interpretarse de forma contradictoria.

**Owner:**
PM + Product Designer.

**Expected outcome:**
Reglas y mensajes claros para período, vigencia, faltantes y preparación del reporte.

### 4. Reducir fricción del recorrido productivo

**Why:**
Los enlaces directos pierden destino y existen integraciones que no alimentan las métricas.

**Owner:**
Desarrollo + Diseño.

**Expected outcome:**
Recorrido corto y recuperable, con un camino de datos que entregue valor.

### 5. Ejecutar un piloto con aprendizaje explícito

**Why:**
Sin cohortes, métricas y feedback no se puede distinguir interés inicial de valor repetido.

**Owner:**
PM.

**Expected outcome:**
Decisión fundamentada de ampliar, simplificar o revisar la propuesta.

---

## 19. Final Product Assessment

### Current State

**FACT:** CloudValley tiene una experiencia productiva con datos, fuentes, métricas, reportes, documentos y conexiones. La navegación interna permite recorrer componentes importantes del trabajo del founder.

La revisión no acredita todavía un lanzamiento autónomo de extremo a extremo ni una hipótesis de valor validada.

### Biggest Product Gap

La definición y demostración de un resultado principal: quién lo necesita, qué información basta, cómo se entrega y qué comportamiento confirma su valor.

### Biggest Scope Risk

Seguir ampliando integraciones, IA y preparación de ronda antes de demostrar que una cohorte completa y repite un circuito básico.

### Most Important Product Decision

**Elegir si el primer valor es reportar al fondo, preparar una ronda o recibir orientación operativa.**

Como hipótesis inicial, el reporte periódico ofrece un resultado concreto, observable y recurrente que aprovecha capacidades ya presentes.

### Minimum Path To MVP

```text
Elegir ICP y resultado principal
  ↓
Acordar datos y reporte mínimos
  ↓
Cerrar navegación, estados y comprensión
  ↓
Verificar entrega y permisos con dos roles
  ↓
Instrumentar aprendizaje y ejecutar piloto
  ↓
MVP Launch
```
