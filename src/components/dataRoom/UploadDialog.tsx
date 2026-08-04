import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskSelector } from "@/components/dataRoom/TaskSelector";
import type { DataRoomTask } from "@/lib/dataRoom";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryLabel: string;
  tasks: DataRoomTask[];
  busy?: boolean;
  onSubmit: (input: { name: string; file: File; taskId: string | null; isPublic: boolean }) => void;
};

/** "Agregar documento" — elegís una tarea del Roadmap (autocompleta el nombre) o cargás uno libre. */
export function UploadDialog({ open, onOpenChange, categoryLabel, tasks, busy = false, onSubmit }: Props) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    if (!open) {
      setTaskId(null);
      setName("");
      setFile(null);
      setIsPublic(true);
    }
  }, [open]);

  const isOther = taskId === null;
  const effectiveName = isOther ? name : (tasks.find((t) => t.id === taskId)?.title ?? "");

  const handleSubmit = () => {
    if (!effectiveName.trim()) {
      toast.error("Ponele un nombre al documento");
      return;
    }
    if (!file) {
      toast.error("Elegí un archivo para subir");
      return;
    }
    onSubmit({ name: effectiveName.trim(), file, taskId, isPublic });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Agregar documento"
      description={`Categoría: ${categoryLabel}`}
      onSubmit={handleSubmit}
      submitLabel="Guardar"
      busy={busy}
    >
      <FormField label="Tarea del Roadmap (opcional)">
        <TaskSelector
          tasks={tasks}
          value={taskId}
          onChange={(v) => {
            setTaskId(v);
            if (v) setName(tasks.find((t) => t.id === v)?.title ?? "");
          }}
          placeholder="Elegí qué documento estás cargando"
          noneLabel="Otro documento (sin vincular)"
          showDoneSuffix
          className="w-full"
        />
      </FormField>

      {isOther && (
        <FormField label="Nombre">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del documento"
          />
        </FormField>
      )}

      <FormField label="Archivo">
        <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </FormField>

      <FormField label="Privacidad">
        <Select value={isPublic ? "public" : "private"} onValueChange={(v) => setIsPublic(v === "public")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Visible para inversores conectados</SelectItem>
            <SelectItem value="private">Privado · solo vos</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
    </FormDialog>
  );
}
