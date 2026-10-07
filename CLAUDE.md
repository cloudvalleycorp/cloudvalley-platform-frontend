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

`--success`/`--warning`/`--destructive` como **texto** chico sobre blanco/card
no pasan WCAG AA (verificado con la fórmula de luminancia, no a ojo: 2.22:1 /
1.75:1 / 3.55:1, los tres por debajo de 4.5:1) — para texto (deltas, labels)
usá `text-success-dark`/`text-warning-dark`/`text-destructive-dark`
(agregados 2026-09-04, sí pasan: 6.11:1 / 4.81:1 / 6.20:1). El token base
sigue siendo el correcto para fills de badge/dot/ícono, ahí aplica el piso de
3:1 de "componente UI", no el 4.5:1 de texto. Detalle completo, contexto y
pendiente de barrido en componentes existentes:
`docs/design-system-command-center.md`.

Tokens disponibles: `background`, `surface`, `foreground`, `muted-foreground`,
`tertiary` (texto más apagado que `muted-foreground`, usar con moderación),
`card`, `popover`, `primary`, `secondary`, `accent`, `destructive`, `success`,
`warning`, `border`, `input`, `ring`, más el set `sidebar-*`.

Contraste: todos los pares texto/fondo fueron verificados con la fórmula WCAG
(relative luminance). Si agregás un token nuevo, no lo hagas a ojo — calculá el
ratio antes de darlo por bueno.

Tipografía en rem, escala fija (accesibilidad y responsive). 1rem = 16px.
- Tamaños de fuente en rem, nunca en px. El texto escala con la preferencia del navegador (WCAG 1.4.4).
- Piso de contenido: `text-xs` (0,75rem = 12px). Ningún texto con contenido baja de 12px.
- Etiquetas en mayúsculas con espaciado (`uppercase tracking-wide`): `text-[0.6875rem]` (11px). Nunca valores, nombres de métrica ni párrafos.
- Prohibido: `text-[10px]`, `text-[10.5px]`, `text-[11px]` en texto con contenido.
- Texto de contenido: nunca `text-tertiary` (3,30:1 sobre blanco). Usá `text-muted-foreground`.
- Botones: radio de 8 px (`rounded-lg`), igual que cards e inputs. Las píldoras (`rounded-full`) quedan solo para badges, chips y pills de estado. `sm` e `icon` mínimo 44 px de área de toque.

Radio: `--radius: 0.5rem` (8px). `rounded-lg` 8px para cards, botones e inputs; `rounded-md` 6px para segmentos; `rounded-sm` 4px; pills `rounded-full`. Valores del mockup `reporting-founder`. Tipografía: Geist,
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
- **Reporte** para el founder y **Update** para el investor: es el mismo documento. Ver "Tono y voz".

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

## Tono y voz

La plataforma habla como un colega que entiende finanzas de startups: directo,
cálido sin ser informal de más, y nunca robótico. Voseo rioplatense en todo el
producto, en pantalla, en PDF y en los correos.

