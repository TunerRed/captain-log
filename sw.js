/* ============================================================================
 * 机长日志 · Service Worker（离线缓存 + 提醒的后台通道）
 * 策略：
 *   - 安装时预缓存应用外壳
 *   - 页面导航：网络优先，失败回落缓存（保证更新后不会一直看旧界面）
 *   - 其它同源 GET：缓存优先 + 后台更新
 * 提醒：
 *   - 页面把提醒状态写进 Cache（captain-log-reminder），SW 读同一份状态做判断
 *   - periodic background sync（Chrome 安卓，已安装到桌面时可用，频率由浏览器决定）
 *   - 通知点击回到应用并直接打开「记一笔」
 * ==========================================================================*/
importScripts('js/reminder-core.js');

const CACHE = 'captain-log-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/util.js',
  './js/kit.js',
  './js/reminder-core.js',
  './js/store.js',
  './js/stats.js',
  './js/view-editor.js',
  './js/view-calendar.js',
  './js/view-stats.js',
  './js/view-settings.js',
  './js/reminder.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

/* ------------------------------------------------------------ 提醒通道 --- */
const REMINDER_CACHE = 'captain-log-reminder';
const REMINDER_STATE = 'captain-log-reminder-state.json';
const PERIODIC_TAG = 'captain-log-reminder';

async function readReminderState() {
  try {
    const cache = await caches.open(REMINDER_CACHE);
    const res = await cache.match(REMINDER_STATE);
    return res ? await res.json() : null;
  } catch (e) { return null; }
}

async function writeReminderState(state) {
  try {
    const cache = await caches.open(REMINDER_CACHE);
    await cache.put(REMINDER_STATE, new Response(JSON.stringify(state), {
      headers: { 'content-type': 'application/json' }
    }));
  } catch (e) { /* ignore */ }
}

/**
 * 后台检查是否该提醒。
 * 说明：应用数据只在本地，所以「今天没打开过 App」⇒「今天一定没有起飞记录」，
 * 据此可以在没有页面的情况下做出安全判断（宁可漏提醒，不乱打扰）。
 */
async function checkReminder() {
  const Core = self.ReminderCore;
  if (!Core) return;
  const stored = await readReminderState();
  if (!stored) return;

  const cfg = Core.normalize(stored);
  const now = new Date();
  const today = Core.keyOf(now);
  const hasRecord = stored.date === today ? !!stored.hasRecord : false;
  const res = Core.shouldNotify(cfg, {
    hasRecord: hasRecord,
    lastNotifiedDate: cfg.lastNotifiedDate,
    skipDate: cfg.skipDate,
    snoozeUntil: cfg.snoozeUntil
  }, now);
  if (!res.notify) return;

  const msg = Core.message(cfg, today);
  await self.registration.showNotification(msg.title, {
    body: msg.body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: PERIODIC_TAG,
    renotify: true,
    data: { url: 'index.html#add' }
  });

  stored.lastNotifiedDate = today;
  stored.snoozeUntil = 0;
  stored.updatedAt = Date.now();
  await writeReminderState(stored);

  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((c) => c.postMessage({ type: 'reminder-fired' }));
}

self.addEventListener('periodicsync', (e) => {
  if (e.tag === PERIODIC_TAG) e.waitUntil(checkReminder());
});
self.addEventListener('sync', (e) => {
  if (e.tag === PERIODIC_TAG) e.waitUntil(checkReminder());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if (client.url.indexOf(self.registration.scope) === 0) {
        await client.focus();
        client.postMessage({ type: 'open-add' });
        return;
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(new URL('index.html#add', self.location.href).href);
    }
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'check-reminder') checkReminder();
});

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
