# Backlog

Pendientes que quedaron fuera de la sección que estamos cerrando. Cada ítem dice
qué falta, de quién depende y qué decisión está abierta. Se actualiza a medida
que se resuelve.

Última actualización: 2026-10-07.

---

## KPIs (cerrado)

Verificado:
- Dashboard del founder: selección de KPIs guardada en backend (`get-dashboard-kpis` / `set-dashboard-kpis`), sin localStorage. Default cuando el backend responde `null`. Guardado y restauración en vivo con la cuenta Maritos V3.
- Métricas > Overview: usa la misma preferencia que el Dashboard (una por startup).
- Orden canónico al guardar, igual en Dashboard y Métricas.
- Errores: 400 con `invalid_metric_ids` quita los ids del borrador y avisa; 401 manda a login.

**Fix 2026-10-07**: Overview solo dejaba prender/apagar los 8 KPIs estándar
(dropdown propio), sin poder elegir una métrica propia como sí se podía desde
el Dashboard — bug real reportado en vivo ("no puedo escoger las métricas").
Se extrajo el picker completo del Dashboard a un componente compartido
(`src/components/metrics/KpiPickerDialog.tsx`, con buscador y grupos
Estándar/Propias) y Overview pasa a usarlo igual que el Dashboard. La grilla
de Overview ahora también renderiza las métricas propias elegidas (antes el
id quedaba guardado en el backend pero Overview lo ignoraba en silencio:
confirmado en vivo que la cuenta de test ya tenía `total_monto_transacciones`
guardado de una sesión anterior y nunca se mostraba). Verificado en vivo:
abrir el picker en Overview, elegir/sacar una propia, guardar, recargar.

Decisiones tomadas:
- Último que guarda gana (sin control de concurrencia).
- Las selecciones viejas de localStorage se descartan, no se migran.
- Un cambio de KPIs no actualiza el default si después aparece una métrica estándar nueva: la lista guardada queda fija.

## Cargar escenario (forecast/presupuesto) — discoverabilidad (cerrado 2026-10-07)

Reportado en vivo: "no encontré la manera de cargar escenarios forecast o
presupuesto en los flujos". El único punto de entrada era el botón "Cargar
escenario" dentro de Métricas > Explorador — Overview ya tenía un selector
Real/Forecast/Presupuesto para VER el escenario, pero elegir Forecast/
Presupuesto ahí no mostraba ningún link a dónde cargar esos valores.

Fix: cuando el escenario de Overview no es "Real", aparece un texto con
link ("Cargar forecast en el Explorador") que navega a
`/metrics?tab=explorer&scenario=1`; `MetricsExplorerTab.tsx` lee ese
query param (mismo patrón que `?fulfill=`), fuerza `pageMode="data"` y abre
`ScenarioEntryDialog` ya con el escenario correcto preseleccionado. Verificado
en vivo de punta a punta: Overview → Forecast → click → Explorador con el
diálogo abierto en "Forecast" → URL limpia (sin `?scenario=`).

**Confirmado, no es un bug**: el diálogo solo lista las métricas
`metric_type === "input"` (hoy 5 en la cuenta de test: CAC, Headcount,
Clientes Nuevos, Registros, Clientes Perdidos) porque son las únicas que se
cargan a mano — una métrica calculada deriva su forecast de las de tipo
input una vez que esas tienen valor cargado para el período, y una métrica
de tipo query viene de una fuente conectada, no se puede sobrescribir a
mano. "Todas las métricas" no aplica: no tendría sentido pedirle al
founder un número para algo que ya se calcula solo.

---

## Gráficos con KPIs (pausado)

Opción A aprobada: un gráfico por unidad, para no mezclar escalas. Implementada en
el PDF (`reportPdf.ts`) y en la app (`UnitGroupCharts.tsx`, vista previa y edición).

Pendiente:
- **Modelo de bloques** (decidir y pedir al backend): hoy cada sección tiene bloques
  `{ metric_id }`. Lo propuesto es separar `kpi` de `chart`:
  `{ type: "kpi", metric_id }` y `{ type: "chart", metric_ids: [...], title? }`.
  Un gráfico puede estar en otra sección que sus KPIs. Pendiente confirmar el modelo.
- **Backend**: `get-financial-report` y `update-financial-report` necesitan el nuevo
  tipo de bloque. Hoy la respuesta en vivo solo trae `metric_id`. Pendiente prompt
  con el contrato y confirmación de despliegue.
- **Selección de métricas por gráfico**: depende del modelo anterior. La decisión
  tomada es que arranquen sin graficar cuando se agregan al reporte.
- **PDF**: debe mostrar lo mismo que el reporte. Los KPIs van en su slide y cada
  gráfico en la sección donde está. Depende del modelo de bloques. Hoy el PDF
  16:9 no dibuja gráficos (ver "Founder").
- **Chips de KPIs en la app**: hoy solo apagan la línea de forma temporal. Decidir
  si la elección se guarda con el bloque del gráfico.
- **Verificación en vivo** de la vista previa con gráficos. Requiere sesión vigente
  (`npm run playwright:login`).

---

