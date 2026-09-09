/* PLTCM 압연 SET 두께 계산 엔진 — 스펙 design/specs/2026-09-09-pltcm-thickness-engine-design.md
   AS-IS c10 DbSearchThkSizeData 동작 재현. DOM·localStorage 의존 없음.
   원본은 이 파일 하나이며 modules/simulation.html 의 마커 구간 사본은 build/inject_engine.py 가 만든다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PltcmThicknessEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.0.0';

  var ERROR_CODES = {
    E_INPUT: '주문두께 등 필수 입력 결함',
    E_CRITERIA: '기준표 누락 또는 rules 가 배열이 아님',
    KK82: 'C10B2060 압연 보정기준 없음',
    KK83: 'C10B2060 압연 보정기준 중복',
    KK94: 'PCN·TRK 계열에서 두께구분·관리코드 조합 불일치',
    KK80: 'C10B2190 PLTCM 공차기준 없음',
    KK81: 'C10B2190 PLTCM 공차기준 중복'
  };
  var WARNING_CODES = {
    W_EMPTY_BRANCH: 'AS-IS 계산문 없음 — 압연목표 0',
    W_NO_SP_RULE: 'SP 보정 기준 0건 — 0%로 진행',
    W_MULTI_SP_RULE: 'SP 보정 기준 다건 — 첫 건 적용',
    W_THK_TP_INVALID: '주문두께구분이 1·2·3 외 값',
    W_UNIT_UNKNOWN: '기준 단위가 CRN·PCN·TRK 외 — TRK 계열로 처리',
    W_SLIT_WIDTH_ZERO: '슬리팅 그룹수 > 0 인데 폭 합계 0',
    W_REQUEST_INVALID: '고객요청 값이 수가 아님 — 0으로 처리',
    W_ZERO_SET: 'SET 0 — AS-IS 는 이후 제조표준 조회에서 실패 가능',
    W_EXP_NOTATION: '절삭 시 지수 표기 폴백',
    W_NEGATIVE: '절삭·눈금 입력이 음수',
    W_SPECIAL_57: '품명 5·7 특수 경로 — SET = 주문두께, 출측 0'
  };

  var DEFAULT_DEFS = {
    setCorrection: [
      { key: 'prod',    num: false, src: 'order.PRD_NM_CD' },
      { key: 'org',     num: false, src: 'order.SPC_ORG_CD' },
      { key: 'spec',    num: false, src: 'order.SPC_AVR' },
      { key: 'use',     num: false, src: 'order.ORD_USG_CD' },
      { key: 'cust',    num: false, src: 'order.FNL_CUS_CD' },
      { key: 'thkKind', num: false, src: 'order.ORD_THK_TP' },
      { key: 'thkMng',  num: false, src: 'order.ORD_THK_MNG_CD' },
      { key: 'coat',    num: false, src: 'order.GW_ASG_CD' },
      { key: 'thk',     num: true,  src: 'order.ORD_EXC_THK' },
      { key: 'wid',     num: true,  src: 'derived.applyWidth' }
    ],
    spCorrection: [
      { key: 'prod', num: false, src: 'order.PRD_NM_CD' },
      { key: 'mat',  num: false, src: 'order.MAT_CD' },
      { key: 'spg',  num: false, src: 'order.ORD_SPNL_TP' },
      { key: 'thk',  num: true,  src: 'order.ORD_EXC_THK' },
      { key: 'wid',  num: true,  src: 'derived.applyWidth' }
    ],
    thkTolerance: [
      { key: 'prod',   num: false, src: 'order.PRD_NM_CD' },
      { key: 'setThk', num: true,  src: 'derived.setThk' },
      { key: 'wid',    num: true,  src: 'derived.applyWidth' }
    ]
  };

  /* ── 헬퍼 ── */
  function norm(s) { return String(s == null ? '' : s).trim().toUpperCase(); }
  function codeStr(s) { return String(s == null ? '' : s).trim(); }
  function listOf(v) { return String(v == null ? '' : v).split(',').map(norm).filter(Boolean); }
  function toNum(v) { var n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : NaN; }
  function getPath(obj, path) {
    var cur = obj, parts = String(path || '').split('.');
    for (var i = 0; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function pushWarn(out, code) { if (out && out.warnings && out.warnings.indexOf(code) < 0) out.warnings.push(code); }

  /* ── 조건 평가 (압연두께Set보정관리 evalText·evalNum 과 동일 의미) ── */
  function evalText(c, inputVal) {
    var op = c.op || 'NOT_CHECK', a = norm(c.v1), b = norm(inputVal);
    if (op === 'NOT_CHECK') return true;
    if (op === 'NOT_NULL') return b !== '';
    if (op === 'IS_NULL') return b === '';
    if (b === '') return false;
    switch (op) {
      case '=': return a === b;
      case '!=': return a !== b;
      case 'IN': return listOf(c.v1).indexOf(b) >= 0;
      case 'NOT_IN': return listOf(c.v1).indexOf(b) < 0;
      case 'LIKE1': return a !== '' && b.indexOf(a) >= 0;
      case 'LIKE2': return a !== '' && b.slice(-a.length) === a;
      case 'LIKE3': return a !== '' && b.indexOf(a) === 0;
    }
    return false;
  }
  function evalNum(c, inputVal) {
    var op = c.op || 'NOT_CHECK';
    if (op === 'NOT_CHECK') return true;
    var s = inputVal == null ? '' : String(inputVal).trim();
    var x = parseFloat(s);
    if (s === '' || isNaN(x)) return false;
    var a = parseFloat(c.v1), b = parseFloat(c.v2);
    switch (op) {
      case '=': return x === a; case '!=': return x !== a;
      case '>': return x > a; case '>=': return x >= a; case '<': return x < a; case '<=': return x <= a;
      case 'BETWEEN1': return a <= x && x <= b; case 'BETWEEN2': return a <= x && x < b;
      case 'BETWEEN3': return a < x && x <= b; case 'BETWEEN4': return a < x && x < b;
    }
    return false;
  }

  /* ── 매처 ── */
  function matchRules(table, input, derived, defaultDefs) {
    var defs = (table && table.defs != null) ? table.defs : (defaultDefs || []);
    var rules = (table && Array.isArray(table.rules)) ? table.rules : [];
    var ctx = { order: (input && input.order) || {}, request: (input && input.request) || {},
                layers: (input && input.layers) || {}, derived: derived || {} };
    var subject = {};
    for (var d = 0; d < defs.length; d++) subject[defs[d].key] = getPath(ctx, defs[d].src);
    var hits = [];
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (!r || norm(r.status) !== 'Y') continue;
      var cond = r.cond || {}, ok = true;
      for (var k = 0; k < defs.length && ok; k++) {
        var df = defs[k], c = cond[df.key] || { op: 'NOT_CHECK' };
        ok = df.num ? evalNum(c, subject[df.key]) : evalText(c, subject[df.key]);
      }
      if (ok) hits.push({ rule: r, idx: i });
    }
    hits.sort(function (a, b) {
      var na = toNum(a.rule.no), nb = toNum(b.rule.no);
      if (isNaN(na)) na = Infinity; if (isNaN(nb)) nb = Infinity;
      if (na !== nb) return na < nb ? -1 : 1;
      var ia = String(a.rule.id == null ? '' : a.rule.id), ib = String(b.rule.id == null ? '' : b.rule.id);
      if (ia !== ib) return ia < ib ? -1 : 1;
      return a.idx - b.idx;
    });
    return hits.map(function (h) { return h.rule; });
  }

  /* ── 자리수 유틸 ── */
  function truncate3(x, out) {
    var n = toNum(x);
    if (isNaN(n)) return NaN;
    var s = String(n);
    if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) { s = n.toFixed(12); pushWarn(out, 'W_EXP_NOTATION'); }
    var neg = s.charAt(0) === '-';
    if (neg) { s = s.slice(1); pushWarn(out, 'W_NEGATIVE'); }
    var i = s.indexOf('.');
    if (i >= 0) s = s.slice(0, i + 4);
    var v = Number(s);
    if (v === 0) return 0;
    return neg ? -v : v;
  }
  function snapSet(x3, out) {
    var n = toNum(x3);
    if (isNaN(n)) return NaN;
    var neg = n < 0;
    if (neg) pushWarn(out, 'W_NEGATIVE');
    var u = Math.round(Math.abs(n) * 1000), d = u % 10;
    if (d === 1 || d === 2) u = u - d;
    else if (d === 3 || d === 4 || d === 6 || d === 7) u = u - d + 5;
    else if (d === 8 || d === 9) u = u - d + 10;
    var v = u / 1000;
    if (v === 0) return 0;
    return neg ? -v : v;
  }
  function round4(x) { return Math.round(toNum(x) * 10000) / 10000; }
  function applyWidth(o, out) {
    o = o || {};
    var grp = toNum(o.ORD_SLIT_GRP_CNT); if (isNaN(grp)) grp = 0;
    if (grp > 0) {
      var arr = Array.isArray(o.ORD_MIX_WTH) ? o.ORD_MIX_WTH : [], sum = 0;
      for (var i = 0; i < arr.length; i++) { var w = toNum(arr[i]); if (!isNaN(w)) sum += w; }
      if (sum === 0) pushWarn(out, 'W_SLIT_WIDTH_ZERO');
      return sum;
    }
    var ew = toNum(o.ORD_EXC_WTH);
    return isNaN(ew) ? 0 : ew;
  }

  /* ── 입력 정규화 (스펙 2.2) ── */
  var CODE_KEYS = ['PRD_NM_CD', 'SPC_ORG_CD', 'SPC_AVR', 'ORD_USG_CD', 'FNL_CUS_CD', 'ORD_THK_TP',
                   'ORD_THK_MNG_CD', 'GW_ASG_CD', 'MAT_CD', 'ORD_SPNL_TP'];
  function normalizeInput(input) {
    var src = input || {}, o = src.order || {}, rq = src.request || {}, ly = src.layers || {};
    var order = {};
    for (var i = 0; i < CODE_KEYS.length; i++) order[CODE_KEYS[i]] = codeStr(o[CODE_KEYS[i]]);
    order.ORD_EXC_THK = toNum(o.ORD_EXC_THK);
    order.ORD_EXC_WTH = toNum(o.ORD_EXC_WTH);
    order.ORD_SLIT_GRP_CNT = toNum(o.ORD_SLIT_GRP_CNT);
    order.ORD_MIX_WTH = Array.isArray(o.ORD_MIX_WTH) ? o.ORD_MIX_WTH.map(toNum) : [];
    var rawReq = rq.value, reqInvalid = false, reqVal = 0;
    if (!(rawReq == null || String(rawReq).trim() === '')) {
      var pv = toNum(rawReq);
      if (isNaN(pv)) reqInvalid = true; else reqVal = pv;
    }
    function um(v) { var n = toNum(v); return isNaN(n) ? 0 : n; }
    return {
      order: order,
      request: { value: reqVal, unit: norm(rq.unit) },
      layers: { galThkUm: um(ly.galThkUm), paintFrontUm: um(ly.paintFrontUm), paintBackUm: um(ly.paintBackUm) },
      requestInvalid: reqInvalid
    };
  }
  function projSet(r) { return { id: r.id == null ? '' : String(r.id), no: r.no, adj: toNum(r.adj), unit: norm(r.unit) }; }

  /* ── 본 계산 (스펙 3장) ── */
  function design(input, criteria) {
    var res = {
      ok: false, error: null, path: null,
      values: { ORD_EXC_THK: null, CRM_THK: null, PLTCM_THK_TRV: null, PLTCM_SET_THK_TRV: null, PLTCM_THK_LLV: null, PLTCM_THK_ULV: null },
      applied: { applyWidth: null, setRule: null, spRule: null, spRate: 0, tolRule: null },
      steps: [], warnings: []
    };
    var sink = { warnings: [] };
    function warn(code) {
      for (var i = 0; i < res.warnings.length; i++) if (res.warnings[i].code === code) return;
      res.warnings.push({ code: code, message: WARNING_CODES[code] || code });
    }
    function flush() { for (var i = 0; i < sink.warnings.length; i++) warn(sink.warnings[i]); sink.warnings.length = 0; }
    function fail(code, stage, stepNo) { res.error = { code: code, stage: stage, stepNo: stepNo, message: ERROR_CODES[code] || code }; return res; }
    function step(no, name, formula, inputs, output, note) {
      res.steps.push({ no: no, name: name, formula: formula, inputs: inputs || {}, output: output === undefined ? null : output, note: note || '' });
    }

    /* 검증 — 기준 → 입력 (스펙 3.1) */
    var crit = criteria || {}, tables = ['setCorrection', 'spCorrection', 'thkTolerance'];
    for (var ti = 0; ti < tables.length; ti++) {
      var tb = crit[tables[ti]];
      if (!tb || !Array.isArray(tb.rules)) return fail('E_CRITERIA', '입력 검증', 0);
    }
    var inp = normalizeInput(input), o = inp.order, t = o.ORD_EXC_THK;
    if (!(t > 0)) return fail('E_INPUT', '입력 검증', 0);
    res.values.ORD_EXC_THK = t;
    if (inp.requestInvalid) warn('W_REQUEST_INVALID');

    /* ① 단위 변환 */
    var g = inp.layers.galThkUm / 1000, pf = inp.layers.paintFrontUm / 1000, pb = inp.layers.paintBackUm / 1000;
    step(1, '단위 변환', 'g = galThkUm / 1000 · pf = paintFrontUm / 1000 · pb = paintBackUm / 1000',
         { galThkUm: inp.layers.galThkUm, paintFrontUm: inp.layers.paintFrontUm, paintBackUm: inp.layers.paintBackUm }, { g: g, pf: pf, pb: pb });

    /* ② 적용폭 */
    var derived = {};
    var aw = applyWidth(o, sink); flush();
    res.applied.applyWidth = aw; derived.applyWidth = aw;
    step(2, '적용폭', o.ORD_SLIT_GRP_CNT > 0 ? 'ORD_MIX_WTH 합계 (슬리팅)' : 'ORD_EXC_WTH (주문폭)',
         { ORD_SLIT_GRP_CNT: o.ORD_SLIT_GRP_CNT, ORD_MIX_WTH: o.ORD_MIX_WTH, ORD_EXC_WTH: o.ORD_EXC_WTH }, aw);

    /* ③ 경로 선택 */
    var special = (o.PRD_NM_CD === '5' || o.PRD_NM_CD === '7');
    var path = special ? 'SPECIAL_57' : (inp.request.value === 0 && o.ORD_THK_TP !== '3') ? 'STANDARD' : 'CUSTOMER';
    res.path = path;
    step(3, '경로 선택', '품명 5·7 → SPECIAL_57 / 요청값 0 이고 두께구분 ≠ 3 → STANDARD / 그 외 CUSTOMER',
         { PRD_NM_CD: o.PRD_NM_CD, requestValue: inp.request.value, requestUnit: inp.request.unit, ORD_THK_TP: o.ORD_THK_TP }, path);
    if (o.ORD_THK_TP !== '1' && o.ORD_THK_TP !== '2' && o.ORD_THK_TP !== '3') warn('W_THK_TP_INVALID');

    var crm = null, spForcedZero = false;
    if (path === 'SPECIAL_57') {
      warn('W_SPECIAL_57');
      step(4, '기준 조회', '생략 (품명 5·7)', {}, null, '생략');
      step(5, '압연목표', '생략 (품명 5·7)', {}, null, '생략');
      step(6, 'SP 조회·적용', '생략 (품명 5·7)', {}, null, '생략');
      step(7, '절삭', '생략 (품명 5·7)', {}, null, '생략');
      res.values.PLTCM_THK_TRV = 0;
      res.values.PLTCM_SET_THK_TRV = t;
      step(8, 'SET 눈금', 'SET = 주문두께 (0.005 눈금 없음)', { t: t }, t);
    } else {
      if (path === 'STANDARD') {
        /* ④ C10B2060 */
        var hits = matchRules(crit.setCorrection, inp, derived, DEFAULT_DEFS.setCorrection);
        var cands = hits.map(projSet);
        if (hits.length === 0) { step(4, '기준 조회', 'C10B2060 조회', { hits: 0 }, 0); return fail('KK82', '기준 조회', 4); }
        if (hits.length > 1) {
          res.applied.setRule = { id: null, no: null, adj: null, unit: null, candidates: cands };
          step(4, '기준 조회', 'C10B2060 조회', { hits: hits.length }, cands); return fail('KK83', '기준 조회', 4);
        }
        var sr = cands[0], c = sr.adj, unit = sr.unit;
        res.applied.setRule = { id: sr.id, no: sr.no, adj: c, unit: unit, candidates: cands };
        step(4, '기준 조회', 'C10B2060 조회 1건', { hits: 1 }, sr);
        /* ⑤ 압연목표 (부록 A.1) */
        var kind = o.ORD_THK_TP === '2' ? '2' : '1', mng = o.ORD_THK_MNG_CD;
        var fam = unit === 'CRN' ? 'CRN' : unit === 'PCN' ? 'PCN' : 'TRK';
        if (fam === 'TRK' && unit !== 'TRK') warn('W_UNIT_UNKNOWN');
        var formula = '', val = null, empty = false, mismatch = false;
        if (fam === 'CRN') {
          if (kind === '2') { if (mng === '5') { formula = 't (round4)'; val = round4(t); } else { formula = 't − g + c (round4)'; val = round4(t - g + c); } }
          else { if (mng === '6') { formula = 't − g'; val = t - g; } else { formula = 't + c'; val = t + c; } }
        } else if (fam === 'PCN') {
          if (kind === '2') { if (mng === '6') mismatch = true; else if (mng === '5') empty = true; else { formula = 't − g + t × c / 100'; val = t - g + t * c / 100; } }
          else { if (mng === '5') mismatch = true; else if (mng === '6') empty = true; else { formula = 't + t × c / 100'; val = t + t * c / 100; } }
        } else {
          spForcedZero = true;
          if (kind === '2') { if (mng === '6') mismatch = true; else if (mng === '5') empty = true; else { formula = 'c − g'; val = c - g; } }
          else { if (mng === '5') mismatch = true; else if (mng === '6') empty = true; else { formula = 'c'; val = c; } }
        }
        if (mismatch) { step(5, '압연목표', '두께구분·관리코드 조합 불일치 (' + fam + '·' + kind + '·' + mng + ')', { t: t, g: g, c: c }, null); return fail('KK94', '압연목표', 5); }
        if (empty) { val = 0; formula = '(AS-IS 계산문 없음) 0'; warn('W_EMPTY_BRANCH'); }
        crm = val;
        step(5, '압연목표', formula, { t: t, g: g, c: c, unit: unit, kind: kind, mng: mng }, crm);
      } else {
        /* CUSTOMER (스펙 3.4) */
        step(4, '기준 조회', '생략 (고객사양 경로)', {}, null, '생략');
        var b = (o.ORD_THK_TP === '3') ? (t - pf - pb - g) : t;
        var rv = inp.request.value, ru = inp.request.unit, cf;
        if (ru === 'CRN') { cf = 'b + r'; crm = b + rv; }
        else if (ru === 'PCN') { cf = 'b + b × r / 100'; crm = b + b * rv / 100; }
        else if (ru === 'TRK') { cf = 'r'; crm = rv; }
        else { cf = 'b'; crm = b; }
        step(5, '압연목표', (o.ORD_THK_TP === '3' ? 'b = t − pf − pb − g · ' : 'b = t · ') + cf, { t: t, g: g, pf: pf, pb: pb, b: b, r: rv, unit: ru }, crm);
      }
      res.values.CRM_THK = crm; derived.crmThk = crm;

      /* ⑥ SP (스펙 3.5) */
      var spHits = matchRules(crit.spCorrection, inp, derived, DEFAULT_DEFS.spCorrection), sp = 0;
      if (spHits.length === 0) warn('W_NO_SP_RULE');
      else {
        if (spHits.length > 1) warn('W_MULTI_SP_RULE');
        var s0 = spHits[0], rate = toNum(s0.rate);
        res.applied.spRule = { id: s0.id == null ? '' : String(s0.id), no: s0.no, rate: rate };
        sp = isNaN(rate) ? 0 : rate;
      }
      if (spForcedZero) sp = 0;
      var outCalc, spf;
      if (inp.request.unit === 'TRK') { sp = 0; outCalc = crm; spf = 'crm (고객 단위 TRK → SP 생략)'; }
      else { outCalc = crm + crm * sp / 100; spf = 'crm + crm × sp / 100'; }
      res.applied.spRate = sp;
      step(6, 'SP 조회·적용', spf, { crm: crm, sp: sp, hits: spHits.length, forcedZero: spForcedZero }, outCalc);

      /* ⑦ 절삭 · ⑧ SET (스펙 3.6) */
      var thk = truncate3(outCalc, sink); flush();
      res.values.PLTCM_THK_TRV = thk;
      step(7, '절삭', 'truncate3(출측 계산값)', { x: outCalc }, thk);
      var set = snapSet(thk, sink); flush();
      res.values.PLTCM_SET_THK_TRV = set;
      step(8, 'SET 눈금', 'snapSet(출측두께)', { x3: thk }, set);
    }
    if (res.values.PLTCM_SET_THK_TRV === 0) warn('W_ZERO_SET');

    /* ⑨ 공차 (스펙 3.7) */
    derived.setThk = res.values.PLTCM_SET_THK_TRV;
    var tolHits = matchRules(crit.thkTolerance, inp, derived, DEFAULT_DEFS.thkTolerance);
    if (tolHits.length === 0) { step(9, '공차', 'C10B2190 조회', { setThk: derived.setThk, hits: 0 }, 0); return fail('KK80', '공차', 9); }
    if (tolHits.length > 1) { step(9, '공차', 'C10B2190 조회', { setThk: derived.setThk, hits: tolHits.length }, null); return fail('KK81', '공차', 9); }
    var tr = tolHits[0], llv = toNum(tr.llv), ulv = toNum(tr.ulv), setv = res.values.PLTCM_SET_THK_TRV;
    res.applied.tolRule = { id: tr.id == null ? '' : String(tr.id), no: tr.no, llv: llv, ulv: ulv };
    res.values.PLTCM_THK_LLV = truncate3(setv + llv, sink);
    res.values.PLTCM_THK_ULV = truncate3(setv + ulv, sink); flush();
    step(9, '공차', 'LLV = truncate3(SET + llv) · ULV = truncate3(SET + ulv)', { set: setv, llv: llv, ulv: ulv },
         { LLV: res.values.PLTCM_THK_LLV, ULV: res.values.PLTCM_THK_ULV });
    res.ok = true;
    return res;
  }

  var api = {
    VERSION: VERSION, ERROR_CODES: ERROR_CODES, WARNING_CODES: WARNING_CODES, DEFAULT_DEFS: DEFAULT_DEFS,
    design: design, matchRules: matchRules, truncate3: truncate3, snapSet: snapSet, round4: round4, applyWidth: applyWidth
  };
  return api;
});
