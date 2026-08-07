import { useState } from "react";
import { Send } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useMetricInsights } from "@/hooks/useMetricInsights";
import type { VisibleMetric } from "@/lib/aiInsights";

type Exchange = { question: string; answer: string };

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

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) return;
    const answer = await askQuestion(q, period, visibleMetrics);
    if (answer) setExchanges((prev) => [...prev, { question: q, answer }]);
    setQuestion("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 text-left">
          <SheetTitle>Preguntar sobre tus métricas</SheetTitle>
          <SheetDescription>Preguntá en lenguaje natural, la respuesta usa tus datos reales.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {exchanges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ej: "¿por qué bajó el churn en marzo?" o "¿cuál es mi métrica que más creció este trimestre?"
            </p>
          ) : (
            exchanges.map((ex, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-sm font-medium">{ex.question}</p>
                <p className="text-sm text-muted-foreground bg-surface border border-border rounded-md p-3">
                  {ex.answer}
                </p>
              </div>
            ))
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
            <Send size={14} aria-hidden="true" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
