# MES To-Be Portal — 빌드 안내

배포되는 `index.html`(저장소 루트)은 **직접 수정하지 않는다.**
아래 소스 3종을 수정한 뒤 빌드 스크립트로 재생성한다.

## 소스 구조

| 파일 | 역할 |
|---|---|
| `modules/master-code.html` | 마스터데이터 > 마스터코드 (마스터별 목록·검색·상세·등록·수정, 아이디/한글명/등록일자/등록자명/시작일자/종료일자와 코드·코드명·카테고리(ID/명) 다중 항목, 상세 화면 카테고리·항목별 조회, 브라우저 저장 및 기존 데이터 호환) |
| `modules/quality-spec.html` | 품질사양 관리 모듈 (사양 목록·신규 등록·코드 사전·변경 이력·전송 이력·시뮬레이션 — 화면/기능의 대부분) |
| `modules/raw-material-grade.html` | 원자재강종관리 모듈 (조건(품명·규격약호·주문용도·두께범위) → 결과(재질코드·적정/차선원료·메시지) 룰 관리 — 도금(G)↔칼라(3) 원판연계: 도금기준/칼라파생/칼라전용, 파생 룰 재질·적정원료 상속, 원판 변경 시 재검토 플래그, 간편판정·변경 이력·코드 범례) |
| `modules/spec-code.html` | 규격약호관리 모듈 (규격코드 조건 → 결과 기준 2종: 규격코드→두께관리기준(BMT/TCT), 규격코드+강종코드→원판강종코드 — 목록·등록·수정·삭제, 간편조회, 변경 이력, 코드 범례. 데이터 접근은 `repo` 객체(localStorage)로 분리해 DB 연동 시 내부만 교체) |
| `modules/process-routing.html` | 공정라우팅관리 모듈 (조건 8항목(제품군·재질코드·엠보스무늬·Spangle구분·도금량코드·표면처리코드·두께범위·폭범위) → 결과(냉연도금공정) 룰 관리 — 문자/숫자범위 연산자(NOT_CHECK·BETWEEN1~4 등), 등록·수정·삭제·간편판정·변경 이력·코드 범례. 시드는 공정라우팅모듈.xlsx 룰 2건) |
| `modules/rolling-thickness-set.html` | 압연두께Set보정관리 모듈 (AS-IS 업무기준 C10B2060 룰 82건 — 조건 10종(품명·규격기관·규격약호·주문용도·고객사·주문두께구분·두께관리코드·도금량코드·두께/폭범위) → 두께보정치·단위. 목록·등록·수정·삭제, 간편판정(Set 두께 계산), 변경 이력, 코드 범례. 시드는 `build/rolling_thickness_set_seed.py`가 `/*__RTS_SEED_START__*/` 마커 구간에 주입) |
| `modules/quality-design.html` | 품질설계 모듈 (좌: 의뢰현황 목록 · 우: 설계결과 — 구 탭 9종을 펼치기/접기 섹션으로 통합) |
| `assets/shape/shape-model.js` · `shape-svg.js` · `shape-widget.js` · `shape.css` | 설계 형상 렌더러 (설계결과 → 장면 모델 → 코일 SVG·값 목록 → DOM). 전역 `MesShape`. `build/inject_shape.py`가 `quality-design.html` 마커 구간(`/*__SHAPE_CSS_START__*/`, `/*__SHAPE_JS_START__*/`)에 주입. 테스트 `node --test tests/shape/*.test.mjs`. 설계: `design/specs/2026-09-14-design-shape-visualization.md` |
| `build/inject_shape.py` | 위 4파일을 `modules/quality-design.html`에 주입(멱등). `--check`는 최신 여부만 확인 |
| `modules/order-weight-error.html` | 주문단중에러관리 모듈 (주문단중 × 분할 수 매트릭스 — Min/Max 허용범위 하이라이트·셀 수정·수정 이력) |
| `modules/production-feasibility.html` | 생산가부관리 모듈 (B.D 생산범위(2CGL GI) 탭 — 참조 엑셀 시트 재현: 재질별 폭 × 두께 가부 매트릭스·가부 간편조회·셀 상태 수정·수정 이력) |
| `modules/simulation.html` | 품질설계 시뮬레이션 모듈 (주문 1건을 ①입력검증 ②주문정합성 ③주문단중 ④생산가부 ⑤품질사양매칭 ⑥설계값산출 6단계에 태워 기준 반영을 추적 — 좌: 검증 케이스·주문 입력·변경 이력, 중: 파이프라인 단계 상세·기대값 대조, 우: 근거 추적 3층·이상징후. 기준 데이터는 다른 모듈의 localStorage를 먼저 읽고 없으면 내장 축약 시드 사용) |
| `modules/order-consistency.html` | 주문정합성체크 모듈 (엑셀 룰 2종을 정제·병합한 통합 룰셋 138건 — 룰 목록·조건 빌더·주문 시뮬레이션·검토 이슈·코드 사전·변경 이력 6탭. 시드는 `build/clean_rules.py --inject`가 `/*__OC_SEED_START__*/` 마커 구간에 주입) |
| `modules/quality-judgment.html` | 품질판정 1차 화면 (판정 대기 목록 · 검사값 vs 기준값 drawer · 합격/불합격/보류) |
| `modules/quality-certificate.html` | 품질보증서관리 1차 화면 (발행 목록 · 보증 항목 · A4 보증서 미리보기/인쇄) |
| `assets/report/report-model.js` · `report-doc.js` · `report.css` | A4 리포트 렌더러 0단계 (발행 목록 1행 → 문서 모델 → 실측 페이지 분할 → A4 시트 DOM → 브라우저 인쇄/PDF). 전역 `MesReport`. `build/inject_report.py`가 `quality-certificate.html` 마커 구간(`/*__REPORT_CSS_START__*/`, `/*__REPORT_JS_START__*/`)에 주입. 테스트 `node --test tests/report/*.test.mjs` |
| `build/inject_report.py` | 위 3파일을 `modules/quality-certificate.html`에 주입(멱등). `--check`는 최신 여부만 확인 |
| `modules/inspection-certificate.html` | 검사증명서관리 1차 화면 (MTC 목록 · 기계적성질 · 화학 성분) |
| `modules/tag-management.html` | Tag관리 1차 화면 (Tag 발행 목록 · Tag 레이아웃 미리보기) |
| `build/template.html` | 포털 셸 (사이드바 메뉴, 해시 라우팅 뼈대, iframe 자리) |
| `assets/portal.css` · `assets/portal.js` | 포털 셸의 스타일·동작 (사이드바 접기, 라우팅, 모바일 서랍) |

