#!/usr/bin/env python3
"""압연두께Set보정관리 시드 파이프라인.

AS-IS 룰 시트(RuleData C10B2060 · 압연두께Set치보정기준.xlsx)를 읽어
정규화한 시드 JSON을 만들고, 모듈(modules/rolling-thickness-set.html)의
마커 구간 /*__RTS_SEED_START__*/ … /*__RTS_SEED_END__*/ 에 주입한다.

사용법:
  python3 build/rolling_thickness_set_seed.py --check --emit --inject
  python3 build/rolling_thickness_set_seed.py --xlsx <경로> --emit --inject
  python3 build/rolling_thickness_set_seed.py --inject          # 기존 JSON만 재주입

원본 xlsx 는 사내 기준정보라 커밋하지 않는다(.gitignore: sources/).
기본 탐색 경로는 sources/압연두께Set치보정기준.xlsx, 없으면 RTS_XLSX 환경변수, 없으면 --xlsx.
xlsx 없이도 build/rolling_thickness_set_seed.json 이 있으면 --inject 만으로 재주입할 수 있다.
"""

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = lambda *p: os.path.join(ROOT, *p)

XLSX_NAME = '압연두께Set치보정기준.xlsx'
SEED_JSON = path('build', 'rolling_thickness_set_seed.json')
MODULE = path('modules', 'rolling-thickness-set.html')
MARK_S = '/*__RTS_SEED_START__*/'
MARK_E = '/*__RTS_SEED_END__*/'

# 조건 컬럼(순서 = 시트 열 순서). key, 라벨, 연산자 열(1-based), 숫자형 여부
COND_DEFS = [
    ('prod',    '품명코드',     3,  False),
    ('org',     '규격기관',     6,  False),
    ('spec',    '규격약호',     9,  False),
    ('use',     '주문용도',     12, False),
    ('cust',    '고객사',       15, False),
    ('thkKind', '주문두께구분', 18, False),
    ('thkMng',  '두께관리코드', 21, False),
    ('coat',    '도금량코드',   24, False),
    ('thk',     '두께범위',     27, True),
    ('wid',     '폭범위',       30, True),
]
COL_NO, COL_ADJ, COL_UNIT = 1, 33, 34
VALID_OPS = {'NOT_CHECK', '=', '!=', '>', '>=', '<', '<=',
             'BETWEEN1', 'BETWEEN2', 'BETWEEN3', 'BETWEEN4',
             'LIKE1', 'LIKE2', 'LIKE3', 'IN', 'NOT_IN', 'NOT_NULL', 'IS_NULL'}


class PipelineError(Exception):
    pass


def find_xlsx(opt):
    cands = [opt, os.environ.get('RTS_XLSX'), path('sources', XLSX_NAME)]
    for c in cands:
        if c and os.path.isfile(c):
            return c
    raise PipelineError(
        'FAIL: 입력 파일 없음: ' + XLSX_NAME + '\n'
        '  1) sources/ 에 배치:  mkdir -p sources && cp <원본> sources/\n'
        '  2) 환경변수:          RTS_XLSX=<경로>\n'
        '  3) 옵션:              --xlsx <경로>')


def s(v):
    return '' if v is None else str(v).strip()


def norm_list(v):
    """'H0301P, H0392S' → 'H0301P,H0392S' (공백 제거, 빈 항목 제거)"""
    return ','.join(x.strip() for x in s(v).split(',') if x.strip())


def num(v):
    t = s(v).replace('+', '')
    if t == '':
        return None
    f = float(t)
    return int(f) if f == int(f) and '.' not in t else f


