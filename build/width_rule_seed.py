#!/usr/bin/env python3
"""폭수축량 · 폭마진량 룰 시드 파이프라인.

원본 RuleData xlsx 7종을 파싱해 폭수축량 관리 모듈과 폭마진량 관리 모듈이
공유하는 하나의 시드 JSON(build/width_rule_seed.json)을 만든다.

원본 7종과 프로그램 배정
  폭수축량(폭감소량) — C10B1074 PLTCM · C10B1075 CGL · C10B1076 EGL
                      C10B1077 정전 · C10B1078 CCL
  폭마진량(마진폭)   — C10B1073 PLTCM · C10B1079 정전

엑셀 시트 레이아웃(모든 업무기준 공통)
  1행 업무기준명/버전/유형/상태/시작일자/기준설명  (2행이 값)
  3행 no. | 우선순위 | 조건 … | 결과
  4행                      조건 그룹 이름 …
  5행                      연산자 | 비교값1 | 비교값2 | …   (그룹마다 3열)
  6행~ 데이터, 'END!' 행 직전까지

원본은 사내 기준정보라 커밋하지 않는다. 기본 탐색 경로는 sources/ 이고
RULE_XLSX_DIR 환경변수나 --dir 로 다른 위치를 가리킬 수 있다.

사용법
  python3 build/width_rule_seed.py --check                # 원본 파싱 + 어서션
  python3 build/width_rule_seed.py --emit                 # build/width_rule_seed.json 재생성
  python3 build/width_rule_seed.py --emit --inject        # + 두 모듈 마커 구간에 주입
  python3 build/width_rule_seed.py --verify               # xlsx 없이 모듈 사본 == JSON 검사
  python3 build/width_rule_seed.py --reinject             # xlsx 없이 기존 JSON 재주입
"""

import argparse
import glob
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = lambda *p: os.path.join(ROOT, *p)

SEED_JSON = path('build', 'width_rule_seed.json')

# 원본 규격(ID) — 시트 레이아웃은 전 업무기준이 같으므로 그룹 수로만 분기한다.
# kind: 'reduction'(폭수축량) | 'margin'(폭마진량)
# proc: 프로그램 안에서 공정을 묶는 키. 같은 프로그램 안에서 하나의 프로그램으로 묶인다.
# result: 결과 컬럼 이름, unit: 결과 단위
SPECS = {
    'C10B1074': dict(
        kind='reduction', proc='PLTCM', procLabel='PLTCM', result='폭감소량', unit='mm',
        fields=[
            ('rawCd', '원자재코드', 'text'),
            ('pltcmThk', 'PLTCM두께범위', 'num'),
            ('pltcmWid', 'PLTCM폭범위', 'num'),
        ]),
    'C10B1075': dict(
        kind='reduction', proc='CGL', procLabel='CGL(냉연도금)', result='폭감소량', unit='mm',
        fields=[
            ('procCd', '공정', 'text'),
            ('prodCd', '품명코드', 'text'),
            ('matCd', '재질코드', 'text'),
            ('rawCd', '원자재코드', 'text'),
            ('pltcmThk', 'PLTCM두께범위', 'num'),
            ('prodWid', '제품폭범위', 'num'),
        ]),
    'C10B1076': dict(
        kind='reduction', proc='EGL', procLabel='EGL(전해도금)', result='폭감소량', unit='mm',
        fields=[
            ('procCd', '공정', 'text'),
            ('prodCd', '품명', 'text'),
            ('matCd', '재질코드', 'text'),
            ('rawCd', '원자재코드', 'text'),
            ('pltcmThk', 'PLTCM두께범위', 'num'),
            ('prodWid', '제품폭범위', 'num'),
        ]),
    'C10B1077': dict(
        kind='reduction', proc='JZ', procLabel='정전(정전처리)', result='폭감소량', unit='mm',
        fields=[
            ('prodCd', '품명코드', 'text'),
            ('matCd', '재질코드', 'text'),
            ('pltcmThk', 'PLTCM두께범위', 'num'),
            ('prodWid', '제품폭범위', 'num'),
        ]),
    'C10B1078': dict(
        kind='reduction', proc='CCL', procLabel='CCL(칼라코팅)', result='폭감소량', unit='mm',
        fields=[
            ('prodCd', '품명코드', 'text'),
            ('matCd', '재질코드', 'text'),
            ('pltcmThk', 'PLTCM두께범위', 'num'),
            ('prodWid', '제품폭범위', 'num'),
        ]),
    'C10B1073': dict(
        kind='margin', proc='PLTCM', procLabel='PLTCM', result='마진폭', unit='mm',
        fields=[
            ('rawCd', '원자재코드', 'text'),
            ('rawThk', '원자재두께범위', 'num'),
            ('pltcmWid', 'PLTCM출측폭범위', 'num'),
            ('cust', '고객사', 'text'),
        ]),
    'C10B1079': dict(
        kind='margin', proc='JZ', procLabel='정전(정전처리)', result='마진폭', unit='mm',
        fields=[
            ('edge', '주문Edge지정구분', 'text'),
            ('prodCd', '품명코드', 'text'),
            ('prodForm', '제품형태', 'text'),
            ('coatWay', '코팅방식', 'text'),
            ('resin', '수지타입', 'text'),
            ('thk', '두께범위', 'num'),
            ('bom', 'CCLBOM번호', 'text'),
            ('spangle', '주문Spangle구분', 'text'),
        ]),
}

