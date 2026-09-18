import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "rename";
  initialName?: string;
  busy?: boolean;
  onSubmit: (name: string) => void;
};

/** Crear o renombrar una carpeta — un solo campo, mismo diálogo para los dos modos. */
export function FolderNameDialog({ open, onOpenChange, mode, initialName = "", busy = false, onSubmit }: Props) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const handleSubmit = () => {
    const next = name.trim();
    if (!next) {
      toast.error("Ponele un nombre a la carpeta");
      return;
    }
    onSubmit(next);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "Nueva carpeta" : "Renombrar carpeta"}
      description={mode === "create" ? "Elegí un nombre para organizar tus documentos." : "Cambiá el nombre de esta carpeta."}
      onSubmit={handleSubmit}
      submitLabel={mode === "create" ? "Crear" : "Guardar"}
      busy={busy}
    >
      <FormField label="Nombre">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Ej: Contratos 2026"
        />
      </FormField>
    </FormDialog>
  );
}
