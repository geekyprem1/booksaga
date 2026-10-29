'use client';
import { useState, useTransition } from 'react';
import { saveLegalPage } from '@/app/admin/settings/legal-actions';
import { legalPages, type LegalSlug } from '@/lib/legal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function LegalSettings({ values }: { values: Record<LegalSlug, string> }) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Legal pages</h2>
      <p className="text-sm text-muted-foreground">
        Add your approved policy text in Markdown. Empty pages show a notice until content is
        provided.
      </p>
      <p role="status" aria-live="polite" className="text-sm">
        {message}
      </p>
      {Object.entries(legalPages).map(([slug, title]) => (
        <form
          key={slug}
          className="mt-5 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const content = String(new FormData(event.currentTarget).get('content') ?? '');
            setMessage('');
            start(async () => {
              const result = await saveLegalPage({ slug, content });
              setMessage(result.ok ? `${title} saved.` : result.error.message);
            });
          }}
        >
          <label htmlFor={`legal-${slug}`} className="text-sm">
            {title}
          </label>
          <textarea
            id={`legal-${slug}`}
            name="content"
            defaultValue={values[slug as LegalSlug]}
            maxLength={50000}
            rows={6}
            className="w-full rounded-md border border-input bg-background p-3 text-sm"
          />
          <div className="flex items-center gap-4">
            <Button disabled={pending}>Save {title}</Button>
            <a className="text-sm text-violet-300 hover:underline" href={`/legal/${slug}`}>
              View page
            </a>
          </div>
        </form>
      ))}
    </Card>
  );
}
