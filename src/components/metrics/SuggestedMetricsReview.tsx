import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { EmptyState } from "@/components/EmptyState";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { handleMembershipError } from "@/lib/membership";
import { UPSERT_FINANCIAL_METRIC_DEFINITION_URL } from "@/lib/financialReports";
import { slugify } from "@/hooks/useMetricPropertyForm";
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
// métricas (Metrics.tsx). Nada se guarda solo: cada sugerencia arranca
// tildada pero editable, y el usuario puede destildarla antes de confirmar.
export function SuggestedMetricsReview({
  open,
  onOpenChange,
  suggestions,
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
    const approved = rows.filter((r) => r.approved);
    if (approved.length === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    const existingIds = new Set(allMetrics.map((m) => m.id));
    let successCount = 0;
    let failCount = 0;
    for (const r of approved) {
      if (!r.name.trim() || !r.formula_expression.trim()) {
        failCount++;
        continue;
      }
      const base = slugify(r.name);
      let slug = base;
      let suffix = 2;
      while (existingIds.has(slug)) {
        slug = `${base}_${suffix}`;
        suffix++;
      }
      existingIds.add(slug);
      const category = r.category.trim() || defaultCategory;
      const displayOrder =
        Math.max(0, ...allMetrics.filter((m) => m.category === category).map((m) => m.order_index)) + 1;
      try {
        const res = await fetch(UPSERT_FINANCIAL_METRIC_DEFINITION_URL, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_id: companyId,
            metric_id: slug,
            name: r.name.trim(),
            category,
            metric_type: "calculated",
            unit: r.unit?.trim() || null,
            display_order: displayOrder,
            formula_expression: r.formula_expression.trim(),
            description: r.description.trim() || undefined,
            why_it_matters: r.why_it_matters?.trim() || undefined,
          }),
        });
        if (await handleMembershipError(res)) {
          failCount++;
          continue;
        }
        if (!res.ok) {
          failCount++;
          continue;
        }
        successCount++;
      } catch {
        failCount++;
      }
    }
    setSaving(false);
    if (successCount > 0) {
      toast.success(`${successCount} métrica${successCount === 1 ? "" : "s"} agregada${successCount === 1 ? "" : "s"}`);
      onSaved();
    }
    if (failCount > 0) {
      toast.error(`${failCount} métrica${failCount === 1 ? "" : "s"} no se pudo${failCount === 1 ? "" : "ieron"} guardar`);
    }
    if (failCount === 0) onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Revisá las métricas sugeridas"
      description="La IA propuso esto a partir de tus datos. Nada se crea todavía: destildá lo que no quieras, ajustá lo que haga falta y confirmá."
      contentClassName="sm:max-w-2xl"
      onSubmit={handleConfirm}
      submitLabel={saving ? "Guardando…" : `Agregar ${approvedCount > 0 ? approvedCount : ""}`.trim()}
      busy={saving || approvedCount === 0}
    >
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
                    <Input
                      value={row.formula_expression}
                      onChange={(e) => setRow(i, { formula_expression: e.target.value })}
                      className="font-mono text-xs"
                    />
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
