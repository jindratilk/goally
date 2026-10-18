// Export the actual application with a fixed, public data source in a fresh browser.
// No desktop capture, user browser profile, live daemon or stored missions are used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const dashboard = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(dashboard, '../docs/images');
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'goally-public-render-'));
const dist = path.join(scratch, 'dist');
const check = process.argv.includes('--check');
const failures = [];
let browser;
let server;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const variants = [
  { name: 'board', theme: 'dark', height: 900, ready: 'Filter tasks' },
  { name: 'director', theme: 'dark', height: 900, ready: 'Tell the manager something…' },
  { name: 'settings', theme: 'light', height: 1480, ready: null },
];

try {
  await build({
    root: dashboard,
    configFile: path.join(dashboard, 'vite.config.ts'),
    logLevel: 'warn',
    plugins: [{
      name: 'public-readme-fixtures',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          assert.ok(html.includes('src="/src/main.tsx"'), 'Application entry changed; update the documentation build.');
          return html.replace('src="/src/main.tsx"', 'src="/readme/main.ts"');
        },
      },
    }],
    build: { outDir: dist, emptyOutDir: true },
  });

  server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.startsWith('/api/')) throw new Error(`Unexpected real API request: ${pathname}`);
      const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(dist + path.sep)) throw new Error('Invalid asset path');
      const bytes = await fs.readFile(file);
      res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(bytes);
    } catch (error) {
      failures.push(error.message);
      res.writeHead(404); res.end('No public render asset');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  if (!check) await fs.mkdir(output, { recursive: true });

  for (const variant of variants) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: variant.height }, deviceScaleFactor: 2,
      colorScheme: variant.theme, reducedMotion: 'reduce', serviceWorkers: 'block',
    });
    await context.route('**/*', (route) => {
      if (new URL(route.request().url()).origin !== origin) {
        failures.push(`Blocked non-render origin: ${route.request().url()}`);
        return route.abort();
      }
      return route.continue();
    });
    await context.addInitScript((theme) => localStorage.setItem('goally-theme', theme), variant.theme);
    const page = await context.newPage();
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
    await page.goto(`${origin}/#/m/readme-csv-export/${variant.name}`, { waitUntil: 'load' });
    if (variant.ready) await page.getByPlaceholder(variant.ready, { exact: true }).waitFor();
    else await page.getByRole('group', { name: 'Color theme', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      const content = document.querySelector('main > :last-child');
      return content && getComputedStyle(content).transform === 'none';
    });

    // Assert real product behavior, rather than a separate drawing of that behavior.
    assert.equal(await page.locator('aside').getByRole('button', { name: 'CSV export for reports 3/8', exact: true }).count(), 1);
    if (variant.name !== 'settings') {
      assert.equal(await page.locator('header').getByText('~14 min left', { exact: true }).count(), 1);
      assert.equal(await page.locator('header').getByLabel('63% remaining', { exact: true }).count(), 1);
      assert.ok(!(await page.locator('header').innerText()).includes('proven'));
    }
    if (variant.name === 'board') {
      assert.equal(await page.getByRole('button', { name: 'CT-4 · ui Add the export button to reports ui-agent · 2m 18s · 16 tools', exact: true }).count(), 1);
    }
    if (variant.name === 'director') {
      assert.equal(await page.getByRole('button', { name: 'Check now', exact: true }).count(), 1);
      assert.equal(await page.getByText('Download flow needs verification', { exact: true }).count(), 1);
    }
    if (variant.name === 'settings') {
      assert.equal(await page.getByRole('button', { name: 'Light', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByRole('button', { name: 'Codex CLI found', exact: true }).getAttribute('aria-pressed'), 'true');
    }
    assert.deepEqual(failures, [], 'Renderer must not contact any live source or produce app errors.');
    await page.evaluate(() => { for (const animation of document.getAnimations()) { if (typeof animation.currentTime === 'number') { animation.pause(); animation.currentTime = 0; } } });

    // Export the layout as a vector document, then rasterize it. No screen capture.
    await page.emulateMedia({ media: 'screen' });
    await page.addStyleTag({ content: ':root { print-color-adjust: exact; -webkit-print-color-adjust: exact; }' });
    const height = await page.evaluate(() => Math.max(innerHeight, document.documentElement.scrollHeight));
    const pdfPath = path.join(scratch, `${variant.name}.pdf`);
    await page.pdf({ path: pdfPath, width: '1440px', height: `${height}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    const { stdout: pdfText } = await run('pdftotext', ['-layout', pdfPath, '-']);
    assert.ok(pdfText.includes('Goally'), 'The rendered document must preserve the real application header.');
    if (variant.name !== 'settings') assert.ok(pdfText.includes('~14 min left'), 'The rendered header must show the real ETA.');
    const pngRoot = path.join(scratch, variant.name);
    await run('pdftoppm', ['-singlefile', '-png', '-r', '192', pdfPath, pngRoot], { timeout: 30000 });
    const png = await fs.readFile(pngRoot + '.png');
    const destination = path.join(output, `${variant.name}.png`);
    if (check) assert.ok(png.equals(await fs.readFile(destination)), `${variant.name}.png needs regeneration. Run npm run render:readme.`);
    else await fs.writeFile(destination, png);
    console.log(`${check ? 'Verified' : 'Rendered'} ${variant.name}.png from the real App · ${(png.length / 1024).toFixed(0)} KB`);
    await context.close();
  }
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await fs.rm(scratch, { recursive: true, force: true });
}
