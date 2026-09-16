import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReport, seedRows } from './helpers.mjs';

const R = await loadReport();
const ROWS = seedRows();
const byNo = no => ROWS.find(r => r.no === no);
const issued = () => byNo('QC-2609-0101'); // 발행 · SGCC(YP≥205 TS≥270 EL≥20) · Z08(≥80)
const sgc340 = () => byNo('QC-2608-0098'); // 재발행 · SGC340
const noEl = () => byNo('QC-2608-0096');   // 발행 · SGLC570 — 연신율 규정 없음

test('필드 등급: 시험값 4종은 correct, 원천 값은 locked, 모르는 필드는 locked', () => {
  for (const k of ['yp', 'ts', 'el', 'coat']) assert.equal(R.fieldGrade('coils[].' + k), 'correct', k);
  for (const k of ['no', 'heat', 'thk', 'wid', 'wgt']) assert.equal(R.fieldGrade('coils[].' + k), 'locked', k);
  assert.equal(R.fieldGrade('cert.no'), 'locked');
  assert.equal(R.fieldGrade('remark'), 'free');
  assert.equal(R.fieldGrade('customer.displayName'), 'approve');
  assert.equal(R.fieldGrade('없는.필드'), 'locked', '등록되지 않은 필드는 잠긴다');
  assert.deepEqual(R.TEST_FIELDS, ['yp', 'ts', 'el', 'coat']);
});

test('난수 시드는 버전과 무관 — v1 과 v2 는 같은 코일 목록에서 출발한다', () => {
  const a = R.buildCertDoc(issued());
  const b = R.buildCertDoc(Object.assign({}, issued(), { ver: 'v2', st: '재발행' }));
  assert.deepEqual(a.coils, b.coils);
});

test('재발행일이 바뀌어도 firstIssued 가 있으면 코일번호가 흔들리지 않는다', () => {
  const a = R.buildCertDoc(issued());
  const b = R.buildCertDoc(Object.assign({}, issued(), { ver: 'v2', date: '2026-09-16', firstIssued: '2026-09-02' }));
  assert.deepEqual(a.coils.map(c => c.no), b.coils.map(c => c.no));
  assert.equal(b.firstIssued, '2026-09-02');
  assert.equal(a.firstIssued, null, '최초 발행 = 발행일이면 따로 표시하지 않는다');
});

test('정정 오버레이: 값이 바뀌고 corrected 표시가 남고 다른 코일은 그대로', () => {
  const base = R.buildCertDoc(issued());
  const c0 = base.coils[0];
  const row = Object.assign({}, issued(), {
    corrections: [{ coil: c0.no, field: 'ts', from: c0.ts, to: c0.ts + 7, reason: 'x', by: 'y', at: 't', fromVer: 'v1', toVer: 'v2' }],
  });
  const d = R.buildCertDoc(row);
  assert.equal(d.coils[0].ts, c0.ts + 7);
  assert.deepEqual(d.coils[0].corrected, { ts: { from: c0.ts, to: c0.ts + 7 } });
  assert.equal(d.coils[0].yp, c0.yp, '정정하지 않은 항목은 그대로');
  assert.deepEqual(d.coils.slice(1), base.coils.slice(1), '다른 코일은 그대로');
  assert.equal(d.coils[0].pass, true);
  assert.notEqual(d.fingerprint, base.fingerprint, '정정되면 지문이 바뀐다');
  assert.equal(d.corrections.length, 1);
});

test('정정 오버레이: 같은 칸을 두 번 정정하면 마지막 값이 남는다 (시간순)', () => {
  const c0 = R.buildCertDoc(issued()).coils[0];
  const row = Object.assign({}, issued(), { corrections: [
    { coil: c0.no, field: 'ts', from: c0.ts, to: c0.ts + 5, fromVer: 'v1', toVer: 'v2' },
    { coil: c0.no, field: 'ts', from: c0.ts + 5, to: c0.ts + 9, fromVer: 'v2', toVer: 'v3' },
  ] });
  assert.equal(R.buildCertDoc(row).coils[0].ts, c0.ts + 9);
});

test('정정 오버레이: locked 항목(중량)에 대한 정정 기록은 무시된다', () => {
  const c0 = R.buildCertDoc(issued()).coils[0];
  const d = R.buildCertDoc(Object.assign({}, issued(), { corrections: [{ coil: c0.no, field: 'wgt', from: c0.wgt, to: 1 }] }));
  assert.equal(d.coils[0].wgt, c0.wgt);
  assert.equal(d.coils[0].corrected, undefined);
});

