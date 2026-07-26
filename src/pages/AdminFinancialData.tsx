import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
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
  METRIC_LABELS,
  currentPeriod,
  type ReportStatus,
  type ImportLogEntry,
  type FinancialMetricKey,
  type FinancialRecordRow,
} from "@/lib/financialData";
import { toast } from "sonner";
import { CheckCircle2, Clock, AlertCircle, History, Building2 } from "lucide-react";

const LIST_COMPANIES_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-companies";

type Company = { company_id: string; name: string; is_active: boolean };

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

  const assign = async (company_id: string, enable: boolean) => {
    setAssigningId(company_id);
    try {
      const res = await fetch(ASSIGN_FINANCIAL_SOURCE_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id, sources: enable ? ["manual_form"] : [] }),
      });
      if (await handleGatewayError(res)) return;
      setSources((s) => ({ ...s, [company_id]: enable ? ["manual_form"] : [] }));
      toast.success(enable ? "Formulario manual habilitado" : "Formulario manual deshabilitado");
    } catch {
      toast.error("No se pudo actualizar");
    } finally {
      setAssigningId(null);
    }
  };

  const [historyCompany, setHistoryCompany] = useState<Company | null>(null);
  const [historyLogs, setHistoryLogs] = useState<ImportLogEntry[]>([]);
  const [historyRecords, setHistoryRecords] = useState<FinancialRecordRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const openHistory = async (c: Company) => {
    setHistoryCompany(c);
    setLoadingHistory(true);
    try {
      const qs = `?company_id=${encodeURIComponent(c.company_id)}`;
      const [logsRes, recordsRes] = await Promise.all([
        fetch(`${LIST_FINANCIAL_IMPORT_LOG_URL}${qs}`, { credentials: "include" }),
        fetch(`${LIST_FINANCIAL_RECORDS_URL}${qs}`, { credentials: "include" }),
      ]);
      const logsData = logsRes.ok ? await logsRes.json() : null;
      setHistoryLogs(Array.isArray(logsData?.logs) ? logsData.logs : []);
      const recordsData = recordsRes.ok ? await recordsRes.json() : null;
      setHistoryRecords(Array.isArray(recordsData?.records) ? recordsData.records : []);
    } catch {
      setHistoryLogs([]);
      setHistoryRecords([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const historyMetricKeys = (Object.keys(METRIC_LABELS) as FinancialMetricKey[]).filter((key) =>
    historyRecords.some((r) => r[key] != null)
  );

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-8 py-12">
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
                header: "Formulario manual",
                cell: (c: Company) => (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={(sources[c.company_id] ?? []).includes("manual_form")}
                      disabled={loadingSources || assigningId === c.company_id}
                      onCheckedChange={(checked) => assign(c.company_id, checked)}
                    />
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
                        {historyMetricKeys.map((key) => (
                          <th key={key} className="text-right font-normal px-3 py-2.5 whitespace-nowrap">
                            {METRIC_LABELS[key].label}
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
                            {historyMetricKeys.map((key) => (
                              <td key={key} className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                {r[key] != null ? r[key]!.toLocaleString() : "—"}
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