Principios:
1. Primero qué pasó, después qué hacer. ("No pudimos guardar el reporte. Revisá tu
   conexión y probá de nuevo.")
2. El sujeto es el usuario o sus datos, no el sistema. ("Tu planilla cambió de
   estructura", no "Error de sincronización").
3. No culpar al usuario. "No pudimos…" antes que un reproche.
4. Honestidad sobre lo que no sabemos: "sin dato en abril", "según lo cargado hasta
   hoy". Nunca un cero inventado.
5. Números con período y unidad: "Ventas de abril: $12.400", no "Ventas: 12400".

Copy por estado:
- **Vacío**: qué significa, y una acción concreta.
- **Error**: causa en lenguaje llano, paso concreto y reintento cuando aplica.
- **Éxito**: qué quedó hecho, en una línea. Sin "exitosamente".
- **Confirmación destructiva**: la consecuencia concreta, y el botón con el verbo
  del acto ("Eliminar reporte").
- **Carga**: qué se está cargando ("Guardando el reporte…"), sin puntos suspensivos
  vacíos.
- **Sin permiso**: quién puede hacerlo y qué hacer ("Solo el dueño de la startup
  puede compartir este reporte").

Formato:
- Sentence case en títulos, labels y botones ("Crear reporte", no "Crear Reporte").
- Botones con verbo en infinitivo ("Crear", "Compartir", "Fijar abril 2026").
- Números en formato es-AR: coma decimal y punto de miles (`4,2%`, `$1.200`). Vale en
  pantalla y en PDF.
- Fechas: "3 de octubre de 2026" en textos largos; "oct 2026" en selectores.
- Todo bloque con contenido generado por IA lleva un rótulo visible en su sección
  ("Generado con IA a partir de tus métricas").

Glosario de producto:
- Founder: su cuenta es una **startup**. Investor: su cuenta es un **fondo**.
- Documento: **Reporte** para el founder, **Update** para el investor.
- Origen de datos: **fuente** ("conectá una fuente"), no "integración" en copy de producto.
- Otros términos fijos: período, métrica, carga manual, conexión (fondo ↔ startup),
  borrador, publicado.

Prohibido:
- "Por favor", "OK", "Aceptar" o "Continuar" a secas.
- "Ocurrió un error", "Error desconocido", "Algo salió mal".
- "Exitosamente", "¡Listo!", "¡Ups!", "Lo sentimos".
- Jerga técnica: endpoint, payload, token, sync, timeout, query, Supabase, Firestore.
- Emojis en la interfaz.
- Signos de exclamación, salvo en un logro real y una sola vez.
- Em dash en texto visible.
- Frases de plantilla que no dicen nada ("Gestioná tu experiencia").

Ejemplos (antes → después):
- "No hay datos" → "Todavía no cargaste ventas este mes. Conectá tu planilla o cargá el primer dato a mano."
- "Error al guardar" → "No pudimos guardar el reporte. Revisá tu conexión y probá de nuevo."
- "Guardado exitosamente" → "Reporte guardado."
- "¿Estás seguro?" → "Eliminar la sección 'Ventas'. Los cambios se guardan cuando apretes Guardar." (botón "Eliminar sección")
- "Sin conexiones activas" → "Todavía no tenés fondos conectados. Invitá uno desde Conexiones para compartirle este reporte."
- "Métrica no disponible" → "Sin dato en abril. Cargalo en Fuentes para que aparezca."

### Tono del Asistente IA (Platform Agent)

El asistente es un analista que conoce los números de la startup o del fondo. No es
un chatbot de atención al cliente ni un vendedor. Su tono es el de un colega con
criterio: claro, preciso y honesto sobre lo que sabe y lo que no.

Reglas:
1. **Responde con los datos del usuario**, nunca con generalidades de la industria
   salvo que lo pida. Cada número va con su métrica, su período y su origen ("Churn de
   marzo 2026, de tu planilla").
2. **Dice qué no sabe.** Si falta un dato, lo dice y explica qué lo causa y cómo
   resolverlo. Nunca completa un número faltante ni asume un cero.
3. **Marca la confianza cuando importa.** Con pocos datos o un período incompleto, lo
   dice en una frase ("Con dos meses de datos, esta tendencia es preliminar").
4. **No hace recomendaciones financieras ni legales** como si fueran certezas. Presenta
   lecturas y opciones, y deja la decisión al founder o al fondo.
5. **Propone un paso siguiente concreto** al final de cada respuesta útil, cuando lo
   hay. Si no hay paso, no lo inventa.
6. **Nunca dice que hizo algo que no hizo.** "Creé el borrador" solo si el borrador
   quedó guardado. Antes de crear o publicar, confirma período y destinatario.
7. **Respuestas cortas.** Una idea por párrafo, tres a cinco párrafos como máximo.
   Listas solo para pasos o comparaciones reales.
8. **Sin adulación ni relleno.** Nada de "¡Excelente pregunta!", "Claro que sí" ni
   cierres de cortesía repetidos.
9. **Rotula su origen.** Todo texto generado lleva el rótulo de la sección (ver
   "Formato"). Si la respuesta se basa en una métrica que el usuario no cargó, lo dice.
10. **Respeta el rol.** Al founder le habla de su startup, sus fuentes y sus reportes.
    Al investor, de su portfolio y de los updates que recibe. No revela datos de otra
    cuenta.
11. **Fuera de alcance, lo dice y redirige.** Ante una pregunta que la plataforma no
    responde, dice qué sí puede hacer y dónde se resuelve lo otro.

Ejemplos (pregunta → respuesta esperada):
- "¿Cómo viene mi runway?" → "Tu runway es de 7 meses con el burn de marzo (`$84.000`)
  y el cash de cierre de febrero. Con dos meses de datos de burn, la tendencia es
  preliminar. Si cargás el cash de marzo, lo recalculo."
- "¿Mando el reporte ya?" → "Le faltan dos datos de abril: ventas y churn. Si lo
  compartís ahora, el fondo los va a ver como sin dato. ¿Querés revisarlos antes?"
- "Creame un reporte para el board" → "Lo armo con período abril 2026 y nombre
  'Board abril 2026'. ¿Lo creo así o cambio algo?" (no crea hasta que confirme)
- Falta de datos → "No tengo el cash de marzo, así que no puedo calcular el runway de
  ese mes. Cargalo en Fuentes o conectá tu planilla."
- Fuera de alcance → "Eso no lo puedo resolver desde la plataforma. Lo que sí puedo
  hacer es revisar tus métricas de abril."

Prohibido en el asistente: prometer resultados, dar cifras sin fuente, usar jerga
técnica, sonar robótico ("Como modelo de lenguaje…") y emojis.

---

## Movimiento y microinteracciones

El movimiento explica una causa y un efecto. Si no explica nada, no se anima.

Tokens (un solo ritmo para todo el producto):
- `--motion-micro`: 120 ms. Hover, press, cambios de borde o fondo.
- `--motion-state`: 200 ms. Expandir o colapsar, cambiar pestaña, indicador de toggle,
  aparición de banners.
- `--motion-enter`: 280 ms. Aparición de contenido (`animate-fade-in`, ya existente).
- Salida: entre 60% y 70% de la duración de entrada.
- Easing de entrada `cubic-bezier(0.2, 0, 0, 1)` (desacelera al llegar). Salida
  `cubic-bezier(0.4, 0, 1, 1)` (acelera al salir). Lineal solo para el giro de un spinner.

Reglas:
1. Solo `transform` y `opacity`. Nunca animar `width`, `height`, `top` ni `left`.
2. Press: escala 0.98 en tarjetas clickeables y botones. Vuelve al soltar.
3. Hover: cambia color o borde, sin mover el layout.
4. Máximo dos elementos animados por vista de entrada. Listas con stagger de 30 a 40 ms,
   y máximo seis items escalonados.
5. Carga: skeleton si tarda más de 300 ms. El spinner va solo dentro de un botón que
   dice qué hace ("Guardando…").
6. Interrumpible: una interacción nueva cancela la anterior y fija el estado final de
   forma explícita. Nada depende de `animationend`.
7. Toasts: 4 s, `aria-live="polite"`, sin robar foco. Los errores persisten hasta cerrarse.
8. Overlays de Radix: no agregar animación extra, ya la tienen.
9. `prefers-reduced-motion`: sin desplazamientos, sin escalas y sin stagger. Los cambios
   de color y opacidad son instantáneos.
10. Un elemento que aparece tras una acción del usuario se anuncia con `aria-live`, si
    la acción no lo anuncia ya. No se anuncia en la carga inicial.

---

## Deep links y URL

1. Toda pantalla tiene URL. Un recurso se identifica por ruta (`/reporting/:id`,
   `/metrics/:id`, `/companies/:id`).
2. Todo estado de vista con valor va en la URL: pestaña, modo, período, filtro,
   selección, sección o paso de wizard. Se usan query params, nunca estado oculto.
3. Diálogos y paneles que representan una tarea tienen URL (compartir, analítica).
   Las confirmaciones rápidas no.
4. No van a la URL: hover, tooltips, toasts, estados de carga intermedios.
5. Cambiar pestaña o modo agrega una entrada al historial (push). Filtros y búsqueda
   reemplazan la entrada (replace).
6. Recargar mantiene el estado.
7. Sin sesión: el destino viaja en `?next=`, validado como ruta interna. Después del
   login se vuelve a ese destino.
8. Sin permiso: la pantalla explica por qué y ofrece volver a un lugar concreto. No
   redirige en silencio.
9. Parámetro inválido o recurso inexistente: valor por defecto con un aviso concreto.
   Nunca una pantalla en blanco.
10. Los tokens de invitación no se guardan en el historial ni en la analítica.
11. Los params existentes (`?report=`, `?doc=`, `?mode=compare`, `?tab=segments`,
    `?tab=health`) se conservan.

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

## Secretos y variables de entorno

`.env` estuvo commiteado y público en GitHub desde el commit inicial del repo
hasta que se detectó y se limpió el 2026-08-29 (historial reescrito con
`git filter-repo` + force-push). No vuelvas a introducir ese error:

- `.env` nunca se commitea. Ya está en `.gitignore` (`.env` y `.env.*`, con
  excepción de `.env.example`) — si en algún punto ves `.env` como archivo
  nuevo en `git status` listo para trackear, algo se rompió en esa regla, no
  lo agregues igual.
- Activá el pre-commit que lo bloquea una vez por clone:
  `git config core.hooksPath .githooks`. Hay además un workflow de gitleaks
  (`.github/workflows/secret-scan.yml`) que corre en cada push/PR a `main`.
- Toda variable con prefijo `VITE_` termina en el bundle del browser, la
  hayas commiteado o no — nunca le pongas ahí una credencial que deba ser
  privada. Si necesitás agregar un secreto real (API key de un servicio de
  terceros, credencial de service_role, etc.), va como secret de Supabase
  Edge Functions (`Deno.env.get(...)`, server-side) o detrás de un endpoint
  propio del backend — nunca en una env var que Vite exponga al cliente.
- Si agregás una variable nueva a `.env`, sumala también a `.env.example`
  con un valor ficticio (nunca el real).
- Detalle completo de qué variable es pública y por qué, y qué hacer si se
  vuelve a commitear un secreto: `docs/security-env-vars.md`.

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

**Limitación conocida (parcialmente resuelta):** `https://api.cloudvalley.vc`
no manda headers CORS (`Access-Control-Allow-Origin`/`-Credentials`) para
requests desde `localhost:8080` en todos sus endpoints. `get-session` ya los
manda (confirmado: la sesión se reutiliza bien y las pantallas autenticadas
cargan), pero otros endpoints (confirmado con `list-import-log` y
`query-raw-fields`, probablemente más) todavía no — esas requests puntuales siguen bloqueadas y van a aparecer
como error de CORS en `browser_console_messages`/`browser_network_requests`,
aunque el resto de la pantalla funcione. `list-metric-highlights` confirmado
en la misma lista 2026-09-04 (bloqueado en vivo al probar el Dashboard
nuevo). No es un problema de esta config ni algo para arreglar acá (requiere
que el backend termine de agregar el origin a su allowlist de CORS en el
resto de los endpoints). Antes de asumir que un
error nuevo es un bug del cambio que estás verificando, confirmá si es este
mismo problema de CORS conocido (mirá el endpoint en el mensaje de error).
Ver detalle y lista de qué se probó en `playwright/README.md`.
