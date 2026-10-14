/*
  EcoEngineers - Arduino UNO + HX711 + celula de carga

  Ligacao recomendada:
  HX711 VCC  -> Arduino 5V
  HX711 GND  -> Arduino GND
  HX711 DT   -> Arduino D3
  HX711 SCK  -> Arduino D2

  Instale a biblioteca "HX711" (Bogdan Necula) no Arduino IDE:
  Sketch > Include Library > Manage Libraries > procure por HX711.

  Calibracao (o jeito facil e rodar scripts/calibrar-balanca.ps1, que faz
  estes passos por voce):
  1. Balanca vazia  -> envie:  t           (zera / tara)
  2. Coloque um peso conhecido, ex: 1 kg -> envie:  k1.000
     O Arduino calcula o fator sozinho e GRAVA na memoria (EEPROM):
     depois de desligar e ligar, a calibracao continua valendo.
  3. Confira: o Serial deve mostrar ~1.000 kg.

  Comandos pela serial (57600 baud, uma linha por comando):
    t          tara (balanca vazia)
    k<kg>      calibra com um peso conhecido em kg (ex: k0.500, k1, k2.25)
    c<fator>   define o fator manualmente (ex: c-7050)
    s          mostra fator, tara e se ha calibracao salva
    r          apaga a calibracao salva (volta ao fator padrao)

  O script scripts/bridge-hx711-online.ps1 le as linhas JSON geradas aqui.
*/

#include "HX711.h"
#include <EEPROM.h>

const byte HX711_DOUT_PIN = 3;
const byte HX711_SCK_PIN = 2;

// Fator padrao, usado so enquanto nao houver calibracao salva na EEPROM.
const float DEFAULT_CALIBRATION_FACTOR = -7050.0;

// Layout da EEPROM: marcador + fator + offset da tara
const int EEPROM_ADDR_MAGIC = 0;
const int EEPROM_ADDR_FACTOR = 4;
const int EEPROM_ADDR_OFFSET = 8;
const unsigned long EEPROM_MAGIC = 0xEC0BA1A5UL;

float calibrationFactor = DEFAULT_CALIBRATION_FACTOR;
bool calibrationSaved = false;

HX711 scale;

unsigned long lastReadMs = 0;
const unsigned long READ_INTERVAL_MS = 350;

void setup() {
  Serial.begin(57600);
  scale.begin(HX711_DOUT_PIN, HX711_SCK_PIN);

  loadCalibration();
  scale.set_scale(calibrationFactor);

  delay(800);
  // Sem calibracao salva, zera ao ligar (balanca deve estar vazia).
  // Com calibracao salva, usa a tara gravada junto dela.
  if (!calibrationSaved && scale.is_ready()) {
    scale.tare(20);
  }

  Serial.print("{\"status\":\"ready\",\"device\":\"Arduino UNO HX711\",\"calibrada\":");
  Serial.print(calibrationSaved ? "true" : "false");
  Serial.print(",\"factor\":");
  Serial.print(calibrationFactor, 3);
  Serial.println("}");
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

void loadCalibration() {
  unsigned long magic;
  EEPROM.get(EEPROM_ADDR_MAGIC, magic);
  if (magic != EEPROM_MAGIC) return;

  float factor;
  long offset;
  EEPROM.get(EEPROM_ADDR_FACTOR, factor);
  EEPROM.get(EEPROM_ADDR_OFFSET, offset);
  if (isnan(factor) || factor == 0.0) return;

  calibrationFactor = factor;
  scale.set_offset(offset);
  calibrationSaved = true;
}

void saveCalibration() {
  EEPROM.put(EEPROM_ADDR_MAGIC, EEPROM_MAGIC);
  EEPROM.put(EEPROM_ADDR_FACTOR, calibrationFactor);
  EEPROM.put(EEPROM_ADDR_OFFSET, (long)scale.get_offset());
  calibrationSaved = true;
}

void printStatus(const char* status) {
  Serial.print("{\"status\":\"");
  Serial.print(status);
  Serial.print("\",\"factor\":");
  Serial.print(calibrationFactor, 3);
  Serial.print(",\"offset\":");
  Serial.print(scale.get_offset());
  Serial.print(",\"calibrada\":");
  Serial.print(calibrationSaved ? "true" : "false");
  Serial.println("}");
}

void handleSerialCommands() {
  if (!Serial.available()) return;

  String command = Serial.readStringUntil('\n');
  command.trim();
  if (command.length() == 0) return;

  char cmd = command.charAt(0);

  // Tara: balanca vazia. Se ja houver calibracao salva, grava a nova tara.
  if (cmd == 't') {
    scale.tare(20);
    if (calibrationSaved) saveCalibration();
    printStatus("tare_ok");
    return;
  }

  // Calibracao automatica com peso conhecido: k<kg>
  if (cmd == 'k') {
    float massaKg = command.substring(1).toFloat();
    if (massaKg <= 0.0) {
      Serial.println("{\"error\":\"informe o peso conhecido em kg, ex: k1.000\"}");
      return;
    }
    if (!scale.is_ready()) {
      Serial.println("{\"error\":\"hx711_not_ready\"}");
      return;
    }
    // get_value = leitura bruta - tara. O fator converte isso em kg.
    float bruto = scale.get_value(30);
    if (bruto > -100.0 && bruto < 100.0) {
      Serial.println("{\"error\":\"leitura muito baixa: o peso esta na balanca? a tara foi feita com ela vazia?\"}");
      return;
    }
    calibrationFactor = bruto / massaKg;
    scale.set_scale(calibrationFactor);
    saveCalibration();
    printStatus("calibration_ok");
    return;
  }

  // Fator manual: c<fator>
  if (cmd == 'c') {
    float factor = command.substring(1).toFloat();
    if (factor != 0.0) {
      calibrationFactor = factor;
      scale.set_scale(calibrationFactor);
      saveCalibration();
      printStatus("calibration_ok");
    }
    return;
  }

  if (cmd == 's') {
    printStatus("info");
    return;
  }

  // Apaga a calibracao salva
  if (cmd == 'r') {
    EEPROM.put(EEPROM_ADDR_MAGIC, 0UL);
    calibrationSaved = false;
    calibrationFactor = DEFAULT_CALIBRATION_FACTOR;
    scale.set_scale(calibrationFactor);
    scale.tare(20);
    printStatus("reset_ok");
  }
}
