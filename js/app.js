/* ============================================================================
 * 机长日志 · 应用外壳（标签页、主题、首次引导、PWA 安装、返回键处理）
 * ==========================================================================*/
(function (g) {
  'use strict';

  var U = g.U, Store = g.Store, D = U.D;

  var TABS = [
    { id: 'calendar', name: '日历', icon: 'calendar' },
    { id: 'stats', name: '统计', icon: 'chart' },
    { id: 'settings', name: '设置', icon: 'settings' }
  ];

  var viewEl, navEl, fabEl, todayChip;
  var deferredInstall = null;
  var current = 'calendar';

  var App = {};

  /* -------------------------------------------------------- 主题 ----- */
  function applyTheme() {
    var t = Store.get().settings.theme;
    var dark = t === 'dark' || (t === 'system' && g.matchMedia && g.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = U.$('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f1117' : '#f4f5fb');
  }

  /* --------------------------------------------------- 返回键/历史 --- */
  /* 打开弹层时压入一条历史记录，安卓返回键关闭弹层而不是退出应用。
   * pendingBack：由我们主动调用 history.back() 的次数（界面已经先关好了，
   *   对应的 popstate 只需吞掉，不能再关一次）。
   * syncing：popstate 正在替我们关闭弹层，此时 close() 不能再触发 back()。 */
  var guard = { pushed: 0, pendingBack: 0, syncing: false };
  function installHistoryGuard() {
    var origOpen = U.openSheet;
    U.openSheet = function (opts) {
      var ctl = origOpen(opts);
      if (!ctl) return ctl;
      var ok = false;
      try { g.history.pushState({ cl: true }, ''); ok = true; } catch (e) { ok = false; }
      if (ok) guard.pushed++;

      var origClose = ctl.close;
      var closed = false;
      ctl.close = function () {
        if (closed) return;
        closed = true;
        origClose();                     // 界面先关，避免"正在关闭"的弹层压在栈顶
        if (!guard.syncing && ok && guard.pushed > 0) {
          guard.pushed--;
          guard.pendingBack++;
          try { g.history.back(); } catch (e) { guard.pendingBack--; }
        }
      };
      return ctl;
    };
    g.addEventListener('popstate', function () {
      if (guard.pendingBack > 0) { guard.pendingBack--; return; }  // 自己发起的返回
      if (U.sheetCount() > 0 && guard.pushed > 0) {
        guard.pushed--;
        guard.syncing = true;
        U.closeTopSheet();
        guard.syncing = false;
      }
    });
  }

  /* ------------------------------------------------------- 标签页 --- */
  function buildShell() {
    viewEl = U.$('#view');
    navEl = U.$('#tabbar');
    fabEl = U.$('#fab');
    todayChip = U.$('#today-chip');

    U.clear(navEl);
    TABS.forEach(function (t) {
      var btn = U.h('button.tab', { type: 'button', dataset: { tab: t.id } }, [
        U.icon(t.icon, 22),
        U.h('span', { text: t.name })
      ]);
      btn.addEventListener('click', function () { App.switchTab(t.id); });
      navEl.appendChild(btn);
    });

    fabEl.appendChild(U.icon('plus', 20));
    fabEl.appendChild(U.h('span', { text: '记一笔' }));
    fabEl.addEventListener('click', function () { g.Editor.open({ date: D.todayKey() }); });

    todayChip.addEventListener('click', function () { g.DaySheet.open(D.todayKey()); });
    App.updateTodayChip();
  }

  App.updateTodayChip = function () {
    if (!todayChip) return;
    var recs = Store.recordsOn(D.todayKey());
    var total = U.sum(recs, function (r) { return r.count || 1; });
    U.clear(todayChip);
    todayChip.appendChild(U.icon('plane', 14));
    todayChip.appendChild(U.h('span', { text: total ? '今天 ' + total + ' 次' : '今天还没记' }));
    todayChip.classList.toggle('on', total > 0);
  };

  App.switchTab = function (id) {
    current = id;
    U.$$('#tabbar .tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === id); });
    document.body.setAttribute('data-tab', id);
    fabEl.style.display = id === 'calendar' ? '' : 'none';
    var view = {
      calendar: g.CalendarView,
      stats: g.StatsView,
      settings: g.SettingsView
    }[id];
    if (view) view.mount(viewEl);
    viewEl.scrollTop = 0;
    g.scrollTo(0, 0);
  };

  App.refresh = function () {
    App.updateTodayChip();
    var view = { calendar: g.CalendarView, stats: g.StatsView, settings: g.SettingsView }[current];
    if (view && view.refresh) view.refresh();
  };

  /* ------------------------------------------------------ PWA 安装 --- */
  App.promptInstall = function () {
    if (!deferredInstall) {
      U.toast('当前环境不支持自动安装，用浏览器菜单「添加到主屏幕」即可');
      return;
    }
    deferredInstall.prompt();
    deferredInstall.userChoice.then(function (r) {
      if (r && r.outcome === 'accepted') U.toast('已添加到桌面');
      deferredInstall = null;
    });
  };

  function registerSW() {
    // APK / 原生容器里资源是内置的：再挂一层 Service Worker 缓存，
    // 升级后容易命中旧缓存看到旧界面，所以原生环境不注册。
    if (g.Capacitor && typeof g.Capacitor.isNativePlatform === 'function' && g.Capacitor.isNativePlatform()) return;
    if (!('serviceWorker' in g.navigator)) return;
    if (!/^https?:$/.test(g.location.protocol)) return;   // file:// 下不注册
    g.addEventListener('load', function () {
      g.navigator.serviceWorker.register('sw.js').catch(function () { /* 离线缓存失败不影响使用 */ });
    });
  }

  /* -------------------------------------------------------- 首次引导 --- */
  function onboard() {
    if (Store.get().settings.onboarded) return;
    var hasData = Store.get().records.length > 0;
    if (hasData) { Store.setSetting('onboarded', true); return; }
    U.openDialog({
      title: '欢迎使用「机长日志」',
      dismissible: false,
      body: U.h('div.onboard', null, [
        U.h('p', { text: '一个只存在你手机里的起飞记录 + 统计工具：' }),
        U.h('ul', null, [
          U.h('li', { text: '日历上点任意一天，选角色、按分类打标签，10 秒记一条' }),
          U.h('li', { text: '角色和标签可以直接新建，也可以从历史里挑（按使用次数排序）' }),
          U.h('li', { text: '选一个时间段（本周/本月/本年度/自定义），看角色排行、分类占比、时间分布、热力图' })
        ]),
        U.h('p.hint-inline', { text: '数据保存在本机浏览器，不上传任何服务器；建议定期在「设置 → 数据管理」里导出备份。' })
      ]),
      actions: [
        {
          text: '先看示例数据', kind: 'ghost', onClick: function () {
            Store.loadSample();
            Store.setSetting('onboarded', true);
            U.toast('已载入示例数据，可随时清空');
          }
        },
        {
          text: '从空白开始', kind: 'primary', onClick: function () {
            Store.setSetting('onboarded', true);
            U.toast('开始记录吧');
          }
        }
      ]
    });
  }

  /* ---------------------------------------------------------- 启动 --- */
  function boot() {
    applyTheme();
    installHistoryGuard();
    buildShell();

    // 支持 #demo 演示数据、#tab=stats 直达某个标签页（也方便截图/自测）
    var hp = null;
    try { hp = new g.URLSearchParams(String(g.location.hash || '').replace(/^#/, '')); } catch (e) { hp = null; }
    if (hp && hp.has('demo')) {
      Store.loadSample();
      Store.setSetting('onboarded', true);
    }
    // #reminder=1：把提醒时间设成 00:00 并打开，用来演示/自检提醒条；#reminder=0 强制关掉
    if (hp && hp.has('reminder')) {
      var rv = hp.get('reminder');
      if (rv === '0' || rv === 'off') {
        Store.patchReminder({ enabled: false });
      } else {
        Store.patchReminder({ enabled: true, time: '00:00', weekdays: [0, 1, 2, 3, 4, 5, 6] });
      }
    }

    if (g.Reminder) g.Reminder.init();

    Store.subscribe(function () {
      applyTheme();
      App.refresh();
      if (g.Reminder) g.Reminder.refresh();
    });
    if (g.matchMedia) {
      try {
        g.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
          if (Store.get().settings.theme === 'system') applyTheme();
        });
      } catch (e) { /* 老浏览器忽略 */ }
    }

    g.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredInstall = e;
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && U.sheetCount() > 0) { U.closeTopSheet(); }
    });

    registerSW();
    var initial = hp && hp.get('tab');
    if (['calendar', 'stats', 'settings'].indexOf(initial) < 0) initial = 'calendar';
    App.switchTab(initial);

    // 深链接：#date=2025-06-12 直接打开某天，#add 直接打开「记一笔」
    if (initial === 'stats' && hp && hp.get('sub')) g.StatsView.setTab(hp.get('sub'));
    var deepDate = hp && hp.get('date');
    if (deepDate && D.isKey(deepDate)) g.DaySheet.open(deepDate);
    if (hp && hp.has('add')) g.Editor.open({ date: D.todayKey() });
    onboard();
    // 打开应用时补一次检查：如果今天已经过了提醒时间又还没起飞，立刻提醒
    if (g.Reminder) g.Reminder.tick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  g.App = App;
})(typeof window !== 'undefined' ? window : globalThis);
