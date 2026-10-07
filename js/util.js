/* ============================================================================
 * 机长日志 · 基础工具层
 * 无第三方依赖：DOM 小工具 / 日期计算 / 颜色 / 弹层（toast、sheet、dialog）
 * 约定：所有对外暴露的符号都挂在全局 window.U 上（不使用 ES Module，保证
 *       直接双击 index.html（file://）也能运行）。
 * ==========================================================================*/
(function (g) {
  'use strict';

  var U = {};
  var doc = g.document;

  /* ---------------------------------------------------------------- DOM --- */

  U.$ = function (sel, root) { return (root || doc).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); };

  /**
   * 极简 hyperscript：h('div.card#x', {text:'hi', on:{click:fn}}, [child...])
   * 用户输入一律走 text / textContent，不拼 innerHTML，避免 XSS。
   */
  U.h = function (tag, props, children) {
    var m = /^([a-zA-Z0-9-]*)((?:\.[^.#]+)*)(?:#([^.#]+))?$/.exec(String(tag || 'div'));
    var name = (m && m[1]) || 'div';
    var node = doc.createElement(name);
    if (m && m[2]) m[2].split('.').forEach(function (c) { if (c) node.classList.add(c); });
    if (m && m[3]) node.id = m[3];

    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined) return;
      if (k === 'text') node.textContent = String(v);
      else if (k === 'html') node.innerHTML = String(v); // 仅用于内置静态图标
      else if (k === 'class' || k === 'className') String(v).split(/\s+/).forEach(function (c) { if (c) node.classList.add(c); });
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (s) { node.style[s] = v[s]; });
      else if (k === 'dataset' && typeof v === 'object') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
      else if (k === 'on' && typeof v === 'object') Object.keys(v).forEach(function (e) { node.addEventListener(e, v[e]); });
      else if (k === 'value') node.value = v;
      else if (k in node && k !== 'list' && k !== 'type' && typeof v === 'boolean') node[k] = v;
      else node.setAttribute(k, String(v));
    });

    U.append(node, children);
    return node;
  };

  U.append = function (parent, children) {
    if (children === null || children === undefined || children === false) return parent;
    if (Array.isArray(children)) { children.forEach(function (c) { U.append(parent, c); }); return parent; }
    parent.appendChild(children instanceof g.Node ? children : doc.createTextNode(String(children)));
    return parent;
  };

  U.clear = function (node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; };

  U.on = function (node, evt, fn, opts) { node.addEventListener(evt, fn, opts); return function () { node.removeEventListener(evt, fn, opts); }; };

  U.uid = function (prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };

  U.debounce = function (fn, wait) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, wait || 120);
    };
  };

  /* --------------------------------------------------------------- 日期 --- */
  /* 全部使用本地时区；日期键统一为 'YYYY-MM-DD' 字符串，避免时区/夏令时坑。 */
  var D = {};
  U.D = D;

  D.pad = function (n) { return (n < 10 ? '0' : '') + n; };
  D.isKey = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); };

  /** Date -> 'YYYY-MM-DD' */
  D.key = function (d) { return d.getFullYear() + '-' + D.pad(d.getMonth() + 1) + '-' + D.pad(d.getDate()); };
  /** 'YYYY-MM-DD' -> Date（本地 00:00） */
  D.date = function (key) {
    if (key instanceof Date) return new Date(key.getFullYear(), key.getMonth(), key.getDate());
    var p = String(key).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  };
  D.todayKey = function () { return D.key(new Date()); };
  D.addDays = function (key, n) { var d = D.date(key); d.setDate(d.getDate() + n); return D.key(d); };
  D.addMonths = function (key, n) { var d = D.date(key); d.setDate(1); d.setMonth(d.getMonth() + n); return D.key(d); };
  D.startOfMonth = function (key) { var d = D.date(key); return D.key(new Date(d.getFullYear(), d.getMonth(), 1)); };
  D.endOfMonth = function (key) { var d = D.date(key); return D.key(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
  D.daysInMonth = function (key) { var d = D.date(key); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
  /** 0=周日 ... 6=周六 */
  D.dow = function (key) { return D.date(key).getDay(); };
  /** 该周第一天（weekStart: 0=周日, 1=周一） */
  D.startOfWeek = function (key, weekStart) {
    var ws = (weekStart === 0) ? 0 : 1;
    var diff = (D.dow(key) - ws + 7) % 7;
    return D.addDays(key, -diff);
  };
  D.diffDays = function (a, b) { return Math.round((D.date(b) - D.date(a)) / 86400000); };
  /** 闭区间逐日 [start, end] */
  D.each = function (start, end) {
    var out = [], guard = 0, cur = start;
    if (D.diffDays(start, end) < 0) return out;
    while (guard++ < 4000) { out.push(cur); if (cur === end) break; cur = D.addDays(cur, 1); }
    return out;
  };
  D.isFuture = function (key) { return D.diffDays(D.todayKey(), key) > 0; };

  D.WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  D.monthLabel = function (keyOrDate) { var d = D.date(keyOrDate); return d.getFullYear() + '年' + (d.getMonth() + 1) + '月'; };
  D.dayLabel = function (key) {
    var d = D.date(key);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + D.WEEK_CN[d.getDay()];
  };
  D.shortLabel = function (key) { var d = D.date(key); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; };
  D.monthKey = function (key) { return String(key).slice(0, 7); };

  D.nowTime = function () { var d = new Date(); return D.pad(d.getHours()) + ':' + D.pad(d.getMinutes()); };
  D.isTime = function (s) { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); };
  D.hourOf = function (time) { return D.isTime(time) ? Number(time.slice(0, 2)) : -1; };
  D.minutesOf = function (time) { return D.isTime(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : -1; };

  D.rangeLabel = function (start, end) {
    if (!start || !end) return '未选择';
    if (start === end) return D.dayLabel(start);
    var sameYear = start.slice(0, 4) === end.slice(0, 4);
    return (sameYear ? start.slice(0, 4) + '年' : start.replace(/-/g, '/')) +
      (sameYear ? D.shortLabel(start) : ' ' + D.shortLabel(start)) + ' ~ ' +
      (sameYear ? D.shortLabel(end) : end.replace(/-/g, '/'));
  };

  /* --------------------------------------------------------------- 数字 --- */
  U.pct = function (part, whole) { return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0; };
  U.num = function (n, digits) {
    var v = Number(n) || 0;
    var s = v.toFixed(digits === undefined ? 1 : digits);
    return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  };
  U.sum = function (arr, fn) { return arr.reduce(function (a, b) { return a + (fn ? fn(b) : b); }, 0); };
  U.sortDesc = function (arr, fn) { return arr.slice().sort(function (a, b) { return fn(b) - fn(a); }); };
  U.clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };

  /* --------------------------------------------------------------- 颜色 --- */
  U.PALETTE = ['#7c6cff', '#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#a78bfa',
    '#60a5fa', '#f472b6', '#4ade80', '#f97316', '#2dd4bf', '#e879f9'];

  U.hash = function (str) {
    var h = 2166136261, s = String(str || '');
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  };
  U.colorFor = function (key) { return U.PALETTE[U.hash(key) % U.PALETTE.length]; };
  U.nextColor = function (used) {
    var set = {};
    (used || []).forEach(function (c) { if (c) set[c] = 1; });
    for (var i = 0; i < U.PALETTE.length; i++) if (!set[U.PALETTE[i]]) return U.PALETTE[i];
    return U.PALETTE[(used || []).length % U.PALETTE.length];
  };
  /** 给 swatch / 小圆点选一个可读的文字色 */
  U.onColor = function (hex) {
    var h = String(hex || '#7c6cff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), gg = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * gg + 0.114 * b) > 150 ? '#101322' : '#ffffff';
  };

  /* --------------------------------------------------------------- 图标 --- */
  var ICONS = {
    plane: '<path d="M2 12l19-9-9 19-2-8-8-2z"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
    chart: '<path d="M18 20V10M12 20V4M6 20v-6"/><path d="M3 20h18"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5l2.6-1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    left: '<path d="M15 18l-6-6 6-6"/>',
    right: '<path d="M9 18l6-6-6-6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>',
    edit: '<path d="M11 4H4v16h16v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    search: '<circle cx="11" cy="11" r="7.5"/><path d="M21 21l-4.5-4.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
    tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L2 12V2h10l8.6 8.6a2 2 0 010 2.8z"/><circle cx="7" cy="7" r="1.4"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.6"/>',
    folder: '<path d="M3 6.5A2 2 0 015 4.5h4l2 2.5h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    fire: '<path d="M12 2.5s5.5 4.2 5.5 9.5a5.5 5.5 0 11-11 0c0-2 1-3.5 2-4.5.4 1.6 1.5 2.5 2.5 2.5 1.5 0 2-1.5 1-7.5z"/>',
    spark: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/>',
    star: '<path d="M12 3.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.8l6-.7z"/>',
    play: '<path d="M7 4.5l12 7.5-12 7.5z"/>',
    bell: '<path d="M18 8.5a6 6 0 10-12 0c0 6.5-2.5 8-2.5 8h17s-2.5-1.5-2.5-8"/><path d="M13.8 20.5a2.1 2.1 0 01-3.6 0"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>'
  };

  /** 返回一个 svg 元素（内容全部为内置常量，无用户输入） */
  U.icon = function (name, size) {
    var span = doc.createElement('span');
    span.className = 'i';
    span.innerHTML = '<svg viewBox="0 0 24 24" width="' + (size || 20) + '" height="' + (size || 20) +
      '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[name] || '') + '</svg>';
    return span;
  };

  U.iconSvg = function (name, size) { return U.icon(name, size).innerHTML; };

  /* ------------------------------------------------------------ 轻提示 --- */
  U.toast = function (msg, kind) {
    var root = U.$('#toast-root');
    if (!root) { return; }
    var el = U.h('div.toast' + (kind ? '.t-' + kind : ''), { text: msg });
    root.appendChild(el);
    setTimeout(function () { el.classList.add('in'); }, 10);
    setTimeout(function () {
      el.classList.remove('in');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }, kind === 'error' ? 3200 : 2000);
  };

  /* ------------------------------------------------------- 弹层 / 抽屉 --- */
  /* 每个弹层是 #sheet-root 下的一层，支持叠加（详情 -> 编辑器），Esc/返回键关最上层。 */

  var sheets = [];

  U.openSheet = function (opts) {
    opts = opts || {};
    var root = U.$('#sheet-root');
    if (!root) return null;

    var panel = U.h('div.panel' + (opts.center ? '.center' : ''));
    var titleEl = U.h('h2.sheet-title', { text: opts.title || '' });
    var subEl = U.h('div.sheet-sub', { text: opts.subtitle || '' });
    if (!opts.subtitle) subEl.style.display = 'none';

    var closeBtn = U.h('button.icon-btn', { type: 'button', 'aria-label': '关闭', html: U.iconSvg('close', 18) });
    var head = U.h('div.sheet-head', null, [
      U.h('div.sheet-head-text', null, [titleEl, subEl]),
      closeBtn
    ]);
    var body = U.h('div.sheet-body');
    if (opts.body) body.appendChild(opts.body);
    var foot = U.h('div.sheet-foot');
    if (opts.footer) foot.appendChild(opts.footer);
    else foot.style.display = 'none';

    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(foot);

    var layer = U.h('div.sheet-layer' + (opts.center ? '.as-dialog' : ''), null, [
      U.h('div.sheet-backdrop'),
      panel
    ]);
    root.appendChild(layer);
    U.$('#sheet-root').classList.add('has-sheet');

    var ctl = {
      layer: layer, panel: panel, body: body, foot: foot,
      setTitle: function (t) { titleEl.textContent = t; },
      setSubtitle: function (t) { subEl.textContent = t || ''; subEl.style.display = t ? '' : 'none'; },
      setBody: function (n) { U.clear(body); if (n) body.appendChild(n); },
      setFooter: function (n) { U.clear(foot); if (n) { foot.appendChild(n); foot.style.display = ''; } else foot.style.display = 'none'; },
      close: close
    };

    function close() {
      var i = sheets.indexOf(ctl);
      if (i >= 0) sheets.splice(i, 1);
      layer.classList.remove('in');
      setTimeout(function () {
        if (layer.parentNode) layer.parentNode.removeChild(layer);
        if (!sheets.length && root) root.classList.remove('has-sheet');
      }, 220);
      if (typeof opts.onClose === 'function') opts.onClose();
    }

    // 注意：走 ctl.close() 而不是内部的 close()，
    // 这样外层（app.js 的历史记录守卫）替换过的 close 才能被触发，返回键状态才不会错乱。
    closeBtn.addEventListener('click', function () { ctl.close(); });
    U.$('.sheet-backdrop', layer).addEventListener('click', function () {
      if (opts.dismissible === false) return;
      ctl.close();
    });

    sheets.push(ctl);
    requestAnimationFrame(function () { layer.classList.add('in'); });

    if (opts.focus) {
      setTimeout(function () {
        var f = U.$(opts.focus, panel);
        if (f) { f.focus(); if (f.select) try { f.select(); } catch (e) { /* noop */ } }
      }, 240);
    }
    return ctl;
  };

  U.closeTopSheet = function () {
    var top = sheets[sheets.length - 1];
    if (top) { top.close(); return true; }
    return false;
  };
  U.sheetCount = function () { return sheets.length; };

  /**
   * 通用对话框：openDialog({title, body, actions:[{text, kind, value, onClick}]})
   * 返回 {close, el}；actions 里带 onClick 的返回值若不是 false 会自动关闭。
   */
  U.openDialog = function (opts) {
    opts = opts || {};
    var foot = U.h('div.dialog-actions');
    var ctl = U.openSheet({
      title: opts.title || '',
      subtitle: opts.subtitle || '',
      center: true,
      dismissible: opts.dismissible !== false,
      body: opts.body || null,
      footer: foot
    });
    (opts.actions || []).forEach(function (a) {
      var btn = U.h('button.btn' + (a.kind ? '.btn-' + a.kind : ''), { type: 'button', text: a.text });
      btn.addEventListener('click', function () {
        var r = a.onClick ? a.onClick(ctl) : undefined;
        if (r !== false && a.keep !== true) ctl.close();
      });
      foot.appendChild(btn);
    });
    return ctl;
  };

  U.confirm = function (opts) {
    opts = typeof opts === 'string' ? { message: opts } : (opts || {});
    return new Promise(function (resolve) {
      var msg = U.h('div.dialog-text', { text: opts.message || '' });
      var decided = false;
      U.openDialog({
        title: opts.title || '确认操作',
        body: msg,
        onClose: function () { if (!decided) resolve(false); },
        actions: [
          { text: opts.cancelText || '取消', kind: 'ghost', onClick: function () { decided = true; resolve(false); } },
          {
            text: opts.confirmText || '确定', kind: opts.danger ? 'danger' : 'primary',
            onClick: function () { decided = true; resolve(true); }
          }
        ]
      });
    });
  };

  /** 文本输入框（替代原生 prompt，移动端体验更好） */
  U.prompt = function (opts) {
    opts = typeof opts === 'string' ? { title: opts } : (opts || {});
    return new Promise(function (resolve) {
      var input = U.h('input.input', {
        type: 'text', value: opts.value || '', placeholder: opts.placeholder || '',
        maxlength: opts.maxlength || 40
      });
      var wrap = U.h('div.field', null, [
        opts.label ? U.h('label.field-label', { text: opts.label }) : null,
        input,
        opts.hint ? U.h('div.field-hint', { text: opts.hint }) : null
      ]);
      var done = false;
      function finish(v) { done = true; resolve(v); }
      var ctl = U.openDialog({
        title: opts.title || '输入',
        body: wrap,
        onClose: function () { if (!done) resolve(null); },
        actions: [
          { text: '取消', kind: 'ghost', onClick: function () { finish(null); } },
          { text: opts.confirmText || '确定', kind: 'primary', onClick: function () { finish(input.value.trim() || null); } }
        ]
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); finish(input.value.trim() || null); ctl.close(); }
      });
      setTimeout(function () { input.focus(); if (input.select) input.select(); }, 260);
    });
  };

  /* ------------------------------------------------------------- 剪贴板 --- */
  U.copy = function (text) {
    if (g.navigator && g.navigator.clipboard && g.isSecureContext) {
      return g.navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return fallback(); });
    }
    return Promise.resolve(fallback());
    function fallback() {
      try {
        var ta = doc.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        doc.body.appendChild(ta);
        ta.select();
        var ok = doc.execCommand && doc.execCommand('copy');
        doc.body.removeChild(ta);
        return !!ok;
      } catch (e) { return false; }
    }
  };

  /* --------------------------------------------------------------- 其它 --- */
  U.download = function (filename, text, mime) {
    try {
      var blob = new g.Blob([text], { type: mime || 'application/json;charset=utf-8' });
      var url = g.URL.createObjectURL(blob);
      var a = doc.createElement('a');
      a.href = url; a.download = filename;
      doc.body.appendChild(a); a.click();
      setTimeout(function () { doc.body.removeChild(a); g.URL.revokeObjectURL(url); }, 200);
      return true;
    } catch (e) { return false; }
  };

  U.readFileAsText = function (file) {
    return new Promise(function (resolve, reject) {
      var fr = new g.FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsText(file);
    });
  };

  g.U = U;
})(typeof window !== 'undefined' ? window : globalThis);
