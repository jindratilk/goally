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
  { name: 'director', theme: 'dark', height: 1040, ready: 'Tell the manager something…' },
  { name: 'history', theme: 'light', width: 1680, height: 1320, ready: null },
  { name: 'activity', theme: 'dark', height: 1120, ready: 'Search' },
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
    const width = variant.width ?? 1440;
    const context = await browser.newContext({
      viewport: { width, height: variant.height }, deviceScaleFactor: 2,
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
    await page.goto(`${origin}/#/m/readme-fokly-onboarding/${variant.name}`, { waitUntil: 'load' });
    if (variant.ready) await page.getByPlaceholder(variant.ready, { exact: true }).waitFor();
    else if (variant.name === 'history') await page.getByText('All missions', { exact: true }).waitFor();
    else await page.getByRole('group', { name: 'Color theme', exact: true }).waitFor();
    await page.locator('aside').getByRole('button', { name: 'Board 15', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      const content = document.querySelector('main > :last-child');
      return content && getComputedStyle(content).transform === 'none';
    });

    // Assert real product behavior, rather than a separate drawing of that behavior.
    assert.equal(await page.title(), 'NO-GO · Fokly: onboarding');
    assert.equal(await page.locator('aside').getByRole('button', { name: 'Fokly: onboarding 5/20', exact: true }).count(), 1);
    assert.equal(await page.locator('aside').getByRole('button', { name: 'Menu bar controls 7/12', exact: true }).count(), 1);
    assert.equal(await page.locator('aside').getByRole('button', { name: 'Energy footprint 8/8', exact: true }).count(), 1);
    const global = variant.name === 'settings' || variant.name === 'history';
    if (!global) {
      assert.equal(await page.locator('header').getByText('~22 min left', { exact: true }).count(), 1);
      assert.equal(await page.locator('header').getByLabel('75% remaining', { exact: true }).count(), 1);
      assert.ok(!(await page.locator('header').innerText()).includes('proven'));
    }
    if (variant.name === 'board') {
      assert.equal(await page.locator('main').getByRole('button', { name: /^CT-\d+ ·/ }).count(), 20);
      const task = page.getByRole('button', { name: 'CT-6 · permissions Resume after System Settings permissions-agent · 5m 12s · 17 tools', exact: true });
      assert.equal(await task.count(), 1);
      // Exercise the real task sheet and filter, so filled cards have useful detail.
      await task.click();
      await page.getByRole('heading', { name: 'Resume after System Settings', exact: true }).waitFor();
      assert.equal(await page.getByText('swift test --filter PermissionReturnTests', { exact: true }).count(), 1);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('heading', { name: 'Resume after System Settings', exact: true }).waitFor({ state: 'hidden' });
      await page.getByPlaceholder('Filter tasks', { exact: true }).fill('download');
      assert.equal(await page.locator('main').getByRole('button', { name: /^CT-\d+ ·/ }).count(), 3);
      await page.getByPlaceholder('Filter tasks', { exact: true }).fill('');
      assert.equal(await page.locator('main').getByRole('button', { name: /^CT-\d+ ·/ }).count(), 20);
      await page.getByPlaceholder('Filter tasks', { exact: true }).blur();
      await page.waitForFunction(() => [...document.querySelectorAll('main button')].every((button) => getComputedStyle(button).transform === 'none'));
    }
    if (variant.name === 'director') {
      assert.equal(await page.getByRole('button', { name: 'Check now', exact: true }).count(), 1);
      assert.equal(await page.getByText('Verify the complete first-run handoff', { exact: true }).count(), 1);
      assert.equal(await page.getByText('Prevent overlapping download retries', { exact: true }).count(), 1);
      await page.getByRole('button', { name: 'Closed 1', exact: true }).click();
      await page.getByText('Keep setup state in the existing store', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Open 2', exact: true }).click();
      await page.getByText('Verify the complete first-run handoff', { exact: true }).waitFor();
      await page.getByText('Keep setup state in the existing store', { exact: true }).waitFor({ state: 'hidden' });
    }
    if (variant.name === 'history') {
      assert.equal(await page.locator('tbody tr').count(), 12);
      assert.equal(await page.locator('tbody').getByText('GO', { exact: true }).count(), 8);
      assert.equal(await page.getByText('78/108', { exact: true }).count(), 1);
      assert.equal(await page.locator('tbody').getByText('paused', { exact: true }).count(), 1);
    }
    if (variant.name === 'activity') {
      assert.equal(await page.getByRole('button', { name: 'Events 22', exact: true }).count(), 1);
      await page.getByRole('button', { name: 'Commands 14', exact: true }).click();
      assert.equal(await page.locator('tbody tr').count(), 14);
      await page.getByRole('button', { name: 'Events 22', exact: true }).click();
      await page.getByText('Reviewing keyboard focus after the menu bar popover opens.', { exact: true }).waitFor();
    }
    if (variant.name === 'settings') {
      assert.equal(await page.getByRole('button', { name: 'Light', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByRole('button', { name: 'Codex CLI found', exact: true }).getAttribute('aria-pressed'), 'true');
    }
    assert.deepEqual(failures, [], 'Renderer must not contact any live source or produce app errors.');
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => [...document.querySelectorAll('main button > span.absolute')].every((indicator) => getComputedStyle(indicator).transform === 'none' && getComputedStyle(indicator).opacity === '1'));
    // Finish finite transitions before export; freezing an exiting card at time zero
    // would preserve a transient layout that the settled application never shows.
    await page.evaluate(async () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const animations = document.getAnimations();
      await Promise.all(animations.filter((animation) => typeof animation.currentTime === 'number' && animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})));
      for (const animation of document.getAnimations()) {
        if (animation.effect?.getTiming().iterations === Infinity && typeof animation.currentTime === 'number') {
          animation.pause(); animation.currentTime = 0;
        }
      }
    });
    if (variant.name === 'history') {
      await page.waitForFunction(() => {
        const ticks = [...document.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')];
        return ticks.length === 12 && ticks.every((tick) => tick.textContent.trim().length > 0);
      });
      const labels = await page.locator('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value').evaluateAll((ticks) => ticks.map((tick) => ({ text: tick.textContent, left: tick.getBoundingClientRect().left, right: tick.getBoundingClientRect().right })));
      assert.equal(labels.some((label, i) => i > 0 && label.left < labels[i - 1].right + 3), false, `History chart labels must remain readable: ${JSON.stringify(labels)}`);
    }

    // Export the layout as a vector document, then rasterize it. No screen capture.
    await page.emulateMedia({ media: 'screen' });
    await page.addStyleTag({ content: ':root { print-color-adjust: exact; -webkit-print-color-adjust: exact; }' });
    const height = await page.evaluate(() => Math.max(innerHeight, document.documentElement.scrollHeight));
    const pdfPath = path.join(scratch, `${variant.name}.pdf`);
    await page.pdf({ path: pdfPath, width: `${width}px`, height: `${height}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    const { stdout: pdfText } = await run('pdftotext', ['-layout', pdfPath, '-']);
    assert.ok(pdfText.includes('Goally'), 'The rendered document must preserve the real application header.');
    if (!global) assert.ok(pdfText.includes('~22 min left'), 'The rendered header must show the real ETA.');
    if (variant.name === 'board') {
      assert.equal((pdfText.match(/CT-\d+\s+·/g) ?? []).length, 20, 'Every task must be present in the exported board.');
      assert.ok(pdfText.includes('Energy footprint'), 'The finished goals must also be visible in the exported sidebar.');
    }
    if (variant.name === 'history') assert.ok(pdfText.includes('78/108') && pdfText.includes('Energy footprint'), 'The complete mission history must be exported.');
    if (variant.name === 'director') assert.ok(!pdfText.includes('Keep setup state in the existing store'), 'Closed findings must not linger in the exported Open tab.');
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
