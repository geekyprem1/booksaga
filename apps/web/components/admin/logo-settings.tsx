'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveLogo } from '@/app/admin/settings/logo-actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function LogoSettings({ logoUrl }: { logoUrl: string }) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">App logo</h2>
      <p className="text-sm text-muted-foreground">
        Upload a PNG, JPEG or WebP up to 512 KB. The logo appears beside the app name.
      </p>
      {logoUrl && (
        <img src={logoUrl} alt="Current app logo" className="mt-3 size-16 object-contain" />
      )}
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setMessage('');
          start(async () => {
            const result = await saveLogo(form);
            setMessage(result.ok ? 'Logo saved.' : result.error.message);
            if (result.ok) router.refresh();
          });
        }}
      >
        <label className="grid gap-1 text-sm">
          Logo file
          <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
        </label>
        <Button disabled={pending}>Upload logo</Button>
      </form>
      <p role="status" aria-live="polite" className="mt-2 text-sm">
        {message}
      </p>
    </Card>
  );
}
