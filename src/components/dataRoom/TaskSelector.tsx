import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DataRoomTask } from "@/lib/dataRoom";

type Props = {
  tasks: DataRoomTask[];
  value: string | null;
  onChange: (taskId: string | null) => void;
  placeholder?: string;
  /** "· ya cargado" junto a las tareas ya completas — usado en "Agregar documento", no en la fila. */
  showDoneSuffix?: boolean;
  noneLabel?: string;
  className?: string;
};

export function TaskSelector({
  tasks,
  value,
  onChange,
  placeholder = "Vincular a roadmap",
  showDoneSuffix = false,
  noneLabel = "Sin vincular",
  className,
}: Props) {
  return (
    <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{noneLabel}</SelectItem>
        {tasks.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.title}
            {showDoneSuffix && t.done ? " · ya cargado" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
