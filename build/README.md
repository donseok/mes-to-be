# MES To-Be Portal — 빌드 안내

배포되는 `index.html`(저장소 루트)은 **직접 수정하지 않는다.**
아래 소스 3종을 수정한 뒤 빌드 스크립트로 재생성한다.

## 소스 구조

| 파일 | 역할 |
|---|---|
| `modules/quality-spec.html` | 품질사양 관리 모듈 (사양 목록·신규 등록·코드 사전·변경 이력·전송 이력·시뮬레이션 — 화면/기능의 대부분) |
| `modules/quality-design.html` | 품질설계 모듈 (좌: 의뢰현황 목록 · 우: 설계결과 — 구 탭 9종을 펼치기/접기 섹션으로 통합) |
| `modules/order-weight-error.html` | 주문단중에러관리 모듈 (주문단중 × 분할 수 매트릭스 — Min/Max 허용범위 하이라이트·셀 수정·수정 이력) |
| `modules/production-feasibility.html` | 생산가부관리 모듈 (B.D 생산범위(2CGL GI) 탭 — 참조 엑셀 시트 재현: 재질별 폭 × 두께 가부 매트릭스·가부 간편조회·셀 상태 수정·수정 이력) |
| `modules/order-consistency.html` | 주문정합성체크 모듈 (엑셀 룰 2종을 정제·병합한 통합 룰셋 138건 — 룰 목록·조건 빌더·주문 시뮬레이션·검토 이슈·코드 사전·변경 이력 6탭. 시드는 `build/clean_rules.py --inject`가 `/*__OC_SEED_START__*/` 마커 구간에 주입) |
| `modules/quality-judgment.html` | 품질판정 1차 화면 (판정 대기 목록 · 검사값 vs 기준값 drawer · 합격/불합격/보류) |
| `modules/color-submaterial.html` | 칼라부재료관리 1차 화면 (부재료 마스터 목록 · 색상 · 사용/중지) |
| `modules/color-bom.html` | 칼라BOM관리 1차 화면 (BOM 목록 · 도장 층 구성 drawer) |
| `modules/quality-certificate.html` | 품질보증서관리 1차 화면 (발행 목록 · 보증 항목 · PDF 발행) |
| `modules/inspection-certificate.html` | 검사증명서관리 1차 화면 (MTC 목록 · 기계적성질 · 화학 성분) |
| `modules/tag-management.html` | Tag관리 1차 화면 (Tag 발행 목록 · Tag 레이아웃 미리보기) |
| `build/template.html` | 포털 셸 (사이드바 메뉴, 해시 라우팅 뼈대, iframe 자리) |
| `assets/portal.css` · `assets/portal.js` | 포털 셸의 스타일·동작 (사이드바 접기, 라우팅, 모바일 서랍) |

## 빌드

```bash
python3 build/build_single.py
```

`build/template.html`에 CSS/JS를 인라인하고 다섯 모듈(품질사양·품질설계·주문단중에러·생산가부·주문정합성체크) 전체를 iframe `srcdoc`으로 내장해
루트 `index.html` 하나로 만든다. GitHub Pages는 이 파일 하나로 동작한다.

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
2. `python3 build/build_single.py` 로 `index.html` 재생성
3. 브라우저에서 `index.html` 열어 확인
4. `git add -A && git commit` → `git push` (푸시는 GitHub 토큰 필요)

## 주요 구현 메모

- 목업 데이터는 브라우저 localStorage에만 저장 (`LS_KEY` 버전을 올리면 시드로 초기화됨)
- 페이지 크기(10/20)는 `qspec-pagesize` 키로 별도 저장
- 변경 이력은 사양과 독립된 `state.changelog`에 전/후 값을 보존 (삭제돼도 유지)
- 엑셀 다운로드는 외부 라이브러리 없이 xlsx(zip)를 직접 생성
- 모듈은 iframe 내부(embedded)에서 자기 상단바를 숨김 — 단독 실행 시엔 표시
- 조회 화면들은 `.fixed-grid` 내부 스크롤로 조회조건·컬럼 헤더 고정
- 코드 사전: 구분·사용 여부·키워드 조회 지원, 항목별 데이터 타입·자리수 관리 (예: VARCHAR2(8) — DATE는 자리수 없음)
