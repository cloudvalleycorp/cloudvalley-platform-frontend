# Playwright MCP

Le da a Claude Code un navegador real para verificar la UI durante el
desarrollo: navegar, interactuar, sacar capturas, leer errores de consola y
requests de red. No reemplaza a `npx tsc`, `npm run build` ni `npx vitest run`
(seguí corriendo esos), es un chequeo visual/funcional adicional.

No modifica el backend ni el flujo de Magic Link. La sesión se reutiliza tal
cual la emite el backend, vía cookie HttpOnly.

## Setup (una vez por máquina)

```
npm install
npm run playwright:install              # Chromium para el script de login
npm run playwright:install-mcp-browser  # Chromium para el server de @playwright/mcp
npm run playwright:login                # bootstrap de sesión, ver abajo
```

Son dos binarios de Chromium separados porque `@playwright/mcp` empaqueta su
propio `playwright-core` (revisión propia, no necesariamente la misma que la
del `playwright` que usa `scripts/playwright/login.mjs`).

`playwright:login` abre una ventana real de Chromium apuntando a
`localhost:8080/login` (necesita `npm run dev` corriendo). El login por Magic
Link no se puede scriptear: pedís el enlace, lo abrís desde tu email en esa
misma ventana, y cuando quedás logueado volvés a la terminal y apretás ENTER.
El script guarda las cookies (incluida `session`, HttpOnly) en
`playwright/.auth/storageState.json`.

Ese archivo **nunca se commitea** (está en `.gitignore`, contiene una cookie
de sesión viva). Si expira o Claude Code reporta 401/redirect a `/login`,
volvé a correr `npm run playwright:login`.

`.mcp.json` fija `@playwright/mcp` a una versión exacta (no `@latest`): usar
`@latest` hace que cada reconexión pueda resolver una versión distinta que
pide una revisión de Chromium distinta a la ya descargada, rompiendo el MCP
con "Browser chromium is not installed" hasta volver a correr
`npm run playwright:install-mcp-browser`. Si actualizás la versión pinneada
en `.mcp.json`, corré ese script de nuevo para bajar el Chromium que
corresponde.

## Cómo lo usa Claude Code

1. Antes de verificar algo visualmente, chequea si `localhost:8080` responde;
   si no, levanta `npm run dev` en background y espera a que esté listo.
2. Navega a las rutas afectadas por el cambio (ver rutas en `src/App.tsx`).
3. Interactúa con la UI (clicks, forms, cambios de viewport para responsive).
4. Saca capturas, revisa `browser_console_messages` y
   `browser_network_requests`.
5. Contrasta contra las reglas de `CLAUDE.md` (Accesibilidad, Responsive, UX
   writing, Design tokens) y corrige lo que encuentre antes de seguir.

## Config

`mcp.config.json`: Chromium headless por defecto, `baseURL` `localhost:8080`,
`storageState` apuntando al archivo de arriba. Para ver el navegador en vivo
mientras depurás algo puntual, cambiá `launchOptions.headless` a `false`
temporalmente (no lo dejes así commiteado, cada corrida headed te va a robar
el foco de la ventana).

## Troubleshooting

- **"no such file or directory" al arrancar el MCP**: corré
  `npm run playwright:login` al menos una vez (el repo trae un
  `storageState.json` vacío/deslogueado como placeholder para que no rompa,
  pero sin sesión real no vas a poder ver páginas protegidas).
- **Ves `/login` en vez de la página esperada**: puede ser que la sesión
  expiró o nunca se guardó (repetí el bootstrap) — pero antes revisá la
  limitación conocida de abajo, es la causa más probable.
- **El link del email no vuelve a localhost**: es esperable, el backend
  puede redirigir a otro dominio tras verificar el link. Lo que importa es
  que la cookie haya quedado guardada en esa misma ventana antes de apretar
  ENTER en la terminal.

## Limitación conocida: CORS del backend contra `localhost` (parcialmente resuelta)

`https://api.cloudvalley.vc` (el `VITE_API_BASE_URL` que usa `.env`, incluso
en dev) originalmente no devolvía `Access-Control-Allow-Origin` ni
`Access-Control-Allow-Credentials` para requests desde `http://localhost:8080`
en ningún endpoint. Eso se reportó al backend y ya se corrigió para
`get-session`: confirmado con Playwright MCP, la sesión se reutiliza bien y
las pantallas autenticadas cargan con datos reales (ej. `/dashboard`).

