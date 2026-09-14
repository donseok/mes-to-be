import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadFixture, loadShape, ROOT } from './helpers.mjs';

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

test('tint: 흰색/검은색 극단, 0은 원색 유지, 부호에 따라 밝기 변화', () => {
  assert.equal(M.tint('#000000', 1), '#FFFFFF');
  assert.equal(M.tint('#FFFFFF', -1), '#000000');
  assert.equal(M.tint('#9FB7C3', 0), '#9FB7C3');
  const base = [0x9F, 0xB7, 0xC3];
  const lighter = M.tint('#9FB7C3', 0.45).slice(1).match(/../g).map(h => parseInt(h, 16));
  const darker = M.tint('#9FB7C3', -0.35).slice(1).match(/../g).map(h => parseInt(h, 16));
  base.forEach((c, i) => {
    assert.ok(lighter[i] >= c, `lighter channel ${i}: ${lighter[i]} >= ${c}`);
    assert.ok(darker[i] <= c, `darker channel ${i}: ${darker[i]} <= ${c}`);
  });
});

test('shape-svg.js 에는 COLORS 6개 외 리터럴 hex 색이 없다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'assets', 'shape', 'shape-svg.js'), 'utf8');
  const found = new Set((src.match(/#[0-9A-Fa-f]{6}/g) || []).map(h => h.toUpperCase()));
  const allowed = new Set(Object.values(M.COLORS).map(h => h.toUpperCase()));
  assert.deepEqual(found, allowed);
});

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

test('renderSummary: 평문 계약 — 이스케이프하지 않는다', () => {
  const m = JSON.parse(JSON.stringify(G));
  m.productType = 'A&B';
  assert.ok(M.renderSummary(m).startsWith('A&B · '));
});

test('renderStrip/renderDetail: 동적 텍스트(장면 제목·공정명·값 라벨·산식) 이스케이프', () => {
  const model = JSON.parse(JSON.stringify(G));
  model.scenes[1].title = '<b>t</b>';
  model.scenes[1].values[0].label = '<i>l</i>';
  model.scenes[1].values[0].formula = 'x & "y"';
  model.scenes[1].process.name = '<u>p</u>';
  const strip = M.renderStrip(model, 'rolled');
  const detail = M.renderDetail(model.scenes[1], model);
  [strip, detail].forEach(html => {
    assert.ok(!html.includes('<b>t</b>'));
    assert.ok(!html.includes('<i>l</i>'));
    assert.ok(!html.includes('<u>p</u>'));
    assert.ok(!html.includes('& "y"'));
  });
  assert.ok(strip.includes('&lt;b&gt;t&lt;/b&gt;'));
  assert.ok(strip.includes('&lt;u&gt;p&lt;/u&gt;'));
  assert.ok(detail.includes('&lt;i&gt;l&lt;/i&gt;'));
  assert.ok(detail.includes('&amp; &quot;y&quot;'));
});
