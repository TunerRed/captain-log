/* ============================================================================
 * 机长日志 · 数据层
 * 单一数据源（DB）→ localStorage 持久化 → 订阅通知重渲染
 * 数据结构：
 * {
 *   schema: 1,
 *   settings: { weekStart:1, theme:'dark', onboarded:false, installTipDismissed:false },
 *   characters: [{ id, name, color, note, createdAt, archived }],
 *   categories: [{ id, name, color, createdAt, tags:[{ id, name, color, createdAt }] }],
 *   records:    [{ id, date:'YYYY-MM-DD', characterId, tagIds:[], time:'HH:mm'|null,
 *                  count:1, note:'', groupId, createdAt, updatedAt }]
 * }
 * ==========================================================================*/
(function (g) {
  'use strict';

  var U = g.U;
  var KEY = 'captain-log:db:v1';
  var SCHEMA = 1;

  /* ---------------------------------------------------------------- 存储 --- */
  var store = (function () {
    try {
      var t = '__cl_probe__';
      g.localStorage.setItem(t, '1');
      g.localStorage.removeItem(t);
      return { kind: 'localStorage', api: g.localStorage };
    } catch (e) {
      var mem = {};
      return {
        kind: 'memory',
        api: {
          getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
          setItem: function (k, v) { mem[k] = String(v); },
          removeItem: function (k) { delete mem[k]; }
        }
      };
    }
  })();

  var db = null;
  var listeners = [];
  var usageCache = null;
  var saveSoon = null;

  /* ------------------------------------------------------------ 工厂/规范 --- */
  function uid(p) { return U.uid(p); }
  function reminderCore() {
    return g.ReminderCore || {
      normalize: function () { return null; },
      defaults: function () { return {}; }
    };
  }

  function newCharacter(name, color) {
    return { id: uid('ch'), name: String(name || '').trim(), color: color || U.colorFor(name + Date.now()), note: '', createdAt: Date.now(), archived: false };
  }
  function newCategory(name, color, tags) {
    return { id: uid('cat'), name: String(name || '').trim(), color: color || U.colorFor(name + Date.now()), createdAt: Date.now(), tags: tags || [] };
  }
  function newTag(name, color) {
    return { id: uid('tag'), name: String(name || '').trim(), color: color || U.colorFor(name + Date.now()), createdAt: Date.now() };
  }

  function normalizeRecord(r) {
    if (!r || !U.D.isKey(r.date)) return null;
    var count = Math.max(1, Math.min(999, Math.round(Number(r.count) || 1)));
    var tagIds = Array.isArray(r.tagIds) ? r.tagIds.filter(function (t) { return typeof t === 'string'; }) : [];
    return {
      id: r.id || uid('rec'),
      date: r.date,
      characterId: r.characterId || null,
      tagIds: tagIds,
      time: U.D.isTime(r.time) ? r.time : null,
      count: count,
      note: typeof r.note === 'string' ? r.note : '',
      groupId: r.groupId || uid('grp'),
      createdAt: Number(r.createdAt) || Date.now(),
      updatedAt: Number(r.updatedAt) || Number(r.createdAt) || Date.now()
    };
  }

  function normalize(raw) {
    var out = {
      schema: SCHEMA,
      settings: {
        weekStart: 1, theme: 'dark', onboarded: false, installTipDismissed: false,
        lastRangePreset: 'year',
        reminder: reminderCore().normalize(null)
      },
      characters: [], categories: [], records: []
    };
    if (!raw || typeof raw !== 'object') return out;

    if (raw.settings && typeof raw.settings === 'object') {
      var s = raw.settings;
      if (s.weekStart === 0 || s.weekStart === 1) out.settings.weekStart = s.weekStart;
      if (s.theme === 'light' || s.theme === 'dark' || s.theme === 'system') out.settings.theme = s.theme;
      out.settings.onboarded = !!s.onboarded;
      out.settings.installTipDismissed = !!s.installTipDismissed;
      if (typeof s.lastRangePreset === 'string') out.settings.lastRangePreset = s.lastRangePreset;
      out.settings.reminder = reminderCore().normalize(s.reminder);
    }

    var charIds = {};
    (Array.isArray(raw.characters) ? raw.characters : []).forEach(function (c) {
      if (!c || !c.name) return;
      var ch = newCharacter(c.name, c.color);
      ch.id = c.id || ch.id;
      if (charIds[ch.id]) return;
      charIds[ch.id] = 1;
      ch.note = typeof c.note === 'string' ? c.note : '';
      ch.archived = !!c.archived;
      ch.createdAt = Number(c.createdAt) || ch.createdAt;
      out.characters.push(ch);
    });

    var tagIds = {};
    (Array.isArray(raw.categories) ? raw.categories : []).forEach(function (c) {
      if (!c || !c.name) return;
      var cat = newCategory(c.name, c.color);
      cat.id = c.id || cat.id;
      cat.createdAt = Number(c.createdAt) || cat.createdAt;
      (Array.isArray(c.tags) ? c.tags : []).forEach(function (t) {
        if (!t || !t.name) return;
        var tag = newTag(t.name, t.color);
        tag.id = t.id || tag.id;
        tag.createdAt = Number(t.createdAt) || tag.createdAt;
        if (tagIds[tag.id]) return;
        tagIds[tag.id] = cat.id;
        cat.tags.push(tag);
      });
      out.categories.push(cat);
    });

    (Array.isArray(raw.records) ? raw.records : []).forEach(function (r) {
      var rec = normalizeRecord(r);
      if (!rec) return;
      // 清理孤立引用：角色被删、标签被删
      if (rec.characterId && !charIds[rec.characterId]) rec.characterId = null;
      rec.tagIds = rec.tagIds.filter(function (t) { return !!tagIds[t]; });
      out.records.push(rec);
    });

    out.records.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt - b.createdAt); });
    return out;
  }

  /* ------------------------------------------------------------ 读写/订阅 --- */
  function load() {
    var raw = null;
    try { raw = JSON.parse(store.api.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    db = normalize(raw);
    usageCache = null;
    return db;
  }

  function persist() {
    try {
      store.api.setItem(KEY, JSON.stringify({
        schema: SCHEMA,
        savedAt: Date.now(),
        settings: db.settings,
        characters: db.characters,
        categories: db.categories,
        records: db.records
      }));
    } catch (e) {
      U.toast && U.toast('保存失败：本地存储不可用或已满', 'error');
    }
  }

  function schedulePersist() {
    if (saveSoon) clearTimeout(saveSoon);
    saveSoon = setTimeout(function () { saveSoon = null; persist(); }, 200);
  }

  function emit() {
    usageCache = null;
    schedulePersist();
    listeners.slice().forEach(function (fn) {
      try { fn(db); } catch (e) { if (g.console) console.error(e); }
    });
  }

  /* ---------------------------------------------------------------- 查询 --- */
  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  var Store = {};
  Store.SCHEMA = SCHEMA;
  Store.storageKind = store.kind;
  Store.get = function () { return db; };
  Store.settings = function () { return db.settings; };
  Store.setSetting = function (k, v) { db.settings[k] = v; emit(); };
  /** 局部更新提醒设置（保持其它字段不变） */
  Store.patchReminder = function (patch) {
    var r = db.settings.reminder || (db.settings.reminder = reminderCore().normalize(null));
    Object.keys(patch || {}).forEach(function (k) { r[k] = patch[k]; });
    emit();
    return r;
  };
  Store.subscribe = function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; };
  Store.load = load;
  Store.persist = persist;
  Store.touch = emit;
  Store.findCharacter = function (id) { return find(db.characters, id); };
  Store.findCategory = function (id) { return find(db.categories, id); };
  Store.findTag = function (tagId) {
    for (var i = 0; i < db.categories.length; i++) {
      var t = find(db.categories[i].tags, tagId);
      if (t) return { tag: t, category: db.categories[i] };
    }
    return null;
  };
  Store.findRecord = function (id) { return find(db.records, id); };

  /* -------------------------------------------------------- 角色：增删改 --- */
  Store.addCharacter = function (name, opts) {
    name = String(name || '').trim();
    if (!name) return null;
    var exist = Store.findCharacterByName(name);
    if (exist) return exist;
    var used = db.characters.map(function (c) { return c.color; });
    var ch = newCharacter(name, (opts && opts.color) || U.nextColor(used));
    db.characters.push(ch);
    emit();
    return ch;
  };
  Store.findCharacterByName = function (name) {
    var n = String(name || '').trim().toLowerCase();
    for (var i = 0; i < db.characters.length; i++) if (db.characters[i].name.trim().toLowerCase() === n) return db.characters[i];
    return null;
  };
  Store.renameCharacter = function (id, name) {
    name = String(name || '').trim();
    var ch = find(db.characters, id);
    if (!ch || !name) return false;
    var dup = Store.findCharacterByName(name);
    if (dup && dup.id !== id) return false;
    ch.name = name;
    emit();
    return true;
  };
  Store.setCharacterColor = function (id, color) {
    var ch = find(db.characters, id);
    if (!ch) return;
    ch.color = color; emit();
  };
  Store.removeCharacter = function (id, opts) {
    var idx = db.characters.findIndex(function (c) { return c.id === id; });
    if (idx < 0) return;
    db.characters.splice(idx, 1);
    if (opts && opts.keepRecords) {
      db.records.forEach(function (r) { if (r.characterId === id) r.characterId = null; });
    } else {
      db.records = db.records.filter(function (r) { return r.characterId !== id; });
    }
    emit();
  };

  /* ---------------------------------------------------- 分类 / 标签：增删改 --- */
  Store.addCategory = function (name) {
    name = String(name || '').trim();
    if (!name) return null;
    var used = db.categories.map(function (c) { return c.color; });
    var cat = newCategory(name, U.nextColor(used));
    db.categories.push(cat);
    emit();
    return cat;
  };
  Store.renameCategory = function (id, name) {
    name = String(name || '').trim();
    var cat = find(db.categories, id);
    if (!cat || !name) return false;
    cat.name = name; emit(); return true;
  };
  Store.removeCategory = function (id) {
    var cat = find(db.categories, id);
    if (!cat) return;
    var dead = {};
    cat.tags.forEach(function (t) { dead[t.id] = 1; });
    db.categories = db.categories.filter(function (c) { return c.id !== id; });
    db.records.forEach(function (r) {
      r.tagIds = r.tagIds.filter(function (t) { return !dead[t]; });
    });
    emit();
  };
  Store.addTag = function (catId, name) {
    name = String(name || '').trim();
    var cat = find(db.categories, catId);
    if (!cat || !name) return null;
    var n = name.toLowerCase();
    for (var i = 0; i < cat.tags.length; i++) if (cat.tags[i].name.trim().toLowerCase() === n) return cat.tags[i];
    var used = cat.tags.map(function (t) { return t.color; });
    var tag = newTag(name, U.nextColor(used));
    cat.tags.push(tag);
    emit();
    return tag;
  };
  Store.renameTag = function (tagId, name) {
    name = String(name || '').trim();
    var f = Store.findTag(tagId);
    if (!f || !name) return false;
    f.tag.name = name; emit(); return true;
  };
  Store.removeTag = function (tagId) {
    var f = Store.findTag(tagId);
    if (!f) return;
    f.category.tags = f.category.tags.filter(function (t) { return t.id !== tagId; });
    db.records.forEach(function (r) { r.tagIds = r.tagIds.filter(function (t) { return t !== tagId; }); });
    emit();
  };
  Store.moveTag = function (tagId, toCatId) {
    var f = Store.findTag(tagId);
    var to = find(db.categories, toCatId);
    if (!f || !to || f.category.id === toCatId) return false;
    f.category.tags = f.category.tags.filter(function (t) { return t.id !== tagId; });
    to.tags.push(f.tag);
    emit();
    return true;
  };
  Store.moveCategory = function (id, dir) {
    var i = db.categories.findIndex(function (c) { return c.id === id; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= db.categories.length) return;
    var tmp = db.categories[i];
    db.categories[i] = db.categories[j];
    db.categories[j] = tmp;
    emit();
  };

  /* -------------------------------------------------------- 记录：增删改 --- */
  Store.addRecords = function (input, items) {
    var t = Date.now();
    var groupId = input.groupId || uid('grp');
    var created = [];
    (items || [input]).forEach(function (it) {
      var rec = normalizeRecord({
        date: it.date || input.date,
        characterId: it.characterId,
        tagIds: it.tagIds || input.tagIds || [],
        time: it.time !== undefined ? it.time : input.time,
        count: it.count || input.count || 1,
        note: it.note !== undefined ? it.note : input.note,
        groupId: groupId,
        createdAt: t
      });
      if (rec) { db.records.push(rec); created.push(rec); }
    });
    if (!created.length) return [];
    sortRecords();
    emit();
    return created;
  };
  Store.updateRecord = function (id, patch) {
    var r = find(db.records, id);
    if (!r) return null;
    Object.keys(patch || {}).forEach(function (k) { r[k] = patch[k]; });
    var fixed = normalizeRecord(r);
    Object.keys(fixed).forEach(function (k) { r[k] = fixed[k]; });
    r.updatedAt = Date.now();
    sortRecords();
    emit();
    return r;
  };
  Store.removeRecord = function (id) {
    db.records = db.records.filter(function (r) { return r.id !== id; });
    emit();
  };
  Store.removeGroup = function (groupId) {
    db.records = db.records.filter(function (r) { return r.groupId !== groupId; });
    emit();
  };
  Store.removeRecords = function (ids) {
    var dead = {};
    ids.forEach(function (i) { dead[i] = 1; });
    db.records = db.records.filter(function (r) { return !dead[r.id]; });
    emit();
  };
  function sortRecords() {
    db.records.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var ta = a.time || '99:99', tb = b.time || '99:99';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  }

  Store.recordsOn = function (date) { return db.records.filter(function (r) { return r.date === date; }); };
  Store.recordsBetween = function (start, end) {
    return db.records.filter(function (r) { return r.date >= start && r.date <= end; });
  };
  Store.allTags = function () {
    var out = [];
    db.categories.forEach(function (c) { c.tags.forEach(function (t) { out.push({ tag: t, category: c }); }); });
    return out;
  };

  /* ------------------------------------------------- 使用频次（历史排序） --- */
  /** 角色/标签的历史使用统计，用于「从历史中选」时的排序与角标 */
  Store.usage = function () {
    if (usageCache) return usageCache;
    var chars = {}, tags = {};
    db.characters.forEach(function (c) { chars[c.id] = { id: c.id, count: 0, days: 0, last: '', tagIds: {} }; });
    Store.allTags().forEach(function (x) { tags[x.tag.id] = { id: x.tag.id, count: 0, last: '', categoryId: x.category.id }; });
    var seen = {};
    db.records.forEach(function (r) {
      if (r.characterId) {
        var c = chars[r.characterId];
        if (c) {
          c.count += r.count;
          var dk = r.characterId + '|' + r.date;
          if (!seen[dk]) { seen[dk] = 1; c.days++; }
          if (r.date > c.last) c.last = r.date;
          r.tagIds.forEach(function (t) { c.tagIds[t] = (c.tagIds[t] || 0) + r.count; });
        }
      }
      r.tagIds.forEach(function (t) {
        var x = tags[t];
        if (!x) return;
        x.count += r.count;
        if (r.date > x.last) x.last = r.date;
      });
    });
    usageCache = { chars: chars, tags: tags };
    return usageCache;
  };

  /* ------------------------------------------------------------ 导入导出 --- */
  Store.exportObject = function () {
    return {
      app: 'captain-log',
      schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      settings: db.settings,
      characters: db.characters,
      categories: db.categories,
      records: db.records
    };
  };
  Store.exportText = function () { return JSON.stringify(Store.exportObject(), null, 2); };

  /**
   * mode: 'replace' 覆盖全部 | 'merge' 合并（同名角色/分类/标签复用，重复记录跳过）
   */
  Store.importObject = function (raw, mode) {
    var incoming = normalize(raw);
    var stat = { characters: 0, categories: 0, tags: 0, records: 0, skipped: 0 };

    if (mode !== 'merge') {
      db.settings = incoming.settings;
      db.characters = incoming.characters;
      db.categories = incoming.categories;
      db.records = incoming.records;
      stat.characters = db.characters.length;
      stat.categories = db.categories.length;
      stat.tags = Store.allTags().length;
      stat.records = db.records.length;
      sortRecords();
      emit();
      return stat;
    }

    // ---- 合并：建立旧 id -> 新 id 的映射 ----
    var charMap = {};
    incoming.characters.forEach(function (c) {
      var exist = Store.findCharacterByName(c.name);
      if (!exist) {
        var used = db.characters.map(function (x) { return x.color; });
        exist = newCharacter(c.name, c.color || U.nextColor(used));
        db.characters.push(exist);
        stat.characters++;
      }
      charMap[c.id] = exist.id;
    });

    var catMap = {}, tagMap = {};
    incoming.categories.forEach(function (c) {
      var cat = null;
      for (var i = 0; i < db.categories.length; i++) {
        if (db.categories[i].name.trim().toLowerCase() === c.name.trim().toLowerCase()) { cat = db.categories[i]; break; }
      }
      if (!cat) {
        var usedC = db.categories.map(function (x) { return x.color; });
        cat = newCategory(c.name, c.color || U.nextColor(usedC));
        db.categories.push(cat);
        stat.categories++;
      }
      catMap[c.id] = cat.id;
      c.tags.forEach(function (t) {
        var tag = null;
        for (var j = 0; j < cat.tags.length; j++) {
          if (cat.tags[j].name.trim().toLowerCase() === t.name.trim().toLowerCase()) { tag = cat.tags[j]; break; }
        }
        if (!tag) {
          var usedT = cat.tags.map(function (x) { return x.color; });
          tag = newTag(t.name, t.color || U.nextColor(usedT));
          cat.tags.push(tag);
          stat.tags++;
        }
        tagMap[t.id] = tag.id;
      });
    });

    var sig = {};
    db.records.forEach(function (r) { sig[sigOf(r)] = 1; });
    incoming.records.forEach(function (r) {
      var rec = normalizeRecord({
        date: r.date,
        characterId: r.characterId ? (charMap[r.characterId] || null) : null,
        tagIds: r.tagIds.map(function (t) { return tagMap[t]; }).filter(Boolean),
        time: r.time, count: r.count, note: r.note, createdAt: r.createdAt
      });
      if (!rec) { stat.skipped++; return; }
      var s = sigOf(rec);
      if (sig[s]) { stat.skipped++; return; }
      sig[s] = 1;
      db.records.push(rec);
      stat.records++;
    });
    sortRecords();
    emit();
    return stat;

    function sigOf(r) {
      return [r.date, r.characterId || '-', r.time || '-', r.count, r.tagIds.slice().sort().join(',')].join('|');
    }
  };

  Store.clearAll = function () {
    db.characters = [];
    db.categories = [];
    db.records = [];
    emit();
  };
  Store.clearRecords = function () { db.records = []; emit(); };

  /* ------------------------------------------------------------ 示例数据 --- */
  Store.loadSample = function () {
    var chars = ['示例角色A', '示例角色B', '示例角色C', '示例角色D', '示例角色E', '示例角色F']
      .map(function (n) { return newCharacter(n); });

    function cat(name, tagNames) {
      var c = newCategory(name);
      c.tags = tagNames.map(function (t) { return newTag(t); });
      return c;
    }
    var cats = [
      cat('情境', ['睡前', '独处', '洗澡', '午休', '熬夜']),
      cat('地点', ['卧室', '客厅', '浴室', '公司', '外出']),
      cat('心情', ['放松', '兴奋', '压力大', '无聊', '上头'])
    ];

    var rnd = mulberry32(20240612);
    var today = U.D.todayKey();
    var recs = [];
    for (var back = 88; back >= 1; back--) {   // 特意不给"今天"造数据，方便演示今天记一笔 / 触发提醒
      var date = U.D.addDays(today, -back);
      var dow = U.D.dow(date);
      // 周末更多、整体约 38% 的天数有记录
      var p = dow === 0 || dow === 6 ? 0.55 : 0.30;
      if (rnd() > p) continue;
      var n = rnd() < 0.32 ? 2 : 1;
      for (var k = 0; k < n; k++) {
        var ch = chars[Math.floor(rnd() * chars.length)];
        var picked = [];
        cats.forEach(function (c) {
          if (rnd() < 0.75) picked.push(c.tags[Math.floor(rnd() * c.tags.length)].id);
        });
        var hourPool = [0, 0, 1, 7, 8, 12, 13, 21, 22, 22, 23, 23, 23, 20, 19];
        var hh = hourPool[Math.floor(rnd() * hourPool.length)];
        var mm = Math.floor(rnd() * 60);
        recs.push(normalizeRecord({
          date: date,
          characterId: ch.id,
          tagIds: picked,
          time: (rnd() < 0.9) ? (U.D.pad(hh) + ':' + U.D.pad(mm)) : null,
          count: 1,
          createdAt: Date.now() - back * 86400000 + k * 60000
        }));
      }
    }
    db.characters = chars;
    db.categories = cats;
    db.records = recs.filter(Boolean);
    sortRecords();
    emit();
    return { characters: chars.length, categories: cats.length, records: db.records.length };
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  load();
  g.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