## Notas por sección

- **Campo visible en el editor**: implementado (`SectionNotesField`), colapsado por
  defecto, hasta 500 caracteres, texto de ayuda y "Quitar nota". Verificado en vivo
  en las tres secciones del Reporte de Abril.
- **Propuesta del asistente**: la tarjeta de propuesta y el aviso de conflicto en el
  panel están implementados, pero sin verificar en vivo (requiere una propuesta real
  del agente).
- **Mostrar las notas en la app** (vista previa): no implementado. El PDF ya las
  muestra en la primera slide de la sección.
- **Flujo del asistente en vivo**: propuesta (`propose-section-notes`), confirmación
  (`set-report-section-notes`), `conflict` y `forbidden`. Sin verificar en vivo: requiere
  una propuesta real y escribir en el reporte real.
- **Backend**: la forma `result.proposed` de la propuesta todavía no está desplegada.
  Hoy la app acepta los campos planos y también `result.proposed`.
- **Mockup de notas**: el contador "X / 500" sale del reporte (PDF) pero queda en el
  editor. Confirmar si también sale del editor.

---

## Highlights

- **Backend**: `description` sin texto válido debe omitirse. El cambio está en el
  repo (commit `6cf4861`) pero no desplegado. Avisar cuando esté.
- **Backend**: el modelo no debe recibir `metric_id` en el prompt. Ya corregido en el
  repo, falta confirmar en vivo.
- **Backend**: con `net_new_mrr` el highlight dice "El MRR se mantuvo...". Confirmar
  que el nombre visible corresponde a esa métrica.

---

## Founder

- **PDF horizontal 16:9**: implementado con portada, una slide por sección con sus
  KPIs (seis por slide), slides de continuación y la nota de la sección en la primera
  slide. Aprobado en el mockup `FYhHstsEyL8BJtVSBsyobh`. Pendiente: los gráficos con
  ejes, que dependen del modelo de bloques.
  **Verificado de punta a punta** (2026-10-07): exportación real desde el Reporte de
  Abril, PDF de 5 páginas (720×405 pt = 960×540 px), la segunda sección (7 métricas)
  generó su slide de continuación, valores y faltantes coinciden con la pantalla. Se
  corrigió el título de la portada, que se partía en dos líneas. Pendiente: la
  pestaña que abre el botón "Exportar PDF" queda en blanco en el navegador del MCP
  en vez de navegar al PDF (el enlace que devuelve el backend funciona bien
  descargado aparte); no se pudo determinar la causa en esta sesión.
- **Editor de notas**: ver "Notas por sección".
- **Explorar del Dashboard**: decidir si se quita (duplica la navegación del sidebar).
- **Título con peso 500 o más liviano**: decisión pendiente. Hoy está en 500.
- **MetricValueCard**: corregido. El botón de info tenía un margen negativo a la
  derecha que lo empujaba 6 px fuera de la tarjeta a 375 px. Verificado en vivo en
  Métricas > Overview. Componente compartido con Investor: falta la regresión visual
  de ese rol.
- **EmptyState, botón de acción**: a 375 px el botón "Buscar mejoras" (y
  seguramente otros con texto largo) queda unos 10 px más ancho que su
  contenedor (`p-12` del EmptyState). No genera scroll de página, pero conviene
  revisar el padding responsive del componente. Encontrado en Métricas > Overview,
  es compartido por toda la app.
- **Reportes de prueba**: "Test" (borrador) y "Reporte de Abril". Borrar requiere OK.
- **Mockups pendientes** de las pantallas sin mockup: Roadmap, Métricas, Sheets,
  Data Room, Settings y Conexiones, Onboarding. Decidir si se hacen antes de cerrar.
- **IntegrationsSection**: sigue llamando a `supabase.functions.invoke("integrations")`.
  Pedido de dejarlo así.
- **Verificación de exportar PDF de punta a punta**: pendiente.

---

## Investor

- **Overview**: falta el tope de 5 en "Cumplimiento del portfolio" con link a Gestión.
  Necesita mockup o decisión.
- **Overview**: "Updates recientes" y "Actividad reciente" muestran el mismo tipo de
  evento. Propuesta: dejar uno.
- **Portfolio, Company, Tasks, Gestión**: sin cerrar.
- **Verificación**: sin cuenta de investor en esta sesión.

---

## Admin

- **Ecosistema (dashboard)**: se construyó sin mockup aprobado.
- **Resto de pantallas**: sin cerrar.

---

## Auth

- **Login, Onboarding, Invitations**: sin cerrar.

---

## Backend (general)

- Confirmar la revisión y fecha de despliegue de: `evaluate-metrics`,
  `list-metric-highlights`, `list-raw-field-values`, `get-financial-report`,
  `update-financial-report`, `platform-agent`, `get-dashboard-kpis`,
  `set-dashboard-kpis`. No hay `gcloud` en esta máquina.
- Tests de cero real, celda vacía y período sin filas (`tests/test_smoke.py` en el
  commit `6235d73`): no corrieron en esta máquina porque falta `pytest`. Confirmar que
  pasan en el commit desplegado.
