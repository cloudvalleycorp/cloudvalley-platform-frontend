import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  onSubmit,
  submitLabel = "Guardar",
  submitVariant = "default",
  cancelLabel = "Cancelar",
  busy = false,
  contentClassName,
  footerClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Overrides the default Cancelar/Guardar footer for dialogs with custom actions. */
  footer?: ReactNode;
  onSubmit?: () => void;
  submitLabel?: string;
  submitVariant?: "default" | "destructive";
  cancelLabel?: string;
  busy?: boolean;
  contentClassName?: string;
  footerClassName?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md", contentClassName)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3 py-2">{children}</div>
        <DialogFooter className={footerClassName}>
          {footer ?? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {cancelLabel}
              </Button>
              <Button variant={submitVariant} onClick={onSubmit} disabled={busy}>
                {submitLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
