import Link from 'next/link';
import { ArrowRight, ImageIcon, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface PickerSeries {
  id: string;
  title: string;
  genre: string;
  parts: number;
  coverUrl: string | null;
  subtitle: string;
}

/**
 * Landing page for the series-scoped studios (Cover Studio, Audiobooks). Those features live under
 * a series, so the nav entry picks the series first.
 */
export function SeriesPicker({
  series,
  actionLabel,
  hrefFor,
}: {
  series: PickerSeries[];
  actionLabel: string;
  hrefFor: (id: string) => string;
}) {
  if (series.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <ImageIcon className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-semibold">No series yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create a series first — this studio works on the parts inside one.
          </p>
          <Button asChild>
            <Link href="/create-series">
              <Plus aria-hidden="true" /> Create a series
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {series.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="h-24 w-16 shrink-0 overflow-hidden rounded border border-border bg-muted/40">
              {item.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.coverUrl} alt="" className="size-full object-cover" />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {item.genre}
              </p>
              <p className="truncate text-sm font-semibold">{item.title}</p>
              <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
              <Button asChild size="sm" variant="secondary" className="mt-1 self-start">
                <Link href={hrefFor(item.id)}>
                  {actionLabel} <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
