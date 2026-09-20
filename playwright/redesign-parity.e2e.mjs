import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(12000);
const errors = [], requests = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (/api\.cloudvalley|supabase/.test(new URL(r.url()).hostname)) requests.push(r.url()); });
const go = async area => { await page.goto(`http://127.0.0.1:8080/redesign/${area}`); await page.locator('.rd-page-header h1').waitFor(); };
const button = name => page.getByRole('button', { name, exact: true });
const next = () => button('Continuar').click();
const save = () => button('Guardar en la demo').click();
const field = name => page.getByLabel(name, { exact: true });
const record = name => button(`Ver detalle: ${name}`);
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('cloudvalley-redesign-v1')));
await mkdir('playwright/artifacts', { recursive: true });
try {
  await go('overview');
  await page.screenshot({ path: 'playwright/artifacts/redesign-desktop.png', fullPage: true });
  for (const [card, title] of [['Ingresos recurrentes', 'Monthly recurring revenue'], ['Ingresos anualizados', 'Annual recurring revenue'], ['Runway disponible', 'Runway'], ['Margen bruto', 'Margen bruto']]) {
    await record(card).click();
    await page.getByRole('dialog').getByRole('heading', { name: title, exact: true }).waitFor();
    await page.keyboard.press('Escape');
  }
  await button('Revisar estado de resultados').click();
  await page.getByRole('dialog').getByRole('heading', { name: 'Estado de resultados' }).waitFor();
  assert.equal(await button('Guardar revisión').count(), 0);
  await page.keyboard.press('Escape');
  await button('Abrir siguiente tarea').click();
  await page.getByRole('dialog').getByRole('heading', { name: 'Actualizar el modelo financiero' }).waitFor();
  await page.keyboard.press('Escape');
  for (const route of ['metrics', 'sources', 'roadmap', 'reports', 'documents', 'connections', 'settings']) {
    await go(route);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} desktop overflow`);
    assert.equal(await page.locator('.rd-section-summary').count(), 0);
  }
  await go('metrics'); await button('Nueva métrica').click(); await next();
  await page.getByRole('alert').getByText('Escribí un nombre').waitFor();
  await field('Nombre *').fill('Revenue de prueba'); await field('Descripción').fill('Ingresos enterprise'); await next(); await next();
  await page.getByRole('alert').getByText('Definí la consulta').waitFor();
  await field('Tipo de métrica').selectOption('input'); await field('Campo de entrada').fill('enterprise_revenue');
  await field('Tipo de valor').selectOption('money'); await field('Unidad').fill('USD'); await field('Moneda').fill('USD');
  await button('Guardar borrador').click(); await page.reload(); await button('Retomar').click();
  assert.equal(await field('Campo de entrada').inputValue(), 'enterprise_revenue'); assert.equal(await field('Moneda').inputValue(), 'USD');
  await next(); await page.screenshot({ path: 'playwright/artifacts/redesign-wizard.png' }); await save();
  await page.getByRole('dialog').getByRole('heading', { name: 'Revenue de prueba' }).waitFor();
  await field('Valor (USD)').fill('25000'); await button('Guardar valor').click();
  await field('Escenario').selectOption('forecast'); assert.equal(await field('Valor (USD)').inputValue(), '');
  await field('Valor (USD)').fill('31000'); await button('Guardar valor').click();
  await field('Escenario').selectOption('actual'); assert.equal(await field('Valor (USD)').inputValue(), '25000');
  await page.keyboard.press('Escape'); await page.reload(); await record('Revenue de prueba').waitFor();
  const metric = (await data()).find(r => r.name === 'Revenue de prueba');
  assert.equal(metric.fields.input_key, 'enterprise_revenue'); assert.equal(metric.entries['2026-08:forecast'], '31000'); assert.equal(metric.value, '25000');
  await record('Revenue de prueba').click(); await button('Editar configuración').click(); await next();
  assert.equal(await field('Campo de entrada').inputValue(), 'enterprise_revenue'); await next(); await save(); await page.keyboard.press('Escape');
  assert.equal((await data()).filter(r => r.name === 'Revenue de prueba').length, 1);
  await button('Nueva métrica').click(); await field('Nombre *').fill('Calculada de prueba'); await next();
  await button('Número fijo').click(); await next(); await save();
  assert.equal((await data()).find(r => r.name === 'Calculada de prueba').query.type, 'constant'); assert.equal(await button('Guardar valor').count(), 0);
  await page.keyboard.press('Escape'); await field('Buscar en esta sección').fill('no-existe');
  await page.getByText('No encontramos coincidencias', { exact: true }).waitFor(); await button('Limpiar filtros').click();
  await page.getByText('Vista de estados de la demo', { exact: true }).click(); await button('Error').click(); await button('Reintentar').click(); await record('Revenue de prueba').waitFor();
  await go('roadmap'); await button('Crear tarea').click(); await field('Título *').fill('Cap table de prueba'); await field('Pilar *').selectOption('legal'); await next();
  await field('Vencimiento').fill('2026-10-15'); await field('Criticidad').selectOption('critical'); await field('Se completa con un documento del Data Room').check();
  await field('Cómo hacerlo').fill('Adjuntar la versión vigente'); await next(); await save();
  assert.equal(await button('Marcar como completada').count(), 0);
  const task = (await data()).find(r => r.name === 'Cap table de prueba'); assert.equal(task.fields.pillar_id, 'legal'); assert.equal(task.fields.requires_doc, true); assert.equal(task.value, '2026-10-15');
  await go('documents'); await button('Agregar documento').click(); await field('Tarea del Roadmap').selectOption(task.id);
  assert.equal(await field('Nombre *').inputValue(), task.name); await next(); await next();
  await page.getByRole('alert').getByText('Elegí un archivo.').waitFor();
  await field('Archivo *').setInputFiles({ name: 'cap-table.txt', mimeType: 'text/plain', buffer: Buffer.from('Demo') });
  await field('Carpeta').selectOption('legal'); await field('Visible para inversores conectados').uncheck(); await next(); await save();
  await field('North Capital').check(); await button('Guardar accesos en la demo').click();
  const doc = (await data()).find(r => r.area === 'documents' && r.name === task.name);
  assert.equal(doc.fields.task_id, task.id); assert.equal(doc.fields.folder_id, 'legal'); assert.equal(doc.fields.share_fund1, true);
  await go('reports'); await button('Crear reporte').click(); assert.equal(await field('Categoría').count(), 0);
  await field('Nombre *').fill('Update de prueba'); await next(); await save(); await page.getByRole('dialog').getByRole('heading', { name: 'Update de prueba' }).waitFor();
  await go('connections'); await button('Nueva solicitud').click(); await field('Fondo *').selectOption('demo-andes'); await next();
  await field('Mensaje (opcional)').fill('Estamos preparando la ronda seed'); await next(); await save(); assert.equal((await data()).find(r => r.name === 'Andes Ventures').fields.target_id, 'demo-andes');
  await go('sources'); await button('Agregar fuente').click(); await field('Nombre *').fill('Planilla de prueba'); await next();
  await field('Modo de sincronización').selectOption('scheduled'); await field('Frecuencia').selectOption('daily_fixed_hour'); await next();
  await page.getByRole('alert').getByText('Ingresá una hora').waitFor(); await field('Hora de sincronización (UTC, 0–23)').fill('14'); await next(); await save();
  const source = (await data()).find(r => r.name === 'Planilla de prueba'); assert.equal(source.fields.sync_hour_utc, '14'); assert.equal(JSON.parse(source.fields.field_mappings)[0].column_index, 2);
  await page.keyboard.press('Escape');
  for (const structure of ['grid', 'eav']) {
    await button('Agregar fuente').click(); await field('Nombre *').fill(`Fuente ${structure}`); await next();
    await field('Estructura de la hoja').selectOption(structure);
    await field('Nombre de campo para Ingresos').fill(`ingresos_${structure}`);
    if (structure === 'eav') {
      await field('Columna del valor').selectOption('Fecha'); await next();
      await page.getByRole('alert').getByText('Elegí columnas diferentes').waitFor();
      await field('Columna del valor').selectOption('Valor');
    }
    await next(); await save(); await page.keyboard.press('Escape');
    const advanced = (await data()).find(r => r.name === `Fuente ${structure}`);
    assert.equal(advanced.fields.structure, structure);
    assert.equal(JSON.parse(advanced.fields[structure === 'grid' ? 'concept_axis' : 'eav_metric_mapping'])[0][structure === 'grid' ? 'suggested_field_key' : 'field_key'], `ingresos_${structure}`);
  }
  await go('settings'); assert.equal(await page.getByRole('tablist').count(), 0); await field('Industria').fill('Software'); await field('Objetivo de ronda (USD)').fill('2000000'); await button('Guardar startup').click(); await page.reload(); assert.equal(await field('Industria').inputValue(), 'Software');
  await page.keyboard.press('Control+k'); await field('Búsqueda global').fill('Revenue de prueba'); await page.getByRole('dialog').getByRole('button', { name: /Revenue de prueba/ }).click(); await page.getByRole('dialog').getByRole('heading', { name: 'Revenue de prueba' }).waitFor(); await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 }); await go('overview'); await page.screenshot({ path: 'playwright/artifacts/redesign-mobile.png', fullPage: true });
  await button('Abrir navegación').click(); await page.getByRole('link', { name: 'Métricas', exact: true }).click(); await button('Nueva métrica').waitFor();
  for (const route of ['overview', 'metrics', 'sources', 'roadmap', 'reports', 'documents', 'connections', 'settings']) { await go(route); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} mobile overflow`); }
  await go('sources'); await button('Agregar fuente').click(); await field('Nombre *').fill('Fuente móvil'); await next(); await field('Estructura de la hoja').selectOption('grid');
  assert.equal(await page.getByRole('dialog').evaluate(el => el.scrollWidth > el.clientWidth), false, 'Grid mapping mobile overflow');
  await page.screenshot({ path: 'playwright/artifacts/redesign-source-mobile.png', fullPage: true });
  assert.deepEqual(errors, [], 'Browser runtime errors'); assert.deepEqual(requests, [], 'Demo must not call production APIs');
  console.log('PASS: 8 routes desktop/mobile; exact action destinations; 6 mapped forms; query builder; validation; draft persistence; metric scenarios; access; settings; no runtime errors or production API calls.');
} finally { await browser.close(); }
