/* assets/shape/shape-widget.js — DOM 마운트와 상호작용 (장면 선택·키보드·더블클릭 확대·배지 이동) */
(function (g) {
  'use strict';

  function nextSceneId(model, curId, dir) {
    const ids = model.scenes.map(s => s.id);
    const i = Math.max(0, ids.indexOf(curId));
    return ids[Math.min(ids.length - 1, Math.max(0, i + dir))];
  }

  function mount(el, model, opts) {
    const M = g.MesShape;
    opts = opts || {};
    const wanted = opts.initial || 'rolled';
    const state = { sel: model.scenes.some(s => s.id === wanted) ? wanted : model.scenes[0].id, expanded: false };

    function render(focusTab) {
      el.innerHTML = M.renderSection(model, state.sel, { expanded: state.expanded });
      if (focusTab) { const t = el.querySelector('#shape-tab-' + state.sel); if (t && t.focus) t.focus(); }
    }
    function select(id, focusTab) {
      if (!model.scenes.some(s => s.id === id) || id === state.sel) return;
      state.sel = id;
      render(focusTab);
    }
    function onClick(e) {
      const badge = e.target.closest && e.target.closest('[data-route]');
      if (badge && el.contains(badge)) { e.preventDefault(); if (opts.onNavigate) opts.onNavigate(badge.dataset.route); return; }
      const tab = e.target.closest && e.target.closest('[data-scene]');
      if (tab && el.contains(tab)) select(tab.dataset.scene, false);
    }
    function onDblClick(e) {
      const tab = e.target.closest && e.target.closest('[data-scene]');
      if (tab && el.contains(tab)) { state.expanded = !state.expanded; render(false); }
    }
    function onKey(e) {
      const tab = e.target.closest && e.target.closest('[data-scene]');
      if (!tab || !el.contains(tab)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        select(nextSceneId(model, state.sel, e.key === 'ArrowRight' ? 1 : -1), true);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(tab.dataset.scene, true);
      }
    }

    el.addEventListener('click', onClick);
    el.addEventListener('dblclick', onDblClick);
    el.addEventListener('keydown', onKey);
    render(false);

    return {
      select: id => select(id, false),
      getSelected: () => state.sel,
      destroy() {
        el.removeEventListener('click', onClick);
        el.removeEventListener('dblclick', onDblClick);
        el.removeEventListener('keydown', onKey);
        el.innerHTML = '';
      },
    };
  }

  g.MesShape = Object.assign(g.MesShape || {}, { mount, nextSceneId });
})(globalThis);
