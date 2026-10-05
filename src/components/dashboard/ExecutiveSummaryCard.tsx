import { useEffect, useRef, useState } from "react";
import { Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/SectionCard";
import { SectionNum } from "@/components/dashboard/SectionNum";
import { usePlatformAgent } from "@/hooks/usePlatformAgent";
import { getDashboardAiCache, setDashboardAiCache } from "@/lib/dashboardAiCache";

type Props = { companyId: string | null };

const INITIAL_QUESTION =
  "Dame un resumen ejecutivo del estado actual de la startup: qué cambió este período, por qué, y qué deberíamos priorizar ahora.";

// Se auto-genera solo una vez por sesión de pestaña (cache en memoria,
// dashboardAiCache.ts) — pedido explícito del usuario 2026-09-29: "no
// debería darse click para que dé el reporte, sino que aparezca el resumen
// insight". El costo real de la llamada de IA sigue siendo la razón de por
// qué esto se cachea en vez de auto-disparar en cada render, no un motivo
// que haya dejado de existir. "Actualizar" sigue siendo la única forma de
// forzar una regeneración real.
export function ExecutiveSummaryCard({ companyId }: Props) {
  const { ask, asking } = usePlatformAgent(companyId, "founder_dashboard");
  const cached = companyId ? getDashboardAiCache(companyId).executiveSummary : undefined;
  const [answer, setAnswer] = useState<string | null>(cached?.answer ?? null);
  const [actionRequests, setActionRequests] = useState<string[]>(cached?.actionRequests ?? []);
  const [error, setError] = useState(false);
  const autoTriggered = useRef(false);

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
    if (companyId) setDashboardAiCache(companyId, { executiveSummary: { answer: res.answer, actionRequests: res.action_requests ?? [] } });
  };

  useEffect(() => {
    if (!companyId || answer || autoTriggered.current) return;
    autoTriggered.current = true;
    run(INITIAL_QUESTION);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  return (
    <SectionCard
      padding="sm"
      title={
        <span className="flex items-center gap-2">
          <SectionNum n={1} />
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
          <p className="text-sm leading-relaxed whitespace-pre-line max-w-[70ch]">{answer}</p>
          <p className="mt-3 text-xs font-medium text-teal-dark">Generado con IA a partir de tus métricas</p>
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
