import { useEffect, useState } from "react";

export type DemoProvider = "stripe" | "mercury" | "amplitude";
export type DemoGoogleAccount = { id: string; email: string; connected: boolean; reconnect: boolean };
export type DemoIntegrationState = { accounts: DemoGoogleAccount[]; paused: boolean; providers: Partial<Record<DemoProvider, { status: "connected" | "error" | "disconnected"; syncedAt: string; error: string }>> };
const key = "cloudvalley-redesign-integrations";
const eventName = "cloudvalley-demo-integrations";
export function readDemoIntegrations(): DemoIntegrationState {
  try { const data = JSON.parse(localStorage.getItem(key) || "null"); if (data && Array.isArray(data.accounts) && typeof data.paused === "boolean" && data.providers) return data; } catch { /* Local examples. */ }
  return { accounts: [{ id: "demo-account", email: "founder@example.com", connected: true, reconnect: false }], paused: false, providers: {} };
}
export function useDemoIntegrations() {
  const [state, setState] = useState(readDemoIntegrations);
  const [error, setError] = useState("");
  useEffect(() => { const refresh = () => setState(readDemoIntegrations()); window.addEventListener(eventName, refresh); return () => window.removeEventListener(eventName, refresh); }, []);
  const save = (next: DemoIntegrationState) => { try { localStorage.setItem(key, JSON.stringify(next)); setState(next); setError(""); window.dispatchEvent(new Event(eventName)); return true; } catch { setError("No se pudieron guardar las integraciones. Volvé a intentarlo."); return false; } };
  return { state, save, error };
}
