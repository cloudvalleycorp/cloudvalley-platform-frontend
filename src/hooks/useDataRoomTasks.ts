import { useQuery } from "@tanstack/react-query";
import { LIST_DATA_ROOM_TASKS_URL, type DataRoomTask } from "@/lib/dataRoom";

async function fetchDataRoomTasks(companyId: string): Promise<DataRoomTask[]> {
  const res = await fetch(`${LIST_DATA_ROOM_TASKS_URL}?company_id=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.tasks) ? data.tasks : [];
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