# 프로그램 안에서의 공정 순서(압연 → 후공정 → 도장 → 칼라)
PROC_ORDER = {
    'reduction': ['PLTCM', 'CGL', 'EGL', 'JZ', 'CCL'],
    'margin': ['PLTCM', 'JZ'],
}

# 마커 → (모듈 파일, 시드 변수명)
MODULES = {
    'reduction': (path('modules', 'width-reduction.html'), 'SEED_REDUCTION'),
    'margin': (path('modules', 'width-margin.html'), 'SEED_MARGIN'),
}
# 마커는 /*__<변수명>_START__*/ /*__<변수명>_END__*/ 형태 (변수명에 SEED 가 이미 들어 있다)
def MARKER(var):
    return '/*__%s_START__*/' % var, '/*__%s_END__*/' % var

# ── 코드 사전(코드 범례 탭) ───────────────────────────────────────────
# 값은 마스터코드 모듈과 같은 라벨 체계를 쓴다. 라벨이 확인되지 않은 코드는
# 라벨 없이 코드값만 노출한다(추측 금지).
PROD_CODES = {
    '1': 'CCI', '2': 'CCEI', '3': 'CCGI', '4': 'CCLI', '5': 'CCAI', '6': 'CCGX',
    '7': 'CCUS', '8': 'CCNI', '9': 'CCLX', 'A': 'P/O Skin Pass', 'B': 'P/O No Skin Pass',
    'C': 'CR', 'D': 'F/H', 'E': 'EGI', 'G': 'GI', 'H': 'Hot Coil', 'J': 'G/A',
    'K': 'HGI', 'L': 'G/L', 'M': 'Mini Mill', 'N': 'ZnNi', 'S': 'SUS', 'U': 'Aluminum',
    'V': 'GIX', 'W': 'GLX', 'X': 'HR SKELP', 'Y': '포장재', 'Z': '통판재',
}

# 공정(라인) 코드 — C10B1075 는 82·83·84·85·8O, C10B1076 은 91·92.
# 라벨은 원본에 없어 코드값만 둔다(모듈 화면에서 "사전 미등록" 으로 표시).
PROC_CODES = ['82', '83', '84', '85', '8O', '91', '92']

# 정전 폭마진량(C10B1079) 조건 코드
EDGE_CODES = {'S': '지정', 'M': '미지정', 'C': '일괄'}
PROD_FORM_CODES = {'S': 'S', 'C': 'C'}
COAT_WAY_CODES = {'X': 'X', 'Y': 'Y', 'Z': 'Z', 'F': 'F', 'G': 'G', 'H': 'H', 'J': 'J'}
RESIN_CODES = {'CC': 'CC', 'HB': 'HB'}

CODEDICTS = {
    'prodCd': ('품명코드 (PRD_NM_CD)', PROD_CODES),
    'procCd': ('공정(라인) 코드', None),
    'edge': ('주문Edge지정구분', EDGE_CODES),
    'prodForm': ('제품형태', PROD_FORM_CODES),
    'coatWay': ('코팅방식', COAT_WAY_CODES),
    'resin': ('수지타입', RESIN_CODES),
}

