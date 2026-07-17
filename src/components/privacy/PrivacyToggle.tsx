import { Eye, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  isPublic: boolean;
  onChange: (next: boolean) => void;
  publicLabel?: string;
  privateLabel?: string;
  size?: number;
  className?: string;
};

export function PrivacyToggle({
  isPublic,
  onChange,
  publicLabel = "Visible para tu organización",
  privateLabel = "Privado · solo vos",
  size = 14,
  className,
}: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange(!isPublic);
          }}
          className={cn(
            "inline-flex items-center justify-center p-1 rounded-md transition-all duration-150",
            isPublic
              ? "text-foreground hover:bg-surface"
              : "text-tertiary hover:text-muted-foreground hover:bg-surface",
            className
          )}
          aria-label={isPublic ? publicLabel : privateLabel}
        >
          {isPublic ? (
            <Eye size={size} strokeWidth={1.5} />
          ) : (
            <Lock size={size} strokeWidth={1.5} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {isPublic ? publicLabel : privateLabel}
      </TooltipContent>
    </Tooltip>
  );
}
