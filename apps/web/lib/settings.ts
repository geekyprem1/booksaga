import 'server-only';
import { cache } from 'react';
import { getAdminDb } from '@/lib/supabase/admin';

export type UpgradeLevel = 'FE' | 'OTO1' | 'OTO2' | 'OTO3' | 'OTO4' | 'OTO5';

/** Read one app_settings value (service role; the table has no browser access). */
export const getSetting = cache(async <T = unknown>(key: string): Promise<T | null> => {
  const { data } = await getAdminDb()
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  return (data?.value as T | undefined) ?? null;
});

export const getAppInfo = cache(async () => {
  const v = await getSetting<{ name?: string; support_email?: string; support_url?: string }>(
    'app',
  );
  return {
    name: v?.name || 'BookSaga',
    supportEmail: v?.support_email || '',
    supportUrl: v?.support_url || '',
  };
});

export const isEmailEnabled = cache(async () => {
  const v = await getSetting<{ enabled?: boolean }>('email');
  return v?.enabled === true;
});

export const getMaintenance = cache(async () => {
  const v = await getSetting<{ enabled?: boolean; message?: string }>('maintenance');
  return { enabled: v?.enabled === true, message: v?.message ?? '' };
});

/** External sales-page URL for a funnel level (set in admin settings), or null. */
export async function getUpgradeUrl(level: UpgradeLevel): Promise<string | null> {
  const v = await getSetting<Partial<Record<UpgradeLevel, string>>>('upgrade_urls');
  const url = v?.[level];
  return url && /^https?:\/\//.test(url) ? url : null;
}
