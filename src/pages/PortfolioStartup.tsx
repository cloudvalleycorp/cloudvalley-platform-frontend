import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Bell, ChevronLeft, ChevronRight, Download, Info, LineChart as LineChartIcon, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { StageBadge } from "@/components/StageBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { evalFormula, formatMetricValue, type InputsMap, type MetricDef } from "@/lib/metrics";
import { MetricInfoSheet, type MetricHistoryPoint } from "@/components/metrics/MetricInfoSheet";
import { MetricChartDialog } from "@/components/metrics/MetricChartDialog";
import { toast } from "sonner";

const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const categories = [
  { id: "revenue", label: "Revenue" },
  { id: "acquisition", label: "Acquisition" },
  { id: "retention", label: "Retention" },
  { id: "cash_efficiency", label: "Cash & Efficiency" },
];

type Tab = "metrics" | "roadmap" | "dataroom";
const pk = (m: number, y: number) => `${y}-${m}`;
const prevMonth = (m: number, y: number) => (m === 1 ? { m: 12, y: y - 1 } : { m: m - 1, y });

type Startup = {
  id: string;
  name: string;
  stage: string | null;
  business_model: string | null;
  industry: string | null;
  readiness_score: number;
};

type Doc = {
  id: string;
  name: string;
  category: string;
  status: string;
  file_url: string | null;
};

