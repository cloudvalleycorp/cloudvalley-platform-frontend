import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { BackLink } from "@/components/BackLink";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ReportSectionView } from "@/components/metrics/ReportSectionView";
import { PeriodSelect } from "@/components/metrics/PeriodSelect";
import { MetricInfoSheet, type MetricHistoryPoint } from "@/components/metrics/MetricInfoSheet";
import { PlatformAgentPanel } from "@/components/ai/PlatformAgentPanel";
import { cn } from "@/lib/utils";
import { handleMembershipError } from "@/lib/membership";
import { LIST_FINANCIAL_METRICS_URL, LIST_FINANCIAL_RECORDS_URL, type FinancialMetricDef } from "@/lib/financialData";
import { LIST_CONNECTIONS_URL, type Connection } from "@/lib/connections";
import { buildEntriesFromRecords, periodKey, prevMonth, toPeriodString, periodRange } from "@/lib/metricPeriod";
import { toMetricDef, type MetricDef } from "@/lib/metrics";
import { evalFormula, FORMULA_SYNTAX } from "@/lib/formulaEngine";
import { useRawFieldValues } from "@/hooks/useRawFieldValues";
import { useMetricReportData } from "@/hooks/useMetricReportData";
import {
  GET_FINANCIAL_REPORT_URL,
  UPDATE_FINANCIAL_REPORT_URL,
  SHARE_FINANCIAL_REPORT_URL,
  UNSHARE_FINANCIAL_REPORT_URL,
  LIST_FINANCIAL_REPORT_SHARES_URL,
  type ReportSection,
  type ReportShare,
} from "@/lib/financialReports";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, X, Plus, Save, GripVertical, Eye, Pencil, Share2, FileText, Sparkles } from "lucide-react";

const now = new Date();