def parse(xlsx):
    import openpyxl
    ws = openpyxl.load_workbook(xlsx, data_only=True).worksheets[0]
    head = {'ruleId': s(ws.cell(2, 1).value), 'version': s(ws.cell(2, 2).value),
            'type': s(ws.cell(2, 3).value), 'status': s(ws.cell(2, 4).value),
            'startAt': s(ws.cell(2, 5).value), 'name': s(ws.cell(2, 6).value)}
    rules = []
    for r in range(6, ws.max_row + 1):
        no = s(ws.cell(r, COL_NO).value)
        if no == 'END!':
            break
        if no == '':
            continue
        cond = {}
        for key, label, col, is_num in COND_DEFS:
            op = s(ws.cell(r, col).value).upper() or 'NOT_CHECK'
            if op not in VALID_OPS:
                raise PipelineError('row %d %s: 알 수 없는 연산자 %r' % (r, label, op))
            v1 = ws.cell(r, col + 1).value
            v2 = ws.cell(r, col + 2).value
            if is_num:
                cond[key] = {'op': op, 'v1': num(v1), 'v2': num(v2)}
            else:
                cond[key] = {'op': op, 'v1': norm_list(v1), 'v2': norm_list(v2)}
        adj_raw = s(ws.cell(r, COL_ADJ).value)
        rules.append({
            'no': int(no),
            'cond': cond,
            'adj': float(adj_raw.replace('+', '')),
            'adjRaw': adj_raw,
            'unit': s(ws.cell(r, COL_UNIT).value) or 'CRN',
            'status': 'Y',
            'srcRow': r,
        })
    return {'head': head, 'rules': rules}


def check(seed):
    rules = seed['rules']
    assert len(rules) == 82, 'rule count %d != 82' % len(rules)
    assert [x['no'] for x in rules] == list(range(1, 83)), 'no. 연속 아님'
    assert all(x['unit'] == 'CRN' for x in rules), '단위 CRN 외 존재'
    for x in rules:
        for key, label, col, is_num in COND_DEFS:
            c = x['cond'][key]
            if c['op'].startswith('BETWEEN'):
                assert c['v1'] is not None and c['v2'] is not None, 'no.%d %s BETWEEN 값 누락' % (x['no'], label)
            elif c['op'] in ('NOT_CHECK', 'NOT_NULL', 'IS_NULL'):
                pass
            else:
                assert c['v1'] not in (None, ''), 'no.%d %s 비교값1 누락' % (x['no'], label)
    print('CHECK OK: rules=%d, adj range %.3f ~ %.3f' % (
        len(rules), min(x['adj'] for x in rules), max(x['adj'] for x in rules)))


def emit(seed):
    with open(SEED_JSON, 'w', encoding='utf-8') as f:
        json.dump(seed, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('EMIT OK:', SEED_JSON)


def inject():
    seed = json.load(open(SEED_JSON, encoding='utf-8'))
    src = open(MODULE, encoding='utf-8').read()
    # 마커는 <script> 블록 안의 것만 대상으로 한다 (주석 등 다른 곳의 언급은 무시)
    i = src.rfind(MARK_S)
    j = src.find(MARK_E, i) if i >= 0 else -1
    if i < 0 or j < 0 or src.count(MARK_E) != 1:
        raise PipelineError('마커를 찾을 수 없음: ' + MODULE)
    body = 'var SEED=' + json.dumps(seed, ensure_ascii=False, separators=(',', ':')) + ';'
    out = src[:i + len(MARK_S)] + '\n' + body + '\n' + src[j:]
    if out != src:
        open(MODULE, 'w', encoding='utf-8', newline='').write(out)
        print('INJECT OK: %d rules → %s' % (len(seed['rules']), MODULE))
    else:
        print('INJECT: 변경 없음')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--xlsx')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--emit', action='store_true')
    ap.add_argument('--inject', action='store_true')
    a = ap.parse_args()
    try:
        if a.check or a.emit:
            seed = parse(find_xlsx(a.xlsx))
            if a.check:
                check(seed)
            if a.emit:
                emit(seed)
        if a.inject:
            inject()
        if not (a.check or a.emit or a.inject):
            ap.print_help()
    except (PipelineError, AssertionError) as e:
        print(e, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
