import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { BackLink } from "@/components/BackLink";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/FormField";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/SectionCard";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { ReportSectionView } from "@/components/metrics/ReportSectionView";
import { PeriodSelect } from "@/components/metrics/PeriodSelect";
import { MetricInfoSheet, type MetricHistoryPoint } from "@/components/metrics/MetricInfoSheet";
import { ReportAnalyticsSheet } from "@/components/metrics/ReportAnalyticsSheet";
import { PlatformAgentPanel } from "@/components/ai/PlatformAgentPanel";
import { cn } from "@/lib/utils";
import { handleMembershipError } from "@/lib/membership";
import { LIST_FINANCIAL_METRICS_URL, LIST_FINANCIAL_RECORDS_URL, type FinancialMetricDef } from "@/lib/financialData";
import { LIST_CONNECTIONS_URL, type Connection } from "@/lib/connections";
import { buildEntriesFromRecords, periodKey, prevMonth, toPeriodString, periodRange, parsePeriodString, MONTH_LABELS } from "@/lib/metricPeriod";
import { toMetricDef, type MetricDef } from "@/lib/metrics";
import { evalFormula, FORMULA_SYNTAX } from "@/lib/formulaEngine";
import { useRawFieldValues } from "@/hooks/useRawFieldValues";
import { useMetricReportData } from "@/hooks/useMetricReportData";
import { useEvaluatedMetrics } from "@/hooks/useEvaluatedMetrics";
import { useStartup } from "@/hooks/useStartup";
import { buildHistoryPeriodStrs, isQueryBasedMetric, resolveReportBlock } from "@/lib/reportBlockResolver";
import { buildReportPdfHtml, type ReportPdfSection } from "@/lib/reportPdf";
import { exportReportPdf, loadLogoDataUrl, PDF_FAILED_MESSAGE, PDF_LOGO_SUPPORTED_BY_BACKEND } from "@/lib/reportPdfExport";
import {
  GET_FINANCIAL_REPORT_URL,
  UPDATE_FINANCIAL_REPORT_URL,
  SHARE_FINANCIAL_REPORT_URL,
  UNSHARE_FINANCIAL_REPORT_URL,
  LIST_FINANCIAL_REPORT_SHARES_URL,
  PUBLISH_FINANCIAL_REPORT_URL,
  type PublishReportResponse,
  type ReportSection,
  type ReportShare,
} from "@/lib/financialReports";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, X, Plus, Save, GripVertical, Eye, Pencil, Share2, FileText, Sparkles, Download, BarChart3 } from "lucide-react";

const now = new Date();

