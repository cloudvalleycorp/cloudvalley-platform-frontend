# Mapeo de interacciones y campos del Founder

La sección `/redesign` usa registros locales de demostración. Este documento distingue el mapeo de formularios de la ejecución de operaciones de producción.

## Destinos corregidos

| Acción | Resultado |
| --- | --- |
| Tarjeta MRR, ARR, Runway o Margen | Abre el detalle de esa métrica; no la colección general. |
| Revisar estado de resultados | Abre la fuente correspondiente. |
| Abrir siguiente tarea | Abre la primera tarea pendiente mostrada en el roadmap. |
| Ver detalle en una fila | Abre un diálogo con el registro y sus campos persistidos. |
| Editar configuración | Abre el formulario de ese registro, con sus datos precargados. Al guardar actualiza el mismo ID. |
| Ver Data Room / Ver reportes | Navega a la sección nombrada. No promete filtrar por un fondo si no lo hace. |
| Guardar valor | Guarda por métrica, mes y escenario; forecast y presupuesto no sobrescriben el valor real. |
| Guardar configuración de fuente | Conserva el mapeo. No cambia su estado a “Al día” ni simula una sincronización exitosa. |
| Guardar accesos en la demo | Conserva visibilidad general, fondos individuales y vencimientos; no concede acceso real. |

Se reemplazaron flechas de salida por flechas internas, se agregaron nombres accesibles a las acciones y se mantuvo una indicación visible del destino. Se quitaron las pestañas de configuración, los resúmenes de conteos duplicados, los títulos promocionales y las descripciones que repetían el nombre de la sección.

## Campos contrastados con producción

| Operación | Fuente de producción | Campos en el rediseño |
| --- | --- | --- |
| Definir métrica | `useMetricPropertyForm.ts`, `MetricPropertyPanel.tsx` | `name`, `category`, `description`, `unit`, `why_it_matters`, `metric_type`, `input_key`, `value_type`, `currency`, `source_role`, privacidad y `query`. Reutiliza `QueryBuilder`, `QuerySummary`, `validateQuery` y validación de conflictos de rangos. |
| Cargar valores | `ScenarioEntryDialog.tsx`, `InputsPanel.tsx` | Período, escenario, valor; entradas separadas por mes/escenario. Las calculadas no permiten sobreescribir su resultado. |
| Crear tarea propia | `AddRoadmapTaskDialog.tsx` | Título, pilar, descripción, por qué importa, cómo hacerlo, vencimiento, criticidad, documento y reporte requeridos. Los IDs de pilares son ejemplos locales. |
| Agregar documento | `UploadDialog.tsx` | Nombre, tarea vinculada, archivo obligatorio, carpeta y visibilidad. Al elegir tarea se completa el nombre. Archivo guardado en IndexedDB, descargable y con vista previa para PDF/imágenes compatibles. |
| Accesos documentales | `ShareDialog.tsx` | Todos los fondos conectados, acceso individual por conexión y vencimiento opcional. Aclara que el acceso general incluye futuras conexiones y no queda revocado al quitar un acceso individual. |
| Crear reporte | `Reporting.tsx` | Nombre. Se quitó la categoría inventada del formulario anterior. El contenido se edita luego en el detalle de la demo. |
| Solicitar conexión | `Connections.tsx` | Selección de fondo y mensaje opcional. Se reemplazó el alta libre de un fondo por selección de un catálogo de ejemplo. No se envían emails. |
| Fuente y sincronización | `GrowthTrackerSheets.tsx`, `sheetsIntegration.ts` | Tipo de fuente, cuenta Google, planilla, hoja, uso de datos, modo de sincronización, frecuencia y hora UTC. Cuenta, planillas y columnas son ejemplos identificados como tales. |
| Mapeo tabular | `SaveSheetMappingTabularRequest` | Columna del período; columna e índice, clave, tipo y descripción de cada campo. Valida claves vacías y duplicadas. |
| Cuadrícula | `GridLayoutMapping.tsx` | Reutiliza el componente de producción: orientación, ejes de período y conceptos, claves, tipos y madurez del dato. |
| Vertical (EAV) | `EavLayoutMapping.tsx` | Reutiliza el componente de producción: columnas de período/métrica/valor, valores observados, claves, tipos y madurez. Valida que las columnas elegidas sean distintas. |
| Startup | `MyOrganization.tsx` | Nombre, industria, vertical, website, sitio público, LinkedIn, objetivo de ronda, número y año de cohort. |
| Perfil | `ProfileSection.tsx` | Nombre completo, rol y LinkedIn personal. |

