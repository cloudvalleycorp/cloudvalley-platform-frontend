import { useState } from "react";
import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  CONFIRM_AVATAR_UPLOAD_URL,
  CONFIRM_LOGO_UPLOAD_URL,
  REQUEST_AVATAR_UPLOAD_URL,
  REQUEST_LOGO_UPLOAD_URL,
} from "@/lib/profile";

type ImageUploadTarget = { kind: "avatar"; userId?: string } | { kind: "logo"; companyId: string };

// Mismo patrón de 2 pasos que useDocuments.ts ya usa para el Data Room
// (pedir URL firmada, PUT directo, confirmar) — el object name queda fijo
// por usuario/company del lado backend, resubir simplemente pisa la
// anterior, no hace falta borrar nada acá.
export function useImageUpload(target: ImageUploadTarget) {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File): Promise<boolean> => {
    if (!ALLOWED_IMAGE_CONTENT_TYPES.has(file.type)) {
      toast.error("Solo se aceptan imágenes PNG, JPG o WEBP");
      return false;
    }
    setUploading(true);
    try {
      const requestUrl = target.kind === "avatar" ? REQUEST_AVATAR_UPLOAD_URL : REQUEST_LOGO_UPLOAD_URL;
      const requestBody =
        target.kind === "avatar"
          ? { user_id: target.userId, content_type: file.type }
          : { company_id: target.companyId, content_type: file.type };
      const urlRes = await fetch(requestUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (await handleMembershipError(urlRes)) return false;
      if (!urlRes.ok) {
        toast.error("No se pudo iniciar la subida");
        return false;
      }
      const { upload_url } = (await urlRes.json()) as { upload_url: string; storage_path: string };

      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        toast.error("No se pudo subir la imagen");
        return false;
      }

      const confirmUrl = target.kind === "avatar" ? CONFIRM_AVATAR_UPLOAD_URL : CONFIRM_LOGO_UPLOAD_URL;
      const confirmBody = target.kind === "avatar" ? { user_id: target.userId } : { company_id: target.companyId };
      const confirmRes = await fetch(confirmUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmBody),
      });
      // 400 acá es "no es una imagen real" o excede 5MB/4096px — el backend
      // recién lo detecta en confirm, nunca en el PUT.
      if (await handleMembershipError(confirmRes)) return false;
      toast.success(target.kind === "avatar" ? "Foto de perfil actualizada" : "Logo actualizado");
      return true;
    } catch {
      toast.error("No se pudo subir la imagen");
      return false;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}
