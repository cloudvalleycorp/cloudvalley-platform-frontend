import { API_BASE_URL } from "@/lib/apiConfig";

export const REQUEST_AVATAR_UPLOAD_URL = `${API_BASE_URL}/request-avatar-upload-url`;
export const CONFIRM_AVATAR_UPLOAD_URL = `${API_BASE_URL}/confirm-avatar-upload`;
export const REQUEST_LOGO_UPLOAD_URL = `${API_BASE_URL}/request-logo-upload-url`;
export const CONFIRM_LOGO_UPLOAD_URL = `${API_BASE_URL}/confirm-logo-upload`;

// Únicos content-type que el backend acepta para avatar/logo (confirmado
// 2026-09-11) — validar client-side antes de gastar el request-upload-url.
export const ALLOWED_IMAGE_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isAllowedImageType(type: string): boolean {
  return ALLOWED_IMAGE_CONTENT_TYPES.has(type);
}
