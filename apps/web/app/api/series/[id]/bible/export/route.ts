import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import { createClient } from '@/lib/supabase/server';
import { getAdminDb } from '@/lib/supabase/admin';

/** "Export Bible" (T3.4): a DOCX the author can keep as their own series reference. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const db = getAdminDb();
  const { data: series } = await db
    .from('series')
    .select('id, user_id, title, genre, pen_name, idea')
    .eq('id', id)
    .maybeSingle();
  if (!series || series.user_id !== user.id) return new Response('Not found', { status: 404 });

  const { data: bibleRow } = await db
    .from('series_bible')
    .select('data, version')
    .eq('series_id', id)
    .maybeSingle();

  const bible = (bibleRow?.data ?? {}) as {
    characters?: Record<
      string,
      {
        name?: string;
        role?: string;
        age?: string;
        appearance?: string;
        personality?: string;
        backstory?: string;
        status?: string;
      }
    >;
    locations?: Record<string, { name?: string; description?: string; significance?: string }>;
    world?: { setting?: string; rules?: string[] };
    timeline?: { book: number; event: string }[];
    threads?: { label: string; status: string; detail: string }[];
    glossary?: Record<string, string>;
    style?: { pov?: string; tense?: string; voice?: string };
  };

  const heading = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1) =>
    new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });

  const label = (text: string, value?: string) =>
    new Paragraph({
      children: [
        new TextRun({ text: `${text}: `, bold: true }),
        new TextRun(value?.trim() || '—'),
      ],
      spacing: { after: 60 },
    });

  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: series.title, bold: true, size: 40 })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${series.genre} · ${series.pen_name} · Bible v${bibleRow?.version ?? 1}`,
          italics: true,
        }),
      ],
      spacing: { after: 240 },
    }),
    new Paragraph({ text: series.idea, spacing: { after: 240 } }),

    heading('Characters'),
    ...Object.values(bible.characters ?? {}).flatMap((character) => [
      new Paragraph({
        children: [new TextRun({ text: character.name ?? 'Unnamed', bold: true, size: 26 })],
        spacing: { before: 180, after: 60 },
      }),
      label('Role', character.role),
      label('Age', character.age),
      label('Status', character.status),
      label('Appearance', character.appearance),
      label('Personality', character.personality),
      label('Backstory', character.backstory),
    ]),

    heading('Locations'),
    ...Object.values(bible.locations ?? {}).flatMap((location) => [
      new Paragraph({
        children: [new TextRun({ text: location.name ?? 'Unnamed', bold: true, size: 26 })],
        spacing: { before: 180, after: 60 },
      }),
      label('Description', location.description),
      label('Significance', location.significance),
    ]),

    heading('World'),
    label('Setting', bible.world?.setting),
    ...(bible.world?.rules ?? []).map(
      (rule) => new Paragraph({ text: `• ${rule}`, bullet: { level: 0 } }),
    ),

    heading('Timeline'),
    ...(bible.timeline ?? []).map(
      (event) => new Paragraph({ text: `Book ${event.book}: ${event.event}` }),
    ),

    heading('Open threads'),
    ...(bible.threads ?? []).map(
      (thread) => new Paragraph({ text: `[${thread.status}] ${thread.label} — ${thread.detail}` }),
    ),

    heading('Glossary'),
    ...Object.entries(bible.glossary ?? {}).map(
      ([term, definition]) => new Paragraph({ text: `${term}: ${definition}` }),
    ),

    heading('Style guide'),
    label('Point of view', bible.style?.pov),
    label('Tense', bible.style?.tense),
    label('Voice', bible.style?.voice),
  ];

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);

  const filename = `${series.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-bible.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
