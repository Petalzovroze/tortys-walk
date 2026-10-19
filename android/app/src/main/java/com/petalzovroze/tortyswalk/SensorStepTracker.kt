package com.petalzovroze.tortyswalk

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.provider.Settings
import org.json.JSONObject
import java.time.LocalDate

/**
 * Fallback step source: the phone's hardware TYPE_STEP_COUNTER sensor.
 *
 * The sensor reports a running total of steps since the phone last booted, and the chip keeps
 * counting even when this app is closed. We only *read* it while the app is open, so we store
 * the last raw value and add the difference each time we read it. Consequences:
 *  - Steps taken while the app is closed are picked up next time it opens, but get credited to the
 *    day the app is opened (if you don't open it before midnight, they land on the next day).
 *  - If the phone reboots while the app is closed, steps between the last reading and the reboot are lost.
 *  - Counting starts the first time the app reads the sensor (it can't see steps before install).
 * Health Connect doesn't have these limits, which is why it's the preferred source.
 */
class SensorStepTracker(private val ctx: Context) : SensorEventListener {
    private val sm = ctx.getSystemService(SensorManager::class.java)
    private val sensor: Sensor? = sm?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    private val prefs = Prefs.get(ctx)
    var onChange: (() -> Unit)? = null
    private var listening = false

    val hasSensor get() = sensor != null
    val hasPermission
        get() = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            ctx.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED

    fun start() {
        if (!listening && hasSensor && hasPermission) {
            listening = sm.registerListener(this, sensor, SensorManager.SENSOR_DELAY_UI)
        }
    }

    fun stop() {
        if (listening) sm.unregisterListener(this)
        listening = false
    }

    override fun onSensorChanged(e: SensorEvent) {
        record(e.values[0].toLong())
        onChange?.invoke()
    }

    override fun onAccuracyChanged(s: Sensor?, a: Int) {}

    private fun bootCount(): Int = try {
        Settings.Global.getInt(ctx.contentResolver, Settings.Global.BOOT_COUNT, -1)
    } catch (_: Exception) { -1 }

    @Synchronized
    fun record(raw: Long) {
        val today = LocalDate.now().toString()
        val lastRaw = prefs.getLong("sensorLastRaw", -1)
        val lastBoot = prefs.getInt("sensorBoot", -2)
        val boot = bootCount()
        val delta = when {
            lastRaw < 0 -> 0L                                  // first reading ever: start from zero
            boot != lastBoot || raw < lastRaw -> raw           // phone rebooted: counter restarted at 0
            else -> raw - lastRaw
        }
        rollDay(today)
        val steps = prefs.getLong("sensorDaySteps", 0) + delta.coerceAtLeast(0)
        prefs.edit()
            .putLong("sensorLastRaw", raw)
            .putInt("sensorBoot", boot)
            .putLong("sensorDaySteps", steps)
            .apply()
    }

    /** If the stored day isn't today, archive it into history and start today at 0. */
    @Synchronized
    private fun rollDay(today: String) {
        val day = prefs.getString("sensorDay", null)
        if (day == today) return
        val hist = history()
        if (day != null) hist.put(day, prefs.getLong("sensorDaySteps", 0))
        // keep ~3 weeks
        val cutoff = LocalDate.now().minusDays(21).toString()
        hist.keys().asSequence().toList().filter { it < cutoff }.forEach { hist.remove(it) }
        prefs.edit().putString("sensorDay", today).putLong("sensorDaySteps", 0)
            .putString("sensorHistory", hist.toString()).apply()
    }

    private fun history(): JSONObject =
        try { JSONObject(prefs.getString("sensorHistory", "{}")!!) } catch (_: Exception) { JSONObject() }

    @Synchronized
    fun snapshot(): Pair<Long, Map<String, Long>> {
        val today = LocalDate.now().toString()
        rollDay(today)
        val h = history()
        val map = h.keys().asSequence().associateWith { h.getLong(it) }.toMutableMap()
        val t = prefs.getLong("sensorDaySteps", 0)
        map[today] = t
        return t to map
    }
}
