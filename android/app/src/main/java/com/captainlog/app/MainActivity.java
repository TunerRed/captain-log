package com.captainlog.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    static final String EXTRA_OPEN_ADD = "captainOpenAdd";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 自定义插件必须在 super.onCreate 之前注册
        registerPlugin(ReminderPlugin.class);
        super.onCreate(savedInstanceState);

        // 点通知冷启动：先把标记置上，网页加载完自己来取
        Intent intent = getIntent();
        if (intent != null && intent.getBooleanExtra(EXTRA_OPEN_ADD, false)) {
            ReminderPlugin.pendingOpenAdd = true;
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent == null || !intent.getBooleanExtra(EXTRA_OPEN_ADD, false)) return;
        // App 已经在运行：直接通知网页弹「记一笔」（网页也会兜底轮询 consumeOpenAdd）
        ReminderPlugin.pendingOpenAdd = true;
        Bridge bridge = getBridge();
        if (bridge != null) {
            bridge.triggerWindowJSEvent("captainOpenAdd");
        }
    }
}
