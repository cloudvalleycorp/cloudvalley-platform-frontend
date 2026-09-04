import { useState } from "react";
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { usePlatformAgent } from "@/hooks/usePlatformAgent";
import type { MetricHighlight } from "@/lib/metricIntelligence";
import { cn } from "@/lib/utils";

type Props = {
  companyId: string | null;
  highlights: MetricHighlight[] | null;
  loading: boolean;
  error: boolean;
  onLoad: () => void;
};

type WhyState = { status: "loading" } | { status: "error" } | { status: "done"; text: string };

// Highlight (delta+evidencia) sale de list-metric-highlights, real. El "por
// qué" causal por métrica es una pregunta puntual al agente (founder_dashboard)
// — no hay un endpoint que devuelva causalidad ya armada, así que la
// especificidad de la respuesta depende de cuántos datos conectados tenga esa
// startup (ver docs/design-system-command-center.md, sección 6).
export function WhatChangedSection({ companyId, highlights, loading, error, onLoad }: Props) {
  const { ask } = usePlatformAgent(companyId, "founder_dashboard");
  const [why, setWhy] = useState<Record<string, WhyState>>({});

  const explainWhy = async (h: MetricHighlight) => {
    const key = h.metric_id + h.title;
    setWhy((prev) => ({ ...prev, [key]: { status: "loading" } }));
    const res = await ask(`¿Por qué cambió "${h.title}"?`, {
      uiContext: { selectedMetricId: h.metric_id, selectedCategoryId: null, selectedReportId: null, currentPeriodId: null },
    });
    setWhy((prev) => ({ ...prev, [key]: res ? { status: "done", text: res.answer } : { status: "error" } }));
  };

  return (
    <SectionCard
      padding="sm"
      title={
        <span className="flex items-center gap-1.5">
          <Sparkles size={14} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          Qué cambió
        </span>
      }
      description={highlights ? `${highlights.length} cambio${highlights.length === 1 ? "" : "s"} detectado${highlights.length === 1 ? "" : "s"} vs. el período anterior` : undefined}
      action={
        !highlights && !loading ? (
          <Button variant="outline" size="sm" onClick={onLoad}>
            <Sparkles size={13} className="mr-1.5" aria-hidden="true" /> Generar
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Buscando los cambios más relevantes del período…
        </p>
      ) : error ? (
        <EmptyState
          bordered={false}
          icon={Sparkles}
          title="No pudimos generar esta sección ahora."
          description="Puede ser un problema temporal del servicio. Probá de nuevo en un rato."
          action={{ label: "Reintentar", onClick: onLoad }}
        />
      ) : !highlights ? (
        <EmptyState
          bordered={false}
          icon={Sparkles}
          title="Todavía no generaste los cambios de este período."
          description="Resume los cambios más grandes de tus métricas principales vs. el período anterior, con evidencia real."
          action={{ label: "Generar", onClick: onLoad }}
        />
      ) : highlights.length === 0 ? (
        <EmptyState bordered={false} icon={Sparkles} title="Sin cambios destacados este período." description="Ningún KPI principal tuvo una variación significativa." />
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {highlights.map((h) => {
            const key = h.metric_id + h.title;
            const state = why[key];
            const isGood = h.delta.delta_pct >= 0;
            return (
              <div key={key} className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{h.title}</p>
                    {h.description ? (
                      <p className="text-xs text-muted-foreground mt-1">{h.description}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">
                        {h.delta.current_value.toLocaleString()} vs {h.delta.prior_value.toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className={cn("text-sm font-semibold tabular-nums", isGood ? "text-success-dark" : "text-destructive-dark")}>
                      {isGood ? "+" : ""}
                      {h.delta.delta_pct.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-tertiary mt-0.5">confianza {h.confidence.score >= 0.7 ? "alta" : h.confidence.score >= 0.4 ? "media" : "baja"}</div>
                  </div>
                </div>

                {!state ? (
                  <button
                    type="button"
                    onClick={() => explainWhy(h)}
                    className="mt-2.5 text-xs font-medium text-primary flex items-center gap-1"
                  >
                    ¿Por qué? <ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                ) : (
                  <div className="mt-2.5" aria-live="polite">
                    {state.status === "loading" ? (
                      <p className="text-xs text-muted-foreground">Investigando…</p>
                    ) : state.status === "error" ? (
                      <p className="text-xs text-muted-foreground">No se pudo investigar esto ahora.</p>
                    ) : (
                      <div className="bg-surface rounded-md p-3">
                        <p className="text-xs leading-relaxed">{state.text}</p>
                        <button
                          type="button"
                          onClick={() => setWhy((prev) => { const next = { ...prev }; delete next[key]; return next; })}
                          className="mt-2 text-[11px] font-medium text-muted-foreground flex items-center gap-1"
                        >
                          Ocultar <ChevronUp size={11} strokeWidth={1.5} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
