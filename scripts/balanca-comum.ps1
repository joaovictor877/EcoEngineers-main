# Funcoes compartilhadas por calibrar-balanca.ps1 e iniciar-balanca.ps1.
# Carregado com: . "$PSScriptRoot\balanca-comum.ps1"

$ConfigPath = Join-Path $PSScriptRoot "balanca.config.json"

# Le a configuracao salva (endereco do site, chave e posto). Na primeira vez
# pergunta e grava em scripts/balanca.config.json (fora do git).
function Get-BalancaConfig {
  param([switch]$Reconfigurar)

  if (-not $Reconfigurar -and (Test-Path $ConfigPath)) {
    return Get-Content $ConfigPath -Raw | ConvertFrom-Json
  }

  Write-Host ""
  Write-Host "=== Configuracao da balanca (so na primeira vez) ===" -ForegroundColor Cyan
  $site = Read-Host "Endereco do site [https://ecoengineers.azurewebsites.net]"
  if ([string]::IsNullOrWhiteSpace($site)) { $site = "https://ecoengineers.azurewebsites.net" }
  $site = $site.TrimEnd("/")

  $chave = ""
  while ([string]::IsNullOrWhiteSpace($chave)) {
    $chave = Read-Host "Chave do hardware (HARDWARE_API_KEY configurada no servidor)"
  }

  $posto = Read-Host "Numero do posto de validacao [1]"
  if ([string]::IsNullOrWhiteSpace($posto)) { $posto = "1" }

  $config = [pscustomobject]@{
    ApiBase = $site
    ApiKey  = $chave.Trim()
    PostoId = [int]$posto
  }
  $config | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8
  Write-Host "Configuracao salva em $ConfigPath" -ForegroundColor Green
  return $config
}

# Acha a porta COM do Arduino pelo nome do dispositivo no Windows
# (Arduino original, clones com CH340/CH341, FTDI ou CP210x).
function Find-ArduinoPort {
  $dispositivos = Get-CimInstance Win32_PnPEntity -Filter "Name LIKE '%(COM%'" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch "Bluetooth" }

  $preferido = $dispositivos | Where-Object { $_.Name -match "Arduino|CH340|CH341|USB-SERIAL|USB Serial|FTDI|CP210" } | Select-Object -First 1
  if (-not $preferido) { $preferido = $dispositivos | Select-Object -First 1 }

  if ($preferido -and $preferido.Name -match "\((COM\d+)\)") {
    return [pscustomobject]@{ Porta = $Matches[1]; Nome = $preferido.Name }
  }
  return $null
}

# Converte "1,5" ou "1.5" em numero
function ConvertTo-Kg([string]$texto) {
  $valor = 0.0
  $normalizado = $texto.Trim().Replace(",", ".")
  if ([double]::TryParse($normalizado, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$valor)) {
    return $valor
  }
  return $null
}

function Format-Kg([double]$valor) {
  return $valor.ToString("0.000", [System.Globalization.CultureInfo]::InvariantCulture)
}
