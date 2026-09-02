// Fixtures sintéticos realistas para tests de la lógica pura de métricas
// (lineage, query builder, mapeo de columnas). No son mocks de una función
// bajo test — son datos de entrada que la lógica real procesa.
import type { MetricDef, RawField } from "@/lib/metrics";
import type { AggregationNode, QuerySpec } from "@/lib/querySpec";

// ---- Conexiones sintéticas ----
// Dos fuentes reales de un mismo tipo de empresa: un Google Sheet de
// transacciones ("info_sintetica · Transacciones") y un Excel de otra
// cuenta ("cv-fresh-2026.xlsx · Transacciones") — mismo patrón de nombres
// ya usado en vivo esta sesión, para que los fixtures se sientan reales.
export const CONNECTION_SHEET = "conn-sheet-transacciones";
export const CONNECTION_EXCEL = "conn-excel-transacciones";
export const CONNECTION_MARKETING = "conn-sheet-marketing";

export const RAW_FIELDS: RawField[] = [
  // --- info_sintetica · Transacciones (Google Sheets) ---
  { field_key: "fecha_operacion", value_type: "text", connection_id: CONNECTION_SHEET, sample_column: "Fecha", description: "Fecha de la operación", connection_label: "info_sintetica · Transacciones" },
  { field_key: "monto_total", value_type: "number", connection_id: CONNECTION_SHEET, sample_column: "Monto", description: "Monto de la transacción en USD", connection_label: "info_sintetica · Transacciones" },
  { field_key: "nombre_cliente", value_type: "text", connection_id: CONNECTION_SHEET, sample_column: "Cliente", description: "Nombre del cliente", connection_label: "info_sintetica · Transacciones" },
  { field_key: "categoria_tx", value_type: "text", connection_id: CONNECTION_SHEET, sample_column: "Categoría", description: "Categoría de la transacción", connection_label: "info_sintetica · Transacciones" },
  { field_key: "monto_egresos", value_type: "number", connection_id: CONNECTION_SHEET, sample_column: "Egresos", description: "Egresos del período", connection_label: "info_sintetica · Transacciones" },
  // --- cv-fresh-2026.xlsx · Transacciones (Excel) ---
  { field_key: "monto_total_2", value_type: "number", connection_id: CONNECTION_EXCEL, sample_column: "Monto", description: "Monto de la transacción en USD", connection_label: "cv-fresh-2026.xlsx · Transacciones" },
  { field_key: "id_transaccion", value_type: "text", connection_id: CONNECTION_EXCEL, sample_column: "ID", description: null, connection_label: "cv-fresh-2026.xlsx · Transacciones" },
  // --- info_sintetica · Marketing (Google Sheets, otra hoja) ---
  { field_key: "gasto_marketing", value_type: "number", connection_id: CONNECTION_MARKETING, sample_column: "Inversión", description: "Inversión en marketing del mes", connection_label: "info_sintetica · Marketing" },
];

function aggNode(overrides: Partial<AggregationNode>): AggregationNode {
  return { type: "aggregation", aggregation: "sum", field_key: null, distinct_field_key: null, filters: [], ...overrides };
}

function baseMetric(overrides: Partial<MetricDef>): MetricDef {
  return {
    id: "metric-" + Math.random().toString(36).slice(2, 8),
    name: "Métrica",
    category: "revenue",
    metric_type: "calculated",
    input_key: null,
    value_type: "money",
    source: null,
    source_connection_id: null,
    formula_expression: null,
    query: null,
    unit: "USD",
    formula: null,
    description: null,
    why_it_matters: null,
    benchmark: null,
    order_index: 0,
    metric_class: "custom",
    standard_key: null,
    currency: "USD",
    source_role: null,
    ...overrides,
  };
}

// Métrica de una sola fuente: SUM(monto_total) de info_sintetica.
export const METRIC_SINGLE_SOURCE: MetricDef = baseMetric({
  id: "metric-revenue-sheet",
  name: "Revenue (Sheet)",
  query: aggNode({ field_key: "monto_total" }),
});

// Métrica multi-fuente real: SUM(monto_total) + SUM(monto_total_2) —
// mismo shape que "Revenue Excel E2E" verificado en vivo esta sesión.
export const METRIC_MULTI_SOURCE: MetricDef = baseMetric({
  id: "metric-revenue-multi",
  name: "Revenue (multi-fuente)",
  query: {
    type: "arithmetic",
    operator: "+",
    left: aggNode({ field_key: "monto_total" }),
    right: aggNode({ field_key: "monto_total_2" }),
  } satisfies QuerySpec,
});

// Métrica huérfana: referencia un field_key que no existe en ningún RawField
// (ej. la fuente se desconectó) — resolveMetricSources debe dar [].
export const METRIC_ORPHAN: MetricDef = baseMetric({
  id: "metric-orphan",
  name: "Métrica huérfana",
  query: aggNode({ field_key: "field_key_inexistente" }),
});

// Métrica "input" (carga manual) — no tiene query, es la hoja terminal de
// resolveMetricSourceLeaves cuando otra métrica la referencia.
export const METRIC_INPUT: MetricDef = baseMetric({
  id: "metric-input-nps",
  name: "NPS",
  metric_type: "input",
  input_key: "nps",
  value_type: "count",
  unit: "pts",
  query: null,
});