test('validateCorrections: 현재 값과 같은 항목은 변경 없음 — 오류도 아니고 변경도 아니다', () => {
  const d = R.buildCertDoc(issued());
  const v = R.validateCorrections(d, [{ coil: d.coils[0].no, field: 'ts', to: d.coils[0].ts }]);
  assert.equal(v.ok, false);
  assert.equal(v.changed.length, 0);
  assert.equal(v.errors.length, 0);
});

test('validateCorrections: 정상 정정', () => {
  const d = R.buildCertDoc(issued());
  const c = d.coils[1];
  const v = R.validateCorrections(d, [{ coil: c.no, field: 'ts', to: String(c.ts + 4) }, { coil: c.no, field: 'coat', to: c.coat + 3 }]);
  assert.equal(v.ok, true);
  assert.deepEqual(v.changed, [{ coil: c.no, field: 'ts', from: c.ts, to: c.ts + 4 }, { coil: c.no, field: 'coat', from: c.coat, to: c.coat + 3 }]);
});

test('validateCorrections: 규격 미달 값은 막힌다 — 불합격 코일은 보증서에 못 실린다', () => {
  const d = R.buildCertDoc(issued());
  const v = R.validateCorrections(d, [{ coil: d.coils[0].no, field: 'ts', to: d.spec.ts - 1 }]);
  assert.equal(v.ok, false);
  assert.equal(v.errors.length, 1);
  assert.match(v.errors[0].reason, /규격 미달/);
  const v2 = R.validateCorrections(d, [{ coil: d.coils[0].no, field: 'coat', to: d.coat.min - 1 }]);
  assert.match(v2.errors[0].reason, /C\/W .* 규격 미달/);
});

test('validateCorrections: 기준값 그 자체(하한)는 허용된다', () => {
  const d = R.buildCertDoc(sgc340());
  const c = d.coils[0];
  const v = R.validateCorrections(d, [{ coil: c.no, field: 'yp', to: d.spec.yp }]);
  assert.equal(v.ok, c.yp !== d.spec.yp);
  assert.equal(v.errors.length, 0);
});

test('validateCorrections: locked 항목·숫자 아님·없는 코일은 오류', () => {
  const d = R.buildCertDoc(issued());
  const c = d.coils[0];
  const v = R.validateCorrections(d, [
    { coil: c.no, field: 'wgt', to: 9999 },
    { coil: c.no, field: 'ts', to: 'abc' },
    { coil: 'C000000000', field: 'ts', to: 300 },
  ]);
  assert.equal(v.ok, false);
  assert.equal(v.errors.length, 3);
  assert.match(v.errors[0].reason, /계량 값이라 이 화면에서 정정할 수 없습니다/);
  assert.match(v.errors[1].reason, /숫자가 아닙니다/);
  assert.match(v.errors[2].reason, /이 보증서에 없습니다/);
});

test('validateCorrections: 연신율 규정이 없는 강종(SGLC570)은 EL 정정 불가', () => {
  const d = R.buildCertDoc(noEl());
  assert.equal(d.spec.el, null);
  const v = R.validateCorrections(d, [{ coil: d.coils[0].no, field: 'el', to: 25 }]);
  assert.equal(v.ok, false);
  assert.match(v.errors[0].reason, /연신율 규정이 없어/);
});

test('validateCorrections: 교차 검증 — TS 는 YP 보다 작을 수 없다 (정정 후 값 기준)', () => {
  const d = R.buildCertDoc(sgc340());
  const c = d.coils[0];
  // TS 를 YP 아래로 (그러나 규격 하한 340 이상으로) 내리는 건 SGC340 에서는 하한 때문에 불가하므로 YP 를 TS 위로 올린다
  const v = R.validateCorrections(d, [{ coil: c.no, field: 'yp', to: c.ts + 10 }]);
  assert.equal(v.ok, false);
  assert.match(v.errors[0].reason, /인장강도는 항복강도보다 작을 수 없습니다/);
  // 둘을 함께 올리면 통과
  const v2 = R.validateCorrections(d, [{ coil: c.no, field: 'yp', to: c.ts + 10 }, { coil: c.no, field: 'ts', to: c.ts + 20 }]);
  assert.equal(v2.ok, true);
});

