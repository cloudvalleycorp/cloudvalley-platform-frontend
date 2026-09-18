import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

const VIEWPORT = 260; // px en pantalla
const OUTPUT = 512; // px del archivo final — de sobra para avatar/logo, bien por debajo del tope de 4096px del backend

type Props = {
  file: File | null;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
  shape?: "circle" | "square";
};

// Recorte cuadrado simple (arrastrar + zoom) antes de subir — el resultado
// siempre es un cuadrado; el avatar se ve circular por el CSS de Avatar
// (rounded-full), no hace falta recortar a círculo de verdad. Sin
// dependencia nueva: un <canvas> + pointer events alcanza para esto.
export function ImageCropDialog({ file, onCancel, onConfirm, shape = "circle" }: Props) {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!file) {
      setImgEl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!file || !imgEl) return null;

  const baseScale = VIEWPORT / Math.min(imgEl.naturalWidth, imgEl.naturalHeight);
  const scale = baseScale * zoom;
  const displayW = imgEl.naturalWidth * scale;
  const displayH = imgEl.naturalHeight * scale;
  const minX = Math.min(0, VIEWPORT - displayW);
  const minY = Math.min(0, VIEWPORT - displayH);
  const clamp = (v: number, min: number) => Math.max(min, Math.min(0, v));

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({ x: clamp(dragRef.current.origX + dx, minX), y: clamp(dragRef.current.origY + dy, minY) });
  };
  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleZoomChange = (v: number[]) => {
    const nextZoom = v[0];
    const nextScale = baseScale * nextZoom;
    const nextDisplayW = imgEl.naturalWidth * nextScale;
    const nextDisplayH = imgEl.naturalHeight * nextScale;
    setZoom(nextZoom);
    setOffset((prev) => ({
      x: clamp(prev.x, Math.min(0, VIEWPORT - nextDisplayW)),
      y: clamp(prev.y, Math.min(0, VIEWPORT - nextDisplayH)),
    }));
  };

  const handleConfirm = () => {
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const outputScale = OUTPUT / VIEWPORT;
    ctx.drawImage(
      imgEl,
      0,
      0,
      imgEl.naturalWidth,
      imgEl.naturalHeight,
      offset.x * outputScale,
      offset.y * outputScale,
      displayW * outputScale,
      displayH * outputScale
    );
    const mime = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onConfirm(new File([blob], file.name, { type: mime }));
      },
      mime,
      0.92
    );
  };

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajustá tu {shape === "circle" ? "foto" : "logo"}</DialogTitle>
          <DialogDescription>Arrastrá para reencuadrar y usá el slider para acercar o alejar.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div
            ref={viewportRef}
            className="relative overflow-hidden bg-muted touch-none select-none"
            style={{ width: VIEWPORT, height: VIEWPORT, borderRadius: shape === "circle" ? "9999px" : "12px", cursor: "grab" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <img
              src={imgEl.src}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                left: offset.x,
                top: offset.y,
                width: displayW,
                height: displayH,
                maxWidth: "none",
              }}
            />
          </div>
          <div className="w-full flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Zoom</span>
            <Slider min={1} max={3} step={0.05} value={[zoom]} onValueChange={handleZoomChange} className="flex-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button onClick={handleConfirm}>Usar esta imagen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
