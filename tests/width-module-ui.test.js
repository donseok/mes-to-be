'use strict';
/* 폭수축량 · 폭마진량 모듈 화면 스모크 테스트.
 *
 * 두 모듈 HTML 을 jsdom 에 그대로 올려 초기 렌더 → 공정 전환 → 탭 전환 →
 * 판정·합산 → 등록/수정/삭제 → 이력 기록까지 실제로 돌린다.
 * 정적 HTML 검사로는 잡히지 않는 런타임 오류(없는 엘리먼트 접근, 헤더와 본행의
 * 칸 수 어긋남, textContent 에 HTML 을 넣는 실수)를 막는다.
 *
 *   node --test tests/width-module-ui.test.js
 *
 * jsdom 은 저장소 의존성이 아니다(목업이라 빌드에는 필요 없다).
 * 설치되어 있지 않으면 이 파일은 건너뛴다 — 룰 정합성은
 * tests/width-rule-seed.test.js 가 의존성 없이 검증한다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
  /* 아래에서 test.skip 처리 */
}

const ROOT = path.join(__dirname, '..');

function boot(file) {
  const html = fs.readFileSync(path.join(ROOT, 'modules', file), 'utf8');
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://example.test/',
    virtualConsole: new VirtualConsole()
      .on('jsdomError', (e) => errors.push(String((e && e.message) || e)))
      .on('error', (e) => errors.push(String(e)))
  });
  return { dom, doc: dom.window.document, win: dom.window, errors };
}
const click = (win, sel) => {
  const el = win.document.querySelector(sel);
  assert.ok(el, '엘리먼트 없음: ' + sel);
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  return el;
};
const setVal = (win, sel, v) => {
  const el = win.document.querySelector(sel);
  assert.ok(el, '엘리먼트 없음: ' + sel);
  el.value = v;
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
};
const txt = (win, sel) => {
  const el = win.document.querySelector(sel);
  return el ? el.textContent.trim() : null;
};
const n = (doc, sel) => doc.querySelectorAll(sel).length;
const cells = (tr) => [...tr.children];
const colTotal = (tr) => cells(tr).reduce((a, th) => a + Number(th.getAttribute('colspan') || 1), 0);

const opt = JSDOM ? test : test.skip;

/* ── 폭수축량 ─────────────────────────────────────────── */
opt('폭수축량: 초기 렌더 — 5개 공정 · 186건이 한 프로그램에 묶인다', () => {
  const { dom, doc, win, errors } = boot('width-reduction.html');
  assert.deepEqual(errors, [], '런타임 오류');
  assert.equal(n(doc, '#procbar [data-proc]'), 6, '전체 + 공정 5');
  assert.equal(txt(win, '#cnt-list'), '186');
  assert.equal(n(doc, '#list-grid tbody tr'), 186);
  assert.match(txt(win, '#list-meta'), /^186건 \/ 공정합계 186건$/);
  assert.match(txt(win, '#head-meta'), /C10B1074 · C10B1075 · C10B1076 · C10B1077 · C10B1078/);
  assert.match(txt(win, '#head-meta'), /공정 5단계/);
  dom.window.close();
});

opt('폭수축량: 전체 보기 — 헤더 칸 수와 본행 칸 수가 어긋나지 않는다', () => {
  const { dom, doc, errors } = boot('width-reduction.html');
  assert.deepEqual(errors, []);
  const grp = doc.querySelector('#list-grid thead tr.grp');
  const first = doc.querySelector('#list-grid tbody tr');
  assert.equal(colTotal(grp), 15, '공정+순번+우선순위+ID+조건 7+폭감소량+상태+비고+수정');
  assert.equal(first.children.length, 15);
  assert.match(first.children[0].textContent, /PLTCM/, '첫 칸이 공정');
  assert.match(cells(doc.querySelector('#list-grid thead tr:not(.grp)'))[0].textContent, /순번/);
  dom.window.close();
});

opt('폭수축량: 공정 전환 — CGL 은 139건 · 조건 6종 헤더를 갖는다', () => {
  const { dom, doc, win, errors } = boot('width-reduction.html');
  const before = txt(win, '#list-meta');
  click(win, '[data-proc="CGL"]');
  assert.deepEqual(errors, []);
  assert.notEqual(txt(win, '#list-meta'), before);
  assert.equal(n(doc, '#list-grid tbody tr'), 139);
  assert.match(txt(win, '#head-meta'), /C10B1075/);
  assert.match(txt(win, '#head-meta'), /조건 6종/);
  assert.equal(n(doc, '#list-grid thead tr:not(.grp) th'), 3 + 6 + 4);
  click(win, '[data-proc="PLTCM"]');
  assert.equal(n(doc, '#list-grid tbody tr'), 32, 'PLTCM 32건');
  assert.equal(n(doc, '#list-grid thead tr:not(.grp) th'), 3 + 3 + 4);
  dom.window.close();
});

