package app.levelup;

import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/**
 * Daily Fit voting links on cinolo.com: friends open the link and tap the outfit they'd wear.
 * The API sends no CORS headers, so the page can't call it; these do, from a background thread.
 * Plain blocking calls that never throw: each returns the JSON string handed back to app.js,
 * {ok:true, ...} or {ok:false, error}.
 */
final class FitPoll {
    static final String API = "https://cinolo.com/api/fit";
    static final Pattern ID = Pattern.compile("^[A-Za-z0-9]{10}$");
    private static final int MAX_IMG = 400 * 1024;      // the server's own limit, decoded
    private static final int MAX_REPLY = 64 * 1024;

    private FitPoll() {
    }

    /** {title?, options:[{img: base64 JPEG, label?}] (1-3)} -> {ok, id, url} */
    static String create(String json) {
        try {
            JSONObject in = new JSONObject(json);
            JSONArray opts = in.optJSONArray("options");
            if (opts == null || opts.length() < 1 || opts.length() > 3) return fail("bad_options");
            JSONArray clean = new JSONArray();
            for (int i = 0; i < opts.length(); i++) {
                JSONObject o = opts.optJSONObject(i);
                String img = o == null ? "" : o.optString("img", "");
                byte[] bytes;
                try {
                    bytes = Base64.decode(img, Base64.DEFAULT);
                } catch (IllegalArgumentException e) {
                    return fail("bad_image");
                }
                if (bytes.length < 4 || (bytes[0] & 0xff) != 0xff || (bytes[1] & 0xff) != 0xd8) return fail("bad_image");
                if (bytes.length > MAX_IMG) return fail("image_too_large");
                clean.put(new JSONObject().put("img", img).put("label", clip(o.optString("label", ""), 60)));
            }
            JSONObject body = new JSONObject().put("title", clip(in.optString("title", ""), 90)).put("options", clean);
            HttpURLConnection c = open(API);
            try {
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                byte[] out = body.toString().getBytes(StandardCharsets.UTF_8);
                c.setFixedLengthStreamingMode(out.length);
                try (OutputStream os = c.getOutputStream()) {
                    os.write(out);
                }
                int code = c.getResponseCode();
                JSONObject r = reply(c, code);
                if (code != 200) return fail(r.optString("error", code == 429 ? "rate_limited" : "http_" + code));
                String id = r.optString("id", ""), url = r.optString("url", "");
                if (!ID.matcher(id).matches() || !url.equals("https://cinolo.com/fit/" + id)) return fail("bad_reply");
                return new JSONObject().put("ok", true).put("id", id).put("url", url).toString();
            } finally {
                c.disconnect();
            }
        } catch (IOException e) {
            return fail("network");
        } catch (Exception e) {
            return fail("bad_reply");
        }
    }

    /** -> {ok, poll:{title, choices, counts, total, created, expires}} or {ok:false, error:"not_found"|...} */
    static String get(String id) {
        if (id == null || !ID.matcher(id).matches()) return fail("not_found");
        try {
            HttpURLConnection c = open(API + "/" + id);
            try {
                c.setRequestProperty("Cache-Control", "no-cache");
                int code = c.getResponseCode();
                JSONObject r = reply(c, code);
                if (code == 404) return fail("not_found");
                if (code != 200) return fail(r.optString("error", "http_" + code));
                JSONArray choices = r.optJSONArray("choices"), counts = r.optJSONArray("counts");
                if (choices == null || counts == null || choices.length() != counts.length() || choices.length() > 3) return fail("bad_reply");
                JSONObject p = new JSONObject().put("title", clip(r.optString("title", ""), 90)).put("choices", choices).put("counts", counts)
                        .put("total", r.optLong("total", 0)).put("created", r.optLong("created", 0)).put("expires", r.optLong("expires", 0));
                return new JSONObject().put("ok", true).put("poll", p).toString();
            } finally {
                c.disconnect();
            }
        } catch (IOException e) {
            return fail("network");
        } catch (Exception e) {
            return fail("bad_reply");
        }
    }

    private static HttpURLConnection open(String url) throws IOException {
        if (!url.startsWith("https://")) throw new IOException("https only");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(false);
        c.setUseCaches(false);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("User-Agent", "LevelUp-Android");
        return c;
    }

    /** The reply as JSON, or {} when it is empty, too big or not JSON. */
    private static JSONObject reply(HttpURLConnection c, int code) {
        try (InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream()) {
            if (is == null) return new JSONObject();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8 * 1024];
            for (int n; (n = is.read(buf)) != -1; ) {
                out.write(buf, 0, n);
                if (out.size() > MAX_REPLY) return new JSONObject();
            }
            return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private static String clip(String s, int n) {
        s = s == null ? "" : s.trim();
        return s.length() > n ? s.substring(0, n) : s;
    }

    private static String fail(String why) {
        try {
            return new JSONObject().put("ok", false).put("error", why).toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"failed\"}";
        }
    }
}
