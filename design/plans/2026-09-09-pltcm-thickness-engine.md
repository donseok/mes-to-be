# PLTCM 압연 SET 두께 계산 엔진 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시뮬레이션 ⑥ 설계값 산출의 X-Ray Set두께값·두께목표값(하한~상한)을 고정식 대신 AS-IS 로직을 재현한 순수 계산 엔진의 결과로 바꾼다.

**Architecture:** 순수 함수 엔진 `assets/pltcm-thickness-engine.js`(UMD 단일 표현식)를 만들고 `build/inject_engine.py`가 시뮬레이션 모듈의 마커 구간에 복사한다. 시뮬레이션은 기존 `loadCriteria`(라이브 localStorage 우선, 내장 시드 폴백) 패턴을 확장해 기준 3종과 도금두께 map을 `ctx.thk`로 만들고, 어댑터가 주문·⑤ 사양 결과·설계 결과를 엔진 입력으로 조립해 ⑥ 값을 교체한다. C10B2060 시드는 시드 스크립트가 압연두께Set보정관리와 시뮬레이션 두 곳에 주입한다.

**Tech Stack:** 바닐라 ES5 JS(브라우저 iframe srcdoc + Node 22 `node:test`), Python 3 빌드 스크립트(openpyxl은 시드 재생성 시에만), 외부 라이브러리 없음.

**Spec:** `design/specs/2026-09-09-pltcm-thickness-engine-design.md` (이하 "스펙"). 계획의 모든 산식·코드·기대값은 스펙 3장·5장·부록 A를 근거로 한다. 실행자는 스펙과 해설서 `design/PLTCM_압연SET_logic.md`를 함께 읽는다.

## Global Constraints

- 엔진은 **AS-IS 코드 동작 그대로**. 개선하지 않는다. 특이 동작은 경고 코드로만 드러낸다 (스펙 0.2 #1).
- 엔진 파일은 최상위 선언 없는 **하나의 UMD 표현식**. 브라우저 전역은 `PltcmThicknessEngine` 하나뿐 (스펙 1.1).
- 값은 number. 코드 항목은 `String(x).trim()` 문자열 비교. `request.unit`은 대문자 (스펙 2.2).
- 오류는 하나만(첫 실패에서 중단), 경고는 누적·코드별 1회 (스펙 3.8).
- 절삭·SET·공차 값은 정확 비교, 절삭 전 중간값은 1e-12 근사 (스펙 5.1).
- 테스트 실행 명령은 `node --test tests/pltcm-thickness-engine.test.js` (Node 20 이상. 디렉토리·글롭 인자 금지).
- 마커 안의 엔진 사본·시드 사본은 손으로 고치지 않는다. 줄끝은 LF 기준으로 비교하고 파일 원래 줄끝을 유지한다 (스펙 1.2).
- 모듈 HTML은 ES5 스타일(`var`, `function`)로 쓴다. `modules/simulation.html`은 `'use strict'` 단일 `<script>`이고 짧은 전역 헬퍼(`esc`, `num`, `anomaly`, `stage`)가 있으므로 새 전역 이름은 아래 계획에 적힌 것만 쓴다.
- 배포본 `index.html`은 손으로 고치지 않고 `python3 build/build_single.py`로만 만든다.
- 커밋 메시지는 한국어 요약 한 줄 + 본문, 브랜치 `feature/pltcm-thickness-engine`.
- 계획 문서 위치는 사용자 관례에 따라 `design/plans/`다 (`docs/`는 gitignore).

---

## 파일 구조

| 파일 | 책임 | 작업 |
|---|---|---|
| `assets/pltcm-thickness-engine.js` (신규) | 계산 엔진. 매처·유틸·`design()` | Task 1, 2 |
| `tests/pltcm-thickness-engine.test.js` (신규) | 골든·분기·오류·매처·전역 테스트 | Task 1, 2 |
| `build/inject_engine.py` (신규) | 엔진 → 모듈 마커 주입, `--check` | Task 3 |
| `build/rolling_thickness_set_seed.py` (수정) | 시드 JSON에 `id`, 대상 목록 주입, `--verify` | Task 3 |
| `build/rolling_thickness_set_seed.json` (재생성) | 룰 82건 + `id` | Task 3 |
| `modules/rolling-thickness-set.html` (수정) | `repo.seed()` id 규칙, 시드 재주입, 문구 8곳 | Task 3, 9 |
| `modules/quality-spec.html` (수정) | 사전 항목 2개, 한 번 합류 | Task 4 |
| `modules/simulation.html` (수정) | 마커 2종, 기준 로딩, 주문 기본값, 어댑터, 파이프라인, 화면, 회귀 케이스 | Task 3, 5, 6, 7, 8 |
| `build/README.md` (수정) | 빌드·테스트 절차 | Task 3, 10 |
| `index.html` (재생성) | 배포본 | Task 10 |

---

### Task 1: 엔진 골격 · 유틸 · 매처

**Files:**
- Create: `assets/pltcm-thickness-engine.js`
- Create: `tests/pltcm-thickness-engine.test.js`

**Interfaces:**
- Produces (전역/`module.exports` `PltcmThicknessEngine`):
  - `truncate3(x, out?) → number` — 소수 3자리 절삭. `out.warnings`(string[])에 `'W_EXP_NOTATION'`, `'W_NEGATIVE'`를 push
  - `snapSet(x3, out?) → number` — 0.005 눈금. 음수면 `out.warnings`에 `'W_NEGATIVE'`
  - `round4(x) → number`
  - `applyWidth(order, out?) → number` — 슬리팅 적용폭. 합계 0이면 `'W_SLIT_WIDTH_ZERO'`
  - `matchRules(table, input, derived, defaultDefs?) → rule[]` — `table.defs`가 null/undefined면 `defaultDefs`(없으면 `[]`), `status==='Y'` 룰 중 일치 목록을 `no` → `String(id||'')` → 배열 순으로
  - `DEFAULT_DEFS`, `ERROR_CODES`, `WARNING_CODES`, `VERSION`
- Task 2가 `design()`을 같은 파일의 `api` 객체에 추가한다.

- [ ] **Step 1: 테스트 파일을 만들고 유틸·매처 테스트를 쓴다**

`tests/pltcm-thickness-engine.test.js`:

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/pltcm-thickness-engine.test.js`
Expected: FAIL — `Cannot find module '../assets/pltcm-thickness-engine.js'`

- [ ] **Step 3: 엔진 파일 골격·유틸·매처를 쓴다**

`assets/pltcm-thickness-engine.js` (전체 파일. `design`은 Task 2에서 `api`에 추가한다):

```js
/* PLTCM 압연 SET 두께 계산 엔진 — 스펙 design/specs/2026-09-09-pltcm-thickness-engine-design.md
   AS-IS c10 DbSearchThkSizeData 동작 재현. DOM·localStorage 의존 없음.
   원본은 이 파일 하나이며 modules/simulation.html 의 마커 구간 사본은 build/inject_engine.py 가 만든다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PltcmThicknessEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.0.0';

  var ERROR_CODES = {
    E_INPUT: '주문두께 등 필수 입력 결함',
    E_CRITERIA: '기준표 누락 또는 rules 가 배열이 아님',
    KK82: 'C10B2060 압연 보정기준 없음',
    KK83: 'C10B2060 압연 보정기준 중복',
    KK94: 'PCN·TRK 계열에서 두께구분·관리코드 조합 불일치',
    KK80: 'C10B2190 PLTCM 공차기준 없음',
    KK81: 'C10B2190 PLTCM 공차기준 중복'
  };
  var WARNING_CODES = {
    W_EMPTY_BRANCH: 'AS-IS 계산문 없음 — 압연목표 0',
    W_NO_SP_RULE: 'SP 보정 기준 0건 — 0%로 진행',
    W_MULTI_SP_RULE: 'SP 보정 기준 다건 — 첫 건 적용',
    W_THK_TP_INVALID: '주문두께구분이 1·2·3 외 값',
    W_UNIT_UNKNOWN: '기준 단위가 CRN·PCN·TRK 외 — TRK 계열로 처리',
    W_SLIT_WIDTH_ZERO: '슬리팅 그룹수 > 0 인데 폭 합계 0',
    W_REQUEST_INVALID: '고객요청 값이 수가 아님 — 0으로 처리',
    W_ZERO_SET: 'SET 0 — AS-IS 는 이후 제조표준 조회에서 실패 가능',
    W_EXP_NOTATION: '절삭 시 지수 표기 폴백',
    W_NEGATIVE: '절삭·눈금 입력이 음수',
    W_SPECIAL_57: '품명 5·7 특수 경로 — SET = 주문두께, 출측 0'
  };

  var DEFAULT_DEFS = {
    setCorrection: [
      { key: 'prod',    num: false, src: 'order.PRD_NM_CD' },
      { key: 'org',     num: false, src: 'order.SPC_ORG_CD' },
      { key: 'spec',    num: false, src: 'order.SPC_AVR' },
      { key: 'use',     num: false, src: 'order.ORD_USG_CD' },
      { key: 'cust',    num: false, src: 'order.FNL_CUS_CD' },
      { key: 'thkKind', num: false, src: 'order.ORD_THK_TP' },
      { key: 'thkMng',  num: false, src: 'order.ORD_THK_MNG_CD' },
      { key: 'coat',    num: false, src: 'order.GW_ASG_CD' },
      { key: 'thk',     num: true,  src: 'order.ORD_EXC_THK' },
      { key: 'wid',     num: true,  src: 'derived.applyWidth' }
    ],
    spCorrection: [
      { key: 'prod', num: false, src: 'order.PRD_NM_CD' },
      { key: 'mat',  num: false, src: 'order.MAT_CD' },
      { key: 'spg',  num: false, src: 'order.ORD_SPNL_TP' },
      { key: 'thk',  num: true,  src: 'order.ORD_EXC_THK' },
      { key: 'wid',  num: true,  src: 'derived.applyWidth' }
    ],
    thkTolerance: [
      { key: 'prod',   num: false, src: 'order.PRD_NM_CD' },
      { key: 'setThk', num: true,  src: 'derived.setThk' },
      { key: 'wid',    num: true,  src: 'derived.applyWidth' }
    ]
  };

  /* ── 헬퍼 ── */
  function norm(s) { return String(s == null ? '' : s).trim().toUpperCase(); }
  function codeStr(s) { return String(s == null ? '' : s).trim(); }
  function listOf(v) { return String(v == null ? '' : v).split(',').map(norm).filter(Boolean); }
  function toNum(v) { var n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : NaN; }
  function getPath(obj, path) {
    var cur = obj, parts = String(path || '').split('.');
    for (var i = 0; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function pushWarn(out, code) { if (out && out.warnings && out.warnings.indexOf(code) < 0) out.warnings.push(code); }

  /* ── 조건 평가 (압연두께Set보정관리 evalText·evalNum 과 동일 의미) ── */
  function evalText(c, inputVal) {
    var op = c.op || 'NOT_CHECK', a = norm(c.v1), b = norm(inputVal);
    if (op === 'NOT_CHECK') return true;
    if (op === 'NOT_NULL') return b !== '';
    if (op === 'IS_NULL') return b === '';
    if (b === '') return false;
    switch (op) {
      case '=': return a === b;
      case '!=': return a !== b;
      case 'IN': return listOf(c.v1).indexOf(b) >= 0;
      case 'NOT_IN': return listOf(c.v1).indexOf(b) < 0;
      case 'LIKE1': return a !== '' && b.indexOf(a) >= 0;
      case 'LIKE2': return a !== '' && b.slice(-a.length) === a;
      case 'LIKE3': return a !== '' && b.indexOf(a) === 0;
    }
    return false;
  }
  function evalNum(c, inputVal) {
    var op = c.op || 'NOT_CHECK';
    if (op === 'NOT_CHECK') return true;
    var s = inputVal == null ? '' : String(inputVal).trim();
    var x = parseFloat(s);
    if (s === '' || isNaN(x)) return false;
    var a = parseFloat(c.v1), b = parseFloat(c.v2);
    switch (op) {
      case '=': return x === a; case '!=': return x !== a;
      case '>': return x > a; case '>=': return x >= a; case '<': return x < a; case '<=': return x <= a;
      case 'BETWEEN1': return a <= x && x <= b; case 'BETWEEN2': return a <= x && x < b;
      case 'BETWEEN3': return a < x && x <= b; case 'BETWEEN4': return a < x && x < b;
    }
    return false;
  }

  /* ── 매처 ── */
  function matchRules(table, input, derived, defaultDefs) {
    var defs = (table && table.defs != null) ? table.defs : (defaultDefs || []);
    var rules = (table && Array.isArray(table.rules)) ? table.rules : [];
    var ctx = { order: (input && input.order) || {}, request: (input && input.request) || {},
                layers: (input && input.layers) || {}, derived: derived || {} };
    var subject = {};
    for (var d = 0; d < defs.length; d++) subject[defs[d].key] = getPath(ctx, defs[d].src);
    var hits = [];
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (!r || norm(r.status) !== 'Y') continue;
      var cond = r.cond || {}, ok = true;
      for (var k = 0; k < defs.length && ok; k++) {
        var df = defs[k], c = cond[df.key] || { op: 'NOT_CHECK' };
        ok = df.num ? evalNum(c, subject[df.key]) : evalText(c, subject[df.key]);
      }
      if (ok) hits.push({ rule: r, idx: i });
    }
    hits.sort(function (a, b) {
      var na = toNum(a.rule.no), nb = toNum(b.rule.no);
      if (isNaN(na)) na = Infinity; if (isNaN(nb)) nb = Infinity;
      if (na !== nb) return na < nb ? -1 : 1;
      var ia = String(a.rule.id == null ? '' : a.rule.id), ib = String(b.rule.id == null ? '' : b.rule.id);
      if (ia !== ib) return ia < ib ? -1 : 1;
      return a.idx - b.idx;
    });
    return hits.map(function (h) { return h.rule; });
  }

  /* ── 자리수 유틸 ── */
  function truncate3(x, out) {
    var n = toNum(x);
    if (isNaN(n)) return NaN;
    var s = String(n);
    if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) { s = n.toFixed(12); pushWarn(out, 'W_EXP_NOTATION'); }
    var neg = s.charAt(0) === '-';
    if (neg) { s = s.slice(1); pushWarn(out, 'W_NEGATIVE'); }
    var i = s.indexOf('.');
    if (i >= 0) s = s.slice(0, i + 4);
    var v = Number(s);
    if (v === 0) return 0;
    return neg ? -v : v;
  }
  function snapSet(x3, out) {
    var n = toNum(x3);
    if (isNaN(n)) return NaN;
    var neg = n < 0;
    if (neg) pushWarn(out, 'W_NEGATIVE');
    var u = Math.round(Math.abs(n) * 1000), d = u % 10;
    if (d === 1 || d === 2) u = u - d;
    else if (d === 3 || d === 4 || d === 6 || d === 7) u = u - d + 5;
    else if (d === 8 || d === 9) u = u - d + 10;
    var v = u / 1000;
    if (v === 0) return 0;
    return neg ? -v : v;
  }
  function round4(x) { return Math.round(toNum(x) * 10000) / 10000; }
  function applyWidth(o, out) {
    o = o || {};
    var grp = toNum(o.ORD_SLIT_GRP_CNT); if (isNaN(grp)) grp = 0;
    if (grp > 0) {
      var arr = Array.isArray(o.ORD_MIX_WTH) ? o.ORD_MIX_WTH : [], sum = 0;
      for (var i = 0; i < arr.length; i++) { var w = toNum(arr[i]); if (!isNaN(w)) sum += w; }
      if (sum === 0) pushWarn(out, 'W_SLIT_WIDTH_ZERO');
      return sum;
    }
    var ew = toNum(o.ORD_EXC_WTH);
    return isNaN(ew) ? 0 : ew;
  }

  var api = {
    VERSION: VERSION, ERROR_CODES: ERROR_CODES, WARNING_CODES: WARNING_CODES, DEFAULT_DEFS: DEFAULT_DEFS,
    matchRules: matchRules, truncate3: truncate3, snapSet: snapSet, round4: round4, applyWidth: applyWidth
  };
  return api;
});
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/pltcm-thickness-engine.test.js`
Expected: `# pass 8`, `# fail 0`

