# 机长日志 · 起飞统计

一个**只存在你自己设备上**的起飞记录 + 统计工具，Web 版（可直接装到安卓桌面当 App 用）。

- 📅 **日历视图**：像日历一样看每个月，有记录的日子会显示次数和彩色条（颜色=标签/角色）
- ➕ **点某一天就记一笔**：选角色（可多选，一次给多个角色记同一批）→ 按分类打标签 → 补时间、次数、备注
- 🏷️ **角色 / 分类标签都能现建**：也能从历史里挑，候选按**使用次数**排序，还带次数角标
- ⏰ **起飞提醒**：每天到设定时间，如果当天还没有起飞记录就提醒你（已记录则完全不打扰）；
  支持按星期几重复、「稍后 N 分钟」、「今天不提醒」，能弹到系统状态栏/通知栏
- 📊 **统计**：选一个时间段（本周 / 本月 / 本季度 / **本年度** / 近30天 / 近90天 / 全部 / 自定义），看：
  - 概览：总次数、有记录天数、活跃日均、单日最高、最长连续、当前连续、活跃角色数
  - **角色排行**（次数、占比、天数、日均；点进去看该角色的时间分布）
  - **分类标签排行**（分类占比 + 分类内标签排行）
  - **时间分布**（凌晨/上午/下午/晚上四宫格、24 小时、星期、星期×时段热力、月度趋势）
  - **全年热力图**（点格子直接跳去那天补记）+ 高频日 TOP8
  - **角色 × 分类 交叉表**
  - 一键「复制统计摘要」，直接粘贴给别人看
- 💾 **数据管理**：导出/导入 JSON、载入示例数据、一键清空
- 🌓 深色/浅色主题、每周起始日可设（周一/周日）
- 📴 离线可用（Service Worker 缓存），**不联网、不上传、无账号**

---

## 一、怎么跑起来

### 方式 1：最简单（双击就能用）
直接用浏览器打开 `index.html`。
> 限制：`file://` 下 Service Worker（离线缓存）和「安装到桌面」不可用，其它功能都正常；`localStorage` 在部分浏览器下对 `file://` 有限制，会退化成"关掉页面就丢数据"。**长期用请用方式 2。**

### 方式 2：本地服务（推荐，支持 PWA / 安装到桌面）
```powershell
cd captain-log
node tools/serve.mjs 4380     # 或者 npm run serve
# 浏览器打开 http://127.0.0.1:4380/
```

### 方式 3：扔到任意静态服务器 / 对象存储
全是静态文件，整目录上传即可（Nginx、GitHub Pages、内网 HTTP 服务都行）。

### 手机上怎么用（安卓）
1. 手机和电脑连同一个 WiFi；
2. 电脑上执行（让服务监听所有网卡）：
   ```powershell
   $env:HOST='0.0.0.0'; node tools/serve.mjs 4380
   ```
3. 手机浏览器打开 `http://<电脑局域网IP>:4380/`；
4. Chrome 菜单 → **添加到主屏幕**，之后就像独立 App 一样全屏打开，断网也能用。
   （注意：Service Worker 只在 `http://localhost` 或 https 下生效，局域网 IP 属于非安全上下文，安装与离线缓存可能受限。想要完整体验就走下面的 APK 打包。）

---

## 二、基本用法

| 想干什么 | 怎么做 |
| --- | --- |
| 记今天 | 底部右下角「＋ 记一笔」，或点今天日期的格子 |
| 补记以前某天 | 日历里点那天 → 「＋ 添加起飞记录」（日期可以改） |
| 一次记多个角色 | 编辑器里多选角色，会生成同批次的多条记录（共享时间/标签） |
| 新建角色 | 编辑器里直接输入名称 → 「新增」，会自动选中 |
| 新建标签 | 分类右上角「＋ 标签」；也可以在设置页里批量维护 |
| 快速复用上次 | 当天面板 →「复制最近一次（快速补录）」 |
| 修改/删除 | 当天面板里每条记录右上角的 ✎ / 🗑（同批次可整批改/删） |
| 看统计 | 底部「统计」→ 先选时间段（默认**本年度**）→ 切换子视图 |
| 开提醒 | 设置 → 起飞提醒 → 打开开关、设时间（见第三节） |
| 备份数据 | 设置 → 数据管理 →「导出 JSON 文件」 |
| 试用看看 | 设置 →「载入示例数据」（会替换当前数据，先导出备份） |

