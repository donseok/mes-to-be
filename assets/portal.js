/* ============================================================
   MES To-Be Portal — shell behavior
   해시 라우팅(#/...), 메뉴 트리 접기/펴기, 모바일 사이드바.
   ============================================================ */
(function () {
  'use strict';

  var ROUTES = {
    'quality-spec': {
      hash: '#/quality-design/module-management/quality-spec',
      viewId: 'quality-spec-view',
      title: '품질사양 관리',
      crumbs: ['품질설계', '모듈관리'],
      openLink: true
    },
    'quality-judgment': {
      hash: '#/quality-judgment',
      viewId: 'quality-judgment-view',
      title: '품질판정',
      crumbs: ['품질 업무'],
      openLink: false
    }
  };
  var DEFAULT_ROUTE = 'quality-spec';

  var appShell = document.querySelector('.app-shell');
  var sidebar = document.getElementById('sidebar');
  var menuToggle = document.getElementById('menu-toggle');
  var sidebarClose = document.getElementById('sidebar-close');
  var sidebarCollapse = document.getElementById('sidebar-collapse');
  var scrim = document.getElementById('sidebar-scrim');
  var breadcrumb = document.getElementById('breadcrumb');
  var pageTitle = document.getElementById('page-title');
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-link[data-route]'));
  var views = Array.prototype.slice.call(document.querySelectorAll('.route-view'));

  /* ---------- 메뉴 트리 접기/펴기 ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-tree-toggle]'), function (btn) {
    btn.addEventListener('click', function () {
      var tree = document.getElementById(btn.getAttribute('data-tree-toggle'));
      if (!tree) return;
      var open = tree.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  /* ---------- 사이드바 열기/접기 ----------
     모바일(≤900px): 오버레이 서랍, 데스크톱: 접기/펴기 (상태 기억) */
  var MOBILE_BP = 900;
  var COLLAPSE_KEY = 'mes-portal-sidebar-collapsed';
  function isMobile() { return window.innerWidth <= MOBILE_BP; }

  function syncToggleState() {
    if (!appShell) return;
    if (menuToggle) { // 모바일 오버레이 버튼 (헤더)
      var open = appShell.classList.contains('sidebar-open');
      menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      menuToggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
      menuToggle.title = menuToggle.getAttribute('aria-label');
    }
    if (sidebarCollapse) { // 데스크톱 접기 버튼 (사이드바 안)
      var collapsed = appShell.classList.contains('sidebar-collapsed');
      sidebarCollapse.textContent = collapsed ? '»' : '«';
      var clabel = collapsed ? '메뉴 펼치기' : '메뉴 접기';
      sidebarCollapse.setAttribute('aria-label', clabel);
      sidebarCollapse.title = clabel;
      sidebarCollapse.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
  }

  function setSidebar(open) { // 모바일 오버레이
    if (!appShell) return;
    appShell.classList.toggle('sidebar-open', open);
    syncToggleState();
  }
  function closeSidebar() { setSidebar(false); }

  function setCollapsed(collapsed) { // 데스크톱 접기
    if (!appShell) return;
    appShell.classList.toggle('sidebar-collapsed', collapsed);
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch (e) {}
    syncToggleState();
  }

  if (menuToggle) {
    menuToggle.addEventListener('click', function () {
      setSidebar(!appShell.classList.contains('sidebar-open'));
    });
  }
  if (sidebarCollapse) {
    sidebarCollapse.addEventListener('click', function () {
      setCollapsed(!appShell.classList.contains('sidebar-collapsed'));
    });
  }
  if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
  if (scrim) scrim.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSidebar();
  });
  window.addEventListener('resize', function () {
    if (!isMobile()) closeSidebar();
    syncToggleState();
  });

  // 저장된 접힘 상태 복원 (데스크톱)
  try {
    if (appShell && localStorage.getItem(COLLAPSE_KEY) === '1') {
      appShell.classList.add('sidebar-collapsed');
    }
  } catch (e) {}
  syncToggleState();

  /* ---------- 해시 라우팅 ---------- */
  function routeFromHash() {
    var hash = window.location.hash;
    for (var key in ROUTES) {
      if (ROUTES[key].hash === hash) return key;
    }
    return null;
  }

  function renderBreadcrumb(crumbs) {
    if (!breadcrumb) return;
    breadcrumb.textContent = '';
    crumbs.forEach(function (label, i) {
      var span = document.createElement('span');
      span.textContent = label;
      breadcrumb.appendChild(span);
      var sep = document.createElement('span');
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '›';
      breadcrumb.appendChild(sep);
    });
  }

  function applyRoute(key) {
    var route = ROUTES[key];
    if (!route) return;

    views.forEach(function (view) {
      var active = view.id === route.viewId;
      view.classList.toggle('active', active);
      if (active) view.removeAttribute('hidden');
      else view.setAttribute('hidden', '');
    });

    navLinks.forEach(function (link) {
      var active = link.getAttribute('data-route') === key;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    if (pageTitle) pageTitle.textContent = route.title;
    renderBreadcrumb(route.crumbs);
    document.title = route.title + ' · MES To-Be Portal';

    closeSidebar();
  }

  function handleHash() {
    var key = routeFromHash();
    if (!key) {
      // 알 수 없는(또는 빈) 해시면 기본 라우트로 정리
      key = DEFAULT_ROUTE;
      if (window.location.hash !== ROUTES[key].hash) {
        window.location.replace(
          window.location.pathname + window.location.search + ROUTES[key].hash
        );
        return; // replace가 hashchange를 다시 부르지 않는 브라우저 대비
      }
    }
    applyRoute(key);
  }

  window.addEventListener('hashchange', handleHash);
  handleHash();
})();
