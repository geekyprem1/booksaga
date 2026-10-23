import { Gate } from '@/components/billing/gate';
import { DfyLibrary, type DfyIdea, type DfyPack } from '@/components/dfy/dfy-library';
import { getAccount } from '@/lib/account';
import { getAdminDb } from '@/lib/supabase/admin';

export const metadata = { title: 'Done For You' };
export const dynamic = 'force-dynamic';

export default async function DfyPage() {
  const { account } = await getAccount();
  const db = getAdminDb();

  const [{ data: ideaRows }, { data: packRows }] = await Promise.all([
    db
      .from('dfy_ideas')
      .select('id, niche, title, premise, hook, tier')
      .eq('is_published', true)
      .order('niche')
      .order('sort_order')
      .limit(500),
    db
      .from('dfy_packs')
      .select('id, title, description, genre, contents, tier')
      .eq('is_published', true)
      .order('sort_order')
      .limit(40),
  ]);

  const ideas: DfyIdea[] = (ideaRows ?? []).map((row) => ({
    id: row.id,
    niche: row.niche,
    title: row.title,
    premise: row.premise,
    hook: row.hook,
    tier: row.tier as 'lite' | 'full',
  }));

  const packs: DfyPack[] = (packRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    genre: row.genre,
    contents: (row.contents ?? {}) as DfyPack['contents'],
    tier: row.tier as 'lite' | 'full',
  }));

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-3xl font-extrabold">Done For You</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Series ideas by niche, plus keyword and blurb packs. Pick one and the create form is
          pre-filled.
        </p>
      </header>

      <Gate
        check={{ kind: 'dfyPacks', tier: 'lite' }}
        feature="Done For You"
        planCode="oto2"
        description="Series ideas by niche plus keyword and blurb packs."
      >
        <DfyLibrary
          ideas={ideas}
          packs={packs}
          fullAccess={account.entitlements.dfyPacks === 'full'}
        />
      </Gate>
    </div>
  );
}
