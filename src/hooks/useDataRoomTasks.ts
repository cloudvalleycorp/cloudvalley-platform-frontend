import { useQuery } from "@tanstack/react-query";
import { LIST_ROADMAP_URL, type ListRoadmapResponse } from "@/lib/roadmap";
import type { DataRoomTask } from "@/lib/dataRoom";

// Backend consolidó el "list-data-room-tasks" que habíamos pedido dentro de
// list-roadmap (que ya trae document_id/document_status por tarea) — se arma
// acá el subconjunto que el TaskSelector necesita (solo requires_doc=true,
// con el nombre del pilar resuelto desde el array de pillars de la misma
// respuesta).
async function fetchDataRoomTasks(companyId: string): Promise<DataRoomTask[]> {
  const res = await fetch(`${LIST_ROADMAP_URL}?company_id=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Partial<ListRoadmapResponse>;
  const pillarNameById = new Map((data.pillars ?? []).map((p) => [p.id, p.name]));
  return (data.tasks ?? [])
    .filter((t) => t.requires_doc)
    .map((t) => ({
      id: t.task_id,
      title: t.title,
      pillar_name: pillarNameById.get(t.pillar_id) ?? "",
      done: t.status === "done",
    }));
}

/** Tareas de Roadmap que requieren documento (requires_doc=true) — para el TaskSelector. */
export function useDataRoomTasks(companyId: string | null) {
  const { data: tasks = [], isLoading: loading } = useQuery({
    queryKey: ["data-room-tasks", companyId],
    queryFn: () => fetchDataRoomTasks(companyId!),
    enabled: !!companyId,
  });
  return { tasks, loading };
}
