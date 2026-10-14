/*
  EcoEngineers — Posto de embalagem (ESP32 + Wi-Fi + MQTT)

  Placa: ESP32 DevKit
  Periféricos:
    - Célula de carga + HX711 (peso)
    - Leitor de QR Code serial (ex: GM65/GM861) no UART2 (id da caixa)
    - LED verde e LED vermelho (resultado devolvido pelo servidor)

  Fluxo:
    1. Operador coloca a caixa; o leitor lê o QR da etiqueta.
    2. Quando o peso estabiliza, o posto publica no broker MQTT:
         linha-01/posto-03/validacao  {"caixa":"<id da caixa>","peso":2.451}
    3. O servidor decide (QR + peso + imagem da câmera do posto) e publica em
         linha-01/posto-03/resultado  {"resultado":"aprovado" | "reprovado", ...}
       -> o posto acende o LED verde (aprovada) ou vermelho (retida).

  Broker: o embutido no servidor EcoEngineers (TCP 1883 na rede local) ou um
  broker externo (Mosquitto/HiveMQ) — o mesmo configurado em MQTT_BROKER_URL.
  Login no broker: usuário "hardware", senha = HARDWARE_API_KEY do backend.

  Bibliotecas: "HX711" (Bogdan Necula), "PubSubClient" (Nick O'Leary),
               "ArduinoJson" (Benoit Blanchon, v7).
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <HX711.h>

// ── Rede e broker ──
const char* WIFI_SSID     = "SUA_REDE";
const char* WIFI_PASSWORD = "SUA_SENHA";
const char* MQTT_HOST     = "192.168.0.10";   // IP do servidor EcoEngineers ou do broker
const int   MQTT_PORT     = 1883;
const char* MQTT_USER     = "hardware";
const char* MQTT_PASS     = "SUA_HARDWARE_API_KEY";

// ── Identificação do posto (forma o tópico <linha>/<posto>/...) ──
const char* LINHA = "linha-01";
const char* POSTO = "posto-03";

// ── Balança ──
#define HX711_DOUT 32
#define HX711_SCK  33
float CALIBRATION_FACTOR = -7050.0;   // ajuste com massa padrão (ver hardware/README.md)
const float PESO_MINIMO = 0.05;       // kg — abaixo disso a balança está vazia
const float VARIACAO_ESTAVEL = 0.02;  // kg — oscilação aceita para considerar estável
const int   AMOSTRAS_ESTAVEIS = 6;

// ── Leitor de QR (UART2) ──
#define QR_RX 16
#define QR_TX 17

// ── LEDs de resultado ──
#define LED_OK   12
#define LED_FAIL 13

WiFiClient wifi;
PubSubClient mqtt(wifi);
HX711 scale;

String topicoValidacao, topicoPeso, topicoResultado;
String caixaAtual = "";
bool enviadoParaEstaCaixa = false;
float janela[AMOSTRAS_ESTAVEIS];
int idxJanela = 0;
int amostras = 0;
unsigned long ultimoPesoPublicado = 0;

// Resultado da decisão do servidor -> LED do posto
void aoReceberMqtt(char* topic, byte* payload, unsigned int length) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) return;
  String caixa = doc["caixa"] | "";
  if (caixa != caixaAtual) return;              // resultado de outra caixa
  bool aprovada = String((const char*)doc["resultado"]) == "aprovado";
  digitalWrite(LED_OK, aprovada ? HIGH : LOW);
  digitalWrite(LED_FAIL, aprovada ? LOW : HIGH);
  Serial.println(aprovada ? "Caixa APROVADA" : "Caixa RETIDA — corrigir antes do despacho");
}

void conectarWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando ao Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWi-Fi conectado: " + WiFi.localIP().toString());
}

void conectarMqtt() {
  while (!mqtt.connected()) {
    conectarWifi();
    Serial.print("Conectando ao broker... ");
    String clientId = String("posto-") + LINHA + "-" + POSTO;
    if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
      Serial.println("ok");
      mqtt.subscribe(topicoResultado.c_str(), 1);
    } else {
      Serial.printf("falhou (rc=%d), nova tentativa em 3s\n", mqtt.state());
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, QR_RX, QR_TX);
  pinMode(LED_OK, OUTPUT);
  pinMode(LED_FAIL, OUTPUT);

  String base = String(LINHA) + "/" + POSTO;
  topicoValidacao = base + "/validacao";
  topicoPeso = base + "/peso";
  topicoResultado = base + "/resultado";

  scale.begin(HX711_DOUT, HX711_SCK);
  scale.set_scale(CALIBRATION_FACTOR);
  scale.tare(20);

  conectarWifi();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(aoReceberMqtt);
  mqtt.setBufferSize(512);
  Serial.printf("Posto %s pronto\n", base.c_str());
}

// Lê o código da caixa do leitor serial (uma linha por leitura)
void lerQr() {
  while (Serial2.available()) {
    String codigo = Serial2.readStringUntil('\n');
    codigo.trim();
    if (codigo.length() > 0 && codigo != caixaAtual) {
      caixaAtual = codigo;
      enviadoParaEstaCaixa = false;
      digitalWrite(LED_OK, LOW);
      digitalWrite(LED_FAIL, LOW);
      Serial.println("Caixa lida: " + caixaAtual);
    }
  }
}

// Peso estável = últimas N leituras dentro de VARIACAO_ESTAVEL
bool pesoEstavel(float kg, float& media) {
  janela[idxJanela] = kg;
  idxJanela = (idxJanela + 1) % AMOSTRAS_ESTAVEIS;
  if (amostras < AMOSTRAS_ESTAVEIS) { amostras++; return false; }
  float minimo = janela[0], maximo = janela[0], soma = 0;
  for (int i = 0; i < AMOSTRAS_ESTAVEIS; i++) {
    minimo = min(minimo, janela[i]);
    maximo = max(maximo, janela[i]);
    soma += janela[i];
  }
  media = soma / AMOSTRAS_ESTAVEIS;
  return (maximo - minimo) <= VARIACAO_ESTAVEL;
}

void publicarValidacao(float kg) {
  JsonDocument doc;
  doc["caixa"] = caixaAtual;
  doc["peso"] = serialized(String(kg, 3));
  char buffer[200];
  serializeJson(doc, buffer);
  // QoS 0 no PubSubClient; se a publicação falhar, tenta de novo na próxima leitura estável.
  if (mqtt.publish(topicoValidacao.c_str(), buffer)) {
    enviadoParaEstaCaixa = true;
    Serial.printf("Publicado %s: %s\n", topicoValidacao.c_str(), buffer);
  } else {
    Serial.println("Falha ao publicar — nova tentativa");
  }
}

void loop() {
  if (!mqtt.connected()) conectarMqtt();
  mqtt.loop();
  lerQr();
  if (!scale.is_ready()) return;

  float kg = scale.get_units(4);
  float media = 0;
  bool estavel = pesoEstavel(kg, media);

  // Leitura ao vivo para a tela do posto (no máximo 1x por segundo, só peso estável)
  if (estavel && millis() - ultimoPesoPublicado > 1000) {
    char msg[40];
    snprintf(msg, sizeof(msg), "{\"peso\":%.3f}", max(media, 0.0f));
    mqtt.publish(topicoPeso.c_str(), msg);
    ultimoPesoPublicado = millis();
  }

  if (media < PESO_MINIMO && estavel) {
    // Caixa já validada foi retirada: pronta para a próxima. (Se o QR foi
    // lido antes de a caixa ir para a balança, o código é mantido.)
    if (enviadoParaEstaCaixa) {
      caixaAtual = "";
      enviadoParaEstaCaixa = false;
    }
    return;
  }

  if (estavel && media >= PESO_MINIMO && caixaAtual.length() > 0 && !enviadoParaEstaCaixa) {
    publicarValidacao(media);
  }

  // Comando de tara pela serial (balança vazia)
  if (Serial.available() && Serial.read() == 't') scale.tare(20);
  delay(100);
}
