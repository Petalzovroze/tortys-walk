package com.petalzovroze.tortyswalk

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.webkit.WebViewAssetLoader
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var tracker: SensorStepTracker
    private lateinit var repo: StepRepository
    private val refreshLock = Mutex()
    private var pageReady = false
    private var lastSensorPush = 0L

    private val hcPermissionLauncher =
        registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
            if (READ_STEPS in granted) Prefs.get(this).edit().putBoolean("preferSensor", false).apply()
            else if (tracker.hasSensor && !tracker.hasPermission) askSensorPermission()
            refresh(); askNotificationsOnce()
        }

    private val sensorPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { _ ->
            tracker.start(); refresh(); askNotificationsOnce()
        }

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tracker = SensorStepTracker(this)
        repo = StepRepository(this, tracker)
        tracker.onChange = {
            val now = System.currentTimeMillis()
            if (now - lastSensorPush > 1500) { lastSensorPush = now; refresh() }
        }

        WindowCompat.setDecorFitsSystemWindows(window, false)
        val root = FrameLayout(this).apply { setBackgroundColor(0xFFFDF6EC.toInt()) }
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = true; isAppearanceLightNavigationBars = true
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            v.setPadding(b.left, b.top, b.right, b.bottom); WindowInsetsCompat.CONSUMED
        }

        // The game is bundled in assets/web and served from a local https origin (no internet needed).
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true      // game progress lives in localStorage
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mediaPlaybackRequiresUserGesture = true
            setBackgroundColor(0xFFFDF6EC.toInt())
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    loader.shouldInterceptRequest(request.url)
                // If the WebView renderer dies (low memory etc.), rebuild the screen instead of crashing.
                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    pageReady = false
                    (view.parent as? android.view.ViewGroup)?.removeView(view)
                    view.destroy()
                    recreate()
                    return true
                }
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.host == "appassets.androidplatform.net") return false
                    try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) {}
                    return true
                }
            }
            addJavascriptInterface(Bridge(), "TortyAndroid")
        }
        root.addView(web, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        setContentView(root)
        web.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")

        NudgeWorker.schedule(this)

        // Refresh on open/resume and every 60s while the app is on screen.
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.RESUMED) {
                tracker.start()
                try {
                    while (true) { refresh(); delay(60_000) }
                } finally { tracker.stop() }
            }
        }
    }

    fun refresh() {
        lifecycleScope.launch {
            refreshLock.withLock {
                val snap = try { repo.load() } catch (e: Exception) {
                    Snapshot("none", "needs_setup", "Hmm, something went wrong", e.toString(), listOf(UiAction("refresh", "Try again", true)), 0, emptyMap())
                }
                if (pageReady) web.evaluateJavascript("window.tortyNative && window.tortyNative.onSteps(${snap.toJson()})", null)
            }
        }
    }

    /** First launch: walk the user straight into the best available step source, once. */
    private fun firstRunSetup() {
        val p = Prefs.get(this)
        if (p.getBoolean("didFirstRun", false)) return
        p.edit().putBoolean("didFirstRun", true).apply()
        lifecycleScope.launch {
            val client = repo.client()
            if (client != null) {
                val granted = try { client.permissionController.getGrantedPermissions() } catch (_: Exception) { emptySet() }
                if (READ_STEPS !in granted) { requestHealthConnect(); return@launch }
            } else if (repo.sdkStatus() != HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED &&
                tracker.hasSensor && !tracker.hasPermission) {
                askSensorPermission(); return@launch
            }
            askNotificationsOnce()
        }
    }

    private fun requestHealthConnect() {
        val client = repo.client() ?: return refresh()
        try { hcPermissionLauncher.launch(repo.permissionsToRequest(client)) }
        catch (_: Exception) { openHealthConnectSettings() }
    }

    private fun askSensorPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (tracker.hasPermission) { tracker.start(); refresh(); return }
            if (!shouldShowRequestPermissionRationale(Manifest.permission.ACTIVITY_RECOGNITION) &&
                Prefs.get(this).getBoolean("askedSensor", false)) {
                openAppSettings(); return       // permanently denied: send to app settings
            }
            Prefs.get(this).edit().putBoolean("askedSensor", true).apply()
            sensorPermissionLauncher.launch(Manifest.permission.ACTIVITY_RECOGNITION)
        } else { tracker.start(); refresh() }
    }

    private fun askNotificationsOnce() {
        val p = Prefs.get(this)
        if (Build.VERSION.SDK_INT >= 33 && !p.getBoolean("askedNotif", false)) {
            p.edit().putBoolean("askedNotif", true).apply()
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun openHealthConnectSettings() {
        val intent = if (Build.VERSION.SDK_INT >= 34) Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS")
            .putExtra(Intent.EXTRA_PACKAGE_NAME, packageName)
        else Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
        try { startActivity(intent) } catch (_: ActivityNotFoundException) {
            try { startActivity(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)) } catch (_: Exception) { installHealthConnect() }
        }
    }

    private fun installHealthConnect() {
        val market = Uri.parse("market://details?id=$HC_PROVIDER&url=healthconnect%3A%2F%2Fonboarding")
        try { startActivity(Intent(Intent.ACTION_VIEW, market).setPackage("com.android.vending")) }
        catch (_: Exception) {
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$HC_PROVIDER"))) } catch (_: Exception) {}
        }
    }

    private fun openAppSettings() {
        try { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) } catch (_: Exception) {}
    }

    /** Called from the game's JavaScript. Methods run on a binder thread, so hop to the main thread. */
    inner class Bridge {
        @JavascriptInterface fun ready() = runOnUiThread { pageReady = true; refresh(); firstRunSetup() }

        @JavascriptInterface fun action(id: String) = runOnUiThread {
            val p = Prefs.get(this@MainActivity)
            when (id) {
                "connect_hc" -> requestHealthConnect()
                "use_hc" -> { p.edit().putBoolean("preferSensor", false).apply(); refresh() }
                "open_hc" -> openHealthConnectSettings()
                "install_hc" -> installHealthConnect()
                "sensor_perm" -> { p.edit().putBoolean("preferSensor", true).apply(); askSensorPermission() }
                "privacy" -> startActivity(Intent(this@MainActivity, PrivacyPolicyActivity::class.java))
                "notify" -> if (Build.VERSION.SDK_INT >= 33) notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                else -> refresh()
            }
        }

        @JavascriptInterface fun setGoal(goal: Int) {
            Prefs.get(this@MainActivity).edit().putInt("goal", goal.coerceIn(1000, 50000)).apply()
        }

        /** The game already celebrated today's goal on screen, so the reminder job won't repeat it. */
        @JavascriptInterface fun goalReached() {
            Prefs.get(this@MainActivity).edit().putString("goalNotified", LocalDate.now().toString()).apply()
        }

        @JavascriptInterface fun version(): String = "1.0.0"
    }
}
