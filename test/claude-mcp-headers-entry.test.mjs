import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../services/claude-code-harness-services-section/scripts/claude-mcp-headers.mjs', import.meta.url));

test('linking the headers helper, as a release probe links every claude-code export, does not run it', () => {
  const linked = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(script)}); process.stdout.write('linked')`], { encoding: 'utf8' });
  assert.equal(linked.status, 0, linked.stderr);
  assert.equal(linked.stdout, 'linked');
});

test('run as the headersHelper, it still refuses missing arguments', () => {
  const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^claude-mcp-headers: --url is required/m);
});
