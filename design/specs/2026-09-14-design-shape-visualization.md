# 설계 형상 시각화 — 설계 문서

작성 2026-09-14. 승인: 사용자 (브레인스토밍 질문 3개 → 표현·배치 브라우저 비교 → 접근법 선택 → 섹션 5개 순차 승인).
대상: `modules/quality-design.html` 설계결과 패널. 정식 프로그램(Next.js + Supabase)으로의 이관 계약을 포함한다.

## 1. 목표와 배경

품질설계원이 "기준값에 의해 설계 결과가 어떻게 완성되는지"를 모른다는 것이 현장의 가장 큰 위험이다.
설계결과 화면은 값을 표(kv 그리드)로만 보여 주어 원자재에서 제품까지의 변환 관계가 드러나지 않는다.
이 문서는 설계결과를 **원자재 핫코일 → 압연 → 도금 → 칼라 → 제품** 다섯 장면의 코일 그림으로 바꾸고,
장면마다 "이 값은 어떤 산식·기준에서 왔는가"를 붙이는 렌더러를 정의한다.

확정된 결정:

| 항목 | 결정 |
|---|---|
| 위치·시기 | 독립 렌더러로 만들어 지금은 목업 설계결과 화면에 탑재. 정식 프로그램에서는 같은 파일을 React로 감싼다 |
| 그림이 말하는 것 | 제품 스냅샷이 아니라 변환 과정 + 근거. 대화형 재계산(기준값 변경)은 범위 밖 |
| 표현 | 2D SVG. 두루마리 코일 그림 + 단면 확대 원. 3D는 범위 밖(같은 모델로 나중에 추가 가능) |
| 배치 | 장면 띠(가로 5칸) + 선택 장면 상세(큰 코일 + 값 목록) |
| 근거 수준(목업 v1) | 산식과 기준 이름만 정직하게 표시. `rule` 종류는 정식 엔진용으로 예약 |
| 구조 | 순수 함수 3층(model / svg / widget) + 빌드 시 마커 주입. 외부 의존 없음 |

## 2. 장면 모델 계약

렌더러의 유일한 입력. 목업과 정식 프로그램이 공유한다.

```
ShapeModel { order: {no, ln, prd, spec, mat}, productType, scenes: Scene[], warnings: string[] }

Scene   { id: 'raw'|'rolled'|'coated'|'painted'|'product', no, title,          // no = 표시 순번(1부터 연속, ④ 생략 시 제품은 4)
          process: {code, name} | null,                 // 예 {code:'1P', name:'PLTCM'}
          geometry: {thk_mm, wid_mm, id_mm|null, weight_t|null},
          layers: Layer[], values: Value[], changes: Change[] }

Layer   { id, kind: 'substrate'|'zinc'|'az'|'am'|'primer'|'topcoat'|'backcoat',
          side: 'core'|'top'|'bottom', thk_um|null, label }

Value   { key, label, value: string|number|null, unit|null, formula|null,
          evidence: { kind: 'rule'|'formula'|'constant'|'manual'|'missing',
                      ref|null, route|null, note|null } }

Change  { key, from, to, delta, unit }                  // 직전 장면 대비 바뀐 값
```

규칙:

- 단위는 모델에서 고정한다. 소지·제품·폭은 mm, 도금·도막 층은 µm. 그림은 과장하되 숫자는 원값을 쓴다.
- `evidence.route`는 포털 해시 문자열이다(예 `#/quality-design/module-management/rolling-thickness-set`).
- 목업 v1은 `formula`·`constant`·`missing`만 만든다. `rule`·`manual`은 정식 엔진이 채운다.
- 층 배열 순서는 위(top)에서 아래(bottom)로 그리는 순서다. `core`는 항상 하나.
- 같은 입력이면 같은 출력이어야 한다(시각·난수 사용 금지).
- `id`는 고정 식별자, `no`는 표시 순번이다. 칼라가 아닌 제품은 `painted`가 없으므로 `product.no = 4`가 된다.

