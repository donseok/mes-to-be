/* assets/shape/shape-model.js — 설계결과 + 주문 → ShapeModel (순수 함수, DOM 없음)
   빌드 시 build/inject_shape.py 가 modules/quality-design.html 마커 구간에 복사한다. */
(function (g) {
  'use strict';

  const ROUTES = {
    rollingThicknessSet: '#/quality-design/module-management/rolling-thickness-set',
    rawMaterialGrade: '#/quality-design/module-management/raw-material-grade',
    lineWidthShrinkage: '#/quality-design/module-management/line-width-shrinkage',
    lineWidthMargin: '#/quality-design/module-management/line-width-margin',
    processRouting: '#/quality-design/module-management/process-routing',
    colorBom: '#/quality-design/master-data-management/color-bom',
  };
  const ROUTE_NAMES = {
    [ROUTES.rollingThicknessSet]: '압연두께Set 관리',
    [ROUTES.rawMaterialGrade]: '원자재강종 관리',
    [ROUTES.lineWidthShrinkage]: '폭수축량 관리',
    [ROUTES.lineWidthMargin]: '폭마진량 관리',
    [ROUTES.processRouting]: '공정라우팅 관리',
    [ROUTES.colorBom]: '칼라BOM 관리',
  };
  // 메뉴만 있고 화면이 없는 기준 — 배지에 '준비 중' 표시
  const PENDING_ROUTES = [ROUTES.lineWidthShrinkage, ROUTES.lineWidthMargin, ROUTES.colorBom];

  // 품명 → 층 스택 (스펙 §2.1)
  const STACKS = {
    G: { type: 'GI', coating: 'zinc', paint: false },
    L: { type: 'GL', coating: 'az', paint: false },
    W: { type: 'GLX', coating: 'am', paint: false },
    '3': { type: 'CCGI', coating: 'zinc', paint: true },
    '4': { type: 'CCLI', coating: 'az', paint: true },
  };
  const COATING_LABEL = { zinc: '아연 도금(Zn)', az: '알루미늄·아연 도금(AZ)', am: '아연·알루미늄·마그네슘 도금(AM)' };
  const CIRCLED = ['①', '②', '③', '④', '⑤'];

  // 문자열에서 첫 숫자. 콤마 제거. 없으면 null.
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (v == null) return null;
    const m = String(v).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  // [라벨, 값, …] 배열에서 라벨 완전일치 행의 값. 없거나 빈 값이면 null.
  function findRow(rows, label) {
    if (!Array.isArray(rows)) return null;
    const r = rows.find(x => Array.isArray(x) && x[0] === label);
    if (!r) return null;
    const v = r[1];
    return v == null || v === '' ? null : v;
  }
  function ev(kind, opts) { return Object.assign({ kind, ref: null, route: null, note: null }, opts || {}); }
  function val(key, label, value, unit, formula, evidence) {
    const missing = value == null || value === '';
    return {
      key, label,
      value: missing ? null : value,
      unit: unit || null,
      formula: missing ? null : (formula || null),
      evidence: missing ? ev('missing', { note: '설계값 없음' }) : evidence,
    };
  }
  function layer(id, kind, side, thk_um, label) {
    return { id, kind, side, thk_um: thk_um == null ? null : thk_um, label };
  }
  // route.rows 의 한 행 ['1', '1P - PLTCM', 'HD81…'] → {code:'1P', name:'PLTCM'}
  function proc(row) {
    if (!Array.isArray(row) || row[1] == null) return null;
    const parts = String(row[1]).split(' - ');
    return { code: parts[0].trim(), name: (parts[1] || '').trim() };
  }
  function round3(n) { return Math.round(n * 1000) / 1000; }
  function mmToUm(mm) { return mm == null ? null : Math.round(mm * 1000); }
  function emptyGeometry() { return { thk_mm: null, wid_mm: null, id_mm: null, weight_t: null }; }

  function buildShapeModel(design, order) {
    const d = design || {}, o = order || {};
    const warnings = [];
    const stack = STACKS[o.prd] || null;
    const productType = stack ? stack.type : 'unknown';
    if (!stack) warnings.push('층 정의 없음 · 품명 ' + (o.prd == null || o.prd === '' ? '?' : o.prd));
    const color = d.color || null;
    const hasPaint = !!(stack && stack.paint);
    if (hasPaint && !color) warnings.push('칼라 품명이지만 칼라제조사양이 없어 칼라 장면을 생략');

    const raw = { id: 'raw', title: '원자재', process: null, geometry: emptyGeometry(), layers: [], values: [], changes: [] };
    const rolled = { id: 'rolled', title: '압연', process: null, geometry: emptyGeometry(), layers: [], values: [], changes: [] };
    const coated = { id: 'coated', title: '도금', process: null, geometry: emptyGeometry(), layers: [], values: [], changes: [] };
    const painted = (hasPaint && color)
      ? { id: 'painted', title: '칼라', process: null, geometry: emptyGeometry(), layers: [], values: [], changes: [] }
      : null;
    const product = { id: 'product', title: '제품', process: { code: '—', name: '정전·포장' }, geometry: emptyGeometry(), layers: [], values: [], changes: [] };

    const scenes = [raw, rolled, coated].concat(painted ? [painted] : []).concat([product]);
    scenes.forEach((s, i) => { s.no = i + 1; });

    return {
      order: { no: o.no ?? null, ln: o.ln ?? null, prd: o.prd ?? null, spec: o.spec ?? null, mat: o.mat ?? null },
      productType, scenes, warnings,
    };
  }

  g.MesShape = Object.assign(g.MesShape || {}, {
    buildShapeModel, num, findRow, ROUTES, ROUTE_NAMES, PENDING_ROUTES, STACKS, CIRCLED,
    _internal: { ev, val, layer, proc, round3, mmToUm, COATING_LABEL },
  });
})(globalThis);
