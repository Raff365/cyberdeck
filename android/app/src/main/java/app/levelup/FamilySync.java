package app.levelup;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.util.AtomicFile;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Family link: shares what Parent mode shows with the parents' own server (a Cloudflare Worker the family runs, see
 * family-server/), and takes a few requests back from a parent's phone. Set up and switched off only in Parent mode (the
 * PIN); while it's on, LEVEL UP says so on Home and in Stats.
 *
 * What goes up: the snapshot app.js builds from Parent mode's numbers (cached here, so a background sync can send it),
 * a few facts only native knows (blocker on, Usage access, today's limited minutes, a running homework session, push-up
 * unlocks), events (homework started/finished/ended early, blocker off/on, clock changed, over the limit, push-up
 * unlock), and homework photos only if a parent switched them on. Nothing else: no messages, browsing, location,
 * contacts or keystrokes.
 *
 * When: on app open, right after one of those events, and every ~15 minutes from LimitService while it runs. One sync
 * at a time on one background thread; never on the UI thread; never throws.
 *
 * Requests: homework start/end, today's limit and "mark checked" are applied here (native owns them), bonus coins and
 * Bored ideas wait for app.js (it owns those) and are acked when it has done them. Every request has an id; its result is
 * kept, so a request delivered twice is acked twice but done once.
 *
 * The device token lives in noBackupFilesDir (never in a backup), with the server URL and the photo switch.
 */
final class FamilySync {
    static final String PREFS = "family";
    private static final String LINK_FILE = "family-link.json";
    private static final String SNAP = "snap", SNAP_AT = "snapAt", SNAP_SENT = "snapSent", EVENTS = "events", ACKS = "acks", SEEN = "seen", JS = "js",
            LAST = "lastSync", LAST_TRY = "lastTry", ERR = "lastErr", PARENTS = "parents", BLOCKER = "blocker", OVER_DAY = "overDay", CODE = "code", HAVE = "have";
    static final long MIN = 60_000L, EVERY = 15 * MIN;
    private static final int SNAP_MAX = 48 * 1024, EVENTS_MAX = 200, SEEN_MAX = 120, PHOTO_MAX = 400 * 1024, REPLY_MAX = 256 * 1024, PHOTOS_PER_SYNC = 6;
    private static final String ID = "[A-Za-z0-9]{4,24}", CMD_ID = "[a-z0-9]{16}";

