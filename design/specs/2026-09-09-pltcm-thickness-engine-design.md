---
title: "PLTCM 압연 SET 두께 계산 엔진 설계"
subtitle: "시뮬레이션 ⑥ 설계값 산출을 실제 계산으로 바꾸기 (1단계 스펙)"
date: "2026-09-09"
status: draft (검토 반영 1차)
---

# 0. 목적과 결정 사항

## 0.1 목적

시뮬레이션 모듈의 ⑥ 설계값 산출에서 **X-Ray Set두께값**과 **두께목표값(하한~상한)**을 고정식(`주문두께 − 0.02`)이 아니라, 등록된 기준데이터와 주문·사양 데이터를 입력으로 하는 **실제 계산 결과**로 바꾼다. 계산 로직은 [PLTCM 압연 SET 해설서](../PLTCM_압연SET_logic.md)(이하 해설서)의 c10 코드 분석을 따른다.

나중에 실DB를 구성하고 실적 SET값과 비교 검증할 것을 전제로, 엔진은 화면·저장소와 분리된 순수 함수로 만들고 저장 컬럼에 해당하는 출력에는 AS-IS 컬럼명을 쓴다.

## 0.2 브레인스토밍에서 확정한 결정

| # | 질문 | 결정 |
|---|---|---|
| 1 | 엔진이 따를 기준 | **AS-IS 코드 동작 그대로 재현.** 특이 분기·절삭 순서·관리코드 5·6 특례·빈 분기→0까지 재현하고, 특이 동작은 경고로 표시 |
| 2 | 없는 기준표 3종(SP보정율·도금량코드·PLTCM공차) | **원본 xlsx를 받아** 압연두께Set보정과 같은 시드 파이프라인으로 모듈 신설. 단, 이번 스펙에서는 임시 시드로 자리만 잡고 모듈은 다음 스펙 |
| 3 | 고객요청압연두께 값·단위 위치 | **품질사양 관리의 코드 사전 항목**으로 추가. ⑤ 사양 매칭 결과가 ⑥ 계산으로 흐른다 |
| 4 | 주문두께구분(1/2/3) 출처 | **주문 필드가 엔진 입력.** 케이스 생성 시 규격약호관리의 BMT/TCT 기준으로 기본값을 채우고, 주문값과 다르면 경고 |
| 5 | 화면 두 값의 의미 | X-Ray Set두께값 = `PLTCM_SET_THK_TRV`(0.005 눈금 SET). 두께목표값 = `PLTCM_THK_TRV`(출측두께). 범위 = SET + C10B2190 부호 있는 공차 |
| 6 | 접근안 | **공유 순수 엔진 + 빌드 주입** (접근안 A). 2단계 분할 |

## 0.3 범위

**이번 스펙(1단계)**
- 계산 엔진 `assets/pltcm-thickness-engine.js`와 단위 테스트
- 시뮬레이션 ⑥ 연결, 근거 표시, 오류·경고의 이상징후 연동, 회귀 케이스
- 품질사양 코드 사전 항목 2개 추가
- 주문두께구분 기본값·검증 (규격약호관리 연동)
- SP보정율·목표도금두께·PLTCM공차의 **임시 시드**와 provider 계약 확정
- 압연두께Set보정관리의 간편판정 문구 정정
- 빌드 스크립트 `build/inject_engine.py`, 압연두께Set 시드 스크립트의 시뮬레이션 주입 확장, README 갱신

**다음 스펙(2단계, xlsx 도착 후)**
- SP보정율관리(C10B2070), 도금량코드관리(목표도금량·도금두께), PLTCM두께공차관리(C10B2190) 모듈 3종과 시드 파이프라인
- 시뮬레이션 기준 조회를 임시 시드에서 라이브 모듈로 교체 (4.7의 provider 계약대로 `loadCriteria`만 수정)
- 규격기관·도금량코드 체계 통일, 시뮬레이션 주문 시드의 도금량코드 정정

**범위 밖**
- 반복주문 복사, 구매반제품 차선 복사 경로 (다른 주문 참조가 필요)
- 제조표준 C10B1051 조회와 설계 저장 성공 판정(KK13/KK14)
- 품질설계 모듈(`quality-design.html`)의 고정값 교체
- 생산가부 `DbSearchPrdInqchkData`의 `ROL_TAR_THK` 산식 (해설서 10장. 이 엔진의 압연목표와 다른 값)
- 화면 수동 수정에 따른 SET 재계산(TAB05 동작)

# 1. 아키텍처

## 1.1 파일 구성

| 파일 | 역할 |
|---|---|
| `assets/pltcm-thickness-engine.js` | 계산 엔진. DOM·localStorage 의존 없음. 브라우저 전역 `PltcmThicknessEngine`과 CommonJS `module.exports` 둘 다 노출 |
| `build/inject_engine.py` | 엔진 파일을 모듈의 마커 구간 `/*__PLTCM_ENGINE_START__*/ … /*__PLTCM_ENGINE_END__*/`에 복사. `--check`로 멱등성 검사 |
| `build/rolling_thickness_set_seed.py` | 대상을 목록으로 바꿔 압연두께Set보정관리 모듈과 시뮬레이션 모듈(`/*__RTS_SEED_START__*/ var SEED_RTS=…`) 두 곳에 같은 시드를 주입. `--check`가 두 사본과 JSON의 일치를 검사 |
| `modules/simulation.html` | 엔진 마커 구간, RTS 시드 마커 구간, 어댑터, 임시 시드, ⑥ 근거 밴드, 이상징후 연동 |
| `modules/quality-spec.html` | 코드 사전 항목 2개 추가와 한 번 합류 로직 |
| `modules/rolling-thickness-set.html` | 간편판정·범례·안내 문구 정정 |
| `tests/pltcm-thickness-engine.test.js` | `node:test` 골든 테스트 |
| `build/README.md` | 엔진 주입·시드 이중 주입·테스트 절차와 Node 20+ 요구 추가 |

`build/build_single.py`는 변경하지 않는다. 모듈 파일 자체에 엔진 사본이 들어 있으므로 srcdoc 내장과 단독 실행 모두 같은 코드를 쓴다.

**엔진 파일의 형태.** 마커 구간은 시뮬레이션의 `<script>` 안에 있고 엔진이 그 자리에 통째로 들어간다. 따라서 엔진 파일은 최상위 선언 없이 **하나의 UMD 표현식**이어야 한다.

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PltcmThicknessEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () { /* … */ return api; });
```

시뮬레이션 스코프에 새로 생기는 전역은 `PltcmThicknessEngine` 하나뿐이어야 한다 (5.1에서 검사).

## 1.2 주입 규칙

- 엔진의 유일한 원본은 `assets/pltcm-thickness-engine.js`다. 모듈 안의 사본은 손으로 고치지 않는다.
- `python3 build/inject_engine.py`는 대상 모듈 목록(초기값: `simulation.html`)의 마커 구간을 원본으로 치환한다. 마커가 없으면 오류로 중단한다.
- `python3 build/inject_engine.py --check`는 사본과 원본이 다르면 exit 1.
- **줄끝 처리.** 이 저장소는 Windows에서 `core.autocrlf=true`로 체크아웃된다. 원본과 모듈을 모두 `newline=None`(유니버설)로 읽어 LF 기준으로 비교·치환하고, 쓸 때는 모듈 파일이 원래 쓰던 줄끝을 유지한다. 시드 이중 주입에도 같은 규칙을 적용한다.
- 작업 순서: 엔진 수정 → `node --test "tests/**/*.test.js"` → `inject_engine.py` → (룰 변경 시) `rolling_thickness_set_seed.py --inject` → `build_single.py` → 브라우저 확인.

## 1.3 데이터 흐름

```
케이스 주문(order) ─┐
⑤ 사양 매칭 rows ──┼─ toThicknessInput() ─→ input ─┐
⑥ 설계 결과(design) ┘                              ├─ PltcmThicknessEngine.design() ─→ result
loadCriteria() ─→ ctx.thk (기준 3종 + 도금두께 map) ┘                                  │
                                                        design.cgl.pltcm 값 교체 ◄──────┤
                                                        design.cgl.thk = 값·경로 ◄──────┤
                                                        stage6.detail.thkCalc = result ◄┤
                                                        anomalies(오류·경고) ◄───────────┘
