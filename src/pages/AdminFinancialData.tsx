import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { BackLink } from "@/components/BackLink";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { ImportLogTable } from "@/components/financial/ImportLogTable";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDialog } from "@/components/FormDialog";
import { handleGatewayError } from "@/lib/adminGateway";
import {
  ASSIGN_FINANCIAL_SOURCE_URL,
  LIST_FINANCIAL_SOURCES_URL,
  LIST_FINANCIAL_REPORT_STATUS_URL,
  LIST_FINANCIAL_IMPORT_LOG_URL,
  LIST_FINANCIAL_RECORDS_URL,
  LIST_FINANCIAL_METRICS_URL,
  currentPeriod,
  type ReportStatus,
  type ImportLogEntry,
  type FinancialMetricDef,
  type FinancialRecordRow,
} from "@/lib/financialData";
import { toast } from "sonner";
import { CheckCircle2, Clock, AlertCircle, History, Building2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/apiConfig";

const LIST_COMPANIES_URL = `${API_BASE_URL}/list-companies`;

type Company = { company_id: string; name: string; is_active: boolean };

// Fuentes que un admin puede habilitar por company. "stripe" no está acá
// todavía a propósito: la integración de Stripe en Settings > Integraciones
// todavía no escribe en el módulo financiero de GCP (ver memoria de
// "stale integrations"), así que exponer el toggle sería prometer algo que
// no hace nada. Agregarlo en cuanto esté realmente wireado.
const AVAILABLE_SOURCES: { id: string; label: string }[] = [
  { id: "manual_form", label: "Formulario manual" },
  { id: "sheet", label: "Google Sheets" },
];

const STATUS_CONFIG: Record<ReportStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  reportado: { label: "Reportado", cls: "text-foreground", Icon: CheckCircle2 },
  pendiente: { label: "Pendiente", cls: "text-muted-foreground", Icon: Clock },
  con_errores: { label: "Con errores", cls: "text-destructive", Icon: AlertCircle },
};

