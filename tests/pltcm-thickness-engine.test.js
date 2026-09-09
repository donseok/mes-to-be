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

/* ══════════════ design() ══════════════ */
const sp08 = [spRule({ rate: 0.8 })];
const tolDoc = [tolRule({ llv: -0.010, ulv: 0.015 })];

test('해설서 5.1: TCT 0.500 · g 20 · CRN +0.003 · SP 0.8% → 0.483/0.486/0.485, 0.475~0.500', () => {
  const r = E.design(input({ ORD_THK_TP: '2', ORD_EXC_THK: 0.5 }, null, { galThkUm: 20 }),
                     crit({ set: [setRule({ adj: 0.003 })], sp: sp08, tol: tolDoc }));
  assert.equal(r.ok, true); assert.equal(r.error, null); assert.equal(r.path, 'STANDARD');
  assert.equal(r.values.ORD_EXC_THK, 0.5);
  assert.equal(r.values.CRM_THK, 0.483);
  assert.equal(r.values.PLTCM_THK_TRV, 0.486);
  assert.equal(r.values.PLTCM_SET_THK_TRV, 0.485);
  assert.equal(r.values.PLTCM_THK_LLV, 0.475);
  assert.equal(r.values.PLTCM_THK_ULV, 0.5);
  assert.deepEqual(r.applied.setRule, { id: 'TS-001', no: 1, adj: 0.003, unit: 'CRN', candidates: [{ id: 'TS-001', no: 1, adj: 0.003, unit: 'CRN' }] });
  assert.deepEqual(r.applied.spRule, { id: 'SP-001', no: 1, rate: 0.8 });
  assert.equal(r.applied.spRate, 0.8);
  assert.deepEqual(r.applied.tolRule, { id: 'TOL-001', no: 1, llv: -0.010, ulv: 0.015 });
  assert.equal(r.applied.applyWidth, 1000);
  assert.deepEqual(codes(r), []);
  assert.deepEqual(r.steps.map(function (s) { return s.no + ':' + s.name; }),
    ['1:단위 변환', '2:적용폭', '3:경로 선택', '4:기준 조회', '5:압연목표', '6:SP 조회·적용', '7:절삭', '8:SET 눈금', '9:공차']);
  near(r.steps[5].output, 0.48686399999999996, 'SP 단계 중간값');
});

test('해설서 5.2 표', () => {
  let r = E.design(input({ PRD_NM_CD: 'C', ORD_THK_TP: '1', ORD_EXC_THK: 0.6 }), crit({ set: [setRule({ adj: 0.005 })], sp: [spRule({ rate: 0.6 })] }));
  assert.deepEqual([r.values.CRM_THK, r.values.PLTCM_THK_TRV, r.values.PLTCM_SET_THK_TRV], [0.605, 0.608, 0.61]);
  r = E.design(input({ PRD_NM_CD: 'C', ORD_THK_TP: '1', ORD_EXC_THK: 0.8 }), crit({ set: [setRule({ adj: 1.5, unit: 'PCN' })], sp: [spRule({ rate: 0 })] }));
  assert.deepEqual([r.values.CRM_THK, r.values.PLTCM_THK_TRV, r.values.PLTCM_SET_THK_TRV], [0.812, 0.812, 0.81]);
  assert.equal(r.applied.spRate, 0); assert.deepEqual(codes(r), []);
  r = E.design(input({ ORD_THK_TP: '2', ORD_EXC_THK: 0.5 }, null, { galThkUm: 15 }), crit({ set: [setRule({ adj: 0.47, unit: 'TRK' })], sp: sp08 }));
  near(r.values.CRM_THK, 0.45499999999999996);
  assert.equal(r.values.PLTCM_THK_TRV, 0.454); assert.equal(r.values.PLTCM_SET_THK_TRV, 0.455);
  assert.deepEqual(r.applied.spRule, { id: 'SP-001', no: 1, rate: 0.8 }); assert.equal(r.applied.spRate, 0, 'TRK 계열은 SP 0');
  r = E.design(input({ PRD_NM_CD: '3', ORD_THK_TP: '3', ORD_EXC_THK: 0.5 }, { value: 0.01, unit: 'CRN' }, { galThkUm: 20, paintFrontUm: 15, paintBackUm: 10 }), crit());
  assert.equal(r.path, 'CUSTOMER'); near(r.values.CRM_THK, 0.46499999999999997);
  assert.equal(r.values.PLTCM_THK_TRV, 0.464); assert.equal(r.values.PLTCM_SET_THK_TRV, 0.465);
  assert.equal(r.applied.setRule, null);
});

