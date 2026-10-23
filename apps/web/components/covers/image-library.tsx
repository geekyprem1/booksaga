'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageIcon, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { uploadImageAction, applyLibraryImageAction } from '@/lib/covers/image-actions';

export interface LibraryImage {
  id: string;
  url: string | null;
}

/**
 * Library + upload source for covers (T4.7). Uploads are magic-byte sniffed and capped at 10 MB
 * server-side; picking an image composes the cover without any AI call.
 */
export function ImageLibrary({
  open,
  bookId,
  bookTitle,
  images,
  onClose,
  onJob,
}: {
  open: boolean;
  bookId: string | null;
  bookTitle: string;
  images: LibraryImage[];
  onClose: () => void;
  onJob: (jobId: string) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    const response = await uploadImageAction(formData);
    setUploading(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    router.refresh();
  }

  async function pick(imageId: string) {
    if (!bookId) return;
    setBusy(imageId);
    setError(null);
    const response = await applyLibraryImageAction({ bookId, imageId });
    setBusy(null);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    onJob(response.data.jobId);
  }

  return (
    <Dialog open={open} onOpenChange={(value) => (!value ? onClose() : undefined)}>
      <DialogContent
        title="Use your own image"
        description={`Pick an image for â€œ${bookTitle}â€. No credits are used â€” only the text is composed.`}
        className="max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Upload aria-hidden="true" />
              )}
              Upload image
            </Button>
            <p className="text-xs text-muted-foreground">PNG, JPEG or WebP Â· up to 10 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = '';
              }}
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-rose-200">
              {error}
            </p>
          ) : null}

          {images.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <ImageIcon className="size-6" aria-hidden="true" />
              Your library is empty â€” upload an image to start.
            </div>
          ) : (
            <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => pick(image.id)}
                  disabled={busy !== null}
                  className="group relative aspect-[2/3] overflow-hidden rounded-lg border border-border hover:border-primary"
                >
                  {image.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.url} alt="" className="size-full object-cover" />
                  ) : null}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">
                    {busy === image.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      'Use this'
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
