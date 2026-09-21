import { useState } from "react";
import { metricDisplay } from "./metricEvaluation";
import type { RecordItem } from "./model";

const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export function MetricGrid({ items, records, onOpen }: { items: RecordItem[]; records: RecordItem[]; onOpen: (item: RecordItem) => void }) {
  const [year, setYear] = useState(2026);
  const [scenario, setScenario] = useState("actual");
  return <>
    <div className="rd-grid-controls"><div><button aria-label="Año anterior" disabled={year <= 1900} onClick={() => setYear(year - 1)}>←</button><strong aria-live="polite">{year}</strong><button aria-label="Año siguiente" disabled={year >= 2100} onClick={() => setYear(year + 1)}>→</button></div><label>Escenario <select aria-label="Escenario" value={scenario} onChange={event => setScenario(event.target.value)}><option value="actual">Real</option><option value="forecast">Forecast</option><option value="budget">Presupuesto</option></select></label></div>
    <div className="rd-period-grid" role="region" aria-label="Valores mensuales de métricas" tabIndex={0}>
      <table><caption className="sr-only">Métricas de {year}, escenario {scenario === "actual" ? "real" : scenario === "budget" ? "presupuesto" : "forecast"}. Abrí una métrica desde su nombre para consultar o editar sus valores.</caption><thead><tr><th scope="col">Métrica</th>{months.map(month => <th scope="col" key={month}>{month}</th>)}</tr></thead>
        <tbody>{items.map(item => <tr key={item.id}><th scope="row"><button aria-label={`Ver detalle: ${item.name}`} onClick={() => onOpen(item)}>{item.name}<small>{item.category}</small></button></th>{months.map((month, index) => { const value = metricDisplay(item, records, `${year}-${String(index + 1).padStart(2, "0")}`, scenario); return <td key={month}>{value === "Sin datos" ? <span className="rd-grid-missing" aria-label="Sin datos">—</span> : value}</td>; })}</tr>)}</tbody>
      </table>
    </div>
    <p className="rd-grid-hint">Abrí una métrica desde su nombre para consultar o editar valores. — indica que no hay datos.</p>
  </>;
}