// Métrica calculada que referencia OTRA calculada vía metric_ref (Gross
// Margin = Revenue - COGS, con COGS como métrica propia) — para probar el
// recorrido recursivo de resolveMetricSourceLeaves/resolveMetricSources.
export const METRIC_COGS: MetricDef = baseMetric({
  id: "metric-cogs",
  name: "COGS",
  query: aggNode({ field_key: "monto_egresos" }),
});
export const METRIC_DERIVED: MetricDef = baseMetric({
  id: "metric-gross-margin",
  name: "Gross Margin",
  query: {
    type: "arithmetic",
    operator: "-",
    left: { type: "metric_ref", metric_id: METRIC_SINGLE_SOURCE.id },
    right: { type: "metric_ref", metric_id: METRIC_COGS.id },
  } satisfies QuerySpec,
});

// Dos métricas que se referencian circularmente entre sí (dato corrupto,
// nunca debería pasar la validación de guardado, pero puede llegar así de
// una migración vieja) — resolveMetricSources no debe loopear infinito.
export const METRIC_CIRCULAR_A: MetricDef = baseMetric({
  id: "metric-circular-a",
  name: "Circular A",
  query: { type: "metric_ref", metric_id: "metric-circular-b" },
});
export const METRIC_CIRCULAR_B: MetricDef = baseMetric({
  id: "metric-circular-b",
  name: "Circular B",
  query: { type: "metric_ref", metric_id: "metric-circular-a" },
});

export const ALL_METRICS: MetricDef[] = [
  METRIC_SINGLE_SOURCE,
  METRIC_MULTI_SOURCE,
  METRIC_ORPHAN,
  METRIC_INPUT,
  METRIC_COGS,
  METRIC_DERIVED,
  METRIC_CIRCULAR_A,
  METRIC_CIRCULAR_B,
];

// ---- Headers de hoja realistas, por spreadsheet_type (los 6 reales,
// confirmados en src/lib/sheetsIntegration.ts) ----
export const HEADERS_TRANSACTION_LEDGER = ["Fecha", "ID Transacción", "Cliente", "Categoría", "Monto"];
export const HEADERS_TIME_SERIES = ["Mes", "MRR", "Nuevos clientes", "Churn"];
// El caso real que rompió esta sesión: "EERR 2026" (estado de resultados),
// meses en columnas — financial_model ancho, no tiene columna de período.
export const HEADERS_FINANCIAL_MODEL_WIDE = ["EERR 2026", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto"];
export const SAMPLE_ROWS_FINANCIAL_MODEL_WIDE: string[][] = [
  ["Venta bruta", "5454552", "3423434", "120230", "2342342", "5643535", "4535534", "5654645", ""],
  ["Otros ingresos", "", "", "", "", "", "", "", ""],
  ["Ingresos Totales", "5454552", "3423434", "120230", "2342342", "5643535", "4535534", "11024645", ""],
  ["EBITDA", "-3590088", "-2700031", "-6294103", "292588", "-2096273", "3432401", "9699285", "-675431"],
];
export const SAMPLE_ROWS_TRANSACTION_LEDGER: string[][] = [
  ["2026-07-01", "tx_1001", "Acme Inc", "Suscripción", "4200"],
  ["2026-07-03", "tx_1002", "Beta Corp", "Servicios", "1850"],
  ["2026-07-11", "tx_1003", "Acme Inc", "Suscripción", "4200"],
];

// Layout eav (vertical: una columna de período, una de nombre de métrica,
// una de valor) — el único de los tres layouts (row_based/grid/eav) sin
// fixture propia hasta esta pasada (2026-09-01), confirmado verificando en
// vivo con Playwright: classify-workbook lo detecta bien, extract-sheet-layout
// arma el mapeo de métricas correctamente.
export const HEADERS_EAV_METRICS = ["Fecha", "Métrica", "Valor"];
export const SAMPLE_ROWS_EAV_METRICS: string[][] = [
  ["2026-06-01", "MRR", "45000"],
  ["2026-06-01", "Nuevos clientes", "12"],
  ["2026-06-01", "Churn", "2"],
  ["2026-07-01", "MRR", "52000"],
  ["2026-07-01", "Nuevos clientes", "15"],
  ["2026-07-01", "Churn", "3"],
];

// Moneda no-USD y formato de fecha no-ISO — gap real: todos los fixtures de
// arriba son USD + "YYYY-MM-DD", ningún test ejercita autoMapHeaders/
// periodColumnLooksWrong contra otro formato (ej. una planilla armada en
// Argentina, DD/MM/YYYY + montos en ARS).
export const HEADERS_TRANSACTION_LEDGER_ARS = ["Fecha", "Cliente", "Monto (ARS)"];
export const SAMPLE_ROWS_TRANSACTION_LEDGER_ARS: string[][] = [
  ["01/07/2026", "Acme Inc", "4200000"],
  ["03/07/2026", "Beta Corp", "1850000"],
  ["11/07/2026", "Acme Inc", "4200000"],
];
