package app.levelup;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.RelativeSizeSpan;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/**
 * The ringing alarm's screen, over the lock screen: the time, the reminder, and a meter that fills as he shakes the phone.
 * 30 hard shakes stop it (no motion sensor: 40 taps on the meter). The meter drains if he stops, so one sleepy flick never
 * does it. Then "YOU'RE UP!" with the reminder still showing, and DONE. Back does nothing while it rings; there's no
 * snooze. Built in code like BlockActivity. Its own task, never in recents; LimitService never blocks it (it's LEVEL UP).
 */
public class AlarmActivity extends Activity implements SensorEventListener {
    static final int SHAKES = 30, TAPS = 40;
    // a shake: linear acceleration over 14 m/s² (about 1.4 g on top of gravity), pointing the other way from the last one
    // counted, at least 120 ms after it. A swing in bed or a single flick stays under it or counts once or twice.
    private static final float HARD = 14f, BACK = -0.2f;
    private static final long GAP = 120, IDLE = 1500, STEP = 100, RESUME_BUZZ = 5000;
    private static final float DRAIN = 0.25f;   // per 100 ms once he's stopped for 1.5 s: 2.5 shakes a second

    private static final int GROUND = Color.rgb(0x0c, 0x0a, 0x1d), PANEL = Color.rgb(0x16, 0x13, 0x31), CHALK = Color.rgb(0xf1, 0xee, 0xf9),
            DIM = Color.rgb(0xab, 0xa5, 0xcc), RULE = Color.rgb(0x2b, 0x27, 0x52), RULE_HI = Color.rgb(0x3d, 0x38, 0x74),
            GOLD = Color.rgb(0xff, 0xb0, 0x20), DONE = Color.rgb(0x3d, 0xdc, 0x84), DONE_INK = Color.rgb(0x03, 0x24, 0x12);

    static volatile boolean showing;   // on screen right now (LimitService never sends this screen home)

    private final Handler h = new Handler(Looper.getMainLooper());
    private final Runnable drain = this::drain, clockTick = this::clockTick, changed = this::refresh;
    private SensorManager sm;
    private Sensor sensor;
    private boolean linear, taps, done, gone, quiet, gravSet, hasDir;
    private final float[] grav = new float[3], dir = new float[3];
    private float got;
    private int need;
    private long lastAt, toastAt, upSec;
    private TextView kicker, clock, lab, remind, title, sub;
    private Meter meter;
    private Button ok;

    static Intent intent(Context c, long at, String text) {
        return new Intent(c, AlarmActivity.class).putExtra(Alarms.EXTRA_AT, at).putExtra(Alarms.EXTRA_TEXT, text == null ? "" : text)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
    }

    static boolean hasSensor(Context c) {
        try {
            return ((SensorManager) c.getSystemService(Context.SENSOR_SERVICE)).getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(GROUND);
        getWindow().setNavigationBarColor(GROUND);
        if (!AlarmService.ringing && !startFromHere(getIntent())) {   // nothing ringing (an old notification): nothing to show
            finish();
            return;
        }
        sm = (SensorManager) getSystemService(SENSOR_SERVICE);
        sensor = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
        linear = sensor != null;
        if (sensor == null && sm != null) sensor = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        taps = sensor == null;
        need = taps ? TAPS : SHAKES;
        build();
    }

    /** The service couldn't start in the background, so only the notification came: start the sound from the front. */
    private boolean startFromHere(Intent i) {
        long at = i == null ? 0 : i.getLongExtra(Alarms.EXTRA_AT, 0), now = System.currentTimeMillis();
        if (at <= 0 || now < at || now - at > AlarmService.MAX_RING || Alarms.handled(this, at)) return false;
        AlarmService.start(this, at, i.getStringExtra(Alarms.EXTRA_TEXT));
        return true;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (!done && !gone && !AlarmService.ringing) startFromHere(intent);
        refresh();
    }

    @Override
    protected void onResume() {
        super.onResume();
        showing = true;
        AlarmService.listener = changed;
        if (sensor != null && !done && !gone) sm.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME);
        h.post(drain);
        h.post(clockTick);
        refresh();
    }

    @Override
    protected void onPause() {
        super.onPause();
        showing = false;
        if (sm != null) sm.unregisterListener(this);
        h.removeCallbacks(drain);
        h.removeCallbacks(clockTick);
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (done || gone) finish();   // it's over: never left waiting behind the lock screen
    }