**建议的标签体系**（分类可以自己加，下面是官方示例数据的思路）：
- 情境：睡前 / 独处 / 洗澡 / 午休 / 熬夜
- 地点：卧室 / 客厅 / 浴室 / 公司 / 外出
- 心情：放松 / 兴奋 / 压力大 / 无聊 / 上头

---

## 三、起飞提醒（含状态栏通知）

**做了什么**：到点如果当天还没有起飞记录，就提醒你一次「该起飞了」；已经记过就一声不响。
默认**关闭**，在「设置 → 起飞提醒」里打开。

可配置项：

| 选项 | 说明 |
| --- | --- |
| 开启定时提醒 | 总开关（默认关） |
| 提醒时间 | 默认 `23:00`，可改 |
| 重复 | 勾选周几提醒（周一~周日），一天都不选 = 不提醒 |
| 仅在今天还没有记录时提醒 | 默认开启；关掉就变成"到点必提醒" |
| 「稍后提醒」间隔 | 10 / 15 / 30 / 60 / 120 分钟 |
| 通知通道 | 显示权限状态，可「开启系统通知」「发一条测试提醒」 |

到点后除了系统通知，应用内顶部还会出现一条提醒条：**记一笔 / 稍后 30 分钟 / ✕（今天不提醒）**。

### 三条提醒通道（自动按可用性降级）

| 通道 | 什么时候生效 | 准点程度 |
| --- | --- | --- |
| ① 安卓原生本地通知（Capacitor） | **打成 APK 后**，由系统闹钟触发，App 关着也能响 | ✅ 精确到点 |
| ② 系统通知 / Service Worker 通知 | 页面开着（含后台标签页）时，弹到状态栏/通知栏 | ✅ 基本准时（后台标签页定时器可能被浏览器节流到约 1 分钟） |
| ③ 应用内提醒条 + 轻提示 | 前面都不行时（没授权、浏览器不支持） | 打开应用就能看到，不会静默丢失 |

另外，Chrome 安卓在**「添加到主屏幕」之后**支持 `periodic background sync`：完全关掉浏览器后，
系统会在它认为合适的时候唤醒 Service Worker 补一次检查（页面把提醒状态写进 Cache，SW 读同一份状态判断）。
**这条是尽力而为，频率由浏览器决定，不保证准点**——它只是"漏提醒"的兜底。

> 想要"App 关着也能准点响"，正解是打包成安卓 APK 用系统本地通知（见第七节）：
> `js/reminder.js` 里已经写好了原生通道（`applyNativeSchedule`），装上
> `@capacitor/local-notifications` 并 `npx cap sync` 后就会自动接管，网页侧逻辑不用改。

**一个诚实的边界**：纯网页 + 没有推送服务器的情况下，浏览器**不会**在页面完全关闭时被定时唤醒。
所以 Web 版能做到的是「页面开着时准点」+「下次打开时补提醒」+「后台同步尽力补」，不是 100% 准点。这一课只有 APK 能补。

---

## 四、深链接（可以做成桌面快捷方式）

地址栏 `#` 后面支持这些参数（用 `&` 连接）：

| 参数 | 作用 | 例子 |
| --- | --- | --- |
| `demo` | 载入示例数据（首次体验用） | `index.html#demo` |
| `tab` | 直达标签页：`calendar` / `stats` / `settings` | `index.html#tab=stats` |
| `sub` | 统计页子视图：`rank` / `cat` / `time` / `heat` / `cross` | `index.html#tab=stats&sub=heat` |
| `date` | 直接打开某一天的面板 | `index.html#date=2025-06-12` |
| `add` | 直接打开「记一笔」 | `index.html#add` |
| `reminder` | `1` = 用 00:00 打开提醒方便看效果；`0` = 强制关掉 | `index.html#demo&reminder=1` |

例：`index.html#demo&tab=stats&sub=time`

---

## 五、数据存在哪 / 长什么样

- 存储：浏览器 `localStorage`，键名 `captain-log:db:v1`（**只在本机，不上传**）
- 导出的 JSON 结构：

```jsonc
{
  "app": "captain-log",
  "schema": 1,
  "settings": {
    "weekStart": 1,
    "theme": "dark",
    "reminder": { "enabled": true, "time": "23:00", "weekdays": [0,1,2,3,4,5,6],
                  "onlyIfNoRecord": true, "snoozeMinutes": 30, "lastNotifiedDate": "2025-06-12" }
  },
  "characters": [{ "id": "ch_x", "name": "角色A", "color": "#7c6cff" }],
  "categories": [{ "id": "cat_x", "name": "情境", "color": "#22d3ee",
                   "tags": [{ "id": "tag_x", "name": "睡前", "color": "#34d399" }] }],
  "records": [{ "id": "rec_x", "date": "2025-06-12", "characterId": "ch_x",
                "tagIds": ["tag_x"], "time": "23:10", "count": 1,
                "note": "", "groupId": "grp_x" }]
}
```

