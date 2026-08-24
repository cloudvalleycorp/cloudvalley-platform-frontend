import { useQuery } from "@tanstack/react-query";
import { LIST_ACTIVITY_URL, type ActivityEvent, type ListActivityParams } from "@/lib/portfolioIntelligence";

const EMPTY: { events: ActivityEvent[]; total: number } = { events: [], total: 0 };

async function fetchActivity(params: ListActivityParams): Promise<typeof EMPTY> {
  const query = new URLSearchParams();
  if (params.company_id) query.set("company_id", params.company_id);
  if (params.segment_id) query.set("segment_id", params.segment_id);
  if (params.since) query.set("since", params.since);
  query.set("page", String(params.page ?? 1));
  query.set("page_size", String(params.page_size ?? 20));
  const res = await fetch(`${LIST_ACTIVITY_URL}?${query.toString()}`, { credentials: "include" });
  if (!res.ok) return EMPTY;
  const data = await res.json();
  return {
    events: Array.isArray(data?.events) ? (data.events as ActivityEvent[]) : [],
    total: typeof data?.total === "number" ? data.total : 0,
  };
}

// v1 acotado a report_shared/document_uploaded (acordado con backend) — el
// feed completo de 5 categorías queda para una iteración posterior.
export function useActivity(params: ListActivityParams) {
  const key = JSON.stringify(params);
  const { data = EMPTY, isLoading: loading } = useQuery({
    queryKey: ["activity", key],
    queryFn: () => fetchActivity(params),
  });
  return { ...data, loading };
}
