// Renders amer-icon.html to amer-icon-master.png (1024x1024, transparent outside
// the rounded square). Usage: node tools/brand/amer/render_master.mjs
// Needs playwright-core and a Chromium (CHROME=/path/to/chrome).
import { chromium } from 'playwright-core';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.goto('file://' + path.join(here, 'amer-icon.html'));
await page.evaluate(() => document.fonts.ready);
await page.locator('#icon').screenshot({ path: path.join(here, 'amer-icon-master.png'), omitBackground: true });
await browser.close();
