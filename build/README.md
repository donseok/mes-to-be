# MES To-Be Portal — 빌드 안내

배포되는 `index.html`(저장소 루트)은 **직접 수정하지 않는다.**
아래 소스 3종을 수정한 뒤 빌드 스크립트로 재생성한다.

## 소스 구조

| 파일 | 역할 |
|---|---|
| `modules/quality-spec.html` | 품질사양 관리 모듈 (사양 목록·신규 등록·코드 사전·변경 이력·전송 이력·시뮬레이션 — 화면/기능의 대부분) |
| `build/template.html` | 포털 셸 (사이드바 메뉴, 해시 라우팅 뼈대, iframe 자리) |
| `assets/portal.css` · `assets/portal.js` | 포털 셸의 스타일·동작 (사이드바 접기, 라우팅, 모바일 서랍) |
| `01. 품질사양(...)_프로토타입 (1).html` | 최초 프로토타입 원본 (참고용, 빌드에 사용 안 함) |

## 빌드

```bash
python3 build/build_single.py
```

`build/template.html`에 CSS/JS를 인라인하고 모듈 전체를 iframe `srcdoc`으로 내장해
루트 `index.html` 하나로 만든다. GitHub Pages는 이 파일 하나로 동작한다.

## 작업 순서

1. 소스 수정 (모듈 화면·기능은 `modules/quality-spec.html`)
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
