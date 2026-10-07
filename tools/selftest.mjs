/**
 * 机长日志 · 逻辑自测（零依赖，Node 直接跑）
 * 覆盖：日期工具 / 数据层 CRUD 与级联清理 / 统计口径 / 区间预设 / 导入导出
 *   node tools/selftest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------- 载入浏览器端脚本 --- */
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  navigator: {},
  location: { protocol: 'file:', hash: '', search: '' },
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {}, setAttribute() {} }),
    addEventListener() {},
    readyState: 'complete'
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

for (const f of ['js/util.js', 'js/kit.js', 'js/reminder-core.js', 'js/store.js', 'js/stats.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}

const { U, Store, Stats, ReminderCore: RC } = sandbox;
const D = U.D;

/* ------------------------------------------------------------ 断言 --- */
let pass = 0;
const failures = [];
function ok(cond, label, extra) {
  if (cond) { pass++; return; }
  failures.push(label + (extra !== undefined ? '  → 实际: ' + JSON.stringify(extra) : ''));
}
function eq(actual, expected, label) { ok(actual === expected, label, actual); }
function near(actual, expected, label) { ok(Math.abs(actual - expected) < 0.051, label, actual); }

/* --------------------------------------------------------- 日期工具 --- */
eq(D.key(D.date('2025-03-01')), '2025-03-01', '日期键往返一致');
eq(D.addDays('2025-02-28', 1), '2025-03-01', '跨月加一天');
eq(D.addDays('2024-02-28', 1), '2024-02-29', '闰年 2 月 29 日');
eq(D.startOfWeek('2025-03-05', 1), '2025-03-03', '周一为一周开始');
eq(D.startOfWeek('2025-03-02', 1), '2025-02-24', '周日归属上一周（周一起始）');
eq(D.startOfWeek('2025-03-02', 0), '2025-03-02', '周日为一周开始');
eq(D.dow('2025-03-01'), 6, '2025-03-01 是周六');
eq(D.daysInMonth('2025-02-10'), 28, '2 月天数');
eq(D.endOfMonth('2025-03-05'), '2025-03-31', '月末');
eq(D.each('2025-03-01', '2025-03-05').length, 5, '闭区间逐日');
eq(D.addMonths('2025-01-31', 1), '2025-02-01', '加月不溢出');
eq(D.hourOf('22:30'), 22, '解析小时');
eq(D.hourOf('abc'), -1, '非法时间返回 -1');
eq(D.isTime('7:05'), false, '单位数小时不合法');

/* ------------------------------------------------------ 数据层 CRUD --- */
Store.clearAll();
const settings = { today: '2025-03-05', weekStart: 1 };

const A = Store.addCharacter('角色A');
const B = Store.addCharacter('角色B');
eq(Store.addCharacter('角色A').id, A.id, '同名角色复用不重复创建');
eq(Store.get().characters.length, 2, '角色数量');

const cat1 = Store.addCategory('情境');
const cat2 = Store.addCategory('地点');
const t1 = Store.addTag(cat1.id, '睡前');
const t2 = Store.addTag(cat1.id, '独处');
const t3 = Store.addTag(cat2.id, '卧室');
eq(Store.addTag(cat1.id, '睡前').id, t1.id, '同分类同名标签去重');
eq(Store.get().categories.length, 2, '分类数量');

Store.addRecords({ date: '2025-03-01', tagIds: [t1.id], time: '22:30', count: 1, note: '第一次' }, [{ characterId: A.id }]);
Store.addRecords({ date: '2025-03-01', tagIds: [t1.id, t3.id], time: '23:10', count: 2 }, [{ characterId: B.id }]);
Store.addRecords({ date: '2025-03-02', tagIds: [], time: null, count: 1 }, [{ characterId: A.id }]);
Store.addRecords({ date: '2025-03-04', tagIds: [t2.id], time: '21:00', count: 3 }, [{ characterId: A.id }]);
Store.addRecords({ date: '2025-03-05', tagIds: [t3.id], time: '00:30', count: 1 }, [{ characterId: B.id }]);

// 一次多角色（同批）
const batch = Store.addRecords({ date: '2025-03-06', tagIds: [t1.id], time: '20:00', count: 1 }, [{ characterId: A.id }, { characterId: B.id }]);
eq(batch.length, 2, '多角色一次生成多条记录');
eq(batch[0].groupId, batch[1].groupId, '同批记录共享 groupId');

// 移除这批，保持后续断言口径不变
Store.removeRecords(batch.map((r) => r.id));
eq(Store.get().records.length, 5, '删除后记录数回到 5');

const usage = Store.usage();
eq(usage.chars[A.id].count, 5, '角色A 使用次数');
eq(usage.chars[A.id].days, 3, '角色A 有效天数');
eq(usage.chars[B.id].count, 3, '角色B 使用次数');
eq(usage.tags[t1.id].count, 3, '标签「睡前」次数');
eq(Store.recordsOn('2025-03-01').length, 2, '某天记录条数');

/* -------------------------------------------------------- 统计口径 --- */
const res = Stats.compute(Store.get().records, {
  start: '2025-03-01', end: '2025-03-05',
  characters: Store.get().characters, categories: Store.get().categories
});
eq(res.total, 8, '总次数');
eq(res.recCount, 5, '记录条数');
eq(res.totalDays, 5, '区间天数');
eq(res.activeDays, 4, '有记录天数');
eq(res.maxDay.date, '2025-03-01', '单日最高日期');
eq(res.maxDay.count, 3, '单日最高次数');
near(res.avgAll, 1.6, '自然日均');
near(res.avgActive, 2, '活跃日均');
eq(res.streak.longest, 2, '最长连续天数');
eq(res.streak.current, 2, '当前连续（从区间末尾往前数 03-05、03-04）');
eq(res.byDate['2025-03-01'], 3, '单日次数汇总');
eq(res.hours[21], 3, '21 点次数');
eq(res.hours[22], 1, '22 点次数');
eq(res.hours[23], 2, '23 点次数');
eq(res.hours[0], 1, '0 点次数');
eq(res.timedTotal, 7, '有时间的次数');
eq(res.noTimeCount, 1, '未填时间条数');
eq(res.buckets[0].count, 1, '凌晨桶');
eq(res.buckets[3].count, 6, '晚上桶');
near(res.buckets[3].share, 85.7, '晚上桶占比');
eq(res.weekdays[6], 3, '周六次数');
eq(res.weekdays[2], 3, '周二次数');
eq(res.chars.length, 2, '参与统计的角色数');
eq(res.chars[0].id, A.id, '角色排行第一');
eq(res.chars[0].count, 5, '角色排行第一的次数');
near(res.chars[0].share, 62.5, '角色占比');
eq(res.chars[1].count, 3, '角色排行第二的次数');
eq(res.cats[0].name, '情境', '分类排行第一');
eq(res.cats[0].count, 6, '分类次数（含任一标签）');
eq(res.cats[1].count, 3, '分类次数（地点）');
eq(res.tagRank[0].count, 3, '标签排行最高次数');
eq(res.matrix[A.id][cat1.id], 4, '交叉表 A×情境');
eq(res.matrix[B.id][cat2.id], 3, '交叉表 B×地点');
eq(res.months.length, 1, '月度分组数');
eq(res.months[0].count, 8, '月度次数');

// 分类的标签计数：cats[i].tags 是 map，直接取 .length 会得到 undefined（统计页曾经显示 "undefined 个标签"）
eq(res.cats[0].tagCount, 2, '分类：情境的标签总数');
eq(res.cats[0].tagUsed, 2, '分类：情境用到的标签数');
eq(res.cats[1].tagCount, 1, '分类：地点的标签总数');
eq(res.cats[1].tagUsed, 1, '分类：地点用到的标签数');
ok(Array.isArray(res.cats[0].tagList), '分类：tagList 是数组');
eq(typeof res.cats[0].tagCount, 'number', '分类：tagCount 是数字');
{
  // 未被使用过的标签：总数会涨，用到的数量不变
  const spare = Store.addTag(cat1.id, '从没用过的标签');
  const res2 = Stats.compute(Store.get().records, {
    start: '2025-03-01', end: '2025-03-05',
    characters: Store.get().characters, categories: Store.get().categories
  });
  const c1 = res2.cats.filter((c) => c.id === cat1.id)[0];
  eq(c1.tagCount, 3, '分类：新增未使用标签后 tagCount=3');
  eq(c1.tagUsed, 2, '分类：新增未使用标签后 tagUsed 仍为 2');
  ok(c1.tagList.every((t) => typeof t.count === 'number'), '分类：tagList 每项都有 count');
  // 统计页展示串里不能再出现 undefined
  const label = c1.tagCount + ' 个标签 · 用到的 ' + c1.tagUsed + ' 个';
  ok(label.indexOf('undefined') < 0, '分类：占比文案不含 undefined', label);
  Store.removeTag(spare.id);
}
const labelStr = res.cats[0].tagCount + ' 个标签 · 用到的 ' + res.cats[0].tagUsed + ' 个';
ok(labelStr.indexOf('undefined') < 0 && labelStr.indexOf('NaN') < 0, '分类：占比文案无脏值', labelStr);

/* --------------------------------------------------------- 区间预设 --- */
const rWeek = Stats.rangeFor('week', { today: '2025-03-05', weekStart: 1, records: Store.get().records });
eq(rWeek.start, '2025-03-03', '本周起始（周一）');
eq(rWeek.end, '2025-03-09', '本周结束（周日）');
const rYear = Stats.rangeFor('year', { today: '2025-03-05' });
eq(rYear.start, '2025-01-01', '本年度起始');
eq(rYear.end, '2025-12-31', '本年度结束');
const rQ = Stats.rangeFor('quarter', { today: '2025-03-05' });
eq(rQ.start, '2025-01-01', '本季度起始');
eq(rQ.end, '2025-03-31', '本季度结束');
const rLast30 = Stats.rangeFor('last30', { today: '2025-03-05' });
eq(rLast30.start, '2025-02-04', '近 30 天起始');
const rAll = Stats.rangeFor('all', { today: '2025-06-01', records: Store.get().records });
eq(rAll.start, '2025-03-01', '全部区间起始=最早记录');
eq(rAll.end, '2025-06-01', '全部区间结束=今天');

const yearRes = Stats.compute(Store.get().records, {
  start: rYear.start, end: rYear.end,
  characters: Store.get().characters, categories: Store.get().categories
});
eq(yearRes.total, 8, '年度统计总次数');

/* --------------------------------------------------------- 细分统计 --- */
const subA = Stats.breakdown(Store.get().records, { start: '2025-03-01', end: '2025-03-05' }, { type: 'character', id: A.id }, {
  characters: Store.get().characters, categories: Store.get().categories
});
eq(subA.total, 5, '角色细分次数');
eq(subA.activeDays, 3, '角色细分天数');
const subT1 = Stats.breakdown(Store.get().records, { start: '2025-03-01', end: '2025-03-05' }, { type: 'tag', id: t1.id }, {
  characters: Store.get().characters, categories: Store.get().categories
});
eq(subT1.total, 3, '标签细分次数');
const subCat2 = Stats.breakdown(Store.get().records, { start: '2025-03-01', end: '2025-03-05' }, { type: 'category', id: cat2.id }, {
  characters: Store.get().characters, categories: Store.get().categories
});
eq(subCat2.total, 3, '分类细分次数');

/* ------------------------------------------------------- 摘要文本 --- */
const summary = Stats.summaryText(res);
ok(summary.includes('总次数：8'), '摘要含总次数');
ok(summary.includes('角色A'), '摘要含角色排行');
ok(summary.includes('睡前'), '摘要含标签排行');

/* ----------------------------------------------------- 级联删除正确性 --- */
const before = Store.get().records.filter((r) => r.tagIds.includes(t3.id)).length;
eq(before, 2, '标签「卧室」被引用的记录数');
Store.removeTag(t3.id);
eq(Store.get().records.filter((r) => r.tagIds.includes(t3.id)).length, 0, '删除标签后记录不再引用');
eq(Store.get().records.length, 5, '删除标签不影响记录条数');

Store.removeCategory(cat1.id);
eq(Store.get().records.filter((r) => r.tagIds.includes(t1.id)).length, 0, '删除分类后标签引用被清理');
eq(Store.get().categories.length, 1, '分类删除生效');

Store.removeCharacter(B.id);
eq(Store.get().records.filter((r) => r.characterId === B.id).length, 0, '删除角色级联删除其记录');
eq(Store.get().records.length, 3, '删除角色后剩余记录数');

/* ------------------------------------------------------- 导入导出 --- */
Store.clearAll();
const s = Store.loadSample();
ok(s.records > 20, '示例数据条数合理', s.records);
const exported = Store.exportText();
const parsed = JSON.parse(exported);
eq(parsed.app, 'captain-log', '导出文件标识');
eq(parsed.records.length, s.records, '导出记录条数一致');

Store.clearAll();
const imp1 = Store.importObject(parsed, 'replace');
eq(imp1.records, s.records, '覆盖导入记录数');
eq(Store.get().characters.length, parsed.characters.length, '覆盖导入角色数');
const imp2 = Store.importObject(parsed, 'merge');
eq(imp2.records, 0, '重复合并导入不新增记录');
eq(imp2.skipped, s.records, '重复合并导入全部跳过');

/* ----------------------------------------------------------- 提醒逻辑 --- */
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0, 0);
const everyDay = RC.normalize({ enabled: true, time: '23:00', weekdays: [0, 1, 2, 3, 4, 5, 6] });
const rt = (over) => Object.assign({ hasRecord: false, lastNotifiedDate: '', skipDate: '', snoozeUntil: 0 }, over || {});

eq(RC.keyOf(at(2025, 3, 5, 23, 30)), '2025-03-05', '提醒：本地日期键');
eq(RC.parseTime('07:05'), 425, '提醒：解析时间');
eq(RC.parseTime('25:00', 60), 60, '提醒：非法时间回落');
eq(RC.nowMinutes(at(2025, 3, 5, 23, 30)), 1410, '提醒：当前分钟数');

eq(RC.shouldNotify(everyDay, rt(), at(2025, 3, 5, 22, 59)).notify, false, '提醒：未到点不提醒');
eq(RC.shouldNotify(everyDay, rt(), at(2025, 3, 5, 22, 59)).reason, 'not-yet', '提醒：原因=not-yet');
eq(RC.shouldNotify(everyDay, rt(), at(2025, 3, 5, 23, 0)).notify, true, '提醒：到点提醒');
eq(RC.shouldNotify(everyDay, rt(), at(2025, 3, 5, 23, 0)).reason, 'scheduled', '提醒：原因=scheduled');
eq(RC.shouldNotify(everyDay, rt(), at(2025, 3, 5, 23, 59)).notify, true, '提醒：过点仍提醒');
eq(RC.shouldNotify(everyDay, rt({ hasRecord: true }), at(2025, 3, 5, 23, 30)).notify, false, '提醒：今天已起飞不提醒');
eq(RC.shouldNotify(everyDay, rt({ hasRecord: true }), at(2025, 3, 5, 23, 30)).reason, 'already-recorded', '提醒：原因=already-recorded');
eq(RC.shouldNotify(everyDay, rt({ lastNotifiedDate: '2025-03-05' }), at(2025, 3, 5, 23, 30)).notify, false, '提醒：同一天只提醒一次');
eq(RC.shouldNotify(everyDay, rt({ lastNotifiedDate: '2025-03-04' }), at(2025, 3, 5, 23, 30)).notify, true, '提醒：昨天提醒过今天还能提醒');
eq(RC.shouldNotify(everyDay, rt({ skipDate: '2025-03-05' }), at(2025, 3, 5, 23, 30)).notify, false, '提醒：今天不提醒');
eq(RC.shouldNotify(RC.normalize({ enabled: false }), rt(), at(2025, 3, 5, 23, 30)).notify, false, '提醒：未开启不提醒');

// 稍后提醒
const snoozed = rt({ lastNotifiedDate: '2025-03-05', snoozeUntil: at(2025, 3, 5, 23, 30).getTime() });
eq(RC.shouldNotify(everyDay, snoozed, at(2025, 3, 5, 23, 10)).notify, false, '稍后提醒：窗口内不打扰');
eq(RC.shouldNotify(everyDay, snoozed, at(2025, 3, 5, 23, 10)).reason, 'snoozed', '稍后提醒：原因=snoozed');
eq(RC.shouldNotify(everyDay, snoozed, at(2025, 3, 5, 23, 31)).notify, true, '稍后提醒：到点再提醒');
eq(RC.shouldNotify(everyDay, snoozed, at(2025, 3, 5, 23, 31)).reason, 'snooze', '稍后提醒：原因=snooze');
eq(RC.shouldNotify(everyDay, rt({ hasRecord: true, snoozeUntil: at(2025, 3, 5, 23, 30).getTime() }), at(2025, 3, 5, 23, 31)).notify, false, '稍后提醒：期间已起飞则不再提醒');

// 只在某些星期提醒（2025-03-05 周三 / 03-07 周五 / 03-08 周六）
const workday = RC.normalize({ enabled: true, time: '09:00', weekdays: [1, 2, 3, 4, 5] });
eq(RC.shouldNotify(workday, rt(), at(2025, 3, 7, 9, 30)).notify, true, '工作日提醒：周五提醒');
eq(RC.shouldNotify(workday, rt(), at(2025, 3, 8, 9, 30)).notify, false, '工作日提醒：周六不提醒');
eq(RC.shouldNotify(workday, rt(), at(2025, 3, 8, 9, 30)).reason, 'not-reminder-day', '工作日提醒：原因=not-reminder-day');

// 提醒条（应用内）
eq(RC.bannerDue(everyDay, rt({ lastNotifiedDate: '2025-03-05' }), at(2025, 3, 5, 23, 30)), true, '提醒条：提醒过也继续显示');
eq(RC.bannerDue(everyDay, rt({ hasRecord: true }), at(2025, 3, 5, 23, 30)), false, '提醒条：已起飞不显示');
eq(RC.bannerDue(everyDay, rt(), at(2025, 3, 5, 22, 0)), false, '提醒条：未到点不显示');
eq(RC.bannerDue(everyDay, snoozed, at(2025, 3, 5, 23, 10)), false, '提醒条：稍后窗口内隐藏');
eq(RC.bannerDue(everyDay, snoozed, at(2025, 3, 5, 23, 40)), true, '提醒条：稍后到点重新出现');

// 距下次提醒时长
eq(RC.msUntilNextTarget(RC.normalize({ enabled: true, time: '23:00' }), at(2025, 3, 5, 22, 0)), 3600000, '提醒：距下次提醒 1 小时');
eq(RC.msUntilNextTarget(RC.normalize({ enabled: true, time: '23:00' }), at(2025, 3, 5, 23, 30)), 84600000, '提醒：已过点则约到明天');
eq(RC.msUntilNextTarget(RC.normalize({ enabled: true, time: '09:00', weekdays: [1] }), at(2025, 3, 7, 10, 0)) > 0, true, '提醒：只挑提醒日');
eq(RC.msUntilNextTarget(RC.normalize({ enabled: false }), at(2025, 3, 5, 10, 0)), -1, '提醒：未开启无定时');

// 描述与容错
eq(RC.describe(RC.normalize({ weekdays: [0, 1, 2, 3, 4, 5, 6], time: '08:30' })), '每天 08:30', '提醒：描述=每天');
eq(RC.describe(RC.normalize({ weekdays: [1, 2, 3, 4, 5], time: '23:00' })), '工作日 23:00', '提醒：描述=工作日');
eq(RC.describe(RC.normalize({ weekdays: [0, 6], time: '23:00' })), '周末 23:00', '提醒：描述=周末');
eq(RC.normalize({ weekdays: [3, 3, 9, -1, 'x'], time: '25:00', snoozeMinutes: 999 }).weekdays.join(','), '3', '提醒：星期去重过滤');
eq(RC.normalize({ time: '25:00' }).time, '23:00', '提醒：非法时间回落默认值');
eq(RC.normalize({ snoozeMinutes: 999 }).snoozeMinutes, 240, '提醒：稍后间隔上限');
eq(RC.normalize(null).enabled, false, '提醒：默认关闭');
eq(RC.hasRecordOn([{ date: '2025-03-05', count: 0 }, { date: '2025-03-05', count: 2 }], '2025-03-05'), true, '提醒：判断当天是否已起飞');
eq(RC.hasRecordOn([], '2025-03-05'), false, '提醒：空记录未起飞');

// 配置随数据一起持久化
Store.patchReminder({ enabled: true, time: '07:30', weekdays: [1, 2] });
eq(Store.get().settings.reminder.time, '07:30', '提醒：写入设置');
const roundTrip = JSON.parse(Store.exportText());
eq(roundTrip.settings.reminder.weekdays.join(','), '1,2', '提醒：导出保留提醒设置');
Store.importObject(roundTrip, 'replace');
eq(Store.get().settings.reminder.time, '07:30', '提醒：导入保留提醒设置');
eq(Store.get().settings.reminder.enabled, true, '提醒：导入保留开关');

/* --------------------------------------------------------------- 输出 --- */
console.log(`\n通过 ${pass} 项断言`);
if (failures.length) {
  console.log(`失败 ${failures.length} 项：`);
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
