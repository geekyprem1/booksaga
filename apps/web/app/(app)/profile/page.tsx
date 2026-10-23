import { ProfileForm } from '@/components/profile/profile-form';
import { requireUser } from '@/lib/auth/session';
import { getAvatarUrl } from '@/lib/profile/avatar';
import { getAdminDb } from '@/lib/supabase/admin';

export const metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireUser();
  const db = getAdminDb();

  const [{ data: pens }, avatarUrl] = await Promise.all([
    db.from('pen_names').select('id, name').eq('user_id', user.id).order('created_at'),
    getAvatarUrl(user.avatarUrl),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-extrabold">Profile</h1>
        <p className="mt-1 text-muted-foreground">Your account, avatar and pen names.</p>
      </header>

      <ProfileForm
        userId={user.id}
        name={user.name}
        email={user.email}
        avatarUrl={avatarUrl}
        penNames={pens ?? []}
      />
    </div>
  );
}
