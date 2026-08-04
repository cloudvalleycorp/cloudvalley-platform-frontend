import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/FormDialog";
import { handleMembershipError } from "@/lib/membership";
import {
  CREATE_FINANCIAL_REPORT_URL,
  LIST_FINANCIAL_REPORTS_URL,
  DELETE_FINANCIAL_REPORT_URL,
  LIST_FINANCIAL_REPORT_SHARES_URL,
  type ReportSummary,
  type ReportShare,
} from "@/lib/financialReports";
import { toast } from "sonner";
import { Plus, FileText, Pencil, Trash2, Share2 } from "lucide-react";

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

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
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
        body: JSON.stringify({ company_id, name: newName.trim() }),
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
          title="Reporting"
          subtitle="Armá un reporte con las métricas que quieras y compartilo con un fondo puntual."
          action={
            is_owner && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={14} className="mr-1" /> Nuevo reporte
              </Button>
            )
          }
        />

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
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <div
                key={r.report_id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/reporting/${r.report_id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/reporting/${r.report_id}`);
                  }
                }}
                className="border border-border rounded-lg p-4 bg-card flex items-center justify-between gap-4 cursor-pointer hover:border-foreground/30 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-md bg-surface flex items-center justify-center shrink-0">
                    <FileText size={16} strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                      <span>Actualizado {new Date(r.updated_at).toLocaleDateString("es-AR")}</span>
                      {is_owner && (
                        <span className="inline-flex items-center gap-1">
                          <Share2 size={11} strokeWidth={1.5} />
                          {shareCountByReport[r.report_id]
                            ? `Compartido con ${shareCountByReport[r.report_id]} fondo${shareCountByReport[r.report_id] === 1 ? "" : "s"}`
                            : "Sin compartir"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/reporting/${r.report_id}`);
                    }}
                  >
                    <Pencil size={12} className="mr-1" /> {is_owner ? "Editar" : "Ver"}
                  </Button>
                  {is_owner && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
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
        <Label className="text-xs">Nombre</Label>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="mt-1"
          placeholder="Ej: Update mensual, Reporte de Board…"
        />
      </FormDialog>

      <ConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar reporte"
        description={
          <>
            ¿Eliminar <span className="text-foreground font-medium">{deleteTarget?.name}</span>? Se deja de
            compartir con todas las conexiones que lo tuvieran. Esta acción no se puede deshacer.
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
