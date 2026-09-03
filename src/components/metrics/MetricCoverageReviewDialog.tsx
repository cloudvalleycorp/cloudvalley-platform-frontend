import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { QuerySummary } from "@/components/metrics/query-builder/QuerySummary";
import { handleMembershipError } from "@/lib/membership";
import { normalizeCategory } from "@/hooks/useMetricPropertyForm";
import { UPSERT_FINANCIAL_METRIC_DEFINITION_URL } from "@/lib/financialReports";
import type { MetricCoverageRow, NewStandardKpiRow } from "@/lib/metricSourceCoverage";
import type { MetricDef, RawField } from "@/lib/metrics";

// kind separado en 3 literales (no "connect" | "enrich" agrupados en un
// mismo miembro) a propósito — con un discriminante de 2 valores en un solo
// miembro del union, TS no siempre angosta `item.row` de forma confiable
// después de descartar ambos en una cadena de ternarios (ver el resto de
// este archivo, cada acceso a item.row depende de esa angostura).
export type CoverageReviewItem =
  | { kind: "connect"; row: MetricCoverageRow }
  | { kind: "enrich"; row: MetricCoverageRow }
  | { kind: "new_standard"; row: NewStandardKpiRow };

type Props = {
  item: CoverageReviewItem | null;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  allMetrics: MetricDef[];
  rawFields: RawField[];
  categories: { id: string; label: string }[];
  defaultCategory: string;
  onSaved: () => void;
};

// Confirmación de UNA propuesta de list-metric-source-coverage (nunca se
// aplica sola, mismo principio que el resto de esta pantalla — toda
// escritura de IA pasa por revisión explícita). Cubre los 3 modos posibles:
// "connect" (una métrica de carga manual pasa a calcularse con esta fuente),
// "enrich" (una métrica ya calculada suma una fuente nueva — el query ya
// viene combinado desde backend, no hace falta armar el arithmetic acá,
// mismo criterio que handleCombine en SuggestedMetricsReview.tsx) y
// "new_standard" (un KPI estándar sin métrica propia se crea de cero, único
// caso donde se manda metric_class/standard_key).
export function MetricCoverageReviewDialog({ item, onOpenChange, companyId, allMetrics, rawFields, categories, defaultCategory, onSaved }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    if (item.kind === "new_standard") {
      setName(item.row.label);
      setCategory(defaultCategory);
      setUnit("");
    }
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  if (!item) return null;

  const target = item.kind !== "new_standard" ? allMetrics.find((m) => m.id === item.row.metric_id) ?? null : null;
  const proposal = item.row.proposal;
  if (!proposal || (item.kind !== "new_standard" && !target)) return null;

  const title = item.kind === "new_standard" ? `Confirmá tu ${item.row.label}` : `Confirmá "${target!.name}"`;
  const description =
    item.kind === "connect"
      ? "Esta métrica se cargaba a mano. A partir de ahora se va a calcular sola con la fuente que ya conectaste."
      : item.kind === "enrich"
        ? "Esta métrica ya se calcula sola — le vamos a sumar una fuente nueva que todavía no estaba usando."
        : `Todavía no trackeabas ${item.row.label} como métrica propia — la podemos crear con lo que ya conectaste.`;

  const handleConfirm = async () => {
    if (!companyId) return;
    let body: Record<string, unknown>;
    if (item.kind === "new_standard") {
      // Re-leído acá (en vez de reusar el `proposal` de arriba) para que TS
      // lo tipe como NewStandardKpiProposal — el `item.kind` recién chequeado
      // no angosta una variable ya asignada afuera de este bloque.
      const newProposal = item.row.proposal!;
      const trimmedName = name.trim();
      const normalizedCategory = normalizeCategory(category, categories);
      if (!trimmedName || !normalizedCategory) {
        toast.error("Nombre y categoría son obligatorios");
        return;
      }
      const displayOrder = Math.max(0, ...allMetrics.filter((m) => m.category === normalizedCategory).map((m) => m.order_index)) + 1;
      body = {
        company_id: companyId,
        metric_id: newProposal.new_metric_id,
        name: trimmedName,
        category: normalizedCategory,
        metric_type: "calculated",
        unit: unit.trim() || null,
        display_order: displayOrder,
        query: newProposal.query,
        metric_class: "standard",
        standard_key: newProposal.standard_key,
      };
    } else {
      const t = target!;
      body = {
        company_id: companyId,
        metric_id: t.id,
        name: t.name,
        category: t.category,
        metric_type: "calculated",
        unit: t.unit ?? null,
        display_order: t.order_index,
        value_type: t.value_type ?? "count",
        query: proposal.query,
      };
      if (t.description) body.description = t.description;
      if (t.why_it_matters) body.why_it_matters = t.why_it_matters;
    }

    setSaving(true);
    try {
      const res = await fetch(UPSERT_FINANCIAL_METRIC_DEFINITION_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        await handleMembershipError(res);
        setSaving(false);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(typeof data?.error === "string" ? data.error : "No se pudo confirmar la propuesta.");
        setSaving(false);
        return;
      }
      toast.success(item.kind === "new_standard" ? `${name.trim()} agregada` : `"${target!.name}" actualizada`);
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("No se pudo confirmar la propuesta — probá de nuevo.");
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={!!item}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onSubmit={handleConfirm}
      submitLabel={saving ? "Confirmando…" : "Confirmar"}
      busy={saving}
    >
      {item.kind === "new_standard" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Unidad">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="USD, %, x, meses…" />
          </FormField>
          <FormField label="Categoría (tab donde aparece)" className="sm:col-span-2">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} list="coverage-category-list" />
            <datalist id="coverage-category-list">
              {categories.map((c) => (
                <option key={c.id} value={c.id} />
              ))}
            </datalist>
          </FormField>
        </div>
      )}
      {proposal.low_confidence && (
        <Badge variant="warning" className="gap-1">
          <AlertTriangle size={11} strokeWidth={1.5} aria-hidden="true" />
          Confianza baja — revisá la consulta antes de confirmar
        </Badge>
      )}
      <div>
        <p className="text-xs font-medium text-foreground mb-1.5">Consulta</p>
        <div className="rounded-md bg-surface border border-border p-2.5">
          <QuerySummary query={proposal.query} rawFields={rawFields} className="text-xs" />
        </div>
      </div>
    </FormDialog>
  );
}
