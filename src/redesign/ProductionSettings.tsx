import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { SectionCard } from "@/components/SectionCard";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AssistantEntry } from "./DemoAssistantContext";
import { DemoEmailChange } from "./DemoEmailChange";
import { DemoImageUpload } from "./DemoIdentityImage";
import { DemoTeam } from "./DemoTeam";
import { useDemoTeam } from "./demoTeamStore";
import { DemoIntegrations } from "./DemoIntegrations";

const key = "cloudvalley-redesign-v1-settings";
const startupFields = [
  ["name", "Nombre de la startup", "text"], ["industry", "Industria", "text"], ["vertical", "Vertical", "text"],
  ["website", "Website", "url"], ["website_url", "Sitio web público", "url"], ["linkedin_url", "LinkedIn de la startup", "text"],
  ["target_raise_usd", "Objetivo de ronda (USD)", "number"], ["cohort_number", "Número de cohort", "number"], ["cohort_year", "Año del cohort", "number"],
] as const;
const profileFields = [["full_name", "Nombre completo", "text"], ["role_title", "Rol", "text"], ["profile_linkedin_url", "LinkedIn personal", "text"]] as const;
function read(company: string): Record<string, string> {
  try { const stored = JSON.parse(localStorage.getItem(key) || "null"); if (stored && typeof stored === "object" && Object.values(stored).every(v => typeof v === "string")) return { name: company, full_name: "Founder", ...stored }; } catch { /* Local demo fallback. */ }
  return { name: company, full_name: "Founder", role_title: "Founder & CEO" };
}
export function ProductionSettings({ company, onSaved }: { company: string; onSaved: (company: string, message: string) => void }) {
  const { hash } = useLocation();
  const { self } = useDemoTeam();
  const [values, setValues] = useState(() => read(company));
  const [saved, setSaved] = useState(() => read(company));
  const [notice, setNotice] = useState("");
  useEffect(() => { if (hash === "#integrations") { const frame = requestAnimationFrame(() => document.getElementById("integrations")?.scrollIntoView()); return () => cancelAnimationFrame(frame); } }, [hash]);
  function submit(event: FormEvent, fields: readonly (readonly [string, string, string])[]) {
    event.preventDefault();
    if (fields.some(([id]) => (id === "name" || id === "full_name") && !values[id]?.trim())) { setNotice("Completá el nombre antes de guardar."); return; }
    const next = { ...saved, ...Object.fromEntries(fields.map(([id]) => [id, values[id]?.trim() || ""])) };
    try { localStorage.setItem(key, JSON.stringify(next)); localStorage.setItem("cloudvalley-redesign-v1-company", next.name); setNotice(""); } catch { setNotice("No se pudieron guardar los cambios. Conservamos los campos para que puedas reintentar."); return; }
    setSaved(next);
    window.dispatchEvent(new Event("cloudvalley-demo-team"));
    onSaved(next.name, "Cambios guardados en la demo.");
  }
  const rows = (fields: readonly (readonly [string, string, string])[]) => fields.map(([id, label, type]) => <FormField key={id} label={label} htmlFor={`settings-${id}`}><Input id={`settings-${id}`} type={type} required={id === "name" || id === "full_name"} min={id === "cohort_number" ? 1 : id === "cohort_year" ? 1900 : type === "number" ? 0 : undefined} max={id === "cohort_year" ? 2100 : undefined} step={id === "target_raise_usd" ? "any" : type === "number" ? 1 : undefined} value={values[id] || ""} onChange={e => setValues(current => ({ ...current, [id]: e.target.value }))} /></FormField>);
  return <div className="rd-settings-sections">
    <SectionCard title="Mi startup"><DemoImageUpload kind="logo" disabled={!self?.owner} /><form onSubmit={e => submit(e, startupFields)} className="rd-mapped-form"><fieldset disabled={!self?.owner} className="rd-mapped-form"><div className="rd-settings-grid">{rows(startupFields)}</div><div className="rd-value-actions"><Button type="submit">Guardar startup</Button><AssistantEntry context={{ area: "settings", draft: { area: "settings", name: values.name || "", category: "Startup", detail: "", step: 0, fields: Object.fromEntries(startupFields.map(([id]) => [id, values[id] || ""])) } }}>Revisar datos de la startup</AssistantEntry></div></fieldset>{!self?.owner && <p className="rd-muted">Solo un owner puede editar la startup.</p>}</form></SectionCard>
    <SectionCard title="Mi perfil"><div className="rd-mapped-form"><DemoImageUpload kind="avatar" /><form onSubmit={e => submit(e, profileFields)} className="rd-mapped-form">{rows(profileFields)}<div className="rd-value-actions"><Button type="submit">Guardar perfil</Button><AssistantEntry context={{ area: "settings", draft: { area: "settings", name: values.full_name || "", category: "Perfil", detail: "", step: 0, fields: Object.fromEntries(profileFields.map(([id]) => [id, values[id] || ""])) } }}>Revisar perfil con el asistente</AssistantEntry></div></form><DemoEmailChange /></div></SectionCard>
    <DemoTeam name={saved.full_name} />
    <div id="integrations"><DemoIntegrations /></div>
    <SectionCard title="Privacidad"><p className="rd-muted">Elegí la visibilidad al crear o editar cada documento o métrica. Los recursos visibles para inversores conectados pueden ser consultados por esos fondos.</p></SectionCard>
    {notice && <p className="rd-field-error" role="alert">{notice}</p>}
  </div>;
}