export default function AdminFinancialData() {
  const { isAdmin, loading } = useAuth();

  const [period, setPeriod] = useState(currentPeriod());
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [statuses, setStatuses] = useState<Record<string, ReportStatus>>({});
  const [loadingStatuses, setLoadingStatuses] = useState(true);
  const [sources, setSources] = useState<Record<string, string[]>>({});
  const [loadingSources, setLoadingSources] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const res = await fetch(LIST_COMPANIES_URL, { credentials: "include" });
      if (await handleGatewayError(res)) throw new Error("No se pudo cargar empresas");
      const data = await res.json();
      return (data.companies ?? []) as Company[];
    },
    enabled: isAdmin,
  });

  const loadStatuses = async () => {
    setLoadingStatuses(true);
    try {
      const params = new URLSearchParams({ period });
      if (companyFilter !== "all") params.set("company_id", companyFilter);
      const res = await fetch(`${LIST_FINANCIAL_REPORT_STATUS_URL}?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        setStatuses({});
        return;
      }
      const data = await res.json();
      const list: { company_id: string; status: ReportStatus }[] = Array.isArray(data?.statuses) ? data.statuses : [];
      setStatuses(Object.fromEntries(list.map((s) => [s.company_id, s.status])));
    } catch {
      setStatuses({});
    } finally {
      setLoadingStatuses(false);
    }
  };

  const loadSources = async () => {
    setLoadingSources(true);
    try {
      const res = await fetch(LIST_FINANCIAL_SOURCES_URL, { credentials: "include" });
      if (!res.ok) {
        setSources({});
        return;
      }
      const data = await res.json();
      const list: { company_id: string; sources: string[] }[] = Array.isArray(data?.sources) ? data.sources : [];
      setSources(Object.fromEntries(list.map((s) => [s.company_id, s.sources])));
    } catch {
      setSources({});
    } finally {
      setLoadingSources(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, period, companyFilter]);

  useEffect(() => {
    if (!isAdmin) return;
    loadSources();
  }, [isAdmin]);

  // assign-source reemplaza el set completo de fuentes de la company, así
  // que cada toggle tiene que mandar manual_form + sheet (+ lo que siga)
  // juntos, no solo la que se tocó — si no, prender Sheets apagaría
  // Formulario manual sin querer.
  const assignSource = async (company_id: string, source: string, enable: boolean) => {
    const current = sources[company_id] ?? [];
    const next = enable ? Array.from(new Set([...current, source])) : current.filter((s) => s !== source);
    const label = AVAILABLE_SOURCES.find((s) => s.id === source)?.label ?? source;
    setAssigningId(company_id);
    try {
      const res = await fetch(ASSIGN_FINANCIAL_SOURCE_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id, sources: next }),
      });
      if (await handleGatewayError(res)) return;
      setSources((s) => ({ ...s, [company_id]: next }));
      toast.success(`${label} ${enable ? "habilitado" : "deshabilitado"}`);
    } catch {
      toast.error("No se pudo actualizar");
    } finally {
      setAssigningId(null);
    }
  };

  const [historyCompany, setHistoryCompany] = useState<Company | null>(null);
  const [historyLogs, setHistoryLogs] = useState<ImportLogEntry[]>([]);
  const [historyRecords, setHistoryRecords] = useState<FinancialRecordRow[]>([]);
  const [historyMetricDefs, setHistoryMetricDefs] = useState<FinancialMetricDef[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const openHistory = async (c: Company) => {
    setHistoryCompany(c);
    setLoadingHistory(true);
    try {
      const qs = `?company_id=${encodeURIComponent(c.company_id)}`;
      const [logsRes, recordsRes, metricsRes] = await Promise.all([
        fetch(`${LIST_FINANCIAL_IMPORT_LOG_URL}${qs}`, { credentials: "include" }),
        fetch(`${LIST_FINANCIAL_RECORDS_URL}${qs}`, { credentials: "include" }),
        fetch(`${LIST_FINANCIAL_METRICS_URL}${qs}`, { credentials: "include" }),
      ]);
      const logsData = logsRes.ok ? await logsRes.json() : null;
      setHistoryLogs(Array.isArray(logsData?.logs) ? logsData.logs : []);
      const recordsData = recordsRes.ok ? await recordsRes.json() : null;
      setHistoryRecords(Array.isArray(recordsData?.records) ? recordsData.records : []);
      const metricsData = metricsRes.ok ? await metricsRes.json() : null;
      setHistoryMetricDefs(Array.isArray(metricsData?.metrics) ? metricsData.metrics : []);
    } catch {
      setHistoryLogs([]);
      setHistoryRecords([]);
      setHistoryMetricDefs([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Columnas 100% dinámicas: cualquier input_key que tenga al menos un valor
  // cargado se muestra, custom o del catálogo default de Acquisition/
  // Retention incluidos — no solo los 8 campos originales. El label sale de
  // la métrica actual con ese input_key; si ya no existe (renombrada o
  // borrada), se muestra el campo crudo tal cual para no ocultar datos.
  const historyColumns = useMemo(() => {
    const labelByKey = new Map<string, string>();
    for (const def of historyMetricDefs) {
      if (def.metric_type === "input" && def.input_key) labelByKey.set(def.input_key, def.name);
    }
    const keysWithData = new Set<string>();
    for (const r of historyRecords) {
      for (const [key, value] of Object.entries(r)) {
        if (key === "period" || value == null) continue;
        keysWithData.add(key);
      }
    }
    return Array.from(keysWithData).map((key) => ({ key, label: labelByKey.get(key) ?? key }));
  }, [historyMetricDefs, historyRecords]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-8 py-12">
        <BackLink to="/admin" label="Volver a Ecosistema CloudValley" className="mb-6" />
        <PageHeader title="Datos financieros" subtitle="Seguimiento de reportes mensuales del portfolio." />

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div>
            <Label className="text-xs">Período</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 h-9 w-40" />
          </div>
          <div>
            <Label className="text-xs">Empresa</Label>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="mt-1 w-56 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.company_id} value={c.company_id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loadingStatuses ? (
          <LoadingState />
        ) : (
          <DataTable
            columns={[
              { header: "Empresa", cell: (c: Company) => <span className="font-medium">{c.name}</span> },
              {
                header: `Estado (${period})`,
                cell: (c: Company) => {
                  const status = statuses[c.company_id];
                  if (!status) return <span className="text-xs text-muted-foreground">Sin datos</span>;
                  const cfg = STATUS_CONFIG[status];
                  const Icon = cfg.Icon;
                  return (
                    <span className={`inline-flex items-center gap-1 text-xs ${cfg.cls}`}>
                      <Icon size={12} strokeWidth={1.5} /> {cfg.label}
                    </span>
                  );
                },
              },
              {
                header: "Fuentes habilitadas",
                cell: (c: Company) => (
                  <div className="flex flex-col gap-1.5">
                    {AVAILABLE_SOURCES.map((src) => (
                      <label key={src.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Switch
                          checked={(sources[c.company_id] ?? []).includes(src.id)}
                          disabled={loadingSources || assigningId === c.company_id}
                          onCheckedChange={(checked) => assignSource(c.company_id, src.id, checked)}
                        />
                        {src.label}
                      </label>
                    ))}
                    {loadingSources && <LoadingState variant="inline" className="text-xs" />}
                  </div>
                ),
              },
              {
                header: "Acciones",
                align: "right",
                cell: (c: Company) => (
                  <Button size="sm" variant="ghost" onClick={() => openHistory(c)}>
                    <History size={12} className="mr-1" /> Historial
                  </Button>
                ),
              },
            ]}
            rows={companyFilter === "all" ? companies : companies.filter((c) => c.company_id === companyFilter)}
            rowKey={(c) => c.company_id}
            emptyLabel={
              <EmptyState bordered={false} icon={Building2} title="No hay empresas todavía." />
            }
          />
        )}
      </div>

      <FormDialog
        open={!!historyCompany}
        onOpenChange={(o) => !o && setHistoryCompany(null)}
        title={`Historial de ${historyCompany?.name}`}
        contentClassName="sm:max-w-3xl"
        footer={
          <Button variant="ghost" onClick={() => setHistoryCompany(null)}>
            Cerrar
          </Button>
        }
      >
        {loadingHistory ? (
          <LoadingState />
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3">Valores reportados</h3>
              {historyRecords.length === 0 ? (
                <div className="border border-border rounded-lg p-6 text-center text-sm text-muted-foreground bg-card">
                  Todavía no hay ningún valor cargado.
                </div>
              ) : (
                <div className="border border-border rounded-lg bg-card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border">
                        <th className="text-left font-normal px-4 py-2.5">Período</th>
                        {historyColumns.map((col) => (
                          <th key={col.key} className="text-right font-normal px-3 py-2.5 whitespace-nowrap">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {historyRecords
                        .slice()
                        .sort((a, b) => (a.period < b.period ? 1 : -1))
                        .map((r) => (
                          <tr key={r.period} className="border-b border-border/50 last:border-0">
                            <td className="px-4 py-2 font-medium whitespace-nowrap">{r.period}</td>
                            {historyColumns.map((col) => (
                              <td key={col.key} className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                {r[col.key] != null ? r[col.key]!.toLocaleString() : "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3">Intentos de carga</h3>
              <ImportLogTable logs={historyLogs} emptyLabel="Todavía no reportó ningún dato." />
            </div>
          </div>
        )}
      </FormDialog>
    </AppLayout>
  );
}
