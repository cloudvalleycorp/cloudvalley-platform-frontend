# Design system — Founder Command Center (Dashboard / Roadmap / Data Room)

Este documento fija el lenguaje visual que se definió en el mockup aprobado del
refactor de Dashboard/Roadmap/Data Room, para que no se pierda entre el
mockup y la implementación real (Fase 1 en adelante). Es un complemento de
[`CLAUDE.md`](../CLAUDE.md) — ese archivo sigue siendo la fuente de verdad de
los tokens base y las reglas generales del proyecto; acá solo se documenta lo
que este refactor agrega o instancia por primera vez.

- Mockup publicado: https://claude.ai/code/artifact/54175b33-b8f0-4afd-9d26-1001994d2dc1
- Plan de implementación: `C:\Users\mabus\.claude\plans\prompt-m-tricas-whimsical-wall.md`

**Alcance de este documento — dos niveles distintos, pedido explícito del
usuario:**
- Las secciones 2, 3 y 4 (tipografía/layout, componentes nuevos, íconos) son
  específicas de este refactor: Dashboard, Roadmap y Data Room del founder.
- Las secciones **1 (tokens `-dark`)** y **5 (convención de query params)**
  quedan declaradas como **estándar de toda la plataforma** desde esta
  pasada, no solo de estas 3 páginas — cualquier pantalla nueva en cualquier
  parte del producto (founder, investor, admin) las reusa en vez de inventar
  una convención propia. No implica migrar ahora mismo pantallas existentes
  que no las usan todavía (ver detalle de alcance en cada sección).

**Importante:** el mockup está escrito en HTML/CSS a mano porque corre en el
sandbox de Artifacts (no tiene acceso a React/Tailwind/shadcn ni a
`lucide-react`). Al implementar en el repo real **no se porta ese CSS
literal** — se usa Tailwind + los componentes compartidos de
`src/components/ui` y `src/components/*` que ya existen, siguiendo la tabla
de equivalencias más abajo.

---

## 1. Tokens nuevos

Se agregaron 3 tokens a `src/index.css` / `tailwind.config.ts` durante esta
pasada, ya mergeados al repo:

```css
/* :root (light) */
--success-dark: 135 45% 30%;       /* #2A6F3B */
--warning-dark: 39 90% 32%;        /* #9B6808 */
--destructive-dark: 3 90% 40%;     /* #C2130A */

/* .dark — mismo valor que el token base, ver razón abajo */
--success-dark: 135 55% 52%;
--warning-dark: 39 90% 60%;
--destructive-dark: 3 90% 64%;
```

Expuestos en Tailwind como `text-success-dark` / `text-warning-dark` /
`text-destructive-dark`.

**Por qué existen:** se encontró, al construir el mockup, que los tokens base
`--success`/`--warning`/`--destructive` no pasan WCAG AA (4.5:1) como texto
sobre blanco/card — verificado con la fórmula de luminancia relativa, no a
ojo, tal como pide `CLAUDE.md`:

