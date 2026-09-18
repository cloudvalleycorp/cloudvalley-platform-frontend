import { useEffect, useState } from "react";
import {
  LIST_DOCUMENT_ANALYTICS_URL,
  type DocumentAnalytics,
  type DocumentAnalyticsByFund,
  type DocumentAnalyticsByPerson,
} from "@/lib/dataRoom";

export type FolderAnalytics = {
  total_opens: number;
  total_downloads: number;
  by_fund: DocumentAnalyticsByFund[];
  by_person: DocumentAnalyticsByPerson[];
};

function mergeByFund(rows: DocumentAnalyticsByFund[]): DocumentAnalyticsByFund[] {
  const map = new Map<string, DocumentAnalyticsByFund>();
  for (const r of rows) {
    const prev = map.get(r.fund_id);
    map.set(r.fund_id, prev ? { fund_id: r.fund_id, opens: prev.opens + r.opens, downloads: prev.downloads + r.downloads } : { ...r });
  }
  return Array.from(map.values());
}

function mergeByPerson(rows: DocumentAnalyticsByPerson[]): DocumentAnalyticsByPerson[] {
  const map = new Map<string, DocumentAnalyticsByPerson>();
  for (const r of rows) {
    const prev = map.get(r.viewer_user_id);
    map.set(
      r.viewer_user_id,
      prev
        ? { viewer_user_id: r.viewer_user_id, viewer_name: r.viewer_name, opens: prev.opens + r.opens, downloads: prev.downloads + r.downloads }
        : { ...r }
    );
  }
  return Array.from(map.values());
}

// Sin endpoint de analítica por carpeta a propósito (ver plan): se agrega
// del lado del cliente sumando list-document-analytics de cada documento de
// la carpeta (recursivo, incluye subcarpetas) — mismo criterio de costo que
// el Promise.all que ya usa ReportEditor.tsx. Si una carpeta llega a tener
// 100+ documentos y esto se pone lento, ahí se pide el endpoint agregado.
export function useFolderAnalytics(companyId: string | null, documentIds: string[], enabled: boolean) {
  const [data, setData] = useState<FolderAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !companyId || documentIds.length === 0) {
      setData(documentIds.length === 0 ? { total_opens: 0, total_downloads: 0, by_fund: [], by_person: [] } : null);
      return;
    }
    setLoading(true);
    Promise.all(
      documentIds.map((id) =>
        fetch(`${LIST_DOCUMENT_ANALYTICS_URL}?company_id=${encodeURIComponent(companyId)}&document_id=${encodeURIComponent(id)}`, {
          credentials: "include",
        })
          .then((res) => (res.ok ? (res.json() as Promise<DocumentAnalytics>) : null))
          .catch(() => null)
      )
    )
      .then((results) => {
        const valid = results.filter((r): r is DocumentAnalytics => r !== null);
        setData({
          total_opens: valid.reduce((sum, r) => sum + r.total_opens, 0),
          total_downloads: valid.reduce((sum, r) => sum + r.total_downloads, 0),
          by_fund: mergeByFund(valid.flatMap((r) => r.by_fund)),
          by_person: mergeByPerson(valid.flatMap((r) => r.by_person)),
        });
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, companyId, JSON.stringify(documentIds)]);

  return { data, loading };
}
