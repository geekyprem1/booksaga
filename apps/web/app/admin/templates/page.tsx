import { ContentAdmin, type ContentRow } from '@/components/admin/content-admin';
import { requireAdmin } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';

export const metadata = { title: 'Admin · Templates' };
export const dynamic = 'force-dynamic';

export default async function AdminTemplatesPage() {
  await requireAdmin();
  const db = getAdminDb();

  const [{ data: templates }, { data: ideas }, { data: packs }] = await Promise.all([
    db
      .from('templates')
      .select('id, title, category, tier, is_published')
      .order('category')
      .order('sort_order')
      .limit(300),
    db
      .from('dfy_ideas')
      .select('id, title, niche, tier, is_published')
      .order('niche')
      .limit(500),
    db.from('dfy_packs').select('id, title, genre, tier, is_published').limit(60),
  ]);

  const templateRows: ContentRow[] = (templates ?? []).map((row) => ({
    id: row.id,
    label: row.title,
    sub: row.category,
    tier: row.tier,
    published: row.is_published,
  }));

  const ideaRows: ContentRow[] = (ideas ?? []).map((row) => ({
    id: row.id,
    label: row.title,
    sub: row.niche,
    tier: row.tier,
    published: row.is_published,
  }));

  const packRows: ContentRow[] = (packs ?? []).map((row) => ({
    id: row.id,
    label: row.title,
    sub: row.genre,
    tier: row.tier,
    published: row.is_published,
  }));

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-3xl font-extrabold">Templates &amp; DFY</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          {templateRows.length} templates · {ideaRows.length} ideas · {packRows.length} packs. Hide a
          row to pull it from the customer pages. Re-seed with{' '}
          <code className="rounded bg-muted px-1 text-xs">pnpm tsx scripts/seed-templates.ts</code> and{' '}
          <code className="rounded bg-muted px-1 text-xs">pnpm tsx scripts/seed-dfy.ts</code> (both
          idempotent).
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <ContentAdmin table="templates" title="Templates" rows={templateRows} />
        <ContentAdmin table="dfy_ideas" title="DFY ideas" rows={ideaRows} />
        <ContentAdmin table="dfy_packs" title="DFY packs" rows={packRows} />
      </div>
    </div>
  );
}
