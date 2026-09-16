/* assets/report/report-model.js — 품질보증서 문서 모델 + 페이지 분할 (순수 함수, DOM 없음)
   빌드 시 build/inject_report.py 가 modules/quality-certificate.html 마커 구간에 복사한다.

   0단계 리포트 프로토타입의 데이터 레이어다. 양식은 아직 JSON이 아니라 코드에 고정돼 있고
   (1단계에서 양식 스키마로 분리), 여기서는 "발행 목록 1행 → A4 문서 데이터" 변환만 담당한다. */
(function (g) {
  'use strict';

  // ── 규격 기준 ────────────────────────────────────────────────────────────
  // 규격약호에서 강종을 골라 기계적 성질 하한을 정한다. 목업 값이며 실제 KS 표를 옮긴 것이 아니다.
  // min 만 쓰는 이유: 보증서에 싣는 항목이 모두 '이상' 기준이기 때문이다.
  const SPECS = [
    { re: /SGC340|CGC340/, grade: 'SGC340', yp: 245, ts: 340, el: 20 },
    { re: /SGLC570/, grade: 'SGLC570', yp: 560, ts: 570, el: null },
    { re: /SGLCC|CGLCC/, grade: 'SGLCC', yp: 205, ts: 270, el: 20 },
    { re: /SGCC|CGCC/, grade: 'SGCC', yp: 205, ts: 270, el: 20 },
  ];
  const DEFAULT_SPEC = { grade: '일반용', yp: 205, ts: 270, el: 20 };

  // 품명코드 → 도금 종류·최소 부착량(양면, g/㎡). 주문 도금량코드가 시드에 없어 품명 기본값을 쓴다.
  const COATS = {
    G: { code: 'Z12', min: 120, label: '용융아연도금 (Z12)' },
    L: { code: 'AZ150', min: 150, label: '알루미늄아연도금 (AZ150)' },
    W: { code: 'AM90', min: 90, label: '아연알루미늄마그네슘도금 (AM90)' },
    3: { code: 'Z08', min: 80, label: '칼라원판 용융아연도금 (Z08)' },
    4: { code: 'AZ100', min: 100, label: '칼라원판 알루미늄아연도금 (AZ100)' },
  };
  const DEFAULT_COAT = { code: 'Z08', min: 80, label: '용융아연도금 (Z08)' };

  // 상태 → 워터마크. '발행'만 워터마크가 없다.
  const WATERMARKS = { 초안: 'DRAFT', 재발행: 'REISSUE', 회수: 'VOID' };

  const TEST_METHODS = { yp: 'KS B 0802', ts: 'KS B 0802', el: 'KS B 0802', coat: 'KS D 0201' };

  // ── 작은 유틸 ────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 문자열에서 첫 숫자. 콤마 제거. 없으면 null. (shape-model.num 과 같은 규약)
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (v == null) return null;
    const m = String(v).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }

  function comma(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // '0.450 × 1490' → { thk: 0.45, wid: 1490 }
  function parseSize(s) {
    const parts = String(s == null ? '' : s).split(/[×x]/);
    return { thk: num(parts[0]), wid: num(parts[1]) };
  }

  // '3 : CCGI · KS3-CGCC' → { code: '3', name: 'CCGI', spec: 'KS3-CGCC' }
  function parsePrd(s) {
    const t = String(s == null ? '' : s);
    const head = t.split('·')[0] || '';
    const tail = t.indexOf('·') >= 0 ? t.slice(t.indexOf('·') + 1) : '';
    const bits = head.split(':');
    return {
      code: (bits[0] || '').trim(),
      name: (bits[1] || '').trim(),
      spec: tail.trim(),
    };
  }

  function specFor(specCode) {
    const t = String(specCode == null ? '' : specCode).toUpperCase();
    for (const s of SPECS) if (s.re.test(t)) return { grade: s.grade, yp: s.yp, ts: s.ts, el: s.el };
    return Object.assign({}, DEFAULT_SPEC);
  }

  function coatFor(prdCode) {
    return Object.assign({}, COATS[prdCode] || DEFAULT_COAT);
  }

  // ── 시드 난수 (문자열 → 재현 가능한 난수열) ───────────────────────────────
  // 같은 보증서번호는 언제 열어도 같은 코일 목록이 나와야 한다. 목업이 매번 달라지면
  // 화면 캡처·검토 기록이 서로 어긋나므로 Math.random 은 쓰지 않는다.
  function hash32(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function rng(seed) {
    let a = hash32(seed) || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 총중량을 n개로 쪼갠다. 10kg 단위로 반올림하고 마지막 코일이 잔차를 흡수해 합이 정확히 total.
  function splitWeight(total, n, rnd) {
    if (n <= 0) return [];
    if (n === 1) return [total];
    const f = [];
    let fs = 0;
    for (let i = 0; i < n; i++) {
      const v = 0.85 + rnd() * 0.3;
      f.push(v);
      fs += v;
    }
    const out = [];
    let acc = 0;
    for (let i = 0; i < n - 1; i++) {
      const v = Math.max(10, Math.round((total * f[i]) / fs / 10) * 10);
      out.push(v);
      acc += v;
    }
    out.push(total - acc);
    return out;
  }

  // ── 문서 모델 ────────────────────────────────────────────────────────────
  // row: 발행 목록 1행. opts.coilCount 를 주면 코일 수를 바꾼다(페이지 분할 확인용 목업 조작).
  // 코일 수를 바꾸면 코일당 평균 중량을 유지한 채 총중량을 다시 계산한다.
  function buildCertDoc(row, opts) {
    const o = opts || {};
    const seedCoils = Math.max(1, num(row.coils) || 1);
    const seedWgt = Math.max(0, num(row.wgt) || 0);
    const n = Math.max(1, Math.min(200, o.coilCount == null ? seedCoils : Math.round(o.coilCount)));
    const total = n === seedCoils ? seedWgt : Math.round((seedWgt / seedCoils) * n / 10) * 10;

    const size = parseSize(row.size);
    const prd = parsePrd(row.prd);
    const spec = specFor(prd.spec);
    const coat = coatFor(prd.code);
    const rnd = rng(row.no + '|' + row.ver);

    const ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(row.date))
      ? String(row.date).slice(2).replace(/-/g, '')
      : String(row.no).replace(/\D/g, '').slice(0, 4) + '01';
    const startSeq = 1 + Math.floor(rnd() * 40);
    const weights = splitWeight(total, n, rnd);

    const coils = [];
    for (let i = 0; i < n; i++) {
      const yp = Math.round(spec.yp * (1 + rnd() * 0.22));
      const ts = Math.max(Math.round(spec.ts * (1 + rnd() * 0.18)), Math.round(yp * 1.12));
      const el = spec.el == null ? null : Math.round(spec.el + rnd() * 12);
      const cw = Math.round(coat.min * (1 + rnd() * 0.25));
      const thk = size.thk == null ? null : Math.round((size.thk + (rnd() - 0.5) * 0.008) * 1000) / 1000;
      const wid = size.wid == null ? null : size.wid + Math.round(rnd() * 3);
      coils.push({
        seq: i + 1,
        no: 'C' + ymd + String(startSeq + i).padStart(3, '0'),
        heat: 'H' + ymd.slice(0, 2) + '-' + (8800 + Math.floor(i / 3)),
        thk: thk,
        wid: wid,
        wgt: weights[i],
        yp: yp,
        ts: ts,
        el: el,
        coat: cw,
        pass: yp >= spec.yp && ts >= spec.ts && (el == null || el >= spec.el) && cw >= coat.min,
      });
    }

    const issued = String(row.date) === '—' || !row.date ? null : String(row.date);
    const doc = {
      no: row.no,
      ver: row.ver,
      status: row.st,
      watermark: WATERMARKS[row.st] || null,
      customer: row.cus,
      po: row.po,
      order: row.ord,
      prd: prd,
      spec: spec,
      coat: coat,
      thk: size.thk,
      wid: size.wid,
      coilCount: n,
      totalWgt: total,
      issued: issued,
      issuer: row.by,
      coils: coils,
      criteria: [
        { name: '항복강도', sym: 'YP', unit: 'MPa', limit: spec.yp + ' 이상', method: TEST_METHODS.yp },
        { name: '인장강도', sym: 'TS', unit: 'MPa', limit: spec.ts + ' 이상', method: TEST_METHODS.ts },
        { name: '연신율', sym: 'EL', unit: '%', limit: spec.el == null ? '규정 없음' : spec.el + ' 이상', method: TEST_METHODS.el },
        { name: '도금부착량(양면)', sym: 'C/W', unit: 'g/㎡', limit: coat.min + ' 이상', method: TEST_METHODS.coat },
      ],
    };
    doc.docId = row.no + '-' + row.ver;
    // 발행본 식별용 지문. 0단계에서는 표시만 하고 검증 화면은 없다(2단계).
    doc.fingerprint = hash32(JSON.stringify([doc.docId, doc.totalWgt, coils.map(function (c) { return [c.no, c.yp, c.ts, c.el, c.coat]; })]))
      .toString(16).padStart(8, '0').toUpperCase();
    return doc;
  }

  // ── 페이지 분할 ──────────────────────────────────────────────────────────
  // 측정된 높이만 받는 순수 함수. 실제 DOM 측정은 report-doc.js 가 하고 여기로 넘긴다.
  // blocks: [{ id, kind:'block', h } | { id, kind:'table', headH, footH, rowHs:[…] }]
  // 반환: 페이지 배열. 각 페이지는 조각 배열 [{ id, kind, from, to, last }]
  //
  // 표는 페이지마다 헤더(headH)를 다시 그리고 소계 행(footH) 자리를 남긴다 — 표가 잘려도
  // 각 페이지가 그 자체로 읽히도록 하는 게 성적서의 기본 요구다.
  function paginate(blocks, pageH) {
    const pages = [];
    let cur = [];
    let used = 0;
    function flush() {
      if (cur.length) pages.push(cur);
      cur = [];
      used = 0;
    }
    for (const b of blocks) {
      if (b.kind === 'table') {
        const rowHs = b.rowHs || [];
        if (!rowHs.length) continue;
        let i = 0;
        while (i < rowHs.length) {
          let avail = pageH - used;
          // 헤더 + 1행 + 소계가 안 들어가면 다음 장으로. 빈 페이지에서도 안 들어가면
          // 무한 루프를 막기 위해 넘치더라도 1행은 올린다.
          if (avail < b.headH + rowHs[i] + b.footH && cur.length) {
            flush();
            avail = pageH;
          }
          let h = b.headH;
          let j = i;
          while (j < rowHs.length && h + rowHs[j] + b.footH <= avail) {
            h += rowHs[j];
            j++;
          }
          if (j === i) j = i + 1; // 최소 1행 보장
          cur.push({ id: b.id, kind: 'table', from: i, to: j, last: j >= rowHs.length });
          used += h + b.footH;
          i = j;
          if (i < rowHs.length) flush();
        }
      } else {
        if (b.h > pageH - used && cur.length) flush();
        cur.push({ id: b.id, kind: 'block' });
        used += b.h;
      }
    }
    flush();
    return pages.length ? pages : [[]];
  }

  g.MesReport = Object.assign(g.MesReport || {}, {
    buildCertDoc, paginate, specFor, coatFor, parseSize, parsePrd,
    esc, num, comma, splitWeight, rng, hash32,
    SPECS, COATS, WATERMARKS,
  });
})(globalThis);
