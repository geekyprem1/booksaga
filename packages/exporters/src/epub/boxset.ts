/**
 * Box set EPUB (T6.4): several books of one series in a single file with a nested table of
 * contents (book → chapters) and a divider page per book.
 */
import JSZip from 'jszip';
import { chapterHtml, displayTitle, escapeHtml, type ExportChapter } from '../html/render';

export interface BoxSetBook {
  title: string;
  partNumber: number;
  subtitle?: string | null;
  blurb?: string;
  chapters: ExportChapter[];
}

export interface BoxSetInput {
  id: string;
  seriesTitle: string;
  boxTitle: string;
  author: string;
  language?: string;
  description?: string;
  books: BoxSetBook[];
  cover?: { buffer: Buffer; mime: string } | null;
}

const xhtml = (title: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body>
${body}
</body>
</html>`;

const STYLES = `body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.55; margin: 0 5%; }
h1, h2 { font-family: Georgia, serif; line-height: 1.2; }
h1.chapter-title { margin: 2.5em 0 1.5em; font-size: 1.6em; page-break-before: always; }
.chapter-number { display: block; font-size: 0.55em; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.7; margin-bottom: 0.4em; }
p { margin: 0 0 0.9em; text-indent: 1.4em; }
p:first-of-type, h1 + p { text-indent: 0; }
hr.scene-break { border: 0; text-align: center; margin: 1.6em 0; }
hr.scene-break::after { content: '* * *'; letter-spacing: 0.6em; }
blockquote { margin: 1.2em 2em; font-style: italic; }
.box-title { text-align: center; margin-top: 25%; }
.box-title .series-name { text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.8em; }
.box-title h1 { font-size: 2.2em; margin: 0.4em 0; }
.box-title .count { text-indent: 0; opacity: 0.75; }
.book-divider { text-align: center; margin-top: 30%; page-break-before: always; }
.book-divider .part { text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.8em; opacity: 0.7; }
.book-divider h1 { font-size: 2em; margin: 0.3em 0; }
.book-divider .blurb { text-indent: 0; margin-top: 2em; font-style: italic; }`;

export async function buildBoxSetEpub(input: BoxSetInput): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  zip.file('OEBPS/styles.css', STYLES);

  const manifest: string[] = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="css" href="styles.css" media-type="text/css"/>',
    '<item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>',
  ];
  const spine: string[] = ['<itemref idref="titlepage"/>'];

  zip.file(
    'OEBPS/titlepage.xhtml',
    xhtml(
      'Title page',
      `<section class="box-title">
  <p class="series-name">${escapeHtml(input.seriesTitle)}</p>
  <h1>${escapeHtml(input.boxTitle)}</h1>
  <p class="count">${input.books.length} books</p>
  <p>${escapeHtml(input.author)}</p>
</section>`,
    ),
  );

  const navBooks: string[] = [];
  const ncxPoints: string[] = [];
  let playOrder = 1;

  for (const [bookIndex, book] of input.books.entries()) {
    const bookSlug = `book-${String(bookIndex + 1).padStart(2, '0')}`;

    zip.file(
      `OEBPS/${bookSlug}.xhtml`,
      xhtml(
        `Book ${book.partNumber}`,
        `<section class="book-divider">
  <p class="part">Book ${book.partNumber}</p>
  <h1>${escapeHtml(book.title)}</h1>
  ${book.subtitle ? `<p class="blurb">${escapeHtml(book.subtitle)}</p>` : ''}
  ${book.blurb ? `<p class="blurb">${escapeHtml(book.blurb)}</p>` : ''}
</section>`,
      ),
    );
    manifest.push(
      `<item id="${bookSlug}" href="${bookSlug}.xhtml" media-type="application/xhtml+xml"/>`,
    );
    spine.push(`<itemref idref="${bookSlug}"/>`);

    const chapterLinks: string[] = [];
    for (const chapter of book.chapters) {
      const name = `${bookSlug}-ch-${String(chapter.number).padStart(2, '0')}.xhtml`;
      const id = `${bookSlug}-ch${chapter.number}`;

      zip.file(`OEBPS/${name}`, xhtml(`Chapter ${chapter.number}: ${chapter.title}`, chapterHtml(chapter)));
      manifest.push(`<item id="${id}" href="${name}" media-type="application/xhtml+xml"/>`);
      spine.push(`<itemref idref="${id}"/>`);

      chapterLinks.push(
        `<li><a href="${name}">Chapter ${chapter.number}: ${escapeHtml(displayTitle(chapter.title))}</a></li>`,
      );
      ncxPoints.push(`    <navPoint id="${id}" playOrder="${playOrder}">
      <navLabel><text>Book ${book.partNumber} · Chapter ${chapter.number}: ${escapeHtml(displayTitle(chapter.title))}</text></navLabel>
      <content src="${name}"/>
    </navPoint>`);
      playOrder += 1;
    }

    navBooks.push(`<li><a href="${bookSlug}.xhtml">Book ${book.partNumber}: ${escapeHtml(book.title)}</a>
  <ol>${chapterLinks.join('\n')}</ol>
</li>`);
  }

  zip.file(
    'OEBPS/nav.xhtml',
    xhtml(
      'Contents',
      `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navBooks.join('\n')}</ol></nav>`,
    ),
  );

  zip.file(
    'OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:${input.id}"/></head>
  <docTitle><text>${escapeHtml(input.boxTitle)}</text></docTitle>
  <navMap>
${ncxPoints.join('\n')}
  </navMap>
</ncx>`,
  );

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
        `<div style="text-align:center"><img src="images/cover.${ext}" alt="${escapeHtml(input.boxTitle)}" style="max-width:100%"/></div>`,
      ),
    );
    spine.unshift('<itemref idref="cover" linear="no"/>');
  }

  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${input.id}</dc:identifier>
    <dc:title>${escapeHtml(input.boxTitle)}</dc:title>
    <dc:creator>${escapeHtml(input.author)}</dc:creator>
    <dc:language>${input.language ?? 'en'}</dc:language>
    <dc:description>${escapeHtml(input.description ?? '')}</dc:description>
    <dc:publisher>${escapeHtml(input.seriesTitle)}</dc:publisher>
    <meta property="dcterms:modified">${modified}</meta>
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
