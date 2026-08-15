import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { EmptyState } from "@/components/EmptyState";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, AlertTriangle } from "lucide-react";
import { QuerySummary } from "@/components/metrics/query-builder/QuerySummary";
import { handleMembershipError } from "@/lib/membership";
import { normalizeCategory, slugify } from "@/hooks/useMetricPropertyForm";
import { UPSERT_FINANCIAL_METRIC_DEFINITION_URL } from "@/lib/financialReports";
import type { SuggestedMetric, MetricNeedingMoreData } from "@/lib/aiInsights";
import type { MetricDef } from "@/lib/metrics";

type ReviewRow = SuggestedMetric & { approved: boolean };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: SuggestedMetric[];
  // Métricas que la IA hubiera necesitado inventar un supuesto de negocio
  // (margen, tasa) para proponer sin datos reales — se muestran como
  // referencia, nunca se completan solas del lado frontend.
  needingMoreData: MetricNeedingMoreData[];
  companyId: string | null;
  allMetrics: MetricDef[];
  categories: { id: string; label: string }[];
  defaultCategory: string;
  // La IA solo propone (ver aiInsights.ts) — esto recién persiste algo real
  // al confirmar, vía upsert-metric-definition (el mismo endpoint que ya usa
  // MetricPropertyPanel). Después recarga el catálogo.
  onSaved: () => void;
};

// Revisión de lo que devuelve analyze-transactional-sheet (paso "Analizar
// con IA" del wizard de Sheets, GrowthTrackerSheets.tsx). Desde el cambio de
// contrato 2026-08-14, suggested_metrics trae query (QuerySpec estructurado)
// en vez de formula_expression de texto libre, así que ahora sí se puede
// confirmar directo acá contra upsert-metric-definition — antes del cambio
// esto quedaba bloqueado (ver historial de este archivo). La query se
// muestra de solo lectura vía QuerySummary; si el usuario quiere ajustarla
// (no solo nombre/categoría/descripción/unidad), lo hace después desde
// "Editar métrica" con el query builder completo.
export function SuggestedMetricsReview({
  open,
  onOpenChange,
  suggestions,
  needingMoreData,
  companyId,
  allMetrics,
  categories,
  defaultCategory,
  onSaved,
}: Props) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setRows(suggestions.map((s) => ({ ...s, approved: true, category: s.category?.trim() || defaultCategory })));
  }, [open, suggestions, defaultCategory]);

  const setRow = (i: number, patch: Partial<ReviewRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const approvedCount = rows.filter((r) => r.approved).length;

  const handleConfirm = async () => {
    if (!companyId) return;
    const approved = rows.filter((r) => r.approved && r.name.trim());
    if (approved.length === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    const existingIds = new Set(allMetrics.map((m) => m.id));
    let savedCount = 0;
    for (const row of approved) {
      const category = normalizeCategory(row.category, categories);
      if (!category) continue;
      const base = slugify(row.name);
      let slug = base;
      let suffix = 2;
      while (existingIds.has(slug)) {
        slug = `${base}_${suffix}`;
        suffix++;
      }
      existingIds.add(slug);
      const displayOrder =
        Math.max(0, ...allMetrics.filter((m) => m.category === category).map((m) => m.order_index)) + 1;
      const body: Record<string, unknown> = {
        company_id: companyId,
        metric_id: slug,
        name: row.name.trim(),
        category,
        metric_type: "calculated",
        unit: row.unit.trim() || null,
        display_order: displayOrder,
        query: row.query,
      };
      if (row.description.trim()) body.description = row.description.trim();
      if (row.why_it_matters.trim()) body.why_it_matters = row.why_it_matters.trim();
      try {
        const res = await fetch(UPSERT_FINANCIAL_METRIC_DEFINITION_URL, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (await handleMembershipError(res)) {
          setSaving(false);
          return;
        }
        if (res.ok) savedCount++;
      } catch {
        // sigue con el resto de las filas aprobadas
      }
    }
    setSaving(false);
    if (savedCount > 0) {
      toast.success(`${savedCount} métrica${savedCount === 1 ? "" : "s"} agregada${savedCount === 1 ? "" : "s"}`);
      onSaved();
    }
    if (savedCount < approved.length) {
      toast.error(`${approved.length - savedCount} métrica${approved.length - savedCount === 1 ? "" : "s"} no se pudo guardar`);
    }
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Revisá las métricas sugeridas"
      description="La IA propuso esto a partir de tus datos. Nada se crea todavía."
      contentClassName="sm:max-w-2xl"
      submitLabel={approvedCount > 0 ? `Agregar ${approvedCount} métrica${approvedCount === 1 ? "" : "s"}` : "Agregar"}
      onSubmit={handleConfirm}
      busy={saving}
    >
      {needingMoreData.length > 0 && (
        <Alert>
          <AlertTriangle size={16} aria-hidden="true" />
          <AlertDescription className="text-xs space-y-1">
            <p className="font-medium">La IA no pudo proponer estas métricas por falta de datos:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {needingMoreData.map((m, i) => (
                <li key={i}>
                  <span className="font-medium">{m.name}:</span> {m.missing_data_description}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
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
                  <div>
                    <p className="text-xs font-medium text-foreground mb-1.5">Consulta</p>
                    <div className="rounded-md bg-surface border border-border p-2.5">
                      <QuerySummary query={row.query} className="text-xs" />
                    </div>
                    <p className="text-[11px] text-tertiary mt-1">
                      Se puede ajustar después desde "Editar métrica" con el query builder completo.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </FormDialog>
  );
}
