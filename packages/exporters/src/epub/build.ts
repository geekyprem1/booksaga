/**
 * EPUB3 builder (T5.3).
 *
 * A hand-built package rather than a library: `mimetype` must be the first, STORED entry, and the
 * manifest has to match the spine exactly. Every XHTML file comes from the shared HTML renderer.
 */
import JSZip from 'jszip';
import { chapterHtml, displayTitle, escapeHtml, type ExportChapter } from '../html/render';

export interface EpubInput {
  /** Stable identifier for the dc:identifier (usually the book id). */
  id: string;
  title: string;
  subtitle?: string | null;
  author: string;
  language?: string;
  description?: string;
  seriesTitle: string;
  partNumber: number;
  chapters: ExportChapter[];
  /** Pre-rendered HTML for the front and back matter sections. */
  frontHtml: string;
  backHtml: string;
  cover?: { buffer: Buffer; mime: string } | null;
  /** `#rrggbb` accent for chapter labels and the part line. Pick one that reads on white. */
  accent?: string;
}

const xhtml = (title: string, body: string, extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css" />
  ${extra}
</head>
<body>
${body}
</body>
</html>`;

const styles = (
  accent: string,
) => `body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.55; margin: 0 5%; }
h1, h2 { font-family: Georgia, serif; line-height: 1.2; }
h1.chapter-title { margin: 2.5em 0 1.5em; font-size: 1.6em; page-break-before: always; }
.chapter-number { display: block; font-size: 0.55em; letter-spacing: 0.18em; text-transform: uppercase; color: ${accent}; margin-bottom: 0.4em; }
p { margin: 0 0 0.9em; text-indent: 1.4em; }
p:first-of-type, h1 + p { text-indent: 0; }
hr.scene-break { border: 0; text-align: center; margin: 1.6em 0; }
hr.scene-break::after { content: '* * *'; letter-spacing: 0.6em; }
blockquote { margin: 1.2em 2em; font-style: italic; }
.title-page { text-align: center; margin-top: 20%; }
.title-page .series-name { text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.8em; }
.title-page .book-title { font-size: 2.2em; margin: 0.4em 0; text-indent: 0; }
.title-page .book-part { text-transform: uppercase; letter-spacing: 0.3em; font-size: 0.8em; color: ${accent}; }
.title-page .book-part, .title-page .author { text-indent: 0; }
.title-page .book-genre { text-indent: 0; font-style: italic; margin-top: 2em; }
.copyright-page { font-size: 0.85em; margin-top: 30%; }
.copyright-page p { text-indent: 0; }
.copyright-page .reading-order-label { text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.85em; color: ${accent}; margin-top: 1.6em; }
.copyright-page .reading-order { list-style: none; padding-left: 0; }
.copyright-page .reading-order li { text-indent: 0; }
.copyright-page .reading-order li.current { font-weight: bold; }
.toc ol { list-style: none; padding-left: 0; }
.toc li { margin: 0.4em 0; text-indent: 0; }
.toc .toc-num { color: ${accent}; font-weight: bold; margin-right: 0.6em; }
.back-matter { margin-top: 15%; }
.back-matter p { text-indent: 0; }
.end-of-book { text-align: center; page-break-before: always; }
.end-of-book .end-mark { text-transform: uppercase; letter-spacing: 0.3em; color: ${accent}; }
.end-of-book .continued { font-style: italic; }`;

export async function buildEpub(input: EpubInput): Promise<Buffer> {
  const zip = new JSZip();

  // 1. mimetype — first entry, uncompressed.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. container
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  zip.file('OEBPS/styles.css', styles(input.accent ?? '#5b4636'));
  const frontHtml = input.frontHtml.replace(
    /href="#ch-(\d+)"/g,
    (_, number: string) => `href="chapter-${number.padStart(2, '0')}.xhtml#ch-${number}"`,
  );
  zip.file('OEBPS/front-matter.xhtml', xhtml('Front matter', frontHtml));
  zip.file('OEBPS/back-matter.xhtml', xhtml('Back matter', input.backHtml));

  const manifest: string[] = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="css" href="styles.css" media-type="text/css"/>',
    '<item id="front" href="front-matter.xhtml" media-type="application/xhtml+xml"/>',
    '<item id="back" href="back-matter.xhtml" media-type="application/xhtml+xml"/>',
  ];
  const spine: string[] = ['<itemref idref="front"/>'];

  for (const chapter of input.chapters) {
    const name = `chapter-${String(chapter.number).padStart(2, '0')}.xhtml`;
    zip.file(
      `OEBPS/${name}`,
      xhtml(`Chapter ${chapter.number}: ${displayTitle(chapter.title)}`, chapterHtml(chapter)),
    );
    manifest.push(
      `<item id="ch${chapter.number}" href="${name}" media-type="application/xhtml+xml"/>`,
    );
    spine.push(`<itemref idref="ch${chapter.number}"/>`);
  }
  spine.push('<itemref idref="back"/>');

  if (input.cover) {
    const ext = input.cover.mime === 'image/png' ? 'png' : 'jpg';
    zip.file(`OEBPS/images/cover.${ext}`, input.cover.buffer);
    manifest.push(
      `<item id="cover-image" href="images/cover.${ext}" media-type="${input.cover.mime}" properties="cover-image"/>`,
      '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
    );
    zip.file(
      'OEBPS/cover.xhtml',
      xhtml(
        'Cover',
        `<div style="text-align:center"><img src="images/cover.${ext}" alt="${escapeHtml(input.title)}" style="max-width:100%"/></div>`,
      ),
    );
    spine.unshift('<itemref idref="cover" linear="no"/>');
  }

  const navItems = input.chapters
    .map(
      (chapter) =>
        `<li><a href="chapter-${String(chapter.number).padStart(2, '0')}.xhtml">Chapter ${chapter.number}: ${escapeHtml(displayTitle(chapter.title))}</a></li>`,
    )
    .join('\n');

  zip.file(
    'OEBPS/nav.xhtml',
    xhtml(
      'Contents',
      `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navItems}</ol></nav>`,
      '',
    ),
  );

  zip.file(
    'OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:${input.id}"/></head>
  <docTitle><text>${escapeHtml(input.title)}</text></docTitle>
  <navMap>
${input.chapters
  .map(
    (chapter, index) => `    <navPoint id="np-${chapter.number}" playOrder="${index + 1}">
      <navLabel><text>Chapter ${chapter.number}: ${escapeHtml(displayTitle(chapter.title))}</text></navLabel>
      <content src="chapter-${String(chapter.number).padStart(2, '0')}.xhtml"/>
    </navPoint>`,
  )
  .join('\n')}
  </navMap>
</ncx>`,
  );

  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${input.id}</dc:identifier>
    <dc:title>${escapeHtml(input.title)}</dc:title>
    <dc:creator>${escapeHtml(input.author)}</dc:creator>
    <dc:language>${input.language ?? 'en'}</dc:language>
    <dc:description>${escapeHtml(input.description ?? '')}</dc:description>
    <dc:publisher>${escapeHtml(input.seriesTitle)}</dc:publisher>
    <meta property="dcterms:modified">${modified}</meta>
    <meta name="calibre:series" content="${escapeHtml(input.seriesTitle)}"/>
    <meta name="calibre:series_index" content="${input.partNumber}"/>
  </metadata>
  <manifest>
    ${manifest.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spine.join('\n    ')}
  </spine>
</package>`,
  );

  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
}
