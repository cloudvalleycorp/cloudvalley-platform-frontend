import { useQuery } from "@tanstack/react-query";
import { LIST_SHARED_DOCUMENTS_URL, type DataRoomDocument } from "@/lib/dataRoom";

type Result = { documents: DataRoomDocument[]; forbidden: boolean };

async function fetchSharedDocuments(companyId: string): Promise<Result> {
  const res = await fetch(`${LIST_SHARED_DOCUMENTS_URL}?company_id=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (res.status === 403) return { documents: [], forbidden: true };
  if (!res.ok) return { documents: [], forbidden: false };
  const data = await res.json();
  return { documents: Array.isArray(data?.documents) ? data.documents : [], forbidden: false };
}

/** Lado inversor: solo los documentos que la startup marcó como visibles, validado server-side (nunca is_public filtrado en el cliente). */
export function useSharedDocuments(companyId: string | null) {
  const { data, isLoading: loading } = useQuery({
    queryKey: ["shared-documents", companyId],
    queryFn: () => fetchSharedDocuments(companyId!),
    enabled: !!companyId,
  });
  return { documents: data?.documents ?? [], loading, forbidden: data?.forbidden ?? false };
}
