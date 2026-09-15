# Hardware de peso - Arduino UNO + HX711

Este projeto ja possui o endpoint online para receber peso:

```text
POST /api/hardware/peso
Header: x-api-key: <HARDWARE_API_KEY>
Body: { "peso": 1.23, "dispositivo": "Arduino UNO HX711" }
```

Como o Arduino UNO nao tem internet, use este fluxo:

```text
Celula de carga -> HX711 -> Arduino UNO -> USB do notebook -> bridge PowerShell -> site online
```

## 1. Subir o sketch no Arduino

Abra no Arduino IDE:

```text
hardware/arduino_hx711_weight/arduino_hx711_weight.ino
```

Instale a biblioteca `HX711` pelo Library Manager.

Ligacao usada no sketch:

```text
HX711 VCC -> Arduino 5V
HX711 GND -> Arduino GND
HX711 DT  -> Arduino D3
HX711 SCK -> Arduino D2
```

Abra o Serial Monitor em `57600 baud`.

Para zerar a balanca, envie:

```text
t
```

## 2. Rodar a ponte para o site online

Descubra a porta COM do Arduino no Arduino IDE em `Tools > Port`.

No PowerShell, rode:

```powershell
$env:HARDWARE_API_URL="https://ecoengineers.azurewebsites.net/api/hardware/peso"
$env:HARDWARE_API_KEY="eco-hw-key-2026"
.\scripts\bridge-hx711-online.ps1 -PortName COM18
```

Troque `COM18` pela porta real.

Deixe essa janela aberta. Quando o Arduino enviar peso pela serial, o script manda para o backend online e a tela do site recebe pelo Socket.IO.

Por padrao, a ponte so envia o peso quando a leitura fica estavel em uma janela de 8 amostras, com variacao maxima de `0.05 kg`.
Para deixar mais firme, use um range menor:

```powershell
.\scripts\bridge-hx711-online.ps1 -PortName COM18 -StableRangeKg 0.03 -StableWindow 10
```

Para responder mais rapido, use uma janela menor:

```powershell
.\scripts\bridge-hx711-online.ps1 -PortName COM18 -StableRangeKg 0.06 -StableWindow 5
```

## 3. Apresentacao

1. Abra o site online.
2. Entre em `Registrar Residuo`.
3. Rode o script da ponte no notebook.
4. Coloque peso na celula de carga.
5. O campo `Peso (kg)` deve preencher automaticamente.

Se o valor ficar negativo, inverta o sinal de `CALIBRATION_FACTOR` no `.ino`.
Tambem da para inverter sem reenviar o sketch usando `-InvertSign`:

```powershell
.\scripts\bridge-hx711-online.ps1 -PortName COM18 -StableRangeKg 0.03 -StableWindow 10 -InvertSign
```

Para zerar a balanca pelo script, deixe ela vazia e use:

```powershell
.\scripts\bridge-hx711-online.ps1 -PortName COM18 -TareOnStart
```

Se o valor ficar errado, ajuste `CALIBRATION_FACTOR` ate bater com um peso conhecido.

## 4. Quando o modulo LoRa + gateway chegar

O mapa mental do posto de validacao prevê `Balanca/Camera -> Microcontrolador -> Modulo LoRa
-> Gateway -> Broker MQTT -> Backend`. Esse caminho ainda depende de hardware fisico que o
projeto nao tem em maos hoje, entao o fluxo atual (Wi-Fi HTTP direto do ESP32, ou Arduino UNO
via USB + `bridge-hx711-online.ps1`) continua sendo o caminho valido para testes e demonstracao.

Quando o gateway LoRa estiver disponivel, o backend ja tem um adaptador pronto em
`services/mqttService.js`: basta configurar a variavel de ambiente `MQTT_BROKER_URL` (e
`MQTT_USERNAME`/`MQTT_PASSWORD` se o broker exigir) e o gateway passar a publicar nos topicos:

```text
postos/<posto_id>/peso       -> { "peso": 2.45, "dispositivo": "Posto 01" }
postos/<posto_id>/validacao  -> payload livre
```

Sem essa variavel definida, o adaptador MQTT fica desativado e nao muda nada do
comportamento atual.
