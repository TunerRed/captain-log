package com.captainlog.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 手机重启 / App 覆盖升级后，AlarmManager 里排的闹钟会被清掉，
 * 这里重新按保存的时分排下一次，避免提醒「升级完就再也不响了」。
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            ReminderScheduler.scheduleNext(context);
        }
    }
}
