package app.levelup;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.text.format.DateFormat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collection;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TimeZone;

/**
 * Wake-up alarms: the list (prefs "alarms", JSON), when each one rings next, and the one AlarmManager alarm that stands
 * for the soonest. setAlarmClock is exact even in Doze, and Android shows its alarm icon with the time.
 * The list lives here, not in the page, so alarms ring with the app closed; app.js only shows and edits it
 * (bridge: alarmStatus / alarmList / alarmSave / alarmDelete). AlarmReceiver rings them and puts the next one back
 * after a reboot, an app update or a clock change. Ringing: AlarmService (sound, buzz), AlarmActivity (shake to stop).
 * Times are wall-clock times in the phone's time zone, worked out with Calendar (a 23- or 25-hour day is still a day).
 * Nothing here can loosen screen time or homework: an alarm only rings and shows its own screen. Never throws.
 */
final class Alarms {
    static final String PREFS = "alarms";
    private static final String LIST = "list", AT = "at", IDS = "ids", LAST_FIRE = "lastFire", LAST = "last", DONE_AT = "doneAt", ASKED = "askedNotify";
    static final String EXTRA_AT = "levelup.at", EXTRA_TEXT = "levelup.text";
    static final String CH_RING = "alarm", CH_MISSED = "alarm_missed";
    static final int NOTE_RING = 41, NOTE_MISSED = 42;
    static final int MAX = 12, TEXT_MAX = 80;
    static final long LATE = 10 * 60_000L;   // an alarm whose time went by more than 10 min ago (phone off) is missed, not rung
    private static final int GOLD = Color.rgb(0xff, 0xb0, 0x20);
    private static final SecureRandom RND = new SecureRandom();

    private Alarms() {
    }

    /** days: bit d for Calendar day d + 1 (0 Sunday .. 6 Saturday, like JS getDay()); 0 = once. date: yyyymmdd a one-off rings on. */
    static final class Alarm {
        String id = "", text = "";
        int h = 7, m, days, date;
        boolean on = true;

        JSONObject json() throws Exception {
            return new JSONObject().put("id", id).put("h", h).put("m", m).put("days", days).put("text", text).put("on", on).put("date", date);
        }

        /** For the page: days as a list. */
        JSONObject page(long next) throws Exception {
            JSONArray d = new JSONArray();
            for (int i = 0; i < 7; i++) if ((days & (1 << i)) != 0) d.put(i);
            return new JSONObject().put("id", id).put("h", h).put("m", m).put("days", d).put("text", text).put("on", on).put("next", next);
        }

        static Alarm of(JSONObject o) {
            Alarm a = new Alarm();
            a.id = o.optString("id", "");
            a.h = Math.max(0, Math.min(23, o.optInt("h", 7)));
            a.m = Math.max(0, Math.min(59, o.optInt("m", 0)));
            a.days = o.optInt("days", 0) & 127;
            a.text = clip(o.optString("text", ""));
            a.on = o.optBoolean("on", true);
            a.date = o.optInt("date", 0);
            return a;
        }
    }

    // ------------------------------------------------------------------ the pure part (AlarmsTest runs it on a plain JVM)

    /** The first h:m strictly after `after` on one of `days` (0: any day), in tz. 0 if none (can't happen with h, m in range). */
    static long nextTrigger(int h, int m, int days, long after, TimeZone tz) {
        Calendar k = Calendar.getInstance(tz);
        for (int i = 0; i <= 7; i++) {   // 7: the same weekday next week, when today's time has gone
            k.setTimeInMillis(after);
            k.add(Calendar.DAY_OF_MONTH, i);   // calendar days, not 24-hour steps: right across a clock change
            if (days != 0 && (days & (1 << (k.get(Calendar.DAY_OF_WEEK) - 1))) == 0) continue;
            k.set(Calendar.HOUR_OF_DAY, h);
            k.set(Calendar.MINUTE, m);
            k.set(Calendar.SECOND, 0);
            k.set(Calendar.MILLISECOND, 0);
            // a time the clock skips (02:30 on the spring-forward night) comes out an hour later, when the clock gets there
            long t = k.getTimeInMillis();
            if (t > after) return t;
        }
        return 0;
    }

    static int dateOf(long t, TimeZone tz) {
        Calendar k = Calendar.getInstance(tz);
        k.setTimeInMillis(t);
        return k.get(Calendar.YEAR) * 10000 + (k.get(Calendar.MONTH) + 1) * 100 + k.get(Calendar.DAY_OF_MONTH);
    }

