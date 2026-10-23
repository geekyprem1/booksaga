import { notFound } from 'next/navigation';
import { Hammer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import { loadSeries } from '@/lib/series/load';

const TABS: Record<string, { title: string; milestone: string; detail: string }> = {
  covers: {
    title: 'Covers',
    milestone: 'M4',
    detail: 'Matching covers for every part, a Konva editor and the paperback full-wrap PDF.',
  },
  exports: {
    title: 'Exports',
    milestone: 'M5',
    detail: 'EPUB3, print-ready PDF, DOCX, covers and metadata, plus the KDP preview.',
  },
  'box-set': {
    title: 'Box Set',
    milestone: 'M6',
    detail: 'Bundle the series into one EPUB with a nested table of contents and a box set cover.',
  },
  audiobook: {
    title: 'Audiobook',
    milestone: 'M6',
    detail: 'ACX-ready audio per chapter, generated with a curated voice and loudness normalisation.',
  },
};

export default async function SeriesTabPage({
  params,
}: {
  params: Promise<{ id: string; tab: string }>;
}) {
  const { id, tab } = await params;
  const info = TABS[tab];
  if (!info) notFound();

  const user = await requireUser();
  await loadSeries(id, user);

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <Hammer className="size-7 text-violet-300" aria-hidden="true" />
        <p className="text-lg font-semibold">{info.title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{info.detail}</p>
        <p className="text-xs text-muted-foreground">Arriving in {info.milestone}.</p>
      </CardContent>
    </Card>
  );
}
