import { useState } from "react";
import { toast } from "sonner";
import {
  ANALYZE_TRANSACTIONAL_SHEET_URL,
  handleAiError,
  type FormulaSyntaxEntry,
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

  return {
    analyzeTransactionalSheet,
    analyzingSheet,
  };
}
