import test from 'node:test';
import assert from 'node:assert/strict';
import {seed, pure, rules, dict, pureSrc} from '../oc_pure.mjs';

test('하네스 — 시드와 순수 구역이 Node에서 로드된다', () => {
  assert.equal(rules.length, 138);
  assert.equal(dict.fields.length, 66);
  assert.equal(dict.valueLabels.length, 41);
  assert.equal(seed.content_hash, '83af2e6596a0');
});

test('fieldLabel — 사전에 있으면 한국어 라벨, 없으면 키 그대로', () => {
  assert.equal(pure.fieldLabel(dict, 'ORD_SPNL_TP'), '주문Spangle구분');
  assert.equal(pure.fieldLabel(dict, 'PRD_NM_CD'), '품명코드');
  assert.equal(pure.fieldLabel(dict, 'NO_SUCH_KEY'), 'NO_SUCH_KEY');
});

test('valueLabel — 근거 없는 라벨은 만들지 않는다', () => {
  assert.equal(pure.valueLabel(dict, 'PRD_NM_CD', 'G').text, 'GI');
  assert.equal(pure.valueLabel(dict, 'PRD_NM_CD', 'G').certainty, '추정');
  assert.equal(pure.valueLabel(dict, 'PRD_NM_CD', 'ZZZ'), null);
});

test('valueLabel — certainty 는 폴백이 아니라 실제 값을 읽는다', () => {
  const d = {fields: [], valueLabels: [
    {field: 'F', code: 'a', label: '확정라벨', certainty: '확정'},
    {field: 'F', code: 'b', label: '폴백라벨'}
  ]};
  assert.equal(pure.valueLabel(d, 'F', 'a').certainty, '확정');
  assert.equal(pure.valueLabel(d, 'F', 'b').certainty, '추정');
});

test('순수 구역은 브라우저 전역을 참조하지 않는다', () => {
  assert.deepEqual(pureSrc.match(/\b(document|window|localStorage|alert|fetch|state)\b/g) ?? [], []);
});

/* 표 셀 한 줄로 평탄화 — 길이 측정과 회귀 고정에 쓴다 */
function plain(rule){
  const c = pure.condCellText(dict, rule);
  return (c.tag ? '[' + c.tag + '] ' : '') + c.text + (c.extra ? '  +' + c.extra + '조건' : '');
}
const byId = id => rules.find(r => r.id === id);

test('condCellText — 조건 2개는 세로선으로 잇는다', () => {
  assert.equal(plain(byId('R-075')), '품명코드 G(GI)·K·V 중 하나 │ 주문Spangle구분 6');
  assert.equal(plain(byId('R-112')), '주문Slit조수 10 이상 │ 조합폭10 0');
});

test('condCellText — 문맥 없는 룰에 태그를 붙인다', () => {
  assert.equal(plain(byId('R-001')), '[필수값] 주문요청번호 비어 있음');
  assert.equal(
    plain(byId('R-010')),
    '[모든 주문] 주문용도코드 AZZ000(이행용)·BZZ000(이행용)·CZZ000(이행용) 외 8개 중 하나'
  );
  const tags = rules.reduce((a, r) => {
    const t = pure.condCellText(dict, r).tag || '';
    a[t] = (a[t] || 0) + 1; return a;
  }, {});
  assert.equal(tags['필수값'], 28);
  assert.equal(tags['모든 주문'], 6);
  assert.equal(tags[''], 104);
});

test('condCellText — 조건 3개 이상은 문맥1 + 대상 + "+N조건"으로 자른다', () => {
  assert.equal(
    plain(byId('R-095')),
    '품명코드 C·D(F/H)·E 외 5개 중 하나 │ 주문포장단중하한값 1 미만  +1조건'
  );
  assert.equal(rules.filter(r => pure.condCellText(dict, r).extra > 0).length, 23);
});

test('condCellText — 값 목록은 4개 이상이면 앞 3개 + "외 N개"', () => {
  const c = pure.condCellText(dict, byId('R-010'));
  assert.match(c.text, /외 8개 중 하나$/);
  const three = pure.condCellText(dict, byId('R-075'));   // 값 3개 — 접지 않는다
  assert.match(three.text, /G\(GI\)·K·V 중 하나/);
});

test('condCellText — 138건 전부 표 한 줄에 들어간다', () => {
  const lens = rules.map(r => plain(r).length).sort((a, b) => a - b);
  assert.equal(lens[Math.floor(lens.length / 2)], 31);          // 중앙값
  assert.equal(lens[Math.floor(lens.length * 0.9)], 53);        // p90
  assert.equal(lens[lens.length - 1], 62);                      // 최대
  assert.ok(lens[lens.length - 1] <= 64, '표 셀 상한 초과');
});
