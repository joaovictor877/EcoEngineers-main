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
$env:HARDWARE_API_URL="https://SEU-DOMINIO.com/api/hardware/peso"
$env:HARDWARE_API_KEY="A_MESMA_CHAVE_DO_BACKEND_ONLINE"
.\scripts\bridge-hx711-online.ps1 -PortName COM3
```

Troque `COM3` pela porta real.

Deixe essa janela aberta. Quando o Arduino enviar peso pela serial, o script manda para o backend online e a tela do site recebe pelo Socket.IO.

## 3. Apresentacao

1. Abra o site online.
2. Entre em `Registrar Residuo`.
3. Rode o script da ponte no notebook.
4. Coloque peso na celula de carga.
5. O campo `Peso (kg)` deve preencher automaticamente.

Se o valor ficar negativo, inverta o sinal de `CALIBRATION_FACTOR` no `.ino`.
Se o valor ficar errado, ajuste `CALIBRATION_FACTOR` ate bater com um peso conhecido.
