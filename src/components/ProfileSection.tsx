import { useEffect, useState } from "react";
import { toast } from "sonner";
import { User as UserIcon, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/FormDialog";
import { ImageUploadField } from "@/components/ImageUploadField";
import { SectionCard } from "@/components/SectionCard";
import { useAuth } from "@/contexts/AuthContext";
import { useImageUpload } from "@/hooks/useImageUpload";
import { API_BASE_URL } from "@/lib/apiConfig";

const MANAGE_USERS_URL = `${API_BASE_URL}/manage-users`;
const REQUEST_EMAIL_CHANGE_URL = `${API_BASE_URL}/request-email-change`;

// Matches the backend's own validation (auth/request-email-change) so the error
// shows up while typing instead of only after a round-trip to the server.
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Perfil personal (avatar, nombre, rol, LinkedIn, email) — sección "Perfil"
// del shell único de Configuración (mockup aprobado: Perfil/Startup/
// Miembros/Integraciones/Privacidad, sin pantalla "Mi cuenta" aparte).
// Antes vivía sola en /account; esa ruta ahora redirige acá.
export function ProfileSection() {
  const { user, email, user_id, full_name, avatar_url, role_title, linkedin_url, refreshSession } = useAuth();

  const [fullName, setFullName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const { upload: uploadAvatar, uploading: uploadingAvatar } = useImageUpload({ kind: "avatar", userId: user_id ?? undefined });

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (full_name) setFullName(full_name);
  }, [full_name]);
  useEffect(() => {
    setRoleTitle(role_title ?? "");
  }, [role_title]);
  useEffect(() => {
    setLinkedinUrl(linkedin_url ?? "");
  }, [linkedin_url]);

  if (!user) return null;

  const saveProfile = async () => {
    const next = fullName.trim();
    if (!next) return;
    if (!user_id) {
      toast.error("Todavía no se cargó tu cuenta. Esperá un segundo y volvé a intentar.");
      return;
    }
    setSavingProfile(true);
    try {
      const body: Record<string, unknown> = {
        user_id,
        full_name: next,
        role_title: roleTitle.trim() || null,
        linkedin_url: linkedinUrl.trim() || null,
      };
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
        let msg = "No se pudo actualizar el perfil";
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          // ignore
        }
        toast.error(msg);
        return;
      }
      toast.success("Perfil actualizado");
      await refreshSession();
    } catch {
      toast.error("No se pudo actualizar el perfil");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarSelect = async (file: File) => {
    const ok = await uploadAvatar(file);
    if (ok) await refreshSession();
  };

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
    <>
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <UserIcon size={14} strokeWidth={1.5} className="text-muted-foreground" />
            Perfil
          </span>
        }
      >
        <div className="space-y-5">
          <ImageUploadField
            imageUrl={avatar_url}
            fallback={(fullName || email || "?").trim().slice(0, 2).toUpperCase()}
            shape="circle"
            size={64}
            uploading={uploadingAvatar}
            onSelect={handleAvatarSelect}
            hint="Se ve en el header y en la lista de miembros de tu startup. PNG, JPG o WEBP, hasta 5MB."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Nombre completo</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-9"
                placeholder="Tu nombre"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Rol</Label>
              <Input
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                className="h-9"
                placeholder="Ej: Founder & CEO"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">LinkedIn</Label>
            <Input
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              className="h-9"
              placeholder="linkedin.com/in/tu-usuario"
            />
          </div>

          <Button size="sm" onClick={saveProfile} disabled={savingProfile || !fullName.trim() || !user_id}>
            {savingProfile ? "Guardando…" : "Guardar cambios"}
          </Button>

          <div className="space-y-2 pt-1 border-t border-border">
            <Label className="text-xs pt-4 block">Email</Label>
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
        </div>
      </SectionCard>

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
        {emailError && <p className="text-xs text-destructive" aria-live="polite">{emailError}</p>}
      </FormDialog>
    </>
  );
}
