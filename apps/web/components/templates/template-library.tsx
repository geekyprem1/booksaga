'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Search, Sparkles } from 'lucide-react';
import { Badge, Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface TemplateCard {
  id: string;
  slug: string;
  category: string;
  title: string;
  premise: string;
  genre: string;
  tone: string | null;
  lengthPreset: string;
  plannedBooks: number;
  keywords: string[];
  coverUrl: string | null;
  tier: 'lite' | 'full';
}

const CATEGORY_LABELS: Record<string, string> = {
  fantasy: 'Fantasy',
  'dark-fantasy': 'Dark Fantasy',
  romance: 'Romance',
  thriller: 'Thriller',
  mystery: 'Mystery',
  'science-fiction': 'Sci-Fi',
  'post-apocalyptic': 'Post-Apocalyptic',
  horror: 'Horror',
  'cozy-mystery': 'Cozy Mystery',
  'historical-fiction': 'Historical',
  'young-adult': 'Young Adult',
  'literary-fiction': 'Literary',
};

export function TemplateLibrary({
  templates,
  fullAccess,
}: {
  templates: TemplateCard[];
  fullAccess: boolean;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<TemplateCard | null>(null);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(templates.map((template) => template.category)))],
    [templates],
  );

  const visible = templates.filter((template) => {
    if (category !== 'all' && template.category !== category) return false;
    if (!query.trim()) return true;
    const haystack = `${template.title} ${template.premise} ${template.genre} ${template.keywords.join(' ')}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates, genres, keywords…"
            className="pl-9"
            aria-label="Search templates"
          />
        </div>
        <Badge variant="muted">{visible.length} templates</Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setCategory(value)}
            aria-pressed={category === value}
            className={cn(
              'rounded-full border px-3 py-1 text-xs',
              category === value
                ? 'border-primary bg-primary/20 text-violet-100'
                : 'border-border text-muted-foreground',
            )}
          >
            {value === 'all' ? 'All' : (CATEGORY_LABELS[value] ?? value)}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((template) => {
          const locked = template.tier === 'full' && !fullAccess;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => setOpen(template)}
              className="group text-left"
            >
              <Card className="h-full overflow-hidden transition group-hover:border-primary/60">
                <div className="relative aspect-[2/3] w-full bg-muted/40">
                  {template.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={template.coverUrl} alt="" className="size-full object-cover" />
                  ) : null}
                  {locked ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <Lock className="size-5 text-white/80" aria-hidden="true" />
                    </span>
                  ) : null}
                  <span className="absolute left-2 top-2">
                    <Badge variant={template.tier === 'lite' ? 'muted' : 'success'}>
                      {template.tier === 'lite' ? 'Lite' : 'Full'}
                    </Badge>
                  </span>
                </div>
                <CardContent className="p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {CATEGORY_LABELS[template.category] ?? template.category}
                  </p>
                  <p className="truncate text-sm font-semibold">{template.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{template.premise}</p>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      <Dialog open={Boolean(open)} onOpenChange={(value) => (!value ? setOpen(null) : undefined)}>
        <DialogContent
          title={open?.title ?? ''}
          description={`${open?.genre ?? ''} · ${open?.plannedBooks ?? 0} parts · ${open?.lengthPreset ?? ''}`}
          className="max-w-lg"
        >
          {open ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{open.premise}</p>
              <div className="flex flex-wrap gap-1">
                {open.keywords.map((keyword) => (
                  <Badge key={keyword} variant="muted">
                    {keyword}
                  </Badge>
                ))}
              </div>
              {open.tier === 'full' && !fullAccess ? (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">Full templates need the Unlimited upgrade.</p>
                  <Button asChild size="sm" className="mt-2">
                    <Link href="/upgrade/oto1">Unlock templates</Link>
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams({
                      template: open.slug,
                      idea: open.premise,
                      genre: open.genre,
                      parts: String(open.plannedBooks),
                      length: open.lengthPreset,
                    });
                    router.push(`/create-series?${params.toString()}`);
                  }}
                >
                  <Sparkles aria-hidden="true" /> Use this template
                </Button>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
