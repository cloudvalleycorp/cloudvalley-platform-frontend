import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { RecordItem } from "./model";
import { readReportActivity, reportActivityKey, reportAnalytics } from "./reportActivity";

export function DemoReportActivity({ item, records, onAsk }: { item: RecordItem; records: RecordItem[]; onAsk: () => void }) {
  const [rows, setRows] = useState(() => readReportActivity(item.id));
  const [fundId, setFundId] = useState("");
  const [error, setError] = useState("");
  const eligible = records.filter(record => record.area === "connections" && record.status === "Conectado" && item.fields?.[`share_${record.id}`]);
  const selected = eligible.find(fund => fund.id === fundId) || eligible[0];
  const data = reportAnalytics(item.id, rows);
  const simulate = () => {
    if (!selected) return;
    const next = [...rows, { fundId: selected.id, fundName: selected.name, at: new Date().toISOString(), seconds: 90, scroll: 75 }];
    try { localStorage.setItem(reportActivityKey(item.id), JSON.stringify(next)); setRows(next); setError(""); } catch { setError("No se pudo guardar la lectura simulada. Volvé a intentarlo."); }
  };
  return <details className="rd-report-activity"><summary>Actividad de lectura</summary><div className="rd-mapped-form">
    <p className="rd-muted">Solo eventos simulados. Abrir tu vista previa no cuenta como una lectura de un inversor.</p>
    {rows.length ? <><p><strong>{data.total_opens}</strong> aperturas · <strong>{data.total_active_seconds}</strong> segundos activos</p>{data.by_fund.map(fund => <div key={fund.fund_id}><strong>{rows.find(row => row.fundId === fund.fund_id)?.fundName}</strong><p>{fund.opens} aperturas · {fund.active_seconds} segundos · {fund.max_scroll_pct}% visto</p><small>Última lectura simulada: {new Date(rows.filter(row => row.fundId === fund.fund_id).at(-1)!.at).toLocaleString("es-AR")}</small></div>)}</> : <p>Todavía no hay lecturas simuladas.</p>}
    {eligible.length ? <><label>Fondo para la simulación<select aria-label="Fondo para la simulación" value={selected.id} onChange={event => setFundId(event.target.value)}>{eligible.map(fund => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></label><Button variant="outline" onClick={simulate}>Simular lectura: 90 s y 75% visto</Button></> : <p className="rd-info-note">Guardá el reporte compartido con un fondo conectado para simular su lectura.</p>}
    {error && <p role="alert">{error}</p>}<Button variant="ghost" onClick={onAsk}>Consultar actividad al asistente</Button>
  </div></details>;
}