    /** h:m on date (yyyymmdd) in tz; 0 for no date. */
    static long at(int date, int h, int m, TimeZone tz) {
        if (date <= 0) return 0;
        Calendar k = Calendar.getInstance(tz);
        k.clear();
        k.set(date / 10000, (date / 100) % 100 - 1, date % 100, h, m, 0);
        return k.getTimeInMillis();
    }

    /** When it rings next after `after` (0: off, or a one-off whose time has gone). */
    static long next(Alarm a, long after, TimeZone tz) {
        if (!a.on) return 0;
        if (a.days != 0) return nextTrigger(a.h, a.m, a.days, after, tz);
        long t = at(a.date, a.h, a.m, tz);
        return t > after ? t : 0;
    }

    static final class Plan {
        long at;                                   // the soonest ring (may be just past: AlarmManager then fires it at once)
        final List<String> ids = new ArrayList<>(), off = new ArrayList<>();   // off: one-offs whose time went by unrung
    }

    /**
     * What to set: the soonest ring and every alarm sharing it. pendAt/pend: what was set last and hasn't fired. If its
     * time came in the last 10 min without the receiver running (the phone restarted right then), it rings now.
     * lastFire: the ring just handled, so a repeating alarm never comes round again inside the same second.
     */
    static Plan plan(List<Alarm> list, long now, TimeZone tz, long pendAt, Collection<String> pend, long lastFire) {
        Plan p = new Plan();
        boolean due = pendAt > 0 && pendAt <= now && now - pendAt <= LATE;
        long after = Math.max(now, lastFire + 1000);
        for (Alarm a : list) {
            if (!a.on) continue;
            long t;
            if (due && pend.contains(a.id)) {
                t = pendAt;
            } else {
                t = next(a, after, tz);
                if (t == 0) {
                    if (a.days == 0) p.off.add(a.id);
                    continue;
                }
            }
            if (p.at == 0 || t < p.at) {
                p.at = t;
                p.ids.clear();
            }
            if (t == p.at) p.ids.add(a.id);
        }
        return p;
    }

    /** One line, no control characters, at most 80 characters (whole emoji: counted in code points). */
    static String clip(String s) {
        if (s == null) return "";
        String t = s.replaceAll("[\\p{Cntrl}\\u2028\\u2029]", " ").replaceAll("\\s+", " ").trim();
        if (t.codePointCount(0, t.length()) > TEXT_MAX) t = t.substring(0, t.offsetByCodePoints(0, TEXT_MAX)).trim();
        return t;
    }

    /** The page's {h, m, days:[0-6], text, on}, checked; null if it isn't one. */
    static Alarm clean(JSONObject in) {
        if (in == null || !in.has("h") || !in.has("m")) return null;
        int h = in.optInt("h", -1), m = in.optInt("m", -1);
        if (h < 0 || h > 23 || m < 0 || m > 59) return null;
        int days = 0;
        JSONArray d = in.optJSONArray("days");
        if (d != null) {
            if (d.length() > 7) return null;
            for (int i = 0; i < d.length(); i++) {
                int x = d.optInt(i, -1);
                if (x < 0 || x > 6) return null;
                days |= 1 << x;
            }
        }
        Alarm a = new Alarm();
        a.h = h;
        a.m = m;
        a.days = days;
        a.text = clip(in.optString("text", ""));
        a.on = in.optBoolean("on", true);
        return a;
    }

