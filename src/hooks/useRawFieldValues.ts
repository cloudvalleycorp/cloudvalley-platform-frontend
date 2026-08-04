import { useEffect, useState } from "react";
import { extractRawFieldQueries, resolveRawFieldQueries } from "@/lib/formulaEngine";

/**
 * Resuelve, una sola vez por período (deduplicado entre fórmulas), todas
 * las llamadas FIELDSUM/FIELDCOUNT/FIELDCOUNTD/FIELDAVG referenciadas por un
 * conjunto de fórmulas — para pasarle el resultado a evalFormula/
 * evalFormulaDetailed sin que cada componente (AnnualGrid, CalculatedMetricsGrid,
 * MetricInfoSheet, FormulaField...) dispare sus propias llamadas de red
 * repetidas para la misma fórmula+período.
 *
 * `periods` puede tener varios elementos (ej. los 12 meses de un año para
 * AnnualGrid/MetricInfoSheet) — se resuelven todos en un solo request
 * batcheado (query-raw-fields), con la unión deduplicada de queries que
 * necesiten las `formulas` pasadas.
 */
export function useRawFieldValues(
  companyId: string | null,
  periods: string[],
  formulas: (string | null | undefined)[]
): { valuesByPeriod: Record<string, Record<string, number | null>>; loading: boolean } {
  const [valuesByPeriod, setValuesByPeriod] = useState<Record<string, Record<string, number | null>>>({});
  const [loading, setLoading] = useState(false);

  // Claves estables para el efecto: no queremos re-disparar solo porque los
  // arrays son referencias nuevas en cada render — solo si el contenido
  // realmente cambió.
  const periodsKey = periods.join(",");
  const formulasKey = formulas.filter(Boolean).join("\n---\n");

  useEffect(() => {
    const periodList = periodsKey ? periodsKey.split(",") : [];
    const queries = formulasKey
      .split("\n---\n")
      .filter(Boolean)
      .flatMap((f) => extractRawFieldQueries(f));
    if (!companyId || periodList.length === 0 || queries.length === 0) {
      setValuesByPeriod({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    resolveRawFieldQueries(queries, companyId, periodList)
      .then((byPeriod) => {
        if (!cancelled) setValuesByPeriod(byPeriod);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, periodsKey, formulasKey]);

  return { valuesByPeriod, loading };
}
