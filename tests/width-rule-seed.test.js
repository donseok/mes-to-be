'use strict';
/* 폭수축량 · 폭마진량 룰 시드 검증.
 *
 * 모듈 HTML 에 실제로 들어 있는 코드를 그대로 떼어 평가한다(사본 검증 아님).
 *   - SEED_REDUCTION / SEED_MARGIN  ← 마커 구간
 *   - evalText / evalNum / ruleMatches / sortRules  ← 두 번째 script 블록
 * 기대값은 원본 RuleData xlsx 를 손으로 읽어 옮긴 값이다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function readModule(file) {
  return fs.readFileSync(path.join(ROOT, 'modules', file), 'utf8');
}
function readSeed(html, varName) {
  const start = '/*__' + varName + '_START__*/';
  const end = '/*__' + varName + '_END__*/';
  const i = html.indexOf(start), j = html.indexOf(end);
  assert.ok(i >= 0 && j > i, '마커 없음: ' + varName);
  const body = html.slice(i + start.length, j).trim();
  const sandbox = {};
  vm.runInNewContext(body, sandbox);
  /* vm 컨텍스트의 Array 는 프로토타입이 달라 deepStrictEqual 이 실패한다 — 현재 realm 으로 옮긴다 */
  return JSON.parse(JSON.stringify(sandbox[varName]));
}
/* 모듈 2번째 script 블록에서 순수 평가 함수만 잘라 낸다 */
function readEngine(html) {
  const names = ['evalText', 'evalNum', 'ruleMatches', 'sortRules', 'listOf', 'norm'];
  const src = names.map((n) => {
    const re = new RegExp('^function ' + n + '\\(', 'm');
    const m = re.exec(html);
    assert.ok(m, '함수 없음: ' + n);
    let i = m.index, depth = 0, started = false;
    for (; i < html.length; i++) {
      if (html[i] === '{') { depth++; started = true; }
      else if (html[i] === '}') { depth--; if (started && depth === 0) { i++; break; } }
    }
    return html.slice(m.index, i);
  }).join('\n') + '\nthis.E={evalText:evalText,evalNum:evalNum,ruleMatches:ruleMatches,sortRules:sortRules,listOf:listOf,norm:norm};';
  const sandbox = {};
  vm.runInNewContext(src, sandbox);
  return sandbox.E;
}

const HTML_R = readModule('width-reduction.html');
const HTML_M = readModule('width-margin.html');
const SEED_R = readSeed(HTML_R, 'SEED_REDUCTION');
const SEED_M = readSeed(HTML_M, 'SEED_MARGIN');
const E = readEngine(HTML_R);

function byKey(procs, proc) {
  const p = procs.find((x) => x.proc === proc);
  assert.ok(p, '공정 없음: ' + proc);
  return p;
}
/* 조건을 만족하는 룰을 우선순위→순번 순으로 정렬해 첫 룰을 적용한다 */
function decide(proc, input) {
  const p = proc;
  const hits = p.rules
    .filter((r) => r.status === 'Y' && E.ruleMatches(p, r, input))
    .sort(E.sortRules);
  return { applied: hits[0] || null, hits };
}

/* ── 시드 구조 ─────────────────────────────────────────── */
test('시드: 폭수축량은 PLTCM·CGL·EGL·정전·CCL 5개 공정이 한 프로그램에 묶여 있다', () => {
  assert.deepEqual(SEED_R.processes.map((p) => p.proc), ['PLTCM', 'CGL', 'EGL', 'JZ', 'CCL']);
  assert.deepEqual(
    SEED_R.processes.map((p) => p.ruleId),
    ['C10B1074', 'C10B1075', 'C10B1076', 'C10B1077', 'C10B1078']);
  assert.equal(SEED_R.processes.reduce((a, p) => a + p.rules.length, 0), 186);
});

test('시드: 폭마진량은 PLTCM·정전 2개 공정이 한 프로그램에 묶여 있다', () => {
  assert.deepEqual(SEED_M.processes.map((p) => p.proc), ['PLTCM', 'JZ']);
  assert.deepEqual(SEED_M.processes.map((p) => p.ruleId), ['C10B1073', 'C10B1079']);
  assert.equal(SEED_M.processes.reduce((a, p) => a + p.rules.length, 0), 59);
});

