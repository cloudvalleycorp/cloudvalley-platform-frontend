import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/FormDialog";
import { SkeletonSection } from "@/components/SkeletonSection";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, AlertTriangle, RefreshCw, Plug, FileSpreadsheet, Unlink, ArrowRight } from "lucide-react";
import {
  LIST_GOOGLE_ACCOUNTS_URL,
  CONNECT_SHEETS_URL,
  DISCONNECT_SHEETS_URL,
  parseSheetsError,
  type GoogleAccount,
  type GoogleAccountsResponse,
} from "@/lib/sheetsIntegration";
import { handleMembershipError } from "@/lib/membership";

type ApiKeyProvider = "stripe" | "mercury" | "amplitude";
type Item = {
  id: string;
  provider: ApiKeyProvider;
  status: "connected" | "error" | "disconnected" | "pending";
  account_label: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
};

type ApiKeyProviderConfig = {
  kind: "api_key";
  id: ApiKeyProvider;
  name: string;
  description: string;
  metrics: string;
  needsSecret?: boolean;
  keyLabel: string;
  keyPlaceholder: string;
  secretLabel?: string;
  secretPlaceholder?: string;
  helpText: string;
  helpUrl: string;
  // Estas 3 todavía escriben en metric_entries de Supabase, no en el módulo
  // financiero de GCP que Growth Tracker lee desde la migración — conectarlas
  // no actualiza ninguna métrica visible hoy. Sacar este flag cuando se
  // migren de verdad (mismo patrón que Sheets: un connect/sync propio contra
  // el gateway, escribiendo en financial_record).
  notWiredToGrowthTracker?: boolean;
};

// Una integración que no se conecta pegando una API key (Sheets es OAuth +
// un wizard de mapeo propio) simplemente lleva a su propia pantalla en vez
// de abrir el diálogo genérico — así una futura integración con su propio
// flujo se suma a esta lista sin inventar un botón nuevo en otra pantalla.
type ExternalFlowProviderConfig = {
  kind: "external_flow";
  id: "sheets";
  name: string;
  description: string;
  metrics: string;
  href: string;
};

type ProviderConfig = ApiKeyProviderConfig | ExternalFlowProviderConfig;

const PROVIDERS: ProviderConfig[] = [
  {
    kind: "external_flow",
    id: "sheets",
    name: "Google Sheets",
    description: "Sincronizá tus métricas desde una planilla en vez de cargarlas a mano.",
    metrics: "Cualquier métrica input que mapees",
    href: "/metrics?tab=sources",
  },
  {
    kind: "api_key",
    id: "stripe",
    name: "Stripe",
    description: "Sincroniza ingresos y clientes en vivo.",
    metrics: "MRR · ARR · Customers",
    keyLabel: "Restricted API key",
    keyPlaceholder: "rk_live_...",
    helpText: "Stripe → Developers → API keys → Create restricted key (read-only).",
    helpUrl: "https://dashboard.stripe.com/apikeys",
    notWiredToGrowthTracker: true,
  },
  {
    kind: "api_key",
    id: "mercury",
    name: "Mercury",
    description: "Cash balance y runway sin tener que actualizar manualmente.",
    metrics: "Cash Balance",
    keyLabel: "API token",
    keyPlaceholder: "secret-token:mercury_...",
    helpText: "Mercury → Settings → Tokens → Generate read-only token.",
    helpUrl: "https://app.mercury.com/settings/tokens",
    notWiredToGrowthTracker: true,
  },
  {
    kind: "api_key",
    id: "amplitude",
    name: "Amplitude",
    description: "Métricas de uso de producto del último mes.",
    metrics: "MAU",
    needsSecret: true,
    keyLabel: "API Key",
    keyPlaceholder: "Project API key",
    secretLabel: "Secret Key",
    secretPlaceholder: "Project secret key",
    helpText: "Amplitude → Settings → Projects → tu proyecto → API Keys.",
    helpUrl: "https://amplitude.com/",
    notWiredToGrowthTracker: true,
  },
];

