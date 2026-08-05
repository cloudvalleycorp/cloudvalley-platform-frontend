# CloudValley — Guía de frontend

Este archivo documenta el design system y las convenciones que ya existen en el
código. No son sugerencias: son el resultado de una consolidación completa del
frontend (Design system, accesibilidad, performance, UX writing). Antes de crear
algo nuevo, revisá si ya existe un componente o patrón para eso — casi seguro que sí.

## Principio general: flujo continuo

Ninguna pantalla puede ser un callejón sin salida. Cada pantalla necesita:
- Una acción principal que permita avanzar.
- Una forma de volver, cancelar o recuperarse de un error.
- Una respuesta clara a "¿qué puedo hacer ahora?" en todo estado: carga, vacío,
  éxito, error, sin permisos.

Si al diseñar una pantalla no podés responder esa pregunta en cualquier estado,
rediseñá la interacción antes de escribir código.

---

## Design tokens (`src/index.css`, `tailwind.config.ts`)

Todo color es HSL vía custom properties, con soporte real de modo oscuro
(`:root` / `.dark`, más el toggle en `AppLayout`). **Nunca** uses colores
Tailwind crudos (`bg-purple-100`, `text-red-500`, etc.) sin su par `dark:` —
si necesitás un color categórico que no es "éxito/error", agregale la variante
oscura vos mismo (ver `RoleBadge.tsx` como referencia) y verificá el contraste
antes de asumir que se ve bien.

Tokens disponibles: `background`, `surface`, `foreground`, `muted-foreground`,
`tertiary` (texto más apagado que `muted-foreground`, usar con moderación),
`card`, `popover`, `primary`, `secondary`, `accent`, `destructive`, `success`,
`warning`, `border`, `input`, `ring`, más el set `sidebar-*`.

Contraste: todos los pares texto/fondo fueron verificados con la fórmula WCAG
(relative luminance). Si agregás un token nuevo, no lo hagas a ojo — calculá el
ratio antes de darlo por bueno.

Radio: `--radius: 0.75rem`, mapeado a `rounded-lg/md/sm`. Tipografía: Geist,
weight 500 en headings, letter-spacing ajustado — ya está en `@layer base`, no
lo reinventes por página.

Animación: `animate-fade-in` (definida en `tailwind.config.ts`) es la
transición estándar para contenido que aparece (ya integrada en `EmptyState`,
`SkeletonSection`, `LoadingCard`). Los overlays de Radix (Dialog, Sheet,
AlertDialog, Dropdown, Popover, Select, Tooltip) ya animan solos — no les
agregues nada.

---

## Componentes compartidos obligatorios

Antes de escribir un `<div className="border...">` a mano, revisá esta lista.

| Necesito... | Uso |
|---|---|
| Título de página + subtítulo + acción | `PageHeader` (ya wrappea la acción en `flex items-center gap-2` — no dupliques ese wrapper) |
| Tarjeta con título/descripción/acción | `SectionCard` (`padding="sm\|md\|lg"`, nunca un `p-X` inventado) |
| Tabla de datos | `DataTable` + `DataTableToolbar` para el buscador/filtros (ya maneja `overflow-x-auto`, no reimplementes la tabla) |
| Estado vacío | `EmptyState` (icon + title + description + action opcional). Nunca un `<p>Sin datos</p>` suelto. |
| Carga de sección/tabla | `SkeletonSection` (lista/tabla) o `LoadingCard` (card de detalle) — no "Cargando…" en texto plano salvo notas inline muy chicas (`LoadingState variant="inline"`) |
| Confirmar una acción destructiva | `ConfirmationDialog` — nunca un `AlertDialog` armado a mano, nunca "¿Estás seguro?" a secas |
| Formulario en modal | `FormDialog` |
| Campo de formulario (label + control) | `FormField` |
| Fila de guardar/cancelar | `FormActions` — siempre "cancelar" a la izquierda, acción primaria a la derecha, mismo alto en todos lados |
| Fila de label/valor con acción opcional | `InfoRow` |
| Badge de rol (admin/usuario/inversor) | `RoleBadge` |
| Badge de activo/inactivo | `StatusBadge` |
| Wordmark en pantallas sin sidebar (login, onboarding, invitaciones) | `BrandMark` |

**Antes de crear un componente nuevo**, preguntate si `PageHeader`/`SectionCard`
ya resuelven el problema (probablemente sí — ya wrappean su slot de acciones).
No creamos `PageActions`/`FormSection` porque, al investigar, resultaron
redundantes con lo que ya existe.

---

## Terminología (obligatoria, no es estilística)

- **Founder/rol `user`**: su cuenta se llama **"startup"**, nunca "empresa" ni
  "organización". Usá `entityWords(isFund)` de `@/lib/membership.ts` — ya
  resuelve género gramatical (`una startup` vs `un fondo`, `esta startup` vs
  `este fondo`, `de la startup` vs `del fondo`). No armes esos artículos a mano,
  ya hay bugs de concordancia que se arreglaron una vez, no los reintroduzcas.
