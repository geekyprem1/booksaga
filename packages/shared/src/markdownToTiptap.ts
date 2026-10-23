/**
 * Markdown-lite -> TipTap JSON (ARCH §6).
 *
 * The model writes plain prose: paragraphs separated by blank lines, `* * *` scene breaks, and
 * `**bold**` / `_italic_` inline. That is all we support on purpose — a full markdown parser would
 * accept constructs (tables, headings) the editor and exporters do not render.
 */

export type Mark = 'bold' | 'italic';

export interface TiptapTextNode {
  type: 'text';
  text: string;
  marks?: { type: Mark }[];
}

export interface TiptapBlockNode {
  type: 'paragraph' | 'horizontalRule';
  content?: TiptapTextNode[];
}

export interface TiptapDoc {
  type: 'doc';
  content: TiptapBlockNode[];
}

const SCENE_BREAK = /^\s*(?:\*\s*){3,}$|^\s*(?:-\s*){3,}$|^\s*(?:_\s*){3,}$/;

function inline(text: string): TiptapTextNode[] {
  const nodes: TiptapTextNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push({ type: 'text', text: text.slice(last, match.index) });
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push({ type: 'text', text: token.slice(2, -2), marks: [{ type: 'bold' }] });
    } else {
      nodes.push({ type: 'text', text: token.slice(1, -1), marks: [{ type: 'italic' }] });
    }
    last = match.index + token.length;
  }

  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
  return nodes.filter((n) => n.text.length > 0);
}

export function markdownToTiptap(markdown: string): TiptapDoc {
  const blocks = markdown.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  const content: TiptapBlockNode[] = [];

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    if (SCENE_BREAK.test(block)) {
      content.push({ type: 'horizontalRule' });
      continue;
    }
    const text = block.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const nodes = inline(text);
    content.push(nodes.length > 0 ? { type: 'paragraph', content: nodes } : { type: 'paragraph' });
  }

  return { type: 'doc', content };
}

/** Plain text for search, AI context and exports. Scene breaks become a blank line. */
export function tiptapToPlainText(doc: TiptapDoc): string {
  return doc.content
    .map((node) => {
      if (node.type === 'horizontalRule') return '* * *';
      return (node.content ?? []).map((t) => t.text).join('');
    })
    .join('\n\n')
    .trim();
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
