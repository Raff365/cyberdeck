package app.levelup;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

/**
 * A ringing alarm, as a foreground service so Android keeps it going with the screen off: the phone's alarm sound
 * (alarm volume, getting louder over 45 s), a buzz pattern and a partial wake lock. Only shaking stops it (AlarmActivity
 * calls done()); after 10 minutes it gives up on its own and leaves a "missed alarm" notification. One rings at a time:
 * another alarm firing meanwhile only adds its reminder. State is static so the alarm screen can read it at once.
 */
public class AlarmService extends Service {
    static final String RING = "app.levelup.alarm.RING", REPOST = "app.levelup.alarm.REPOST";
    static final long MAX_RING = 10 * 60_000L;
    private static final long RAMP = 45_000L;
    private static final float QUIET = 0.15f;                  // where the sound starts, of the alarm volume
    private static final long[] BUZZ = { 0, 800, 600 };       // on, off, repeating

    static volatile boolean ringing, timedOut;
    static volatile long ringAt;                 // the time it was set for
    static volatile long startedAt;              // elapsedRealtime when it started ringing (how long it took him)
    static volatile String text = "";
    static Runnable listener;                    // AlarmActivity: the reminder changed or the ringing stopped (main thread)
    private static AlarmService self;

    private final Handler h = new Handler(Looper.getMainLooper());
    private final Runnable ramp = this::ramp, beep = this::beep, timeout = this::timeout;
    private MediaPlayer player;
    private ToneGenerator tone;
    private Vibrator vib;
    private boolean buzzing;
    private PowerManager.WakeLock lock;
    private AudioManager audio;
    private AudioFocusRequest focus;
    private int volWas = -1;

    /** From AlarmReceiver (an exact alarm may start a foreground service from the background) or the alarm screen. */
    static void start(Context c, long at, String text) {
        Intent i = new Intent(c, AlarmService.class).setAction(RING).putExtra(Alarms.EXTRA_AT, at).putExtra(Alarms.EXTRA_TEXT, text == null ? "" : text);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (Exception e) {
            // Android said no (a foreground service from the background, e.g. without exact alarms on Android 12):
            // the notification alone. Opening it shows the alarm screen, which starts the sound from the front.
            Alarms.postRing(c, at, text);
        }
    }

    /** Shaken off: quiet at once, and noted for the page (how long it took). */
    static void done(Context c, boolean taps) {
        if (!ringing) return;
        Alarms.record(c, ringAt, (SystemClock.elapsedRealtime() - startedAt) / 1000, false, taps);
        ringing = false;
        c.stopService(new Intent(c, AlarmService.class));
    }

    /** He's shaking: the buzz stops so each shake's tick can be felt; it starts again if he stops for a while. */
    static void shaking(boolean on) {
        AlarmService s = self;
        if (s != null && ringing) s.buzz(!on);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        self = this;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        String a = i == null ? null : i.getAction();
        if (RING.equals(a)) {
            long at = i.getLongExtra(Alarms.EXTRA_AT, 0);
            String t = i.getStringExtra(Alarms.EXTRA_TEXT);
            if (ringing) {   // one at a time: the second one's reminder joins the first
                text = Alarms.merge(text, t);
                foreground();
                changed();
                return START_NOT_STICKY;
            }
            ringing = true;
            timedOut = false;
            ringAt = at > 0 ? at : System.currentTimeMillis();
            startedAt = SystemClock.elapsedRealtime();
            text = t == null ? "" : t;
            foreground();
            hold();
            play();
            buzz(true);
            h.postDelayed(timeout, MAX_RING);
            show();
            changed();
        } else if (REPOST.equals(a) && ringing) {
            foreground();
        } else if (!ringing) {
            stopSelf(id);
        }
        return START_NOT_STICKY;   // killed anyway: no restart with nothing to ring
    }

    private void foreground() {
        try {
            android.app.Notification n = Alarms.ringNote(this, ringAt, text);
            if (Build.VERSION.SDK_INT >= 29) startForeground(Alarms.NOTE_RING, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(Alarms.NOTE_RING, n);
        } catch (Exception e) {
            Alarms.postRing(this, ringAt, text);   // still rings while Android lets it
        }
    }

    /** Straight to the alarm screen where Android allows it (screen off: the full-screen notification does it anyway). */
    private void show() {
        try {
            startActivity(AlarmActivity.intent(this, ringAt, text));
        } catch (Exception ignored) {
        }
    }

    private void hold() {
        try {
            lock = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "levelup:alarm");
            lock.setReferenceCounted(false);
            lock.acquire(MAX_RING + 60_000L);
        } catch (Exception ignored) {
        }
    }

