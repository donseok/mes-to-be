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

  // ── 역할·권한 ────────────────────────────────────────────────────────────
  // 필드 등급은 "어떤 절차로" 고치는가, 역할은 "누가" 그 절차를 밟을 수 있는가다. 두 축은 따로 둔다.
  // 목업이라 역할마다 사람 하나를 고정한다 — 실제로는 로그인 계정의 역할이다.
  const ROLES = {
    user: { label: '현업', name: '김현업' },
    qm:   { label: '품질관리자', name: '박품질' },
    dev:  { label: '개발자', name: '이개발' },
  };
  const PERMISSIONS = {
    preview:  ['user', 'qm', 'dev'],
    issue:    ['user', 'qm', 'dev'],
    request:  ['user', 'qm', 'dev'],   // approve 등급 필드의 변경 '요청'
    correct:  ['qm', 'dev'],           // 시험값 정정
    recall:   ['qm', 'dev'],
    approve:  ['qm', 'dev'],           // 변경 요청 승인·반려 (요청자 본인은 불가)
    reset:    ['dev'],
    template: ['dev'],                 // 양식 관리
  };
  function can(role, action) {
    return (PERMISSIONS[action] || []).indexOf(role) >= 0;
  }
  // '품질관리자·개발자' 같은 안내문용
  function rolesFor(action) {
    return (PERMISSIONS[action] || []).map(function (r) { return ROLES[r].label; }).join('·');
  }

  // ── 필드 편집 등급 ───────────────────────────────────────────────────────
  // 보증서의 값은 "누가 고칠 수 있는가"가 아니라 "어떤 절차로 고칠 수 있는가"로 나눈다.
  //   locked  : 원천 시스템 값. 이 화면에서는 어떤 절차로도 못 고친다 (정정은 원천에서)
  //   correct : 정정 절차(사유 필수 → 현재 버전 회수 → 다음 버전 재발행 → 이력)로만 고친다 — 시험값
  //   approve : 고칠 수 있으나 승인이 필요하다 (다음 단계)
  //   free    : 발행 시 담당자가 자유 입력한다 (다음 단계)
  // 등록되지 않은 필드는 locked 로 본다 — 실수로 열리는 쪽보다 실수로 잠기는 쪽이 안전하다.
  const FIELDS = {
    'cert.no':      { edit: 'locked',  label: '보증서번호', src: '발행 시스템' },
    'order':        { edit: 'locked',  label: '주문번호',   src: '주문' },
    'coils[].no':   { edit: 'locked',  label: '코일번호',   src: '생산실적' },
    'coils[].heat': { edit: 'locked',  label: '용강번호',   src: '생산실적' },
    'coils[].thk':  { edit: 'locked',  label: '두께',       src: '생산실적', unit: 'mm' },
    'coils[].wid':  { edit: 'locked',  label: '폭',         src: '생산실적', unit: 'mm' },
    'coils[].wgt':  { edit: 'locked',  label: '중량',       src: '계량',     unit: 'kg' },
    'coils[].yp':   { edit: 'correct', label: '항복강도',   sym: 'YP',  unit: 'MPa' },
    'coils[].ts':   { edit: 'correct', label: '인장강도',   sym: 'TS',  unit: 'MPa' },
    'coils[].el':   { edit: 'correct', label: '연신율',     sym: 'EL',  unit: '%' },
    'coils[].coat': { edit: 'correct', label: '도금부착량', sym: 'C/W', unit: 'g/㎡' },
    'remark':       { edit: 'free',    label: '비고', max: 200,
                      get: function (r) { return r.remark || ''; }, set: function (r, v) { r.remark = v; } },
    // 표기명은 수요가 마스터(cus)를 덮어쓰는 문서상의 표기다. 비어 있으면 마스터 값.
    'customer.displayName': { edit: 'approve', label: '수요가 표기명',
                      get: function (r) { return r.displayName || r.cus || ''; }, set: function (r, v) { r.displayName = v; } },
  };
  // coils[].<k> 중 correct 등급 — 정정 화면의 열 순서이기도 하다
  const TEST_FIELDS = ['yp', 'ts', 'el', 'coat'];
  const FIELD_LABELS = { yp: '항복강도 YP', ts: '인장강도 TS', el: '연신율 EL', coat: '도금부착량 C/W' };

  function fieldGrade(path) {
    return (FIELDS[path] || {}).edit || 'locked';
  }
  function fieldValue(row, path) {
    const f = FIELDS[path];
    return f && f.get ? f.get(row) : undefined;
  }

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

  // 코일 1건의 합격 판정. 정정 뒤에도 같은 식으로 다시 판정한다.
  function judge(c, spec, coat) {
    return c.yp >= spec.yp && c.ts >= spec.ts && (spec.el == null || c.el == null || c.el >= spec.el) && c.coat >= coat.min;
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
    // 시드는 보증서번호만. 버전이 바뀌어도(정정 재발행) 같은 코일 목록에서 출발해야
    // 정정 내역이 그 위에 겹쳐진다. 발행일도 최초 발행일을 써서 코일번호가 흔들리지 않게 한다.
    const rnd = rng(row.no);
    const baseDate = row.firstIssued || row.date;

    const ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(baseDate))
      ? String(baseDate).slice(2).replace(/-/g, '')
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
        pass: true,
      });
      coils[i].pass = judge(coils[i], spec, coat);
    }

    // 정정 오버레이 — row.corrections 는 [{ coil, field, from, to, reason, by, at, fromVer, toVer }].
    // 시간순이므로 같은 코일·항목이 여러 번 정정됐으면 마지막 값이 남는다. 정정된 칸에는
    // corrected 표시를 남겨 출력물에서 ※ 로 드러낸다.
    const corrections = Array.isArray(row.corrections) ? row.corrections : [];
    const changes = Array.isArray(row.changes) ? row.changes : [];
    if (corrections.length) {
      const byCoil = {};
      corrections.forEach(function (c) {
        if (TEST_FIELDS.indexOf(c.field) < 0) return; // correct 등급이 아닌 항목은 무시
        (byCoil[c.coil] = byCoil[c.coil] || {})[c.field] = c;
      });
      coils.forEach(function (c) {
        const cs = byCoil[c.no];
        if (!cs) return;
        c.corrected = {};
        TEST_FIELDS.forEach(function (k) {
          if (!cs[k]) return;
          c.corrected[k] = { from: cs[k].from, to: cs[k].to };
          c[k] = cs[k].to;
        });
        c.pass = judge(c, spec, coat);
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
      firstIssued: row.firstIssued && row.firstIssued !== issued ? String(row.firstIssued) : null,
      supersedes: row.supersedes || null,
      issuer: row.by,
      coils: coils,
      corrections: corrections,
      changes: changes,
      // 출력물에 찍히는 수요가 이름. approve 절차로 바뀌었으면 ※
      customerDisplay: FIELDS['customer.displayName'].get(row),
      customerChanged: changes.some(function (c) { return c.field === 'customer.displayName'; }),
      // 3항 '정정·변경 내역' — 시험값 정정과 필드 변경을 시간순으로 합친다
      revisions: corrections.map(function (c) {
        return { kind: 'correct', coil: c.coil, label: FIELD_LABELS[c.field] || c.field, from: c.from, to: c.to,
          reason: c.reason, by: c.by, at: c.at, fromVer: c.fromVer, toVer: c.toVer };
      }).concat(changes.map(function (c) {
        return { kind: 'change', coil: null, label: c.label, from: c.from, to: c.to,
          reason: c.reason, by: '요청 ' + c.requestedBy + ' · 승인 ' + c.approvedBy, at: c.at, fromVer: c.fromVer, toVer: c.toVer };
      })).sort(function (a, b) { return String(a.at) < String(b.at) ? -1 : String(a.at) > String(b.at) ? 1 : 0; }),
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

  // ── 시험값 정정 ──────────────────────────────────────────────────────────
  // items: [{ coil, field, to }]. 현재 값과 같은 항목은 '변경 없음'으로 걸러낸다(오류가 아니다).
  // 반환: { ok, changed: [{coil, field, from, to}], errors: [{coil, field, to, reason}] }
  //
  // 규격 미달 값은 여기서 막는다. 불합격 코일은 보증서에 실을 수 없으므로, 그런 경우는
  // 값을 고치는 문제가 아니라 코일을 빼고 재발행하는 별도 절차다.
  function validateCorrections(doc, items) {
    const changed = [];
    const errors = [];
    const pending = {}; // coil → { field: to } 교차 검증용
    (items || []).forEach(function (it) {
      const path = 'coils[].' + it.field;
      const coil = doc.coils.find(function (c) { return c.no === it.coil; });
      if (!coil) { errors.push({ coil: it.coil, field: it.field, to: it.to, reason: '코일 ' + it.coil + ' 이(가) 이 보증서에 없습니다' }); return; }
      const grade = fieldGrade(path);
      if (grade !== 'correct') {
        const f = FIELDS[path] || {};
        errors.push({ coil: it.coil, field: it.field, to: it.to,
          reason: (f.label || it.field) + ' 은(는) ' + (grade === 'locked' ? (f.src ? f.src + ' 값이라 ' : '') + '이 화면에서 정정할 수 없습니다' : '정정 절차 대상이 아닙니다') });
        return;
      }
      const f = FIELDS[path];
      const v = num(it.to);
      if (v == null) { errors.push({ coil: it.coil, field: it.field, to: it.to, reason: f.sym + ' 값이 숫자가 아닙니다' }); return; }
      if (it.field === 'el' && doc.spec.el == null) { errors.push({ coil: it.coil, field: it.field, to: it.to, reason: '강종 ' + doc.spec.grade + ' 은 연신율 규정이 없어 보증 항목이 아닙니다' }); return; }
      if (v === coil[it.field]) return; // 변경 없음
      const min = it.field === 'coat' ? doc.coat.min : doc.spec[it.field];
      if (v < min) { errors.push({ coil: it.coil, field: it.field, to: v, reason: f.sym + ' ' + v + ' < 기준 ' + min + ' — 규격 미달 값은 보증서에 실을 수 없습니다 (코일 제외 후 재발행은 별도 절차)' }); return; }
      (pending[it.coil] = pending[it.coil] || {})[it.field] = v;
      changed.push({ coil: it.coil, field: it.field, from: coil[it.field], to: v });
    });
    // 교차 검증: 인장강도는 항복강도보다 작을 수 없다
    Object.keys(pending).forEach(function (no) {
      const coil = doc.coils.find(function (c) { return c.no === no; });
      const yp = pending[no].yp != null ? pending[no].yp : coil.yp;
      const ts = pending[no].ts != null ? pending[no].ts : coil.ts;
      if (ts < yp) {
        const field = pending[no].ts != null ? 'ts' : 'yp';
        errors.push({ coil: no, field: field, to: pending[no][field], reason: 'TS ' + ts + ' < YP ' + yp + ' — 인장강도는 항복강도보다 작을 수 없습니다' });
      }
    });
    return { ok: errors.length === 0 && changed.length > 0, changed: changed, errors: errors };
  }

  // 정정 적용 — 순수 함수. 저장은 호출자가 한다.
  // 현재 버전은 회수되고(supersededBy), 다음 버전이 재발행된다(supersedes, corrections 누적).
  // req: { items, reason, by, at }  →  { recalled, reissued, history }
  function applyCorrection(row, req) {
    if (!/^(발행|재발행)$/.test(String(row.st))) throw new Error('발행·재발행 상태만 정정할 수 있습니다 (현재: ' + row.st + ')');
    const reason = String(req && req.reason || '').trim();
    if (!reason) throw new Error('정정 사유는 필수입니다');
    const doc = buildCertDoc(row);
    const v = validateCorrections(doc, req.items);
    if (!v.ok) throw new Error(v.errors.length ? v.errors[0].reason : '변경된 값이 없습니다');

    const at = req.at || new Date().toISOString().slice(0, 16);
    const date = String(at).slice(0, 10);
    const by = req.by || '품질관리자';
    const nextVer = 'v' + ((num(row.ver) || 1) + 1);
    const entries = v.changed.map(function (c) {
      return { coil: c.coil, field: c.field, from: c.from, to: c.to, reason: reason, by: by, at: at, fromVer: row.ver, toVer: nextVer };
    });
    const reissued = Object.assign({}, row, {
      id: row.no + '-' + nextVer,
      ver: nextVer,
      st: '재발행',
      date: date,
      by: by,
      firstIssued: row.firstIssued || row.date,
      supersedes: row.ver,
      supersededBy: null,
      corrections: (row.corrections || []).concat(entries),
    });
    const recalled = Object.assign({}, row, {
      st: '회수',
      supersededBy: nextVer,
      recallReason: '시험값 정정 → ' + nextVer + ' 재발행',
    });
    const history = { kind: 'correct', at: at, by: by, no: row.no, fromVer: row.ver, toVer: nextVer, reason: reason, items: v.changed };
    return { recalled: recalled, reissued: reissued, history: history };
  }

  // ── approve 등급 필드 변경: 요청 → 승인/반려 ─────────────────────────────
  // 요청은 누구나 낼 수 있지만 문서는 승인 전까지 그대로다. 승인되면 시험값 정정과 같은
  // 메커니즘으로 현재 버전을 회수하고 다음 버전을 재발행한다 — 발행된 문서가 바뀌면 언제나 새 버전이다.
  // req: { field, to, reason, by, role, at }  →  요청 객체(status '대기'). id 는 저장소가 붙인다.
  function requestFieldChange(row, req) {
    const path = String(req && req.field || '');
    const f = FIELDS[path];
    const grade = fieldGrade(path);
    if (grade !== 'approve') throw new Error(((f && f.label) || path) + ' 은(는) 승인 절차 대상이 아닙니다 (등급: ' + grade + ')');
    if (!can(req.role, 'request')) throw new Error('변경 요청은 ' + rolesFor('request') + ' 권한입니다');
    if (!/^(발행|재발행)$/.test(String(row.st))) throw new Error('발행·재발행 상태만 변경 요청할 수 있습니다 (현재: ' + row.st + ')');
    if (row.pending) throw new Error('승인 대기 중인 요청이 이미 있습니다: ' + row.pending);
    const from = String(f.get(row));
    const to = String(req.to == null ? '' : req.to).trim();
    if (!to) throw new Error('새 ' + f.label + ' 을(를) 입력하세요');
    if (to === from) throw new Error('현재 값과 같습니다');
    const reason = String(req.reason || '').trim();
    if (!reason) throw new Error('사유는 필수입니다');
    return { rowId: row.id, no: row.no, ver: row.ver, field: path, label: f.label, from: from, to: to,
      reason: reason, by: req.by, role: req.role, at: req.at || new Date().toISOString().slice(0, 16), status: '대기' };
  }

  function assertApprover(request, appr) {
    if (!can(appr && appr.role, 'approve')) throw new Error('승인·반려는 ' + rolesFor('approve') + ' 권한입니다');
    if (appr.by === request.by) throw new Error('요청자 본인은 승인·반려할 수 없습니다 (요청 ' + request.by + ')');
    if (request.status !== '대기') throw new Error('이미 처리된 요청입니다 (' + request.status + ')');
  }

  // 승인 — 순수 함수. appr: { by, role, at } → { recalled, reissued, history, request }
  function applyFieldChange(row, request, appr) {
    assertApprover(request, appr);
    if (row.id !== request.rowId) throw new Error('요청 대상(' + request.rowId + ')과 다른 행입니다: ' + row.id);
    if (!/^(발행|재발행)$/.test(String(row.st))) throw new Error('발행·재발행 상태만 변경할 수 있습니다 (현재: ' + row.st + ')');
    const f = FIELDS[request.field];
    const at = appr.at || new Date().toISOString().slice(0, 16);
    const nextVer = 'v' + ((num(row.ver) || 1) + 1);
    const entry = { field: request.field, label: f.label, from: request.from, to: request.to, reason: request.reason,
      requestedBy: request.by, approvedBy: appr.by, at: at, fromVer: row.ver, toVer: nextVer };
    const reissued = Object.assign({}, row, {
      id: row.no + '-' + nextVer, ver: nextVer, st: '재발행', date: String(at).slice(0, 10), by: appr.by,
      firstIssued: row.firstIssued || row.date, supersedes: row.ver, supersededBy: null, pending: null,
      changes: (row.changes || []).concat(entry),
    });
    f.set(reissued, request.to);
    const recalled = Object.assign({}, row, { st: '회수', supersededBy: nextVer, pending: null,
      recallReason: f.label + ' 변경 → ' + nextVer + ' 재발행' });
    const history = { kind: 'change', at: at, by: appr.by, no: row.no, fromVer: row.ver, toVer: nextVer,
      reason: request.reason, items: [{ field: request.field, label: f.label, from: request.from, to: request.to, requestedBy: request.by }] };
    const done = Object.assign({}, request, { status: '승인', approvedBy: appr.by, approvedAt: at, toVer: nextVer });
    return { recalled: recalled, reissued: reissued, history: history, request: done };
  }

  // 반려 — 문서는 그대로, 요청만 닫힌다. appr: { by, role, at, reason }
  function rejectFieldChange(request, appr) {
    assertApprover(request, appr);
    const why = String(appr.reason || '').trim();
    if (!why) throw new Error('반려 사유는 필수입니다');
    return Object.assign({}, request, { status: '반려', approvedBy: appr.by, approvedAt: appr.at || new Date().toISOString().slice(0, 16), rejectReason: why });
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
    validateCorrections, applyCorrection, fieldGrade, fieldValue, judge,
    requestFieldChange, applyFieldChange, rejectFieldChange, can, rolesFor,
    esc, num, comma, splitWeight, rng, hash32,
    SPECS, COATS, WATERMARKS, FIELDS, TEST_FIELDS, FIELD_LABELS, ROLES, PERMISSIONS,
  });
})(globalThis);