NO_VALUE_OPS = ('NOT_CHECK', 'NOT_NULL', 'IS_NULL')
NUM_OPS = ('BETWEEN1', 'BETWEEN2', 'BETWEEN3', 'BETWEEN4', '>', '>=', '<', '<=', '=', '!=')
TEXT_OPS = ('NOT_CHECK', 'IN', 'NOT_IN', 'LIKE1', 'LIKE2', 'LIKE3', '=', '!=',
            'NOT_NULL', 'IS_NULL')


class PipelineError(Exception):
    pass


def find_xlsx(base_dir, rule_id):
    """RuleData(C10B1074).xlsx 또는 RuleData(C10B1074)_<팀>_<n>_<일자>_<작성자>.xlsx 를 찾는다."""
    pat = 'RuleData(%s).xlsx' % rule_id
    hits = sorted(glob.glob(os.path.join(base_dir, pat)) +
                  glob.glob(os.path.join(base_dir, 'RuleData(%s)_*.xlsx' % rule_id)))
    return hits[0] if hits else None


# ── xlsx 읽기 ────────────────────────────────────────────────────────────
def read_sheet(xlsx, rule_id):
    import openpyxl
    wb = openpyxl.load_workbook(xlsx, data_only=True, read_only=True)
    want = 'RuleData(%s)' % rule_id
    ws = None
    for s in wb.worksheets:
        if s.title.strip() == want:
            ws = s
            break
    if ws is None:
        if len(wb.worksheets) == 1:
            ws = wb.worksheets[0]
        else:
            raise PipelineError('%s: 시트 %s 를 찾지 못했습니다 (%s)'
                                % (os.path.basename(xlsx), want,
                                   ', '.join(s.title for s in wb.worksheets)))
    rows = [[('' if c is None else c) for c in r]
            for r in ws.iter_rows(values_only=True)]
    wb.close()
    return rows


def txt(v):
    """셀 → 문자열. 숫자 셀의 뒤 .0 은 제거한다."""
    if v is None:
        return ''
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if isinstance(v, float):
        if v == int(v):
            return str(int(v))
        return repr(v)
    if isinstance(v, int):
        return str(v)
    return str(v).strip()


def num(v):
    """셀 → float 또는 None. '0.8' '8O' 처럼 숫자가 아니면 None."""
    s = txt(v)
    if s == '':
        return None
    try:
        return float(s)
    except ValueError:
        return None


def norm_list(s):
    """쉼표 목록 정규화 — 공백 제거 후 정렬(대소문자 유지, 원본 코드값 기준)."""
    return ','.join(p.strip() for p in s.split(',') if p.strip())