### 2.1 품명 → 층 스택

| prd | productType | 소지 | 도금(양면) | 도장 | 장면 수 |
|---|---|---|---|---|---|
| G | GI | 냉연 | zinc | 없음 | 4 (④ 생략) |
| L | GL | 냉연 | az | 없음 | 4 |
| W | GLX | 냉연 | am | 없음 | 4 |
| 3 | CCGI | 냉연 | zinc | primer + topcoat + backcoat | 5 |
| 4 | CCLI | 냉연 | az | primer + topcoat + backcoat | 5 |
| 그 외 | unknown | 냉연 | 없음 | 없음 | 4, `warnings`에 "층 정의 없음 · 품명 X" |

칼라 품명이라도 설계결과의 `color`가 null이면 ④를 만들지 않고 경고를 남긴다.

### 2.2 목업 설계결과 → 장면 매핑

입력은 `detailOf(order)`가 만든 설계결과 객체 `d`와 주문 행 `o`(`{no, ln, prd, spec, thk, wid, mat, edge, st}`)다.
`d.common`·`d.cgl.pltcm`은 `[라벨, 값]` 배열이므로 **라벨로 찾는다**(refDetail은 행 구성이 다르다).
숫자는 문자열에서 첫 숫자를 방어적으로 파싱하고, 못 찾으면 `missing`으로 둔다.

| 장면 | geometry | layers | values (key · 원천 · formula · evidence) |
|---|---|---|---|
| ① raw 원자재 | thk = `d.cgl.lines[0][3]` (두께목표), wid = `d.cgl.lines[0][6]` (폭목표) | substrate(핫코일, `d.head.mat2`) | `rmtl_cd` 원자재코드 `lines[0][1]` · constant · route 원자재강종 / `rmtl_thk` 두께 · "주문두께 × 4 (목업 고정식)" · formula / `rmtl_wid` 폭 · "주문폭 + 3" · formula / `rmtl_pref` 선호도 `lines[0][2]` · constant |
| ② rolled 압연 | thk = pltcm 'X-Ray Set두께값', wid = pltcm 'Side Trimming Set값(주공정)' | substrate(냉연) | `set_thk` · "주문두께 − 0.020 (목업 고정식 · 기준 룰은 정식 엔진 연결 후)" · formula · route 압연두께Set / `thk_target` 두께목표값(문자열 그대로, 예 "0.43 (0.415 ~ 0.445)") · constant / `trim_wid` · "주문폭 + 6" · formula · route 폭마진량(준비 중) / `wid_shrink` 폭수축값 · constant · route 폭수축량(준비 중) / `wid_target` 폭목표값(주공정) · "주문폭 + 3" · formula / `wr_type` 5Stand WRType, `id_ring` 내경링 · constant |
| ③ coated 도금 | thk = `o.thk` (주문두께, TCT 가정 주석), wid = pltcm '폭목표값(주공정)' | substrate + 도금 top/bottom (`thk_um` = `d.cgl.coat.thk`, 양면 각각) | `coat_cd` 도금량코드(common) · constant / `coat_range` 부착량 하/상 `coat.min`·`coat.max` g/㎡ · constant / `coat_target` 도금목표 `coat.target` g/㎡ · constant / `coat_thk` 도금두께 `coat.thk` µm · constant / `spangle`·`lv`·`skin` · constant / `line` 라인 `d.cgl.ops[0][0]` · constant · route 공정라우팅 |
| ④ painted 칼라 (칼라만) | thk = `d.color.sum.szT`, wid = `d.color.sum.szW` | ③ + primer(Top1 도막), topcoat(Top2~Top4 중 값 있는 것), backcoat(Back1) — `d.color.matrix` 도막두께 행(인덱스 4), 열 [구분, Top4, Top3, Top2, Top1, Back1, …] | `paint_way` 도장방식 `sum.way` / `paint_top` Top 도막 합 `sum.thkT` µm / `paint_back` Back 도막 `sum.thkB` µm / `color_top`·`color_back` 색상코드 `sum.cT`·`sum.cB` / `resin_top`·`resin_back` / 모두 constant · route 칼라BOM(준비 중) |
| ⑤ product 제품 | thk = 칼라면 `sum.szT` 아니면 `o.thk`, wid = `o.wid`, id = common '주문내경/종류' 첫 숫자, weight_t = common '포장단중(하/상)' 첫 숫자 ÷ 1000 | 직전 장면과 동일 | `size` 주문 Actual Size(common) / `thk_range` 제품 두께 범위 `d.tol.base[0][2..3]` / `wid_range` 제품 폭 범위 `d.post.wMin`·`wMax` / `tol` 보증사양 공차 `d.tol.tols[2]` / `coil_id` 내경 / `winding` 권취방법(common) / `pack` 포장방법(common) / 모두 constant |

