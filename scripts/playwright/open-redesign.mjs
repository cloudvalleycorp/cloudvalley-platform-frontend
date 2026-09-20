import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();
await page.goto('http://127.0.0.1:8080/redesign');
await page.getByRole('heading', { name: 'Vista general' }).waitFor();
if (process.argv.includes('--assistant')) await page.getByRole('button', { name: 'Abrir asistente Founder', exact: true }).click();
console.log('Chromium abierto en http://127.0.0.1:8080/redesign');
await new Promise(resolve => browser.on('disconnected', resolve));
