import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { User as UserIcon, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/FormDialog";
import { useAuth } from "@/contexts/AuthContext";
import { handleMembershipError } from "@/lib/membership";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";

const MANAGE_USERS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/manage-users";
const REQUEST_EMAIL_CHANGE_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/request-email-change";
const GET_MY_ORGANIZATION_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/get-my-organization";

export default function Account() {
  const { user, loading, email, user_id, full_name, role, company_id, fund_id, refreshSession } =
    useAuth();

  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Prefill del nombre desde el contexto de sesión (independiente de la org).
  useEffect(() => {
    if (full_name) setFullName(full_name);
  }, [full_name]);

  // Fallback para sesiones emitidas antes de que get-session empezara a devolver
  // full_name: si el contexto no lo trae, lo intentamos leer de get-my-organization
  // (solo funciona si el usuario ya tiene org). Error 400 (sin org) o cualquier otro → silencioso.
  useEffect(() => {
    if (!user) return;
    if (fullName) return; // ya tenemos algo
    const hasOrg =
      (role === "user" && !!company_id) || (role === "investor" && !!fund_id);
    if (!hasOrg) return;
    (async () => {
      try {
        const res = await fetch(GET_MY_ORGANIZATION_URL, { credentials: "include" });
        if (!res.ok) return;
        const data: any = await res.json();
        const name =
          data.full_name ??
          data.user_full_name ??
          data.member_full_name ??
          data.user_name ??
          "";
        if (name) setFullName(name);
      } catch {
        // silencioso
      }
    })();
  }, [user?.email, role, company_id, fund_id, fullName]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  // Guardado del nombre completo: totalmente independiente de
  // GET_MY_ORGANIZATION. Éxito/error propios.
  const saveFullName = async () => {
    const next = fullName.trim();
    if (!next) return;
    // manage-users only accepts user_id, no email fallback — sending email instead
    // would just 400 "user_id es requerido", so don't even try.
    if (!user_id) {
      toast.error("Todavía no se cargó tu cuenta — esperá un segundo y volvé a intentar.");
      return;
    }
    setSavingName(true);
    try {
      const body: Record<string, unknown> = { user_id, full_name: next };
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
        let msg = "No se pudo actualizar el nombre";
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          // ignore
        }
        toast.error(msg);
        return;
      }
      toast.success("Nombre actualizado");
      await refreshSession();
    } catch {
      toast.error("No se pudo actualizar el nombre");
    } finally {
      setSavingName(false);
    }
  };

  // Matches the backend's own validation (auth/request-email-change) so the error
  // shows up while typing instead of only after a round-trip to the server.
  const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  const submitEmailChange = async () => {
    const next = newEmail.trim();
    if (!next) return;
    if (!EMAIL_REGEX.test(next)) {
      setEmailError("Ingresá un email válido");
      return;
    }
    setEmailError(null);
    setSendingEmail(true);
    try {
      const res = await fetch(REQUEST_EMAIL_CHANGE_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_email: next }),
      });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (res.status === 403) {
        setEmailError("No autorizado");
        return;
      }
      if (res.status === 400) {
        try {
          const data = await res.json();
          setEmailError(data?.error ?? "Error");
        } catch {
          setEmailError("Error");
        }
        return;
      }
      if (!res.ok) {
        setEmailError("Error inesperado");
        return;
      }
      setEmailModalOpen(false);
      setNewEmail("");
      toast.success(
        "Te enviamos un enlace de confirmación a tu nuevo email. Hacé click ahí para completar el cambio.",
        { duration: 8000 }
      );
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-8 py-12 space-y-8">
        <PageHeader
          title="Mi cuenta"
          subtitle={
            <>
              Gestioná tus datos personales. Para configurar tu {role === "investor" ? "organización" : "startup"}, andá a{" "}
              <Link to="/settings" className="underline underline-offset-2 hover:text-foreground">
                Configuración
              </Link>
              .
            </>
          }
          className="mb-0"
        />

        {/* Sección Mi perfil */}
        <section className="border border-border rounded-lg p-6 bg-card space-y-5">
          <div className="flex items-center gap-2">
            <UserIcon size={14} strokeWidth={1.5} className="text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Mi perfil</h2>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Nombre completo</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-9 flex-1 min-w-[200px]"
                placeholder="Tu nombre"
              />
              <Button size="sm" onClick={saveFullName} disabled={savingName || !fullName.trim() || !user_id}>
                {savingName ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Email</Label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[200px] h-9 px-3 flex items-center rounded-md border border-border bg-muted text-sm text-foreground">
                {email ?? "—"}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setNewEmail("");
                  setEmailError(null);
                  setEmailModalOpen(true);
                }}
              >
                <Mail size={12} className="mr-1.5" />
                Cambiar email
              </Button>
            </div>
          </div>
        </section>
      </div>
      <FormDialog
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        title="Cambiar email"
        description="Te vamos a enviar un enlace de confirmación al nuevo email. Tu email actual se mantiene hasta que confirmes desde ahí."
        onSubmit={submitEmailChange}
        submitLabel={sendingEmail ? "Enviando…" : "Enviar enlace"}
        busy={sendingEmail || !EMAIL_REGEX.test(newEmail.trim())}
      >
        <Label className="text-xs">Nuevo email</Label>
        <Input
          type="email"
          value={newEmail}
          onChange={(e) => {
            setNewEmail(e.target.value);
            setEmailError(null);
          }}
          placeholder="nuevo@email.com"
          autoFocus
        />
        {emailError && <p className="text-xs text-destructive">{emailError}</p>}
      </FormDialog>
    </AppLayout>
  );
}