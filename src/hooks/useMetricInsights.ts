import { useState } from "react";
import { toast } from "sonner";
import {
  ANALYZE_TRANSACTIONAL_SHEET_URL,
  handleAiError,
  type AnalyzeTransactionalSheetResponse,
} from "@/lib/aiInsights";
import type { ConceptAxisEntry, EavMetricMapping, PeriodAxisEntry } from "@/lib/sheetsIntegration";

type AnalyzeParamsCommon = {
  // "sheet" (default) requiere accountId/spreadsheetId; "excel" (contrato
  // 2026-09-01, antes no soportado — el wizard de Excel se saltaba
  // directo a mapeo manual) requiere uploadId en su lugar.
  source?: "sheet" | "excel";
  accountId?: string;
  spreadsheetId?: string;
  uploadId?: string;
  sheetName: string;
};

type AnalyzeParams =
  | (AnalyzeParamsCommon & {
      structure?: "tabular";
      headers: string[];
      sampleRows: string[][];
      spreadsheetType?: string;
    })
  | (AnalyzeParamsCommon & {
      structure: "grid";
      periodOrientation: "columns" | "rows";
      periodAxis: PeriodAxisEntry[];
      conceptAxis: ConceptAxisEntry[];
    })
  | (AnalyzeParamsCommon & {
      structure: "eav";
      eavPeriodColumn: string;
      eavMetricNameColumn: string;
      eavValueColumn: string;
      eavMetricMapping: EavMetricMapping[];
    });

/**
 * CAPA: AI Integration Layer, lado hook — analizar una hoja transaccional al
 * conectarla (GrowthTrackerSheets.tsx). Es el único flujo puntual de IA que
 * no pasa por /platform-agent (ver usePlatformAgent.ts): vive adentro del
 * wizard de conectar Sheets, nunca escribe nada solo — el guardado real
 * sigue pasando por save-sheet-mapping/upsert-metric-definition.
 *
 * structure "grid"/"eav" (contrato 2026-09-05): en vez de headers/sample_rows
 * manda lo que ya se confirmó en extract-sheet-layout — la hoja ya se leyó
 * ahí, no hace falta mandarla de nuevo. Antes de este contrato, este hook
 * nunca se llamaba para grid/eav en absoluto (ver GrowthTrackerSheets.tsx,
 * analyzeExtractedLayout) y esas conexiones nunca llegaban a "Revisá las
 * métricas sugeridas" — bug real encontrado en vivo 2026-09-04.
 */
export function useMetricInsights(companyId: string | null) {
  const [analyzingSheet, setAnalyzingSheet] = useState(false);

  const analyzeTransactionalSheet = async (params: AnalyzeParams): Promise<AnalyzeTransactionalSheetResponse | null> => {
    if (!companyId) return null;
    setAnalyzingSheet(true);
    try {
      const body: Record<string, unknown> = {
        company_id: companyId,
        source: params.source ?? "sheet",
        ...(params.accountId ? { account_id: params.accountId } : {}),
        ...(params.spreadsheetId ? { spreadsheet_id: params.spreadsheetId } : {}),
        ...(params.uploadId ? { upload_id: params.uploadId } : {}),
        sheet_name: params.sheetName,
      };
      if (params.structure === "grid") {
        body.structure = "grid";
        body.period_orientation = params.periodOrientation;
        body.period_axis = params.periodAxis;
        body.concept_axis = params.conceptAxis;
      } else if (params.structure === "eav") {
        body.structure = "eav";
        body.eav_period_column = params.eavPeriodColumn;
        body.eav_metric_name_column = params.eavMetricNameColumn;
        body.eav_value_column = params.eavValueColumn;
        body.eav_metric_mapping = params.eavMetricMapping;
      } else {
        body.headers = params.headers;
        body.sample_rows = params.sampleRows;
        if (params.spreadsheetType) body.spreadsheet_type = params.spreadsheetType;
      }
      const res = await fetch(ANALYZE_TRANSACTIONAL_SHEET_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  return {
    analyzeTransactionalSheet,
    analyzingSheet,
  };
}
