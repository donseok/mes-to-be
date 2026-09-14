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