test('시드: 업무기준 원본 값(버전·유형·상태·시작일자·결과)을 보존한다', () => {
  const m = byKey(SEED_M.processes, 'PLTCM');
  assert.equal(m.ruleId, 'C10B1073');
  assert.equal(m.name, 'PLTCM폭마진량');
  assert.equal(m.version, '1.0');
  assert.equal(m.type, '1B0');
  assert.equal(m.status, 'Y');
  assert.equal(m.startAt, '2012-03-19 15:21:02');
  assert.equal(m.result, '마진폭');

  const j = byKey(SEED_M.processes, 'JZ');
  assert.equal(j.ruleId, 'C10B1079');
  assert.equal(j.name, '정전폭마진량');
  assert.equal(j.version, '1.2', 'C10B1079 는 버전 1.2');
  assert.equal(j.startAt, '2015-09-03 14:07:14');
});

test('시드: 공정별 조건 항목 수가 원본 시트 헤더와 같다', () => {
  const want = {
    'C10B1073': 4, 'C10B1074': 3, 'C10B1075': 6,
    'C10B1076': 6, 'C10B1077': 4, 'C10B1078': 4, 'C10B1079': 8
  };
  [...SEED_R.processes, ...SEED_M.processes].forEach((p) => {
    assert.equal(p.fields.length, want[p.ruleId], p.ruleId);
  });
});

/* ── 폭수축량 판정 (C10B1074 PLTCM) ────────────────────── */
test('폭수축량 PLTCM: 원자재 H32 두께 0.23 폭 800 → 순번 1 폭감소량 2', () => {
  const p = byKey(SEED_R.processes, 'PLTCM');
  const d = decide(p, { rawCd: 'H32', pltcmThk: '0.23', pltcmWid: '800' });
  assert.equal(d.applied.id, 'WR-PLTCM-001');
  assert.equal(d.applied.no, 1);
  assert.equal(d.applied.res, 2);
});

test('폭수축량 PLTCM: BETWEEN1 경계 — 두께 0.249 는 순번 1(상한 포함), 0.6 은 순번 4', () => {
  const p = byKey(SEED_R.processes, 'PLTCM');
  assert.equal(decide(p, { rawCd: 'H32', pltcmThk: '0.249', pltcmWid: '800' }).applied.no, 1);
  assert.equal(decide(p, { rawCd: 'H32', pltcmThk: '0.6', pltcmWid: '800' }).applied.no, 4);
});

test('폭수축량 PLTCM: 폭 1100.9 는 순번 2, 1101 은 순번 3 (폭 3)', () => {
  const p = byKey(SEED_R.processes, 'PLTCM');
  assert.equal(decide(p, { rawCd: 'H32', pltcmThk: '0.3', pltcmWid: '1100.9' }).applied.res, 2);
  assert.equal(decide(p, { rawCd: 'H32', pltcmThk: '0.3', pltcmWid: '1101' }).applied.res, 3);
});

test('폭수축량 PLTCM: E32 는 조건 없이 폭감소량 0 — 범위 체크 전에 잡힌다', () => {
  const p = byKey(SEED_R.processes, 'PLTCM');
  /* 원본 no.22(IN E32 · 두께/폭 NOT_CHECK) 가 no.28(0.5~0.7 · 910~1220) 보다 앞서 잡힌다 */
  const d = decide(p, { rawCd: 'E32', pltcmThk: '0.6', pltcmWid: '1000' });
  assert.equal(d.applied.id, 'WR-PLTCM-022');
  assert.equal(d.applied.no, 22);
  assert.equal(d.applied.res, 0);
});

/* ── 폭수축량 판정 (C10B1075 CGL) ─────────────────────── */
test('폭수축량 CGL: 공정 84 · 품명 L · 재질 EA · 원자재 H36 두께 0.5 폭 1000 → 순번 1, 감소 0', () => {
  const p = byKey(SEED_R.processes, 'CGL');
  const d = decide(p, { procCd: '84', prodCd: 'L', matCd: 'EA', rawCd: 'H36', pltcmThk: '0.5', prodWid: '1000' });
  assert.equal(d.applied.id, 'WR-CGL-001');
  assert.equal(d.applied.no, 1);
  assert.equal(d.applied.res, 0);
});

test('폭수축량 CGL: 재질 5A 두께 0.3 폭 1000 → 순번 15 폭감소량 7', () => {
  const p = byKey(SEED_R.processes, 'CGL');
  const d = decide(p, { procCd: '82', prodCd: 'L', matCd: '5A', rawCd: '', pltcmThk: '0.3', prodWid: '1000' });
  assert.equal(d.applied.no, 15);
  assert.equal(d.applied.res, 7);
});