```

기준 데이터는 시뮬레이션의 기존 `loadCriteria` 패턴(라이브 우선, 내장 시드 폴백)을 확장한다. 라이브 여부는 `ctx.thk.<기준>.live`에 남겨 화면이 "임시 시드"를 표시할 수 있게 한다.

| 기준 | 라이브 출처 (localStorage 키) | 폴백 |
|---|---|---|
| C10B2060 보정 룰 | `rts-mock-v1` (압연두께Set보정관리) `rules` | `SEED_RTS` (시드 스크립트가 주입한 사본). 압연두께Set보정관리의 `repo.seed()`와 같은 규칙으로 정규화: `id:'TS-'+pad3(순서+1)`, `unit` 기본 `CRN`, `status` 기본 `Y`, 누락 조건 키는 `NOT_CHECK` |
| 규격코드→BMT/TCT | `spec-code-mock-v1` (규격약호관리) `thkRules` | 내장 6건 (KS·JIS→BMT, ASTM·EN→TCT, AS→BMT, BIS 미확정) |
| 고객요청압연두께·단위 | `qspec-mock-v4` ⑤ 매칭 결과 | 매칭 없음 → 값 0, 단위 공백 |
| SP 보정율 (C10B2070) | 다음 스펙 모듈 (4.7 계약) | 임시 시드: 룰 0건 (조회 0건 → 0% + 경고) |
| 도금량코드→목표도금두께 | 다음 스펙 모듈 (4.7 계약) | 임시 시드: 현재 `COAT_RANGE` 상수 이관 |
| PLTCM 두께공차 (C10B2190) | 다음 스펙 모듈 (4.7 계약) | 임시 시드: 전건 ±0.015 룰 1건 |

# 2. 엔진 인터페이스

## 2.1 호출

```js
const result = PltcmThicknessEngine.design(input, criteria);
```

동기 순수 함수다. 같은 입력이면 같은 출력이며 **어떤 입력에도 예외를 던지지 않는다.** `design(undefined, undefined)`도 `ok:false`를 돌려준다. 입력 결함은 `result.error`로 돌려준다.

## 2.2 input

```js
input = {
  order: {
    PRD_NM_CD:      '3',        // 품명코드
    SPC_ORG_CD:     'KS',       // 규격기관 (SPC_AVR 앞 2글자)
    SPC_AVR:        'KS3-CGCC', // 규격약호
    ORD_USG_CD:     'G0493P',   // 주문용도
    FNL_CUS_CD:     '110197',   // 고객사
    ORD_THK_TP:     '1',        // 주문두께구분 1 BMT · 2 TCT · 3 칼라TCT
    ORD_THK_MNG_CD: 'D',        // 두께관리코드
    GW_ASG_CD:      'E',        // 도금량코드
    ORD_EXC_THK:    0.45,       // 주문두께 mm (number)
    ORD_EXC_WTH:    1490,       // 주문폭 mm (number)
    ORD_SLIT_GRP_CNT: 0,        // 슬리팅 그룹수 (number)
    ORD_MIX_WTH:    [],         // 슬리팅 폭 최대 10개 (number[])
    MAT_CD:         '1A',       // 재질 (SP 조회)
    ORD_SPNL_TP:    '4'         // Spangle 구분 (SP 조회)
  },
  request: { value: 0, unit: '' },   // 고객요청압연두께 값(mm)·단위 CRN|PCN|TRK|''
  layers:  { galThkUm: 12, paintFrontUm: 25, paintBackUm: 5 }  // µm. 없으면 0
};
```

**정규화 규칙**
- 주문 항목 키는 AS-IS 컬럼명이다.
- **코드 항목**(`PRD_NM_CD`, `SPC_ORG_CD`, `SPC_AVR`, `ORD_USG_CD`, `FNL_CUS_CD`, `ORD_THK_TP`, `ORD_THK_MNG_CD`, `GW_ASG_CD`, `MAT_CD`, `ORD_SPNL_TP`)은 `String(x).trim()`으로 정규화해 **문자열로 비교**한다. `null`·`undefined`는 `''`다.
- **숫자 항목**(`ORD_EXC_THK`, `ORD_EXC_WTH`, `ORD_SLIT_GRP_CNT`, `ORD_MIX_WTH[]`, `request.value`, `layers.*`)은 `parseFloat`로 정규화한다.
- `ORD_EXC_THK`가 유한한 양수가 아니면 `E_INPUT` 오류다.
- `request.value`가 유한수가 아니면(NaN·null·`''`) **0으로 보고** `W_REQUEST_INVALID` 경고를 남긴다. 0은 미지정이다 (AS-IS와 동일). `request.unit`은 `String(x).trim().toUpperCase()`.
- `layers.*`가 유한수가 아니면 0이다.
- `layers`는 AS-IS에서 앞 단계 설계값(`GAL_THK_TRV`, 도막두께)이므로 엔진이 조회하지 않고 입력으로 받는다.

## 2.3 criteria

기준표 3종. 각 기준표는 **조건 정의 `defs`와 룰 배열 `rules`**를 가진다.

```js
criteria = {
  setCorrection: { defs: [...], rules: [...] },  // C10B2060 → 결과 adj(mm 또는 %), unit
  spCorrection:  { defs: [...], rules: [...] },  // C10B2070 → 결과 rate(%)
  thkTolerance:  { defs: [...], rules: [...] }   // C10B2190 → 결과 llv, ulv (부호 있는 mm)
};
```

`criteria`가 없거나 기준표·`rules`가 배열이 아니면 `E_CRITERIA` 오류다.

**조건 정의** `defs[i] = { key, num, src }`. `key`는 룰의 `cond` 키, `num`은 숫자 비교 여부, `src`는 엔진 입력에서 값을 읽을 경로다. 경로는 `order.*`, `request.*`, `layers.*`, 그리고 엔진이 계산한 `derived.applyWidth`, `derived.crmThk`, `derived.setThk`를 쓸 수 있다. `defs`가 `null`·`undefined`이면 엔진의 `DEFAULT_DEFS`를 쓴다. 빈 배열 `[]`은 "조건 없음"(전건 후보)이다.

```js
DEFAULT_DEFS.setCorrection = [
  {key:'prod',    num:false, src:'order.PRD_NM_CD'},
  {key:'org',     num:false, src:'order.SPC_ORG_CD'},
  {key:'spec',    num:false, src:'order.SPC_AVR'},
  {key:'use',     num:false, src:'order.ORD_USG_CD'},
  {key:'cust',    num:false, src:'order.FNL_CUS_CD'},
  {key:'thkKind', num:false, src:'order.ORD_THK_TP'},
  {key:'thkMng',  num:false, src:'order.ORD_THK_MNG_CD'},
  {key:'coat',    num:false, src:'order.GW_ASG_CD'},
  {key:'thk',     num:true,  src:'order.ORD_EXC_THK'},
  {key:'wid',     num:true,  src:'derived.applyWidth'}
];
DEFAULT_DEFS.spCorrection = [
  {key:'prod', num:false, src:'order.PRD_NM_CD'},
  {key:'mat',  num:false, src:'order.MAT_CD'},
  {key:'spg',  num:false, src:'order.ORD_SPNL_TP'},
  {key:'thk',  num:true,  src:'order.ORD_EXC_THK'},
  {key:'wid',  num:true,  src:'derived.applyWidth'}
];
DEFAULT_DEFS.thkTolerance = [
  {key:'prod',   num:false, src:'order.PRD_NM_CD'},
  {key:'setThk', num:true,  src:'derived.setThk'},
  {key:'wid',    num:true,  src:'derived.applyWidth'}
];
```

`spCorrection`·`thkTolerance`의 기본 정의는 해설서가 밝힌 조회 조건에서 출발한 **잠정안**이다. xlsx가 오면 조건 열을 `defs`로 늘리며, 엔진 코드는 바뀌지 않는다.

**룰 형태**는 압연두께Set보정관리의 룰과 같다.

```js
rule = { id:'TS-001', no:1, status:'Y',
         cond: { prod:{op:'IN',v1:'3',v2:''}, thk:{op:'BETWEEN2',v1:0.1,v2:9.999}, … },
         adj:-0.04, unit:'CRN' }        // setCorrection 결과
       // spCorrection 결과: rate:0.8   thkTolerance 결과: llv:-0.010, ulv:0.015
