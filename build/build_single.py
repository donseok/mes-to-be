#!/usr/bin/env python3
"""단일 파일 index.html 조립 스크립트.

포털 셸(build/template.html)에 assets/portal.css, assets/portal.js를 인라인하고,
품질사양 관리 모듈(modules/quality-spec.html) 전체를 iframe srcdoc으로 내장해
저장소 루트의 index.html(GitHub Pages 배포용 단일 파일)을 생성한다.

사용법:  python3 build/build_single.py   (저장소 어디서 실행해도 됨)

수정 작업 순서:
  1) 모듈 화면·기능 수정  →  modules/quality-spec.html
     포털 셸(사이드바·라우팅) 수정  →  build/template.html, assets/portal.css, assets/portal.js
  2) 이 스크립트 실행  →  index.html 재생성
  3) 브라우저로 index.html 검증 후 git commit
"""

import os
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = lambda *p: os.path.join(ROOT, *p)

index = open(path('build', 'template.html'), encoding='utf-8').read()
css = open(path('assets', 'portal.css'), encoding='utf-8').read()
js = open(path('assets', 'portal.js'), encoding='utf-8').read()
module = open(path('modules', 'quality-spec.html'), encoding='utf-8').read()

# --- 0. 파비콘 인라인 (favicon.ico 404 방지) ---------------------------------
FAVICON_SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
               '<rect width="64" height="64" rx="14" fill="#1D5FBF"/>'
               '<text x="32" y="45" font-family="Arial,sans-serif" font-size="38" '
               'font-weight="bold" fill="#FFFFFF" text-anchor="middle">M</text></svg>')
old_title = '  <title>MES To-Be Portal</title>'
assert old_title in index
index = index.replace(
    old_title,
    old_title + '\n  <link rel="icon" href="data:image/svg+xml,' + quote(FAVICON_SVG) + '">',
    1)

# --- 1. 외부 CSS/JS 참조를 인라인으로 ---------------------------------------
old_head = '''  <link rel="stylesheet" href="./assets/portal.css">
  <script src="./assets/portal.js" defer></script>'''
assert old_head in index, 'head refs not found'
index = index.replace(old_head, '  <style>\n' + css + '\n  </style>', 1)

# --- 2. iframe: src -> srcdoc (모듈 전체 내장) --------------------------------
old_iframe = '''          <iframe
            id="module-frame"
            title="품질사양 관리 목업"
            src="./modules/quality-spec.html?embed=1"
            loading="eager">
          </iframe>'''
assert old_iframe in index, 'iframe block not found'
escaped = module.replace('&', '&amp;').replace('"', '&quot;')
index = index.replace(
    old_iframe,
    '          <iframe id="module-frame" title="품질사양 관리 목업" '
    'loading="eager" srcdoc="' + escaped + '"></iframe>', 1)

# --- 2b. 품질설계결과 모듈도 iframe srcdoc으로 내장 -------------------------
module_qd = open(path('modules', 'quality-design.html'), encoding='utf-8').read()
old_iframe_qd = '''          <iframe
            id="module-frame-qd"
            title="품질설계결과 목업"
            src="./modules/quality-design.html?embed=1"
            loading="lazy">
          </iframe>'''
assert old_iframe_qd in index, 'qd iframe block not found'
escaped_qd = module_qd.replace('&', '&amp;').replace('"', '&quot;')
index = index.replace(
    old_iframe_qd,
    '          <iframe id="module-frame-qd" title="품질설계결과 목업" '
    'loading="lazy" srcdoc="' + escaped_qd + '"></iframe>', 1)

# --- 2c. 주문단중에러관리 모듈도 iframe srcdoc으로 내장 ----------------------
module_owe = open(path('modules', 'order-weight-error.html'), encoding='utf-8').read()
old_iframe_owe = '''          <iframe
            id="module-frame-owe"
            title="주문단중에러관리 목업"
            src="./modules/order-weight-error.html?embed=1"
            loading="lazy">
          </iframe>'''
assert old_iframe_owe in index, 'owe iframe block not found'
escaped_owe = module_owe.replace('&', '&amp;').replace('"', '&quot;')
index = index.replace(
    old_iframe_owe,
    '          <iframe id="module-frame-owe" title="주문단중에러관리 목업" '
    'loading="lazy" srcdoc="' + escaped_owe + '"></iframe>', 1)

# --- 2d. 생산가부관리 모듈도 iframe srcdoc으로 내장 --------------------------
module_pf = open(path('modules', 'production-feasibility.html'), encoding='utf-8').read()
old_iframe_pf = '''          <iframe
            id="module-frame-pf"
            title="생산가부관리 목업"
            src="./modules/production-feasibility.html?embed=1"
            loading="lazy">
          </iframe>'''
assert old_iframe_pf in index, 'pf iframe block not found'
escaped_pf = module_pf.replace('&', '&amp;').replace('"', '&quot;')
index = index.replace(
    old_iframe_pf,
    '          <iframe id="module-frame-pf" title="생산가부관리 목업" '
    'loading="lazy" srcdoc="' + escaped_pf + '"></iframe>', 1)

# --- 2e. 주문정합성체크 모듈도 iframe srcdoc으로 내장 ------------------------
module_oc = open(path('modules', 'order-consistency.html'), encoding='utf-8').read()
old_iframe_oc = '''          <iframe
            id="module-frame-oc"
            title="주문정합성체크 목업"
            src="./modules/order-consistency.html?embed=1"
            loading="lazy">
          </iframe>'''
assert old_iframe_oc in index, 'oc iframe block not found'
escaped_oc = module_oc.replace('&', '&amp;').replace('"', '&quot;')
index = index.replace(
    old_iframe_oc,
    '          <iframe id="module-frame-oc" title="주문정합성체크 목업" '
    'loading="lazy" srcdoc="' + escaped_oc + '"></iframe>', 1)

# --- 2f. 시뮬레이션 모듈도 iframe srcdoc으로 내장 --------------------------
module_sim = open(path('modules', 'simulation.html'), encoding='utf-8').read()
old_iframe_sim = """          <iframe
            id="module-frame-sim"
            title="시뮬레이션 목업"
            src="./modules/simulation.html?embed=1"
            loading="lazy">
          </iframe>"""
assert old_iframe_sim in index, 'sim iframe block not found'
escaped_sim = module_sim.replace('&', '&amp;').replace('"', '&quot;')
index = index.replace(
    old_iframe_sim,
    '          <iframe id="module-frame-sim" title="시뮬레이션 목업" '
    'loading="lazy" srcdoc="' + escaped_sim + '"></iframe>', 1)

# --- 3. JS 인라인 (마지막 </body> 앞 — srcdoc 안의 </body>와 혼동 금지) -------
assert '</body>' in index
head_part, sep, tail_part = index.rpartition('</body>')
index = head_part + '<script>\n' + js + '</script>\n' + sep + tail_part

out = path('index.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(index)
print('OK:', out, len(index.encode('utf-8')), 'bytes')