export default function PortfolioStartup() {
  const { startupId, orgId } = useParams<{ startupId: string; orgId: string }>();
  const { user, loading: authLoading, isOrgViewer, signOut } = useAuth();

  const [startup, setStartup] = useState<Startup | null>(null);
  const [link, setLink] = useState<{ batch: string | null; year: number | null } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [tab, setTab] = useState<Tab>("metrics");
  const [activeCat, setActiveCat] = useState("revenue");

  const [allMetrics, setAllMetrics] = useState<MetricDef[]>([]);
  const [activeMetricIds, setActiveMetricIds] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<Record<string, Record<string, number>>>({});

  const [year, setYear] = useState(new Date().getFullYear());

  const [openInfo, setOpenInfo] = useState<MetricDef | null>(null);
  const [chartMetric, setChartMetric] = useState<MetricDef | null>(null);
  const [tableMode, setTableMode] = useState<"absolute" | "change">("absolute");

  // roadmap
  const [pillars, setPillars] = useState<{ id: string; name: string; total: number; done: number }[]>([]);

  // docs
  const [docs, setDocs] = useState<Doc[]>([]);
  const [requestedDocIds, setRequestedDocIds] = useState<Set<string>>(new Set());
  const [requestingDoc, setRequestingDoc] = useState<string | null>(null);
  const [requestMsg, setRequestMsg] = useState("");

  useEffect(() => {
    if (!startupId || !orgId || !user || !isOrgViewer) return;
    (async () => {
      const [{ data: s }, { data: l }, { data: defs }, { data: cfgs }, { data: ents }] = await Promise.all([
        // TODO: migrar a backend propio
        supabase.from("startups").select("id, name, stage, business_model, industry, readiness_score").eq("id", startupId).maybeSingle(),
        // TODO: migrar a backend propio
        supabase.from("startup_organizations").select("batch, year").eq("startup_id", startupId).eq("organization_id", orgId).maybeSingle(),
        // TODO: migrar a backend propio
        supabase.from("metric_definitions").select("*").order("order_index"),
        // TODO: migrar a backend propio
        supabase.from("metric_configs").select("metric_id").eq("startup_id", startupId).eq("is_active", true),
        // TODO: migrar a backend propio
        supabase.from("metric_entries").select("metric_id, value, period_year, period_month").eq("startup_id", startupId),
      ]);
      setStartup(s as Startup | null);
      setLink(l as any);
      setAllMetrics((defs ?? []) as MetricDef[]);
      setActiveMetricIds(new Set((cfgs ?? []).map((c: any) => c.metric_id)));
      const map: Record<string, Record<string, number>> = {};
      let latest = { y: new Date().getFullYear(), m: 1, key: -1 };
      for (const e of ents ?? []) {
        if (e.value === null || e.value === undefined) continue;
        map[e.metric_id] ??= {};
        map[e.metric_id][pk(e.period_month, e.period_year)] = Number(e.value);
        const score = e.period_year * 100 + e.period_month;
        if (score > latest.key) latest = { y: e.period_year, m: e.period_month, key: score };
      }
      setEntries(map);
      if (latest.key !== -1) setYear(latest.y);

      // roadmap
      const [{ data: pillarsData }, { data: tasksData }, { data: stData }] = await Promise.all([
        // TODO: migrar a backend propio
        supabase.from("roadmap_pillars").select("id, name").order("order_index"),
        // TODO: migrar a backend propio
        supabase.from("roadmap_tasks").select("id, pillar_id"),
        // TODO: migrar a backend propio
        supabase.from("startup_tasks").select("task_id, status").eq("startup_id", startupId),
      ]);
      const taskPillar: Record<string, string> = {};
      for (const t of tasksData ?? []) taskPillar[t.id] = t.pillar_id;
      const totals: Record<string, { total: number; done: number }> = {};
      for (const p of pillarsData ?? []) totals[p.id] = { total: 0, done: 0 };
      for (const st of stData ?? []) {
        const pid = taskPillar[st.task_id];
        if (!pid || !totals[pid]) continue;
        totals[pid].total += 1;
        if (st.status === "done") totals[pid].done += 1;
      }
      setPillars((pillarsData ?? []).map((p: any) => ({
        id: p.id, name: p.name, total: totals[p.id]?.total ?? 0, done: totals[p.id]?.done ?? 0,
      })));

      // docs
      const { data: docsData } = await supabase
        .from("documents")
        .select("id, name, category, status, file_url")
        .eq("startup_id", startupId);
      setDocs((docsData ?? []) as Doc[]);
      const { data: reqs } = await supabase
        .from("document_requests")
        .select("document_id, status")
        .eq("startup_id", startupId)
        .eq("organization_id", orgId)
        .eq("status", "pending");
      setRequestedDocIds(new Set((reqs ?? []).map((r: any) => r.document_id)));

      setLoaded(true);
    })();
  }, [startupId, orgId, user, isOrgViewer]);

  const visibleMetrics = useMemo(
    () => allMetrics.filter((m) => activeMetricIds.has(m.id)),
    [allMetrics, activeMetricIds]
  );
  const inputDefsAll = useMemo(() => visibleMetrics.filter((m) => m.metric_type === "input"), [visibleMetrics]);
  const inputDefsCat = useMemo(() => inputDefsAll.filter((m) => m.category === activeCat), [inputDefsAll, activeCat]);
  const calcDefsCat = useMemo(
    () => visibleMetrics.filter((m) => m.metric_type === "calculated" && m.category === activeCat),
    [visibleMetrics, activeCat]
  );

  const inputsForPeriod = (m: number, y: number): InputsMap => {
    const result: InputsMap = {};
    const key = pk(m, y);
    for (const def of inputDefsAll) {
      if (!def.input_key) continue;
      const v = entries[def.id]?.[key];
      if (v !== undefined) result[def.input_key] = v;
    }
    return result;
  };

  const cellValue = (def: MetricDef, m: number, y: number): number | null => {
    if (def.metric_type === "input") {
      const v = entries[def.id]?.[pk(m, y)];
      return v === undefined ? null : v;
    }
    if (def.formula_expression) return evalFormula(def.formula_expression, inputsForPeriod(m, y));
    return null;
  };

  // Build long history for a given metric (used by chart dialog and info sheet)
  const buildHistory = (def: MetricDef | null): MetricHistoryPoint[] => {
    if (!def) return [];
    const out: MetricHistoryPoint[] = [];
    const now = new Date();
    let m = now.getMonth() + 1, y = now.getFullYear();
    for (let i = 0; i < 24; i++) {
      const v = cellValue(def, m, y);
      if (v !== null && v !== undefined) out.unshift({ year: y, month: m, value: v });
      const p = prevMonth(m, y);
      m = p.m; y = p.y;
    }
    return out;
  };
  const infoHistory = useMemo<MetricHistoryPoint[]>(() => buildHistory(openInfo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openInfo, entries, inputDefsAll]);
  const chartHistory = useMemo<MetricHistoryPoint[]>(() => buildHistory(chartMetric),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartMetric, entries, inputDefsAll]);

  const openFile = async (doc: Doc) => {
    if (!doc.file_url) return;
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.file_url, 120);
    if (error || !data?.signedUrl) {
      toast.error("No se pudo abrir el archivo");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const requestUpdate = async (doc: Doc) => {
    if (!startupId || !orgId || !user) return;
    // TODO: migrar a backend propio
    const { error } = await supabase.from("document_requests").insert({
      startup_id: startupId,
      document_id: doc.id,
      organization_id: orgId,
      requested_by: user.id,
      message: requestMsg || null,
    });
    if (error) {
      toast.error("No se pudo enviar el pedido");
      return;
    }
    setRequestedDocIds((s) => new Set([...s, doc.id]));
    setRequestingDoc(null);
    setRequestMsg("");
    toast.success("Pedido enviado al founder");
  };

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isOrgViewer) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
          <Link to="/portfolio" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all">
            <ArrowLeft size={14} strokeWidth={1.5} /> Volver al portfolio
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <button onClick={signOut} className="text-muted-foreground hover:text-foreground transition-all p-1" title="Cerrar sesión">
              <LogOut size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-10 space-y-8">
        {!loaded || !startup ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-medium tracking-tight">{startup.name}</h1>
                <StageBadge stage={startup.stage} />
              </div>
              <p className="text-sm text-muted-foreground mt-2 capitalize">
                {startup.business_model?.replace("_", " ") ?? "—"} · {startup.industry ?? "—"}
                {link?.batch ? ` · ${link.batch}` : ""}{link?.year ? ` · ${link.year}` : ""}
              </p>
            </div>

            <div className="flex gap-1 border-b border-border">
              {[
                { id: "metrics" as const, label: "Métricas" },
                { id: "roadmap" as const, label: "Roadmap" },
                { id: "dataroom" as const, label: "Data Room" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "px-4 py-2 text-sm transition-all border-b-2 -mb-px",
                    tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "metrics" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1 border-b border-border">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setActiveCat(c.id)}
                        className={cn(
                          "px-3 py-2 text-xs transition-all border-b-2 -mb-px",
                          activeCat === c.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex border border-border rounded-md overflow-hidden h-7">
                      <button
                        onClick={() => setTableMode("absolute")}
                        className={cn(
                          "px-2.5 text-[11px] transition-all",
                          tableMode === "absolute" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Valores
                      </button>
                      <button
                        onClick={() => setTableMode("change")}
                        className={cn(
                          "px-2.5 text-[11px] transition-all border-l border-border",
                          tableMode === "change" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        % cambio
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                    <button onClick={() => setYear(year - 1)} className="p-1.5 rounded-md hover:bg-surface text-muted-foreground hover:text-foreground" aria-label="Año anterior">
                      <ChevronLeft size={14} strokeWidth={1.5} />
                    </button>
                    <span className="text-sm font-medium tabular-nums w-12 text-center">{year}</span>
                    <button onClick={() => setYear(year + 1)} className="p-1.5 rounded-md hover:bg-surface text-muted-foreground hover:text-foreground" aria-label="Año siguiente">
                      <ChevronRight size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                  </div>
                </div>

                {inputDefsCat.length === 0 && calcDefsCat.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">
                    No hay métricas públicas en esta categoría.
                  </p>
                ) : (
                  <div className="border border-border rounded-lg bg-card overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b border-border">
                          <th className="text-left font-normal px-4 py-3 sticky left-0 bg-card z-10 min-w-[220px]">Métrica</th>
                          {months.map((m, i) => (
                            <th key={i} className="text-right font-normal px-3 py-3 tabular-nums">{m}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {inputDefsCat.length > 0 && (
                          <>
                            <tr><td colSpan={13} className="px-4 py-2 text-[11px] uppercase tracking-wide text-tertiary bg-surface/40">Inputs</td></tr>
                            {inputDefsCat.map((def) => (
                              <MetricRow key={def.id} def={def} year={year} cellValue={cellValue} onInfo={setOpenInfo} onChart={setChartMetric} mode={tableMode} />
                            ))}
                          </>
                        )}
                        {calcDefsCat.length > 0 && (
                          <>
                            <tr><td colSpan={13} className="px-4 py-2 text-[11px] uppercase tracking-wide text-tertiary bg-surface/40 border-t border-border">Calculadas</td></tr>
                            {calcDefsCat.map((def) => (
                              <MetricRow key={def.id} def={def} year={year} cellValue={cellValue} onInfo={setOpenInfo} onChart={setChartMetric} mode={tableMode} />
                            ))}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tab === "roadmap" && (
              <div className="space-y-4 max-w-2xl">
                <div className="border border-border rounded-lg p-5">
                  <div className="text-xs text-muted-foreground">Readiness Score</div>
                  <div className="text-3xl font-medium tracking-tight mt-1 tabular-nums">
                    {startup.readiness_score}
                    <span className="text-sm text-muted-foreground">/100</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {pillars.map((p) => {
                    const pct = p.total === 0 ? 0 : (p.done / p.total) * 100;
                    return (
                      <div key={p.id}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span>{p.name}</span>
                          <span className="text-muted-foreground tabular-nums text-xs">{p.done}/{p.total}</span>
                        </div>
                        <div className="h-1 bg-surface rounded-full overflow-hidden">
                          <div className="h-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "dataroom" && (
              <div className="space-y-3 max-w-3xl">
                <p className="text-xs text-muted-foreground">
                  Solo lectura. Podés abrir los archivos cargados o pedirle al founder que actualice un documento.
                </p>
                {docs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay documentos visibles.</p>
                ) : (
                  <div className="space-y-2">
                    {docs.map((d) => {
                      const requested = requestedDocIds.has(d.id);
                      const isOpen = requestingDoc === d.id;
                      const hasFile = !!d.file_url;
                      return (
                        <div key={d.id} className="border border-border rounded-md">
                          <div className="flex items-center gap-3 p-3">
                            <div
                              className={cn(
                                "h-2 w-2 rounded-full shrink-0",
                                d.status === "verified" ? "bg-foreground" :
                                d.status === "uploaded" ? "bg-muted-foreground" : "bg-tertiary"
                              )}
                            />
                            <span className="flex-1 text-sm">{d.name}</span>
                            <span className="text-xs text-tertiary capitalize">{d.status}</span>
                            {hasFile && (
                              <button
                                onClick={() => openFile(d)}
                                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-all"
                              >
                                <Download size={11} strokeWidth={1.5} /> Abrir
                              </button>
                            )}
                            {requested ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Bell size={11} strokeWidth={1.5} /> Pedido enviado
                              </span>
                            ) : (
                              <button
                                onClick={() => { setRequestingDoc(d.id); setRequestMsg(""); }}
                                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-all"
                              >
                                <Bell size={11} strokeWidth={1.5} /> Solicitar actualización
                              </button>
                            )}
                          </div>
                          {isOpen && (
                            <div className="border-t border-border p-3 space-y-2">
                              <Textarea
                                value={requestMsg}
                                onChange={(e) => setRequestMsg(e.target.value)}
                                placeholder="Mensaje opcional para el founder…"
                                rows={2}
                                className="text-sm"
                              />
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="ghost" onClick={() => setRequestingDoc(null)}>Cancelar</Button>
                                <Button size="sm" onClick={() => requestUpdate(d)}>Enviar pedido</Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <MetricInfoSheet metric={openInfo} onClose={() => setOpenInfo(null)} history={infoHistory} />
      <MetricChartDialog metric={chartMetric} onClose={() => setChartMetric(null)} history={chartHistory} />
    </div>
  );
}

function MetricRow({
  def, year, cellValue, onInfo, onChart, mode,
}: {
  def: MetricDef;
  year: number;
  cellValue: (def: MetricDef, m: number, y: number) => number | null;
  onInfo: (m: MetricDef) => void;
  onChart: (m: MetricDef) => void;
  mode: "absolute" | "change";
}) {
  return (
    <tr className="border-t border-border/40">
      <td className="px-4 py-2 sticky left-0 bg-card">
        <div className="flex items-center gap-2">
          <button onClick={() => onChart(def)} className="text-tertiary hover:text-foreground transition-all" title="Ver gráfico">
            <LineChartIcon size={14} strokeWidth={1.5} />
          </button>
          <button onClick={() => onInfo(def)} className="flex items-center gap-2 text-left hover:text-foreground">
            <span className="text-sm">{def.name}</span>
            {def.unit && <span className="text-xs text-muted-foreground">({def.unit})</span>}
            <Info size={12} strokeWidth={1.5} className="text-tertiary" />
          </button>
        </div>
      </td>
      {months.map((_, i) => {
        const m = i + 1;
        const v = cellValue(def, m, year);
        let display: string;
        if (v === null) display = "—";
        else if (mode === "absolute") display = formatMetricValue(v, def.unit);
        else {
          const prev = m === 1 ? cellValue(def, 12, year - 1) : cellValue(def, m - 1, year);
          if (prev === null || prev === 0) display = "—";
          else {
            const pct = ((v - prev) / Math.abs(prev)) * 100;
            display = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
          }
        }
        return (
          <td key={m} className={cn("px-2 py-2 text-right tabular-nums w-20", display === "—" && "text-tertiary")}>
            {display}
          </td>
        );
      })}
    </tr>
  );
}