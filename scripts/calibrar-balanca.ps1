# Calibracao guiada da balanca (Arduino UNO + HX711).
#
# Uso: clique duas vezes em scripts\calibrar-balanca.bat
#   ou: powershell -ExecutionPolicy Bypass -File scripts\calibrar-balanca.ps1 [-PortName COM5]
#
# Precisa do sketch hardware/arduino_hx711_weight gravado no Arduino.
# Feche o iniciar-balanca antes: a porta COM so pode ser usada por um programa.

param(
  [string]$PortName,
  [switch]$Reconfigurar,
  [switch]$NaoRegistrar
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\balanca-comum.ps1"
Add-Type -AssemblyName System.IO.Ports

function Passo([int]$n, [string]$texto) {
  Write-Host ""
  Write-Host "PASSO $n - $texto" -ForegroundColor Yellow
}

# Le linhas JSON do Arduino ate encontrar uma que satisfaca o filtro
function Wait-Arduino($serial, [scriptblock]$filtro, [int]$timeoutSeg = 10) {
  $limite = (Get-Date).AddSeconds($timeoutSeg)
  while ((Get-Date) -lt $limite) {
    try {
      $linha = $serial.ReadLine().Trim()
      if (-not $linha.StartsWith("{")) { continue }
      $json = $linha | ConvertFrom-Json
      if ($json.error) { Write-Host "Arduino: $($json.error)" -ForegroundColor Red }
      if (& $filtro $json) { return $json }
    } catch [System.TimeoutException] { }
      catch { }
  }
  return $null
}

# Media de N leituras de peso
function Read-PesoMedio($serial, [int]$amostras = 10) {
  $serial.DiscardInBuffer()
  $valores = @()
  while ($valores.Count -lt $amostras) {
    $leitura = Wait-Arduino $serial { param($j) $null -ne $j.peso } 5
    if ($null -eq $leitura) { throw "O Arduino parou de enviar peso. Confira o cabo e o HX711." }
    $valores += [double]$leitura.peso
    Write-Host ("`r  lendo... {0}/{1}  ({2} kg)   " -f $valores.Count, $amostras, (Format-Kg ([double]$leitura.peso))) -NoNewline
  }
  Write-Host ""
  return ($valores | Measure-Object -Average).Average
}

$config = Get-BalancaConfig -Reconfigurar:$Reconfigurar

if (-not $PortName) {
  $achado = Find-ArduinoPort
  if (-not $achado) { throw "Arduino nao encontrado. Conecte o cabo USB e tente de novo (ou use -PortName COM5)." }
  $PortName = $achado.Porta
  Write-Host "Arduino encontrado: $($achado.Nome)" -ForegroundColor Green
}

$serial = [System.IO.Ports.SerialPort]::new($PortName, 57600)
$serial.NewLine = "`n"
$serial.ReadTimeout = 1500

try {
  try { $serial.Open() } catch {
    throw "Nao consegui abrir $PortName. Feche o iniciar-balanca, o Serial Monitor do Arduino IDE ou outro programa usando a porta."
  }

  Write-Host ""
  Write-Host "=== CALIBRACAO DA BALANCA ===" -ForegroundColor Cyan
  Write-Host "Voce vai precisar de um objeto com peso CONHECIDO (ex: pacote de 1 kg de arroz/acucar,"
  Write-Host "garrafa de agua de 1,5 L ~ 1,5 kg, ou um peso de academia). Quanto mais pesado, mais precisa."

  # Abrir a porta reinicia o Arduino: espera ele avisar que esta pronto
  Write-Host "Aguardando o Arduino iniciar..."
  $pronto = Wait-Arduino $serial { param($j) $j.status -eq "ready" -or $null -ne $j.peso } 8
  if (-not $pronto) { throw "O Arduino nao respondeu. O sketch arduino_hx711_weight esta gravado nele?" }

  $calibrado = $false
  while (-not $calibrado) {
    Passo 1 "Tire TUDO de cima da balanca (deixe so a plataforma) e aperte ENTER"
    [void](Read-Host)
    $serial.WriteLine("t")
    if (-not (Wait-Arduino $serial { param($j) $j.status -eq "tare_ok" } 10)) { throw "O Arduino nao confirmou a tara." }
    Write-Host "  Balanca zerada." -ForegroundColor Green

    Passo 2 "Quanto pesa o seu objeto de referencia? (em kg, ex: 1 ou 0,5)"
    $massa = $null
    while (-not $massa -or $massa -le 0) {
      $massa = ConvertTo-Kg (Read-Host "  Peso conhecido (kg)")
      if (-not $massa -or $massa -le 0) { Write-Host "  Valor invalido, tente de novo." -ForegroundColor Red }
    }

    Passo 3 "Coloque o objeto no CENTRO da balanca, espere parar de balancar e aperte ENTER"
    [void](Read-Host)
    Start-Sleep -Seconds 2
    $serial.DiscardInBuffer()
    $serial.WriteLine("k" + (Format-Kg $massa))
    $resp = Wait-Arduino $serial { param($j) $j.status -eq "calibration_ok" -or $j.error } 15
    if (-not $resp -or $resp.error) {
      Write-Host "  Nao deu para calibrar. Confira se o objeto esta na balanca e repita." -ForegroundColor Red
      continue
    }
    Write-Host ("  Fator calculado e salvo no Arduino: {0}" -f $resp.factor) -ForegroundColor Green

    Passo 4 "Conferindo a leitura com o objeto na balanca..."
    $lido = Read-PesoMedio $serial 10
    $erro = [Math]::Abs($lido - $massa) / $massa * 100
    $cor = if ($erro -le 1) { "Green" } else { "Red" }
    Write-Host ("  Leu {0} kg | esperado {1} kg | erro {2:N2}%" -f (Format-Kg $lido), (Format-Kg $massa), $erro) -ForegroundColor $cor

    if ($erro -gt 1) {
      Write-Host "  Erro acima de 1%. Normalmente e objeto fora do centro ou balanca balancando." -ForegroundColor Red
      $de_novo = Read-Host "  Repetir a calibracao? (S/n)"
      if ($de_novo -notmatch "^[nN]") { continue }
    }

    Passo 5 "Tire o objeto da balanca e aperte ENTER (deve voltar perto de 0)"
    [void](Read-Host)
    Start-Sleep -Seconds 2
    $vazio = Read-PesoMedio $serial 6
    Write-Host ("  Balanca vazia: {0} kg" -f (Format-Kg $vazio)) -ForegroundColor $(if ([Math]::Abs($vazio) -le 0.03) { "Green" } else { "Yellow" })
    if ([Math]::Abs($vazio) -gt 0.03) {
      Write-Host "  Nao voltou a zero. Pode ser a celula de carga mal fixada; confira os parafusos." -ForegroundColor Yellow
    }
    $calibrado = $true
  }

  if (-not $NaoRegistrar) {
    Passo 6 "Registrando a calibracao no sistema..."
    $body = @{
      peso_referencia = [Math]::Round($massa, 3)
      peso_lido       = [Math]::Round($lido, 3)
      posto_id        = $config.PostoId
    } | ConvertTo-Json -Compress
    try {
      $r = Invoke-RestMethod -Uri "$($config.ApiBase)/api/hardware/calibracao" -Method Post `
        -Headers @{ "x-api-key" = $config.ApiKey } -ContentType "application/json" -Body $body
      if ($r.aprovada -eq 1 -or $r.aprovada -eq $true) {
        Write-Host "  Registrada! O Posto de Validacao vai mostrar 'Balanca calibrada'." -ForegroundColor Green
      } else {
        Write-Host ("  Registrada, mas REPROVADA (erro {0:N2}% > {1}%). Repita a calibracao." -f [double]$r.erro_percentual, $r.erro_maximo_percentual) -ForegroundColor Red
      }
    } catch {
      Write-Host "  Nao consegui registrar no sistema: $($_.Exception.Message)" -ForegroundColor Red
      Write-Host "  A calibracao ficou salva no Arduino mesmo assim. Confira a chave e o endereco (use -Reconfigurar)."
    }
  }

  Write-Host ""
  Write-Host "Pronto! A calibracao fica gravada no Arduino, mesmo desligando." -ForegroundColor Cyan
  Write-Host "Agora abra o scripts\iniciar-balanca.bat para mandar o peso para o sistema."
} finally {
  if ($serial.IsOpen) { $serial.Close() }
}
