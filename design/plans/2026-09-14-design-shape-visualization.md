# 설계 형상 시각화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설계결과 화면에 "설계 형상" 섹션을 추가해 원자재 → 압연 → 도금 → 칼라 → 제품 장면을 코일 그림과 근거 기준으로 보여준다.

**Architecture:** 순수 함수 3층. `shape-model.js`(설계결과 → ShapeModel), `shape-svg.js`(ShapeModel → SVG/HTML 문자열), `shape-widget.js`(DOM 마운트·상호작용). 세 파일은 전역 `MesShape` 객체에 함수를 등록하는 IIFE라 브라우저와 Node 양쪽에서 변환 없이 실행된다. 빌드 스크립트가 마커 구간에 복사해 `modules/quality-design.html`에 넣고, 기존 `build_single.py`가 `index.html`을 만든다.

**Tech Stack:** 바닐라 JS(ES2020), SVG, CSS 컨테이너 쿼리, Node 22 내장 테스트 러너(`node --test`), Python 3 빌드 스크립트. 새 패키지 없음.

**Spec:** `design/specs/2026-09-14-design-shape-visualization.md`

## Global Constraints

- 외부 의존 없음. npm 패키지·번들러 도입 금지. Node 22 내장 러너만 사용.
- 세 JS 파일은 `(function (g) { … g.MesShape = Object.assign(g.MesShape || {}, {...}); })(globalThis);` 형태. `import`/`export` 사용 금지(srcdoc 호환, CJS 자동 판정).
- `shape-svg.js`는 설계결과 객체를 모른다. 설계결과 필드명은 `shape-model.js`에서만 참조한다.
- 단위: 소지·제품·폭은 mm, 도금·도막 층 `thk_um`은 µm. 숫자 라벨은 원값.
- 목업 v1의 `evidence.kind`는 `formula` · `constant` · `missing`만. `rule` · `manual`은 만들지 않는다.
- 층 색 6개 상수: 핫코일 `#6B4A3A`, 소지 `#5A6470`, 도금 `#9FB7C3`, 프라이머 `#E0B95E`, Top 코트 `#C9A24B`, Back 코트 `#B8B0A0`. 그 외 색은 모듈 `:root` 토큰만.
- 같은 입력 → 같은 출력. `Date`·`Math.random` 사용 금지.
- 커밋 메시지는 한국어 한 줄 요약 + 본문. 끝에 아래 두 줄을 붙인다.
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01NrXKv6R83ZRSFvinggj1PK`
- 작업 디렉토리는 저장소 루트 `/Users/jerry/orca/workspaces/mes-to-be/guitarfish`. 모든 명령은 여기서 실행한다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `tests/shape/helpers.mjs` | 픽스처 로더, `MesShape` 로더 |
| `tests/shape/fixtures/gen.mjs` | `modules/quality-design.html`의 `genDetail`/`refDetail`을 Node vm으로 실행해 픽스처 JSON 생성 |
| `tests/shape/fixtures/{G,L,W,3,4,ref}.json` | 품명별 `{order, design}` 픽스처 |
| `tests/shape/fixtures.test.mjs` | 픽스처 형태 검증 |
| `assets/shape/shape-model.js` | `buildShapeModel(design, order)`, 헬퍼 `num`·`findRow`, 상수 `ROUTES`·`ROUTE_NAMES`·`PENDING_ROUTES`·`STACKS`·`CIRCLED` |
| `tests/shape/model.test.mjs` | 모델 테스트 |
| `assets/shape/shape-svg.js` | `escapeHtml`·`fmtMm`·`fmtUm`·`fmtDelta`·`coilLengths`·`layerHeights`·`renderCoil`·`renderStrip`·`renderDetail`·`renderSummary`·`renderSection`, 상수 `COLORS` |
| `tests/shape/svg.test.mjs` | SVG 테스트 |
| `assets/shape/shape-widget.js` | `mount(el, model, opts)`, `nextSceneId(model, curId, dir)` |
| `tests/shape/widget.test.mjs` | `nextSceneId` 테스트 |
| `assets/shape/shape.css` | `.shape-*` 스타일 |
| `build/inject_shape.py` | 마커 주입(멱등) |
| `modules/quality-design.html` | 마커 2쌍, `shape` 섹션, `jumpTo`, 마운트 훅 |
| `build/README.md` | 파일 표·작업 순서 갱신 |

---

### Task 1: 픽스처 생성기와 픽스처

**Files:**
- Create: `tests/shape/helpers.mjs`
- Create: `tests/shape/fixtures/gen.mjs`
- Create: `tests/shape/fixtures/{G,L,W,3,4,ref}.json` (생성기 출력)
- Test: `tests/shape/fixtures.test.mjs`

**Interfaces:**
- Consumes: `modules/quality-design.html`의 마지막 `<script>` 블록(`genDetail(o)`, `refDetail()`, `ORDERS`)
- Produces: `loadFixture(name) → {order, design}`, `loadShape() → globalThis.MesShape` (뒤 태스크의 모든 테스트가 사용)

- [ ] **Step 1: 헬퍼 작성**

`tests/shape/helpers.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');

export function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(here, 'fixtures', name + '.json'), 'utf8'));
}

// assets/shape/*.js 는 전역 MesShape 에 등록하는 평범한 스크립트다. 존재하는 파일만 순서대로 로드한다.
export async function loadShape() {
  for (const f of ['shape-model.js', 'shape-svg.js', 'shape-widget.js']) {
    const p = path.join(ROOT, 'assets', 'shape', f);
    if (fs.existsSync(p)) await import(pathToFileURL(p).href);
  }
  return globalThis.MesShape;
}
```

- [ ] **Step 2: 픽스처 생성기 작성**

`tests/shape/fixtures/gen.mjs`:

```js
// quality-design.html 의 genDetail/refDetail 출력을 픽스처로 저장한다.
// 실행: node tests/shape/fixtures/gen.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const html = fs.readFileSync(path.join(root, 'modules/quality-design.html'), 'utf8');
const start = html.lastIndexOf('<script>') + '<script>'.length;
const end = html.lastIndexOf('</script>');
const script = html.slice(start, end) + '\n;globalThis.__QD = { genDetail, refDetail, ORDERS };';

// 어떤 속성을 읽어도 자기 자신을 돌려주고, 호출해도 자기 자신을 돌려주는 가짜 DOM 요소
const fakeEl = new Proxy(function () {}, {
  get(t, k) { if (k === Symbol.toPrimitive) return () => ''; return fakeEl; },
  set() { return true; },
  apply() { return fakeEl; },
});
const document = {
  querySelector: () => fakeEl, querySelectorAll: () => [], addEventListener() {},
  documentElement: fakeEl, body: fakeEl, createElement: () => fakeEl,
};
const sandbox = {
  document,
  window: { innerWidth: 1200, addEventListener() {} },
  localStorage: { getItem: () => null, setItem() {} },
  setTimeout: () => 0, clearTimeout() {}, console,
  MesShape: { buildShapeModel: () => null, renderSummary: () => '', mount: () => null },
};
vm.runInNewContext(script, sandbox, { filename: 'quality-design.html' });
const { genDetail, refDetail, ORDERS } = sandbox.__QD;

const out = {};
for (const prd of ['G', 'L', 'W', '3', '4']) {
  const o = ORDERS.find(x => x.prd === prd);
  if (!o) throw new Error('주문 없음: prd ' + prd);
  out[prd] = { order: o, design: genDetail(o) };
}
const ref = ORDERS.find(x => x.no === 'D260831014' && x.ln === '010');
out.ref = { order: ref, design: refDetail() };

for (const [name, data] of Object.entries(out)) {
  fs.writeFileSync(path.join(here, name + '.json'), JSON.stringify(data, null, 1) + '\n');
  console.log('wrote', name + '.json', 'order', data.order.no + '-' + data.order.ln, 'prd', data.order.prd);
}
```

- [ ] **Step 3: 픽스처 생성**

Run: `node tests/shape/fixtures/gen.mjs`
Expected: 6줄 출력. `G.json`은 주문 `D260831021-010`, `L.json`은 `D260831020-010`, `W.json`은 `D260831054-010`, `3.json`과 `ref.json`은 `D260831014-010`, `4.json`은 `D260831032-010`.

- [ ] **Step 4: 실패하는 픽스처 테스트 작성**

`tests/shape/fixtures.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers.mjs';

for (const name of ['G', 'L', 'W', '3', '4', 'ref']) {
  test(`fixture ${name}: order/design 형태`, () => {
    const f = loadFixture(name);
    assert.equal(typeof f.order.prd, 'string');
    assert.equal(typeof f.order.thk, 'number');
    assert.equal(typeof f.order.wid, 'number');
    assert.ok(Array.isArray(f.design.common), 'common 배열');
    assert.ok(Array.isArray(f.design.cgl.pltcm), 'pltcm 배열');
    assert.ok(Array.isArray(f.design.cgl.lines), 'lines 배열');
    assert.ok(f.design.cgl.pltcm.some(r => r[0] === 'X-Ray Set두께값'), 'X-Ray Set 행');
    assert.ok(Array.isArray(f.design.route.rows), 'route.rows');
  });
}

test('fixture 3: 칼라제조사양 있음, G: 없음', () => {
  assert.ok(loadFixture('3').design.color);
  assert.equal(loadFixture('G').design.color, null);
});

