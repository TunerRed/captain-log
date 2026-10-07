package com.captainlog.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.util.Calendar;

/**
 * 起飞提醒的持久化与闹钟排程（纯安卓 API，不依赖 Capacitor）。
 *
 * 设计：
 *   - 网页侧每次开关/记录变化都会重新调用 plugin.schedule()，这里只负责「下一次什么时候响」
 *   - 到点由 ReminderReceiver 弹通知，并自动排下一天
 *   - 手机重启或覆盖安装后由 BootReceiver 重新排程
 */
final class ReminderScheduler {

    static final String PREFS = "captain_reminder";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_HOUR = "hour";
    static final String KEY_MINUTE = "minute";
    static final String KEY_TITLE = "title";
    static final String KEY_BODY = "body";

    static final int REQUEST_CODE = 1001;

    private ReminderScheduler() {
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context ctx) {
        return prefs(ctx).getBoolean(KEY_ENABLED, false);
    }

    /** 保存提醒配置；atMs 用来推导每天要响的时分 */
    static void save(Context ctx, boolean enabled, long atMs, String title, String body) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        e.putBoolean(KEY_ENABLED, enabled);
        if (enabled && atMs > 0) {
            Calendar c = Calendar.getInstance();
            c.setTimeInMillis(atMs);
            e.putInt(KEY_HOUR, c.get(Calendar.HOUR_OF_DAY));
            e.putInt(KEY_MINUTE, c.get(Calendar.MINUTE));
            if (title != null) e.putString(KEY_TITLE, title);
            if (body != null) e.putString(KEY_BODY, body);
        }
        e.apply();
    }

    /** 下一次提醒的时间戳：今天该时刻还没到就用今天，否则明天 */
    static long nextTriggerMs(Context ctx) {
        SharedPreferences p = prefs(ctx);
        Calendar target = Calendar.getInstance();
        target.set(Calendar.HOUR_OF_DAY, p.getInt(KEY_HOUR, 23));
        target.set(Calendar.MINUTE, p.getInt(KEY_MINUTE, 0));
        target.set(Calendar.SECOND, 0);
        target.set(Calendar.MILLISECOND, 0);
        if (target.getTimeInMillis() <= System.currentTimeMillis()) {
            target.add(Calendar.DAY_OF_YEAR, 1);
        }
        return target.getTimeInMillis();
    }

    static PendingIntent pendingIntent(Context ctx) {
        Intent i = new Intent(ctx, ReminderReceiver.class);
        i.setAction(ReminderReceiver.ACTION_FIRE);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(ctx, REQUEST_CODE, i, flags);
    }

    /** 排一个一次性闹钟；能用精确闹钟就用精确的，否则退化为 setAndAllowWhileIdle */
    static void scheduleAt(Context ctx, long atMs) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = pendingIntent(ctx);
        boolean canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
        try {
            if (canExact) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
            }
        } catch (SecurityException ex) {
            // 没给精确闹钟权限时兜底
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
        }
    }

    /** 按已保存的时分排下一次（重启后 / 通知发完后调用） */
    static void scheduleNext(Context ctx) {
        if (!isEnabled(ctx)) return;
        scheduleAt(ctx, nextTriggerMs(ctx));
    }

    static void cancel(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(pendingIntent(ctx));
    }
}
