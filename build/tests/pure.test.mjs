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
