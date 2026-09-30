const TEST_RE = /(^|[\s;&|(])(npx\s+|pnpm\s+(exec\s+)?|yarn\s+|bunx?\s+)?(vitest|jest|mocha|ava|pytest|playwright\s+test|cypress\s+run|rspec|phpunit|go\s+test|cargo\s+test|swift\s+test|deno\s+test|node\s+--test|bun\s+test|xcodebuild\s+test)\b|(^|[\s;&|(])(npm|pnpm|yarn|bun)\s+(run\s+)?test(:\S+)?\b/;
const TARGETED_RE = /(\s-t\s|\s-k\s|--grep|--testNamePattern|--filter|::|\s[\w./@-]+\.(test|spec)\.[cm]?[jt]sx?\b|\s[\w./@-]*tests?\/[\w./-]+|\s[\w./-]+_test\.(go|py)\b|\stest_[\w]+\.py\b|--project\s|\s--\s+\S)/;
const GIT_COMMIT_RE = /\bgit\s+(commit|push)\b/;
const DEPLOY_RE = /\b(vercel\s+(deploy|--prod)|wrangler\s+deploy|fly\s+deploy|netlify\s+deploy|gh\s+pr\s+create)\b/;
const LINT_RE = /\b(eslint|biome\s+check|ruff|tsc\s+--noEmit|prettier\s+--check)\b/;

/** Built-in patterns for passive full-build detection (stats / Goal Director evidence). Not user-configurable. */
export const FULL_BUILD_PATTERNS = [
  'npm run build', 'pnpm build', 'pnpm run build', 'yarn build', 'bun run build',
  'next build', 'vite build', 'turbo build', 'turbo run build', 'nx build',
  'cargo build --release', 'xcodebuild', 'gradle build', './gradlew build',
  'tsc -b', 'make all', 'docker build',
];

export function isFullBuild(command, patterns = FULL_BUILD_PATTERNS) {
  const c = ` ${String(command || '').toLowerCase()} `;
  return patterns.some((p) => p && c.includes(` ${p.toLowerCase()}`));
}

export function classifyCommand(command, fullBuildPatterns = FULL_BUILD_PATTERNS) {
  const c = String(command || '');
  if (TEST_RE.test(c)) return { kind: 'test', targeted: TARGETED_RE.test(` ${c}`) };
  if (isFullBuild(c, fullBuildPatterns)) return { kind: 'build', full: true };
  if (GIT_COMMIT_RE.test(c)) return { kind: 'git' };
  if (DEPLOY_RE.test(c)) return { kind: 'deploy' };
  if (LINT_RE.test(c)) return { kind: 'lint' };
  return { kind: 'other' };
}

export function parseExitCode(toolOutput) {
  if (toolOutput == null) return null;
  let v = toolOutput;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      const m = /exit(?:\s*code)?[:=\s]+(-?\d+)/i.exec(v);
      return m ? Number(m[1]) : null;
    }
  }
  if (typeof v !== 'object') return null;
  for (const key of ['exitCode', 'exit_code', 'code', 'status']) {
    if (typeof v[key] === 'number') return v[key];
  }
  if (v.result && typeof v.result === 'object') return parseExitCode(v.result);
  return null;
}

const TAG_RE = /\b(CT-\d+)\b/i;

export function taskTag(text) {
  const m = TAG_RE.exec(String(text || ''));
  return m ? m[1].toUpperCase() : null;
}
