import { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FormField({
  label,
  htmlFor,
  helpText,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  helpText?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
      {error ? (
        // -dark: text-destructive crudo da ~3.55:1 contra blanco (calculado),
        // falla WCAG AA — este es el mensaje de error de CADA campo de
        // formulario de la app.
        <p className="text-xs text-destructive-dark">{error}</p>
      ) : (
        helpText && <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
}
