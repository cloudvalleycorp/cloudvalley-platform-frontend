import { useEffect, useState } from "react";

export type DemoMember = { id: string; name: string; email: string; owner: boolean };
export type DemoTeamState = { members: DemoMember[]; requests: DemoMember[]; invites: { id: string; email: string }[]; code: string };
const key = "cloudvalley-redesign-team";
const eventName = "cloudvalley-demo-team";
export const demoSelf: DemoMember = { id: "self", name: "Founder", email: "founder@example.com", owner: true };
const initial: DemoTeamState = { members: [demoSelf, { id: "ana", name: "Ana García", email: "ana@example.com", owner: false }], requests: [{ id: "lucas", name: "Lucas Pérez", email: "lucas@example.com", owner: false }], invites: [], code: "DEMO-MARITOS" };
export function readDemoTeam(): DemoTeamState {
  let team = initial;
  try {
    const data = JSON.parse(localStorage.getItem(key) || "null");
    if (data && Array.isArray(data.members) && Array.isArray(data.requests) && Array.isArray(data.invites) && typeof data.code === "string") team = data;
    const profile = JSON.parse(localStorage.getItem("cloudvalley-redesign-v1-settings") || "null");
    const email = JSON.parse(localStorage.getItem("cloudvalley-redesign-email") || "null");
    return { ...team, members: team.members.map(member => member.id === "self" ? { ...member, name: profile?.full_name || member.name, email: email?.current || member.email } : member) };
  } catch { return team; }
}
export function useDemoTeam() {
  const [team, setTeam] = useState(readDemoTeam);
  const [error, setError] = useState("");
  useEffect(() => { const refresh = () => setTeam(readDemoTeam()); window.addEventListener(eventName, refresh); window.addEventListener("storage", refresh); return () => { window.removeEventListener(eventName, refresh); window.removeEventListener("storage", refresh); }; }, []);
  const save = (next: DemoTeamState) => { try { localStorage.setItem(key, JSON.stringify(next)); setTeam(next); setError(""); window.dispatchEvent(new Event(eventName)); return true; } catch { setError("No se pudo guardar el equipo. Volvé a intentarlo."); return false; } };
  return { team, save, error, self: team.members.find(member => member.id === "self") };
}
