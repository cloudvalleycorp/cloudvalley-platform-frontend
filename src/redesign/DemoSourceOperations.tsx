import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/FormField";
import { useDemoIntegrations } from "./demoIntegrationStore";
import { applySourcePreview, previewSource, sourceMappings, type SourcePreview } from "./sourceSimulation";
import { DocumentFile } from "./DocumentFile";
import type { RecordItem } from "./model";

export function DemoSourceOperations({ item, onSave, onEdit, close }: { item: RecordItem; onSave: (item: RecordItem) => void; onEdit: () => void; close: () => void }) {
  const { state } = useDemoIntegrations();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [outcome, setOutcome] = useState<"success" | "partial" | "schema">("success");
  const [notice, setNotice] = useState("");
  const source = item.fields?.source || (item.category === "Google Sheets" ? "sheet" : item.category === "Integración" ? "integration" : "excel");
  const account = state.accounts.find(a => a.id === (item.fields?.account_id || "demo-account"));
  const blocked = source === "sheet" && (state.paused || !account?.connected || account.reconnect);
  const mappings = sourceMappings(item);
  const integrationLink = () => { close(); navigate("/redesign/settings#integrations"); };
  if (source === "integration") return <div className="rd-mapped-form"><p className="rd-info-note">La conexión y sus ejecuciones se administran en Integraciones. Los valores de esta fuente son ejemplos.</p><Button variant="outline" onClick={integrationLink}>Gestionar integración</Button></div>;
  return <div className="rd-mapped-form"><h3>Revisar e importar datos</h3><p className="rd-muted">Muestra local de junio a agosto de 2026. La simulación aplica tu mapeo a estos datos; no lee Google Sheets ni interpreta el archivo adjunto.</p>{blocked && <div className="rd-mapped-form"><p role="alert" className="rd-field-error">{state.paused ? "Google Sheets está pausado por el administrador." : account?.reconnect ? "El permiso de esta cuenta venció. Reconectala para continuar." : "La cuenta está desconectada."}</p><Button variant="outline" onClick={integrationLink}>Revisar cuenta en Integraciones</Button></div>}{!mappings.length && <p className="rd-info-note">Definí el mapeo de campos antes de importar la muestra.</p>}
    <div className="rd-value-actions"><Button disabled={!!blocked || !mappings.length} variant="outline" onClick={() => { setPreview(previewSource(item, outcome)); setNotice("Vista previa: todavía no se guardó ningún dato."); }}>Revisar muestra</Button><Button disabled={!!blocked || !mappings.length} onClick={() => { const result = previewSource(item, outcome); onSave(applySourcePreview(item, result)); setPreview(result); setNotice(result.result.status === "error" ? "No se importaron datos. Revisá los errores y reintentá." : result.result.rows_rejected ? "Importación parcial. Se conservaron los datos anteriores de las filas rechazadas." : "Muestra importada en la demo."); }}>Sincronizar muestra</Button><Button variant="ghost" onClick={onEdit}>Revisar mapeo</Button></div>
    {notice && <p role="status" className="rd-muted">{notice}</p>}
    {preview && <div className="rd-mapped-form"><dl className="rd-review"><div><dt>Filas válidas</dt><dd>{preview.result.rows_processed}</dd></div><div><dt>Rechazadas</dt><dd>{preview.result.rows_rejected}</dd></div><div><dt>Nuevas / actualizadas / eliminadas</dt><dd>{preview.result.inserted_rows} / {preview.result.updated_rows} / {preview.result.deleted_rows}</dd></div></dl>{preview.result.row_errors.map((error, index) => <p role="alert" className="rd-field-error" key={index}>{error.field}{error.period ? ` · ${error.period}` : ""}: {error.reason}</p>)}{preview.rows.length > 0 && <div className="rd-source-table"><table><caption>Datos de la muestra con el mapeo actual</caption><thead><tr><th>Período</th>{mappings.map(m => <th key={m.key}>{m.key}</th>)}</tr></thead><tbody>{preview.rows.map(row => <tr key={row.period}><th>{row.period}</th>{mappings.map(m => <td key={m.key}>{row.values[m.key]}</td>)}</tr>)}</tbody></table></div>}</div>}
    <details><summary>Datos importados ({item.sourceRows?.length || 0} períodos)</summary>{item.sourceRows?.map(row => <p className="rd-muted" key={row.period}>{row.period}: {Object.entries(row.values).map(([key, value]) => `${key} = ${value}`).join(" · ")}</p>) || <p className="rd-muted">Todavía no importaste la muestra.</p>}</details>
    <details><summary>Historial de ejecuciones ({item.sourceRuns?.length || 0})</summary>{item.sourceRuns?.map(run => <div key={run.id} className="rd-source-run"><strong>{new Date(run.at).toLocaleString("es-AR")}</strong><p>{run.result.status === "error" ? "Error" : run.result.rows_rejected ? "Importación parcial" : "Completada"} · {run.result.rows_processed} filas válidas · {run.result.rows_rejected} rechazadas</p><p>{run.result.inserted_rows} nuevas · {run.result.updated_rows} actualizadas · {run.result.deleted_rows} eliminadas</p>{run.result.row_errors.map((error, index) => <p key={index}>{error.field}: {error.reason}</p>)}</div>) || <p className="rd-muted">Sin ejecuciones todavía. La vista previa no genera una importación.</p>}</details>
    {source === "excel" && <DocumentFile id={item.id} />}
    <details><summary>Probar resultados de la importación</summary><FormField label="Resultado de la muestra" htmlFor="sample-outcome"><select id="sample-outcome" value={outcome} onChange={e => { setOutcome(e.target.value as typeof outcome); setPreview(null); setNotice(""); }}><option value="success">Muestra válida</option><option value="partial">Una fila inválida</option><option value="schema">Columna faltante</option></select></FormField></details>
  </div>;
}
