import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useStartup } from "@/hooks/useStartup";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Building2, Search, Check, X, Clock } from "lucide-react";

type Org = { id: string; name: string; type: string; website: string | null };
type Req = {
  id: string;
  organization_id: string;
  status: string;
  message: string | null;
  batch: string | null;
  year: number | null;
  created_at: string;
  responded_at: string | null;
};

export default function Connections() {
  const { user } = useAuth();
  const { startup } = useStartup();
  const [tab, setTab] = useState<"explore" | "mine">("explore");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [linkedOrgIds, setLinkedOrgIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [applyingTo, setApplyingTo] = useState<Org | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadAll = async () => {
    if (!startup) return;
    const [orgsRes, reqRes, linksRes] = await Promise.all([
      // TODO: migrar a backend propio
      supabase.from("organizations").select("id, name, type, website").eq("is_active", true).order("name"),
      // TODO: migrar a backend propio
      supabase.from("connection_requests").select("*").eq("startup_id", startup.id).order("created_at", { ascending: false }),
      // TODO: migrar a backend propio
      supabase.from("startup_organizations").select("organization_id").eq("startup_id", startup.id),
    ]);
    setOrgs((orgsRes.data ?? []) as Org[]);
    setRequests((reqRes.data ?? []) as Req[]);
    setLinkedOrgIds(new Set((linksRes.data ?? []).map((l: any) => l.organization_id)));
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startup?.id]);

  const pendingByOrg = useMemo(() => {
    const m = new Map<string, Req>();
    for (const r of requests) if (r.status === "pending") m.set(r.organization_id, r);
    return m;
  }, [requests]);

  const filteredOrgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) => o.name.toLowerCase().includes(q));
  }, [orgs, search]);

  const submitRequest = async () => {
    if (!applyingTo || !startup || !user) return;
    setSubmitting(true);
    // TODO: migrar a backend propio
    const { error } = await supabase.from("connection_requests").insert({
      startup_id: startup.id,
      organization_id: applyingTo.id,
      message: message.trim() || null,
      requested_by: user.id,
    });
    setSubmitting(false);
    if (error) {
      toast.error("No se pudo enviar la solicitud");
      return;
    }
    toast.success(`Solicitud enviada a ${applyingTo.name}`);
    setApplyingTo(null);
    setMessage("");
    loadAll();
  };

  const cancelRequest = async (req: Req) => {
    const { error } = await supabase
      .from("connection_requests")
      .update({ status: "cancelled" })
      .eq("id", req.id);
    if (error) {
      toast.error("No se pudo cancelar");
      return;
    }
    toast.success("Solicitud cancelada");
    loadAll();
  };

  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? "—";

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-8 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-medium tracking-tight mb-2">Conexiones</h1>
          <p className="text-sm text-muted-foreground">
            Solicitá aparecer en el portfolio de fondos y aceleradoras.
          </p>
        </div>

        <div className="flex gap-1 border-b border-border">
          {[
            { id: "explore" as const, label: "Explorar organizaciones" },
            { id: "mine" as const, label: `Mis solicitudes${requests.length ? ` (${requests.length})` : ""}` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-2 text-sm transition-all border-b-2 -mb-px",
                tab === t.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "explore" && (
          <div className="space-y-4">
            <div className="relative max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
              <Input
                placeholder="Buscar organización…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="grid gap-3">
              {filteredOrgs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No hay organizaciones.</p>
              ) : (
                filteredOrgs.map((org) => {
                  const linked = linkedOrgIds.has(org.id);
                  const pending = pendingByOrg.get(org.id);
                  return (
                    <div
                      key={org.id}
                      className="border border-border rounded-lg p-4 bg-card flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-md bg-surface flex items-center justify-center shrink-0">
                          <Building2 size={16} strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{org.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">
                            {org.type === "both" ? "Fondo y aceleradora" : org.type === "fund" ? "Fondo" : "Aceleradora"}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {linked ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Check size={12} strokeWidth={1.5} /> Conectado
                          </span>
                        ) : pending ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock size={12} strokeWidth={1.5} /> Solicitud pendiente
                          </span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => { setApplyingTo(org); setMessage(""); }}>
                            Solicitar conexión
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {tab === "mine" && (
          <div className="space-y-3">
            {requests.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Todavía no enviaste solicitudes.</p>
            ) : (
              requests.map((r) => (
                <div key={r.id} className="border border-border rounded-lg p-4 bg-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium">{orgName(r.organization_id)}</div>
                      {r.message && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.message}</p>
                      )}
                      <div className="text-xs text-tertiary mt-2">
                        {new Date(r.created_at).toLocaleDateString()}
                        {r.status === "accepted" && r.batch && ` · ${r.batch}`}
                        {r.status === "accepted" && r.year && ` · ${r.year}`}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      {r.status === "pending" && (
                        <Button size="sm" variant="ghost" onClick={() => cancelRequest(r)}>
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <Dialog open={!!applyingTo} onOpenChange={(o) => !o && setApplyingTo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar conexión con {applyingTo?.name}</DialogTitle>
            <DialogDescription>
              Si aceptan, tu startup aparecerá en su portfolio y podrán ver tus métricas y data room públicos.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Textarea
              placeholder="Mensaje (opcional). Ej: nos postulamos a su batch 2026…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApplyingTo(null)}>Cancelar</Button>
            <Button onClick={submitRequest} disabled={submitting}>
              {submitting ? "Enviando…" : "Enviar solicitud"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof Check }> = {
    pending: { label: "Pendiente", cls: "bg-surface text-muted-foreground", Icon: Clock },
    accepted: { label: "Aceptada", cls: "bg-foreground text-background", Icon: Check },
    rejected: { label: "Rechazada", cls: "bg-surface text-muted-foreground", Icon: X },
    cancelled: { label: "Cancelada", cls: "bg-surface text-muted-foreground", Icon: X },
  };
  const cfg = map[status] ?? map.pending;
  const Icon = cfg.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md", cfg.cls)}>
      <Icon size={11} strokeWidth={1.5} /> {cfg.label}
    </span>
  );
}