'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveSettings } from '@/app/admin/settings/actions';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function SettingsForm({
  app,
  maintenance,
  upgrades,
}: {
  app: { name: string; support_email: string; support_url: string };
  maintenance: { enabled: boolean; message: string };
  upgrades: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  function save(section: string, value: object) {
    setMessage('');
    start(async () => {
      const result = await saveSettings({ section, value });
      setMessage(result.ok ? 'Settings saved.' : result.error.message);
      if (result.ok) router.refresh();
    });
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your app details, upgrade links and maintenance notice.
        </p>
      </header>
      <p role="status" aria-live="polite" className="text-sm">
        {message}
      </p>
      <Card className="p-5">
        <h2 className="text-lg font-semibold">App details</h2>
        <form
          className="mt-4 grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save('app', {
              name: String(f.get('name')).trim(),
              support_email: String(f.get('support_email')).trim(),
              support_url: String(f.get('support_url')).trim(),
            });
          }}
        >
          <label className="text-sm">
            App name
            <Input name="name" required maxLength={80} defaultValue={app.name} />
          </label>
          <label className="text-sm">
            Support email
            <Input
              name="support_email"
              type="email"
              maxLength={254}
              defaultValue={app.support_email}
            />
          </label>
          <label className="text-sm">
            Support URL
            <Input
              name="support_url"
              type="url"
              defaultValue={app.support_url}
              placeholder="https://example.com/support"
            />
          </label>
          <div>
            <Button disabled={pending}>Save app details</Button>
          </div>
        </form>
      </Card>
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Upgrade links</h2>
        <p className="text-sm text-muted-foreground">
          Each funnel level opens its configured sales page. Leave blank until ready.
        </p>
        <form
          className="mt-4 grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save(
              'upgrade_urls',
              Object.fromEntries(
                Object.keys(upgrades).map((key) => [key, String(f.get(key)).trim()]),
              ),
            );
          }}
        >
          {Object.keys(upgrades).map((key) => (
            <label key={key} className="text-sm">
              {key} sales page
              <Input
                type="url"
                name={key}
                defaultValue={upgrades[key]}
                placeholder="https://example.com"
              />
            </label>
          ))}
          <div>
            <Button disabled={pending}>Save upgrade links</Button>
          </div>
        </form>
      </Card>
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Maintenance mode</h2>
        <p className="text-sm text-muted-foreground">
          Visitors see the notice below. Admins can still access the app.
        </p>
        <form
          className="mt-4 grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save('maintenance', {
              enabled: f.has('enabled'),
              message: String(f.get('message')).trim(),
            });
          }}
        >
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={maintenance.enabled} /> Enable
            maintenance mode
          </label>
          <label className="text-sm">
            Notice
            <Input
              name="message"
              maxLength={500}
              defaultValue={maintenance.message}
              placeholder="We will be back shortly."
            />
          </label>
          <div>
            <Button disabled={pending}>Save maintenance</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