| Token base como texto sobre blanco | Contraste |
|---|---|
| `--destructive` (#FF3B30) | ~3.55:1 (falla) |
| `--success` (#34C759) | ~2.22:1 (falla) |
| `--warning` (#FFB830) | ~1.75:1 (falla) |

Esto **ya es un problema real en el código actual**, no solo del mockup: 34
archivos usan `text-destructive`/`text-success`/`text-warning` hoy
(`grep` confirmado), incluyendo texto chico real como el delta de
`InvestorCompany.tsx:708` (`text-xs`, 12px, `text-success`/`text-destructive`
para "↑ 4.2%"/"↓ 4.2%"). Corregir esas 34 instancias es un barrido aparte,
más grande que agregar el token — **queda pendiente de decisión del usuario
si se hace ahora o después**, no se tocó en esta pasada.

`--success-dark`/`--warning-dark`/`--destructive-dark` sí pasan (6.11:1 /
4.81:1 / 6.20:1 contra blanco). En dark mode no hizo falta un valor propio:
el token base ya se sube de luminosidad ahí (mismo criterio que el resto del
archivo) y da de sobra (5.77:1 a 10.29:1 contra el fondo oscuro), así que
`-dark` reusa el mismo valor que su base en `.dark`.

**Cuándo usar cada uno:**
- Texto (deltas "+18%"/"-2.3 meses", labels de riesgo, variación en tablas) → `text-success-dark` / `text-warning-dark` / `text-destructive-dark`.
- Fill de badge/dot/ícono sobre fondo tinteado (ej. `bg-destructive/10` con un ícono adentro) → el token base sigue siendo correcto, ahí aplica el piso de contraste 3:1 de "componente UI", no el 4.5:1 de texto.

El token de marca `--teal` (`#2EC4B6`, oportunidad) ya existía — no es nuevo,
pero es el que distingue "oportunidad" de "riesgo" en el nuevo patrón de
Risks & Opportunities (riesgo = destructive/warning, oportunidad = teal).

---

## 2. Tipografía y layout

- Fuente: Geist (ya cargada en `@layer base`, no se reinventa). Headings
  weight 500, body 400.
- Escala usada en el mockup: título de página 22px, título de sección 15px,
  valor de KPI 20px (con `tabular-nums`), body 13-13.5px, caption/meta
  11-12px.
- Shell: sidebar 232px fijo, topbar 56px sticky con blur. Contenido máximo
  1180px centrado.
- Spacing entre secciones de página: equivalente a `space-y-6`. Cards:
  `SectionCard` (`padding="md"`), radio `--radius` (0.75rem) en todo.
- Grilla de KPIs: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` en desktop
  (el mockup usa 4 columnas fijas; en la implementación real seguir el
  patrón responsive ya usado en `InvestorOverview.tsx`:
  `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` para tiras de KPI más angostas,
  ajustar según cuántos KPIs tenga visibles el `CompanyHealthStrip`).

---

## 3. Patrones de componente nuevos

Nombres tal como quedaron definidos en el plan (Fase 4) — folder destino
`src/components/dashboard/`:

| Patrón (mockup) | Componente real | Notas de implementación |
|---|---|---|
| Card degradé coral sutil con prosa + chips | `ExecutiveSummaryCard` | Fondo `primary-subtle → card`, borde `primary-light/45`. Chips = `action_requests` de `platform-agent`, re-preguntan al click (mismo patrón que `PlatformAgentPanel.tsx`). |
| Tile de KPI (valor + trend + dot de estado) | `CompanyHealthStrip` (grid de tiles) | Dot de severidad (`success`/`warning`/`destructive`, fill base, no `-dark`) + flecha de tendencia con `text-success-dark`/`text-destructive-dark` según si la dirección es buena o mala (ojo: no es "arriba=verde" fijo, ej. burn hacia arriba es malo). |
| Tile vacía con borde punteado | estado vacío de `CompanyHealthStrip` | `border-dashed`, linkea a `/metrics?tab=explorer`. |
| Fila de "qué cambió" con expander "¿Por qué?" | `WhatChangedSection` | El expander pide la explicación causal a `platform-agent` (Fase 4d del plan), no viene precargada. |
| Card de riesgo/oportunidad (borde lateral de color + Impact/Confidence/Why/Acción) | `RiskOpportunityCard` | Borde izquierdo 3px: `destructive` (riesgo alto), `warning` (riesgo medio), `teal` (oportunidad). `sourceHref` es obligatorio en el tipo (ver plan, Fase 4). |
| Lista con headers de grupo "Tareas propias" / "Pedidas por tus inversores" | `ActionCenterSection` | Agrupar por `RoadmapTask.scope` (`"startup"` / `"fund"`), **no** por criticidad como en el borrador anterior del plan — ver Fase 4 del plan para el detalle del ajuste. |
| Anillo de porcentaje + lista de issues con ícono/CTA | `DataReadinessSection` | Cada fila linkea a `issue.targetPath` tal cual lo devuelve `collectDataHealthIssues` — nunca reinterpretar el link. La fórmula exacta del % del anillo todavía no está definida (ver plan, es v1 "score agregado por severidad" a definir en implementación, no prometer un número exacto todavía). |
| Tabla Actual/Target/Variación/Tendencia/Forecast | `PerformanceVsPlanSection` | Variación en rojo (`text-destructive-dark`) solo si es peor que el plan, no por signo aritmético (ej. burn +$32K es "peor" en rojo, un burn -$32K sería mejor y no debería ir en rojo). |
| Grid de 4 cards con ícono + stat + "Ver X →" | `ExploreSection` | Reusa el mismo look para las 4 secciones (Métricas/Roadmap/Data Room/Reporting), cada stat sale de un hook ya existente (ver Fase 4/tabla de endpoints del plan). |
| Banner "Llegaste desde…" | callout de contexto en `Roadmap.tsx`/`DataRoom.tsx` | Fondo `teal-subtle`, se muestra solo cuando la página se abrió con `?highlight=`/`?doc=` (Fase 5/6 del plan), desaparece al navegar manualmente. |
| Badge "Nuevo" junto al botón Asistente | no persistente — solo mientras se lanza la Fase 2 | Quitar una vez que founders lo tengan hace un tiempo, no dejarlo para siempre. |

---

## 4. Iconografía

El mockup dibuja SVGs simplificados a mano porque el sandbox de Artifacts no
carga `lucide-react`. **En la implementación real usar siempre los íconos de
`lucide-react`** (ya es la librería del proyecto, ver `InvestorOverview.tsx`
por ejemplo) con esta equivalencia:

| Concepto en el mockup | Ícono `lucide-react` |
|---|---|
| IA / Asistente / resumen ejecutivo | `Sparkles` |
| Buscar | `Search` |
| Tendencia buena | `TrendingUp` |
| Tendencia mala | `TrendingDown` |
| Riesgo crítico | `AlertCircle` |
| Riesgo/alerta media | `AlertTriangle` |
| Estado sano / hecho | `CheckCircle2` |
| Documento | `FileText` |
| Ir a / explorar | `ArrowRight` / `ChevronRight` |
| Expandir "¿Por qué?" | `ChevronDown` |
| Roadmap | `Map` (ya usado en `Roadmap.tsx`) |
| Data Room | `FolderOpen` o el mismo ícono que ya usa `DataRoom.tsx` |
| Tareas / Action Center | `ListTodo` (ya usado en `InvestorOverview.tsx`) |
| Actividad | `Activity` |

---

## 5. Direcciones escalables (deep-link por query param)

Ajuste pedido explícitamente por el usuario: cualquier "detalle dentro del
detalle" (un KPI puntual, una tarea, un documento, un issue) tiene que poder
identificarse en la URL con un query param de una sola clave = id de la
entidad enfocada, nunca un estado que solo vive en memoria de React — es el
mismo criterio que ya usa `InvestorCompany.tsx` con `?tab=`/`?report=`/`?doc=`
(ver plan, Fase 5/6), extendido a todas las subsecciones nuevas del
Dashboard, no solo a la navegación entre páginas.

Convención: una clave por tipo de entidad, reusada en cualquier página que la
necesite (nunca una clave nueva por pantalla):

| Param | Identifica | Dónde se usa |
|---|---|---|
| `metric=<metric_id>` | Un KPI/métrica puntual | Dashboard: enfoca/scrollea la fila en Company Health, What Changed o Performance vs Plan |
| `task=<startup_task_id>` | Una tarea de Roadmap | Dashboard → Roadmap |
| `doc=<document_id>` | Un documento de Data Room | Dashboard → Data Room |
| `issue=<issue_id>` | Un issue de Data Readiness | Dentro del Dashboard, o hacia el destino que resuelve `issue.targetPath` |
| `signal=<risk_or_opportunity_id>` | Una card de Riesgo/Oportunidad | Enlazar/compartir una card puntual de esa sección |

**Corrección aplicada al plan por esto:** el borrador original usaba
`?highlight=<startup_task_id>` para el deep-link de Roadmap, pero "highlight"
ya es el nombre del objeto que devuelve `list-metric-highlights` (la sección
"Qué cambió") — se renombra a `?task=` en la Fase 5 del plan para que cada
clave identifique un solo tipo de entidad en toda la plataforma, sin
colisión semántica entre secciones.

---

## 6. Qué NO está resuelto todavía (a definir en implementación, no inventar)

- Fórmula exacta del % de Data Readiness (el mockup muestra "82%" ilustrativo).
- Nombre del fondo en tareas `scope="fund"` — v1 solo tiene el nombre de la
  persona (`requested_by_name`); el nombre del fondo es pedido de backend
  (Fase 8 del plan).
- El contenido específico de "por qué cambió" con cifras muy granulares
  (cantidad de contrataciones, monto de infraestructura) que muestra el
  mockup es **ilustrativo de lo que la IA podría responder si esos datos
  están conectados** — la respuesta real de `platform-agent` va a ser tan
  específica como los datos que la company tenga cargados, no va a tener esa
  granularidad para todas las startups. Ver aviso completo en el mensaje de
  cierre del mockup.
