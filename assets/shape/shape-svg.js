/* assets/shape/shape-svg.js — ShapeModel → SVG/HTML 문자열 (순수 함수, DOM 없음, 설계결과 객체를 모름) */
(function (g) {
  'use strict';

  const COLORS = { hot: '#6B4A3A', substrate: '#5A6470', coating: '#9FB7C3', primer: '#E0B95E', topcoat: '#C9A24B', backcoat: '#B8B0A0' };

  // hex 색을 흰색(amount>0) 또는 검은색(amount<0)쪽으로 amount 비율만큼 섞는다. amount ∈ [-1, 1].
  function tint(hex, amount) {
    const n = hex.replace('#', '');
    const mix = c => {
      const v = amount >= 0 ? c + (255 - c) * amount : c + c * amount;
      return Math.max(0, Math.min(255, Math.round(v)));
    };
    const toHex = v => v.toString(16).padStart(2, '0').toUpperCase();
    return '#' + [0, 2, 4].map(i => toHex(mix(parseInt(n.slice(i, i + 2), 16)))).join('');
  }
  // 코일 몸통 그라디언트(밝음→중간→어두움)와 끝면 색(면·감긴 띠 선·구멍)을 층 색 6개 상수에서 파생.
  function surfaceTones(kind) {
    const base = kind === 'hot' ? COLORS.hot : kind === 'coating' ? COLORS.coating : kind === 'paint' ? COLORS.topcoat : COLORS.substrate;
    return {
      body: [tint(base, 0.45), base, tint(base, -0.35)],
      face: [tint(base, 0.7), tint(base, 0.15), tint(base, -0.35)],
    };
  }
  const SIZES = {
    sm: { w: 110, h: 64,  x0: 14, cy: 32, rx: 9,  ry: 22, minLen: 52, maxLen: 76 },
    lg: { w: 320, h: 210, x0: 34, cy: 98, rx: 20, ry: 48, minLen: 96, maxLen: 136 },
  };
  const GAP_PX = 6;
  const CUT = { cx: 252, cy: 118, r: 46, x: 206, w: 92, innerH: 84 };

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtMm(n) {
    if (n == null) return '—';
    return Math.abs(n) >= 100 ? Math.round(n).toLocaleString('ko-KR') : n.toFixed(3);
  }
  function fmtUm(n) { return n == null ? '—' : String(Math.round(n)); }
  function fmtDelta(n, unit) {
    const sign = n > 0 ? '+' : n < 0 ? '−' : '';
    const a = Math.abs(n);
    return sign + (Number.isInteger(a) ? String(a) : a.toFixed(3));
  }

  // 겉층 종류 → 표면 색 키
  function surfaceOf(scene) {
    if (scene.id === 'raw') return 'hot';
    const top = scene.layers.find(l => l.side === 'top') || scene.layers[0];
    if (!top) return 'substrate';
    if (top.kind === 'topcoat' || top.kind === 'primer') return 'paint';
    if (top.kind === 'zinc' || top.kind === 'az' || top.kind === 'am') return 'coating';
    return 'substrate';
  }
  function layerColor(l, scene) {
    if (l.kind === 'substrate') return scene && scene.id === 'raw' ? COLORS.hot : COLORS.substrate;
    if (l.kind === 'zinc' || l.kind === 'az' || l.kind === 'am') return COLORS.coating;
    return COLORS[l.kind] || COLORS.substrate;
  }
  function layerThkText(l) {
    return l.kind === 'substrate' ? fmtMm(l.thk_um == null ? null : l.thk_um / 1000) + ' mm' : fmtUm(l.thk_um) + ' µm';
  }
  function layerDesc(scene) {
    return scene.layers.map(l => l.label + ' ' + layerThkText(l)).join(', ');
  }

  // 장면별 코일 몸통 길이(px). 폭에 비례하되 폭이 다른 장면끼리 최소 GAP_PX 차이.
  function coilLengths(model, size) {
    const sz = SIZES[size] || SIZES.sm;
    const scenes = model.scenes || [];
    const known = scenes.map(s => s.geometry && s.geometry.wid_mm).filter(w => w != null);
    const max = known.length ? Math.max(...known) : null, min = known.length ? Math.min(...known) : null;
    const out = {};
    scenes.forEach(s => {
      const w = s.geometry && s.geometry.wid_mm;
      out[s.id] = (w == null || max === min) ? sz.maxLen
        : Math.round(sz.minLen + (sz.maxLen - sz.minLen) * (w - min) / (max - min));
    });
    const sorted = scenes.filter(s => s.geometry && s.geometry.wid_mm != null).sort((a, b) => a.geometry.wid_mm - b.geometry.wid_mm);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (b.geometry.wid_mm !== a.geometry.wid_mm && out[b.id] - out[a.id] < GAP_PX) out[b.id] = out[a.id] + GAP_PX;
      if (b.geometry.wid_mm === a.geometry.wid_mm) out[b.id] = out[a.id];
    }
    return out;
  }

  // 단면 확대 원 안의 층 높이(px). 소지는 46%, 그 외는 로그 눈금 4~12px.
  function layerHeights(layers, innerH) {
    const subH = Math.round(innerH * 0.46);
    return layers.map(l => {
      if (l.kind === 'substrate') return subH;
      const t = l.thk_um == null ? 1 : Math.max(l.thk_um, 1);
      return Math.max(4, Math.min(12, Math.round(4 + 4 * Math.log10(t))));
    });
  }

  function cutawayLayers(scene) {
    const hs = layerHeights(scene.layers, CUT.innerH);
    const total = hs.reduce((a, b) => a + b, 0);
    let y = CUT.cy - total / 2;
    return scene.layers.map((l, i) => {
      const rect = `<rect x="${CUT.x}" y="${y.toFixed(1)}" width="${CUT.w}" height="${hs[i]}" fill="${layerColor(l, scene)}" class="shape-layer" data-layer="${escapeHtml(l.id)}">` +
        `<title>${escapeHtml(l.label + ' ' + layerThkText(l))}</title></rect>` +
        (l.kind === 'substrate' && hs[i] >= 14
          ? `<text x="${CUT.cx}" y="${(y + hs[i] / 2 + 3.5).toFixed(1)}" text-anchor="middle" class="shape-txt shape-txt-onink">${escapeHtml(layerThkText(l))}</text>` : '');
      y += hs[i];
      return rect;
    }).join('');
  }

  function renderCoil(scene, model, opts) {
    const size = (opts && opts.size) || 'sm';
    const sz = SIZES[size];
    const lengths = (opts && opts.lengths) || coilLengths(model, size);
    const len = lengths[scene.id] != null ? lengths[scene.id] : sz.maxLen;
    const surf = surfaceTones(surfaceOf(scene));
    const uid = 'sh-' + scene.id + '-' + size;
    const x0 = sz.x0, x1 = x0 + len, cy = sz.cy;
    const title = `${scene.title} 코일, 두께 ${fmtMm(scene.geometry.thk_mm)} mm, 폭 ${fmtMm(scene.geometry.wid_mm)} mm`;
    let s = `<svg class="shape-coil shape-coil-${size}" viewBox="0 0 ${sz.w} ${sz.h}" role="img" aria-labelledby="${uid}-t ${uid}-d">` +
      `<title id="${uid}-t">${escapeHtml(title)}</title><desc id="${uid}-d">${escapeHtml(layerDesc(scene))}</desc>` +
      `<defs><linearGradient id="${uid}-g" x1="0" x2="0" y1="0" y2="1">` +
      `<stop offset="0" stop-color="${surf.body[0]}"/><stop offset=".6" stop-color="${surf.body[1]}"/><stop offset="1" stop-color="${surf.body[2]}"/></linearGradient>` +
      (size === 'lg' ? `<clipPath id="${uid}-c"><circle cx="${CUT.cx}" cy="${CUT.cy}" r="${CUT.r}"/></clipPath>` : '') + `</defs>`;
    // 몸통, 오른쪽 끝, 왼쪽 끝면(감긴 띠 + 내경 구멍)
    s += `<rect x="${x0}" y="${cy - sz.ry}" width="${len}" height="${sz.ry * 2}" fill="url(#${uid}-g)"/>` +
      `<ellipse cx="${x1}" cy="${cy}" rx="${sz.rx}" ry="${sz.ry}" fill="${surf.body[1]}"/>` +
      `<ellipse cx="${x0}" cy="${cy}" rx="${sz.rx}" ry="${sz.ry}" fill="${surf.face[0]}" stroke="${surf.face[2]}"/>`;
    [0.72, 0.5, 0.3].forEach(k => {
      s += `<ellipse cx="${x0}" cy="${cy}" rx="${(sz.rx * k).toFixed(1)}" ry="${(sz.ry * k).toFixed(1)}" fill="none" stroke="${surf.face[1]}"/>`;
    });
    s += `<ellipse cx="${x0}" cy="${cy}" rx="${(sz.rx * 0.28).toFixed(1)}" ry="${(sz.ry * 0.28).toFixed(1)}" fill="${surf.face[2]}"/>`;

    if (size === 'lg') {
      const dy = cy + sz.ry + 16;
      s += `<line x1="${x0}" y1="${dy}" x2="${x1}" y2="${dy}" class="shape-dim"/>` +
        `<line x1="${x0}" y1="${dy - 5}" x2="${x0}" y2="${dy + 5}" class="shape-dim"/><line x1="${x1}" y1="${dy - 5}" x2="${x1}" y2="${dy + 5}" class="shape-dim"/>` +
        `<text x="${(x0 + x1) / 2}" y="${dy + 16}" text-anchor="middle" class="shape-txt">폭 ${escapeHtml(fmtMm(scene.geometry.wid_mm))}</text>`;
      const sub = [];
      if (scene.geometry.id_mm != null) sub.push('내경 ' + fmtMm(scene.geometry.id_mm));
      if (scene.geometry.weight_t != null) sub.push('단중 ' + scene.geometry.weight_t.toFixed(1) + 't');
      if (sub.length) s += `<text x="${(x0 + x1) / 2}" y="${dy + 30}" text-anchor="middle" class="shape-txt shape-txt-dim">${escapeHtml(sub.join(' · '))}</text>`;
      s += `<line x1="${x1 - 10}" y1="${cy - sz.ry + 8}" x2="${CUT.cx - 40}" y2="${CUT.cy - 32}" class="shape-lead"/>` +
        `<circle cx="${CUT.cx}" cy="${CUT.cy}" r="${CUT.r}" class="shape-cut"/>` +
        `<text x="${CUT.cx}" y="${CUT.cy - CUT.r - 6}" text-anchor="middle" class="shape-txt shape-txt-acc">단면 확대</text>` +
        `<g clip-path="url(#${uid}-c)">${cutawayLayers(scene)}</g>` +
        `<text x="${CUT.cx}" y="${CUT.cy + CUT.r + 22}" text-anchor="middle" class="shape-txt shape-txt-dim">두께 눈금은 과장 · 숫자는 원값</text>`;
    }
    return s + '</svg>';
  }

  function circled(scene, model) {
    const i = model.scenes.findIndex(s => s.id === scene.id);
    return (g.MesShape.CIRCLED && g.MesShape.CIRCLED[i]) || String(i + 1);
  }
  function geoLine(s) {
    return (s.id === 'rolled' ? 'Set ' : '') + fmtMm(s.geometry.thk_mm) + ' × ' + fmtMm(s.geometry.wid_mm);
  }
  function changeLine(s) {
    return s.changes.map(c =>
      c.key === 'thk_mm' ? '두께 ' + fmtDelta(c.delta, 'mm')
      : c.key === 'wid_mm' ? '폭 ' + fmtDelta(c.delta, 'mm')
      : '층 ' + fmtDelta(c.delta, null)).join(' · ');
  }

  function renderStrip(model, selId) {
    const lengths = coilLengths(model, 'sm');
    const cells = model.scenes.map(s => {
      const sel = s.id === selId;
      const sub = s.process ? `<small>${escapeHtml(s.process.code + ' ' + s.process.name)}</small>` : '';
      return `<div class="shape-sc${sel ? ' on' : ''}" role="tab" aria-selected="${sel}" tabindex="${sel ? 0 : -1}" data-scene="${escapeHtml(s.id)}" id="shape-tab-${escapeHtml(s.id)}">` +
        `<div class="shape-sc-t">${circled(s, model)} ${escapeHtml(s.title)}${sub}</div>` +
        renderCoil(s, model, { size: 'sm', lengths }) +
        `<div class="shape-sc-g">${escapeHtml(geoLine(s))}</div>` +
        `<div class="shape-sc-d">${escapeHtml(changeLine(s)) || '&nbsp;'}</div></div>`;
    });
    return `<div class="shape-strip" role="tablist" aria-label="설계 장면">${cells.join('<div class="shape-arr" aria-hidden="true">→</div>')}</div>`;
  }

  function renderLayerList(scene) {
    return `<ul class="shape-layers">` + scene.layers.map(l =>
      `<li><i style="background:${layerColor(l, scene)}"></i><span>${escapeHtml(l.label)}</span><b>${escapeHtml(layerThkText(l))}</b></li>`).join('') + `</ul>`;
  }

  function renderValue(v) {
    const e = v.evidence || {};
    const pending = !!(e.route && (g.MesShape.PENDING_ROUTES || []).includes(e.route));
    const name = (g.MesShape.ROUTE_NAMES || {})[e.route] || e.route;
    const badge = e.route
      ? `<button type="button" class="shape-badge${pending ? ' pending' : ''}" data-route="${escapeHtml(e.route)}">${escapeHtml(name)}${pending ? ' (준비 중)' : ''} →</button>` : '';
    const value = v.value == null
      ? `<span class="shape-missing">설계값 없음</span>`
      : `<span class="shape-n">${escapeHtml(typeof v.value === 'number' ? (v.unit === 'mm' ? fmtMm(v.value) : String(v.value)) : v.value)}</span>${v.unit ? ' ' + escapeHtml(v.unit) : ''}`;
    const foot = [v.formula, e.note].filter(Boolean).join(' · ');
    return `<div class="shape-v" tabindex="0" data-key="${escapeHtml(v.key)}"><div class="shape-v-k">${escapeHtml(v.label)}</div>` +
      `<div class="shape-v-b">${value}${badge}${foot ? `<div class="shape-v-f">${escapeHtml(foot)}</div>` : ''}</div></div>`;
  }

  function renderDetail(scene, model) {
    const ch = scene.changes
      .filter(c => c.key !== 'layers')
      .map(c => (c.key === 'thk_mm' ? '두께 ' : '폭 ') + fmtMm(c.from) + ' → ' + fmtMm(c.to)).join(' · ');
    const head = circled(scene, model) + ' ' + scene.title + (scene.process ? ' · ' + scene.process.code + ' ' + scene.process.name : '');
    return `<div class="shape-det"><div class="shape-fig">${renderCoil(scene, model, { size: 'lg' })}${renderLayerList(scene)}</div>` +
      `<div class="shape-vals"><div class="shape-det-h"><b>${escapeHtml(head)}</b>` +
      (ch ? `<span class="shape-delta">${escapeHtml(ch)}</span>` : '') +
      `<span class="shape-note">이 장면에서 정해진 값 · 산식과 근거 기준</span></div>` +
      scene.values.map(renderValue).join('') + `</div></div>`;
  }

  /** 섹션 헤더 요약줄. **평문(text)을 돌려준다 — 이스케이프하지 않는다.**
   *  호출자가 textContent 로 넣거나 삽입 전에 escapeHtml 로 이스케이프해야 한다
   *  (quality-design.html 의 SECS 헤더는 esc(s.sum(d)) 로 삽입). innerHTML 에 직접 넣지 말 것. */
  function renderSummary(model) {
    const by = id => model.scenes.find(s => s.id === id);
    const parts = [];
    const raw = by('raw'), rolled = by('rolled'), coated = by('coated'), painted = by('painted'), product = by('product');
    if (raw) parts.push('원자재 ' + fmtMm(raw.geometry.thk_mm) + '×' + fmtMm(raw.geometry.wid_mm));
    if (rolled) parts.push('Set ' + fmtMm(rolled.geometry.thk_mm) + '×' + fmtMm(rolled.geometry.wid_mm));
    if (coated) { const c = coated.values.find(v => v.key === 'coat_cd'); if (c && c.value != null) parts.push(String(c.value).split(' : ')[0]); }
    if (painted) { const p = painted.values.find(v => v.key === 'paint_way'); if (p && p.value != null) parts.push(String(p.value).split(' : ').pop()); }
    if (product) parts.push('제품 ' + fmtMm(product.geometry.thk_mm) + '×' + fmtMm(product.geometry.wid_mm));
    return model.productType + ' · ' + parts.join(' → ');
  }

  function legend() {
    return [['hot', '핫코일'], ['substrate', '소지(냉연)'], ['coating', '도금'], ['primer', '프라이머'], ['topcoat', 'Top 코트'], ['backcoat', 'Back 코트']]
      .map(([k, n]) => `<span><i style="background:${COLORS[k]}"></i>${n}</span>`).join('');
  }

  function renderSection(model, selId, opts) {
    const expanded = !!(opts && opts.expanded);
    const sel = model.scenes.find(s => s.id === selId) || model.scenes[0];
    const warn = (model.warnings || []).map(w => `<span class="shape-warn">${escapeHtml(w)}</span>`).join('');
    return `<div class="shape-root${expanded ? ' expanded' : ''}">` +
      (warn ? `<div class="shape-warns">${warn}</div>` : '') +
      renderStrip(model, sel.id) + renderDetail(sel, model) +
      `<div class="shape-legend">${legend()}</div></div>`;
  }

  g.MesShape = Object.assign(g.MesShape || {}, {
    COLORS, escapeHtml, fmtMm, fmtUm, fmtDelta, coilLengths, layerHeights, renderCoil, tint,
    renderStrip, renderDetail, renderLayerList, renderSummary, renderSection,
    _svg: { surfaceOf, layerColor, layerThkText, layerDesc, surfaceTones, SIZES, CUT },
  });
})(globalThis);
