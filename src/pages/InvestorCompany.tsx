import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Plus, Map } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { BackLink } from "@/components/BackLink";
import { PageHeader } from "@/components/PageHeader";
import { StageBadge } from "@/components/StageBadge";
import { useConnectedCompanyMetrics } from "@/hooks/useConnectedCompanyMetrics";
import { useSharedFinancialReports } from "@/hooks/useSharedFinancialReports";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { FileText } from "lucide-react";
import { ReportSectionView } from "@/components/metrics/ReportSectionView";
import { PeriodSelect } from "@/components/metrics/PeriodSelect";
import { MetricInfoSheet, type MetricHistoryPoint } from "@/components/metrics/MetricInfoSheet";
import { PlatformAgentPanel } from "@/components/ai/PlatformAgentPanel";
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
import { evalFormula, FORMULA_SYNTAX } from "@/lib/formulaEngine";
import { periodKey, prevMonth, toPeriodString, periodRange } from "@/lib/metricPeriod";
import { useRawFieldValues } from "@/hooks/useRawFieldValues";
import { useMetricReportData } from "@/hooks/useMetricReportData";
import { useSharedDocuments } from "@/hooks/useSharedDocuments";
import { useSharedRoadmap } from "@/hooks/useSharedRoadmap";
import { DATA_ROOM_CATEGORIES } from "@/lib/dataRoom";
import { LIST_ROADMAP_PILLARS_URL, type RoadmapPillar, type RoadmapTask } from "@/lib/roadmap";
import { RoadmapTaskList } from "@/components/roadmap/RoadmapTaskList";
import { RoadmapTaskDetailSheet } from "@/components/roadmap/RoadmapTaskDetailSheet";
import { AddRoadmapTaskDialog } from "@/components/roadmap/AddRoadmapTaskDialog";
import { API_BASE_URL } from "@/lib/apiConfig";

const GET_COMPANY_PROFILE_URL = `${API_BASE_URL}/get-company-profile`;

const now = new Date();

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

export default function InvestorCompany() {
  const { company_id } = useParams<{ company_id: string }>();
  const { user, loading, isOrgViewer, fund_name, portfolio_company_ids, portfolio_company_names } = useAuth();
  const queryClient = useQueryClient();
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
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [openRoadmapTask, setOpenRoadmapTask] = useState<RoadmapTask | null>(null);
  const [addingRequirement, setAddingRequirement] = useState(false);
  // 24 meses de margen sobre el período elegido para que SUMLAST/AVGLAST/YTD
  // sigan calculando — se recalcula (y refetchea) al cambiar de período.
  const metricsRange = useMemo(() => periodRange(period, 24), [period]);
  const metrics = useConnectedCompanyMetrics(company_id ?? null, metricsRange);
  const shared = useSharedFinancialReports(company_id ?? null);
  const sharedDocs = useSharedDocuments(company_id ?? null);
  const roadmap = useSharedRoadmap(company_id ?? null);
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

  const metricById = useMemo(() => Object.fromEntries(metrics.metrics.map((m) => [m.id, m])), [metrics.metrics]);
  const allCalcDefs = useMemo(() => metrics.metrics.filter((m) => m.metric_type === "calculated"), [metrics.metrics]);

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

  const infoHistory = useMemo<MetricHistoryPoint[]>(() => {
    if (!openInfo) return [];
    const out: MetricHistoryPoint[] = [];
    let m = now.getMonth() + 1;
    let y = now.getFullYear();
    for (let i = 0; i < 12; i++) {
      let v: number | null = null;
      if (openInfo.metric_type === "input" && openInfo.input_key) {
        const raw = metrics.entries[openInfo.id]?.[periodKey(m, y)];
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
                action={
                  <Button variant="outline" onClick={() => setAssistantOpen(true)}>
                    <Sparkles size={14} className="mr-1" aria-hidden="true" /> Asistente
                  </Button>
                }
              />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm mt-8">
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
              </dl>

              <div className="mt-10 pt-8 border-t border-border">
                <div className="flex items-center justify-between mb-6 gap-2">
                  <h2 className="text-sm font-medium">Reporte</h2>
                  <div className="flex items-center gap-2">
                    {shared.reports.length > 1 && (
                      <Select value={shared.selectedId ?? undefined} onValueChange={shared.setSelectedId}>
                        <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {shared.reports.map((r) => (
                            <SelectItem key={r.report_id} value={r.report_id}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {shared.reports.length > 0 && <PeriodSelect period={period} onChange={setPeriod} />}
                  </div>
                </div>

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
                  <EmptyState icon={FileText} title={`${profile.name} todavía no te compartió ningún reporte.`} className="p-8" />
                ) : shared.loadingDetail || metrics.loading ? (
                  <LoadingState />
                ) : !shared.sections || shared.sections.length === 0 ? (
                  <EmptyState icon={FileText} title="Este reporte todavía no tiene secciones." className="p-8" />
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
              </div>

              <div className="mt-10 pt-8 border-t border-border">
                <div className="flex items-center justify-between mb-6 gap-2">
                  <h2 className="text-sm font-medium flex items-center gap-2">
                    Roadmap
                    {roadmap.tasks.length > 0 && (
                      <span className="text-xs font-normal text-muted-foreground">
                        Readiness {roadmap.readinessScore}/100
                      </span>
                    )}
                  </h2>
                  {roadmapPillars.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setAddingRequirement(true)}>
                      <Plus size={13} strokeWidth={1.5} className="mr-1.5" /> Agregar requisito para esta empresa
                    </Button>
                  )}
                </div>

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
                    title="Todavía no hay roadmap para ver."
                    description="Cuando la startup tenga tareas cargadas, van a aparecer acá agrupadas por pilar."
                    className="p-8"
                  />
                ) : (
                  <RoadmapTaskList
                    pillars={roadmap.pillars}
                    tasks={roadmap.tasks}
                    onOpenTask={setOpenRoadmapTask}
                    readOnly
                  />
                )}
              </div>

              <div className="mt-10 pt-8 border-t border-border">
                <div className="flex items-center justify-between mb-6 gap-2">
                  <h2 className="text-sm font-medium">Data Room</h2>
                  {sharedDocs.documents.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {sharedDocs.documents.length} documento{sharedDocs.documents.length === 1 ? "" : "s"} compartido
                      {sharedDocs.documents.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

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
                  <Accordion type="multiple" defaultValue={visibleDataRoomCategories.map((c) => c.id)}>
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
              </div>
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

      <PlatformAgentPanel
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        companyId={company_id ?? null}
        surface="investor_company"
        uiContext={{
          selectedMetricId: openInfo?.id ?? null,
          selectedCategoryId: null,
          selectedReportId: shared.selectedId ?? null,
          currentPeriodId: toPeriodString(period.month, period.year),
        }}
        formulaSyntax={FORMULA_SYNTAX}
      />
    </AppLayout>
  );
}
