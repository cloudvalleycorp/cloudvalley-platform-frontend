import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Check, Building2, Users, Clock, ArrowRight, Mail } from "lucide-react";
import {
  MANAGE_COMPANIES_URL,
  MANAGE_FUNDS_URL,
  REQUEST_MEMBERSHIP_URL,
  handleMembershipError,
  rememberPendingMembership,
  forgetPendingMembership,
  getPendingMembership,
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
  const label = role === "user" ? "empresa" : "fondo";
  const [mode, setMode] = useState<Mode>("menu");
  const [joinCode, setJoinCode] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [joinSent, setJoinSent] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Consume intent saved during PublicInvite to pre-fill this screen.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MEMBERSHIP_INTENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.role === role) {
          const intent = parsed.intent;
          localStorage.removeItem(MEMBERSHIP_INTENT_KEY);
          if (intent?.kind === "join" && intent.code) {
            setJoinCode(intent.code);
            setMode("join");
            // Auto-submit membership request so the user actually appears
            // in the target org without an extra manual click.
            void autoSubmitJoin(intent.code);
            return;
          } else if (intent?.kind === "create" && intent.name) {
            setName(intent.name);
            setMode("create");
            return;
          }
        } else {
          localStorage.removeItem(MEMBERSHIP_INTENT_KEY);
        }
      }
    } catch {
      // ignore
    }

    // No fresh intent — check if we're already waiting on a request from a previous visit
    // (sent from here or from a CodeInvite link), so a reload doesn't send the user back
    // to the menu as if nothing happened.
    const pending = getPendingMembership();
    if (pending) {
      setJoinCode(pending.code);
      setMode("join");
      setJoinSent(true);
    }
  }, [role]);

  const autoSubmitJoin = async (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const res = await fetch(REQUEST_MEMBERSHIP_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ join_code: trimmed }),
      });
      if (await handleMembershipError(res)) return;
      setJoinSent(true);
      rememberPendingMembership(trimmed);
      toast.success("Solicitud enviada");
    } catch {
      toast.error("No se pudo enviar la solicitud. Revisá tu conexión.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitJoin = async () => {
    if (!joinCode.trim()) return;
    setSubmitting(true);
    try {
      const trimmed = joinCode.trim().toUpperCase();
      const res = await fetch(REQUEST_MEMBERSHIP_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ join_code: trimmed }),
      });
      if (await handleMembershipError(res)) return;
      setJoinSent(true);
      rememberPendingMembership(trimmed);
      toast.success("Solicitud enviada");
    } catch {
      toast.error("No se pudo enviar la solicitud. Revisá tu conexión.");
    } finally {
      setSubmitting(false);
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
          {role === "user" ? "Configuración de empresa" : "Configuración de fondo"}
        </div>
        <h1 className="text-3xl font-medium tracking-tight">
          Conectá tu cuenta a una {label}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {email ? <>Estás logueado como <span className="text-foreground">{email}</span>. </> : null}
          Para ver el contenido necesitás formar parte de una {label}.
        </p>
      </div>

      <div className="border border-border rounded-xl p-6 sm:p-8 bg-card shadow-sm">
        {mode === "menu" && (
          <>
            <h2 className="text-lg font-medium">Elegí cómo continuar</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Podés unirte con un código o crear tu propia {label}.
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
                    Ingresá el código que te compartió tu {label}.
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
                  <div className="font-medium">Crear mi propia {label}</div>
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
              Ingresá el código que te compartió tu {label}. Un miembro va a aprobar tu solicitud.
            </p>
            {joinSent ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-lg border border-border bg-muted/40 p-4 flex items-start gap-3">
                  <Mail size={18} strokeWidth={1.5} className="mt-0.5 text-foreground shrink-0" />
                  <div className="text-sm">
                    <div className="font-medium text-foreground">Solicitud enviada</div>
                    <div className="text-muted-foreground mt-0.5">
                      Un miembro de la {label} la va a revisar. Vas a recibir acceso cuando te aprueben.
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
                <Input
                  placeholder="Código de acceso"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="h-11 font-mono tracking-widest uppercase"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setMode("menu")}>Atrás</Button>
                  <Button onClick={submitJoin} disabled={submitting || !joinCode.trim()}>
                    {submitting ? "Enviando…" : "Enviar solicitud"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {mode === "create" && (
          <>
            <h2 className="text-lg font-medium">Crear mi propia {label}</h2>
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
                  placeholder={role === "user" ? "Nombre de la empresa" : "Nombre del fondo"}
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
  const label = role === "user" ? "empresa" : "fondo";
  return (
    <div className="border border-border rounded-lg px-4 py-3 bg-muted/40 flex items-center justify-between gap-3 mb-6">
      <span className="text-sm text-foreground">
        Todavía no formás parte de ninguna {label}.
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