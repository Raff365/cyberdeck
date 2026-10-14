package app.levelup;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.AtomicFile;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Calendar;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Homework mode. While a session runs, LimitService blocks every app you can open from the launcher except the
 * protected ones (ScreenTime.isProtected: phone, texts, Settings, home, keyboards, camera, clock, contacts, LEVEL UP)
 * and the parent's allow list. A session ends with a live photo once the minimum time has counted (JS takes the
 * photo and keeps it; this records its id), with the parent's PIN, by itself after 4 hours, or (logged as such)
 * while the blocker is off. JS only shows and asks: every rule is checked here, and the log lives here too, so
 * Erase all or an imported backup can't rewrite it. Never throws to callers.
 *
 * Time: the minimum counts time since boot (SystemClock.elapsedRealtime), so moving the clock forward doesn't
 * shorten it (the change is logged). A restart costs at most the minute since the last checkpoint, and a session
 * can't outlast 4 hours by either clock, so a phone that was off all evening never wakes up locked.
 * PIN: 4-6 digits, salted and hashed (SHA-256, iterated) in a file under noBackupFilesDir, so it never reaches a
 * backup; 5 wrong tries lock it for 5 minutes, then 10, 20, 40, 60. Clearing the app's data is the only reset.
 */
final class Homework {
    static final String PREFS = "homework";
    private static final String CFG = "cfg", SES = "ses", LOG = "log", DONE = "doneDay", SINCE = "since", PIN_FILE = "parent-pin.json";
    static final long MIN = 60_000L, CAP = 4 * 60 * MIN, PARENT_MS = 3 * MIN;
    private static final long SAVE_EVERY = 15_000L, JUMP = 2 * MIN, LOCK_MAX = 60 * MIN;
    static final int WINDOW = 180;   // a scheduled start still happens up to 3 hours late (phone off at 4:00)
    static final int[] MINS = { 15, 30, 45, 60, 90 };
    private static final int LOG_MAX = 200, ALLOW_MAX = 80, ITER = 20_000, TRIES = 5, NOTE = 80;
    private static final String ID = "[A-Za-z0-9]{4,24}", DIGITS = "\\d{4,6}";

    /** Pre-ticked in the allow-list picker when they're on the phone. */
    static final Set<String> EDU = new HashSet<>(Arrays.asList(
            "com.google.android.apps.classroom", "com.google.android.apps.docs.editors.docs", "com.google.android.apps.docs.editors.sheets",
            "com.google.android.apps.docs.editors.slides", "com.google.android.apps.docs", "com.google.android.calculator",
            "com.android.calculator2", "com.sec.android.app.popupcalculator", "com.miui.calculator", "com.oneplus.calculator",
            "com.coloros.calculator", "com.google.android.apps.translate", "com.merriamwebster", "com.dictionary",
            "org.khanacademy.android", "com.duolingo", "com.quizlet.quizletandroid", "com.microsoft.teams", "com.microsoft.office.word",
            "com.microsoft.office.onenote", "com.microsoft.office.officehubrow", "com.instructure.candroid", "com.schoology.app",
            "com.seesaw.seesaw"));

    private static volatile long parentUntil;   // elapsedRealtime while the parent's PIN is "open" (process memory only)

    private Homework() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static int bootCount(Context c) {
        try {
            return Settings.Global.getInt(c.getContentResolver(), Settings.Global.BOOT_COUNT, -1);
        } catch (Throwable t) {
            return -1;
        }
    }

    // ------------------------------------------------------------------ settings (the parent's, PIN-guarded)

    static final class Cfg {
        int min = 45, days = 0b0111110, at = 16 * 60;   // Mon-Fri 4:00 pm, off till the parent switches it on
        boolean on, set;                                // set: saved at least once (setup step 2)
        String rule = "photo";                          // "photo" | "parent": the photo, then a parent's PIN
        final Set<String> allow = new LinkedHashSet<>();

