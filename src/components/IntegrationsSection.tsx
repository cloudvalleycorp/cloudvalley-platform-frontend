import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, RefreshCw, Plug } from "lucide-react";

type Provider = "stripe" | "mercury" | "amplitude";
type Item = {
  id: string;
  provider: Provider;
  status: "connected" | "error" | "disconnected" | "pending";
  account_label: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
};

const PROVIDERS: Array<{
  id: Provider;
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
}> = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Sincroniza ingresos y clientes en vivo.",
    metrics: "MRR · ARR · Customers",
    keyLabel: "Restricted API key",
    keyPlaceholder: "rk_live_...",
    helpText: "Stripe → Developers → API keys → Create restricted key (read-only).",
    helpUrl: "https://dashboard.stripe.com/apikeys",
  },
  {
    id: "mercury",
    name: "Mercury",
    description: "Cash balance y runway sin tener que actualizar manualmente.",
    metrics: "Cash Balance",
    keyLabel: "API token",
    keyPlaceholder: "secret-token:mercury_...",
    helpText: "Mercury → Settings → Tokens → Generate read-only token.",
    helpUrl: "https://app.mercury.com/settings/tokens",
  },
  {
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
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialogProvider, setDialogProvider] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("integrations", {
      body: { action: "list" },
    });
    if (error) toast.error(error.message);
    else setItems(data?.items ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const byProvider = (p: Provider) => items.find((i) => i.provider === p);

  const openConnect = (p: Provider) => {
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

  const sync = async (p: Provider) => {
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

  const disconnect = async (p: Provider) => {
    setBusy(p);
    const { error } = await supabase.functions.invoke("integrations", {
      body: { action: "disconnect", provider: p },
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Desconectado");
    load();
  };

  const cfg = dialogProvider ? PROVIDERS.find((p) => p.id === dialogProvider)! : null;

  return (
    <section className="mt-12 pt-8 border-t border-border space-y-4">
      <div>
        <h2 className="text-sm font-medium">Integraciones</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Conectá tus herramientas para que las métricas se actualicen solas.
        </p>
      </div>

      <div className="space-y-3">
        {PROVIDERS.map((p) => {
          const item = byProvider(p.id);
          const connected = item?.status === "connected";
          const error = item?.status === "error";
          return (
            <div key={p.id} className="border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    {connected && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-foreground bg-surface px-1.5 py-0.5 rounded">
                        <CheckCircle2 size={10} /> Conectado
                      </span>
                    )}
                    {error && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-destructive">
                        <AlertCircle size={10} /> Error
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">{p.metrics}</p>
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
        {loading && <p className="text-xs text-muted-foreground">Cargando…</p>}
      </div>

      <Dialog open={!!dialogProvider} onOpenChange={(o) => !o && setDialogProvider(null)}>
        <DialogContent>
          {cfg && (
            <>
              <DialogHeader>
                <DialogTitle>Conectar {cfg.name}</DialogTitle>
                <DialogDescription>
                  {cfg.helpText}{" "}
                  <a href={cfg.helpUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    Abrir {cfg.name}
                  </a>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
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
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogProvider(null)}>Cancelar</Button>
                <Button onClick={submitConnect} disabled={submitting || !apiKey}>
                  {submitting ? "Validando…" : "Conectar"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}