test('폭수축량 CGL: 재질 4A 두께 0.4 폭 1000 → 순번 12 폭감소량 5 (0.2 ≤ t < 0.6)', () => {
  const p = byKey(SEED_R.processes, 'CGL');
  const d = decide(p, { procCd: '82', prodCd: 'L', matCd: '4A', rawCd: '', pltcmThk: '0.4', prodWid: '1000' });
  assert.equal(d.applied.no, 12);
  assert.equal(d.applied.res, 5);
});

test('폭수축량 CGL: 원자재 코드 조건이 있는 룰은 지정 원자재에서만 매칭된다', () => {
  const p = byKey(SEED_R.processes, 'CGL');
  const a = decide(p, { procCd: '82', prodCd: 'L', matCd: 'CA', rawCd: 'H35', pltcmThk: '1.0', prodWid: '1000' });
  assert.equal(a.applied.no, 17, 'CA + H35 → 순번 17');
  assert.equal(a.applied.res, 3);
  const b = decide(p, { procCd: '82', prodCd: 'L', matCd: 'CA', rawCd: 'ZZZ', pltcmThk: '1.0', prodWid: '1000' });
  assert.equal(b.applied, null, 'CA 는 원자재 조건이 있는 룰만 있어 ZZZ 는 매칭 없음');
});

test('폭수축량 CGL: 평가 순서는 우선순위 → 순번 이다 (순번 1·2·3 이 우선순위 1)', () => {
  const p = byKey(SEED_R.processes, 'CGL');
  const withPrio = p.rules.filter((r) => r.no <= 3);
  assert.deepEqual(withPrio.map((r) => r.prio), [1, 1, 1]);
  const d = decide(p, { procCd: '84', prodCd: 'W', matCd: '', rawCd: 'H36', pltcmThk: '0.5', prodWid: '1000' });
  assert.equal(d.applied.no, 2, '재질 체크 안 함 → 순번 2');
});

/* ── 폭수축량 판정 (C10B1076 EGL · C10B1077 정전 · C10B1078 CCL) ── */
test('폭수축량 EGL: 공정 92 · H7J 두께 0.7 폭 900 → 순번 1 폭감소량 4', () => {
  const p = byKey(SEED_R.processes, 'EGL');
  const d = decide(p, { procCd: '92', prodCd: '2', matCd: '5A', rawCd: 'H7J', pltcmThk: '0.7', prodWid: '900' });
  assert.equal(d.applied.id, 'WR-EGL-001');
  assert.equal(d.applied.res, 4);
});

test('폭수축량 EGL: NOT_IN(N25,N32,N70) — 도금 원자재면 0, 일반 원자재면 2', () => {
  const p = byKey(SEED_R.processes, 'EGL');
  const a = decide(p, { procCd: '91', prodCd: 'E', matCd: '1A', rawCd: 'N25', pltcmThk: '0.5', prodWid: '1000' });
  assert.equal(a.applied.res, 0, 'N25 는 NOT_IN 에 걸려 감소 없음');
  const b = decide(p, { procCd: '91', prodCd: 'E', matCd: '1A', rawCd: 'H32', pltcmThk: '0.5', prodWid: '1000' });
  assert.equal(b.applied.res, 2);
});

test('폭수축량 정전: 품명 A 두께 1.0 폭 1000 → 폭감소량 2 (재질 무관 룰)', () => {
  const p = byKey(SEED_R.processes, 'JZ');
  const d = decide(p, { prodCd: 'A', matCd: '', pltcmThk: '1.0', prodWid: '1000' });
  assert.equal(d.applied.id, 'WR-JZ-001');
  assert.equal(d.applied.res, 2);
});

test('폭수축량 정전: 두께 3.3 은 순번 2 를 넘어 순번 3(0)이 적용된다', () => {
  const p = byKey(SEED_R.processes, 'JZ');
  assert.equal(decide(p, { prodCd: 'A', matCd: '', pltcmThk: '3.3', prodWid: '1000' }).applied.res, 0);
  assert.equal(decide(p, { prodCd: 'A', matCd: '', pltcmThk: '3.2', prodWid: '1000' }).applied.res, 2, '3.2 는 BETWEEN1 상한 포함');
});

test('폭수축량 CCL: 두께 0.24~3.01 폭 460~1600 는 순번 1(0)이 먼저 잡는다', () => {
  const p = byKey(SEED_R.processes, 'CCL');
  /* 원본 no.1 이 전 범위 기본 룰이고 no.2(품명 2·재질 5A → 1mm) 가 뒤에 있다.
     우선순위 열이 모두 공란이라 순번 순으로 평가되어 no.1 이 먼저 적용된다. */
  const a = decide(p, { prodCd: '', matCd: '', pltcmThk: '1.0', prodWid: '1000' });
  assert.equal(a.applied.no, 1);
  assert.equal(a.applied.res, 0);
  const b = decide(p, { prodCd: '2', matCd: '5A', pltcmThk: '0.5', prodWid: '1000' });
  assert.equal(b.applied.no, 1, '순번 1 이 먼저 — 원본 순서대로');
  assert.equal(b.applied.res, 0);
  assert.ok(b.hits.some((r) => r.no === 2), '순번 2 는 후보로 함께 매칭된다');
});

