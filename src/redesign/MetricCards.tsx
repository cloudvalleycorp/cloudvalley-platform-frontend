import { ChevronRight } from "lucide-react";
import { evaluateMetric, metricDisplay } from "./metricEvaluation";
import type { RecordItem } from "./model";

const periods = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
export function MetricCards({ items, records, onOpen }: { items: RecordItem[]; records: RecordItem[]; onOpen: (item: RecordItem) => void }) {
  return <div className="rd-metric-grid">{items.map(item => {
    const points = periods.map((period, index) => ({ period, index, value: evaluateMetric(item, records, period).value })).filter((point): point is { period: string; index: number; value: number } => typeof point.value === "number");
    const minimum = Math.min(...points.map(point => point.value));
    const maximum = Math.max(...points.map(point => point.value));
    const y = (value: number) => maximum === minimum ? 32 : 56 - (value - minimum) / (maximum - minimum) * 48;
    const previous = points.find(point => point.period === "2026-07")?.value;
    const current = points.find(point => point.period === "2026-08")?.value;
    const change = previous !== undefined && current !== undefined && previous !== 0 ? (current - previous) / Math.abs(previous) * 100 : null;
    return <button key={item.id} className="rd-metric-card" aria-label={`Ver detalle: ${item.name}`} onClick={() => onOpen(item)}>
      <span className="rd-metric-card-top"><span>{item.category}</span><span className="rd-badge neutral">{item.status}</span></span>
      <strong className="rd-metric-card-name">{item.name}</strong>
      <span className="rd-metric-card-value">{metricDisplay(item, records)}</span>
      <span className="rd-metric-card-comparison">{change === null ? "Agosto 2026 · Real" : `${change > 0 ? "+" : ""}${change.toLocaleString("es-AR", { maximumFractionDigits: 1 })}% vs. julio`}</span>
      {points.length >= 2 ? <svg viewBox="0 0 260 64" className="rd-metric-chart" role="img" aria-label={points.map(point => `${point.period}: ${point.value.toLocaleString("es-AR")}`).join("; ")}>
        {points.slice(1).map((point, index) => point.index === points[index].index + 1 && <line key={point.period} x1={8 + points[index].index * 48} y1={y(points[index].value)} x2={8 + point.index * 48} y2={y(point.value)} />)}
        {points.map(point => <circle key={point.period} cx={8 + point.index * 48} cy={y(point.value)} r="3"><title>{point.period}: {point.value}</title></circle>)}
      </svg> : <span className="rd-metric-no-history">{points.length ? "Falta otro período para ver la evolución" : "Sin historial numérico disponible"}</span>}
      <span className="rd-metric-card-footer"><span>{points.length >= 2 ? "Mar–ago 2026 · Datos disponibles" : "Consultá o cargá valores en el detalle"}</span><ChevronRight size={16} /></span>
    </button>;
  })}</div>;
}
