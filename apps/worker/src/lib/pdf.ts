/**
 * Chromium print renderer for the print PDF (T5.4).
 *
 * One browser instance is reused for the worker's lifetime. `preferCSSPageSize` makes Chromium
 * honour the `@page { size }` the print template declares (trim + bleed).
 */
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

export async function renderPdf(
  html: string,
  geometry: { widthIn: number; heightIn: number },
): Promise<RenderedPdf> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'load' });
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
