/* assets/report/report-doc.js — 문서 모델 → A4 DOM, 실측 페이지 분할, 미리보기·인쇄
   빌드 시 build/inject_report.py 가 modules/quality-certificate.html 마커 구간에 복사한다.

   왜 CSS 만으로 안 되는가: 크롬은 @page 안의 여백 상자(@bottom-right 등)를 지원하지 않아
   'N / M' 페이지 번호를 CSS 로 찍을 수 없고, 장마다 소계를 넣는 것도 CSS 로는 불가능하다.
   그래서 (1) 숨은 컨테이너에 전부 그려 높이를 재고 (2) 순수 함수로 장을 나눈 뒤
   (3) 장별로 다시 그린다. 리포트 엔진이 흔히 말하는 2-pass 렌더다. */
(function (g) {
  'use strict';

  const ROOT_ID = 'rp-root';
  const MAKER = '(주)목업제철 광양공장';
  const MAKER_EN = 'MOCKUP STEEL CO., LTD.';

  let state = null; // { row, doc, sheetPxW }

  function M() { return g.MesReport; }
  function esc(s) { return M().esc(s); }
  function comma(n) { return M().comma(n); }
  function fx(n, d) { return n == null || !Number.isFinite(n) ? '—' : n.toFixed(d); }

  // offsetHeight 는 마진을 빼고 센다. 블록 사이 간격도 장 높이를 먹으므로 마진까지 더한다.
  function outerH(el) {
    if (!el) return 0;
    const cs = getComputedStyle(el);
    return el.offsetHeight + parseFloat(cs.marginTop || 0) + parseFloat(cs.marginBottom || 0);
  }

  // ── 조각별 HTML ──────────────────────────────────────────────────────────
  function headHtml(doc, pageNo, pageCount) {
    return '<div class="rp-head"><div class="rp-head-top">'
      + '<div class="rp-maker"><b>' + esc(MAKER) + '</b><span>' + esc(MAKER_EN) + '</span></div>'
      + '<div class="rp-title"><b>품질보증서</b><span>QUALITY GUARANTEE CERTIFICATE</span></div>'
      + '<dl class="rp-stamp">'
      + '<dt>보증서번호</dt><dd class="mono">' + esc(doc.no) + ' ' + esc(doc.ver) + '</dd>'
      + '<dt>발행일</dt><dd class="mono">' + esc(doc.issued || '미발행') + '</dd>'
      + '<dt>페이지</dt><dd class="mono">' + pageNo + ' / ' + pageCount + '</dd>'
      + '</dl></div></div>';
  }

  function infoHtml(doc) {
    const size = fx(doc.thk, 3) + ' × ' + (doc.wid == null ? '—' : comma(doc.wid));
    return '<div class="rp-info"><table>'
      + '<tr><th>수요가</th><td>' + esc(doc.customer) + '</td>'
      + '<th>주문번호</th><td class="mono">' + esc(doc.order) + '</td></tr>'
      + '<tr><th>발주번호(PO)</th><td class="mono">' + esc(doc.po) + '</td>'
      + '<th>품명 · 규격</th><td>' + esc(doc.prd.name) + ' · ' + esc(doc.prd.spec) + '</td></tr>'
      + '<tr><th>주문 치수 (mm)</th><td class="mono">' + esc(size) + '</td>'
      + '<th>도금 종류</th><td>' + esc(doc.coat.label) + '</td></tr>'
      + '<tr><th>수량 · 중량</th><td class="mono">' + doc.coilCount + ' 코일 · ' + comma(doc.totalWgt) + ' kg</td>'
      + '<th>발행 담당</th><td>' + esc(doc.issuer) + '</td></tr>'
      + '</table></div>';
  }

  function criteriaHtml(doc) {
    let h = '<div class="rp-sect"><h4>1. 보증 기준<span class="rp-of">강종 ' + esc(doc.spec.grade) + ' · 주문 사양 기준</span></h4>'
      + '<table class="rp-tbl"><colgroup><col style="width:46mm"><col style="width:18mm"><col style="width:20mm"><col style="width:44mm"><col></colgroup>'
      + '<thead><tr><th>항목</th><th>기호</th><th>단위</th><th>규격 기준</th><th>시험 방법</th></tr></thead><tbody>';
    doc.criteria.forEach(function (c) {
      h += '<tr><td>' + esc(c.name) + '</td><td class="ctr mono">' + esc(c.sym) + '</td>'
        + '<td class="ctr">' + esc(c.unit) + '</td><td class="ctr mono">' + esc(c.limit) + '</td>'
        + '<td class="ctr mono">' + esc(c.method) + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }

  // 폭 합계 180mm = A4 210mm - 좌우 여백 15mm×2
  const COILS_COLS = '<colgroup><col style="width:11mm"><col style="width:26mm"><col style="width:20mm">'
    + '<col style="width:16mm"><col style="width:14mm"><col style="width:20mm"><col style="width:13mm">'
    + '<col style="width:13mm"><col style="width:11mm"><col style="width:19mm"><col></colgroup>';

  function coilsHeadHtml(doc) {
    return '<h4>2. 코일별 시험 성적<span class="rp-of">총 ' + doc.coilCount + ' 코일</span></h4>';
  }

  function coilsTableHtml(doc, from, to, last) {
    const rows = doc.coils.slice(from, to);
    let sub = 0;
    rows.forEach(function (c) { sub += c.wgt; });
    let acc = 0;
    for (let i = 0; i < to; i++) acc += doc.coils[i].wgt;

    let h = '<table class="rp-tbl">' + COILS_COLS
      + '<thead><tr><th>No.</th><th>코일번호</th><th>용강번호</th><th>두께<br>(mm)</th><th>폭<br>(mm)</th>'
      + '<th>중량<br>(kg)</th><th>YP<br>(MPa)</th><th>TS<br>(MPa)</th><th>EL<br>(%)</th>'
      + '<th>도금부착량<br>(g/㎡)</th><th>판정</th></tr></thead><tbody>';
    rows.forEach(function (c) {
      h += '<tr><td class="ctr mono">' + c.seq + '</td>'
        + '<td class="mono">' + esc(c.no) + '</td>'
        + '<td class="mono">' + esc(c.heat) + '</td>'
        + '<td class="num">' + fx(c.thk, 3) + '</td>'
        + '<td class="num">' + comma(c.wid) + '</td>'
        + '<td class="num">' + comma(c.wgt) + '</td>'
        + '<td class="num">' + comma(c.yp) + '</td>'
        + '<td class="num">' + comma(c.ts) + '</td>'
        + '<td class="num">' + (c.el == null ? '—' : comma(c.el)) + '</td>'
        + '<td class="num">' + comma(c.coat) + '</td>'
        + '<td class="ctr ' + (c.pass ? 'rp-pass' : 'rp-fail') + '">' + (c.pass ? '합격' : '불합격') + '</td></tr>';
    });
    h += '</tbody><tfoot><tr>'
      + '<td colspan="5">' + (last ? '총계 — 전체 ' + doc.coilCount + ' 코일' : '이 장 소계 — ' + rows.length + ' 코일')
      + '</td><td class="num">' + comma(last ? doc.totalWgt : sub) + '</td>'
      + '<td colspan="5" class="ctr">' + (last ? '이상 ' + doc.coilCount + ' 코일 전량 합격' : '누계 ' + comma(acc) + ' kg · 다음 장에 계속')
      + '</td></tr></tfoot></table>';
    return h;
  }

  function signHtml(doc) {
    return '<div class="rp-decl">위 제품은 <b>' + esc(doc.prd.spec) + '</b> 및 주문 사양(' + esc(doc.po)
      + ')의 요구사항에 따라 시험한 결과 <b>적합</b>함을 보증합니다.<br>'
      + '본 성적값은 각 코일의 대표 시험편 측정값이며, 시험 방법은 1항 보증 기준에 따른다.</div>'
      + '<div class="rp-sign"><div class="rp-sign-txt">'
      + '문서 지문 <span class="mono">' + esc(doc.fingerprint) + '</span><br>'
      + '재발행·회수 이력은 품질보증서관리 화면에서 확인할 수 있습니다.'
      + '</div>'
      + '<div class="rp-sign-box"><b>검사 책임자</b><i>서명 / 직인</i></div>'
      + '<div class="rp-sign-box"><b>품질보증 책임자</b><i>서명 / 직인</i></div>'
      + '</div>';
  }

  function footHtml(doc, pageNo, pageCount) {
    return '<div class="rp-foot"><span>문서 <b class="mono">' + esc(doc.docId) + '</b></span>'
      + '<span>지문 <b class="mono">' + esc(doc.fingerprint) + '</b></span>'
      + '<span class="rp-spacer"></span>'
      + '<span>상태 <b>' + esc(doc.status) + '</b></span>'
      + '<span><b class="mono">' + pageNo + ' / ' + pageCount + '</b></span></div>';
  }

  function wmHtml(doc) {
    return doc.watermark ? '<div class="rp-wm"><span>' + esc(doc.watermark) + '</span></div>' : '';
  }

  // ── 측정 → 분할 → 렌더 ───────────────────────────────────────────────────
  function measure(doc, host) {
    // 1) 머리글·바닥글만 넣은 실제 높이의 시트에서 본문 가용 높이를 잰다(단위 환산 없이 정확).
    host.innerHTML = '<div class="rp-sheet">' + headHtml(doc, 1, 1)
      + '<div class="rp-body" id="rp-m-body"></div>' + footHtml(doc, 1, 1) + '</div>';
    const bodyH = host.querySelector('#rp-m-body').offsetHeight;
    const sheetPxW = host.querySelector('.rp-sheet').offsetWidth;

    // 2) 높이 제한 없는 시트에 모든 조각을 그려 각각의 높이를 잰다.
    host.innerHTML = '<div class="rp-sheet rp-sheet--measure"><div class="rp-body">'
      + '<div id="rp-m-info">' + infoHtml(doc) + '</div>'
      + '<div id="rp-m-crit">' + criteriaHtml(doc) + '</div>'
      + '<div class="rp-sect" id="rp-m-coils">' + coilsHeadHtml(doc) + coilsTableHtml(doc, 0, doc.coils.length, true) + '</div>'
      + '<div id="rp-m-sign">' + signHtml(doc) + '</div>'
      + '</div></div>';
    const coilSect = host.querySelector('#rp-m-coils');
    const csCs = getComputedStyle(coilSect);
    const rowHs = Array.prototype.map.call(coilSect.querySelectorAll('tbody tr'), function (tr) { return tr.offsetHeight; });

    return {
      bodyH: bodyH,
      sheetPxW: sheetPxW,
      blocks: [
        { id: 'info', kind: 'block', h: outerH(host.querySelector('#rp-m-info').firstElementChild) },
        { id: 'crit', kind: 'block', h: outerH(host.querySelector('#rp-m-crit').firstElementChild) },
        {
          id: 'coils', kind: 'table',
          headH: outerH(coilSect.querySelector('h4')) + coilSect.querySelector('thead').offsetHeight,
          footH: coilSect.querySelector('tfoot').offsetHeight + parseFloat(csCs.marginBottom || 0),
          rowHs: rowHs,
        },
        {
          id: 'sign', kind: 'block',
          h: outerH(host.querySelector('.rp-decl')) + outerH(host.querySelector('.rp-sign')),
        },
      ],
    };
  }

  function renderPages(doc, pages) {
    const total = pages.length;
    return pages.map(function (pieces, i) {
      let body = '';
      pieces.forEach(function (p) {
        if (p.id === 'info') body += infoHtml(doc);
        else if (p.id === 'crit') body += criteriaHtml(doc);
        else if (p.id === 'sign') body += signHtml(doc);
        else if (p.id === 'coils') {
          body += '<div class="rp-sect">' + (p.from === 0 ? coilsHeadHtml(doc)
            : '<h4>2. 코일별 시험 성적<span class="rp-of">' + (p.from + 1) + ' ~ ' + p.to + ' / ' + doc.coilCount + ' 코일 (이어서)</span></h4>')
            + coilsTableHtml(doc, p.from, p.to, p.last) + '</div>';
        }
      });
      return '<div class="rp-sheet">' + wmHtml(doc) + '<span class="rp-mock">MOCK-UP</span>'
        + headHtml(doc, i + 1, total) + '<div class="rp-body">' + body + '</div>'
        + footHtml(doc, i + 1, total) + '</div>';
    }).join('');
  }

  // ── 오버레이 ─────────────────────────────────────────────────────────────
  function root() {
    let el = document.getElementById(ROOT_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ROOT_ID;
    el.className = 'rp-overlay';
    el.innerHTML = '<div class="rp-bar">'
      + '<h3 id="rp-ttl">품질보증서</h3><span class="rp-sub" id="rp-sub"></span>'
      + '<span class="rp-spacer"></span>'
      + '<label title="페이지 분할을 확인하기 위한 목업 조작입니다. 코일당 평균 중량은 유지한 채 총중량을 다시 계산합니다.">코일 수(목업) <input type="number" id="rp-n" min="1" max="200" step="1"></label>'
      + '<button type="button" id="rp-close">닫기</button>'
      + '<button type="button" class="pri" id="rp-print">인쇄 · PDF 저장</button>'
      + '</div>'
      + '<div class="rp-scroll"><div class="rp-pages" id="rp-pages"></div>'
      + '<p class="rp-note">브라우저 인쇄 대화상자에서 <b>용지 A4 · 배율 100% · 여백 없음 · 머리글/바닥글 끄기</b>로 인쇄하거나 «PDF로 저장»을 고르세요. 이 문서는 목업 시드로 생성된 표본입니다.</p>'
      + '</div><div class="rp-measure" id="rp-measure" aria-hidden="true"></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target.closest('#rp-close')) close();
      else if (e.target.closest('#rp-print')) printNow();
    });
    el.querySelector('#rp-n').addEventListener('change', function (e) {
      const v = Math.max(1, Math.min(200, Math.round(Number(e.target.value) || 1)));
      e.target.value = v;
      if (state) draw(state.row, v);
    });
    window.addEventListener('resize', fit);
    return el;
  }

  function draw(row, coilCount) {
    const el = root();
    const doc = M().buildCertDoc(row, { coilCount: coilCount });
    const host = el.querySelector('#rp-measure');
    const m = measure(doc, host);
    host.innerHTML = '';
    const pages = M().paginate(m.blocks, m.bodyH);
    el.querySelector('#rp-pages').innerHTML = renderPages(doc, pages);
    el.querySelector('#rp-ttl').textContent = doc.no + ' ' + doc.ver + ' 품질보증서';
    el.querySelector('#rp-sub').textContent = doc.customer + ' · ' + doc.coilCount + ' 코일 · ' + pages.length + '장'
      + (doc.watermark ? ' · ' + doc.watermark : '');
    el.querySelector('#rp-n').value = doc.coilCount;
    state = { row: row, doc: doc, sheetPxW: m.sheetPxW, pageCount: pages.length };
    fit();
    return state;
  }

  // A4 폭이 모듈 패널보다 넓으면 화면에서만 축소한다. 인쇄에는 영향이 없다(@media print 에서 zoom:1).
  function fit() {
    const el = document.getElementById(ROOT_ID);
    if (!el || !el.classList.contains('on') || !state) return;
    const avail = el.querySelector('.rp-scroll').clientWidth - 36;
    const z = Math.min(1, Math.max(0.25, avail / state.sheetPxW));
    el.style.setProperty('--rp-zoom', String(Math.round(z * 1000) / 1000));
  }

  function open(row, autoPrint) {
    const el = root();
    el.classList.add('on');
    document.body.classList.add('rp-on');
    document.body.style.overflow = 'hidden';
    draw(row, null);
    el.querySelector('#rp-print').focus();

    // 웹폰트가 측정 뒤에 도착하면 행 높이가 달라져 장 나눔이 어긋난다(마지막 행이 잘리거나
    // 빈 장이 생긴다). 폰트가 준비되면 같은 코일 수로 한 번 더 그린 뒤 인쇄한다.
    const fonts = document.fonts;
    if (fonts && fonts.ready && fonts.status !== 'loaded') {
      fonts.ready.then(function () {
        if (!isOpen()) return;
        draw(row, state ? state.doc.coilCount : null);
        if (autoPrint) printNow();
      });
    } else if (autoPrint) {
      setTimeout(printNow, 60);
    }
    return state;
  }

  function close() {
    const el = document.getElementById(ROOT_ID);
    if (!el) return;
    el.classList.remove('on');
    document.body.classList.remove('rp-on');
    document.body.style.overflow = '';
    state = null;
  }

  function isOpen() {
    const el = document.getElementById(ROOT_ID);
    return !!(el && el.classList.contains('on'));
  }

  // 포털에서는 이 모듈이 같은 출처의 srcdoc iframe 안에서 돈다. 프레임 안에서 부른
  // window.print() 는 그 프레임 문서만 인쇄한다(크롬·엣지·파이어폭스).
  function printNow() {
    if (!isOpen()) return;
    try { window.focus(); } catch (e) { /* 무시 */ }
    window.print();
  }

  g.MesReport = Object.assign(g.MesReport || {}, {
    open, close, isOpen, printNow, draw,
    _internal: { measure, renderPages, headHtml, infoHtml, criteriaHtml, coilsTableHtml, signHtml, footHtml, outerH },
  });
})(globalThis);