## 빌드

```bash
python3 build/build_single.py
```

`build/template.html`에 CSS/JS를 인라인하고 `modules/` 아래 모든 모듈(품질사양·원자재강종·규격약호·압연두께Set보정·공정라우팅·품질설계·주문단중에러·생산가부·주문정합성체크·시뮬레이션·품질판정·품질보증서·검사증명서·Tag·마스터코드)을 iframe `srcdoc`으로 내장해
루트 `index.html` 하나로 만든다. GitHub Pages는 이 파일 하나로 동작한다.

## A4 리포트 렌더러 (품질보증서 — 0단계)

`assets/report/`는 OZ Report 같은 상용 리포트 툴을 대신할 **자체 리포트 엔진의 0단계**다.
양식은 아직 JSON이 아니라 코드에 고정돼 있고(1단계에서 양식 스키마로 분리), 품질보증서 1종만 그린다.

```bash
python3 build/inject_report.py --check   # 주입 구간이 assets/report 와 같은지 확인
python3 build/inject_report.py           # 주입(멱등)
node --test tests/report/*.test.mjs      # 모델 + 페이지 분할 + 주입 드리프트
```

**설계 — 렌더링 엔진을 직접 만들지 않는다.** 페이지를 실제로 그리는 일은 브라우저(Chromium)에
맡기고, 우리는 "무엇을 어느 장에 올릴지"만 정한다. 미리보기와 인쇄가 같은 CSS·같은 엔진을 타므로
화면과 출력이 어긋나지 않는다.

**2-pass 렌더.** 크롬은 `@page` 여백 상자(`@bottom-right` 등)를 지원하지 않아 `N / M` 페이지 번호를
CSS로 찍을 수 없고, 장마다 소계를 넣는 것도 CSS로는 불가능하다. 그래서

