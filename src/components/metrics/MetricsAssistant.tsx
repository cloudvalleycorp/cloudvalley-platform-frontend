import { useState } from "react";
import { Send } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useMetricInsights } from "@/hooks/useMetricInsights";
import type { VisibleMetric, ConversationTurn } from "@/lib/aiInsights";

type Exchange = { question: string; answer: string };

function exchangesToHistory(exchanges: Exchange[]): ConversationTurn[] {
  return exchanges.flatMap((ex) => [
    { role: "user" as const, content: ex.question },
    { role: "assistant" as const, content: ex.answer },
  ]);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  period?: string; // "YYYY-MM"
  // Lo que el usuario tiene en pantalla ahora mismo (hasta 30 items) — el
  // backend no puede calcular una métrica calculated solo, esto mejora mucho
  // la respuesta cuando la pregunta es sobre una de esas. Ver Metrics.tsx.
  visibleMetrics?: VisibleMetric[];
};

/**
 * Preguntas en lenguaje natural sobre las métricas de la company (POST
 * /ask-metrics-question). Historial solo en memoria — se pierde al cerrar,
 * no hay endpoint para persistirlo y no se pidió.
 */
export function MetricsAssistant({ open, onOpenChange, companyId, period, visibleMetrics }: Props) {
  const { askQuestion, asking } = useMetricInsights(companyId);
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  // La pregunta que está en vuelo — separada de `exchanges` para poder
  // mostrarla ya mismo (con el indicador de "escribiendo") en vez de que
  // desaparezca del textarea y no vuelva a aparecer hasta que responda.
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    setPendingQuestion(q);
    // El historial que se manda es el de ANTES de esta pregunta — la
    // pregunta actual ya va en `question`, no se duplica acá.
    const answer = await askQuestion(q, period, visibleMetrics, exchangesToHistory(exchanges));
    setPendingQuestion(null);
    if (answer) setExchanges((prev) => [...prev, { question: q, answer }]);
  };

  // El backend no guarda nada entre llamadas (no hay conversation_id) — al
  // cerrar se descarta el historial, la próxima pregunta arranca de cero.
  const handleOpenChange = (o: boolean) => {
    onOpenChange(o);
    if (!o) setExchanges([]);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 text-left">
          <SheetTitle>Preguntar sobre tus métricas</SheetTitle>
          <SheetDescription>Preguntá en lenguaje natural, la respuesta usa tus datos reales.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {exchanges.length === 0 && !pendingQuestion && (
            <p className="text-sm text-muted-foreground">
              Ej: "¿por qué bajó el churn en marzo?" o "¿cuál es mi métrica que más creció este trimestre?"
            </p>
          )}
          {exchanges.map((ex, i) => (
            <div key={i} className="space-y-1.5">
              <p className="text-sm font-medium">{ex.question}</p>
              <p className="text-sm text-muted-foreground bg-surface border border-border rounded-md p-3">
                {ex.answer}
              </p>
            </div>
          ))}
          {pendingQuestion && (
            <div className="space-y-1.5 animate-fade-in">
              <p className="text-sm font-medium">{pendingQuestion}</p>
              <div
                role="status"
                className="flex items-center gap-1 bg-surface border border-border rounded-md p-3 w-fit"
              >
                <span className="sr-only">Pensando…</span>
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse [animation-delay:-0.3s]" aria-hidden="true" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse [animation-delay:-0.15s]" aria-hidden="true" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse" aria-hidden="true" />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0 flex items-end gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAsk();
              }
            }}
            rows={2}
            placeholder="Escribí tu pregunta…"
            aria-label="Escribí tu pregunta"
            className="resize-none"
          />
          <Button size="sm" onClick={handleAsk} disabled={!question.trim() || asking} aria-label="Enviar pregunta">
            <Send size={14} aria-hidden="true" className={asking ? "animate-pulse" : undefined} />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
