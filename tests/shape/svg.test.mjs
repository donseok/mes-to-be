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
