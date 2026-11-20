package com.sunshine.accounting;

import android.content.Context;
import android.os.SystemClock;
import android.view.ActionMode;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.webkit.WebView;

/** Keep programmatic select-all on a tap from launching Android's floating clipboard toolbar. */
final class EntryWebView extends WebView {
    private long downTime = -1;
    private long upTime = -1;
    private boolean longPress;
    private float startX, startY;
    private final int slop;

    EntryWebView(Context context) {
        super(context);
        slop = ViewConfiguration.get(context).getScaledTouchSlop();
    }

    @Override public boolean onTouchEvent(MotionEvent event) {
        if (event.getToolType(0) == MotionEvent.TOOL_TYPE_FINGER) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downTime = event.getEventTime();
                    upTime = -1;
                    longPress = false;
                    startX = event.getX();
                    startY = event.getY();
                    break;
                case MotionEvent.ACTION_MOVE:
                    if (Math.hypot(event.getX() - startX, event.getY() - startY) > slop) downTime = -1;
                    break;
                case MotionEvent.ACTION_UP:
                    upTime = event.getEventTime();
                    longPress = downTime >= 0 && upTime - downTime >= ViewConfiguration.getLongPressTimeout();
                    break;
                case MotionEvent.ACTION_CANCEL:
                    downTime = -1;
                    break;
                default:
                    break;
            }
        } else downTime = -1;
        return super.onTouchEvent(event);
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        downTime = -1;
        return super.dispatchKeyEvent(event);
    }

    @Override public ActionMode startActionMode(ActionMode.Callback callback, int type) {
        final long now = SystemClock.uptimeMillis();
        if (type == ActionMode.TYPE_FLOATING && downTime >= 0 && !longPress &&
                (upTime < 0 ? now - downTime < ViewConfiguration.getLongPressTimeout()
                            : now - upTime < ViewConfiguration.getDoubleTapTimeout() + 250)) return null;
        return super.startActionMode(callback, type);
    }
}