1. 숨은 컨테이너(`.rp-measure`)에 전부 그려 블록·표 행의 실제 높이를 잰다 (`report-doc.js` `measure`)
2. 측정값만 받는 순수 함수로 장을 나눈다 (`report-model.js` `paginate` — DOM 없이 테스트 가능)
3. 장별로 머리글·바닥글·소계를 붙여 다시 그린다 (`renderPages`)

웹폰트가 측정 뒤에 도착하면 행 높이가 달라져 장 나눔이 어긋나므로 `document.fonts.ready` 후 한 번 더 그린다.

**인쇄.** `@page{size:A4;margin:0}` + 시트 `210mm × 296.8mm`(297mm로 딱 맞추면 반올림 때문에 빈 장이
한 장 더 나오는 브라우저가 있다). 인쇄 규칙은 `body.rp-on`(미리보기 열림)으로 한정해, 미리보기를 닫은
상태의 Ctrl+P가 빈 종이를 뱉지 않게 한다. 포털에서는 모듈이 같은 출처 `srcdoc` iframe 안에서 돌고,
프레임 안에서 부른 `window.print()`는 그 프레임 문서만 인쇄한다.

**검증.** 실제 Chromium으로 시드 9건 + 코일 수 1·2·12·24·37·60·120·200에 대해 «미리보기 장수 ==
인쇄 PDF 장수», «어느 장도 `overflow:hidden`에 잘린 내용이 없음», «페이지 번호·총계·서명란 각 1회»를
확인했다. 200코일 → 7장까지 일치한다.

**아직 없는 것 (1단계 이후).** 양식 JSON 스키마·양식 편집기, 서버 렌더링(headless Chromium)과 대량
배치, 발행본 스냅샷·전자서명·QR 검증, 검사증명서·Tag 라벨(라벨 프린터는 PDF가 아니라 ZPL 직결이라
별도 경로다).

## 룰 시드 파이프라인 (주문정합성체크 모듈 전용)

`modules/order-consistency.html`의 룰 데이터는 손으로 쓰지 않는다. 원본 xlsx 2종을
`build/clean_rules.py`가 파싱·클렌징·병합해 시드 JSON을 만들고, 모듈의 마커 구간에 주입한다.

**필수 입력 — 저장소에 포함되지 않는다.** 원본 xlsx 2종(`주문에러체크.xlsx` C10B2220 /
`항목간주문에러체크.xlsx` C10B2221)은 사내 기준정보 원본이라 커밋하지 않는다(`.gitignore: sources/`).
신규 클론에서는 아래 중 하나로 공급해야 시드 재생성이 가능하다.

| 방법 | 사용 |
|---|---|
| 저장소 `sources/` 에 배치 (권장·기본 탐색 경로) | `mkdir -p sources && cp <원본 2종> sources/` |
| 환경변수 | `OC_XLSX_DIR=<디렉토리> python3 build/clean_rules.py --check` |
| 옵션 직접 지정 | `python3 build/clean_rules.py --order <경로> --cross <경로> --check` |

없이 실행하면 `FAIL: 입력 파일 없음: …` 과 함께 위 세 방법을 안내하고 exit 1 한다.
xlsx 없이도 기존 시드(`build/order_consistency_seed.json`)가 이미 모듈에 주입돼 있으므로
`build_single.py` 재빌드는 가능하다 — 다만 **룰 내용은 바뀌지 않는다.**

```bash
python3 build/clean_rules.py --check --emit --inject   # 어서션 → 시드 생성 → 모듈 주입(멱등)
```

## 룰 시드 파이프라인 (압연두께Set보정관리 모듈)

`modules/rolling-thickness-set.html`의 룰 데이터도 손으로 쓰지 않는다. 원본 `압연두께Set치보정기준.xlsx`
(RuleData C10B2060)를 `build/rolling_thickness_set_seed.py`가 파싱·정규화(연산자 대문자화, 목록 공백 제거,
`+0.055` 같은 부호 표기 숫자화)해 `build/rolling_thickness_set_seed.json`을 만들고 모듈 마커 구간에 주입한다.
원본은 `sources/`(gitignore)에 두거나 `RTS_XLSX` 환경변수 · `--xlsx` 옵션으로 지정한다. 룰에는 고객사 코드값만
있고 실명은 없어 마스킹 단계가 없다.

