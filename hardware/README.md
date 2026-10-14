# Hardware de peso - Arduino UNO + HX711

Fluxo da balanca ate o site:

```text
Celula de carga -> HX711 -> Arduino UNO -> USB do notebook -> iniciar-balanca.bat -> site online
```

## Passo a passo rapido

| Passo | O que fazer | Quando |
|---|---|---|
| 1 | Montar e gravar o sketch no Arduino | uma vez |
| 2 | Clicar duas vezes em `scripts\calibrar-balanca.bat` | uma vez (e quando trocar/mexer na balanca) |
| 3 | Clicar duas vezes em `scripts\iniciar-balanca.bat` | sempre que for usar |

### 1. Montar e gravar o sketch (uma vez)

Ligacao:

```text
HX711 VCC -> Arduino 5V
HX711 GND -> Arduino GND
HX711 DT  -> Arduino D3
HX711 SCK -> Arduino D2

Celula de carga -> HX711:  vermelho E+ | preto E- | branco A- | verde A+
```

1. Arduino IDE > **Sketch > Include Library > Manage Libraries** > instale **HX711** (Bogdan Necula).
2. Abra `hardware/arduino_hx711_weight/arduino_hx711_weight.ino`.
3. **Tools > Board > Arduino Uno** e **Tools > Port** > a porta do Arduino.
4. Clique em **Upload** (seta). Feche o Arduino IDE depois (ele prende a porta COM).

### 2. Calibrar (uma vez)

Separe um objeto de **peso conhecido** (pacote de 1 kg de arroz/acucar, peso de academia,
garrafa de 1,5 L de agua ~ 1,5 kg). Quanto mais pesado (dentro do limite da celula), melhor.

Clique duas vezes em **`scripts\calibrar-balanca.bat`** e siga as perguntas:

1. Na primeira vez ele pede o **endereco do site**, a **chave do hardware** (`HARDWARE_API_KEY`
   do servidor) e o **numero do posto**. Fica salvo em `scripts/balanca.config.json`.
2. Balanca vazia -> ENTER (zera).
3. Digita o peso do objeto em kg (ex: `1` ou `0,5`).
4. Coloca o objeto no centro -> ENTER. O Arduino calcula o fator **sozinho** e grava na memoria.
5. O script confere a leitura e mostra o erro. Ate **1%** esta aprovado; acima disso ele oferece repetir.
6. Tira o objeto -> confere se volta a 0.
7. Registra a calibracao no sistema: o **Posto de Validacao** passa a mostrar "Balanca calibrada".

A calibracao fica salva no Arduino mesmo desligando. So refaca se mexer na celula de carga,
trocar o Arduino, ou se o sistema avisar que a calibracao venceu (padrao: 7 dias,
`CALIBRACAO_VALIDADE_DIAS`).

### 3. Ligar a balanca no sistema (sempre que for usar)

Clique duas vezes em **`scripts\iniciar-balanca.bat`** e deixe a janela aberta (pode minimizar).

- Ele acha o Arduino sozinho (nao precisa saber a porta COM).
- So envia o peso quando a leitura **estabiliza** (8 leituras com variacao de ate 0,05 kg).
- Se o cabo USB soltar ou a internet cair, ele **reconecta sozinho**.
- No site, abra **Posto de Validacao**: o card "Balanca" fica ativo e o peso aparece sozinho.