```

- `status`가 `'Y'`인 룰만 후보다. `cond`가 없거나 `cond`에 없는 조건 키는 `NOT_CHECK`로 본다. `id`는 선택 항목이며 없으면 `''`로 다룬다.
- 연산자 **18종**(문자 10 + 숫자 11, 공통 3)의 의미는 압연두께Set보정관리의 `evalText`·`evalNum`과 같다.

| 구분 | 연산자 |
|---|---|
| 문자 | `NOT_CHECK` `=` `!=` `IN` `NOT_IN` `LIKE1` `LIKE2` `LIKE3` `NOT_NULL` `IS_NULL` |
| 숫자 | `NOT_CHECK` `=` `!=` `>` `>=` `<` `<=` `BETWEEN1` `BETWEEN2` `BETWEEN3` `BETWEEN4` |

문자 비교는 trim·대문자, `IN`은 쉼표 목록, 숫자 비교는 `parseFloat`이며 입력이 비어 있거나 NaN이면 `NOT_CHECK`·`IS_NULL`·`NOT_NULL` 외에는 불일치다.

- **건수 정책.** C10B2060과 C10B2190은 순번과 무관하게 일치 건수가 **정확히 1**이어야 한다 (우선순위 매칭이 아니다). SP(C10B2070)만 다건일 때 `no` 오름차순, 같으면 `id` 오름차순 첫 건을 쓴다. 이 정렬은 AS-IS 조회 SQL의 정렬 기준을 모르는 상태의 잠정 규칙이다 (8장).

## 2.4 result

```js
result = {
  ok: true,
  error: null,                         // 실패 시 { code:'KK82', stage:'기준 조회', stepNo:4, message:'…' }
  path: 'STANDARD',                    // 'STANDARD' | 'CUSTOMER' | 'SPECIAL_57'
  values: {
    ORD_EXC_THK:       0.500,          // 입력 그대로
    CRM_THK:           0.483,          // 압연목표두께 (해설서의 지역변수 crm_thk. 저장 컬럼 아님)
    PLTCM_THK_TRV:     0.486,          // 출측두께 (소수 3자리 절삭)
    PLTCM_SET_THK_TRV: 0.485,          // X-Ray SET (0.005 눈금)
    PLTCM_THK_LLV:     0.475,          // SET + 하한 공차
    PLTCM_THK_ULV:     0.500           // SET + 상한 공차
  },
  applied: {
    applyWidth: 1490,
    setRule: { id, no, adj, unit, candidates:[…] } | null,  // STANDARD만. KK83이면 candidates에 전건
    spRule:  { id, no, rate } | null,  // 조회된 룰 (조회값은 rate에 남는다)
    spRate:  0.8,                      // 출측 계산식에 실제 곱한 SP율(%). TRK 계열 덮어쓰기·고객 TRK 생략·SPECIAL_57은 0
    tolRule: { id, no, llv, ulv } | null
  },
  steps: [ { no:1, name:'단위 변환', formula:'g = 20 / 1000', inputs:{galThkUm:20}, output:0.02, note:'' }, … ],
  warnings: [ { code:'W_NO_SP_RULE', message:'SP 보정 기준 0건 — 0%로 진행' } ]
};
```

- 값은 모두 number다. 화면은 `toFixed(3)`으로 표시한다.
- `error.stage`는 `steps[].name`, `error.stepNo`는 `steps[].no`와 같은 체계다. 3장의 "단계 N" 제목은 문서용 번호다.
- 실패해도 그때까지의 `steps`·`values`(계산된 것만)·`warnings`를 채운다. 실패 지점 이후의 값은 `null`이다. 예: `KK80`이면 `CRM_THK`·`PLTCM_THK_TRV`·`PLTCM_SET_THK_TRV`는 값, `LLV`·`ULV`는 `null`.
- 경로별 `applied`: `CUSTOMER`는 `setRule null`. `SPECIAL_57`은 `setRule`·`spRule` `null`, `spRate 0`.
- `steps`의 순서: ① 단위 변환 → ② 적용폭 → ③ 경로 선택 → ④ 기준 조회(C10B2060) → ⑤ 압연목표 → ⑥ SP 조회·적용 → ⑦ 절삭 → ⑧ SET 눈금 → ⑨ 공차. 경로에 따라 건너뛴 단계는 `note`에 "생략"을 적고 남긴다.

## 2.5 노출 함수

| 함수 | 역할 |
|---|---|
| `design(input, criteria)` | 전체 계산 |
| `matchRules(table, input, derived)` | `defs`로 대상값을 만들고 `status='Y'` 룰 중 일치 목록을 `no` → `id` → 배열 순서로 반환 |
| `truncate3(x)` | 소수 3자리 절삭 (해설서 `thk_dot`) |
| `snapSet(x3)` | 소수 3자리 값을 0.005 눈금 SET으로 |
| `applyWidth(order)` | 슬리팅 적용폭 |
| `round4(x)` | 소수 4자리 반올림 (CRN·TCT 전용) |
| `DEFAULT_DEFS`, `ERROR_CODES`, `WARNING_CODES`, `VERSION` | 상수 |

# 3. 계산 규칙 (AS-IS 재현)

기호: `t` 주문두께, `g` 목표도금두께(mm), `pf`·`pb` 전·후면 도막(mm), `c` C10B2060 보정값, `r` 고객요청 값, `sp` SP율(%).

## 3.1 단계 0. 전처리

1. `g = galThkUm / 1000`, `pf = paintFrontUm / 1000`, `pb = paintBackUm / 1000`. 라미나두께는 0 (AS-IS 초기값).
2. 적용폭: `ORD_SLIT_GRP_CNT > 0`이면 `ORD_MIX_WTH` 합계, 아니면 `ORD_EXC_WTH`. 합계가 0이면 **`applyWidth = 0`으로 그대로 진행**(AS-IS 재현, 주문폭 폴백 없음)하고 `W_SLIT_WIDTH_ZERO` 경고.
3. `ORD_EXC_THK`가 유한한 양수가 아니면 `E_INPUT`으로 종료.

## 3.2 단계 1. 경로 선택

| 판정 순서 | 조건 | 경로 |
|---|---|---|
| 1 | `PRD_NM_CD`가 `'5'` 또는 `'7'` (문자열 비교) | `SPECIAL_57` |
| 2 | `request.value === 0` 이고 `ORD_THK_TP !== '3'` | `STANDARD` |
| 3 | 그 외 | `CUSTOMER` |

경로 선택 직후 `ORD_THK_TP`가 `'1'`·`'2'`·`'3'`이 아니면 경로와 무관하게 `W_THK_TP_INVALID`를 한 번 낸다.

`SPECIAL_57`: `PLTCM_SET_THK_TRV = t` (눈금 없음), `PLTCM_THK_TRV = 0`, `CRM_THK = null`. 경고 `W_SPECIAL_57`. 요청값·두께구분과 무관하게 이 경로다. 이후 단계 6(공차)만 SET 기준으로 수행한다.

## 3.3 단계 2. STANDARD — C10B2060

`setCorrection`을 조회한다. 0건 `KK82`, 2건 이상 `KK83`(후보 전건을 `applied.setRule.candidates`에 기록). 1건이면 단위 `unit`을 대문자로 읽어 아래 표를 적용한다. `unit`이 CRN·PCN이 아니면 전부 TRK 계열이며, CRN·PCN·TRK 외 값이면 `W_UNIT_UNKNOWN` 경고를 추가한다.

| 단위 | 두께구분 | 관리코드 | 압연목표 `CRM_THK` | 후처리 |
|---|---|---|---|---|
| CRN | 2 | 5 | `t` | `round4` |
| CRN | 2 | 그 외 (**6 포함**) | `t − g + c` | `round4` |
| CRN | 1 | 6 | `t − g` | 없음 |
| CRN | 1 | 그 외 (**5 포함**) | `t + c` | 없음 |
| PCN | 2 | 6 | — | `KK94` |
| PCN | 2 | 5 | `0` | `W_EMPTY_BRANCH` |
| PCN | 2 | 그 외 | `t − g + t × c / 100` | 없음 |
| PCN | 1 | 5 | — | `KK94` |
| PCN | 1 | 6 | `0` | `W_EMPTY_BRANCH` |
| PCN | 1 | 그 외 | `t + t × c / 100` | 없음 |
| TRK 계열 | 2 | 6 | — | `KK94` |
| TRK 계열 | 2 | 5 | `0` | `W_EMPTY_BRANCH`, `sp = 0` |
| TRK 계열 | 2 | 그 외 | `c − g` | `sp = 0` |
| TRK 계열 | 1 | 5 | — | `KK94` |
| TRK 계열 | 1 | 6 | `0` | `W_EMPTY_BRANCH`, `sp = 0` |
| TRK 계열 | 1 | 그 외 | `c` | `sp = 0` |

- **CRN 단위에는 KK94 검사가 없다** (해설서 A.1 각주). CRN·2·6과 CRN·1·5는 "그 외" 행이다. 표는 16행이지만 부록 A.1의 18개 조합을 모두 덮는다.
- 산술 순서는 표기 그대로 왼쪽에서 오른쪽이다 (`t − g + c`는 `(t − g) + c`).
- PCN의 백분율 기준은 도금을 빼기 전 `t`다.
- 두께구분이 `'1'`·`'2'`가 아닌 값으로 STANDARD에 들어오면 BMT(1) 행으로 처리한다 (경고는 3.2에서 이미 냈다). AS-IS의 정확한 흐름은 검증 항목이다(8장).
- TRK 계열의 `sp = 0`은 단계 4에서 SP 조회 결과를 덮어쓴다는 뜻이다. 조회 자체는 근거 기록을 위해 수행한다.

## 3.4 단계 3. CUSTOMER — 고객사양

기준값 `b`: `ORD_THK_TP === '3'`이면 `b = t − pf − pb − g` (라미나 0 포함), 그 외 `b = t`. 일반 TCT(2)의 도금은 빼지 않는다.

| `request.unit` | `CRM_THK` |
|---|---|
| CRN | `b + r` |
| PCN | `b + b × r / 100` |
| TRK | `r` |
| 공백·그 외 | `b` |

## 3.5 단계 4. SP 보정

1. `spCorrection` 조회. 0건이면 `sp = 0`과 `W_NO_SP_RULE`. 2건 이상이면 첫 건(2.3 정렬)과 `W_MULTI_SP_RULE`. 조회된 룰은 `applied.spRule`에 남긴다.
2. 단계 2에서 TRK 계열이었다면 `sp = 0`으로 덮어쓴다.
3. 출측 계산값: `request.unit === 'TRK'`이면 `CRM_THK` 그대로(SP 생략, `spRate 0`), 아니면 `CRM_THK + CRM_THK × sp / 100`.
4. `applied.spRate`는 3의 식에 실제 곱한 값이다.

고객 단위 판정은 경로와 무관하게 `request.unit`을 본다. STANDARD 경로로 왔어도 고객 단위가 TRK이면 SP를 생략한다 (해설서 A.2).

## 3.6 단계 5. 절삭과 SET 눈금

**절삭 `truncate3`**: `String(x)`를 만들어 소수점 뒤 3자리까지만 남긴다. 소수점이 없으면 그대로다. 문자열에 `e`가 있으면(지수 표기) `x.toFixed(12)`로 다시 만들어 절삭하고 `W_EXP_NOTATION` 경고를 남긴다. 결과는 `Number`로 돌려준다. **음수**는 부호를 떼고 절삭한 뒤 부호를 되돌리며 `W_NEGATIVE` 경고를 남긴다 (AS-IS `thk_dot`의 음수 동작은 검증 항목).

**눈금 `snapSet`**: 절삭된 값의 절댓값을 정수 µm `u = Math.round(|x3| × 1000)`로 바꾸고 `d = u mod 10`(세 번째 자리)을 본다.

| `d` | 처리 |
|---|---|
| 0, 5 | 그대로 |
| 1, 2 | `u − d` |
| 3, 4, 6, 7 | `u − d + 5` |
| 8, 9 | `u − d + 10` |

`PLTCM_SET_THK_TRV = sign × u' / 1000`. 정수 연산이므로 0.998 → 1.000처럼 자리올림도 꼬리 없이 처리된다. SET이 0이면 `W_ZERO_SET` 경고(AS-IS는 이후 제조표준 조회에서 실패할 수 있음).

