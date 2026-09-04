import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Send, RotateCcw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InfoRow } from "@/components/InfoRow";
import { QuerySummary } from "@/components/metrics/query-builder/QuerySummary";
import { usePlatformAgent } from "@/hooks/usePlatformAgent";
import { slugify } from "@/hooks/useMetricPropertyForm";
import { isQuerySpec, type QuerySpec } from "@/lib/querySpec";
import type {
  PlatformAgentSurface,
  PlatformAgentUiContext,
  PlatformAgentMetricFields,
  PlatformAgentResponse,
  ObservabilityTraceEntry,
  FormulaSyntaxEntry,
} from "@/lib/aiInsights";

type Exchange = {
  question: string;
  response: PlatformAgentResponse;
  // Índices de observability_trace ya resueltos (confirmados o descartados)
  // por el usuario — así una card de confirmación no se puede clickear dos
  // veces ni queda mostrando un estado viejo.
  resolvedTraceIndices: Set<number>;
};

const METRIC_FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  category: "Categoría",
  metric_type: "Tipo",
  formula_expression: "Fórmula",
  query: "Consulta",
  unit: "Unidad",
  description: "Descripción",
  why_it_matters: "Por qué importa",
  benchmark: "Benchmark",
  input_key: "Campo",
  value_type: "Tipo de valor",
};
const METRIC_TYPE_LABELS: Record<string, string> = { calculated: "Calculada", input: "Dato crudo existente" };

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}

// Se detecta cada caso de forma estructural (¿tiene proposed? ¿tiene
// report_id/metric_id? ¿tiene formula_expression?) en vez de matchear por
// nombre de tool interno. El objeto a revisar/confirmar viene bajo distinta
// clave según la tool: "proposed" en upsert-metric-definition, o
// "proposed_metric" en add-metric-to-report cuando la métrica todavía no
// existe (sin metric_id — se genera un slug al confirmar, ver
// handleConfirmWrite). Si status es pending_confirmation pero no vino
// ninguno de los dos, igual se arma un objeto mínimo con lo que sí esté en
// result (ej. metric_id/report_id sueltos, caso add-metric-to-report con
// una métrica que ya existe) — nunca se descarta un pending_confirmation en
// silencio solo porque no matchea la clave que esperábamos.
function pendingConfirmations(trace: ObservabilityTraceEntry[]) {
  return trace
    .map((entry, index) => {
      if (entry.result?.status !== "pending_confirmation") return null;
      const proposed =
        asRecord(entry.result?.proposed) ??
        asRecord(entry.result?.proposed_metric) ??
        Object.fromEntries(Object.entries(entry.result).filter(([k]) => k !== "status"));
      return Object.keys(proposed).length > 0 ? { index, proposed } : null;
    })
    .filter((x): x is { index: number; proposed: Record<string, unknown> } => !!x);
}
function createdLinks(trace: ObservabilityTraceEntry[]) {
  return trace
    .map((entry, index) => {
      // status "ok" de upsert-metric-definition (escritura directa, sin
      // pending_confirmation) trae la métrica anidada en result.metric, no
      // metric_id suelto en el nivel de arriba — status "created" de
      // create-report-from-proposal sí trae report_id suelto.
      const nestedMetric = asRecord(entry.result?.metric);
      const status = entry.result?.status;
      return {
        index,
        // Requiere un status explícito de escritura completada, no la mera
        // ausencia de pending_confirmation — esa versión anterior mostraba
        // "Ver métrica" antes de confirmar nada apenas apareció un tool
        // nuevo (propose-metric-edit, 2026-08-14) con un metric_id suelto
        // puramente informativo (identifica de qué métrica se habla, no que
        // se haya escrito) y sin ningún status. Confirmado en vivo.
        done: status === "ok" || status === "created" || status === "added",
        reportId: asString(entry.result?.report_id),
        metricId: asString(entry.result?.metric_id) ?? asString(nestedMetric?.metric_id),
      };
    })
    .filter((x) => x.done && (x.reportId || x.metricId));
}
// Red de seguridad, no la solución principal: ahora existe add-metric-to-report
// para agregar una métrica a un reporte YA EXISTENTE (pedida y deployada
// 2026-08-09), pero mientras no esté verificado en vivo que el agente la
// elige siempre en vez de create-report-from-proposal (que solo crea
// reportes NUEVOS), si en report_editor vuelve un report_id distinto al que
// ya está abierto, se avisa en vez de ofrecer el link como si fuera el
// resultado esperado — puede ser un duplicado por mala interpretación.
function isUnexpectedNewReport(surface: PlatformAgentSurface, uiContext: PlatformAgentUiContext, reportId: string) {
  return surface === "report_editor" && !!uiContext.selectedReportId && reportId !== uiContext.selectedReportId;
}
function formulaPreviews(trace: ObservabilityTraceEntry[]) {
  const seen = new Set<string>();
  return trace
    .map((entry, index) => ({ index, formula: asString(entry.result?.formula_expression), value: entry.result?.value }))
    .filter((x): x is { index: number; formula: string; value: unknown } => !!x.formula)
    // propose-formula y validate-formula suelen traer la misma fórmula en el
    // mismo turno — un solo preview por texto de fórmula, no uno por tool.
    .filter((x) => (seen.has(x.formula) ? false : (seen.add(x.formula), true)));
}
// Mismo criterio que formulaPreviews pero para el objeto query (cambio de
// contrato 2026-08-10, reemplaza a formula_expression para métricas
// calculadas nuevas) — se muestra vía QuerySummary, nunca como <code> crudo.
function queryPreviews(trace: ObservabilityTraceEntry[]) {
  const seen = new Set<string>();
  return trace
    .map((entry, index) => ({ index, query: entry.result?.query }))
    .filter((x): x is { index: number; query: QuerySpec } => isQuerySpec(x.query))
    // propose-query/validate-query/preview-query suelen traer la misma query
    // en el mismo turno — un solo preview por forma de query, no uno por tool.
    .filter((x) => {
      const key = JSON.stringify(x.query);
      return seen.has(key) ? false : (seen.add(key), true);
    });
}
// Duplicado detectado (cambio de contrato 2026-08-14): el paso de
// upsert-metric-definition trae result.existing_metric_id (+ opcional
// result.proposed_query) en vez de pending_confirmation directo. El texto
// explicativo va por pending_clarifications, no acá — esto solo da los IDs
// para las dos acciones (ver handleUseExisting/handleCreateDuplicateAnyway).
function duplicateSuggestions(trace: ObservabilityTraceEntry[]) {
  return trace
    .map((entry, index) => {
      const existingMetricId = asString(entry.result?.existing_metric_id);
      if (!existingMetricId) return null;
      const proposedQuery = isQuerySpec(entry.result?.proposed_query) ? (entry.result.proposed_query as QuerySpec) : null;
      return { index, existingMetricId, proposedQuery };
    })
    .filter((x): x is { index: number; existingMetricId: string; proposedQuery: QuerySpec | null } => !!x);
}