test('품명 5·7 특수 경로 (요청·구분 무관, 공차는 SET 기준)', () => {
  ['5', '7'].forEach(function (p) {
    const r = E.design(input({ PRD_NM_CD: p, ORD_THK_TP: '3', ORD_EXC_THK: 0.503 }, { value: 0.01, unit: 'CRN' }), crit({ set: [setRule({ adj: 0.1 })], sp: sp08 }));
    assert.equal(r.ok, true); assert.equal(r.path, 'SPECIAL_57');
    assert.equal(r.values.CRM_THK, null);
    assert.equal(r.values.PLTCM_THK_TRV, 0);
    assert.equal(r.values.PLTCM_SET_THK_TRV, 0.503);
    assert.equal(r.values.PLTCM_THK_LLV, 0.488); assert.equal(r.values.PLTCM_THK_ULV, 0.518);
    assert.equal(r.applied.setRule, null); assert.equal(r.applied.spRule, null); assert.equal(r.applied.spRate, 0);
    assert.deepEqual(codes(r), ['W_SPECIAL_57']);
  });
  const k = E.design(input({ PRD_NM_CD: '5', ORD_EXC_THK: 0.503 }), crit({ tol: [] }));
  assert.equal(k.ok, false); assert.equal(k.error.code, 'KK80');
  assert.equal(k.values.PLTCM_SET_THK_TRV, 0.503); assert.equal(k.values.PLTCM_THK_LLV, null);
});

test('해설서 5.3 · 3.2: 같은 조건에서 STANDARD vs CUSTOMER, 고객 PCN', () => {
  const s = E.design(input({ ORD_THK_TP: '2', ORD_EXC_THK: 0.5 }, null, { galThkUm: 20 }), crit({ set: [setRule({ adj: 0.003 })] }));
  const c = E.design(input({ ORD_THK_TP: '2', ORD_EXC_THK: 0.5 }, { value: 0.003, unit: 'CRN' }, { galThkUm: 20 }), crit({ set: [setRule({ adj: 0.003 })] }));
  assert.equal(s.values.PLTCM_SET_THK_TRV, 0.485); assert.equal(c.values.PLTCM_SET_THK_TRV, 0.505);
  assert.equal(c.path, 'CUSTOMER'); assert.equal(c.applied.setRule, null);
  const p = E.design(input({ ORD_THK_TP: '2', ORD_EXC_THK: 0.5 }, { value: 1.0, unit: 'PCN' }), crit());
  assert.deepEqual([p.values.CRM_THK, p.values.PLTCM_THK_TRV, p.values.PLTCM_SET_THK_TRV], [0.505, 0.505, 0.505]);
});

test('CUSTOMER 단위 4분기: TRK(SP 생략) · 공백(칼라 차감) · 그 외', () => {
  const t = E.design(input({ ORD_THK_TP: '2', ORD_EXC_THK: 0.5 }, { value: 0.47, unit: 'TRK' }), crit({ sp: sp08 }));
  assert.equal(t.values.CRM_THK, 0.47); assert.equal(t.values.PLTCM_THK_TRV, 0.47); assert.equal(t.values.PLTCM_SET_THK_TRV, 0.47);
  assert.equal(t.applied.spRate, 0); assert.deepEqual(t.applied.spRule, { id: 'SP-001', no: 1, rate: 0.8 });
  const b = E.design(input({ PRD_NM_CD: '3', ORD_THK_TP: '3', ORD_EXC_THK: 0.5 }, { value: 0, unit: '' }, { galThkUm: 20, paintFrontUm: 15, paintBackUm: 10 }), crit());
  assert.equal(b.path, 'CUSTOMER'); near(b.values.CRM_THK, 0.45499999999999996);
  assert.equal(b.values.PLTCM_THK_TRV, 0.454); assert.equal(b.values.PLTCM_SET_THK_TRV, 0.455);
  const x = E.design(input({ ORD_THK_TP: '1', ORD_EXC_THK: 0.5 }, { value: 0.01, unit: 'ABC' }), crit());
  assert.equal(x.path, 'CUSTOMER'); assert.equal(x.values.CRM_THK, 0.5);
});