> 统计口径：「次数」= 每条记录 `count` 之和；「天数」= 去重日期数；时段分布只统计填了时间的记录（没填的会单独提示条数）；含多分类标签的记录在每个分类里都会各计一次。

---

## 六、目录结构

```
captain-log/
├── index.html                 入口（普通 <script>，不用打包器，file:// 也能开）
├── manifest.webmanifest       PWA 清单
├── sw.js                      Service Worker（离线缓存 + 提醒的后台同步通道）
├── capacitor.config.json      以后打包安卓用的 Capacitor 配置
├── css/styles.css             全部样式（深/浅双主题）
├── js/
│   ├── util.js                DOM/日期/颜色工具 + 弹层(toast/sheet/dialog)
│   ├── kit.js                 通用组件（排行条、柱状图、统计卡、分段控件…）
│   ├── reminder-core.js       提醒判断逻辑（纯函数，页面与 SW 共用，可被自测覆盖）
│   ├── store.js               数据层：CRUD + localStorage + 导入导出 + 示例数据
│   ├── stats.js               统计层：纯函数（区间、排行、时段、热力、交叉表）
│   ├── view-editor.js         起飞记录编辑器（新建/编辑/整批）
│   ├── view-calendar.js       日历视图 + 当日记录面板
│   ├── view-stats.js          统计视图
│   ├── view-settings.js       设置视图（角色/分类标签/提醒/数据/偏好）
│   ├── reminder.js            提醒引擎（通知通道、提醒条、稍后提醒、原生调度）
│   └── app.js                 应用外壳（标签页、主题、返回键、PWA 安装、首次引导）
├── icons/                     图标（icon.svg + 由脚本生成的 PNG）
├── android/                   Capacitor 安卓工程（原生提醒、图标、签名都在这里）
│   ├── app/src/main/java/com/captainlog/app/
│   │   ├── MainActivity.java        桥接 Activity（注册提醒插件、处理点通知进来）
│   │   ├── ReminderPlugin.java      网页调用的原生插件 CaptainReminder
│   │   ├── ReminderScheduler.java   提醒配置持久化 + 闹钟排程
│   │   ├── ReminderReceiver.java    到点弹通知，并自动约明天
│   │   └── BootReceiver.java        重启/覆盖安装后重新排程
│   ├── release.keystore       release 签名证书（务必备份，别丢！已被 .gitignore 忽略）
│   └── keystore.properties    签名密码（务必备份，别外传；已被忽略，模板见 .example）
├── .gitignore                 忽略规则（凭据 / 构建产物 / 临时文件）
├── release/                   打好的 APK 输出目录（已被忽略）
└── tools/
    ├── serve.mjs              零依赖静态服务器
    ├── selftest.mjs           逻辑自测（148 项断言，node 直接跑）
    ├── make-icons.mjs         纯 Node 手写 PNG 生成图标（PWA + 安卓，无第三方库）
    ├── verify-render.ps1      用 headless Chrome 抓真实 DOM 做渲染自检
    ├── layout-probe.html      排版探针：量编辑页各控件的真实像素宽，防止再被挤变形
    ├── check-gitignore.ps1    真跑一遍 git init/add，确认密钥没被提交、源码没被误伤
    └── build-apk.ps1          一条命令出 release APK（同步资源 → 构建 → 校验签名/资源/权限）
```

---

## 七、自测 / 校验

```powershell
npm test          # 逻辑自测：日期、级联删除、统计口径、导入导出、提醒规则（148 项断言）
npm run icons     # 重新生成图标（PWA + 安卓各密度 + 启动图）
npm run verify    # 先起 npm run serve，再跑：真实浏览器渲染 11 个场景并断言关键节点
npm run gitcheck  # 检查 .gitignore：密钥/产物不会被提交，源码不会被误伤
npm run apk       # 打 release APK（含签名 / 资源一致性 / 权限校验）
```

> 改了 `js/` 或 `css/` 之后想让手机上立刻生效：把 `sw.js` 顶部的 `CACHE = 'captain-log-v2'` 版本号加一（例如 `v3`），
> 否则 Service Worker 会先命中旧缓存，刷新两次才更新。（APK 里不注册 SW，不受这条影响。）