/* ── 폭마진량 판정 (C10B1073 PLTCM) ───────────────────── */
test('폭마진량 PLTCM: 고객사·두께·폭을 모두 비우면 매칭 없음 (IN 항목에 공백은 안 맞는다)', () => {
  const p = byKey(SEED_M.processes, 'PLTCM');
  /* 원본 no.1 은 고객사 IN(603349,205202,605263) 이고 나머지는 두께·폭 BETWEEN 이다.
     세 값을 다 비우면 어떤 룰에도 맞지 않는다 — 목업은 마진 0 으로 안내한다. */
  const d = decide(p, { rawCd: 'H32', rawThk: '', pltcmWid: '', cust: '' });
  assert.equal(d.applied, null);
  assert.equal(d.hits.length, 0);
});

test('폭마진량 PLTCM: 두께 2.0 폭 700 → 순번 2 마진 10', () => {
  const p = byKey(SEED_M.processes, 'PLTCM');
  const d = decide(p, { rawCd: 'H32', rawThk: '2.0', pltcmWid: '700', cust: '' });
  assert.equal(d.applied.id, 'WM-PLTCM-002');
  assert.equal(d.applied.res, 10);
});

test('폭마진량 PLTCM: H70 두께 2.0 폭 700 → 순번 14 마진 11', () => {
  const p = byKey(SEED_M.processes, 'PLTCM');
  const d = decide(p, { rawCd: 'H70', rawThk: '2.0', pltcmWid: '700', cust: '' });
  assert.equal(d.applied.id, 'WM-PLTCM-014');
  assert.equal(d.applied.res, 11);
});

test('폭마진량 PLTCM: HMN 두께 3.0 폭 700 → 순번 33 마진 12 (최우선 seq)', () => {
  const p = byKey(SEED_M.processes, 'PLTCM');
  const d = decide(p, { rawCd: 'HMN', rawThk: '3.0', pltcmWid: '700', cust: '' });
  assert.equal(d.applied.no, 33);
  assert.equal(d.applied.res, 12);
});

test('폭마진량 PLTCM: 고객사 조건이 지정된 룰은 그 고객일 때만 우선한다', () => {
  const p = byKey(SEED_M.processes, 'PLTCM');
  const a = decide(p, { rawCd: 'H32', rawThk: '2.0', pltcmWid: '700', cust: '603349' });
  assert.equal(a.applied.id, 'WM-PLTCM-001');
  assert.equal(a.applied.res, 10);
  const b = decide(p, { rawCd: 'H32', rawThk: '2.0', pltcmWid: '700', cust: '999999' });
  assert.equal(b.applied.id, 'WM-PLTCM-002', '고객사 불일치 → 순번 2');
});

test('폭마진량 PLTCM: C32·N25 는 마진 0 (폭·두께 조건 무시)', () => {
  const p = byKey(SEED_M.processes, 'PLTCM');
  assert.equal(decide(p, { rawCd: 'C32', rawThk: '2.0', pltcmWid: '700', cust: '' }).applied.res, 0);
  assert.equal(decide(p, { rawCd: 'N25', rawThk: '2.0', pltcmWid: '700', cust: '' }).applied.res, 0);
});

/* ── 폭마진량 판정 (C10B1079 정전) ───────────────────── */
test('폭마진 정전: CCLBOM 이 VL 로 시작하면 우선순위 1 마진 20', () => {
  const p = byKey(SEED_M.processes, 'JZ');
  const d = decide(p, { edge: '', prodCd: '1', prodForm: '', coatWay: '', resin: '', thk: '', bom: 'VL001', spangle: '' });
  assert.equal(d.applied.id, 'WM-JZ-001');
  assert.equal(d.applied.prio, 1);
  assert.equal(d.applied.res, 20);
});

test('폭마진 정전: BOM 이 UT0C6S 면 순번 3(우선순위 2) 마진 16', () => {
  const p = byKey(SEED_M.processes, 'JZ');
  const d = decide(p, { edge: '', prodCd: '', prodForm: '', coatWay: '', resin: '', thk: '', bom: 'UT0C6S', spangle: '' });
  assert.equal(d.applied.id, 'WM-JZ-003');
  assert.equal(d.applied.res, 16);
});

