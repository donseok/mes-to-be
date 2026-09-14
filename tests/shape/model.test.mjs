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
  assert.match(valOf(by(G, 'raw'), 'rmtl_thk').formula, /주문두께 × 4, 0\.1 mm 반올림 \(목업 고정식\)/);
});

test('도금 후 두께 각주: BMT 주문은 "BMT 주문 · 도금두께 별도", TCT 주문은 "TCT · 도금 포함" — 원천은 항상 주문두께', () => {
  const bmt = valOf(by(G, 'coated'), 'coated_thk');
  assert.equal(bmt.value, G.scenes.find(s => s.id === 'coated').geometry.thk_mm);
  assert.equal(bmt.formula, '주문두께 (BMT 주문 · 도금두께 별도)');
  assert.equal(bmt.evidence.note, null);

  const f = loadFixture('G');
  const d = JSON.parse(JSON.stringify(f.design));
  const row = d.common.find(r => r[0] === '주문두께구분');
  row[1] = '2 : TCT';
  const tctModel = M.buildShapeModel(d, f.order);
  const tct = valOf(by(tctModel, 'coated'), 'coated_thk');
  assert.equal(tct.value, tctModel.scenes.find(s => s.id === 'coated').geometry.thk_mm);
  assert.equal(tct.formula, '주문두께 (TCT · 도금 포함)');
  assert.equal(tct.evidence.note, null);
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
