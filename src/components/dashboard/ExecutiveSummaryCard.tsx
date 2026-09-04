import { useState } from "react";
import { Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/SectionCard";
import { usePlatformAgent } from "@/hooks/usePlatformAgent";

type Props = { companyId: string | null };

const INITIAL_QUESTION =
  "Dame un resumen ejecutivo del estado actual de la startup: qué cambió este período, por qué, y qué deberíamos priorizar ahora.";

// Disparo manual siempre (nunca se pide solo al entrar al Dashboard) — mismo
// principio que "Destacados"/"Qué podemos mejorar" en MetricsOverviewTab.tsx:
// es una llamada de IA con costo real, el founder la pide cuando la quiere.
export function ExecutiveSummaryCard({ companyId }: Props) {
  const { ask, asking } = usePlatformAgent(companyId, "founder_dashboard");
  const [answer, setAnswer] = useState<string | null>(null);
  const [actionRequests, setActionRequests] = useState<string[]>([]);
  const [error, setError] = useState(false);

  const run = async (question: string) => {
    setError(false);
    const res = await ask(question, {
      uiContext: { selectedMetricId: null, selectedCategoryId: null, selectedReportId: null, currentPeriodId: null },
    });
    if (!res) {
      setError(true);
      return;
    }
    setAnswer(res.answer);
    setActionRequests(res.action_requests ?? []);
  };

  return (
    <SectionCard
      padding="sm"
      title={
        <span className="flex items-center gap-1.5">
          <Sparkles size={14} strokeWidth={1.5} className="text-primary" aria-hidden="true" />
          Resumen ejecutivo
        </span>
      }
      className="border-primary/30 bg-primary/5"
      action={
        answer && !asking ? (
          <Button variant="ghost" size="sm" onClick={() => run(INITIAL_QUESTION)}>
            <RotateCcw size={12} className="mr-1.5" aria-hidden="true" /> Actualizar
          </Button>
        ) : undefined
      }
    >
      {asking ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Analizando el estado actual…
        </p>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 flex-wrap" aria-live="polite">
          <p className="text-sm text-muted-foreground">No pudimos generar el resumen ahora.</p>
          <Button variant="outline" size="sm" onClick={() => run(INITIAL_QUESTION)}>
            Reintentar
          </Button>
        </div>
      ) : !answer ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">Generá una síntesis de cómo está la startup ahora mismo, con IA.</p>
          <Button size="sm" onClick={() => run(INITIAL_QUESTION)}>
            <Sparkles size={13} className="mr-1.5" aria-hidden="true" /> Generar resumen ejecutivo
          </Button>
        </div>
      ) : (
        <div aria-live="polite">
          <p className="text-sm leading-relaxed whitespace-pre-line">{answer}</p>
          {actionRequests.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {actionRequests.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => run(a)}
                  className="text-xs font-medium border border-primary/30 bg-card rounded-full px-3 py-1.5 hover:bg-primary/10 transition-colors"
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
