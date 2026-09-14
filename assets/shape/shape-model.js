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

  function buildShapeModel(design, order) {
    const d = design || {}, o = order || {};
    const warnings = [];
    const stack = STACKS[o.prd] || null;
    const productType = stack ? stack.type : 'unknown';
    if (!stack) warnings.push('층 정의 없음 · 품명 ' + (o.prd == null || o.prd === '' ? '?' : o.prd));

    const head = d.head || {}, common = d.common || [], cgl = d.cgl || {}, tol = d.tol || {}, post = d.post || {};
    const lines0 = (Array.isArray(cgl.lines) && cgl.lines[0]) || [];
    const pltcm = cgl.pltcm || [], coat = cgl.coat || {};
    const ops0 = (Array.isArray(cgl.ops) && cgl.ops[0]) || [];
    const rows = (d.route && d.route.rows) || [];
    const color = d.color || null;
    const hasPaint = !!(stack && stack.paint);
    if (hasPaint && !color) warnings.push('칼라 품명이지만 칼라제조사양이 없어 칼라 장면을 생략');
    const orderThk = num(o.thk), orderWid = num(o.wid);
    const thkTp = findRow(common, '주문두께구분');
    const isBmt = typeof thkTp === 'string' && thkTp.trim().startsWith('1');

    // ① 원자재 핫코일
    const rawThk = num(lines0[3]), rawWid = num(lines0[6]);
    const raw = {
      id: 'raw', title: '원자재', process: null,
      geometry: { thk_mm: rawThk, wid_mm: rawWid, id_mm: null, weight_t: null },
      layers: [layer('substrate', 'substrate', 'core', mmToUm(rawThk), '핫코일 ' + (head.mat2 || ''))],
      values: [
        val('rmtl_cd', '원자재 코드', lines0[1], null, null, ev('constant', { route: ROUTES.rawMaterialGrade })),
        val('rmtl_thk', '원자재 두께', rawThk, 'mm', '주문두께 × 4, 0.1 mm 반올림 (목업 고정식)', ev('formula', { note: '기준 미연결 · 정식 엔진 연결 후' })),
        val('rmtl_wid', '원자재 폭', rawWid, 'mm', '주문폭 + 3 (목업 고정식)', ev('formula', { note: '기준 미연결 · 정식 엔진 연결 후' })),
        val('rmtl_pref', '원자재 선호도', lines0[2], null, null, ev('constant')),
      ],
      changes: [],
    };

    // ② 압연 PLTCM
    const setThk = num(findRow(pltcm, 'X-Ray Set두께값'));
    const trimWid = num(findRow(pltcm, 'Side Trimming Set값(주공정)'));
    const widTarget = num(findRow(pltcm, '폭목표값(주공정)'));
    const rolled = {
      id: 'rolled', title: '압연', process: proc(rows[0]),
      geometry: { thk_mm: setThk, wid_mm: trimWid, id_mm: null, weight_t: null },
      layers: [layer('substrate', 'substrate', 'core', mmToUm(setThk), '냉연 소지')],
      values: [
        val('set_thk', 'X-Ray Set 두께', setThk, 'mm', '주문두께 − 0.020 (목업 고정식 · 기준 룰은 정식 엔진 연결 후)', ev('formula', { route: ROUTES.rollingThicknessSet })),
        val('thk_target', '두께목표 (허용범위)', findRow(pltcm, '두께목표값'), null, '목표 ±0.015 (목업 상수)', ev('constant')),
        val('trim_wid', 'Side Trimming Set', trimWid, 'mm', '주문폭 + 6 (목업 고정식)', ev('formula', { route: ROUTES.lineWidthMargin })),
        val('wid_shrink', '폭수축값', num(findRow(pltcm, '폭수축값')), 'mm', '고정값 (목업 상수)', ev('constant', { route: ROUTES.lineWidthShrinkage })),
        val('wid_target', '폭목표값(주공정)', widTarget, 'mm', '주문폭 + 3 (목업 고정식)', ev('formula')),
        val('wr_type', '5Stand WR Type', findRow(pltcm, '5Stand WRType'), null, null, ev('constant')),
        val('id_ring', '내경링 사용여부', findRow(pltcm, '내경링 사용여부'), null, null, ev('constant')),
      ],
      changes: [],
    };

    // ③ 도금 CGL
    const coatThk = num(coat.thk);
    const coatedLayers = [];
    if (stack && stack.coating) coatedLayers.push(layer('coating-top', stack.coating, 'top', coatThk, COATING_LABEL[stack.coating]));
    coatedLayers.push(layer('substrate', 'substrate', 'core', mmToUm(setThk), '냉연 소지'));
    if (stack && stack.coating) coatedLayers.push(layer('coating-bottom', stack.coating, 'bottom', coatThk, COATING_LABEL[stack.coating]));
    const coated = {
      id: 'coated', title: '도금', process: proc(rows[1]),
      geometry: { thk_mm: orderThk, wid_mm: widTarget, id_mm: null, weight_t: null },
      layers: coatedLayers,
      values: [
        val('coated_thk', '도금 후 두께', orderThk, 'mm', isBmt ? '주문두께 (BMT 주문 · 도금두께 별도)' : '주문두께 (TCT · 도금 포함)', ev('formula')),
        val('coat_cd', '도금량코드', findRow(common, '도금량코드'), null, null, ev('constant')),
        val('coat_range', '도금 부착량 (하한 ~ 상한)', coat.min == null || coat.max == null ? null : coat.min + ' ~ ' + coat.max, 'g/㎡', null, ev('constant')),
        val('coat_target', '도금목표 부착량', coat.target, 'g/㎡', null, ev('constant')),
        val('coat_thk', '도금 두께', coatThk, 'µm', null, ev('constant', { note: '목업값 · 면당으로 표시' })),
        val('spangle', 'Spangle', coat.spangle, null, null, ev('constant')),
        val('lv', 'L/V', coat.lv, null, null, ev('constant')),
        val('skin', 'Skin Pass', coat.skin, null, null, ev('constant')),
        val('line', '도금 라인', ops0[0], null, null, ev('constant', { route: ROUTES.processRouting })),
      ],
      changes: [],
    };

    // ④ 칼라 CCL (칼라 품명 + 칼라제조사양이 있을 때만)
    let painted = null;
    if (hasPaint && color) {
      const m = Array.isArray(color.matrix) ? color.matrix : [];
      const thkRow = m[4] || [], colorRow = m[1] || [];   // 행4 = 도막두께, 행1 = 색상코드
      const sum = color.sum || {};
      const ls = [];
      // 열: [구분, Top4, Top3, Top2, Top1, Back1, Lamina…] — 위에서부터 Top4 → Top2, 프라이머(Top1), 도금, 소지, 도금, Back
      [[1, 4], [2, 3], [3, 2]].forEach(([col, n]) => {
        const t = num(thkRow[col]);
        if (t != null) ls.push(layer('topcoat-' + n, 'topcoat', 'top', t, 'Top ' + n + '코트 ' + (colorRow[col] || '')));
      });
      const primer = num(thkRow[4]);
      if (primer != null) ls.push(layer('primer', 'primer', 'top', primer, '프라이머 ' + (colorRow[4] || '')));
      coatedLayers.forEach(l => ls.push(Object.assign({}, l)));
      const back = num(thkRow[5]);
      if (back != null) ls.push(layer('backcoat', 'backcoat', 'bottom', back, 'Back 코트 ' + (colorRow[5] || '')));
      painted = {
        id: 'painted', title: '칼라', process: proc(rows[2]),
        geometry: { thk_mm: num(sum.szT), wid_mm: num(sum.szW), id_mm: null, weight_t: null },
        layers: ls,
        values: [
          val('paint_way', '도장방식', sum.way, null, null, ev('constant', { route: ROUTES.colorBom })),
          val('paint_top', 'Top 도막두께 합계', num(sum.thkT), 'µm', null, ev('constant', { route: ROUTES.colorBom })),
          val('paint_back', 'Back 도막두께', num(sum.thkB), 'µm', null, ev('constant', { route: ROUTES.colorBom })),
          val('color_top', '색상코드 Top', sum.cT, null, null, ev('constant')),
          val('color_back', '색상코드 Back', sum.cB, null, null, ev('constant')),
          val('resin_top', '수지 Top', sum.resinT, null, null, ev('constant')),
          val('resin_back', '수지 Back', sum.resinB, null, null, ev('constant')),
          val('painted_size', '목표 Size (두께 × 폭)', sum.szT == null ? null : sum.szT + ' × ' + sum.szW, 'mm', null, ev('constant')),
        ],
        changes: [],
      };
    }

    // ⑤ 제품 (정전·포장)
    const prev = painted || coated;
    const base0 = (Array.isArray(tol.base) && tol.base[0]) || [];
    const tols2 = (Array.isArray(tol.tols) && tol.tols[2]) || [];
    const pack = num(findRow(common, '포장단중(하/상)'));
    const coilId = num(findRow(common, '주문내경/종류'));
    const product = {
      id: 'product', title: '제품', process: { code: '—', name: '정전·포장' },
      geometry: { thk_mm: painted ? painted.geometry.thk_mm : orderThk, wid_mm: orderWid, id_mm: coilId, weight_t: pack == null ? null : pack / 1000 },
      layers: prev.layers.map(l => Object.assign({}, l)),
      values: [
        val('size', '주문 Actual Size', findRow(common, '주문 Actual Size'), null, null, ev('constant')),
        val('thk_range', '제품 두께 범위 (설계기준)', base0[2] == null || base0[2] === '' ? null : base0[2] + ' ~ ' + base0[3], 'mm', null, ev('constant')),
        val('wid_range', '제품 폭 범위', post.wMin == null ? null : post.wMin + ' ~ ' + post.wMax, 'mm', null, ev('constant')),
        val('tol', '보증 공차 (두께 하/상 · 폭 하/상)', tols2.length >= 5 ? tols2[1] + ' / ' + tols2[2] + ' · ' + tols2[3] + ' / ' + tols2[4] : null, 'mm', null, ev('constant')),
        val('coil_id', '주문내경', coilId, 'mm', null, ev('constant')),
        val('winding', '권취방법', findRow(common, '권취방법'), null, null, ev('constant')),
        val('pack', '포장방법', findRow(common, '포장방법'), null, null, ev('constant')),
      ],
      changes: [],
    };

    const scenes = [raw, rolled, coated].concat(painted ? [painted] : []).concat([product]);
    scenes.forEach((s, i) => {
      s.no = i + 1;
      if (i === 0) return;
      const p = scenes[i - 1];
      if (s.geometry.thk_mm != null && p.geometry.thk_mm != null && s.geometry.thk_mm !== p.geometry.thk_mm)
        s.changes.push({ key: 'thk_mm', from: p.geometry.thk_mm, to: s.geometry.thk_mm, delta: round3(s.geometry.thk_mm - p.geometry.thk_mm), unit: 'mm' });
      if (s.geometry.wid_mm != null && p.geometry.wid_mm != null && s.geometry.wid_mm !== p.geometry.wid_mm)
        s.changes.push({ key: 'wid_mm', from: p.geometry.wid_mm, to: s.geometry.wid_mm, delta: round3(s.geometry.wid_mm - p.geometry.wid_mm), unit: 'mm' });
      if (s.layers.length !== p.layers.length)
        s.changes.push({ key: 'layers', from: p.layers.length, to: s.layers.length, delta: s.layers.length - p.layers.length, unit: null });
    });

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
