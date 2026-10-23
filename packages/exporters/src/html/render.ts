/**
 * TipTap JSON → semantic HTML. This is the single renderer every exporter shares: EPUB chapters,
 * the print PDF (via Paged.js) and the DOCX conversion all read from it.
 */
import type { TiptapDoc } from '@booksaga/shared';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

interface TextNode {
  type: 'text';
  text: string;
  marks?: { type: string }[];
}

interface BlockNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: (TextNode | BlockNode)[];
  text?: string;
}

function renderInline(nodes: (TextNode | BlockNode)[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((node) => {
      if (node.type === 'text') {
        let html = escapeHtml((node as TextNode).text ?? '');
        for (const mark of (node as TextNode).marks ?? []) {
          if (mark.type === 'bold') html = `<strong>${html}</strong>`;
          else if (mark.type === 'italic') html = `<em>${html}</em>`;
          else if (mark.type === 'code') html = `<code>${html}</code>`;
          else if (mark.type === 'strike') html = `<s>${html}</s>`;
        }
        return html;
      }
      return renderBlock(node as BlockNode);
    })
    .join('');
}

function renderBlock(node: BlockNode): string {
  switch (node.type) {
    case 'paragraph': {
      const inner = renderInline(node.content);
      return inner.trim() ? `<p>${inner}</p>` : '';
    }
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 6);
      return `<h${level}>${renderInline(node.content)}</h${level}>`;
    }
    case 'blockquote':
      return `<blockquote>${(node.content ?? []).map((n) => renderBlock(n as BlockNode)).join('')}</blockquote>`;
    case 'horizontalRule':
      return '<hr class="scene-break" />';
    case 'bulletList':
      return `<ul>${(node.content ?? []).map((n) => renderBlock(n as BlockNode)).join('')}</ul>`;
    case 'orderedList':
      return `<ol>${(node.content ?? []).map((n) => renderBlock(n as BlockNode)).join('')}</ol>`;
    case 'listItem':
      return `<li>${(node.content ?? []).map((n) => renderBlock(n as BlockNode)).join('')}</li>`;
    case 'hardBreak':
      return '<br />';
    case 'text':
      return renderInline([node as TextNode]);
    default:
      return renderInline(node.content);
  }
}

export function tiptapToHtml(doc: TiptapDoc | null | undefined): string {
  if (!doc?.content) return '';
  return doc.content.map((node) => renderBlock(node as unknown as BlockNode)).join('\n');
}

export interface ExportChapter {
  number: number;
  title: string;
  doc: TiptapDoc | null;
  text: string;
}

export function chapterHtml(chapter: ExportChapter, opts: { heading?: boolean } = {}): string {
  const heading =
    opts.heading === false
      ? ''
      : `<h1 class="chapter-title"><span class="chapter-number">Chapter ${chapter.number}</span>${escapeHtml(chapter.title)}</h1>`;
  return `<section class="chapter" id="ch-${chapter.number}">\n${heading}\n${tiptapToHtml(chapter.doc)}\n</section>`;
}

export { escapeHtml };
