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
import { useRoadmap } from "@/hooks/useRoadmap";
import { Compass, Building2, FileBarChart, FolderOpen, ListTodo, Network, SlidersHorizontal, LayoutDashboard, Map, BarChart3, Settings } from "lucide-react";

// MVP sin backend nuevo (P1, ver documento de diseño): indexa en cliente lo
// que ya está disponible sin fetches nuevos (empresas, de useAuth) más
// tareas (un solo fetch liviano, solo mientras el palette está abierto).
// Documentos/métricas de cada empresa quedan afuera de este MVP — indexarlos
// bien requeriría un fetch por empresa, no vale la pena para una primera
// versión client-side.
const NAV_SHORTCUTS_INVESTOR = [
  { label: "Overview", to: "/overview", icon: Compass },
  { label: "Portfolio", to: "/portfolio", icon: Building2 },
  { label: "Reporting", to: "/reporting", icon: FileBarChart },
  { label: "Data Room", to: "/data-room", icon: FolderOpen },
  { label: "Tasks", to: "/tasks", icon: ListTodo },
  { label: "Gestión", to: "/requisitos", icon: SlidersHorizontal },
  { label: "Conexiones", to: "/conexiones", icon: Network },
];

// Refactor de Dashboard/Roadmap/Data Room (2026-09-04) — antes el Asistente
// (y este palette) eran investor-only; el founder tenía sus propios destinos,
// no los de arriba (/overview, /portfolio, /tasks no existen para su rol).
const NAV_SHORTCUTS_FOUNDER = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Roadmap", to: "/roadmap", icon: Map },
  { label: "Métricas", to: "/metrics", icon: BarChart3 },
  { label: "Data Room", to: "/data-room", icon: FolderOpen },
  { label: "Reporting", to: "/reporting", icon: FileBarChart },
  { label: "Configuración", to: "/settings", icon: Settings },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: { id: string; name: string }[];
  role: "investor" | "user";
  companyId?: string | null;
};

export function GlobalSearch({ open, onOpenChange, companies, role, companyId }: Props) {
  const navigate = useNavigate();
  // page_size chico — el palette es para encontrar algo puntual rápido, no
  // para listar todo el inbox; con texto el propio Command ya filtra client-side.
  // Cada hook solo se pide de verdad para el rol al que le corresponde
  // (usePortfolioTasks es cross-company de fondo, useRoadmap es de una sola
  // startup) — pedir el que no aplica sería un request desperdiciado o, en
  // el caso de useRoadmap con companyId null, directamente deshabilitado.
  const { tasks: portfolioTasks } = usePortfolioTasks({ page_size: 50 }, role === "investor");
  const { tasks: roadmapTasks } = useRoadmap(role === "user" ? companyId ?? null : null);

  const navShortcuts = role === "user" ? NAV_SHORTCUTS_FOUNDER : NAV_SHORTCUTS_INVESTOR;
  const founderTasks = roadmapTasks.filter((t) => t.status !== "done").slice(0, 20);

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
        Buscar {role === "user" ? "una tarea" : "una empresa o una tarea"}, o ir a una sección de la plataforma.
      </DialogDescription>
      <CommandInput placeholder={role === "user" ? "Buscar una tarea, o ir a una sección…" : "Buscar una empresa, una tarea, o ir a una sección…"} />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        <CommandGroup heading="Ir a">
          {navShortcuts.map((s) => (
            <CommandItem key={s.to} value={s.label} onSelect={() => go(s.to)}>
              <s.icon size={14} strokeWidth={1.5} className="mr-2 text-muted-foreground" aria-hidden="true" />
              {s.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {role === "investor" && companies.length > 0 && (
          <CommandGroup heading="Empresas">
            {companies.map((c) => (
              <CommandItem key={c.id} value={c.name} onSelect={() => go(`/companies/${c.id}`)}>
                <Building2 size={14} strokeWidth={1.5} className="mr-2 text-muted-foreground" aria-hidden="true" />
                {c.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {role === "investor" && portfolioTasks.length > 0 && (
          <CommandGroup heading="Tareas">
            {portfolioTasks.map((t) => (
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
        {role === "user" && founderTasks.length > 0 && (
          <CommandGroup heading="Tareas">
            {founderTasks.map((t) => (
              <CommandItem
                key={t.startup_task_id}
                value={t.title}
                onSelect={() => go(`/roadmap?task=${encodeURIComponent(t.startup_task_id)}`)}
              >
                <ListTodo size={14} strokeWidth={1.5} className="mr-2 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{t.title}</span>
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
