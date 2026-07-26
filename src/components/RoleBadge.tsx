import { Badge } from "@/components/ui/badge";

export type UserRole = "admin" | "user" | "investor";

const ROLE_STYLES: Record<UserRole, string> = {
  admin: "border-transparent bg-purple-100 text-purple-800 hover:bg-purple-100",
  user: "border-transparent bg-blue-100 text-blue-800 hover:bg-blue-100",
  investor: "border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100",
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  user: "Usuario",
  investor: "Inversor",
};

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge className={ROLE_STYLES[role]}>{ROLE_LABELS[role]}</Badge>;
}
