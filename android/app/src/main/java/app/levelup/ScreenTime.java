package app.levelup;

import android.Manifest;
import android.app.AppOpsManager;
import android.app.KeyguardManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.AudioPlaybackConfiguration;
import android.media.AudioRecordingConfiguration;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Process;
import android.provider.AlarmClock;
import android.provider.MediaStore;
import android.provider.Settings;
import android.provider.Telephony;
import android.telecom.TelecomManager;
import android.text.TextUtils;
import android.util.Base64;
import android.view.inputmethod.InputMethodInfo;
import android.view.inputmethod.InputMethodManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The screen-time limit's shared logic, used by the JS bridge (MainActivity), LimitService and BlockActivity.
 * The rules come from app.js as {v, plan:[{from:'YYYY-MM-DD', limit, apps}]}; the rule for a day is the
 * last entry with from <= that day, so a change waiting for tomorrow starts at midnight by itself.
 * Fail open: no Usage access or a failed query means nothing is ever blocked. Never throws.
 */
final class ScreenTime {
    static final String PREFS = "screentime";
    private static final String CFG = "cfg", WARNED = "warned", UNL_UNTIL = "unlockUntil", UNL_DAY = "unlockDay", UNL_USED = "unlockUsed";
    static final long UNLOCK_MS = 15 * 60_000L;   // an emergency unlock (10 push-ups on camera): 15 minutes, twice a day
    private static final int UNLOCKS = 2;
    private static final long MIN = 60_000L, LOOKBACK = 6 * 60 * MIN;   // a session open at midnight began before it
    private static final int[] LIMITS = { 0, 30, 45, 60, 90, 120 };

    // UsageEvents.Event types. 1/2 are MOVE_TO_FOREGROUND/BACKGROUND before API 29 and ACTIVITY_RESUMED/PAUSED
    // after (same ints); 15-17 appear from API 28 and 23/26/27 from API 29.
    private static final int RESUMED = 1, PAUSED = 2, SCREEN_OFF = 16, KEYGUARD = 17, STOPPED = 23, SHUTDOWN = 26, STARTUP = 27;

    /** Pre-ticked in the picker (plus any GAME/VIDEO/SOCIAL app on API 26+). */
    private static final Set<String> SUGGEST = new HashSet<>(Arrays.asList(
            "com.zhiliaoapp.musically", "com.ss.android.ugc.trill", "com.google.android.youtube", "com.google.android.apps.youtube.kids",
            "com.netflix.mediaclient", "tv.twitch.android.app", "com.disney.disneyplus", "com.amazon.avod.thirdpartyclient",
            "com.instagram.android", "com.instagram.barcelona", "com.snapchat.android", "com.discord", "com.reddit.frontpage",
            "com.twitter.android", "com.pinterest", "com.bereal.ft", "com.facebook.katana", "com.facebook.lite",
            "com.roblox.client", "com.epicgames.fortnite", "com.mojang.minecraftpe", "com.supercell.clashofclans",
            "com.supercell.clashroyale", "com.supercell.brawlstars", "com.innersloth.spacemafia", "com.kiloo.subwaysurf",
            "com.tencent.ig", "com.dts.freefireth", "com.activision.callofduty.shooter", "com.miHoYo.GenshinImpact",
            "com.nianticlabs.pokemongo", "com.king.candycrushsaga", "com.kitkagames.fallbuddies", "com.robtopx.geometryjump"));
    /** Messengers and school apps: selectable, but never pre-ticked, so family is always one tap away. */
    private static final Set<String> NO_SUGGEST = new HashSet<>(Arrays.asList(
            "com.whatsapp", "com.whatsapp.w4b", "com.facebook.orca", "org.thoughtcrime.securesms", "org.telegram.messenger",
            "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.google.android.apps.tachyon",
            "com.google.android.gm", "com.google.android.apps.classroom", "com.google.android.apps.youtube.music"));
    /** Never counted or blocked, on top of what is resolved live in protectedSet(). */
    private static final Set<String> NEVER = new HashSet<>(Arrays.asList(
            "android", "com.android.systemui", "com.android.settings", "com.android.phone", "com.android.server.telecom",
            "com.android.dialer", "com.google.android.dialer", "com.samsung.android.dialer", "com.android.contacts",
            "com.google.android.contacts", "com.samsung.android.app.contacts", "com.android.mms", "com.android.stk",
            "com.android.packageinstaller", "com.google.android.packageinstaller", "com.android.permissioncontroller",
            "com.google.android.permissioncontroller", "com.android.emergency", "com.google.android.apps.safetyhub",
            "com.android.cellbroadcastreceiver", "com.google.android.cellbroadcastreceiver", "com.android.deskclock",
            "com.google.android.deskclock", "com.sec.android.app.clockpackage", "com.android.camera", "com.android.camera2",
            "com.google.android.GoogleCamera", "com.sec.android.app.camera", "com.google.android.apps.wellbeing",
            "com.samsung.android.forest", "com.android.vending"));

