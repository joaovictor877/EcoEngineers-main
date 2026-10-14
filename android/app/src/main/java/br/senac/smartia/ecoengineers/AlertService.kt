package br.senac.smartia.ecoengineers

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken
import org.eclipse.paho.client.mqttv3.MqttCallbackExtended
import org.eclipse.paho.client.mqttv3.MqttClient
import org.eclipse.paho.client.mqttv3.MqttConnectOptions
import org.eclipse.paho.client.mqttv3.MqttException
import org.eclipse.paho.client.mqttv3.MqttMessage
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * Assinante MQTT do app: conecta ao broker do servidor (wss://.../mqtt) com o
 * token do login e assina alertas/# — cada caixa reprovada em qualquer
 * linha/posto vira uma notificação no celular do gestor, na hora.
 */
class AlertService : Service() {

    private var client: MqttClient? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notificacao = NotificationCompat.Builder(this, CANAL_SERVICO)
            .setSmallIcon(R.drawable.ic_app)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("Monitorando os postos de embalagem")
            .setOngoing(true)
            .build()
        val tipo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
            ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING else 0
        ServiceCompat.startForeground(this, ID_SERVICO, notificacao, tipo)

        thread(name = "mqtt-conexao") { conectar() }
        return START_STICKY
    }

    private fun conectar() {
        val token = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_TOKEN, null) ?: run {
            stopSelf()
            return
        }
        try {
            client?.let { if (it.isConnected) it.disconnect() }
            val mqtt = MqttClient(BuildConfig.MQTT_URL, "android-" + System.currentTimeMillis(), MemoryPersistence())
            mqtt.setCallback(object : MqttCallbackExtended {
                override fun connectComplete(reconnect: Boolean, serverURI: String) {
                    // Reassina após reconexão automática (rede do celular oscilou).
                    // Fora da thread do callback: o Paho não permite chamada bloqueante aqui.
                    if (reconnect) thread { runCatching { mqtt.subscribe("alertas/#", 1) } }
                }
                override fun connectionLost(cause: Throwable?) {
                    Log.w(TAG, "Conexão MQTT perdida: ${cause?.message}")
                }
                override fun messageArrived(topic: String, message: MqttMessage) {
                    notificarReprovacao(topic, String(message.payload))
                }
                override fun deliveryComplete(token: IMqttDeliveryToken?) {}
            })
            val opcoes = MqttConnectOptions().apply {
                userName = "android"
                password = token.toCharArray()
                isAutomaticReconnect = true
                isCleanSession = true
                keepAliveInterval = 30
            }
            mqtt.connect(opcoes)
            mqtt.subscribe("alertas/#", 1)
            client = mqtt
        } catch (e: MqttException) {
            // Código 4/5 = token expirado ou inválido: espera o próximo login no app.
            Log.e(TAG, "Falha ao conectar no broker: ${e.reasonCode} ${e.message}")
            if (e.reasonCode == MqttException.REASON_CODE_FAILED_AUTHENTICATION.toInt() ||
                e.reasonCode == MqttException.REASON_CODE_NOT_AUTHORIZED.toInt()
            ) {
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(KEY_TOKEN).apply()
                stopSelf()
            }
        }
    }

    // Payload: {"id":12,"caixa":"ECO-QR-...","produto":"Kit A","resultado":"reprovado","motivo":"...","peso":3.2}
    private fun notificarReprovacao(topic: String, payload: String) {
        val json = runCatching { JSONObject(payload) }.getOrNull() ?: return
        val local = topic.removePrefix("alertas/")            // linha-01/posto-03
        val caixa = json.optString("caixa").ifEmpty { "#" + json.optInt("id") }
        val motivo = json.optString("motivo").ifEmpty { "Item, peso e QR Code divergem." }

        val abrir = PendingIntent.getActivity(
            this, json.optInt("id"),
            Intent(this, MainActivity::class.java)
                .putExtra(MainActivity.EXTRA_ROTA, "/tracking")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notificacao = NotificationCompat.Builder(this, CANAL_ALERTAS)
            .setSmallIcon(R.drawable.ic_app)
            .setContentTitle("Caixa $caixa reprovada · $local")
            .setContentText(motivo)
            .setStyle(NotificationCompat.BigTextStyle().bigText("${json.optString("produto")}\n$motivo\nCaixa retida — corrigir antes do despacho."))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(abrir)
            .build()
        runCatching { NotificationManagerCompat.from(this).notify(json.optInt("id"), notificacao) }
    }

    override fun onDestroy() {
        runCatching { client?.disconnect() }
        super.onDestroy()
    }

    companion object {
        private const val TAG = "AlertService"
        const val PREFS = "ecoengineers"
        const val KEY_TOKEN = "token"
        private const val CANAL_ALERTAS = "alertas"
        private const val CANAL_SERVICO = "servico"
        private const val ID_SERVICO = 1

        fun criarCanais(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CANAL_ALERTAS, context.getString(R.string.canal_alertas), NotificationManager.IMPORTANCE_HIGH)
            )
            nm.createNotificationChannel(
                NotificationChannel(CANAL_SERVICO, context.getString(R.string.canal_servico), NotificationManager.IMPORTANCE_MIN)
            )
        }

        fun iniciar(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, AlertService::class.java))
        }
    }
}