`process`: ① null, ② `route.rows[0]`('1P - PLTCM'), ③ `route.rows[1]`, ④ `route.rows[2]`, ⑤ `{code:'—', name:'정전·포장'}`.
`changes`: 직전 장면과 `thk_mm`·`wid_mm`가 다르면 각각 1건, 층이 늘면 `{key:'layers', from:n, to:m}` 1건.

가정(목업 값의 의미가 불명확한 곳, 값 옆 각주로 표시):
- `coat.thk`는 "도금목표 두께"로 표시되어 있으나 면당인지 양면 합인지 불명확하다. **면당 µm로 취급**하고 각주 "목업값"을 붙인다.
- ③의 두께를 주문두께로 두는 것은 TCT(도금 포함 두께) 가정이다. 주문두께구분이 BMT면 각주로 "BMT 주문 · 도금 별도"를 붙이되 값은 바꾸지 않는다.
- X-Ray Set은 목업이 소수 2자리(`toFixed(2)`)로 저장한다. 원값 그대로 표시한다(정밀도 교정은 엔진 몫).

## 3. 렌더링 규칙

### 3.1 구성

- **섹션 헤더 요약줄**: `productType · 원자재 t×w → Set t×w → 도금코드 → 도장방식 → 제품 t×w`. 장면이 없으면 해당 항목 생략.
- **장면 띠**: 장면당 칸 하나. 제목("① 원자재" + 작은 공정명), 작은 코일 SVG, 기하 한 줄(monospace, accent 색), 변화량 한 줄(monospace, `--st-fail` 색). 칸 사이 화살표.
- **선택 장면 상세**: 왼쪽 큰 코일(폭 치수선 + 보조 치수 + 단면 확대 원 + 층 라벨), 오른쪽 값 목록(라벨 / 값·단위 / 변화량 / 배지 / 산식 각주) + 층 범례.

### 3.2 코일 SVG

- 몸통 길이는 장면 중 최대 `wid_mm`를 기준으로 비례. 두 장면의 폭이 달라도 차이가 6px 미만이면 6px로 벌린다.
- 몸통 색은 겉층 종류를 따른다. 핫코일 갈색, 냉연 회색, zinc/az/am 청회색, 도장 금색 계열. 색상코드의 실제 색은 표현하지 않는다.
- 왼쪽 끝면에 동심 타원 4개(감긴 띠), 중앙에 내경 구멍. 내경 값이 있으면 구멍 옆에 표시.
- 단면 확대 원: 층 사각형을 위에서 아래로 쌓는다. 두께는 로그 눈금으로 과장하되 소지는 원 높이의 40~55%, 도금·도막은 최소 4px 최대 12px. 각 층 라벨은 원값(µm/mm).
- 모든 SVG에 `<title>`·`<desc>`(예 "압연 코일, Set 두께 0.430, 폭 1496").

### 3.3 색과 강조

