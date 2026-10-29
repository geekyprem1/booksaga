import { requireAdmin } from '@/lib/auth/session';
import { getSetting } from '@/lib/settings';
import { SettingsForm } from '@/components/admin/settings-form';
import { LegalSettings } from '@/components/admin/legal-settings';
import { LogoSettings } from '@/components/admin/logo-settings';
import { AiSettingsForm } from '@/components/admin/ai-settings';
import { aiSettingsSchema } from '@booksaga/shared';
import { legalPages, type LegalSlug } from '@/lib/legal';

export const metadata = { title: 'Settings · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [app, maintenance, upgrades] = await Promise.all([
    getSetting<{ name?: string; support_email?: string; support_url?: string; logo_url?: string }>(
      'app',
    ),
    getSetting<{ enabled?: boolean; message?: string }>('maintenance'),
    getSetting<Record<string, string>>('upgrade_urls'),
  ]);
  const legal = await Promise.all(
    Object.keys(legalPages).map(async (slug) => {
      const value = await getSetting<{ content?: string }>(`legal_${slug}`);
      return [slug, value?.content ?? ''] as const;
    }),
  );
  const aiSetting = await getSetting('ai_models');
  const parsedAi = aiSettingsSchema.safeParse(aiSetting);
  return (
    <div className="flex flex-col gap-6">
      <SettingsForm
        app={{
          name: app?.name ?? 'BookSaga',
          support_email: app?.support_email ?? '',
          support_url: app?.support_url ?? '',
        }}
        maintenance={{
          enabled: maintenance?.enabled === true,
          message: maintenance?.message ?? '',
        }}
        upgrades={Object.fromEntries(
          ['OTO1', 'OTO2', 'OTO3', 'OTO4', 'OTO5'].map((level) => [level, upgrades?.[level] ?? '']),
        )}
      />
      <LegalSettings values={Object.fromEntries(legal) as Record<LegalSlug, string>} />
      <LogoSettings logoUrl={app?.logo_url ?? ''} />
      <AiSettingsForm
        initial={parsedAi.success ? parsedAi.data : { model: '', fastModel: '', pricing: {} }}
      />
    </div>
  );
}