        JSONObject json() throws JSONException {
            JSONArray d = new JSONArray();
            for (int i = 0; i < 7; i++) if ((days & (1 << i)) != 0) d.put(i);
            return new JSONObject().put("min", min).put("allow", new JSONArray(allow)).put("on", on).put("days", d).put("at", at)
                    .put("rule", rule).put("set", set);
        }

        /** Sanitized: unknown values fall back to the defaults; protected apps and LEVEL UP itself are dropped (always allowed anyway). */
        static Cfg from(JSONObject o, Set<String> prot) {
            Cfg k = new Cfg();
            if (o == null) return k;
            int m = o.optInt("min", 45);
            for (int x : MINS) if (x == m) k.min = m;
            JSONArray d = o.optJSONArray("days");
            if (d != null) {
                int b = 0;
                for (int i = 0; i < d.length(); i++) { int v = d.optInt(i, -1); if (v >= 0 && v < 7) b |= 1 << v; }
                k.days = b;
            }
            int at = o.optInt("at", -1);
            if (at >= 0 && at < 24 * 60) k.at = at;
            k.on = o.optBoolean("on", false) && k.days != 0;
            k.set = o.optBoolean("set", false);
            if ("parent".equals(o.optString("rule"))) k.rule = "parent";
            JSONArray a = o.optJSONArray("allow");
            for (int i = 0; a != null && i < a.length() && k.allow.size() < ALLOW_MAX; i++) {
                String p = a.optString(i, "");
                if (!p.isEmpty() && p.length() <= 200 && (prot == null || !prot.contains(p))) k.allow.add(p);
            }
            return k;
        }
    }

    private static Cfg cfg(SharedPreferences p) {
        try {
            return Cfg.from(new JSONObject(p.getString(CFG, "{}")), null);
        } catch (Exception e) {
            return new Cfg();
        }
    }

    // ------------------------------------------------------------------ the running session

    static final class Session {
        String id = "", why = "m", rule = "photo", ph = "";
        long start, minMs, acc, ckU, ckW;   // acc: time that counted; ck*: the last checkpoint (up, wall)
        int ckB = -1;                        // the boot it was taken in (Settings.Global.BOOT_COUNT)
        boolean off;                         // the blocker is off right now (an "off" note is open)
        final Set<String> allow = new LinkedHashSet<>();
        JSONArray tp = new JSONArray();      // [[time, "off" | "on" | "clock" | "boot"]]

        boolean allows(String pkg) { return pkg != null && allow.contains(pkg); }

        long left() { return Math.max(0, minMs - acc); }

        void note(long t, String k) {
            int n = tp.length();
            JSONArray last = n > 0 ? tp.optJSONArray(n - 1) : null;
            // a clock fiddled with twice in a row is one note
            if (last != null && k.equals(last.optString(1)) && "clock".equals(k) && Math.abs(t - last.optLong(0)) < JUMP) return;
            if (n >= 40) return;
            tp.put(new JSONArray().put(t).put(k));
        }

        /**
         * Counts the time since the last checkpoint by time since boot. A wall clock that moved more than 2 minutes
         * apart from it was changed: logged. A restart (another boot) counts nothing for the gap: the phone was off.
         * Returns true when the checkpoint should be saved.
         */
        boolean advance(long now, long up, int boot) {
            boolean same = boot == ckB && up >= ckU, dirty;
            if (same) {
                long d = up - ckU, w = now - ckW;
                if (d < SAVE_EVERY && Math.abs(w - d) <= JUMP) return false;   // nothing worth a write yet
                acc += d;
                if (Math.abs(w - d) > JUMP) note(now, "clock");
                dirty = true;
            } else {
                note(now, "boot");
                dirty = true;
            }
            ckU = up;
            ckW = now;
            ckB = boot;
            return dirty;
        }

        boolean tampered() {
            for (int i = 0; i < tp.length(); i++) {
                String k = tp.optJSONArray(i) == null ? "" : tp.optJSONArray(i).optString(1);
                if ("off".equals(k) || "clock".equals(k)) return true;
            }
            return false;
        }

