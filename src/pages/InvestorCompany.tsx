import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Map } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { BackLink } from "@/components/BackLink";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { StageBadge } from "@/components/StageBadge";
import { useConnectedCompanyMetrics } from "@/hooks/useConnectedCompanyMetrics";
import { useSharedFinancialReports } from "@/hooks/useSharedFinancialReports";
import { useReportingStatusMutations } from "@/hooks/useReportingStatus";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { FileText } from "lucide-react";
import { ReportSectionView } from "@/components/metrics/ReportSectionView";
import { PeriodSelect } from "@/components/metrics/PeriodSelect";
import { MetricInfoSheet, type MetricHistoryPoint } from "@/components/metrics/MetricInfoSheet";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Accordion } from "@/components/ui/accordion";
import { CategoryAccordion } from "@/components/dataRoom/CategoryAccordion";
import { DocumentRow } from "@/components/dataRoom/DocumentRow";
import { type MetricDef } from "@/lib/metrics";
import { evalFormula } from "@/lib/formulaEngine";
import { percentChange, formatMetricValue } from "@/lib/metrics";
import { periodKey, prevMonth, toPeriodString, periodRange } from "@/lib/metricPeriod";
import { useRawFieldValues } from "@/hooks/useRawFieldValues";
import { useMetricReportData } from "@/hooks/useMetricReportData";
import { useEvaluatedMetrics } from "@/hooks/useEvaluatedMetrics";
import { useSharedDocuments } from "@/hooks/useSharedDocuments";
import { useSharedRoadmap } from "@/hooks/useSharedRoadmap";
import { DATA_ROOM_CATEGORIES } from "@/lib/dataRoom";
import { LIST_ROADMAP_PILLARS_URL, type RoadmapPillar, type RoadmapTask } from "@/lib/roadmap";
import { RoadmapTaskList } from "@/components/roadmap/RoadmapTaskList";
import { RoadmapTaskDetailSheet } from "@/components/roadmap/RoadmapTaskDetailSheet";
import { AddRoadmapTaskDialog } from "@/components/roadmap/AddRoadmapTaskDialog";
import { API_BASE_URL } from "@/lib/apiConfig";
import { useActivity } from "@/hooks/useActivity";
import { cn } from "@/lib/utils";

const GET_COMPANY_PROFILE_URL = `${API_BASE_URL}/get-company-profile`;

const now = new Date();
// Mismo horizonte que infoHistory de abajo (12 meses incluyendo el actual)
// — punto de partida para el rango que le pide evaluate-metrics al abrir
// el detalle de una métrica.
const elevenMonthsAgo = (() => {
  let m = now.getMonth() + 1;
  let y = now.getFullYear();
  for (let i = 0; i < 11; i++) {
    const p = prevMonth(m, y);
    m = p.m;
    y = p.y;
  }
  return { m, y };
})();

type CompanyProfile = {
  company_id: string;
  name: string;
  industry: string | null;
  website: string | null;
  stage: "pre_seed" | "seed" | "series_a" | null;
  business_model: string | null;
  target_raise_usd: number | null;
  cohort_number: number | null;
  cohort_year: number | null;
};

type TabKey = "overview" | "performance" | "kpis" | "updates" | "data-room" | "tasks" | "activity";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "performance", label: "Performance" },
  { key: "kpis", label: "KPIs" },
  { key: "updates", label: "Updates" },
  { key: "data-room", label: "Data Room" },
  { key: "tasks", label: "Tasks" },
  { key: "activity", label: "Activity" },
];

