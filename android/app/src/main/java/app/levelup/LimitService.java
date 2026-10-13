package app.levelup;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Toast;

import java.util.HashMap;
import java.util.Map;

/**
 * Enforces the daily screen-time limit. It only reads which app's window came to the front (the package name on
 * the event; canRetrieveWindowContent is off), and when a selected app is in front with no time left it shows
 * BlockActivity. Event-driven plus one timer: a timer Doze delays heals itself on the next window change.
 * The user can switch it off in Android Settings at any time; nothing here touches Settings.
 */
public class LimitService extends AccessibilityService {
    private static final long MIN = 60_000L, WARN = 5 * MIN;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Runnable check = this::check;
    private final Map<String, Boolean> activities = new HashMap<>();
    private String fg;          // the app in front, as far as window changes tell
    private String blockedPkg;
    private long blockedAt, warnedUnlock;   // warnedUnlock: the unlock (its end time) that already got its 1-minute warning

    @Override
    protected void onServiceConnected() {
        fg = null;
        try {
            Toast.makeText(this, "LEVEL UP blocker is on", Toast.LENGTH_SHORT).show();
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e == null || e.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || e.getPackageName() == null) return;
        String pkg = e.getPackageName().toString();
        // the shade, recents, volume and keyboards float over the app in front; they never change it
        if ("com.android.systemui".equals(pkg) || pkg.equals(currentIme())) return;
        if (pkg.equals(fg)) return;   // dialogs and toasts re-fire for the same app
        if (!pkg.equals(getPackageName()) && !isActivity(pkg, e.getClassName())) {
            // a limited app's own dialog or popup also means it is in front (coming back to it may show only that),
            // but it never takes the front from Settings, the phone or another protected app: a chat head or
            // overlay popping up there is not the user opening the app
            ScreenTime.Rule r = ScreenTime.rule(this);
            if (r == null || !r.apps.contains(pkg)) return;
            if (fg != null && !fg.equals(getPackageName()) && ScreenTime.isProtected(this, fg) && !ScreenTime.isHome(this, fg)) return;
        }
        fg = pkg;
        h.removeCallbacks(check);
        check();
    }

    /** Decides for the app in front now: block, warn, or come back when the next thing is due. */
    private void check() {
        h.removeCallbacks(check);
        String pkg = fg;
        if (pkg == null || ScreenTime.isProtected(this, pkg)) return;
        long now = System.currentTimeMillis(), midnight = ScreenTime.addDays(ScreenTime.dayStart(now), 1) - now;
        ScreenTime.Rule r = ScreenTime.rule(this);
        if (r == null || !r.apps.contains(pkg)) {
            // not limited today, but tomorrow's rule may limit it: look again at midnight (or in 15 min: clock changes)
            h.postDelayed(check, Math.max(1000, Math.min(midnight + 1000, 15 * MIN)));
            return;
        }
        // a call (phone, Discord, WhatsApp; ringing or connected) is never cut off, and the lock screen (where
        // incoming-call screens show) is never covered; look again in a minute
        if (ScreenTime.inCall(this) || ScreenTime.locked(this)) {
            h.postDelayed(check, MIN);
            return;
        }
        // an emergency unlock (10 push-ups): nothing blocks or warns till it ends, then this looks again at once and blocks
        long until = ScreenTime.unlockUntil(this), un = until == 0 ? 0 : until - now;
        if (un > 0) {
            if (un <= MIN + 1000 && warnedUnlock != until) {
                warnedUnlock = until;
                Toast.makeText(this, "LEVEL UP: 1 min of your unlock left", Toast.LENGTH_LONG).show();
            }
            h.postDelayed(check, Math.max(500, Math.min(un > MIN + 1000 ? un - MIN : un + 500, 15 * MIN)));
            return;
        }
        long used = ScreenTime.usedToday(this, r.apps, 2000);
        if (used < 0) return;   // can't measure: fail open
        long left = r.limit * MIN - used;
        if (left <= 0) {
            block(pkg);
            return;
        }
        if (left <= WARN && ScreenTime.claimWarning(this)) {
            long m = Math.max(1, (left + MIN - 1) / MIN);
            Toast.makeText(this, "LEVEL UP: " + m + " min of screen time left today", Toast.LENGTH_LONG).show();
        }
        long next = left > WARN ? left - WARN : left;
        // never sleep past midnight (tomorrow's rule) or longer than 15 minutes (clock changes, missed events)
        h.postDelayed(check, Math.max(1000, Math.min(Math.min(next + 500, midnight + 1000), 15 * MIN)));
    }

    private void block(String pkg) {
        long now = System.currentTimeMillis();
        if (pkg.equals(blockedPkg) && now - blockedAt < 1500 && now >= blockedAt) {
            h.postDelayed(check, 1600);   // just blocked it: if it is still in front then, block again
            return;
        }
        blockedPkg = pkg;
        blockedAt = now;
        try {
            // A bound accessibility service may start activities from the background, so this covers the app at
            // once. HOME first would hold our start back for up to 5s on Android 7-9. NO_USER_ACTION: being covered
            // is not the user leaving, so a video app gets no onUserLeaveHint and does not drop into
            // picture-in-picture (where it would keep playing, uncounted, over the block screen).
            startActivity(new Intent(this, BlockActivity.class).putExtra(BlockActivity.PKG, pkg)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION | Intent.FLAG_ACTIVITY_NO_USER_ACTION));
        } catch (Exception e) {
            performGlobalAction(GLOBAL_ACTION_HOME);
            return;
        }
        // the block screen is in front now, so the next window of the limited app always counts as a change
        fg = getPackageName();
        // if the block screen did not come up (an OEM blocked the start), send the user home instead. Not when
        // something else has come to the front since (fg moved on to another app).
        h.postDelayed(() -> {
            if (BlockActivity.shownAt < now && (pkg.equals(fg) || getPackageName().equals(fg)) && !ScreenTime.inCall(this))
                performGlobalAction(GLOBAL_ACTION_HOME);
        }, 1500);
    }

    private String currentIme() {
        try {
            ComponentName cn = ComponentName.unflattenFromString(Settings.Secure.getString(getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD));
            return cn == null ? null : cn.getPackageName();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Only a real activity changes which app is in front; a popup, menu or floating window of an app we can see
     * does not. A package we can't see (Android 11+ hides non-launcher apps) can never be limited, so its
     * window just counts as "something else in front", which cancels any timer (fail open).
     */
    private boolean isActivity(String pkg, CharSequence cls) {
        if (cls == null) return true;
        String key = pkg + "/" + cls;
        Boolean known = activities.get(key);
        if (known != null) return known;
        boolean is;
        PackageManager pm = getPackageManager();
        try {
            pm.getActivityInfo(new ComponentName(pkg, cls.toString()), 0);
            is = true;
        } catch (Exception e) {
            boolean visible;
            try {
                pm.getApplicationInfo(pkg, 0);
                visible = true;
            } catch (Exception e2) {
                visible = false;
            }
            is = !visible && !cls.toString().startsWith("android.");
        }
        if (activities.size() > 400) activities.clear();
        activities.put(key, is);
        return is;
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public void onDestroy() {
        h.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
