package app.levelup;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ComponentName;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Hosts the LEVEL UP web app. Every file ships inside the APK and is served from
 * https://appassets.androidplatform.net, so the app works offline and localStorage persists.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/www/index.html";
    private static final int PICK_FILE = 1, CAMERA = 2;
    private static final int GROUND = Color.rgb(0x0c, 0x0a, 0x1d);

    static final String OPEN = "levelup.open";   // "workout" | "pushups" | "homework": sent by the block screen
    static final String APP = "levelup.app";     // with "pushups": the app that was blocked

    private static final long CHECK_EVERY_MS = 15L * 60 * 1000;   // auto-check on open, at most every 15 minutes

    private WebView web;
    private ValueCallback<Uri[]> pendingPick;
    private boolean pageReady;
    private volatile boolean checking, downloading;
    private boolean manualPending;            // "Check for updates" was tapped while a check was running
    private Updater.Release available;        // a newer build we know about
    private boolean resumed;
    private File readyApk;                    // downloaded and checked, waiting for the app to be on screen
    private String openJs;                    // TRAIN INSTEAD / EMERGENCY UNLOCK was tapped: run once the page is ready
    private PermissionRequest camAsk;         // the page's camera request, waiting for Android's permission dialog
    private final AtomicBoolean fitBusy = new AtomicBoolean();   // one voting link at a time

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(GROUND);
        getWindow().setNavigationBarColor(GROUND);

        web = new WebView(this);
        web.setBackgroundColor(GROUND);
        setContentView(web);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setTextZoom(100);   // the layout is set in px; system font scaling would break it
        s.setMediaPlaybackRequiresUserGesture(false);   // the push-up camera preview plays without a second tap

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse r = loader.shouldInterceptRequest(request.getUrl());
                // the pose model's JS module and WebAssembly need their real types (an older table may not know them)
                String path = request.getUrl().getPath();
                if (r != null && path != null) {
                    if (path.endsWith(".mjs")) r.setMimeType("text/javascript");
                    else if (path.endsWith(".wasm")) r.setMimeType("application/wasm");
                }
                return r;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (available != null) announce(available); else maybeCheck(false);
                if (openJs != null) {
                    js(openJs);
                    openJs = null;
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (HOST.equals(url.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));   // outside links open the browser
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        // A WebChromeClient also turns on the native alert()/confirm() dialogs the app uses.
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingPick != null) pendingPick.onReceiveValue(null);
                pendingPick = callback;
                // a Daily Fit photo (accept="image/*") or a backup (anything: some file managers mislabel .json)
                boolean image = false;
                for (String t : params.getAcceptTypes()) image |= t != null && t.startsWith("image/");
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType(image ? "image/*" : "*/*");
                try {
                    startActivityForResult(Intent.createChooser(pick, image ? "Choose a photo" : "Choose a LEVEL UP backup"), PICK_FILE);
                    return true;
                } catch (Exception e) {
                    pendingPick = null;
                    return false;
                }
            }

            // the push-up counter's camera: only our own page, only video. Android asks the user the first time.
            @Override
            public void onPermissionRequest(PermissionRequest r) {
                runOnUiThread(() -> {
                    Uri o = r.getOrigin();
                    boolean ok = o != null && HOST.equals(o.getHost()) && r.getResources().length > 0;
                    for (String res : r.getResources()) ok &= PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res);
                    if (!ok) {
                        r.deny();
                    } else if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        r.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
                    } else {
                        if (camAsk != null) camAsk.deny();
                        camAsk = r;
                        requestPermissions(new String[] { Manifest.permission.CAMERA }, CAMERA);
                    }
                });
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest r) {
                runOnUiThread(() -> {
                    if (r == camAsk) camAsk = null;
                });
            }
        });

        web.addJavascriptInterface(new Bridge(), "LevelUpAndroid");
        // only a fresh start from the block screen: a task recreated after process death, or reopened from Recents,
        // still carries the extra in its root intent and must not open the workout (or push-ups) again
        if (savedInstanceState == null && (getIntent().getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0) openJs = openJs(getIntent());
        web.loadUrl(START);
    }

    /** What the block screen asked for, as the JS to run, or null. */
    private static String openJs(Intent i) {
        String what = i.getStringExtra(OPEN), app = i.getStringExtra(APP);
        if ("workout".equals(what)) return "window.levelupOpenWorkout && window.levelupOpenWorkout()";
        if ("homework".equals(what)) return "window.levelupOpenHomework && window.levelupOpenHomework()";
        if ("pushups".equals(what)) return "window.levelupOpenPushups && window.levelupOpenPushups(" + (app == null ? "null" : JSONObject.quote(app)) + ")";
        return null;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String code = openJs(intent);
        if (code == null) return;
        if (pageReady) js(code); else openJs = code;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode != CAMERA || camAsk == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) camAsk.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
        else camAsk.deny();
        camAsk = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_FILE && pendingPick != null) {
            Uri picked = (resultCode == RESULT_OK && data != null) ? data.getData() : null;
            pendingPick.onReceiveValue(picked != null ? new Uri[] { picked } : null);
            pendingPick = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /**
     * Back closes an open sheet or returns to Home first; only then does it leave the app.
     * Leaving keeps the app alive in the background, so a running update download is not lost.
     */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(window.levelupBack && window.levelupBack()) ? 1 : 0", value -> {
            if (!"1".equals(value)) moveTaskToBack(true);
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        resumed = false;
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        web.onResume();
        if (readyApk != null) {
            File apk = readyApk;
            readyApk = null;
            openInstaller(apk);
        } else if (pageReady) {
            maybeCheck(false);
        }
        // back from Settings (Usage access, the blocker) or from a limited app: the numbers may have moved
        if (pageReady) js("window.levelupScreenTimeChanged && window.levelupScreenTimeChanged()");
    }

    // ------------------------------------------------------------------ updates

    private long currentVersion() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) {
            return Long.MAX_VALUE;   // unknown: never offer an update
        }
    }

    private String currentVersionName() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return pi.versionName + " (build " + currentVersion() + ")";
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * Asks GitHub for the newest build. Automatic checks are throttled, but only after a check that
     * found nothing new, so a known update is offered again on every launch. A manual check always runs.
     */
    private void maybeCheck(final boolean manual) {
        if (downloading) {
            if (manual) noUpdate("Watch the banner on Home", "Update downloading");
            return;
        }
        if (checking) {
            if (manual) manualPending = true;
            return;
        }
        final SharedPreferences prefs = getSharedPreferences("updates", MODE_PRIVATE);
        long since = System.currentTimeMillis() - prefs.getLong("lastCheck", 0);
        if (!manual && (available != null || (since >= 0 && since < CHECK_EVERY_MS))) return;
        checking = true;
        new Thread(() -> {
            Updater.Release r = null;
            String error = null;
            try {
                r = Updater.latest();
                if (r == null || r.versionCode <= currentVersion()) {
                    prefs.edit().putLong("lastCheck", System.currentTimeMillis()).apply();
                }
            } catch (Exception e) {
                error = "Could not reach the update server";
            }
            final Updater.Release found = r;
            final String err = error;
            runOnUiThread(() -> {
                checking = false;
                boolean asked = manual || manualPending;
                manualPending = false;
                if (found != null && found.versionCode > currentVersion()) {
                    available = found;
                    announce(found);
                } else if (asked) {
                    noUpdate(err == null ? "" : err, err == null ? "" : "No connection");
                }
            });
        }).start();
    }

    private void noUpdate(String detail, String title) {
        js("window.levelupUpdateNone && window.levelupUpdateNone(" + JSONObject.quote(detail) + "," + JSONObject.quote(title) + ")");
    }

    private void announce(Updater.Release r) {
        if (pageReady) js("window.levelupUpdate && window.levelupUpdate(" + JSONObject.quote(r.name) + ")");
    }

    /**
     * Downloads the new APK and hands it to Android's installer (the user confirms there).
     * The first time, the installer itself asks the user to allow installs from LEVEL UP. It copies
     * the APK before asking, so the update survives Android 11 restarting this app when that is allowed.
     */
    private void installUpdate() {
        final Updater.Release r = available;
        if (r == null || downloading) return;
        downloading = true;
        final File apk = new File(new File(getCacheDir(), "updates"), "LevelUp.apk");
        new Thread(() -> {
            try {
                Updater.download(r, apk, pct -> runOnUiThread(() -> js("window.levelupUpdateProgress && window.levelupUpdateProgress(" + pct + ")")));
                PackageInfo pi = getPackageManager().getPackageArchiveInfo(apk.getPath(), 0);
                long code = pi == null ? -1 : (Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
                if (pi == null || !getPackageName().equals(pi.packageName) || code <= currentVersion()) {
                    throw new IllegalStateException("Downloaded file is not a newer LEVEL UP");
                }
                runOnUiThread(() -> {
                    downloading = false;
                    openInstaller(apk);
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    downloading = false;
                    js("window.levelupUpdateFailed && window.levelupUpdateFailed(" + JSONObject.quote("Download failed. Check your connection and try again") + ")");
                });
            }
        }).start();
    }

    private void openInstaller(File apk) {
        if (!resumed) {   // Android blocks starting the installer from the background; open it on return
            readyApk = apk;
            return;
        }
        // A separate task, so replacing this app does not close the installer's "App installed" screen.
        Intent install = new Intent(Intent.ACTION_VIEW)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            install.setDataAndType(FileProvider.getUriForFile(this, getPackageName() + ".files", apk),
                    "application/vnd.android.package-archive");
            startActivity(install);
            js("window.levelupUpdateProgress && window.levelupUpdateProgress(100)");
        } catch (Exception e) {
            js("window.levelupUpdateFailed && window.levelupUpdateFailed(" + JSONObject.quote("Could not open the installer") + ")");
        }
    }

    private void share(Intent send) {
        runOnUiThread(() -> {
            try {
                startActivity(Intent.createChooser(send, "Share your fit"));
            } catch (Exception e) {
                Toast.makeText(this, "Could not open sharing", Toast.LENGTH_LONG).show();
            }
        });
    }

    /** A Daily Fit answer back to the page, on the UI thread. */
    private void fitDone(String fn, String key, String json) {
        runOnUiThread(() -> js("window." + fn + " && window." + fn + "(" + JSONObject.quote(key) + "," + JSONObject.quote(json) + ")"));
    }

    private void js(String code) {
        if (web != null) web.evaluateJavascript(code, null);
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    /** Called from app.js; the WebView cannot download blob: URLs itself. */
    public class Bridge {
        @JavascriptInterface
        public void checkForUpdate() {
            runOnUiThread(() -> maybeCheck(true));
        }

        @JavascriptInterface
        public void installUpdate() {
            runOnUiThread(MainActivity.this::installUpdate);
        }

        @JavascriptInterface
        public String version() {
            return currentVersionName();
        }

        @JavascriptInterface
        public void saveBackup(String name, String json) {
            final String safe = (name == null ? "levelup-backup.json" : name).replaceAll("[^A-Za-z0-9._-]", "_");
            runOnUiThread(() -> {
                try {
                    String where = write(safe, json == null ? "" : json);
                    Toast.makeText(MainActivity.this, "Backup saved " + where, Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Could not save the backup", Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public void keepAwake(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        // ---- screen-time limit: JSON strings in and out (see ScreenTime)
        @JavascriptInterface
        public String screenTimeStatus() {
            return ScreenTime.status(MainActivity.this);
        }

        @JavascriptInterface
        public String screenTimeToday(String json) {
            return ScreenTime.todayJson(MainActivity.this, json);
        }

        @JavascriptInterface
        public String screenTimeDays(String json) {
            return ScreenTime.daysJson(MainActivity.this, json);
        }

        @JavascriptInterface
        public String screenTimeApps() {
            return ScreenTime.appsJson(MainActivity.this);
        }

        /** false: refused (looser than the stored plan while a parent's PIN is set and wasn't just typed). */
        @JavascriptInterface
        public boolean setScreenTimeConfig(String json) {
            return ScreenTime.setConfig(MainActivity.this, json);
        }

        @JavascriptInterface
        public boolean openScreenTimeSettings(String which) {
            return openSettings(which);
        }

        /** Phone Down: other apps' foreground time between two moments, JSON (see ScreenTime.phoneUseJson). */
        @JavascriptInterface
        public String phoneUseBetween(double fromMs, double toMs) {
            return ScreenTime.phoneUseJson(MainActivity.this, (long) fromMs, (long) toMs);
        }

        /** The wall clock and time since boot: a clock moved forward can't stretch a Phone Down session. */
        @JavascriptInterface
        public String clock() {
            return "{\"now\":" + System.currentTimeMillis() + ",\"up\":" + SystemClock.elapsedRealtime() + "}";
        }

        /** "Nice. Close the app?": to the background, like Home (the app stays alive). */
        @JavascriptInterface
        public void minimize() {
            runOnUiThread(() -> moveTaskToBack(true));
        }

        /** After 10 push-ups on camera: 15 min unlocked, if today's rules allow it. JSON {ok, until, left, why}. */
        @JavascriptInterface
        public String grantPushupUnlock() {
            return ScreenTime.unlockJson(MainActivity.this);
        }

        /** Back to the app the block screen was covering. Only one of today's limited apps; false if it can't open. */
        @JavascriptInterface
        public boolean openApp(String pkg) {
            ScreenTime.Rule r = ScreenTime.rule(MainActivity.this);
            Intent i = pkg == null || r == null || !r.apps.contains(pkg) ? null : getPackageManager().getLaunchIntentForPackage(pkg);
            if (i == null) return false;
            runOnUiThread(() -> {
                try {
                    startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception ignored) {
                }
            });
            return true;
        }

        // ---- homework mode and the parent's PIN: JSON strings out; Homework checks every rule (JS only shows and asks)

        @JavascriptInterface
        public String homeworkStatus() {
            return Homework.statusJson(MainActivity.this);
        }

        @JavascriptInterface
        public String homeworkStart() {
            return Homework.startJson(MainActivity.this);
        }

        /** The live proof photo was taken and stored (IndexedDB id): recorded for this session. */
        @JavascriptInterface
        public String homeworkProof(String id) {
            return Homework.proofJson(MainActivity.this, id);
        }

        @JavascriptInterface
        public String homeworkFinish(String proofId, String note) {
            return Homework.finishJson(MainActivity.this, proofId, note);
        }

        /** A parent ends it (PIN typed in the last 3 minutes). */
        @JavascriptInterface
        public String homeworkEnd() {
            return Homework.endJson(MainActivity.this);
        }

        /** Only while the blocker is off: ends it, logged as "blocker off". */
        @JavascriptInterface
        public String homeworkEndOff() {
            return Homework.endOffJson(MainActivity.this);
        }

        @JavascriptInterface
        public String homeworkSetConfig(String json) {
            return Homework.setConfigJson(MainActivity.this, json);
        }

        @JavascriptInterface
        public String homeworkDelete(String id) {
            return Homework.deleteJson(MainActivity.this, id);
        }

        @JavascriptInterface
        public String homeworkAllowed() {
            return Homework.allowedJson(MainActivity.this);
        }

        /** Opens one of the allowed apps (the running session's list, else the settings'); false for anything else. */
        @JavascriptInterface
        public boolean homeworkOpenApp(String pkg) {
            Intent i = pkg == null || !Homework.allowed(MainActivity.this).contains(pkg) || !ScreenTime.isLaunchable(MainActivity.this, pkg) ? null
                    : getPackageManager().getLaunchIntentForPackage(pkg);
            if (i == null) return false;
            runOnUiThread(() -> {
                try {
                    startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception ignored) {
                }
            });
            return true;
        }

        @JavascriptInterface
        public boolean pinIsSet() {
            return Homework.pinIsSet(MainActivity.this);
        }

        /** {ok} or {ok:false, why: "bad" | "wrong" | "locked" | "failed", left, until}. Changing a PIN needs the old one. */
        @JavascriptInterface
        public String pinSet(String old, String pin) {
            return Homework.pinSetJson(MainActivity.this, old, pin);
        }

        /** {ok} (a parent's 3 minutes start) or {ok:false, why: "wrong" | "locked" | "nopin", left: tries left, until}. */
        @JavascriptInterface
        public String pinCheck(String pin) {
            return Homework.pinCheckJson(MainActivity.this, pin);
        }

        /** The parent area closed: PIN-guarded changes need the PIN again. */
        @JavascriptInterface
        public void pinLock() {
            Homework.pinLock();
        }

        // ---- Daily Fit: voting links on cinolo.com (no CORS, so never from the page) and Android's share sheet

        /** {req, title, options:[{img, label}]}: answers later with window.levelupFitPollMade(req, {ok, id, url} | {ok:false, error}). */
        @JavascriptInterface
        public void createFitPoll(String json) {
            String req = "";
            try {
                req = new JSONObject(json).optString("req", "");
            } catch (Exception ignored) {
            }
            final String r = req.length() > 40 ? req.substring(0, 40) : req;
            if (json == null || json.length() > 2_000_000) {
                fitDone("levelupFitPollMade", r, "{\"ok\":false,\"error\":\"too_large\"}");
                return;
            }
            if (!fitBusy.compareAndSet(false, true)) {
                fitDone("levelupFitPollMade", r, "{\"ok\":false,\"error\":\"busy\"}");
                return;
            }
            new Thread(() -> {
                String res = FitPoll.create(json);
                fitBusy.set(false);
                fitDone("levelupFitPollMade", r, res);
            }).start();
        }

        /** Answers later with window.levelupFitPollResult(id, {ok, poll} | {ok:false, error}). */
        @JavascriptInterface
        public void getFitPoll(String id) {
            final String i = id == null ? "" : id;
            new Thread(() -> fitDone("levelupFitPollResult", i, FitPoll.get(i))).start();
        }

        /** Android's share sheet with a line of text (the voting link). */
        @JavascriptInterface
        public boolean shareText(String text) {
            if (text == null || text.isEmpty() || text.length() > 2000) return false;
            Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
            share(send);
            return true;
        }

        /** Shares a JPEG (base64, from the page) through the FileProvider: the fallback when a voting link can't be made. */
        @JavascriptInterface
        public boolean sharePhoto(String b64, String text) {
            try {
                if (b64 == null || b64.length() > 8_000_000) return false;
                byte[] bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
                if (bytes.length < 4 || (bytes[0] & 0xff) != 0xff || (bytes[1] & 0xff) != 0xd8) return false;
                File dir = new File(getCacheDir(), "shares");
                if (!dir.isDirectory() && !dir.mkdirs()) return false;
                File[] old = dir.listFiles();   // earlier shares, once the app they went to has had time to read them
                if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 3_600_000L) f.delete();
                File out = new File(dir, "fit-" + System.currentTimeMillis() + ".jpg");
                try (FileOutputStream os = new FileOutputStream(out)) {
                    os.write(bytes);
                }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", out);
                Intent send = new Intent(Intent.ACTION_SEND).setType("image/jpeg").putExtra(Intent.EXTRA_STREAM, uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                send.setClipData(ClipData.newRawUri("", uri));
                if (text != null && !text.isEmpty() && text.length() <= 2000) send.putExtra(Intent.EXTRA_TEXT, text);
                share(send);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** A limited app's name, for "Back to TikTok". "" if it isn't one. */
        @JavascriptInterface
        public String appName(String pkg) {
            ScreenTime.Rule r = ScreenTime.rule(MainActivity.this);
            String n = pkg == null || r == null || !r.apps.contains(pkg) ? null : ScreenTime.label(MainActivity.this, pkg);
            return n == null ? "" : n;
        }
    }

    /** "usage" | "accessibility" | "appinfo": the most specific screen that opens, else Settings itself. False: nothing opened. */
    private boolean openSettings(String which) {
        String pkg = getPackageName();
        java.util.List<Intent> tries = new java.util.ArrayList<>();
        if ("usage".equals(which)) {
            // the per-app Usage access page exists in AOSP Settings from Android 10
            if (Build.VERSION.SDK_INT >= 29) tries.add(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.fromParts("package", pkg, null)));
            tries.add(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
        } else if ("accessibility".equals(which)) {
            // unofficial extra: some Settings builds scroll to and highlight our row; ignored elsewhere
            tries.add(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                    .putExtra(":settings:fragment_args_key", new ComponentName(this, LimitService.class).flattenToString()));
        } else if ("appinfo".equals(which)) {
            tries.add(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", pkg, null)));
        } else {
            return false;
        }
        tries.add(new Intent(Settings.ACTION_SETTINGS));
        for (Intent i : tries) {
            try {
                startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                return true;
            } catch (Exception ignored) {
            }
        }
        return false;
    }

    private String write(String name, String json) throws Exception {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("no MediaStore entry");
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException("no output stream");
                out.write(bytes);
            }
            return "to Downloads";
        }
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) dir = getFilesDir();
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return "to " + file.getAbsolutePath();
    }
}
