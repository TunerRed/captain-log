/* ============================================================================
 * 机长日志 · 通用 UI 组件（条形排行、统计卡、分段控件、空状态…）
 * ==========================================================================*/
(function (g) {
  'use strict';

  var U = g.U, D = U.D;

  /** 水平排行条：{label, value, max, color, share, sub, onClick, badge, unit} */
  U.barRow = function (o) {
    o = o || {};
    var max = o.max || 1;
    var pct = Math.max(2, Math.round((o.value / max) * 100));
    var head = U.h('div.bar-head', null, [
      o.leading || null,
      U.h('span.bar-label', { text: o.label }),
      o.badge ? U.h('span.bar-badge', { text: o.badge }) : null,
      U.h('span.bar-value', null, [
        U.h('b', { text: U.num(o.value) }),
        U.h('span', { text: (o.unit || ' 次') + (o.share !== undefined ? ' · ' + o.share + '%' : '') })
      ])
    ]);
    var fill = U.h('div.bar-fill', { style: { width: pct + '%', background: o.color || 'var(--accent)' } });
    var track = U.h('div.bar-track', null, fill);
    var row = U.h('div.bar-row' + (o.onClick ? '.clickable' : ''), null, [head, track, o.sub ? U.h('div.bar-sub', { text: o.sub }) : null]);
    if (o.onClick) {
      row.addEventListener('click', function () { o.onClick(o); });
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onClick(o); } });
    }
    return row;
  };

  /** 竖向柱状图：{values:[{label,value,color,tip}], height, highlight} */
  U.barChart = function (o) {
    o = o || {};
    var max = Math.max.apply(null, o.values.map(function (v) { return v.value; }).concat([1]));
    var wrap = U.h('div.bar-chart' + (o.compact ? '.compact' : ''));
    o.values.forEach(function (v) {
      var h = Math.round((v.value / max) * 100);
      var col = U.h('div.bar-col', null, [
        U.h('div.bar-col-track', null, [
          U.h('div.bar-col-fill', {
            style: { height: Math.max(v.value > 0 ? 4 : 0, h) + '%', background: v.color || 'var(--accent)' },
            title: (v.tip || (v.label + '：' + v.value))
          })
        ]),
        U.h('div.bar-col-label', { text: v.label })
      ]);
      if (v.onClick) {
        col.classList.add('clickable');
        col.addEventListener('click', function () { v.onClick(v); });
      }
      wrap.appendChild(col);
    });
    return wrap;
  };

  /** 统计卡 */
  U.statCard = function (o) {
    return U.h('div.stat-card' + (o.tone ? '.tone-' + o.tone : ''), null, [
      U.h('div.stat-label', { text: o.label }),
      U.h('div.stat-value', null, [
        U.h('b', { text: o.value }),
        o.unit ? U.h('span.stat-unit', { text: o.unit }) : null
      ]),
      o.sub ? U.h('div.stat-sub', { text: o.sub }) : null
    ]);
  };

  /** 分段控件：{items:[{id,name}], value, onChange} */
  U.segmented = function (o) {
    var el = U.h('div.segmented');
    function build() {
      U.clear(el);
      o.items.forEach(function (it) {
        var b = U.h('button.seg' + (it.id === o.value ? '.on' : ''), { type: 'button', text: it.name });
        b.addEventListener('click', function () {
          if (o.value === it.id) return;
          o.value = it.id;
          build();
          o.onChange && o.onChange(it.id);
        });
        el.appendChild(b);
      });
    }
    build();
    return el;
  };

  /** 空状态 */
  U.emptyState = function (o) {
    o = o || {};
    var box = U.h('div.empty', null, [
      U.h('div.empty-icon', { html: U.iconSvg(o.icon || 'star', 30) }),
      U.h('div.empty-title', { text: o.title || '暂无数据' }),
      o.text ? U.h('div.empty-text', { text: o.text }) : null
    ]);
    if (o.actionText) {
      var btn = U.h('button.btn.btn-primary', { type: 'button', text: o.actionText });
      btn.addEventListener('click', function () { o.onAction && o.onAction(); });
      box.appendChild(U.h('div.empty-action', null, btn));
    }
    return box;
  };

  /** 角色头像（取名字末字更符合中文习惯，用首字更稳） */
  U.avatar = function (name, color, size) {
    var s = size || 26;
    var ch = String(name || '?').trim();
    // 中文取前 1 字，英文取首字母
    var txt = /[\u4e00-\u9fa5]/.test(ch) ? ch.slice(-1) : ch.slice(0, 1).toUpperCase();
    return U.h('span.avatar', {
      text: txt,
      style: { background: color || 'var(--accent)', width: s + 'px', height: s + 'px', fontSize: Math.round(s * 0.46) + 'px' }
    });
  };

  /** 彩色小标签（用于展示记录上的分类标签） */
  U.tagPill = function (text, color, opts) {
    return U.h('span.tag-pill', {
      text: text,
      style: { '--c': color || 'var(--accent)' },
      title: (opts && opts.title) || ''
    });
  };

  /** 图标按钮 */
  U.iconBtn = function (name, label, onClick, kind) {
    var b = U.h('button.icon-btn' + (kind ? '.icon-' + kind : ''), { type: 'button', 'aria-label': label, title: label, html: U.iconSvg(name, 18) });
    if (onClick) b.addEventListener('click', onClick);
    return b;
  };
})(typeof window !== 'undefined' ? window : globalThis);
