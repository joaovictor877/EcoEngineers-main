/*
  EcoEngineers - Arduino UNO + HX711 + celula de carga

  Ligacao recomendada:
  HX711 VCC  -> Arduino 5V
  HX711 GND  -> Arduino GND
  HX711 DT   -> Arduino D3
  HX711 SCK  -> Arduino D2

  Instale a biblioteca "HX711" no Arduino IDE:
  Sketch > Include Library > Manage Libraries > procure por HX711.

  Calibracao rapida:
  1. Suba este sketch.
  2. Abra o Serial Monitor em 57600 baud.
  3. Sem peso na celula, envie a letra: t
  4. Coloque um peso conhecido, por exemplo 1 kg.
  5. Ajuste CALIBRATION_FACTOR ate o Serial mostrar perto de 1.00.

  O script scripts/bridge-hx711-online.ps1 le as linhas JSON geradas aqui.
*/

#include "HX711.h"

const byte HX711_DOUT_PIN = 3;
const byte HX711_SCK_PIN = 2;

// Ajuste este valor na calibracao. O sinal pode precisar ser positivo ou negativo.
float CALIBRATION_FACTOR = -7050.0;

HX711 scale;

unsigned long lastReadMs = 0;
const unsigned long READ_INTERVAL_MS = 350;

void setup() {
  Serial.begin(57600);
  scale.begin(HX711_DOUT_PIN, HX711_SCK_PIN);
  scale.set_scale(CALIBRATION_FACTOR);

  delay(800);
  if (scale.is_ready()) {
    scale.tare(20);
  }

  Serial.println("{\"status\":\"ready\",\"device\":\"Arduino UNO HX711\"}");
}

void loop() {
  handleSerialCommands();

  if (millis() - lastReadMs < READ_INTERVAL_MS) return;
  lastReadMs = millis();

  if (!scale.is_ready()) {
    Serial.println("{\"error\":\"hx711_not_ready\"}");
    return;
  }

  float kg = scale.get_units(8);
  if (kg < 0.02 && kg > -0.02) kg = 0.0;

  Serial.print("{\"peso\":");
  Serial.print(kg, 3);
  Serial.println(",\"unidade\":\"kg\",\"dispositivo\":\"Arduino UNO HX711\"}");
}

void handleSerialCommands() {
  if (!Serial.available()) return;

  String command = Serial.readStringUntil('\n');
  command.trim();

  if (command == "t") {
    scale.tare(20);
    Serial.println("{\"status\":\"tare_ok\"}");
    return;
  }

  if (command.startsWith("c")) {
    float factor = command.substring(1).toFloat();
    if (factor != 0.0) {
      CALIBRATION_FACTOR = factor;
      scale.set_scale(CALIBRATION_FACTOR);
      Serial.print("{\"status\":\"calibration_ok\",\"factor\":");
      Serial.print(CALIBRATION_FACTOR, 3);
      Serial.println("}");
    }
  }
}
