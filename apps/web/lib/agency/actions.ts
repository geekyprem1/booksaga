'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError, assertCan } from '@booksaga/shared';
import { getAccount } from '@/lib/account';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';

const createInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  allotment: z.number().int().min(0).max(100_000),
});

/** Readable password: groups of 4, no ambiguous characters. */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]);
  return `Bs-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

/** Create an agency client (T6.17): auth user, profile link, allotment. */
export async function createClientAction(
  raw: z.infer<typeof createInput>,
): Promise<ActionResult<{ email: string; password: string; clientId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { name, email, allotment } = createInput.parse(raw);
    const db = getAdminDb();

    const { account } = await getAccount();
    const { count } = await db
      .from('agency_clients')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id);
    assertCan(account.entitlements, { kind: 'agency', clientCount: count ?? 0 });

    const password = generatePassword();

    const created = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (created.error || !created.data.user) {
      const message = created.error?.message ?? 'unknown error';
      throw new AppError(
        message.includes('already')
          ? 'VALIDATION'
          : 'INTERNAL',
        message.includes('already')
          ? 'An account with that email already exists.'
          : `Could not create the client: ${message}`,
      );
    }

    const clientId = created.data.user.id;

    const { error: profileError } = await db
      .from('profiles')
      .update({ name, parent_agency_id: user.id })
      .eq('id', clientId);
    if (profileError) {
      await db.auth.admin.deleteUser(clientId).catch(() => undefined);
      throw new AppError('INTERNAL', `Could not finish the client account: ${profileError.message}`);
    }

    const { error: linkError } = await db.from('agency_clients').insert({
      owner_id: user.id,
      client_id: clientId,
      allotment,
      status: 'active',
    });
    if (linkError) {
      await db.auth.admin.deleteUser(clientId).catch(() => undefined);
      throw new AppError('INTERNAL', `Could not link the client: ${linkError.message}`);
    }

    revalidatePath('/agency');
    return { email, password, clientId };
  });
}

const statusInput = z.object({
  clientId: z.string().uuid(),
  status: z.enum(['active', 'suspended']),
});

export async function setClientStatusAction(
  raw: z.infer<typeof statusInput>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const { clientId, status } = statusInput.parse(raw);
    const db = getAdminDb();

    const { error } = await db
      .from('agency_clients')
      .update({ status })
      .eq('owner_id', user.id)
      .eq('client_id', clientId);
    if (error) throw new AppError('INTERNAL', `Could not update the client: ${error.message}`);

    revalidatePath('/agency');
    return undefined;
  });
}

const allotmentInput = z.object({
  clientId: z.string().uuid(),
  allotment: z.number().int().min(0).max(100_000),
});

export async function setClientAllotmentAction(
  raw: z.infer<typeof allotmentInput>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const { clientId, allotment } = allotmentInput.parse(raw);
    const db = getAdminDb();

    const { data: link } = await db
      .from('agency_clients')
      .select('id, used')
      .eq('owner_id', user.id)
      .eq('client_id', clientId)
      .maybeSingle();
    if (!link) throw new AppError('NOT_FOUND', 'Client not found.');
    if (allotment < link.used) {
      throw new AppError(
        'VALIDATION',
        `This client has already used ${link.used} credits â€” the allotment cannot go below that.`,
      );
    }

    const { error } = await db
      .from('agency_clients')
      .update({ allotment })
      .eq('id', link.id);
    if (error) throw new AppError('INTERNAL', `Could not update the allotment: ${error.message}`);

    revalidatePath('/agency');
    return undefined;
  });
}
