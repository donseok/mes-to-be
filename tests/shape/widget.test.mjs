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