# ── 파싱 ────────────────────────────────────────────────────────────────
def parse(xlsx, rule_id, issues):
    spec = SPECS[rule_id]
    rows = read_sheet(xlsx, rule_id)
    base = os.path.basename(xlsx)

    # 머리말 (1·2행)
    head = {}
    for c, v in enumerate(rows[0]):
        k = txt(v)
        if k and c < 8:
            head[k] = txt(rows[1][c]) if len(rows) > 1 and c < len(rows[1]) else ''

    # 결과 컬럼 = 3행에서 '결과' 가 있는 열
    hdr3 = rows[2]
    res_col = None
    for c, v in enumerate(hdr3):
        if txt(v) == '결과':
            res_col = c
    if res_col is None:
        raise PipelineError('%s: 3행에서 "결과" 열을 찾지 못했습니다' % base)

    n_groups = (res_col - 2) // 3
    if (res_col - 2) % 3 != 0:
        raise PipelineError('%s: 조건 열 수가 3의 배수가 아닙니다 (결과열=%d)' % (base, res_col + 1))
    if n_groups != len(spec['fields']):
        raise PipelineError('%s: 조건 그룹 %d개인데 시트 헤더는 %d개 (결과열=%s)'
                            % (base, n_groups, len(spec['fields']), chr(65 + res_col)))

    # 4행 그룹 이름 확인
    names = []
    for g in range(n_groups):
        names.append(txt(rows[3][2 + g * 3]))
    for g, (key, label, _t) in enumerate(spec['fields']):
        if names[g] and names[g] != label:
            issues.append('%s 조건그룹 %d 헤더 불일치: 시트 "%s" / 정의 "%s"'
                          % (rule_id, g + 1, names[g], label))

    # 데이터 행: 6행 ~ 'END!' 직전
    rules = []
    prev_prio = 1
    for ri in range(5, len(rows)):
        row = rows[ri]
        if len(row) <= res_col:
            continue
        if txt(row[0]).upper() == 'END!':
            break
        no_raw = txt(row[0])
        if no_raw == '':
            continue
        try:
            no = int(float(no_raw))
        except ValueError:
            issues.append('%s %d행: 순번 "%s" 파싱 불가 — 건너뜁니다' % (rule_id, ri + 1, no_raw))
            continue

        # 우선순위: 있으면 쓰고, 없으면 직전 값을 이어받는다(그룹 표기용 공란)
        prio_raw = txt(row[1]) if len(row) > 1 else ''
        if prio_raw == '':
            prio = prev_prio
        else:
            try:
                prio = int(float(prio_raw))
            except ValueError:
                issues.append('%s no.%s: 우선순위 "%s" 파싱 불가 → 직전값 %s 사용'
                              % (rule_id, no, prio_raw, prev_prio))
                prio = prev_prio
            else:
                prev_prio = prio

        cond = {}
        stray = []
        for g, (key, label, ftype) in enumerate(spec['fields']):
            c0 = 2 + g * 3
            op = txt(row[c0]).upper()
            v1 = txt(row[c0 + 1])
            v2 = txt(row[c0 + 2])
            if op not in TEXT_OPS and op not in NUM_OPS:
                raise PipelineError('%s no.%s %s: 알 수 없는 연산자 "%s"' % (base, no, label, op))
            # NOT_CHECK·NOT_NULL·IS_NULL 은 항목 성격과 무관하게 허용된다
            if op not in NO_VALUE_OPS and op not in (NUM_OPS if ftype == 'num' else TEXT_OPS):
                issues.append('%s no.%s %s: 항목 성격(%s)에 맞지 않는 연산자 %s → 그대로 둡니다'
                              % (rule_id, no, label, ftype, op))
            if op == '':
                op = 'NOT_CHECK'
            if ftype == 'num':
                n1, n2 = num(v1), num(v2)
                if op not in NO_VALUE_OPS and n1 is None:
                    raise PipelineError('%s no.%s %s: 비교값1 "%s" 이 숫자가 아닙니다'
                                        % (base, no, label, v1))
                cell = {'op': op, 'v1': n1, 'v2': n2}
            else:
                cell = {'op': op, 'v1': norm_list(v1) if op in ('IN', 'NOT_IN') else v1,
                        'v2': v2}
            if op in NO_VALUE_OPS and (v1 != '' or v2 != ''):
                # 원본에 남아 있는 잔존 비교값 — 판정에는 쓰이지 않으므로 표시만 한다
                stray.append({'key': key, 'label': label, 'v1': v1, 'v2': v2})
            cond[key] = cell

        res = num(row[res_col])
        if res is None:
            raise PipelineError('%s no.%s: 결과 "%s" 이 숫자가 아닙니다'
                                % (base, no, txt(row[res_col])))

        rid = '%s-%s-%03d' % ('WR' if spec['kind'] == 'reduction' else 'WM', spec['proc'], len(rules) + 1)
        rule = {'id': rid, 'no': no, 'prio': prio, 'cond': cond, 'res': res,
                'status': head.get('상태') or 'Y', 'srcRow': ri + 1, 'note': ''}
        if stray:
            rule['stray'] = stray
            issues.append('%s no.%s: %s — %s 연산자인데 비교값이 남아 있습니다 (원본 그대로, 판정 미사용)'
                          % (rule_id, no, rid, ', '.join(s['label'] for s in stray)))
        rules.append(rule)

    if not rules:
        raise PipelineError('%s: 데이터 행이 없습니다' % base)
    return {
        'ruleId': rule_id,
        'name': head.get('기준설명') or spec['result'],   # 2행 업무기준명 칸은 코드(C10B1073)라 설명을 대신 쓴다
        'version': head.get('버전') or '1.0',
        'type': head.get('유형') or '1B0',
        'status': head.get('상태') or 'Y',
        'startAt': head.get('시작일자') or '',
        'kind': spec['kind'],
        'proc': spec['proc'],
        'procLabel': spec['procLabel'],
        'result': spec['result'],
        'unit': spec['unit'],
        'fields': [{'key': k, 'label': l, 'type': t} for k, l, t in spec['fields']],
        'rules': rules,
    }