test('fixture ref: common 45행(AS-IS 캡처)', () => {
  assert.equal(loadFixture('ref').design.common.length, 45);
});
```

- [ ] **Step 5: 테스트 실행**

Run: `node --test tests/shape/*.test.mjs`
Expected: 8 pass, 0 fail. (`ref` 행 수가 45가 아니면 실제 수로 어서션을 고친다. 그 값은 `node -e "console.log(require('./tests/shape/fixtures/ref.json').design.common.length)"` 로 확인.)

- [ ] **Step 6: 커밋**

```bash
git add tests/shape
git commit -m "설계 형상: 설계결과 픽스처 생성기와 품명별 픽스처 6종 추가

- quality-design.html 의 genDetail/refDetail 을 Node vm 으로 실행해 JSON 저장
- 뒤 태스크의 모델·SVG 테스트 입력

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NrXKv6R83ZRSFvinggj1PK"
```

---

### Task 2: shape-model 헬퍼와 뼈대

**Files:**
- Create: `assets/shape/shape-model.js`
- Test: `tests/shape/model.test.mjs`

**Interfaces:**
- Produces: `MesShape.num(v) → number|null`, `MesShape.findRow(rows, label) → value|null`, `MesShape.STACKS`, `MesShape.ROUTES`, `MesShape.ROUTE_NAMES`, `MesShape.PENDING_ROUTES`(배열), `MesShape.CIRCLED`(['①'…'⑤']), `MesShape.buildShapeModel(design, order) → ShapeModel` (이 태스크에서는 장면 id·no·title·warnings만 채우고 geometry/layers/values는 빈 값)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/shape/model.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture, loadShape } from './helpers.mjs';

const M = await loadShape();

test('num: 문자열 첫 숫자, 콤마 제거, 없으면 null', () => {
  assert.equal(M.num('0.43 (0.415 ~ 0.445)'), 0.43);
  assert.equal(M.num('508 · P : PAPER'), 508);
  assert.equal(M.num('5,000 · 8,000'), 5000);
  assert.equal(M.num(1.5), 1.5);
  assert.equal(M.num(''), null);
  assert.equal(M.num(null), null);
  assert.equal(M.num('B'), null);
});

test('findRow: [라벨,값] 배열에서 라벨 완전일치, 빈 값은 null', () => {
  const rows = [['도금량코드', 'Z12 : 120 g/㎡'], ['빈값', ''], ['상태', 'CONF', 'b']];
  assert.equal(M.findRow(rows, '도금량코드'), 'Z12 : 120 g/㎡');
  assert.equal(M.findRow(rows, '빈값'), null);
  assert.equal(M.findRow(rows, '없는라벨'), null);
  assert.equal(M.findRow(null, 'x'), null);
});

test('장면 목록: GI 4장면, CCGI 5장면, no 는 1부터 연속', () => {
  const g = M.buildShapeModel(loadFixture('G').design, loadFixture('G').order);
  assert.deepEqual(g.scenes.map(s => s.id), ['raw', 'rolled', 'coated', 'product']);
  assert.deepEqual(g.scenes.map(s => s.no), [1, 2, 3, 4]);
  assert.equal(g.productType, 'GI');
  assert.deepEqual(g.warnings, []);
  const c = M.buildShapeModel(loadFixture('3').design, loadFixture('3').order);
  assert.deepEqual(c.scenes.map(s => s.id), ['raw', 'rolled', 'coated', 'painted', 'product']);
  assert.equal(c.productType, 'CCGI');
});

test('미정의 품명: 4장면 + 경고', () => {
  const f = loadFixture('G');
  const m = M.buildShapeModel(f.design, Object.assign({}, f.order, { prd: 'X' }));
  assert.equal(m.productType, 'unknown');
  assert.deepEqual(m.scenes.map(s => s.id), ['raw', 'rolled', 'coated', 'product']);
  assert.ok(m.warnings.includes('층 정의 없음 · 품명 X'));
});

test('칼라 품명인데 color 가 null: painted 생략 + 경고', () => {
  const f = loadFixture('3');
  const m = M.buildShapeModel(Object.assign({}, f.design, { color: null }), f.order);
  assert.deepEqual(m.scenes.map(s => s.id), ['raw', 'rolled', 'coated', 'product']);
  assert.equal(m.warnings.length, 1);
});

test('order 요약과 빈 입력 방어', () => {
  const f = loadFixture('L');
  const m = M.buildShapeModel(f.design, f.order);
  assert.deepEqual(m.order, { no: 'D260831020', ln: '010', prd: 'L', spec: 'KSL-SGLCC', mat: '1A' });
  assert.doesNotThrow(() => M.buildShapeModel({}, {}));
  assert.doesNotThrow(() => M.buildShapeModel(null, null));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/shape/model.test.mjs`
Expected: FAIL. `Cannot read properties of undefined (reading 'num')` 계열(MesShape 미정의).

- [ ] **Step 3: 뼈대 구현**

`assets/shape/shape-model.js`:

```js
/* assets/shape/shape-model.js — 설계결과 + 주문 → ShapeModel (순수 함수, DOM 없음)
   빌드 시 build/inject_shape.py 가 modules/quality-design.html 마커 구간에 복사한다. */
