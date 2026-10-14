package br.senac.smartia.ecoengineers

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Tela principal: o painel do gestor (status das caixas, retidas, histórico)
 * carregado do servidor. Depois do login, o token é repassado ao
 * AlertService, que assina os alertas MQTT e notifica mesmo com o app fechado.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AlertService.criarCanais(this)
        pedirPermissaoDeNotificacao()

        webView = WebView(this)
        setContentView(webView)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                capturarToken()
            }
        }

        val destino = intent?.getStringExtra(EXTRA_ROTA) ?: "/tracking"
        webView.loadUrl(BuildConfig.SERVER_URL + destino)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_ROTA)?.let { webView.loadUrl(BuildConfig.SERVER_URL + it) }
    }

    // O site guarda o JWT no localStorage; o serviço usa o mesmo token como senha no broker.
    private fun capturarToken() {
        webView.evaluateJavascript("localStorage.getItem('token')") { valor ->
            val token = valor?.trim('"')?.takeIf { it.isNotEmpty() && it != "null" }
            val prefs = getSharedPreferences(AlertService.PREFS, MODE_PRIVATE)
            if (token != null && token != prefs.getString(AlertService.KEY_TOKEN, null)) {
                prefs.edit().putString(AlertService.KEY_TOKEN, token).apply()
                AlertService.iniciar(this)
            }
        }
    }

    private fun pedirPermissaoDeNotificacao() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    companion object {
        const val EXTRA_ROTA = "rota"
    }
}