def build(issues):
    base_dir = os.environ.get('RULE_XLSX_DIR') or path('sources')
    out = {'generated': '원본 RuleData xlsx 파싱 결과', 'processes': {}}
    for kind in ('reduction', 'margin'):
        procs = []
        for proc in PROC_ORDER[kind]:
            rid = next(k for k, v in SPECS.items()
                       if v['kind'] == kind and v['proc'] == proc)
            xlsx = find_xlsx(base_dir, rid)
            if not xlsx:
                raise PipelineError('입력 파일 없음: %sRuleData(%s).xlsx\n  폭수축량·폭마진량 시드에는 원본 RuleData 7종이 '
                                    '모두 필요합니다. sources/ 에 배치하거나\n'
                                    '  RULE_XLSX_DIR=<디렉토리> python3 build/width_rule_seed.py'
                                    % xlsx)
            procs.append(parse(xlsx, rid, issues))
        out['processes'][kind] = procs
    return out


# ── 어서션 ──────────────────────────────────────────────────────────────
EXPECT = {
    ('reduction', 'PLTCM'): (32, 'C10B1074'),
    ('reduction', 'CGL'): (139, 'C10B1075'),
    ('reduction', 'EGL'): (10, 'C10B1076'),
    ('reduction', 'JZ'): (3, 'C10B1077'),
    ('reduction', 'CCL'): (2, 'C10B1078'),
    ('margin', 'PLTCM'): (33, 'C10B1073'),
    ('margin', 'JZ'): (26, 'C10B1079'),
}


def check(data, issues):
    for kind, procs in data['processes'].items():
        for p in procs:
            want_n, want_id = EXPECT[(kind, p['proc'])]
            got = len(p['rules'])
            if got != want_n:
                raise PipelineError('%s %s 룰 수 %d건 — 기대 %d건' % (p['ruleId'], p['proc'], got, want_n))
            if p['ruleId'] != want_id:
                raise PipelineError('%s工序 매핑 오류' % p['ruleId'])
            ids = set()
            for r in p['rules']:
                if r['id'] in ids:
                    raise PipelineError('%s: 룰 id 중복 %s' % (p['ruleId'], r['id']))
                ids.add(r['id'])
            for r in p['rules']:
                for f in p['fields']:
                    c = r['cond'][f['key']]
                    op = c['op']
                    if op.startswith('BETWEEN'):
                        if c['v1'] is None or c['v2'] is None:
                            raise PipelineError('%s %s %s: BETWEEN 인데 비교값이 없습니다'
                                                % (p['ruleId'], r['id'], f['label']))
                        if c['v1'] > c['v2']:
                            issues.append('%s %s %s: 비교값1(%s) > 비교값2(%s) — 빈 구간이 될 수 있습니다'
                                          % (p['ruleId'], r['id'], f['label'], c['v1'], c['v2']))
    for kind, procs in data['processes'].items():
        total = sum(len(p['rules']) for p in procs)
        print('OK  %-9s 공정 %d개 · 룰 %d건  (%s)'
              % (kind, len(procs), total,
                 ', '.join('%s %d' % (p['proc'], len(p['rules'])) for p in procs)))


# ── 주입 ────────────────────────────────────────────────────────────────
def slice_for(data, kind):
    """모듈에 주입할 시드 조각. 코드 사전은 모듈이 하드코딩하지 않고 여기서 받는다."""
    return {'generated': data['generated'],
            'kind': kind,
            'processes': data['processes'][kind],
            'dict': {
                'procCodes': PROC_CODES,
                'maps': {k: {'label': v[0], 'items': v[1] or {}}
                         for k, v in CODEDICTS.items()},
            }}


