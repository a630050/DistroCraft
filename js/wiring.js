/* 導線幾何與繪製:貝茲曲線路徑、導線/預覽線 SVG 產生 */
(function () {
  'use strict';

  /* 兩端點之間的導線曲線;回傳 path d 與中點(供把手/刪除鈕定位)。
     ctrl = {dx,dy}:使用者微調的彎折量(相對兩端點中心的偏移),
     有 ctrl 時改用通過該點的二次貝茲曲線,讓線可以被拉離遮擋處。 */
  function path(p1, p2, ctrl) {
    if (ctrl) {
      const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
      const mx = cx + ctrl.dx, my = cy + ctrl.dy;
      /* 二次貝茲 t=0.5 恰好通過 (mx,my):Q = 2M - (P0+P2)/2 */
      const qx = 2 * mx - cx, qy = 2 * my - cy;
      const d = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${qx.toFixed(1)} ${qy.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      return { d, mid: { x: mx, y: my } };
    }
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    const sag = Math.min(70, 18 + dist * 0.18);
    const c1 = { x: p1.x + dx * 0.25, y: p1.y + dy * 0.25 + sag };
    const c2 = { x: p1.x + dx * 0.75, y: p1.y + dy * 0.75 + sag };
    const d = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    const mid = {
      x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8,
      y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8,
    };
    return { d, mid };
  }

  /* 一條已完成的導線(hit 區、外皮、芯線、電流動畫層) */
  function renderWire(wire, p1, p2, opts) {
    const { d } = path(p1, p2, wire.ctrl);
    const sel = opts && opts.selected ? 'selected' : '';
    const carry = opts ? opts.carry : undefined;
    return `
      <g class="wire ${wire.color} ${sel}" data-wire-id="${wire.id}">
        <path class="hit" d="${d}"/>
        <path class="casing" d="${d}"/>
        <path class="core" d="${d}"/>
        ${carry ? `<path class="flow${carry < 0 ? ' rev' : ''}" d="${d}"/>` : ''}
      </g>`;
  }

  /* 拉線中的預覽虛線 */
  function renderPreview(p1, p2, color) {
    const { d } = path(p1, p2);
    return `<path class="wire-preview ${color}" d="${d}"/>`;
  }

  window.Wiring = { path, renderWire, renderPreview };
})();
