package app.levelup;

import android.app.Activity;
import android.content.ComponentName;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
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

/**
 * Hosts the LEVEL UP web app. Every file ships inside the APK and is served from
 * https://appassets.androidplatform.net, so the app works offline and localStorage persists.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/www/index.html";
    private static final int PICK_FILE = 1;
    private static final int GROUND = Color.rgb(0x0c, 0x0a, 0x1d);

    static final String OPEN = "levelup.open";   // "workout": sent by the screen-time block screen

    private static final long CHECK_EVERY_MS = 15L * 60 * 1000;   // auto-check on open, at most every 15 minutes

    private WebView web;
    private ValueCallback<Uri[]> pendingPick;
    private boolean pageReady;
    private volatile boolean checking, downloading;
    private boolean manualPending;            // "Check for updates" was tapped while a check was running
    private Updater.Release available;        // a newer build we know about
    private boolean resumed;
    private File readyApk;                    // downloaded and checked, waiting for the app to be on screen
    private boolean openWorkout;              // TRAIN INSTEAD was tapped; open the workout once the page is ready

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

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (available != null) announce(available); else maybeCheck(false);
                if (openWorkout) {
                    openWorkout = false;
                    js("window.levelupOpenWorkout && window.levelupOpenWorkout()");
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
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(pick, "Choose a LEVEL UP backup"), PICK_FILE);
                    return true;
                } catch (Exception e) {
                    pendingPick = null;
                    return false;
                }
            }
        });

        web.addJavascriptInterface(new Bridge(), "LevelUpAndroid");
        // only a fresh start from the block screen: a task recreated after process death, or reopened from Recents,
        // still carries the extra in its root intent and must not open the workout again
        openWorkout = savedInstanceState == null && (getIntent().getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0
                && "workout".equals(getIntent().getStringExtra(OPEN));
        web.loadUrl(START);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (!"workout".equals(intent.getStringExtra(OPEN))) return;
        if (pageReady) js("window.levelupOpenWorkout && window.levelupOpenWorkout()"); else openWorkout = true;
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

        @JavascriptInterface
        public void setScreenTimeConfig(String json) {
            ScreenTime.setConfig(MainActivity.this, json);
        }

        @JavascriptInterface
        public boolean openScreenTimeSettings(String which) {
            return openSettings(which);
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
