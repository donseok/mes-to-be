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
