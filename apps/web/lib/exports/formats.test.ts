import { describe, expect, it } from 'vitest';
import { defaultExportFormats, selectedExportFormats } from './formats';

describe('export formats', () => {
  it('does not preselect the paperback wrap without the entitlement', () => {
    expect(defaultExportFormats(false)).toEqual(['epub', 'pdf', 'docx', 'metadata']);
  });

  it('preselects every format (including the wrap) when the plan includes it', () => {
    expect(defaultExportFormats(true)).toEqual(['epub', 'pdf', 'docx', 'metadata', 'wrap']);
  });

  it('drops a stale wrap selection for an account that cannot use it', () => {
    expect(selectedExportFormats(['epub', 'pdf', 'wrap'], false)).toEqual(['epub', 'pdf']);
  });

  it('keeps the wrap selection when the entitlement is present', () => {
    expect(selectedExportFormats(['epub', 'wrap'], true)).toEqual(['epub', 'wrap']);
  });
});
