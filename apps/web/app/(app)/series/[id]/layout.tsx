import { Badge } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import { loadSeries } from '@/lib/series/load';
import { SeriesTabs } from '@/components/series/series-tabs';

export default async function SeriesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const { series } = await loadSeries(id, user);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-violet-300 uppercase">
          {series.genre} · {series.pen_name}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold">{series.title}</h1>
          <Badge variant={series.status === 'active' ? 'success' : 'muted'}>{series.status}</Badge>
          <Badge variant="muted">{series.planned_books} planned parts</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">{series.idea}</p>
      </header>

      <SeriesTabs seriesId={series.id} />

      {children}
    </div>
  );
}