## 3.7 단계 6. 공차

`thkTolerance`를 `derived.setThk = PLTCM_SET_THK_TRV` 기준으로 조회한다. 0건 `KK80`, 2건 이상 `KK81`. 1건이면 `PLTCM_THK_LLV = truncate3(SET + llv)`, `PLTCM_THK_ULV = truncate3(SET + ulv)`. 공차는 부호를 포함한 값이다 (하한 −0.010이면 더한다).

하한·상한의 자리수 처리는 해설서가 밝히지 않았다. double 덧셈은 `0.205 + (−0.010) = 0.19499999999999998`처럼 꼬리를 만들고, 절삭(0.194)과 반올림(0.195)이 다르다. **잠정으로 출측두께와 같은 `truncate3`를 쓰고** 8장 검증 항목으로 둔다. 테스트가 이 선택을 경계값으로 고정한다.

## 3.8 오류·경고 코드

| 코드 | 종류 | 뜻 |
|---|---|---|
| `E_INPUT` | 오류 (TO-BE) | 주문두께 등 필수 입력 결함 |
| `E_CRITERIA` | 오류 (TO-BE) | 기준표 누락 또는 `rules`가 배열이 아님 |
| `KK82` / `KK83` | 오류 (AS-IS) | C10B2060 0건 / 다건 |
| `KK94` | 오류 (AS-IS) | PCN·TRK 계열에서 두께구분·관리코드 조합 불일치 |
| `KK80` / `KK81` | 오류 (AS-IS) | C10B2190 0건 / 다건 |
| `W_EMPTY_BRANCH` | 경고 | AS-IS 계산문 없음 → 압연목표 0 |
| `W_NO_SP_RULE` / `W_MULTI_SP_RULE` | 경고 | SP 0건 → 0% / 다건 → 첫 건 |
| `W_THK_TP_INVALID` | 경고 | 두께구분 1·2·3 외 값 (경로 선택 직후 1회) |
| `W_UNIT_UNKNOWN` | 경고 | 기준 단위가 CRN·PCN·TRK 외 → TRK 계열 처리 |
| `W_SLIT_WIDTH_ZERO` | 경고 | 슬리팅 그룹수 > 0인데 폭 합계 0 |
| `W_REQUEST_INVALID` | 경고 | 고객요청 값이 수가 아님 → 0 |
| `W_ZERO_SET` | 경고 | SET 0 |
| `W_EXP_NOTATION` | 경고 | 절삭 시 지수 표기 폴백 |
| `W_NEGATIVE` | 경고 | 절삭·눈금 입력이 음수 |
| `W_SPECIAL_57` | 경고 | 품명 5·7 특수 경로 |

오류는 하나만 낸다(첫 실패에서 중단). 경고는 누적한다.

## 3.9 부동소수 정책