    private ScreenTime() {
    }

    // ------------------------------------------------------------------ access

    /** Mirrors the framework's own check: MODE_DEFAULT (the usual state) falls through to the permission. */
    @SuppressWarnings("deprecation")
    static boolean hasUsageAccess(Context c) {
        try {
            AppOpsManager ops = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
            int uid = Process.myUid();
            int mode = Build.VERSION.SDK_INT >= 29
                    ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, uid, c.getPackageName())
                    : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, uid, c.getPackageName());
            if (mode == AppOpsManager.MODE_DEFAULT) {
                return c.checkCallingOrSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED;
            }
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Throwable t) {
            return false;
        }
    }

    /** Our accessibility service is switched on in Settings (AccessibilityManager.isEnabled() is global). */
    static boolean blockerOn(Context c) {
        try {
            String list = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            if (TextUtils.isEmpty(list)) return false;
            ComponentName me = new ComponentName(c, LimitService.class);
            TextUtils.SimpleStringSplitter split = new TextUtils.SimpleStringSplitter(':');
            split.setString(list);
            for (String s : split) if (me.equals(ComponentName.unflattenFromString(s))) return true;
        } catch (Throwable ignored) {
        }
        return false;
    }

    // ------------------------------------------------------------------ local days (recomputed on every read: the clock can change)

    static long dayStart(long t) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(t);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    /** DST-safe: never adds 24h. */
    static long addDays(long start, int n) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(start);
        c.add(Calendar.DAY_OF_MONTH, n);
        return dayStart(c.getTimeInMillis());
    }

    static String dayKey(long t) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(t);
        return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    /** "2026-10-11" -> local midnight, or -1. */
    static long parseDay(String k) {
        if (k == null || !k.matches("\\d{4}-\\d\\d-\\d\\d")) return -1;
        Calendar c = Calendar.getInstance();
        c.clear();
        c.set(Integer.parseInt(k.substring(0, 4)), Integer.parseInt(k.substring(5, 7)) - 1, Integer.parseInt(k.substring(8, 10)));
        return dayKey(c.getTimeInMillis()).equals(k) ? c.getTimeInMillis() : -1;
    }

    // ------------------------------------------------------------------ the rule JS pushed

    static final class Rule {
        final int limit;            // minutes, > 0
        final Set<String> apps;     // selected, protected ones already removed
        Rule(int limit, Set<String> apps) { this.limit = limit; this.apps = apps; }
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Stores a sanitized copy; protected packages are dropped here as a second safety net. An empty plan limits nothing. */
    static void setConfig(Context c, String json) {
        JSONArray out = new JSONArray();
        try {
            JSONArray plan = new JSONObject(json).optJSONArray("plan");
            Set<String> prot = protectedSet(c);
            for (int i = 0; plan != null && i < plan.length(); i++) {
                JSONObject e = plan.optJSONObject(i);
                if (e == null || parseDay(e.optString("from")) < 0) continue;
                int lim = e.optInt("limit", -1);
                if (!okLimit(lim)) continue;
                JSONArray apps = e.optJSONArray("apps"), keep = new JSONArray();
                for (int j = 0; apps != null && j < apps.length(); j++) {
                    String p = apps.optString(j, "");
                    if (!p.isEmpty() && !prot.contains(p)) keep.put(p);
                }
                out.put(new JSONObject().put("from", e.getString("from")).put("limit", lim).put("apps", keep));
            }
        } catch (Exception ignored) {
            out = new JSONArray();   // unreadable: limit nothing
        }
        try {
            if (blockerOn(c)) out = keepToday(c, out);
        } catch (Exception ignored) {
        }
        prefs(c).edit().putString(CFG, out.toString()).apply();
    }

    /**
     * The commitment, enforced here as well as in app.js: while the blocker is on, today's rule can only get
     * stricter (a lower limit, more apps). Anything looser (no rule, a higher limit or Off, an app gone, from an
     * imported backup, Erase all or a clock trick) keeps today's rule and starts the new plan tomorrow. With the
     * blocker off nothing is enforced anyway, so the plan is taken as it is (setup's "Start tomorrow instead").
     */
    private static JSONArray keepToday(Context c, JSONArray next) throws JSONException {
        long now = System.currentTimeMillis();
        String today = dayKey(now), tomorrow = dayKey(addDays(dayStart(now), 1));
        Set<String> prot = protectedSet(c);
        JSONObject old = entryAt(new JSONArray(prefs(c).getString(CFG, "[]")), today);
        int oldLim = old == null ? 0 : old.optInt("limit");
        Set<String> oldApps = appsIn(old, prot);
        if (oldLim <= 0 || oldApps.isEmpty()) return next;   // nothing limited today: nothing to keep
        JSONObject cur = entryAt(next, today);
        int newLim = cur == null ? 0 : cur.optInt("limit");
        Set<String> newApps = appsIn(cur, prot);
        if (newLim > 0 && newLim <= oldLim && newApps.containsAll(oldApps)) return next;   // as strict or stricter
        Set<String> apps = new LinkedHashSet<>(oldApps);
        apps.addAll(newApps);   // adding apps is stricter: that part applies now
        JSONArray out = new JSONArray(), later = new JSONArray();
        boolean hasTomorrow = false;
        for (int i = 0; i < next.length(); i++) {
            JSONObject e = next.getJSONObject(i);
            int cmp = e.getString("from").compareTo(today);
            if (cmp < 0) out.put(e);
            else if (cmp > 0) {
                later.put(e);
                if (e.getString("from").equals(tomorrow)) hasTomorrow = true;
            }
        }
        out.put(new JSONObject().put("from", today).put("limit", newLim > 0 ? Math.min(oldLim, newLim) : oldLim).put("apps", new JSONArray(apps)));
        if (!hasTomorrow) out.put(new JSONObject().put("from", tomorrow).put("limit", Math.max(0, newLim)).put("apps", new JSONArray(newApps)));
        for (int i = 0; i < later.length(); i++) out.put(later.get(i));
        return out;
    }

    /** The entry that rules day k: the last with from <= k. */
    private static JSONObject entryAt(JSONArray plan, String k) throws JSONException {
        JSONObject cur = null;
        for (int i = 0; i < plan.length(); i++) {
            JSONObject e = plan.getJSONObject(i);
            if (e.getString("from").compareTo(k) <= 0 && (cur == null || e.getString("from").compareTo(cur.getString("from")) >= 0)) cur = e;
        }
        return cur;
    }

    private static Set<String> appsIn(JSONObject e, Set<String> prot) {
        Set<String> s = new LinkedHashSet<>();
        JSONArray a = e == null ? null : e.optJSONArray("apps");
        for (int i = 0; a != null && i < a.length(); i++) {
            String p = a.optString(i, "");
            if (!p.isEmpty() && !prot.contains(p)) s.add(p);
        }
        return s;
    }

    private static boolean okLimit(int l) {
        for (int x : LIMITS) if (x == l) return true;
        return false;
    }

    /** Today's rule, or null when nothing is limited today. Re-read every time, so a change applies at once. */
    static Rule rule(Context c) {
        try {
            JSONObject cur = entryAt(new JSONArray(prefs(c).getString(CFG, "[]")), dayKey(System.currentTimeMillis()));
            if (cur == null || cur.optInt("limit") <= 0) return null;
            Set<String> apps = appsIn(cur, protectedSet(c));
            return apps.isEmpty() ? null : new Rule(cur.getInt("limit"), apps);
        } catch (Exception e) {
            return null;
        }
    }

    /** The 5-minute warning shows once a day; returns true the first time it is asked for today. */
    static boolean claimWarning(Context c) {
        SharedPreferences p = prefs(c);
        String today = dayKey(System.currentTimeMillis());
        if (today.equals(p.getString(WARNED, ""))) return false;
        p.edit().putString(WARNED, today).apply();
        return true;
    }

    // ------------------------------------------------------------------ emergency unlock (JS counts the push-ups; the rules live here)

    /** When the running unlock ends, or 0. One ending more than 16 min from now came from a clock change: ignored. */
    static long unlockUntil(Context c) {
        long u = prefs(c).getLong(UNL_UNTIL, 0), now = System.currentTimeMillis();
        return u > now && u - now <= UNLOCK_MS + MIN ? u : 0;
    }

    static long unlockLeftMs(Context c) {
        long u = unlockUntil(c);
        return u == 0 ? 0 : Math.max(0, u - System.currentTimeMillis());
    }

    /** Unlocks left today; the count starts again at local midnight. */
    static int unlocksLeft(Context c) {
        SharedPreferences p = prefs(c);
        int used = dayKey(System.currentTimeMillis()).equals(p.getString(UNL_DAY, "")) ? p.getInt(UNL_USED, 0) : 0;
        return Math.max(0, UNLOCKS - used);
    }

    /** Today's limit is used up (the only time there is anything to unlock). Can't measure: false. */
    static boolean overLimit(Context c) {
        Rule r = rule(c);
        long used = r == null ? -1 : usedToday(c, r.apps, 3000);
        return used >= 0 && used >= r.limit * MIN;
    }

    /** null when granted (15 min from now, one of today's unlocks used), else why not: "active", "none_left", "not_over". */
    static synchronized String grantUnlock(Context c) {
        if (unlockLeftMs(c) > 0) return "active";
        if (unlocksLeft(c) <= 0) return "none_left";
        if (!overLimit(c)) return "not_over";
        long now = System.currentTimeMillis();
        prefs(c).edit().putLong(UNL_UNTIL, now + UNLOCK_MS).putString(UNL_DAY, dayKey(now)).putInt(UNL_USED, UNLOCKS - unlocksLeft(c) + 1).commit();
        return null;
    }

    /** The bridge's answer: {ok, until, left, why}. */
    static String unlockJson(Context c) {
        String why = grantUnlock(c);
        try {
            JSONObject o = new JSONObject().put("ok", why == null).put("until", unlockUntil(c)).put("left", unlocksLeft(c));
            return (why == null ? o : o.put("why", why)).toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"why\":\"failed\"}";
        }
    }

    /**
     * A call is going on or ringing: any call audio mode (Telecom calls, connected VoIP, call screening), or, for a
     * VoIP app ringing on its own screen before its mode changes, a ringtone or voice-call sound playing or a
     * voice-call recording. All public and permission-free; never throws.
     */
    static boolean inCall(Context c) {
        try {
            AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return false;
            if (am.getMode() > AudioManager.MODE_NORMAL) return true;
            if (Build.VERSION.SDK_INT >= 26) {
                for (AudioPlaybackConfiguration pc : am.getActivePlaybackConfigurations()) {
                    AudioAttributes aa = pc.getAudioAttributes();
                    int u = aa == null ? -1 : aa.getUsage();
                    if (u == AudioAttributes.USAGE_VOICE_COMMUNICATION || u == AudioAttributes.USAGE_NOTIFICATION_RINGTONE) return true;
                }
            }
            for (AudioRecordingConfiguration rc : am.getActiveRecordingConfigurations()) {
                if (rc.getClientAudioSource() == MediaRecorder.AudioSource.VOICE_COMMUNICATION) return true;
            }
        } catch (Throwable ignored) {
        }
        return false;
    }

    /** The lock screen is up (incoming-call screens show over it): never block there. */
    static boolean locked(Context c) {
        try {
            KeyguardManager k = (KeyguardManager) c.getSystemService(Context.KEYGUARD_SERVICE);
            return k != null && k.isKeyguardLocked();
        } catch (Throwable t) {
            return false;
        }
    }

    // ------------------------------------------------------------------ which apps exist, which can never be limited

    private static long appsAt;
    private static Set<String> launchable = Collections.emptySet(), prot = Collections.emptySet(), homes = Collections.emptySet(),
            suggest = Collections.emptySet();
    private static List<ResolveInfo> launchers = Collections.emptyList();

    private static synchronized void refreshApps(Context c) {
        long now = System.currentTimeMillis();
        if (now - appsAt < 60_000 && now >= appsAt) return;
        PackageManager pm = c.getPackageManager();
        Set<String> l = new HashSet<>(), p = new HashSet<>(NEVER), h = new HashSet<>();
        List<ResolveInfo> ls = new ArrayList<>();
        try {
            ls = pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0);
            for (ResolveInfo r : ls) l.add(r.activityInfo.packageName);
        } catch (Exception ignored) {
        }
        p.add(c.getPackageName());
        addAll(pm, h, new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), false);
        p.addAll(h);
        addAll(pm, p, new Intent(Settings.ACTION_SETTINGS), false);
        addAll(pm, p, new Intent(Intent.ACTION_DIAL), false);
        // clock, camera, contacts: the phone's own apps (a game that can take a photo must stay limitable)
        addAll(pm, p, new Intent(AlarmClock.ACTION_SHOW_ALARMS), true);
        addAll(pm, p, new Intent(AlarmClock.ACTION_SET_ALARM), true);
        addAll(pm, p, new Intent(MediaStore.ACTION_IMAGE_CAPTURE), true);
        addAll(pm, p, new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA), true);
        addAll(pm, p, new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_APP_CONTACTS), true);
        try {
            TelecomManager tm = (TelecomManager) c.getSystemService(Context.TELECOM_SERVICE);
            if (tm != null) {
                add(p, tm.getDefaultDialerPackage());
                add(p, tm.getSystemDialerPackage());
            }
        } catch (Exception ignored) {
        }
        try {
            add(p, Telephony.Sms.getDefaultSmsPackage(c));
        } catch (Exception ignored) {
        }
        try {
            InputMethodManager im = (InputMethodManager) c.getSystemService(Context.INPUT_METHOD_SERVICE);
            if (im != null) {
                for (InputMethodInfo i : im.getInputMethodList()) add(p, i.getPackageName());
                for (InputMethodInfo i : im.getEnabledInputMethodList()) add(p, i.getPackageName());
            }
        } catch (Exception ignored) {
        }
        // the obvious time-sinks: pre-ticked in the picker, and they count for coins even when not picked
        Set<String> sg = new HashSet<>();
        for (ResolveInfo r : ls) {
            String pk = r.activityInfo.packageName;
            ApplicationInfo ai = r.activityInfo.applicationInfo;
            boolean cat = Build.VERSION.SDK_INT >= 26 && ai != null && (ai.category == ApplicationInfo.CATEGORY_GAME
                    || ai.category == ApplicationInfo.CATEGORY_VIDEO || ai.category == ApplicationInfo.CATEGORY_SOCIAL);
            if (!p.contains(pk) && !NO_SUGGEST.contains(pk) && (cat || SUGGEST.contains(pk))) sg.add(pk);
        }
        suggest = sg;
        launchable = l;
        launchers = ls;
        prot = p;
        homes = h;
        appsAt = now;
    }

    private static void add(Set<String> s, String p) {
        if (p != null && !p.isEmpty()) s.add(p);
    }

    private static void addAll(PackageManager pm, Set<String> s, Intent i, boolean systemOnly) {
        try {
            for (ResolveInfo r : pm.queryIntentActivities(i, PackageManager.MATCH_DEFAULT_ONLY)) {
                ApplicationInfo ai = r.activityInfo.applicationInfo;
                if (!systemOnly || (ai != null && (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0)) add(s, r.activityInfo.packageName);
            }
            ResolveInfo d = pm.resolveActivity(i, PackageManager.MATCH_DEFAULT_ONLY);   // the current default (home, Settings, dialer)
            if (d != null && d.activityInfo != null && !systemOnly) add(s, d.activityInfo.packageName);
        } catch (Exception ignored) {
        }
    }

    /** Packages that can never be picked, counted or blocked. */
    static Set<String> protectedSet(Context c) {
        refreshApps(c);
        return prot;
    }

    /** Never block it: protected, or not an app you can open from the launcher. Re-checked at block time. */
    static boolean isProtected(Context c, String pkg) {
        refreshApps(c);
        return pkg == null || prot.contains(pkg) || !launchable.contains(pkg);
    }

    static boolean isHome(Context c, String pkg) {
        refreshApps(c);
        return homes.contains(pkg);
    }

    static boolean isLaunchable(Context c, String pkg) {
        refreshApps(c);
        return launchable.contains(pkg);
    }

    // ------------------------------------------------------------------ usage from raw events

    static final class Usage {
        final Map<String, Long> per = new HashMap<>();   // foreground ms per package
        long total;                                     // ms in launchable apps, launchers and system UI left out
        int events;                                     // 0 for a day the system has no record of
        long sum(Set<String> apps) {
            long s = 0;
            for (String p : apps) { Long v = per.get(p); if (v != null) s += v; }
            return s;
        }
        /** Time on the suggested time-sinks that are not in apps: unpicking a game never earns coins. */
        long other(Set<String> apps) {
            long s = 0;
            for (String p : suggest) if (!apps.contains(p)) { Long v = per.get(p); if (v != null) s += v; }
            return s;
        }
    }

    /**
     * Foreground time inside [from, to), from queryEvents (INTERVAL_DAILY buckets are not local days). One
     * foreground pointer, keyed by package + activity class: a PAUSE only ends the session when it belongs to
     * the activity that was last resumed, so moving between screens inside an app keeps one session, and a
     * split-screen pair is never counted twice. (Event.getInstanceId() would pair per activity, but it is not
     * public API.) Screen off, lock, shutdown and startup end the session; the open one runs to "to".
     * Returns null without access or when the query fails.
     */
    static Usage usage(Context c, long from, long to) {
        if (!hasUsageAccess(c)) return null;
        try {
            refreshApps(c);
            UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
            UsageEvents ev = usm == null ? null : usm.queryEvents(from - LOOKBACK, to);
            if (ev == null) return null;
            Usage u = new Usage();
            UsageEvents.Event e = new UsageEvents.Event();
            String fp = null, fc = null;
            long fs = 0;
            while (ev.hasNextEvent()) {
                if (!ev.getNextEvent(e)) break;
                long ts = e.getTimeStamp();
                if (ts >= from && ts < to) u.events++;
                int type = e.getEventType();
                String p = e.getPackageName(), cl = e.getClassName();
                if (type == RESUMED && p != null) {
                    if (!p.equals(fp)) {
                        if (fp != null) count(u, fp, fs, ts, from, to);
                        fp = p;
                        fs = ts;
                    }
                    fc = cl;
                } else if ((type == PAUSED || type == STOPPED) && fp != null && fp.equals(p) && TextUtils.equals(fc, cl)) {
                    count(u, fp, fs, ts, from, to);
                    fp = null;
                } else if (type == SCREEN_OFF || type == KEYGUARD || type == SHUTDOWN) {
                    if (fp != null) count(u, fp, fs, ts, from, to);
                    fp = null;
                } else if (type == STARTUP) {
                    fp = null;   // its end was never recorded: count nothing rather than the whole power-off
                }
            }
            if (fp != null) count(u, fp, fs, Math.min(System.currentTimeMillis(), to), from, to);
            return u;
        } catch (Exception e) {
            return null;
        }
    }

    private static void count(Usage u, String p, long s, long e, long from, long to) {
        long ms = Math.min(e, to) - Math.max(s, from);
        if (ms <= 0) return;
        Long v = u.per.get(p);
        u.per.put(p, (v == null ? 0 : v) + ms);
        if (launchable.contains(p) && !homes.contains(p) && !"com.android.systemui".equals(p)) u.total += ms;
    }

    private static Usage todayCache;
    private static long todayAt, todayStart;

    /** Today so far, reused for up to maxAgeMs (queryEvents reads files from disk). */
    static synchronized Usage today(Context c, long maxAgeMs) {
        long now = System.currentTimeMillis(), start = dayStart(now);
        if (todayCache != null && start == todayStart && now >= todayAt && now - todayAt < maxAgeMs) return todayCache;
        Usage u = usage(c, start, now);
        todayCache = u;
        todayAt = now;
        todayStart = start;
        return u;
    }

    /** Milliseconds used today on the selected apps, or -1 when it cannot be measured (fail open). */
    static long usedToday(Context c, Set<String> apps, long maxAgeMs) {
        Usage u = today(c, maxAgeMs);
        return u == null ? -1 : u.sum(apps);
    }

    // ------------------------------------------------------------------ bridge payloads (JSON strings)

    private static Set<String> appsOf(JSONObject in) {
        Set<String> s = new HashSet<>();
        JSONArray a = in == null ? null : in.optJSONArray("apps");
        for (int i = 0; a != null && i < a.length(); i++) s.add(a.optString(i, ""));
        return s;
    }

    static String status(Context c) {
        try {
            return new JSONObject().put("v", 1).put("sdk", Build.VERSION.SDK_INT).put("maker", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER)
                    .put("usage", hasUsageAccess(c)).put("blocker", blockerOn(c)).put("unlockUntil", unlockUntil(c)).put("unlocksLeft", unlocksLeft(c)).toString();
        } catch (Exception e) {
            return "{\"v\":1,\"usage\":false,\"blocker\":false}";
        }
    }

    /** {apps} -> {ok, day, used, other, total, per}; "used" is the same number LimitService enforces against. */
    static String todayJson(Context c, String json) {
        try {
            Set<String> apps = appsOf(new JSONObject(json == null ? "{}" : json));
            apps.removeAll(protectedSet(c));
            Usage u = today(c, 3000);
            if (u == null) return "{\"ok\":false,\"error\":\"no_access\"}";
            JSONObject per = new JSONObject();
            for (String p : apps) per.put(p, (u.per.containsKey(p) ? u.per.get(p) : 0L) / MIN);
            return new JSONObject().put("ok", true).put("day", dayKey(System.currentTimeMillis())).put("used", u.sum(apps) / MIN)
                    .put("other", u.other(apps) / MIN).put("total", u.total / MIN).put("per", per).toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"failed\"}";
        }
    }

    /** {days:[{day, apps}]} (past days, up to 8) -> {ok, days:{day:{used,other,total}}}; a day with no record is left out. */
    static String daysJson(Context c, String json) {
        try {
            JSONArray in = new JSONObject(json == null ? "{}" : json).optJSONArray("days");
            if (!hasUsageAccess(c)) return "{\"ok\":false,\"error\":\"no_access\"}";
            long today = dayStart(System.currentTimeMillis()), oldest = addDays(today, -8);
            Set<String> prot = protectedSet(c);
            JSONObject out = new JSONObject();
            for (int i = 0; in != null && i < in.length() && i < 8; i++) {
                JSONObject d = in.optJSONObject(i);
                long s = d == null ? -1 : parseDay(d.optString("day"));
                if (s < oldest || s >= today) continue;
                Usage u = usage(c, s, addDays(s, 1));
                if (u == null || u.events == 0) continue;
                Set<String> apps = appsOf(d);
                apps.removeAll(prot);
                out.put(d.getString("day"), new JSONObject().put("used", u.sum(apps) / MIN).put("other", u.other(apps) / MIN).put("total", u.total / MIN));
            }
            return new JSONObject().put("ok", true).put("days", out).toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"failed\"}";
        }
    }

    /**
     * Phone Down check: foreground ms inside [from, to) on every app you can open from the launcher, except LEVEL UP
     * itself, launchers and system UI, plus the top 3 by time. {ok, ms, top:[{label, ms}]}; {ok:false, error} without
     * Usage access or for a window that can't be a session (empty, over 4 hours, or starting in the future).
     */
    static String phoneUseJson(Context c, long from, long to) {
        try {
            long now = System.currentTimeMillis();
            if (from <= 0 || to <= from || to - from > 4 * 3600_000L || from > now) return "{\"ok\":false,\"error\":\"bad_window\"}";
            Usage u = usage(c, from, Math.min(to, now));
            if (u == null) return "{\"ok\":false,\"error\":\"no_access\"}";
            String me = c.getPackageName();
            long ms = 0;
            List<Map.Entry<String, Long>> used = new ArrayList<>();
            for (Map.Entry<String, Long> e : u.per.entrySet()) {
                String p = e.getKey();
                if (p.equals(me) || !launchable.contains(p) || homes.contains(p) || "com.android.systemui".equals(p)) continue;
                ms += e.getValue();
                used.add(e);
            }
            Collections.sort(used, (a, b) -> Long.compare(b.getValue(), a.getValue()));
            JSONArray top = new JSONArray();
            for (int i = 0; i < used.size() && i < 3; i++) {
                String p = used.get(i).getKey(), l = label(c, p);
                top.put(new JSONObject().put("label", l == null || l.isEmpty() ? p : l).put("ms", used.get(i).getValue()));
            }
            return new JSONObject().put("ok", true).put("ms", ms).put("top", top).toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"failed\"}";
        }
    }

    private static final Map<String, String> ICONS = new HashMap<>();

    /** Launchable, unprotected apps by name, with today's minutes, the pre-tick hint and a small PNG icon. */
    static String appsJson(Context c) {
        try {
            refreshApps(c);
            PackageManager pm = c.getPackageManager();
            Usage u = today(c, 3000);
            Map<String, JSONObject> by = new HashMap<>();
            for (ResolveInfo r : launchers) {
                String p = r.activityInfo.packageName;
                if (prot.contains(p) || by.containsKey(p)) continue;
                Long ms = u == null ? null : u.per.get(p);
                JSONObject o = new JSONObject().put("pkg", p).put("name", String.valueOf(r.loadLabel(pm)).trim())
                        .put("min", ms == null ? 0 : ms / MIN).put("suggest", suggest.contains(p));
                String icon = icon(pm, r, p);
                if (icon != null) o.put("icon", icon);
                by.put(p, o);
            }
            List<JSONObject> list = new ArrayList<>(by.values());
            list.sort((a, b) -> a.optString("name").compareToIgnoreCase(b.optString("name")));
            return new JSONObject().put("ok", true).put("apps", new JSONArray(list)).toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"failed\"}";
        }
    }

    private static String icon(PackageManager pm, ResolveInfo r, String p) {
        synchronized (ICONS) {
            if (ICONS.containsKey(p)) return ICONS.get(p);
        }
        String uri = null;
        try {
            Drawable d = r.loadIcon(pm);
            int px = 96;
            Bitmap b = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
            d.setBounds(0, 0, px, px);
            d.draw(new Canvas(b));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.PNG, 100, out);
            b.recycle();
            uri = "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable ignored) {
        }
        synchronized (ICONS) {
            ICONS.put(p, uri);
        }
        return uri;
    }

    /** App name for the block screen, or null. */
    static String label(Context c, String pkg) {
        try {
            PackageManager pm = c.getPackageManager();
            return String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0))).trim();
        } catch (Exception e) {
            return null;
        }
    }

    /** "1 hour" etc., same names as the app. */
    static String limitName(int l) {
        switch (l) {
            case 30: return "30 min";
            case 45: return "45 min";
            case 60: return "1 hour";
            case 90: return "1½ hours";
            case 120: return "2 hours";
            default: return l + " min";
        }
    }
}
