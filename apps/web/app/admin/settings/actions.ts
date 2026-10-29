'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { writeAudit } from '@booksaga/core';
import { requireAdmin } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction } from '@/lib/actions';

const url = z.union([
  z.literal(''),
  z.url().refine((value) => /^https?:\/\//i.test(value), 'Use an HTTP or HTTPS URL.'),
]);
const appSchema = z.object({
  name: z.string().trim().min(1).max(80),
  support_email: z.union([z.literal(''), z.email()]),
  support_url: url,
});
const maintenanceSchema = z.object({ enabled: z.boolean(), message: z.string().trim().max(500) });
const upgradesSchema = z.object({ OTO1: url, OTO2: url, OTO3: url, OTO4: url, OTO5: url });

export async function saveSettings(input: unknown) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const data = z
      .discriminatedUnion('section', [
        z.object({ section: z.literal('app'), value: appSchema }),
        z.object({ section: z.literal('maintenance'), value: maintenanceSchema }),
        z.object({ section: z.literal('upgrade_urls'), value: upgradesSchema }),
      ])
      .parse(input);
    const db = getAdminDb();
    const old = await db.from('app_settings').select('value').eq('key', data.section).single();
    if (old.error) throw new Error(old.error.message);
    const previous =
      old.data.value && typeof old.data.value === 'object' && !Array.isArray(old.data.value)
        ? old.data.value
        : {};
    const value = { ...previous, ...data.value };
    const result = await db.from('app_settings').update({ value }).eq('key', data.section);
    if (result.error) throw new Error(result.error.message);
    await writeAudit(db, {
      actorId: admin.id,
      action: 'settings.update',
      target: `settings:${data.section}`,
      meta: { before: old.data.value, after: value },
    });
    revalidatePath('/', 'layout');
    return undefined;
  });
}
