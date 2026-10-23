/**
 * DOCX export (T5.5): manuscript-style file with a title page, copyright, contents and one
 * heading per chapter, ready for editors or KDP's paperback manuscript route.
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  PageBreak,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { ExportChapter } from '../html/render';

export interface DocxInput {
  title: string;
  subtitle?: string | null;
  author: string;
  year: number;
  seriesTitle: string;
  partNumber: number;
  chapters: ExportChapter[];
  backMatterText: string;
}

const paragraph = (text: string, options: { italics?: boolean; spacing?: number } = {}) =>
  new Paragraph({
    children: [new TextRun({ text, italics: options.italics })],
    spacing: { after: options.spacing ?? 120 },
  });

/** Split the markdown-lite prose into paragraphs and scene breaks. */
function proseParagraphs(text: string): Paragraph[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (/^\*\s*\*\s*\*$/.test(block) || /^---+$/.test(block)) {
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '* * *' })],
          spacing: { before: 200, after: 200 },
        });
      }
      return new Paragraph({
        children: [new TextRun({ text: block.replace(/\s+/g, ' ') })],
        spacing: { after: 160 },
        indent: { firstLine: 400 },
      });
    });
}

export async function buildDocx(input: DocxInput): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 240 },
      children: [new TextRun({ text: input.seriesTitle.toUpperCase(), size: 20, characterSpacing: 60 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: input.title, bold: true, size: 56 })],
    }),
  ];

  if (input.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: input.subtitle, italics: true, size: 28 })],
      }),
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: `Book ${input.partNumber}`, size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [new TextRun({ text: input.author, size: 28 })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
    paragraph(`Copyright © ${input.year} ${input.author}. All rights reserved.`, { spacing: 200 }),
    paragraph(
      'This book was produced with the assistance of artificial intelligence and edited by the author.',
      { italics: true, spacing: 400 },
    ),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Contents' })],
      spacing: { after: 200 },
    }),
    ...input.chapters.map(
      (chapter) =>
        new Paragraph({
          children: [new TextRun({ text: `Chapter ${chapter.number} · ${chapter.title}` })],
          spacing: { after: 80 },
        }),
    ),
  );

  for (const chapter of input.chapters) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        children: [new TextRun({ text: `Chapter ${chapter.number}` })],
        spacing: { after: 120 },
      }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: chapter.title })],
        spacing: { after: 240 },
      }),
      ...proseParagraphs(chapter.text),
    );
  }

  if (input.backMatterText.trim()) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        children: [new TextRun({ text: 'Afterword' })],
      }),
      ...input.backMatterText
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => paragraph(block)),
    );
  }

  const doc = new Document({
    creator: input.author,
    title: input.title,
    description: `${input.seriesTitle} · Book ${input.partNumber}`,
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
