import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReport, seedRows } from './helpers.mjs';

const R = await loadReport();
const ROWS = seedRows();
const issued = () => Object.assign({}, ROWS.find(r => r.no === 'QC-2609-0101'), { id: 'QC-2609-0101-v1' }); // 발행
const USER = { by: '김현업', role: 'user', at: '2026-09-16T10:00' };
const QM = { by: '박품질', role: 'qm', at: '2026-09-16T11:00' };
const DEV = { by: '이개발', role: 'dev', at: '2026-09-16T12:00' };
const req = (row, over = {}) => R.requestFieldChange(row, Object.assign({ field: 'customer.displayName', to: '수요가 A 주식회사 부산공장', reason: '수요가 요청' }, USER, over));

test('역할·권한: 정정·회수·승인은 품질관리자+, 초기화·양식은 개발자만, 미리보기·발행·요청은 전원', () => {
  assert.deepEqual(Object.keys(R.ROLES), ['user', 'qm', 'dev']);
  for (const a of ['preview', 'issue', 'request']) for (const r of ['user', 'qm', 'dev']) assert.equal(R.can(r, a), true, `${r} ${a}`);
  for (const a of ['correct', 'recall', 'approve']) { assert.equal(R.can('user', a), false, a); assert.equal(R.can('qm', a), true, a); assert.equal(R.can('dev', a), true, a); }
  for (const a of ['reset', 'template']) { assert.equal(R.can('user', a), false); assert.equal(R.can('qm', a), false); assert.equal(R.can('dev', a), true); }
  assert.equal(R.can('dev', '없는동작'), false, '모르는 동작은 아무도 못 한다');
  assert.equal(R.can(undefined, 'preview'), false);
  assert.equal(R.rolesFor('approve'), '품질관리자·개발자');
  assert.equal(R.rolesFor('reset'), '개발자');
});

test('FIELDS 접근자: 표기명은 마스터(cus)를 덮어쓰고 비어 있으면 마스터 값', () => {
  const f = R.FIELDS['customer.displayName'];
  const row = issued();
  assert.equal(f.get(row), '수요가 A');
  assert.equal(R.fieldValue(row, 'customer.displayName'), '수요가 A');
  f.set(row, '수요가 A 부산');
  assert.equal(f.get(row), '수요가 A 부산');
  assert.equal(row.cus, '수요가 A', '마스터는 그대로');
  assert.equal(R.fieldValue(row, 'coils[].ts'), undefined, '접근자 없는 필드');
});

test('requestFieldChange: 정상 요청은 대기 상태, 문서는 아직 그대로', () => {
  const row = issued();
  const q = req(row);
  assert.deepEqual(q, { rowId: 'QC-2609-0101-v1', no: 'QC-2609-0101', ver: 'v1', field: 'customer.displayName', label: '수요가 표기명',
    from: '수요가 A', to: '수요가 A 주식회사 부산공장', reason: '수요가 요청', by: '김현업', role: 'user', at: '2026-09-16T10:00', status: '대기' });
  assert.equal(R.buildCertDoc(row).customerDisplay, '수요가 A', '요청만으로는 바뀌지 않는다');
  assert.equal(req(row, { to: '  수요가 B  ' }).to, '수요가 B', '앞뒤 공백 정리');
});

test('requestFieldChange: approve 등급이 아닌 필드는 승인 절차 대상이 아니다', () => {
  assert.throws(() => req(issued(), { field: 'coils[].ts' }), /승인 절차 대상이 아닙니다 \(등급: correct\)/);
  assert.throws(() => req(issued(), { field: 'coils[].wgt' }), /등급: locked/);
  assert.throws(() => req(issued(), { field: '없는.필드' }), /등급: locked/);
});

test('requestFieldChange: 상태·중복·빈값·동일값·사유 검증', () => {
  assert.throws(() => req(Object.assign(issued(), { st: '초안' })), /발행·재발행 상태만/);
  assert.throws(() => req(Object.assign(issued(), { st: '회수' })), /발행·재발행 상태만/);
  assert.throws(() => req(Object.assign(issued(), { pending: 'REQ-001' })), /이미 있습니다: REQ-001/);
  assert.throws(() => req(issued(), { to: '   ' }), /입력하세요/);
  assert.throws(() => req(issued(), { to: '수요가 A' }), /현재 값과 같습니다/);
  assert.throws(() => req(issued(), { reason: ' ' }), /사유는 필수/);
  assert.throws(() => req(issued(), { role: 'guest' }), /변경 요청은 .* 권한/);
});

