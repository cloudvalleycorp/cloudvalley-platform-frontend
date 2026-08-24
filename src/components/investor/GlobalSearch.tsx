import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePortfolioTasks } from "@/hooks/usePortfolioTasks";
import { Compass, Building2, FileBarChart, FolderOpen, ListTodo, Network, SlidersHorizontal } from "lucide-react";

// MVP sin backend nuevo (P1, ver documento de diseño): indexa en cliente lo
// que ya está disponible sin fetches nuevos (empresas, de useAuth) más
// tareas (un solo fetch liviano, solo mientras el palette está abierto).
// Documentos/métricas de cada empresa quedan afuera de este MVP — indexarlos
// bien requeriría un fetch por empresa, no vale la pena para una primera
// versión client-side.
const NAV_SHORTCUTS = [
  { label: "Overview", to: "/overview", icon: Compass },
  { label: "Portfolio", to: "/portfolio", icon: Building2 },
  { label: "Reporting", to: "/reporting", icon: FileBarChart },
  { label: "Data Room", to: "/data-room", icon: FolderOpen },
  { label: "Tasks", to: "/tasks", icon: ListTodo },
  { label: "Gestión", to: "/requisitos", icon: SlidersHorizontal },
  { label: "Conexiones", to: "/conexiones", icon: Network },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: { id: string; name: string }[];
};

export function GlobalSearch({ open, onOpenChange, companies }: Props) {
  const navigate = useNavigate();
  // page_size chico — el palette es para encontrar algo puntual rápido, no
  // para listar todo el inbox; con texto el propio Command ya filtra client-side.
  const { tasks } = usePortfolioTasks({ page_size: 50 });

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {/* Visualmente oculto — Radix exige un DialogTitle para lectores de
          pantalla, el input de abajo ya es el título visible real. */}
      <DialogTitle className="sr-only">Buscar</DialogTitle>
      <DialogDescription className="sr-only">
        Buscar una empresa, una tarea, o ir a una sección de la plataforma.
      </DialogDescription>
      <CommandInput placeholder="Buscar una empresa, una tarea, o ir a una sección…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        <CommandGroup heading="Ir a">
          {NAV_SHORTCUTS.map((s) => (
            <CommandItem key={s.to} value={s.label} onSelect={() => go(s.to)}>
              <s.icon size={14} strokeWidth={1.5} className="mr-2 text-muted-foreground" aria-hidden="true" />
              {s.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {companies.length > 0 && (
          <CommandGroup heading="Empresas">
            {companies.map((c) => (
              <CommandItem key={c.id} value={c.name} onSelect={() => go(`/companies/${c.id}`)}>
                <Building2 size={14} strokeWidth={1.5} className="mr-2 text-muted-foreground" aria-hidden="true" />
                {c.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {tasks.length > 0 && (
          <CommandGroup heading="Tareas">
            {tasks.map((t) => (
              <CommandItem
                key={t.startup_task_id}
                value={`${t.title} ${t.company_name}`}
                onSelect={() => go(`/companies/${t.company_id}?tab=tasks`)}
              >
                <ListTodo size={14} strokeWidth={1.5} className="mr-2 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{t.title}</span>
                <CommandShortcut>{t.company_name}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

// Ctrl/Cmd+K global — llamalo una vez desde AppLayout con el setter de open.
export function useGlobalSearchShortcut(setOpen: (open: boolean) => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [setOpen]);
}
