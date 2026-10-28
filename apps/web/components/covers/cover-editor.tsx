'use client';

import { useEffect, useRef, useState } from 'react';
import { Layer, Image as KonvaImage, Rect, Stage, Text as KonvaText } from 'react-konva';
import type Konva from 'konva';
import { Bold, Loader2, Plus, Save, Trash2, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { toHexColor } from '@booksaga/shared';
import { saveCoverLayersAction } from '@/lib/series/cover-actions';
import { cn } from '@/lib/utils';

export interface CoverLayerData {
  kind: 'series' | 'title' | 'part' | 'author' | 'tagline';
  text: string;
  x: number;
  y: number;
  w: number;
  align: 'left' | 'center' | 'right';
  size: number;
  weight?: 'regular' | 'bold';
  color: string;
  uppercase?: boolean;
  shadow?: boolean;
  /** Letter spacing in em. */
  tracking?: number;
}

const FONT_FAMILY: Record<string, string> = {
  serif: 'BSSerif',
  sans: 'BSSans',
  display: 'BSDisplay',
};

const W = 340;
const H = 544;

/**
 * Konva cover editor (T4.6). Text layers are dragged on a preview of the artwork; Save sends the
 * normalised layer JSON to the server, which re-composes the canonical JPG/PDF.
 */
export function CoverEditor({
  coverId,
  artUrl,
  initialLayers,
  fontFamily,
  onSaved,
}: {
  coverId: string;
  artUrl: string;
  initialLayers: CoverLayerData[];
  fontFamily: 'serif' | 'sans' | 'display';
  onSaved: (jobId: string) => void;
}) {
  // Older covers stored the AI's colour *names* ("tidewater green") as layer colours. Normalise
  // them to #rrggbb so the colour picker works and Save passes validation.
  const [layers, setLayers] = useState<CoverLayerData[]>(() =>
    initialLayers.map((item) => ({ ...item, color: toHexColor(item.color, '#ffffff') })),
  );
  const [selected, setSelected] = useState(0);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);

  const family = FONT_FAMILY[fontFamily] ?? FONT_FAMILY.serif;

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = artUrl;
    img.onload = () => setImage(img);
  }, [artUrl]);

  // Wait for the @font-face files before drawing text, otherwise Konva measures the fallback.
  useEffect(() => {
    void document.fonts.load(`700 40px ${family}`);
    void document.fonts.load(`400 40px ${family}`);
  }, [family]);

  const layer = layers[selected];

  function patch(patchValue: Partial<CoverLayerData>) {
    setLayers((current) =>
      current.map((item, index) => (index === selected ? { ...item, ...patchValue } : item)),
    );
  }

  function handleDragEnd(index: number, node: Konva.Text) {
    const centerX = (node.x() + (node.width() * (node.align() === 'center' ? 1 : 1)) / 2) / W;
    const topY = node.y() / H;
    setLayers((current) =>
      current.map((item, i) =>
        i === index
          ? { ...item, x: Math.min(0.98, Math.max(0.02, centerX)), y: Math.min(0.96, Math.max(0.01, topY)) }
          : item,
      ),
    );
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const response = await saveCoverLayersAction({ coverId, layers });
    setSaving(false);
    if (!response.ok) {
      setMessage(response.error.message);
      return;
    }
    onSaved(response.data.jobId);
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="shrink-0 rounded-xl border border-border bg-muted/20 p-2">
        <Stage width={W} height={H} ref={stageRef}>
          <Layer>
            <Rect width={W} height={H} fill="#0b1023" />
            {image ? (
              <KonvaImage image={image} width={W} height={H} listening={false} />
            ) : null}
          </Layer>
          <Layer>
            {layers.map((item, index) => {
              const text = item.uppercase ? item.text.toUpperCase() : item.text;
              const fontSize = Math.round(item.size * H);
              const width = item.w * W;
              const x = (item.x - item.w / 2) * W;
              return (
                <KonvaText
                  key={item.kind + index}
                  text={text}
                  x={x}
                  y={item.y * H}
                  width={width}
                  align={item.align}
                  fontSize={fontSize}
                  fontFamily={family}
                  fontStyle={item.weight === 'bold' ? 'bold' : 'normal'}
                  letterSpacing={(item.tracking ?? 0) * fontSize}
                  fill={item.color}
                  shadowColor="rgba(0,0,0,0.7)"
                  shadowBlur={fontSize * 0.25}
                  shadowOffsetY={fontSize * 0.05}
                  draggable
                  onClick={() => setSelected(index)}
                  onTap={() => setSelected(index)}
                  onDragEnd={(event) => handleDragEnd(index, event.target as Konva.Text)}
                  stroke={index === selected ? '#8b5cf6' : undefined}
                  strokeWidth={index === selected ? 1 : 0}
                  lineHeight={1.18}
                />
              );
            })}
          </Layer>
        </Stage>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-1">
          {layers.map((item, index) => (
            <button
              key={item.kind + index}
              type="button"
              onClick={() => setSelected(index)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs',
                index === selected
                  ? 'border-primary bg-primary/20 text-violet-100'
                  : 'border-border text-muted-foreground',
              )}
            >
              {item.kind}
            </button>
          ))}
        </div>

        {layer ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="layer-text">Text</Label>
              <Input
                id="layer-text"
                value={layer.text}
                onChange={(event) => patch({ text: event.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="layer-size">Size</Label>
                <input
                  id="layer-size"
                  type="range"
                  min={0.015}
                  max={0.14}
                  step={0.002}
                  value={layer.size}
                  onChange={(event) => patch({ size: Number(event.target.value) })}
                  className="accent-violet-500"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="layer-color">Colour</Label>
                <input
                  id="layer-color"
                  type="color"
                  value={layer.color}
                  onChange={(event) => patch({ color: event.target.value })}
                  className="h-9 w-full rounded border border-input bg-transparent"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="layer-align">Align</Label>
                <Select
                  id="layer-align"
                  value={layer.align}
                  onChange={(event) =>
                    patch({ align: event.target.value as CoverLayerData['align'] })
                  }
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={layer.weight === 'bold' ? 'default' : 'secondary'}
                  onClick={() => patch({ weight: layer.weight === 'bold' ? 'regular' : 'bold' })}
                >
                  <Bold aria-hidden="true" /> Bold
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={layer.uppercase ? 'default' : 'secondary'}
                  onClick={() => patch({ uppercase: !layer.uppercase })}
                >
                  <Type aria-hidden="true" /> AA
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setLayers((current) => [
                    ...current,
                    {
                      kind: 'tagline',
                      text: 'A new series begins',
                      x: 0.5,
                      y: 0.52,
                      w: 0.7,
                      align: 'center',
                      size: 0.024,
                      color: '#f0e6d2',
                    },
                  ])
                }
              >
                <Plus aria-hidden="true" /> Add line
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={layers.length <= 1}
                onClick={() => {
                  setLayers((current) => current.filter((_, i) => i !== selected));
                  setSelected(0);
                }}
              >
                <Trash2 aria-hidden="true" /> Remove
              </Button>
            </div>
          </>
        ) : null}

        <div className="mt-auto flex items-center gap-3">
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
            Save cover
          </Button>
          {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}

/** Mirrors the worker's default layout so an older cover can still be opened in the editor. */
export function defaultCoverLayers(input: {
  seriesTitle: string;
  title: string;
  partNumber: number;
  author: string;
}): CoverLayerData[] {
  return [
    { kind: 'series', text: input.seriesTitle, x: 0.5, y: 0.04, w: 0.9, align: 'center', size: 0.021, color: '#ffffff', uppercase: true, tracking: 0.32 },
    { kind: 'part', text: `Book ${input.partNumber}`, x: 0.5, y: 0.072, w: 0.6, align: 'center', size: 0.02, color: '#f0e6d2', uppercase: true, tracking: 0.4 },
    { kind: 'title', text: input.title, x: 0.5, y: 0.11, w: 0.88, align: 'center', size: 0.082, weight: 'bold', color: '#ffffff' },
    { kind: 'author', text: input.author, x: 0.5, y: 0.915, w: 0.86, align: 'center', size: 0.03, color: '#ffffff', uppercase: true, tracking: 0.3 },
  ];
}
