/* ============================================================================
 * 机长日志 · 起飞记录编辑器（新建 / 编辑 / 整批编辑）
 * 既可对单个角色记录，也可一次给多个角色记同一批标签
 * ==========================================================================*/
(function (g) {
  'use strict';

  var U = g.U, Store = g.Store, D = U.D;

  var Editor = {};

  /**
   * open({ date, records })
   *   records 为空 → 新建；单条 → 编辑；多条（同一批）→ 整批编辑，按角色增删记录
   */
  Editor.open = function (opts) {
    opts = opts || {};
    var editing = (opts.records || []).slice();
    var isGroup = editing.length > 1;
    var single = editing.length === 1;
    var today = D.todayKey();

    var form = {
      date: opts.date || (editing[0] && editing[0].date) || today,
      time: editing.length ? editing[0].time : (opts.time !== undefined ? opts.time : D.nowTime()),
      count: editing.length ? editing[0].count : (opts.presetCount || 1),
      note: editing.length ? editing[0].note : (opts.presetNote || ''),
      tagIds: editing.length ? editing[0].tagIds.slice() : (opts.presetTagIds ? opts.presetTagIds.slice() : []),
      charIds: editing.map(function (r) { return r.characterId; }).filter(Boolean)
    };
    if (opts.presetCharIds && !editing.length) form.charIds = opts.presetCharIds.slice();
    if (opts.useCurrentTime === false) form.time = null;

    var search = '';

    /* ------------------------------------------------------------ 组装 --- */
    var charSelectedBox = U.h('div.chips.selected');
    var charPoolBox = U.h('div.chips.pool');
    var charCreateRow = U.h('div.inline-create');
    var tagArea = U.h('div.tag-area');
    var dateInput = U.h('input.input', { type: 'date', value: form.date });
    var timeInput = U.h('input.input.time-input', { type: 'time', value: form.time || '' });
    var countInput = U.h('input.input.count-input', { type: 'number', min: 1, max: 999, value: String(form.count) });
    var noteInput = U.h('textarea.input', { rows: 2, maxlength: 160, placeholder: '备注（可选）' });
    noteInput.value = form.note;

    var searchInput = U.h('input.input.search-input', { type: 'search', placeholder: '搜索角色…', value: '' });
    searchInput.addEventListener('input', function () { search = searchInput.value.trim(); renderChars(); });

    var newCharInput = U.h('input.input', { type: 'text', placeholder: '新角色名称', maxlength: 30 });
    var newCharBtn = U.h('button.btn.btn-ghost.btn-sm', { type: 'button', text: '新增' });
    function doCreateChar() {
      var name = newCharInput.value.trim();
      if (!name) { U.toast('请输入角色名称', 'error'); return; }
      var ch = Store.addCharacter(name);
      if (ch && form.charIds.indexOf(ch.id) < 0) form.charIds.push(ch.id);
      newCharInput.value = '';
      U.toast('已新增角色：' + ch.name);
      renderChars();
    }
    newCharBtn.addEventListener('click', doCreateChar);
    newCharInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doCreateChar(); }
    });
    U.append(charCreateRow, [newCharInput, newCharBtn]);

    var body = U.h('div.editor', null, [
      U.h('div.field-row', null, [
        U.h('div.field.field-date', null, [U.h('label.field-label', { text: '日期' }), dateInput]),
        U.h('div.field.field-time', null, [
          U.h('label.field-label', { text: '时间' }),
          U.h('div.time-wrap', null, [
            timeInput,
            U.h('button.btn.btn-ghost.btn-sm', { type: 'button', text: '现在', on: { click: function () { form.time = D.nowTime(); timeInput.value = form.time; } } }),
            U.h('button.btn.btn-ghost.btn-sm', { type: 'button', text: '不记录', on: { click: function () { form.time = null; timeInput.value = ''; } } })
          ])
        ])
      ]),
      U.h('div.field', null, [
        U.h('label.field-label', null, [
          '角色', U.h('span.field-note', { text: single || isGroup ? '（可切换，改选即替换）' : '（可多选，多选会分别生成记录）' })
        ]),
        charSelectedBox,
        searchInput,
        charPoolBox,
        charCreateRow
      ]),
      U.h('div.field', null, [
        U.h('label.field-label', null, ['分类标签', U.h('span.field-note', { text: '（按分类挑选，可多选）' })]),
        tagArea
      ]),
      U.h('div.field-row', null, [
        U.h('div.field', null, [
          U.h('label.field-label', { text: '次数' }),
          U.h('div.stepper', null, [
            U.h('button.icon-btn', { type: 'button', html: U.iconSvg('minus', 16), on: { click: function () { form.count = U.clamp(form.count - 1, 1, 999); countInput.value = String(form.count); } } }),
            countInput,
            U.h('button.icon-btn', { type: 'button', html: U.iconSvg('plus', 16), on: { click: function () { form.count = U.clamp(form.count + 1, 1, 999); countInput.value = String(form.count); } } })
          ])
        ]),
        U.h('div.field', null, [U.h('label.field-label', { text: '备注' }), noteInput])
      ])
    ]);

    countInput.addEventListener('change', function () { form.count = U.clamp(Math.round(Number(countInput.value) || 1), 1, 999); countInput.value = String(form.count); });

    /* --------------------------------------------------------- 角色渲染 --- */
    function renderChars() {
      U.clear(charSelectedBox);
      U.clear(charPoolBox);

      var usage = Store.usage();
      var chars = Store.get().characters.slice();

      if (!form.charIds.length) {
        charSelectedBox.appendChild(U.h('div.hint-inline', { text: '还没有选择角色，从下面挑一个，或直接新增。' }));
      } else {
        form.charIds.forEach(function (id) {
          var ch = Store.findCharacter(id);
          if (!ch) return;
          var chip = U.h('span.chip.on.chip-char', { style: { '--c': ch.color } }, [
            U.h('span.chip-dot'),
            U.h('span.chip-text', { text: ch.name }),
            U.h('button.chip-x', { type: 'button', 'aria-label': '移除', html: '&times;', on: { click: function () { removeChar(id); } } })
          ]);
          charSelectedBox.appendChild(chip);
        });
      }

      var kw = search.toLowerCase();
      var list = chars.filter(function (c) { return !kw || c.name.toLowerCase().indexOf(kw) >= 0; });
      list.sort(function (a, b) {
        var ua = usage.chars[a.id] || { count: 0, last: '' }, ub = usage.chars[b.id] || { count: 0, last: '' };
        if (kw) return a.name.localeCompare(b.name, 'zh');
        if (ub.count !== ua.count) return ub.count - ua.count;
        if (ub.last !== ua.last) return ub.last < ua.last ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh');
      });

      if (!chars.length) {
        charPoolBox.appendChild(U.h('div.hint-inline', { text: '还没有任何角色，直接在下方输入名称新增。' }));
      } else if (!list.length) {
        charPoolBox.appendChild(U.h('div.hint-inline', { text: '没有匹配「' + search + '」的角色，可直接新增。' }));
      } else {
        list.forEach(function (ch) {
          var on = form.charIds.indexOf(ch.id) >= 0;
          var u = usage.chars[ch.id] || { count: 0 };
          var chip = U.h('button.chip.chip-char' + (on ? '.on' : ''), {
            type: 'button', style: { '--c': ch.color },
            on: { click: function () { toggleChar(ch.id); } }
          }, [
            U.h('span.chip-dot'),
            U.h('span.chip-text', { text: ch.name }),
            u.count ? U.h('span.chip-num', { text: String(u.count) }) : null
          ]);
          charPoolBox.appendChild(chip);
        });
      }
    }

    function toggleChar(id) {
      var i = form.charIds.indexOf(id);
      if (single) {
        form.charIds = [id];            // 单条记录：单选，改选即替换
      } else if (i >= 0) {
        form.charIds.splice(i, 1);      // 新建 / 整批：多选切换
      } else {
        form.charIds.push(id);
      }
      renderChars();
    }
    function removeChar(id) {
      form.charIds = form.charIds.filter(function (x) { return x !== id; });
      renderChars();
    }

    /* --------------------------------------------------------- 标签渲染 --- */
    function renderTags() {
      U.clear(tagArea);
      var usage = Store.usage();
      var cats = Store.get().categories;
      if (!cats.length) {
        tagArea.appendChild(U.h('div.hint-inline', { text: '还没有分类，先新建一个分类（例如「情境」「地点」「心情」），再往里加标签。' }));
      }
      cats.forEach(function (cat) {
        var used = cat.tags.length;
        var selCount = cat.tags.filter(function (t) { return form.tagIds.indexOf(t.id) >= 0; }).length;
        var addBtn = U.h('button.mini-btn', { type: 'button', text: '+ 标签' });
        addBtn.addEventListener('click', function () {
          U.prompt({ title: '在「' + cat.name + '」下新增标签', label: '标签名称', placeholder: '例如：睡前' }).then(function (name) {
            if (!name) return;
            var t = Store.addTag(cat.id, name);
            if (t && form.tagIds.indexOf(t.id) < 0) form.tagIds.push(t.id);
            renderTags();
          });
        });
        var head = U.h('div.tag-group-head', null, [
          U.h('span.dot', { style: { background: cat.color } }),
          U.h('span.tag-group-name', { text: cat.name }),
          U.h('span.tag-group-meta', { text: used ? (selCount ? '已选 ' + selCount + '/' + used : used + ' 个标签') : '暂无标签' }),
          addBtn
        ]);
        var chips = U.h('div.chips');
        cat.tags.slice().sort(function (a, b) {
          var ua = (usage.tags[a.id] || { count: 0 }).count, ub = (usage.tags[b.id] || { count: 0 }).count;
          if (ub !== ua) return ub - ua;
          return a.name.localeCompare(b.name, 'zh');
        }).forEach(function (t) {
          var on = form.tagIds.indexOf(t.id) >= 0;
          var u = usage.tags[t.id] || { count: 0 };
          var chip = U.h('button.chip.chip-tag' + (on ? '.on' : ''), {
            type: 'button', style: { '--c': on ? t.color : cat.color },
            on: { click: function () { toggleTag(t.id); } }
          }, [
            U.h('span.chip-text', { text: t.name }),
            u.count ? U.h('span.chip-num', { text: String(u.count) }) : null
          ]);
          chips.appendChild(chip);
        });
        if (!cat.tags.length) chips.appendChild(U.h('div.hint-inline', { text: '还没有标签，点右上角「+ 标签」新增。' }));
        tagArea.appendChild(U.h('div.tag-group', null, [head, chips]));
      });

      var addCat = U.h('button.btn.btn-ghost.btn-block', { type: 'button', text: '＋ 新建分类' });
      addCat.addEventListener('click', function () {
        U.prompt({ title: '新增分类', label: '分类名称', placeholder: '例如：心情' }).then(function (name) {
          if (!name) return;
          Store.addCategory(name);
          U.toast('已新增分类：' + name);
          renderTags();
        });
      });
      tagArea.appendChild(addCat);
    }

    function toggleTag(id) {
      var i = form.tagIds.indexOf(id);
      if (i >= 0) form.tagIds.splice(i, 1); else form.tagIds.push(id);
      renderTags();
    }

    /* --------------------------------------------------------------- 保存 --- */
    var saveBtn = U.h('button.btn.btn-primary.btn-block', { type: 'button', text: editing.length ? '保存修改' : '保存本次起飞' });
    var cancelBtn = U.h('button.btn.btn-ghost', { type: 'button', text: '取消' });
    var delBtn = null;
    if (editing.length) {
      delBtn = U.h('button.btn.btn-danger-ghost', { type: 'button', text: editing.length > 1 ? '删除本批' : '删除' });
    }
    var foot = U.h('div.editor-foot', null, [
      delBtn,
      U.h('div.spacer'),
      cancelBtn,
      saveBtn
    ]);

    var sheet = U.openSheet({
      title: opts.title || (editing.length ? (isGroup ? '编辑本批起飞（' + editing.length + ' 个角色）' : '编辑起飞记录') : '添加起飞记录'),
      subtitle: opts.subtitle || (isGroup ? '修改会同步到本批全部角色' : ''),
      body: body,
      footer: foot
    });
    if (!sheet) return null;

    cancelBtn.addEventListener('click', function () { sheet.close(); });

    if (delBtn) {
      delBtn.addEventListener('click', function () {
        U.confirm({
          title: '删除记录', message: '确定删除当前记录吗？删除后不可恢复。',
          confirmText: '删除', danger: true
        }).then(function (ok) {
          if (!ok) return;
          Store.removeRecords(editing.map(function (r) { return r.id; }));
          U.toast('已删除');
          sheet.close();
        });
      });
    }

    saveBtn.addEventListener('click', function () {
      var date = dateInput.value;
      if (!D.isKey(date)) { U.toast('请选择日期', 'error'); return; }
      if (!form.charIds.length) { U.toast('请至少选择一个角色', 'error'); return; }
      form.count = U.clamp(Math.round(Number(countInput.value) || 1), 1, 999);
      form.time = D.isTime(timeInput.value) ? timeInput.value : null;
      form.note = noteInput.value.trim();

      if (!editing.length) {
        Store.addRecords(
          { date: date, time: form.time, count: form.count, note: form.note, tagIds: form.tagIds },
          form.charIds.map(function (id) { return { characterId: id }; })
        );
        U.toast('已记录 ' + form.charIds.length + ' 个角色 · ' + form.count + ' 次');
      } else {
        syncRecords(editing, date, form);
        U.toast('已保存修改');
      }
      sheet.close();
      if (typeof opts.onSaved === 'function') opts.onSaved();
    });

    /** 编辑保存：保持角色集合与记录一一对应 */
    function syncRecords(existing, date, f) {
      var keepIds = [];
      var byChar = {};
      existing.forEach(function (r) { if (r.characterId) byChar[r.characterId] = r; });

      if (existing.length === 1 && f.charIds.length <= 1) {
        // 单条：直接改（允许把角色换成另一个或清空为未指定）
        var r = existing[0];
        Store.updateRecord(r.id, {
          date: date, characterId: f.charIds[0] || null, tagIds: f.tagIds.slice(),
          time: f.time, count: f.count, note: f.note
        });
        keepIds.push(r.id);
        return;
      }

      f.charIds.forEach(function (cid) {
        var r = byChar[cid];
        if (r) {
          Store.updateRecord(r.id, { date: date, characterId: cid, tagIds: f.tagIds.slice(), time: f.time, count: f.count, note: f.note });
          keepIds.push(r.id);
        } else {
          var made = Store.addRecords({
            date: date, time: f.time, count: f.count, note: f.note,
            tagIds: f.tagIds.slice(), groupId: existing[0].groupId
          }, [{ characterId: cid }]);
          made.forEach(function (m) { keepIds.push(m.id); });
        }
      });

      var drop = existing.filter(function (r) { return keepIds.indexOf(r.id) < 0; }).map(function (r) { return r.id; });
      if (drop.length) Store.removeRecords(drop);
    }

    renderChars();
    renderTags();
    return sheet;
  };

  /** 快速添加：直接对某个角色记一次（日历上角色快捷入口用） */
  Editor.quickAdd = function (dateKey, characterId) {
    return Editor.open({ date: dateKey, presetCharIds: [characterId] });
  };

  g.Editor = Editor;
})(typeof window !== 'undefined' ? window : globalThis);
