/** Offline Linux image smoke: real Chromium, embedded fonts, native canvas and ffmpeg. */
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { buildPrintHtml, composeCover, printFontCss } from '@booksaga/exporters';
import { closePdfBrowser, renderPdf } from '../lib/pdf';

try {
  if (!printFontCss().includes('data:font/ttf;base64,'))
    throw new Error('Embedded print fonts are missing');
  const html = buildPrintHtml({
    title: 'Container smoke',
    author: 'Test',
    seriesTitle: 'BookSaga',
    partNumber: 1,
    trim: '6x9',
    bleed: false,
    frontHtml: '',
    backHtml: '',
    chapters: [{ number: 1, title: 'One', html: '<p>Linux print and font smoke.</p>' }],
  });
  const pdf = await renderPdf(html, { widthIn: 6, heightIn: 9 });
  if (pdf.pages < 1 || !pdf.buffer.subarray(0, 4).equals(Buffer.from('%PDF')))
    throw new Error('Invalid PDF');
  const art = await sharp({
    create: { width: 400, height: 640, channels: 3, background: '#15223c' },
  })
    .png()
    .toBuffer();
  const cover = await composeCover({
    art,
    width: 400,
    height: 640,
    fontFamily: 'serif',
    layers: [
      {
        kind: 'title',
        text: 'BookSaga',
        x: 0.5,
        y: 0.3,
        w: 0.8,
        size: 0.08,
        align: 'center',
        color: '#ffffff',
      },
    ],
  });
  if ((await sharp(cover).metadata()).width !== 400) throw new Error('Invalid cover');
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
  console.log(
    JSON.stringify({
      chromiumPdf: true,
      pdfPages: pdf.pages,
      embeddedFonts: true,
      nativeCover: true,
      ffmpeg: true,
    }),
  );
} finally {
  await closePdfBrowser();
}
