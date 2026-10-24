import android.webkit.WebView
import android.content.Context
import android.util.Log

class MainActivity {
    fun setupWebView(wv: WebView) {
        wv.settings.javaScriptEnabled = true
        wv.loadUrl("http://example.com")
        Log.d("DEBUG", "WebView loaded")
    }
    fun saveToken(ctx: Context, token: String) {
        val prefs = ctx.getSharedPreferences("app", Context.MODE_PRIVATE)
        prefs.edit().putString("token", token).apply()
    }
}