| 용도 | 값 |
|---|---|
| 층 색 6개 | 핫코일 `#6B4A3A`, 소지 `#5A6470`, 도금 `#9FB7C3`, 프라이머 `#E0B95E`, Top 코트 `#C9A24B`, Back 코트 `#B8B0A0` (렌더러 상수) |
| 그 외 | 모듈 `:root` 토큰만 사용 (`--accent`, `--result`, `--st-fail`, `--ink-3`, `--border` 등) |
| 변화량 | `--st-fail` 색 monospace |
| 배지 | 기준 화면 있음: accent 배지 / 준비 중: result(갈색) 배지 + "준비 중" / 정식 엔진 전 산식: 회색 각주 |

### 3.4 반응형·접근성

- 패널 폭 720px 미만: 띠는 2줄로 감김, 상세는 그림 위·값 아래 세로 배치.
- 띠는 `role="tablist"`, 칸은 `role="tab"` + `aria-selected`, 방향키(←→)로 이동, Enter/Space 선택.
- 값 행은 포커스 가능(tabindex=0), 포커스·호버 시 산식 각주 강조. 툴팁은 쓰지 않는다(정보를 항상 노출).

## 4. 상호작용과 화면 연결

- `SECS` 배열 맨 앞에 `{id:'shape', t:'설계 형상', sum, body}`를 추가한다. `body`는 컨테이너만 만들고, `renderDetail` 뒤에 `MesShape.mount(el, model, opts)`가 그린다. 기본 펼침. 의뢰 선택이 바뀌면 모델을 다시 만든다.
- 시작 선택 장면은 항상 ②(압연). 칼라가 아니면 ④ 칸을 만들지 않는다(띠 4칸).
- 배지 클릭: iframe 안이면 `window.top.location.hash = route`(시뮬레이션 `jumpTo`와 동일). 단독 실행이면 토스트로 라우트 이름만 안내. 준비 중 화면은 해당 placeholder 라우트로 이동.
- 칸 더블클릭: 상세 그림이 패널 폭 전체로 확대(값 목록은 아래로), 다시 더블클릭하면 복귀.
- 값이 비면 "설계값 없음" + `missing`. 품명 미정의는 소지 1층 + 헤더 경고 배지. 어떤 경우에도 예외로 렌더가 멈추지 않는다(모델 단계에서 try 없이 방어적 파싱).
- 범위 밖: 값 편집, 기준값 변경 재계산, 3D, 인쇄 전용 레이아웃(브라우저 인쇄는 SVG 그대로 됨).

## 5. 파일 구조, 빌드 주입, 테스트

```
assets/shape/
  shape-model.js      buildShapeModel(design, order) → ShapeModel. 층 스택 표·매핑 표·라우트 상수 포함
  shape-svg.js        renderSummary(model), renderStrip(model, selId), renderCoil(scene, opts), renderDetail(scene) → 문자열
  shape-widget.js     mount(el, model, {onNavigate}) → {select(id), destroy()}
  shape.css           .shape-* 스타일. 모듈 토큰 변수만 참조
tests/shape/
  model.test.mjs
  svg.test.mjs
  fixtures/           품명 5종 설계결과 + 주문 (quality-design.html의 genDetail 출력을 그대로 저장)
build/inject_shape.py 마커 주입 (멱등)
```

- 세 JS 파일은 `(function(g){ … g.MesShape = Object.assign(g.MesShape||{}, {...}) })(globalThis)` 형태. 브라우저 전역·Node 양쪽에서 변환 없이 실행된다. 모듈 시스템은 쓰지 않는다(srcdoc 호환).
- `shape-svg.js`는 설계결과 객체를 모른다. `shape-model.js`만 설계결과 필드명을 안다(§2.2 매핑 표가 유일한 참조 지점).
- 마커: `quality-design.html`의 `<style>` 안 `/*__SHAPE_CSS_START__*/ … /*__SHAPE_CSS_END__*/`, `<script>` 안 `/*__SHAPE_JS_START__*/ … /*__SHAPE_JS_END__*/`. `inject_shape.py`는 압연두께Set 시드 주입과 같은 방식(마커 1쌍씩 검증, 구간 치환, 재실행 시 동일 결과).
- 빌드 순서: `python3 build/inject_shape.py` → `python3 build/build_single.py`. `build/README.md` 작업 순서와 파일 표에 추가.

