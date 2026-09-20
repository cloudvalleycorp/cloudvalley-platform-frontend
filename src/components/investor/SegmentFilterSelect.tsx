import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Segment } from "@/lib/portfolioIntelligence";

// Se usa junto a useSegmentFilter.ts en las 5 pantallas portfolio-wide de
// investor. Oculto por completo sin segmentos creados todavía — progressive
// disclosure, mismo criterio que el empty state de "Crear el primero" en
// FundMetricRequirements.tsx.
export function SegmentFilterSelect({
  segments,
  value,
  onChange,
}: {
  segments: Segment[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  if (segments.length === 0) return null;
  return (
    <Select value={value ?? "all"} onValueChange={(v) => onChange(v === "all" ? undefined : v)}>
      <SelectTrigger className="w-full sm:w-52 h-9" aria-label="Filtrar por segmento">
        <SelectValue placeholder="Todos los segmentos" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos los segmentos</SelectItem>
        {segments.map((s) => (
          <SelectItem key={s.segment_id} value={s.segment_id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