test('부록 A.1: 18개 조합 (t 0.5 · g 0.02 · CRN c 0.01 · PCN c 2 · TRK c 0.47)', () => {
  function run(unit, tp, mng, c) {
    return E.design(input({ ORD_THK_TP: tp, ORD_THK_MNG_CD: mng, ORD_EXC_THK: 0.5 }, null, { galThkUm: 20 }),
                    crit({ set: [setRule({ adj: c, unit: unit })], sp: sp08 }));
  }
  function ok(unit, tp, mng, c, crm, extra) {
    const r = run(unit, tp, mng, c);
    assert.equal(r.ok, true, unit + '/' + tp + '/' + mng + ' ' + JSON.stringify(r.error));
    near(r.values.CRM_THK, crm, unit + '/' + tp + '/' + mng);
    if (extra) extra(r);
  }
  function kk94(unit, tp, mng, c) {
    const r = run(unit, tp, mng, c);
    assert.equal(r.error && r.error.code, 'KK94', unit + '/' + tp + '/' + mng);
    assert.equal(r.error.stage, '압연목표'); assert.equal(r.error.stepNo, 5);
    assert.equal(r.values.CRM_THK, null); assert.equal(r.values.PLTCM_SET_THK_TRV, null);
    assert.equal(r.applied.setRule.id, 'TS-001');
    assert.equal(r.steps.length, 5);
  }
  function empty(unit, tp, mng, c) {
    const r = run(unit, tp, mng, c);
    assert.equal(r.ok, true); assert.equal(r.values.CRM_THK, 0);
    assert.equal(r.values.PLTCM_THK_TRV, 0); assert.equal(r.values.PLTCM_SET_THK_TRV, 0);
    assert.equal(r.values.PLTCM_THK_LLV, -0.015); assert.equal(r.values.PLTCM_THK_ULV, 0.015);
    hasCodes(r, ['W_EMPTY_BRANCH', 'W_ZERO_SET']);
    if (unit === 'TRK') assert.equal(r.applied.spRate, 0);
  }
  // CRN — KK94 없음
  ok('CRN', '2', '5', 0.01, 0.5);
  ok('CRN', '2', 'D', 0.01, 0.49); ok('CRN', '2', '6', 0.01, 0.49);
  ok('CRN', '1', '6', 0.01, 0.48);
  ok('CRN', '1', 'D', 0.01, 0.51); ok('CRN', '1', '5', 0.01, 0.51);
  // PCN
  kk94('PCN', '2', '6', 2); empty('PCN', '2', '5', 2); ok('PCN', '2', 'D', 2, 0.49);
  kk94('PCN', '1', '5', 2); empty('PCN', '1', '6', 2); ok('PCN', '1', 'D', 2, 0.51);
  // TRK 계열 (sp 0)
  kk94('TRK', '2', '6', 0.47); empty('TRK', '2', '5', 0.47);
  ok('TRK', '2', 'D', 0.47, 0.44999999999999996, function (r) { assert.equal(r.applied.spRate, 0); assert.equal(r.values.PLTCM_THK_TRV, 0.449); });
  kk94('TRK', '1', '5', 0.47); empty('TRK', '1', '6', 0.47);
  ok('TRK', '1', 'D', 0.47, 0.47, function (r) { assert.equal(r.applied.spRate, 0); assert.equal(r.values.PLTCM_SET_THK_TRV, 0.47); });
});

test('부록 A.2: STANDARD + 고객 단위 TRK → SP 생략 · 칼라TCT 요청 0 + TRK → 압연목표 0', () => {
  const a = E.design(input({ ORD_THK_TP: '2', ORD_EXC_THK: 0.5 }, { value: 0, unit: 'TRK' }, { galThkUm: 20 }), crit({ set: [setRule({ adj: 0.003 })], sp: sp08 }));
  assert.equal(a.path, 'STANDARD'); assert.equal(a.applied.spRate, 0);
  assert.equal(a.values.PLTCM_THK_TRV, 0.483, 'SP 생략 → 출측 = 압연목표 절삭');
  const b = E.design(input({ PRD_NM_CD: '3', ORD_THK_TP: '3', ORD_EXC_THK: 0.5 }, { value: 0, unit: 'TRK' }, { galThkUm: 20 }), crit());
  assert.equal(b.path, 'CUSTOMER'); assert.equal(b.values.CRM_THK, 0); assert.equal(b.values.PLTCM_SET_THK_TRV, 0);
  hasCodes(b, ['W_ZERO_SET']);
});

