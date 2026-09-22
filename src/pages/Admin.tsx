import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/lib/apiConfig";
import { LIST_ALL_CONNECTIONS_URL, type AdminConnection } from "@/lib/connections";
import { LIST_FINANCIAL_REPORT_STATUS_URL, currentPeriod, type ReportStatusEntry } from "@/lib/financialData";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Compass, Download, FileBarChart } from "lucide-react";

// Reemplaza la tabla duplicada de empresas que tenía esta pantalla antes de
// 2026-09-21 (Fase 9 del plan de Admin) — ese listado ya vive, completo y
// con acciones reales, en AdminCompanies.tsx. InviteSection (el link crudo
// sin vencimiento) también se retira acá: AdminUsers.tsx ya tiene el flujo
// correcto ("Generar link de invitación", con expires_at real).
const LIST_PLATFORM_KPIS_URL = `${API_BASE_URL}/list-platform-kpis`;
const LIST_GLOBAL_ACTIVITY_URL = `${API_BASE_URL}/list-global-activity`;

type PlatformKpis = {
  counts: { active_companies: number; active_funds: number; active_users: number };
  deltas: { active_companies: number | null; active_funds: number | null; active_users: number | null };
  compared_to_date: string | null;
};

type GlobalActivityEvent = {
  event_id: string;
  type: string;
  occurred_at: string;
  org_id: string;
  org_name: string;
  org_type: "company" | "fund" | null;
  summary: string;
};

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">Sin comparación todavía</span>;
  if (value === 0) return <span className="text-xs text-muted-foreground">Sin cambios</span>;
  return (
    <span className={`text-xs ${value > 0 ? "text-success-dark" : "text-destructive-dark"}`}>
      {value > 0 ? "+" : ""}
      {value} este mes
    </span>
  );
}