Para abrir automaticamente quando o Windows ligar (rode uma vez num PowerShell, na pasta do projeto):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\iniciar-balanca.ps1 -InstalarInicializacao
```

(Para desfazer: `-RemoverInicializacao`. Para trocar endereco/chave/posto: `-Reconfigurar`.)

### Problemas comuns

| Sintoma | Causa provavel | O que fazer |
|---|---|---|
| "Arduino nao encontrado" | cabo so de carga / driver CH340 | troque o cabo; em clones instale o driver CH340 |
| "Nao consegui abrir COMx" | outro programa usando a porta | feche o Arduino IDE (Serial Monitor) e o iniciar-balanca |
| `hx711_not_ready` | fio DT/SCK trocado ou solto | confira D3 (DT) e D2 (SCK) e o 5V/GND |
| Peso negativo | fios A+/A- invertidos | inverta branco e verde no HX711, ou rode a calibracao de novo |
| Peso "anda" sozinho | celula solta ou mesa balancando | aperte os parafusos da celula, apoie em superficie firme |
| Erro de calibracao alto | objeto fora do centro | centralize o objeto e repita |
| Site nao recebe (401) | chave errada | rode com `-Reconfigurar` e confira `HARDWARE_API_KEY` no servidor |

### Comandos manuais (Serial Monitor, 57600 baud)

`t` zera · `k1.000` calibra com 1 kg · `c-7050` define o fator na mao · `s` mostra fator e tara · `r` apaga a calibracao.

A ponte antiga continua funcionando se quiser passar a porta e a chave na mao:

```powershell
.\scripts\bridge-hx711-online.ps1 -PortName COM18 -ApiUrl https://ecoengineers.azurewebsites.net/api/hardware/peso -ApiKey SUA_CHAVE
```

## 4. Posto conectado por Wi-Fi + MQTT (arquitetura da pre-banca)

```text
Posto (HX711 + leitor de QR + ESP32) --Wi-Fi/MQTT--> Broker --> Servidor --> App/site
```

- `posto_wifi_mqtt/posto_wifi_mqtt.ino` — le o QR da caixa e o peso estavel e publica em
  `linha-01/posto-03/validacao` `{"caixa":"<caixa>","peso":2.451}`. Assina
  `linha-01/posto-03/resultado` e acende LED verde (aprovada) ou vermelho (retida).

O broker MQTT ja vem embutido no servidor (sem `MQTT_BROKER_URL`): TCP na porta `MQTT_PORT`
(padrao 1883, rede local) e WebSocket em `wss://<servidor>/mqtt` (funciona no Azure).
Login do posto no broker: usuario `hardware`, senha = `HARDWARE_API_KEY`.
Com o servidor no Azure, a porta 1883 nao fica exposta: use um broker externo
(`MQTT_BROKER_URL`) ou um servidor na rede local para o ESP32 publicar.

| Topico | Quem publica | Conteudo |
|---|---|---|
| `<linha>/<posto>/validacao` | posto | `{ "caixa": "...", "peso": 2.45 }` -> servidor valida e grava |
| `<linha>/<posto>/peso` | posto | `{ "peso": 2.45 }` -> leitura ao vivo na tela |
| `<linha>/<posto>/resultado` | servidor | resultado de toda validacao |
| `alertas/<linha>/<posto>` | servidor | so reprovacoes (o app Android assina) |

A linha e o codigo do posto sao cadastrados em **Cadastros > Postos e Linhas**. Se o posto tiver
camera vinculada, o servidor captura a imagem dela quando a validacao chega por MQTT.

Sem a placa, simule o posto:

```powershell
node scripts/simular-posto-mqtt.js --url wss://ecoengineers.azurewebsites.net/mqtt --key SUA_HARDWARE_API_KEY --linha linha-01 --posto posto-01
```

O caminho por HTTP/USB (secoes 1 a 3) continua valido para testes.

## 5. Camera Intelbras Mibo (RTSP) quando o servidor esta na nuvem (Azure/VPS)

O servidor no Azure nao esta na mesma rede da sua camera Mibo (que fica no seu Wi-Fi
local), entao ele nao consegue acessar o IP local dela diretamente. A solucao e a mesma
usada para o sensor de peso: uma ponte local.

```text
Camera Mibo (RTSP) -> notebook na mesma rede -> bridge-camera-online.ps1 -> servidor online -> Socket.IO -> tela do site
```

1. Cadastre a camera no site (menu **Cameras** > **Nova Camera** > RTSP > modo "Rede
   diferente do servidor"). Ao salvar, o site mostra o comando pronto pra copiar.
2. Cole o comando num PowerShell aberto num PC/notebook que esteja na mesma rede da
   camera, trocando `SUA_HARDWARE_API_KEY` pela mesma chave configurada no backend
   (`HARDWARE_API_KEY`). Exemplo:

```powershell
.\scripts\bridge-camera-online.ps1 -RtspUrl "rtsp://admin:CHAVE@192.168.1.50:554/cam/realmonitor?channel=1&subtype=0" -CameraId 3 -ApiUrl "https://ecoengineers.azurewebsites.net" -ApiKey "eco-hw-key-2026"
```

3. Deixe a janela aberta. O script tira uma foto a cada poucos segundos (`-IntervalSeconds`,
   padrao 2s) e manda pro servidor, que repassa em tempo real pra tela do site.
4. Se a camera estiver na **mesma rede do servidor** (ex: testando local, ou uma VPS na
   mesma rede), escolha o modo "Mesma rede do servidor" ao cadastrar — nesse caso o
   proprio backend acessa o RTSP direto, sem precisar da ponte.
