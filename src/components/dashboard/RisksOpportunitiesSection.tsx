import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Wand2, Radar } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { MetricHighlight } from "@/lib/metricIntelligence";
import type { HealthIssue } from "@/lib/dataHealthIssues";
import type { ListMetricSourceCoverageResponse } from "@/lib/metricSourceCoverage";
import type { MetricDef } from "@/lib/metrics";
import { cn } from "@/lib/utils";

// Mismo mapa que CompanyHealthStrip.tsx — solo clasificamos un highlight
// como riesgo/oportunidad cuando sabemos si "para arriba" es bueno o malo
// para ese KPI (los 8 standard_key). Para una métrica custom no tenemos esa
// dirección definida por nadie — clasificarla igual sería inventar un
// juicio de negocio, así que esos highlights se quedan solo en "Qué cambió",
// no se duplican acá.
const GOOD_DIRECTION_UP: Record<string, boolean> = {
  arr: true,
  mrr: true,
  revenue: true,
  growth: true,
  gross_margin: true,
  cash: true,
  runway: true,
  burn: false,
};

const SIGNIFICANT_DELTA_PCT = 10;
const HIGH_IMPACT_DELTA_PCT = 25;

type Item = {
  id: string;
  kind: "risk" | "opportunity";
  title: string;
  impact: "high" | "medium";
  confidenceLabel: string | null;
  why: string;
  actionLabel: string;
  actionHref: string;
};

type Props = {
  metrics: MetricDef[];
  highlights: MetricHighlight[] | null;
  healthIssues: HealthIssue[];
  coverage: ListMetricSourceCoverageResponse | null;
  hasTriggeredEither: boolean;
  onLoadHighlights: () => void;
  onLoadCoverage: () => void;
};

function confidenceLabel(score: number): string {
  return score >= 0.7 ? "alta" : score >= 0.4 ? "media" : "baja";
}

export function RisksOpportunitiesSection({
  metrics,
  highlights,
  healthIssues,
  coverage,
  hasTriggeredEither,
  onLoadHighlights,
  onLoadCoverage,
}: Props) {
  const items = useMemo(() => {
    const list: Item[] = [];
    const metricById = new Map(metrics.map((m) => [m.id, m]));

    for (const h of highlights ?? []) {
      const standardKey = metricById.get(h.metric_id)?.standard_key;
      if (!standardKey || !(standardKey in GOOD_DIRECTION_UP)) continue;
      const magnitude = Math.abs(h.delta.delta_pct);
      if (magnitude < SIGNIFICANT_DELTA_PCT) continue;
      const goodUp = GOOD_DIRECTION_UP[standardKey];
      const isGood = (h.delta.delta_pct >= 0) === goodUp;
      list.push({
        id: `highlight-${h.metric_id}`,
        kind: isGood ? "opportunity" : "risk",
        title: h.title,
        impact: magnitude >= HIGH_IMPACT_DELTA_PCT ? "high" : "medium",
        confidenceLabel: confidenceLabel(h.confidence.score),
        why: h.description ?? `${h.delta.current_value.toLocaleString()} vs ${h.delta.prior_value.toLocaleString()} (${h.delta.delta_pct >= 0 ? "+" : ""}${h.delta.delta_pct.toFixed(1)}%).`,
        actionLabel: "Ver métrica",
        actionHref: `/metrics/${encodeURIComponent(h.metric_id)}`,
      });
    }

    for (const issue of healthIssues) {
      if (issue.severity === "info") continue;
      list.push({
        id: `issue-${issue.id}`,
        kind: "risk",
        title: issue.title,
        impact: issue.severity === "critical" ? "high" : "medium",
        confidenceLabel: null,
        why: issue.description,
        actionLabel: "Resolver",
        actionHref: issue.targetPath ?? "/metrics?tab=health",
      });
    }

    for (const m of coverage?.metrics ?? []) {
      if (m.status !== "proposal_connect" && m.status !== "proposal_enrich") continue;
      list.push({
        id: `coverage-${m.metric_id}`,
        kind: "opportunity",
        title: m.status === "proposal_connect" ? `Podés automatizar "${m.name}"` : `Podés sumarle una fuente a "${m.name}"`,
        impact: "medium",
        confidenceLabel: m.proposal?.low_confidence ? "baja" : "alta",
        why:
          m.status === "proposal_connect"
            ? "Se carga a mano hoy — la podemos calcular sola con lo que ya conectaste."
            : "Ya se calcula sola — hay una fuente nueva conectada para sumarle.",
        actionLabel: "Revisar en Métricas",
        actionHref: "/metrics",
      });
    }

    const order: Record<Item["impact"], number> = { high: 0, medium: 1 };
    return list.sort((a, b) => order[a.impact] - order[b.impact]);
  }, [metrics, highlights, healthIssues, coverage]);

  return (
    <SectionCard
      padding="sm"
      title={
        <span className="flex items-center gap-1.5">
          <Radar size={14} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          Riesgos y oportunidades
        </span>
      }
    >
      {!hasTriggeredEither ? (
        <EmptyState
          bordered={false}
          icon={Wand2}
          title="Generá Qué cambió y Qué podemos mejorar para ver riesgos y oportunidades acá."
          description="Esta sección combina esos dos resultados con la salud de tus datos — no dispara ninguna llamada de IA nueva."
          action={{ label: "Generar Qué cambió", onClick: onLoadHighlights }}
          secondaryAction={{ label: "Buscar mejoras", onClick: onLoadCoverage }}
        />
      ) : items.length === 0 ? (
        <EmptyState bordered={false} icon={Wand2} title="Nada que priorizar por ahora." description="No encontramos riesgos ni oportunidades significativas con lo que ya generaste." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border bg-card p-4 flex flex-col gap-2.5",
                item.kind === "risk"
                  ? item.impact === "high"
                    ? "border-l-[3px] border-l-destructive border-y-border border-r-border"
                    : "border-l-[3px] border-l-warning border-y-border border-r-border"
                  : "border-l-[3px] border-l-teal border-y-border border-r-border"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    className={cn(
                      "text-[10.5px] font-semibold uppercase tracking-wide",
                      item.kind === "risk" ? "text-destructive-dark" : "text-teal-dark"
                    )}
                  >
                    {item.kind === "risk" ? "Riesgo" : "Oportunidad"}
                  </p>
                  <p className="text-sm font-medium mt-0.5">{item.title}</p>
                </div>
                <Badge variant={item.kind === "risk" ? (item.impact === "high" ? "destructive" : "warning") : "teal"} className="shrink-0">
                  Impacto {item.impact === "high" ? "alto" : "medio"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{item.why}</p>
              <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-border mt-auto">
                <span className="text-xs text-tertiary">{item.confidenceLabel ? `Confianza: ${item.confidenceLabel}` : "Señal determinística"}</span>
                <Link to={item.actionHref} className="text-xs font-medium text-primary hover:underline">
                  {item.actionLabel} →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
      {hasTriggeredEither && (
        <div className="flex items-center gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onLoadHighlights}>
            Volver a generar Qué cambió
          </Button>
          <Button variant="ghost" size="sm" onClick={onLoadCoverage}>
            Volver a buscar mejoras
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
