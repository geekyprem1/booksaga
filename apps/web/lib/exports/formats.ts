/**
 * Export format selection (T5.7).
 *
 * The paperback wrap is an OTO1 entitlement. The UI must never send `wrap` for an account that
 * does not own it: `exportBookAction` rejects the whole export with PLAN_REQUIRED, so a locked
 * chip that is still selected would make every export fail.
 */
export type ExportFormat = 'epub' | 'pdf' | 'reader' | 'docx' | 'metadata' | 'wrap';

/** Every format the export hub knows about, in display order. */
export const EXPORT_FORMATS: ExportFormat[] = ['epub', 'pdf', 'reader', 'docx', 'metadata', 'wrap'];

/** Formats every plan includes. `wrap` is added only when the entitlement is present. */
export const BASE_EXPORT_FORMATS: ExportFormat[] = ['epub', 'pdf', 'docx', 'metadata'];

/** The pre-selected formats for a book. */
export function defaultExportFormats(canWrap: boolean): ExportFormat[] {
  return canWrap ? [...BASE_EXPORT_FORMATS, 'wrap'] : [...BASE_EXPORT_FORMATS];
}

/**
 * Resolve the formats to send for a book. Any stale `wrap` selection (for example after a plan
 * downgrade, or a state captured before the entitlement was known) is dropped for accounts that
 * cannot use it, so the server-side entitlement check never blocks an otherwise valid export.
 */
export function selectedExportFormats(
  chosen: readonly ExportFormat[] | undefined,
  canWrap: boolean,
): ExportFormat[] {
  const formats = chosen ?? defaultExportFormats(canWrap);
  return canWrap ? [...formats] : formats.filter((format) => format !== 'wrap');
}
