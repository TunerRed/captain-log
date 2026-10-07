package com.captainlog.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * 到点被系统闹钟拉起：弹一条状态栏通知，然后把明天的闹钟排上。
 *
 * 关于「今天是不是已经起飞过」：数据只存在手机的 WebView 里，原生进程读不到。
 * 但网页侧每次记录变化都会重新排程（今天已记录 → 直接约到明天），
 * 所以只要当天在 App 里记过一笔，这个闹钟就已经被改到明天了。
 */
public class ReminderReceiver extends BroadcastReceiver {

    static final String ACTION_FIRE = "com.captainlog.app.action.REMINDER_FIRE";
    static final String CHANNEL_ID = "captain-reminder";
    private static final int NOTIFICATION_ID = 1001;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ReminderScheduler.isEnabled(context)) return;

        String title = ReminderScheduler.prefs(context)
                .getString(ReminderScheduler.KEY_TITLE, context.getString(R.string.reminder_default_title));
        String body = ReminderScheduler.prefs(context)
                .getString(ReminderScheduler.KEY_BODY, context.getString(R.string.reminder_default_body));

        show(context, title, body);
        ReminderScheduler.scheduleNext(context);   // 自动约明天
    }

    private void show(Context ctx, String title, String body) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    ctx.getString(R.string.reminder_channel_name),
                    NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription(ctx.getString(R.string.reminder_channel_desc));
            nm.createNotificationChannel(ch);
        }

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra(MainActivity.EXTRA_OPEN_ADD, true);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(ctx, 1002, open, flags);

        Notification n = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_reminder)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();

        try {
            NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, n);
        } catch (SecurityException e) {
            // Android 13+ 没给通知权限，静默失败即可
        }
    }
}
