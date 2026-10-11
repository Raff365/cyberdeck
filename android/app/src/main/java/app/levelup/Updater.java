package app.levelup;

import org.json.JSONArray;
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

/**
 * Finds the newest LEVEL UP build and downloads it. Builds are published as GitHub releases
 * tagged "apk-N", where N is the APK's versionCode, each with a LevelUp.apk asset.
 * Plain blocking calls: always run these off the main thread.
 */
final class Updater {
    static final String LATEST = "https://api.github.com/repos/Raff365/cyberdeck/releases/latest";
    static final String ASSET = "LevelUp.apk";

    static final class Release {
        final long versionCode;
        final String name;
        final String url;
        final long size;

        Release(long versionCode, String name, String url, long size) {
            this.versionCode = versionCode;
            this.name = name;
            this.url = url;
            this.size = size;
        }
    }

    interface Progress {
        void onProgress(int percent);
    }

    private Updater() {
    }

    /** The newest published build, or null if the latest release has no usable APK. */
    static Release latest() throws IOException {
        HttpURLConnection c = open(LATEST);
        c.setRequestProperty("Accept", "application/vnd.github+json");
        try {
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
            JSONObject json = new JSONObject(readAll(c.getInputStream()));
            String tag = json.optString("tag_name", "");
            if (!tag.startsWith("apk-")) return null;
            long code = Long.parseLong(tag.substring(4));
            JSONArray assets = json.optJSONArray("assets");
            if (assets == null) return null;
            for (int i = 0; i < assets.length(); i++) {
                JSONObject a = assets.getJSONObject(i);
                if (ASSET.equals(a.optString("name"))) {
                    String url = a.optString("browser_download_url", "");
                    if (!url.startsWith("https://")) return null;
                    return new Release(code, json.optString("name", "Build " + code), url, a.optLong("size", -1));
                }
            }
            return null;
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException("Unreadable release info", e);
        } finally {
            c.disconnect();
        }
    }

    /** Downloads the APK to {@code dest}, reporting whole-percent progress. */
    static void download(Release r, File dest, Progress progress) throws IOException {
        File dir = dest.getParentFile();
        if (dir != null && !dir.isDirectory() && !dir.mkdirs()) throw new IOException("No download folder");
        File part = new File(dest.getPath() + ".part");
        HttpURLConnection c = open(r.url);   // GitHub answers with a redirect to its file host; followed automatically
        try {
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
            long total = r.size > 0 ? r.size : c.getContentLengthLong();
            long done = 0;
            int last = -1;
            byte[] buf = new byte[64 * 1024];
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                for (int n; (n = in.read(buf)) != -1; ) {
                    out.write(buf, 0, n);
                    done += n;
                    if (total > 0) {
                        int pct = (int) Math.min(100, done * 100 / total);
                        if (pct != last) {
                            last = pct;
                            progress.onProgress(pct);
                        }
                    }
                }
            }
            if (r.size > 0 && done != r.size) throw new IOException("Download incomplete");
            if (dest.exists() && !dest.delete()) throw new IOException("Could not replace old download");
            if (!part.renameTo(dest)) throw new IOException("Could not save download");
        } finally {
            c.disconnect();
            if (part.exists()) part.delete();
        }
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", "LevelUp-Android");
        return c;
    }

    private static String readAll(InputStream in) throws IOException {
        try (InputStream is = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16 * 1024];
            for (int n; (n = is.read(buf)) != -1; ) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }
}
