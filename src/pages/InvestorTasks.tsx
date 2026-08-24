import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { AddRoadmapTaskDialog, type EditableTask } from "@/components/roadmap/AddRoadmapTaskDialog";
import { usePortfolioTasks } from "@/hooks/usePortfolioTasks";
import { CRITICALITY_LABELS, LIST_ROADMAP_PILLARS_URL, type RoadmapPillar } from "@/lib/roadmap";
import type { PortfolioTask } from "@/lib/portfolioIntelligence";
import { ListTodo, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "mine" | "overdue" | "upcoming" | "done";

function taskHref(task: PortfolioTask): string {
  if (task.related_report_id) return `/companies/${task.company_id}?tab=updates&report=${task.related_report_id}`;
  if (task.related_document_id) return `/companies/${task.company_id}?tab=data-room&doc=${task.related_document_id}`;
  return `/companies/${task.company_id}?tab=tasks`;
}

// Inbox cross-company (nuevo, /tasks) — antes solo se veían tareas una
// empresa a la vez, embebidas en el Company Workspace. El tab "Tasks" de
// esa pantalla muestra la misma lista filtrada a esa empresa (usePortfolioTasks
// con company_ids=[id]), no una implementación separada.
export default function InvestorTasks() {
  const { user, loading, fund_id, portfolio_company_ids, email } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [reopen, setReopen] = useState(false);

  if (loading) return null;
  if (!user) return null;

  if (!fund_id) {
    if (!dismissed || reopen) {
      return (
        <AppLayout>
          <NoMembershipScreen role="investor" email={email} onDismiss={() => { setDismissed(true); setReopen(false); }} />
        </AppLayout>
      );
    }
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto px-8 py-12">
          <NoMembershipBanner role="investor" onOpen={() => setReopen(true)} />
          <EmptyState icon={ListTodo} title="Todavía no hay nada para mostrar." description="Vas a ver las tareas de tu portfolio apenas te unas a un fondo." />
        </div>
      </AppLayout>
    );
  }

  return <InvestorTasksContent hasCompanies={portfolio_company_ids.length > 0} />;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "mine", label: "Mis tareas" },
  { key: "overdue", label: "Vencidas" },
  { key: "upcoming", label: "Próximas" },
  { key: "done", label: "Completadas" },
];

function InvestorTasksContent({ hasCompanies }: { hasCompanies: boolean }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("mine");
  const [editing, setEditing] = useState<PortfolioTask | null>(null);

  const { tasks, loading } = usePortfolioTasks({ page_size: 200 });
  const queryClient = useQueryClient();

  const { data: pillars = [] } = useQuery({
    queryKey: ["roadmap-pillars"],
    queryFn: async () => {
      const res = await fetch(LIST_ROADMAP_PILLARS_URL, { credentials: "include" });
      if (!res.ok) return [] as RoadmapPillar[];
      const data = await res.json();
      return Array.isArray(data?.pillars) ? (data.pillars as RoadmapPillar[]) : [];
    },
  });

  const filtered = useMemo(() => {
    switch (tab) {
      case "overdue":
        return tasks.filter((t) => t.is_overdue && t.status !== "done");
      case "upcoming":
        return tasks.filter((t) => !t.is_overdue && t.status !== "done" && t.due_date);
      case "done":
        return tasks.filter((t) => t.status === "done");
      default:
        return tasks.filter((t) => t.status !== "done");
    }
  }, [tasks, tab]);

  const overdueCount = tasks.filter((t) => t.is_overdue && t.status !== "done").length;
  const pendingCount = tasks.filter((t) => t.status !== "done").length;

  const editableTask: EditableTask | null = editing
    ? {
        task_id: editing.startup_task_id,
        pillar_id: "", // no viene en PortfolioTask — se elige de nuevo al editar
        title: editing.title,
        criticality: editing.criticality,
        requires_doc: false,
        requires_report: false,
        due_date: editing.due_date,
      }
    : null;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-6">
        <PageHeader title="Tasks" subtitle={`${pendingCount} pendiente${pendingCount === 1 ? "" : "s"} · ${overdueCount} vencida${overdueCount === 1 ? "" : "s"}`} />

        {!hasCompanies ? (
          <EmptyState icon={ListTodo} title="Tu fondo todavía no tiene empresas conectadas." description="Las conexiones con startups se gestionan desde Conexiones." />
        ) : (
          <>
            <div className="flex items-center gap-1 border-b border-border">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                    tab === t.key
                      ? "border-foreground text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {loading ? (
              <LoadingState variant="centered" className="py-16" />
            ) : filtered.length === 0 ? (
              <EmptyState icon={ListTodo} title="Sin tareas acá." description="No hay tareas que coincidan con este filtro." />
            ) : (
              <div className="border border-border rounded-lg divide-y divide-border">
                {filtered.map((task) => (
                  <div key={task.startup_task_id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => navigate(taskHref(task))}
                      className="flex-1 min-w-0 text-left"
                    >
                      <span className="block text-sm font-medium text-foreground truncate">{task.title}</span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {task.company_name}
                        {task.requested_by_name && ` · pedida por ${task.requested_by_name}`}
                      </span>
                    </button>
                    <span className="text-[11px] text-muted-foreground shrink-0">{CRITICALITY_LABELS[task.criticality]}</span>
                    {task.due_date && (
                      <span
                        className={cn(
                          "text-xs font-medium shrink-0 tabular-nums",
                          task.is_overdue ? "text-destructive" : "text-muted-foreground"
                        )}
                      >
                        {task.is_overdue ? "Vencida" : new Date(task.due_date).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                      </span>
                    )}
                    {task.requested_by_user_id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        aria-label="Editar tarea"
                        onClick={() => setEditing(task)}
                      >
                        <Pencil size={13} strokeWidth={1.5} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {editableTask && (
        <AddRoadmapTaskDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          pillars={pillars}
          defaultPillarId={pillars[0]?.id ?? ""}
          title={`Editar "${editing?.title ?? ""}"`}
          description="Solo vos podés editar esta tarea — la pediste desde tu fondo."
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["portfolio-tasks"] });
          }}
          task={editableTask}
          showDueDate
        />
      )}
    </AppLayout>
  );
}
