package com.captainlog.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * 网页侧用的原生提醒插件（把「每天几点提醒」交给系统闹钟）。
 *
 * 接口刻意做成和 @capacitor/local-notifications 的子集一致：
 *   schedule({ notifications: [ { id, title, body, schedule: { atMs | at } } ] })
 *   cancel({ notifications: [ { id } ] })
 *   requestPermissions() -> { display: 'granted' | 'denied' }
 *   consumeOpenAdd()     -> { openAdd: boolean }   点通知进来后要不要直接弹「记一笔」
 *
 * 这样 js/reminder.js 里不需要区分到底是官方插件还是这个自研插件。
 */
@CapacitorPlugin(name = "CaptainReminder")
public class ReminderPlugin extends Plugin {

    private static final int REQ_POST_NOTIFICATIONS = 9101;

    /** MainActivity 收到「点通知打开」时置位，网页启动后消费掉 */
    static volatile boolean pendingOpenAdd = false;

    private boolean notificationsAllowed() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("display", notificationsAllowed() ? "granted" : "prompt");
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (!notificationsAllowed() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getActivity() != null) {
            getActivity().requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_POST_NOTIFICATIONS);
        }
        JSObject ret = new JSObject();
        // 系统弹窗是异步返回的，这里先按已授权继续；用户拒绝时系统会静默丢弃通知
        ret.put("display", "granted");
        call.resolve(ret);
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        long atMs = 0;
        String title = getContext().getString(R.string.reminder_default_title);
        String body = getContext().getString(R.string.reminder_default_body);
        try {
            JSONObject data = call.getData();
            JSONArray arr = data.optJSONArray("notifications");
            if (arr != null && arr.length() > 0) {
                JSONObject n = arr.optJSONObject(0);
                if (n != null) {
                    title = n.optString("title", title);
                    body = n.optString("body", body);
                    JSONObject s = n.optJSONObject("schedule");
                    if (s != null) {
                        atMs = s.optLong("atMs", 0);
                        if (atMs <= 0) {
                            atMs = parseIso(s.optString("at", null));
                        }
                    }
                }
            }
        } catch (Exception e) {
            // 参数异常就用默认时间
        }

        if (atMs <= 0) atMs = ReminderScheduler.nextTriggerMs(getContext());
        ReminderScheduler.save(getContext(), true, atMs, title, body);
        ReminderScheduler.scheduleAt(getContext(), atMs);

        JSObject ret = new JSObject();
        ret.put("scheduledAt", atMs);
        call.resolve(ret);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        ReminderScheduler.cancel(getContext());
        ReminderScheduler.save(getContext(), false, 0, null, null);
        call.resolve();
    }

    /** 点通知冷启动进来时，让网页知道自己该弹「记一笔」 */
    @PluginMethod
    public void consumeOpenAdd(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("openAdd", pendingOpenAdd);
        pendingOpenAdd = false;
        call.resolve(ret);
    }

    /** 兼容 ISO-8601（官方插件用的是 Date 序列化后的字符串） */
    private static long parseIso(String iso) {
        if (iso == null || iso.isEmpty()) return 0;
        String[] patterns = {"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd'T'HH:mm:ss.SSSZ"};
        for (String p : patterns) {
            try {
                SimpleDateFormat f = new SimpleDateFormat(p, Locale.US);
                f.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date d = f.parse(iso, new ParsePosition(0));
                if (d != null) return d.getTime();
            } catch (Exception ignored) {
                // 换下一种格式
            }
        }
        return 0;
    }
}
