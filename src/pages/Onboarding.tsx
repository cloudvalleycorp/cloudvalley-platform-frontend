import { useState, useEffect } from "react";
import { useNavigate, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useStartup } from "@/hooks/useStartup";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ACCEPT_INVITE_URL, REQUEST_MEMBERSHIP_URL, MANAGE_COMPANIES_URL } from "@/lib/membership";
import { GET_SESSION_URL } from "@/contexts/AuthContext";

const MANAGE_USERS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/manage-users";

const stages = [
  { id: "pre_seed", label: "Pre-Seed", desc: "Idea o producto temprano, ronda < $1M." },
  { id: "seed", label: "Seed", desc: "Producto en mercado, $1-5M." },
  { id: "series_a", label: "Serie A", desc: "Tracción y métricas claras, $5-20M." },
];
const models = [
  { id: "saas", label: "SaaS" },
  { id: "marketplace", label: "Marketplace" },
  { id: "ecommerce", label: "E-commerce" },
  { id: "b2b_services", label: "B2B Services" },
  { id: "consumer", label: "Consumer" },
  { id: "other", label: "Otro" },
];

export default function Onboarding() {
  const { user, loading: authLoading, isOrgViewer, company_id, user_id, email, refreshSession } = useAuth();
  const { startup, loading: startupLoading } = useStartup();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inviteCodeParam = params.get("code");
  const inviteRoleParam = params.get("role");
  const isPublicInvite = inviteRoleParam === "user" || inviteRoleParam === "investor";

  // Code-based invite flow — role is derived from the code server-side.
  if (inviteCodeParam) {
    return <CodeInvite code={inviteCodeParam} />;
  }

  // Public invite flow — no auth required, short form calling accept-invite.
  if (isPublicInvite) {
    return <PublicInvite role={inviteRoleParam as "user" | "investor"} />;
  }
  if (inviteRoleParam !== null && !isPublicInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center text-sm text-muted-foreground">
          Link de invitación inválido.
        </div>
      </div>
    );
  }

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [stage, setStage] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [target, setTarget] = useState("");
  const [founderName, setFounderName] = useState("");
  const [cohortNumber, setCohortNumber] = useState("");
  const [cohortYear, setCohortYear] = useState(String(new Date().getFullYear()));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
    if (!authLoading && user && isOrgViewer) navigate("/portfolio", { replace: true });
    // Ya onboardeado según la sesión del backend.
    if (!authLoading && user && company_id) navigate("/dashboard", { replace: true });
  }, [authLoading, user, isOrgViewer, company_id, navigate]);

  if (authLoading || startupLoading) return null;
  if (isOrgViewer) return <Navigate to="/portfolio" replace />;
  if (company_id) return <Navigate to="/dashboard" replace />;
  if (startup) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      // 1. Guardar nombre completo en el backend de sesión (obligatorio).
      //    Así el header muestra el nombre en lugar del email.
      try {
        const body: Record<string, unknown> = { full_name: founderName.trim() };
        if (user_id) body.user_id = user_id;
        else if (email) body.email = email;
        await fetch(MANAGE_USERS_URL, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        // No bloqueamos la creación por esto — se puede editar luego en /account.
      }

      // Create the company (self-service) via the auth backend.
      const res = await fetch(MANAGE_COMPANIES_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_own_with_profile",
          name,
          industry,
          stage: stage as "pre_seed" | "seed" | "series_a",
          business_model: model,
          target_raise_usd: target ? Number(target) : null,
          cohort_number: cohortNumber ? Number(cohortNumber) : null,
          cohort_year: cohortYear ? Number(cohortYear) : null,
        }),
      });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Error al crear startup");
      }

      // Update profile name
      if (founderName) {
        // TODO: migrar a backend propio
        await supabase.from("profiles").update({ name: founderName }).eq("id", user.id);
      }

      // The company_id isn't in the session cookie yet — refresh before navigating,
      // otherwise the next screens see the user as if they still had no company.
      await refreshSession();
      toast.success("¡Startup creada!");
      navigate("/dashboard", { replace: true });
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear startup");
    } finally {
      setSubmitting(false);
    }
  };

  const canNext =
    (step === 1 && founderName.trim() && name && industry) ||
    (step === 2 && stage) ||
    (step === 3 && model) ||
    (step === 4 && cohortNumber);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        {/* Progress */}
        <div className="flex gap-1.5 mb-12">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={cn(
                "h-0.5 flex-1 rounded-full transition-all duration-150",
                i <= step ? "bg-foreground" : "bg-border"
              )}
            />
          ))}
        </div>

        <div className="text-xs text-muted-foreground mb-2">Paso {step} de 4</div>

        {step === 1 && (
          <div className="animate-fade-in space-y-6">
            <h2 className="text-2xl font-medium tracking-tight">Contanos quién sos</h2>
            <p className="text-sm text-muted-foreground -mt-4">
              Tu nombre y el de tu startup. Ambos son obligatorios — así te identificamos en la plataforma.
            </p>
            <div className="space-y-3">
              <Input
                placeholder="Tu nombre completo"
                value={founderName}
                onChange={(e) => setFounderName(e.target.value)}
                className="h-11"
                autoFocus
              />
              <div className="pt-2 text-xs text-muted-foreground">
                Email de la cuenta:{" "}
                <span className="text-foreground">{email ?? "—"}</span>
              </div>
              <Input
                placeholder="Nombre de la startup"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11"
              />
              <Input
                placeholder="Industria (ej. Fintech, HealthTech)"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-in space-y-6">
            <h2 className="text-2xl font-medium tracking-tight">¿En qué etapa estás?</h2>
            <div className="grid gap-3">
              {stages.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStage(s.id)}
                  className={cn(
                    "text-left p-4 rounded-lg border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    stage === s.id
                      ? "border-foreground bg-surface"
                      : "border-border hover:border-foreground/30"
                  )}
                >
                  <div className="font-medium">{s.label}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-fade-in space-y-6">
            <h2 className="text-2xl font-medium tracking-tight">¿Modelo de negocio?</h2>
            <div className="grid grid-cols-2 gap-3">
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className={cn(
                    "text-left p-4 rounded-lg border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    model === m.id
                      ? "border-foreground bg-surface"
                      : "border-border hover:border-foreground/30"
                  )}
                >
                  <div className="font-medium">{m.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="animate-fade-in space-y-6">
            <h2 className="text-2xl font-medium tracking-tight">Últimos detalles</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  min="1"
                  placeholder="Nº de cohort"
                  value={cohortNumber}
                  onChange={(e) => setCohortNumber(e.target.value)}
                  className="h-11"
                />
                <Input
                  type="number"
                  min="2000"
                  max="2100"
                  placeholder="Año del programa"
                  value={cohortYear}
                  onChange={(e) => setCohortYear(e.target.value)}
                  className="h-11"
                />
              </div>
              <Input
                type="number"
                placeholder="Objetivo de ronda en USD (opcional)"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
        )}

        <div className="flex justify-between mt-12">
          <Button
            variant="ghost"
            onClick={() => setStep(step - 1)}
            disabled={step === 1}
          >
            Atrás
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
              Siguiente
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canNext || submitting}>
              {submitting ? "Creando…" : "Crear startup"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

type MembershipIntent =
  | { kind: "join"; code: string }
  | { kind: "create"; name: string }
  | { kind: "later" };

export const MEMBERSHIP_INTENT_KEY = "cv:membership_intent";

function CodeInvite({ code }: { code: string }) {
  const [phase, setPhase] = useState<"checking" | "authed" | "form" | "done">("checking");
  const [message, setMessage] = useState<string>("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(GET_SESSION_URL, { credentials: "include" });
        if (cancelled) return;
        if (res.ok) {
          setPhase("authed");
          try {
            const r = await fetch(REQUEST_MEMBERSHIP_URL, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ join_code: code }),
            });
            if (cancelled) return;
            if (r.status === 401) {
              setPhase("form");
              return;
            }
            if (r.status === 201 || r.ok) {
              setMessage("Solicitud enviada. Un miembro de la organización la va a revisar.");
              setPhase("done");
              return;
            }
            if (r.status === 400) {
              const data = await r.json().catch(() => null);
              setMessage(data?.error ?? "No se pudo enviar la solicitud.");
              setPhase("done");
              return;
            }
            setMessage("No se pudo enviar la solicitud.");
            setPhase("done");
          } catch {
            setMessage("No se pudo enviar la solicitud.");
            setPhase("done");
          }
          return;
        }
        // 401 or otherwise not authenticated
        setPhase("form");
      } catch {
        if (!cancelled) setPhase("form");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const canSubmit = fullName.trim().length > 0 && /\S+@\S+\.\S+/.test(email);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await fetch(ACCEPT_INVITE_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          full_name: fullName,
          join_code: code.trim().toUpperCase(),
        }),
      });
    } catch {
      // do not leak backend errors
    }
    setMessage(
      "Si los datos son válidos, vas a recibir un enlace de acceso en tu casilla en breve."
    );
    setPhase("done");
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        {phase === "checking" || phase === "authed" ? (
          <div className="text-center text-sm text-muted-foreground animate-fade-in">
            Procesando invitación…
          </div>
        ) : phase === "done" ? (
          <div className="animate-fade-in text-center space-y-4">
            <h1 className="text-3xl font-medium tracking-tight">Listo</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        ) : (
          <div className="animate-fade-in space-y-6">
            <div>
              <h1 className="text-2xl font-medium tracking-tight">
                Te estás uniendo a una organización existente
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                Ingresá tus datos para recibir un enlace de acceso.
              </p>
            </div>
            <div className="space-y-3">
              <Input
                placeholder="Tu nombre completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-11"
                autoFocus
              />
              <Input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
                {submitting ? "Enviando…" : "Recibir enlace"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PublicInvite({ role }: { role: "user" | "investor" }) {
  const label = role === "user" ? "empresa" : "fondo";
  const roleLabel = role === "user" ? "Usuario" : "Inversor";

  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [choice, setChoice] = useState<"join" | "create" | "later" | "">("");
  const [joinCode, setJoinCode] = useState("");
  const [entityName, setEntityName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const totalSteps = choice === "later" || !choice ? 2 : 3;

  const canNext =
    (step === 1 && fullName.trim() && /\S+@\S+\.\S+/.test(email)) ||
    (step === 2 && !!choice) ||
    (step === 3 &&
      ((choice === "join" && joinCode.trim().length > 0) ||
        (choice === "create" && entityName.trim().length > 0)));

  const isLastStep =
    (step === 2 && choice === "later") || step === 3;

  const handleSubmit = async () => {
    setSubmitting(true);
    // Persist intent for NoMembershipScreen to consume after login.
    let intent: MembershipIntent = { kind: "later" };
    if (choice === "join") intent = { kind: "join", code: joinCode.trim() };
    else if (choice === "create") intent = { kind: "create", name: entityName.trim() };
    try {
      localStorage.setItem(MEMBERSHIP_INTENT_KEY, JSON.stringify({ role, intent }));
    } catch {
      // ignore storage errors
    }
    try {
      await fetch(ACCEPT_INVITE_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          email,
          full_name: fullName,
          ...(choice === "create" ? { entity_name: entityName.trim() } : {}),
          ...(choice === "join" ? { join_code: joinCode.trim().toUpperCase() } : {}),
        }),
      });
    } catch {
      // Do not leak backend errors.
    }
    setSubmitting(false);
    setSent(true);
  };

  const onPrimary = () => {
    if (isLastStep) return handleSubmit();
    setStep(step + 1);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        {sent ? (
          <div className="animate-fade-in text-center space-y-4">
            <h1 className="text-3xl font-medium tracking-tight">Revisá tu correo</h1>
            <p className="text-sm text-muted-foreground">
              Si los datos son válidos, te enviamos un enlace de acceso a{" "}
              <span className="text-foreground font-medium">{email}</span>. Al iniciar
              sesión vamos a retomar el flujo con tu {label}.
            </p>
          </div>
        ) : (
          <>
            {/* Progress */}
            <div className="flex gap-1.5 mb-12">
              {Array.from({ length: totalSteps }, (_, i) => i + 1).map((i) => (
                <div
                  key={i}
                  className={cn(
                    "h-0.5 flex-1 rounded-full transition-all duration-150",
                    i <= step ? "bg-foreground" : "bg-border"
                  )}
                />
              ))}
            </div>

            <div className="text-xs text-muted-foreground mb-2">
              Te unís como <span className="text-foreground font-medium">{roleLabel}</span> · Paso {step} de {totalSteps}
            </div>

            {step === 1 && (
              <div className="animate-fade-in space-y-6">
                <h2 className="text-2xl font-medium tracking-tight">
                  Bienvenido a CloudValley
                </h2>
                <p className="text-sm text-muted-foreground -mt-4">
                  Contanos quién sos para crear tu cuenta.
                </p>
                <div className="space-y-3">
                  <Input
                    placeholder="Tu nombre completo"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-11"
                  />
                  <Input
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="animate-fade-in space-y-6">
                <h2 className="text-2xl font-medium tracking-tight">
                  ¿Con qué {label} te vas a conectar?
                </h2>
                <div className="grid gap-3">
                  {[
                    {
                      id: "join" as const,
                      title: `Unirme a una ${label} existente`,
                      desc: `Tengo un código de acceso compartido por mi ${label}.`,
                    },
                    {
                      id: "create" as const,
                      title: `Crear una nueva ${label}`,
                      desc: `Voy a generar un código para invitar a mi equipo.`,
                    },
                    {
                      id: "later" as const,
                      title: "Decidir más tarde",
                      desc: "Prefiero configurarlo después de iniciar sesión.",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setChoice(opt.id)}
                      className={cn(
                        "text-left p-4 rounded-lg border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        choice === opt.id
                          ? "border-foreground bg-surface"
                          : "border-border hover:border-foreground/30"
                      )}
                    >
                      <div className="font-medium">{opt.title}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && choice === "join" && (
              <div className="animate-fade-in space-y-6">
                <h2 className="text-2xl font-medium tracking-tight">Ingresá el código</h2>
                <p className="text-sm text-muted-foreground -mt-4">
                  Un miembro de la {label} va a revisar y aprobar tu solicitud.
                </p>
                <Input
                  placeholder="Código de acceso"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="h-11 tracking-widest font-mono"
                />
              </div>
            )}

            {step === 3 && choice === "create" && (
              <div className="animate-fade-in space-y-6">
                <h2 className="text-2xl font-medium tracking-tight">
                  ¿Cómo se llama tu {label}?
                </h2>
                <p className="text-sm text-muted-foreground -mt-4">
                  Después de iniciar sesión generamos el código para tu equipo.
                </p>
                <Input
                  placeholder={role === "user" ? "Nombre de la empresa" : "Nombre del fondo"}
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  className="h-11"
                />
              </div>
            )}

            <div className="flex justify-between mt-12">
              <Button
                variant="ghost"
                onClick={() => setStep(step - 1)}
                disabled={step === 1 || submitting}
              >
                Atrás
              </Button>
              <Button onClick={onPrimary} disabled={!canNext || submitting}>
                {submitting ? "Enviando…" : isLastStep ? "Recibir enlace" : "Siguiente"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