Los borradores conservan los campos y la consulta estructurada. Los archivos deben volver a seleccionarse tras recuperar un borrador; se avisa junto al campo. Guardar desde la revisión agrega o actualiza el registro inmediatamente, sin una segunda confirmación de éxito que pudiera perder datos al cerrar.

## Límites explícitos

- No se ejecutan OAuth, reconocimiento de hojas, ingesta, sincronización, cálculos del backend, envío de solicitudes, subida de archivos ni permisos reales.
- Los ejes y valores observados de cuadrícula/EAV son fixtures; no se afirma haber extraído el contenido de un archivo seleccionado.
- Las tareas con evidencia se resuelven localmente: documento vinculado o reporte compartido con una conexión activa. Cualquiera de las dos evidencias satisface una tarea que requiere ambas, según el contrato de `lib/roadmap.ts`. Al retirar toda evidencia vuelven a pendiente.
- Los reportes tienen secciones, subtítulos y bloques de métricas, ordenamiento, vista previa por período, destinatarios y borrador persistente. La exportación usa imprimir/guardar PDF del navegador; no el servicio productivo de PDF.
- Perfil/equipo ahora reproducen foto y logo locales, cambio de email con confirmación simulada, invitaciones, solicitudes, roles, salida y reingreso. No se envían correos ni se modifican cuentas reales.
- Perfil y startup guardan por separado, para evitar que una acción guarde otros campos aún en edición.

## Validación

`node playwright/redesign.e2e.mjs` ejecuta `redesign-parity.e2e.mjs`: destinos de tarjetas y CTA, ocho rutas desktop/mobile, seis formularios, validaciones, borradores, edición sin duplicar registros, QueryBuilder, escenarios separados, referencias de archivo, accesos, configuración, mapeos tabular/grid/EAV y ausencia de llamadas a APIs productivas.

Lint del código nuevo y build verificados. TypeScript conserva el error preexistente TS2695 en `src/pages/Onboarding.tsx:97`, fuera de esta sección.

## Ampliación de flujos locales

- Conexiones: solicitudes recibidas y enviadas, aprobar, rechazar, cancelar y desconectar con confirmación. Desconectar revoca permisos individuales; los accesos generales requieren una conexión activa. El detalle abre los recursos compartidos concretos.
- Data Room: árbol de carpetas, búsqueda, renombrar, mover sin ciclos y eliminación de carpetas vacías. Los documentos conservan su archivo entre recargas; moverlos conserva sus permisos individuales.
- Métricas: valores sincronizados de solo lectura con enlace a la fuente; borradores separados por período/escenario, guardar con Enter, descartar y borrar valores manuales.
- `node playwright/redesign-workflows.e2e.mjs`: ciclo de conexiones, revocación, bloques y borrador de reporte, vista previa, fuente exacta, creación de carpeta, descarga comprobando bytes, movimiento y eliminación de archivos.
- `reconcileTaskEvidence.test.ts`: evidencia alternativa, retiro de documentos, fondos desconectados, reportes privados y conservación del estado manual.

La paridad integral sigue en curso. La ejecución de fuentes simuladas y las acciones de reportes incorporadas después de esta auditoría se detallan abajo. Esta lista no certifica que todos los flujos de producción estén reproducidos.