function timeAgo(iso: string | null) {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hace segundos";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

export function IntegrationsSection() {
  const navigate = useNavigate();
  const { company_id } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialogProvider, setDialogProvider] = useState<ApiKeyProvider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [sheetsAccounts, setSheetsAccounts] = useState<GoogleAccount[]>([]);
  const [sheetsSourcePaused, setSheetsSourcePaused] = useState(false);
  const [loadingSheets, setLoadingSheets] = useState(true);
  const [connectingSheets, setConnectingSheets] = useState(false);
  const [confirmDisconnectAccount, setConfirmDisconnectAccount] = useState<GoogleAccount | null>(null);
  const [disconnectingAccountId, setDisconnectingAccountId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("integrations", {
      body: { action: "list" },
    });
    if (error) toast.error(error.message);
    else setItems(data?.items ?? []);
    setLoading(false);
  };

  const loadSheetsStatus = async () => {
    if (!company_id) {
      setLoadingSheets(false);
      return;
    }
    setLoadingSheets(true);
    try {
      const res = await fetch(`${LIST_GOOGLE_ACCOUNTS_URL}?company_id=${encodeURIComponent(company_id)}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as GoogleAccountsResponse;
        setSheetsAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
        setSheetsSourcePaused(data?.source_enabled === false);
      }
    } catch {
      // silencioso: la tarjeta cae a "Conectar" y el usuario puede reintentar entrando a la pantalla
    } finally {
      setLoadingSheets(false);
    }
  };

  // Permisos de conexión (baja frecuencia) — se manejan acá mismo, sin
  // saltar a /growth-tracker/sheets. Gestión de hojas/mapeo (alta
  // frecuencia) vive en Metrics > Fuentes de datos, ver el link más abajo.
  const connectSheets = async () => {
    if (!company_id) return;
    setConnectingSheets(true);
    try {
      const res = await fetch(CONNECT_SHEETS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id }),
      });
      if (res.status === 400) {
        const err = await parseSheetsError(res);
        if (err.sourceDisabled) {
          setSheetsSourcePaused(true);
          toast.error("Un administrador de CloudValley pausó esta fuente. Pedile que la reactive.");
          return;
        }
        toast.error(err.message ?? "No se pudo iniciar la conexión con Google");
        return;
      }
      if (await handleMembershipError(res)) return;
      const data = await res.json();
      if (data?.auth_url) window.location.href = data.auth_url;
      else toast.error("No se pudo iniciar la conexión con Google");
    } catch {
      toast.error("No se pudo iniciar la conexión con Google");
    } finally {
      setConnectingSheets(false);
    }
  };

  const disconnectSheetsAccount = async () => {
    if (!company_id || !confirmDisconnectAccount) return;
    const accountId = confirmDisconnectAccount.account_id;
    setDisconnectingAccountId(accountId);
    try {
      const res = await fetch(DISCONNECT_SHEETS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id, account_id: accountId }),
      });
      if (await handleMembershipError(res)) return;
      toast.success("Cuenta desconectada");
      setConfirmDisconnectAccount(null);
      await loadSheetsStatus();
    } catch {
      toast.error("No se pudo desconectar la cuenta");
    } finally {
      setDisconnectingAccountId(null);
    }
  };

  useEffect(() => {
    load();
    loadSheetsStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company_id]);

  const byProvider = (p: ApiKeyProvider) => items.find((i) => i.provider === p);

  const openConnect = (p: ApiKeyProvider) => {
    setDialogProvider(p);
    setApiKey("");
    setApiSecret("");
  };

  const submitConnect = async () => {
    if (!dialogProvider) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("integrations", {
      body: {
        action: "connect",
        provider: dialogProvider,
        api_key: apiKey,
        api_secret: apiSecret || undefined,
      },
    });
    setSubmitting(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Error");
      return;
    }
    toast.success(`${dialogProvider} conectado`);
    setDialogProvider(null);
    await load();
    // Auto-sync first time
    sync(dialogProvider);
  };

  const sync = async (p: ApiKeyProvider) => {
    setBusy(p);
    const { data, error } = await supabase.functions.invoke("integrations", {
      body: { action: "sync", provider: p },
    });
    setBusy(null);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Error al sincronizar");
    } else {
      toast.success("Métricas actualizadas");
    }
    load();
  };

  const disconnect = async (p: ApiKeyProvider) => {
    setBusy(p);
    const { error } = await supabase.functions.invoke("integrations", {
      body: { action: "disconnect", provider: p },
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Desconectado");
    load();
  };

  const cfg = dialogProvider
    ? (PROVIDERS.find((p) => p.id === dialogProvider) as ApiKeyProviderConfig)
    : null;

  return (
    <section className="mt-12 pt-8 border-t border-border space-y-4">
      <div>
        <h2 className="text-sm font-medium">Integraciones</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Conectá tus herramientas para que las métricas se actualicen solas.
        </p>
      </div>

      {loading || loadingSheets ? (
        <SkeletonSection rows={4} columns={2} />
      ) : (
      <div className="space-y-3">
        {PROVIDERS.map((p) => {
          if (p.kind === "external_flow") {
            // Una company puede tener varias cuentas de Google conectadas a
            // la vez. Un admin puede pausar la fuente independientemente del
            // estado de la conexión con Google — no es lo mismo que
            // "desconectado" (toggle a nivel company, viene en la raíz de
            // list-google-accounts, no por cuenta).
            const paused = sheetsSourcePaused;
            return (
              <div key={p.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet size={14} strokeWidth={1.5} className="text-muted-foreground" />
                  <span className="text-sm font-medium">{p.name}</span>
                  {paused && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground bg-surface px-1.5 py-0.5 rounded">
                      <AlertTriangle size={10} /> Pausado
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">{p.metrics}</p>

                {paused && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Un administrador de CloudValley la desactivó temporalmente.
                  </p>
                )}

                {!paused && sheetsAccounts.length === 0 && (
                  <div className="mt-3">
                    <Button size="sm" onClick={connectSheets} disabled={connectingSheets}>
                      <Plug size={12} className="mr-1" /> {connectingSheets ? "Conectando…" : "Conectar cuenta de Google"}
                    </Button>
                  </div>
                )}

                {!paused && sheetsAccounts.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {sheetsAccounts.map((a) => (
                      <div key={a.account_id} className="flex items-center justify-between gap-2 text-xs border border-border/60 rounded-md px-2.5 py-1.5">
                        <span className="truncate">{a.google_account_email}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {a.reconnect_required ? (
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={connectSheets} disabled={connectingSheets}>
                              <AlertTriangle size={10} className="mr-1" /> Reconectar
                            </Button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-foreground">
                              <CheckCircle2 size={10} /> Conectada
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => setConfirmDisconnectAccount(a)}
                            disabled={disconnectingAccountId === a.account_id}
                          >
                            <Unlink size={10} className="mr-1" /> Desconectar
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={connectSheets} disabled={connectingSheets}>
                      <Plug size={12} className="mr-1" /> Conectar otra cuenta
                    </Button>
                  </div>
                )}

                <button
                  onClick={() => navigate(p.href)}
                  className="text-xs text-primary hover:underline mt-3 inline-flex items-center gap-1"
                >
                  Gestioná tus hojas conectadas en Métricas <ArrowRight size={11} strokeWidth={1.5} />
                </button>
              </div>
            );
          }

          const item = byProvider(p.id);
          const connected = item?.status === "connected";
          const error = item?.status === "error";
          return (
            <div key={p.id} className="border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    {connected && p.notWiredToGrowthTracker ? (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-warning-foreground bg-surface px-1.5 py-0.5 rounded">
                        <AlertTriangle size={10} /> Conectado, sin sincronizar
                      </span>
                    ) : (
                      connected && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-foreground bg-surface px-1.5 py-0.5 rounded">
                          <CheckCircle2 size={10} /> Conectado
                        </span>
                      )
                    )}
                    {error && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-destructive">
                        <AlertCircle size={10} /> Error
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">{p.metrics}</p>
                  {p.notWiredToGrowthTracker && (
                    <p className="text-[11px] text-warning-foreground mt-1.5 flex items-center gap-1">
                      <AlertTriangle size={11} strokeWidth={1.5} className="shrink-0" />
                      Todavía no actualiza las métricas de Growth Tracker.
                    </p>
                  )}
                  {item && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      {item.account_label && <span>{item.account_label} · </span>}
                      Última sync: {timeAgo(item.last_synced_at)}
                      {error && item.last_sync_error && (
                        <span className="text-destructive"> · {item.last_sync_error}</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {!item && (
                    <Button size="sm" onClick={() => openConnect(p.id)}>
                      <Plug size={12} className="mr-1" /> Conectar
                    </Button>
                  )}
                  {item && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sync(p.id)}
                        disabled={busy === p.id}
                      >
                        <RefreshCw size={12} className={`mr-1 ${busy === p.id ? "animate-spin" : ""}`} />
                        Sincronizar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => disconnect(p.id)}
                        disabled={busy === p.id}
                      >
                        Desconectar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      <FormDialog
        open={!!dialogProvider}
        onOpenChange={(o) => !o && setDialogProvider(null)}
        title={cfg ? `Conectar ${cfg.name}` : ""}
        description={
          cfg && (
            <>
              {cfg.helpText}{" "}
              <a href={cfg.helpUrl} target="_blank" rel="noopener noreferrer" className="underline">
                Abrir {cfg.name}
              </a>
            </>
          )
        }
        onSubmit={submitConnect}
        submitLabel={submitting ? "Validando…" : "Conectar"}
        busy={submitting || !apiKey}
      >
        {cfg && (
          <>
            <div>
              <Label className="text-xs">{cfg.keyLabel}</Label>
              <Input
                type="password"
                placeholder={cfg.keyPlaceholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="mt-1"
              />
            </div>
            {cfg.needsSecret && (
              <div>
                <Label className="text-xs">{cfg.secretLabel}</Label>
                <Input
                  type="password"
                  placeholder={cfg.secretPlaceholder}
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Tu credencial se guarda encriptada y solo se usa desde el servidor para leer tus métricas.
            </p>
          </>
        )}
      </FormDialog>

      <ConfirmationDialog
        open={!!confirmDisconnectAccount}
        onOpenChange={(o) => !o && setConfirmDisconnectAccount(null)}
        title="Desconectar cuenta de Google"
        description={
          confirmDisconnectAccount
            ? `Se revoca el acceso de CloudValley a ${confirmDisconnectAccount.google_account_email} y se corta la sincronización automática de sus hojas mapeadas (no se borran: si reconectás esta misma cuenta después, siguen desde donde quedaron).`
            : ""
        }
        confirmLabel="Desconectar"
        variant="destructive"
        busy={!!disconnectingAccountId}
        onConfirm={disconnectSheetsAccount}
      />
    </section>
  );
}