test('applyCorrection: 현재 버전 회수 + 다음 버전 재발행 + 이력', () => {
  const row = Object.assign({}, issued(), { id: 'QC-2609-0101-v1' });
  const d = R.buildCertDoc(row);
  const c = d.coils[0];
  const res = R.applyCorrection(row, { items: [{ coil: c.no, field: 'ts', to: c.ts + 6 }], reason: '시험기 보정 반영', by: '품질관리자', at: '2026-09-16T14:20' });

  assert.equal(res.recalled.st, '회수');
  assert.equal(res.recalled.ver, 'v1');
  assert.equal(res.recalled.supersededBy, 'v2');
  assert.match(res.recalled.recallReason, /v2 재발행/);

  assert.equal(res.reissued.ver, 'v2');
  assert.equal(res.reissued.st, '재발행');
  assert.equal(res.reissued.id, 'QC-2609-0101-v2');
  assert.equal(res.reissued.date, '2026-09-16');
  assert.equal(res.reissued.firstIssued, '2026-09-02');
  assert.equal(res.reissued.supersedes, 'v1');
  assert.equal(res.reissued.by, '품질관리자');
  assert.equal(res.reissued.corrections.length, 1);
  assert.deepEqual(res.reissued.corrections[0], { coil: c.no, field: 'ts', from: c.ts, to: c.ts + 6, reason: '시험기 보정 반영', by: '품질관리자', at: '2026-09-16T14:20', fromVer: 'v1', toVer: 'v2' });

  assert.deepEqual(res.history, { at: '2026-09-16T14:20', by: '품질관리자', no: 'QC-2609-0101', fromVer: 'v1', toVer: 'v2', reason: '시험기 보정 반영', items: [{ coil: c.no, field: 'ts', from: c.ts, to: c.ts + 6 }] });

  // 재발행본을 그리면 정정값이 들어가고 워터마크는 REISSUE
  const d2 = R.buildCertDoc(res.reissued);
  assert.equal(d2.coils[0].ts, c.ts + 6);
  assert.equal(d2.watermark, 'REISSUE');
  assert.equal(d2.supersedes, 'v1');
  // 회수본을 그리면 원래 값 그대로에 VOID
  const d1 = R.buildCertDoc(res.recalled);
  assert.equal(d1.coils[0].ts, c.ts);
  assert.equal(d1.watermark, 'VOID');
});

test('applyCorrection: 두 번 정정하면 v3 이고 정정 내역이 누적된다', () => {
  const row = Object.assign({}, issued(), { id: 'x' });
  const c = R.buildCertDoc(row).coils[0];
  const r1 = R.applyCorrection(row, { items: [{ coil: c.no, field: 'ts', to: c.ts + 6 }], reason: 'a', by: 'u', at: '2026-09-16T10:00' });
  const r2 = R.applyCorrection(r1.reissued, { items: [{ coil: c.no, field: 'yp', to: c.yp + 3 }], reason: 'b', by: 'u', at: '2026-09-17T10:00' });
  assert.equal(r2.reissued.ver, 'v3');
  assert.equal(r2.recalled.ver, 'v2');
  assert.equal(r2.reissued.corrections.length, 2);
  assert.equal(r2.reissued.firstIssued, '2026-09-02', '최초 발행일은 계속 유지');
  const d3 = R.buildCertDoc(r2.reissued);
  assert.equal(d3.coils[0].ts, c.ts + 6);
  assert.equal(d3.coils[0].yp, c.yp + 3);
});

test('applyCorrection: 초안·회수는 정정 불가, 사유 없음·변경 없음·규격 미달은 예외', () => {
  const c = R.buildCertDoc(issued()).coils[0];
  assert.throws(() => R.applyCorrection(byNo('QC-2609-0102'), { items: [{ coil: c.no, field: 'ts', to: 999 }], reason: 'x' }), /발행·재발행 상태만/);
  assert.throws(() => R.applyCorrection(byNo('QC-2608-0095'), { items: [{ coil: c.no, field: 'ts', to: 999 }], reason: 'x' }), /발행·재발행 상태만/);
  assert.throws(() => R.applyCorrection(issued(), { items: [{ coil: c.no, field: 'ts', to: c.ts + 1 }], reason: '  ' }), /사유는 필수/);
  assert.throws(() => R.applyCorrection(issued(), { items: [{ coil: c.no, field: 'ts', to: c.ts }], reason: 'x' }), /변경된 값이 없습니다/);
  assert.throws(() => R.applyCorrection(issued(), { items: [{ coil: c.no, field: 'ts', to: 1 }], reason: 'x' }), /규격 미달/);
});

test('applyCorrection: 원본 행은 건드리지 않는다 (순수 함수)', () => {
  const row = Object.assign({}, issued(), { id: 'x' });
  const snapshot = JSON.stringify(row);
  const c = R.buildCertDoc(row).coils[0];
  R.applyCorrection(row, { items: [{ coil: c.no, field: 'ts', to: c.ts + 6 }], reason: 'a', by: 'u', at: 't' });
  assert.equal(JSON.stringify(row), snapshot);
});
