#!/usr/bin/env python3
"""엔진 주입: assets/pltcm-thickness-engine.js 를 모듈의 마커 구간에 복사한다.

  python3 build/inject_engine.py          # 주입 (멱등)
  python3 build/inject_engine.py --check  # 사본이 원본과 다르면 exit 1

줄끝: 원본·모듈 모두 유니버설 모드로 읽어 LF 기준으로 비교·치환하고, 쓸 때는 모듈 파일이
원래 쓰던 줄끝(CRLF/LF)을 유지한다 (저장소가 Windows core.autocrlf=true 로 체크아웃되기 때문).
"""
import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = lambda *p: os.path.join(ROOT, *p)
ENGINE = path('assets', 'pltcm-thickness-engine.js')
TARGETS = [path('modules', 'simulation.html')]
MARK_S = '/*__PLTCM_ENGINE_START__*/'
MARK_E = '/*__PLTCM_ENGINE_END__*/'


class InjectError(Exception):
    pass


def read_lf(p):
    with open(p, encoding='utf-8', newline=None) as f:   # 유니버설 → '\n'
        return f.read()


def detect_eol(p):
    with open(p, 'rb') as f:
        return '\r\n' if b'\r\n' in f.read() else '\n'


def splice(src, body, mark_s, mark_e, label):
    if src.count(mark_s) != 1 or src.count(mark_e) != 1:
        raise InjectError('마커가 정확히 1쌍이어야 함: ' + label)
    i = src.find(mark_s)
    j = src.find(mark_e, i)
    if j < 0:
        raise InjectError('종료 마커가 시작 마커 뒤에 없음: ' + label)
    return src[:i + len(mark_s)] + '\n' + body.strip('\n') + '\n' + src[j:]


def write_keep_eol(p, text_lf):
    with open(p, 'w', encoding='utf-8', newline=detect_eol(p)) as f:
        f.write(text_lf)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    try:
        engine = read_lf(ENGINE)
        bad = 0
        for t in TARGETS:
            src = read_lf(t)
            out = splice(src, engine, MARK_S, MARK_E, t)
            if out == src:
                print('ENGINE OK (변경 없음):', os.path.relpath(t, ROOT))
            elif a.check:
                print('ENGINE DIFF:', os.path.relpath(t, ROOT), '— python3 build/inject_engine.py 로 재주입', file=sys.stderr)
                bad += 1
            else:
                write_keep_eol(t, out)
                print('ENGINE INJECT OK:', os.path.relpath(t, ROOT))
        if bad:
            sys.exit(1)
    except (InjectError, OSError) as e:
        print(e, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
