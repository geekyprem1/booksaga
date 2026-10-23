import { TemplateLibrary, type TemplateCard } from '@/components/templates/template-library';
import { getAccount } from '@/lib/account';
import { getAdminDb } from '@/lib/supabase/admin';

export const metadata = { title: 'Series Templates' };
export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const { account } = await getAccount();
  const db = getAdminDb();

  const { data: rows } = await db
    .from('templates')
    .select('id, slug, category, title, premise, genre, tone, length_preset, planned_books, keywords, cover_path, tier')
    .eq('is_published', true)
    .order('category')
    .order('sort_order')
    .limit(300);

  const covers = new Map<string, string>();
  await Promise.all(
    (rows ?? [])
      .filter((row) => row.cover_path)
      .map(async (row) => {
        const { data } = await db.storage.from('covers').createSignedUrl(row.cover_path!, 3600);
        if (data?.signedUrl) covers.set(row.id, data.signedUrl);
      }),
  );

  const templates: TemplateCard[] = (rows ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    category: row.category,
    title: row.title,
    premise: row.premise,
    genre: row.genre,
    tone: row.tone,
    lengthPreset: row.length_preset,
    plannedBooks: row.planned_books,
    keywords: row.keywords ?? [],
    coverUrl: covers.get(row.id) ?? null,
    tier: row.tier as 'lite' | 'full',
  }));

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-3xl font-extrabold">Series Templates</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Proven premises with the genre, length and part count already set. Pick one and the create
          form arrives pre-filled.
        </p>
      </header>

      <TemplateLibrary
        templates={templates}
        fullAccess={account.entitlements.templatesTier === 'full'}
      />
    </div>
  );
}