- **Rol `investor`**: su cuenta es **"organización"** o **"fondo"** según el
  contexto ya establecido en cada pantalla — no lo cambies sin revisar todo el
  archivo.
- **"organización"** además significa, en otro contexto legítimo, las
  aceleradoras/fondos a los que una startup está afiliada (`Settings.tsx`,
  `OrganizationsPicker`) — ese uso es correcto y no se toca.
- **email**, no "mail" (146 usos vs 0 después de esta limpieza — no reintroduzcas
  la mezcla).
- **Eliminar**, no "Borrar". **Guardar**, no "Actualizar" para el mismo verbo.

## UX writing

- Tono voseo, directo, sin formalismos ("Por favor" no aparece en toda la app,
  no lo agregues).
- **Sin guiones largos (—)** en texto visible. Usá punto, coma o dos puntos.
  (El `"—"` como placeholder de "sin dato" en tablas SÍ está bien, es una
  convención de UI distinta — no es lo mismo.)
- CTAs con verbo claro ("Crear reporte", "Invitar por email"), nunca "OK",
  "Aceptar" o "Continuar" a secas salvo que el contexto ya lo deje clarísimo.
- Confirmaciones destructivas explican qué va a pasar, nunca "¿Estás seguro?"
  solo.
- Empty states explican qué significa y qué hacer, no "No hay datos".

---

## Accesibilidad

- Todo botón nativo (`<button>`) ya tiene foco visible por una regla global en
  `index.css` (`button { focus-visible:... }`) — no necesitás agregarlo a mano,
  pero tampoco lo pises con un className que quite el ring.
- Botón de solo ícono → `aria-label` obligatorio (aunque tenga `title`).
- `<div>`/`<tr>`/`<th>` con `onClick` → necesita `role="button"`, `tabIndex={0}`
  y `onKeyDown` para Enter/Espacio. Mirá `DataTable.tsx` o el card de
  `Reporting.tsx` como referencia.
- Input con solo `placeholder` → agregale `aria-label` con el mismo texto.
- Mensaje de error/estado que aparece dinámicamente (no en el load inicial) →
  `aria-live="polite"` en el contenedor.
- Estado que se comunica solo con color → agregale un ícono, texto o punto
  visual además del color.
- `AppLayout` ya tiene skip-link a `#main-content` — no lo dupliques por página.

## Performance

- Rutas nuevas que sean exclusivas de un rol (admin/inversor/founder) van con
  `React.lazy()` en `App.tsx`, agrupadas junto a las de su mismo rol — así un
  admin nunca descarga el chunk de gráficos (`recharts`) que solo usan
  founder/inversor.
- `vite.config.ts` ya separa vendors (`react`, `radix-ui`, `supabase`,
  `@tanstack/query`) en chunks propios — no lo desarmes.
- Si un `.filter()/.map()/.sort()` corre en cada render y depende de un input
  de búsqueda, envolvelo en `useMemo`. Si no depende de nada que cambie
  seguido, no hace falta.
- Nunca definas un componente (función que devuelve JSX) *dentro* del cuerpo de
  otro componente — se re-crea en cada render y React lo remonta entero. Sacalo
  al scope del módulo.

## Responsive

- Cualquier tabla o contenido más ancho que su contenedor necesita
  `overflow-x-auto` en el wrapper (no `overflow-hidden`, eso recorta contenido
  en vez de dejarlo scrollear).
- Grids de 3+ columnas necesitan breakpoint (`grid-cols-1 sm:grid-cols-3`, no
  `grid-cols-3` pelado) — a 2 columnas es tolerable sin breakpoint si los campos
  son cortos, pero no lo des por sentado.

---

## Verificación

Todo cambio se valida con:
```
npx tsc --noEmit
npm run build     # revisá que no aparezca "chunks larger than 500kB" de nuevo
npx vitest run
```

Además hay un navegador real conectado vía Playwright MCP (`.mcp.json`,
`playwright/`, ver `playwright/README.md`) que reutiliza una sesión logueada
existente sin tocar el flujo de Magic Link. Después de cualquier cambio de UI
no trivial (nuevo componente, layout, formulario, estado vacío/error, o
retoque de estilos):
1. Asegurate de que `npm run dev` esté corriendo (levantalo en background si
   no) y navegá a las rutas afectadas (`src/App.tsx` tiene la lista).
2. Interactuá con el flujo real (clicks, forms, distintos anchos de viewport
   para responsive) y sacá capturas.
3. Revisá `browser_console_messages` (sin errores nuevos) y
   `browser_network_requests` (sin 4xx/5xx inesperados).
4. Contrastá contra las secciones de este archivo (Accesibilidad, Responsive,
   Design tokens, UX writing) y corregí lo que encuentres antes de dar el
   cambio por terminado — no lo dejes para "una pasada después".

Si algo no se puede verificar así (requiere datos que no existen en la sesión
de prueba, un rol al que no tenés acceso, o es un juicio estético subjetivo),
decilo explícitamente como no verificado en vez de darlo por bueno.
