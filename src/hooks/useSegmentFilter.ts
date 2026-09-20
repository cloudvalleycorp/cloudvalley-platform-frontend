import { useMemo, useState } from "react";
import { useSegments } from "@/hooks/useSegments";

// Filtro de segmento compartido por Overview/Portfolio/Reporting/Data
// Room/Tasks (investor) — las 5 pantallas repetían la misma lógica de
// leer useSegments(), guardar el segmento elegido, y angostar su propio
// array de companies. selectedSegmentId es undefined = "Todos los
// segmentos", nunca un string vacío.
export function useSegmentFilter(companies: { id: string; name: string }[]) {
  const { segments, loading } = useSegments();
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | undefined>(undefined);

  const selectedSegment = useMemo(
    () => segments.find((s) => s.segment_id === selectedSegmentId),
    [segments, selectedSegmentId]
  );

  const filteredCompanies = useMemo(
    () => (selectedSegment ? companies.filter((c) => selectedSegment.company_ids.includes(c.id)) : companies),
    [companies, selectedSegment]
  );

  return { segments, segmentsLoading: loading, selectedSegmentId, setSelectedSegmentId, filteredCompanies };
}
