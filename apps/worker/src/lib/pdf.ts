/**
 * Chromium print renderer for the print PDF (T5.4).
 *
 * One browser instance is reused for the worker's lifetime. `preferCSSPageSize` makes Chromium
 * honour the `@page { size }` the print template declares (trim + bleed).
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { PDFDocument } from 'pdf-lib';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch({
    // Docker installs Chromium at a fixed path; local dev uses the Playwright download.
    executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox'],
  });
  return browserPromise;
}

export async function closePdfBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  await browser.close();
  browserPromise = null;
}

export interface RenderedPdf {
  buffer: Buffer;
  pages: number;
}

/**
 * Paged.js polyfill: recto chapter starts with blank pages, page numbers in the TOC
 * (`target-counter`) and clean chapter openers. Chromium's own print engine ignores all three.
 */
// The package exports map hides dist/, so locate it relative to the resolved entry (lib/ or src/).
const PAGED_POLYFILL = join(dirname(createRequire(import.meta.url).resolve('pagedjs')), '..', 'dist', 'paged.polyfill.js');

export async function renderPdf(
  html: string,
  geometry: { widthIn: number; heightIn: number },
  options: { paged?: boolean } = {},
): Promise<RenderedPdf> {
  const paged = options.paged ?? true;
  try {
    return await renderOnce(html, geometry, paged);
  } catch (err) {
    if (!paged) throw err;
    // A typesetting quirk must never block an export: fall back to plain Chromium.
    console.warn('[pdf] Paged.js failed, using native print:', err instanceof Error ? err.message : err);
    return renderOnce(html, geometry, false);
  }
}

async function renderOnce(
  html: string,
  geometry: { widthIn: number; heightIn: number },
  paged: boolean,
): Promise<RenderedPdf> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'load' });
    if (paged) {
      await page.addScriptTag({ content: 'window.PagedConfig = { auto: false };' });
      await page.addScriptTag({ path: PAGED_POLYFILL });
      // A string keeps the DOM-only window out of the worker's (non-DOM) type environment.
      await page.evaluate('window.PagedPolyfill.preview()');
    }
    const pdf = await page.pdf({
      width: `${geometry.widthIn}in`,
      height: `${geometry.heightIn}in`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    const document = await PDFDocument.load(pdf);
    return { buffer: Buffer.from(pdf), pages: document.getPageCount() };
  } finally {
    await page.close();
  }
}
