package com.petalzovroze.tortyswalk

import android.content.Context
import android.content.SharedPreferences
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.Period

object Prefs {
    fun get(c: Context): SharedPreferences = c.getSharedPreferences("torty", Context.MODE_PRIVATE)
}

const val HC_PROVIDER = "com.google.android.apps.healthdata"
val READ_STEPS: String = HealthPermission.getReadPermission(StepsRecord::class)

data class UiAction(val id: String, val label: String, val primary: Boolean = false)

data class Snapshot(
    val source: String,          // health_connect | sensor | none
    val state: String,           // ok | fallback | needs_setup
    val title: String,
    val message: String,
    val actions: List<UiAction>,
    val today: Long,
    val history: Map<String, Long>,
) {
    fun toJson(): String = JSONObject().apply {
        put("source", source); put("state", state); put("title", title); put("message", message)
        put("today", today); put("date", LocalDate.now().toString())
        put("history", JSONObject(history.mapValues { it.value }))
        put("actions", JSONArray(actions.map { JSONObject().put("id", it.id).put("label", it.label).put("primary", it.primary) }))
        put("syncedAt", System.currentTimeMillis())
    }.toString()
}

class StepRepository(private val ctx: Context, val tracker: SensorStepTracker) {
    private val prefs = Prefs.get(ctx)

    fun sdkStatus(): Int = HealthConnectClient.getSdkStatus(ctx, HC_PROVIDER)

    fun client(): HealthConnectClient? =
        if (sdkStatus() == HealthConnectClient.SDK_AVAILABLE) HealthConnectClient.getOrCreate(ctx) else null

    /** Permissions to request: steps, plus background reads if this Health Connect version supports them. */
    fun permissionsToRequest(client: HealthConnectClient): Set<String> = buildSet {
        add(READ_STEPS)
        if (supportsBackground(client)) add(HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND)
    }

    fun supportsBackground(client: HealthConnectClient): Boolean = try {
        client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) ==
            HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
    } catch (_: Throwable) { false }

    suspend fun readToday(client: HealthConnectClient): Long {
        val r = client.aggregate(
            AggregateRequest(setOf(StepsRecord.COUNT_TOTAL),
                TimeRangeFilter.between(LocalDate.now().atStartOfDay(), LocalDateTime.now()))
        )
        return r[StepsRecord.COUNT_TOTAL] ?: 0L
    }

    /** Today + the previous 6 days, one bucket per local calendar day. Health Connect de-duplicates phone + watch. */
    suspend fun readWeek(client: HealthConnectClient): Map<String, Long> {
        val today = LocalDate.now()
        val rows = client.aggregateGroupByPeriod(
            AggregateGroupByPeriodRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(today.minusDays(6).atStartOfDay(), LocalDateTime.now()),
                timeRangeSlicer = Period.ofDays(1),
            )
        )
        val map = mutableMapOf<String, Long>()
        for (d in 0..6) map[today.minusDays(d.toLong()).toString()] = 0L
        rows.forEach { map[it.startTime.toLocalDate().toString()] = it.result[StepsRecord.COUNT_TOTAL] ?: 0L }
        return map
    }

    private fun cache(today: Long) {
        prefs.edit().putString("cacheDate", LocalDate.now().toString()).putLong("cacheSteps", today).apply()
    }

    suspend fun load(): Snapshot {
        val sdk = sdkStatus()
        val preferSensor = prefs.getBoolean("preferSensor", false)
        val actions = mutableListOf<UiAction>()
        var note: String

        when (sdk) {
            HealthConnectClient.SDK_AVAILABLE -> {
                val client = HealthConnectClient.getOrCreate(ctx)
                val granted = try { client.permissionController.getGrantedPermissions() } catch (_: Exception) { emptySet() }
                if (READ_STEPS in granted && !preferSensor) {
                    try {
                        val week = readWeek(client)
                        val today = week[LocalDate.now().toString()] ?: 0L
                        cache(today)
                        return Snapshot("health_connect", "ok", "Synced with Health Connect ✅",
                            "Same count as your phone's health app, plus any watch or fitness app that syncs to Health Connect.",
                            listOf(UiAction("open_hc", "Health Connect settings")), today, week)
                    } catch (e: Exception) {
                        note = "Couldn't read Health Connect just now (${e.javaClass.simpleName})."
                        actions += UiAction("open_hc", "Open Health Connect", true)
                    }
                } else if (READ_STEPS in granted) {
                    note = "You switched to the phone's step sensor."
                    actions += UiAction("use_hc", "Use Health Connect again", true)
                } else {
                    note = "Connect Health Connect so Torty sees the same steps as your phone and watch."
                    actions += UiAction("connect_hc", "Connect Health Connect", true)
                }
            }
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                note = "Install or update the free Health Connect app from Google Play to match your phone's own step count."
                actions += UiAction("install_hc", "Get Health Connect", true)
                actions += UiAction("refresh", "I installed it")
            }
            else -> note = "Health Connect isn't available on this phone (it needs Android 9 or newer)."
        }

        if (tracker.hasSensor && tracker.hasPermission) {
            val (t, h) = tracker.snapshot()
            cache(t)
            return Snapshot("sensor", "fallback", "Counting with the phone's step sensor",
                "$note Torty only sees steps since you first opened the app, so this may differ a bit from your phone's health app.",
                actions, t, h)
        }
        if (tracker.hasSensor) actions += UiAction("sensor_perm", "Use phone step sensor", actions.none { it.primary })
        else note += " This phone doesn't have a step sensor either."
        return Snapshot("none", "needs_setup", "Let's connect your steps 🐢", note, actions, 0, emptyMap())
    }
}