테스트(Node 22 내장 러너, 새 패키지 없음):

- 모델: 품명 G·L·W·3·4에서 장면 수(4/5), 층 스택, geometry, changes가 §2 표대로. 미정의 품명은 경고 1건·소지 1층. 칼라 품명인데 `color` null이면 ④ 없음 + 경고. 빈 값은 `missing`. refDetail 형태(common 45행)에서도 라벨 검색으로 값이 나온다. 결정성(같은 입력 → 깊은 동등).
- SVG: 장면마다 `<title>` 존재, 숫자 라벨이 모델 원값과 일치, 층 사각형 높이 ≥ 4px, 폭이 다른 장면 몸통 길이 차 ≥ 6px, 문자열 이스케이프(`<`, `&`, `"`), 칸 수가 장면 수와 같음.
- 주입: `inject_shape.py`를 두 번 실행해도 파일이 같음. 마커 누락 시 비정상 종료.
- 수동: 주입 후 브라우저에서 의뢰 19건을 순회해 깨짐이 없는지 확인. 자동 E2E는 이 저장소에 도구가 없어 넣지 않는다.
- 구현 순서는 테스트 주도(기능마다 실패 테스트 → 구현 → 통과).

## 6. 정식 프로그램 이관 계약

바뀌는 것은 두 곳뿐이다.

1. `shape-model.js`의 입력이 목업 설계결과에서 서버 설계 실행 결과(단계별 출력 + 근거)로 바뀐다. `evidence.kind`가 `rule`로 올라가고 `ref`에 룰 번호(예 TS-016), `route`에 라우터 경로가 들어간다. Scene·Layer·Value 구조는 그대로다.
2. `shape-widget.js`의 DOM 마운트가 React 컴포넌트로 바뀐다. `shape-svg.js` 출력 문자열을 그대로 쓰거나 같은 함수를 JSX로 옮긴다. 배지 이동은 라우터 링크가 된다.

목업 단계에서 지키는 규칙: 설계결과 필드명은 `shape-model.js` 매핑 표에서만 참조, `shape-svg.js`는 ShapeModel만 안다, 렌더러 상수(색·최소 px)는 한 객체에 모은다.

## 7. 범위 밖(후속 후보)

시뮬레이션 모듈 ⑥설계값 패널에 같은 섹션 재사용 · 3D 보기 · 기준값 변경 후 재렌더 · 인쇄 전용 레이아웃 · 도금 단면의 BMT/TCT 구분 표현 · 라미나(필름) 층 · 원자재 두께의 실제 기준(C10B1071) 연결.

## 8. 산출물 체크리스트

- [x] `assets/shape/{shape-model.js, shape-svg.js, shape-widget.js, shape.css}`
- [x] `tests/shape/{model.test.mjs, svg.test.mjs, fixtures/}`
- [x] `build/inject_shape.py` + `modules/quality-design.html` 마커·`shape` 섹션
- [x] `build/README.md` 갱신, `index.html` 재빌드
- [x] 브라우저 수동 확인 19건

### 검증 기록 (2026-09-14)

