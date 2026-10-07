import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { DataTableToolbar } from "@/components/DataTableToolbar";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { handleMembershipError } from "@/lib/membership";
import {
  CREATE_FINANCIAL_REPORT_URL,
  LIST_FINANCIAL_REPORTS_URL,
  DELETE_FINANCIAL_REPORT_URL,
  LIST_FINANCIAL_REPORT_SHARES_URL,
  type ReportSummary,
  type ReportShare,
} from "@/lib/financialReports";
import { MONTH_LABELS, toPeriodString } from "@/lib/metricPeriod";
import { PeriodSelect } from "@/components/metrics/PeriodSelect";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Plus, FileText, Pencil, Trash2, Search } from "lucide-react";
import InvestorReporting from "@/pages/InvestorReporting";

const now = new Date();

const ESTADO_FILTROS = [
  { value: "todos", label: "Todos" },
  { value: "compartidos", label: "Compartidos" },
  { value: "borradores", label: "Borradores" },
] as const;
type EstadoFiltro = (typeof ESTADO_FILTROS)[number]["value"];

// Estado que viene del backend: nunca publicado = Borrador; publicado con
// cambios después = Cambios sin publicar; publicado y al día = Publicado vN.
function ReportStatusPill({ report }: { report: ReportSummary }) {
  const version = report.published_version ?? null;
  const pending = version != null && report.has_unpublished_changes === true;
  const label = version == null ? "Borrador" : pending ? "Cambios sin publicar" : `Publicado v${version}`;
  const tone =
    version == null
      ? "bg-muted-foreground text-background"
      : pending
        ? "bg-warning text-warning-foreground"
        : "bg-success text-success-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0", tone)}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

