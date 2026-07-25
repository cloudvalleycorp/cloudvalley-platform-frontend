import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { LoadingState } from "@/components/LoadingState";
import { ImportLogTable } from "@/components/financial/ImportLogTable";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { handleMembershipError } from "@/lib/membership";
import {
  SUBMIT_FINANCIAL_RECORD_URL,
  LIST_FINANCIAL_IMPORT_LOG_URL,
  METRIC_LABELS,
  currentPeriod,
  type FinancialMetricKey,
  type FinancialMetrics,
  type ImportLogEntry,
  type SubmitFinancialRecordResponse,
} from "@/lib/financialData";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle } from "lucide-react";

const METRIC_KEYS = Object.keys(METRIC_LABELS) as FinancialMetricKey[];

export default function FinancialData() {
  const { user, loading, role, company_id, email } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [reopen, setReopen] = useState(false);

  const [period, setPeriod] = useState(currentPeriod());
  const [values, setValues] = useState<Record<FinancialMetricKey, string>>({
    revenue: "",
    new_mrr: "",
    churned_mrr: "",
    cash_balance: "",
    monthly_burn: "",
    headcount: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitFinancialRecordResponse | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);

  const [logs, setLogs] = useState<ImportLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const loadLogs = async () => {
    if (!company_id) return;
    setLoadingLogs(true);
    try {
      const res = await fetch(`${LIST_FINANCIAL_IMPORT_LOG_URL}?company_id=${encodeURIComponent(company_id)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setLogs([]);
        return;
      }
      const data = await res.json();
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch {
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company_id]);

  const submit = async () => {
    if (!company_id) return;
    const body: { company_id: string; period: string } & FinancialMetrics = { company_id, period };
    for (const key of METRIC_KEYS) {
      const raw = values[key].trim();
      if (raw !== "") body[key] = Number(raw);
    }
    setSubmitting(true);
    setResult(null);
    setNotEnabled(false);
    try {
      const res = await fetch(SUBMIT_FINANCIAL_RECORD_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        const msg: string = data?.error ?? "";
        if (/manual_form/i.test(msg) || /habilitad/i.test(msg)) {
          setNotEnabled(true);
        } else {
          toast.error(msg || "Solicitud inválida");
        }
        return;
      }
      if (await handleMembershipError(res)) return;
      const data = (await res.json()) as SubmitFinancialRecordResponse;
      setResult(data);
      toast.success(`Datos guardados para ${data.period}`);
      loadLogs();
    } catch {
      toast.error("No se pudieron guardar los datos");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (role !== "user") return <Navigate to="/dashboard" replace />;

  if (!company_id) {
    if (!dismissed || reopen) {
      return (
        <AppLayout>
          <NoMembershipScreen
            role="user"
            email={email}
            onDismiss={() => {
              setDismissed(true);
              setReopen(false);
            }}
          />
        </AppLayout>
      );
    }
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto px-8 py-12">
          <NoMembershipBanner role="user" onOpen={() => setReopen(true)} />
          <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card">
            No hay nada para reportar hasta que te unas a una startup.
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-8 py-12 space-y-8">
        <PageHeader title="Datos financieros" subtitle="Reportá los números del mes para que el fondo haga seguimiento." />

        <section className="border border-border rounded-lg p-6 bg-card space-y-4">
          <div>
            <Label className="text-xs">Período</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 w-40" />
          </div>

          {notEnabled ? (
            <div className="border border-border rounded-lg p-4 text-sm text-muted-foreground bg-surface">
              Todavía no tenés el formulario manual habilitado para reportar datos financieros. Pedile a CloudValley
              que lo active para tu startup.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                {METRIC_KEYS.map((key) => (
                  <div key={key}>
                    <Label className="text-xs">
                      {METRIC_LABELS[key].label}
                      {METRIC_LABELS[key].unit && ` (${METRIC_LABELS[key].unit})`}
                    </Label>
                    <Input
                      type="number"
                      value={values[key]}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                      placeholder="Opcional"
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Completá solo los campos que tengas — todos son opcionales.</p>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Guardando…" : "Guardar"}
              </Button>
            </>
          )}

          {result && (
            <div className="border border-border rounded-lg p-4 bg-surface space-y-2">
              <div className="flex items-center gap-1.5 text-sm">
                <CheckCircle2 size={14} strokeWidth={1.5} className="text-muted-foreground" />
                Quedó registrado para <span className="font-medium">{result.period}</span> — {result.rows_processed}{" "}
                campo{result.rows_processed === 1 ? "" : "s"} guardado{result.rows_processed === 1 ? "" : "s"}.
              </div>
              {result.row_errors.length > 0 && (
                <ul className="space-y-1 pt-2 border-t border-border/50">
                  {result.row_errors.map((e, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                      <AlertCircle size={12} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                      <span>
                        <span className="font-medium">{METRIC_LABELS[e.field as FinancialMetricKey]?.label ?? e.field}</span>: {e.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3">Historial de cargas</h3>
          {loadingLogs ? <LoadingState /> : <ImportLogTable logs={logs} emptyLabel="Todavía no reportaste ningún dato." />}
        </section>
      </div>
    </AppLayout>
  );
}
