import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReport, pageHeight } from './helpers.mjs';

const R = await loadReport();

// 실측 대신 가짜 높이를 넣는다. paginate 는 순수 함수라 DOM 없이 전부 검증할 수 있다.
const table = (n, opt = {}) => ({ id: 'coils', kind: 'table', headH: opt.headH ?? 10, footH: opt.footH ?? 10, rowHs: Array(n).fill(opt.rowH ?? 10) });
const block = (id, h) => ({ id, kind: 'block', h });

function tablePieces(pages) {
  return pages.flat().filter(p => p.kind === 'table');
}

test('전부 한 장에 들어가면 1장', () => {
  const blocks = [block('info', 20), table(3), block('sign', 20)];
  const pages = R.paginate(blocks, 200);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].map(p => p.id), ['info', 'coils', 'sign']);
  assert.equal(pages[0][1].last, true);
});

test('표가 넘치면 장을 나누고, 조각들이 모든 행을 순서대로 정확히 한 번씩 덮는다', () => {
  const blocks = [block('info', 40), block('crit', 40), table(20), block('sign', 50)];
  const pages = R.paginate(blocks, 100);
  const pieces = tablePieces(pages);
  assert.ok(pieces.length > 1, '표가 여러 조각으로 나뉜다');
  assert.equal(pieces[0].from, 0);
  assert.equal(pieces[pieces.length - 1].to, 20);
  for (let i = 1; i < pieces.length; i++) assert.equal(pieces[i].from, pieces[i - 1].to, '틈·중복 없음');
});

test('어느 장도 용량을 넘지 않는다 (머리글·소계 자리를 장마다 다시 확보)', () => {
  const blocks = [block('info', 40), block('crit', 40), table(20), block('sign', 50)];
  const pageH = 100;
  const pages = R.paginate(blocks, pageH);
  pages.forEach((p, i) => assert.ok(pageHeight(p, blocks) <= pageH, `${i + 1}장 높이 ${pageHeight(p, blocks)} <= ${pageH}`));
});

test('last 플래그는 마지막 표 조각에만 붙는다 (총계 vs 이 장 소계)', () => {
  const pages = R.paginate([table(25)], 100);
  const pieces = tablePieces(pages);
  assert.equal(pieces.filter(p => p.last).length, 1);
  assert.equal(pieces[pieces.length - 1].last, true);
});

test('마지막 장에 서명란이 안 들어가면 다음 장으로 넘긴다', () => {
  // 표가 딱 맞게 끝나 서명란 자리가 남지 않는 높이
  const blocks = [table(8), block('sign', 60)];
  const pages = R.paginate(blocks, 100);
  const signPage = pages.findIndex(p => p.some(x => x.id === 'sign'));
  assert.ok(signPage >= 0, '서명란이 어딘가에는 있다');
  assert.ok(pageHeight(pages[signPage], blocks) <= 100, '서명란이 실린 장도 넘치지 않는다');
  assert.equal(pages.flat().filter(x => x.id === 'sign').length, 1, '서명란은 한 번만');
});

test('한 장보다 큰 블록도 무한 루프 없이 자기 장에 놓인다', () => {
  const pages = R.paginate([block('info', 20), block('huge', 500)], 100);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[1].map(p => p.id), ['huge']);
});

test('한 장보다 큰 행이 있어도 최소 1행은 올려 무한 루프를 막는다', () => {
  const pages = R.paginate([table(3, { rowH: 500 })], 100);
  const pieces = tablePieces(pages);
  assert.equal(pieces.length, 3);
  pieces.forEach(p => assert.equal(p.to - p.from, 1));
  assert.equal(pieces[2].last, true);
});

test('행이 없는 표는 건너뛴다', () => {
  const pages = R.paginate([block('info', 20), table(0)], 100);
  assert.deepEqual(pages[0].map(p => p.id), ['info']);
});

test('블록이 하나도 없으면 빈 장 1개', () => {
  assert.deepEqual(R.paginate([], 100), [[]]);
});

test('머리글·소계가 클수록 장당 행 수가 줄어든다', () => {
  const few = tablePieces(R.paginate([table(40, { headH: 40, footH: 40 })], 100));
  const many = tablePieces(R.paginate([table(40, { headH: 5, footH: 5 })], 100));
  assert.ok(few.length > many.length, `머리글이 크면 장수가 늘어난다 (${few.length} > ${many.length})`);
});