- 산술은 AS-IS와 같은 순서의 JS double로 한다. Java double과 IEEE 754 표현이 같으므로 해설서 5.2절의 `0.470 − 0.015 → 0.454` 사례가 그대로 재현된다.
- `round4`는 `Math.round(x × 10000) / 10000`으로 구현한다. AS-IS의 반올림 구현(`Math.round` 계열인지 `BigDecimal HALF_UP`인지)은 검증 항목이다.
- `truncate3`의 `String(x)`는 Java `Double.toString`과 대부분 같지만 표기 차이가 있을 수 있어 검증 항목이다. 3자리 절삭에 영향을 주려면 앞 3자리 숫자가 달라야 하므로 위험은 낮다.
- SET 눈금은 정수 µm로 계산한다. 공차 결과는 `truncate3`다(3.7).
- 절삭 전 중간값(`CRM_THK`, 출측 계산값)은 double 꼬리를 가진 그대로 `values`·`steps`에 남긴다. 예: 해설서 5.1의 SP 단계 값은 수학적으로 0.486864이지만 JS double은 `0.48686399999999996`이다.

# 4. 연동

## 4.1 어댑터 `toThicknessInput(order, specRows, design, ctx)`

| 입력 항목 | 출처 | 규칙 |
|---|---|---|
| `SPC_ORG_CD` | `SPC_AVR` 앞 2글자 | 대문자. 2글자 미만이면 공백 |
| `ORD_THK_TP` | 케이스 주문 필드 | 4.2 기본값 규칙 |
| `request.value` / `unit` | ⑤ `specRows` 중 `srcs.length > 0`이고 `code === 'CUS_ROL_THK'` / `'THK_COR_UNT'` | `op`가 `'='`인 행만 채택. 값은 `parseFloat`, NaN이면 0과 이상징후 `thk-request-invalid`(경고). `op`가 `'='`가 아니면 채택하지 않고 같은 이상징후. 없으면 0 / `''` |
| `layers.galThkUm` | `ctx.thk.coatThk.map[GW_ASG_CD]` | 없으면 0과 이상징후 `thk-input-warn`(경고) |
| `layers.paintFrontUm` | ⑤ `specRows` 중 `code === 'TOP_THK'`이고 `op '='`인 행의 값, 없으면 `design.color.sum.thkT` | `parseFloat`, NaN이면 0. 칼라 품명이 아니면 0 |
| `layers.paintBackUm` | `design.color.sum.thkB` | `parseFloat`, NaN이면 0. 후면 도막 사양 코드는 없음 (8장) |
| `ORD_MIX_WTH` | 주문 `ORD_MIX_WTH1..10` | 없으면 빈 배열 |
| 숫자 항목 | `ORD_EXC_THK`, `ORD_EXC_WTH`, `ORD_SLIT_GRP_CNT` | `num()` |
| 코드 항목 | 주문 동명 컬럼 | `String(x).trim()`. `num()`을 적용하지 않는다 |

`specRows`는 ⑤ `matchSpecs` 결과 `rows`이며 각 행은 `{code, ko, unit, base, val, srcs}`다. `val`에는 연산자 접두어가 붙을 수 있으므로 어댑터는 원 사양 결과의 `op`를 함께 읽는다(`matchSpecs`가 `rows`에 `op`를 남기도록 한 줄 보강한다).

## 4.2 주문두께구분 기본값과 검증

`defaultThkTp(order, thkRules)`:
1. 규격약호관리 `thkRules`(`{id, no, specOp, spec, thkStd, status}`)를 엔진 `matchRules`로 판정한다. 변환: `{status, no, id, cond:{spec:{op: specOp || '=', v1: spec, v2:''}}}`, `defs: [{key:'spec', num:false, src:'order.SPC_ORG_CD'}]`. 규격기관에는 별칭표 `{JS:'JIS', AM:'ASTM'}`를 적용해 넘긴다 (KS·EN·AS는 그대로). 연산자 의미가 규격약호관리의 `condMatch`와 같아진다.
2. 일치 행이 여러 건이면 `no` 오름차순 첫 건. `thkStd`가 `BMT`면 `'1'`, `TCT`면 `'2'`.
3. 없거나 미확정(`thkStd` 공백)이면 `'1'`.

**칼라 품명(3·4)도 같은 규칙이다.** C10B2060 시드 82건 중 칼라 품명을 겨냥한 룰 전부가 두께구분 1·2를 요구하므로 AS-IS 칼라 주문은 BMT/TCT로 들어온다. `'3'`(칼라TCT)은 주문이 명시적으로 지정할 때만 쓴다.

**적용 시점.** `orderFromSeed`의 하드코딩 `ORD_THK_TP:'1'`을 `defaultThkTp(order, ctx.thkRules)`로 바꾼다. 케이스 주문 편집 화면에서 값을 비우면 같은 함수로 채운다. 주문 폼은 주문 객체의 모든 키를 입력란으로 그리므로 항목은 이미 있다. 다만 접힌 "추가 항목"에 묻혀 있으니 `ORD_THK_TP`·`ORD_THK_MNG_CD`·`GW_ASG_CD`를 `CORE_FIELDS`에 추가해 상단에 보이게 한다. 이미 저장된 케이스(`sim-mock-v1`)는 마이그레이션하지 않는다.

**실행 시 검증**(`runPipeline`): 규격 기준으로 다시 계산한 기본값과 주문값이 다르면 이상징후 `thk-tp-mismatch`(경고). 규격 기준이 없거나 미확정이면 `thk-tp-default`(경고). 두 판정 모두 실행 시 이상징후이며 주문값을 바꾸지 않는다.

## 4.3 파이프라인 변경 (`runPipeline`)

1. 기존대로 `genDetail`로 설계 결과를 만들고 ①~⑤를 수행한다.
2. **공통 섹션 동기화.** `design.common`의 `'주문두께구분'`·`'두께관리코드'`·`'도금량코드'` 행을 주문의 `ORD_THK_TP`·`ORD_THK_MNG_CD`·`GW_ASG_CD`와 마스터코드 디코드(`ORD_THK_MNG_CD` 마스터, 두께구분은 1 BMT / 2 TCT / 3 칼라TCT)로 채운다. `toDesign`에 세 컬럼을 넘긴다. 이 세 행은 `GOVERNED_PATHS`에 있으므로 골든이 바뀐다(5.2).
3. ⑤ 뒤에 `applyThicknessDesign(design, order, sm, ctx)`를 호출한다.
   - `criteria = ctx.thk`, `input = toThicknessInput(order, sm.rows, design, ctx)`.
   - `result = PltcmThicknessEngine.design(input, criteria)`.
   - **`design`에는 값만 넣는다.** `design.cgl.thk = { path, CRM_THK, PLTCM_THK_TRV, PLTCM_SET_THK_TRV, PLTCM_THK_LLV, PLTCM_THK_ULV }` (실패 시 `null` 필드 그대로). `result`와 `input` 전체는 ⑥ 단계 `detail.thkCalc`·`detail.thkInput`과 `run.thkCalc`에만 둔다. 골든 스냅샷이 산식 문자열·경고 문구까지 물지 않게 하기 위한 것이다.
   - 성공 시 `design.cgl.pltcm`을 갱신한다. `'X-Ray Set두께값'` = `SET.toFixed(3)`, `'두께목표값'` = `THK.toFixed(3) + ' (' + LLV.toFixed(3) + ' ~ ' + ULV.toFixed(3) + ')'`, 그리고 핀이 숫자로 검증할 수 있도록 `'두께하한'` = `LLV.toFixed(3)`, `'두께상한'` = `ULV.toFixed(3)` 행을 추가한다. 5·7이면 두께목표값은 `'0.000 (…)'`.
   - 실패 시 네 값은 `''`로 둔다.
