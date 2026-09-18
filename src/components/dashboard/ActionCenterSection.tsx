import { Link, useNavigate } from "react-router-dom";
import { ListTodo } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { SectionNum } from "@/components/dashboard/SectionNum";
import { EmptyState } from "@/components/EmptyState";
import { Checkbox } from "@/components/ui/checkbox";
import { SkeletonSection } from "@/components/SkeletonSection";
import { dueLabel, type RoadmapTask } from "@/lib/roadmap";
import { cn } from "@/lib/utils";

type Props = {
  tasks: RoadmapTask[];
  loading: boolean;
  currentUserId: string | null;
  onToggleDone: (task: RoadmapTask) => void;
};

// showRequester=false en el grupo "Tareas propias" — ahí requested_by_name
// es siempre el propio founder mirando la pantalla, "Pedida por vos mismo"
// no aporta nada (bug de UX real encontrado en vivo 2026-09-08, recién
// visible ahora que requested_by_user_id llega poblado de verdad).
function TaskRow({
  task,
  onToggleDone,
  showRequester = true,
}: {
  task: RoadmapTask;
  onToggleDone: (task: RoadmapTask) => void;
  showRequester?: boolean;
}) {
  const due = dueLabel(task.due_date, task.is_overdue);
  const requester = showRequester ? task.requested_by_name : null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-t border-border first:border-t-0">
      <Checkbox className="mt-0.5" onCheckedChange={() => onToggleDone(task)} aria-label={`Marcar "${task.title}" como hecha`} />
      <Link to={`/roadmap?task=${encodeURIComponent(task.startup_task_id)}`} className="flex-1 min-w-0 hover:underline underline-offset-2">
        <p className="text-sm">{task.title}</p>
        {(due || requester) && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {requester && <span>Pedida por {requester}</span>}
            {requester && due && <span className="mx-1.5 text-border">·</span>}
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
//
// Bug real encontrado en vivo 2026-09-06: list-roadmap (el endpoint del
// propio founder) no manda requested_by_user_id/requested_by_name/due_date/
// is_overdue en ABSOLUTO — ni siquiera null, el campo directamente no está
// en la respuesta — a diferencia de list-shared-roadmap (lado inversor), que
// sí los trae. Con el filtro original (`&& t.requested_by_user_id`) esto
// hacía que "pending" diera SIEMPRE vacío, mostrando "no tenés nada
// pendiente" aunque hubiera tareas reales sin hacer — peor que no agrupar:
// era directamente falso. Pedido a backend para agregar paridad con
// list-shared-roadmap (ver prompt). Mientras tanto: si ningún task de la
// respuesta trae el campo poblado, se cae a una lista plana (sin la
// distinción propia/fondo, que hoy no se puede calcular) en vez de mentir
// que no hay nada — apenas backend lo agregue, vuelve a agrupar solo.
const MAX_UNGROUPED_VISIBLE = 6;

export function ActionCenterSection({ tasks, loading, currentUserId, onToggleDone }: Props) {
  const navigate = useNavigate();
  const pendingAll = tasks.filter((t) => t.status !== "done");
  const hasOriginData = pendingAll.some((t) => t.requested_by_user_id != null);
  const own = hasOriginData ? pendingAll.filter((t) => t.requested_by_user_id === currentUserId) : [];
  const fromFunds = hasOriginData ? pendingAll.filter((t) => t.requested_by_user_id && t.requested_by_user_id !== currentUserId) : [];
  const ungrouped = hasOriginData ? [] : pendingAll;
  const visibleUngrouped = ungrouped.slice(0, MAX_UNGROUPED_VISIBLE);

  return (
    <SectionCard
      padding="sm"
      title={
        <span className="flex items-center gap-2">
          <SectionNum n={5} />
          Qué tengo pendiente
        </span>
      }
      description={pendingAll.length > 0 ? `${pendingAll.length} tarea${pendingAll.length === 1 ? "" : "s"}` : undefined}
    >
      {loading ? (
        <SkeletonSection rows={3} columns={1} />
      ) : pendingAll.length === 0 ? (
        <EmptyState
          bordered={false}
          icon={ListTodo}
          title="No tenés tareas pendientes."
          description="El checklist completo de fundraising sigue en tu Roadmap."
          action={{ label: "Ver Roadmap", onClick: () => navigate("/roadmap") }}
        />
      ) : (
        <div className="space-y-5">
          {own.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-1">Tareas propias</p>
              {own.map((t) => (
                <TaskRow key={t.startup_task_id} task={t} onToggleDone={onToggleDone} showRequester={false} />
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
          {visibleUngrouped.length > 0 && (
            <div>
              {visibleUngrouped.map((t) => (
                <TaskRow key={t.startup_task_id} task={t} onToggleDone={onToggleDone} />
              ))}
              {ungrouped.length > MAX_UNGROUPED_VISIBLE && (
                <Link to="/roadmap" className="text-xs font-medium text-primary-dark hover:underline inline-block mt-2">
                  Ver las {ungrouped.length - MAX_UNGROUPED_VISIBLE} restantes en Roadmap →
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
