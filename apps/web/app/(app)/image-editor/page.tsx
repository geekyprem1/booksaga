import { ImageEditor, type EditorImage } from '@/components/editor/image-editor';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';

export const metadata = { title: 'Image Editor' };
export const dynamic = 'force-dynamic';

export default async function ImageEditorPage() {
  const user = await requireUser();
  const db = getAdminDb();

  const { data: rows } = await db
    .from('images')
    .select('id, path')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(12);

  const images: EditorImage[] = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data } = await db.storage.from('uploads').createSignedUrl(row.path, 3600);
      return { id: row.id, url: data?.signedUrl ?? '' };
    }),
  );

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-3xl font-extrabold">Image Editor</h1>
        <p className="mt-1 text-muted-foreground">
          Crop, brighten and annotate any image, then export a PNG or JPG.
        </p>
      </header>

      <ImageEditor images={images.filter((image) => image.url)} />
    </div>
  );
}
