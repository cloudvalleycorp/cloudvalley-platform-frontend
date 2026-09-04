import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Info, Upload, RefreshCw, ChevronDown, FileBarChart, CheckCircle2, Circle, Pencil } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RoadmapPillar, RoadmapTask, RoadmapTaskStatus } from "@/lib/roadmap";

type Props = {
  pillars: RoadmapPillar[];
  tasks: RoadmapTask[];
  onOpenTask: (task: RoadmapTask) => void;
  // Lado inversor: sin checkbox interactivo (estado se ve con ícono, no se
  // toca) ni acciones de subir/reemplazar documento — el resto (tabs de
  // pilar, progreso, criticidad, link a Reporting) se ve igual que del lado
  // founder. onToggleStatus/onUpload se ignoran si readOnly es true.
  readOnly?: boolean;
  onToggleStatus?: (startupTaskId: string, next: RoadmapTaskStatus) => void;
  onUpload?: (task: RoadmapTask, file: File) => void;
  // Lado inversor, solo tareas que el propio fondo pidió (requested_by_user_id
  // presente — nunca las del catálogo admin/founder): lápiz de editar junto
  // al de info, sin tener que ir a /tasks. Ausente = sin acción de editar
  // acá (ej. Roadmap.tsx del founder, que edita por otro lado).
  onEditTask?: (task: RoadmapTask) => void;
};

// Pillar tabs + lista de tareas agrupadas, extraído de Roadmap.tsx para que
// founder (edición) e investor (solo lectura) compartan el mismo render —
// mismo criterio que DocumentRow.tsx reusado entre las dos vistas con un
// prop canEdit.
export function RoadmapTaskList({ pillars, tasks, onOpenTask, readOnly = false, onToggleStatus, onUpload, onEditTask }: Props) {
  const [activePillar, setActivePillar] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const filtered = activePillar === "all" ? tasks : tasks.filter((t) => t.pillar_id === activePillar);
    return pillars
      .map((p) => ({ ...p, items: filtered.filter((t) => t.pillar_id === p.id) }))
      .filter((p) => p.items.length > 0);
  }, [tasks, pillars, activePillar]);

  return (
    <>
      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
        <button
          onClick={() => setActivePillar("all")}
          className={cn(
            "px-3 py-2 text-sm transition-all duration-150 border-b-2 -mb-px whitespace-nowrap",
            activePillar === "all" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Todos
        </button>
        {pillars.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePillar(p.id)}
            className={cn(
              "px-3 py-2 text-sm transition-all duration-150 border-b-2 -mb-px whitespace-nowrap",
              activePillar === p.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {grouped.map((p) => {
          const done = p.items.filter((t) => t.status === "done").length;
          const pct = p.items.length > 0 ? Math.round((done / p.items.length) * 100) : 0;
          const isCollapsed = collapsed.has(p.id);
          return (
            <section key={p.id} className="border border-border rounded-lg bg-card overflow-hidden">
              <button
                className="w-full px-4 py-[13px] flex items-center justify-between gap-3 text-left bg-surface/60"
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                    return next;
                  })
                }
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-[13px] font-medium">{p.name}</h3>
                    <span className="text-xs text-tertiary">peso {p.weight}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="w-[100px] h-[5px] rounded-full bg-border overflow-hidden shrink-0">
                      <div
                        className="h-full bg-teal transition-all duration-150"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[11.5px] text-muted-foreground tabular-nums">
                      {done}/{p.items.length}
                    </span>
                  </div>
                </div>
                <ChevronDown
                  size={16}
                  strokeWidth={1.5}
                  className={cn("text-muted-foreground transition-transform shrink-0", isCollapsed && "-rotate-90")}
                />
              </button>
              {!isCollapsed && (
                <ul className="border-t border-border">
                  {p.items.map((t) => (
                    <li
                      key={t.startup_task_id}
                      className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 group"
                    >
                      {readOnly ? (
                        t.status === "done" ? (
                          <CheckCircle2 size={16} strokeWidth={1.5} className="text-success shrink-0" aria-label="Completada" />
                        ) : (
                          <Circle size={16} strokeWidth={1.5} className="text-muted-foreground shrink-0" aria-label="Pendiente" />
                        )
                      ) : (
                        <Checkbox
                          checked={t.status === "done"}
                          onCheckedChange={() => onToggleStatus?.(t.startup_task_id, t.status === "done" ? "pending" : "done")}
                        />
                      )}
                      <span className={cn("flex-1 text-sm", t.status === "done" && "text-tertiary line-through")}>{t.title}</span>
                      <span
                        className={cn(
                          "text-[10px] font-semibold uppercase tracking-wide px-2 py-[1.5px] rounded-full shrink-0",
                          t.criticality === "critical"
                            ? "bg-destructive/10 text-destructive-dark"
                            : "bg-secondary text-secondary-foreground"
                        )}
                      >
                        {t.criticality}
                      </span>
                      {t.requires_report && !readOnly && (
                        <Link
                          to="/reporting"
                          title="Se completa creando y compartiendo un reporte"
                          className="text-muted-foreground hover:text-foreground transition-all"
                        >
                          <FileBarChart size={14} strokeWidth={1.5} />
                        </Link>
                      )}
                      {t.requires_doc && !readOnly && (
                        <label
                          className="cursor-pointer text-muted-foreground hover:text-foreground transition-all"
                          title={t.document_id ? "Reemplazar documento" : "Subir documento"}
                        >
                          {t.document_id ? <RefreshCw size={14} strokeWidth={1.5} /> : <Upload size={14} strokeWidth={1.5} />}
                          <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload?.(t, e.target.files[0])} />
                        </label>
                      )}
                      {onEditTask && t.requested_by_user_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 -m-1.5 shrink-0"
                          onClick={() => onEditTask(t)}
                          aria-label={`Editar ${t.title}`}
                        >
                          <Pencil size={13} strokeWidth={1.5} />
                        </Button>
                      )}
                      <button
                        onClick={() => onOpenTask(t)}
                        className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground transition-all"
                        aria-label={`Info sobre ${t.title}`}
                      >
                        <Info size={14} strokeWidth={1.5} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