- [ ] **Step 5: 커밋**

```bash
git add assets/pltcm-thickness-engine.js tests/pltcm-thickness-engine.test.js
git commit -m "feat(engine): PLTCM 두께 엔진 골격 — 매처·절삭·눈금·적용폭 유틸과 테스트"
```

---

### Task 2: `design()` — 검증·경로·산식·SP·절삭·SET·공차

**Files:**
- Modify: `assets/pltcm-thickness-engine.js` (`api` 앞에 `design` 관련 함수 추가, `api.design` 노출)
- Modify: `tests/pltcm-thickness-engine.test.js` (테스트 추가)

**Interfaces:**
- Consumes: Task 1의 `matchRules`, `truncate3`, `snapSet`, `round4`, `applyWidth`, `DEFAULT_DEFS`
- Produces: `design(input, criteria) → result` — 스펙 2.4의 `{ok, error, path, values:{ORD_EXC_THK, CRM_THK, PLTCM_THK_TRV, PLTCM_SET_THK_TRV, PLTCM_THK_LLV, PLTCM_THK_ULV}, applied:{applyWidth, setRule, spRule, spRate, tolRule}, steps[], warnings[]}`. 어떤 입력에도 예외를 던지지 않는다.

- [ ] **Step 1: `design()` 테스트를 추가한다**

