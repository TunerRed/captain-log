/* ============================================================================
 * 机长日志 · 统计层（纯函数，不触碰 DOM，便于自测）
 * 口径说明：
 *   - 「次数」= record.count 之和（一条记录默认 1 次，可以记为多次）
 *   - 「天数」= 去重后的日期数；日均分两种：按自然日 / 按有记录的天
 *   - 时段分布只统计填了时间的记录，未填时间的条数会单独给出
 * ==========================================================================*/
(function (g) {
  'use strict';

  var U = g.U;
  var Stats = {};

  /* ------------------------------------------------------------ 时间区间 --- */
  Stats.PRESETS = [
    { id: 'week', name: '本周' },
    { id: 'month', name: '本月' },
    { id: 'quarter', name: '本季度' },
    { id: 'year', name: '本年度' },
    { id: 'last30', name: '近30天' },
    { id: 'last90', name: '近90天' },
    { id: 'all', name: '全部' },
    { id: 'custom', name: '自定义' }
  ];

  Stats.presetName = function (id) {
    for (var i = 0; i < Stats.PRESETS.length; i++) if (Stats.PRESETS[i].id === id) return Stats.PRESETS[i].name;
    return id;
  };

  /**
   * 计算预设区间（含首尾）
   * ctx: { today, weekStart, records }
   */
  Stats.rangeFor = function (preset, ctx) {
    ctx = ctx || {};
    var today = ctx.today || U.D.todayKey();
    var ws = ctx.weekStart === 0 ? 0 : 1;
    var d = U.D.date(today);
    switch (preset) {
      case 'today': return { start: today, end: today };
      case 'week': return { start: U.D.startOfWeek(today, ws), end: U.D.addDays(U.D.startOfWeek(today, ws), 6) };
      case 'month': return { start: U.D.key(new Date(d.getFullYear(), d.getMonth(), 1)), end: U.D.key(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
      case 'quarter': {
        var qm = Math.floor(d.getMonth() / 3) * 3;
        return { start: U.D.key(new Date(d.getFullYear(), qm, 1)), end: U.D.key(new Date(d.getFullYear(), qm + 3, 0)) };
      }
      case 'year': return { start: d.getFullYear() + '-01-01', end: d.getFullYear() + '-12-31' };
      case 'last30': return { start: U.D.addDays(today, -29), end: today };
      case 'last90': return { start: U.D.addDays(today, -89), end: today };
      case 'all': {
        var recs = ctx.records || [];
        if (!recs.length) return { start: U.D.startOfMonth(today), end: today };
        var min = recs[0].date, max = recs[0].date;
        recs.forEach(function (r) { if (r.date < min) min = r.date; if (r.date > max) max = r.date; });
        if (max < today) max = today;
        return { start: min, end: max };
      }
      default: return { start: U.D.startOfMonth(today), end: today };
    }
  };

  Stats.TIME_BUCKETS = [
    { name: '凌晨', from: 0, to: 5 },
    { name: '上午', from: 6, to: 11 },
    { name: '下午', from: 12, to: 17 },
    { name: '晚上', from: 18, to: 23 }
  ];

  /* ---------------------------------------------------------------- 计算 --- */
  /**
   * compute(records, opts)
   * opts: { start, end, characters, categories }
   * 注意：records 建议传入已按区间过滤的列表；内部仍会再过滤一次确保正确。
   */
  Stats.compute = function (records, opts) {
    opts = opts || {};
    var start = opts.start, end = opts.end;
    var chars = opts.characters || [];
    var cats = opts.categories || [];

    var res = {
      start: start, end: end,
      totalDays: start && end ? U.D.diffDays(start, end) + 1 : 0,
      total: 0, recCount: 0, activeDays: 0,
      maxDay: null, avgAll: 0, avgActive: 0,
      streak: { longest: 0, current: 0, longestStart: null, longestEnd: null },
      byDate: {}, hours: zeros(24), weekdays: zeros(7), noTimeCount: 0,
      buckets: Stats.TIME_BUCKETS.map(function (b) { return { name: b.name, count: 0, share: 0 }; }),
      chars: [], cats: [], tagRank: [], months: [], matrix: {}, tagIndex: {}
    };

    var charIndex = {};
    chars.forEach(function (c) {
      charIndex[c.id] = {
        id: c.id, name: c.name, color: c.color, count: 0, recCount: 0, days: 0,
        first: null, last: null, tags: {}, hours: zeros(24), weekdays: zeros(7),
        bucket: zeros(4), share: 0
      };
    });
    var catIndex = {};
    cats.forEach(function (c) {
      catIndex[c.id] = { id: c.id, name: c.name, color: c.color, count: 0, recCount: 0, share: 0, tags: {} };
      c.tags.forEach(function (t) {
        catIndex[c.id].tags[t.id] = { id: t.id, name: t.name, color: t.color, count: 0, recCount: 0, share: 0 };
        res.tagIndex[t.id] = { id: t.id, name: t.name, color: t.color, categoryId: c.id, categoryName: c.name, count: 0, recCount: 0, share: 0 };
      });
    });

    var daySeen = {};
    var charDaySeen = {};
    var inRange = [];

    records.forEach(function (r) {
      if (start && r.date < start) return;
      if (end && r.date > end) return;
      inRange.push(r);

      var n = r.count || 1;
      res.total += n;
      res.recCount += 1;
      res.byDate[r.date] = (res.byDate[r.date] || 0) + n;
      if (!daySeen[r.date]) { daySeen[r.date] = 1; res.activeDays += 1; }

      var c = r.characterId ? charIndex[r.characterId] : null;
      if (c) {
        c.count += n; c.recCount += 1;
        var cd = r.characterId + '|' + r.date;
        if (!charDaySeen[cd]) { charDaySeen[cd] = 1; c.days += 1; }
        if (!c.first || r.date < c.first) c.first = r.date;
        if (!c.last || r.date > c.last) c.last = r.date;
      }

      var hour = U.D.hourOf(r.time);
      if (hour >= 0) {
        res.hours[hour] += n;
        var bIdx = bucketIndex(hour);
        res.buckets[bIdx].count += n;
        if (c) { c.hours[hour] += n; c.bucket[bIdx] += n; }
      } else {
        res.noTimeCount += 1;
      }
      var wd = U.D.dow(r.date);
      res.weekdays[wd] += n;
      if (c) c.weekdays[wd] += n;

      if (c) {
        res.matrix[c.id] = res.matrix[c.id] || {};
      }
      var hitCats = {};
      r.tagIds.forEach(function (tid) {
        var info = res.tagIndex[tid];
        if (info) {
          info.count += n; info.recCount += 1;
          var cc = catIndex[info.categoryId];
          if (cc) {
            cc.tags[tid].count += n; cc.tags[tid].recCount += 1;
            if (!hitCats[info.categoryId]) { hitCats[info.categoryId] = 1; cc.count += n; cc.recCount += 1; }
          }
          if (c) c.tags[tid] = (c.tags[tid] || 0) + n;
        }
      });
      if (c) {
        Object.keys(hitCats).forEach(function (cid) {
          res.matrix[c.id][cid] = (res.matrix[c.id][cid] || 0) + n;
        });
      }
    });

    // ---- 日均 ----
    res.avgAll = res.totalDays > 0 ? res.total / res.totalDays : 0;
    res.avgActive = res.activeDays > 0 ? res.total / res.activeDays : 0;

    // ---- 单日最高 ----
    Object.keys(res.byDate).forEach(function (k) {
      var v = res.byDate[k];
      if (!res.maxDay || v > res.maxDay.count) res.maxDay = { date: k, count: v };
    });

    // ---- 连续天数 ----
    if (start && end) {
      var cur = 0, curStart = null, best = 0, bestStart = null, bestEnd = null;
      var days = U.D.each(start, end);
      for (var i = 0; i < days.length; i++) {
        if (res.byDate[days[i]]) {
          if (cur === 0) curStart = days[i];
          cur++;
          if (cur > best) { best = cur; bestStart = curStart; bestEnd = days[i]; }
        } else { cur = 0; curStart = null; }
      }
      res.streak.longest = best;
      res.streak.longestStart = bestStart;
      res.streak.longestEnd = bestEnd;

      var today = U.D.todayKey();
      var anchor = end < today ? end : today;
      if (anchor >= start && anchor <= end) {
        var back = 0, k2 = anchor;
        while (k2 >= start && res.byDate[k2]) { back++; k2 = U.D.addDays(k2, -1); }
        res.streak.current = back;
      }
    }

    // ---- 角色排行 ----
    res.chars = Object.keys(charIndex).map(function (k) { return charIndex[k]; })
      .filter(function (c) { return c.count > 0; })
      .map(function (c) { c.share = U.pct(c.count, res.total); return c; })
      .sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); });

    // ---- 分类 / 标签排行 ----
    // 注意：cats[i].tags 是「tagId -> 该标签统计」的映射（map），不是数组！
    //       要遍历/取数量请用 cats[i].tagList（数组）或 tagCount / tagUsed。
    res.cats = cats.map(function (c) {
      var cc = catIndex[c.id];
      cc.share = U.pct(cc.count, res.total);
      cc.tagCount = c.tags.length;                       // 该分类下标签总数（含从未使用过的）
      cc.tagList = c.tags.map(function (t) { return cc.tags[t.id]; })
        .map(function (t) { t.share = U.pct(t.count, res.total); t.shareInCat = U.pct(t.count, cc.count); return t; })
        .sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); });
      cc.tagUsed = cc.tagList.filter(function (t) { return t.count > 0; }).length;   // 真正用到过的标签数
      return cc;
    }).sort(function (a, b) { return b.count - a.count; });

    res.tagRank = Object.keys(res.tagIndex).map(function (k) { return res.tagIndex[k]; })
      .filter(function (t) { return t.count > 0; })
      .map(function (t) { t.share = U.pct(t.count, res.total); return t; })
      .sort(function (a, b) { return b.count - a.count; });

    // ---- 时段桶占比 ----
    var timed = res.hours.reduce(function (a, b) { return a + b; }, 0);
    res.buckets.forEach(function (b) { b.share = U.pct(b.count, timed); });

    // ---- 月度趋势 ----
    var monthMap = {};
    Object.keys(res.byDate).forEach(function (k) {
      var mk = U.D.monthKey(k);
      if (!monthMap[mk]) monthMap[mk] = { key: mk, count: 0, days: 0 };
      monthMap[mk].count += res.byDate[k];
      monthMap[mk].days += 1;
    });
    res.months = Object.keys(monthMap).sort().map(function (k) {
      var d = U.D.date(k + '-01');
      return { key: k, label: (d.getFullYear() % 100) + '/' + (d.getMonth() + 1), count: monthMap[k].count, days: monthMap[k].days };
    });

    res.timedTotal = timed;
    res.charCount = res.chars.length;
    res.inRange = inRange;
    return res;
  };

  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  function bucketIndex(hour) {
    if (hour <= 5) return 0;
    if (hour <= 11) return 1;
    if (hour <= 17) return 2;
    return 3;
  }

  /* -------------------------------------------------- 排行榜（按角色/分类） --- */
  /**
   * 排行榜数据：dimension = 'character' | 'tag' | 'category'
   * 返回 [{id, name, color, count, share, sub}]，sub 为该维度下的次级分布描述
   */
  Stats.ranking = function (result, dimension, limit) {
    var list;
    if (dimension === 'tag') list = result.tagRank;
    else if (dimension === 'category') list = result.cats;
    else list = result.chars;
    return limit ? list.slice(0, limit) : list;
  };

  /**
   * 指定某个角色/标签/分类后，在同一区间内的细分统计。
   * selector: { type:'character'|'tag'|'category', id }
   */
  Stats.breakdown = function (records, range, selector, ctx) {
    var subset = records.filter(function (r) {
      if (r.date < range.start || r.date > range.end) return false;
      if (selector.type === 'character') return r.characterId === selector.id;
      if (selector.type === 'tag') return r.tagIds.indexOf(selector.id) >= 0;
      if (selector.type === 'category') {
        var cat = null;
        for (var i = 0; i < ctx.categories.length; i++) if (ctx.categories[i].id === selector.id) { cat = ctx.categories[i]; break; }
        if (!cat) return false;
        for (var j = 0; j < cat.tags.length; j++) if (r.tagIds.indexOf(cat.tags[j].id) >= 0) return true;
        return false;
      }
      return true;
    });
    return Stats.compute(subset, {
      start: range.start, end: range.end,
      characters: ctx.characters, categories: ctx.categories
    });
  };

  /* ---------------------------------------------------------- 文本摘要 --- */
  Stats.summaryText = function (res, opts) {
    opts = opts || {};
    var L = [];
    L.push('【机长日志 · 起飞统计】');
    L.push('区间：' + U.D.rangeLabel(res.start, res.end) + '（' + res.totalDays + ' 天）');
    L.push('总次数：' + res.total + ' 次｜有记录：' + res.activeDays + ' 天｜平均：' + U.num(res.avgActive, 2) + ' 次/活跃日');
    if (res.maxDay) L.push('单日最高：' + U.D.shortLabel(res.maxDay.date) + ' ' + res.maxDay.count + ' 次');
    if (res.streak.longest > 1) L.push('最长连续：' + res.streak.longest + ' 天（至 ' + U.D.shortLabel(res.streak.longestEnd) + '）');

    if (res.chars.length) {
      L.push('');
      L.push('— 角色排行 —');
      res.chars.slice(0, 10).forEach(function (c, i) {
        L.push((i + 1) + '. ' + c.name + '：' + c.count + ' 次（' + c.share + '%，' + c.days + ' 天）');
      });
    }
    if (res.cats.length) {
      res.cats.forEach(function (c) {
        if (!c.count) return;
        L.push('');
        L.push('— ' + c.name + '（' + c.count + ' 次）—');
        c.tagList.slice(0, 6).forEach(function (t) {
          if (!t.count) return;
          L.push('  · ' + t.name + '：' + t.count + ' 次（' + t.share + '%）');
        });
      });
    }
    var timed = res.timedTotal;
    if (timed) {
      L.push('');
      L.push('— 时段分布 —');
      res.buckets.forEach(function (b) { if (b.count) L.push('  · ' + b.name + '：' + b.count + ' 次（' + b.share + '%）'); });
      var top = res.hours.map(function (v, h) { return { h: h, v: v }; }).sort(function (a, b) { return b.v - a.v; })[0];
      if (top && top.v) L.push('  · 最常时段：' + U.D.pad(top.h) + ':00 前后（' + top.v + ' 次）');
    }
    if (res.months.length > 1) {
      L.push('');
      L.push('— 月度趋势 —');
      L.push('  ' + res.months.map(function (m) { return m.label + ':' + m.count; }).join('  '));
    }
    return L.join('\n');
  };

  g.Stats = Stats;
})(typeof window !== 'undefined' ? window : globalThis);