        JSONObject json() throws JSONException {
            return new JSONObject().put("id", id).put("why", why).put("rule", rule).put("ph", ph).put("start", start).put("min", minMs)
                    .put("acc", acc).put("ckU", ckU).put("ckW", ckW).put("ckB", ckB).put("off", off).put("allow", new JSONArray(allow)).put("tp", tp);
        }

        static Session from(JSONObject o) {
            if (o == null || o.optLong("start") <= 0) return null;
            Session s = new Session();
            s.id = o.optString("id", "");
            s.why = "s".equals(o.optString("why")) ? "s" : "m";
            s.rule = "parent".equals(o.optString("rule")) ? "parent" : "photo";
            s.ph = o.optString("ph", "");
            s.start = o.optLong("start");
            s.minMs = Math.max(0, o.optLong("min"));
            s.acc = Math.max(0, o.optLong("acc"));
            s.ckU = o.optLong("ckU");
            s.ckW = o.optLong("ckW");
            s.ckB = o.optInt("ckB", -1);
            s.off = o.optBoolean("off");
            JSONArray a = o.optJSONArray("allow");
            for (int i = 0; a != null && i < a.length(); i++) { String p = a.optString(i, ""); if (!p.isEmpty()) s.allow.add(p); }
            JSONArray t = o.optJSONArray("tp");
            if (t != null) s.tp = t;
            return s;
        }
    }

    private static Session load(SharedPreferences p) {
        try {
            String j = p.getString(SES, null);
            return j == null ? null : Session.from(new JSONObject(j));
        } catch (Exception e) {
            return null;
        }
    }

    private static void store(SharedPreferences p, Session s) {
        try {
            p.edit().putString(SES, s.json().toString()).apply();
        } catch (Exception ignored) {
        }
    }

    /**
     * The running session, brought up to date (time counted, the blocker's state noted, the 4-hour end), or a
     * scheduled one started when it's due; null when none runs. LimitService calls this on every check.
     */
    static Session tick(Context c) {
        return tick(c, System.currentTimeMillis(), SystemClock.elapsedRealtime(), bootCount(c), ScreenTime.blockerOn(c));
    }

    static synchronized Session tick(Context c, long now, long up, int boot, boolean blocker) {
        SharedPreferences p = prefs(c);
        Session s = load(p);
        if (s != null) {
            boolean dirty = s.advance(now, up, boot);
            if (!blocker && !s.off) { s.note(now, "off"); s.off = true; dirty = true; }
            else if (blocker && s.off) { s.note(now, "on"); s.off = false; dirty = true; }
            if (s.acc >= CAP || (now >= s.start && now - s.start >= CAP)) {
                end(p, s, now, "time", null, false);
                return null;
            }
            if (dirty) store(p, s);
            return s;
        }
        Cfg k = cfg(p);
        if (k.on && k.set && due(k.days, k.at, now) && !ScreenTime.dayKey(now).equals(p.getString(DONE, "")) && pinIsSet(c)) {
            return start(p, k, now, up, boot, blocker, "s");
        }
        return null;
    }

    private static Session start(SharedPreferences p, Cfg k, long now, long up, int boot, boolean blocker, String why) {
        Session s = new Session();
        s.id = newId();
        s.why = why;
        s.rule = k.rule;
        s.start = now;
        s.minMs = k.min * MIN;
        s.allow.addAll(k.allow);
        s.ckU = up;
        s.ckW = now;
        s.ckB = boot;
        if (!blocker) { s.note(now, "off"); s.off = true; }
        try {
            SharedPreferences.Editor e = p.edit().putString(SES, s.json().toString());
            if ("s".equals(why)) e.putString(DONE, ScreenTime.dayKey(now));   // once a day, however it ends
            e.commit();
        } catch (Exception ignored) {
        }
        return s;
    }

