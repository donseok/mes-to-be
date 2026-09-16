import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReport, seedRows } from './helpers.mjs';

const R = await loadReport();
const ROWS = seedRows();
const byNo = no => ROWS.find(r => r.no === no);

test('num / comma / esc: shape-model 과 같은 규약', () => {
  assert.equal(R.num('28,000'), 28000);
  assert.equal(R.num('0.450 × 1490'), 0.45);
  assert.equal(R.num(''), null);
  assert.equal(R.num(null), null);
  assert.equal(R.comma(1234567), '1,234,567');
  assert.equal(R.comma(null), '—');
  assert.equal(R.esc('<b>"a"&</b>'), '&lt;b&gt;&quot;a&quot;&amp;&lt;/b&gt;');
});

test('parseSize / parsePrd: 시드 문자열 분해', () => {
  assert.deepEqual(R.parseSize('0.450 × 1490'), { thk: 0.45, wid: 1490 });
  assert.deepEqual(R.parseSize(''), { thk: null, wid: null });
  assert.deepEqual(R.parsePrd('3 : CCGI · KS3-CGCC'), { code: '3', name: 'CCGI', spec: 'KS3-CGCC' });
  assert.deepEqual(R.parsePrd('L : G/L · KSL-SGLCC'), { code: 'L', name: 'G/L', spec: 'KSL-SGLCC' });
});

test('specFor: 규격약호 → 강종 기준. SGLC570 은 연신율 규정 없음', () => {
  assert.equal(R.specFor('KSG-SGC340').grade, 'SGC340');
  assert.equal(R.specFor('KSG-SGC340').ts, 340);
  assert.equal(R.specFor('KSL-SGLC570').el, null);
  assert.equal(R.specFor('KSL-SGLCC').grade, 'SGLCC');
  assert.equal(R.specFor('KS3-CGCC').grade, 'SGCC');
  assert.equal(R.specFor('알수없음').grade, '일반용');
});

test('coatFor: 품명코드 → 도금 최소 부착량, 모르는 코드는 기본값', () => {
  assert.equal(R.coatFor('G').min, 120);
  assert.equal(R.coatFor('L').code, 'AZ150');
  assert.equal(R.coatFor('Z').min, R.COATS['3'].min);
});

test('splitWeight: 합이 정확히 총중량, 코일별 양수', () => {
  for (const n of [1, 2, 3, 7, 40]) {
    const w = R.splitWeight(28000, n, R.rng('seed-' + n));
    assert.equal(w.length, n);
    assert.equal(w.reduce((a, b) => a + b, 0), 28000, `n=${n} 합계`);
    assert.ok(w.every(v => v > 0), `n=${n} 전부 양수`);
  }
});

test('buildCertDoc: 같은 행은 항상 같은 문서 (Math.random 미사용)', () => {
  const row = byNo('QC-2609-0101');
  const a = R.buildCertDoc(row);
  const b = R.buildCertDoc(row);
  assert.deepEqual(a.coils, b.coils);
  assert.equal(a.fingerprint, b.fingerprint);
});

test('buildCertDoc: 코일 수·총중량이 시드와 일치하고 코일 중량 합이 총중량', () => {
  for (const row of seedRows()) {
    const d = R.buildCertDoc(row);
    assert.equal(d.coilCount, R.num(row.coils), row.no + ' 코일 수');
    assert.equal(d.totalWgt, R.num(row.wgt), row.no + ' 총중량');
    assert.equal(d.coils.reduce((s, c) => s + c.wgt, 0), d.totalWgt, row.no + ' 중량 합');
    assert.equal(d.coils.length, d.coilCount);
  }
});

