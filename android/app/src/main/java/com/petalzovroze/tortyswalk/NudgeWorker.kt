package com.petalzovroze.tortyswalk

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.LocalDate
import java.time.LocalTime
import java.util.concurrent.TimeUnit

/**
 * Hourly, battery-friendly check (WorkManager). Sends at most:
 *  - one "goal reached" notification per day (only when it can read Health Connect in the background
 *    and the game hasn't already celebrated on screen), and
 *  - one gentle evening nudge (6–9 PM) if today's goal isn't met yet.
 */
class NudgeWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val p = Prefs.get(ctx)
        val today = LocalDate.now().toString()
        val goal = p.getInt("goal", 10_000)

        var fresh: Long? = null
        try {
            if (HealthConnectClient.getSdkStatus(ctx, HC_PROVIDER) == HealthConnectClient.SDK_AVAILABLE &&
                !p.getBoolean("preferSensor", false)) {
                val client = HealthConnectClient.getOrCreate(ctx)
                val granted = client.permissionController.getGrantedPermissions()
                if (READ_STEPS in granted && HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in granted) {
                    fresh = StepRepository(ctx, SensorStepTracker(ctx)).readToday(client)
                }
            }
        } catch (_: Exception) { }

        val cached = if (p.getString("cacheDate", "") == today) p.getLong("cacheSteps", 0) else 0L
        val known = fresh ?: cached
        val goalDone = p.getString("goalNotified", "") == today

        if (fresh != null && fresh >= goal && !goalDone) {
            notify(ctx, 1, "🏆 Daily goal reached!",
                "%,d steps! Slow and steady won the race — Torty is so proud of you.".format(fresh))
            p.edit().putString("goalNotified", today).apply()
        } else if (LocalTime.now().hour in 18..20 && p.getString("nudged", "") != today && !goalDone && known < goal) {
            val msg = if (fresh != null) "%,d steps to go today. Slow and steady — Torty's ready when you are!".format(goal - known)
                else "Torty would love a little evening stroll. Slow and steady — every step counts!"
            notify(ctx, 2, "🐢 Evening stroll?", msg)
            p.edit().putString("nudged", today).apply()
        }
        return Result.success()
    }

    companion object {
        private const val CHANNEL = "torty_reminders"

        fun schedule(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<NudgeWorker>(1, TimeUnit.HOURS).build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("torty-nudge", ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun notify(ctx: Context, id: Int, title: String, text: String) {
            if (Build.VERSION.SDK_INT >= 33 &&
                ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
            val nm = ctx.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Walk reminders", NotificationManager.IMPORTANCE_DEFAULT))
            val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
            val n = NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_torty)
                .setContentTitle(title).setContentText(text)
                .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                .setContentIntent(open).setAutoCancel(true).build()
            try { NotificationManagerCompat.from(ctx).notify(id, n) } catch (_: SecurityException) { }
        }
    }
}