const MONTHS_LONG_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Período con mes completo y mayúscula inicial, como en el mockup: "Abril 2026".
function formatReportPeriodLong(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const name = MONTHS_LONG_ES[m - 1] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

function longDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} de ${MONTHS_LONG_ES[d.getMonth()]}`;
}

function relativeAgo(iso: string): string {
  const diffMin = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 2) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

// Línea de datos de la fila, con el texto del mockup aprobado. shareCount null
// = no mostrar nada de compartidos (no es dueño).
function reportMeta(r: ReportSummary, shareCount: number | null): string {
  if (!r.period) return "Sin período definido. Fijá un mes para que el reporte no cambie solo.";
  const period = formatReportPeriodLong(r.period);
  const shared = shareCount == null ? null : shareCount > 0 ? `${shareCount} ${shareCount === 1 ? "fondo" : "fondos"}` : null;
  const parts: string[] = [period];
  if (r.published_version == null) {
    parts.push(`Borrador guardado ${relativeAgo(r.updated_at)}`);
  } else if (r.has_unpublished_changes) {
    parts.push(`Editado ${relativeAgo(r.updated_at)}`);
    parts.push(`Publicado v${r.published_version}${shared ? `, compartido con ${shared}` : ""}`);
  } else {
    parts.push(r.last_published_at ? `Publicado el ${longDate(r.last_published_at)}` : `Publicado v${r.published_version}`);
    if (shareCount != null) parts.push(shared ? `Compartido con ${shared}` : "Sin compartir");
  }
  return parts.join(" · ");
}

export default function Reporting() {
  const { user, loading, role, company_id, email, is_owner } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [reopen, setReopen] = useState(false);

  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [shares, setShares] = useState<ReportShare[]>([]);

  const loadReports = async () => {
    if (!company_id) return;
    setLoadingReports(true);
    try {
      const res = await fetch(`${LIST_FINANCIAL_REPORTS_URL}?company_id=${encodeURIComponent(company_id)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setReports([]);
        return;
      }
      const data = await res.json();
      setReports(Array.isArray(data?.reports) ? data.reports : []);
    } catch {
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  };

  const loadShares = async () => {
    if (!company_id || !is_owner) return;
    try {
      const res = await fetch(`${LIST_FINANCIAL_REPORT_SHARES_URL}?company_id=${encodeURIComponent(company_id)}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      setShares(Array.isArray(data?.shares) ? data.shares : []);
    } catch {
      // silencioso — el conteo de "compartido con" es informativo, no bloquea nada
    }
  };

  useEffect(() => {
    loadReports();
    loadShares();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company_id, is_owner]);

  const shareCountByReport = shares.reduce<Record<string, number>>((acc, s) => {
    acc[s.report_id] = (acc[s.report_id] ?? 0) + 1;
    return acc;
  }, {});

  // Búsqueda y filtro viven en la URL (?q= y ?estado=) para que el enlace
  // reproduzca la vista. Reemplazan la entrada del historial al tipear.
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const rawEstado = searchParams.get("estado");
  const estado: EstadoFiltro = ESTADO_FILTROS.some((o) => o.value === rawEstado)
    ? (rawEstado as EstadoFiltro)
    : "todos";
  const filtering = query.trim() !== "" || estado !== "todos";

  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };
  const clearFilters = () => updateParams({ q: null, estado: null });

  const visibleReports = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (is_owner && estado !== "todos") {
        const shared = (shareCountByReport[r.report_id] ?? 0) > 0;
        if (estado === "compartidos" && !shared) return false;
        // "Borradores" = nunca publicados (el filtro ya no depende de compartir).
        if (estado === "borradores" && r.published_version != null) return false;
      }
      return true;
    });
  }, [reports, query, estado, is_owner, shareCountByReport]);

  const [createOpen, setCreateOpen] = useState(false);

  // Deep link ?nuevo=1: abre el diálogo de creación. Se limpia el parámetro
  // para que una recarga no lo vuelva a abrir.
  // Espera a que is_owner esté resuelto: antes de eso no se sabe si puede crear.
  useEffect(() => {
    if (searchParams.get("nuevo") !== "1" || !is_owner) return;
    setCreateOpen(true);
    updateParams({ nuevo: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, is_owner]);
  const [newName, setNewName] = useState("");
  const [newPeriod, setNewPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [creating, setCreating] = useState(false);

  const createReport = async () => {
    if (!company_id) return;
    if (!newName.trim()) {
      toast.error("Nombre requerido");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(CREATE_FINANCIAL_REPORT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id,
          name: newName.trim(),
          period: toPeriodString(newPeriod.month, newPeriod.year),
        }),
      });
      if (await handleMembershipError(res)) return;
      const data = await res.json();
      toast.success("Reporte creado");
      setCreateOpen(false);
      setNewName("");
      navigate(`/reporting/${data.report_id}`);
    } catch {
      toast.error("No se pudo crear el reporte");
    } finally {
      setCreating(false);
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<ReportSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deleteReport = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(DELETE_FINANCIAL_REPORT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: deleteTarget.report_id }),
      });
      if (await handleMembershipError(res)) return;
      toast.success("Reporte eliminado");
      setReports((rs) => rs.filter((r) => r.report_id !== deleteTarget.report_id));
      setDeleteTarget(null);
    } catch {
      toast.error("No se pudo eliminar el reporte");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // Rediseño Investor (2026-08-23): misma ruta /reporting, role-branched —
  // mismo criterio que Connections.tsx. Va después de todos los hooks de
  // arriba (rules-of-hooks) — cero cambios al resto de este archivo, que
  // sigue siendo 100% la experiencia del founder.
  if (role === "investor") return <InvestorReporting />;
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
        <div className="max-w-6xl mx-auto px-8 py-12">
          <NoMembershipBanner role="user" onOpen={() => setReopen(true)} />
          <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card">
            No hay nada para armar hasta que te unas a una startup.
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <PageHeader
          size="compact"
          title="Reporting"
          subtitle="Armá un reporte con las métricas que quieras y compartilo con un fondo puntual."
          action={
            is_owner && (
              <Button className="rounded-lg" onClick={() => setCreateOpen(true)}>
                Nuevo reporte
              </Button>
            )
          }
        />

        {!loadingReports && reports.length > 0 && (
          <>
            <DataTableToolbar
              search={query}
              onSearchChange={(value) => updateParams({ q: value || null })}
              searchPlaceholder="Buscar reporte por nombre"
              filters={
                is_owner ? (
                  <div role="group" aria-label="Filtrar por estado" className="inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5 h-9">
                    {ESTADO_FILTROS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={estado === opt.value}
                        onClick={() => updateParams({ estado: opt.value === "todos" ? null : opt.value })}
                        className={cn(
                          "h-7 px-3 rounded-md text-xs font-medium transition-colors",
                          estado === opt.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ) : undefined
              }
            />
            {filtering && (
              <p aria-live="polite" className="text-xs text-muted-foreground -mt-2 mb-3">
                Mostrando {visibleReports.length} de {reports.length} reportes
              </p>
            )}
          </>
        )}

        {loadingReports ? (
          <LoadingState />
        ) : reports.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Todavía no armaste ningún reporte."
            description="Un reporte agrupa las métricas que elijas para compartir con un fondo puntual."
            action={is_owner ? { label: "Nuevo reporte", onClick: () => setCreateOpen(true) } : undefined}
            secondaryAction={{ label: "Ver Growth Tracker", onClick: () => navigate("/metrics") }}
          />
        ) : visibleReports.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Ningún reporte coincide con la búsqueda."
            description="Probá con otro nombre o cambiá el filtro de estado."
            action={{ label: "Limpiar búsqueda y filtros", onClick: clearFilters }}
          />
        ) : (
          <div className="border border-border rounded-lg bg-card divide-y divide-border overflow-x-auto">
            {visibleReports.map((r) => (
              <div
                key={r.report_id}
                className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-surface/60 transition-colors"
              >
                <Link
                  to={`/reporting/${r.report_id}`}
                  className="flex items-center gap-3 min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium break-words min-w-0">{r.name}</span>
                      {is_owner && <ReportStatusPill report={r} />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {reportMeta(r, is_owner ? (shareCountByReport[r.report_id] ?? 0) : null)}
                    </div>
                  </div>
                </Link>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/reporting/${r.report_id}`);
                    }}
                  >
                    {is_owner && !r.period ? "Fijar periodo" : is_owner ? "Editar" : "Ver"}
                  </Button>
                  {is_owner && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive-dark"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(r);
                      }}
                      aria-label={`Eliminar reporte ${r.name}`}
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nuevo reporte"
        onSubmit={createReport}
        submitLabel={creating ? "Creando…" : "Crear"}
        busy={creating}
      >
        <FormField label="Nombre" htmlFor="new-report-name">
          <Input
            id="new-report-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ej: Update mensual, Reporte de Board…"
          />
        </FormField>
        <FormField label="Período" helpText="El reporte muestra los datos de este mes y no cambia solo con el tiempo.">
          <PeriodSelect period={newPeriod} onChange={setNewPeriod} className="w-full" />
        </FormField>
      </FormDialog>

      <ConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar reporte"
        description={
          <>
            ¿Eliminar <span className="text-foreground font-medium">{deleteTarget?.name}</span>
            {deleteTarget && (
              <>
                {" "}({deleteTarget.period ? formatReportPeriodLong(deleteTarget.period) : "sin período"},{" "}
                {deleteTarget.published_version != null ? `publicado v${deleteTarget.published_version}` : "borrador"})
              </>
            )}
            ? Se deja de compartir con todas las conexiones que lo tuvieran. Esta acción no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar reporte"
        variant="destructive"
        busy={deleting}
        onConfirm={deleteReport}
      />
    </AppLayout>
  );
}