opt('폭수축량: 공정 흐름 합산 — 폭 1000 · 5단계 누적 9 mm', () => {
  const { dom, doc, win, errors } = boot('width-reduction.html');
  click(win, '.tab[data-tab="flow"]');
  setVal(win, '#fi-prodCd', 'L');
  setVal(win, '#fi-rawCd', 'H32');
  setVal(win, '#fi-pltcmThk', '0.4');
  setVal(win, '#fi-matCd', '5A');
  setVal(win, '#fi-procCd', '82');
  setVal(win, '#fi-inwid', '1000');
  click(win, '[data-action="flow-run"]');
  assert.deepEqual(errors, []);
  assert.equal(n(doc, '#flow-steps .flow-step'), 5, 'PLTCM·CGL·EGL·정전·CCL 5단계');
  assert.equal(txt(win, '.flow-total .ft-val'), '+9 mm', 'PLTCM 2 + CGL 7 = 9');
  assert.equal(n(doc, '#flow-grid tbody tr'), 6, '5단계 + 합계 행');
  /* 진입 폭이 단계마다 줄어든다 — CGL 은 PLTCM 출측폭(998)을 받는다 */
  const flowRows = [...doc.querySelectorAll('#flow-grid tbody tr')];
  assert.equal(cells(flowRows[0])[5].textContent.trim(), '1000', 'PLTCM 진입 폭 1000');
  assert.equal(cells(flowRows[0])[6].textContent.trim(), '998', 'PLTCM 출측 폭 998');
  assert.equal(cells(flowRows[1])[5].textContent.trim(), '998', 'CGL 진입 폭 = PLTCM 출측폭');
  assert.equal(cells(flowRows[1])[6].textContent.trim(), '991', 'CGL 출측 폭 991');
  dom.window.close();
});

opt('폭수축량: 간편판정 — 적용 룰 · 폭감소량 · 출측 폭이 일치한다', () => {
  const { dom, doc, win, errors } = boot('width-reduction.html');
  click(win, '[data-proc="PLTCM"]');
  click(win, '.tab[data-tab="judge"]');
  setVal(win, '#ji-rawCd', 'H32');
  setVal(win, '#ji-pltcmThk', '0.3');
  setVal(win, '#ji-pltcmWid', '800');
  click(win, '[data-action="judge-run"]');
  assert.deepEqual(errors, []);
  const vals = [...doc.querySelectorAll('#judge-result .val')].map((e) => e.textContent.trim());
  assert.deepEqual(vals, ['WR-PLTCM-002', '+2', '800', '798']);
  assert.equal(n(doc, '#judge-grid tbody tr'), 1);
  assert.ok(!/[<>]/.test(txt(win, '#judge-meta')), 'judge-meta 에 태그가 그대로 보이면 안 된다');
  dom.window.close();
});

opt('폭수축량: 변경 이력 — 시드 적재 1건이 보인다', () => {
  const { dom, doc, win, errors } = boot('width-reduction.html');
  click(win, '.tab[data-tab="hist"]');
  assert.deepEqual(errors, []);
  assert.equal(n(doc, '#hist-grid tbody tr'), 1);
  assert.match(doc.querySelector('#hist-grid tbody tr').textContent, /시드 적재/);
  assert.equal(n(doc, '#h-proc option'), 6, '전체 + 공정 5');
  dom.window.close();
});

opt('폭수축량: 코드 범례 — 공정 탭 5개 · CGL 선택 시 139행', () => {
  const { dom, doc, win, errors } = boot('width-reduction.html');
  click(win, '.tab[data-tab="legend"]');
  assert.deepEqual(errors, []);
  assert.equal(n(doc, '#legend-procbar [data-lproc]'), 5);
  assert.equal(n(doc, '#legend-procbody tbody tr'), 32, '기본 PLTCM');
  click(win, '[data-lproc="CGL"]');
  assert.equal(n(doc, '#legend-procbody tbody tr'), 139);
  assert.match(txt(win, '#lg-cgl-proc'), /82/);
  assert.match(txt(win, '#lg-egl-proc'), /91/);
  dom.window.close();
});

