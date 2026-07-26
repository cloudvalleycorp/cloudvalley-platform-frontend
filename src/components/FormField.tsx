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
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        helpText && <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
}