    static List<Alarm> parse(String json) {
        List<Alarm> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(json == null || json.isEmpty() ? "[]" : json);
            for (int i = 0; i < a.length() && out.size() < MAX; i++) {
                JSONObject o = a.optJSONObject(i);
                if (o != null && o.optString("id", "").matches("[a-z0-9]{8}")) out.add(Alarm.of(o));
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    /** Two alarms at once ring as one, showing both reminders. */
    static String merge(String a, String b) {
        Set<String> s = new LinkedHashSet<>();
        for (String x : new String[] { a, b }) {
            if (x == null) continue;
            for (String y : x.split(" · ")) if (!y.trim().isEmpty()) s.add(y.trim());
        }
        String t = String.join(" · ", s);
        return t.length() > 240 ? t.substring(0, 240) : t;
    }

    // ------------------------------------------------------------------ storage and AlarmManager

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static List<Alarm> load(SharedPreferences p) {
        return parse(p.getString(LIST, "[]"));
    }

    private static String dump(List<Alarm> list) throws Exception {
        JSONArray a = new JSONArray();
        for (Alarm x : list) a.put(x.json());
        return a.toString();
    }

    private static List<String> ids(SharedPreferences p) {
        List<String> out = new ArrayList<>();
        for (String s : p.getString(IDS, "").split(",")) if (!s.isEmpty()) out.add(s);
        return out;
    }

    /** Sets (or clears) the one AlarmManager alarm for the soonest ring. Returns its time, 0 for none. */
    static synchronized long schedule(Context c) {
        try {
            SharedPreferences p = prefs(c);
            List<Alarm> list = load(p);
            Plan pl = plan(list, System.currentTimeMillis(), TimeZone.getDefault(), p.getLong(AT, 0), ids(p), p.getLong(LAST_FIRE, 0));
            SharedPreferences.Editor e = p.edit();
            if (!pl.off.isEmpty()) {
                for (Alarm a : list) if (pl.off.contains(a.id)) a.on = false;
                e.putString(LIST, dump(list));
            }
            e.putLong(AT, pl.at).putString(IDS, String.join(",", pl.ids)).commit();
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            PendingIntent op = fireIntent(c, pl.at);
            if (pl.at == 0) {
                am.cancel(op);
                return 0;
            }
            PendingIntent show = PendingIntent.getActivity(c, 1, new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                    .setClass(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            try {
                if (exactOk(c)) {
                    am.setAlarmClock(new AlarmManager.AlarmClockInfo(pl.at, show), op);
                    return pl.at;
                }
            } catch (SecurityException ignored) {   // exact alarms switched off between the check and the call
            }
            // no exact alarms allowed (Android 12, switched off in Settings): the closest Android gives without. The page says so.
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, pl.at, op);
            return pl.at;
        } catch (Exception e) {
            return 0;
        }
    }

    private static PendingIntent fireIntent(Context c, long at) {
        return PendingIntent.getBroadcast(c, 0, new Intent(c, AlarmReceiver.class).setAction(AlarmReceiver.FIRE).putExtra(EXTRA_AT, at),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** AlarmManager fired (at: the time it was set for). Rings what was due, turns one-offs off and sets the next. */
    static void fire(Context c, long at) {
        List<Alarm> ringing = new ArrayList<>();
        synchronized (Alarms.class) {
            try {
                SharedPreferences p = prefs(c);
                if (at <= 0 || at != p.getLong(AT, 0)) return;   // an alarm from before the last change: just set what's right now
                List<String> due = ids(p);
                List<Alarm> list = load(p);
                for (Alarm a : list) {
                    if (!a.on || !due.contains(a.id)) continue;
                    ringing.add(a);
                    if (a.days == 0) a.on = false;
                }
                p.edit().putString(LIST, dump(list)).putLong(AT, 0).putString(IDS, "").putLong(LAST_FIRE, at).commit();
            } catch (Exception e) {
                return;
            } finally {
                schedule(c);
            }
        }
        if (ringing.isEmpty()) return;
        String text = "";
        for (Alarm a : ringing) text = merge(text, a.text);
        if (System.currentTimeMillis() - at > LATE) {   // the phone was off or asleep past it: say so, don't ring an hour late
            record(c, at, 0, true, false);
            missed(c, at, text);
            return;
        }
        AlarmService.start(c, at, text);
    }

    /** How it ended, for the page's note next time it opens (taps: no motion sensor, so it was 40 taps). */
    static void record(Context c, long at, long sec, boolean missed, boolean taps) {
        try {
            JSONObject o = new JSONObject().put("at", at).put("up", System.currentTimeMillis()).put("sec", Math.max(0, sec)).put("missed", missed).put("taps", taps);
            prefs(c).edit().putString(LAST, o.toString()).putLong(DONE_AT, at).commit();
        } catch (Exception ignored) {
        }
    }

    /** The ring at `at` already ended (shaken off or timed out): an old notification can't start it again. */
    static boolean handled(Context c, long at) {
        return prefs(c).getLong(DONE_AT, 0) == at;
    }

    static void seen(Context c) {
        prefs(c).edit().remove(LAST).apply();
    }

    // ------------------------------------------------------------------ permissions

    static boolean exactOk(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        try {
            return ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).canScheduleExactAlarms();
        } catch (Exception e) {
            return false;
        }
    }

    /** Notifications allowed (Android 13+: the runtime permission too) and the alarm channel not switched off. */
    static boolean notifyOk(Context c) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            if (nm == null || !nm.areNotificationsEnabled()) return false;
            return !channelOff(c, nm);
        } catch (Exception e) {
            return true;
        }
    }

    private static boolean channelOff(Context c, NotificationManager nm) {
        if (Build.VERSION.SDK_INT < 26) return false;
        channels(c);
        NotificationChannel ch = nm.getNotificationChannel(CH_RING);
        return ch != null && ch.getImportance() == NotificationManager.IMPORTANCE_NONE;
    }

    /** Android 14 lets the user (or the store) take away full-screen alarms; then only a heads-up shows. */
    static boolean fullScreenOk(Context c) {
        if (Build.VERSION.SDK_INT < 34) return true;
        try {
            return c.getSystemService(NotificationManager.class).canUseFullScreenIntent();
        } catch (Exception e) {
            return true;
        }
    }

    static boolean askedNotify(Context c) {
        return prefs(c).getBoolean(ASKED, false);
    }

    static void markAsked(Context c) {
        prefs(c).edit().putBoolean(ASKED, true).apply();
    }

    /** The Settings screens that fix "exact" | "fullscreen" | "notify", most specific first. */
    static List<Intent> fixIntents(Context c, String which) {
        String pkg = c.getPackageName();
        Uri u = Uri.fromParts("package", pkg, null);
        List<Intent> tries = new ArrayList<>();
        if ("exact".equals(which) && Build.VERSION.SDK_INT >= 31) {
            tries.add(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, u));
        } else if ("fullscreen".equals(which) && Build.VERSION.SDK_INT >= 34) {
            tries.add(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, u));
        } else if ("notify".equals(which) && Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            if (nm != null && nm.areNotificationsEnabled() && channelOff(c, nm)) {
                tries.add(new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg).putExtra(Settings.EXTRA_CHANNEL_ID, CH_RING));
            }
            tries.add(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg));
        }
        tries.add(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, u));
        return tries;
    }

    // ------------------------------------------------------------------ notifications

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CH_RING) != null) return;
        // the sound and the buzz come from AlarmService (alarm volume, getting louder), so the channel itself is silent
        NotificationChannel ring = new NotificationChannel(CH_RING, "Alarms", NotificationManager.IMPORTANCE_HIGH);
        ring.setDescription("Your wake-up alarms. Shake the phone to stop one.");
        ring.setSound(null, null);
        ring.enableVibration(false);
        ring.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ring.setBypassDnd(true);
        NotificationChannel missed = new NotificationChannel(CH_MISSED, "Missed alarms", NotificationManager.IMPORTANCE_DEFAULT);
        missed.setDescription("An alarm rang for 10 minutes and nobody stopped it.");
        nm.createNotificationChannel(ring);
        nm.createNotificationChannel(missed);
    }

    static String clock(Context c, long t) {
        try {
            return DateFormat.getTimeFormat(c).format(new Date(t));
        } catch (Exception e) {
            return "";
        }
    }

    /** The ringing notification: full screen over the lock screen (AlarmActivity), a heads-up while the phone is in use. */
    @SuppressWarnings("deprecation")
    static Notification ringNote(Context c, long at, String text) {
        channels(c);
        String t = text == null ? "" : text;
        PendingIntent full = PendingIntent.getActivity(c, 2, AlarmActivity.intent(c, at, t), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // swiped away while it rings: it comes straight back (only shaking stops it)
        PendingIntent back = PendingIntent.getService(c, 3, new Intent(c, AlarmService.class).setAction(AlarmService.REPOST),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH_RING) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_alarm).setColor(GOLD)
                .setContentTitle("Alarm · " + clock(c, at))
                .setContentText(t.isEmpty() ? "Shake your phone to stop it" : t)
                .setStyle(new Notification.BigTextStyle().bigText(t.isEmpty() ? "Shake your phone to stop it." : t + "\nShake your phone to stop it."))
                .setCategory(Notification.CATEGORY_ALARM).setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true).setAutoCancel(false).setShowWhen(true).setWhen(at)
                .setContentIntent(full).setFullScreenIntent(full, true).setDeleteIntent(back);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_MAX).setDefaults(0);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    /** No ringing service allowed (it shouldn't happen for an exact alarm): the notification alone; its screen starts the sound. */
    static void postRing(Context c, long at, String text) {
        try {
            c.getSystemService(NotificationManager.class).notify(NOTE_RING, ringNote(c, at, text));
        } catch (Exception ignored) {
        }
    }

    static void missed(Context c, long at, String text) {
        try {
            channels(c);
            String t = text == null ? "" : text;
            PendingIntent open = PendingIntent.getActivity(c, 4, new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                    .setClass(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH_MISSED) : new Notification.Builder(c);
            b.setSmallIcon(R.drawable.ic_stat_alarm).setColor(GOLD)
                    .setContentTitle("Missed alarm · " + clock(c, at))
                    .setContentText(t.isEmpty() ? "Nobody stopped it, so it went quiet." : t)
                    .setStyle(new Notification.BigTextStyle().bigText(t.isEmpty() ? "Nobody stopped it, so it went quiet." : "Reminder: " + t))
                    .setCategory(Notification.CATEGORY_REMINDER).setShowWhen(true).setWhen(at).setAutoCancel(true).setContentIntent(open);
            c.getSystemService(NotificationManager.class).notify(NOTE_MISSED, b.build());
        } catch (Exception ignored) {
        }
    }

    // ------------------------------------------------------------------ the bridge (JSON strings out)

    private static String why(String w) {
        return "{\"ok\":false,\"why\":\"" + w + "\"}";
    }

    static String statusJson(Context c) {
        try {
            SharedPreferences p = prefs(c);
            JSONObject o = new JSONObject().put("v", 1).put("sdk", Build.VERSION.SDK_INT).put("exact", exactOk(c)).put("notify", notifyOk(c))
                    .put("fullScreen", fullScreenOk(c)).put("asked", askedNotify(c)).put("h24", DateFormat.is24HourFormat(c))
                    .put("sensor", AlarmActivity.hasSensor(c)).put("ringing", AlarmService.ringing).put("next", p.getLong(AT, 0));
            String last = p.getString(LAST, null);
            if (last != null) o.put("woke", new JSONObject(last));
            return o.toString();
        } catch (Exception e) {
            return "{\"v\":1,\"error\":\"failed\"}";
        }
    }

    /** {ok, alarms:[{id, h, m, days:[0-6], text, on, next}], next, max}, in the order they were made. */
    static synchronized String listJson(Context c) {
        try {
            SharedPreferences p = prefs(c);
            long now = System.currentTimeMillis();
            TimeZone tz = TimeZone.getDefault();
            JSONArray a = new JSONArray();
            long due = p.getLong(AT, 0);
            List<String> ids = ids(p);
            for (Alarm x : load(p)) a.put(x.page(due > 0 && due <= now && ids.contains(x.id) ? due : next(x, now, tz)));
            return new JSONObject().put("ok", true).put("alarms", a).put("next", due).put("max", MAX).toString();
        } catch (Exception e) {
            return why("failed");
        }
    }

    /** New (no id, or one we don't have) or a change: {ok, alarm, next} | {ok:false, why: "bad" | "full" | "failed"}. */
    static synchronized String saveJson(Context c, String json) {
        try {
            JSONObject in = new JSONObject(json == null ? "" : json);
            Alarm a = clean(in);
            if (a == null) return why("bad");
            SharedPreferences p = prefs(c);
            List<Alarm> list = load(p);
            String id = in.optString("id", "");
            int at = -1;
            for (int i = 0; i < list.size(); i++) if (list.get(i).id.equals(id)) at = i;
            if (at < 0) {
                if (list.size() >= MAX) return why("full");
                a.id = newId(list);
                list.add(a);
            } else {
                a.id = id;
                list.set(at, a);
            }
            long now = System.currentTimeMillis();
            TimeZone tz = TimeZone.getDefault();
            if (a.days == 0) a.date = dateOf(nextTrigger(a.h, a.m, 0, now, tz), tz);   // once: the next time the clock shows it
            // changed while it was due to ring this very moment: it rings at its new time instead
            List<String> pend = ids(p);
            pend.remove(a.id);
            p.edit().putString(LIST, dump(list)).putString(IDS, String.join(",", pend)).commit();
            long next = schedule(c);
            return new JSONObject().put("ok", true).put("alarm", a.page(next(a, now, tz))).put("next", next).toString();
        } catch (Exception e) {
            return why("failed");
        }
    }

    static synchronized String deleteJson(Context c, String id) {
        try {
            if (id == null || !id.matches("[a-z0-9]{8}")) return why("bad");
            SharedPreferences p = prefs(c);
            List<Alarm> list = load(p);
            boolean gone = false;
            for (int i = list.size() - 1; i >= 0; i--) if (list.get(i).id.equals(id)) { list.remove(i); gone = true; }
            if (!gone) return why("gone");
            p.edit().putString(LIST, dump(list)).commit();
            return new JSONObject().put("ok", true).put("next", schedule(c)).toString();
        } catch (Exception e) {
            return why("failed");
        }
    }

    private static String newId(List<Alarm> list) {
        while (true) {
            StringBuilder b = new StringBuilder();
            for (int i = 0; i < 8; i++) b.append("abcdefghijklmnopqrstuvwxyz0123456789".charAt(RND.nextInt(36)));
            String id = b.toString();
            boolean used = false;
            for (Alarm a : list) used |= a.id.equals(id);
            if (!used) return id;
        }
    }
}
