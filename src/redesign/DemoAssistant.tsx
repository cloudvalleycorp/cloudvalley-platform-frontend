import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { History, Plus, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { QuerySummary } from "@/components/metrics/query-builder/QuerySummary";
import { answerDemoQuestion, assistantSuggestions, contextLabel, type AssistantAction, type AssistantAnswer, type AssistantContext, type AssistantProposal } from "./assistantModel";
import type { RecordItem } from "./model";

type Exchange = { id: string; question: string; context: string; answer: AssistantAnswer };
type Conversation = { id: string; title: string; exchanges: Exchange[] };
const storageKey = "cloudvalley-redesign-conversations";
function newConversation(): Conversation { return { id: crypto.randomUUID(), title: "Nueva conversación", exchanges: [] }; }
function read(): Conversation[] { try { const value = JSON.parse(localStorage.getItem(storageKey) || "null"); if (Array.isArray(value) && value.length && value.every(c => typeof c.id === "string" && typeof c.title === "string" && Array.isArray(c.exchanges))) return value; } catch { /* Start locally. */ } return [newConversation()]; }

export function DemoAssistant({ open, onOpenChange, context, records, onAction, onApply }: { open: boolean; onOpenChange: (open: boolean) => void; context: AssistantContext; records: RecordItem[]; onAction: (action: AssistantAction) => string | void; onApply: (proposal: AssistantProposal) => string | void }) {
  const [conversations, setConversations] = useState(read);
  const [activeId, setActiveId] = useState(() => conversations[0].id);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [simulateError, setSimulateError] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const followBottom = useRef(true);
  const viewportObserver = useRef<ResizeObserver | null>(null);
  useEffect(() => () => viewportObserver.current?.disconnect(), []);
  const active = conversations.find(c => c.id === activeId) || conversations[0];
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(conversations)); setStorageError(""); } catch { setStorageError("El historial se conserva durante esta sesión, pero no se pudo guardar en el navegador."); } }, [conversations]);
  useEffect(() => { if (open && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [open, active.exchanges.length]);
  const send = (value = question) => {
    const text = value.trim(); if (!text) return;
    if (simulateError) { setQuestion(text); setError("No se pudo generar la respuesta de ejemplo. Desactivá el error simulado y reintentá; tu mensaje se conserva."); return; }
    try {
      const answer = answerDemoQuestion(text, context, records);
      setConversations(current => current.map(c => c.id === active.id ? { ...c, title: c.exchanges.length ? c.title : text.slice(0, 64), exchanges: [...c.exchanges, { id: crypto.randomUUID(), question: text, context: contextLabel(context), answer }] } : c));
      setQuestion(""); setError(""); input.current?.focus();
    } catch { setQuestion(text); setError("No pudimos preparar la respuesta. Tu mensaje sigue disponible para reintentar."); }
  };
  const resolve = (id: string, state: "applied" | "discarded") => setConversations(current => current.map(c => c.id === active.id ? { ...c, exchanges: c.exchanges.map(e => e.id === id && e.answer.proposal ? { ...e, answer: { ...e.answer, proposal: { ...e.answer.proposal, state } } } : e) } : c));
  const action = (value: AssistantAction) => { const failure = onAction(value); if (failure) setError(failure); else { setError(""); onOpenChange(false); } };
  const suggestions = context.draft ? ["Revisá este borrador antes de guardar"] : assistantSuggestions[context.record?.area || context.area];
  return <><DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="rd-assistant-overlay" /><DialogPrimitive.Content className="rd-root rd-assistant" onOpenAutoFocus={event => { event.preventDefault(); followBottom.current = true; viewportObserver.current?.disconnect(); if (scroll.current) { scroll.current.scrollTop = scroll.current.scrollHeight; viewportObserver.current = new ResizeObserver(() => { if (followBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }); viewportObserver.current.observe(scroll.current); } input.current?.focus(); }}>
    <header className="rd-assistant-header"><div><DialogPrimitive.Title><Sparkles size={19} />Asistente Founder</DialogPrimitive.Title><DialogPrimitive.Description>Demo · Respuestas locales, sin conexión al agente real.</DialogPrimitive.Description></div><DialogPrimitive.Close asChild><Button variant="ghost" size="icon" aria-label="Cerrar asistente"><X size={18} /></Button></DialogPrimitive.Close></header>
    <div className="rd-assistant-context"><span>Contexto actual</span><strong>{contextLabel(context)}</strong></div>
    <div className="rd-assistant-tools"><Button variant="ghost" size="sm" onClick={() => { const conversation = newConversation(); setConversations(current => [conversation, ...current]); setActiveId(conversation.id); setQuestion(""); setError(""); setHistory(false); }}><Plus size={15} />Nueva conversación</Button><Button variant="ghost" size="sm" aria-expanded={history} onClick={() => setHistory(value => !value)}><History size={15} />Historial</Button></div>
    {history && <div className="rd-assistant-history" aria-label="Historial de conversaciones">{conversations.map(c => <div key={c.id}><Button variant={c.id === active.id ? "secondary" : "ghost"} onClick={() => { setActiveId(c.id); setHistory(false); setError(""); }}>{c.title}</Button><Button variant="ghost" size="sm" aria-label={`Renombrar conversación ${c.title}`} onClick={() => { setRenaming(c.id); setTitle(c.title); }}>Renombrar</Button><Button variant="ghost" size="sm" aria-label={`Eliminar conversación ${c.title}`} onClick={() => setDeleting(c.id)}>Eliminar</Button></div>)}{renaming && <form className="rd-value-actions" onSubmit={e => { e.preventDefault(); if (!title.trim()) return; setConversations(current => current.map(c => c.id === renaming ? { ...c, title: title.trim() } : c)); setRenaming(null); }}><Input aria-label="Nombre de la conversación" value={title} onChange={e => setTitle(e.target.value)} required maxLength={100} /><Button type="submit">Guardar nombre</Button></form>}</div>}
    <div className="rd-assistant-messages" ref={scroll} onScroll={event => { const el = event.currentTarget; followBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32; }} role="log" aria-label="Conversación con el asistente" aria-live="polite" aria-relevant="additions">
      {!active.exchanges.length && <div className="rd-assistant-welcome"><h3>¿En qué te ayudo?</h3><p>Podés revisar esta sección, consultar un registro o preparar una propuesta.</p></div>}
      {active.exchanges.map(exchange => <div key={exchange.id} className="rd-assistant-exchange"><div className="rd-assistant-question"><small>Vos · {exchange.context}</small><p>{exchange.question}</p></div><div className="rd-assistant-answer"><small>Asistente · demo</small><p>{exchange.answer.text}</p>{exchange.answer.sources.length > 0 && <details><summary>Datos usados ({exchange.answer.sources.length})</summary>{exchange.answer.sources.map(source => <Button variant="ghost" key={source.id} onClick={() => action({ kind: "open", id: source.id, label: source.name })}>{source.name}</Button>)}</details>}<div className="rd-assistant-actions">{exchange.answer.actions.map((item, i) => <Button key={i} variant="outline" onClick={() => action(item)}>{item.label}</Button>)}</div>{exchange.answer.proposal && <div className="rd-assistant-proposal"><h4>{exchange.answer.proposal.original ? "Cambio propuesto" : "Propuesta para crear"}: {exchange.answer.proposal.item.name}</h4><p>{exchange.answer.proposal.summary}</p>{exchange.answer.proposal.item.query && <QuerySummary query={exchange.answer.proposal.item.query} rawFields={[]} metricOptions={[]} />}{exchange.answer.proposal.item.sections?.map((section, i) => <div key={i}><strong>{section.title}</strong><ul>{section.blocks.map(block => <li key={block.metric_id}>{records.find(r => r.id === block.metric_id)?.name || "Métrica no disponible"}</li>)}</ul></div>)}{exchange.answer.proposal.state ? <p role="status">{exchange.answer.proposal.state === "applied" ? "Propuesta aplicada en la demo." : "Propuesta descartada."}</p> : <div className="rd-value-actions"><Button onClick={() => { const failure = onApply(exchange.answer.proposal!); if (failure) setError(failure); else { resolve(exchange.id, "applied"); setError(""); } }}>{exchange.answer.proposal.original ? "Confirmar cambio en la demo" : "Crear en la demo"}</Button><Button variant="ghost" onClick={() => resolve(exchange.id, "discarded")}>Descartar propuesta</Button></div>}{exchange.answer.proposal.state === "applied" && <Button variant="outline" onClick={() => action({ kind: "open", id: exchange.answer.proposal!.item.id, label: "Abrir resultado" })}>Abrir resultado</Button>}</div>}</div></div>)}
    </div>
    <div className="rd-assistant-suggestions" aria-label="Preguntas sugeridas">{suggestions.map(suggestion => <button key={suggestion} onClick={() => send(suggestion)}>{suggestion}</button>)}</div>
    {(error || storageError) && <div className="rd-assistant-error" role="alert"><p>{error || storageError}</p>{error && <Button variant="outline" onClick={() => send()}>Reintentar respuesta</Button>}</div>}
    <form className="rd-assistant-composer" onSubmit={event => { event.preventDefault(); send(); }}><label htmlFor="founder-assistant-question" className="sr-only">Mensaje al asistente</label><textarea ref={input} id="founder-assistant-question" rows={2} value={question} maxLength={4000} onChange={e => setQuestion(e.target.value)} placeholder="Preguntá sobre esta sección…" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} /><Button type="submit" disabled={!question.trim()} aria-label="Enviar mensaje al asistente"><Send size={17} /></Button></form><details className="rd-assistant-demo-controls"><summary>Probar error de respuesta</summary><label><input type="checkbox" checked={simulateError} onChange={e => setSimulateError(e.target.checked)} /> Simular error</label></details>
  </DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root><ConfirmationDialog open={!!deleting} onOpenChange={value => !value && setDeleting(null)} title="Eliminar conversación" description="Se eliminará este historial local. Los registros creados desde el asistente se conservan." confirmLabel="Eliminar conversación" onConfirm={() => { const remaining = conversations.filter(c => c.id !== deleting); const next = remaining.length ? remaining : [newConversation()]; setConversations(next); if (active.id === deleting) setActiveId(next[0].id); setDeleting(null); }} /></>;
}
