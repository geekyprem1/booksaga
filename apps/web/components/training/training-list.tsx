'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Loader2, PlayCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/card';
import { setLessonProgressAction } from '@/lib/training/actions';
import { cn } from '@/lib/utils';

export interface TrainingLesson {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string | null;
  durationMinutes: number | null;
  completed: boolean;
}

export interface TrainingModule {
  id: string;
  title: string;
  description: string | null;
  lessons: TrainingLesson[];
}

export function TrainingList({ modules }: { modules: TrainingModule[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(modules[0]?.id ?? null);

  const total = modules.reduce((sum, module) => sum + module.lessons.length, 0);
  const done = modules.reduce(
    (sum, module) => sum + module.lessons.filter((lesson) => lesson.completed).length,
    0,
  );

  async function toggle(lesson: TrainingLesson) {
    setBusy(lesson.id);
    const response = await setLessonProgressAction({
      lessonId: lesson.id,
      completed: !lesson.completed,
    });
    setBusy(null);
    if (!response.ok) return;
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-violet-500 to-pink-500"
            style={{ width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {done}/{total} lessons
        </span>
      </div>

      {modules.map((module) => {
        const moduleDone = module.lessons.filter((lesson) => lesson.completed).length;
        const expanded = open === module.id;

        return (
          <Card key={module.id}>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setOpen(expanded ? null : module.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>{module.title}</CardTitle>
                  {module.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">{module.description}</p>
                  ) : null}
                </div>
                <Badge variant={moduleDone === module.lessons.length ? 'success' : 'muted'}>
                  {moduleDone}/{module.lessons.length}
                </Badge>
              </div>
            </CardHeader>

            {expanded ? (
              <CardContent className="flex flex-col divide-y divide-border/60 pt-0">
                {module.lessons.map((lesson) => (
                  <div key={lesson.id} className="flex items-center justify-between gap-3 py-3">
                    <button
                      type="button"
                      onClick={() => toggle(lesson)}
                      disabled={busy !== null}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      {busy === lesson.id ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : lesson.completed ? (
                        <CheckCircle2 className="size-4 text-green-400" aria-hidden="true" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" aria-hidden="true" />
                      )}
                      <span className={cn('text-sm', lesson.completed && 'text-muted-foreground line-through')}>
                        {lesson.title}
                      </span>
                    </button>

                    <div className="flex items-center gap-2">
                      {lesson.durationMinutes ? (
                        <span className="text-[11px] text-muted-foreground">
                          {lesson.durationMinutes} min
                        </span>
                      ) : null}
                      {lesson.videoUrl ? (
                        <a
                          href={lesson.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-violet-300 hover:underline"
                          aria-label={`Watch ${lesson.title}`}
                        >
                          <PlayCircle className="size-4" aria-hidden="true" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