export default function InvestorCompany() {
  const { company_id } = useParams<{ company_id: string }>();
  const { user, loading, isOrgViewer, fund_name, portfolio_company_ids, portfolio_company_names } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabKey = (TABS.find((t) => t.key === searchParams.get("tab"))?.key ?? "overview");
  const setTab = (t: TabKey) => {
    const next = new URLSearchParams(searchParams);
    if (t === "overview") next.delete("tab");
    else next.set("tab", t);
    // Deep-links puntuales (?report=/?doc=) son de un solo uso — al cambiar
    // de tab a mano no tiene sentido arrastrarlos.
    next.delete("report");
    next.delete("doc");
    setSearchParams(next, { replace: true });
  };
  const deepLinkReportId = searchParams.get("report");
  const deepLinkDocId = searchParams.get("doc");

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "forbidden" | "not_found" | "error">("loading");

  useEffect(() => {
    if (!company_id) return;
    setStatus("loading");
    (async () => {
      try {
        const res = await fetch(`${GET_COMPANY_PROFILE_URL}?company_id=${encodeURIComponent(company_id)}`, {
          credentials: "include",
        });
        if (res.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (res.status === 403) {
          setStatus("forbidden");
          return;
        }
        if (res.status === 404) {
          setStatus("not_found");
          return;
        }
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const data = (await res.json()) as CompanyProfile;
        setProfile(data);
        setStatus("ok");
      } catch {
        setStatus("error");
      }
    })();
  }, [company_id]);

  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [openInfo, setOpenInfo] = useState<MetricDef | null>(null);
  const [openRoadmapTask, setOpenRoadmapTask] = useState<RoadmapTask | null>(null);
  const [editingTask, setEditingTask] = useState<RoadmapTask | null>(null);
  const [addingRequirement, setAddingRequirement] = useState(false);
  // 24 meses de margen sobre el período elegido para que SUMLAST/AVGLAST/YTD
  // sigan calculando — se recalcula (y refetchea) al cambiar de período.
  const metricsRange = useMemo(() => periodRange(period, 24), [period]);
  const metrics = useConnectedCompanyMetrics(company_id ?? null, metricsRange);
  const shared = useSharedFinancialReports(company_id ?? null);
  const sharedDocs = useSharedDocuments(company_id ?? null);
  const roadmap = useSharedRoadmap(company_id ?? null);
  const { markViewed } = useReportingStatusMutations();
  const { events: activityEvents, loading: activityLoading } = useActivity({ company_id: company_id ?? undefined, page_size: 15 });
  // Mismo pedido que ya usa InvestorPortfolio.tsx para armar "Agregar
  // requisito" — cualquier rol autenticado puede listar pilares.
  const { data: roadmapPillars = [] } = useQuery({
    queryKey: ["roadmap-pillars"],
    queryFn: async () => {
      const res = await fetch(LIST_ROADMAP_PILLARS_URL, { credentials: "include" });
      if (!res.ok) return [] as RoadmapPillar[];
      const data = await res.json();
      return Array.isArray(data?.pillars) ? (data.pillars as RoadmapPillar[]) : [];
    },
  });

  // "No access" (403) is distinto de "la conexión está activa pero todavía
  // no se compartió nada" — solo se avisa una vez, en la transición.
  const noAccess = metrics.forbidden || shared.forbidden || sharedDocs.forbidden || roadmap.forbidden;
  const wasForbidden = useRef(false);
  useEffect(() => {
    if (noAccess && !wasForbidden.current) {
      toast.error("No tenés acceso a la información financiera de esta empresa.");
    }
    wasForbidden.current = noAccess;
  }, [noAccess]);

  // Deep-link desde Tasks/Reporting/Overview (?report=<id>) — selecciona el
  // reporte puntual apenas la lista carga, en vez de quedarse en el primero.
  useEffect(() => {
    if (deepLinkReportId && shared.reports.some((r) => r.report_id === deepLinkReportId)) {
      shared.setSelectedId(deepLinkReportId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkReportId, shared.reports]);

  // "Vi el reporte" — automático al abrir el visor (tab Updates con un
  // reporte seleccionado), distinto de "lo revisé" (acción deliberada del
  // investor, ver ReportingStatusPill/InvestorReporting.tsx).
  useEffect(() => {
    if (tab === "updates" && shared.selectedId) markViewed(shared.selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, shared.selectedId]);

  const metricById = useMemo(() => Object.fromEntries(metrics.metrics.map((m) => [m.id, m])), [metrics.metrics]);
  const allCalcDefs = useMemo(() => metrics.metrics.filter((m) => m.metric_type === "calculated"), [metrics.metrics]);
  const performanceMetrics = useMemo(() => metrics.metrics.filter((m) => m.metric_class === "standard"), [metrics.metrics]);
  const kpiMetrics = useMemo(() => metrics.metrics.filter((m) => m.metric_class !== "standard"), [metrics.metrics]);

  // Solo categorías con al menos un documento visible — a diferencia del
  // lado founder (que siempre muestra las 7), acá una categoría vacía no
  // aporta nada y solo genera ruido.
  const visibleDataRoomCategories = useMemo(
    () => DATA_ROOM_CATEGORIES.filter((cat) => sharedDocs.documents.some((d) => d.category === cat.id)),
    [sharedDocs.documents]
  );

  const { inputsForPeriod, currentInputs, prevInputs, prev, historyInputs, formulaHistory, baseRawFieldPeriods } =
    useMetricReportData({ metrics: metrics.metrics, entries: metrics.entries, period });

  // Ver Metrics.tsx: misma idea, una sola resolución deduplicada de
  // FIELDSUM/etc. para toda la pantalla.
  const allFormulas = useMemo(() => allCalcDefs.map((d) => d.formula_expression), [allCalcDefs]);
  const { valuesByPeriod: rawFieldValuesByPeriod } = useRawFieldValues(company_id ?? null, baseRawFieldPeriods, allFormulas);

  // Métricas calculadas nuevas (query-based) NO se resuelven con
  // evalFormula/formula_expression — ese camino solo sirve para métricas
  // viejas sin migrar. Backend confirmó (rediseño Investor 2026-08-23) que
  // evaluate-metrics ya soporta investor conectado; el único ajuste
  // pendiente era este hook, que hasta ahora nunca lo llamaba — sin esto,
  // una métrica calculada query-based se mostraba vacía/incorrecta acá,
  // aunque funcionara bien del lado founder (useEvaluatedMetrics). Se pide
  // solo current+prev período (lo que muestran las cards) — el detalle de
  // 12 meses (MetricInfoSheet) pide su propio rango, más abajo, solo cuando
  // está abierto, para no sobrecargar evaluate-metrics con datos que nadie
  // está mirando.
  const prevOfCurrent = prevMonth(period.month, period.year);
  const queryMetricIds = useMemo(
    () => metrics.metrics.filter((m) => m.metric_type === "calculated" && m.query).map((m) => m.id),
    [metrics.metrics]
  );
  const evaluated = useEvaluatedMetrics(
    company_id ?? null,
    queryMetricIds,
    queryMetricIds.length > 0
      ? { period_from: toPeriodString(prevOfCurrent.m, prevOfCurrent.y), period_to: toPeriodString(period.month, period.year) }
      : null
  );
  const evaluatedHistory = useEvaluatedMetrics(
    company_id ?? null,
    openInfo?.metric_type === "calculated" && openInfo.query ? [openInfo.id] : [],
    openInfo?.metric_type === "calculated" && openInfo.query
      ? { period_from: toPeriodString(elevenMonthsAgo.m, elevenMonthsAgo.y), period_to: toPeriodString(now.getMonth() + 1, now.getFullYear()) }
      : null
  );

  // Resuelve el valor de una métrica en un mes/año dado, misma lógica que
  // infoHistory más abajo — factoreado para reusar en las cards de
  // Performance/KPIs sin duplicar el switch input/calculated.
  const resolveValue = (m: MetricDef, month: number, year: number): number | null => {
    const p = toPeriodString(month, year);
    if (m.metric_type === "calculated" && m.query) {
      const fromCards = evaluated.values[m.id]?.[p];
      const fromHistory = evaluatedHistory.values[m.id]?.[p];
      return fromCards ?? fromHistory ?? null;
    }
    if (m.metric_type === "input" && m.input_key) {
      const raw = metrics.entries[m.id]?.[periodKey(month, year)];
      return raw !== undefined ? raw : null;
    }
    if (m.metric_type === "calculated" && m.formula_expression) {
      const v = evalFormula(
        m.formula_expression,
        inputsForPeriod(month, year),
        [],
        allCalcDefs,
        rawFieldValuesByPeriod[toPeriodString(month, year)] ?? {}
      );
      return v ?? null;
    }
    return null;
  };

  const infoHistory = useMemo<MetricHistoryPoint[]>(() => {
    if (!openInfo) return [];
    const out: MetricHistoryPoint[] = [];
    let m = now.getMonth() + 1;
    let y = now.getFullYear();
    for (let i = 0; i < 12; i++) {
      const v = resolveValue(openInfo, m, y);
      if (v !== null && v !== undefined) out.unshift({ year: y, month: m, value: v });
      const p = prevMonth(m, y);
      m = p.m;
      y = p.y;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInfo, metrics.entries, rawFieldValuesByPeriod]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isOrgViewer) return <Navigate to="/dashboard" replace />;

  const idx = portfolio_company_ids.findIndex((id) => id === company_id);
  const name = idx >= 0 ? portfolio_company_names[idx] : null;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <BackLink to="/portfolio" label="Volver al portfolio" className="mb-6" />
        {name === null ? (
          <div className="text-sm text-muted-foreground">
            Esta empresa no forma parte del portfolio de {fund_name ?? "tu fondo"}.
          </div>
        ) : status === "loading" ? (
          <LoadingState variant="inline" />
        ) : status === "forbidden" ? (
          <div className="text-sm text-muted-foreground">No tenés acceso a este perfil.</div>
        ) : status === "not_found" ? (
          <div className="text-sm text-muted-foreground">Empresa no encontrada.</div>
        ) : status === "error" ? (
          <div className="text-sm text-muted-foreground">No se pudo cargar el perfil de la empresa.</div>
        ) : (
          profile && (
            <>
              <PageHeader
                title={profile.name}
                subtitle={
                  <span className="inline-flex items-center gap-3 mt-1">
                    <StageBadge stage={profile.stage} />
                    {profile.business_model && (
                      <span className="capitalize">{profile.business_model.replace("_", " ")}</span>
                    )}
                    {profile.industry && <span>{profile.industry}</span>}
                  </span>
                }
              />

              <div className="flex items-center gap-1 border-b border-border mt-6 mb-8 overflow-x-auto">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors",
                      tab === t.key
                        ? "border-foreground text-foreground font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "overview" && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Website</dt>
                    <dd className="text-foreground truncate">{profile.website || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Objetivo de ronda</dt>
                    <dd className="text-foreground">
                      {profile.target_raise_usd != null ? `USD ${profile.target_raise_usd.toLocaleString()}` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Cohort</dt>
                    <dd className="text-foreground">
                      {profile.cohort_number != null
                        ? `#${profile.cohort_number}${profile.cohort_year ? ` · ${profile.cohort_year}` : ""}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Roadmap</dt>
                    <dd className="text-foreground">
                      {roadmap.tasks.length > 0 ? `Readiness ${roadmap.readinessScore}/100` : "—"}
                    </dd>
                  </div>
                </dl>
              )}

              {(tab === "performance" || tab === "kpis") && (
                <MetricsGrid
                  title={tab === "performance" ? "Performance" : "KPIs"}
                  emptyText={
                    tab === "performance"
                      ? "Todavía no hay métricas estándar marcadas para esta empresa."
                      : "Todavía no hay KPIs propios cargados para esta empresa."
                  }
                  noAccess={noAccess}
                  loading={metrics.loading}
                  metrics={tab === "performance" ? performanceMetrics : kpiMetrics}
                  currentPeriod={period}
                  resolveValue={resolveValue}
                  onOpen={setOpenInfo}
                />
              )}

              {tab === "updates" && (
                <SectionCard
                  title="Updates"
                  action={
                    <>
                      {shared.reports.length > 1 && (
                        <Select value={shared.selectedId ?? undefined} onValueChange={shared.setSelectedId}>
                          <SelectTrigger className="w-full sm:w-56 h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {shared.reports.map((r) => (
                              <SelectItem key={r.report_id} value={r.report_id}>{r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {shared.reports.length > 0 && <PeriodSelect period={period} onChange={setPeriod} />}
                    </>
                  }
                >
                  {noAccess ? (
                    <EmptyState
                      icon={FileText}
                      title="No tenés acceso a esta información."
                      description="La conexión con esta empresa ya no está activa."
                      className="p-8"
                    />
                  ) : shared.loadingReports ? (
                    <LoadingState />
                  ) : shared.reports.length === 0 ? (
                    <EmptyState icon={FileText} title={`${profile.name} todavía no te compartió ningún update.`} className="p-8" />
                  ) : shared.loadingDetail || metrics.loading ? (
                    <LoadingState />
                  ) : !shared.sections || shared.sections.length === 0 ? (
                    <EmptyState icon={FileText} title="Este update todavía no tiene secciones." className="p-8" />
                  ) : (
                    <div className="space-y-10">
                      {shared.sections.map((section, i) => (
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
                          companyId={company_id ?? null}
                          period={period}
                          onInfo={setOpenInfo}
                        />
                      ))}
                    </div>
                  )}
                </SectionCard>
              )}

              {tab === "data-room" && (
                <SectionCard
                  title="Data Room"
                  action={
                    sharedDocs.documents.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {sharedDocs.documents.length} documento{sharedDocs.documents.length === 1 ? "" : "s"} compartido
                        {sharedDocs.documents.length === 1 ? "" : "s"}
                      </span>
                    )
                  }
                >
                  {noAccess ? (
                    <EmptyState
                      icon={FileText}
                      title="No tenés acceso a esta información."
                      description="La conexión con esta empresa ya no está activa."
                      className="p-8"
                    />
                  ) : sharedDocs.loading ? (
                    <LoadingState />
                  ) : visibleDataRoomCategories.length === 0 ? (
                    <EmptyState
                      icon={FileText}
                      title="Todavía no hay documentos compartidos."
                      description="La startup no marcó ningún documento como visible para tu organización."
                      className="p-8"
                    />
                  ) : (
                    <Accordion
                      type="multiple"
                      defaultValue={
                        deepLinkDocId
                          ? visibleDataRoomCategories
                              .filter((c) => sharedDocs.documents.some((d) => d.category === c.id && d.id === deepLinkDocId))
                              .map((c) => c.id)
                          : visibleDataRoomCategories.map((c) => c.id)
                      }
                    >
                      {visibleDataRoomCategories.map((cat) => {
                        const items = sharedDocs.documents.filter((d) => d.category === cat.id);
                        return (
                          <CategoryAccordion
                            key={cat.id}
                            value={cat.id}
                            title={cat.label}
                            countLabel={`${items.length} documento${items.length === 1 ? "" : "s"}`}
                          >
                            {items.map((doc) => (
                              <DocumentRow
                                key={doc.id}
                                doc={doc}
                                tasks={[]}
                                canEdit={false}
                                isOwner={false}
                                showRoadmapBadge={false}
                                onOpen={() => doc.file_url && window.open(doc.file_url, "_blank")}
                                onUpload={() => {}}
                                onDelete={() => {}}
                                onLinkTask={() => {}}
                                onTogglePrivacy={() => {}}
                                onSetVerified={() => {}}
                              />
                            ))}
                          </CategoryAccordion>
                        );
                      })}
                    </Accordion>
                  )}
                </SectionCard>
              )}

              {tab === "tasks" && (
                <SectionCard
                  title={
                    <>
                      Tasks
                      {roadmap.tasks.length > 0 && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          Readiness {roadmap.readinessScore}/100
                        </span>
                      )}
                    </>
                  }
                  action={
                    roadmapPillars.length > 0 && (
                      <Button variant="outline" size="sm" onClick={() => setAddingRequirement(true)}>
                        <Plus size={13} strokeWidth={1.5} className="mr-1.5" /> Agregar requisito para esta empresa
                      </Button>
                    )
                  }
                >
                  {noAccess ? (
                    <EmptyState
                      icon={Map}
                      title="No tenés acceso a esta información."
                      description="La conexión con esta empresa ya no está activa."
                      className="p-8"
                    />
                  ) : roadmap.loading ? (
                    <LoadingState />
                  ) : roadmap.tasks.length === 0 ? (
                    <EmptyState
                      icon={Map}
                      title="Todavía no hay tareas para ver."
                      description="Cuando la startup tenga tareas cargadas, van a aparecer acá agrupadas por pilar."
                      className="p-8"
                    />
                  ) : (
                    <RoadmapTaskList
                      pillars={roadmap.pillars}
                      tasks={roadmap.tasks}
                      onOpenTask={setOpenRoadmapTask}
                      onEditTask={setEditingTask}
                      readOnly
                    />
                  )}
                </SectionCard>
              )}

              {tab === "activity" && (
                <SectionCard title="Activity">
                  {noAccess ? (
                    <EmptyState
                      icon={FileText}
                      title="No tenés acceso a esta información."
                      description="La conexión con esta empresa ya no está activa."
                      className="p-8"
                    />
                  ) : activityLoading ? (
                    <LoadingState />
                  ) : activityEvents.length === 0 ? (
                    <EmptyState icon={FileText} title="Todavía no hay actividad para mostrar." className="p-8" />
                  ) : (
                    <div className="divide-y divide-border">
                      {activityEvents.map((e, i) => (
                        <div key={`${e.related_id}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                          <span className="text-foreground">{e.summary}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {new Date(e.occurred_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              )}
            </>
          )
        )}
      </div>

      <MetricInfoSheet metric={openInfo} onClose={() => setOpenInfo(null)} history={infoHistory} />

      <RoadmapTaskDetailSheet task={openRoadmapTask} onClose={() => setOpenRoadmapTask(null)} />

      {profile && (
        <AddRoadmapTaskDialog
          open={addingRequirement}
          onOpenChange={setAddingRequirement}
          pillars={roadmapPillars}
          defaultPillarId={roadmapPillars[0]?.id ?? ""}
          title={`Agregar requisito para ${profile.name}`}
          description="Se suma al roadmap de esta startup, no cuenta para su readiness score, que se calcula solo con el catálogo estándar."
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["shared-roadmap", company_id] })}
          companies={company_id ? [{ id: company_id, name: profile.name }] : []}
          hideTargetPicker
        />
      )}

      {editingTask && (
        <AddRoadmapTaskDialog
          open={!!editingTask}
          onOpenChange={(o) => !o && setEditingTask(null)}
          pillars={roadmapPillars}
          defaultPillarId={roadmapPillars[0]?.id ?? ""}
          title={`Editar "${editingTask.title}"`}
          description="Solo vos podés editar esta tarea — la pediste desde tu fondo."
          onSaved={() => {
            setEditingTask(null);
            queryClient.invalidateQueries({ queryKey: ["shared-roadmap", company_id] });
          }}
          task={{
            task_id: editingTask.startup_task_id,
            pillar_id: editingTask.pillar_id,
            title: editingTask.title,
            description: editingTask.description,
            why_it_matters: editingTask.why_it_matters,
            how_to_do_it: editingTask.how_to_do_it,
            criticality: editingTask.criticality,
            requires_doc: editingTask.requires_doc,
            requires_report: editingTask.requires_report,
            due_date: editingTask.due_date,
          }}
        />
      )}
    </AppLayout>
  );
}

// Grid de cards para las pestañas Performance/KPIs — mismo dato
// (metrics.metrics) que ya evalúa el resto de la pantalla, filtrado por
// metric_class. Click abre el mismo MetricInfoSheet que Updates.
function MetricsGrid({
  title,
  emptyText,
  noAccess,
  loading,
  metrics,
  currentPeriod,
  resolveValue,
  onOpen,
}: {
  title: string;
  emptyText: string;
  noAccess: boolean;
  loading: boolean;
  metrics: MetricDef[];
  currentPeriod: { month: number; year: number };
  resolveValue: (m: MetricDef, month: number, year: number) => number | null;
  onOpen: (m: MetricDef) => void;
}) {
  if (noAccess) {
    return (
      <EmptyState
        icon={FileText}
        title="No tenés acceso a esta información."
        description="La conexión con esta empresa ya no está activa."
        className="p-8"
      />
    );
  }
  if (loading) return <LoadingState variant="centered" className="py-16" />;
  if (metrics.length === 0) {
    return <EmptyState icon={FileText} title={emptyText} className="p-8" />;
  }
  const prev = prevMonth(currentPeriod.month, currentPeriod.year);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {metrics.map((m) => {
        const current = resolveValue(m, currentPeriod.month, currentPeriod.year);
        const prevValue = resolveValue(m, prev.m, prev.y);
        const change = percentChange(current, prevValue);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onOpen(m)}
            className="text-left border border-border rounded-lg bg-card p-3 hover:border-foreground/30 transition-colors"
          >
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide truncate">{m.name}</p>
            <p className="text-lg font-medium text-foreground tabular-nums mt-1">{formatMetricValue(current, m.unit)}</p>
            {change !== null && (
              <p className={cn("text-xs mt-0.5 tabular-nums", change >= 0 ? "text-success" : "text-destructive")}>
                {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
