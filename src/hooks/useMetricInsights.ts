import { useState } from "react";
import { toast } from "sonner";
import {
  ANALYZE_TRANSACTIONAL_SHEET_URL,
  handleAiError,
  type AnalyzeTransactionalSheetResponse,
} from "@/lib/aiInsights";

/**
 * CAPA: AI Integration Layer, lado hook — analizar una hoja transaccional al
 * conectarla (GrowthTrackerSheets.tsx). Es el único flujo puntual de IA que
 * no pasa por /platform-agent (ver usePlatformAgent.ts): vive adentro del
 * wizard de conectar Sheets, nunca escribe nada solo — el guardado real
 * sigue pasando por save-sheet-mapping/upsert-metric-definition.
 */
export function useMetricInsights(companyId: string | null) {
  const [analyzingSheet, setAnalyzingSheet] = useState(false);

  const analyzeTransactionalSheet = async (params: {
    // "sheet" (default) requiere accountId/spreadsheetId; "excel" (contrato
    // 2026-09-01, antes no soportado — el wizard de Excel se saltaba
    // directo a mapeo manual) no los necesita, la hoja ya está parseada del
    // lado del founder (headers/sampleRows vienen del preview de
    // confirm-workbook-upload).
    source?: "sheet" | "excel";
    accountId?: string;
    spreadsheetId?: string;
    sheetName: string;
    headers: string[];
    sampleRows: string[][];
    spreadsheetType?: string;
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
          source: params.source ?? "sheet",
          ...(params.accountId ? { account_id: params.accountId } : {}),
          ...(params.spreadsheetId ? { spreadsheet_id: params.spreadsheetId } : {}),
          sheet_name: params.sheetName,
          headers: params.headers,
          sample_rows: params.sampleRows,
          ...(params.spreadsheetType ? { spreadsheet_type: params.spreadsheetType } : {}),
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

  return {
    analyzeTransactionalSheet,
    analyzingSheet,
  };
}
