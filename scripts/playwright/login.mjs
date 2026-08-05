// Bootstrap de sesión para Playwright MCP.
//
// El login por Magic Link no se puede scriptear de punta a punta: el link
// llega por email y el backend lo verifica del lado del servidor (puede
// redirigir a un dominio distinto de localhost). Este script abre un
// Chromium real, vos hacés el login a mano una única vez, y al confirmar
// guarda las cookies (incluida la cookie HttpOnly `session`) en
// playwright/.auth/storageState.json para que el MCP la reutilice después.
//
// Uso: npm run playwright:login

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const authDir = path.join(repoRoot, "playwright", ".auth");
const storageStatePath = path.join(authDir, "storageState.json");

// Mismo default que src/lib/apiConfig.ts; sobreescribible si tu .env usa otro host.
const appUrl = process.env.PLAYWRIGHT_APP_URL ?? "http://localhost:8080";
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? "https://api.cloudvalley.vc";

await mkdir(authDir, { recursive: true });

console.log(`Abriendo ${appUrl}/login en una ventana de Chromium...`);
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto(`${appUrl}/login`);
} catch {
  console.error(
    `\nNo se pudo abrir ${appUrl}. ¿Está corriendo "npm run dev"? Levantalo y volvé a correr este script.\n`
  );
  await browser.close();
  process.exit(1);
}

console.log(`
  1. Pedí el enlace mágico con tu email en la ventana que se abrió.
  2. Abrí tu casilla de correo (podés abrir una pestaña nueva en esta misma
     ventana con Ctrl+T) y hacé clic en el enlace.
  3. Es normal que el enlace te lleve a otro dominio (el backend o
     producción) en vez de volver a localhost: la cookie de sesión ya quedó
     guardada en este mismo navegador, que es lo único que importa acá.
  4. Cuando veas que quedaste logueado, volvé a esta terminal.
`);

const rl = readline.createInterface({ input: stdin, output: stdout });
await rl.question("Presioná ENTER cuando hayas iniciado sesión... ");
rl.close();

await context.storageState({ path: storageStatePath });

const check = await context.request.get(`${apiBaseUrl}/get-session`);
if (check.ok()) {
  const data = await check.json();
  console.log(
    `\nSesión guardada en ${storageStatePath} (${data.email ?? "?"}, rol: ${data.role ?? "?"}).`
  );
  console.log("Playwright MCP ya puede reutilizarla.");
} else {
  console.warn(
    `\nSesión guardada en ${storageStatePath}, pero get-session devolvió ${check.status()}.`
  );
  console.warn("Puede que el login no se haya completado. Si Playwright MCP no ve la sesión, volvé a correr este script.");
}

await browser.close();
