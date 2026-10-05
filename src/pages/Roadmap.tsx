import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Map, Plus, Compass, AlertTriangle } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonSection } from "@/components/SkeletonSection";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useStartup } from "@/hooks/useStartup";
import { useRoadmap } from "@/hooks/useRoadmap";
import { useDocuments } from "@/hooks/useDocuments";
import { useDocumentFolders } from "@/hooks/useDocumentFolders";
import { useDeleteStartupTask } from "@/hooks/useDeleteStartupTask";
import { type RoadmapTask } from "@/lib/roadmap";
import { StageBadge } from "@/components/StageBadge";
import { RoadmapTaskList } from "@/components/roadmap/RoadmapTaskList";
import { RoadmapTaskDetailSheet } from "@/components/roadmap/RoadmapTaskDetailSheet";
import { AddRoadmapTaskDialog } from "@/components/roadmap/AddRoadmapTaskDialog";
import { FolderPickerDialog } from "@/components/dataRoom/FolderPickerDialog";

export default function Roadmap() {
  const navigate = useNavigate();
  // user.id NO es el id real del usuario (alias legacy a company_id, ver
  // AuthContext.tsx) — para "es mi propia tarea" hace falta user_id.
  const { role, user_id, company_id, loading: authLoading, user } = useAuth();
  const { startup } = useStartup();
  const { pillars, tasks, readinessScore, loading: loadingRoadmap, error: roadmapError, retry: retryRoadmap, toggleStatus, reload } = useRoadmap(company_id);
  const { createAndUpload, uploadFile } = useDocuments(company_id);
  const folders = useDocumentFolders(company_id);
  // Bug real encontrado en auditoría (2026-09-29): esto llamaba a
  // useRoadmapCatalogMutations().deleteTask, admin-only sobre el catálogo
  // global (DELETE_ROADMAP_TASK_URL) — un founder eliminando su propia tarea
  // daba 403 en producción. useDeleteStartupTask es el endpoint correcto
  // (DELETE_STARTUP_TASK_URL, ya usado por InvestorTasks.tsx del lado
  // inversor para el mismo tipo de acción).
  const { deleteTask } = useDeleteStartupTask();
  // Data Room ya no infiere sola en qué carpeta va un documento pedido por
  // una tarea de Roadmap (las carpetas no llevan vínculo a pilar en esta
  // versión) — se le pide al founder que elija (o cree) la carpeta a mano.
  const [pendingUpload, setPendingUpload] = useState<{ task: RoadmapTask; file: File } | null>(null);

  const [openTask, setOpenTask] = useState<RoadmapTask | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  // Editar/eliminar solo existe para tareas propias (requested_by_user_id
  // === el propio founder) — ver RoadmapTaskDetailSheet.tsx. Antes de esto
  // no había forma de corregir o sacar una tarea propia ya creada.
  const [editingTask, setEditingTask] = useState<RoadmapTask | null>(null);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState<RoadmapTask | null>(null);
  const [deletingTask, setDeletingTask] = useState(false);

  const handleDeleteTask = async () => {
    if (!confirmDeleteTask || !company_id) return;
    setDeletingTask(true);
    const ok = await deleteTask(company_id, confirmDeleteTask.startup_task_id);
    setDeletingTask(false);
    if (ok) {
      setConfirmDeleteTask(null);
      reload();
    }
  };

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
    if (task.document_id) {
      const ok = await uploadFile(task.document_id, file);
      if (ok) reload();
      return;
    }
    // Documento nuevo: hace falta elegir en qué carpeta va (ver comentario
    // de pendingUpload más arriba).
    setPendingUpload({ task, file });
  };

  const confirmPendingUpload = async (folderId: string | null) => {
    if (!pendingUpload || !folderId) return;
    const ok = await createAndUpload(folderId, pendingUpload.task.title, pendingUpload.file, pendingUpload.task.task_id, true);
    if (ok) {
      setPendingUpload(null);
      reload();
    }
  };

  // Bug real (auditado 2026-09-21): esta pantalla no tenía ningún guard de
  // rol — investor/admin caían acá con company_id null y useRoadmap se
  // quedaba en enabled:false para siempre (0% readiness, cero pilares, sin
  // mensaje). Mismo criterio que Reporting.tsx/DataRoom.tsx.
  //
  // Segundo bug real, encontrado en vivo (2026-09-29): faltaba esperar a
  // `authLoading` antes de evaluar el rol — `role` arranca en `null` mientras
  // useAuth() resuelve la sesión, así que en una recarga completa
  // `role !== "user"` daba true por un instante y mandaba a /admin, que a su
  // vez rebota a /dashboard (mismo guard ahí) — un founder recargando
  // /roadmap terminaba en Dashboard sin ningún error visible. Mismo bug
  // pendiente de verificar en Dashboard.tsx y el resto de las pantallas de
  // founder (Metrics/GrowthTrackerSheets/Reporting/DataRoom comparten el
  // mismo patrón de guard).
  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (role === "investor") return <Navigate to="/overview" replace />;
  if (role !== "user") return <Navigate to="/admin" replace />;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12">
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
          <div className="flex items-center gap-2 rounded-lg border border-teal/30 bg-teal-subtle text-teal-dark text-sm px-4 py-2.5 mb-6" aria-live="polite">
            <Compass size={14} strokeWidth={1.5} aria-hidden="true" />
            Llegaste desde el Dashboard.
          </div>
        )}

        {loadingRoadmap ? (
          <SkeletonSection rows={4} columns={2} />
        ) : roadmapError ? (
          <EmptyState
            icon={AlertTriangle}
            title="No pudimos cargar tu roadmap."
            description="Puede ser un problema temporal de conexión. Probá de nuevo en un momento."
            action={{ label: "Reintentar", onClick: () => retryRoadmap() }}
          />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={Map}
            title="Todavía no hay tareas en tu roadmap."
            description="Cuando se generen las tareas de tu etapa, van a aparecer acá agrupadas por pilar. Mientras tanto, podés seguir viendo el resto de tu cuenta."
            action={{ label: "Volver al Dashboard", onClick: () => navigate("/dashboard") }}
          />
        ) : (
          <RoadmapTaskList
            pillars={pillars}
            tasks={tasks}
            onOpenTask={setOpenTask}
            onToggleStatus={toggleStatus}
            onUpload={handleUpload}
            // Antes el founder necesitaba 1 click extra (abrir el detalle) para
            // editar/eliminar su propia tarea, a diferencia del inversor
            // (InvestorCompany.tsx) que ya tiene lápiz/tacho inline en la fila.
            onEditTask={setEditingTask}
            onCancelTask={setConfirmDeleteTask}
            currentUserId={user_id}
          />
        )}
      </div>

      <RoadmapTaskDetailSheet
        task={openTask}
        onClose={() => setOpenTask(null)}
        ownTaskActions={
          openTask && user_id && openTask.requested_by_user_id === user_id
            ? {
                onEdit: () => {
                  setEditingTask(openTask);
                  setOpenTask(null);
                },
                onDelete: () => {
                  setConfirmDeleteTask(openTask);
                  setOpenTask(null);
                },
              }
            : undefined
        }
      />

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

      {editingTask && (
        <AddRoadmapTaskDialog
          open={!!editingTask}
          onOpenChange={(o) => !o && setEditingTask(null)}
          pillars={pillars}
          defaultPillarId={editingTask.pillar_id}
          title="Editar tarea propia"
          description="Solo la ves vos (y CloudValley), no cuenta para el readiness score, que se calcula solo con el catálogo estándar."
          task={{
            task_id: editingTask.task_id,
            pillar_id: editingTask.pillar_id,
            title: editingTask.title,
            description: editingTask.description,
            why_it_matters: editingTask.why_it_matters,
            how_to_do_it: editingTask.how_to_do_it,
            criticality: editingTask.criticality,
            requires_doc: editingTask.requires_doc,
            requires_report: editingTask.requires_report,
            due_date: editingTask.due_date,
          }}
          onSaved={() => {
            setEditingTask(null);
            reload();
          }}
        />
      )}

      <ConfirmationDialog
        open={!!confirmDeleteTask}
        onOpenChange={(o) => !o && setConfirmDeleteTask(null)}
        title="Eliminar tarea"
        description={confirmDeleteTask ? `Se elimina "${confirmDeleteTask.title}" de tu Roadmap. No se puede deshacer.` : ""}
        confirmLabel="Eliminar"
        variant="destructive"
        busy={deletingTask}
        onConfirm={handleDeleteTask}
      />

      {pendingUpload && (
        <FolderPickerDialog
          open={!!pendingUpload}
          onOpenChange={(o) => !o && setPendingUpload(null)}
          title="¿En qué carpeta va este documento?"
          description={`"${pendingUpload.task.title}" se sube al Data Room dentro de la carpeta que elijas.`}
          tree={folders.tree}
          confirmLabel="Subir acá"
          onCreateFolder={folders.createFolder}
          onConfirm={confirmPendingUpload}
        />
      )}
    </AppLayout>
  );
}
