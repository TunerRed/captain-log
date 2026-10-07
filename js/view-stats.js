/* ============================================================================
 * 机长日志 · 统计视图
 * 时间段选择 → 按角色/分类统计起飞频率、排行、时间分布
 * ==========================================================================*/
(function (g) {
  'use strict';

  var U = g.U, Store = g.Store, D = U.D, Stats = g.Stats;

  var container = null;
  var state = {
    preset: 'year',
    start: null,
    end: null,
    tab: 'rank',
    customStart: null,
    customEnd: null
  };

  var TABS = [
    { id: 'rank', name: '角色排行' },
    { id: 'cat', name: '分类标签' },
    { id: 'time', name: '时间分布' },
    { id: 'heat', name: '热力图' },
    { id: 'cross', name: '交叉表' }
  ];

  var StatsView = {};
  StatsView.state = state;

  StatsView.mount = function (root) {
    container = root;
    if (!state.start || !state.end) applyPreset(state.preset || Store.get().settings.lastRangePreset || 'year');
    draw();
  };
  StatsView.refresh = function () { draw(); };

  /** 直接切到某个子视图（深链接 / 外部跳转用） */
  StatsView.setTab = function (id) {
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].id === id) { state.tab = id; draw(); return true; }
    }
    return false;
  };

  function ctx() {
    return { characters: Store.get().characters, categories: Store.get().categories };
  }
  function range() { return { start: state.start, end: state.end }; }

  function applyPreset(p) {
    var r = Stats.rangeFor(p, { today: D.todayKey(), weekStart: Store.get().settings.weekStart, records: Store.get().records });
    state.preset = p;
    state.start = r.start;
    state.end = r.end;
    if (p !== 'custom') {
      state.customStart = r.start;
      state.customEnd = r.end;
    }
    Store.setSetting('lastRangePreset', p);
  }

  /** 当前区间 + 过滤后的记录 */
  function currentData() {
    var recs = Store.recordsBetween(state.start, state.end);
    var res = Stats.compute(recs, {
      start: state.start, end: state.end,
      characters: Store.get().characters, categories: Store.get().categories
    });
    return res;
  }

  /* ------------------------------------------------------------ 主渲染 --- */
  function draw() {
    if (!container) return;
    U.clear(container);

    var res = currentData();

    /* ---- 区间选择 ---- */
    var presetRow = U.h('div.preset-row');
    Stats.PRESETS.forEach(function (p) {
      var b = U.h('button.preset' + (p.id === state.preset ? '.on' : ''), { type: 'button', text: p.name });
      b.addEventListener('click', function () {
        if (p.id === 'custom') {
          state.preset = 'custom';
          draw();
          return;
        }
        applyPreset(p.id);
        draw();
      });
      presetRow.appendChild(b);
    });

    var rangeInfo = U.h('div.range-info');
    rangeInfo.appendChild(U.h('div.range-text', { text: D.rangeLabel(state.start, state.end) + ' · 共 ' + res.totalDays + ' 天' }));
    var copyBtn = U.h('button.btn.btn-ghost.btn-sm', { type: 'button', text: '复制统计摘要' });
    copyBtn.addEventListener('click', function () {
      U.copy(Stats.summaryText(res)).then(function (ok) {
        U.toast(ok ? '统计摘要已复制到剪贴板' : '复制失败，请手动选择文本', ok ? '' : 'error');
        if (!ok) {
          var ta = U.h('textarea.input', { rows: 12 });
          ta.value = Stats.summaryText(res);
          U.openDialog({
            title: '统计摘要（手动复制）',
            body: ta,
            actions: [{ text: '关闭', kind: 'ghost' }]
          });
        }
      });
    });
    rangeInfo.appendChild(copyBtn);

    var customBox = null;
    if (state.preset === 'custom') {
      var s = U.h('input.input', { type: 'date', value: state.customStart || state.start });
      var e = U.h('input.input', { type: 'date', value: state.customEnd || state.end });
      var applyBtn = U.h('button.btn.btn-primary.btn-sm', { type: 'button', text: '应用区间' });
      applyBtn.addEventListener('click', function () {
        if (!D.isKey(s.value) || !D.isKey(e.value)) { U.toast('请选择完整的起止日期', 'error'); return; }
        if (D.diffDays(s.value, e.value) < 0) { U.toast('开始日期不能晚于结束日期', 'error'); return; }
        state.customStart = s.value; state.customEnd = e.value;
        state.start = s.value; state.end = e.value;
        Store.setSetting('lastRangePreset', 'custom');
        draw();
      });
      customBox = U.h('div.custom-range', null, [s, U.h('span.range-dash', { text: '~' }), e, applyBtn]);
    }

    /* ---- KPI ---- */
    var kpi = U.h('div.kpi-grid', null, [
      U.statCard({ label: '总起飞次数', value: U.num(res.total), unit: ' 次', sub: res.recCount + ' 条记录', tone: 'accent' }),
      U.statCard({ label: '有记录天数', value: U.num(res.activeDays), unit: ' 天', sub: '覆盖率 ' + U.pct(res.activeDays, res.totalDays) + '%' }),
      U.statCard({ label: '活跃日均', value: U.num(res.avgActive, 2), unit: ' 次', sub: '自然日均 ' + U.num(res.avgAll, 2) + ' 次' }),
      U.statCard({ label: '单日最高', value: res.maxDay ? U.num(res.maxDay.count) : '0', unit: ' 次', sub: res.maxDay ? D.shortLabel(res.maxDay.date) : '—' }),
      U.statCard({ label: '最长连续', value: U.num(res.streak.longest), unit: ' 天', sub: res.streak.longestEnd ? '截至 ' + D.shortLabel(res.streak.longestEnd) : '—' }),
      U.statCard({ label: '当前连续', value: U.num(res.streak.current), unit: ' 天', sub: res.streak.current > 0 ? '保持中' : '今天还没记录' }),
      U.statCard({ label: '活跃角色', value: U.num(res.charCount), unit: ' 个', sub: '全部角色 ' + Store.get().characters.length + ' 个' }),
      U.statCard({ label: '最常时段', value: topHourLabel(res), sub: '已记录时间的 ' + res.timedTotal + ' 次' })
    ]);

    /* ---- 子视图 ---- */
    var seg = U.segmented({
      items: TABS, value: state.tab,
      onChange: function (id) { state.tab = id; draw(); }
    });

    var panel = U.h('div.tab-panel');
    if (!res.total) {
      panel.appendChild(U.emptyState({
        icon: 'chart',
        title: '这个时间段还没有记录',
        text: '换个时间段，或者先去日历里记上几次。',
        actionText: '去日历记录',
        onAction: function () { g.App.switchTab('calendar'); }
      }));
    } else if (state.tab === 'rank') {
      panel.appendChild(renderRank(res));
    } else if (state.tab === 'cat') {
      panel.appendChild(renderCats(res));
    } else if (state.tab === 'time') {
      panel.appendChild(renderTime(res));
    } else if (state.tab === 'heat') {
      panel.appendChild(renderHeat(res));
    } else if (state.tab === 'cross') {
      panel.appendChild(renderCross(res));
    }

    U.append(container, [
      U.h('div.section-title', { text: '时间段' }),
      presetRow, rangeInfo, customBox,
      U.h('div.section-title', { text: '概览' }),
      kpi,
      seg, panel
    ]);
  }

  function topHourLabel(res) {
    var best = -1, bv = 0;
    res.hours.forEach(function (v, h) { if (v > bv) { bv = v; best = h; } });
    return best < 0 ? '—' : (D.pad(best) + ':00');
  }

  /* -------------------------------------------------------- 角色排行 --- */
  function renderRank(res) {
    var box = U.h('div');
    box.appendChild(U.h('div.panel-caption', {
      text: '共 ' + res.chars.length + ' 个角色在这段时间起飞 · 点任意一行看该角色的时间分布'
    }));
    var max = res.chars.length ? res.chars[0].count : 1;
    res.chars.forEach(function (ch, i) {
      box.appendChild(U.barRow({
        label: ch.name,
        leading: U.h('span.rank-no' + (i < 3 ? '.top' : ''), { text: String(i + 1) }),
        badge: null,
        value: ch.count, max: max, share: ch.share, color: ch.color,
        sub: ch.days + ' 天有记录 · 日均 ' + U.num(ch.count / Math.max(1, ch.days), 2) + ' 次 · 首次 ' + D.shortLabel(ch.first) + ' / 最近 ' + D.shortLabel(ch.last),
        onClick: function () { openDetail('character', ch.id); }
      }));
    });
    return box;
  }

  /* ------------------------------------------------------ 分类 / 标签 --- */
  function renderCats(res) {
    var box = U.h('div');
    box.appendChild(U.h('div.panel-caption', { text: '按分类看占比，分类内按标签看排行' }));
    var maxCat = res.cats.length ? Math.max.apply(null, res.cats.map(function (c) { return c.count; })) : 1;
    var overview = U.h('div');
    res.cats.forEach(function (cat) {
      overview.appendChild(U.barRow({
        label: cat.name, value: cat.count, max: maxCat, share: cat.share, color: cat.color,
        // 用 tagCount / tagUsed：cats[i].tags 是 map 不是数组，取 .length 会得到 undefined
        sub: cat.tagCount + ' 个标签 · 用到的 ' + cat.tagUsed + ' 个',
        onClick: function () { openDetail('category', cat.id); }
      }));
    });
    box.appendChild(U.h('div.section-title', { text: '分类占比' }));
    box.appendChild(overview);

    box.appendChild(U.h('div.section-title', { text: '标签排行' }));
    res.cats.forEach(function (cat) {
      var used = cat.tagList.filter(function (t) { return t.count > 0; });
      var head = U.h('div.cat-head', null, [
        U.h('span.dot', { style: { background: cat.color } }),
        U.h('span.cat-name', { text: cat.name }),
        U.h('span.cat-meta', { text: cat.count + ' 次 · ' + cat.share + '%' })
      ]);
      var body = U.h('div.cat-body');
      if (!used.length) {
        body.appendChild(U.h('div.hint-inline', { text: '这段时间没有用到该分类的标签' }));
      } else {
        var maxT = used[0].count;
        used.forEach(function (t) {
          body.appendChild(U.barRow({
            label: t.name, value: t.count, max: maxT, share: t.share, color: t.color,
            sub: '占本分类 ' + t.shareInCat + '%',
            onClick: function () { openDetail('tag', t.id); }
          }));
        });
      }
      box.appendChild(U.h('div.cat-block', null, [head, body]));
    });
    return box;
  }

  /* ---------------------------------------------------------- 时间分布 --- */
  function renderTime(res) {
    var box = U.h('div');

    // 时段四宫格
    var grid = U.h('div.bucket-grid');
    res.buckets.forEach(function (b, i) {
      var colors = ['#60a5fa', '#fbbf24', '#f472b6', '#7c6cff'];
      grid.appendChild(U.h('div.bucket-card', null, [
        U.h('div.bucket-name', { text: b.name }),
        U.h('div.bucket-value', null, [U.h('b', { text: U.num(b.count) }), U.h('span', { text: ' 次' })]),
        U.h('div.bucket-bar', null, [U.h('i', { style: { width: b.share + '%', background: colors[i] } })]),
        U.h('div.bucket-share', { text: b.share + '%' })
      ]));
    });
    box.appendChild(U.h('div.section-title', { text: '时段分布（凌晨/上午/下午/晚上）' }));
    box.appendChild(grid);

    // 24 小时
    box.appendChild(U.h('div.section-title', { text: '24 小时分布' }));
    box.appendChild(U.barChart({
      values: res.hours.map(function (v, h) {
        return { label: D.pad(h), value: v, tip: D.pad(h) + ':00–' + D.pad(h) + ':59 共 ' + v + ' 次', color: 'var(--accent)' };
      })
    }));
    if (res.noTimeCount) {
      box.appendChild(U.h('div.hint-inline', { text: '有 ' + res.noTimeCount + ' 条记录没有填时间，未计入小时分布。' }));
    }

    // 星期
    var ws = Store.get().settings.weekStart === 0 ? 0 : 1;
    var wdVals = [];
    for (var i = 0; i < 7; i++) {
      var idx = (ws + i) % 7;
      wdVals.push({ label: D.WEEK_CN[idx].replace('周', ''), value: res.weekdays[idx], color: '#22d3ee', tip: D.WEEK_CN[idx] + '：' + res.weekdays[idx] + ' 次' });
    }
    box.appendChild(U.h('div.section-title', { text: '星期分布' }));
    box.appendChild(U.barChart({ values: wdVals }));

    // 星期 × 时段
    box.appendChild(U.h('div.section-title', { text: '星期 × 时段 热力' }));
    box.appendChild(weekBucketGrid(res, ws));

    // 月度趋势
    if (res.months.length > 1) {
      box.appendChild(U.h('div.section-title', { text: '月度趋势' }));
      box.appendChild(U.barChart({
        values: res.months.map(function (m) {
          return { label: m.label, value: m.count, color: '#34d399', tip: m.key + '：' + m.count + ' 次 / ' + m.days + ' 天' };
        })
      }));
    }
    return box;
  }

  /** 星期 × 时段 网格：需要用记录原始 time 再聚合 */
  function weekBucketGrid(res, ws) {
    var grid = U.h('div.wb-grid');
    var cells = [];
    for (var r = 0; r < 4; r++) { cells.push([0, 0, 0, 0, 0, 0, 0]); }
    res.inRange.forEach(function (rec) {
      var h = D.hourOf(rec.time);
      if (h < 0) return;
      var b = h <= 5 ? 0 : h <= 11 ? 1 : h <= 17 ? 2 : 3;
      var wd = D.dow(rec.date);
      var col = (wd - ws + 7) % 7;
      cells[b][col] += rec.count || 1;
    });
    var max = 1;
    cells.forEach(function (row) { row.forEach(function (v) { if (v > max) max = v; }); });

    grid.appendChild(U.h('div.wb-corner'));
    for (var i = 0; i < 7; i++) {
      grid.appendChild(U.h('div.wb-head', { text: D.WEEK_CN[(ws + i) % 7].replace('周', '') }));
    }
    Stats.TIME_BUCKETS.forEach(function (b, bi) {
      grid.appendChild(U.h('div.wb-rowhead', { text: b.name }));
      for (var j = 0; j < 7; j++) {
        var v = cells[bi][j];
        grid.appendChild(U.h('div.wb-cell', {
          text: v ? String(v) : '',
          title: D.WEEK_CN[(ws + j) % 7] + ' ' + b.name + '：' + v + ' 次',
          style: { background: v ? 'rgba(124,108,255,' + (0.12 + 0.8 * (v / max)).toFixed(2) + ')' : 'var(--surface-2)' }
        }));
      }
    });
    return grid;
  }

  /* ------------------------------------------------------------ 热力图 --- */
  function renderHeat(res) {
    var box = U.h('div');
    var ws = Store.get().settings.weekStart === 0 ? 0 : 1;
    var start = D.startOfWeek(state.start, ws);
    var end = state.end;
    var weeks = Math.ceil((D.diffDays(start, end) + 1) / 7);

    var wrap = U.h('div.heat-wrap');
    var grid = U.h('div.heat-grid');

    // 表头（星期）
    var headCol = U.h('div.heat-col.heat-head-col');
    headCol.appendChild(U.h('div.heat-labels'));
    for (var i = 0; i < 7; i++) {
      headCol.appendChild(U.h('div.heat-dow', { text: D.WEEK_CN[(ws + i) % 7].replace('周', '') }));
    }
    grid.appendChild(headCol);

    var max = 1;
    Object.keys(res.byDate).forEach(function (k) { if (res.byDate[k] > max) max = res.byDate[k]; });

    for (var w = 0; w < weeks; w++) {
      var col = U.h('div.heat-col');
      var colStart = D.addDays(start, w * 7);
      var mk = D.monthKey(colStart);
      var prevMk = w > 0 ? D.monthKey(D.addDays(start, (w - 1) * 7)) : null;
      col.appendChild(U.h('div.heat-labels', null, [
        (w === 0 || mk !== prevMk) ? U.h('span.heat-month', { text: (Number(mk.slice(5, 7))) + '月' }) : null
      ]));
      for (var d = 0; d < 7; d++) {
        var key = D.addDays(colStart, d);
        var inRange = key >= state.start && key <= end;
        var v = res.byDate[key] || 0;
        if (!inRange) {
          col.appendChild(U.h('div.heat-cell.blank'));
          continue;
        }
        var lvl = v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4));
        var cell = U.h('div.heat-cell', {
          title: D.dayLabel(key) + '：' + v + ' 次',
          dataset: { date: key, lvl: String(lvl) },
          style: { background: heatColor(lvl) }
        });
        cell.addEventListener('click', function (k) { return function () { g.DaySheet.open(k); }; }(key));
        col.appendChild(cell);
      }
      grid.appendChild(col);
    }
    wrap.appendChild(grid);

    var legend = U.h('div.heat-legend', null, [
      U.h('span', { text: '少' }),
      U.h('i', { style: { background: heatColor(0) } }),
      U.h('i', { style: { background: heatColor(1) } }),
      U.h('i', { style: { background: heatColor(2) } }),
      U.h('i', { style: { background: heatColor(3) } }),
      U.h('i', { style: { background: heatColor(4) } }),
      U.h('span', { text: '多' })
    ]);

    box.appendChild(U.h('div.section-title', { text: '每日热力图（点击格子可查看/补记）' }));
    box.appendChild(wrap);
    box.appendChild(legend);

    // 高亮日
    var top = Object.keys(res.byDate).map(function (k) { return { date: k, count: res.byDate[k] }; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 8);
    var list = U.h('div.top-days');
    top.forEach(function (t) {
      var chip = U.h('button.day-chip', { type: 'button' }, [
        U.h('b', { text: D.shortLabel(t.date) }),
        U.h('span', { text: t.count + ' 次' })
      ]);
      chip.addEventListener('click', function () { g.DaySheet.open(t.date); });
      list.appendChild(chip);
    });
    box.appendChild(U.h('div.section-title', { text: '高频日 TOP8' }));
    box.appendChild(list);
    return box;
  }

  function heatColor(lvl) {
    if (lvl <= 0) return 'var(--heat-0)';
    return 'rgba(124,108,255,' + (0.18 + 0.2 * (lvl - 1) + 0.18).toFixed(2) + ')';
  }

  /* ---------------------------------------------------------- 交叉表 --- */
  function renderCross(res) {
    var box = U.h('div');
    var cats = res.cats.filter(function (c) { return true; });
    box.appendChild(U.h('div.panel-caption', { text: '每个角色在各类标签下的次数（同一记录含多个分类会各计一次）' }));

    var table = U.h('table.matrix');
    var thead = U.h('thead');
    var hr = U.h('tr');
    hr.appendChild(U.h('th.mx-name', { text: '角色' }));
    cats.forEach(function (c) { hr.appendChild(U.h('th', { text: c.name, title: c.name })); });
    hr.appendChild(U.h('th.mx-total', { text: '合计' }));
    thead.appendChild(hr);
    table.appendChild(thead);

    var max = 1;
    res.chars.forEach(function (ch) {
      cats.forEach(function (c) {
        var v = (res.matrix[ch.id] || {})[c.id] || 0;
        if (v > max) max = v;
      });
    });

    var tbody = U.h('tbody');
    res.chars.forEach(function (ch) {
      var tr = U.h('tr');
      tr.appendChild(U.h('th.mx-name', null, [
        U.h('span.mx-dot', { style: { background: ch.color } }),
        U.h('span', { text: ch.name })
      ]));
      cats.forEach(function (c) {
        var v = (res.matrix[ch.id] || {})[c.id] || 0;
        tr.appendChild(U.h('td', {
          text: v ? String(v) : '–',
          style: v ? { background: 'rgba(124,108,255,' + (0.10 + 0.7 * (v / max)).toFixed(2) + ')' } : null
        }));
      });
      tr.appendChild(U.h('td.mx-total', { text: String(ch.count) }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(U.h('div.matrix-wrap', null, table));
    return box;
  }

  /* -------------------------------------------------------- 细分详情 --- */
  function openDetail(type, id) {
    var sub = Stats.breakdown(Store.get().records, range(), { type: type, id: id }, ctx());
    var name = '', color = 'var(--accent)', extra = null;

    if (type === 'character') {
      var ch = Store.findCharacter(id);
      if (!ch) return;
      name = ch.name; color = ch.color;
    } else if (type === 'tag') {
      var f = Store.findTag(id);
      if (!f) return;
      name = f.tag.name; color = f.tag.color;
      extra = f.category.name;
    } else {
      var cat = Store.findCategory(id);
      if (!cat) return;
      name = cat.name; color = cat.color;
    }

    var typeName = type === 'character' ? '角色' : type === 'tag' ? '标签' : '分类';
    var box = U.h('div');

    box.appendChild(U.h('div.kpi-grid', null, [
      U.statCard({ label: '起飞次数', value: U.num(sub.total), unit: ' 次', sub: sub.recCount + ' 条记录', tone: 'accent' }),
      U.statCard({ label: '有记录天数', value: U.num(sub.activeDays), unit: ' 天', sub: '覆盖 ' + U.pct(sub.activeDays, sub.totalDays) + '%' }),
      U.statCard({ label: '活跃日均', value: U.num(sub.avgActive, 2), unit: ' 次', sub: '自然日均 ' + U.num(sub.avgAll, 2) }),
      U.statCard({ label: '最长连续', value: U.num(sub.streak.longest), unit: ' 天', sub: sub.streak.longestEnd ? '截至 ' + D.shortLabel(sub.streak.longestEnd) : '—' })
    ]));

    // 时段
    box.appendChild(U.h('div.section-title', { text: '时段分布（24 小时）' }));
    box.appendChild(U.barChart({
      values: sub.hours.map(function (v, h) {
        return { label: D.pad(h), value: v, tip: D.pad(h) + ':00 共 ' + v + ' 次', color: color };
      })
    }));
    var bucketText = sub.buckets.filter(function (b) { return b.count; })
      .map(function (b) { return b.name + ' ' + b.count + ' 次(' + b.share + '%)'; }).join(' · ');
    if (bucketText) box.appendChild(U.h('div.hint-inline', { text: bucketText }));

    // 星期
    var ws = Store.get().settings.weekStart === 0 ? 0 : 1;
    var vals = [];
    for (var i = 0; i < 7; i++) {
      var idx = (ws + i) % 7;
      vals.push({ label: D.WEEK_CN[idx].replace('周', ''), value: sub.weekdays[idx], color: '#22d3ee', tip: D.WEEK_CN[idx] + '：' + sub.weekdays[idx] + ' 次' });
    }
    box.appendChild(U.h('div.section-title', { text: '星期分布' }));
    box.appendChild(U.barChart({ values: vals }));

    // 分类标签分布
    if (type !== 'tag') {
      box.appendChild(U.h('div.section-title', { text: type === 'category' ? '该分类下的标签' : '标签分布' }));
      var any = false;
      sub.cats.forEach(function (cat) {
        if (type === 'category' && cat.id !== id) return;
        var used = cat.tagList.filter(function (t) { return t.count > 0; });
        if (!used.length) return;
        any = true;
        box.appendChild(U.h('div.cat-head', null, [
          U.h('span.dot', { style: { background: cat.color } }),
          U.h('span.cat-name', { text: cat.name }),
          U.h('span.cat-meta', { text: cat.count + ' 次' })
        ]));
        var maxT = used[0].count;
        used.forEach(function (t) {
          box.appendChild(U.barRow({ label: t.name, value: t.count, max: maxT, share: t.share, color: t.color }));
        });
      });
      if (!any) box.appendChild(U.h('div.hint-inline', { text: '这段时间没有用到标签' }));
    }

    // 关联角色（标签/分类视角）
    if (type !== 'character' && sub.chars.length) {
      box.appendChild(U.h('div.section-title', { text: '关联角色' }));
      var maxC = sub.chars[0].count;
      sub.chars.slice(0, 10).forEach(function (c) {
        box.appendChild(U.barRow({
          label: c.name, value: c.count, max: maxC, share: c.share, color: c.color,
          leading: U.avatar(c.name, c.color, 20), sub: c.days + ' 天',
          onClick: function () { sheet.close(); openDetail('character', c.id); }
        }));
      });
    }

    // 月度趋势
    if (sub.months.length > 1) {
      box.appendChild(U.h('div.section-title', { text: '月度趋势' }));
      box.appendChild(U.barChart({
        values: sub.months.map(function (m) { return { label: m.label, value: m.count, color: color, tip: m.key + '：' + m.count + ' 次' }; })
      }));
    }

    // 最近记录
    var recent = sub.inRange.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.time || '') < (a.time || '') ? -1 : 1;
    }).slice(0, 12);
    if (recent.length) {
      box.appendChild(U.h('div.section-title', { text: '最近记录（' + D.rangeLabel(state.start, state.end) + '）' }));
      var list = U.h('div.mini-list');
      recent.forEach(function (r) {
        var ch = r.characterId ? Store.findCharacter(r.characterId) : null;
        var tags = r.tagIds.map(function (tid) {
          var f = Store.findTag(tid);
          return f ? U.tagPill(f.tag.name, f.tag.color) : null;
        }).filter(Boolean);
        var row = U.h('div.mini-row', null, [
          U.h('div.mini-date', { text: D.shortLabel(r.date) + (r.time ? ' ' + r.time : '') }),
          U.h('div.mini-body', null, [
            U.h('div.mini-chars', null, [
              U.avatar(ch ? ch.name : '?', ch ? ch.color : 'var(--muted)', 20),
              U.h('span', { text: (ch ? ch.name : '未指定角色') + ((r.count || 1) > 1 ? ' ×' + r.count : '') })
            ]),
            tags.length ? U.h('div.rec-tags', null, tags) : null
          ])
        ]);
        row.addEventListener('click', function () { g.DaySheet.open(r.date); });
        list.appendChild(row);
      });
      box.appendChild(list);
    }

    var sheet = U.openSheet({
      title: name,
      subtitle: typeName + (extra ? ' · ' + extra : '') + ' · ' + D.rangeLabel(state.start, state.end),
      body: box
    });
  }

  /* 从日历页跳转过来时高亮某个角色 */
  StatsView.focusCharacter = function (id) {
    state.tab = 'rank';
    if (!container) return;
    draw();
    openDetail('character', id);
  };

  StatsView.openDetail = openDetail;
  StatsView.applyPreset = applyPreset;

  g.StatsView = StatsView;
})(typeof window !== 'undefined' ? window : globalThis);
