import { useEffect, useRef, useState } from "react";
import { BrowserRouter, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, Bell, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Cloud, Database, FileText, FolderOpen, LayoutDashboard, LockKeyhole, Menu, Network, Plus, Search, Settings, Sparkles, Target, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonSection } from "@/components/SkeletonSection";
import { initialRecords, meta, type Area, type RecordItem } from "./model";
import { CreateWizard, RecordFields, type Draft } from "./ProductionForms";
import { ProductionSettings } from "./ProductionSettings";
import { documentAccessLabel } from "./documentAccess";
import { ResourceAccess } from "./ResourceAccess";
import { DemoAssistantContextProvider } from "./DemoAssistantContext";
import { DemoAssistant } from "./DemoAssistant";
import type { AssistantAction, AssistantContext, AssistantProposal } from "./assistantModel";
import { validateQuery } from "@/lib/querySpec";
import { DemoIdentityImage } from "./DemoIdentityImage";
import { DemoMembershipGate } from "./DemoTeam";
import { useDemoTeam } from "./demoTeamStore";
import { TaskEvidence } from "./TaskEvidence";
import { reconcileTaskEvidence } from "./reconcileTaskEvidence";
import { DemoSourceOperations } from "./DemoSourceOperations";
import { DemoConnection } from "./DemoConnection";
import { DemoDataRoom } from "./DemoDataRoom";
import { DocumentFile } from "./DocumentFile";
import { DemoReportEditor } from "./DemoReportEditor";
import { MetricValueEntry } from "./MetricValueEntry";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./redesign.css";

const navigation = [
  { id: "overview", label: "Vista general", icon: LayoutDashboard },
  { id: "metrics", label: "Métricas", icon: BarChart3 },
  { id: "sources", label: "Fuentes de datos", icon: Database },
  { id: "roadmap", label: "Roadmap", icon: Target },
  { id: "reports", label: "Reportes", icon: FileText },
  { id: "documents", label: "Data Room", icon: FolderOpen },
  { id: "connections", label: "Conexiones", icon: Network },
] as const;
const storageKey = "cloudvalley-redesign-v1";
function readPreferences(): { stage: string; description: string } {
  try { const p = JSON.parse(localStorage.getItem(`${storageKey}-preferences`) || "null"); if (p && typeof p.stage === "string" && typeof p.description === "string") return p; } catch { /* Use defaults. */ }
  return { stage: "Seed", description: "Construimos tecnología para que las personas puedan llegar más lejos." };
}
function readRecords(): RecordItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (Array.isArray(value) && value.every(r => r && typeof r.id === "string" && r.area in meta && [r.name, r.category, r.detail, r.value, r.status].every(v => typeof v === "string"))) return value.map(r => ({ ...r, sections: r.sections ?? initialRecords.find(seed => seed.id === r.id)?.sections, fields: { ...initialRecords.find(seed => seed.id === r.id)?.fields, ...r.fields } }));
  } catch { /* A fresh demo also works when storage is unavailable. */ }
  return initialRecords;
}
function Badge({ children }: { children: string }) {
  const tone = /Al día|Completado|Conectado/.test(children) ? "good" : /Revisar|Pendiente/.test(children) ? "warning" : /Compartido|progreso/.test(children) ? "info" : "neutral";
  return <span className={`rd-badge ${tone}`}><span />{children}</span>;
}
function Sparkline({ variant = 0 }: { variant?: number }) {
  const points = ["0,35 15,30 28,32 42,20 57,26 73,12 88,16 104,3", "0,29 16,32 31,21 44,25 61,13 75,18 90,10 104,5", "0,12 16,15 30,9 45,17 60,12 75,21 90,16 104,20"];
  return <svg className="rd-sparkline" viewBox="0 0 106 42" aria-hidden="true"><polyline points={points[variant % 3]} /></svg>;
}
function RevenueChart() {
  const bars = [45, 49, 55, 59, 64, 72, 77, 88];
  return <div className="rd-chart" role="img" aria-label="MRR de ejemplo: crece de 52 mil dólares en enero a 101 mil en agosto de 2026. Meta de agosto: 110 mil dólares.">
    <div className="rd-y-axis"><span>$120k</span><span>$90k</span><span>$60k</span><span>$30k</span><span>$0</span></div>
    <div className="rd-plot"><div className="rd-grid-lines" />{bars.map((v, i) => <div className="rd-bar-group" key={i}><div className="rd-bar-pair"><div className="rd-bar forecast" style={{ height: `${v + 9}%` }} /><div className="rd-bar actual" style={{ height: `${v}%` }} /></div><span>{["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago"][i]}</span></div>)}</div>
  </div>;
}

