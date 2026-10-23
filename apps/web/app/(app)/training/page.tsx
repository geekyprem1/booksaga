import { TrainingList, type TrainingModule } from '@/components/training/training-list';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';

export const metadata = { title: 'Training' };
export const dynamic = 'force-dynamic';

export default async function TrainingPage() {
  const user = await requireUser();
  const db = getAdminDb();

  const [{ data: modules }, { data: lessons }, { data: progress }] = await Promise.all([
    db
      .from('training_modules')
      .select('id, title, description, sort_order')
      .eq('is_published', true)
      .order('sort_order'),
    db
      .from('training_lessons')
      .select('id, module_id, title, description, video_url, duration_minutes, sort_order')
      .eq('is_published', true)
      .order('sort_order'),
    db.from('training_progress').select('lesson_id').eq('user_id', user.id),
  ]);

  const completed = new Set((progress ?? []).map((row) => row.lesson_id));

  const list: TrainingModule[] = (modules ?? []).map((module) => ({
    id: module.id,
    title: module.title,
    description: module.description,
    lessons: (lessons ?? [])
      .filter((lesson) => lesson.module_id === module.id)
      .map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        videoUrl: lesson.video_url,
        durationMinutes: lesson.duration_minutes,
        completed: completed.has(lesson.id),
      })),
  }));

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-3xl font-extrabold">Training</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Short lessons on getting the most out of BookSaga. Tick them off as you go.
        </p>
      </header>

      <TrainingList modules={list} />
    </div>
  );
}
