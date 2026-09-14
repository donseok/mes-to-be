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