function Workspace() {
  const { self } = useDemoTeam();
  const location = useLocation();
  const navigate = useNavigate();
  const segment = location.pathname.split("/")[2] || "overview";
  const area: Area = segment in meta ? segment as Area : "overview";
  const [records, setRecords] = useState(readRecords);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantContext, setAssistantContext] = useState<AssistantContext | null>(null);
  const [assistantRevision, setAssistantRevision] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [sort, setSort] = useState("original");
  const [page, setPage] = useState(1);
  const [view, setView] = useState("ready");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const pendingSelection = useRef<RecordItem | null>(null);
  const [wizard, setWizard] = useState<Area | null>(null);
  const [documentFolder, setDocumentFolder] = useState("");
  const [editing, setEditing] = useState<RecordItem | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() => { try { const d = JSON.parse(localStorage.getItem(`${storageKey}-draft`) || "null"); return d && d.area in meta && typeof d.name === "string" && typeof d.category === "string" && typeof d.detail === "string" && Number.isInteger(d.step) && d.step >= 0 && d.step <= 2 ? d : null; } catch { return null; } });
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const [info, setInfo] = useState<"notifications" | "help" | null>(null);
  const [company, setCompany] = useState(() => { try { return localStorage.getItem(`${storageKey}-company`) || "Maritos"; } catch { return "Maritos"; } });
    const [stage] = useState(() => readPreferences().stage);
  useEffect(() => { setQuery(""); setFilter("Todos"); setPage(1); setView("ready"); setMobile(false); setSelected(pendingSelection.current?.area === area ? pendingSelection.current : null); pendingSelection.current = null; }, [area]);
  useEffect(() => { const next = reconcileTaskEvidence(records); if (next !== records) { setRecords(next); setSelected(item => item ? next.find(r => r.id === item.id) || null : null); } }, [records]);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(records)); } catch { setNotice("El almacenamiento local no está disponible. Tus cambios se conservan durante esta sesión."); } }, [records]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 5500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (event.key === "Escape") setMobile(false); if ((event.metaKey || event.ctrlKey) && event.key === "k") { event.preventDefault(); setSearchOpen(v => !v); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);
  const go = (next: Area) => navigate(`/redesign/${next}`);
  const update = (item: RecordItem) => { setRecords(current => current.map(r => r.id === item.id ? item : r)); setSelected(item); setNotice("Cambios guardados en la demo."); };
  const create = (target: Area = area) => { setEditing(null); setWizard(target === "overview" ? "reports" : target); };
  const tasks = records.filter(r => r.area === "roadmap");
  const completed = tasks.filter(r => r.status === "Completado").length;
  const progress = Math.round(completed / Math.max(tasks.length, 1) * 100);
  const list = records.filter(r => r.area === area && `${r.name} ${r.category}`.toLowerCase().includes(query.toLowerCase()) && (filter === "Todos" || r.status === filter));
  const sorted = sort === "name" ? [...list].sort((a, b) => a.name.localeCompare(b.name, "es")) : list;
  const shown = view === "empty" ? [] : sorted.slice((page - 1) * 8, page * 8);
  const askAssistant = (context?: Partial<AssistantContext>) => { setAssistantContext(context ? { area: selected?.area || area, company, ...context } : null); setAssistantOpen(true); };
  const assistantAction = (action: AssistantAction): string | void => {
    if (wizard && action.kind !== "open") return "Cerrá el asistente y guardá el borrador antes de salir del formulario.";
    if (action.kind === "open") { const item = records.find(r => r.id === action.id); if (!item) return "Ese registro ya no está disponible."; if (wizard) return "Cerrá el asistente y guardá el borrador antes de abrir otro registro."; setSelected(item); }
    else if (action.kind === "navigate") { setSelected(null); navigate(`/redesign/${action.area}${action.anchor ? `#${action.anchor}` : ""}`); }
    else { if (action.area === "connections" && !self?.owner) return "Solo un owner puede solicitar conexiones."; setSelected(null); create(action.area); }
  };
  const applyAssistant = (proposal: AssistantProposal): string | void => {
    const item = proposal.item;
    if (!["metrics", "reports"].includes(item.area)) return "Esta propuesta no se puede aplicar desde el asistente.";
    if (item.area === "metrics" && item.fields?.metric_type === "calculated" && validateQuery(item.query || null).length) return "La consulta necesita una revisión antes de guardarse.";
    if (proposal.original) { const current = records.find(r => r.id === item.id); if (!current || JSON.stringify(current) !== JSON.stringify(proposal.original)) return "El registro cambió desde esta propuesta. Pedí una nueva revisión para conservar los cambios recientes."; }
    else if (records.some(r => r.id === item.id || (r.area === item.area && r.name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase()))) return "Ya existe un registro con ese nombre. Revisalo antes de crear otro.";
    if (item.sections?.some(section => section.blocks.some(block => !records.some(r => r.area === "metrics" && r.id === block.metric_id)))) return "Una métrica de la propuesta ya no está disponible. Pedí una nueva propuesta.";
    setRecords(current => proposal.original ? current.map(r => r.id === item.id ? item : r) : [item, ...current]);
    setSelected(current => current?.id === item.id ? item : current); if (proposal.original) setAssistantRevision(revision => revision + 1);
    if (proposal.original?.area === "reports") { try { localStorage.removeItem(`cloudvalley-redesign-report-${item.id}`); } catch { /* The saved record remains available. */ } }
  };
  const header = meta[area];
  if (!self) return <DemoMembershipGate />;
  return <DemoAssistantContextProvider value={askAssistant}><div className="rd-root">
    <a href="#redesign-content" className="rd-skip">Saltar al contenido</a>
    {mobile && <button className="rd-scrim" aria-label="Cerrar navegación" onClick={() => setMobile(false)} />}
    <aside id="redesign-navigation" className={`rd-sidebar ${mobile ? "open" : ""}`} aria-label="Navegación Founder">
      <NavLink to="/redesign" className="rd-brand"><Cloud size={29} strokeWidth={2.3} /><span>cloudvalley<span className="rd-brand-dot">.</span></span></NavLink>
      <div className="rd-workspace"><DemoIdentityImage kind="logo" fallback="m" className="rd-startup-logo" /><div><strong>{company}</strong><small>Founder workspace</small></div><span className="rd-stage">{stage}</span></div>
      <p className="rd-nav-label">TU WORKSPACE</p>
      <nav>{navigation.map(({ id, label, icon: Icon }) => <NavLink key={id} to={`/redesign/${id}`} className={() => `rd-nav-item ${area === id ? "active" : ""}`} aria-current={area === id ? "page" : undefined}><Icon size={18} strokeWidth={1.7} /><span>{label}</span>{id === "roadmap" && <span className="rd-nav-count">{tasks.length - completed}</span>}</NavLink>)}</nav>
      <div className="rd-sidebar-bottom">
        <button className={`rd-nav-item ${area === "settings" ? "active" : ""}`} onClick={() => go("settings")}><Settings size={18} />Configuración</button>
        <button className="rd-nav-item" onClick={() => setInfo("help")}><CircleHelp size={18} />Centro de ayuda <ArrowRight size={14} /></button>
        <button className="rd-user" onClick={() => go("settings")}><DemoIdentityImage kind="avatar" fallback="FM" /><span><strong>{self.name}</strong><small>Cuenta de demostración</small></span><ChevronDown size={15} /></button>
      </div>
    </aside>
    <div className="rd-main">
      <header className="rd-topbar"><div className="rd-breadcrumb"><button className="rd-icon-button rd-mobile-toggle" aria-label="Abrir navegación" aria-expanded={mobile} aria-controls="redesign-navigation" onClick={() => setMobile(true)}><Menu size={20} /></button><span>Workspace</span><ChevronRight size={13} /><strong>{navigation.find(n => n.id === area)?.label || "Configuración"}</strong></div><div className="rd-top-actions"><Button className="rd-assistant-trigger" variant="outline" onClick={() => askAssistant()} aria-label="Abrir asistente Founder"><Sparkles size={16} /><span>Asistente</span></Button><span className="rd-demo">Redesign · Demo</span><button className="rd-search-trigger" onClick={() => setSearchOpen(true)}><Search size={16} /><span>Buscar en tu workspace</span><kbd>Ctrl K</kbd></button><button className="rd-icon-button rd-notification" aria-label="Notificaciones" onClick={() => setInfo("notifications")}><Bell size={18} /><i /></button><DemoIdentityImage kind="avatar" fallback="FM" className="rd-avatar small" /></div></header>
      <main id="redesign-content" className="rd-content">
        <PageHeader title={header.title} className="rd-page-header" action={area !== "settings" && (area !== "connections" || self.owner) && <Button className="rd-primary" onClick={() => create()}><Plus size={16} />{header.action}</Button>} />
        {draft && <div className="rd-draft"><FileText size={17} /><span>Borrador pendiente: {draft.name}</span><button onClick={() => { setEditing(records.find(r => r.id === draft.editingId) || null); setWizard(draft.area); }}>Retomar <ArrowRight size={14} /></button></div>}
        {area === "overview" ? <>
          <div className="rd-summary"><span className="rd-summary-symbol"><Sparkles size={19} /></span><div><strong>MRR de agosto: +12,4%</strong><p>El estado de resultados necesita una revisión antes del próximo reporte.</p></div><button onClick={() => setSelected(records.find(r => r.id === "eerr") || null)}>Revisar estado de resultados <ArrowRight size={16} /></button></div>
          <div className="rd-kpis">{[{ label: "Ingresos recurrentes", value: "$101.000", delta: "+12,4%", sub: "MRR · vs. mes anterior" }, { label: "Ingresos anualizados", value: "$1,21M", delta: "+12,4%", sub: "ARR · vs. mes anterior" }, { label: "Runway disponible", value: "18", suffix: "meses", delta: "+2 meses", sub: "Al ritmo de gasto actual" }, { label: "Margen bruto", value: "72", suffix: "%", delta: "+3,2 pp", sub: "vs. mes anterior" }].map((k, i) => <button key={k.label} className="rd-kpi" aria-label={`Ver detalle: ${k.label}`} onClick={() => setSelected(records.find(r => r.id === ["mrr", "arr", "runway", "margin"][i]) || null)}><div className="rd-kpi-label">{k.label}<ArrowRight size={15} /></div><div className="rd-kpi-value">{k.value}<small>{k.suffix}</small></div><div className="rd-kpi-bottom"><div><span className="rd-positive"><TrendingUp size={12} />{k.delta}</span><p>{k.sub}</p></div><Sparkline variant={i} /></div><span className="rd-action-hint">Ver detalle</span></button>)}</div>
          <div className="rd-dashboard-grid"><SectionCard className="rd-revenue" title="Evolución del MRR" description="Ingresos recurrentes mensuales · USD" action={<button className="rd-text-button" onClick={() => go("metrics")}>Ver métricas <ArrowRight size={14} /></button>}><div className="rd-chart-heading"><strong>$101.000 <span>en agosto</span></strong><div className="rd-legend"><span><i />Real</span><span><i />Objetivo</span></div></div><RevenueChart /><div className="rd-chart-foot"><span><span className="rd-live-dot" />Fuente: Stripe · Datos de ejemplo</span><span>Ene – Ago 2026</span></div></SectionCard>
          <SectionCard className="rd-roadmap-card" title="Avance del roadmap" action={<span className="rd-stage">{stage}</span>}><div className="rd-progress-ring" style={{ "--progress": `${progress}%` } as React.CSSProperties}><div><strong>{progress}<small>%</small></strong><span>del roadmap</span></div></div><div className="rd-progress-caption"><CheckCircle2 size={15} />{completed} de {tasks.length} hitos completados</div><div className="rd-next-step"><small>TU SIGUIENTE PASO</small><strong>{tasks.find(t => t.status !== "Completado")?.name || "¡Todos los hitos completados!"}</strong><span>{tasks.find(t => t.status !== "Completado")?.category}</span></div><Button variant="outline" className="rd-full-button" onClick={() => { const next = tasks.find(t => t.status !== "Completado"); if (next) setSelected(next); else go("roadmap"); }}>{tasks.some(t => t.status !== "Completado") ? "Abrir siguiente tarea" : "Ver roadmap"} <ArrowRight size={15} /></Button></SectionCard></div>
          <div className="rd-dashboard-bottom"><SectionCard title="Lo que necesita tu atención" action={<span className="rd-count">{records.filter(r => r.status === "Revisar" || (r.id === "nrr" && r.status !== "Al día")).length} pendientes</span>}><div className="rd-priorities">{records.filter(r => r.status === "Revisar" || (r.id === "nrr" && r.status !== "Al día")).slice(0, 3).map((r, i) => <button key={r.id} onClick={() => setSelected(r)}><span className={`rd-priority-icon priority-${i}`}>{i === 0 ? <BarChart3 size={18} /> : i === 1 ? <Target size={18} /> : <Database size={18} />}</span><span><strong>{r.name}</strong><small>{r.area === "sources" ? "Revisá el mapeo de tu fuente" : "Completá los datos para tu próximo reporte"}</small></span><span className="rd-action-hint">Ver detalle</span><ChevronRight size={16} /></button>)}</div></SectionCard><SectionCard title="Actividad reciente" action={<button className="rd-text-button" onClick={() => setInfo("notifications")}>Ver todo <ArrowRight size={14} /></button>}><div className="rd-activity">{[{ icon: FileText, text: "North Capital abrió tu reporte", sub: "Investor update · agosto", time: "Hace 2 h" }, { icon: Database, text: "Tus ingresos están al día", sub: "Stripe · sincronización completada", time: "Hace 3 h" }, { icon: CheckCircle2, text: "Tarea completada", sub: "Estrategia de ronda completada", time: "Ayer" }].map(a => <div key={a.text}><span><a.icon size={15} /></span><div><strong>{a.text}</strong><p>{a.sub}</p><small>{a.time}</small></div></div>)}</div></SectionCard></div>
        </> : area === "documents" ? <DemoDataRoom records={records} current={documentFolder} setCurrent={setDocumentFolder} open={setSelected} create={() => create("documents")} updateRecords={setRecords} notice={setNotice} /> : area === "settings" ? <ProductionSettings company={company} onSaved={(name, message) => { setCompany(name); setNotice(message); }} /> : <>
          {area === "roadmap" && <div className="rd-roadmap-progress"><span>Tu preparación para la ronda</span><progress value={completed} max={Math.max(tasks.length, 1)} /><strong>{progress}%</strong></div>}
          <div className="rd-toolbar"><div className="rd-search-field"><Search size={17} /><Input aria-label="Buscar en esta sección" placeholder="Buscar por nombre o categoría" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></div><select aria-label="Filtrar por estado" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="Todos">Todos los estados</option>{[...new Set(records.filter(r => r.area === area).map(r => r.status))].map(s => <option key={s}>{s}</option>)}</select><select aria-label="Ordenar" value={sort} onChange={e => setSort(e.target.value)}><option value="original">Orden original</option><option value="name">Nombre A–Z</option></select></div>
          {view === "loading" ? <SkeletonSection rows={5} columns={4} /> : view === "error" ? <EmptyState icon={Cloud} title="No pudimos cargar esta sección" description="Volvé a intentar cargar los datos." action={{ label: "Reintentar", onClick: () => setView("ready") }} /> : !shown.length ? <EmptyState icon={Search} title={query || filter !== "Todos" ? "No encontramos coincidencias" : `Todavía no hay ${area === "roadmap" ? "tareas" : area === "connections" ? "conexiones" : meta[area].title.toLowerCase()}`} description={query || filter !== "Todos" ? "Probá con otro nombre o quitá los filtros." : undefined} action={{ label: query || filter !== "Todos" ? "Limpiar filtros" : header.action, onClick: () => { if (query || filter !== "Todos") { setQuery(""); setFilter("Todos"); setView("ready"); } else create(); } }} /> : <div className="rd-collection"><div className="rd-table-head"><span>Nombre</span><span>{area === "metrics" ? "Valor actual" : area === "roadmap" ? "Vencimiento" : area === "sources" ? "Datos vinculados" : "Acceso"}</span><span>Estado</span><span /></div>{shown.map(item => <button key={item.id} className="rd-record" aria-label={`Ver detalle: ${item.name}`} onClick={() => setSelected(item)}><span className="rd-record-name"><span className={`rd-record-icon ${area}`} >{area === "reports" ? <FileText size={21} /> : area === "connections" ? <Network size={21} /> : area === "sources" ? <Database size={21} /> : area === "roadmap" ? <Target size={21} /> : <BarChart3 size={21} />}</span><span><strong>{item.name}</strong><small>{item.category}</small></span></span><span className="rd-record-value">{item.value}</span><Badge>{item.status}</Badge><span className="rd-row-action">Ver detalle <ChevronRight size={14} /></span></button>)}<div className="rd-pagination"><span>{list.length} resultados · Página {page}</span><div><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button><button disabled={page * 8 >= list.length} onClick={() => setPage(p => p + 1)}>Siguiente</button></div></div></div>}
          <details className="rd-state-preview"><summary>Vista de estados de la demo</summary><div>{[["ready", "Contenido"], ["loading", "Carga"], ["empty", "Vacío"], ["error", "Error"]].map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</div></details>
        </>}
        <footer className="rd-footer"><span>Datos de ejemplo · Los cambios se guardan en este navegador</span></footer>
      </main>
    </div>
    {notice && <div className="rd-toast" role="status"><CheckCircle2 size={18} /><span>{notice}</span><button aria-label="Cerrar aviso" onClick={() => setNotice("")}><X size={15} /></button></div>}
    {wizard && <CreateWizard onAsk={current => askAssistant({ area: current.area, draft: current })} initialFolderId={documentFolder} records={records} editing={editing} area={wizard} draft={draft?.area === wizard && draft.editingId === editing?.id ? draft : null} close={() => setWizard(null)} saveDraft={d => { setDraft(d); try { localStorage.setItem(`${storageKey}-draft`, JSON.stringify(d)); } catch { /* Available in session. */ } setWizard(null); setNotice("Borrador guardado. Podés retomarlo cuando quieras."); }} save={r => { setRecords(xs => xs.some(item => item.id === r.id) ? xs.map(item => item.id === r.id ? r : item) : [r, ...xs]); setDraft(null); try { localStorage.removeItem(`${storageKey}-draft`); } catch { /* No persistent storage. */ } setWizard(null); if (r.area !== area) pendingSelection.current = r; go(r.area); setView("ready"); setNotice(`${r.name}: guardado en la demo.`); setSelected(r); }} />}
    <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}><DialogContent className={`rd-root rd-dialog rd-detail ${selected?.area === "reports" ? "rd-report-dialog" : ""}`}>{selected && <><div className="rd-detail-icon"><FileText size={24} /></div><DialogTitle>{selected.name}</DialogTitle><DialogDescription>{selected.category} · Datos de demostración</DialogDescription><Badge>{selected.area === "documents" ? documentAccessLabel(selected, records) : selected.status}</Badge><div className="rd-detail-value">{selected.value}</div><p className="rd-detail-description">{selected.detail}</p><RecordFields item={selected} /><Button variant="ghost" onClick={() => askAssistant({ area: selected.area, record: selected })}><Sparkles size={16} />Consultar sobre este registro</Button><Button disabled={selected.area === "connections" && !self.owner} variant="outline" onClick={() => { setEditing(selected); setWizard(selected.area); setSelected(null); }}>Editar configuración</Button><div className="rd-detail-security"><LockKeyhole size={16} />Los cambios y accesos se simulan localmente.</div>{selected.area === "reports" ? <DemoReportEditor onAsk={current => askAssistant({ area: "reports", record: current })} key={`${selected.id}:${assistantRevision}`} item={selected} records={records} onSave={update} onOpenMetric={setSelected} /> : selected.area === "roadmap" && (selected.fields?.requires_doc || selected.fields?.requires_report) ? <TaskEvidence task={selected} records={records} open={setSelected} navigate={next => { setSelected(null); go(next); }} /> : selected.area === "roadmap" ? <Button onClick={() => update({ ...selected, status: selected.status === "Completado" ? "Pendiente" : "Completado" })}><Check size={16} />{selected.status === "Completado" ? "Reabrir tarea" : "Marcar como completada"}</Button> : selected.area === "metrics" ? <MetricValueEntry onAsk={current => askAssistant({ area: "metrics", record: selected, ...current })} key={selected.id} item={selected} onSave={update} onOpenSource={id => setSelected(records.find(r => r.area === "sources" && r.id === id) || selected)} /> : selected.area === "sources" ? <DemoSourceOperations key={selected.id} item={selected} onSave={update} onEdit={() => { setEditing(selected); setWizard("sources"); setSelected(null); }} close={() => setSelected(null)} /> : selected.area === "connections" ? <DemoConnection key={selected.id} item={selected} records={records} onChange={(items, item) => { setRecords(items); setSelected(item); setNotice("Conexión actualizada en la demo."); }} onOpen={setSelected} /> : <><DocumentFile key={selected.id} id={selected.id} /><ResourceAccess key={selected.id} item={selected} records={records} onSave={update} /></>}</>}</DialogContent></Dialog>
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent className="rd-root rd-dialog"><DialogTitle>Buscar en tu workspace</DialogTitle><DialogDescription>Encontrá métricas, documentos, tareas y reportes.</DialogDescription><Input autoFocus aria-label="Búsqueda global" placeholder="¿Qué estás buscando?" value={globalQuery} onChange={e => setGlobalQuery(e.target.value)} /><div className="rd-search-results">{records.filter(r => r.name.toLowerCase().includes(globalQuery.toLowerCase())).slice(0, 8).map(r => <button key={r.id} onClick={() => { setSearchOpen(false); setSelected(r); }}><span>{r.name}<small>{navigation.find(n => n.id === r.area)?.label}</small></span><ArrowRight size={15} /></button>)}{!records.some(r => r.name.toLowerCase().includes(globalQuery.toLowerCase())) && <p>No encontramos resultados. Probá con otro nombre.</p>}</div></DialogContent></Dialog>
    <Dialog open={!!info} onOpenChange={open => !open && setInfo(null)}><DialogContent className="rd-root rd-dialog"><DialogTitle>{info === "help" ? "Cómo usar esta demo" : "Notificaciones"}</DialogTitle><DialogDescription>{info === "help" ? "Una guía breve para recorrer la propuesta." : "Actividad de ejemplo del último período."}</DialogDescription>{info === "help" ? <ol className="rd-help"><li>Conectá tus fuentes para organizar los datos.</li><li>Revisá métricas y completá el roadmap.</li><li>Creá tu reporte con el asistente paso a paso.</li><li>Gestioná documentos y conexiones con control de acceso.</li></ol> : <div className="rd-help"><p>North Capital abrió el reporte de agosto.</p><p>Stripe completó la sincronización de ingresos.</p><p>El estado de resultados necesita una revisión.</p></div>}<Button onClick={() => setInfo(null)}>Entendido</Button></DialogContent></Dialog>
    <DemoAssistant open={assistantOpen} onOpenChange={open => { setAssistantOpen(open); if (!open) setAssistantContext(null); }} context={assistantContext || { area: selected?.area || area, company, record: selected || undefined }} records={records} onAction={assistantAction} onApply={applyAssistant} />
  </div></DemoAssistantContextProvider>;
}

export default function FounderRedesign() { return <BrowserRouter><TooltipProvider><Workspace /></TooltipProvider></BrowserRouter>; }