## Configuración y cuentas

- Foto y logo: formatos PNG/JPG/WEBP y límite de 5 MB; validación de contenido, almacenamiento en IndexedDB y actualización del shell sin recargar.
- Email: conserva el actual hasta la confirmación simulada; permite cancelar una solicitud pendiente.
- Equipo: invitaciones locales, aceptación simulada, aprobación/rechazo de ingreso, administración de owners, protección del último owner, salida y solicitud de reingreso. Sin membresía se bloquea el workspace; sin ownership se deshabilita la administración de startup/conexiones.
- Integraciones: Google Sheets con múltiples cuentas, reconexión y pausa; cuentas disponibles compartidas con el wizard de fuentes. Stripe/Mercury/Amplitude reproducen sus campos, conexión/desconexión y éxito/error de sincronización. No se guardan credenciales. Se conserva el límite productivo: estos tres proveedores no alimentan el módulo financiero actual.
- Verificado en navegador antes del bloqueo de herramientas: `redesign-settings.e2e.mjs` pasó perfil, imágenes, email, invitaciones, permisos, salida/reingreso y mobile. Las ampliaciones posteriores aún requieren volver a ejecutarlo.
- `redesign-integrations.e2e.mjs` detectó el cierre incorrecto del detalle al guardar desde otra sección; se corrigió con una selección pendiente asociada al cambio de ruta. La repetición quedó bloqueada por la revisión automática por límite de uso.

## Asistente transversal

Revisado contra `AppLayout.tsx`, `AssistantContext.tsx`, `PlatformAgentPanel.tsx`, `usePlatformAgent.ts` y `aiInsights.ts`. La demo tiene una sola conversación transversal y no usa `usePlatformAgent` porque ese hook llama a producción.

- Entrada persistente en el header de las ocho secciones; entradas contextuales en detalles, wizards, edición de valores, reportes, perfil/startup, cambio de email, integraciones y operaciones de carpetas.
- Contexto: sección, registro, borrador no guardado, mes/escenario y valor pendiente. En integraciones solo se registra si cada credencial está presente; nunca su contenido.
- Historial local, crear/renombrar/eliminar conversaciones, preguntas sugeridas por contexto, Enter para enviar y Shift+Enter para nueva línea, error simulado y reintento conservando el texto.
- Respuestas locales basadas en registros disponibles, con datos usados y acciones hacia recursos concretos. Se identifica expresamente como demo; no se presenta como respuesta de un modelo remoto.
- Propuestas de métricas/reportes y adición de una métrica al reporte actual. Se revisan antes de escribir; aplicar exige confirmación explícita en la tarjeta, evita duplicados y detecta cambios del registro desde que se propuso. Las propuestas aplicadas/descartadas conservan su estado al recargar.
- `assistantModel.test.ts` cubre propuestas sin escritura, consultas válidas, duplicados, conservación del borrador de reporte, período/escenario, campos incompletos y vencimientos de acceso.
- `redesign-assistant.e2e.mjs` preparado para verificar las ocho rutas, contexto de borrador, confirmaciones, destinos, historial, error/reintento, mobile y aislamiento de APIs. Pendiente de ejecutar: el revisor automático bloqueó nuevos lanzamientos de Chromium por límite de uso.

Actualización de validación: superado el bloqueo temporal del revisor, pasaron `redesign-assistant.e2e.mjs`, `redesign-settings.e2e.mjs`, `redesign-integrations.e2e.mjs` y `redesign.e2e.mjs`. Se verificó el asistente móvil y se corrigió su scroll al reabrir/cambiar viewport. `npm test -- --run`: 98 pruebas en 12 archivos aprobadas; build aprobado. TypeScript solo reporta el TS2695 preexistente de `Onboarding.tsx:97`.

## Accesos heredados de carpetas

