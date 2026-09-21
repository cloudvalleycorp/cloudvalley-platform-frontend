import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();
const metrics = process.argv.includes('--metrics');
const reports = process.argv.includes('--reports');
await page.goto(`http://127.0.0.1:8080/redesign${metrics ? '/metrics' : reports ? '/reports' : ''}`);
await page.getByRole('heading', { name: metrics ? 'Métricas' : reports ? 'Reportes' : 'Vista general', exact: true }).waitFor();
if (process.argv.includes('--assistant')) await page.getByRole('button', { name: 'Abrir asistente Founder', exact: true }).click();
console.log('Chromium abierto en http://127.0.0.1:8080/redesign');
await new Promise(resolve => browser.on('disconnected', resolve));
