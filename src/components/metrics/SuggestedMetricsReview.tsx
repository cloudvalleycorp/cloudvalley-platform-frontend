import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { EmptyState } from "@/components/EmptyState";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, Copy, AlertTriangle } from "lucide-react";
import type { SuggestedMetric } from "@/lib/aiInsights";
import type { MetricDef } from "@/lib/metrics";

type ReviewRow = SuggestedMetric & { approved: boolean };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: SuggestedMetric[];
  companyId: string | null;
  allMetrics: MetricDef[];
  categories: { id: string; label: string }[];
  defaultCategory: string;
  // La IA solo propone (ver aiInsights.ts) — esto recién persiste algo real
  // al confirmar, vía upsert-metric-definition (el mismo endpoint que ya usa
  // MetricPropertyPanel), nunca solo. Después recarga el catálogo.
  onSaved: () => void;
};

// Revisión compartida para las dos formas de llegar a una lista de
// SuggestedMetric: el paso "Analizar con IA" del wizard de Sheets
// (GrowthTrackerSheets.tsx) y el botón "Sugerir métricas" en Administrar
// métricas (Metrics.tsx). BLOQUEADO desde el cambio de contrato 2026-08-10:
// analyze-transactional-sheet (endpoint que arma esta lista) sigue
// devolviendo formula_expression en texto libre, pero upsert-metric-
// definition ya no acepta ese campo para escrituras nuevas — confirmar acá
// garantizaría un 400 en cada fila. No se intenta convertir el texto a
// QuerySpec (frágil): el submit queda deshabilitado hasta que backend
// actualice analyze-transactional-sheet para devolver query también. La
// lista sigue visible/editable como referencia, con un botón para copiar
// cada fórmula y reconstruirla a mano con el query builder.
export function SuggestedMetricsReview({ open, onOpenChange, suggestions, categories, defaultCategory }: Props) {
  const [rows, setRows] = useState<ReviewRow[]>([]);

  useEffect(() => {
    if (open) setRows(suggestions.map((s) => ({ ...s, approved: true, category: s.category?.trim() || defaultCategory })));
  }, [open, suggestions, defaultCategory]);

  const setRow = (i: number, patch: Partial<ReviewRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const copyFormula = (formula: string) => {
    navigator.clipboard.writeText(formula);
    toast.success("Fórmula copiada");
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Revisá las métricas sugeridas"
      description="La IA propuso esto a partir de tus datos. Nada se crea todavía."
      contentClassName="sm:max-w-2xl"
      submitLabel="No disponible"
      busy
    >
      <Alert variant="destructive">
        <AlertTriangle size={16} aria-hidden="true" />
        <AlertDescription className="text-xs">
          Este flujo todavía genera fórmulas de texto libre, que el backend ya no acepta para crear métricas nuevas.
          No se puede confirmar acá hasta que se actualice el análisis de la hoja — copiá los datos de abajo y armá
          la métrica a mano con "Agregar métrica".
        </AlertDescription>
      </Alert>
      {rows.length === 0 ? (
        <EmptyState bordered={false} icon={Sparkles} title="La IA no encontró métricas nuevas para proponer." />
      ) : (
        <div className="space-y-4">
          {rows.map((row, i) => (
            <div key={i} className="border border-border rounded-md p-3 space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={row.approved}
                  onCheckedChange={(c) => setRow(i, { approved: c === true })}
                  className="mt-2.5"
                  aria-label={`Aprobar métrica ${row.name}`}
                />
                <div className="flex-1 min-w-0">
                  <Input
                    value={row.name}
                    onChange={(e) => setRow(i, { name: e.target.value })}
                    aria-label="Nombre de la métrica"
                    className="font-medium"
                  />
                </div>
              </label>

              {row.approved && (
                <div className="pl-7 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField label="Categoría (tab donde aparece)">
                      <Input
                        value={row.category}
                        onChange={(e) => setRow(i, { category: e.target.value })}
                        list={`suggested-metric-category-${i}`}
                        placeholder="Ej: revenue, cash_efficiency"
                      />
                      <datalist id={`suggested-metric-category-${i}`}>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id} />
                        ))}
                      </datalist>
                    </FormField>
                    <FormField label="Unidad">
                      <Input
                        value={row.unit}
                        onChange={(e) => setRow(i, { unit: e.target.value })}
                        placeholder="USD, %, x, meses…"
                      />
                    </FormField>
                  </div>
                  <FormField label="Qué es">
                    <Textarea
                      value={row.description}
                      onChange={(e) => setRow(i, { description: e.target.value })}
                      rows={2}
                    />
                  </FormField>
                  {row.why_it_matters && (
                    <FormField label="Por qué importa">
                      <Textarea
                        value={row.why_it_matters}
                        onChange={(e) => setRow(i, { why_it_matters: e.target.value })}
                        rows={2}
                      />
                    </FormField>
                  )}
                  <FormField label="Fórmula">
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={row.formula_expression}
                        onChange={(e) => setRow(i, { formula_expression: e.target.value })}
                        className="font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={() => copyFormula(row.formula_expression)}
                        aria-label="Copiar fórmula"
                      >
                        <Copy size={13} aria-hidden="true" />
                      </Button>
                    </div>
                  </FormField>
                  {row.fields_used.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Usa:</span>
                      {row.fields_used.map((f) => (
                        <Badge key={f} variant="outline" className="font-mono text-[10px]">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </FormDialog>
  );
}