export default function Admin() {
  const { isAdmin, loading } = useAuth();

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ["admin-platform-kpis"],
    queryFn: async () => {
      const res = await fetch(LIST_PLATFORM_KPIS_URL, { credentials: "include" });
      if (!res.ok) return null;
      return (await res.json()) as PlatformKpis;
    },
    enabled: isAdmin,
  });

  const { data: activity = [], isLoading: activityLoading } = useQuery({
    queryKey: ["admin-global-activity"],
    queryFn: async () => {
      const res = await fetch(`${LIST_GLOBAL_ACTIVITY_URL}?page_size=8`, { credentials: "include" });
      if (!res.ok) return [] as GlobalActivityEvent[];
      const data = await res.json();
      return Array.isArray(data?.events) ? (data.events as GlobalActivityEvent[]) : [];
    },
    enabled: isAdmin,
  });

  // "Necesita atención" — 2 señales reales, sin inventar una tercera que no
  // se pueda respaldar con datos (ver plan: "sin actividad reciente" se
  // dejó afuera a propósito, no hay endpoint de "última actividad por org"
  // todavía).
  const { data: erroredCompanies = [] } = useQuery({
    queryKey: ["admin-financial-errors", currentPeriod()],
    queryFn: async () => {
      const res = await fetch(`${LIST_FINANCIAL_REPORT_STATUS_URL}?period=${currentPeriod()}`, { credentials: "include" });
      if (!res.ok) return [] as ReportStatusEntry[];
      const data = await res.json();
      const list: ReportStatusEntry[] = Array.isArray(data?.statuses) ? data.statuses : [];
      return list.filter((s) => s.status === "con_errores");
    },
    enabled: isAdmin,
  });

  const { data: connections = [] } = useQuery({
    queryKey: ["admin-all-connections-pending"],
    queryFn: async () => {
      const res = await fetch(`${LIST_ALL_CONNECTIONS_URL}?status=pending`, { credentials: "include" });
      if (!res.ok) return [] as AdminConnection[];
      const data = await res.json();
      return Array.isArray(data?.connections) ? (data.connections as AdminConnection[]) : [];
    },
    enabled: isAdmin,
  });
  const stalePending = connections.filter((c) => daysAgo(c.created_at) >= 7);

  const exportCsv = () => {
    if (!kpis) return;
    const lines = [
      "métrica,valor",
      `Startups activas,${kpis.counts.active_companies}`,
      `Fondos activos,${kpis.counts.active_funds}`,
      `Usuarios activos,${kpis.counts.active_users}`,
      `Conexiones pendientes,${connections.length}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ecosistema-cloudvalley-${currentPeriod()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-6">
        <PageHeader
          title="Ecosistema CloudValley"
          subtitle="Salud agregada de la plataforma."
          action={
            <Button variant="outline" onClick={exportCsv} disabled={!kpis}>
              <Download size={13} strokeWidth={1.5} className="mr-1.5" /> Exportar CSV
            </Button>
          }
        />

        {kpisLoading ? (
          <LoadingState variant="centered" className="py-8" />
        ) : !kpis ? (
          <EmptyState icon={Compass} title="No se pudieron cargar los KPIs." description="Reintentá en unos minutos." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-border rounded-lg bg-card p-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Startups activas</p>
              <p className="text-2xl font-medium mt-1">{kpis.counts.active_companies}</p>
              <div className="mt-1"><Delta value={kpis.deltas.active_companies} /></div>
            </div>
            <div className="border border-border rounded-lg bg-card p-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Fondos activos</p>
              <p className="text-2xl font-medium mt-1">{kpis.counts.active_funds}</p>
              <div className="mt-1"><Delta value={kpis.deltas.active_funds} /></div>
            </div>
            <div className="border border-border rounded-lg bg-card p-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Usuarios activos</p>
              <p className="text-2xl font-medium mt-1">{kpis.counts.active_users}</p>
              <div className="mt-1"><Delta value={kpis.deltas.active_users} /></div>
            </div>
            <Link to="/admin/connections" className="border border-border rounded-lg bg-card p-4 hover:border-foreground/30 transition-colors">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Conexiones pendientes</p>
              <p className="text-2xl font-medium mt-1 text-warning-dark">{connections.length}</p>
              {stalePending.length > 0 && (
                <p className="text-xs text-warning-dark mt-1">{stalePending.length} hace &gt;7 días</p>
              )}
            </Link>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <SectionCard
            padding="sm"
            title={
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={13} strokeWidth={1.5} aria-hidden="true" /> Necesita atención
              </span>
            }
          >
            {erroredCompanies.length === 0 && stalePending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada necesita atención ahora.</p>
            ) : (
              <div className="space-y-1">
                {erroredCompanies.slice(0, 5).map((s) => (
                  <Link
                    key={s.company_id}
                    to={`/admin/startup/${s.company_id}`}
                    className="w-full flex items-center justify-between gap-2 py-1.5 text-sm hover:underline"
                  >
                    <span className="truncate">{s.company_name} — import financiero falló</span>
                    <span className="text-xs text-destructive-dark shrink-0">Con errores</span>
                  </Link>
                ))}
                {stalePending.slice(0, 5).map((c) => (
                  <Link
                    key={c.connection_id}
                    to="/admin/connections"
                    className="w-full flex items-center justify-between gap-2 py-1.5 text-sm hover:underline"
                  >
                    <span className="truncate">{c.company_name} pidió conectar con {c.fund_name}</span>
                    <span className="text-xs text-warning-dark shrink-0">Hace {daysAgo(c.created_at)} días</span>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            padding="sm"
            title={
              <span className="flex items-center gap-1.5">
                <FileBarChart size={13} strokeWidth={1.5} aria-hidden="true" /> Actividad reciente
              </span>
            }
          >
            {activityLoading ? (
              <LoadingState variant="inline" />
            ) : activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin actividad reciente.</p>
            ) : (
              <div className="space-y-1">
                {activity.map((e) => (
                  <Link
                    key={e.event_id}
                    to={e.org_type === "fund" ? `/admin/funds/${e.org_id}` : `/admin/startup/${e.org_id}`}
                    className="w-full flex items-center justify-between gap-2 py-1.5 text-sm hover:underline"
                  >
                    <span className="truncate">{e.summary}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(e.occurred_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </AppLayout>
  );
}
