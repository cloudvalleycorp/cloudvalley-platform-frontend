import { useRef, useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import { cn } from "@/lib/utils";

type Props = {
  imageUrl: string | null;
  fallback: string;
  shape?: "circle" | "square";
  size?: number;
  uploading: boolean;
  onSelect: (file: File) => void;
  hint?: string;
};

// Reusado por avatar de usuario (circle) y logo de startup (square) — el
// backend no tiene endpoint para quitar la imagen, solo subir/reemplazar,
// así que no hay botón "Quitar" acá (no hay nada real que llamar).
export function ImageUploadField({ imageUrl, fallback, shape = "circle", size = 64, uploading, onSelect, hint }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  return (
    <div className="flex items-center gap-4">
      <Avatar style={{ width: size, height: size }} className={cn(shape === "square" && "rounded-lg")}>
        <AvatarImage src={imageUrl ?? undefined} alt="" />
        <AvatarFallback className={cn(shape === "square" && "rounded-lg", "text-sm font-medium")}>{fallback}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            aria-label={shape === "square" ? "Subir logo" : "Subir foto de perfil"}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPickedFile(file);
              e.target.value = "";
            }}
          />
          <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "Subiendo…" : imageUrl ? "Cambiar" : "Subir imagen"}
          </Button>
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <ImageCropDialog
        file={pickedFile}
        shape={shape}
        onCancel={() => setPickedFile(null)}
        onConfirm={(cropped) => {
          setPickedFile(null);
          onSelect(cropped);
        }}
      />
    </div>
  );
}
