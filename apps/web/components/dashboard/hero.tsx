import Image from 'next/image';
import Link from 'next/link';
import { LayoutGrid, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Dashboard hero (PRD §8.2): welcome line, headline, two CTAs over the fantasy artwork.
 * The artwork is a static asset (`public/hero/dashboard.webp`); the left side of the picture is
 * dark and empty on purpose so the text stays readable.
 */
export function DashboardHero({
  firstName,
  summary,
}: {
  firstName: string;
  summary: string;
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-white/10 bg-card">
      <Image
        src="/hero/dashboard.webp"
        alt=""
        fill
        sizes="(min-width: 1024px) 1000px, 100vw"
        loading="eager"
        className="-z-20 object-cover object-right"
      />
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/75 to-transparent md:via-background/55"
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-background/60 to-transparent"
        aria-hidden="true"
      />

      <div className="flex min-h-72 max-w-2xl flex-col justify-center gap-3 p-6 sm:p-8 md:min-h-80 md:p-10">
        <p className="text-xs font-semibold tracking-[0.2em] text-violet-300 uppercase">
          Welcome back, {firstName}
        </p>
        <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight md:text-5xl">
          Turn your ideas into
          <span className="text-brand-gradient block">bestselling book series</span>
        </h1>
        <p className="max-w-lg text-sm text-foreground/80 md:text-base">{summary}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/create-series">
              <Plus aria-hidden="true" /> Create New Series
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="border-white/15 bg-white/5 backdrop-blur hover:bg-white/10"
          >
            <Link href="/templates">
              <LayoutGrid aria-hidden="true" /> Browse Series Templates
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
