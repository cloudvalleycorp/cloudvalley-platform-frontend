import { useEffect, useState } from "react";
import { SectionCard } from "@/components/SectionCard";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComplianceStatusPill } from "@/components/investor/ComplianceStatusPill";
import { fetchSuggestedLinks, useMetricRequirementFulfillment } from "@/hooks/useMetricRequirementFulfillment";
import { PERIODICITY_LABELS, type FundRequiredMetricRow, type SuggestedMetricLinkCandidate } from "@/lib/metricRequirements";
import type { MetricDef } from "@/lib/metrics";
import { Landmark } from "lucide-react";

type Props = {
  rows: FundRequiredMetricRow[];
  ownMetrics: MetricDef[];
  onChanged: () => void;
  // Abre MetricPropertyPanel en modo creación, precargado con este pedido —
  // ver Metrics.tsx (dueño del panel) y useMetricPropertyForm's
  // fulfillsRequirementId/prefill.
  onCreateNew: (requirement: FundRequiredMetricRow) => void;
};

// Se mezclan visualmente en la misma pantalla de Métricas (arriba del
// catálogo propio, en ambos modos data/manage) — no es una pantalla aparte.
// Cada fila fund_required nunca es una MetricDefinition real (metric_id
// null): acá solo se muestra el pedido + estado + acciones de cumplimiento
// (vincular/desvincular/no aplicable), nunca edición de la definición en sí.
export function FundRequiredMetricsSection({ rows, ownMetrics, onChanged, onCreateNew }: Props) {
  const [linking, setLinking] = useState<FundRequiredMetricRow | null>(null);
  const [markingNa, setMarkingNa] = useState<FundRequiredMetricRow | null>(null);
  const [unlinking, setUnlinking] = useState<FundRequiredMetricRow | null>(null);
  const [clearingNa, setClearingNa] = useState<FundRequiredMetricRow | null>(null);
  const [reason, setReason] = useState("");
  const { linkMetric, unlinkMetric, setApplicability, saving } = useMetricRequirementFulfillment(onChanged);

  const metricById = Object.fromEntries(ownMetrics.map((m) => [m.id, m]));

  if (rows.length === 0) return null;

  return (
    <>
      <SectionCard
        title="Requisitos de tus fondos"
        description="Métricas que tus fondos conectados te piden — vos decidís cómo calcularlas con tus propios datos."
        className="mb-8"
      >
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {rows.map((r) => {
            const linkedMetric = r.linked_own_metric_id ? metricById[r.linked_own_metric_id] : null;
            return (
              <div key={r.requirement_id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">{r.name}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Landmark size={11} strokeWidth={1.5} aria-hidden="true" />
                      {r.source_fund_name}
                    </span>
                    <ComplianceStatusPill status={r.compliance_status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {r.unit} · {PERIODICITY_LABELS[r.periodicity]}
                    {r.description ? ` · ${r.description}` : ""}
                    {linkedMetric ? ` · Vinculada a "${linkedMetric.name}"` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.compliance_status === "not_applicable" ? (
                    <Button variant="ghost" size="sm" onClick={() => setClearingNa(r)}>
                      Revertir "no aplicable"
                    </Button>
                  ) : linkedMetric ? (
                    <Button variant="ghost" size="sm" onClick={() => setUnlinking(r)}>
                      Desvincular
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setLinking(r)}>
                        Vincular métrica
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setMarkingNa(r)}>
                        No aplica
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <LinkMetricDialog
        requirement={linking}
        ownMetrics={ownMetrics}
        onOpenChange={(o) => !o && setLinking(null)}
        onConfirm={async (metricId) => {
          if (!linking) return;
          const ok = await linkMetric(linking.requirement_id, metricId);
          if (ok) setLinking(null);
        }}
        onCreateNew={() => {
          if (!linking) return;
          onCreateNew(linking);
          setLinking(null);
        }}
        busy={saving}
      />

      <FormDialog
        open={!!markingNa}
        onOpenChange={(o) => !o && setMarkingNa(null)}
        title={`Marcar "${markingNa?.name ?? ""}" como no aplicable`}
        description="Se lo comunica al fondo de inmediato, sin que tenga que aprobarlo — pero necesita un motivo."
        onSubmit={async () => {
          if (!markingNa || !reason.trim()) return;
          const ok = await setApplicability(markingNa.requirement_id, "not_applicable", reason.trim());
          if (ok) {
            setMarkingNa(null);
            setReason("");
          }
        }}
        submitLabel="Marcar como no aplicable"
        busy={saving}
      >
        <FormField label="Motivo">
          <Textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: no aplica a nuestro modelo de negocio"
            rows={3}
          />
        </FormField>
      </FormDialog>

      <ConfirmationDialog
        open={!!unlinking}
        onOpenChange={(o) => !o && setUnlinking(null)}
        title="¿Desvincular esta métrica?"
        description="El requisito del fondo vuelve a quedar sin cumplir. Tu métrica propia no se toca."
        confirmLabel="Desvincular"
        onConfirm={async () => {
          if (!unlinking) return;
          const ok = await unlinkMetric(unlinking.requirement_id);
          if (ok) setUnlinking(null);
        }}
        busy={saving}
      />

      <ConfirmationDialog
        open={!!clearingNa}
        onOpenChange={(o) => !o && setClearingNa(null)}
        title="¿Volver a activar este requisito?"
        description="Deja de estar marcado como no aplicable — vuelve a contar como pendiente hasta que lo vincules."
        confirmLabel="Reactivar"
        onConfirm={async () => {
          if (!clearingNa) return;
          const ok = await setApplicability(clearingNa.requirement_id, "clear");
          if (ok) setClearingNa(null);
        }}
        busy={saving}
      />
    </>
  );
}

function LinkMetricDialog({
  requirement,
  ownMetrics,
  onOpenChange,
  onConfirm,
  onCreateNew,
  busy,
}: {
  requirement: FundRequiredMetricRow | null;
  ownMetrics: MetricDef[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (metricId: string) => void;
  onCreateNew: () => void;
  busy: boolean;
}) {
  const [candidates, setCandidates] = useState<SuggestedMetricLinkCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (!requirement) {
      setCandidates([]);
      setSelected("");
      return;
    }
    setLoadingCandidates(true);
    fetchSuggestedLinks(requirement.requirement_id)
      .then(setCandidates)
      .finally(() => setLoadingCandidates(false));
  }, [requirement]);

  return (
    <FormDialog
      open={!!requirement}
      onOpenChange={onOpenChange}
      title={`Vincular una métrica para "${requirement?.name ?? ""}"`}
      description="El fondo va a ver el valor que calcules acá — nunca la fórmula."
      onSubmit={() => selected && onConfirm(selected)}
      submitLabel="Vincular"
      busy={busy}
    >
      {loadingCandidates ? (
        <p className="text-xs text-muted-foreground">Buscando métricas parecidas…</p>
      ) : candidates.length > 0 ? (
        <FormField label="Sugeridas">
          <div className="space-y-1.5">
            {candidates.map((c) => (
              <label
                key={c.metric_id}
                className="flex items-start gap-2 px-3 py-2 border border-border rounded-md text-sm cursor-pointer hover:bg-surface"
              >
                <input
                  type="radio"
                  name="candidate"
                  className="mt-0.5"
                  checked={selected === c.metric_id}
                  onChange={() => setSelected(c.metric_id)}
                />
                <span>
                  <span className="block text-foreground">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">{c.reason}</span>
                </span>
              </label>
            ))}
          </div>
        </FormField>
      ) : (
        <p className="text-xs text-muted-foreground">No encontramos ninguna métrica propia parecida.</p>
      )}
      <FormField label="O elegí de tu catálogo" helpText="La unidad y periodicidad tienen que coincidir con lo pedido.">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger>
            <SelectValue placeholder="Elegí una métrica" />
          </SelectTrigger>
          <SelectContent>
            {ownMetrics.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <button
        type="button"
        onClick={onCreateNew}
        className="text-xs text-primary hover:underline"
      >
        Ninguna me sirve, crear una métrica nueva para esto
      </button>
    </FormDialog>
  );
}
