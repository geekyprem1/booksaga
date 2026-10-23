import type { TiptapDoc } from '@booksaga/shared';

export interface EditorChapter {
  id: string;
  number: number;
  title: string;
  doc: TiptapDoc | null;
  text: string;
  wordCount: number;
}

export interface BookMetadataDraft {
  title: string;
  subtitle: string;
  blurb: string;
  keywords: string[];
  categories: string[];
}

export interface ContinuityIssue {
  type?: string;
  detail: string;
  chapterNumber: number;
  quote?: string;
  fix?: string;
  resolved?: boolean;
}

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
