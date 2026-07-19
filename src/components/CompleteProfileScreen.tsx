import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/contexts/AuthContext";

const MANAGE_USERS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/manage-users";

// A minimal, single-step version of Onboarding's "quién sos" step — for people who
// already belong to an org (joined via invite, where accept-invite intentionally
// doesn't collect a name) rather than the ones going through the full company-
// creation wizard. Same visual language, none of the company-profile steps.
export function CompleteProfileScreen({ onSkip }: { onSkip: () => void }) {
  const { user_id, email, refreshSession } = useAuth();
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next = fullName.trim();
    if (!next) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { full_name: next };
      if (user_id) body.user_id = user_id;
      else if (email) body.email = email;
      const res = await fetch(MANAGE_USERS_URL, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) {
        let msg = "No se pudo guardar tu nombre";
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          // ignore
        }
        toast.error(msg);
        return;
      }
      await refreshSession();
    } catch {
      toast.error("No se pudo guardar tu nombre. Revisá tu conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <BrandMark />
      <div className="w-full max-w-xl">
        <div className="animate-fade-in space-y-6">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">¡Bienvenido a CloudValley!</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Contanos tu nombre para terminar de configurar tu cuenta.
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
            <div className="text-xs text-muted-foreground">
              Email de la cuenta: <span className="text-foreground">{email ?? "—"}</span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Ahora no
            </button>
            <Button onClick={save} disabled={!fullName.trim() || saving}>
              {saving ? "Guardando…" : "Continuar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