    /** Ends the session into the log: "proof" | "pin" | "time" | "off". */
    private static JSONObject end(SharedPreferences p, Session s, long now, String how, String note, boolean parentChecked) {
        try {
            JSONObject e = new JSONObject().put("id", s.id.matches(ID) ? s.id : newId()).put("t0", s.start).put("t1", Math.max(now, s.start))
                    .put("m", (int) Math.min(240, s.acc / MIN)).put("why", s.why).put("how", how).put("tp", s.tp);
            if (s.ph.matches(ID)) e.put("ph", s.ph);
            if (note != null && !note.isEmpty()) e.put("n", note);
            if (parentChecked) e.put("pc", 1);
            JSONArray log = log(p), out = new JSONArray();
            log.put(e);
            for (int i = Math.max(0, log.length() - LOG_MAX); i < log.length(); i++) out.put(log.get(i));
            SharedPreferences.Editor ed = p.edit().remove(SES).putString(LOG, out.toString());
            if ("proof".equals(how)) ed.putString(DONE, ScreenTime.dayKey(now));   // homework's done today: no scheduled one later
            ed.commit();
            return e;
        } catch (Exception ex) {
            p.edit().remove(SES).commit();   // never leave a session that can't end
            return null;
        }
    }

    private static JSONArray log(SharedPreferences p) {
        try {
            return new JSONArray(p.getString(LOG, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static String newId() {
        byte[] b = new byte[6];
        new SecureRandom().nextBytes(b);
        StringBuilder s = new StringBuilder("hw");
        for (byte x : b) s.append(String.format(Locale.US, "%02x", x & 0xff));
        return s.toString();
    }

    /** The blocker was just unbound: switched off in Settings (not an app update or a crash, where it stays listed) is logged now. */
    static synchronized void blockerGone(Context c) {
        try {
            SharedPreferences p = prefs(c);
            Session s = load(p);
            if (s == null || s.off || ScreenTime.blockerOn(c)) return;
            s.note(System.currentTimeMillis(), "off");
            s.off = true;
            p.edit().putString(SES, s.json().toString()).commit();
        } catch (Exception ignored) {
        }
    }

    // ------------------------------------------------------------------ the schedule

    /** On one of the days (bit 0 = Sunday), from the start time to 3 hours after it (never past midnight). */
    static boolean due(int days, int at, long now) {
        Calendar k = Calendar.getInstance();
        k.setTimeInMillis(now);
        int dow = k.get(Calendar.DAY_OF_WEEK) - 1, m = k.get(Calendar.HOUR_OF_DAY) * 60 + k.get(Calendar.MINUTE);
        return (days & (1 << dow)) != 0 && m >= at && m < at + WINDOW;
    }

    /** When the next scheduled session starts (one due right now: its start time, in the past), or 0. */
    static long nextStart(int days, int at, long now, boolean doneToday) {
        if ((days & 127) == 0) return 0;
        long d0 = ScreenTime.dayStart(now);
        for (int i = 0; i <= 7; i++) {
            Calendar k = Calendar.getInstance();
            k.setTimeInMillis(ScreenTime.addDays(d0, i));
            if ((days & (1 << (k.get(Calendar.DAY_OF_WEEK) - 1))) == 0) continue;
            k.set(Calendar.HOUR_OF_DAY, at / 60);
            k.set(Calendar.MINUTE, at % 60);
            long t = k.getTimeInMillis();
            if (i == 0 && (doneToday || now >= t + WINDOW * MIN)) continue;
            return t;
        }
        return 0;
    }

    /** How long LimitService waits before looking again: every minute in a session, else till the next start (max 15 min). */
    static long nextTickMs(Context c, Session s) {
        if (s != null) return MIN;
        try {
            SharedPreferences p = prefs(c);
            Cfg k = cfg(p);
            long now = System.currentTimeMillis();
            if (!k.on) return 15 * MIN;
            long t = nextStart(k.days, k.at, now, ScreenTime.dayKey(now).equals(p.getString(DONE, "")));
            return t > now ? Math.max(1000, Math.min(t - now + 500, 15 * MIN)) : 15 * MIN;
        } catch (Exception e) {
            return 15 * MIN;
        }
    }

    // ------------------------------------------------------------------ the parent's PIN

    private static AtomicFile pinFile(Context c) {
        return new AtomicFile(new java.io.File(c.getNoBackupFilesDir(), PIN_FILE));
    }

    private static JSONObject pinRead(Context c) {
        try {
            return new JSONObject(new String(pinFile(c).readFully(), StandardCharsets.UTF_8));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private static boolean pinWrite(Context c, JSONObject o) {
        AtomicFile f = pinFile(c);
        FileOutputStream os = null;
        try {
            os = f.startWrite();
            os.write(o.toString().getBytes(StandardCharsets.UTF_8));
            f.finishWrite(os);
            return true;
        } catch (Exception e) {
            if (os != null) f.failWrite(os);
            return false;
        }
    }

    static boolean pinIsSet(Context c) {
        return pinRead(c).optString("hash", "").length() == 64;
    }

    /** SHA-256 over salt + PIN, then over salt + the last digest, ITER times. Hex. */
    static String hash(byte[] salt, String pin) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] h = pin.getBytes(StandardCharsets.UTF_8);
            for (int i = 0; i < ITER; i++) {
                md.reset();
                md.update(salt);
                md.update(h);
                h = md.digest();
            }
            StringBuilder s = new StringBuilder();
            for (byte x : h) s.append(String.format(Locale.US, "%02x", x & 0xff));
            return s.toString();
        } catch (Exception e) {
            return "";
        }
    }

    static byte[] unhex(String s) {
        if (s == null || s.length() % 2 != 0) return new byte[0];
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return b;
    }

    /** The n-th lockout in a row: 5, 10, 20, 40, then 60 minutes. */
    static long lockMs(int n) {
        return Math.min(LOCK_MAX, 5 * MIN << Math.max(0, Math.min(n - 1, 4)));
    }

    /** Lockout ms left. In the same boot, time since boot decides (moving the clock doesn't end it); after a restart, the wall clock. */
    static long lockLeft(JSONObject o, long now, long up, int boot) {
        long w = o.optLong("lw"), u = o.optLong("lu");
        if (w == 0) return 0;
        if (boot >= 0 && boot == o.optInt("lb", -9)) return Math.max(0, Math.min(u - up, LOCK_MAX));
        long left = w - now;
        return left > 0 && left <= LOCK_MAX ? left : 0;
    }

    static void parentTouch(long up) {
        parentUntil = up + PARENT_MS;
    }

    static void pinLock() {
        parentUntil = 0;
    }

    /** A parent typed the PIN in the last 3 minutes (each PIN-guarded change restarts the 3 minutes). */
    static boolean parentOk(Context c) {
        long u = parentUntil, up = SystemClock.elapsedRealtime();
        return u > 0 && up < u && u - up <= PARENT_MS && pinIsSet(c);
    }

    private static boolean parentUse(Context c) {
        if (!parentOk(c)) return false;
        parentTouch(SystemClock.elapsedRealtime());
        return true;
    }

    /** {ok} | {ok:false, why: "nopin" | "wrong" | "locked", left: tries left, wait: lockout ms, until}. Opens the parent's 3 minutes. */
    static synchronized JSONObject attempt(Context c, String pin, long now, long up, int boot) throws JSONException {
        JSONObject o = pinRead(c);
        String h = o.optString("hash", "");
        if (h.length() != 64) return new JSONObject().put("ok", false).put("why", "nopin");
        long wait = lockLeft(o, now, up, boot);
        if (wait > 0) return new JSONObject().put("ok", false).put("why", "locked").put("wait", wait).put("until", now + wait).put("left", 0);
        boolean good = pin != null && pin.matches(DIGITS)
                && MessageDigest.isEqual(hash(unhex(o.optString("salt")), pin).getBytes(StandardCharsets.UTF_8), h.getBytes(StandardCharsets.UTF_8));
        if (good) {
            o.put("f", 0).put("n", 0).remove("lw");
            o.remove("lu");
            o.remove("lb");
            pinWrite(c, o);
            parentTouch(up);
            return new JSONObject().put("ok", true);
        }
        int f = o.optInt("f") + 1;
        if (f >= TRIES) {
            int n = o.optInt("n") + 1;
            long ms = lockMs(n);
            o.put("f", 0).put("n", n).put("lw", now + ms).put("lu", up + ms).put("lb", boot);
            pinWrite(c, o);
            return new JSONObject().put("ok", false).put("why", "locked").put("wait", ms).put("until", now + ms).put("left", 0);
        }
        o.put("f", f);
        pinWrite(c, o);
        return new JSONObject().put("ok", false).put("why", "wrong").put("left", TRIES - f);
    }

    static String pinCheckJson(Context c, String pin) {
        try {
            return attempt(c, pin, System.currentTimeMillis(), SystemClock.elapsedRealtime(), bootCount(c)).toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"why\":\"failed\"}";
        }
    }

    /** A new PIN (4-6 digits); changing one needs the old one (it counts as a try). Opens the parent's 3 minutes. */
    static synchronized String pinSetJson(Context c, String old, String pin) {
        try {
            if (pin == null || !pin.matches(DIGITS)) return why("bad");
            long now = System.currentTimeMillis(), up = SystemClock.elapsedRealtime();
            if (pinIsSet(c)) {
                JSONObject r = attempt(c, old, now, up, bootCount(c));
                if (!r.optBoolean("ok")) return r.toString();
            }
            byte[] salt = new byte[16];
            new SecureRandom().nextBytes(salt);
            StringBuilder hx = new StringBuilder();
            for (byte x : salt) hx.append(String.format(Locale.US, "%02x", x & 0xff));
            JSONObject o = new JSONObject().put("v", 1).put("salt", hx.toString()).put("hash", hash(salt, pin)).put("f", 0).put("n", 0);
            if (!pinWrite(c, o)) return why("failed");
            parentTouch(up);
            return "{\"ok\":true}";
        } catch (Exception e) {
            return why("failed");
        }
    }

    private static String why(String w) {
        return "{\"ok\":false,\"why\":\"" + w + "\"}";
    }

    // ------------------------------------------------------------------ bridge payloads (JSON strings)

    /** Everything the app shows: the PIN's state, the settings, the session, the next scheduled start and the log. */
    static String statusJson(Context c) {
        try {
            Session s = tick(c);
            SharedPreferences p = prefs(c);
            Cfg k = cfg(p);
            long now = System.currentTimeMillis(), up = SystemClock.elapsedRealtime();
            JSONObject pin = pinRead(c);
            boolean set = pin.optString("hash", "").length() == 64, done = ScreenTime.dayKey(now).equals(p.getString(DONE, ""));
            long wait = set ? lockLeft(pin, now, up, bootCount(c)) : 0, since = p.getLong(SINCE, 0);
            if (since <= 0) p.edit().putLong(SINCE, since = now).apply();   // this log's start: a backup's older entries are the app's to keep
            JSONObject o = new JSONObject().put("v", 1).put("pin", set).put("parent", set && parentOk(c)).put("blocker", ScreenTime.blockerOn(c))
                    .put("wait", wait).put("tries", wait > 0 ? 0 : TRIES - pin.optInt("f")).put("cfg", k.json()).put("done", done)
                    .put("next", k.on && k.set ? nextStart(k.days, k.at, now, done) : 0).put("now", now).put("since", since).put("log", log(p));
            if (s != null) {
                o.put("s", new JSONObject().put("id", s.id).put("start", s.start).put("why", s.why).put("rule", s.rule).put("min", s.minMs)
                        .put("acc", s.acc).put("left", s.left()).put("minEnd", now + s.left()).put("capLeft", Math.max(0, Math.min(CAP - s.acc, s.start + CAP - now)))
                        .put("allow", new JSONArray(s.allow)).put("tp", s.tp).put("ph", s.ph.matches(ID) ? s.ph : "").put("off", s.off));
            }
            return o.toString();
        } catch (Exception e) {
            return "{\"v\":1,\"error\":\"failed\"}";
        }
    }

    /** Start now (him or a parent: no PIN needed to start). Needs a PIN set, setup done and the blocker on. */
    static synchronized String startJson(Context c) {
        try {
            if (!pinIsSet(c)) return why("nopin");
            SharedPreferences p = prefs(c);
            Cfg k = cfg(p);
            if (!k.set) return why("setup");
            boolean blocker = ScreenTime.blockerOn(c);
            if (!blocker) return why("blocker");
            if (tick(c) != null) return why("active");
            start(p, k, System.currentTimeMillis(), SystemClock.elapsedRealtime(), bootCount(c), true, "m");
            return "{\"ok\":true}";
        } catch (Exception e) {
            return why("failed");
        }
    }

    /** The live photo was taken (JS keeps it): recorded for this session, only once the minimum time has counted. */
    static synchronized String proofJson(Context c, String id) {
        try {
            Session s = tick(c);
            if (s == null) return why("inactive");
            if (s.left() > 0) return why("early");
            if (id == null || !id.matches(ID)) return why("bad");
            s.ph = id;
            prefs(c).edit().putString(SES, s.json().toString()).commit();
            return "{\"ok\":true}";
        } catch (Exception e) {
            return why("failed");
        }
    }

    /** Finishes with the photo taken in this session, once the minimum has counted (rule "parent": a parent's PIN too). */
    static synchronized String finishJson(Context c, String id, String note) {
        try {
            Session s = tick(c);
            if (s == null) return why("inactive");
            if (s.left() > 0) return new JSONObject().put("ok", false).put("why", "early").put("left", s.left()).toString();
            if (id == null || !id.matches(ID) || !id.equals(s.ph)) return why("noproof");
            boolean pc = "parent".equals(s.rule);
            if (pc && !parentUse(c)) return why("parent");
            JSONObject e = end(prefs(c), s, System.currentTimeMillis(), "proof", clean(note), pc);
            return e == null ? why("failed") : new JSONObject().put("ok", true).put("entry", e).toString();
        } catch (Exception ex) {
            return why("failed");
        }
    }

    /** A parent ends it early (or any time): needs the PIN. */
    static synchronized String endJson(Context c) {
        try {
            if (!pinIsSet(c)) return why("nopin");
            if (!parentUse(c)) return why("pin");
            Session s = tick(c);
            if (s == null) return why("inactive");
            JSONObject e = end(prefs(c), s, System.currentTimeMillis(), "pin", null, false);
            return e == null ? why("failed") : new JSONObject().put("ok", true).put("entry", e).toString();
        } catch (Exception ex) {
            return why("failed");
        }
    }

    /** With the blocker off nothing is locked anyway: he can end it, logged as "blocker off" (no coins). */
    static synchronized String endOffJson(Context c) {
        try {
            Session s = tick(c);
            if (s == null) return why("inactive");
            if (ScreenTime.blockerOn(c)) return why("on");
            JSONObject e = end(prefs(c), s, System.currentTimeMillis(), "off", null, false);
            return e == null ? why("failed") : new JSONObject().put("ok", true).put("entry", e).toString();
        } catch (Exception ex) {
            return why("failed");
        }
    }

    /** The parent's settings: needs the PIN. A changed allow list also applies to a session that's running. */
    static synchronized String setConfigJson(Context c, String json) {
        try {
            if (!pinIsSet(c)) return why("nopin");
            if (!parentUse(c)) return why("pin");
            SharedPreferences p = prefs(c);
            Cfg k = Cfg.from(new JSONObject(json == null ? "{}" : json), ScreenTime.protectedSet(c));
            k.set = true;
            k.allow.remove(c.getPackageName());
            SharedPreferences.Editor e = p.edit().putString(CFG, k.json().toString());
            Session s = load(p);
            if (s != null) {
                s.allow.clear();
                s.allow.addAll(k.allow);
                e.putString(SES, s.json().toString());
            }
            e.commit();
            return new JSONObject().put("ok", true).put("cfg", k.json()).toString();
        } catch (Exception ex) {
            return why("failed");
        }
    }

    /** Deletes a log entry: needs the PIN. */
    static synchronized String deleteJson(Context c, String id) {
        try {
            if (!pinIsSet(c)) return why("nopin");
            if (!parentUse(c)) return why("pin");
            SharedPreferences p = prefs(c);
            JSONArray log = log(p), out = new JSONArray();
            boolean gone = false;
            for (int i = 0; i < log.length(); i++) {
                JSONObject e = log.optJSONObject(i);
                if (e != null && id != null && id.equals(e.optString("id"))) gone = true;
                else if (e != null) out.put(e);
            }
            if (gone) p.edit().putString(LOG, out.toString()).commit();
            return new JSONObject().put("ok", gone).toString();
        } catch (Exception ex) {
            return why("failed");
        }
    }

    /** Parent mode's "Mark checked" on a log entry (on or off): needs the PIN. {ok} | {ok:false, why: "nopin" | "pin" | "gone"}. */
    static synchronized String checkJson(Context c, String id, boolean on) {
        try {
            if (!pinIsSet(c)) return why("nopin");
            if (!parentUse(c)) return why("pin");
            if (id == null || !id.matches(ID)) return why("gone");
            SharedPreferences p = prefs(c);
            JSONArray log = log(p);
            for (int i = 0; i < log.length(); i++) {
                JSONObject e = log.optJSONObject(i);
                if (e == null || !id.equals(e.optString("id"))) continue;
                if (on) e.put("pc", 1);
                else e.remove("pc");
                p.edit().putString(LOG, log.toString()).commit();
                return "{\"ok\":true}";
            }
            return why("gone");
        } catch (Exception ex) {
            return why("failed");
        }
    }

    /** Parent mode is in use: keeps the parent's 3 minutes open. False once they've run out (or no PIN is set). */
    static boolean touch(Context c) {
        return parentUse(c);
    }

    /** The allow list in use (the session's, else the settings'), for opening one of them from the app. */
    static Set<String> allowed(Context c) {
        Session s = tick(c);
        return s != null ? s.allow : cfg(prefs(c)).allow;
    }

    /** The allowed apps with names and icons, for the homework screen. */
    static String allowedJson(Context c) {
        try {
            JSONArray a = new JSONArray();
            for (String p : allowed(c)) {
                if (!ScreenTime.isLaunchable(c, p)) continue;
                String n = ScreenTime.label(c, p);
                JSONObject o = new JSONObject().put("pkg", p).put("name", n == null || n.isEmpty() ? p : n);
                String icon = ScreenTime.iconOf(c, p);
                if (icon != null) o.put("icon", icon);
                a.put(o);
            }
            return new JSONObject().put("ok", true).put("apps", a).toString();
        } catch (Exception e) {
            return "{\"ok\":false}";
        }
    }

    /** "Allowed: Classroom, Docs + 2 more", for the block screen. */
    static String allowedLine(Context c, Session s) {
        StringBuilder b = new StringBuilder();
        int n = 0, more = 0;
        for (String p : s.allow) {
            if (!ScreenTime.isLaunchable(c, p)) continue;
            String l = ScreenTime.label(c, p);
            if (l == null || l.isEmpty()) continue;
            if (n < 4) b.append(n++ > 0 ? ", " : "").append(l);
            else more++;
        }
        if (n == 0) return "Calls, texts and the camera still work.";
        return "Allowed: " + b + (more > 0 ? " + " + more + " more" : "") + ".";
    }

    private static String clean(String s) {
        if (s == null) return null;
        String t = s.replaceAll("[\\u0000-\\u001f\\u007f]", " ").replaceAll("\\s+", " ").trim();
        return t.length() > NOTE ? t.substring(0, NOTE) : t;
    }
}
