'use client';

import { getDfyGenre } from '@booksaga/shared';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Lock, Sparkles } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface DfyIdea {
  id: string;
  niche: string;
  title: string;
  premise: string;
  hook: string | null;
  tier: 'lite' | 'full';
}

export interface DfyPack {
  id: string;
  title: string;
  description: string | null;
  genre: string;
  contents: { keywords?: string[]; categories?: string[]; blurbs?: string[] };
  tier: 'lite' | 'full';
}

export function DfyLibrary({
  ideas,
  packs,
  fullAccess,
}: {
  ideas: DfyIdea[];
  packs: DfyPack[];
  fullAccess: boolean;
}) {
  const router = useRouter();
  const [niche, setNiche] = useState('all');
  const [openIdea, setOpenIdea] = useState<DfyIdea | null>(null);
  const [openPack, setOpenPack] = useState<DfyPack | null>(null);

  const niches = ['all', ...Array.from(new Set(ideas.map((idea) => idea.niche)))];
  const visible = niche === 'all' ? ideas : ideas.filter((idea) => idea.niche === niche);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {niches.slice(0, 12).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setNiche(value)}
              aria-pressed={niche === value}
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                niche === value
                  ? 'border-primary bg-primary/20 text-violet-100'
                  : 'border-border text-muted-foreground',
              )}
            >
              {value === 'all' ? 'All niches' : value}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.slice(0, 60).map((idea) => {
            const locked = idea.tier === 'full' && !fullAccess;
            return (
              <Card key={idea.id}>
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {idea.niche}
                    </p>
                    <Badge variant={idea.tier === 'lite' ? 'muted' : 'success'}>{idea.tier}</Badge>
                  </div>
                  <p className="text-sm font-semibold">{idea.title}</p>
                  <p className="line-clamp-3 text-xs text-muted-foreground">{idea.premise}</p>
                  <div className="mt-auto flex gap-2 pt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setOpenIdea(idea)}
                    >
                      {locked ? <Lock aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                      Use idea
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Keyword &amp; blurb packs</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map((pack) => {
            const locked = pack.tier === 'full' && !fullAccess;
            return (
              <Card key={pack.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm">
                    {pack.title}
                    <Badge variant={pack.tier === 'lite' ? 'muted' : 'success'}>{pack.tier}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">{pack.description}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setOpenPack(pack)}
                  >
                    {locked ? <Lock aria-hidden="true" /> : <Copy aria-hidden="true" />} Open pack
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Dialog
        open={Boolean(openIdea)}
        onOpenChange={(value) => (!value ? setOpenIdea(null) : undefined)}
      >
        <DialogContent
          title={openIdea?.title ?? ''}
          description={openIdea?.niche}
          className="max-w-lg"
        >
          {openIdea ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{openIdea.premise}</p>
              {openIdea.hook ? (
                <p className="text-xs text-muted-foreground">{openIdea.hook}</p>
              ) : null}
              {openIdea.tier === 'full' && !fullAccess ? (
                <Button asChild size="sm">
                  <Link href="/upgrade/oto2">Unlock the full DFY library</Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/create-series?idea=${encodeURIComponent(openIdea.premise)}&genre=${encodeURIComponent(getDfyGenre(openIdea.niche)?.id ?? '')}`,
                    )
                  }
                >
                  <Sparkles aria-hidden="true" /> Use this idea
                </Button>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(openPack)}
        onOpenChange={(value) => (!value ? setOpenPack(null) : undefined)}
      >
        <DialogContent
          title={openPack?.title ?? ''}
          description={openPack?.genre}
          className="max-w-lg"
        >
          {openPack ? (
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Keywords</p>
                <p className="font-mono text-xs">{(openPack.contents.keywords ?? []).join(', ')}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Categories</p>
                <p className="text-xs">{(openPack.contents.categories ?? []).join(' · ')}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Blurb openers
                </p>
                <ul className="list-disc pl-4 text-xs">
                  {(openPack.contents.blurbs ?? []).map((blurb) => (
                    <li key={blurb}>{blurb}</li>
                  ))}
                </ul>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${openPack.title}\n\nKeywords: ${(openPack.contents.keywords ?? []).join(', ')}\n\nBlurbs:\n${(openPack.contents.blurbs ?? []).join('\n')}`,
                  );
                }}
              >
                <Copy aria-hidden="true" /> Copy pack
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
