'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../assets/pltcm-thickness-engine.js');

/* ── 테스트 헬퍼 (Task 2에서도 그대로 쓴다) ── */
function near(a, b, msg) { assert.ok(Math.abs(a - b) < 1e-12, (msg || '') + ' ' + a + ' ≉ ' + b); }
function codes(r) { return r.warnings.map(function (w) { return w.code; }).sort(); }
function hasCodes(r, expected) { expected.forEach(function (c) { assert.ok(codes(r).indexOf(c) >= 0, '경고 ' + c + ' 없음: ' + codes(r)); }); }
function setRule(over) { return Object.assign({ id: 'TS-001', no: 1, status: 'Y', cond: {}, adj: 0, unit: 'CRN' }, over || {}); }
function spRule(over) { return Object.assign({ id: 'SP-001', no: 1, status: 'Y', cond: {}, rate: 0 }, over || {}); }
function tolRule(over) { return Object.assign({ id: 'TOL-001', no: 1, status: 'Y', cond: {}, llv: -0.015, ulv: 0.015 }, over || {}); }
function crit(o) {
  o = o || {};
  return {
    setCorrection: { defs: null, rules: o.set || [] },
    spCorrection: { defs: null, rules: o.sp || [] },
    thkTolerance: { defs: null, rules: o.tol === undefined ? [tolRule()] : o.tol }
  };
}
function order(over) {
  return Object.assign({
    PRD_NM_CD: 'G', SPC_ORG_CD: 'KS', SPC_AVR: 'KSG-SGCC', ORD_USG_CD: '', FNL_CUS_CD: '',
    ORD_THK_TP: '1', ORD_THK_MNG_CD: 'D', GW_ASG_CD: '',
    ORD_EXC_THK: 0.5, ORD_EXC_WTH: 1000, ORD_SLIT_GRP_CNT: 0, ORD_MIX_WTH: [],
    MAT_CD: '1A', ORD_SPNL_TP: '4'
  }, over || {});
}
function input(o, req, layers) {
  return { order: order(o), request: req || { value: 0, unit: '' },
           layers: Object.assign({ galThkUm: 0, paintFrontUm: 0, paintBackUm: 0 }, layers || {}) };
}

/* ── 유틸 ── */
test('truncate3: 해설서 4.3 절삭 · 지수 표기 · 음수 · 정수', () => {
  assert.equal(E.truncate3(0.2029), 0.202);
  assert.equal(E.truncate3(0.60863), 0.608);
  assert.equal(E.truncate3(0.48686399999999996), 0.486);
  assert.equal(E.truncate3(0.45499999999999996), 0.454);
  assert.equal(E.truncate3(1), 1);
  assert.equal(E.truncate3(0.47), 0.47);
  const out = { warnings: [] };
  assert.equal(E.truncate3(1e-7, out), 0);
  assert.deepEqual(out.warnings, ['W_EXP_NOTATION']);
  const out2 = { warnings: [] };
  assert.equal(E.truncate3(-0.4549, out2), -0.454);
  assert.deepEqual(out2.warnings, ['W_NEGATIVE']);
  assert.ok(Number.isNaN(E.truncate3('abc')));
});

test('snapSet: 해설서 4.2 대응표 · 0.998 · 음수', () => {
  const table = { 0.540: 0.540, 0.541: 0.540, 0.542: 0.540, 0.543: 0.545, 0.544: 0.545, 0.545: 0.545,
                  0.546: 0.545, 0.547: 0.545, 0.548: 0.550, 0.549: 0.550 };
  Object.keys(table).forEach(function (k) { assert.equal(E.snapSet(Number(k)), table[k], 'snapSet(' + k + ')'); });
  assert.equal(E.snapSet(0.998), 1);
  assert.equal(E.snapSet(0.202), 0.2);
  assert.equal(E.snapSet(0.203), 0.205);
  assert.equal(E.snapSet(0), 0);
  const out = { warnings: [] };
  assert.equal(E.snapSet(-0.454, out), -0.455);
  assert.deepEqual(out.warnings, ['W_NEGATIVE']);
});

test('round4', () => {
  assert.equal(E.round4(0.5 - 0.02 + 0.003), 0.483);
  assert.equal(E.round4(0.48336), 0.4834);
  assert.equal(E.round4(0.48334), 0.4833);
});

