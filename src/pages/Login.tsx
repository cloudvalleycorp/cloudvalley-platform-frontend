import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { REQUEST_MAGIC_LINK_URL, useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const COOLDOWN_SECONDS = 60;

export default function Login() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const invalidLink = params.get("error") === "invalid_link";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || cooldown > 0) return;
    setSubmitting(true);
    try {
      await fetch(REQUEST_MAGIC_LINK_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Intencional: no diferenciar errores del backend al usuario.
    }
    setSubmitting(false);
    setSent(true);
    setCooldown(COOLDOWN_SECONDS);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-medium tracking-tight">CloudValley</h1>
          <p className="mt-2 text-sm text-muted-foreground">Acceso con enlace mágico</p>
        </div>

        {invalidLink && (
          <div className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
            El enlace expiró o ya fue utilizado. Pedí uno nuevo.
          </div>
        )}

        {sent ? (
          <div className="space-y-4 animate-fade-in">
            <p className="text-sm text-foreground text-center">
              Si tu email está habilitado, vas a recibir un enlace de acceso en tu casilla en los próximos minutos.
            </p>
            <Button
              type="button"
              onClick={() => { setSent(false); }}
              disabled={cooldown > 0}
              variant="outline"
              className="w-full h-11"
            >
              {cooldown > 0 ? `Reenviar en ${cooldown}s` : "Enviar otro enlace"}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="h-11"
            />
            <Button type="submit" disabled={submitting || cooldown > 0} className="w-full h-11">
              {submitting
                ? "Enviando…"
                : cooldown > 0
                ? `Esperá ${cooldown}s`
                : "Enviar enlace de acceso"}
            </Button>
            <p className="text-xs text-tertiary text-center pt-2">
              Te enviamos un link al mail. Sin contraseña.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