4. ⑥ 판정: `result.ok ? 'P' : 'F'`.
5. 이상징후: 오류는 `anomaly('thk-design-error','error','두께설계 실패', code + ' — ' + message, code)`. 경고는 각각 `anomaly('thk-design-warn','warn','두께설계 경고', message, code)`. 어댑터 경고는 `thk-request-invalid`·`thk-input-warn`, 두께구분 판정은 `thk-tp-mismatch`·`thk-tp-default`(4.2).
6. **사양 코드의 엔진 연결.** `SPEC_TO_ENGINE = { CUS_ROL_THK:'request.value', THK_COR_UNT:'request.unit', TOP_THK:'layers.paintFrontUm' }`를 두고, `mapSpecOverrides`는 이 코드들을 `unmapped`에서 제외한다. 그렇지 않으면 ⑥이 소비하는 값이 매 실행 '사양 미연결' 경고를 만든다. (`TOP_THK`는 기존 `SPEC_TO_DESIGN` 항목도 유지한다.)

`GOVERNED_PATHS`에는 PLTCM 경로를 추가하지 않는다. SET은 사양이 관장하는 값이 아니라 기준 계산값이다.

## 4.4 화면

- ⑥ 단계 상세에 **"PLTCM 두께 계산 근거"** 밴드를 추가한다. 데이터는 `stage.detail.thkCalc`·`thkInput`이다. 내용: 경로, 두께 4개 연쇄(주문 → 압연목표 → 출측 → SET)와 범위, 적용 룰(ID·순번·보정치·단위, KK83이면 후보 목록), SP율과 출처(라이브/임시 시드), 공차 룰과 출처, 단계별 산식 표(`steps`), 경고 목록, 입력 요약(두께구분·관리코드·도금두께·고객요청 값·단위·적용폭). 오류면 `error.stage`에 해당하는 `steps` 행을 강조한다.
- 근거 추적 패널(`provFor(path)`)은 경로가 `cgl.pltcm.X-Ray Set두께값`·`cgl.pltcm.두께목표값`·`cgl.pltcm.두께하한`·`cgl.pltcm.두께상한`이면 층 `{cls:'prv calc', label:'기준 계산', detail:<경로·적용 룰·SET 요약>, jump:'#/quality-design/module-management/rolling-thickness-set'}`을 추가한다. 고객요청 값이 쓰였으면 `{cls:'prv spec', label:'사양', detail:<specNo·값·단위>}` 층도 쌓는다. `provFor`는 `run.thkCalc`를 읽는다.
- 핀·골든은 기존 경로 체계(`cgl.pltcm.<라벨>`)로 그대로 동작한다.

## 4.5 품질사양 모듈

`SEED_DICT`에 결과 항목 2개를 추가한다. 사전 항목은 `id`와 `active`가 필수다 (파서 `findAttr`가 `active`로 거르고 표 편집이 `id`로 동작한다).

```js
{id:'d15', active:true, ko:'고객요청압연두께', code:'CUS_ROL_THK', kind:'RESULT', unit:'mm', dtype:'NUMBER', dlen:'5,3',
 desc:'고객이 요청한 압연두께 값. 두께보정단위(CRN/PCN/TRK)에 따라 해석. 0이면 미지정'},
{id:'d16', active:true, ko:'두께보정단위',     code:'THK_COR_UNT', kind:'RESULT', unit:'',   dtype:'CHAR',   dlen:'3',
 desc:'고객요청압연두께의 해석 단위: CRN 기준두께에 가산 · PCN 기준두께 대비 % (칼라TCT는 도금·도막 차감 후 두께) · TRK 확정값'}
```

`id`가 저장 데이터와 겹치면 `'d'+len+'-'+Date.now()` 규칙(기존 신규 항목과 동일)으로 만든다. 합류는 `loadState()`가 저장 state를 반환하기 직전에 수행한다: 사전에 같은 `code`가 없을 때만 추가하고, 합류 이력을 `qspec-dict-imported` 키에 기록해 사용자가 지운 항목을 되살리지 않는다(마스터코드의 `asIsImports` 방식). 시뮬레이션의 폴백 `SEED_DICT`(`code`·`ko`·`unit`)에도 두 항목을 추가한다.

## 4.6 압연두께Set보정관리

이 모듈의 "Set 두께" 표현은 엔진의 SET과 뜻이 다르므로 아래를 모두 고친다.

| 위치 | 현재 | 변경 |
|---|---|---|
| 소개 문단 (218행 부근) | "Set 두께 = 주문두께 + 보정치" | "압연목표두께(보정 후) = 주문두께 ± 보정치. SET 확정(도금 차감·SP·절삭·0.005 눈금)은 시뮬레이션 ⑥" |
| 간편판정 안내 (245행 부근) | "계산된 Set 두께 … 순번이 빠른 룰이 적용됩니다" | "압연목표두께(보정 후) … AS-IS 설계는 정확히 1건을 요구하며 다건은 KK83 실패. 여기서는 후보를 순번 순으로 보여준다" |
| 간편판정 안내 (269행 부근) | "첫 번째 룰이 적용 … 나머지는 후보" | 위와 같은 취지로 정정 |
| 힌트 (271행 부근) | "Set 두께 0.41" | "압연목표두께 0.41" |
| 범례 (302행 부근) | "Set 두께 = 주문두께 + 보정치" | 소개 문단과 동일 |
| 결과 카드 0건 문구 (613행 부근) | "보정 없음(0)으로 처리" | "AS-IS 설계에서는 KK82 실패 (보정 0이 아님)" |
| 결과 카드 라벨 (615행 부근) | "Set 두께 (mm)" | "압연목표두께(보정 후, mm)" |
| 상세 드로어 (682행 부근) | "Set 두께 = 주문두께 ± 보정치" | "압연목표두께 = 주문두께 ± 보정치 (CRN·BMT 기준)" |

행 번호는 작성 시점 기준이며 구현 시 문자열로 찾는다. 룰 데이터와 조건 평가는 그대로다.

## 4.7 임시 시드와 provider 계약

시뮬레이션 `loadCriteria`가 만드는 `ctx.thk`의 형태를 확정한다. 다음 스펙의 모듈은 아래 계약을 만족하는 localStorage 상태를 저장하고, 시뮬레이션은 `loadCriteria`만 고쳐 연결한다.

| 키 | 라이브 localStorage 키 (잠정) | 저장 형태 | `ctx.thk` 형태 |
|---|---|---|---|
| `setCorrection` | `rts-mock-v1` | `{v, rules:[{id,no,status,cond,adj,unit}]}` | `{live, defs:null, rules}` |
| `spCorrection` | `sp-correction-mock-v1` | `{v, rules:[{id,no,status,cond,rate}]}` | `{live, defs:null, rules}` |
| `thkTolerance` | `pltcm-tolerance-mock-v1` | `{v, rules:[{id,no,status,cond,llv,ulv}]}` | `{live, defs:null, rules}` |
| `coatThk` | `coating-code-mock-v1` | `{v, rows:[{id,code,status,wgtTrv,thkUm}]}` | `{live, map:{<code>: thkUm}}` (`status 'Y'`만) |

폴백(임시 시드)은 시뮬레이션에 내장한다.

```js
/* 임시 — 다음 스펙에서 라이브 모듈로 교체 */
var SEED_SP_RULES  = [];                                             // 조회 0건 → 0% + W_NO_SP_RULE
var SEED_COAT_THK  = { E:12, A10:12, Z12:17, A15:12, M12:12 };      // 도금량코드 → 목표도금두께 µm (COAT_RANGE 이관)
var SEED_TOL_RULES = [ { id:'TOL-TMP-001', no:1, status:'Y', cond:{}, llv:-0.015, ulv:0.015, note:'임시 전건 공차' } ];
```

`ctx.thk = { setCorrection:{live, defs:null, rules}, spCorrection:{live:false, defs:null, rules:SEED_SP_RULES}, thkTolerance:{live:false, defs:null, rules:SEED_TOL_RULES}, coatThk:{live:false, map:SEED_COAT_THK} }`. 어댑터는 `ctx.thk.coatThk.map`만 읽고 전역 시드를 직접 읽지 않는다. 화면의 근거 밴드는 `live`가 `false`인 기준에 "임시 시드"를 표시한다.

## 4.8 시뮬레이션 주문 시드 정정

