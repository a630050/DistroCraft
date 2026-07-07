/* App 主程式:狀態管理、互動事件、渲染主迴圈 */
(function () {
  'use strict';

  const svg = document.getElementById('canvas');
  const componentsLayer = document.getElementById('components-layer');
  const wiresLayer = document.getElementById('wires-layer');
  const terminalsLayer = document.getElementById('terminals-layer');
  const uiLayer = document.getElementById('ui-layer');
  const canvasWrap = document.getElementById('canvas-wrap');
  const banner = document.getElementById('banner');
  const statusText = document.getElementById('status-text');
  const deviceCountEl = document.getElementById('device-count');
  const helpModal = document.getElementById('help-modal');
  const zoomSlider = document.getElementById('zoom-slider');
  const zoomLabel = document.getElementById('zoom-label');

  /* 檢視:viewBox 平移縮放。世界邊界比基準畫布(1200x700)大 4 倍 */
  const BASE_W = 1200, BASE_H = 700;
  const WORLD = { x0: -1800, y0: -1050, x1: 3000, y1: 1750 };
  const MIN_ZOOM = 0.3, MAX_ZOOM = 2.5;
  const view = { x: 0, y: 0, zoom: 1 };

  const state = { components: [], wires: [] };
  let sim = Simulation.simulate([], []);
  let idSeq = 0, wireSeq = 0, addSeq = 0;

  /* 復原/重做:每次操作後存快照,無步數上限,並持久化到 localStorage */
  const STORE_KEY = 'wiring-practice-v1';
  let history = [], future = [], lastSnap = '';
  let wireColor = 'red';
  let selected = null;        // {kind:'wire'|'comp', id}
  let drag = null;            // {kind:'wire',fromKey,p1,p2} | {kind:'comp',id,offX,offY}
  let hoverTermEl = null;
  let bannerTimer = null, flashTimer = null;

  /* ---------- 基礎工具 ---------- */

  function makeComponent(type, x, y) {
    const d = CompDefs[type];
    return { id: 'c' + (++idSeq), type, x, y, state: d.init() };
  }

  function deviceCount() {
    return state.components.filter(c => DEVICE_TYPES.includes(c.type)).length;
  }

  function findComp(id) { return state.components.find(c => c.id === id); }

  function posOfKey(key) {
    const i = key.indexOf(':');
    const c = findComp(key.slice(0, i));
    const t = CompDefs[c.type].terminals.find(t => t.n === key.slice(i + 1));
    return { x: c.x + t.x, y: c.y + t.y };
  }

  function svgPoint(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function capturePointer(e) {
    try { svg.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件無有效 pointerId */ }
  }

  /* ---------- 復原 / 重做 ---------- */

  function snapState() {
    return JSON.stringify({
      components: state.components,
      wires: state.wires,
      idSeq, wireSeq, addSeq,
    });
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ current: lastSnap, history, future }));
    } catch (_) { /* localStorage 不可用時忽略 */ }
  }

  /* 在每個完整操作(加/刪元件、接線、切開關、移動結束)後呼叫 */
  function commit() {
    const s = snapState();
    if (s === lastSnap) return;
    if (lastSnap) history.push(lastSnap);
    future = [];
    lastSnap = s;
    persist();
    updateUndoButtons();
  }

  function restoreSnap(s) {
    const d = JSON.parse(s);
    state.components = d.components;
    state.wires = d.wires;
    idSeq = d.idSeq; wireSeq = d.wireSeq; addSeq = d.addSeq;
    selected = null;
    drag = null;
    setHover(null);
    runSim();
    render();
  }

  function undo() {
    if (!history.length) return;
    future.push(lastSnap);
    lastSnap = history.pop();
    restoreSnap(lastSnap);
    persist();
    updateUndoButtons();
  }

  function redo() {
    if (!future.length) return;
    history.push(lastSnap);
    lastSnap = future.pop();
    restoreSnap(lastSnap);
    persist();
    updateUndoButtons();
  }

  function updateUndoButtons() {
    document.getElementById('btn-undo').disabled = !history.length;
    document.getElementById('btn-redo').disabled = !future.length;
  }

  /* ---------- 檢視(平移/縮放) ---------- */

  function viewSize() {
    return { w: BASE_W / view.zoom, h: BASE_H / view.zoom };
  }

  function updateView() {
    const { w, h } = viewSize();
    const worldW = WORLD.x1 - WORLD.x0, worldH = WORLD.y1 - WORLD.y0;
    view.x = (w >= worldW)
      ? WORLD.x0 - (w - worldW) / 2
      : Math.max(WORLD.x0, Math.min(WORLD.x1 - w, view.x));
    view.y = (h >= worldH)
      ? WORLD.y0 - (h - worldH) / 2
      : Math.max(WORLD.y0, Math.min(WORLD.y1 - h, view.y));
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${w} ${h}`);
    const pct = Math.round(view.zoom * 100);
    zoomSlider.value = pct;
    zoomLabel.textContent = pct + '%';
  }

  /* 設定縮放比例;anchor 為縮放中心(世界座標),預設為視窗中心 */
  function setZoom(z, anchor) {
    z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    const before = viewSize();
    const a = anchor || { x: view.x + before.w / 2, y: view.y + before.h / 2 };
    const fx = (a.x - view.x) / before.w;
    const fy = (a.y - view.y) / before.h;
    view.zoom = z;
    const after = viewSize();
    view.x = a.x - fx * after.w;
    view.y = a.y - fy * after.h;
    updateView();
  }

  /* 自動縮放平移到可以看到所有元件 */
  function zoomToFit() {
    if (!state.components.length) {
      view.x = 0; view.y = 0; view.zoom = 1;
      updateView();
      return;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of state.components) {
      const d = CompDefs[c.type];
      x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y);
      x1 = Math.max(x1, c.x + d.w); y1 = Math.max(y1, c.y + d.h);
    }
    const pad = 80;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad + 40; /* 導線下垂多留空間 */
    view.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
      Math.min(BASE_W / (x1 - x0), BASE_H / (y1 - y0))));
    const { w, h } = viewSize();
    view.x = (x0 + x1) / 2 - w / 2;
    view.y = (y0 + y1) / 2 - h / 2;
    updateView();
  }

  function wireExists(a, b) {
    return state.wires.some(w =>
      (w.from === a && w.to === b) || (w.from === b && w.to === a));
  }

  /* ---------- 模擬 ---------- */

  function runSim() {
    sim = Simulation.simulate(state.components, state.wires);
    if (sim.short) {
      const onNfbs = state.components.filter(c => c.type === 'nfb' && c.state.pos === 'on');
      if (onNfbs.length) {
        onNfbs.forEach(c => { c.state.pos = 'tripped'; });
        flashShort('⚡ 短路!NFB 已跳脫,請排除接線問題後再送電');
        sim = Simulation.simulate(state.components, state.wires);
      }
      if (sim.short) {
        sim.sourceShort = true;
        sim.short = false;
        sim.hot = new Set();
        sim.neutral = new Set();
        flashShort('⚡ 電源端直接短路!火線與中性線被直接接通,請檢查接線');
      }
    }
  }

  /* ---------- 渲染 ---------- */

  function render() {
    renderComponents();
    renderTerminals();
    renderWires();
    renderUI();
    updateStatus();
    updatePalette();
  }

  function renderComponents() {
    componentsLayer.innerHTML = state.components.map(c => {
      const d = CompDefs[c.type];
      const sel = selected && selected.kind === 'comp' && selected.id === c.id;
      return `<g class="component" data-comp-id="${c.id}" transform="translate(${c.x},${c.y})">
        ${sel ? `<rect class="sel-outline" x="-5" y="-5" width="${d.w + 10}" height="${d.h + 10}" rx="6"/>` : ''}
        ${d.render(c, sim)}
      </g>`;
    }).join('');
  }

  function renderTerminals() {
    terminalsLayer.innerHTML = state.components.map(c =>
      CompDefs[c.type].terminals.map(t => {
        const key = c.id + ':' + t.n;
        return `<g class="terminal ${t.cls || ''}" data-tkey="${key}" transform="translate(${c.x + t.x},${c.y + t.y})">
          <circle class="tc" r="7"/>
          <circle class="thit" r="20"/>
          ${t.label ? `<text class="tlabel" y="${t.ldy || 18}" text-anchor="middle">${t.label}</text>` : ''}
        </g>`;
      }).join('')
    ).join('');
  }

  function renderWires() {
    let html = state.wires.map(w => Wiring.renderWire(w, posOfKey(w.from), posOfKey(w.to), {
      selected: selected && selected.kind === 'wire' && selected.id === w.id,
      carry: sim.carrying.get(w.id),
    })).join('');
    if (drag && drag.kind === 'wire') {
      html += Wiring.renderPreview(drag.p1, drag.p2, wireColor);
    }
    wiresLayer.innerHTML = html;
  }

  function renderUI() {
    if (selected && selected.kind === 'wire') {
      const w = state.wires.find(w => w.id === selected.id);
      if (w) {
        const p1 = posOfKey(w.from), p2 = posOfKey(w.to);
        const { mid } = Wiring.path(p1, p2, w.ctrl);
        /* 刪除鈕放在把手旁,沿導線法線方向偏移避免互相遮擋 */
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (-dy / len) * 28, oy = (dx / len) * 28;
        const delX = mid.x + (oy > 0 ? -ox : ox);
        const delY = mid.y + (oy > 0 ? -oy : oy);
        uiLayer.innerHTML = `
          <g class="wire-bend" data-action="bend-wire" data-wire-id="${w.id}" transform="translate(${mid.x},${mid.y})">
            <circle class="bend-hit" r="20"/>
            <circle class="bend-dot" r="7"/>
          </g>
          <g class="wire-del" data-action="delete-wire" data-wire-id="${w.id}" transform="translate(${delX},${delY})">
            <circle r="10"/><text y="4" text-anchor="middle">✕</text>
          </g>`;
        return;
      }
    }
    uiLayer.innerHTML = '';
  }

  function updateStatus() {
    statusText.textContent = getStatusText();
  }

  function getStatusText() {
    if (sim.sourceShort) {
      return '⚡ 電源端直接短路!請刪除造成短路的接線。';
    }
    if (state.components.some(c => c.type === 'nfb' && c.state.pos === 'tripped')) {
      return '⚡ NFB 已跳脫:請先排除短路,點 NFB 把手切到 OFF 後再重新送電。';
    }
    const n = sim.energized.size;
    if (n > 0) return `✅ ${n} 個裝置通電中。點擊開關或 NFB 把手可切換，觀察電流動畫。`;
    return '💡 左側加入元件 → 按住端子拖曳拉線 → 打開 NFB 與開關看結果。拖曳空白處平移畫布、滾輪縮放，Delete 刪除選取，❓說明有範例接法。';
  }

  function updatePalette() {
    document.querySelectorAll('.pal-btn').forEach(btn => {
      const type = btn.dataset.type;
      const d = CompDefs[type];
      let disabled = false;
      if (d.single && state.components.some(c => c.type === type)) disabled = true;
      if (DEVICE_TYPES.includes(type) && deviceCount() >= 3) disabled = true;
      btn.disabled = disabled;
    });
    deviceCountEl.textContent = `裝置:${deviceCount()} / 3`;
  }

  /* ---------- 橫幅與短路動畫 ---------- */

  function showBanner(msg) {
    banner.textContent = msg;
    banner.classList.remove('hidden');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.add('hidden'), 3500);
  }

  function flashShort(msg) {
    showBanner(msg);
    canvasWrap.classList.remove('flash');
    void canvasWrap.offsetWidth; /* 重新觸發動畫 */
    canvasWrap.classList.add('flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => canvasWrap.classList.remove('flash'), 1400);
  }

  /* ---------- 元件操作 ---------- */

  function addComponent(type) {
    const d = CompDefs[type];
    if (d.single && state.components.some(c => c.type === type)) return;
    if (DEVICE_TYPES.includes(type) && deviceCount() >= 3) {
      showBanner('裝置(燈泡/插座)最多只能放 3 個');
      return;
    }
    /* 放在目前檢視的中央附近,依序稍微錯開 */
    const { w, h } = viewSize();
    const x = view.x + w / 2 - d.w / 2 + ((addSeq % 5) - 2) * 40;
    const y = view.y + h / 2 - d.h / 2 + ((Math.floor(addSeq / 5) % 3) - 1) * 50;
    addSeq++;
    const c = makeComponent(type,
      Math.max(WORLD.x0 + 4, Math.min(x, WORLD.x1 - d.w - 4)),
      Math.max(WORLD.y0 + 4, Math.min(y, WORLD.y1 - d.h - 4)));
    state.components.push(c);
    selected = { kind: 'comp', id: c.id };
    runSim();
    render();
    commit();
  }

  function toggleComp(id) {
    const c = findComp(id);
    if (!c) return;
    if (c.type === 'nfb') {
      c.state.pos = (c.state.pos === 'on') ? 'off' : (c.state.pos === 'tripped' ? 'off' : 'on');
    } else if (c.type === 'switch1') {
      c.state.on = !c.state.on;
    } else if (c.type === 'switch3') {
      c.state.pos = (c.state.pos === '1') ? '3' : '1';
    } else if (c.type === 'switch4') {
      c.state.cross = !c.state.cross;
    } else {
      return;
    }
    runSim();
    render();
    commit();
  }

  function deleteWire(id) {
    state.wires = state.wires.filter(w => w.id !== id);
    if (selected && selected.kind === 'wire' && selected.id === id) selected = null;
    runSim();
    render();
    commit();
  }

  function deleteComp(id) {
    state.components = state.components.filter(c => c.id !== id);
    state.wires = state.wires.filter(w =>
      !w.from.startsWith(id + ':') && !w.to.startsWith(id + ':'));
    if (selected && selected.kind === 'comp' && selected.id === id) selected = null;
    runSim();
    render();
    commit();
  }

  /* ---------- 指標事件(滑鼠 + 觸控) ---------- */

  const activePointers = new Map();
  let pinchStart = null;

  function setHover(el) {
    if (hoverTermEl === el) return;
    if (hoverTermEl) hoverTermEl.classList.remove('target-ok');
    hoverTermEl = el;
    if (hoverTermEl) hoverTermEl.classList.add('target-ok');
  }

  function termUnderPointer(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el && el.closest ? el.closest('[data-tkey]') : null;
  }

  svg.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      if (drag && drag.kind === 'pan') {
        svg.classList.remove('panning');
        drag = null;
      }
      const pts = Array.from(activePointers.values());
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      const pt = svg.createSVGPoint();
      pt.x = cx; pt.y = cy;
      pinchStart = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        zoom: view.zoom,
        center: pt.matrixTransform(svg.getScreenCTM().inverse())
      };
      return;
    }
    const pt = svgPoint(e);
    const delBtn = e.target.closest('[data-action="delete-wire"]');
    if (delBtn) { deleteWire(delBtn.dataset.wireId); return; }

    const term = e.target.closest('[data-tkey]');
    if (term) {
      capturePointer(e);
      const fromKey = term.dataset.tkey;
      drag = { kind: 'wire', fromKey, p1: posOfKey(fromKey), p2: pt };
      selected = null;
      render();
      return;
    }

    const toggle = e.target.closest('[data-action="toggle"]');
    if (toggle) { toggleComp(toggle.dataset.compId); return; }

    /* 導線本身或彎折把手:選取並可拖曳調整弧度 */
    const wireEl = e.target.closest('[data-wire-id]');
    if (wireEl) {
      selected = { kind: 'wire', id: wireEl.dataset.wireId };
      capturePointer(e);
      drag = { kind: 'bend', id: wireEl.dataset.wireId, startX: e.clientX, startY: e.clientY, moved: false };
      render();
      return;
    }

    const compEl = e.target.closest('[data-comp-id]');
    if (compEl) {
      const c = findComp(compEl.dataset.compId);
      capturePointer(e);
      drag = { kind: 'comp', id: c.id, offX: pt.x - c.x, offY: pt.y - c.y, startX: c.x, startY: c.y };
      selected = { kind: 'comp', id: c.id };
      render();
      return;
    }

    /* 空白處:開始平移畫布 */
    selected = null;
    capturePointer(e);
    drag = { kind: 'pan', lastX: e.clientX, lastY: e.clientY };
    svg.classList.add('panning');
    render();
  });

  svg.addEventListener('pointermove', e => {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (activePointers.size === 2 && pinchStart) {
      const pts = Array.from(activePointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchStart.dist > 10) {
        setZoom(pinchStart.zoom * (currentDist / pinchStart.dist), pinchStart.center);
      }
      return;
    }

    if (!drag) return;
    if (drag.kind === 'pan') {
      const ctm = svg.getScreenCTM();
      view.x -= (e.clientX - drag.lastX) / ctm.a;
      view.y -= (e.clientY - drag.lastY) / ctm.d;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      updateView();
      return;
    }
    const pt = svgPoint(e);
    if (drag.kind === 'wire') {
      const term = termUnderPointer(e);
      setHover(term && term.dataset.tkey !== drag.fromKey ? term : null);
      drag.p2 = hoverTermEl ? posOfKey(hoverTermEl.dataset.tkey) : pt;
      renderWires();
    } else if (drag.kind === 'bend') {
      /* 超過小幅度才開始彎折,避免點選時手震誤調 */
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 5) return;
      const w = state.wires.find(w => w.id === drag.id);
      if (!w) { drag = null; return; }
      drag.moved = true;
      const p1 = posOfKey(w.from), p2 = posOfKey(w.to);
      w.ctrl = {
        dx: Math.round(pt.x - (p1.x + p2.x) / 2),
        dy: Math.round(pt.y - (p1.y + p2.y) / 2),
      };
      renderWires();
      renderUI();
    } else if (drag.kind === 'comp') {
      const c = findComp(drag.id);
      if (!c) { drag = null; return; }
      const d = CompDefs[c.type];
      c.x = Math.max(WORLD.x0 + 4, Math.min(WORLD.x1 - d.w - 4, pt.x - drag.offX));
      c.y = Math.max(WORLD.y0 + 4, Math.min(WORLD.y1 - d.h - 4, pt.y - drag.offY));
      render();
    }
  });

  svg.addEventListener('pointerup', e => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchStart = null;
    if (!drag) return;
    if (drag.kind === 'wire') {
      const term = hoverTermEl || termUnderPointer(e);
      const targetKey = term ? term.dataset.tkey : null;
      if (targetKey && targetKey !== drag.fromKey) {
        if (wireExists(drag.fromKey, targetKey)) {
          showBanner('這兩個端子之間已經有接線了');
        } else {
          state.wires.push({
            id: 'w' + (++wireSeq),
            from: drag.fromKey,
            to: targetKey,
            color: wireColor,
          });
          runSim();
          drag = null;
          render();
          commit();
          setHover(null);
          return;
        }
      }
      setHover(null);
    }
    if (drag.kind === 'pan') {
      svg.classList.remove('panning');
      drag = null;
      return; /* 平移不需重繪內容 */
    }
    if (drag.kind === 'comp') {
      const c = findComp(drag.id);
      const moved = c && (c.x !== drag.startX || c.y !== drag.startY);
      drag = null;
      render();
      if (moved) commit();
      return;
    }
    if (drag.kind === 'bend') {
      const moved = drag.moved;
      drag = null;
      render();
      if (moved) commit();
      return;
    }
    drag = null;
    render();
  });

  /* 雙擊導線(或其把手):恢復預設曲線 */
  svg.addEventListener('dblclick', e => {
    const wireEl = e.target.closest('[data-wire-id]');
    if (!wireEl) return;
    const w = state.wires.find(w => w.id === wireEl.dataset.wireId);
    if (w && w.ctrl) {
      delete w.ctrl;
      render();
      commit();
    }
  });

  svg.addEventListener('pointercancel', e => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchStart = null;
    setHover(null);
    svg.classList.remove('panning');
    drag = null;
    render();
  });

  /* 滾輪縮放(以游標位置為中心) */
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom(view.zoom * factor, svgPoint(e));
  }, { passive: false });

  /* ---------- 鍵盤 ---------- */

  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === 'Escape') {
      if (drag) { drag = null; setHover(null); }
      helpModal.classList.add('hidden');
      selected = null;
      render();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault();
      if (selected.kind === 'wire') deleteWire(selected.id);
      else deleteComp(selected.id);
    }
  });

  /* ---------- 工具列與元件庫 ---------- */

  document.querySelectorAll('.pal-btn').forEach(btn => {
    btn.addEventListener('click', () => addComponent(btn.dataset.type));
  });

  const btnRed = document.getElementById('btn-red');
  const btnWhite = document.getElementById('btn-white');
  btnRed.addEventListener('click', () => {
    wireColor = 'red';
    btnRed.classList.add('active');
    btnWhite.classList.remove('active');
  });
  btnWhite.addEventListener('click', () => {
    wireColor = 'white';
    btnWhite.classList.add('active');
    btnRed.classList.remove('active');
  });

  document.getElementById('btn-load-template').addEventListener('click', () => {
    if (confirm('載入模板將會清除目前的接線,確定要載入嗎?(可用 Ctrl+Z 復原)')) {
      const template = {
        components: [
          { id: "c1", type: "power", x: 600, y: 150, state: {} },
          { id: "c2", type: "nfb", x: 612, y: 280, state: { pos: "on" } },
          { id: "c3", type: "tblock", x: 580, y: 450, state: {} },
          { id: "c4", type: "switch3", x: 480, y: 600, state: { pos: "1" } },
          { id: "c5", type: "switch3", x: 630, y: 600, state: { pos: "1" } },
          { id: "c6", type: "bulb", x: 820, y: 610, state: {} }
        ],
        wires: [
          { id: "w1", from: "c1:L", to: "c2:LIN", color: "red" },
          { id: "w2", from: "c1:N", to: "c2:NIN", color: "white" },
          { id: "w3", from: "c2:LOUT", to: "c3:1a", color: "red" },
          { id: "w4", from: "c2:NOUT", to: "c3:4a", color: "white" },
          { id: "w5", from: "c3:1b", to: "c4:01", color: "red" },
          { id: "w6", from: "c3:4b", to: "c6:2", color: "white" },
          { id: "w7", from: "c4:1", to: "c5:1", color: "white", ctrl: { dx: 0, dy: 80 } },
          { id: "w8", from: "c4:3", to: "c5:3", color: "white", ctrl: { dx: 0, dy: 50 } },
          { id: "w9", from: "c5:01", to: "c6:1", color: "red" }
        ],
        idSeq: 6,
        wireSeq: 9,
        addSeq: 6
      };
      restoreSnap(JSON.stringify(template));
      commit();
      zoomToFit();
    }
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('確定要清空畫布,回到初始配置嗎?(可用 Ctrl+Z 復原)')) {
      initScene();
      commit();
    }
  });

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);

  /* ---------- 匯出 / 匯入 ---------- */

  document.getElementById('btn-export').addEventListener('click', () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      components: state.components,
      wires: state.wires,
      idSeq, wireSeq, addSeq,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `配電組態_${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showBanner('📤 組態已匯出！');
  });

  const importFileInput = document.getElementById('import-file');
  document.getElementById('btn-import').addEventListener('click', () => {
    importFileInput.value = '';
    importFileInput.click();
  });
  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        /* 驗證必要欄位是否存在 */
        if (!Array.isArray(data.components) || !Array.isArray(data.wires)) {
          throw new Error('檔案格式不正確：缺少 components 或 wires 欄位');
        }
        /* 驗證每個元件的 type 是否存在於 CompDefs 中 */
        for (const c of data.components) {
          if (!CompDefs[c.type]) {
            throw new Error(`檔案包含不支援的元件類型：${c.type}`);
          }
        }
        if (confirm('匯入將會取代目前的接線配置，確定要繼續嗎？(可用 Ctrl+Z 復原)')) {
          const snap = JSON.stringify({
            components: data.components,
            wires: data.wires,
            idSeq: data.idSeq || 100,
            wireSeq: data.wireSeq || 100,
            addSeq: data.addSeq || 100,
          });
          restoreSnap(snap);
          commit();
          zoomToFit();
          showBanner('📥 組態已成功匯入！');
        }
      } catch (err) {
        alert('匯入失敗：' + err.message);
      }
    };
    reader.onerror = () => alert('讀取檔案時發生錯誤，請重試。');
    reader.readAsText(file);
  });
  document.getElementById('btn-fit').addEventListener('click', zoomToFit);
  document.getElementById('btn-zoom-in').addEventListener('click', () => setZoom(view.zoom * 1.2));
  document.getElementById('btn-zoom-out').addEventListener('click', () => setZoom(view.zoom / 1.2));
  document.getElementById('btn-view-reset').addEventListener('click', () => {
    view.x = 0; view.y = 0; view.zoom = 1;
    updateView();
  });
  zoomSlider.addEventListener('input', () => setZoom(zoomSlider.value / 100));

  document.getElementById('btn-help').addEventListener('click', () => {
    helpModal.classList.remove('hidden');
  });
  document.getElementById('btn-close-help').addEventListener('click', () => {
    helpModal.classList.add('hidden');
  });
  helpModal.addEventListener('click', e => {
    if (e.target === helpModal) helpModal.classList.add('hidden');
  });

  /* ---------- 初始場景 ---------- */

  function initScene() {
    state.components = [];
    state.wires = [];
    selected = null;
    drag = null;
    addSeq = 0;
    state.components.push(makeComponent('power', 50, 60));
    state.components.push(makeComponent('nfb', 240, 45));
    state.components.push(makeComponent('tblock', 430, 40));
    view.x = 0; view.y = 0; view.zoom = 1;
    updateView();
    runSim();
    render();
  }

  /* 啟動:優先還原上次進度(含復原歷史),否則建立初始場景 */
  (function boot() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (_) { }
    if (saved && saved.current) {
      history = Array.isArray(saved.history) ? saved.history : [];
      future = Array.isArray(saved.future) ? saved.future : [];
      lastSnap = saved.current;
      try {
        restoreSnap(lastSnap);
        updateView();
      } catch (_) {
        /* 資料損毀時回到初始場景 */
        history = []; future = [];
        initScene();
        lastSnap = snapState();
        persist();
      }
    } else {
      initScene();
      lastSnap = snapState();
      persist();
    }
    updateUndoButtons();
  })();

  /* 除錯/測試用鉤子(不影響一般使用) */
  window.__app = {
    state, view,
    getSim: () => sim,
    setZoom, zoomToFit, updateView,
    undo, redo, commit,
    addComponent, toggleComp, deleteWire, deleteComp, runSim, render,
    addWire(from, to, color) {
      if (!wireExists(from, to)) {
        state.wires.push({ id: 'w' + (++wireSeq), from, to, color: color || wireColor });
        runSim();
        render();
        commit();
      }
    },
  };
})();
