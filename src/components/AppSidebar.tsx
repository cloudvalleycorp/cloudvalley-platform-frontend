import { LayoutDashboard, Map, BarChart3, FolderOpen, Shield, Network, Building2, Users, Landmark } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { LIST_CONNECTIONS_URL, type Connection } from "@/lib/connections";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useStartup } from "@/hooks/useStartup";
import { StageBadge } from "./StageBadge";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Roadmap", url: "/roadmap", icon: Map },
  { title: "Métricas", url: "/metrics", icon: BarChart3 },
  { title: "Data Room", url: "/data-room", icon: FolderOpen },
  { title: "Conexiones", url: "/conexiones", icon: Network },
];

export function AppSidebar() {
  const { isAdmin, isOrgViewer, fund_name, company_id } = useAuth();
  const { startup } = useStartup();
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!company_id) {
      setOrgs([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(LIST_CONNECTIONS_URL, { credentials: "include" });
        if (!res.ok) {
          setOrgs([]);
          return;
        }
        const data = await res.json();
        const connections: Connection[] = Array.isArray(data?.connections) ? data.connections : [];
        setOrgs(
          connections
            .filter((c) => c.status === "connected")
            .map((c) => ({ id: c.counterpart_id, name: c.counterpart_name }))
        );
      } catch {
        setOrgs([]);
      }
    })();
  }, [company_id]);

  if (isOrgViewer) {
    return (
      <Sidebar>
        <SidebarHeader className="border-b border-sidebar-border px-5 py-5">
          <div className="text-lg font-medium tracking-tight">CloudValley</div>
          {fund_name && <div className="mt-3 text-sm text-foreground">{fund_name}</div>}
        </SidebarHeader>
        <SidebarContent className="px-3 py-4">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/portfolio"
                      end
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all duration-150 ${
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
                        }`
                      }
                    >
                      <Building2 size={16} strokeWidth={1.5} />
                      <span>Portfolio</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/conexiones"
                      end
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all duration-150 ${
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
                        }`
                      }
                    >
                      <Network size={16} strokeWidth={1.5} />
                      <span>Conexiones</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-5 py-5">
        <div className="text-lg font-medium tracking-tight">CloudValley</div>
        {startup && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-foreground">{startup.name}</span>
              <StageBadge stage={startup.stage} />
            </div>
            {orgs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {orgs.map((o) => (
                  <span
                    key={o.id}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-black text-white"
                  >
                    {o.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all duration-150 ${
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
                        }`
                      }
                    >
                      <item.icon size={16} strokeWidth={1.5} />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin"
                      end
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm mt-4 transition-all duration-150 ${
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
                        }`
                      }
                    >
                      <Shield size={16} strokeWidth={1.5} />
                      <span>Admin</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isAdmin && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to="/admin/companies"
                        end
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all duration-150 ${
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
                          }`
                        }
                      >
                        <Building2 size={16} strokeWidth={1.5} />
                        <span>Empresas</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to="/admin/users"
                        end
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all duration-150 ${
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
                          }`
                        }
                      >
                        <Users size={16} strokeWidth={1.5} />
                        <span>Usuarios</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to="/admin/funds"
                        end
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all duration-150 ${
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
                          }`
                        }
                      >
                        <Landmark size={16} strokeWidth={1.5} />
                        <span>Fondos</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
