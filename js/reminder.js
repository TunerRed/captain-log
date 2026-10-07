/* ============================================================================
 * 机长日志 · 起飞提醒（页面侧引擎 + 应用内提醒条）
 *
 * 三条通道（按可用性自动降级）：
 *   1) Capacitor 本地通知：打成 APK 后由安卓系统闹钟触发，精确到点、可离线
 *      —— 需要安装 @capacitor/local-notifications（见 README 第七节）
 *   2) 系统通知 / Service Worker 通知：页面开着时能弹到状态栏；
 *      Chrome 安卓的 periodic background sync 可在关闭后「尽力」补一次
 *   3) 什么都没权限时：应用内提醒条 + 轻提示（功能不丢，只是不会弹到状态栏）
 *
 * 判断口径全部来自 reminder-core.js（页面与 SW 共用，可被 node 自测覆盖）
 * ==========================================================================*/
(function (g) {
  'use strict';

  var U = g.U, Store = g.Store, D = U.D, Core = g.ReminderCore;

  var SW_STATE_URL = 'captain-log-reminder-state.json';
  var PERIODIC_TAG = 'captain-log-reminder';
  var NATIVE_ID = 1001;

  var bar = null, barTitle = null, barSub = null, snoozeBtn = null;
  var tickTimer = null, preciseTimer = null;
  var lastChannel = '';

  var Reminder = {};

  /* ------------------------------------------------------------ 读取配置 --- */
  Reminder.cfg = function () {
    var s = Store.get().settings;
    if (!s.reminder) s.reminder = Core.normalize(null);
    return s.reminder;
  };

  function runtime() {
    var cfg = Reminder.cfg();
    var today = D.todayKey();
    return {
      hasRecord: Core.hasRecordOn(Store.get().records, today),
      lastNotifiedDate: cfg.lastNotifiedDate,
      skipDate: cfg.skipDate,
      snoozeUntil: cfg.snoozeUntil,
      today: today
    };
  }
  Reminder.runtime = runtime;

  /* -------------------------------------------------------------- 通知通道 --- */
  function nativeLocal() {
    var C = g.Capacitor;
    if (!C || !C.Plugins) return null;
    // 官方插件（如果装了 @capacitor/local-notifications）优先；
    // 否则用本项目 APK 内置的 CaptainReminder 插件（接口是前者的子集）
    return C.Plugins.LocalNotifications || C.Plugins.CaptainReminder || null;
  }
  function noop() { }

  function canWebNotify() {
    return ('Notification' in g) && g.Notification.permission === 'granted';
  }

  Reminder.permission = function () {
    if (nativeLocal()) return 'native';
    if (!('Notification' in g)) return 'unsupported';
    return g.Notification.permission;      // granted / denied / default
  };

  Reminder.permissionLabel = function () {
    var p = Reminder.permission();
    return {
      native: '已由 App 原生通知接管',
      granted: '已授权（能弹到状态栏）',
      denied: '已被拒绝，请在浏览器设置里放开',
      default: '未授权',
      unsupported: '当前浏览器不支持系统通知'
    }[p] || p;
  };

  Reminder.requestPermission = function () {
    var P = nativeLocal();
    if (P && P.requestPermissions) {
      return Promise.resolve(P.requestPermissions()).then(function (r) {
        var ok = r && (r.display === 'granted' || r.display === undefined);
        if (ok) applyNativeSchedule();
        return ok ? 'granted' : 'denied';
      }).catch(function () { return 'denied'; });
    }
    if (!('Notification' in g)) {
      U.toast('当前浏览器不支持系统通知，应用内提醒条仍然可用');
      return Promise.resolve('unsupported');
    }
    if (g.Notification.permission === 'granted') return Promise.resolve('granted');
    try {
      var r = g.Notification.requestPermission(function (p) { return p; });
      if (r && typeof r.then === 'function') {
        return r.then(function (p) {
          U.toast(p === 'granted' ? '已开启系统通知' : '没有开启系统通知，先用应用内提醒条', p === 'granted' ? '' : 'error');
          return p;
        });
      }
      return Promise.resolve(g.Notification.permission);
    } catch (e) {
      return Promise.resolve('denied');
    }
  };

  /** 真正把提醒推出去，返回实际使用的通道 */
  function dispatch(title, body) {
    var P = nativeLocal();
    if (P) {
      try {
        var at = Date.now() + 800;
        P.schedule({
          notifications: [{
            id: NATIVE_ID,
            title: title,
            body: body,
            channelId: 'captain-reminder',
            schedule: { at: new Date(at), atMs: at }
          }]
        }).catch(noop);
        return 'native';
      } catch (e) { /* 落到 Web 通道 */ }
    }
    if (canWebNotify()) {
      if (g.navigator.serviceWorker) {
        g.navigator.serviceWorker.ready.then(function (reg) {
          reg.showNotification(title, {
            body: body,
            icon: 'icons/icon-192.png',
            badge: 'icons/icon-192.png',
            tag: PERIODIC_TAG,
            renotify: true,
            data: { url: 'index.html#add' }
          });
        }).catch(function () { return legacyNotify(title, body); });
        return 'service-worker';
      }
      return legacyNotify(title, body);
    }
    U.toast('⏰ ' + title + ' · ' + body);
    return 'in-app';
  }

  function legacyNotify(title, body) {
    try {
      var n = new g.Notification(title, { body: body, icon: 'icons/icon-192.png', tag: PERIODIC_TAG });
      n.onclick = function () { try { g.focus(); } catch (e) { } Reminder.openAdd(); n.close(); };
      return 'web';
    } catch (e) {
      U.toast('⏰ ' + title + ' · ' + body);
      return 'in-app';
    }
  }

  Reminder.test = function () {
    var msg = Core.message(Reminder.cfg(), D.todayKey());
    var channel = dispatch('机长日志 · 测试提醒', msg.body);
    lastChannel = channel;
    U.toast('测试提醒已发送（通道：' + channel + '）');
    return channel;
  };

  /* --------------------------------------------------------------- 提醒动作 --- */
  function fire(reason) {
    var cfg = Reminder.cfg();
    var msg = Core.message(cfg, D.todayKey());
    Store.patchReminder({
      lastNotifiedDate: D.todayKey(),
      lastNotifiedAt: Date.now(),
      snoozeUntil: 0
    });
    var channel = dispatch(msg.title, msg.body);
    if (channel === 'in-app') U.toast('⏰ ' + msg.title + '，该起飞了');
    render();
    return { reason: reason, channel: channel };
  }
  Reminder.fire = fire;

  Reminder.snooze = function (minutes) {
    var cfg = Reminder.cfg();
    var m = Math.max(1, Number(minutes) || cfg.snoozeMinutes || 30);
    Store.patchReminder({
      snoozeUntil: Date.now() + m * 60000,
      lastSnoozeMinutes: m
    });
    U.toast(m + ' 分钟后再提醒你');
    render();
    return m;
  };

  Reminder.skipToday = function () {
    Store.patchReminder({ skipDate: D.todayKey(), snoozeUntil: 0 });
    U.toast('今天不再提醒');
    render();
  };

  Reminder.unsnooze = function () {
    Store.patchReminder({ snoozeUntil: 0 });
    render();
  };

  Reminder.openAdd = function () {
    g.Editor.open({ date: D.todayKey() });
  };

  /* --------------------------------------------------- 应用内提醒条渲染 --- */
  function render() {
    if (!bar) return;
    var cfg = Reminder.cfg();
    var now = new Date();
    var rt = runtime();
    var due = Core.bannerDue(cfg, rt, now);
    bar.classList.toggle('on', due);
    bar.setAttribute('aria-hidden', due ? 'false' : 'true');
    if (!due) return;

    var hhmm = cfg.time;
    barTitle.textContent = '今天还没起飞，该起飞了';
    barSub.textContent = '提醒时间 ' + hhmm + '（' + Core.describe(cfg) + '）';
    snoozeBtn.textContent = '稍后 ' + (cfg.lastSnoozeMinutes || cfg.snoozeMinutes || 30) + ' 分钟';
  }

  Reminder.render = render;

  function buildBar() {
    bar = U.$('#reminder-bar');
    if (!bar) return;
    U.clear(bar);

    var bell = U.h('span.rb-bell', { html: U.iconSvg('bell', 18) });
    barTitle = U.h('b.rb-title', { text: '' });
    barSub = U.h('span.rb-sub', { text: '' });

    var addBtn = U.h('button.btn.btn-primary.btn-sm', { type: 'button', text: '记一笔' });
    addBtn.addEventListener('click', function () { Reminder.openAdd(); });

    snoozeBtn = U.h('button.btn.btn-ghost.btn-sm', { type: 'button', text: '稍后' });
    snoozeBtn.addEventListener('click', function () { Reminder.snooze(Reminder.cfg().snoozeMinutes || 30); });

    var skipBtn = U.iconBtn('close', '今天不提醒', function () { Reminder.skipToday(); });

    U.append(bar, [
      U.h('div.rb-main', null, [bell, U.h('div.rb-text', null, [barTitle, barSub])]),
      U.h('div.rb-actions', null, [addBtn, snoozeBtn, skipBtn])
    ]);
  }

  /* ------------------------------------------------- 时间检查 / 精确定时 --- */
  function armPreciseTimer() {
    if (preciseTimer) { clearTimeout(preciseTimer); preciseTimer = null; }
    var cfg = Reminder.cfg();
    if (!cfg.enabled) return;
    var ms = Core.msUntilNextTarget(cfg, new Date());
    if (ms < 0) return;
    // 单次最长 12 小时，避免超长定时器不准
    preciseTimer = setTimeout(function () {
      preciseTimer = null;
      Reminder.tick();
      armPreciseTimer();
    }, Math.min(ms + 1000, 12 * 3600 * 1000));
  }

  Reminder.tick = function () {
    var cfg = Reminder.cfg();
    var rt = runtime();
    var now = new Date();
    var res = Core.shouldNotify(cfg, rt, now);
    if (res.notify) fire(res.reason);
    render();
    syncSWState();
    return res;
  };

  Reminder.refresh = function () {
    render();
    armPreciseTimer();
    syncSWState();
    applyNativeSchedule();
    registerPeriodicSync();
  };

  /* ------------------------------------------ 把状态同步给 Service Worker --- */
  function snapshot() {
    var cfg = Reminder.cfg();
    var rt = runtime();
    return {
      v: 1,
      date: rt.today,
      hasRecord: rt.hasRecord,
      enabled: !!cfg.enabled,
      time: cfg.time,
      weekdays: cfg.weekdays.slice(),
      onlyIfNoRecord: cfg.onlyIfNoRecord !== false,
      lastNotifiedDate: cfg.lastNotifiedDate,
      skipDate: cfg.skipDate,
      snoozeUntil: cfg.snoozeUntil || 0,
      updatedAt: Date.now()
    };
  }
  Reminder.snapshot = snapshot;

  function syncSWState() {
    if (!g.caches) return;
    try {
      g.caches.open('captain-log-reminder').then(function (c) {
        return c.put(SW_STATE_URL, new g.Response(JSON.stringify(snapshot()), {
          headers: { 'content-type': 'application/json' }
        }));
      }).catch(noop);
    } catch (e) { /* 忽略：SW 拿不到状态时会选择不打扰 */ }
  }

  /** Chrome 安卓：安装到桌面后可注册后台周期同步（由浏览器决定实际频率） */
  function registerPeriodicSync() {
    var cfg = Reminder.cfg();
    if (!g.navigator.serviceWorker || !g.navigator.serviceWorker.ready) return;
    g.navigator.serviceWorker.ready.then(function (reg) {
      if (!reg.periodicSync) return;
      try {
        if (cfg.enabled) {
          reg.periodicSync.register(PERIODIC_TAG, { minInterval: 60 * 60 * 1000 }).catch(noop);
        } else {
          reg.periodicSync.unregister(PERIODIC_TAG).catch(noop);
        }
      } catch (e) { /* 不支持就算了 */ }
    }).catch(noop);
  }

  /* ------------------------------------------------- 安卓原生本地通知 --- */
  /** 打包成 APK 后：优先用系统通知，且「今天已起飞」时改约到明天 */
  function applyNativeSchedule() {
    var P = nativeLocal();
    if (!P) return;
    var cfg = Reminder.cfg();
    try {
      P.cancel({ notifications: [{ id: NATIVE_ID }] }).catch(noop);
      if (!cfg.enabled) return;
      var mins = Core.parseTime(cfg.time);
      var now = new Date();
      var at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(mins / 60), mins % 60, 0, 0);
      var hasRecord = Core.hasRecordOn(Store.get().records, D.todayKey());
      if (at.getTime() <= now.getTime() || hasRecord || cfg.skipDate === D.todayKey()) {
        at = new Date(at.getTime() + 86400000);   // 已过点或今天已起飞 → 约到明天
      }
      P.schedule({
        notifications: [{
          id: NATIVE_ID,
          title: '机长日志 · 该起飞了',
          body: '今天还没有起飞记录，点一下记一笔',
          channelId: 'captain-reminder',
          schedule: { at: at, atMs: at.getTime(), allowWhileIdle: true }
        }]
      }).catch(noop);
    } catch (e) { /* 原生调用失败不影响网页功能 */ }
  }

  /* ------------------------------------------------------------- 初始化 --- */
  Reminder.init = function () {
    buildBar();
    render();
    armPreciseTimer();
    syncSWState();
    registerPeriodicSync();
    applyNativeSchedule();     // APK 里重新排一次系统闹钟

    // 点系统通知进来时，直接弹出「记一笔」（原生插件会带回这个标记）
    var cap = g.Capacitor && g.Capacitor.Plugins && g.Capacitor.Plugins.CaptainReminder;
    if (cap && typeof cap.consumeOpenAdd === 'function') {
      var consume = function () {
        cap.consumeOpenAdd().then(function (r) {
          if (r && r.openAdd) Reminder.openAdd();
        }).catch(noop);
      };
      consume();
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') consume();
      });
    }
    g.addEventListener('captainOpenAdd', function () { Reminder.openAdd(); });

    // 兜底轮询：后台标签页定时器可能被节流，所以 20 秒一轮 + 回到前台立刻补查
    tickTimer = setInterval(function () { Reminder.tick(); }, 20000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { Reminder.tick(); armPreciseTimer(); }
    });
    g.addEventListener('focus', function () { Reminder.tick(); });
    g.addEventListener('pageshow', function () { Reminder.tick(); armPreciseTimer(); });
    g.addEventListener('online', function () { syncSWState(); });

    // 点通知回到应用时，直接弹出「记一笔」
    if (g.navigator.serviceWorker) {
      g.navigator.serviceWorker.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'open-add') Reminder.openAdd();
        if (e.data && e.data.type === 'reminder-fired') render();
      });
    }
  };

  Reminder.channel = function () { return lastChannel; };

  g.Reminder = Reminder;
})(typeof window !== 'undefined' ? window : globalThis);