test('applyWidth: 슬리팅 합계 · 주문폭 · 합계 0 경고', () => {
  assert.equal(E.applyWidth({ ORD_SLIT_GRP_CNT: 2, ORD_MIX_WTH: [600, 500], ORD_EXC_WTH: 1200 }), 1100);
  assert.equal(E.applyWidth({ ORD_SLIT_GRP_CNT: 0, ORD_MIX_WTH: [600], ORD_EXC_WTH: 1200 }), 1200);
  assert.equal(E.applyWidth({ ORD_SLIT_GRP_CNT: '0', ORD_EXC_WTH: '1219' }), 1219);
  const out = { warnings: [] };
  assert.equal(E.applyWidth({ ORD_SLIT_GRP_CNT: 2, ORD_MIX_WTH: [], ORD_EXC_WTH: 1200 }, out), 0);
  assert.deepEqual(out.warnings, ['W_SLIT_WIDTH_ZERO']);
});

/* ── 매처: 압연두께Set보정관리 evalText·evalNum 과 같은 표 ── */
function mk(cond) { return { defs: [{ key: 'x', num: false, src: 'order.X' }, { key: 'n', num: true, src: 'order.N' }], rules: [setRule({ cond: cond })] }; }
function hit(cond, X, N) { return E.matchRules(mk(cond), { order: { X: X, N: N } }, {}).length === 1; }

test('matchRules: 문자 연산자 10종', () => {
  assert.ok(hit({ x: { op: 'NOT_CHECK' } }, '', 0));
  assert.ok(hit({ x: { op: '=', v1: 'g' } }, ' G ', 0));
  assert.ok(!hit({ x: { op: '=', v1: 'G' } }, 'L', 0));
  assert.ok(hit({ x: { op: '!=', v1: 'G' } }, 'L', 0));
  assert.ok(!hit({ x: { op: '!=', v1: 'G' } }, '', 0), '빈 입력은 NOT_CHECK·IS_NULL·NOT_NULL 외 불일치');
  assert.ok(hit({ x: { op: 'IN', v1: 'G, L,V' } }, 'l', 0));
  assert.ok(!hit({ x: { op: 'IN', v1: 'G,L' } }, 'W', 0));
  assert.ok(hit({ x: { op: 'NOT_IN', v1: 'G,L' } }, 'W', 0));
  assert.ok(hit({ x: { op: 'LIKE1', v1: 'SGC' } }, 'KSG-SGCC', 0));
  assert.ok(hit({ x: { op: 'LIKE2', v1: 'CC' } }, 'KSG-SGCC', 0));
  assert.ok(!hit({ x: { op: 'LIKE2', v1: 'SG' } }, 'KSG-SGCC', 0));
  assert.ok(hit({ x: { op: 'LIKE3', v1: 'M' } }, 'M02000', 0));
  assert.ok(!hit({ x: { op: 'LIKE3', v1: '' } }, 'M02000', 0), 'LIKE 빈 패턴은 불일치');
  assert.ok(hit({ x: { op: 'NOT_NULL' } }, 'a', 0));
  assert.ok(!hit({ x: { op: 'NOT_NULL' } }, '', 0));
  assert.ok(hit({ x: { op: 'IS_NULL' } }, '', 0));
  assert.ok(!hit({ x: { op: 'IS_NULL' } }, 'a', 0));
});