- 의뢰 19건 순회(HEAD b9ea706, 단독 페이지 기준 패널 폭 604px): 색상 품명 2건(D260831014-010, D260831032-010)은 띠 5칸(④ 칼라 칸 금색, 층 목록 6개), 나머지 17건은 띠 4칸. ② 압연이 시작 선택. 경고 배지 0, "설계값 없음" 0, 값 행 7개, 큰 코일 정상 표시, 콘솔 오류 0. 두께 1.600 두 건은 요약줄·띠·상세 모두 `6.400×1,099 → Set 1.580 → 제품 1.600`처럼 소수 3자리로 표시. 폭 소수 1217.6(E260814004)은 `1,221 → 1,224 → 1,218`로 정수 반올림 표시. 720px 미만 컨테이너 쿼리에서 `.shape-det`·`.shape-v`가 1열로 전환 확인. 포털(`index.html`)에서도 iframe 섹션 표시, 배지 클릭 시 상위 포털 라우팅, 준비 중 배지는 placeholder 화면으로 이동, 콘솔 오류 0. 클릭·방향키(포커스 이동 포함)·Enter·더블클릭 확대/축소·배지 토스트 등 상호작용 전부 정상.
- 결함 (a) 수정: 띠 칸의 변화량 줄(`.shape-sc-d`, 예 "두께 +0.020 · 폭 −3 · 층 +2")이 `white-space:nowrap`이라 좁은 패널(604px)에서 건당 1~2칸이 잘리고, 넓은 패널(~1040px, 포털)에서는 같은 nowrap 때문에 칸의 최소 폭이 커져 5번째(⑤ 제품) 칸이 다음 줄로 밀려 전체 폭으로 늘어나고 ③/④ 변화량 줄이 "층"에서 잘렸다. `.shape-sc-d`를 `white-space:normal`(+`overflow-wrap:break-word`, 압축된 `line-height`)로 바꿔 2줄로 자연스럽게 줄바꿈되게 하고, 5칸이 여유 있게 들어가도록 `.shape-sc`의 `flex-basis`/`min-width`를 120px→108px로 소폭 줄였다. §3.1(기하 한 줄·변화량 한 줄)과 §3.4(720px 미만 2줄 감김)의 계약은 그대로 유지된다. 재현 테스트를 `tests/shape/widget.test.mjs`에 추가(CSS 텍스트를 읽어 `.shape-sc-d` 규칙에 `white-space:nowrap`이 없는지 확인) → 수정 전 실패, 수정 후 41/41 통과 확인.
- 결함 (a) 재확인·2차 수정: 컨트롤러가 604px에서 재검증한 결과, 넓은 패널(1123px)과 좁은 패널(604px)의 4칸 주문은 모두 정상이었으나 5칸(칼라) 주문의 ② 압연 칸에서 기하 한 줄(`.shape-sc-g`, 예 "Set 0.430 × 1,496")이 여전히 `white-space:nowrap`이라 셀 폭(109px)보다 넓은 내용(112px)이 마지막 자리에서 잘렸다. `.shape-sc-g`도 `.shape-sc-d`와 같이 `white-space:normal`(+`overflow-wrap:break-word`, `line-height:1.2`)로 바꿔 줄바꿈을 허용하고, 5칸이 이제 두 줄 모두 감기더라도 ~1000px 폭에서 한 줄에 들어가도록 `.shape-sc`의 `flex-basis`/`min-width`를 108px→120px로 되돌렸다(5×120 + 화살표 4개 + 간격 ≈ 704px, 여유 있음). 재현 테스트를 확장해 `.shape-sc-g`·`.shape-sc-d` 두 규칙 모두 `white-space:nowrap`이 없는지 확인 → 수정 전 `.shape-sc-g`에서 실패(40/41), 수정 후 41/41 통과.
- 이월 사소 결함(수정하지 않음): (b) 폭수축값이 `fmtMm`의 100 미만 3자리 규칙 때문에 "3.000 mm"로 표시됨(포맷 규칙 자체는 사양대로 동작). (c) 섹션 헤더 요약줄이 모듈 기존 `.sum` 스타일에 의해 말줄임표로 잘림(섹션 공통 스타일, 이 렌더러 범위 밖).