`tests/pltcm-thickness-engine.test.js` 끝에 추가:

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/pltcm-thickness-engine.test.js`
Expected: 새 테스트 전부 FAIL (`E.design is not a function`), Task 1 테스트 8개는 PASS

- [ ] **Step 3: `design()`을 구현한다**

`assets/pltcm-thickness-engine.js`에서 `var api = {` 바로 **앞**에 아래를 넣고, `api`에 `design: design`을 추가한다.

```js
  /* ── 입력 정규화 (스펙 2.2) ── */
  var CODE_KEYS = ['PRD_NM_CD', 'SPC_ORG_CD', 'SPC_AVR', 'ORD_USG_CD', 'FNL_CUS_CD', 'ORD_THK_TP',
                   'ORD_THK_MNG_CD', 'GW_ASG_CD', 'MAT_CD', 'ORD_SPNL_TP'];
  function normalizeInput(input) {
    var src = input || {}, o = src.order || {}, rq = src.request || {}, ly = src.layers || {};
    var order = {};
    for (var i = 0; i < CODE_KEYS.length; i++) order[CODE_KEYS[i]] = codeStr(o[CODE_KEYS[i]]);
    order.ORD_EXC_THK = toNum(o.ORD_EXC_THK);
    order.ORD_EXC_WTH = toNum(o.ORD_EXC_WTH);
    order.ORD_SLIT_GRP_CNT = toNum(o.ORD_SLIT_GRP_CNT);
    order.ORD_MIX_WTH = Array.isArray(o.ORD_MIX_WTH) ? o.ORD_MIX_WTH.map(toNum) : [];
    var rawReq = rq.value, reqInvalid = false, reqVal = 0;
    if (!(rawReq == null || String(rawReq).trim() === '')) {
      var pv = toNum(rawReq);
      if (isNaN(pv)) reqInvalid = true; else reqVal = pv;
    }
    function um(v) { var n = toNum(v); return isNaN(n) ? 0 : n; }
    return {
      order: order,
      request: { value: reqVal, unit: norm(rq.unit) },
      layers: { galThkUm: um(ly.galThkUm), paintFrontUm: um(ly.paintFrontUm), paintBackUm: um(ly.paintBackUm) },
      requestInvalid: reqInvalid
    };
  }
  function projSet(r) { return { id: r.id == null ? '' : String(r.id), no: r.no, adj: toNum(r.adj), unit: norm(r.unit) }; }

  /* ── 본 계산 (스펙 3장) ── */
  function design(input, criteria) {
    var res = {
      ok: false, error: null, path: null,
      values: { ORD_EXC_THK: null, CRM_THK: null, PLTCM_THK_TRV: null, PLTCM_SET_THK_TRV: null, PLTCM_THK_LLV: null, PLTCM_THK_ULV: null },
      applied: { applyWidth: null, setRule: null, spRule: null, spRate: 0, tolRule: null },
      steps: [], warnings: []
    };
    var sink = { warnings: [] };
    function warn(code) {
      for (var i = 0; i < res.warnings.length; i++) if (res.warnings[i].code === code) return;
      res.warnings.push({ code: code, message: WARNING_CODES[code] || code });
    }
    function flush() { for (var i = 0; i < sink.warnings.length; i++) warn(sink.warnings[i]); sink.warnings.length = 0; }
    function fail(code, stage, stepNo) { res.error = { code: code, stage: stage, stepNo: stepNo, message: ERROR_CODES[code] || code }; return res; }
    function step(no, name, formula, inputs, output, note) {
      res.steps.push({ no: no, name: name, formula: formula, inputs: inputs || {}, output: output === undefined ? null : output, note: note || '' });
    }

    /* 검증 — 기준 → 입력 (스펙 3.1) */
    var crit = criteria || {}, tables = ['setCorrection', 'spCorrection', 'thkTolerance'];
    for (var ti = 0; ti < tables.length; ti++) {
      var tb = crit[tables[ti]];
      if (!tb || !Array.isArray(tb.rules)) return fail('E_CRITERIA', '입력 검증', 0);
    }
    var inp = normalizeInput(input), o = inp.order, t = o.ORD_EXC_THK;
    if (!(t > 0)) return fail('E_INPUT', '입력 검증', 0);
    res.values.ORD_EXC_THK = t;
    if (inp.requestInvalid) warn('W_REQUEST_INVALID');

    /* ① 단위 변환 */
    var g = inp.layers.galThkUm / 1000, pf = inp.layers.paintFrontUm / 1000, pb = inp.layers.paintBackUm / 1000;
    step(1, '단위 변환', 'g = galThkUm / 1000 · pf = paintFrontUm / 1000 · pb = paintBackUm / 1000',
         { galThkUm: inp.layers.galThkUm, paintFrontUm: inp.layers.paintFrontUm, paintBackUm: inp.layers.paintBackUm }, { g: g, pf: pf, pb: pb });

    /* ② 적용폭 */
    var derived = {};
    var aw = applyWidth(o, sink); flush();
    res.applied.applyWidth = aw; derived.applyWidth = aw;
    step(2, '적용폭', o.ORD_SLIT_GRP_CNT > 0 ? 'ORD_MIX_WTH 합계 (슬리팅)' : 'ORD_EXC_WTH (주문폭)',
         { ORD_SLIT_GRP_CNT: o.ORD_SLIT_GRP_CNT, ORD_MIX_WTH: o.ORD_MIX_WTH, ORD_EXC_WTH: o.ORD_EXC_WTH }, aw);

    /* ③ 경로 선택 */
    var special = (o.PRD_NM_CD === '5' || o.PRD_NM_CD === '7');
    var path = special ? 'SPECIAL_57' : (inp.request.value === 0 && o.ORD_THK_TP !== '3') ? 'STANDARD' : 'CUSTOMER';
    res.path = path;
    step(3, '경로 선택', '품명 5·7 → SPECIAL_57 / 요청값 0 이고 두께구분 ≠ 3 → STANDARD / 그 외 CUSTOMER',
         { PRD_NM_CD: o.PRD_NM_CD, requestValue: inp.request.value, requestUnit: inp.request.unit, ORD_THK_TP: o.ORD_THK_TP }, path);
    if (o.ORD_THK_TP !== '1' && o.ORD_THK_TP !== '2' && o.ORD_THK_TP !== '3') warn('W_THK_TP_INVALID');

    var crm = null, spForcedZero = false;
    if (path === 'SPECIAL_57') {
      warn('W_SPECIAL_57');
      step(4, '기준 조회', '생략 (품명 5·7)', {}, null, '생략');
      step(5, '압연목표', '생략 (품명 5·7)', {}, null, '생략');
      step(6, 'SP 조회·적용', '생략 (품명 5·7)', {}, null, '생략');
      step(7, '절삭', '생략 (품명 5·7)', {}, null, '생략');
      res.values.PLTCM_THK_TRV = 0;
      res.values.PLTCM_SET_THK_TRV = t;
      step(8, 'SET 눈금', 'SET = 주문두께 (0.005 눈금 없음)', { t: t }, t);
    } else {
      if (path === 'STANDARD') {
        /* ④ C10B2060 */
        var hits = matchRules(crit.setCorrection, inp, derived, DEFAULT_DEFS.setCorrection);
        var cands = hits.map(projSet);
        if (hits.length === 0) { step(4, '기준 조회', 'C10B2060 조회', { hits: 0 }, 0); return fail('KK82', '기준 조회', 4); }
        if (hits.length > 1) {
          res.applied.setRule = { id: null, no: null, adj: null, unit: null, candidates: cands };
          step(4, '기준 조회', 'C10B2060 조회', { hits: hits.length }, cands); return fail('KK83', '기준 조회', 4);
        }
        var sr = cands[0], c = sr.adj, unit = sr.unit;
        res.applied.setRule = { id: sr.id, no: sr.no, adj: c, unit: unit, candidates: cands };
        step(4, '기준 조회', 'C10B2060 조회 1건', { hits: 1 }, sr);
        /* ⑤ 압연목표 (부록 A.1) */
        var kind = o.ORD_THK_TP === '2' ? '2' : '1', mng = o.ORD_THK_MNG_CD;
        var fam = unit === 'CRN' ? 'CRN' : unit === 'PCN' ? 'PCN' : 'TRK';
        if (fam === 'TRK' && unit !== 'TRK') warn('W_UNIT_UNKNOWN');
        var formula = '', val = null, empty = false, mismatch = false;
        if (fam === 'CRN') {
          if (kind === '2') { if (mng === '5') { formula = 't (round4)'; val = round4(t); } else { formula = 't − g + c (round4)'; val = round4(t - g + c); } }
          else { if (mng === '6') { formula = 't − g'; val = t - g; } else { formula = 't + c'; val = t + c; } }
        } else if (fam === 'PCN') {
          if (kind === '2') { if (mng === '6') mismatch = true; else if (mng === '5') empty = true; else { formula = 't − g + t × c / 100'; val = t - g + t * c / 100; } }
          else { if (mng === '5') mismatch = true; else if (mng === '6') empty = true; else { formula = 't + t × c / 100'; val = t + t * c / 100; } }
        } else {
          spForcedZero = true;
          if (kind === '2') { if (mng === '6') mismatch = true; else if (mng === '5') empty = true; else { formula = 'c − g'; val = c - g; } }
          else { if (mng === '5') mismatch = true; else if (mng === '6') empty = true; else { formula = 'c'; val = c; } }
        }
        if (mismatch) { step(5, '압연목표', '두께구분·관리코드 조합 불일치 (' + fam + '·' + kind + '·' + mng + ')', { t: t, g: g, c: c }, null); return fail('KK94', '압연목표', 5); }
        if (empty) { val = 0; formula = '(AS-IS 계산문 없음) 0'; warn('W_EMPTY_BRANCH'); }
        crm = val;
        step(5, '압연목표', formula, { t: t, g: g, c: c, unit: unit, kind: kind, mng: mng }, crm);
      } else {
        /* CUSTOMER (스펙 3.4) */
        step(4, '기준 조회', '생략 (고객사양 경로)', {}, null, '생략');
        var b = (o.ORD_THK_TP === '3') ? (t - pf - pb - g) : t;
        var rv = inp.request.value, ru = inp.request.unit, cf;
        if (ru === 'CRN') { cf = 'b + r'; crm = b + rv; }
        else if (ru === 'PCN') { cf = 'b + b × r / 100'; crm = b + b * rv / 100; }
        else if (ru === 'TRK') { cf = 'r'; crm = rv; }
        else { cf = 'b'; crm = b; }
        step(5, '압연목표', (o.ORD_THK_TP === '3' ? 'b = t − pf − pb − g · ' : 'b = t · ') + cf, { t: t, g: g, pf: pf, pb: pb, b: b, r: rv, unit: ru }, crm);
      }
      res.values.CRM_THK = crm; derived.crmThk = crm;

      /* ⑥ SP (스펙 3.5) */
      var spHits = matchRules(crit.spCorrection, inp, derived, DEFAULT_DEFS.spCorrection), sp = 0;
      if (spHits.length === 0) warn('W_NO_SP_RULE');
      else {
        if (spHits.length > 1) warn('W_MULTI_SP_RULE');
        var s0 = spHits[0], rate = toNum(s0.rate);
        res.applied.spRule = { id: s0.id == null ? '' : String(s0.id), no: s0.no, rate: rate };
        sp = isNaN(rate) ? 0 : rate;
      }
      if (spForcedZero) sp = 0;
      var outCalc, spf;
      if (inp.request.unit === 'TRK') { sp = 0; outCalc = crm; spf = 'crm (고객 단위 TRK → SP 생략)'; }
      else { outCalc = crm + crm * sp / 100; spf = 'crm + crm × sp / 100'; }
      res.applied.spRate = sp;
      step(6, 'SP 조회·적용', spf, { crm: crm, sp: sp, hits: spHits.length, forcedZero: spForcedZero }, outCalc);

      /* ⑦ 절삭 · ⑧ SET (스펙 3.6) */
      var thk = truncate3(outCalc, sink); flush();
      res.values.PLTCM_THK_TRV = thk;
      step(7, '절삭', 'truncate3(출측 계산값)', { x: outCalc }, thk);
      var set = snapSet(thk, sink); flush();
      res.values.PLTCM_SET_THK_TRV = set;
      step(8, 'SET 눈금', 'snapSet(출측두께)', { x3: thk }, set);
    }
    if (res.values.PLTCM_SET_THK_TRV === 0) warn('W_ZERO_SET');

    /* ⑨ 공차 (스펙 3.7) */
    derived.setThk = res.values.PLTCM_SET_THK_TRV;
    var tolHits = matchRules(crit.thkTolerance, inp, derived, DEFAULT_DEFS.thkTolerance);
    if (tolHits.length === 0) { step(9, '공차', 'C10B2190 조회', { setThk: derived.setThk, hits: 0 }, 0); return fail('KK80', '공차', 9); }
    if (tolHits.length > 1) { step(9, '공차', 'C10B2190 조회', { setThk: derived.setThk, hits: tolHits.length }, null); return fail('KK81', '공차', 9); }
    var tr = tolHits[0], llv = toNum(tr.llv), ulv = toNum(tr.ulv), setv = res.values.PLTCM_SET_THK_TRV;
    res.applied.tolRule = { id: tr.id == null ? '' : String(tr.id), no: tr.no, llv: llv, ulv: ulv };
    res.values.PLTCM_THK_LLV = truncate3(setv + llv, sink);
    res.values.PLTCM_THK_ULV = truncate3(setv + ulv, sink); flush();
    step(9, '공차', 'LLV = truncate3(SET + llv) · ULV = truncate3(SET + ulv)', { set: setv, llv: llv, ulv: ulv },
         { LLV: res.values.PLTCM_THK_LLV, ULV: res.values.PLTCM_THK_ULV });
    res.ok = true;
    return res;
  }
```

그리고 `api` 객체를 다음으로 바꾼다:

```js
  var api = {
    VERSION: VERSION, ERROR_CODES: ERROR_CODES, WARNING_CODES: WARNING_CODES, DEFAULT_DEFS: DEFAULT_DEFS,
    design: design, matchRules: matchRules, truncate3: truncate3, snapSet: snapSet, round4: round4, applyWidth: applyWidth
  };
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/pltcm-thickness-engine.test.js`
Expected: `# pass 22`, `# fail 0`. 실패하면 기대값이 아니라 구현을 고친다. 기대값은 스펙 5.1과 검산 결과다.

- [ ] **Step 5: 커밋**

```bash
git add assets/pltcm-thickness-engine.js tests/pltcm-thickness-engine.test.js
git commit -m "feat(engine): design() — 경로 선택·C10B2060 산식·SP·절삭·0.005 눈금·공차와 골든 테스트"
```

---

### Task 3: 빌드 주입 — 엔진 마커, 시드 `id`, 이중 주입, `--verify`

**Files:**
- Create: `build/inject_engine.py`
- Modify: `build/rolling_thickness_set_seed.py` (`parse`, `check`, `inject`, `main`)
- Modify: `modules/simulation.html:287-296` (마커 2종 추가)
- Modify: `modules/rolling-thickness-set.html:412` (`repo.seed()` id 규칙)
- Regenerate: `build/rolling_thickness_set_seed.json`, 두 모듈의 시드 사본
- Modify: `build/README.md` (빌드 절)

**Interfaces:**
- Produces: `modules/simulation.html` 안에 전역 `PltcmThicknessEngine`(마커 구간)과 `SEED_RTS`(`{head, rules:[{id,no,cond,adj,adjRaw,unit,status,srcRow}]}`)가 생긴다. Task 5가 둘을 쓴다.
- 명령: `python3 build/inject_engine.py [--check]`, `python3 build/rolling_thickness_set_seed.py --check --emit --inject`, `--verify`

- [ ] **Step 1: 시뮬레이션에 마커 2종을 넣는다**

`modules/simulation.html` 287~296행 부근, `'use strict';` 바로 다음 줄(시드 주석 앞)에 엔진 마커를, `var SEED_ORDERS=[...]` 줄 **다음**에 시드 마커를 넣는다:

```js
'use strict';
/*__PLTCM_ENGINE_START__*/
/*__PLTCM_ENGINE_END__*/
/* ---- 시드: 기존 모듈에서 발췌 (목업용 축약) ---- */
var SEED_SHEETS=[...];   // 기존 줄 그대로
...
var SEED_ORDERS=[...];   // 기존 줄 그대로
/* ---- C10B2060 압연두께Set 보정 룰 전문 — build/rolling_thickness_set_seed.py --inject 가 채운다. 손으로 고치지 않는다 ---- */
/*__RTS_SEED_SIM_START__*/
var SEED_RTS={"head":{},"rules":[]};
/*__RTS_SEED_SIM_END__*/
```

- [ ] **Step 2: `build/inject_engine.py`를 만든다**

```python
#!/usr/bin/env python3
"""엔진 주입: assets/pltcm-thickness-engine.js 를 모듈의 마커 구간에 복사한다.

  python3 build/inject_engine.py          # 주입 (멱등)
  python3 build/inject_engine.py --check  # 사본이 원본과 다르면 exit 1

줄끝: 원본·모듈 모두 유니버설 모드로 읽어 LF 기준으로 비교·치환하고, 쓸 때는 모듈 파일이
원래 쓰던 줄끝(CRLF/LF)을 유지한다 (저장소가 Windows core.autocrlf=true 로 체크아웃되기 때문).
"""
import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = lambda *p: os.path.join(ROOT, *p)
ENGINE = path('assets', 'pltcm-thickness-engine.js')
TARGETS = [path('modules', 'simulation.html')]
MARK_S = '/*__PLTCM_ENGINE_START__*/'
MARK_E = '/*__PLTCM_ENGINE_END__*/'


class InjectError(Exception):
    pass


def read_lf(p):
    with open(p, encoding='utf-8', newline=None) as f:   # 유니버설 → '\n'
        return f.read()


def detect_eol(p):
    with open(p, 'rb') as f:
        return '\r\n' if b'\r\n' in f.read() else '\n'


def splice(src, body, mark_s, mark_e, label):
    if src.count(mark_s) != 1 or src.count(mark_e) != 1:
        raise InjectError('마커가 정확히 1쌍이어야 함: ' + label)
    i = src.find(mark_s)
    j = src.find(mark_e, i)
    if j < 0:
        raise InjectError('종료 마커가 시작 마커 뒤에 없음: ' + label)
    return src[:i + len(mark_s)] + '\n' + body.strip('\n') + '\n' + src[j:]


def write_keep_eol(p, text_lf):
    with open(p, 'w', encoding='utf-8', newline=detect_eol(p)) as f:
        f.write(text_lf)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    try:
        engine = read_lf(ENGINE)
        bad = 0
        for t in TARGETS:
            src = read_lf(t)
            out = splice(src, engine, MARK_S, MARK_E, t)
            if out == src:
                print('ENGINE OK (변경 없음):', os.path.relpath(t, ROOT))
            elif a.check:
                print('ENGINE DIFF:', os.path.relpath(t, ROOT), '— python3 build/inject_engine.py 로 재주입', file=sys.stderr)
                bad += 1
            else:
                write_keep_eol(t, out)
                print('ENGINE INJECT OK:', os.path.relpath(t, ROOT))
        if bad:
            sys.exit(1)
    except (InjectError, OSError) as e:
        print(e, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
```

- [ ] **Step 3: 주입하고 `--check`로 멱등성을 확인한다**

Run:
```bash
python3 build/inject_engine.py && python3 build/inject_engine.py --check && grep -c "__PLTCM_ENGINE_START__" modules/simulation.html
```
Expected: `ENGINE INJECT OK`, 이어서 `ENGINE OK (변경 없음)`, grep 결과 `1`

- [ ] **Step 4: 시드 스크립트를 고친다 — `id` 기록, 대상 목록, `--verify`, 줄끝**

`build/rolling_thickness_set_seed.py`에서:

(a) 상수부 `MODULE = …`, `MARK_S`, `MARK_E` 세 줄을 다음으로 바꾼다:

```python
# 주입 대상: (모듈 경로, 시작 마커, 종료 마커, 변수 선언 접두)
TARGETS = [
    (path('modules', 'rolling-thickness-set.html'), '/*__RTS_SEED_START__*/', '/*__RTS_SEED_END__*/', 'var SEED='),
    (path('modules', 'simulation.html'), '/*__RTS_SEED_SIM_START__*/', '/*__RTS_SEED_SIM_END__*/', 'var SEED_RTS='),
]
```

(b) `parse()`의 `rules.append({` 딕셔너리 첫 항목으로 `'id': 'TS-' + str(len(rules) + 1).zfill(3),`을 넣는다.

(c) `check()`의 `assert all(x['unit'] == 'CRN' …)` 다음 줄에 추가:

```python
    assert [x['id'] for x in rules] == ['TS-%03d' % i for i in range(1, 83)], 'id 규칙 TS-001..082 아님'
```

(d) `inject()` 전체를 다음으로 바꾸고 `verify()`를 추가한다:

```python
def _read_lf(p):
    with open(p, encoding='utf-8', newline=None) as f:
        return f.read()


def _eol(p):
    with open(p, 'rb') as f:
        return '\r\n' if b'\r\n' in f.read() else '\n'


def _body(seed, prefix):
    return prefix + json.dumps(seed, ensure_ascii=False, separators=(',', ':')) + ';'


def _splice(src, body, mark_s, mark_e, label):
    if src.count(mark_s) != 1 or src.count(mark_e) != 1:
        raise PipelineError('마커가 정확히 1쌍이어야 함: ' + label)
    i = src.find(mark_s)
    j = src.find(mark_e, i)
    if j < 0:
        raise PipelineError('종료 마커 위치 오류: ' + label)
    return src[:i + len(mark_s)] + '\n' + body + '\n' + src[j:]


def inject():
    seed = json.load(open(SEED_JSON, encoding='utf-8'))
    for module, mark_s, mark_e, prefix in TARGETS:
        src = _read_lf(module)
        out = _splice(src, _body(seed, prefix), mark_s, mark_e, module)
        if out != src:
            with open(module, 'w', encoding='utf-8', newline=_eol(module)) as f:
                f.write(out)
            print('INJECT OK: %d rules → %s' % (len(seed['rules']), os.path.relpath(module, ROOT)))
        else:
            print('INJECT: 변경 없음 —', os.path.relpath(module, ROOT))


def verify():
    """xlsx 없이 두 모듈의 시드 사본이 JSON 과 같은지 검사한다."""
    seed = json.load(open(SEED_JSON, encoding='utf-8'))
    bad = 0
    for module, mark_s, mark_e, prefix in TARGETS:
        src = _read_lf(module)
        if _splice(src, _body(seed, prefix), mark_s, mark_e, module) != src:
            print('VERIFY DIFF:', os.path.relpath(module, ROOT), '— --inject 로 재주입', file=sys.stderr)
            bad += 1
        else:
            print('VERIFY OK:', os.path.relpath(module, ROOT))
    if bad:
        raise PipelineError('시드 사본이 JSON 과 다름 (%d)' % bad)
```

(e) `main()`에 `ap.add_argument('--verify', action='store_true')`를 추가하고, `if a.inject: inject()` 다음에 `if a.verify: verify()`를, 마지막 조건을 `if not (a.check or a.emit or a.inject or a.verify):`로 바꾼다. `import os`는 이미 있다.

- [ ] **Step 5: 압연두께Set보정관리 `repo.seed()`가 JSON의 id를 쓰게 한다**

`modules/rolling-thickness-set.html` 412행의

```js
      var r={id:'TS-'+pad3(st.ruleSeq++),no:s.no,cond:c,adj:+s.adj,unit:s.unit||'CRN',status:s.status||'Y',note:s.note||''};
```

를

```js
      var autoId='TS-'+pad3(st.ruleSeq++);   /* ruleSeq 는 신규 룰 채번을 위해 항상 전진 */
      var r={id:s.id||autoId,no:s.no,cond:c,adj:+s.adj,unit:s.unit||'CRN',status:s.status||'Y',note:s.note||''};
```

로 바꾼다.

- [ ] **Step 6: 시드를 재생성·재주입하고 검증한다**

Run (xlsx `sources/압연두께Set치보정기준.xlsx`가 있는 환경):
```bash
python3 build/rolling_thickness_set_seed.py --check --emit --inject && python3 build/rolling_thickness_set_seed.py --verify && python3 - <<'EOF'
import json; d=json.load(open('build/rolling_thickness_set_seed.json',encoding='utf-8'))
print(d['rules'][0]['id'], d['rules'][81]['id'], len(d['rules']))
EOF
```
Expected: `CHECK OK`, `EMIT OK`, `INJECT OK: 82 rules → modules/rolling-thickness-set.html`, `INJECT OK: 82 rules → modules/simulation.html`, `VERIFY OK` 2줄, 마지막 줄 `TS-001 TS-082 82`

xlsx가 없는 환경이면 `build/rolling_thickness_set_seed.json`의 각 룰에 `python3` 한 줄로 `id`를 넣고(`for i,r in enumerate(rules): r['id']='TS-%03d'%(i+1)`) `--inject --verify`만 실행한다.

- [ ] **Step 7: 시뮬레이션 문법 확인**

Run:
```bash
node -e "const s=require('fs').readFileSync('modules/simulation.html','utf8');const m=s.match(/<script>\r?\n'use strict';([\s\S]*)<\/script>\s*<\/body>/);new Function(m[1]);console.log('syntax ok');"
```
Expected: `syntax ok`

- [ ] **Step 8: README 빌드 절을 추가한다**

`build/README.md`의 "## 빌드" 절 코드블록 아래에 추가:

```markdown
### 계산 엔진 주입

PLTCM 두께 계산 엔진의 원본은 `assets/pltcm-thickness-engine.js` 하나다. 시뮬레이션 모듈 안의
`/*__PLTCM_ENGINE_START__*/ … /*__PLTCM_ENGINE_END__*/` 사본은 `build/inject_engine.py`가 만들며 손으로 고치지 않는다.

```bash
node --test tests/pltcm-thickness-engine.test.js   # 엔진 테스트 (Node 20 이상. 디렉토리·글롭 인자는 쓰지 않는다)
python3 build/inject_engine.py                      # 사본 갱신 (멱등)
python3 build/inject_engine.py --check              # 사본이 원본과 같은지 검사
```
```

그리고 "## 룰 시드 파이프라인 (압연두께Set보정관리 모듈)" 절의 명령 블록을 다음으로 바꾼다:

```markdown
```bash
python3 build/rolling_thickness_set_seed.py --check --emit --inject   # 어서션(82건) → 시드 생성 → 두 모듈 주입(멱등)
python3 build/rolling_thickness_set_seed.py --inject                  # xlsx 없이 기존 JSON 재주입
python3 build/rolling_thickness_set_seed.py --verify                  # xlsx 없이 두 사본이 JSON 과 같은지 검사
```

시드는 압연두께Set보정관리(`/*__RTS_SEED_START__*/ var SEED=`)와 시뮬레이션(`/*__RTS_SEED_SIM_START__*/ var SEED_RTS=`)
두 곳에 같은 내용으로 들어간다. 룰 `id`(`TS-001`~)는 JSON에 기록되며 두 모듈이 같은 ID를 쓴다.
xlsx를 재적재하면 두 모듈이 함께 갱신되므로 압연두께Set보정관리의 `LS_KEY` 버전을 올리고 시뮬레이션 회귀 케이스의 핀을 재계산한다.
```

- [ ] **Step 9: 커밋**

```bash
git add build/inject_engine.py build/rolling_thickness_set_seed.py build/rolling_thickness_set_seed.json build/README.md modules/simulation.html modules/rolling-thickness-set.html
git commit -m "build: 엔진 마커 주입 스크립트, C10B2060 시드 id 기록·시뮬레이션 이중 주입·--verify"
```

---

### Task 4: 품질사양 코드 사전 항목 2개와 한 번 합류

**Files:**
- Modify: `modules/quality-spec.html:848-864` (`SEED_DICT`), `:1095-1101` (`loadState`), 상수부(`LS_KEY` 근처 836행)
- Modify: `modules/simulation.html` `SEED_DICT` (1039행 부근)

**Interfaces:**
- Produces: 사전 코드 `CUS_ROL_THK`(mm), `THK_COR_UNT`. 품질사양 결과에 `고객요청압연두께 = 0.01, 두께보정단위 = CRN`처럼 쓸 수 있고 ⑤ 매칭 `rows`에 `code:'CUS_ROL_THK'`, `'THK_COR_UNT'`로 나타난다. Task 6의 어댑터가 읽는다.

- [ ] **Step 1: `SEED_DICT`에 항목 2개를 추가한다**

`modules/quality-spec.html` `SEED_DICT` 배열의 `{ko:'시험항목', …}` 줄 다음에:

```js
 {ko:'고객요청압연두께',code:'CUS_ROL_THK',kind:'RESULT', unit:'mm', dtype:'NUMBER',dlen:'5,3', desc:'고객이 요청한 압연두께 값. 두께보정단위(CRN/PCN/TRK)에 따라 해석. 0이면 미지정'},
 {ko:'두께보정단위',    code:'THK_COR_UNT',kind:'RESULT', unit:'',   dtype:'CHAR',  dlen:'3',   desc:'고객요청압연두께의 해석 단위: CRN 기준두께에 가산 · PCN 기준두께 대비 % (칼라TCT는 도금·도막 차감 후 두께) · TRK 확정값'},
```

(`.map((d,i)=>({id:'d'+(i+1),active:true,...d}))`가 `d15`, `d16`을 붙인다.)

- [ ] **Step 2: 저장 데이터에 한 번 합류시킨다**

`const DRAFT_KEY='qspec-draft-v2';` 다음 줄에:

```js
const DICT_IMPORT_KEY='qspec-dict-imported';
const DICT_IMPORTS=['CUS_ROL_THK','THK_COR_UNT'];
/* 저장된 사전에 없는 신규 항목만 한 번 합류. 합류 이력을 남겨 사용자가 지운 항목은 되살리지 않는다 (마스터코드 asIsImports 방식) */
function mergeDictImports(st){
  let done=[];
  try{done=JSON.parse(localStorage.getItem(DICT_IMPORT_KEY))||[];}catch(e){done=[];}
  if(!Array.isArray(done))done=[];
  const pending=DICT_IMPORTS.filter(c=>!done.includes(c));
  if(!pending.length)return;
  pending.forEach(code=>{
    if(st.dict.some(d=>d.code===code))return;
    const seed=SEED_DICT.find(d=>d.code===code);
    if(!seed)return;
    const item={...seed};
    if(st.dict.some(d=>d.id===item.id))item.id='d'+(st.dict.length+1)+'-'+Date.now();
    st.dict.push(item);
  });
  try{localStorage.setItem(DICT_IMPORT_KEY,JSON.stringify(DICT_IMPORTS));}catch(e){}
}
```

`loadState()`의 `if(st&&st.specs&&st.dict)return st;`를 `if(st&&st.specs&&st.dict){mergeDictImports(st);return st;}`로 바꾼다. (`SEED_DICT`는 `const`이고 파일 상단에 선언돼 있어 `loadState` 호출 시점에 사용 가능하다.)

- [ ] **Step 3: 시뮬레이션 폴백 사전에도 추가한다**

`modules/simulation.html` `var SEED_DICT=[` 배열의 `{code:'TEST_CD',…}` 줄 다음에:

```js
  {code:'CUS_ROL_THK',ko:'고객요청압연두께',unit:'mm'},
  {code:'THK_COR_UNT',ko:'두께보정단위',unit:''}
```

(앞 항목 끝에 쉼표를 붙인다.)

- [ ] **Step 4: 브라우저 확인**

1. `modules/quality-spec.html`을 열어 코드 사전 탭에서 `CUS_ROL_THK`, `THK_COR_UNT`가 결과(RESULT) 항목으로 보이는지 확인한다.
2. 사양 등록에서 `고객사 = 110197, 품명 = 3 | 고객요청압연두께 = 0.01, 두께보정단위 = CRN`을 입력하면 파서가 두 결과를 인식해 미리보기에 코드 `CUS_ROL_THK`·`THK_COR_UNT`가 보이는지 확인한다 (저장은 하지 않아도 된다).
3. 개발자 도구 콘솔에서 `localStorage.getItem('qspec-dict-imported')` → `["CUS_ROL_THK","THK_COR_UNT"]`.

- [ ] **Step 5: 커밋**

```bash
git add modules/quality-spec.html modules/simulation.html
git commit -m "feat(quality-spec): 고객요청압연두께·두께보정단위 사전 항목 추가와 한 번 합류"
```

---

### Task 5: 시뮬레이션 기준 로딩과 주문 기본값

**Files:**
- Modify: `modules/simulation.html` — `CRIT_KEYS`(317행), `loadCriteria`(325~353행), `renderSrcBadge`(355행~), `CORE_FIELDS`(768행), `FALLBACK_LABEL`(776행), `orderFromSeed`(1086행), 임시 시드·헬퍼 신규

**Interfaces:**
- Consumes: 전역 `PltcmThicknessEngine`, `SEED_RTS` (Task 3)
- Produces (전역):
  - `CRIT.thk = { setCorrection:{live,defs:null,rules}, spCorrection:{…}, thkTolerance:{…}, coatThk:{live,map} }`
  - `CRIT.thkRules` (규격약호관리 `thkRules` 또는 `SEED_THK_RULES`), `CRIT.mngCodes` (`{코드: 코드명}`)
  - `thkTpFromSpec(order, thkRules) → {tp:'1'|'2', found:boolean, org:string}`, `defaultThkTp(order, thkRules) → string`
  - `specOrgCd(order) → string`, `codeStr(v) → string`, `splitWidths(total, n) → number[]`
  - 주문 객체에 `ORD_THK_TP`(기본값 계산), `ORD_MIX_WTH1..6`

- [ ] **Step 1: 기준 키와 임시 시드를 추가한다**

`var CRIT_KEYS={…};`를 다음으로 바꾼다:

```js
var CRIT_KEYS={consistency:'oc-state-v1',feasibility:'pfeas-bd-range-v2',
               weight:'owe-mock-v1',spec:'qspec-mock-v4',
               rts:'rts-mock-v1',specCode:'spec-code-mock-v1',masterCode:'mes-master-codes-v2',
               sp:'sp-correction-mock-v1',tol:'pltcm-tolerance-mock-v1',coat:'coating-code-mock-v1'};
/* ---- PLTCM 두께 기준 임시 시드 (스펙 4.7) — 다음 스펙의 모듈이 생기면 라이브로 교체 ---- */
var SEED_SP_RULES=[];                                              /* 조회 0건 → 0% + W_NO_SP_RULE */
var SEED_COAT_THK={E:12,A10:12,Z12:17,A15:12,M12:12};             /* 도금량코드 → 목표도금두께 µm (COAT_RANGE 이관) */
var SEED_TOL_RULES=[{id:'TOL-TMP-001',no:1,status:'Y',cond:{},llv:-0.015,ulv:0.015,note:'임시 전건 공차'}];
/* 규격약호관리 폴백 (spec-code.html 시드와 동일) */
var SEED_THK_RULES=[{id:'TK-001',no:1,specOp:'=',spec:'KS',thkStd:'BMT',status:'Y'},{id:'TK-002',no:2,specOp:'=',spec:'JIS',thkStd:'BMT',status:'Y'},
  {id:'TK-003',no:3,specOp:'=',spec:'ASTM',thkStd:'TCT',status:'Y'},{id:'TK-004',no:4,specOp:'=',spec:'EN',thkStd:'TCT',status:'Y'},
  {id:'TK-005',no:5,specOp:'=',spec:'AS',thkStd:'BMT',status:'Y'},{id:'TK-006',no:6,specOp:'=',spec:'BIS',thkStd:'',status:'F'}];
/* 두께관리코드 디코드 폴백 (마스터코드 ORD_THK_MNG_CD 와 동일) */
var SEED_MNG_CODES={'1':'규격일반:(+/-)TOL','2':'규격일반:(+/-)HALF TOL','3':'규격일반:(+)ONLY','4':'규격일반:(-)ONLY','5':'특별관리(TCT → BMT관리)','6':'특별관리(BMT → TCT관리)','A':'규격일반:(+)보정10','B':'규격일반:(-)보정10','C':'규격일반:(+)보정20','D':'규격일반:(-)보정20','E':'규격일반:(+)보정30','F':'규격일반:(-)보정30','G':'규격일반:(+)보정40','H':'규격일반:(-)보정40','J':'규격일반:(+)보정50','K':'규격일반:(-)보정50','Q':'특별관리'};
var ORG_ALIAS={JS:'JIS',AM:'ASTM'};   /* C10B2060 규격기관(2자) → 규격약호관리 규격코드 */
function codeStr(v){return v==null?'':String(v).trim();}
function specOrgCd(o){return codeStr(o&&o.SPC_AVR).slice(0,2).toUpperCase();}
function normRtsRule(r,i){
  var keys=['prod','org','spec','use','cust','thkKind','thkMng','coat','thk','wid'],cond={};
  keys.forEach(function(k){var c=(r.cond||{})[k];
    cond[k]=c?{op:c.op||'NOT_CHECK',v1:c.v1==null?'':c.v1,v2:c.v2==null?'':c.v2}:{op:'NOT_CHECK',v1:'',v2:''};});
  return {id:r.id||('TS-'+('00'+(i+1)).slice(-3)),no:r.no,status:r.status||'Y',cond:cond,adj:+r.adj,unit:r.unit||'CRN'};
}
function buildThkCriteria(rts,spc,tol,coat){
  var liveRts=!!(rts&&rts.rules&&rts.rules.length), liveSp=!!(spc&&Array.isArray(spc.rules)),
      liveTol=!!(tol&&Array.isArray(tol.rules)), liveCoat=!!(coat&&Array.isArray(coat.rows));
  var coatMap={};
  if(liveCoat)coat.rows.forEach(function(r){if(codeStr(r.status||'Y')==='Y'&&codeStr(r.code))coatMap[codeStr(r.code)]=Number(r.thkUm);});
  else coatMap=SEED_COAT_THK;
  return {
    setCorrection:{live:liveRts,defs:null,rules:(liveRts?rts.rules:SEED_RTS.rules).map(normRtsRule)},
    spCorrection: {live:liveSp, defs:null,rules:liveSp?spc.rules:SEED_SP_RULES},
    thkTolerance: {live:liveTol,defs:null,rules:liveTol?tol.rules:SEED_TOL_RULES},
    coatThk:      {live:liveCoat,map:coatMap}
  };
}
function masterCodeMap(mc,id){
  if(!Array.isArray(mc))return null;
  var rec=mc.filter(function(r){return r&&String(r.id).toUpperCase()===id;})[0];
  if(!rec||!Array.isArray(rec.codes))return null;
  var m={};rec.codes.forEach(function(c){m[codeStr(c.code)]=c.decode||'';});return m;
}
/* 주문두께구분 기본값 (스펙 4.2): 규격약호관리 두께관리기준을 엔진 매처로 판정. 칼라 품명도 같은 규칙 */
function thkTpFromSpec(order,thkRules){
  var org=specOrgCd(order), alias=ORG_ALIAS[org]||org;
  var table={defs:[{key:'spec',num:false,src:'order.SPC_ORG_CD'}],
    rules:(thkRules||[]).map(function(r){return {id:r.id,no:r.no,status:r.status,thkStd:r.thkStd,
      cond:{spec:{op:r.specOp||'=',v1:r.spec,v2:''}}};})};
  var hits=PltcmThicknessEngine.matchRules(table,{order:{SPC_ORG_CD:alias},request:{},layers:{}},{});
  if(!hits.length)return {tp:'1',found:false,org:org};
  var std=codeStr(hits[0].thkStd).toUpperCase();
  if(std==='BMT')return {tp:'1',found:true,org:org};
  if(std==='TCT')return {tp:'2',found:true,org:org};
  return {tp:'1',found:false,org:org};
}
function defaultThkTp(order,thkRules){return thkTpFromSpec(order,thkRules).tp;}
/* 주문폭을 n 등분 (소수 1자리, 합계 보정) — 시드 주문의 ORD_MIX_WTH 채움용 */
function splitWidths(total,n){
  var each=Math.floor((total/n)*10)/10,out=[],acc=0;
  for(var i=0;i<n-1;i++){out.push(each);acc=+(acc+each).toFixed(1);}
  out.push(+(total-acc).toFixed(1));return out;
}
```

- [ ] **Step 2: `loadCriteria`를 확장한다**

`loadCriteria()` 안에서 `var oc=readLS(…), … qs=readLS(CRIT_KEYS.spec);` 다음에:

```js
  var rts=readLS(CRIT_KEYS.rts), sc=readLS(CRIT_KEYS.specCode), mc=readLS(CRIT_KEYS.masterCode),
      spc=readLS(CRIT_KEYS.sp), tol=readLS(CRIT_KEYS.tol), coat=readLS(CRIT_KEYS.coat);
```

그리고 `CRIT={ … ruleTotal:138 };` 다음, `return CRIT;` 앞에:

```js
  CRIT.thk=buildThkCriteria(rts,spc,tol,coat);
  CRIT.thkRulesLive=!!(sc&&Array.isArray(sc.thkRules)&&sc.thkRules.length);
  CRIT.thkRules=CRIT.thkRulesLive?sc.thkRules:SEED_THK_RULES;
  CRIT.mngCodes=masterCodeMap(mc,'ORD_THK_MNG_CD')||SEED_MNG_CODES;
```

`renderSrcBadge()`의 세 분기 모두 마지막에 두께 기준 출처를 덧붙인다. 함수 끝(닫는 `}` 앞)에 추가:

```js
  var th=CRIT.thk;
  d.textContent+=' · 두께기준: C10B2060 '+(th.setCorrection.live?'라이브':'내장 시드')+' · 규격약호 '+(CRIT.thkRulesLive?'라이브':'내장')+
    ' · SP/공차/도금두께 '+((th.spCorrection.live&&th.thkTolerance.live&&th.coatThk.live)?'라이브':'임시 시드');
```

(`d`는 함수 첫 줄에서 `$('#src-detail')`로 잡힌 변수다.)

- [ ] **Step 3: 주문 폼 핵심 필드와 라벨을 늘린다**

`var CORE_FIELDS=[…]`에서 `'ORD_EXC_WTH',` 다음에 `'ORD_THK_TP','ORD_THK_MNG_CD','GW_ASG_CD',`를 넣는다.

`var FALLBACK_LABEL={…}`에 `ORD_THK_TP:'주문두께구분',ORD_THK_MNG_CD:'두께관리코드',GW_ASG_CD:'도금량코드',ORD_SPNL_TP:'Spangle구분',ORD_MIX_WTH1:'슬리팅폭1',ORD_MIX_WTH2:'슬리팅폭2',ORD_MIX_WTH3:'슬리팅폭3',ORD_MIX_WTH4:'슬리팅폭4',ORD_MIX_WTH5:'슬리팅폭5',ORD_MIX_WTH6:'슬리팅폭6',`을 추가한다.

- [ ] **Step 4: `orderFromSeed`의 두께구분·슬리팅 폭을 채운다**

`function orderFromSeed(so){` 안에서 `ORD_THK_TP:'1',`을 `ORD_THK_TP:defaultThkTp({SPC_AVR:so.spec,PRD_NM_CD:so.prd},(CRIT&&CRIT.thkRules)||SEED_THK_RULES),`로 바꾼다.

`return {` 앞에 `var mix=splitWidths(so.wid,6);`를 넣고, 객체 안 `ORD_LN_WGT:'24.0', ORD_SLIT_GRP_CNT:'6',` 줄 다음에:

```js
    ORD_MIX_WTH1:String(mix[0]), ORD_MIX_WTH2:String(mix[1]), ORD_MIX_WTH3:String(mix[2]),
    ORD_MIX_WTH4:String(mix[3]), ORD_MIX_WTH5:String(mix[4]), ORD_MIX_WTH6:String(mix[5]),
```

- [ ] **Step 5: 문법·동작 확인**

Run: Task 3 Step 7의 문법 확인 명령 → `syntax ok`.

브라우저에서 `modules/simulation.html`을 열고 콘솔:
```js
CRIT.thk.setCorrection.rules.length          // 82
CRIT.thk.setCorrection.rules[68].id          // 'TS-069'
CRIT.thk.coatThk.map.Z12                     // 17
defaultThkTp({SPC_AVR:'AMG-CS-B'},CRIT.thkRules)   // '2'
defaultThkTp({SPC_AVR:'KS3-CGCC'},CRIT.thkRules)   // '1'
thkTpFromSpec({SPC_AVR:'BISX'},CRIT.thkRules)      // {tp:'1',found:false,org:'BI'}
splitWidths(1225,6)                          // [204.1,204.1,204.1,204.1,204.1,204.5]
```
`localStorage.removeItem('sim-mock-v1')` 후 새로고침 → 케이스 TC-021 주문 폼 상단에 주문두께구분 `1`, 두께관리코드 `D`, 도금량코드 `Z12`가 보이고 추가 항목에 슬리팅폭1~6이 있다. 헤더 출처 배지 문구 끝에 `두께기준: C10B2060 …`이 붙는다.

- [ ] **Step 6: 커밋**

```bash
git add modules/simulation.html
git commit -m "feat(simulation): 두께 기준 로딩(ctx.thk)·임시 시드·규격약호 기본 두께구분·슬리팅 폭 시드"
```

---

### Task 6: 시뮬레이션 계산 연결 — 어댑터·파이프라인·이상징후

**Files:**
- Modify: `modules/simulation.html` — `matchSpecs`(635행), `SPEC_TO_DESIGN` 근처(812행), `mapSpecOverrides`(819행), `detectAnomalies`(832행~), `runPipeline`(896행~), 신규 함수

**Interfaces:**
- Consumes: `CRIT.thk`, `CRIT.thkRules`, `CRIT.mngCodes`, `thkTpFromSpec`, `specOrgCd`, `codeStr` (Task 5), `PltcmThicknessEngine.design`
- Produces:
  - `toThicknessInput(order, specRows, design, ctx) → {input, notes:[{kind,detail,ref}], specSrcs:{request:[], paint:[]}}`
  - `applyThicknessDesign(design, order, sm, ctx) → {result, input, notes, specSrcs}` — `design.cgl.thk` 값 객체, `design.cgl.pltcm`의 `'X-Ray Set두께값'`·`'두께목표값'` 교체 + `'두께하한'`·`'두께상한'` 행 삽입
  - `runPipeline` 반환에 `thkCalc`, `thkInput`, `thkSpecSrcs`, `thkTp`; ⑥ `stage.detail`에 `thkCalc`, `thkInput`, `thkNotes`
  - 이상징후 kind: `thk-design-error`(error), `thk-design-warn`, `thk-request-invalid`, `thk-input-warn`, `thk-tp-mismatch`, `thk-tp-default`(warn)
  - `SPEC_TO_ENGINE`

- [ ] **Step 1: ⑤ 매칭 행에 연산자와 원값을 남긴다**

`matchSpecs` 안 `row.val=(r.op==='='||r.op==='~'?'':r.op+' ')+r.val;` 다음 줄에 `row.op=r.op;row.rawVal=r.val;`를 넣는다.

- [ ] **Step 2: 어댑터와 적용 함수를 추가한다**

`var SPEC_TO_DESIGN={…};` 다음에:

```js
/* ⑥ 엔진이 소비하는 사양 코드 — 설계값 경로가 아니므로 mapped/unmapped 어디에도 넣지 않는다 (스펙 4.3-6) */
var SPEC_TO_ENGINE={CUS_ROL_THK:'request.value',THK_COR_UNT:'request.unit',TOP_THK:'layers.paintFrontUm'};
var THK_TP_NM={'1':'1 : BMT','2':'2 : TCT','3':'3 : 칼라TCT'};
function specRowVal(rows,code){
  var r=(rows||[]).filter(function(x){return x.code===code&&x.srcs&&x.srcs.length;})[0];
  if(!r)return null;
  return {op:r.op||'=',val:r.rawVal!=null?r.rawVal:r.val,srcs:r.srcs};
}
function setKv(rows,label,val){
  for(var i=0;i<rows.length;i++)if(rows[i][0]===label){rows[i][1]=val;return i;}
  rows.push([label,val]);return rows.length-1;
}
function insertKvAfter(rows,afterLabel,label,val){
  for(var i=0;i<rows.length;i++)if(rows[i][0]===label){rows[i][1]=val;return;}
  var at=rows.length;
  for(var j=0;j<rows.length;j++)if(rows[j][0]===afterLabel){at=j+1;break;}
  rows.splice(at,0,[label,val]);
}
/* 엔진 입력 조립 (스펙 4.1) */
function toThicknessInput(order,specRows,design,ctx){
  var notes=[],req={value:0,unit:''},specSrcs={request:[],paint:[]};
  var v=specRowVal(specRows,'CUS_ROL_THK');
  if(v){
    if(v.op!=='=')notes.push({kind:'thk-request-invalid',detail:'고객요청압연두께 사양의 연산자가 = 가 아닙니다: '+v.op+' '+v.val,ref:'CUS_ROL_THK'});
    else{var n=parseFloat(v.val);
      if(isFinite(n)){req.value=n;specSrcs.request=v.srcs;}
      else notes.push({kind:'thk-request-invalid',detail:'고객요청압연두께 값이 숫자가 아닙니다: '+v.val,ref:'CUS_ROL_THK'});}
  }
  var u=specRowVal(specRows,'THK_COR_UNT');
  if(u&&u.op==='=')req.unit=codeStr(u.val).toUpperCase();
  var coatMap=(ctx.thk&&ctx.thk.coatThk&&ctx.thk.coatThk.map)||{};
  var gw=codeStr(order.GW_ASG_CD), gal=Number(coatMap[gw]);
  if(!isFinite(gal)){notes.push({kind:'thk-input-warn',detail:'도금량코드 '+(gw||'(없음)')+'의 목표도금두께가 없어 0으로 계산합니다',ref:'GW_ASG_CD'});gal=0;}
  var pf=0,pb=0,tt=null;
  if(design&&design.color){
    tt=specRowVal(specRows,'TOP_THK');
    pf=parseFloat(tt&&tt.op==='='?tt.val:design.color.sum.thkT);if(!isFinite(pf))pf=0;
    if(tt&&tt.op==='=')specSrcs.paint=tt.srcs;
    pb=parseFloat(design.color.sum.thkB);if(!isFinite(pb))pb=0;
  }
  var mix=[];
  for(var i=1;i<=10;i++){var w=order['ORD_MIX_WTH'+i];if(w!=null&&String(w).trim()!=='')mix.push(num(w));}
  return {input:{
    order:{PRD_NM_CD:codeStr(order.PRD_NM_CD),SPC_ORG_CD:specOrgCd(order),SPC_AVR:codeStr(order.SPC_AVR),
      ORD_USG_CD:codeStr(order.ORD_USG_CD),FNL_CUS_CD:codeStr(order.FNL_CUS_CD),ORD_THK_TP:codeStr(order.ORD_THK_TP),
      ORD_THK_MNG_CD:codeStr(order.ORD_THK_MNG_CD),GW_ASG_CD:gw,ORD_EXC_THK:num(order.ORD_EXC_THK),
      ORD_EXC_WTH:num(order.ORD_EXC_WTH),ORD_SLIT_GRP_CNT:num(order.ORD_SLIT_GRP_CNT),ORD_MIX_WTH:mix,
      MAT_CD:codeStr(order.MAT_CD),ORD_SPNL_TP:codeStr(order.ORD_SPNL_TP)},
    request:req,layers:{galThkUm:gal,paintFrontUm:pf,paintBackUm:pb}},notes:notes,specSrcs:specSrcs};
}
/* 공통 섹션의 세 행을 주문 필드와 동기화 (스펙 4.3-2) */
var COAT_CD_NM={};Object.keys(COAT_CD).forEach(function(k){var s=COAT_CD[k];COAT_CD_NM[s.split(' :')[0]]=s;});
function syncCommonRows(design,order,ctx){
  var tp=codeStr(order.ORD_THK_TP),mng=codeStr(order.ORD_THK_MNG_CD),gw=codeStr(order.GW_ASG_CD);
  setKv(design.common,'주문두께구분',THK_TP_NM[tp]||tp);
  setKv(design.common,'두께관리코드',mng?(mng+' : '+(ctx.mngCodes[mng]||'')):'');
  setKv(design.common,'도금량코드',gw?(COAT_CD_NM[gw]||gw):'');
}
/* ⑥ 값 교체 (스펙 4.3-3) — design 에는 값만 넣는다 */
function applyThicknessDesign(design,order,sm,ctx){
  var built=toThicknessInput(order,sm.rows,design,ctx);
  var result=PltcmThicknessEngine.design(built.input,ctx.thk);
  var v=result.values, f3=function(x){return x==null?'':Number(x).toFixed(3);};
  design.cgl.thk={path:result.path,CRM_THK:v.CRM_THK,PLTCM_THK_TRV:v.PLTCM_THK_TRV,PLTCM_SET_THK_TRV:v.PLTCM_SET_THK_TRV,
                  PLTCM_THK_LLV:v.PLTCM_THK_LLV,PLTCM_THK_ULV:v.PLTCM_THK_ULV};
  setKv(design.cgl.pltcm,'X-Ray Set두께값',result.ok?f3(v.PLTCM_SET_THK_TRV):'');
  setKv(design.cgl.pltcm,'두께목표값',result.ok?f3(v.PLTCM_THK_TRV)+' ('+f3(v.PLTCM_THK_LLV)+' ~ '+f3(v.PLTCM_THK_ULV)+')':'');
  insertKvAfter(design.cgl.pltcm,'두께목표값','두께하한',result.ok?f3(v.PLTCM_THK_LLV):'');
  insertKvAfter(design.cgl.pltcm,'두께하한','두께상한',result.ok?f3(v.PLTCM_THK_ULV):'');
  return {result:result,input:built.input,notes:built.notes,specSrcs:built.specSrcs};
}
```

- [ ] **Step 3: `mapSpecOverrides`가 엔진 소비 코드를 제외하게 한다**

`mapSpecOverrides` 안의

```js
    var p=SPEC_TO_DESIGN[r.code];
    if(p)mapped.push({code:r.code,ko:r.ko,path:p,val:r.val,base:r.base,srcs:r.srcs});
    else unmapped.push({code:r.code,ko:r.ko,val:r.val,base:r.base,srcs:r.srcs});
```

를

```js
    var p=SPEC_TO_DESIGN[r.code];
    if(p)mapped.push({code:r.code,ko:r.ko,path:p,val:r.val,base:r.base,srcs:r.srcs});
    else if(SPEC_TO_ENGINE[r.code]){/* ⑥ 두께 엔진이 소비 — 미연결 아님 */}
    else unmapped.push({code:r.code,ko:r.ko,val:r.val,base:r.base,srcs:r.srcs});
```

로 바꾼다.

- [ ] **Step 4: `runPipeline`을 바꾼다**

`var design=genDetail(toDesign(order));` 다음 줄에 `syncCommonRows(design,order,ctx);`를 넣는다.

`stages.push(stage(6,'설계값 산출','P',{design:design}));`를 다음으로 바꾼다:

```js
  var thk=applyThicknessDesign(design,order,sm,ctx);
  var thkTp=thkTpFromSpec(order,ctx.thkRules);
  stages.push(stage(6,'설계값 산출',thk.result.ok?'P':'F',
    {design:design,thkCalc:thk.result,thkInput:thk.input,thkNotes:thk.notes,thkSpecSrcs:thk.specSrcs}));
```

`var anomalies=detectAnomalies({…});` 호출 객체에 `thk:thk,thkTp:thkTp,order:order,`를 추가한다.

`return {stages:stages,design:design,specMatch:sm,anomalies:anomalies,`에 `thkCalc:thk.result,thkInput:thk.input,thkSpecSrcs:thk.specSrcs,thkTp:thkTp,`를 추가한다.

- [ ] **Step 5: 이상징후를 올린다**

`detectAnomalies` 안 `return out;` 바로 앞에:

```js
  if(ctx.thk){
    var tr=ctx.thk.result;
    if(tr.error)out.push(anomaly('thk-design-error','error','두께설계 실패',tr.error.code+' — '+tr.error.message+' ('+tr.error.stage+')',tr.error.code));
    tr.warnings.forEach(function(w){out.push(anomaly('thk-design-warn','warn','두께설계 경고',w.code+' — '+w.message,w.code));});
    ctx.thk.notes.forEach(function(n){
      out.push(anomaly(n.kind,'warn',n.kind==='thk-request-invalid'?'고객요청 사양 오류':'두께 입력 경고',n.detail,n.ref));});
  }
  if(ctx.thkTp&&ctx.order){
    var otp=codeStr(ctx.order.ORD_THK_TP);
    if(!ctx.thkTp.found)out.push(anomaly('thk-tp-default','warn','두께구분 기준 없음',
      '규격기관 '+(ctx.thkTp.org||'(없음)')+'의 두께관리기준이 없거나 미확정입니다 — 규격 기본값은 1(BMT)',null));
    else if(ctx.thkTp.tp!==otp)out.push(anomaly('thk-tp-mismatch','warn','두께구분 불일치',
      '주문 두께구분 '+(otp||'(없음)')+' · 규격 기준 '+ctx.thkTp.tp,null));
  }
```

- [ ] **Step 6: 문법·동작 확인**

Run: 문법 확인 명령 → `syntax ok`.

브라우저에서 `localStorage.removeItem('sim-mock-v1')` 후 `modules/simulation.html` 새로고침, 케이스 **TC-021**(GI 0.44 × 1225) 선택 → [▶ 실행]. 기대:
- 파이프라인 바 ⑥ `P`. 콘솔 `run.thkCalc.applied.setRule.id` → `'TS-069'`, `run.thkCalc.values.PLTCM_SET_THK_TRV` → `0.42`, `run.design.cgl.pltcm` 에 `['X-Ray Set두께값','0.420']`, `['두께목표값','0.420 (0.404 ~ 0.435)']`, `['두께하한','0.404']`, `['두께상한','0.435']`
- `run.anomalies`에 `thk-design-warn` `W_NO_SP_RULE` 1건. `thk-tp-mismatch`·`thk-tp-default` 없음. `spec-unmapped` 없음.
- `run.design.common`의 주문두께구분 행이 `'1 : BMT'`, 두께관리코드 행이 `'D : 규격일반:(-)보정20'`, 도금량코드 행이 `'Z12 : 120 g/㎡'`.
- 주문 폼에서 주문환산두께를 `0.26`으로 바꾸고 실행 → ⑥ `F`, 이상징후에 `두께설계 실패 KK82`, 두 값 빈칸.

- [ ] **Step 7: 커밋**

```bash
git add modules/simulation.html
git commit -m "feat(simulation): ⑥ 설계값 산출을 두께 엔진 결과로 교체 — 어댑터·공통행 동기화·이상징후"
```

---

### Task 7: 시뮬레이션 화면 — 근거 밴드와 근거 추적 층

**Files:**
- Modify: `modules/simulation.html` — `renderStage` `else` 분기(1533행 부근), `provFor`(1538행), 신규 `renderThkBand`

**Interfaces:**
- Consumes: ⑥ `stage.detail.thkCalc`·`thkInput`, `run.thkCalc`·`thkInput`·`thkSpecSrcs`, `CRIT.thk.*.live`
- Produces: ⑥ 상세 상단 "PLTCM 두께 계산 근거" 밴드, 근거 추적 층 `{cls:'prv calc', label:'기준 계산', …}`·`{cls:'prv', label:'사양', …}`

- [ ] **Step 1: 근거 밴드 렌더러를 추가한다**

`function renderStage(){` 바로 앞에:

```js
function fmtStepOut(v){
  if(v==null)return '—';
  if(typeof v==='number')return String(v);
  if(typeof v==='object')return Object.keys(v).map(function(k){return k+'='+(v[k]==null?'—':(typeof v[k]==='number'?v[k]:JSON.stringify(v[k])));}).join(' · ');
  return String(v);
}
function renderThkBand(d){
  var r=d.thkCalc,inp=d.thkInput;if(!r||!inp)return '';
  var v=r.values,a=r.applied,f3=function(x){return x==null?'—':Number(x).toFixed(3);};
  var src=function(k){var t=CRIT.thk[k];return t&&t.live?'라이브':'임시 시드';};
  var kv=function(items){return '<div class="kv-grid">'+items.map(function(it){
    return '<div class="kv"><label>'+esc(it[0])+'</label><span class="val" style="cursor:default">'+esc(it[1])+'</span></div>';}).join('')+'</div>';};
  var h='<div class="band-title">PLTCM 두께 계산 근거 <span class="pill '+(r.ok?'sent':'fail')+'">'+(r.ok?'계산 성공':'실패 '+esc(r.error.code))+
        '</span> <span class="code-badge">'+esc(r.path||'')+'</span></div>';
  h+=kv([['주문두께',f3(v.ORD_EXC_THK)],['압연목표 (CRM_THK)',f3(v.CRM_THK)],['출측두께 (PLTCM_THK_TRV)',f3(v.PLTCM_THK_TRV)],
         ['X-Ray SET (PLTCM_SET_THK_TRV)',f3(v.PLTCM_SET_THK_TRV)],['하한 ~ 상한',f3(v.PLTCM_THK_LLV)+' ~ '+f3(v.PLTCM_THK_ULV)]]);
  var setTxt='—';
  if(a.setRule){
    if(a.setRule.id)setTxt=a.setRule.id+' · 순번 '+a.setRule.no+' · '+(a.setRule.adj>0?'+':'')+a.setRule.adj+' '+a.setRule.unit;
    else setTxt='후보 '+a.setRule.candidates.length+'건: '+a.setRule.candidates.map(function(c){return c.id+'(no.'+c.no+' '+(c.adj>0?'+':'')+c.adj+')';}).join(', ');
  }
  h+='<div class="band-title">적용 기준</div><div class="tbl-scroll"><table class="grid"><thead><tr><th>기준</th><th>출처</th><th>적용</th></tr></thead><tbody>'
    +'<tr><td>C10B2060 보정</td><td>'+src('setCorrection')+'</td><td class="mono">'+esc(setTxt)+'</td></tr>'
    +'<tr><td>C10B2070 SP</td><td>'+src('spCorrection')+'</td><td class="mono">'+(a.spRule?esc(a.spRule.id+' · '+a.spRule.rate+'%'):'0건')+' → 적용 '+esc(a.spRate)+'%</td></tr>'
    +'<tr><td>C10B2190 공차</td><td>'+src('thkTolerance')+'</td><td class="mono">'+(a.tolRule?esc(a.tolRule.id+' · '+a.tolRule.llv+' / +'+a.tolRule.ulv):'—')+'</td></tr>'
    +'<tr><td>목표도금두께</td><td>'+src('coatThk')+'</td><td class="mono">'+esc(inp.order.GW_ASG_CD+' → '+inp.layers.galThkUm+' µm')+'</td></tr>'
    +'<tr><td>적용폭</td><td>주문</td><td class="mono">'+esc(a.applyWidth)+'</td></tr></tbody></table></div>';
  h+='<div class="band-title">계산 단계</div><div class="tbl-scroll"><table class="grid"><thead><tr><th>#</th><th>단계</th><th>산식</th><th>결과</th></tr></thead><tbody>'
    +r.steps.map(function(s){var bad=r.error&&r.error.stepNo===s.no;
      return '<tr'+(bad?' class="ovr"':'')+'><td>'+s.no+'</td><td>'+esc(s.name)+'</td><td class="mono">'+esc(s.formula)+'</td>'
        +'<td class="mono">'+esc(fmtStepOut(s.output))+(s.note?' <span class="cell-sub">'+esc(s.note)+'</span>':'')+'</td></tr>';}).join('')
    +'</tbody></table></div>';
  if(r.warnings.length)h+='<div class="band-title">경고</div><div class="pad">'+r.warnings.map(function(w){
    return '<div style="margin-bottom:4px"><span class="pill warn">'+esc(w.code)+'</span> '+esc(w.message)+'</div>';}).join('')+'</div>';
  h+='<div class="band-title">입력 요약</div>'+kv([['두께구분 / 관리코드',inp.order.ORD_THK_TP+' / '+inp.order.ORD_THK_MNG_CD],
    ['규격기관 / 규격약호',inp.order.SPC_ORG_CD+' / '+inp.order.SPC_AVR],['고객요청 값 / 단위',inp.request.value+' / '+(inp.request.unit||'—')],
    ['도막 전 / 후 (µm)',inp.layers.paintFrontUm+' / '+inp.layers.paintBackUm],['재질 / Spangle',inp.order.MAT_CD+' / '+inp.order.ORD_SPNL_TP],
    ['적용폭',a.applyWidth]]);
  return '<div class="pad">'+h+'</div>';
}
```

- [ ] **Step 2: ⑥ 상세에 밴드를 붙인다**

`renderStage`의 마지막 분기 `}else{ p.innerHTML=head+renderDesign(); }`를 `}else{ p.innerHTML=head+renderThkBand(d)+renderDesign(); }`로 바꾼다.

- [ ] **Step 3: 근거 추적 층을 추가한다**

`function provFor(path){` 첫 줄 `var out=[], c=currentCase();` 다음에:

```js
  var THK_PATHS={'cgl.pltcm.X-Ray Set두께값':1,'cgl.pltcm.두께목표값':1,'cgl.pltcm.두께하한':1,'cgl.pltcm.두께상한':1};
  if(THK_PATHS[path]&&run.thkCalc){
    var r=run.thkCalc,a=r.applied,f3=function(x){return x==null?'—':Number(x).toFixed(3);};
    out.push({cls:'prv calc',label:'기준 계산',
      detail:'경로 '+r.path+(a.setRule&&a.setRule.id?' · C10B2060 '+a.setRule.id+' 보정 '+(a.setRule.adj>0?'+':'')+a.setRule.adj+' '+a.setRule.unit:'')+
        ' · SP '+a.spRate+'%'+(a.tolRule?' · 공차 '+a.tolRule.llv+' / +'+a.tolRule.ulv:'')+
        ' · 출측 '+f3(r.values.PLTCM_THK_TRV)+' → SET '+f3(r.values.PLTCM_SET_THK_TRV)+(r.error?' · 실패 '+r.error.code:''),
      jump:'#/quality-design/module-management/rolling-thickness-set'});
    if(run.thkInput.request.value!==0)
      out.push({cls:'prv',label:'사양',detail:(run.thkSpecSrcs.request||[]).join(' → ')+' → 고객요청 '+run.thkInput.request.value+' '+(run.thkInput.request.unit||''),
        jump:'#/quality-design/module-management/quality-spec'});
    if(run.thkSpecSrcs.paint&&run.thkSpecSrcs.paint.length)
      out.push({cls:'prv',label:'사양',detail:run.thkSpecSrcs.paint.join(' → ')+' → 전면 도막 '+run.thkInput.layers.paintFrontUm+' µm',
        jump:'#/quality-design/module-management/quality-spec'});
    return out;
  }
```

- [ ] **Step 4: 브라우저 확인**

TC-021 실행 후 ⑥ 탭: 밴드에 두께 4개 연쇄(0.440 / 0.420 / 0.420 / 0.420, 0.404 ~ 0.435), 적용 기준 표(C10B2060 라이브 또는 내장 시드 · `TS-069 · 순번 69 · -0.02 CRN`, SP 임시 시드 0건 → 0%, 공차 `TOL-TMP-001 · -0.015 / +0.015`), 계산 단계 9행, 경고 `W_NO_SP_RULE`. 설계결과 용융도금 섹션의 `X-Ray Set두께값` 값을 클릭하면 우측 근거 추적에 `기준 계산` 층이 뜨고 "원본 화면 열기"가 압연두께Set보정관리로 향한다. 두께 0.26 케이스에서는 밴드 상단 `실패 KK82`, 계산 단계 4행이 강조된다.

- [ ] **Step 5: 커밋**

```bash
git add modules/simulation.html
git commit -m "feat(simulation): ⑥ PLTCM 두께 계산 근거 밴드와 근거 추적 층"
```

---

### Task 8: 회귀 케이스 5건과 사양 시드

**Files:**
- Modify: `modules/simulation.html` — `SEED_SPECS`(1060행 부근), `seedCases`(1115행), `LS_KEY`(1082행)

**Interfaces:**
- Consumes: Task 6·7의 실행 결과 경로 `cgl.pltcm.X-Ray Set두께값` 등
- Produces: 케이스 `TC-031`~`TC-035`. `LS_KEY`를 `'sim-mock-v2'`로 올려 새 시드가 적재되게 한다 (기존 저장 케이스는 사용자가 [시드 초기화]하지 않는 한 v1에 남는다 — 스펙 4.2·4.8의 "마이그레이션하지 않는다").

- [ ] **Step 1: 고객요청 사양 시드를 추가한다**

`var SEED_SPECS=[` 배열 끝(`{specNo:'320104-L01',…}` 항목 뒤)에 추가:

```js
  ,{specNo:'110197-304',cusCd:'110197',prdNm:'3',status:'확정',rev:1,author:'김민석',
   conds:[{code:'ORD_THK_MNG_CD',ko:'두께관리코드',op:'=',val:'D'}],
   results:[{code:'CUS_ROL_THK',ko:'고객요청압연두께',op:'=',val:'0.01',unit:'mm'},
            {code:'THK_COR_UNT',ko:'두께보정단위',op:'=',val:'CRN',unit:''}]}
```

조건 `두께관리코드 = D`는 케이스 (c)(관리코드 D)에만 맞고 (d)·(e)(관리코드 Q)에는 맞지 않게 하기 위한 것이다. 이 사양은 폴백(내장) 사양에만 있다. 라이브 품질사양(`qspec-mock-v4`)이 있으면 케이스 (c)를 위해 품질사양 관리에서 `고객사 = 110197, 품명 = 3, 두께관리코드 = D | 고객요청압연두께 = 0.01, 두께보정단위 = CRN`을 확정 상태로 등록한다 (조건 없이 등록하면 (d)·(e)가 CUSTOMER 경로로 빠진다).

- [ ] **Step 2: 케이스를 추가한다**

`var LS_KEY='sim-mock-v1';`를 `var LS_KEY='sim-mock-v2';`로 바꾼다.

`function seedCases(){` 안 `return [` 배열의 마지막 항목(TC-024) 뒤에 추가:

```js
    ,(function(){var o=orderFromSeed(SEED_ORDERS.filter(function(x){return x.no==='D260831021';})[0]);
      return {id:'TC-031',name:'GI 0.44 — C10B2060 no.69 1건 · SET 0.420',baseOrderRef:orderKey(o),order:o,
        expect:{pins:[{path:'cgl.pltcm.X-Ray Set두께값',label:'X-Ray SET',op:'=',val:'0.420'},
                      {path:'cgl.pltcm.두께목표값',label:'두께목표값',op:'~',val:'0.420'},
                      {path:'cgl.pltcm.두께하한',label:'두께하한',op:'=',val:'0.404'},
                      {path:'cgl.pltcm.두께상한',label:'두께상한',op:'=',val:'0.435'}],
                verdicts:[{stage:6,expect:'P'}],golden:null,goldenAt:null},lastRun:null,author:'목업 사용자'};})()
    ,(function(){var o=orderFromSeed(SEED_ORDERS.filter(function(x){return x.no==='D260831021';})[0]);o.ORD_EXC_THK='0.260';
      return {id:'TC-032',name:'GI 0.26 — KK82 (no.69 하한 0.27 미만)',baseOrderRef:orderKey(o),order:o,
        expect:{pins:[],verdicts:[{stage:6,expect:'F'}],golden:null,goldenAt:null},lastRun:null,author:'목업 사용자'};})()
    ,(function(){var o=orderFromSeed(SEED_ORDERS[0]);
      return {id:'TC-033',name:'CCGI 0.45 — CUSTOMER 고객요청 +0.01 CRN (사양 110197-304 필요)',baseOrderRef:orderKey(o),order:o,
        expect:{pins:[{path:'cgl.pltcm.X-Ray Set두께값',label:'X-Ray SET',op:'=',val:'0.460'},
                      {path:'cgl.pltcm.두께하한',label:'두께하한',op:'=',val:'0.445'},
                      {path:'cgl.pltcm.두께상한',label:'두께상한',op:'=',val:'0.475'}],
                verdicts:[{stage:6,expect:'P'}],golden:null,goldenAt:null},lastRun:null,author:'목업 사용자'};})()
    ,(function(){var o=orderFromSeed(SEED_ORDERS[0]);o.ORD_THK_MNG_CD='Q';o.ORD_USG_CD='C11004';
      return {id:'TC-034',name:'CCGI 관리코드 Q · 용도 C11004 — KK83 (no.14 + no.27)',baseOrderRef:orderKey(o),order:o,
        expect:{pins:[],verdicts:[{stage:6,expect:'F'}],golden:null,goldenAt:null},lastRun:null,author:'목업 사용자'};})()
    ,(function(){var o=orderFromSeed(SEED_ORDERS[0]);o.ORD_THK_MNG_CD='Q';
      return {id:'TC-035',name:'CCGI 관리코드 Q — 고객사 110197 룰 no.27 · SET 0.410',baseOrderRef:orderKey(o),order:o,
        expect:{pins:[{path:'cgl.pltcm.X-Ray Set두께값',label:'X-Ray SET',op:'=',val:'0.410'},
                      {path:'cgl.pltcm.두께하한',label:'두께하한',op:'=',val:'0.394'},
                      {path:'cgl.pltcm.두께상한',label:'두께상한',op:'=',val:'0.425'}],
                verdicts:[{stage:6,expect:'P'}],golden:null,goldenAt:null},lastRun:null,author:'목업 사용자'};})()
```

기대값 근거: (a) `0.44 − 0.02 = 0.42`, 하한 `truncate3(0.42 − 0.015 = 0.40499999999999997) = 0.404`. (c) `0.45 + 0.01 = 0.46`, 하한 0.445 / 상한 `truncate3(0.47500000000000003) = 0.475`. (e) `0.45 − 0.04 = 0.41000000000000003 → 출측 0.410 → SET 0.410`, 하한 `truncate3(0.39499999999999996) = 0.394`, 상한 0.425. TC-033의 주문은 관리코드 D라 사양 110197-304가 맞고, TC-034·TC-035는 관리코드 Q라 맞지 않아 고객요청 0으로 STANDARD 경로에 들어간다.

- [ ] **Step 3: 브라우저 확인**

새로고침(LS_KEY v2로 시드 재적재) → [전체 재실행]. 기대 상태: TC-031 PASS 또는 경고(`W_NO_SP_RULE` 경고가 anomaly로 잡혀 '경고'가 정상), TC-032 PASS/경고(⑥ F 판정 일치), TC-033 PASS/경고, TC-034 PASS/경고, TC-035 PASS/경고. 핀 불일치(`✕`)가 하나라도 있으면 값이 아니라 원인을 찾는다(룰 ID·경로·사양 상태). 콘솔에서 `state.cases.map(function(c){return c.id+':'+c.lastRun.status+' pins '+c.lastRun.pinPass+'/'+c.lastRun.pinTotal;})`로 요약한다.

- [ ] **Step 4: 커밋**

```bash
git add modules/simulation.html
git commit -m "test(simulation): PLTCM 두께 회귀 케이스 5건(no.69·KK82·CUSTOMER·KK83·no.27)과 고객요청 사양 시드"
```

---

### Task 9: 압연두께Set보정관리 문구 정정

**Files:**
- Modify: `modules/rolling-thickness-set.html` 218·245·269·271·302·613·615·682행 (문자열로 찾는다)

- [ ] **Step 1: 8곳을 바꾼다**

| 찾을 문자열 | 바꿀 문자열 |
|---|---|
| `Set 두께 = 주문두께 + 보정치.</p>` (218행) | `압연목표두께(보정 후) = 주문두께 ± 보정치. SET 확정(도금 차감·SP·절삭·0.005 눈금)은 시뮬레이션 ⑥에서 합니다.</p>` |
| `계산된 Set 두께를 확인합니다. 상태 Y(사용중) 룰만 사용하며 순번이 빠른 룰이 적용됩니다.` (245행) | `압연목표두께(보정 후)를 확인합니다. 상태 Y(사용중) 룰만 사용합니다. AS-IS 설계는 정확히 1건을 요구하며 다건은 KK83 실패입니다. 여기서는 후보를 순번 순으로 보여줍니다.` |
| `여러 룰이 매칭되면 순번(0=예외 우선) 순으로 정렬되며 첫 번째 룰이 <b>적용</b>됩니다. 나머지는 후보로 표시합니다.` (269행) | `여러 룰이 매칭되면 순번(0=예외 우선) 순으로 정렬해 첫 번째를 <b>적용</b>으로 표시하지만, AS-IS 설계에서는 다건이 KK83 실패입니다. 나머지는 후보로 표시합니다.` |
| `보정 −0.04 적용, Set 두께 0.41.` (271행) | `보정 −0.04 적용, 압연목표두께 0.41.` |
| `<b>Set 두께 = 주문두께 + 보정치</b>` (302행) | `<b>압연목표두께(보정 후) = 주문두께 ± 보정치</b>. SET 확정은 시뮬레이션 ⑥` |
| `조건에 맞는 사용중(Y) 룰이 없습니다 — 보정 없음(0)으로 처리` (613행) | `조건에 맞는 사용중(Y) 룰이 없습니다 — AS-IS 설계에서는 KK82 실패 (보정 0 아님)` |
| `<div class="lbl">Set 두께 (mm)</div>` (615행) | `<div class="lbl">압연목표두께(보정 후, mm)</div>` |
| `mm · Set 두께 = 주문두께 ` (682행) | `mm · 압연목표두께 = 주문두께 ` |

`grep -n "Set 두께" modules/rolling-thickness-set.html`이 시드 구간 밖에서 0건이어야 한다.

- [ ] **Step 2: 브라우저 확인**

`modules/rolling-thickness-set.html` 단독 실행: 목록 소개문, 간편판정 안내·힌트·결과 카드 라벨, 범례, 상세 드로어 문구가 바뀌었는지 본다. 간편판정에서 조건을 비워 판정하면 0건 문구에 `KK82 실패`가 보인다.

- [ ] **Step 3: 커밋**

```bash
git add modules/rolling-thickness-set.html
git commit -m "docs(rolling-thickness-set): 간편판정 'Set 두께' 표현을 압연목표두께로 정정, 0건·다건 AS-IS 의미 명시"
```

---

### Task 10: README 마무리 · 재빌드 · 수동 검증

**Files:**
- Modify: `build/README.md` (소스 구조 표, 작업 순서, 구현 메모)
- Regenerate: `index.html`

- [ ] **Step 1: README를 갱신한다**

"## 소스 구조" 표에 행 추가:

```markdown
| `assets/pltcm-thickness-engine.js` · `tests/pltcm-thickness-engine.test.js` | PLTCM 압연 SET 두께 계산 엔진(AS-IS 재현, 순수 함수)과 `node:test` 골든 테스트. 시뮬레이션 모듈 마커 구간에 `build/inject_engine.py`로 주입 |
| `build/inject_engine.py` | 엔진 → 모듈 마커 주입, `--check` |
```

`modules/simulation.html` 행 설명 끝에 ` ⑥ 설계값 산출의 X-Ray Set두께값·두께목표값은 두께 엔진 계산값(근거 밴드·근거 추적·회귀 케이스 TC-031~035). 기준: C10B2060 라이브/내장 시드, SP·공차·도금두께는 임시 시드(스펙 4.7 provider 계약)`를 덧붙인다.

"## 작업 순서"를 다음으로 바꾼다:

```markdown
0. (룰 데이터를 바꿀 때만) 원본 xlsx 확보 → `python3 build/clean_rules.py --check --emit --inject` / `python3 build/rolling_thickness_set_seed.py --check --emit --inject`
1. 소스 수정 (모듈 화면·기능은 `modules/*.html`, 두께 엔진은 `assets/pltcm-thickness-engine.js`)
2. 엔진을 고쳤으면 `node --test tests/pltcm-thickness-engine.test.js` → `python3 build/inject_engine.py`
3. `python3 build/inject_engine.py --check && python3 build/rolling_thickness_set_seed.py --verify`
4. `python3 build/build_single.py` 로 `index.html` 재생성
5. 브라우저에서 `index.html` 열어 확인
6. `git add -A && git commit` → `git push` (푸시는 GitHub 토큰 필요)
```

"## 주요 구현 메모"에 추가:

```markdown
- 시뮬레이션 두께 기준 provider 계약(라이브 localStorage 키·형태)은 스펙 `design/specs/2026-09-09-pltcm-thickness-engine-design.md` 4.7. 다음 단계 모듈(SP보정율·도금량코드·PLTCM공차)은 이 계약을 만족하는 상태를 저장하면 시뮬레이션 `loadCriteria`만 고쳐 연결된다
- 시뮬레이션 `LS_KEY`는 `sim-mock-v2`. 저장된 v1 케이스는 마이그레이션하지 않는다 (시드 초기화로 v2 적재)
```

- [ ] **Step 2: 검증 게이트를 모두 돌린다**

Run:
```bash
node --test tests/pltcm-thickness-engine.test.js && python3 build/inject_engine.py --check && python3 build/rolling_thickness_set_seed.py --verify && python3 build/build_single.py && grep -c "__PLTCM_ENGINE_START__" index.html && grep -c "__RTS_SEED_START__" index.html && grep -c "__RTS_SEED_SIM_START__" index.html
```
Expected: 테스트 `# fail 0`, `ENGINE OK`, `VERIFY OK` 2줄, 빌드 완료 메시지, grep 세 줄 각각 `1`

- [ ] **Step 3: 포털에서 수동 검증**

`index.html`을 열어:
1. 시뮬레이션 메뉴 → 케이스 TC-031 실행 → ⑥ 근거 밴드, 값 0.420 / 0.404~0.435, 근거 추적 `기준 계산` 층, "원본 화면 열기"가 압연두께Set보정관리로 이동.
2. TC-032 → ⑥ F, 이상징후 `두께설계 실패 KK82`.
3. 압연두께Set보정관리 방문(라이브 생성) → 시뮬레이션 재실행 → 출처 배지 `C10B2060 라이브`, TC-031 값 동일.
4. 품질사양 관리 → 사전에 새 항목 2개. 사양 `고객사 = 110197, 품명 = 3 | 고객요청압연두께 = 0.01, 두께보정단위 = CRN` 등록·확정 → 시뮬레이션 TC-033 재실행 → SET 0.460, 근거 추적에 `사양` 층(specNo).
5. 규격약호관리에서 KS 두께관리기준을 TCT로 바꾸고 시뮬레이션 TC-031 재실행 → 이상징후 `두께구분 불일치` (주문 1 · 규격 2). 되돌린다.
6. 압연두께Set보정관리 문구 8곳.

- [ ] **Step 4: 커밋**

```bash
git add build/README.md index.html
git commit -m "build: README 엔진·검증 절차 갱신, PLTCM 두께 엔진 반영 index.html 재생성"
```

---

## 자체 검토 결과

**스펙 커버리지**
- 1.1 파일·UMD → Task 1, 3. 1.2 주입·줄끝·명령 → Task 3, 10. 1.3 데이터 흐름·폴백 → Task 5.
- 2.x 인터페이스 → Task 1, 2 (`applied.*` 투영, `error.stage/stepNo`, `steps` 9단계, 무예외).
- 3.x 계산 규칙 → Task 2 (A.1 18조합·CUSTOMER 4분기·SP 규칙·절삭·눈금·공차 절삭·경고 코드 전부).
- 4.1 어댑터 → Task 6. 4.2 두께구분 → Task 5(기본값), 6(실행 시 검증). 4.3 파이프라인 → Task 6. 4.4 화면 → Task 7. 4.5 품질사양 → Task 4. 4.6 문구 → Task 9. 4.7 provider 계약·임시 시드 → Task 5. 4.8 시드 정정 → Task 5(폭)·Task 8(LS_KEY). 4.9 코드 불일치 → 변경 없음(스펙대로 유지).
- 5.1 테스트 표 → Task 1, 2 (표의 모든 행이 테스트 함수 하나에 대응). 5.2 회귀 → Task 8. 5.3 빌드·수동 → Task 10.
- 6 문서·커밋 단위 → Task 3, 10. 7·8장은 구현 대상 아님.
- 스펙 4.3에 적힌 "`toDesign`에 세 컬럼을 넘긴다"는 `syncCommonRows(design, order, ctx)`가 주문을 직접 읽는 방식으로 같은 결과를 낸다(설계 결과의 세 행이 주문값과 동기화). `toDesign`은 바꾸지 않는다.

**타입·이름 일관성** — `CRM_THK`(구 `ROL_TAR_THK` 아님), `derived.crmThk`, `applied.setRule.candidates`, `thkCalc`/`thkInput`/`thkSpecSrcs`/`thkTp`, `SEED_RTS`, `CRIT.thk.coatThk.map`, `thkTpFromSpec → {tp,found,org}` 를 Task 간 동일하게 썼다. `codeStr`·`specOrgCd`는 Task 5에서 정의하고 Task 6이 쓴다. 엔진 내부의 `codeStr`은 UMD 클로저 안이라 시뮬레이션 전역과 충돌하지 않는다.
