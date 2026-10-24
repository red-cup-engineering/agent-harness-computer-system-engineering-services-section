import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { serializedCommand } from '../src/host-resource-hook.mjs';

function run(t, original, timeout = 15_000) {
  const root = mkdtempSync(join(tmpdir(), 'requested-timeout-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lock = join(root, 'heavy.lock');
  writeFileSync(lock, '');
  const command = serializedCommand(original, { lock, wait: 1, nice: false, ionice: false });
  const started = performance.now();
  const result = spawnSync('bash', ['-c', command], {
    encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 65_536,
  });
  return { ...result, elapsed: performance.now() - started };
}

test('an admitted requested timeout finishes a TERM-ignoring process group and never retries it', t => {
  const result = run(t, `timeout 0.1s bash -c 'trap "" TERM; printf started; sleep 30'`);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 137);
  assert.equal(result.stdout, 'started');
  assert.ok(result.elapsed >= 9_000 && result.elapsed < 14_000, String(result.elapsed));
});

test('an explicit caller kill-after grace retains its native GNU timeout meaning', t => {
  const result = run(t, `timeout --kill-after=0.1s 0.1s bash -c 'trap "" TERM; printf started; sleep 30'`, 3_000);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 137);
  assert.equal(result.stdout, 'started');
  assert.ok(result.elapsed < 2_500, String(result.elapsed));
});

test('a command with no requested timeout keeps its ordinary execution and exit status', t => {
  const result = run(t, 'sleep 0.2; printf ordinary; exit 23', 3_000);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 23);
  assert.equal(result.stdout, 'ordinary');
});
