import Link from 'next/link';
import { ArrowRight, LayoutGrid, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface RecommendedTemplate {
  id: string;
  slug: string;
  title: string;
  genre: string;
  premise: string;
  plannedBooks: number;
  lengthPreset: string;
  coverUrl: string | null;
}

/**
 * "Recommended Series Templates" row (PRD §8.2). With the DFY plan each card opens the create form
 * pre-filled; without it the row is a blurred, locked teaser that points at the upgrade.
 */
export function RecommendedTemplates({
  templates,
  locked,
}: {
  templates: RecommendedTemplate[];
  locked: boolean;
}) {
  if (templates.length === 0) return null;

  return (
    <section aria-labelledby="recommended-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="recommended-title" className="flex items-center gap-2 text-lg font-semibold">
          <LayoutGrid className="size-4.5 text-violet-300" aria-hidden="true" /> Recommended Series
          Templates
        </h2>
        <Link
          href={locked ? '/upgrade/oto2' : '/templates'}
          className="inline-flex items-center gap-1 text-sm font-medium text-violet-300 hover:text-violet-200"
        >
          {locked ? 'Unlock templates' : 'View all templates'}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {templates.map((template) => {
          const params = new URLSearchParams({
            template: template.slug,
            idea: template.premise,
            genre: template.genre,
            parts: String(template.plannedBooks),
            length: template.lengthPreset,
          });
          const href = locked ? '/upgrade/oto2' : `/create-series?${params.toString()}`;

          return (
            <li key={template.id}>
              <Link
                href={href}
                className="group block overflow-hidden rounded-xl border border-border bg-card/80 transition-colors hover:border-violet-400/40"
              >
                <div className="relative aspect-[5/8] bg-muted">
                  {template.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={template.coverUrl}
                      alt={locked ? '' : `Cover of ${template.title}`}
                      loading="lazy"
                      className={cn(
                        'size-full object-contain',
                        locked && 'scale-105 blur-sm brightness-75',
                      )}
                    />
                  ) : (
                    <div className="size-full bg-gradient-to-br from-violet-600/30 via-card to-pink-600/20" />
                  )}
                  {locked ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex size-10 items-center justify-center rounded-full bg-background/70 backdrop-blur">
                        <Lock className="size-4.5" aria-hidden="true" />
                      </span>
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5 p-2.5">
                  <p className="line-clamp-1 text-sm font-semibold">{template.title}</p>
                  <Badge variant="muted" className="w-fit max-w-full truncate">
                    {template.genre}
                  </Badge>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
