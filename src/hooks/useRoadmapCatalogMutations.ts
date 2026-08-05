import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import {
  UPSERT_ROADMAP_PILLAR_URL,
  DELETE_ROADMAP_PILLAR_URL,
  UPSERT_ROADMAP_TASK_URL,
  DELETE_ROADMAP_TASK_URL,
  type UpsertRoadmapPillarRequest,
  type UpsertRoadmapTaskRequest,
} from "@/lib/roadmap";

/**
 * Escritura del catálogo de Roadmap — compartido entre admin (catálogo
 * global), founder (tareas propias de su startup) e inversor (requisitos
 * para su portfolio). scope/company_id/fund_id nunca se mandan, el backend
 * los infiere de la sesión — acá solo se arma el body con lo que cada
 * caller sabe (pillar_id/task_id presente = update, ausente = create).
 */
export function useRoadmapCatalogMutations() {
  const upsertPillar = async (body: UpsertRoadmapPillarRequest): Promise<boolean> => {
    try {
      const res = await fetch(UPSERT_ROADMAP_PILLAR_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (await handleMembershipError(res)) return false;
      toast.success(body.pillar_id ? "Pilar actualizado" : "Pilar creado");
      return true;
    } catch {
      toast.error("No se pudo guardar el pilar");
      return false;
    }
  };

  const deletePillar = async (pillarId: string): Promise<boolean> => {
    try {
      const res = await fetch(DELETE_ROADMAP_PILLAR_URL, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pillar_id: pillarId }),
      });
      if (await handleMembershipError(res)) return false;
      toast.success("Pilar eliminado");
      return true;
    } catch {
      toast.error("No se pudo eliminar el pilar");
      return false;
    }
  };

  const upsertTask = async (body: UpsertRoadmapTaskRequest): Promise<boolean> => {
    try {
      const res = await fetch(UPSERT_ROADMAP_TASK_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (await handleMembershipError(res)) return false;
      toast.success(body.task_id ? "Tarea actualizada" : "Tarea creada");
      return true;
    } catch {
      toast.error("No se pudo guardar la tarea");
      return false;
    }
  };

  const deleteTask = async (taskId: string): Promise<boolean> => {
    try {
      const res = await fetch(DELETE_ROADMAP_TASK_URL, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId }),
      });
      if (await handleMembershipError(res)) return false;
      toast.success("Tarea eliminada");
      return true;
    } catch {
      toast.error("No se pudo eliminar la tarea");
      return false;
    }
  };

  return { upsertPillar, deletePillar, upsertTask, deleteTask };
}
