import type { DbClient } from '@booksaga/core';

export function exportFilesExpired(status: string, expiresAt: string | null): boolean {
  return status === 'expired' || (expiresAt !== null && Date.parse(expiresAt) <= Date.now());
}

/** A reader-only export must not hide the latest print PDF or wrap. */
export async function loadLatestExportFiles(db: DbClient, bookId: string) {
  const now = new Date().toISOString();
  const load = async (format: 'pdf' | 'wrap' | 'zip') => {
    const { data, error } = await db
      .from('exports')
      .select('files')
      .eq('book_id', bookId)
      .eq('status', 'ready')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .not(`files->>${format}`, 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Could not load the ${format} export: ${error.message}`);
    return (data?.files ?? {}) as Record<string, string>;
  };
  const [pdf, wrap, zip] = await Promise.all([load('pdf'), load('wrap'), load('zip')]);
  return { pdf, wrap, zip };
}
