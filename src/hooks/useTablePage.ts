import { useMemo, useState } from "react";

/**
 * Client-side search + pagination over an already-fetched list. The admin
 * list endpoints (list-funds, list-companies) return everything in one shot —
 * this paginates the rendering, not the request. If these lists grow large
 * enough to need real server-side pagination, this needs to change together
 * with the backend contract (breaking change, not a drop-in).
 */
export function useTablePage<T>(items: T[], matches: (item: T, query: string) => boolean, pageSize = 10) {
  const [query, setQueryState] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => matches(item, q));
  }, [items, query, matches]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const setQuery = (q: string) => {
    setQueryState(q);
    setPage(1);
  };

  return { query, setQuery, page: currentPage, setPage, totalPages, filteredCount: filtered.length, pageItems };
}
