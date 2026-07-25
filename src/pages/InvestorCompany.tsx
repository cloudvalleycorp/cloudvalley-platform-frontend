import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { BackLink } from "@/components/BackLink";
import { PageHeader } from "@/components/PageHeader";
import { StageBadge } from "@/components/StageBadge";
import { useConnectedCompanyMetrics } from "@/hooks/useConnectedCompanyMetrics";
import { LoadingState } from "@/components/LoadingState";
import { CalculatedMetricsGrid } from "@/components/metrics/CalculatedMetricsGrid";
import { MetricInfoSheet, type MetricHistoryPoint } from "@/components/metrics/MetricInfoSheet";
import { evalFormula, type MetricDef, type InputsMap } from "@/lib/metrics";
import { periodKey, prevMonth } from "@/lib/metricPeriod";
import { Info } from "lucide-react";

const GET_COMPANY_PROFILE_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/get-company-profile";

const CATEGORY_LABELS: Record<string, string> = {
  revenue: "Revenue",
  cash_efficiency: "Cash & Efficiency",
};

const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
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

  const metrics = useConnectedCompanyMetrics(company_id ?? null);
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [openInfo, setOpenInfo] = useState<MetricDef | null>(null);

  const allInputDefs = useMemo(() => metrics.metrics.filter((m) => m.metric_type === "input"), [metrics.metrics]);
  const categoriesPresent = useMemo(
    () => Array.from(new Set(metrics.metrics.map((m) => m.category))),
    [metrics.metrics]
  );

  const inputsForPeriod = (m: number, y: number): InputsMap => {
    const result: InputsMap = {};
    const pk = periodKey(m, y);
    for (const def of allInputDefs) {
      if (!def.input_key) continue;
      const v = metrics.entries[def.id]?.[pk];
      if (v !== undefined) result[def.input_key] = v;
    }
    return result;
  };

  const currentInputs = inputsForPeriod(period.month, period.year);
  const prev = prevMonth(period.month, period.year);
  const prevInputs = inputsForPeriod(prev.m, prev.y);

  const historyInputs = useMemo(() => {
    const arr: InputsMap[] = [];
    let m = period.month, y = period.year;
    for (let i = 0; i < 6; i++) {
      arr.unshift(inputsForPeriod(m, y));
      const p = prevMonth(m, y);
      m = p.m;
      y = p.y;
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics.entries, period, allInputDefs]);

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
        v = evalFormula(openInfo.formula_expression, inputsForPeriod(m, y));
      }
      if (v !== null && v !== undefined) out.unshift({ year: y, month: m, value: v });
      const p = prevMonth(m, y);
      m = p.m;
      y = p.y;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInfo, metrics.entries]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isOrgViewer) return <Navigate to="/dashboard" replace />;

  const idx = portfolio_company_ids.findIndex((id) => id === company_id);
  const name = idx >= 0 ? portfolio_company_names[idx] : null;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-8 py-12">
        <BackLink to="/portfolio" label="Volver al portfolio" className="mb-6" />
        {name === null ? (
          <div className="text-sm text-muted-foreground">
            Esta empresa no forma parte del portfolio de {fund_name ?? "tu fondo"}.
          </div>
        ) : status === "loading" ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
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
                  <div className="flex items-center gap-3 mt-1">
                    <StageBadge stage={profile.stage} />
                    {profile.business_model && (
                      <span className="capitalize">{profile.business_model.replace("_", " ")}</span>
                    )}
                    {profile.industry && <span>{profile.industry}</span>}
                  </div>
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
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-sm font-medium">Métricas</h2>
                  <select
                    value={`${period.year}-${period.month}`}
                    onChange={(e) => {
                      const [y, m] = e.target.value.split("-").map(Number);
                      setPeriod({ month: m, year: y });
                    }}
                    className="border border-border rounded-md px-3 py-1.5 text-sm bg-background h-9"
                  >
                    {Array.from({ length: 12 }, (_, i) => {
                      const d = new Date(now.getFullYear(), now.getMonth() - i);
                      return (
                        <option key={i} value={`${d.getFullYear()}-${d.getMonth() + 1}`}>
                          {months[d.getMonth()]} {d.getFullYear()}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {metrics.loading ? (
                  <LoadingState />
                ) : metrics.forbidden || metrics.metrics.length === 0 ? (
                  <div className="border border-border rounded-lg p-8 text-center text-sm text-muted-foreground bg-card">
                    {profile.name} no compartió ninguna métrica pública todavía.
                  </div>
                ) : (
                  <div className="space-y-10">
                    {categoriesPresent.map((cat) => {
                      const inputDefs = metrics.metrics.filter((m) => m.metric_type === "input" && m.category === cat);
                      const calcDefs = metrics.metrics.filter((m) => m.metric_type === "calculated" && m.category === cat);
                      return (
                        <div key={cat} className="space-y-6">
                          <h3 className="text-xs font-medium text-foreground uppercase tracking-wide">
                            {CATEGORY_LABELS[cat] ?? cat}
                          </h3>

                          {inputDefs.length > 0 && (
                            <div className="border border-border rounded-lg bg-card overflow-hidden">
                              <div className="divide-y divide-border">
                                {inputDefs.map((m) => (
                                  <div key={m.id} className="flex items-center justify-between px-5 py-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-sm">{m.name}</span>
                                      {m.unit && <span className="text-xs text-muted-foreground">({m.unit})</span>}
                                      <button
                                        onClick={() => setOpenInfo(m)}
                                        className="text-muted-foreground hover:text-foreground"
                                        aria-label={`Info sobre ${m.name}`}
                                      >
                                        <Info size={14} strokeWidth={1.5} />
                                      </button>
                                    </div>
                                    <span className="text-sm font-medium">
                                      {m.input_key && currentInputs[m.input_key] !== undefined
                                        ? currentInputs[m.input_key].toLocaleString()
                                        : "—"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {calcDefs.length > 0 && (
                            <CalculatedMetricsGrid
                              metrics={calcDefs}
                              currentInputs={currentInputs}
                              prevInputs={prevInputs}
                              historyInputs={historyInputs}
                              inputDefs={allInputDefs}
                              onInfo={setOpenInfo}
                              readOnly
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )
        )}
      </div>

      <MetricInfoSheet metric={openInfo} onClose={() => setOpenInfo(null)} history={infoHistory} />
    </AppLayout>
  );
}
