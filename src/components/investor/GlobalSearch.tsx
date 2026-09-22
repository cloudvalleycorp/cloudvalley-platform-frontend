import { useEffect, useState } from "react";
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
import { API_BASE_URL } from "@/lib/apiConfig";
import { Compass, Building2, FileBarChart, FolderOpen, ListTodo, Network, SlidersHorizontal, LayoutDashboard, Map, BarChart3, Settings, Shield, Users, Landmark, DollarSign } from "lucide-react";

// Mismas URLs que ya arma cada página admin por su cuenta (Admin.tsx,
// AdminCompanies.tsx, AdminUsers.tsx, AdminFunds.tsx) — sin lib compartida
// hoy, se replica el mismo patrón acá en vez de forzar un refactor de 5
// archivos solo para esto.
const LIST_COMPANIES_URL = `${API_BASE_URL}/list-companies`;
const LIST_USERS_URL = `${API_BASE_URL}/list-users`;
const LIST_FUNDS_URL = `${API_BASE_URL}/list-funds`;

type AdminCompany = { company_id: string; name: string };
type AdminUser = { user_id: string; full_name: string | null; email: string };
type AdminFund = { fund_id: string; name: string };

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

// Admin (sumado 2026-09-21, Fase 7 del plan de Admin) — antes `role==="admin"`
// quedaba afuera de este palette a propósito (ver AppLayout.tsx, el botón
// "Buscar" ni se mostraba). Nombres/rutas en paridad con el sidebar
// reorganizado (AppSidebar.tsx, AdminGestionNavGroup/AdminDatosNavGroup).
const NAV_SHORTCUTS_ADMIN = [
  { label: "Ecosistema", to: "/admin", icon: Shield },
  { label: "Empresas", to: "/admin/companies", icon: Building2 },
  { label: "Usuarios", to: "/admin/users", icon: Users },
  { label: "Fondos", to: "/admin/funds", icon: Landmark },
  { label: "Datos financieros", to: "/admin/financial-data", icon: DollarSign },
  { label: "Catálogo Roadmap", to: "/admin/roadmap", icon: Map },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: { id: string; name: string }[];
  role: "investor" | "user" | "admin";
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

  // Admin no tiene, a nivel AppLayout, ningún fetch de empresas/usuarios/
  // fondos corriendo siempre (a diferencia de investor/founder, que ya usan
  // esos datos en el resto de la pantalla) — pedirlos ahí arriba solo para
  // este palette desperdiciaría requests en cada pantalla admin que no los
  // necesita. Se piden acá, perezoso, solo la primera vez que se abre.
  const [adminCompanies, setAdminCompanies] = useState<AdminCompany[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminFunds, setAdminFunds] = useState<AdminFund[]>([]);
  const [adminLoaded, setAdminLoaded] = useState(false);
  useEffect(() => {
    if (role !== "admin" || !open || adminLoaded) return;
    setAdminLoaded(true);
    (async () => {
      try {
        const [companiesRes, usersRes, fundsRes] = await Promise.all([
          fetch(LIST_COMPANIES_URL, { credentials: "include" }),
          fetch(LIST_USERS_URL, { credentials: "include" }),
          fetch(LIST_FUNDS_URL, { credentials: "include" }),
        ]);
        const [companiesData, usersData, fundsData] = await Promise.all([
          companiesRes.ok ? companiesRes.json() : { companies: [] },
          usersRes.ok ? usersRes.json() : { users: [] },
          fundsRes.ok ? fundsRes.json() : { funds: [] },
        ]);
        setAdminCompanies(Array.isArray(companiesData?.companies) ? companiesData.companies : []);
        setAdminUsers(Array.isArray(usersData?.users) ? usersData.users : []);
        setAdminFunds(Array.isArray(fundsData?.funds) ? fundsData.funds : []);
      } catch {
        // silencioso — el palette sigue funcionando con "Ir a" nomás
      }
    })();
  }, [role, open, adminLoaded]);

  const navShortcuts = role === "user" ? NAV_SHORTCUTS_FOUNDER : role === "admin" ? NAV_SHORTCUTS_ADMIN : NAV_SHORTCUTS_INVESTOR;
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
        Buscar {role === "user" ? "una tarea" : role === "admin" ? "una empresa, un usuario o un fondo" : "una empresa o una tarea"}, o ir a una sección de la plataforma.
      </DialogDescription>
      <CommandInput
        placeholder={
          role === "user"
            ? "Buscar una tarea, o ir a una sección…"
            : role === "admin"
              ? "Buscar una empresa, un usuario, un fondo…"
              : "Buscar una empresa, una tarea, o ir a una sección…"
        }
      />
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
        {role === "admin" && adminCompanies.length > 0 && (
          <CommandGroup heading="Empresas">
            {adminCompanies.map((c) => (
              <CommandItem key={c.company_id} value={c.name} onSelect={() => go(`/admin/startup/${c.company_id}`)}>
                <Building2 size={14} strokeWidth={1.5} className="mr-2 text-muted-foreground" aria-hidden="true" />
                {c.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {role === "admin" && adminFunds.length > 0 && (
          <CommandGroup heading="Fondos">
            {adminFunds.map((f) => (
              <CommandItem key={f.fund_id} value={f.name} onSelect={() => go("/admin/funds")}>
                <Landmark size={14} strokeWidth={1.5} className="mr-2 text-muted-foreground" aria-hidden="true" />
                {f.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {role === "admin" && adminUsers.length > 0 && (
          <CommandGroup heading="Usuarios">
            {adminUsers.map((u) => (
              <CommandItem
                key={u.user_id}
                value={`${u.full_name ?? ""} ${u.email}`}
                onSelect={() => go("/admin/users")}
              >
                <Users size={14} strokeWidth={1.5} className="mr-2 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{u.full_name ?? u.email}</span>
                <CommandShortcut>{u.email}</CommandShortcut>
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
