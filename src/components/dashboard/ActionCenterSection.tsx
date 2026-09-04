import { Link, useNavigate } from "react-router-dom";
import { ListTodo } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { Checkbox } from "@/components/ui/checkbox";
import { SkeletonSection } from "@/components/SkeletonSection";
import type { RoadmapTask } from "@/lib/roadmap";
import { cn } from "@/lib/utils";

type Props = {
  tasks: RoadmapTask[];
  loading: boolean;
  currentUserId: string | null;
  onToggleDone: (task: RoadmapTask) => void;
};

function dueLabel(dueDate: string | null, isOverdue: boolean): string | null {
  if (!dueDate) return null;
  if (isOverdue) return "Vencida";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  const days = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  if (days > 1) return `Vence en ${days} días`;
  return "Vence hoy";
}

function TaskRow({ task, onToggleDone }: { task: RoadmapTask; onToggleDone: (task: RoadmapTask) => void }) {
  const due = dueLabel(task.due_date, task.is_overdue);
  return (
    <div className="flex items-start gap-3 py-2.5 border-t border-border first:border-t-0">
      <Checkbox className="mt-0.5" onCheckedChange={() => onToggleDone(task)} aria-label={`Marcar "${task.title}" como hecha`} />
      <Link to={`/roadmap?task=${encodeURIComponent(task.startup_task_id)}`} className="flex-1 min-w-0 hover:underline underline-offset-2">
        <p className="text-sm">{task.title}</p>
        {(due || task.requested_by_name) && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {task.requested_by_name && <span>Pedida por {task.requested_by_name}</span>}
            {task.requested_by_name && due && <span className="mx-1.5 text-border">·</span>}
            {due && <span className={cn(task.is_overdue && "text-destructive-dark font-medium")}>{due}</span>}
          </p>
        )}
      </Link>
    </div>
  );
}

// Acotado a 2 grupos por origen (RoadmapTask no expone `scope`, ver
// docs/design-system-command-center.md sección 3): "propias" es
// requested_by_user_id === el propio founder logueado, "pedidas por
// inversores" es requested_by_user_id no nulo y de otra persona. Las tareas
// de catálogo (requested_by_user_id null, cuentan para el readiness score)
// quedan solo en /roadmap, no se duplican acá.
export function ActionCenterSection({ tasks, loading, currentUserId, onToggleDone }: Props) {
  const navigate = useNavigate();
  const pending = tasks.filter((t) => t.status !== "done" && t.requested_by_user_id);
  const own = pending.filter((t) => t.requested_by_user_id === currentUserId);
  const fromFunds = pending.filter((t) => t.requested_by_user_id !== currentUserId);

  return (
    <SectionCard
      padding="sm"
      title={
        <span className="flex items-center gap-1.5">
          <ListTodo size={14} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          Qué tengo pendiente
        </span>
      }
      description={pending.length > 0 ? `${pending.length} tarea${pending.length === 1 ? "" : "s"}` : undefined}
    >
      {loading ? (
        <SkeletonSection rows={3} columns={1} />
      ) : pending.length === 0 ? (
        <EmptyState
          bordered={false}
          icon={ListTodo}
          title="No tenés tareas propias ni pedidas por inversores pendientes."
          description="El checklist completo de fundraising sigue en tu Roadmap."
          action={{ label: "Ver Roadmap", onClick: () => navigate("/roadmap") }}
        />
      ) : (
        <div className="space-y-5">
          {own.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-1">Tareas propias</p>
              {own.map((t) => (
                <TaskRow key={t.startup_task_id} task={t} onToggleDone={onToggleDone} />
              ))}
            </div>
          )}
          {fromFunds.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-1">Pedidas por tus inversores</p>
              {fromFunds.map((t) => (
                <TaskRow key={t.startup_task_id} task={t} onToggleDone={onToggleDone} />
              ))}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
