import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const bootstrap = fs.readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

for (const [preference, systemDark, expected] of [[null, false, false], [null, true, true], ['light', true, false], ['dark', false, true], ['system', true, true], ['invalid', false, false], ['blocked', true, true]]) {
  test(`first paint: preference=${preference}, systemDark=${systemDark}`, () => {
    const root = { dataset: {}, style: {}, classList: { toggle: (name, value) => { root[name] = value; } } };
    const meta = {};
    vm.runInNewContext(bootstrap, {
      localStorage: { getItem: () => { if (preference === 'blocked') throw new Error('Storage blocked'); return preference; } },
      matchMedia: () => ({ matches: systemDark }),
      document: { documentElement: root, querySelector: () => meta },
    });
    assert.equal(root.dark, expected);
    assert.equal(root.style.colorScheme, expected ? 'dark' : 'light');
    assert.equal(meta.content, expected ? '#191a17' : '#f7f7f4');
  });
}

test('appearance bootstrap loads before React and works with the daemon CSP', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('src="/theme-init.js"') < html.indexOf('src="/src/main.tsx"'));
  assert.ok(!html.includes('<script>'), 'Inline scripts are blocked by the production CSP');
});

const rgb = (hex) => hex.match(/[\da-f]{2}/gi).map((value) => parseInt(value, 16) / 255);
const luminance = (color) => color.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const light = css.match(/:root\s*\{([^}]+)\}/)[1];
const dark = css.match(/\.dark\s*\{([^}]+)\}/)[1];

for (const [name, source] of [['light', light], ['dark', dark]]) {
  const tokens = Object.fromEntries([...source.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map(([, key, value]) => [key, rgb(value)]));
  test(`${name}: primary, secondary and status text meet WCAG AA on their surfaces`, () => {
    for (const surface of ['background', 'card', 'muted', 'sidebar']) {
      for (const text of ['ink', 'muted-foreground', 'subtle', 'success', 'danger', 'warning']) {
        assert.ok(contrast(tokens[text], tokens[surface]) >= 4.5, `${text} on ${surface}: ${contrast(tokens[text], tokens[surface]).toFixed(2)}:1`);
      }
    }
    for (const status of ['success', 'danger', 'warning']) {
      const pill = tokens[status].map((v, i) => v * 0.1 + tokens.card[i] * 0.9);
      assert.ok(contrast(tokens[status], pill) >= 4.5, `${status} pill has insufficient text contrast`);
    }
  });
}
