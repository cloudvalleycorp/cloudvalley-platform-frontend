import { useQuery } from "@tanstack/react-query";
import {
  LIST_PORTFOLIO_TASKS_URL,
  type ListPortfolioTasksParams,
  type ListPortfolioTasksResponse,
  type PortfolioTask,
} from "@/lib/portfolioIntelligence";

const EMPTY: ListPortfolioTasksResponse = { tasks: [], total: 0, page: 1, page_size: 50 };

async function fetchPortfolioTasks(params: ListPortfolioTasksParams): Promise<ListPortfolioTasksResponse> {
  const query = new URLSearchParams();
  if (params.company_ids && params.company_ids.length > 0) query.set("company_ids", params.company_ids.join(","));
  if (params.segment_id) query.set("segment_id", params.segment_id);
  if (params.status) query.set("status", params.status);
  if (params.criticality) query.set("criticality", params.criticality);
  if (params.due_before) query.set("due_before", params.due_before);
  query.set("page", String(params.page ?? 1));
  query.set("page_size", String(params.page_size ?? 50));
  const res = await fetch(`${LIST_PORTFOLIO_TASKS_URL}?${query.toString()}`, { credentials: "include" });
  // 200 con tasks:[] es la respuesta normal para un portfolio vacío o un
  // filtro sin match — solo 401 (sesión) trata distinto, nunca 403 global.
  if (!res.ok) return EMPTY;
  const data = await res.json();
  return {
    tasks: Array.isArray(data?.tasks) ? (data.tasks as PortfolioTask[]) : [],
    total: typeof data?.total === "number" ? data.total : 0,
    page: typeof data?.page === "number" ? data.page : params.page ?? 1,
    page_size: typeof data?.page_size === "number" ? data.page_size : params.page_size ?? 50,
  };
}

// Inbox cross-company — reemplaza el patrón anterior donde una tarea de
// fondo solo se podía ver una empresa a la vez (list-shared-roadmap). El
// orden por default ya viene del backend (vencidas primero, después
// due_date asc, después criticality) — no hay parámetro sort todavía.
// `enabled` (default true, agregado 2026-09-04): este endpoint es
// fund-scoped, no aplica a role="user" — GlobalSearch.tsx lo apaga del todo
// para founders en vez de pedirlo igual y descartar la respuesta.
export function usePortfolioTasks(params: ListPortfolioTasksParams, enabled = true) {
  const key = JSON.stringify(params);
  const { data = EMPTY, isLoading: loading } = useQuery({
    queryKey: ["portfolio-tasks", key],
    queryFn: () => fetchPortfolioTasks(params),
    enabled,
  });
  return { ...data, loading };
}

// Escritura: usar useRoadmapCatalogMutations().upsertTask directamente (ya
// genérico, lo consume AddRoadmapTaskDialog) e invalidar ["portfolio-tasks"]
// en el onSaved del caller — ver InvestorTasks.tsx.