test('폭마진 정전: 수지타입 CC + Edge S 는 마진 13, Edge M 이면 0 (원본 no.6·no.7)', () => {
  const p = byKey(SEED_M.processes, 'JZ');
  const s = decide(p, { edge: 'S', prodCd: '1', prodForm: '', coatWay: '', resin: 'CC', thk: '', bom: '', spangle: '' });
  assert.equal(s.applied.id, 'WM-JZ-006');
  assert.equal(s.applied.res, 13, 'Edge 지정 + 수지 CC → 13');
  const m = decide(p, { edge: 'M', prodCd: '1', prodForm: '', coatWay: '', resin: 'CC', thk: '', bom: '', spangle: '' });
  assert.equal(m.applied.id, 'WM-JZ-007');
  assert.equal(m.applied.res, 0, 'Edge 미지정 + 수지 CC → 0');
  const notHb = decide(p, { edge: 'M', prodCd: '1', prodForm: '', coatWay: '', resin: 'ZZ', thk: '', bom: '', spangle: '' });
  assert.equal(notHb.applied.id, 'WM-JZ-008', 'NOT_IN(HB) → 순번 8');
  assert.equal(notHb.applied.res, 0);
  const edgeOnly = decide(p, { edge: 'S', prodCd: '1', prodForm: '', coatWay: '', resin: 'ZZ', thk: '', bom: '', spangle: '' });
  assert.equal(edgeOnly.applied, null, 'Edge S + 수지 CC 아님 + BOM 없음 → 매칭 없음');
});

test('폭마진 정전: 마진 최대값 46 (UH0K7U · X/Y/Z · 두께 0.2~2.5)', () => {
  const p = byKey(SEED_M.processes, 'JZ');
  const d = decide(p, { edge: 'S', prodCd: '1', prodForm: 'S', coatWay: 'X', resin: '', thk: '1.0', bom: 'UH0K7U', spangle: '' });
  assert.equal(d.applied.no, 20);
  assert.equal(d.applied.res, 46);
});

/* ── 원본 보존 · 평가 순서 ─────────────────────────────── */
test('원본 보존: NOT_CHECK 인데 비교값이 남은 8건을 그대로 두고 표시만 한다', () => {
  const stray = [];
  [...SEED_R.processes, ...SEED_M.processes].forEach((p) => {
    p.rules.forEach((r) => { if (r.stray) stray.push(r.id); });
  });
  assert.equal(stray.length, 8);
  assert.deepEqual(stray.slice().sort(), [
    'WM-JZ-006', 'WM-JZ-007', 'WR-CCL-002', 'WR-CGL-131',
    'WR-PLTCM-029', 'WR-PLTCM-030', 'WR-PLTCM-031', 'WR-PLTCM-032'
  ]);
});

test('평가 순서: 우선순위 오름차순 → 순번 오름차순', () => {
  const a = { prio: 1, no: 5, id: 'B' };
  const b = { prio: 1, no: 2, id: 'A' };
  const c = { prio: 0, no: 9, id: 'C' };
  assert.deepEqual([a, b, c].sort(E.sortRules).map((r) => r.id), ['C', 'A', 'B']);
});

test('평가 순서: 원본 우선순위 열이 순번과 모순되지 않는다 (앞선 룰이 항상 먼저)', () => {
  [...SEED_R.processes, ...SEED_M.processes].forEach((p) => {
    for (let i = 1; i < p.rules.length; i++) {
      assert.ok(p.rules[i].prio >= p.rules[i - 1].prio,
        p.ruleId + ' no.' + p.rules[i].no + ' 우선순위가 앞선 룰보다 작다');
    }
  });
});

test('룰 id 는 공정별로 유일하다', () => {
  [...SEED_R.processes, ...SEED_M.processes].forEach((p) => {
    const ids = p.rules.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, p.ruleId);
    ids.forEach((id) => assert.match(id, /^(WR|WM)-[A-Z]+-\d{3}$/, id));
  });
});

test('연산자 대소문자: 원본의 소문자 between1 도 대문자로 정규화되어 있다', () => {
  const p = byKey(SEED_R.processes, 'CGL');
  const lower = p.rules.filter((r) => JSON.stringify(r.cond).match(/"(between|in|not_in)[^"]*"/i)
    && !JSON.stringify(r.cond).match(/"(BETWEEN|IN|NOT_IN)[^"]*"/));
  assert.equal(lower.length, 0, '소문자 연산자가 남아 있다');
});
