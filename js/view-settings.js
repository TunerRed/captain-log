/* ============================================================================
 * 机长日志 · 设置视图：角色管理 / 分类标签管理 / 数据导入导出 / 偏好
 * ==========================================================================*/
(function (g) {
  'use strict';

  var U = g.U, Store = g.Store, D = U.D;

  var container = null;
  var SettingsView = {};

  SettingsView.mount = function (root) { container = root; draw(); };
  SettingsView.refresh = function () { draw(); };

  function draw() {
    if (!container) return;
    U.clear(container);

    var st = Store.get().settings;
    var db = Store.get();
    var usage = Store.usage();

    /* ---------------------------------------------------------- 偏好 --- */
    var pref = U.h('div.card');
    pref.appendChild(U.h('div.section-title', { text: '偏好设置' }));
    pref.appendChild(field('每周起始日', U.segmented({
      items: [{ id: '1', name: '周一' }, { id: '0', name: '周日' }],
      value: String(st.weekStart),
      onChange: function (v) { Store.setSetting('weekStart', Number(v)); }
    })));
    pref.appendChild(field('主题', U.segmented({
      items: [{ id: 'dark', name: '深色' }, { id: 'light', name: '浅色' }, { id: 'system', name: '跟随系统' }],
      value: st.theme,
      onChange: function (v) { Store.setSetting('theme', v); }
    })));
    container.appendChild(pref);

    /* ------------------------------------------------------ 角色管理 --- */
    var charCard = U.h('div.card');
    charCard.appendChild(U.h('div.section-title', null, [
      '角色管理', U.h('span.section-note', { text: db.characters.length + ' 个' })
    ]));
    var addCharBtn = U.h('button.btn.btn-ghost.btn-block', { type: 'button', text: '＋ 新增角色' });
    addCharBtn.addEventListener('click', function () {
      U.prompt({ title: '新增角色', label: '角色名称', placeholder: '例如：角色名 / 昵称' }).then(function (name) {
        if (name) { Store.addCharacter(name); U.toast('已新增：' + name); }
      });
    });

    if (!db.characters.length) {
      charCard.appendChild(U.h('div.hint-inline', { text: '还没有角色，点下面新增，或在日历里直接添加记录时新建。' }));
    } else {
      var sorted = db.characters.slice().sort(function (a, b) {
        var ua = usage.chars[a.id] || { count: 0 }, ub = usage.chars[b.id] || { count: 0 };
        return ub.count - ua.count || a.name.localeCompare(b.name, 'zh');
      });
      sorted.forEach(function (ch) {
        var u = usage.chars[ch.id] || { count: 0, days: 0, last: '' };
        var row = U.h('div.manage-row', null, [
          U.avatar(ch.name, ch.color, 30),
          U.h('div.manage-main', null, [
            U.h('div.manage-name', { text: ch.name }),
            U.h('div.manage-sub', { text: u.count ? (u.count + ' 次 · ' + u.days + ' 天 · 最近 ' + D.shortLabel(u.last)) : '还没用过' })
          ]),
          U.iconBtn('edit', '改名', function () {
            U.prompt({ title: '重命名角色', label: '角色名称', value: ch.name }).then(function (name) {
              if (!name) return;
              if (!Store.renameCharacter(ch.id, name)) { U.toast('已存在同名角色', 'error'); return; }
              U.toast('已重命名');
            });
          }),
          U.iconBtn('star', '改颜色', function () { pickColor(ch.color, function (c) { Store.setCharacterColor(ch.id, c); draw(); }); }),
          U.iconBtn('trash', '删除', function () {
            U.confirm({
              title: '删除角色',
              message: '删除「' + ch.name + '」会同时删除它的 ' + u.count + ' 次记录，确定吗？',
              confirmText: '删除角色和记录', danger: true
            }).then(function (ok) {
              if (!ok) return;
              Store.removeCharacter(ch.id);
              U.toast('已删除角色');
            });
          }, 'danger')
        ]);
        charCard.appendChild(row);
      });
    }
    charCard.appendChild(addCharBtn);
    container.appendChild(charCard);

    /* -------------------------------------------------- 分类 / 标签 --- */
    var catCard = U.h('div.card');
    catCard.appendChild(U.h('div.section-title', null, ['分类与标签', U.h('span.section-note', { text: db.categories.length + ' 个分类' })]));
    catCard.appendChild(U.h('div.hint-inline', { text: '分类用于给每次起飞打标签（如「情境」「地点」「心情」），统计时按分类和标签排行。' }));

    db.categories.forEach(function (cat, ci) {
      var used = cat.tags.map(function (t) { return { t: t, c: (usage.tags[t.id] || { count: 0 }).count }; })
        .sort(function (a, b) { return b.c - a.c; });
      var block = U.h('div.cat-block');
      var head = U.h('div.cat-head', null, [
        U.h('span.dot', { style: { background: cat.color } }),
        U.h('span.cat-name', { text: cat.name }),
        U.h('span.cat-meta', { text: cat.tags.length + ' 个标签' }),
        U.h('div.spacer'),
        U.iconBtn('left', '上移', function () { Store.moveCategory(cat.id, -1); }, ci === 0 ? 'disabled' : null),
        U.iconBtn('right', '下移', function () { Store.moveCategory(cat.id, 1); }),
        U.iconBtn('edit', '改名', function () {
          U.prompt({ title: '重命名分类', label: '分类名称', value: cat.name }).then(function (n) {
            if (n) Store.renameCategory(cat.id, n);
          });
        }),
        U.iconBtn('trash', '删除分类', function () {
          U.confirm({
            title: '删除分类',
            message: '删除「' + cat.name + '」及其 ' + cat.tags.length + ' 个标签？记录本身会保留，只是去掉这些标签。',
            confirmText: '删除', danger: true
          }).then(function (ok) { if (ok) { Store.removeCategory(cat.id); U.toast('已删除分类'); } });
        }, 'danger')
      ]);
      block.appendChild(head);

      var tagList = U.h('div.manage-tags');
      if (!cat.tags.length) {
        tagList.appendChild(U.h('div.hint-inline', { text: '还没有标签，点「＋ 标签」新增。' }));
      }
      used.forEach(function (x) {
        tagList.appendChild(U.h('div.manage-tag', { style: { '--c': x.t.color } }, [
          U.h('span.tag-pill', { text: x.t.name, style: { '--c': x.t.color } }),
          U.h('span.manage-tag-count', { text: x.c ? x.c + ' 次' : '未使用' }),
          U.h('div.spacer'),
          U.iconBtn('edit', '改名', function () {
            U.prompt({ title: '重命名标签', label: '标签名称', value: x.t.name }).then(function (n) {
              if (n) Store.renameTag(x.t.id, n);
            });
          }),
          U.iconBtn('trash', '删除标签', function () {
            U.confirm({
              title: '删除标签', message: '删除标签「' + x.t.name + '」？已打该标签的记录会去掉它。',
              confirmText: '删除', danger: true
            }).then(function (ok) { if (ok) { Store.removeTag(x.t.id); U.toast('已删除标签'); } });
          }, 'danger')
        ]));
      });
      block.appendChild(tagList);

      var addTagBtn = U.h('button.btn.btn-ghost.btn-sm', { type: 'button', text: '＋ 标签' });
      addTagBtn.addEventListener('click', function () {
        U.prompt({ title: '在「' + cat.name + '」下新增标签', label: '标签名称' }).then(function (n) {
          if (n) { Store.addTag(cat.id, n); U.toast('已新增标签'); }
        });
      });
      block.appendChild(U.h('div.cat-foot', null, [addTagBtn]));
      catCard.appendChild(block);
    });

    var addCatBtn = U.h('button.btn.btn-ghost.btn-block', { type: 'button', text: '＋ 新增分类' });
    addCatBtn.addEventListener('click', function () {
      U.prompt({ title: '新增分类', label: '分类名称', placeholder: '例如：心情' }).then(function (n) {
        if (n) { Store.addCategory(n); U.toast('已新增分类'); }
      });
    });
    catCard.appendChild(addCatBtn);
    container.appendChild(catCard);

    /* -------------------------------------------------------- 起飞提醒 --- */
    container.appendChild(reminderCard());

    /* ---------------------------------------------------------- 数据 --- */
    var dataCard = U.h('div.card');
    dataCard.appendChild(U.h('div.section-title', { text: '数据管理' }));
    dataCard.appendChild(U.h('div.manage-sub', {
      text: '共 ' + db.records.length + ' 条记录 · 存储方式：' + (Store.storageKind === 'localStorage' ? '浏览器本地存储' : '临时内存（关闭页面会丢失）')
    }));

    var fileInput = U.h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      U.readFileAsText(f).then(function (text) {
        fileInput.value = '';
        var obj = null;
        try { obj = JSON.parse(text); } catch (e) { U.toast('文件不是合法的 JSON', 'error'); return; }
        U.openDialog({
          title: '导入数据',
          body: U.h('div.dialog-text', { text: '文件包含 ' + ((obj.characters || []).length) + ' 个角色、' + ((obj.records || []).length) + ' 条记录。请选择导入方式：' }),
          actions: [
            { text: '取消', kind: 'ghost' },
            {
              text: '合并导入', kind: 'primary', onClick: function () {
                var s = Store.importObject(obj, 'merge');
                U.toast('合并完成：新增 ' + s.records + ' 条记录、' + s.characters + ' 个角色' + (s.skipped ? '，跳过重复 ' + s.skipped + ' 条' : ''));
              }
            },
            {
              text: '覆盖导入', kind: 'danger', onClick: function () {
                U.confirm({ title: '确认覆盖', message: '覆盖会清空当前所有数据，且无法撤销。确定吗？', confirmText: '覆盖', danger: true }).then(function (ok) {
                  if (!ok) return;
                  var s = Store.importObject(obj, 'replace');
                  U.toast('已覆盖导入：' + s.records + ' 条记录');
                });
                return false;
              }, keep: true
            }
          ]
        });
      }).catch(function () { U.toast('读取文件失败', 'error'); });
    });

    var btnRow = U.h('div.btn-row');
    btnRow.appendChild(button('导出 JSON 文件', 'download', 'ghost', function () {
      var name = '机长日志-' + D.todayKey() + '.json';
      if (U.download(name, Store.exportText(), 'application/json;charset=utf-8')) {
        U.toast('已导出 ' + name);
      } else {
        U.toast('导出失败，试试复制到剪贴板', 'error');
      }
    }));
    btnRow.appendChild(button('复制全部数据', 'copy', 'ghost', function () {
      U.copy(Store.exportText()).then(function (ok) { U.toast(ok ? '已复制到剪贴板' : '复制失败', ok ? '' : 'error'); });
    }));
    btnRow.appendChild(button('导入 JSON', 'upload', 'ghost', function () { fileInput.click(); }));
    btnRow.appendChild(button('载入示例数据', 'spark', 'ghost', function () {
      U.confirm({
        title: '载入示例数据',
        message: '会用示例角色/分类/记录替换当前全部数据，方便先看看统计效果。当前数据建议先导出备份。',
        confirmText: '载入示例'
      }).then(function (ok) {
        if (!ok) return;
        var s = Store.loadSample();
        U.toast('已载入示例：' + s.records + ' 条记录');
      });
    }));
    btnRow.appendChild(button('清空所有记录', 'trash', 'danger-ghost', function () {
      U.confirm({ title: '清空记录', message: '只删除全部起飞记录，角色与分类标签保留。', confirmText: '清空记录', danger: true }).then(function (ok) {
        if (!ok) return;
        Store.clearRecords();
        U.toast('记录已清空');
      });
    }));
    btnRow.appendChild(button('清空全部数据', 'trash', 'danger-ghost', function () {
      U.confirm({ title: '清空全部数据', message: '角色、分类标签、记录全部删除，且无法恢复。确定吗？', confirmText: '全部清空', danger: true }).then(function (ok) {
        if (!ok) return;
        Store.clearAll();
        U.toast('已清空全部数据');
      });
    }));
    dataCard.appendChild(btnRow);
    dataCard.appendChild(fileInput);
    container.appendChild(dataCard);

    /* ---------------------------------------------------------- 关于 --- */
    var about = U.h('div.card');
    about.appendChild(U.h('div.section-title', { text: '关于 / 安装' }));
    about.appendChild(U.h('div.manage-sub', { text: '机长日志 · 起飞统计 v1.0（Web 版，数据只存在你自己的设备上，不上传任何服务器）' }));
    var installBtn = U.h('button.btn.btn-primary.btn-block', { type: 'button', text: '安装到手机桌面（PWA）' });
    installBtn.addEventListener('click', function () {
      if (g.App && g.App.promptInstall) g.App.promptInstall();
      else U.toast('当前环境不支持自动安装，可用浏览器菜单里的「添加到主屏幕」');
    });
    about.appendChild(installBtn);
    about.appendChild(U.h('div.hint-inline', {
      text: '安卓使用：① 用手机浏览器打开本页 → 菜单「添加到主屏幕」即可像 App 一样全屏使用；② 也可以用 Capacitor 打包成 APK 安装。'
    }));
    container.appendChild(about);
  }

  /* -------------------------------------------------------- 小组件 --- */
  function field(label, node) {
    return U.h('div.pref-row', null, [U.h('div.pref-label', { text: label }), node]);
  }
  function button(text, icon, kind, onClick) {
    var b = U.h('button.btn.btn-' + (kind || 'ghost') + '.btn-block', { type: 'button' }, [
      U.icon(icon, 16), U.h('span', { text: text })
    ]);
    b.addEventListener('click', onClick);
    return b;
  }
  function iconBtn(name, label, onClick, kind) {
    if (kind === 'disabled') kind = null;
    return U.iconBtn(name, label, onClick, kind);
  }

  /* -------------------------------------------------------- 起飞提醒 --- */
  function reminderCard() {
    var Core = g.ReminderCore;
    var Reminder = g.Reminder;
    var cfg = Store.get().settings.reminder;
    var card = U.h('div.card');
    card.appendChild(U.h('div.section-title', null, [
      '起飞提醒',
      U.h('span.section-note', { text: cfg.enabled ? Core.describe(cfg) : '未开启' })
    ]));
    card.appendChild(U.h('div.hint-inline', {
      text: '到点如果当天还没有起飞记录，就提醒你一次；已经记过就完全不打扰。'
    }));

    // 总开关
    card.appendChild(switchRow('开启定时提醒', cfg.enabled, function (on) {
      Store.patchReminder({ enabled: on });
      if (on) {
        if (Reminder.permission() === 'default') {
          Reminder.requestPermission();
        } else if (Reminder.permission() === 'denied') {
          U.toast('系统通知被拒了，先用应用内提醒条；可在浏览器设置里重新允许', 'error');
        }
        U.toast('提醒已开启：' + Core.describe(Store.get().settings.reminder));
      }
    }));

    // 提醒时间
    var timeInput = U.h('input.input.time-input', { type: 'time', value: cfg.time });
    timeInput.addEventListener('change', function () {
      if (!D.isTime(timeInput.value)) { U.toast('时间格式不对', 'error'); return; }
      Store.patchReminder({ time: timeInput.value });
      U.toast('提醒时间已改为 ' + timeInput.value);
    });
    card.appendChild(field('提醒时间', timeInput));

    // 重复星期（周一在前，周日最后）
    var chips = U.h('div.chips');
    [1, 2, 3, 4, 5, 6, 0].forEach(function (d) {
      var on = cfg.weekdays.indexOf(d) >= 0;
      var b = U.h('button.chip' + (on ? '.on' : ''), {
        type: 'button', text: '周' + Core.WEEK_CN[d], style: { '--c': 'var(--accent)' }
      });
      b.addEventListener('click', function () {
        var cur = Store.get().settings.reminder.weekdays.slice();
        var i = cur.indexOf(d);
        if (i >= 0) cur.splice(i, 1); else cur.push(d);
        Store.patchReminder({ weekdays: cur });
      });
      chips.appendChild(b);
    });
    card.appendChild(U.h('div.field', null, [
      U.h('label.field-label', { text: '重复' }),
      chips,
      U.h('div.field-hint', { text: cfg.weekdays.length ? '已选 ' + cfg.weekdays.length + ' 天' : '一天都没选 → 不会提醒' })
    ]));

    // 触发条件
    card.appendChild(switchRow('仅在今天还没有起飞记录时提醒', cfg.onlyIfNoRecord !== false, function (on) {
      Store.patchReminder({ onlyIfNoRecord: on });
    }));

    // 稍后提醒间隔
    var sel = U.h('select.input.select');
    [10, 15, 30, 60, 120].forEach(function (m) {
      var o = U.h('option', { value: String(m), text: m + ' 分钟' });
      if (Number(cfg.snoozeMinutes) === m) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { Store.patchReminder({ snoozeMinutes: Number(sel.value) }); });
    card.appendChild(field('「稍后提醒」间隔', sel));

    // 通知通道
    var perm = Reminder.permission();
    var statusText = {
      native: '由 App 原生本地通知接管（可精确到点）',
      granted: '已授权：页面开着时能弹到状态栏',
      denied: '已被拒绝：只能在应用内提醒（去浏览器设置里放开本站通知）',
      default: '未授权：点下面的按钮开启，才会弹到状态栏',
      unsupported: '当前浏览器不支持系统通知，只能用应用内提醒条'
    }[perm] || perm;

    card.appendChild(U.h('div.section-title', { text: '通知通道' }));
    card.appendChild(U.h('div.perm-state' + (perm === 'granted' || perm === 'native' ? '.ok' : ''), null, [
      U.icon('bell', 16),
      U.h('span', { text: statusText })
    ]));

    var btnRow = U.h('div.btn-row');
    if (perm === 'default' || perm === 'unsupported' || perm === 'denied') {
      btnRow.appendChild(button('开启系统通知', 'bell', 'primary', function () {
        Reminder.requestPermission().then(function () { draw(); });
      }));
    }
    btnRow.appendChild(button('发一条测试提醒', 'plane', 'ghost', function () {
      Reminder.test();
      draw();
    }));
    card.appendChild(btnRow);

    card.appendChild(U.h('div.hint-inline', {
      text: '说明：Web 版在页面打开（含后台标签页）时能准时弹提醒；完全关掉浏览器后，只能靠系统的后台同步尽力补一次（频率由浏览器决定，不保证准点）。'
        + '想要「关着也能准点响」，需要把本项目打成安卓 APK 用系统本地通知（见 README 第七节）。'
    }));
    return card;
  }

  function switchRow(label, checked, onChange) {
    var b = U.h('button.switch' + (checked ? '.on' : ''), {
      type: 'button', role: 'switch', 'aria-checked': checked ? 'true' : 'false', 'aria-label': label
    }, [U.h('span.knob')]);
    b.addEventListener('click', function () { onChange(!b.classList.contains('on')); });
    return U.h('div.pref-row', null, [U.h('div.pref-label', { text: label }), b]);
  }

  function pickColor(current, onPick) {
    var box = U.h('div.color-grid');
    U.PALETTE.forEach(function (c) {
      var sw = U.h('button.color-swatch' + (c === current ? '.on' : ''), { type: 'button', style: { background: c }, 'aria-label': c });
      sw.addEventListener('click', function () { onPick(c); ctl.close(); });
      box.appendChild(sw);
    });
    var ctl = U.openDialog({
      title: '选择颜色',
      body: box,
      actions: [{ text: '取消', kind: 'ghost' }]
    });
  }

  g.SettingsView = SettingsView;
})(typeof window !== 'undefined' ? window : globalThis);
