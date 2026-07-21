import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { LoadingState } from "@/components/LoadingState";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/FormDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { entityWords, handleMembershipError } from "@/lib/membership";
import {
  REQUEST_CONNECTION_URL,
  LIST_CONNECTIONS_URL,
  DECIDE_CONNECTION_URL,
  UPDATE_CONNECTION_URL,
  LIST_COMPANIES_URL,
  LIST_FUNDS_URL,
  type Connection,
  type ConnectionTarget,
} from "@/lib/connections";
import { toast } from "sonner";
import { Building2, Landmark, Search, Plus, Check, Clock, Unlink, Pencil } from "lucide-react";

export default function Connections() {
  const { user, loading, role, isAdmin, company_id, fund_id, email, is_owner } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [reopen, setReopen] = useState(false);

  const isFundSide = role === "investor";
  const myOrgId = isFundSide ? fund_id : company_id;
  const counterpartWords = entityWords(!isFundSide); // opposite entity: startup asks about "fondo", fondo asks about "startup"

  const [connections, setConnections] = useState<Connection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);

  const loadConnections = async () => {
    setLoadingConnections(true);
    try {
      const res = await fetch(LIST_CONNECTIONS_URL, { credentials: "include" });
      if (await handleMembershipError(res)) {
        setConnections([]);
        return;
      }
      const data = await res.json();
      setConnections(Array.isArray(data?.connections) ? data.connections : []);
    } catch {
      toast.error("No se pudieron cargar las conexiones");
    } finally {
      setLoadingConnections(false);
    }
  };

  useEffect(() => {
    if (!myOrgId) return;
    loadConnections();
  }, [myOrgId]);

  const received = useMemo(
    () => connections.filter((c) => c.status === "pending" && c.direction === "received"),
    [connections]
  );
  const sent = useMemo(
    () => connections.filter((c) => c.status === "pending" && c.direction === "sent"),
    [connections]
  );
  const active = useMemo(() => connections.filter((c) => c.status === "connected"), [connections]);
  const relatedStatus = useMemo(() => {
    const m = new Map<string, "pending" | "connected">();
    for (const c of connections) {
      if (c.status === "pending" || c.status === "connected") m.set(c.counterpart_id, c.status);
    }
    return m;
  }, [connections]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const decide = async (connection_id: string, decision: "approve" | "reject" | "cancel" | "disconnect", successMsg: string) => {
    setBusyId(connection_id);
    try {
      const res = await fetch(DECIDE_CONNECTION_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id, decision }),
      });
      if (await handleMembershipError(res)) return;
      toast.success(successMsg);
      setDisconnectTarget(null);
      loadConnections();
    } catch {
      toast.error("No se pudo procesar la conexión");
    } finally {
      setBusyId(null);
    }
  };

  const [disconnectTarget, setDisconnectTarget] = useState<Connection | null>(null);

  // Batch/año — solo lo edita el owner del lado fondo (backend: es quien
  // clasifica a sus startups en un cohort, no al revés).
  const [editingBatch, setEditingBatch] = useState<Connection | null>(null);
  const [batchInput, setBatchInput] = useState("");
  const [yearInput, setYearInput] = useState("");
  const [savingBatch, setSavingBatch] = useState(false);

  const openBatchEdit = (c: Connection) => {
    setEditingBatch(c);
    setBatchInput(c.batch ?? "");
    setYearInput(c.year != null ? String(c.year) : "");
  };

  const submitBatchEdit = async () => {
    if (!editingBatch) return;
    setSavingBatch(true);
    try {
      const res = await fetch(UPDATE_CONNECTION_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection_id: editingBatch.connection_id,
          batch: batchInput.trim() || null,
          year: yearInput.trim() ? Number(yearInput.trim()) : null,
        }),
      });
      if (await handleMembershipError(res)) return;
      toast.success("Batch/año actualizado");
      setEditingBatch(null);
      loadConnections();
    } catch {
      toast.error("No se pudo actualizar el batch/año");
    } finally {
      setSavingBatch(false);
    }
  };

  // Solicitar conexión
  const [browseOpen, setBrowseOpen] = useState(false);
  const [orgSearch, setOrgSearch] = useState("");
  const [targets, setTargets] = useState<ConnectionTarget[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [applyingTo, setApplyingTo] = useState<ConnectionTarget | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!browseOpen) return;
    setLoadingTargets(true);
    (async () => {
      const url = isFundSide ? LIST_COMPANIES_URL : LIST_FUNDS_URL;
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) {
          toast.error(`No se pudieron cargar los ${counterpartWords.noun}s`);
          setTargets([]);
          return;
        }
        const data = await res.json();
        const list = isFundSide ? data.companies : data.funds;
        setTargets(
          (Array.isArray(list) ? list : []).map((o: { company_id?: string; fund_id?: string; name: string }) => ({
            id: isFundSide ? o.company_id! : o.fund_id!,
            name: o.name,
          }))
        );
      } catch {
        toast.error(`No se pudieron cargar los ${counterpartWords.noun}s`);
        setTargets([]);
      } finally {
        setLoadingTargets(false);
      }
    })();
  }, [browseOpen, isFundSide, counterpartWords.noun]);

  const filteredTargets = useMemo(() => {
    const q = orgSearch.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((t) => t.name.toLowerCase().includes(q));
  }, [targets, orgSearch]);

  const submitRequest = async () => {
    if (!applyingTo) return;
    setSubmitting(true);
    try {
      const res = await fetch(REQUEST_CONNECTION_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: applyingTo.id, message: message.trim() || undefined }),
      });
      if (await handleMembershipError(res)) return;
      toast.success(`Solicitud enviada a ${applyingTo.name}`);
      setApplyingTo(null);
      setMessage("");
      setBrowseOpen(false);
      loadConnections();
    } catch {
      toast.error("No se pudo enviar la solicitud");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;

  if (!myOrgId) {
    if (!dismissed || reopen) {
      return (
        <AppLayout>
          <NoMembershipScreen
            role={isFundSide ? "investor" : "user"}
            email={email}
            onDismiss={() => {
              setDismissed(true);
              setReopen(false);
            }}
          />
        </AppLayout>
      );
    }
    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto px-8 py-12">
          <NoMembershipBanner role={isFundSide ? "investor" : "user"} onOpen={() => setReopen(true)} />
          <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card">
            No hay conexiones para mostrar hasta que te unas a {isFundSide ? "un fondo" : "una startup"}.
          </div>
        </div>
      </AppLayout>
    );
  }

  const CounterpartIcon = isFundSide ? Building2 : Landmark;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-8 py-12 space-y-8">
        <PageHeader
          title="Conexiones"
          subtitle={`Conexiones institucionales con ${counterpartWords.noun}s.`}
          action={
            is_owner && (
              <Button onClick={() => setBrowseOpen(true)}>
                <Plus size={14} className="mr-1" /> Solicitar conexión
              </Button>
            )
          }
        />

        {loadingConnections ? (
          <LoadingState />
        ) : (
          <>
            {received.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3">
                  Solicitudes recibidas ({received.length})
                </h3>
                <div className="space-y-2">
                  {received.map((c) => (
                    <div key={c.connection_id} className="border border-border rounded-lg p-4 bg-card flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-md bg-surface flex items-center justify-center shrink-0">
                          <CounterpartIcon size={16} strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.counterpart_name}</div>
                          {c.message && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.message}</p>}
                          <div className="text-xs text-tertiary mt-1">
                            {c.requested_by_name} · {new Date(c.created_at).toLocaleDateString("es-AR")}
                          </div>
                        </div>
                      </div>
                      {is_owner && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === c.connection_id}
                            onClick={() => decide(c.connection_id, "reject", "Solicitud rechazada")}
                          >
                            Rechazar
                          </Button>
                          <Button
                            size="sm"
                            disabled={busyId === c.connection_id}
                            onClick={() => decide(c.connection_id, "approve", "Conexión aprobada")}
                          >
                            Aprobar
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {sent.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3">
                  Solicitudes enviadas ({sent.length})
                </h3>
                <div className="space-y-2">
                  {sent.map((c) => (
                    <div key={c.connection_id} className="border border-border rounded-lg p-4 bg-card flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-md bg-surface flex items-center justify-center shrink-0">
                          <CounterpartIcon size={16} strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.counterpart_name}</div>
                          <div className="text-xs text-tertiary mt-1 inline-flex items-center gap-1">
                            <Clock size={11} strokeWidth={1.5} /> Pendiente · {new Date(c.created_at).toLocaleDateString("es-AR")}
                          </div>
                        </div>
                      </div>
                      {is_owner && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === c.connection_id}
                          onClick={() => decide(c.connection_id, "cancel", "Solicitud cancelada")}
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3">
                Conexiones activas {active.length > 0 && `(${active.length})`}
              </h3>
              {active.length === 0 ? (
                <div className="border border-border rounded-lg p-8 text-center text-sm text-muted-foreground bg-card">
                  Todavía no hay conexiones activas con {counterpartWords.no} {counterpartWords.noun}.
                </div>
              ) : (
                <div className="space-y-2">
                  {active.map((c) => (
                    <div key={c.connection_id} className="border border-border rounded-lg p-4 bg-card flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-md bg-surface flex items-center justify-center shrink-0">
                          <CounterpartIcon size={16} strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.counterpart_name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1 flex-wrap">
                            <Check size={11} strokeWidth={1.5} /> Conectado
                            {c.responded_at && ` · ${new Date(c.responded_at).toLocaleDateString("es-AR")}`}
                            {c.batch && ` · ${c.batch}`}
                            {c.year && ` · ${c.year}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {is_owner && isFundSide && (
                          <Button size="sm" variant="ghost" onClick={() => openBatchEdit(c)}>
                            <Pencil size={12} className="mr-1" /> Batch/año
                          </Button>
                        )}
                        {is_owner && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDisconnectTarget(c)}
                          >
                            <Unlink size={12} className="mr-1" /> Eliminar conexión
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <FormDialog
        open={browseOpen}
        onOpenChange={(o) => {
          setBrowseOpen(o);
          if (!o) setOrgSearch("");
        }}
        title={`Buscar ${counterpartWords.a} ${counterpartWords.noun}`}
        footer={
          <Button variant="ghost" onClick={() => setBrowseOpen(false)}>
            Cerrar
          </Button>
        }
      >
        <div className="relative">
          <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={orgSearch}
            onChange={(e) => setOrgSearch(e.target.value)}
            placeholder={`Buscar ${counterpartWords.noun}…`}
            className="pl-9"
          />
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-border border border-border rounded-md">
          {loadingTargets ? (
            <div className="p-4">
              <LoadingState />
            </div>
          ) : filteredTargets.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Sin resultados.</div>
          ) : (
            filteredTargets.map((t) => {
              const status = relatedStatus.get(t.id);
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-sm truncate">{t.name}</span>
                  {status === "connected" ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Check size={11} strokeWidth={1.5} /> Conectado
                    </span>
                  ) : status === "pending" ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Clock size={11} strokeWidth={1.5} /> Pendiente
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        setApplyingTo(t);
                        setMessage("");
                      }}
                    >
                      Solicitar
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </FormDialog>

      <FormDialog
        open={!!applyingTo}
        onOpenChange={(o) => !o && setApplyingTo(null)}
        title={`Solicitar conexión con ${applyingTo?.name}`}
        description="Se notificará por mail a los owners de la organización. Si aprueban, la conexión queda activa."
        onSubmit={submitRequest}
        submitLabel={submitting ? "Enviando…" : "Enviar solicitud"}
        busy={submitting}
      >
        <Textarea
          placeholder="Mensaje (opcional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
        />
      </FormDialog>

      <FormDialog
        open={!!editingBatch}
        onOpenChange={(o) => !o && setEditingBatch(null)}
        title={`Batch/año de ${editingBatch?.counterpart_name}`}
        onSubmit={submitBatchEdit}
        submitLabel={savingBatch ? "Guardando…" : "Guardar"}
        busy={savingBatch}
      >
        <div>
          <Label className="text-xs">Batch</Label>
          <Input
            value={batchInput}
            onChange={(e) => setBatchInput(e.target.value)}
            placeholder="Ej: 2026-A"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Año</Label>
          <Input
            type="number"
            value={yearInput}
            onChange={(e) => setYearInput(e.target.value)}
            placeholder="Ej: 2026"
            className="mt-1"
          />
        </div>
      </FormDialog>

      <AlertDialog open={!!disconnectTarget} onOpenChange={(open) => !open && setDisconnectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar conexión</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar la conexión con{" "}
              <span className="text-foreground font-medium">{disconnectTarget?.counterpart_name}</span>? Esta acción
              no se puede deshacer; si quieren reconectar, alguna de las dos partes deberá enviar una nueva
              solicitud.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === disconnectTarget?.connection_id}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busyId === disconnectTarget?.connection_id}
              onClick={(e) => {
                e.preventDefault();
                if (disconnectTarget) decide(disconnectTarget.connection_id, "disconnect", "Conexión eliminada");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busyId === disconnectTarget?.connection_id ? "Procesando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
