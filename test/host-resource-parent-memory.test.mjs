import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { containmentLimits, effectiveUserServiceMemory } from '../src/host-resource-hook.mjs';

const GiB = 1024 ** 3;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'harness-parent-budget-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (scope, name, value) => {
    mkdirSync(join(root, scope), { recursive: true });
    writeFileSync(join(root, scope, name), String(value) + '\n');
  };
  return { root, write };
}

test('a 12 GiB VM with a 4 GiB user allocation cannot admit a VM-sized batch', t => {
  const { root, write } = fixture(t);
  write('', 'memory.max', 'max');
  write('user.slice', 'memory.high', 4 * GiB);
  write('user.slice', 'memory.max', 7 * GiB);
  write('user.slice/user-1000.slice/user@1000.service', 'memory.high', 'max');
  const memory = effectiveUserServiceMemory({ memory: 12 * GiB, uid: 1000, cgroupRoot: root });
  assert.equal(memory, 4 * GiB);
  assert.deepEqual(containmentLimits({ memory }), {
    CPUWeight: 20, MemoryMax: '2457M', MemorySwapMax: 0, TasksMax: 1024,
  });
});

test('the strictest actual destination ancestor wins, including its hard limit', t => {
  const { root, write } = fixture(t);
  write('', 'memory.max', 8 * GiB);
  write('user.slice', 'memory.high', 6 * GiB);
  write('user.slice/user-1000.slice', 'memory.max', 3 * GiB);
  write('user.slice/user-1000.slice/user@1000.service', 'memory.high', 2 * GiB);
  assert.equal(effectiveUserServiceMemory({ memory: 12 * GiB, uid: 1000, cgroupRoot: root }), 2 * GiB);
});

test('absent, unlimited and malformed native limits preserve the physical-memory fallback', t => {
  const { root, write } = fixture(t);
  write('user.slice', 'memory.high', 'max');
  write('user.slice', 'memory.max', '-1');
  write('user.slice/user-1000.slice', 'memory.high', 'not-a-limit');
  assert.equal(effectiveUserServiceMemory({ memory: 12 * GiB, uid: 1000, cgroupRoot: root }), 12 * GiB);
  assert.equal(effectiveUserServiceMemory({ memory: 12 * GiB, uid: undefined, cgroupRoot: root }), 12 * GiB);
});