// Copy por surface — extendido con las 4 superficies nuevas del rediseño
// Investor (2026-08-24), que antes caían en el copy genérico de founder
// ("creá una métrica de churn...", sin sentido parado en Overview/Reporting/
// Data Room/Tasks). investor_company y el resto de founder quedan igual que
// antes, sin tocar comportamiento ya verificado.
function surfaceDescription(surface: PlatformAgentSurface): string {
  switch (surface) {
    case "metrics":
      return "Preguntame sobre el estado financiero de tu empresa.";
    case "investor_portfolio":
    case "investor_overview":
      return "Contame qué necesitás saber sobre las empresas de tu portfolio.";
    case "investor_reporting":
      return "Preguntame sobre el estado de reporting de tus startups.";
    case "investor_data_room":
      return "Preguntame sobre los documentos de tu portfolio.";
    case "investor_tasks":
      return "Preguntame sobre las tareas pendientes de tu portfolio.";
    case "founder_dashboard":
      return "Preguntame cómo viene tu startup, qué cambió y qué deberías priorizar.";
    case "founder_roadmap":
      return "Preguntame sobre tu roadmap de fundraising y qué tenés pendiente.";
    case "founder_data_room":
      return "Preguntame sobre los documentos de tu Data Room.";
    default:
      return "Contame qué necesitás: puedo responder dudas, proponer una métrica o armarte un reporte.";
  }
}