opt('폭수축량: 등록 → 중복 차단 → 수정 → 삭제와 이력 기록', () => {
  const { dom, doc, win, errors } = boot('width-reduction.html');
  click(win, '[data-proc="JZ"]');
  assert.equal(n(doc, '#list-grid tbody tr'), 3, '원본 정전 3건');

  /* 등록 */
  click(win, '[data-action="new-rule"]');
  assert.equal(n(doc, '#d-body .cond-form .cl'), 4, '정전 조건 4종');
  setVal(win, '#e-op-prodCd', 'IN');
  setVal(win, '#e-v1-prodCd', 'Q,R');
  setVal(win, '#e-op-pltcmThk', 'BETWEEN1');
  setVal(win, '#e-v1-pltcmThk', '0.5');
  setVal(win, '#e-v2-pltcmThk', '1.5');
  setVal(win, '#e-op-prodWid', 'BETWEEN2');
  setVal(win, '#e-v1-prodWid', '700');
  setVal(win, '#e-v2-prodWid', '1200');
  setVal(win, '#e-res', '6');
  setVal(win, '#e-no', '4');
  click(win, '[data-action="form-save"]');
  assert.equal(n(doc, '#list-grid tbody tr'), 4);
  assert.equal(txt(win, '#d-title'), 'JZ · 정전폭감소량 · WR-JZ-004', '시드 다음 번호로 채번');
  assert.match(txt(win, '#toast'), /룰이 등록되었습니다 · JZ/);

  /* 동일 조건 중복 등록 차단 */
  click(win, '[data-action="new-rule"]');
  setVal(win, '#e-op-prodCd', 'IN');
  setVal(win, '#e-v1-prodCd', 'Q,R');
  setVal(win, '#e-op-pltcmThk', 'BETWEEN1');
  setVal(win, '#e-v1-pltcmThk', '0.5');
  setVal(win, '#e-v2-pltcmThk', '1.5');
  setVal(win, '#e-op-prodWid', 'BETWEEN2');
  setVal(win, '#e-v1-prodWid', '700');
  setVal(win, '#e-v2-prodWid', '1200');
  setVal(win, '#e-res', '9');
  setVal(win, '#e-no', '5');
  click(win, '[data-action="form-save"]');
  assert.match(txt(win, '#toast'), /^동일한 조건 조합이 이미 등록되어 있습니다/);
  assert.equal(n(doc, '#list-grid tbody tr'), 4, '중복은 저장되지 않는다');
  click(win, '[data-action="form-cancel"]');

  /* 수정 */
  doc.querySelector('#list-grid tbody tr[data-open="WR-JZ-004"]')
    .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  click(win, '[data-action="edit-rule"]');
  setVal(win, '#e-res', '8');
  setVal(win, '#e-note', '테스트 수정');
  click(win, '[data-action="form-save"]');
  assert.match(txt(win, '#toast'), /룰이 수정되었습니다 · JZ/);

  /* 수정이 판정에 반영 */
  click(win, '.tab[data-tab="judge"]');
  setVal(win, '#ji-prodCd', 'Q');
  setVal(win, '#ji-pltcmThk', '1.0');
  setVal(win, '#ji-prodWid', '1000');
  click(win, '[data-action="judge-run"]');
  assert.equal(doc.querySelectorAll('#judge-result .val')[1].textContent.trim(), '+8');

  /* 이력 */
  click(win, '.tab[data-tab="hist"]');
  assert.equal(n(doc, '#hist-grid tbody tr'), 3, '시드 1 + 등록 1 + 수정 1');
  const procCells = [...doc.querySelectorAll('#hist-grid tbody tr')].map((tr) => cells(tr)[2].textContent.trim());
  assert.equal(procCells.filter((x) => x === 'JZ').length, 2, '공정이 이력에 남는다');

  /* 삭제 */
  click(win, '.tab[data-tab="list"]');
  doc.querySelector('#list-grid tbody tr[data-open="WR-JZ-004"]')
    .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  click(win, '[data-action="delete-rule"]');
  click(win, '[data-action="modal-ok"]');
  assert.equal(n(doc, '#list-grid tbody tr'), 3);
  assert.match(txt(win, '#toast'), /룰이 삭제되었습니다/);
  assert.deepEqual(errors, [], '런타임 오류');
  dom.window.close();
});

/* ── 폭마진량 ─────────────────────────────────────────── */
opt('폭마진량: 초기 렌더 — 2개 공정 · 59건이 한 프로그램에 묶인다', () => {
  const { dom, doc, win, errors } = boot('width-margin.html');
  assert.deepEqual(errors, [], '런타임 오류');
  assert.equal(n(doc, '#procbar [data-proc]'), 3, '전체 + 공정 2');
  assert.equal(txt(win, '#cnt-list'), '59');
  assert.equal(n(doc, '#list-grid tbody tr'), 59);
  assert.match(txt(win, '#head-meta'), /C10B1073 · C10B1079/);
  assert.match(txt(win, '#head-meta'), /공정 2단계/);
  dom.window.close();
});

