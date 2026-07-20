import { Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Member = { user_id: string; full_name: string | null; email: string };

export function MembersCell({ members }: { members: Member[] }) {
  if (members.length === 0) {
    return <span className="text-xs text-muted-foreground">Sin miembros</span>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border border-border hover:bg-surface transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Users size={12} strokeWidth={1.5} />
          {members.length} {members.length === 1 ? "miembro" : "miembros"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="space-y-2.5 max-h-72 overflow-y-auto">
          {members.map((m) => (
            <div key={m.user_id} className="text-sm">
              <div className="font-medium text-foreground truncate">{m.full_name || m.email}</div>
              {m.full_name && (
                <div className="text-xs text-muted-foreground truncate">{m.email}</div>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
