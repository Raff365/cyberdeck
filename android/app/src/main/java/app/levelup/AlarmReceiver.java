package app.levelup;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * FIRE: AlarmManager's alarm for the soonest ring (Alarms.schedule). Anything else (a reboot, this app updated itself,
 * the clock or time zone changed, exact alarms allowed again): AlarmManager may have forgotten it or it may now be at
 * the wrong time, so it is set again. Not exported: only AlarmManager (our own PendingIntent) and the system reach it.
 */
public class AlarmReceiver extends BroadcastReceiver {
    static final String FIRE = "app.levelup.alarm.FIRE";

    @Override
    public void onReceive(Context c, Intent i) {
        if (i != null && FIRE.equals(i.getAction())) Alarms.fire(c, i.getLongExtra(Alarms.EXTRA_AT, 0));
        else Alarms.schedule(c);
    }
}