    @Override
    protected void onDestroy() {
        if (AlarmService.listener == changed) AlarmService.listener = null;
        h.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    /** Back never stops it: the point is to get up. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (done || gone) {
            finish();
            return;
        }
        long now = SystemClock.uptimeMillis();
        if (now - toastAt > 3000) {
            toastAt = now;
            Toast.makeText(this, taps ? "Tap the circle to stop the alarm" : "Shake your phone to stop the alarm", Toast.LENGTH_SHORT).show();
        }
    }

    // ------------------------------------------------------------------ shaking

    @Override
    public void onSensorChanged(SensorEvent e) {
        if (done || gone || e.values.length < 3) return;
        float x = e.values[0], y = e.values[1], z = e.values[2];
        if (!linear) {   // plain accelerometer: take gravity out with a low-pass filter (about 0.1 s at the game rate)
            if (!gravSet) {
                grav[0] = x;
                grav[1] = y;
                grav[2] = z;
                gravSet = true;
                return;
            }
            grav[0] = 0.8f * grav[0] + 0.2f * x;
            grav[1] = 0.8f * grav[1] + 0.2f * y;
            grav[2] = 0.8f * grav[2] + 0.2f * z;
            x -= grav[0];
            y -= grav[1];
            z -= grav[2];
        }
        float mag = (float) Math.sqrt(x * x + y * y + z * z);
        if (mag < HARD) return;
        long now = SystemClock.uptimeMillis();
        x /= mag;
        y /= mag;
        z /= mag;
        // a shake is a hard push the other way from the last one: holding the phone out, or one long swing, counts once
        if (hasDir && x * dir[0] + y * dir[1] + z * dir[2] > BACK) return;
        if (now - lastAt < GAP) return;
        dir[0] = x;
        dir[1] = y;
        dir[2] = z;
        hasDir = true;
        add(now);
    }

    @Override
    public void onAccuracyChanged(Sensor s, int accuracy) {
    }

    private void add(long now) {
        if (done || gone || !AlarmService.ringing && !startedHere()) return;
        lastAt = now;
        got = Math.min(need, got + 1);
        if (!quiet) {
            quiet = true;
            AlarmService.shaking(true);
        }
        tick(false);
        if (got >= need) {
            up();
            return;
        }
        paintMeter();
    }

    /** Ringing was started from this screen and the service is still on its way. */
    private boolean startedHere() {
        Intent i = getIntent();
        long at = i == null ? 0 : i.getLongExtra(Alarms.EXTRA_AT, 0);
        return at > 0 && !Alarms.handled(this, at) && System.currentTimeMillis() - at <= AlarmService.MAX_RING;
    }

    /** Every 100 ms: once he stops for 1.5 s the meter drains; empty for 5 s and the buzzing comes back. */
    private void drain() {
        h.removeCallbacks(drain);
        if (done || gone) return;
        long idle = SystemClock.uptimeMillis() - lastAt;
        if (got > 0 && idle > IDLE) {
            got = Math.max(0, got - DRAIN);
            paintMeter();
        }
        if (got == 0 && idle > RESUME_BUZZ) {
            hasDir = false;
            if (quiet) {
                quiet = false;
                AlarmService.shaking(false);
            }
        }
        h.postDelayed(drain, STEP);
    }

    private void up() {
        done = true;
        upSec = Math.max(1, (SystemClock.elapsedRealtime() - AlarmService.startedAt) / 1000);
        if (sm != null) sm.unregisterListener(this);
        AlarmService.done(this, taps);
        tick(true);
        refresh();
    }

    @SuppressWarnings("deprecation")
    private void tick(boolean big) {
        try {
            Vibrator v = Build.VERSION.SDK_INT >= 31
                    ? ((VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE)).getDefaultVibrator()
                    : (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (big && Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(new long[] { 0, 60, 80, 120 }, -1));
            else if (big) v.vibrate(new long[] { 0, 60, 80, 120 }, -1);
            else if (Build.VERSION.SDK_INT >= 29) v.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK));
            else if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(15, VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(15);
        } catch (Exception ignored) {
        }
    }

    // ------------------------------------------------------------------ the screen

    private void build() {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        float wdp = dm.widthPixels / dm.density, hdp = dm.heightPixels / dm.density;
        Typeface display = Typeface.create("sans-serif-condensed", Typeface.BOLD_ITALIC);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(24), Math.max(dp(28), (int) (dm.heightPixels * 0.06f)), dp(24), dp(24));

        kicker = text("", 12, DIM);
        kicker.setTypeface(Typeface.DEFAULT_BOLD);
        kicker.setLetterSpacing(0.14f);
        col.addView(kicker);

        // the clock is drawing, not reading: dp, so a large font setting can't push it off the screen
        clock = new TextView(this);
        clock.setTextSize(TypedValue.COMPLEX_UNIT_DIP, wdp < 360 ? 68 : 84);
        clock.setTextColor(CHALK);
        clock.setTypeface(display);
        clock.setIncludeFontPadding(false);
        clock.setSingleLine(true);
        col.addView(clock, margins(6, 0));

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackground(shape(PANEL, dp(18), RULE_HI, dp(1)));
        box.setPadding(dp(18), dp(14), dp(18), dp(16));
        lab = text("REMINDER", 11, GOLD);
        lab.setTypeface(Typeface.DEFAULT_BOLD);
        lab.setLetterSpacing(0.14f);
        box.addView(lab);
        remind = text("", 24, CHALK);
        remind.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        remind.setLineSpacing(0, 1.12f);
        LinearLayout.LayoutParams rp = margins(6, 0);
        box.addView(remind, rp);
        col.addView(box, margins(18, 0));

        View spacer = new View(this);
        col.addView(spacer, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(20), 1));

