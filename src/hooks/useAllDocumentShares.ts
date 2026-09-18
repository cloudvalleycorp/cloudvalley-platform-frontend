import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LIST_ALL_DOCUMENT_SHARES_URL, type AnyResourceShare } from "@/lib/dataRoom";

export type ConnectionShareGroup = {
  connection_id: string;
  counterpart_name: string;
  shares: AnyResourceShare[];
};

async function fetchAllShares(companyId: string): Promise<AnyResourceShare[]> {
  const res = await fetch(`${LIST_ALL_DOCUMENT_SHARES_URL}?company_id=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.shares) ? data.shares : [];
}

// Gestión de Accesos — a diferencia de list-document-shares/list-folder-shares
// (indexados por recurso, uno a la vez), esta vista necesita "todo lo
// compartido, agrupado por fondo" — por eso el único endpoint nuevo de esta
// área (ver plan). El agrupado en sí es 100% composición del lado cliente.
export function useAllDocumentShares(companyId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ["data-room-all-shares", companyId] as const;

  const { data: shares = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: () => fetchAllShares(companyId!),
    enabled: !!companyId,
  });

  const reload = () => queryClient.invalidateQueries({ queryKey });

  const groups: ConnectionShareGroup[] = [];
  const byConnection = new Map<string, ConnectionShareGroup>();
  for (const share of shares) {
    let group = byConnection.get(share.connection_id);
    if (!group) {
      group = { connection_id: share.connection_id, counterpart_name: share.counterpart_name, shares: [] };
      byConnection.set(share.connection_id, group);
      groups.push(group);
    }
    group.shares.push(share);
  }
  groups.sort((a, b) => a.counterpart_name.localeCompare(b.counterpart_name));

  return { shares, groups, loading, reload };
}
