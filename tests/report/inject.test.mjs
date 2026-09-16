import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';

test('inject_report.py --check: assets/report 와 quality-certificate.html 주입 구간이 최신이다(드리프트 없음)', () => {
  const r = spawnSync('python3', ['build/inject_report.py', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /변경 없음/);
});