    private void play() {
        AudioAttributes aa = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        try {
            // an alarm turned all the way down rings for nobody: at least half way while it rings, put back after
            int max = audio.getStreamMaxVolume(AudioManager.STREAM_ALARM), cur = audio.getStreamVolume(AudioManager.STREAM_ALARM), want = (max + 1) / 2;
            if (cur < want) {
                audio.setStreamVolume(AudioManager.STREAM_ALARM, want, 0);
                volWas = cur;
            }
        } catch (Exception ignored) {
        }
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(aa).build();
                audio.requestAudioFocus(focus);   // music pauses while it rings
            } catch (Exception ignored) {
            }
        }
        // the phone's alarm sound; a sound that won't play (a deleted file) falls back to the defaults, then to beeps
        Uri[] tries = { RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM), RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE) };
        for (Uri u : tries) {
            if (u == null) continue;
            MediaPlayer mp = new MediaPlayer();
            try {
                mp.setAudioAttributes(aa);
                mp.setDataSource(this, u);
                mp.setLooping(true);
                mp.setVolume(QUIET, QUIET);
                mp.prepare();
                mp.start();
                player = mp;
                break;
            } catch (Exception e) {
                mp.release();
            }
        }
        if (player == null) {
            try {
                tone = new ToneGenerator(AudioManager.STREAM_ALARM, ToneGenerator.MAX_VOLUME);
            } catch (Exception ignored) {
            }
            h.post(beep);
        }
        h.postDelayed(ramp, 1000);
    }

    private void ramp() {
        if (player == null) return;
        float v = QUIET + (1 - QUIET) * Math.min(1f, (SystemClock.elapsedRealtime() - startedAt) / (float) RAMP);
        try {
            player.setVolume(v, v);
        } catch (Exception ignored) {
        }
        if (v < 1f) h.postDelayed(ramp, 1000);
    }

    private void beep() {
        if (tone == null) return;
        try {
            tone.startTone(ToneGenerator.TONE_CDMA_HIGH_L, 500);
        } catch (Exception ignored) {
        }
        h.postDelayed(beep, 1000);
    }

    @SuppressWarnings("deprecation")
    private void buzz(boolean on) {
        if (on == buzzing) return;
        buzzing = on;
        try {
            if (vib == null) vib = Build.VERSION.SDK_INT >= 31
                    ? ((VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE)).getDefaultVibrator()
                    : (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vib == null || !vib.hasVibrator()) return;
            if (!on) vib.cancel();
            else if (Build.VERSION.SDK_INT >= 33) vib.vibrate(VibrationEffect.createWaveform(BUZZ, 0), VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM));
            else if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createWaveform(BUZZ, 0), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
            else vib.vibrate(BUZZ, 0);
        } catch (Exception ignored) {
        }
    }

    /** 10 minutes and nobody shook it: quiet, and a "missed" notification with the reminder. */
    private void timeout() {
        if (!ringing) return;
        Alarms.record(this, ringAt, 0, true, false);
        Alarms.missed(this, ringAt, text);
        timedOut = true;
        ringing = false;
        stopSelf();
    }

    private static void changed() {
        Runnable r = listener;
        if (r != null) r.run();
    }

    @Override
    public void onDestroy() {
        h.removeCallbacksAndMessages(null);
        ringing = false;
        if (self == this) self = null;
        if (player != null) {
            try {
                player.stop();
            } catch (Exception ignored) {
            }
            player.release();
            player = null;
        }
        if (tone != null) {
            tone.release();
            tone = null;
        }
        buzz(false);
        try {
            if (volWas >= 0) audio.setStreamVolume(AudioManager.STREAM_ALARM, volWas, 0);
            if (focus != null) audio.abandonAudioFocusRequest(focus);
        } catch (Exception ignored) {
        }
        if (lock != null && lock.isHeld()) lock.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        changed();
        super.onDestroy();
    }
}