def inject(data, quiet=False):
    for kind, (mod, var) in MODULES.items():
        if not os.path.exists(mod):
            raise PipelineError('모듈 파일이 없습니다: %s' % mod)
        text = open(mod, encoding='utf-8').read()
        start, end = MARKER(var)
        i, j = text.find(start), text.find(end)
        if i < 0 or j < 0:
            raise PipelineError('%s: 마커 %s / %s 를 찾지 못했습니다' % (mod, start, end))
        body = json.dumps(slice_for(data, kind), ensure_ascii=False, separators=(',', ':'))
        line = start + '\nvar %s=%s;\n' % (var, body) + end
        out = text[:i] + line + text[j + len(end):]
        if out != text:
            open(mod, 'w', encoding='utf-8').write(out)
        if not quiet:
            print('inject  %s  (%d bytes)' % (os.path.relpath(mod, ROOT), len(out.encode('utf-8'))))


def verify():
    data = json.load(open(SEED_JSON, encoding='utf-8'))
    fail = 0
    for kind, (mod, var) in MODULES.items():
        text = open(mod, encoding='utf-8').read()
        start, end = MARKER(var)
        i, j = text.find(start), text.find(end)
        if i < 0 or j < 0:
            print('FAIL  %s: 마커 없음' % os.path.relpath(mod, ROOT))
            fail += 1
            continue
        got = text[i + len(start):j].strip()
        want = 'var %s=%s;' % (var, json.dumps(slice_for(data, kind), ensure_ascii=False,
                                                separators=(',', ':')))
        if got == want:
            print('OK  %s  %s 사본 == JSON' % (os.path.relpath(mod, ROOT), var))
        else:
            print('FAIL  %s  %s 사본이 JSON 과 다릅니다' % (os.path.relpath(mod, ROOT), var))
            fail += 1
    return 1 if fail else 0


def main():
    ap = argparse.ArgumentParser(description='폭수축량·폭마진량 룰 시드 파이프라인')
    ap.add_argument('--check', action='store_true', help='원본 파싱 + 어서션')
    ap.add_argument('--emit', action='store_true', help='build/width_rule_seed.json 재생성')
    ap.add_argument('--inject', action='store_true', help='모듈 마커 구간에 주입(멱등)')
    ap.add_argument('--verify', action='store_true', help='xlsx 없이 모듈 사본 == JSON 검사')
    ap.add_argument('--reinject', action='store_true', help='xlsx 없이 기존 JSON 재주입')
    ap.add_argument('--dir', help='원본 xlsx 디렉토리 (기본 sources/)')
    args = ap.parse_args()

    if args.dir:
        os.environ['RULE_XLSX_DIR'] = args.dir

    if args.verify:
        if not os.path.exists(SEED_JSON):
            print('FAIL  %s 없음 — --emit 을 먼저 실행해 주세요' % os.path.relpath(SEED_JSON, ROOT))
            return 1
        return verify()

    if args.reinject:
        if not os.path.exists(SEED_JSON):
            print('FAIL  %s 없음 — --emit 을 먼저 실행해 주세요' % os.path.relpath(SEED_JSON, ROOT))
            return 1
        inject(json.load(open(SEED_JSON, encoding='utf-8')))
        return 0

    if not (args.check or args.emit or args.inject):
        ap.print_help()
        return 0

    issues = []
    try:
        data = build(issues)
        check(data, issues)
    except PipelineError as e:
        print('FAIL  %s' % e, file=sys.stderr)
        return 1
    except Exception as e:  # openpyxl 등
        print('FAIL  %s: %s' % (type(e).__name__, e), file=sys.stderr)
        return 1

    for m in issues:
        print('주의  %s' % m)
    if issues:
        print('주의  총 %d건 — 원본 값을 그대로 둔 항목입니다. 룰 삭제/수정 없이 전량 이관했습니다.'
              % len(issues))

    if args.emit:
        with io.open(SEED_JSON, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        print('emit   %s' % os.path.relpath(SEED_JSON, ROOT))
    if args.inject:
        inject(data)
    return 0


if __name__ == '__main__':
    sys.exit(main())
