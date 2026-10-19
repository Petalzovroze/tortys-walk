# Torty's Walk — Android app

The Android version of the Torty's Walk web game. The game itself (HTML/CSS/JS from the repo root) is
bundled inside the APK in `app/src/main/assets/web/` and shown in a WebView served from a local
`https://appassets.androidplatform.net` origin, so it works offline. The app has **no INTERNET permission**.

## Where the steps come from
1. **Health Connect (preferred).** Reads today's total and the last 7 days with `READ_STEPS`, using
   Health Connect's aggregate API, which merges and de-duplicates the phone plus any watch or fitness app
   that syncs to it (Wear OS, Fitbit, Samsung Health, etc.). This matches the phone's own count.
   - Android 14+: built in. Android 9–13: the "Health Connect" app from Google Play (the app offers a
     "Get Health Connect" button that opens the Play Store).
   - The privacy/rationale screen (`PrivacyPolicyActivity`) is registered for both
     `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` (≤13) and the Android 14
     `VIEW_PERMISSION_USAGE` / `HEALTH_PERMISSIONS` activity-alias.
2. **Fallback: hardware step counter** (`TYPE_STEP_COUNTER`, `ACTIVITY_RECOGNITION` permission) when Health
   Connect is unavailable or declined. The sensor chip counts steps since boot even while the app is closed;
   the app stores the last raw value and adds the difference whenever it reads the sensor (live while open).
   No foreground service is used, so: steps taken while the app is closed show up the next time it's opened
   but are credited to the day it's opened; steps between the last reading and a reboot are lost; counting
   starts at install.

Steps refresh when the app opens/resumes and every 60 s while it's on screen (live while walking in
sensor mode). The game turns the absolute totals into milestones (2,500 / 5,000 / 7,500 / 10,000 at the
default 10,000 goal), levels, unlocks and streaks. Browser motion counting and demo mode are hidden in the
app; Settings has a "Preview a celebration" button instead.

A WorkManager job runs about hourly: one "goal reached" notification per day (only if Health Connect allows
background reads, Android 14+ with a recent Health Connect) and one gentle 6–9 PM nudge if the goal isn't met.

## Build
Requires JDK 17 and the Android SDK (platform 36, build-tools 36).
```bash
./sync-web.sh            # copy the web game from the repo root into assets
./gradlew assembleRelease
```
Release signing reads `keystore.properties` (not committed):
```
storeFile=/path/to/torty-release.jks
storePassword=...
keyAlias=torty
keyPassword=...
```
Without it, use `./gradlew assembleDebug`.

Package: `com.petalzovroze.tortyswalk` · minSdk 26 · targetSdk 35 · compileSdk 36.