test('applyFieldChange: 승인 → 현재 버전 회수, 다음 버전 재발행에 표기명 반영, 이력·요청 상태 갱신', () => {
  const row = issued();
  const q = req(row);
  const res = R.applyFieldChange(row, q, QM);
  assert.equal(res.recalled.st, '회수');
  assert.equal(res.recalled.supersededBy, 'v2');
  assert.match(res.recalled.recallReason, /수요가 표기명 변경 → v2 재발행/);
  assert.equal(res.recalled.pending, null);

  assert.equal(res.reissued.id, 'QC-2609-0101-v2');
  assert.equal(res.reissued.ver, 'v2');
  assert.equal(res.reissued.st, '재발행');
  assert.equal(res.reissued.by, '박품질');
  assert.equal(res.reissued.date, '2026-09-16');
  assert.equal(res.reissued.firstIssued, '2026-09-02');
  assert.equal(res.reissued.displayName, '수요가 A 주식회사 부산공장');
  assert.equal(res.reissued.cus, '수요가 A', '마스터 수요가는 그대로');
  assert.equal(res.reissued.pending, null);
  assert.deepEqual(res.reissued.changes, [{ field: 'customer.displayName', label: '수요가 표기명', from: '수요가 A', to: '수요가 A 주식회사 부산공장',
    reason: '수요가 요청', requestedBy: '김현업', approvedBy: '박품질', at: '2026-09-16T11:00', fromVer: 'v1', toVer: 'v2' }]);

  assert.equal(res.history.kind, 'change');
  assert.equal(res.history.by, '박품질');
  assert.equal(res.history.items[0].requestedBy, '김현업');
  assert.equal(res.request.status, '승인');
  assert.equal(res.request.approvedBy, '박품질');
  assert.equal(res.request.toVer, 'v2');

  const d = R.buildCertDoc(res.reissued);
  assert.equal(d.customerDisplay, '수요가 A 주식회사 부산공장');
  assert.equal(d.customerChanged, true);
  assert.equal(d.watermark, 'REISSUE');
  assert.equal(d.revisions.length, 1);
  assert.equal(d.revisions[0].kind, 'change');
  assert.equal(d.revisions[0].coil, null);
  assert.equal(d.revisions[0].by, '요청 김현업 · 승인 박품질');
  assert.equal(R.buildCertDoc(res.recalled).customerDisplay, '수요가 A', '회수본은 옛 표기명');
});

test('applyFieldChange: 권한 없음 · 요청자 본인(4-eyes) · 이미 처리 · 다른 행은 예외', () => {
  const row = issued();
  const q = req(row);
  assert.throws(() => R.applyFieldChange(row, q, USER), /승인·반려는 품질관리자·개발자 권한/);
  const qmReq = req(row, QM);
  assert.throws(() => R.applyFieldChange(row, qmReq, QM), /요청자 본인은 승인·반려할 수 없습니다 \(요청 박품질\)/);
  assert.doesNotThrow(() => R.applyFieldChange(row, qmReq, DEV), '다른 관리자는 승인 가능');
  assert.throws(() => R.applyFieldChange(row, Object.assign({}, q, { status: '승인' }), QM), /이미 처리된 요청/);
  assert.throws(() => R.applyFieldChange(Object.assign(issued(), { id: '다른행' }), q, QM), /다른 행입니다/);
  assert.throws(() => R.applyFieldChange(Object.assign(issued(), { st: '회수' }), q, QM), /발행·재발행 상태만/);
});

test('rejectFieldChange: 반려는 문서를 건드리지 않고 요청만 닫는다, 사유 필수, 4-eyes', () => {
  const row = issued();
  const q = req(row);
  const done = R.rejectFieldChange(q, Object.assign({}, QM, { reason: '근거 서류 미비' }));
  assert.equal(done.status, '반려');
  assert.equal(done.approvedBy, '박품질');
  assert.equal(done.rejectReason, '근거 서류 미비');
  assert.equal(R.buildCertDoc(row).customerDisplay, '수요가 A');
  assert.throws(() => R.rejectFieldChange(q, QM), /반려 사유는 필수/);
  assert.throws(() => R.rejectFieldChange(q, Object.assign({}, USER, { reason: 'x' })), /권한/);
  assert.throws(() => R.rejectFieldChange(req(row, QM), Object.assign({}, QM, { reason: 'x' })), /요청자 본인/);
  assert.throws(() => R.rejectFieldChange(done, Object.assign({}, DEV, { reason: 'x' })), /이미 처리된/);
});

test('정정 + 변경이 섞이면 revisions 는 시간순으로 합쳐지고 안내문 파트가 둘 다 잡힌다', () => {
  const row = issued();
  const c = R.buildCertDoc(row).coils[0];
  const r1 = R.applyCorrection(row, { items: [{ coil: c.no, field: 'ts', to: c.ts + 6 }], reason: '시험기 보정', by: '박품질', at: '2026-09-16T09:00' });
  const q = req(r1.reissued, { at: '2026-09-16T10:00' });
  const r2 = R.applyFieldChange(r1.reissued, q, DEV);
  const d = R.buildCertDoc(r2.reissued);
  assert.equal(d.ver, 'v3');
  assert.equal(d.corrections.length, 1);
  assert.equal(d.changes.length, 1);
  assert.deepEqual(d.revisions.map(x => [x.kind, x.at, x.fromVer + '→' + x.toVer]), [['correct', '2026-09-16T09:00', 'v1→v2'], ['change', '2026-09-16T12:00', 'v2→v3']]);
  assert.equal(d.coils[0].ts, c.ts + 6);
  assert.equal(d.customerDisplay, '수요가 A 주식회사 부산공장');
  assert.equal(d.firstIssued, '2026-09-02');
});
