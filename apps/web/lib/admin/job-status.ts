/** Badge colour for a `jobs.status` value. */
export function jobStatusVariant(status: string): 'success' | 'danger' | 'default' | 'muted' {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'active' || status === 'queued') return 'default';
  return 'muted';
}
