import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Map, Plus, Compass } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonSection } from "@/components/SkeletonSection";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useStartup } from "@/hooks/useStartup";
import { useRoadmap } from "@/hooks/useRoadmap";
import { useDocuments } from "@/hooks/useDocuments";
import { categoryForPillarName } from "@/lib/dataRoom";
import { type RoadmapTask } from "@/lib/roadmap";
import { toast } from "sonner";
import { StageBadge } from "@/components/StageBadge";
import { RoadmapTaskList } from "@/components/roadmap/RoadmapTaskList";
import { RoadmapTaskDetailSheet } from "@/components/roadmap/RoadmapTaskDetailSheet";
import { AddRoadmapTaskDialog } from "@/components/roadmap/AddRoadmapTaskDialog";

export default function Roadmap() {
  const { company_id } = useAuth();
  const { startup } = useStartup();
  const { pillars, tasks, readinessScore, loading: loadingRoadmap, toggleStatus, reload } = useRoadmap(company_id);
  const { createAndUpload, uploadFile } = useDocuments(company_id);

  const [openTask, setOpenTask] = useState<RoadmapTask | null>(null);
  const [addingTask, setAddingTask] = useState(false);

  // Deep-link desde el Action Center del Dashboard (?task=<startup_task_id>)
  // — mismo patrón single-use que ?report=/?doc= en InvestorCompany.tsx: se
  // consume una sola vez y se limpia de la URL. deepLinkTaskId (ref, capturado
  // en el primer render) sobrevive a esa limpieza para poder mostrar el
  // banner "Llegaste desde…" mientras esa misma tarea sigue abierta.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkTaskId = useRef(searchParams.get("task")).current;
  useEffect(() => {
    if (!deepLinkTaskId || tasks.length === 0) return;
    const match = tasks.find((t) => t.startup_task_id === deepLinkTaskId);
    if (match) setOpenTask(match);
    const next = new URLSearchParams(searchParams);
    next.delete("task");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkTaskId, tasks]);

  const handleUpload = async (task: RoadmapTask, file: File) => {
    let ok: boolean;
    if (task.document_id) {
      ok = await uploadFile(task.document_id, file);
    } else {
      const pillarName = pillars.find((p) => p.id === task.pillar_id)?.name ?? "";
      const category = categoryForPillarName(pillarName);
      if (!category) {
        toast.error("No se pudo determinar la categoría del documento para esta tarea");
        return;
      }
      ok = await createAndUpload(category, task.title, file, task.task_id, true);
    }
    if (ok) reload();
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <PageHeader
          size="compact"
          title="Fundraising Roadmap"
          subtitle={
            <span className="inline-flex items-center gap-2">
              <StageBadge stage={startup?.stage} />
              <span>Readiness {readinessScore}/100</span>
            </span>
          }
          action={
            pillars.length > 0 && (
              <Button variant="outline" onClick={() => setAddingTask(true)}>
                <Plus size={14} strokeWidth={1.5} className="mr-2" /> Agregar tarea propia
              </Button>
            )
          }
        />

        {deepLinkTaskId && openTask?.startup_task_id === deepLinkTaskId && (
          <div className="flex items-center gap-2 rounded-lg border border-teal/30 bg-teal-subtle text-teal-dark text-sm px-4 py-2.5 mb-6">
            <Compass size={14} strokeWidth={1.5} aria-hidden="true" />
            Llegaste desde el Dashboard.
          </div>
        )}

        {loadingRoadmap ? (
          <SkeletonSection rows={4} columns={2} />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={Map}
            title="Todavía no hay tareas en tu roadmap."
            description="Cuando se generen las tareas de tu etapa, van a aparecer acá agrupadas por pilar."
          />
        ) : (
          <RoadmapTaskList
            pillars={pillars}
            tasks={tasks}
            onOpenTask={setOpenTask}
            onToggleStatus={toggleStatus}
            onUpload={handleUpload}
          />
        )}
      </div>

      <RoadmapTaskDetailSheet task={openTask} onClose={() => setOpenTask(null)} />

      {pillars.length > 0 && (
        <AddRoadmapTaskDialog
          open={addingTask}
          onOpenChange={setAddingTask}
          pillars={pillars}
          defaultPillarId={pillars[0].id}
          title="Agregar tarea propia"
          description="Solo la ves vos (y CloudValley), no cuenta para el readiness score, que se calcula solo con el catálogo estándar."
          onSaved={reload}
        />
      )}
    </AppLayout>
  );
}