function surfaceExample(surface: PlatformAgentSurface, companyIds?: string[]) {
  switch (surface) {
    case "metrics":
      return (
        <>
          Ej: "¿por qué subió el burn este mes?", "prepará mi próximo board update" o "¿cuál es mi mayor riesgo
          financiero ahora?".
        </>
      );
    case "investor_portfolio":
    case "investor_overview":
      return companyIds && companyIds.length > 0 ? (
        <>Ej: "compará el Revenue de estas empresas" o "¿cuál viene quemando más caja este trimestre?".</>
      ) : (
        <>Ej: "¿cómo viene mi portfolio este trimestre?" o "¿qué empresa necesita más atención ahora?".</>
      );
    case "investor_reporting":
      return <>Ej: "¿quién no reportó este trimestre?" o "¿qué startups tienen datos faltantes?".</>;
    case "investor_data_room":
      return <>Ej: "¿qué documentos financieros subió Acme este mes?" o "¿a quién le falta el cap table?".</>;
    case "investor_tasks":
      return <>Ej: "¿qué tengo vencido?" o "resumime mis tareas de esta semana".</>;
    case "founder_dashboard":
      return <>Ej: "¿por qué bajó el runway este mes?", "¿qué debería priorizar esta semana?" o "compará esto contra el plan post-ronda".</>;
    case "founder_roadmap":
      return <>Ej: "¿qué me falta para estar listo para levantar?" o "¿qué tareas críticas tengo pendientes?".</>;
    case "founder_data_room":
      return <>Ej: "¿qué documentos me faltan subir?" o "¿cuál es el estado de mi cap table?".</>;
    default:
      return (
        <>
          Ej: "¿por qué bajó el churn en marzo?", "creá una métrica de churn mensual sobre clientes activos" o "hacé
          el reporte del mes".
        </>
      );
  }
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  surface: PlatformAgentSurface;
  uiContext: PlatformAgentUiContext;
  formulaSyntax?: FormulaSyntaxEntry[];
  metricFields?: PlatformAgentMetricFields;
  onAgentWrote?: () => void;
  // Solo surface "investor_portfolio": acota la pregunta a estas companies
  // del portfolio (ausente/vacío = todo el portfolio conectado del fondo).
  companyIds?: string[];
};

/**
 * Punto de entrada único al agente operativo (POST /platform-agent) — mismo
 * componente en las 5 superficies que soporta backend, cambia surface/
 * uiContext según desde dónde se abre. Reemplaza los viejos flujos puntuales
 * (MetricsAssistant, "Generar con IA", "Explicar", "Sugerir métricas"): acá
 * el agente no solo contesta, también puede escribir (con confirmación
 * explícita) o crear un reporte directamente. Nota (2026-08-08, confirmado
 * por backend): todavía no existe una tool para agregar una métrica a un
 * reporte YA EXISTENTE — un pedido así en report_editor puede terminar
 * creando un reporte duplicado (ver isUnexpectedNewReport más abajo).
 */
