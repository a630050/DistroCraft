/* 電路判定引擎:以圖論 BFS 判斷通電、短路,並回溯出電流路徑 */
(function () {
  'use strict';

  function keyOf(cid, t) { return cid + ':' + t; }

  /* 由 start 開始的 BFS,回傳可達集合與 parent 追溯表 */
  function bfs(start, adj) {
    const reach = new Set([start]);
    const parent = new Map();
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      const nbrs = adj.get(cur) || [];
      for (const { to, wid } of nbrs) {
        if (!reach.has(to)) {
          reach.add(to);
          parent.set(to, { prev: cur, wid });
          queue.push(to);
        }
      }
    }
    return { reach, parent };
  }

  /**
   * 模擬電路。
   * 節點 = 端子;邊 = 使用者導線 + 元件內部導通(負載不算邊)。
   * 回傳 { hot, neutral, short, sourceShort, energized, carrying }
   *  - carrying: Map(wireId -> dir),dir=+1 表電流沿 wire.from→wire.to 流動
   */
  function simulate(components, wires) {
    const adj = new Map();
    const addEdge = (a, b, wid) => {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push({ to: b, wid });
      adj.get(b).push({ to: a, wid });
    };

    for (const c of components) {
      for (const [a, b] of CompDefs[c.type].internalEdges(c)) {
        addEdge(keyOf(c.id, a), keyOf(c.id, b), null);
      }
    }
    const wireById = new Map();
    for (const w of wires) {
      addEdge(w.from, w.to, w.id);
      wireById.set(w.id, w);
    }

    const res = {
      hot: new Set(), neutral: new Set(),
      short: false, sourceShort: false,
      energized: new Set(), carrying: new Map(),
    };

    const power = components.find(c => c.type === 'power');
    if (!power) return res;

    const Lk = keyOf(power.id, 'L');
    const Nk = keyOf(power.id, 'N');
    const { reach: hot, parent: pL } = bfs(Lk, adj);
    const { reach: neutral, parent: pN } = bfs(Nk, adj);
    res.hot = hot;
    res.neutral = neutral;

    /* 火線不經負載即可到達中性線 → 短路 */
    if (hot.has(Nk)) {
      res.short = true;
      return res;
    }

    /* 回溯 parent 鏈,收集路徑上的導線與電流方向 */
    const trace = (term, parent, isHotSide) => {
      let cur = term;
      while (parent.has(cur)) {
        const { prev, wid } = parent.get(cur);
        if (wid != null) {
          const w = wireById.get(wid);
          /* 火線側:電流由電源流向負載 = prev→cur;中性線側:負載流回電源 = cur→prev */
          const from = isHotSide ? prev : cur;
          const dir = (w.from === from) ? 1 : -1;
          if (!res.carrying.has(wid)) res.carrying.set(wid, dir);
        }
        cur = prev;
      }
    };

    for (const c of components) {
      if (c.type === 'bulb') {
        const a = keyOf(c.id, '1'), b = keyOf(c.id, '2');
        let hT = null, nT = null;
        if (hot.has(a) && neutral.has(b)) { hT = a; nT = b; }
        else if (hot.has(b) && neutral.has(a)) { hT = b; nT = a; }
        if (hT) {
          res.energized.add(c.id);
          trace(hT, pL, true);
          trace(nT, pN, false);
        }
      } else if (c.type === 'outlet' || c.type === 'outletBulb') {
        const hs = ['h1', 'h2'].map(t => keyOf(c.id, t));
        const ns = ['n1', 'n2'].map(t => keyOf(c.id, t));
        let hT = hs.find(k => hot.has(k));
        let nT = ns.find(k => neutral.has(k));
        if (!(hT && nT)) {
          /* 反接:火線接到長孔(銀)側也會通電 */
          const hT2 = ns.find(k => hot.has(k));
          const nT2 = hs.find(k => neutral.has(k));
          if (hT2 && nT2) { hT = hT2; nT = nT2; } else { hT = null; }
        }
        if (hT) {
          res.energized.add(c.id);
          trace(hT, pL, true);
          trace(nT, pN, false);
        }
      }
    }
    return res;
  }

  window.Simulation = { simulate, keyOf };
})();