opt('폭마진량: 공정 전환 — 정전은 26건 · 조건 8종 헤더를 갖는다', () => {
  const { dom, doc, win, errors } = boot('width-margin.html');
  click(win, '[data-proc="JZ"]');
  assert.deepEqual(errors, []);
  assert.equal(n(doc, '#list-grid tbody tr'), 26);
  assert.match(txt(win, '#head-meta'), /C10B1079/);
  assert.equal(n(doc, '#list-grid thead tr:not(.grp) th'), 3 + 8 + 4);
  click(win, '[data-proc="PLTCM"]');
  assert.equal(n(doc, '#list-grid tbody tr'), 33);
  assert.equal(n(doc, '#list-grid thead tr:not(.grp) th'), 3 + 4 + 4);
  dom.window.close();
});

opt('폭마진량: 공정별 마진 합산 — PLTCM + 정전 2단계', () => {
  const { dom, doc, win, errors } = boot('width-margin.html');
  click(win, '.tab[data-tab="flow"]');
  assert.equal(n(doc, '#flow-inputs .f-field'), 13, '조건 합집합 12 + 주문 폭');
  setVal(win, '#fi-edge', 'S');
  setVal(win, '#fi-prodCd', '1');
  setVal(win, '#fi-bom', 'VH1234');
  setVal(win, '#fi-inwid', '1000');
  click(win, '[data-action="flow-run"]');
  assert.deepEqual(errors, []);
  assert.equal(n(doc, '#flow-steps .flow-step'), 2);
  assert.equal(n(doc, '#flow-grid tbody tr'), 3, '2단계 + 합계');
  assert.match(txt(win, '.flow-total .ft-val'), /^\+?[\d.]+ mm$/);
  dom.window.close();
});

opt('폭마진량: 간편판정 — 정전 마진 46 이 적용된다', () => {
  const { dom, doc, win, errors } = boot('width-margin.html');
  click(win, '[data-proc="JZ"]');
  click(win, '.tab[data-tab="judge"]');
  setVal(win, '#ji-bom', 'UH0K7U');
  setVal(win, '#ji-edge', 'S');
  setVal(win, '#ji-prodCd', '1');
  setVal(win, '#ji-prodForm', 'S');
  setVal(win, '#ji-coatWay', 'X');
  setVal(win, '#ji-thk', '1.0');
  click(win, '[data-action="judge-run"]');
  assert.deepEqual(errors, []);
  const vals = [...doc.querySelectorAll('#judge-result .val')].map((e) => e.textContent.trim());
  assert.deepEqual(vals, ['WM-JZ-020', '+46', '해당 없음', '—'],
    '정전 공정은 원본에 폭 조건이 없다');
  dom.window.close();
});

opt('폭마진량: 코드 범례 — 코드 사전이 나란히 나온다', () => {
  const { dom, doc, win, errors } = boot('width-margin.html');
  click(win, '.tab[data-tab="legend"]');
  assert.deepEqual(errors, []);
  assert.equal(n(doc, '#legend-procbar [data-lproc]'), 2);
  assert.equal(n(doc, '#legend-procbody tbody tr'), 33, '기본 PLTCM');
  assert.ok(n(doc, '#legend-dict > div') > 20, '품명/Edge/제품형태/코팅방식/수지타입 사전');
  dom.window.close();
});

opt('폭마진량: 정전 공정에 룰 등록 → 판정 반영 → 삭제', () => {
  const { dom, doc, win, errors } = boot('width-margin.html');
  click(win, '[data-proc="JZ"]');
  assert.equal(n(doc, '#list-grid tbody tr'), 26);
  click(win, '[data-action="new-rule"]');
  assert.equal(n(doc, '#d-body .cond-form .cl'), 8, '정전 조건 8종');
  setVal(win, '#e-op-edge', '=');
  setVal(win, '#e-v1-edge', 'S');
  setVal(win, '#e-op-prodCd', 'IN');
  setVal(win, '#e-v1-prodCd', '1,2,3');
  setVal(win, '#e-res', '33');
  setVal(win, '#e-no', '27');
  click(win, '[data-action="form-save"]');
  assert.equal(n(doc, '#list-grid tbody tr'), 27);
  assert.equal(txt(win, '#d-title'), 'JZ · 정전폭마진량 · WM-JZ-027');
  click(win, '.tab[data-tab="judge"]');
  setVal(win, '#ji-edge', 'S');
  setVal(win, '#ji-prodCd', '2');
  click(win, '[data-action="judge-run"]');
  assert.equal(doc.querySelectorAll('#judge-result .val')[1].textContent.trim(), '+33');
  assert.deepEqual(errors, [], '런타임 오류');
  dom.window.close();
});