export function PlatformAgentPanel({
  open,
  onOpenChange,
  companyId,
  surface,
  uiContext,
  formulaSyntax,
  metricFields,
  onAgentWrote,
  companyIds,
}: Props) {
  const navigate = useNavigate();
  const { ask, asking } = usePlatformAgent(companyId, surface);
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  const send = async (text: string, opts?: { confirmDuplicate?: boolean }) => {
    const q = text.trim();
    if (!q) return;
    setQuestion("");
    setPendingQuestion(q);
    const response = await ask(q, {
      uiContext,
      formulaSyntax,
      metricFields,
      confirmDuplicate: opts?.confirmDuplicate,
      companyIds,
    });
    setPendingQuestion(null);
    if (response) setExchanges((prev) => [...prev, { question: q, response, resolvedTraceIndices: new Set() }]);
  };

  const handleAsk = () => send(question);

  const resolveTrace = (exchangeIdx: number, traceIdx: number) => {
    setExchanges((prev) =>
      prev.map((ex, i) =>
        i === exchangeIdx ? { ...ex, resolvedTraceIndices: new Set(ex.resolvedTraceIndices).add(traceIdx) } : ex
      )
    );
  };

  const handleUseExisting = (exchangeIdx: number, traceIdx: number, metricId: string) => {
    resolveTrace(exchangeIdx, traceIdx);
    onOpenChange(false);
    navigate(`/metrics/${metricId}`);
  };

  const handleCreateDuplicateAnyway = (exchangeIdx: number, traceIdx: number, question: string) => {
    resolveTrace(exchangeIdx, traceIdx);
    void send(question, { confirmDuplicate: true });
  };

  // Backend persiste el historial solo (cambio de contrato 2026-08-10) — el
  // panel ya no le manda conversation_history, así que "vaciar" acá es
  // puramente visual salvo que además se le pida reset_conversation:true
  // para que el próximo turno arranque de cero del lado del servidor.
  const handleNewConversation = () => {
    setExchanges([]);
    setQuestion("");
    setPendingQuestion(null);
    void ask("", { uiContext, resetConversation: true });
  };

  const handleConfirmWrite = async (exchangeIdx: number, traceIdx: number, proposed: Record<string, unknown>) => {
    resolveTrace(exchangeIdx, traceIdx);
    setPendingQuestion("Confirmando…");
    // Backend confirmó (2026-08-08): el confirm_write NO necesita repetir
    // question/conversation_history — upsert-metric-definition/
    // add-metric-to-report se fuerzan a correr por la sola presencia de
    // confirm_write + los campos de la métrica, no depende de que el LLM
    // reinterprete la pregunta original.
    // add-metric-to-report con una métrica nueva manda proposed_metric SIN
    // metric_id (ver pendingConfirmations) — el frontend genera el slug acá,
    // mismo patrón que useMetricPropertyForm.slugify, sin chequeo de
    // colisión contra el catálogo (best-effort: este panel no tiene la
    // lista completa de métricas en todas las superficies donde se monta).
    const metricId =
      asString(proposed.metric_id) ?? (asString(proposed.name) ? slugify(String(proposed.name)) : undefined);
    const response = await ask("", {
      uiContext,
      formulaSyntax,
      confirmWrite: true,
      reportId: uiContext.selectedReportId ?? undefined,
      metricFields: { ...proposed, ...(metricId ? { metric_id: metricId } : {}) } as PlatformAgentMetricFields,
    });
    setPendingQuestion(null);
    if (response) {
      setExchanges((prev) => [
        ...prev,
        { question: "Confirmado", response, resolvedTraceIndices: new Set() },
      ]);
      onAgentWrote?.();
    }
  };

  const handleDiscard = (exchangeIdx: number, traceIdx: number) => resolveTrace(exchangeIdx, traceIdx);

  const handleOpenChange = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setExchanges([]);
      setQuestion("");
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 text-left">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles size={16} className="text-primary" aria-hidden="true" />
              Asistente
            </SheetTitle>
            {exchanges.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleNewConversation}>
                <RotateCcw size={12} className="mr-1.5" aria-hidden="true" /> Nueva conversación
              </Button>
            )}
          </div>
          <SheetDescription>{surfaceDescription(surface)}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {exchanges.length === 0 && !pendingQuestion && (
            <p className="text-sm text-muted-foreground">{surfaceExample(surface, companyIds)}</p>
          )}

          {exchanges.map((ex, exchangeIdx) => {
            const trace = ex.response.observability_trace ?? [];
            const pending = pendingConfirmations(trace).filter((p) => !ex.resolvedTraceIndices.has(p.index));
            const allCreated = createdLinks(trace);
            const unexpectedReports = allCreated.filter((c) => c.reportId && isUnexpectedNewReport(surface, uiContext, c.reportId));
            const created = allCreated.filter((c) => !unexpectedReports.includes(c));
            const previews = formulaPreviews(trace);
            const queries = queryPreviews(trace);
            const duplicates = duplicateSuggestions(trace).filter((d) => !ex.resolvedTraceIndices.has(d.index));
            return (
              <div key={exchangeIdx} className="space-y-2">
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm">
                    {ex.question}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface border border-border px-4 py-2.5 text-sm text-foreground">
                    {ex.response.answer}
                  </div>

                  {ex.response.pending_clarifications.map((text, i) => (
                    <div
                      key={`cl-${i}`}
                      className="max-w-[85%] rounded-2xl rounded-bl-sm bg-warning/10 border border-warning/40 px-4 py-2.5 text-sm text-foreground"
                    >
                      {text}
                    </div>
                  ))}

                  {duplicates.map(({ index, existingMetricId, proposedQuery }) => (
                    <div
                      key={`d-${index}`}
                      className="w-full max-w-[85%] rounded-md border border-warning/40 bg-warning/5 p-3 space-y-2"
                    >
                      {proposedQuery && (
                        <div className="pb-1.5 mb-1 border-b border-border/60">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                            Consulta que se iba a proponer
                          </p>
                          <QuerySummary query={proposedQuery} className="text-xs" />
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleUseExisting(exchangeIdx, index, existingMetricId)}>
                          Usar la métrica existente
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCreateDuplicateAnyway(exchangeIdx, index, ex.question)}
                        >
                          Crear una nueva de todos modos
                        </Button>
                      </div>
                    </div>
                  ))}

                  {previews.map(({ index, formula, value }) => (
                    <div key={`f-${index}`} className="w-full max-w-[85%] rounded-md bg-surface border border-border p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Fórmula propuesta</p>
                      <code className="block font-mono text-xs text-foreground break-all">{formula}</code>
                      {typeof value === "number" && (
                        <p className="text-xs text-muted-foreground mt-1.5">Con los datos actuales da {value}.</p>
                      )}
                    </div>
                  ))}

                  {queries.map(({ index, query }) => (
                    <div key={`q-${index}`} className="w-full max-w-[85%] rounded-md bg-surface border border-border p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Consulta propuesta</p>
                      <QuerySummary query={query} className="text-xs" />
                    </div>
                  ))}

                  {pending.map(({ index, proposed }) => {
                    const proposedQuery = isQuerySpec(proposed.query) ? proposed.query : null;
                    return (
                    <div
                      key={`p-${index}`}
                      className="w-full max-w-[85%] rounded-md border border-primary/40 bg-primary/5 p-3 space-y-1"
                    >
                      <p className="text-xs font-medium text-primary mb-1">Propuesta, revisá antes de confirmar</p>
                      {proposedQuery && (
                        <div className="pb-1.5 mb-1 border-b border-border/60">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Consulta</p>
                          <QuerySummary query={proposedQuery} className="text-xs" />
                        </div>
                      )}
                      <div className="divide-y divide-border/60">
                        {Object.entries(proposed)
                          .filter(([k, v]) => k !== "query" && asString(v) !== undefined)
                          .map(([key, v]) => (
                            <InfoRow
                              key={key}
                              label={METRIC_FIELD_LABELS[key] ?? key}
                              value={
                                key === "metric_type"
                                  ? (METRIC_TYPE_LABELS[String(v)] ?? String(v))
                                  : key === "formula_expression"
                                    ? <code className="font-mono text-xs">{String(v)}</code>
                                    : String(v)
                              }
                            />
                          ))}
                      </div>
                      <div className="flex items-center gap-2 pt-2">
                        <Button size="sm" onClick={() => handleConfirmWrite(exchangeIdx, index, proposed)}>
                          Confirmar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDiscard(exchangeIdx, index)}>
                          Descartar
                        </Button>
                      </div>
                    </div>
                    );
                  })}

                  {unexpectedReports.map(({ index, reportId }) => (
                    <div
                      key={`w-${index}`}
                      className="w-full max-w-[85%] rounded-md border border-warning/40 bg-warning/10 p-3 space-y-2"
                    >
                      <p className="text-xs text-foreground">
                        Esto creó un reporte nuevo en vez de agregarlo al que tenías abierto: el asistente todavía
                        no puede editar un reporte existente. Puede que sea un duplicado, revisalo antes de
                        compartirlo. Para agregar una métrica a este reporte usá el selector "Agregar métrica a esta
                        sección" más abajo.
                      </p>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/reporting/${reportId}`)}>
                        Ver reporte nuevo
                      </Button>
                    </div>
                  ))}

                  {created.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {created.map(({ index, reportId, metricId }) => (
                        <Button
                          key={`c-${index}`}
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(reportId ? `/reporting/${reportId}` : `/metrics/${metricId}`)}
                        >
                          {reportId ? "Ver reporte" : "Ver métrica"}
                        </Button>
                      ))}
                    </div>
                  )}

                  {ex.response.action_requests.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ex.response.action_requests.map((label, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="cursor-pointer hover:bg-surface font-normal"
                          onClick={() => send(label)}
                        >
                          {label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {pendingQuestion && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm">
                  {pendingQuestion}
                </p>
              </div>
              <div
                role="status"
                className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-surface border border-border px-4 py-3 w-fit"
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
            placeholder="Escribí tu pedido…"
            aria-label="Escribí tu pedido…"
            className="resize-none"
          />
          <Button size="sm" onClick={handleAsk} disabled={!question.trim() || asking} aria-label="Enviar">
            <Send size={14} aria-hidden="true" className={asking ? "animate-pulse" : undefined} />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
