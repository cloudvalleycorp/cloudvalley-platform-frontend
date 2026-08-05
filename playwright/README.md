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
npm run playwright:install   # descarga el binario de Chromium
npm run playwright:login     # bootstrap de sesión, ver abajo
```

`playwright:login` abre una ventana real de Chromium apuntando a
`localhost:8080/login` (necesita `npm run dev` corriendo). El login por Magic
Link no se puede scriptear: pedís el enlace, lo abrís desde tu email en esa
misma ventana, y cuando quedás logueado volvés a la terminal y apretás ENTER.
El script guarda las cookies (incluida `session`, HttpOnly) en
`playwright/.auth/storageState.json`.

Ese archivo **nunca se commitea** (está en `.gitignore`, contiene una cookie
de sesión viva). Si expira o Claude Code reporta 401/redirect a `/login`,
volvé a correr `npm run playwright:login`.

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
- **Ves `/login` en vez de la página esperada**: la sesión expiró o nunca se
  guardó. Repetí el bootstrap.
- **El link del email no vuelve a localhost**: es esperable, el backend
  puede redirigir a otro dominio tras verificar el link. Lo que importa es
  que la cookie haya quedado guardada en esa misma ventana antes de apretar
  ENTER en la terminal.
