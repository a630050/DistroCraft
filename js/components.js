/* 元件定義:每種元件的尺寸、端子位置、內部導通規則與 SVG 繪製 */
(function () {
  'use strict';

  const defs = {

    /* ---------- 電源 ---------- */
    power: {
      name: '電源',
      w: 120, h: 96,
      single: true,
      terminals: [
        { n: 'L', x: 38, y: 86, cls: 'hot', label: '火線', ldy: 20 },
        { n: 'N', x: 82, y: 86, cls: 'neu', label: '中性線', ldy: 20 },
      ],
      init() { return {}; },
      internalEdges() { return []; },
      render() {
        return `
          <rect x="6" y="4" width="108" height="68" rx="6" class="power-body"/>
          <text x="60" y="34" class="comp-title light" text-anchor="middle">電源</text>
          <text x="60" y="54" class="comp-sub light" text-anchor="middle">AC 110V</text>
          <line x1="38" y1="72" x2="38" y2="80" class="stem"/>
          <line x1="82" y1="72" x2="82" y2="80" class="stem"/>`;
      }
    },

    /* ---------- NFB 無熔絲斷路器 2P ---------- */
    nfb: {
      name: 'NFB 斷路器',
      w: 95, h: 135,
      terminals: [
        { n: 'LIN',  x: 32, y: 10,  cls: 'hot', label: 'L', ldy: -12 },
        { n: 'NIN',  x: 63, y: 10,  cls: 'neu', label: 'N', ldy: -12 },
        { n: 'LOUT', x: 32, y: 126, cls: 'hot', label: 'L', ldy: 22 },
        { n: 'NOUT', x: 63, y: 126, cls: 'neu', label: 'N', ldy: 22 },
      ],
      init() { return { pos: 'off' }; },
      internalEdges(c) {
        return c.state.pos === 'on' ? [['LIN', 'LOUT'], ['NIN', 'NOUT']] : [];
      },
      render(c) {
        const pos = c.state.pos;
        const handleY = pos === 'on' ? 52 : (pos === 'tripped' ? 66 : 80);
        const handleCls = pos === 'on' ? 'on' : (pos === 'tripped' ? 'trip' : 'off');
        const handleText = pos === 'on' ? 'ON' : (pos === 'tripped' ? '跳脫' : 'OFF');
        return `
          <rect x="8" y="16" width="79" height="103" rx="5" class="nfb-body ${pos === 'tripped' ? 'tripped' : ''}"/>
          <line x1="32" y1="10" x2="32" y2="17" class="stem"/>
          <line x1="63" y1="10" x2="63" y2="17" class="stem"/>
          <line x1="32" y1="118" x2="32" y2="126" class="stem"/>
          <line x1="63" y1="118" x2="63" y2="126" class="stem"/>
          <text x="47" y="30" class="comp-sub" text-anchor="middle">電源側</text>
          <text x="47" y="44" class="comp-title" font-size="11" text-anchor="middle">NFB 2P</text>
          <rect x="34" y="50" width="27" height="58" rx="4" class="nfb-track"/>
          <rect x="37" y="${handleY}" width="21" height="24" rx="3" class="nfb-handle ${handleCls}"/>
          <text x="47.5" y="${handleY + 16}" class="nfb-htext" text-anchor="middle">${handleText}</text>
          <text x="47" y="116" class="comp-sub" text-anchor="middle">負載側</text>
          <rect x="30" y="46" width="35" height="66" class="hit-toggle" data-action="toggle" data-comp-id="${c.id}"/>`;
      }
    },

    /* ---------- 端子台(橫式 4 格,每格上下互通) ---------- */
    tblock: {
      name: '端子台',
      w: 160, h: 92,
      terminals: [
        { n: '1a', x: 32, y: 34 }, { n: '1b', x: 32, y: 66 },
        { n: '2a', x: 66, y: 34 }, { n: '2b', x: 66, y: 66 },
        { n: '3a', x: 100, y: 34 }, { n: '3b', x: 100, y: 66 },
        { n: '4a', x: 134, y: 34 }, { n: '4b', x: 134, y: 66 },
      ],
      init() { return {}; },
      internalEdges() {
        return [['1a', '1b'], ['2a', '2b'], ['3a', '3b'], ['4a', '4b']];
      },
      render() {
        let cols = '';
        [32, 66, 100, 134].forEach(x => {
          cols += `
            <rect x="${x - 13}" y="22" width="26" height="56" rx="3" class="tb-row"/>
            <line x1="${x}" y1="42" x2="${x}" y2="58" class="tb-bridge"/>`;
        });
        return `
          <rect x="4" y="4" width="152" height="84" rx="5" class="tb-body"/>
          <text x="80" y="17" class="tb-title" text-anchor="middle">端子台</text>
          ${cols}`;
      }
    },

    /* ---------- 單切開關(背面:上下各一對速接孔,同對互通) ---------- */
    switch1: {
      name: '單切開關',
      w: 90, h: 130,
      terminals: [
        { n: 't1', x: 33, y: 20 },  { n: 't2', x: 57, y: 20 },
        { n: 'b1', x: 33, y: 110 }, { n: 'b2', x: 57, y: 110 },
      ],
      init() { return { on: false }; },
      internalEdges(c) {
        const edges = [['t1', 't2'], ['b1', 'b2']];
        if (c.state.on) edges.push(['t1', 'b1']);
        return edges;
      },
      render(c) {
        const on = c.state.on;
        return `
          <rect x="6" y="4" width="78" height="122" rx="8" class="swg-body"/>
          <rect x="19" y="8" width="52" height="24" rx="12" class="swg-slot"/>
          <circle cx="33" cy="20" r="6" class="swg-hole"/>
          <circle cx="57" cy="20" r="6" class="swg-hole"/>
          <line x1="39" y1="20" x2="51" y2="20" class="swg-bridge"/>
          <rect x="19" y="98" width="52" height="24" rx="12" class="swg-slot"/>
          <circle cx="33" cy="110" r="6" class="swg-hole"/>
          <circle cx="57" cy="110" r="6" class="swg-hole"/>
          <line x1="39" y1="110" x2="51" y2="110" class="swg-bridge"/>
          <rect x="26" y="46" width="38" height="24" rx="3" class="swg-state ${on ? 'on' : ''}"/>
          <text x="45" y="62" class="swg-stext" text-anchor="middle">${on ? '開' : '關'}</text>
          <text x="45" y="88" class="swg-name" text-anchor="middle">單切</text>
          <rect x="20" y="40" width="50" height="36" class="hit-toggle" data-action="toggle" data-comp-id="${c.id}"/>`;
      }
    },

    /* ---------- 雙切開關(三路):上方共用端 0,下方切換端 1、3 ---------- */
    switch3: {
      name: '雙切開關',
      w: 90, h: 130,
      terminals: [
        { n: '01', x: 33, y: 20 },  { n: '02', x: 57, y: 20 },
        { n: '1',  x: 33, y: 110 }, { n: '3',  x: 57, y: 110 },
      ],
      init() { return { pos: '1' }; },
      internalEdges(c) {
        return [['01', '02'], ['01', c.state.pos]];
      },
      render(c) {
        const p = c.state.pos;
        return `
          <rect x="6" y="4" width="78" height="122" rx="8" class="swg-body"/>
          <rect x="19" y="8" width="52" height="24" rx="12" class="swg-slot"/>
          <circle cx="33" cy="20" r="6" class="swg-hole"/>
          <circle cx="57" cy="20" r="6" class="swg-hole"/>
          <line x1="39" y1="20" x2="51" y2="20" class="swg-bridge"/>
          <text x="76" y="24" class="swg-num" text-anchor="middle">0</text>
          <text x="45" y="42" class="swg-cap" text-anchor="middle">共用端 COM</text>
          <rect x="21" y="98" width="24" height="24" rx="4" class="swg-slot"/>
          <circle cx="33" cy="110" r="6" class="swg-hole"/>
          <rect x="45" y="98" width="24" height="24" rx="4" class="swg-slot"/>
          <circle cx="57" cy="110" r="6" class="swg-hole"/>
          <text x="33" y="94" class="swg-num" text-anchor="middle">1</text>
          <text x="57" y="94" class="swg-num" text-anchor="middle">3</text>
          <rect x="26" y="46" width="38" height="24" rx="3" class="swg-state on"/>
          <text x="45" y="62" class="swg-stext" text-anchor="middle">0−${p}</text>
          <text x="45" y="82" class="swg-name" text-anchor="middle">雙切</text>
          <rect x="20" y="44" width="50" height="30" class="hit-toggle" data-action="toggle" data-comp-id="${c.id}"/>`;
      }
    },

    /* ---------- 插座(背面視角,一長一短) ---------- */
    outlet: {
      name: '插座',
      w: 104, h: 134,
      device: true,
      terminals: [
        { n: 'h1', x: 16, y: 52, cls: 'brass' },
        { n: 'h2', x: 16, y: 92, cls: 'brass' },
        { n: 'n1', x: 88, y: 52, cls: 'silver' },
        { n: 'n2', x: 88, y: 92, cls: 'silver' },
      ],
      init() { return {}; },
      internalEdges() {
        return [['h1', 'h2'], ['n1', 'n2']];
      },
      render(c, sim) {
        const on = sim && sim.energized.has(c.id);
        return `
          <rect x="8" y="6" width="88" height="122" rx="10" class="outlet-body"/>
          <circle cx="52" cy="20" r="5" class="led ${on ? 'on' : ''}" ${on ? 'filter="url(#glow)"' : ''}/>
          ${on ? `<text x="62" y="24" class="led-text">有電</text>` : ''}
          <rect x="13" y="48" width="6" height="48" class="brass-strip"/>
          <rect x="85" y="48" width="6" height="48" class="silver-strip"/>
          <text x="16" y="40" class="cap-hot" text-anchor="middle">火</text>
          <text x="88" y="40" class="cap-neu" text-anchor="middle">中</text>
          <rect x="30" y="36" width="44" height="74" rx="4" class="outlet-cover"/>
          <rect x="41" y="56" width="5" height="13" class="slot"/>
          <rect x="58" y="52" width="5" height="21" class="slot"/>
          <text x="43.5" y="86" class="slot-text" text-anchor="middle">短</text>
          <text x="60.5" y="86" class="slot-text" text-anchor="middle">長</text>
          <text x="52" y="101" class="slot-text" text-anchor="middle">(正面孔位)</text>
          <text x="52" y="124" class="comp-sub" text-anchor="middle">插座(背面)</text>`;
      }
    },

    /* ---------- 插座+燈泡(燈泡直接插在插座上,接對即亮) ---------- */
    outletBulb: {
      name: '插座+燈泡',
      w: 104, h: 134,
      device: true,
      terminals: [
        { n: 'h1', x: 16, y: 52, cls: 'brass' },
        { n: 'h2', x: 16, y: 92, cls: 'brass' },
        { n: 'n1', x: 88, y: 52, cls: 'silver' },
        { n: 'n2', x: 88, y: 92, cls: 'silver' },
      ],
      init() { return {}; },
      internalEdges() {
        return [['h1', 'h2'], ['n1', 'n2']];
      },
      render(c, sim) {
        const on = sim && sim.energized.has(c.id);
        let rays = '';
        if (on) {
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 / 6) * i - Math.PI / 2;
            const x1 = 52 + Math.cos(a) * 21, y1 = 76 + Math.sin(a) * 21;
            const x2 = 52 + Math.cos(a) * 29, y2 = 76 + Math.sin(a) * 29;
            rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="ray"/>`;
          }
        }
        return `
          <rect x="8" y="6" width="88" height="122" rx="10" class="outlet-body"/>
          <rect x="13" y="48" width="6" height="48" class="brass-strip"/>
          <rect x="85" y="48" width="6" height="48" class="silver-strip"/>
          <text x="16" y="40" class="cap-hot" text-anchor="middle">火</text>
          <text x="88" y="40" class="cap-neu" text-anchor="middle">中</text>
          <rect x="30" y="30" width="44" height="84" rx="4" class="outlet-cover"/>
          <rect x="40" y="36" width="24" height="14" rx="3" class="plug-body"/>
          <line x1="46" y1="50" x2="46" y2="56" class="plug-pin"/>
          <line x1="58" y1="50" x2="58" y2="56" class="plug-pin"/>
          ${rays}
          <circle cx="52" cy="76" r="17" class="bulb-glass ${on ? 'on' : ''}" ${on ? 'filter="url(#glow)"' : ''}/>
          <path d="M45 81 Q52 71 59 81" class="filament ${on ? 'on' : ''}"/>
          <text x="52" y="108" class="slot-text" text-anchor="middle">${on ? '供電正常' : '未通電'}</text>
          <text x="52" y="124" class="comp-sub" text-anchor="middle">插座+燈泡</text>`;
      }
    },

    /* ---------- 燈泡 ---------- */
    bulb: {
      name: '燈泡',
      w: 90, h: 118,
      device: true,
      terminals: [
        { n: '1', x: 30, y: 110, label: '1', ldy: 20 },
        { n: '2', x: 60, y: 110, label: '2', ldy: 20 },
      ],
      init() { return {}; },
      internalEdges() { return []; },
      render(c, sim) {
        const on = sim && sim.energized.has(c.id);
        let rays = '';
        if (on) {
          for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 / 8) * i - Math.PI / 2;
            const x1 = 45 + Math.cos(a) * 32, y1 = 44 + Math.sin(a) * 32;
            const x2 = 45 + Math.cos(a) * 42, y2 = 44 + Math.sin(a) * 42;
            rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="ray"/>`;
          }
        }
        return `
          ${rays}
          <circle cx="45" cy="44" r="26" class="bulb-glass ${on ? 'on' : ''}" ${on ? 'filter="url(#glow)"' : ''}/>
          <path d="M35 52 Q45 38 55 52" class="filament ${on ? 'on' : ''}"/>
          <rect x="35" y="68" width="20" height="16" class="bulb-base"/>
          <line x1="36" y1="72" x2="54" y2="72" class="bulb-thread"/>
          <line x1="36" y1="76" x2="54" y2="76" class="bulb-thread"/>
          <line x1="36" y1="80" x2="54" y2="80" class="bulb-thread"/>
          <line x1="40" y1="84" x2="30" y2="104" class="stem"/>
          <line x1="50" y1="84" x2="60" y2="104" class="stem"/>`;
      }
    },
  };

  /* 屬「裝置」的元件類型(合計上限 3 個) */
  window.DEVICE_TYPES = Object.keys(defs).filter(t => defs[t].device);
  window.CompDefs = defs;
})();