**2026-09-02, actualización tras un deploy de backend:** el gap se cerró para
la mayoría de los endpoints que estaban fallando — confirmado en vivo con un
deploy nuevo que `list-raw-fields`, `list-sheet-connections`,
`list-google-accounts`, `list-metric-source-coverage` y
`upsert-metric-definition` ahora responden 200 con headers CORS correctos de
forma consistente (varios intentos seguidos, sin ningún fallo). **Sigue
fallando `list-import-log`** — confirmado con el mismo error de siempre en
dos páginas distintas (`/metrics?tab=overview` y `/metrics?tab=health`), 100%
de los intentos, incluso después del deploy que arregló el resto — quedó
afuera del allowlist. `query-raw-fields` y `save-sheet-mapping` no se
volvieron a probar después del deploy, no asumas que ya están bien sin
volver a verificarlos en vivo.
El mensaje de consola es idéntico en todos los casos: `Access to fetch at
'...' ... blocked by CORS policy: No 'Access-Control-Allow-Origin' header is
present on the requested resource` — no hay ningún response header ni body
visible en `browser_network_request`, es un bloqueo 100% del lado del browser
antes de que la respuesta llegue a JS. No es un bug de una estructura de
datos ni de un endpoint en particular, es config de CORS del gateway —
histórico: algunos endpoints fallaban de forma intermitente (funcionaban N
veces, después fallaban) mientras otros fallaban siempre, lo que sugería que
el allowlist no estaba desplegado parejo en todas las instancias/réplicas.
El deploy del 2026-09-02 corrigió la mayoría de esa inconsistencia de una.
Antes de reportar que algo "no funciona", primero fijate si el error de
consola es este mismo CORS contra un endpoint ya conocido en esta sección, y
si es `list-import-log` específicamente (el único que sigue fallando).

**Verificado en vivo 2026-09-02, sesión completa con datos reales de
backend** (no simulados) contra `list-metric-source-coverage` — la sección
"Qué podemos mejorar" de Metrics > Overview (`MetricsOverviewTab.tsx`):
estados de carga/error/reintentar, responsive (375px) y dark mode; la card
de KPI "derivable" (ARR, con `net_new_mrr × 12` como query real); el diálogo
de confirmación (`MetricCoverageReviewDialog.tsx`) con nombre/categoría/
unidad editables y `QuerySummary` legible; y el guardado real end-to-end vía
`upsert-metric-definition` (POST 200, `metric_class: "standard"`,
`standard_key: "arr"` guardados correctamente, la card pasó de "derivable" a
un `MetricValueCard` real tras el guardado). Repetido varias veces después
del deploy sin ningún fallo de CORS.

**Bug real encontrado en esta misma prueba, reportado a backend, todavía sin
fix:** `missing_data_description` (el motivo de por qué un KPI estándar
quedó en `status: "missing"`) viene en **inglés** ("There is no direct MRR
input or metric available...", "Insufficient historical time-series
data...") en vez de español — rompe la consistencia de idioma de toda la app
(ver "UX writing" en `CLAUDE.md`). Es texto generado por IA del lado del
backend, no algo que el frontend deba traducir a mano (fragilidad, riesgo de
tergiversar el motivo real) — hace falta que el prompt que genera ese texto
especifique español explícitamente.

Esto **no es un problema de esta integración ni de Playwright**: le pasaría
igual a un Chrome humano corriendo `npm run dev` y logueándose contra el
mismo backend.

**Qué falta para que funcione todo**: que el backend agregue
`list-import-log` al mismo allowlist de CORS que ya corrigió para el resto
(con `Access-Control-Allow-Credentials: true`) — es el único endpoint
confirmado todavía afuera, en dos pantallas distintas (`/metrics?tab=
overview` y `/metrics?tab=health`), 100% de los intentos, incluso después
del deploy del 2026-09-02. `query-raw-fields` y `save-sheet-mapping` no se
volvieron a probar después de ese deploy — no asumas que están bien sin
volver a verificarlos en vivo. Es un cambio de backend fuera del alcance de
este setup — repórtalo a quien lo mantenga si volvés a encontrar un endpoint
nuevo bloqueado. No hace falta tocar nada de esta config cuando se resuelva:
`storageState.json` ya tiene una sesión real y válida, lista para usarse.