test('SP: 0건 경고 · 다건 순번/ID 순 첫 건', () => {
  const z = E.design(input({ ORD_EXC_THK: 0.5 }), crit({ set: [setRule({ adj: 0.01 })], sp: [] }));
  assert.equal(z.applied.spRate, 0); assert.equal(z.applied.spRule, null);
  assert.deepEqual(codes(z), ['W_NO_SP_RULE']); assert.equal(z.values.PLTCM_THK_TRV, 0.51);
  const m = E.design(input({ ORD_EXC_THK: 0.5 }), crit({ set: [setRule({ adj: 0.01 })],
    sp: [spRule({ id: 'SP-002', no: 2, rate: 1.0 }), spRule({ id: 'SP-001', no: 1, rate: 0.5 })] }));
  assert.equal(m.applied.spRule.id, 'SP-001'); assert.equal(m.applied.spRate, 0.5); hasCodes(m, ['W_MULTI_SP_RULE']);
  const s = E.design(input({ ORD_EXC_THK: 0.5 }), crit({ set: [setRule({ adj: 0.01 })],
    sp: [spRule({ id: 'SP-B', no: 1, rate: 1.0 }), spRule({ id: 'SP-A', no: 1, rate: 0.5 })] }));
  assert.equal(s.applied.spRule.id, 'SP-A', '순번 같으면 ID 순');
});

test('경고: 두께구분 4 · 단위 XYZ/공백 · 슬리팅 합계 0 · 요청값 비숫자', () => {
  const a = E.design(input({ ORD_THK_TP: '4', ORD_EXC_THK: 0.5 }), crit({ set: [setRule({ adj: 0.01 })] }));
  assert.equal(a.path, 'STANDARD'); assert.equal(a.values.CRM_THK, 0.51, 'BMT 행 t + c'); hasCodes(a, ['W_THK_TP_INVALID']);
  ['XYZ', ''].forEach(function (u) {
    const x = E.design(input({ ORD_EXC_THK: 0.5 }), crit({ set: [setRule({ adj: 0.47, unit: u })], sp: sp08 }));
    assert.equal(x.values.CRM_THK, 0.47, 'TRK 계열 c'); assert.equal(x.applied.spRate, 0); hasCodes(x, ['W_UNIT_UNKNOWN']);
  });
  const w = E.design(input({ ORD_EXC_THK: 0.5, ORD_SLIT_GRP_CNT: 2, ORD_MIX_WTH: [] }), crit({ set: [setRule()] }));
  assert.equal(w.applied.applyWidth, 0); hasCodes(w, ['W_SLIT_WIDTH_ZERO']);
  const q = E.design(input({ ORD_THK_TP: '2', ORD_EXC_THK: 0.5 }, { value: '≥ 0.5', unit: 'CRN' }, { galThkUm: 20 }), crit({ set: [setRule({ adj: 0.003 })] }));
  assert.equal(q.path, 'STANDARD'); hasCodes(q, ['W_REQUEST_INVALID']); assert.equal(q.values.PLTCM_SET_THK_TRV, 0.485);
  ['', null, undefined].forEach(function (v) {
    const e = E.design(input({ ORD_THK_TP: '2', ORD_EXC_THK: 0.5 }, { value: v, unit: '' }, { galThkUm: 20 }), crit({ set: [setRule({ adj: 0.003 })] }));
    assert.equal(e.path, 'STANDARD'); assert.ok(codes(e).indexOf('W_REQUEST_INVALID') < 0, '미지정은 무경고');
  });
});

test('정규화: 문자열 숫자 · 소문자 단위 · number 코드', () => {
  const r = E.design({ order: order({ ORD_EXC_THK: '0.5', ORD_THK_TP: 2, ORD_EXC_WTH: '1219' }), request: { value: '0.003', unit: 'crn' }, layers: { galThkUm: '20' } }, crit());
  assert.equal(r.path, 'CUSTOMER'); assert.equal(r.values.ORD_EXC_THK, 0.5);
  assert.equal(r.values.CRM_THK, 0.503); assert.equal(r.applied.applyWidth, 1219);
});

