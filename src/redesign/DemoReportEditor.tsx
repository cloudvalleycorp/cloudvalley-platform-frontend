import { metricDisplay } from "./metricEvaluation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/FormField";
import { SectionCard } from "@/components/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import type { ReportSection } from "@/lib/financialReports";
import type { RecordItem } from "./model";

export function DemoReportEditor({ item, records, onSave, onOpenMetric, onAsk }: { item: RecordItem; records: RecordItem[]; onSave: (item: RecordItem) => void; onOpenMetric: (metric: RecordItem) => void; onAsk?: (report: RecordItem) => void }) {
  const key = `cloudvalley-redesign-report-${item.id}`;
  const [state, setState] = useState<{ name: string; sections: ReportSection[]; shares: Record<string, string | boolean> }>(() => {
    try { const saved = JSON.parse(localStorage.getItem(key) || "null"); if (saved && typeof saved.name === "string" && Array.isArray(saved.sections)) return { ...saved, shares: saved.shares || item.fields || {} }; } catch { /* Start from saved report. */ }
    return { name: item.name, shares: item.fields || {}, sections: item.sections || (item.id.startsWith("report") ? [{ title: "Resultados", subtitle: item.detail || null, blocks: [{ metric_id: "mrr" }, { metric_id: "runway" }] }] : []) };
  });
  const [mode, setMode] = useState("edit");
  const [period, setPeriod] = useState("2026-08");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(() => { try { return !!localStorage.getItem(key); } catch { return false; } });
  const [remove, setRemove] = useState<number | null>(null);
  const shares = state.shares;
  const metrics = records.filter(r => r.area === "metrics");
  const update = (next: typeof state) => { setState(next); setDirty(true); try { localStorage.setItem(key, JSON.stringify(next)); } catch { setError("No se pudo conservar el borrador en el navegador."); } };
  const section = (index: number, next: ReportSection) => update({ ...state, sections: state.sections.map((s, i) => i === index ? next : s) });
  const move = <T,>(rows: T[], index: number, by: number) => { const next = [...rows]; [next[index], next[index + by]] = [next[index + by], next[index]]; return next; };
  const valueFor = (metric?: RecordItem) => metricDisplay(metric, records, period);
  const save = () => {
    if (!state.name.trim()) { setError("Escribí el nombre del reporte."); return; }
    if (state.sections.some(s => !s.title.trim())) { setError("Cada sección necesita un título."); return; }
    onSave({ ...item, name: state.name.trim(), sections: state.sections, fields: shares, value: `${records.filter(r => r.area === "connections" && r.status === "Conectado" && shares[`share_${r.id}`]).length} fondos`, status: records.some(r => r.area === "connections" && r.status === "Conectado" && shares[`share_${r.id}`]) ? "Compartido" : "Borrador" });
    setDirty(false); setError(""); try { localStorage.removeItem(key); } catch { /* Current state remains saved. */ }
  };
  const print = () => {
    const frame = document.createElement("iframe"); frame.title = "Imprimir reporte"; frame.style.cssText = "position:fixed;width:0;height:0;border:0"; document.body.appendChild(frame);
    const doc = frame.contentDocument; const win = frame.contentWindow;
    if (!doc || !win) { frame.remove(); setError("No se pudo preparar el PDF. Volvé a intentarlo."); return; }
    const style = doc.createElement("style"); style.textContent = "body{font:14px system-ui;padding:32px;color:#222}h1{font-size:28px}section{margin:28px 0;break-inside:avoid}p{white-space:pre-wrap}li{margin:12px 0}@page{margin:15mm}"; doc.head.appendChild(style);
    doc.title = state.name;
    const add = (parent: HTMLElement, tag: string, text: string) => { const el = doc.createElement(tag); el.textContent = text; parent.appendChild(el); return el; };
    add(doc.body, "h1", state.name); add(doc.body, "p", `${period} · Datos de demostración`);
    state.sections.forEach(s => { const node = add(doc.body, "section", ""); add(node, "h2", s.title); if (s.subtitle) add(node, "p", s.subtitle); const list = add(node, "ul", ""); s.blocks.forEach(b => { const metric = metrics.find(m => m.id === b.metric_id); add(list, "li", `${metric?.name || "Métrica no disponible"}: ${valueFor(metric)}`); }); });
    win.addEventListener("afterprint", () => frame.remove(), { once: true }); win.focus(); win.print(); setTimeout(() => frame.remove(), 60000);
  };
  return <div className="rd-mapped-form">
    {onAsk && <Button variant="ghost" onClick={() => onAsk({ ...item, name: state.name, sections: state.sections, fields: shares })}>Revisar este reporte con el asistente</Button>}
    <div className="rd-value-actions"><Button variant={mode === "edit" ? "default" : "outline"} aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>Editar reporte</Button><Button variant={mode === "preview" ? "default" : "outline"} aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>Vista previa</Button><Button variant="outline" onClick={print}><Printer size={15} />Imprimir / guardar PDF</Button></div>
    {mode === "edit" ? <>
      <FormField label="Nombre del reporte" htmlFor="report-name"><Input id="report-name" value={state.name} onChange={e => update({ ...state, name: e.target.value })} /></FormField>
      {state.sections.map((s, si) => <SectionCard key={si} title={`Sección ${si + 1}`} action={<><Button size="icon" variant="ghost" aria-label={`Subir sección ${si + 1}`} disabled={si === 0} onClick={() => update({ ...state, sections: move(state.sections, si, -1) })}><ArrowUp size={15} /></Button><Button size="icon" variant="ghost" aria-label={`Bajar sección ${si + 1}`} disabled={si === state.sections.length - 1} onClick={() => update({ ...state, sections: move(state.sections, si, 1) })}><ArrowDown size={15} /></Button><Button size="icon" variant="ghost" aria-label={`Eliminar sección ${si + 1}`} onClick={() => setRemove(si)}><Trash2 size={15} /></Button></>}>
        <div className="rd-mapped-form"><FormField label="Título de la sección" htmlFor={`section-title-${si}`}><Input id={`section-title-${si}`} value={s.title} onChange={e => section(si, { ...s, title: e.target.value })} /></FormField><FormField label="Subtítulo (opcional)" htmlFor={`section-subtitle-${si}`}><textarea id={`section-subtitle-${si}`} value={s.subtitle || ""} onChange={e => section(si, { ...s, subtitle: e.target.value || null })} /></FormField>
        {s.blocks.map((b, bi) => <div key={b.metric_id} className="rd-report-block"><span>{metrics.find(m => m.id === b.metric_id)?.name || "Métrica no disponible"}</span><Button size="icon" variant="ghost" aria-label={`Subir métrica ${bi + 1} de sección ${si + 1}`} disabled={bi === 0} onClick={() => section(si, { ...s, blocks: move(s.blocks, bi, -1) })}><ArrowUp size={14} /></Button><Button size="icon" variant="ghost" aria-label={`Bajar métrica ${bi + 1} de sección ${si + 1}`} disabled={bi === s.blocks.length - 1} onClick={() => section(si, { ...s, blocks: move(s.blocks, bi, 1) })}><ArrowDown size={14} /></Button><Button size="icon" variant="ghost" aria-label={`Quitar métrica ${bi + 1} de sección ${si + 1}`} onClick={() => section(si, { ...s, blocks: s.blocks.filter((_, i) => i !== bi) })}><Trash2 size={14} /></Button></div>)}
        <FormField label="Agregar métrica" htmlFor={`add-metric-${si}`}><select id={`add-metric-${si}`} value="" onChange={e => section(si, { ...s, blocks: [...s.blocks, { metric_id: e.target.value }] })}><option value="" disabled>Elegí una métrica</option>{metrics.filter(m => !s.blocks.some(b => b.metric_id === m.id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></FormField></div>
      </SectionCard>)}
      <Button variant="outline" onClick={() => update({ ...state, sections: [...state.sections, { title: "Nueva sección", subtitle: null, blocks: [] }] })}><Plus size={15} />Agregar sección</Button>
    </> : <><FormField label="Período del reporte" htmlFor="report-period"><Input id="report-period" type="month" value={period} onChange={e => setPeriod(e.target.value)} /></FormField>{!state.sections.length && <EmptyState title="Sin secciones" action={{ label: "Agregar sección", onClick: () => setMode("edit") }} />}{state.sections.map((s, i) => <SectionCard key={i} title={s.title} description={s.subtitle || undefined}>{s.blocks.map(b => { const metric = metrics.find(m => m.id === b.metric_id); return <button className="rd-report-preview-row" key={b.metric_id} disabled={!metric} onClick={() => metric && onOpenMetric(metric)} aria-label={`Ver detalle: ${metric?.name || "Métrica no disponible"}`}><span>{metric?.name || "Métrica no disponible"}</span><strong>{valueFor(metric)}</strong></button>; })}</SectionCard>)}</>}
    <details><summary>Compartir con fondos conectados</summary><div className="rd-mapped-form">{records.filter(r => r.area === "connections" && r.status === "Conectado").map(fund => <label className="rd-checkbox-row" key={fund.id}><input type="checkbox" checked={!!shares[`share_${fund.id}`]} onChange={e => { update({ ...state, shares: { ...shares, [`share_${fund.id}`]: e.target.checked } }); }} />{fund.name}</label>)}</div></details>
    {error && <p role="alert" className="rd-field-error">{error}</p>}{dirty && <p role="status" className="rd-muted">Cambios pendientes de guardar.</p>}<Button onClick={save}>Guardar reporte</Button>
    <ConfirmationDialog open={remove !== null} onOpenChange={open => !open && setRemove(null)} title="Eliminar sección" description="Se quitarán la sección y sus métricas del reporte. Las métricas originales se conservan." confirmLabel="Eliminar sección" onConfirm={() => { update({ ...state, sections: state.sections.filter((_, i) => i !== remove) }); setRemove(null); }} />
  </div>;
}
