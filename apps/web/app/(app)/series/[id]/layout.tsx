import Image from 'next/image';
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
      <section
        aria-label="Series overview"
        className="relative isolate min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-card"
      >
        <Image
          src="/hero/dashboard.webp"
          alt=""
          fill
          sizes="(min-width: 1024px) calc(100vw - 304px), 100vw"
          loading="eager"
          className="-z-20 object-cover object-[right_65%]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/85 to-background/20"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-t from-background/80 via-transparent to-transparent"
        />
        <header className="flex min-h-60 flex-col justify-center gap-3 p-5 sm:p-8">
          <p className="text-xs font-semibold tracking-widest text-violet-200 uppercase">
            {series.genre} · {series.pen_name}
          </p>
          <h1 className="max-w-4xl text-3xl leading-tight font-extrabold [overflow-wrap:anywhere] sm:text-4xl">
            {series.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={series.status === 'active' ? 'success' : 'muted'}>{series.status}</Badge>
            <Badge variant="muted">{series.planned_books} planned parts</Badge>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-200">{series.idea}</p>
        </header>
        <div className="border-t border-white/10 bg-background/75 px-2 backdrop-blur-sm sm:px-5">
          <SeriesTabs seriesId={series.id} />
        </div>
      </section>

      {children}
    </div>
  );
}
