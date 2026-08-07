// CAPA: AI Integration Layer del Growth Tracker. Ninguna de estas funciones
// escribe nada por su cuenta — siempre devuelven una propuesta que el usuario
// revisa/edita/aprueba antes de que algo se guarde de verdad (guardado real
// sigue pasando por upsert-metric-definition/save-sheet-mapping, ver
// GrowthTrackerSheets.tsx y MetricPropertyPanel.tsx). Contrato real,
// confirmado y en producción — ver el pedido original en el plan de esta
// sesión.
import { API_BASE_URL } from "@/lib/apiConfig";
import type { FormulaSyntaxEntry } from "@/lib/formulaEngine";

export const GENERATE_FORMULA_URL = `${API_BASE_URL}/generate-formula`;
export const EXPLAIN_METRIC_URL = `${API_BASE_URL}/explain-metric`;
export const ASK_METRICS_QUESTION_URL = `${API_BASE_URL}/ask-metrics-question`;
export const ANALYZE_TRANSACTIONAL_SHEET_URL = `${API_BASE_URL}/analyze-transactional-sheet`;
export const SUGGEST_METRICS_URL = `${API_BASE_URL}/suggest-metrics`;

// Cuerpo de error compartido por los 5 endpoints en 400/429/502/503 — el
// mensaje ya viene en español, listo para mostrar directo (ver
// useMetricInsights.ts). 429 = se superó el rate limit (30/hora por
// company_id, compartido entre los 5). 502/503 = la IA no está disponible.
export type AiErrorResponse = { error: string };

// generate-formula, analyze-transactional-sheet y suggest-metrics lo piden
// siempre (400 si falta) — backend arma el prompt y valida la fórmula
// generada CONTRA esto en cada request, así que nunca se manda una copia
// vieja: se deriva en el momento de FUNCTION_SIGNATURES (formulaEngine.ts).
export type { FormulaSyntaxEntry };

export type GenerateFormulaRequest = {
  company_id: string;
  description: string;
  formula_syntax: FormulaSyntaxEntry[];
};
// Pre-llena el formulario ENTERO de crear métrica, no solo la fórmula —
// category puede ser una que ya existe o una nueva sugerida, se muestra
// igual de editable. Ver FormulaField.tsx (modo simple) + MetricPropertyPanel.tsx.
export type GenerateFormulaResponse = {
  name: string;
  category: string;
  description: string;
  why_it_matters: string;
  formula_expression: string;
  unit: string;
};

export type ExplainMetricRequest = {
  company_id: string;
  metric_id: string;
  period: string;
  // Opcionales pero recomendados: si la métrica es calculated, el backend
  // NUNCA evalúa formula_expression — sin esto no tiene forma de saber el
  // valor. Mandar lo que ya calculó formulaEngine.ts en pantalla. Si la
  // métrica es input, el backend intenta resolver el valor real primero y
  // estos dos quedan como fallback.
  current_value?: number;
  prior_value?: number;
};
export type ExplainMetricResponse = {
  explanation: string;
  current_value: number | null;
  prior_value: number | null;
  // "records" = backend lo verificó (confiable). "client_supplied" = vino de
  // nosotros, sin verificar. "unavailable" = no hay número, la explicación
  // es solo cualitativa.
  value_source: "records" | "client_supplied" | "unavailable";
};

export type VisibleMetric = { metric_id: string; period: string; value: number };
export type AskMetricsQuestionRequest = {
  company_id: string;
  question: string;
  period?: string;
  // Lo que el usuario tiene EN PANTALLA en ese momento (hasta 30 items) —
  // mejora mucho la respuesta para métricas calculadas, que el backend no
  // puede calcular solo. Opcional.
  visible_metrics?: VisibleMetric[];
};
export type AskMetricsQuestionResponse = { answer: string };

export type SuggestedField = { column: string; field_key: string; value_type: "number" | "text" };
// fields_used/dependencies son solo informativos para la UI — no se guardan
// en ningún lado, upsert-metric-definition no los acepta.
export type SuggestedMetric = {
  name: string;
  category: string;
  description: string;
  why_it_matters: string;
  formula_expression: string;
  aggregation: string;
  unit: string;
  fields_used: string[];
  dependencies: string[];
};
// Se ofrece en el paso 3 del wizard de Sheets, ANTES de guardar la conexión —
// mismo paso que ya usa get-sheet-headers. Requiere ser owner (a diferencia
// de los otros 4 endpoints de IA, para cualquier miembro). headers/
// sample_rows salen directo de la respuesta de get-sheet-headers, ver
// GrowthTrackerSheets.tsx.
export type AnalyzeTransactionalSheetRequest = {
  company_id: string;
  account_id: string;
  spreadsheet_id: string;
  sheet_name: string;
  headers: string[];
  sample_rows: string[][]; // hasta 15 filas, tal cual las devuelve get-sheet-headers
  formula_syntax: FormulaSyntaxEntry[];
};
// Cualquiera de las dos listas puede venir vacía (el backend filtra
// internamente lo que no pasa validación) — mostrar solo lo que vino.
export type AnalyzeTransactionalSheetResponse = {
  suggested_fields: SuggestedField[];
  suggested_metrics: SuggestedMetric[];
};

export type SuggestMetricsRequest = { company_id: string; formula_syntax: FormulaSyntaxEntry[] };
// Mismo shape que suggested_metrics de arriba, pero independiente de
// conectar una hoja nueva: mira los campos/métricas que la company YA
// tiene y propone indicadores adicionales (ver botón "✨ Sugerir métricas"
// en la pantalla de administrar métricas). Puede venir [] — no es un error.
export type SuggestMetricsResponse = { suggested_metrics: SuggestedMetric[] };