`npm run verify` 会依次检查：日历页、统计页 5 个子视图、设置页、提醒条（开/关两种状态）、当日面板、记一笔编辑器，
并检查页面里没有 `NaN/undefined` 脏数据和 JS 报错。每轮用全新的浏览器配置，保证断言不受上一轮 localStorage 影响。

排版问题（控件被挤扁、错位、溢出）用排版探针量真实像素：

```powershell
# 先 npm run serve，然后（模拟手机面板宽度 360 / 280，桌面则不带 panel 参数）
& $chrome --headless=new --window-size=900,1000 --virtual-time-budget=4000 --dump-dom `
  "http://127.0.0.1:4380/tools/layout-probe.html?panel=360"
# 输出里找 RESULT 段：日期列 / 时间列 / 时间框 的实际宽高 + 是否有溢出
```

> 编辑页的「日期 / 时间」一行曾把时间框挤到 62px（图标都被压成 9px）。现在时间列用
> `flex: 1 1 270px`，放不下就整列换行；窄屏下时间框实测 196px（360 面板）/ 116px（280 面板），不再变形。

---

## 八、安卓 APK

**产物**：`release/机长日志-v1.0.0-release.apk`（约 3.1 MB，已用 release 证书签名）

一条命令重建（会先把 web 代码同步进 Android 工程，再构建并校验）：

```powershell
npm run apk
# 或： powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-apk.ps1
```

脚本会做 5 件事，任何一步不通过就直接失败，避免出"装上去还是旧代码"的包：

1. 把 web 资源同步进 `android/app/src/main/assets/public`（先清空再拷，绝不留旧文件）
2. `gradlew assembleRelease`（离线，用本机 `.gradle-home` 缓存）
3. 校验 APK 已签名（apksigner）
4. **逐文件比对 APK 内的 web 资源与仓库源码的 SHA-256** —— 防止打包了过期前端
5. 用 aapt2 检查包名/版本/中文应用名/权限，以及 `ReminderReceiver`、`BootReceiver` 确实进了清单

### 装到手机

1. 把 `release/机长日志-v1.0.0-release.apk` 传到手机（微信/QQ/数据线都行）；
2. 点击安装，系统若提示"未知来源"，允许本次安装即可；
3. 首次打开 → 设置 → 起飞提醒 → 打开开关，系统会弹**通知权限**，允许；
4. 想让它**精确到点**：Android 12+ 到「系统设置 → 应用 → 机长日志 → 闹钟和提醒」里允许（不允许也能响，只是可能差几分钟）。

### 签名（很重要，别丢）

| 项 | 值 |
| --- | --- |
| keystore | `android/release.keystore` |
| 别名 alias | `captain-log` |
| 密码 | 见 `android/keystore.properties`（本机文件，别外传） |
| 有效期 | 30 年 |
| 证书 SHA-256 | `4d9f6e82f26a2bb67c3b714db69aaad932d46dcee35f9d9f291556763983086e` |

> - **备份 `android/release.keystore` + `android/keystore.properties`**。丢了这份证书，就没法给已安装的 App 覆盖升级，只能卸载重装（数据会没）。
> - 升级版本：改 `android/app/build.gradle` 里的 `versionCode`（每次 +1）和 `versionName`，重新 `npm run apk`。
> - 升级前建议先在 App 里「设置 → 导出 JSON」备份一次。

### 原生提醒是怎么做到"App 关着也能响"的

```
网页（js/reminder.js applyNativeSchedule）
   └─ 调用原生插件 Capacitor.Plugins.CaptainReminder.schedule({ atMs })
        └─ ReminderPlugin → ReminderScheduler → AlarmManager 排一个系统闹钟
             └─ 到点 ReminderReceiver 弹通知（通知渠道 captain-reminder）
                  └─ 再自动排明天的闹钟；重启手机由 BootReceiver 重新排