- `orderFromSeed`는 모든 주문에 `ORD_SLIT_GRP_CNT:'6'`을 넣지만 `ORD_MIX_WTH1..10`이 없어 그대로 두면 전 케이스가 적용폭 0·경고가 된다. `ORD_SLIT_GRP_CNT`는 ③ 주문단중 판정의 분할 수로도 쓰이므로 바꾸지 않고, **`ORD_MIX_WTH1..6`을 주문폭을 6등분한 값(소수 1자리, 합계가 `ORD_EXC_WTH`가 되도록 마지막 값으로 보정)으로 채운다.** 적용폭은 주문폭과 같아진다.
- `ORD_THK_TP`는 4.2대로 `defaultThkTp`로 채운다.

## 4.9 알려진 코드 불일치

- 시뮬레이션 주문의 도금량코드(`Z12`, `A10`, `E`, `A15`, `M12`)는 C10B2060 룰이 쓰는 1자리 코드(`G`, `H`, `S`, `W`, `K` 등)와 다르다. 이번엔 그대로 두고 도금량코드 xlsx가 오면 주문 시드와 `SEED_COAT_THK` 키를 맞춘다.
- 규격약호관리의 규격코드(`JIS`, `ASTM`)와 C10B2060의 규격기관(`JS`, `AM`)은 별칭표로 잇는다. 체계 통일은 다음 스펙이다.

# 5. 테스트

## 5.1 엔진 단위 테스트 `tests/pltcm-thickness-engine.test.js`

실행: `node --test "tests/**/*.test.js"` (Node 20 이상. Node 22에서 디렉토리 인자는 지원되지 않는다). 외부 의존성 없음. 기준 3종은 테스트 안에서 직접 만든다.

**비교 규칙.** 절삭·SET·공차 값(`PLTCM_*`)은 정확 비교. 절삭 전 중간값(`CRM_THK`, 출측 계산값, `steps[].output`)은 1e-12 허용 근사 비교. `warnings`는 코드 집합의 동등 비교. 별도 표기가 없으면 SP 룰은 0건, 공차 룰은 `cond:{}` ±0.015 한 건이다.

| 그룹 | 케이스 | 기대 |
|---|---|---|
| 해설서 5.1 | TCT 0.500 · g 20µm · CRN +0.003 · SP 0.8% · 공차 −0.010/+0.015 | CRM 0.483 / 출측 0.486 / SET 0.485 / 0.475~0.500 |
| 해설서 5.2 | CR BMT 0.600 · CRN +0.005 · SP 0.6% | 0.605 / 0.608 / 0.610 |
| | GI TCT 0.500 · g 20 · CRN +0.003 · SP 0.8% | 0.483 / 0.486 / 0.485 |
| | CR BMT 0.800 · 기준 PCN 1.5% · SP 룰 rate 0 한 건 | 0.812 / 0.812 / 0.810, `spRate 0`, 경고 없음 |
| | GI TCT · 기준 TRK 0.470 · g 15 · **SP 룰 rate 0.8 존재** | CRM ≈0.45499999999999996 / 0.454 / 0.455, `spRule` 기록되나 `spRate 0` |
| | 칼라TCT(3) 0.500 · 앞15+뒤10 · g 20 · 고객 CRN +0.010 · SP 0 | CRM ≈0.46499999999999997 / 0.464 / 0.465 |
| | 품명 `'5'` · 주문 0.503 | SET 0.503, 출측 0, `CRM null`, LLV 0.488 / ULV 0.518, 경고 {W_SPECIAL_57} |
| | 품명 `'7'` · 주문 0.503 · request {0.01,'CRN'} · 두께구분 '3' | 위와 같은 경로·값 (요청·구분 무관) |
| 해설서 5.3 | 같은 조건에서 STANDARD vs CUSTOMER | 0.485 vs 0.505, CUSTOMER는 `setRule null` |
| 해설서 3.2 | TCT 0.500 · 고객 PCN +1.0 | 0.505 / 0.505 / 0.505 |
| CUSTOMER | TCT 0.500 · 고객 TRK 0.470 · SP 룰 0.8 존재 | CRM 0.470, SP 생략, 출측 0.470, SET 0.470, `spRate 0` |
| | 칼라TCT 0.500 · 앞15 뒤10 · g 20 · 요청 0 · 단위 `''` | CUSTOMER, CRM ≈0.45499999999999996, 0.454, 0.455 |
| | 단위 `'ABC'` · 요청 0.01 · BMT 0.500 | CRM 0.500 |
| 해설서 4.2 | `snapSet` 0.540~0.549, 0.998 | 대응표대로, 1.000 |
| 해설서 4.3 | 출측 계산값 0.2029 | 출측 0.202, SET 0.200 (반올림이면 실패) |
| 부록 A.1 | 18개 조합 전부 (CRN 6조합은 KK94 없음) | 표의 값·`KK94`·`W_EMPTY_BRANCH`·`sp 0` |
| | 빈 분기 4조합(PCN·2·5, PCN·1·6, TRK·2·5, TRK·1·6) | CRM 0, 출측 0, SET 0, LLV −0.015 / ULV 0.015, 경고 ⊇ {W_EMPTY_BRANCH, W_ZERO_SET} |
| 부록 A.2 | STANDARD 경로 + 고객 단위 TRK + SP 룰 0.8 | SP 생략, `spRate 0` |
| | 칼라TCT · 요청 0 · 고객 단위 TRK | CRM 0, SET 0, 경고 ⊇ {W_ZERO_SET} |
| SP | SP 룰 0건 | `spRate 0`, 경고 {W_NO_SP_RULE}, 출측 = CRM 절삭 |
| | SP 룰 2건 (no 2 'SP-002' rate 1.0, no 1 'SP-001' rate 0.5) | `spRule.id 'SP-001'`, `spRate 0.5`, {W_MULTI_SP_RULE}. 순번 같고 ID만 다른 쌍도 ID 순 |
| 경고 | 두께구분 `'4'` · 요청 0 · CRN c | BMT 행 `t + c`, {W_THK_TP_INVALID} |
| | 단위 `'XYZ'` · BMT · 관리코드 D · adj 0.47 | CRM 0.47 (TRK 계열 `c`), `spRate 0`, {W_UNIT_UNKNOWN}. 단위 `''`도 같음 |
| | 그룹수 2 · `ORD_MIX_WTH []` | `applyWidth 0`, {W_SLIT_WIDTH_ZERO} |
| | request.value `NaN` / `''` · 단위 CRN · TCT | STANDARD 경로, {W_REQUEST_INVALID} |
| | `truncate3(1e-7)` | 0, 지수 표기 플래그 |
| 음수 | `truncate3(−0.4549)` | −0.454. `snapSet(−0.454)` = −0.455. `truncate3(1)` = 1 |
| 오류 | C10B2060 0건 / 2건 | `KK82` / `KK83`(candidates 2건), `CRM null` 이하 전부 `null` |
| | 공차 0건 / 2건 | `KK80` / `KK81`, CRM·출측·SET은 값, LLV·ULV `null` |
| | 주문두께 0 / −0.5 / `'abc'` | `E_INPUT` |
| | `design(undefined, undefined)`, `design({}, {})`, `criteria.setCorrection.rules` 미배열 | throw 없이 `ok:false`, `E_INPUT` 또는 `E_CRITERIA` |
| 정규화 | `ORD_EXC_THK '0.5'`(문자열) | 0.5로 계산. `unit 'crn'` → CRN 처리. `ORD_THK_TP 1`(number) → `'1'` |
| 적용폭 | 그룹수 2 · 폭 [600, 500] | 1100. 그룹수 0이면 주문폭 |
| 매처 | 연산자 18종 × 문자·숫자 | 압연두께Set보정관리 `evalText`·`evalNum`과 같은 표 |
| | `status 'N'` 룰 | 제외 |
| | `cond:{}` 룰, `cond` 없는 룰 | 전건 매칭 |
| | `defs` 지정 (`request.value`, `layers.galThkUm`, `derived.setThk`) | 해당 값에만 매칭. 예: setThk BETWEEN1 0.480~0.490 룰과 0.600~0.700 룰 중 SET 0.485에서 전자만 |
| | `defs` `null`·`undefined` → `DEFAULT_DEFS`, `[]` → 전건 | |
| | `matchRules` 반환 순서 | `no` → `id` → 배열 순 |
| 결정성 | 같은 입력 2회 | 깊은 동등 |
| 전역 | `vm` 컨텍스트에 엔진 로드 | 새 전역은 `PltcmThicknessEngine` 하나 |

