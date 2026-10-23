import { chromium } from 'playwright-core';

const exe = 'C:/Users/user/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
console.log('launching', exe);
const started = Date.now();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
console.log('launched in', Date.now() - started, 'ms');
const page = await browser.newPage();
await page.setContent('<h1>Hello</h1><p>Test</p>');
const pdf = await page.pdf({ width: '6in', height: '9in', printBackground: true });
console.log('pdf bytes:', pdf.length);
await browser.close();
console.log('closed');
