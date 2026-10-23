'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Konva from 'konva';
import { Circle, Image as KonvaImage, Layer as KonvaLayer, Rect, Stage, Text } from 'react-konva';
import {
  Crop,
  Download,
  ImageIcon,
  Loader2,
  Plus,
  Square,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { uploadImageAction } from '@/lib/covers/image-actions';
import { cn } from '@/lib/utils';

export interface EditorImage {
  id: string;
  url: string;
}

interface EditorLayer {
  id: string;
  kind: 'text' | 'rect' | 'ellipse';
  text?: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

const STAGE_WIDTH = 560;

/**
 * Standalone image editor (T4.9): crop, brightness/contrast, text and shapes over any image, with
 * a client-side PNG/JPG export.
 */
export function ImageEditor({ images }: { images: EditorImage[] }) {
  const router = useRouter();
  const stageRef = useRef<Konva.Stage | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imageNodeRef = useRef<Konva.Image | null>(null);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(images[0]?.url ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);

  const [crop, setCrop] = useState({ left: 0, top: 0, right: 0, bottom: 0 });

  const [layers, setLayers] = useState<EditorLayer[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const ratio = image ? image.height / image.width : 1.5;
  const stageHeight = Math.round(STAGE_WIDTH * ratio);

  useEffect(() => {
    if (!imageUrl) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => setImage(img);
  }, [imageUrl]);

  // Konva filters need the node cached whenever the filter values change.
  useEffect(() => {
    const node = imageNodeRef.current;
    if (!node) return;
    if (brightness !== 0 || contrast !== 0) {
      node.cache();
    } else {
      node.clearCache();
    }
    node.getLayer()?.batchDraw();
  }, [brightness, contrast, image]);

  const cropX = image ? (crop.left / 100) * image.width : 0;
  const cropY = image ? (crop.top / 100) * image.height : 0;
  const cropW = image ? image.width * (1 - (crop.left + crop.right) / 100) : 0;
  const cropH = image ? image.height * (1 - (crop.top + crop.bottom) / 100) : 0;

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    const response = await uploadImageAction(formData);
    setUploading(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    router.refresh();
    // The signed URL arrives with the refreshed props; use a local object URL for instant feedback.
    setImageUrl(URL.createObjectURL(file));
  }

  function addLayer(kind: EditorLayer['kind']) {
    const layer: EditorLayer = {
      id: `${kind}-${Date.now()}`,
      kind,
      text: kind === 'text' ? 'Your text' : undefined,
      x: STAGE_WIDTH / 2,
      y: stageHeight / 2,
      size: kind === 'text' ? 36 : 140,
      color: '#ffffff',
    };
    setLayers((current) => [...current, layer]);
    setSelected(layer.id);
  }

  function patch(id: string, value: Partial<EditorLayer>) {
    setLayers((current) => current.map((l) => (l.id === id ? { ...l, ...value } : l)));
  }

  function download(format: 'png' | 'jpeg') {
    const stage = stageRef.current;
    if (!stage) return;
    const uri = stage.toDataURL({ pixelRatio: 2, mimeType: `image/${format}`, quality: 0.92 });
    const link = document.createElement('a');
    link.download = `booksaga-image.${format === 'png' ? 'png' : 'jpg'}`;
    link.href = uri;
    link.click();
  }

  const layer = layers.find((l) => l.id === selected) ?? null;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-border bg-muted/20 p-2">
          {image ? (
            <Stage width={STAGE_WIDTH} height={stageHeight} ref={stageRef}>
              <KonvaLayer>
                <Rect width={STAGE_WIDTH} height={stageHeight} fill="#0b1023" />
                <KonvaImage
                  ref={imageNodeRef}
                  image={image}
                  width={STAGE_WIDTH}
                  height={stageHeight}
                  crop={{ x: cropX, y: cropY, width: Math.max(cropW, 1), height: Math.max(cropH, 1) }}
                  filters={[Konva.Filters.Brighten, Konva.Filters.Contrast]}
                  brightness={brightness}
                  contrast={contrast}
                  listening={false}
                />
              </KonvaLayer>
              <KonvaLayer>
                {layers.map((item) =>
                  item.kind === 'text' ? (
                    <Text
                      key={item.id}
                      text={item.text ?? ''}
                      x={item.x}
                      y={item.y}
                      fontSize={item.size}
                      fill={item.color}
                      draggable
                      onClick={() => setSelected(item.id)}
                      onTap={() => setSelected(item.id)}
                      onDragEnd={(event) =>
                        patch(item.id, { x: event.target.x(), y: event.target.y() })
                      }
                      stroke={selected === item.id ? '#8b5cf6' : undefined}
                      strokeWidth={selected === item.id ? 1 : 0}
                    />
                  ) : item.kind === 'rect' ? (
                    <Rect
                      key={item.id}
                      x={item.x}
                      y={item.y}
                      width={item.size}
                      height={item.size * 0.62}
                      fill={item.color}
                      opacity={0.85}
                      draggable
                      onClick={() => setSelected(item.id)}
                      onTap={() => setSelected(item.id)}
                      onDragEnd={(event) =>
                        patch(item.id, { x: event.target.x(), y: event.target.y() })
                      }
                      stroke={selected === item.id ? '#8b5cf6' : undefined}
                    />
                  ) : (
                    <Circle
                      key={item.id}
                      x={item.x}
                      y={item.y}
                      radius={item.size / 2}
                      fill={item.color}
                      opacity={0.85}
                      draggable
                      onClick={() => setSelected(item.id)}
                      onTap={() => setSelected(item.id)}
                      onDragEnd={(event) =>
                        patch(item.id, { x: event.target.x(), y: event.target.y() })
                      }
                      stroke={selected === item.id ? '#8b5cf6' : undefined}
                    />
                  ),
                )}
              </KonvaLayer>
            </Stage>
          ) : (
            <div className="flex h-72 w-[560px] max-w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageIcon className="size-8" aria-hidden="true" />
              <p className="text-sm">Choose an image to start editing.</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            Upload
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = '';
            }}
          />
          <Button type="button" size="sm" variant="secondary" onClick={() => addLayer('text')}>
            <Type aria-hidden="true" /> Text
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => addLayer('rect')}>
            <Square aria-hidden="true" /> Rectangle
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => addLayer('ellipse')}>
            <Plus aria-hidden="true" /> Circle
          </Button>
          <div className="ml-auto flex gap-2">
            <Button type="button" size="sm" onClick={() => download('png')} disabled={!image}>
              <Download aria-hidden="true" /> PNG
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => download('jpeg')} disabled={!image}>
              <Download aria-hidden="true" /> JPG
            </Button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-rose-200">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Adjust</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Brightness {brightness.toFixed(2)}</Label>
              <input
                type="range"
                min={-0.5}
                max={0.5}
                step={0.02}
                value={brightness}
                onChange={(event) => setBrightness(Number(event.target.value))}
                className="accent-violet-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Contrast {contrast}</Label>
              <input
                type="range"
                min={-60}
                max={60}
                step={1}
                value={contrast}
                onChange={(event) => setContrast(Number(event.target.value))}
                className="accent-violet-500"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Crop className="size-3.5" aria-hidden="true" /> Crop (%)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {(['left', 'top', 'right', 'bottom'] as const).map((side) => (
              <div key={side} className="flex flex-col gap-1">
                <Label className="text-[11px] capitalize">{side}</Label>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={crop[side]}
                  onChange={(event) =>
                    setCrop((current) => ({ ...current, [side]: Number(event.target.value) }))
                  }
                  className="accent-violet-500"
                  aria-label={`Crop ${side}`}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Layers</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              {layers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No layers yet.</p>
              ) : (
                layers.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item.id)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs capitalize',
                      item.id === selected
                        ? 'border-primary bg-primary/20 text-violet-100'
                        : 'border-border text-muted-foreground',
                    )}
                  >
                    {item.kind}
                  </button>
                ))
              )}
            </div>

            {layer ? (
              <>
                {layer.kind === 'text' ? (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Text</Label>
                    <Input
                      value={layer.text ?? ''}
                      onChange={(event) => patch(layer.id, { text: event.target.value })}
                      className="h-8"
                    />
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Size</Label>
                    <input
                      type="range"
                      min={12}
                      max={260}
                      value={layer.size}
                      onChange={(event) => patch(layer.id, { size: Number(event.target.value) })}
                      className="accent-violet-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Colour</Label>
                    <input
                      type="color"
                      value={layer.color}
                      onChange={(event) => patch(layer.id, { color: event.target.value })}
                      className="h-8 w-full rounded border border-input bg-transparent"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setLayers((current) => current.filter((l) => l.id !== layer.id));
                    setSelected(null);
                  }}
                >
                  <Trash2 aria-hidden="true" /> Remove layer
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Library</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {images.length === 0 ? (
              <p className="text-xs text-muted-foreground">Upload an image to reuse it here.</p>
            ) : (
              images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => image.url && setImageUrl(image.url)}
                  className="h-14 w-10 overflow-hidden rounded border border-border hover:border-primary"
                >
                  {image.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.url} alt="" className="size-full object-cover" />
                  ) : null}
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export type { EditorLayer };