点通知 → MainActivity 收到 openAdd 标记 → 网页弹出「记一笔」
```

- 「今天已经起飞过就不提醒」：数据在 WebView 里、原生读不到，所以网页侧**每次记录/开关变化都会重新排程**（今天已记录 → 直接改约到明天）；
- Android 12+ 没给"闹钟和提醒"权限时自动退化为非精确闹钟（`setAndAllowWhileIdle`），不报错、只是可能晚几分钟；
- 通知小图标是专门生成的白底透明 PNG（`ic_stat_reminder`），状态栏显示正常不变形。

### 已知限制（诚实说明）

- 本环境没有模拟器/真机，**APK 的运行时行为没法端到端验证**：已验证的是构建成功、签名有效、资源与源码一致、权限与 Receiver 正确打入清单；"闹钟到点真的响"需要你在手机上实测一次（可以在设置里用「发一条测试提醒」先验证通知通道）。
- APK 内数据存在 WebView 的 localStorage 里，卸载或清除应用数据会丢，请定期导出 JSON 备份。

---

## 九、版本管理（.gitignore 与不能公开的文件）

### 绝对不能公开的两个文件

| 文件 | 里面是什么 | 泄露 / 丢失的后果 |
| --- | --- | --- |
| `android/release.keystore` | **release 签名私钥** | 泄露 → 别人能伪造"你的升级包"；丢失 → 没法给已安装的 App 覆盖升级 |
| `android/keystore.properties` | 签名密码（明文） | 同上（两者一起拿到才有用，但都别外传） |

两个都已被 `.gitignore` 忽略（仓库根一份 + `android/` 一份，双重保险）。
**请把它们另存到你自己的私密位置备份**（密码管理器 / 加密盘）；仓库里只保留不含密码的
`android/keystore.properties.example` 作为模板。

### 忽略规则（三类）

```gitignore
# A. 凭据 / 私钥（绝不能提交）
android/release.keystore   android/keystore.properties   *.keystore  *.jks  *.p12  *.pem  *.key
local.properties           google-services.json          .env  .npmrc
!android/keystore.properties.example        # 不含密码的模板要提交

# B. 依赖与构建产物（脚本能重建）
node_modules/   release/   build/   .gradle/   *.apk  *.aab  *.dex  *.class
android/app/src/main/assets/public/         # 构建时整份重新拷贝的 web 副本

# C. 开发 / 自测临时文件
.verify/  .verify-profile-*/  .probe-*  .p-*  .chrome-profile/  *.log  .DS_Store  .idea/  .vscode/
```

### 有意偏离 Capacitor 模板的三处（都有原因）

| 项 | 模板默认 | 本项目 | 为什么 |
| --- | --- | --- | --- |
| `android/app/src/main/assets/public/` | 忽略 | **保持忽略** | 由 `tools/build-apk.ps1` 每次构建整份重拷；提交副本极易把旧前端打进新 APK（本项目真踩过：新包里裹了旧包） |
| `android/capacitor-cordova-android-plugins/` | 忽略 | **改为提交** | 本项目不走 `cap sync`（离线），而 `settings.gradle` 会 include 它、`app/capacitor.build.gradle` 会 apply 它里面的 `cordova.variables.gradle`，缺失直接构建失败；它只有 2KB 配置、无敏感信息 |
| `assets/capacitor.config.json`、`capacitor.plugins.json`、`res/xml/config.xml` | 忽略 | **改为提交** | 同上：不走 `cap sync`，这三份是手工维护、运行时要用到的配置（`appId`/`appName` 就写在里面） |

### 验证（不是靠眼看）

```powershell
npm run gitcheck
```

它会把项目**复制到临时目录、真的跑一遍 `git init` + `git add -A`**，然后断言：
① 两个密钥没被追踪；② `node_modules/`、`release/`、`assets/public/`、构建产物与临时文件都没被追踪；
③ 项目需要的文件一个都没被误伤（漏提交）。当前结果：**99 个文件被追踪、0 个问题**。

### 从零恢复构建环境

`node_modules/` 和 `assets/public/` 被忽略，所以新机器上按这个顺序来：

```powershell
# 1) 恢复 Capacitor 原生库：npm i @capacitor/android（或从同目录 ops-inspection 复制）
#    android/capacitor.settings.gradle 指向 ../node_modules/@capacitor/android/capacitor
# 2) 重新生成安卓图标 / 启动图 / 通知图标
npm run icons
# 3) 一条命令出包（会自动把 web 代码同步进 android/app/src/main/assets/public）
npm run apk
```

> 仓库根若在更上层（例如把整个 `需求开发/` 建成仓库），嵌套的 `.gitignore` 依然生效，
> 但那样会把 `android-sdk/`、`.gradle-home/`、`.android-dl/`、`.npm-cache/` 等工具链目录也纳入
> 版本控制范围。建议只把 `captain-log/` 作为仓库根；若确实要放上层，需在上层再补一份忽略规则。

---

## 十、隐私

- 没有账号、没有后端、没有埋点，所有数据都在本机浏览器里
- 页面不发起任何网络请求（Service Worker 只缓存自己的静态文件）
- 导出/导入全靠你自己手动操作的文件
