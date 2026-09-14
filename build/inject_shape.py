#!/usr/bin/env python3
"""assets/shape/* 를 modules/quality-design.html 의 마커 구간에 주입한다 (멱등).

CSS 마커 (<style> 안):  /*__SHAPE_CSS_START__*/ … /*__SHAPE_CSS_END__*/
JS  마커 (<script> 안): /*__SHAPE_JS_START__*/  … /*__SHAPE_JS_END__*/

사용:  python3 build/inject_shape.py          # 주입
       python3 build/inject_shape.py --check  # 주입 결과가 최신인지 확인만 (다르면 exit 1)
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODULE = ROOT / 'modules' / 'quality-design.html'
SHAPE = ROOT / 'assets' / 'shape'
JS_FILES = ['shape-model.js', 'shape-svg.js', 'shape-widget.js']
CSS_FILE = 'shape.css'
CSS_S, CSS_E = '/*__SHAPE_CSS_START__*/', '/*__SHAPE_CSS_END__*/'
JS_S, JS_E = '/*__SHAPE_JS_START__*/', '/*__SHAPE_JS_END__*/'


def replace_between(src, mark_s, mark_e, body):
    if src.count(mark_s) != 1 or src.count(mark_e) != 1:
        raise SystemExit('FAIL: 마커가 정확히 1개씩 있어야 함: %s / %s' % (mark_s, mark_e))
    i = src.index(mark_s) + len(mark_s)
    j = src.index(mark_e)
    if j < i:
        raise SystemExit('FAIL: 마커 순서가 잘못됨: %s' % mark_s)
    return src[:i] + '\n' + body.rstrip('\n') + '\n' + src[j:]


def build():
    src = MODULE.read_text(encoding='utf-8')
    css = (SHAPE / CSS_FILE).read_text(encoding='utf-8')
    js = '\n'.join((SHAPE / f).read_text(encoding='utf-8') for f in JS_FILES)
    for bad in ('</style>', '</script>'):
        if bad in css or bad in js:
            raise SystemExit('FAIL: 주입 본문에 %s 가 있음' % bad)
    out = replace_between(src, CSS_S, CSS_E, css)
    out = replace_between(out, JS_S, JS_E, js)
    return src, out, len(css), len(js)


def main():
    check = '--check' in sys.argv[1:]
    src, out, ncss, njs = build()
    if out == src:
        print('INJECT: 변경 없음')
        return
    if check:
        print('FAIL: quality-design.html 의 주입 구간이 assets/shape 와 다름 — python3 build/inject_shape.py 실행 필요')
        sys.exit(1)
    MODULE.write_text(out, encoding='utf-8', newline='')
    print('INJECT OK: css %d bytes, js %d bytes → %s' % (ncss, njs, MODULE.relative_to(ROOT)))


if __name__ == '__main__':
    main()