Las carpetas guardan permisos por fondo y vencimiento, sin `is_public` (igual que producción). Los documentos y subcarpetas heredan permisos de sus ancestros, incluidos archivos nuevos; moverlos recalcula esa herencia y conserva permisos individuales. Revocar el permiso de una carpeta no elimina un permiso individual. Las conexiones inactivas y los permisos vencidos no conceden acceso.

El Data Room, el detalle del documento, los recursos de cada fondo y el asistente usan la misma resolución de acceso. El documento identifica de qué carpeta proviene un permiso y dónde revocarlo. Renombrar/mover una carpeta conserva sus permisos.

`documentAccess.test.ts` verifica herencia, movimiento, permisos individuales, raíz explícita, vencimientos, conexiones inactivas y ciclos. `redesign-folders.e2e.mjs` pasó permisos de carpetas, validación de vencimiento, acceso desde el fondo, explicación del asistente, persistencia, revocación y movimiento a raíz.

## Fuentes y resultados compartidos con el asistente

La importación local ofrece revisión de muestra sin escritura, sincronización idempotente, historial y errores parciales/de esquema. Preserva datos anteriores ante fallos y valida el estado de la cuenta conectada. Usa muestras explícitas; no lee servicios externos ni interpreta el contenido de archivos subidos.

Las métricas con QuerySpec calculan localmente sumas, promedios, conteos, filtros, ventanas de meses, referencias desplazadas y operaciones aritméticas. Los resultados identifican las fuentes importadas utilizadas. Se detectan falta de datos, referencias circulares, valores no numéricos y división por cero. Las muestras importadas corresponden únicamente al escenario real; los valores manuales mantienen sus escenarios separados. Los valores de ejemplo sin consulta no se convierten implícitamente en operandos numéricos.

La colección, el detalle, la vista previa/impresión del reporte y el asistente comparten el mismo resultado. El asistente respeta el mes y escenario del detalle y ofrece enlaces a las fuentes utilizadas. Todo permanece en la demo.

Validación del 20 de septiembre: 107 pruebas unitarias aprobadas en 14 archivos, build y lint de archivos modificados aprobados. `redesign-calculations.e2e.mjs` verificó fuente → métrica → asistente → reporte, cambios de período y mobile. `redesign.e2e.mjs` aprobó las ocho rutas y los formularios. Persiste el error TypeScript previo TS2695 en `src/pages/Onboarding.tsx:97`. Chromium se abrió con el asistente visible. Esta entrega no declara completada toda la paridad funcional del Founder.

## Vistas de métricas y gestión de reportes/fuentes

- Selector persistente entre tabla compacta, cards con historial disponible y grilla de doce meses. La grilla permite cambiar año/escenario y conserva la primera columna al desplazar. No se inventan series para las métricas sin historial numérico.
- Eliminar fuente: confirmación con métricas potencialmente afectadas, incluidas referencias indirectas. Se retiran configuración, filas importadas, historial y archivo local; se conserva la cuenta del proveedor. Las consultas vuelven a evaluarse sobre los datos restantes.
- Eliminar reporte: retira registro, borrador, accesos y actividad local. Conserva las métricas y recalcula evidencia de tareas. Cancelar no modifica los registros.
- Actividad de reportes: aperturas, segundos activos y porcentaje visto por fondo; eventos explícitamente simulados y persistentes. Solo fondos conectados con permisos guardados pueden generar lecturas. La vista previa del Founder no incrementa estadísticas. El asistente lee los mismos eventos.
- `redesign-deletion.e2e.mjs` aprobó cancelación, impactos, persistencia, limpieza de borrador/actividad y explicación del asistente. La prueba de cálculos ahora también verifica selector persistente, grilla y escenarios en móvil.

Pendientes de la paridad integral: administración avanzada de métricas (incluida eliminación conservando valores), salud de datos, resolución de entidades/duplicados, operaciones masivas de fuentes, eliminación de tareas propias y analítica documental. Requieren contrastar sus contratos antes de reproducirlos; no están declarados completos.
