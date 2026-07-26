import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FormActions({
  onCancel,
  cancelLabel = "Cancelar",
  onSubmit,
  submitLabel = "Guardar",
  submitVariant = "default",
  busy = false,
  disabled = false,
  extra,
  className,
}: {
  onCancel: () => void;
  cancelLabel?: string;
  onSubmit: () => void;
  submitLabel?: string;
  submitVariant?: "default" | "destructive";
  busy?: boolean;
  disabled?: boolean;
  /** Extra controls (e.g. a tertiary action) rendered before Cancelar/Guardar. */
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 pt-1", className)}>
      {extra}
      <div className="flex items-center gap-2 ml-auto">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant={submitVariant} onClick={onSubmit} disabled={busy || disabled}>
          {busy ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
