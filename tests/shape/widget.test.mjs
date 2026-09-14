import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadFixture, loadShape, ROOT } from './helpers.mjs';

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

test('mount: 탭 클릭으로 선택해도 해당 탭에 포커스를 유지한다', () => {
  const listeners = {};
  let focused = false;
  const el = {
    innerHTML: '', contains: () => true,
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: t => { delete listeners[t]; },
    querySelector: () => ({ focus() { focused = true; } }),
  };
  const w = M.mount(el, G, {});
  const tab = { dataset: { scene: 'coated' }, closest: sel => sel === '[data-scene]' ? tab : null };
  listeners.click({ target: tab, preventDefault() {} });
  assert.equal(w.getSelected(), 'coated');
  assert.equal(focused, true, '클릭으로 선택한 탭에 focus() 가 호출되어야 함');
});

test('shape.css: 띠 기하·변화량 줄(.shape-sc-g, .shape-sc-d)은 줄바꿈을 허용해 셀 안에서 잘리지 않는다', () => {
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'shape', 'shape.css'), 'utf8');
  for (const sel of ['.shape-sc-g', '.shape-sc-d']) {
    const m = css.match(new RegExp('\\' + sel + '\\{([^}]*)\\}'));
    assert.ok(m, `${sel} 규칙을 찾을 수 없음`);
    assert.doesNotMatch(m[1], /white-space:nowrap/, `${sel} 는 white-space:nowrap 이면 안 됨(셀 안에서 잘림)`);
  }
});
