import { useState } from "react";
import { toast } from "sonner";
import {
  GENERATE_FORMULA_URL,
  EXPLAIN_METRIC_URL,
  ASK_METRICS_QUESTION_URL,
  ANALYZE_TRANSACTIONAL_SHEET_URL,
  SUGGEST_METRICS_URL,
  type AiErrorResponse,
  type FormulaSyntaxEntry,
  type GenerateFormulaResponse,
  type ExplainMetricResponse,
  type AskMetricsQuestionResponse,
  type VisibleMetric,
  type AnalyzeTransactionalSheetResponse,
  type SuggestMetricsResponse,
} from "@/lib/aiInsights";

// No se usa lib/membership.ts's handleMembershipError acá a propósito: esa
// función muestra "Error inesperado" genérico para cualquier status que no
// sea 401/403/400 — se comería el mensaje real de 429 (rate limit) y 502/503
// (IA no disponible), que el backend ya manda listo para mostrar. 401 sigue
// el mismo criterio de sesión vencida que el resto de la app; todo lo demás
// no-ok (400/403/429/502/503) muestra el {error} real del backend.
async function handleAiError(res: Response, fallback: string): Promise<true> {
  if (res.status === 401) {
    window.location.assign("/login");
    return true;
  }
  try {
    const data = (await res.json()) as AiErrorResponse;
    toast.error(typeof data?.error === "string" ? data.error : fallback);
  } catch {
    toast.error(fallback);
  }
  return true;
}

/**
 * CAPA: AI Integration Layer, lado hook — expone las 5 capacidades (generar
 * fórmula, explicar métrica, responder preguntas, analizar hoja
 * transaccional, sugerir métricas) a la Presentation Layer. Contrato real de
 * backend, en producción vía api.cloudvalley.vc.
 */
export function useMetricInsights(companyId: string | null) {
  const [generating, setGenerating] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [asking, setAsking] = useState(false);
  const [analyzingSheet, setAnalyzingSheet] = useState(false);
  const [suggestingMetrics, setSuggestingMetrics] = useState(false);

  const generateFormula = async (
    description: string,
    formulaSyntax: FormulaSyntaxEntry[]
  ): Promise<GenerateFormulaResponse | null> => {
    if (!companyId || !description.trim()) return null;
    setGenerating(true);
    try {
      const res = await fetch(GENERATE_FORMULA_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, description: description.trim(), formula_syntax: formulaSyntax }),
      });
      if (!res.ok) {
        await handleAiError(res, "No se pudo generar la fórmula");
        return null;
      }
      return (await res.json()) as GenerateFormulaResponse;
    } catch {
      toast.error("No se pudo generar la fórmula");
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const explainMetric = async (
    metricId: string,
    period: string,
    currentValue?: number | null,
    priorValue?: number | null
  ): Promise<ExplainMetricResponse | null> => {
    if (!companyId) return null;
    setExplaining(true);
    try {
      const res = await fetch(EXPLAIN_METRIC_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          metric_id: metricId,
          period,
          ...(currentValue != null ? { current_value: currentValue } : {}),
          ...(priorValue != null ? { prior_value: priorValue } : {}),
        }),
      });
      if (!res.ok) {
        await handleAiError(res, "No se pudo generar la explicación");
        return null;
      }
      return (await res.json()) as ExplainMetricResponse;
    } catch {
      toast.error("No se pudo generar la explicación");
      return null;
    } finally {
      setExplaining(false);
    }
  };

  const askQuestion = async (
    question: string,
    period?: string,
    visibleMetrics?: VisibleMetric[]
  ): Promise<string | null> => {
    if (!companyId || !question.trim()) return null;
    setAsking(true);
    try {
      const res = await fetch(ASK_METRICS_QUESTION_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          question: question.trim(),
          period,
          ...(visibleMetrics && visibleMetrics.length > 0 ? { visible_metrics: visibleMetrics.slice(0, 30) } : {}),
        }),
      });
      if (!res.ok) {
        await handleAiError(res, "No se pudo responder la pregunta");
        return null;
      }
      const data = (await res.json()) as AskMetricsQuestionResponse;
      return data.answer;
    } catch {
      toast.error("No se pudo responder la pregunta");
      return null;
    } finally {
      setAsking(false);
    }
  };

  const analyzeTransactionalSheet = async (params: {
    accountId: string;
    spreadsheetId: string;
    sheetName: string;
    headers: string[];
    sampleRows: string[][];
    formulaSyntax: FormulaSyntaxEntry[];
  }): Promise<AnalyzeTransactionalSheetResponse | null> => {
    if (!companyId) return null;
    setAnalyzingSheet(true);
    try {
      const res = await fetch(ANALYZE_TRANSACTIONAL_SHEET_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          account_id: params.accountId,
          spreadsheet_id: params.spreadsheetId,
          sheet_name: params.sheetName,
          headers: params.headers,
          sample_rows: params.sampleRows,
          formula_syntax: params.formulaSyntax,
        }),
      });
      if (!res.ok) {
        await handleAiError(res, "No se pudo analizar la hoja");
        return null;
      }
      return (await res.json()) as AnalyzeTransactionalSheetResponse;
    } catch {
      toast.error("No se pudo analizar la hoja");
      return null;
    } finally {
      setAnalyzingSheet(false);
    }
  };

  const suggestMetrics = async (formulaSyntax: FormulaSyntaxEntry[]): Promise<SuggestMetricsResponse | null> => {
    if (!companyId) return null;
    setSuggestingMetrics(true);
    try {
      const res = await fetch(SUGGEST_METRICS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, formula_syntax: formulaSyntax }),
      });
      if (!res.ok) {
        await handleAiError(res, "No se pudieron sugerir métricas");
        return null;
      }
      return (await res.json()) as SuggestMetricsResponse;
    } catch {
      toast.error("No se pudieron sugerir métricas");
      return null;
    } finally {
      setSuggestingMetrics(false);
    }
  };

  return {
    generateFormula,
    generating,
    explainMetric,
    explaining,
    askQuestion,
    asking,
    analyzeTransactionalSheet,
    analyzingSheet,
    suggestMetrics,
    suggestingMetrics,
  };
}