test('절삭·공차 경계: 0.2029 · 공차 절삭 0.205/0.210', () => {
  const a = E.design(input({ ORD_THK_TP: '1', ORD_EXC_THK: 0.2029 }, { value: 0.2029, unit: 'TRK' }), crit({ tol: [tolRule({ llv: -0.010, ulv: 0.015 })] }));
  assert.equal(a.values.PLTCM_THK_TRV, 0.202); assert.equal(a.values.PLTCM_SET_THK_TRV, 0.2);
  const b = E.design(input({ ORD_THK_TP: '2', ORD_EXC_THK: 0.205 }, { value: 0.205, unit: 'TRK' }), crit({ tol: [tolRule({ llv: -0.010, ulv: 0.015 })] }));
  assert.equal(b.values.PLTCM_SET_THK_TRV, 0.205); assert.equal(b.values.PLTCM_THK_LLV, 0.194); assert.equal(b.values.PLTCM_THK_ULV, 0.219);
  const c = E.design(input({ ORD_THK_TP: '2', ORD_EXC_THK: 0.21 }, { value: 0.21, unit: 'TRK' }), crit({ tol: [tolRule({ llv: -0.010, ulv: 0.015 })] }));
  assert.equal(c.values.PLTCM_SET_THK_TRV, 0.21); assert.equal(c.values.PLTCM_THK_LLV, 0.199); assert.equal(c.values.PLTCM_THK_ULV, 0.224);
});

test('오류: KK82 · KK83 · KK80 · KK81 · E_INPUT · E_CRITERIA (무예외)', () => {
  const k82 = E.design(input(), crit({ set: [] }));
  assert.equal(k82.ok, false); assert.equal(k82.error.code, 'KK82'); assert.equal(k82.error.stage, '기준 조회'); assert.equal(k82.error.stepNo, 4);
  assert.equal(k82.values.ORD_EXC_THK, 0.5); assert.equal(k82.values.CRM_THK, null); assert.equal(k82.values.PLTCM_THK_LLV, null);
  assert.equal(k82.steps.length, 4);
  const k83 = E.design(input(), crit({ set: [setRule({ id: 'TS-001' }), setRule({ id: 'TS-002', no: 2 })] }));
  assert.equal(k83.error.code, 'KK83'); assert.equal(k83.applied.setRule.candidates.length, 2); assert.equal(k83.applied.setRule.id, null);
  const k80 = E.design(input(), crit({ set: [setRule({ adj: 0.01 })], tol: [] }));
  assert.equal(k80.error.code, 'KK80'); assert.equal(k80.error.stage, '공차'); assert.equal(k80.error.stepNo, 9);
  assert.equal(k80.values.PLTCM_SET_THK_TRV, 0.51); assert.equal(k80.values.PLTCM_THK_LLV, null); assert.equal(k80.values.PLTCM_THK_ULV, null);
  assert.equal(k80.steps.length, 9);
  const k81 = E.design(input(), crit({ set: [setRule()], tol: [tolRule(), tolRule({ id: 'TOL-002', no: 2 })] }));
  assert.equal(k81.error.code, 'KK81');
  [0, -0.5, 'abc', null].forEach(function (t) {
    const e = E.design(input({ ORD_EXC_THK: t }), crit({ set: [setRule()] }));
    assert.equal(e.ok, false); assert.equal(e.error.code, 'E_INPUT'); assert.equal(e.error.stage, '입력 검증'); assert.equal(e.error.stepNo, 0);
    assert.deepEqual(e.steps, []); Object.keys(e.values).forEach(function (k) { assert.equal(e.values[k], null); });
  });
  [[undefined, undefined], [{}, {}], [input(), { setCorrection: { rules: 'x' }, spCorrection: { rules: [] }, thkTolerance: { rules: [] } }]].forEach(function (p) {
    let r; assert.doesNotThrow(function () { r = E.design(p[0], p[1]); });
    assert.equal(r.ok, false); assert.equal(r.error.code, 'E_CRITERIA'); assert.deepEqual(r.steps, []);
  });
});

test('결정성: 같은 입력 2회 깊은 동등', () => {
  const mk = () => E.design(input({ ORD_THK_TP: '2', ORD_EXC_THK: 0.5 }, null, { galThkUm: 20 }), crit({ set: [setRule({ adj: 0.003 })], sp: sp08, tol: tolDoc }));
  assert.deepEqual(mk(), mk());
});

test('전역: vm 컨텍스트에 로드하면 새 전역은 PltcmThicknessEngine 하나', () => {
  const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'pltcm-thickness-engine.js'), 'utf8');
  const sandbox = {}; sandbox.self = sandbox;
  vm.runInNewContext(src, sandbox);
  assert.deepEqual(Object.keys(sandbox).sort(), ['PltcmThicknessEngine', 'self']);
  assert.equal(typeof sandbox.PltcmThicknessEngine.design, 'function');
});
