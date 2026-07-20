import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/contexts/AuthContext";

const DECIDE_INVITATION_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/decide-invitation";

type InvitationInfo = {
  invitation_id: string;
  target_type: "company" | "fund";
  target_name: string;
  invited_by_name: string;
  status: "pending" | "accepted" | "declined";
  expires_at: string;
};

type Phase = "loading" | "ready" | "deciding" | "declined" | "error";

export default function Invitations() {
  const [params] = useSearchParams();
  const invitationId = params.get("invitation_id");
  const navigate = useNavigate();
  const { refreshSession } = useAuth();

  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);

  useEffect(() => {
    if (!invitationId) {
      setLoadError("Falta el identificador de la invitación.");
      setPhase("error");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${DECIDE_INVITATION_URL}?invitation_id=${encodeURIComponent(invitationId)}`,
          { credentials: "include" }
        );
        if (cancelled) return;
        if (res.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (res.status === 403) {
          setLoadError("Esta invitación no es tuya.");
          setPhase("error");
          return;
        }
        if (res.status === 404) {
          setLoadError("Esta invitación no existe o ya no está disponible.");
          setPhase("error");
          return;
        }
        if (!res.ok) {
          setLoadError("No se pudo cargar la invitación.");
          setPhase("error");
          return;
        }
        const data = (await res.json()) as InvitationInfo;
        setInfo(data);
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setLoadError("No se pudo cargar la invitación. Revisá tu conexión.");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invitationId]);

  const label = info?.target_type === "fund" ? "fondo" : "empresa";

  const decide = async (decision: "accept" | "decline") => {
    if (!invitationId) return;
    setPhase("deciding");
    setDecideError(null);
    try {
      const res = await fetch(DECIDE_INVITATION_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitation_id: invitationId, decision }),
      });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) {
        let msg = "No se pudo procesar tu decisión.";
        try {
          const data = await res.json();
          msg = data?.error ?? msg;
        } catch {
          // keep default
        }
        setDecideError(msg);
        setPhase("ready");
        return;
      }
      if (decision === "accept") {
        // El company_id/fund_id nuevo vive en Firestore pero todavía no en la
        // cookie — sin este refresh, el dashboard trata a la persona como si
        // siguiera sin organización.
        await refreshSession();
        navigate("/dashboard", { replace: true });
        return;
      }
      setPhase("declined");
    } catch {
      setDecideError("No se pudo procesar tu decisión. Revisá tu conexión.");
      setPhase("ready");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <BrandMark />
      <div className="w-full max-w-xl">
        {phase === "loading" ? (
          <div className="text-center text-sm text-muted-foreground animate-fade-in">
            Cargando invitación…
          </div>
        ) : phase === "error" ? (
          <div className="animate-fade-in text-center space-y-5">
            <h1 className="text-3xl font-medium tracking-tight">No pudimos cargar esto</h1>
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Ir a la plataforma
            </Button>
          </div>
        ) : phase === "declined" ? (
          <div className="animate-fade-in text-center space-y-5">
            <h1 className="text-3xl font-medium tracking-tight">Listo</h1>
            <p className="text-sm text-muted-foreground">No te uniste a {label === "fondo" ? "este fondo" : "esta empresa"}.</p>
            <Button onClick={() => navigate("/")}>Ir a la plataforma</Button>
          </div>
        ) : info && info.status !== "pending" ? (
          <div className="animate-fade-in text-center space-y-5">
            <h1 className="text-3xl font-medium tracking-tight">
              {info.status === "accepted" ? "Ya aceptaste esta invitación" : "Ya rechazaste esta invitación"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {info.invited_by_name} te invitó a unirte a {info.target_name}.
            </p>
            <Button onClick={() => navigate("/")}>Ir a la plataforma</Button>
          </div>
        ) : (
          info && (
            <div className="animate-fade-in space-y-6">
              <div className="text-center">
                <h1 className="text-2xl font-medium tracking-tight">
                  {info.invited_by_name} te invitó a unirte a {info.target_name}
                </h1>
                <p className="text-sm text-muted-foreground mt-2">
                  Vas a formar parte de {label === "fondo" ? "este fondo" : "esta empresa"} como miembro.
                </p>
              </div>

              {decideError && (
                <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-foreground text-center space-y-3">
                  <p>{decideError}</p>
                  <Link
                    to="/settings"
                    className="inline-block text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Ir a Configuración
                  </Link>
                </div>
              )}

              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => decide("decline")}
                  disabled={phase === "deciding"}
                >
                  Rechazar
                </Button>
                <Button onClick={() => decide("accept")} disabled={phase === "deciding"}>
                  {phase === "deciding" ? "Procesando…" : "Aceptar"}
                </Button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
