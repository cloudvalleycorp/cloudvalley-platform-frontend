import { useState } from "react";
import { FormDialog } from "@/components/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
  onInvited?: () => void;
};

export function InviteViewerDialog({ open, onOpenChange, organizationId, organizationName, onInvited }: Props) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleInvite = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      toast.error("Ingresá un email válido");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-org-viewer", {
        body: { organization_id: organizationId, email: trimmed },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Invitación enviada a ${trimmed}`);
      setEmail("");
      onOpenChange(false);
      onInvited?.();
    } catch (e: any) {
      toast.error(e.message ?? "Error al enviar invitación");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Invitar a ${organizationName}`}
      description="Le va a llegar un magic link al email para acceder al portfolio."
      onSubmit={handleInvite}
      submitLabel={submitting ? "Enviando…" : "Enviar invitación"}
      busy={submitting}
    >
      <Label className="text-xs">Email</Label>
      <Input
        type="email"
        placeholder="inversor@ejemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleInvite()}
      />
    </FormDialog>
  );
}