# Founder redesign

Actualización: el alcance y los formularios vigentes están en [Mapeo de interacciones y campos](./founder-redesign-input-mapping.md). Ese documento reemplaza las descripciones del wizard genérico, la privacidad predeterminada y el perfil simplificado de esta primera versión.

Propuesta interactiva disponible en `/redesign`, separada de las pantallas productivas. No necesita login. Los registros son ejemplos y se guardan en el navegador con claves `cloudvalley-redesign-v1*`. No se conectan servicios ni se suben archivos. La aplicación original se carga por separado desde `main.tsx`.

## Inventario y alcance

| Área productiva | Implementación revisada | Propuesta |
| --- | --- | --- |
| `/dashboard` | ExecutiveSummaryCard, CompanyHealthStrip, WhatChangedSection, RisksOpportunitiesSection, ActionCenterSection, DataReadinessSection, PerformanceVsPlanSection | `/redesign/overview`: resumen, KPIs, evolución, preparación de ronda, prioridades y actividad. Las series y deltas son ejemplos fijos; el avance del roadmap y las prioridades se derivan de los registros de la demo. |
| `/metrics`, `/metrics/:metricId` | MetricsOverviewTab, MetricsExplorerTab, MetricInfoSheet, MetricPropertyPanel, escenarios, historial, QueryBuilder | `/redesign/metrics`: búsqueda, filtro, orden, paginación, detalle, edición de valor, alta y borrador. |
| `/metrics?tab=sources`, `/metrics?tab=health`, `/growth-tracker/sheets` | MetricsDataSourcesTab, MetricsDataHealthTab; wizard de Sheets/Excel; mapeo grid/EAV; resolución de entidades y duplicados | `/redesign/sources`: colección, detalle de mapeo y wizard de configuración local. |
| `/roadmap` | RoadmapTaskList, RoadmapTaskDetailSheet, AddRoadmapTaskDialog, FolderPickerDialog | `/redesign/roadmap`: tareas, progreso, creación, completar y reabrir. |
| `/reporting`, `/reporting/:reportId` | FormDialog de creación, ReportEditor, bloques y ReportAnalyticsSheet | `/redesign/reports`: alta paso a paso, edición de contenido y exportación de texto. |
| `/data-room` | Carpetas, DocumentRow, UploadDialog, ShareDialog, AccessManagementTab, analytics y confirmaciones | `/redesign/documents`: colección, detalle, referencia de archivo y simulación explícita de acceso/revocación. |
| `/conexiones` | Solicitudes, invitaciones, gestión y desconexión | `/redesign/connections`: colección de relaciones y creación de solicitud local. |
| `/settings`, `/account` | ProfileSection, MyOrganization, OrganizationSection, IntegrationsSection, privacidad | `/redesign/settings`: perfil editable persistente, vista del equipo y explicación de privacidad. |

## Hallazgos y decisiones

- El portal distribuye una misma preparación de ronda entre métricas, fuentes, tareas, reportes y documentos. El dashboard nuevo prioriza acciones y permite abrir su contexto.
- Hay encabezados de tamaño compacto y estándar, contenedores con distintos anchos y múltiples patrones de acciones. La propuesta unifica shell, títulos, filtros y detalles.
- Las fuentes requieren flujos extensos: planilla/archivo, hoja, reconocimiento, mapeo y resultado. La propuesta muestra progreso, validación, guardado de borrador y revisión final; no reproduce el procesamiento real de datos.
- La navegación de métricas se subdivide mientras otras áreas usan pestañas o listas. Las ocho áreas de esta propuesta tienen rutas directas y navegación consistente.
- Los errores y vacíos deben diferenciarse. Cada colección permite revisar estados de contenido, skeleton, vacío y error recuperable desde un control explícito de demo.
- La colección usa filas en escritorio y tarjetas en móvil. Los overlays reutilizan Radix Dialog para Escape, foco y semántica accesible. El menú móvil cerrado queda fuera del recorrido de teclado.

## Sistema visual y reutilización

Los tokens están limitados a `.rd-root` en `src/redesign/redesign.css`. Coral para acciones y marca; teal para crecimiento y confirmación; superficies cálidas, bordes suaves, sombras leves; tipografía Geist con fallback de sistema. Se mantienen los nombres de tokens compartidos para reutilizar componentes sin modificar el tema productivo.

Reutilizados: `PageHeader`, `SectionCard`, `EmptyState`, `FormField`, `SkeletonSection`, `Button`, `Input`, `Dialog`. Nuevos elementos de la propuesta: shell Founder, colección responsive, badges semánticos, indicador de pasos, wizard compartido, gráfico ilustrativo y tarjetas de performance. Sin nuevas dependencias.

## Flujos y persistencia

El wizard compartido cubre métrica, fuente, tarea, reporte, documento y solicitud de conexión: datos esenciales → configuración → revisión → confirmación. Valida nombre, permite volver/cancelar, conserva un borrador con su paso y muestra estado de creación y éxito. El archivo elegido sirve de referencia; su contenido no se conserva. La demo mantiene un borrador global a la vez.

Los detalles permiten editar valores/notas, completar tareas, editar/exportar reportes y simular accesos documentales. La búsqueda global se abre con Ctrl/Cmd K. El perfil conserva nombre, etapa y descripción.

## Límites de esta entrega

Es una sección para revisar el rediseño, no una migración funcional del producto. Quedan en producción, sin reemplazarse: permisos y roles reales, onboarding, invitaciones, OAuth, APIs, queries/mutations, subida y descarga de archivos, carpetas, analytics reales, fórmula/QuerySpec, períodos y escenarios, resolución de duplicados, editor de bloques, PDF, administración del equipo y ownership. El tema de esta propuesta es claro, independientemente del tema de producción.

La integración posterior debe conservar contratos, `company_id`, permisos de owner, privacidad, validaciones y errores del backend. La exportación de la demo es TXT, no PDF; sus accesos no conceden permisos reales.

## Verificación

- `node playwright/redesign.e2e.mjs`: ocho rutas a 1440 y 390 px; sin overflow horizontal; validación, borrador tras recarga, creación/edición/persistencia de métrica, filtros, retry, roadmap, búsqueda global; sin errores de JavaScript ni llamadas a hosts de APIs productivas.
- Capturas: `playwright/artifacts/redesign-desktop.png`, `redesign-mobile.png`, `redesign-wizard.png`.
- `npx.cmd eslint src/redesign src/main.tsx`: aprobado.
- `npm.cmd run build`: aprobado.
- `npm.cmd test`: 84 tests aprobados en 9 archivos.
- `npx.cmd tsc --noEmit -p tsconfig.app.json`: bloqueado por error preexistente TS2695 en `src/pages/Onboarding.tsx:97`; sin errores reportados en los archivos nuevos.

Para abrir la entrega: iniciar `npm.cmd run dev -- --host 127.0.0.1` y ejecutar `node scripts/playwright/open-redesign.mjs`.
