'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, History, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import type { Bible, Character, Location } from '@booksaga/shared';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import {
  listBibleVersionsAction,
  restoreBibleVersionAction,
  saveBibleAction,
  type BibleVersionRow,
} from '@/lib/series/bible-actions';
import { cn } from '@/lib/utils';

type Tab = 'characters' | 'locations' | 'world' | 'timeline' | 'threads' | 'glossary' | 'style' | 'history';

const TABS: { key: Tab; label: string }[] = [
  { key: 'characters', label: 'Characters' },
  { key: 'locations', label: 'Locations' },
  { key: 'world', label: 'World rules' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'threads', label: 'Open threads' },
  { key: 'glossary', label: 'Glossary' },
  { key: 'style', label: 'Style guide' },
  { key: 'history', label: 'History' },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function BibleEditor({
  seriesId,
  initial,
  versions: initialVersions,
}: {
  seriesId: string;
  initial: Bible;
  versions: BibleVersionRow[];
}) {
  const router = useRouter();
  const [data, setData] = useState<Bible>(initial);
  const [tab, setTab] = useState<Tab>('characters');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [versions, setVersions] = useState(initialVersions);
  const [restoring, setRestoring] = useState<string | null>(null);

  const dirty = JSON.stringify(data) !== JSON.stringify(initial);

  function patchCharacter(key: string, patch: Partial<Character>) {
    setData((current) => ({
      ...current,
      characters: {
        ...current.characters,
        [key]: { ...current.characters[key], ...patch, source: 'user' } as Character,
      },
    }));
  }

  function addCharacter() {
    const name = prompt('Character name');
    if (!name?.trim()) return;
    const key = slugify(name);
    setData((current) => ({
      ...current,
      characters: {
        ...current.characters,
        [key]: {
          name: name.trim(),
          role: 'supporting',
          relationships: [],
          secrets: [],
          status: 'active',
          source: 'user',
        } as Character,
      },
    }));
    setTab('characters');
  }

  function removeCharacter(key: string) {
    if (!confirm('Remove this character from the bible?')) return;
    setData((current) => {
      const characters = { ...current.characters };
      delete characters[key];
      return { ...current, characters };
    });
  }

  function patchLocation(key: string, patch: Partial<Location>) {
    setData((current) => ({
      ...current,
      locations: {
        ...current.locations,
        [key]: { ...current.locations[key], ...patch, source: 'user' } as Location,
      },
    }));
  }

  function addLocation() {
    const name = prompt('Location name');
    if (!name?.trim()) return;
    const key = slugify(name);
    setData((current) => ({
      ...current,
      locations: {
        ...current.locations,
        [key]: { name: name.trim(), description: '', source: 'user' } as Location,
      },
    }));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const response = await saveBibleAction({ seriesId, data });
    setSaving(false);
    if (!response.ok) {
      setMessage(response.error.message);
      return;
    }
    setMessage(`Saved as v${response.data.version}.`);
    const list = await listBibleVersionsAction({ seriesId });
    if (list.ok) setVersions(list.data);
    router.refresh();
  }

  async function restore(versionId: string) {
    if (!confirm('Restore this version? The current bible is kept in history.')) return;
    setRestoring(versionId);
    const response = await restoreBibleVersionAction({ versionId });
    setRestoring(null);
    if (!response.ok) {
      setMessage(response.error.message);
      return;
    }
    router.refresh();
    window.location.reload();
  }

  const conflicts = data.conflicts ?? [];

  return (
    <div className="flex flex-col gap-4">
      {conflicts.length > 0 ? (
        <div className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-amber-200">
            <AlertTriangle className="size-4" aria-hidden="true" /> {conflicts.length} conflict
            {conflicts.length > 1 ? 's' : ''} from the AI merge
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-amber-100/80">
            {conflicts.slice(-5).map((conflict, index) => (
              <li key={index}>{conflict}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Bible sections">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              aria-current={tab === item.key ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                tab === item.key
                  ? 'border-primary bg-primary/20 text-violet-100'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
          <Button asChild size="sm" variant="secondary">
            <a href={`/api/series/${seriesId}/bible/export`} download>
              Export DOCX
            </a>
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {dirty ? 'Save changes' : 'Saved'}
          </Button>
        </div>
      </div>

      {tab === 'characters' ? (
        <section className="grid gap-3 lg:grid-cols-2">
          {Object.entries(data.characters).map(([key, character]) => (
            <div key={key} className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Name of ${key}`}
                    value={character.name}
                    onChange={(e) => patchCharacter(key, { name: e.target.value })}
                    className="h-8 font-semibold"
                  />
                  {character.source === 'user' ? <Badge variant="warning">locked</Badge> : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${character.name}`}
                  onClick={() => removeCharacter(key)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Role" value={character.role} onChange={(v) => patchCharacter(key, { role: v })} />
                <Field label="Age" value={character.age ?? ''} onChange={(v) => patchCharacter(key, { age: v })} />
              </div>
              <Area
                label="Appearance"
                value={character.appearance ?? ''}
                onChange={(v) => patchCharacter(key, { appearance: v })}
              />
              <Area
                label="Personality"
                value={character.personality ?? ''}
                onChange={(v) => patchCharacter(key, { personality: v })}
              />
              <Area
                label="Backstory"
                value={character.backstory ?? ''}
                onChange={(v) => patchCharacter(key, { backstory: v })}
              />
              <Field label="Status" value={character.status} onChange={(v) => patchCharacter(key, { status: v })} />
            </div>
          ))}

          <Button type="button" variant="secondary" onClick={addCharacter} className="h-full min-h-24">
            <Plus aria-hidden="true" /> Add character
          </Button>
        </section>
      ) : null}

      {tab === 'locations' ? (
        <section className="grid gap-3 lg:grid-cols-2">
          {Object.entries(data.locations).map(([key, location]) => (
            <div key={key} className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 flex items-center gap-2">
                <Input
                  aria-label={`Name of ${key}`}
                  value={location.name}
                  onChange={(e) => patchLocation(key, { name: e.target.value })}
                  className="h-8 font-semibold"
                />
                {location.source === 'user' ? <Badge variant="warning">locked</Badge> : null}
              </div>
              <Area
                label="Description"
                value={location.description}
                onChange={(v) => patchLocation(key, { description: v })}
              />
              <Field
                label="Significance"
                value={location.significance ?? ''}
                onChange={(v) => patchLocation(key, { significance: v })}
              />
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={addLocation} className="h-full min-h-24">
            <Plus aria-hidden="true" /> Add location
          </Button>
        </section>
      ) : null}

      {tab === 'world' ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <Area
            label="Setting"
            value={data.world.setting}
            onChange={(v) => setData((c) => ({ ...c, world: { ...c.world, setting: v } }))}
          />
          <div className="flex flex-col gap-2">
            <Label>Rules</Label>
            {data.world.rules.map((rule, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={rule}
                  aria-label={`Rule ${index + 1}`}
                  onChange={(e) =>
                    setData((c) => {
                      const rules = [...c.world.rules];
                      rules[index] = e.target.value;
                      return { ...c, world: { ...c.world, rules } };
                    })
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove rule ${index + 1}`}
                  onClick={() =>
                    setData((c) => ({
                      ...c,
                      world: { ...c.world, rules: c.world.rules.filter((_, i) => i !== index) },
                    }))
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                setData((c) => ({ ...c, world: { ...c.world, rules: [...c.world.rules, ''] } }))
              }
            >
              <Plus aria-hidden="true" /> Add rule
            </Button>
          </div>
        </section>
      ) : null}

      {tab === 'timeline' ? (
        <section className="rounded-xl border border-border bg-card p-4">
          {data.timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Timeline events appear here as chapters are written.
            </p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {data.timeline.map((event, index) => (
                <li key={index} className="flex gap-3">
                  <Badge variant="muted">Book {event.book}</Badge>
                  <span>{event.event}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {tab === 'threads' ? (
        <section className="flex flex-col gap-2">
          {data.threads.map((thread, index) => (
            <div key={index} className="rounded-xl border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={`Thread ${index + 1} label`}
                  value={thread.label}
                  onChange={(e) =>
                    setData((c) => {
                      const threads = [...c.threads];
                      threads[index] = { ...thread, label: e.target.value, source: 'user' };
                      return { ...c, threads };
                    })
                  }
                  className="h-8 flex-1"
                />
                <Select
                  aria-label={`Thread ${index + 1} status`}
                  value={thread.status}
                  className="h-8 w-32"
                  onChange={(e) =>
                    setData((c) => {
                      const threads = [...c.threads];
                      threads[index] = {
                        ...thread,
                        status: e.target.value as 'open' | 'resolved',
                        source: 'user',
                      };
                      return { ...c, threads };
                    })
                  }
                >
                  <option value="open">open</option>
                  <option value="resolved">resolved</option>
                </Select>
              </div>
              <Area
                label="Detail"
                value={thread.detail}
                onChange={(v) =>
                  setData((c) => {
                    const threads = [...c.threads];
                    threads[index] = { ...thread, detail: v, source: 'user' };
                    return { ...c, threads };
                  })
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setData((c) => ({
                ...c,
                threads: [
                  ...c.threads,
                  { label: 'New thread', status: 'open', detail: '', source: 'user' },
                ],
              }))
            }
          >
            <Plus aria-hidden="true" /> Add thread
          </Button>
        </section>
      ) : null}

      {tab === 'glossary' ? (
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          {Object.entries(data.glossary).map(([term, definition]) => (
            <div key={term} className="flex gap-2">
              <Input value={term} readOnly aria-label={`Term ${term}`} className="w-48" />
              <Input
                value={definition}
                aria-label={`Definition of ${term}`}
                onChange={(e) => setData((c) => ({ ...c, glossary: { ...c.glossary, [term]: e.target.value } }))}
              />
            </div>
          ))}
          {Object.keys(data.glossary).length === 0 ? (
            <p className="text-sm text-muted-foreground">No glossary terms yet.</p>
          ) : null}
        </section>
      ) : null}

      {tab === 'style' ? (
        <section className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <Field
            label="Point of view"
            value={data.style.pov}
            onChange={(v) => setData((c) => ({ ...c, style: { ...c.style, pov: v } }))}
          />
          <Field
            label="Tense"
            value={data.style.tense}
            onChange={(v) => setData((c) => ({ ...c, style: { ...c.style, tense: v } }))}
          />
          <div className="sm:col-span-2">
            <Area
              label="Voice"
              value={data.style.voice}
              onChange={(v) => setData((c) => ({ ...c, style: { ...c.style, voice: v } }))}
            />
          </div>
        </section>
      ) : null}

      {tab === 'history' ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <History className="size-4 text-violet-300" aria-hidden="true" /> Version history
          </p>
          <ul className="flex flex-col divide-y divide-border/60">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-medium">
                    v{version.version}{' '}
                    <span className="text-xs text-muted-foreground">({version.source})</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(version.createdAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                    {version.added || version.updated
                      ? ` · +${version.added} new, ${version.updated} updated`
                      : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={restoring === version.id}
                  onClick={() => restore(version.id)}
                >
                  {restoring === version.id ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : null}
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8" />
    </div>
  );
}

function Area({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full resize-y rounded-lg border border-input bg-background/60 p-2 text-xs"
      />
    </div>
  );
}
