import { renderPdf } from './src/lib/pdf.ts';

const html = `<!doctype html><html><head><style>
@page { size: 6in 9in; margin: 0.75in; }
body { font-family: Georgia, serif; font-size: 11pt; }
h1 { page-break-before: right; }
p { text-indent: 1.2em; }
</style></head><body>
<h1>Chapter 1</h1>
${'<p>The road narrowed where the pines closed in, and the wind carried the smell of wet stone. She counted the windows twice, but the third one was still dark.</p>'.repeat(80)}
<h1>Chapter 2</h1>
${'<p>Rain moved across the valley in slow grey sheets, erasing the far hills one by one.</p>'.repeat(80)}
</body></html>`;

const started = Date.now();
const result = await renderPdf(html, { widthIn: 6, heightIn: 9 });
console.log('pages:', result.pages, 'bytes:', result.buffer.length, 'ms:', Date.now() - started);