## 5.2 시뮬레이션 회귀

- **케이스 (a) STANDARD 1건 매칭.** 비칼라 주문을 쓴다. 후보는 `D260831021`(GI, KS, 두께 0.44, 관리코드 D → 기본값 두께구분 '1'). 실측으로는 룰 no.69(prod IN G,L,V,W · thkKind IN 1,2 · thkMng D)가 1건 맞을 것으로 보이며 **구현 시 실제 82건으로 확정해 스펙과 케이스에 룰 번호·보정치를 적는다.** 핀: `cgl.pltcm.X-Ray Set두께값`, `cgl.pltcm.두께목표값`, `cgl.pltcm.두께하한`, `cgl.pltcm.두께상한`.
- **케이스 (b) KK82.** 예: 두께 0.25(no.69 하한 0.27 미만) 또는 규격기관 BIS. ⑥ F와 `thk-design-error` 이상징후를 기대.
- **케이스 (c) CUSTOMER 칼라.** `D260831014`(CCGI, 110197)에 사양 `고객요청압연두께 = 0.01, 두께보정단위 = CRN`을 붙여 CUSTOMER 경로·`setRule null`·사양 근거 층을 검증. 고객사 110197 룰(no.27: 두께구분 1 · 관리코드 Q)을 검증하려면 주문값을 관리코드 Q로 둔 별도 케이스가 필요하며, 이는 선택 사항이다.
- 기존 케이스 3건의 골든을 갱신한다. 갱신 범위에는 `common.주문두께구분`·`두께관리코드`·`도금량코드`(4.3-2)와 `cgl.thk.*`, `cgl.pltcm.두께하한/상한`이 포함된다.

## 5.3 빌드·수동 검증

- `python3 build/inject_engine.py --check`와 `python3 build/rolling_thickness_set_seed.py --check` 통과.
- `python3 build/build_single.py` 후 `index.html`에 `__PLTCM_ENGINE_START__`가 정확히 1회, `__RTS_SEED_START__`가 정확히 2회.
- 브라우저: ⑥ 근거 밴드(임시 시드 표시 포함), 오류 케이스 F 표시와 이상징후, 품질사양 사전 항목 2개와 사양 문장 인식, 규격 불일치 경고, 압연두께Set보정관리 문구 8곳.

# 6. 빌드와 문서

- `build/README.md`에 엔진 파일·주입 스크립트·시드 이중 주입·테스트 명령(Node 20+)·작업 순서를 추가한다.
- `.gitignore`는 변경하지 않는다. `tests/`는 커밋한다.
- 커밋 단위: (1) 엔진+테스트, (2) 주입 스크립트·시드 이중 주입+시뮬레이션 연동, (3) 품질사양·압연두께Set·README·재빌드.

# 7. 실DB 단계 대응표

| 엔진 항목 | AS-IS 테이블·컬럼 (해설서 기준) | 비고 |
|---|---|---|
| `order.*` | 주문(OMS) 컬럼 동명 | `SPC_ORG_CD`는 규격약호에서 파생 |
| `request.value` / `unit` | 고객사양의 고객요청압연두께 / `THK_COR_UNT` | 값 컬럼명은 확인 필요 |
| `layers.galThkUm` | 설계 `GAL_THK_TRV` | µm |
| `layers.paint*Um` | 칼라 제조사양 도막두께 | 컬럼명 확인 필요 |
| `criteria.setCorrection` | C10B2060 | 룰 형태 동일 |
| `criteria.spCorrection` | C10B2070 | 조건 열은 xlsx 확인 후 확정 |
| `criteria.thkTolerance` | C10B2190 | 조건 열은 xlsx 확인 후 확정 |
| `values.CRM_THK` | 지역변수 `crm_thk` (저장 안 됨) | 실적 비교 불가, 근거용. **생산가부 `ROL_TAR_THK`와 다른 값이며 비교 금지** (해설서 10장) |
| `values.PLTCM_THK_TRV` | `TB_C10_QLT_DSN_MNF.PLTCM_THK_TRV` | 비교 대상 |
| `values.PLTCM_SET_THK_TRV` | `TB_C10_QLT_DSN_MNF.PLTCM_SET_THK_TRV` | 비교 대상 |
| `values.PLTCM_THK_LLV/ULV` | 제조사양의 PLTCM 두께 하한·상한 | 비교 대상. 자리수 처리 확인 후 |

비교 단위는 주문번호 + 주문행 + 제조구분이며, 반복복사·차선복사·화면수정 이력이 있는 행은 비교에서 제외하거나 별도 표시한다 (해설서 7·8장).

# 8. 검증 항목 (운영 대조 필요)

| # | 항목 | 스펙의 잠정 처리 |
|---|---|---|
| 1 | CRN·TCT의 소수 4자리 반올림 구현 | `Math.round(x×10000)/10000` |
| 2 | Java `Double.toString` vs JS `String()` 표기 차이 | 동일 가정, 지수 표기는 폴백 |
| 3 | 두께구분 1·2·3 외 값의 STANDARD 분기 | BMT 행 + 경고 |
| 4 | SP 조회 예외(`MasterDataException` 외)의 처리 | 0건은 0%, 그 외 예외는 재현 안 함 |
| 5 | SP 다건 시 AS-IS 조회 SQL의 정렬(첫 결과 기준) | `no` → `id` 오름차순 |
| 6 | 품명 5·7의 공차 조회 수행 여부 | 수행 |
| 7 | 공차 하한·상한(`SET + 공차`)의 자리수 처리 (`DbSearchProcSizeData` 1279~1641행의 `thk_dot` 적용 여부) | `truncate3` |
| 8 | `thk_dot`의 음수 입력 동작 (`DbCommonUtil` 378~396행)과 SET 정규화의 음수 동작 (332~367행) | 부호 분리 처리 + `W_NEGATIVE` |
| 9 | 고객요청압연두께 값의 AS-IS 컬럼명 | TO-BE 코드 `CUS_ROL_THK` |
| 10 | 도막두께의 AS-IS 출처 컬럼. 후면 도막의 사양 코드 없음 | 칼라 섹션 값 사용 |
| 11 | C10B2070·C10B2190의 실제 조회 조건 열 | `DEFAULT_DEFS` 잠정안 |
| 12 | 기준 유효기간(시작·종료일시) 적용 | `status='Y'`만 사용 |

# 부록 A. 골든 케이스 상세값

해설서 5.1절 조건: `t 0.500, ORD_THK_TP '2', ORD_THK_MNG_CD 'D', g 20µm, request {0,''}, C10B2060 1건 {adj 0.003, unit CRN}, C10B2070 1건 {rate 0.8}, C10B2190 1건 {llv −0.010, ulv 0.015}`.

| 단계 | 산식 | 값 |
|---|---|---|
| 단위 변환 | 20 / 1000 | 0.020 |
| 적용폭 | 그룹수 0 → 주문폭 | 주문폭 |
| 경로 | 요청 0, 구분 2 | STANDARD |
| 압연목표 | 0.500 − 0.020 + 0.003, round4 | 0.483 |
| SP | 0.483 + 0.483 × 0.8 / 100 | 0.48686399999999996 (수학값 0.486864) |
| 절삭 | truncate3 | 0.486 |
| SET | 세 번째 자리 6 → 5 | 0.485 |
| 공차 | truncate3(0.485 − 0.010) / truncate3(0.485 + 0.015) | 0.475 / 0.500 |
