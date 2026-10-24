import android.webkit.WebView
import android.content.Context

class MainActivity {
    fun setupWebView(wv: WebView) {
        wv.settings.javaScriptEnabled = false
        wv.loadUrl("https://example.com")
    }
    fun saveToken(ctx: Context, token: String) {
        // Use EncryptedSharedPreferences for sensitive data
        // val prefs = EncryptedSharedPreferences.create(...)
    }
}
