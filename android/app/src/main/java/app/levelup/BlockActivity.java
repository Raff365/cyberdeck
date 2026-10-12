package app.levelup;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * The full-screen "time's up" screen LimitService shows over a limited app. Built in code (no layouts).
 * It re-checks every time it comes to the front and closes itself when it should no longer block,
 * so it can never trap anyone. Its own task, never in recents.
 */
public class BlockActivity extends Activity {
    static final String PKG = "levelup.pkg";
    static volatile long shownAt;   // LimitService checks this to see the screen actually came up (onResume ran)

    private static final int GROUND = Color.rgb(0x0c, 0x0a, 0x1d), CHALK = Color.rgb(0xf1, 0xee, 0xf9), DIM = Color.rgb(0xab, 0xa5, 0xcc),
            FAINT = Color.rgb(0x91, 0x8b, 0xb8), PANEL_HI = Color.rgb(0x1e, 0x1a, 0x40), RULE = Color.rgb(0x2b, 0x27, 0x52),
            RULE_HI = Color.rgb(0x3d, 0x38, 0x74), GOLD = Color.rgb(0xff, 0xb0, 0x20), INK = Color.rgb(0x1a, 0x12, 0x04);

    private String pkg;
    private ScreenTime.Rule rule;
    private boolean buzzed;   // once per block, not on every return to the screen

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(GROUND);
        getWindow().setNavigationBarColor(GROUND);
        pkg = getIntent().getStringExtra(PKG);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        pkg = intent.getStringExtra(PKG);
        buzzed = false;
    }

    @Override
    protected void onResume() {
        super.onResume();
        shownAt = System.currentTimeMillis();   // it came up (whether or not it stays)
        // still over the limit on a still-limited app, and no call going on? otherwise there is nothing to block: go
        rule = ScreenTime.rule(this);
        long used = rule == null || pkg == null || !rule.apps.contains(pkg) || ScreenTime.isProtected(this, pkg) || ScreenTime.inCall(this) ? -1
                : ScreenTime.usedToday(this, rule.apps, 5000);
        if (used < 0 || used < rule.limit * 60_000L) {
            finish();
            return;
        }
        build();
        if (!buzzed) buzz();
        buzzed = true;
    }

    private void build() {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        Typeface display = Typeface.create("sans-serif-condensed", Typeface.BOLD_ITALIC);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(24), Math.max(dp(32), (int) (dm.heightPixels * 0.15f)), dp(24), dp(20));

        TextView kicker = text("SCREEN TIME", 12, DIM);
        kicker.setTypeface(Typeface.DEFAULT_BOLD);
        kicker.setLetterSpacing(0.14f);
        col.addView(kicker);

        TextView title = text("TIME'S UP", dm.widthPixels / dm.density < 360 ? 52 : 64, CHALK);
        title.setTypeface(display);
        title.setSingleLine(true);
        title.setIncludeFontPadding(false);
        col.addView(title, margins(12, 0));

        LinearLayout notches = new LinearLayout(this);
        int n = Math.max(1, rule.limit / 5), gap = dp(n > 12 ? 2 : 3);
        for (int i = 0; i < n; i++) {
            View v = new View(this);
            v.setBackground(shape(PANEL_HI, dp(4), RULE, dp(1)));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(8), 1);
            if (i > 0) lp.leftMargin = gap;
            notches.addView(v, lp);
        }
        notches.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        col.addView(notches, margins(22, 18));

        col.addView(text("You've used your " + ScreenTime.limitName(rule.limit) + " for today.", 18, CHALK));
        String name = ScreenTime.label(this, pkg);
        long now = System.currentTimeMillis(), left = (ScreenTime.addDays(ScreenTime.dayStart(now), 1) - now) / 60_000L;
        String line2 = (name == null || name.isEmpty() ? "This app" : name) + " unlocks at midnight.";
        if (left >= 1) line2 += " That's " + (left >= 60 ? left / 60 + " hr " + left % 60 + " min" : left + " min") + " from now.";
        TextView l2 = text(line2, 15, DIM);
        l2.setLineSpacing(0, 1.3f);
        col.addView(l2, margins(6, 0));

        View spacer = new View(this);
        spacer.setMinimumHeight(dp(32));
        col.addView(spacer, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(32), 1));

        Button train = button("TRAIN INSTEAD", 22, INK, display, shape(GOLD, dp(14), 0, 0));
        train.setLetterSpacing(0.06f);
        train.setOnClickListener(v -> {
            try {
                // the launcher's own intent (MAIN + LAUNCHER): if this starts a new task, its root intent matches the
                // home-screen icon, so a later tap on the icon brings this task back instead of stacking a second copy
                startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setClass(this, MainActivity.class)
                        .putExtra(MainActivity.OPEN, "workout")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
            } catch (Exception ignored) {
            }
            finish();
        });
        col.addView(train, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64)));

        TextView cap = text("Opens a workout in LEVEL UP · no gym needed", 13, DIM);
        cap.setGravity(Gravity.CENTER_HORIZONTAL);
        col.addView(cap, margins(8, 0));

        Button home = button("HOME SCREEN", 18, CHALK, Typeface.create("sans-serif-condensed", Typeface.BOLD), shape(Color.TRANSPARENT, dp(14), RULE_HI, dp(2)));
        home.setLetterSpacing(0.08f);
        home.setOnClickListener(v -> goHome());
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56));
        hp.topMargin = dp(14);
        col.addView(home, hp);

        TextView foot = text("Calls, texts and Settings still work.", 12, FAINT);
        foot.setGravity(Gravity.CENTER_HORIZONTAL);
        col.addView(foot, margins(16, 0));

        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        sv.setBackgroundColor(GROUND);
        sv.addView(col, new ScrollView.LayoutParams(ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.MATCH_PARENT));
        setContentView(sv);
    }

    private void goHome() {
        try {
            startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) {
        }
        finish();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        goHome();
    }

    @SuppressWarnings("deprecation")
    private void buzz() {
        try {
            Vibrator v = Build.VERSION.SDK_INT >= 31
                    ? ((VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE)).getDefaultVibrator()
                    : (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(40, VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(40);
        } catch (Exception ignored) {
        }
    }

    private TextView text(String s, float sp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        return t;
    }

    private Button button(String s, float sp, int color, Typeface tf, GradientDrawable bg) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(true);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        b.setTextColor(color);
        b.setTypeface(tf);
        b.setBackground(bg);
        b.setStateListAnimator(null);
        return b;
    }

    private GradientDrawable shape(int fill, int radius, int stroke, int width) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(radius);
        if (width > 0) g.setStroke(width, stroke);
        return g;
    }

    private LinearLayout.LayoutParams margins(int top, int bottom) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(top);
        lp.bottomMargin = dp(bottom);
        return lp;
    }

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