        int size = dp(Math.max(160, Math.min(Math.min(wdp - 48, hdp * 0.34f), 250)));
        meter = new Meter(this, display);
        LinearLayout.LayoutParams mp = new LinearLayout.LayoutParams(size, size);
        mp.gravity = Gravity.CENTER_HORIZONTAL;
        mp.topMargin = dp(8);
        col.addView(meter, mp);
        if (taps) {   // no motion sensor: the meter is a big button
            meter.setClickable(true);
            meter.setFocusable(true);
            meter.setOnClickListener(v -> add(SystemClock.uptimeMillis()));
        }

        title = text("", 30, CHALK);
        title.setTypeface(display);
        title.setGravity(Gravity.CENTER_HORIZONTAL);
        title.setLetterSpacing(0.04f);
        col.addView(title, margins(16, 0));
        sub = text("", 15, DIM);
        sub.setGravity(Gravity.CENTER_HORIZONTAL);
        sub.setLineSpacing(0, 1.25f);
        col.addView(sub, margins(4, 0));

        ok = new Button(this);
        ok.setText("DONE");
        ok.setAllCaps(true);
        ok.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        ok.setTextColor(DONE_INK);
        ok.setTypeface(display);
        ok.setLetterSpacing(0.06f);
        ok.setBackground(shape(DONE, dp(14), 0, 0));
        ok.setStateListAnimator(null);
        ok.setMinHeight(dp(64));
        ok.setMinimumHeight(dp(64));
        ok.setVisibility(View.GONE);
        ok.setOnClickListener(v -> finish());
        col.addView(ok, margins(20, 0));

        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        sv.setBackgroundColor(GROUND);
        sv.addView(col, new ScrollView.LayoutParams(ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.MATCH_PARENT));
        setContentView(sv);
        clockTick();
        refresh();
    }

    /** What the screen says now: ringing, shaken off, or gone quiet by itself after 10 minutes. */
    private void refresh() {
        if (meter == null) return;
        if (!done && !gone && !AlarmService.ringing && AlarmService.timedOut) gone = true;
        String at = Alarms.clock(this, AlarmService.ringAt > 0 ? AlarmService.ringAt : System.currentTimeMillis());
        String t = AlarmService.text == null ? "" : AlarmService.text;
        if (t.isEmpty() && getIntent() != null && getIntent().getStringExtra(Alarms.EXTRA_TEXT) != null) t = getIntent().getStringExtra(Alarms.EXTRA_TEXT);
        lab.setVisibility(t.isEmpty() ? View.GONE : View.VISIBLE);
        remind.setText(t.isEmpty() ? (done ? "Have a good day." : "Time to get up.") : t);
        remind.setTextColor(t.isEmpty() ? DIM : CHALK);
        if (done) {
            kicker.setText("ALARM · " + at);
            kicker.setTextColor(DIM);
            title.setText("YOU'RE UP!");
            title.setTextColor(DONE);
            sub.setText("Up in " + took(upSec) + (t.isEmpty() ? "" : ". Don't forget your reminder."));
            ok.setVisibility(View.VISIBLE);
            meter.set(1, DONE, null, null, true);
            meter.setContentDescription("Alarm stopped");
        } else if (gone) {
            kicker.setText("ALARM · " + at);
            title.setText("ALARM STOPPED");
            title.setTextColor(CHALK);
            sub.setText("It rang for 10 minutes, so it went quiet.");
            ok.setVisibility(View.VISIBLE);
            meter.set(0, CHALK, "", "", false);
            meter.setContentDescription("Alarm stopped");
        } else {
            kicker.setText("ALARM · " + at);
            kicker.setTextColor(GOLD);
            title.setText(taps ? "TAP TO STOP" : "SHAKE TO STOP");
            title.setTextColor(CHALK);
            sub.setText(taps ? "Tap the circle " + need + " times. No snooze." : "Shake it hard, side to side. No snooze.");
            ok.setVisibility(View.GONE);
            paintMeter();
        }
    }

    private void paintMeter() {
        if (meter == null || done || gone) return;
        int left = (int) Math.ceil(need - got);
        meter.set(got / need, CHALK, String.valueOf(left), taps ? (left == 1 ? "TAP LEFT" : "TAPS LEFT") : (left == 1 ? "SHAKE LEFT" : "SHAKES LEFT"), false);
        meter.setContentDescription((taps ? "Taps" : "Shakes") + " left: " + left + " of " + need);
    }

    private static String took(long s) {
        return s < 60 ? s + " s" : s / 60 + ":" + (s % 60 < 10 ? "0" : "") + s % 60;
    }

    /** The time now, with AM/PM small (12-hour phones). */
    private void clockTick() {
        h.removeCallbacks(clockTick);
        if (clock == null) return;
        String s = Alarms.clock(this, System.currentTimeMillis());
        int sp = s.lastIndexOf(' ');
        if (sp < 0) sp = s.lastIndexOf(' ');
        SpannableString ss = new SpannableString(s);
        if (sp > 0 && !Character.isDigit(s.charAt(s.length() - 1))) ss.setSpan(new RelativeSizeSpan(0.36f), sp, s.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        clock.setText(ss);
        clock.setContentDescription(s);
        h.postDelayed(clockTick, 10_000);
    }

    private TextView text(String s, float sp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        return t;
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

    /** The shake meter: a ring that fills, the count left in the middle; a tick when it's done. Sized from its own box. */
    static final class Meter extends View {
        private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG), arc = new Paint(Paint.ANTI_ALIAS_FLAG),
                big = new Paint(Paint.ANTI_ALIAS_FLAG), small = new Paint(Paint.ANTI_ALIAS_FLAG), fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF r = new RectF();
        private final Path check = new Path();
        private float p;
        private String n = "", what = "";
        private boolean tick;

        Meter(Context c, Typeface display) {
            super(c);
            track.setStyle(Paint.Style.STROKE);
            track.setColor(RULE);
            arc.setStyle(Paint.Style.STROKE);
            arc.setStrokeCap(Paint.Cap.ROUND);
            fill.setColor(PANEL);
            big.setTextAlign(Paint.Align.CENTER);
            big.setTypeface(display);
            big.setColor(CHALK);
            small.setTextAlign(Paint.Align.CENTER);
            small.setTypeface(Typeface.DEFAULT_BOLD);
            small.setLetterSpacing(0.14f);
            small.setColor(DIM);
        }

        void set(float progress, int color, String count, String label, boolean done) {
            p = Math.max(0, Math.min(1, progress));
            arc.setColor(color);
            if (count != null) n = count;
            if (label != null) what = label;
            tick = done;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas cv) {
            float w = getWidth(), hh = getHeight(), s = Math.min(w, hh), st = s * 0.07f, cx = w / 2, cy = hh / 2;
            track.setStrokeWidth(st);
            arc.setStrokeWidth(st);
            r.set(cx - s / 2 + st / 2, cy - s / 2 + st / 2, cx + s / 2 - st / 2, cy + s / 2 - st / 2);
            cv.drawOval(r, fill);
            cv.drawOval(r, track);
            if (p > 0) cv.drawArc(r, -90, 360 * p, false, arc);
            if (tick) {   // a drawn tick, no font needed
                check.reset();
                check.moveTo(cx - s * 0.17f, cy + s * 0.01f);
                check.lineTo(cx - s * 0.04f, cy + s * 0.13f);
                check.lineTo(cx + s * 0.19f, cy - s * 0.12f);
                arc.setStrokeWidth(st * 1.1f);
                cv.drawPath(check, arc);
                return;
            }
            if (n.isEmpty()) return;
            big.setTextSize(s * 0.32f);
            cv.drawText(n, cx, cy + s * 0.08f, big);
            small.setTextSize(s * 0.065f);
            cv.drawText(what, cx, cy + s * 0.22f, small);
        }
    }
}
