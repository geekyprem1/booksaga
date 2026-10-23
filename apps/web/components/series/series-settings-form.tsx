'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { SeriesCardActions } from '@/components/series/series-card-actions';
import { updateSeriesSettingsAction } from '@/lib/series/series-actions';
import { TONES, type SeriesSettings } from '@/lib/series/validation';

interface SeriesSettingsFormProps {
  seriesId: string;
  status: string;
  initial: {
    title: string;
    penName: string;
    tone: string;
    plannedBooks: number;
    settings: SeriesSettings;
  };
  generatedParts: number;
  maxBooks: number;
}

export function SeriesSettingsForm({
  seriesId,
  status,
  initial,
  generatedParts,
  maxBooks,
}: SeriesSettingsFormProps) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    const response = await updateSeriesSettingsAction({
      seriesId,
      title: form.title,
      penName: form.penName,
      tone: form.tone,
      plannedBooks: form.plannedBooks,
      settings: form.settings,
    });
    setSaving(false);
    if (!response.ok) {
      setMessage(response.error.message);
      return;
    }
    setMessage('Saved.');
    router.refresh();
  }

  const tones = TONES.includes(form.tone as (typeof TONES)[number])
    ? TONES
    : ([form.tone, ...TONES] as string[]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Series details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-title">Title</Label>
            <Input
              id="s-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-pen">Pen name</Label>
            <Input
              id="s-pen"
              value={form.penName}
              onChange={(e) => setForm({ ...form, penName: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-tone">Tone</Label>
            <Select
              id="s-tone"
              value={form.tone}
              onChange={(e) => setForm({ ...form, tone: e.target.value })}
            >
              {tones.map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-planned">Planned parts</Label>
            <Input
              id="s-planned"
              type="number"
              min={Math.max(1, generatedParts)}
              max={maxBooks}
              value={form.plannedBooks}
              onChange={(e) => setForm({ ...form, plannedBooks: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              {generatedParts} written · your plan allows {maxBooks}.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publishing defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-trim">Trim size</Label>
            <Select
              id="s-trim"
              value={form.settings.trim}
              onChange={(e) =>
                setForm({
                  ...form,
                  settings: { ...form.settings, trim: e.target.value as SeriesSettings['trim'] },
                })
              }
            >
              {['5x8', '5.25x8', '5.5x8.5', '6x9'].map((trim) => (
                <option key={trim} value={trim}>
                  {trim.replace('x', ' × ')} in
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-paper">Paper</Label>
            <Select
              id="s-paper"
              value={form.settings.paper}
              onChange={(e) =>
                setForm({
                  ...form,
                  settings: { ...form.settings, paper: e.target.value as SeriesSettings['paper'] },
                })
              }
            >
              <option value="white">White</option>
              <option value="cream">Cream</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-pov">Point of view</Label>
            <Select
              id="s-pov"
              value={form.settings.pov}
              onChange={(e) =>
                setForm({
                  ...form,
                  settings: { ...form.settings, pov: e.target.value as SeriesSettings['pov'] },
                })
              }
            >
              <option value="third">Third person</option>
              <option value="first">First person</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-tense">Tense</Label>
            <Select
              id="s-tense"
              value={form.settings.tense}
              onChange={(e) =>
                setForm({
                  ...form,
                  settings: { ...form.settings, tense: e.target.value as SeriesSettings['tense'] },
                })
              }
            >
              <option value="past">Past</option>
              <option value="present">Present</option>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.settings.bleed}
              onChange={(e) =>
                setForm({ ...form, settings: { ...form.settings, bleed: e.target.checked } })
              }
            />
            Print with bleed
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.settings.autoCovers}
              onChange={(e) =>
                setForm({ ...form, settings: { ...form.settings, autoCovers: e.target.checked } })
              }
            />
            <span>
              Auto-generate covers
              <span className="block text-xs text-muted-foreground">
                Cover generation arrives with M4; the setting is saved now.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          Save settings
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <SeriesCardActions seriesId={seriesId} status={status} inTrash={false} />
          <p className="text-xs text-muted-foreground">
            Delete moves the series to Trash; you can restore it for 30 days.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
