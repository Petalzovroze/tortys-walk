package com.petalzovroze.tortyswalk

import android.os.Bundle
import android.text.Html
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/** Shown by Health Connect ("why does this app need access?") and from the game's settings. */
class PrivacyPolicyActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (20 * resources.displayMetrics.density).toInt()
        val text = TextView(this).apply {
            setPadding(pad, pad, pad, pad)
            textSize = 16f
            setTextColor(0xFF4A3B35.toInt())
            setLineSpacing(0f, 1.25f)
            text = Html.fromHtml(POLICY, Html.FROM_HTML_MODE_COMPACT)
        }
        val scroll = ScrollView(this).apply { setBackgroundColor(0xFFFDF6EC.toInt()); addView(text) }
        ViewCompat.setOnApplyWindowInsetsListener(scroll) { v, i ->
            val b = i.getInsets(WindowInsetsCompat.Type.systemBars()); v.setPadding(b.left, b.top, b.right, b.bottom); i
        }
        setContentView(scroll)
    }

    companion object {
        const val POLICY = """
<h2>🐢 Torty's Walk — Privacy</h2>
<p><b>What we read:</b> your step counts only — today's total and the last 7 days — from Health Connect,
or from your phone's built-in step sensor if you choose that instead.</p>
<p><b>Why:</b> to fill Torty's progress ring, celebrate your milestones, level Torty up, unlock rewards,
and (if you allow notifications) send a gentle goal or evening-stroll reminder.</p>
<p><b>Where it goes:</b> nowhere. Your steps and game progress stay on this phone. The app has no internet
permission, no accounts, no ads and no analytics, and it never writes or changes any health data.</p>
<p><b>Background access:</b> if you allow it, Torty's hourly reminder may check today's step total while the app
is closed, only to decide whether to send a reminder.</p>
<p><b>Your control:</b> you can remove access any time in Health Connect (Settings › Apps › Torty's Walk)
or Android Settings › Apps › Torty's Walk › Permissions. Uninstalling the app deletes all of its data.</p>
<p>Slow and steady — thanks for walking with Torty! 💚</p>
"""
    }
}
