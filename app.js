/* ===== 重庆物理类 · 志愿填报地图 ===== */
(function () {
  const GK = window.GK, PROV = GK.prov;
  const YEARS = GK.years;
  const CQ = PROV['50'].c;            // 重庆 center (飞线起点)
  const $ = s => document.querySelector(s);
  const isTouch = window.matchMedia('(hover:none),(pointer:coarse)').matches; // 触屏设备

  // -------- state --------
  const state = {
    year: YEARS[YEARS.length - 1],   // 默认最新年份
    lo: null, hi: null,
    tiers: new Set(),                // 空 = 全部层次
    major: '', school: '',
    prov: null,                      // 当前抽屉省份
  };

  // -------- helpers --------
  function levelsOf(t) {
    const L = [];
    if (t.indexOf('985') >= 0) L.push('985');
    if (t.indexOf('211') >= 0) L.push('211');
    if (t.indexOf('双一流') >= 0) L.push('双一流');
    if (!L.length) L.push('普通');
    return L;
  }
  function topLevel(t) { return levelsOf(t)[0]; }
  function badgeHTML(t) {
    const map = { '985': ['b985', '985'], '211': ['b211', '211'], '双一流': ['bsyl', '双一流'], '普通': ['bnorm', '普通'] };
    return levelsOf(t).map(l => `<span class="bdg ${map[l][0]}">${map[l][1]}</span>`).join('');
  }
  const fmt = n => n == null ? '—' : n.toLocaleString('en-US');

  // -------- core filtering --------
  // returns {school, matched[], count} or null for the active year
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
    const byProv = {};            // code -> {count, majors, schools:[]}
    let nSchool = 0, nMajor = 0;
    for (const s of GK.schools) {
      const r = evalSchool(s);
      if (!r) continue;
      nSchool++; nMajor += r.count;
      const p = s.p;
      (byProv[p] || (byProv[p] = { count: 0, majors: 0, schools: [] }));
      byProv[p].count++; byProv[p].majors += r.count; byProv[p].schools.push(r);
    }
    return { byProv, nSchool, nMajor, nProv: Object.keys(byProv).length };
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
    const r = curResult, byProv = r.byProv;
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

  // name -> code lookup
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

  // -------- drawer --------
  function openDrawer(code) {
    state.prov = code;
    const v = curResult.byProv[code], info = PROV[code];
    $('#dwProv').textContent = info.n + ' · ' + state.year + '年';
    $('#dwCount').textContent = `共 ${v.count} 所`;
    const list = v.schools.slice().sort((a, b) => a.s.y[state.year].mnr - b.s.y[state.year].mnr);
    const box = $('#dwList'); box.innerHTML = '';
    for (const r of list) {
      const ys = r.s.y[state.year];
      const el = document.createElement('div');
      el.className = 'scard fade-in';
      el.innerHTML = `
        <div class="top">
          <div class="nm">${r.s.n}</div>
          <div class="rk">位次 ${fmt(ys.mxr)}–${fmt(ys.mnr)}</div>
        </div>
        <div class="bot">
          <div class="badges">${badgeHTML(r.s.t)}</div>
          <div class="mini">投档 <b>${ys.mn}</b><i></i>匹配 <b class="hl">${r.count}</b> 专业</div>
        </div>`;
      el.onclick = () => openModal(r.s);
      box.appendChild(el);
    }
    $('#drawer').classList.add('open');
  }
  function closeDrawer() { $('#drawer').classList.remove('open'); state.prov = null; }

  // -------- modal --------
  let modalSchool = null, modalYear = null;
  function openModal(s) {
    modalSchool = s; modalYear = s.y[state.year] ? state.year : YEARS.filter(y => s.y[y])[0];
    $('#mdProv').textContent = PROV[s.p].n;
    $('#mdTitle').textContent = s.n;
    $('#mdBadges').innerHTML = badgeHTML(s.t);

    // year comparison cards
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

    // year tabs
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
      const tr = document.createElement('tr');
      if (hit) tr.className = 'hit';
      tr.innerHTML = `
        <td><span class="mn">${m[0]}</span>${hit ? '<span class="dim-pill">符合</span>' : ''}</td>
        <td class="r"><span class="sc">${m[1]}</span></td>
        <td class="r"><span class="rk">${fmt(m[2])}</span></td>`;
      body.appendChild(tr);
    }
  }
  function closeModal() { $('#mask').classList.remove('show'); $('#modal').classList.remove('show'); }

  // -------- header stats + refresh --------
  function refresh() {
    curResult = compute();
    $('#stSchools').textContent = fmt(curResult.nSchool);
    $('#stProv').textContent = curResult.nProv;
    $('#stMajor').textContent = fmt(curResult.nMajor);
    $('#fabCount').textContent = fmt(curResult.nSchool);
    $('#mapEmpty').classList.toggle('show', curResult.nSchool === 0);
    renderMap();
    if (state.prov) {
      if (curResult.byProv[state.prov]) openDrawer(state.prov); else closeDrawer();
    }
  }

  // tier counts for chip labels (based on current year + rank/keyword, excluding tier filter)
  function refreshTierCounts() {
    const saved = state.tiers; state.tiers = new Set();
    const cnt = { '985': 0, '211': 0, '双一流': 0, '普通': 0 };
    for (const s of GK.schools) { if (evalSchool(s)) levelsOf(s.t).forEach(l => cnt[l]++); }
    state.tiers = saved;
    document.querySelectorAll('.ct').forEach(e => e.textContent = cnt[e.dataset.c]);
  }
  const fullRefresh = () => { refreshTierCounts(); refresh(); };

  // -------- UI bindings --------
  // year segmented
  const seg = $('#yearSeg');
  const noteYr = { [YEARS[0]]: '最早', [YEARS[YEARS.length - 1]]: '最新' };
  YEARS.forEach(y => {
    const b = document.createElement('button');
    b.innerHTML = `${y}<span class="ny">${noteYr[y] || '参考'}</span>`;
    b.className = y === state.year ? 'on' : '';
    b.onclick = () => { state.year = y; [...seg.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); fullRefresh(); };
    seg.appendChild(b);
  });

  function syncHint() {
    const h = $('#rkHint');
    if (state.lo == null && state.hi == null) h.innerHTML = '当前显示 <b>全部</b> 院校';
    else h.innerHTML = `位次 <b>${state.lo == null ? '不限' : fmt(state.lo)}</b> ~ <b>${state.hi == null ? '不限' : fmt(state.hi)}</b>`;
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
    syncHint(); setPresetActive(); closeDrawer(); fullRefresh();
  };

  $('#dwClose').onclick = closeDrawer;
  $('#mdClose').onclick = closeModal;
  $('#mask').onclick = closeModal;

  // mobile filter bottom-sheet
  const side = document.querySelector('.side'), sheetMask = $('#sheetMask');
  const openSheet = () => { side.classList.add('open'); sheetMask.classList.add('show'); };
  const closeSheet = () => { side.classList.remove('open'); sheetMask.classList.remove('show'); };
  $('#fab').onclick = openSheet;
  $('#sideDone').onclick = closeSheet;
  $('#sheetMask').onclick = closeSheet;

  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeDrawer(); closeSheet(); } });

  // -------- init --------
  syncHint(); setPresetActive(); fullRefresh();

  // test-only hook (enabled with #test in URL)
  if (location.hash === '#test') window.__t = { openDrawer, openModal, state, get result() { return curResult; } };
})();
