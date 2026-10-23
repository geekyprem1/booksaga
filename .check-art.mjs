import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: covers } = await db
  .from('covers')
  .select('id, art_path, final_path, is_active')
  .order('created_at', { ascending: false })
  .limit(3);
console.log(covers);

for (const cover of covers ?? []) {
  if (!cover.art_path) continue;
  const art = await db.storage.from('cover-art').createSignedUrl(cover.art_path, 600);
  console.log('art', cover.art_path, '->', art.error?.message ?? art.data?.signedUrl?.slice(0, 80));
}
