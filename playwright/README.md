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

Sigue faltando en otros endpoints — confirmado con `list-import-log`, es
esperable que afecte a más ya que todos comparten el mismo patrón de fetch
(`credentials: "include"` contra el mismo host). Esas requests puntuales van
a seguir apareciendo como error de CORS en `browser_console_messages` /
`browser_network_requests` aunque el resto de la pantalla funcione — no lo
confundas con un bug del cambio que estés verificando, primero fijate si el
endpoint del error es uno nuevo o ya conocido.

Esto **no es un problema de esta integración ni de Playwright**: le pasaría
igual a un Chrome humano corriendo `npm run dev` y logueándose contra el
mismo backend.

**Qué falta para que funcione todo**: que el backend termine de agregar
`http://localhost:8080` al allowlist de CORS (con
`Access-Control-Allow-Credentials: true`) en el resto de sus endpoints, no
solo en `get-session`. Es un cambio de backend fuera del alcance de este
setup — repórtalo a quien lo mantenga si volvés a encontrar un endpoint
nuevo bloqueado. No hace falta tocar nada de esta config cuando se resuelva:
`storageState.json` ya tiene una sesión real y válida, lista para usarse.