function formatSavedPeriod(period: string): string {
  const { y, m } = parsePeriodString(period);
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

// Valor de una tarjeta en formato es-AR, como en el mockup: "$84.000", "4,2%".
// Sin abreviaturas (nada de "138.3k"): los números completos son el contrato.
function formatCardValue(value: number, unit: string | null): string {
  if (unit === "USD" || unit === "$") return `$${Math.round(value).toLocaleString("es-AR")}`;
  if (unit === "%") return `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
  const n = value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return unit ? `${n} ${unit}` : n;
}

// Meses en minúscula para el texto del mockup ("frente a marzo", "Sin dato en abril").
const MONTHS_LOWER_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default function ReportEditor() {
  const { reportId } = useParams<{ reportId: string }>();
  const { user, loading, role, company_id, is_owner } = useAuth();
  const navigate = useNavigate();

  // Vista en la URL (?modo, ?periodo, ?analitica): el enlace reproduce la vista.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPeriod = searchParams.get("periodo");
  const urlPeriodValid = urlPeriod && /^\d{4}-(0[1-9]|1[0-2])$/.test(urlPeriod) ? urlPeriod : null;
  const [mode, setMode] = useState<"edit" | "preview">(searchParams.get("modo") === "vista-previa" ? "preview" : "edit");
  // Quien no es owner nunca ve el toggle Editar/Vista previa (gateado abajo),
  // así que sin esto "mode" se quedaba en "edit" para siempre y esa persona
  // jamás veía los valores reales de las métricas, solo sus nombres.
  const effectiveMode = is_owner ? mode : "preview";
  const [loadingReport, setLoadingReport] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [sections, setSections] = useState<ReportSection[]>([]);
  // Sección que está en modo "Renombrar" (título y subtítulo editables).
  const [renamingSection, setRenamingSection] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [openInfo, setOpenInfo] = useState<MetricDef | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(searchParams.get("analitica") === "1");
  const [confirmRemoveSection, setConfirmRemoveSection] = useState<number | null>(null);
  // Última versión guardada (o recién cargada) — permite avisar antes de
  // cerrar la pestaña con cambios sin guardar, sin depender de un flag
  // "dirty" que haya que mantener sincronizado a mano en cada handler.
  const savedSnapshotRef = useRef<string>("");
  // Versiones (contrato 2026-10): la última publicada, si el borrador cambió
  // después, y el updated_at que se manda en cada guardado para detectar 409.
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const reportUpdatedAtRef = useRef<string | null>(null);

  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [entries, setEntries] = useState<Record<string, Record<string, number>>>({});
  const metricById = useMemo(() => Object.fromEntries(metrics.map((m) => [m.id, m])), [metrics]);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [shares, setShares] = useState<ReportShare[]>([]);
  const [sharingId, setSharingId] = useState<string | null>(null);

  // Período fijado en el reporte (null = legacy, sin período definido). `period`
  // es solo el período que se está previsualizando; por defecto arranca en el
  // guardado y el founder puede explorar otros sin tocar lo guardado.
  const [savedPeriod, setSavedPeriod] = useState<string | null>(null);
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [period, setPeriod] = useState(() => {
    if (urlPeriodValid) {
      const [y, m] = urlPeriodValid.split("-").map(Number);
      return { month: m, year: y };
    }
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  });
  // Atrás/adelante cambia la URL sin remontar el componente: la vista tiene que
  // seguir a la URL, no al revés.
  const modoParam = searchParams.get("modo");
  const analiticaParam = searchParams.get("analitica");
  useEffect(() => {
    setMode(modoParam === "vista-previa" ? "preview" : "edit");
  }, [modoParam]);
  useEffect(() => {
    setAnalyticsOpen(analiticaParam === "1");
  }, [analiticaParam]);
  useEffect(() => {
    if (!urlPeriodValid) return;
    const [y, m] = urlPeriodValid.split("-").map(Number);
    setPeriod({ month: m, year: y });
  }, [urlPeriodValid]);
  // Cambiar de modo agrega entrada al historial (Atrás vuelve al modo anterior);
  // período y panel reemplazan la entrada, como pide la regla de deep links.
  const changeMode = (next: "edit" | "preview") => {
    setMode(next);
    const params = new URLSearchParams(searchParams);
    params.set("modo", next === "preview" ? "vista-previa" : "editar");
    setSearchParams(params);
  };
  const changeAnalytics = (open: boolean) => {
    setAnalyticsOpen(open);
    const params = new URLSearchParams(searchParams);
    if (open) params.set("analitica", "1");
    else params.delete("analitica");
    setSearchParams(params, { replace: true });
  };
  const changePeriod = (next: { month: number; year: number }) => {
    setPeriod(next);
    const params = new URLSearchParams(searchParams);
    params.set("periodo", toPeriodString(next.month, next.year));
    setSearchParams(params, { replace: true });
  };
  const periodInitializedFor = useRef<string | null>(null);
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
        const loadedName = data.name ?? "";
        const loadedSections = Array.isArray(data.sections) ? data.sections : [];
        setName(loadedName);
        setSections(loadedSections);
        savedSnapshotRef.current = JSON.stringify({ name: loadedName, sections: loadedSections });
        const loadedPeriod: string | null = data.period ?? null;
        setSavedPeriod(loadedPeriod);
        reportUpdatedAtRef.current = data.updated_at ?? null;
        setPublishedVersion(data.published_version ?? null);
        setHasUnpublishedChanges(data.has_unpublished_changes === true);
        // Solo en la primera carga de este reporte: si no, cada cambio del
        // selector (que refetchea) volvería a pisar el período que se está
        // mirando.
        if (periodInitializedFor.current !== reportId) {
          periodInitializedFor.current = reportId;
          // Con ?periodo= en la URL, esa vista gana sobre el período guardado.
          if (loadedPeriod && !urlPeriodValid) {
            const { y, m } = parsePeriodString(loadedPeriod);
            setPeriod({ month: m, year: y });
          }
        }
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

  // Solo el owner puede editar (todo lo demás queda gateado a is_owner más
  // abajo) — nunca había ningún aviso de cambios sin guardar, se podía
  // editar/compartir y cerrar la pestaña sin darse cuenta.
  useEffect(() => {
    if (!is_owner) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (JSON.stringify({ name, sections }) === savedSnapshotRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [is_owner, name, sections]);

  // ---- Preview data (mismo cálculo que InvestorCompany.tsx) ----
  const allCalcDefs = useMemo(() => metrics.filter((m) => m.metric_type === "calculated"), [metrics]);
  const { inputsForPeriod, currentInputs, prevInputs, prev, historyInputs, formulaHistory, baseRawFieldPeriods } =
    useMetricReportData({ metrics, entries, period });

  // Ver Metrics.tsx: misma idea, una sola resolución deduplicada de
  // FIELDSUM/etc. para toda la pantalla (mes actual + anterior para la
  // preview, últimos 12 meses para el panel de info).
  const allFormulas = useMemo(() => allCalcDefs.map((d) => d.formula_expression), [allCalcDefs]);
  const { valuesByPeriod: rawFieldValuesByPeriod } = useRawFieldValues(company_id, baseRawFieldPeriods, allFormulas);

  // Valores de las métricas query-based del reporte para el PDF: la vista en
  // pantalla los pide por sección (ReportSectionView); acá una sola vez para todo.
  const { startup } = useStartup();
  const pdfQueryMetricIds = useMemo(
    () =>
      sections
        .flatMap((s) => s.blocks.map((b) => metricById[b.metric_id]))
        .filter((d): d is MetricDef => !!d && isQueryBasedMetric(d))
        .map((d) => d.id),
    [sections, metricById]
  );
  const pdfEvalRange = useMemo(() => periodRange(period, 5), [period.month, period.year]);
  const { values: pdfEvaluatedValues } = useEvaluatedMetrics(
    company_id,
    pdfQueryMetricIds,
    pdfQueryMetricIds.length > 0 ? { period_from: pdfEvalRange.from, period_to: pdfEvalRange.to } : null
  );

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

  // Arma las secciones del PDF con el mismo resolver que la vista en pantalla,
  // sobre el período que se está mirando (que en este punto es el fijado).
  const buildPdfSections = (): ReportPdfSection[] => {
    const currentStr = toPeriodString(period.month, period.year);
    const prevM = prevMonth(period.month, period.year);
    const prevStr = toPeriodString(prevM.m, prevM.y);
    const historyStrs = buildHistoryPeriodStrs(period);
    const monthLabel = `${MONTH_LABELS[period.month - 1]} ${period.year}`;
    const rawCurrent = rawFieldValuesByPeriod[currentStr] ?? {};
    const rawPrev = rawFieldValuesByPeriod[prevStr] ?? {};
    return sections.map((section) => ({
      // Hay secciones sin título cargado (datos viejos): nunca mandar "undefined" al PDF.
      title: section.title || "Sección sin título",
      subtitle: section.subtitle ?? null,
      blocks: section.blocks
        .map((b) => metricById[b.metric_id])
        .filter((d): d is MetricDef => !!d)
        .map((def) => {
          const r = resolveReportBlock({
            def,
            currentInputs,
            prevInputs,
            historyInputs,
            formulaHistory,
            calcDefs: allCalcDefs,
            rawFieldValues: rawCurrent,
            prevRawFieldValues: rawPrev,
            evaluatedByPeriod: pdfEvaluatedValues[def.id],
            evaluating: false,
            currentPeriodStr: currentStr,
            prevPeriodStr: prevStr,
            historyPeriodStrs: historyStrs,
          });
          return {
            name: def.name,
            unit: def.unit ?? null,
            current: r.current,
            change: r.change,
            spark: r.sparkData.map((p) => p.v),
            missingLabel: `Sin dato en ${monthLabel}`,
          };
        }),
    }));
  };

  const handleExportPdf = async () => {
    if (!reportId) return;
    if (savedPeriod == null) {
      toast.error("Fijá el período del reporte antes de exportar el PDF.");
      return;
    }
    const viewing = toPeriodString(period.month, period.year);
    if (viewing !== savedPeriod) {
      const saved = parsePeriodString(savedPeriod);
      toast.error(`Mostrá el reporte en ${MONTH_LABELS[saved.m - 1]} ${saved.y} para exportarlo.`);
      return;
    }
    if (JSON.stringify({ name, sections }) !== savedSnapshotRef.current) {
      toast.error("Guardá los cambios antes de exportar el PDF.");
      return;
    }
    setExportingPdf(true);
    try {
      const generatedLabel = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
      const logoDataUrl = PDF_LOGO_SUPPORTED_BY_BACKEND ? await loadLogoDataUrl(startup?.logo_url) : null;
      const html = buildReportPdfHtml({
        reportName: name,
        companyName: startup?.name ?? "",
        logoDataUrl,
        periodLabel: `${MONTH_LABELS[period.month - 1]} ${period.year}`,
        generatedLabel,
        sections: buildPdfSections(),
      });
      const result = await exportReportPdf(reportId, html);
      if (result.ok === false) {
        toast.error(result.message);
        return;
      }
      // Sin "noopener" en los features: con esa opción window.open siempre devuelve
      // null y el aviso de pop-up bloqueado salía aunque el PDF sí se abría.
      // Se corta el opener a mano después de abrir.
      const opened = window.open(result.downloadUrl, "_blank");
      if (opened) {
        opened.opener = null;
      } else {
        toast.error("El navegador bloqueó la ventana del PDF. Permití pop-ups para este sitio y probá de nuevo.");
      }
    } catch {
      // Un fallo armando el documento tampoco puede quedar en silencio.
      toast.error(PDF_FAILED_MESSAGE);
    } finally {
      setExportingPdf(false);
    }
  };

  const previewedPeriod = toPeriodString(period.month, period.year);
  const periodDiffersFromSaved = savedPeriod !== null && previewedPeriod !== savedPeriod;

  const savePeriod = async () => {
    if (!reportId) return;
    setSavingPeriod(true);
    try {
      const res = await fetch(UPDATE_FINANCIAL_REPORT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, period: previewedPeriod }),
      });
      if (await handleMembershipError(res)) return;
      if (!res.ok) {
        toast.error("No se pudo fijar el período");
        return;
      }
      setSavedPeriod(previewedPeriod);
      toast.success(`El reporte ahora muestra ${MONTH_LABELS[period.month - 1]} ${period.year}`);
    } catch {
      toast.error("No se pudo fijar el período");
    } finally {
      setSavingPeriod(false);
    }
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
        body: JSON.stringify({
          report_id: reportId,
          name: name.trim(),
          sections,
          // Si alguien más guardó después de que cargamos, el servidor responde 409
          // y no pisa nada. Compatibilidad: sin valor, se guarda igual.
          expected_updated_at: reportUpdatedAtRef.current ?? undefined,
        }),
      });
      // El 409 va antes de handleMembershipError: ese helper trata cualquier
      // status que no sea 400/401/403 como "Error inesperado".
      if (res.status === 409) {
        // No recargamos: eso pisaría lo que la persona está escribiendo.
        toast.error("Otra persona cambió este reporte hace poco. Tus cambios siguen acá: recargá para ver la versión nueva y volvé a aplicarlos.");
        return;
      }
      if (await handleMembershipError(res)) return;
      if (!res.ok) throw new Error("save_failed");
      savedSnapshotRef.current = JSON.stringify({ name: name.trim(), sections });
      // Traemos el updated_at nuevo para la próxima guardada y el estado de versión.
      await loadReport({ showLoading: false });
      toast.success("Reporte guardado");
    } catch {
      toast.error("No pudimos guardar el reporte. Revisá tu conexión y probá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  // Métricas de entrada que hoy no tienen valor en el período del reporte. Las
  // calculadas no entran acá: su resolución vive en ReportSectionView.
  const missingInputs = useMemo(
    () =>
      sections.flatMap((s) =>
        s.blocks
          .map((b) => metricById[b.metric_id])
          .filter((d): d is MetricDef => !!d && d.metric_type === "input" && !!d.input_key && currentInputs[d.input_key] === undefined)
          .map((d) => d.name)
      ),
    [sections, metricById, currentInputs]
  );
  const nextVersion = (publishedVersion ?? 0) + 1;

  const publish = async () => {
    if (!reportId) return;
    // El snapshot sale del borrador guardado: si hay cambios sin guardar, no publicamos.
    if (JSON.stringify({ name, sections }) !== savedSnapshotRef.current) {
      toast.error("Guardá los cambios antes de publicar.");
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch(PUBLISH_FINANCIAL_REPORT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId }),
      });
      if (res.status === 400) {
        toast.error("Fijá un período antes de publicar. Lo podés hacer desde el aviso de arriba.");
        return;
      }
      if (await handleMembershipError(res)) return;
      if (!res.ok) throw new Error("publish_failed");
      const data = (await res.json()) as PublishReportResponse;
      setPublishedVersion(data.version);
      setHasUnpublishedChanges(false);
      setPublishOpen(false);
      toast.success(`Publicado v${data.version}.`);
    } catch {
      toast.error("No pudimos publicar el reporte. Revisá tu conexión y probá de nuevo.");
    } finally {
      setPublishing(false);
    }
  };

  const isShared = (connectionId: string) => shares.some((s) => s.connection_id === connectionId && s.report_id === reportId);
  const toggleShare = async (connection: Connection, next: boolean) => {
    if (!reportId) return;
    // Compartir fija la última versión publicada: el fondo ve ese snapshot,
    // nunca el borrador. Sin versión publicada no hay nada que compartir.
    if (next && publishedVersion == null) {
      toast.error("Publicá el reporte antes de compartirlo. El fondo ve la última versión publicada.");
      return;
    }
    setSharingId(connection.connection_id);
    try {
      const url = next ? SHARE_FINANCIAL_REPORT_URL : UNSHARE_FINANCIAL_REPORT_URL;
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          next
            ? { report_id: reportId, connection_id: connection.connection_id, version: publishedVersion }
            : { report_id: reportId, connection_id: connection.connection_id }
        ),
      });
      // Código estable del backend (contrato 2026-10), antes del helper genérico.
      if (next && res.status === 400) {
        const body = await res.clone().json().catch(() => null);
        if (body?.code === "no_published_version") {
          toast.error("Publicá el reporte antes de compartirlo. El fondo ve la última versión publicada.");
          return;
        }
      }
      if (await handleMembershipError(res)) return;
      if (!res.ok) {
        toast.error(next ? "No se pudo compartir el reporte." : "No se pudo dejar de compartir el reporte.");
        return;
      }
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

  // Valores de cada métrica del reporte para las tarjetas del editor, con el mismo
  // resolver que la vista y el PDF.
  const viewCurrentStr = toPeriodString(period.month, period.year);
  const viewPrevMonth = prevMonth(period.month, period.year);
  const viewPrevStr = toPeriodString(viewPrevMonth.m, viewPrevMonth.y);
  const viewHistoryStrs = buildHistoryPeriodStrs(period);
  const viewRawCurrent = rawFieldValuesByPeriod[viewCurrentStr] ?? {};
  const viewRawPrev = rawFieldValuesByPeriod[viewPrevStr] ?? {};
  const blockView = (def: MetricDef) =>
    resolveReportBlock({
      def,
      currentInputs,
      prevInputs,
      historyInputs,
      formulaHistory,
      calcDefs: allCalcDefs,
      rawFieldValues: viewRawCurrent,
      prevRawFieldValues: viewRawPrev,
      evaluatedByPeriod: pdfEvaluatedValues[def.id],
      evaluating: false,
      currentPeriodStr: viewCurrentStr,
      prevPeriodStr: viewPrevStr,
      historyPeriodStrs: viewHistoryStrs,
    });
  const monthName = MONTHS_LOWER_ES[period.month - 1];
  const prevMonthName = MONTHS_LOWER_ES[viewPrevMonth.m - 1];

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (role !== "user") return <Navigate to="/dashboard" replace />;
  if (!company_id) return <Navigate to="/reporting" replace />;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 space-y-8">
        <nav className="text-xs text-muted-foreground" aria-label="Migas de pan">
          <Link to="/reporting" className="text-primary-dark font-medium hover:underline">
            Reporting
          </Link>{" "}
          / <span className="text-foreground">{name || "Reporte"}</span>
        </nav>

        {loadingReport ? (
          <LoadingState />
        ) : notFound ? (
          <EmptyState icon={FileText} title="No se encontró el reporte." description="Puede que se haya eliminado o que el link ya no sea válido." />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <h1 className="text-[1.375rem] font-medium tracking-tight truncate">{name || "Reporte"}</h1>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0",
                    publishedVersion == null
                      ? "bg-muted-foreground text-background"
                      : hasUnpublishedChanges
                        ? "bg-warning text-warning-foreground"
                        : "bg-success text-success-foreground"
                  )}
                >
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                  {publishedVersion == null ? "Borrador" : hasUnpublishedChanges ? "Cambios sin publicar" : `Publicado v${publishedVersion}`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {is_owner && (
                  <div role="group" aria-label="Modo del reporte" className="inline-flex border border-border rounded-md overflow-hidden h-9">
                    <button
                      onClick={() => changeMode("edit")}
                      aria-pressed={mode === "edit"}
                      className={cn(
                        "px-3 text-xs flex items-center gap-1.5 transition-all",
                        mode === "edit" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Pencil size={12} strokeWidth={1.5} /> Editar
                    </button>
                    <button
                      onClick={() => changeMode("preview")}
                      aria-pressed={mode === "preview"}
                      className={cn(
                        "px-3 text-xs flex items-center gap-1.5 transition-all border-l border-border",
                        mode === "preview" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Eye size={12} strokeWidth={1.5} /> Vista previa
                    </button>
                  </div>
                )}
                {effectiveMode === "preview" && <PeriodSelect period={period} onChange={changePeriod} />}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={exportingPdf}>
                <Download size={14} className="mr-1" aria-hidden="true" /> {exportingPdf ? "Generando…" : "Exportar PDF"}
              </Button>
              {is_owner && (
                <Button variant="outline" size="sm" onClick={() => changeAnalytics(true)}>
                  <BarChart3 size={14} className="mr-1" aria-hidden="true" /> Actividad
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setAssistantOpen(true)}>
                <Sparkles size={14} className="mr-1" aria-hidden="true" /> Asistente
              </Button>
            </div>

            {saving && (
              <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground">
                <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-primary" />
                <span>Guardando…</span>
              </div>
            )}

            <ConfirmationDialog
              open={publishOpen}
              onOpenChange={setPublishOpen}
              title={`Publicar versión ${nextVersion}`}
              description={
                <>
                  Los fondos con acceso van a ver la versión {nextVersion} con los números de este momento.
                  {missingInputs.length > 0
                    ? <> Estos datos todavía no tienen valor y se van a ver como "Sin dato": <span className="text-foreground font-medium">{missingInputs.join(", ")}</span>.</>
                    : " Todas las métricas tienen valor."}
                </>
              }
              confirmLabel={publishing ? "Publicando…" : `Publicar versión ${nextVersion}`}
              busy={publishing}
              onConfirm={publish}
            />

            {savedPeriod === null && (
              <div className="rounded-lg border border-border bg-surface px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  Este reporte no tiene período definido. Elegí el mes que quiere mostrar y fijalo.
                </span>
                <Button size="sm" onClick={savePeriod} disabled={savingPeriod}>
                  {savingPeriod ? "Fijando…" : `Fijar ${MONTH_LABELS[period.month - 1]} ${period.year}`}
                </Button>
              </div>
            )}
            {periodDiffersFromSaved && (
              <div className="rounded-lg border border-border bg-surface px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  Estás viendo {MONTH_LABELS[period.month - 1]} {period.year}. El reporte está fijado a{" "}
                  {formatSavedPeriod(savedPeriod)}.
                </span>
                <Button size="sm" variant="outline" onClick={savePeriod} disabled={savingPeriod}>
                  {savingPeriod ? "Fijando…" : `Usar ${MONTH_LABELS[period.month - 1]} ${period.year} en el reporte`}
                </Button>
              </div>
            )}

            {effectiveMode === "preview" ? (
              sections.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="Este reporte todavía no tiene secciones."
                  description="Agregá métricas al reporte desde el modo de edición."
                  action={is_owner ? { label: "Volver a editar", onClick: () => changeMode("edit") } : undefined}
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
                  <FormField label="Nombre del reporte" htmlFor="report-name" className="max-w-sm">
                    <Input id="report-name" value={name} onChange={(e) => setName(e.target.value)} />
                  </FormField>
                )}

                {missingInputs.length > 0 && (
                  <section className="rounded-lg border border-border bg-card p-4 space-y-3" aria-labelledby="faltan-datos">
                    <div className="space-y-1">
                      <h2 id="faltan-datos" className="text-sm font-medium">
                        Para publicar faltan {missingInputs.length} {missingInputs.length === 1 ? "dato" : "datos"}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Podés seguir editando y guardar el borrador cuando quieras. Los datos faltantes se ven como "Sin dato" en el reporte.
                      </p>
                    </div>
                    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      {missingInputs.map((metricName) => (
                        <li key={metricName} className="flex items-center gap-2">
                          <span>{metricName}</span>
                          <button
                            type="button"
                            onClick={() => navigate("/metrics?tab=sources")}
                            className="text-primary-dark text-xs font-medium underline underline-offset-2 hover:opacity-80"
                          >
                            Cargar en Fuentes
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <div className="space-y-10">
                  {sections.length === 0 && (
                    <EmptyState
                      icon={FileText}
                      title="Este reporte todavía no tiene secciones."
                      description="Agregá una sección para empezar a sumar métricas."
                    />
                  )}

                  {sections.map((section, si) => (
                    <section key={si} className="space-y-3" aria-label={section.title || "Sección sin título"}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {renamingSection === si ? (
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <Input
                              autoFocus
                              value={section.title ?? ""}
                              onChange={(e) => updateSection(si, { title: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") setRenamingSection(null);
                              }}
                              placeholder="Título de la sección"
                              aria-label="Título de la sección"
                              className="h-9 max-w-xs"
                            />
                            <Input
                              value={section.subtitle ?? ""}
                              onChange={(e) => updateSection(si, { subtitle: e.target.value || null })}
                              placeholder="Subtítulo (opcional)"
                              aria-label="Subtítulo de la sección"
                              className="h-9 max-w-xs"
                            />
                            <Button size="sm" variant="ghost" onClick={() => setRenamingSection(null)}>
                              Listo
                            </Button>
                          </div>
                        ) : (
                          <div className="min-w-0">
                            <h2 className="text-base font-medium truncate">{section.title || "Sección sin título"}</h2>
                            {section.subtitle && <p className="text-xs text-muted-foreground">{section.subtitle}</p>}
                          </div>
                        )}
                        <div className="flex items-center gap-1 shrink-0">
                          {renamingSection !== si && (
                            <Button size="sm" variant="ghost" onClick={() => setRenamingSection(si)}>
                              Renombrar sección
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={si === 0} onClick={() => moveSection(si, -1)} title="Mover sección arriba" aria-label="Mover sección arriba">
                            <ChevronUp size={14} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={si === sections.length - 1} onClick={() => moveSection(si, 1)} title="Mover sección abajo" aria-label="Mover sección abajo">
                            <ChevronDown size={14} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive-dark" onClick={() => setConfirmRemoveSection(si)} title="Eliminar sección" aria-label="Eliminar sección">
                            <X size={14} />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {section.blocks.map((block, bi) => {
                          const def = metricById[block.metric_id];
                          const view = def ? blockView(def) : null;
                          const label = def?.name ?? block.metric_id;
                          const hasValue = view != null && view.current != null;
                          const controls = (
                            <div className="absolute right-2 top-2 flex items-center gap-0.5">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={bi === 0} onClick={() => moveBlock(si, bi, -1)} title="Mover arriba" aria-label="Mover métrica arriba">
                                <ChevronUp size={12} />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={bi === section.blocks.length - 1} onClick={() => moveBlock(si, bi, 1)} title="Mover abajo" aria-label="Mover métrica abajo">
                                <ChevronDown size={12} />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive-dark" onClick={() => removeBlock(si, bi)} title="Quitar" aria-label={`Quitar ${label}`}>
                                <X size={12} />
                              </Button>
                            </div>
                          );
                          return hasValue ? (
                            <div key={bi} className="relative rounded-lg border border-border bg-card p-4 min-w-0">
                              <div className="flex min-w-0 flex-col gap-2 pr-16">
                                <span className="text-xs text-muted-foreground truncate">{label}</span>
                                <span className="text-2xl font-medium tracking-tight tabular-nums">
                                  {formatCardValue(view.current, def?.unit ?? null)}
                                </span>
                                {view.change != null && (
                                  <span className="text-xs text-muted-foreground">
                                    {view.change === 0
                                      ? `Sin variación frente a ${prevMonthName}`
                                      : `${view.change > 0 ? "Sube" : "Baja"} ${Math.abs(view.change).toLocaleString("es-AR", { maximumFractionDigits: 1 })}% frente a ${prevMonthName}`}
                                  </span>
                                )}
                              </div>
                              {controls}
                            </div>
                          ) : (
                            <div key={bi} className="relative rounded-lg border border-dashed border-border p-3 pr-16 text-sm text-muted-foreground">
                              <strong className="font-medium text-foreground">{label}</strong>
                              <br />
                              Sin dato en {monthName}. Cargalo en Fuentes para que aparezca.
                              {controls}
                            </div>
                          );
                        })}
                      </div>

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
                    </section>
                  ))}
                </div>

                {is_owner && (
                  <SectionCard
                    title={
                      <span className="flex items-center gap-2">
                        <Share2 size={14} strokeWidth={1.5} className="text-muted-foreground" />
                        Compartir con
                      </span>
                    }
                  >
                    {connections.length === 0 ? (
                      <EmptyState
                        bordered={false}
                        icon={Share2}
                        title="Todavía no tenés conexiones activas con ningún fondo."
                        description="Conectate con un fondo para poder compartirle este reporte."
                        action={{ label: "Ir a Conexiones", onClick: () => navigate("/conexiones") }}
                      />
                    ) : (
                      <div className="divide-y divide-border">
                        {connections.map((c) => (
                          <div key={c.connection_id} className="flex items-center justify-between py-3">
                            <span className="text-sm">{c.counterpart_name}</span>
                            <Switch
                              checked={isShared(c.connection_id)}
                              disabled={sharingId === c.connection_id}
                              onCheckedChange={(checked) => toggleShare(c, checked)}
                              aria-label={`Compartir con ${c.counterpart_name}`}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                )}

                {is_owner && (
                  <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" onClick={addSection}>
                        <Plus size={14} className="mr-1" /> Agregar sección
                      </Button>
                      <Button variant="ghost" onClick={save} disabled={saving}>
                        Guardar borrador
                      </Button>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Button onClick={() => setPublishOpen(true)} disabled={publishing}>
                        Publicar versión {nextVersion}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {missingInputs.length > 0
                          ? `Faltan ${missingInputs.length} ${missingInputs.length === 1 ? "dato" : "datos"} para publicar.`
                          : "Todas las métricas tienen valor."}
                      </span>
                    </div>
                  </footer>
                )}
              </>
            )}
          </>
        )}
      </div>

      <ConfirmationDialog
        open={confirmRemoveSection !== null}
        onOpenChange={(o) => !o && setConfirmRemoveSection(null)}
        title="¿Eliminar esta sección?"
        description={(() => {
          if (confirmRemoveSection === null) return "El cambio se guarda recién cuando apretás Guardar.";
          const target = sections[confirmRemoveSection];
          if (!target || target.blocks.length === 0) return "El cambio se guarda recién cuando apretás Guardar.";
          const label = target.title?.trim() ? `"${target.title}"` : "esta sección";
          return `Se borra ${label} con sus ${target.blocks.length} métrica${target.blocks.length === 1 ? "" : "s"}. El cambio se guarda recién cuando apretás Guardar.`;
        })()}
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={() => {
          if (confirmRemoveSection !== null) removeSection(confirmRemoveSection);
          setConfirmRemoveSection(null);
        }}
      />

      <MetricInfoSheet metric={openInfo} onClose={() => setOpenInfo(null)} history={infoHistory} />

      <ReportAnalyticsSheet open={analyticsOpen} onOpenChange={changeAnalytics} companyId={company_id} reportId={reportId ?? null} connections={connections} />

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