test('matchRules: 숫자 연산자 11종', () => {
  assert.ok(hit({ n: { op: 'NOT_CHECK' } }, '', undefined));
  assert.ok(hit({ n: { op: '=', v1: 0.5 } }, '', '0.5'));
  assert.ok(hit({ n: { op: '!=', v1: 0.5 } }, '', 0.6));
  assert.ok(hit({ n: { op: '>', v1: 0.5 } }, '', 0.51) && !hit({ n: { op: '>', v1: 0.5 } }, '', 0.5));
  assert.ok(hit({ n: { op: '>=', v1: 0.5 } }, '', 0.5));
  assert.ok(hit({ n: { op: '<', v1: 0.5 } }, '', 0.49) && !hit({ n: { op: '<', v1: 0.5 } }, '', 0.5));
  assert.ok(hit({ n: { op: '<=', v1: 0.5 } }, '', 0.5));
  assert.ok(hit({ n: { op: 'BETWEEN1', v1: 0.4, v2: 0.5 } }, '', 0.5));
  assert.ok(!hit({ n: { op: 'BETWEEN2', v1: 0.4, v2: 0.5 } }, '', 0.5) && hit({ n: { op: 'BETWEEN2', v1: 0.4, v2: 0.5 } }, '', 0.4));
  assert.ok(!hit({ n: { op: 'BETWEEN3', v1: 0.4, v2: 0.5 } }, '', 0.4) && hit({ n: { op: 'BETWEEN3', v1: 0.4, v2: 0.5 } }, '', 0.5));
  assert.ok(!hit({ n: { op: 'BETWEEN4', v1: 0.4, v2: 0.5 } }, '', 0.5) && hit({ n: { op: 'BETWEEN4', v1: 0.4, v2: 0.5 } }, '', 0.45));
  assert.ok(!hit({ n: { op: '>', v1: 0.5 } }, '', 'abc'), 'NaN 입력은 불일치');
  assert.ok(!hit({ n: { op: '>', v1: 0.5 } }, '', ''), '빈 입력은 불일치');
});

test('matchRules: status · cond 없음 · defs 경로 · defaultDefs · 정렬', () => {
  const tbl = { defs: null, rules: [
    setRule({ id: 'B', no: 2, status: 'Y', cond: {} }),
    setRule({ id: 'A', no: 2, status: 'Y' }),            // cond 자체가 없음 → 전건
    setRule({ id: 'N', no: 1, status: 'N', cond: {} }),  // 제외
    setRule({ id: 'C', no: 1, status: 'Y', cond: { thk: { op: '>', v1: 0.9 } } }) // 불일치
  ] };
  const got = E.matchRules(tbl, input({ ORD_EXC_THK: 0.5 }), { applyWidth: 1000 }, E.DEFAULT_DEFS.setCorrection);
  assert.deepEqual(got.map(function (r) { return r.id; }), ['A', 'B'], 'no → id 순, status N 제외, cond 없음은 전건');
  // defs 생략(null) + defaultDefs 없음 → 조건 없음 → 전건
  assert.equal(E.matchRules({ defs: null, rules: [setRule()] }, input(), {}).length, 1);
  assert.equal(E.matchRules({ defs: [], rules: [setRule({ cond: { thk: { op: '>', v1: 9 } } })] }, input(), {}).length, 1, '[] 는 조건 없음');
  // derived.setThk 경로
  const tol = { defs: [{ key: 'setThk', num: true, src: 'derived.setThk' }], rules: [
    tolRule({ id: 'T1', cond: { setThk: { op: 'BETWEEN1', v1: 0.48, v2: 0.49 } } }),
    tolRule({ id: 'T2', cond: { setThk: { op: 'BETWEEN1', v1: 0.6, v2: 0.7 } } }) ] };
  assert.deepEqual(E.matchRules(tol, input(), { setThk: 0.485 }).map(function (r) { return r.id; }), ['T1']);
  // request.value · layers.galThkUm 경로
  const rq = { defs: [{ key: 'r', num: true, src: 'request.value' }, { key: 'g', num: true, src: 'layers.galThkUm' }],
               rules: [setRule({ cond: { r: { op: '=', v1: 0.01 }, g: { op: '>', v1: 10 } } })] };
  assert.equal(E.matchRules(rq, input({}, { value: 0.01, unit: 'CRN' }, { galThkUm: 12 }), {}).length, 1);
  assert.equal(E.matchRules(rq, input({}, { value: 0, unit: '' }, { galThkUm: 12 }), {}).length, 0);
  // rules 가 배열이 아니면 빈 결과 (예외 없음)
  assert.deepEqual(E.matchRules({ defs: null, rules: null }, input(), {}), []);
  assert.deepEqual(E.matchRules(undefined, input(), {}), []);
});

test('상수 노출', () => {
  assert.equal(typeof E.VERSION, 'string');
  assert.equal(E.DEFAULT_DEFS.setCorrection.length, 10);
  assert.equal(E.DEFAULT_DEFS.spCorrection.length, 5);
  assert.equal(E.DEFAULT_DEFS.thkTolerance.length, 3);
  assert.ok(E.ERROR_CODES.KK82 && E.WARNING_CODES.W_EMPTY_BRANCH);
});