export default function ReportEditor() {
  const { reportId } = useParams<{ reportId: string }>();
  const { user, loading, role, company_id, is_owner } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [loadingReport, setLoadingReport] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [saving, setSaving] = useState(false);
  const [openInfo, setOpenInfo] = useState<MetricDef | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [entries, setEntries] = useState<Record<string, Record<string, number>>>({});
  const metricById = useMemo(() => Object.fromEntries(metrics.map((m) => [m.id, m])), [metrics]);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [shares, setShares] = useState<ReportShare[]>([]);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  // 24 meses de margen sobre el período elegido en la preview, para que
  // SUMLAST/AVGLAST/YTD sigan calculando — cambiar de período refetchea.
  const recordsRange = useMemo(() => periodRange(period, 24), [period]);

  const loadReport = async (opts: { showLoading: boolean }) => {
    if (!reportId || !company_id) return;
    if (opts.showLoading) setLoadingReport(true);
    try {
      const qs = `?company_id=${encodeURIComponent(company_id)}`;
      const [reportRes, metricsRes, recordsRes, connectionsRes, sharesRes] = await Promise.all([
        fetch(`${GET_FINANCIAL_REPORT_URL}?report_id=${encodeURIComponent(reportId)}`, { credentials: "include" }),
        fetch(`${LIST_FINANCIAL_METRICS_URL}${qs}`, { credentials: "include" }),
        fetch(`${LIST_FINANCIAL_RECORDS_URL}${qs}&from=${recordsRange.from}&to=${recordsRange.to}`, { credentials: "include" }),
        fetch(LIST_CONNECTIONS_URL, { credentials: "include" }),
        fetch(`${LIST_FINANCIAL_REPORT_SHARES_URL}${qs}`, { credentials: "include" }),
      ]);
      if (reportRes.status === 404) {
        setNotFound(true);
        return;
      }
      if (reportRes.ok) {
        const data = await reportRes.json();
        setName(data.name ?? "");
        setSections(Array.isArray(data.sections) ? data.sections : []);
      } else {
        setNotFound(true);
      }
      let mappedMetrics: MetricDef[] = [];
      if (metricsRes.ok) {
        const data = await metricsRes.json();
        const defs: FinancialMetricDef[] = Array.isArray(data?.metrics) ? data.metrics : [];
        // list-metrics no filtra las métricas soft-deleted (active: false) —
        // bug de backend reportado 2026-08-09, se filtra acá para que no
        // aparezcan como opción para agregar a una sección.
        mappedMetrics = defs.filter((d) => d.active !== false).map(toMetricDef);
        setMetrics(mappedMetrics);
      }
      if (recordsRes.ok) {
        const data = await recordsRes.json();
        const records: Record<string, unknown>[] = Array.isArray(data?.records) ? data.records : [];
        setEntries(buildEntriesFromRecords(mappedMetrics, records));
      }
      if (connectionsRes.ok) {
        const data = await connectionsRes.json();
        const list: Connection[] = Array.isArray(data?.connections) ? data.connections : [];
        setConnections(list.filter((c) => c.status === "connected"));
      }
      if (sharesRes.ok) {
        const data = await sharesRes.json();
        setShares(Array.isArray(data?.shares) ? data.shares : []);
      }
    } catch {
      setNotFound(true);
    } finally {
      if (opts.showLoading) setLoadingReport(false);
    }
  };

  useEffect(() => {
    loadReport({ showLoading: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, company_id, recordsRange.from, recordsRange.to]);

  // ---- Preview data (mismo cálculo que InvestorCompany.tsx) ----
  const allCalcDefs = useMemo(() => metrics.filter((m) => m.metric_type === "calculated"), [metrics]);
  const { inputsForPeriod, currentInputs, prevInputs, prev, historyInputs, formulaHistory, baseRawFieldPeriods } =
    useMetricReportData({ metrics, entries, period });

  // Ver Metrics.tsx: misma idea, una sola resolución deduplicada de
  // FIELDSUM/etc. para toda la pantalla (mes actual + anterior para la
  // preview, últimos 12 meses para el panel de info).
  const allFormulas = useMemo(() => allCalcDefs.map((d) => d.formula_expression), [allCalcDefs]);
  const { valuesByPeriod: rawFieldValuesByPeriod } = useRawFieldValues(company_id, baseRawFieldPeriods, allFormulas);

  const infoHistory = useMemo<MetricHistoryPoint[]>(() => {
    if (!openInfo) return [];
    const out: MetricHistoryPoint[] = [];
    let m = now.getMonth() + 1;
    let y = now.getFullYear();
    for (let i = 0; i < 12; i++) {
      let v: number | null = null;
      if (openInfo.metric_type === "input" && openInfo.input_key) {
        const raw = entries[openInfo.id]?.[periodKey(m, y)];
        if (raw !== undefined) v = raw;
      } else if (openInfo.metric_type === "calculated" && openInfo.formula_expression) {
        v = evalFormula(
          openInfo.formula_expression,
          inputsForPeriod(m, y),
          [],
          allCalcDefs,
          rawFieldValuesByPeriod[toPeriodString(m, y)] ?? {}
        );
      }
      if (v !== null && v !== undefined) out.unshift({ year: y, month: m, value: v });
      const p = prevMonth(m, y);
      m = p.m;
      y = p.y;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInfo, entries, rawFieldValuesByPeriod]);

  // ---- Edit actions ----
  const addSection = () => setSections((s) => [...s, { title: "Nueva sección", subtitle: null, blocks: [] }]);
  const removeSection = (i: number) => setSections((s) => s.filter((_, idx) => idx !== i));
  const moveSection = (i: number, dir: -1 | 1) => {
    setSections((s) => {
      const next = [...s];
      const j = i + dir;
      if (j < 0 || j >= next.length) return s;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const updateSection = (i: number, patch: Partial<ReportSection>) => {
    setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, ...patch } : sec)));
  };
  const addBlock = (sectionIndex: number, metricId: string) => {
    setSections((s) =>
      s.map((sec, idx) => {
        if (idx !== sectionIndex) return sec;
        if (sec.blocks.some((b) => b.metric_id === metricId)) return sec;
        return { ...sec, blocks: [...sec.blocks, { metric_id: metricId }] };
      })
    );
  };
  const removeBlock = (sectionIndex: number, blockIndex: number) => {
    setSections((s) =>
      s.map((sec, idx) => (idx === sectionIndex ? { ...sec, blocks: sec.blocks.filter((_, bi) => bi !== blockIndex) } : sec))
    );
  };
  const moveBlock = (sectionIndex: number, blockIndex: number, dir: -1 | 1) => {
    setSections((s) =>
      s.map((sec, idx) => {
        if (idx !== sectionIndex) return sec;
        const next = [...sec.blocks];
        const j = blockIndex + dir;
        if (j < 0 || j >= next.length) return sec;
        [next[blockIndex], next[j]] = [next[j], next[blockIndex]];
        return { ...sec, blocks: next };
      })
    );
  };

  const save = async () => {
    if (!reportId) return;
    if (!name.trim()) {
      toast.error("El reporte necesita un nombre");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(UPDATE_FINANCIAL_REPORT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, name: name.trim(), sections }),
      });
      if (await handleMembershipError(res)) return;
      toast.success("Reporte guardado");
    } catch {
      toast.error("No se pudo guardar el reporte");
    } finally {
      setSaving(false);
    }
  };

  const isShared = (connectionId: string) => shares.some((s) => s.connection_id === connectionId && s.report_id === reportId);
  const toggleShare = async (connection: Connection, next: boolean) => {
    if (!reportId) return;
    setSharingId(connection.connection_id);
    try {
      const url = next ? SHARE_FINANCIAL_REPORT_URL : UNSHARE_FINANCIAL_REPORT_URL;
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, connection_id: connection.connection_id }),
      });
      if (await handleMembershipError(res)) return;
      setShares((s) =>
        next
          ? [...s, { report_id: reportId, report_name: name, connection_id: connection.connection_id, counterpart_name: connection.counterpart_name }]
          : s.filter((sh) => !(sh.connection_id === connection.connection_id && sh.report_id === reportId))
      );
      toast.success(next ? `Compartido con ${connection.counterpart_name}` : `Ya no se comparte con ${connection.counterpart_name}`);
    } catch {
      toast.error("No se pudo actualizar el compartido");
    } finally {
      setSharingId(null);
    }
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (role !== "user") return <Navigate to="/dashboard" replace />;
  if (!company_id) return <Navigate to="/reporting" replace />;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-8">
        <BackLink to="/reporting" label="Volver a Reporting" />

        {loadingReport ? (
          <LoadingState />
        ) : notFound ? (
          <div className="text-sm text-muted-foreground" aria-live="polite">No se encontró el reporte.</div>
        ) : (
          <>
            <PageHeader
              title={name || "Reporte"}
              subtitle={mode === "preview" ? "Así lo ve un fondo con este reporte compartido." : "Armá las secciones y compartilo cuando esté listo."}
              action={
                <div className="flex items-center flex-wrap gap-2">
                  {is_owner && (
                    <div className="inline-flex border border-border rounded-md overflow-hidden h-9">
                      <button
                        onClick={() => setMode("edit")}
                        className={cn(
                          "px-3 text-xs flex items-center gap-1.5 transition-all",
                          mode === "edit" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Pencil size={12} strokeWidth={1.5} /> Editar
                      </button>
                      <button
                        onClick={() => setMode("preview")}
                        className={cn(
                          "px-3 text-xs flex items-center gap-1.5 transition-all border-l border-border",
                          mode === "preview" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Eye size={12} strokeWidth={1.5} /> Vista previa
                      </button>
                    </div>
                  )}
                  {mode === "preview" && <PeriodSelect period={period} onChange={setPeriod} />}
                  <Button variant="outline" onClick={() => setAssistantOpen(true)}>
                    <Sparkles size={14} className="mr-1" aria-hidden="true" /> Asistente
                  </Button>
                  {is_owner && mode === "edit" && (
                    <Button onClick={save} disabled={saving}>
                      <Save size={14} className="mr-1" /> {saving ? "Guardando…" : "Guardar"}
                    </Button>
                  )}
                </div>
              }
            />

            {mode === "preview" ? (
              sections.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="Este reporte todavía no tiene secciones."
                  description="Agregá métricas al reporte desde el modo de edición."
                  action={is_owner ? { label: "Volver a editar", onClick: () => setMode("edit") } : undefined}
                />
              ) : (
                <div className="space-y-10 animate-fade-in">
                  {sections.map((section, i) => (
                    <ReportSectionView
                      key={i}
                      section={section}
                      metricById={metricById}
                      currentInputs={currentInputs}
                      prevInputs={prevInputs}
                      historyInputs={historyInputs}
                      formulaHistory={formulaHistory}
                      calcDefs={allCalcDefs}
                      rawFieldValues={rawFieldValuesByPeriod[toPeriodString(period.month, period.year)] ?? {}}
                      prevRawFieldValues={rawFieldValuesByPeriod[toPeriodString(prev.m, prev.y)] ?? {}}
                      companyId={company_id}
                      period={period}
                      onInfo={setOpenInfo}
                    />
                  ))}
                </div>
              )
            ) : (
              <>
                {is_owner && (
                  <div className="max-w-sm">
                    <Label className="text-xs">Nombre del reporte</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
                  </div>
                )}

                <div className="space-y-5">
                  {sections.map((section, si) => (
                    <div key={si} className="border border-border rounded-lg bg-card overflow-hidden">
                      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-border/60">
                        <div className="flex-1 space-y-2 min-w-0">
                          {is_owner ? (
                            <>
                              <Input
                                value={section.title}
                                onChange={(e) => updateSection(si, { title: e.target.value })}
                                className="font-medium border-0 px-0 h-auto text-base shadow-none focus-visible:ring-0"
                                placeholder="Título de la sección"
                              />
                              <Textarea
                                value={section.subtitle ?? ""}
                                onChange={(e) => updateSection(si, { subtitle: e.target.value || null })}
                                placeholder="Subtítulo (opcional)"
                                rows={1}
                                className="text-sm text-muted-foreground border-0 px-0 min-h-0 shadow-none resize-none focus-visible:ring-0"
                              />
                            </>
                          ) : (
                            <>
                              <h3 className="font-medium">{section.title}</h3>
                              {section.subtitle && <p className="text-sm text-muted-foreground">{section.subtitle}</p>}
                            </>
                          )}
                        </div>
                        {is_owner && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={si === 0} onClick={() => moveSection(si, -1)} title="Mover sección arriba" aria-label="Mover sección arriba">
                              <ChevronUp size={14} />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={si === sections.length - 1} onClick={() => moveSection(si, 1)} title="Mover sección abajo" aria-label="Mover sección abajo">
                              <ChevronDown size={14} />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeSection(si)} title="Eliminar sección" aria-label="Eliminar sección">
                              <X size={14} />
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="px-5 py-3 space-y-1">
                        {section.blocks.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">Sin métricas todavía.</p>
                        ) : (
                          section.blocks.map((block, bi) => {
                            const def = metricById[block.metric_id];
                            return (
                              <div key={bi} className="flex items-center gap-2 py-1.5 group">
                                <GripVertical size={14} className="text-muted-foreground/40 shrink-0" />
                                <span className="text-sm flex-1 truncate">
                                  {def?.name ?? block.metric_id}
                                  {def?.unit && <span className="text-xs text-muted-foreground"> ({def.unit})</span>}
                                </span>
                                {is_owner && (
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={bi === 0} onClick={() => moveBlock(si, bi, -1)} title="Mover arriba" aria-label="Mover métrica arriba">
                                      <ChevronUp size={12} />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={bi === section.blocks.length - 1} onClick={() => moveBlock(si, bi, 1)} title="Mover abajo" aria-label="Mover métrica abajo">
                                      <ChevronDown size={12} />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeBlock(si, bi)} title="Quitar" aria-label="Quitar métrica">
                                      <X size={12} />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {is_owner && (
                        <div className="px-5 pb-5">
                          <Select value="" onValueChange={(metricId) => addBlock(si, metricId)}>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="+ Agregar métrica a esta sección" />
                            </SelectTrigger>
                            <SelectContent>
                              {metrics
                                .filter((m) => !section.blocks.some((b) => b.metric_id === m.id))
                                .map((m) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  ))}

                  {is_owner && (
                    <button
                      onClick={addSection}
                      className="w-full border-2 border-dashed border-border rounded-lg py-4 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Plus size={14} /> Agregar sección
                    </button>
                  )}

                  {sections.length === 0 && !is_owner && (
                    <EmptyState icon={FileText} title="Este reporte todavía no tiene secciones." />
                  )}
                </div>

                {is_owner && (
                  <section className="border border-border rounded-lg bg-card p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Share2 size={14} strokeWidth={1.5} className="text-muted-foreground" />
                      <h2 className="text-sm font-medium text-foreground">Compartir con</h2>
                    </div>
                    {connections.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Todavía no tenés conexiones activas con ningún fondo.</p>
                    ) : (
                      <div className="divide-y divide-border">
                        {connections.map((c) => (
                          <div key={c.connection_id} className="flex items-center justify-between py-3">
                            <span className="text-sm">{c.counterpart_name}</span>
                            <Switch
                              checked={isShared(c.connection_id)}
                              disabled={sharingId === c.connection_id}
                              onCheckedChange={(checked) => toggleShare(c, checked)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>

      <MetricInfoSheet metric={openInfo} onClose={() => setOpenInfo(null)} history={infoHistory} />

      <PlatformAgentPanel
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        companyId={company_id}
        surface="report_editor"
        uiContext={{
          selectedMetricId: openInfo?.id ?? null,
          selectedCategoryId: null,
          selectedReportId: reportId ?? null,
          currentPeriodId: toPeriodString(period.month, period.year),
        }}
        formulaSyntax={FORMULA_SYNTAX}
        onAgentWrote={() => loadReport({ showLoading: false })}
      />
    </AppLayout>
  );
}