test('buildCertDoc: 모든 코일이 기준을 만족한다 (보증서에는 합격품만 실린다)', () => {
  for (const row of seedRows()) {
    const d = R.buildCertDoc(row, { coilCount: 12 });
    for (const c of d.coils) {
      assert.ok(c.yp >= d.spec.yp, `${row.no} ${c.no} YP ${c.yp} >= ${d.spec.yp}`);
      assert.ok(c.ts >= d.spec.ts, `${row.no} ${c.no} TS ${c.ts} >= ${d.spec.ts}`);
      assert.ok(c.ts >= c.yp, `${row.no} ${c.no} TS 가 YP 이상`);
      assert.ok(c.coat >= d.coat.min, `${row.no} ${c.no} 도금량`);
      if (d.spec.el == null) assert.equal(c.el, null, `${row.no} 연신율 규정 없음`);
      else assert.ok(c.el >= d.spec.el, `${row.no} ${c.no} EL`);
      assert.equal(c.pass, true);
    }
  }
});

test('buildCertDoc: 코일 수를 바꾸면 코일당 평균 중량을 유지한 채 총중량을 다시 잡는다', () => {
  const row = byNo('QC-2609-0101'); // 3 코일 · 28,000 kg
  const d = R.buildCertDoc(row, { coilCount: 30 });
  assert.equal(d.coilCount, 30);
  assert.equal(d.totalWgt, Math.round((28000 / 3) * 30 / 10) * 10);
  assert.equal(d.coils.reduce((s, c) => s + c.wgt, 0), d.totalWgt);
  assert.notEqual(d.fingerprint, R.buildCertDoc(row).fingerprint, '코일 수가 다르면 지문도 다르다');
});

test('buildCertDoc: 코일 수는 1~200 으로 제한된다', () => {
  const row = byNo('QC-2609-0101');
  assert.equal(R.buildCertDoc(row, { coilCount: 0 }).coilCount, 1);
  assert.equal(R.buildCertDoc(row, { coilCount: -5 }).coilCount, 1);
  assert.equal(R.buildCertDoc(row, { coilCount: 9999 }).coilCount, 200);
});

test('buildCertDoc: 상태별 워터마크. 발행만 워터마크가 없다', () => {
  assert.equal(R.buildCertDoc(byNo('QC-2609-0101')).watermark, null); // 발행
  assert.equal(R.buildCertDoc(byNo('QC-2609-0102')).watermark, 'DRAFT'); // 초안
  assert.equal(R.buildCertDoc(byNo('QC-2608-0098')).watermark, 'REISSUE'); // 재발행
  assert.equal(R.buildCertDoc(byNo('QC-2608-0095')).watermark, 'VOID'); // 회수
});

test('buildCertDoc: 미발행(초안)은 발행일이 null 이고 코일번호는 보증서번호에서 딴다', () => {
  const d = R.buildCertDoc(byNo('QC-2609-0102'));
  assert.equal(d.issued, null);
  assert.match(d.coils[0].no, /^C260901\d{3}$/);
  const issued = R.buildCertDoc(byNo('QC-2609-0101'));
  assert.equal(issued.issued, '2026-09-02');
  assert.match(issued.coils[0].no, /^C260902\d{3}$/);
});

test('buildCertDoc: 코일번호는 연속, 용강번호는 3코일 묶음', () => {
  const d = R.buildCertDoc(byNo('QC-2609-0101'), { coilCount: 7 });
  const seqs = d.coils.map(c => Number(c.no.slice(-3)));
  for (let i = 1; i < seqs.length; i++) assert.equal(seqs[i], seqs[i - 1] + 1);
  assert.equal(d.coils[0].heat, d.coils[2].heat);
  assert.notEqual(d.coils[2].heat, d.coils[3].heat);
});

test('buildCertDoc: 보증 기준 4항목이 강종·도금 기준과 맞는다', () => {
  const d = R.buildCertDoc(byNo('QC-2608-0098')); // SGC340
  assert.deepEqual(d.criteria.map(c => c.sym), ['YP', 'TS', 'EL', 'C/W']);
  assert.equal(d.criteria[1].limit, '340 이상');
  assert.equal(d.criteria[3].limit, d.coat.min + ' 이상');
  const noEl = R.buildCertDoc(byNo('QC-2608-0096')); // SGLC570
  assert.equal(noEl.criteria[2].limit, '규정 없음');
});
