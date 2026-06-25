/* ===== 重庆高考 · 志愿填报地图（物理类/历史类） ===== */
(function () {
  const GK = window.GK, PROV = GK.prov;
  const CQ = PROV['50'].c;            // 重庆 center (飞线起点)
  const $ = s => document.querySelector(s);
  const isTouch = window.matchMedia('(hover:none),(pointer:coarse)').matches;
  const fabDock = () => document.querySelector('.fab-dock');

  // -------- track / 当前数据 --------
  const TKEYS = Object.keys(GK.tracks);
  let TRACK, YEARS, LINES, SCHOOLS;
  function applyTrack(key) {
    TRACK = key;
    const t = GK.tracks[key];
    YEARS = t.years; LINES = t.lines; SCHOOLS = t.schools;
    state.year = YEARS[YEARS.length - 1];
  }

  // -------- state --------
  const state = {
    year: null, lo: null, hi: null,
    tiers: new Set(), major: '', school: '',
    prov: null, drawerMode: null,    // 'prov' | 'all'
    allSort: 'rank',                 // 全部列表排序: 'rank' | 'score'
  };
  applyTrack(TKEYS[0]);

  // -------- helpers --------
  function levelsOf(t) {
    const L = [];
    if (t.indexOf('985') >= 0) L.push('985');
    if (t.indexOf('211') >= 0) L.push('211');
    if (t.indexOf('双一流') >= 0) L.push('双一流');
    if (!L.length) L.push('普通');
    return L;
  }
  function badgeHTML(t) {
    const map = { '985': ['b985', '985'], '211': ['b211', '211'], '双一流': ['bsyl', '双一流'], '普通': ['bnorm', '普通'] };
    return levelsOf(t).map(l => `<span class="bdg ${map[l][0]}">${map[l][1]}</span>`).join('');
  }
  const fmt = n => n == null ? '—' : n.toLocaleString('en-US');

  // -------- 专业详解手册 --------
  const MAJORS = window.MAJORS || {};
  const majorBase = n => n.split(/[（(]/)[0].trim();
  function lookupMajor(name) {
    if (!name) return null;
    if (MAJORS[name]) return name;
    const b = majorBase(name);
    return MAJORS[b] ? b : null;
  }

  // -------- 收藏 / 我的志愿表（精确到专业，localStorage 持久化） --------
  let WISH = [];
  try { WISH = (JSON.parse(localStorage.getItem('cqgk_wish') || '[]') || []).filter(w => w && w.t && w.c && w.mn); } catch (e) { }
  const isWished = (t, c, mn) => WISH.some(w => w.t === t && w.c === c && w.mn === mn);
  const schoolOf = (t, c) => (GK.tracks[t] ? GK.tracks[t].schools : []).find(s => s.c === c);
  function saveWish() { try { localStorage.setItem('cqgk_wish', JSON.stringify(WISH)); } catch (e) { } }
  function toggleWish(t, c, mn) {
    const i = WISH.findIndex(w => w.t === t && w.c === c && w.mn === mn);
    if (i >= 0) WISH.splice(i, 1); else WISH.push({ t, c, mn });
    saveWish(); updateWishUI();
  }
  // 找某专业在该校的投档分/位次（优先当前年份）
  function majorInfo(w) {
    const s = schoolOf(w.t, w.c); if (!s) return null;
    const yrs = [String(state.year)].concat(Object.keys(s.m));
    for (const y of yrs) {
      const arr = s.m[y]; if (!arr) continue;
      const m = arr.find(x => x[0] === w.mn);
      if (m) return { s, name: w.mn, sc: m[1], rk: m[2], y: +y };
    }
    return { s, name: w.mn, sc: null, rk: null, y: null };
  }
  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // -------- core filtering --------
  function evalSchool(s) {
    const ys = s.y[state.year];
    if (!ys) return null;
    if (state.tiers.size) {
      const lv = levelsOf(s.t);
      if (!lv.some(l => state.tiers.has(l))) return null;
    }
    if (state.school && s.n.indexOf(state.school) < 0) return null;
    const lo = state.lo == null ? 1 : state.lo;
    const hi = state.hi == null ? Infinity : state.hi;
    const majors = s.m[state.year] || [];
    const matched = [];
    for (const m of majors) {
      if (m[2] >= lo && m[2] <= hi && (!state.major || m[0].indexOf(state.major) >= 0)) matched.push(m);
    }
    if (!matched.length) return null;
    return { s, matched, count: matched.length };
  }

  function compute() {
    const byProv = {}, all = [];
    let nSchool = 0, nMajor = 0;
    for (const s of SCHOOLS) {
      const r = evalSchool(s);
      if (!r) continue;
      nSchool++; nMajor += r.count; all.push(r);
      const p = s.p;
      (byProv[p] || (byProv[p] = { count: 0, majors: 0, schools: [] }));
      byProv[p].count++; byProv[p].majors += r.count; byProv[p].schools.push(r);
    }
    all.sort((a, b) => a.s.y[state.year].mnr - b.s.y[state.year].mnr); // 投档位次 低→高
    return { byProv, all, nSchool, nMajor, nProv: Object.keys(byProv).length };
  }

  // -------- ECharts map --------
  echarts.registerMap('china', window.CHINA_GEO);
  const chart = echarts.init($('#map'), null, { renderer: 'canvas' });
  let curResult = null, maxCount = 1;

  function colorFor(c) {
    if (!c) return 'rgba(255,255,255,.035)';
    const t = Math.min(1, Math.log(c + 1) / Math.log(maxCount + 1));
    const stops = [[19, 32, 60], [31, 95, 176], [56, 189, 248], [129, 140, 248], [192, 132, 252]];
    const pos = t * (stops.length - 1), i = Math.floor(pos), f = pos - i;
    const a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)];
    const ch = k => Math.round(a[k] + (b[k] - a[k]) * f);
    return `rgba(${ch(0)},${ch(1)},${ch(2)},${.35 + .55 * t})`;
  }

  function renderMap() {
    const byProv = curResult.byProv;
    maxCount = Math.max(1, ...Object.values(byProv).map(v => v.count));
    $('#lgMax').textContent = maxCount;

    const regions = [], scatter = [], lines = [];
    for (const code in PROV) {
      const info = PROV[code], v = byProv[code];
      const cnt = v ? v.count : 0;
      regions.push({
        name: info.n,
        itemStyle: { areaColor: colorFor(cnt) },
        label: { show: cnt > 0, formatter: cnt > 0 ? `${info.n}\n${cnt}` : info.n },
        emphasis: { label: { show: true } }
      });
      if (cnt > 0 && code !== '50') {
        scatter.push({ name: info.n, value: info.c.concat(cnt), cnt });
        lines.push({ coords: [CQ, info.c], value: cnt });
      }
    }
    const sizeOf = c => 4 + 11 * Math.min(1, Math.log(c + 1) / Math.log(maxCount + 1));

    chart.setOption({
      geo: {
        map: 'china', roam: true, zoom: 1.3, center: [104, 37.5],
        layoutCenter: ['50%', '52%'], layoutSize: '125%',
        scaleLimit: { min: 1, max: 4 },
        itemStyle: { borderColor: 'rgba(140,170,255,.28)', borderWidth: .8, areaColor: 'rgba(255,255,255,.035)' },
        emphasis: { itemStyle: { areaColor: 'rgba(94,129,255,.5)' }, label: { color: '#fff', fontWeight: 700 } },
        select: { itemStyle: { areaColor: 'rgba(94,129,255,.65)' }, label: { color: '#fff' } },
        label: { color: 'rgba(220,230,255,.75)', fontSize: 10, fontWeight: 600, lineHeight: 13 },
        regions
      },
      tooltip: {
        trigger: 'item', confine: true, triggerOn: isTouch ? 'none' : 'mousemove',
        backgroundColor: 'rgba(12,16,30,.94)', borderColor: 'rgba(255,255,255,.14)',
        textStyle: { color: '#eaf0fb', fontSize: 12 },
        formatter: p => {
          const code = nameToCode[p.name]; const v = code && byProv[code];
          if (!v) return `<b>${p.name}</b><br/>暂无可报院校`;
          return `<b style="font-size:13px">${p.name}</b><br/>
            可报院校 <b style="color:#38bdf8">${v.count}</b> 所 · 专业 <b style="color:#c084fc">${v.majors}</b> 个<br/>
            <span style="color:#9aa6c0;font-size:11px">点击查看院校列表</span>`;
        }
      },
      series: [
        {
          type: 'lines', coordinateSystem: 'geo', zlevel: 2,
          effect: { show: true, period: 5, trailLength: .35, color: 'rgba(190,225,255,.85)', symbol: 'arrow', symbolSize: 4.5 },
          lineStyle: { color: '#38bdf8', width: .7, opacity: .28, curveness: .25 },
          data: lines
        },
        {
          type: 'effectScatter', coordinateSystem: 'geo', zlevel: 3,
          rippleEffect: { brushType: 'stroke', scale: 2.2, period: 4 },
          symbolSize: d => sizeOf(d[2]),
          itemStyle: { color: 'rgba(124,196,255,.8)', shadowBlur: 6, shadowColor: 'rgba(56,189,248,.7)' },
          label: { show: false },
          data: scatter
        }
      ]
    });
  }

  const nameToCode = {};
  for (const c in PROV) nameToCode[PROV[c].n] = c;

  chart.on('click', p => {
    if (p.componentType === 'geo') {
      chart.dispatchAction({ type: 'hideTip' });
      chart.dispatchAction({ type: 'downplay', geoIndex: 0 });
      const code = nameToCode[p.name];
      if (code && curResult.byProv[code]) openDrawer(code);
    }
  });
  window.addEventListener('resize', () => chart.resize());

  // -------- drawer (province list / all list) --------
  function schoolCard(r, showProv) {
    const ys = r.s.y[state.year];
    const el = document.createElement('div');
    el.className = 'scard';
    el.innerHTML = `
      <div class="top">
        ${showProv ? `<span class="pchip">${PROV[r.s.p].n}</span>` : ''}
        <div class="nm">${r.s.n}</div>
        <div class="rk">位次 ${fmt(ys.mxr)}–${fmt(ys.mnr)}</div>
      </div>
      <div class="bot">
        <div class="badges">${badgeHTML(r.s.t)}</div>
        <div class="mini">投档线 <b>${ys.mn}</b><i></i>匹配 <b class="hl">${r.count}</b> 专业</div>
      </div>`;
    el.onclick = () => openModal(r.s);
    return el;
  }

  function openDrawer(code) {
    state.drawerMode = 'prov'; state.prov = code;
    const v = curResult.byProv[code], info = PROV[code];
    $('#dwSort').classList.remove('show'); $('#dwTools').classList.remove('show');
    $('#dwProv').textContent = info.n + ' · ' + state.year + '年 · ' + GK.tracks[TRACK].name;
    $('#dwTitle').firstChild.textContent = '院校列表 ';
    $('#dwCount').textContent = `共 ${v.count} 所`;
    const list = v.schools.slice().sort((a, b) => a.s.y[state.year].mxr - b.s.y[state.year].mxr);
    const box = $('#dwList'); box.innerHTML = '';
    list.forEach(r => box.appendChild(schoolCard(r, false)));
    box.scrollTop = 0;
    $('#drawer').classList.add('open');
    fabDock().classList.add('hide');
  }

  function openAll() {
    state.drawerMode = 'all'; state.prov = null;
    const y = state.year;
    const list = curResult.all.slice().sort((a, b) =>
      state.allSort === 'score' ? b.s.y[y].mn - a.s.y[y].mn : a.s.y[y].mxr - b.s.y[y].mxr);
    $('#dwProv').textContent = `全部省份 · ${y}年 · ${GK.tracks[TRACK].name}`;
    $('#dwTitle').firstChild.textContent = '全部可报院校 ';
    $('#dwCount').textContent = `共 ${list.length} 所`;
    $('#dwTools').classList.remove('show');
    const sortBar = $('#dwSort'); sortBar.classList.add('show');
    [...sortBar.querySelectorAll('button')].forEach(b => b.classList.toggle('on', b.dataset.by === state.allSort));
    const box = $('#dwList'); box.innerHTML = '';
    const frag = document.createDocumentFragment();
    list.forEach(r => frag.appendChild(schoolCard(r, true)));
    box.appendChild(frag);
    box.scrollTop = 0;
    $('#drawer').classList.add('open');
    fabDock().classList.add('hide');
  }

  function refreshDrawer() {
    if (state.drawerMode === 'all') openAll();
    else if (state.drawerMode === 'prov') {
      if (curResult.byProv[state.prov]) openDrawer(state.prov); else closeDrawer();
    }
  }
  function closeDrawer() { $('#drawer').classList.remove('open'); state.prov = null; state.drawerMode = null; fabDock().classList.remove('hide'); }

  // -------- modal --------
  let modalSchool = null, modalYear = null;
  function openModal(s) {
    modalSchool = s; modalYear = s.y[state.year] ? state.year : YEARS.filter(y => s.y[y])[0];
    $('#mdProv').textContent = PROV[s.p].n + ' · ' + GK.tracks[TRACK].name;
    $('#mdTitle').textContent = s.n;
    $('#mdBadges').innerHTML = badgeHTML(s.t);

    const yg = $('#mdYears'); yg.innerHTML = '';
    YEARS.forEach(y => {
      const ys = s.y[y];
      const c = document.createElement('div');
      if (!ys) { c.className = 'ycard na'; c.innerHTML = `<div>${y} 年<br/>无招生数据</div>`; yg.appendChild(c); return; }
      c.className = 'ycard' + (y === state.year ? ' cur' : '');
      c.innerHTML = `
        <div class="yr">${y} 年</div>
        <div class="row"><span>投档线</span><b>${ys.mn}</b></div>
        <div class="row"><span>最低位次</span><b>${fmt(ys.mnr)}</b></div>
        <div class="row"><span>最高分</span><b>${ys.mx}</b></div>
        <div class="row"><span>录取专业</span><b>${ys.nc}</b></div>`;
      yg.appendChild(c);
    });

    const tabs = $('#mdTabs'); tabs.innerHTML = '';
    YEARS.filter(y => s.y[y]).forEach(y => {
      const b = document.createElement('button');
      b.textContent = y + '年';
      b.className = y === modalYear ? 'on' : '';
      b.onclick = () => { modalYear = y; renderModalTable(); };
      tabs.appendChild(b);
    });
    const cnt = document.createElement('div'); cnt.className = 'cnt'; cnt.id = 'mdCnt';
    tabs.appendChild(cnt);

    renderModalTable();
    $('#mask').classList.add('show');
    $('#modal').classList.add('show');
  }

  function renderModalTable() {
    [...$('#mdTabs').children].forEach(b => { if (b.tagName === 'BUTTON') b.className = (b.textContent === modalYear + '年') ? 'on' : ''; });
    const s = modalSchool, majors = (s.m[modalYear] || []).slice();
    const lo = state.lo == null ? 1 : state.lo, hi = state.hi == null ? Infinity : state.hi;
    const inRange = m => m[2] >= lo && m[2] <= hi && (!state.major || m[0].indexOf(state.major) >= 0);
    const hitN = majors.filter(inRange).length;
    $('#mdCnt').innerHTML = (modalYear === state.year)
      ? `符合当前位次 <b>${hitN}</b> / ${majors.length} 个专业`
      : `共 ${majors.length} 个专业`;
    const body = $('#mdBody'); body.innerHTML = '';
    for (const m of majors) {
      const hit = (modalYear === state.year) && inRange(m);
      const mk = lookupMajor(m[0]);
      const tr = document.createElement('tr');
      tr.className = (hit ? 'hit ' : '') + (mk ? 'has-mj' : '');
      tr.innerHTML = `
        <td><span class="mn">${m[0]}</span>${mk ? '<span class="mj-link">详解</span>' : ''}${hit ? '<span class="dim-pill">符合</span>' : ''}</td>
        <td class="r"><span class="sc">${m[1]}</span></td>
        <td class="r"><span class="rk">${fmt(m[2])}</span></td>`;
      if (mk) tr.onclick = () => renderMajorDetail(mk, { ctx: { t: TRACK, c: s.c, mn: m[0], sc: m[1], rk: m[2] } });
      body.appendChild(tr);
    }
  }
  function closeModal() { $('#mask').classList.remove('show'); $('#modal').classList.remove('show'); }

  // -------- 专业详解 / 专业百科 滑出面板 --------
  function openMjPanel() { $('#mjMask').classList.add('show'); $('#mjPanel').classList.add('show'); }
  function closeMjPanel() { $('#mjMask').classList.remove('show'); $('#mjPanel').classList.remove('show'); }

  function salBars(sal) {
    const CAP = 300000;
    return sal.map(([ind, a, b]) => `
      <div class="ind">对口行业：${ind}</div>
      ${a ? `<div class="it"><div class="row"><span>城镇非私营单位</span><b>¥${a.toLocaleString()}</b></div><div class="bar a"><i style="width:${Math.min(100, a / CAP * 100)}%"></i></div></div>` : ''}
      ${b ? `<div class="it"><div class="row"><span>城镇私营单位</span><b>¥${b.toLocaleString()}</b></div><div class="bar b"><i style="width:${Math.min(100, b / CAP * 100)}%"></i></div></div>` : ''}`).join('');
  }

  function renderMajorDetail(name, opts) {
    opts = opts || {};
    const rec = MAJORS[name]; if (!rec) return;
    const ctx = opts.ctx || null;
    const jyText = (rec.jy || '').split(/对口行业参考/)[0].replace(/[。；;\s]+$/, '').trim();
    const on = ctx ? isWished(ctx.t, ctx.c, ctx.mn) : false;
    const cs = ctx ? schoolOf(ctx.t, ctx.c) : null;
    $('#mjInner').innerHTML = `
      ${opts.fromWiki ? '<button class="mj-back" id="mjBack">← 返回专业百科</button>' : ''}
      <div class="mj-cat">${rec.ml || ''}${rec.lc ? ' · ' + rec.lc : ''}</div>
      <h3 class="mj-name">${ctx ? ctx.mn : name}</h3>
      ${cs ? `<div class="mj-school">${PROV[cs.p].n} · ${cs.n}${ctx.sc ? ` · 投档 ${ctx.sc} · 位次 ${fmt(ctx.rk)}` : ''}</div>` : ''}
      <div class="mj-brief">
        ${rec.lc ? `<span>专业类：${rec.lc}</span>` : ''}
        ${rec.xz ? `<span>学制：${rec.xz}</span>` : ''}
        ${rec.xw ? `<span>${rec.xw}</span>` : ''}
      </div>
      ${ctx ? `<button class="mj-fav${on ? ' on' : ''}" id="mjFav">${on ? '★ 已加入志愿表' : '☆ 收藏该专业到志愿表'}</button>` : ''}
      ${rec.nh ? `<div class="mj-sec"><div class="h">专业内涵</div><p>${rec.nh}</p></div>` : ''}
      ${rec.mb ? `<div class="mj-sec"><div class="h">培养目标</div><p>${rec.mb}</p></div>` : ''}
      ${rec.kc && rec.kc.length ? `<div class="mj-sec"><div class="h">核心课程</div><div class="mj-chips">${rec.kc.map(c => `<span>${c}</span>`).join('')}</div></div>` : ''}
      <div class="mj-sec"><div class="h">就业方向与薪酬</div>
        ${jyText ? `<p>${jyText}</p>` : ''}
        ${rec.sal && rec.sal.length ? `<div class="mj-sal">${salBars(rec.sal)}<div class="note">薪酬为对口行业年平均工资（行业口径，非专业口径）。来源：国家统计局《2024 年城镇单位就业人员年平均工资》。</div></div>` : ''}
      </div>`;
    if (opts.fromWiki) $('#mjBack').onclick = () => renderMajorWiki();
    if (ctx) $('#mjFav').onclick = () => { toggleWish(ctx.t, ctx.c, ctx.mn); renderMajorDetail(name, opts); };
    $('#mjInner').scrollTop = 0;
    openMjPanel();
  }

  function renderMajorWiki() {
    $('#mjInner').innerHTML = `
      <div class="mj-wikihd"><h3>📖 专业百科</h3></div>
      <div class="mj-search"><span class="ic">🔍</span><input id="mjSearch" placeholder="搜专业名，如 计算机 / 金融 / 临床医学"></div>
      <div id="mjResults"></div>`;
    const input = $('#mjSearch'), res = $('#mjResults'), keys0 = Object.keys(MAJORS);
    const draw = q => {
      const keys = q ? keys0.filter(k => k.indexOf(q) >= 0) : keys0;
      if (!keys.length) { res.innerHTML = '<div class="mj-empty">没有匹配的专业</div>'; return; }
      const byCat = {};
      keys.forEach(k => { const c = MAJORS[k].ml || '其他'; (byCat[c] || (byCat[c] = [])).push(k); });
      res.innerHTML = Object.keys(byCat).map(c =>
        `<div class="mj-wcat">${c}（${byCat[c].length}）</div>` +
        byCat[c].map(k => `<div class="mj-witem" data-k="${k}"><b>${k}</b><em>${MAJORS[k].lc || ''}</em></div>`).join('')
      ).join('');
      res.querySelectorAll('.mj-witem').forEach(el => el.onclick = () => renderMajorDetail(el.dataset.k, { fromWiki: true }));
    };
    draw('');
    input.oninput = () => draw(input.value.trim());
    $('#mjInner').scrollTop = 0;
    openMjPanel();
    setTimeout(() => input.focus(), 120);
  }

  // -------- batch lines (特控线 / 本科线) --------
  function renderBatchLine() {
    const ln = LINES[state.year]; const el = $('#batchLine');
    if (!ln) { el.innerHTML = ''; return; }
    el.innerHTML =
      `<span class="bl-track">${GK.tracks[TRACK].name} · ${state.year}年</span>` +
      `<span class="bl-item">特控线 <b>${ln.tk}</b> <em>(位次 ${fmt(ln.tkr)})</em></span>` +
      `<span class="bl-item">本科线 <b>${ln.bk}</b> <em>(位次 ${fmt(ln.bkr)})</em></span>`;
  }

  // -------- 我的志愿表（精确到专业） --------
  function updateWishUI() {
    $('#wlCount').textContent = WISH.length || '';
    if (state.drawerMode === 'wish') openWishlist();
  }

  function openWishlist() {
    state.drawerMode = 'wish'; state.prov = null;
    $('#dwSort').classList.remove('show');
    $('#dwTools').classList.toggle('show', WISH.length > 0);
    $('#dwProv').textContent = '我的志愿表 · 本地保存';
    $('#dwTitle').firstChild.textContent = '我的志愿表 ';
    $('#dwCount').textContent = `共 ${WISH.length} 个专业`;
    const box = $('#dwList'); box.innerHTML = '';
    if (!WISH.length) {
      box.innerHTML = '<div class="wl-empty">还没有收藏专业。<br/>点开院校里带 <b>详解</b> 的专业（或专业百科），在详情页点 <b>☆ 收藏</b> 即可加入。</div>';
    } else {
      WISH.forEach((w, idx) => {
        const info = majorInfo(w); if (!info) return;
        const s = info.s;
        const el = document.createElement('div'); el.className = 'wl-card';
        el.innerHTML = `<div class="wl-ord">${idx + 1}</div>
          <div class="wl-main">
            <div class="nm">${w.mn}</div>
            <div class="sub"><span class="pc">${s.n}</span><span>${PROV[s.p].n} · ${GK.tracks[w.t].name}</span>${info.sc ? `<span>投档 <b>${info.sc}</b> · 位次 <b>${fmt(info.rk)}</b></span>` : ''}</div>
          </div>
          <div class="wl-ctrl"><button class="up" ${idx === 0 ? 'disabled' : ''}>▲</button><button class="dn" ${idx === WISH.length - 1 ? 'disabled' : ''}>▼</button></div>
          <button class="wl-del" title="移除">✕</button>`;
        el.querySelector('.wl-main').onclick = () => openWishMajor(w);
        el.querySelector('.up').onclick = () => moveWish(idx, -1);
        el.querySelector('.dn').onclick = () => moveWish(idx, 1);
        el.querySelector('.wl-del').onclick = () => { WISH.splice(idx, 1); saveWish(); updateWishUI(); };
        box.appendChild(el);
      });
    }
    box.scrollTop = 0;
    $('#drawer').classList.add('open'); fabDock().classList.add('hide');
  }
  function moveWish(i, d) {
    const j = i + d; if (j < 0 || j >= WISH.length) return;
    [WISH[i], WISH[j]] = [WISH[j], WISH[i]]; saveWish(); openWishlist();
  }
  function openWishMajor(w) {
    if (w.t !== TRACK) { applyTrack(w.t); renderTrackSeg(); renderYearSeg(); fullRefresh(); }
    const key = lookupMajor(w.mn);
    if (!key) return toast('该专业暂无详解');
    const info = majorInfo(w);
    renderMajorDetail(key, { ctx: { t: w.t, c: w.c, mn: w.mn, sc: info && info.sc, rk: info && info.rk } });
  }

  function wishRows() {
    return WISH.map((w, i) => {
      const info = majorInfo(w); if (!info) return null;
      const s = info.s;
      return { i: i + 1, track: GK.tracks[w.t].name, school: s.n, major: w.mn, prov: PROV[s.p].n, tier: s.t, sc: info.sc, rk: info.rk, y: info.y };
    }).filter(Boolean);
  }
  function exportCSV() {
    const rows = wishRows(); if (!rows.length) return toast('志愿表为空');
    const head = ['序号', '科类', '院校', '专业', '省份', '层次', '参考年份', '投档分', '投档位次'];
    const lines = [head.join(',')].concat(rows.map(r => [r.i, r.track, r.school, '"' + r.major + '"', r.prov, r.tier, r.y || '', r.sc == null ? '' : r.sc, r.rk == null ? '' : r.rk].join(',')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '我的志愿表.csv';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('已导出 CSV');
  }
  function copyWish() {
    const rows = wishRows(); if (!rows.length) return toast('志愿表为空');
    const txt = rows.map(r => `${r.i}. ${r.school}－${r.major}（${r.prov}·${r.track}）${r.sc != null ? '投档' + r.sc + ' 位次' + fmt(r.rk) : ''}`).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast('已复制志愿清单')).catch(() => toast('复制失败，请手动'));
    else toast('当前环境不支持复制');
  }

  // -------- 专业对比 --------
  function tierShort(t) {
    const l = levelsOf(t)[0];
    const cls = { '985': 'b985', '211': 'b211', '双一流': 'bsyl', '普通': '' }[l] || '';
    return `<span class="${cls}">${l === '普通' ? '普通' : l}</span>`;
  }
  function openCompare() {
    const rows = wishRows();
    if (rows.length < 2) return toast('至少收藏 2 个专业才能对比');
    let h = '<table><thead><tr><th class="rowh">专业</th><th>院校</th><th>省份</th><th>层次</th><th>投档分</th><th>投档位次</th></tr></thead><tbody>';
    rows.forEach(r => {
      h += `<tr><td class="rowh">${r.major}<div style="font-size:10px;color:var(--txt-mute);font-weight:600">${r.track}</div></td>`;
      h += `<td>${r.school}</td><td>${r.prov}</td><td>${tierShort(r.tier)}</td>`;
      h += `<td><span class="sn">${r.sc == null ? '—' : r.sc}</span></td>`;
      h += `<td style="color:var(--cyan);font-weight:700">${r.rk == null ? '—' : fmt(r.rk)}</td></tr>`;
    });
    h += '</tbody></table>';
    $('#cmpBody').innerHTML = h;
    $('#cmpMask').classList.add('show'); $('#cmpModal').classList.add('show');
  }
  function closeCompare() { $('#cmpMask').classList.remove('show'); $('#cmpModal').classList.remove('show'); }

  // -------- stats + refresh --------
  function refresh() {
    curResult = compute();
    renderBatchLine();
    $('#stSchools').textContent = fmt(curResult.nSchool);
    $('#stProv').textContent = curResult.nProv;
    $('#stMajor').textContent = fmt(curResult.nMajor);
    const cnt = fmt(curResult.nSchool);
    $('#fabCount').textContent = cnt;
    $('#vaCount').textContent = cnt;
    $('#fabAllCount').textContent = cnt;
    $('#mapEmpty').classList.toggle('show', curResult.nSchool === 0);
    renderMap();
    refreshDrawer();
  }

  function refreshTierCounts() {
    const saved = state.tiers; state.tiers = new Set();
    const cnt = { '985': 0, '211': 0, '双一流': 0, '普通': 0 };
    for (const s of SCHOOLS) { if (evalSchool(s)) levelsOf(s.t).forEach(l => cnt[l]++); }
    state.tiers = saved;
    document.querySelectorAll('.ct').forEach(e => e.textContent = cnt[e.dataset.c]);
  }
  const fullRefresh = () => { refreshTierCounts(); refresh(); };

  // -------- track + year segmented --------
  function renderTrackSeg() {
    const seg = $('#trackSeg'); seg.innerHTML = '';
    TKEYS.forEach(k => {
      const b = document.createElement('button');
      b.textContent = GK.tracks[k].name;
      b.className = k === TRACK ? 'on' : '';
      b.onclick = () => {
        if (k === TRACK) return;
        applyTrack(k);
        [...seg.children].forEach(x => x.classList.remove('on')); b.classList.add('on');
        closeDrawer(); renderYearSeg(); fullRefresh();
      };
      seg.appendChild(b);
    });
  }
  function renderYearSeg() {
    const seg = $('#yearSeg'); seg.innerHTML = '';
    const note = { [YEARS[0]]: '最早', [YEARS[YEARS.length - 1]]: '最新' };
    YEARS.forEach(y => {
      const b = document.createElement('button');
      b.innerHTML = `${y}<span class="ny">${note[y] || '参考'}</span>`;
      b.className = y === state.year ? 'on' : '';
      b.onclick = () => { state.year = y; [...seg.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); fullRefresh(); };
      seg.appendChild(b);
    });
  }

  function syncHint() {
    const h = $('#rkHint');
    if (state.lo == null && state.hi == null) h.innerHTML = '当前显示 <b>全部</b> 院校 · 位次值越小排名越靠前';
    else h.innerHTML = `位次 <b>${state.lo == null ? '不限' : fmt(state.lo)}</b> ~ <b>${state.hi == null ? '不限' : fmt(state.hi)}</b> · 值越小排名越靠前`;
  }
  function setPresetActive() {
    document.querySelectorAll('#presets button').forEach(b => {
      const lo = b.dataset.lo === '' ? null : +b.dataset.lo;
      const hi = b.dataset.hi === '' ? null : +b.dataset.hi;
      b.classList.toggle('on', lo === state.lo && hi === state.hi);
    });
  }
  let deb;
  const debounced = () => { clearTimeout(deb); deb = setTimeout(fullRefresh, 180); };

  $('#rkLo').oninput = e => { state.lo = e.target.value === '' ? null : Math.max(1, +e.target.value); syncHint(); setPresetActive(); debounced(); };
  $('#rkHi').oninput = e => { state.hi = e.target.value === '' ? null : Math.max(1, +e.target.value); syncHint(); setPresetActive(); debounced(); };

  document.querySelectorAll('#presets button').forEach(b => b.onclick = () => {
    state.lo = b.dataset.lo === '' ? null : +b.dataset.lo;
    state.hi = b.dataset.hi === '' ? null : +b.dataset.hi;
    $('#rkLo').value = state.lo ?? ''; $('#rkHi').value = state.hi ?? '';
    syncHint(); setPresetActive(); fullRefresh();
  });

  document.querySelectorAll('#tierChips .chip').forEach(c => c.onclick = () => {
    const k = c.dataset.k;
    if (state.tiers.has(k)) state.tiers.delete(k); else state.tiers.add(k);
    c.classList.toggle('on', state.tiers.has(k));
    refresh();
  });

  $('#kwMajor').oninput = e => { state.major = e.target.value.trim(); debounced(); };
  $('#kwSchool').oninput = e => { state.school = e.target.value.trim(); debounced(); };

  $('#btnReset').onclick = () => {
    state.lo = state.hi = null; state.tiers.clear(); state.major = state.school = '';
    $('#rkLo').value = ''; $('#rkHi').value = ''; $('#kwMajor').value = ''; $('#kwSchool').value = '';
    document.querySelectorAll('#tierChips .chip').forEach(c => c.classList.remove('on'));
    syncHint(); setPresetActive(); fullRefresh();
  };

  $('#dwClose').onclick = closeDrawer;
  $('#mdClose').onclick = closeModal;
  $('#mask').onclick = closeModal;

  // view-all triggers
  $('#btnViewAll').onclick = () => { openAll(); closeSheet(); };
  $('#fabAll').onclick = () => { openAll(); closeSheet(); };

  // 专业百科 + 详解面板
  $('#btnWiki').onclick = () => { renderMajorWiki(); closeSheet(); };
  $('#mjClose').onclick = closeMjPanel;
  $('#mjMask').onclick = closeMjPanel;

  // 我的志愿表 + 收藏 + 对比
  $('#btnWish').onclick = () => { openWishlist(); closeSheet(); };
  $('#wlCsv').onclick = exportCSV;
  $('#wlCopy').onclick = copyWish;
  $('#wlClear').onclick = () => { if (WISH.length && confirm('清空我的志愿表？')) { WISH = []; saveWish(); updateWishUI(); } };
  $('#wlCompare').onclick = openCompare;
  $('#cmpClose').onclick = closeCompare;
  $('#cmpMask').onclick = closeCompare;

  // all-list sort toggle
  $('#dwSort').querySelectorAll('button').forEach(b => b.onclick = () => {
    if (state.allSort === b.dataset.by) return;
    state.allSort = b.dataset.by; openAll();
  });

  // mobile filter bottom-sheet
  const side = document.querySelector('.side'), sheetMask = $('#sheetMask');
  const openSheet = () => { side.classList.add('open'); sheetMask.classList.add('show'); };
  const closeSheet = () => { side.classList.remove('open'); sheetMask.classList.remove('show'); };
  $('#fab').onclick = openSheet;
  $('#sideDone').onclick = closeSheet;
  $('#sheetMask').onclick = closeSheet;

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('#cmpModal').classList.contains('show')) closeCompare();
    else if ($('#mjPanel').classList.contains('show')) closeMjPanel();
    else { closeModal(); closeDrawer(); closeSheet(); }
  });

  // -------- init --------
  renderTrackSeg(); renderYearSeg(); syncHint(); setPresetActive(); fullRefresh(); updateWishUI();

  if (location.hash === '#test') window.__t = { openDrawer, openModal, openAll, openWishlist, openCompare, toggleWish, applyTrack, lookupMajor, renderMajorDetail, renderMajorWiki, get WISH() { return WISH; }, state, get result() { return curResult; } };
})();