(function (g) {
  'use strict';

  const ROUTES = {
    rollingThicknessSet: '#/quality-design/module-management/rolling-thickness-set',
    rawMaterialGrade: '#/quality-design/module-management/raw-material-grade',
    lineWidthShrinkage: '#/quality-design/module-management/line-width-shrinkage',
    lineWidthMargin: '#/quality-design/module-management/line-width-margin',
    processRouting: '#/quality-design/module-management/process-routing',
    colorBom: '#/quality-design/master-data-management/color-bom',
  };
  const ROUTE_NAMES = {
    [ROUTES.rollingThicknessSet]: '압연두께Set 관리',
    [ROUTES.rawMaterialGrade]: '원자재강종 관리',
    [ROUTES.lineWidthShrinkage]: '폭수축량 관리',
    [ROUTES.lineWidthMargin]: '폭마진량 관리',
    [ROUTES.processRouting]: '공정라우팅 관리',
    [ROUTES.colorBom]: '칼라BOM 관리',
  };
  // 메뉴만 있고 화면이 없는 기준 — 배지에 '준비 중' 표시
  const PENDING_ROUTES = [ROUTES.lineWidthShrinkage, ROUTES.lineWidthMargin, ROUTES.colorBom];

  // 품명 → 층 스택 (스펙 §2.1)
  const STACKS = {
    G: { type: 'GI', coating: 'zinc', paint: false },
    L: { type: 'GL', coating: 'az', paint: false },
    W: { type: 'GLX', coating: 'am', paint: false },
    '3': { type: 'CCGI', coating: 'zinc', paint: true },
    '4': { type: 'CCLI', coating: 'az', paint: true },
  };
  const COATING_LABEL = { zinc: '아연 도금(Zn)', az: '알루미늄·아연 도금(AZ)', am: '아연·알루미늄·마그네슘 도금(AM)' };
  const CIRCLED = ['①', '②', '③', '④', '⑤'];

  // 문자열에서 첫 숫자. 콤마 제거. 없으면 null.
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (v == null) return null;
    const m = String(v).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  // [라벨, 값, …] 배열에서 라벨 완전일치 행의 값. 없거나 빈 값이면 null.
  function findRow(rows, label) {
    if (!Array.isArray(rows)) return null;
    const r = rows.find(x => Array.isArray(x) && x[0] === label);
    if (!r) return null;
    const v = r[1];
    return v == null || v === '' ? null : v;
  }
  function ev(kind, opts) { return Object.assign({ kind, ref: null, route: null, note: null }, opts || {}); }
  function val(key, label, value, unit, formula, evidence) {
    const missing = value == null || value === '';
    return {
      key, label,
      value: missing ? null : value,
      unit: unit || null,
      formula: missing ? null : (formula || null),
      evidence: missing ? ev('missing', { note: '설계값 없음' }) : evidence,
    };
  }
  function layer(id, kind, side, thk_um, label) {
    return { id, kind, side, thk_um: thk_um == null ? null : thk_um, label };
  }
  // route.rows 의 한 행 ['1', '1P - PLTCM', 'HD81…'] → {code:'1P', name:'PLTCM'}
  function proc(row) {
    if (!Array.isArray(row) || row[1] == null) return null;
    const parts = String(row[1]).split(' - ');
    return { code: parts[0].trim(), name: (parts[1] || '').trim() };
  }
  function round3(n) { return Math.round(n * 1000) / 1000; }
  function mmToUm(mm) { return mm == null ? null : Math.round(mm * 1000); }
  function emptyGeometry() { return { thk_mm: null, wid_mm: null, id_mm: null, weight_t: null }; }

  function buildShapeModel(design, order) {
    const d = design || {}, o = order || {};
    const warnings = [];
    const stack = STACKS[o.prd] || null;
    const productType = stack ? stack.type : 'unknown';
    if (!stack) warnings.push('층 정의 없음 · 품명 ' + (o.prd == null || o.prd === '' ? '?' : o.prd));
    const color = d.color || null;
    const hasPaint = !!(stack && stack.paint);
    if (hasPaint && !color) warnings.push('칼라 품명이지만 칼라제조사양이 없어 칼라 장면을 생략');

    const raw = { id: 'raw', title: '원자재', process: null, geometry: emptyGeometry(), layers: [], values: [], changes: [] };
    const rolled = { id: 'rolled', title: '압연', process: null, geometry: emptyGeometry(), layers: [], values: [], changes: [] };
    const coated = { id: 'coated', title: '도금', process: null, geometry: emptyGeometry(), layers: [], values: [], changes: [] };
    const painted = (hasPaint && color)
      ? { id: 'painted', title: '칼라', process: null, geometry: emptyGeometry(), layers: [], values: [], changes: [] }
      : null;
    const product = { id: 'product', title: '제품', process: { code: '—', name: '정전·포장' }, geometry: emptyGeometry(), layers: [], values: [], changes: [] };

    const scenes = [raw, rolled, coated].concat(painted ? [painted] : []).concat([product]);
    scenes.forEach((s, i) => { s.no = i + 1; });

    return {
      order: { no: o.no ?? null, ln: o.ln ?? null, prd: o.prd ?? null, spec: o.spec ?? null, mat: o.mat ?? null },
      productType, scenes, warnings,
    };
  }

  g.MesShape = Object.assign(g.MesShape || {}, {
    buildShapeModel, num, findRow, ROUTES, ROUTE_NAMES, PENDING_ROUTES, STACKS, CIRCLED,
    _internal: { ev, val, layer, proc, round3, mmToUm, COATING_LABEL },
  });
})(globalThis);
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/shape/*.test.mjs`
Expected: 모두 PASS (fixtures 8 + model 6).

- [ ] **Step 5: 커밋**

```bash
git add assets/shape/shape-model.js tests/shape/model.test.mjs
git commit -m "설계 형상: shape-model 헬퍼(num·findRow)와 장면 뼈대

- 품명→층 스택 표, 라우트 상수, 장면 5개 골격과 경고 규칙

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NrXKv6R83ZRSFvinggj1PK"
```

---

### Task 3: shape-model 장면 빌더 (기하·층·값·근거·변화)

**Files:**
- Modify: `assets/shape/shape-model.js` (`buildShapeModel` 본문 교체)
- Test: `tests/shape/model.test.mjs` (테스트 추가)

**Interfaces:**
- Consumes: Task 2의 `num`, `findRow`, `_internal.{ev,val,layer,proc,round3,mmToUm,COATING_LABEL}`
- Produces: 스펙 §2 완전판 `ShapeModel`. 장면마다 `geometry{thk_mm,wid_mm,id_mm,weight_t}`, `layers[]`(위→아래), `values[]`(key 고정: raw `rmtl_cd rmtl_thk rmtl_wid rmtl_pref`, rolled `set_thk thk_target trim_wid wid_shrink wid_target wr_type id_ring`, coated `coated_thk coat_cd coat_range coat_target coat_thk spangle lv skin line`, painted `paint_way paint_top paint_back color_top color_back resin_top resin_back painted_size`, product `size thk_range wid_range tol coil_id winding pack`), `changes[]`, `process`

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/shape/model.test.mjs` 끝에 추가:

```js
// ---- Task 3: 기하·층·값·변화 ----
const G = M.buildShapeModel(loadFixture('G').design, loadFixture('G').order);   // D260831021 · 0.440 × 1225 · BA
const C = M.buildShapeModel(loadFixture('3').design, loadFixture('3').order);   // D260831014 · 0.450 × 1490 · 칼라
const by = (m, id) => m.scenes.find(s => s.id === id);
const valOf = (s, key) => s.values.find(v => v.key === key);

test('GI 기하: 원자재 1.8×1228, Set 0.42×1231, 도금 0.44×1228, 제품 0.44×1225·내경 508·단중 5t', () => {
  assert.deepEqual(by(G, 'raw').geometry, { thk_mm: 1.8, wid_mm: 1228, id_mm: null, weight_t: null });
  assert.deepEqual(by(G, 'rolled').geometry, { thk_mm: 0.42, wid_mm: 1231, id_mm: null, weight_t: null });
  assert.deepEqual(by(G, 'coated').geometry, { thk_mm: 0.44, wid_mm: 1228, id_mm: null, weight_t: null });
  assert.deepEqual(by(G, 'product').geometry, { thk_mm: 0.44, wid_mm: 1225, id_mm: 508, weight_t: 5 });
});

test('GI 층: 원자재·압연은 소지 1층, 도금은 zinc/소지/zinc, 제품은 도금과 동일', () => {
  assert.deepEqual(by(G, 'raw').layers.map(l => [l.kind, l.side]), [['substrate', 'core']]);
  assert.equal(by(G, 'raw').layers[0].thk_um, 1800);
  assert.deepEqual(by(G, 'rolled').layers.map(l => [l.kind, l.side]), [['substrate', 'core']]);
  assert.deepEqual(by(G, 'coated').layers.map(l => [l.kind, l.side, l.thk_um]),
    [['zinc', 'top', 17], ['substrate', 'core', 420], ['zinc', 'bottom', 17]]);
  assert.deepEqual(by(G, 'product').layers, by(G, 'coated').layers);
  assert.notEqual(by(G, 'product').layers, by(G, 'coated').layers, '복사본이어야 함');
});

test('CCGI 칼라 층: Top2코트 20, 프라이머 5, zinc, 소지, zinc, Back 5 (위→아래)', () => {
  assert.deepEqual(by(C, 'painted').layers.map(l => [l.id, l.kind, l.thk_um]),
    [['topcoat-2', 'topcoat', 20], ['primer', 'primer', 5], ['coating-top', 'zinc', 12],
     ['substrate', 'substrate', 430], ['coating-bottom', 'zinc', 12], ['backcoat', 'backcoat', 5]]);
  assert.deepEqual(by(C, 'painted').geometry, { thk_mm: 0.472, wid_mm: 1490, id_mm: null, weight_t: null });
  assert.equal(by(C, 'product').geometry.thk_mm, 0.472);
});

test('값과 근거: 압연 Set 은 formula + 압연두께Set 라우트, 폭수축은 constant + 준비 중 라우트', () => {
  const set = valOf(by(G, 'rolled'), 'set_thk');
  assert.equal(set.value, 0.42);
  assert.equal(set.unit, 'mm');
  assert.equal(set.evidence.kind, 'formula');
  assert.equal(set.evidence.route, M.ROUTES.rollingThicknessSet);
  assert.match(set.formula, /주문두께 − 0\.020/);
  const sh = valOf(by(G, 'rolled'), 'wid_shrink');
  assert.equal(sh.value, 3);
  assert.equal(sh.evidence.kind, 'constant');
  assert.ok(M.PENDING_ROUTES.includes(sh.evidence.route));
  assert.equal(valOf(by(G, 'coated'), 'coat_cd').value, 'Z12 : 120 g/㎡');
  assert.equal(valOf(by(G, 'coated'), 'coat_range').value, '120 ~ 180');
  assert.equal(valOf(by(G, 'coated'), 'line').value, '2 CGL');
  assert.equal(valOf(by(G, 'product'), 'thk_range').value, '0.432 ~ 0.582');
  assert.equal(valOf(by(G, 'product'), 'wid_range').value, '1225 ~ 1255');
  assert.equal(valOf(by(C, 'painted'), 'paint_way').evidence.route, M.ROUTES.colorBom);
});

test('빈 값은 missing, 목업 v1 은 formula/constant/missing 만 만든다', () => {
  const f = loadFixture('G');
  const d = JSON.parse(JSON.stringify(f.design));
  d.cgl.pltcm = d.cgl.pltcm.filter(r => r[0] !== '폭수축값');
  const m = M.buildShapeModel(d, f.order);
  const sh = valOf(by(m, 'rolled'), 'wid_shrink');
  assert.equal(sh.value, null);
  assert.equal(sh.evidence.kind, 'missing');
  const kinds = new Set([G, C, m].flatMap(x => x.scenes.flatMap(s => s.values.map(v => v.evidence.kind))));
  assert.deepEqual([...kinds].sort(), ['constant', 'formula', 'missing'].filter(k => kinds.has(k)));
  assert.ok(!kinds.has('rule') && !kinds.has('manual'));
});

test('변화량: 압연 두께 −1.38·폭 +3, 도금 두께 +0.02·폭 −3·층 +2, 제품 폭 −3', () => {
  const r = by(G, 'rolled').changes.map(c => [c.key, c.delta]);
  assert.deepEqual(r, [['thk_mm', -1.38], ['wid_mm', 3]]);
  const c = by(G, 'coated').changes.map(x => [x.key, x.delta]);
  assert.deepEqual(c, [['thk_mm', 0.02], ['wid_mm', -3], ['layers', 2]]);
  const p = by(G, 'product').changes.map(x => [x.key, x.delta]);
  assert.deepEqual(p, [['wid_mm', -3]]);
  assert.deepEqual(by(G, 'raw').changes, []);
});

test('공정: 압연 1P PLTCM, 도금 31 2CGL(GI) / 85 5CGL(칼라), 칼라 A5 5CCL', () => {
  assert.deepEqual(by(G, 'rolled').process, { code: '1P', name: 'PLTCM' });
  assert.deepEqual(by(G, 'coated').process, { code: '31', name: '2CGL' });
  assert.deepEqual(by(C, 'coated').process, { code: '85', name: '5CGL' });
  assert.deepEqual(by(C, 'painted').process, { code: 'A5', name: '5CCL' });
  assert.equal(by(G, 'raw').process, null);
});

test('refDetail(common 45행)에서도 라벨 검색으로 값이 나온다', () => {
  const f = loadFixture('ref');
  const m = M.buildShapeModel(f.design, f.order);
  assert.equal(typeof by(m, 'rolled').geometry.thk_mm, 'number');
  assert.equal(typeof by(m, 'product').geometry.id_mm, 'number', '주문내경/종류 행에서 숫자 파싱');
  assert.equal(valOf(by(m, 'coated'), 'coat_cd').evidence.kind, 'constant');
});

test('결정성: 같은 입력 → 깊은 동등', () => {
  const f = loadFixture('4');
  assert.deepEqual(M.buildShapeModel(f.design, f.order), M.buildShapeModel(f.design, f.order));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/shape/model.test.mjs`
Expected: Task 3 테스트 9건 FAIL (geometry 가 null 등), Task 2 테스트는 PASS 유지.

- [ ] **Step 3: `buildShapeModel` 본문 교체**

`assets/shape/shape-model.js`의 `function buildShapeModel(design, order) { … }` 전체를 아래로 교체한다.

```js
  function buildShapeModel(design, order) {
    const d = design || {}, o = order || {};
    const warnings = [];
    const stack = STACKS[o.prd] || null;
    const productType = stack ? stack.type : 'unknown';
    if (!stack) warnings.push('층 정의 없음 · 품명 ' + (o.prd == null || o.prd === '' ? '?' : o.prd));

    const head = d.head || {}, common = d.common || [], cgl = d.cgl || {}, tol = d.tol || {}, post = d.post || {};
    const lines0 = (Array.isArray(cgl.lines) && cgl.lines[0]) || [];
    const pltcm = cgl.pltcm || [], coat = cgl.coat || {};
    const ops0 = (Array.isArray(cgl.ops) && cgl.ops[0]) || [];
    const rows = (d.route && d.route.rows) || [];
    const color = d.color || null;
    const hasPaint = !!(stack && stack.paint);
    if (hasPaint && !color) warnings.push('칼라 품명이지만 칼라제조사양이 없어 칼라 장면을 생략');
    const orderThk = num(o.thk), orderWid = num(o.wid);
    const thkTp = findRow(common, '주문두께구분');
    const isBmt = typeof thkTp === 'string' && thkTp.trim().startsWith('1');

    // ① 원자재 핫코일
    const rawThk = num(lines0[3]), rawWid = num(lines0[6]);
    const raw = {
      id: 'raw', title: '원자재', process: null,
      geometry: { thk_mm: rawThk, wid_mm: rawWid, id_mm: null, weight_t: null },
      layers: [layer('substrate', 'substrate', 'core', mmToUm(rawThk), '핫코일 ' + (head.mat2 || ''))],
      values: [
        val('rmtl_cd', '원자재 코드', lines0[1], null, null, ev('constant', { route: ROUTES.rawMaterialGrade })),
        val('rmtl_thk', '원자재 두께', rawThk, 'mm', '주문두께 × 4 (목업 고정식)', ev('formula', { note: '기준 미연결 · 정식 엔진 연결 후' })),
        val('rmtl_wid', '원자재 폭', rawWid, 'mm', '주문폭 + 3 (목업 고정식)', ev('formula', { note: '기준 미연결 · 정식 엔진 연결 후' })),
        val('rmtl_pref', '원자재 선호도', lines0[2], null, null, ev('constant')),
      ],
      changes: [],
    };

    // ② 압연 PLTCM
    const setThk = num(findRow(pltcm, 'X-Ray Set두께값'));
    const trimWid = num(findRow(pltcm, 'Side Trimming Set값(주공정)'));
    const widTarget = num(findRow(pltcm, '폭목표값(주공정)'));
    const rolled = {
      id: 'rolled', title: '압연', process: proc(rows[0]),
      geometry: { thk_mm: setThk, wid_mm: trimWid, id_mm: null, weight_t: null },
      layers: [layer('substrate', 'substrate', 'core', mmToUm(setThk), '냉연 소지')],
      values: [
        val('set_thk', 'X-Ray Set 두께', setThk, 'mm', '주문두께 − 0.020 (목업 고정식 · 기준 룰은 정식 엔진 연결 후)', ev('formula', { route: ROUTES.rollingThicknessSet })),
        val('thk_target', '두께목표 (허용범위)', findRow(pltcm, '두께목표값'), null, '목표 ±0.015 (목업 상수)', ev('constant')),
        val('trim_wid', 'Side Trimming Set', trimWid, 'mm', '주문폭 + 6 (목업 고정식)', ev('formula', { route: ROUTES.lineWidthMargin })),
        val('wid_shrink', '폭수축값', num(findRow(pltcm, '폭수축값')), 'mm', '고정값 (목업 상수)', ev('constant', { route: ROUTES.lineWidthShrinkage })),
        val('wid_target', '폭목표값(주공정)', widTarget, 'mm', '주문폭 + 3 (목업 고정식)', ev('formula')),
        val('wr_type', '5Stand WR Type', findRow(pltcm, '5Stand WRType'), null, null, ev('constant')),
        val('id_ring', '내경링 사용여부', findRow(pltcm, '내경링 사용여부'), null, null, ev('constant')),
      ],
      changes: [],
    };

    // ③ 도금 CGL
    const coatThk = num(coat.thk);
    const coatedLayers = [];
    if (stack && stack.coating) coatedLayers.push(layer('coating-top', stack.coating, 'top', coatThk, COATING_LABEL[stack.coating]));
    coatedLayers.push(layer('substrate', 'substrate', 'core', mmToUm(setThk), '냉연 소지'));
    if (stack && stack.coating) coatedLayers.push(layer('coating-bottom', stack.coating, 'bottom', coatThk, COATING_LABEL[stack.coating]));
    const coated = {
      id: 'coated', title: '도금', process: proc(rows[1]),
      geometry: { thk_mm: orderThk, wid_mm: widTarget, id_mm: null, weight_t: null },
      layers: coatedLayers,
      values: [
        val('coated_thk', '도금 후 두께', orderThk, 'mm', '주문두께 (TCT 가정)', ev('formula', { note: isBmt ? 'BMT 주문 · 도금 별도' : null })),
        val('coat_cd', '도금량코드', findRow(common, '도금량코드'), null, null, ev('constant')),
        val('coat_range', '도금 부착량 (하한 ~ 상한)', coat.min == null || coat.max == null ? null : coat.min + ' ~ ' + coat.max, 'g/㎡', null, ev('constant')),
        val('coat_target', '도금목표 부착량', coat.target, 'g/㎡', null, ev('constant')),
        val('coat_thk', '도금 두께', coatThk, 'µm', null, ev('constant', { note: '목업값 · 면당으로 표시' })),
        val('spangle', 'Spangle', coat.spangle, null, null, ev('constant')),
        val('lv', 'L/V', coat.lv, null, null, ev('constant')),
        val('skin', 'Skin Pass', coat.skin, null, null, ev('constant')),
        val('line', '도금 라인', ops0[0], null, null, ev('constant', { route: ROUTES.processRouting })),
      ],
      changes: [],
    };

    // ④ 칼라 CCL (칼라 품명 + 칼라제조사양이 있을 때만)
    let painted = null;
    if (hasPaint && color) {
      const m = Array.isArray(color.matrix) ? color.matrix : [];
      const thkRow = m[4] || [], colorRow = m[1] || [];   // 행4 = 도막두께, 행1 = 색상코드
      const sum = color.sum || {};
      const ls = [];
      // 열: [구분, Top4, Top3, Top2, Top1, Back1, Lamina…] — 위에서부터 Top4 → Top2, 프라이머(Top1), 도금, 소지, 도금, Back
      [[1, 4], [2, 3], [3, 2]].forEach(([col, n]) => {
        const t = num(thkRow[col]);
        if (t != null) ls.push(layer('topcoat-' + n, 'topcoat', 'top', t, 'Top ' + n + '코트 ' + (colorRow[col] || '')));
      });
      const primer = num(thkRow[4]);
      if (primer != null) ls.push(layer('primer', 'primer', 'top', primer, '프라이머 ' + (colorRow[4] || '')));
      coatedLayers.forEach(l => ls.push(Object.assign({}, l)));
      const back = num(thkRow[5]);
      if (back != null) ls.push(layer('backcoat', 'backcoat', 'bottom', back, 'Back 코트 ' + (colorRow[5] || '')));
      painted = {
        id: 'painted', title: '칼라', process: proc(rows[2]),
        geometry: { thk_mm: num(sum.szT), wid_mm: num(sum.szW), id_mm: null, weight_t: null },
        layers: ls,
        values: [
          val('paint_way', '도장방식', sum.way, null, null, ev('constant', { route: ROUTES.colorBom })),
          val('paint_top', 'Top 도막두께 합계', num(sum.thkT), 'µm', null, ev('constant', { route: ROUTES.colorBom })),
          val('paint_back', 'Back 도막두께', num(sum.thkB), 'µm', null, ev('constant', { route: ROUTES.colorBom })),
          val('color_top', '색상코드 Top', sum.cT, null, null, ev('constant')),
          val('color_back', '색상코드 Back', sum.cB, null, null, ev('constant')),
          val('resin_top', '수지 Top', sum.resinT, null, null, ev('constant')),
          val('resin_back', '수지 Back', sum.resinB, null, null, ev('constant')),
          val('painted_size', '목표 Size (두께 × 폭)', sum.szT == null ? null : sum.szT + ' × ' + sum.szW, 'mm', null, ev('constant')),
        ],
        changes: [],
      };
    }

    // ⑤ 제품 (정전·포장)
    const prev = painted || coated;
    const base0 = (Array.isArray(tol.base) && tol.base[0]) || [];
    const tols2 = (Array.isArray(tol.tols) && tol.tols[2]) || [];
    const pack = num(findRow(common, '포장단중(하/상)'));
    const coilId = num(findRow(common, '주문내경/종류'));
    const product = {
      id: 'product', title: '제품', process: { code: '—', name: '정전·포장' },
      geometry: { thk_mm: painted ? painted.geometry.thk_mm : orderThk, wid_mm: orderWid, id_mm: coilId, weight_t: pack == null ? null : pack / 1000 },
      layers: prev.layers.map(l => Object.assign({}, l)),
      values: [
        val('size', '주문 Actual Size', findRow(common, '주문 Actual Size'), null, null, ev('constant')),
        val('thk_range', '제품 두께 범위 (설계기준)', base0[2] == null || base0[2] === '' ? null : base0[2] + ' ~ ' + base0[3], 'mm', null, ev('constant')),
        val('wid_range', '제품 폭 범위', post.wMin == null ? null : post.wMin + ' ~ ' + post.wMax, 'mm', null, ev('constant')),
        val('tol', '보증 공차 (두께 하/상 · 폭 하/상)', tols2.length ? tols2[1] + ' / ' + tols2[2] + ' · ' + tols2[3] + ' / ' + tols2[4] : null, 'mm', null, ev('constant')),
        val('coil_id', '주문내경', coilId, 'mm', null, ev('constant')),
        val('winding', '권취방법', findRow(common, '권취방법'), null, null, ev('constant')),
        val('pack', '포장방법', findRow(common, '포장방법'), null, null, ev('constant')),
      ],
      changes: [],
    };

    const scenes = [raw, rolled, coated].concat(painted ? [painted] : []).concat([product]);
    scenes.forEach((s, i) => {
      s.no = i + 1;
      if (i === 0) return;
      const p = scenes[i - 1];
      if (s.geometry.thk_mm != null && p.geometry.thk_mm != null && s.geometry.thk_mm !== p.geometry.thk_mm)
        s.changes.push({ key: 'thk_mm', from: p.geometry.thk_mm, to: s.geometry.thk_mm, delta: round3(s.geometry.thk_mm - p.geometry.thk_mm), unit: 'mm' });
      if (s.geometry.wid_mm != null && p.geometry.wid_mm != null && s.geometry.wid_mm !== p.geometry.wid_mm)
        s.changes.push({ key: 'wid_mm', from: p.geometry.wid_mm, to: s.geometry.wid_mm, delta: round3(s.geometry.wid_mm - p.geometry.wid_mm), unit: 'mm' });
      if (s.layers.length !== p.layers.length)
        s.changes.push({ key: 'layers', from: p.layers.length, to: s.layers.length, delta: s.layers.length - p.layers.length, unit: null });
    });

    return {
      order: { no: o.no ?? null, ln: o.ln ?? null, prd: o.prd ?? null, spec: o.spec ?? null, mat: o.mat ?? null },
      productType, scenes, warnings,
    };
  }
```

`emptyGeometry` 함수는 더 이상 쓰지 않으므로 삭제한다.

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/shape/*.test.mjs`
Expected: 모두 PASS. 기대값이 어긋나면 픽스처 JSON의 실제 값을 먼저 확인한다(`node -e "const f=require('./tests/shape/fixtures/G.json');console.log(f.design.cgl.pltcm, f.design.cgl.lines[0], f.design.tol.base[0], f.design.post)"`). 코드가 스펙 매핑과 맞고 픽스처 값만 다르면 테스트의 숫자를 픽스처 값으로 고친다. 코드가 스펙과 다르면 코드를 고친다.

- [ ] **Step 5: 커밋**

```bash
git add assets/shape/shape-model.js tests/shape/model.test.mjs
git commit -m "설계 형상: 장면 빌더 완성 — 기하·층·값·근거·변화량·공정

- 스펙 §2.2 매핑 표대로 설계결과 → 장면 5개
- 목업 v1 근거는 formula/constant/missing 만 생성

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NrXKv6R83ZRSFvinggj1PK"
```

---

### Task 4: shape-svg 기본 — 포맷·비례·코일 SVG

**Files:**
- Create: `assets/shape/shape-svg.js`
- Test: `tests/shape/svg.test.mjs`

**Interfaces:**
- Consumes: `ShapeModel`(Task 3), `MesShape.CIRCLED`
- Produces: `MesShape.escapeHtml(s)`, `fmtMm(n)`, `fmtUm(n)`, `fmtDelta(n, unit)`, `coilLengths(model, size) → {sceneId: px}`, `layerHeights(layers, innerH) → px[]`, `renderCoil(scene, model, {size:'sm'|'lg', lengths?}) → svg string`, `COLORS`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/shape/svg.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture, loadShape } from './helpers.mjs';

const M = await loadShape();
const G = M.buildShapeModel(loadFixture('G').design, loadFixture('G').order);
const C = M.buildShapeModel(loadFixture('3').design, loadFixture('3').order);
const by = (m, id) => m.scenes.find(s => s.id === id);

test('escapeHtml 과 숫자 포맷', () => {
  assert.equal(M.escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(M.fmtMm(0.42), '0.420');
  assert.equal(M.fmtMm(1231), '1,231');
  assert.equal(M.fmtMm(null), '—');
  assert.equal(M.fmtUm(17), '17');
  assert.equal(M.fmtDelta(-1.38, 'mm'), '−1.380');
  assert.equal(M.fmtDelta(3, 'mm'), '+3');
  assert.equal(M.fmtDelta(2, null), '+2');
});

test('coilLengths: 폭 비례, 폭이 다른 장면은 최소 6px 차이', () => {
  const L = M.coilLengths(G, 'sm');            // 폭 1228 · 1231 · 1228 · 1225
  assert.ok(L.rolled > L.raw && L.raw > L.product);
  assert.ok(L.rolled - L.raw >= 6);
  assert.ok(L.raw - L.product >= 6);
  assert.equal(L.raw, L.coated);
  const same = M.coilLengths({ scenes: [{ id: 'a', geometry: { wid_mm: 100 } }, { id: 'b', geometry: { wid_mm: 100 } }] }, 'sm');
  assert.equal(same.a, same.b);
  const nul = M.coilLengths({ scenes: [{ id: 'a', geometry: { wid_mm: null } }] }, 'lg');
  assert.equal(typeof nul.a, 'number');
});

test('layerHeights: 소지는 40~55%, 도금·도막은 4~12px, 두꺼울수록 높다', () => {
  const inner = 84;
  const h = M.layerHeights(by(C, 'painted').layers, inner);
  assert.equal(h.length, 6);
  const sub = h[3];
  assert.ok(sub >= inner * 0.4 && sub <= inner * 0.55);
  h.forEach((x, i) => { if (i !== 3) assert.ok(x >= 4 && x <= 12, `layer ${i} = ${x}`); });
  assert.ok(h[0] > h[1], 'Top2코트 20µm > 프라이머 5µm');
  const nul = M.layerHeights([{ kind: 'zinc', thk_um: null }], inner);
  assert.equal(nul[0], 4);
});

test('renderCoil sm: title/desc 와 role=img, 몸통 길이 반영', () => {
  const svg = M.renderCoil(by(G, 'rolled'), G, { size: 'sm' });
  assert.match(svg, /^<svg class="shape-coil shape-coil-sm"/);
  assert.match(svg, /<title id="sh-rolled-sm-t">압연 코일, 두께 0\.420 mm, 폭 1,231 mm<\/title>/);
  assert.match(svg, /<desc id="sh-rolled-sm-d">/);
  assert.match(svg, /role="img"/);
  const L = M.coilLengths(G, 'sm');
  assert.match(svg, new RegExp(`<rect x="14" y="[\\d.]+" width="${L.rolled}"`));
});

test('renderCoil lg: 폭 치수선·단면 확대·층 사각형(≥4px)·내경·단중', () => {
  const svg = M.renderCoil(by(C, 'product'), C, { size: 'lg' });
  assert.match(svg, /폭 1,490/);
  assert.match(svg, /내경 508 · 단중 5\.0t/);
  assert.match(svg, /단면 확대/);
  const rects = [...svg.matchAll(/height="(\d+)" fill="#[0-9A-Fa-f]{6}" class="shape-layer" data-layer="([^"]+)"/g)];
  assert.equal(rects.length, 6);
  rects.forEach(r => assert.ok(+r[1] >= 4));
  assert.match(svg, /<title>Top 2코트 [^<]*20 µm<\/title>/);
  assert.match(svg, /두께 눈금은 과장/);
});

test('renderCoil: 원자재는 갈색, 도금은 청회색, 칼라는 금색 그라디언트', () => {
  assert.match(M.renderCoil(by(G, 'raw'), G, { size: 'sm' }), /#6B4A3A/);
  assert.match(M.renderCoil(by(G, 'coated'), G, { size: 'sm' }), /#9FB7C3/);
  assert.match(M.renderCoil(by(C, 'painted'), C, { size: 'sm' }), /#C9A24B/);
});

test('renderCoil: 라벨에 HTML 이 들어가도 이스케이프', () => {
  const s = JSON.parse(JSON.stringify(by(G, 'coated')));
  s.title = '<b>x</b>';
  const svg = M.renderCoil(s, G, { size: 'sm' });
  assert.ok(!svg.includes('<b>x</b>'));
  assert.ok(svg.includes('&lt;b&gt;x&lt;/b&gt;'));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/shape/svg.test.mjs`
Expected: FAIL (`M.escapeHtml is not a function`).

- [ ] **Step 3: 구현**

`assets/shape/shape-svg.js`:

```js
/* assets/shape/shape-svg.js — ShapeModel → SVG/HTML 문자열 (순수 함수, DOM 없음, 설계결과 객체를 모름) */
(function (g) {
  'use strict';

  const COLORS = { hot: '#6B4A3A', substrate: '#5A6470', coating: '#9FB7C3', primer: '#E0B95E', topcoat: '#C9A24B', backcoat: '#B8B0A0' };
  // 코일 몸통 그라디언트(밝음→중간→어두움)와 끝면 색(면·감긴 띠 선·구멍)
  const SURFACE = {
    hot:       { body: ['#9C7A66', '#6B4A3A', '#3E2B22'], face: ['#C9B3A3', '#7A5A4A', '#3E2B22'] },
    substrate: { body: ['#D9D3C4', '#8C8A82', '#5A5A55'], face: ['#E8E3D6', '#8C8A82', '#5A5A55'] },
    coating:   { body: ['#E6ECEF', '#9FB7C3', '#5E7A88'], face: ['#EEF2F4', '#9FB7C3', '#5E7A88'] },
    paint:     { body: ['#E3C77A', '#C9A24B', '#8A6A2A'], face: ['#F3E6C2', '#C9A24B', '#8A6A2A'] },
  };
  const SIZES = {
    sm: { w: 110, h: 64,  x0: 14, cy: 32, rx: 9,  ry: 22, minLen: 52, maxLen: 76 },
    lg: { w: 320, h: 210, x0: 34, cy: 98, rx: 20, ry: 48, minLen: 96, maxLen: 136 },
  };
  const GAP_PX = 6;
  const CUT = { cx: 252, cy: 118, r: 46, x: 206, w: 92, innerH: 84 };

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtMm(n) {
    if (n == null) return '—';
    return Math.abs(n) >= 100 ? Math.round(n).toLocaleString('ko-KR') : n.toFixed(3);
  }
  function fmtUm(n) { return n == null ? '—' : String(Math.round(n)); }
  function fmtDelta(n, unit) {
    const sign = n > 0 ? '+' : n < 0 ? '−' : '';
    const a = Math.abs(n);
    return sign + (Number.isInteger(a) ? String(a) : a.toFixed(3));
  }

  // 겉층 종류 → 표면 색 키
  function surfaceOf(scene) {
    if (scene.id === 'raw') return 'hot';
    const top = scene.layers.find(l => l.side === 'top') || scene.layers[0];
    if (!top) return 'substrate';
    if (top.kind === 'topcoat' || top.kind === 'primer') return 'paint';
    if (top.kind === 'zinc' || top.kind === 'az' || top.kind === 'am') return 'coating';
    return 'substrate';
  }
  function layerColor(l, scene) {
    if (l.kind === 'substrate') return scene && scene.id === 'raw' ? COLORS.hot : COLORS.substrate;
    if (l.kind === 'zinc' || l.kind === 'az' || l.kind === 'am') return COLORS.coating;
    return COLORS[l.kind] || COLORS.substrate;
  }
  function layerThkText(l) {
    return l.kind === 'substrate' ? fmtMm(l.thk_um == null ? null : l.thk_um / 1000) + ' mm' : fmtUm(l.thk_um) + ' µm';
  }
  function layerDesc(scene) {
    return scene.layers.map(l => l.label + ' ' + layerThkText(l)).join(', ');
  }

  // 장면별 코일 몸통 길이(px). 폭에 비례하되 폭이 다른 장면끼리 최소 GAP_PX 차이.
  function coilLengths(model, size) {
    const sz = SIZES[size] || SIZES.sm;
    const scenes = model.scenes || [];
    const known = scenes.map(s => s.geometry && s.geometry.wid_mm).filter(w => w != null);
    const max = known.length ? Math.max(...known) : null, min = known.length ? Math.min(...known) : null;
    const out = {};
    scenes.forEach(s => {
      const w = s.geometry && s.geometry.wid_mm;
      out[s.id] = (w == null || max === min) ? sz.maxLen
        : Math.round(sz.minLen + (sz.maxLen - sz.minLen) * (w - min) / (max - min));
    });
    const sorted = scenes.filter(s => s.geometry && s.geometry.wid_mm != null).sort((a, b) => a.geometry.wid_mm - b.geometry.wid_mm);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (b.geometry.wid_mm !== a.geometry.wid_mm && out[b.id] - out[a.id] < GAP_PX) out[b.id] = out[a.id] + GAP_PX;
      if (b.geometry.wid_mm === a.geometry.wid_mm) out[b.id] = out[a.id];
    }
    return out;
  }

  // 단면 확대 원 안의 층 높이(px). 소지는 46%, 그 외는 로그 눈금 4~12px.
  function layerHeights(layers, innerH) {
    const subH = Math.round(innerH * 0.46);
    return layers.map(l => {
      if (l.kind === 'substrate') return subH;
      const t = l.thk_um == null ? 1 : Math.max(l.thk_um, 1);
      return Math.max(4, Math.min(12, Math.round(4 + 4 * Math.log10(t))));
    });
  }

  function cutawayLayers(scene) {
    const hs = layerHeights(scene.layers, CUT.innerH);
    const total = hs.reduce((a, b) => a + b, 0);
    let y = CUT.cy - total / 2;
    return scene.layers.map((l, i) => {
      const rect = `<rect x="${CUT.x}" y="${y.toFixed(1)}" width="${CUT.w}" height="${hs[i]}" fill="${layerColor(l, scene)}" class="shape-layer" data-layer="${escapeHtml(l.id)}">` +
        `<title>${escapeHtml(l.label + ' ' + layerThkText(l))}</title></rect>` +
        (l.kind === 'substrate' && hs[i] >= 14
          ? `<text x="${CUT.cx}" y="${(y + hs[i] / 2 + 3.5).toFixed(1)}" text-anchor="middle" class="shape-txt shape-txt-onink">${escapeHtml(layerThkText(l))}</text>` : '');
      y += hs[i];
      return rect;
    }).join('');
  }

  function renderCoil(scene, model, opts) {
    const size = (opts && opts.size) || 'sm';
    const sz = SIZES[size];
    const lengths = (opts && opts.lengths) || coilLengths(model, size);
    const len = lengths[scene.id] != null ? lengths[scene.id] : sz.maxLen;
    const surf = SURFACE[surfaceOf(scene)];
    const uid = 'sh-' + scene.id + '-' + size;
    const x0 = sz.x0, x1 = x0 + len, cy = sz.cy;
    const title = `${scene.title} 코일, 두께 ${fmtMm(scene.geometry.thk_mm)} mm, 폭 ${fmtMm(scene.geometry.wid_mm)} mm`;
    let s = `<svg class="shape-coil shape-coil-${size}" viewBox="0 0 ${sz.w} ${sz.h}" role="img" aria-labelledby="${uid}-t ${uid}-d">` +
      `<title id="${uid}-t">${escapeHtml(title)}</title><desc id="${uid}-d">${escapeHtml(layerDesc(scene))}</desc>` +
      `<defs><linearGradient id="${uid}-g" x1="0" x2="0" y1="0" y2="1">` +
      `<stop offset="0" stop-color="${surf.body[0]}"/><stop offset=".6" stop-color="${surf.body[1]}"/><stop offset="1" stop-color="${surf.body[2]}"/></linearGradient>` +
      (size === 'lg' ? `<clipPath id="${uid}-c"><circle cx="${CUT.cx}" cy="${CUT.cy}" r="${CUT.r}"/></clipPath>` : '') + `</defs>`;
    // 몸통, 오른쪽 끝, 왼쪽 끝면(감긴 띠 + 내경 구멍)
    s += `<rect x="${x0}" y="${cy - sz.ry}" width="${len}" height="${sz.ry * 2}" fill="url(#${uid}-g)"/>` +
      `<ellipse cx="${x1}" cy="${cy}" rx="${sz.rx}" ry="${sz.ry}" fill="${surf.body[1]}"/>` +
      `<ellipse cx="${x0}" cy="${cy}" rx="${sz.rx}" ry="${sz.ry}" fill="${surf.face[0]}" stroke="${surf.face[2]}"/>`;
    [0.72, 0.5, 0.3].forEach(k => {
      s += `<ellipse cx="${x0}" cy="${cy}" rx="${(sz.rx * k).toFixed(1)}" ry="${(sz.ry * k).toFixed(1)}" fill="none" stroke="${surf.face[1]}"/>`;
    });
    s += `<ellipse cx="${x0}" cy="${cy}" rx="${(sz.rx * 0.28).toFixed(1)}" ry="${(sz.ry * 0.28).toFixed(1)}" fill="${surf.face[2]}"/>`;

    if (size === 'lg') {
      const dy = cy + sz.ry + 16;
      s += `<line x1="${x0}" y1="${dy}" x2="${x1}" y2="${dy}" class="shape-dim"/>` +
        `<line x1="${x0}" y1="${dy - 5}" x2="${x0}" y2="${dy + 5}" class="shape-dim"/><line x1="${x1}" y1="${dy - 5}" x2="${x1}" y2="${dy + 5}" class="shape-dim"/>` +
        `<text x="${(x0 + x1) / 2}" y="${dy + 16}" text-anchor="middle" class="shape-txt">폭 ${escapeHtml(fmtMm(scene.geometry.wid_mm))}</text>`;
      const sub = [];
      if (scene.geometry.id_mm != null) sub.push('내경 ' + fmtMm(scene.geometry.id_mm));
      if (scene.geometry.weight_t != null) sub.push('단중 ' + scene.geometry.weight_t.toFixed(1) + 't');
      if (sub.length) s += `<text x="${(x0 + x1) / 2}" y="${dy + 30}" text-anchor="middle" class="shape-txt shape-txt-dim">${escapeHtml(sub.join(' · '))}</text>`;
      s += `<line x1="${x1 - 10}" y1="${cy - sz.ry + 8}" x2="${CUT.cx - 40}" y2="${CUT.cy - 32}" class="shape-lead"/>` +
        `<circle cx="${CUT.cx}" cy="${CUT.cy}" r="${CUT.r}" class="shape-cut"/>` +
        `<text x="${CUT.cx}" y="${CUT.cy - CUT.r - 6}" text-anchor="middle" class="shape-txt shape-txt-acc">단면 확대</text>` +
        `<g clip-path="url(#${uid}-c)">${cutawayLayers(scene)}</g>` +
        `<text x="${CUT.cx}" y="${CUT.cy + CUT.r + 22}" text-anchor="middle" class="shape-txt shape-txt-dim">두께 눈금은 과장 · 숫자는 원값</text>`;
    }
    return s + '</svg>';
  }

  g.MesShape = Object.assign(g.MesShape || {}, {
    COLORS, escapeHtml, fmtMm, fmtUm, fmtDelta, coilLengths, layerHeights, renderCoil,
    _svg: { surfaceOf, layerColor, layerThkText, layerDesc, SIZES, CUT },
  });
})(globalThis);
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/shape/*.test.mjs`
Expected: 모두 PASS. (층 rect 의 속성 순서는 `x y width height fill class data-layer` 로 고정한다. 테스트 정규식이 이 순서를 전제한다.)

- [ ] **Step 5: 커밋**

```bash
git add assets/shape/shape-svg.js tests/shape/svg.test.mjs
git commit -m "설계 형상: 코일 SVG 렌더러 — 포맷·폭 비례·층 과장·단면 확대

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NrXKv6R83ZRSFvinggj1PK"
```

---

### Task 5: shape-svg 조립 — 장면 띠·상세·요약·섹션

**Files:**
- Modify: `assets/shape/shape-svg.js` (함수 추가, export 확장)
- Test: `tests/shape/svg.test.mjs` (테스트 추가)

**Interfaces:**
- Consumes: Task 4 함수들, `MesShape.CIRCLED`, `MesShape.ROUTE_NAMES`, `MesShape.PENDING_ROUTES`
- Produces: `renderStrip(model, selId)`, `renderDetail(scene, model)`, `renderLayerList(scene)`, `renderSummary(model)`, `renderSection(model, selId, {expanded}) → html`. 마크업 계약: 띠 칸은 `div.shape-sc[role=tab][data-scene=<id>][id=shape-tab-<id>][aria-selected][tabindex]`, 배지는 `button.shape-badge[data-route=<hash>]`(준비 중이면 `.pending`), 값 행은 `div.shape-v[tabindex=0][data-key]`

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/shape/svg.test.mjs` 끝에 추가:

```js
// ---- Task 5: 조립 ----
test('renderStrip: 장면 수만큼 tab, 선택 칸만 aria-selected/tabindex 0, 변화량 표시', () => {
  const html = M.renderStrip(G, 'rolled');
  assert.equal((html.match(/role="tab"/g) || []).length, 4);
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
  assert.match(html, /id="shape-tab-rolled"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="shape-tab-rolled"/);
  assert.match(html, /tabindex="0"/);
  assert.equal((html.match(/tabindex="-1"/g) || []).length, 3);
  assert.match(html, /① 원자재/);
  assert.match(html, /② 압연<small>1P PLTCM<\/small>/);
  assert.match(html, /Set 0\.420 × 1,231/);
  assert.match(html, /두께 −1\.380 · 폭 \+3/);
  assert.match(html, /층 \+2/);
  assert.match(html, /role="tablist"/);
  assert.equal(M.renderStrip(C, 'painted').match(/role="tab"/g).length, 5);
});

test('renderDetail: 값 행·배지·준비 중·산식 각주·설계값 없음', () => {
  const html = M.renderDetail(by(G, 'rolled'), G);
  assert.match(html, /data-key="set_thk"/);
  assert.match(html, /class="shape-n">0\.420<\/span> mm/);
  assert.match(html, /class="shape-badge" data-route="#\/quality-design\/module-management\/rolling-thickness-set">압연두께Set 관리 →/);
  assert.match(html, /class="shape-badge pending" data-route="#\/quality-design\/module-management\/line-width-shrinkage">폭수축량 관리 \(준비 중\) →/);
  assert.match(html, /shape-v-f">주문두께 − 0\.020/);
  assert.match(html, /두께 1\.800 → 0\.420 · 폭 1,228 → 1,231/);
  assert.match(html, /shape-layers/);
  const d = JSON.parse(JSON.stringify(by(G, 'rolled')));
  d.values[0] = { key: 'x', label: 'X', value: null, unit: null, formula: null, evidence: { kind: 'missing', ref: null, route: null, note: '설계값 없음' } };
  assert.match(M.renderDetail(d, G), /shape-missing">설계값 없음/);
});

test('renderSummary: 품명 · 원자재 → Set → 도금코드 → (도장) → 제품', () => {
  assert.equal(M.renderSummary(G), 'GI · 원자재 1.800×1,228 → Set 0.420×1,231 → Z12 → 제품 0.440×1,225');
  assert.match(M.renderSummary(C), /^CCGI · 원자재 .* → Set .* → E → TOP = 2 COAT \/ BACK = 1 COAT → 제품 0\.472×1,490$/);
});

test('renderSection: 경고 배지, expanded 클래스, 범례 6개', () => {
  const f = loadFixture('G');
  const m = M.buildShapeModel(f.design, Object.assign({}, f.order, { prd: 'X' }));
  const html = M.renderSection(m, 'rolled', { expanded: true });
  assert.match(html, /class="shape-root expanded"/);
  assert.match(html, /shape-warn">층 정의 없음 · 품명 X/);
  assert.equal((html.match(/class="shape-legend"/g) || []).length, 1);
  assert.equal((M.renderSection(G, 'nope').match(/aria-selected="true"/g) || []).length, 1, '없는 id 면 첫 장면 선택');
  assert.ok(!M.renderSection(G, 'rolled').includes('shape-root expanded'));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/shape/svg.test.mjs`
Expected: 4건 FAIL (`M.renderStrip is not a function`).

- [ ] **Step 3: 구현 추가**

`assets/shape/shape-svg.js`의 `g.MesShape = Object.assign(...)` 바로 앞에 추가하고, export 목록에 `renderStrip, renderDetail, renderLayerList, renderSummary, renderSection`을 넣는다.

```js
  function circled(scene, model) {
    const i = model.scenes.findIndex(s => s.id === scene.id);
    return (g.MesShape.CIRCLED && g.MesShape.CIRCLED[i]) || String(i + 1);
  }
  function geoLine(s) {
    return (s.id === 'rolled' ? 'Set ' : '') + fmtMm(s.geometry.thk_mm) + ' × ' + fmtMm(s.geometry.wid_mm);
  }
  function changeLine(s) {
    return s.changes.map(c =>
      c.key === 'thk_mm' ? '두께 ' + fmtDelta(c.delta, 'mm')
      : c.key === 'wid_mm' ? '폭 ' + fmtDelta(c.delta, 'mm')
      : '층 ' + fmtDelta(c.delta, null)).join(' · ');
  }

  function renderStrip(model, selId) {
    const lengths = coilLengths(model, 'sm');
    const cells = model.scenes.map(s => {
      const sel = s.id === selId;
      const sub = s.process ? `<small>${escapeHtml(s.process.code + ' ' + s.process.name)}</small>` : '';
      return `<div class="shape-sc${sel ? ' on' : ''}" role="tab" aria-selected="${sel}" tabindex="${sel ? 0 : -1}" data-scene="${escapeHtml(s.id)}" id="shape-tab-${escapeHtml(s.id)}">` +
        `<div class="shape-sc-t">${circled(s, model)} ${escapeHtml(s.title)}${sub}</div>` +
        renderCoil(s, model, { size: 'sm', lengths }) +
        `<div class="shape-sc-g">${escapeHtml(geoLine(s))}</div>` +
        `<div class="shape-sc-d">${escapeHtml(changeLine(s)) || '&nbsp;'}</div></div>`;
    });
    return `<div class="shape-strip" role="tablist" aria-label="설계 장면">${cells.join('<div class="shape-arr" aria-hidden="true">→</div>')}</div>`;
  }

  function renderLayerList(scene) {
    return `<ul class="shape-layers">` + scene.layers.map(l =>
      `<li><i style="background:${layerColor(l, scene)}"></i><span>${escapeHtml(l.label)}</span><b>${escapeHtml(layerThkText(l))}</b></li>`).join('') + `</ul>`;
  }

  function renderValue(v) {
    const e = v.evidence || {};
    const pending = !!(e.route && (g.MesShape.PENDING_ROUTES || []).includes(e.route));
    const name = (g.MesShape.ROUTE_NAMES || {})[e.route] || e.route;
    const badge = e.route
      ? `<button type="button" class="shape-badge${pending ? ' pending' : ''}" data-route="${escapeHtml(e.route)}">${escapeHtml(name)}${pending ? ' (준비 중)' : ''} →</button>` : '';
    const value = v.value == null
      ? `<span class="shape-missing">설계값 없음</span>`
      : `<span class="shape-n">${escapeHtml(typeof v.value === 'number' ? (v.unit === 'mm' ? fmtMm(v.value) : String(v.value)) : v.value)}</span>${v.unit ? ' ' + escapeHtml(v.unit) : ''}`;
    const foot = [v.formula, e.note].filter(Boolean).join(' · ');
    return `<div class="shape-v" tabindex="0" data-key="${escapeHtml(v.key)}"><div class="shape-v-k">${escapeHtml(v.label)}</div>` +
      `<div class="shape-v-b">${value}${badge}${foot ? `<div class="shape-v-f">${escapeHtml(foot)}</div>` : ''}</div></div>`;
  }

  function renderDetail(scene, model) {
    const ch = scene.changes
      .filter(c => c.key !== 'layers')
      .map(c => (c.key === 'thk_mm' ? '두께 ' : '폭 ') + fmtMm(c.from) + ' → ' + fmtMm(c.to)).join(' · ');
    const head = circled(scene, model) + ' ' + scene.title + (scene.process ? ' · ' + scene.process.code + ' ' + scene.process.name : '');
    return `<div class="shape-det"><div class="shape-fig">${renderCoil(scene, model, { size: 'lg' })}${renderLayerList(scene)}</div>` +
      `<div class="shape-vals"><div class="shape-det-h"><b>${escapeHtml(head)}</b>` +
      (ch ? `<span class="shape-delta">${escapeHtml(ch)}</span>` : '') +
      `<span class="shape-note">이 장면에서 정해진 값 · 산식과 근거 기준</span></div>` +
      scene.values.map(renderValue).join('') + `</div></div>`;
  }

  function renderSummary(model) {
    const by = id => model.scenes.find(s => s.id === id);
    const parts = [];
    const raw = by('raw'), rolled = by('rolled'), coated = by('coated'), painted = by('painted'), product = by('product');
    if (raw) parts.push('원자재 ' + fmtMm(raw.geometry.thk_mm) + '×' + fmtMm(raw.geometry.wid_mm));
    if (rolled) parts.push('Set ' + fmtMm(rolled.geometry.thk_mm) + '×' + fmtMm(rolled.geometry.wid_mm));
    if (coated) { const c = coated.values.find(v => v.key === 'coat_cd'); if (c && c.value != null) parts.push(String(c.value).split(' : ')[0]); }
    if (painted) { const p = painted.values.find(v => v.key === 'paint_way'); if (p && p.value != null) parts.push(String(p.value).split(' : ').pop()); }
    if (product) parts.push('제품 ' + fmtMm(product.geometry.thk_mm) + '×' + fmtMm(product.geometry.wid_mm));
    return model.productType + ' · ' + parts.join(' → ');
  }

  function legend() {
    return [['hot', '핫코일'], ['substrate', '소지(냉연)'], ['coating', '도금'], ['primer', '프라이머'], ['topcoat', 'Top 코트'], ['backcoat', 'Back 코트']]
      .map(([k, n]) => `<span><i style="background:${COLORS[k]}"></i>${n}</span>`).join('');
  }

  function renderSection(model, selId, opts) {
    const expanded = !!(opts && opts.expanded);
    const sel = model.scenes.find(s => s.id === selId) || model.scenes[0];
    const warn = (model.warnings || []).map(w => `<span class="shape-warn">${escapeHtml(w)}</span>`).join('');
    return `<div class="shape-root${expanded ? ' expanded' : ''}">` +
      (warn ? `<div class="shape-warns">${warn}</div>` : '') +
      renderStrip(model, sel.id) + renderDetail(sel, model) +
      `<div class="shape-legend">${legend()}</div></div>`;
  }
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/shape/*.test.mjs`
Expected: 모두 PASS. `renderSummary(C)`의 도금코드가 `E`가 아니면(픽스처 `common` 도금량코드 값 확인) 테스트 정규식의 그 부분을 픽스처 값으로 고친다.

- [ ] **Step 5: 커밋**

```bash
git add assets/shape/shape-svg.js tests/shape/svg.test.mjs
git commit -m "설계 형상: 장면 띠·상세·요약·섹션 조립 렌더러

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NrXKv6R83ZRSFvinggj1PK"
```

---

### Task 6: shape-widget 과 shape.css

**Files:**
- Create: `assets/shape/shape-widget.js`
- Create: `assets/shape/shape.css`
- Test: `tests/shape/widget.test.mjs`

**Interfaces:**
- Consumes: `MesShape.renderSection`(Task 5)
- Produces: `MesShape.mount(el, model, {onNavigate(route), initial}) → {select(id), getSelected(), destroy()}`, `MesShape.nextSceneId(model, curId, dir) → id`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/shape/widget.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture, loadShape } from './helpers.mjs';

const M = await loadShape();
const G = M.buildShapeModel(loadFixture('G').design, loadFixture('G').order);

test('nextSceneId: 좌우 이동, 양 끝에서 멈춤, 모르는 id 는 첫 장면 기준', () => {
  assert.equal(M.nextSceneId(G, 'rolled', 1), 'coated');
  assert.equal(M.nextSceneId(G, 'rolled', -1), 'raw');
  assert.equal(M.nextSceneId(G, 'raw', -1), 'raw');
  assert.equal(M.nextSceneId(G, 'product', 1), 'product');
  assert.equal(M.nextSceneId(G, 'nope', 1), 'rolled');
});

test('mount: 최소 DOM 흉내로 렌더·선택·destroy', () => {
  const listeners = {};
  const el = {
    innerHTML: '', contains: () => true,
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: t => { delete listeners[t]; },
    querySelector: () => null,
  };
  const nav = [];
  const w = M.mount(el, G, { onNavigate: r => nav.push(r) });
  assert.equal(w.getSelected(), 'rolled');
  assert.match(el.innerHTML, /id="shape-tab-rolled"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="shape-tab-rolled"/);
  const tab = { dataset: { scene: 'coated' }, closest: sel => sel === '[data-scene]' ? tab : null };
  listeners.click({ target: tab, preventDefault() {} });
  assert.equal(w.getSelected(), 'coated');
  const badge = { dataset: { route: '#/x' }, closest: sel => sel === '[data-route]' ? badge : null };
  listeners.click({ target: badge, preventDefault() {} });
  assert.deepEqual(nav, ['#/x']);
  listeners.keydown({ target: tab, key: 'ArrowRight', preventDefault() {} });
  assert.equal(w.getSelected(), 'product');
  listeners.dblclick({ target: tab });
  assert.match(el.innerHTML, /shape-root expanded/);
  w.destroy();
  assert.equal(el.innerHTML, '');
  assert.deepEqual(Object.keys(listeners), []);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/shape/widget.test.mjs`
Expected: FAIL (`M.nextSceneId is not a function`).

- [ ] **Step 3: 위젯 구현**

`assets/shape/shape-widget.js`:

```js
/* assets/shape/shape-widget.js — DOM 마운트와 상호작용 (장면 선택·키보드·더블클릭 확대·배지 이동) */
(function (g) {
  'use strict';

  function nextSceneId(model, curId, dir) {
    const ids = model.scenes.map(s => s.id);
    const i = Math.max(0, ids.indexOf(curId));
    return ids[Math.min(ids.length - 1, Math.max(0, i + dir))];
  }

  function mount(el, model, opts) {
    const M = g.MesShape;
    opts = opts || {};
    const wanted = opts.initial || 'rolled';
    const state = { sel: model.scenes.some(s => s.id === wanted) ? wanted : model.scenes[0].id, expanded: false };

    function render(focusTab) {
      el.innerHTML = M.renderSection(model, state.sel, { expanded: state.expanded });
      if (focusTab) { const t = el.querySelector('#shape-tab-' + state.sel); if (t && t.focus) t.focus(); }
    }
    function select(id, focusTab) {
      if (!model.scenes.some(s => s.id === id) || id === state.sel) return;
      state.sel = id;
      render(focusTab);
    }
    function onClick(e) {
      const badge = e.target.closest && e.target.closest('[data-route]');
      if (badge && el.contains(badge)) { e.preventDefault(); if (opts.onNavigate) opts.onNavigate(badge.dataset.route); return; }
      const tab = e.target.closest && e.target.closest('[data-scene]');
      if (tab && el.contains(tab)) select(tab.dataset.scene, false);
    }
    function onDblClick(e) {
      const tab = e.target.closest && e.target.closest('[data-scene]');
      if (tab && el.contains(tab)) { state.expanded = !state.expanded; render(false); }
    }
    function onKey(e) {
      const tab = e.target.closest && e.target.closest('[data-scene]');
      if (!tab || !el.contains(tab)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        select(nextSceneId(model, state.sel, e.key === 'ArrowRight' ? 1 : -1), true);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(tab.dataset.scene, true);
      }
    }

    el.addEventListener('click', onClick);
    el.addEventListener('dblclick', onDblClick);
    el.addEventListener('keydown', onKey);
    render(false);

    return {
      select: id => select(id, false),
      getSelected: () => state.sel,
      destroy() {
        el.removeEventListener('click', onClick);
        el.removeEventListener('dblclick', onDblClick);
        el.removeEventListener('keydown', onKey);
        el.innerHTML = '';
      },
    };
  }

  g.MesShape = Object.assign(g.MesShape || {}, { mount, nextSceneId });
})(globalThis);
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/shape/*.test.mjs`
Expected: 모두 PASS.

- [ ] **Step 5: CSS 작성**

`assets/shape/shape.css` (모듈 `:root` 토큰만 참조):

```css
/* assets/shape/shape.css — 설계 형상 섹션. 층 색은 SVG 인라인, 나머지는 모듈 토큰 */
.shape-root{container-type:inline-size}
.shape-warns{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.shape-warn{display:inline-flex;align-items:center;font-size:11px;font-weight:700;color:var(--st-fail);background:var(--st-fail-bg);border-radius:99px;padding:2px 9px}
.shape-strip{display:flex;gap:6px;align-items:stretch;flex-wrap:wrap}
.shape-sc{flex:1 1 120px;min-width:120px;border:1px solid var(--border);border-radius:10px;padding:8px 8px 6px;background:var(--surface);cursor:pointer;text-align:left}
.shape-sc:hover{background:var(--surface-2)}
.shape-sc.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft);background:var(--surface)}
.shape-sc:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.shape-sc-t{font-weight:700;font-size:11.5px;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.shape-sc-t small{color:var(--ink-3);font-weight:400;margin-left:4px}
.shape-sc .shape-coil-sm{width:100%;height:56px;display:block}
.shape-sc-g{font-family:'JetBrains Mono','Consolas',ui-monospace,monospace;font-size:11px;color:var(--accent);margin-top:4px;white-space:nowrap}
.shape-sc-d{font-family:'JetBrains Mono','Consolas',ui-monospace,monospace;font-size:10.5px;color:var(--st-fail);white-space:nowrap;min-height:14px}
.shape-arr{align-self:center;color:var(--border-strong);font-size:14px;flex:0 0 auto}
.shape-det{display:grid;grid-template-columns:320px 1fr;gap:14px;margin-top:12px;border-top:1px dashed var(--border);padding-top:12px}
.shape-root.expanded .shape-det{grid-template-columns:1fr}
.shape-root.expanded .shape-coil-lg{max-width:720px;margin:0 auto}
.shape-fig{background:var(--topbar-bg);border:1px solid var(--border);border-radius:10px;padding:8px}
.shape-coil-lg{width:100%;height:auto;display:block;font-family:'Gothic A1','Apple SD Gothic Neo',sans-serif;font-size:10.5px}
.shape-dim{stroke:var(--ink);stroke-width:1}
.shape-lead{stroke:var(--accent);stroke-dasharray:3 2;stroke-width:1}
.shape-cut{fill:var(--surface);stroke:var(--accent);stroke-width:1.5}
.shape-txt{fill:var(--ink)}
.shape-txt-dim{fill:var(--ink-3)}
.shape-txt-acc{fill:var(--accent)}
.shape-txt-onink{fill:#fff;font-weight:700}
.shape-layer:hover{stroke:var(--accent);stroke-width:1}
.shape-layers{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:3px;font-size:11px}
.shape-layers li{display:flex;align-items:center;gap:6px}
.shape-layers i{width:12px;height:8px;border-radius:2px;flex:none}
.shape-layers b{margin-left:auto;font-family:'JetBrains Mono','Consolas',ui-monospace,monospace;font-weight:600}
.shape-vals{display:grid;gap:6px;align-content:start}
.shape-det-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;margin-bottom:2px}
.shape-det-h b{font-size:12.5px}
.shape-delta{color:var(--st-fail);font-family:'JetBrains Mono','Consolas',ui-monospace,monospace;font-size:11px}
.shape-note{color:var(--ink-3);font-size:11px;margin-left:auto}
.shape-v{display:grid;grid-template-columns:150px 1fr;gap:8px;align-items:start;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface)}
.shape-v:hover,.shape-v:focus-within{border-color:var(--accent)}
.shape-v:hover .shape-v-f,.shape-v:focus-within .shape-v-f{color:var(--ink);font-weight:600}
.shape-v-k{color:var(--ink-2);font-size:12px}
.shape-v-b{font-size:12.5px}
.shape-n{font-family:'JetBrains Mono','Consolas',ui-monospace,monospace;font-weight:600}
.shape-missing{color:var(--ink-3)}
.shape-badge{display:inline-block;border:1px solid var(--accent);color:var(--accent-soft-ink);background:var(--accent-soft);border-radius:6px;padding:0 6px;font-size:10.5px;margin-left:6px;vertical-align:middle;cursor:pointer;font:inherit;font-size:10.5px}
.shape-badge:hover{background:var(--accent);color:var(--accent-on)}
.shape-badge.pending{border-color:var(--edit-bd);color:var(--result-soft-ink);background:var(--result-soft)}
.shape-badge.pending:hover{background:var(--result);color:#fff}
.shape-v-f{color:var(--ink-3);font-size:11px;margin-top:2px}
.shape-legend{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--ink-2);margin-top:10px}
.shape-legend i{display:inline-block;width:12px;height:8px;border-radius:2px;margin-right:4px;vertical-align:middle}
@container (max-width:720px){
  .shape-det{grid-template-columns:1fr}
  .shape-v{grid-template-columns:1fr}
  .shape-note{margin-left:0}
}
```

- [ ] **Step 6: 커밋**

```bash
git add assets/shape/shape-widget.js assets/shape/shape.css tests/shape/widget.test.mjs
git commit -m "설계 형상: 위젯(선택·키보드·확대·배지 이동)과 섹션 스타일

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NrXKv6R83ZRSFvinggj1PK"
```

---

### Task 7: 주입 스크립트와 설계결과 화면 통합

**Files:**
- Create: `build/inject_shape.py`
- Modify: `modules/quality-design.html` (`</style>` 앞 202행, `const SECS=[` 479행 앞, SECS 첫 항목, `renderDetail` 581행 부근, 섹션 map의 `acc-save`)
- Modify: `build/README.md` (파일 표, 작업 순서)
- Regenerate: `index.html`

**Interfaces:**
- Consumes: `assets/shape/{shape-model.js, shape-svg.js, shape-widget.js, shape.css}`, `MesShape.buildShapeModel`·`renderSummary`·`mount`
- Produces: `modules/quality-design.html`에 `shape` 섹션이 있는 목업, 재빌드된 `index.html`

- [ ] **Step 1: 주입 스크립트 작성**

`build/inject_shape.py`:

```python
#!/usr/bin/env python3
"""assets/shape/* 를 modules/quality-design.html 의 마커 구간에 주입한다 (멱등).

CSS 마커 (<style> 안):  /*__SHAPE_CSS_START__*/ … /*__SHAPE_CSS_END__*/
JS  마커 (<script> 안): /*__SHAPE_JS_START__*/  … /*__SHAPE_JS_END__*/

사용:  python3 build/inject_shape.py          # 주입
       python3 build/inject_shape.py --check  # 주입 결과가 최신인지 확인만 (다르면 exit 1)
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODULE = ROOT / 'modules' / 'quality-design.html'
SHAPE = ROOT / 'assets' / 'shape'
JS_FILES = ['shape-model.js', 'shape-svg.js', 'shape-widget.js']
CSS_FILE = 'shape.css'
CSS_S, CSS_E = '/*__SHAPE_CSS_START__*/', '/*__SHAPE_CSS_END__*/'
JS_S, JS_E = '/*__SHAPE_JS_START__*/', '/*__SHAPE_JS_END__*/'


def replace_between(src, mark_s, mark_e, body):
    if src.count(mark_s) != 1 or src.count(mark_e) != 1:
        raise SystemExit('FAIL: 마커가 정확히 1개씩 있어야 함: %s / %s' % (mark_s, mark_e))
    i = src.index(mark_s) + len(mark_s)
    j = src.index(mark_e)
    if j < i:
        raise SystemExit('FAIL: 마커 순서가 잘못됨: %s' % mark_s)
    return src[:i] + '\n' + body.rstrip('\n') + '\n' + src[j:]


def build():
    src = MODULE.read_text(encoding='utf-8')
    css = (SHAPE / CSS_FILE).read_text(encoding='utf-8')
    js = '\n'.join((SHAPE / f).read_text(encoding='utf-8') for f in JS_FILES)
    for bad in ('</style>', '</script>'):
        if bad in css or bad in js:
            raise SystemExit('FAIL: 주입 본문에 %s 가 있음' % bad)
    out = replace_between(src, CSS_S, CSS_E, css)
    out = replace_between(out, JS_S, JS_E, js)
    return src, out, len(css), len(js)


def main():
    check = '--check' in sys.argv[1:]
    src, out, ncss, njs = build()
    if out == src:
        print('INJECT: 변경 없음')
        return
    if check:
        print('FAIL: quality-design.html 의 주입 구간이 assets/shape 와 다름 — python3 build/inject_shape.py 실행 필요')
        sys.exit(1)
    MODULE.write_text(out, encoding='utf-8', newline='')
    print('INJECT OK: css %d bytes, js %d bytes → %s' % (ncss, njs, MODULE.relative_to(ROOT)))


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: 마커 없이 실행해 실패 확인**

Run: `python3 build/inject_shape.py`
Expected: `FAIL: 마커가 정확히 1개씩 있어야 함: /*__SHAPE_CSS_START__*/ …` 로 exit 1.

- [ ] **Step 3: quality-design.html 에 마커와 통합 코드 추가**

(a) 202행 `</style>` 바로 앞 줄에 추가:

```css
/*__SHAPE_CSS_START__*/
/*__SHAPE_CSS_END__*/
```

(b) 479행 `const SECS=[` 바로 앞에 추가:

```js
/*__SHAPE_JS_START__*/
/*__SHAPE_JS_END__*/

/* ---------- 설계 형상 (MesShape) ---------- */
let shapeModel=null, shapeWidget=null;
function jumpTo(hash){
  try{ if(window.self!==window.top){window.top.location.hash=hash;return;} }catch(e){}
  toast('포털에서 열면 해당 화면으로 이동합니다: '+hash);
}
```

(c) `const SECS=[` 다음 줄(첫 항목 `{id:'common',…` 앞)에 첫 항목으로 추가:

```js
 {id:'shape',t:'설계 형상',noSave:true,
  sum:()=>shapeModel?MesShape.renderSummary(shapeModel):'',
  body:()=>'<div class="shape-host" data-shape-host></div>'},
```

(d) `renderDetail()` 안에서 `const d=detailOf(o);` 줄을 아래로 교체:

```js
  const d=detailOf(o);
  if(shapeWidget){shapeWidget.destroy();shapeWidget=null;}
  shapeModel=MesShape.buildShapeModel(d,o);
```

(e) 같은 함수에서 섹션 map의 저장 버튼 줄

```js
          <div class="acc-save"><button class="btn btn-sm" data-mock="${s.t} 저장">저장</button></div>
```

을 아래로 교체:

```js
          ${s.noSave?'':`<div class="acc-save"><button class="btn btn-sm" data-mock="${s.t} 저장">저장</button></div>`}
```

(f) `renderDetail()`의 마지막 문장(`<p class="subtle-note">…</p>\`;`로 끝나는 `innerHTML` 대입) 바로 뒤, 함수 닫는 `}` 앞에 추가:

```js
  const host=$('[data-shape-host]');
  if(host&&shapeModel)shapeWidget=MesShape.mount(host,shapeModel,{onNavigate:jumpTo});
```

- [ ] **Step 4: 주입 실행과 멱등성 확인**

```bash
python3 build/inject_shape.py && python3 build/inject_shape.py --check && echo IDEMPOTENT
grep -c "MesShape.mount" modules/quality-design.html
grep -c "__SHAPE_JS_START__" modules/quality-design.html
```

Expected: 첫 줄 `INJECT OK: …` 다음 `INJECT: 변경 없음` 다음 `IDEMPOTENT`. grep 결과는 각각 `2`(주입된 widget 정의 + 호출) 이상, `1`.

- [ ] **Step 5: 픽스처 재생성·테스트 재실행**

주입 후에도 픽스처 생성기가 동작해야 한다(`MesShape` 스텁이 sandbox에 있음).

```bash
node tests/shape/fixtures/gen.mjs && git diff --stat tests/shape/fixtures
node --test tests/shape/*.test.mjs
```

Expected: 픽스처 diff 없음(설계결과 산식은 바뀌지 않았으므로), 테스트 모두 PASS.

- [ ] **Step 6: 브라우저 스모크 (단독 실행)**

`modules/quality-design.html`을 브라우저에서 직접 연다(`open modules/quality-design.html`).
확인: 오른쪽 패널 첫 섹션이 "설계 형상"이고 요약줄이 `CCGI · 원자재 …`로 시작한다. 띠 5칸, ②가 선택돼 있다. 칸 클릭·←→·Enter로 선택이 바뀐다. 더블클릭하면 그림이 전체 폭으로 커진다. 배지를 누르면 토스트에 라우트 이름이 뜬다(단독 실행). 콘솔 오류 없음.

- [ ] **Step 7: index.html 재빌드와 포털 확인**

```bash
python3 build/build_single.py
open index.html
```

포털에서 `품질설계 › 설계결과관리 › 품질설계결과`를 열어 같은 내용을 확인하고, 배지 클릭 시 포털이 해당 메뉴로 이동하는지(압연두께Set 관리 → 화면 열림, 폭수축량 관리 → 준비 중 화면) 확인한다.

- [ ] **Step 8: README 갱신**

`build/README.md` 파일 표에 두 행 추가(`modules/quality-design.html` 행 바로 아래):

```markdown
| `assets/shape/shape-model.js` · `shape-svg.js` · `shape-widget.js` · `shape.css` | 설계 형상 렌더러 (설계결과 → 장면 모델 → 코일 SVG·값 목록 → DOM). 전역 `MesShape`. `build/inject_shape.py`가 `quality-design.html` 마커 구간(`/*__SHAPE_CSS_START__*/`, `/*__SHAPE_JS_START__*/`)에 주입. 테스트 `node --test tests/shape/*.test.mjs`. 설계: `design/specs/2026-09-14-design-shape-visualization.md` |
| `build/inject_shape.py` | 위 4파일을 `modules/quality-design.html`에 주입(멱등). `--check`는 최신 여부만 확인 |
```

작업 순서 1번 뒤에 추가:

```markdown
1-1. (설계 형상 렌더러를 고쳤을 때만) `node --test tests/shape/*.test.mjs` → `python3 build/inject_shape.py`
```

- [ ] **Step 9: 커밋**

```bash
git add build/inject_shape.py modules/quality-design.html build/README.md index.html
git commit -m "설계결과 화면에 설계 형상 섹션 탑재 — 마커 주입·jumpTo·mount 훅

- build/inject_shape.py 로 assets/shape/* 를 quality-design.html 에 주입(멱등)
- SECS 맨 앞 shape 섹션, 저장 버튼 없음, 배지 이동은 포털 해시
- index.html 재빌드

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NrXKv6R83ZRSFvinggj1PK"
```

---

### Task 8: 의뢰 19건 수동 검증과 마무리

**Files:**
- Modify: (발견된 결함에 따라) `assets/shape/*`, `tests/shape/*`, 재주입·재빌드

**Interfaces:**
- Consumes: Task 7 산출물
- Produces: 스펙 §8 체크리스트 완료 상태

- [ ] **Step 1: 19건 순회 체크리스트**

`index.html`을 포털로 열고 의뢰 목록 19건을 위에서 아래로 하나씩 선택하며 아래를 확인한다. 결과를 `design/specs/2026-09-14-design-shape-visualization.md` §8 체크리스트에 기록한다.

| 확인 항목 | 기대 |
|---|---|
| 품명 G·L·W(13건) | 띠 4칸, 도금 장면 코일이 청회색, ④ 없음 |
| 품명 3·4(2건: D260831014, D260831032) | 띠 5칸, ④ 칼라 칸 금색, 층 목록 6개 |
| D260831014-010(refDetail) | 값 목록에 "설계값 없음"이 아닌 값이 채워짐(common 45행에서 라벨 검색) |
| 두께 1.600(D260831059 2건) | 요약줄·띠·상세 숫자가 `1.600`·`6.400`처럼 소수 3자리로 표시 |
| 폭 소수(E260814004 1217.6) | 폭 라벨 `1,218` 반올림 표시, 콘솔 오류 없음 |
| 모든 건 | 콘솔 오류 0, 섹션 접기/펼치기·전체 접기·전체 펼치기 동작, "설계 형상"에 저장 버튼 없음 |
| 패널 폭 720px 미만(스플리터로 목록을 넓혀서) | 띠 2줄 감김, 상세가 세로 배치 |

- [ ] **Step 2: 결함 수정 루프**

결함이 있으면 (1) `tests/shape/`에 재현 테스트 추가 → (2) 실패 확인 → (3) `assets/shape/*` 수정 → (4) `node --test tests/shape/*.test.mjs` 통과 → (5) `python3 build/inject_shape.py && python3 build/build_single.py` → (6) 브라우저 재확인. 결함마다 커밋한다.

```bash
git add -A assets/shape tests/shape modules/quality-design.html index.html
git commit -m "설계 형상: <결함 요약> 수정

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NrXKv6R83ZRSFvinggj1PK"
```

- [ ] **Step 3: 스펙 체크리스트 갱신과 최종 확인**

`design/specs/2026-09-14-design-shape-visualization.md` §8의 `- [ ]`를 `- [x]`로 바꾸고, 19건 순회에서 발견해 고친 항목을 §8 아래에 "검증 기록 (날짜)"로 한 줄씩 적는다.

```bash
node --test tests/shape/*.test.mjs && python3 build/inject_shape.py --check && git status --short
git add design/specs/2026-09-14-design-shape-visualization.md
git commit -m "설계 형상: 수동 검증 19건 완료 기록

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NrXKv6R83ZRSFvinggj1PK"
```

Expected: 테스트 전부 PASS, `INJECT: 변경 없음`, 작업 트리 clean.
