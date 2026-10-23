import Link from 'next/link';
import { AlertTriangle, BookOpen, CheckCircle2, FileText, Link2, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/card';

export const metadata = { title: 'KDP Upload Guide' };

const STEPS = [
  {
    icon: BookOpen,
    title: '1. Publish the ebook',
    body: [
      'KDP → Create → Kindle eBook. Title and subtitle must match the metadata file exactly.',
      'Upload the EPUB from your export ZIP. KDP converts it; the previewer should show the cover, the table of contents and every chapter.',
      'Paste the description from the metadata TXT, add the 7 keywords and pick the 3 categories.',
      'Choose the 70% royalty option (requires a $2.99–$9.99 price) and set the territories.',
    ],
  },
  {
    icon: FileText,
    title: '2. Publish the paperback',
    body: [
      'KDP → Create → Paperback. Pick the same trim size the series settings use (default 6 × 9 in).',
      'Upload the print PDF as the interior. KDP’s print previewer flags margins and bleed — fix those before submitting.',
      'Upload the paperback full-wrap cover PDF once it exists; the ebook JPG is not the right file for print.',
      'Match the ISBN and the publication date to the ebook so the two editions link.',
    ],
  },
  {
    icon: Link2,
    title: '3. Link the series',
    body: [
      'On each book’s details page use “Series” and enter the exact series title plus the reading order.',
      'After every book is live, replace {{NEXT_BOOK_URL}} in the “Read Next” page with the real Amazon URL and re-upload, or leave the placeholder out until the next book is live.',
      'Link the books with a Series page in Author Central so readers can find the whole run.',
    ],
  },
  {
    icon: Upload,
    title: '4. KDP Select and AI disclosure',
    body: [
      'KDP Select (Kindle Unlimited) gives page-read income but requires 90-day exclusivity — decide per series, not per book.',
      'When KDP asks about AI-generated content, answer honestly: the manuscript was produced with AI assistance and edited by the author.',
      'Keep your export ZIP: it is the record of exactly what was uploaded.',
    ],
  },
];

export default function KdpGuidePage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">KDP Upload Guide</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Everything between “download the ZIP” and “my book is live”. Keep this open while you
            publish.
          </p>
        </div>
        <Badge variant="muted">Read once, then follow along</Badge>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {STEPS.map((step) => (
          <Card key={step.title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <step.icon className="size-4 text-violet-300" aria-hidden="true" />
                {step.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                {step.body.map((line) => (
                  <li key={line} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-400" aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-300" aria-hidden="true" />
            Common rejections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Cover text too close to the edge</strong> — keep
              at least 0.125&quot; of safe margin on the ebook cover and 0.25&quot; on print.
            </li>
            <li>
              <strong className="text-foreground">Margins too small for the page count</strong> —
              the previewer shows the required gutter; re-export with the right trim instead of
              shrinking the text.
            </li>
            <li>
              <strong className="text-foreground">Table of contents not clickable</strong> — the
              EPUB export builds a nav document; if you edited the file by hand, re-export instead.
            </li>
            <li>
              <strong className="text-foreground">Series not linking</strong> — the series title must
              match exactly (including punctuation) across every book.
            </li>
          </ul>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Ready to check a file first?{' '}
        <Link href="/kdp-preview" className="text-violet-300 hover:underline">
          Open the KDP preview
        </Link>
        .
      </p>
    </div>
  );
}
