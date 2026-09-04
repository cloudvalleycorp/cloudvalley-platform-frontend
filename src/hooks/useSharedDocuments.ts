import { useQuery } from "@tanstack/react-query";
import { LIST_SHARED_DOCUMENTS_URL, type DataRoomDocument } from "@/lib/dataRoom";

type Result = { documents: DataRoomDocument[]; forbidden: boolean };

// list-shared-documents llama a su fecha "uploaded_at", no "created_at" como
// list-documents (confirmado por backend 2026-09-04, no son el mismo shape)
// — se normaliza acá, una sola vez, para que DataRoomDocument sea el único
// tipo que el resto del código (DocumentRow.tsx, InvestorDataRoom.tsx)
// necesita conocer.
function normalizeSharedDocument(raw: any): DataRoomDocument {
  return { ...raw, created_at: raw.uploaded_at ?? raw.created_at };
}

async function fetchSharedDocuments(companyId: string): Promise<Result> {
  const res = await fetch(`${LIST_SHARED_DOCUMENTS_URL}?company_id=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (res.status === 403) return { documents: [], forbidden: true };
  if (!res.ok) return { documents: [], forbidden: false };
  const data = await res.json();
  const documents = Array.isArray(data?.documents) ? data.documents : [];
  return { documents: documents.map(normalizeSharedDocument), forbidden: false };
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

type PortfolioResult = { documents: DataRoomDocument[]; total: number; page: number; page_size: number };
const EMPTY_PORTFOLIO: PortfolioResult = { documents: [], total: 0, page: 1, page_size: 50 };

async function fetchPortfolioDocuments(
  companyIds: string[] | undefined,
  segmentId: string | undefined,
  category: string | undefined,
  page: number,
  pageSize: number
): Promise<PortfolioResult> {
  const query = new URLSearchParams();
  if (companyIds && companyIds.length > 0) query.set("company_ids", companyIds.join(","));
  if (segmentId) query.set("segment_id", segmentId);
  if (category) query.set("category", category);
  query.set("page", String(page));
  query.set("page_size", String(pageSize));
  const res = await fetch(`${LIST_SHARED_DOCUMENTS_URL}?${query.toString()}`, { credentials: "include" });
  // Modo portfolio-wide nunca da 403 (empresas sin conexión simplemente no
  // aparecen) — a diferencia del modo legacy de una sola company_id.
  if (!res.ok) return EMPTY_PORTFOLIO;
  const data = await res.json();
  const documents = Array.isArray(data?.documents) ? data.documents : [];
  return {
    documents: documents.map(normalizeSharedDocument),
    total: typeof data?.total === "number" ? data.total : 0,
    page: typeof data?.page === "number" ? data.page : page,
    page_size: typeof data?.page_size === "number" ? data.page_size : pageSize,
  };
}

/** Data Room portfolio-wide (nuevo, /data-room) — company_ids/segment_id u omitido = todas las conectadas. Modo distinto y paginado, no confundir con useSharedDocuments (una sola empresa, sin paginar). */
export function usePortfolioDocuments(opts: {
  companyIds?: string[];
  segmentId?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}) {
  const key = JSON.stringify(opts);
  const { data = EMPTY_PORTFOLIO, isLoading: loading } = useQuery({
    queryKey: ["portfolio-documents", key],
    queryFn: () =>
      fetchPortfolioDocuments(opts.companyIds, opts.segmentId, opts.category, opts.page ?? 1, opts.pageSize ?? 50),
  });
  return { ...data, loading };
}
