import Link from 'next/link';
import { notFound } from 'next/navigation';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { legalPages, type LegalSlug } from '@/lib/legal';
import { getSetting } from '@/lib/settings';
import { LegalLinks } from '@/components/legal-links';

export const dynamic = 'force-dynamic';

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!Object.hasOwn(legalPages, slug)) notFound();
  const title = legalPages[slug as LegalSlug];
  const value = await getSetting<{ content?: string }>(`legal_${slug}`);
  const html = value?.content?.trim()
    ? sanitizeHtml(await marked.parse(value.content), {
        allowedTags: sanitizeHtml.defaults.allowedTags,
        allowedAttributes: { a: ['href', 'title'] },
        allowedSchemes: ['http', 'https', 'mailto'],
      })
    : '';
  return (
    <main className="app-backdrop min-h-dvh p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 py-8">
        <Link href="/login" className="text-sm text-violet-300 hover:underline">
          Back to sign in
        </Link>
        <h1 className="text-3xl font-bold">{title}</h1>
        {html ? (
          <article
            className="legal-content space-y-4 leading-relaxed [&_a]:text-violet-300 [&_a]:underline [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:font-bold [&_li]:ml-6 [&_ul]:list-disc [&_ol]:list-decimal"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-muted-foreground">
            This page has not been published yet. Please contact support.
          </p>
        )}
        <LegalLinks />
      </div>
    </main>
  );
}
