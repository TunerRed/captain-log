/* ============================================================================
 * 机长日志 · 日历视图 + 当日记录面板
 * ==========================================================================*/
(function (g) {
  'use strict';

  var U = g.U, Store = g.Store, D = U.D, Stats = g.Stats;

  var state = { month: D.startOfMonth(D.todayKey()) };
  var container = null;

  /* ------------------------------------------------------------ 小工具 --- */

  /** 一条记录在日历/列表里的代表色：优先第一个标签色，其次角色色 */
  function recordColor(r) {
    if (r.tagIds && r.tagIds.length) {
      var f = Store.findTag(r.tagIds[0]);
      if (f) return f.tag.color;
    }
    var ch = r.characterId ? Store.findCharacter(r.characterId) : null;
    return ch ? ch.color : 'var(--muted)';
  }

  function charName(id) {
    var ch = id ? Store.findCharacter(id) : null;
    return ch ? ch.name : '未指定角色';
  }

  function groupOf(records) {
    var order = [], map = {};
    records.forEach(function (r) {
      var k = r.groupId || r.id;
      if (!map[k]) { map[k] = { id: k, records: [] }; order.push(map[k]); }
      map[k].records.push(r);
    });
    order.forEach(function (grp) {
      grp.records.sort(function (a, b) {
        var ta = a.time || '99:99', tb = b.time || '99:99';
        return ta === tb ? a.createdAt - b.createdAt : (ta < tb ? -1 : 1);
      });
    });
    return order;
  }

  function sumCount(records) { return U.sum(records, function (r) { return r.count || 1; }); }

  /* -------------------------------------------------------- 日历主体 --- */

  var Calendar = {};
  Calendar.state = state;
  Calendar.goToday = function () { state.month = D.startOfMonth(D.todayKey()); draw(); };

  Calendar.mount = function (root) { container = root; draw(); };
  Calendar.refresh = function () { draw(); };

  function draw() {
    if (!container) return;
    U.clear(container);

    var st = Store.get().settings;
    var ws = st.weekStart === 0 ? 0 : 1;
    var todayKey = D.todayKey();
    var firstOfMonth = D.startOfMonth(state.month);
    var monthEnd = D.endOfMonth(state.month);
    var gridStart = D.startOfWeek(firstOfMonth, ws);
    var cellsCount = Math.ceil((D.diffDays(gridStart, monthEnd) + 1) / 7) * 7;

    var monthRecords = Store.recordsBetween(firstOfMonth, monthEnd);
    var monthTotal = sumCount(monthRecords);
    var monthDays = {};
    monthRecords.forEach(function (r) { monthDays[r.date] = 1; });
    var monthStat = Stats.compute(monthRecords, {
      start: firstOfMonth, end: monthEnd,
      characters: Store.get().characters, categories: Store.get().categories
    });

    /* ---- 头部：月份切换 ---- */
    var head = U.h('div.cal-head', null, [
      U.iconBtn('left', '上个月', function () { state.month = D.addMonths(state.month, -1); draw(); }),
      U.h('button.month-label', {
        type: 'button', on: { click: function () { Calendar.goToday(); } }
      }, [
        U.h('b', { text: D.monthLabel(state.month) }),
        U.h('span.month-sub', { text: monthTotal ? (monthTotal + ' 次 · ' + Object.keys(monthDays).length + ' 天') : '暂无记录' })
      ]),
      U.iconBtn('right', '下个月', function () { state.month = D.addMonths(state.month, 1); draw(); })
    ]);

    var todayBtn = U.h('button.btn.btn-ghost.btn-sm', { type: 'button', text: '回到今天' });
    todayBtn.addEventListener('click', function () { Calendar.goToday(); });

    /* ---- 星期表头 ---- */
    var week = U.h('div.cal-week');
    for (var i = 0; i < 7; i++) {
      week.appendChild(U.h('span', { text: D.WEEK_CN[(ws + i) % 7].replace('周', '') }));
    }

    /* ---- 日期格子 ---- */
    var grid = U.h('div.cal-grid');
    for (var c = 0; c < cellsCount; c++) {
      var key = D.addDays(gridStart, c);
      var outside = key.slice(0, 7) !== firstOfMonth.slice(0, 7);
      var recs = Store.recordsOn(key);
      var total = sumCount(recs);
      var cls = 'cal-cell';
      if (outside) cls += ' outside';
      if (key === todayKey) cls += ' today';
      if (total > 0) cls += ' has';

      var bars = U.h('span.cal-bars');
      if (total > 0) {
        recs.slice(0, 8).forEach(function (r) {
          bars.appendChild(U.h('i', {
            style: { flex: String(r.count || 1), background: recordColor(r) },
            title: charName(r.characterId) + ' ×' + (r.count || 1)
          }));
        });
      }

      var cell = U.h('button.' + cls.split(' ').join('.'), { type: 'button', dataset: { date: key } }, [
        U.h('span.cal-dnum', { text: String(D.date(key).getDate()) }),
        total > 0 ? U.h('span.cal-count', { text: String(total) }) : null,
        bars
      ]);
      cell.addEventListener('click', function (k, out) {
        return function () {
          if (out) { state.month = D.startOfMonth(k); }
          DaySheet.open(k);
          draw();
        };
      }(key, outside));
      grid.appendChild(cell);
    }

    /* ---- 本月小结 ---- */
    var insight = U.h('div.insight');
    insight.appendChild(U.h('div.insight-caption', { text: '本月 · ' + (monthTotal ? (monthTotal + ' 次 / ' + Object.keys(monthDays).length + ' 天 / ' + monthStat.charCount + ' 个角色') : '还没有记录') }));

    if (monthStat.chars.length) {
      var top = monthStat.chars.slice(0, 5);
      var maxC = top[0].count;
      var rows = U.h('div.insight-rows');
      top.forEach(function (ch) {
        rows.appendChild(U.barRow({
          label: ch.name, value: ch.count, max: maxC, share: ch.share, color: ch.color,
          leading: U.avatar(ch.name, ch.color, 20),
          sub: ch.days + ' 天 / 日均 ' + U.num(ch.count / ch.days, 2) + ' 次',
          onClick: function () { g.App.switchTab('stats'); g.StatsView.focusCharacter(ch.id); }
        }));
      });
      insight.appendChild(U.h('div.insight-block', null, [U.h('div.insight-title', null, [U.icon('plane', 14), '角色 TOP']), rows]));
    }
    if (monthStat.cats.length && monthTotal) {
      var catBox = U.h('div.insight-rows');
      monthStat.cats.forEach(function (cat) {
        if (!cat.count) return;
        var topTag = cat.tagList.filter(function (t) { return t.count > 0; }).slice(0, 3)
          .map(function (t) { return t.name + ' ' + t.count; }).join(' · ');
        catBox.appendChild(U.barRow({
          label: cat.name, value: cat.count, max: monthTotal, color: cat.color, share: cat.share,
          sub: topTag || '暂无标签使用'
        }));
      });
      insight.appendChild(U.h('div.insight-block', null, [U.h('div.insight-title', null, [U.icon('tag', 14), '分类分布']), catBox]));
    }

    U.append(container, [head, U.h('div.cal-actions', null, [todayBtn]), week, grid, insight]);
  }

  /* ---------------------------------------------------- 当日记录面板 --- */

  var DaySheet = {};

  DaySheet.open = function (dateKey) {
    var box = U.h('div');
    var unsub = null;

    var sheet = U.openSheet({
      title: D.dayLabel(dateKey),
      body: box,
      onClose: function () { if (unsub) unsub(); }
    });
    if (!sheet) return null;

    var addBtn = U.h('button.btn.btn-primary.btn-block', { type: 'button', text: '＋ 添加起飞记录' });
    addBtn.addEventListener('click', function () { Editor.open({ date: dateKey }); });

    var repeatBtn = U.h('button.btn.btn-ghost.btn-block', { type: 'button', text: '复制最近一次（快速补录）' });
    repeatBtn.addEventListener('click', function () {
      var recs = Store.get().records;
      if (!recs.length) { U.toast('还没有任何历史记录'); return; }
      var last = recs[recs.length - 1];
      Editor.open({
        date: dateKey,
        presetCharIds: last.characterId ? [last.characterId] : [],
        presetTagIds: last.tagIds.slice(),
        presetCount: last.count,
        presetNote: last.note,
        time: D.nowTime(),
        subtitle: '已带入最近一次的角色与标签，确认后保存'
      });
    });

    var foot = U.h('div.day-foot', null, [
      U.h('div.day-foot-row', null, [addBtn]),
      U.h('div.day-foot-row', null, [repeatBtn])
    ]);
    sheet.setFooter(foot);

    function draw() {
      var recs = Store.recordsOn(dateKey);
      var total = sumCount(recs);
      var charSet = {};
      recs.forEach(function (r) { if (r.characterId) charSet[r.characterId] = 1; });
      var charN = Object.keys(charSet).length;
      var tagSet = {};
      recs.forEach(function (r) { r.tagIds.forEach(function (t) { tagSet[t] = 1; }); });
      sheet.setSubtitle(total
        ? ('共 ' + total + ' 次 · ' + recs.length + ' 条记录 · ' + charN + ' 个角色 · ' + Object.keys(tagSet).length + ' 个标签')
        : '这一天还没有记录');

      U.clear(box);

      if (!recs.length) {
        box.appendChild(U.emptyState({
          icon: 'plane',
          title: '这一天还是空白',
          text: '点下面的「添加起飞记录」，选角色、挑标签，10 秒记完。',
          actionText: '＋ 添加起飞记录',
          onAction: function () { Editor.open({ date: dateKey }); }
        }));
        return;
      }

      // 汇总：角色 / 分类标签
      var sumBox = U.h('div.day-summary');
      var usage = Store.usage();
      var byChar = {};
      recs.forEach(function (r) {
        var k = r.characterId || '__none';
        byChar[k] = byChar[k] || { count: 0, recs: [] };
        byChar[k].count += r.count || 1;
        byChar[k].recs.push(r);
      });
      var charChips = U.h('div.chips');
      Object.keys(byChar).sort(function (a, b) { return byChar[b].count - byChar[a].count; }).forEach(function (k) {
        var ch = k === '__none' ? null : Store.findCharacter(k);
        charChips.appendChild(U.h('span.chip.chip-char.on', { style: { '--c': ch ? ch.color : 'var(--muted)' } }, [
          U.h('span.chip-dot'),
          U.h('span.chip-text', { text: ch ? ch.name : '未指定角色' }),
          U.h('span.chip-num', { text: String(byChar[k].count) })
        ]));
      });
      sumBox.appendChild(U.h('div.day-summary-row', null, [U.h('span.day-summary-label', { text: '今日角色' }), charChips]));

      var catChips = U.h('div.chips');
      Store.get().categories.forEach(function (cat) {
        var n = 0;
        cat.tags.forEach(function (t) {
          recs.forEach(function (r) { if (r.tagIds.indexOf(t.id) >= 0) n += r.count || 1; });
        });
        if (!n) return;
        catChips.appendChild(U.tagPill(cat.name + ' ' + n, cat.color, { title: '含该分类标签的次数' }));
      });
      if (catChips.childNodes.length) {
        sumBox.appendChild(U.h('div.day-summary-row', null, [U.h('span.day-summary-label', { text: '分类次数' }), catChips]));
      }
      box.appendChild(sumBox);

      // 记录列表（按批次分组）
      var list = U.h('div.rec-list');
      groupOf(recs).forEach(function (grp) {
        list.appendChild(recCard(grp, dateKey, draw));
      });
      box.appendChild(U.h('div.section-title', { text: '记录明细' }));
      box.appendChild(list);
    }

    unsub = Store.subscribe(draw);
    draw();
    return sheet;
  };

  function recCard(grp, dateKey, redraw) {
    var recs = grp.records;
    var first = recs[0];
    var total = sumCount(recs);

    var editBtn = U.iconBtn('edit', '编辑', function () { Editor.open({ date: dateKey, records: recs }); });
    var delBtn = U.iconBtn('trash', '删除', function () {
      U.confirm({
        title: '删除记录',
        message: recs.length > 1 ? ('将删除本批 ' + recs.length + ' 条记录（' + total + ' 次），确定吗？') : '确定删除这条记录吗？',
        confirmText: '删除', danger: true
      }).then(function (ok) {
        if (!ok) return;
        Store.removeRecords(recs.map(function (r) { return r.id; }));
        U.toast('已删除');
      });
    }, 'danger');

    var top = U.h('div.rec-top', null, [
      U.h('span.rec-time', { text: first.time || '未记录时间' }),
      U.h('span.rec-count', { text: '×' + total }),
      U.h('div.spacer'),
      editBtn, delBtn
    ]);

    var charBox = U.h('div.rec-chars');
    recs.forEach(function (r) {
      var ch = r.characterId ? Store.findCharacter(r.characterId) : null;
      charBox.appendChild(U.h('span.rec-char', null, [
        U.avatar(ch ? ch.name : '?', ch ? ch.color : 'var(--muted)', 22),
        U.h('span.rec-char-name', { text: ch ? ch.name : '未指定角色' }),
        (r.count || 1) > 1 ? U.h('span.rec-char-count', { text: '×' + r.count }) : null
      ]));
    });

    // 标签：按分类分组展示
    var tagBox = U.h('div.rec-tags');
    var tagIds = first.tagIds;
    var shown = 0;
    Store.get().categories.forEach(function (cat) {
      var hit = cat.tags.filter(function (t) { return tagIds.indexOf(t.id) >= 0; });
      if (!hit.length) return;
      shown += hit.length;
      tagBox.appendChild(U.h('span.tag-pill.cat' + '', {
        text: cat.name, style: { '--c': cat.color }, title: '分类'
      }));
      hit.forEach(function (t) { tagBox.appendChild(U.tagPill(t.name, t.color)); });
    });
    if (!shown) tagBox.appendChild(U.h('span.rec-notag', { text: '本次没有选标签' }));

    var note = first.note ? U.h('div.rec-note', { text: first.note }) : null;
    var hint = recs.length > 1 ? U.h('div.rec-hint', { text: '本批 ' + recs.length + ' 个角色，同一时间/标签，点编辑可整批修改' }) : null;

    return U.h('div.rec-card', null, [top, charBox, tagBox, note, hint]);
  }

  g.CalendarView = Calendar;
  g.DaySheet = DaySheet;
  g.recordColorOf = recordColor;
})(typeof window !== 'undefined' ? window : globalThis);
