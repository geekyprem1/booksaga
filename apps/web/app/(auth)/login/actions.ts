'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { cookies, headers } from 'next/headers';
import { checkRateLimit } from '@booksaga/core';
import { getQueues } from '@/lib/queue';
import { VIEW_AS_COOKIE } from '@/lib/auth/view-as-token';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/safe-redirect';

export interface LoginState {
  error?: string;
}

const loginSchema = z.object({
  email: z.string().trim().pipe(z.email()),
  password: z.string().min(1),
  next: z.string().optional(),
});

const GENERIC_ERROR = 'Invalid email or password.';

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  });
  if (!parsed.success) return { error: 'Please enter a valid email and password.' };

  try {
    const requestHeaders = await headers();
    await checkRateLimit(
      getQueues(),
      'login-email',
      parsed.data.email.toLowerCase(),
      10,
      10 * 60_000,
    );
    const address = requestHeaders.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
    await checkRateLimit(getQueues(), 'login-address', address, 100, 10 * 60_000);
  } catch {
    return { error: 'Sign-in is temporarily limited. Please wait a few minutes and try again.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: GENERIC_ERROR };

  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'active') {
    await supabase.auth.signOut();
    return { error: 'This account is suspended. Please contact support.' };
  }

  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect(safeNextPath(parsed.data.next));
}
