import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Check, Building2, Users, Clock, ArrowRight, Mail } from "lucide-react";
import {
  MANAGE_COMPANIES_URL,
  MANAGE_FUNDS_URL,
  REQUEST_MEMBERSHIP_URL,
  DECIDE_INVITATION_URL,
  LIST_MY_INVITATIONS_URL,
  handleMembershipError,
  rememberPendingMembership,
  forgetPendingMembership,
  getPendingMembership,
  entityWords,
  extractJoinCode,
  type PendingInvitation,
} from "@/lib/membership";
import { MEMBERSHIP_INTENT_KEY } from "@/pages/Onboarding";
import { useAuth } from "@/contexts/AuthContext";

type Mode = "menu" | "join" | "create" | "later";

export function NoMembershipScreen({
  role,
  email,
  onDismiss,
}: {
  role: "user" | "investor";
  email: string | null;
  onDismiss?: () => void;
}) {
  const { refreshSession } = useAuth();
  const w = entityWords(role === "investor");
  const [mode, setMode] = useState<Mode>("menu");
  const [joinCode, setJoinCode] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [joinSent, setJoinSent] = useState(false);
  // Backend's actual response text for a failed join attempt — shown persistently
  // next to the form instead of only as a toast, which is easy to miss when the
  // submit was triggered automatically (from an intent) rather than by a click.
  const [joinNote, setJoinNote] = useState<string | null>(null);
  // Epoch ms when another join attempt is allowed again — each request-membership
  // call can trigger a notification email to the org's existing members, so repeated
  // clicks on "Reintentar" shouldn't be able to spam them. Persisted per code (not
  // just in-memory) since the cooldown is measured in hours — a page reload can't
  // reset it.
  const [retryAt, setRetryAtState] = useState(0);
  const [, forceTick] = useState(0);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Invitaciones por mail pendientes — coexisten con el flujo de join-by-code,
  // no lo reemplazan (alguien puede tener ambas cosas al mismo tiempo).
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [decidingInvitationId, setDecidingInvitationId] = useState<string | null>(null);

  const RETRY_COOLDOWN_MS = 60 * 60 * 1000; // 1h

  const retryKey = (code: string) => `cv:join_retry_at:${code.trim().toUpperCase()}`;

  const readRetryAt = (code: string): number => {
    try {
      const raw = localStorage.getItem(retryKey(code));
      const at = raw ? Number(raw) : 0;
      return Number.isFinite(at) ? at : 0;
    } catch {
      return 0;
    }
  };

  const loadRetryAt = (code: string) => setRetryAtState(readRetryAt(code));

  const markRetryAt = (code: string) => {
    const at = Date.now() + RETRY_COOLDOWN_MS;
    try {
      localStorage.setItem(retryKey(code), String(at));
    } catch {
      // ignore storage errors
    }
    setRetryAtState(at);
  };

  const retrySecondsLeft = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  const retryLabel = (() => {
    if (retrySecondsLeft <= 0) return null;
    const h = Math.floor(retrySecondsLeft / 3600);
    const m = Math.ceil((retrySecondsLeft % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    if (retrySecondsLeft > 60) return `${m}min`;
    return `${retrySecondsLeft}s`;
  })();

  useEffect(() => {
    if (joinCode) loadRetryAt(joinCode);
  }, [joinCode]);

  useEffect(() => {
    (async () => {
      setLoadingInvitations(true);
      try {
        const res = await fetch(LIST_MY_INVITATIONS_URL, { credentials: "include" });
        // Deliberately no redirect-to-login on 401 here: this tray is a secondary,
        // best-effort fetch — the real session check already happened in
        // AppLayout/AuthContext before this component could even mount. Treating
        // a failure here as "log out and reload" caused a redirect loop: this
        // request 401s → hard reload to /login → session is actually fine →
        // bounces back to /portfolio → this effect runs again → 401 again.
        if (!res.ok) {
          setInvitations([]);
          return;
        }
        const data = await res.json();
        setInvitations(Array.isArray(data?.invitations) ? data.invitations : []);
      } catch {
        setInvitations([]);
      } finally {
        setLoadingInvitations(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (retryAt <= Date.now()) return;
    // Hour-long cooldown — a coarse tick is enough to keep the label fresh.
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [retryAt]);

  // Consume intent saved during PublicInvite to pre-fill this screen.
  useEffect(() => {
    // A real pending request (already sent to the backend) is a stronger signal than
    // an old PublicInvite intent, and takes priority — otherwise a stale "create" intent
    // from a much earlier attempt could hide the fact that a join request is already
    // sitting there waiting for approval.
    const pending = getPendingMembership();
    if (pending) {
      try {
        localStorage.removeItem(MEMBERSHIP_INTENT_KEY);
      } catch {
        // ignore
      }
      setJoinCode(pending.code);
      setMode("join");
      setJoinSent(true);
      return;
    }

    try {
      const raw = localStorage.getItem(MEMBERSHIP_INTENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // role === null comes from CodeInvite, which doesn't know ahead of time
        // which role the join code resolves to server-side — accept it regardless
        // of which role's screen mounted.
        if (parsed?.role === role || parsed?.role === null) {
          const intent = parsed.intent;
          localStorage.removeItem(MEMBERSHIP_INTENT_KEY);
          if (intent?.kind === "join" && intent.code) {
            setJoinCode(intent.code);
            setMode("join");
            // Auto-submit membership request so the user actually appears
            // in the target org without an extra manual click.
            void autoSubmitJoin(intent.code);
          } else if (intent?.kind === "create" && intent.name) {
            // A diferencia de "join" (idempotente, seguro de auto-enviar), crear una
            // organización es una acción consecuente — no la disparamos ni saltamos
            // el menú solo porque eligieron "crear" en un paso anterior, capaz hace
            // rato (y para entonces la organización puede ya existir, creada por otra
            // vía). Solo dejamos precargado el nombre por si igual la crean.
            setName(intent.name);
          }
        } else {
          localStorage.removeItem(MEMBERSHIP_INTENT_KEY);
        }
      }
    } catch {
      // ignore
    }
  }, [role]);

  const sendJoinRequest = async (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    // Read the cooldown straight from storage rather than the retrySecondsLeft/retryAt
    // state, which could still be stale right after joinCode changes in the same tick
    // (e.g. the auto-submit-from-intent path sets joinCode and calls this synchronously,
    // before the state-loading effect has run).
    if (readRetryAt(trimmed) > Date.now()) {
      setRetryAtState(readRetryAt(trimmed));
      return;
    }
    setSubmitting(true);
    setJoinNote(null);
    // Mark the cooldown before the request resolves, not after — otherwise a user
    // could fire several requests back-to-back while the first one is still in flight.
    markRetryAt(trimmed);
    try {
      const res = await fetch(REQUEST_MEMBERSHIP_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ join_code: trimmed }),
      });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) {
        // Show whatever the backend actually says (an already-pending request, an
        // invalid code, or a rate limit) persistently, instead of a toast that can
        // be missed and leaves the user staring at the same empty-looking form.
        // 429 is the backend's own per-user throttle on request-membership, on top
        // of the hour-long per-code cooldown already enforced above.
        let message = res.status === 403 ? "No autorizado." : "No se pudo enviar la solicitud.";
        if (res.status === 400 || res.status === 403 || res.status === 429) {
          try {
            const data = await res.json();
            message = data?.error ?? message;
          } catch {
            // keep default message
          }
        }
        setJoinNote(message);
        return;
      }
      setJoinSent(true);
      rememberPendingMembership(trimmed);
      toast.success("Solicitud enviada");
    } catch {
      setJoinNote("No se pudo enviar la solicitud. Revisá tu conexión.");
    } finally {
      setSubmitting(false);
    }
  };

  const autoSubmitJoin = sendJoinRequest;
  const submitJoin = () => sendJoinRequest(joinCode);

  const decideInvitation = async (invitation: PendingInvitation, decision: "accept" | "decline") => {
    setDecidingInvitationId(invitation.invitation_id);
    try {
      const res = await fetch(DECIDE_INVITATION_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitation_id: invitation.invitation_id, decision }),
      });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) {
        let message = "No se pudo procesar la invitación.";
        try {
          const data = await res.json();
          message = data?.error ?? message;
        } catch {
          // keep default message
        }
        toast.error(message);
        return;
      }
      if (decision === "accept") {
        // El company_id/fund_id nuevo vive en Firestore pero todavía no en la
        // cookie hasta refrescar la sesión.
        await refreshSession();
        window.location.assign("/");
        return;
      }
      setInvitations((invs) => invs.filter((i) => i.invitation_id !== invitation.invitation_id));
      toast.success(`No te uniste a ${invitation.target_name}`);
    } catch {
      toast.error("No se pudo procesar la invitación. Revisá tu conexión.");
    } finally {
      setDecidingInvitationId(null);
    }
  };

  const submitCreate = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const url = role === "user" ? MANAGE_COMPANIES_URL : MANAGE_FUNDS_URL;
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_own", name: name.trim() }),
      });
      if (await handleMembershipError(res)) return;
      const data = await res.json();
      setCreatedCode(data?.join_code ?? "—");
      // Refrescar la sesión para incluir el nuevo company_id/fund_id.
      await refreshSession();
    } catch {
      toast.error("No se pudo crear. Revisá tu conexión.");
    } finally {
      setSubmitting(false);
    }
  };

  const continueAfterCreate = async () => {
    // La sesión ya fue refrescada tras crear; solo navegamos al dashboard.
    window.location.assign("/");
  };

  const copyCode = async () => {
    if (!createdCode) return;
    try {
      await navigator.clipboard.writeText(createdCode);
      setCopied(true);
      toast.success("Código copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 sm:px-8 py-12 sm:py-16">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Configuración de {w.noun}
        </div>
        <h1 className="text-3xl font-medium tracking-tight">
          Conectá tu cuenta a {w.a} {w.noun}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {email ? <>Estás logueado como <span className="text-foreground">{email}</span>. </> : null}
          Para ver el contenido necesitás formar parte de {w.a} {w.noun}.
        </p>
      </div>

      {!loadingInvitations && invitations.length > 0 && (
        <div className="mb-6 space-y-3">
          <h2 className="text-sm font-medium text-foreground">
            {invitations.length === 1 ? "Tenés una invitación pendiente" : `Tenés ${invitations.length} invitaciones pendientes`}
          </h2>
          {invitations.map((inv) => {
            const invW = entityWords(inv.target_type === "fund");
            const busy = decidingInvitationId === inv.invitation_id;
            return (
              <div
                key={inv.invitation_id}
                className="border border-border rounded-xl p-4 sm:p-5 bg-card shadow-sm flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Mail size={18} strokeWidth={1.5} className="mt-0.5 text-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {inv.invited_by_name} te invitó a unirte a {inv.target_name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Vas a formar parte de {invW.demonstrative} {invW.noun} como miembro.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => decideInvitation(inv, "decline")}
                  >
                    Rechazar
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => decideInvitation(inv, "accept")}>
                    {busy ? "Procesando…" : "Aceptar"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="border border-border rounded-xl p-6 sm:p-8 bg-card shadow-sm">
        {mode === "menu" && (
          <>
            <h2 className="text-lg font-medium">Elegí cómo continuar</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Podés unirte con un código o crear tu {w.own} {w.noun}.
            </p>
            <div className="space-y-3 mt-6">
              <button
                onClick={() => setMode("join")}
                className="w-full text-left p-4 rounded-lg border border-border hover:border-foreground/40 hover:bg-muted/30 transition-all flex items-start gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="mt-0.5 text-muted-foreground group-hover:text-foreground transition-colors">
                  <Users size={18} strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <div className="font-medium">Unirme con un código</div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    Ingresá el código que te compartió tu {w.noun}.
                  </div>
                </div>
                <ArrowRight size={16} strokeWidth={1.5} className="mt-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <button
                onClick={() => setMode("create")}
                className="w-full text-left p-4 rounded-lg border border-border hover:border-foreground/40 hover:bg-muted/30 transition-all flex items-start gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="mt-0.5 text-muted-foreground group-hover:text-foreground transition-colors">
                  <Building2 size={18} strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <div className="font-medium">Crear mi {w.own} {w.noun}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    Vas a recibir un código para invitar a tu equipo.
                  </div>
                </div>
                <ArrowRight size={16} strokeWidth={1.5} className="mt-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <button
                onClick={() => (onDismiss ? onDismiss() : setMode("later"))}
                className="w-full text-left p-4 rounded-lg border border-border hover:border-foreground/40 hover:bg-muted/30 transition-all flex items-start gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="mt-0.5 text-muted-foreground group-hover:text-foreground transition-colors">
                  <Clock size={18} strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <div className="font-medium">Decidir más tarde</div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    Podés volver a este flujo cuando quieras.
                  </div>
                </div>
              </button>
            </div>
            <div className="mt-6 pt-6 border-t border-border text-center">
              <button
                onClick={async () => {
                  const ok = await refreshSession();
                  if (ok) {
                    forgetPendingMembership();
                    toast.success("Sesión actualizada");
                    window.location.assign("/");
                  } else {
                    toast.error("No se pudo actualizar la sesión");
                  }
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Ya me aprobaron — actualizar sesión
              </button>
            </div>
          </>
        )}

        {mode === "join" && (
          <>
            <h2 className="text-lg font-medium">Unirme con un código</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Ingresá el código que te compartió tu {w.noun}. Un miembro va a aprobar tu solicitud.
            </p>
            {joinSent ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-lg border border-border bg-muted/40 p-4 flex items-start gap-3">
                  <Mail size={18} strokeWidth={1.5} className="mt-0.5 text-foreground shrink-0" />
                  <div className="text-sm">
                    <div className="font-medium text-foreground">Solicitud enviada</div>
                    <div className="text-muted-foreground mt-0.5">
                      Un miembro {w.ofThe} {w.noun} la va a revisar. Vas a recibir acceso cuando te aprueben.
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { forgetPendingMembership(); setJoinSent(false); setMode("menu"); }}>
                    Volver
                  </Button>
                  <Button
                    onClick={async () => {
                      const ok = await refreshSession();
                      if (ok) { forgetPendingMembership(); toast.success("Sesión actualizada"); window.location.assign("/"); }
                      else toast.error("Todavía no fuiste aprobado");
                    }}
                  >
                    Actualizar sesión
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {(joinNote || retryLabel) && (
                  <div className="rounded-lg border border-border bg-muted/40 p-4 flex items-start gap-3">
                    <Mail size={18} strokeWidth={1.5} className="mt-0.5 text-foreground shrink-0" />
                    <div className="text-sm">
                      <div className="font-medium text-foreground">
                        {joinNote ?? "Ya enviaste esta solicitud"}
                      </div>
                      {retryLabel && (
                        <div className="text-muted-foreground mt-0.5">
                          Para no volver a avisarle {w.toThe} {w.noun}, podés reintentar en {retryLabel}.
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <Input
                  placeholder="Código de acceso"
                  value={joinCode}
                  onChange={(e) => { setJoinCode(extractJoinCode(e.target.value)); setJoinNote(null); }}
                  className="h-11 font-mono tracking-widest uppercase"
                  autoFocus
                />
                <div className="flex gap-2 flex-wrap">
                  <Button variant="ghost" onClick={() => { setJoinNote(null); setMode("menu"); }}>Atrás</Button>
                  <Button onClick={submitJoin} disabled={submitting || !joinCode.trim() || retrySecondsLeft > 0}>
                    {submitting
                      ? "Enviando…"
                      : retryLabel
                        ? `Reintentar en ${retryLabel}`
                        : joinNote
                          ? "Reintentar"
                          : "Enviar solicitud"}
                  </Button>
                </div>
                {(joinNote || retryLabel) && (
                  <div className="pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setJoinNote(null); setMode("create"); }}
                    >
                      Crear mi {w.own} {w.noun} en su lugar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {mode === "create" && (
          <>
            <h2 className="text-lg font-medium">Crear mi {w.own} {w.noun}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Elegí un nombre. Después vas a poder invitar a tu equipo con el código.
            </p>
            {createdCode ? (
              <div className="mt-6 space-y-4">
                <p className="text-sm text-foreground">
                  Compartí este código con tu equipo para que se sumen:
                </p>
                <button
                  type="button"
                  onClick={copyCode}
                  className="w-full p-4 rounded-lg border border-border bg-surface font-mono text-lg tracking-widest flex items-center justify-center gap-3 hover:border-foreground/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span>{createdCode}</span>
                  {copied ? (
                    <Check size={16} strokeWidth={1.5} className="text-foreground" />
                  ) : (
                    <Copy size={16} strokeWidth={1.5} className="text-muted-foreground" />
                  )}
                </button>
                <Button className="w-full" onClick={continueAfterCreate}>Continuar</Button>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                <Input
                  placeholder={`Nombre ${w.ofThe} ${w.noun}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setMode("menu")}>Atrás</Button>
                  <Button onClick={submitCreate} disabled={submitting || !name.trim()}>
                    {submitting ? "Creando…" : "Crear"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        ¿Problemas? Escribinos y te ayudamos a conectar tu cuenta.
      </p>
    </div>
  );
}

export function NoMembershipBanner({ onOpen, role }: { onOpen: () => void; role: "user" | "investor" }) {
  const w = entityWords(role === "investor");
  return (
    <div className="border border-border rounded-lg px-4 py-3 bg-muted/40 flex items-center justify-between gap-3 mb-6">
      <span className="text-sm text-foreground">
        Todavía no formás parte de {w.no} {w.noun}.
      </span>
      <button
        onClick={onOpen}
        className="text-sm text-foreground underline underline-offset-2 hover:no-underline"
      >
        Configurar ahora
      </button>
    </div>
  );
}