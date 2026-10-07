/* ============================================================================
 * 机长日志 · 提醒核心逻辑（纯函数，页面与 Service Worker 共用）
 *
 * 为什么单独一个文件：Service Worker 里没有 localStorage，也没法直接引页面脚本，
 * 所以把"要不要提醒"的判断抽成纯函数，页面用 <script> 加载、SW 用 importScripts 加载，
 * 保证两边口径完全一致，并且可以被 node 自测覆盖。
 * ==========================================================================*/
(function (g) {
  'use strict';

  var Core = {};
  var WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
  Core.WEEK_CN = WEEK_CN;

  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  Core.defaults = function () {
    return {
      enabled: false,
      time: '23:00',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      onlyIfNoRecord: true,     // 今天已经起飞过就不再打扰
      snoozeMinutes: 30,
      lastNotifiedDate: '',     // 已经提醒过的日期，避免同一天反复弹
      lastNotifiedAt: 0,
      snoozeUntil: 0,           // 「稍后提醒」到点的时间戳
      lastSnoozeMinutes: 30,
      skipDate: ''              // 「今天不提醒」的日期
    };
  };

  Core.normalize = function (raw) {
    var d = Core.defaults();
    if (!raw || typeof raw !== 'object') return d;
    if (typeof raw.enabled === 'boolean') d.enabled = raw.enabled;
    if (typeof raw.time === 'string' && TIME_RE.test(raw.time)) d.time = raw.time;
    if (Array.isArray(raw.weekdays)) {
      var seen = {};
      var list = [];
      raw.weekdays.forEach(function (x) {
        var n = Number(x);
        if (n >= 0 && n <= 6 && !seen[n]) { seen[n] = 1; list.push(n); }
      });
      d.weekdays = list.sort(function (a, b) { return a - b; });
    }
    if (typeof raw.onlyIfNoRecord === 'boolean') d.onlyIfNoRecord = raw.onlyIfNoRecord;
    if (raw.snoozeMinutes) d.snoozeMinutes = clampNum(raw.snoozeMinutes, 5, 240, 30);
    if (raw.lastSnoozeMinutes) d.lastSnoozeMinutes = clampNum(raw.lastSnoozeMinutes, 5, 240, 30);
    if (typeof raw.lastNotifiedDate === 'string' && DATE_RE.test(raw.lastNotifiedDate)) d.lastNotifiedDate = raw.lastNotifiedDate;
    if (typeof raw.skipDate === 'string' && DATE_RE.test(raw.skipDate)) d.skipDate = raw.skipDate;
    d.lastNotifiedAt = Number(raw.lastNotifiedAt) || 0;
    d.snoozeUntil = Number(raw.snoozeUntil) || 0;
    return d;
  };

  function clampNum(v, lo, hi, dft) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return dft;
    return Math.min(hi, Math.max(lo, n));
  }

  /** '23:00' -> 1380（分钟） */
  Core.parseTime = function (t, fallback) {
    if (typeof t === 'string' && TIME_RE.test(t)) {
      return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    }
    return fallback === undefined ? 23 * 60 : fallback;
  };

  /** Date -> 'YYYY-MM-DD'（本地时区，和页面口径一致） */
  Core.keyOf = function (date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  };
  Core.nowMinutes = function (date) { return date.getHours() * 60 + date.getMinutes(); };
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** 今天是不是提醒日 */
  Core.isReminderDay = function (cfg, date) {
    return !!cfg && cfg.weekdays && cfg.weekdays.indexOf(date.getDay()) >= 0;
  };

  /** 记录里今天是否已经有起飞 */
  Core.hasRecordOn = function (records, dateKey) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r && r.date === dateKey && (r.count || 1) > 0) return true;
    }
    return false;
  };

  /**
   * 是否应该「弹通知」
   * cfg:    提醒配置
   * runtime:{ hasRecord, lastNotifiedDate, skipDate, snoozeUntil }
   * now:    Date
   * 返回 { notify, reason }
   *   reason: disabled / not-reminder-day / skipped / already-recorded / snoozed
   *           / not-yet / already-notified / snooze / scheduled
   */
  Core.shouldNotify = function (cfg, runtime, now) {
    if (!cfg || !cfg.enabled) return { notify: false, reason: 'disabled' };
    if (!Core.isReminderDay(cfg, now)) return { notify: false, reason: 'not-reminder-day' };
    var today = Core.keyOf(now);
    if (runtime.skipDate === today) return { notify: false, reason: 'skipped' };
    if (runtime.hasRecord && cfg.onlyIfNoRecord !== false) return { notify: false, reason: 'already-recorded' };

    var snoozeUntil = Number(runtime.snoozeUntil) || 0;
    if (snoozeUntil) {
      if (now.getTime() >= snoozeUntil) return { notify: true, reason: 'snooze' };
      return { notify: false, reason: 'snoozed' };
    }
    if (runtime.lastNotifiedDate === today) return { notify: false, reason: 'already-notified' };
    if (Core.nowMinutes(now) < Core.parseTime(cfg.time)) return { notify: false, reason: 'not-yet' };
    return { notify: true, reason: 'scheduled' };
  };

  /** 是否显示应用内提醒条（到点了、今天没记录、没被「今天不提醒」跳过） */
  Core.bannerDue = function (cfg, runtime, now) {
    if (!cfg || !cfg.enabled) return false;
    if (!Core.isReminderDay(cfg, now)) return false;
    var today = Core.keyOf(now);
    if (runtime.skipDate === today) return false;
    if (runtime.hasRecord && cfg.onlyIfNoRecord !== false) return false;
    if (Core.nowMinutes(now) < Core.parseTime(cfg.time)) return false;
    var snoozeUntil = Number(runtime.snoozeUntil) || 0;
    if (snoozeUntil && now.getTime() < snoozeUntil) return false;
    return true;
  };

  /** 距离下一次提醒时刻还有多少毫秒（用于精确 setTimeout） */
  Core.msUntilNextTarget = function (cfg, now) {
    if (!cfg || !cfg.enabled) return -1;
    var target = Core.parseTime(cfg.time);
    var cur = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, target, 0, 0);
    if (cur.getTime() <= now.getTime()) cur = new Date(cur.getTime() + 86400000);
    // 往前找最近的一个提醒日（最多找 7 天）
    for (var i = 0; i < 8; i++) {
      if (Core.isReminderDay(cfg, cur)) return cur.getTime() - now.getTime();
      cur = new Date(cur.getTime() + 86400000);
    }
    return -1;
  };

  /** 提醒设置的人话描述：'工作日 23:00' */
  Core.describe = function (cfg) {
    if (!cfg) return '';
    var parts = [];
    var w = cfg.weekdays || [];
    if (w.length === 7) parts.push('每天');
    else if (w.length === 0) parts.push('未选择任何天');
    else if (w.length === 5 && [1, 2, 3, 4, 5].every(function (d) { return w.indexOf(d) >= 0; })) parts.push('工作日');
    else if (w.length === 2 && w.indexOf(0) >= 0 && w.indexOf(6) >= 0) parts.push('周末');
    else parts.push(w.map(function (d) { return '周' + WEEK_CN[d]; }).join('、'));
    parts.push(cfg.time);
    return parts.join(' ');
  };

  /** 提醒正文 */
  Core.message = function (cfg, dateKey) {
    var d = dateKey ? dateKey : '';
    var label = d ? (Number(d.slice(5, 7)) + '月' + Number(d.slice(8, 10)) + '日') : '今天';
    return {
      title: label + '还没有起飞记录',
      body: '该起飞了 ✈️ 点一下记一笔（提醒时间 ' + (cfg ? cfg.time : '') + '）'
    };
  };

  g.ReminderCore = Core;
})(typeof self !== 'undefined' ? self : this);
