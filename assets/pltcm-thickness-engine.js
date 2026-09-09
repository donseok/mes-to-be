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

  var api = {
    VERSION: VERSION, ERROR_CODES: ERROR_CODES, WARNING_CODES: WARNING_CODES, DEFAULT_DEFS: DEFAULT_DEFS,
    matchRules: matchRules, truncate3: truncate3, snapSet: snapSet, round4: round4, applyWidth: applyWidth
  };
  return api;
});
