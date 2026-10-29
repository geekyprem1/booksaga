'use client';
import { useState, useTransition } from 'react';
import type { AiSettings } from '@booksaga/shared';
import { saveAiSettings } from '@/app/admin/settings/ai-actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function AiSettingsForm({ initial }: { initial: AiSettings }) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Text AI models and pricing</h2>
      <p className="text-sm text-muted-foreground">
        Restart the worker after saving. Leave model fields blank to use environment defaults.
        Prices are USD per million tokens; provider-reported costs take precedence.
      </p>
      <form
        className="mt-4 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          let pricing: unknown;
          try {
            pricing = JSON.parse(String(form.get('pricing')));
          } catch {
            setMessage('Pricing must be valid JSON.');
            return;
          }
          setMessage('');
          start(async () => {
            const result = await saveAiSettings({
              model: form.get('model'),
              fastModel: form.get('fastModel'),
              pricing,
            });
            setMessage(result.ok ? 'Saved. Restart the worker to apply.' : result.error.message);
          });
        }}
      >
        <label className="text-sm">
          Main model override
          <Input
            name="model"
            defaultValue={initial.model}
            maxLength={150}
            placeholder="Environment default"
          />
        </label>
        <label className="text-sm">
          Fast model override
          <Input
            name="fastModel"
            defaultValue={initial.fastModel}
            maxLength={150}
            placeholder="Environment default"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Pricing table (JSON)
          <textarea
            name="pricing"
            rows={8}
            defaultValue={JSON.stringify(initial.pricing, null, 2)}
            className="w-full rounded-md border border-input bg-background p-3 font-mono text-sm"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Example:{' '}
          {`{"provider/model": {"inputPerM": 0.1, "outputPerM": 0.2, "cachedInputPerM": 0.02}}`}
        </p>
        <div>
          <Button disabled={pending}>Save AI settings</Button>
        </div>
      </form>
      <p role="status" aria-live="polite" className="mt-2 text-sm">
        {message}
      </p>
    </Card>
  );
}