```bash
python3 build/rolling_thickness_set_seed.py --check --emit --inject   # 어서션(82건) → 시드 생성 → 모듈 주입(멱등)
python3 build/rolling_thickness_set_seed.py --inject                  # xlsx 없이 기존 JSON 재주입
```

### 고객사 실명 마스킹 (공개 저장소 배포)

이 저장소는 공개이므로 시드에 고객사 실명을 남기지 않는다. 원본 xlsx를 커밋하지 않는 것과
같은 방침을, 원본에서 파생된 시드에도 적용한다. 룰 로직·코드값·임계값은 그대로 두므로
목업 검증 목적은 유지된다 — 바뀌는 것은 에러 메시지의 회사명과 코드 사전 라벨뿐이다.

대응표(`실명 → 별칭`) 자체가 실명을 담으므로 저장소에 두지 않고 `sources/mask_map.json`
(gitignore 대상)에서 읽는다.

```json
{
  "names": [["<실명>", "수요가 A"]],
  "codes": {"110141": "수요가 A"}
}
```

- `names` — 에러 메시지·계보 원문에서 치환할 문자열. 긴 이름부터 적용된다.
- `codes` — 고객 필드(`FNL_CUS_CD`·`CUS_CD`·`ACT_CUS_CD`) 코드값에 붙일 별칭 라벨.
  룰이 실제로 참조하는 코드에만 라벨이 생성된다.

맵이 없으면 무엇을 가려야 하는지 알 수 없으므로 `PipelineError`로 중단한다 — 실명이 실린
시드가 실수로 만들어지는 것을 막기 위한 것이다. 사내 배포용으로 실명을 살리려면
`--no-mask` 를 쓰되, **그 산출물은 공개 저장소에 커밋하지 않는다.**

## 작업 순서

0. (룰 데이터를 바꿀 때만) 원본 xlsx 2종 확보 → `python3 build/clean_rules.py --check --emit --inject`
1. 소스 수정 (모듈 화면·기능은 `modules/*.html`)
1-1. (설계 형상 렌더러를 고쳤을 때만) `node --test tests/shape/*.test.mjs` → `python3 build/inject_shape.py`. 설계결과 산식(genDetail/refDetail)을 고쳤으면 `node tests/shape/fixtures/gen.mjs` 로 픽스처 재생성
2. `python3 build/build_single.py` 로 `index.html` 재생성
3. 브라우저에서 `index.html` 열어 확인
4. `git add -A && git commit` → `git push` (푸시는 GitHub 토큰 필요)

## 주요 구현 메모

- 목업 데이터는 브라우저 localStorage에만 저장 (`LS_KEY` 버전을 올리면 시드로 초기화됨)
- 마스터코드는 `mes-master-codes-v2` 사용. v2 데이터가 없고 v1이 있으면 v1을 읽어 코드에 카테고리(ID/명) 빈 값을 채운다.
  AS-IS 이관분(`asIsImports`: `ORD_THK_MNG_CD`·`THK_COR_UNT`·`PRD_NM_CD`)은 저장 데이터가 이미 있어도 `mes-master-codes-imported` 마커에 없는 것만 한 번 합류시킨다
  — 사용자가 지운 이관분·기존 시드는 되살리지 않는다. 이관분을 늘릴 때는 시드에 추가하고 `asIsImports` 끝에 id를 붙인다
- 페이지 크기(10/20)는 `qspec-pagesize` 키로 별도 저장
- 변경 이력은 사양과 독립된 `state.changelog`에 전/후 값을 보존 (삭제돼도 유지)
- 엑셀 다운로드는 외부 라이브러리 없이 xlsx(zip)를 직접 생성
- 모듈은 iframe 내부(embedded)에서 자기 상단바를 숨김 — 단독 실행 시엔 표시
- 조회 화면들은 `.fixed-grid` 내부 스크롤로 조회조건·컬럼 헤더 고정
- 코드 사전: 구분·사용 여부·키워드 조회 지원, 항목별 데이터 타입·자리수 관리 (예: VARCHAR2(8) — DATE는 자리수 없음)