    private static final ExecutorService NET = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "levelup-family");
        t.setDaemon(true);
        return t;
    });
    private static final AtomicBoolean queued = new AtomicBoolean(), again = new AtomicBoolean();
    private static final ThreadLocal<Boolean> remote = new ThreadLocal<>();
    /** MainActivity, while the page is up: told when something changed (a request to apply, the link went away). */
    static volatile Runnable listener;

    private FamilySync() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ------------------------------------------------------------------ the link (URL, token, photo switch): noBackupFilesDir

    static final class Link {
        String url = "", token = "", fid = "";
        boolean photos;
        long at;

        boolean ok() {
            return !url.isEmpty() && token.startsWith("lu1.");
        }
    }

    private static AtomicFile linkFile(Context c) {
        return new AtomicFile(new File(c.getNoBackupFilesDir(), LINK_FILE));
    }

    static synchronized Link link(Context c) {
        Link l = new Link();
        try {
            JSONObject o = new JSONObject(new String(linkFile(c).readFully(), StandardCharsets.UTF_8));
            l.url = o.optString("url", "");
            l.token = o.optString("token", "");
            l.fid = o.optString("fid", "");
            l.photos = o.optBoolean("photos", false);
            l.at = o.optLong("at", 0);
        } catch (Exception ignored) {
        }
        return l;
    }

    private static synchronized boolean saveLink(Context c, Link l) {
        AtomicFile f = linkFile(c);
        FileOutputStream os = null;
        try {
            JSONObject o = new JSONObject().put("url", l.url).put("token", l.token).put("fid", l.fid).put("photos", l.photos).put("at", l.at);
            os = f.startWrite();
            os.write(o.toString().getBytes(StandardCharsets.UTF_8));
            f.finishWrite(os);
            return true;
        } catch (Exception e) {
            if (os != null) f.failWrite(os);
            return false;
        }
    }

    static boolean linked(Context c) {
        return link(c).ok();
    }

    /** Forgets the link here: token, queues, cached snapshot, queued photos. */
    static synchronized void forget(Context c) {
        linkFile(c).delete();
        prefs(c).edit().clear().commit();
        File[] q = photoDir(c).listFiles();
        if (q != null) for (File f : q) f.delete();
    }

    /** https://host[:port] only (http just for a server on this device, as in the tests). null: not a server URL. */
    static String cleanUrl(String s) {
        if (s == null) return null;
        String t = s.trim();
        while (t.endsWith("/")) t = t.substring(0, t.length() - 1);
        if (t.length() < 9 || t.length() > 200) return null;
        try {
            URL u = new URL(t);
            String h = u.getHost();
            if (h == null || h.isEmpty() || u.getUserInfo() != null || u.getQuery() != null || (u.getPath() != null && !u.getPath().isEmpty())) return null;
            if (!h.matches("[A-Za-z0-9.-]+")) return null;
            boolean local = "127.0.0.1".equals(h) || "localhost".equals(h);
            if ("https".equals(u.getProtocol()) || ("http".equals(u.getProtocol()) && local)) return t.toLowerCase(Locale.ROOT);
        } catch (Exception ignored) {
        }
        return null;
    }

    // ------------------------------------------------------------------ HTTP (blocking: the sync thread or a bridge worker thread)

    static final class Reply {
        int code;
        JSONObject json;
    }

    static Reply http(String method, String url, String token, String contentType, byte[] body) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(10_000);
            c.setReadTimeout(20_000);
            c.setUseCaches(false);
            c.setRequestMethod(method);
            c.setRequestProperty("Accept", "application/json");
            if (token != null) c.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", contentType);
                c.setFixedLengthStreamingMode(body.length);
                try (OutputStream os = c.getOutputStream()) {
                    os.write(body);
                }
            }
            Reply r = new Reply();
            r.code = c.getResponseCode();
            InputStream in = r.code >= 400 ? c.getErrorStream() : c.getInputStream();
            if (in != null) {
                try (InputStream is = in) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n, total = 0;
                    while ((n = is.read(buf)) > 0) {
                        total += n;
                        if (total > REPLY_MAX) throw new IOException("reply too large");
                        out.write(buf, 0, n);
                    }
                    try {
                        r.json = new JSONObject(out.toString("UTF-8"));
                    } catch (JSONException e) {
                        r.json = new JSONObject();
                    }
                }
            }
            if (r.json == null) r.json = new JSONObject();
            return r;
        } finally {
            c.disconnect();
        }
    }

    static Reply postJson(String url, String token, JSONObject body) throws IOException {
        return http("POST", url, token, "application/json", body.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static String fail(String why) {
        return "{\"ok\":false,\"why\":\"" + why + "\"}";
    }

    private static String httpWhy(Reply r) {
        if (r.code == 429) return "busy";
        if (r.code == 401) return "unlinked";
        if (r.code == 404) return "server";
        return "http_" + r.code;
    }

    // ------------------------------------------------------------------ set up, codes, devices, unlink (Parent mode, PIN-guarded in the bridge)

    /** Makes the family on the server: {ok, code, codeExp, link} or {ok:false, why: "url" | "network" | "busy" | ...}. Blocking. */
    static String setupJson(Context c, String serverUrl, String name) {
        String base = cleanUrl(serverUrl);
        if (base == null) return fail("url");
        try {
            Reply r = postJson(base + "/api/family", null, new JSONObject().put("name", name == null ? "" : name.length() > 16 ? name.substring(0, 16) : name));
            if (r.code != 200) return fail(httpWhy(r));
            String tok = r.json.optString("kidToken", ""), fid = r.json.optString("family", "");
            if (!tok.matches("lu1\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{11}\\.[A-Za-z0-9_-]{43}")) return fail("reply");
            forget(c);
            Link l = new Link();
            l.url = base;
            l.token = tok;
            l.fid = fid;
            l.photos = false;   // homework photos: off till a parent switches them on
            l.at = System.currentTimeMillis();
            if (!saveLink(c, l)) return fail("failed");
            return keepCode(c, base, r.json);
        } catch (IOException e) {
            return fail("network");
        } catch (Exception e) {
            return fail("failed");
        }
    }

    private static String keepCode(Context c, String base, JSONObject r) throws JSONException {
        String code = r.optString("code", "");
        long exp = r.optLong("codeExp", 0);
        if (!code.matches("[A-Z0-9]{8}")) return fail("reply");
        JSONObject o = new JSONObject().put("code", code).put("codeExp", exp).put("link", base + "/#pair=" + code);
        prefs(c).edit().putString(CODE, o.toString()).apply();
        return o.put("ok", true).toString();
    }

    static String newCodeJson(Context c) {
        Link l = link(c);
        if (!l.ok()) return fail("off");
        try {
            Reply r = postJson(l.url + "/api/kid/code", l.token, new JSONObject());
            if (r.code == 401) gone(c);
            if (r.code != 200) return fail(httpWhy(r));
            return keepCode(c, l.url, r.json);
        } catch (IOException e) {
            return fail("network");
        } catch (Exception e) {
            return fail("failed");
        }
    }

    static String devicesJson(Context c, String revokeId) {
        Link l = link(c);
        if (!l.ok()) return fail("off");
        try {
            Reply r = revokeId == null ? http("GET", l.url + "/api/kid/devices", l.token, null, null)
                    : postJson(l.url + "/api/kid/devices/revoke", l.token, new JSONObject().put("id", revokeId));
            if (r.code == 401) gone(c);
            if (r.code != 200) return fail(httpWhy(r));
            JSONArray d = r.json.optJSONArray("devices");
            prefs(c).edit().putInt(PARENTS, d == null ? 0 : d.length()).apply();
            return new JSONObject().put("ok", true).put("devices", d == null ? new JSONArray() : d).toString();
        } catch (IOException e) {
            return fail("network");
        } catch (Exception e) {
            return fail("failed");
        }
    }

    /** Deletes the family's data on the server, then the link here. force: forget it here even if the server can't be reached. */
    static String unlinkJson(Context c, boolean force) {
        Link l = link(c);
        if (!l.ok()) { forget(c); return "{\"ok\":true}"; }
        String why = null;
        try {
            Reply r = postJson(l.url + "/api/kid/unlink", l.token, new JSONObject());
            if (r.code != 200 && r.code != 401) why = httpWhy(r);   // 401: already gone there
        } catch (IOException e) {
            why = "network";
        } catch (Exception e) {
            why = "failed";
        }
        if (why != null && !force) return fail(why);
        forget(c);
        return why == null ? "{\"ok\":true}" : "{\"ok\":true,\"local\":true}";
    }

    /** The server no longer knows this phone (unlinked elsewhere, or deleted after 90 unused days). */
    private static void gone(Context c) {
        Link l = link(c);
        forget(c);
        prefs(c).edit().putString(ERR, "unlinked").putString("lastUrl", l.url).apply();
        tell();
    }

    static boolean setPhotos(Context c, boolean on) {
        Link l = link(c);
        if (!l.ok()) return false;
        l.photos = on;
        if (!saveLink(c, l)) return false;
        if (!on) {
            File[] q = photoDir(c).listFiles();
            if (q != null) for (File f : q) f.delete();
            prefs(c).edit().remove(HAVE).apply();
        }
        kick(c);
        return true;
    }

    /** {on, url, photos, lastSync, lastErr, parents, since, code?, codeExp?, link?} for Parent mode and the "Family link on" line. */
    static String statusJson(Context c) {
        try {
            Link l = link(c);
            SharedPreferences p = prefs(c);
            JSONObject o = new JSONObject().put("on", l.ok()).put("url", l.ok() ? l.url : p.getString("lastUrl", "")).put("photos", l.ok() && l.photos)
                    .put("lastSync", p.getLong(LAST, 0)).put("lastErr", p.getString(ERR, "")).put("parents", p.getInt(PARENTS, 0)).put("since", l.at);
            JSONObject code = new JSONObject(p.getString(CODE, "{}"));
            if (l.ok() && code.optLong("codeExp") > System.currentTimeMillis()) o.put("code", code.optString("code")).put("codeExp", code.optLong("codeExp")).put("link", code.optString("link"));
            return o.toString();
        } catch (Exception e) {
            return "{\"on\":false}";
        }
    }

    // ------------------------------------------------------------------ what app.js hands over

    /** The snapshot app.js built from Parent mode's numbers: kept for the next sync (also a background one). */
    static boolean snapshot(Context c, String json) {
        if (json == null || json.length() > SNAP_MAX || !linked(c)) return false;
        try {
            new JSONObject(json);
        } catch (JSONException e) {
            return false;
        }
        prefs(c).edit().putString(SNAP, json).putLong(SNAP_AT, System.currentTimeMillis()).apply();
        kick(c);
        return true;
    }

    private static File photoDir(Context c) {
        return new File(c.getNoBackupFilesDir(), "family-photos");
    }

    /** A homework photo (base64 JPEG, 400 KB max) for one log entry: queued only while photos are switched on. */
    static boolean photo(Context c, String entry, String b64) {
        try {
            Link l = link(c);
            if (!l.ok() || !l.photos || entry == null || !entry.matches(ID) || b64 == null || b64.length() > PHOTO_MAX * 2) return false;
            byte[] b = Base64.decode(b64, Base64.DEFAULT);
            if (b.length < 100 || b.length > PHOTO_MAX || (b[0] & 0xff) != 0xff || (b[1] & 0xff) != 0xd8) return false;
            File d = photoDir(c);
            if (!d.isDirectory() && !d.mkdirs()) return false;
            String[] n = d.list();
            if (n != null && n.length >= 20) return false;   // a backlog this big waits for a sync first
            try (FileOutputStream os = new FileOutputStream(new File(d, entry + ".jpg"))) {
                os.write(b);
            }
            kick(c);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Requests waiting for app.js (bonus coins, ideas) and limit changes it should mirror: [{id, kind, args, mirror}]. */
    static synchronized String takeJson(Context c) {
        return prefs(c).getString(JS, "[]");
    }

    /** app.js did one (or couldn't): acked on the next sync. A mirror was acked already. */
    static synchronized void jsDone(Context c, String id, boolean ok, String why) {
        if (id == null) return;
        SharedPreferences p = prefs(c);
        try {
            JSONArray js = new JSONArray(p.getString(JS, "[]")), keep = new JSONArray();
            boolean mirror = false, found = false;
            for (int i = 0; i < js.length(); i++) {
                JSONObject o = js.optJSONObject(i);
                if (o != null && id.equals(o.optString("id"))) { found = true; mirror = o.optBoolean("mirror"); } else if (o != null) keep.put(o);
            }
            SharedPreferences.Editor e = p.edit().putString(JS, keep.toString());
            if (found && !mirror) record(p, e, id, ok, why);
            e.apply();
        } catch (Exception ignored) {
        }
        kick(c);
    }

    // ------------------------------------------------------------------ events (from Homework, ScreenTime, LimitService)

    private static String newId() {
        byte[] b = new byte[8];
        new SecureRandom().nextBytes(b);
        StringBuilder s = new StringBuilder("ev");
        for (byte x : b) s.append(String.format(Locale.US, "%02x", x & 0xff));
        return s.toString();
    }

    /** Queues an event and syncs soon. kind: one the server knows (see family-server/src/family.js EVENT_KINDS). */
    static void event(Context c, String kind, JSONObject d) {
        try {
            if (!linked(c)) return;
            if (d == null) d = new JSONObject();
            if (Boolean.TRUE.equals(remote.get())) d.put("by", "remote");
            synchronized (FamilySync.class) {
                SharedPreferences p = prefs(c);
                JSONArray a = new JSONArray(p.getString(EVENTS, "[]")), out = new JSONArray();
                a.put(new JSONObject().put("id", newId()).put("t", System.currentTimeMillis()).put("k", kind).put("d", d));
                for (int i = Math.max(0, a.length() - EVENTS_MAX); i < a.length(); i++) out.put(a.get(i));
                p.edit().putString(EVENTS, out.toString()).apply();
            }
            kick(c);
        } catch (Exception ignored) {
        }
    }

    static void event(Context c, String kind) {
        event(c, kind, null);
    }

    /** The blocker's state, as last told: an event only when it changes. */
    static void blocker(Context c, boolean on) {
        try {
            if (!linked(c)) return;
            boolean changed;
            synchronized (FamilySync.class) {
                SharedPreferences p = prefs(c);
                int was = p.getInt(BLOCKER, -1), now = on ? 1 : 0;
                changed = was != now;
                if (changed) p.edit().putInt(BLOCKER, now).apply();
                if (was == -1) changed = !on;   // the first look: only "off" is news
            }
            if (changed) event(c, on ? "blocker_on" : "blocker_off");
        } catch (Exception ignored) {
        }
    }

    /** Today's limit is used up: once a day. */
    static void overLimit(Context c, int limit, long usedMin) {
        try {
            if (!linked(c)) return;
            String today = ScreenTime.dayKey(System.currentTimeMillis());
            synchronized (FamilySync.class) {
                SharedPreferences p = prefs(c);
                if (today.equals(p.getString(OVER_DAY, ""))) return;
                p.edit().putString(OVER_DAY, today).apply();
            }
            event(c, "over_limit", new JSONObject().put("lim", limit).put("used", Math.max(0, usedMin)));
        } catch (Exception ignored) {
        }
    }

    // ------------------------------------------------------------------ syncing

    /** Sync soon, on the family thread. Several kicks while one runs make one more run. */
    static void kick(Context c) {
        if (!linked(c)) return;
        final Context app = c.getApplicationContext();
        again.set(true);
        if (!queued.compareAndSet(false, true)) return;
        try {
            NET.execute(() -> {
                try {
                    for (int i = 0; i < 4 && again.getAndSet(false); i++) syncNow(app);
                } finally {
                    queued.set(false);
                    if (again.get()) kick(app);
                }
            });
        } catch (Exception e) {
            queued.set(false);
        }
    }

    /** No sync queued or running. */
    static boolean idle() {
        return !queued.get();
    }

    /** The app opened or came back: a sync unless one ran in the last minute. */
    static void opened(Context c) {
        if (linked(c) && Math.abs(System.currentTimeMillis() - prefs(c).getLong(LAST_TRY, 0)) > MIN) kick(c);
    }

    /** LimitService's timer: a sync when the last one is ~15 minutes old. */
    static void maybe(Context c) {
        if (linked(c) && Math.abs(System.currentTimeMillis() - prefs(c).getLong(LAST_TRY, 0)) > EVERY - MIN) kick(c);
    }

    private static void record(SharedPreferences p, SharedPreferences.Editor e, String id, boolean ok, String why) throws JSONException {
        JSONObject seen = new JSONObject(p.getString(SEEN, "{}"));
        JSONObject res = new JSONObject().put("ok", ok).put("why", why == null ? "" : why).put("at", System.currentTimeMillis());
        seen.put(id, res);
        if (seen.length() > SEEN_MAX) {   // the oldest results go
            String oldest = null;
            long t = Long.MAX_VALUE;
            for (Iterator<String> it = seen.keys(); it.hasNext(); ) {
                String k = it.next();
                long a = seen.optJSONObject(k) == null ? 0 : seen.optJSONObject(k).optLong("at");
                if (a < t) { t = a; oldest = k; }
            }
            if (oldest != null) seen.remove(oldest);
        }
        JSONArray acks = new JSONArray(p.getString(ACKS, "[]"));
        acks.put(new JSONObject().put("id", id).put("ok", ok).put("why", why == null ? "" : why));
        e.putString(SEEN, seen.toString()).putString(ACKS, acks.toString());
    }

    /** Facts only native knows, read now (works with the app closed). */
    static JSONObject nat(Context c) throws JSONException {
        long now = System.currentTimeMillis();
        boolean usage = ScreenTime.hasUsageAccess(c), blocker = ScreenTime.blockerOn(c);
        ScreenTime.Rule r = ScreenTime.rule(c);
        long used = -1, total = -1;
        if (usage) {
            ScreenTime.Usage u = ScreenTime.today(c, 30_000);
            if (u != null) {
                total = u.total / MIN;
                used = r == null ? 0 : u.sum(r.apps) / MIN;
            }
        }
        JSONObject o = new JSONObject().put("at", now).put("blocker", blocker).put("usage", usage).put("lim", r == null ? 0 : r.limit).put("used", used).put("total", total)
                .put("ulLeft", ScreenTime.unlocksLeft(c)).put("ulUntil", ScreenTime.unlockUntil(c)).put("ver", version(c));
        Homework.Session s = Homework.tick(c);
        o.put("hw", s == null ? JSONObject.NULL : new JSONObject().put("start", s.start).put("left", s.left()).put("off", s.off));
        if (r != null && used >= r.limit) overLimit(c, r.limit, used);
        blocker(c, blocker);
        return o;
    }

    private static String version(Context c) {
        try {
            PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return pi.versionName == null ? "" : pi.versionName;
        } catch (Exception e) {
            return "";
        }
    }

    /** One round trip: up with the snapshot, facts, events, acks; down with requests (applied or queued for app.js); then photos. */
    static void syncNow(Context c) {
        Link l = link(c);
        if (!l.ok()) return;
        SharedPreferences p = prefs(c);
        long now = System.currentTimeMillis();
        p.edit().putLong(LAST_TRY, now).apply();
        try {
            JSONObject nat = nat(c);   // may queue an event (over the limit, blocker), so before reading the queue
            JSONArray events, acks;
            String snap;
            long snapAt;
            synchronized (FamilySync.class) {
                events = new JSONArray(p.getString(EVENTS, "[]"));
                acks = new JSONArray(p.getString(ACKS, "[]"));
                snapAt = p.getLong(SNAP_AT, 0);
                snap = snapAt > p.getLong(SNAP_SENT, 0) ? p.getString(SNAP, null) : null;
            }
            JSONArray ev50 = new JSONArray(), ack50 = new JSONArray();
            for (int i = 0; i < events.length() && i < 50; i++) ev50.put(events.get(i));
            for (int i = 0; i < acks.length() && i < 50; i++) ack50.put(acks.get(i));
            JSONObject body = new JSONObject().put("nat", nat).put("photos", l.photos).put("events", ev50).put("acks", ack50);
            if (snap != null) body.put("snap", new JSONObject(snap));
            Reply r = postJson(l.url + "/api/kid/sync", l.token, body);
            if (r.code == 401) { gone(c); return; }
            if (r.code != 200) { p.edit().putString(ERR, httpWhy(r)).apply(); return; }
            // sent: drop what went up (anything queued meanwhile stays)
            Set<String> sentEv = ids(ev50), sentAck = ids(ack50);
            synchronized (FamilySync.class) {
                SharedPreferences.Editor e = p.edit().putString(EVENTS, without(new JSONArray(p.getString(EVENTS, "[]")), sentEv).toString())
                        .putString(ACKS, without(new JSONArray(p.getString(ACKS, "[]")), sentAck).toString())
                        .putLong(LAST, System.currentTimeMillis()).putString(ERR, "").putInt(PARENTS, r.json.optInt("parents", 0));
                if (snap != null) e.putLong(SNAP_SENT, snapAt);
                JSONArray have = r.json.optJSONArray("have");
                e.putString(HAVE, have == null ? "[]" : have.toString());
                e.apply();
            }
            boolean changed = apply(c, r.json.optJSONArray("cmds"));
            if (l.photos && r.json.optBoolean("photos")) uploadPhotos(c, l, r.json.optJSONArray("have"));
            if (changed) tell();
            if (events.length() > 50 || acks.length() > 50 || changed) again.set(true);   // more to send, or the acks for what was just done
        } catch (IOException e) {
            p.edit().putString(ERR, "network").apply();
        } catch (Exception e) {
            p.edit().putString(ERR, "failed").apply();
        }
    }

    private static Set<String> ids(JSONArray a) {
        Set<String> s = new HashSet<>();
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null) s.add(o.optString("id")); }
        return s;
    }

    private static JSONArray without(JSONArray a, Set<String> ids) {
        JSONArray out = new JSONArray();
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && !ids.contains(o.optString("id"))) out.put(o); }
        return out;
    }

    /** Applies the requests native owns, queues the rest for app.js. True when anything changed. */
    static boolean apply(Context c, JSONArray cmds) throws JSONException {
        if (cmds == null || cmds.length() == 0) return false;
        boolean changed = false;
        SharedPreferences p = prefs(c);
        for (int i = 0; i < cmds.length() && i < 30; i++) {
            JSONObject cmd = cmds.optJSONObject(i);
            if (cmd == null) continue;
            String id = cmd.optString("id", ""), kind = cmd.optString("kind", "");
            JSONObject args = cmd.optJSONObject("args");
            if (!id.matches(CMD_ID) || args == null) continue;
            synchronized (FamilySync.class) {
                JSONObject seen = new JSONObject(p.getString(SEEN, "{}")).optJSONObject(id);
                if (seen != null) {   // done before (the ack got lost): ack again, don't do it again
                    SharedPreferences.Editor e = p.edit();
                    JSONArray acks = new JSONArray(p.getString(ACKS, "[]"));
                    if (!ids(acks).contains(id)) acks.put(new JSONObject().put("id", id).put("ok", seen.optBoolean("ok")).put("why", seen.optString("why")));
                    e.putString(ACKS, acks.toString()).apply();
                    changed = true;
                    continue;
                }
                JSONArray js = new JSONArray(p.getString(JS, "[]"));
                if (ids(js).contains(id)) continue;   // already waiting for app.js
            }
            String res;
            remote.set(true);
            try {
                switch (kind) {
                    case "hw_end": res = Homework.remoteEndJson(c); break;
                    case "hw_start": res = Homework.startJson(c); break;
                    case "hw_check": res = Homework.remoteCheckJson(c, args.optString("id"), args.optBoolean("on")); break;
                    case "limit": res = ScreenTime.familyLimitJson(c, args.optInt("limit"), args.optString("mode")); break;
                    case "coins":
                    case "idea": res = null; break;
                    default: res = fail("bad");
                }
            } finally {
                remote.remove();
            }
            synchronized (FamilySync.class) {
                SharedPreferences.Editor e = p.edit();
                if (res == null) {   // app.js does these: queued for it, acked when it has
                    JSONArray js = new JSONArray(p.getString(JS, "[]"));
                    js.put(new JSONObject().put("id", id).put("kind", kind).put("args", args));
                    e.putString(JS, js.toString());
                } else {
                    JSONObject o = new JSONObject(res);
                    record(p, e, id, o.optBoolean("ok"), o.optBoolean("ok") ? "" : o.optString("why", "failed"));
                    if ("limit".equals(kind) && o.optBoolean("ok")) {   // app.js keeps its copy of the plan in step
                        JSONArray js = new JSONArray(p.getString(JS, "[]"));
                        js.put(new JSONObject().put("id", id).put("kind", kind).put("args", args).put("mirror", true));
                        e.putString(JS, js.toString());
                    }
                }
                e.apply();
            }
            changed = true;
        }
        return changed;
    }

    private static void uploadPhotos(Context c, Link l, JSONArray have) {
        File[] q = photoDir(c).listFiles();
        if (q == null) return;
        Set<String> there = new HashSet<>();
        for (int i = 0; have != null && i < have.length(); i++) there.add(have.optString(i));
        int n = 0;
        for (File f : q) {
            String entry = f.getName().replace(".jpg", "");
            if (!entry.matches(ID) || there.contains(entry) || f.length() > PHOTO_MAX) { f.delete(); continue; }
            if (n++ >= PHOTOS_PER_SYNC) break;
            try {
                byte[] b = new byte[(int) f.length()];
                try (InputStream is = new java.io.FileInputStream(f)) {
                    int o = 0, k;
                    while (o < b.length && (k = is.read(b, o, b.length - o)) > 0) o += k;
                }
                Reply r = http("PUT", l.url + "/api/kid/photo?entry=" + entry + "&t=" + f.lastModified(), l.token, "image/jpeg", b);
                if (r.code == 200 || r.code == 400 || r.code == 413 || r.code == 403) f.delete();   // sent, or never will be
                if (r.code == 429 || r.code == 401) break;
            } catch (IOException e) {
                break;
            }
        }
    }

    /** Photo entries the server has (app.js skips them). */
    static String haveJson(Context c) {
        return prefs(c).getString(HAVE, "[]");
    }

    private static void tell() {
        Runnable r = listener;
        if (r != null) r.run();
    }
}
